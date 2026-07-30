# Publish organization picker sizing acceptance — 2026-07-30

This receipt covers the **Publish repository → Organization** listbox repair.
It does not claim that a repository was published: the acceptance fixture has
no remote, uses a synthetic loopback provider, and stops at the reviewed
dialog.

## Accepted behavior

- The ownership surface is a real searchable `role="listbox"`, with an
  explicit personal-account **None** option and three synthetic organization
  options.
- Its search uses the audited fuzzy, substring, and safe-regex modes plus the
  shared Regex Builder.
- Invalid regex leaves every destination reachable and reports inline
  feedback.
- Keyboard movement, selection, active-descendant semantics, visible focus,
  and defensive scrolling remain operable.
- At 390×844 in bilingual mode, the listbox retains usable nonzero height,
  long organization names remain inside the dialog, the controls wrap without
  horizontal overflow, and its four fixture destinations create a real
  positive inner-scroll range whose final option is reachable.
- The restored 1440×960 frame preserves the same list geometry without
  stretching it into an unbounded page.

## Evidence boundary

The application was built from the exact repository source through the
project's production command and launched on a uniquely named off-screen
Win32 desktop through Lowlevel MCP. The run used an isolated user-data
directory and a disposable Git fixture below the run root. No visible desktop,
personal account, credential, user repository, or third-party network data was
used.

The accepted screenshot is published as
[`material-publish-organization-picker.png`](../../assets/screenshots/material-publish-organization-picker.png)
after original-resolution inspection. The byte-identical retained frame is
[`publish-organization-picker-1440x960.png`](publish-organization-picker-1440x960.png),
and the machine-readable measurements are in
[`runtime-receipt.json`](runtime-receipt.json).

## Verification record

<!-- markdownlint-disable MD013 -->

| Gate | Result |
| --- | --- |
| Runtime source | Exact task application tree published by `63c1ec08c4f24f85d87f21d98851dcd5784c7800` (based on `dcf985d8521177406782816894c831e49e81e8c7`) |
| Focused picker, parent, registry, style, responsive, and nested-dialog keyboard tests | **26/26 passed** |
| TypeScript | `yarn tsc --noEmit` passed |
| Changed-file lint/format | Repository-rule ESLint, Prettier, and `git diff --check` passed |
| Verifier contracts | **83/83 passed** before gallery promotion; the final promoted count is re-run before commit |
| Synthetic provider | **19/19 passed** |
| Exact production build | **Passed** in 1,042.19 s; return code 0, no timeout; stderr contained only npm's upgrade notice |
| 390×844 bilingual geometry | **Passed** at physical 390×844 / logical 780×1,688 with DPR and auto-fit zoom 0.5 |
| Narrow listbox | 176 CSS px / 88 physical px high; 172 px client height, 184 px scroll height, 12 px positive range; bottom and final row reached |
| Narrow containment | Dialog contained; four options; **None** selected; long login ellipsized; no horizontal overflow |
| 1440×960 restored geometry | **Passed** at DPR/zoom 1; 176 px listbox; four options; no horizontal overflow; zoom HUD absent |
| Accepted PNG | 1,440×960; 133,919 bytes; SHA-256 `7db03d5db789d19e1ad49de66bd79abb62e46c7909eda9de08878aac367033d8` |
| Original-resolution visual/privacy inspection | **Passed**; the frame contains only synthetic fixture data and no transient zoom HUD |
| Provider safety | Scene required one organization GET delta and zero state-changing delta after its Git-read baseline |
| Owned desktop/process/path cleanup | **Passed**; app, provider, launcher, dummy credential, listener ports, windows, and owned Temp root were all verified absent |
| Exact commit / remote CI / installer Release | Implementation commit `63c1ec08c4f24f85d87f21d98851dcd5784c7800` is proven on `origin/main`; the first matrix found this retained receipt and the regenerated parity input missing, so final hosted CI and installer Release remain pending |

<!-- markdownlint-enable MD013 -->

The scene also exercised a physical <kbd>Escape</kbd> through the portalled
Regex Builder. The builder dismissed exactly once while the Publish dialog
remained open, then the run continued through <kbd>End</kbd>,
<kbd>Enter</kbd>, <kbd>Home</kbd>, and another <kbd>Enter</kbd>. Invalid regex
was non-destructive, and the final provider-mutation delta remained zero.

Original-resolution review rejected an earlier formally successful candidate
because the transient 100% zoom indicator covered the search controls. The
accepted replacement waits fail closed for `#window-zoom-info` to disappear.

香港粵語：今次真係捉到「個清單喺度，但驗收尺自己量錯單位」同「100% 提示走出嚟
攝鏡」兩隻妖怪。最後收貨嗰張係真 production build、假資料、hidden desktop，
仲有 exact hash 同完整清理證明；唔再靠氣勢當測試，清單終於唔使玩密室逃脫。
