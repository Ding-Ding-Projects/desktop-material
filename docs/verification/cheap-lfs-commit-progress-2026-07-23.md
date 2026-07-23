# Cheap LFS commit progress and push batching — 2026-07-23

This record covers the final local first-publication acceptance of the Cheap
LFS commit terminal, bounded parallel uploads, OCI storage, provider routing,
automatic ordinary-Git commit/push batching, and its compact Repository
Releases companion surface. It does not claim a pushed source commit,
exact-source CI, Pages or wiki publication, a new installer Release, or the
still-pending final Bambu live Action/fresh-clone proof.

## Automated evidence

| Scope | Result |
| --- | ---: |
| Release and OCI operations | 80/80 |
| Registry transport and app-runtime policy | 77/77 |
| Automatic commit/push batching and disposable-Git fixtures | 117/117 |
| Commit UI, settings, and English/Cantonese/bilingual localization | 157/157 |
| Pinned ORAS preparation scripts | 8/8 |
| Headless verifier contract | 19/19 |
| Compact commit-shell style contract | 7/7 |

The final combined rerun of every unit/style suite changed across the
integrated feature commits and this acceptance delta passed **151/151**.

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

The final command returned `0` after **400.46 seconds** (**404.3 seconds wall**).
The compiled `out/renderer.css` is 1,178,671 bytes with SHA-256
`6381556b36c295ba47ad90e8080f4079cbc61951bd7811ab9cb9fc3520638cb1`.
The accepted app instance was launched from that resulting `out/main.js`; no
visible user desktop was used.

An earlier interim build returned `0` after **1,466.27 seconds**. That timing is
retained as historical evidence, but the final build and bundle hash above are
the authoritative first-publication receipt.

## UI evidence

| Frame | Role | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-commit-progress.png` | Promoted wide English frame | 1440×960 | 113,869 | `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333` |
| Ephemeral inspected narrow frame | Accepted local bilingual frame; not gallery-promoted | 640×960 | 85,175 | `1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50` |
| `docs/assets/screenshots/material-github-releases-compact.png` | Promoted 200%-zoom Releases frame | 960×660 | 78,875 | `56991b51946a32740995168bd9f97f091b1d183f6df696a205556df6759bcb37` |

The final wide receipt passed all **36/36** named surface assertions, including
`noBlockingDialog`, plus the required deterministic selection receipt. It kept the
Included, Excluded, and Cheap LFS candidate chips, Regex Builder, wrapped
hidden-files warning, commit controls, storage recommendation, three distinct
worker lanes, complete progress/actions, and the settled over-limit diff state
inside non-overlapping regions. The selected MP4 showed the exact
`The diff is too large to be displayed.` message without a spinner, and the
undo surface was fully outside the capture.

The final 640×960 bilingual receipt also passed all **36/36** named assertions.
After hidden-HWND activation, one real pointer attempt selected the MP4 and
settled the same over-limit diff. All three 28-pixel worker rows stayed inside
the 178-pixel terminal; the progress surface ended at y=942 inside the panel's
y=944 bottom. The viewport had no horizontal overflow and the runtime contained
none of the diagnostic style IDs used during earlier investigation. Its
semantic receipt and hash are retained as local acceptance evidence rather than
a second gallery asset; the ephemeral PNG was removed with its validated owned
Temp root.

The compact Repository Releases proof used a 480×330 CSS viewport at 200% zoom
(`devicePixelRatio: 2`) and passed all **12/12** geometry/semantic assertions.
Its 140-pixel list panel contains one complete 42-pixel release row; the
timestamps are locale-aware 24-hour `HH:mm`, and document/body widths have no
horizontal overflow. Native Enter expanded the tools disclosure, after which
filters, bulk controls, the release list, and pagination were all reachable in
keyboard order. Adding this compact screenshot brings the first-publication
gallery source to **76** images.

For historical audit only, the interim wide frame was 107,411 bytes with
SHA-256
`6d70fce553edcf54cef9bb806bc1d6f38bf8154a7ff2c859e236aba77afdb238`.
That interim pass had 35 named assertions plus one pointer receipt; its
640×960 bilingual attempt failed closed because the renderer stayed
visibility-hidden. The final compiled-source receipts above supersede that
narrow failure without erasing it.

## Cleanup and publication boundary

For the interim run, after the then-tracked wide frame was promoted and
hash-verified, the generic close API could not address the off-screen HWND. A
helper launched only on the owned hidden desktop therefore posted `WM_CLOSE` to
the exact revalidated HWND. The saved Electron process tree exited cleanly;
Lowlevel MCP then proved zero owned windows, closed the named desktop, proved
the CDP port free, and containment- and reparse-checked the direct Temp child
before removing the complete run root. No process was terminated by name or
PID. The final source-acceptance app/process tree, provider child, hidden
desktops, provider credential, CDP listeners, and validated owned Temp roots
were likewise removed or proved absent. Only the separately owned installed
Bambu acceptance environment remains intentionally live for the pending
workflow and fresh-clone gate.

These results establish local source/build/UI acceptance only. Exact commit and
remote ancestry, CI and CodeQL, Pages, the synchronized wiki, and the installer
Release remain for the coordinating publication step and must be recorded
separately after they are actually verified. The final Bambu live
workflow/Action and fresh-clone materialization proof likewise remains pending
and is not claimed.
