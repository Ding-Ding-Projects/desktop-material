$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
  throw 'Node.js is required on a self-hosted Windows runner before Yarn bootstrap.'
}

$yarnScript = Join-Path $env:GITHUB_WORKSPACE 'vendor\yarn-1.21.1.js'
if (-not (Test-Path -LiteralPath $yarnScript -PathType Leaf)) {
  throw "The repository-pinned Yarn runtime is missing: $yarnScript"
}

$shimRoot = Join-Path $env:RUNNER_TEMP 'desktop-material-pinned-yarn'
New-Item -ItemType Directory -Path $shimRoot -Force | Out-Null
$shimScript = Join-Path $shimRoot 'yarn-1.21.1.js'
$shimPath = Join-Path $shimRoot 'yarn.cmd'
$posixShimPath = Join-Path $shimRoot 'yarn'
[System.IO.File]::Copy($yarnScript, $shimScript, $true)
$shim = "@echo off`r`nnode `"%~dp0yarn-1.21.1.js`" %*`r`n"
[System.IO.File]::WriteAllText(
  $shimPath,
  $shim,
  [System.Text.Encoding]::ASCII
)
$posixShim = @'
#!/usr/bin/env bash
exec node "$(dirname "$0")/yarn-1.21.1.js" "$@"
'@
$posixShim = $posixShim.Replace("`r`n", "`n").Replace("`r", "")
[System.IO.File]::WriteAllText(
  $posixShimPath,
  $posixShim,
  [System.Text.Encoding]::ASCII
)

$shimRoot | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append -ErrorAction Stop

& $shimPath --version
if ($LASTEXITCODE -ne 0) {
  throw "The repository-pinned Yarn runtime could not start: $shimPath"
}
