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

$fixture = Join-Path $resolvedRoot 'fixture'
$profile = Join-Path $resolvedRoot 'profile'
foreach ($requiredDirectory in @($fixture, $profile)) {
  if (-not (Test-Path -LiteralPath $requiredDirectory -PathType Container)) {
    throw "Required fixture directory does not exist: $requiredDirectory"
  }
}

function Invoke-FixtureGit {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  $output = @(& git -C $fixture @Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "git failed in the fixture ($($Arguments -join ' '))"
  }
  return $output
}

$initialStatus = @(Invoke-FixtureGit status --porcelain=v1 --untracked-files=all)
if ($initialStatus.Count -ne 0) {
  throw "Fixture must be clean before the bug-hunt state is seeded: $($initialStatus -join '; ')"
}

$branch = [string](Invoke-FixtureGit branch --show-current)
if ([String]::IsNullOrWhiteSpace($branch)) {
  throw 'Fixture must be on a named branch.'
}

$remoteRef = "refs/remotes/origin/$branch"
$remoteSha = [string](Invoke-FixtureGit rev-parse --verify --end-of-options $remoteRef)
if ($remoteSha -notmatch '^[0-9a-f]{40}$') {
  throw "Fixture remote-tracking ref is invalid: $remoteRef / $remoteSha"
}

$initialAheadBehind = ([string](
    Invoke-FixtureGit rev-list --left-right --count "HEAD...$remoteRef" --
  )).Split("`t")
if (
  $initialAheadBehind.Count -ne 2 -or
  [int]$initialAheadBehind[1] -ne 0 -or
  [int]$initialAheadBehind[0] -lt 0 -or
  [int]$initialAheadBehind[0] -gt 1
) {
  throw "Fixture started outside the supported zero-or-one-ahead state: $($initialAheadBehind -join '/')"
}

$configuredRemote = [string](Invoke-FixtureGit config --get "branch.$branch.remote")
$configuredMerge = [string](Invoke-FixtureGit config --get "branch.$branch.merge")
if ($configuredRemote -cne 'origin' -or $configuredMerge -cne "refs/heads/$branch") {
  throw "Fixture started with an unexpected upstream: $configuredRemote / $configuredMerge"
}

Invoke-FixtureGit config --unset-all "branch.$branch.remote" | Out-Null
Invoke-FixtureGit config --unset-all "branch.$branch.merge" | Out-Null

$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
$samplePath = Join-Path $fixture 'SAFE-REGEX.md'
if ([int]$initialAheadBehind[0] -eq 0) {
  [IO.File]::WriteAllText(
    $samplePath,
    "# Safe regex verification`n`nBase line from the published branch.`n",
    $utf8WithoutBom
  )
  Invoke-FixtureGit add -- SAFE-REGEX.md | Out-Null
  $env:GIT_AUTHOR_DATE = '2026-07-26T18:00:00Z'
  $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
  try {
    Invoke-FixtureGit commit --no-verify -m 'Add safe regex verification sample' | Out-Null
  } finally {
    Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
    Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue
  }
}

[IO.File]::WriteAllText(
  $samplePath,
  @"
# Safe regex verification

Base line from the published branch.
Renderer stress sample: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!
Safe RE2 pattern: ^(a+)+$
Unsupported pattern feedback: (?=lookahead)
"@.Replace("`r`n", "`n"),
  $utf8WithoutBom
)

$windowState = [ordered]@{
  width = 1280
  height = 800
  x = 0
  y = 0
  isMaximized = $false
  isFullScreen = $false
}
[IO.File]::WriteAllText(
  (Join-Path $profile 'window-state.json'),
  ($windowState | ConvertTo-Json -Compress),
  $utf8WithoutBom
)

$aheadBehind = ([string](
    Invoke-FixtureGit rev-list --left-right --count "HEAD...$remoteRef" --
  )).Split("`t")
if (
  $aheadBehind.Count -ne 2 -or
  [int]$aheadBehind[0] -ne 1 -or
  [int]$aheadBehind[1] -ne 0
) {
  throw "Fixture does not reproduce the one-ahead publication state: $($aheadBehind -join '/')"
}

$remainingRemote = @(& git -C $fixture config --get "branch.$branch.remote")
if ($LASTEXITCODE -eq 0 -or $remainingRemote.Count -ne 0) {
  throw 'Fixture still has branch.remote tracking configuration.'
}
$remainingMerge = @(& git -C $fixture config --get "branch.$branch.merge")
if ($LASTEXITCODE -eq 0 -or $remainingMerge.Count -ne 0) {
  throw 'Fixture still has branch.merge tracking configuration.'
}

$finalStatus = @(Invoke-FixtureGit status --porcelain=v1 --untracked-files=all)
if (
  $finalStatus.Count -ne 1 -or
  $finalStatus[0] -notin @(' M SAFE-REGEX.md', '?? SAFE-REGEX.md')
) {
  throw "Fixture working-tree state is not deterministic: $($finalStatus -join '; ')"
}

[ordered]@{
  root = $resolvedRoot
  fixture = [IO.Path]::GetFullPath($fixture)
  profile = [IO.Path]::GetFullPath($profile)
  branch = $branch
  remoteRef = $remoteRef
  remoteSha = $remoteSha
  localSha = [string](Invoke-FixtureGit rev-parse HEAD)
  ahead = [int]$aheadBehind[0]
  behind = [int]$aheadBehind[1]
  upstreamConfigured = $false
  changedPath = 'SAFE-REGEX.md'
  changedStatus = $finalStatus[0]
  window = $windowState
} | ConvertTo-Json -Compress
