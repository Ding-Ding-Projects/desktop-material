# MD3 Compliance Audit Report

Target: Desktop Material Windows desktop app (`app/styles`, `app/src/ui`)
Date: 2026-07-31
Method: source audit per the Material 3 skill's audit procedure (web/CSS
custom-properties platform). The Linux TUI is out of scope by current
direction; `docs/` and `site/` were not re-audited in this pass.
Overall Score: 84/100

## Scores by Category

| Category      | Score | Status |
| ------------- | ----- | ------ |
| Color tokens  | 9/10  | pass   |
| Typography    | 6/10  | warn   |
| Shape         | 7/10  | pass   |
| Elevation     | 9/10  | pass   |
| Components    | 9/10  | pass   |
| Layout        | 9/10  | pass   |
| Navigation    | 9/10  | pass   |
| Motion        | 9/10  | pass   |
| Accessibility | 9/10  | pass   |
| Theming       | 8/10  | pass   |

## Critical Issues

None found. No MD2 (`@material/mdc-*`) imports anywhere; no tonal-pairing
violations surfaced in sampling (every `on-X` colour sampled sits on its `X`).

## Warnings

- **Typography tokens are absent as CSS custom properties.** There are no
  `--md-sys-typescale-*` tokens; ~779 `font-size:` declarations use raw px
  values (`app/styles/**`). The app has a consistent hand-rolled scale, but it
  cannot be re-themed as one system. Introducing typescale tokens and mapping
  the existing sizes onto them is the single largest remaining MD3 gap.
- **Shape tokens exist but most radii bypass them.** ~859 `border-radius`
  declarations use raw values. The registry itself was also missing
  `--md-sys-shape-corner-extra-small` and `--md-sys-shape-corner-full` — both
  added in this pass (`app/styles/_material.scss:68`), so new code (including
  the rebuilt command palette) can stop hardcoding `999px`. Migrating existing
  radii is mechanical follow-up work.
- **A few component-scoped hex palettes** (`_ollama-model-manager.scss`,
  `_repository-tabs.scss`, `_preferences.scss`) define local custom properties
  from raw hex rather than deriving from scheme tokens. Most are data-encoding
  swatches (exempt as data, not chrome), but the Ollama chat accent
  (`--ollama-chat-accent: #0969da`) is chrome and should derive from
  `--md-sys-color-primary`.

## Passing

- **Color tokens**: 190 `--md-sys-color-*` definitions with full light/dark
  values in `_material.scss` / `themes/_dark.scss`; chrome consistently
  consumes tokens; correct `on-X`-on-`X` pairing throughout the surfaces
  sampled, including the rebuilt command palette.
- **Elevation**: `--md-sys-elevation-level1..3` defined, themed per mode, and
  used for dialog/menu depth; tonal surface containers
  (`surface-container-low/high/highest`) are the primary depth cue as MD3
  specifies.
- **Components**: switches are real `role="switch"` MD3 switches
  (`material-switch.tsx`), dialogs use the native `<dialog>` element with an
  M3 non-modal layer, chips/pills/list rows follow M3 anatomy; the command
  palette now implements MD3's full-screen search view with a docked search
  field, rich list items, and a supporting detail pane.
- **Layout**: 8px spacing grid broadly observed; the palette constrains its
  content column to 1180px on wide windows rather than stretching; narrow
  widths collapse the detail pane and group chips instead of clipping.
- **Navigation**: vertical navigation rail (`TabBarType.Vertical`) with
  correct `tablist` roles; browser-style repository tabs; palette search is
  wired with `aria-controls`/`aria-activedescendant`.
- **Motion**: MD3 Expressive easing curves (`--emph`,
  `cubic-bezier(0.2, 0, 0, 1)`) plus a global reduce-motion multiplier
  (`--mdur`); 23 stylesheets honour `prefers-reduced-motion`, including the
  new teleport spotlight (ring stays, pulse drops) and the palette's
  hover-revealed Run action (always visible under reduced motion).
- **Accessibility**: caption buttons reserve 44px targets; `focus-visible`
  outlines throughout; the palette announces each row's title, home and
  current value as one option name; listbox keyboard model with
  `aria-activedescendant`.
- **Theming**: complete light/dark schemes, runtime accent/density/font
  customization, per-element appearance editors.

## Recommended Fixes (Priority Order)

1. Introduce `--md-sys-typescale-*` tokens mapped to the existing hand-rolled
   scale, then migrate `font-size` declarations file-by-file.
2. Migrate raw `border-radius` values onto the (now complete) shape token
   registry, starting with the highest-count files
   (`_repository-tabs.scss`, `_actions-view.scss`, `_repository-tools.scss`).
3. Derive the Ollama chat accent from `--md-sys-color-primary` instead of raw
   hex so the surface follows accent customization.
