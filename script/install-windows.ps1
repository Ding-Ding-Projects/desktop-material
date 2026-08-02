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
Resolves and validates the unattended operation without downloading, installing,
updating, or uninstalling anything.

.PARAMETER Operation
Chooses the unattended current-user operation. Install is the default and also
refreshes an existing installation. Update requires an existing complete
installation. Uninstall is idempotent when Desktop Material is already absent.

.PARAMETER InstallScope
Makes the supported installation scope explicit. Squirrel installs the app for
the current user; AllUsers is deliberately not offered because the generated
MSI is only a deployment bootstrapper, not a machine-wide application payload.

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
  [ValidateSet('Install', 'Update', 'Uninstall')]
  [string]$Operation = 'Install',
  [ValidateSet('CurrentUser')]
  [string]$InstallScope = 'CurrentUser',
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
    [string]$Operation,
    [string]$InstallScope,
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
  $maximumInstalledVersionDirectories = 128
  $maximumReleaseManifestBytes = 256KB
  $maximumReleaseManifestLines = 128
  $installerProcessTimeoutMilliseconds = 900000
  $postconditionTimeoutMilliseconds = 60000
  # Keep the postcondition path byte-for-byte stable. Squirrel/NuGet can
  # normalize omitted or zero revision components and leading-zero numeric
  # components, so unattended release tags deliberately use the canonical
  # three-component form produced by this repository's release workflows.
  $squirrelReleaseVersionPattern = '^(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>[0-9A-Za-z-]{1,20}))?$'

  switch ($Operation.ToLowerInvariant()) {
    'install' { $Operation = 'Install' }
    'update' { $Operation = 'Update' }
    'uninstall' { $Operation = 'Uninstall' }
    default { throw "Unsupported unattended operation '$Operation'." }
  }
  if ($InstallScope -ine 'CurrentUser') {
    throw "Unsupported installation scope '$InstallScope'. Desktop Material's Squirrel package supports CurrentUser only."
  }
  $InstallScope = 'CurrentUser'

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

  function Get-DesktopMaterialReleaseVersion {
    param(
      [Parameter(Mandatory = $true)]
      [object]$Release
    )

    $tag = [string](Get-OptionalPropertyValue -InputObject $Release -Name 'tag_name')
    if ($tag.Length -gt 128 -or -not $tag.StartsWith('v', [System.StringComparison]::Ordinal)) {
      throw 'The latest release tag is not a canonical Squirrel version tag.'
    }

    $version = $tag.Substring(1)
    $versionMatch = [System.Text.RegularExpressions.Regex]::Match(
      $version,
      $squirrelReleaseVersionPattern,
      [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if (-not $versionMatch.Success) {
      throw 'The latest release tag is not a canonical Squirrel version tag.'
    }

    foreach ($componentName in @('major', 'minor', 'patch')) {
      $component = 0
      if (
        -not [int]::TryParse(
          $versionMatch.Groups[$componentName].Value,
          [System.Globalization.NumberStyles]::None,
          [System.Globalization.CultureInfo]::InvariantCulture,
          [ref]$component
        )
      ) {
        throw 'The latest release tag contains a Squirrel version component outside the supported range.'
      }
    }

    $expectedPackageName = "GitHubDesktop-$version-full.nupkg"
    $assetsValue = Get-OptionalPropertyValue -InputObject $Release -Name 'assets'
    $packageMatches = @(
      @($assetsValue) | Where-Object {
        [string](Get-OptionalPropertyValue -InputObject $_ -Name 'name') -ceq $expectedPackageName
      }
    )
    if ($packageMatches.Count -ne 1) {
      throw "Expected exactly one '$expectedPackageName' feed package in the latest release; found $($packageMatches.Count)."
    }

    $packageAsset = $packageMatches[0]
    $packageDownloadUrl = [string](Get-OptionalPropertyValue -InputObject $packageAsset -Name 'browser_download_url')
    $packageDownloadUri = $null
    if (
      -not [System.Uri]::TryCreate(
        $packageDownloadUrl,
        [System.UriKind]::Absolute,
        [ref]$packageDownloadUri
      )
    ) {
      throw "The '$expectedPackageName' feed package has an invalid download URL."
    }

    $escapedRepository = [System.Text.RegularExpressions.Regex]::Escape($repository)
    $escapedTag = [System.Text.RegularExpressions.Regex]::Escape($tag)
    $escapedPackageName = [System.Text.RegularExpressions.Regex]::Escape($expectedPackageName)
    $expectedPath = "^/$escapedRepository/releases/download/$escapedTag/$escapedPackageName$"
    if (
      $packageDownloadUri.Scheme -cne 'https' -or
      $packageDownloadUri.Host -cne 'github.com' -or
      -not [string]::IsNullOrEmpty($packageDownloadUri.Query) -or
      -not [string]::IsNullOrEmpty($packageDownloadUri.Fragment) -or
      $packageDownloadUri.AbsolutePath -cnotmatch $expectedPath
    ) {
      throw "The '$expectedPackageName' feed package is not bound to the exact release tag."
    }

    $packageSize = 0L
    $packageSizeValue = Get-OptionalPropertyValue -InputObject $packageAsset -Name 'size'
    if (
      -not [long]::TryParse([string]$packageSizeValue, [ref]$packageSize) -or
      $packageSize -le 0 -or
      $packageSize -gt $maximumAssetBytes
    ) {
      throw "The '$expectedPackageName' feed package size is missing or outside the allowed range."
    }

    $packageDigest = [string](Get-OptionalPropertyValue -InputObject $packageAsset -Name 'digest')
    if ($packageDigest -cnotmatch '^sha256:[0-9a-fA-F]{64}$') {
      throw "The '$expectedPackageName' feed package has no supported GitHub SHA-256 digest."
    }

    return $version
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
    $expectedPath = "^/$escapedRepository/releases/download/(?<tag>[^/]+)/$escapedName$"
    $pathMatch = [System.Text.RegularExpressions.Regex]::Match(
      $downloadUri.AbsolutePath,
      $expectedPath
    )
    if (
      $downloadUri.Scheme -cne 'https' -or
      $downloadUri.Host -cne 'github.com' -or
      -not [string]::IsNullOrEmpty($downloadUri.Query) -or
      -not [string]::IsNullOrEmpty($downloadUri.Fragment) -or
      -not $pathMatch.Success
    ) {
      throw "The '$expectedName' asset URL is not an exact HTTPS release download from $repository."
    }

    $releaseTag = [string](Get-OptionalPropertyValue -InputObject $Release -Name 'tag_name')
    $assetTag = [System.Uri]::UnescapeDataString($pathMatch.Groups['tag'].Value)
    if ($assetTag -cne $releaseTag) {
      throw "The '$expectedName' asset URL is not bound to the latest release tag."
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

  function Get-DesktopMaterialInstallationState {
    param(
      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [string]$Root
    )

    if ([string]::IsNullOrWhiteSpace($Root)) {
      $localApplicationData = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::LocalApplicationData
      )
      if ([string]::IsNullOrWhiteSpace($localApplicationData)) {
        throw 'Windows did not provide the current user LocalAppData directory.'
      }

      $Root = [System.IO.Path]::Combine($localApplicationData, 'GitHubDesktop')
    }

    $root = [System.IO.Path]::GetFullPath($Root)
    $updaterPath = [System.IO.Path]::Combine($root, 'Update.exe')
    $launcherPath = [System.IO.Path]::Combine($root, 'GitHubDesktop.exe')
    $releaseManifestPath = [System.IO.Path]::Combine($root, 'packages', 'RELEASES')
    $uninstallMarkerPath = [System.IO.Path]::Combine($root, '.dead')
    $versionedExecutablePath = $null

    if ([System.IO.Directory]::Exists($root)) {
      $versionDirectories = @()
      foreach (
        $directoryPath in [System.IO.Directory]::EnumerateDirectories(
          $root,
          'app-*',
          [System.IO.SearchOption]::TopDirectoryOnly
        )
      ) {
        if ($versionDirectories.Count -ge $maximumInstalledVersionDirectories) {
          throw "Desktop Material has more than $maximumInstalledVersionDirectories installed-version directories; refusing an unbounded unattended scan."
        }
        $versionDirectories += [System.IO.DirectoryInfo]::new($directoryPath)
      }

      $candidate = @(
        $versionDirectories |
        Sort-Object -Property Name -Descending |
        ForEach-Object {
          if (-not [System.IO.File]::Exists([System.IO.Path]::Combine($_.FullName, '.dead'))) {
            $path = [System.IO.Path]::Combine($_.FullName, 'GitHubDesktop.exe')
            if ([System.IO.File]::Exists($path)) {
              $path
            }
          }
        }
      ) | Select-Object -First 1

      if ($null -ne $candidate) {
        $versionedExecutablePath = [string]$candidate
      }
    }

    $hasRoot = [System.IO.Directory]::Exists($root)
    $hasUpdater = [System.IO.File]::Exists($updaterPath)
    $hasLauncher = [System.IO.File]::Exists($launcherPath)
    $hasVersionedExecutable = -not [string]::IsNullOrWhiteSpace($versionedExecutablePath)
    $hasReleaseManifest = [System.IO.File]::Exists($releaseManifestPath)
    $hasExecutable = $hasLauncher -or $hasVersionedExecutable
    $hasUninstallMarker = [System.IO.File]::Exists($uninstallMarkerPath)
    $isInstalled =
      $hasUpdater -and $hasLauncher -and $hasVersionedExecutable -and $hasReleaseManifest
    $isUninstalledTombstone =
      $hasRoot -and
      $hasUninstallMarker -and
      -not $hasUpdater -and
      -not $hasExecutable -and
      -not $hasReleaseManifest

    return [pscustomobject]@{
      Root                   = $root
      UpdaterPath            = $updaterPath
      LauncherPath           = $launcherPath
      ReleaseManifestPath    = $releaseManifestPath
      UninstallMarkerPath    = $uninstallMarkerPath
      ExecutablePath         = if ($isInstalled) { $launcherPath } else { $null }
      VersionedExecutablePath = $versionedExecutablePath
      HasRoot                = $hasRoot
      HasUpdater             = $hasUpdater
      HasLauncher            = $hasLauncher
      HasVersionedExecutable = $hasVersionedExecutable
      HasReleaseManifest     = $hasReleaseManifest
      HasExecutable          = $hasExecutable
      HasUninstallMarker     = $hasUninstallMarker
      IsInstalled            = $isInstalled
      IsUninstalledTombstone = $isUninstalledTombstone
      IsPartial              = $hasRoot -and -not $isInstalled -and -not $isUninstalledTombstone
    }
  }

  function Test-DesktopMaterialExpectedVersion {
    param(
      [Parameter(Mandatory = $true)]
      [object]$State,

      [Parameter(Mandatory = $true)]
      [string]$ExpectedVersion
    )

    if (
      $ExpectedVersion.Length -gt 128 -or
      $ExpectedVersion -cnotmatch $squirrelReleaseVersionPattern
    ) {
      throw 'The expected Desktop Material version is not canonical.'
    }

    $expectedVersionDirectory = [System.IO.Path]::Combine(
      $State.Root,
      "app-$ExpectedVersion"
    )
    $expectedVersionedExecutablePath = [System.IO.Path]::Combine(
      $expectedVersionDirectory,
      'GitHubDesktop.exe'
    )
    $expectedVersionMarkerPath = [System.IO.Path]::Combine(
      $expectedVersionDirectory,
      '.dead'
    )
    $expectedPackageName = "GitHubDesktop-$ExpectedVersion-full.nupkg"
    $expectedPackagePath = [System.IO.Path]::Combine(
      $State.Root,
      'packages',
      $expectedPackageName
    )

    if (
      -not $State.IsInstalled -or
      $State.HasUninstallMarker -or
      -not [System.IO.File]::Exists($expectedVersionedExecutablePath) -or
      [System.IO.File]::Exists($expectedVersionMarkerPath) -or
      -not [System.IO.File]::Exists($expectedPackagePath)
    ) {
      return $false
    }

    try {
      $expectedPackage = [System.IO.FileInfo]::new($expectedPackagePath)
      $expectedPackageLength = $expectedPackage.Length
    } catch {
      # Squirrel may still be replacing the package after its parent updater
      # exits. Treat transient filesystem state as not-ready and keep polling.
      return $false
    }
    if ($expectedPackageLength -le 0 -or $expectedPackageLength -gt $maximumAssetBytes) {
      return $false
    }

    try {
      $manifest = [System.IO.FileInfo]::new($State.ReleaseManifestPath)
      $manifestLength = $manifest.Length
    } catch {
      return $false
    }
    if ($manifestLength -le 0) {
      return $false
    }
    if ($manifestLength -gt $maximumReleaseManifestBytes) {
      throw "Desktop Material's local RELEASES manifest exceeds the bounded verification size."
    }

    try {
      $manifestLines = [System.IO.File]::ReadAllLines($manifest.FullName)
    } catch {
      return $false
    }
    if ($manifestLines.Count -gt $maximumReleaseManifestLines) {
      throw "Desktop Material's local RELEASES manifest has more than $maximumReleaseManifestLines lines; refusing an unbounded unattended scan."
    }

    $escapedPackageName = [System.Text.RegularExpressions.Regex]::Escape(
      $expectedPackageName
    )
    $expectedEntryPattern = "^[0-9a-fA-F]{40}\s+$escapedPackageName\s+(?<size>[1-9][0-9]*)$"
    foreach ($rawLine in $manifestLines) {
      $line = [System.Text.RegularExpressions.Regex]::Replace(
        $rawLine,
        '\s*#.*$',
        ''
      ).Trim()
      $entryMatch = [System.Text.RegularExpressions.Regex]::Match(
        $line,
        $expectedEntryPattern,
        [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
      )
      if ($entryMatch.Success) {
        $entrySize = 0L
        if (
          [long]::TryParse(
            $entryMatch.Groups['size'].Value,
            [System.Globalization.NumberStyles]::None,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$entrySize
          ) -and
          $entrySize -eq $expectedPackageLength
        ) {
          return $true
        }
      }
    }

    return $false
  }

  function Assert-DesktopMaterialIsNotRunning {
    param(
      [Parameter(Mandatory = $true)]
      [object]$State
    )

    $rootPrefix = $State.Root.TrimEnd([char[]]@('\\', '/')) + [System.IO.Path]::DirectorySeparatorChar
    $running = @()
    $unresolved = @()
    $currentSessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId

    foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
      $processPath = $null
      try {
        $processPath = [string]$process.Path
      } catch {
        $processPath = $null
      }

      if ([string]::IsNullOrWhiteSpace($processPath)) {
        if (
          $process.ProcessName -ieq 'GitHubDesktop' -and
          $process.SessionId -eq $currentSessionId
        ) {
          $unresolved += $process.Id
        }
        continue
      }

      $resolvedProcessPath = [System.IO.Path]::GetFullPath($processPath)
      if (
        $resolvedProcessPath.StartsWith(
          $rootPrefix,
          [System.StringComparison]::OrdinalIgnoreCase
        )
      ) {
        $running += $process.Id
      }
    }

    if ($running.Count -gt 0) {
      throw "Desktop Material is running (process $($running -join ', ')). Close it normally and retry; unattended operations never force-close the app."
    }
    if ($unresolved.Count -gt 0) {
      throw "Could not verify the executable path for GitHubDesktop process $($unresolved -join ', '). Close it normally and retry."
    }
  }

  function Assert-DesktopMaterialCurrentUserExecutionContext {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
      throw 'Desktop Material unattended operations are supported on Windows only.'
    }

    $identity = $null
    $isElevated = $false
    try {
      $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
      $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
      $isElevated = $principal.IsInRole(
        [System.Security.Principal.WindowsBuiltInRole]::Administrator
      )
    } catch {
      throw 'Could not verify the current Windows user token; refusing an unattended operation.'
    } finally {
      if ($null -ne $identity) {
        $identity.Dispose()
      }
    }

    if ($isElevated) {
      throw 'Run the CurrentUser operation from a normal, non-administrator PowerShell session; Squirrel does not support an elevated per-user setup.'
    }
  }

  function Assert-SquirrelRuntimePrerequisite {
    $baseKey = $null
    $frameworkKey = $null
    try {
      $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
      )
      $frameworkKey = $baseKey.OpenSubKey(
        'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full',
        $false
      )
      $release = 0
      $releaseValue = if ($null -eq $frameworkKey) {
        $null
      } else {
        $frameworkKey.GetValue('Release', $null)
      }
      $hasSupportedRuntime =
        $null -ne $releaseValue -and
        [int]::TryParse([string]$releaseValue, [ref]$release) -and
        $release -ge 378389
      if (-not $hasSupportedRuntime) {
        throw 'Desktop Material setup requires .NET Framework 4.5 or newer. Install the supported Windows component first; unattended setup will not open a framework or reboot prompt.'
      }
    } finally {
      if ($null -ne $frameworkKey) {
        $frameworkKey.Dispose()
      }
      if ($null -ne $baseKey) {
        $baseKey.Dispose()
      }
    }
  }

  function Invoke-DesktopMaterialInstallerProcess {
    param(
      [Parameter(Mandatory = $true)]
      [string]$FilePath,

      [Parameter(Mandatory = $true)]
      [AllowEmptyCollection()]
      [string[]]$Arguments,

      [Parameter(Mandatory = $true)]
      [string]$Label
    )

    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $Arguments `
      -WindowStyle Hidden `
      -PassThru `
      -ErrorAction Stop

    if (-not $process.WaitForExit($installerProcessTimeoutMilliseconds)) {
      throw "$Label did not exit within $([int]($installerProcessTimeoutMilliseconds / 1000)) seconds. It was not force-terminated; inspect the Squirrel log before retrying."
    }

    $process.Refresh()
    if ($process.ExitCode -ne 0) {
      throw "$Label exited with code $($process.ExitCode)."
    }

    return [int]$process.ExitCode
  }

  function Wait-DesktopMaterialInstallationState {
    param(
      [Parameter(Mandatory = $true)]
      [bool]$ShouldBeInstalled,

      [Parameter(Mandatory = $true)]
      [string]$Operation,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [string]$ExpectedVersion,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [string]$Root
    )

    if ($ShouldBeInstalled -and [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
      throw 'An exact expected version is required for an install or update postcondition.'
    }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    do {
      $state = Get-DesktopMaterialInstallationState -Root $Root
      if (
        $ShouldBeInstalled -and
        (Test-DesktopMaterialExpectedVersion `
          -State $state `
          -ExpectedVersion $ExpectedVersion)
      ) {
        $expectedExecutablePath = [System.IO.Path]::Combine(
          $state.Root,
          "app-$ExpectedVersion",
          'GitHubDesktop.exe'
        )
        $state | Add-Member `
          -NotePropertyName VersionedExecutablePath `
          -NotePropertyValue $expectedExecutablePath `
          -Force
        $state | Add-Member `
          -NotePropertyName VerifiedVersion `
          -NotePropertyValue $ExpectedVersion
        return $state
      }
      if (-not $ShouldBeInstalled -and -not $state.HasUpdater -and -not $state.HasExecutable) {
        return $state
      }

      Start-Sleep -Milliseconds 250
    } while ($stopwatch.ElapsedMilliseconds -lt $postconditionTimeoutMilliseconds)

    $expected = if ($ShouldBeInstalled) {
      "the exact complete Desktop Material $ExpectedVersion installation"
    } else {
      'no installed executable or updater'
    }
    throw "$Operation exited successfully but its postcondition was not reached within $([int]($postconditionTimeoutMilliseconds / 1000)) seconds; expected $expected."
  }

  function New-DesktopMaterialOperationPlan {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Operation,

      [Parameter(Mandatory = $true)]
      [string]$InstallScope,

      [Parameter(Mandatory = $true)]
      [object]$State,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [object]$Release,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [object]$Asset,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [string]$Architecture,

      [Parameter(Mandatory = $false)]
      [AllowNull()]
      [string]$TargetVersion
    )

    $isUninstall = $Operation -ceq 'Uninstall'
    $isUpdate = $Operation -ceq 'Update'
    $releaseBaseUrl = if ($null -eq $Asset) {
      $null
    } else {
      ([System.Uri]::new([System.Uri]$Asset.DownloadUrl, '.')).AbsoluteUri
    }
    $arguments = if ($isUninstall) {
      @('--uninstall', '--silent')
    } elseif ($isUpdate) {
      @("--update=$releaseBaseUrl", '--silent')
    } else {
      @('--silent')
    }
    $filePath = if ($isUninstall -or $isUpdate) { $State.UpdaterPath } else { $Asset.Name }
    $releaseTag = if ($null -eq $Release) {
      $null
    } else {
      [string](Get-OptionalPropertyValue -InputObject $Release -Name 'tag_name')
    }

    return [pscustomobject]@{
      Mode             = 'UnattendedRelease'
      Operation        = $Operation
      InstallScope     = $InstallScope
      Silent           = $true
      Architecture     = $Architecture
      ReleaseTag       = $releaseTag
      TargetVersion    = $TargetVersion
      AssetName        = if ($null -eq $Asset) { $null } else { $Asset.Name }
      Size             = if ($null -eq $Asset) { $null } else { $Asset.Size }
      Sha256           = if ($null -eq $Asset) { $null } else { $Asset.Sha256 }
      DownloadUrl      = if ($null -eq $Asset) { $null } else { $Asset.DownloadUrl }
      ReleaseBaseUrl   = $releaseBaseUrl
      DownloadRequired = -not $isUninstall -and -not $isUpdate
      FilePath         = $filePath
      Arguments        = $arguments
      InstallationRoot = $State.Root
      WasInstalled     = [bool]$State.IsInstalled
      WasPartial       = [bool]$State.IsPartial
    }
  }

  function Invoke-DesktopMaterialInstall {
    param(
      [bool]$ResolveOnly,
      [string]$Operation,
      [string]$InstallScope
    )

    $state = Get-DesktopMaterialInstallationState
    $architecture = $null
    $release = $null
    $asset = $null
    $targetVersion = $null
    if ($Operation -cne 'Uninstall') {
      $architecture = Get-NativeWindowsArchitecture
      $release = Get-LatestDesktopMaterialRelease
      $targetVersion = Get-DesktopMaterialReleaseVersion -Release $release
      $asset = Get-DesktopMaterialInstallerAsset -Release $release -Architecture $architecture
    }

    $plan = New-DesktopMaterialOperationPlan `
      -Operation $Operation `
      -InstallScope $InstallScope `
      -State $state `
      -Release $release `
      -Asset $asset `
      -Architecture $architecture `
      -TargetVersion $targetVersion

    if ($ResolveOnly) {
      $plan | Add-Member -NotePropertyName Repository -NotePropertyValue $repository
      return $plan
    }

    Assert-DesktopMaterialCurrentUserExecutionContext
    if ($Operation -ceq 'Install') {
      Assert-SquirrelRuntimePrerequisite
    }

    if ($state.IsPartial) {
      throw "Desktop Material has a partial installation at '$($state.Root)'. Repair or remove it interactively before retrying an unattended operation."
    }
    if ($Operation -ceq 'Update' -and -not $state.IsInstalled) {
      throw 'Desktop Material is not installed for the current user; use -Operation Install.'
    }
    if ($Operation -ceq 'Uninstall' -and -not $state.IsInstalled) {
      return [pscustomobject]@{
        Mode             = 'UnattendedRelease'
        Operation        = $Operation
        InstallScope     = $InstallScope
        Silent           = $true
        ProcessExitCode  = 0
        Changed          = $false
        InstallationRoot = $state.Root
        ExecutablePath   = $null
      }
    }

    Assert-DesktopMaterialIsNotRunning -State $state

    if ($Operation -ceq 'Uninstall') {
      Write-Host 'Uninstalling Desktop Material for the current user...'
      $exitCode = Invoke-DesktopMaterialInstallerProcess `
        -FilePath $state.UpdaterPath `
        -Arguments $plan.Arguments `
        -Label 'Desktop Material uninstaller'
      $finalState = Wait-DesktopMaterialInstallationState `
        -ShouldBeInstalled $false `
        -Operation $Operation

      Write-Host 'Desktop Material uninstalled successfully.'
      return [pscustomobject]@{
        Mode             = 'UnattendedRelease'
        Operation        = $Operation
        InstallScope     = $InstallScope
        Silent           = $true
        ProcessExitCode  = $exitCode
        Changed          = $true
        InstallationRoot = $finalState.Root
        ExecutablePath   = $null
      }
    }

    if ($Operation -ceq 'Update') {
      Write-Host "Updating Desktop Material from the exact $($plan.ReleaseTag) release feed..."
      $exitCode = Invoke-DesktopMaterialInstallerProcess `
        -FilePath $state.UpdaterPath `
        -Arguments $plan.Arguments `
        -Label 'Desktop Material updater'
      $finalState = Wait-DesktopMaterialInstallationState `
        -ShouldBeInstalled $true `
        -Operation $Operation `
        -ExpectedVersion $targetVersion

      Write-Host 'Desktop Material update check completed successfully.'
      return [pscustomobject]@{
        Mode             = 'UnattendedRelease'
        Operation        = $Operation
        InstallScope     = $InstallScope
        Silent           = $true
        Architecture     = $architecture
        ReleaseTag       = $plan.ReleaseTag
        TargetVersion    = $targetVersion
        ProcessExitCode  = $exitCode
        InstallationRoot = $finalState.Root
        ExecutablePath   = $finalState.ExecutablePath
      }
    }

    $tag = [string](Get-OptionalPropertyValue -InputObject $release -Name 'tag_name')
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

      $exitCode = Invoke-DesktopMaterialInstallerProcess `
        -FilePath $installerPath `
        -Arguments $plan.Arguments `
        -Label 'Desktop Material installer'
      $finalState = Wait-DesktopMaterialInstallationState `
        -ShouldBeInstalled $true `
        -Operation $Operation `
        -ExpectedVersion $targetVersion

      Write-Host "Desktop Material $($Operation.ToLowerInvariant()) completed successfully."
      return [pscustomobject]@{
        Mode             = 'UnattendedRelease'
        Operation        = $Operation
        InstallScope     = $InstallScope
        Silent           = $true
        Architecture     = $architecture
        ReleaseTag       = $tag
        TargetVersion    = $targetVersion
        AssetName        = $asset.Name
        Sha256           = $asset.Sha256
        ProcessExitCode  = $exitCode
        Changed          = $true
        InstallationRoot = $finalState.Root
        ExecutablePath   = $finalState.ExecutablePath
      }
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
    if ($Operation -cne 'Install') {
      throw '-FromSource cannot be combined with -Operation Update or Uninstall.'
    }
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
      Invoke-DesktopMaterialInstall `
        -ResolveOnly $ResolveOnly `
        -Operation $Operation `
        -InstallScope $InstallScope
    }
  } finally {
    [System.Net.ServicePointManager]::SecurityProtocol = $originalSecurityProtocol
  }
} -ResolveOnly:$ResolveOnly.IsPresent `
  -Operation $Operation `
  -InstallScope $InstallScope `
  -FromSource:$FromSource.IsPresent `
  -SourceDirectory $SourceDirectory `
  -SourceRef $SourceRef `
  -DryRun:$DryRun.IsPresent
