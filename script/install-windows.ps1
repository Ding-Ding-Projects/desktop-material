#Requires -Version 5.1

<#
.SYNOPSIS
Installs the newest Desktop Material release for the current Windows architecture.

.DESCRIPTION
Queries the latest published release from Ding-Ding-Projects/desktop-material,
selects the exact per-user Squirrel installer for the native architecture,
verifies GitHub's SHA-256 release-asset digest and any Authenticode signature,
runs the installer silently, and removes the temporary download.

.PARAMETER ResolveOnly
Resolves and validates release metadata without downloading or installing it.

.PARAMETER FromSource
Builds and runs Desktop Material from source instead of installing a published
release: detects the git/Node.js/Yarn prerequisites, shallow-clones (or updates)
the repository into a chosen directory, runs `yarn install` and
`yarn build:prod`, then launches the freshly built app. Re-runs are idempotent.

.PARAMETER SourceDirectory
The directory the from-source build clones into (and re-uses on later runs).
Defaults to `<Documents>\desktop-material-source`. Ignored unless -FromSource.

.PARAMETER SourceRef
The branch or tag the from-source build checks out. Defaults to `main`.
Ignored unless -FromSource.

.PARAMETER DryRun
With -FromSource, resolves and returns the full build plan (prerequisites,
clone-vs-update decision, ordered steps, launch path) without cloning, building
or launching anything. The pure decision logic this exercises is covered by
script/install-windows-test.ps1.
#>
[CmdletBinding()]
param(
  [switch]$ResolveOnly,
  [switch]$FromSource,
  [string]$SourceDirectory,
  [string]$SourceRef,
  [switch]$DryRun
)

# Keep functions and preference changes out of the caller's scope when this file
# is executed through Invoke-Expression.
& {
  [CmdletBinding()]
  param(
    [bool]$ResolveOnly,
    [bool]$FromSource,
    [string]$SourceDirectory,
    [string]$SourceRef,
    [bool]$DryRun
  )

  Set-StrictMode -Version 3.0
  $ErrorActionPreference = 'Stop'

  $repository = 'Ding-Ding-Projects/desktop-material'
  $apiUrl = "https://api.github.com/repos/$repository/releases/latest"
  $requestHeaders = @{
    Accept                   = 'application/vnd.github+json'
    'X-GitHub-Api-Version'   = '2022-11-28'
    'User-Agent'             = 'Desktop-Material-Windows-Installer'
  }
  $maximumAssetBytes = 1GB

  function Get-OptionalPropertyValue {
    param(
      [Parameter(Mandatory = $true)]
      [object]$InputObject,

      [Parameter(Mandatory = $true)]
      [string]$Name
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
      return $null
    }

    return $property.Value
  }

  function Get-NativeWindowsArchitecture {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
      throw 'Desktop Material can only be installed by this script on Windows.'
    }

    if (-not [System.Environment]::Is64BitOperatingSystem) {
      throw 'Desktop Material requires 64-bit Windows; no x86 installer is published.'
    }

    $architecture = $null
    try {
      $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    } catch {
      # RuntimeInformation is available on supported Windows versions, but the
      # environment fallback keeps Windows PowerShell 5.1 hosts predictable.
    }

    if ([string]::IsNullOrWhiteSpace([string]$architecture)) {
      $architecture = $env:PROCESSOR_ARCHITEW6432
      if ([string]::IsNullOrWhiteSpace([string]$architecture)) {
        $architecture = $env:PROCESSOR_ARCHITECTURE
      }
    }

    switch -Regex ([string]$architecture) {
      '^(X64|AMD64|x86_64)$' { return 'x64' }
      '^(Arm64|ARM64|aarch64)$' { return 'arm64' }
      default {
        throw "Unsupported Windows architecture '$architecture'."
      }
    }
  }

  function Get-LatestDesktopMaterialRelease {
    try {
      $release = Invoke-RestMethod `
        -Uri $apiUrl `
        -Headers $requestHeaders `
        -UseBasicParsing `
        -TimeoutSec 30 `
        -ErrorAction Stop
    } catch {
      throw "Could not query the latest release from $repository. $($_.Exception.Message)"
    }

    if ($null -eq $release) {
      throw "GitHub returned no latest release for $repository."
    }

    if ([bool](Get-OptionalPropertyValue -InputObject $release -Name 'draft')) {
      throw 'GitHub unexpectedly returned a draft as the latest release.'
    }

    if ([bool](Get-OptionalPropertyValue -InputObject $release -Name 'prerelease')) {
      throw 'GitHub unexpectedly returned a prerelease as the latest release.'
    }

    $tag = [string](Get-OptionalPropertyValue -InputObject $release -Name 'tag_name')
    if ([string]::IsNullOrWhiteSpace($tag)) {
      throw 'The latest GitHub release does not have a tag.'
    }

    return $release
  }

  function Get-DesktopMaterialInstallerAsset {
    param(
      [Parameter(Mandatory = $true)]
      [object]$Release,

      [Parameter(Mandatory = $true)]
      [ValidateSet('x64', 'arm64')]
      [string]$Architecture
    )

    $expectedName = "GitHubDesktopSetup-$Architecture.exe"
    $assetsValue = Get-OptionalPropertyValue -InputObject $Release -Name 'assets'
    $matches = @(
      @($assetsValue) | Where-Object {
        [string](Get-OptionalPropertyValue -InputObject $_ -Name 'name') -ceq $expectedName
      }
    )

    if ($matches.Count -ne 1) {
      throw "Expected exactly one '$expectedName' asset in the latest release; found $($matches.Count)."
    }

    $asset = $matches[0]
    $downloadUrl = [string](Get-OptionalPropertyValue -InputObject $asset -Name 'browser_download_url')
    $downloadUri = $null
    if (-not [System.Uri]::TryCreate($downloadUrl, [System.UriKind]::Absolute, [ref]$downloadUri)) {
      throw "The '$expectedName' asset has an invalid download URL."
    }

    $escapedRepository = [System.Text.RegularExpressions.Regex]::Escape($repository)
    $escapedName = [System.Text.RegularExpressions.Regex]::Escape($expectedName)
    $expectedPath = "^/$escapedRepository/releases/download/[^/]+/$escapedName$"
    if (
      $downloadUri.Scheme -cne 'https' -or
      $downloadUri.Host -cne 'github.com' -or
      $downloadUri.AbsolutePath -cnotmatch $expectedPath
    ) {
      throw "The '$expectedName' asset URL is not an exact HTTPS release download from $repository."
    }

    $assetSize = 0L
    $assetSizeValue = Get-OptionalPropertyValue -InputObject $asset -Name 'size'
    if (
      -not [long]::TryParse([string]$assetSizeValue, [ref]$assetSize) -or
      $assetSize -le 0 -or
      $assetSize -gt $maximumAssetBytes
    ) {
      throw "The '$expectedName' asset size is missing or outside the allowed range."
    }

    $digest = [string](Get-OptionalPropertyValue -InputObject $asset -Name 'digest')
    $digestMatch = [System.Text.RegularExpressions.Regex]::Match(
      $digest,
      '^sha256:([0-9a-fA-F]{64})$'
    )
    if (-not $digestMatch.Success) {
      throw "The '$expectedName' asset has no supported GitHub SHA-256 digest; refusing an unverified install."
    }

    return [pscustomobject]@{
      Name        = $expectedName
      DownloadUrl = $downloadUri.AbsoluteUri
      Size        = $assetSize
      Sha256      = $digestMatch.Groups[1].Value.ToLowerInvariant()
    }
  }

  function New-ControlledInstallerDirectory {
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $directoryName = "desktop-material-install-$([System.Guid]::NewGuid().ToString('N'))"
    $path = [System.IO.Path]::Combine($tempRoot, $directoryName)
    [System.IO.Directory]::CreateDirectory($path) | Out-Null
    return $path
  }

  function Remove-ControlledInstallerDirectory {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path
    )

    if (-not [System.IO.Directory]::Exists($Path)) {
      return
    }

    $trimCharacters = [char[]]@('\', '/')
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd($trimCharacters)
    $candidate = [System.IO.Path]::GetFullPath($Path).TrimEnd($trimCharacters)
    $requiredPrefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
    $leafName = [System.IO.Path]::GetFileName($candidate)

    if (
      -not $candidate.StartsWith($requiredPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not $leafName.StartsWith('desktop-material-install-', [System.StringComparison]::Ordinal)
    ) {
      throw "Refusing to remove uncontrolled temporary path '$candidate'."
    }

    Remove-Item -LiteralPath $candidate -Recurse -ErrorAction Stop
  }

  function Confirm-DesktopMaterialInstaller {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Path,

      [Parameter(Mandatory = $true)]
      [object]$Asset
    )

    $downloadedSize = (Get-Item -LiteralPath $Path -ErrorAction Stop).Length
    if ($downloadedSize -ne $Asset.Size) {
      throw "Downloaded size mismatch: expected $($Asset.Size) bytes, received $downloadedSize."
    }

    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ($actualHash -cne $Asset.Sha256) {
      throw "Downloaded SHA-256 mismatch: expected $($Asset.Sha256), received $actualHash."
    }
    Write-Host "Verified GitHub SHA-256: $actualHash"

    $signature = Get-AuthenticodeSignature -FilePath $Path -ErrorAction Stop
    if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
      $signer = $signature.SignerCertificate.Subject
      Write-Host "Verified Authenticode signature: $signer"
    } elseif ($signature.Status -eq [System.Management.Automation.SignatureStatus]::NotSigned) {
      Write-Warning 'This repository currently publishes unsigned installers. The GitHub release-asset SHA-256 digest was verified.'
    } else {
      throw "The installer has an invalid or untrusted Authenticode signature: $($signature.Status)."
    }
  }

  function Invoke-DesktopMaterialInstall {
    param(
      [bool]$ResolveOnly
    )

    $architecture = Get-NativeWindowsArchitecture
    $release = Get-LatestDesktopMaterialRelease
    $tag = [string](Get-OptionalPropertyValue -InputObject $release -Name 'tag_name')
    $asset = Get-DesktopMaterialInstallerAsset -Release $release -Architecture $architecture

    if ($ResolveOnly) {
      return [pscustomobject]@{
        Repository   = $repository
        ReleaseTag   = $tag
        Architecture = $architecture
        AssetName    = $asset.Name
        Size         = $asset.Size
        Sha256       = $asset.Sha256
        DownloadUrl  = $asset.DownloadUrl
      }
    }

    Write-Host "Installing Desktop Material $tag for Windows $architecture..."
    $workDirectory = $null
    try {
      $workDirectory = New-ControlledInstallerDirectory
      $installerPath = [System.IO.Path]::Combine($workDirectory, $asset.Name)

      $originalProgressPreference = $ProgressPreference
      try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest `
          -Uri $asset.DownloadUrl `
          -Headers $requestHeaders `
          -UseBasicParsing `
          -MaximumRedirection 5 `
          -TimeoutSec 900 `
          -OutFile $installerPath `
          -ErrorAction Stop | Out-Null
      } finally {
        $ProgressPreference = $originalProgressPreference
      }

      Confirm-DesktopMaterialInstaller -Path $installerPath -Asset $asset

      $installerProcess = Start-Process `
        -FilePath $installerPath `
        -ArgumentList '/S' `
        -Wait `
        -PassThru `
        -ErrorAction Stop
      if ($installerProcess.ExitCode -ne 0) {
        throw "Desktop Material installer exited with code $($installerProcess.ExitCode)."
      }

      Write-Host 'Desktop Material installed successfully.'
    } finally {
      if ($null -ne $workDirectory) {
        try {
          Remove-ControlledInstallerDirectory -Path $workDirectory
        } catch {
          Write-Warning "Could not remove temporary installer directory '$workDirectory'. $($_.Exception.Message)"
        }
      }
    }
  }

  # ── Build-and-run-from-source (issue #33) ──────────────────────────────────
  #
  # Alongside installing the prebuilt release, -FromSource clones the repository,
  # runs `yarn install` + `yarn build:prod`, and launches the freshly built app.
  # The clone-vs-update decision and the ordered step list are produced by the
  # pure Resolve-FromSourcePlan below (unit-tested via -DryRun), so the executing
  # code never re-derives what to do.

  $sourceRepositoryUrl = "https://github.com/$repository.git"

  function Get-FromSourcePrerequisite {
    param(
      [Parameter(Mandatory = $true)][string]$Name,
      [Parameter(Mandatory = $true)][string]$Command,
      [Parameter(Mandatory = $true)][string]$Hint
    )

    $resolvedPath = $null
    try {
      $resolvedPath = (
        Get-Command -Name $Command -CommandType Application -ErrorAction Stop |
        Select-Object -First 1
      ).Source
    } catch {
      $resolvedPath = $null
    }

    return [pscustomobject]@{
      Name    = $Name
      Command = $Command
      Found   = -not [string]::IsNullOrWhiteSpace([string]$resolvedPath)
      Path    = $resolvedPath
      Hint    = $Hint
    }
  }

  function Get-FromSourcePrerequisites {
    return @(
      Get-FromSourcePrerequisite -Name 'Git' -Command 'git' `
        -Hint 'Install Git from https://git-scm.com/download/win, then reopen PowerShell.'
      Get-FromSourcePrerequisite -Name 'Node.js' -Command 'node' `
        -Hint 'Install the Node.js version pinned in .node-version (current LTS) from https://nodejs.org/, then reopen PowerShell.'
      Get-FromSourcePrerequisite -Name 'Yarn' -Command 'yarn' `
        -Hint 'Enable Yarn with "corepack enable" (bundled with Node.js), or install it from https://classic.yarnpkg.com/.'
    )
  }

  # Pure decision logic: given the resolved inputs, return the full build plan.
  # No disk, network or process access happens here, so -DryRun and the script
  # test can exercise every branch deterministically.
  function Resolve-FromSourcePlan {
    param(
      [Parameter(Mandatory = $true)][string]$SourceUrl,
      [Parameter(Mandatory = $true)][string]$TargetDirectory,
      [Parameter(Mandatory = $true)][string]$SourceRef,
      [Parameter(Mandatory = $true)][ValidateSet('x64', 'arm64')][string]$Architecture,
      [Parameter(Mandatory = $true)][bool]$TargetIsGitRepository,
      [Parameter(Mandatory = $true)][bool]$TargetExists,
      [Parameter(Mandatory = $true)][bool]$TargetIsEmpty,
      [Parameter(Mandatory = $false)]$Prerequisites = @()
    )

    $action = if ($TargetIsGitRepository) { 'update' } else { 'clone' }

    # Never clone over a non-empty directory that is not already our checkout.
    $blocked = $false
    $blockReason = $null
    if ($action -eq 'clone' -and $TargetExists -and -not $TargetIsEmpty) {
      $blocked = $true
      $blockReason = "The target directory '$TargetDirectory' exists, is not a Git repository, and is not empty. Choose an empty directory with -SourceDirectory, or remove it first."
    }

    $steps = @()
    if ($action -eq 'update') {
      $steps += [pscustomobject]@{
        Name        = 'fetch'
        Command     = 'git'
        Arguments   = @('-C', $TargetDirectory, 'fetch', '--depth', '1', 'origin', $SourceRef)
        Description = "Fetching the latest '$SourceRef' into the existing checkout"
        InCheckout  = $false
      }
      $steps += [pscustomobject]@{
        Name        = 'checkout'
        Command     = 'git'
        Arguments   = @('-C', $TargetDirectory, 'reset', '--hard', 'FETCH_HEAD')
        Description = "Resetting the checkout to the fetched '$SourceRef'"
        InCheckout  = $false
      }
    } else {
      $steps += [pscustomobject]@{
        Name        = 'clone'
        Command     = 'git'
        Arguments   = @('clone', '--depth', '1', '--branch', $SourceRef, $SourceUrl, $TargetDirectory)
        Description = "Cloning $SourceUrl ('$SourceRef') into $TargetDirectory"
        InCheckout  = $false
      }
    }
    $steps += [pscustomobject]@{
      Name        = 'install'
      Command     = 'yarn'
      Arguments   = @('install')
      Description = 'Installing dependencies with Yarn'
      InCheckout  = $true
    }
    $steps += [pscustomobject]@{
      Name        = 'build'
      Command     = 'yarn'
      Arguments   = @('build:prod')
      Description = 'Building the production app (yarn build:prod)'
      InCheckout  = $true
    }

    $executablePath = [System.IO.Path]::Combine(
      $TargetDirectory, 'dist', "GitHubDesktop-win32-$Architecture", 'GitHubDesktop.exe'
    )
    $steps += [pscustomobject]@{
      Name        = 'launch'
      Command     = $executablePath
      Arguments   = @()
      Description = 'Launching the freshly built Desktop Material'
      InCheckout  = $true
    }

    return [pscustomobject]@{
      Mode            = 'FromSource'
      Repository      = $repository
      SourceUrl       = $SourceUrl
      SourceRef       = $SourceRef
      Architecture    = $Architecture
      TargetDirectory = $TargetDirectory
      Action          = $action
      Blocked         = $blocked
      BlockReason     = $blockReason
      Prerequisites   = $Prerequisites
      Steps           = $steps
      ExecutablePath  = $executablePath
    }
  }

  function Invoke-FromSourceStep {
    param(
      [Parameter(Mandatory = $true)][string]$Command,
      [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Arguments,
      [Parameter(Mandatory = $false)][AllowNull()][string]$WorkingDirectory,
      [Parameter(Mandatory = $true)][string]$Label
    )

    $previousLocation = $null
    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
      $previousLocation = Get-Location
      Set-Location -LiteralPath $WorkingDirectory
    }

    $exitCode = $null
    try {
      & $Command @Arguments
      $exitCode = $LASTEXITCODE
    } finally {
      if ($null -ne $previousLocation) {
        Set-Location -LiteralPath $previousLocation
      }
    }

    if ($null -ne $exitCode -and $exitCode -ne 0) {
      throw "Step '$Label' failed: '$Command $($Arguments -join ' ')' exited with code $exitCode."
    }
  }

  function Invoke-DesktopMaterialFromSource {
    param(
      [Parameter(Mandatory = $true)][string]$TargetDirectory,
      [Parameter(Mandatory = $true)][string]$SourceRef,
      [Parameter(Mandatory = $true)][bool]$DryRun
    )

    $architecture = Get-NativeWindowsArchitecture
    $resolvedTarget = [System.IO.Path]::GetFullPath($TargetDirectory)

    $targetExists = [System.IO.Directory]::Exists($resolvedTarget)
    $gitMarker = [System.IO.Path]::Combine($resolvedTarget, '.git')
    $isGitRepository =
      [System.IO.Directory]::Exists($gitMarker) -or [System.IO.File]::Exists($gitMarker)
    $isEmpty = $true
    if ($targetExists) {
      $isEmpty = @(
        Get-ChildItem -LiteralPath $resolvedTarget -Force -ErrorAction SilentlyContinue
      ).Count -eq 0
    }

    $prerequisites = Get-FromSourcePrerequisites

    $plan = Resolve-FromSourcePlan `
      -SourceUrl $sourceRepositoryUrl `
      -TargetDirectory $resolvedTarget `
      -SourceRef $SourceRef `
      -Architecture $architecture `
      -TargetIsGitRepository $isGitRepository `
      -TargetExists $targetExists `
      -TargetIsEmpty $isEmpty `
      -Prerequisites $prerequisites

    if ($DryRun) {
      return $plan
    }

    if ($plan.Blocked) {
      throw $plan.BlockReason
    }

    $missing = @($prerequisites | Where-Object { -not $_.Found })
    if ($missing.Count -gt 0) {
      $lines = $missing | ForEach-Object { "  - $($_.Name): $($_.Hint)" }
      throw "Build from source needs these tools on your PATH:`n$($lines -join "`n")"
    }

    Write-Host "Building Desktop Material from source in '$resolvedTarget' ($($plan.Action))..."

    if ($plan.Action -eq 'clone') {
      $parent = [System.IO.Path]::GetDirectoryName($resolvedTarget)
      if (-not [string]::IsNullOrEmpty($parent) -and -not [System.IO.Directory]::Exists($parent)) {
        [System.IO.Directory]::CreateDirectory($parent) | Out-Null
      }
    }

    foreach ($step in $plan.Steps) {
      if ($step.Name -eq 'launch') {
        continue
      }
      Write-Host "-> $($step.Description)..."
      $workingDirectory = if ($step.InCheckout) { $resolvedTarget } else { $null }
      Invoke-FromSourceStep `
        -Command $step.Command `
        -Arguments $step.Arguments `
        -WorkingDirectory $workingDirectory `
        -Label $step.Name
    }

    if (-not [System.IO.File]::Exists($plan.ExecutablePath)) {
      throw "The build finished but the executable was not found at '$($plan.ExecutablePath)'. Review the build output above for errors."
    }

    Write-Host "Launching '$($plan.ExecutablePath)'..."
    Start-Process -FilePath $plan.ExecutablePath -WorkingDirectory $resolvedTarget | Out-Null
    Write-Host 'Desktop Material was built from source and launched successfully.'
  }

  if ($FromSource) {
    if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
      $SourceDirectory = [System.IO.Path]::Combine(
        [Environment]::GetFolderPath('MyDocuments'),
        'desktop-material-source'
      )
    }
    if ([string]::IsNullOrWhiteSpace($SourceRef)) {
      $SourceRef = 'main'
    }
  }

  $originalSecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol
  try {
    [System.Net.ServicePointManager]::SecurityProtocol =
      $originalSecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
    if ($FromSource) {
      Invoke-DesktopMaterialFromSource `
        -TargetDirectory $SourceDirectory `
        -SourceRef $SourceRef `
        -DryRun $DryRun
    } else {
      Invoke-DesktopMaterialInstall -ResolveOnly $ResolveOnly
    }
  } finally {
    [System.Net.ServicePointManager]::SecurityProtocol = $originalSecurityProtocol
  }
} -ResolveOnly:$ResolveOnly.IsPresent `
  -FromSource:$FromSource.IsPresent `
  -SourceDirectory $SourceDirectory `
  -SourceRef $SourceRef `
  -DryRun:$DryRun.IsPresent
