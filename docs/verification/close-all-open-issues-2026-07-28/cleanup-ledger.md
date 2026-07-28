# Close-all-open-issues cleanup ledger

- Run ID: `close-all-open-issues-20260728`
- Cleanup owner: the coordinated headless verification run described in
  `run-manifest.md`
- Status: **Open — identifiers are reserved below; no run-owned temporary
  resource has been created yet**

## Owned resources

The exact values will be recorded here before each resource is created. Every
entry must be containment-checked and marked removed or intentionally retained
with a reason before the run is complete.

| Resource | Exact identifier or path | Created | Cleanup result |
| --- | --- | --- | --- |
| Run root | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65` | yes | pending |
| Rejected empty P0 root | `C:\Users\cntow\AppData\Local\Temp\dm-close-1581a0ec8c65-p0` | yes | removed after validation; its name did not match the fixture script's ownership prefix |
| Short-path P0 runtime root | `C:\Users\cntow\AppData\Local\Temp\desktop-material-p0-ui-c1581a0e` | no | pending |
| Git fixture | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\fixture` | no | pending |
| Bare fixture remote | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\remote.git` | no | pending |
| Electron user data | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\user-data` | no | pending |
| Candidate captures | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\captures` | yes | pending |
| Run logs | `C:\Users\cntow\AppData\Local\Temp\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs` | yes | pending |
| Off-screen Win32 desktop | `DesktopMaterialCloseIssues-20260728-1581a0ec8c65` | no | pending |
| Built Electron process | pending | no | pending |
| Optional disposable Linux environment | pending | no | pending |
| Test-only credential-vault entries | pending | no | pending |

## Cleanup proof

Pending. The completed ledger will record graceful HWND closure, exact-PID
fallback if needed, desktop closure, containment-checked path removal, temporary
environment destruction, credential cleanup, and post-run absence checks.
