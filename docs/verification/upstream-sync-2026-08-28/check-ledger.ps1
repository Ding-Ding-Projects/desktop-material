param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$LedgerPath = (Join-Path $PSScriptRoot 'README.md')
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Error "LEDGER CHECK FAILED: $Message"
  exit 1
}

function Read-Ref([string]$Name) {
  $value = (git -C $RepoRoot rev-parse --verify $Name 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $value -notmatch '^[0-9a-f]{40}$') {
    Fail "required ref is unavailable: $Name"
  }
  return $value
}

function Get-PatchId([string]$Sha) {
  $patch = @(git -C $RepoRoot show --format= --no-ext-diff --no-renames "$Sha" 2>&1)
  if ($LASTEXITCODE -ne 0) {
    Fail "cannot read source record $Sha"
  }
  $patchIdOutput = @($patch | git -C $RepoRoot patch-id --stable 2>&1)
  if ($LASTEXITCODE -ne 0 -or $patchIdOutput.Count -ne 1) {
    Fail "cannot derive a stable patch ID for $Sha"
  }
  $patchId = ($patchIdOutput[0] -split '\s+')[0]
  if ($patchId -notmatch '^[0-9a-f]{40}$') {
    Fail "stable patch ID is malformed for $Sha"
  }
  return $patchId
}

if (-not (Test-Path -LiteralPath $LedgerPath -PathType Leaf)) {
  Fail "ledger file is missing: $LedgerPath"
}

$expectedOrigin = '83c91f6964cc1799fcc7e1d4fcd23f90e5e017f6'
$expectedUpstream = 'b17e06dd0f0d9a45807eb39a51d223f52eb14da9'
$expectedMergeBase = 'd9080117b1fd01193d3eee51ae243714468c8176'
$origin = Read-Ref 'origin/main'
$upstream = Read-Ref 'upstream/development'
$mergeBase = (git -C $RepoRoot merge-base origin/main upstream/development).Trim()
if ($LASTEXITCODE -ne 0 -or $mergeBase -ne $expectedMergeBase) {
  Fail "merge base is $mergeBase, expected $expectedMergeBase"
}
if ($origin -ne $expectedOrigin) {
  Fail "origin/main is $origin, expected $expectedOrigin"
}
if ($upstream -ne $expectedUpstream) {
  Fail "upstream/development is $upstream, expected $expectedUpstream"
}

$sourceLines = @(git -C $RepoRoot log --right-only --cherry-pick --no-merges --format='%H%x09%s' origin/main...upstream/development)
if ($LASTEXITCODE -ne 0) {
  Fail 'the refreshed origin/main...upstream/development query failed'
}
$sourceShas = @($sourceLines | ForEach-Object { ($_ -split "`t", 2)[0] })
if ($sourceLines.Count -ne 112) {
  Fail "source query returned $($sourceLines.Count) rows, expected 112"
}

$patchIds = @{}
foreach ($sha in $sourceShas) {
  $patchIds[$sha] = Get-PatchId $sha
}
$uniquePatchIds = @($patchIds.Values | Sort-Object -Unique)
if ($uniquePatchIds.Count -ne 108) {
  Fail "source query has $($uniquePatchIds.Count) unique stable patch IDs, expected 108"
}

$ledgerLines = @(Get-Content -LiteralPath $LedgerPath)
$tableRows = @($ledgerLines | Where-Object { $_ -match '^\| \d{3} \| [0-9a-f]{40} \|' })
if ($tableRows.Count -ne 112) {
  Fail "main table has $($tableRows.Count) rows, expected 112"
}
$rowNumbers = @($tableRows | ForEach-Object { ($_ -split '\|')[1].Trim() })
for ($i = 0; $i -lt $rowNumbers.Count; $i++) {
  $expectedRow = '{0:D3}' -f ($i + 1)
  if ($rowNumbers[$i] -ne $expectedRow) {
    Fail "main table row $($i + 1) is $($rowNumbers[$i]), expected $expectedRow"
  }
}
$tableShas = @($tableRows | ForEach-Object { ($_ -split '\|')[2].Trim() })
if (@(Compare-Object -ReferenceObject $sourceShas -DifferenceObject $tableShas).Count -ne 0) {
  Fail 'main table source SHAs do not exactly match the refreshed source query order'
}

$allowed = @(
  'ported',
  'already-equivalent',
  'superseded by stronger local behavior',
  'inapplicable because of platform/scope',
  'reverted-history duplicate',
  'review required'
)
$expectedCounts = @{
  'ported' = 2
  'already-equivalent' = 3
  'superseded by stronger local behavior' = 1
  'inapplicable because of platform/scope' = 27
  'reverted-history duplicate' = 6
  'review required' = 73
}
$actualCounts = @{}
foreach ($row in $tableRows) {
  $parts = $row -split '\|'
  $disposition = $parts[5].Trim()
  if ($allowed -notcontains $disposition) {
    Fail "main table has an invalid refreshed disposition: $disposition"
  }
  if (-not $actualCounts.ContainsKey($disposition)) { $actualCounts[$disposition] = 0 }
  $actualCounts[$disposition]++
  $evidence = $parts[6].Trim().Split(',')[0].Trim()
  foreach ($key in ($evidence -split '\s+and\s+')) {
    if (@('IMG','COP','CON','NUM','WT','DLG','CLN','PRO','HOK','PKG','DEP','WF','REL','DOC','TST','MAC','GUI') -notcontains $key.Trim()) {
      Fail "main table row $($parts[1].Trim()) has an unknown evidence key: $evidence"
    }
  }
}
foreach ($name in $expectedCounts.Keys) {
  if (-not $actualCounts.ContainsKey($name) -or $actualCounts[$name] -ne $expectedCounts[$name]) {
    $actual = if ($actualCounts.ContainsKey($name)) { $actualCounts[$name] } else { 0 }
    Fail "disposition $name has $actual rows, expected $($expectedCounts[$name])"
  }
}

$expectedPairs = @(@('078','094'), @('080','095'), @('081','096'), @('082','097'))
$tableByRow = @{}
for ($i = 0; $i -lt $tableRows.Count; $i++) {
  $tableByRow[$rowNumbers[$i]] = $tableShas[$i]
}
foreach ($pair in $expectedPairs) {
  $leftId = $patchIds[$tableByRow[$pair[0]]]
  $rightId = $patchIds[$tableByRow[$pair[1]]]
  if ($leftId -ne $rightId) {
    Fail "duplicate pair $($pair[0])/$($pair[1]) has different stable patch IDs"
  }
}

$indexRows = @($ledgerLines | Where-Object { $_ -match '^\| \d{3} \| \[[0-9a-f]{40}\]\(https://github\.com/desktop/desktop/commit/[0-9a-f]{40}\) \|' })
if ($indexRows.Count -ne 112) {
  Fail "source-link index has $($indexRows.Count) rows, expected 112"
}
$indexByRow = @{}
$indexPosition = 0
foreach ($row in $indexRows) {
  $parts = $row -split '\|'
  $number = $parts[1].Trim()
  $shaMatch = [regex]::Match($parts[2], '[0-9a-f]{40}')
  $sha = $shaMatch.Value
  $disposition = $parts[3].Trim()
  $expectedNumber = '{0:D3}' -f ($indexPosition + 1)
  if ($number -ne $expectedNumber -or $indexByRow.ContainsKey($number)) {
    Fail "source-link index row ordering is invalid at $number, expected $expectedNumber"
  }
  if ($sha -ne $tableByRow[$number]) {
    Fail "source-link index row $number disagrees with the main table"
  }
  if ($disposition -ne (($tableRows[[int]$number - 1] -split '\|')[5].Trim())) {
    Fail "source-link index disposition disagrees at row $number"
  }
  if ($parts[2].Trim() -ne "[$sha](https://github.com/desktop/desktop/commit/$sha)") {
    Fail "source-link index URL is not exact at row $number"
  }
  if ($parts[4].Trim() -notmatch '^\[[A-Za-z0-9 ]+\]\(#evidence-key\)') {
    Fail "source-link index row $number has an invalid evidence-key link"
  }
  $indexEvidence = [regex]::Match($parts[4].Trim(), '^\[([A-Za-z0-9 ]+)\]\(#evidence-key\)').Groups[1].Value
  $tableEvidence = (($tableRows[[int]$number - 1] -split '\|')[6].Trim().Split(',')[0].Trim())
  if ($indexEvidence -ne $tableEvidence) {
    Fail "source-link index evidence differs at row $number"
  }
  if ($parts[5].Trim() -ne '[#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212)') {
    Fail "source-link index row $number has an invalid issue link"
  }
  $indexByRow[$number] = $true
  $indexPosition++
}
for ($i = 0; $i -lt 112; $i++) {
  $number = '{0:D3}' -f ($i + 1)
  if (-not $indexByRow.ContainsKey($number)) {
    Fail "source-link index is missing row $number"
  }
}

Write-Output 'PASS: 112 source records, 108 unique stable patch IDs, four exact duplicate pairs, and all disposition, evidence, URL, baseline, and issue assertions are valid.'
