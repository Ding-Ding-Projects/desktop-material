[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repositoryRoot 'docs\assets\screenshots\material-workspace-changes.png'
$rootOutput = Join-Path $repositoryRoot 'social-preview.png'
$servedOutput = Join-Path $repositoryRoot 'docs\assets\social-preview.png'

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "The real built-application source capture is missing: $sourcePath"
}

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($sourcePath)
$canvas = New-Object System.Drawing.Bitmap 1280, 640
$graphics = [System.Drawing.Graphics]::FromImage($canvas)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 18, 22, 28))

  $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 93, 210, 178))
  $primary = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 244, 247, 250))
  $secondary = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 184, 194, 204))
  $frame = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 74, 86, 98)), 2
  $titleFont = New-Object System.Drawing.Font 'Segoe UI', 42, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $bodyFont = New-Object System.Drawing.Font 'Segoe UI', 23, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $labelFont = New-Object System.Drawing.Font 'Segoe UI', 17, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)

  try {
    $graphics.FillRectangle($accent, 60, 145, 96, 8)
    $graphics.DrawString('Desktop', $titleFont, $primary, 60, 178)
    $graphics.DrawString('Material', $titleFont, $primary, 60, 224)
    $graphics.DrawString('A complete Git desktop for Windows', $bodyFont, $secondary, 60, 310)
    $graphics.DrawString('Real application surface', $labelFont, $accent, 60, 390)

    $destination = New-Object System.Drawing.Rectangle 460, 72, 760, 507
    $graphics.DrawImage($source, $destination)
    $graphics.DrawRectangle($frame, $destination)
  }
  finally {
    $accent.Dispose()
    $primary.Dispose()
    $secondary.Dispose()
    $frame.Dispose()
    $titleFont.Dispose()
    $bodyFont.Dispose()
    $labelFont.Dispose()
  }

  $canvas.Save($rootOutput, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $graphics.Dispose()
  $canvas.Dispose()
  $source.Dispose()
}

Copy-Item -LiteralPath $rootOutput -Destination $servedOutput -Force
$rootHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $rootOutput).Hash
$servedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $servedOutput).Hash
if ($rootHash -ne $servedHash) {
  throw 'The root and served social previews are not byte-identical.'
}

Write-Output "Generated social-preview.png and docs/assets/social-preview.png ($rootHash)."
