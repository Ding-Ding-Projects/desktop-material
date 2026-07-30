# Publish organization picker

The **Publish repository** dialog uses a searchable listbox to choose who will
own the new GitHub repository. The first choice is always **None — publish to
my personal account**; every organization returned for the selected account
follows in a case-insensitive login sort.

## Behavior

- The search field filters the personal-account choice and organization
  logins through the shared fuzzy, substring, or safe RE2-compatible regex
  modes.
- The mode, case-sensitivity control, and full Regex Builder use the audited
  `publish-organizations` search-surface identity. Plain fuzzy search remains
  the default.
- Arrow keys, <kbd>Home</kbd>, <kbd>End</kbd>, <kbd>Enter</kbd>, and
  <kbd>Space</kbd> operate the listbox without requiring a pointer.
  <kbd>Escape</kbd> clears a populated search.
- In the editable search field, <kbd>Home</kbd> and <kbd>End</kbd> retain their
  normal caret behavior. Arrow navigation and <kbd>Enter</kbd> hand focus to
  the listbox before selection so its active option is announced.
- The result count is announced without blocking the dialog. The selected
  owner is exposed through `aria-selected` and remains scrolled into view.
- English, playful Hong Kong-style Cantonese, and bilingual presentation use
  the app's persisted language mode.

## Sizing and accessibility

The listbox has a non-collapsing 128–176 px viewport. It owns its vertical
scroll while the dialog content owns the page scroll, so a short window keeps
both the list and the Publish/Cancel footer reachable. Search controls wrap
below 480 px, long organization logins truncate inside their row, and the
control never creates page-level horizontal scrolling.

The listbox keeps a stable accessible name, active-descendant relationship,
visible focus treatment, 44 px option targets, and an explicit no-match state.
The **None** row ensures there is still a valid publishing destination when an
account belongs to no organizations.

## Configuration

There is no separate preference page. Filter mode persistence uses the
search-surface key `filter-mode/publish-organizations`; language, theme,
density, fonts, and funny levels continue to come from the normal application
preferences.

## Failure modes

- An invalid or unsupported regex reports inline feedback and preserves all
  choices instead of turning the owner list blank.
- <kbd>Enter</kbd> in the search field is consumed even when there are no
  matches, so filtering cannot submit the surrounding Publish form.
- Changing accounts clears the old organizations immediately. A request
  generation guard prevents a late response from the previous account from
  replacing the new account's list.
- A no-match query leaves the listbox at its usable height and shows an honest
  empty-state message plus a zero result count.
- Oversized labels cannot widen the dialog; they are ellipsized while their
  full value remains the option's accessible name.

## Security and privacy

Matching is local and bounded by the shared safe-regex implementation.
Organization logins and sample text are not sent to a third party, and the
picker does not persist search text. Avatar URLs come only from the signed-in
provider response; verification fixtures use loopback-only synthetic data.
Selecting an organization changes only the reviewed publication settings—it
does not create or publish a repository until the dialog's final action runs.

## Verification

Focused tests cover explicit **None** selection, controlled organization
selection, all three filter modes, invalid-regex preservation, result counts,
keyboard movement, bilingual copy, active-descendant semantics, and defensive
scrolling. Source-level layout contracts require a nonzero listbox floor,
contained scrolling, narrow-width wrapping, and long-label truncation.

The real production build is also exercised on an isolated off-screen Windows
desktop. Its acceptance scene checks the bilingual picker at 390×844 and the
restored 1440×960 window, including listbox geometry, visible rows or the
explicit empty state, horizontal containment, and bottom-row reachability.

This feature adds no HTTP endpoint, so no Postman collection is applicable.
