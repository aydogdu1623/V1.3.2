Option Explicit
Private updating As Boolean
Public Sub CPResizeChart()
    Dim source As Range, co As ChartObject, n As Long
    If updating Then Exit Sub
    updating = True
    On Error GoTo Finished
    Set source = ThisWorkbook.Names("CP_ReportData").RefersToRange
    Set co = source.Worksheet.ChartObjects(1)
    n = CLng(ThisWorkbook.Names("CP_ChartCount").RefersToRange.Value2)
    co.Width = CPChartWidth(n)
    co.Height = 330
Finished:
    updating = False
End Sub
Public Function CPChartWidth(ByVal count As Long) As Double
    If count < 1 Then count = 1
    CPChartWidth = Application.WorksheetFunction.Min(720, 120 + 48 * count) * 0.75
End Function
