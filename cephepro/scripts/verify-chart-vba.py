"""Verify real exported formulas, selections and AutoFilter in pyOpenVBA.
This is an interpreter check, not a native Microsoft Excel UI test.
The interpreter lacks PlotArea and ChartGroups: validate those settings in export XML,
and do not treat these width checks as native bar-geometry verification.
Usage: PYTHONPATH=/path/to/pyopenvba python scripts/verify-chart-vba.py /path/to/reports
"""
import sys
from pathlib import Path
from zipfile import ZipFile
from pyopenvba.apps.excel import ExcelApplication

folder=Path(sys.argv[1])
for lang in ['tr','en','de','fr','ru','ar']:
    path=folder/f'report-{lang}.xlsm'
    app=ExcelApplication.open(str(path))
    read=lambda cell: app.evaluate(f'ThisWorkbook.Worksheets(11).Range("{cell}").Value2')
    width=lambda: app.evaluate('ThisWorkbook.Worksheets(2).ChartObjects(1).Width')
    app.add_module('''Sub ChooseIsland()
 ThisWorkbook.Worksheets(2).Range("L2").Value = "C ISLAND"
End Sub
Sub ChooseFacade()
 ThisWorkbook.Worksheets(2).Range("P2").Value = "C ISLAND / Facade 5"
End Sub
Sub FilterOtherFacade()
 ThisWorkbook.Worksheets(2).Range("A7:K37").AutoFilter Field:=2, Criteria1:="Facade 6"
End Sub
Sub OneWorkItem()
 ThisWorkbook.Worksheets(2).Range("A7:K37").AutoFilter Field:=7, Criteria1:=ThisWorkbook.Worksheets(2).Range("G20").Value2
End Sub
Sub AllFacades()
 ThisWorkbook.Worksheets(2).Range("P2").Value = ThisWorkbook.Names("CP_AllFacades").RefersToRange.Value2
End Sub
Sub AllIslands()
 ThisWorkbook.Worksheets(2).Range("L2").Value = ThisWorkbook.Names("CP_AllBlocks").RefersToRange.Value2
End Sub
Sub ClearFilters()
 ThisWorkbook.Worksheets(2).ShowAllData
End Sub
Sub ChangeQuantity()
 ThisWorkbook.Worksheets(2).Range("G8").Value = 400
End Sub
Sub MultiMode()
 ThisWorkbook.Worksheets(2).Range("P2").Value = ThisWorkbook.Names("CP_MultiMode").RefersToRange.Value2
End Sub
Sub SelectTwoFacades()
 Dim i As Long
 For i = 1 To ThisWorkbook.Names("CP_MultiFlags").RefersToRange.Rows.Count
  If ThisWorkbook.Names("CP_MultiBlocks").RefersToRange.Cells(i, 1).Value2 = "C ISLAND" Then
   If ThisWorkbook.Names("CP_MultiFacades").RefersToRange.Cells(i, 1).Value2 = "Facade 5" Or ThisWorkbook.Names("CP_MultiFacades").RefersToRange.Cells(i, 1).Value2 = "Facade 6" Then
    ThisWorkbook.Names("CP_MultiFlags").RefersToRange.Cells(i, 1).Value = ThisWorkbook.Names("CP_Include").RefersToRange.Value2
   End If
  End If
 Next i
End Sub
Sub AddThirdFacade()
 Dim i As Long
 For i = 1 To ThisWorkbook.Names("CP_MultiFlags").RefersToRange.Rows.Count
  If ThisWorkbook.Names("CP_MultiBlocks").RefersToRange.Cells(i, 1).Value2 = "C ISLAND" And ThisWorkbook.Names("CP_MultiFacades").RefersToRange.Cells(i, 1).Value2 = "Facade 7" Then
   ThisWorkbook.Names("CP_MultiFlags").RefersToRange.Cells(i, 1).Value = ThisWorkbook.Names("CP_Include").RefersToRange.Value2
  End If
 Next i
End Sub
''',name='VerificationOnly')
    assert read('V1')==30 and read('S2')==100,(lang,'initial',read('V1'),read('S2'))
    assert width()==1575,(lang,'full chart width',width())
    app.run('ChooseIsland');assert read('V1')==10 and read('S2')==110,(lang,'island')
    assert width()==585,(lang,'island width',width())
    app.run('ChooseFacade');assert read('V1')==3 and read('S2')==112,(lang,'facade')
    assert width()==238.5,(lang,'one facade width',width())
    app.run('OneWorkItem');assert read('V1')==1 and width()==139.5,(lang,'single work item',read('V1'),width())
    app.run('ClearFilters');assert read('V1')==3,(lang,'restore facade after single item')
    app.run('FilterOtherFacade');assert read('V1')==0 and read('R2')=='' and read('S2')==0,(lang,'empty intersection',read('V1'))
    app.run('AllFacades');assert read('V1')==3 and read('S2')==115,(lang,'visible facade')
    app.run('AllIslands');assert read('V1')==3,(lang,'visible across islands')
    app.run('ClearFilters');assert read('V1')==30 and read('S2')==100,(lang,'restore all')
    app.run('ChangeQuantity');assert read('S2')==400 and read('U2')==6.25,(lang,'live quantity')
    app.run('MultiMode');assert read('V1')==0,(lang,'nothing selected')
    app.run('SelectTwoFacades');assert read('V1')==6 and read('S2')==112,(lang,'two facades',read('V1'))
    assert width()==387,(lang,'two facade width',width())
    app.run('AddThirdFacade');assert read('V1')==8,(lang,'third facade')
    assert width()==486,(lang,'three facade width',width())
    assert app.evaluate('ThisWorkbook.Worksheets(11).Range("S2").Formula').startswith('=IF('),'VBA must not replace chart formulas'
    assert app.evaluate('ThisWorkbook.Worksheets(2).Range("G37").Value2')==129
    with ZipFile(path) as z:
        import xml.etree.ElementTree as ET
        root=ET.fromstring(z.read('xl/workbook.xml'))
        ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        for name in ['CP_ChartLabels','CP_ChartTotals','CP_ChartDone','CP_ChartProgress']:
            node=root.find(f'.//s:definedName[@name="{name}"]',ns)
            assert node is not None and node.get('localSheetId')=='10'
    print(lang+': single/two/three/all facade selections, growing widths, AutoFilter and quantity recalculation passed')
