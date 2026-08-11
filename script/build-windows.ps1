[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Build', 'Installer')]
  [string]$Mode,

  [switch]$Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PinnedNodeVersion = '24.15.0'
$PinnedYarnVersion = '1.21.1'
$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$DistDirectory = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot 'dist'))
$IsSilent = $Silent.IsPresent -or $env:SILENT -eq '1'
$OverallStopwatch = [Diagnostics.Stopwatch]::StartNew()
$TargetArchitecture = switch ($env:PROCESSOR_ARCHITECTURE) {
  'ARM64' { 'arm64' }
  'AMD64' { 'x64' }
  default { throw "Unsupported Windows build architecture '$env:PROCESSOR_ARCHITECTURE'. Expected AMD64 or ARM64." }
}

function Write-Phase {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "==> $Message"
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$FailureLabel
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureLabel failed with exit code $LASTEXITCODE."
  }
}

function Invoke-StatusCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  & $FilePath @ArgumentList 2>&1 | ForEach-Object { Write-Host $_ }
  return [int]$LASTEXITCODE
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($userPath, $machinePath, $env:Path) | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
  }
  $env:Path = $parts -join [IO.Path]::PathSeparator
}

function Test-NodeVersion {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  try {
    $version = (& $NodePath --version 2>$null).TrimStart('v').Trim()
    return $LASTEXITCODE -eq 0 -and $version -eq $PinnedNodeVersion
  } catch {
    return $false
  }
}

function Install-PortableNode {
  $architecture = switch ($env:PROCESSOR_ARCHITECTURE) {
    'ARM64' { 'arm64' }
    default { 'x64' }
  }
  $archiveName = "node-v$PinnedNodeVersion-win-$architecture.zip"
  $toolchainRoot = Join-Path $env:LOCALAPPDATA 'DesktopMaterial\toolchain'
  $versionRoot = Join-Path $toolchainRoot "node-v$PinnedNodeVersion-win-$architecture"
  $nodePath = Join-Path $versionRoot 'node.exe'
  if (Test-Path -LiteralPath $nodePath -PathType Leaf) {
    if (Test-NodeVersion -NodePath $nodePath) {
      return $nodePath
    }
    throw "The cached Node executable at '$nodePath' is not version $PinnedNodeVersion. Remove that bounded cache directory and run this script again."
  }

  New-Item -ItemType Directory -Force -Path $toolchainRoot | Out-Null
  $downloadRoot = Join-Path $toolchainRoot "download-node-$PinnedNodeVersion-$architecture"
  New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
  $archivePath = Join-Path $downloadRoot $archiveName
  $checksumsPath = Join-Path $downloadRoot 'SHASUMS256.txt'
  $baseUrl = "https://nodejs.org/dist/v$PinnedNodeVersion"

  Write-Phase "Downloading canonical Node.js $PinnedNodeVersion portable archive"
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archivePath
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt" -OutFile $checksumsPath
  $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object {
    $_ -match [regex]::Escape($archiveName) + '$'
  }
  if (@($checksumLine).Count -ne 1) {
    throw "Node.js did not publish exactly one checksum for $archiveName."
  }
  $expectedHash = (($checksumLine -split '\s+')[0]).ToLowerInvariant()
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedHash -ne $actualHash) {
    throw "Node.js archive checksum mismatch: expected $expectedHash, received $actualHash."
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $toolchainRoot -Force
  if (-not (Test-NodeVersion -NodePath $nodePath)) {
    throw "Canonical Node.js $PinnedNodeVersion extracted, but '$nodePath' is missing or reports another version."
  }
  return $nodePath
}

function Resolve-PinnedNode {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -ne $nodeCommand -and (Test-NodeVersion -NodePath $nodeCommand.Source)) {
    Write-Phase "Using Node.js $PinnedNodeVersion at $($nodeCommand.Source)"
    return $nodeCommand.Source
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($null -ne $winget) {
    Write-Phase "Installing Node.js $PinnedNodeVersion from the canonical winget package"
    $wingetExit = Invoke-StatusCommand -FilePath $winget.Source -ArgumentList @(
      'install', '--id', 'OpenJS.NodeJS', '--exact', '--version',
      $PinnedNodeVersion, '--scope', 'user', '--silent',
      '--accept-package-agreements', '--accept-source-agreements',
      '--disable-interactivity'
    )
    Refresh-ProcessPath
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($wingetExit -eq 0 -and $null -ne $nodeCommand -and (Test-NodeVersion -NodePath $nodeCommand.Source)) {
      return $nodeCommand.Source
    }
    Write-Warning "winget did not provide Node.js $PinnedNodeVersion (exit $wingetExit); using the canonical portable distribution."
  } else {
    Write-Warning 'winget is unavailable; using the canonical portable Node.js distribution.'
  }

  $portableNode = Install-PortableNode
  $env:Path = "$(Split-Path -Parent $portableNode)$([IO.Path]::PathSeparator)$env:Path"
  return $portableNode
}

function Resolve-VendoredYarn {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $candidates = @(
    (Join-Path $RepositoryRoot '.yarn\releases\yarn-1.21.1.js'),
    (Join-Path $RepositoryRoot '.yarn\releases\yarn-1.21.1.cjs'),
    (Join-Path $RepositoryRoot 'vendor\yarn-1.21.1.js'),
    (Join-Path $RepositoryRoot 'script\yarn-1.21.1.js'),
    (Join-Path $RepositoryRoot 'app\node_modules\yarn\bin\yarn.js')
  )
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    $version = (& $NodePath $candidate --version 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $version -eq $PinnedYarnVersion) {
      Write-Phase "Using vendored Yarn $PinnedYarnVersion at $candidate"
      return $candidate
    }
  }
  throw "Vendored Yarn $PinnedYarnVersion was not found at any supported repository path. Restore the repository's pinned Yarn entrypoint before building."
}

function Find-VsWhere {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe')
  )
  return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

function Find-VsBuildTools {
  $vswhere = Find-VsWhere
  if ([string]::IsNullOrWhiteSpace($vswhere)) {
    return $null
  }
  $installationPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) {
    return $null
  }
  return $installationPath
}

function Assert-VsDeveloperCommands {
  param([Parameter(Mandatory = $true)][string]$InstallationPath)

  $vsDevCmdPath = Join-Path $InstallationPath 'Common7\Tools\VsDevCmd.bat'
  if (-not (Test-Path -LiteralPath $vsDevCmdPath -PathType Leaf)) {
    throw "Visual Studio installation '$InstallationPath' is missing required developer command '$vsDevCmdPath'."
  }
  $vcVarsPath = Join-Path $InstallationPath 'VC\Auxiliary\Build\vcvarsall.bat'
  if (-not (Test-Path -LiteralPath $vcVarsPath -PathType Leaf)) {
    throw "Visual Studio installation '$InstallationPath' is missing required compiler environment command '$vcVarsPath'."
  }
}

function Ensure-VsBuildTools {
  $installationPath = Find-VsBuildTools
  if (-not [string]::IsNullOrWhiteSpace($installationPath)) {
    Assert-VsDeveloperCommands -InstallationPath $installationPath
    Write-Phase "Using Visual Studio Build Tools 2022 at $installationPath"
    $env:GYP_MSVS_VERSION = '2022'
    $env:npm_config_msvs_version = '2022'
    return [string]$installationPath
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($null -eq $winget) {
    throw 'Visual Studio Build Tools 2022 with Microsoft.VisualStudio.Workload.VCTools is missing, and winget.exe is unavailable for the canonical unattended install.'
  }

  Write-Phase 'Installing Visual Studio Build Tools 2022 with the C++ workload'
  $override = '--wait --quiet --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
  $installExit = Invoke-StatusCommand -FilePath $winget.Source -ArgumentList @(
    'install', '--id', 'Microsoft.VisualStudio.2022.BuildTools', '--exact',
    '--silent', '--accept-package-agreements', '--accept-source-agreements',
    '--disable-interactivity', '--override', $override
  )
  Refresh-ProcessPath
  $installationPath = Find-VsBuildTools
  if ($installExit -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) {
    throw "Visual Studio Build Tools 2022 C++ workload installation failed with exit code $installExit. Required component: Microsoft.VisualStudio.Component.VC.Tools.x86.x64."
  }
  Assert-VsDeveloperCommands -InstallationPath $installationPath
  $env:GYP_MSVS_VERSION = '2022'
  $env:npm_config_msvs_version = '2022'
  return [string]$installationPath
}

function Remove-BoundedBuildOutput {
  if (-not (Test-Path -LiteralPath $DistDirectory)) {
    return
  }
  $resolvedRoot = $RepositoryRoot.TrimEnd('\') + '\'
  if (-not $DistDirectory.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $DistDirectory) -ne 'dist') {
    throw "Refusing to clear unexpected build-output path '$DistDirectory'."
  }
  Write-Phase "Clearing stale build output at $DistDirectory"
  Remove-Item -LiteralPath $DistDirectory -Recurse -Force
}

function Find-PackagedApplication {
  param([Parameter(Mandatory = $true)][datetime]$NotBefore)

  $freshnessFloor = $NotBefore.AddSeconds(-2)
  $unpackedSentinelNames = @(
    'package.json',
    'main.js',
    'renderer.js',
    'crash.js',
    'quick-action.js'
  )
  $roots = @($DistDirectory, (Join-Path $RepositoryRoot 'app\dist')) | Where-Object {
    Test-Path -LiteralPath $_ -PathType Container
  }
  foreach ($root in $roots) {
    $executables = Get-ChildItem -LiteralPath $root -Filter GitHubDesktop.exe -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending
    foreach ($executable in $executables) {
      if ($executable.Length -le 0 -or $executable.LastWriteTimeUtc -lt $freshnessFloor) {
        continue
      }

      $asar = Join-Path $executable.DirectoryName 'resources\app.asar'
      if (Test-Path -LiteralPath $asar -PathType Leaf) {
        $asarPayload = Get-Item -LiteralPath $asar
        if ($asarPayload.Length -gt 0 -and $asarPayload.LastWriteTimeUtc -ge $freshnessFloor) {
          return [pscustomobject]@{
            Executable = $executable
            Payload = $asarPayload
            PayloadSentinels = @($asarPayload)
          }
        }
      }

      $unpackedPayloadPath = Join-Path $executable.DirectoryName 'resources\app'
      if (-not (Test-Path -LiteralPath $unpackedPayloadPath -PathType Container)) {
        continue
      }
      $unpackedPayload = Get-Item -LiteralPath $unpackedPayloadPath
      if ($unpackedPayload.LastWriteTimeUtc -lt $freshnessFloor) {
        continue
      }
      $unpackedSentinels = @()
      foreach ($name in $unpackedSentinelNames) {
        $sentinelPath = Join-Path $unpackedPayloadPath $name
        if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) {
          $unpackedSentinels = @()
          break
        }
        $sentinel = Get-Item -LiteralPath $sentinelPath
        if ($sentinel.Length -le 0) {
          $unpackedSentinels = @()
          break
        }
        $unpackedSentinels += $sentinel
      }
      if ($unpackedSentinels.Count -eq $unpackedSentinelNames.Count) {
        return [pscustomobject]@{
          Executable = $executable
          Payload = $unpackedPayload
          PayloadSentinels = $unpackedSentinels
        }
      }
    }
  }
  throw 'Packaging completed without a fresh, nonempty GitHubDesktop.exe and either a fresh nonempty resources\app.asar or a complete fresh unpacked resources\app payload. The build is not runnable.'
}

function Get-OneFreshArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$Filter,
    [Parameter(Mandatory = $true)][datetime]$NotBefore,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $matches = @(Get-ChildItem -LiteralPath $DistDirectory -Filter $Filter -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -ge $NotBefore.AddSeconds(-2) } |
    Sort-Object FullName)
  if ($matches.Count -ne 1) {
    throw "$Description requires exactly one fresh '$Filter' artifact under '$DistDirectory'; found $($matches.Count)."
  }
  return $matches[0]
}

function Assert-NotSigned {
  param([Parameter(Mandatory = $true)][IO.FileInfo]$File)

  $signature = Get-AuthenticodeSignature -LiteralPath $File.FullName
  if ($signature.Status -ne [Management.Automation.SignatureStatus]::NotSigned) {
    throw "Code signing is prohibited: '$($File.FullName)' reported $($signature.Status) instead of NotSigned."
  }
  Write-Host "Unsigned verified: $($File.FullName)"
}

function Write-ArtifactReceipt {
  param([Parameter(Mandatory = $true)][IO.FileInfo]$File)

  $hash = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Artifact: $($File.FullName)"
  Write-Host "Size: $($File.Length) bytes"
  Write-Host "SHA256: $hash"
}

function Write-ApplicationReceipt {
  param([Parameter(Mandatory = $true)][pscustomobject]$Application)

  Write-ArtifactReceipt -File $Application.Executable
  Write-Host "Payload: $($Application.Payload.FullName)"
  foreach ($sentinel in $Application.PayloadSentinels) {
    Write-ArtifactReceipt -File $sentinel
  }
}

function Ensure-ManifestPackageAlias {
  param(
    [Parameter(Mandatory = $true)][IO.FileInfo]$Releases,
    [Parameter(Mandatory = $true)][IO.FileInfo]$ArchitecturePackage,
    [Parameter(Mandatory = $true)][datetime]$NotBefore
  )

  $entries = @(Get-Content -LiteralPath $Releases.FullName | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
  })
  if ($entries.Count -lt 1) {
    throw "Squirrel RELEASES manifest '$($Releases.FullName)' contains no package entry."
  }
  $fields = @($entries[0] -split '\s+')
  if ($fields.Count -ne 3) {
    throw "Squirrel RELEASES manifest '$($Releases.FullName)' has an unreadable first entry."
  }
  $aliasName = $fields[1]
  if ($aliasName -notmatch '^[^\\/]+-full\.nupkg$') {
    throw "Squirrel RELEASES manifest names an unsafe or non-full package alias '$aliasName'."
  }
  $aliasPath = Join-Path $DistDirectory $aliasName
  if (-not (Test-Path -LiteralPath $aliasPath -PathType Leaf)) {
    Copy-Item -LiteralPath $ArchitecturePackage.FullName -Destination $aliasPath
  }
  $alias = Get-Item -LiteralPath $aliasPath
  if ($alias.Length -le 0 -or $alias.LastWriteTimeUtc -lt $NotBefore.AddSeconds(-2)) {
    throw "Squirrel manifest package alias '$aliasPath' is empty or stale."
  }
  return $alias
}

function Ensure-PrintenvzExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$VisualStudioInstallationPath
  )

  $packageRoot = Join-Path $RepositoryRoot 'node_modules\printenvz'
  $executablePath = Join-Path $packageRoot 'build\Release\printenvz.exe'
  if (Test-Path -LiteralPath $executablePath -PathType Leaf) {
    $executable = Get-Item -LiteralPath $executablePath
    if ($executable.Length -gt 0) {
      Write-Phase "Reusing native printenvz prerequisite at $executablePath"
      return
    }
  }

  $buildScript = Join-Path $packageRoot 'build.mjs'
  if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
    throw "printenvz native prerequisite is missing, and its rebuild entrypoint was not installed: '$buildScript'."
  }

  Write-Phase 'Rebuilding the missing native printenvz prerequisite'
  $previousMsvsVersion =
    [Environment]::GetEnvironmentVariable('npm_config_msvs_version', 'Process')
  try {
    $env:npm_config_msvs_version = $VisualStudioInstallationPath
    Invoke-Checked -FilePath $NodePath -ArgumentList @($buildScript, '--rebuild') -FailureLabel 'printenvz native rebuild'
  } finally {
    [Environment]::SetEnvironmentVariable(
      'npm_config_msvs_version',
      $previousMsvsVersion,
      'Process'
    )
  }
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "printenvz rebuild completed without creating '$executablePath'."
  }
  $executable = Get-Item -LiteralPath $executablePath
  if ($executable.Length -le 0) {
    throw "printenvz rebuild created an empty executable at '$executablePath'."
  }
  Write-Host "Native prerequisite ready: $executablePath"
}

function Get-RepositoryCommit {
  $git = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($null -eq $git) {
    throw 'git.exe is required to identify the source commit but was not found after PATH refresh.'
  }
  $commit = (& $git.Source -C $RepositoryRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
    throw 'Unable to resolve the exact source commit for this build.'
  }
  return $commit
}

$managedEnvironmentNames = @(
  'Path',
  'GYP_MSVS_VERSION',
  'npm_config_msvs_version',
  'npm_config_arch',
  'TARGET_ARCH',
  'NODE_ENV',
  'YARN_PRODUCTION',
  'npm_config_production',
  'WINDOWS_SIGNING_ENABLED',
  'CSC_IDENTITY_AUTO_DISCOVERY',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET'
)
$originalProcessEnvironment = @{}
foreach ($name in $managedEnvironmentNames) {
  $originalProcessEnvironment[$name] =
    [Environment]::GetEnvironmentVariable($name, 'Process')
}
$exitCode = 0

try {
  Write-Phase "Starting Desktop Material $Mode path"
  $nodeResult = @(Resolve-PinnedNode)
  if ($nodeResult.Count -ne 1 -or $nodeResult[0] -isnot [string]) {
    throw "Node resolver must return exactly one path string; received $($nodeResult.Count) success-stream values."
  }
  [string]$node = $nodeResult[0]
  Refresh-ProcessPath
  $vsInstallationResult = @(Ensure-VsBuildTools)
  if (
    $vsInstallationResult.Count -ne 1 -or
    $vsInstallationResult[0] -isnot [string]
  ) {
    throw "Visual Studio resolver must return exactly one installation path string; received $($vsInstallationResult.Count) success-stream values."
  }
  [string]$vsInstallationPath = $vsInstallationResult[0]
  $yarn = Resolve-VendoredYarn -NodePath $node

  Push-Location $RepositoryRoot
  try {
    Remove-BoundedBuildOutput
    $env:npm_config_arch = $TargetArchitecture
    $env:TARGET_ARCH = $TargetArchitecture
    $env:NODE_ENV = 'development'
    $env:YARN_PRODUCTION = 'false'
    $env:npm_config_production = 'false'
    Write-Phase 'Installing exact dependencies from the frozen lockfile'
    Invoke-Checked -FilePath $node -ArgumentList @($yarn, 'install', '--frozen-lockfile', '--non-interactive', '--production=false') -FailureLabel 'Frozen dependency installation'

    Ensure-PrintenvzExecutable -NodePath $node -VisualStudioInstallationPath $vsInstallationPath
    $env:NODE_ENV = 'production'
    $env:WINDOWS_SIGNING_ENABLED = 'false'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    $env:CSC_LINK = ''
    $env:CSC_KEY_PASSWORD = ''
    $env:WIN_CSC_LINK = ''
    $env:WIN_CSC_KEY_PASSWORD = ''
    $env:AZURE_TENANT_ID = ''
    $env:AZURE_CLIENT_ID = ''
    $env:AZURE_CLIENT_SECRET = ''

    $buildStartedAt = [datetime]::UtcNow
    Write-Phase 'Building the production renderer and runnable app with every signing input cleared or disabled'
    Invoke-Checked -FilePath $node -ArgumentList @($yarn, 'build:prod') -FailureLabel 'Production build'

    $application = Find-PackagedApplication -NotBefore $buildStartedAt
    Assert-NotSigned -File $application.Executable
    Write-ApplicationReceipt -Application $application

    $commit = Get-RepositoryCommit
    Write-Host "Commit: $commit"

    if ($Mode -eq 'Installer') {
      $packageStartedAt = [datetime]::UtcNow
      Write-Phase 'Building unsigned Squirrel.Windows artifacts from the packaged app'
      Invoke-Checked -FilePath $node -ArgumentList @($yarn, 'package') -FailureLabel 'Unsigned installer packaging'

      $setup = Get-OneFreshArtifact -Filter "GitHubDesktopSetup-$TargetArchitecture.exe" -NotBefore $packageStartedAt -Description 'Setup executable'
      $msi = Get-OneFreshArtifact -Filter "GitHubDesktopSetup-$TargetArchitecture.msi" -NotBefore $packageStartedAt -Description 'Setup MSI'
      $releases = Get-OneFreshArtifact -Filter 'RELEASES' -NotBefore $packageStartedAt -Description 'Squirrel RELEASES manifest'
      $releaseVersion = (Get-Content -LiteralPath (Join-Path $RepositoryRoot 'app\package.json') -Raw | ConvertFrom-Json).version
      if ([string]::IsNullOrWhiteSpace($releaseVersion)) {
        throw 'app\package.json did not provide an installer version.'
      }
      $fullPackage = Get-OneFreshArtifact -Filter "GitHubDesktop-$releaseVersion-$TargetArchitecture-full.nupkg" -NotBefore $packageStartedAt -Description 'Architecture-qualified full Squirrel package'
      $manifestAlias = Ensure-ManifestPackageAlias -Releases $releases -ArchitecturePackage $fullPackage -NotBefore $packageStartedAt
      $manifestVerifier = Join-Path $RepositoryRoot 'script\verify-releases-manifest.js'
      if (-not (Test-Path -LiteralPath $manifestVerifier -PathType Leaf)) {
        throw "Release manifest verifier is missing: '$manifestVerifier'."
      }
      Invoke-Checked -FilePath $node -ArgumentList @($manifestVerifier, $releases.FullName, $DistDirectory) -FailureLabel 'Squirrel RELEASES manifest verification'
      Assert-NotSigned -File $setup
      Assert-NotSigned -File $msi
      foreach ($artifact in @($setup, $msi, $releases, $fullPackage, $manifestAlias)) {
        Write-ArtifactReceipt -File $artifact
      }
      Write-Host 'Installer result: unsigned Squirrel.Windows artifacts verified. This script did not publish, tag, or upload anything.'
    } elseif (-not $IsSilent) {
      $answer = Read-Host "Run '$($application.Executable.FullName)' now? [y/N]"
      if ($answer -match '^(?i:y|yes)$') {
        Start-Process -FilePath $application.Executable.FullName -WorkingDirectory $application.Executable.DirectoryName
      }
    }
  } finally {
    Pop-Location
  }

  $OverallStopwatch.Stop()
  Write-Host ("Completed in {0:hh\:mm\:ss}." -f $OverallStopwatch.Elapsed)
} catch {
  $OverallStopwatch.Stop()
  Write-Error ("Build failed after {0:hh\:mm\:ss}: {1}" -f $OverallStopwatch.Elapsed, $_.Exception.Message)
  $exitCode = 1
} finally {
  foreach ($name in $managedEnvironmentNames) {
    [Environment]::SetEnvironmentVariable(
      $name,
      $originalProcessEnvironment[$name],
      'Process'
    )
  }
}

exit $exitCode
