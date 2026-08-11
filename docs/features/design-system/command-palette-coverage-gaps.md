<!--
  A survey, then a record of what came of it. The tables under "the original
  survey" were written from a full read of the app's settings surfaces and menu
  definition. The status table above them is regenerated from the shipped
  catalog itself, so it cannot drift into optimism.

  A row with no live control is not a row that failed. Most of them describe a
  destination rather than a value - a dialog, an editor, a list - and the
  honest thing for those is to take the reader there. Where a control was
  genuinely wanted and could not be built, the reason is stated.
-->

# Command palette coverage

## Status

The shipped catalog currently contains **268 unique commands**. The R5
command-palette expansion (see below) added 21 of those: tab management
(close/close-others/close-to-left/close-to-right, favorite, rename, move to
group, group collapse, group delete, and all eight sort orders), settings
undo/redo, and dot-com/Enterprise sign-in — every one wired to the app's
existing dispatcher and store methods rather than new business logic. Of the
133 surveyed commands, 131 are in the palette; 49 of them carry a live
control the reader can change from the row itself; the rest teleport to the
setting, which for a destination is the whole of what a row can do.

Nothing in the catalog is inert: every row either goes somewhere, changes a
value in place, or runs a handler, and a test fails the build if one does not.

| Survey id | Command | In the palette | Live control | Note |
|---|---|---|---|---|
| G1 | `increase-active-resizable-width` | ✅ | — | VERIFIED wired=false. This is a one-shot action, not a setting: there is no value to read or write. Confirmed it is a real MenuEvent (menu-e |
| G2 | `decrease-active-resizable-width` | ✅ | — | VERIFIED wired=false. Mirror image of G1 and blocked for the same reason: a one-shot action with no value behind it. Confirmed at menu-event |
| G3 | `palette:report-issue` | ✅ | — | control = none. Confirmed: action row opening a web link, already shipped at app/src/ui/app.tsx:1393 `case 'palette:report-issue': return th |
| G4 | `palette:contact-support` | ✅ | — | control = none. Confirmed: action row opening a support URL at app/src/ui/app.tsx:1395 `return this.openPaletteWebLink(ContactSupportUrl)`.  |
| G5 | `palette:user-guides` | ✅ | — | control = none. Confirmed: action row at app/src/ui/app.tsx:1397-1398, where `case 'palette:user-guides':` falls through to `case 'palette:k |
| G6 | `palette:keyboard-shortcuts` | ✅ | — | control = none. Confirmed: shares the fall-through case with G5 at app/src/ui/app.tsx:1397-1398, reaching the same openPaletteWebLink(UserGu |
| G7 | `palette:show-logs-folder` | ✅ | — | control = none. Confirmed: action row at app/src/ui/app.tsx:1400 `return this.showLogsFolder()`. Nothing to read or write. No anchor — the p |
| G8 | `palette:toggle-devtools` | — | — | deliberately not offered — control = none, and the command is absent from the catalog and from onPaletteCommand — independently confirmed. There is |
| G9 | `palette:reload-window` | — | — | deliberately not offered — control = none, and the command is absent from the catalog — confirmed. Nothing to read or write. A renderer path does e |
| G10 | `palette:set-theme-mode` | ✅ | ✅ |  |
| G11 | `palette:set-ui-scale` | ✅ | ✅ |  |
| G12 | `palette:set-auto-fit-zoom` | ✅ | ✅ |  |
| G13 | `palette:set-show-recent-repositories` | ✅ | ✅ |  |
| G14 | `palette:set-branch-name-in-repo-list` | ✅ | ✅ |  |
| G15 | `palette:set-branch-sort` | ✅ | ✅ |  |
| G16 | `palette:set-date-format` | ✅ | — |  |
| G17 | `palette:set-time-format` | ✅ | — |  |
| G18 | `palette:set-number-format` | ✅ | — |  |
| G19 | `palette:set-prefer-absolute-dates` | ✅ | ✅ |  |
| G20 | `palette:set-auto-switch-account` | ✅ | ✅ |  |
| G21 | `palette:set-repository-indicators` | ✅ | ✅ |  |
| G22 | `palette:set-usage-stats` | ✅ | — | The setting's only UI lives behind `{ENABLE_TELEMETRY && (...)}` in advanced.tsx:260, and app/src/lib/telemetry-flag.ts declares `export con |
| G23 | `palette:set-verbose-logging` | ✅ | ✅ |  |
| G24 | `palette:set-large-repo-auto-detect` | ✅ | ✅ |  |
| G25 | `palette:set-large-repo-auto-repack` | ✅ | ✅ |  |
| G26 | `palette:set-browser-open-mode` | ✅ | ✅ |  |
| G27 | `palette:set-confirm-discard-permanently` | ✅ | ✅ |  |
| G28 | `palette:set-confirm-discard-stash` | ✅ | ✅ |  |
| G29 | `palette:set-confirm-checkout-commit` | ✅ | ✅ |  |
| G30 | `palette:set-confirm-undo-commit` | ✅ | ✅ |  |
| G31 | `palette:set-confirm-commit-message-override` | ✅ | ✅ |  |
| G32 | `palette:set-confirm-worktree-removal` | ✅ | ✅ |  |
| G33 | `palette:set-confirm-commit-filtered-changes` | ✅ | ✅ |  |
| G34 | `palette:set-uncommitted-changes-strategy` | ✅ | ✅ |  |
| G35 | `palette:set-diff-check-marks` | ✅ | ✅ |  |
| G36 | `palette:set-error-presentation` | ✅ | ✅ |  |
| G37 | `palette:entry-git-author-name` | ✅ | — | CONFIRMED unwireable. `user.name` is read only through the async `getGlobalConfigValue('user.name')` and written only through the async `set |
| G38 | `palette:entry-git-author-email` | ✅ | — | CONFIRMED unwireable, same shape as G37 for `user.email`: async-only read/write via getGlobalConfigValue/setGlobalConfigValue, held meanwhil |
| G39 | `palette:set-show-commit-identity` | ✅ | ✅ |  |
| G40 | `palette:entry-default-branch-name` | ✅ | — | CONFIRMED unwireable. `init.defaultBranch` is read by the async `getDefaultBranch()` (app/src/lib/helpers/default-branch.ts:25) and written  |
| G41 | `palette:set-git-hook-env` | ✅ | ✅ |  |
| G42 | `palette:set-git-hook-env-shell` | ✅ | — |  |
| G43 | `palette:set-git-hook-env-cache` | ✅ | ✅ |  |
| G44 | `palette:global-ignore` | ✅ | — | CONFIRMED navigator-only by design. GlobalIgnoreEditor (app/src/ui/preferences/global-ignore.tsx) is a path line, a free textarea and action |
| G45 | `palette:set-external-editor` | ✅ | — |  |
| G46 | `palette:set-shell` | ✅ | — |  |
| G47 | `palette:set-context-menu-opencode` | ✅ | — | No App-level read and no dispatcher write exist. Confirmed: app-state.ts has no context-menu field, dispatcher.ts has no context-menu method |
| G48 | `palette:set-context-menu-desktop-material` | ✅ | — | Same as G47: registry state behind async IPC held in Integrations' local state, with no IAppState field and no Dispatcher method. Anchor del |
| G49 | `palette:set-context-menu-modern` | ✅ | — | No App-level read and no dispatcher write. Value is contextMenu?.mode === 'modern' from the same async IPC state; write is ipcRenderer.invok |
| G50 | `palette:branch-preset-script` | ✅ | — | Control is `none` (navigator). A read and a write do exist but are not scalar: app-state.ts:487 declares branchPresetScript as ICustomIntegr |
| G51 | `palette:custom-integrations` | ✅ | — | Control is `none` (navigator) — the row stands in for six path/choose/arguments fields across two ICustomIntegration records (app-state.ts:4 |
| G52 | `palette:set-agent-server-enabled` | ✅ | — | CONFIRMED. No App state field and no dispatcher method exists. grep /agent/i over app/src/lib/app-state.ts returns zero matches; grep /agent |
| G53 | `palette:agent-access-mode` | ✅ | — | CONFIRMED. Control column is 'none' by design - navigator only. onModeChanged (agent-access.tsx:604 onward) fires a blocking window.confirm  |
| G54 | `palette:agent-pairing` | ✅ | — | CONFIRMED. Control column is 'none' - navigator only. The pairing surface (renderPairing, agent-access.tsx:398) is a QR code plus action but |
| G55 | `palette:agent-token` | ✅ | — | CONFIRMED. Teleport only, never a value - the token is secret material the palette must not read, echo, or copy. The anchor lands on the tok |
| G56 | `palette:set-auto-commit-push` | ✅ | ✅ |  |
| G57 | `palette:set-auto-commit-push-interval` | ✅ | — |  |
| G58 | `palette:set-auto-pull` | ✅ | ✅ |  |
| G59 | `palette:set-auto-pull-interval` | ✅ | — |  |
| G60 | `palette:automation-account-overrides` | ✅ | — | Navigator row by design: the section renders 4 selects per account (OverrideSelect x2, OverrideIntervalSelect x2) over a runtime-discovered  |
| G61 | `palette:queue-clone-settings` | ✅ | — | Navigator by design (control column is `none`), and it could not be an in-row control even if we wanted one. The clone-queue policy is per-a |
| G62 | `palette:set-sound-enabled` | ✅ | ✅ |  |
| G63 | `palette:set-sound-effects` | ✅ | ✅ |  |
| G64 | `palette:set-sound-effect-volume` | ✅ | — |  |
| G65 | `palette:set-sound-narrator` | ✅ | ✅ |  |
| G66 | `palette:set-sound-recorded-narration` | ✅ | ✅ |  |
| G67 | `palette:set-sound-narrator-volume` | ✅ | — |  |
| G68 | `palette:set-sound-narrator-cooldown` | ✅ | — |  |
| G69 | `palette:set-sound-music` | ✅ | ✅ |  |
| G70 | `palette:set-sound-music-volume` | ✅ | — |  |
| G71 | `palette:set-sound-quiet-hours` | ✅ | ✅ |  |
| G72 | `palette:set-sound-quiet-hours-start` | ✅ | — |  |
| G73 | `palette:set-sound-quiet-hours-end` | ✅ | — |  |
| G74 | `palette:set-sound-reduced-motion` | ✅ | ✅ |  |
| G75 | `palette:repository-music-track` | ✅ | — | Navigator row by design. Confirmed: no single palette-representable value exists. The per-repository music selection is a three-way override |
| G76 | `palette:audition-sound-cues` | ✅ | — | Navigator row by design. Confirmed: the audition grid is fire-and-forget preview buttons calling audioCueStore.previewCue(category) (sound.t |
| G77 | `palette:copilot-commit-model` | ✅ | — | Confirmed unwirable as a palette control, but the original blocker's reason was wrong and is corrected here. The control is `CopilotModelPic |
| G78 | `palette:copilot-conflict-model` | ✅ | — | Same corrected reason as G77 — `dynamic-choice` exists as a catalog type but is unrendered by command-palette.tsx and has no copilot-models  |
| G79 | `palette:set-copilot-always-resolve-conflicts` | ✅ | ✅ |  |
| G80 | `palette:add-ai-provider` | ✅ | — | Confirmed: no value to read or write — the affordance opens the `edit-byok-provider-dialog`. The gating claim is verified in source: the `Ad |
| G81 | `palette:entry-ollama-endpoint` | ✅ | — | Confirmed: there is NO app-state field and NO dispatcher method for the Ollama endpoint. The text box binds to `OllamaPreferences`'s own com |
| G82 | `palette:repository-remotes` | ✅ | — | shipped as `palette:repository-settings-remote` |
| G83 | `palette:repository-git-config` | ✅ | — | shipped as `palette:repository-settings-git-config` |
| G84 | `palette:repository-build-run-settings` | ✅ | — | shipped as `palette:repository-settings-build-run` |
| G85 | `palette:repository-submodules` | ✅ | — | shipped as `palette:repository-settings-submodules` |
| G86 | `palette:repository-subtrees` | ✅ | — | shipped as `palette:repository-settings-subtrees` |
| G87 | `palette:repository-metadata` | ✅ | — | shipped as `palette:repository-settings-metadata` |
| G88 | `palette:repository-appearance` | ✅ | — | shipped as `palette:repository-settings-appearance` |
| G89 | `palette:repository-fork-settings` | ✅ | — | shipped as `palette:repository-settings-fork-settings` |
| G90 | `palette:ssh-working-copy` | ✅ | — | CONFIRMED not wirable, and CONFIRMED the only genuinely missing B12 row: a case-insensitive grep for 'ssh' across app/src/lib/command-palett |
| G91 | `palette:set-build-auto-install` | ✅ | ✅ |  |
| G92 | `palette:set-build-pre-elevate` | ✅ | ✅ |  |
| G93 | `palette:set-build-run-after-build` | ✅ | ✅ |  |
| G94 | `palette:set-build-auto-ignore-outputs` | ✅ | ✅ |  |
| G95 | `palette:set-build-after-pull` | ✅ | ✅ |  |
| G96 | `palette:set-build-offer-agents` | ✅ | ✅ |  |
| G97 | `palette:set-build-fix-provider` | ✅ | ✅ |  |
| G98 | `palette:set-build-fix-auto-approve` | ✅ | ✅ |  |
| G99 | `palette:set-cheap-lfs-auto-materialize` | ✅ | ✅ |  |
| G100 | `palette:set-cheap-lfs-auto-pin` | ✅ | ✅ |  |
| G101 | `palette:set-cheap-lfs-clone-helper` | ✅ | ✅ |  |
| G102 | `palette:set-cheap-lfs-parallel-uploads` | ✅ | — |  |
| G103 | `palette:set-cheap-lfs-storage-provider` | ✅ | ✅ |  |
| G104 | `palette:set-cheap-lfs-cloud-compression` | ✅ | — | DOWNGRADED by verification. The read and the write do not agree outside one narrow case, and the schema has no way to express the disabled/a |
| G105 | `palette:cheap-lfs-encryption` | ✅ | — | Navigator only, by design — blocker VERIFIED against source. Turning encryption on is not a boolean write: CheapLfsSettings.onCheapLfsPayloa |
| G106 | `palette:set-signing-commits` | ✅ | — | VERIFIED unwirable. No app-state field and no dispatcher method exist for commit signing: app/src/lib/app-state.ts has ZERO case-insensitive |
| G107 | `palette:set-signing-tags` | ✅ | — | VERIFIED unwirable, identical to G106. `tagSigning` is declared only in RepositorySigning's local component state (signing.tsx:83) and set o |
| G108 | `palette:signing-policy` | ✅ | — | Navigator row - control is `none` by design, so no read/write is required, and no anchor edit is needed: the survey's target `sidebarReposit |
| G109 | `palette:set-diff-auto-expand-context` | ✅ | ✅ |  |
| G110 | `palette:set-diff-context-step` | ✅ | — |  |
| G111 | `palette:appearance` | ✅ | — | Navigator row — the survey specifies control `none`, so no read/write is needed. VERIFIED: the teleport anchor supplied here is the single a |
| G112 | `palette:set-palette-density` | ✅ | — | CONFIRMED not wireable from App. `grep -c -i palette app/src/lib/app-state.ts` returns 0, and `grep -i palette` over app/src/ui/dispatcher/d |
| G113 | `palette:set-palette-random-per-repository` | ✅ | — | CONFIRMED, same architectural blocker as G112 (zero palette references in app-state.ts, dispatcher.ts, app-store.ts). Union claim CONFIRMED: |
| G114 | `palette:set-palette-show-icons` | ✅ | — | CONFIRMED, same architectural blocker as G112. `showIcons` is a field of the localStorage-only ICommandPaletteAppearance (command-palette-ap |
| G115 | `palette:set-palette-show-group-chips` | ✅ | — | CONFIRMED, same architectural blocker as G112. `showGroups` is a field of the localStorage-only ICommandPaletteAppearance (command-palette-a |
| G116 | `palette:set-palette-show-keywords` | ✅ | — | CONFIRMED, same architectural blocker as G112. `showKeywords` is a field of the localStorage-only ICommandPaletteAppearance (command-palette |
| G117 | `palette:new-tab-group` | ✅ | — | CONFIRMED. Control is `none` (dialog), so no read/write is required, and none exists. `CreateTabGroupDialog` renders only from the component |
| G118 | `palette:edit-tab-group` | ✅ | — | CONFIRMED. Control is `none` (dialog). `renderEditGroupDialog` (repository-tab-strip.tsx:1750-1752) returns null unless the component-local  |
| G119 | `palette:close-tabs-containing` | ✅ | — | CONFIRMED, with one correction to the original blocker text. No read: the close-tabs query lives in `CloseTabsContainingPopover`'s own state |
| G120 | `palette:close-tabs-not-containing` | ✅ | — | CONFIRMED. Inverse of G119. `CloseTabsExceptContainingPopover` is gated on the local `closeExceptAnchor` state set by `openCloseExcept(ancho |
| G121 | `palette:pin-tab` | ✅ | — | CONFIRMED. Control is `none`, so no read/write is required. For the record the execute path exists and is safe and App-reachable: App holds  |
| G122 | `palette:unpin-tab` | ✅ | — | CONFIRMED. Control is `none`. Mirror of G121: `this.props.repositoryTabsStore.setTabPinned(tab.id, false)` (repository-tabs-store.ts:768) is |
| G123 | `palette:edit-tab-appearance` | ✅ | — | CONFIRMED. Control is `none`. The anchored editor is opened by the private async `RepositoryTabStrip.openStyleEditor(tab, anchor)` (reposito |
| G124 | `palette:search-tabs` | ✅ | — | CONFIRMED. No read: the tab-search query is internal to `TabSearchPopover`; nothing persists it, so `clearOnApply: false` has no value to ke |
| G125 | `palette:edit-app-appearance` | ✅ | — | Survey control column is `none`. This row opens the anchored app-workspace appearance editor; it carries no scalar value. The only real read |
| G126 | `palette:edit-app-identity` | ✅ | — | Survey control column is `none`. Opens the anchored app-identity editor; no scalar value. Underlying store access is object-valued via `setP |
| G127 | `palette:edit-toolbar-appearance` | ✅ | — | Survey control column is `none`. Additionally no JSX teleport anchor is possible here: the only `<Toolbar>` instance (app/src/ui/app.tsx:721 |
| G128 | `palette:edit-repository-list-appearance` | ✅ | — | Survey control column is `none`. Opens the anchored repository-list appearance editor; no scalar value. NOTE: `TeleportTargetSelectors` has  |
| G129 | `palette:edit-repository-tabs-appearance` | ✅ | — | Survey control column is `none`. Opens the anchored repository-tabs appearance editor; no scalar value. App.tsx's `onRepositoryTabsAppearanc |
| G130 | `palette:edit-repository-logo` | ✅ | — | Survey control column is `none`. The logo is an `IRepositoryLogoDesign` object (or null when inherited) written through `dispatcher.setRepos |
| G131 | `palette:manage-repository-groups` | ✅ | — | Action row, not a setting. Verified: PopupType.ManageRepositoryGroup is declared at app/src/models/popup.ts:163 and its union member at :571 |
| G132 | `palette:repository-account` | ✅ | — | Not a scalar App owns. The dialog's live value is RepositorySettings' own component state (`this.state.accountKey`, app/src/ui/repository-se |
| G133 | `palette:regex-builder` | ✅ | — | No app-wide value exists. Filter mode and case sensitivity are per-searchSurfaceId: the palette holds them in its own component state (`filt |

## The original survey

**Sources read:** `app/src/lib/command-palette-catalog.ts` (247 entries; 246 Windows-eligible before availability predicates), `app/src/lib/teleport-targets.ts` (31 target keys), `app/src/models/preferences.ts` (14 `PreferencesTab` members), `app/src/ui/repository-settings/repository-settings.tsx` (11 `RepositorySettingsTab` members), `app/src/main-process/menu/menu-event.ts` (69 `MenuEvent` members) + `build-default-menu.ts`, `app/src/ui/app.tsx` (`onPaletteCommand`, `getPaletteControlValues`, `onPaletteControlChange`), `app/test/unit/command-palette-catalog-test.ts`, `app/src/ui/preferences/prompts.tsx`, `app/src/lib/audio/audio-settings.ts`.

**Result: 133 gap entries (G1–G133).** Every one is stated as event id / title / group / control kind / teleport target. Teleport targets follow the file's real convention: a camelCase key in `TeleportTargetSelectors` whose value is `[data-teleport-target="<kebab-id>"]`, with the owning element spreading `teleportAnchor('<kebab-id>')`.

---

## PART 0 — Read this before implementing: five type-level blockers

These are not opinions; they are places where the current types cannot express the gap, so the entry must either change the types or degrade to a navigator row.

| # | Blocker | Affects | Fix |
|---|---|---|---|
| **T1** | `IPaletteChoiceControl.options` is a static array of `{ value, labelKey: TranslationKey }`. Runtime-discovered lists have no translation key and no fixed length. | G16–G18 (date/time/number formats), G45–G46 (editors, shells), G42 (hook shells is fixed — OK), G77–G78 (Copilot models), G97 (fixed — OK), G132 (accounts) | Add a fifth control kind `{ kind: 'dynamic-choice', optionsId: string }` resolved in `app.tsx` beside `getPaletteControlValues()`. Without it, G16–G18/G45/G46/G77/G78/G132 must ship as **navigator rows with no `control`**. |
| **T2** | `IPaletteCommandContext` has only `platform, repositoryKey, hasRepository, hasRemote, hasBranch, isGitHubRepository`. | G89 (fork settings), G85 (submodules), G105 (Cheap LFS encryption), G75 (repo music) | Add `isFork`, `hasSubmodules`, `isCheapLfsRepository` and matching predicates `whenFork`, `whenSubmodules`. Until then those rows must be unconditioned and will teleport to an absent tab. |
| **T3** | `platform` is `'darwin' \| 'win32'` — there is no `'linux'`. | G7 ("Show logs in your File Manager" differs on Linux) | Widen to `'darwin' \| 'win32' \| 'linux'`, or accept a shared label. |
| **T4** | `IPaletteNumberControl` has no unit/suffix. Volumes (0–100), scale (%), cooldown (s), hours (0–23) will render as bare integers. | G11, G64, G67, G68, G70, G72, G73 | Add `readonly unitKey?: TranslationKey` to `IPaletteNumberControl`. |
| **T5** | `IPaletteHome` has only `'surface'` and `'preferences'`. Repository settings is a different popup with its own tab enum. | G82–G105 | Either add `IPaletteRepositorySettingsHome { kind: 'repositorySettings'; tab: RepositorySettingsTab; targetId? }`, **or** (cheaper, matches what `palette:cheap-lfs-settings` already does) use `kind: 'surface'` with `openEvent` pointing at the sibling tab-navigator command. Every G82–G105 row below is written for the cheaper option. |

**New `labelKey` values needed for `IPaletteSurfaceHome`** (only 7 exist today — `homeDialog`, `homeToolbar`, `homeSidebar`, `homeChangesView`, `homeCommitBox`, `homeRepositoryList`, `homeSettings`):

```
'commandPalette.homeRepositorySettings'  → "Repository settings › {tab}"
'commandPalette.homeRepositoryTools'     → "Repository tools"
'commandPalette.homeTabStrip'            → "Tab strip"
'commandPalette.homeTitleBar'            → "Title bar"
'commandPalette.homeDiffOptions'         → "Diff options"
'commandPalette.homeCommandPalette'      → "This palette"
'commandPalette.homeMenuBar'             → "Menu bar"
```

Each needs a Cantonese value too, and every `palette:` event below needs its `titleKey` added to the `TranslationKey` union (~line 1855), the English map (~5204), the Cantonese map (~8737), plus its event appended to `NewCommandEvents` (test line 47) with non-empty `keywords`.

---

## PART A — Menu commands not in the catalog (9 gaps)

### A1. Real `MenuEvent`s missing from the catalog

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G1** | `increase-active-resizable-width` | Expand the active resizable pane | `App` | none | `home: { kind: 'surface', labelKey: 'commandPalette.homeSidebar', targetId: 'repositorySidebar' }` — **no `openEvent`**: teleport must show the pane edge, not resize it |
| **G2** | `decrease-active-resizable-width` | Contract the active resizable pane | `App` | none | same as G1 |

`find-text` (Edit ▸ Command palette, `CmdOrCtrl+Shift+F`) is **not a gap** — the menu opener dispatches the master palette, while `palette:find-in-view` dispatches `this.findText()` in `onPaletteCommand` and carries `find` in its keywords. `CmdOrCtrl+Shift+F` has been the palette's own accelerator since the shortcut collision with the file browser was resolved, and the MD3 shell header's chip renders it from the registered menu item rather than from a hard-coded string.

The notification routes are intentionally separate: `palette:notification-centre`
opens the live notification centre, while `palette:notification-history` opens
the local Git-backed history dialog. Neither route steals the folder-opening
shortcut on supported desktop platforms.

![Before the route fix, the notification search returned one misleading Open notification centre row](../../assets/screenshots/material-command-palette-notification-before.png)

![After the route fix, the notification search exposes separate centre and history commands](../../assets/screenshots/material-command-palette-notification-after.png)

Selecting the centre row was also exercised against the built artifact; it
opened the live local/GitHub notification centre without leaving the palette
route behind.

![The corrected command-palette route opens the live notification centre side sheet](../../assets/screenshots/material-notification-centre-route.png)

### A2. Menu items whose click handler is main-process-only (no `MenuEvent` exists)

These need a new `palette:` id, a `case` in `onPaletteCommand`, **and** a new IPC/renderer path, because they are `openWebLink`/`UNSAFE_openDirectory` calls living in `build-default-menu.ts` lines 616–672.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G3** | `palette:report-issue` | Report an issue | `App` | none | `home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' }` — no `targetId`; the Electron menu bar is not a DOM element |
| **G4** | `palette:contact-support` | Contact GitHub support | `App` | none | same as G3 |
| **G5** | `palette:user-guides` | Show the user guides | `App` | none | same as G3 |
| **G6** | `palette:keyboard-shortcuts` | Show keyboard shortcuts | `App` | none | same as G3 |
| **G7** | `palette:show-logs-folder` | Show the logs folder | `App` | none | same as G3. Companion to the existing `view-log-history`; label varies per OS (see **T3**) |
| **G8** | `palette:toggle-devtools` | Toggle developer tools | `App` | none | same as G3 |
| **G9** | `palette:reload-window` | Reload the window | `App` | none | same as G3. **Flag:** the menu item is `visible: __RELEASE_CHANNEL__ === 'development'` and reloading destroys the palette mid-dispatch. Ship it only behind the same dev gate, or omit. |

---

## PART B — Settings not in the catalog (124 gaps)

Already covered by the 19 existing control rows: dark theme, language mode, both playfulness sliders, diff tab size, highlight features, 4 confirmations, notifications enabled, underline links, credential helper, Windows OpenSSH, side-by-side diff, hide whitespace, commit summary, clone URL.

### B1 · Preferences ▸ Appearance — `PreferencesTab.Appearance` (10)

| # | event | title | group | control | teleport target (new key → selector) |
|---|---|---|---|---|---|
| **G10** | `palette:set-theme-mode` | Theme | `App` | `choice` `light` / `dark` / `system` | **existing** `settingsTheme`. **This is a real gap, not a duplicate:** `palette:toggle-theme` is a 2-state switch, so **System theme is unreachable from the palette**. Keep both, or replace the toggle. `system` option must be hidden when `supportsSystemThemeChanges()` is false. |
| **G11** | `palette:set-ui-scale` | Interface scale | `App` | `number` min 50 max 200 step 5 (see T4) | `settingsUiScale` → `[data-teleport-target="settings-ui-scale"]` on the Scale slider in `appearance.tsx` |
| **G12** | `palette:set-auto-fit-zoom` | Shrink the interface to fit small windows | `App` | `toggle` | `settingsAutoFitZoom` → `settings-auto-fit-zoom` |
| **G13** | `palette:set-show-recent-repositories` | Show recent repositories | `App` | `toggle` | `settingsShowRecentRepositories` → `settings-show-recent-repositories` |
| **G14** | `palette:set-branch-name-in-repo-list` | Show the branch name in the repository list | `App` | `choice` `always` / `notDefault` / `never` (`ShowBranchNameInRepoListSetting`) | `settingsBranchNameInRepoList` → `settings-branch-name-in-repo-list` |
| **G15** | `palette:set-branch-sort` | Sort branches | `Branch` | `choice` `lastModified` / `alphabetical` | `settingsBranchSort` → `settings-branch-sort` |
| **G16** | `palette:set-date-format` | Date format | `App` | `choice` from `dateFormats` — **blocked by T1** | `settingsDateFormat` → `settings-date-format`. Gated on `enableFormattingPreferences()` |
| **G17** | `palette:set-time-format` | Time format | `App` | `choice` from `timeFormats` — **T1** | `settingsTimeFormat` → `settings-time-format` |
| **G18** | `palette:set-number-format` | Number format | `App` | `choice` from `numberFormats` — **T1** | `settingsNumberFormat` → `settings-number-format` |
| **G19** | `palette:set-prefer-absolute-dates` | Prefer absolute dates over relative | `App` | `toggle` | `settingsPreferAbsoluteDates` → `settings-prefer-absolute-dates` |

### B2 · Preferences ▸ Advanced — `PreferencesTab.Advanced` (7)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G20** | `palette:set-auto-switch-account` | Switch the active account to the repository owner | `App` | `toggle` | `settingsAutoSwitchAccount` → `settings-auto-switch-account` |
| **G21** | `palette:set-repository-indicators` | Show status icons in the repository list | `App` | `toggle` | `settingsRepositoryIndicators` → `settings-repository-indicators` |
| **G22** | `palette:set-usage-stats` | Submit usage stats | `App` | `toggle` (**value is inverted** — the stored preference is `optOutOfUsageTracking`) | `settingsUsageStats` → `settings-usage-stats`. Whole section renders only when `ENABLE_TELEMETRY`; row must be omitted otherwise |
| **G23** | `palette:set-verbose-logging` | Verbose logging (debug level) | `App` | `toggle` | `settingsVerboseLogging` → `settings-verbose-logging` |
| **G24** | `palette:set-large-repo-auto-detect` | Detect large repositories automatically | `App` | `toggle` | `settingsLargeRepoAutoDetect` → `settings-large-repo-auto-detect` |
| **G25** | `palette:set-large-repo-auto-repack` | Repack large repositories when idle | `App` | `toggle` | `settingsLargeRepoAutoRepack` → `settings-large-repo-auto-repack` |
| **G26** | `palette:set-browser-open-mode` | Open web links | `App` | `choice` `internal` / `external` | `settingsBrowserOpenMode` → `settings-browser-open-mode` |

### B3 · Preferences ▸ Prompts — `PreferencesTab.Prompts` (8)

Verified against `prompts.tsx`: the tab has exactly 10 confirmation checkboxes + 1 radio group + the commit-length toggle. Four checkboxes and the commit-length toggle are already catalogued; the other **seven checkboxes and the radio group are missing**.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G27** | `palette:set-confirm-discard-permanently` | Confirm before permanently discarding changes | `App` | `toggle` | `settingsConfirmDiscardPermanently` → `settings-confirm-discard-permanently` |
| **G28** | `palette:set-confirm-discard-stash` | Confirm before discarding a stash | `Changes` | `toggle` (`confirmDiscardStash` / state `askForConfirmationOnDiscardStash`) | `settingsConfirmDiscardStash` → `settings-confirm-discard-stash` |
| **G29** | `palette:set-confirm-checkout-commit` | Confirm before checking out a commit | `Branch` | `toggle` (`confirmCheckoutCommit`) | `settingsConfirmCheckoutCommit` → `settings-confirm-checkout-commit` |
| **G30** | `palette:set-confirm-undo-commit` | Confirm before undoing a commit | `Changes` | `toggle` | `settingsConfirmUndoCommit` → `settings-confirm-undo-commit` |
| **G31** | `palette:set-confirm-commit-message-override` | Confirm before overwriting the commit message with a generated one | `Changes` | `toggle` | `settingsConfirmCommitMessageOverride` → `settings-confirm-commit-message-override` |
| **G32** | `palette:set-confirm-worktree-removal` | Confirm before removing a worktree | `Branch` | `toggle` | `settingsConfirmWorktreeRemoval` → `settings-confirm-worktree-removal` |
| **G33** | `palette:set-confirm-commit-filtered-changes` | Confirm before committing changes hidden by the filter | `Changes` | `toggle` (`askForConfirmationOnCommitFilteredChanges`) | `settingsConfirmCommitFilteredChanges` → `settings-confirm-commit-filtered-changes` |
| **G34** | `palette:set-uncommitted-changes-strategy` | When switching branches with uncommitted changes | `Changes` | `choice` `askForConfirmation` / `moveToNewBranch` / `stashOnCurrentBranch` | `settingsUncommittedChangesStrategy` → `settings-uncommitted-changes-strategy` |

> The identical **"Do not show this message again"** checkbox appearing in 11 dialog files (`discard-changes-dialog.tsx`, `confirm-force-push.tsx`, `confirm-checkout-commit.tsx`, `delete-worktree-dialog.tsx`, `confirm-discard-stash.tsx`, `warn-local-changes-before-undo.tsx`, `confirm-commit-filtered-changes-dialog.tsx`, `generate-commit-message-override-warning.tsx`, `discard-selection-dialog.tsx`, `discard-changes-retry-dialog.tsx`, `warn-force-push-dialog.tsx`, `move-to-applications-folder.tsx`) writes **the same preferences as G27–G33 and the existing four**. Do **not** create catalog rows for them.

### B4 · Preferences ▸ Accessibility & Notifications (2)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G35** | `palette:set-diff-check-marks` | Show check marks in the diff | `Changes` | `toggle` | `settingsDiffCheckMarks` → `settings-diff-check-marks`, `tab: PreferencesTab.Accessibility` |
| **G36** | `palette:set-error-presentation` | Application error presentation | `App` | `choice` `notice` / `dialog` (`ErrorPresentationStyle`) | `settingsErrorPresentation` → `settings-error-presentation`, `tab: PreferencesTab.Notifications` |

### B5 · Preferences ▸ Git — `PreferencesTab.Git` (8)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G37** | `palette:entry-git-author-name` | Git author name | `App` | `entry` `maxLength: 255`, `clearOnApply: false` | `settingsGitAuthorName` → `settings-git-author-name`. **Flag:** the Save button is disabled on `disallowedCharactersMessage`; the palette must run the same validation and refuse rather than write an invalid `user.name` |
| **G38** | `palette:entry-git-author-email` | Git author email | `App` | `entry` `maxLength: 320` | `settingsGitAuthorEmail` → `settings-git-author-email`. The UI is a select-of-account-emails **plus** free text — the palette entry writes the free-text path |
| **G39** | `palette:set-show-commit-identity` | Show the effective identity above the commit message | `Changes` | `toggle` | `settingsShowCommitIdentity` → `settings-show-commit-identity` |
| **G40** | `palette:entry-default-branch-name` | Default branch name for new repositories | `Branch` | `entry` `maxLength: 255` | `settingsDefaultBranchName` → `settings-default-branch-name`. Must reuse `RefNameTextBox` validation |
| **G41** | `palette:set-git-hook-env` | Load Git hook environment variables from the shell | `App` | `toggle` | `settingsGitHookEnv` → `settings-git-hook-env` |
| **G42** | `palette:set-git-hook-env-shell` | Shell used to load the hook environment | `App` | `choice` `git-bash` / `pwsh` / `powershell` / `cmd` (fixed list — **not** blocked by T1) | `settingsGitHookEnvShell` → `settings-git-hook-env-shell`, `platform: 'win32'`, only when `enableGitHookEnv` |
| **G43** | `palette:set-git-hook-env-cache` | Cache Git hook environment variables | `App` | `toggle` | `settingsGitHookEnvCache` → `settings-git-hook-env-cache` |
| **G44** | `palette:global-ignore` | Global ignore rules | `App` | **none** (navigator — a path field + free textarea + 4 buttons cannot be one row) | `settingsGlobalIgnore` → `settings-global-ignore` |

### B6 · Preferences ▸ Integrations — `PreferencesTab.Integrations` (7)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G45** | `palette:set-external-editor` | External editor | `App` | `dynamic-choice` — **blocked by T1**; ship as navigator until T1 lands | **existing** `settingsExternalEditor` |
| **G46** | `palette:set-shell` | Shell | `App` | `dynamic-choice` — **T1** | **existing** `settingsShell` |
| **G47** | `palette:set-context-menu-opencode` | Explorer context menu: Open with OpenCode here | `App` | `toggle` | `settingsContextMenuOpencode` → `settings-context-menu-opencode`, `platform: 'win32'`. **Flag:** writes the Explorer registry over IPC `set-windows-context-menu-entry`, not a stored preference — the row must reflect the async registry read and disable itself while `unavailableReason === 'opencode-not-found'` |
| **G48** | `palette:set-context-menu-desktop-material` | Explorer context menu: Open in Desktop Material | `App` | `toggle` | `settingsContextMenuDesktopMaterial` → `settings-context-menu-desktop-material`, `platform: 'win32'`, same registry caveat |
| **G49** | `palette:set-context-menu-modern` | Show in the main Windows 11 menu | `App` | `toggle` | `settingsContextMenuModern` → `settings-context-menu-modern`, `platform: 'win32'`. **Flag:** blocked by `requires-windows-11` / `package-missing` / `developer-mode-required`; a bare switch will silently fail — must degrade to a navigator when `isModernContextMenuActionable()` is false |
| **G50** | `palette:branch-preset-script` | Branch name preset script | `Branch` | **none** (navigator — path + args pair) | `settingsBranchPresetScript` → `settings-branch-preset-script`, only when `enableCustomIntegration()` |
| **G51** | `palette:custom-integrations` | Custom editor and shell commands | `App` | **none** (navigator) | `settingsCustomIntegration` → `settings-custom-integration`. Covers all six custom-editor/custom-shell path/choose/arguments fields, which only render when `useCustomEditor` / `useCustomShell` is already selected |

### B7 · Preferences ▸ Agent access — `PreferencesTab.AgentAccess` (4)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G52** | `palette:set-agent-server-enabled` | Agent server | `App` | `toggle` | `settingsAgentServerEnabled` → `settings-agent-server-enabled` |
| **G53** | `palette:agent-access-mode` | Agent access mode | `App` | **none — navigator, deliberately not a `choice`** | `settingsAgentAccessMode` → `settings-agent-access-mode`. **Flag:** selecting `yolo-lan` fires a `window.confirm` security gate. An in-row select would either bypass that gate or pop a native modal out of the palette. Navigator only. |
| **G54** | `palette:agent-pairing` | Pair a mobile device | `App` | **none** (navigator) | `settingsAgentPairing` → `settings-agent-pairing` |
| **G55** | `palette:agent-token` | Desktop bearer token | `App` | **none — teleport only, never a copy action** | `settingsAgentToken` → `settings-agent-token`. **Flag:** the token is secret material. The palette must not read, echo, or copy it; the row exists only to take the user to the reveal/copy controls that already gate it. Do **not** add a `palette:copy-agent-token`. |

### B8 · Preferences ▸ Automation — `PreferencesTab.Automation` (5)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G56** | `palette:set-auto-commit-push` | Automatically commit and push | `Repository` | `toggle` | `settingsAutoCommitPush` → `settings-auto-commit-push` |
| **G57** | `palette:set-auto-commit-push-interval` | Commit and push interval | `Repository` | `choice` over `AutomationIntervals` (fixed) | `settingsAutoCommitPushInterval` → `settings-auto-commit-push-interval`. Only renders while G56 is on — the row must stay visible and re-enable the parent, or be omitted when off |
| **G58** | `palette:set-auto-pull` | Automatically pull | `Repository` | `toggle` | `settingsAutoPull` → `settings-auto-pull` |
| **G59** | `palette:set-auto-pull-interval` | Pull interval | `Repository` | `choice` over `AutomationIntervals` | `settingsAutoPullInterval` → `settings-auto-pull-interval` |
| **G60** | `palette:automation-account-overrides` | Automation overrides (per account) | `App` | **none** (navigator — 4 selects × N accounts, see Part C) | `settingsAutomationAccountOverrides` → `settings-automation-account-overrides` |

### B9 · Preferences ▸ Clone queue — `PreferencesTab.Queue` (1)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G61** | `palette:queue-clone-settings` | Clone queue settings (per account) | `App` | **none** (navigator) | `settingsQueueAccounts` → `settings-queue-accounts`. The existing `palette:background-queue` already opens this tab; G61 differs only by naming the *settings* rather than the queue. **Merge into `palette:background-queue`'s keywords instead if you prefer one row.** Auto-clone/base-directory/clone-mode are per-account (Part C). |

### B10 · Preferences ▸ Sound — `PreferencesTab.Sound` (15)

Only the navigator `palette:preferences-sound` exists. All 15 below read/write `audioCueStore.getSettings()` — field names verified in `app/src/lib/audio/audio-settings.ts`.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G62** | `palette:set-sound-enabled` | Sound | `App` | `toggle` (`masterEnabled`) | `settingsSoundMaster` → `settings-sound-master` |
| **G63** | `palette:set-sound-effects` | Play sound effects | `App` | `toggle` (`sfxEnabled`) | `settingsSoundEffects` → `settings-sound-effects` |
| **G64** | `palette:set-sound-effect-volume` | Effect volume | `App` | `number` 0–100 step 5 (store holds 0–1 — divide on write) | `settingsSoundEffectVolume` → `settings-sound-effect-volume` |
| **G65** | `palette:set-sound-narrator` | Spoken narrator | `App` | `toggle` (`ttsEnabled`) | `settingsSoundNarrator` → `settings-sound-narrator` |
| **G66** | `palette:set-sound-recorded-narration` | Use recorded narration | `App` | `toggle` (`useRecordedNarration`) | `settingsSoundRecordedNarration` → `settings-sound-recorded-narration` |
| **G67** | `palette:set-sound-narrator-volume` | Narrator volume | `App` | `number` 0–100 step 5 (`ttsVolume`) | `settingsSoundNarratorVolume` → `settings-sound-narrator-volume` |
| **G68** | `palette:set-sound-narrator-cooldown` | Minimum gap between narrated lines | `App` | `number` 2–60 step 1 seconds (store holds `ttsCooldownMs` — ×1000 on write) | `settingsSoundNarratorCooldown` → `settings-sound-narrator-cooldown` |
| **G69** | `palette:set-sound-music` | Play themed music | `App` | `toggle` (`musicEnabled`) | `settingsSoundMusic` → `settings-sound-music` |
| **G70** | `palette:set-sound-music-volume` | Music volume | `App` | `number` 0–100 step 5 (`musicVolume`) | `settingsSoundMusicVolume` → `settings-sound-music-volume` |
| **G71** | `palette:set-sound-quiet-hours` | Mute during quiet hours | `App` | `toggle` (`quietHours.enabled`) | `settingsSoundQuietHours` → `settings-sound-quiet-hours` |
| **G72** | `palette:set-sound-quiet-hours-start` | Quiet hours start | `App` | `number` 0–23 step 1 (`quietHours.startHour`) | `settingsSoundQuietHoursStart` → `settings-sound-quiet-hours-start` |
| **G73** | `palette:set-sound-quiet-hours-end` | Quiet hours end | `App` | `number` 0–23 step 1 (`quietHours.endHour`) | `settingsSoundQuietHoursEnd` → `settings-sound-quiet-hours-end` |
| **G74** | `palette:set-sound-reduced-motion` | Follow reduced motion for sound | `App` | `toggle` (`respectReducedMotion`) | `settingsSoundReducedMotion` → `settings-sound-reduced-motion` |
| **G75** | `palette:repository-music-track` | Music track for this repository | `Repository` | **none** (navigator — native file picker) | `settingsSoundMusicTrack` → `settings-sound-music-track`, `isAvailable: whenRepository` |
| **G76** | `palette:audition-sound-cues` | Audition the sound cues | `App` | **none** (navigator — 15 preview buttons, Part C) | `settingsSoundAudition` → `settings-sound-audition` |

### B11 · Preferences ▸ Copilot & Ollama (5)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G77** | `palette:copilot-commit-model` | Copilot commit-message model | `App` | **none** (navigator — `CopilotModelPicker` is a runtime listbox, **T1**) | `settingsCopilotCommitModel` → `settings-copilot-commit-model`, `tab: PreferencesTab.Copilot` |
| **G78** | `palette:copilot-conflict-model` | Copilot conflict-resolution model | `App` | **none** (navigator, **T1**) | `settingsCopilotConflictModel` → `settings-copilot-conflict-model`. Gated on `enableCopilotConflictResolution()` |
| **G79** | `palette:set-copilot-always-resolve-conflicts` | Always use Copilot when conflicts are detected | `Changes` | `toggle` | `settingsCopilotAlwaysConflicts` → `settings-copilot-always-conflicts` |
| **G80** | `palette:add-ai-provider` | Add an AI provider (BYOK) | `App` | **none** (opens `edit-byok-provider-dialog`) | omit `home` → defaults to `openEvent: 'self'`. The Providers sub-tab only exists when `showBYOKSettings` |
| **G81** | `palette:entry-ollama-endpoint` | Ollama endpoint | `App` | `entry` `maxLength: 2048`, `clearOnApply: false` | `settingsOllamaEndpoint` → `settings-ollama-endpoint`, `tab: PreferencesTab.Ollama`. **Flag:** the Connect button validates loopback/trusted; the palette must run the same check before writing |

### B12 · Repository settings tabs — `RepositorySettingsTab` (9)

Only `CheapLfs` (`palette:cheap-lfs-settings`) and `Automation` (`palette:repository-automation`) are catalogued. Each row below dispatches `showRepositorySettings(tab)` and, per **T5**, omits `home` so `resolvePaletteHome` supplies `{ surface, homeDialog, openEvent: 'self' }` — opening the tab *is* the teleport. All carry `isAvailable: whenRepository`.

| # | event | title | group | `RepositorySettingsTab` |
|---|---|---|---|---|
| **G82** | `palette:repository-remotes` | Repository remotes | `Repository` | `Remote` |
| **G83** | `palette:repository-git-config` | Repository Git config (name and email) | `Repository` | `GitConfig` |
| **G84** | `palette:repository-build-run-settings` | Build & run settings | `Repository` | `BuildRun` |
| **G85** | `palette:repository-submodules` | Submodules | `Repository` | `Submodules` — wants `hasSubmodules` (**T2**) |
| **G86** | `palette:repository-subtrees` | Subtrees | `Repository` | `Subtrees` |
| **G87** | `palette:repository-metadata` | Repository metadata (default branch, editor) | `Repository` | `Metadata` |
| **G88** | `palette:repository-appearance` | Repository appearance | `Repository` | `Appearance` |
| **G89** | `palette:repository-fork-settings` | Fork behaviour | `Repository` | `ForkSettings` — **the tab only renders for forks**; needs `isFork` (**T2**), otherwise the row teleports to a tab that is not there |
| **G90** | `palette:ssh-working-copy` | SSH working copy | `Repository` | `Remote` (sub-section) — same tab as G82, differentiated by keywords |

`Ignored files` is **already covered** by the existing `manage-gitignore`; add `.gitignore ignored files templates` to its `keywords` rather than a new row.

### B13 · Repository settings ▸ Build & run (8)

Each declares `home: { kind: 'surface', labelKey: 'commandPalette.homeRepositorySettings', openEvent: 'palette:repository-build-run-settings', targetId: … }` (**T5** cheap option) and `isAvailable: whenRepository`.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G91** | `palette:set-build-auto-install` | Auto-install missing build tools | `Repository` | `toggle` | `repoSettingsBuildAutoInstall` → `repo-settings-build-auto-install` |
| **G92** | `palette:set-build-pre-elevate` | Pre-elevate the build chain | `Repository` | `toggle` | `repoSettingsBuildPreElevate` → `repo-settings-build-pre-elevate` |
| **G93** | `palette:set-build-run-after-build` | Run after a successful build | `Repository` | `toggle` | `repoSettingsBuildRunAfterBuild` → `repo-settings-build-run-after-build` |
| **G94** | `palette:set-build-auto-ignore-outputs` | Auto-ignore build outputs | `Repository` | `toggle` | `repoSettingsBuildAutoIgnore` → `repo-settings-build-auto-ignore` |
| **G95** | `palette:set-build-after-pull` | Build after pulling new commits | `Repository` | `toggle` | `repoSettingsBuildAfterPull` → `repo-settings-build-after-pull` |
| **G96** | `palette:set-build-offer-agents` | Offer Codex/OpenCode to fix build errors | `Repository` | `toggle` | `repoSettingsBuildOfferAgents` → `repo-settings-build-offer-agents` |
| **G97** | `palette:set-build-fix-provider` | Preferred build-fix provider | `Repository` | `choice` `codex` / `opencode` (fixed) | `repoSettingsBuildFixProvider` → `repo-settings-build-fix-provider`. Same preference is also edited from the OpenCode fix/send dialogs — one catalog row, three surfaces |
| **G98** | `palette:set-build-fix-auto-approve` | Auto-approve the build-fix agent in this repository | `Repository` | `toggle` | `repoSettingsBuildFixAutoApprove` → `repo-settings-build-fix-auto-approve`. Writes both `buildFixAutoApprove` and the legacy `opencodeAutoApprove` |

### B14 · Repository settings ▸ Cheap LFS (7)

`palette:cheap-lfs-settings` opens the tab; none of its individual controls are catalogued. Each declares `openEvent: 'palette:cheap-lfs-settings'`.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G99** | `palette:set-cheap-lfs-auto-materialize` | Download large files after cloning | `Repository` | `toggle` | `repoSettingsCheapLfsAutoMaterialize` → `repo-settings-cheap-lfs-auto-materialize` |
| **G100** | `palette:set-cheap-lfs-auto-pin` | Pin large files when committing | `Repository` | `toggle` | `repoSettingsCheapLfsAutoPin` → `repo-settings-cheap-lfs-auto-pin` |
| **G101** | `palette:set-cheap-lfs-clone-helper` | Include the clone helper script | `Repository` | `toggle` | `repoSettingsCheapLfsCloneHelper` → `repo-settings-cheap-lfs-clone-helper` |
| **G102** | `palette:set-cheap-lfs-parallel-uploads` | Simultaneous Cheap LFS uploads | `Repository` | `number` 1–3 step 1 | `repoSettingsCheapLfsParallelUploads` → `repo-settings-cheap-lfs-parallel-uploads` |
| **G103** | `palette:set-cheap-lfs-storage-provider` | Large-file storage provider | `Repository` | `choice` `release` / `ghcr` / `dockerhub` (fixed) | `repoSettingsCheapLfsStorageProvider` → `repo-settings-cheap-lfs-storage-provider` |
| **G104** | `palette:set-cheap-lfs-cloud-compression` | Cloud compression for this private repository | `Repository` | `toggle` | `repoSettingsCheapLfsCloudCompression` → `repo-settings-cheap-lfs-cloud-compression`. **Flag:** disabled and force-on for public repos — the palette switch must be read-only in that state, not silently no-op |
| **G105** | `palette:cheap-lfs-encryption` | Encrypt new Release payloads with a password | `Repository` | **none — navigator, deliberately not a `toggle`** | `repoSettingsCheapLfsEncryption` → `repo-settings-cheap-lfs-encryption`. **Flag:** turning it on requires a password dialog. A palette switch would enable encryption with no key. |

### B15 · Repository tools ▸ signing (3)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G106** | `palette:set-signing-commits` | Sign commits by default | `Repository` | `toggle` | `repositoryToolsSigning` → `repository-tools-signing`, via `openEvent: 'show-repository-tools'`. **Flag:** the UI writes repository Git config only after a review step; the palette must go through the same review, not write directly |
| **G107** | `palette:set-signing-tags` | Sign annotated tags by default | `Repository` | `toggle` | `repositoryToolsSigning`, same caveat |
| **G108** | `palette:signing-policy` | Manage the signing policy | `Repository` | **none** (navigator — includes the free-text signing key) | `home: { kind: 'surface', labelKey: 'commandPalette.homeRepositoryTools', openEvent: 'show-repository-tools', targetId: 'sidebarRepositoryToolsTab' }` |

### B16 · Diff options popover (2)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G109** | `palette:set-diff-auto-expand-context` | Automatically expand whole-file context | `Changes` | `toggle` | `diffOptionsButton` → `diff-options-button` on the popover trigger, `labelKey: 'commandPalette.homeDiffOptions'`, **no `openEvent`** (the preference persists in `diff-context-preferences.ts` and is writable without opening the popover) |
| **G110** | `palette:set-diff-context-step` | Context expansion step | `Changes` | `choice` `20` / `50` / `100` (fixed) | `diffOptionsButton`, same shape |

### B17 · The command palette's own appearance (6)

Persisted in `command-palette-appearance.ts`; reachable today only from the `tune` button beside the palette's filter controls.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G111** | `palette:appearance` | Customize the command palette | `App` | **none** (navigator) | `paletteAppearanceButton` → `palette-appearance-button`, `labelKey: 'commandPalette.homeCommandPalette'` |
| **G112** | `palette:set-palette-density` | Command palette row density | `App` | `choice` `comfortable` / `compact` | `paletteAppearanceButton`. Disabled while G113 is on |
| **G113** | `palette:set-palette-random-per-repository` | Randomize the palette's look per repository | `App` | `toggle` | `paletteAppearanceButton` |
| **G114** | `palette:set-palette-show-icons` | Show icons in palette rows | `App` | `toggle` | `paletteAppearanceButton` |
| **G115** | `palette:set-palette-show-group-chips` | Show group chips in palette rows | `App` | `toggle` | `paletteAppearanceButton` |
| **G116** | `palette:set-palette-show-keywords` | Show the keyword line in palette rows | `App` | `toggle` | `paletteAppearanceButton` |

### B18 · Tabs (8)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G117** | `palette:new-tab-group` | New tab group | `App` | **none** (dialog) | omit `home` |
| **G118** | `palette:edit-tab-group` | Edit the current tab group | `App` | **none** (dialog) | omit `home`. Needs a "a group is selected" predicate (**T2**) |
| **G119** | `palette:close-tabs-containing` | Close tabs containing text | `App` | `entry` `maxLength: 256`, `clearOnApply: true` | `tabStrip` → `tab-strip`, `labelKey: 'commandPalette.homeTabStrip'`, **no `openEvent`**. **Flag:** the shared instructions require a preview + count before any close — the palette entry must open the existing popover pre-filled, never close tabs on Enter |
| **G120** | `palette:close-tabs-not-containing` | Close tabs not containing text | `App` | `entry`, same shape | `tabStrip`, same flag; must negate the identical predicate |
| **G121** | `palette:pin-tab` | Pin the current tab | `App` | **none** | `tabStrip` |
| **G122** | `palette:unpin-tab` | Unpin the current tab | `App` | **none** | `tabStrip` |
| **G123** | `palette:edit-tab-appearance` | Edit the current tab's appearance | `App` | **none** (opens the anchored editor) | `tabStrip` |
| **G124** | `palette:search-tabs` | Search open tabs | `Navigate` | `entry`, `clearOnApply: false` | `tabStrip` |

### B19 · Anchored per-element appearance editors (6)

These editors do not exist in the DOM until opened and are anchored to the element they decorate. The correct catalog shape is a row that **opens the editor for a named element**, whose `targetId` points at that element — not at the editor.

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G125** | `palette:edit-app-appearance` | Edit the app's appearance | `App` | **none** | `appWorkspace` → `app-workspace` (new anchor on the workspace root; mounted from `app.tsx` ~5802) |
| **G126** | `palette:edit-app-identity` | Edit the app name and logo | `App` | **none** | `titleBarBrand` → `title-bar-brand`, `labelKey: 'commandPalette.homeTitleBar'` |
| **G127** | `palette:edit-toolbar-appearance` | Edit the toolbar's appearance | `App` | **none** | **existing** `toolbarRepository` (or a new `toolbar` anchor on the strip itself, which is cleaner) |
| **G128** | `palette:edit-repository-list-appearance` | Edit the repository list's appearance | `App` | **none** | **existing** `repositorySidebar` |
| **G129** | `palette:edit-repository-tabs-appearance` | Edit repository tab appearance | `App` | **none** | `tabStrip` |
| **G130** | `palette:edit-repository-logo` | Edit the repository logo | `Repository` | **none** | via `openEvent: 'palette:repository-appearance'` (G88), `targetId: 'repoSettingsAppearance'` → `repo-settings-appearance` |

### B20 · Remaining dialogs (3)

| # | event | title | group | control | teleport target |
|---|---|---|---|---|---|
| **G131** | `palette:manage-repository-groups` | Manage repository groups | `App` | **none** (dialog) | omit `home` |
| **G132** | `palette:repository-account` | Repository account | `Repository` | **none** (navigator — account list is runtime, **T1**) | `repoSettingsAccount` → `repo-settings-account`, via `openEvent: 'palette:repository-remotes'` (G82). Only when the repo has a `gitHubRepository` endpoint |
| **G133** | `palette:regex-builder` | Open the regex builder | `Edit` | **none** | `home: { kind: 'surface', labelKey: 'commandPalette.homeCommandPalette' }`. **Flag:** the builder is anchored per search field and there are ~20 of them; a global row has no field to bind to. Scope it explicitly to the palette's *own* search field and say so in `descriptionKey`. |

---

## PART C — Genuinely cannot be catalogued or teleported to, and why

### C1. Electron `role` menu items — no `MenuEvent`, so `onPaletteCommand`'s `default: → onMenuEvent()` cannot reach them

`undo`, `redo`, `cut`, `copy`, `paste`, `togglefullscreen`, `minimize`, `zoom`, `close`, `front`, `quit`/`E&xit`, `services`, `hide`, `hideOthers`, `unhide`. They are declared as `{ role: … }` in `build-default-menu.ts` and never call `emit()`. Adding them requires new main-process IPC (or `document.execCommand` for the clipboard four) — it is **not** a catalog-only change. Note that `Select All` **is** an `emit('select-all')`, which is why `select-all` is already in the catalog and the others are not.

### C2. Test-menu items — deliberately excluded

Everything under `buildTestMenu()` (crash main/renderer, prune branches, 5 test popups, 9 test banners, 16 test error dialogs, CLI install/uninstall test items, `test-notification`, `test-cli-action`). They render only under `enableTestMenuItems()`, the catalog has no dev-only gate, and shipping them would put "Crash main process" one keystroke from a user's fingers. **Do not add.**

### C3. Unbounded, runtime-generated rows — one catalog entry cannot address "the third one"

| Surface | Rows | Covered instead by |
|---|---|---|
| Accounts tab: Sign in / Add / Make active / Sign out per account (GitHub.com, Enterprise, GitLab, Bitbucket), GitLab server + token, Bitbucket username + app password | N × 6 | existing `palette:preferences-accounts` |
| Automation ▸ Account overrides: 4 selects × N accounts | 4N | **G60** |
| Clone queue: auto-clone, base directory, clone mode × N accounts | 3N | **G61** / `palette:background-queue` |
| Repository settings ▸ Remote manager: `{remote} remote name`, fetch URL, separate push URL, push URL, stale-branch pruning, tracked default branch | 6N per repo | **G82** |
| Agent access ▸ Paired devices: `Revoke {device}` | N | **G54** |
| Repository logo studio ▸ Layers: mark, text source, custom text, font, weight, letter spacing, layer colour, H/V position, scale, rotation, opacity | 12 per layer × N layers | **G130** |
| Copilot ▸ Providers: `Edit {provider}` / `Remove {provider}` / `Manage models` | 3N | **G80** |
| Sound ▸ Audition each cue: 15 preview buttons | 15 | **G76** |
| Submodules: per-row Configure → submodule config dialog (6 controls) | 6N | **G85** |
| Actions view run filters (Workflow/Branch/Event/Status) | 4, but they are transient view filters, not persisted settings | not a settings gap — exclude |

### C4. Credential and secret surfaces — excluded on policy, not on feasibility

- Agent access **Reveal token** / **Copy agent token** / **Regenerate token**: secret material. G55 teleports to the row; the palette never reads or copies the value.
- SSH key passphrase **Remember passphrase**, SSH user password **Remember password**, Cheap LFS payload password **Remember this password** + its acknowledgement checkbox: these exist only inside a live credential prompt and have no meaning outside it.
- Cheap LFS **Set/Change password** and **Forget password**: see **G105**.

### C5. Per-search-surface state with no global value

`Filter mode` (Fuzzy/Substring/Regex), `Match case`, and `Open regex builder` appear on ~20 search bars and persist **per `searchSurfaceId`** via `app/src/ui/lib/filter-list-mode.ts`. There is no app-wide value for a palette row to show or set. Only **G133**, explicitly scoped to the palette's own field, is meaningful.

### C6. Elements that may not be on screen at teleport time

`teleportTargetSelector()` resolves exactly one DOM node. These anchors exist only conditionally, so a row pointing at them teleports to nothing when the condition is false:

- **Submodule Back button appearance editor** — the button exists only while a submodule workspace is open. No context flag exists (**T2**). Recommend **omitting the row entirely** rather than shipping a dead teleport.
- **G89** fork settings tab — only for forks.
- **G16–G19** formatting rows — only when `enableFormattingPreferences()`.
- **G42/G43** hook-env rows — only when `enableGitHookEnv` (and `__WIN32__` for the shell select).
- **G22** usage stats — only when `ENABLE_TELEMETRY`.
- **G50/G51** custom integrations — only when `enableCustomIntegration()`.
- **G78** Copilot conflict model — only when `enableCopilotConflictResolution()`.
- **Copilot tab itself** — the rail tab renders only when some account passes `enableCopilotSdkCommitMessageGeneration`; the existing `palette:preferences-copilot` already has this latent problem.

### C7. Duplicate surfaces that must map to **one** catalog row, not several

The inventory lists the same persisted preference in more than one place. Catalogue once:

- `buildRun.providerLabel` / `buildRun.autoApproveRepositoryProvider` appear in **Repository settings ▸ Build & run**, the **OpenCode fix dialog**, and the **Send to OpenCode dialog** → **G97 / G98** only.
- `cheapLfs.cloud.privateToggle` appears in **Repository settings ▸ Cheap LFS** and **Repository tools ▸ Cheap LFS manager** → **G104** only.
- The 11 **"Do not show this message again"** checkboxes → the Prompts toggles (existing four + **G27–G33**).
- **App identity editor** is listed twice (as a "Preferences" surface and as an anchored editor) but is one component mounted once from `app.tsx` → **G126** only.
- **Toolbar typography** is listed for both the profile and repository scopes → **G127** covers the profile scope; the repository scope is reached through **G88**.

---

## PART D — Paste-ready additions to `app/src/lib/teleport-targets.ts`

96 new keys. Order preserved to match the sections above.

```ts
  // Appearance
  settingsUiScale: '[data-teleport-target="settings-ui-scale"]',
  settingsAutoFitZoom: '[data-teleport-target="settings-auto-fit-zoom"]',
  settingsShowRecentRepositories:
    '[data-teleport-target="settings-show-recent-repositories"]',
  settingsBranchNameInRepoList:
    '[data-teleport-target="settings-branch-name-in-repo-list"]',
  settingsBranchSort: '[data-teleport-target="settings-branch-sort"]',
  settingsDateFormat: '[data-teleport-target="settings-date-format"]',
  settingsTimeFormat: '[data-teleport-target="settings-time-format"]',
  settingsNumberFormat: '[data-teleport-target="settings-number-format"]',
  settingsPreferAbsoluteDates:
    '[data-teleport-target="settings-prefer-absolute-dates"]',

  // Advanced
  settingsAutoSwitchAccount:
    '[data-teleport-target="settings-auto-switch-account"]',
  settingsRepositoryIndicators:
    '[data-teleport-target="settings-repository-indicators"]',
  settingsUsageStats: '[data-teleport-target="settings-usage-stats"]',
  settingsVerboseLogging: '[data-teleport-target="settings-verbose-logging"]',
  settingsLargeRepoAutoDetect:
    '[data-teleport-target="settings-large-repo-auto-detect"]',
  settingsLargeRepoAutoRepack:
    '[data-teleport-target="settings-large-repo-auto-repack"]',
  settingsBrowserOpenMode:
    '[data-teleport-target="settings-browser-open-mode"]',

  // Prompts
  settingsConfirmDiscardPermanently:
    '[data-teleport-target="settings-confirm-discard-permanently"]',
  settingsConfirmDiscardStash:
    '[data-teleport-target="settings-confirm-discard-stash"]',
  settingsConfirmCheckoutCommit:
    '[data-teleport-target="settings-confirm-checkout-commit"]',
  settingsConfirmUndoCommit:
    '[data-teleport-target="settings-confirm-undo-commit"]',
  settingsConfirmCommitMessageOverride:
    '[data-teleport-target="settings-confirm-commit-message-override"]',
  settingsConfirmWorktreeRemoval:
    '[data-teleport-target="settings-confirm-worktree-removal"]',
  settingsConfirmCommitFilteredChanges:
    '[data-teleport-target="settings-confirm-commit-filtered-changes"]',
  settingsUncommittedChangesStrategy:
    '[data-teleport-target="settings-uncommitted-changes-strategy"]',

  // Accessibility and notifications
  settingsDiffCheckMarks:
    '[data-teleport-target="settings-diff-check-marks"]',
  settingsErrorPresentation:
    '[data-teleport-target="settings-error-presentation"]',

  // Git
  settingsGitAuthorName: '[data-teleport-target="settings-git-author-name"]',
  settingsGitAuthorEmail: '[data-teleport-target="settings-git-author-email"]',
  settingsShowCommitIdentity:
    '[data-teleport-target="settings-show-commit-identity"]',
  settingsDefaultBranchName:
    '[data-teleport-target="settings-default-branch-name"]',
  settingsGitHookEnv: '[data-teleport-target="settings-git-hook-env"]',
  settingsGitHookEnvShell:
    '[data-teleport-target="settings-git-hook-env-shell"]',
  settingsGitHookEnvCache:
    '[data-teleport-target="settings-git-hook-env-cache"]',
  settingsGlobalIgnore: '[data-teleport-target="settings-global-ignore"]',

  // Integrations
  settingsContextMenuOpencode:
    '[data-teleport-target="settings-context-menu-opencode"]',
  settingsContextMenuDesktopMaterial:
    '[data-teleport-target="settings-context-menu-desktop-material"]',
  settingsContextMenuModern:
    '[data-teleport-target="settings-context-menu-modern"]',
  settingsBranchPresetScript:
    '[data-teleport-target="settings-branch-preset-script"]',
  settingsCustomIntegration:
    '[data-teleport-target="settings-custom-integration"]',

  // Agent access
  settingsAgentServerEnabled:
    '[data-teleport-target="settings-agent-server-enabled"]',
  settingsAgentAccessMode:
    '[data-teleport-target="settings-agent-access-mode"]',
  settingsAgentPairing: '[data-teleport-target="settings-agent-pairing"]',
  settingsAgentToken: '[data-teleport-target="settings-agent-token"]',

  // Automation and queue
  settingsAutoCommitPush:
    '[data-teleport-target="settings-auto-commit-push"]',
  settingsAutoCommitPushInterval:
    '[data-teleport-target="settings-auto-commit-push-interval"]',
  settingsAutoPull: '[data-teleport-target="settings-auto-pull"]',
  settingsAutoPullInterval:
    '[data-teleport-target="settings-auto-pull-interval"]',
  settingsAutomationAccountOverrides:
    '[data-teleport-target="settings-automation-account-overrides"]',
  settingsQueueAccounts: '[data-teleport-target="settings-queue-accounts"]',

  // Sound
  settingsSoundMaster: '[data-teleport-target="settings-sound-master"]',
  settingsSoundEffects: '[data-teleport-target="settings-sound-effects"]',
  settingsSoundEffectVolume:
    '[data-teleport-target="settings-sound-effect-volume"]',
  settingsSoundNarrator: '[data-teleport-target="settings-sound-narrator"]',
  settingsSoundRecordedNarration:
    '[data-teleport-target="settings-sound-recorded-narration"]',
  settingsSoundNarratorVolume:
    '[data-teleport-target="settings-sound-narrator-volume"]',
  settingsSoundNarratorCooldown:
    '[data-teleport-target="settings-sound-narrator-cooldown"]',
  settingsSoundMusic: '[data-teleport-target="settings-sound-music"]',
  settingsSoundMusicVolume:
    '[data-teleport-target="settings-sound-music-volume"]',
  settingsSoundMusicTrack:
    '[data-teleport-target="settings-sound-music-track"]',
  settingsSoundQuietHours:
    '[data-teleport-target="settings-sound-quiet-hours"]',
  settingsSoundQuietHoursStart:
    '[data-teleport-target="settings-sound-quiet-hours-start"]',
  settingsSoundQuietHoursEnd:
    '[data-teleport-target="settings-sound-quiet-hours-end"]',
  settingsSoundReducedMotion:
    '[data-teleport-target="settings-sound-reduced-motion"]',
  settingsSoundAudition: '[data-teleport-target="settings-sound-audition"]',

  // Copilot and Ollama
  settingsCopilotCommitModel:
    '[data-teleport-target="settings-copilot-commit-model"]',
  settingsCopilotConflictModel:
    '[data-teleport-target="settings-copilot-conflict-model"]',
  settingsCopilotAlwaysConflicts:
    '[data-teleport-target="settings-copilot-always-conflicts"]',
  settingsOllamaEndpoint: '[data-teleport-target="settings-ollama-endpoint"]',

  // Repository settings
  repoSettingsAccount: '[data-teleport-target="repo-settings-account"]',
  repoSettingsAppearance: '[data-teleport-target="repo-settings-appearance"]',
  repoSettingsBuildAutoInstall:
    '[data-teleport-target="repo-settings-build-auto-install"]',
  repoSettingsBuildPreElevate:
    '[data-teleport-target="repo-settings-build-pre-elevate"]',
  repoSettingsBuildRunAfterBuild:
    '[data-teleport-target="repo-settings-build-run-after-build"]',
  repoSettingsBuildAutoIgnore:
    '[data-teleport-target="repo-settings-build-auto-ignore"]',
  repoSettingsBuildAfterPull:
    '[data-teleport-target="repo-settings-build-after-pull"]',
  repoSettingsBuildOfferAgents:
    '[data-teleport-target="repo-settings-build-offer-agents"]',
  repoSettingsBuildFixProvider:
    '[data-teleport-target="repo-settings-build-fix-provider"]',
  repoSettingsBuildFixAutoApprove:
    '[data-teleport-target="repo-settings-build-fix-auto-approve"]',
  repoSettingsCheapLfsAutoMaterialize:
    '[data-teleport-target="repo-settings-cheap-lfs-auto-materialize"]',
  repoSettingsCheapLfsAutoPin:
    '[data-teleport-target="repo-settings-cheap-lfs-auto-pin"]',
  repoSettingsCheapLfsCloneHelper:
    '[data-teleport-target="repo-settings-cheap-lfs-clone-helper"]',
  repoSettingsCheapLfsParallelUploads:
    '[data-teleport-target="repo-settings-cheap-lfs-parallel-uploads"]',
  repoSettingsCheapLfsStorageProvider:
    '[data-teleport-target="repo-settings-cheap-lfs-storage-provider"]',
  repoSettingsCheapLfsCloudCompression:
    '[data-teleport-target="repo-settings-cheap-lfs-cloud-compression"]',
  repoSettingsCheapLfsEncryption:
    '[data-teleport-target="repo-settings-cheap-lfs-encryption"]',
  repositoryToolsSigning:
    '[data-teleport-target="repository-tools-signing"]',

  // Non-settings surfaces
  diffOptionsButton: '[data-teleport-target="diff-options-button"]',
  paletteAppearanceButton:
    '[data-teleport-target="palette-appearance-button"]',
  tabStrip: '[data-teleport-target="tab-strip"]',
  titleBarBrand: '[data-teleport-target="title-bar-brand"]',
  appWorkspace: '[data-teleport-target="app-workspace"]',
```

---

## Summary

| Bucket | Count |
|---|---|
| Menu commands missing (`MenuEvent`) | **2** (G1–G2) |
| Menu commands missing (main-process click handlers, need new IPC) | **7** (G3–G9) |
| Settings missing, catalogable **with a live control** | **74** |
| Settings missing, catalogable **as navigator rows only** | **41** |
| **Total new catalog entries** | **133** |
| New `TeleportTargetId` keys required | **96** |
| New `commandPalette.home*` label keys required | **7** |
| Type changes required first (T1–T5) | **5** |
| Explicitly excluded, with reason | Electron roles (15), test-menu items (~40), unbounded per-account/per-remote/per-device/per-layer rows (10 families), credential surfaces (6), per-search-surface filter state (3 × ~20 fields), duplicate surfaces (5 families) |

The single highest-leverage prerequisite is **T1** (dynamic choice options): without it, 8 of the 133 entries (G16, G17, G18, G45, G46, G77, G78, G132) must ship as navigator rows even though the user's real intent is to change the value from the palette.
