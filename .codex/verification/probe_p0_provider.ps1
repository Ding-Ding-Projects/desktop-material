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
$ready = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
$api = [string]$ready.endpoint
$repo = "$api/repos/$($ready.owner)/$($ready.repository)"
$headers = @{ Authorization = "Bearer $($ready.token)" }

$preflightOptions = @{
  UseBasicParsing = $true
  Method = 'Options'
  Uri = $repo
  Headers = @{
    Origin = 'file://'
    'Access-Control-Request-Method' = 'GET'
    'Access-Control-Request-Headers' = 'authorization,content-type,x-github-api-version'
    'Access-Control-Request-Private-Network' = 'true'
  }
}
$preflight = Invoke-WebRequest @preflightOptions
if (
  $preflight.StatusCode -ne 204 -or
  $preflight.Headers['Access-Control-Allow-Origin'] -ne '*' -or
  $preflight.Headers['Access-Control-Allow-Private-Network'] -ne 'true'
) {
  throw 'Provider CORS preflight contract failed.'
}

$repository = Invoke-RestMethod -Method Get -Uri $repo -Headers $headers
if (
  $repository.full_name -ne "$($ready.owner)/$($ready.repository)" -or
  $repository.clone_url -ne "$($ready.htmlUrl)/$($ready.owner)/$($ready.repository).git"
) {
  throw 'Provider repository identity contract failed.'
}
$encodedBranch = [Uri]::EscapeDataString([string]$ready.featureBranch)
$branch = Invoke-RestMethod -Method Get -Uri "$repo/branches/$encodedBranch" -Headers $headers
$rules = Invoke-RestMethod -Method Get -Uri "$repo/rules/branches/$encodedBranch`?per_page=100" -Headers $headers
if (-not $branch.protected -or $rules.Count -lt 8) {
  throw 'Provider branch-rules contract failed.'
}

$workflows = Invoke-RestMethod -Method Get -Uri "$repo/actions/workflows?per_page=100" -Headers $headers
$runs = Invoke-RestMethod -Method Get -Uri "$repo/actions/runs?per_page=50" -Headers $headers
$runId = [int]$runs.workflow_runs[0].id
$artifacts = Invoke-RestMethod -Method Get -Uri "$repo/actions/runs/$runId/artifacts?per_page=100" -Headers $headers
$artifact = $artifacts.artifacts[0]
$encodedDigest = [Uri]::EscapeDataString([string]$artifact.digest)
$attestations = Invoke-RestMethod -Method Get -Uri "$repo/attestations/$encodedDigest`?per_page=1" -Headers $headers
if (
  $workflows.total_count -ne 1 -or
  $runs.total_count -ne 1 -or
  $artifacts.total_count -ne 1 -or
  @($attestations.attestations).Count -ne 1
) {
  throw 'Provider Actions metadata contract failed.'
}

$download = Join-Path $resolvedRoot 'provider\probe-artifact.zip'
$downloadOptions = @{
  UseBasicParsing = $true
  Method = 'Get'
  Uri = "$repo/actions/artifacts/$([int]$artifact.id)/zip"
  Headers = $headers
  OutFile = $download
}
Invoke-WebRequest @downloadOptions
$downloadInfo = Get-Item -LiteralPath $download
$digest = 'sha256:' + (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
if ($downloadInfo.Length -ne [int64]$artifact.size_in_bytes -or $digest -ne $artifact.digest) {
  throw 'Provider artifact byte contract failed.'
}
Remove-Item -LiteralPath $download -Force

try {
  $receivePackOptions = @{
    UseBasicParsing = $true
    Method = 'Get'
    Uri = "http://127.0.0.1:$([int]$ready.port)/$($ready.owner)/$($ready.repository).git/info/refs?service=git-receive-pack"
  }
  Invoke-WebRequest @receivePackOptions | Out-Null
  throw 'Provider unexpectedly admitted Git receive-pack.'
} catch {
  if ([int]$_.Exception.Response.StatusCode -ne 403) {
    throw
  }
}

[ordered]@{
  endpoint = $api
  htmlUrl = [string]$ready.htmlUrl
  cors = 'pass'
  repository = [string]$repository.full_name
  branchRules = $rules.Count
  workflows = [int]$workflows.total_count
  runs = [int]$runs.total_count
  artifacts = [int]$artifacts.total_count
  artifactSize = [int64]$artifact.size_in_bytes
  artifactDigest = [string]$artifact.digest
  attestationPresence = $true
  receivePack = 'blocked'
} | ConvertTo-Json -Compress
