# Show emojis in dialogs and message boxes

A persisted, per-profile switch on **Settings → Appearance** that puts one
decorative emoji beside a dialog's title. Turn it off and the same dialog says
exactly the same words with no emoji: nothing is reworded, nothing is removed,
and no control changes what it does.

The decoration is decoration and the implementation treats it as such. It is
hidden from assistive technology, it is rendered outside the element the dialog
is named by, and it never enters a button, an action label, a field label, or
any other control text.

## Behavior

| Aspect | Behavior |
| --- | --- |
| Default | On (`ShowDialogEmojiDefault = true`) |
| Storage | `show-dialog-emoji` in local storage, via the shared `getBoolean`/`setBoolean` helpers |
| Scope | Every dialog and message box the app renders, including the MD3 surfaces |
| Live | A dialog already on screen gains or loses its decoration immediately |
| Accessible name | Byte-identical with the setting on or off |
| Control text | Never decorated, in any state |
| Network | None. The glyphs are literal characters in the source |

### Where a decoration comes from

A dialog asks for *the kind of situation it represents*, never for a glyph:

```tsx
<Dialog id="delete-branch" type="warning" emojiDecoration="destructive" …>
```

`app/src/lib/dialog-emoji.ts` owns the single mapping from
`DialogDecorationKind` to an emoji, so switching the setting off removes every
decoration in the app from one place, and changing which glyph a destructive
confirmation carries is a one-line edit that no call site has to know about.

The kinds are `information`, `question`, `warning`, `error`, `destructive`,
`success`, `progress`, `security`, `account`, `repository`, `branch`, `commit`,
`sync`, `search`, `settings`, `update`, `terminal`, `agent`, `export`, `file`
and `celebration`.

A dialog that names no kind still gets one: `Dialog` derives it from the
existing `type` prop — `error` → error, `warning` → warning, everything else →
information. The contract asks every dialog to carry a decoration, not a
hand-picked few, so the default covers the whole application and an explicit
`emojiDecoration` is only needed where a more relevant kind exists.

### Where the glyph is rendered

`DialogEmoji` (`app/src/ui/lib/dialog-emoji.tsx`) renders

```html
<span class="dialog-emoji" aria-hidden="true" role="presentation">🧨</span>
```

as a **sibling** of the title element, never a child of it. That placement is
the whole safety property. The legacy `DialogHeader` puts it before the `<h1>`
that `aria-labelledby` points at; `Md3ComposeDialog`, `Md3RegexBuilderDialog`
and `Md3DestructiveGate` put it before their own title element for the same
reason. An emoji moved inside the labelled element would become part of what a
screen reader announces while looking completely correct on screen.

When the setting is off, or when no kind is named, the component returns `null`
so the surrounding flex layout collapses rather than reserving an empty slot.

### Staying current while a dialog is open

`useShowDialogEmoji` subscribes to the `desktop-material-dialog-emoji-changed`
window event that `setShowDialogEmoji` raises, and to the cross-window `storage`
event (including the `key === null` clear-everything case). A dialog that is
already open therefore updates in place; no restart and no reopen.

## Configuration

The switch lives on **Settings → Appearance**, in its own
`Dialogs and message boxes` section, and is not hidden by School mode — a
decorative glyph beside a dialog title is not one of the presentation features
that mode suppresses, and hiding the control would leave a user unable to turn
off something they can plainly see.

| Surface | Entry |
| --- | --- |
| Settings | Appearance → Dialogs and message boxes |
| Settings search | `appearance-dialog-emoji` |
| Command palette | `palette:set-dialog-emoji`, rendered as a live switch |
| Teleport target | `settingsDialogEmoji` → `[data-teleport-target="settings-dialog-emoji"]` |

### Explanation and default provenance

The full explanation sits behind progressive disclosure (`<details>`), so the
row stays a row. Under the switch, a provenance line states plainly where the
current value came from and names the real value rather than the word
"default":

- **No choice recorded** — `No choice has been recorded on this computer, so the
  shipped value is in use: shown.`
- **Choice recorded** — `A choice was recorded on this computer: hidden.`

`getShowDialogEmojiProvenance()` distinguishes the two by asking whether the key
exists at all, so a deliberate `false` never reads as an unset default.

### Languages and tone

All three language modes (English, Cantonese, bilingual) carry real copy, and
the explanation is a funny-level family — `dialogEmoji.explanation.plain`,
`.light`, `.playful`, `.maximum` — styled independently per language by the two
playfulness sliders. The label, the boundary note and the provenance line are
single fixed strings in both languages: what the switch is called, where emoji
are forbidden, and whether the value was actually chosen are facts a reader acts
on, not voice.

## Failure modes

| Situation | Behavior |
| --- | --- |
| No local storage (a non-renderer context) | Reads the shipped default; writes are skipped; the change event is still raised where a window exists |
| Unparseable stored value (`"yes please"`) | Falls back to the shipped default rather than guessing |
| Unknown decoration kind at runtime | `resolveDialogDecoration` returns `null`; the dialog renders undecorated |
| A dialog with no `title` | No header is rendered, so no decoration is rendered either |
| The change event never arrives | The value is re-read when the subscription lands, so a change between first render and subscription is not lost |

## Security considerations

- **No secrets.** The setting is one boolean about presentation. No credential,
  token, path, or user content is read or written by anything in this feature.
- **No network.** The glyphs are literal characters in the TypeScript source.
  Nothing is fetched, no font is loaded from another host, and no CDN is
  contacted.
- **Nothing user-controlled reaches the DOM.** The rendered decoration is always
  one of the fixed catalog values keyed by an internal union — it is never
  derived from a stored string, a translation, or anything a user typed.
- **Accessibility is not a bypass surface.** The decoration is `aria-hidden` and
  cannot be used to smuggle text into an accessible name; the test suite asserts
  that byte-for-byte.

## Verification

`app/test/unit/dialog-emoji-test.tsx`, 26 tests:

- **Preference** — the shipped default and its `default` provenance; the
  round-trip through `show-dialog-emoji` and its `stored` provenance; the
  fallback for an unreadable value; `resolveDialogDecoration` returning `null`
  when disabled or unnamed.
- **Catalog** — every kind maps to a single glyph carrying no letters or digits,
  and no decoration glyph appears anywhere in either translation catalog (which
  is how one would end up inside a button label).
- **The boundary** — the same dialog rendered with and without decoration
  produces byte-identical accessible names for every element in the document;
  the decoration is `aria-hidden`; it is never inside the element the dialog is
  labelled or described by; the factual copy is identical in both states; and no
  button, label, legend, summary, option, placeholder or `aria-label` in the
  rendered tree contains any catalog glyph.
- **MD3 surfaces** — the same byte-identity comparison for the compose dialog,
  the regex builder (which renders through a portal, so the scan covers the
  whole document rather than the render container) and the destructive gate.
- **Settings** — the toggle is keyboard-reachable, persists both ways, states
  the correct provenance line before and after a choice, keeps its explanation
  collapsed behind `<details>`, and renders in all three language modes.
- **Localization** — every new key has real Cantonese rather than English in a
  Cantonese slot, bilingual mode contains both, each funny band reads
  differently, and every band still states the button/label/screen-reader
  boundary.
- **Layout** — the stylesheet is registered in the index, the decoration cannot
  shrink or take a pointer, and its size is expressed in `em` so it tracks the
  surrounding title at 100/125/150/200% display scale instead of clipping.

Every guard-shaped assertion above was verified by breaking the thing it guards
and watching the suite go red: the decoration moved inside the labelled `<h1>`,
`aria-hidden` removed, an emoji added to a translated control label,
`pointer-events: none` removed, the `em` size replaced with pixels, the palette
entry renamed, the settings-search entry renamed, English left in a Cantonese
slot, and the provenance check hard-coded to `stored`.

## Suggested articles

- [Tone: per-language funny-level sliders](tone-funny-level.md) — the two
  sliders that style this setting's explanation.
- [School mode](school-mode.md) — what that mode does and does not suppress.
- [Command palette: full-app coverage](command-palette-full-coverage.md) — how
  the live switch and the teleport target work.
- [The dim sum surprise](dim-sum-surprise.md) — the other purely decorative
  surface, and why it has no off switch while this one does.

---

# 喺對話框同訊息框顯示 emoji

**設定 → 外觀**入面一個會記住嘅開關，開咗就會喺對話框標題側邊加一粒裝飾用嘅
emoji。閂咗，同一個對話框會用完全一樣嘅字，只係冇咗粒 emoji：字句唔會改，內容唔會
少，控制項嘅行為亦都完全唔變。

粒 emoji 純粹係裝飾，實作亦都當佢係裝飾：佢對輔助技術隱藏、渲染喺對話框命名元素之
外，亦都唔會入到按鈕、動作名、欄位標籤或者任何控制項文字。

## 行為

| 項目 | 行為 |
| --- | --- |
| 預設 | 開（`ShowDialogEmojiDefault = true`） |
| 儲存 | local storage 嘅 `show-dialog-emoji`，用共用嘅 `getBoolean`／`setBoolean` |
| 範圍 | app 渲染嘅每個對話框同訊息框，包括 MD3 介面 |
| 即時 | 已經開咗嘅對話框會即刻加返或者除返粒 emoji |
| 無障礙名稱 | 開同閂都完全一樣，一個 byte 都唔差 |
| 控制項文字 | 任何狀態下都唔會有 emoji |
| 網絡 | 冇。啲字元直接寫喺原始碼入面 |

一個對話框係要求「呢個係邊種情況」，唔係要求某粒 emoji；由
`app/src/lib/dialog-emoji.ts` 一個地方負責由 `DialogDecorationKind` 對應到 emoji，
所以閂咗個設定就一次過清走全 app 嘅裝飾。冇指明種類嘅對話框亦都有：`Dialog` 會用返
本身嘅 `type` 推導（`error`、`warning`，其餘一律 information）。

`DialogEmoji` 會渲染一個 `aria-hidden` 嘅 `<span class="dialog-emoji">`，而且一定
係標題元素嘅**兄弟節點**，唔會係佢嘅仔。呢個位置就係成個安全性所在：擺入標題入面
睇落完全正常，但螢幕閱讀器會讀埋粒 emoji。

## 設定

開關喺**設定 → 外觀**嘅「對話框同訊息框」一節，School mode 唔會收埋佢。完整說明擺
喺 `<details>` 漸進式披露入面，開關下面嘅來源句會照直講清楚而家個值係喺呢部電腦記
錄過，定係用緊出廠設定，而且會講返真正嘅值，唔會淨係寫「預設」。

三種語言模式都有真正嘅文案，說明本身係搞笑程度家族（`.plain`／`.light`／
`.playful`／`.maximum`），由兩支滑桿各自控制語氣；標籤、界線說明同來源句就係固定
字串，因為嗰啲係用家要照住做嘅事實，唔係語氣。

## 失敗情況

冇 local storage 就用返出廠值；讀唔明嘅值會退返出廠值而唔會亂估；未知種類會渲染成
冇裝飾；冇 `title` 嘅對話框根本冇 header，自然亦冇裝飾。

## 保安考量

呢個功能淨係一個關於顯示嘅布林值：唔會讀寫任何密碼、權杖、路徑或者用戶內容，冇任何
網絡請求，而渲染出嚟嘅 emoji 永遠嚟自固定目錄，唔會由用家輸入嘅字串衍生。

## 驗證

`app/test/unit/dialog-emoji-test.tsx` 一共 26 個測試，涵蓋設定往返同來源、目錄完整
性、無障礙名稱一個 byte 都唔差嘅比對（普通對話框、撰寫對話框、regex 產生器、破壞性
閘門）、設定介面同三種語言、以及版面契約。每一個守衛式斷言都刻意整壞過一次、確認會
變紅，然後先還原。
