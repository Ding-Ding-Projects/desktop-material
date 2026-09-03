import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { dirname, join, relative, sep } from 'path'

const repoRoot = process.cwd()
const stylesRoot = join(repoRoot, 'app', 'styles')
const srcRoot = join(repoRoot, 'app', 'src')

/**
 * Stylesheets that deliberately sit outside every bundle.
 *
 * This list may only shrink. An entry is a promise that nothing renders the
 * classes inside that file; adding one to silence the guard re-creates exactly
 * the defect the guard exists to catch.
 */
const unbundledStylesheetAllowlist: ReadonlyArray<string> = []

function walk(dir: string, ext: string): ReadonlyArray<string> {
  const out = new Array<string>()

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path, ext))
    } else if (path.endsWith(ext)) {
      out.push(path)
    }
  }

  return out
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * The Sass bundle entry points, discovered rather than hard-coded so that a new
 * renderer entry cannot quietly escape this guard.
 */
function findEntrypoints(): ReadonlyArray<string> {
  const entries = new Set<string>()

  for (const file of walk(srcRoot, '.tsx').concat(walk(srcRoot, '.ts'))) {
    const text = stripComments(readFileSync(file, 'utf8'))
    for (const match of text.matchAll(/require\(\s*'([^']+\.scss)'\s*\)/g)) {
      const resolved = join(dirname(file), match[1])
      if (existsSync(resolved)) {
        entries.add(resolved)
      }
    }
  }

  return [...entries].sort()
}

/** Resolve one `@import` specifier the way Sass would, or undefined. */
function resolveImport(
  fromFile: string,
  specifier: string
): string | undefined {
  if (specifier.startsWith('~') || specifier.startsWith('http')) {
    return undefined
  }

  const base = dirname(fromFile)
  const dir = dirname(specifier)
  const name = specifier.slice(dir === '.' ? 0 : dir.length + 1)

  for (const candidate of [`${name}.scss`, `_${name}.scss`]) {
    const path = join(base, dir, candidate)
    if (existsSync(path)) {
      return path
    }
  }

  return undefined
}

/** Every stylesheet actually reachable from a bundle entry point. */
function reachableStylesheets(): ReadonlySet<string> {
  const seen = new Set<string>()
  const queue = [...findEntrypoints()]

  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file)) {
      continue
    }
    seen.add(file)

    const text = stripComments(readFileSync(file, 'utf8'))
    for (const statement of text.matchAll(/@import\s+([^;]+);/g)) {
      for (const quoted of statement[1].matchAll(/'([^']+)'|"([^"]+)"/g)) {
        const specifier = quoted[1] ?? quoted[2]
        const resolved = resolveImport(file, specifier)
        if (resolved !== undefined) {
          queue.push(resolved)
        }
      }
    }
  }

  return seen
}

/**
 * Class names that appear in a selector position in the given stylesheets.
 *
 * Matching is class-boundary exact: `.md3-chip` is NOT satisfied by
 * `.md3-chip--active` (a longer name) nor by `.md3-chip img` (a descendant
 * rule about a child). Both of those near-misses would otherwise let a deleted
 * rule keep passing.
 */
function definedClasses(files: Iterable<string>): ReadonlySet<string> {
  const defined = new Set<string>()

  for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'))

    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      // Only selector lines: those opening a block or continuing a list.
      if (!/[{,]$/.test(trimmed)) {
        continue
      }

      const selector = trimmed.replace(/[{,]$/, '')
      for (const match of selector.matchAll(
        /\.([A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g
      )) {
        defined.add(match[1])
      }
    }
  }

  return defined
}

/**
 * Read a balanced span starting at `open` (a bracket, brace or paren) and
 * return the text inside it, quote-aware so a delimiter inside a string does
 * not end the span early.
 */
function balancedSpan(text: string, open: number): string {
  const pairs: Record<string, string> = { '{': '}', '(': ')' }
  const close = pairs[text[open]]
  let depth = 0
  let quote: string | undefined

  for (let i = open; i < text.length; i++) {
    const ch = text[i]

    if (quote !== undefined) {
      if (ch === '\\') {
        i++
      } else if (ch === quote) {
        quote = undefined
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
    } else if (ch === text[open]) {
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0) {
        return text.slice(open + 1, i)
      }
    }
  }

  return ''
}

/**
 * Collect `md3-*` class names out of every string literal in `fragment`.
 *
 * Each literal is split on whitespace, because `className="md3-a md3-b"` is one
 * string carrying two classes. Requiring a quote on both sides of the name
 * instead would silently match neither, which is precisely the false negative
 * that let the `md3-anim-*` classes look styled while nothing defined them.
 */
function collectLiterals(fragment: string, into: Set<string>): void {
  for (const match of fragment.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''

    for (const token of value.split(/\s+/)) {
      if (/^md3-[A-Za-z0-9_-]+$/.test(token)) {
        into.add(token)
      }
    }
  }
}

/**
 * Every `md3-*` class name the renderer actually applies to an element.
 *
 * Only `className=` attributes and `classNames(...)` calls are read. A bare
 * `md3-*` string literal elsewhere is NOT a class: the codebase also uses that
 * prefix for localStorage keys (`md3-commit-sort-order`), menu item ids
 * (`md3-lock-create`), form control names (`md3-support-ticket-category`) and a
 * surface-registry discriminant (`md3-search-field`). Treating those as classes
 * makes the guard cry wolf, and a guard that cries wolf gets suppressed.
 */
function emittedMd3Classes(): ReadonlyMap<string, string> {
  const emitted = new Map<string, string>()
  const files = walk(srcRoot, '.tsx').concat(walk(srcRoot, '.ts'))

  for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'))
    const found = new Set<string>()

    for (const match of text.matchAll(/\bclassNames?\s*(=|\()/g)) {
      const at = match.index + match[0].length - 1

      if (text[at] === '(') {
        collectLiterals(balancedSpan(text, at), found)
        continue
      }

      // className= : either a quoted string or a braced expression.
      let i = at + 1
      while (i < text.length && /\s/.test(text[i])) {
        i++
      }

      if (text[i] === '{') {
        collectLiterals(balancedSpan(text, i), found)
      } else if (text[i] === '"' || text[i] === "'") {
        const end = text.indexOf(text[i], i + 1)
        if (end > i) {
          collectLiterals(text.slice(i, end + 1), found)
        }
      }
    }

    // The tonal contract hands callers class names through `container` / `on`
    // properties rather than applying them itself, so they never appear in a
    // className position. Parsed rather than hard-coded so a new tone is
    // covered automatically.
    if (file.endsWith('md3-style-contract.ts')) {
      for (const match of text.matchAll(
        /\b(?:container|on)\s*:\s*'(md3-[A-Za-z0-9_-]+)'/g
      )) {
        found.add(match[1])
      }
    }

    for (const className of found) {
      if (!emitted.has(className)) {
        emitted.set(className, relative(repoRoot, file).split(sep).join('/'))
      }
    }
  }

  return emitted
}

describe('md3 class contract', () => {
  it('styles every md3-* class the renderer emits', () => {
    const reachable = reachableStylesheets()
    const defined = definedClasses(reachable)
    const undefinedClasses = new Array<string>()

    for (const [className, source] of emittedMd3Classes()) {
      if (!defined.has(className)) {
        undefinedClasses.push(`${className} (emitted by ${source})`)
      }
    }

    assert.deepEqual(
      undefinedClasses.sort(),
      [],
      'these classes render unstyled: no reachable stylesheet defines them'
    )
  })

  it('reaches every stylesheet under app/styles/ui from a bundle', () => {
    const reachable = reachableStylesheets()
    const orphans = new Array<string>()

    for (const file of walk(join(stylesRoot, 'ui'), '.scss')) {
      const rel = relative(repoRoot, file).split(sep).join('/')
      if (!reachable.has(file) && !unbundledStylesheetAllowlist.includes(rel)) {
        orphans.push(rel)
      }
    }

    assert.deepEqual(
      orphans.sort(),
      [],
      'these stylesheets are never imported, so their rules never load'
    )
  })
})
