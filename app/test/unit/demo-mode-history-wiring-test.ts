/**
 * Proves the demo-mode redaction is actually wired into the surface that leaked,
 * not merely available as a helper.
 *
 * A module that exists but is never called is exactly the failure this session
 * kept finding elsewhere, so this asserts the call site by reading the source:
 * the diff must pass through `redactForDemo` before it reaches component state,
 * and it must be gated on the flag rather than applied unconditionally.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'version-history',
    'versioned-store-history.tsx'
  ),
  'utf8'
)

describe('demo mode is wired into versioned-store history', () => {
  it('imports the redaction rather than reimplementing it', () => {
    assert.match(
      source,
      /import \{[^}]*redactForDemo[^}]*\} from '\.\.\/\.\.\/lib\/demo-mode'/
    )
  })

  it('routes the fetched diff through the redaction before rendering it', () => {
    assert.match(
      source,
      /const raw = await this\.props\.source\.getDiff\(sha, file\)/,
      'the raw diff should be named separately from the rendered one'
    )
    assert.match(
      source,
      /const diff = redactForDemo\(raw, isDemoModeEnabled\(\)\)/,
      'the rendered diff must be the redacted one'
    )
  })

  it('never sets the raw diff into state', () => {
    // If the unredacted value reached state, the redaction would be decorative.
    assert.doesNotMatch(
      source,
      /setState\(\{\s*diff:\s*raw\b/,
      'the raw diff must not be rendered'
    )
    assert.match(source, /setState\(\{ diff, loadingDiff: false \}\)/)
  })

  it('stays gated on the flag, so ordinary users keep their real paths', () => {
    assert.match(source, /isDemoModeEnabled\(\)/)
    // An unconditional redactHomePaths call here would strip paths for everyone.
    assert.doesNotMatch(
      source,
      /redactHomePaths\(/,
      'redaction must go through the flag-gated helper'
    )
  })
})
