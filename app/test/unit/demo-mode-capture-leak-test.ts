/**
 * Regression guard tied to a real capture failure.
 *
 * The gallery harness refused to photograph the Settings history surface with:
 *
 *   CAPTURE_FAIL Error: Capture settings-history-manager exposed a private path
 *   near "repositoryPath": "C:\\Users\\cntow\\AppData\\Local\\Temp\\..."
 *
 * That refusal was correct — every gallery frame is published publicly. This
 * asserts demo mode neutralises that exact payload, so the fix is verified
 * against the thing that actually broke rather than against a tidied-up sample.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { redactHomePaths, redactForDemo } from '../../src/lib/demo-mode'

/** Reproduced from the harness failure output, escaping and all. */
const LeakedPayload =
  '{"provider": "github", "repositoryPath": "C:\\\\Users\\\\cntow\\\\AppData\\\\Local\\\\Temp\\\\desktop-material-p0-ui-api\\\\fixture"}'

describe('demo mode against the real capture leak', () => {
  it('removes the user name the privacy gate caught', () => {
    const safe = redactHomePaths(LeakedPayload)
    assert.ok(LeakedPayload.includes('cntow'), 'fixture should start leaked')
    assert.ok(!safe.includes('cntow'), safe)
    assert.ok(!/[A-Za-z]:\\\\/.test(safe), safe)
    assert.ok(!safe.includes('Users'), safe)
  })

  it('keeps the payload valid JSON, so the surface still renders', () => {
    const parsed = JSON.parse(redactHomePaths(LeakedPayload)) as {
      readonly provider: string
      readonly repositoryPath: string
    }
    assert.equal(parsed.provider, 'github')
    // The tail is retained: a screenshot still shows which fixture it was.
    assert.ok(parsed.repositoryPath.includes('fixture'), parsed.repositoryPath)
  })

  it('does nothing to this payload when demo mode is off', () => {
    assert.equal(redactForDemo(LeakedPayload, false), LeakedPayload)
  })

  it('would satisfy the harness assertion that rejected the frame', () => {
    // The gate looks for a home-directory path anywhere in the rendered text.
    const rendered = redactForDemo(LeakedPayload, true)
    const privatePath = /[A-Za-z]:(?:\\{1,2})Users(?:\\{1,2})[^"\\]+/
    assert.ok(
      privatePath.test(LeakedPayload),
      'the original must match the gate, or this test proves nothing'
    )
    assert.ok(!privatePath.test(rendered), rendered)
  })
})
