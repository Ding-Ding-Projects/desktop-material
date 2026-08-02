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

$installerSource = Get-Content -LiteralPath $installerPath -Raw
foreach ($requiredSourceFragment in @(
  '-WindowStyle Hidden',
  '.WaitForExit($installerProcessTimeoutMilliseconds)',
  '$process.ExitCode -ne 0',
  'Assert-DesktopMaterialIsNotRunning -State $state',
  'Assert-DesktopMaterialCurrentUserExecutionContext',
  'Assert-SquirrelRuntimePrerequisite',
  'Wait-DesktopMaterialInstallationState',
  'Get-DesktopMaterialReleaseVersion -Release $release',
  '-ExpectedVersion $targetVersion'
)) {
  if (-not $installerSource.Contains($requiredSourceFragment)) {
    throw "The unattended process contract lost '$requiredSourceFragment'."
  }
}
if ($installerSource -match 'Stop-Process|\.Kill\(') {
  throw 'The unattended installer must not force-terminate a process.'
}

$installerAst = [System.Management.Automation.Language.Parser]::ParseFile(
  $installerPath,
  [ref]$tokens,
  [ref]$parseErrors
)
foreach ($focusedFunctionName in @(
  'Get-DesktopMaterialInstallationState',
  'Test-DesktopMaterialExpectedVersion',
  'Wait-DesktopMaterialInstallationState'
)) {
  $focusedFunctionAst = $installerAst.Find(
    {
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq $focusedFunctionName
    },
    $true
  )
  if ($null -eq $focusedFunctionAst) {
    throw "Could not locate $focusedFunctionName for focused tests."
  }
  Invoke-Expression $focusedFunctionAst.Extent.Text
}
$maximumInstalledVersionDirectories = 128
$maximumAssetBytes = 1GB
$maximumReleaseManifestBytes = 256KB
$maximumReleaseManifestLines = 128
$postconditionTimeoutMilliseconds = 20
$squirrelReleaseVersionPattern = '^(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>[0-9A-Za-z-]{1,20}))?$'

$stateRoot = Join-Path (
  [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
) ("desktop-material-install-state-test-" + [Guid]::NewGuid().ToString('N'))
try {
  $absentState = Get-DesktopMaterialInstallationState -Root $stateRoot
  if ($absentState.IsInstalled -or $absentState.IsPartial) {
    throw 'An absent current-user installation was not classified as absent.'
  }

  [System.IO.Directory]::CreateDirectory($stateRoot) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $stateRoot '.dead'), ' ')
  $tombstoneState = Get-DesktopMaterialInstallationState -Root $stateRoot
  if (-not $tombstoneState.IsUninstalledTombstone -or $tombstoneState.IsPartial) {
    throw "Squirrel's exact .dead uninstall tombstone was not classified as clean absence."
  }
  $uninstallState = Wait-DesktopMaterialInstallationState `
    -ShouldBeInstalled $false `
    -Operation Uninstall `
    -Root $stateRoot
  if (-not $uninstallState.IsUninstalledTombstone) {
    throw 'The exact-version postcondition change broke idempotent uninstall verification.'
  }

  [System.IO.File]::WriteAllText((Join-Path $stateRoot 'Update.exe'), '')
  $partialState = Get-DesktopMaterialInstallationState -Root $stateRoot
  if (-not $partialState.IsPartial -or $partialState.IsInstalled) {
    throw 'A tombstone mixed with an updater was not classified as a partial install.'
  }

  Remove-Item -LiteralPath (Join-Path $stateRoot '.dead') -Force
  [System.IO.File]::WriteAllText((Join-Path $stateRoot 'GitHubDesktop.exe'), '')
  $appDirectory = Join-Path $stateRoot 'app-1.2.2'
  [System.IO.Directory]::CreateDirectory($appDirectory) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $appDirectory 'GitHubDesktop.exe'), '')
  $packagesDirectory = Join-Path $stateRoot 'packages'
  [System.IO.Directory]::CreateDirectory($packagesDirectory) | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $packagesDirectory 'GitHubDesktop-1.2.2-full.nupkg'),
    'x'
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $packagesDirectory 'RELEASES'),
    (('a' * 40) + ' GitHubDesktop-1.2.2-full.nupkg 1')
  )
  $installedState = Get-DesktopMaterialInstallationState -Root $stateRoot
  if (-not $installedState.IsInstalled -or $installedState.IsPartial) {
    throw 'A complete Squirrel current-user layout was not classified as installed.'
  }
  if ($installedState.ExecutablePath -cne (Join-Path $stateRoot 'GitHubDesktop.exe')) {
    throw "The stable launcher was not selected: '$($installedState.ExecutablePath)'."
  }

  $noOpUpdateWasRejected = $false
  $noOpUpdateError = $null
  try {
    Wait-DesktopMaterialInstallationState `
      -ShouldBeInstalled $true `
      -Operation Update `
      -ExpectedVersion '1.2.3' `
      -Root $stateRoot | Out-Null
  } catch {
    $noOpUpdateError = $_.Exception.Message
    $noOpUpdateWasRejected =
      $_.Exception.Message -match 'exact complete Desktop Material 1\.2\.3 installation'
  }
  if (-not $noOpUpdateWasRejected) {
    throw "A successful no-op that left only version 1.2.2 was accepted as update 1.2.3. Observed: '$noOpUpdateError'."
  }

  $targetAppDirectory = Join-Path $stateRoot 'app-1.2.3'
  [System.IO.Directory]::CreateDirectory($targetAppDirectory) | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $targetAppDirectory 'GitHubDesktop.exe'),
    ''
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $packagesDirectory 'GitHubDesktop-1.2.3-full.nupkg'),
    'x'
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $packagesDirectory 'RELEASES'),
    (('b' * 40) + ' GitHubDesktop-1.2.3-full.nupkg 2')
  )
  $mismatchedPackageState = Get-DesktopMaterialInstallationState -Root $stateRoot
  if (
    Test-DesktopMaterialExpectedVersion `
      -State $mismatchedPackageState `
      -ExpectedVersion '1.2.3'
  ) {
    throw 'A target package whose byte length disagreed with RELEASES was accepted.'
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $packagesDirectory 'RELEASES'),
    (('b' * 40) + ' GitHubDesktop-1.2.3-full.nupkg 1')
  )
  $targetState = Wait-DesktopMaterialInstallationState `
    -ShouldBeInstalled $true `
    -Operation Update `
    -ExpectedVersion '1.2.3' `
    -Root $stateRoot
  if (
    $targetState.VerifiedVersion -cne '1.2.3' -or
    $targetState.VersionedExecutablePath -cne (Join-Path $targetAppDirectory 'GitHubDesktop.exe')
  ) {
    throw 'The exact target install did not return its verified version and executable.'
  }

  foreach ($index in 2..130) {
    [System.IO.Directory]::CreateDirectory(
      (Join-Path $stateRoot ("app-1.2.$index"))
    ) | Out-Null
  }
  $versionDirectoryCapWasEnforced = $false
  $versionDirectoryCapError = $null
  try {
    Get-DesktopMaterialInstallationState -Root $stateRoot | Out-Null
  } catch {
    $versionDirectoryCapError = $_.Exception.Message
    $versionDirectoryCapWasEnforced = $_.Exception.Message -match 'refusing an unbounded unattended scan'
  }
  if (-not $versionDirectoryCapWasEnforced) {
    throw "The installed-version directory scan was not bounded. Observed: '$versionDirectoryCapError'."
  }
} finally {
  Remove-Item -LiteralPath $stateRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Variable -Name maximumInstalledVersionDirectories -ErrorAction SilentlyContinue
  Remove-Variable -Name maximumAssetBytes -ErrorAction SilentlyContinue
  Remove-Variable -Name maximumReleaseManifestBytes -ErrorAction SilentlyContinue
  Remove-Variable -Name maximumReleaseManifestLines -ErrorAction SilentlyContinue
  Remove-Variable -Name postconditionTimeoutMilliseconds -ErrorAction SilentlyContinue
  Remove-Variable -Name squirrelReleaseVersionPattern -ErrorAction SilentlyContinue
  foreach ($focusedFunctionName in @(
    'Get-DesktopMaterialInstallationState',
    'Test-DesktopMaterialExpectedVersion',
    'Wait-DesktopMaterialInstallationState'
  )) {
    Remove-Item `
      -Path "Function:\$focusedFunctionName" `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

$processFunctionAst = $installerAst.Find(
  {
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -ceq 'Invoke-DesktopMaterialInstallerProcess'
  },
  $true
)
if ($null -eq $processFunctionAst) {
  throw 'Could not locate Invoke-DesktopMaterialInstallerProcess for focused tests.'
}
Invoke-Expression $processFunctionAst.Extent.Text
$installerProcessTimeoutMilliseconds = 5000
try {
  $successExitCode = Invoke-DesktopMaterialInstallerProcess `
    -FilePath $env:ComSpec `
    -Arguments @('/d', '/c', 'exit 0') `
    -Label 'Synthetic silent process'
  if ($successExitCode -ne 0) {
    throw "A successful silent process returned '$successExitCode'."
  }

  $nonzeroWasPropagated = $false
  try {
    Invoke-DesktopMaterialInstallerProcess `
      -FilePath $env:ComSpec `
      -Arguments @('/d', '/c', 'exit 23') `
      -Label 'Synthetic silent process' | Out-Null
  } catch {
    $nonzeroWasPropagated = $_.Exception.Message -match 'exited with code 23'
  }
  if (-not $nonzeroWasPropagated) {
    throw 'A nonzero silent child exit was not propagated with its exact code.'
  }
} finally {
  Remove-Variable -Name installerProcessTimeoutMilliseconds -ErrorAction SilentlyContinue
  Remove-Item -Path Function:\Invoke-DesktopMaterialInstallerProcess -Force -ErrorAction SilentlyContinue
}

$runtimeFunctionAst = $installerAst.Find(
  {
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -ceq 'Assert-SquirrelRuntimePrerequisite'
  },
  $true
)
if ($null -eq $runtimeFunctionAst) {
  throw 'Could not locate Assert-SquirrelRuntimePrerequisite for focused tests.'
}
Invoke-Expression $runtimeFunctionAst.Extent.Text
try {
  Assert-SquirrelRuntimePrerequisite
} finally {
  Remove-Item -Path Function:\Assert-SquirrelRuntimePrerequisite -Force -ErrorAction SilentlyContinue
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
  $packageName = 'GitHubDesktop-1.2.3-full.nupkg'
  $assets += [pscustomobject]@{
    name                 = $packageName
    size                 = 654321
    digest               = $digest
    browser_download_url = "https://github.com/Ding-Ding-Projects/desktop-material/releases/download/v1.2.3/$packageName"
  }

  return [pscustomobject]@{
    tag_name   = 'v1.2.3'
    draft      = $false
    prerelease = $false
    assets      = $assets
  }
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$global:DesktopMaterialInstallerMockRequestCount = 0

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

  $global:DesktopMaterialInstallerMockRequestCount++
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
if ($resolved.TargetVersion -cne '1.2.3') {
  throw "The release tag and feed package did not resolve exact target version 1.2.3: '$($resolved.TargetVersion)'."
}
if (
  $resolved.Mode -cne 'UnattendedRelease' -or
  $resolved.Operation -cne 'Install' -or
  $resolved.InstallScope -cne 'CurrentUser' -or
  -not $resolved.Silent
) {
  throw 'The default release operation is not an explicit silent current-user install.'
}
if (($resolved.Arguments -join ',') -cne '--silent') {
  throw "Unexpected install arguments '$($resolved.Arguments -join ',')'."
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
$selectedAsset.browser_download_url = "https://github.com/Ding-Ding-Projects/desktop-material/releases/download/v9.9.9/$expectedName"
$mismatchedTagWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $mismatchedTagWasRejected = $_.Exception.Message -match 'not bound to the latest release tag'
}
if (-not $mismatchedTagWasRejected) {
  throw 'An installer asset URL for a different release tag was not rejected.'
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

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$global:DesktopMaterialInstallerMockRelease.assets = @(
  $global:DesktopMaterialInstallerMockRelease.assets | Where-Object {
    $_.name -cne 'GitHubDesktop-1.2.3-full.nupkg'
  }
)
$missingFeedPackageWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $missingFeedPackageWasRejected = $_.Exception.Message -match 'feed package in the latest release'
}
if (-not $missingFeedPackageWasRejected) {
  throw 'A release without the exact target-version Squirrel feed package was accepted.'
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$packageAsset = @(
  $global:DesktopMaterialInstallerMockRelease.assets | Where-Object {
    $_.name -ceq 'GitHubDesktop-1.2.3-full.nupkg'
  }
)[0]
$packageAsset.browser_download_url = 'https://github.com/Ding-Ding-Projects/desktop-material/releases/download/v9.9.9/GitHubDesktop-1.2.3-full.nupkg'
$mismatchedFeedPackageWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $mismatchedFeedPackageWasRejected = $_.Exception.Message -match 'feed package is not bound to the exact release tag'
}
if (-not $mismatchedFeedPackageWasRejected) {
  throw 'A target package outside the immutable release tag was accepted.'
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$global:DesktopMaterialInstallerMockRelease.tag_name = 'v01.2.3'
$noncanonicalVersionWasRejected = $false
try {
  & $installerPath -ResolveOnly | Out-Null
} catch {
  $noncanonicalVersionWasRejected = $_.Exception.Message -match 'not a canonical Squirrel version tag'
}
if (-not $noncanonicalVersionWasRejected) {
  throw 'A release version that Squirrel could normalize to a different app directory was accepted.'
}

$global:DesktopMaterialInstallerMockRelease = New-MockRelease
$updatePlan = & $installerPath `
  -ResolveOnly `
  -Operation update `
  -InstallScope currentuser
if (
  $updatePlan.Operation -cne 'Update' -or
  $updatePlan.InstallScope -cne 'CurrentUser' -or
  ($updatePlan.Arguments -join ',') -cne '--update=https://github.com/Ding-Ding-Projects/desktop-material/releases/download/v1.2.3/,--silent'
) {
  throw 'The update plan did not canonicalize to the supported silent current-user contract.'
}
if ($updatePlan.AssetName -cne $expectedName) {
  throw "The update plan selected unexpected asset '$($updatePlan.AssetName)'."
}
if ($updatePlan.TargetVersion -cne '1.2.3') {
  throw "The update plan lost its exact target version: '$($updatePlan.TargetVersion)'."
}
if (
  $updatePlan.FilePath -cne ([System.IO.Path]::Combine($updatePlan.InstallationRoot, 'Update.exe')) -or
  $updatePlan.DownloadRequired
) {
  throw 'The update plan does not use the installed updater and exact release feed.'
}

$requestsBeforeUninstallPlan = $global:DesktopMaterialInstallerMockRequestCount
$uninstallPlan = & $installerPath `
  -ResolveOnly `
  -Operation Uninstall `
  -InstallScope CurrentUser
if ($global:DesktopMaterialInstallerMockRequestCount -ne $requestsBeforeUninstallPlan) {
  throw 'Resolving an uninstall unexpectedly queried the release API.'
}
if (
  $uninstallPlan.Operation -cne 'Uninstall' -or
  $uninstallPlan.InstallScope -cne 'CurrentUser' -or
  -not $uninstallPlan.Silent -or
  ($uninstallPlan.Arguments -join ',') -cne '--uninstall,--silent'
) {
  throw 'The uninstall plan does not use the supported silent Squirrel arguments.'
}
$expectedInstallRoot = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine(
    [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData),
    'GitHubDesktop'
  )
)
if ($uninstallPlan.InstallationRoot -cne $expectedInstallRoot) {
  throw "Unexpected current-user installation root '$($uninstallPlan.InstallationRoot)'."
}
if ($uninstallPlan.FilePath -cne ([System.IO.Path]::Combine($expectedInstallRoot, 'Update.exe'))) {
  throw "Unexpected current-user updater path '$($uninstallPlan.FilePath)'."
}

$allUsersWasRejected = $false
try {
  & $installerPath -ResolveOnly -InstallScope AllUsers | Out-Null
} catch {
  $allUsersWasRejected = $true
}
if (-not $allUsersWasRejected) {
  throw 'The unsupported AllUsers scope was not rejected.'
}

$sourceUninstallWasRejected = $false
try {
  & $installerPath -FromSource -DryRun -Operation Uninstall | Out-Null
} catch {
  $sourceUninstallWasRejected = $_.Exception.Message -match 'cannot be combined'
}
if (-not $sourceUninstallWasRejected) {
  throw 'The from-source path accepted an uninstall operation.'
}

Remove-Variable -Name DesktopMaterialInstallerMockRelease -Scope Global -ErrorAction SilentlyContinue
Remove-Variable -Name DesktopMaterialInstallerMockRequestCount -Scope Global -ErrorAction SilentlyContinue

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
