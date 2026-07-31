/**
 * Desktop Material documentation hub — progressive surface loading.
 *
 * The changelog catalog is 542 KB and its viewer another 105 KB, for a tab most
 * readers never open. Loading both before first paint made every visitor pay for
 * a surface they had not asked for, which is exactly the cost this file removes:
 * the shell and the opening tab become usable first, and the changelog arrives
 * when the reader actually asks for it.
 *
 * Rules this deliberately follows:
 *
 * - **No fake delay.** The fetch starts the moment the surface is revealed.
 * - **No swallowed rejection.** A failed load reports itself in the panel and
 *   offers a retry; it never leaves an empty box or a silent console error.
 * - **Local state only.** The status lives inside the panel it describes, is
 *   announced through `role="status"`, and never moves focus — a reader who
 *   opened the tab by keyboard keeps their place.
 * - **No source-data race.** A second reveal while a load is in flight joins the
 *   existing attempt rather than starting a competing one.
 */
;(function (global) {
  'use strict'

  var doc = global.document

  /** Loads a script once, resolving through shared callbacks per URL. */
  var loads = {}

  function loadScript(src, done) {
    var record = loads[src]
    if (record !== undefined) {
      if (record.state === 'loaded') {
        done(null)
        return
      }
      if (record.state === 'failed') {
        done(new Error('previously failed: ' + src))
        return
      }
      record.waiting.push(done)
      return
    }
    record = { state: 'loading', waiting: [done] }
    loads[src] = record

    var node = doc.createElement('script')
    node.src = src
    node.async = false
    node.addEventListener('load', function () {
      record.state = 'loaded'
      var waiting = record.waiting
      record.waiting = []
      for (var i = 0; i < waiting.length; i++) {
        waiting[i](null)
      }
    })
    node.addEventListener('error', function () {
      record.state = 'failed'
      var waiting = record.waiting
      record.waiting = []
      // The node is removed so a retry can attach a fresh one; leaving a failed
      // tag behind makes the second attempt silently reuse the browser's cached
      // failure.
      if (node.parentNode !== null) {
        node.parentNode.removeChild(node)
      }
      delete loads[src]
      for (var i = 0; i < waiting.length; i++) {
        waiting[i](new Error('could not load ' + src))
      }
    })
    doc.head.appendChild(node)
  }

  /** Loads a list in order, because the viewer reads the catalog at mount. */
  function loadAll(sources, done) {
    var index = 0
    function step(error) {
      if (error !== null) {
        done(error)
        return
      }
      if (index >= sources.length) {
        done(null)
        return
      }
      var src = sources[index]
      index += 1
      loadScript(src, step)
    }
    step(null)
  }

  function messages() {
    var packs = global.DesktopMaterialDocsStrings
    var id = 'en'
    try {
      var stored = global.localStorage.getItem('dm-docs-lang')
      id = stored === 'yue' ? 'yue' : 'en'
    } catch (error) {
      id = 'en'
    }
    var pack = packs && packs[id] ? packs[id].fixed : null
    return {
      loading:
        (pack && pack.changelogLoading) ||
        (id === 'yue' ? '載入緊更新記錄…' : 'Loading the changelog…'),
      failed:
        (pack && pack.changelogFailed) ||
        (id === 'yue'
          ? '載入唔到更新記錄。'
          : 'The changelog could not be loaded.'),
      retry:
        (pack && pack.changelogRetry) || (id === 'yue' ? '再試一次' : 'Retry'),
    }
  }

  /**
   * Reveals one deferred surface. `container` owns the status so a failure is
   * reported where the reader is looking, not in a corner toast.
   */
  function deferSurface(options) {
    var container = options.container
    if (container === null || container === undefined) {
      return null
    }
    var started = false

    var status = doc.createElement('p')
    status.className = 'dm-lazy-status'
    status.setAttribute('role', 'status')
    status.hidden = true
    container.appendChild(status)

    function begin() {
      if (started) {
        return
      }
      started = true
      var copy = messages()
      status.hidden = false
      status.textContent = copy.loading
      loadAll(options.sources, function (error) {
        if (error !== null) {
          started = false
          var failCopy = messages()
          status.textContent = ''
          var line = doc.createElement('span')
          line.textContent = failCopy.failed + ' '
          var retry = doc.createElement('button')
          retry.type = 'button'
          retry.className = 'dm-lazy-retry'
          retry.textContent = failCopy.retry
          retry.addEventListener('click', function () {
            status.textContent = ''
            status.appendChild(doc.createTextNode(messages().loading))
            begin()
          })
          status.appendChild(line)
          status.appendChild(retry)
          if (global.console && global.console.error) {
            global.console.error('deferred surface failed', error)
          }
          return
        }
        status.hidden = true
        status.textContent = ''
        options.mount()
      })
    }

    return {
      begin: begin,
      started: function () {
        return started
      },
    }
  }

  /**
   * Watches a panel's `hidden` attribute rather than a tab click, so any route
   * into the surface triggers it — a direct hash, a restored session, or the
   * keyboard.
   */
  function whenRevealed(panel, run) {
    if (panel === null) {
      return
    }
    if (!panel.hasAttribute('hidden')) {
      run()
      return
    }
    if (typeof global.MutationObserver !== 'function') {
      // Without an observer the surface still has to be reachable, so load it
      // rather than leaving the panel permanently empty.
      run()
      return
    }
    var observer = new global.MutationObserver(function () {
      if (!panel.hasAttribute('hidden')) {
        observer.disconnect()
        run()
      }
    })
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] })
  }

  function start() {
    var panel = doc.getElementById('changelog')
    var container = doc.querySelector('[data-dm-changelog]')
    if (panel === null || container === null) {
      return
    }
    var surface = deferSurface({
      container: container,
      sources: [
        'assets/site/docs-changelog-catalog.js',
        'assets/site/docs-changelog.js',
      ],
      mount: function () {
        var api = global.DocsChangelog
        if (api === undefined || api === null) {
          return
        }
        // The viewer's own DOMContentLoaded auto-mount has long since run, so
        // mount explicitly and mark the container so it cannot double-mount.
        if (container.getAttribute('data-dm-changelog-ready') === 'true') {
          return
        }
        container.setAttribute('data-dm-changelog-ready', 'true')
        api.mount(container, {})
      },
    })
    if (surface !== null) {
      whenRevealed(panel, surface.begin)
    }
    global.__docsLazyChangelog = surface
  }

  var api = { loadScript: loadScript, loadAll: loadAll, start: start }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsLazy = api

  if (typeof doc !== 'undefined' && doc !== null) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  }
})(typeof window === 'undefined' ? globalThis : window)
