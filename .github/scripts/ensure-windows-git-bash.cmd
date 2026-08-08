@echo off
setlocal
if "%GITHUB_WORKSPACE%"=="" (
  echo GITHUB_WORKSPACE is required to bootstrap Git Bash. 1>&2
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& { & '%GITHUB_WORKSPACE%\.github\scripts\ensure-windows-git-bash.ps1' }"
exit /b %ERRORLEVEL%
