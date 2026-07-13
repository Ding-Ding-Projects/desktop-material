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
if (Test-Path -LiteralPath $resolvedRoot) {
  throw "Owned run root already exists: $resolvedRoot"
}

$source = Join-Path $resolvedRoot 'git-source'
$gitRoot = Join-Path $resolvedRoot 'git-http'
$bare = Join-Path $gitRoot 'material-fixture-owner\material-fixture.git'
$directories = @(
  $resolvedRoot,
  $source,
  $gitRoot,
  (Join-Path $resolvedRoot 'profile'),
  (Join-Path $resolvedRoot 'home'),
  (Join-Path $resolvedRoot 'config'),
  (Join-Path $resolvedRoot 'captures'),
  (Join-Path $resolvedRoot 'downloads'),
  (Join-Path $resolvedRoot 'provider')
)
foreach ($directory in $directories) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

function Invoke-FixtureGit {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )
  & git -C $WorkingDirectory @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git failed in $WorkingDirectory ($($Arguments -join ' '))"
  }
}

& git init -b main $source
if ($LASTEXITCODE -ne 0) {
  throw 'git init failed'
}
Invoke-FixtureGit $source config user.name 'Material Fixture'
Invoke-FixtureGit $source config user.email 'material-fixture@example.invalid'

$messages = @(
  'Initialize deterministic material verification fixture',
  'Add repository history guidance',
  'Add shallow clone recovery context',
  'Add responsive repository navigation',
  'Add native pull request composition',
  'Add pull request review confirmation',
  'Add Actions workflow browsing',
  'Add bounded artifact metadata',
  'Add artifact digest verification',
  'Add effective branch rules synthesis',
  'Add minimum-width layout containment',
  'Add keyboard and focus ownership'
)
for ($index = 0; $index -lt $messages.Count; $index++) {
  $minute = ($index + 1).ToString('00')
  $env:GIT_AUTHOR_DATE = '2026-07-13T10:{0}:00Z' -f $minute
  $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
  Invoke-FixtureGit $source commit --allow-empty -m $messages[$index]
}

Invoke-FixtureGit $source checkout -b 'feature/material-verification'
$featureMessages = @(
  'Verify production P0 workflows without clipping',
  'Stress long provider and artifact identities',
  'Prepare final off-screen screenshot states'
)
for ($index = 0; $index -lt $featureMessages.Count; $index++) {
  $minute = ($index + 20).ToString('00')
  $env:GIT_AUTHOR_DATE = '2026-07-13T10:{0}:00Z' -f $minute
  $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
  Invoke-FixtureGit $source commit --allow-empty -m $featureMessages[$index]
}
Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path (Split-Path -Parent $bare) -Force | Out-Null
& git clone --bare $source $bare
if ($LASTEXITCODE -ne 0) {
  throw 'bare clone failed'
}
Invoke-FixtureGit $bare config http.receivepack false
Invoke-FixtureGit $bare update-server-info

[ordered]@{
  root = $resolvedRoot
  source = [IO.Path]::GetFullPath($source)
  gitProjectRoot = [IO.Path]::GetFullPath($gitRoot)
  bare = [IO.Path]::GetFullPath($bare)
  featureHead = (& git -C $source rev-parse HEAD).Trim()
  mainHead = (& git -C $source rev-parse main).Trim()
  commitCount = [int](& git -C $source rev-list --count HEAD).Trim()
} | ConvertTo-Json -Compress
