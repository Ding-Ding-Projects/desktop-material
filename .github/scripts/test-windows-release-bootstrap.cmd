@echo off
setlocal
if "%GITHUB_WORKSPACE%"=="" (
  echo GITHUB_WORKSPACE is required to run the Windows release bootstrap test. 1>&2
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%GITHUB_WORKSPACE%\.github\scripts\test-windows-release-bootstrap.ps1"
exit /b %ERRORLEVEL%
