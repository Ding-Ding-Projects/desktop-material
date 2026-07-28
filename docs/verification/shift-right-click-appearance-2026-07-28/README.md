# Shift+Right-click opens appearance editors — built-app capture, 2026-07-28

Visual evidence for [issue #89](https://github.com/Ding-Ding-Projects/desktop-material/issues/89).

Both frames drive **the same element** — a repository tab's label — with the two gestures, so
the pair shows directly that they no longer collide.

| File | Gesture | Result |
| --- | --- | --- |
| `plain-right-click-ordinary-menu.png` | Right-click | the ordinary tab command menu |
| `shift-right-click-appearance-editor.png` | <kbd>Shift</kbd>+Right-click | the Tab appearance editor |

## What to look at

**Plain right-click** opens Pin Tab / Add to Favorites / Arrange Tabs… / Add tab to new group…
/ Customize Appearance… / Close Tab and the rest. Before this change it opened the appearance
editor instead, which is exactly the interference the issue reported. Note that
**Customize Appearance…** remains in that menu: the discoverable route is preserved, because a
modifier gesture nobody can guess is not a substitute for a visible entry.

**Shift+Right-click** opens the anchored **Tab appearance** editor — font, size, letter case,
spacing, text effect, colour, with History and Clear, and a footer naming the local Git
repository that stores the element's revisions.

## Provenance

- **Commit:** `e7bc71e20d` (`main`)
- **Build:** production webpack configuration, renderer and main built one process at a time
  into a private output directory.
- **Capture:** `script/capture-app.js` driving the real built `main.js` through Playwright's
  Electron driver, at 1180×820.
- The `shift-right-click:` fixture step was added for this capture and is covered by the
  fixture's grammar tests, which assert it parses as a step distinct from `right-click`.

## What this pair does not show

Only one surface. The change also covers the shell-wide `document` listener, the submodule
Back button, the tab overflow row and the repository list row; those are asserted by unit
tests rather than captured here.

It also does not exercise the **keyboard** route (<kbd>Shift</kbd>+<kbd>F10</kbd> and the
<kbd>Menu</kbd> key), which matters because the macOS keyboard path carries no `shiftKey` and
would have become mouse-only under a naïve implementation. That path is unit-tested at the
predicate level and has had no end-to-end confirmation on macOS.
