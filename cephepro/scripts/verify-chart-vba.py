"""Exercise packaged VBA and real filter/recalculation events in pyOpenVBA's interpreter.
This is not a native Microsoft Excel UI test. Usage: python ... /path/to/qa-reports
"""
import io
import sys
from pathlib import Path
from zipfile import ZipFile
import olefile
from oletools.olevba import VBA_Parser
from pyopenvba.apps.excel import ExcelApplication

folder=Path(sys.argv[1])
for lang in ['tr','en','de','fr','ru','ar']:
    path=folder/f'report-{lang}.xlsm'
    with ZipFile(path) as z:
        binary=z.read('xl/vbaProject.bin')
    project=olefile.OleFileIO(io.BytesIO(binary)).openstream('PROJECT').read().decode('cp1252')
    assert project.count('Document=') == 12 and 'Class=Sheet' not in project
    parser=VBA_Parser(str(path));modules=list(parser.extract_macros());parser.close()
    assert len(modules)==13
    app=ExcelApplication.open(str(path))
    width=lambda: app.evaluate('ThisWorkbook.Worksheets(2).ChartObjects(1).Width')
    value=lambda row,col:app.evaluate(f'ThisWorkbook.Names("CP_ChartBuffer").RefersToRange.Cells({row},{col}).Value2')
    count=lambda:app.evaluate('ThisWorkbook.Names("CP_ChartLabels").RefersToRange.Rows.Count')
    assert width()==198 and count()==3 and value(1,2)==112,(lang,width(),count(),value(1,2))
    app.add_module('''Sub ChangeFacade()
 With ThisWorkbook.Worksheets(2)
  .Range("L2").Value = .Range("A8").Value & " / " & .Range("B8").Value
 End With
End Sub
Sub AddMatchingItem()
 ThisWorkbook.Worksheets(2).Range("B11").Value = ThisWorkbook.Worksheets(2).Range("B8").Value
End Sub
Sub MissingFacade()
 ThisWorkbook.Worksheets(2).Range("L2").Value = "no-such-facade"
End Sub
''',name='VerificationOnly')
    app.run('ChangeFacade');assert count()==3 and value(1,2)==100
    app.run('AddMatchingItem');assert count()==4 and width()==234 and value(4,2)==103
    app.run('MissingFacade');assert count()==1 and width()==126 and value(1,2)==0
    app.run('ChangeFacade');assert count()==4 and value(1,2)==100
    assert app.evaluate('ThisWorkbook.Worksheets(2).Range("I8").Formula')=='=IFERROR(H8/G8*100,0)'
    assert app.evaluate('ThisWorkbook.Worksheets(2).Range("G37").Value2')==129
    print(lang+': independent facade selection, 3/4/0 items; dynamic chart ranges and all 10 facades preserved')
