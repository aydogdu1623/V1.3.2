Option Explicit

Private updating As Boolean

' Only this workbook's chart dimensions are edited. The native series stay formula-linked.
' No network, files, timers or application-wide settings are changed.
Public Sub CPResizeChart()
    Dim source As Range, report As Worksheet, co As ChartObject
    Dim count As Long
    If updating Then Exit Sub
    updating = True
    On Error GoTo Finished
    Set source = ThisWorkbook.Names("CP_ReportData").RefersToRange
    Set report = source.Worksheet
    If report.ChartObjects.Count = 0 Then GoTo Finished
    count = Application.WorksheetFunction.Subtotal(103, source.Columns(1))
    Set co = report.ChartObjects(1)
    co.Width = CPChartWidth(count)
    co.Height = 480
Finished:
    updating = False
End Sub

' Points, matching the download's 160 px margin + 144 px per visible item.
Public Function CPChartWidth(ByVal count As Long) As Double
    If count < 1 Then count = 1
    CPChartWidth = (160 + 144 * count) * 0.75
End Function
