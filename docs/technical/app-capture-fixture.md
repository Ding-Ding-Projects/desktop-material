# App Capture Fixture

`script/capture-app.js` launches the built app with **N repositories already
open as tabs**, optionally drives a few UI steps, and writes a PNG. It exists so
screenshots of multi-tab surfaces — the tab overflow dropdown and its search,
collapsed tab groups, a repository list with several rows — can be produced
deterministically instead of being re-derived (and abandoned) by each person who
needs one.

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
| `--out=<png>`       | output file (default `app-shot.png` in the repo root)  |
| `--repo=<path>`     | repository to open as a tab (repeatable)               |
| `--tabs=<n>`        | create and open N throwaway repositories               |
| `--repos-root=<d>`  | where those throwaway repositories are created         |
| `--size=<WxH>`      | window content size, applied before the tabs open      |
| `--step=<step>`     | UI step to run before the capture (repeatable)         |
| `--steps-file=<js>` | JSON array of steps, appended after every `--step`     |
| `--wait=<ms>`       | settle time before the capture (default 2500)          |
| `--timeout=<ms>`    | per-operation timeout (default 15000)                  |
| `--report=<json>`   | also write a JSON report of the run                    |
| `--main=<main.js>`  | app entry point (default `out/main.js`)                |
| `--keep-user-data`  | keep the throwaway profile for debugging               |
| `--keep-repos`      | keep the throwaway repositories                        |
| `--strict-console`  | exit non-zero when the renderer logged console errors  |

### Steps

| Step                          | Effect                                     |
| ----------------------------- | ------------------------------------------ |
| `wait:<ms>`                   | sleep                                      |
| `wait-for:<selector>`         | wait for a selector to become visible      |
| `click:<selector>`            | click a selector                           |
| `click-text:<text>`           | click by exact visible text (links too)    |
| `hover:<selector>`            | hover a selector                           |
| `type:<selector>::<text>`     | fill a field                               |
| `press:<key>`                 | press a key on the page                    |
| `press:<selector>::<key>`     | press a key on a selector                  |
| `resize:<WxH>`                | resize the window mid-run                  |

Useful stable selectors on the tab strip: `.repository-tab-strip`,
`.repository-tab-overflow` (the overflow button, present only when tabs actually
overflow), `.repository-tab-overflow-count`, `.repository-tab-search`,
`.repository-tab-arrange`.

## Output

```text
CAPTURE_OK C:\...\overflow.png 1100x760 tabs=14 overflow=true
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
   seeded rows only become real repositories after a reload.
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
