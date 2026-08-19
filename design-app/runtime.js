'use strict'
;(function exposeDesignReferenceRuntime() {
  const normalize = value =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()

  function visible(element) {
    const style = element.ownerDocument.defaultView.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    )
  }

  function exactLeafText(scope, text) {
    return [...scope.querySelectorAll('*')].filter(element => {
      if (!visible(element) || normalize(element.textContent) !== text)
        return false
      return ![...element.children].some(
        child => visible(child) && normalize(child.textContent) === text
      )
    })
  }

  function exactTextButtons(scope, text) {
    return [...scope.querySelectorAll('button')].filter(button => {
      if (!visible(button)) return false
      const directText = [...button.childNodes].some(
        node =>
          node.nodeType === Node.TEXT_NODE && normalize(node.nodeValue) === text
      )
      return directText || exactLeafText(button, text).length > 0
    })
  }

  function exactlyOne(items, description) {
    const unique = [...new Set(items)]
    if (unique.length !== 1) {
      throw new Error(`${description} resolved to ${unique.length} elements.`)
    }
    return unique[0]
  }

  function screenScope(document, label) {
    return exactlyOne(
      [...document.querySelectorAll('[data-screen-label]')].filter(
        element => element.getAttribute('data-screen-label') === label
      ),
      `${label} scope`
    )
  }

  function nextFrames(window, count = 2) {
    return new Promise(resolve => {
      const step = remaining => {
        if (remaining <= 0) resolve()
        else window.requestAnimationFrame(() => step(remaining - 1))
      }
      step(count)
    })
  }

  async function click(element) {
    element.click()
    await nextFrames(element.ownerDocument.defaultView)
  }

  async function performAction(document, action) {
    const actionTimeoutMs = 5000
    let target
    if (action.kind === 'click-title') {
      const scope = action.scopeLabel
        ? screenScope(document, action.scopeLabel)
        : document
      await waitFor(
        document,
        () =>
          [...scope.querySelectorAll('[title]')].filter(
            element =>
              visible(element) && element.getAttribute('title') === action.name
          ).length === 1,
        action.name,
        actionTimeoutMs
      )
      const visibleTitles = [...scope.querySelectorAll('[title]')]
        .filter(visible)
        .map(element => element.getAttribute('title'))
      target = exactlyOne(
        [...scope.querySelectorAll('[title]')].filter(element =>
          visible(element)
            ? element.getAttribute('title') === action.name
            : false
        ),
        `${action.name} (visible titles: ${visibleTitles.join(', ') || 'none'})`
      )
    } else if (action.kind === 'click-text-button') {
      const scope = action.scopeLabel
        ? screenScope(document, action.scopeLabel)
        : document
      try {
        await waitFor(
          document,
          () => new Set(exactTextButtons(scope, action.name)).size === 1,
          action.name,
          actionTimeoutMs
        )
      } catch (error) {
        const visibleButtons = [...scope.querySelectorAll('button')]
          .filter(visible)
          .map(element => normalize(element.textContent))
          .filter(Boolean)
        throw new Error(
          `${error.message} Visible button text: ${
            visibleButtons.join(' | ') || 'none'
          }.`
        )
      }
      target = exactlyOne(exactTextButtons(scope, action.name), action.name)
    } else if (action.kind === 'click-indexed-css') {
      await waitFor(
        document,
        () =>
          [...document.querySelectorAll(action.selector)].filter(visible)
            .length > action.index,
        action.description,
        actionTimeoutMs
      )
      const matches = [...document.querySelectorAll(action.selector)].filter(
        visible
      )
      if (!matches[action.index]) {
        throw new Error(
          `${action.description} index ${action.index} is unavailable.`
        )
      }
      target = matches[action.index]
    } else if (action.kind === 'click-near-placeholder-title') {
      await waitFor(
        document,
        () =>
          [...document.querySelectorAll('input,textarea')].filter(
            element =>
              visible(element) &&
              element.getAttribute('placeholder') === action.placeholder
          ).length === 1,
        action.placeholder,
        actionTimeoutMs
      )
      const input = exactlyOne(
        [...document.querySelectorAll('input,textarea')].filter(
          element =>
            visible(element) &&
            element.getAttribute('placeholder') === action.placeholder
        ),
        action.placeholder
      )
      const row = input.parentElement
      target = exactlyOne(
        [...row.querySelectorAll('[title]')].filter(
          element =>
            visible(element) && element.getAttribute('title') === action.title
        ),
        `${action.title} beside ${action.placeholder}`
      )
    } else if (action.kind === 'fill-placeholder') {
      await waitFor(
        document,
        () =>
          [...document.querySelectorAll('input,textarea')].filter(
            element =>
              visible(element) &&
              element.getAttribute('placeholder') === action.placeholder
          ).length === 1,
        action.placeholder,
        actionTimeoutMs
      )
      target = exactlyOne(
        [...document.querySelectorAll('input,textarea')].filter(
          element =>
            visible(element) &&
            element.getAttribute('placeholder') === action.placeholder
        ),
        action.placeholder
      )
      const prototype =
        target.tagName === 'TEXTAREA'
          ? document.defaultView.HTMLTextAreaElement.prototype
          : document.defaultView.HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (!setter)
        throw new Error(`No native value setter for ${action.placeholder}.`)
      setter.call(target, action.value)
      target.dispatchEvent(
        new document.defaultView.Event('input', { bubbles: true })
      )
      target.dispatchEvent(
        new document.defaultView.Event('change', { bubbles: true })
      )
      await nextFrames(document.defaultView)
      return { ...action, status: 'performed' }
    } else if (action.kind === 'context-menu-selector') {
      await waitFor(
        document,
        () =>
          [...document.querySelectorAll(action.selector)].filter(visible)
            .length > action.index,
        action.description,
        actionTimeoutMs
      )
      const matches = [...document.querySelectorAll(action.selector)].filter(
        visible
      )
      target = matches[action.index]
      if (!target) {
        throw new Error(
          `${action.description} index ${action.index} is unavailable.`
        )
      }
      target.dispatchEvent(
        new document.defaultView.MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
        })
      )
      await nextFrames(document.defaultView)
      return { ...action, status: 'performed' }
    } else if (action.kind === 'context-menu-text') {
      await waitFor(
        document,
        () => exactLeafText(document, action.text).length === 1,
        action.text,
        actionTimeoutMs
      )
      target = exactlyOne(exactLeafText(document, action.text), action.text)
      target.dispatchEvent(
        new document.defaultView.MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
        })
      )
      await nextFrames(document.defaultView)
      return { ...action, status: 'performed' }
    } else {
      throw new Error(`Unsupported design action: ${action.kind}.`)
    }
    await click(target)
    return { ...action, status: 'performed' }
  }

  async function waitFor(document, predicate, description, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (predicate()) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(`Timed out waiting for ${description}.`)
  }

  async function waitForRuntime(frame) {
    await waitFor(
      frame.contentDocument,
      () => frame.contentDocument.querySelector('#dc-root > .sc-host'),
      'the design runtime'
    )
  }

  async function setAutoFit(document, enabled) {
    if (enabled) return []
    const performed = []
    performed.push(
      await performAction(document, {
        kind: 'click-title',
        name: 'Settings',
        scopeLabel: null,
      })
    )
    performed.push(
      await performAction(document, {
        kind: 'click-text-button',
        name: 'Appearance',
        scopeLabel: 'Settings dialog',
      })
    )
    const dialog = screenScope(document, 'Settings dialog')
    const label = exactlyOne(
      exactLeafText(dialog, 'Auto-fit to window'),
      'Auto-fit label'
    )
    let row = label.parentElement
    while (row && !row.querySelector('button[role="switch"]'))
      row = row.parentElement
    if (!row) throw new Error('Auto-fit switch row is unavailable.')
    const toggle = exactlyOne(
      [...row.querySelectorAll('button[role="switch"]')],
      'Auto-fit switch'
    )
    if (toggle.getAttribute('aria-checked') === 'true') await click(toggle)
    if (toggle.getAttribute('aria-checked') !== 'false') {
      throw new Error('Auto-fit did not turn off.')
    }
    performed.push({
      kind: 'set-switch',
      name: 'Auto-fit to window',
      status: 'performed',
    })
    const closeText = exactlyOne(
      exactLeafText(dialog, 'close'),
      'Settings close symbol'
    )
    await click(
      exactlyOne(
        [closeText.closest('button')].filter(Boolean),
        'Settings close button'
      )
    )
    await waitFor(
      document,
      () => !document.body.contains(dialog),
      'Settings to close'
    )
    return performed
  }

  async function setTheme(document, theme) {
    const isDesktopMaterial = document.querySelector(
      '[data-screen-label="Title bar"]'
    )
    if (isDesktopMaterial) {
      const dark = document.body.classList.contains('theme-dark')
      if ((theme === 'dark') !== dark) {
        await performAction(document, {
          kind: 'click-title',
          name: 'Toggle theme',
          scopeLabel: null,
        })
      }
      return
    }
    if (typeof document.defaultView.__dcSetProps === 'function') {
      const name = document.defaultView.__dcRootName?.()
      if (name) document.defaultView.__dcSetProps(name, { theme })
      await waitFor(
        document,
        () =>
          document
            .querySelector('[data-screen-label="Shell"]')
            ?.getAttribute('data-theme') === theme,
        `${theme} theme`
      )
      return
    }
    throw new Error(
      'The design reference exposes no deterministic theme control.'
    )
  }

  function observedState(frame) {
    const document = frame.contentDocument
    const labels = [...document.querySelectorAll('[data-screen-label]')]
      .filter(visible)
      .map(element => element.getAttribute('data-screen-label'))
    const title = document.querySelector('[data-screen-label="Title bar"]')
    const root = title?.parentElement
    return {
      labels: [...new Set(labels)],
      theme: document.body.classList.contains('theme-dark')
        ? 'dark'
        : document
            .querySelector('[data-screen-label="Shell"]')
            ?.getAttribute('data-theme') ?? 'light',
      viewport: {
        width: frame.contentWindow.innerWidth,
        height: frame.contentWindow.innerHeight,
      },
      uiScale: root
        ? Number.parseFloat(frame.contentWindow.getComputedStyle(root).zoom)
        : null,
      fontStatus: document.fonts.status,
    }
  }

  async function render({
    frame,
    reference,
    route,
    theme,
    autoFit,
    disableMotion,
  }) {
    const stage = value => {
      frame.ownerDocument.defaultView.__designCaptureStage = value
    }
    stage('loading document')
    await new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, { once: true })
      setTimeout(
        () => reject(new Error('Timed out loading the design document.')),
        20_000
      )
      frame.srcdoc = reference.html
    })
    stage('waiting for design runtime')
    await waitForRuntime(frame)
    stage('preparing state')
    const document = frame.contentDocument
    const performedActions = []
    if (reference.identity.canonical) {
      performedActions.push(...(await setAutoFit(document, autoFit)))
    }
    stage('applying theme')
    await setTheme(document, theme)
    stage('performing route actions')
    for (const action of route?.actions ?? []) {
      stage(
        `performing ${
          action.name ?? action.description ?? action.placeholder ?? action.kind
        }`
      )
      performedActions.push(await performAction(document, action))
    }
    if (route?.expectedLabels?.length) {
      await waitFor(
        document,
        () =>
          document.querySelector(
            `[data-screen-label="${route.expectedLabels
              .at(-1)
              .replaceAll('"', '\\"')}"]`
          ),
        route.expectedLabels.at(-1)
      )
    }
    stage('waiting for fonts')
    await document.fonts.ready
    stage('settling state')
    await new Promise(resolve => setTimeout(resolve, route?.settleMs ?? 1100))
    if (disableMotion) {
      const style = document.createElement('style')
      style.dataset.designReferenceMotion = 'settled'
      style.textContent = `
        *,*::before,*::after {
          animation-delay: 0s !important;
          animation-duration: 0s !important;
          animation-iteration-count: 1 !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
        }
      `
      document.head.appendChild(style)
      await nextFrames(frame.contentWindow)
    }
    const observed = observedState(frame)
    if (route?.expectedLabels?.length) {
      const expected = [...route.expectedLabels].sort()
      const actual = [...observed.labels].sort()
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `State ${route.name} exposed the wrong screen-label set.`
        )
      }
    }
    for (const text of route?.expectedVisibleText ?? []) {
      if (!document.body.innerText.includes(text)) {
        throw new Error(
          `State ${route.name} did not expose expected text: ${text}.`
        )
      }
    }
    for (const selector of route?.expectedVisibleSelectors ?? []) {
      const matches = [...document.querySelectorAll(selector)].filter(visible)
      if (matches.length < 1) {
        throw new Error(`State ${route.name} did not expose ${selector}.`)
      }
    }
    if (route?.expectedDrawerWidth != null) {
      const drawer = exactlyOne(
        [...document.querySelectorAll('nav')].filter(visible),
        'History navigation drawer'
      )
      const width = Math.round(drawer.getBoundingClientRect().width)
      if (width !== route.expectedDrawerWidth) {
        throw new Error(
          `State ${route.name} observed drawer width ${width}; expected ${route.expectedDrawerWidth}.`
        )
      }
    }
    if (observed.theme !== theme) {
      throw new Error(`Observed ${observed.theme}; expected ${theme}.`)
    }
    stage('ready')
    return { performedActions, observed }
  }

  window.DesignReferenceRuntime = { render }
})()
