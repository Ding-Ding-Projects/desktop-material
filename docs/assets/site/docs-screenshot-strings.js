/**
 * Desktop Material screenshot documentation — localization resources.
 *
 * `docs-screenshot-gallery.js` has **no** built-in English: a key it cannot find
 * renders as `⟨key⟩`. Every one of its `stringKeys` must therefore be present in
 * every language here, and `DocsScreenshotGallery.missingStrings()` is run
 * against these tables by the unit test so a future key cannot be added to the
 * module without being translated.
 *
 * These are all `fixed` strings in the hub's sense — control names, accessible
 * names, counts, match failures and metadata labels. None of them may move with
 * the playfulness level, because each one is a fact the reader acts on: which
 * pattern failed, how many screenshots matched, whether a receipt exists.
 *
 * The generated pages load this file directly, so it must stay plain browser JS
 * with no bundler and no network access.
 */
;(function (global) {
  'use strict'

  var en = {
    gallery: 'Screenshot gallery',
    searchLabel: 'Search screenshots',
    searchPlaceholder: 'Name, caption, scene or batch',
    searchDescribe: 'screenshot names, captions, scenes and capture batches',
    regexToggle: 'Regular expression',
    regexHint: 'Plain text unless you turn this on.',
    builderOpen: 'Open the regex builder',
    builderClose: 'Close the regex builder',
    builderRegion: 'Regex builder',
    errorInvalid: 'Invalid pattern. Showing every screenshot.',
    errorTooLongPattern: 'Pattern is too long. Showing every screenshot.',
    errorTooLongQuery: 'Query is too long. Showing every screenshot.',
    errorBadFlags: 'Unsupported or repeated flag. Showing every screenshot.',
    errorTimeout: 'Pattern took too long. Showing every screenshot.',
    errorUnavailable: 'Could not match. Showing every screenshot.',
    errorFailOpen:
      'Nothing was hidden, so every screenshot is still reachable.',
    searchPending: 'Matching…',
    filters: 'Filters',
    filterBatch: 'Capture batch',
    filterPlatform: 'Platform',
    filterReceipt: 'Acceptance receipt',
    filterAll: 'All',
    filterUnrecorded: 'Unrecorded',
    filterReceiptAny: 'Any',
    filterReceiptWith: 'Has a receipt',
    filterReceiptWithout: 'No receipt',
    filtersReset: 'Clear filters',
    count: '{count} screenshots',
    countFiltered: '{shown} of {total} screenshots',
    empty: 'No screenshot matches that search.',
    gridLabel: 'Screenshots',
    gridHint: 'Arrow keys move between screenshots. Enter opens one.',
    open: 'Open its documentation',
    zoom: 'View at full size',
    copyCommand: 'Copy the regeneration command',
    copied: 'Copied',
    copyFailed: 'Could not copy. The command is selected instead.',
    noCommand: 'No regeneration command is recorded for this screenshot.',
    noCaption: 'No caption is recorded for this screenshot.',
    noAltText: 'No alt text is recorded for this screenshot.',
    noDimensions: 'Dimensions could not be read from the file.',
    noBytes: 'File size could not be read.',
    receiptPresent: 'Dated acceptance receipt',
    receiptAbsent: 'No dated acceptance receipt exists for this screenshot.',
    unrecorded: 'Not recorded',
    imageAltMissing: 'Screenshot with no recorded description',
    lightboxLabel: 'Full size screenshot',
    lightboxClose: 'Close',
    lightboxZoomIn: 'Zoom in',
    lightboxZoomOut: 'Zoom out',
    lightboxHint: 'Escape closes. The thumbnail keeps its focus.',
    previous: 'Previous screenshot',
    next: 'Next screenshot',
    position: '{index} of {total}',
    shortcuts: 'Left and right arrows move between screenshots.',
    metaFile: 'File',
    metaScene: 'Capture scene',
    metaBatch: 'Capture batch',
    metaPlatform: 'Platform',
    metaSection: 'Section',
    metaDimensions: 'Dimensions',
    metaBytes: 'File size',
    metaSha: 'SHA-256',
    metaCaption: 'Caption',
    metaAlt: 'Alt text',
    metaInteraction: 'What the harness does',
    metaCommands: 'How to regenerate it',
    metaReceipts: 'Acceptance receipts',
    metaGaps: 'Not recorded',
    skipped: '{count} screenshots are not shown by the current filters.',
  }

  /**
   * Cantonese carries the same facts. A match failure still names what failed
   * and states that nothing was hidden; a count is still exact.
   */
  var yue = {
    gallery: '截圖圖庫',
    searchLabel: '搜尋截圖',
    searchPlaceholder: '名稱、說明、場景或批次',
    searchDescribe: '截圖名稱、說明、拍攝場景同批次',
    regexToggle: '正則表達式',
    regexHint: '唔開嘅話就當普通文字搵。',
    builderOpen: '打開正則表達式砌法器',
    builderClose: '關閉正則表達式砌法器',
    builderRegion: '正則表達式砌法器',
    errorInvalid: '樣式唔正確。顯示全部截圖。',
    errorTooLongPattern: '樣式太長。顯示全部截圖。',
    errorTooLongQuery: '查詢太長。顯示全部截圖。',
    errorBadFlags: '唔支援或者重複嘅旗標。顯示全部截圖。',
    errorTimeout: '樣式行得太久。顯示全部截圖。',
    errorUnavailable: '配對唔到。顯示全部截圖。',
    errorFailOpen: '冇任何截圖被隱藏,全部都仲搵得到。',
    searchPending: '配對中…',
    filters: '篩選',
    filterBatch: '拍攝批次',
    filterPlatform: '平台',
    filterReceipt: '驗收記錄',
    filterAll: '全部',
    filterUnrecorded: '未記錄',
    filterReceiptAny: '任何',
    filterReceiptWith: '有驗收記錄',
    filterReceiptWithout: '冇驗收記錄',
    filtersReset: '清除篩選',
    count: '{count} 張截圖',
    countFiltered: '{total} 張之中顯示 {shown} 張',
    empty: '冇截圖啱呢個搜尋。',
    gridLabel: '截圖',
    gridHint: '用方向鍵喺截圖之間移動,按 Enter 打開。',
    open: '打開佢嘅說明文件',
    zoom: '睇原始尺寸',
    copyCommand: '複製重新拍攝指令',
    copied: '已複製',
    copyFailed: '複製唔到。已經幫你選取咗個指令。',
    noCommand: '呢張截圖冇記錄重新拍攝指令。',
    noCaption: '呢張截圖冇記錄說明。',
    noAltText: '呢張截圖冇記錄替代文字。',
    noDimensions: '讀唔到檔案嘅尺寸。',
    noBytes: '讀唔到檔案大細。',
    receiptPresent: '有日期嘅驗收記錄',
    receiptAbsent: '呢張截圖冇任何有日期嘅驗收記錄。',
    unrecorded: '未記錄',
    imageAltMissing: '未記錄描述嘅截圖',
    lightboxLabel: '原始尺寸截圖',
    lightboxClose: '關閉',
    lightboxZoomIn: '放大',
    lightboxZoomOut: '縮細',
    lightboxHint: '按 Escape 關閉,焦點會返去原本嗰張縮圖。',
    previous: '上一張截圖',
    next: '下一張截圖',
    position: '第 {index} 張,共 {total} 張',
    shortcuts: '用左右方向鍵喺截圖之間移動。',
    metaFile: '檔案',
    metaScene: '拍攝場景',
    metaBatch: '拍攝批次',
    metaPlatform: '平台',
    metaSection: '所屬區域',
    metaDimensions: '尺寸',
    metaBytes: '檔案大細',
    metaSha: 'SHA-256',
    metaCaption: '說明',
    metaAlt: '替代文字',
    metaInteraction: '拍攝工具做咗咩',
    metaCommands: '點樣重新拍一次',
    metaReceipts: '驗收記錄',
    metaGaps: '未記錄',
    skipped: '有 {count} 張截圖唔喺目前嘅篩選範圍。',
  }

  var api = {
    en: en,
    yue: yue,
    /** Bilingual mode keeps the concise primary language for control names. */
    bi: en,
    /** Resolves a pack, falling back to English rather than to `⟨key⟩`. */
    packFor: function (id) {
      if (id === 'yue') {
        return yue
      }
      return en
    },
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsScreenshotStrings = api
})(typeof window === 'undefined' ? globalThis : window)
