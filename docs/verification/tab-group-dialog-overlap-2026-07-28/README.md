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
