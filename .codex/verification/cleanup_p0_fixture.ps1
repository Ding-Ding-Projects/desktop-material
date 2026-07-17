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
if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
  throw "Owned run root does not exist: $resolvedRoot"
}

$readyPath = Join-Path $resolvedRoot 'provider\ready.json'
if (Test-Path -LiteralPath $readyPath -PathType Leaf) {
  $ready = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
  if (Get-Process -Id ([int]$ready.pid) -ErrorAction SilentlyContinue) {
    throw "Provider process is still running: $([int]$ready.pid)"
  }
}
$excludedProcessIds = [Collections.Generic.HashSet[uint32]]::new()
$cursorProcessId = [uint32]$PID
while ($cursorProcessId -ne 0 -and $excludedProcessIds.Add($cursorProcessId)) {
  $cursor = Get-CimInstance Win32_Process -Filter "ProcessId = $cursorProcessId"
  if ($null -eq $cursor) {
    break
  }
  $cursorProcessId = [uint32]$cursor.ParentProcessId
}
$owners = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      -not $excludedProcessIds.Contains([uint32]$_.ProcessId) -and
      $_.CommandLine -and
      $_.CommandLine.IndexOf($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Select-Object ProcessId, Name
)
if ($owners.Count -gt 0) {
  throw "Processes still reference the owned run root: $($owners | ConvertTo-Json -Compress)"
}

Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
if (Test-Path -LiteralPath $resolvedRoot) {
  throw "Owned run root cleanup failed: $resolvedRoot"
}
[ordered]@{
  root = $resolvedRoot
  removed = $true
} | ConvertTo-Json -Compress
