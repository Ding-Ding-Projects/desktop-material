$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
  throw 'Node.js is required on a self-hosted Windows runner before Yarn bootstrap.'
}

$nodePath = $nodeCommand.Source
if ([string]::IsNullOrWhiteSpace($nodePath)) {
  $nodePath = $nodeCommand.Path
}

$yarnScript = Join-Path $env:GITHUB_WORKSPACE 'vendor\yarn-1.21.1.js'
if (-not (Test-Path -LiteralPath $yarnScript -PathType Leaf)) {
  throw "The repository-pinned Yarn runtime is missing: $yarnScript"
}

$shimRoot = Join-Path $env:RUNNER_TEMP 'desktop-material-pinned-yarn'
New-Item -ItemType Directory -Path $shimRoot -Force | Out-Null
$shimPath = Join-Path $shimRoot 'yarn.cmd'
$bashShimPath = Join-Path $shimRoot 'yarn'
$shim = "@echo off`r`n`"$nodePath`" `"$yarnScript`" %*`r`n"
[System.IO.File]::WriteAllText(
  $shimPath,
  $shim,
  [System.Text.Encoding]::ASCII
)

$bashYarnScript = ($yarnScript -replace '\\', '/') -replace '"', '\\"'
$bashShim = @'
#!/usr/bin/env bash
exec node "__YARN_SCRIPT__" "$@"
'@.Replace('__YARN_SCRIPT__', $bashYarnScript)
[System.IO.File]::WriteAllText(
  $bashShimPath,
  $bashShim,
  [System.Text.UTF8Encoding]::new($false)
)

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if ($null -eq $git) {
  throw 'Git is required on a self-hosted Windows runner before enabling the Bash Yarn shim.'
}
$gitRoot = Split-Path (Split-Path $git.Source -Parent) -Parent
$gitBash = Join-Path $gitRoot 'bin\bash.exe'
if (-not (Test-Path -LiteralPath $gitBash -PathType Leaf)) {
  throw "Git Bash is required to make the Yarn shim executable: $gitBash"
}
$bashShimForGit = $bashShimPath -replace '\\', '/'
& $gitBash -lc "chmod +x '$bashShimForGit'"
if ($LASTEXITCODE -ne 0) {
  throw "Git Bash could not mark the Yarn shim executable: $bashShimPath"
}
$bashShimRootForGit = $shimRoot -replace '\\', '/'
if ($bashShimRootForGit -match '^(?<drive>[A-Za-z]):/(?<path>.*)$') {
  $bashShimRootForGit = "/$($matches.drive.ToLower())/$($matches.path)"
}

$shimRoot | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
$bashShimRootForGit | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append

& $shimPath --version
if ($LASTEXITCODE -ne 0) {
  throw "The repository-pinned Yarn runtime could not start: $shimPath"
}
