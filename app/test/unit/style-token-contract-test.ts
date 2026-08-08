import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const stylesRoot = join(process.cwd(), 'app', 'styles')

const runtimeDefinedTokens = new Set([
  'available-height',
  'available-width',
  'dialog-cascade-offset',
  'history-graph-control-color',
  'history-graph-lane-color',
  'history-graph-ref-color',
  'non-modal-sheet-cascade-offset',
  'swatch',
  'toolbar-item-preferred-width',
])

function walkScssFiles(dir: string): ReadonlyArray<string> {
  const paths = new Array<string>()

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      paths.push(...walkScssFiles(path))
    } else if (path.endsWith('.scss')) {
      paths.push(path)
    }
  }

  return paths
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('style token contracts', () => {
  it('does not reference undefined CSS custom properties without fallbacks', () => {
    const files = walkScssFiles(stylesRoot)
    const definedTokens = new Set<string>()
    const undefinedUsages = new Array<string>()

    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const match of text.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)) {
        definedTokens.add(match[1])
      }
    }

    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const match of text.matchAll(
        /var\(--([A-Za-z0-9_-]+)(\s*,[\s\S]*?)?\)/g
      )) {
        const [, token, fallback] = match
        if (
          definedTokens.has(token) ||
          runtimeDefinedTokens.has(token) ||
          fallback !== undefined
        ) {
          continue
        }

        undefinedUsages.push(`${file}: ${match[0]}`)
      }
    }

    assert.deepEqual(undefinedUsages, [])
  })
})
