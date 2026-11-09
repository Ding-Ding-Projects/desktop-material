# Always show worktree list / 永遠顯示工作樹清單

Ported from GitHub Desktop 3.6.7 (upstream `desktop/desktop#22898`).

By default the worktree button appears in the toolbar only when the selected
repository has a linked worktree, or while its list is open. **Settings →
Appearance → Always show worktree list** keeps the button visible for every
repository, so a first worktree can be created from the toolbar.

預設要有連結工作樹，或者個清單開緊，工具列先會有工作樹掣。喺「設定 → 外觀」剔咗
「Always show worktree list」之後，個掣會一直喺度，第一個工作樹都可以喺工具列開。

## Behaviour

- Off by default. The choice is saved when Settings is saved and survives a
  restart (`always-show-worktree-list`).
- The toolbar and the resizable-pane width limits use the same rule,
  `shouldShowWorktreeDropdown` in `app/src/lib/worktree-dropdown.ts`, so the
  toolbar always reserves room for a button it shows.
- Worktree support itself still has to be enabled; the setting never shows the
  button when it is not.

## Failure modes

None specific. With no repository selected the button is not shown.

## Security considerations

None. This is a local display preference.

## Verification

- `app/test/unit/worktree-dropdown-test.ts` (16 combinations of count, open
  state and the setting)
- `app/test/unit/ui/appearance-preferences-test.tsx` (the checkbox starts off
  and reports the new value)

Both pass on Linux as of 2026-11-09, and the TypeScript check passes. The built
Windows application has not been checked and no capture exists yet.
