Option Explicit

Private Sub Workbook_Open()
    CPResizeChart
End Sub

Private Sub Workbook_SheetCalculate(ByVal Sh As Object)
    If Sh.CodeName = "Sheet2" Or Sh.CodeName = "Sheet11" Or Sh.CodeName = "Sheet12" Then CPResizeChart
End Sub

Private Sub Workbook_SheetActivate(ByVal Sh As Object)
    If Sh.CodeName = "Sheet2" Then CPResizeChart
End Sub

Private Sub Workbook_SheetChange(ByVal Sh As Object, ByVal Target As Range)
    If Sh.CodeName = "Sheet2" Or Sh.CodeName = "Sheet12" Then CPResizeChart
End Sub
