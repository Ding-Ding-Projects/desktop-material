# Offline documentation browser

Every feature article in `docs/features` ships inside the application. **Help →
Feature documentation** (or the command palette) opens a browser that lists all
of them, searches their titles *and* their text, renders each one as formatted
prose, and resolves links between articles in place — with no network access of
any kind.

This is deliberately not a link to the documentation site. Documentation that
lives on a website is documentation a user does not have on a train, behind a
corporate proxy, on a machine that has never been online, or at the exact moment
a failing operation makes them want to read it.

## What ships

| Piece | Where |
| ----- | ----- |
| Build-time bundler | `script/generate-docs-browser-bundle.mjs` |
| Generated bundle (all articles) | `app/src/lib/docs-browser/docs-browser-bundle.ts` |
| Generated index (titles only) | `app/src/lib/docs-browser/docs-browser-index.ts` |
| Types and the link origin | `app/src/lib/docs-browser/docs-browser-types.ts` |
| Search, links, export | `app/src/lib/docs-browser/docs-browser-catalog.ts` |
| Command-palette rows | `app/src/lib/docs-browser/docs-browser-palette.ts` |
| The surface | `app/src/ui/docs-browser/docs-browser-dialog.tsx` |
| Styling | `app/styles/ui/_docs-browser.scss` |

Regenerate the bundle with `yarn generate-docs-browser-bundle`.
`yarn generate-docs-hub-catalog` runs both generators in sequence, so one
command refreshes the documentation site's catalog and the in-app bundle
together and neither can be left behind by the other. They are chained in
`package.json` rather than one importing the other: the bundler imports the
hub generator's Markdown parsing helpers, so calling back the other way would
close a module cycle around a top-level `await` and hang.

## Behaviour

**The article list** carries every bundled article, grouped by nothing and
filtered by two controls: a category chip row derived from the real directories
under `docs/features`, and a search field.

**Search** covers article titles, their one-line descriptions, and their full
body text. Plain text is the default and is matched case-insensitively; the
`.*` toggle switches the same field to regular expressions, and the adjacent
builder opens the shared MD3 regex builder anchored to that field. Applying a
pattern from the builder turns regex mode on as well as writing the pattern,
because a pattern applied to a field still reading plain text would search for
the pattern's literal characters. Every pattern compiles through the
repository's RE2 adapter, which is linear-time by construction, so no pattern a
reader can type can freeze the renderer. A pattern that cannot compile is
reported with the compiler's own message rather than silently returning no
results.

**Rendering** goes through the application's one shared Markdown renderer — the
sandboxed iframe that already renders release notes, issue bodies and
pull-request comments. The articles are local and trusted, but using the same
isolated path means sanitisation, link interception and emoji resolution have
one home rather than two.

**Article-to-article links** land on the linked article inside the browser. A
link to a repository path that is *not* a bundled article — a verification
record, an asset, a page outside `docs/features` — says which path it pointed
at. A link to a section of the article already open says which section. An
ordinary web link opens in the user's browser, on their click, and says so. No
click is ever swallowed.

**Selection and bulk actions.** Click opens an article; the check box, or
Ctrl/Cmd+click, toggles selection; Shift+click selects a range. From the
keyboard the list is a listbox: <kbd>↑</kbd>/<kbd>↓</kbd> move,
<kbd>Home</kbd>/<kbd>End</kbd> jump, <kbd>Shift</kbd> with an arrow extends the
selection, <kbd>Space</kbd> toggles one, <kbd>Enter</kbd> opens, and
<kbd>Ctrl</kbd>+<kbd>A</kbd> selects everything currently listed. Select-all is
labelled honestly: it says "all N articles" when nothing is filtered and "all N
matching articles" when something is, so it can never claim a scope it does not
have. Invert and clear sit beside it.

**Export** writes the selection — or, with nothing selected, the article on
screen — as Markdown, plain text or JSON. Markdown is the articles' own
language and round-trips; JSON is the structured form a script can read; plain
text says in its own header that its markup was removed, rather than leaving a
reader to discover the loss. Every format carries the id, title, description,
category, source path and body, so no format silently drops a field. CSV and
TSV are deliberately not offered: an article body is multi-paragraph prose and
a row-and-column format would either mangle it or quote it into something no
spreadsheet renders usefully.

**Bulk delete is not offered, and the surface says why.** The articles are part
of the build and are read-only; there is nothing a user could delete. The
Delete control is present and explains that in a non-blocking notification
rather than being hidden, because a missing control reads as an oversight and a
disabled one with no explanation reads as a defect.

## Configuration

There is nothing to configure. The browser has no settings of its own, so it
adds no settings rows and therefore carries no default-provenance lines; the
appearance, language mode, funny levels and reduced-motion preference it obeys
are the application-wide ones.

Language: the chrome — titles, labels, hints, notifications, category names —
is available in English, playful Hong Kong Cantonese and the bilingual mode,
and the summary and empty-state lines carry the per-language funny-level bands.
Article titles, categories, source paths and the article text itself are the
documentation's own words and read identically at every level in every mode.
Facts never move: the search phrase, the article counts, the file paths and the
link targets are stated exactly in every band.

## Failure modes

| Situation | Behaviour |
| --------- | --------- |
| An article is added and the bundle is not regenerated | The build fails. `app/test/unit/docs-browser-bundle-test.ts` walks `docs/features` on disk and names every article the bundle does not carry. |
| An article is deleted and the bundle is not regenerated | The same test names every bundled article with no file on disk. |
| A title is edited on disk only | The same test compares each article's first heading with its bundled title and names the mismatch. |
| The index and the bundle disagree | The same test compares them row by row — a palette row that opened the wrong page would otherwise be invisible. |
| A link points outside the bundle | A warning notification naming the exact path. |
| A link is not a readable URL | A warning notification quoting it. |
| A regular expression will not compile | The compiler's message, shown above the list; the list is not silently emptied. |
| An export is cancelled | Nothing is written and nothing is claimed. |
| An export fails to write | An error notification carrying the real failure message. |
| Nothing is selected and no article is open | The export says to select at least one article. |

## Security considerations

- **No network.** The bundle contains no image and no relative link. Images in
  the source articles — several of which point at `raw.githubusercontent.com` —
  are replaced at build time with a bracketed note naming the alt text and the
  original source, so rendering an article cannot cause a request. The
  offline-safety test asserts that no image markup survives in any article and
  that every link target in the bundle is absolute.
- **Links are rewritten onto a reserved host.** Every in-repository link
  becomes an absolute URL on `https://docs.desktop-material.invalid`. `.invalid`
  is reserved by RFC 2606 and can never resolve, so a link that somehow escaped
  the renderer's interception would fail closed rather than reach a server. The
  rewrite exists because the shared renderer only reports a clicked link whose
  protocol is http(s); an untouched relative link is cancelled silently and
  reaches nothing at all.
- **Origin matching is exact.** Link resolution compares `URL.origin`, so a
  look-alike host such as `docs.desktop-material.invalid.example.com` resolves
  as an ordinary external link and never as a bundled article.
- **Same isolation as any other Markdown.** Rendering happens inside the
  existing sandboxed iframe with the existing sanitiser; the browser adds no
  new rendering privileges.
- **No credentials, no secrets.** The surface reads bundled documentation and
  writes exports the user chooses a path for. It stores nothing and reads no
  credential store.

## Verification

- `node script/test.mjs app/test/unit/docs-browser-bundle-test.ts` — the
  completeness guard, the offline-safety assertions, the index/bundle
  agreement, the palette-row-per-article check and the rendering-readiness
  checks.
- `node script/test.mjs app/test/unit/docs-browser-test.ts` — search in both
  modes and both case settings, invalid patterns, snippet windowing, link
  resolution for all four outcomes, the three export formats and their file
  names, and the palette event round trip.
- `node script/test.mjs app/test/unit/docs-browser-wiring-test.ts` —
  reachability from the Help menu and the command palette, that a documentation
  row is resolved before the generic palette fallback, the shared-renderer and
  bulk-action obligations, and the localization of every `docsBrowser.*` key in
  both catalogs at every funny level.

The completeness, offline-safety, bulk-action, shared-renderer and localization
guards were each verified by breaking the thing they guard and watching the
test go red before restoring it.

---

# 離線說明書瀏覽器（中文）

`docs/features` 入面每篇功能文章都係跟住個 app 一齊出貨。喺 **Help → Feature
documentation**（或者命令面板）就開到一個瀏覽器，列晒全部文章、搵標題同內文、
將每篇 render 成排好版嘅文字，仲會喺 app 入面直接跳去文章之間嘅連結——完全唔使
上網。

呢個刻意唔係去說明書網站嘅連結。放喺網站嘅說明書，喺火車上、喺公司 proxy
後面、喺一部從來未上過網嘅機、或者啱啱有嘢 fail 到你最想睇說明書嗰刻，就係一份
你冇得睇嘅說明書。

## 行為

清單載住全部內置文章，用兩個控制項篩：由 `docs/features` 真實資料夾生成嘅分類
chip 列，同埋一個搜尋欄。搜尋覆蓋標題、一句描述同成篇內文；預設係唔分大小寫嘅
純文字，`.*` 掣可以轉做正則表達式，旁邊個掣會開共用嘅 MD3 正則建構器（貼住嗰個
欄位）。由建構器套用 pattern 會同時開埋正則模式，唔係嘅話個欄位會照字面搵。所有
pattern 都行 RE2 轉接器，線性時間，唔會拖死 renderer；compile 唔到就照原文報錯，
唔會扮冇結果。

Render 用 app 唯一嗰個共用 Markdown renderer（release notes、issue、PR 留言都係
用佢），所以消毒、連結攔截同 emoji 解析得一個地方，唔會有第二套。

文章之間嘅連結會喺 app 入面跳去嗰篇。如果個連結指去唔係內置文章嘅 repo 路徑，
會講明係邊條路徑；指去而家呢篇某一段，會講明係邊一段；普通網址就用你部瀏覽器
開，同時話你知。冇一次撳落去係石沉大海。

揀選同批次動作：click 開文章，check box 或者 Ctrl/Cmd+click 揀，Shift+click 揀
一段。鍵盤方面成個清單係 listbox：<kbd>↑</kbd>/<kbd>↓</kbd> 行、
<kbd>Home</kbd>/<kbd>End</kbd> 跳、<kbd>Shift</kbd> 加方向鍵擴選、
<kbd>Space</kbd> 揀一篇、<kbd>Enter</kbd> 開、<kbd>Ctrl</kbd>+<kbd>A</kbd>
揀晒而家清單入面全部。「全選」講嘢老實：冇篩就講「全部 N 篇」，有篩就講「夾到嘅
N 篇」，唔會誇大範圍。

匯出可以出 Markdown、純文字或者 JSON，每種都帶齊 id、標題、描述、分類、來源路徑
同內文，唔會靜靜雞漏欄位。純文字會喺自己個 header 寫明去咗 markup。CSV／TSV
刻意冇提供：文章內文係多段落文字，硬塞落行列格式只會搞爛佢。

批次刪除冇提供，而且個介面會直接講點解：呢啲文章係 build 嘅一部分，唯讀，冇嘢
刪得。個「刪除」掣照擺，撳落去用非阻塞通知解釋——收埋個掣好似漏咗嘢，變灰又唔
解釋就好似壞咗。

## 安全同失敗處理

內置文章冇圖、冇相對連結：build 嗰陣所有圖都換成一句講明 alt 同來源嘅註記（有
十張本來指住 `raw.githubusercontent.com`），所以睇文章唔會發出任何 request。
所有 repo 內部連結都改寫去 `https://docs.desktop-material.invalid`；`.invalid`
係 RFC 2606 保留、永遠 resolve 唔到，所以就算有連結走甩咗攔截都係死路一條，唔會
撞到真伺服器。連結解析比對 `URL.origin`，所以扮嘢 host（例如
`docs.desktop-material.invalid.example.com`）只會當普通外部連結。

如果有人加咗文章但冇重新產生 bundle，測試會 fail 並且逐篇講出邊篇唔見咗——重新
產生用 `yarn generate-docs-browser-bundle`。
