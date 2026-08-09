# Theme-aware diff surfaces

Desktop Material keeps every text diff surface on the active Material surface
token. Unified CodeMirror context rows and standalone side-by-side diffs use
the same theme-aware background, while additions, deletions, hunks, gutters,
and word-level highlights retain their semantic diff colors.

## Behavior and configuration

- The unified diff editor, its context-line backgrounds, and the outer diff
  container use `--md-sys-color-surface` through the scoped
  `--diff-background-color` token.
- Standalone side-by-side mounts, including stash diff views that are not
  nested under the normal diff container, define the same scoped token.
- Add, delete, hunk, hover, selection, gutter, and line-number tokens remain
  separate, so changing the neutral surface does not erase change semantics.
- The value follows the active light or dark Material theme at runtime; there
  is no separate diff-background preference to synchronize.

## Failure modes and recovery

If a context row becomes white or otherwise diverges from the surrounding dark
surface, refresh the view after confirming the active theme. The style contract
fails if a unified or standalone surface falls back to the legacy global
`--background-color` token. Add/delete semantic colors are not a recovery
substitute for a missing neutral surface mapping.

## Security and accessibility considerations

This is a local style-only mapping. It does not change Git contents, provider
data, selection state, or markup. Text and focus behavior remain owned by the
existing diff components, while the theme-aware surface preserves contrast
tokens for text, gutters, and semantic additions/deletions.

## Verification

`app/test/unit/diff-background-style-test.ts` verifies the unified CodeMirror,
context-row, outer-container, and standalone side-by-side mappings. The style
token contract also verifies that the new token is defined and all references
resolve. Visual verification should exercise both Material themes and a
narrow diff pane from the built application.

## Suggested articles

- [Expanded diff context](expanded-diff-context.md)
- [Changed-file tree view](changed-file-tree-view.md)
- [Responsiveness and resource lifecycle](../quality-and-reliability/responsiveness-and-resource-lifecycle.md)
