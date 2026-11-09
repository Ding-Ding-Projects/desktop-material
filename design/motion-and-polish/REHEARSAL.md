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
