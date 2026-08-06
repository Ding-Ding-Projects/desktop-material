[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'arm64')]
    [string]$TargetArchitecture
)

$ErrorActionPreference = 'Stop'

if ($TargetArchitecture -ne 'arm64') {
    Write-Host "Windows $TargetArchitecture does not need the arm64 cross-toolset."
    exit 0
}

$vswhereCandidates = @(
    (Get-Command vswhere.exe -ErrorAction SilentlyContinue).Source
    'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    'C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$vswhere = $vswhereCandidates | Select-Object -First 1
if (-not $vswhere) {
    throw 'Visual Studio discovery is required for the Windows arm64 cross-build, but vswhere.exe was not found.'
}

$instances = @((& $vswhere -products * -format json | ConvertFrom-Json))
if ($LASTEXITCODE -ne 0 -or $instances.Count -eq 0) {
    throw 'Visual Studio discovery returned no installable instance for the Windows arm64 cross-build.'
}

function Get-DefaultMsvcVersion([string]$InstallationPath) {
    $versionFile = Join-Path $InstallationPath 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt'
    if (-not (Test-Path -LiteralPath $versionFile)) {
        return $null
    }

    $version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    if ($version) {
        return $version
    }
    return $null
}

function Find-Arm64Compiler([string]$InstallationPath, [string]$MsvcVersion) {
    $toolRoot = Join-Path $InstallationPath 'VC\Tools\MSVC'
    if (-not (Test-Path -LiteralPath $toolRoot)) {
        return $null
    }

    if ($MsvcVersion) {
        $versionDirectories = @(Get-Item -LiteralPath (Join-Path $toolRoot $MsvcVersion) -ErrorAction SilentlyContinue)
    } else {
        $versionDirectories = @(Get-ChildItem -LiteralPath $toolRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    }

    foreach ($versionDirectory in $versionDirectories) {
        $candidate = Join-Path $versionDirectory.FullName 'bin\Hostx64\arm64\cl.exe'
        if (Test-Path -LiteralPath $candidate) {
            return Get-Item -LiteralPath $candidate
        }
    }
    return $null
}

$installableInstances = @($instances | Where-Object { $_.installationPath } | Sort-Object installationVersion -Descending)
if ($installableInstances.Count -eq 0) {
    throw 'Visual Studio discovery returned no installable instance for the Windows arm64 cross-build.'
}

$instancesWithCxx = @($installableInstances | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.installationPath 'VC\Tools\MSVC')
})
$instancesWithoutCxx = @($installableInstances | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $_.installationPath 'VC\Tools\MSVC'))
})
$orderedInstances = @($instancesWithCxx) + @($instancesWithoutCxx)

$instance = $null
$compiler = $null
foreach ($candidate in $orderedInstances) {
    $defaultMsvcVersion = Get-DefaultMsvcVersion $candidate.installationPath
    $candidateCompiler = Find-Arm64Compiler $candidate.installationPath $defaultMsvcVersion
    if ($candidateCompiler) {
        $instance = $candidate
        $compiler = $candidateCompiler
        break
    }
    if (-not $instance) {
        $instance = $candidate
    }
}

if (-not $instance) {
    $instance = $orderedInstances | Select-Object -First 1
}

if ($compiler) {
    Write-Host "Windows arm64 compiler is available at $($compiler.FullName)."
    exit 0
}

$setup = $instance.properties.setupEngineFilePath
if (-not $setup -or -not (Test-Path -LiteralPath $setup)) {
    $setup = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe'
}
if (-not (Test-Path -LiteralPath $setup)) {
    throw "Visual Studio setup.exe was not found for $($instance.installationPath)."
}

$arguments = @(
    'modify'
    '--installPath'
    $instance.installationPath
    '--add'
    'Microsoft.VisualStudio.Component.VC.Tools.ARM64'
    '--add'
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64'
    '--quiet'
    '--norestart'
)

Write-Host "Installing the missing Windows arm64 C++ toolset with $setup."
& $setup @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Visual Studio arm64 toolset installation failed with exit code $LASTEXITCODE."
}

$defaultMsvcVersion = Get-DefaultMsvcVersion $instance.installationPath
$compiler = Find-Arm64Compiler $instance.installationPath $defaultMsvcVersion
if (-not $compiler) {
    $expected = if ($defaultMsvcVersion) { " for MSVC $defaultMsvcVersion" } else { '' }
    throw "Visual Studio arm64 toolset installation completed without an arm64 compiler$expected under $($instance.installationPath)."
}

Write-Host "Windows arm64 compiler is ready at $($compiler.FullName)."
