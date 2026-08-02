/**
 * Desktop Material documentation site — in-app changelog viewer.
 *
 * Lists **every** release in `docs-changelog-catalog.js`, never only the newest,
 * and lets a reader narrow that history two independent ways that compose: a
 * date filter (typed dates plus a calendar with month/year jump, range
 * selection and presets) and a text search (plain by default, regular
 * expressions only once switched on). Whatever survives both filters is exactly
 * what Copy and Export produce, and the exported file names the range it covers.
 *
 * Three rules shape the whole file:
 *
 *   Facts never move. The playfulness levels restyle headings, blurbs and the
 *   empty state only. Version numbers, dates, categories and entry text are
 *   reproduced verbatim at every level and in every language mode.
 *
 *   Nothing is invented. A release whose `d` is null has no `release-<version>`
 *   Git tag, so its date is unrecorded and is *said* to be unrecorded — never
 *   interpolated from a neighbour. A version with no recorded changes says so.
 *
 *   Logic is separable from the DOM. Date parsing, filtering and export text
 *   are pure functions on the `DocsChangelog` global, so Node tests drive the
 *   real implementation instead of a reimplementation of it.
 *
 * A reader's regular expression is only ever *compiled* on the page thread
 * (compilation cannot backtrack). Before it is ever *executed* here, the shared
 * `DesktopMaterialRegexJob` worker must have finished evaluating that exact
 * pattern over that exact corpus inside its own hard deadline; if the worker is
 * unavailable or overruns, the search fails closed and says so. Executing an
 * unproven pattern on the UI thread is what freezes a page.
 *
 * Mobile-first: one column from 320 CSS px upward, every interactive target at
 * least 44 px in its smallest dimension, and no horizontal page scroll.
 */
;(function (global) {
  'use strict'

  // =====================================================================
  // Localization resources
  //
  // Strings live in this table and logic reads them through `fixedString`
  // and `toneString`; no message is ever written inline in the logic below.
  // `fixed` covers control labels, accessible names, dates, counts and every
  // error message and never changes with the playfulness level. `tone` covers
  // headings, blurbs and the empty-state opener only, as five entries indexed
  // by level (1 = fully serious … 5 = maximum playfulness).
  // =====================================================================

  var STRINGS = {
    en: {
      htmlLang: 'en',
      fixed: {
        section: 'Changelog',
        catalogNote:
          'Release dates come from this repository’s release-<version> Git tags. {dated} of {total} releases carry such a tag; {unrecorded} do not, and are listed with an unrecorded date rather than a guessed one.',

        searchLegend: 'Search the changelog',
        searchLabel: 'Search release notes',
        searchPlaceholder: 'Search versions, categories and entry text…',
        searchClear: 'Clear the search',
        modeGroup: 'Matching mode',
        modePlain: 'Plain text',
        modeRegex: 'Regular expression',
        modeHint:
          'Plain text is the default. Regular-expression matching runs only while you have switched it on.',
        flagsGroup: 'Pattern flags',
        flagI: 'Ignore case (i)',
        flagM: 'Multiline (m)',
        flagS: 'Dot matches newline (s)',
        flagU: 'Unicode (u)',
        engineNote:
          'Patterns run in your browser’s own JavaScript RegExp engine (ECMAScript). A pattern is evaluated first inside an isolated same-origin worker with a hard deadline; nothing you type is uploaded, stored or sent anywhere.',
        patternOk: 'Pattern is valid.',
        patternInvalid: 'Pattern is not valid: {detail}',
        patternTooLong:
          'Pattern is longer than {limit} characters, so it was not run.',
        patternTooSlow:
          'That pattern did not finish inside the {budget} ms deadline, so the search was stopped. No results are shown for it. Narrow the pattern and try again.',
        patternUnavailable:
          'This browser could not start the isolated worker that evaluates patterns, so regular-expression search is unavailable here. Plain-text search still works.',
        patternCorpusTooLarge:
          'The changelog now holds more entries than the isolated evaluator accepts ({limit}), so regular-expression search is unavailable until that limit is raised. Plain-text search still works.',
        patternRunning: 'Checking the pattern…',
        builderShow: 'Open regex builder',
        builderHide: 'Close regex builder',
        builderLabel: 'Regex builder',
        builderInsert: 'Insert into the pattern',
        builderNote:
          'Each button inserts ECMAScript syntax at the caret. The pattern box and the search box are the same value, so editing either updates the other.',
        builderLiteral: 'Escape literal text',
        builderLiteralLabel: 'Literal text to escape',
        builderLiteralHint:
          'Regex metacharacters in this text are escaped before insertion, so the text matches itself.',

        // A token button shows a bare symbol, which a screen reader may skip or
        // read as nothing at all, so each one carries a spoken name that still
        // contains the visible symbol.
        tokenLower: 'Any lowercase letter a to z ([a-z])',
        tokenDigitRange: 'Any digit 0 to 9 ([0-9])',
        tokenDigit: 'Any digit (\\d)',
        tokenWord: 'Any letter, digit or underscore (\\w)',
        tokenSpace: 'Any whitespace character (\\s)',
        tokenNegated: 'None of the listed characters ([^…])',
        tokenAny: 'Any character except a line break (.)',
        tokenStart: 'Start of the text (^)',
        tokenEnd: 'End of the text ($)',
        tokenBoundary: 'Word boundary (\\b)',
        tokenGroup: 'Capturing group ((…))',
        tokenNonCapturing: 'Group that does not capture ((?:…))',
        tokenNamedGroup: 'Named capturing group ((?<name>…))',
        tokenAlternation: 'One side or the other (a|b)',
        tokenOptional: 'Optional — none or one (?)',
        tokenStar: 'None or more (*)',
        tokenPlus: 'One or more (+)',
        tokenRepeat: 'A repeat count, inserted as {1,3} ({n,m})',

        dateLegend: 'Date filter',
        dateFrom: 'From date',
        dateTo: 'To date',
        datePlaceholder: 'YYYY-MM-DD',
        dateHint:
          'Type a date as YYYY-MM-DD, or in this page’s locale order ({localeExample}). You can also pick one on the calendar. Both fields are optional.',
        dateIncomplete:
          'That date is incomplete. Finish it as YYYY-MM-DD, or clear the field. Your text is kept.',
        dateShortYear:
          'Write the year in full, with four digits — the century is not guessed here. Your text is kept.',
        dateUnreadable:
          'That is not a date this page can read. Use YYYY-MM-DD or {localeExample}. Your text is kept.',
        dateImpossible:
          'There is no such day in the calendar, so the filter was not changed. Your text is kept.',
        dateSwapped:
          'The From date is later than the To date, so nothing can match. Swap them, or clear one of them.',
        dateActive: 'Date filter active: {description}',
        dateInactive: 'No date filter is active.',
        calendarOpen: 'Open the calendar',
        calendarClose: 'Close the calendar',
        calendarLabel: 'Choose a date range',
        calendarMonth: 'Month',
        calendarYear: 'Year',
        calendarPrev: 'Previous month',
        calendarNext: 'Next month',
        calendarGrid: 'Days of {month} {year}',
        calendarPickStart: 'Pick the first day of the range.',
        calendarPickEnd:
          'Pick the last day of the range. Picking an earlier day starts a new range.',
        calendarSelected: 'Selected: {description}',
        calendarNoSelection: 'No date range is selected yet.',
        calendarClear: 'Clear the date filter',
        calendarDone: 'Done',
        presetsLabel: 'Quick ranges',
        preset30: 'Last 30 days',
        preset90: 'Last 90 days',
        presetYear: 'This year',
        presetPrevYear: 'Last year',
        presetAll: 'All dates',
        includeUndated: 'Also list releases whose date is unrecorded',
        includeUndatedNote:
          'A release with no release-<version> tag cannot be placed inside a date range, so it is hidden while a date filter is active unless you ask for it.',

        summary:
          'Showing {shownReleases} of {totalReleases} releases and {shownEntries} of {totalEntries} recorded entries.',
        summaryRange: 'Dates in view: {from} to {to}.',
        summaryRangeOne: 'All dated releases in view are from {from}.',
        summaryRangeNone: 'No release in view has a recorded date.',
        summaryUndated:
          '{count} releases in view have an unrecorded release date.',
        summaryUndatedHidden:
          '{count} releases with an unrecorded date are hidden by the active date filter.',
        rendered: 'Listing the first {count} matching releases.',
        showMore: 'Show {count} more releases',
        showAll: 'Every matching release is listed.',

        dateUnrecorded: 'Date unrecorded',
        dateUnrecordedNote:
          'No release-<version> Git tag exists for this version, so its release date is not recorded here.',
        noChanges: 'No changes are recorded for this version.',
        uncategorized: 'No category',
        openCommit: 'Open this commit on the web',
        matchedVersion: 'Matched on the version number.',
        entryCountOne: '1 entry',
        entryCount: '{count} entries',

        emptyFacts:
          'No release matches the current search and date filter together.',
        clearAll: 'Clear the search and the date filter',

        actionsLabel: 'Copy and export',
        copy: 'Copy this view',
        copyNote:
          'Copies exactly the releases listed above, as plain text, including the range it covers.',
        copied:
          'Copied {releases} releases and {entries} entries to the clipboard.',
        copyFailed:
          'Could not write to the clipboard. Use Export Markdown instead, or select the text and copy it manually.',
        exportMarkdown: 'Export Markdown',
        exportNote:
          'Downloads the same filtered view as a Markdown file that states the range it covers.',
        exported: 'Downloaded {file} — {releases} releases, {entries} entries.',
        exportFailed:
          'This browser would not start the download. Use Copy this view instead.',
        exportNothing:
          'Nothing matches the current filters, so there is nothing to copy or export.',

        exportTitle: 'Desktop Material changelog',
        exportGeneratedAt: 'Exported: {timestamp}',
        exportView:
          'Exported view: {shownReleases} of {totalReleases} releases and {shownEntries} of {totalEntries} recorded entries.',
        exportRange: 'Release dates in this export: {from} to {to}.',
        exportRangeOne: 'Release date in this export: {from}.',
        exportRangeNone: 'No release in this export has a recorded date.',
        exportFilterBoth: 'Date filter: {from} to {to}.',
        exportFilterFrom: 'Date filter: {from} onwards.',
        exportFilterTo: 'Date filter: up to {to}.',
        exportFilterNone: 'Date filter: none.',
        exportSearchPlain: 'Search: plain text “{query}”, {sensitivity}.',
        exportSearchRegex: 'Search: regular expression /{query}/{flags}.',
        exportSearchNone: 'Search: none.',
        exportCaseSensitive: 'case-sensitive',
        exportCaseInsensitive: 'case-insensitive',
        exportSource:
          'Source: changelog.json in this repository, with release dates read from its release-<version> Git tags. A release with no such tag is written as “date unrecorded”.',
      },
      tone: {
        heading: [
          'Changelog',
          'Changelog',
          'Changelog — every release, in order',
          'Changelog — the whole paper trail',
          'Changelog — every single release, warts and all',
        ],
        blurb: [
          'Every released version, with the changes recorded for it and the release date carried by its Git tag.',
          'Every released version, with its recorded changes and the release date its Git tag carries.',
          'Every version ever shipped, with the changes recorded against it and the date its Git tag carries.',
          'Scroll the whole shipping history. Dates come straight from the Git tags, so nothing here is filled in from imagination.',
          'The full receipt roll: every release, every recorded change, dates lifted straight off the Git tags. No vibes, no guessing, no tidying up the awkward bits.',
        ],
        emptyLead: [
          'No results.',
          'Nothing matched.',
          'Nothing matched that combination.',
          'Nothing matched — that filter is a picky one.',
          'Zero hits. That filter has immaculate taste and terrible luck.',
        ],
      },
    },

    yue: {
      htmlLang: 'zh-HK',
      fixed: {
        section: '更新記錄',
        catalogNote:
          '發佈日期係由本 repo 嘅 release-<version> Git tag 讀出嚟。{total} 個版本之中有 {dated} 個有 tag；{unrecorded} 個冇，所以佢哋標示為「日期無記錄」，唔會靠估。',

        searchLegend: '搜更新記錄',
        searchLabel: '搜更新記錄內容',
        searchPlaceholder: '搜版本號、分類、內容…',
        searchClear: '清空搜尋',
        modeGroup: '比對模式',
        modePlain: '純文字',
        modeRegex: '正則表達式',
        modeHint: '預設係純文字。開咗正則表達式，先會用正則比對。',
        flagsGroup: '正則旗標',
        flagI: '唔理大小寫 (i)',
        flagM: '多行 (m)',
        flagS: '點號都夾換行 (s)',
        flagU: 'Unicode (u)',
        engineNote:
          '你嘅 pattern 係用你瀏覽器自己嘅 JavaScript RegExp 引擎（ECMAScript）跑。跑之前會先入去同源 worker 度限時試行；你打嘅嘢唔會上傳、唔會儲、唔會寄去任何地方。',
        patternOk: 'Pattern 有效。',
        patternInvalid: 'Pattern 唔正確：{detail}',
        patternTooLong: 'Pattern 長過 {limit} 個字元，所以冇跑。',
        patternTooSlow:
          '個 pattern 喺 {budget} 毫秒限時內跑唔完，搜尋已經中止，所以冇顯示任何結果。改窄啲再試。',
        patternUnavailable:
          '呢個瀏覽器開唔到負責試行 pattern 嘅隔離 worker，所以正則搜尋暫時用唔到。純文字搜尋照樣可以用。',
        patternCorpusTooLarge:
          '更新記錄嘅條目數量已經多過隔離試行器接受嘅上限（{limit}），所以未提高上限之前正則搜尋用唔到。純文字搜尋照樣可以用。',
        patternRunning: '檢查 pattern 中…',
        builderShow: '打開正則產生器',
        builderHide: '收起正則產生器',
        builderLabel: '正則產生器',
        builderInsert: '插入 pattern',
        builderNote:
          '每粒掣都會喺游標位置插入 ECMAScript 語法。Pattern 格同搜尋格係同一個值，改邊個另一個都會跟。',
        builderLiteral: '轉義純文字',
        builderLiteralLabel: '要轉義嘅文字',
        builderLiteralHint:
          '呢段文字裡面嘅正則特殊符號會先轉義，插入之後就會照字面比對。',

        // 掣面只有一個符號，讀屏軟件好可能唔讀，所以每粒都有講得出口嘅名，
        // 而個名照樣包住見到嘅符號。
        tokenLower: '任何細寫英文字母 a 至 z（[a-z]）',
        tokenDigitRange: '任何數字 0 至 9（[0-9]）',
        tokenDigit: '任何數字（\\d）',
        tokenWord: '任何字母、數字或者底線（\\w）',
        tokenSpace: '任何空白字元（\\s）',
        tokenNegated: '列出嘅字元一個都唔要（[^…]）',
        tokenAny: '除咗換行之外任何一個字元（.）',
        tokenStart: '文字開頭（^）',
        tokenEnd: '文字結尾（$）',
        tokenBoundary: '字詞邊界（\\b）',
        tokenGroup: '會捕捉嘅群組（(…)）',
        tokenNonCapturing: '唔捕捉嘅群組（(?:…)）',
        tokenNamedGroup: '有名嘅捕捉群組（(?<name>…)）',
        tokenAlternation: '呢邊或者嗰邊（a|b）',
        tokenOptional: '可有可無 —— 零個或者一個（?）',
        tokenStar: '零個或者多個（*）',
        tokenPlus: '一個或者多個（+）',
        tokenRepeat: '重複次數，插入嘅係 {1,3}（{n,m}）',

        dateLegend: '日期篩選',
        dateFrom: '由邊日',
        dateTo: '到邊日',
        datePlaceholder: 'YYYY-MM-DD',
        dateHint:
          '可以打 YYYY-MM-DD，又或者本頁地區格式（{localeExample}）。都可以用日曆揀。兩格都可以唔填。',
        dateIncomplete:
          '個日期打漏咗。補成 YYYY-MM-DD，或者清空個格。你打嘅字會留住。',
        dateShortYear:
          '年份請寫足四位數 —— 呢度唔會幫你估世紀。你打嘅字會留住。',
        dateUnreadable:
          '呢個唔係本頁讀得出嘅日期。用 YYYY-MM-DD 或者 {localeExample}。你打嘅字會留住。',
        dateImpossible: '日曆上冇呢一日，所以篩選冇改。你打嘅字會留住。',
        dateSwapped:
          '「由邊日」遲過「到邊日」，咁樣冇嘢會中。調轉佢哋，或者清空一個。',
        dateActive: '日期篩選開緊：{description}',
        dateInactive: '冇開日期篩選。',
        calendarOpen: '打開日曆',
        calendarClose: '收起日曆',
        calendarLabel: '揀日期範圍',
        calendarMonth: '月',
        calendarYear: '年',
        calendarPrev: '上一個月',
        calendarNext: '下一個月',
        calendarGrid: '{year} 年 {month} 嘅日子',
        calendarPickStart: '揀範圍第一日。',
        calendarPickEnd: '揀範圍最後一日。揀早過起點嘅話就重新開始。',
        calendarSelected: '已揀：{description}',
        calendarNoSelection: '仲未揀日期範圍。',
        calendarClear: '清除日期篩選',
        calendarDone: '搞定',
        presetsLabel: '快速範圍',
        preset30: '近 30 日',
        preset90: '近 90 日',
        presetYear: '今年',
        presetPrevYear: '舊年',
        presetAll: '全部日期',
        includeUndated: '連日期無記錄嘅版本一齊列',
        includeUndatedNote:
          '冇 release-<version> tag 嘅版本擺唔入日期範圍，所以開咗日期篩選就會收埋，除非你叫佢出嚟。',

        summary:
          '顯示 {totalReleases} 個版本之中 {shownReleases} 個，{totalEntries} 條記錄之中 {shownEntries} 條。',
        summaryRange: '畫面內日期：{from} 至 {to}。',
        summaryRangeOne: '畫面內有日期嘅版本全部係 {from}。',
        summaryRangeNone: '畫面內冇版本有記錄日期。',
        summaryUndated: '畫面內有 {count} 個版本嘅發佈日期無記錄。',
        summaryUndatedHidden:
          '有 {count} 個日期無記錄嘅版本，被開緊嘅日期篩選收埋。',
        rendered: '先列出頭 {count} 個中咗嘅版本。',
        showMore: '再列 {count} 個版本',
        showAll: '中咗嘅版本全部列完。',

        dateUnrecorded: '日期無記錄',
        dateUnrecordedNote:
          '呢個版本冇 release-<version> Git tag，所以佢嘅發佈日期喺呢度冇記錄。',
        noChanges: '呢個版本冇記錄任何改動。',
        uncategorized: '冇分類',
        openCommit: '喺網頁開返呢個 commit 睇下',
        matchedVersion: '係版本號中咗。',
        entryCountOne: '1 條記錄',
        entryCount: '{count} 條記錄',

        emptyFacts: '而家嘅搜尋加日期篩選，冇任何版本同時符合。',
        clearAll: '清除搜尋同日期篩選',

        actionsLabel: '複製同匯出',
        copy: '複製呢個畫面',
        copyNote: '一模一樣複製上面列出嘅版本，純文字，連範圍都寫埋。',
        copied: '已複製 {releases} 個版本、{entries} 條記錄去剪貼簿。',
        copyFailed:
          '寫唔入剪貼簿。改用「匯出 Markdown」，或者自己揀住段文字複製。',
        exportMarkdown: '匯出 Markdown',
        exportNote: '將同一個篩選結果下載成 Markdown 檔，檔內會寫明範圍。',
        exported: '已下載 {file} —— {releases} 個版本、{entries} 條記錄。',
        exportFailed: '呢個瀏覽器唔肯開始下載。改用「複製呢個畫面」。',
        exportNothing: '而家冇嘢符合篩選，所以冇嘢可以複製或匯出。',

        exportTitle: 'Desktop Material 更新記錄',
        exportGeneratedAt: '匯出時間：{timestamp}',
        exportView:
          '匯出範圍：{totalReleases} 個版本之中 {shownReleases} 個，{totalEntries} 條記錄之中 {shownEntries} 條。',
        exportRange: '本次匯出嘅發佈日期：{from} 至 {to}。',
        exportRangeOne: '本次匯出嘅發佈日期：{from}。',
        exportRangeNone: '本次匯出冇任何版本有記錄日期。',
        exportFilterBoth: '日期篩選：{from} 至 {to}。',
        exportFilterFrom: '日期篩選：{from} 之後。',
        exportFilterTo: '日期篩選：{to} 之前。',
        exportFilterNone: '日期篩選：冇。',
        exportSearchPlain: '搜尋：純文字「{query}」，{sensitivity}。',
        exportSearchRegex: '搜尋：正則 /{query}/{flags}。',
        exportSearchNone: '搜尋：冇。',
        exportCaseSensitive: '分大小寫',
        exportCaseInsensitive: '唔分大小寫',
        exportSource:
          '來源：本 repo 嘅 changelog.json，發佈日期讀自 release-<version> Git tag。冇 tag 嘅版本會寫成「日期無記錄」。',
      },
      tone: {
        heading: [
          '更新記錄',
          '更新記錄',
          '更新記錄 —— 逐個版本齊齊列',
          '更新記錄 —— 全部版本都喺呢度',
          '更新記錄 —— 由頭到尾，一個都唔漏',
        ],
        blurb: [
          '每個已發佈版本，連同佢記錄嘅改動，以及 Git tag 上嘅發佈日期。',
          '每個已發佈版本，連佢記錄嘅改動同 Git tag 上嘅發佈日期。',
          '出過嘅版本全部喺呢度，改動照記，日期由 Git tag 讀出。',
          '一路捲落去就係全部發佈史。日期直接由 Git tag 攞，冇一個係靠估。',
          '整條單據卷軸：個個版本、每條改動、日期直接由 Git tag 撕落嚟。唔靠感覺、唔靠估、唔會幫你隱惡揚善。',
        ],
        emptyLead: [
          '冇結果。',
          '冇嘢中。',
          '呢個組合冇嘢中。',
          '冇嘢中 —— 你個篩選揀嘢好揀。',
          '零命中。你個篩選品味一流，運氣一敗塗地。',
        ],
      },
    },
  }

  var Levels = 5

  /** Fallback order: requested language → English. Facts never fall back to a key. */
  function fixedString(languageId, key) {
    var pack = STRINGS[languageId]
    if (pack && pack.fixed && typeof pack.fixed[key] === 'string') {
      return pack.fixed[key]
    }
    var fallback = STRINGS.en.fixed[key]
    return typeof fallback === 'string' ? fallback : key
  }

  function toneString(languageId, key, level) {
    var wanted = clampLevel(level)
    var pack = STRINGS[languageId]
    if (pack && pack.tone && Array.isArray(pack.tone[key])) {
      var list = pack.tone[key]
      if (typeof list[wanted - 1] === 'string') {
        return list[wanted - 1]
      }
      if (typeof list[0] === 'string') {
        return list[0]
      }
    }
    var english = STRINGS.en.tone[key]
    return Array.isArray(english) && typeof english[0] === 'string'
      ? english[0]
      : key
  }

  function clampLevel(value) {
    var level = parseInt(value, 10)
    if (!(level >= 1)) {
      return 1
    }
    return level > Levels ? Levels : level
  }

  /** `{name}` placeholders only; a missing value stays visible as its key. */
  function format(template, values) {
    if (values === undefined || values === null) {
      return template
    }
    return String(template).replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      function (all, key) {
        return Object.prototype.hasOwnProperty.call(values, key)
          ? String(values[key])
          : all
      }
    )
  }

  /**
   * Every visible string for one language at one playfulness level. The DOM
   * layer and the export functions both read labels through this, so a test can
   * pin the exact wording it asserts on.
   */
  function labelsFor(languageId, level) {
    var id = STRINGS[languageId] === undefined ? 'en' : languageId
    var resolvedLevel = clampLevel(level)
    return {
      lang: id,
      htmlLang: STRINGS[id].htmlLang,
      level: resolvedLevel,
      fixed: function (key, values) {
        return format(fixedString(id, key), values)
      },
      tone: function (key, values) {
        return format(toneString(id, key, resolvedLevel), values)
      },
      months: MonthNames[id] === undefined ? MonthNames.en : MonthNames[id],
      weekdaysShort:
        WeekdayShort[id] === undefined ? WeekdayShort.en : WeekdayShort[id],
      weekdaysLong:
        WeekdayLong[id] === undefined ? WeekdayLong.en : WeekdayLong[id],
    }
  }

  var MonthNames = {
    en: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    yue: [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ],
  }

  var WeekdayShort = {
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    yue: ['一', '二', '三', '四', '五', '六', '日'],
  }

  var WeekdayLong = {
    en: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    yue: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  }

  // =====================================================================
  // Pure logic — dates
  // =====================================================================

  /** Safety bounds. Both are also enforced with `maxlength` in the markup. */
  var MaximumQueryLength = 200
  var MaximumTypedDateLength = 24

  function pad2(value) {
    return value < 10 ? '0' + value : String(value)
  }

  function isoFromParts(year, month, day) {
    return String(year) + '-' + pad2(month) + '-' + pad2(day)
  }

  /** `month` is 1-12. Uses UTC so a host time zone cannot shift a day. */
  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
  }

  function isRealDate(year, month, day) {
    return (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      year >= 1 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= daysInMonth(year, month)
    )
  }

  /** ISO dates are ordered by plain string comparison, which is why they are stored that way. */
  function compareIso(left, right) {
    return left < right ? -1 : left > right ? 1 : 0
  }

  function parseIso(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
    if (match === null) {
      return null
    }
    var year = parseInt(match[1], 10)
    var month = parseInt(match[2], 10)
    var day = parseInt(match[3], 10)
    return isRealDate(year, month, day)
      ? { year: year, month: month, day: day }
      : null
  }

  /**
   * Which order a bare numeric date is read in. Only the well-known cases are
   * claimed; anything else falls back to day-first, which is the majority
   * order worldwide, and the hint string always shows the example that the
   * page will actually accept so the reader is never guessing.
   */
  function orderForLocale(locale) {
    var tag = (locale === undefined || locale === null ? '' : String(locale))
      .toLowerCase()
      .replace(/_/g, '-')
    if (tag === '' || tag === 'en' || tag.indexOf('en-us') === 0) {
      return 'mdy'
    }
    if (
      tag.indexOf('ja') === 0 ||
      tag.indexOf('ko') === 0 ||
      tag.indexOf('zh-cn') === 0 ||
      tag.indexOf('zh-hans') === 0 ||
      tag.indexOf('lt') === 0 ||
      tag.indexOf('hu') === 0
    ) {
      return 'ymd'
    }
    return 'dmy'
  }

  /** The example shown in the hint and in error messages for a given order. */
  function localeExample(order) {
    if (order === 'mdy') {
      return '7/31/2026'
    }
    if (order === 'ymd') {
      return '2026/7/31'
    }
    return '31/7/2026'
  }

  /**
   * Reads a date a reader typed.
   *
   * Accepts a plain ISO date (`2026-07-31`, and `2026/07/31` because the year
   * position is unambiguous) and the locale's numeric order. Every result keeps
   * `raw` exactly as typed, so a caller can report a problem inline without
   * throwing the reader's text away, and the statuses are distinct on purpose:
   * an unfinished date, a two-digit year, an unreadable string and a day that
   * does not exist in the calendar are four different things to say.
   */
  function parseTypedDate(raw, options) {
    var settings = options === undefined || options === null ? {} : options
    var order =
      settings.order === undefined || settings.order === null
        ? orderForLocale(settings.locale)
        : settings.order
    var text = raw === undefined || raw === null ? '' : String(raw)
    var trimmed = text.replace(/^\s+/, '').replace(/\s+$/, '')
    var result = {
      status: 'empty',
      iso: null,
      raw: text,
      order: order,
      messageKey: null,
    }

    if (trimmed === '') {
      return result
    }
    if (trimmed.length > MaximumTypedDateLength) {
      result.status = 'unreadable'
      result.messageKey = 'dateUnreadable'
      return result
    }

    var yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed)
    if (yearFirst !== null) {
      return finishParsed(
        result,
        parseInt(yearFirst[1], 10),
        parseInt(yearFirst[2], 10),
        parseInt(yearFirst[3], 10)
      )
    }

    var localeForm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{1,4})$/.exec(trimmed)
    if (localeForm !== null) {
      if (localeForm[3].length < 4) {
        // Expanding `26` to a century would be a guess dressed up as data.
        result.status = 'short-year'
        result.messageKey = 'dateShortYear'
        return result
      }
      var first = parseInt(localeForm[1], 10)
      var second = parseInt(localeForm[2], 10)
      var year = parseInt(localeForm[3], 10)
      var month = order === 'mdy' ? first : second
      var day = order === 'mdy' ? second : first
      return finishParsed(result, year, month, day)
    }

    // Anything that is a prefix of an accepted form is unfinished, not wrong.
    if (
      /^\d{1,4}$/.test(trimmed) ||
      /^\d{4}[-/.]\d{0,2}$/.test(trimmed) ||
      /^\d{4}[-/.]\d{1,2}[-/.]$/.test(trimmed) ||
      /^\d{1,2}[-/.]\d{0,2}$/.test(trimmed) ||
      /^\d{1,2}[-/.]\d{1,2}[-/.]$/.test(trimmed)
    ) {
      result.status = 'incomplete'
      result.messageKey = 'dateIncomplete'
      return result
    }

    result.status = 'unreadable'
    result.messageKey = 'dateUnreadable'
    return result
  }

  function finishParsed(result, year, month, day) {
    if (!isRealDate(year, month, day)) {
      result.status = 'impossible'
      result.messageKey = 'dateImpossible'
      return result
    }
    result.status = 'ok'
    result.iso = isoFromParts(year, month, day)
    result.messageKey = null
    return result
  }

  /** Adds `days` to an ISO date, in UTC, and returns an ISO date. */
  function shiftIso(iso, days) {
    var parts = parseIso(iso)
    if (parts === null) {
      return null
    }
    var stamp = Date.UTC(parts.year, parts.month - 1, parts.day)
    var moved = new Date(stamp + days * 86400000)
    return isoFromParts(
      moved.getUTCFullYear(),
      moved.getUTCMonth() + 1,
      moved.getUTCDate()
    )
  }

  var PresetIds = ['last30', 'last90', 'thisYear', 'lastYear', 'all']

  /**
   * Resolves a preset against a caller-supplied "today", so a preset is always
   * anchored to a real clock reading rather than to an assumption inside here.
   */
  function presetRange(id, todayIso) {
    if (id === 'all') {
      return { from: null, to: null }
    }
    var today = parseIso(todayIso)
    if (today === null) {
      return null
    }
    if (id === 'last30') {
      return { from: shiftIso(todayIso, -29), to: todayIso }
    }
    if (id === 'last90') {
      return { from: shiftIso(todayIso, -89), to: todayIso }
    }
    if (id === 'thisYear') {
      return { from: isoFromParts(today.year, 1, 1), to: todayIso }
    }
    if (id === 'lastYear') {
      return {
        from: isoFromParts(today.year - 1, 1, 1),
        to: isoFromParts(today.year - 1, 12, 31),
      }
    }
    return null
  }

  /**
   * The day grid for one month, as whole weeks starting on `weekStart`
   * (0 = Sunday, 1 = Monday). Days from the neighbouring months are included so
   * the grid is rectangular, flagged with `inMonth: false`.
   */
  function monthMatrix(year, month, weekStart) {
    var start = weekStart === undefined ? 1 : weekStart
    var firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    var lead = (firstWeekday - start + 7) % 7
    var total = daysInMonth(year, month)
    var cells = []
    var index

    for (index = lead; index > 0; index--) {
      var before = shiftIso(isoFromParts(year, month, 1), -index)
      cells.push({ iso: before, day: parseIso(before).day, inMonth: false })
    }
    for (index = 1; index <= total; index++) {
      cells.push({
        iso: isoFromParts(year, month, index),
        day: index,
        inMonth: true,
      })
    }
    while (cells.length % 7 !== 0) {
      var after = shiftIso(cells[cells.length - 1].iso, 1)
      cells.push({ iso: after, day: parseIso(after).day, inMonth: false })
    }

    var weeks = []
    for (index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7))
    }
    return weeks
  }

  // =====================================================================
  // Pure logic — search
  // =====================================================================

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
  }

  /**
   * Turns a query into a matcher.
   *
   * Compiling a pattern is safe on any thread — compilation does not backtrack
   * — so syntax validity is always reported here and at once. *Running* a
   * reader's pattern is the dangerous half, and the DOM layer only ever passes
   * the matcher on to `filterReleases` after the isolated worker has proved the
   * same pattern completes over the same corpus inside its deadline.
   */
  function compilePattern(query, mode, flags) {
    var text = query === undefined || query === null ? '' : String(query)
    var usedFlags = normalizeFlags(flags)
    var caseInsensitive = usedFlags.indexOf('i') !== -1
    if (text === '') {
      return {
        ok: true,
        empty: true,
        mode: mode === 'regex' ? 'regex' : 'plain',
        flags: usedFlags,
        matcher: null,
        error: null,
        detail: '',
      }
    }
    if (text.length > MaximumQueryLength) {
      return {
        ok: false,
        empty: false,
        mode: mode === 'regex' ? 'regex' : 'plain',
        flags: usedFlags,
        matcher: null,
        error: 'too-long',
        detail: String(MaximumQueryLength),
      }
    }
    if (mode !== 'regex') {
      var needle = caseInsensitive ? text.toLowerCase() : text
      return {
        ok: true,
        empty: false,
        mode: 'plain',
        flags: usedFlags,
        error: null,
        detail: '',
        matcher: function (subject) {
          var value = subject === null ? '' : String(subject)
          return (
            (caseInsensitive ? value.toLowerCase() : value).indexOf(needle) !==
            -1
          )
        },
      }
    }
    var regex
    try {
      // `g` and `y` are deliberately absent: a stateful `lastIndex` would make
      // the same pattern answer differently depending on scan order.
      regex = new RegExp(text, usedFlags.replace(/[gy]/g, ''))
    } catch (error) {
      return {
        ok: false,
        empty: false,
        mode: 'regex',
        flags: usedFlags,
        matcher: null,
        error: 'syntax',
        detail:
          error !== null && error !== undefined && error.message !== undefined
            ? String(error.message).slice(0, 300)
            : String(error),
      }
    }
    return {
      ok: true,
      empty: false,
      mode: 'regex',
      flags: usedFlags,
      regex: regex,
      error: null,
      detail: '',
      matcher: function (subject) {
        return regex.test(subject === null ? '' : String(subject))
      },
    }
  }

  /** Only the flags the worker accepts, de-duplicated, order preserved. */
  function normalizeFlags(flags) {
    var text = flags === undefined || flags === null ? 'i' : String(flags)
    var allowed = 'imsu'
    var seen = ''
    for (var index = 0; index < text.length; index++) {
      var flag = text.charAt(index)
      if (allowed.indexOf(flag) !== -1 && seen.indexOf(flag) === -1) {
        seen += flag
      }
    }
    return seen
  }

  // =====================================================================
  // Pure logic — filtering
  // =====================================================================

  function normalizeState(state) {
    var input = state === undefined || state === null ? {} : state
    var from =
      typeof input.from === 'string' && parseIso(input.from) !== null
        ? input.from
        : null
    var to =
      typeof input.to === 'string' && parseIso(input.to) !== null
        ? input.to
        : null
    return {
      from: from,
      to: to,
      query:
        input.query === undefined || input.query === null
          ? ''
          : String(input.query),
      mode: input.mode === 'regex' ? 'regex' : 'plain',
      flags: normalizeFlags(input.flags),
      // A release with no tag cannot be proved to sit inside a range, so a date
      // filter hides it unless the reader explicitly asks for it back.
      includeUndated:
        typeof input.includeUndated === 'boolean'
          ? input.includeUndated
          : false,
    }
  }

  function releaseEntries(release) {
    var list = Array.isArray(release.e) ? release.e : []
    var entries = []
    for (var index = 0; index < list.length; index++) {
      entries.push({
        category: list[index][0],
        text: list[index][1],
        // Present only on entries that record one; upstream entries reference
        // an issue number instead and keep a null rather than a made-up SHA.
        commit: list[index].length > 2 ? list[index][2] : null,
      })
    }
    return entries
  }

  function withinRange(date, from, to) {
    if (from !== null && compareIso(date, from) < 0) {
      return false
    }
    return !(to !== null && compareIso(date, to) > 0)
  }

  /**
   * Applies the date filter and the text search together — they compose, they
   * never replace one another. The date filter chooses releases; the search
   * then chooses entries inside them, except that a release whose *version*
   * matches keeps all of its entries (which is also how a version with no
   * recorded changes can still be found by name).
   *
   * `matcher` is optional and overrides `state.query`; the DOM layer passes the
   * worker-cleared matcher through it. An unusable pattern returns an empty
   * result with `patternValid: false` rather than silently searching for
   * nothing.
   */
  function filterReleases(catalog, state, matcher) {
    var normalized = normalizeState(state)
    var all = catalog === null || catalog === undefined ? [] : catalog.releases
    var releases = Array.isArray(all) ? all : []
    var dateFiltered = normalized.from !== null || normalized.to !== null
    var includeUndated = dateFiltered ? normalized.includeUndated : true

    var test = matcher === undefined || matcher === null ? null : matcher
    var patternValid = true
    var patternError = null
    var patternDetail = ''
    if (test === null) {
      var compiled = compilePattern(
        normalized.query,
        normalized.mode,
        normalized.flags
      )
      patternValid = compiled.ok
      patternError = compiled.error
      patternDetail = compiled.detail
      test = compiled.ok && !compiled.empty ? compiled.matcher : null
    }

    var totalEntries = 0
    var index
    for (index = 0; index < releases.length; index++) {
      totalEntries += Array.isArray(releases[index].e)
        ? releases[index].e.length
        : 0
    }

    var view = {
      releases: [],
      releaseCount: 0,
      entryCount: 0,
      totalReleaseCount: releases.length,
      totalEntryCount: totalEntries,
      undatedCount: 0,
      undatedHiddenCount: 0,
      earliest: null,
      latest: null,
      dateFiltered: dateFiltered,
      includeUndated: includeUndated,
      patternValid: patternValid,
      patternError: patternError,
      patternDetail: patternDetail,
      state: normalized,
    }

    if (!patternValid) {
      return view
    }

    for (index = 0; index < releases.length; index++) {
      var release = releases[index]
      var date = typeof release.d === 'string' ? release.d : null
      // 24-hour HH:MM from the release tag, display only. Never shown without
      // its date, so a time can't imply a date the tag never carried.
      var time = typeof release.t === 'string' ? release.t : null

      if (date === null) {
        if (!includeUndated) {
          view.undatedHiddenCount++
          continue
        }
      } else if (!withinRange(date, normalized.from, normalized.to)) {
        continue
      }

      var entries = releaseEntries(release)
      var versionMatch = false
      var kept = entries

      if (test !== null) {
        versionMatch = test(release.v)
        if (!versionMatch) {
          kept = []
          for (var e = 0; e < entries.length; e++) {
            var entry = entries[e]
            if (
              test(entry.text) ||
              (entry.category !== null && test(entry.category)) ||
              (entry.commit !== null && test(entry.commit))
            ) {
              kept.push(entry)
            }
          }
          if (kept.length === 0) {
            continue
          }
        }
      }

      view.releases.push({
        version: release.v,
        date: date,
        time: date === null ? null : time,
        entries: kept,
        versionMatch: versionMatch,
        hasRecordedChanges: entries.length > 0,
      })
      view.entryCount += kept.length
      if (date === null) {
        view.undatedCount++
      } else {
        if (view.earliest === null || compareIso(date, view.earliest) < 0) {
          view.earliest = date
        }
        if (view.latest === null || compareIso(date, view.latest) > 0) {
          view.latest = date
        }
      }
    }

    view.releaseCount = view.releases.length
    return view
  }

  /**
   * The factual description of what is on screen: counts, the range the matched
   * releases actually span, and what each active filter is doing. Both the
   * status line and the exported file are built from this, so the file can
   * never claim a different range from the one the reader was looking at.
   */
  function describeView(view, labels) {
    var lines = []
    lines.push(
      labels.fixed('summary', {
        shownReleases: view.releaseCount,
        totalReleases: view.totalReleaseCount,
        shownEntries: view.entryCount,
        totalEntries: view.totalEntryCount,
      })
    )
    if (view.earliest === null) {
      lines.push(labels.fixed('summaryRangeNone'))
    } else if (view.earliest === view.latest) {
      lines.push(labels.fixed('summaryRangeOne', { from: view.earliest }))
    } else {
      lines.push(
        labels.fixed('summaryRange', { from: view.earliest, to: view.latest })
      )
    }
    if (view.undatedCount > 0) {
      lines.push(labels.fixed('summaryUndated', { count: view.undatedCount }))
    }
    if (view.undatedHiddenCount > 0) {
      lines.push(
        labels.fixed('summaryUndatedHidden', {
          count: view.undatedHiddenCount,
        })
      )
    }
    return lines
  }

  /** The two filter lines, worded for the exported header. */
  function describeFilters(view, labels) {
    var state = view.state
    var lines = []
    if (state.from !== null && state.to !== null) {
      lines.push(
        labels.fixed('exportFilterBoth', { from: state.from, to: state.to })
      )
    } else if (state.from !== null) {
      lines.push(labels.fixed('exportFilterFrom', { from: state.from }))
    } else if (state.to !== null) {
      lines.push(labels.fixed('exportFilterTo', { to: state.to }))
    } else {
      lines.push(labels.fixed('exportFilterNone'))
    }

    if (state.query === '') {
      lines.push(labels.fixed('exportSearchNone'))
    } else if (state.mode === 'regex') {
      lines.push(
        labels.fixed('exportSearchRegex', {
          query: state.query,
          flags: state.flags,
        })
      )
    } else {
      lines.push(
        labels.fixed('exportSearchPlain', {
          query: state.query,
          sensitivity: labels.fixed(
            state.flags.indexOf('i') === -1
              ? 'exportCaseSensitive'
              : 'exportCaseInsensitive'
          ),
        })
      )
    }
    return lines
  }

  /**
   * Renders the filtered view as text. `format` is `markdown` (the exported
   * file) or `text` (the clipboard). Both carry the same header, so a pasted
   * excerpt still states the range and the filters it came from.
   *
   * `exportedAt` is passed in rather than read from the clock here: a pure
   * function that stamps its own timestamp cannot be tested, and a fabricated
   * timestamp would be a fabricated fact.
   */
  function exportText(view, options) {
    var settings = options === undefined || options === null ? {} : options
    var labels =
      settings.labels === undefined || settings.labels === null
        ? labelsFor('en', 1)
        : settings.labels
    var markdown = settings.format !== 'text'
    var lines = []

    lines.push(
      markdown
        ? '# ' + labels.fixed('exportTitle')
        : labels.fixed('exportTitle')
    )
    lines.push('')
    if (typeof settings.exportedAt === 'string' && settings.exportedAt !== '') {
      lines.push(
        labels.fixed('exportGeneratedAt', { timestamp: settings.exportedAt })
      )
    }
    lines.push(
      labels.fixed('exportView', {
        shownReleases: view.releaseCount,
        totalReleases: view.totalReleaseCount,
        shownEntries: view.entryCount,
        totalEntries: view.totalEntryCount,
      })
    )
    if (view.earliest === null) {
      lines.push(labels.fixed('exportRangeNone'))
    } else if (view.earliest === view.latest) {
      lines.push(labels.fixed('exportRangeOne', { from: view.earliest }))
    } else {
      lines.push(
        labels.fixed('exportRange', { from: view.earliest, to: view.latest })
      )
    }
    var filters = describeFilters(view, labels)
    for (var f = 0; f < filters.length; f++) {
      lines.push(filters[f])
    }
    if (view.undatedCount > 0) {
      lines.push(labels.fixed('summaryUndated', { count: view.undatedCount }))
    }
    if (view.undatedHiddenCount > 0) {
      lines.push(
        labels.fixed('summaryUndatedHidden', { count: view.undatedHiddenCount })
      )
    }
    lines.push(labels.fixed('exportSource'))
    lines.push('')

    if (view.releaseCount === 0) {
      lines.push(labels.fixed('emptyFacts'))
      lines.push('')
      return lines.join('\n')
    }

    for (var r = 0; r < view.releases.length; r++) {
      var release = view.releases[r]
      var dateText =
        release.date === null
          ? labels.fixed('dateUnrecorded')
          : typeof release.time === 'string' && release.time.length > 0
          ? release.date + ' ' + release.time
          : release.date
      lines.push((markdown ? '## ' : '') + release.version + ' — ' + dateText)
      lines.push('')
      if (release.entries.length === 0) {
        lines.push(labels.fixed('noChanges'))
        lines.push('')
        continue
      }
      for (var e = 0; e < release.entries.length; e++) {
        var entry = release.entries[e]
        var category =
          entry.category === null
            ? labels.fixed('uncategorized')
            : entry.category
        var suffix =
          entry.commit === null
            ? ''
            : markdown
            ? ' ([`' +
              entry.commit.slice(0, 7) +
              '`](' +
              commitUrl(entry.commit) +
              '))'
            : ' (' + commitUrl(entry.commit) + ')'
        if (markdown) {
          lines.push('- **' + category + '** — ' + entry.text + suffix)
        } else {
          lines.push('- [' + category + '] ' + entry.text + suffix)
        }
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  /** A file name that states the same range the file's header does. */
  function exportFileName(view, extension) {
    var suffix = extension === undefined ? 'md' : extension
    var range
    if (view.earliest === null) {
      range = 'dates-unrecorded'
    } else if (view.earliest === view.latest) {
      range = view.earliest
    } else {
      range = view.earliest + '_' + view.latest
    }
    return 'desktop-material-changelog-' + range + '.' + suffix
  }

  // =====================================================================
  // DOM layer
  // =====================================================================

  var StoreKeys = {
    lang: 'dm-docs-lang',
    funEn: 'dm-docs-fun-en',
    funYue: 'dm-docs-fun-yue',
  }

  var PageSize = 25
  var DefaultWorkerPath = 'assets/site/docs-hub-regex-worker.js'
  var DefaultWeekStart = 1
  /** The shared regex worker's own catalog ceiling, mirrored so this surface
   * can say why regex search is unavailable instead of reporting a bare
   * `invalid-request` as though the reader's pattern were at fault. */
  var MaximumWorkerCatalogEntries = 5000

  /**
   * Guided-construction tokens. `caret` puts the caret back inside the halves.
   *
   * `name` is the localized accessible name: a button whose only text is `.` or
   * `$` is announced as an unnamed button by a screen reader, so the spoken name
   * says what the symbol does and repeats the symbol itself.
   */
  var BuilderTokens = [
    { label: 'a-z', insert: '[a-z]', name: 'tokenLower' },
    { label: '0-9', insert: '[0-9]', name: 'tokenDigitRange' },
    { label: '\\d', insert: '\\d', name: 'tokenDigit' },
    { label: '\\w', insert: '\\w', name: 'tokenWord' },
    { label: '\\s', insert: '\\s', name: 'tokenSpace' },
    { label: '[^…]', insert: '[^]', caret: -1, name: 'tokenNegated' },
    { label: '.', insert: '.', name: 'tokenAny' },
    { label: '^', insert: '^', name: 'tokenStart' },
    { label: '$', insert: '$', name: 'tokenEnd' },
    { label: '\\b', insert: '\\b', name: 'tokenBoundary' },
    { label: '(…)', insert: '()', caret: -1, name: 'tokenGroup' },
    { label: '(?:…)', insert: '(?:)', caret: -1, name: 'tokenNonCapturing' },
    {
      label: '(?<name>…)',
      insert: '(?<name>)',
      caret: -1,
      name: 'tokenNamedGroup',
    },
    { label: 'a|b', insert: '|', name: 'tokenAlternation' },
    { label: '?', insert: '?', name: 'tokenOptional' },
    { label: '*', insert: '*', name: 'tokenStar' },
    { label: '+', insert: '+', name: 'tokenPlus' },
    { label: '{n,m}', insert: '{1,3}', name: 'tokenRepeat' },
  ]

  function readStored(key, fallback) {
    try {
      var value = global.localStorage.getItem(key)
      return value === null ? fallback : value
    } catch (error) {
      return fallback
    }
  }

  /** The repository this site documents; the only place a commit resolves. */
  var CHANGELOG_REPOSITORY_URL =
    'https://github.com/Ding-Ding-Projects/desktop-material'

  /**
   * The web URL for a commit reference.
   *
   * Only a full 40-character SHA is linked: an abbreviated one is ambiguous,
   * and a confidently wrong link is worse for a reader than no link, because
   * there is no way to tell it apart from a commit that merely moved.
   */
  function commitUrl(sha) {
    return CHANGELOG_REPOSITORY_URL + '/commit/' + sha
  }

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text)
    }
    return node
  }

  var idSequence = 0
  function uniqueId(prefix) {
    idSequence++
    return 'dm-changelog-' + prefix + '-' + idSequence
  }

  function todayIso() {
    var now = new Date()
    return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
  }

  /**
   * Builds one viewer inside `container`.
   *
   * The shell is built once and only its *labels* are refreshed when the
   * language mode or a playfulness level changes, so a re-render never steals
   * the caret out of the search box the reader is typing in.
   */
  function mount(container, options) {
    if (container === null || container === undefined) {
      return null
    }
    var settings = options === undefined || options === null ? {} : options
    var catalog =
      settings.catalog === undefined || settings.catalog === null
        ? global.DesktopMaterialDocsChangelogCatalog
        : settings.catalog
    if (catalog === undefined || catalog === null) {
      return null
    }

    var order = orderForLocale(
      settings.locale === undefined
        ? global.navigator && global.navigator.language
        : settings.locale
    )
    var weekStart =
      settings.weekStart === undefined ? DefaultWeekStart : settings.weekStart
    var workerPath =
      settings.workerPath === undefined
        ? DefaultWorkerPath
        : settings.workerPath

    var state = {
      from: null,
      to: null,
      query: '',
      mode: 'plain',
      flags: 'i',
      includeUndated: false,
    }
    /** Raw typed text is kept even when it cannot be parsed. */
    var typed = { from: '', to: '' }
    var shown = PageSize
    var view = null
    var labels = labelsFor('en', 1)
    var bindings = []
    var calendarOpen = false
    var builderOpen = false
    var calendarCursor = null
    var rangeAnchor = null
    var patternNotice = { key: null, values: null, tone: 'info' }
    var actionNotice = { key: null, values: null }

    var runner =
      global.DesktopMaterialRegexJob === undefined
        ? null
        : global.DesktopMaterialRegexJob.create({ workerPath: workerPath })
    var workerCorpus = null
    var pendingClearance = 0

    // ------------------------------------------------------------ labels

    function bindText(node, kind, key) {
      bindings.push({ node: node, kind: kind, key: key, attr: null })
      return node
    }

    function bindAttr(node, attr, key) {
      bindings.push({ node: node, kind: 'fixed', key: key, attr: attr })
      return node
    }

    function currentPrefs() {
      var lang = readStored(StoreKeys.lang, 'en')
      return {
        lang: lang === 'yue' || lang === 'bi' ? lang : 'en',
        funEn: clampLevel(readStored(StoreKeys.funEn, '3')),
        funYue: clampLevel(readStored(StoreKeys.funYue, '3')),
      }
    }

    function refreshLabels() {
      var prefs = currentPrefs()
      var primary = prefs.lang === 'yue' ? 'yue' : 'en'
      var secondary = prefs.lang === 'bi' ? 'yue' : null
      labels = labelsFor(
        primary,
        primary === 'yue' ? prefs.funYue : prefs.funEn
      )
      var secondaryLabels =
        secondary === null ? null : labelsFor('yue', prefs.funYue)

      for (var index = 0; index < bindings.length; index++) {
        var binding = bindings[index]
        var text =
          binding.kind === 'tone'
            ? labels.tone(binding.key)
            : labels.fixed(binding.key, binding.values)
        if (binding.attr !== null) {
          // Accessible names and placeholders stay single-language so they
          // remain short and unambiguous in bilingual mode.
          binding.node.setAttribute(binding.attr, text)
          continue
        }
        var pair = bilingualSpans(binding.node)
        pair.a.textContent = text
        if (secondaryLabels === null) {
          pair.b.textContent = ''
          pair.b.removeAttribute('lang')
        } else {
          pair.b.textContent =
            binding.kind === 'tone'
              ? secondaryLabels.tone(binding.key)
              : secondaryLabels.fixed(binding.key, binding.values)
          pair.b.setAttribute('lang', secondaryLabels.htmlLang)
        }
      }
    }

    /** Mirrors the hub's `.i18n-a` / `.i18n-b` pair so one stylesheet covers both. */
    function bilingualSpans(node) {
      var a = node.querySelector(':scope > .i18n-a')
      var b = node.querySelector(':scope > .i18n-b')
      if (a === null) {
        a = element('span', 'i18n-a')
        b = element('span', 'i18n-b')
        node.textContent = ''
        node.appendChild(a)
        node.appendChild(b)
      }
      return { a: a, b: b }
    }

    // ------------------------------------------------------------- shell

    var root = element('section', 'dm-changelog')
    var headingId = uniqueId('heading')
    root.setAttribute('aria-labelledby', headingId)

    var heading = element('h2', 'dm-changelog-heading')
    heading.id = headingId
    bindText(heading, 'tone', 'heading')
    root.appendChild(heading)

    var blurb = element('p', 'dm-changelog-blurb')
    bindText(blurb, 'tone', 'blurb')
    root.appendChild(blurb)

    var sourceNote = element('p', 'dm-changelog-source')
    bindings.push({
      node: sourceNote,
      kind: 'fixed',
      key: 'catalogNote',
      attr: null,
      values: {
        dated: catalog.datedCount,
        total: catalog.versionCount,
        unrecorded: catalog.unrecordedCount,
      },
    })
    root.appendChild(sourceNote)

    var controls = element('div', 'dm-changelog-controls')
    root.appendChild(controls)

    // --- search

    var searchGroup = element('div', 'dm-changelog-group')
    controls.appendChild(searchGroup)

    var searchLegend = element('h3', 'dm-changelog-group-title')
    bindText(searchLegend, 'fixed', 'searchLegend')
    searchGroup.appendChild(searchLegend)

    var searchRow = element('div', 'dm-changelog-search-row')
    searchGroup.appendChild(searchRow)

    var searchLabel = element('label', 'dm-changelog-label')
    var searchId = uniqueId('search')
    searchLabel.setAttribute('for', searchId)
    bindText(searchLabel, 'fixed', 'searchLabel')
    searchRow.appendChild(searchLabel)

    var searchField = element('div', 'dm-changelog-field')
    searchRow.appendChild(searchField)

    var searchInput = element('input', 'dm-changelog-input')
    searchInput.id = searchId
    searchInput.type = 'search'
    searchInput.setAttribute('autocomplete', 'off')
    searchInput.setAttribute('spellcheck', 'false')
    searchInput.setAttribute('maxlength', String(MaximumQueryLength))
    bindAttr(searchInput, 'placeholder', 'searchPlaceholder')
    searchField.appendChild(searchInput)

    var searchClear = element('button', 'dm-changelog-icon-button', '×')
    searchClear.type = 'button'
    bindAttr(searchClear, 'aria-label', 'searchClear')
    bindAttr(searchClear, 'title', 'searchClear')
    searchField.appendChild(searchClear)

    var modeGroup = element('div', 'dm-changelog-modes')
    modeGroup.setAttribute('role', 'group')
    bindAttr(modeGroup, 'aria-label', 'modeGroup')
    searchGroup.appendChild(modeGroup)

    var modePlain = element('button', 'dm-changelog-chip')
    modePlain.type = 'button'
    modePlain.setAttribute('aria-pressed', 'true')
    bindText(modePlain, 'fixed', 'modePlain')
    modeGroup.appendChild(modePlain)

    var modeRegex = element('button', 'dm-changelog-chip')
    modeRegex.type = 'button'
    modeRegex.setAttribute('aria-pressed', 'false')
    bindText(modeRegex, 'fixed', 'modeRegex')
    modeGroup.appendChild(modeRegex)

    var builderToggle = element('button', 'dm-changelog-chip')
    builderToggle.type = 'button'
    builderToggle.setAttribute('aria-expanded', 'false')
    bindText(builderToggle, 'fixed', 'builderShow')
    modeGroup.appendChild(builderToggle)

    var modeHint = element('p', 'dm-changelog-hint')
    bindText(modeHint, 'fixed', 'modeHint')
    searchGroup.appendChild(modeHint)

    var patternStatus = element('p', 'dm-changelog-status')
    patternStatus.setAttribute('role', 'status')
    patternStatus.setAttribute('aria-live', 'polite')
    searchGroup.appendChild(patternStatus)

    // The builder is anchored directly beneath the field it belongs to, so the
    // pattern is always built next to the search box that will run it.
    var builder = element('div', 'dm-changelog-builder')
    builder.id = uniqueId('builder')
    builder.setAttribute('hidden', '')
    bindAttr(builder, 'aria-label', 'builderLabel')
    builder.setAttribute('role', 'group')
    builderToggle.setAttribute('aria-controls', builder.id)
    searchGroup.appendChild(builder)

    var builderNote = element('p', 'dm-changelog-hint')
    bindText(builderNote, 'fixed', 'builderNote')
    builder.appendChild(builderNote)

    var builderTokens = element('div', 'dm-changelog-tokens')
    bindAttr(builderTokens, 'aria-label', 'builderInsert')
    builderTokens.setAttribute('role', 'group')
    builder.appendChild(builderTokens)

    var literalRow = element('div', 'dm-changelog-literal')
    builder.appendChild(literalRow)

    var literalLabel = element('label', 'dm-changelog-label')
    var literalId = uniqueId('literal')
    literalLabel.setAttribute('for', literalId)
    bindText(literalLabel, 'fixed', 'builderLiteralLabel')
    literalRow.appendChild(literalLabel)

    var literalInput = element('input', 'dm-changelog-input')
    literalInput.id = literalId
    literalInput.type = 'text'
    literalInput.setAttribute('maxlength', String(MaximumQueryLength))
    literalRow.appendChild(literalInput)

    var literalButton = element('button', 'dm-changelog-button')
    literalButton.type = 'button'
    bindText(literalButton, 'fixed', 'builderLiteral')
    literalRow.appendChild(literalButton)

    var literalHint = element('p', 'dm-changelog-hint')
    bindText(literalHint, 'fixed', 'builderLiteralHint')
    builder.appendChild(literalHint)

    var flagsRow = element('div', 'dm-changelog-flags')
    flagsRow.setAttribute('role', 'group')
    bindAttr(flagsRow, 'aria-label', 'flagsGroup')
    builder.appendChild(flagsRow)

    var flagInputs = {}
    var flagKeys = [
      ['i', 'flagI'],
      ['m', 'flagM'],
      ['s', 'flagS'],
      ['u', 'flagU'],
    ]
    for (var flagIndex = 0; flagIndex < flagKeys.length; flagIndex++) {
      flagsRow.appendChild(
        buildFlagToggle(flagKeys[flagIndex][0], flagKeys[flagIndex][1])
      )
    }

    var engineNote = element('p', 'dm-changelog-hint')
    bindText(engineNote, 'fixed', 'engineNote')
    builder.appendChild(engineNote)

    function buildFlagToggle(flag, key) {
      var wrapper = element('label', 'dm-changelog-check')
      var input = element('input')
      input.type = 'checkbox'
      input.checked = state.flags.indexOf(flag) !== -1
      var text = element('span')
      bindText(text, 'fixed', key)
      wrapper.appendChild(input)
      wrapper.appendChild(text)
      flagInputs[flag] = input
      input.addEventListener('change', function () {
        var next = ''
        for (var index = 0; index < flagKeys.length; index++) {
          if (flagInputs[flagKeys[index][0]].checked) {
            next += flagKeys[index][0]
          }
        }
        state.flags = normalizeFlags(next)
        shown = PageSize
        evaluate()
      })
      return wrapper
    }

    // --- date filter

    var dateGroup = element('div', 'dm-changelog-group')
    controls.appendChild(dateGroup)

    var dateLegend = element('h3', 'dm-changelog-group-title')
    bindText(dateLegend, 'fixed', 'dateLegend')
    dateGroup.appendChild(dateLegend)

    var dateRow = element('div', 'dm-changelog-date-row')
    dateGroup.appendChild(dateRow)

    var fromControl = buildDateInput('from', 'dateFrom')
    var toControl = buildDateInput('to', 'dateTo')
    dateRow.appendChild(fromControl.wrapper)
    dateRow.appendChild(toControl.wrapper)

    var calendarToggle = element('button', 'dm-changelog-button')
    calendarToggle.type = 'button'
    calendarToggle.setAttribute('aria-expanded', 'false')
    bindText(calendarToggle, 'fixed', 'calendarOpen')
    dateRow.appendChild(calendarToggle)

    var dateHint = element('p', 'dm-changelog-hint')
    bindings.push({
      node: dateHint,
      kind: 'fixed',
      key: 'dateHint',
      attr: null,
      values: { localeExample: localeExample(order) },
    })
    dateGroup.appendChild(dateHint)

    var presets = element('div', 'dm-changelog-presets')
    presets.setAttribute('role', 'group')
    bindAttr(presets, 'aria-label', 'presetsLabel')
    dateGroup.appendChild(presets)

    var presetKeys = {
      last30: 'preset30',
      last90: 'preset90',
      thisYear: 'presetYear',
      lastYear: 'presetPrevYear',
      all: 'presetAll',
    }
    for (var presetIndex = 0; presetIndex < PresetIds.length; presetIndex++) {
      presets.appendChild(buildPreset(PresetIds[presetIndex]))
    }

    function buildPreset(id) {
      var button = element('button', 'dm-changelog-chip')
      button.type = 'button'
      bindText(button, 'fixed', presetKeys[id])
      button.addEventListener('click', function () {
        var range = presetRange(id, todayIso())
        if (range === null) {
          return
        }
        applyRange(range.from, range.to)
      })
      return button
    }

    var undatedRow = element('label', 'dm-changelog-check')
    var undatedInput = element('input')
    undatedInput.type = 'checkbox'
    var undatedText = element('span')
    bindText(undatedText, 'fixed', 'includeUndated')
    undatedRow.appendChild(undatedInput)
    undatedRow.appendChild(undatedText)
    dateGroup.appendChild(undatedRow)

    var undatedNote = element('p', 'dm-changelog-hint')
    bindText(undatedNote, 'fixed', 'includeUndatedNote')
    dateGroup.appendChild(undatedNote)

    var calendar = buildCalendar()
    dateGroup.appendChild(calendar.wrapper)
    calendarToggle.setAttribute('aria-controls', calendar.wrapper.id)

    function buildDateInput(which, labelKey) {
      var wrapper = element('div', 'dm-changelog-date-field')
      var label = element('label', 'dm-changelog-label')
      var id = uniqueId(which)
      label.setAttribute('for', id)
      bindText(label, 'fixed', labelKey)
      var input = element('input', 'dm-changelog-input')
      input.id = id
      input.type = 'text'
      input.setAttribute('inputmode', 'numeric')
      input.setAttribute('autocomplete', 'off')
      input.setAttribute('maxlength', String(MaximumTypedDateLength))
      bindAttr(input, 'placeholder', 'datePlaceholder')
      var errorId = id + '-message'
      var message = element('p', 'dm-changelog-error')
      message.id = errorId
      message.setAttribute('role', 'status')
      message.setAttribute('aria-live', 'polite')
      input.setAttribute('aria-describedby', errorId)
      wrapper.appendChild(label)
      wrapper.appendChild(input)
      wrapper.appendChild(message)

      var control = {
        wrapper: wrapper,
        input: input,
        message: message,
        messageKey: null,
      }

      input.addEventListener('input', function () {
        // The reader's text is never rewritten or cleared here; only the
        // filter state and the inline message change.
        typed[which] = input.value
        var parsed = parseTypedDate(input.value, { order: order })
        control.messageKey = parsed.messageKey
        if (parsed.status === 'ok') {
          state[which] = parsed.iso
        } else if (parsed.status === 'empty') {
          state[which] = null
        }
        shown = PageSize
        evaluate()
      })
      return control
    }

    function applyRange(from, to) {
      state.from = from
      state.to = to
      typed.from = from === null ? '' : from
      typed.to = to === null ? '' : to
      fromControl.input.value = typed.from
      toControl.input.value = typed.to
      fromControl.messageKey = null
      toControl.messageKey = null
      rangeAnchor = null
      shown = PageSize
      evaluate()
    }

    // --- calendar

    function buildCalendar() {
      var wrapper = element('div', 'dm-changelog-calendar')
      wrapper.id = uniqueId('calendar')
      wrapper.setAttribute('hidden', '')
      wrapper.setAttribute('role', 'group')
      bindAttr(wrapper, 'aria-label', 'calendarLabel')

      var head = element('div', 'dm-changelog-calendar-head')
      wrapper.appendChild(head)

      var previous = element('button', 'dm-changelog-icon-button', '‹')
      previous.type = 'button'
      bindAttr(previous, 'aria-label', 'calendarPrev')
      head.appendChild(previous)

      var monthLabel = element('label', 'dm-changelog-visually-hidden')
      var monthId = uniqueId('month')
      monthLabel.setAttribute('for', monthId)
      bindText(monthLabel, 'fixed', 'calendarMonth')
      var monthSelect = element('select', 'dm-changelog-select')
      monthSelect.id = monthId
      head.appendChild(monthLabel)
      head.appendChild(monthSelect)

      var yearLabel = element('label', 'dm-changelog-visually-hidden')
      var yearId = uniqueId('year')
      yearLabel.setAttribute('for', yearId)
      bindText(yearLabel, 'fixed', 'calendarYear')
      var yearSelect = element('select', 'dm-changelog-select')
      yearSelect.id = yearId
      head.appendChild(yearLabel)
      head.appendChild(yearSelect)

      var next = element('button', 'dm-changelog-icon-button', '›')
      next.type = 'button'
      bindAttr(next, 'aria-label', 'calendarNext')
      head.appendChild(next)

      var grid = element('div', 'dm-changelog-grid')
      grid.setAttribute('role', 'grid')
      wrapper.appendChild(grid)

      var hint = element('p', 'dm-changelog-hint')
      wrapper.appendChild(hint)

      var selected = element('p', 'dm-changelog-status')
      selected.setAttribute('role', 'status')
      selected.setAttribute('aria-live', 'polite')
      wrapper.appendChild(selected)

      var footer = element('div', 'dm-changelog-calendar-foot')
      wrapper.appendChild(footer)

      var clear = element('button', 'dm-changelog-button')
      clear.type = 'button'
      bindText(clear, 'fixed', 'calendarClear')
      footer.appendChild(clear)

      var done = element('button', 'dm-changelog-button')
      done.type = 'button'
      bindText(done, 'fixed', 'calendarDone')
      footer.appendChild(done)

      // Year choices come from the catalog's own dated releases plus today, so
      // the picker never offers a year the history does not reach.
      var bounds = catalogYearBounds()

      for (var month = 1; month <= 12; month++) {
        var monthOption = element('option')
        monthOption.value = String(month)
        monthSelect.appendChild(monthOption)
      }
      for (var year = bounds.last; year >= bounds.first; year--) {
        var yearOption = element('option', null, String(year))
        yearOption.value = String(year)
        yearSelect.appendChild(yearOption)
      }

      // Escape dismisses the calendar from anywhere inside it, not only from a
      // day button: the month and year selects, the arrows and the footer are
      // all reachable by keyboard and all need the same way out.
      wrapper.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !calendarOpen) {
          return
        }
        setCalendarOpen(false)
        calendarToggle.focus()
        event.preventDefault()
      })

      previous.addEventListener('click', function () {
        moveCursorMonths(-1)
      })
      next.addEventListener('click', function () {
        moveCursorMonths(1)
      })
      monthSelect.addEventListener('change', function () {
        setCursor(calendarCursor.year, parseInt(monthSelect.value, 10))
      })
      yearSelect.addEventListener('change', function () {
        setCursor(parseInt(yearSelect.value, 10), calendarCursor.month)
      })
      clear.addEventListener('click', function () {
        applyRange(null, null)
      })
      done.addEventListener('click', function () {
        setCalendarOpen(false)
        calendarToggle.focus()
      })

      return {
        wrapper: wrapper,
        monthSelect: monthSelect,
        yearSelect: yearSelect,
        grid: grid,
        hint: hint,
        selected: selected,
        bounds: bounds,
      }
    }

    function catalogYearBounds() {
      var first = null
      var last = null
      var releases = Array.isArray(catalog.releases) ? catalog.releases : []
      for (var index = 0; index < releases.length; index++) {
        var date = releases[index].d
        if (typeof date !== 'string') {
          continue
        }
        var year = parseInt(date.slice(0, 4), 10)
        if (first === null || year < first) {
          first = year
        }
        if (last === null || year > last) {
          last = year
        }
      }
      var current = parseInt(todayIso().slice(0, 4), 10)
      if (first === null) {
        first = current
      }
      if (last === null || last < current) {
        last = current
      }
      return { first: first, last: last }
    }

    function setCursor(year, month) {
      var clampedYear = year
      if (clampedYear < calendar.bounds.first) {
        clampedYear = calendar.bounds.first
      }
      if (clampedYear > calendar.bounds.last) {
        clampedYear = calendar.bounds.last
      }
      calendarCursor = { year: clampedYear, month: month }
      renderCalendar()
    }

    function moveCursorMonths(delta) {
      var month = calendarCursor.month + delta
      var year = calendarCursor.year
      while (month < 1) {
        month += 12
        year--
      }
      while (month > 12) {
        month -= 12
        year++
      }
      setCursor(year, month)
    }

    function setCalendarOpen(open) {
      calendarOpen = open
      calendarToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      bindingFor(calendarToggle).key = open ? 'calendarClose' : 'calendarOpen'
      if (open) {
        calendar.wrapper.removeAttribute('hidden')
        if (calendarCursor === null) {
          var anchor = state.from !== null ? state.from : state.to
          var parts = anchor === null ? parseIso(todayIso()) : parseIso(anchor)
          calendarCursor = { year: parts.year, month: parts.month }
        }
        renderCalendar()
      } else {
        calendar.wrapper.setAttribute('hidden', '')
      }
      refreshLabels()
    }

    function bindingFor(node) {
      for (var index = 0; index < bindings.length; index++) {
        if (bindings[index].node === node && bindings[index].attr === null) {
          return bindings[index]
        }
      }
      return { key: null }
    }

    function renderCalendar() {
      if (!calendarOpen || calendarCursor === null) {
        return
      }
      var monthOptions = calendar.monthSelect.options
      for (var m = 0; m < monthOptions.length; m++) {
        monthOptions[m].textContent = labels.months[m]
      }
      calendar.monthSelect.value = String(calendarCursor.month)
      calendar.yearSelect.value = String(calendarCursor.year)

      // The grid is a composite widget, so it needs its own name: without one a
      // screen reader announces a bare "grid" and never says which month it is
      // showing. The name is rebuilt here so it follows the cursor and the
      // language mode.
      calendar.grid.setAttribute(
        'aria-label',
        labels.fixed('calendarGrid', {
          month: labels.months[calendarCursor.month - 1],
          year: calendarCursor.year,
        })
      )

      calendar.grid.textContent = ''
      var headRow = element('div', 'dm-changelog-grid-row')
      headRow.setAttribute('role', 'row')
      for (var w = 0; w < 7; w++) {
        // The weekday tables start on Monday; a Sunday-first grid rotates them.
        var dayIndex = weekStart === 0 ? (w + 6) % 7 : w
        var headCell = element(
          'span',
          'dm-changelog-grid-head',
          labels.weekdaysShort[dayIndex]
        )
        headCell.setAttribute('role', 'columnheader')
        headCell.setAttribute('aria-label', labels.weekdaysLong[dayIndex])
        headRow.appendChild(headCell)
      }
      calendar.grid.appendChild(headRow)

      var weeks = monthMatrix(
        calendarCursor.year,
        calendarCursor.month,
        weekStart
      )
      var today = todayIso()
      for (var week = 0; week < weeks.length; week++) {
        var row = element('div', 'dm-changelog-grid-row')
        row.setAttribute('role', 'row')
        for (var day = 0; day < weeks[week].length; day++) {
          row.appendChild(buildDayCell(weeks[week][day], today))
        }
        calendar.grid.appendChild(row)
      }
      // One tab stop for the whole grid; the arrow keys move within it.
      updateGridTabStops(gridFocusTarget(today))

      calendar.hint.textContent = labels.fixed(
        rangeAnchor === null ? 'calendarPickStart' : 'calendarPickEnd'
      )
      calendar.selected.textContent =
        state.from === null && state.to === null
          ? labels.fixed('calendarNoSelection')
          : labels.fixed('calendarSelected', {
              description: rangeDescription(),
            })
    }

    function buildDayCell(cell, today) {
      var wrapper = element('span', 'dm-changelog-grid-cell')
      wrapper.setAttribute('role', 'gridcell')
      var button = element('button', 'dm-changelog-day', String(cell.day))
      button.type = 'button'
      button.setAttribute('data-iso', cell.iso)
      button.setAttribute('aria-label', cell.iso)
      if (!cell.inMonth) {
        button.className = 'dm-changelog-day dm-changelog-day-outside'
      }
      if (cell.iso === today) {
        button.setAttribute('aria-current', 'date')
      }
      var inRange =
        state.from !== null &&
        state.to !== null &&
        withinRange(cell.iso, state.from, state.to)
      var isEdge = cell.iso === state.from || cell.iso === state.to
      button.setAttribute('aria-pressed', isEdge || inRange ? 'true' : 'false')
      if (isEdge) {
        button.setAttribute('data-edge', 'true')
      }
      button.addEventListener('click', function () {
        pickDay(cell.iso)
      })
      button.addEventListener('keydown', function (event) {
        handleGridKey(event, cell.iso)
      })
      wrapper.appendChild(button)
      return wrapper
    }

    /**
     * Click one: range start. Click two: range end. Earlier day: start over.
     *
     * Picking rebuilds the whole grid, which destroys the very button that was
     * activated. A keyboard reader would be dropped back to the top of the
     * document mid-range, so focus is put back on the day that was picked.
     */
    function pickDay(iso) {
      var keepFocus = calendar.grid.contains(document.activeElement)
      if (rangeAnchor === null || compareIso(iso, rangeAnchor) < 0) {
        rangeAnchor = iso
        applyRange(iso, iso)
        rangeAnchor = iso
        renderCalendar()
        restoreDayFocus(iso, keepFocus)
        return
      }
      applyRange(rangeAnchor, iso)
      rangeAnchor = null
      renderCalendar()
      restoreDayFocus(iso, keepFocus)
    }

    /** Only ever *restores* focus: a pick made with the mouse elsewhere on the
     * page never has focus yanked into the grid. */
    function restoreDayFocus(iso, keepFocus) {
      if (keepFocus) {
        focusDay(iso)
      }
    }

    function handleGridKey(event, iso) {
      var delta = 0
      if (event.key === 'ArrowLeft') {
        delta = -1
      } else if (event.key === 'ArrowRight') {
        delta = 1
      } else if (event.key === 'ArrowUp') {
        delta = -7
      } else if (event.key === 'ArrowDown') {
        delta = 7
      } else if (event.key === 'Home') {
        delta = -parseIso(iso).day + 1
      } else if (event.key === 'End') {
        delta =
          daysInMonth(parseIso(iso).year, parseIso(iso).month) -
          parseIso(iso).day
      } else if (event.key === 'PageUp') {
        moveCursorMonths(-1)
        focusFirstDay()
        event.preventDefault()
        return
      } else if (event.key === 'PageDown') {
        moveCursorMonths(1)
        focusFirstDay()
        event.preventDefault()
        return
      } else if (event.key === 'Escape') {
        setCalendarOpen(false)
        calendarToggle.focus()
        event.preventDefault()
        return
      } else {
        return
      }
      event.preventDefault()
      var target = shiftIso(iso, delta)
      var parts = parseIso(target)
      if (
        parts.year !== calendarCursor.year ||
        parts.month !== calendarCursor.month
      ) {
        setCursor(parts.year, parts.month)
      }
      focusDay(target)
    }

    /** Prefers the range start, then today, then the first day of the month. */
    function gridFocusTarget(today) {
      if (state.from !== null && dayButton(state.from) !== null) {
        return state.from
      }
      if (dayButton(today) !== null) {
        return today
      }
      return isoFromParts(calendarCursor.year, calendarCursor.month, 1)
    }

    function dayButton(iso) {
      return calendar.grid.querySelector('[data-iso="' + iso + '"]')
    }

    function updateGridTabStops(iso) {
      var buttons = calendar.grid.querySelectorAll('.dm-changelog-day')
      for (var index = 0; index < buttons.length; index++) {
        buttons[index].setAttribute(
          'tabindex',
          buttons[index].getAttribute('data-iso') === iso ? '0' : '-1'
        )
      }
    }

    function focusDay(iso) {
      var button = dayButton(iso)
      if (button !== null) {
        updateGridTabStops(iso)
        button.focus()
      }
    }

    function focusFirstDay() {
      focusDay(isoFromParts(calendarCursor.year, calendarCursor.month, 1))
    }

    function rangeDescription() {
      if (state.from !== null && state.to !== null) {
        return state.from === state.to
          ? state.from
          : state.from + ' – ' + state.to
      }
      if (state.from !== null) {
        return labels.fixed('exportFilterFrom', { from: state.from })
      }
      if (state.to !== null) {
        return labels.fixed('exportFilterTo', { to: state.to })
      }
      return labels.fixed('dateInactive')
    }

    // --- actions, status, results

    var actions = element('div', 'dm-changelog-actions')
    actions.setAttribute('role', 'group')
    bindAttr(actions, 'aria-label', 'actionsLabel')
    root.appendChild(actions)

    var copyButton = element('button', 'dm-changelog-button')
    copyButton.type = 'button'
    bindText(copyButton, 'fixed', 'copy')
    actions.appendChild(copyButton)

    var exportButton = element('button', 'dm-changelog-button')
    exportButton.type = 'button'
    bindText(exportButton, 'fixed', 'exportMarkdown')
    actions.appendChild(exportButton)

    var clearButton = element('button', 'dm-changelog-button')
    clearButton.type = 'button'
    bindText(clearButton, 'fixed', 'clearAll')
    actions.appendChild(clearButton)

    var copyNote = element('p', 'dm-changelog-hint')
    bindText(copyNote, 'fixed', 'copyNote')
    root.appendChild(copyNote)

    var exportNote = element('p', 'dm-changelog-hint')
    bindText(exportNote, 'fixed', 'exportNote')
    root.appendChild(exportNote)

    var actionStatus = element('p', 'dm-changelog-status')
    actionStatus.setAttribute('role', 'status')
    actionStatus.setAttribute('aria-live', 'polite')
    root.appendChild(actionStatus)

    var summary = element('div', 'dm-changelog-summary')
    summary.setAttribute('role', 'status')
    summary.setAttribute('aria-live', 'polite')
    root.appendChild(summary)

    var list = element('ol', 'dm-changelog-list')
    root.appendChild(list)

    var empty = element('div', 'dm-changelog-empty')
    empty.setAttribute('hidden', '')
    root.appendChild(empty)

    var moreButton = element('button', 'dm-changelog-button dm-changelog-more')
    moreButton.type = 'button'
    moreButton.setAttribute('hidden', '')
    root.appendChild(moreButton)

    container.appendChild(root)

    // ------------------------------------------------------------ wiring

    searchInput.addEventListener('input', function () {
      state.query = searchInput.value
      shown = PageSize
      evaluate()
    })
    searchClear.addEventListener('click', function () {
      searchInput.value = ''
      state.query = ''
      shown = PageSize
      evaluate()
      searchInput.focus()
    })
    modePlain.addEventListener('click', function () {
      setMode('plain')
    })
    modeRegex.addEventListener('click', function () {
      setMode('regex')
    })
    builderToggle.addEventListener('click', function () {
      builderOpen = !builderOpen
      if (builderOpen) {
        builder.removeAttribute('hidden')
      } else {
        builder.setAttribute('hidden', '')
      }
      builderToggle.setAttribute(
        'aria-expanded',
        builderOpen ? 'true' : 'false'
      )
      bindingFor(builderToggle).key = builderOpen
        ? 'builderHide'
        : 'builderShow'
      refreshLabels()
    })
    literalButton.addEventListener('click', function () {
      insertPattern(escapeRegex(literalInput.value), 0)
    })
    calendarToggle.addEventListener('click', function () {
      setCalendarOpen(!calendarOpen)
    })
    undatedInput.addEventListener('change', function () {
      state.includeUndated = undatedInput.checked
      shown = PageSize
      evaluate()
    })
    clearButton.addEventListener('click', function () {
      searchInput.value = ''
      state.query = ''
      applyRange(null, null)
      searchInput.focus()
    })
    copyButton.addEventListener('click', copyCurrentView)
    exportButton.addEventListener('click', exportCurrentView)
    moreButton.addEventListener('click', function () {
      var firstNew = shown
      shown += PageSize
      renderResults()
      if (moreButton.hasAttribute('hidden')) {
        // The last page hides the button, and focusing a hidden element does
        // nothing — a keyboard reader would be dropped to the top of the
        // document. Park focus on the first release that was just revealed.
        focusRelease(firstNew)
        return
      }
      moreButton.focus()
    })

    /** Moves focus to the heading of the release at `index`, if it is listed. */
    function focusRelease(index) {
      var items = list.querySelectorAll('.dm-changelog-release')
      var target =
        items[index] === undefined ? items[items.length - 1] : items[index]
      if (target === undefined) {
        return
      }
      var heading = target.querySelector('.dm-changelog-version')
      var node = heading === null ? target : heading
      node.setAttribute('tabindex', '-1')
      node.focus()
    }

    for (var tokenIndex = 0; tokenIndex < BuilderTokens.length; tokenIndex++) {
      builderTokens.appendChild(buildToken(BuilderTokens[tokenIndex]))
    }

    function buildToken(token) {
      var button = element('button', 'dm-changelog-token', token.label)
      button.type = 'button'
      // Bound rather than set once, so the spoken name follows the language mode.
      bindAttr(button, 'aria-label', token.name)
      bindAttr(button, 'title', token.name)
      button.addEventListener('click', function () {
        insertPattern(token.insert, token.caret === undefined ? 0 : token.caret)
      })
      return button
    }

    /** Inserting a token switches the search to regex mode, never silently. */
    function insertPattern(text, caretShift) {
      if (text === '') {
        return
      }
      if (state.mode !== 'regex') {
        setMode('regex', true)
      }
      var start = searchInput.selectionStart
      var end = searchInput.selectionEnd
      if (start === null || start === undefined) {
        start = searchInput.value.length
        end = start
      }
      var next =
        searchInput.value.slice(0, start) + text + searchInput.value.slice(end)
      searchInput.value = next.slice(0, MaximumQueryLength)
      state.query = searchInput.value
      var caret = start + text.length + caretShift
      searchInput.focus()
      try {
        searchInput.setSelectionRange(caret, caret)
      } catch (error) {
        /* Some input types refuse selection ranges; the value is still correct. */
      }
      shown = PageSize
      evaluate()
    }

    function setMode(mode, keepFocus) {
      state.mode = mode === 'regex' ? 'regex' : 'plain'
      modePlain.setAttribute(
        'aria-pressed',
        state.mode === 'plain' ? 'true' : 'false'
      )
      modeRegex.setAttribute(
        'aria-pressed',
        state.mode === 'regex' ? 'true' : 'false'
      )
      if (keepFocus !== true) {
        shown = PageSize
        evaluate()
      }
    }

    // ------------------------------------------------- evaluation pipeline

    function corpus() {
      if (workerCorpus !== null) {
        return workerCorpus
      }
      var releases = Array.isArray(catalog.releases) ? catalog.releases : []
      workerCorpus = []
      for (var index = 0; index < releases.length; index++) {
        var entries = Array.isArray(releases[index].e) ? releases[index].e : []
        if (entries.length === 0) {
          workerCorpus.push([releases[index].v, '', ''])
          continue
        }
        for (var e = 0; e < entries.length; e++) {
          workerCorpus.push([
            releases[index].v,
            entries[e][0] === null ? '' : entries[e][0],
            entries[e][1],
          ])
        }
      }
      return workerCorpus
    }

    /**
     * Terminates a clearance the reader has already moved on from. Bumping the
     * token alone is enough to make a late answer inert; terminating the worker
     * as well stops an abandoned pattern from burning the rest of its deadline
     * for a result nobody will read.
     */
    function cancelClearance() {
      if (runner !== null) {
        runner.cancel('changelog')
      }
    }

    /**
     * Plain-text search filters immediately. A regular expression is only
     * *executed* here once the isolated worker has finished the very same
     * pattern over the very same corpus inside its deadline — the page never
     * gambles on a pattern it has not seen terminate.
     */
    function evaluate() {
      // Every evaluation invalidates any clearance still in flight. Without
      // this, a worker answering for a pattern the reader has already changed,
      // cleared or switched out of regex mode would still write its results and
      // its “pattern is valid” notice over the newer ones — the list would then
      // disagree with the search box the reader is looking at.
      var request = ++pendingClearance
      var compiled = compilePattern(state.query, state.mode, state.flags)
      if (!compiled.ok) {
        cancelClearance()
        patternNotice =
          compiled.error === 'too-long'
            ? {
                key: 'patternTooLong',
                values: { limit: MaximumQueryLength },
                tone: 'error',
              }
            : {
                key: 'patternInvalid',
                values: { detail: compiled.detail },
                tone: 'error',
              }
        view = filterReleases(catalog, state, null)
        render()
        return
      }
      if (state.mode !== 'regex' || compiled.empty) {
        cancelClearance()
        patternNotice = { key: null, values: null, tone: 'info' }
        view = filterReleases(catalog, state, compiled.matcher)
        render()
        return
      }
      if (runner === null) {
        patternNotice = {
          key: 'patternUnavailable',
          values: null,
          tone: 'error',
        }
        view = emptyView()
        render()
        return
      }

      var subjects = corpus()
      if (subjects.length > MaximumWorkerCatalogEntries) {
        cancelClearance()
        // The shared evaluator refuses an oversized corpus, and an unproven
        // pattern is never executed here as a consolation prize.
        patternNotice = {
          key: 'patternCorpusTooLarge',
          values: { limit: MaximumWorkerCatalogEntries },
          tone: 'error',
        }
        view = emptyView()
        render()
        return
      }

      patternNotice = { key: 'patternRunning', values: null, tone: 'info' }
      render()
      var pattern = state.query
      var flags = compiled.flags
      runner.run(
        'changelog',
        {
          operation: 'search',
          pattern: pattern,
          flags: flags,
          catalog: corpus(),
          maximumResults: 1,
          maximumRanges: 1,
        },
        function () {
          if (request !== pendingClearance) {
            return
          }
          // Cleared: this exact pattern terminated over this exact corpus.
          patternNotice = { key: 'patternOk', values: null, tone: 'info' }
          view = filterReleases(catalog, state, compiled.matcher)
          render()
        },
        function (code, detail) {
          if (request !== pendingClearance) {
            return
          }
          if (code === 'timeout') {
            patternNotice = {
              key: 'patternTooSlow',
              values: { budget: runner.budgetMilliseconds },
              tone: 'error',
            }
          } else if (code === 'unavailable') {
            patternNotice = {
              key: 'patternUnavailable',
              values: null,
              tone: 'error',
            }
          } else {
            patternNotice = {
              key: 'patternInvalid',
              values: { detail: detail },
              tone: 'error',
            }
          }
          view = emptyView()
          render()
        }
      )
    }

    /** A view that matched nothing because the pattern could not be run. */
    function emptyView() {
      var blocked = filterReleases(catalog, state, function () {
        return false
      })
      blocked.patternValid = false
      return blocked
    }

    // ------------------------------------------------------------ render

    function render() {
      refreshLabels()
      renderStatus()
      renderResults()
      renderCalendar()
    }

    function renderStatus() {
      // Only write back when the value actually differs: reassigning an
      // identical string moves the caret to the end in some browsers, which
      // would fight the reader mid-word.
      if (fromControl.input.value !== typed.from) {
        fromControl.input.value = typed.from
      }
      if (toControl.input.value !== typed.to) {
        toControl.input.value = typed.to
      }
      undatedInput.checked = state.includeUndated

      renderDateMessage(fromControl)
      renderDateMessage(toControl)

      patternStatus.textContent =
        patternNotice.key === null
          ? ''
          : labels.fixed(patternNotice.key, patternNotice.values)
      patternStatus.className =
        'dm-changelog-status' +
        (patternNotice.tone === 'error' ? ' dm-changelog-status-error' : '')

      actionStatus.textContent =
        actionNotice.key === null
          ? ''
          : labels.fixed(actionNotice.key, actionNotice.values)

      summary.textContent = ''
      var lines = describeView(view, labels)
      // The swap warning is a fact about the filter, not about one field, so it
      // sits with the counts rather than under either input.
      if (
        state.from !== null &&
        state.to !== null &&
        compareIso(state.from, state.to) > 0
      ) {
        lines.push(labels.fixed('dateSwapped'))
      }
      for (var index = 0; index < lines.length; index++) {
        summary.appendChild(
          element('p', 'dm-changelog-summary-line', lines[index])
        )
      }
    }

    function renderDateMessage(control) {
      control.message.textContent =
        control.messageKey === null
          ? ''
          : labels.fixed(control.messageKey, {
              localeExample: localeExample(order),
            })
      control.input.setAttribute(
        'aria-invalid',
        control.messageKey === null ? 'false' : 'true'
      )
    }

    function renderResults() {
      list.textContent = ''
      if (view.releaseCount === 0) {
        list.setAttribute('hidden', '')
        moreButton.setAttribute('hidden', '')
        empty.removeAttribute('hidden')
        empty.textContent = ''
        empty.appendChild(
          element('p', 'dm-changelog-empty-lead', labels.tone('emptyLead'))
        )
        empty.appendChild(
          element('p', 'dm-changelog-empty-facts', labels.fixed('emptyFacts'))
        )
        var filters = describeFilters(view, labels)
        for (var f = 0; f < filters.length; f++) {
          empty.appendChild(
            element('p', 'dm-changelog-empty-facts', filters[f])
          )
        }
        return
      }

      empty.setAttribute('hidden', '')
      list.removeAttribute('hidden')
      var limit = shown < view.releaseCount ? shown : view.releaseCount
      for (var index = 0; index < limit; index++) {
        list.appendChild(buildReleaseItem(view.releases[index]))
      }
      if (limit < view.releaseCount) {
        var remaining = view.releaseCount - limit
        moreButton.textContent = labels.fixed('showMore', {
          count: remaining < PageSize ? remaining : PageSize,
        })
        moreButton.removeAttribute('hidden')
      } else {
        moreButton.setAttribute('hidden', '')
      }
    }

    function buildReleaseItem(release) {
      var item = element('li', 'dm-changelog-release')
      var header = element('div', 'dm-changelog-release-head')
      // Version and date are facts: rendered verbatim, never restyled by tone.
      header.appendChild(element('h3', 'dm-changelog-version', release.version))
      if (release.date === null) {
        var unrecorded = element(
          'span',
          'dm-changelog-date dm-changelog-date-unrecorded',
          labels.fixed('dateUnrecorded')
        )
        unrecorded.setAttribute('title', labels.fixed('dateUnrecordedNote'))
        header.appendChild(unrecorded)
      } else {
        var stampText =
          typeof release.time === 'string' && release.time.length > 0
            ? release.date + ' ' + release.time
            : release.date
        var stamp = element('time', 'dm-changelog-date', stampText)
        // datetime carries the machine-readable form: date alone when no time
        // was recorded, otherwise a local date-and-time both halves agree with.
        stamp.setAttribute(
          'datetime',
          typeof release.time === 'string' && release.time.length > 0
            ? release.date + 'T' + release.time
            : release.date
        )
        header.appendChild(stamp)
      }
      header.appendChild(
        element(
          'span',
          'dm-changelog-count',
          release.entries.length === 1
            ? labels.fixed('entryCountOne')
            : labels.fixed('entryCount', { count: release.entries.length })
        )
      )
      item.appendChild(header)

      if (release.versionMatch && state.query !== '') {
        item.appendChild(
          element('p', 'dm-changelog-note', labels.fixed('matchedVersion'))
        )
      }

      if (release.entries.length === 0) {
        item.appendChild(
          element('p', 'dm-changelog-note', labels.fixed('noChanges'))
        )
        return item
      }

      var entries = element('ul', 'dm-changelog-entries')
      for (var index = 0; index < release.entries.length; index++) {
        var entry = release.entries[index]
        var row = element('li', 'dm-changelog-entry')
        var category = element(
          'span',
          'dm-changelog-category',
          entry.category === null
            ? labels.fixed('uncategorized')
            : entry.category
        )
        category.setAttribute(
          'data-category',
          entry.category === null ? 'none' : entry.category.toLowerCase()
        )
        row.appendChild(category)
        row.appendChild(element('span', 'dm-changelog-text', entry.text))
        if (entry.commit !== null && /^[0-9a-f]{40}$/.test(entry.commit)) {
          var link = element(
            'a',
            'dm-changelog-commit',
            entry.commit.slice(0, 7)
          )
          link.setAttribute('href', commitUrl(entry.commit))
          link.setAttribute('rel', 'noopener noreferrer')
          link.setAttribute('target', '_blank')
          link.setAttribute('title', labels.fixed('openCommit'))
          row.appendChild(link)
        }
        entries.appendChild(row)
      }
      item.appendChild(entries)
      return item
    }

    // ------------------------------------------------------ copy / export

    function currentExportText(kind) {
      return exportText(view, {
        format: kind,
        labels: labels,
        exportedAt: new Date().toISOString(),
      })
    }

    function copyCurrentView() {
      if (view.releaseCount === 0) {
        actionNotice = { key: 'exportNothing', values: null }
        renderStatus()
        return
      }
      var text = currentExportText('text')
      writeClipboard(text, function (ok) {
        actionNotice = ok
          ? {
              key: 'copied',
              values: {
                releases: view.releaseCount,
                entries: view.entryCount,
              },
            }
          : { key: 'copyFailed', values: null }
        renderStatus()
      })
    }

    function writeClipboard(text, done) {
      if (
        global.navigator &&
        global.navigator.clipboard &&
        typeof global.navigator.clipboard.writeText === 'function'
      ) {
        global.navigator.clipboard.writeText(text).then(
          function () {
            done(true)
          },
          function () {
            done(legacyClipboard(text))
          }
        )
        return
      }
      done(legacyClipboard(text))
    }

    function legacyClipboard(text) {
      var area = element('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      document.body.appendChild(area)
      var ok = false
      try {
        area.select()
        ok = document.execCommand('copy')
      } catch (error) {
        ok = false
      }
      document.body.removeChild(area)
      return ok
    }

    function exportCurrentView() {
      if (view.releaseCount === 0) {
        actionNotice = { key: 'exportNothing', values: null }
        renderStatus()
        return
      }
      var name = exportFileName(view, 'md')
      try {
        var blob = new global.Blob([currentExportText('markdown')], {
          type: 'text/markdown;charset=utf-8',
        })
        var url = global.URL.createObjectURL(blob)
        var anchor = element('a')
        anchor.href = url
        anchor.download = name
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        global.setTimeout(function () {
          global.URL.revokeObjectURL(url)
        }, 0)
        actionNotice = {
          key: 'exported',
          values: {
            file: name,
            releases: view.releaseCount,
            entries: view.entryCount,
          },
        }
      } catch (error) {
        actionNotice = { key: 'exportFailed', values: null }
      }
      renderStatus()
    }

    // --------------------------------------------- preference reactivity

    // The hub owns the language and playfulness controls, so this viewer
    // watches for their effects rather than duplicating them.
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(function () {
        refreshLabels()
        renderStatus()
        renderResults()
        renderCalendar()
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-lang'],
      })
    }
    document.addEventListener('change', onPreferenceEvent, true)
    document.addEventListener('input', onPreferenceEvent, true)
    global.addEventListener('storage', function (event) {
      if (
        event.key === StoreKeys.lang ||
        event.key === StoreKeys.funEn ||
        event.key === StoreKeys.funYue
      ) {
        render()
      }
    })

    function onPreferenceEvent(event) {
      var target = event.target
      if (target === null || target === undefined) {
        return
      }
      if (
        target.name === 'lang' ||
        target.id === 'fun-en' ||
        target.id === 'fun-yue'
      ) {
        render()
      }
    }

    setMode('plain')

    return {
      element: root,
      state: function () {
        return normalizeState(state)
      },
      view: function () {
        return view
      },
      refresh: render,
      setRange: applyRange,
    }
  }

  /** Mounts into whichever containers the page provides. */
  function start() {
    var containers = document.querySelectorAll('[data-dm-changelog]')
    for (var index = 0; index < containers.length; index++) {
      if (
        containers[index].getAttribute('data-dm-changelog-ready') === 'true'
      ) {
        continue
      }
      containers[index].setAttribute('data-dm-changelog-ready', 'true')
      mount(containers[index], {})
    }
  }

  var api = {
    strings: STRINGS,
    labelsFor: labelsFor,
    format: format,
    maximumQueryLength: MaximumQueryLength,
    presetIds: PresetIds,
    presetRange: presetRange,
    parseTypedDate: parseTypedDate,
    orderForLocale: orderForLocale,
    localeExample: localeExample,
    isoFromParts: isoFromParts,
    daysInMonth: daysInMonth,
    compareIso: compareIso,
    shiftIso: shiftIso,
    monthMatrix: monthMatrix,
    escapeRegex: escapeRegex,
    normalizeFlags: normalizeFlags,
    compilePattern: compilePattern,
    normalizeState: normalizeState,
    filterReleases: filterReleases,
    describeView: describeView,
    describeFilters: describeFilters,
    exportText: exportText,
    exportFileName: exportFileName,
    mount: mount,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsChangelog = api

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  }
})(typeof window === 'undefined' ? globalThis : window)
