# New tab group dialog is overlapped by the toolbar — built-app capture, 2026-07-28

Evidence for the defect found while capturing
[issue #81](https://github.com/Ding-Ding-Projects/desktop-material/issues/81).

Opening **Add tab to new group…** from a repository tab's context menu shows a popover whose
**Group color** swatches are painted *underneath* the main toolbar. The Fetch origin,
Commit & push and Build & run buttons sit on top of the colour row, leaving it partly
unreadable and partly unclickable.

| File | Window |
| --- | --- |
| `new-tab-group-dialog-overlapped-1440x960.png` | 1440×960 |
| `new-tab-group-dialog-overlapped-1180x820.png` | 1180×820 |

Reproducing at two different window sizes rules out a one-off layout race.

## Provenance

- **Commit:** `e7bc71e20d` (`main`)
- **Build:** production webpack configuration, renderer and main built one process at a time.
- **Capture:** `script/capture-app.js` → real built `main.js` via Playwright's Electron driver,
  three repositories open as tabs, 2.5 s settle after the dialog opened so the frame is not
  mid-animation.

## What to look at

In the 1440×960 frame, the `Group color` label is visible at the dialog's lower edge and the
swatch circles immediately below it are cut through by the toolbar's button row. The dialog's
own **Create group** and **Cancel** buttons render correctly; it is the colour row that loses.

The copy itself is good and worth preserving through any fix: *"Grouping only organizes the
strip; it never closes a tab."* — the non-destructive guarantee #81 asks for, stated in the
product.

A `New tab group…` tooltip is also stranded in the top-left corner of both frames, outside the
window's content area.

---

## After the fix (`550d6ca766`)

| File | Window |
| --- | --- |
| `fixed-dialog-on-dialog-layer-1440x960.png` | 1440×960 |
| `fixed-dialog-on-dialog-layer-1180x820.png` | 1180×820 |

The dialog is now centred on `#dialog-layer` above the toolbar. **All six group colour
swatches** — blue, green, amber, red, purple, grey — are fully visible and unobstructed at both
sizes, and the tab strip is no longer inflated by an in-flow dialog.

### The cause was not a z-index

`Dialog` renders `<dialog className="… tooltip-host">`, and `.tooltip-host { position: relative }`
overrides the UA stylesheet's `position: absolute` on `<dialog>`. Non-modal dialogs open with
`show()`, so there is no native top layer either. The only rule that restores out-of-flow
positioning is `#dialog-layer dialog[open] { position: fixed; … }` — and the tab strip rendered
these dialogs **inline in its own JSX**, so neither rule applied. The dialog became an in-flow
flex item of `.repository-tab-strip` at `z-index: auto`, and the toolbar's `position: relative`
button pills, later in the document, painted over it.

The fix portals both dialogs into `#dialog-layer` rather than raising anything above anything
else, so context menus, tooltips, notifications and the command palette keep their existing
order.

### Residual: the tooltip is clamped but still lingers

The stranded tooltip is now **inside** the window rather than half off-screen — the reported
acceptance point. Its underlying cause was real and worth recording: `Tooltip.mouseRect` is
written only by `mouseenter`/`mousemove`, so a tooltip shown by **focus** still held a pristine
`DOMRect`, measured against the viewport origin, and was placed at `left = -width/2`. Keyboard
users saw clipped tooltips that mouse users never encountered.

It is still visible in the **top-left corner** of both after-frames, because the context-menu
item it describes has been removed while the tooltip remains mounted. That is a separate,
smaller defect and is filed on its own rather than declared fixed here.
