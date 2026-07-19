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
$sourceRoot = Join-Path $resolvedRoot 'submodule-source'
$ownerRoot = Join-Path $resolvedRoot 'git-http\material-fixture-owner'
if (-not (Test-Path -LiteralPath $fixture -PathType Container)) {
  throw "Provider-backed fixture does not exist: $fixture"
}
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null

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

$children = @(
  [ordered]@{
    Name = 'material-widget'
    Path = 'modules/material-widget'
    File = 'widget.txt'
    Content = "Material widget fixture`n"
  },
  [ordered]@{
    Name = 'dormant-addon'
    Path = 'modules/dormant-addon'
    File = 'addon.txt'
    Content = "Dormant addon fixture`n"
  }
)

foreach ($child in $children) {
  $source = Join-Path $sourceRoot $child.Name
  $bare = Join-Path $ownerRoot ($child.Name + '.git')
  if (
    (Test-Path -LiteralPath $source) -or
    (Test-Path -LiteralPath $bare)
  ) {
    throw "Child fixture already exists: $($child.Name)"
  }

  & git init -b main $source
  if ($LASTEXITCODE -ne 0) {
    throw "git init failed for $($child.Name)"
  }
  Invoke-FixtureGit $source config user.name 'Material Fixture'
  Invoke-FixtureGit $source config user.email 'material-fixture@example.invalid'
  Set-Content -LiteralPath (Join-Path $source $child.File) `
    -Value $child.Content -NoNewline -Encoding utf8
  Invoke-FixtureGit $source add -- $child.File
  $env:GIT_AUTHOR_DATE = '2026-07-18T20:00:00Z'
  $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
  Invoke-FixtureGit $source commit -m "Initialize $($child.Name) fixture"

  & git clone --bare $source $bare
  if ($LASTEXITCODE -ne 0) {
    throw "Bare clone failed for $($child.Name)"
  }
  Invoke-FixtureGit $bare config http.receivepack false
  Invoke-FixtureGit $bare update-server-info

  & git -C $fixture -c protocol.file.allow=always submodule add $bare $child.Path
  if ($LASTEXITCODE -ne 0) {
    throw "Submodule add failed for $($child.Name)"
  }
  Invoke-FixtureGit $fixture config -f .gitmodules `
    "submodule.$($child.Path).url" "../$($child.Name).git"
}

Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue
Invoke-FixtureGit $fixture config user.name 'Material Fixture'
Invoke-FixtureGit $fixture config user.email 'material-fixture@example.invalid'
Invoke-FixtureGit $fixture add -- .gitmodules modules/material-widget modules/dormant-addon
$env:GIT_AUTHOR_DATE = '2026-07-18T20:05:00Z'
$env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
Invoke-FixtureGit $fixture commit -m 'Add deterministic initialized and dormant submodules'
Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue
Invoke-FixtureGit $fixture submodule deinit -f -- modules/dormant-addon

$status = @(& git -C $fixture submodule status)
$porcelain = @(& git -C $fixture status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw 'Fixture status failed.'
}
if (
  $status.Count -ne 2 -or
  -not ($status | Where-Object { $_ -match '^-' }) -or
  -not ($status | Where-Object { $_ -match '^ ' })
) {
  throw "Unexpected submodule states: $($status -join '; ')"
}
if ($porcelain.Count -ne 0) {
  throw "Fixture is dirty: $($porcelain -join '; ')"
}

[ordered]@{
  fixture = [IO.Path]::GetFullPath($fixture)
  head = (& git -C $fixture rev-parse HEAD).Trim()
  submodules = $status
  clean = $true
  gitmodules = [string](
    Get-Content -LiteralPath (Join-Path $fixture '.gitmodules') -Raw
  )
} | ConvertTo-Json -Compress
