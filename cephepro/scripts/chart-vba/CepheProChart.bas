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
    If n < 1 Then n = 1
    co.Width = CPChartWidth(n)
    co.Height = 360
    With co.Chart.ChartGroups(1)
        .GapWidth = 100
        .Overlap = -100
    End With
    With co.Chart.PlotArea
        .InsideLeft = 45
        .InsideTop = 30
        .InsideWidth = 49.5 * n
        .InsideHeight = 210
    End With
    ThisWorkbook.Names("CP_ChartSizingStatus").RefersToRange.Value2 = ThisWorkbook.Names("CP_ChartSizingReady").RefersToRange.Value2
Finished:
    updating = False
End Sub
Public Function CPChartWidth(ByVal count As Long) As Double
    If count < 1 Then count = 1
    CPChartWidth = (120 + 66 * count) * 0.75
End Function
