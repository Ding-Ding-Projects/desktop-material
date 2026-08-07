[CmdletBinding()]
param(
  [string]$Version = '2.53.0.3',
  [string]$ReleaseTag = 'v2.53.0.windows.3',
  [string]$ExpectedSha256 = 'b365da794b1d2225eb24d5f5e09ef7792cfd5fa26c3a3586210280c80dff3a2a',
  [string]$InstallRoot = '',
  [switch]$ForceBootstrap
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Add-GitBashToPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GitExe,
    [Parameter(Mandatory = $true)]
    [string]$BashExe
  )

  $gitDirectory = Split-Path -Parent $GitExe
  $bashDirectory = Split-Path -Parent $BashExe
  $env:Path = "$gitDirectory;$bashDirectory;$env:Path"

  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_PATH)) {
    $gitDirectory | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
    $bashDirectory | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
  }

  & $GitExe --version
  if ($LASTEXITCODE -ne 0) {
    throw "Git failed its version check: $GitExe"
  }
  & $BashExe --version | Select-Object -First 1
  if ($LASTEXITCODE -ne 0) {
    throw "Git Bash failed its version check: $BashExe"
  }
}

$cacheRoot = if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TOOL_CACHE)) {
  $env:RUNNER_TOOL_CACHE
} elseif (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  Join-Path $env:RUNNER_TEMP 'desktop-material-tool-cache'
} else {
  Join-Path ([System.IO.Path]::GetTempPath()) 'desktop-material-tool-cache'
}
$temporaryRoot = if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  $env:RUNNER_TEMP
} else {
  [System.IO.Path]::GetTempPath()
}
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $temporaryRoot "desktop-material-portable-git\$Version\x64"
}

$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$installDriveRoot = [System.IO.Path]::GetPathRoot($resolvedInstallRoot)
if ($resolvedInstallRoot -eq $installDriveRoot) {
  throw "Refusing to install PortableGit at a filesystem root: $resolvedInstallRoot"
}

$asset = "PortableGit-$Version-64-bit.7z.exe"
$downloadUrl = "https://github.com/git-for-windows/git/releases/download/$ReleaseTag/$asset"
$archiveRoot = Join-Path $cacheRoot "desktop-material\portable-git\$Version\x64"
$archivePath = Join-Path $archiveRoot $asset
$downloadPath = Join-Path $temporaryRoot "PortableGit-$Version-$PID.download.7z.exe"

$archiveIsValid = $false
if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
  $cachedSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $archiveIsValid = $cachedSha256 -eq $ExpectedSha256.ToLowerInvariant()
}
if (-not $archiveIsValid) {
  if ($env:DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE -eq '1') {
    throw "The cached PortableGit archive is missing or invalid while offline: $archivePath"
  }
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -UseBasicParsing
    $actualSha256 = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
      throw "Git for Windows archive checksum mismatch: expected $ExpectedSha256, received $actualSha256"
    }
    New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
    Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
  } finally {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  }
}

# The persistent archive is hashed on every invocation. Extract into the job's
# scoped location every time so a modified extraction never crosses job runs.
if (Test-Path -LiteralPath $resolvedInstallRoot) {
  Remove-Item -LiteralPath $resolvedInstallRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $resolvedInstallRoot -Force | Out-Null
& $archivePath -y "-o$resolvedInstallRoot" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "PortableGit extraction exited with code $LASTEXITCODE"
}

$gitExe = Join-Path $resolvedInstallRoot 'cmd\git.exe'
$bashExe = Join-Path $resolvedInstallRoot 'bin\bash.exe'

if (-not (Test-Path -LiteralPath $gitExe -PathType Leaf) -or
    -not (Test-Path -LiteralPath $bashExe -PathType Leaf)) {
  throw "The Git for Windows bootstrap did not produce Git and Bash below $InstallRoot"
}

Add-GitBashToPath -GitExe $gitExe -BashExe $bashExe
