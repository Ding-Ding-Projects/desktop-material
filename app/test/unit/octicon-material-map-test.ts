import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  OcticonMaterialSymbols,
  OcticonsWithoutMaterialEquivalent,
} from '../../src/ui/lib/octicon-material-map'
import { MaterialSymbolNames } from '../../src/ui/lib/material-symbol'

const uiRoot = join(process.cwd(), 'app', 'src', 'ui')

function walk(dir: string): ReadonlyArray<string> {
  const out = new Array<string>()

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
    } else if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      out.push(path)
    }
  }

  return out
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Every Octicon the interface actually renders. */
function octiconsInUse(): ReadonlySet<string> {
  const used = new Set<string>()

  for (const file of walk(uiRoot)) {
    const text = stripComments(readFileSync(file, 'utf8'))
    for (const match of text.matchAll(/\bocticons\.([A-Za-z0-9_]+)/g)) {
      // `octicons.generated` is the module re-export, not a symbol.
      if (match[1] !== 'generated' && match[1] !== 'OcticonSymbol') {
        used.add(match[1])
      }
    }
  }

  return used
}

describe('octicon to material symbol map', () => {
  it('covers every Octicon the interface renders', () => {
    const used = octiconsInUse()

    // A scan that found nothing would let every assertion below pass without
    // looking at anything at all.
    assert.ok(
      used.size > 100,
      `only ${used.size} Octicons were found in app/src/ui; the scan has drifted`
    )

    const unmapped = [...used]
      .filter(
        name =>
          !(name in OcticonMaterialSymbols) &&
          !OcticonsWithoutMaterialEquivalent.has(name)
      )
      .sort()

    assert.deepEqual(
      unmapped,
      [],
      'these Octicons are rendered but have neither a Material Symbol nor a ' +
        'recorded reason for not having one'
    )
  })

  it('resolves every mapped name to a glyph the bundled font carries', () => {
    // The typing already enforces this at build time. It is asserted again here
    // because the failure it prevents is the worst one this codebase has: an
    // unknown ligature does not render a box or a blank, it renders the literal
    // English word, so a wrong name ships as "smartphone" sitting in the
    // interface where an icon should be.
    const names = new Set<string>(MaterialSymbolNames)
    const missing = Object.entries(OcticonMaterialSymbols)
      .filter(([, symbol]) => !names.has(symbol))
      .map(([octicon, symbol]) => `${octicon} -> ${symbol}`)
      .sort()

    assert.deepEqual(missing, [], 'these targets are not in the shipped subset')
  })

  it('does not both map and exempt the same Octicon', () => {
    const both = [...OcticonsWithoutMaterialEquivalent.keys()]
      .filter(name => name in OcticonMaterialSymbols)
      .sort()

    assert.deepEqual(
      both,
      [],
      'an Octicon cannot be exempt and mapped at the same time'
    )
  })

  it('gives every exemption a reason', () => {
    const unexplained = [...OcticonsWithoutMaterialEquivalent.entries()]
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([name]) => name)
      .sort()

    assert.deepEqual(
      unexplained,
      [],
      'an exemption without a real reason is a gap that reads as a decision'
    )
  })

  it('does not exempt an Octicon nothing renders any more', () => {
    const used = octiconsInUse()
    const stale = [...OcticonsWithoutMaterialEquivalent.keys()]
      .filter(name => !used.has(name))
      .sort()

    assert.deepEqual(
      stale,
      [],
      'these exemptions outlived the Octicon they were written for'
    )
  })
})
