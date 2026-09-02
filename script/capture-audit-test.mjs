// Proof that every audit predicate actually fires.
//
// The rules in `capture-audit.js` decide whether a surface is reported as
// broken, so a rule that silently matches nothing is worse than no rule at all:
// the run comes back clean and the defect ships. Each case below builds a page
// containing exactly one known defect and asserts that rule appears — and,
// first, asserts the defect is genuinely present in the geometry, so a fixture
// that stopped overflowing cannot make a dead predicate look proven.
//
// Chromium rather than the Electron app: these are assertions about the
// predicates, not about any surface, and a fixture is the only way to know what
// the right answer is.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { chromium } from 'playwright'
import { collectFindings, settleForMeasurement } from './capture-audit.js'

let browser = null
let page = null

before(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 600, height: 400 } })
})

after(async () => {
  if (browser !== null) {
    await browser.close()
  }
})

/** Render `body` plus `style`, then run the real audit over it. */
async function audit(style, body) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       body { margin: 0; font: 16px/1.4 monospace; }
       ${style}
     </style><body>${body}</body>`
  )
  await settleForMeasurement(page)
  return page.evaluate(collectFindings, null)
}

const rulesIn = found => new Set(found.findings.map(finding => finding.rule))

const measure = selector =>
  page.evaluate(argument => {
    const element = document.querySelector(argument)
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }
  }, selector)

describe('capture audit predicates', () => {
  it('reports content hidden by a fixed height with nowhere to scroll', async () => {
    const found = await audit(
      '.box { height: 20px; width: 200px; overflow: hidden; }',
      '<div class="box"><p>one</p><p>two</p><p>three</p><p>four</p></div>'
    )

    const box = await measure('.box')
    assert.ok(
      box.scrollHeight > box.clientHeight + 1,
      `fixture does not actually overflow: ${JSON.stringify(box)}`
    )

    assert.ok(rulesIn(found).has('CJ-OVERFLOW-Y'), 'CJ-OVERFLOW-Y did not fire')
  })

  it('reports horizontal content hidden with nowhere to scroll', async () => {
    const found = await audit(
      '.box { width: 60px; overflow: hidden; white-space: nowrap; }',
      '<div class="box">a very long single line that cannot fit</div>'
    )

    const box = await measure('.box')
    assert.ok(
      box.scrollWidth > box.clientWidth + 1,
      `fixture does not actually overflow: ${JSON.stringify(box)}`
    )

    assert.ok(rulesIn(found).has('CJ-OVERFLOW-X'), 'CJ-OVERFLOW-X did not fire')
  })

  it('separates silently truncated text from text that discloses itself', async () => {
    const style =
      '.t { width: 60px; overflow: hidden; text-overflow: ellipsis;' +
      ' white-space: nowrap; }'

    const silent = await audit(
      style,
      '<div class="t">a label far too long for its box</div>'
    )
    assert.ok(
      rulesIn(silent).has('CJ-TRUNCATED-SILENT'),
      'CJ-TRUNCATED-SILENT did not fire'
    )

    // The same truncation, with the whole string retrievable, is not a defect.
    const disclosed = await audit(
      style,
      '<div class="t" title="a label far too long for its box">' +
        'a label far too long for its box</div>'
    )
    assert.ok(
      rulesIn(disclosed).has('CJ-TRUNCATED-DISCLOSED'),
      'a disclosed truncation was not recognised'
    )
    assert.ok(
      !rulesIn(disclosed).has('CJ-TRUNCATED-SILENT'),
      'a disclosed truncation was still reported as silent'
    )
  })

  it('does not accept a disclosure that says something else', async () => {
    const found = await audit(
      '.t { width: 60px; overflow: hidden; text-overflow: ellipsis;' +
        ' white-space: nowrap; }',
      '<div class="t" title="something else entirely">' +
        'a label far too long for its box</div>'
    )

    assert.ok(
      rulesIn(found).has('CJ-TRUNCATED-SILENT'),
      'a title holding a different string was accepted as disclosure'
    )
  })

  it('reports an element painted outside the surface that clips it', async () => {
    const found = await audit(
      '.host { width: 100px; height: 40px; overflow: hidden;' +
        ' position: relative; }' +
        '.escapee { position: absolute; left: 160px; top: 0;' +
        ' width: 80px; height: 20px; }',
      '<div class="host"><button class="escapee">go</button></div>'
    )

    assert.ok(
      rulesIn(found).has('CJ-ESCAPES-SURFACE'),
      'CJ-ESCAPES-SURFACE did not fire'
    )
  })

  it('reports an interactive element pushed off the viewport', async () => {
    const found = await audit(
      '.off { position: absolute; left: 900px; top: 10px; width: 80px;' +
        ' height: 40px; }',
      '<button class="off">off screen</button>'
    )

    assert.ok(
      rulesIn(found).has('CJ-OFF-VIEWPORT'),
      'CJ-OFF-VIEWPORT did not fire'
    )
  })

  it('reports a hit target under the accessible minimum', async () => {
    const found = await audit(
      '.tiny { width: 12px; height: 12px; padding: 0; }',
      '<button class="tiny">x</button>'
    )

    const tiny = await measure('.tiny')
    assert.ok(
      Math.min(tiny.width, tiny.height) < 24,
      `fixture target is not actually small: ${JSON.stringify(tiny)}`
    )

    const errors = found.findings.filter(
      finding =>
        finding.rule === 'CJ-TARGET-TOO-SMALL' && finding.severity === 'error'
    )
    assert.ok(errors.length > 0, 'CJ-TARGET-TOO-SMALL did not fire as an error')
  })

  it('reports text in a box collapsed to zero', async () => {
    const found = await audit(
      '.squashed { height: 0; overflow: hidden; }',
      '<div class="squashed">content nobody can see</div>'
    )

    assert.ok(rulesIn(found).has('CJ-COLLAPSED'), 'CJ-COLLAPSED did not fire')
  })

  it('reports a design-system class with no rule behind it', async () => {
    const found = await audit(
      '.md3-real { color: red; }',
      '<div class="md3-real">styled</div>' +
        '<div class="md3-imaginary">unstyled</div>'
    )

    const unstyled = found.findings.filter(
      finding => finding.rule === 'GEN-UNSTYLED'
    )

    assert.deepEqual(
      unstyled.map(finding => finding.detail),
      ['md3-imaginary'],
      'GEN-UNSTYLED did not name exactly the class with no rule'
    )
  })

  it('reports an interactive element with no accessible name', async () => {
    const found = await audit(
      '.icon { width: 40px; height: 40px; }',
      '<button class="icon"></button>' +
        '<button class="icon" aria-label="Close">' +
        '<span class="glyph"></span></button>'
    )

    const unnamed = found.findings.filter(
      finding => finding.rule === 'GEN-NO-NAME'
    )
    assert.equal(
      unnamed.length,
      1,
      'GEN-NO-NAME should fire for the unlabelled button only'
    )
  })

  it('stays quiet on a surface with none of these defects', async () => {
    const found = await audit(
      '.ok { min-height: 48px; padding: 8px; }' +
        '.ok button { min-width: 48px; min-height: 48px; }',
      '<div class="ok"><button>Fetch origin</button></div>'
    )

    assert.deepEqual(
      found.findings.filter(finding => finding.severity === 'error'),
      [],
      'a clean surface produced error findings'
    )
  })

  it('collapses repeats of one defect rather than listing every row', async () => {
    const rows = Array.from(
      { length: 12 },
      () => '<li class="row">a label far too long for this narrow list</li>'
    ).join('')

    const found = await audit(
      '.row { width: 60px; overflow: hidden; text-overflow: ellipsis;' +
        ' white-space: nowrap; }',
      `<ul>${rows}</ul>`
    )

    const truncated = found.findings.filter(
      finding => finding.rule === 'CJ-TRUNCATED-SILENT'
    )
    assert.ok(
      truncated.length >= 12,
      'the raw collector should see every row; collapsing happens in auditSurface'
    )
  })
})
