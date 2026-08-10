# Design-system features / 設計系統功能

- [Command palette: full-app coverage, rich controls and
  teleport](command-palette-full-coverage.md) — the Ctrl+Shift+P palette as MD3's
  full-screen search view: inline switches/boxes/steppers/selects for
  settings rows, and click/Enter teleporting to the exact control that owns
  each feature (Ctrl+Enter to run instead).
- [Command palette coverage](command-palette-coverage-gaps.md) — the complete
  133-command coverage survey and shipped status, distinguishing live controls,
  teleport-only destinations, deliberate exclusions, and remaining catalog
  prerequisites.
- [Command palette rows and
  appearance](command-palette-appearance.md) — icon/keyword/group rows, the
  compact aligned Customize appearance editor, stable random-per-repository
  layouts, and discoverability entries for otherwise-buried surfaces.
- [Material ripple and theme reveal](material-ripple-and-theme-reveal.md) —
  shared interaction feedback and bounded animated theme transitions.
- [Dialog wheel and trackpad scrolling](dialog-wheel-scrolling.md) — route
  pointer scrolling from any descendant to the nearest usable dialog scroll
  owner while preserving nested controls and stacked-panel behavior.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — independent
  English and Cantonese 1..5 sliders on Settings → Appearance beside the
  language mode, wired to every category of copy (not just the narrator), with
  a live preview, the voice-not-facts rule, and searchable level names.
- [School mode](school-mode.md) — a persisted, user-renamable English-only
  presentation lock with local credential unlock, hidden language/playfulness
  surfaces, dim-sum suppression, and explicit reset semantics.
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
- [The Material Design 3 site](material-design-3-site.md) — the published site
  as one Design Component: six pages in a browser-style tab strip, React and
  four content-subsetted font families vendored so nothing loads from another
  host, real URLs for a single-page site, and the contract test that proves it
  all shipped.

- [命令面板：全 app 覆蓋、豐富控制項同傳送](command-palette-full-coverage.md) — Ctrl+Shift+P 面板就係 MD3 嘅全螢幕搜尋檢視：設定行有行內開關／方框／步進器／選擇器，撳一下或者 Enter 就傳送到擁有該功能嘅確切控制項（Ctrl+Enter 改為直接執行）。
- [命令面板覆蓋率](command-palette-coverage-gaps.md) — 完整 133 個命令嘅覆蓋調查同出貨狀態，分清楚即時控制項、淨係傳送嘅目的地、刻意排除，同仲欠嘅目錄前置條件。
- [命令面板列同外觀](command-palette-appearance.md) — 圖示／關鍵字／群組列、緊湊對齊嘅「自訂外觀」編輯器、每個儲存庫穩定嘅隨機版面，以及俾原本埋得好深嘅畫面嘅可發現入口。
- [Material 漣漪同主題揭示](material-ripple-and-theme-reveal.md) — 共用嘅互動回饋同有界嘅主題轉場動畫。
- [對話框滾輪同觸控板捲動](dialog-wheel-scrolling.md) — 將任何子元素嘅指標捲動導向最近可用嘅對話框捲動擁有者，同時保留巢狀控制項同堆疊面板行為。
- [語氣：分語言搞笑程度滑桿](tone-funny-level.md) — 喺設定 → 外觀語言模式旁邊，獨立嘅英文同廣東話 1..5 滑桿，接駁到每一類文案（唔淨係旁白），有即時預覽、「改語氣唔改事實」規則同可搜尋嘅等級名。
- [School mode](school-mode.md) — 一個持久化、用戶改得名嘅純英文呈現鎖，配本機憑證解鎖、收埋語言／玩味介面、抑制點心彩蛋同明確嘅重設語意。
- [音效系統](audio-system.md) — 可選、預設關閉嘅語音旁白、合成音效同逐儲存庫音樂，配速率限制、安靜時段、減少聲音、同螢幕閱讀器共存同搞笑程度語氣。
- [錄製旁白 + 旋律資產](narration-assets.md) — 播放預先產生嘅逐事件語音片段（英文／廣東話／雙語，喺一條唔重疊嘅佇列串行播放）同旋律提示，取代即時語音同合成音效，有自動後備同持久化開關。
- [獨立音效事件對應](sfx-event-mapping.md) — 純粹嘅事件 → 類別 → 動機對應，令 push／fetch／pull 同每一個 Build & Run 階段喺四個動機家族入面各有自己嘅提示音，配逐類別冷卻時間同設定 → 聲音入面嘅逐提示試聽格。
- [點心彩蛋](dim-sum-surprise.md) — 十次啟動有一次會喺角落顯示一張隨附嘅香港點心相，雙語命名，會自己消失，永遠唔會阻住啟動、唔會搶焦點，亦都冇開關。
- [儲存庫主題音樂](repository-theme-music.md) — 每個儲存庫一段確定性、合成嘅循環主題曲（唔隨附音檔），由佢嘅身分做種子，逐儲存庫嘅自訂曲目／靜音覆寫存喺一個 Git 支援嘅專屬設定，並且由 localStorage 一次性遷移。
- [Material Design 3 網站](material-design-3-site.md) — 已發佈嘅網站本身就係一個 Design Component：瀏覽器式分頁列入面六版、React 同四款按內容裁切嘅字體全部自寄所以唔會由第二個 host 載嘢、單頁網站都有真網址，加埋證明呢一切真係出咗嘅契約測試。

This category has no HTTP API. Postman collections are not applicable.


呢個類別冇 HTTP API，所以唔適用 Postman 集合。