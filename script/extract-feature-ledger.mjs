#!/usr/bin/env node
/**
 * Freeze an inventory of every user-facing feature surface the app has, so a
 * shell rewrite cannot quietly drop one.
 *
 * WHY: replacing the whole interface is exactly the change where a feature
 * disappears without anybody deciding to remove it — a dialog that only the old
 * toolbar opened, a menu command whose only caller was the old sidebar, a
 * documented capability whose entry point moved and never arrived. Nothing goes
 * red, because the code that implements it still compiles; it is simply
 * unreachable, and the first person to notice is a user looking for it.
 *
 * So the reachable surfaces are recorded here BEFORE the rewrite and the
 * accompanying test asserts, from this ledger, that each one still exists. The
 * assertion points from the ledger at the tree — a guard shaped "everything in
 * the tree is well-formed" passes on a tree that has lost half of it.
 *
 * What is recorded, and why each is a real signal:
 *   popupTypes    every dialog the app can open; losing one loses a whole flow
 *   menuIds       every application-menu command, including its shortcut
 *   featureDocs   every documented feature; a doc with no surface is a lie
 *   uiAreas       every app/src/ui feature directory
 *   dispatcherOps every public dispatcher method the UI can invoke
 *
 * A recorded entry is allowed to MOVE — this ledger says the capability still
 * exists, not that it lives where it used to. Deliberate removals are recorded
 * in the `retired` list with a reason, so a removal is a decision somebody
 * wrote down rather than an absence nobody noticed.
 *
 * Determinism: no clock, no randomness, no network.
 *
 * Usage:
 *   node script/extract-feature-ledger.mjs            # refresh the ledger
 *   node script/extract-feature-ledger.mjs --check    # fail if it would change
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = join(root, 'app', 'test', 'fixtures', 'feature-ledger.json')

const read = relativePath => readFileSync(join(root, relativePath), 'utf8')
const unique = values => [...new Set(values)].sort()

/** Every dialog the app can open. */
function popupTypes() {
  const source = read('app/src/models/popup.ts')
  const block = /export enum PopupType \{([\s\S]*?)^\}/m.exec(source)
  if (block === null) {
    throw new Error('PopupType enum not found')
  }
  return unique([...block[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\s*(?:=|,)/gm)].map(m => m[1]))
}

/** Every application-menu command id. */
function menuIds() {
  const source = read('app/src/models/menu-ids.ts')
  const start = source.indexOf('export type MenuIDs =')
  if (start < 0) {
    throw new Error('MenuIDs union not found')
  }
  // The union runs to the next top-level declaration, or to end of file — it is
  // the last thing in menu-ids.ts today, and must keep working if that changes.
  const rest = source.slice(start + 'export type MenuIDs ='.length)
  const end = rest.search(/\n(?:export|declare|type|const|function)\b/)
  const block = end < 0 ? rest : rest.slice(0, end)
  return unique([...block.matchAll(/'([^']+)'/g)].map(m => m[1]))
}

/** Every documented feature, by repository-relative path. */
function featureDocs() {
  const found = []
  const walk = directory => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.md')) {
        found.push(relative(root, full).split(sep).join('/'))
      }
    }
  }
  walk(join(root, 'docs', 'features'))
  return unique(found)
}

/** Every feature area under app/src/ui. */
function uiAreas() {
  const base = join(root, 'app', 'src', 'ui')
  return unique(
    readdirSync(base).filter(entry => {
      if (entry === 'node_modules') {
        return false
      }
      return statSync(join(base, entry)).isDirectory()
    })
  )
}

/** Every public dispatcher method the UI can call. */
function dispatcherOperations() {
  const candidates = [
    'app/src/ui/dispatcher/dispatcher.ts',
    'app/src/ui/dispatcher/index.ts',
  ]
  const file = candidates.find(candidate => existsSync(join(root, candidate)))
  if (file === undefined) {
    return []
  }
  return unique(
    [...read(file).matchAll(/^\s{2}public (?:async )?([A-Za-z0-9_]+)\s*[(<]/gm)].map(
      m => m[1]
    )
  )
}

const existing = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { retired: [] }

const ledger = {
  generatedBy: 'script/extract-feature-ledger.mjs',
  note:
    'Baseline inventory of user-facing surfaces. The conformance test iterates ' +
    'THIS ledger and demands each entry still exist, so a rewrite cannot drop a ' +
    'feature silently. An entry may move; an entry may only disappear by being ' +
    'listed in `retired` with a reason.',
  // Deliberate removals, carried forward across refreshes. Each needs a reason.
  retired: existing.retired ?? [],
  popupTypes: popupTypes(),
  menuIds: menuIds(),
  featureDocs: featureDocs(),
  uiAreas: uiAreas(),
  dispatcherOperations: dispatcherOperations(),
}

const serialized = JSON.stringify(ledger, null, 2) + '\n'

if (process.argv.includes('--check')) {
  if (!existsSync(ledgerPath) || readFileSync(ledgerPath, 'utf8') !== serialized) {
    process.stderr.write(
      'app/test/fixtures/feature-ledger.json is stale.\n' +
        'If a surface was added, re-run node script/extract-feature-ledger.mjs.\n' +
        'If a surface was REMOVED, add it to `retired` with a reason first — ' +
        'refreshing the ledger over a removal is how a feature disappears ' +
        'without anyone deciding to remove it.\n'
    )
    process.exit(1)
  }
  process.stdout.write('ok feature-ledger.json matches the tree\n')
  process.exit(0)
}

writeFileSync(ledgerPath, serialized)
process.stdout.write(
  `wrote ${ledger.popupTypes.length} dialogs, ` +
    `${ledger.menuIds.length} menu commands, ` +
    `${ledger.featureDocs.length} feature documents, ` +
    `${ledger.uiAreas.length} UI areas, ` +
    `${ledger.dispatcherOperations.length} dispatcher operations, ` +
    `${ledger.retired.length} deliberately retired\n`
)
