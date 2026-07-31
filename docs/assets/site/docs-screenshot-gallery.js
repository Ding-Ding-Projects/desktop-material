/**
 * Desktop Material documentation site — screenshot gallery engine.
 *
 * One module shared by the gallery index and by every generated
 * per-screenshot page, so search, filters, keyboard navigation, the lightbox
 * and the copy-the-regeneration-command button behave identically on both.
 *
 * Two layers live here and they are deliberately separated:
 *
 *   1. Pure logic — `compileQuery`, `matchesQuery`, `matchesFilters`,
 *      `filterItems`, `neighbours`, `resolveGridMove`, `coverage`. No DOM, no
 *      timers, no globals beyond an injectable clock, so Node can unit-test
 *      the search semantics directly.
 *   2. DOM wiring — `create`, `createSingle`, `openLightbox`, `copyText`.
 *      Nothing here is touched at load time, which is why requiring this file
 *      in Node is safe.
 *
 * Search rules this module is built around:
 *
 *   • Plain text is the DEFAULT. A reader's `.` or `(` is a literal until they
 *     deliberately turn regex on, so nobody gets surprised by an empty grid.
 *   • Regex is an explicit opt-in and its validity is reported inline.
 *   • An unusable pattern FAILS OPEN. The gallery is evidence: hiding all 92
 *     captures because someone typed a stray bracket would be a worse
 *     failure than showing them everything alongside a clear error. This is a
 *     considered departure from the hub's fail-closed corpus search, where
 *     showing nothing is the safe answer because nothing is all a search
 *     result set ever was.
 *   • Bounds, not optimism, keep the page responsive: the pattern length is
 *     capped, every searched field is truncated, and the local evaluation loop
 *     carries a wall-clock budget it abandons (still failing open) rather than
 *     grinding through a catastrophic pattern.
 *   • Where the caller hands us the shared bounded regex runner
 *     (`DesktopMaterialRegexJob`) the reader's pattern is evaluated inside its
 *     terminable worker instead of on the UI thread — the shared worker's
 *     `search` operation consumes exactly the triples `searchCatalog` builds.
 *     The bounded local predicate exists for the case where no runner is
 *     supplied and for unit testing, and it is bounded precisely so that case
 *     stays safe.
 *
 * User-facing copy: this module hardcodes NONE. Every visible string arrives
 * through `options.strings`, exactly as `docs-color-picker.js` takes `labels`,
 * so the caller owns language mode and playfulness level. A key the caller
 * omitted renders as a bracketed key name rather than as invented English —
 * a visible gap is honest, silent English is not.
 *
 * Layout and access: mobile-first from 320 CSS px, every target at least
 * 44 px, no horizontal page scroll, visible focus everywhere, the lightbox
 * traps focus and returns it to the thumbnail that opened it.
 */
;(function (global) {
  'use strict'

  // ------------------------------------------------------------------ bounds

  /**
   * Stricter than the shared worker's 512 because the gallery's whole corpus
   * is ~92 short metadata strings. A shorter cap narrows the catastrophic
   * pattern surface without costing any real query.
   */
  var MaximumPatternLength = 200
  var MaximumQueryLength = 512

  /** Each searched field is truncated, so worst-case work is bounded by data. */
  var MaximumFieldLength = 400

  /** Total wall-clock budget for the local regex loop, in milliseconds. */
  var DefaultBudgetMilliseconds = 40

  /**
   * The shared worker's `search` reply caps `hits`. Above this many items its
   * per-item membership answer would be truncated, which would silently hide
   * screenshots — so beyond it we use the bounded local path instead.
   */
  var MaximumWorkerHits = 100

  var AllowedFlags = 'gimsuy'

  /** Debounce so a regex is not recompiled on every keystroke. */
  var InputDebounceMilliseconds = 140

  var CopiedRevertMilliseconds = 1600

  // ----------------------------------------------------------------- helpers

  function defaultClock() {
    return Date.now()
  }

  function textOf(value) {
    return value === undefined || value === null ? '' : String(value)
  }

  function trimmed(value) {
    return textOf(value).trim()
  }

  function nullableText(value) {
    var text = trimmed(value)
    return text === '' ? null : text
  }

  function finiteNumber(value) {
    return typeof value === 'number' && isFinite(value) ? value : null
  }

  function stringList(value) {
    if (!Array.isArray(value)) {
      // A single string is a common shape for `commands`; accept it rather
      // than dropping the one command the caller actually recorded.
      var single = nullableText(value)
      return single === null ? [] : [single]
    }
    var out = []
    for (var i = 0; i < value.length; i++) {
      var entry = nullableText(value[i])
      if (entry !== null) {
        out.push(entry)
      }
    }
    return out
  }

  function bounded(value) {
    var text = textOf(value)
    return text.length > MaximumFieldLength
      ? text.slice(0, MaximumFieldLength)
      : text
  }

  // -------------------------------------------------------------- item model

  /**
   * Normalizes one screenshot record. Anything the caller did not record
   * becomes `null` or `[]` — never a guess — so the rendering layer can say
   * "not recorded" instead of inventing a caption, a dimension or a receipt.
   */
  function normalizeItem(raw) {
    var source = raw === null || raw === undefined ? {} : raw
    var file = trimmed(source.file)
    var output = nullableText(source.output)
    if (output === null && file !== '') {
      output = file.replace(/\.[a-z0-9]+$/i, '')
    }
    return {
      file: file,
      output: output,
      caption: nullableText(source.caption),
      altText: nullableText(source.altText),
      scene: nullableText(source.scene),
      batch: nullableText(source.batch),
      platform: nullableText(source.platform),
      // `wikiSection` and `datedReceipts` are the names the capture inventory
      // itself uses. Accepting both spellings means a page that forwards the
      // inventory verbatim cannot silently report every screenshot as having
      // no receipt.
      section:
        nullableText(source.section) === null
          ? nullableText(source.wikiSection)
          : nullableText(source.section),
      interaction: nullableText(source.interaction),
      classification: nullableText(source.classification),
      width: finiteNumber(source.width),
      height: finiteNumber(source.height),
      bytes: finiteNumber(source.bytes),
      sha256: nullableText(source.sha256),
      commands: stringList(source.commands),
      receipts:
        source.receipts === undefined || source.receipts === null
          ? stringList(source.datedReceipts)
          : stringList(source.receipts),
      fixture: nullableText(source.fixture),
      privacyGate: nullableText(source.privacyGate),
      src: nullableText(source.src),
      href: nullableText(source.href),
    }
  }

  /**
   * A record with no file name cannot be rendered as an image or linked, so it
   * is dropped here; callers surface the count through `state().skipped` so no
   * input disappears without being reported.
   */
  function normalizeItems(list) {
    var source = Array.isArray(list) ? list : []
    var out = []
    for (var i = 0; i < source.length; i++) {
      var item = normalizeItem(source[i])
      if (item.file !== '') {
        out.push(item)
      }
    }
    return out
  }

  /** What a screenshot does and does not have on record. */
  function coverage(item) {
    var record = item === null || item === undefined ? {} : item
    var gaps = []
    if (record.caption === null || record.caption === undefined) {
      gaps.push('caption')
    }
    if (record.altText === null || record.altText === undefined) {
      gaps.push('altText')
    }
    if (
      finiteNumber(record.width) === null ||
      finiteNumber(record.height) === null
    ) {
      gaps.push('dimensions')
    }
    if (finiteNumber(record.bytes) === null) {
      gaps.push('bytes')
    }
    if (!Array.isArray(record.commands) || record.commands.length === 0) {
      gaps.push('commands')
    }
    if (!Array.isArray(record.receipts) || record.receipts.length === 0) {
      gaps.push('receipts')
    }
    return {
      hasCaption: gaps.indexOf('caption') === -1,
      hasAltText: gaps.indexOf('altText') === -1,
      hasDimensions: gaps.indexOf('dimensions') === -1,
      hasBytes: gaps.indexOf('bytes') === -1,
      hasCommands: gaps.indexOf('commands') === -1,
      hasReceipts: gaps.indexOf('receipts') === -1,
      receiptCount: Array.isArray(record.receipts) ? record.receipts.length : 0,
      gaps: gaps,
    }
  }

  // ------------------------------------------------------------ search fields

  /**
   * The three searched groups, shaped to match the shared regex worker's
   * `search` catalog contract (`[title, path, description]`) so one pattern
   * evaluation serves both paths. Names, scenes and batches are searched
   * because those are the identifiers a reader has in hand; the caption and
   * alt text are searched because that is the prose that describes the frame.
   */
  function searchFields(item) {
    var record = item === null || item === undefined ? {} : item
    return {
      name: bounded(
        [textOf(record.file), textOf(record.output)].join(' ').trim()
      ),
      provenance: bounded(
        [
          textOf(record.scene),
          textOf(record.batch),
          textOf(record.platform),
          textOf(record.classification),
        ]
          .join(' ')
          .trim()
      ),
      description: bounded(
        [textOf(record.caption), textOf(record.altText), textOf(record.section)]
          .join(' ')
          .trim()
      ),
    }
  }

  function searchCatalog(items) {
    var list = Array.isArray(items) ? items : []
    var catalog = []
    for (var i = 0; i < list.length; i++) {
      var fields = searchFields(list[i])
      catalog.push([fields.name, fields.provenance, fields.description])
    }
    return catalog
  }

  /**
   * The one string a pattern is tested against: name, then provenance, then
   * description. A reader's `^` therefore anchors to the start of the file
   * name and `$` to the end of the description — a single haystack per
   * screenshot, matching what the shared worker's `search` operation does with
   * the same three fields, so both evaluation paths agree.
   */
  function searchText(item) {
    var fields = searchFields(item)
    return fields.name + ' ' + fields.provenance + ' ' + fields.description
  }

  // ------------------------------------------------------------ query compile

  function normalizedFlags(flags) {
    if (flags === undefined || flags === null) {
      return { flags: null }
    }
    if (typeof flags !== 'string' || flags.length > AllowedFlags.length) {
      return { code: 'bad-flags' }
    }
    var seen = {}
    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i)
      if (AllowedFlags.indexOf(flag) === -1 || seen[flag] === true) {
        return { code: 'bad-flags' }
      }
      seen[flag] = true
    }
    return { flags: flags }
  }

  /**
   * Reads a search state into a verdict the matcher and the UI both use.
   *
   * `mode` is `'text'` unless the caller explicitly asked for regex, so the
   * default can never be reached by accident. Bounds are checked here, before
   * anything is compiled or dispatched to a worker.
   */
  function compileQuery(state) {
    var source = state === null || state === undefined ? {} : state
    var explicitRegex = source.mode === 'regex' || source.regex === true
    var mode = explicitRegex ? 'regex' : 'text'
    var query = textOf(source.query)

    // In text mode surrounding whitespace is noise. In regex mode a space is a
    // pattern the reader may have meant, so the raw string is kept intact.
    var active = mode === 'regex' ? query.length > 0 : query.trim().length > 0

    var flagResult = normalizedFlags(source.flags)
    var flags =
      flagResult.flags === null || flagResult.flags === undefined
        ? source.caseSensitive === true
          ? ''
          : 'i'
        : flagResult.flags

    var error = null
    if (flagResult.code !== undefined) {
      error = { code: flagResult.code, detail: '' }
    } else if (mode === 'regex' && query.length > MaximumPatternLength) {
      error = { code: 'too-long-pattern', detail: '' }
    } else if (mode === 'text' && query.length > MaximumQueryLength) {
      error = { code: 'too-long-query', detail: '' }
    }

    return {
      mode: mode,
      query: query,
      pattern: query,
      needle: query.trim().toLowerCase(),
      flags: flags,
      active: active,
      error: error,
      limit: mode === 'regex' ? MaximumPatternLength : MaximumQueryLength,
    }
  }

  /**
   * `g` and `y` carry `lastIndex` between calls, so a single shared RegExp
   * would match item 1 and then mysteriously skip item 2. They are stripped
   * for testing while the reader's chosen flags stay reported verbatim.
   */
  function testingFlags(flags) {
    return textOf(flags).replace(/g/g, '').replace(/y/g, '')
  }

  function compileLocalRegex(pattern, flags) {
    if (textOf(pattern).length > MaximumPatternLength) {
      return { code: 'too-long-pattern', detail: '' }
    }
    try {
      return { regex: new RegExp(textOf(pattern), testingFlags(flags)) }
    } catch (error) {
      var detail =
        error !== null && error !== undefined && error.message !== undefined
          ? String(error.message).slice(0, 300)
          : ''
      return { code: 'invalid', detail: detail }
    }
  }

  function matchesText(item, needle) {
    if (needle === '') {
      return true
    }
    return searchText(item).toLowerCase().indexOf(needle) !== -1
  }

  /**
   * Single-item predicate, for callers that already hold a compiled query.
   * Any unusable query answers `true`: the item stays reachable.
   */
  function matchesQuery(item, compiled) {
    if (compiled === null || compiled === undefined) {
      return true
    }
    if (!compiled.active || compiled.error !== null) {
      return true
    }
    if (compiled.mode === 'text') {
      return matchesText(item, compiled.needle)
    }
    var local = compileLocalRegex(compiled.pattern, compiled.flags)
    if (local.regex === undefined) {
      return true
    }
    return local.regex.test(searchText(item))
  }

  // ---------------------------------------------------------------- filters

  var ReceiptModes = ['any', 'with', 'without']

  function normalizeFilters(raw) {
    var source = raw === null || raw === undefined ? {} : raw
    var receipt = trimmed(source.receipt)
    return {
      batch:
        nullableText(source.batch) === null ? 'all' : trimmed(source.batch),
      platform:
        nullableText(source.platform) === null
          ? 'all'
          : trimmed(source.platform),
      receipt: ReceiptModes.indexOf(receipt) === -1 ? 'any' : receipt,
    }
  }

  /**
   * `'all'` accepts anything and the reserved `'unrecorded'` accepts only the
   * screenshots whose value is genuinely absent — the six retained historical
   * captures have no batch or platform on record, and a filter list built only
   * from values that are present would leave them findable nowhere but "all".
   */
  function matchesFacet(value, selection) {
    if (selection === 'all') {
      return true
    }
    if (selection === 'unrecorded') {
      return value === ''
    }
    return value === selection
  }

  /**
   * Filters are evaluated independently of the search, and `filterItems` ANDs
   * the two — so narrowing to a batch narrows whatever the query already
   * found, and neither one silently replaces the other.
   */
  function matchesFilters(item, filters) {
    var record = item === null || item === undefined ? {} : item
    var active = normalizeFilters(filters)
    if (!matchesFacet(textOf(record.batch), active.batch)) {
      return false
    }
    if (!matchesFacet(textOf(record.platform), active.platform)) {
      return false
    }
    if (active.receipt !== 'any') {
      var count = Array.isArray(record.receipts) ? record.receipts.length : 0
      if (active.receipt === 'with' && count === 0) {
        return false
      }
      if (active.receipt === 'without' && count > 0) {
        return false
      }
    }
    return true
  }

  /** Every filter value present in the data, with counts, for the controls. */
  function facets(items) {
    var list = Array.isArray(items) ? items : []
    var batchOrder = []
    var batchCounts = {}
    var platformOrder = []
    var platformCounts = {}
    var withReceipt = 0
    var withoutReceipt = 0
    var unrecordedBatch = 0
    var unrecordedPlatform = 0

    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      var batch = textOf(item.batch)
      if (batch === '') {
        unrecordedBatch++
      } else {
        if (batchCounts[batch] === undefined) {
          batchCounts[batch] = 0
          batchOrder.push(batch)
        }
        batchCounts[batch]++
      }
      var platform = textOf(item.platform)
      if (platform === '') {
        unrecordedPlatform++
      } else {
        if (platformCounts[platform] === undefined) {
          platformCounts[platform] = 0
          platformOrder.push(platform)
        }
        platformCounts[platform]++
      }
      if (Array.isArray(item.receipts) && item.receipts.length > 0) {
        withReceipt++
      } else {
        withoutReceipt++
      }
    }

    function collect(order, counts) {
      order.sort()
      var out = []
      for (var j = 0; j < order.length; j++) {
        out.push({ id: order[j], count: counts[order[j]] })
      }
      return out
    }

    return {
      batches: collect(batchOrder, batchCounts),
      platforms: collect(platformOrder, platformCounts),
      receipts: { with: withReceipt, without: withoutReceipt },
      unrecorded: { batch: unrecordedBatch, platform: unrecordedPlatform },
      total: list.length,
    }
  }

  // ------------------------------------------------------------- composition

  /**
   * Applies filters AND search to the whole list and reports exactly what
   * happened, including every way the query failed to be usable.
   *
   * `state.outcome` lets the caller substitute a worker-computed membership
   * answer (`{ status: 'ready', matched: { 3: true } }`, indexes into this
   * same list), report that one is still running (`'pending'`), or report that
   * it failed (`'error'`). Pending and error both fail open.
   */
  function filterItems(items, state, options) {
    var list = Array.isArray(items) ? items : []
    var settings = options === null || options === undefined ? {} : options
    var clock =
      typeof settings.clock === 'function' ? settings.clock : defaultClock
    var budget =
      typeof settings.budgetMilliseconds === 'number' &&
      settings.budgetMilliseconds > 0
        ? settings.budgetMilliseconds
        : DefaultBudgetMilliseconds

    var compiled = compileQuery(state)
    var filters = normalizeFilters(state && state.filters)
    var outcome =
      state && state.outcome !== undefined && state.outcome !== null
        ? state.outcome
        : null

    var error = compiled.error
    var pending = false
    var matched = null
    var regex = null
    var evaluatedBy = 'none'

    if (compiled.mode === 'regex' && compiled.active && error === null) {
      if (outcome !== null) {
        if (outcome.status === 'pending') {
          pending = true
          evaluatedBy = 'worker'
        } else if (outcome.status === 'error') {
          error = {
            code:
              nullableText(outcome.code) === null
                ? 'unavailable'
                : outcome.code,
            detail: textOf(outcome.detail),
          }
          evaluatedBy = 'worker'
        } else {
          matched =
            outcome.matched === undefined || outcome.matched === null
              ? {}
              : outcome.matched
          evaluatedBy = 'worker'
        }
      } else {
        var local = compileLocalRegex(compiled.pattern, compiled.flags)
        if (local.regex === undefined) {
          error = { code: local.code, detail: local.detail }
        } else {
          regex = local.regex
          evaluatedBy = 'local'
        }
      }
    } else if (compiled.mode === 'text' && compiled.active && error === null) {
      evaluatedBy = 'local'
    }

    var failedOpen = error !== null || pending
    var started = clock()
    var timedOut = false
    var visible = []
    var passedFilters = 0

    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      if (!matchesFilters(item, filters)) {
        continue
      }
      passedFilters++

      var keep = true
      if (compiled.active && !failedOpen) {
        if (compiled.mode === 'text') {
          keep = matchesText(item, compiled.needle)
        } else if (matched !== null) {
          keep = matched[i] === true
        } else if (regex !== null) {
          // The budget is checked BEFORE each test, so once the loop has
          // overrun nothing further is handed to a pattern that may be
          // pathological. Everything remaining stays visible.
          if (!timedOut && clock() - started > budget) {
            timedOut = true
          }
          keep = timedOut ? true : regex.test(searchText(item))
        }
      }
      if (keep) {
        visible.push(item)
      }
    }

    if (timedOut && error === null) {
      error = { code: 'timeout', detail: '' }
      failedOpen = true
    }

    return {
      items: visible,
      visible: visible.length,
      total: list.length,
      passedFilters: passedFilters,
      mode: compiled.mode,
      query: compiled.query,
      flags: compiled.flags,
      active: compiled.active,
      limit: compiled.limit,
      error: error,
      failedOpen: failedOpen,
      pending: pending,
      timedOut: timedOut,
      evaluatedBy: evaluatedBy,
      filters: filters,
      filtersActive:
        filters.batch !== 'all' ||
        filters.platform !== 'all' ||
        filters.receipt !== 'any',
    }
  }

  // ------------------------------------------------------------- navigation

  function indexOfFile(items, file) {
    var list = Array.isArray(items) ? items : []
    var wanted = trimmed(file)
    for (var i = 0; i < list.length; i++) {
      if (textOf(list[i].file) === wanted) {
        return i
      }
    }
    return -1
  }

  /**
   * Previous/next around one screenshot, wrapping at both ends so a reader
   * walking the gallery with the keyboard never hits a dead stop. A
   * single-item list reports itself in both directions, which is the only
   * truthful answer.
   */
  function neighbours(items, file) {
    var list = Array.isArray(items) ? items : []
    var index = indexOfFile(list, file)
    if (list.length === 0 || index === -1) {
      return {
        index: -1,
        count: list.length,
        current: null,
        previous: null,
        next: null,
        first: list.length > 0 ? list[0] : null,
        last: list.length > 0 ? list[list.length - 1] : null,
      }
    }
    return {
      index: index,
      count: list.length,
      current: list[index],
      previous: list[(index - 1 + list.length) % list.length],
      next: list[(index + 1) % list.length],
      first: list[0],
      last: list[list.length - 1],
    }
  }

  /**
   * Grid movement in reading order. Left/right step one card and so cross row
   * boundaries the way text does; up/down step a visual row. Movement clamps
   * instead of wrapping, because a wrap in a two-dimensional grid lands
   * somewhere the reader did not point at.
   */
  function resolveGridMove(count, index, direction, columns) {
    var total = finiteNumber(count) === null ? 0 : Math.floor(count)
    if (total <= 0) {
      return -1
    }
    var span = finiteNumber(columns) === null ? 1 : Math.floor(columns)
    if (span < 1) {
      span = 1
    }
    var from = finiteNumber(index) === null ? 0 : Math.floor(index)
    if (from < 0) {
      from = 0
    }
    if (from > total - 1) {
      from = total - 1
    }
    var next = from
    switch (direction) {
      case 'left':
        next = from - 1
        break
      case 'right':
        next = from + 1
        break
      case 'up':
        next = from - span
        break
      case 'down':
        next = from + span
        break
      case 'first':
        next = 0
        break
      case 'last':
        next = total - 1
        break
      case 'pageUp':
        next = from - span * 3
        break
      case 'pageDown':
        next = from + span * 3
        break
      default:
        return from
    }
    if (next < 0) {
      // Up from the top row keeps the column rather than jumping to item 0.
      next = direction === 'up' || direction === 'pageUp' ? from : 0
    }
    if (next > total - 1) {
      next =
        direction === 'down' || direction === 'pageDown' ? total - 1 : total - 1
    }
    return next
  }

  // ---------------------------------------------------------------- strings

  /**
   * Every key this module can render. Exported so a caller (or its test) can
   * prove its string table is complete in all three language modes before
   * shipping, instead of discovering a bracketed key on the live page.
   */
  var StringKeys = [
    'gallery',
    'searchLabel',
    'searchPlaceholder',
    'searchDescribe',
    'regexToggle',
    'regexHint',
    'builderOpen',
    'builderClose',
    'builderRegion',
    'errorInvalid',
    'errorTooLongPattern',
    'errorTooLongQuery',
    'errorBadFlags',
    'errorTimeout',
    'errorUnavailable',
    'errorFailOpen',
    'searchPending',
    'filters',
    'filterBatch',
    'filterPlatform',
    'filterReceipt',
    'filterAll',
    'filterUnrecorded',
    'filterReceiptAny',
    'filterReceiptWith',
    'filterReceiptWithout',
    'filtersReset',
    'count',
    'countFiltered',
    'empty',
    'gridLabel',
    'gridHint',
    'open',
    'zoom',
    'copyCommand',
    'copied',
    'copyFailed',
    'noCommand',
    'noCaption',
    'noAltText',
    'noDimensions',
    'noBytes',
    'receiptPresent',
    'receiptAbsent',
    'unrecorded',
    'imageAltMissing',
    'lightboxLabel',
    'lightboxClose',
    'lightboxZoomIn',
    'lightboxZoomOut',
    'lightboxHint',
    'previous',
    'next',
    'position',
    'shortcuts',
    'metaFile',
    'metaScene',
    'metaBatch',
    'metaPlatform',
    'metaSection',
    'metaDimensions',
    'metaBytes',
    'metaSha',
    'metaCaption',
    'metaAlt',
    'metaInteraction',
    'metaCommands',
    'metaReceipts',
    'metaGaps',
    'skipped',
  ]

  function missingStrings(strings) {
    var table = strings === null || strings === undefined ? {} : strings
    var missing = []
    for (var i = 0; i < StringKeys.length; i++) {
      var key = StringKeys[i]
      if (nullableText(table[key]) === null) {
        missing.push(key)
      }
    }
    return missing
  }

  /**
   * Builds the label reader. A missing key renders as `⟨key⟩` — deliberately
   * not English prose, because inventing copy here would silently defeat the
   * caller's language mode and playfulness level.
   */
  function labeller(getStrings) {
    function label(key, values) {
      var table = getStrings()
      var raw = table === null || table === undefined ? undefined : table[key]
      var text =
        raw === undefined || raw === null ? '⟨' + key + '⟩' : String(raw)
      if (values === undefined || values === null) {
        return text
      }
      return text.replace(/\{([a-zA-Z0-9_]+)\}/g, function (whole, name) {
        return Object.prototype.hasOwnProperty.call(values, name)
          ? String(values[name])
          : whole
      })
    }
    return label
  }

  /**
   * A label reader over a fixed table, for callers rendering their own copy
   * (generated page headings, for instance) with the same missing-key marker
   * and the same `{token}` interpolation this module uses internally.
   */
  function labelFor(strings) {
    return labeller(function () {
      return strings
    })
  }

  var ErrorStringKeys = {
    invalid: 'errorInvalid',
    'too-long-pattern': 'errorTooLongPattern',
    'too-long-query': 'errorTooLongQuery',
    'bad-flags': 'errorBadFlags',
    timeout: 'errorTimeout',
    unavailable: 'errorUnavailable',
    'worker-error': 'errorUnavailable',
    'invalid-request': 'errorUnavailable',
  }

  function errorStringKey(code) {
    var key = ErrorStringKeys[textOf(code)]
    return key === undefined ? 'errorUnavailable' : key
  }

  // --------------------------------------------------------------- DOM utils

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

  var uniqueCounter = 0

  function uniqueId(prefix) {
    uniqueCounter++
    return prefix + '-' + uniqueCounter.toString(36)
  }

  var FocusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]),' +
    ' select:not([disabled]), textarea:not([disabled]),' +
    ' [tabindex]:not([tabindex="-1"])'

  /**
   * A hidden control must not become a focus-trap stop, or Tab appears to do
   * nothing. The active element always counts, so the trap can still find its
   * bearings in an environment without layout.
   */
  function isFocusVisible(node) {
    if (node.hidden === true) {
      return false
    }
    if (node === document.activeElement) {
      return true
    }
    if (node.offsetParent !== null) {
      return true
    }
    return (
      typeof node.getClientRects === 'function' &&
      node.getClientRects().length > 0
    )
  }

  function focusableWithin(root) {
    var found = root.querySelectorAll(FocusableSelector)
    var out = []
    for (var i = 0; i < found.length; i++) {
      if (isFocusVisible(found[i])) {
        out.push(found[i])
      }
    }
    return out
  }

  function isTypingTarget(node) {
    if (node === null || node === undefined) {
      return false
    }
    var tag = textOf(node.tagName).toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true
    }
    return node.isContentEditable === true
  }

  /**
   * Copies text, preferring the async Clipboard API and falling back to a
   * hidden textarea plus `execCommand`. The fallback is deprecated but it is
   * the only synchronous path left, and a copy button that silently does
   * nothing is worse than one using an old API.
   */
  function copyText(value, options) {
    var settings = options === null || options === undefined ? {} : options
    var onDone = typeof settings.onDone === 'function' ? settings.onDone : null
    var onFail = typeof settings.onFail === 'function' ? settings.onFail : null
    var text = textOf(value)

    function done() {
      if (onDone !== null) {
        onDone()
      }
    }
    function failed() {
      if (onFail !== null) {
        onFail()
      }
    }

    if (text === '') {
      failed()
      return
    }

    if (
      global.navigator &&
      global.navigator.clipboard &&
      typeof global.navigator.clipboard.writeText === 'function'
    ) {
      global.navigator.clipboard.writeText(text).then(done, function () {
        if (!legacyCopy(text)) {
          failed()
          return
        }
        done()
      })
      return
    }
    if (legacyCopy(text)) {
      done()
      return
    }
    failed()
  }

  function legacyCopy(text) {
    if (typeof document === 'undefined' || !document.body) {
      return false
    }
    var holder = document.createElement('textarea')
    holder.value = text
    holder.setAttribute('readonly', 'readonly')
    holder.setAttribute('aria-hidden', 'true')
    holder.style.position = 'fixed'
    holder.style.top = '-1000px'
    holder.style.opacity = '0'
    document.body.appendChild(holder)
    var ok = false
    try {
      holder.select()
      ok = document.execCommand('copy') === true
    } catch (error) {
      ok = false
    }
    document.body.removeChild(holder)
    return ok
  }

  // ---------------------------------------------------------------- lightbox

  /**
   * Full-resolution view. It is a modal dialog on purpose — a decision
   * surface for looking closely — and so it traps Tab, closes on Escape or a
   * backdrop click, and hands focus back to the exact thumbnail that opened
   * it. Zoom toggles between fit-to-viewport and the image's natural pixels,
   * with the wrapper scrollable and focusable so arrows pan it.
   */
  function openLightbox(options) {
    var settings = options === null || options === undefined ? {} : options
    var item = normalizeItem(settings.item)
    var label = labeller(function () {
      return settings.strings || {}
    })
    var opener =
      settings.opener !== undefined && settings.opener !== null
        ? settings.opener
        : document.activeElement
    var source =
      nullableText(settings.src) === null ? textOf(item.src) : settings.src

    var overlay = element('div', 'dm-shot-lightbox')
    var dialog = element('div', 'dm-shot-lightbox-dialog')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    var titleId = uniqueId('dm-shot-lightbox-title')
    var hintId = uniqueId('dm-shot-lightbox-hint')
    dialog.setAttribute('aria-labelledby', titleId)
    dialog.setAttribute('aria-describedby', hintId)

    var bar = element('div', 'dm-shot-lightbox-bar')
    var title = element(
      'h2',
      'dm-shot-lightbox-title',
      label('lightboxLabel', { file: item.file })
    )
    title.id = titleId
    var zoomButton = element(
      'button',
      'dm-shot-lightbox-zoom',
      label('lightboxZoomIn')
    )
    zoomButton.type = 'button'
    zoomButton.setAttribute('aria-pressed', 'false')
    var closeButton = element(
      'button',
      'dm-shot-lightbox-close',
      label('lightboxClose')
    )
    closeButton.type = 'button'
    bar.appendChild(title)
    bar.appendChild(zoomButton)
    bar.appendChild(closeButton)

    var frame = element('div', 'dm-shot-lightbox-frame')
    frame.setAttribute('tabindex', '0')
    frame.setAttribute('role', 'group')
    frame.setAttribute(
      'aria-label',
      label('lightboxLabel', { file: item.file })
    )
    var image = element('img', 'dm-shot-lightbox-image')
    image.src = source
    image.alt =
      item.altText !== null
        ? item.altText
        : item.caption !== null
        ? item.caption
        : label('imageAltMissing', { file: item.file })
    if (item.width !== null && item.height !== null) {
      image.setAttribute('width', String(item.width))
      image.setAttribute('height', String(item.height))
    }
    image.setAttribute('decoding', 'async')
    frame.appendChild(image)

    var caption = element(
      'p',
      'dm-shot-lightbox-caption',
      item.caption !== null ? item.caption : label('noCaption')
    )
    var hint = element('p', 'dm-shot-lightbox-hint', label('lightboxHint'))
    hint.id = hintId

    dialog.appendChild(bar)
    dialog.appendChild(frame)
    dialog.appendChild(caption)
    dialog.appendChild(hint)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    var zoomed = false
    function setZoom(next) {
      zoomed = next === true
      frame.classList.toggle('is-zoomed', zoomed)
      zoomButton.setAttribute('aria-pressed', zoomed ? 'true' : 'false')
      zoomButton.textContent = zoomed
        ? label('lightboxZoomOut')
        : label('lightboxZoomIn')
    }

    var closed = false
    function close() {
      if (closed) {
        return
      }
      closed = true
      document.removeEventListener('keydown', onKeydown, true)
      if (overlay.parentNode !== null) {
        overlay.parentNode.removeChild(overlay)
      }
      if (opener !== null && typeof opener.focus === 'function') {
        opener.focus()
      }
      if (typeof settings.onClose === 'function') {
        settings.onClose()
      }
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      var stops = focusableWithin(dialog)
      if (stops.length === 0) {
        event.preventDefault()
        return
      }
      var first = stops[0]
      var last = stops[stops.length - 1]
      var active = document.activeElement
      if (event.shiftKey) {
        if (active === first || dialog.contains(active) === false) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (active === last || dialog.contains(active) === false) {
        event.preventDefault()
        first.focus()
      }
    }

    closeButton.addEventListener('click', close)
    zoomButton.addEventListener('click', function () {
      setZoom(!zoomed)
    })
    image.addEventListener('click', function () {
      setZoom(!zoomed)
    })
    overlay.addEventListener('mousedown', function (event) {
      // Only the backdrop dismisses; a mousedown inside the dialog must not.
      if (event.target === overlay) {
        // A mousedown's default action moves focus to the nearest focusable
        // ancestor — the body, for this backdrop — and that default runs after
        // this handler, so it would undo the focus return inside `close()`.
        // Suppressing it is what makes a backdrop dismissal hand the reader
        // back to the thumbnail they came from instead of to the top of the
        // document.
        event.preventDefault()
        close()
      }
    })
    document.addEventListener('keydown', onKeydown, true)

    setZoom(false)
    closeButton.focus()

    return { element: overlay, close: close, setZoom: setZoom }
  }

  // -------------------------------------------------------------- grid card

  function commandText(item) {
    return Array.isArray(item.commands) ? item.commands.join('\n') : ''
  }

  function flashButton(button, label, doneKey, failKey, ok) {
    var original = button.textContent
    button.textContent = label(ok ? doneKey : failKey)
    global.setTimeout(function () {
      button.textContent = original
    }, CopiedRevertMilliseconds)
  }

  /**
   * One gallery card: a link to the screenshot's own page, plus zoom and copy
   * buttons beside (never inside) the link, because nesting interactive
   * elements inside an anchor is invalid and unreachable by keyboard.
   */
  function buildCard(context, item, index) {
    var label = context.label
    var cell = element('li', 'dm-shot-cell')
    cell.setAttribute('data-file', item.file)
    cell.setAttribute('data-index', String(index))

    var link = element('a', 'dm-shot-card')
    link.href = context.hrefFor(item)
    link.setAttribute('aria-label', label('open', { file: item.file }))

    var thumb = element('img', 'dm-shot-thumb')
    thumb.src = context.srcFor(item)
    thumb.alt =
      item.altText !== null
        ? item.altText
        : item.caption !== null
        ? item.caption
        : label('imageAltMissing', { file: item.file })
    thumb.setAttribute('loading', 'lazy')
    thumb.setAttribute('decoding', 'async')
    if (item.width !== null && item.height !== null) {
      // Intrinsic size reserves the row height, so the grid does not jump as
      // 92 lazy images arrive.
      thumb.setAttribute('width', String(item.width))
      thumb.setAttribute('height', String(item.height))
    }
    link.appendChild(thumb)

    var body = element('div', 'dm-shot-card-body')
    body.appendChild(element('span', 'dm-shot-card-name', item.file))
    var captionNode = element(
      'span',
      'dm-shot-card-caption',
      item.caption !== null ? item.caption : label('noCaption')
    )
    if (item.caption === null) {
      captionNode.classList.add('is-unrecorded')
    }
    body.appendChild(captionNode)

    var metaParts = []
    metaParts.push(item.batch !== null ? item.batch : label('unrecorded'))
    metaParts.push(item.platform !== null ? item.platform : label('unrecorded'))
    metaParts.push(
      item.width !== null && item.height !== null
        ? item.width + '×' + item.height
        : label('noDimensions')
    )
    body.appendChild(
      element('span', 'dm-shot-card-meta', metaParts.join(' · '))
    )

    var facts = coverage(item)
    var receipt = element(
      'span',
      'dm-shot-card-receipt',
      facts.hasReceipts
        ? label('receiptPresent', { count: facts.receiptCount })
        : label('receiptAbsent')
    )
    receipt.classList.add(facts.hasReceipts ? 'is-present' : 'is-absent')
    body.appendChild(receipt)
    link.appendChild(body)
    cell.appendChild(link)

    var actions = element('div', 'dm-shot-card-actions')
    var zoom = element('button', 'dm-shot-action', label('zoom'))
    zoom.type = 'button'
    zoom.setAttribute('aria-label', label('zoom') + ' ' + item.file)
    zoom.addEventListener('click', function () {
      openLightbox({
        item: item,
        src: context.srcFor(item),
        strings: context.getStrings(),
        opener: zoom,
      })
    })
    actions.appendChild(zoom)

    var copy = element('button', 'dm-shot-action', label('copyCommand'))
    copy.type = 'button'
    copy.setAttribute('aria-label', label('copyCommand') + ' ' + item.file)
    var command = commandText(item)
    if (command === '') {
      // Never invent a command. The button says there is none on record.
      copy.disabled = true
      copy.textContent = label('noCommand')
    } else {
      copy.addEventListener('click', function () {
        copyText(command, {
          onDone: function () {
            flashButton(copy, label, 'copied', 'copyFailed', true)
            context.announce(label('copied'))
          },
          onFail: function () {
            flashButton(copy, label, 'copied', 'copyFailed', false)
            context.announce(label('copyFailed'))
          },
        })
      })
    }
    actions.appendChild(copy)
    cell.appendChild(actions)

    return cell
  }

  // -------------------------------------------------------------- gallery UI

  /**
   * Mounts the searchable, filterable grid.
   *
   * options.container      element to render into (required)
   * options.items          screenshot records
   * options.strings        the caller's string table (see StringKeys)
   * options.imageBase      prefix for `file` when a record has no `src`
   * options.hrefFor        function(item) -> per-screenshot page URL
   * options.regexJob       a DesktopMaterialRegexJob runner, when available
   * options.onRegexBuilder function(api) mounted into the builder panel, so
   *                        the page's own full regex builder anchors beside
   *                        this search field rather than in a distant dialog
   */
  function create(options) {
    var settings = options === null || options === undefined ? {} : options
    var container = settings.container
    if (container === null || container === undefined) {
      throw new Error('DocsScreenshotGallery.create needs options.container')
    }

    var strings = settings.strings || {}
    var label = labeller(function () {
      return strings
    })
    var supplied = Array.isArray(settings.items) ? settings.items : []
    var items = normalizeItems(supplied)
    var skipped = supplied.length - items.length
    var imageBase = textOf(settings.imageBase)

    function srcFor(item) {
      return item.src !== null ? item.src : imageBase + item.file
    }
    var hrefFor =
      typeof settings.hrefFor === 'function'
        ? settings.hrefFor
        : function (item) {
            return item.href !== null ? item.href : '#' + item.file
          }

    var runner =
      settings.regexJob !== undefined && settings.regexJob !== null
        ? settings.regexJob
        : null

    var state = {
      query: '',
      mode: 'text',
      flags: 'i',
      filters: { batch: 'all', platform: 'all', receipt: 'any' },
      outcome: null,
    }
    if (nullableText(settings.initialQuery) !== null) {
      state.query = textOf(settings.initialQuery)
    }
    if (settings.initialMode === 'regex') {
      state.mode = 'regex'
    }
    if (settings.initialFilters) {
      state.filters = normalizeFilters(settings.initialFilters)
    }

    // --------------------------------------------------------------- markup

    var root = element('section', 'dm-shots')
    root.setAttribute('aria-label', label('gallery'))

    var searchBlock = element('div', 'dm-shots-search')
    var searchId = uniqueId('dm-shots-query')
    var statusId = uniqueId('dm-shots-status')
    var errorId = uniqueId('dm-shots-error')

    var searchLabel = element('label', 'dm-shots-search-label')
    searchLabel.setAttribute('for', searchId)
    searchLabel.textContent = label('searchLabel')

    // Says which fields are searched, so a reader whose query found nothing
    // knows whether they were searching where they thought they were.
    var describeId = uniqueId('dm-shots-describe')
    var describeNode = element(
      'p',
      'dm-shots-search-describe',
      label('searchDescribe')
    )
    describeNode.id = describeId

    var fieldRow = element('div', 'dm-shots-search-row')
    var input = document.createElement('input')
    input.type = 'search'
    input.id = searchId
    input.className = 'dm-shots-search-input'
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('spellcheck', 'false')
    input.setAttribute('placeholder', label('searchPlaceholder'))
    input.setAttribute(
      'aria-describedby',
      describeId + ' ' + statusId + ' ' + errorId
    )
    input.maxLength = MaximumQueryLength
    input.value = state.query

    var builderButton = element(
      'button',
      'dm-shots-builder-toggle',
      label('builderOpen')
    )
    builderButton.type = 'button'
    builderButton.setAttribute('aria-expanded', 'false')
    var builderPanelId = uniqueId('dm-shots-builder')
    builderButton.setAttribute('aria-controls', builderPanelId)

    fieldRow.appendChild(input)
    fieldRow.appendChild(builderButton)

    var modeRow = element('div', 'dm-shots-mode')
    var modeId = uniqueId('dm-shots-regex')
    var modeInput = document.createElement('input')
    modeInput.type = 'checkbox'
    modeInput.id = modeId
    modeInput.className = 'dm-shots-mode-input'
    modeInput.checked = state.mode === 'regex'
    var modeLabel = element(
      'label',
      'dm-shots-mode-label',
      label('regexToggle')
    )
    modeLabel.setAttribute('for', modeId)
    modeRow.appendChild(modeInput)
    modeRow.appendChild(modeLabel)
    var modeHint = element('p', 'dm-shots-mode-hint', label('regexHint'))
    modeRow.appendChild(modeHint)

    // The builder is anchored to this field, inline, so the pattern belongs to
    // the search bar the reader is already typing in.
    var builderPanel = element('div', 'dm-shots-builder-panel')
    builderPanel.id = builderPanelId
    builderPanel.setAttribute('role', 'group')
    builderPanel.setAttribute('aria-label', label('builderRegion'))
    builderPanel.hidden = true

    var errorNode = element('p', 'dm-shots-error')
    errorNode.id = errorId
    errorNode.setAttribute('role', 'alert')
    errorNode.hidden = true

    searchBlock.appendChild(searchLabel)
    searchBlock.appendChild(describeNode)
    searchBlock.appendChild(fieldRow)
    searchBlock.appendChild(modeRow)
    searchBlock.appendChild(builderPanel)
    searchBlock.appendChild(errorNode)
    root.appendChild(searchBlock)

    var filterBlock = element('div', 'dm-shots-filters')
    filterBlock.setAttribute('role', 'group')
    filterBlock.setAttribute('aria-label', label('filters'))

    function selectControl(labelKey) {
      var wrap = element('div', 'dm-shots-filter')
      var id = uniqueId('dm-shots-filter')
      var text = element('label', 'dm-shots-filter-label', label(labelKey))
      text.setAttribute('for', id)
      var select = document.createElement('select')
      select.id = id
      select.className = 'dm-shots-filter-select'
      wrap.appendChild(text)
      wrap.appendChild(select)
      return { wrap: wrap, select: select, labelNode: text, labelKey: labelKey }
    }

    var batchControl = selectControl('filterBatch')
    var platformControl = selectControl('filterPlatform')
    var receiptControl = selectControl('filterReceipt')
    var resetButton = element(
      'button',
      'dm-shots-filters-reset',
      label('filtersReset')
    )
    resetButton.type = 'button'
    filterBlock.appendChild(batchControl.wrap)
    filterBlock.appendChild(platformControl.wrap)
    filterBlock.appendChild(receiptControl.wrap)
    filterBlock.appendChild(resetButton)
    root.appendChild(filterBlock)

    var statusNode = element('p', 'dm-shots-status')
    statusNode.id = statusId
    statusNode.setAttribute('role', 'status')
    root.appendChild(statusNode)

    var skippedNode = element('p', 'dm-shots-skipped')
    skippedNode.hidden = skipped <= 0
    if (skipped > 0) {
      // Records without a file name cannot be rendered; say how many rather
      // than quietly shrinking the gallery.
      skippedNode.textContent = label('skipped', { count: skipped })
    }
    root.appendChild(skippedNode)

    var hintId = uniqueId('dm-shots-hint')
    var hintNode = element('p', 'dm-shots-hint', label('gridHint'))
    hintNode.id = hintId
    root.appendChild(hintNode)

    var grid = element('ul', 'dm-shots-grid')
    grid.setAttribute('role', 'list')
    grid.setAttribute('aria-label', label('gridLabel'))
    grid.setAttribute('aria-describedby', hintId)
    root.appendChild(grid)

    var emptyNode = element('p', 'dm-shots-empty', label('empty'))
    emptyNode.hidden = true
    root.appendChild(emptyNode)

    var liveNode = element('p', 'dm-shots-live dm-shots-visually-hidden')
    liveNode.setAttribute('role', 'status')
    liveNode.setAttribute('aria-live', 'polite')
    root.appendChild(liveNode)

    container.appendChild(root)

    function announce(text) {
      liveNode.textContent = text
    }

    var context = {
      label: label,
      getStrings: function () {
        return strings
      },
      srcFor: srcFor,
      hrefFor: hrefFor,
      announce: announce,
    }

    // -------------------------------------------------------------- filters

    function fillFilters() {
      var data = facets(items)
      function fill(select, entries, current, absent) {
        select.textContent = ''
        var all = element('option', null, label('filterAll'))
        all.value = 'all'
        select.appendChild(all)
        for (var i = 0; i < entries.length; i++) {
          var option = element(
            'option',
            null,
            entries[i].id + ' (' + entries[i].count + ')'
          )
          option.value = entries[i].id
          select.appendChild(option)
        }
        if (absent > 0) {
          // Offered only when some screenshot really is missing this value, so
          // the control never advertises an empty group.
          var unrecordedOption = element(
            'option',
            null,
            label('filterUnrecorded') + ' (' + absent + ')'
          )
          unrecordedOption.value = 'unrecorded'
          select.appendChild(unrecordedOption)
        }
        select.value = current
        if (select.value !== current) {
          // A stored filter naming a value the data no longer has must not
          // leave the control showing something it is not filtering by.
          select.value = 'all'
        }
      }
      fill(
        batchControl.select,
        data.batches,
        state.filters.batch,
        data.unrecorded.batch
      )
      fill(
        platformControl.select,
        data.platforms,
        state.filters.platform,
        data.unrecorded.platform
      )
      state.filters.batch = batchControl.select.value
      state.filters.platform = platformControl.select.value

      receiptControl.select.textContent = ''
      var receiptOptions = [
        { value: 'any', key: 'filterReceiptAny', count: data.total },
        { value: 'with', key: 'filterReceiptWith', count: data.receipts.with },
        {
          value: 'without',
          key: 'filterReceiptWithout',
          count: data.receipts.without,
        },
      ]
      for (var r = 0; r < receiptOptions.length; r++) {
        var entry = receiptOptions[r]
        var node = element(
          'option',
          null,
          label(entry.key) + ' (' + entry.count + ')'
        )
        node.value = entry.value
        receiptControl.select.appendChild(node)
      }
      receiptControl.select.value = state.filters.receipt
    }

    // ---------------------------------------------------------- rendering

    var visible = []

    /**
     * What the currently rendered cards were built from. Rebuilding the grid
     * throws away live nodes, and a node thrown away between a reader's
     * mousedown and mouseup never receives their click — so an identical
     * render must reuse the cards rather than replace them. The epoch covers
     * everything a card reads that the file list does not: the string table
     * and the item records themselves.
     */
    var renderedCards = null
    var cardEpoch = 0

    function cardSignature(list) {
      var parts = [String(cardEpoch)]
      for (var i = 0; i < list.length; i++) {
        parts.push(list[i].file)
      }
      return parts.join('\u0000')
    }

    function render() {
      var result = filterItems(items, state, {
        budgetMilliseconds: settings.budgetMilliseconds,
        clock: settings.clock,
      })
      visible = result.items

      var signature = cardSignature(visible)
      if (
        signature !== renderedCards ||
        grid.children.length !== visible.length
      ) {
        grid.textContent = ''
        for (var i = 0; i < visible.length; i++) {
          grid.appendChild(buildCard(context, visible[i], i))
        }
        renderedCards = signature
      }

      statusNode.textContent = result.filtersActive
        ? label('countFiltered', {
            visible: result.visible,
            total: result.total,
            matching: result.passedFilters,
          })
        : label('count', { visible: result.visible, total: result.total })

      emptyNode.hidden = visible.length !== 0
      grid.hidden = visible.length === 0

      if (result.pending) {
        errorNode.hidden = false
        errorNode.textContent = label('searchPending')
        input.removeAttribute('aria-invalid')
      } else if (result.error !== null) {
        errorNode.hidden = false
        errorNode.textContent =
          label(errorStringKey(result.error.code), {
            detail: textOf(result.error.detail),
            limit: result.limit,
          }) +
          ' ' +
          label('errorFailOpen')
        input.setAttribute('aria-invalid', 'true')
      } else {
        errorNode.hidden = true
        errorNode.textContent = ''
        input.removeAttribute('aria-invalid')
      }
      return result
    }

    // -------------------------------------------------------- regex routing

    var runToken = 0

    function evaluate() {
      var compiled = compileQuery(state)
      if (
        compiled.mode !== 'regex' ||
        !compiled.active ||
        compiled.error !== null ||
        runner === null ||
        items.length > MaximumWorkerHits
      ) {
        // Plain text, a rejected pattern, no runner, or a list longer than the
        // worker's hit cap: the bounded local path answers, and its bounds are
        // what keep that safe.
        state.outcome = null
        render()
        return
      }

      // A reader's pattern is handed to the shared terminable worker rather
      // than compiled here, so a catastrophic pattern cannot freeze the page.
      runToken++
      var token = runToken
      state.outcome = { status: 'pending' }
      render()
      runner.run(
        'screenshot-gallery',
        {
          operation: 'search',
          pattern: compiled.pattern,
          flags: compiled.flags,
          catalog: searchCatalog(items),
          maximumResults: MaximumWorkerHits,
        },
        function (data) {
          if (token !== runToken) {
            return
          }
          var matched = {}
          var hits = Array.isArray(data.hits) ? data.hits : []
          for (var i = 0; i < hits.length; i++) {
            matched[hits[i].catalogIndex] = true
          }
          state.outcome = { status: 'ready', matched: matched }
          render()
        },
        function (code, detail) {
          if (token !== runToken) {
            return
          }
          state.outcome = { status: 'error', code: code, detail: detail }
          render()
        }
      )
    }

    // ------------------------------------------------------- interactions

    var debounce = null

    function queueEvaluate() {
      if (debounce !== null) {
        global.clearTimeout(debounce)
      }
      debounce = global.setTimeout(function () {
        debounce = null
        evaluate()
      }, InputDebounceMilliseconds)
    }

    input.addEventListener('input', function () {
      state.query = input.value
      queueEvaluate()
    })
    input.addEventListener('change', function () {
      if (input.value === state.query) {
        // A native `change` fires when the field loses focus after being
        // edited, which is exactly the mousedown that moves the reader onto a
        // card. The `input` handler already recorded this value, so there is
        // nothing to recompute, and recomputing here would run mid-gesture.
        return
      }
      state.query = input.value
      evaluate()
    })
    modeInput.addEventListener('change', function () {
      state.mode = modeInput.checked ? 'regex' : 'text'
      evaluate()
    })

    batchControl.select.addEventListener('change', function () {
      state.filters.batch = batchControl.select.value
      render()
    })
    platformControl.select.addEventListener('change', function () {
      state.filters.platform = platformControl.select.value
      render()
    })
    receiptControl.select.addEventListener('change', function () {
      state.filters.receipt = receiptControl.select.value
      render()
    })
    resetButton.addEventListener('click', function () {
      state.filters = { batch: 'all', platform: 'all', receipt: 'any' }
      fillFilters()
      render()
    })

    builderButton.addEventListener('click', function () {
      var open = builderPanel.hidden
      builderPanel.hidden = !open
      builderButton.setAttribute('aria-expanded', open ? 'true' : 'false')
      builderButton.textContent = open
        ? label('builderClose')
        : label('builderOpen')
      if (!open) {
        // Closing returns focus to the field the pattern belongs to.
        input.focus()
      }
    })

    if (typeof settings.onRegexBuilder === 'function') {
      settings.onRegexBuilder({
        panel: builderPanel,
        input: input,
        setPattern: function (pattern, flags) {
          state.mode = 'regex'
          modeInput.checked = true
          state.query = textOf(pattern)
          input.value = state.query
          if (nullableText(flags) !== null) {
            state.flags = textOf(flags)
          }
          evaluate()
        },
        state: function () {
          return {
            query: state.query,
            mode: state.mode,
            flags: state.flags,
          }
        },
      })
    }

    /** How many cards share the top row, so Up/Down move a visual row. */
    function columnCount() {
      var cells = grid.children
      if (cells.length === 0) {
        return 1
      }
      var top = cells[0].offsetTop
      var columns = 0
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].offsetTop !== top) {
          break
        }
        columns++
      }
      return columns > 0 ? columns : 1
    }

    var MoveKeys = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      Home: 'first',
      End: 'last',
      PageUp: 'pageUp',
      PageDown: 'pageDown',
    }

    grid.addEventListener('keydown', function (event) {
      var direction = MoveKeys[event.key]
      if (direction === undefined || event.altKey || event.ctrlKey) {
        return
      }
      var cell = event.target.closest
        ? event.target.closest('.dm-shot-cell')
        : null
      if (cell === null) {
        return
      }
      var from = parseInt(cell.getAttribute('data-index'), 10)
      if (isNaN(from)) {
        return
      }
      var to = resolveGridMove(
        grid.children.length,
        from,
        direction,
        columnCount()
      )
      if (to === from || to < 0) {
        return
      }
      var target = grid.children[to].querySelector('.dm-shot-card')
      if (target === null) {
        return
      }
      event.preventDefault()
      target.focus()
    })

    fillFilters()
    evaluate()

    return {
      element: root,
      state: function () {
        return {
          query: state.query,
          mode: state.mode,
          flags: state.flags,
          filters: normalizeFilters(state.filters),
          visible: visible.length,
          total: items.length,
          skipped: skipped,
        }
      },
      items: function () {
        return items.slice(0)
      },
      visible: function () {
        return visible.slice(0)
      },
      setItems: function (next) {
        var incoming = Array.isArray(next) ? next : []
        // New records can carry the same file names with different facts, so
        // the cards must be rebuilt even when the visible list looks identical.
        cardEpoch++
        items = normalizeItems(incoming)
        skipped = incoming.length - items.length
        skippedNode.hidden = skipped <= 0
        if (skipped > 0) {
          skippedNode.textContent = label('skipped', { count: skipped })
        }
        fillFilters()
        evaluate()
      },
      setQuery: function (query, mode) {
        state.query = textOf(query)
        input.value = state.query
        if (mode === 'regex' || mode === 'text') {
          state.mode = mode
          modeInput.checked = mode === 'regex'
        }
        evaluate()
      },
      setFilters: function (next) {
        state.filters = normalizeFilters(next)
        fillFilters()
        render()
      },
      setStrings: function (next) {
        strings = next || {}
        // Every card renders caller-supplied copy, so a language change has to
        // rebuild them even though the same screenshots stay visible.
        cardEpoch++
        root.setAttribute('aria-label', label('gallery'))
        searchLabel.textContent = label('searchLabel')
        describeNode.textContent = label('searchDescribe')
        input.setAttribute('placeholder', label('searchPlaceholder'))
        modeLabel.textContent = label('regexToggle')
        modeHint.textContent = label('regexHint')
        builderButton.textContent = builderPanel.hidden
          ? label('builderOpen')
          : label('builderClose')
        builderPanel.setAttribute('aria-label', label('builderRegion'))
        filterBlock.setAttribute('aria-label', label('filters'))
        batchControl.labelNode.textContent = label('filterBatch')
        platformControl.labelNode.textContent = label('filterPlatform')
        receiptControl.labelNode.textContent = label('filterReceipt')
        resetButton.textContent = label('filtersReset')
        hintNode.textContent = label('gridHint')
        grid.setAttribute('aria-label', label('gridLabel'))
        emptyNode.textContent = label('empty')
        if (skipped > 0) {
          skippedNode.textContent = label('skipped', { count: skipped })
        }
        fillFilters()
        render()
      },
      focus: function () {
        input.focus()
      },
      refresh: render,
      destroy: function () {
        if (debounce !== null) {
          global.clearTimeout(debounce)
          debounce = null
        }
        if (root.parentNode !== null) {
          root.parentNode.removeChild(root)
        }
      },
    }
  }

  // ------------------------------------------------------- single-shot page

  function definitionRow(list, term, value, unrecordedText) {
    var dt = element('dt', 'dm-shot-meta-term', term)
    var recorded = nullableText(value) !== null
    var dd = element(
      'dd',
      'dm-shot-meta-value',
      recorded ? textOf(value) : unrecordedText
    )
    if (!recorded) {
      dd.classList.add('is-unrecorded')
    }
    list.appendChild(dt)
    list.appendChild(dd)
  }

  /**
   * Mounts one screenshot's own page: the hero frame with zoom and lightbox,
   * the recorded facts (with every gap named rather than filled), the
   * regeneration command, and previous/next both as links and as keyboard
   * shortcuts.
   */
  function createSingle(options) {
    var settings = options === null || options === undefined ? {} : options
    var container = settings.container
    if (container === null || container === undefined) {
      throw new Error(
        'DocsScreenshotGallery.createSingle needs options.container'
      )
    }
    var strings = settings.strings || {}
    var label = labeller(function () {
      return strings
    })
    var items = normalizeItems(settings.items)
    var item = normalizeItem(
      settings.item !== undefined && settings.item !== null
        ? settings.item
        : items.length > 0
        ? items[0]
        : {}
    )
    var imageBase = textOf(settings.imageBase)
    function srcFor(record) {
      return record.src !== null ? record.src : imageBase + record.file
    }
    var hrefFor =
      typeof settings.hrefFor === 'function'
        ? settings.hrefFor
        : function (record) {
            return record.href !== null ? record.href : '#' + record.file
          }

    var around = neighbours(items, item.file)

    var root = element('section', 'dm-shot-page')
    root.setAttribute('aria-label', label('gallery'))

    var figure = element('figure', 'dm-shot-hero')
    var frame = element('div', 'dm-shot-hero-frame')
    frame.setAttribute('tabindex', '0')
    frame.setAttribute('role', 'group')
    frame.setAttribute(
      'aria-label',
      label('lightboxLabel', { file: item.file })
    )
    var image = element('img', 'dm-shot-hero-image')
    image.src = srcFor(item)
    image.alt =
      item.altText !== null
        ? item.altText
        : item.caption !== null
        ? item.caption
        : label('imageAltMissing', { file: item.file })
    if (item.width !== null && item.height !== null) {
      image.setAttribute('width', String(item.width))
      image.setAttribute('height', String(item.height))
    }
    image.setAttribute('decoding', 'async')
    frame.appendChild(image)
    figure.appendChild(frame)

    var figcaption = element(
      'figcaption',
      'dm-shot-hero-caption',
      item.caption !== null ? item.caption : label('noCaption')
    )
    if (item.caption === null) {
      figcaption.classList.add('is-unrecorded')
    }
    figure.appendChild(figcaption)
    root.appendChild(figure)

    var actions = element('div', 'dm-shot-page-actions')
    var zoomButton = element('button', 'dm-shot-action', label('zoom'))
    zoomButton.type = 'button'
    zoomButton.addEventListener('click', function () {
      openLightbox({
        item: item,
        src: srcFor(item),
        strings: strings,
        opener: zoomButton,
      })
    })
    actions.appendChild(zoomButton)

    var copyButton = element('button', 'dm-shot-action', label('copyCommand'))
    copyButton.type = 'button'
    var command = commandText(item)
    if (command === '') {
      copyButton.disabled = true
      copyButton.textContent = label('noCommand')
    } else {
      copyButton.addEventListener('click', function () {
        copyText(command, {
          onDone: function () {
            flashButton(copyButton, label, 'copied', 'copyFailed', true)
            live.textContent = label('copied')
          },
          onFail: function () {
            flashButton(copyButton, label, 'copied', 'copyFailed', false)
            live.textContent = label('copyFailed')
          },
        })
      })
    }
    actions.appendChild(copyButton)
    root.appendChild(actions)

    var meta = element('dl', 'dm-shot-meta')
    var facts = coverage(item)
    var gapsNode = element('p', 'dm-shot-gaps')

    /**
     * Rebuilt rather than written once, because every term and every
     * "not recorded" placeholder in this list is caller-supplied copy: a
     * language-mode or playfulness change has to reach the facts table too,
     * not just the buttons around it. The recorded values themselves are
     * re-read from the same item, so nothing here can drift from the record.
     */
    function paintMeta() {
      meta.textContent = ''
      var unrecorded = label('unrecorded')
      definitionRow(meta, label('metaFile'), item.file, unrecorded)
      definitionRow(meta, label('metaScene'), item.scene, unrecorded)
      definitionRow(meta, label('metaBatch'), item.batch, unrecorded)
      definitionRow(meta, label('metaPlatform'), item.platform, unrecorded)
      definitionRow(meta, label('metaSection'), item.section, unrecorded)
      definitionRow(
        meta,
        label('metaDimensions'),
        item.width !== null && item.height !== null
          ? item.width + '×' + item.height
          : null,
        label('noDimensions')
      )
      definitionRow(
        meta,
        label('metaBytes'),
        item.bytes !== null ? String(item.bytes) : null,
        label('noBytes')
      )
      definitionRow(meta, label('metaSha'), item.sha256, unrecorded)
      definitionRow(
        meta,
        label('metaCaption'),
        item.caption,
        label('noCaption')
      )
      definitionRow(meta, label('metaAlt'), item.altText, label('noAltText'))
      definitionRow(
        meta,
        label('metaInteraction'),
        item.interaction,
        unrecorded
      )
      definitionRow(
        meta,
        label('metaCommands'),
        command === '' ? null : command,
        label('noCommand')
      )
      definitionRow(
        meta,
        label('metaReceipts'),
        item.receipts.length > 0 ? item.receipts.join('\n') : null,
        label('receiptAbsent')
      )

      gapsNode.hidden = facts.gaps.length === 0
      if (facts.gaps.length > 0) {
        // The page states its own gaps in one place, so a reader is never left
        // to assume an absent caption or receipt simply was not displayed.
        gapsNode.textContent = label('metaGaps', {
          gaps: facts.gaps.join(', '),
          count: facts.gaps.length,
        })
      } else {
        gapsNode.textContent = ''
      }
    }

    paintMeta()
    root.appendChild(meta)
    root.appendChild(gapsNode)

    var nav = element('nav', 'dm-shot-nav')
    nav.setAttribute('aria-label', label('gallery'))
    var previousLink = element('a', 'dm-shot-nav-previous')
    var nextLink = element('a', 'dm-shot-nav-next')
    var position = element('p', 'dm-shot-nav-position')

    function paintNav() {
      if (around.previous === null) {
        previousLink.hidden = true
        nextLink.hidden = true
        position.textContent = label('position', { index: 0, count: 0 })
        return
      }
      previousLink.hidden = false
      nextLink.hidden = false
      previousLink.href = hrefFor(around.previous)
      previousLink.textContent = label('previous')
      previousLink.setAttribute(
        'aria-label',
        label('previous') + ' — ' + around.previous.file
      )
      previousLink.setAttribute('aria-keyshortcuts', 'ArrowLeft')
      nextLink.href = hrefFor(around.next)
      nextLink.textContent = label('next')
      nextLink.setAttribute(
        'aria-label',
        label('next') + ' — ' + around.next.file
      )
      nextLink.setAttribute('aria-keyshortcuts', 'ArrowRight')
      position.textContent = label('position', {
        index: around.index + 1,
        count: around.count,
        file: item.file,
      })
    }

    nav.appendChild(previousLink)
    nav.appendChild(position)
    nav.appendChild(nextLink)
    root.appendChild(nav)

    var shortcuts = element('p', 'dm-shot-shortcuts', label('shortcuts'))
    root.appendChild(shortcuts)

    var live = element('p', 'dm-shots-live dm-shots-visually-hidden')
    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    root.appendChild(live)

    container.appendChild(root)
    paintNav()

    var navigate =
      typeof settings.onNavigate === 'function'
        ? settings.onNavigate
        : function (target) {
            if (global.location) {
              global.location.href = hrefFor(target)
            }
          }

    function onKeydown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }
      // A reader typing a pattern into a search field must keep their arrow
      // keys, so shortcuts stand down inside any text entry.
      if (isTypingTarget(event.target)) {
        return
      }
      var back =
        event.key === 'ArrowLeft' || event.key === '[' || event.key === 'p'
      var forward =
        event.key === 'ArrowRight' || event.key === ']' || event.key === 'n'
      if (!back && !forward) {
        return
      }
      var target = back ? around.previous : around.next
      if (target === null) {
        return
      }
      event.preventDefault()
      navigate(target)
    }

    document.addEventListener('keydown', onKeydown)

    return {
      element: root,
      item: function () {
        return item
      },
      neighbours: function () {
        return around
      },
      setStrings: function (next) {
        strings = next || {}
        root.setAttribute('aria-label', label('gallery'))
        frame.setAttribute(
          'aria-label',
          label('lightboxLabel', {
            file: item.file,
          })
        )
        zoomButton.textContent = label('zoom')
        copyButton.textContent =
          command === '' ? label('noCommand') : label('copyCommand')
        shortcuts.textContent = label('shortcuts')
        if (item.caption === null) {
          figcaption.textContent = label('noCaption')
        }
        if (item.altText === null && item.caption === null) {
          // The only alt text this module owns is the placeholder naming the
          // file; a recorded alt is the record's, and is never relabelled.
          image.alt = label('imageAltMissing', { file: item.file })
        }
        // Every term and placeholder in the facts table is caller copy too, so
        // a language change has to repaint it rather than leave the previous
        // language's words beside the current language's buttons.
        paintMeta()
        paintNav()
      },
      focus: function () {
        frame.focus()
      },
      destroy: function () {
        document.removeEventListener('keydown', onKeydown)
        if (root.parentNode !== null) {
          root.parentNode.removeChild(root)
        }
      },
    }
  }

  // ------------------------------------------------------------------- api

  var api = {
    // pure, unit-testable logic
    normalizeItem: normalizeItem,
    normalizeItems: normalizeItems,
    coverage: coverage,
    searchFields: searchFields,
    searchCatalog: searchCatalog,
    searchText: searchText,
    compileQuery: compileQuery,
    matchesQuery: matchesQuery,
    matchesText: matchesText,
    matchesFilters: matchesFilters,
    normalizeFilters: normalizeFilters,
    facets: facets,
    filterItems: filterItems,
    neighbours: neighbours,
    resolveGridMove: resolveGridMove,
    stringKeys: StringKeys,
    missingStrings: missingStrings,
    labelFor: labelFor,
    limits: {
      pattern: MaximumPatternLength,
      query: MaximumQueryLength,
      field: MaximumFieldLength,
      budgetMilliseconds: DefaultBudgetMilliseconds,
      workerHits: MaximumWorkerHits,
    },
    // DOM wiring
    create: create,
    createSingle: createSingle,
    openLightbox: openLightbox,
    copyText: copyText,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsScreenshotGallery = api
})(typeof window === 'undefined' ? globalThis : window)
