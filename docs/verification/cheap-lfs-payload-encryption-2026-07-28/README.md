# Cheap LFS payload encryption — built-app capture, 2026-07-28

Visual evidence for [issue #78](https://github.com/Ding-Ding-Projects/desktop-material/issues/78)
(optional password encryption for Cheap LFS payloads).

## What was captured

| File | Surface |
| --- | --- |
| `cheap-lfs-settings-encryption.png` | Repository settings → **Cheap LFS**, showing the **Release payload encryption** section |
| `payload-password-dialog.png` | The **Change the saved Release payload password** dialog opened from **Set password…** |

## Provenance

- **Commit:** `334a601589` (`main`)
- **Build:** production webpack configuration (`app/webpack.production.ts`), renderer and
  main entries built one process at a time into a private output directory.
- **Capture method:** `script/capture-app.js` driving the real built `main.js` through
  Playwright's Electron driver, with one seeded repository and a throwaway user-data
  directory. Repository settings is reached with the fixture's `menu:` step, which sends the
  same `menu-event` IPC the real application menu sends.
- **Renderer console errors during capture:** 0.

Neither image is a mockup, a design file, or a hand-edited picture. Both are screenshots of
the running application.

## Why the build was not the ordinary `yarn build:dev`

Two facts made the obvious route unusable, both recorded because they cost real time:

1. **`yarn compile:dev` exhausts a 10 GB V8 heap.** The webpack config exports six
   configurations and the CLI builds them concurrently in one `MultiCompiler`, each holding a
   full module graph. Building one configuration per process succeeds comfortably.
2. **The development renderer config injects the webpack-hot-middleware client and sets
   `publicPath` to `http://localhost:3000/build/`.** Its emitted `index.html` therefore points
   the packaged app at a dev server that is not running, and the window renders nothing at
   all. A capture needs the production bundle.

A third trap is worth stating plainly: a build piped into `tail` returns `tail`'s exit status,
not the build's. Two out-of-memory failures were reported as success while `out/renderer.js`
stayed hours old, and a capture was taken of that stale bundle — which is how a feature that
had shipped correctly briefly appeared to be missing from the settings tab.

## What these images do and do not prove

They show the encryption controls exist, are reachable, are laid out without clipping at
1440×960, and that the dialog states its consequences before the user opts in — including
that saving the password lets anyone using the same Windows account decrypt with it.

They do **not** show an encrypted upload or restore. That needs a live provider and a real
large-file transfer, which this host cannot perform; no image here should be read as evidence
of the transfer path.
