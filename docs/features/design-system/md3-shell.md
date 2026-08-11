# The Material Design 3 shell

The application chrome, rewritten against `design/History MD3.dc.html` and
assembled as one component. `Md3Shell` (`app/src/ui/md3/md3-shell.tsx`) is what
`App.renderApp()` renders: a 56px application header, the repository tab strip
band, a navigation drawer beside a 16px `surface-container-low` content pane,
the pane header, the active destination, and four overlays that share one
"only one open at a time" rule.

The shell reads nothing. It imports neither the dispatcher nor the app store —
every value it renders and every action it can take arrives as a prop, which is
what lets the same code path serve `app.tsx` and a screenshot harness with no
application behind it.

**Nothing the old chrome carried was deleted.** The repository tab strip stays
and is shown by default, because multi-repository tabs are a real capability of
this fork that the contract's single-repository prototype simply never drew.
The classic toolbar stays too, behind a persisted setting that also ships
enabled. See [Legacy chrome](#legacy-chrome).

## Behavior

| Aspect | Behavior |
| --- | --- |
| Destinations | Eight: Changes, History, Branches, Actions, Inbox, Terminal, Agents, Repositories |
| Opening state | History, drawer expanded, no overlay, no progress |
| Search fields | Eleven, each with its own query **and** its own regex mode |
| Overlays | Menu, regex builder, or compose dialog — one at a time |
| Menu kinds | 23, every one filterable and every one carrying a regex builder |
| Toasts | Rendered by `Md3ToastHost`, which is always mounted |
| State | One exported shape, one exported pure reducer |
| Network | None. The shell performs no I/O of its own |

### The eight destinations

`Md3DestinationIds` enumerates them in the drawer's order, and
`md3PaneDestination` translates a drawer id into the pane header's own
capitalized name. Each destination renders either its MD3 view — supplied
through the `views` prop as `IMd3ShellViews` — or, when that entry is `null`,
whatever `renderLegacyDestination` returns.

That fallback is not a placeholder. It is the application's real existing
repository workspace and build runner, rendered inside the MD3 chrome, and it
is what keeps every capability reachable while the eight views are wired one at
a time. `md3NoViews` is the shape a host starts from, with all eight unhandled.

Switching destination closes whatever overlay was open: the contract's menus
act on the destination they were opened from, so leaving one up over a
different pane would offer commands for a surface that is no longer showing.

### The navigation drawer

`Md3NavigationDrawer` renders the destinations built by `md3Destinations`,
which takes the per-destination badge counts and the active id. The drawer
expands and collapses, carries the active repository's name, owns the compose
entry point, and right-click opens `drawerMenu`.

Its labels are text, not icons alone. The tabs point at the pane through
`aria-controls`, and the pane owns a visually hidden `<h1>` (`Md3ShellHeadingId`)
that takes focus on every destination change — the visible pane title is a
`<span>` inside the pane header, so without it a keyboard user who switched
destination would be stranded on a control that no longer exists.

### The application header

`Md3AppHeader` carries the brand, the commit-and-push pill, the global search
field, and the action row: command palette, notifications with an unread badge
that caps at `99+`, theme toggle, settings, and the account avatar.

Two deliberate departures from the literal contract:

- The contract hard-codes the product name. The name is the user's to change,
  so the header reads it from the profile's app-identity customization instead.
  Renaming changes this label and nothing else — the data directory, the update
  feed and every package identifier stay put.
- The contract's palette chip reads `⌘K`. This build ships on Windows, where
  the palette is <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, so the chip
  renders whatever accelerator the application menu actually registered for the
  `command-palette` command. The hint cannot drift from the binding because it
  is a read-through of the binding.

### The pane header

`Md3PaneHeader` shows the destination's glyph and title, the repository and
branch breadcrumbs, the fetch and push controls, the progress bar, and the pane
menu button. Two contract predicates decide what appears:

- `md3ShowBreadcrumbs` — repository and branch appear on the four
  repository-scoped destinations: History, Changes, Branches, Actions.
- `md3ShowSync` — fetch and push appear on History, Changes and Branches only.
  Actions is deliberately excluded: a workflow run has nothing to push.

Progress is `number | null`. `null` removes the bar entirely rather than
rendering an empty track, and `progressLabel` names the operation — "Fetching
origin", "Pushing 3 commits" — because that label is what a screen reader
announces when the bar appears. Reported percentages are clamped into the
track.

### The eleven search fields

`Md3SearchFieldKeys` names them: `global`, `history`, `changes`, `branches`,
`actions`, `logs`, `inbox`, `terminal`, `agents`, `repositories`, `diffSearch`.
The list is written out by hand rather than derived from the state object,
because a derived list validates whichever fields happened to survive and says
nothing about one that went missing.

Each field is genuinely independent: its own value, its own `regexEnabled`, and
its own regex-builder target. `md3SearchBinding(state, dispatch, field)` returns
one field's six props in the exact shape the views ask for —
`IMd3ActionsSearch` and `IMd3TerminalSearch` are structurally this — so a host
binds a view's search by spreading rather than writing six closures per field.

### The menu system

`getMenuSpec(kind, context, handlers)` builds any of the 23 menu kinds:
`palette`, `settings`, `account`, `repoMenu`, `branchMenu`, `paneMenu`,
`listMenu`, `diffOptions`, `fileMenu`, `rowMenu`, `changesMenu`,
`changeRowMenu`, `branchRowMenu`, `runMenu`, `repoRowMenu`, `compose`,
`agentAccess`, `inboxRowMenu`, `agentRowMenu`, `terminalMenu`, `drawerMenu`,
`searchMenu` and `guide`.

`Md3MenuOverlay` renders one: a scrim, a panel with the menu's glyph, title and
close button, a filter row carrying the `.*` regex toggle and the anchored
builder launcher, and a scrolling list of actions. Filtering is a
case-insensitive substring match by default and a case-insensitive regular
expression when regex mode is on. **An uncompilable pattern leaves the list
whole** rather than emptying it while somebody is halfway through typing `(foo`,
and the field additionally says why nothing is being filtered.

The shell wraps two things around every spec:

- `menuExtensions` appends a host's own items after the contract's. A host can
  add to a menu; it can never subtract from one.
- Every item closes the menu after it runs — unless it opened another overlay,
  which the shell checks for rather than closing a menu out from under the item
  whose whole job was to open it.

Four of the eight menu handlers are overridden by the shell, because they are
shell state a host cannot reach: `onNavigate`, `onToggle('drawer')`,
`onOpenMenu` and `onOpenRegexBuilder`. The host's handler still runs after,
so it can record, notify or act on the same event.

### The regex builder, everywhere

`Md3RegexBuilderDialog` opens from every search field and from every menu's own
filter row. It offers the four contract token groups verbatim — anchors
(`^`, `$`, `\b`), classes (`\w`, `\d`, `\s`, `[a-z]`, `[^x]`, `.`),
quantifiers (`+`, `*`, `?`, `{2,4}`) and groups (`(…)`, `(?:…)`, `a|b`,
`(?=…)`, `(?<=…)`) — a raw pattern editor, the six flags, sample text, and a
live result in three states: idle, matched, failed.

This is a *presentation* of the builder the application already has, not a
second one. Every pattern compiles through `compileSafeRegex`, the vetted RE2
adapter in `lib/safe-regex.ts`, which is linear-time by construction. The
contract evaluated with `new RegExp`, which is exactly the native engine this
repository forbids for user-authored patterns, so the six flags are mapped onto
RE2 instead: `i` is RE2's own case-insensitivity, `m` and `s` become the
zero-width inline groups `(?m)` and `(?s)`, `y` is applied as JavaScript's
match-at-`lastIndex` rule, `g` is ignored by the tester because it never
changes *whether* a string matches (it is still carried into the applied
`/pattern/flags` string), and `u` is a no-op because RE2 is unconditionally
Unicode-aware.

Two of the contract's tokens describe constructs RE2 does not implement:
`(?=…)` lookahead and `(?<=…)` lookbehind. They ship exactly as the contract
lists them, and inserting one produces an honest `Invalid pattern: …` from the
live tester rather than a silently missing button.

Where a built pattern goes is the part that has to be exactly right.
`Md3BuilderTarget` is either `{kind:'search', field}` or `{kind:'menu', menu}`,
and applying a pattern:

- writes it into **that** field, and arms **that** field's regex mode. Writing
  the pattern without arming the mode would search for the pattern's literal
  characters, which is the one failure this write-back exists to prevent.
- or, for a menu, re-opens **that** menu with the pattern seeded and its regex
  mode on, so the user does not retype what they just built.

The dialog is keyed per target, so one builder's pattern, flags and test string
cannot bleed into the next.

### The compose dialog

`Md3ComposeDialog` is the commit composer: summary, description, the included
and total file counts, the branch it will land on, and the commit and
commit-and-push actions. The shell owns whether it is open and supplies
`onDismissed`; everything else is the host's `compose` prop, which in the
application reads and writes the real `changesState.commitMessage` through
`setCommitMessage` and commits through `commitIncludedChanges` or
`oneClickCommitAndPush`.

### The toast

`Md3ToastHost` is always mounted. `notify(message, options)` raises one —
`info`, `success`, `warning` or `error` — and `dismissToast(id)` removes it. The
default duration is 3000ms. These are the shell's non-blocking notifications;
a modal is reserved for a decision the user must make before continuing.

## Legacy chrome

This is a deliberate product decision, not a transitional state.

### The repository tab strip

The existing `RepositoryTabStrip` is rendered unchanged, between the header and
the shell body, and is shown whenever `showRepositoryTabStrip` is not `false`.
Multi-repository tabs are a real feature of this fork; the design contract
prototypes one repository, which is a limit of the prototype rather than a
decision about the product.

### "Show the classic toolbar"

| Aspect | Behavior |
| --- | --- |
| Default | On (`ShowClassicToolbarDefault = true`) |
| Storage | `show-classic-toolbar` in local storage, via the shared `getBoolean`/`setBoolean` helpers |
| Where | **Settings → Appearance**, beside the dialog-emoji row |
| Live | `ShowClassicToolbarChangedEvent` on `window`; the shell updates without a restart |
| Provenance | Stated beside the control, naming the real value |

The MD3 shell moves the repository, worktree, branch, sync and build-run
controls into the pane header and the pane menu. The band that carried them is
kept rather than retired, and the setting ships enabled: a user who has learned
where those controls are does not have to relearn them because the chrome
around them changed.

**Turning it off loses nothing**, and that is the condition this setting is
allowed to exist under. Every action the band offered is also on the pane
header's fetch and push controls or in the pane menu. A toggle that hid the
only route to a capability would be a feature removal wearing a checkbox.

`app/src/lib/classic-toolbar.ts` owns the preference. It uses the same
local-storage boolean store every other UI preference uses — not a second store
— and `getShowClassicToolbarProvenance()` reports whether the live value is a
recorded choice (`'stored'`) or the compiled-in fallback (`'default'`), which
the settings row states in words rather than printing the opaque label
"default".

### The forty-four carried-over capabilities

The eight destination views are faithful to the contract, and the contract is a
prototype of one repository with one of everything. The surfaces this fork
already shipped carry more: a compare-to-branch picker, an unreachable-commits
dialog, four Actions manager tabs, the full native file context menu, eleven
further branch row actions, the repository list menu, the new-agent-session
form. A rewrite that simply followed the contract would drop every one of them.

`app/src/ui/md3/md3-shell-carryover.ts` enumerates all forty-four **by hand**,
each with the menu kind it now lives in, its icon, its localized label and
whether it is destructive. A catalogue derived from whatever a host happened to
wire would validate the entries that were there and say nothing about the ones
that had gone.

| Destination | Lands in |
| --- | --- |
| History: compare-to-branch | `listMenu` |
| History: unreachable commits | `rowMenu` |
| Actions: workflow manager, workflow catalog, cache manager, self-hosted runner manager, refresh, run count, pane divider | `paneMenu` |
| Actions: jump to attempt, log match navigation, log group collapse | `runMenu` |
| Changes: discard, permanently discard, stash, ignore folder, copy relative path, copy selected paths, open with default program, Cheap LFS pin, include/exclude selected files | `changeRowMenu` |
| Changes: discard all, permanently discard all, stash all | `changesMenu` |
| Branches: merge and delete, compare, copy name, pin, hide, solo, restore visibility, checkout in new worktree, switch to worktree, view on forge, view pull request on forge | `branchRowMenu` |
| Branches: sort by name, sort by recent, show pull requests, fetch remote branches, restore all, bulk delete | `listMenu` |
| Repositories: repository list context menu | `repoRowMenu` |
| Agents: new session | `paneMenu` |

`buildMd3CarryOverExtensions(handlers, hints)` turns supplied handlers into the
shell's `menuExtensions`. A command with **no** handler produces no item at all
rather than a row that does nothing, and `md3UnplacedCarryOverCommands(handlers)`
names those omissions so a host or a test can fail on a gap instead of
discovering it in use.

Seven items are flagged destructive — discard, permanently discard, discard
all, permanently discard all, merge-and-delete and bulk delete among them — so
a host routes them through the shared
[destructive-action gate](destructive-action-gate.md) rather than deciding per
call site.

## Configuration

The shell is controllable or self-owning. Supply `state` **and** `onStateChange`
to own the state — which a host must do to build the destination views' search
props from the same eleven fields — or supply neither and let the shell keep
its own, seeded by `initialState`.

`createMd3ShellState(overrides?)` builds a fresh state.
`md3ShellReducer(state, action)` is pure: every `Md3ShellAction` produces a new
state and touches nothing else, so a test can replay a sequence and assert the
result without rendering anything.

```ts
const [state, setState] = React.useState(createMd3ShellState())
const next = md3ShellReducer(state, {
  type: 'open-builder',
  target: { kind: 'search', field: 'history' },
})
```

The actions are `select-destination`, `toggle-drawer`, `set-drawer`,
`set-search`, `clear-search`, `toggle-search-regex`, `set-search-regex`,
`open-menu`, `open-builder`, `apply-builder`, `open-compose`, `close-overlay`
and `set-progress`.

### Styling

Layout lives in `app/styles/ui/_md3-shell-layout.scss`; everything shared with
the views is in `_md3-shell.scss` and the per-component partials. Three
constraints the contract could not simply be copied into:

- **Keyframes.** The contract animates with `dmUp` and `dmSheet`. So does this
  application, with different geometry, in forty existing partials. Redefining
  them would have retimed every one of those surfaces and nothing would have
  failed, so the contract's four are namespaced and reached through
  `.md3-anim-*` classes.
- **Theme selectors.** The contract themes with `[data-theme]`; this
  application uses `:root` and `body.theme-dark`. Copying the selector verbatim
  would have produced a stylesheet that is correct, compiles, and applies to
  nothing.
- **Hints.** The contract hangs its hints on `title` attributes, which the
  accessibility lint bans outright and which screen readers treat
  inconsistently. Those became real tooltips, and every icon-only control got
  an accessible name — including the six regex-builder buttons, which are
  otherwise six identical "Regex builder" announcements on one screen with no
  way to tell which field each belongs to.

### Languages and tone

Every string the shell renders comes from `app/src/lib/i18n-resources.ts` under
the `md3.` namespace, so all three language modes and both funny-level sliders
reach it like any other copy. Facts stay exact at every level: the destination
name, the branch, the ahead count, the progress label and the regex pattern are
never restyled into ambiguity.

New keys are namespaced `md3.<surface>.<thing>` deliberately. A key that
collides with an existing surface silently renders the **other** surface's
words and nothing fails, so a collision check is part of adding one.

## Failure modes

| Situation | Behavior |
| --- | --- |
| No repository selected | The pane header renders with empty repository and branch names; fetch and push do nothing rather than throwing |
| Destination id not recognized | `isDestinationId` rejects it and no navigation happens |
| A view is `null` | `renderLegacyDestination` supplies the real existing surface |
| Regex pattern will not compile | The menu list stays whole and the field says why |
| Progress reported as `NaN` or out of range | Clamped to 0–100; `null` removes the bar |
| `apply-builder` with no builder open | The reducer returns the state unchanged |
| Local storage unavailable | The classic toolbar falls back to its shipped default and reports provenance `'default'` |
| A carried-over command has no handler | No menu row is rendered, and `md3UnplacedCarryOverCommands` names it |

## Security considerations

The shell holds no credentials, opens no network connection and reads no file.
Regex evaluation in the builder runs through the renderer-safe RE2 evaluator
rather than a raw `RegExp` on user input, so a catastrophically backtracking
pattern cannot hang the renderer. Menu filtering does use `new RegExp` on the
filter text, but only against the menu's own short in-memory labels, and an
uncompilable pattern is caught and reported rather than thrown.

The classic-toolbar preference is a single boolean in local storage. It touches
no path, token or user content, and no value derived from it ever reaches a
command line.

## Verification

- `app/test/unit/md3-contract-conformance-test.ts` walks
  `design/History MD3.dc.html` and demands the implementation carry what it
  finds: all eight destinations in order with their glyphs, all 23 menu kinds
  with the contract's icon and panel width, every menu item label the design
  lists, a filter row and unique ids on every menu, the regex builder's four
  token groups verbatim, and every ligature resolved against the bundled font.
  The direction is the point — a test shaped "every menu the code defines is
  well-formed" passes with a clean conscience on a build missing eleven menus.
- `app/test/unit/feature-ledger-test.ts` runs from the frozen baseline at the
  tree and fails naming anything that went missing. A capability may move; it
  may only disappear by being listed as retired with a reason.
- `app/test/unit/md3-*-view-test.ts` cover the eight destination views.
- Typecheck, ESLint and Prettier are clean across the shell, and the layout
  partial is imported from `app/styles/_ui.scss` immediately after
  `ui/md3-shell`.

### Known gap

The forty-four carried-over capabilities are catalogued and their menus are
decided, but no handler is wired from `app.tsx` yet, so
`buildMd3CarryOverExtensions` is not called and none of them renders in a menu
today. That is not a capability loss: `views` is `md3NoViews`, so every
destination renders the real repository workspace and build runner, and the
classic toolbar and repository tab strip are both on by default — every one of
those capabilities is reachable exactly where it always was. They become
unreachable only when a destination's MD3 view replaces the legacy surface,
which is why the catalogue is a required-shape module rather than prose: the
change that wires a view supplies that view's handlers, and
`md3UnplacedCarryOverCommands` fails loudly on anything still missing.

Two entries additionally need a decision nobody has made: log match navigation
and log group collapse. The contract filters the log rather than dimming it,
which may supersede match-stepping. Both are catalogued into `runMenu` so they
survive; if the Actions view concludes the filter genuinely replaces
match-stepping, that needs a `retired` record in the ledger with that reason.
Neither has been retired.

## Suggested articles

- [Destructive-action super confirmation](destructive-action-gate.md) — the
  gate the shell's destructive carry-over items route through.
- [Command palette: full-app coverage](command-palette-full-coverage.md) — the
  palette the header's chip opens.
- [Offline documentation browser](offline-documentation-browser.md) — the
  in-app article browser reachable from the shell.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — the two
  sliders that style the shell's copy.
- [Show emojis in dialogs and message boxes](dialog-emoji-decoration.md) — the
  Appearance row the classic-toolbar switch sits beside.
- [The regex builder](../../regex-guide.md) — the shared engine, dialect and
  escaping rules behind every builder in the shell.

---

# Material Design 3 外殼

成個應用程式嘅框架，照住 `design/History MD3.dc.html` 重寫，砌成一個組件。
`Md3Shell`（`app/src/ui/md3/md3-shell.tsx`）就係 `App.renderApp()` render 嗰嚿嘢：
56px 頂部列、儲存庫分頁列、側邊導航加一個 16px `surface-container-low` 內容窗、
內容標題列、目前嘅目的地，再加四個「一次淨係開一個」嘅浮層。

個外殼自己乜都唔讀：唔 import dispatcher，亦都唔 import app store。佢 render 嘅每
一個值、做得到嘅每一個動作，全部由 prop 入嚟 — 所以同一段程式碼，`app.tsx` 同一個
完全冇應用程式喺後面嘅截圖工具都用得。

**舊嘅框架一樣都冇拆。** 儲存庫分頁列照留、預設照顯示，因為多儲存庫分頁係呢個 fork
真有嘅功能，個設計原型淨係畫咗一個儲存庫，係原型嘅限制，唔係對產品嘅決定。經典工具
列都照留，收喺一個會記住、而且預設係開嘅設定後面。

## 行為

| 項目 | 行為 |
| --- | --- |
| 目的地 | 八個：Changes、History、Branches、Actions、Inbox、Terminal、Agents、Repositories |
| 開頭狀態 | History、側邊導航展開、冇浮層、冇進度 |
| 搜尋欄 | 十一個，每個有自己嘅字**同埋**自己嘅 regex 掣 |
| 浮層 | 選單、regex builder、撰寫對話框 — 一次一個 |
| 選單種類 | 23 種，每種都篩得，每種都有 regex builder |
| Toast | `Md3ToastHost` 長開 |
| 狀態 | 一個匯出嘅形狀，一個匯出嘅純 reducer |
| 網絡 | 冇。外殼本身唔做任何 I/O |

八個目的地各自 render 自己嘅 MD3 檢視，或者當嗰格係 `null` 就 render
`renderLegacyDestination`。嗰個唔係佔位符 — 係應用程式本身真嘅儲存庫工作區同 build
runner，包喺 MD3 框架入面，就係佢令到八個檢視逐個接嘅時候，冇一樣功能揾唔返。

十一個搜尋欄各有各嘅字同各有各嘅 regex 掣。喺邊個欄開 builder，套用個 pattern 就只
寫返嗰個欄、只開嗰個欄嘅 regex：淨係寫字唔開掣，就會變成搵嗰堆符號本身，而呢個正正
係佢要防嘅嘢。選單嗰邊就會連個 pattern 一齊開返嗰個選單，唔使人手抄多次。

## 舊框架

「顯示經典工具列」喺**設定 → 外觀**，預設係開，存喺 local storage 嘅
`show-classic-toolbar`，改完會即刻生效（唔使重開）。閂咗都唔會少咗嘢：嗰條列上面每
一個動作，內容標題列或者選單都做得到 — 一個會收埋唯一入口嘅開關，其實就係扮成
checkbox 嘅功能刪除。開關側邊嗰句會照直講清楚而家個值係喺呢部電腦記錄過，定係用緊
出廠設定，而且會講返真正嘅值。

設計冇畫過、但係呢個 fork 本身有嘅四十四樣功能，逐樣手寫喺
`app/src/ui/md3/md3-shell-carryover.ts`，寫明將來住邊個選單、用邊個圖示、叫咩名、
係咪破壞性。冇 handler 嘅命令唔會 render 出一行做唔到嘢嘅嘢，而係由
`md3UnplacedCarryOverCommands` 點名，等人或者測試可以直接紅，唔使等用家撳落去先發現。

## 設定

外殼可以受控（同時畀 `state` 同 `onStateChange`）或者自己揸自己嘅狀態。
`md3ShellReducer` 係純函數，所以測試可以直接播一連串動作再對答案，唔使 render 任何
嘢。

樣式方面有三個唔可以照抄嘅位：合約用 `dmUp` / `dmSheet` 呢兩個 keyframe，呢度四十
個 partial 都用緊同名但唔同幾何嘅版本，照抄會靜靜雞改晒全部；合約用 `[data-theme]`
分主題，呢度係 `:root` 同 `body.theme-dark`，照抄會得出一份完全正確、行得通、但係
邊度都唔生效嘅樣式；合約用 `title` 屬性做提示，而 `title` 係被 lint 禁咗嘅，所以全
部改成真 tooltip，每粒淨圖示嘅掣都有自己嘅無障礙名。

所有文字都喺 `md3.` 開頭嘅 i18n key 入面，三種語言模式同兩支搞笑程度滑桿照樣覆蓋到；
但係目的地名、分支、領先數目、進度說明同 regex pattern 呢啲事實，任何等級都唔會被
語氣改到含糊。新 key 一定要 `md3.<surface>.<thing>` 咁改名 — key 撞名嘅話會靜靜雞
render 咗另一個畫面嘅字出嚟，而且一滴紅都冇。

## 失敗情況

冇揀儲存庫：標題列 render 空白名，fetch／push 咩都唔做而唔係拋錯。認唔到嘅目的地
id：直接唔navigate。Regex 砌唔成：個清單保持完整，同時講返點解冇篩到。進度值超範圍
或者 `NaN`：夾返落 0–100，`null` 就直接冇咗條進度條。冇 local storage：經典工具列
用返出廠值，來源報 `'default'`。

## 保安考量

外殼冇拎住任何憑證、唔開網絡、唔讀檔案。Builder 嘅 regex 係行 RE2 評估器，唔係對用
家輸入直接 `new RegExp`，所以災難性回溯搞唔死 renderer。選單篩選係有用 `new RegExp`，
但淨係對住選單自己嗰啲好短嘅記憶體標籤，而且砌唔成會接住報返，唔會拋出嚟。

## 驗證

`app/test/unit/md3-contract-conformance-test.ts` 由設計檔行落去質問實作，
`app/test/unit/feature-ledger-test.ts` 由凍結咗嘅盤數質問棵樹 — 兩邊都係由清單指住
程式碼，唔係掉轉頭問「你有嘅嘢啱唔啱格式」，因為後者連乜都冇都會照過。八個檢視各自
有自己嘅測試。Typecheck、ESLint、Prettier 全部乾淨。

### 已知未做

四十四樣接手功能已經編好目錄同揀好選單，但係 `app.tsx` 一個 handler 都未接，所以今
日一個都唔會喺選單度出現。呢個唔係少咗功能：`views` 係 `md3NoViews`，即係每個目的地
都仲係 render 緊真嘅儲存庫工作區同 build runner，經典工具列同儲存庫分頁列亦都預設開
住 — 每一樣都仲喺原本嗰個位。要到某個目的地嘅 MD3 檢視真係取代咗舊畫面，先至會唔見；
所以份目錄係一個有形狀要求嘅模組而唔係一段文字。另外「log 前／後一個符合」同
「log 群組摺埋」兩樣需要一個仲未有人做嘅決定，兩樣都收咗喺 `runMenu` 度保住，一樣都
冇退役。
