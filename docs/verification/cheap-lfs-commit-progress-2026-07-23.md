# Cheap LFS commit progress and push batching — 2026-07-23

This record covers the final local first-publication acceptance of the Cheap
LFS commit terminal, bounded parallel uploads, OCI storage, provider routing,
automatic ordinary-Git commit/push batching, and its compact Repository
Releases companion surface. Initial integration commit `c3db37ea55` is pushed;
the isolated responsive correction is now exact-source build/UI accepted but
not yet published. This receipt does not claim the correction's CI, CodeQL,
Pages or wiki publication, new installer Release, GitHub Discussion summary, or
the still-pending final Bambu live Action/fresh-clone proof.

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

The historical combined rerun for the initial integration passed **151/151**.
The corrected Releases style/localization/UI plus Pages contracts pass
**55/55**. A final 152-test integrated rerun ran for 693 seconds without an
observed failure, then was stopped cleanly during the disposable-Git batching
suite at the user's explicit immediate-push request. It has no aggregate pass
claim; a complete rerun remains a handoff item.

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

The initial first-publication command returned `0` after **400.46 seconds**
(**404.3 seconds wall**). Its compiled `out/renderer.css` was 1,178,671 bytes
with SHA-256
`6381556b36c295ba47ad90e8080f4079cbc61951bd7811ab9cb9fc3520638cb1`.

After widening the combined compact gate from 760×520 to 800×560, the corrected
exact-source command returned `0` after **390 seconds wall** (Yarn **387.64
seconds**). Its 1,179,200-byte `out/renderer.css` has SHA-256
`6fba1434112ea5c02256a12e6ce8af42f5c870f0db5835155acb8075708d9d28`,
and `out/renderer.js` has SHA-256
`424c928a6a0f6e3e2437f1549e55ec7e26d8cd98758f6ea22ca53e1d5fb5f32e`.
The accepted correction app launched from that exact `out/main.js`; no visible
user desktop was used.

An earlier interim build returned `0` after **1,466.27 seconds**. That timing
and the 400.46-second initial integration build remain historical evidence; the
390-second corrected build and bundle hashes above are authoritative for the
current compact Releases frame.

## UI evidence

| Frame | Role | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `docs/assets/screenshots/cheap-lfs-commit-progress.png` | Promoted wide English frame | 1440×960 | 113,869 | `3d6358567126e3ce0504b04c4489abbfd473b77546bd82dac834553d50fe9333` |
| Ephemeral inspected narrow frame | Accepted local bilingual frame; not gallery-promoted | 640×960 | 85,175 | `1b99c827d1b5b2cf05298fb1255873acdf0502f72a40437c378c0be7bb989e50` |
| `docs/assets/screenshots/material-github-releases-compact.png` | Corrected promoted 200%-zoom Releases frame | 960×660 | 89,856 | `8e29ac666a0832d353126d8dd759200ba7e853016a940501e5c7cbdbb1cf992a` |

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

The corrected Repository Releases proof kept one constant 960×660 physical
viewport while probing 100% (960×660 CSS), 125% (768×528 CSS), 150% (640×440
CSS), and 200% (480×330 CSS). Every scale had exactly zero document/body/root/
panel horizontal overflow and at least one complete release row. The 125%,
150%, and 200% cases activated the compact presentation and measured a 176 px
list panel, 52.83–53.5 px rows, 30 px checkbox/control floors, a 9 px metadata
floor, three metric columns, and a two-column latest card. All three populated
rows carried locale-aware 24-hour `HH:mm` timestamps. Native Enter expanded and
collapsed the localized disclosure; search, status, selection, and release-row
actions retained focus semantics, while the no-next-page pagination action
remained correctly disabled. The gallery source remains **76** images.

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
before removing the complete run root. No process was terminated by name or PID
in that historical run. For the final correction, the exact launch returned
PID `20836`, dynamically resolved HWND `1905774`, CDP port `52613`, provider PID
`16700`, and provider port `53748`. The native close API could not address the
revalidated hidden HWND, so only PID `20836` was stopped after exact executable/
profile/fixture/port provenance checks. Lowlevel MCP then reported zero windows.
The synthetic credential was deleted and independently proved absent, provider
PID `16700` was command-line validated and stopped, both ports were proved free,
and the named desktop closed successfully on retry. The cleanup helper removed
only the exact owned Temp root; an independent audit found it absent, both saved
PIDs absent, zero referencing processes, and zero listeners. The separately
owned installed Bambu acceptance environment remained untouched.

These results establish local source/build/UI acceptance for pushed initial
integration commit `c3db37ea55` and its pending isolated responsive correction.
CI and CodeQL, Pages, synchronized wiki, the installer Release, and the required
GitHub Discussion remain for the correction's publication step and must be
recorded separately after they are actually verified. The final Bambu live
workflow/Action and fresh-clone materialization proof likewise remains pending
and is not claimed.
