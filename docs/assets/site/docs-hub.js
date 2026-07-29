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
  var RegexCatalog = CATALOG.map(function (entry) {
    return [entry.t, entry.s, entry.d]
  })

  var STORE = {
    theme: 'dm-docs-theme',
    lang: 'dm-docs-lang',
    funEn: 'dm-docs-fun-en',
    funYue: 'dm-docs-fun-yue',
    density: 'dm-docs-density',
    accent: 'dm-docs-accent',
  }

  /** Safety bounds. Both are also enforced with `maxlength` in the markup. */
  var MaximumPatternLength = 512
  var MaximumSampleLength = 20000
  /**
   * User-authored patterns run only in a dedicated worker. The page owns this
   * deadline, so it can terminate a worker even while one `exec`/`test` call is
   * stuck in catastrophic backtracking. Never evaluate those patterns on the
   * UI thread as a fallback: an unavailable worker must fail closed.
   */
  var EvaluationBudgetMilliseconds = 750
  var MaximumRenderedResults = 60
  var MaximumRenderedMatches = 100
  var MaximumHighlightRanges = 200
  var RegexWorkerPath = 'assets/site/docs-hub-regex-worker.js'

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

  var Densities = ['comfortable', 'compact']
  var Accents = ['violet', 'teal', 'amber', 'rose']

  var prefs = {
    theme: read(STORE.theme, 'system'),
    lang: read(STORE.lang, 'en'),
    funEn: clampLevel(read(STORE.funEn, '3')),
    funYue: clampLevel(read(STORE.funYue, '3')),
    density: read(STORE.density, 'comfortable'),
    accent: read(STORE.accent, 'violet'),
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
  if (Densities.indexOf(prefs.density) === -1) {
    prefs.density = 'comfortable'
  }
  if (Accents.indexOf(prefs.accent) === -1) {
    prefs.accent = 'violet'
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

  /**
   * Density and accent are pure presentation: the default of each is expressed
   * by the absence of the attribute, so a stored default leaves the markup
   * exactly as the pre-paint script left it.
   */
  function applyAppearance() {
    var root = document.documentElement
    if (prefs.density === 'comfortable') {
      root.removeAttribute('data-density')
    } else {
      root.setAttribute('data-density', prefs.density)
    }
    if (prefs.accent === 'violet') {
      root.removeAttribute('data-accent')
    } else {
      root.setAttribute('data-accent', prefs.accent)
    }
  }

  // ------------------------------------------------------------------ tabs

  var DefaultRoute = 'overview'

  /**
   * Every tab is a route, and every route is the id of the panel it shows.
   * A sub-route is written `<tab>/<panel>`, so `#features/design-system` is a
   * shareable address for one category page. Without JavaScript those same
   * hashes are ordinary in-page anchors and every panel is visible, which is
   * why the markup carries no `hidden` attribute and no ARIA tab state.
   */
  var tabGroups = []
  var activeRoute = DefaultRoute

  function panelFor(route) {
    return document.getElementById(route)
  }

  function collectTabGroups() {
    tabGroups = []
    var lists = document.querySelectorAll('.tabs, .subtabs')
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i]
      var links = list.querySelectorAll('[data-tab]')
      if (links.length === 0) {
        continue
      }
      var group = {
        name: list.getAttribute('data-subtabs') || '',
        element: list,
        entries: [],
      }
      list.setAttribute('role', 'tablist')
      for (var j = 0; j < links.length; j++) {
        var link = links[j]
        var route = link.getAttribute('data-tab')
        var panel = panelFor(route)
        if (panel === null) {
          continue
        }
        link.setAttribute('role', 'tab')
        link.setAttribute('aria-controls', route)
        link.setAttribute('aria-selected', 'false')
        link.setAttribute('tabindex', '-1')
        panel.setAttribute('role', 'tabpanel')
        panel.setAttribute('tabindex', '-1')
        group.entries.push({ route: route, link: link, panel: panel })
      }
      if (group.entries.length > 0) {
        tabGroups.push(group)
      }
    }
  }

  function groupNamed(name) {
    for (var i = 0; i < tabGroups.length; i++) {
      if (tabGroups[i].name === name) {
        return tabGroups[i]
      }
    }
    return null
  }

  function knownRoute(route) {
    for (var i = 0; i < tabGroups.length; i++) {
      for (var j = 0; j < tabGroups[i].entries.length; j++) {
        if (tabGroups[i].entries[j].route === route) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Resolves any hash — stale, hand-typed or from an older link — to a route
   * this page can actually show. An unknown sub-route falls back to its parent
   * tab, and anything else falls back to the default tab.
   */
  function normalizeRoute(raw) {
    var route = String(raw === null || raw === undefined ? '' : raw)
    if (route.charAt(0) === '#') {
      route = route.slice(1)
    }
    try {
      route = decodeURIComponent(route)
    } catch (error) {
      /* A malformed escape is simply not a route. */
    }
    if (route === '') {
      return DefaultRoute
    }
    if (knownRoute(route)) {
      return route
    }
    var slash = route.indexOf('/')
    if (slash > 0 && knownRoute(route.slice(0, slash))) {
      return route.slice(0, slash)
    }
    return DefaultRoute
  }

  function selectInGroup(group, route) {
    for (var i = 0; i < group.entries.length; i++) {
      var entry = group.entries[i]
      var current = entry.route === route
      entry.link.setAttribute('aria-selected', current ? 'true' : 'false')
      entry.link.setAttribute('tabindex', current ? '0' : '-1')
      if (current) {
        entry.panel.removeAttribute('hidden')
      } else {
        entry.panel.setAttribute('hidden', '')
      }
    }
  }

  /** The first route of a sub-tab group, used when a tab is entered bare. */
  function defaultSubRoute(name) {
    var group = groupNamed(name)
    return group === null ? null : group.entries[0].route
  }

  function applyRoute(route) {
    var top =
      route.indexOf('/') === -1 ? route : route.slice(0, route.indexOf('/'))
    var root = groupNamed('')
    if (root !== null) {
      selectInGroup(root, top)
    }
    for (var i = 0; i < tabGroups.length; i++) {
      var group = tabGroups[i]
      if (group.name === '') {
        continue
      }
      var wanted =
        group.name === top && route !== top
          ? route
          : defaultSubRoute(group.name)
      selectInGroup(group, wanted)
    }
    activeRoute = route
  }

  function currentRoute() {
    return activeRoute
  }

  /**
   * Moves to a route. `push` records a history entry so Back returns to the
   * previous tab; `focus` decides whether the tab itself or the panel it opened
   * receives focus, which keeps activation from a content link readable.
   */
  function navigate(raw, options) {
    var settings = options || {}
    var route = normalizeRoute(raw)
    applyRoute(route)

    if (settings.push === true) {
      var hash = '#' + route
      try {
        if (window.history && typeof window.history.pushState === 'function') {
          window.history.pushState(null, '', hash)
        } else {
          window.location.hash = hash
        }
      } catch (error) {
        window.location.hash = hash
      }
    }

    if (settings.focus === 'panel') {
      var panel = panelFor(route)
      if (panel !== null && typeof panel.focus === 'function') {
        panel.focus()
      }
    } else if (settings.focus === 'tab') {
      var link = document.querySelector('[data-tab="' + cssEscape(route) + '"]')
      if (link !== null && typeof link.focus === 'function') {
        link.focus()
      }
    }

    if (settings.scroll !== false && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0)
    }
  }

  /** Routes contain `/`, which an attribute selector must see quoted. */
  function cssEscape(value) {
    return value.replace(/["\\]/g, '\\$&')
  }

  function wireTabs() {
    collectTabGroups()

    for (var i = 0; i < tabGroups.length; i++) {
      wireTabGroup(tabGroups[i])
    }

    // Any in-page link whose hash names a route becomes a tab activation, so
    // hero buttons and cross-references open the right page instead of
    // scrolling into a panel that is currently hidden.
    document.addEventListener('click', function (event) {
      if (event.target.closest === undefined || event.defaultPrevented) {
        return
      }
      var link = event.target.closest('a[href]')
      if (
        link === null ||
        link.hasAttribute('data-tab') ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      var href = link.getAttribute('href')
      if (href === null || href.charAt(0) !== '#' || href === '#') {
        return
      }
      var route = href.slice(1)
      if (!knownRoute(route)) {
        return
      }
      event.preventDefault()
      navigate(route, { push: true, focus: 'panel' })
      var focusTarget = link.getAttribute('data-focus')
      if (focusTarget !== null) {
        var field = document.getElementById(focusTarget)
        if (field !== null && typeof field.focus === 'function') {
          field.focus()
        }
      }
    })

    window.addEventListener('hashchange', function () {
      navigate(window.location.hash, { push: false, scroll: false })
    })
    window.addEventListener('popstate', function () {
      navigate(window.location.hash, { push: false, scroll: false })
    })

    navigate(window.location.hash, { push: false, scroll: false })
  }

  function wireTabGroup(group) {
    for (var i = 0; i < group.entries.length; i++) {
      group.entries[i].link.addEventListener('click', function (event) {
        event.preventDefault()
        navigate(event.currentTarget.getAttribute('data-tab'), {
          push: true,
          focus: 'tab',
        })
      })
    }

    // Arrow keys move between tabs and activate on arrival, which is the
    // recommended behaviour when switching a tab costs nothing.
    group.element.addEventListener('keydown', function (event) {
      var index = -1
      for (var i = 0; i < group.entries.length; i++) {
        if (group.entries[i].link === event.target) {
          index = i
        }
      }
      if (index === -1) {
        return
      }
      var last = group.entries.length - 1
      var next = index
      if (event.key === 'ArrowRight') {
        next = index === last ? 0 : index + 1
      } else if (event.key === 'ArrowLeft') {
        next = index === 0 ? last : index - 1
      } else if (event.key === 'Home') {
        next = 0
      } else if (event.key === 'End') {
        next = last
      } else {
        return
      }
      event.preventDefault()
      navigate(group.entries[next].route, {
        push: true,
        focus: 'tab',
        scroll: false,
      })
    })
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
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * Flags a shape that is known to backtrack exponentially — a quantified
   * group whose body is itself quantified, such as `(a+)+` or `(\w*\s?)*`.
   * This is a warning, not a block: the reader may still know what they want.
   */
  function looksCatastrophic(pattern) {
    return /\([^()]*[+*][^()]*\)\s*[+*]/.test(pattern)
  }

  function setRegexBusy(surface, busy) {
    var target =
      surface === 'search'
        ? searchResults
        : document.getElementById('rb-matches')
    if (target === null) {
      return
    }
    if (busy) {
      target.setAttribute('aria-busy', 'true')
    } else {
      target.removeAttribute('aria-busy')
    }
  }

  /**
   * At most one regex job per surface may be live. Search and builder preview
   * get independent workers so updating one cannot cancel the other. The runner
   * itself lives in `docs-regex-job.js` and is shared with the documentation
   * search page, so both published surfaces enforce one identical deadline and
   * worker-termination contract instead of two that can drift apart.
   */
  var regexRunner =
    window.DesktopMaterialRegexJob === undefined
      ? null
      : window.DesktopMaterialRegexJob.create({
          workerPath: RegexWorkerPath,
          budgetMilliseconds: EvaluationBudgetMilliseconds,
          onBusy: setRegexBusy,
        })

  function cancelRegexJob(surface) {
    if (regexRunner !== null) {
      regexRunner.cancel(surface)
    }
  }

  /** Fails closed: a missing runner never falls back to the UI thread. */
  function runRegexJob(surface, payload, onSuccess, onFailure) {
    if (regexRunner === null) {
      onFailure('unavailable', '')
      return
    }
    regexRunner.run(surface, payload, onSuccess, onFailure)
  }

  function regexFailureText(code, detail) {
    if (code === 'invalid') {
      return t('errInvalid') + (detail === '' ? '' : ' ' + detail)
    }
    if (code === 'too-long-pattern') {
      return t('errPatternLong')
    }
    if (code === 'too-long-sample') {
      return t('errSampleLong')
    }
    if (code === 'timeout') {
      return t('errSlow')
    }
    return t('errWorker')
  }

  function renderWorkerPreview(preview, emptyValue) {
    if (
      preview === null ||
      typeof preview !== 'object' ||
      typeof preview.value !== 'string'
    ) {
      return '—'
    }
    var text = preview.value === '' ? emptyValue : preview.value
    return text + (preview.truncated === true ? '…' : '')
  }

  // ----------------------------------------------------------------- search

  var searchState = {
    query: '',
    mode: 'plain',
    flags: { g: true, i: true, m: false, s: false, u: false, y: false },
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

  function plainRanges(value, query) {
    var ranges = []
    var loweredValue = value.toLowerCase()
    var loweredQuery = query.toLowerCase()
    var from = 0
    while (ranges.length < MaximumHighlightRanges) {
      var found = loweredValue.indexOf(loweredQuery, from)
      if (found === -1) {
        break
      }
      ranges.push([found, found + query.length])
      from = found + Math.max(1, query.length)
    }
    return ranges
  }

  /** Renders only worker-produced ranges; no user pattern runs here. */
  function highlight(value, ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) {
      return escapeHtml(value)
    }
    var out = ''
    var index = 0
    for (var i = 0; i < ranges.length; i++) {
      var range = ranges[i]
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        !Number.isInteger(range[0]) ||
        !Number.isInteger(range[1]) ||
        range[0] < index ||
        range[1] <= range[0] ||
        range[1] > value.length
      ) {
        continue
      }
      out += escapeHtml(value.slice(index, range[0]))
      out += '<mark>' + escapeHtml(value.slice(range[0], range[1])) + '</mark>'
      index = range[1]
    }
    out += escapeHtml(value.slice(index))
    return out
  }

  function renderSearchResults(total, hits) {
    if (total === 0) {
      searchResults.innerHTML = ''
      searchStatus.textContent = t('searchNone')
      return
    }

    searchStatus.textContent =
      total + ' ' + (total === 1 ? t('searchResult') : t('searchResults')) + '.'

    var html = ''
    for (var j = 0; j < hits.length; j++) {
      var hit = hits[j]
      html +=
        '<li><a class="result" href="' +
        escapeHtml(hit.entry.h) +
        '">' +
        '<span class="result__title">' +
        highlight(hit.entry.t, hit.titleRanges) +
        '</span> ' +
        '<span class="result__path">' +
        highlight(hit.entry.s, hit.pathRanges) +
        '</span>' +
        (hit.entry.d === ''
          ? ''
          : '<p class="result__desc">' +
            highlight(hit.entry.d, hit.descriptionRanges) +
            '</p>') +
        '</a></li>'
    }
    if (total > hits.length) {
      html +=
        '<li class="md-body">' +
        escapeHtml('+' + (total - hits.length) + ' / ' + total + ' …') +
        '</li>'
    }
    searchResults.innerHTML = html
  }

  function renderSearch() {
    if (searchStatus === null) {
      return
    }

    cancelRegexJob('search')
    var query = searchState.query.trim()
    searchStatus.removeAttribute('data-tone')
    searchInput.setAttribute('aria-invalid', 'false')

    if (query === '') {
      searchResults.innerHTML = ''
      searchStatus.textContent =
        t('searchIdle') + ' ' + CATALOG.length + ' ' + t('searchAll') + '.'
      return
    }

    if (searchState.mode === 'regex') {
      if (query.length > MaximumPatternLength) {
        searchResults.innerHTML = ''
        searchInput.setAttribute('aria-invalid', 'true')
        searchStatus.setAttribute('data-tone', 'error')
        searchStatus.textContent = t('errPatternLong')
        return
      }

      searchResults.innerHTML = ''
      searchStatus.textContent = t('searchChecking')
      runRegexJob(
        'search',
        {
          operation: 'search',
          pattern: query,
          flags: activeFlagString(false),
          catalog: RegexCatalog,
          maximumResults: MaximumRenderedResults,
          maximumRanges: MaximumHighlightRanges,
        },
        function (data) {
          var hits = []
          var rawHits = Array.isArray(data.hits) ? data.hits : []
          for (var i = 0; i < rawHits.length; i++) {
            var raw = rawHits[i]
            if (
              raw === null ||
              !Number.isInteger(raw.catalogIndex) ||
              CATALOG[raw.catalogIndex] === undefined
            ) {
              continue
            }
            hits.push({
              entry: CATALOG[raw.catalogIndex],
              titleRanges: raw.titleRanges,
              pathRanges: raw.pathRanges,
              descriptionRanges: raw.descriptionRanges,
            })
          }
          searchInput.setAttribute('aria-invalid', 'false')
          renderSearchResults(
            Number.isInteger(data.total) ? data.total : hits.length,
            hits
          )
        },
        function (code, detail) {
          searchResults.innerHTML = ''
          searchStatus.setAttribute('data-tone', 'error')
          searchStatus.textContent = regexFailureText(code, detail)
          searchInput.setAttribute(
            'aria-invalid',
            code === 'invalid' || code === 'too-long-pattern' ? 'true' : 'false'
          )
          if (code === 'timeout') {
            toast(t('errSlowTitle') + ' — ' + t('errSlow'), 'error')
          }
        }
      )
      return
    }

    // Plain text stays synchronous and uses bounded substring scans only.
    var lowered = query.toLowerCase()
    var hits = []
    var total = 0
    for (var i = 0; i < CATALOG.length; i++) {
      var entry = CATALOG[i]
      if (haystackOf(entry).toLowerCase().indexOf(lowered) === -1) {
        continue
      }
      total++
      if (hits.length < MaximumRenderedResults) {
        hits.push({
          entry: entry,
          titleRanges: plainRanges(entry.t, query),
          pathRanges: plainRanges(entry.s, query),
          descriptionRanges: plainRanges(entry.d, query),
        })
      }
    }
    renderSearchResults(total, hits)
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

    cancelRegexJob('builder')

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

    if (pattern.length > MaximumPatternLength) {
      parts.pattern.setAttribute('aria-invalid', 'true')
      parts.feedback.setAttribute('data-tone', 'error')
      parts.feedback.textContent = t('errPatternLong')
      parts.matches.innerHTML = ''
      return
    }

    var sample = parts.sample.value
    if (sample.length > MaximumSampleLength) {
      parts.pattern.setAttribute('aria-invalid', 'false')
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

    parts.pattern.setAttribute('aria-invalid', 'false')
    parts.feedback.setAttribute('data-tone', 'info')
    parts.feedback.textContent = t('bChecking')
    parts.matches.innerHTML = ''

    runRegexJob(
      'builder',
      {
        operation: 'builder',
        pattern: pattern,
        flags: flags,
        sample: sample,
        maximumMatches: MaximumRenderedMatches,
      },
      function (data) {
        var results = Array.isArray(data.matches) ? data.matches : []
        var risky = looksCatastrophic(pattern)
        if (results.length === 0) {
          parts.feedback.setAttribute('data-tone', risky ? 'warn' : 'info')
          parts.feedback.textContent = risky ? t('errNested') : t('bNoMatches')
          parts.matches.innerHTML = ''
          return
        }

        parts.feedback.setAttribute('data-tone', risky ? 'warn' : 'info')
        parts.feedback.textContent = risky ? t('errNested') : t('bValid')

        var html = ''
        for (var i = 0; i < results.length; i++) {
          var found = results[i]
          if (found === null || typeof found !== 'object') {
            continue
          }
          var value = renderWorkerPreview(found.value, '∅')
          html +=
            '<li><strong>' +
            escapeHtml(value) +
            '</strong> <span class="group">' +
            escapeHtml(
              t('bMatchAt') +
                ' ' +
                (Number.isInteger(found.index) ? found.index : 0)
            ) +
            '</span>'
          var captures = Array.isArray(found.captures) ? found.captures : []
          for (var g = 0; g < captures.length; g++) {
            html +=
              '<span class="group">' +
              escapeHtml(
                t('bGroup') +
                  ' ' +
                  (g + 1) +
                  ': ' +
                  renderWorkerPreview(captures[g], '∅')
              ) +
              '</span>'
          }
          if (
            found.namedGroups !== undefined &&
            found.namedGroups !== null &&
            typeof found.namedGroups === 'object'
          ) {
            for (var name in found.namedGroups) {
              if (
                Object.prototype.hasOwnProperty.call(found.namedGroups, name)
              ) {
                html +=
                  '<span class="group">' +
                  escapeHtml(
                    t('bGroup') +
                      ' <' +
                      name +
                      '>: ' +
                      renderWorkerPreview(found.namedGroups[name], '∅')
                  ) +
                  '</span>'
              }
            }
          }
          if (
            Number.isInteger(found.capturesOmitted) &&
            found.capturesOmitted > 0
          ) {
            html +=
              '<span class="group">' +
              escapeHtml(
                '+' + found.capturesOmitted + ' ' + t('bGroupsOmitted')
              ) +
              '</span>'
          }
          html += '</li>'
        }
        parts.matches.innerHTML = html
      },
      function (code, detail) {
        parts.matches.innerHTML = ''
        parts.pattern.setAttribute(
          'aria-invalid',
          code === 'invalid' || code === 'too-long-pattern' ? 'true' : 'false'
        )
        parts.feedback.setAttribute(
          'data-tone',
          code === 'timeout' ? 'warn' : 'error'
        )
        parts.feedback.textContent = regexFailureText(code, detail)
        if (code === 'timeout') {
          builderPaused = true
          toast(t('errSlowTitle') + ' — ' + t('errSlow'), 'error')
        }
      }
    )
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

    var densityInputs = document.querySelectorAll('input[name="density"]')
    for (var d = 0; d < densityInputs.length; d++) {
      densityInputs[d].checked = densityInputs[d].value === prefs.density
      densityInputs[d].addEventListener('change', function (event) {
        prefs.density = event.target.value
        write(STORE.density, prefs.density)
        applyAppearance()
      })
    }

    var accentInputs = document.querySelectorAll('input[name="accent"]')
    for (var a = 0; a < accentInputs.length; a++) {
      accentInputs[a].checked = accentInputs[a].value === prefs.accent
      accentInputs[a].addEventListener('change', function (event) {
        prefs.accent = event.target.value
        write(STORE.accent, prefs.accent)
        applyAppearance()
      })
    }

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
    applyAppearance()
    wire()
    wireTabs()
    applyLanguage()
    setMode('plain')
  }

  // Exposed for the tabbed-navigation tests, which drive the real controller
  // rather than a reimplementation of it. Nothing on the page reads this.
  window.DesktopMaterialDocsHub = {
    navigate: navigate,
    normalizeRoute: normalizeRoute,
    currentRoute: currentRoute,
    searchState: searchState,
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
