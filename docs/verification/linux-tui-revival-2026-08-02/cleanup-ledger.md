# Linux TUI revival cleanup ledger

| Resource | Created | Cleanup state |
| --- | --- | --- |
| Temporary WSL distribution | No | Nothing to remove; WSL virtualization was unavailable |
| Isolated Docker/Xvfb container | `dmt-tui-verify-019fc48b` on the selected isolated Docker host | Running with 2 CPUs, 4 GiB memory, a 512-process limit, no published ports, and a task-specific label; must be removed after captures and exit verification |
| Temporary Linux fixture repository | Pending inside `dmt-tui-verify-019fc48b` | Must be removed with its isolated container |
| Local verification virtual environment | Yes, outside the repository | Retained only through the verification run, then removable |
| Lowlevel source-transfer archive | `lowlevel-019fc48b.tar` in the Windows and Docker-host temporary directories, plus `/tmp/lowlevel.tar` in the container | Owned task artifacts awaiting the final cleanup pass; the execution environment rejected the first direct deletion attempt, so their exact paths are retained here rather than hidden |

No existing container, checkout, user repository, or unrelated workload is in
the cleanup scope.
