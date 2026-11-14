# Temporary icon generator (replace later with a designed image).
# Draws a purple rounded square with a white speech bubble and "Aa".
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'

function Draw-Icon([int]$size, [string]$file, [bool]$maskable, [bool]$opaque) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)
  $c1 = [System.Drawing.Color]::FromArgb(255, 111, 102, 240)
  $c2 = [System.Drawing.Color]::FromArgb(255, 72, 64, 190)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45
  if ($maskable -or $opaque) {
    $g.FillRectangle($brush, $rect)
  } else {
    $r = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
  }
  # safe zone: maskable keeps content in the inner 60%
  $scale = if ($maskable) { 0.6 } else { 0.78 }
  $w = $size * $scale
  $x0 = ($size - $w) / 2
  $bh = $w * 0.72
  $y0 = ($size - $bh) / 2 - $w * 0.05
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $br = [int]($w * 0.18)
  $bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bubble.AddArc($x0, $y0, $br * 2, $br * 2, 180, 90)
  $bubble.AddArc($x0 + $w - $br * 2, $y0, $br * 2, $br * 2, 270, 90)
  $bubble.AddArc($x0 + $w - $br * 2, $y0 + $bh - $br * 2, $br * 2, $br * 2, 0, 90)
  $bubble.AddArc($x0, $y0 + $bh - $br * 2, $br * 2, $br * 2, 90, 90)
  $bubble.CloseFigure()
  $g.FillPath($white, $bubble)
  $tail = @(
    (New-Object System.Drawing.PointF ($x0 + $w * 0.22), ($y0 + $bh - 2)),
    (New-Object System.Drawing.PointF ($x0 + $w * 0.42), ($y0 + $bh - 2)),
    (New-Object System.Drawing.PointF ($x0 + $w * 0.16), ($y0 + $bh + $w * 0.2))
  )
  $g.FillPolygon($white, $tail)
  $font = New-Object System.Drawing.Font 'Segoe UI', ([float]($w * 0.36)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
  $ink = New-Object System.Drawing.SolidBrush $c2
  $tr = New-Object System.Drawing.RectangleF $x0, $y0, $w, $bh
  $g.DrawString('Aa', $font, $ink, $tr, $sf)
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 192 'icon-192.png' $false $false
Draw-Icon 512 'icon-512.png' $false $false
Draw-Icon 512 'maskable-512.png' $true $true
Draw-Icon 180 'apple-touch-icon.png' $false $true
'icons done'
