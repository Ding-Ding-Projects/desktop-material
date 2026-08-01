/**
 * Desktop Material documentation hub — dim sum surprise.
 *
 * One page load in a hundred shows a single dim sum dish, its bilingual name
 * and a picture. It is a small delight, not a feature the reader has to manage.
 *
 * The file is split deliberately:
 *
 *   pure logic — `shouldShow`, `pick`, `displayName`, `altText`, `copy` and the
 *                dish table touch nothing outside this module, so probability
 *                and selection are unit-testable in Node without a DOM.
 *   presentation — `init`, `show` and `dismiss` own the DOM, the auto-dismiss
 *                timer and the storage reads.
 *
 * Guarantees the appearance rules require:
 *
 *   - Exactly one fresh random draw per page load, and never a second attempt
 *     after that draw, so the surprise can never be more frequent than stated.
 *   - Non-blocking: the surface is scheduled after the page is interactive,
 *     announces politely through `role="status"`, and never moves focus.
 *   - Suppressed on an error path, on a first run, when the reader turned it
 *     off, and while a quiet preference is set.
 *   - Bundled local SVG assets only. No network request, no third-party asset,
 *     no tracking, and no sound of any kind — this module never plays audio,
 *     which is why the quiet preference suppresses the whole surface rather
 *     than muting part of it.
 *
 * Localization lives in the string table below, never inline in logic. The
 * playfulness level styles the surrounding copy only: a dish's name is a fact
 * and is rendered identically at every level, in both languages, in every
 * language mode.
 */
;(function (global) {
  'use strict'

  /** One in a hundred loads. `shouldShow` compares strictly below this. */
  var Probability = 0.1

  var StorageKey = 'dm-docs-dimsum'
  /** Read-only reuse of the hub's own preference keys. */
  var LanguageKey = 'dm-docs-lang'
  var FunEnglishKey = 'dm-docs-fun-en'
  var FunCantoneseKey = 'dm-docs-fun-yue'
  var QuietKey = 'dm-docs-quiet'

  var AssetDirectory = 'assets/site/dim-sum/'
  var NameSeparator = ' · '

  /** Long enough to read a two-line card, short enough to stay a garnish. */
  var VisibleMilliseconds = 9000
  /** Matches the CSS leave transition in `docs-dim-sum.css`. */
  var LeaveMilliseconds = 220
  /** The page becomes usable first; the surprise arrives afterwards. */
  var MountDelayMilliseconds = 900

  // ------------------------------------------------------------------ dishes

  /**
   * `en` and `yue` are the dish's real names and are never restyled. `rom` is
   * its Jyutping romanization, offered so a reader who cannot read the
   * characters can still say the name out loud.
   */
  var DISHES = [
    {
      id: 'har-gow',
      en: 'Shrimp dumpling',
      yue: '蝦餃',
      rom: 'haa1 gaau2',
      file: 'har-gow.svg',
    },
    {
      id: 'siu-mai',
      en: 'Pork and shrimp dumpling',
      yue: '燒賣',
      rom: 'siu1 maai6',
      file: 'siu-mai.svg',
    },
    {
      id: 'char-siu-bao',
      en: 'Barbecue pork bun',
      yue: '叉燒包',
      rom: 'caa1 siu1 baau1',
      file: 'char-siu-bao.svg',
    },
    {
      id: 'cheung-fan',
      en: 'Rice noodle roll',
      yue: '腸粉',
      rom: 'coeng2 fan2',
      file: 'cheung-fan.svg',
    },
    {
      id: 'dan-tat',
      en: 'Egg tart',
      yue: '蛋撻',
      rom: 'daan6 taat1',
      file: 'dan-tat.svg',
    },
    {
      id: 'lo-mai-gai',
      en: 'Sticky rice in lotus leaf',
      yue: '糯米雞',
      rom: 'no6 mai5 gai1',
      file: 'lo-mai-gai.svg',
    },
    {
      id: 'spring-roll',
      en: 'Spring roll',
      yue: '春卷',
      rom: 'ceon1 gyun2',
      file: 'spring-roll.svg',
    },
    {
      id: 'ma-lai-go',
      en: 'Steamed sponge cake',
      yue: '馬拉糕',
      rom: 'maa5 laai1 gou1',
      file: 'ma-lai-go.svg',
    },
  ]

  // ------------------------------------------------------------- localization

  /**
   * `fixed` holds accessibility names and the dismiss label, which never change
   * with the playfulness level. `tone` holds the surrounding copy as five-entry
   * arrays indexed by level (1 = fully serious … 5 = maximum playfulness).
   *
   * Every `lead` level states the same two facts: roughly one page load in
   * ten, and the card closes itself. There is deliberately no off switch —
   * the surprise is non-blocking, never steals focus and never interrupts a
   * task, which is what makes it polite without needing one. Only the voice
   * moves between levels.
   */
  var STRINGS = {
    en: {
      htmlLang: 'en',
      fixed: {
        region: 'Dim sum surprise',
        dismiss: 'Dismiss the dim sum surprise',
        artAlt: 'Illustration of ',
        romPrefix: 'Jyutping: ',
      },
      tone: {
        title: [
          'Dim sum surprise',
          'A dim sum surprise',
          'Dim sum break',
          'One from the trolley',
          'Trolley incoming',
        ],
        lead: [
          'This appears on roughly 1 page load in 10. It closes itself.',
          'A small treat: roughly 1 page load in 10 shows one. It closes itself.',
          'Roughly 1 page load in 10 gets a dish. It clears itself away.',
          'Roughly 1 page load in 10 serves one. It clears the table itself.',
          'Roughly 1 page load in 10 gets a trolley stop. It rolls away on its own.',
        ],
      },
    },
    yue: {
      htmlLang: 'zh-HK',
      fixed: {
        region: '點心驚喜',
        dismiss: '關閉點心驚喜',
        artAlt: '點心插圖：',
        romPrefix: '粵拼：',
      },
      tone: {
        title: [
          '點心驚喜',
          '一份點心驚喜',
          '飲茶時間到',
          '點心車經過',
          '點心車殺到！',
        ],
        lead: [
          '大約每 10 次載入出現一次，會自動消失。',
          '一份小驚喜：大約每 10 次載入出現一次，會自己收工。',
          '大約每 10 次載入抽到一次，會自己閃人。',
          '好彩喎！大約每 10 次載入有一次，佢會自己走。',
          '恭喜中獎：大約每 10 次載入得一次，架點心車自己會推走，唔使你趕。',
        ],
      },
    },
  }

  // ----------------------------------------------------------------- storage

  /**
   * Storage is resolved on every call rather than captured once: the module
   * loads before the hub and must survive a host with no Web Storage at all.
   */
  function storage() {
    try {
      var store = global.localStorage
      if (store && typeof store.getItem === 'function') {
        return store
      }
    } catch (error) {
      /* Private-mode and policy-blocked storage must never break the page. */
    }
    return null
  }

  function read(key, fallback) {
    var store = storage()
    if (store === null) {
      return fallback
    }
    try {
      var value = store.getItem(key)
      return value === null || value === undefined ? fallback : value
    } catch (error) {
      return fallback
    }
  }

  function write(key, value) {
    var store = storage()
    if (store === null) {
      return
    }
    try {
      store.setItem(key, value)
    } catch (error) {
      /* A full or blocked quota loses the preference, never the page. */
    }
  }

  /**
   * The surprise cannot be switched off.
   *
   * It used to honour a persisted `off` preference. That is gone: a profile
   * that stored one simply rejoins the draw, so an old opt-out is migrated
   * forward rather than silently respected forever. What keeps this polite is
   * not an escape hatch but the behaviour itself — it never gates the page,
   * never steals focus, never fires during a first run, an error state or
   * quiet hours, and clears itself away.
   */
  function isEnabled() {
    return true
  }

  /**
   * Retained so any caller still wired to the old control does not throw. It
   * reports the truth — the surprise stays on — instead of pretending to have
   * stored a refusal.
   */
  function setEnabled() {
    return true
  }

  /**
   * A reader who asked for quiet gets no surprise at all. The card is silent
   * either way, so this is deliberately conservative rather than clever.
   */
  function isQuiet() {
    var value = read(QuietKey, 'off')
    return value === 'on' || value === '1' || value === 'true'
  }

  // -------------------------------------------------------------- pure logic

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value
  }

  function clampLevel(value) {
    var level = parseInt(value, 10)
    if (isNaN(level)) {
      return 3
    }
    return Math.min(5, Math.max(1, level))
  }

  /**
   * The whole probability decision, in one testable place. `randomValue` is a
   * draw in 0..1 — `Math.random()` in the browser, an injected value in tests.
   * `enabled` defaults to the persisted setting; pass it explicitly to reason
   * about the decision without touching storage.
   *
   * A value at or above the threshold is a miss, so the frequency is exactly
   * the stated 1% for a uniform draw and never more.
   */
  function shouldShow(randomValue, enabled) {
    var allowed = enabled === undefined ? isEnabled() : enabled === true
    if (!allowed) {
      return false
    }
    if (typeof randomValue !== 'number' || !isFinite(randomValue)) {
      return false
    }
    return randomValue >= 0 && randomValue < Probability
  }

  /** Maps any draw in 0..1 onto exactly one dish; 1 lands on the last dish. */
  function pick(randomValue) {
    var value =
      typeof randomValue === 'number' && isFinite(randomValue) ? randomValue : 0
    var index = Math.floor(clamp01(value) * DISHES.length)
    if (index >= DISHES.length) {
      index = DISHES.length - 1
    }
    if (index < 0) {
      index = 0
    }
    return DISHES[index]
  }

  function dishById(id) {
    for (var i = 0; i < DISHES.length; i++) {
      if (DISHES[i].id === id) {
        return DISHES[i]
      }
    }
    return null
  }

  function fixedString(languageId, key) {
    var pack = STRINGS[languageId] || STRINGS.en
    var value = pack.fixed[key]
    return typeof value === 'string' ? value : STRINGS.en.fixed[key]
  }

  function toneString(languageId, key, level) {
    var pack = STRINGS[languageId] || STRINGS.en
    var series = pack.tone[key] || STRINGS.en.tone[key]
    return series[clampLevel(level) - 1]
  }

  /**
   * Both names always appear, because the dish's identity is a fact and no
   * language mode may show half of it. Only the order follows the reader's
   * primary language.
   */
  function displayName(dish, languageId) {
    if (languageId === 'yue') {
      return dish.yue + NameSeparator + dish.en
    }
    return dish.en + NameSeparator + dish.yue
  }

  /**
   * The same name split so each half can declare its own language. A dish's
   * name is always mixed-script, and an unmarked half is read in the wrong
   * voice — an English synthesiser spells 蝦餃 out as two unknown glyphs, a
   * Cantonese one mangles "Shrimp dumpling". WCAG 3.1.2 wants the part marked,
   * so the renderer wraps each half in a `lang`-bearing span. The separator
   * carries no language of its own.
   *
   * `displayName` remains the concatenation of these parts, so the visible
   * string and the marked-up one can never drift.
   */
  function nameParts(dish, languageId) {
    var english = { text: dish.en, lang: STRINGS.en.htmlLang }
    var cantonese = { text: dish.yue, lang: STRINGS.yue.htmlLang }
    var separator = { text: NameSeparator, lang: null }
    if (languageId === 'yue') {
      return [cantonese, separator, english]
    }
    return [english, separator, cantonese]
  }

  /** Alt text names the dish in both languages, so it delights equally. */
  function altText(dish, languageId) {
    return fixedString(languageId, 'artAlt') + displayName(dish, languageId)
  }

  function copy(languageId, level) {
    return {
      title: toneString(languageId, 'title', level),
      lead: toneString(languageId, 'lead', level),
    }
  }

  function assetPath(dish, base) {
    return (
      (base === undefined || base === null ? AssetDirectory : base) + dish.file
    )
  }

  /** The hub's own mapping: bilingual mode leads in English. */
  function primaryLanguage(languageMode) {
    return languageMode === 'yue' ? 'yue' : 'en'
  }

  function secondaryLanguage(languageMode) {
    if (languageMode === 'bi') {
      return 'yue'
    }
    return null
  }

  function readPreferences() {
    var mode = read(LanguageKey, 'en')
    if (mode !== 'en' && mode !== 'yue' && mode !== 'bi') {
      mode = 'en'
    }
    return {
      lang: mode,
      funEn: clampLevel(read(FunEnglishKey, '3')),
      funYue: clampLevel(read(FunCantoneseKey, '3')),
    }
  }

  function levelFor(preferences, languageId) {
    return languageId === 'yue' ? preferences.funYue : preferences.funEn
  }

  /** The BCP-47 tag a `lang` attribute needs for one of our language ids. */
  function htmlLangOf(languageId) {
    var pack = STRINGS[languageId] || STRINGS.en
    return pack.htmlLang
  }

  /**
   * Everything a renderer needs for one dish, resolved from the reader's
   * preferences. Kept pure so the composition is testable without a DOM.
   */
  function compose(dish, preferences) {
    var prefs = preferences || readPreferences()
    var primary = primaryLanguage(prefs.lang)
    var secondary = secondaryLanguage(prefs.lang)
    var composed = {
      dish: dish,
      primaryLanguage: primary,
      secondaryLanguage: secondary,
      region: fixedString(primary, 'region'),
      dismiss: fixedString(primary, 'dismiss'),
      name: displayName(dish, primary),
      nameParts: nameParts(dish, primary),
      alt: altText(dish, primary),
      rom: fixedString(primary, 'romPrefix') + dish.rom,
      primary: copy(primary, levelFor(prefs, primary)),
      primaryHtmlLang: htmlLangOf(primary),
      secondaryHtmlLang: secondary === null ? null : htmlLangOf(secondary),
      secondary: null,
    }
    if (secondary !== null) {
      composed.secondary = copy(secondary, levelFor(prefs, secondary))
    }
    return composed
  }

  // ------------------------------------------------------------ presentation

  /** One draw per page load, whatever happens next. */
  var drawn = false
  var live = null
  var visibleTimer = null
  var leaveTimer = null
  /** Where focus was before the reader tabbed into the card, if they did. */
  var returnFocusTo = null

  /**
   * An explicitly supplied `document` always wins, including an explicit
   * `null`: a host without one must be able to say so rather than have this
   * module reach for a global it was not given.
   */
  function documentOf(options) {
    if (options && options.document !== undefined) {
      return options.document
    }
    return typeof document === 'undefined' ? null : document
  }

  function prefersReducedMotion(view) {
    var target = view || (typeof window === 'undefined' ? null : window)
    if (target === null || typeof target.matchMedia !== 'function') {
      return false
    }
    try {
      return target.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (error) {
      return false
    }
  }

  /**
   * Why the surprise is not being shown, or `null` when nothing stands in the
   * way. Returned rather than logged so a caller can report the reason.
   */
  function suppressionReason(options) {
    var config = options || {}
    if (drawn) {
      return 'already-drawn'
    }
    var doc = documentOf(config)
    if (doc === null) {
      return 'no-document'
    }
    if (config.errorState === true) {
      return 'error'
    }
    // The self-scheduling path has no caller to ask, so a page that failed
    // marks itself and the surprise stays away without being told twice.
    if (
      doc.documentElement &&
      typeof doc.documentElement.getAttribute === 'function' &&
      doc.documentElement.getAttribute('data-docs-error') === 'true'
    ) {
      return 'error'
    }
    if (config.firstRun === true) {
      return 'first-run'
    }
    /* No 'disabled' branch: the surprise has no off switch. */
    if (isQuiet()) {
      return 'quiet'
    }
    // Nobody is looking at a background tab. This load's single draw is
    // deliberately *not* spent here — `schedule` asks again once the tab is
    // actually looked at, so a page opened in the background keeps its 1%
    // instead of silently forfeiting it.
    if (doc.visibilityState === 'hidden') {
      return 'hidden'
    }
    return null
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text)
    }
    return node
  }

  function clearTimers() {
    if (visibleTimer !== null) {
      global.clearTimeout(visibleTimer)
      visibleTimer = null
    }
    if (leaveTimer !== null) {
      global.clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  /**
   * Removing the node the reader is focused on drops focus onto `<body>`, which
   * for a keyboard reader means re-tabbing the whole document from the top just
   * because a garnish they were reading disappeared. So the element focus came
   * *from* is remembered when focus enters the card, and handed back when the
   * card leaves under that focus. Nothing is restored when the reader never
   * tabbed in — this module still never moves focus on its own.
   */
  function returnFocus() {
    var target = returnFocusTo
    returnFocusTo = null
    if (target === null || typeof target.focus !== 'function') {
      return
    }
    var owner = target.ownerDocument
    if (
      !owner ||
      typeof owner.contains !== 'function' ||
      !owner.contains(target)
    ) {
      return
    }
    try {
      target.focus()
    } catch (error) {
      /* A detached or unfocusable target simply keeps focus where it is. */
    }
  }

  function remove() {
    var hadFocus = false
    if (live !== null) {
      var owner = live.ownerDocument
      hadFocus =
        !!owner &&
        !!owner.activeElement &&
        typeof live.contains === 'function' &&
        live.contains(owner.activeElement)
    }
    if (live !== null && live.parentNode) {
      live.parentNode.removeChild(live)
    }
    live = null
    if (hadFocus) {
      returnFocus()
    } else {
      returnFocusTo = null
    }
  }

  function dismiss() {
    if (live === null) {
      return
    }
    clearTimers()
    var node = live
    // A reader who asked for less motion gets no fade at all, rather than a
    // shortened one they still have to watch.
    if (prefersReducedMotion(node.ownerDocument.defaultView)) {
      remove()
      return
    }
    node.setAttribute('data-leaving', 'true')
    leaveTimer = global.setTimeout(function () {
      leaveTimer = null
      if (live === node) {
        remove()
      }
    }, LeaveMilliseconds)
  }

  /**
   * Builds and mounts the card. Separated from `init` so a settings surface can
   * preview one dish deliberately; it still never steals focus.
   */
  function show(dish, options) {
    var config = options || {}
    var doc = documentOf(config)
    if (doc === null || doc.body === null) {
      return null
    }
    var composed = compose(dish, config.prefs)

    var root = element(doc, 'div', 'dm-dimsum')
    // `role="status"` announces politely and, unlike a dialog, cannot take
    // focus from whatever the reader was already doing.
    root.setAttribute('role', 'status')
    root.setAttribute('aria-live', 'polite')
    root.setAttribute('aria-label', composed.region)
    // The card declares its own language rather than trusting whatever the host
    // page happens to say: the accessible name and the copy on it are in the
    // reader's primary language even if the surrounding document is not.
    root.setAttribute('lang', composed.primaryHtmlLang)

    var art = doc.createElement('img')
    art.className = 'dm-dimsum__art'
    art.setAttribute('src', assetPath(dish, config.assetBase))
    art.setAttribute('alt', composed.alt)
    art.setAttribute('width', '64')
    art.setAttribute('height', '64')
    art.setAttribute('decoding', 'async')

    var text = element(doc, 'div', 'dm-dimsum__text')
    text.appendChild(
      element(doc, 'p', 'dm-dimsum__title', composed.primary.title)
    )
    // The name carries no tone treatment at any level: it is the fact here.
    // Each half declares its own language so a screen reader pronounces both
    // with the right voice; the rendered string is still exactly `composed.name`.
    var name = element(doc, 'p', 'dm-dimsum__dish')
    for (var part = 0; part < composed.nameParts.length; part++) {
      var half = element(doc, 'span', null, composed.nameParts[part].text)
      if (composed.nameParts[part].lang !== null) {
        half.setAttribute('lang', composed.nameParts[part].lang)
      }
      name.appendChild(half)
    }
    text.appendChild(name)
    text.appendChild(element(doc, 'p', 'dm-dimsum__rom', composed.rom))
    text.appendChild(
      element(doc, 'p', 'dm-dimsum__lead', composed.primary.lead)
    )
    if (composed.secondary !== null) {
      var second = element(doc, 'p', 'dm-dimsum__lead dm-dimsum__lead--second')
      second.setAttribute('lang', composed.secondaryHtmlLang)
      second.textContent = composed.secondary.lead
      text.appendChild(second)
    }

    var close = element(doc, 'button', 'dm-dimsum__close', '✕')
    close.setAttribute('type', 'button')
    close.setAttribute('aria-label', composed.dismiss)
    close.setAttribute('title', composed.dismiss)
    close.addEventListener('click', function () {
      dismiss()
    })

    root.appendChild(art)
    root.appendChild(text)
    root.appendChild(close)

    clearTimers()
    remove()
    returnFocusTo = null
    doc.body.appendChild(root)
    live = root

    // A reader who tabs into the card is reading it; do not yank it away
    // mid-sentence, and start the clock again when focus leaves.
    root.addEventListener('focusin', function (event) {
      clearTimers()
      // `relatedTarget` on focusin is the element losing focus — the place a
      // keyboard reader should land again when the card goes away.
      if (
        returnFocusTo === null &&
        event &&
        event.relatedTarget &&
        event.relatedTarget !== root &&
        !root.contains(event.relatedTarget)
      ) {
        returnFocusTo = event.relatedTarget
      }
    })
    root.addEventListener('focusout', function () {
      startDismissTimer()
    })
    root.addEventListener('mouseenter', function () {
      clearTimers()
    })
    root.addEventListener('mouseleave', function () {
      startDismissTimer()
    })

    startDismissTimer()
    return root
  }

  function startDismissTimer() {
    if (live === null) {
      return
    }
    clearTimers()
    visibleTimer = global.setTimeout(function () {
      visibleTimer = null
      dismiss()
    }, VisibleMilliseconds)
  }

  /**
   * Draws once for this page load and shows a dish on a hit. Returns the dish
   * shown, or `null` on a miss or a suppression; a caller that needs to know
   * which asks `suppressionReason` before calling.
   */
  function init(options) {
    var config = options || {}
    if (suppressionReason(config) !== null) {
      return null
    }
    drawn = true
    var random =
      typeof config.random === 'function'
        ? config.random
        : function () {
            return Math.random()
          }
    // Two independent draws: one decides whether to show, one chooses the
    // dish. Reusing a single sub-1% value would only ever pick the first dish.
    if (!shouldShow(random(), true)) {
      return null
    }
    var dish = pick(random())
    show(dish, config)
    return dish
  }

  /**
   * Schedules `init` once the page is interactive, so nothing here can delay
   * the documentation becoming usable. A host that wants to own the timing
   * sets `window.DocsDimSumAutoInit = false` before this script loads and
   * calls `init` itself.
   */
  function schedule() {
    var doc = documentOf(null)
    if (doc === null) {
      return
    }

    /**
     * A page opened in a background tab has nobody to show a card to, and no
     * second draw is coming. Rather than forfeit this load's 1%, wait for the
     * tab to be looked at once and ask again then.
     */
    function mount() {
      if (suppressionReason(null) !== 'hidden') {
        init({})
        return
      }
      doc.addEventListener('visibilitychange', function whenVisible() {
        if (doc.visibilityState !== 'hidden') {
          doc.removeEventListener('visibilitychange', whenVisible)
          init({})
        }
      })
    }

    function start() {
      global.setTimeout(mount, MountDelayMilliseconds)
    }

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  }

  /** Test seam: forgets this load's draw so a fresh decision can be made. */
  function reset() {
    clearTimers()
    remove()
    drawn = false
  }

  var api = {
    probability: Probability,
    storageKey: StorageKey,
    assetDirectory: AssetDirectory,
    dishes: DISHES,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    isQuiet: isQuiet,
    shouldShow: shouldShow,
    pick: pick,
    dishById: dishById,
    displayName: displayName,
    nameParts: nameParts,
    htmlLangOf: htmlLangOf,
    altText: altText,
    copy: copy,
    compose: compose,
    assetPath: assetPath,
    readPreferences: readPreferences,
    prefersReducedMotion: prefersReducedMotion,
    suppressionReason: suppressionReason,
    show: show,
    dismiss: dismiss,
    init: init,
    reset: reset,
    visibleMilliseconds: VisibleMilliseconds,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsDimSum = api

  // Only a real browser script tag self-schedules. A CommonJS loader means a
  // test or tool is inspecting the module, and drawing there would burn this
  // load's single draw before the caller could set anything up.
  if (
    typeof document !== 'undefined' &&
    typeof module === 'undefined' &&
    global.DocsDimSumAutoInit !== false
  ) {
    schedule()
  }
})(typeof window === 'undefined' ? globalThis : window)
