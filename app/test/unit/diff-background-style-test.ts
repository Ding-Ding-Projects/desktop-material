import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('diff background style contracts', () => {
  it('keeps unified context rows on the theme-aware diff surface', () => {
    const style = read('app/styles/ui/_diff.scss')

    assert.match(
      style,
      /\.diff-code-mirror \.CodeMirror\s*\{[\s\S]*?background: var\(--diff-background-color\);/
    )
    assert.match(
      style,
      /&\.diff-context\s*\{\s*background: var\(--diff-background-color\);/
    )
    assert.match(
      style,
      /\.diff-container\s*\{[\s\S]*?background: var\(--diff-background-color\);[\s\S]*?--diff-background-color: var\(--md-sys-color-surface\);/
    )
  })

  it('keeps standalone side-by-side diffs on the same themed surface', () => {
    const style = read('app/styles/ui/_side-by-side-diff.scss')

    assert.match(
      style,
      /\.side-by-side-diff-container\s*\{[\s\S]*?--diff-background-color: var\(--md-sys-color-surface\);/
    )
    assert.match(
      style,
      /\.side-by-side-diff\s*\{[\s\S]*?background: var\(--diff-background-color\);/
    )
  })
})
