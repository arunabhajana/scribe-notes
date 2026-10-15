# Rebuild installer bitmaps from Scribe's existing logo; no extra dependencies.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$artworkDirectory = Join-Path $projectRoot 'src-tauri/installer/assets'
New-Item -ItemType Directory -Path $artworkDirectory -Force | Out-Null
$logo = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'public/scribe-logo-sidebar.png'))
function New-Artwork([int]$width, [int]$height, [string]$filename, [bool]$sidebar) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(0, 0, $width, $height),
        [System.Drawing.ColorTranslator]::FromHtml('#302849'),
        [System.Drawing.ColorTranslator]::FromHtml('#191a20'), 65.0)
    $graphics.FillRectangle($background, 0, 0, $width, $height)
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f3efff'))
    $muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#c1b7d8'))
    $accent = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(45, 174, 143, 244), 1.5)
    if ($sidebar) {
        $graphics.DrawEllipse($accent, 29, 175, 220, 220)
        $graphics.DrawEllipse($accent, 48, 194, 182, 182)
        $graphics.DrawEllipse($accent, 67, 213, 144, 144)
        $graphics.DrawImage($logo, 19, 27, 51, 51)
        $title = [System.Drawing.Font]::new('Segoe UI', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $copy = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $small = [System.Drawing.Font]::new('Segoe UI', 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString('Scribe', $title, $white, 20, 86)
        $graphics.DrawString("A little space.`nFor big thoughts.", $copy, $muted, 21, 123)
        $graphics.DrawString("Your notes.`nYour own space.", $small, $muted, 21, 266)
        $title.Dispose(); $copy.Dispose(); $small.Dispose()
    } else {
        $graphics.DrawImage($logo, 12, 10, 36, 36)
        $font = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString('Scribe', $font, $white, 54, 16)
        $font.Dispose()
    }
    $bitmap.Save((Join-Path $artworkDirectory $filename), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $accent.Dispose(); $white.Dispose(); $muted.Dispose(); $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
try {
    New-Artwork 164 314 'sidebar.bmp' $true
    New-Artwork 150 57 'header.bmp' $false
} finally { $logo.Dispose() }
