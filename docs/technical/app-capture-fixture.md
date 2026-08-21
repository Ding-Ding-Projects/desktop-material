# App Capture Fixture

`script/capture-app.js` launches the built app with **N repositories already
open as tabs**, optionally drives a few UI steps, and writes a PNG. It exists so
screenshots of multi-tab surfaces — the tab overflow dropdown and its search,
collapsed tab groups, a repository list with several rows — can be produced
deterministically instead of being re-derived (and abandoned) by each person who
needs one.

The fixture is evidence for the **current frozen desktop UI** only. Before
adding a gallery image, find its row in the
[current capture ledger](../verification/current-capture-ledger-2026-08-21.md),
capture the packaged renderer from that row's baseline or a later commit, and
record that exact commit. Do not restore a reverted UI or reuse an older gallery
frame merely because its filename resembles the requested surface.

It complements, and does not replace, the two neighbouring harnesses:

- `script/headless-screenshot.js` — the minimal "launch and shoot the first
  window" capture. Still the right tool when one default window is all you need.
- `app/test/e2e/` — the Playwright smoke suite. See
  [E2E Smoke Tests](e2e-smoke-tests.md). The capture fixture reuses its launch
  shape (throwaway `--user-data-dir`, isolated Git environment) but is a capture
  tool, not a test suite.

## Prerequisites

1. A production build staged in `out/`:

   ```bash
   cross-env DESKTOP_SKIP_PACKAGE=1 yarn build:prod
   ```

2. The Electron runtime in `node_modules/electron/dist/`. Override the binary
   with `ELECTRON_EXE` or the app entry point with `--main=` if either lives
   somewhere else.

## Capturing an N-tab scene

```bash
node script/capture-app.js --out=tabs.png --tabs=14 --size=1100x760
```

`--tabs=N` creates N throwaway Git repositories in the system temp directory,
opens one tab per repository, captures, and deletes them again. Use `--repo=`
(repeatable) instead when the capture needs particular repositories:

```bash
node script/capture-app.js --out=tabs.png \
  --repo=C:\code\alpha --repo=C:\code\beta --size=1280x800
```

To capture a surface that only exists after interaction, add `--step=` in the
order the steps should run — for example the overflow dropdown and its search
field:

```bash
node script/capture-app.js --out=overflow.png --tabs=14 --size=1100x760 \
  --step=click:.repository-tab-overflow --step=wait:800
```

Complex sequences can live in a JSON file instead: `--steps-file=steps.json`
holding an array of the same step strings.

### Options

| Option              | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `--out=<png>`             | output file (default `app-shot.png` in the repo root) |
| `--repo=<path>`           | repository to open as a tab (repeatable)              |
| `--tabs=<n>`              | create and open N throwaway repositories              |
| `--repos-root=<d>`        | where those throwaway repositories are created        |
| `--size=<WxH>`            | window content size, applied before the tabs open     |
| `--repo-group=<name>`     | seed every repository row into that named group       |
| `--repo-default-branch=`  | seed every repository row's default branch            |
| `--local-storage=<k>=<v>` | stage one renderer preference (repeatable)            |
| `--step=<step>`           | UI step to run before the capture (repeatable)        |
| `--steps-file=<js>`       | JSON array of steps, appended after every `--step`    |
| `--wait=<ms>`             | settle time before the capture (default 2500)         |
| `--timeout=<ms>`          | per-operation timeout (default 15000)                 |
| `--report=<json>`         | also write a JSON report of the run                   |
| `--main=<main.js>`        | app entry point (default `out/main.js`)               |
| `--keep-user-data`        | keep the throwaway profile for debugging              |
| `--keep-repos`            | keep the throwaway repositories                       |
| `--strict-console`        | exit non-zero when the renderer logged console errors |
| `--window-pixels`         | always photograph the window, not the CSS viewport    |
| `--probe-window-controls` | fail unless Windows caption controls pass at runtime  |
| `--expect-window-controls=<WxH>@<zoom>` | bind that probe to an exact native size and zoom |

### Steps

| Step                       | Effect                                        |
| -------------------------- | --------------------------------------------- |
| `wait:<ms>`                | sleep                                         |
| `wait-for:<selector>`      | wait for a selector to become visible         |
| `click:<selector>`         | click a selector                              |
| `click-text:<text>`        | click by exact visible text (links too)       |
| `right-click:<selector>`   | open a selector's context menu                |
| `hover:<selector>`         | hover a selector                              |
| `mouse:<x>,<y>`            | park the pointer at a viewport coordinate     |
| `blur`                     | drop focus, so no focus tooltip is caught     |
| `reload`                   | restart the renderer, keeping persisted state |
| `scroll:<selector>::<dy>`  | wheel-scroll over a selector by dy pixels     |
| `scroll-to:<selector>`     | scroll a selector into the middle of its pane |
| `type:<selector>::<text>`  | fill a field                                  |
| `press:<key>`              | press a key on the page                       |
| `press:<selector>::<key>`  | press a key on a selector                     |
| `resize:<WxH>`             | resize the window mid-run                     |
| `min-size:<WxH>`           | lower the window's own minimum size           |
| `metrics:<WxH>[@<scale>]`  | override the renderer viewport over CDP       |
| `optional:<step>`          | run a step, but do not fail when it cannot    |

A click leaves the pointer on whatever it clicked, so the shutter often catches
that control's tooltip hanging over the surface being documented. End a sequence
with `mouse:` on an empty corner — `--step=mouse:8,760` — to park the pointer
before the capture. The update banner a fresh profile sometimes shows is cleared
with `--step=optional:press:button[aria-label="Dismiss this message"]::Enter` —
`optional:` because the banner is not always there, and `press:` rather than
`click:` because a click leaves its tooltip behind after the button it was
anchored to has gone. Tooltips follow focus too — a dialog focuses its close
button as it opens — so end a dialog sequence with `--step=blur`, or the pane
you meant to document arrives with the word "Close" printed over it.

Two more traps worth knowing before writing a step list. `:has-text()` is a
case-insensitive **substring** match, so `button:has-text("Run")` also matches
_Preview unreachable object p**run**ing_; use `:text-is()` when the label is
short. And menu items keep a duplicate `.sr-only` copy of their label, so
`click-text:` never resolves one — reach for
`[role=menuitem]:has-text("Manage .gitignore")` instead.

`right-click:` opens the app's own in-page context menu (the Material menu with
the _Filter actions_ field), so the result is a normal DOM surface a screenshot
can see. Aim it at a plain child rather than the element you have in mind: a
repository tab's own label runs a **different** menu, so the tab's commands come
from `right-click:[role=tab] .repository-tab-favorite`. Opening the menu moves
focus to the surface underneath — which is how a context-menu capture ends up
with the host dialog's "Close" tooltip printed over it — so put `blur` **after**
the right click, not before.

### Small windows, and why the shutter changes

Below roughly 1000×600 the app auto-fits its own zoom, and two things follow.

`resize:` alone cannot get there: the window carries a 960×660 minimum and a
smaller `setContentSize` is silently clamped, so the capture would quietly
document the wrong size. `min-size:320x240` lowers the window's floor first, and
the shot stays a photograph of a genuinely small real window rather than an
emulation. `metrics:` is the escape hatch for a size the window still refuses —
it overrides the renderer's viewport over CDP, but only the renderer is fooled,
so anything the app derives from the main process's content size (auto-fit very
much included) keeps seeing the real window. Prefer `min-size:` + `resize:`.

Once the zoom is fitted, `page.screenshot()` frames the wrong rectangle: it
measures in CSS pixels, and a 720×687 window scaled to 72% has a 1000×954 CSS
viewport, so the PNG comes back 1000×954 with the app tucked in one corner and
dead space around it. The fixture notices (`window.devicePixelRatio !== 1`) and
photographs the window through `webContents.capturePage()` instead; the run
prints `via=window-pixels` when it does. `--window-pixels` forces it.

### Windows caption-control acceptance

Add `--probe-window-controls` with a required exact scenario such as
`--expect-window-controls=390x844@2` when a capture is intended to prove the
Windows Minimize, Maximize/Restore, and Close cluster. Before the shutter, the
fixture proves the native content and frameless-window size, Electron zoom,
scaled renderer viewport, and full-width title bar match that request. It then
fails closed unless the named group and all three buttons are visibly rendered,
keyboard focusable, unobstructed at their centre and four inset corners, at
least 44×44 CSS pixels, ordered without overlap, and wholly contained by the
right-pinned title bar. Even fractional clipping or application-menu overlap is
rejected. The same receipt requires a dedicated native drag lane that is at
least 24 CSS pixels wide, reports `-webkit-app-region: drag`, stays inside the
title bar, and is not covered by the application menu or caption cluster. A
separate Lowlevel headless Win32 `WM_NCHITTEST` probe must then return
`HTCAPTION` for the lane and `HTCLIENT` for the caption buttons, proving the
real native hit map rather than merely trusting computed CSS.

Successful `--report` output includes `windowControls` with only public-safe
geometry, zoom/window state, fixed caption labels, verification selectors, and
accessibility facts. It adds no visible application text, repository or account
data, URLs, or filesystem paths beyond the report's pre-existing fixture-path
fields. The probe moves the pointer outside the caption cluster, dispatches
leave events, clears focus, and waits until every `.window-controls-tooltip` is
absent or hidden before privacy inspection and capture.

Electron always launches with `--disable-gpu` before the app entry point,
matching the off-screen Win32 verification contract. The probe also verifies
the switch through Electron's live command line rather than trusting the launch
arguments.

Useful stable selectors on the tab strip: `.repository-tab-strip`,
`.repository-tab-overflow` (the overflow button, present only when tabs actually
overflow), `.repository-tab-overflow-count`, `.repository-tab-search`,
`.repository-tab-arrange`.

## Output

```text
CAPTURE_OK C:\...\overflow.png 1100x760 tabs=14 overflow=true via=page-screenshot
CAPTURE_CONSOLE_ERRORS 0
```

`tabs=` counts the tabs the strip renders **plus** the ones hidden behind the
overflow button, and `overflow=` says whether the overflow control was on screen
when the shutter fired — so a run reports honestly whether the scene you asked
for actually materialised. Every renderer `console.error` and uncaught page
error is printed as a `CAPTURE_CONSOLE` line, which makes a capture run double as
a smoke check; `--strict-console` turns those into a non-zero exit.

## How it seeds the tabs

The interesting part, and the reason the fixture exists:

1. Launch `out/main.js` with a freshly created `--user-data-dir`, plus a
   throwaway `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` / `XDG_CONFIG_HOME` and a
   disabled SSH agent — the same isolation `app/test/e2e/e2e-fixtures.ts` uses.
   Both directories are deleted when the run ends.
2. Drive the first-run flow by **visible text**, in order: _Continue without
   signing in_ → _Finish_ → _Skip for now_. Some of those are links and some are
   buttons, so text is the only selector that matches all three; each one is
   optional, so the sequence is safe to replay after a reload.
3. Write the repositories straight into the renderer's IndexedDB — database
   `Database`, object store `repositories`, the store behind
   `RepositoriesDatabase` — as plain local repository rows.
4. Reload the window. The app reads its repository list once at startup, so the
   seeded rows only become real repositories after a reload. Anything
   `--local-storage=` staged rides along on the same reload, which is the only
   way to set a preference the app reads once while booting — the interface
   scale (`zoom-factor`) being the one the gallery actually needs. `--repo-group=`
   and `--repo-default-branch=` fill the matching columns of the seeded rows.
5. Send one `cli-action` `open-repository` IPC per path from the main process.
   Because each repository now exists in the database, the app takes its own
   `selectRepository` → `ensureTabForRepository` path and opens a tab, instead of
   showing the Add-repository dialog.

Step 5 waits for the tab count to actually rise before sending the next path, so
the capture never races the strip's measurement pass.

## Dead ends — do not re-derive these

These were all tried while attempting the captures behind #22, #73, and #75.
They fail; the fixture exists because of them.

- **`--cli-open` with several paths.** Only the first path is honoured. It opens
  the Add-repository dialog for that one path, and one tab results.
- **Clicking _Open a repository in a new tab_ and filling `input[type="text"]`.**
  The typed path lands in the repositories-sheet filter, not the dialog, and the
  list then reports that it cannot find that repository.
- **<kbd>Ctrl</kbd>+<kbd>O</kbd> then `#add-existing-repository input, dialog
  input[type="text"]`.** The selector never matches.
- **Narrowing the viewport to force overflow with one tab open.** A single tab
  never overflows, however narrow the window is.

## Tests

`script/capture-app-test.mjs` covers the argument and step grammar, the
tab-counting expression (including tabs hidden behind the overflow button), and
the throwaway-repository recipe. It never launches the app, so
`node script/test.mjs script` stays fast and does not depend on a build.
