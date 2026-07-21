import { describe, it } from 'node:test'
import assert from 'node:assert'
import { redactLocalPaths } from '../../src/ui/lib/redact-local-paths'

describe('redactLocalPaths', () => {
  it('redacts a JSON-escaped Windows home path in a settings diff', () => {
    const diff =
      '+        "repositoryPath": "C:\\\\Users\\\\Administrator\\\\AppData\\\\Local\\\\Temp\\\\desktop-material\\\\fixture",'
    const out = redactLocalPaths(diff)
    assert.doesNotMatch(out, /Users/)
    assert.doesNotMatch(out, /Administrator/)
    assert.match(out, /local path hidden/)
    // The surrounding JSON structure is preserved.
    assert.match(out, /"repositoryPath": "/)
  })

  it('redacts a plain Windows home path', () => {
    const out = redactLocalPaths('opened C:\\Users\\jane\\repos\\app')
    assert.doesNotMatch(out, /jane/)
    assert.match(out, /local path hidden/)
  })

  it('redacts POSIX home paths', () => {
    assert.match(redactLocalPaths('/Users/jane/repos/app'), /local path hidden/)
    assert.match(redactLocalPaths('/home/jane/repos/app'), /local path hidden/)
    assert.doesNotMatch(redactLocalPaths('/home/jane/x'), /jane/)
  })

  it('leaves ordinary settings content untouched', () => {
    const content = '+  "titleColor": "#3366ff",\n+  "bold": true'
    assert.equal(redactLocalPaths(content), content)
  })

  it('returns empty input unchanged', () => {
    assert.equal(redactLocalPaths(''), '')
  })
})
