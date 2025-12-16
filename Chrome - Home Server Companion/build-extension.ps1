# ===================================================
# Chrome Extension ZIP Builder
# ===================================================
# Erstellt eine ZIP-Datei für Chrome Web Store Upload
# Liest automatisch die Version aus manifest.json
# ===================================================

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Chrome Extension ZIP Builder" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Extension-Verzeichnis (aktuelles Verzeichnis)
$extensionPath = $PSScriptRoot

# Manifest.json laden und Version auslesen
$manifestPath = Join-Path $extensionPath "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Host "ERROR: manifest.json nicht gefunden!" -ForegroundColor Red
    Read-Host "Druecke Enter zum Beenden"
    exit 1
}

try {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $version = $manifest.version
    $name = $manifest.name -replace ' ', ''
    Write-Host "Extension: $($manifest.name)" -ForegroundColor Green
    Write-Host "Version: $version" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: Konnte manifest.json nicht lesen!" -ForegroundColor Red
    Read-Host "Druecke Enter zum Beenden"
    exit 1
}

# Output-Pfad (ein Verzeichnis hoeher)
$outputDir = Split-Path $extensionPath -Parent
$zipName = "$name-v$version.zip"
$zipPath = Join-Path $outputDir $zipName

Write-Host "Erstelle ZIP-Datei..." -ForegroundColor Yellow
Write-Host "Ziel: $zipPath" -ForegroundColor Gray
Write-Host ""

# Dateien und Ordner zum Einpacken
$itemsToInclude = @(
    "manifest.json",
    "popup.html",
    "options.html",
    "icons",
    "js",
    "css",
    "services"
)

# Optional: README.md mit einpacken (auskommentiert, da Chrome Web Store es nicht braucht)
# $itemsToInclude += "README.md"

# Pruefen ob alle Dateien existieren
$missingItems = @()
foreach ($item in $itemsToInclude) {
    $itemPath = Join-Path $extensionPath $item
    if (-not (Test-Path $itemPath)) {
        $missingItems += $item
    }
}

if ($missingItems.Count -gt 0) {
    Write-Host "WARNUNG: Folgende Dateien/Ordner fehlen:" -ForegroundColor Yellow
    foreach ($missing in $missingItems) {
        Write-Host "  - $missing" -ForegroundColor Yellow
    }
    Write-Host ""
    $continue = Read-Host "Trotzdem fortfahren? (j/n)"
    if ($continue -ne 'j') {
        exit 0
    }
}

# Alte ZIP loeschen falls vorhanden
if (Test-Path $zipPath) {
    Write-Host "Loesche alte ZIP-Datei..." -ForegroundColor Yellow
    Remove-Item $zipPath -Force
}

# ZIP erstellen
try {
    # Temporaeres Verzeichnis erstellen
    $tempDir = Join-Path $env:TEMP "ChromeExtensionBuild_$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    # Dateien in Temp kopieren
    foreach ($item in $itemsToInclude) {
        $sourcePath = Join-Path $extensionPath $item
        if (Test-Path $sourcePath) {
            $destPath = Join-Path $tempDir $item
            Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
        }
    }
    
    # ZIP erstellen
    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
    
    # Temp aufräumen
    Remove-Item $tempDir -Recurse -Force
    
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "ZIP erstellt: $zipName" -ForegroundColor Cyan
    Write-Host "Speicherort: $outputDir" -ForegroundColor Gray
    
    # Dateigroesse anzeigen
    $zipSize = (Get-Item $zipPath).Length
    $zipSizeMB = [math]::Round($zipSize / 1MB, 2)
    $zipSizeKB = [math]::Round($zipSize / 1KB, 2)
    
    if ($zipSizeMB -gt 1) {
        Write-Host "Groesse: $zipSizeMB MB" -ForegroundColor Gray
    } else {
        Write-Host "Groesse: $zipSizeKB KB" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Bereit fuer Chrome Web Store Upload!" -ForegroundColor Green
    Write-Host "https://chrome.google.com/webstore/devconsole" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "ERROR: ZIP-Erstellung fehlgeschlagen!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Druecke Enter zum Beenden"
    exit 1
}

Write-Host ""
Read-Host "Druecke Enter zum Beenden"
