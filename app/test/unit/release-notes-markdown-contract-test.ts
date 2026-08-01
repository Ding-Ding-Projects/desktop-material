import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const view = Path.resolve(
  __dirname,
  '../../src/ui/github-releases/github-releases-view.tsx'
)

describe('release notes markdown contract', () => {
  it('renders notes through the shared sandboxed markdown renderer', async () => {
    const source = await readFile(view, 'utf8')

    // Release bodies are authored as markdown on the provider. Printing the
    // body into a paragraph showed the raw syntax: headings as literal #,
    // links as literal brackets, lists as literal dashes.
    assert.match(source, /<SandboxedMarkdown/)
    assert.match(source, /markdown=\{release\.body\}/)

    assert.doesNotMatch(
      source,
      /<p>\{release\.body \|\| 'No release notes were provided\.'\}<\/p>/,
      'the raw-text rendering must be gone, not merely accompanied'
    )
  })

  it('keeps an honest empty state rather than an empty renderer', async () => {
    const source = await readFile(view, 'utf8')
    assert.match(source, /No release notes were provided\./)
    assert.match(source, /release\.body \? \(/)
  })

  it('carries the props the renderer needs to be safe and legible', async () => {
    const source = await readFile(view, 'utf8')
    // Without emoji the shortcodes render as :literal:, and without a base
    // href a relative link in the notes resolves against nothing.
    assert.match(source, /emoji=\{this\.props\.emoji \?\? new Map\(\)\}/)
    assert.match(
      source,
      /underlineLinks=\{this\.props\.underlineLinks === true\}/
    )
    assert.match(source, /baseHref=\{release\.htmlURL \?\? undefined\}/)
    assert.match(source, /ariaLabel=/)
  })
})
