/**
 * Desktop Material documentation hub — localization resources.
 *
 * Localization lives here, logic lives in `docs-hub.js`. Nothing in this file
 * touches the DOM.
 *
 * Each language exposes two buckets:
 *
 *   fixed — control labels, accessibility names, security notes, installation
 *           facts and every error message. These never change with the
 *           playfulness slider.
 *   tone  — headings and section blurbs only, as a five-entry array indexed by
 *           the playfulness level (1 = fully serious … 5 = maximum
 *           playfulness).
 *
 * Fallback order for a missing string is: requested language at the requested
 * level → requested language at level 1 → English at level 1.
 */
;(function (global) {
  'use strict'

  var en = {
    id: 'en',
    htmlLang: 'en',
    label: 'English',
    fixed: {
      skipLink: 'Skip to main content',
      brandTitle: 'Desktop Material',
      brandSubtitle: 'Documentation',
      navOverview: 'Overview',
      navInstall: 'Install',
      navSearch: 'Search',
      navFeatures: 'Features',
      navReference: 'Reference',
      navLinks: 'Project links',
      navLabel: 'Documentation sections',

      prefsToggle: 'Display and language settings',
      prefsHeading: 'Display and language',
      prefLang: 'Language mode',
      langEn: 'English',
      langYue: '廣東話',
      langBi: 'Bilingual',
      prefFunEn: 'Playfulness — English',
      prefFunYue: 'Playfulness — 廣東話',
      fun1: '1 · Fully serious',
      fun2: '2 · Restrained',
      fun3: '3 · Balanced',
      fun4: '4 · Cheerful',
      fun5: '5 · Maximum playfulness',
      prefTheme: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      prefNote:
        'The playfulness sliders change the tone of headings and section blurbs only. Installation commands, security notes, accessibility labels and error messages stay plain and accurate at every level.',
      themeToggle: 'Switch theme',

      heroBadge: 'Windows-only · Material Design 3',
      ctaInstall: 'Install on Windows',
      ctaFeatures: 'Browse features',
      ctaSearch: 'Search the docs',
      ctaRepo: 'View the repository',
      fact1: 'Windows x64 installer, MSI and portable ZIP',
      fact2: 'TypeScript · React · Electron · Sass',
      fact3: 'MIT licensed, built on GitHub Desktop',

      installOneLiner: 'Install the published release',
      installOneLinerNote:
        'Run this in Windows PowerShell 5.1 or PowerShell 7. It does not require an administrator shell. The script resolves this repository’s latest release, verifies the published GitHub SHA-256 asset digest and any Authenticode signature, installs for the current user, and removes its temporary download. Current builds are unsigned, which the script reports after digest verification.',
      installSource: 'Build and run from source',
      installSourceNote:
        '-FromSource detects git, Node.js and Yarn, shallow-clones the repository into <Documents>\\desktop-material-source (override with -SourceDirectory), checks out main (override with -SourceRef), runs yarn install and yarn build:prod, then launches the build. -DryRun returns the plan without cloning or building.',
      installLocal: 'From a local checkout of the script',
      installReview:
        'Review any remote script before running it. The installer script is tracked in this repository.',
      copy: 'Copy',
      copyLabel: 'Copy command to the clipboard',
      copied: 'Copied to the clipboard.',
      copyFailed:
        'Could not write to the clipboard. Select the text and copy it manually.',
      linkReleases: 'Latest release downloads',
      linkScript: 'Read install-windows.ps1',
      linkInstallDoc: 'Full installation guide',

      searchHeading: 'Search',
      searchLabel: 'Search the documentation catalog',
      searchPlaceholder: 'Search titles, paths and summaries…',
      searchClear: 'Clear search',
      searchModeGroup: 'Matching mode',
      searchModePlain: 'Plain text',
      searchModeRegex: 'Regular expression',
      searchModeHint:
        'Plain text is the default. Regular-expression matching runs only while you have switched it on.',
      searchBuilderShow: 'Open regex builder',
      searchBuilderHide: 'Close regex builder',
      searchEngine:
        'Patterns run in your browser’s JavaScript RegExp engine (ECMAScript) inside a same-origin isolated worker. The page terminates that worker if it exceeds the hard deadline. Nothing you type is uploaded, stored or sent anywhere.',
      searchFullText:
        'This searches page titles, paths and summaries. To search the full body text of every rendered page instead, use the full-text search.',
      searchFullTextLink: 'Open full-text search',
      searchIdle: 'Type to search the documentation catalog.',
      searchChecking: 'Checking the pattern safely…',
      searchNone: 'No documentation page matches that search.',
      searchResults: 'matching pages',
      searchResult: 'matching page',
      searchAll: 'pages in the catalog',
      resultsLabel: 'Search results',

      builderHeading: 'Regex builder',
      builderIntro:
        'Compose a pattern from building blocks, test it against sample text, and apply it to the search above. The guided controls insert into the pattern editor, which is the single source of truth.',
      bLiterals: 'Literal text',
      bLiteralsHint: 'Inserts the text with every regex metacharacter escaped.',
      bLiteralPlaceholder: 'text to match exactly',
      bInsert: 'Insert',
      bClasses: 'Character classes',
      bClassChars: 'Characters or ranges',
      bClassPlaceholder: 'a-z0-9_',
      bClassNegate: 'Negate the class',
      bAnchors: 'Anchors and boundaries',
      bGroups: 'Groups and lookaround',
      bGroupName: 'Group name',
      bGroupNamePlaceholder: 'name',
      bAlternation: 'Alternation',
      bAltHint: 'Wraps the current selection, or inserts an empty choice.',
      bAltWrap: 'Wrap selection as (a|b)',
      bQuantifiers: 'Quantifiers',
      bQuantMin: 'Minimum',
      bQuantMax: 'Maximum',
      bQuantLazy: 'Lazy (match as little as possible)',
      bPattern: 'Pattern',
      bPatternHint:
        'Edit freely. The guided controls above insert at the cursor.',
      bFlags: 'Flags',
      flagG: 'g — all matches',
      flagI: 'i — ignore case',
      flagM: 'm — ^ and $ match each line',
      flagS: 's — . matches newlines',
      flagU: 'u — Unicode',
      flagY: 'y — sticky',
      bSample: 'Sample text',
      bSampleHint: 'Matching runs as you type, against this text only.',
      bMatches: 'Live matches',
      bNoMatches: 'The pattern is valid and matches nothing in the sample.',
      bEmptyPattern: 'Enter a pattern to see live matches.',
      bMatchAt: 'at',
      bGroup: 'Group',
      bGroupsOmitted: 'more capture groups',
      bCopyPattern: 'Copy pattern',
      bCopyLiteral: 'Copy as /pattern/flags',
      bApply: 'Use in search (switches to regex mode)',
      bApplied: 'The search above now uses this pattern in regex mode.',
      bTakeQuery: 'Take the search text as an escaped literal',
      bTakeQueryEmpty: 'The search box is empty, so there is nothing to take.',
      bReset: 'Reset builder',
      bSynced: 'Search and builder are synchronised while regex mode is on.',
      bNotSynced:
        'Search is in plain-text mode, so it is not synchronised with this pattern.',
      bValid: 'Valid pattern.',
      bChecking: 'Checking the pattern safely…',
      bLimits:
        'Safety limits: patterns are capped at 512 characters and sample text at 20,000 characters. Matching runs in an isolated worker; the page terminates it at the hard deadline and pauses live matching until you edit the pattern.',

      errInvalid: 'Invalid pattern:',
      errPatternLong:
        'Pattern is too long. The limit is 512 characters, which is enough for any documentation search.',
      errSampleLong:
        'Sample text is too long. The limit is 20,000 characters so a slow pattern cannot lock up the page.',
      errWorker:
        'Safe regular-expression matching is unavailable in this browser, so the pattern was not evaluated.',
      errSlowTitle: 'Pattern paused',
      errSlow:
        'That pattern exceeded the evaluation deadline, so its isolated worker was stopped. Simplify it — nested quantifiers such as (a+)+ can take exponential time — then edit the pattern to resume.',
      errNested:
        'Warning: this pattern nests a quantifier inside another quantified group, which can take exponential time on some inputs.',
      errSearchInvalid:
        'The regular expression is not valid, so no results are shown.',
      dismiss: 'Dismiss',
      notifications: 'Notifications',

      featuresCatalogue: 'Categorised feature documentation',
      cFeatCompleteTitle: 'Complete feature list',
      cFeatCompleteBody:
        'Every feature in one bilingual table, each labelled Added, Extended or Inherited against upstream GitHub Desktop.',
      cFeatAgentTitle: 'Agent API',
      cFeatAgentBody:
        'Opt-in REST and MCP automation, authentication, transport boundaries and executable Postman requests.',
      cFeatRepoTitle: 'Repository management',
      cFeatRepoBody:
        'Opening, organising and safely navigating repositories, submodules, stashes, sparse checkouts and Cheap LFS.',
      cFeatIntegrationsTitle: 'Integrations',
      cFeatIntegrationsBody:
        'User-level Git, editor, shell and operating-system connections, including the local Actions runner and Ollama.',
      cFeatIdentityTitle: 'Identity and workspace',
      cFeatIdentityBody:
        'Multiple accounts plus fast repository, tab and branch navigation at workspace scale.',
      cFeatCollabTitle: 'Collaboration',
      cFeatCollabBody:
        'Pull-request review, creation, activity notifications and other provider-backed teamwork.',
      cFeatReviewTitle: 'Review and diff',
      cFeatReviewBody:
        'Changed-file navigation and safe text, structured-data and image inspection.',
      cFeatQualityTitle: 'Quality and reliability',
      cFeatQualityBody:
        'Responsiveness, lifecycle cleanup, hook execution, failure recovery and regression gates.',
      cFeatDesignTitle: 'Design system',
      cFeatDesignBody:
        'Material presentation controls, ripple and theme reveal, audio system and command-palette appearance.',
      cFeatBacklogTitle: 'Demand backlog ledger',
      cFeatBacklogBody:
        'The 30-item GitHub Desktop demand backlog mapped to implemented feature contracts.',

      cRefInstallTitle: 'Installation',
      cRefInstallBody:
        'Windows install paths, asset verification, data directories and log locations.',
      cRefRegexTitle: 'Regex guide',
      cRefRegexBody:
        'How every search bar in the app matches, and how the in-app regex builder composes a pattern.',
      cRefKnownTitle: 'Known issues',
      cRefKnownBody:
        'Current limitations and workarounds recorded against shipped builds.',
      cRefVerifyTitle: 'Verification records',
      cRefVerifyBody:
        'Reproducible local acceptance evidence and links to exact publication receipts.',
      cRefContribTitle: 'Contributing',
      cRefContribBody:
        'Development environment setup, style guide, tooling, linting and troubleshooting.',
      cRefTechTitle: 'Technical notes',
      cRefTechBody:
        'Internals: dialogs, packaging, OAuth, proxies, shell integration and test craft.',
      cRefProcessTitle: 'Process',
      cRefProcessBody:
        'Release planning, issue triage, pull requests, quality process and release notes.',
      cRefPostmanTitle: 'Postman collection',
      cRefPostmanBody:
        'The master collection for the local Agent HTTP API, opened directly from GitHub.',

      linksHeading: 'Project links',
      linkRepo: 'Source repository',
      linkIssues: 'Issues',
      linkDiscussions: 'Discussions',
      linkWiki: 'Wiki',
      linkReleasesPage: 'Releases',
      linkSite: 'Project site',
      linkReadme: 'Documentation index (Markdown)',
      linkProviders: 'Provider setup (Azure DevOps, Bitbucket, GitLab)',
      linkLearn: 'Learn more: unreachable commits',

      footerNote:
        'Desktop Material is an independent Material Design 3 remake of GitHub Desktop. It is not affiliated with or endorsed by GitHub.',
      footerLicense: 'MIT licensed',
    },
    tone: {
      heroTitle: [
        'Desktop Material documentation',
        'The Desktop Material documentation hub',
        'Everything Desktop Material does, written down',
        'The manual for your Material-flavoured Git day',
        'Read this first, then go break absolutely nothing',
      ],
      heroLead: [
        'Desktop Material is a Windows-only Material Design 3 (M3 Expressive) remake of GitHub Desktop. This hub indexes every feature document, reference, verification record and contributor guide in the repository.',
        'Desktop Material rebuilds the GitHub Desktop shell on Material Design 3 and ships on Windows only. Start here for feature documents, references, verification records and contributor guides.',
        'A Windows-only Material Design 3 remake of GitHub Desktop: the same Git workflow, a completely new shell. Every feature, reference and verification record is indexed below.',
        'Take GitHub Desktop, rebuild the shell in Material Design 3, keep every Git command intact, ship it on Windows. Everything that shipped is written down below.',
        'GitHub Desktop went in, the whole shell came out Material Design 3, not one Git command went missing, and it only runs on Windows. Then somebody wrote all of it down. That page is this one.',
      ],
      installTitle: [
        'Install',
        'Install Desktop Material',
        'Get it running',
        'One line and you are in',
        'Paste one line, go make coffee',
      ],
      installLead: [
        'The tracked PowerShell installer resolves the latest release, verifies the published digest, and installs for the current user. A -FromSource run builds from a checkout instead.',
        'One tracked PowerShell script resolves the latest release, verifies its published digest, and installs for the current user. Pass -FromSource to build from a checkout instead.',
        'One PowerShell line finds the newest release, checks its digest, and installs it just for you. Add -FromSource when you would rather build it yourself.',
        'One PowerShell line does the hunting, the digest check and the install, with no administrator shell in sight. -FromSource builds it from a checkout instead.',
        'One line of PowerShell hunts down the newest release, frisks its digest, and installs it without ever asking for an administrator shell. Prefer to compile it yourself? -FromSource has you covered.',
      ],
      searchTitle: [
        'Search the documentation',
        'Search every documentation page',
        'Find the page you need',
        'Find the page, skip the scrolling',
        'Ask the index — it has read every page so you do not have to',
      ],
      searchLead: [
        'Plain-text search runs over every documentation title, path and summary. Regular-expression matching is available once you enable it.',
        'Plain-text search covers every documentation title, path and summary. Turn on regex mode when you need pattern matching.',
        'Search titles, paths and summaries as plain text, or switch on regex mode and bring a pattern.',
        'Plain text by default. Flip on regex mode when one word will not cut it, and open the builder if the pattern fights back.',
        'Plain text handles the easy jobs, regex mode handles the awkward ones, and the builder is there for when the pattern starts winning.',
      ],
      featuresTitle: [
        'Feature documentation',
        'Feature documentation by category',
        'What the application actually does',
        'Every shipped feature, grouped sensibly',
        'The whole toy box, sorted into drawers',
      ],
      featuresLead: [
        'Feature documents are grouped by the part of the product that owns the behaviour. Each one covers the workflow, persistence boundary, failure modes, security considerations and the checks expected before the feature is described as accepted.',
        'Feature documents are grouped by the part of the product that owns the behaviour, and each covers workflow, persistence, failure modes, security considerations and acceptance checks.',
        'Documents are grouped by whichever part of the product owns the behaviour, and each one covers the workflow, what persists, how it fails, what it guards, and what had to pass.',
        'Grouped by whoever owns the behaviour. Every document says what it does, what it keeps, how it breaks, what it guards, and what had to go green first.',
        'Sorted by whoever is responsible when it misbehaves. Each page owns up to what it does, what it remembers, how it falls over, what it protects, and what had to pass before anyone called it done.',
      ],
      referenceTitle: [
        'Reference and process',
        'Reference, process and receipts',
        'The reference shelf',
        'The rest of the shelf',
        'Everything else worth keeping around',
      ],
      referenceLead: [
        'Installation, search behaviour, known issues, verification evidence, contributor setup, internals and the collections that exercise the local API.',
        'Installation, search behaviour, known issues, verification evidence, contributor setup, internals and the API collections.',
        'How to install it, how search behaves, what is still broken, what was verified, how to build it, and how the internals hold together.',
        'Install it, search it, find out what is still broken, read the receipts, set up a checkout, and poke at the internals.',
        'Install notes, search notes, the honest broken list, the receipts, a contributor runway, and the internals for when curiosity wins.',
      ],
      linksTitle: [
        'Project links',
        'Project and community links',
        'Where the project lives',
        'Where to find the humans',
        'Source, issues, and somewhere to say hello',
      ],
      linksLead: [
        'The repository, its issue tracker, discussions, wiki and published releases.',
        'The repository, its issue tracker, discussions, wiki and published releases.',
        'Source, issues, discussions, wiki and releases — all in one row.',
        'Source, issues, discussions, wiki and releases, all one click away.',
        'Everything one click away: the source, the complaints department, the chat, the wiki and the downloads.',
      ],
    },
  }

  var yue = {
    id: 'yue',
    htmlLang: 'zh-HK',
    label: '廣東話',
    fixed: {
      skipLink: '跳去主要內容',
      brandTitle: 'Desktop Material',
      brandSubtitle: '說明文件',
      navOverview: '概覽',
      navInstall: '安裝',
      navSearch: '搜尋',
      navFeatures: '功能',
      navReference: '參考',
      navLinks: '專案連結',
      navLabel: '文件分區',

      prefsToggle: '顯示同語言設定',
      prefsHeading: '顯示同語言',
      prefLang: '語言模式',
      langEn: 'English',
      langYue: '廣東話',
      langBi: '雙語',
      prefFunEn: '搞笑程度 — English',
      prefFunYue: '搞笑程度 — 廣東話',
      fun1: '1 · 完全認真',
      fun2: '2 · 略為輕鬆',
      fun3: '3 · 中庸',
      fun4: '4 · 幾好玩',
      fun5: '5 · 玩到盡',
      prefTheme: '主題',
      themeSystem: '跟系統',
      themeLight: '淺色',
      themeDark: '深色',
      prefNote:
        '搞笑程度只會改變標題同分區簡介嘅語氣。安裝指令、保安說明、無障礙標籤同錯誤訊息，喺任何程度都保持樸實同準確。',
      themeToggle: '切換主題',

      heroBadge: '只支援 Windows · Material Design 3',
      ctaInstall: '喺 Windows 安裝',
      ctaFeatures: '睇功能文件',
      ctaSearch: '搜尋文件',
      ctaRepo: '睇原始碼倉庫',
      fact1: 'Windows x64 安裝程式、MSI 同免安裝 ZIP',
      fact2: 'TypeScript · React · Electron · Sass',
      fact3: 'MIT 授權，建基於 GitHub Desktop',

      installOneLiner: '安裝已發佈嘅版本',
      installOneLinerNote:
        '喺 Windows PowerShell 5.1 或 PowerShell 7 執行，唔需要管理員視窗。腳本會解析本倉庫最新嘅發佈，核對 GitHub 公佈嘅 SHA-256 資產雜湊值同任何 Authenticode 簽章，以現行使用者身分安裝，然後刪除臨時下載檔。現時嘅組建未簽章，腳本會喺核對雜湊值之後如實報告。',
      installSource: '由原始碼組建並執行',
      installSourceNote:
        '-FromSource 會偵測 git、Node.js 同 Yarn，淺層複製倉庫去 <Documents>\\desktop-material-source（可用 -SourceDirectory 覆寫），簽出 main（可用 -SourceRef 覆寫），執行 yarn install 同 yarn build:prod，然後啟動組建結果。-DryRun 只會回傳計劃，唔會複製或者組建。',
      installLocal: '喺本機簽出嘅腳本執行',
      installReview:
        '執行任何遠端腳本之前請先自行檢視。呢個安裝腳本由本倉庫追蹤。',
      copy: '複製',
      copyLabel: '複製指令去剪貼簿',
      copied: '已複製去剪貼簿。',
      copyFailed: '寫入剪貼簿失敗。請自行選取文字再複製。',
      linkReleases: '最新發佈下載',
      linkScript: '閱讀 install-windows.ps1',
      linkInstallDoc: '完整安裝指南',

      searchHeading: '搜尋',
      searchLabel: '搜尋文件目錄',
      searchPlaceholder: '搜尋標題、路徑同摘要…',
      searchClear: '清除搜尋',
      searchModeGroup: '比對模式',
      searchModePlain: '純文字',
      searchModeRegex: '正規表達式',
      searchModeHint:
        '預設係純文字。只有你自己開咗之後，先至會用正規表達式比對。',
      searchBuilderShow: '開啟 regex 建構器',
      searchBuilderHide: '關閉 regex 建構器',
      searchEngine:
        '圖案會喺同源隔離 worker 入面，用你部瀏覽器嘅 JavaScript RegExp 引擎（ECMAScript）執行；超過硬性時限，頁面就會直接終止個 worker。你打嘅嘢唔會上載、儲存或者送去任何地方。',
      searchFullText:
        '呢度搜尋嘅係頁面標題、路徑同摘要。想搜尋每版已渲染頁面嘅全部內文，請用全文搜尋。',
      searchFullTextLink: '開啟全文搜尋',
      searchIdle: '打字即可搜尋文件目錄。',
      searchChecking: '正在安全地檢查圖案…',
      searchNone: '冇任何文件頁面符合呢個搜尋。',
      searchResults: '個符合嘅頁面',
      searchResult: '個符合嘅頁面',
      searchAll: '個目錄頁面',
      resultsLabel: '搜尋結果',

      builderHeading: 'Regex 建構器',
      builderIntro:
        '用組件砌出圖案，喺樣本文字上面即時測試，再套用去上面嘅搜尋。導引控制項會插入去圖案編輯器，而編輯器就係唯一準則。',
      bLiterals: '字面文字',
      bLiteralsHint: '插入時會逐個 regex 特殊字元加上跳脫。',
      bLiteralPlaceholder: '要完全相符嘅文字',
      bInsert: '插入',
      bClasses: '字元類別',
      bClassChars: '字元或者範圍',
      bClassPlaceholder: 'a-z0-9_',
      bClassNegate: '反轉呢個類別',
      bAnchors: '錨點同邊界',
      bGroups: '群組同前後探查',
      bGroupName: '群組名稱',
      bGroupNamePlaceholder: '名稱',
      bAlternation: '選擇（或）',
      bAltHint: '會包住目前選取範圍，或者插入一個空嘅選擇。',
      bAltWrap: '把選取範圍包成 (a|b)',
      bQuantifiers: '數量詞',
      bQuantMin: '最少',
      bQuantMax: '最多',
      bQuantLazy: '懶惰（盡量少配對）',
      bPattern: '圖案',
      bPatternHint: '可以自由編輯。上面嘅導引控制項會喺游標位置插入。',
      bFlags: '旗標',
      flagG: 'g — 全部相符',
      flagI: 'i — 忽略大小寫',
      flagM: 'm — ^ 同 $ 逐行相符',
      flagS: 's — . 亦相符換行',
      flagU: 'u — Unicode',
      flagY: 'y — 黏著式',
      bSample: '樣本文字',
      bSampleHint: '一邊打字一邊比對，而且只針對呢段文字。',
      bMatches: '即時相符結果',
      bNoMatches: '圖案有效，但喺樣本入面搵唔到相符。',
      bEmptyPattern: '輸入圖案就會顯示即時相符結果。',
      bMatchAt: '位置',
      bGroup: '群組',
      bGroupsOmitted: '個其他擷取群組',
      bCopyPattern: '複製圖案',
      bCopyLiteral: '複製成 /圖案/旗標',
      bApply: '喺搜尋使用（會切換去 regex 模式）',
      bApplied: '上面嘅搜尋已經用緊呢個圖案（regex 模式）。',
      bTakeQuery: '把搜尋文字轉成跳脫後嘅字面圖案',
      bTakeQueryEmpty: '搜尋框係空嘅，冇嘢可以攞。',
      bReset: '重設建構器',
      bSynced: '開咗 regex 模式，搜尋同建構器會互相同步。',
      bNotSynced: '搜尋而家係純文字模式，所以唔會同呢個圖案同步。',
      bValid: '圖案有效。',
      bChecking: '正在安全地檢查圖案…',
      bLimits:
        '安全上限：圖案最多 512 個字元，樣本文字最多 20,000 個字元。比對會喺隔離 worker 入面執行；去到硬性時限，頁面會終止個 worker，同時暫停即時比對，直至你修改圖案。',

      errInvalid: '圖案無效：',
      errPatternLong:
        '圖案太長。上限係 512 個字元，對文件搜尋嚟講已經足夠有餘。',
      errSampleLong:
        '樣本文字太長。上限係 20,000 個字元，避免慢圖案令頁面卡死。',
      errWorker: '呢個瀏覽器而家用唔到安全嘅正規表達式比對，所以冇執行個圖案。',
      errSlowTitle: '圖案已暫停',
      errSlow:
        '呢個圖案超過運算時限，所以隔離 worker 已經被終止。請簡化佢——例如 (a+)+ 咁樣嵌套嘅數量詞可以耗用指數級時間——然後修改圖案就會恢復。',
      errNested:
        '警告：呢個圖案喺已加數量詞嘅群組入面再嵌套數量詞，喺某啲輸入上可以耗用指數級時間。',
      errSearchInvalid: '正規表達式無效，所以唔會顯示任何結果。',
      dismiss: '關閉',
      notifications: '通知',

      featuresCatalogue: '分類功能文件',
      cFeatCompleteTitle: '完整功能清單',
      cFeatCompleteBody:
        '所有功能一張雙語表睇晒，每項都標明對比上游 GitHub Desktop 係新加、加強定沿用。',
      cFeatAgentTitle: 'Agent API',
      cFeatAgentBody:
        '選擇性啟用嘅 REST 同 MCP 自動化、驗證、傳輸邊界，以及可執行嘅 Postman 請求。',
      cFeatRepoTitle: '倉庫管理',
      cFeatRepoBody:
        '開啟、整理同安全瀏覽倉庫、子模組、暫存、稀疏簽出同 Cheap LFS。',
      cFeatIntegrationsTitle: '整合',
      cFeatIntegrationsBody:
        '使用者層級嘅 Git、編輯器、Shell 同作業系統連接，包括本機 Actions 執行器同 Ollama。',
      cFeatIdentityTitle: '身分同工作區',
      cFeatIdentityBody: '多帳戶，加上工作區規模下嘅倉庫、分頁同分支快速導航。',
      cFeatCollabTitle: '協作',
      cFeatCollabBody:
        'Pull request 嘅審閱、建立、活動通知，同其他由供應商支援嘅團隊協作。',
      cFeatReviewTitle: '審閱同差異',
      cFeatReviewBody: '變更檔案導航，以及安全嘅文字、結構化資料同圖片檢視。',
      cFeatQualityTitle: '品質同可靠性',
      cFeatQualityBody:
        '反應速度、生命週期清理、hook 執行、失敗復原同回歸關卡。',
      cFeatDesignTitle: '設計系統',
      cFeatDesignBody:
        'Material 呈現控制、漣漪同主題揭示動效、音效系統同指令面板外觀。',
      cFeatBacklogTitle: '需求待辦帳簿',
      cFeatBacklogBody:
        '三十項 GitHub Desktop 需求待辦，對應到已實作嘅功能契約。',

      cRefInstallTitle: '安裝',
      cRefInstallBody: 'Windows 安裝路徑、資產核對、資料目錄同日誌位置。',
      cRefRegexTitle: 'Regex 指南',
      cRefRegexBody:
        'App 入面每個搜尋欄點樣比對，同埋內建 regex 建構器點樣砌圖案。',
      cRefKnownTitle: '已知問題',
      cRefKnownBody: '針對已出貨組建記錄嘅現有限制同暫時解決辦法。',
      cRefVerifyTitle: '驗證紀錄',
      cRefVerifyBody: '可重現嘅本機驗收證據，以及指向確切發佈收據嘅連結。',
      cRefContribTitle: '參與貢獻',
      cRefContribBody: '開發環境設定、風格指南、工具、Lint 同疑難排解。',
      cRefTechTitle: '技術筆記',
      cRefTechBody:
        '內部結構：對話框、打包、OAuth、代理、Shell 整合同測試撰寫。',
      cRefProcessTitle: '流程',
      cRefProcessBody:
        '發佈規劃、問題分流、Pull request、品質流程同發佈說明撰寫。',
      cRefPostmanTitle: 'Postman 集合',
      cRefPostmanBody: '本機 Agent HTTP API 嘅主集合，直接喺 GitHub 開啟。',

      linksHeading: '專案連結',
      linkRepo: '原始碼倉庫',
      linkIssues: '問題追蹤',
      linkDiscussions: '討論區',
      linkWiki: 'Wiki',
      linkReleasesPage: '發佈',
      linkSite: '專案網站',
      linkReadme: '文件索引（Markdown）',
      linkProviders: '供應商設定（Azure DevOps、Bitbucket、GitLab）',
      linkLearn: '延伸閱讀：無法到達嘅提交',

      footerNote:
        'Desktop Material 係獨立嘅 GitHub Desktop Material Design 3 重製版，同 GitHub 冇任何從屬關係，亦未經 GitHub 認可。',
      footerLicense: 'MIT 授權',
    },
    tone: {
      heroTitle: [
        'Desktop Material 說明文件',
        'Desktop Material 文件總覽',
        'Desktop Material 做到嘅嘢，全部寫晒喺度',
        '你部 Git 嘅 Material 版說明書',
        '睇完呢版，之後就冇得話唔知㗎喇',
      ],
      heroLead: [
        'Desktop Material 係 GitHub Desktop 嘅 Material Design 3（M3 Expressive）重製版，只支援 Windows。呢度整理咗倉庫入面所有功能文件、參考、驗證紀錄同貢獻指南。',
        'Desktop Material 用 Material Design 3 重寫咗成個 GitHub Desktop 外殼，只喺 Windows 發佈。功能文件、參考、驗證紀錄同貢獻指南都由呢度入手。',
        'GitHub Desktop 嘅 Material Design 3 重製版，淨係行 Windows，Git 流程照舊。所有功能、參考同驗證紀錄都喺下面。',
        '攞 GitHub Desktop，成個殼用 Material Design 3 重砌，Git 部分一個掣都冇少，淨係出 Windows 版。做過嘅嘢全部寫低晒喺下面。',
        'GitHub Desktop 拆咗殼，換上 Material Design 3，Git 指令一條都冇少，而且淨係出 Windows 版。跟住仲要逐樣寫低。你而家睇緊嘅，就係嗰堆嘢。',
      ],
      installTitle: [
        '安裝',
        '安裝 Desktop Material',
        '裝嚟行下',
        '一行指令就搞掂',
        '貼一行指令，跟住去沖杯咖啡',
      ],
      installLead: [
        '倉庫追蹤嘅 PowerShell 安裝腳本會解析最新發佈、核對已公佈嘅雜湊值，並以現行使用者身分安裝。加 -FromSource 就改為由簽出組建。',
        '一個受追蹤嘅 PowerShell 腳本會搵最新發佈、核對已公佈嘅雜湊值，然後以現行使用者身分安裝。想改為由簽出組建就加 -FromSource。',
        '一行 PowerShell 就搵到最新版本，核對雜湊值先至安裝，唔使管理員權限。想自己砌就加 -FromSource。',
        '一行 PowerShell 幫你搵版本、核對雜湊值、裝落自己戶口，唔使開管理員視窗。想自己組建就用 -FromSource。',
        '一行 PowerShell 自己去搵最新版本，核對埋雜湊值先肯裝，由頭到尾都唔使開管理員視窗。想親手砌？-FromSource 等緊你。',
      ],
      searchTitle: [
        '搜尋說明文件',
        '搜尋所有說明頁面',
        '搵你要嗰版',
        '唔使碌，直接搵',
        '問下個索引啦，佢已經幫你揭晒所有頁',
      ],
      searchLead: [
        '純文字搜尋會涵蓋所有文件標題、路徑同摘要。啟用之後亦可使用正規表達式比對。',
        '純文字搜尋涵蓋所有標題、路徑同摘要；需要圖案比對時可以開啟 regex 模式。',
        '可以用純文字搵標題、路徑同摘要，又或者開 regex 模式，帶埋圖案嚟搵。',
        '預設純文字；一個字搵唔到就開 regex 模式，圖案唔聽話就開建構器。',
        '純文字做啲易嘅，regex 模式做啲扭計嘅，等圖案開始打贏你嗰陣，就開建構器慢慢砌返。',
      ],
      featuresTitle: [
        '功能說明文件',
        '按分類排列嘅功能文件',
        '個 App 實際做到啲乜',
        '所有已出貨嘅功能，分好類',
        '成箱玩具，逐格抽屜擺到靚仔',
      ],
      featuresLead: [
        '功能文件按負責該行為嘅產品範疇分類，每份都涵蓋工作流程、持久化邊界、失敗模式、安全考量，以及功能被稱為已驗收之前所需嘅檢查。',
        '功能文件按負責該行為嘅產品範疇分類，每份都涵蓋工作流程、持久化、失敗模式、安全考量同驗收檢查。',
        '文件按邊個部分負責嗰個行為嚟分類，每份都講清楚流程、會記低啲乜、點樣壞、守住啲乜、要過咗啲乜先算數。',
        '邊個負責邊個孭鑊，就歸邊類。每份文件都要交代做乜、記乜、點樣仆街、守住乜，同埋要綠燈咗啲乜先叫做完。',
        '邊個出事孭鑊就歸邊類。每版都要老實講：做乜、記得住乜、幾時會仆街、守住咗啲乜，同埋要幾多個綠剔先夠膽話搞掂。',
      ],
      referenceTitle: [
        '參考與流程',
        '參考、流程同紀錄',
        '參考書架',
        '書架上淨低嘅嘢',
        '其他值得留低嘅好嘢',
      ],
      referenceLead: [
        '安裝、搜尋行為、已知問題、驗證證據、貢獻者設定、內部結構，以及用嚟操作本機 API 嘅集合。',
        '安裝、搜尋行為、已知問題、驗證證據、貢獻者設定、內部結構同 API 集合。',
        '點樣裝、搜尋點行、仲有咩未修好、驗證咗啲乜、點樣自己砌，同埋內部係點樣夾埋一齊。',
        '裝佢、搵佢、睇下仲有咩未修好、睇埋啲收據、開個簽出，再入去內部摷下。',
        '安裝筆記、搜尋筆記、老老實實嘅未修好清單、一疊收據、一條貢獻者跑道，同埋畀好奇心贏嗰陣睇嘅內部結構。',
      ],
      linksTitle: [
        '專案連結',
        '專案同社群連結',
        '專案喺邊度',
        '去邊度搵返班人',
        '原始碼、問題區，同埋打招呼嘅地方',
      ],
      linksLead: [
        '倉庫、問題追蹤、討論區、Wiki 同已發佈嘅版本。',
        '倉庫、問題追蹤、討論區、Wiki 同已發佈嘅版本。',
        '原始碼、問題、討論、Wiki 同發佈，一行搞掂。',
        '原始碼、問題、討論、Wiki 同發佈，全部一撳就到。',
        '一撳就到：原始碼、投訴部、傾偈區、Wiki，同埋下載嗰度。',
      ],
    },
  }

  global.DesktopMaterialDocsStrings = {
    order: ['en', 'yue'],
    en: en,
    yue: yue,
  }
})(typeof window === 'undefined' ? globalThis : window)
