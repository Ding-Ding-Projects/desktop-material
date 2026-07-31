<#
.SYNOPSIS
Stage the P0 fixture account token where the built app's keytar will find it.

.DESCRIPTION
`capture_gallery_cdp.js`'s `seed` scene writes the fixture account into
`localStorage.users` and then requires the app store to have hydrated it. That
hydration reads the token through `TokenStore.getItem`, i.e. keytar, so the
token has to already be in the Windows credential store before the app boots.
Without this step `seed` fails with:

    Disposable fixture account/repository hydration failed:
    {"appStore":true,"accountCount":0,"fixtureAccountMatched":false,
     "fixtureTokenPresent":false,...}

Two details make a hand-written credential invisible to keytar, and both cost
real debugging time before they were written down here:

1. **Target name.** keytar does not use the service alone. `keytar_win.cc`
   builds `target_name = service + '/' + account`, so the credential must be
   stored under `GitHub Desktop Dev - <endpoint>/<login>`, not
   `GitHub Desktop Dev - <endpoint>`.
2. **Blob encoding.** keytar stores `std::string` bytes directly
   (`cred.CredentialBlob = password.data()`), which is **UTF-8**. A credential
   written with UTF-16 (the natural .NET default, and what `Encoding.Unicode`
   produces) reads back as mojibake and the account is dropped.

`cmdkey.exe` cannot be used for this: it rejects a target name containing both
`: ` and spaces, which every `GitHub Desktop Dev - http://localhost:PORT/api/v3`
service string does.

The service prefix itself depends on the build: `getKeyForEndpoint()` in
`app/src/lib/auth.ts` yields `GitHub Desktop Dev` when `__DEV__` is set and
`GitHub` otherwise. A `RELEASE_CHANNEL=development` build is `__DEV__`, which is
what the provider's `ready.json` assumes. This script reads the service string
out of `ready.json` rather than reconstructing it, so a channel change cannot
silently desynchronise the two.

.PARAMETER RunRoot
The owned `desktop-material-p0-ui-*` run root under TEMP whose
`provider\ready.json` describes the running fixture provider.

.PARAMETER Remove
Delete the credential instead of writing it. Use this in the run's cleanup path.

.EXAMPLE
.\set_p0_provider_credential.ps1 -RunRoot $root
.EXAMPLE
.\set_p0_provider_credential.ps1 -RunRoot $root -Remove
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$RunRoot,
  [switch]$Remove
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

$readyFile = Join-Path $resolvedRoot 'provider\ready.json'
if (-not (Test-Path -LiteralPath $readyFile -PathType Leaf)) {
  throw "Provider readiness receipt does not exist: $readyFile"
}
$ready = Get-Content -LiteralPath $readyFile -Raw | ConvertFrom-Json

foreach ($field in @('credentialService', 'accountLogin', 'token', 'endpoint')) {
  if ([string]::IsNullOrWhiteSpace($ready.$field)) {
    throw "Provider readiness receipt lacks $field."
  }
}
# The provider binds loopback only. Refuse to place a credential for anything
# else, so this can never be pointed at a real endpoint by a doctored receipt.
if ($ready.endpoint -notmatch '^http://(localhost|127\.0\.0\.1):\d+/api/v3$') {
  throw "Refusing to stage a credential for a non-loopback endpoint: $($ready.endpoint)"
}

$typeName = 'DesktopMaterialKeytarCredential'
if (-not ($typeName -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DesktopMaterialKeytarCredential
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct CREDENTIAL
  {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  private const uint GENERIC = 1;
  private const uint LOCAL_MACHINE = 2;

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);

  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern void CredFree(IntPtr buffer);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredDeleteW(string target, uint type, uint flags);

  private static string Target(string service, string account)
  {
    return service + "/" + account;
  }

  public static int Write(string service, string account, string secret)
  {
    byte[] blob = Encoding.UTF8.GetBytes(secret);
    IntPtr buffer = Marshal.AllocCoTaskMem(blob.Length);
    Marshal.Copy(blob, 0, buffer, blob.Length);
    CREDENTIAL credential = new CREDENTIAL();
    credential.Type = GENERIC;
    credential.TargetName = Target(service, account);
    credential.UserName = account;
    credential.CredentialBlob = buffer;
    credential.CredentialBlobSize = (uint)blob.Length;
    credential.Persist = LOCAL_MACHINE;
    bool ok = CredWriteW(ref credential, 0);
    int error = ok ? 0 : Marshal.GetLastWin32Error();
    Marshal.FreeCoTaskMem(buffer);
    return error;
  }

  public static string Read(string service, string account)
  {
    IntPtr raw;
    if (!CredReadW(Target(service, account), GENERIC, 0, out raw))
    {
      return null;
    }
    try
    {
      CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(raw, typeof(CREDENTIAL));
      byte[] blob = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, blob, 0, (int)credential.CredentialBlobSize);
      return Encoding.UTF8.GetString(blob);
    }
    finally
    {
      CredFree(raw);
    }
  }

  public static int Delete(string service, string account)
  {
    return CredDeleteW(Target(service, account), GENERIC, 0) ? 0 : Marshal.GetLastWin32Error();
  }
}
'@
}

$service = $ready.credentialService
$account = $ready.accountLogin
$target = "$service/$account"

if ($Remove) {
  $code = [DesktopMaterialKeytarCredential]::Delete($service, $account)
  # 1168 is ERROR_NOT_FOUND: already absent is the intended end state.
  if ($code -ne 0 -and $code -ne 1168) {
    throw "CredDelete failed for $target with Win32 error $code."
  }
  Write-Output (
    [ordered]@{
      action  = 'remove'
      target  = $target
      removed = ($code -eq 0)
      absent  = ($code -eq 1168)
    } | ConvertTo-Json -Compress
  )
  return
}

$code = [DesktopMaterialKeytarCredential]::Write($service, $account, $ready.token)
if ($code -ne 0) {
  throw "CredWrite failed for $target with Win32 error $code."
}

# Prove the round trip rather than trusting the write. A UTF-16 blob or a
# service-only target both succeed at CredWrite and then fail to read back as
# the token, which is exactly the silent failure this script exists to prevent.
$readBack = [DesktopMaterialKeytarCredential]::Read($service, $account)
if ($readBack -ne $ready.token) {
  throw "Credential $target did not read back as the fixture token."
}

Write-Output (
  [ordered]@{
    action           = 'write'
    target           = $target
    service          = $service
    account          = $account
    endpoint         = $ready.endpoint
    blobEncoding     = 'utf-8'
    roundTripMatched = $true
  } | ConvertTo-Json -Compress
)
