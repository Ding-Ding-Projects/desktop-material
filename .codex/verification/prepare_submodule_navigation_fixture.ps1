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
$preparedCommitMessage = 'Add deterministic initialized and dormant submodules'
$fixtureIdentityName = 'Material Fixture'
$fixtureIdentityEmail = 'material-fixture@example.invalid'
if (-not (Test-Path -LiteralPath $fixture -PathType Container)) {
  throw "Provider-backed fixture does not exist: $fixture"
}
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ownerRoot -Force | Out-Null

function Invoke-FixtureGit {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )
  & git -C $WorkingDirectory @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "git failed in $WorkingDirectory ($($Arguments -join ' '))"
  }
}

function Get-FixtureGitValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )
  $lines = @(& git -C $WorkingDirectory @Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "git failed in $WorkingDirectory ($($Arguments -join ' '))"
  }
  return ($lines -join "`n").Trim()
}

function Invoke-WithDeterministicCommitEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Date,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  $values = [ordered]@{
    GIT_AUTHOR_NAME = $fixtureIdentityName
    GIT_AUTHOR_EMAIL = $fixtureIdentityEmail
    GIT_AUTHOR_DATE = $Date
    GIT_COMMITTER_NAME = $fixtureIdentityName
    GIT_COMMITTER_EMAIL = $fixtureIdentityEmail
    GIT_COMMITTER_DATE = $Date
  }
  $previous = @{}
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable(
      $name,
      [EnvironmentVariableTarget]::Process
    )
  }
  try {
    foreach ($name in $values.Keys) {
      [Environment]::SetEnvironmentVariable(
        $name,
        [string]$values[$name],
        [EnvironmentVariableTarget]::Process
      )
    }
    & $Action
  } finally {
    foreach ($name in $values.Keys) {
      [Environment]::SetEnvironmentVariable(
        $name,
        $previous[$name],
        [EnvironmentVariableTarget]::Process
      )
    }
  }
}

$children = @(
  [ordered]@{
    Name = 'material-widget'
    Path = 'modules/material-widget'
    File = 'widget.txt'
    Content = "Material widget fixture`n"
    CommitDate = '2026-07-18T20:00:00Z'
    Initialized = $true
  },
  [ordered]@{
    Name = 'dormant-addon'
    Path = 'modules/dormant-addon'
    File = 'addon.txt'
    Content = "Dormant addon fixture`n"
    CommitDate = '2026-07-18T20:00:00Z'
    Initialized = $false
  }
)

function New-ChildFixture {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Child,
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Bare
  )

  New-Item -ItemType Directory -Path $Source | Out-Null
  & git init --quiet -b main $Source | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "git init failed for $($Child.Name)"
  }
  Invoke-FixtureGit $Source config user.name $fixtureIdentityName
  Invoke-FixtureGit $Source config user.email $fixtureIdentityEmail
  [IO.File]::WriteAllText(
    (Join-Path $Source $Child.File),
    [string]$Child.Content,
    [Text.UTF8Encoding]::new($false)
  )
  Invoke-FixtureGit $Source add -- $Child.File
  Invoke-WithDeterministicCommitEnvironment -Date $Child.CommitDate -Action {
    Invoke-FixtureGit $Source commit --quiet -m "Initialize $($Child.Name) fixture"
  }

  & git clone --quiet --bare $Source $Bare | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Bare clone failed for $($Child.Name)"
  }
  Invoke-FixtureGit $Bare config http.receivepack false
  Invoke-FixtureGit $Bare update-server-info
}

function Assert-ChildFixture {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Child,
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Bare
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Child source is not a directory: $Source"
  }
  if (-not (Test-Path -LiteralPath $Bare -PathType Container)) {
    throw "Child bare repository is not a directory: $Bare"
  }
  if ((Get-FixtureGitValue $Source rev-parse --is-bare-repository) -ne 'false') {
    throw "Child source is not a working repository: $($Child.Name)"
  }
  if ((Get-FixtureGitValue $Bare rev-parse --is-bare-repository) -ne 'true') {
    throw "Child provider repository is not bare: $($Child.Name)"
  }
  if ((Get-FixtureGitValue $Source branch --show-current) -ne 'main') {
    throw "Child source branch mismatch: $($Child.Name)"
  }
  if ((Get-FixtureGitValue $Source rev-list --count HEAD) -ne '1') {
    throw "Child source history mismatch: $($Child.Name)"
  }

  $sourceStatus = @(& git -C $Source status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect child source status: $($Child.Name)"
  }
  if ($sourceStatus.Count -ne 0) {
    throw "Child source worktree is dirty: $($Child.Name)"
  }

  $trackedFiles = @(& git -C $Source ls-tree -r --name-only HEAD)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect child source tree: $($Child.Name)"
  }
  if ($trackedFiles.Count -ne 1 -or $trackedFiles[0] -ne $Child.File) {
    throw "Child source tree mismatch: $($Child.Name)"
  }
  $childFile = Join-Path $Source $Child.File
  if (
    -not (Test-Path -LiteralPath $childFile -PathType Leaf) -or
    [IO.File]::ReadAllText($childFile) -cne [string]$Child.Content
  ) {
    throw "Child source content mismatch: $($Child.Name)"
  }

  $expectedSubject = "Initialize $($Child.Name) fixture"
  if ((Get-FixtureGitValue $Source show -s --format=%s HEAD) -cne $expectedSubject) {
    throw "Child source commit message mismatch: $($Child.Name)"
  }
  if (
    (Get-FixtureGitValue $Source show -s --format=%an HEAD) -cne $fixtureIdentityName -or
    (Get-FixtureGitValue $Source show -s --format=%ae HEAD) -cne $fixtureIdentityEmail -or
    (Get-FixtureGitValue $Source show -s --format=%cn HEAD) -cne $fixtureIdentityName -or
    (Get-FixtureGitValue $Source show -s --format=%ce HEAD) -cne $fixtureIdentityEmail
  ) {
    throw "Child source commit identity mismatch: $($Child.Name)"
  }
  $expectedEpoch = [DateTimeOffset]::Parse($Child.CommitDate).ToUnixTimeSeconds()
  if (
    (Get-FixtureGitValue $Source show -s --format=%at HEAD) -ne [string]$expectedEpoch -or
    (Get-FixtureGitValue $Source show -s --format=%ct HEAD) -ne [string]$expectedEpoch
  ) {
    throw "Child source commit date mismatch: $($Child.Name)"
  }

  $sourceHead = Get-FixtureGitValue $Source rev-parse HEAD
  $bareHead = Get-FixtureGitValue $Bare rev-parse refs/heads/main
  if ($bareHead -ne $sourceHead) {
    throw "Child provider head mismatch: $($Child.Name)"
  }
  $bareRefs = @(& git -C $Bare for-each-ref --format='%(refname)' refs/heads)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect child provider refs: $($Child.Name)"
  }
  if ($bareRefs.Count -ne 1 -or $bareRefs[0] -ne 'refs/heads/main') {
    throw "Child provider refs mismatch: $($Child.Name)"
  }
  if ((Get-FixtureGitValue $Bare symbolic-ref HEAD) -ne 'refs/heads/main') {
    throw "Child provider default branch mismatch: $($Child.Name)"
  }
  if ((Get-FixtureGitValue $Bare config --bool --get http.receivepack) -ne 'false') {
    throw "Child provider receive-pack policy mismatch: $($Child.Name)"
  }

  return [ordered]@{
    name = [string]$Child.Name
    path = [string]$Child.Path
    head = $sourceHead
    initialized = [bool]$Child.Initialized
    source = [IO.Path]::GetFullPath($Source)
    bare = [IO.Path]::GetFullPath($Bare)
  }
}

function Assert-PreparedFixture {
  param(
    [Parameter(Mandatory = $true)]
    [array]$ChildReceipts
  )

  $gitmodules = Join-Path $fixture '.gitmodules'
  if (-not (Test-Path -LiteralPath $gitmodules -PathType Leaf)) {
    throw 'Prepared fixture is missing .gitmodules.'
  }
  $moduleConfig = @(
    & git -C $fixture config -f .gitmodules --get-regexp '^submodule\..*\.(path|url)$'
  )
  if ($LASTEXITCODE -ne 0 -or $moduleConfig.Count -ne ($children.Count * 2)) {
    throw "Prepared fixture .gitmodules shape mismatch: $($moduleConfig -join '; ')"
  }
  foreach ($child in $children) {
    $configuredPath = Get-FixtureGitValue $fixture config -f .gitmodules --get "submodule.$($child.Path).path"
    $configuredUrl = Get-FixtureGitValue $fixture config -f .gitmodules --get "submodule.$($child.Path).url"
    if ($configuredPath -cne $child.Path -or $configuredUrl -cne "../$($child.Name).git") {
      throw "Prepared fixture .gitmodules entry mismatch: $($child.Name)"
    }
  }

  if ((Get-FixtureGitValue $fixture show -s --format=%s HEAD) -cne $preparedCommitMessage) {
    throw 'Prepared fixture HEAD is not the deterministic submodule commit.'
  }
  if (
    (Get-FixtureGitValue $fixture show -s --format=%an HEAD) -cne $fixtureIdentityName -or
    (Get-FixtureGitValue $fixture show -s --format=%ae HEAD) -cne $fixtureIdentityEmail -or
    (Get-FixtureGitValue $fixture show -s --format=%cn HEAD) -cne $fixtureIdentityName -or
    (Get-FixtureGitValue $fixture show -s --format=%ce HEAD) -cne $fixtureIdentityEmail
  ) {
    throw 'Prepared fixture commit identity mismatch.'
  }
  $preparedEpoch = [DateTimeOffset]::Parse('2026-07-18T20:05:00Z').ToUnixTimeSeconds()
  if (
    (Get-FixtureGitValue $fixture show -s --format=%at HEAD) -ne [string]$preparedEpoch -or
    (Get-FixtureGitValue $fixture show -s --format=%ct HEAD) -ne [string]$preparedEpoch
  ) {
    throw 'Prepared fixture commit date mismatch.'
  }

  $treeEntries = @(
    & git -C $fixture ls-tree HEAD -- .gitmodules modules/material-widget modules/dormant-addon
  )
  if ($LASTEXITCODE -ne 0 -or $treeEntries.Count -ne 3) {
    throw "Prepared fixture tree shape mismatch: $($treeEntries -join '; ')"
  }
  if (-not ($treeEntries | Where-Object { $_ -match '^100644 blob [0-9a-f]{40}\s+\.gitmodules$' })) {
    throw 'Prepared fixture does not track .gitmodules as a regular file.'
  }
  foreach ($childReceipt in $ChildReceipts) {
    $escapedPath = [regex]::Escape([string]$childReceipt.path)
    if (-not ($treeEntries | Where-Object { $_ -match "^160000 commit $($childReceipt.head)\s+$escapedPath$" })) {
      throw "Prepared fixture gitlink mismatch: $($childReceipt.name)"
    }
  }

  $status = @(& git -C $fixture submodule status --)
  if ($LASTEXITCODE -ne 0 -or $status.Count -ne $children.Count) {
    throw "Unexpected submodule states: $($status -join '; ')"
  }
  foreach ($childReceipt in $ChildReceipts) {
    $expectedPrefix = if ($childReceipt.initialized) { ' ' } else { '-' }
    $escapedPath = [regex]::Escape([string]$childReceipt.path)
    $matching = @(
      $status | Where-Object {
        $_ -match "^$([regex]::Escape($expectedPrefix))$($childReceipt.head)\s+$escapedPath(?:\s|$)"
      }
    )
    if ($matching.Count -ne 1) {
      throw "Prepared fixture submodule state mismatch: $($childReceipt.name)"
    }
    $childPath = Join-Path $fixture $childReceipt.path
    if ($childReceipt.initialized) {
      if (
        -not (Test-Path -LiteralPath $childPath -PathType Container) -or
        (Get-FixtureGitValue $childPath rev-parse HEAD) -ne $childReceipt.head
      ) {
        throw "Prepared fixture initialized checkout mismatch: $($childReceipt.name)"
      }
    } elseif (Test-Path -LiteralPath (Join-Path $childPath '.git')) {
      throw "Prepared fixture dormant submodule is unexpectedly initialized: $($childReceipt.name)"
    }
  }

  $porcelain = @(& git -C $fixture status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw 'Fixture status failed.'
  }
  if ($porcelain.Count -ne 0) {
    throw "Fixture is dirty: $($porcelain -join '; ')"
  }
  return $status
}

if ((Get-FixtureGitValue $fixture rev-parse --is-inside-work-tree) -ne 'true') {
  throw "Provider-backed fixture is not a Git working tree: $fixture"
}
$initialFixtureStatus = @(& git -C $fixture status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to inspect the provider-backed fixture.'
}
if ($initialFixtureStatus.Count -ne 0) {
  throw "Fixture must be clean before submodule preparation: $($initialFixtureStatus -join '; ')"
}

$childReceipts = @()
foreach ($child in $children) {
  $source = Join-Path $sourceRoot $child.Name
  $bare = Join-Path $ownerRoot ($child.Name + '.git')
  $sourceExists = Test-Path -LiteralPath $source
  $bareExists = Test-Path -LiteralPath $bare
  if ($sourceExists -xor $bareExists) {
    throw "Child fixture state is partial for $($child.Name): source=$sourceExists bare=$bareExists"
  }
  if (-not $sourceExists) {
    New-ChildFixture -Child $child -Source $source -Bare $bare
  }
  $childReceipts += Assert-ChildFixture -Child $child -Source $source -Bare $bare
}

$gitmodulesPath = Join-Path $fixture '.gitmodules'
$reused = Test-Path -LiteralPath $gitmodulesPath
if (-not $reused) {
  $partialPaths = @()
  foreach ($child in $children) {
    $childPath = Join-Path $fixture $child.Path
    $childMetadata = Join-Path $fixture ('.git\modules\' + $child.Path.Replace('/', '\'))
    if ((Test-Path -LiteralPath $childPath) -or (Test-Path -LiteralPath $childMetadata)) {
      $partialPaths += $child.Path
    }
  }
  $trackedGitlinks = @(
    & git -C $fixture ls-files --stage -- modules/material-widget modules/dormant-addon
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect fixture gitlinks before preparation.'
  }
  if ($partialPaths.Count -ne 0 -or $trackedGitlinks.Count -ne 0) {
    throw "Fixture submodule state is partial without .gitmodules: paths=$($partialPaths -join ', ') gitlinks=$($trackedGitlinks -join '; ')"
  }

  foreach ($child in $children) {
    $bare = Join-Path $ownerRoot ($child.Name + '.git')
    & git -C $fixture -c protocol.file.allow=always submodule add $bare $child.Path | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Submodule add failed for $($child.Name)"
    }
    Invoke-FixtureGit $fixture config -f .gitmodules `
      "submodule.$($child.Path).url" "../$($child.Name).git"
  }

  Invoke-FixtureGit $fixture config user.name $fixtureIdentityName
  Invoke-FixtureGit $fixture config user.email $fixtureIdentityEmail
  Invoke-FixtureGit $fixture add -- .gitmodules modules/material-widget modules/dormant-addon
  Invoke-WithDeterministicCommitEnvironment -Date '2026-07-18T20:05:00Z' -Action {
    Invoke-FixtureGit $fixture commit --quiet -m $preparedCommitMessage
  }
  Invoke-FixtureGit $fixture submodule deinit -f -- modules/dormant-addon
}

$status = @(Assert-PreparedFixture -ChildReceipts $childReceipts)

[ordered]@{
  fixture = [IO.Path]::GetFullPath($fixture)
  head = (Get-FixtureGitValue $fixture rev-parse HEAD)
  preparation = if ($reused) { 'reused' } else { 'created' }
  submodules = $status
  children = $childReceipts
  clean = $true
  gitmodules = [string]([IO.File]::ReadAllText($gitmodulesPath))
} | ConvertTo-Json -Depth 6 -Compress
