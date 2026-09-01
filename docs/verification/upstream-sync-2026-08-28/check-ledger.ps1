param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
  [string]$LedgerPath = (Join-Path $PSScriptRoot 'README.md')
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Error "LEDGER CHECK FAILED: $Message"
  exit 1
}

if (-not (Test-Path -LiteralPath $LedgerPath -PathType Leaf)) {
  Fail "ledger file is missing: $LedgerPath"
}

$sourceLines = @(git -C $RepoRoot log --right-only --cherry-pick --no-merges --format='%H%x09%s' origin/main...upstream/development)
if ($LASTEXITCODE -ne 0) {
  Fail 'the refreshed origin/main...upstream/development query failed'
}

$sourceShas = @($sourceLines | ForEach-Object { ($_ -split "`t", 2)[0] })
$sourceUnique = @($sourceShas | Sort-Object -Unique)
$ledgerLines = @(Get-Content -LiteralPath $LedgerPath)
$tableRows = @($ledgerLines | Where-Object { $_ -match '^\| \d{3} \| [0-9a-f]{40} \|' })

if ($tableRows.Count -ne $sourceLines.Count) {
  Fail "main table has $($tableRows.Count) rows, source query has $($sourceLines.Count)"
}

$rowNumbers = @($tableRows | ForEach-Object { ($_ -split '\|')[1].Trim() })
if (($rowNumbers | Sort-Object -Unique).Count -ne $rowNumbers.Count -or $rowNumbers[0] -ne '001' -or $rowNumbers[-1] -ne ('{0:D3}' -f $sourceLines.Count)) {
  Fail 'main table row numbers are not a unique 001..N sequence'
}

$tableShas = @($tableRows | ForEach-Object { ($_ -split '\|')[2].Trim() })
if (($tableShas | Sort-Object -Unique).Count -ne $tableShas.Count) {
  Fail 'main table contains duplicate source SHAs'
}
$allowed = @(
  'ported',
  'already-equivalent',
  'superseded by stronger local behavior',
  'inapplicable because of platform/scope',
  'reverted-history duplicate',
  'genuinely blocked'
)
foreach ($row in $tableRows) {
  $disposition = ($row -split '\|')[5].Trim()
  if ($allowed -notcontains $disposition) {
    Fail "main table has an invalid refreshed disposition: $disposition"
  }
}
if (@(Compare-Object -ReferenceObject $sourceUnique -DifferenceObject ($tableShas | Sort-Object -Unique)).Count -ne 0) {
  Fail 'main table SHAs do not exactly match the refreshed source query'
}

$indexRows = @($ledgerLines | Where-Object { $_ -match '^\| \d{3} \| \[[0-9a-f]{40}\]\(' })
if ($indexRows.Count -ne $sourceLines.Count) {
  Fail "source-link index has $($indexRows.Count) rows, expected $($sourceLines.Count)"
}

$indexShas = @()
foreach ($row in $indexRows) {
  $parts = $row -split '\|'
  $indexShas += [regex]::Match($parts[2], '[0-9a-f]{40}').Value
  $disposition = $parts[3].Trim()
  if ($allowed -notcontains $disposition) {
    Fail "index row has an invalid refreshed disposition: $disposition"
  }
  if ($parts[5].Trim() -notmatch '\[#212 open\]\(') {
    Fail 'index row is missing the open parent issue status'
  }
}
if (($indexShas | Sort-Object -Unique).Count -ne $indexRows.Count) {
  Fail 'source-link index contains duplicate source SHAs'
}
if (@(Compare-Object -ReferenceObject $sourceUnique -DifferenceObject ($indexShas | Sort-Object -Unique)).Count -ne 0) {
  Fail 'source-link index SHAs do not exactly match the refreshed source query'
}

Write-Output "PASS: $($sourceLines.Count) source records, $($sourceUnique.Count) unique patch effects indexed with exact links and issue status."
