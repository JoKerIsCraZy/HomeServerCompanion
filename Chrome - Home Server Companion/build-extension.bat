@echo off
REM ===================================================
REM Chrome Extension ZIP Builder (Batch Version)
REM ===================================================
REM Erstellt eine ZIP-Datei fuer Chrome Web Store Upload
REM ===================================================

setlocal enabledelayedexpansion

echo ==================================
echo Chrome Extension ZIP Builder
echo ==================================
echo.

REM Extension-Verzeichnis
set "EXTENSION_DIR=%~dp0"
set "EXTENSION_DIR=%EXTENSION_DIR:~0,-1%"

REM Pruefe ob PowerShell verfuegbar ist
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell nicht gefunden!
    echo Bitte installiere PowerShell oder nutze build-extension.ps1
    pause
    exit /b 1
)

echo Starte PowerShell-Skript...
echo.

REM PowerShell-Skript ausfuehren
powershell.exe -ExecutionPolicy Bypass -File "%~dp0build-extension.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: PowerShell-Skript fehlgeschlagen!
    pause
    exit /b 1
)

exit /b 0
