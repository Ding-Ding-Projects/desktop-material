[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "desktop-material-release-bootstrap-$PID"
$runnerTemp = Join-Path $fixtureRoot 'runner-temp'
$toolCache = Join-Path $fixtureRoot 'tool-cache'
$installRoot = Join-Path $runnerTemp 'portable-git'
$gitBootstrap = Join-Path $PSScriptRoot 'ensure-windows-git-bash.ps1'
$githubCliBootstrap = Join-Path $PSScriptRoot 'ensure-github-cli.sh'
$jqBootstrap = Join-Path $PSScriptRoot 'ensure-jq.sh'
$networkDenyRoot = Join-Path $fixtureRoot 'network-denial-bin'
$bashNetworkDenyProfile = Join-Path $networkDenyRoot 'deny-network.sh'
$networkDenyMessage = 'Bootstrap fixture blocked Invoke-WebRequest network access.'
$networkDenialInstalled = $false
$savedEnvironment = @{}
$environmentNames = @(
  'Path',
  'RUNNER_OS',
  'RUNNER_ARCH',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
  'GITHUB_PATH',
  'GH_CLI_VERSION',
  'JQ_VERSION',
  'BASH_ENV',
  'DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE'
)
foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
}

function Convert-ToMsysPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BashExe,
    [Parameter(Mandatory = $true)]
    [string]$WindowsPath
  )

  $converted = & $BashExe --noprofile --norc -c 'cygpath -u "$1"' -- $WindowsPath
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($converted)) {
    throw "Git Bash could not convert a fixture path: $WindowsPath"
  }
  return ([string]$converted).Trim()
}

function Invoke-BashBootstrap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BashExe,
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $msysPath = Convert-ToMsysPath -BashExe $BashExe -WindowsPath $ScriptPath
  & $BashExe --noprofile --norc $msysPath
  if ($LASTEXITCODE -ne 0) {
    throw "$Label bootstrap exited with code $LASTEXITCODE"
  }
}

function Assert-CachedArchive {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label cache archive is missing: $Path"
  }
  $actualSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "$Label cache archive checksum mismatch: expected $ExpectedSha256, received $actualSha256"
  }
}

try {
  New-Item -ItemType Directory -Path $runnerTemp, $toolCache -Force | Out-Null
  $env:RUNNER_OS = 'Windows'
  $env:RUNNER_ARCH = 'X64'
  $env:RUNNER_TEMP = $runnerTemp
  $env:RUNNER_TOOL_CACHE = $toolCache
  $env:GITHUB_PATH = Join-Path $fixtureRoot 'github-path.txt'
  $env:GH_CLI_VERSION = '2.97.0'
  $env:JQ_VERSION = '1.7.1'
  Remove-Item Env:DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE -ErrorAction SilentlyContinue

  & $gitBootstrap -ForceBootstrap -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Fresh Git Bash bootstrap exited with code $LASTEXITCODE"
  }

  $gitExe = Join-Path $installRoot 'cmd\git.exe'
  $bashExe = Join-Path $installRoot 'bin\bash.exe'
  foreach ($required in @($gitExe, $bashExe)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Fresh release bootstrap did not create $required"
    }
  }

  & $gitExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Freshly bootstrapped Git failed its version probe.'
  }
  & $bashExe --noprofile --norc -lc 'command -v curl && command -v sha256sum && command -v unzip'
  if ($LASTEXITCODE -ne 0) {
    throw 'Freshly bootstrapped Git Bash is missing a required release tool.'
  }

  # Exclude any host-installed gh or jq. Only the verified PortableGit tools and
  # Windows system commands remain visible to the shared bootstrap scripts.
  $env:Path = @(
    (Join-Path $installRoot 'cmd')
    (Join-Path $installRoot 'bin')
    (Join-Path $installRoot 'usr\bin')
    (Join-Path $installRoot 'mingw64\bin')
    (Join-Path $env:SystemRoot 'System32')
  ) -join ';'

  Invoke-BashBootstrap -BashExe $bashExe -ScriptPath $githubCliBootstrap -Label 'GitHub CLI cold-cache'
  Invoke-BashBootstrap -BashExe $bashExe -ScriptPath $jqBootstrap -Label 'jq cold-cache'

  $ghExe = Join-Path $runnerTemp 'desktop-material-github-cli\2.97.0\Windows-X64\bin\gh.exe'
  $jqExe = Join-Path $runnerTemp 'desktop-material-jq\1.7.1\Windows-X64\jq.exe'
  foreach ($required in @($ghExe, $jqExe)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Cold release bootstrap did not create $required"
    }
  }
  & $ghExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Cold-cache GitHub CLI failed its version probe.'
  }
  & $jqExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Cold-cache jq failed its version probe.'
  }

  $portableGitArchive = Join-Path $toolCache 'desktop-material\portable-git\2.53.0.3\x64\PortableGit-2.53.0.3-64-bit.7z.exe'
  $githubCliArchive = Join-Path $toolCache 'desktop-material\github-cli\2.97.0\Windows-X64\gh_2.97.0_windows_amd64.zip'
  $jqArchive = Join-Path $toolCache 'desktop-material\jq\1.7.1\Windows-X64\jq-windows-amd64.exe'
  $archiveExpectations = @(
    [pscustomobject]@{
      Label = 'PortableGit'
      Path = $portableGitArchive
      Sha256 = 'b365da794b1d2225eb24d5f5e09ef7792cfd5fa26c3a3586210280c80dff3a2a'
    }
    [pscustomobject]@{
      Label = 'GitHub CLI'
      Path = $githubCliArchive
      Sha256 = '35d7fe05c4dd1411ffda1e73dfc7c6f44b75c936ca51fa6595c657fdc0350cec'
    }
    [pscustomobject]@{
      Label = 'jq'
      Path = $jqArchive
      Sha256 = '7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab'
    }
  )
  foreach ($expectation in $archiveExpectations) {
    Assert-CachedArchive -Label $expectation.Label -Path $expectation.Path -ExpectedSha256 $expectation.Sha256
  }

  $cachedFiles = @(Get-ChildItem -LiteralPath $toolCache -Recurse -File)
  $expectedArchivePaths = @($archiveExpectations | ForEach-Object {
      [System.IO.Path]::GetFullPath($_.Path)
    })
  $unexpectedCachedFiles = @($cachedFiles | Where-Object {
      [System.IO.Path]::GetFullPath($_.FullName) -notin $expectedArchivePaths
    })
  if ($cachedFiles.Count -ne $archiveExpectations.Count -or $unexpectedCachedFiles.Count -ne 0) {
    $unexpected = ($unexpectedCachedFiles.FullName -join ', ')
    throw "The fixture cache must retain only the three checksum-verified archives. Unexpected files: $unexpected"
  }

  # Remove every job-local extraction while retaining only the verified archive
  # cache. A warm pass must recreate all executables from those persistent bytes.
  Remove-Item -LiteralPath $runnerTemp -Recurse -Force
  New-Item -ItemType Directory -Path $runnerTemp, $networkDenyRoot -Force | Out-Null
  Remove-Item -LiteralPath $env:GITHUB_PATH -Force -ErrorAction SilentlyContinue
  foreach ($removedOutput in @($gitExe, $bashExe, $ghExe, $jqExe)) {
    if (Test-Path -LiteralPath $removedOutput) {
      throw "Job-local bootstrap output survived the cold-pass cleanup: $removedOutput"
    }
  }

  # Deny both download mechanisms independently of the cooperative offline flag.
  # The PowerShell function is script-scoped; the curl shim exists only in this
  # disposable fixture. Neither changes machine-wide networking or configuration.
  Set-Item -Path Function:Invoke-WebRequest -Value {
    [CmdletBinding()]
    param(
      [string]$Uri,
      [string]$OutFile,
      [switch]$UseBasicParsing,
      [Parameter(ValueFromRemainingArguments = $true)]
      [object[]]$RemainingArguments
    )
    throw 'Bootstrap fixture blocked Invoke-WebRequest network access.'
  }
  $networkDenialInstalled = $true

  try {
    Invoke-WebRequest -Uri 'https://127.0.0.1:1/bootstrap-network-probe' -OutFile (Join-Path $runnerTemp 'denied.download') -UseBasicParsing
    throw 'The Invoke-WebRequest network-denial probe unexpectedly succeeded.'
  } catch {
    if ($_.Exception.Message -ne $networkDenyMessage) {
      throw
    }
  }

  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $bashNetworkDenyProfile,
    "#!/usr/bin/env bash`ncurl() {`n  return 97`n}`n",
    $utf8WithoutBom
  )

  # Do not set DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE here. The warm proof relies on
  # independently blocked network commands and valid cached bytes.
  Remove-Item Env:DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE -ErrorAction SilentlyContinue
  $env:Path = Join-Path $env:SystemRoot 'System32'
  Write-Host 'PortableGit warm-cache bootstrap'
  & $gitBootstrap -ForceBootstrap -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 0) {
    throw "PortableGit warm-cache bootstrap exited with code $LASTEXITCODE"
  }
  foreach ($recreated in @($gitExe, $bashExe)) {
    if (-not (Test-Path -LiteralPath $recreated -PathType Leaf)) {
      throw "PortableGit warm-cache bootstrap did not recreate $recreated"
    }
  }
  & $gitExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Warm-cache PortableGit failed its Git version probe.'
  }
  & $bashExe --version | Select-Object -First 1
  if ($LASTEXITCODE -ne 0) {
    throw 'Warm-cache PortableGit failed its Bash version probe.'
  }

  $env:Path = @(
    (Join-Path $installRoot 'cmd')
    (Join-Path $installRoot 'bin')
    (Join-Path $installRoot 'usr\bin')
    (Join-Path $installRoot 'mingw64\bin')
    (Join-Path $env:SystemRoot 'System32')
  ) -join ';'
  $env:BASH_ENV = Convert-ToMsysPath -BashExe $bashExe -WindowsPath $bashNetworkDenyProfile
  & $bashExe --noprofile --norc -c '[[ "$(type -t curl)" == "function" ]] || exit 96; curl --version >/dev/null 2>&1'
  if ($LASTEXITCODE -ne 97) {
    throw "The curl network-denial probe returned $LASTEXITCODE instead of 97."
  }

  Invoke-BashBootstrap -BashExe $bashExe -ScriptPath $githubCliBootstrap -Label 'GitHub CLI warm-cache'
  Invoke-BashBootstrap -BashExe $bashExe -ScriptPath $jqBootstrap -Label 'jq warm-cache'
  foreach ($recreated in @($ghExe, $jqExe)) {
    if (-not (Test-Path -LiteralPath $recreated -PathType Leaf)) {
      throw "Warm-cache release bootstrap did not recreate $recreated"
    }
  }
  & $ghExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Warm-cache GitHub CLI failed its version probe.'
  }
  & $jqExe --version
  if ($LASTEXITCODE -ne 0) {
    throw 'Warm-cache jq failed its version probe.'
  }

  foreach ($expectation in $archiveExpectations) {
    Assert-CachedArchive -Label $expectation.Label -Path $expectation.Path -ExpectedSha256 $expectation.Sha256
  }
} finally {
  if ($networkDenialInstalled) {
    Remove-Item Function:Invoke-WebRequest -Force -ErrorAction SilentlyContinue
  }
  foreach ($name in $environmentNames) {
    $saved = $savedEnvironment[$name]
    if ($null -eq $saved) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable($name, [string]$saved)
    }
  }
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
