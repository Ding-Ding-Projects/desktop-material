import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'actions',
    'actions-cache-manager.tsx'
  ),
  'utf8'
)

describe('Actions cache download contract', () => {
  it('does not imply that GitHub exposes unsupported cache archive downloads', () => {
    assert.match(source, /Download unavailable/)
    assert.match(source, /does not provide a supported Actions cache archive/)
    assert.match(source, /disabled=\{true\}/)
    assert.match(source, /run&apos;s Artifacts section/)
  })
})
