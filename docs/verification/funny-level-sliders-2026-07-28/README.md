# Funny-level sliders — built-app capture, 2026-07-28

Visual evidence for [issue #83](https://github.com/Ding-Ding-Projects/desktop-material/issues/83)
(restore the missing English and Cantonese funny-level sliders).

`appearance-playfulness-sliders.png` shows **Settings → Appearance** with the
**Playfulness** section: two independent sliders, *English playfulness* and *Cantonese
playfulness*, each scaled `1 · Fully serious` to `5 · Maximum fun`, sitting directly below the
language-mode selector.

## Provenance

- **Commit:** `ff53cd2155` (`main`)
- **Build:** production webpack configuration, renderer and main built one process at a time
  into a private output directory.
- **Capture:** `script/capture-app.js` driving the real built `main.js` through Playwright's
  Electron driver, reaching Settings with the fixture's `menu:` step.
- **Renderer console errors during capture:** 0.

## What it shows

- The sliders were never absent from the build — the issue's real complaint was that they were
  not where anyone would look. They now sit beside language mode rather than under a
  text-to-speech heading on the Sound tab.
- The section states the guarantee that matters: *"Facts, errors, and safety messages stay
  clear at every level."* Tone changes voice, never facts.
- The settings surface carries its own search field with a **Regex builder** control, visible
  at the top of the navigation column.
- Layout holds at 1440×960 with no clipping or overlap.

## What it does not show

A single frame cannot show a slider *changing* rendered copy, nor persistence across a
restart. Those are covered by unit tests, not by this image, and no claim beyond the layout
and presence of the controls should be read into it.

The **Element appearance** note visible at the top of this frame still reads "right-click that
element". That wording is correct for this commit; it was replaced in the Shift+Right-click
work for [#89](https://github.com/Ding-Ding-Projects/desktop-material/issues/89), which
merged afterwards.
