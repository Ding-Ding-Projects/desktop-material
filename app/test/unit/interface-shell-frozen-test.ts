import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'

/**
 * The interface shell is frozen.
 *
 * This is not a style rule. Twice now an agent has read a line of documentation
 * as a mandate, decided the application chrome was "missing", and rebuilt tens
 * of thousands of lines of a shell nobody asked for. Both waves were reverted.
 *
 * Prose did not stop the second one, so this is the executable version: if the
 * shell comes back, the suite goes red and says why. The list below is
 * hand-written on purpose — a rule that only inspects what it already finds
 * cannot notice a file that reappeared.
 */

const repoRoot = Path.resolve(__dirname, '..', '..', '..')
const md3Dir = Path.join(repoRoot, 'app', 'src', 'ui', 'md3')
const stylesDir = Path.join(repoRoot, 'app', 'styles', 'ui')

/** Shell modules removed on 2026-08-19. None of these may come back. */
const FORBIDDEN_SHELL_MODULES = [
  'md3-shell.tsx',
  'md3-shell-carryover.ts',
  'md3-app-header.tsx',
  'md3-navigation-rail.tsx',
  'md3-navigation-drawer.tsx',
  'md3-pane-header.tsx',
  'md3-resizable-pane.tsx',
  'md3-diff-pane.tsx',
  'md3-virtual-window.tsx',
  'md3-view-props.ts',
  'md3-destination-adapters.ts',
  'md3-menu-bindings.ts',
  'md3-changes-view.tsx',
  'md3-history-view.tsx',
  'md3-branches-view.tsx',
  'md3-repositories-view.tsx',
  'md3-actions-view.tsx',
  'md3-agents-view.tsx',
  'md3-inbox-view.tsx',
  'md3-terminal-view.tsx',
]

/** Shell stylesheets removed at the same time. */
const FORBIDDEN_SHELL_STYLESHEETS = [
  '_md3-shell.scss',
  '_md3-shell-layout.scss',
  '_md3-app-header.scss',
  '_md3-navigation-rail.scss',
  '_md3-navigation-drawer.scss',
  '_md3-pane-header.scss',
  '_md3-changes-view.scss',
  '_md3-history-view.scss',
  '_md3-branches.scss',
  '_md3-repositories.scss',
  '_md3-actions.scss',
  '_md3-agents.scss',
  '_md3-inbox.scss',
  '_md3-terminal.scss',
  '_md3-diff-pane.scss',
]

/**
 * Controls and dialogs that survived the revert and are genuinely in use. If
 * one of these disappears, the revert has been over-applied — which is the
 * opposite failure and just as worth catching.
 */
const REQUIRED_SURVIVING_MODULES = [
  'md3-primitives.tsx',
  'md3-destructive-gate.tsx',
  'md3-toast.tsx',
  'md3-regex-builder-dialog.tsx',
  'md3-locks-view.tsx',
  'md3-authenticator-view.tsx',
  'md3-support-tickets-view.tsx',
  'md3-menu-specs.ts',
  'md3-style-contract.ts',
]

describe('the interface shell stays frozen', () => {
  for (const name of FORBIDDEN_SHELL_MODULES) {
    it(`does not reintroduce app/src/ui/md3/${name}`, async () => {
      const exists = await FsAsync.access(Path.join(md3Dir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        false,
        `${name} is back. The application chrome is frozen: see "The interface shell is frozen" in AGENTS.md. If the repository owner asked for this in the current session, delete this entry deliberately and say so in the commit.`
      )
    })
  }

  for (const name of FORBIDDEN_SHELL_STYLESHEETS) {
    it(`does not reintroduce app/styles/ui/${name}`, async () => {
      const exists = await FsAsync.access(Path.join(stylesDir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        false,
        `${name} is back. The application chrome is frozen: see AGENTS.md.`
      )
    })
  }

  for (const name of REQUIRED_SURVIVING_MODULES) {
    it(`keeps the surviving control app/src/ui/md3/${name}`, async () => {
      const exists = await FsAsync.access(Path.join(md3Dir, name)).then(
        () => true,
        () => false
      )
      assert.equal(
        exists,
        true,
        `${name} is gone. Material Design 3 controls and dialogs survived the revert deliberately; only the shell was removed.`
      )
    })
  }

  it('does not let app.tsx import a shell module', async () => {
    const appSource = await FsAsync.readFile(
      Path.join(repoRoot, 'app', 'src', 'ui', 'app.tsx'),
      'utf8'
    )
    // Checked line by line rather than with one big pattern: a commented-out
    // import must not satisfy this, and a renamed symbol must not carry the old
    // name along inside a longer one. Both are ways a guard quietly stops
    // guarding, and this repository has been bitten by each of them.
    const importLines = appSource
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('import ') || line.startsWith('export '))

    for (const name of FORBIDDEN_SHELL_MODULES) {
      const base = name.replace('.tsx', '').replace('.ts', '')
      const single = "'./md3/" + base + "'"
      const double = '"./md3/' + base + '"'
      const offender = importLines.find(
        line => line.includes(single) || line.includes(double)
      )
      assert.equal(
        offender,
        undefined,
        'app.tsx imports ./md3/' +
          base +
          '. The shell is frozen: see AGENTS.md.'
      )
    }
  })
})

/**
 * The revert took stylesheet treatments too, and nothing was watching them.
 *
 * The module list above guards files that must not come back. It cannot see a
 * property restored inside a stylesheet that legitimately survived, so on
 * 2026-09-03 an agent restored the reverted dialog, banner, toast, blank-state,
 * welcome and notification-centre treatments from `0af7ce4698` and this suite
 * stayed green the whole time.
 *
 * What made that easy was not an absent guard but a present one pointing the
 * wrong way: `overlay-material-language-test.ts` asserted the reverted styling
 * still existed, so it had been red since the revert and read as a repair
 * order. It has been deleted. These markers are its replacement, pointing the
 * way the owner actually decided.
 *
 * Each marker is anchored to a whole line, so a commented-out declaration does
 * not satisfy one, and none uses a lazy `[\s\S]*?` bridge, which reaches past
 * the rule it was written for. Every marker was checked in both directions
 * before being trusted: absent from the tree as it stands, present in
 * `0af7ce4698`.
 */
const REVERTED_STYLE_MARKERS: ReadonlyArray<{
  readonly file: string
  readonly marker: RegExp
  readonly surface: string
}> = [
  {
    file: '_banners.scss',
    surface: 'the banner tonal card',
    marker: /^\s*max-width: 920px;\s*$/m,
  },
  {
    file: '_banners.scss',
    surface: 'the banner elevation',
    marker: /^\s*box-shadow: var\(--md-sys-elevation-level1\);\s*$/m,
  },
  {
    file: 'window/_toast-notification.scss',
    surface: 'the toast snackbar offset',
    marker: /^\s*bottom: 18px;\s*$/m,
  },
  {
    file: 'window/_toast-notification.scss',
    surface: 'the toast inverse surface',
    marker: /^\s*background: var\(--md-sys-color-inverse-surface\);\s*$/m,
  },
  {
    file: '_dialog.scss',
    surface: 'the dialog high container',
    marker:
      /^\s*background: var\(--md-sys-color-surface-container-high\);\s*$/m,
  },
  {
    file: '_dialog.scss',
    surface: 'the dialog header height',
    marker: /^\s*min-height: 48px;\s*$/m,
  },
  {
    file: '_no-repositories.scss',
    surface: 'the blank-state pane radius',
    marker: /^\s*border-radius: 24px;\s*$/m,
  },
  {
    file: '_no-repositories.scss',
    surface: 'the blank-state narrow stack',
    marker: /^\s*@media screen and \(max-width: 880px\) \{\s*$/m,
  },
  {
    file: '_welcome.scss',
    surface: 'the welcome narrow block',
    marker: /^\s*@media screen and \(max-width: 420px\) \{\s*$/m,
  },
  {
    file: '_notification-centre.scss',
    surface: 'the notification panel full-bleed width',
    marker: /^\s*width: calc\(100vw - 8px\);\s*$/m,
  },
]

describe('the reverted style wave stays reverted', () => {
  for (const { file, marker, surface } of REVERTED_STYLE_MARKERS) {
    it(`does not restore ${surface} in app/styles/ui/${file}`, async () => {
      const source = await FsAsync.readFile(Path.join(stylesDir, file), 'utf8')
      assert.equal(
        marker.test(source),
        false,
        `${file} has ${surface} back. That treatment was removed by 427029d9bc, ` +
          '"Revert the interface to 2026-08-07, before both MD3 waves". The current interface is Material Design 3 already; it simply is not that ' +
          'wave. Restoring it is the third unrequested rebuild AGENTS.md warns about. If the repository owner asked for it in this session, in their own ' +
          'words, delete this entry deliberately and say so in the commit.'
      )
    })
  }

  it('keeps a marker for every surface the wave touched', () => {
    // A list-based guard only checks what is on its list, so the list itself
    // needs a floor. Six stylesheets were reverted; each must still be named.
    const covered = new Set(REVERTED_STYLE_MARKERS.map(entry => entry.file))
    for (const file of [
      '_dialog.scss',
      '_banners.scss',
      'window/_toast-notification.scss',
      '_welcome.scss',
      '_no-repositories.scss',
      '_notification-centre.scss',
    ]) {
      assert.equal(
        covered.has(file),
        true,
        `${file} was part of the reverted wave and has no marker guarding it.`
      )
    }
  })
})
