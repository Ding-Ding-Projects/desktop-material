import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * The capture harness has to explain itself when the app never renders.
 *
 * It collects every renderer console error, and for a long time reported them
 * only on the success path — so the one failure where they are decisive was
 * the one failure that discarded them. What a caller got instead was
 * `locator timed out waiting for #desktop-app-contents`, which reads exactly
 * the same whether the app is broken, the machine is slow, or something else
 * entirely.
 *
 * That cost real time. A capture run failed, the obvious suspicion was the
 * start-up code changed in the same session, and the bare timeout supported
 * that reading as well as it supported any other. Surfacing the errors answered
 * it in one run: `ERR_CONNECTION_REFUSED`, because a development compile points
 * webpack's `publicPath` at `http://localhost:3000/build/` and the renderer was
 * fetching its own bundle from a dev server nobody was running.
 *
 * These assertions are about the harness's own diagnostics rather than about
 * the app, which is unusual — but a diagnostic that silently stops working is
 * worse than none, because the next person trusts the message they are given.
 */

const harness = readFileSync(
  join(process.cwd(), 'script/capture-app.js'),
  'utf8'
)

describe('the capture harness reports why a capture failed', () => {
  it('collects renderer console errors and page errors', () => {
    assert.match(harness, /consoleErrors\.push\(`console\.error:/)
    assert.match(harness, /consoleErrors\.push\(`pageerror:/)
  })

  it('reports them when the app never renders, not only when it does', () => {
    // The whole point. `#desktop-app-contents` failing to appear is the moment
    // the collected errors are worth the most.
    // Anchored on the message itself rather than on the selector. The selector
    // appears three times in this file — the welcome flow waits on it too — and
    // an `indexOf` from zero lands on the first, which is not the one being
    // asserted about. That is the same multi-occurrence trap that has already
    // bitten twice in this repository's guards: a search that finds *an*
    // occurrence is not a search that finds *the* occurrence.
    const message = 'never appeared'
    const at = harness.indexOf(message)
    assert.notStrictEqual(at, -1, 'the failure message is gone')

    const around = harness.slice(Math.max(0, at - 1400), at + 200)
    assert.match(
      around,
      /catch \(error\)/,
      'the readiness wait must be caught, or its timeout escapes unexplained'
    )
    // Not merely that `consoleErrors` is mentioned nearby. Deleting the code
    // that formats them left the `consoleErrors.length === 0` test sitting a
    // line above, so a bare mention still matched and this guard passed on a
    // harness that had stopped reporting anything — which is the precise
    // failure it exists to catch, reproduced by the guard itself.
    assert.match(
      around,
      /\.\.\.consoleErrors\]/,
      'the failure path must interpolate the collected errors, not merely ' +
        'count them'
    )
  })

  it('says plainly when there were no errors at all', () => {
    // "No errors" and "errors nobody showed you" are different diagnoses and
    // must not look identical. A silent hang points somewhere else entirely.
    assert.match(harness, /the renderer logged no errors/)
  })

  it('names the development-build cause rather than leaving it to be inferred', () => {
    // ERR_CONNECTION_REFUSED with no further explanation sends a reader looking
    // at the network, at a proxy, at the app's own HTTP clients — anywhere but
    // at which webpack config produced the bundle.
    assert.match(harness, /ERR_CONNECTION_REFUSED/)
    assert.match(
      harness,
      /compile:prod/,
      'the message must name the command that fixes it'
    )
  })
})
