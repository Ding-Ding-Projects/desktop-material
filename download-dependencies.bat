@echo off
setlocal EnableExtensions

set "DESKTOP_BUILD_SILENT="
if "%SILENT%"=="1" set "DESKTOP_BUILD_SILENT=-Silent"

if not "%~1"=="" (
  if /I "%~1"=="/s" set "DESKTOP_BUILD_SILENT=-Silent"
  if /I "%~1"=="--silent" set "DESKTOP_BUILD_SILENT=-Silent"
  if /I not "%~1"=="/s" if /I not "%~1"=="--silent" goto :usage
)
if not "%~2"=="" goto :usage

set "DESKTOP_POWERSHELL=pwsh.exe"
where pwsh.exe >nul 2>nul
if errorlevel 1 set "DESKTOP_POWERSHELL=powershell.exe"

echo ==^> Preparing pinned Windows dependencies (Node.js, Yarn, Visual Studio C++ workload, and frozen project packages)
"%DESKTOP_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\build-windows.ps1" -Mode Prepare %DESKTOP_BUILD_SILENT%
if errorlevel 1 exit /b %ERRORLEVEL%
echo Dependency preparation complete. No application build or installer packaging was run.
exit /b 0

:usage
echo Usage: download-dependencies.bat [/s ^| --silent]
exit /b 2
