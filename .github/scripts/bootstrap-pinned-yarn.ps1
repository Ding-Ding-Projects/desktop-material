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
$shim = "@echo off`r`n`"$nodePath`" `"$yarnScript`" %*`r`n"
[System.IO.File]::WriteAllText(
  $shimPath,
  $shim,
  [System.Text.Encoding]::ASCII
)

$shimRoot | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append

& $shimPath --version
if ($LASTEXITCODE -ne 0) {
  throw "The repository-pinned Yarn runtime could not start: $shimPath"
}
