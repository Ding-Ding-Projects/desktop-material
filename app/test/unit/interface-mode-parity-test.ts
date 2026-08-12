import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Section parity between the two interface modes.
 *
 * Classic mode renders the repository workspace, whose tab bar reaches eleven
 * sections. Material mode renders eight destinations and has no such tab bar:
 * its `renderLegacyDestination` only ever *substitutes* for one of the eight
 * when that destination has no props, so it is a fallback rather than a route.
 *
 * The result is an asymmetry that is easy to state and was not: six sections
 * are reachable in Classic mode and by no route at all in Material mode. That
 * is a real capability difference between two interfaces the app offers as
 * equals, and it is recorded here rather than described in a comment, because
 * a comment cannot fail.
 *
 * `UnreachableInMaterialMode` is a debt list, not a permission slip. The test
 * fails when it GROWS — a ninth section stranded by the next change — and also
 * when an entry on it gains a route and is left behind, so the list keeps
 * naming only real debt.
 */

const root = process.cwd()
const md3 = join(root, 'app/src/ui/md3')

const app = readFileSync(join(root, 'app/src/ui/app.tsx'), 'utf8')

/** Everything the Material shell is built from, where a route could live. */
function materialSource(): string {
  const parts = [app]
  for (const entry of readdirSync(md3)) {
    if (/\.tsx?$/.test(entry) && !entry.includes('fixtures')) {
      parts.push(readFileSync(join(md3, entry), 'utf8'))
    }
  }
  return parts.join('\n')
}

/** Every section the classic repository workspace can show. */
function classicSections(): ReadonlyArray<string> {
  const source = readFileSync(join(root, 'app/src/lib/app-state.ts'), 'utf8')
  const block = /export enum RepositorySectionTab \{([\s\S]*?)^\}/m.exec(source)
  assert.ok(block !== null, 'RepositorySectionTab not found')
  return [...block[1].matchAll(/^\s*([A-Za-z]+),/gm)].map(match => match[1])
}

/**
 * Sections Material mode cannot reach. Empty, and meant to stay that way.
 *
 * It held six — Releases, Issues, Triage, Cheap LFS, Launchpad and the history
 * graph — each reachable in Classic mode and by no route at all in Material
 * mode. The pane menu now opens all six, so the list is empty and the two
 * modes reach the same sections.
 *
 * The list is kept rather than deleted because the assertions around it are
 * what stop the gap reopening: a section stranded by the next change fails the
 * test below instead of being noticed by a user months later.
 */
const UnreachableInMaterialMode: ReadonlyArray<string> = []

describe('interface mode section parity', () => {
  it('reads a section list worth asserting against', () => {
    // A broken read would return nothing and report perfect parity.
    const sections = classicSections()
    assert.ok(
      sections.length >= 10,
      `only ${sections.length} sections found; that is a broken read rather ` +
        'than a workspace that lost its tabs'
    )
    assert.ok(sections.includes('Changes') && sections.includes('History'))
  })

  it('names only sections that really exist', () => {
    const sections = new Set(classicSections())
    const stale = UnreachableInMaterialMode.filter(name => !sections.has(name))

    assert.deepEqual(
      stale,
      [],
      `these are recorded as unreachable but are no longer sections at all: ${stale.join(
        ', '
      )}. Remove them from the list.`
    )
  })

  it('has not stranded another section in Material mode', () => {
    const material = materialSource()
    const recorded = new Set(UnreachableInMaterialMode)

    const stranded = classicSections().filter(
      name =>
        !recorded.has(name) &&
        !new RegExp(`RepositorySectionTab\\.${name}\\b`).test(material)
    )

    assert.deepEqual(
      stranded,
      [],
      'these sections are reachable in Classic mode and by no route in ' +
        `Material mode:\n  ${stranded.join('\n  ')}\n` +
        'Give each a route from the shell, or record it in ' +
        'UnreachableInMaterialMode with the change that stranded it.'
    )
  })

  it('keeps the debt list free of sections that now have a route', () => {
    const material = materialSource()
    const reconnected = UnreachableInMaterialMode.filter(name =>
      new RegExp(`RepositorySectionTab\\.${name}\\b`).test(material)
    )

    assert.deepEqual(
      reconnected,
      [],
      `these are recorded as unreachable but now have a route: ${reconnected.join(
        ', '
      )}. Remove them, so the list keeps naming only real debt.`
    )
  })
})
