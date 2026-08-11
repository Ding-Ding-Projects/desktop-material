# Command palette: full-app coverage, rich controls and teleport

The <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> master command palette is
Material Design 3's full-screen search view. That is the accelerator the
application menu actually registers for the `command-palette` item, and since
the MD3 shell landed it is also what the header's palette chip prints, because
the chip is a read-through of the binding rather than a second copy of it — the
two cannot drift.
The palette covers the entire app below the title bar rather than floating as a
small card, and its rows are no longer just names to dispatch — a row that is
a setting renders the setting's live control inline, and choosing any row
teleports to the place in the app where that feature actually lives.

## Behaviour

### Full-app surface

- The palette opens over the whole window (`#command-palette.command-palette-full`),
  leaving only the title bar (and its caption buttons) reachable. Content is
  constrained to a 1180px column on wide windows, per MD3's readable-width
  rule, instead of stretching edge to edge.
- The layout is a docked search field (pill, `surface-container-highest`),
  a results list on the left, a detail pane on the right, and a footer with
  the match count and keyboard hints. Below 1080px the detail pane drops out;
  below 720px the group chips drop too. Nothing clips.

### Rich controls

Commands that represent settings declare a `control` in the catalog
(`app/src/lib/command-palette-catalog.ts`), and the palette renders the
control that matches the value:

| Control kind | Rendered as             | Examples                     |
| ------------ | ----------------------- | ---------------------------- |
| `toggle`     | Material switch         | Dark theme, notifications,   |
|              |                         | confirm force push,          |
|              |                         | side-by-side diff            |
| `entry`      | Text box + Apply (✓),   | Commit summary,              |
|              | applies on Enter        | clone-from-URL               |
| `number`     | Numeric box with range  | Playfulness 1–5,             |
|              | hint                    | diff tab size 1–16           |
| `choice`     | Select                  | Language mode (English /     |
|              |                         | Cantonese / bilingual)       |

- Values are live: `App` passes a `controlValues` map read from real app
  state, and `onControlChange` writes through the same dispatcher paths the
  Settings panes use. Changing a control does **not** close the palette.
- A control whose live value is unknown renders disabled rather than
  pretending a default is the current setting.
- Out-of-range numbers are clamped to the declared bounds; empty entries are
  not applied. One-shot entries (clone URL) hand off to their dialog and close
  the palette; persistent entries (commit summary) keep showing the value.

### Teleport — "take me to where it lives"

- Every command resolves a *home* (`resolvePaletteHome`): a Settings tab plus
  an anchored row, a toolbar item, a sidebar rail tab, the commit box, or —
  by default — the dialog the command itself opens.
- **Clicking a row or pressing Enter teleports**: the owning surface is
  opened, the exact control is scrolled into view, ringed with a two-pulse
  primary spotlight (`.teleport-spotlight`, `app/styles/ui/_teleport.scss`)
  and handed focus. **Ctrl+Enter (or the row's Run button) executes** the
  command instead. Destructive or network commands (push, force push,
  discard, remove repository) declare homes with no self-opener, so
  teleporting to them can never fire them.
- Targets resolve through the symbolic registry in
  `app/src/lib/teleport-targets.ts` — structural hooks the app already
  renders (`[data-toolbar-item-id="sync"]`, `#history-tab`) plus explicit
  `data-teleport-target` anchors added to settings rows. The DOM lookup polls
  for up to 4s so a surface that is still animating in can be found; if the
  surface never appears, a non-blocking notification says so instead of
  failing silently.
- The detail pane names the home ("Where it lives — Toolbar",
  "Settings › Appearance") with Go there / Run buttons, and each row carries
  a compact home label.

## Accessibility

- The results list is a `listbox` wired to the search box via
  `aria-controls`/`aria-activedescendant`; each option's accessible name is
  "title — home — current value" so screen readers hear where the feature
  lives and what the setting currently is.
- All controls are keyboard-reachable; arrows inside a text box move the
  caret, not the highlighted row. The spotlight honours
  `prefers-reduced-motion` (ring stays, pulse drops), as does the palette's
  hover-revealed Run action (always visible under reduced motion).

## Configuration

- The appearance editor (density, icons, group chips, keyword line,
  random-per-repository) is unchanged and applies to the full-screen layout.
- Language modes and the per-language funny levels style every palette string
  through the standard i18n resources (`commandPalette.*`, `palette.*`).
- When School mode is active, the language-mode and playfulness rows are
  omitted from the palette. The renamed School mode row remains available so
  the user can reach its unlock control.

## Failure modes

- Missing teleport target → non-blocking notification naming the surface that
  was not on screen; nothing is highlighted; no state is changed.
- Unknown control value → control renders disabled.
- Invalid or empty entry → not applied; the user's draft is kept.

## Security considerations

Teleport selectors are a fixed compile-time registry — no user input is ever
interpolated into a DOM query. Control writes go through the same dispatcher
setters the Settings panes use, so no new mutation paths exist.

## Verification

- `app/test/unit/command-palette-catalog-test.ts` — controls declare valid
  shapes, every home resolves and localizes, destructive commands never open
  via self, every Preferences tab maps to a registered event, selector
  registry is unique and syntactically valid.
- `app/test/unit/ui/command-palette-rich-test.tsx` — live switch renders and
  writes without dismissal, entry applies on Enter, select writes choices,
  Enter/click teleport vs Ctrl+Enter run, rows announce their home, unknown
  values disable controls.
- `app/test/unit/ui/filter-mode-surfaces-test.tsx` — search modes, regex
  builder and appearance editor still pass against the full-screen palette.

## Suggested articles

- [Command palette rows and appearance](command-palette-appearance.md)
- [Tone: per-language funny-level sliders](tone-funny-level.md)
- [Material ripple and theme reveal](material-ripple-and-theme-reveal.md)
