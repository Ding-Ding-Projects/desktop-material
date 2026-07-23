# Cheap LFS commit progress and push batching — 2026-07-23

This record covers local acceptance of the Cheap LFS commit terminal, bounded
parallel uploads, OCI storage, provider routing, and automatic ordinary-Git
commit/push batching. It does not claim a pushed source commit, exact-source CI,
Pages or wiki publication, or a new installer Release.

## Automated evidence

| Scope | Result |
| --- | ---: |
| Release and OCI operations | 80/80 |
| Registry transport and app-runtime policy | 77/77 |
| Automatic commit/push batching and disposable-Git fixtures | 117/117 |
| Commit UI, settings, and English/Cantonese/bilingual localization | 157/157 |
| Pinned ORAS preparation scripts | 8/8 |
| Headless verifier contract | 17/17 |
| Compact commit-shell style contract | 7/7 |

The full Cheap LFS folder aggregate completed **261/262** checks. Its only
failure was a wall-clock policy case that exceeded the local harness's
2.5-second limit during concurrent heavy Git work. The isolated policy rerun
passed **8/8**, including that same timeout behavior. This distinction is kept
explicit rather than reporting the aggregate wrapper as fully green.

## Production build

The exact current worktree was built through the fixed Lowlevel MCP endpoint on
an off-screen Windows desktop with:

```text
npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod
```

The command returned `0` after **1,466.27 seconds**. The accepted app instance
was launched from that resulting `out/main.js`; no visible user desktop was
used.

## UI evidence

| Frame | Role | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-commit-progress.png` | Promoted wide English frame | 1440×960 | 107,411 | `6d70fce553edcf54cef9bb806bc1d6f38bf8154a7ff2c859e236aba77afdb238` |

The wide receipt passed **36/36** acceptance checks: all **35/35** named surface
assertions plus the required deterministic selection receipt. It kept the
Included, Excluded, and Cheap LFS candidate chips, Regex Builder, wrapped
hidden-files warning, commit controls, storage recommendation, three distinct
worker lanes, complete progress/actions, and the settled over-limit diff state
inside non-overlapping regions. The selected MP4 showed the exact
`The diff is too large to be displayed.` message without a spinner, and the
undo surface was fully outside the capture.

The tracked wide PNG is the only promoted artifact. The 640×960 bilingual
attempt failed closed before capture while waiting for the selected large-file
diff. A read-only follow-up proved bilingual mode and the requested viewport,
but the focused renderer still reported `visibilityState: hidden` after
`Page.bringToFront`; selection IDs were empty, the MP4 had
`aria-selected=false`, and the diff, switcher, loading indicator, and
unrenderable panel were absent. No narrow capture or receipt exists, so narrow
acceptance is not claimed.

## Cleanup and publication boundary

After the tracked wide frame was promoted and hash-verified, the generic close
API could not address the off-screen HWND. A helper launched only on the owned
hidden desktop therefore posted `WM_CLOSE` to the exact revalidated HWND. The
saved Electron process tree exited cleanly; Lowlevel MCP then proved zero owned
windows, closed the named desktop, proved the CDP port free, and containment-
and reparse-checked the direct Temp child before removing the complete run
root. No process was terminated by name or PID.

These results establish local source/build/UI acceptance only. Exact commit and
remote ancestry, CI and CodeQL, Pages, the synchronized wiki, the installer
Release remain for the coordinating publication step and must be recorded
separately after they are actually verified.
