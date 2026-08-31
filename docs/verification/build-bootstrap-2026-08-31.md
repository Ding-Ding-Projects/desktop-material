# Root build bootstrap verification, 2026-08-31

## Scope

The repository's committed `build.bat /s` path was run from the isolated task
worktree at commit `c2f0fb6de969329628bc3dd60feef2dfe994d3fb`. The command ran its
own dependency preparation, production compilation, resource copy, license
generation, unsigned packaging, and output validation. It did not publish,
tag, push, or create a release.

## Attempts

The first attempt stopped after `00:02:31` when the production webpack process
exited with Windows status `-1073741819` (`0xC0000005`, access violation). It
emitted no compiler diagnostic or source assertion before the process exit.

The unchanged second attempt used the same command, source commit, dependency
tree, and worktree. It passed the first attempt's crash point, completed every
webpack entry, built the runnable application, and exited successfully in
`00:06:04`. The first result remains part of the record; one successful retry
does not rewrite it into a successful attempt.

## Successful output

| Output | Size | SHA-256 |
| --- | ---: | --- |
| `dist/GitHubDesktop-win32-x64/GitHubDesktop.exe` | 226,564,608 bytes | `428ad7c72c1ea56ec82a2b39366c797f493705b6788bd182d57ee7a5c32ebf37` |
| `resources/app/package.json` | 476 bytes | `18721c53bf4063eb9a82f4ed22ee3f057c99215566571abc976444ac3ca6c1bc` |
| `resources/app/main.js` | 4,630,772 bytes | `bdc178337d50e5bc92606cd4b1c0a856c5104ab58bf01011f0b5934f57e493fe` |
| `resources/app/renderer.js` | 13,391,015 bytes | `7dcb8cf57ae561fccb8eacfe721d2b1008a8c9610a47e9ab7c5a5c5dd0b6a4a6` |
| `resources/app/crash.js` | 176,708 bytes | `8a4d9fdc0fddc90e4684e5b0d4555b3a3e36d6b20b37d7efbd93891de8d582eb` |
| `resources/app/quick-action.js` | 5,721,382 bytes | `a975142235a838c93579bb5fcbdfe9173248dd66f844ffdd8dcfe0d0fd57e58f` |

The executable's signing state was verified as unsigned. The Windows shell
extension was skipped because the local Visual Studio installation did not
expose the required C++ x64 tools. That optional integration result does not
alter the runnable desktop output above.

## Focused contract verification

`node script/test.mjs script/build-windows-contract-test.mjs` passed 16 tests.
They cover dependency-first entrypoints, silent mode, interactive-only
elevation, pinned toolchain bootstrap, native prerequisite freshness, warm-tree
reuse, recovery state, unsigned output, stale/incomplete output rejection,
installer-only Squirrel sequencing, and reproducible receipts.

## Remaining evidence

This receipt proves the local runnable build and its output. It does not prove
the installer path, a fresh virtual machine, built-application interaction,
screen capture, remote CI, release publication, or live downloadability. Those
remain separate verification records.
