[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowsArgvOracle {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(string value, out int count);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr value);
  public static string[] Parse(string value) {
    int count;
    IntPtr memory = CommandLineToArgvW(value, out count);
    if (memory == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
    try {
      var result = new string[count];
      for (int i = 0; i < count; i++)
        result[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size));
      return result;
    } finally { LocalFree(memory); }
  }
}
'@
$inputs = ConvertFrom-Json ([Console]::In.ReadToEnd())
$results = [System.Collections.Generic.List[object]]::new()
foreach ($value in $inputs) {
  $results.Add([WindowsArgvOracle]::Parse([string]$value))
}
[Console]::Out.Write((ConvertTo-Json -InputObject $results.ToArray() -Depth 5 -Compress))
