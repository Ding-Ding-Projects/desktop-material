# Linux TUI revival cleanup ledger

| Resource | Created | Cleanup state |
| --- | --- | --- |
| Temporary WSL distribution | No | Nothing to remove; WSL virtualization was unavailable |
| Isolated Docker/Xvfb container | Pending | Must be removed after captures and exit verification |
| Temporary Linux fixture repository | Pending | Must be removed with its isolated container |
| Local verification virtual environment | Yes, outside the repository | Retained only through the verification run, then removable |

No existing container, checkout, user repository, or unrelated workload is in
the cleanup scope.
