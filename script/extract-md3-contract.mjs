#!/usr/bin/env node
/**
 * Extract the machine-checkable inventory out of the MD3 design contract.
 *
 * `design/History MD3.dc.html` is the specification the shell is built to. This
 * script reads it and writes `app/test/fixtures/md3-contract.json`: every
 * destination, every menu kind and its items, every search field, every filter
 * chip set, every regex-builder flag and token, and every icon ligature the
 * design uses.
 *
 * WHY a generated inventory rather than a hand-typed one: the whole risk in a
 * "100%, no gaps" rewrite is a surface nobody noticed was in the design. A list
 * typed by hand omits exactly the thing that was overlooked, and then the guard
 * built on it passes. Reading the design file mechanically cannot skip a menu
 * because the person writing the list had not scrolled that far.
 *
 * WHY that is still not sufficient on its own: a guard shaped as "everything the
 * implementation has must be well-formed" passes cleanly on an implementation
 * that has nothing. The contract test that consumes this fixture therefore
 * iterates the CONTRACT and demands the implementation carry each entry — the
 * assertion points from the design at the code, never the other way round.
 *
 * Determinism: no clock, no randomness, no network. Two runs over an unchanged
 * design file write byte-identical JSON.
 *
 * Usage:
 *   node script/extract-md3-contract.mjs           # write the fixture
 *   node script/extract-md3-contract.mjs --check   # fail if it would change
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = join(root, 'design', 'History MD3.dc.html')
const fixturePath = join(root, 'app', 'test', 'fixtures', 'md3-contract.json')

const normalizeLineEndings = value => value.replace(/\r\n?/g, '\n')

const source = normalizeLineEndings(readFileSync(contractPath, 'utf8'))

const markup = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(source)?.[1] ?? ''
const logic =
  /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? ''

if (markup === '' || logic === '') {
  throw new Error('Could not split the contract into its markup and logic blocks')
}

const unique = values => [...new Set(values)].sort()

/** Every icon ligature the design renders, from both blocks. */
function iconNames() {
  const names = []
  for (const m of markup.matchAll(/class="ms"[^>]*>([a-z0-9_]+)<\/span>/g)) {
    names.push(m[1])
  }
  for (const m of logic.matchAll(/\bicon:\s*'([a-z0-9_]+)'/g)) {
    names.push(m[1])
  }
  // Ternary-selected glyphs: `? 'check_circle' : 'error'` and friends. Only
  // accept snake_case-or-single-word literals that appear next to an icon-ish
  // identifier, so ordinary copy never lands in the icon list.
  for (const m of logic.matchAll(
    /(?:Icon|icon)\s*[:=]\s*[^,\n]*?((?:'[a-z0-9_]+'\s*:\s*)+'[a-z0-9_]+')/g
  )) {
    for (const lit of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
      names.push(lit[1])
    }
  }
  for (const m of logic.matchAll(
    /return status === 'success' \? '([a-z_]+)' : status === 'failed' \? '([a-z_]+)' : status === 'running' \? '([a-z_]+)' : '([a-z_]+)'/g
  )) {
    names.push(m[1], m[2], m[3], m[4])
  }
  return unique(names)
}

/** The navigation destinations, in the contract's own order. */
function destinations() {
  const block = /const destDefs = \[([\s\S]*?)\n    \]/.exec(logic)?.[1]
  if (block === undefined) {
    throw new Error('destDefs not found in the contract logic')
  }
  return [
    ...block.matchAll(
      /\{\s*label:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*count:\s*([^}]+)\}/g
    ),
  ].map(m => ({ label: m[1], icon: m[2] }))
}

/** Every `case '<kind>':` in menuSpec(), with its title, icon, width and items. */
function menus() {
  const spec = /menuSpec\(\) \{([\s\S]*?)\n  \}\n\n  renderVals/.exec(logic)?.[1]
  if (spec === undefined) {
    throw new Error('menuSpec() not found in the contract logic')
  }

  const cases = [...spec.matchAll(/case '([A-Za-z]+)':/g)].map(m => ({
    kind: m[1],
    at: m.index,
  }))

  return cases.map((entry, index) => {
    const body = spec.slice(
      entry.at,
      index + 1 < cases.length ? cases[index + 1].at : spec.length
    )
    const title = /title:\s*(?:'([^']*)'|([^,]+?)),\s*icon:/.exec(body)
    const icon = /icon:\s*'([^']+)',\s*width:/.exec(body)
    const width = /width:\s*(\d+)/.exec(body)
    const labels = [...body.matchAll(/\{\s*label:\s*'((?:[^'\\]|\\.)*)'/g)].map(m =>
      m[1].replace(/\\\\/g, '\\').replace(/\\'/g, "'")
    )
    const dynamic = [...body.matchAll(/\{\s*label:\s*'((?:[^'\\]|\\.)*)'\s*\+/g)]
      .map(m => m[1].replace(/\\\\/g, '\\').replace(/\\'/g, "'"))

    return {
      kind: entry.kind,
      // A computed title (for example the selected sha) is recorded as null so
      // the test asserts the surface exists without pinning a fixture value.
      title: title?.[1] ?? null,
      icon: icon?.[1] ?? null,
      width: width === null ? null : Number(width[1]),
      itemLabels: labels,
      dynamicLabelPrefixes: unique(dynamic),
    }
  })
}

/** Every search field key the contract keeps state for. */
function searchFields() {
  const block = /search:\s*\{([^}]*)\}/.exec(logic)?.[1]
  if (block === undefined) {
    throw new Error('state.search not found in the contract logic')
  }
  const keys = [...block.matchAll(/([A-Za-z]+):\s*''/g)].map(m => m[1])
  const placeholders = [
    ...logic.matchAll(/this\.searchVals\('([A-Za-z]+)',\s*'([^']+)'\)/g),
  ].map(m => ({ key: m[1], placeholder: m[2] }))
  return { keys: unique(keys), placeholders }
}

/** Every filter chip set, keyed by the state field it writes. */
function chipSets() {
  return [
    ...logic.matchAll(
      /this\.chipVals\(\[([^\]]*)\],\s*[A-Za-z]+,\s*v => this\.setState\(\{\s*([A-Za-z]+):/g
    ),
  ].map(m => ({
    state: m[2],
    labels: [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]),
  }))
}

/** The regex builder's flags and its four token groups. */
function regexBuilder() {
  const flags = /const flagList = \[([^\]]*)\]/.exec(logic)?.[1] ?? ''
  const titles = /const flagTitles = \{([^}]*)\}/.exec(logic)?.[1] ?? ''
  const groupBlock = /builderGroups: \[([\s\S]*?)\n      \]\.map/.exec(logic)?.[1]

  if (groupBlock === undefined) {
    throw new Error('builderGroups not found in the contract logic')
  }

  const groups = [
    ...groupBlock.matchAll(/\{ title: '([^']+)', tokens: \[([\s\S]*?)\] \}/g),
  ].map(m => ({
    title: m[1],
    tokens: [...m[2].matchAll(/\['((?:[^'\\]|\\.)*)',\s*'([^']*)'\]/g)].map(t => ({
      token: t[1].replace(/\\\\/g, '\\'),
      label: t[2],
    })),
  }))

  return {
    flags: [...flags.matchAll(/'([a-z])'/g)].map(m => m[1]),
    flagTitles: Object.fromEntries(
      [...titles.matchAll(/([a-z]):\s*'([^']+)'/g)].map(m => [m[1], m[2]])
    ),
    groups,
  }
}

/**
 * Visible copy the design writes as plain text in the markup — the strings a
 * reader would notice missing. Bindings and whitespace are skipped.
 */
function staticCopy() {
  const text = []
  for (const m of markup.matchAll(/>([^<>{}]+)</g)) {
    const value = m[1].replace(/\s+/g, ' ').trim()
    if (value.length < 3 || /^[.\-–—·|/]+$/.test(value)) {
      continue
    }
    text.push(value.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' '))
  }
  return unique(text)
}

const contract = {
  generatedFrom: 'design/History MD3.dc.html',
  generatedBy: 'script/extract-md3-contract.mjs',
  note:
    'Machine-extracted inventory of the MD3 design contract. The conformance ' +
    'test iterates THIS file and demands the implementation carry each entry, ' +
    'so a surface the design has and the code does not is a failure rather ' +
    'than an absence nobody looked for.',
  destinations: destinations(),
  menus: menus(),
  searchFields: searchFields(),
  chipSets: chipSets(),
  regexBuilder: regexBuilder(),
  iconNames: iconNames(),
  staticCopy: staticCopy(),
}

const serialized = JSON.stringify(contract, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const existing = normalizeLineEndings(readFileSync(fixturePath, 'utf8'))
  if (existing !== serialized) {
    process.stderr.write(
      'app/test/fixtures/md3-contract.json is stale; re-run ' +
        'node script/extract-md3-contract.mjs\n'
    )
    process.exit(1)
  }
  process.stdout.write('ok md3-contract.json matches the design contract\n')
  process.exit(0)
}

writeFileSync(fixturePath, serialized)
process.stdout.write(
  `wrote ${contract.destinations.length} destinations, ` +
    `${contract.menus.length} menu kinds, ` +
    `${contract.searchFields.keys.length} search fields, ` +
    `${contract.chipSets.length} chip sets, ` +
    `${contract.iconNames.length} icons, ` +
    `${contract.staticCopy.length} static strings\n`
)
