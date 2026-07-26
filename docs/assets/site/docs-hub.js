/**
 * Desktop Material documentation hub — behaviour.
 *
 * Localization resources live in `docs-hub-strings.js`, the documentation
 * catalog in `docs-hub-catalog.js`. This file only reads them.
 *
 * Everything runs locally in the reader's browser: no network requests, no
 * analytics, nothing typed here leaves the page.
 */
;(function () {
  'use strict'

  var STRINGS = window.DesktopMaterialDocsStrings
  var CATALOG = window.DesktopMaterialDocsCatalog || []

  var STORE = {
    theme: 'dm-docs-theme',
    lang: 'dm-docs-lang',
    funEn: 'dm-docs-fun-en',
    funYue: 'dm-docs-fun-yue',
  }

  /** Safety bounds. Both are also enforced with `maxlength` in the markup. */
  var MaximumPatternLength = 512
  var MaximumSampleLength = 20000
  /**
   * Ceiling for a *single* regex evaluation. Catastrophic backtracking blows
   * up inside one `exec`/`test` call, so timing each call individually — rather
   * than the whole pass — distinguishes a pathological pattern from a merely
   * busy or throttled tab, which spreads its delay across many calls.
   *
   * A synchronous evaluation cannot be interrupted from JavaScript. The real
   * protection is therefore the bounded input (pattern and sample caps below);
   * this timer catches the overrun afterwards and stops the run from repeating.
   */
  var EvaluationBudgetMilliseconds = 750

  /**
   * How many separate evaluations must overrun before matching is paused. One
   * overrun is far more likely to be the tab being descheduled than a runaway
   * pattern; a genuinely catastrophic pattern overruns on call after call.
   */
  var RequiredOverrunsBeforePausing = 3
  var MaximumRenderedResults = 60
  var MaximumRenderedMatches = 100

  // ------------------------------------------------------------- storage

  function read(key, fallback) {
    try {
      var value = window.localStorage.getItem(key)
      return value === null ? fallback : value
    } catch (error) {
      return fallback
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (error) {
      /* Private-mode storage failures must never break the page. */
    }
  }

  // ----------------------------------------------------------- preferences

  var prefs = {
    theme: read(STORE.theme, 'system'),
    lang: read(STORE.lang, 'en'),
    funEn: clampLevel(read(STORE.funEn, '3')),
    funYue: clampLevel(read(STORE.funYue, '3')),
  }

  if (prefs.lang !== 'en' && prefs.lang !== 'yue' && prefs.lang !== 'bi') {
    prefs.lang = 'en'
  }
  if (
    prefs.theme !== 'system' &&
    prefs.theme !== 'light' &&
    prefs.theme !== 'dark'
  ) {
    prefs.theme = 'system'
  }

  function clampLevel(value) {
    var level = parseInt(value, 10)
    if (isNaN(level)) {
      return 3
    }
    return Math.min(5, Math.max(1, level))
  }

  function primaryLanguage() {
    return prefs.lang === 'yue' ? 'yue' : 'en'
  }

  function secondaryLanguage() {
    return prefs.lang === 'bi' ? 'yue' : null
  }

  function levelFor(languageId) {
    return languageId === 'yue' ? prefs.funYue : prefs.funEn
  }

  /**
   * Resolves one string. Fallback order: requested language at the requested
   * level, then the requested language at level 1, then English at level 1.
   */
  function fixedString(languageId, key) {
    var pack = STRINGS[languageId]
    if (pack && pack.fixed && typeof pack.fixed[key] === 'string') {
      return pack.fixed[key]
    }
    var fallback = STRINGS.en.fixed[key]
    return typeof fallback === 'string' ? fallback : key
  }

  function toneString(languageId, key) {
    var pack = STRINGS[languageId]
    var level = levelFor(languageId)
    if (pack && pack.tone && Array.isArray(pack.tone[key])) {
      var list = pack.tone[key]
      if (typeof list[level - 1] === 'string') {
        return list[level - 1]
      }
      if (typeof list[0] === 'string') {
        return list[0]
      }
    }
    var enList = STRINGS.en.tone[key]
    return Array.isArray(enList) && typeof enList[0] === 'string'
      ? enList[0]
      : key
  }

  /** Primary-language text for a key, used by scripted messages. */
  function t(key) {
    return fixedString(primaryLanguage(), key)
  }

  // ------------------------------------------------------------------ i18n

  function textFor(languageId, element) {
    var toneKey = element.getAttribute('data-i18n-tone')
    if (toneKey !== null) {
      return toneString(languageId, toneKey)
    }
    return fixedString(languageId, element.getAttribute('data-i18n'))
  }

  function applyLanguage() {
    var primary = primaryLanguage()
    var secondary = secondaryLanguage()
    var root = document.documentElement

    root.setAttribute('lang', STRINGS[primary].htmlLang)
    root.setAttribute('data-lang', prefs.lang)

    var nodes = document.querySelectorAll('[data-i18n], [data-i18n-tone]')
    for (var i = 0; i < nodes.length; i++) {
      var element = nodes[i]
      var a = element.querySelector(':scope > .i18n-a')
      var b = element.querySelector(':scope > .i18n-b')
      if (a === null) {
        a = document.createElement('span')
        a.className = 'i18n-a'
        b = document.createElement('span')
        b.className = 'i18n-b'
        element.textContent = ''
        element.appendChild(a)
        element.appendChild(b)
      }
      a.textContent = textFor(primary, element)
      if (secondary === null) {
        b.textContent = ''
        b.removeAttribute('lang')
      } else {
        b.textContent = textFor(secondary, element)
        b.setAttribute('lang', STRINGS[secondary].htmlLang)
      }
    }

    // Attributes always carry the primary language only, so placeholders and
    // accessible names stay short and unambiguous in bilingual mode.
    var attributed = document.querySelectorAll('[data-i18n-attr]')
    for (var j = 0; j < attributed.length; j++) {
      var target = attributed[j]
      var pairs = target.getAttribute('data-i18n-attr').split(';')
      for (var k = 0; k < pairs.length; k++) {
        var pair = pairs[k].trim()
        if (pair === '') {
          continue
        }
        var split = pair.indexOf('=')
        var name = pair.slice(0, split).trim()
        var key = pair.slice(split + 1).trim()
        target.setAttribute(name, fixedString(primary, key))
      }
    }

    document.title =
      fixedString(primary, 'brandTitle') +
      ' · ' +
      fixedString(primary, 'brandSubtitle')

    refreshSliderOutputs()
    renderSearch()
    renderBuilder()
  }

  // ----------------------------------------------------------------- theme

  var darkQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null

  function effectiveTheme() {
    if (prefs.theme !== 'system') {
      return prefs.theme
    }
    return darkQuery !== null && darkQuery.matches ? 'dark' : 'light'
  }

  function applyTheme() {
    var root = document.documentElement
    if (prefs.theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', prefs.theme)
    }
    var dark = effectiveTheme() === 'dark'
    var button = document.getElementById('theme-toggle')
    if (button !== null) {
      button.setAttribute('aria-pressed', dark ? 'true' : 'false')
      var sun = button.querySelector('.icon-light')
      var moon = button.querySelector('.icon-dark')
      if (sun !== null && moon !== null) {
        sun.style.display = dark ? '' : 'none'
        moon.style.display = dark ? 'none' : ''
      }
    }
  }

  if (darkQuery !== null && typeof darkQuery.addEventListener === 'function') {
    darkQuery.addEventListener('change', applyTheme)
  }

  // ---------------------------------------------------------------- toasts

  var toastHost = null

  /**
   * Corner notification. Informational toasts dismiss themselves; errors and
   * warnings persist until the reader dismisses them. Nothing here is modal.
   */
  function toast(message, tone) {
    if (toastHost === null) {
      toastHost = document.getElementById('toasts')
    }
    if (toastHost === null) {
      return
    }
    // A repeated message (a slow pattern re-tripping on every keystroke, say)
    // must not stack the same notification over and over.
    var existing = toastHost.querySelectorAll('.toast__text')
    for (var e = 0; e < existing.length; e++) {
      if (existing[e].textContent === message) {
        return
      }
    }
    var persistent = tone === 'error' || tone === 'warn'
    var item = document.createElement('div')
    item.className = 'toast'
    item.setAttribute('data-tone', tone || 'info')
    item.setAttribute('role', persistent ? 'alert' : 'status')

    var text = document.createElement('div')
    text.className = 'toast__text'
    text.textContent = message
    item.appendChild(text)

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'toast__close'
    close.setAttribute('aria-label', t('dismiss'))
    close.textContent = '✕'
    close.addEventListener('click', function () {
      item.remove()
    })
    item.appendChild(close)

    toastHost.appendChild(item)
    if (!persistent) {
      window.setTimeout(function () {
        item.remove()
      }, 4000)
    }
  }

  // ------------------------------------------------------------ clipboard

  function copyText(value) {
    if (
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      navigator.clipboard.writeText(value).then(
        function () {
          toast(t('copied'), 'info')
        },
        function () {
          toast(t('copyFailed'), 'error')
        }
      )
      return
    }
    toast(t('copyFailed'), 'error')
  }

  // ---------------------------------------------------------- regex helpers

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\/\-]/g, '\\$&')
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Flags a shape that is known to backtrack exponentially — a quantified
   * group whose body is itself quantified, such as `(a+)+` or `(\w*\s?)*`.
   * This is a warning, not a block: the reader may still know what they want.
   */
  function looksCatastrophic(pattern) {
    return /\([^()]*[+*][^()]*\)\s*[+*]/.test(pattern)
  }

  /**
   * Compiles a pattern, returning `{ regex }` or `{ error }`. Never throws.
   */
  function compile(pattern, flags) {
    if (pattern.length > MaximumPatternLength) {
      return { error: t('errPatternLong') }
    }
    try {
      return { regex: new RegExp(pattern, flags) }
    } catch (error) {
      return { error: t('errInvalid') + ' ' + error.message }
    }
  }

  // ----------------------------------------------------------------- search

  var searchState = {
    query: '',
    mode: 'plain',
    flags: { g: true, i: true, m: false, s: false, u: false, y: false },
    paused: false,
  }

  var searchInput = null
  var searchStatus = null
  var searchResults = null
  var searchModeButton = null
  var syncing = false

  function activeFlagString(includeGlobal) {
    var flags = ''
    var order = ['g', 'i', 'm', 's', 'u', 'y']
    for (var i = 0; i < order.length; i++) {
      var name = order[i]
      if (name === 'g' && !includeGlobal) {
        continue
      }
      if (searchState.flags[name]) {
        flags += name
      }
    }
    return flags
  }

  function haystackOf(entry) {
    return entry.t + ' ' + entry.s + ' ' + entry.d
  }

  function highlight(value, regex) {
    if (regex === null) {
      return escapeHtml(value)
    }
    var out = ''
    var index = 0
    var guard = 0
    regex.lastIndex = 0
    var match
    while ((match = regex.exec(value)) !== null && guard < 200) {
      guard++
      out += escapeHtml(value.slice(index, match.index))
      if (match[0] === '') {
        // Zero-width matches must not spin the loop forever.
        regex.lastIndex = match.index + 1
        index = match.index
        continue
      }
      out += '<mark>' + escapeHtml(match[0]) + '</mark>'
      index = match.index + match[0].length
    }
    out += escapeHtml(value.slice(index))
    return out
  }

  function renderSearch() {
    if (searchStatus === null) {
      return
    }

    var query = searchState.query.trim()
    searchStatus.removeAttribute('data-tone')

    if (query === '') {
      searchResults.innerHTML = ''
      searchStatus.textContent =
        t('searchIdle') + ' ' + CATALOG.length + ' ' + t('searchAll') + '.'
      return
    }

    var matcher = null
    var highlighter = null

    if (searchState.mode === 'regex') {
      var compiled = compile(query, activeFlagString(false))
      if (compiled.error !== undefined) {
        searchResults.innerHTML = ''
        searchStatus.setAttribute('data-tone', 'error')
        searchStatus.textContent = compiled.error
        return
      }
      matcher = compiled.regex
      var highlightCompiled = compile(
        query,
        activeFlagString(false).replace('y', '') + 'g'
      )
      highlighter =
        highlightCompiled.error === undefined ? highlightCompiled.regex : null
    } else {
      var lowered = query.toLowerCase()
      matcher = {
        test: function (value) {
          return value.toLowerCase().indexOf(lowered) !== -1
        },
      }
      var plainCompiled = compile(escapeRegex(query), 'gi')
      highlighter =
        plainCompiled.error === undefined ? plainCompiled.regex : null
    }

    // Plain-text matching is a substring scan with no backtracking, so it is
    // never timed; only a user-supplied regular expression needs a backstop.
    var timed = searchState.mode === 'regex'
    var overruns = 0
    var hits = []
    for (var i = 0; i < CATALOG.length; i++) {
      var entry = CATALOG[i]
      if (matcher.lastIndex !== undefined) {
        matcher.lastIndex = 0
      }
      var callStarted = timed ? Date.now() : 0
      var matched = matcher.test(haystackOf(entry))
      if (timed && Date.now() - callStarted > EvaluationBudgetMilliseconds) {
        overruns++
        if (overruns >= RequiredOverrunsBeforePausing) {
          searchResults.innerHTML = ''
          searchStatus.setAttribute('data-tone', 'error')
          searchStatus.textContent = t('errSlow')
          toast(t('errSlowTitle') + ' — ' + t('errSlow'), 'error')
          return
        }
      }
      if (matched) {
        hits.push(entry)
      }
    }

    if (hits.length === 0) {
      searchResults.innerHTML = ''
      searchStatus.textContent = t('searchNone')
      return
    }

    searchStatus.textContent =
      hits.length +
      ' ' +
      (hits.length === 1 ? t('searchResult') : t('searchResults')) +
      '.'

    var html = ''
    var shown = Math.min(hits.length, MaximumRenderedResults)
    for (var j = 0; j < shown; j++) {
      var hit = hits[j]
      html +=
        '<li><a class="result" href="' +
        escapeHtml(hit.h) +
        '">' +
        '<span class="result__title">' +
        highlight(hit.t, highlighter) +
        '</span> ' +
        '<span class="result__path">' +
        highlight(hit.s, highlighter) +
        '</span>' +
        (hit.d === ''
          ? ''
          : '<p class="result__desc">' +
            highlight(hit.d, highlighter) +
            '</p>') +
        '</a></li>'
    }
    if (hits.length > shown) {
      html +=
        '<li class="md-body">' +
        escapeHtml('+' + (hits.length - shown) + ' / ' + hits.length + ' …') +
        '</li>'
    }
    searchResults.innerHTML = html
  }

  function setQuery(value, from) {
    searchState.query = value
    if (syncing) {
      return
    }
    syncing = true
    if (from !== 'search' && searchInput !== null) {
      searchInput.value = value
    }
    if (from !== 'builder' && searchState.mode === 'regex') {
      var pattern = document.getElementById('rb-pattern')
      if (pattern !== null) {
        pattern.value = value
      }
    }
    syncing = false
    renderSearch()
    if (searchState.mode === 'regex') {
      renderBuilder()
    }
  }

  function setMode(mode) {
    searchState.mode = mode
    if (searchModeButton !== null) {
      searchModeButton.setAttribute(
        'aria-pressed',
        mode === 'regex' ? 'true' : 'false'
      )
    }
    if (mode === 'regex') {
      var pattern = document.getElementById('rb-pattern')
      if (pattern !== null && pattern.value !== searchState.query) {
        pattern.value = searchState.query
      }
    }
    renderSearch()
    renderBuilder()
  }

  // --------------------------------------------------------- regex builder

  var builderPaused = false

  function builderElements() {
    return {
      panel: document.getElementById('regex-builder'),
      pattern: document.getElementById('rb-pattern'),
      sample: document.getElementById('rb-sample'),
      feedback: document.getElementById('rb-feedback'),
      matches: document.getElementById('rb-matches'),
      sync: document.getElementById('rb-sync'),
    }
  }

  function currentBuilderFlags() {
    var boxes = document.querySelectorAll('.rb-flag')
    var flags = ''
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) {
        flags += boxes[i].value
      }
    }
    return flags
  }

  function renderBuilder() {
    var parts = builderElements()
    if (parts.pattern === null) {
      return
    }

    parts.sync.textContent =
      searchState.mode === 'regex' ? t('bSynced') : t('bNotSynced')

    var pattern = parts.pattern.value
    var flags = currentBuilderFlags()

    if (pattern === '') {
      parts.feedback.setAttribute('data-tone', 'info')
      parts.feedback.textContent = t('bEmptyPattern')
      parts.matches.innerHTML = ''
      parts.pattern.setAttribute('aria-invalid', 'false')
      return
    }

    var compiled = compile(
      pattern,
      flags.indexOf('g') === -1 ? flags + 'g' : flags
    )
    if (compiled.error !== undefined) {
      parts.pattern.setAttribute('aria-invalid', 'true')
      parts.feedback.setAttribute('data-tone', 'error')
      parts.feedback.textContent = compiled.error
      parts.matches.innerHTML = ''
      return
    }
    parts.pattern.setAttribute('aria-invalid', 'false')

    var sample = parts.sample.value
    if (sample.length > MaximumSampleLength) {
      parts.feedback.setAttribute('data-tone', 'error')
      parts.feedback.textContent = t('errSampleLong')
      parts.matches.innerHTML = ''
      return
    }

    if (builderPaused) {
      parts.feedback.setAttribute('data-tone', 'warn')
      parts.feedback.textContent = t('errSlow')
      return
    }

    var regex = compiled.regex
    var results = []
    var overruns = 0
    var match
    regex.lastIndex = 0
    for (;;) {
      var callStarted = Date.now()
      match = regex.exec(sample)
      if (Date.now() - callStarted > EvaluationBudgetMilliseconds) {
        overruns++
        if (overruns >= RequiredOverrunsBeforePausing) {
          builderPaused = true
          parts.feedback.setAttribute('data-tone', 'warn')
          parts.feedback.textContent = t('errSlow')
          parts.matches.innerHTML = ''
          toast(t('errSlowTitle') + ' — ' + t('errSlow'), 'error')
          return
        }
      }
      if (match === null) {
        break
      }
      results.push(match)
      if (match[0] === '') {
        // A zero-width match must not spin `exec` on the same index forever.
        regex.lastIndex = match.index + 1
      }
      if (results.length >= MaximumRenderedMatches) {
        break
      }
    }

    if (results.length === 0) {
      var risky = looksCatastrophic(pattern)
      parts.feedback.setAttribute('data-tone', risky ? 'warn' : 'info')
      parts.feedback.textContent = risky ? t('errNested') : t('bNoMatches')
      parts.matches.innerHTML = ''
      return
    }

    parts.feedback.setAttribute(
      'data-tone',
      looksCatastrophic(pattern) ? 'warn' : 'info'
    )
    parts.feedback.textContent = looksCatastrophic(pattern)
      ? t('errNested')
      : t('bValid')

    var html = ''
    for (var i = 0; i < results.length; i++) {
      var found = results[i]
      html +=
        '<li><strong>' +
        escapeHtml(found[0] === '' ? '∅' : found[0]) +
        '</strong> <span class="group">' +
        escapeHtml(t('bMatchAt') + ' ' + found.index) +
        '</span>'
      for (var g = 1; g < found.length; g++) {
        html +=
          '<span class="group">' +
          escapeHtml(
            t('bGroup') +
              ' ' +
              g +
              ': ' +
              (found[g] === undefined ? '—' : found[g])
          ) +
          '</span>'
      }
      if (found.groups !== undefined && found.groups !== null) {
        for (var name in found.groups) {
          if (Object.prototype.hasOwnProperty.call(found.groups, name)) {
            html +=
              '<span class="group">' +
              escapeHtml(
                t('bGroup') +
                  ' <' +
                  name +
                  '>: ' +
                  (found.groups[name] === undefined ? '—' : found.groups[name])
              ) +
              '</span>'
          }
        }
      }
      html += '</li>'
    }
    parts.matches.innerHTML = html
  }

  /**
   * Last known caret/selection inside the pattern field. Clicking a guided
   * control can move focus away from the field, so the range is remembered
   * rather than read back at insertion time.
   */
  var patternSelection = { start: 0, end: 0 }

  function rememberPatternSelection() {
    var field = document.getElementById('rb-pattern')
    if (field === null || field.selectionStart === null) {
      return
    }
    patternSelection.start = field.selectionStart
    patternSelection.end = field.selectionEnd
  }

  /** Inserts at the caret, wrapping the current selection when asked to. */
  function insertIntoPattern(prefix, suffix) {
    var field = document.getElementById('rb-pattern')
    if (field === null) {
      return
    }
    if (document.activeElement === field) {
      rememberPatternSelection()
    }
    var length = field.value.length
    var start = Math.min(patternSelection.start, length)
    var end = Math.min(Math.max(patternSelection.end, start), length)
    var selected = field.value.slice(start, end)
    var next =
      field.value.slice(0, start) +
      prefix +
      selected +
      suffix +
      field.value.slice(end)

    if (next.length > MaximumPatternLength) {
      toast(t('errPatternLong'), 'error')
      return
    }

    field.value = next
    var caret = start + prefix.length + selected.length
    patternSelection.start = caret
    patternSelection.end = caret
    field.focus()
    field.setSelectionRange(caret, caret)
    builderPaused = false
    if (searchState.mode === 'regex') {
      setQuery(field.value, 'builder')
    } else {
      renderBuilder()
    }
  }

  // ------------------------------------------------------------------ wiring

  function refreshSliderOutputs() {
    var pairs = [
      ['fun-en', prefs.funEn],
      ['fun-yue', prefs.funYue],
    ]
    for (var i = 0; i < pairs.length; i++) {
      var slider = document.getElementById(pairs[i][0])
      var output = document.getElementById(pairs[i][0] + '-value')
      if (slider === null || output === null) {
        continue
      }
      slider.value = String(pairs[i][1])
      var label = t('fun' + pairs[i][1])
      output.textContent = label
      slider.setAttribute('aria-valuetext', label)
    }
  }

  function wire() {
    searchInput = document.getElementById('search-input')
    searchStatus = document.getElementById('search-status')
    searchResults = document.getElementById('search-results')
    searchModeButton = document.getElementById('search-mode')

    // Preferences panel
    var prefsToggle = document.getElementById('prefs-toggle')
    var prefsPanel = document.getElementById('prefs')
    prefsToggle.addEventListener('click', function () {
      var open = prefsPanel.hasAttribute('hidden')
      if (open) {
        prefsPanel.removeAttribute('hidden')
      } else {
        prefsPanel.setAttribute('hidden', '')
      }
      prefsToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    })

    var langInputs = document.querySelectorAll('input[name="lang"]')
    for (var i = 0; i < langInputs.length; i++) {
      langInputs[i].checked = langInputs[i].value === prefs.lang
      langInputs[i].addEventListener('change', function (event) {
        prefs.lang = event.target.value
        write(STORE.lang, prefs.lang)
        applyLanguage()
      })
    }

    var themeInputs = document.querySelectorAll('input[name="theme"]')
    for (var j = 0; j < themeInputs.length; j++) {
      themeInputs[j].checked = themeInputs[j].value === prefs.theme
      themeInputs[j].addEventListener('change', function (event) {
        prefs.theme = event.target.value
        write(STORE.theme, prefs.theme)
        applyTheme()
      })
    }

    document
      .getElementById('theme-toggle')
      .addEventListener('click', function () {
        prefs.theme = effectiveTheme() === 'dark' ? 'light' : 'dark'
        write(STORE.theme, prefs.theme)
        var radios = document.querySelectorAll('input[name="theme"]')
        for (var k = 0; k < radios.length; k++) {
          radios[k].checked = radios[k].value === prefs.theme
        }
        applyTheme()
      })

    var funEn = document.getElementById('fun-en')
    funEn.addEventListener('input', function (event) {
      prefs.funEn = clampLevel(event.target.value)
      write(STORE.funEn, String(prefs.funEn))
      applyLanguage()
    })
    var funYue = document.getElementById('fun-yue')
    funYue.addEventListener('input', function (event) {
      prefs.funYue = clampLevel(event.target.value)
      write(STORE.funYue, String(prefs.funYue))
      applyLanguage()
    })

    // Copy buttons
    var copyButtons = document.querySelectorAll('[data-copy-target]')
    for (var c = 0; c < copyButtons.length; c++) {
      copyButtons[c].addEventListener('click', function (event) {
        var id = event.currentTarget.getAttribute('data-copy-target')
        var source = document.getElementById(id)
        if (source !== null) {
          copyText(source.textContent.trim())
        }
      })
    }

    // Search
    searchInput.addEventListener('input', function (event) {
      builderPaused = false
      setQuery(event.target.value, 'search')
    })
    document
      .getElementById('search-clear')
      .addEventListener('click', function () {
        builderPaused = false
        setQuery('', 'clear')
        searchInput.focus()
      })
    searchModeButton.addEventListener('click', function () {
      builderPaused = false
      setMode(searchState.mode === 'regex' ? 'plain' : 'regex')
    })

    var builderToggle = document.getElementById('builder-toggle')
    var builderPanel = document.getElementById('regex-builder')
    builderToggle.addEventListener('click', function () {
      var open = builderPanel.hasAttribute('hidden')
      var pattern = document.getElementById('rb-pattern')
      if (open) {
        builderPanel.removeAttribute('hidden')
        if (pattern.value === '' && searchState.query !== '') {
          pattern.value =
            searchState.mode === 'regex'
              ? searchState.query
              : escapeRegex(searchState.query)
        }
      } else {
        builderPanel.setAttribute('hidden', '')
      }
      builderToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      // Swap the localization key rather than the rendered text so the label
      // survives a later language or playfulness change.
      builderToggle
        .querySelector('[data-i18n]')
        .setAttribute(
          'data-i18n',
          open ? 'searchBuilderHide' : 'searchBuilderShow'
        )
      applyLanguage()
      if (open) {
        pattern.focus()
      }
    })

    // Builder controls
    document
      .getElementById('rb-pattern')
      .addEventListener('input', function (event) {
        builderPaused = false
        if (searchState.mode === 'regex') {
          setQuery(event.target.value, 'builder')
        } else {
          renderBuilder()
        }
      })
    document.getElementById('rb-sample').addEventListener('input', function () {
      builderPaused = false
      renderBuilder()
    })

    var flagBoxes = document.querySelectorAll('.rb-flag')
    for (var f = 0; f < flagBoxes.length; f++) {
      flagBoxes[f].checked = searchState.flags[flagBoxes[f].value] === true
      flagBoxes[f].addEventListener('change', function (event) {
        searchState.flags[event.target.value] = event.target.checked
        builderPaused = false
        renderBuilder()
        renderSearch()
      })
    }

    // Keep the pattern field's caret and selection current.
    var patternField = document.getElementById('rb-pattern')
    var selectionEvents = ['keyup', 'click', 'select', 'focus', 'input']
    for (var s = 0; s < selectionEvents.length; s++) {
      patternField.addEventListener(
        selectionEvents[s],
        rememberPatternSelection
      )
    }

    // Guided construction: every control declares what it inserts. Cancelling
    // the default mousedown keeps focus, and therefore the selection being
    // wrapped, inside the pattern field.
    document.addEventListener('mousedown', function (event) {
      if (
        event.target.closest !== undefined &&
        event.target.closest('[data-insert], [data-wrap-open]') !== null
      ) {
        event.preventDefault()
      }
    })

    document.addEventListener('click', function (event) {
      if (event.target.closest === undefined) {
        return
      }
      var button = event.target.closest('[data-insert], [data-wrap-open]')
      if (button === null) {
        return
      }
      event.preventDefault()
      if (button.hasAttribute('data-insert')) {
        insertIntoPattern(button.getAttribute('data-insert'), '')
        return
      }
      insertIntoPattern(
        button.getAttribute('data-wrap-open'),
        button.getAttribute('data-wrap-close') || ''
      )
    })

    document
      .getElementById('rb-literal-insert')
      .addEventListener('click', function () {
        var field = document.getElementById('rb-literal')
        if (field.value !== '') {
          insertIntoPattern(escapeRegex(field.value), '')
        }
      })

    document
      .getElementById('rb-class-insert')
      .addEventListener('click', function () {
        var chars = document.getElementById('rb-class').value
        if (chars === '') {
          return
        }
        var negate = document.getElementById('rb-class-negate').checked
        var body = chars.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
        insertIntoPattern('[' + (negate ? '^' : '') + body + ']', '')
      })

    document
      .getElementById('rb-group-named')
      .addEventListener('click', function () {
        var name = document.getElementById('rb-group-name').value.trim()
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
          toast(t('errInvalid') + ' ' + t('bGroupName'), 'error')
          return
        }
        insertIntoPattern('(?<' + name + '>', ')')
      })

    document
      .getElementById('rb-quant-insert')
      .addEventListener('click', function () {
        var min = document.getElementById('rb-quant-min').value.trim()
        var max = document.getElementById('rb-quant-max').value.trim()
        var lazy = document.getElementById('rb-quant-lazy').checked
        var body =
          max === ''
            ? '{' + (min === '' ? '0' : min) + ',}'
            : '{' + (min === '' ? '0' : min) + ',' + max + '}'
        insertIntoPattern(body + (lazy ? '?' : ''), '')
      })

    document
      .getElementById('rb-copy-pattern')
      .addEventListener('click', function () {
        copyText(document.getElementById('rb-pattern').value)
      })
    document
      .getElementById('rb-copy-literal')
      .addEventListener('click', function () {
        copyText(
          '/' +
            document.getElementById('rb-pattern').value +
            '/' +
            currentBuilderFlags()
        )
      })
    document.getElementById('rb-apply').addEventListener('click', function () {
      var value = document.getElementById('rb-pattern').value
      setMode('regex')
      setQuery(value, 'builder')
      toast(t('bApplied'), 'info')
    })
    document
      .getElementById('rb-take-query')
      .addEventListener('click', function () {
        if (searchState.query === '') {
          toast(t('bTakeQueryEmpty'), 'info')
          return
        }
        var field = document.getElementById('rb-pattern')
        field.value = escapeRegex(searchState.query)
        builderPaused = false
        if (searchState.mode === 'regex') {
          setQuery(field.value, 'builder')
        } else {
          renderBuilder()
        }
      })
    document.getElementById('rb-reset').addEventListener('click', function () {
      document.getElementById('rb-pattern').value = ''
      builderPaused = false
      if (searchState.mode === 'regex') {
        setQuery('', 'builder')
      } else {
        renderBuilder()
      }
    })
  }

  function start() {
    applyTheme()
    wire()
    applyLanguage()
    setMode('plain')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
