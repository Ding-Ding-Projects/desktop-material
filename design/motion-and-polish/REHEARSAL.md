# Rehearsal

Rendered locally with headless Chrome from the files in this folder at
1280 × 960 and 390 × 960 (`frames/<Artboard>-<width>.png`). No page errors
were reported for any artboard at either width.

## Fresh-eye review

| Finding | Fix |
| --- | --- |
| Private wording in two artboards and in sample author names | Replaced with ordinary wording and a neutral sample name; the public-language scan passes on every file. |
| Live style values written inside `<style>` blocks (menu position, hold progress) do not update | Moved to inline `style` attributes so they follow state. |
| Step label in the recording card stayed on one step while playback moved | Bound to the playing step. |
| Poster frames | Every board's first frame shows a finished, readable state (selected rows, attached disks, a live value), never a mid-transition frame. |

## Checked

- Both widths render without horizontal page scroll.
- Every interactive control is a real `button`, `input` or `select` with a name.
- Every animated change also changes text, an icon or a colour role.
- The reduced-motion paths on the Main and Live charts boards stop pulsing and
  snap instead of easing.

## Not checked

- Contrast was reviewed by eye against the Material 3 roles the application
  already uses, not measured per pixel.
- Fonts load from Google Fonts in these files; the application uses its own
  vendored copies.

## Second pass

`AppearanceStudio` and `CommandPalette` were rendered the same way at
1280 x 1400 and 390 x 1400. The 1280 px frames were looked at; the 390 px frames
were produced but not reviewed by eye. Every template value resolves and every
handler runs once without an exception in a scripted check. No independent
fresh-eye review was done for these two boards. Keyboard shortcuts shown in the
palette are proposals, apart from Ctrl+Shift+F for Show in Explorer, which the
roadmap records.

## Third pass

`Activity`, `Locks`, `Tools`, `Onboarding`, `RepoChanges`, `RepoHistory`,
`RepoReview` and `RepoReleases` were rendered at 1280 x 960 and 390 x 960.
Looked at by eye at 1280 px: `Activity` and `RepoChanges` only. The others were
rendered and passed the scripted check (every template value resolves, every
handler runs once without an exception) but their frames were not reviewed, and
no 390 px frame was reviewed.

| Finding | Fix |
| --- | --- |
| The filter field on `RepoChanges` grew to fill its column | Search fields inside a column no longer flex vertically (`97f976a`). |
| Tabbed boards left a tall empty band | Tabbed boards are 960 px tall instead of 1400 px. |
