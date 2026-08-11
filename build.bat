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

"%DESKTOP_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\build-windows.ps1" -Mode Build %DESKTOP_BUILD_SILENT%
exit /b %ERRORLEVEL%

:usage
echo Usage: build.bat [/s ^| --silent]
exit /b 2
