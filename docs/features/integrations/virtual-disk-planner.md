# Virtual disk planner / 虛擬磁碟計劃器

**Repository tools → Virtual disk planner** checks a Windows virtual disk
operation and shows the exact `diskpart` script for it.

「Repository tools → Virtual disk planner」會檢查你想做嘅 Windows 虛擬磁碟操作，再畀返
一段一模一樣可以用嘅 `diskpart` 指令稿。

> [!IMPORTANT]
> It plans; it does not run. Nothing here creates, attaches or changes a disk.
> You copy the script and run it yourself from an elevated terminal, where
> Windows asks for your approval. Running it for you from the app is not built.

## What it covers

| Operation | Script |
| --- | --- |
| Create (.vhd or .vhdx, expandable or fixed) | `create vdisk file="…" maximum=<MB> type=…` |
| Attach, optionally read-only | `select vdisk` then `attach vdisk [readonly]` |
| Detach | `select vdisk` then `detach vdisk` |
| Grow the maximum size | `select vdisk` then `expand vdisk maximum=<MB>` |
| Compact an expandable disk | attach read-only, `compact vdisk`, detach |
| Merge a differencing disk | `select vdisk` then `merge vdisk depth=<n>` |

Each plan comes with one sentence saying what it does and what to watch for;
merge says plainly that it changes the parent and cannot be undone.

## Checks

- The path must be a full Windows path ending in `.vhd` or `.vhdx`, with no
  quotation marks or line breaks, so nothing typed can add a command to the
  script. Network paths are refused.
- Sizes are whole megabytes, at least 3 MB, at most 2,040 GB for `.vhd` and
  64 TB for `.vhdx`. Merge depth is 1 to 16.
- Every problem is listed, not only the first.

## Not built

VHD Set and ISO handling, converting between formats, checkpoints, Dev Drive,
native boot, listing attached disks, and running the script with elevation.

## Verification

`app/test/unit/virtual-disks-test.ts` (5 tests) and
`app/test/unit/ui/virtual-disk-planner-test.tsx` (1 test) pass on Linux, and the
TypeScript check passes. No script was run against `diskpart`: the command
forms follow Microsoft's documented syntax and were not executed on Windows.
