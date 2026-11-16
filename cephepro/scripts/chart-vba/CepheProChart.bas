Option Explicit
Private updating As Boolean
Public Sub CPResizeChart()
    Dim source As Range, buffer As Range, co As ChartObject, chosen As String
    Dim r As Long, n As Long, i As Long
    Dim labels() As Variant, totals() As Variant, done() As Variant, progress() As Variant
    If updating Then Exit Sub
    updating = True
    On Error GoTo Finished
    Set source = ThisWorkbook.Names("CP_ReportData").RefersToRange
    Set co = source.Worksheet.ChartObjects(1)
    chosen = CStr(ThisWorkbook.Names("CP_ChartSelected").RefersToRange.Value2)
    For r = 1 To source.Rows.Count
        If CStr(source.Cells(r, 1).Value2) & " / " & CStr(source.Cells(r, 2).Value2) = chosen Then n = n + 1
    Next r
    If n < 1 Then n = 1
    ReDim labels(1 To n)
    ReDim totals(1 To n)
    ReDim done(1 To n)
    ReDim progress(1 To n)
    For r = 1 To source.Rows.Count
        If CStr(source.Cells(r, 1).Value2) & " / " & CStr(source.Cells(r, 2).Value2) = chosen Then
            i = i + 1
            labels(i) = CStr(source.Cells(r, 3).Value2)
            totals(i) = source.Cells(r, 7).Value2
            done(i) = source.Cells(r, 8).Value2
            progress(i) = source.Cells(r, 9).Value2
        End If
    Next r
    If i = 0 Then
        labels(1) = "-"
        totals(1) = 0
        done(1) = 0
        progress(1) = 0
    End If
    Set buffer = ThisWorkbook.Names("CP_ChartBuffer").RefersToRange
    buffer.ClearContents
    For r = 1 To n
        buffer.Cells(r, 1).Value2 = labels(r)
        buffer.Cells(r, 2).Value2 = totals(r)
        buffer.Cells(r, 3).Value2 = done(r)
        buffer.Cells(r, 4).Value2 = progress(r)
    Next r
    ThisWorkbook.Names("CP_ChartCount").RefersToRange.Value2 = n
    co.Width = CPChartWidth(n)
    co.Height = 330
Finished:
    updating = False
End Sub
Public Function CPChartWidth(ByVal count As Long) As Double
    If count < 1 Then count = 1
    CPChartWidth = Application.WorksheetFunction.Min(720, 120 + 48 * count) * 0.75
End Function
