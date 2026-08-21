[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Prepare', 'Build', 'Installer')]
  [string]$Mode,

  [switch]$Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$DependencyManifestPath = Join-Path $RepositoryRoot 'script\windows-dependency-manifest.json'
$IsSilent = $Silent.IsPresent -or $env:SILENT -eq '1'

function Write-Phase {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "==> $Message"
}

function Test-IsAdministrator {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Ensure-InteractiveElevation {
  if (Test-IsAdministrator) {
    return
  }

  if ($IsSilent) {
    Write-Warning 'Silent mode is not elevated; continuing without an elevation prompt.'
    return
  }

  $hostProcess = Get-Process -Id $PID -ErrorAction Stop
  $hostPath = [string]$hostProcess.Path
  if ([string]::IsNullOrWhiteSpace($hostPath)) {
    $hostPath = [string]$hostProcess.MainModule.FileName
  }
  if ([string]::IsNullOrWhiteSpace($hostPath)) {
    throw 'Interactive elevation is required, but the current PowerShell executable path could not be resolved.'
  }

  $quotedScriptPath = '"' + $PSCommandPath + '"'
  $childArguments = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $quotedScriptPath,
    '-Mode',
    $Mode
  )
  Write-Phase 'Interactive mode is not elevated; requesting one administrator launch before dependency preparation.'
  try {
    $elevated = Start-Process -FilePath $hostPath -Verb RunAs -Wait -PassThru -ArgumentList $childArguments
  } catch {
    throw "Interactive elevation was not completed: $($_.Exception.Message)"
  }
  if ($null -eq $elevated) {
    throw 'Interactive elevation did not return a child process result.'
  }
  exit $elevated.ExitCode
}

Ensure-InteractiveElevation

if (-not (Test-Path -LiteralPath $DependencyManifestPath -PathType Leaf)) {
  throw "The pinned Windows dependency manifest is missing: '$DependencyManifestPath'."
}
$DependencyManifest = Get-Content -LiteralPath $DependencyManifestPath -Raw | ConvertFrom-Json
$PinnedNodeVersion = [string]$DependencyManifest.node.version
$PinnedYarnVersion = [string]$DependencyManifest.yarn.version
if ($PinnedNodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $PinnedYarnVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw 'The pinned Windows dependency manifest contains an invalid Node.js or Yarn version.'
}
$DistDirectory = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot 'dist'))
$OverallStopwatch = [Diagnostics.Stopwatch]::StartNew()
$TargetArchitecture = switch ($env:PROCESSOR_ARCHITECTURE) {
  'ARM64' { 'arm64' }
  'AMD64' { 'x64' }
  default { throw "Unsupported Windows build architecture '$env:PROCESSOR_ARCHITECTURE'. Expected AMD64 or ARM64." }
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
  <#
    .SYNOPSIS
      Pick up PATH entries written by an installer, without growing PATH.

    .DESCRIPTION
      The process PATH already contains the machine and user entries it was
      started with, so appending both again duplicates every one of them. This
      function is called more than once per build, and each call roughly
      doubled the string.

      That is not merely untidy. Windows hands a child process its environment
      as one block, and `cmd.exe` will not carry an oversized one: entries fall
      off the end. Yarn runs package install scripts through `cmd`, those
      scripts invoke `node` by name, and the symptom is

        'node' is not recognized as an internal or external command

      on a machine where node is installed, on PATH, and runnable from any
      other shell — which sends the reader looking for a missing Node rather
      than an overfull PATH.

      Entries are therefore deduplicated, case-insensitively as Windows
      compares them, keeping first occurrence so precedence is preserved.
  #>
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $separator = [IO.Path]::PathSeparator
  $seen = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  $ordered = [Collections.Generic.List[string]]::new()

  foreach ($source in @($env:Path, $userPath, $machinePath)) {
    if ([string]::IsNullOrWhiteSpace($source)) {
      continue
    }
    foreach ($entry in $source -split [regex]::Escape($separator)) {
      $trimmed = $entry.Trim().TrimEnd('\')
      if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
      }
      if ($seen.Add($trimmed)) {
        $ordered.Add($trimmed)
      }
    }
  }

  $env:Path = $ordered -join $separator
}

function Test-NodeVersion {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  try {
    $versionOutput = @(& $NodePath --version 2>$null)
    if (
      $LASTEXITCODE -ne 0 -or
      $versionOutput.Count -ne 1 -or
      [string]::IsNullOrWhiteSpace([string]$versionOutput[0])
    ) {
      return $false
    }
    $version = ([string]$versionOutput[0]).TrimStart('v').Trim()
    return $version -eq $PinnedNodeVersion
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
  $nodeArchive = $DependencyManifest.node.archives.$architecture
  if ($null -eq $nodeArchive) {
    throw "The pinned Windows dependency manifest has no Node.js archive for '$architecture'."
  }
  $baseUrl = [string]$nodeArchive.url
  $expectedHash = ([string]$nodeArchive.sha256).ToLowerInvariant()
  $archiveUrlName = [IO.Path]::GetFileName(([Uri]$baseUrl).AbsolutePath)
  if (
    $baseUrl -notmatch '^https://nodejs\.org/' -or
    $archiveUrlName -ne $archiveName -or
    $expectedHash -notmatch '^[0-9a-f]{64}$'
  ) {
    throw "The pinned Node.js manifest entry for '$architecture' must use a canonical HTTPS URL and a 64-character SHA-256 digest."
  }

  Write-Phase "Downloading canonical Node.js $PinnedNodeVersion portable archive"
  Invoke-WebRequest -UseBasicParsing -Uri $baseUrl -OutFile $archivePath | Out-Null
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedHash -ne $actualHash) {
    throw "Node.js archive checksum mismatch: expected $expectedHash, received $actualHash."
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $toolchainRoot -Force | Out-Null
  if (-not (Test-NodeVersion -NodePath $nodePath)) {
    throw "Canonical Node.js $PinnedNodeVersion extracted, but '$nodePath' is missing or reports another version."
  }
  return $nodePath
}

function Add-NodeToProcessPath {
  <#
    .SYNOPSIS
      Put the resolved Node.js first on this process's PATH.

    .DESCRIPTION
      Knowing where node.exe lives is not the same as node being runnable, and
      the difference is invisible until something else needs it. This script
      invokes yarn through the resolved binary, so yarn itself always works —
      but yarn spawns package install scripts, and those run `node` by name.
      With node absent from PATH they fail with

        'node' is not recognized as an internal or external command

      which reads as a machine with no Node at all, on a machine that has just
      finished installing it. Only the portable fallback used to prepend, so a
      host that already had a usable node, or got one from winget, hit this.
  #>
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $nodeDirectory = Split-Path -Parent $NodePath
  $separator = [IO.Path]::PathSeparator
  $existing = $env:Path -split [regex]::Escape($separator)
  if ($existing -notcontains $nodeDirectory) {
    $env:Path = "$nodeDirectory$separator$env:Path"
  }
  return $NodePath
}

function Resolve-PinnedNode {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -ne $nodeCommand -and (Test-NodeVersion -NodePath $nodeCommand.Source)) {
    Write-Phase "Using Node.js $PinnedNodeVersion at $($nodeCommand.Source)"
    return (Add-NodeToProcessPath -NodePath $nodeCommand.Source)
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
      return (Add-NodeToProcessPath -NodePath $nodeCommand.Source)
    }
    Write-Warning "winget did not provide Node.js $PinnedNodeVersion (exit $wingetExit); using the canonical portable distribution."
  } else {
    Write-Warning 'winget is unavailable; using the canonical portable Node.js distribution.'
  }

  $portableNode = Install-PortableNode
  return (Add-NodeToProcessPath -NodePath $portableNode)
}

function Resolve-VendoredYarn {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $manifestYarnPath = [string]$DependencyManifest.yarn.path
  if ([string]::IsNullOrWhiteSpace($manifestYarnPath)) {
    throw 'The pinned Windows dependency manifest is missing the vendored Yarn path.'
  }
  $candidates = @(
    (Join-Path $RepositoryRoot ($manifestYarnPath -replace '/', '\')),
    (Join-Path $RepositoryRoot ".yarn\releases\yarn-$PinnedYarnVersion.js"),
    (Join-Path $RepositoryRoot ".yarn\releases\yarn-$PinnedYarnVersion.cjs"),
    (Join-Path $RepositoryRoot "script\yarn-$PinnedYarnVersion.js"),
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
  $jsonOutput = @(& $vswhere -all -products '*' -format json)
  if (
    $LASTEXITCODE -ne 0 -or
    $jsonOutput.Count -eq 0
  ) {
    return $null
  }
  try {
    $instances = (($jsonOutput -join [Environment]::NewLine) | ConvertFrom-Json)
  } catch {
    return $null
  }
  foreach ($instance in @($instances)) {
    $installationPath = ([string]$instance.installationPath).Trim()
    if ([string]::IsNullOrWhiteSpace($installationPath) -or -not (Test-Path -LiteralPath $installationPath -PathType Container)) {
      continue
    }
    try {
      Assert-VsDeveloperCommands -InstallationPath $installationPath
      return $installationPath
    } catch {
      continue
    }
  }
  return $null
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
  $compilerRoot = Join-Path $InstallationPath 'VC\Tools\MSVC'
  $compiler = Get-ChildItem -LiteralPath $compilerRoot -Filter 'cl.exe' -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object -Property FullName -Descending |
    Select-Object -First 1
  if ($null -eq $compiler) {
    throw "Visual Studio installation '$InstallationPath' is missing a usable cl.exe compiler under '$compilerRoot'."
  }
  $compilerOutput = @(& $compiler.FullName '/?' 2>$null)
  if ($LASTEXITCODE -ne 0 -or $compilerOutput.Count -eq 0) {
    throw "Visual Studio installation '$InstallationPath' has a cl.exe compiler that could not be executed."
  }
}

function Set-VsBuildEnvironment {
  <#
    .SYNOPSIS
      Point every native build at the Visual Studio installation that was found.

    .DESCRIPTION
      `npm_config_msvs_version` is read as two different things by two
      different consumers, which is not this repository's decision to make.
      node-gyp reads it as a version — `2022` — while the bundled `printenvz`
      build reads the same variable as an installation PATH and joins
      `Common7\Tools\VsDevCmd.bat` onto it. Given the literal string `2022`
      it looks for that batch file under a directory called `2022`, does not
      find one, and fails with

        Visual Studio developer command was not found under 2022

      which names the value rather than the variable and reads as a missing
      Visual Studio. The installation is present; it is simply not called 2022.
      On this host it is Visual Studio 18, which is exactly the case a
      hard-coded year cannot survive.

      So the path goes in the variable that is used as a path, and the version
      stays in `GYP_MSVS_VERSION`, which node-gyp reads and which is the
      variable that actually means a version. This is what the script's own
      printenvz rebuild already did for that one call; doing it in one place
      makes the whole build agree.
  #>
  param([Parameter(Mandatory = $true)][string]$InstallationPath)

  $env:GYP_MSVS_VERSION = '2022'
  $env:npm_config_msvs_version = $InstallationPath
}

function Ensure-VsBuildTools {
  $visualStudio = $DependencyManifest.visualStudioBuildTools
  if (
    [string]::IsNullOrWhiteSpace([string]$visualStudio.packageId) -or
    [string]::IsNullOrWhiteSpace([string]$visualStudio.workload) -or
    [string]::IsNullOrWhiteSpace([string]$visualStudio.requiredComponent)
  ) {
    throw 'The pinned Windows dependency manifest is missing the Visual Studio package, workload, or required component.'
  }
  $installationPath = Find-VsBuildTools
  if (-not [string]::IsNullOrWhiteSpace($installationPath)) {
    Assert-VsDeveloperCommands -InstallationPath $installationPath
    Write-Phase "Using Visual Studio installation at $installationPath"
    Set-VsBuildEnvironment -InstallationPath $installationPath
    return [string]$installationPath
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($null -eq $winget) {
    throw "Visual Studio Build Tools package $($visualStudio.packageId) with $($visualStudio.workload) is missing, and winget.exe is unavailable for the canonical unattended install."
  }

  Write-Phase 'Installing Visual Studio Build Tools 2022 with the C++ workload'
  $override = "--wait --quiet --norestart --nocache --add $($visualStudio.workload) --includeRecommended"
  $installExit = Invoke-StatusCommand -FilePath $winget.Source -ArgumentList @(
    'install', '--id', [string]$visualStudio.packageId, '--exact',
    '--silent', '--accept-package-agreements', '--accept-source-agreements',
    '--disable-interactivity', '--override', $override
  )
  Refresh-ProcessPath
  $installationPath = Find-VsBuildTools
  if ($installExit -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) {
    throw "Visual Studio Build Tools 2022 C++ workload installation failed with exit code $installExit. Required component: $($visualStudio.requiredComponent)."
  }
  Assert-VsDeveloperCommands -InstallationPath $installationPath
  Set-VsBuildEnvironment -InstallationPath $installationPath
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
    Where-Object {
      $_.Length -gt 0 -and
      $_.LastWriteTimeUtc -ge $NotBefore.AddSeconds(-2)
    } |
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

function Test-CurrentNativeOutputs {
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string[]]$OutputPaths,
    [string[]]$IgnoredSourceNames = @(),
    [int]$FreshnessToleranceMilliseconds = 0
  )

  if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
    return $false
  }
  $sourceFiles = @(
    Get-ChildItem -LiteralPath $SourceRoot -File -Recurse |
      Where-Object { $_.Name -notin $IgnoredSourceNames }
  )
  if (
    $sourceFiles.Count -eq 0 -or
    @(
      $sourceFiles | Where-Object {
        ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
      }
    ).Count -gt 0
  ) {
    return $false
  }
  $latestSource = $sourceFiles |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  $freshnessFloor = $latestSource.LastWriteTimeUtc.AddMilliseconds(
    -$FreshnessToleranceMilliseconds
  )
  foreach ($outputPath in $OutputPaths) {
    if (-not (Test-Path -LiteralPath $outputPath -PathType Leaf)) {
      return $false
    }
    $output = Get-Item -LiteralPath $outputPath
    if (
      $output.Length -le 0 -or
      ($output.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      $output.LastWriteTimeUtc -lt $freshnessFloor
    ) {
      return $false
    }
  }
  return $true
}

function Test-WindowsArgvParserInputsMatch {
  $sourceRoot = Join-Path $RepositoryRoot 'vendor\windows-argv-parser'
  $installedRoot = Join-Path $RepositoryRoot 'app\node_modules\windows-argv-parser'
  foreach ($name in @(
    'binding.gyp',
    'index.ts',
    'main.cc',
    'package.json',
    'tsconfig.json'
  )) {
    $sourcePath = Join-Path $sourceRoot $name
    $installedPath = Join-Path $installedRoot $name
    if (
      -not (Test-Path -LiteralPath $sourcePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $installedPath -PathType Leaf)
    ) {
      return $false
    }
    $source = Get-Item -LiteralPath $sourcePath
    $installed = Get-Item -LiteralPath $installedPath
    if (
      ($source.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      ($installed.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $installedPath -Algorithm SHA256).Hash
    ) {
      return $false
    }
  }
  return $true
}

function Test-WindowsArgvParserRuntime {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $packageRoot = Join-Path $RepositoryRoot 'app\node_modules\windows-argv-parser'
  $probe = @'
const parser = require(process.argv[1])
const actual = parser.parseCommandLineArgv('alpha "beta gamma"')
if (JSON.stringify(actual) !== '["alpha","beta gamma"]') process.exit(1)
'@
  try {
    & $NodePath -e $probe $packageRoot *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-WindowsArgvParserAddon {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$AddonPath
  )

  $probe = @'
const parser = require(process.argv[1])
const actual = parser.parseCommandLineArgv('alpha "beta gamma"')
if (JSON.stringify(actual) !== '["alpha","beta gamma"]') process.exit(1)
'@
  try {
    & $NodePath -e $probe $AddonPath *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function New-WindowsArgvParserRecoverySnapshot {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $sourceRoot = Join-Path $RepositoryRoot 'vendor\windows-argv-parser'
  $cachedAddon = Join-Path $RepositoryRoot 'out\windows-argv-parser.node'
  if (
    -not (
      Test-CurrentNativeOutputs `
        -SourceRoot $sourceRoot `
        -OutputPaths @($cachedAddon)
    ) -or
    -not (
      Test-WindowsArgvParserAddon `
        -NodePath $NodePath `
        -AddonPath $cachedAddon
    )
  ) {
    return $null
  }

  $snapshotPath = Join-Path ([IO.Path]::GetTempPath()) (
    "desktop-material-windows-argv-parser-$PID-$([guid]::NewGuid().ToString('N')).node"
  )
  Copy-Item -LiteralPath $cachedAddon -Destination $snapshotPath
  $snapshot = Get-Item -LiteralPath $snapshotPath
  if (
    $snapshot.Length -le 0 -or
    ($snapshot.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    Remove-Item -LiteralPath $snapshotPath -Force -ErrorAction SilentlyContinue
    return $null
  }
  $hash = (Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash
  Write-Phase 'Preserved the verified windows-argv-parser recovery input across output cleanup and dependency installation'
  return [pscustomobject]@{
    Path = $snapshotPath
    Hash = $hash
  }
}

function Restore-WindowsArgvParserFromBuildCache {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][pscustomobject]$RecoverySnapshot
  )

  $sourceRoot = Join-Path $RepositoryRoot 'vendor\windows-argv-parser'
  $cachedAddon = [string]$RecoverySnapshot.Path
  if (
    -not (
      Test-CurrentNativeOutputs `
        -SourceRoot $sourceRoot `
        -OutputPaths @($cachedAddon)
    ) -or
    (Get-FileHash -LiteralPath $cachedAddon -Algorithm SHA256).Hash -ne
      [string]$RecoverySnapshot.Hash -or
    -not (
      Test-WindowsArgvParserAddon `
        -NodePath $NodePath `
        -AddonPath $cachedAddon
    )
  ) {
    return $false
  }

  $packageRoot = Join-Path $RepositoryRoot 'app\node_modules\windows-argv-parser'
  $typeScriptCompiler = Join-Path $RepositoryRoot 'node_modules\typescript\bin\tsc'
  $typeScriptConfig = Join-Path $packageRoot 'tsconfig.json'
  if (
    -not (Test-WindowsArgvParserInputsMatch) -or
    -not (Test-Path -LiteralPath $typeScriptCompiler -PathType Leaf) -or
    -not (Test-Path -LiteralPath $typeScriptConfig -PathType Leaf)
  ) {
    return $false
  }

  Write-Phase 'Restoring the verified windows-argv-parser native output from the preceding build'
  $releaseRoot = Join-Path $packageRoot 'build\Release'
  New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
  Copy-Item -LiteralPath $cachedAddon -Destination (Join-Path $releaseRoot 'windows-argv-parser.node') -Force
  $compileExit = Invoke-StatusCommand -FilePath $NodePath -ArgumentList @(
    $typeScriptCompiler,
    '--project',
    $typeScriptConfig,
    '--pretty',
    'false'
  )
  if ($compileExit -ne 0) {
    return $false
  }
  return Test-WindowsArgvParserRuntime -NodePath $NodePath
}

function Test-WarmNativeDependencyCache {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  if (-not (Test-WindowsArgvParserInputsMatch)) {
    return $false
  }

  $requirements = @(
    [pscustomobject]@{
      SourceRoot = Join-Path $RepositoryRoot 'vendor\windows-argv-parser'
      IgnoredSourceNames = @()
      FreshnessToleranceMilliseconds = 0
      OutputPaths = @(
        (Join-Path $RepositoryRoot 'app\node_modules\windows-argv-parser\build\index.js'),
        (Join-Path $RepositoryRoot 'app\node_modules\windows-argv-parser\build\Release\windows-argv-parser.node')
      )
    },
    [pscustomobject]@{
      SourceRoot = Join-Path $RepositoryRoot 'vendor\desktop-notifications'
      IgnoredSourceNames = @()
      FreshnessToleranceMilliseconds = 0
      OutputPaths = @(
        (Join-Path $RepositoryRoot 'app\node_modules\desktop-notifications\dist\index.js'),
        (Join-Path $RepositoryRoot 'app\node_modules\desktop-notifications\build\Release\desktop-notifications.node')
      )
    },
    [pscustomobject]@{
      SourceRoot = Join-Path $RepositoryRoot 'vendor\desktop-trampoline'
      IgnoredSourceNames = @()
      FreshnessToleranceMilliseconds = 0
      OutputPaths = @(
        (Join-Path $RepositoryRoot 'app\node_modules\desktop-trampoline\dist\index.js'),
        (Join-Path $RepositoryRoot 'app\node_modules\desktop-trampoline\build\Release\desktop-askpass-trampoline.exe'),
        (Join-Path $RepositoryRoot 'app\node_modules\desktop-trampoline\build\Release\desktop-credential-helper-trampoline.exe')
      )
    },
    [pscustomobject]@{
      SourceRoot = Join-Path $RepositoryRoot 'vendor\printenvz'
      # `build.mjs` is excluded because it cannot be satisfied, not because it
      # does not matter. Yarn copies a `file:` dependency preserving source
      # timestamps, so `index.js` in node_modules always carries the mtime of
      # `vendor/printenvz/index.js`. Editing the build script therefore makes
      # the newest source permanently newer than a verbatim copy that the build
      # script never writes, and the check fails for good — the build reports a
      # missing native output while every output is present and correct.
      #
      # What `build.mjs` actually produces is `printenvz.exe`, and that stays
      # under the rule: the install script rebuilds it, its presence and
      # non-emptiness are checked here, and the compile fails loudly if it does
      # not appear.
      IgnoredSourceNames = @('package-lock.json', 'build.mjs')
      FreshnessToleranceMilliseconds = 2
      # Only the compiled executable. `index.js` used to be listed here and is
      # not an output at all: Yarn copies a `file:` dependency preserving
      # source timestamps, so the installed `index.js` carries the mtime of
      # `vendor/printenvz/index.js` and can never be newer than a sibling
      # source that happens to be newer — `package.json` already is. No build
      # could satisfy that, and the failure reported a missing native output
      # while every real output was present, correct and freshly compiled.
      #
      # `printenvz.exe` is what this package actually produces, and it stays
      # under the full rule: present, non-empty, and newer than its sources.
      OutputPaths = @(
        (Join-Path $RepositoryRoot 'node_modules\printenvz\build\Release\printenvz.exe')
      )
    }
  )

  foreach ($requirement in $requirements) {
    if (
      -not (
        Test-CurrentNativeOutputs `
          -SourceRoot $requirement.SourceRoot `
          -OutputPaths $requirement.OutputPaths `
          -IgnoredSourceNames $requirement.IgnoredSourceNames `
          -FreshnessToleranceMilliseconds $requirement.FreshnessToleranceMilliseconds
      )
    ) {
      return $false
    }
  }
  return Test-WindowsArgvParserRuntime -NodePath $NodePath
}

function Test-FrozenDependencyIntegrity {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$YarnPath
  )

  Write-Phase 'Checking whether the frozen dependency tree can be reused'
  $integrityExit = Invoke-StatusCommand -FilePath $NodePath -ArgumentList @(
    $YarnPath,
    'check',
    '--integrity'
  )
  return $integrityExit -eq 0
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
  $windowsArgvParserRecoverySnapshot = $null
  try {
    $windowsArgvParserRecoverySnapshot =
      New-WindowsArgvParserRecoverySnapshot -NodePath $node
    if ($Mode -ne 'Prepare') {
      Remove-BoundedBuildOutput
    }
    $env:npm_config_arch = $TargetArchitecture
    $env:TARGET_ARCH = $TargetArchitecture
    $env:NODE_ENV = 'development'
    $env:YARN_PRODUCTION = 'false'
    $env:npm_config_production = 'false'
    $reuseWarmDependencies = Test-FrozenDependencyIntegrity -NodePath $node -YarnPath $yarn
    if (
      $reuseWarmDependencies -and
      -not (Test-WarmNativeDependencyCache -NodePath $node) -and
      $null -ne $windowsArgvParserRecoverySnapshot
    ) {
      $null = Restore-WindowsArgvParserFromBuildCache `
        -NodePath $node `
        -RecoverySnapshot $windowsArgvParserRecoverySnapshot
      $reuseWarmDependencies = Test-WarmNativeDependencyCache -NodePath $node
    }
    if ($reuseWarmDependencies) {
      Write-Phase 'Reusing the verified frozen dependency tree and current native outputs'
    } else {
      Write-Phase 'Installing exact dependencies from the frozen lockfile'
      Invoke-Checked -FilePath $node -ArgumentList @($yarn, 'install', '--frozen-lockfile', '--non-interactive', '--production=false') -FailureLabel 'Frozen dependency installation'
    }
    if (
      -not (Test-WarmNativeDependencyCache -NodePath $node) -and
      $null -ne $windowsArgvParserRecoverySnapshot
    ) {
      $null = Restore-WindowsArgvParserFromBuildCache `
        -NodePath $node `
        -RecoverySnapshot $windowsArgvParserRecoverySnapshot
    }
    Ensure-PrintenvzExecutable -NodePath $node -VisualStudioInstallationPath $vsInstallationPath
    if (-not (Test-WarmNativeDependencyCache -NodePath $node)) {
      throw 'The frozen dependency tree is missing a current, nonempty local native output or the windows-argv-parser runtime probe failed.'
    }
    if ($Mode -eq 'Prepare') {
      Write-Phase 'Dependency preparation complete; no application build or installer packaging was requested.'
      $OverallStopwatch.Stop()
      Write-Host ("Completed in {0:hh\:mm\:ss}." -f $OverallStopwatch.Elapsed)
      return
    }
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
    if (
      $null -ne $windowsArgvParserRecoverySnapshot -and
      (Test-Path -LiteralPath $windowsArgvParserRecoverySnapshot.Path -PathType Leaf)
    ) {
      Remove-Item -LiteralPath $windowsArgvParserRecoverySnapshot.Path -Force
    }
    Pop-Location
  }

  $OverallStopwatch.Stop()
  Write-Host ("Completed in {0:hh\:mm\:ss}." -f $OverallStopwatch.Elapsed)
} catch {
  $failure = $_
  $OverallStopwatch.Stop()
  $failureMessage = if ($null -ne $failure -and $null -ne $failure.Exception) {
    [string]$failure.Exception.Message
  } else {
    [string]$failure
  }
  if ([string]::IsNullOrWhiteSpace($failureMessage)) {
    $failureMessage = [string]$failure
  }
  if ([string]::IsNullOrWhiteSpace($failureMessage)) {
    $failureMessage = 'Unknown build failure.'
  }
  Write-Error -ErrorAction Continue -Message ("Build failed after {0:hh\:mm\:ss}: {1}" -f $OverallStopwatch.Elapsed, $failureMessage)
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
