[CmdletBinding()]
param(
    [ValidateSet('x64', 'arm64')]
    [string]$TargetArchitecture = 'x64'
)

$ErrorActionPreference = 'Stop'

$vswhereCandidates = @(
    (Get-Command vswhere.exe -ErrorAction SilentlyContinue).Source
    'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    'C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe'
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$vswhere = $vswhereCandidates | Select-Object -First 1
if (-not $vswhere) {
    throw 'Visual Studio discovery is required for the Windows native tests, but vswhere.exe was not found.'
}

$instances = @((& $vswhere -products * -format json | ConvertFrom-Json))
if ($LASTEXITCODE -ne 0 -or $instances.Count -eq 0) {
    throw 'Visual Studio discovery returned no installable instance for the Windows native tests.'
}

function Find-ClangToolset([string]$InstallationPath) {
    $platform = if ($TargetArchitecture -eq 'arm64') { 'ARM64' } else { 'x64' }
    $toolsetRoot = Join-Path $InstallationPath "MSBuild\Microsoft\VC\v170\Platforms\$platform\PlatformToolsets\ClangCL"
    $toolsetProps = Join-Path $toolsetRoot 'Toolset.props'
    $toolsetTargets = Join-Path $toolsetRoot 'Toolset.targets'
    $llvmRoots = @(
        (Join-Path $InstallationPath "VC\Tools\Llvm\$platform")
        (Join-Path $InstallationPath 'VC\Tools\Llvm')
    )

    foreach ($llvmRoot in $llvmRoots) {
        $compiler = Join-Path $llvmRoot 'bin\clang-cl.exe'
        if ((Test-Path -LiteralPath $compiler) -and
            (Test-Path -LiteralPath $toolsetProps) -and
            (Test-Path -LiteralPath $toolsetTargets)) {
            return [pscustomobject]@{
                Compiler = Get-Item -LiteralPath $compiler
                Props = Get-Item -LiteralPath $toolsetProps
                Targets = Get-Item -LiteralPath $toolsetTargets
            }
        }
    }

    return $null
}

$installableInstances = @(
    $instances |
        Where-Object { $_.installationPath } |
        Sort-Object installationVersion -Descending
)
if ($installableInstances.Count -eq 0) {
    throw 'Visual Studio discovery returned no installable instance for the Windows native tests.'
}

$instance = $null
$toolset = $null
foreach ($candidate in $installableInstances) {
    $candidateToolset = Find-ClangToolset $candidate.installationPath
    if ($candidateToolset) {
        $instance = $candidate
        $toolset = $candidateToolset
        break
    }
    if (-not $instance) {
        $instance = $candidate
    }
}

if ($toolset) {
    "npm_config_msvs_version=$($instance.installationPath)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
    Write-Host "Windows ClangCL compiler is available at $($toolset.Compiler.FullName)."
    Write-Host "Using Visual Studio instance $($instance.installationPath) for node-gyp MSBuild generation."
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
    'Microsoft.VisualStudio.Component.VC.Llvm.Clang'
    '--quiet'
    '--norestart'
    '--wait'
)

Write-Host "Installing the missing Windows ClangCL toolset for $TargetArchitecture with $setup."
& $setup @arguments
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Visual Studio ClangCL toolset installation failed with exit code $LASTEXITCODE."
}

$toolset = Find-ClangToolset $instance.installationPath
if (-not $toolset) {
    throw "Visual Studio ClangCL toolset installation completed without a usable $TargetArchitecture ClangCL toolset under $($instance.installationPath)."
}

"npm_config_msvs_version=$($instance.installationPath)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
Write-Host "Windows ClangCL compiler is ready at $($toolset.Compiler.FullName)."
Write-Host "Using Visual Studio instance $($instance.installationPath) for node-gyp MSBuild generation."
