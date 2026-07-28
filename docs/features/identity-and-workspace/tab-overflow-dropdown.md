# Tab-strip overflow dropdown

When more repository tabs are open than the strip can show, the tabs that do
not fit move into a "more tabs" dropdown instead of being clipped or reachable
only by horizontal scrolling. Every open repository stays one click away, and
the strip itself never scrolls sideways.

## Behavior and configuration

- **Overflow split.** The strip measures the room available to the tab row and
  the laid-out width of each tab, then keeps a contiguous, in-order run of tabs
  visible and moves the rest into the dropdown. The split is recomputed whenever
  the tab set, an individual tab's width (rename, restyle), or the window size
  changes, driven by a `ResizeObserver` on the tab list.
- **More-tabs button.** A compact trailing button appears at the end of the
  visible tab run only while an overflow exists. It shows a chevron and the
  count of hidden tabs and opens the dropdown. It is a normal icon button in the
  strip's visual language: hover and open states fill to the secondary
  container, and it has a visible focus ring.
- **Active tab stays visible.** If the active tab would fall outside the visible
  run, the run slides just far enough to keep it on screen, exactly as the old
  scroll-into-view behavior did, without reordering tabs. Selecting a tab from
  the dropdown activates it and pulls it back into the strip on the next
  measurement.
- **Collapsed group chips are pinned.** Collapsed-group chips are always kept in
  the strip; only individual tabs move into the dropdown, and the room the chips
  occupy is reserved before the tabs compete for space.
- **Dropdown list.** The dropdown is a keyboard-navigable listbox: Arrow
  Up/Down moves the highlight, Home/End jump to the ends, Enter or Space
  activates, and Escape or an outside click closes it, restoring focus to the
  button. Each row shows the tab label and repository path with Active, Pinned,
  and Favorite chips where they apply.
- **Search with the full regex builder.** The dropdown carries the same search
  stack as every other collection surface in the app, registered as the
  `tab-overflow` search surface. A `type="search"` field sits above the list
  with the shared `FilterModeControl`: plain-text fuzzy matching is the default,
  substring and regular expressions are explicit opt-ins reached by cycling the
  mode button, `Aa` toggles case sensitivity, and the mode is persisted per
  surface (`filter-mode/tab-overflow`). The control's regex-builder launcher
  opens the project's full builder seeded with the current query and the visible
  rows as sample text; applying a pattern from the builder switches the mode to
  Regex and adopts the pattern, so query, pattern, flags, and mode stay
  synchronized in both directions. Matching runs over every literal tab key —
  visible label, repository name, alias, `owner/name`, path, and clone URL — and
  the surviving rows keep the strip's own order rather than a fuzzy score order.
  An invalid pattern is reported inline in a `role="alert"` message and **never**
  empties the menu: every row stays listed while the expression is unfinished.
- **Search never costs keyboard navigation.** The field takes initial focus and
  drives the list from where the caret already is: Arrow Up/Down, Home, End, and
  Enter all operate the highlighted row without leaving the query, and
  `aria-activedescendant` on the field tracks the highlight. Space inside the
  field is a typed character, never an activation. The list keeps its own
  `tabIndex` and key handler (including Space) for anyone who tabs into it
  instead.
- **Customization reachable from an overflowed tab.** An overflowed tab has no
  element in the strip at all, so neither the per-tab format button nor the
  tab's context menu exists for it. Each dropdown row therefore carries its own
  **Customize appearance** button, and right-clicking a row opens the same tab
  command menu a visible tab has — pin, favorite, arrange, tab groups,
  Customize Appearance…, and the close actions.
  `Shift`+right-clicking a row is the shortcut straight to that tab's
  appearance editor, matching the strip. All routes close the dropdown
  first (its focus trap would otherwise fight the editor's) and anchor to the
  still-mounted more-tabs button, because the clicked row unmounts with the
  dropdown. Opening the editor for an overflowed tab does not switch to it.
- **Appearance preserved.** Both visible tabs and dropdown rows keep every
  per-tab appearance customization. Visible tabs render through the unchanged
  tab component; dropdown rows re-apply the same validated per-tab title style
  (font family, size, color, weight, and text effects) and the tab's custom
  background, so a customized tab looks the same in the dropdown as in the strip.
  Theme, density, and the appearance-editor surfaces are untouched.

All labels ship in English, playful Hong Kong Cantonese, and the compact
bilingual mode through the shared translation catalog. The dropdown's
description line is the one tonal string here, so it honours the per-language
funny level: `tabs.overflowDescription.plain` (levels 1–2),
`.light` (level 3), and `.playful` (levels 4–5), read per language from the
persisted audio settings so English can stay plain while Cantonese is playful.
Every band states the same facts — these tabs did not fit in the strip, and they
can be searched, switched to, or restyled from here. Tab names, repository
paths, and counts are never restyled or translated in any mode.

## Persistence

The overflow split itself is derived entirely from measured geometry at render
time and is never written to disk, and the search query is per-opening state
that is not persisted either. The one persisted value this surface owns is the
search's filter mode, under `filter-mode/tab-overflow`, so a user who works in
regex does not have to re-select it every time the menu opens. Tab identity,
order, grouping, pinning, and per-tab appearance continue to persist through
their existing stores, unchanged.

## Accessibility

The strip keeps its `tablist` semantics. The more-tabs button exposes an
accessible name with the hidden-tab count, `aria-haspopup="dialog"`, and
`aria-expanded`. The search field is a `combobox` with `aria-controls`,
`aria-expanded`, and `aria-activedescendant` pointing at the highlighted row.
The dropdown is a labelled `listbox` of `option` rows with `aria-selected`
tracking the highlight and `aria-activedescendant` on the list. Each row's
appearance button carries the tab's exact name in a concise single-language
accessible name, and an invalid regular expression is announced through a
`role="alert"` message while the row count updates in the polite status line.
Every control is keyboard reachable with a visible focus ring, and the button
and rows meet the strip's contrast and hit-target norms.

## Narrow widths, bilingual mode, and display scaling

The sheet is bounded (`max-width: calc(100vw - 52px)`) and never scrolls
horizontally. Inside a row, the option is the flexible part (`flex: 1 1 auto`
with `min-width: 0`) and the appearance button is fixed at 32×32, so a long tab
name or a doubled bilingual label ellipsizes instead of pushing the button out
of the sheet. The search field shrinks the same way. Below 520px wide or 560px
tall — which is also where a 200% display scale lands a normal window in CSS
pixels — the results list drops to 220px and the regex builder's text label is
hidden, leaving its icon launcher and the mode cluster intact.

## Failure modes and recovery

- If `ResizeObserver` is unavailable, the initial measurement still runs and the
  split updates on tab-set changes; only live drag-resize recomputation is lost.
- A single tab wider than the whole strip is always shown rather than hidden, so
  the strip never collapses to just the dropdown button. A lone oversized tab is
  never moved into the dropdown because there is nothing to switch to.
- A sub-pixel rounding slack prevents a layout that fits exactly from being
  forced into overflow by a measurement rounding error.
- Widths for tabs currently in the dropdown are cached; when a width is unknown
  (for example a newly added tab), a one-frame full-measurement pass lays every
  tab out to measure it before re-applying the split.

## Failure modes and recovery (search)

- An invalid or unfinished regular expression is non-throwing: the shared
  matcher returns every row untouched alongside the engine's message, which is
  rendered inline. The menu stays usable while the pattern is being typed.
- A pattern that matches nothing produces an honest empty state ("No tab in this
  menu matches this search.") and a `0 of N` count, never a silently blank sheet.
- Evaluation is local, bounded by the shared regex guard, and zero-width safe;
  neither the query nor the sample text leaves the process.

## Security considerations

The dropdown renders localized static copy, tab labels, and repository paths
that already appear in the strip and existing tab search. Search queries are
evaluated in-process by the shared matcher and are never persisted or
transmitted; only the chosen filter mode is stored. Per-tab styles reach inline
CSS only through the same validated `tabTitleStyleToCss` / `tabFrameStyleToCss`
helpers used by the strip, which drop any value that is not a known-safe hex
color, curated font, or bounded numeric — so a persisted style can never inject
arbitrary CSS.

## Verification

`tab-overflow-test.ts` covers the pure split geometry: the empty strip, the
all-fit case, the exact-fit rounding guard, trailing overflow, overflow-button
width reservation, the active-tab guarantee sliding the window (and not sliding
when unnecessary), order preservation across both partitions, the
always-show-one and lone-oversized-tab guards, and variable-width tabs.

`ui/tab-overflow-popover-test.tsx` covers the search surface and the
customization route: filtering under each shared mode, the fuzzy plain-text
default with regex reached only by explicit opt-in, an invalid pattern raising
the alert while keeping every row, keyboard navigation from both the field and
the list (including Space being typed text in the field and an activation in the
list), the per-row appearance button, the row context menu, bilingual copy with
concise accessible names, and the per-language funny bands keeping their facts.
Two of its cases drive the real `RepositoryTabStrip` with forced measurements so
an overflow genuinely exists, then reach the appearance editor for a tab that
has no element in the strip at all.

`collection-surface-registry-test.ts` enforces the one-to-one binding between
the `tab-overflow` registry entry, the literal `data-search-surface-id` on the
input, and the `FilterModeControl` that owns the regex builder.
`repository-tab-actions-style-test.ts` pins the sheet and list bounds, the
row/option/field flex contract that prevents clipping, the 32px appearance
button, the focus rings, and the compact-viewport rules. Typechecking
(`npx tsc --noEmit`) covers the component wiring.
