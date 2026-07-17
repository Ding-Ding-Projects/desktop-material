param(
  [Parameter(Mandatory = $true)]
  [string]$RunRoot
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($RunRoot)
$resolvedTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (
  -not $resolvedRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
  [IO.Path]::GetFileName($resolvedRoot) -notlike 'desktop-material-p0-ui-*'
) {
  throw "Run root must be a named child of TEMP: $resolvedRoot"
}

$readyPath = Join-Path $resolvedRoot 'provider\ready.json'
$fixture = Join-Path $resolvedRoot 'fixture'
if (-not (Test-Path -LiteralPath $readyPath -PathType Leaf)) {
  throw "Provider ready state does not exist: $readyPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $fixture '.git') -PathType Container)) {
  throw "Fixture repository does not exist: $fixture"
}
$ready = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
if (
  [string]$ready.bind -ne '127.0.0.1' -or
  [string]$ready.htmlUrl -ne 'http://material-provider.invalid' -or
  [string]$ready.owner -ne 'material-fixture-owner' -or
  [string]$ready.repository -ne 'material-fixture'
) {
  throw 'Provider identity does not match the GitHub API Explorer fixture.'
}

$expectedRemote = 'http://material-provider.invalid/material-fixture-owner/material-fixture.git'
$matchedRemote = "http://localhost:$([int]$ready.port)/material-fixture-owner/material-fixture.git"
$currentRemote = (& git -C $fixture remote get-url origin).Trim()
if (
  $LASTEXITCODE -ne 0 -or
  ($currentRemote -ne $expectedRemote -and $currentRemote -ne $matchedRemote)
) {
  throw "Fixture remote mismatch: $currentRemote"
}
if ($currentRemote -eq $expectedRemote) {
  & git -C $fixture remote set-url origin $matchedRemote
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to bind the fixture remote to the exact loopback account origin.'
  }
}
$expectedProxy = "http://127.0.0.1:$([int]$ready.port)"
$proxyLines = @(& git -C $fixture config --get http.proxy)
$proxyExitCode = $LASTEXITCODE
$currentProxy = ($proxyLines -join '').Trim()
if ($proxyExitCode -eq 0) {
  if ($currentProxy -ne $expectedProxy) {
    throw "Fixture proxy mismatch: $currentProxy"
  }
  & git -C $fixture config --unset-all http.proxy
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to remove the no-longer-needed fixture proxy.'
  }
} elseif ($proxyExitCode -ne 1) {
  throw 'Unable to inspect the fixture proxy.'
}
& git -C $fixture fetch --dry-run origin
if ($LASTEXITCODE -ne 0) {
  throw 'The account-origin fixture remote could not be fetched.'
}

[ordered]@{
  fixture = [IO.Path]::GetFullPath($fixture)
  remote = $matchedRemote
  accountOrigin = "http://localhost:$([int]$ready.port)"
  strictOriginMatch = $true
} | ConvertTo-Json -Compress
