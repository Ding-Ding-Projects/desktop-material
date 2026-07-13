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
if (Test-Path -LiteralPath $fixture) {
  throw "Fixture clone already exists: $fixture"
}
$ready = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
if (
  [string]$ready.bind -ne '127.0.0.1' -or
  [string]$ready.htmlUrl -ne 'http://material-provider.invalid'
) {
  throw 'Provider identity does not match the isolated fixture contract.'
}

$directURL = "http://127.0.0.1:$([int]$ready.port)/$($ready.owner)/$($ready.repository).git"
$storedURL = "$($ready.htmlUrl)/$($ready.owner)/$($ready.repository).git"
$cloneArguments = @(
  'clone',
  '--depth', '3',
  '--no-single-branch',
  '--branch', [string]$ready.featureBranch,
  $directURL,
  $fixture
)
& git @cloneArguments
if ($LASTEXITCODE -ne 0) {
  throw 'Shallow fixture clone failed.'
}

& git -C $fixture remote set-url origin $storedURL
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to set the synthetic stored remote.'
}
& git -C $fixture config http.proxy "http://127.0.0.1:$([int]$ready.port)"
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to configure the loopback Git proxy.'
}
& git -C $fixture config http.version HTTP/1.1
& git -C $fixture config user.name 'Material Fixture'
& git -C $fixture config user.email 'material-fixture@example.invalid'

$remoteLines = @(& git -C $fixture remote -v)
$unexpectedRemoteLines = @(
  $remoteLines | Where-Object { $_ -notmatch '^origin\s+http://material-provider\.invalid/' }
)
if ($remoteLines.Count -ne 2 -or $unexpectedRemoteLines.Count -ne 0) {
  throw "Git exposed an unexpected remote identity: $($remoteLines -join '; ')"
}
& git -C $fixture fetch --dry-run origin
if ($LASTEXITCODE -ne 0) {
  throw 'Stored remote did not route through the loopback Git proxy.'
}

$shallow = (& git -C $fixture rev-parse --is-shallow-repository).Trim()
$branch = (& git -C $fixture branch --show-current).Trim()
$upstream = (& git -C $fixture rev-parse --abbrev-ref '@{upstream}').Trim()
$remoteBranches = @(& git -C $fixture for-each-ref --format='%(refname:short)' refs/remotes/origin)
if ($shallow -ne 'true') {
  throw 'Fixture clone is not shallow.'
}
if ($branch -ne [string]$ready.featureBranch -or $upstream -ne "origin/$($ready.featureBranch)") {
  throw "Fixture branch/upstream mismatch: $branch / $upstream"
}
if (
  $remoteBranches -notcontains 'origin/main' -or
  $remoteBranches -notcontains "origin/$($ready.featureBranch)"
) {
  throw "Fixture is missing required remote branches: $($remoteBranches -join ', ')"
}

[ordered]@{
  fixture = [IO.Path]::GetFullPath($fixture)
  storedRemote = $storedURL
  proxy = "http://127.0.0.1:$([int]$ready.port)"
  shallow = $shallow
  branch = $branch
  upstream = $upstream
  visibleCommitCount = [int](& git -C $fixture rev-list --count HEAD).Trim()
  remoteBranches = $remoteBranches
} | ConvertTo-Json -Compress
