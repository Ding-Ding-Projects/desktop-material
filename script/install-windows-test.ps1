#Requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$installerPath = Join-Path $PSScriptRoot 'install-windows.ps1'
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  $installerPath,
  [ref]$tokens,
  [ref]$parseErrors
) | Out-Null

if ($parseErrors.Count -gt 0) {
  $messages = $parseErrors | ForEach-Object { $_.Message }
  throw "Installer syntax errors: $($messages -join '; ')"
}

function New-MockRelease {
  $digest = 'sha256:' + ('a' * 64)
  $assets = @()
  foreach ($architecture in @('x64', 'arm64')) {
    $name = "GitHubDesktopSetup-$architecture.exe"
    $assets += [pscustomobject]@{
      name                 = $name
      size                 = 123456
      digest               = $digest
      browser_download_url = "https://github.com/Ding-Ding-Projects/desktop-material/releases/download/v1.2.3/$name"
    }
  }

  return [pscustomobject]@{
    tag_name   = 'v1.2.3'
    draft      = $false
    prerelease = $false
    assets      = $assets
  }
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease

# The installer validation mode must use only the supplied release metadata. A
# test-scoped function shadows the network cmdlet without changing production.
function Invoke-RestMethod {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [hashtable]$Headers,

    [switch]$UseBasicParsing,

    [int]$TimeoutSec
  )

  if ($Uri -cne 'https://api.github.com/repos/Ding-Ding-Projects/desktop-material/releases/latest') {
    throw "Unexpected API URL '$Uri'."
  }

  return $global:DesktopMaterialInstallerMockRelease
}

$resolved = & $installerPath -ResolveOnly
$expectedName = "GitHubDesktopSetup-$($resolved.Architecture).exe"
if ($resolved.Repository -cne 'Ding-Ding-Projects/desktop-material') {
  throw "Unexpected repository '$($resolved.Repository)'."
}
if ($resolved.AssetName -cne $expectedName) {
  throw "Expected '$expectedName', received '$($resolved.AssetName)'."
}
if ($resolved.Sha256 -cne ('a' * 64)) {
  throw 'The resolved SHA-256 digest was not normalized correctly.'
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$selectedAsset = @($global:DesktopMaterialInstallerMockRelease.assets | Where-Object { $_.name -ceq $expectedName })[0]
$selectedAsset.browser_download_url = "https://example.invalid/$expectedName"
$unsafeUrlWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $unsafeUrlWasRejected = $_.Exception.Message -match 'not an exact HTTPS release download'
}
if (-not $unsafeUrlWasRejected) {
  throw 'A release asset URL outside the exact GitHub repository was not rejected.'
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$selectedAsset = @($global:DesktopMaterialInstallerMockRelease.assets | Where-Object { $_.name -ceq $expectedName })[0]
$selectedAsset.digest = $null
$missingDigestWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $missingDigestWasRejected = $_.Exception.Message -match 'refusing an unverified install'
}
if (-not $missingDigestWasRejected) {
  throw 'An installer without a GitHub SHA-256 digest was not rejected.'
}

Remove-Variable -Name DesktopMaterialInstallerMockRelease -Scope Global -ErrorAction SilentlyContinue

# ── Build-and-run-from-source (issue #33) dry-run decision tests ─────────────
#
# -FromSource -DryRun returns the resolved plan without cloning, building or
# launching, so the pure clone-vs-update / step-ordering / guard logic is
# exercised here with real (temporary) directories and no network access.

$fromSourceRoot = Join-Path (
  [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
) ("desktop-material-fromsource-test-" + [Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($fromSourceRoot) | Out-Null

try {
  # Clone case: a target that does not yet exist plans a shallow clone.
  $cloneTarget = Join-Path $fromSourceRoot 'fresh'
  $clonePlan = & $installerPath -FromSource -DryRun -SourceDirectory $cloneTarget

  if ($clonePlan.Mode -cne 'FromSource') {
    throw "Expected from-source mode, received '$($clonePlan.Mode)'."
  }
  if ($clonePlan.Action -cne 'clone') {
    throw "Expected a clone action for a missing directory, received '$($clonePlan.Action)'."
  }
  if ($clonePlan.SourceRef -cne 'main') {
    throw "Expected the default 'main' ref, received '$($clonePlan.SourceRef)'."
  }
  if ($clonePlan.SourceUrl -cne 'https://github.com/Ding-Ding-Projects/desktop-material.git') {
    throw "Unexpected from-source clone URL '$($clonePlan.SourceUrl)'."
  }
  if ($clonePlan.Blocked) {
    throw 'A fresh clone target must not be blocked.'
  }
  $cloneStepNames = @($clonePlan.Steps | ForEach-Object { $_.Name })
  if (($cloneStepNames -join ',') -cne 'clone,install,build,launch') {
    throw "Unexpected clone step order '$($cloneStepNames -join ',')'."
  }
  $cloneStep = @($clonePlan.Steps | Where-Object { $_.Name -eq 'clone' })[0]
  if (($cloneStep.Arguments -join ' ') -cne "clone --depth 1 --branch main $($clonePlan.SourceUrl) $($clonePlan.TargetDirectory)") {
    throw "Unexpected clone arguments '$($cloneStep.Arguments -join ' ')'."
  }
  $buildStep = @($clonePlan.Steps | Where-Object { $_.Name -eq 'build' })[0]
  if (($buildStep.Arguments -join ' ') -cne 'build:prod' -or $buildStep.Command -cne 'yarn') {
    throw "Expected the build step to run 'yarn build:prod'."
  }
  if ($clonePlan.ExecutablePath -notmatch 'dist[\\/]GitHubDesktop-win32-(x64|arm64)[\\/]GitHubDesktop\.exe$') {
    throw "Unexpected built executable path '$($clonePlan.ExecutablePath)'."
  }
  $prereqNames = @($clonePlan.Prerequisites | ForEach-Object { $_.Name })
  foreach ($required in @('Git', 'Node.js', 'Yarn')) {
    if ($prereqNames -notcontains $required) {
      throw "The from-source plan did not report the '$required' prerequisite."
    }
  }

  # A caller-provided ref is honoured verbatim.
  $refPlan = & $installerPath -FromSource -DryRun -SourceDirectory (Join-Path $fromSourceRoot 'ref') -SourceRef 'v9.9.9'
  if ($refPlan.SourceRef -cne 'v9.9.9') {
    throw "Expected the caller ref 'v9.9.9', received '$($refPlan.SourceRef)'."
  }

  # Update case: an existing Git checkout plans fetch + hard reset, not a clone.
  $updateTarget = Join-Path $fromSourceRoot 'existing'
  [System.IO.Directory]::CreateDirectory((Join-Path $updateTarget '.git')) | Out-Null
  $updatePlan = & $installerPath -FromSource -DryRun -SourceDirectory $updateTarget
  if ($updatePlan.Action -cne 'update') {
    throw "Expected an update action for an existing checkout, received '$($updatePlan.Action)'."
  }
  $updateStepNames = @($updatePlan.Steps | ForEach-Object { $_.Name })
  if (($updateStepNames -join ',') -cne 'fetch,checkout,install,build,launch') {
    throw "Unexpected update step order '$($updateStepNames -join ',')'."
  }

  # Guard case: a non-empty directory that is not our checkout is refused.
  $blockedTarget = Join-Path $fromSourceRoot 'occupied'
  [System.IO.Directory]::CreateDirectory($blockedTarget) | Out-Null
  Set-Content -LiteralPath (Join-Path $blockedTarget 'keep.txt') -Value 'x'
  $blockedPlan = & $installerPath -FromSource -DryRun -SourceDirectory $blockedTarget
  if (-not $blockedPlan.Blocked) {
    throw 'A non-empty, non-Git target directory was not refused.'
  }
  if ($blockedPlan.BlockReason -notmatch 'not a Git repository') {
    throw "Unexpected block reason '$($blockedPlan.BlockReason)'."
  }
} finally {
  Remove-Item -LiteralPath $fromSourceRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'install-windows.ps1 validation tests passed.'
