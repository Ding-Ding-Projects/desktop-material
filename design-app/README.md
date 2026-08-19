# Desktop Material design reference app

This small developer-only Electron application renders the tracked files in
`design/` without copying or modifying them. It provides a searchable reference
picker, the deterministic state routes already owned by the design-reference
capture driver, theme and viewport controls, and exact source/state identity.

The application is local-only. It replaces the design documents' React,
ReactDOM, and Google Fonts requests in memory with checked-in resources, then
blocks every HTTP and HTTPS request in the Electron session. The source files
under `design/` remain byte-for-byte unchanged.

## Run the viewer

Install the repository dependencies first, then run:

```powershell
node design-app/run.mjs
```

The launcher finds Electron in the current checkout or the primary worktree
that owns the shared Git directory. An explicit executable may be provided
through `DESKTOP_MATERIAL_ELECTRON`.

Select a deterministic initial state from the command line:

```powershell
node design-app/run.mjs --reference "Desktop Material v2.dc.html" --state regex-builder --theme light --width 1240 --height 725 --auto-fit false
```

Every option uses an explicit value. List the exact tracked references, hashes,
routes, actions, and viewport contracts without starting Electron:

```powershell
node design-app/run.mjs --list true
```

## Capture one design state

The capture path must be absolute, must end in `.png`, must have an existing
parent directory, and must not already exist:

```powershell
node design-app/run.mjs --capture "C:\absolute\new-output\regex-builder.png" --reference "Desktop Material v2.dc.html" --state regex-builder --theme light --width 1240 --height 725 --auto-fit false
```

Capture mode creates a hidden frameless renderer at device scale 1, applies the
same allowlisted actions as `.codex/verification/capture_design_reference_cdp.js`,
waits for the runtime and local fonts, settles motion, captures exactly the
requested viewport, and prints a JSON receipt with the file identity, state,
observed labels, dimensions, byte count, and SHA-256.

## Boundaries

- `Desktop Material v2.dc.html` reuses the existing 16-route deterministic
  capture registry. `History MD3.dc.html` has a separate hand-written registry
  for all eight destinations, major dialog/detail/builder/toast/progress/empty
  states, and every reachable menu overlay. `Desktop Material.dc.html` opens in
  its source-default state.
- The History source defines a compose menu specification that no source-owned
  click or context-menu action can open. The list receipt reports it as
  unreachable instead of injecting component state or pretending it is a
  selectable screen.
- This tool produces reference images. It does not claim that the production
  application matches them and it does not perform image comparison.
- Output overwrite is deliberately refused. Use a new output path for every
  capture so evidence cannot be silently replaced.
