/**
 * Desktop Material documentation hub — browser-style tab system.
 *
 * The published site already ships a declarative ARIA tablist that works with
 * JavaScript switched off (`docs-hub.js` owns selection and hash routing). This
 * module is a strictly additive upgrade layered on top of that markup: it adds
 * overflow, reordering, pinning, grouping, the four tab searches, bulk close and
 * persistence, and it never takes over activation or routing. Selection stays
 * where it already lives, so an upgrade failure degrades to the plain strip
 * rather than to a dead navigation bar.
 *
 * The file is deliberately split in two halves:
 *
 *   Logic — `DocsTabs.logic`. Pure functions over plain objects: the match
 *           predicate, the bulk-close plan, the four searches, persistence and
 *           every group/order operation. Nothing here touches the DOM, a clock
 *           it cannot be handed, or storage, so Node can test all of it.
 *   DOM   — `DocsTabs.upgrade`. Builds and wires the surface using that logic.
 *
 * Two rules shape the design and are worth stating outright:
 *
 *   One predicate, two directions. "Close tabs containing text" and "Close tabs
 *   not containing text" are computed from a *single* evaluated hit set that is
 *   then inverted by set complement. There is no second compile and no second
 *   pass, so flags, casing, Unicode mode and scope cannot drift between the two
 *   actions — they are arithmetically the same match.
 *
 *   Bounded evaluation, failing closed. A reader's pattern is evaluated inside
 *   the site's existing regex worker (`docs-regex-job.js` + the `pages`
 *   operation) whenever one is available, because only a terminated worker is a
 *   real interruption of catastrophic backtracking. Where no worker exists — the
 *   Node tests, or a browser that refuses one — the synchronous fallback carries
 *   an explicit time budget and hard caps, and on any failure it reports an
 *   error state instead of a guess: searches fall back to *unfiltered* results
 *   plus that error, and bulk close refuses to run at all.
 *
 * Layout is mobile-first: the strip, its toolbar and its panels stay usable from
 * 320 CSS px upward, every interactive target keeps a 44 px minimum dimension,
 * and nothing depends on a hover-capable pointer.
 */
;(function (global) {
  'use strict'

  // ------------------------------------------------------------------ bounds

  var StateVersion = 1
  var StorageKeyPrefix = 'dm-docs-tabs-'

  /** Mirrors `docs-hub-regex-worker.js` so both paths reject the same input. */
  var MaximumPatternLength = 512
  var AllowedFlags = 'gimsuy'

  /** A tab label is a heading, not a corpus; anything longer is truncated. */
  var MaximumLabelLength = 512
  var MaximumGroupNameLength = 64

  /**
   * The worker's `pages` operation reports at most 200 hits and then sets
   * `truncated`, which would leave a bulk close guessing about the remainder.
   * Two visible strings per tab times 100 tabs stays inside that ceiling, so a
   * truncated reply is impossible rather than merely unlikely.
   */
  var MaximumMatchTabs = 100
  var MaximumMatchStrings = 200

  var DefaultBudgetMilliseconds = 750

  // ----------------------------------------------------------------- helpers

  function isString(value) {
    return typeof value === 'string'
  }

  function text(value) {
    return value === null || value === undefined ? '' : String(value)
  }

  function clampText(value, maximum) {
    var result = text(value)
    return result.length > maximum ? result.slice(0, maximum) : result
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === id) {
        return i
      }
    }
    return -1
  }

  function defaultNow() {
    return typeof Date.now === 'function' ? Date.now() : new Date().getTime()
  }

  /**
   * Keeps the first spelling of every id and drops anything not in `allowed`.
   * Persisted lists are reader-editable through devtools and survive renames,
   * so every restore path runs through this rather than trusting the array.
   */
  function keepKnown(list, allowed) {
    var result = []
    var seen = Object.create(null)
    if (!Array.isArray(list)) {
      return result
    }
    for (var i = 0; i < list.length; i++) {
      var id = list[i]
      if (
        isString(id) &&
        allowed[id] === true &&
        seen[id] !== true &&
        id !== ''
      ) {
        seen[id] = true
        result.push(id)
      }
    }
    return result
  }

  function membership(list) {
    var set = Object.create(null)
    for (var i = 0; i < list.length; i++) {
      set[list[i]] = true
    }
    return set
  }

  // ============================================================ match engine

  /**
   * Normalizes a raw search specification.
   *
   * `regex` must be a literal `true`. A truthy accident — a non-empty string
   * from an attribute, a `1` from a query parameter — stays plain text, because
   * silently promoting a query to a pattern changes what the reader's own text
   * means.
   */
  function normalizeSpec(spec) {
    var input = spec === null || spec === undefined ? {} : spec
    return {
      query: isString(input.query) ? input.query : '',
      regex: input.regex === true,
      flags: isString(input.flags) ? input.flags : 'i',
      caseSensitive: input.caseSensitive === true,
    }
  }

  /** The worker's flag rule, duplicated so both paths reject the same flags. */
  function normalizedFlags(flags) {
    if (!isString(flags) || flags.length > 6) {
      return null
    }
    var seen = Object.create(null)
    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i)
      if (AllowedFlags.indexOf(flag) === -1 || seen[flag] === true) {
        return null
      }
      seen[flag] = true
    }
    return flags
  }

  function errorDetail(error) {
    var message =
      error !== null && error !== undefined && error.message !== undefined
        ? String(error.message)
        : String(error)
    return message.slice(0, 300)
  }

  /**
   * Compiles one specification into a predicate over a single visible string.
   *
   * Compiling is cheap and bounded, so validation is answered synchronously and
   * the reader sees an invalid pattern immediately. Only *evaluation* needs the
   * worker.
   *
   * `ok: false` always comes with a `code`, and `test` still exists but answers
   * `false` for everything — an unusable predicate matches nothing, so a caller
   * that ignores the code cannot accidentally close every tab.
   */
  function compileMatcher(spec) {
    var normal = normalizeSpec(spec)
    var mode = normal.regex ? 'regex' : 'plain'

    function unusable(code, detail) {
      return {
        ok: false,
        mode: mode,
        spec: normal,
        code: code,
        detail: detail === undefined ? '' : detail,
        flags: '',
        test: function () {
          return false
        },
      }
    }

    if (normal.query === '') {
      return unusable('empty')
    }

    if (!normal.regex) {
      var needle = normal.caseSensitive
        ? normal.query
        : normal.query.toLowerCase()
      return {
        ok: true,
        mode: 'plain',
        spec: normal,
        code: '',
        detail: '',
        flags: normal.caseSensitive ? '' : 'i',
        test: function (value) {
          var haystack = clampText(value, MaximumLabelLength)
          if (!normal.caseSensitive) {
            haystack = haystack.toLowerCase()
          }
          return haystack.indexOf(needle) !== -1
        },
      }
    }

    if (normal.query.length > MaximumPatternLength) {
      return unusable('too-long-pattern')
    }
    var flags = normalizedFlags(normal.flags)
    if (flags === null) {
      return unusable('invalid-flags', 'Unsupported or repeated flag.')
    }

    // `g` is dropped from the tester. `RegExp.test` with `g` advances
    // `lastIndex`, so the very same pattern would answer differently for the
    // second tab than for the first. `y` is kept, because start-anchoring is a
    // meaning the reader asked for, and `lastIndex` is reset before every
    // string so it anchors at 0 each time instead of walking.
    var tester
    try {
      tester = new RegExp(normal.query, flags.replace(/g/g, ''))
    } catch (error) {
      return unusable('invalid', errorDetail(error))
    }
    return {
      ok: true,
      mode: 'regex',
      spec: normal,
      code: '',
      detail: '',
      flags: flags,
      test: function (value) {
        tester.lastIndex = 0
        return tester.test(clampText(value, MaximumLabelLength))
      },
    }
  }

  /**
   * The strings a match is allowed to see: the visible label and, when it says
   * something different, the visible tooltip. Never a route, an id, a panel
   * body or any other hidden datum — a reader closing "tabs containing text"
   * is matching what is written on the tab.
   *
   * They stay separate strings rather than being concatenated, so `^` and `$`
   * anchor to the label the reader can actually read.
   */
  function visibleStrings(entry) {
    var strings = []
    var label = text(entry === null || entry === undefined ? '' : entry.label)
    if (label !== '') {
      strings.push(label)
    }
    var title = text(entry === null || entry === undefined ? '' : entry.title)
    if (title !== '' && title !== label) {
      strings.push(title)
    }
    if (strings.length === 0) {
      strings.push('')
    }
    return strings
  }

  function nameStrings(group) {
    return [text(group === null || group === undefined ? '' : group.name)]
  }

  function failedMatch(matcher, total, code, detail) {
    return {
      ok: false,
      evaluated: false,
      mode: matcher.mode,
      code: code,
      detail: detail === undefined ? '' : detail,
      hits: [],
      total: total,
    }
  }

  /**
   * Evaluates one predicate across a list, on this thread, under a budget.
   *
   * The deadline is checked between items, which bounds a pattern that is merely
   * slow across many labels. It cannot preempt a single catastrophically
   * backtracking `test` call — no synchronous evaluator can — which is exactly
   * why the DOM layer prefers the terminable worker and this path exists as the
   * documented fallback. Failure returns an error state and an empty hit set;
   * callers decide what "closed" means for them.
   */
  function matchList(list, spec, options) {
    var settings = options === null || options === undefined ? {} : options
    var strings =
      typeof settings.strings === 'function' ? settings.strings : visibleStrings
    var now = typeof settings.now === 'function' ? settings.now : defaultNow
    var budget = Number.isInteger(settings.budgetMilliseconds)
      ? settings.budgetMilliseconds
      : DefaultBudgetMilliseconds
    var entries = Array.isArray(list) ? list : []
    var matcher = compileMatcher(spec)

    if (!matcher.ok) {
      return failedMatch(matcher, entries.length, matcher.code, matcher.detail)
    }
    if (entries.length > MaximumMatchTabs) {
      return failedMatch(matcher, entries.length, 'too-many-tabs')
    }

    var deadline = now() + budget
    var hits = []
    for (var i = 0; i < entries.length; i++) {
      if (now() > deadline) {
        return failedMatch(matcher, entries.length, 'timeout')
      }
      var candidates = strings(entries[i])
      for (var s = 0; s < candidates.length; s++) {
        if (matcher.test(candidates[s])) {
          hits.push(i)
          break
        }
      }
    }
    return {
      ok: true,
      evaluated: true,
      mode: matcher.mode,
      code: '',
      detail: '',
      hits: hits,
      total: entries.length,
    }
  }

  // ============================================================ bulk closing

  var ContainsMode = 'contains'
  var NotContainsMode = 'not-contains'

  /**
   * Turns one evaluated hit set into a reviewable close plan.
   *
   * This function never evaluates anything. It receives the hit set that
   * `matchList` (or the worker) already produced and derives both directions
   * from it: `contains` keeps the hits, `not-contains` keeps the complement.
   * That is the whole guarantee against the two actions disagreeing.
   *
   * Pinned tabs are excluded unless `includePinned` is a literal `true`, and
   * even then they are listed in `protectedPinned` so the preview can name the
   * protected tabs before anything closes.
   */
  function planBulkClose(list, result, options) {
    var settings = options === null || options === undefined ? {} : options
    var entries = Array.isArray(list) ? list : []
    var mode =
      settings.mode === NotContainsMode ? NotContainsMode : ContainsMode
    var includePinned = settings.includePinned === true
    var hitSet = Object.create(null)
    var hits = result && Array.isArray(result.hits) ? result.hits : []
    for (var h = 0; h < hits.length; h++) {
      hitSet[hits[h]] = true
    }

    var matched = []
    var candidates = []
    for (var i = 0; i < entries.length; i++) {
      var hit = hitSet[i] === true
      if (hit) {
        matched.push(entries[i])
      }
      if (mode === ContainsMode ? hit : !hit) {
        candidates.push(entries[i])
      }
    }

    var affected = []
    var protectedPinned = []
    for (var c = 0; c < candidates.length; c++) {
      var entry = candidates[c]
      if (entry.pinned === true) {
        protectedPinned.push(entry)
        if (includePinned) {
          affected.push(entry)
        }
        continue
      }
      affected.push(entry)
    }

    var runnable = result !== null && result !== undefined && result.ok === true
    return {
      mode: mode,
      matchMode: result && result.mode ? result.mode : 'plain',
      includePinned: includePinned,
      runnable: runnable,
      code: runnable ? '' : result && result.code ? result.code : 'empty',
      detail: runnable ? '' : result && result.detail ? result.detail : '',
      matched: matched,
      affected: runnable ? affected : [],
      protectedPinned: runnable ? protectedPinned : [],
      count: runnable ? affected.length : 0,
      total: entries.length,
    }
  }

  // ================================================================ searches

  /**
   * One independent search. Every surface owns its own object and the module
   * never hands the same one to two fields, so a query typed into the group
   * search cannot leak into the strip search or silently reuse its flags.
   */
  function createSearchState(id) {
    return {
      id: text(id),
      query: '',
      regex: false,
      flags: 'i',
      caseSensitive: false,
      status: 'idle',
      code: '',
      detail: '',
      filtered: false,
      results: [],
      total: 0,
    }
  }

  /** The four searches the tab rules require, as four distinct states. */
  function createSearchStates() {
    return {
      strip: createSearchState('strip'),
      group: createSearchState('group'),
      groups: createSearchState('groups'),
      master: createSearchState('master'),
    }
  }

  /**
   * Applies a search state to a list and returns a new state carrying the
   * results and the honest status.
   *
   * `idle` is an empty query: no filtering claimed, everything returned.
   * `error` keeps every entry and says why — an unfiltered list plus a visible
   * failure is recoverable, whereas an empty list that looks like "no matches"
   * quietly lies about the reader's own content.
   */
  function applySearch(state, list, options) {
    var current = state === null || state === undefined ? {} : state
    var entries = Array.isArray(list) ? list : []
    var spec = {
      query: current.query,
      regex: current.regex === true,
      flags: current.flags,
      caseSensitive: current.caseSensitive === true,
    }
    var settings = options === null || options === undefined ? {} : options
    var result =
      settings.result === undefined || settings.result === null
        ? matchList(entries, spec, settings)
        : settings.result

    var next = {
      id: text(current.id),
      query: text(current.query),
      regex: spec.regex,
      flags: text(current.flags),
      caseSensitive: spec.caseSensitive,
      status: 'ok',
      code: result.code,
      detail: result.detail,
      filtered: true,
      results: [],
      total: entries.length,
    }

    if (spec.query === '') {
      next.status = 'idle'
      next.code = ''
      next.filtered = false
      next.results = entries.slice(0)
      return next
    }
    if (result.ok !== true) {
      next.status = result.code === 'timeout' ? 'timeout' : 'error'
      next.filtered = false
      next.results = entries.slice(0)
      return next
    }
    for (var i = 0; i < result.hits.length; i++) {
      next.results.push(entries[result.hits[i]])
    }
    return next
  }

  // =============================================================== the model

  /**
   * The persisted shape of one strip.
   *
   *   order    every known tab id exactly once, the canonical ordering
   *   pinned   the pinned region's own order, a subset of `order`
   *   hidden   tabs a bulk close removed from the strip, still in `order` so a
   *            restore is a list edit rather than a recovery
   *   groups   group records in display order; `members` is a subset of `order`
   *
   * Keeping `order` complete is what makes "removing a group never closes a
   * tab" structurally true: a group record is an overlay, and dropping it can
   * only ever return its members to the ungrouped region.
   */
  function defaultState(knownIds) {
    var allowed = membership(Array.isArray(knownIds) ? knownIds : [])
    return {
      version: StateVersion,
      order: keepKnown(knownIds, allowed),
      pinned: [],
      hidden: [],
      groups: [],
    }
  }

  function cloneGroup(group) {
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      collapsed: group.collapsed === true,
      members: group.members.slice(0),
    }
  }

  function cloneState(state) {
    var groups = []
    for (var i = 0; i < state.groups.length; i++) {
      groups.push(cloneGroup(state.groups[i]))
    }
    return {
      version: StateVersion,
      order: state.order.slice(0),
      pinned: state.pinned.slice(0),
      hidden: state.hidden.slice(0),
      groups: groups,
    }
  }

  /**
   * A group colour is validated by `DocsColor` when the page has it, because
   * that parser is the site's single definition of a colour. In Node — and in a
   * page that loaded this module alone — an explicit hex check stands in, so an
   * unrecognisable value is dropped rather than written into a style attribute.
   */
  function normalizeColor(value) {
    if (value === null || value === undefined || value === '') {
      return null
    }
    var raw = text(value).trim()
    var color = global.DocsColor
    if (
      color !== undefined &&
      color !== null &&
      typeof color.parse === 'function'
    ) {
      var parsed = color.parse(raw)
      return parsed === null ? null : color.toHex8(parsed)
    }
    return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)
      ? raw.toLowerCase()
      : null
  }

  function nextGroupId(state) {
    var used = Object.create(null)
    for (var i = 0; i < state.groups.length; i++) {
      used[state.groups[i].id] = true
    }
    var counter = state.groups.length + 1
    while (used['group-' + counter] === true) {
      counter++
    }
    return 'group-' + counter
  }

  /**
   * Repairs any raw object into a usable state. Every restore path — stored
   * JSON, a caller-supplied default, an older version — goes through here, so
   * unknown ids, duplicate memberships, missing fields and outright nonsense
   * become a working strip instead of an exception.
   */
  function sanitizeState(raw, knownIds) {
    var known = Array.isArray(knownIds) ? knownIds : []
    var allowed = membership(known)
    var input = raw === null || typeof raw !== 'object' ? {} : raw

    var order = keepKnown(input.order, allowed)
    var present = membership(order)
    for (var k = 0; k < known.length; k++) {
      // A tab the site has published since the last visit joins at the end
      // rather than disappearing because it is absent from stored order.
      if (present[known[k]] !== true) {
        present[known[k]] = true
        order.push(known[k])
      }
    }

    var pinned = keepKnown(input.pinned, allowed)
    var hidden = keepKnown(input.hidden, allowed)
    var pinnedSet = membership(pinned)

    var groups = []
    var claimed = Object.create(null)
    var rawGroups = Array.isArray(input.groups) ? input.groups : []
    var usedIds = Object.create(null)
    for (var g = 0; g < rawGroups.length; g++) {
      var rawGroup = rawGroups[g]
      if (rawGroup === null || typeof rawGroup !== 'object') {
        continue
      }
      var id =
        isString(rawGroup.id) &&
        rawGroup.id !== '' &&
        usedIds[rawGroup.id] !== true
          ? rawGroup.id
          : 'group-' + (groups.length + 1)
      while (usedIds[id] === true) {
        id = id + '-2'
      }
      usedIds[id] = true

      var members = []
      var rawMembers = keepKnown(rawGroup.members, allowed)
      for (var m = 0; m < rawMembers.length; m++) {
        // One tab belongs to at most one group; the first record wins so the
        // repair is deterministic rather than dependent on iteration order.
        if (
          claimed[rawMembers[m]] !== true &&
          pinnedSet[rawMembers[m]] !== true
        ) {
          claimed[rawMembers[m]] = true
          members.push(rawMembers[m])
        }
      }

      groups.push({
        id: id,
        name: clampText(rawGroup.name, MaximumGroupNameLength),
        color: normalizeColor(rawGroup.color),
        collapsed: rawGroup.collapsed === true,
        members: members,
      })
    }

    return {
      version: StateVersion,
      order: order,
      pinned: pinned,
      hidden: hidden,
      groups: groups,
    }
  }

  function exportState(state) {
    var groups = []
    for (var i = 0; i < state.groups.length; i++) {
      var group = state.groups[i]
      groups.push({
        id: group.id,
        name: group.name,
        color: group.color,
        collapsed: group.collapsed === true,
        members: group.members.slice(0),
      })
    }
    return {
      version: StateVersion,
      order: state.order.slice(0),
      pinned: state.pinned.slice(0),
      hidden: state.hidden.slice(0),
      groups: groups,
    }
  }

  function serializeState(state) {
    return JSON.stringify(exportState(state))
  }

  /**
   * Reads persisted JSON. Corrupt, truncated, hand-edited or absent text all
   * resolve to the defaults for the tabs actually present — a broken preference
   * is a cosmetic loss, and throwing here would take the whole strip down with
   * it.
   */
  function parseState(source, knownIds) {
    var raw = null
    if (isString(source)) {
      try {
        raw = JSON.parse(source)
      } catch (error) {
        raw = null
      }
    } else if (source !== null && typeof source === 'object') {
      raw = source
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return defaultState(knownIds)
    }
    return sanitizeState(raw, knownIds)
  }

  function storageKey(stripId) {
    return StorageKeyPrefix + text(stripId)
  }

  /** Storage can throw outright (disabled cookies, private mode, quota). */
  function loadState(storage, stripId, knownIds) {
    var stored = null
    try {
      if (storage !== null && storage !== undefined) {
        stored = storage.getItem(storageKey(stripId))
      }
    } catch (error) {
      stored = null
    }
    return parseState(stored, knownIds)
  }

  function saveState(storage, stripId, state) {
    try {
      if (storage === null || storage === undefined) {
        return false
      }
      storage.setItem(storageKey(stripId), serializeState(state))
      return true
    } catch (error) {
      return false
    }
  }

  // ==================================================== order and group edits

  function groupIndexOf(state, groupId) {
    for (var i = 0; i < state.groups.length; i++) {
      if (state.groups[i].id === groupId) {
        return i
      }
    }
    return -1
  }

  function groupOf(state, tabId) {
    for (var i = 0; i < state.groups.length; i++) {
      if (indexOfId(state.groups[i].members, tabId) !== -1) {
        return state.groups[i]
      }
    }
    return null
  }

  function setPinned(state, tabId, pinned) {
    var next = cloneState(state)
    if (indexOfId(next.order, tabId) === -1) {
      return next
    }
    var at = indexOfId(next.pinned, tabId)
    if (pinned === true) {
      if (at === -1) {
        next.pinned.push(tabId)
      }
      // Pinning takes a tab out of its group: the pinned region is a separate
      // stable place, and leaving a phantom membership behind would make the
      // group's own count disagree with what it shows.
      for (var i = 0; i < next.groups.length; i++) {
        var member = indexOfId(next.groups[i].members, tabId)
        if (member !== -1) {
          next.groups[i].members.splice(member, 1)
        }
      }
    } else if (at !== -1) {
      next.pinned.splice(at, 1)
    }
    return next
  }

  /**
   * Moves a tab within its own bucket — the pinned region, its group, or the
   * ungrouped remainder — by `delta` positions. A move never crosses a bucket
   * boundary, because dragging past the end of a group should not silently
   * unpin or ungroup the tab.
   */
  function moveTab(state, tabId, delta) {
    var next = cloneState(state)
    var step = Number.isInteger(delta) ? delta : 0
    if (step === 0) {
      return next
    }

    var pinnedAt = indexOfId(next.pinned, tabId)
    if (pinnedAt !== -1) {
      moveWithin(next.pinned, pinnedAt, pinnedAt + step)
      return next
    }

    var group = groupOf(next, tabId)
    if (group !== null) {
      var memberAt = indexOfId(group.members, tabId)
      moveWithin(group.members, memberAt, memberAt + step)
      return next
    }

    // Ungrouped tabs are reordered inside `order` by moving the tab between the
    // positions the ungrouped tabs already occupy. The slots themselves never
    // move, so grouped and pinned entries keep their canonical positions
    // untouched.
    var loose = []
    for (var i = 0; i < next.order.length; i++) {
      var id = next.order[i]
      if (indexOfId(next.pinned, id) === -1 && groupOf(next, id) === null) {
        loose.push(i)
      }
    }
    var position = -1
    for (var p = 0; p < loose.length; p++) {
      if (next.order[loose[p]] === tabId) {
        position = p
      }
    }
    if (position === -1) {
      return next
    }
    var target = position + step
    if (target < 0 || target >= loose.length) {
      return next
    }
    // A move, not a swap. A swap of the two end slots would be indistinguishable
    // for `delta` of ±1 but wrong for anything larger, and it would make this
    // bucket disagree with the pinned region and a group, which both insert.
    var looseIds = []
    for (var q = 0; q < loose.length; q++) {
      looseIds.push(next.order[loose[q]])
    }
    moveWithin(looseIds, position, target)
    for (var w = 0; w < loose.length; w++) {
      next.order[loose[w]] = looseIds[w]
    }
    return next
  }

  function moveWithin(list, from, to) {
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
      return list
    }
    var held = list.splice(from, 1)[0]
    list.splice(to, 0, held)
    return list
  }

  function createGroup(state, options) {
    var settings = options === null || options === undefined ? {} : options
    var next = cloneState(state)
    var id =
      isString(settings.id) &&
      settings.id !== '' &&
      groupIndexOf(next, settings.id) === -1
        ? settings.id
        : nextGroupId(next)
    var members = []
    var requested = Array.isArray(settings.members) ? settings.members : []
    for (var i = 0; i < requested.length; i++) {
      var tabId = requested[i]
      if (
        indexOfId(next.order, tabId) !== -1 &&
        indexOfId(next.pinned, tabId) === -1 &&
        groupOf(next, tabId) === null &&
        indexOfId(members, tabId) === -1
      ) {
        members.push(tabId)
      }
    }
    next.groups.push({
      id: id,
      name: clampText(settings.name, MaximumGroupNameLength),
      color: normalizeColor(settings.color),
      collapsed: settings.collapsed === true,
      members: members,
    })
    return next
  }

  function renameGroup(state, groupId, name) {
    var next = cloneState(state)
    var at = groupIndexOf(next, groupId)
    if (at !== -1) {
      next.groups[at].name = clampText(name, MaximumGroupNameLength)
    }
    return next
  }

  function setGroupColor(state, groupId, color) {
    var next = cloneState(state)
    var at = groupIndexOf(next, groupId)
    if (at !== -1) {
      next.groups[at].color = normalizeColor(color)
    }
    return next
  }

  function setGroupCollapsed(state, groupId, collapsed) {
    var next = cloneState(state)
    var at = groupIndexOf(next, groupId)
    if (at !== -1) {
      next.groups[at].collapsed = collapsed === true
    }
    return next
  }

  function moveGroup(state, groupId, delta) {
    var next = cloneState(state)
    var at = groupIndexOf(next, groupId)
    var step = Number.isInteger(delta) ? delta : 0
    if (at !== -1 && step !== 0) {
      moveWithin(next.groups, at, at + step)
    }
    return next
  }

  /**
   * Removes a group record. `order`, `pinned` and `hidden` are untouched, so
   * every member simply becomes ungrouped — removing a group can never close,
   * hide or lose a tab.
   */
  function removeGroup(state, groupId) {
    var next = cloneState(state)
    var at = groupIndexOf(next, groupId)
    if (at !== -1) {
      next.groups.splice(at, 1)
    }
    return next
  }

  function assignToGroup(state, tabId, groupId) {
    var next = cloneState(state)
    if (indexOfId(next.order, tabId) === -1) {
      return next
    }
    for (var i = 0; i < next.groups.length; i++) {
      var at = indexOfId(next.groups[i].members, tabId)
      if (at !== -1) {
        next.groups[i].members.splice(at, 1)
      }
    }
    if (groupId === null || groupId === undefined) {
      return next
    }
    var target = groupIndexOf(next, groupId)
    if (target === -1) {
      return next
    }
    var pinnedAt = indexOfId(next.pinned, tabId)
    if (pinnedAt !== -1) {
      next.pinned.splice(pinnedAt, 1)
    }
    next.groups[target].members.push(tabId)
    return next
  }

  /**
   * Hides tabs from the strip. `order` and every group membership survive, so
   * "close" on a documentation site is reversible by construction and the
   * restore surface is a list rather than a rebuild.
   */
  function closeTabs(state, tabIds) {
    var next = cloneState(state)
    var ids = Array.isArray(tabIds) ? tabIds : []
    for (var i = 0; i < ids.length; i++) {
      if (
        indexOfId(next.order, ids[i]) !== -1 &&
        indexOfId(next.hidden, ids[i]) === -1
      ) {
        next.hidden.push(ids[i])
      }
    }
    return next
  }

  function restoreTabs(state, tabIds) {
    var next = cloneState(state)
    var ids = Array.isArray(tabIds) ? tabIds : []
    for (var i = 0; i < ids.length; i++) {
      var at = indexOfId(next.hidden, ids[i])
      if (at !== -1) {
        next.hidden.splice(at, 1)
      }
    }
    return next
  }

  // ================================================================== layout

  /**
   * Resolves a state into what the strip shows: the pinned region first, then
   * each group in group order, then the ungrouped remainder.
   *
   * Groups are rendered as blocks rather than in place within `order`, so a
   * group is one contiguous run the reader can collapse. `order` still decides
   * the relative order of the ungrouped remainder.
   */
  function layout(state, tabIds) {
    var allowed = membership(Array.isArray(tabIds) ? tabIds : [])
    var hidden = membership(state.hidden)
    var pinnedSet = membership(state.pinned)

    var pinned = []
    for (var p = 0; p < state.pinned.length; p++) {
      var pinnedId = state.pinned[p]
      if (allowed[pinnedId] === true && hidden[pinnedId] !== true) {
        pinned.push(pinnedId)
      }
    }

    var claimed = Object.create(null)
    var sections = []
    for (var g = 0; g < state.groups.length; g++) {
      var group = state.groups[g]
      var members = []
      for (var m = 0; m < group.members.length; m++) {
        var memberId = group.members[m]
        if (
          allowed[memberId] === true &&
          hidden[memberId] !== true &&
          pinnedSet[memberId] !== true &&
          claimed[memberId] !== true
        ) {
          claimed[memberId] = true
          members.push(memberId)
        }
      }
      sections.push({ groupId: group.id, group: group, tabs: members })
    }

    var loose = []
    for (var o = 0; o < state.order.length; o++) {
      var id = state.order[o]
      if (
        allowed[id] === true &&
        hidden[id] !== true &&
        pinnedSet[id] !== true &&
        claimed[id] !== true
      ) {
        loose.push(id)
      }
    }
    sections.push({ groupId: null, group: null, tabs: loose })

    var closed = []
    for (var h = 0; h < state.hidden.length; h++) {
      if (allowed[state.hidden[h]] === true) {
        closed.push(state.hidden[h])
      }
    }

    return { pinned: pinned, sections: sections, hidden: closed }
  }

  function pushEntry(entries, strip, byId, tabId, pinned, group) {
    var tab = byId[tabId]
    if (tab === undefined) {
      return
    }
    entries.push({
      tabId: tabId,
      label: text(tab.label),
      title: text(tab.title),
      stripId: text(strip.id),
      stripLabel: text(strip.label),
      groupId: group === null ? null : group.id,
      groupName: group === null ? '' : text(group.name),
      pinned: pinned === true,
      position: entries.length,
    })
  }

  /**
   * Flattens a whole model into search entries. Every entry names its strip,
   * its group, its pinned state and its visible label, because a result the
   * reader cannot locate is not a result.
   */
  function flatten(model) {
    var strips =
      model !== null && model !== undefined && Array.isArray(model.strips)
        ? model.strips
        : []
    var entries = []
    for (var s = 0; s < strips.length; s++) {
      var strip = strips[s]
      var tabs = Array.isArray(strip.tabs) ? strip.tabs : []
      var byId = Object.create(null)
      var ids = []
      for (var t = 0; t < tabs.length; t++) {
        byId[tabs[t].id] = tabs[t]
        ids.push(tabs[t].id)
      }
      var resolved = layout(strip.state, ids)

      for (var pi = 0; pi < resolved.pinned.length; pi++) {
        pushEntry(entries, strip, byId, resolved.pinned[pi], true, null)
      }
      for (var si = 0; si < resolved.sections.length; si++) {
        var section = resolved.sections[si]
        for (var ti = 0; ti < section.tabs.length; ti++) {
          pushEntry(
            entries,
            strip,
            byId,
            section.tabs[ti],
            false,
            section.group
          )
        }
      }
    }
    return entries
  }

  /** Every group across the model, as entries the group-name search matches. */
  function flattenGroups(model) {
    var strips =
      model !== null && model !== undefined && Array.isArray(model.strips)
        ? model.strips
        : []
    var entries = []
    for (var s = 0; s < strips.length; s++) {
      var strip = strips[s]
      var groups = strip.state.groups
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g]
        entries.push({
          groupId: group.id,
          name: text(group.name),
          label: text(group.name),
          color: group.color,
          collapsed: group.collapsed === true,
          memberCount: group.members.length,
          members: group.members.slice(0),
          stripId: text(strip.id),
          stripLabel: text(strip.label),
          position: g,
        })
      }
    }
    return entries
  }

  function entriesForStrip(entries, stripId) {
    var result = []
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].stripId === stripId) {
        result.push(entries[i])
      }
    }
    return result
  }

  function entriesForGroup(entries, stripId, groupId) {
    var result = []
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].stripId === stripId && entries[i].groupId === groupId) {
        result.push(entries[i])
      }
    }
    return result
  }

  var Logic = {
    // match engine
    normalizeSpec: normalizeSpec,
    normalizedFlags: normalizedFlags,
    compileMatcher: compileMatcher,
    visibleStrings: visibleStrings,
    nameStrings: nameStrings,
    matchList: matchList,
    // bulk close
    planBulkClose: planBulkClose,
    containsMode: ContainsMode,
    notContainsMode: NotContainsMode,
    // searches
    createSearchState: createSearchState,
    createSearchStates: createSearchStates,
    applySearch: applySearch,
    // model
    defaultState: defaultState,
    sanitizeState: sanitizeState,
    cloneState: cloneState,
    exportState: exportState,
    serializeState: serializeState,
    parseState: parseState,
    storageKey: storageKey,
    loadState: loadState,
    saveState: saveState,
    // edits
    setPinned: setPinned,
    moveTab: moveTab,
    createGroup: createGroup,
    renameGroup: renameGroup,
    setGroupColor: setGroupColor,
    setGroupCollapsed: setGroupCollapsed,
    moveGroup: moveGroup,
    removeGroup: removeGroup,
    assignToGroup: assignToGroup,
    closeTabs: closeTabs,
    restoreTabs: restoreTabs,
    groupOf: groupOf,
    groupIndexOf: groupIndexOf,
    normalizeColor: normalizeColor,
    // layout and search inputs
    layout: layout,
    flatten: flatten,
    flattenGroups: flattenGroups,
    entriesForStrip: entriesForStrip,
    entriesForGroup: entriesForGroup,
    // bounds, so a caller can explain a refusal in its own words
    maximumPatternLength: MaximumPatternLength,
    maximumLabelLength: MaximumLabelLength,
    maximumMatchTabs: MaximumMatchTabs,
    maximumGroupNameLength: MaximumGroupNameLength,
    defaultBudgetMilliseconds: DefaultBudgetMilliseconds,
    stateVersion: StateVersion,
  }

  // ============================================================== DOM layer

  /**
   * Bounded evaluator for the page.
   *
   * Plain text never needs a worker: `indexOf` over a handful of headings is
   * bounded by construction. A regex does, and the worker's `pages` operation
   * is exactly the right shape — one entry per visible string, matched
   * individually, so `^` and `$` mean what the reader wrote and no
   * concatenation invents a boundary. A truncated reply, an unavailable worker
   * or an expired deadline all fail closed with a code.
   */
  function createEvaluator(config) {
    var settings = config === null || config === undefined ? {} : config
    var budget = Number.isInteger(settings.budgetMilliseconds)
      ? settings.budgetMilliseconds
      : DefaultBudgetMilliseconds
    var job = settings.regexJob === undefined ? null : settings.regexJob
    if (job === null && isString(settings.workerPath)) {
      var factory = global.DesktopMaterialRegexJob
      if (
        factory !== undefined &&
        factory !== null &&
        typeof factory.create === 'function'
      ) {
        try {
          job = factory.create({
            workerPath: settings.workerPath,
            budgetMilliseconds: budget,
          })
        } catch (error) {
          job = null
        }
      }
    }

    function run(surface, entries, spec, strings, done) {
      var pick = typeof strings === 'function' ? strings : visibleStrings
      var matcher = compileMatcher(spec)
      if (!matcher.ok || matcher.mode === 'plain' || job === null) {
        done(
          matchList(entries, spec, {
            strings: pick,
            budgetMilliseconds: budget,
          })
        )
        return
      }
      if (entries.length > MaximumMatchTabs) {
        done(failedMatch(matcher, entries.length, 'too-many-tabs'))
        return
      }

      var pages = []
      var owners = []
      for (var i = 0; i < entries.length; i++) {
        var candidates = pick(entries[i])
        for (var c = 0; c < candidates.length; c++) {
          pages.push(clampText(candidates[c], MaximumLabelLength))
          owners.push(i)
        }
      }
      if (pages.length > MaximumMatchStrings) {
        done(failedMatch(matcher, entries.length, 'too-many-tabs'))
        return
      }

      job.run(
        surface,
        {
          operation: 'pages',
          pattern: matcher.spec.query,
          flags: matcher.flags,
          pages: pages,
          maximumPages: MaximumMatchStrings,
          maximumExcerpts: 1,
        },
        function (data) {
          if (data.truncated === true) {
            done(failedMatch(matcher, entries.length, 'truncated'))
            return
          }
          var seen = Object.create(null)
          var hits = []
          for (var h = 0; h < data.hits.length; h++) {
            var owner = owners[data.hits[h].pageIndex]
            if (owner !== undefined && seen[owner] !== true) {
              seen[owner] = true
              hits.push(owner)
            }
          }
          hits.sort(function (a, b) {
            return a - b
          })
          done({
            ok: true,
            evaluated: true,
            mode: 'regex',
            code: '',
            detail: '',
            hits: hits,
            total: entries.length,
          })
        },
        function (code, detail) {
          done(failedMatch(matcher, entries.length, code, detail))
        }
      )
    }

    return { run: run, budgetMilliseconds: budget, worker: job !== null }
  }

  function makeElement(doc, tag, className, content) {
    var node = doc.createElement(tag)
    if (className) {
      node.className = className
    }
    if (content !== undefined && content !== null) {
      node.textContent = String(content)
    }
    return node
  }

  function button(doc, className, content, ariaLabel) {
    var node = makeElement(doc, 'button', className, content)
    node.type = 'button'
    if (ariaLabel) {
      node.setAttribute('aria-label', ariaLabel)
    }
    return node
  }

  var uniqueCounter = 0

  function uniqueId(prefix) {
    uniqueCounter++
    return 'dm-tabs-' + prefix + '-' + uniqueCounter
  }

  /**
   * Builds one search field: input, an explicit regex opt-in, an optional hook
   * to the site's full regex builder, and a live validation line. The state
   * object handed in is this field's and only this field's.
   */
  function searchField(context, state, options) {
    var doc = context.doc
    var settings = options === null || options === undefined ? {} : options
    var root = makeElement(doc, 'div', 'dm-tabs-search')
    var inputId = uniqueId('search')
    var statusId = inputId + '-status'

    /**
     * A caller that owns a long-lived field passes a *function* here, so the
     * field's own caption can be retranslated later. A caller whose field is
     * rebuilt on every render may pass a plain string.
     */
    function labelText() {
      return typeof settings.label === 'function'
        ? text(settings.label())
        : text(settings.label)
    }

    var label = makeElement(doc, 'label', 'dm-tabs-search-label', labelText())
    label.setAttribute('for', inputId)
    var input = doc.createElement('input')
    input.type = 'search'
    input.id = inputId
    input.className = 'dm-tabs-search-input'
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('spellcheck', 'false')
    input.setAttribute('aria-describedby', statusId)
    if (settings.placeholder) {
      input.setAttribute('placeholder', settings.placeholder)
    }

    var toggleWrap = makeElement(doc, 'label', 'dm-tabs-search-regex')
    var toggle = doc.createElement('input')
    toggle.type = 'checkbox'
    toggle.className = 'dm-tabs-search-regex-input'
    toggleWrap.appendChild(toggle)
    var regexText = makeElement(
      doc,
      'span',
      '',
      context.label('regex', 'Regex')
    )
    toggleWrap.appendChild(regexText)

    var builder = button(
      doc,
      'dm-tabs-search-builder',
      context.label('builderShort', '.*'),
      context.label('builder', 'Open the regex builder')
    )
    // The builder is the site's own surface; this module only asks for it. With
    // no opener supplied the affordance is absent rather than a dead button.
    if (typeof context.openBuilder !== 'function') {
      builder.hidden = true
    }

    var status = makeElement(doc, 'p', 'dm-tabs-search-status')
    status.id = statusId
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')

    var row = makeElement(doc, 'div', 'dm-tabs-search-row')
    row.appendChild(input)
    row.appendChild(toggleWrap)
    row.appendChild(builder)
    root.appendChild(label)
    root.appendChild(row)
    root.appendChild(status)

    var handle = {
      element: root,
      input: input,
      state: state,
      status: status,
      setStatus: function (next) {
        handle.state = next
        var invalid = next.status === 'error' || next.status === 'timeout'
        if (invalid) {
          input.setAttribute('aria-invalid', 'true')
        } else {
          input.removeAttribute('aria-invalid')
        }
        status.textContent = context.statusText(next)
      },
      /** Re-applies every caption this field owns, for a language change. */
      relabel: function () {
        label.textContent = labelText()
        regexText.textContent = context.label('regex', 'Regex')
        builder.textContent = context.label('builderShort', '.*')
        builder.setAttribute(
          'aria-label',
          context.label('builder', 'Open the regex builder')
        )
        status.textContent = context.statusText(handle.state)
      },
    }

    function changed() {
      handle.state.query = input.value
      handle.state.regex = toggle.checked === true
      if (typeof settings.onChange === 'function') {
        settings.onChange(handle.state)
      }
    }

    input.addEventListener('input', changed)
    toggle.addEventListener('change', changed)
    builder.addEventListener('click', function () {
      if (typeof context.openBuilder === 'function') {
        context.openBuilder({
          state: handle.state,
          anchor: builder,
          apply: function (pattern, flags) {
            input.value = text(pattern)
            toggle.checked = true
            handle.state.flags = text(flags) === '' ? 'i' : text(flags)
            changed()
          },
        })
      }
    })

    return handle
  }

  /**
   * Upgrades the declarative strips in place.
   *
   * `options.labels` supplies every visible string, exactly as the colour
   * picker does, so language mode and playfulness level stay owned by the page
   * and this module never localizes. Fallbacks are English and exist only so a
   * missing key is legible rather than blank.
   */
  function upgrade(options) {
    var config = options === null || options === undefined ? {} : options
    var doc = config.document || global.document
    if (doc === undefined || doc === null) {
      return null
    }

    var labels = config.labels || {}
    var storage = null
    if (config.storage !== undefined) {
      storage = config.storage
    } else {
      try {
        storage = global.localStorage
      } catch (error) {
        storage = null
      }
    }

    var evaluator = createEvaluator({
      regexJob: config.regexJob,
      workerPath: config.workerPath,
      budgetMilliseconds: config.budgetMilliseconds,
    })

    function label(key, fallback) {
      var value = labels[key]
      return value === undefined || value === null ? fallback : String(value)
    }

    /**
     * Status copy is facts only — the count, the mode, the failure code — so a
     * playfulness level can restyle the surrounding page without a reader ever
     * losing what a match actually did.
     */
    function statusText(state) {
      if (state.status === 'idle') {
        return ''
      }
      if (state.status === 'timeout') {
        return label(
          'statusTimeout',
          'Pattern took too long. Showing every tab.'
        )
      }
      if (state.status === 'error') {
        // An unsupported or repeated flag is *this* module's own diagnosis, not
        // the engine's, so it gets its own key. Appending the raw `detail` here
        // would render a hard-coded English sentence the page cannot translate,
        // which is the one thing this module promises never to do.
        if (state.code === 'invalid-flags') {
          return label(
            'statusInvalidFlags',
            'Unsupported or repeated flag. Showing every tab.'
          )
        }
        if (state.code === 'invalid') {
          // `detail` here is the engine's own SyntaxError text. It is not
          // translatable by anyone — the reader needs the exact reason their
          // pattern failed, so it is passed through verbatim after the
          // translatable sentence rather than dropped.
          return (
            label('statusInvalid', 'Invalid pattern. Showing every tab.') +
            (state.detail ? ' ' + state.detail : '')
          )
        }
        if (state.code === 'too-long-pattern') {
          return label('statusTooLong', 'Pattern is too long.')
        }
        if (state.code === 'too-many-tabs') {
          return label('statusTooMany', 'Too many tabs to match safely.')
        }
        return label('statusUnavailable', 'Could not match. Showing every tab.')
      }
      return (
        String(state.results.length) +
        ' / ' +
        String(state.total) +
        ' · ' +
        (state.regex ? label('modeRegex', 'regex') : label('modePlain', 'text'))
      )
    }

    /**
     * Every visible string that is built once and then kept — a heading, a
     * toolbar name, a button caption — registers a hook here, so `labels()`
     * genuinely retranslates the surface instead of retranslating only the
     * parts a render happens to rebuild. Nodes that *are* rebuilt on every
     * render (group rows, result lists, menus) read `label` at construction
     * and need no hook.
     */
    var relabelHooks = []

    function relabel(apply) {
      relabelHooks.push(apply)
      apply()
    }

    function retext(node, key, fallback) {
      relabel(function () {
        node.textContent = label(key, fallback)
      })
    }

    function reattr(node, attribute, build) {
      relabel(function () {
        node.setAttribute(attribute, build())
      })
    }

    var context = {
      doc: doc,
      label: label,
      statusText: statusText,
      relabel: relabel,
      retext: retext,
      reattr: reattr,
      openBuilder:
        typeof config.openBuilder === 'function' ? config.openBuilder : null,
      evaluator: evaluator,
      storage: storage,
      onNavigate:
        typeof config.onNavigate === 'function' ? config.onNavigate : null,
    }

    var elements = []
    if (Array.isArray(config.strips)) {
      elements = config.strips.slice(0)
    } else {
      var selector = isString(config.selector)
        ? config.selector
        : '.tabs, .subtabs'
      var found = doc.querySelectorAll(selector)
      for (var i = 0; i < found.length; i++) {
        elements.push(found[i])
      }
    }

    var controllers = []
    for (var e = 0; e < elements.length; e++) {
      var controller = createStrip(context, elements[e])
      if (controller !== null) {
        controllers.push(controller)
      }
    }

    // Nothing was upgraded: either the page has no strip, or every strip is
    // already upgraded and `createStrip` refused it. Building the master search
    // anyway would append a *second* copy of it to the same host, so a page that
    // loads this script twice would grow a duplicate field — which is exactly
    // what the `data-dm-upgraded` guard exists to prevent.
    if (controllers.length === 0) {
      return null
    }

    var master = createMasterSearch(context, controllers)
    var masterMount = config.masterMount
    if (isString(masterMount)) {
      masterMount = doc.querySelector(masterMount)
    }
    if (masterMount === undefined || masterMount === null) {
      masterMount = doc.querySelector('[data-dm-tabs-master]')
    }
    if (masterMount !== null && masterMount !== undefined) {
      masterMount.appendChild(master.element)
    } else if (controllers.length > 0) {
      // With no host element the master search still has to exist somewhere, so
      // it lands in the first strip's own panel rather than being dropped.
      controllers[0].panel.appendChild(master.element)
    }

    function refresh() {
      for (var h = 0; h < relabelHooks.length; h++) {
        relabelHooks[h]()
      }
      for (var c = 0; c < controllers.length; c++) {
        controllers[c].render()
      }
      master.refresh()
    }

    return {
      strips: controllers,
      master: master,
      element: master.element,
      refresh: refresh,
      model: function () {
        return currentModel(controllers)
      },
      labels: function (next) {
        labels = next || {}
        refresh()
      },
    }
  }

  function currentModel(controllers) {
    var strips = []
    for (var i = 0; i < controllers.length; i++) {
      strips.push(controllers[i].describe())
    }
    return { strips: strips }
  }

  /** Reads the declarative strip: one tab per `[data-tab]` anchor already there. */
  function collectTabs(element) {
    var links = element.querySelectorAll('[data-tab]')
    var tabs = []
    for (var i = 0; i < links.length; i++) {
      var link = links[i]
      var id = link.getAttribute('data-tab')
      if (id === null || id === '') {
        continue
      }
      tabs.push({
        id: id,
        label: text(link.textContent).trim(),
        title: text(link.getAttribute('title')),
        link: link,
      })
    }
    return tabs
  }

  function createStrip(context, element) {
    var doc = context.doc
    var tabs = collectTabs(element)
    if (tabs.length === 0) {
      return null
    }
    // A second upgrade of the same strip would nest a wrapper inside its own
    // wrapper and duplicate every search field, so the mark makes the call
    // idempotent for a page that loads the script twice.
    if (element.getAttribute('data-dm-upgraded') === 'true') {
      return null
    }
    element.setAttribute('data-dm-upgraded', 'true')

    var stripId =
      element.getAttribute('data-subtabs') || element.id || uniqueId('strip')
    var stripLabel = element.getAttribute('aria-label') || stripId

    var ids = []
    var byId = Object.create(null)
    for (var t = 0; t < tabs.length; t++) {
      ids.push(tabs[t].id)
      byId[tabs[t].id] = tabs[t]
    }

    var state = Logic.loadState(context.storage, stripId, ids)

    // --------------------------------------------------------------- scaffold

    var root = makeElement(doc, 'div', 'dm-tabstrip')
    root.setAttribute('data-dm-tabstrip', stripId)
    var parent = element.parentNode
    parent.insertBefore(root, element)

    var toolbar = makeElement(doc, 'div', 'dm-tabstrip-toolbar')
    // `group`, not `toolbar`. `role="toolbar"` is a composite widget: assistive
    // technology announces it as one and its users expect a single tab stop with
    // arrow-key traversal between the controls. This container holds a labelled
    // search field, a checkbox, buttons, a live status line and a results list,
    // each its own tab stop and none of them arrow-navigable, so claiming
    // `toolbar` would promise a keyboard contract that is not implemented.
    toolbar.setAttribute('role', 'group')
    context.reattr(toolbar, 'aria-label', function () {
      return context.label('toolbar', 'Tab controls') + ' — ' + stripLabel
    })
    root.appendChild(toolbar)
    root.appendChild(element)

    element.classList.add('dm-tabstrip-list')
    if (element.getAttribute('role') !== 'tablist') {
      element.setAttribute('role', 'tablist')
    }

    // Every tab stays a descendant of the tablist. The regions below are
    // `presentation`, so grouping and pinning are visual structure while the
    // effective children of the tablist remain tabs.
    var pinnedRegion = makeElement(doc, 'div', 'dm-tabstrip-pinned')
    pinnedRegion.setAttribute('role', 'presentation')
    pinnedRegion.setAttribute('data-dm-region', 'pinned')
    var flow = makeElement(doc, 'div', 'dm-tabstrip-flow')
    flow.setAttribute('role', 'presentation')
    // A bulk-closed tab keeps its anchor parked here rather than being detached.
    // Removing the node would delete the tab from the document, so the next load
    // could not see it at all and "Restore" would have nothing to restore — the
    // close would be permanent despite being described as reversible.
    var closedRegion = makeElement(doc, 'div', 'dm-tabstrip-closed-region')
    closedRegion.setAttribute('role', 'presentation')
    closedRegion.hidden = true
    element.insertBefore(pinnedRegion, element.firstChild)
    element.appendChild(flow)
    element.appendChild(closedRegion)

    var overflowButton = button(
      doc,
      'dm-tabstrip-overflow-button',
      context.label('overflow', 'More'),
      context.label('overflowHint', 'Tabs that do not fit')
    )
    overflowButton.setAttribute('aria-expanded', 'false')
    overflowButton.hidden = true
    context.reattr(overflowButton, 'aria-label', function () {
      return context.label('overflowHint', 'Tabs that do not fit')
    })
    // A disclosure, not a `role="menu"`. A real menu puts a screen reader into
    // application mode and hands it arrow keys, `Home`/`End` and `Escape` to
    // dispatch — none of which this list implements. Described as a group of
    // buttons revealed by `aria-expanded`, it is operable exactly as it behaves:
    // by `Tab`, in DOM order, with `Escape` handled below.
    var overflowMenu = makeElement(doc, 'div', 'dm-tabstrip-menu')
    overflowMenu.id = uniqueId('overflow')
    overflowMenu.setAttribute('role', 'group')
    context.reattr(overflowMenu, 'aria-label', function () {
      return context.label('overflowHint', 'Tabs that do not fit')
    })
    overflowMenu.hidden = true
    overflowButton.setAttribute('aria-controls', overflowMenu.id)

    var panelButton = button(
      doc,
      'dm-tabstrip-panel-button',
      context.label('manage', 'Manage tabs')
    )
    context.retext(panelButton, 'manage', 'Manage tabs')
    panelButton.setAttribute('aria-expanded', 'false')
    var panel = makeElement(doc, 'div', 'dm-tabstrip-panel')
    panel.id = uniqueId('panel')
    panel.hidden = true
    panelButton.setAttribute('aria-controls', panel.id)

    var live = makeElement(doc, 'p', 'dm-tabstrip-live')
    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')

    var searches = Logic.createSearchStates()

    // (a) the current tab strip
    var stripSearch = searchField(context, searches.strip, {
      label: function () {
        return context.label('searchStrip', 'Search this tab strip')
      },
      placeholder: stripLabel,
      onChange: function () {
        runStripSearch()
      },
    })
    context.relabel(stripSearch.relabel)

    // (c) groups by their visible names
    var groupNameSearch = searchField(context, searches.groups, {
      label: function () {
        return context.label('searchGroups', 'Search tab groups by name')
      },
      onChange: function () {
        runGroupNameSearch()
      },
    })
    context.relabel(groupNameSearch.relabel)

    toolbar.appendChild(stripSearch.element)
    toolbar.appendChild(panelButton)
    toolbar.appendChild(overflowButton)
    toolbar.appendChild(overflowMenu)
    root.appendChild(live)
    root.appendChild(panel)

    var stripResults = makeElement(doc, 'ul', 'dm-tabs-results')
    stripResults.hidden = true
    toolbar.appendChild(stripResults)

    // ------------------------------------------------------------ panel body

    var groupsSection = makeElement(doc, 'section', 'dm-tabs-groups')
    var groupsHeading = makeElement(doc, 'h3', 'dm-tabs-heading')
    context.retext(groupsHeading, 'groups', 'Groups')
    groupsSection.appendChild(groupsHeading)
    groupsSection.appendChild(groupNameSearch.element)
    var groupNameResults = makeElement(doc, 'ul', 'dm-tabs-results')
    groupNameResults.hidden = true
    groupsSection.appendChild(groupNameResults)
    var newGroup = button(doc, 'dm-tabs-action')
    context.retext(newGroup, 'newGroup', 'New group')
    groupsSection.appendChild(newGroup)
    var groupList = makeElement(doc, 'div', 'dm-tabs-group-list')
    groupsSection.appendChild(groupList)
    panel.appendChild(groupsSection)

    var bulk = createBulkClose(context, {
      strip: function () {
        return { id: stripId, label: stripLabel, state: state, tabs: tabs }
      },
      onClose: function (ids) {
        state = Logic.closeTabs(state, ids)
        persist()
        render()
        announce(
          context.label('announceClosed', 'Tabs hidden from the strip') +
            ': ' +
            String(ids.length)
        )
      },
    })
    panel.appendChild(bulk.element)

    var closedSection = makeElement(doc, 'section', 'dm-tabs-closed')
    var closedHeading = makeElement(doc, 'h3', 'dm-tabs-heading')
    context.retext(closedHeading, 'closed', 'Hidden tabs')
    closedSection.appendChild(closedHeading)
    var closedList = makeElement(doc, 'ul', 'dm-tabs-closed-list')
    closedSection.appendChild(closedList)
    panel.appendChild(closedSection)

    panelButton.addEventListener('click', function () {
      var open = panel.hidden
      panel.hidden = !open
      panelButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    })

    newGroup.addEventListener('click', function () {
      state = Logic.createGroup(state, {
        name: context.label('groupDefaultName', 'New group'),
      })
      persist()
      render()
      announce(context.label('announceGroupCreated', 'Group created'))
    })

    // ---------------------------------------------------------------- helpers

    function describe() {
      return { id: stripId, label: stripLabel, state: state, tabs: tabs }
    }

    function persist() {
      Logic.saveState(context.storage, stripId, state)
    }

    function announce(message) {
      live.textContent = message
    }

    function entries() {
      return Logic.flatten({ strips: [describe()] })
    }

    function runStripSearch() {
      var list = entries()
      context.evaluator.run(
        'strip:' + stripId,
        list,
        stripSearch.state,
        Logic.visibleStrings,
        function (result) {
          var next = Logic.applySearch(stripSearch.state, list, {
            result: result,
          })
          stripSearch.setStatus(next)
          renderResults(stripResults, next, false)
        }
      )
    }

    function runGroupNameSearch() {
      var list = Logic.flattenGroups({ strips: [describe()] })
      context.evaluator.run(
        'group-names:' + stripId,
        list,
        groupNameSearch.state,
        Logic.nameStrings,
        function (result) {
          var next = Logic.applySearch(groupNameSearch.state, list, {
            result: result,
          })
          groupNameSearch.setStatus(next)
          renderGroupNameResults(next)
        }
      )
    }

    /**
     * Reveals a result. A tab inside a collapsed group is reached through that
     * group's member menu instead of by expanding it, so finding a tab never
     * destroys the collapsed preference the reader chose.
     */
    function reveal(entry) {
      var tab = byId[entry.tabId]
      if (tab === undefined) {
        return
      }
      var group =
        entry.groupId === null ? null : findGroup(state, entry.groupId)
      if (group !== null && group.collapsed === true) {
        var opener = element.querySelector(
          '[data-dm-group-members="' + cssQuote(group.id) + '"]'
        )
        if (opener !== null) {
          opener.click()
          opener.focus()
          return
        }
      }
      if (!isReachable(tab.link)) {
        // The tab is in the "More" list, so the reader is sent to its entry
        // there. `click()` on the trigger would *toggle*, closing an already-open
        // list, and focusing the tab itself is useless because it has no layout
        // box — the result would silently do nothing.
        setOverflowOpen(true)
        var item = overflowMenu.querySelector(
          '[data-dm-menu-tab="' + cssQuote(entry.tabId) + '"]'
        )
        if (item !== null && typeof item.focus === 'function') {
          item.focus()
          return
        }
        if (typeof overflowButton.focus === 'function') {
          overflowButton.focus()
        }
        return
      }
      if (typeof tab.link.focus === 'function') {
        tab.link.focus()
      }
    }

    function renderResults(host, searchState, includeStripName) {
      host.innerHTML = ''
      if (searchState.status === 'idle') {
        host.hidden = true
        return
      }
      host.hidden = false
      for (var i = 0; i < searchState.results.length; i++) {
        var entry = searchState.results[i]
        var item = makeElement(doc, 'li', 'dm-tabs-result')
        var action = button(doc, 'dm-tabs-result-button')
        action.appendChild(
          makeElement(doc, 'span', 'dm-tabs-result-label', entry.label)
        )
        // Each result names where it lives: a result the reader cannot locate
        // is not a result.
        var where = []
        if (includeStripName) {
          where.push(entry.stripLabel)
        }
        where.push(
          entry.groupName === ''
            ? context.label('ungrouped', 'Ungrouped')
            : entry.groupName
        )
        if (entry.pinned) {
          where.push(context.label('pinned', 'Pinned'))
        }
        action.appendChild(
          makeElement(doc, 'span', 'dm-tabs-result-where', where.join(' · '))
        )
        action.addEventListener(
          'click',
          (function (target) {
            return function () {
              reveal(target)
            }
          })(entry)
        )
        item.appendChild(action)
        host.appendChild(item)
      }
      if (searchState.results.length === 0) {
        host.appendChild(
          makeElement(
            doc,
            'li',
            'dm-tabs-result-empty',
            context.label('noMatches', 'No tab matches that query.')
          )
        )
      }
    }

    function renderGroupNameResults(searchState) {
      groupNameResults.innerHTML = ''
      if (searchState.status === 'idle') {
        groupNameResults.hidden = true
        return
      }
      groupNameResults.hidden = false
      for (var i = 0; i < searchState.results.length; i++) {
        var entry = searchState.results[i]
        var item = makeElement(doc, 'li', 'dm-tabs-result')
        item.appendChild(
          makeElement(
            doc,
            'span',
            'dm-tabs-result-label',
            entry.name === ''
              ? context.label('unnamedGroup', 'Unnamed group')
              : entry.name
          )
        )
        item.appendChild(
          makeElement(
            doc,
            'span',
            'dm-tabs-result-where',
            String(entry.memberCount) +
              ' · ' +
              (entry.collapsed
                ? context.label('collapsed', 'Collapsed')
                : context.label('expanded', 'Expanded'))
          )
        )
        groupNameResults.appendChild(item)
      }
      if (searchState.results.length === 0) {
        groupNameResults.appendChild(
          makeElement(
            doc,
            'li',
            'dm-tabs-result-empty',
            context.label('noGroupMatches', 'No group name matches that query.')
          )
        )
      }
    }

    // ----------------------------------------------------------------- render

    var groupSearchFields = Object.create(null)

    function tabNode(tabId, pinned, group) {
      var tab = byId[tabId]
      if (tab === undefined) {
        return null
      }
      var link = tab.link
      link.classList.add('dm-tabstrip-tab')
      link.hidden = false
      link.removeAttribute('data-dm-overflowed')
      if (pinned) {
        link.setAttribute('data-dm-pinned', 'true')
        // A pinned tab may render icon-only at narrow widths, so the full name
        // is kept on the element rather than only in the visible text.
        link.setAttribute('aria-label', tab.label)
        link.setAttribute('title', tab.label)
      } else {
        link.removeAttribute('data-dm-pinned')
        // Unpinning restores the tab's own tooltip rather than leaving behind the
        // label that pinning wrote there.
        if (tab.title === '') {
          link.removeAttribute('title')
        } else {
          link.setAttribute('title', tab.title)
        }
        link.removeAttribute('aria-label')
      }
      if (group !== null) {
        link.setAttribute('data-dm-group', group.id)
      } else {
        link.removeAttribute('data-dm-group')
      }
      return link
    }

    function render() {
      var resolved = Logic.layout(state, ids)

      pinnedRegion.innerHTML = ''
      pinnedRegion.hidden = resolved.pinned.length === 0
      for (var p = 0; p < resolved.pinned.length; p++) {
        var pinnedNode = tabNode(resolved.pinned[p], true, null)
        if (pinnedNode !== null) {
          pinnedRegion.appendChild(pinnedNode)
        }
      }

      flow.innerHTML = ''
      for (var s = 0; s < resolved.sections.length; s++) {
        var section = resolved.sections[s]
        if (section.group === null) {
          for (var l = 0; l < section.tabs.length; l++) {
            var looseNode = tabNode(section.tabs[l], false, null)
            if (looseNode !== null) {
              flow.appendChild(looseNode)
            }
          }
          continue
        }
        flow.appendChild(groupNode(section))
      }

      closedRegion.innerHTML = ''
      closedRegion.hidden = resolved.hidden.length === 0
      for (var c = 0; c < resolved.hidden.length; c++) {
        var closedTab = byId[resolved.hidden[c]]
        if (closedTab !== undefined) {
          closedTab.link.hidden = true
          closedRegion.appendChild(closedTab.link)
        }
      }

      renderGroupList(resolved)
      renderClosed(resolved)
      applyOverflow()
      bulk.refresh()
    }

    function groupNode(section) {
      var group = section.group
      var wrap = makeElement(doc, 'div', 'dm-tabstrip-group')
      /*
       * A named `group`, not `presentation`. `role="presentation"` removes only
       * the wrapper: its children are promoted to the nearest exposed ancestor,
       * which here is the `tablist`. That left the tablist directly owning the
       * collapse button and the member-list button alongside its tabs — invalid
       * for a role whose required owned element is `tab`, and it erased the group
       * boundary entirely, so the group tint was the only cue that any tabs were
       * grouped and a screen-reader user had none at all. Naming the group keeps
       * the buttons inside it and gives the boundary a spoken name.
       */
      wrap.setAttribute('role', 'group')
      wrap.setAttribute(
        'aria-label',
        group.name === ''
          ? context.label('unnamedGroup', 'Unnamed group')
          : group.name
      )
      wrap.setAttribute('data-dm-group-region', group.id)
      if (group.color !== null) {
        wrap.style.setProperty('--dm-group-color', group.color)
        wrap.setAttribute('data-dm-group-colored', 'true')
      }

      var header = makeElement(doc, 'div', 'dm-tabstrip-group-header')
      header.setAttribute('role', 'presentation')
      var membersId = uniqueId('group-tabs')

      var toggle = button(
        doc,
        'dm-tabstrip-group-toggle',
        group.name === ''
          ? context.label('unnamedGroup', 'Unnamed group')
          : group.name
      )
      toggle.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true')
      toggle.setAttribute('aria-controls', membersId)
      toggle.addEventListener('click', function () {
        state = Logic.setGroupCollapsed(state, group.id, !group.collapsed)
        persist()
        render()
      })

      var membersButton = button(
        doc,
        'dm-tabstrip-group-members',
        String(section.tabs.length),
        context.label('groupMembers', 'Tabs in this group') +
          ': ' +
          (group.name === ''
            ? context.label('unnamedGroup', 'Unnamed group')
            : group.name)
      )
      membersButton.setAttribute('data-dm-group-members', group.id)
      membersButton.setAttribute('aria-expanded', 'false')
      // A disclosure of buttons rather than a `role="menu"`, for the same reason
      // as the overflow list: no arrow-key or `Home`/`End` dispatch is
      // implemented, so the menu contract would be a promise this cannot keep.
      var membersMenu = makeElement(doc, 'div', 'dm-tabstrip-menu')
      membersMenu.id = uniqueId('group-menu')
      membersMenu.setAttribute('role', 'group')
      membersMenu.setAttribute(
        'aria-label',
        context.label('groupMembers', 'Tabs in this group') +
          ': ' +
          (group.name === ''
            ? context.label('unnamedGroup', 'Unnamed group')
            : group.name)
      )
      membersMenu.hidden = true
      membersButton.setAttribute('aria-controls', membersMenu.id)
      // A collapsed group still has to expose every member, so the menu is
      // populated from the section rather than from what happens to be visible.
      for (var i = 0; i < section.tabs.length; i++) {
        membersMenu.appendChild(menuItem(section.tabs[i]))
      }
      membersButton.addEventListener('click', function () {
        var open = membersMenu.hidden
        membersMenu.hidden = !open
        membersButton.setAttribute('aria-expanded', open ? 'true' : 'false')
      })

      header.appendChild(toggle)
      header.appendChild(membersButton)
      header.appendChild(membersMenu)
      wrap.appendChild(header)

      var members = makeElement(doc, 'div', 'dm-tabstrip-group-tabs')
      members.setAttribute('role', 'presentation')
      members.id = membersId
      members.hidden = group.collapsed === true
      for (var m = 0; m < section.tabs.length; m++) {
        var node = tabNode(section.tabs[m], false, group)
        if (node !== null) {
          members.appendChild(node)
        }
      }
      wrap.appendChild(members)
      return wrap
    }

    function menuItem(tabId) {
      var tab = byId[tabId]
      var item = button(doc, 'dm-tabstrip-menu-item', tab ? tab.label : tabId)
      item.setAttribute('data-dm-menu-tab', tabId)
      item.addEventListener('click', function () {
        if (context.onNavigate !== null) {
          context.onNavigate(tabId)
        } else if (tab !== undefined && typeof tab.link.click === 'function') {
          tab.link.click()
        }
      })
      return item
    }

    /**
     * Overflow, measured rather than guessed. Tabs are un-hidden, measured, and
     * then dropped from the end until the row fits; the selected tab is always
     * kept, and everything dropped is listed in the overflow menu. Nothing is
     * ever silently clipped.
     */
    function applyOverflow() {
      overflowMenu.innerHTML = ''
      var candidates = flow.querySelectorAll('.dm-tabstrip-tab')
      var list = []
      for (var i = 0; i < candidates.length; i++) {
        candidates[i].hidden = false
        candidates[i].removeAttribute('data-dm-overflowed')
        list.push(candidates[i])
      }
      var available = element.clientWidth - pinnedRegion.offsetWidth
      if (!available || available <= 0) {
        overflowButton.hidden = true
        ensureTabStop()
        return
      }
      // The "More" button lives in the toolbar, on a row of its own, so it never
      // competes with the strip for width and nothing is reserved from it.
      // Reserving its measured width used to collapse the whole strip at narrow
      // widths, where the toolbar is a single column and the button is therefore
      // as wide as the row: `available - reserve` came out at zero and every
      // unselected tab was pushed into the menu.
      var reserve = 8
      var used = 0
      var overflowed = []
      for (var t = 0; t < list.length; t++) {
        used += list[t].offsetWidth
        var selected = list[t].getAttribute('aria-selected') === 'true'
        if (used > available - reserve && !selected) {
          overflowed.push(list[t])
        }
      }
      for (var o = 0; o < overflowed.length; o++) {
        overflowed[o].hidden = true
        overflowed[o].setAttribute('data-dm-overflowed', 'true')
        overflowMenu.appendChild(
          menuItem(overflowed[o].getAttribute('data-tab'))
        )
      }
      overflowButton.hidden = overflowed.length === 0
      overflowButton.textContent =
        context.label('overflow', 'More') +
        ' (' +
        String(overflowed.length) +
        ')'
      markTruncated(list)
      ensureTabStop()
    }

    /**
     * A tab whose label does not fit is ellipsised by the stylesheet, which on
     * its own leaves the rest of the name unreadable — the selected tab is exempt
     * from the overflow pass, so at 320 px a long bilingual label can lose half
     * of itself with nothing to recover it. Measured rather than assumed, so a
     * tab that fits gains no tooltip it does not need, and a tooltip the page
     * author put there is never overwritten.
     */
    function markTruncated(list) {
      for (var i = 0; i < list.length; i++) {
        var node = list[i]
        var id = node.getAttribute('data-tab')
        var tab = byId[id]
        if (tab === undefined || node.hidden === true) {
          continue
        }
        var clipped = node.scrollWidth > node.clientWidth + 1
        if (clipped) {
          node.setAttribute('data-dm-truncated', 'true')
          if (tab.title === '' && tab.label !== '') {
            node.setAttribute('title', tab.label)
          }
        } else {
          node.removeAttribute('data-dm-truncated')
          if (
            tab.title === '' &&
            node.getAttribute('data-dm-pinned') !== 'true'
          ) {
            node.removeAttribute('title')
          }
        }
      }
    }

    /**
     * Opening and closing the "More" list, kept in one place so a caller can
     * *set* the state instead of toggling it blind.
     */
    function setOverflowOpen(open) {
      overflowMenu.hidden = !open
      overflowButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    }

    overflowButton.addEventListener('click', function () {
      setOverflowOpen(overflowMenu.hidden)
    })

    /**
     * `Escape` closes whichever disclosure the focus is inside and hands focus
     * back to the control that opened it. Without this a keyboard user who opens
     * the "More" list or a group's member list has no way to dismiss it, and the
     * `aria-expanded` state stays stuck at `true`.
     */
    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' && event.key !== 'Esc') {
        return
      }
      var at = event.target
      while (at !== null && at !== undefined && at !== root) {
        // An exact class match, not a substring: `dm-tabstrip-menu-item`
        // contains `dm-tabstrip-menu`, so a substring test would match the
        // focused item and hide *it* instead of the list around it.
        if (
          at.classList !== undefined &&
          at.classList !== null &&
          at.classList.contains('dm-tabstrip-menu') &&
          at.hidden !== true
        ) {
          var id = at.id
          var trigger = root.querySelector(
            '[aria-controls="' + cssQuote(id) + '"]'
          )
          at.hidden = true
          if (trigger !== null) {
            trigger.setAttribute('aria-expanded', 'false')
            if (typeof trigger.focus === 'function') {
              trigger.focus()
            }
          }
          event.preventDefault()
          return
        }
        at = at.parentNode
      }
      if (overflowMenu.hidden !== true) {
        setOverflowOpen(false)
        if (typeof overflowButton.focus === 'function') {
          overflowButton.focus()
        }
        event.preventDefault()
      }
    })

    function renderClosed(resolved) {
      closedList.innerHTML = ''
      closedSection.hidden = resolved.hidden.length === 0
      for (var i = 0; i < resolved.hidden.length; i++) {
        var tabId = resolved.hidden[i]
        var tab = byId[tabId]
        var item = makeElement(doc, 'li', 'dm-tabs-closed-item')
        item.appendChild(makeElement(doc, 'span', '', tab ? tab.label : tabId))
        var restore = button(
          doc,
          'dm-tabs-action',
          context.label('restore', 'Restore')
        )
        restore.addEventListener(
          'click',
          (function (id) {
            return function () {
              state = Logic.restoreTabs(state, [id])
              persist()
              render()
            }
          })(tabId)
        )
        item.appendChild(restore)
        closedList.appendChild(item)
      }
    }

    function renderGroupList(resolved) {
      groupList.innerHTML = ''
      for (var g = 0; g < state.groups.length; g++) {
        groupList.appendChild(groupRow(state.groups[g], resolved))
      }
    }

    function groupRow(group, resolved) {
      var row = makeElement(doc, 'div', 'dm-tabs-group-row')

      var nameId = uniqueId('group-name')
      var nameLabel = makeElement(
        doc,
        'label',
        'dm-tabs-field-label',
        context.label('groupName', 'Group name')
      )
      nameLabel.setAttribute('for', nameId)
      var name = doc.createElement('input')
      name.type = 'text'
      name.id = nameId
      name.className = 'dm-tabs-input'
      name.value = group.name
      name.setAttribute('maxlength', String(Logic.maximumGroupNameLength))
      name.addEventListener('change', function () {
        state = Logic.renameGroup(state, group.id, name.value)
        persist()
        render()
      })

      var colorId = uniqueId('group-color')
      var colorLabel = makeElement(
        doc,
        'label',
        'dm-tabs-field-label',
        context.label('groupColor', 'Group colour')
      )
      colorLabel.setAttribute('for', colorId)
      var color = doc.createElement('input')
      color.type = 'color'
      color.id = colorId
      color.className = 'dm-tabs-color'
      color.value = group.color === null ? '#6750a4' : group.color.slice(0, 7)
      color.addEventListener('change', function () {
        state = Logic.setGroupColor(state, group.id, color.value)
        persist()
        render()
      })

      var actions = makeElement(doc, 'div', 'dm-tabs-group-actions')
      actions.appendChild(
        groupAction(context.label('moveUp', 'Move group up'), function () {
          state = Logic.moveGroup(state, group.id, -1)
          persist()
          render()
        })
      )
      actions.appendChild(
        groupAction(context.label('moveDown', 'Move group down'), function () {
          state = Logic.moveGroup(state, group.id, 1)
          persist()
          render()
        })
      )
      actions.appendChild(
        groupAction(
          group.collapsed
            ? context.label('expand', 'Expand group')
            : context.label('collapse', 'Collapse group'),
          function () {
            state = Logic.setGroupCollapsed(state, group.id, !group.collapsed)
            persist()
            render()
          }
        )
      )
      actions.appendChild(
        groupAction(context.label('removeGroup', 'Remove group'), function () {
          state = Logic.removeGroup(state, group.id)
          persist()
          render()
          announce(
            context.label(
              'announceGroupRemoved',
              'Group removed. Its tabs are now ungrouped.'
            )
          )
        })
      )

      // (b) a search inside this individual group, with its own state
      if (groupSearchFields[group.id] === undefined) {
        groupSearchFields[group.id] = Logic.createSearchState(
          'group:' + stripId + ':' + group.id
        )
      }
      var field = searchField(context, groupSearchFields[group.id], {
        label:
          context.label('searchInGroup', 'Search tabs in this group') +
          ' — ' +
          (group.name === ''
            ? context.label('unnamedGroup', 'Unnamed group')
            : group.name),
        onChange: function () {
          runGroupSearch(group.id, field, results)
        },
      })
      var results = makeElement(doc, 'ul', 'dm-tabs-results')
      results.hidden = true

      var members = makeElement(doc, 'div', 'dm-tabs-group-membership')
      var section = null
      for (var s = 0; s < resolved.sections.length; s++) {
        if (resolved.sections[s].groupId === group.id) {
          section = resolved.sections[s]
        }
      }
      for (var i = 0; i < ids.length; i++) {
        members.appendChild(memberToggle(ids[i], group, section))
      }

      row.appendChild(nameLabel)
      row.appendChild(name)
      row.appendChild(colorLabel)
      row.appendChild(color)
      row.appendChild(actions)
      row.appendChild(field.element)
      row.appendChild(results)
      row.appendChild(members)
      return row
    }

    function memberToggle(tabId, group, section) {
      var tab = byId[tabId]
      var inGroup = section !== null && indexOfId(section.tabs, tabId) !== -1
      var wrap = makeElement(doc, 'label', 'dm-tabs-member')
      var box = doc.createElement('input')
      box.type = 'checkbox'
      box.checked = inGroup
      box.addEventListener('change', function () {
        state = Logic.assignToGroup(
          state,
          tabId,
          box.checked === true ? group.id : null
        )
        persist()
        render()
      })
      wrap.appendChild(box)
      wrap.appendChild(makeElement(doc, 'span', '', tab ? tab.label : tabId))
      return wrap
    }

    function groupAction(text_, handler) {
      var node = button(doc, 'dm-tabs-action', text_)
      node.addEventListener('click', handler)
      return node
    }

    function runGroupSearch(groupId, field, host) {
      var all = entries()
      var list = Logic.entriesForGroup(all, stripId, groupId)
      context.evaluator.run(
        'group:' + stripId + ':' + groupId,
        list,
        field.state,
        Logic.visibleStrings,
        function (result) {
          var next = Logic.applySearch(field.state, list, { result: result })
          field.setStatus(next)
          renderResults(host, next, false)
        }
      )
    }

    // --------------------------------------------------- keyboard and pointer

    /**
     * Roving focus plus keyboard reordering. `Alt` with an arrow moves the tab;
     * a bare arrow moves focus, which is what a tablist owes a screen-reader
     * user. Activation is deliberately left to the existing anchor behaviour.
     */
    element.addEventListener('keydown', function (event) {
      var target = event.target
      if (target === null || !target.hasAttribute('data-tab')) {
        return
      }
      var visible = visibleTabs()
      var at = -1
      for (var i = 0; i < visible.length; i++) {
        if (visible[i] === target) {
          at = i
        }
      }
      if (at === -1) {
        return
      }
      var key = event.key
      var step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0
      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        step = -1
      }
      if (step !== 0 && event.altKey === true) {
        event.preventDefault()
        state = Logic.moveTab(state, target.getAttribute('data-tab'), step)
        persist()
        render()
        var moved = element.querySelector(
          '[data-tab="' + cssQuote(target.getAttribute('data-tab')) + '"]'
        )
        if (moved !== null) {
          moved.focus()
        }
        announce(context.label('announceMoved', 'Tab moved'))
        return
      }
      if (step !== 0) {
        event.preventDefault()
        var next = visible[(at + step + visible.length) % visible.length]
        focusTab(visible, next)
        return
      }
      if (key === 'Home') {
        event.preventDefault()
        focusTab(visible, visible[0])
        return
      }
      if (key === 'End') {
        event.preventDefault()
        focusTab(visible, visible[visible.length - 1])
        return
      }
      if (key === 'p' && event.altKey === true) {
        event.preventDefault()
        var tabId = target.getAttribute('data-tab')
        var pinned = indexOfId(state.pinned, tabId) !== -1
        state = Logic.setPinned(state, tabId, !pinned)
        persist()
        render()
        announce(
          pinned
            ? context.label('announceUnpinned', 'Tab unpinned')
            : context.label('announcePinned', 'Tab pinned')
        )
      }
    })

    /**
     * A tab is reachable only if it actually has a layout box. The `hidden`
     * attribute is not enough on its own: a member of a collapsed group carries
     * no `hidden` of its own, its *wrapper* is the thing that is hidden, so a
     * check on the anchor alone would offer arrow-key focus to a tab that
     * `focus()` cannot move to — leaving the roving `tabindex` on an unreachable
     * node and the strip with no keyboard entry point at all.
     */
    function isReachable(node) {
      // Walked structurally rather than measured, so the answer is the same in a
      // browser and under a DOM shim with no layout: every container this module
      // hides — the pinned region, a collapsed group's member row, the closed
      // region — is hidden with the `hidden` attribute, and the stylesheet gives
      // each of them `display: none`.
      var at = node
      while (at !== null && at !== undefined) {
        if (at.hidden === true) {
          return false
        }
        if (at === element) {
          return true
        }
        at = at.parentNode
      }
      return true
    }

    function visibleTabs() {
      var found = element.querySelectorAll('[data-tab]')
      var list = []
      for (var i = 0; i < found.length; i++) {
        if (isReachable(found[i])) {
          list.push(found[i])
        }
      }
      return list
    }

    function focusTab(list, node) {
      // Roving focus: exactly one tab is in the tab sequence at a time, so Tab
      // leaves the strip instead of walking every tab in it.
      for (var i = 0; i < list.length; i++) {
        list[i].setAttribute('tabindex', list[i] === node ? '0' : '-1')
      }
      if (node !== undefined && typeof node.focus === 'function') {
        node.focus()
      }
    }

    /**
     * The strip must always keep exactly one reachable tab stop. Overflow, a
     * collapse and a bulk close all remove tabs from the layout, and any of them
     * can take away the very tab the roving `tabindex` was sitting on — after
     * which `Tab` skips the entire tablist and the only way back in is a mouse.
     * The selected tab is preferred, then the first reachable one.
     */
    function ensureTabStop() {
      var all = element.querySelectorAll('[data-tab]')
      var reachable = []
      var holder = null
      for (var i = 0; i < all.length; i++) {
        if (!isReachable(all[i])) {
          // An unreachable tab must not keep a positive tabindex, or it becomes
          // a tab stop the user can never see.
          all[i].setAttribute('tabindex', '-1')
          continue
        }
        reachable.push(all[i])
        if (all[i].getAttribute('tabindex') === '0') {
          holder = all[i]
        }
      }
      if (reachable.length === 0 || holder !== null) {
        return
      }
      var wanted = reachable[0]
      for (var s = 0; s < reachable.length; s++) {
        if (reachable[s].getAttribute('aria-selected') === 'true') {
          wanted = reachable[s]
        }
      }
      for (var r = 0; r < reachable.length; r++) {
        reachable[r].setAttribute(
          'tabindex',
          reachable[r] === wanted ? '0' : '-1'
        )
      }
    }

    var drag = null

    element.addEventListener('pointerdown', function (event) {
      var target = event.target
      if (
        target === null ||
        typeof target.hasAttribute !== 'function' ||
        !target.hasAttribute('data-tab')
      ) {
        return
      }
      drag = {
        id: target.getAttribute('data-tab'),
        node: target,
        x: event.clientX,
        moved: false,
      }
    })

    element.addEventListener('pointermove', function (event) {
      if (drag === null) {
        return
      }
      // A drag only begins past a threshold, so a normal tap still activates
      // the tab rather than being swallowed as a reorder.
      if (!drag.moved && Math.abs(event.clientX - drag.x) < 8) {
        return
      }
      drag.moved = true
      root.setAttribute('data-dm-dragging', 'true')
    })

    element.addEventListener('pointerup', function (event) {
      if (drag === null) {
        return
      }
      var held = drag
      drag = null
      root.removeAttribute('data-dm-dragging')
      if (!held.moved) {
        return
      }
      event.preventDefault()
      var step = event.clientX > held.x ? 1 : -1
      state = Logic.moveTab(state, held.id, step)
      persist()
      render()
      announce(context.label('announceMoved', 'Tab moved'))
    })

    element.addEventListener('pointercancel', function () {
      drag = null
      root.removeAttribute('data-dm-dragging')
    })

    element.addEventListener(
      'click',
      function (event) {
        var target = event.target
        if (
          target !== null &&
          typeof target.hasAttribute === 'function' &&
          target.hasAttribute('data-tab') &&
          root.getAttribute('data-dm-dragging') === 'true'
        ) {
          event.preventDefault()
        }
      },
      true
    )

    if (typeof global.ResizeObserver === 'function') {
      try {
        new global.ResizeObserver(function () {
          applyOverflow()
        }).observe(element)
      } catch (error) {
        /* Measurement still happens on render and on window resize. */
      }
    } else if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', applyOverflow)
    }

    render()

    return {
      id: stripId,
      label: stripLabel,
      element: root,
      list: element,
      panel: panel,
      describe: describe,
      render: render,
      state: function () {
        return Logic.cloneState(state)
      },
      setState: function (next) {
        state = Logic.sanitizeState(next, ids)
        persist()
        render()
      },
      pin: function (tabId, pinned) {
        state = Logic.setPinned(state, tabId, pinned)
        persist()
        render()
      },
      reveal: reveal,
    }
  }

  function findGroup(state, groupId) {
    var at = Logic.groupIndexOf(state, groupId)
    return at === -1 ? null : state.groups[at]
  }

  /** Route ids contain `/`, which an attribute selector must see quoted. */
  function cssQuote(value) {
    return text(value).replace(/["\\]/g, '\\$&')
  }

  /**
   * Bulk close. The preview is mandatory: the mode, the affected count and the
   * protected pinned tabs are shown before anything closes, and the Close
   * button stays disabled until a valid preview exists.
   */
  function createBulkClose(context, options) {
    var doc = context.doc
    var root = makeElement(doc, 'section', 'dm-tabs-bulk')
    var heading = makeElement(doc, 'h3', 'dm-tabs-heading')
    context.retext(heading, 'bulk', 'Close tabs by text')
    root.appendChild(heading)

    var state = Logic.createSearchState('bulk')
    var mode = Logic.containsMode
    var plan = null
    /**
     * Identifies the run whose reply the preview is still waiting for. Evaluation
     * is asynchronous whenever the worker is used, so a reply can arrive after
     * the reader has already changed the query, the mode or the pinned opt-in.
     * Without this the late reply would re-enable Close against a predicate the
     * reader has replaced, and the "mandatory preview" would describe a query
     * that is no longer in the field.
     */
    var previewToken = 0

    var modeGroup = makeElement(doc, 'fieldset', 'dm-tabs-bulk-mode')
    var legend = makeElement(doc, 'legend', '')
    context.retext(legend, 'bulkMode', 'Which tabs to close')
    modeGroup.appendChild(legend)
    var modeName = uniqueId('bulk-mode')

    function radio(value, key, fallback) {
      var wrap = makeElement(doc, 'label', 'dm-tabs-bulk-radio')
      var input = doc.createElement('input')
      input.type = 'radio'
      input.name = modeName
      input.value = value
      input.checked = value === mode
      input.addEventListener('change', function () {
        if (input.checked) {
          mode = value
          invalidate()
        }
      })
      wrap.appendChild(input)
      var caption = makeElement(doc, 'span', '')
      context.retext(caption, key, fallback)
      wrap.appendChild(caption)
      modeGroup.appendChild(wrap)
      return input
    }

    radio(Logic.containsMode, 'bulkContains', 'Close tabs containing text')
    radio(
      Logic.notContainsMode,
      'bulkNotContains',
      'Close tabs not containing text'
    )
    root.appendChild(modeGroup)

    var field = searchField(context, state, {
      label: function () {
        return context.label('bulkQuery', 'Text to match')
      },
      onChange: function () {
        invalidate()
      },
    })
    context.relabel(field.relabel)
    root.appendChild(field.element)

    var includeWrap = makeElement(doc, 'label', 'dm-tabs-bulk-include')
    var include = doc.createElement('input')
    include.type = 'checkbox'
    include.addEventListener('change', invalidate)
    includeWrap.appendChild(include)
    var includeCaption = makeElement(doc, 'span', '')
    context.retext(includeCaption, 'bulkIncludePinned', 'Include pinned tabs')
    includeWrap.appendChild(includeCaption)
    root.appendChild(includeWrap)

    var previewButton = button(doc, 'dm-tabs-action')
    context.retext(previewButton, 'bulkPreview', 'Preview')
    var closeButton = button(doc, 'dm-tabs-action dm-tabs-action--danger')
    context.retext(closeButton, 'bulkClose', 'Close matching tabs')
    closeButton.disabled = true
    var actions = makeElement(doc, 'div', 'dm-tabs-bulk-actions')
    actions.appendChild(previewButton)
    actions.appendChild(closeButton)
    root.appendChild(actions)

    var preview = makeElement(doc, 'div', 'dm-tabs-bulk-preview')
    preview.setAttribute('role', 'status')
    preview.setAttribute('aria-live', 'polite')
    root.appendChild(preview)

    /**
     * Any edit voids the preview, so a close can never use a stale count. The
     * token moves too, which is what makes that true for a run still in flight
     * rather than only for the plan already on screen.
     */
    function invalidate() {
      previewToken++
      plan = null
      closeButton.disabled = true
      preview.textContent = context.label(
        'bulkStale',
        'Preview again to see what would close.'
      )
    }

    function describeCode(code) {
      if (code === 'empty') {
        return context.label(
          'bulkEmpty',
          'Enter text first. An empty query never closes a tab.'
        )
      }
      if (code === 'invalid' || code === 'invalid-flags') {
        return context.label(
          'bulkInvalid',
          'Invalid pattern. Nothing will close.'
        )
      }
      if (code === 'timeout') {
        return context.label(
          'bulkTimeout',
          'Pattern took too long. Nothing will close.'
        )
      }
      if (code === 'too-long-pattern') {
        return context.label('statusTooLong', 'Pattern is too long.')
      }
      if (code === 'too-many-tabs' || code === 'truncated') {
        return context.label('statusTooMany', 'Too many tabs to match safely.')
      }
      return context.label(
        'bulkUnavailable',
        'Could not match. Nothing will close.'
      )
    }

    previewButton.addEventListener('click', function () {
      var strip = options.strip()
      var entries = Logic.flatten({ strips: [strip] })
      var token = ++previewToken
      context.evaluator.run(
        'bulk:' + strip.id,
        entries,
        state,
        Logic.visibleStrings,
        function (result) {
          // The query, the mode or the pinned opt-in changed while this ran, so
          // this reply describes a predicate the reader no longer has. Dropping
          // it leaves Close disabled and the preview honest.
          if (token !== previewToken) {
            return
          }
          plan = Logic.planBulkClose(entries, result, {
            mode: mode,
            includePinned: include.checked === true,
          })
          renderPreview(plan)
        }
      )
    })

    function renderPreview(current) {
      preview.innerHTML = ''
      if (current.runnable !== true) {
        closeButton.disabled = true
        preview.appendChild(
          makeElement(doc, 'p', '', describeCode(current.code))
        )
        return
      }
      preview.appendChild(
        makeElement(
          doc,
          'p',
          'dm-tabs-bulk-summary',
          (current.mode === Logic.containsMode
            ? context.label('bulkContains', 'Close tabs containing text')
            : context.label(
                'bulkNotContains',
                'Close tabs not containing text'
              )) +
            ' · ' +
            (current.matchMode === 'regex'
              ? context.label('modeRegex', 'regex')
              : context.label('modePlain', 'text')) +
            ' · ' +
            String(current.count) +
            ' / ' +
            String(current.total)
        )
      )
      var list = makeElement(doc, 'ul', 'dm-tabs-bulk-list')
      for (var i = 0; i < current.affected.length; i++) {
        list.appendChild(makeElement(doc, 'li', '', current.affected[i].label))
      }
      preview.appendChild(list)
      if (current.protectedPinned.length > 0) {
        preview.appendChild(
          makeElement(
            doc,
            'p',
            'dm-tabs-bulk-protected',
            (current.includePinned
              ? context.label(
                  'bulkPinnedIncluded',
                  'Pinned tabs that would close'
                )
              : context.label('bulkPinnedExcluded', 'Pinned tabs kept')) +
              ': ' +
              pinnedNames(current.protectedPinned)
          )
        )
      }
      closeButton.disabled = current.count === 0
    }

    function pinnedNames(list) {
      var names = []
      for (var i = 0; i < list.length; i++) {
        names.push(list[i].label)
      }
      return names.join(', ')
    }

    closeButton.addEventListener('click', function () {
      if (plan === null || plan.runnable !== true || plan.count === 0) {
        return
      }
      var ids = []
      for (var i = 0; i < plan.affected.length; i++) {
        ids.push(plan.affected[i].tabId)
      }
      options.onClose(ids)
      invalidate()
    })

    invalidate()

    return {
      element: root,
      refresh: invalidate,
    }
  }

  /**
   * (d) The master search: every tab across every strip and group this module
   * owns. It holds its own state and reads the live model, so it can never
   * disagree with a strip's own search or inherit its flags.
   */
  function createMasterSearch(context, controllers) {
    var doc = context.doc
    var root = makeElement(doc, 'section', 'dm-tabs-master')
    var heading = makeElement(doc, 'h3', 'dm-tabs-heading')
    context.retext(heading, 'searchAll', 'Search every open tab')
    root.appendChild(heading)
    var results = makeElement(doc, 'ul', 'dm-tabs-results')
    results.hidden = true

    var state = Logic.createSearchState('master')
    var field = searchField(context, state, {
      label: function () {
        return context.label('searchAll', 'Search every open tab')
      },
      onChange: run,
    })
    context.relabel(field.relabel)
    root.appendChild(field.element)
    root.appendChild(results)

    function run() {
      var entries = Logic.flatten(currentModel(controllers))
      context.evaluator.run(
        'master',
        entries,
        field.state,
        Logic.visibleStrings,
        function (result) {
          var next = Logic.applySearch(field.state, entries, { result: result })
          field.setStatus(next)
          render(next)
        }
      )
    }

    function render(searchState) {
      results.innerHTML = ''
      if (searchState.status === 'idle') {
        results.hidden = true
        return
      }
      results.hidden = false
      for (var i = 0; i < searchState.results.length; i++) {
        var entry = searchState.results[i]
        var item = makeElement(doc, 'li', 'dm-tabs-result')
        var action = button(doc, 'dm-tabs-result-button')
        action.appendChild(
          makeElement(doc, 'span', 'dm-tabs-result-label', entry.label)
        )
        action.appendChild(
          makeElement(
            doc,
            'span',
            'dm-tabs-result-where',
            entry.stripLabel +
              ' · ' +
              (entry.groupName === ''
                ? context.label('ungrouped', 'Ungrouped')
                : entry.groupName) +
              (entry.pinned ? ' · ' + context.label('pinned', 'Pinned') : '')
          )
        )
        action.addEventListener(
          'click',
          (function (target) {
            return function () {
              for (var c = 0; c < controllers.length; c++) {
                if (controllers[c].id === target.stripId) {
                  controllers[c].reveal(target)
                }
              }
            }
          })(entry)
        )
        item.appendChild(action)
        results.appendChild(item)
      }
      if (searchState.results.length === 0) {
        results.appendChild(
          makeElement(
            doc,
            'li',
            'dm-tabs-result-empty',
            context.label('noMatches', 'No tab matches that query.')
          )
        )
      }
    }

    return { element: root, refresh: run, state: field }
  }

  var api = {
    logic: Logic,
    upgrade: upgrade,
    create: upgrade,
    createEvaluator: createEvaluator,
    storageKey: storageKey,
    version: StateVersion,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsTabs = api
})(typeof window === 'undefined' ? globalThis : window)
