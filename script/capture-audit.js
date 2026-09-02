// Layout and design-system audit for a rendered surface.
//
// This is the measurement half of the capture fixture. `capture-app.js` takes a
// picture; this walks the same rendered tree and reports what is wrong with it,
// so a defect is a named finding in a diffable JSON report rather than something
// a person has to notice in a PNG.
//
// WHY measure rather than read the stylesheet: a stylesheet cannot say which
// rule won. Two blocks in one file declaring the same selector are resolved by
// source order, a class inside `:where()` loses to a global class, and a custom
// property with no reader changes nothing at all. Every one of those reads as a
// correct fix in the diff and changes no pixels. The running app is the only
// place the question is actually answered.
//
// Rules, and what each is for:
//
//   CJ-OVERFLOW-X / CJ-OVERFLOW-Y  content larger than its box, with the
//                                  overflow hidden and no way to scroll to it
//   CJ-TRUNCATED-SILENT            text cut off with no disclosure of the
//                                  full string (the disclosed variant is
//                                  recorded as info, not as a defect)
//   CJ-ESCAPES-SURFACE             an element painted outside the surface that
//                                  is supposed to clip it
//   CJ-OFF-VIEWPORT                an interactive element partly off screen
//   CJ-TARGET-TOO-SMALL            a hit target under the accessible minimum
//   CJ-COLLAPSED                   text present, box collapsed to zero
//   GEN-UNSTYLED                   a design-system class with no rule behind it
//   GEN-NO-NAME                    an interactive element with no accessible name

/**
 * Wait until the surface is actually measurable.
 *
 * Material Symbols and Roboto load late, and every width in the tree changes
 * when they arrive. A run taken before the swap reports truncation that is not
 * real and — much worse — reports clean on text that overflows a moment later.
 */
async function settleForMeasurement(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
  })
}

/** The function evaluated inside the renderer. Returns raw findings. */
function collectFindings(auditRootSelector) {
  const Interactive = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    'summary',
    '[role=button]',
    '[role=menuitem]',
    '[role=menuitemcheckbox]',
    '[role=menuitemradio]',
    '[role=tab]',
    '[role=switch]',
    '[role=checkbox]',
    '[role=radio]',
    '[role=link]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')

  // Every class name some loaded stylesheet declares a rule for. Built once.
  // This is what separates a design-system class that paints from one that
  // resolves to nothing, which is invisible in a screenshot because an
  // unstyled element still occupies space and still renders its text.
  const styledClasses = new Set()
  const classPattern = /\.([A-Za-z0-9_-]+)/g

  const walkRules = list => {
    for (const rule of Array.from(list)) {
      if (typeof rule.selectorText === 'string') {
        for (const match of rule.selectorText.matchAll(classPattern)) {
          styledClasses.add(match[1])
        }
      }
      if (rule.cssRules) {
        walkRules(rule.cssRules)
      }
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.cssRules) {
        walkRules(sheet.cssRules)
      }
    } catch (error) {
      // A stylesheet the renderer will not expose. Skipping it can only cost a
      // false GEN-UNSTYLED, which a person reads and dismisses; guessing the
      // other way would hide the defect this rule exists to find.
      continue
    }
  }

  const roots = []
  const main =
    auditRootSelector === null
      ? document.body
      : document.querySelector(auditRootSelector)
  if (main !== null) {
    roots.push(main)
  }

  // Portalled surfaces are siblings of the app root, so a walk from the body
  // alone measures the scrim and misses the dialog sitting on top of it.
  for (const node of document.querySelectorAll(
    'dialog, .popover, .foldout, [data-portal]'
  )) {
    if (!roots.some(root => root === node || root.contains(node))) {
      roots.push(node)
    }
  }

  const seen = new Set()
  const elements = []
  for (const root of roots) {
    if (root instanceof Element && !seen.has(root)) {
      seen.add(root)
      elements.push(root)
    }
    for (const element of root.querySelectorAll('*')) {
      if (!seen.has(element)) {
        seen.add(element)
        elements.push(element)
      }
    }
  }

  const describe = element => {
    const parts = []
    let node = element
    let depth = 0
    while (node !== null && node.nodeType === 1 && depth < 6) {
      let part = node.tagName.toLowerCase()
      if (node.id !== '') {
        part += '#' + node.id
      }
      const classes = (node.getAttribute('class') || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
      if (classes.length > 0) {
        part += '.' + classes.join('.')
      }
      parts.unshift(part)
      node = node.parentElement
      depth += 1
    }
    return parts.join(' > ')
  }

  const clippingAncestor = element => {
    let node = element.parentElement
    while (node !== null) {
      const style = window.getComputedStyle(node)
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        return node
      }
      node = node.parentElement
    }
    return null
  }

  const findings = []
  const add = (rule, severity, element, detail) => {
    findings.push({ rule, severity, path: describe(element), detail })
  }

  // One CSS pixel absorbs subpixel rounding without hiding a real overflow.
  const tolerance = 1

  for (const element of elements) {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()

    const rendered =
      typeof element.checkVisibility === 'function'
        ? element.checkVisibility()
        : style.display !== 'none' && style.visibility !== 'hidden'

    const text = (element.textContent || '').trim()

    // Checked BEFORE the size filter below, and deliberately so: a box
    // collapsed to zero has no width or height, so the filter that skips
    // unrendered elements would discard exactly the elements this rule exists
    // to find. It fired on nothing at all until a fixture proved it.
    if (
      rendered &&
      text !== '' &&
      (element.clientHeight === 0 || element.clientWidth === 0)
    ) {
      add('CJ-COLLAPSED', 'error', element, text.slice(0, 60))
    }

    if (
      !rendered ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      Number(style.opacity) === 0
    ) {
      continue
    }

    const interactive = element.matches(Interactive)

    for (const className of Array.from(element.classList)) {
      if (
        (className.startsWith('md3-') || className.startsWith('dm-')) &&
        !styledClasses.has(className)
      ) {
        add('GEN-UNSTYLED', 'error', element, className)
      }
    }

    const overflowY = element.scrollHeight - element.clientHeight
    if (
      overflowY > tolerance &&
      (style.overflowY === 'hidden' || style.overflowY === 'clip')
    ) {
      add('CJ-OVERFLOW-Y', 'error', element, overflowY + 'px hidden')
    }

    const overflowX = element.scrollWidth - element.clientWidth
    if (
      overflowX > tolerance &&
      (style.overflowX === 'hidden' || style.overflowX === 'clip')
    ) {
      add('CJ-OVERFLOW-X', 'error', element, overflowX + 'px hidden')
    }

    if (
      text !== '' &&
      element.scrollWidth > element.clientWidth + tolerance &&
      (style.textOverflow === 'ellipsis' ||
        style.whiteSpace.startsWith('nowrap') ||
        style.whiteSpace === 'pre')
    ) {
      // Disclosed only when the full string is genuinely retrievable. An
      // attribute that merely exists discloses nothing: a `title` holding a
      // different string says nothing about what was cut off.
      const disclosure =
        element.getAttribute('title') ||
        element.getAttribute('aria-label') ||
        ''
      const disclosed = disclosure.trim() === text
      add(
        disclosed ? 'CJ-TRUNCATED-DISCLOSED' : 'CJ-TRUNCATED-SILENT',
        disclosed ? 'info' : 'warn',
        element,
        text.slice(0, 60)
      )
    }

    const host = clippingAncestor(element)
    if (host !== null && (interactive || text !== '')) {
      const hostRect = host.getBoundingClientRect()
      const spill = Math.max(
        hostRect.top - rect.top,
        hostRect.left - rect.left,
        rect.bottom - hostRect.bottom,
        rect.right - hostRect.right
      )
      if (spill > tolerance) {
        add(
          'CJ-ESCAPES-SURFACE',
          'error',
          element,
          Math.round(spill) + 'px outside ' + describe(host)
        )
      }
    }

    if (interactive) {
      const outside = Math.max(
        -rect.top,
        -rect.left,
        rect.bottom - window.innerHeight,
        rect.right - window.innerWidth
      )
      if (outside > tolerance) {
        add(
          'CJ-OFF-VIEWPORT',
          'error',
          element,
          Math.round(outside) + 'px outside the viewport'
        )
      }

      const smallest = Math.min(rect.width, rect.height)
      const size = Math.round(rect.width) + 'x' + Math.round(rect.height)
      if (smallest < 24) {
        add('CJ-TARGET-TOO-SMALL', 'error', element, size)
      } else if (smallest < 40) {
        add('CJ-TARGET-TOO-SMALL', 'warn', element, size)
      }

      const named =
        text !== '' ||
        (element.getAttribute('aria-label') || '').trim() !== '' ||
        element.hasAttribute('aria-labelledby') ||
        (element.getAttribute('title') || '').trim() !== '' ||
        element.querySelector('img[alt]:not([alt=""])') !== null
      if (!named) {
        add('GEN-NO-NAME', 'warn', element, element.tagName.toLowerCase())
      }
    }
  }

  return {
    elementsExamined: elements.length,
    findings,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }
}

/**
 * Audit one rendered surface and return its record for the run report.
 *
 * Findings are collapsed by rule, path and severity: a virtualised list yields
 * one finding per row, and forty copies of one defect is a report nobody reads.
 * The exemplar carries an occurrence count instead.
 */
async function auditSurface(page, { label, root = null }) {
  await settleForMeasurement(page)

  const found = await page.evaluate(collectFindings, root)

  const collapsed = new Map()
  for (const finding of found.findings) {
    const key = finding.rule + '|' + finding.path + '|' + finding.severity
    const existing = collapsed.get(key)
    if (existing === undefined) {
      collapsed.set(key, { ...finding, occurrences: 1 })
    } else {
      existing.occurrences += 1
    }
  }

  const findings = [...collapsed.values()]
  const summary = {}
  for (const finding of findings) {
    const bucket = finding.rule + ':' + finding.severity
    summary[bucket] = (summary[bucket] || 0) + finding.occurrences
  }

  return {
    label,
    root,
    elementsExamined: found.elementsExamined,
    devicePixelRatio: found.devicePixelRatio,
    viewport: found.viewport,
    summary,
    findings,
  }
}

module.exports = { auditSurface, collectFindings, settleForMeasurement }
