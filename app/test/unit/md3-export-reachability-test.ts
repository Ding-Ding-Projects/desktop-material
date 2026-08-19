import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Bulk-export REACHABILITY contract.
 *
 * Every MD3 list builds a complete export picker: the formats, the declared
 * schema, the per-format loss warning, the serializer. Each one then hands the
 * finished payload to an OPTIONAL `onExport…` prop, and draws no Export button
 * at all when that prop is absent — on the sound principle that a control which
 * cannot produce a file is not a control.
 *
 * The consequence is a silent one. Seven destinations shipped a picker that
 * nothing could reach, because nothing in `app.tsx` supplied the delivery
 * callback. Every view test passed, because a view test supplies its own
 * handler. `tsc` was clean, because the prop is optional and omitting an
 * optional prop is exactly what optional means. The button simply never
 * appeared, and no assertion anywhere was looking for it.
 *
 * So this asserts FROM the declared props AT the wiring. The direction is the
 * point: a test shaped "every supplied handler is well-formed" passes on an
 * application that supplies none of them, because it only ever iterates what
 * is already there.
 */

const root = process.cwd()
const md3 = join(root, 'app/src/ui/md3')

/**
 * Every file that hosts an MD3 view and could therefore supply a delivery
 * callback. `app.tsx` hosts the eight drawer destinations; the authenticator
 * is hosted by its settings surface instead, because it is not a destination.
 */
const HostFiles: ReadonlyArray<string> = [
  'app/src/ui/app.tsx',
  'app/src/ui/preferences/authenticator-settings.tsx',
]

const hosts = HostFiles.map(path => readFileSync(join(root, path), 'utf8'))
const app = hosts.join('\n')

/** Every optional `onExport…` prop any MD3 view declares, with its file. */
function declaredExportProps(): ReadonlyMap<string, string> {
  const found = new Map<string, string>()

  for (const entry of readdirSync(md3)) {
    if (!/\.tsx?$/.test(entry) || entry.includes('fixtures')) {
      continue
    }

    const source = readFileSync(join(md3, entry), 'utf8')
    for (const match of source.matchAll(/readonly (onExport[A-Za-z]+)\?:/g)) {
      found.set(match[1], entry)
    }
  }

  return found
}

describe('MD3 bulk export reachability', () => {
  it('finds a set of export props worth asserting against', () => {
    const declared = declaredExportProps()

    // A broken scan would find nothing and report a perfectly wired app.
    assert.ok(
      declared.size >= 6,
      `only ${declared.size} export props found; the eight list destinations ` +
        'each declare one, so a small number here is a broken scan rather ' +
        'than an application that stopped offering exports'
    )
  })

  it('supplies every declared export prop from the app', () => {
    const declared = declaredExportProps()

    // Two supply forms and no third: `prop: handler` in an object literal, and
    // `prop={handler}` in JSX. Matching a bare `prop =` as well would count
    // `private onExportSecrets = (…)` — the handler's own definition — as
    // proof that the handler is wired, which is the one thing it is not.
    const unsupplied = [...declared]
      .filter(([prop]) => !new RegExp(`\\b${prop}\\s*(?::|=\\{)`).test(app))
      .map(([prop, file]) => `${prop} (declared by ${file})`)

    assert.deepEqual(
      unsupplied,
      [],
      'these lists build a complete export picker that the running app can ' +
        'never show, because nothing supplies the callback that delivers the ' +
        `file:\n  ${unsupplied.join('\n  ')}\n` +
        'The bar hides its Export button when the callback is absent, so this ' +
        'fails silently — no type error, no failing view test, just a missing ' +
        'button.'
    )
  })

  it('delivers every list export through one writer rather than seven', () => {
    // Seven copies of "write this payload to disk" is seven chances for one
    // list's export to disagree with the others about the encoding or the
    // extension. The payload already carries everything that differs.
    //
    // The authenticator's secrets export is deliberately not one of these. It
    // writes usable secrets in the clear, so it is a separate, explicitly
    // named action behind the two-key gate, with its own save-dialog title
    // saying so. Folding it into the shared writer would put that warning
    // one refactor away from disappearing.
    const declared = [...declaredExportProps()]
      .map(([prop]) => prop)
      .filter(prop => prop !== 'onExportSecrets')

    const handlers = new Set<string>()
    for (const prop of declared) {
      const wiring = new RegExp(`\\b${prop}:\\s*(this\\.[A-Za-z0-9_]+)`).exec(
        app
      )
      if (wiring !== null) {
        handlers.add(wiring[1])
      }
    }

    assert.deepEqual(
      [...handlers],
      ['this.onMd3ListExport'],
      `expected one shared export writer, found: ${[...handlers].join(', ')}`
    )
  })

  it('keeps the secrets export on its own gated path', () => {
    const settings = readFileSync(
      join(root, 'app/src/ui/preferences/authenticator-settings.tsx'),
      'utf8'
    )

    assert.match(
      settings,
      /onExportSecrets=\{this\.onExportSecrets\}/,
      'the secrets export is unreachable: the view builds the payload behind ' +
        'the two-key gate and hands it to a callback nobody supplies'
    )

    // The save dialog is the last place a reader can notice what is about to
    // land on disk, so it must not borrow the ordinary export's title.
    assert.match(
      settings,
      /'Export authenticator secrets in the clear'/,
      'the secrets export must name itself in its save dialog rather than ' +
        'reusing the ordinary factors title, which omits the secrets'
    )
  })
})
