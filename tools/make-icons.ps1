param(
  [string]$Src = (Join-Path $PSScriptRoot 'icon-source.webp'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\icons'),
  # Gemini sparkle watermark to paint over: x, y, w, h as ratios of the source size (empty = none)
  [double[]]$Patch = @(0.845, 0.845, 0.08, 0.08)
)
# Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# Source art is full-bleed (no drawn corners). Writes:
#   maskable-512 / apple-touch-icon = full square, icon-192/512 = rounded square with transparent corners
Add-Type -AssemblyName PresentationCore, WindowsBase, System.Drawing

# 1) Decode (WebP/JPEG/PNG) via WIC -> PNG in temp
$stream = [IO.File]::OpenRead($Src)
$frame = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stream, 'PreservePixelFormat', 'OnLoad').Frames[0]
$stream.Close()
$conv = [System.Windows.Media.Imaging.FormatConvertedBitmap]::new($frame, [System.Windows.Media.PixelFormats]::Bgra32, $null, 0)
$enc = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
$enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($conv))
$tmpPng = Join-Path $env:TEMP 'ls-icon-master.png'
$fs = [IO.File]::Create($tmpPng); $enc.Save($fs); $fs.Close()

$loaded = [System.Drawing.Bitmap]::FromFile($tmpPng)
$master = [System.Drawing.Bitmap]::new($loaded); $loaded.Dispose()
$side = [Math]::Min($master.Width, $master.Height)

# 2) Paint over the watermark: bilinear blend of the box edges (background is a smooth gradient)
if ($Patch.Count -eq 4) {
  $x0 = [int]($Patch[0] * $side); $y0 = [int]($Patch[1] * $side)
  $w = [int]($Patch[2] * $side); $h = [int]($Patch[3] * $side)
  $x1 = $x0 + $w; $y1 = $y0 + $h
  for ($y = $y0; $y -lt $y1; $y++) {
    for ($x = $x0; $x -lt $x1; $x++) {
      $tx = ($x - $x0 + 1) / ($w + 1); $ty = ($y - $y0 + 1) / ($h + 1)
      $l = $master.GetPixel($x0 - 1, $y); $r = $master.GetPixel($x1, $y)
      $t = $master.GetPixel($x, $y0 - 1); $b = $master.GetPixel($x, $y1)
      $ch = { param($a, $bb, $c, $d) [int](((1 - $tx) * $a + $tx * $bb + (1 - $ty) * $c + $ty * $d) / 2) }
      $master.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255,
        (& $ch $l.R $r.R $t.R $b.R), (& $ch $l.G $r.G $t.G $b.G), (& $ch $l.B $r.B $t.B $b.B)))
    }
  }
}

function Save-Icon([int]$size, [string]$file, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($rounded) {
    $r = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.SetClip($path)
  }
  $g.DrawImage($master, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $bmp.Save((Join-Path $OutDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Save-Icon 192 'icon-192.png' $true
Save-Icon 512 'icon-512.png' $true
Save-Icon 512 'maskable-512.png' $false
Save-Icon 180 'apple-touch-icon.png' $false
$master.Save((Join-Path $env:TEMP 'ls-icon-patched.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()
'icons done'
