# The Material Design 3 shell — removed

This article is a record of something that is **not in the application**. It is
kept so the removal reads as a decision rather than an oversight, and so the
next person who finds a stray reference to `Md3Shell` knows what happened to it.

> **Do not use this as a specification.** The chrome the application renders is
> the chrome that was already chosen, and it is frozen: see "The interface
> shell is frozen — never restyle it unprompted" in
> [AGENTS.md](../../../AGENTS.md). This shell has been built twice without being
> asked for and reverted twice. `app/test/unit/interface-shell-frozen-test.ts`
> is the executable version of that decision, and it fails by name if any of the
> removed modules reappears.

## What it was

Between two commits in August 2026 the application chrome was rewritten against
a design file called `History MD3.dc.html` and assembled as a single `Md3Shell`
component that `App.renderApp()` rendered: an application header, a navigation
drawer, a pane header, eight destinations, and a set of filterable menus and
overlays. It was integrated by `Integrate the Material Design 3 shell`
(07f38872ab).

## What happened to it

`Take the interface back to the chrome that was already chosen` (3abcee9015)
removed it on 2026-08-19, along with the view components, the shell
stylesheets, and the design-parity test that walked the design file. The design
file itself was removed from `design/` by `Update design system` (bd6e7f4f58) on
2026-08-21; `design/Desktop Material v2.dc.html` is the design reference the
project uses now.

None of it is recoverable from the tree — it lives only in history. The removed
modules are listed by name in `app/test/unit/interface-shell-frozen-test.ts`,
which is the authoritative list.

## What survived, and is still real

The Material Design 3 **controls and dialogs** were kept deliberately; only the
shell around them was removed. They are documented in their own articles:

- [Destructive-action super confirmation](destructive-action-gate.md)
- [The regex builder](../../regex-guide.md)
- [Command palette: full-app coverage](command-palette-full-coverage.md)
- [Offline documentation browser](offline-documentation-browser.md)
- [Tone: per-language funny-level sliders](tone-funny-level.md)

`app/test/unit/interface-shell-frozen-test.ts` also asserts that each surviving
control is still present, so an over-applied revert fails just as loudly as a
rebuild.

## What this article no longer describes

Earlier revisions of this article documented a **"Show the classic toolbar"**
setting in Settings → Appearance, backed by a `show-classic-toolbar` local
storage key and a `classic-toolbar` module. That setting was part of the shell
and went with it: no such module, storage key or Appearance row exists. Its
localized strings survive in `app/src/lib/i18n-resources.ts` with nothing
reading them.

It also documented a design-parity conformance test over the removed design
file. That test does not exist.

`app/src/lib/md3-view-preferences.ts` — the six presentation preferences the
shell's menus flipped — is still in the tree but has no consumer, because the
surfaces that read it were the ones removed. It is dead code, not a feature.

---

# Material Design 3 外殼 — 已移除

呢篇係一個**已經唔喺應用程式入面**嘅嘢嘅紀錄。留低佢，係為咗令呢次移除讀落係一個
決定，而唔係一個疏忽；亦都係為咗下一個撞到 `Md3Shell` 殘留引用嘅人知道發生咗咩事。

> **唔好當佢係規格。** 應用程式 render 緊嘅框架，就係早已揀定嗰個，而且係凍結咗嘅：
> 睇 [AGENTS.md](../../../AGENTS.md) 入面 "The interface shell is frozen" 嗰節。
> 呢個外殼冇人叫過就砌咗兩次，亦都 revert 咗兩次。
> `app/test/unit/interface-shell-frozen-test.ts` 就係呢個決定嘅可執行版本，任何一個
> 被移除嘅模組返嚟，佢就會指名報錯。

## 佢曾經係咩

2026 年 8 月，應用程式框架照住一個叫 `History MD3.dc.html` 嘅設計檔重寫，砌成一個
`Md3Shell` 組件俾 `App.renderApp()` render：頂部列、側邊導航、內容標題列、八個目的
地，加一堆可以篩選嘅選單同浮層。由 commit 07f38872ab 整合入去。

## 之後點

Commit 3abcee9015 喺 2026-08-19 將佢連同啲 view 組件、外殼樣式同設計對照測試一齊
移除。設計檔本身喺 2026-08-21 由 commit bd6e7f4f58 從 `design/` 刪走；而家用嘅設計
參考係 `design/Desktop Material v2.dc.html`。

樹入面已經冇得還原，淨係喺 git 歷史入面。被移除嘅模組清單以
`app/test/unit/interface-shell-frozen-test.ts` 為準。

## 咩留低咗

Material Design 3 嘅**控制項同對話框**係特登留低嘅，淨係外殼被移除。佢哋各有自己嘅
文章：破壞性操作確認閘、regex builder、指令板、離線文件瀏覽器、搞笑程度滑桿。同一個
測試亦都會檢查每個留低嘅控制項仲喺度，所以 revert 過咗頭一樣會報錯。

## 呢篇唔再描述嘅嘢

之前嘅版本寫過 Settings → Appearance 有個「顯示經典工具列」設定，用 `show-classic-toolbar`
local storage key。嗰個設定係外殼嘅一部分，一齊被移除咗：冇對應嘅模組、key 或者設定
列。佢嘅翻譯字串仲留喺 `app/src/lib/i18n-resources.ts`，但係冇人讀。

之前亦寫過一個對住已刪除設計檔嘅對照測試。嗰個測試唔存在。

`app/src/lib/md3-view-preferences.ts` 仲喺樹入面，但係讀佢嘅介面已經被移除，所以佢係
死碼，唔係功能。
