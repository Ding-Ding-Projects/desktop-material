import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Pages accessibility contracts', () => {
  it('keeps footer headings in sequence after the page-level h2 sections', () => {
    const markup = read('site/index.html')

    assert.doesNotMatch(markup, /<h4\b/)
    assert.match(markup, /<h3>Project<\/h3>/)
    assert.match(markup, /<h3>Upstream<\/h3>/)
  })

  it('visually distinguishes in-text section links without color alone', () => {
    const style = read('site/style.css')

    assert.match(
      style,
      /\.section-sub a\s*\{[\s\S]*?text-decoration:\s*underline;/
    )
  })
})
