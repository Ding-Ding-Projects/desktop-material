# Repository tools: category counts and a folding chip row / Repository tools：分類數目同摺得埋嘅分類列

The Repository tools rail now says how many tools each category holds, how many
are listed, and lets the category chips fold away so the tool list gets the
room.

Repository tools 條欄而家會講每個分類有幾多個工具、列緊幾多個，分類晶片仲可以摺埋，
等工具清單有多啲位。

## What changed

- Each category chip shows its count after the name, for example
  `Search & inspect 10`. **All** counts every tool.
- A line above the chips says `31 tools`, or `4 of 31 tools shown` while a
  search or a category narrows the list.
- **Categories** folds the chips away and brings them back. While folded with a
  category chosen, the button reads `Categories: <name>` so the active filter
  stays visible. The choice is remembered on this computer.
- The pinned signing shortcut above the search keeps to its own height. It used
  to share the rail's height with the tool list and left a tall empty gap.

## Accessibility

- The fold button states `aria-expanded` and names the chip group it controls.
- The count is drawn from an attribute, so the chip's own text and its
  category filter are unchanged.
- The disclosure arrow turns with the app's motion setting and does not move
  when motion is off.

## Verification

`repository-tools-statistics-test.ts`, the chip and fold assertions in
`ui/repository-tools-test.tsx`, and
`repository-tools-responsive-style-test.ts` pass on Linux. Not yet seen in a
running build: the release that contains it had not been published when this
was written.
