/**
 * Desktop Material screenshot documentation — page controller.
 *
 * The generated pages under `docs/screenshots/` carry the hub's preference and
 * search markup but cannot load `docs-hub.js`: that module dereferences 21
 * `rb-*` regex-builder ids these pages do not have, and would throw partway
 * through its own start-up. So the controls sat there inert — visible, focusable
 * and doing nothing, which is a worse lie than shipping no controls at all.
 *
 * This file is the missing controller, and nothing more. It wires only what the
 * generated markup actually contains: theme, the preferences disclosure,
 * language mode, both playfulness sliders, density, accent, and the screenshot
 * gallery itself. Search, filtering, the regex builder, the grid and the
 * lightbox all belong to `docs-screenshot-gallery.js`, which builds its own
 * controls inside a container we hand it.
 *
 * It also owns the honesty contract for these pages: `data-js` is set only after
 * initialisation genuinely succeeds, so the no-JavaScript note stays visible
 * whenever the controls really are dead.
 */
;(function (global) {
  'use strict'

  var STORE = {
    theme: 'dm-docs-theme',
    lang: 'dm-docs-lang',
    funEn: 'dm-docs-fun-en',
    funYue: 'dm-docs-fun-yue',
    density: 'dm-docs-density',
    accent: 'dm-docs-accent',
  }

  var Accents = ['teal', 'amber', 'rose']

  function read(key, fallback) {
    try {
      var value = global.localStorage.getItem(key)
      return value === null ? fallback : value
    } catch (error) {
      return fallback
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, value)
    } catch (error) {
      /* Private-mode storage failures must never break the page. */
    }
  }

  function clampLevel(value) {
    var level = parseInt(value, 10)
    if (isNaN(level)) {
      return 3
    }
    return Math.min(5, Math.max(1, level))
  }

  function languageId() {
    var stored = read(STORE.lang, 'en')
    return stored === 'yue' || stored === 'bi' ? stored : 'en'
  }

  function applyRoot(doc) {
    var root = doc.documentElement
    var theme = read(STORE.theme, 'system')
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme)
    } else {
      root.removeAttribute('data-theme')
    }
    root.setAttribute('data-lang', languageId())
    var density = read(STORE.density, 'comfortable')
    if (density === 'compact') {
      root.setAttribute('data-density', 'compact')
    } else {
      root.removeAttribute('data-density')
    }
    var accent = read(STORE.accent, 'violet')
    if (Accents.indexOf(accent) === -1) {
      root.removeAttribute('data-accent')
    } else {
      root.setAttribute('data-accent', accent)
    }
  }

  /** Reflects stored preferences into the controls, so they never disagree. */
  function syncControls(doc) {
    var lang = languageId()
    var langInputs = doc.querySelectorAll('input[name="lang"]')
    for (var i = 0; i < langInputs.length; i++) {
      langInputs[i].checked = langInputs[i].value === lang
    }
    var themeInputs = doc.querySelectorAll('input[name="theme"]')
    var theme = read(STORE.theme, 'system')
    for (var t = 0; t < themeInputs.length; t++) {
      themeInputs[t].checked = themeInputs[t].value === theme
    }
    var densityInputs = doc.querySelectorAll('input[name="density"]')
    var density = read(STORE.density, 'comfortable')
    for (var d = 0; d < densityInputs.length; d++) {
      densityInputs[d].checked = densityInputs[d].value === density
    }
    var accentInputs = doc.querySelectorAll('input[name="accent"]')
    var accent = read(STORE.accent, 'violet')
    for (var a = 0; a < accentInputs.length; a++) {
      accentInputs[a].checked = accentInputs[a].value === accent
    }
    bindSlider(doc, 'fun-en', STORE.funEn)
    bindSlider(doc, 'fun-yue', STORE.funYue)
  }

  function bindSlider(doc, id, key) {
    var input = doc.getElementById(id)
    if (input === null) {
      return
    }
    var level = clampLevel(read(key, '3'))
    input.value = String(level)
    var output = doc.querySelector('output[for="' + id + '"]')
    if (output !== null) {
      output.textContent = String(level)
    }
    input.addEventListener('input', function () {
      var next = clampLevel(input.value)
      write(key, String(next))
      if (output !== null) {
        output.textContent = String(next)
      }
    })
  }

  function wirePreferences(doc) {
    var toggle = doc.getElementById('prefs-toggle')
    var panel = doc.getElementById('prefs')
    if (toggle !== null && panel !== null) {
      toggle.addEventListener('click', function () {
        var open = panel.hasAttribute('hidden')
        if (open) {
          panel.removeAttribute('hidden')
        } else {
          panel.setAttribute('hidden', '')
        }
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      })
    }

    var themeToggle = doc.getElementById('theme-toggle')
    if (themeToggle !== null) {
      themeToggle.addEventListener('click', function () {
        // Resolve what is actually on screen before flipping, so the first
        // press always visibly changes something even from the system default.
        var current = doc.documentElement.getAttribute('data-theme')
        if (current !== 'light' && current !== 'dark') {
          current =
            global.matchMedia &&
            global.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
        }
        var next = current === 'dark' ? 'light' : 'dark'
        write(STORE.theme, next)
        applyRoot(doc)
        themeToggle.setAttribute(
          'aria-pressed',
          next === 'dark' ? 'true' : 'false'
        )
        syncControls(doc)
      })
    }

    function persist(name, key) {
      var inputs = doc.querySelectorAll('input[name="' + name + '"]')
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('change', function (event) {
          write(key, event.target.value)
          applyRoot(doc)
          if (name === 'lang') {
            relabelGallery()
          }
        })
      }
    }

    persist('theme', STORE.theme)
    persist('lang', STORE.lang)
    persist('density', STORE.density)
    persist('accent', STORE.accent)
  }

  var galleryHandle = null

  function stringsFor() {
    var tables = global.DocsScreenshotStrings
    if (tables === undefined || tables === null) {
      return {}
    }
    return tables.packFor(languageId() === 'yue' ? 'yue' : 'en')
  }

  /**
   * The handle's relabel hook is `setStrings`, verified against both `create()`
   * and `createSingle()`. Guessing a name here would have produced a language
   * control that silently did nothing to the gallery's own copy.
   */
  function relabelGallery() {
    if (
      galleryHandle !== null &&
      typeof galleryHandle.setStrings === 'function'
    ) {
      galleryHandle.setStrings(stringsFor())
    }
  }

  /** The page embeds its records as JSON so no fetch is ever required. */
  function readPayload(doc) {
    var node = doc.getElementById('screenshot-data')
    if (node === null) {
      return null
    }
    try {
      return JSON.parse(node.textContent || 'null')
    } catch (error) {
      return null
    }
  }

  function mountGallery(doc) {
    var api = global.DocsScreenshotGallery
    var payload = readPayload(doc)
    var container = doc.getElementById('screenshot-gallery')
    if (
      api === undefined ||
      api === null ||
      payload === null ||
      container === null
    ) {
      return false
    }
    var options = {
      container: container,
      items: payload.items || [],
      strings: stringsFor(),
      imageBase: payload.imageBase || '../assets/screenshots/',
      hrefFor: function (item) {
        return item.output ? item.output + '.html' : null
      },
      regexJob: global.DesktopMaterialRegexJob,
    }
    try {
      if (payload.single) {
        options.item = payload.item || (payload.items || [])[0]
        galleryHandle = api.createSingle(options)
      } else {
        galleryHandle = api.create(options)
      }
    } catch (error) {
      // A mount failure must leave the honest note visible rather than a
      // half-built surface, so report it and let start() bail.
      if (global.console && global.console.error) {
        global.console.error('screenshot gallery failed to mount', error)
      }
      return false
    }
    return true
  }

  function start() {
    var doc = global.document
    if (doc === undefined || doc === null) {
      return
    }
    applyRoot(doc)
    syncControls(doc)
    wirePreferences(doc)
    var mounted = mountGallery(doc)
    // Only now is the claim true. Setting data-js before this point is what let
    // an earlier build hide the "JavaScript is off" note above dead controls.
    if (mounted) {
      doc.documentElement.setAttribute('data-js', 'on')
    }
  }

  var api = {
    start: start,
    languageId: languageId,
    clampLevel: clampLevel,
    stringsFor: stringsFor,
    storageKeys: STORE,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsScreenshotPage = api

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  }
})(typeof window === 'undefined' ? globalThis : window)
