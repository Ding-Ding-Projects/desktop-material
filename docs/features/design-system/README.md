# Design-system features / 設計系統功能

- [Attention accommodations](attention-accommodations.md) — five independent,
  off-by-default focus, low-stimulation, time-awareness, one-thing-at-a-time,
  and momentum modes with local persistence, accessible controls, and honest
  runtime status.

- [The Material Design 3 shell](md3-shell.md) — the application chrome rewritten
  against `design/History MD3.dc.html`: eight destinations behind a navigation
  drawer, the 56px application header, the pane header with its breadcrumb and
  sync rules, 23 filterable menu kinds, the regex builder reachable from every
  search field and every menu filter, the commit composer, the toast host, and
  the persisted "Show the classic toolbar" setting that keeps the pre-rewrite
  chrome alongside it.
- [Command palette: full-app coverage, rich controls and
  teleport](command-palette-full-coverage.md) — the Ctrl+Shift+P palette as MD3's
  full-screen search view: inline switches/boxes/steppers/selects for
  settings rows, and click/Enter teleporting to the exact control that owns
  each feature (Ctrl+Enter to run instead).
- [Command palette coverage](command-palette-coverage-gaps.md) — the complete
  133-command coverage survey and shipped status, distinguishing live controls,
  teleport-only destinations, deliberate exclusions, and remaining catalog
  prerequisites.
- [Universal-feature completeness inventory](universal-feature-completeness-inventory.md) —
  the hand-written feature-by-surface contract and its independent implementation,
  documentation, localization, persistence, test, built-artifact interaction, and
  capture evidence fields; a registration alone is never treated as proof that a
  feature is implemented or verified.
- [Status Hub projection](status-hub.md) — the existing Agents sidebar's
  main-process-only project/session/evidence projection, authenticated reply
  confirmation, and honest local-only fallback when owner configuration is
  unavailable.
- [Command palette rows and
  appearance](command-palette-appearance.md) — icon/keyword/group rows, the
  compact aligned Customize appearance editor, stable random-per-repository
  layouts, and discoverability entries for otherwise-buried surfaces.
- [Destructive-action super confirmation](destructive-action-gate.md) — the one
  shared two-key gate every destructive or irreversible action runs through:
  independent keys, a full-range authorization slider, a dramatic progress
  treatment and a distinct completion treatment, an always-present emergency
  exit, an anchored panel that falls back to a modal rather than covering its
  own trigger, and a hand-written registry of the actions that must be gated.
- [Material ripple and theme reveal](material-ripple-and-theme-reveal.md) —
  shared interaction feedback and bounded animated theme transitions.
- [Dialog wheel and trackpad scrolling](dialog-wheel-scrolling.md) — route
  pointer scrolling from any descendant to the nearest usable dialog scroll
  owner while preserving nested controls and stacked-panel behavior.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — independent
  English and Cantonese 1..5 sliders on Settings → Appearance beside the
  language mode, wired to every category of copy (not just the narrator), with
  a live preview, the voice-not-facts rule, and searchable level names.
- [Show emojis in dialogs and message boxes](dialog-emoji-decoration.md) — a
  persisted Appearance switch that puts one decorative, `aria-hidden` emoji
  beside every dialog title, chosen from a shared kind-to-glyph catalog, with
  byte-identical accessible names and factual copy in both states and no emoji
  in any button, action label, or field label.
- [Personal vocabulary](personal-vocabulary.md) — a local JSON file, loaded from
  Settings → Appearance, that renames the words the app shows you; nothing ships
  with it, the whole byte payload is validated before a single word is applied,
  a refused file changes nothing even partially, and no term ever reaches an
  export, a log, a capture or the network.
- [Narrator voice](narrator-voice.md) — per-language voice, rate and pitch for
  the spoken narrator, enumerated from the platform at runtime with an explicit
  automatic default, the stable voice identity persisted rather than the
  localized display name, and honest status for a voice that is missing,
  network-backed, or absent entirely.
- [School mode](school-mode.md) — a persisted, user-renamable English-only
  presentation lock with local credential unlock, hidden language/playfulness
  surfaces, dim-sum suppression, and explicit reset semantics.
- [Surface locks](surface-locks.md) — an opt-in, for-fun password or one-time-password
  speed bump on a tab, a tab group or any appearance value, with one independent
  credential per lock, an anchored non-modal unlock prompt, user-chosen unlock
  duration, an enumerable searchable lock manager with bulk removal and export,
  honest labelling in every search, and folder-deletion recovery.
- [Unlock ladder](unlock-ladder.md) — a bounded wait-recovery ladder mounted in
  the real lock prompt after throttled credential attempts; it clears only the
  retry deadline, preserves the failure count, and never authenticates.
- [Audio system](audio-system.md) — optional, off-by-default spoken narrator,
  synthesized sound effects, and per-repository music, with rate-limiting,
  quiet hours, reduced-sound, screen-reader coexistence, and funny-level tone.
- [Recorded narration + melody assets](narration-assets.md) — plays the
  pre-generated per-event voice clips (English/Cantonese/bilingual, serialized
  in one non-overlapping queue) and melody cues in place of live speech and
  synthesized effects, with automatic fallback and a persisted toggle.
- [Distinct sound-effect event mapping](sfx-event-mapping.md) — pure event →
  category → motif mapping that gives push/fetch/pull and every Build & Run
  phase their own cue in four motif families, with per-category cooldowns and a
  per-cue audition grid in Settings → Sound.
- [The dim sum surprise](dim-sum-surprise.md) — one launch in ten shows a
  bundled photograph of a Hong Kong dim sum dish, named in both languages, as a
  self-clearing corner card that never gates startup, never takes focus, and
  has no off switch.
- [Repository-themed music](repository-theme-music.md) — a deterministic,
  synthesized looping theme per repository (no bundled files) seeded from its
  identity, with per-repo custom-track/mute overrides persisted in a Git-backed
  dedicated setting and a one-time migration from localStorage.
- [Offline documentation browser](offline-documentation-browser.md) — every
  feature article bundled into the build and browsable inside the app: a
  category-filtered list, a search field over titles and body text with the
  shared regex builder attached, rendering through the app's one sandboxed
  Markdown renderer, article-to-article links that resolve in place, and a
  completeness guard that fails the build when an article on disk is missing
  from the bundle.
- [The Material Design 3 site](material-design-3-site.md) — the published site
  as one Design Component: six pages in a browser-style tab strip, React and
  four content-subsetted font families vendored so nothing loads from another
  host, real URLs for a single-page site, and the contract test that proves it
  all shipped.

- [Material Design 3 外殼](md3-shell.md) — 照住 `design/History MD3.dc.html`
  重寫嘅應用程式框架：側邊導航加八個目的地、56px 頂部列、有麵包屑同同步規則嘅內容
  標題列、23 種可篩選單、每個搜尋欄同每個選單篩選列都開得到嘅 regex builder、commit
  撰寫框、toast，同埋一個會記住嘅「顯示經典工具列」設定，令重寫之前嗰套框架照樣留低。
- [命令面板：全 app 覆蓋、豐富控制項同傳送](command-palette-full-coverage.md) — Ctrl+Shift+P 面板就係 MD3 嘅全螢幕搜尋檢視：設定行有行內開關／方框／步進器／選擇器，撳一下或者 Enter 就傳送到擁有該功能嘅確切控制項（Ctrl+Enter 改為直接執行）。
- [命令面板覆蓋率](command-palette-coverage-gaps.md) — 完整 133 個命令嘅覆蓋調查同出貨狀態，分清楚即時控制項、淨係傳送嘅目的地、刻意排除，同仲欠嘅目錄前置條件。
- [通用功能完整性清單](universal-feature-completeness-inventory.md) — 逐個功能、逐個介面手寫嘅合約，分開記錄實作、文件、本地化、持久化、測試、已建置程式互動同畫面證據；淨係登記一個功能，唔代表佢已經實作或者驗證。
- [Status Hub 投影](status-hub.md) — 既有 Agents 側欄嘅主程序專用 project／session／evidence 投影、已驗證回覆確認，同埋未有 owner 設定時誠實嘅本機後備狀態。
- [命令面板列同外觀](command-palette-appearance.md) — 圖示／關鍵字／群組列、緊湊對齊嘅「自訂外觀」編輯器、每個儲存庫穩定嘅隨機版面，以及俾原本埋得好深嘅畫面嘅可發現入口。
- [Material 漣漪同主題揭示](material-ripple-and-theme-reveal.md) — 共用嘅互動回饋同有界嘅主題轉場動畫。
- [對話框滾輪同觸控板捲動](dialog-wheel-scrolling.md) — 將任何子元素嘅指標捲動導向最近可用嘅對話框捲動擁有者，同時保留巢狀控制項同堆疊面板行為。
- [語氣：分語言搞笑程度滑桿](tone-funny-level.md) — 喺設定 → 外觀語言模式旁邊，獨立嘅英文同廣東話 1..5 滑桿，接駁到每一類文案（唔淨係旁白），有即時預覽、「改語氣唔改事實」規則同可搜尋嘅等級名。
- [喺對話框同訊息框顯示 emoji](dialog-emoji-decoration.md) — 設定 → 外觀入面一個會記住嘅開關，喺每個對話框標題側邊加一粒裝飾用、`aria-hidden` 嘅 emoji，由共用嘅「種類對應字元」目錄揀；開同閂嘅無障礙名稱同事實文案完全一樣，而按鈕、動作名同欄位標籤永遠唔會有 emoji。
- [個人字典](personal-vocabulary.md) — 一個由設定 → 外觀載入嘅本機 JSON 檔，可以換走個 app 顯示嘅字眼；冇任何預設對應、成個檔案要完全驗證先會用、被拒嘅檔案連一半都唔會套用，而啲字眼永遠唔會出現喺匯出、日誌、截圖或者網絡。
- [旁白把聲](narrator-voice.md) — 分語言嘅旁白聲音、語速同音高，執行時向系統攞返實際裝咗嘅聲音清單，預設係「自動揀」，儲存穩定嘅聲音識別碼而唔係會隨語言變嘅顯示名，而且會老實講明把聲係咪唔見咗、要上網先用到、定係根本一把都冇。
- [School mode](school-mode.md) — 一個持久化、用戶改得名嘅純英文呈現鎖，配本機憑證解鎖、收埋語言／玩味介面、抑制點心彩蛋同明確嘅重設語意。
- [版面鎖](surface-locks.md) — 自願開啟、純粹好玩嘅密碼／一次性密碼路障，可以落喺分頁、分頁群組或者任何外觀數值上面；每把鎖有自己獨立嘅憑證、貼住控制項嘅非模態解鎖提示、用戶自己揀解鎖時效、可列舉可搜尋兼支援批量刪除同匯出嘅鎖管理器、喺各搜尋度照樣誠實標示，同埋刪資料夾就重設嘅退路。
- [解鎖梯](unlock-ladder.md) — 真正鎖定提示入面、憑證嘗試被節流時先出現嘅有界等待恢復梯；淨係清重試期限，保留失敗次數，永遠唔會當登入成功。
- [音效系統](audio-system.md) — 可選、預設關閉嘅語音旁白、合成音效同逐儲存庫音樂，配速率限制、安靜時段、減少聲音、同螢幕閱讀器共存同搞笑程度語氣。
- [錄製旁白 + 旋律資產](narration-assets.md) — 播放預先產生嘅逐事件語音片段（英文／廣東話／雙語，喺一條唔重疊嘅佇列串行播放）同旋律提示，取代即時語音同合成音效，有自動後備同持久化開關。
- [獨立音效事件對應](sfx-event-mapping.md) — 純粹嘅事件 → 類別 → 動機對應，令 push／fetch／pull 同每一個 Build & Run 階段喺四個動機家族入面各有自己嘅提示音，配逐類別冷卻時間同設定 → 聲音入面嘅逐提示試聽格。
- [點心彩蛋](dim-sum-surprise.md) — 十次啟動有一次會喺角落顯示一張隨附嘅香港點心相，雙語命名，會自己消失，永遠唔會阻住啟動、唔會搶焦點，亦都冇開關。
- [儲存庫主題音樂](repository-theme-music.md) — 每個儲存庫一段確定性、合成嘅循環主題曲（唔隨附音檔），由佢嘅身分做種子，逐儲存庫嘅自訂曲目／靜音覆寫存喺一個 Git 支援嘅專屬設定，並且由 localStorage 一次性遷移。
- [離線說明書瀏覽器](offline-documentation-browser.md) — 每篇功能文章都入咗 build，喺 app 入面就睇得到：分類篩選清單、搵標題同內文嘅搜尋欄（貼住共用正則建構器）、用 app 唯一嗰個沙箱 Markdown renderer render、文章之間嘅連結直接跳、仲有一個完整性守衛，一有文章喺硬碟度但唔喺 bundle 就 build fail。
- [Material Design 3 網站](material-design-3-site.md) — 已發佈嘅網站本身就係一個 Design Component：瀏覽器式分頁列入面六版、React 同四款按內容裁切嘅字體全部自寄所以唔會由第二個 host 載嘢、單頁網站都有真網址，加埋證明呢一切真係出咗嘅契約測試。

This category has no HTTP API. Postman collections are not applicable.


呢個類別冇 HTTP API，所以唔適用 Postman 集合。
