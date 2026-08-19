import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'

const RawControlTags = [
  'button',
  'input',
  'textarea',
  'select',
  'details',
  'summary',
] as const

type RawControlTag = typeof RawControlTags[number]
type RawControlCounts = Readonly<Record<RawControlTag, number>>
type AuditStatus = 'clean' | 'migration-required' | 'primitive-boundary'

interface IRawControlBoundary {
  readonly expected: RawControlCounts
  readonly status: AuditStatus
}

function controls(
  expected: Partial<Record<RawControlTag, number>> = {}
): RawControlCounts {
  return {
    button: expected.button ?? 0,
    input: expected.input ?? 0,
    textarea: expected.textarea ?? 0,
    select: expected.select ?? 0,
    details: expected.details ?? 0,
    summary: expected.summary ?? 0,
  }
}

/**
 * Hand-written inventory of every current file under `ui/md3` plus the four
 * Settings surfaces confirmed by the design audit. Discovery is only a
 * backstop below: deleting an entry here still leaves an expected path which
 * fails closed, while adding a file on disk fails until it is reviewed here.
 */
const RawControlInventory: Readonly<Record<string, IRawControlBoundary>> = {
  'app/src/ui/md3/index.ts': { expected: controls(), status: 'clean' },
  'app/src/ui/md3/md3-actions-controller.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-actions-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-actions-view.tsx': {
    expected: controls({ button: 2, input: 1, select: 2 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-agents-controller.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-agents-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-agents-view.tsx': {
    expected: controls({ input: 2 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-app-header.tsx': {
    expected: controls({ button: 4 }),
    status: 'migration-required',
  },
  'app/src/ui/lib/searchable-select.tsx': {
    expected: controls({ button: 1, input: 1 }),
    status: 'primitive-boundary',
  },
  'app/src/ui/md3/md3-authenticator-capture.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-authenticator-export.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-authenticator-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-authenticator-qr.tsx': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-authenticator-registration.tsx': {
    expected: controls({ button: 2, input: 9, select: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-authenticator-view.tsx': {
    expected: controls({ button: 1, input: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-branches-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-branches-view.tsx': {
    expected: controls({ button: 1, input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-bulk-bar.tsx': {
    expected: controls({ input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-changes-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-changes-view.tsx': {
    expected: controls({ button: 4, input: 2, textarea: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-compose-dialog.tsx': {
    expected: controls({ button: 2, input: 1, textarea: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-destination-adapters.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-destructive-actions.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-destructive-gate.tsx': {
    expected: controls({ input: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-diff-pane.tsx': {
    expected: controls({ button: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-list-export.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-list-selection.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-history-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-history-view.tsx': {
    expected: controls({ button: 5, input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-inbox-controller.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-inbox-export.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-inbox-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-inbox-view.tsx': {
    expected: controls({ input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-lock-menu-items.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-lock-removal-gate.tsx': {
    expected: controls({ input: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-lock-setup-dialog.tsx': {
    expected: controls({ button: 1, input: 8 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-lock-unlock-prompt.tsx': {
    expected: controls({ button: 1, input: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-locks-view.tsx': {
    expected: controls({ input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-menu-overlay.tsx': {
    expected: controls({ button: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-menu-bindings.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-menu-specs.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-navigation-drawer.tsx': {
    expected: controls({ button: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-navigation-rail.tsx': {
    expected: controls({ button: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-pane-header.tsx': {
    expected: controls({ button: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-primitives.tsx': {
    expected: controls({
      button: 6,
      input: 3,
      textarea: 1,
      details: 1,
      summary: 1,
    }),
    status: 'primitive-boundary',
  },
  'app/src/ui/md3/md3-regex-builder-dialog.tsx': {
    expected: controls({ button: 3, input: 2 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-repositories-controller.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-repositories-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-repositories-view.tsx': {
    expected: controls({ button: 3, input: 5 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-resizable-pane.tsx': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-shell-carryover.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-shell.tsx': { expected: controls(), status: 'clean' },
  'app/src/ui/md3/md3-style-contract.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-support-ticket-delete-gate.tsx': {
    expected: controls({ input: 3 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-support-ticket-entry.tsx': {
    expected: controls({ button: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-support-tickets-view.tsx': {
    expected: controls({
      input: 4,
      textarea: 1,
      details: 1,
      summary: 1,
    }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-toast.tsx': {
    expected: controls({ button: 2 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-terminal-controller.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-terminal-view-fixtures.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/md3/md3-terminal-view.tsx': {
    expected: controls({ button: 1, input: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/md3/md3-view-props.ts': { expected: controls(), status: 'clean' },
  'app/src/ui/md3/md3-virtual-window.ts': {
    expected: controls(),
    status: 'clean',
  },
  'app/src/ui/preferences/authenticator-settings.tsx': {
    expected: controls({ button: 2, details: 1, summary: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/preferences/surface-locks.tsx': {
    expected: controls({ button: 2, details: 1, summary: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/preferences/personal-vocabulary-control.tsx': {
    expected: controls({ details: 1, summary: 1 }),
    status: 'migration-required',
  },
  'app/src/ui/preferences/school-mode.tsx': {
    expected: controls({ details: 1, summary: 1 }),
    status: 'migration-required',
  },
}

const ConfirmedSettingsSurfaces = [
  'app/src/ui/preferences/authenticator-settings.tsx',
  'app/src/ui/preferences/surface-locks.tsx',
  'app/src/ui/preferences/personal-vocabulary-control.tsx',
  'app/src/ui/preferences/school-mode.tsx',
] as const

function countRawControls(path: string, source: string): RawControlCounts {
  const counts = controls() as Record<RawControlTag, number>
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(sourceFile) as RawControlTag
      if (RawControlTags.includes(name)) {
        counts[name] += 1
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return counts
}

function assertExpectedBoundaries(sources: ReadonlyMap<string, string>): void {
  for (const [path, boundary] of Object.entries(RawControlInventory)) {
    const source = sources.get(path)
    assert.ok(source !== undefined, `Missing audited surface ${path}`)
    const actual = countRawControls(path, source)
    assert.deepStrictEqual(
      actual,
      boundary.expected,
      `${path} raw controls changed; migrate through the shared MD3 primitives ` +
        'or update this reviewed exact boundary'
    )

    const count = Object.values(actual).reduce(
      (total, value) => total + value,
      0
    )
    assert.strictEqual(
      count === 0,
      boundary.status === 'clean',
      `${path} must be clean exactly when its inventory says clean`
    )
    if (boundary.status === 'primitive-boundary') {
      assert.ok(
        [
          'app/src/ui/lib/searchable-select.tsx',
          'app/src/ui/md3/md3-primitives.tsx',
        ].includes(path),
        'Only the two shared primitive implementations may own raw control anatomy'
      )
    }
  }
}

function loadAuditedSources(): Map<string, string> {
  return new Map(
    Object.keys(RawControlInventory).map(path => [
      path,
      readFileSync(join(process.cwd(), path), 'utf8'),
    ])
  )
}

describe('MD3 raw control exact-boundary audit', () => {
  it('hand-writes every ui/md3 file and the four confirmed Settings surfaces', () => {
    const discoveredMd3 = readdirSync(join(process.cwd(), 'app/src/ui/md3'), {
      withFileTypes: true,
    })
      .filter(
        entry =>
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      )
      .map(entry => `app/src/ui/md3/${entry.name}`)
      .sort()
    const inventoriedMd3 = Object.keys(RawControlInventory)
      .filter(path => path.startsWith('app/src/ui/md3/'))
      .sort()

    assert.deepStrictEqual(
      inventoriedMd3,
      discoveredMd3,
      'Every ui/md3 source must be reviewed in the hand-written raw-control inventory'
    )
    assert.deepStrictEqual(
      Object.keys(RawControlInventory).filter(path =>
        path.startsWith('app/src/ui/preferences/')
      ),
      [...ConfirmedSettingsSurfaces]
    )
  })

  it('matches every reviewed raw control boundary exactly', () => {
    assertExpectedBoundaries(loadAuditedSources())
  })

  it('turns red for a missing surface or one added raw control, then green when restored', () => {
    const original = loadAuditedSources()
    assert.doesNotThrow(() => assertExpectedBoundaries(original))

    const missing = new Map(original)
    missing.delete('app/src/ui/preferences/personal-vocabulary-control.tsx')
    assert.throws(
      () => assertExpectedBoundaries(missing),
      /Missing audited surface app\/src\/ui\/preferences\/personal-vocabulary-control\.tsx/
    )

    const added = new Map(original)
    const schoolMode = 'app/src/ui/preferences/school-mode.tsx'
    added.set(
      schoolMode,
      `${original.get(
        schoolMode
      )}\nconst rawControlProbe = <button type="button" />\n`
    )
    assert.throws(
      () => assertExpectedBoundaries(added),
      /school-mode\.tsx raw controls changed/
    )

    assert.doesNotThrow(() => assertExpectedBoundaries(original))
  })
})
