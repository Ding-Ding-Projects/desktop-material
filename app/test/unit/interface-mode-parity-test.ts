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

/**
 * The two modes share one chrome.
 *
 * Classic mode was first built as a bare toolbar over the repository
 * workspace — the shape the app had before the MD3 shell existed at all. That
 * was wrong: the tip before the rewrite (`f443f3cd10`) already rendered the
 * shell, and passed `md3NoViews` so every destination fell through to the
 * classic workspace. So "classic" is this shell minus its views, not a
 * different application.
 *
 * The failure that produced was silent — the mode rendered, nothing errored,
 * it simply looked like something nobody had used. These assertions are what
 * makes the next divergence loud instead: one `<Md3Shell` in the file means
 * neither mode can grow a banner, a popup or a boundary the other lacks.
 */
describe('both interface modes render the same chrome', () => {
  it('builds the shell in exactly one place', () => {
    const occurrences = [...app.matchAll(/<Md3Shell[\s>]/g)].length
    assert.strictEqual(
      occurrences,
      1,
      'a second <Md3Shell> is a second chrome that can drift from the first'
    )
  })

  it('routes classic mode through that shared shell', () => {
    // Matched as a call rather than as a substring: `renderMd3Shell` is a
    // prefix of any longer name a rename could produce, so the parenthesis is
    // what keeps this from passing on a function that no longer exists.
    const classic = /private renderClassicApp\(\)[\s\S]{0,900}?\n  \}/.exec(app)
    assert.ok(classic !== null, 'renderClassicApp not found')
    assert.match(
      classic[0],
      /return this\.renderMd3Shell\(/,
      'classic mode must render the shared shell, not a tree of its own'
    )
  })

  it('hands classic mode the no-views set, which is the whole difference', () => {
    const classic = /private renderClassicApp\(\)[\s\S]{0,900}?\n  \}/.exec(app)
    assert.ok(classic !== null)
    assert.match(
      classic[0],
      /renderMd3Shell\(md3NoViews\)/,
      'classic mode is the shell with no MD3 views in its destinations'
    )
  })

  it('keeps the shell a single argument away from either mode', () => {
    // If `renderMd3Shell` ever stops taking the views it renders, the two
    // modes are no longer one function with one parameter between them.
    assert.match(
      app,
      /private renderMd3Shell\(views: IMd3ShellViews\)/,
      'the shell takes its views as an argument'
    )
    assert.match(app, /views=\{views\}/, 'and passes that argument through')
  })
})
