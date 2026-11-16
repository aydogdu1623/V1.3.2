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
    assert width()==264, (lang,width())
    app.add_module('''Sub OneFacade()
 With ThisWorkbook.Worksheets(2)
  .Range("A7:K37").AutoFilter Field:=2, Criteria1:=.Range("B8").Value
 End With
End Sub
Sub AllFacades()
 ThisWorkbook.Worksheets(2).ShowAllData
End Sub
Sub OneItem()
 With ThisWorkbook.Worksheets(2)
  .Range("A7:K37").AutoFilter Field:=7, Criteria1:=.Range("G8").Value
 End With
End Sub
Sub EmptyResult()
 ThisWorkbook.Worksheets(2).Range("A7:K37").AutoFilter Field:=2, Criteria1:="no-such-facade"
End Sub
''', name='VerificationOnly')
    app.run('OneFacade');assert width()==264,(lang,width())
    if lang=='en': app.save(str(folder/'filtered-preview.xlsm'))
    app.run('AllFacades');assert width()==720
    app.run('OneItem');assert width()==168
    app.run('AllFacades');assert width()==720
    app.run('EmptyResult');assert width()==168
    app.run('AllFacades');assert width()==720
    assert app.evaluate('ThisWorkbook.Worksheets(2).Range("G8").Value2')==100
    assert app.evaluate('ThisWorkbook.Worksheets(2).Range("I8").Formula')=='=IFERROR(H8/G8*100,0)'
    print(lang+': 3 initially -> 3 -> 30 -> 1 -> 30 -> 0 -> 30 categories; values/formulas preserved')
