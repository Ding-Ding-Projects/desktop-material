#!/usr/bin/env node
/**
 * Build the capture ledger for the current frozen desktop renderer.
 *
 * The previous generator derived its rows from an MD3 design-contract fixture
 * removed with the reverted shell. That made the ledger non-runnable and
 * misleading: it requested evidence for views that are not the current UI.
 *
 * This is a hand-written current-renderer list. A pending row is capture debt,
 * not a claim that an historical gallery image remains representative. Do not
 * set a row to `captured` without a real packaged Windows capture and commit.
 *
 * Usage:
 *   node script/extract-capture-coverage.mjs
 *   node script/extract-capture-coverage.mjs --check
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = join(
  root,
  'app',
  'test',
  'fixtures',
  'capture-coverage.json'
)

/** Current source boundaries for the frozen desktop UI. */
const CurrentCaptureSurfaces = [
  ['workspace-changes', 'Changes in the frozen desktop workspace.', ['app/src/ui/changes/changes.tsx']],
  ['workspace-history', 'History in the frozen desktop workspace.', ['app/src/ui/history/history-graph-view.tsx']],
  ['workspace-branches', 'Branches in the frozen desktop workspace.', ['app/src/ui/branches/branches-container.tsx']],
  ['preferences-appearance', 'Appearance preferences in the current Settings surface.', ['app/src/ui/preferences/appearance.tsx']],
  ['preferences-sound', 'Sound preferences including the narrator group.', ['app/src/ui/preferences/sound.tsx']],
  ['preferences-attention', 'Attention accommodations in the current Preferences surface.', ['app/src/ui/preferences/preferences.tsx', 'app/src/ui/preferences/attention-accommodations.tsx']],
  ['command-palette', 'The current command palette over the frozen renderer.', ['app/src/ui/command-palette/command-palette.tsx']],
  ['settings-search', 'Current Settings search and its anchored regex route.', ['app/src/ui/preferences/preferences.tsx', 'app/src/lib/settings-search/settings-search-catalog.ts']],
  ['toy-lock-disabled-target', 'A locked target that remains aria-disabled and does not activate its action.', ['app/src/ui/appearance/appearance-lock-gate.ts', 'app/src/ui/repository-tabs/repository-tab.tsx']],
  ['toy-lock-unlock-prompt', 'The anchored toy-lock prompt after an attempted activation.', ['app/src/ui/appearance/appearance-lock-prompt-host.tsx', 'app/src/ui/md3/md3-lock-unlock-prompt.tsx']],
  ['toy-lock-appearance-value', 'A locked appearance value in the existing appearance editor.', ['app/src/ui/appearance/appearance-lock-gate.ts', 'app/src/ui/appearance/appearance-editor-panel.tsx']],
  ['school-mode-active', 'The current renderer with School mode active and restricted controls omitted.', ['app/src/ui/app.tsx', 'app/src/ui/preferences/appearance.tsx', 'app/src/lib/school-mode.ts']],
  ['school-mode-renamed-discovery', 'The renamed School mode result in Settings search and the command palette.', ['app/src/lib/settings-search/settings-search-catalog.ts', 'app/src/lib/command-palette-catalog.ts']],
  ['narrator-voice-automatic', 'The Sound pane with per-language narrator pickers and automatic status.', ['app/src/ui/preferences/sound.tsx', 'app/src/lib/audio/narrator-voices.ts']],
  ['narrator-voice-unavailable', 'The Sound pane reporting a missing or unavailable compatible narrator voice.', ['app/src/ui/preferences/sound.tsx', 'app/src/lib/audio/narrator-voices.ts']],
  ['attention-focus', 'Focus accommodation applied without hiding inactive content.', ['app/src/ui/preferences/attention-accommodations.tsx', 'app/src/ui/app.tsx']],
  ['attention-low-stimulation', 'Low stimulation accommodation applied to the current renderer.', ['app/src/ui/preferences/attention-accommodations.tsx', 'app/src/ui/app.tsx']],
  ['attention-time-awareness', 'Time awareness facts in the current renderer.', ['app/src/ui/preferences/attention-accommodations.tsx', 'app/src/ui/app.tsx']],
  ['attention-one-thing', 'The persisted One thing at a time next-action control.', ['app/src/ui/preferences/attention-accommodations.tsx']],
  ['attention-momentum', 'The non-blocking Momentum prompt and its defer control.', ['app/src/ui/preferences/attention-accommodations.tsx', 'app/src/ui/app.tsx']],
  ['support-tickets-help-route', 'The existing About or Help route opening the local Support Tickets desk.', ['app/src/ui/about/about.tsx', 'app/src/ui/app.tsx', 'app/src/ui/md3/md3-support-tickets-view.tsx']],
  ['support-tickets-resolution', 'The Support Tickets resolution that names and opens the application-data folder.', ['app/src/ui/md3/md3-support-tickets-view.tsx', 'app/src/lib/support-ticket-recovery.ts']],
  ['authenticator-history', 'The Authenticator Settings history route with redacted metadata only.', ['app/src/ui/preferences/authenticator-settings.tsx', 'app/src/ui/version-history/versioned-store-history.tsx', 'app/src/lib/stores/authenticator-store.ts']],
  ['publish-account-selection', 'Publish repository retaining the selected GitHub.com account.', ['app/src/ui/publish-repository/publish.tsx', 'app/src/ui/publish-repository/publish-repository.tsx']],
  ['publish-organization-retry', 'Organization lookup failure with personal-account fallback and retry.', ['app/src/ui/publish-repository/publish.tsx', 'app/src/ui/publish-repository/publish-repository.tsx']],
  ['publish-reauthentication', 'Classified 401 recovery without automatic re-submission.', ['app/src/ui/publish-repository/publish.tsx', 'app/src/ui/publish-repository/publish-repository.tsx']],
]

const existing = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { statuses: {} }
const priorStatuses = existing.statuses ?? {}

const required = CurrentCaptureSurfaces.map(([id, shows, sourcePaths]) => ({
  id,
  source: 'current-renderer',
  shows,
  sourcePaths,
}))

const statuses = Object.fromEntries(
  required.map(surface => {
    const prior = priorStatuses[surface.id]
    if (prior?.state === 'captured') {
      return [surface.id, prior]
    }
    return [
      surface.id,
      {
        state: 'pending',
        reason:
          'No packaged Windows capture exists at or after frozen baseline ' +
          'a5b74008b61094ca9af8c74b893bbfd696feb3cd; historical gallery frames ' +
          'do not prove this current renderer state.',
      },
    ]
  })
)

const ledger = {
  generatedBy: 'script/extract-capture-coverage.mjs',
  baseline: 'a5b74008b61094ca9af8c74b893bbfd696feb3cd',
  note:
    'Current capture coverage for the frozen desktop renderer. This is a ' +
    'hand-written inventory of current source boundaries, not a derivation ' +
    'from the removed MD3 shell contract. Pending means no real packaged ' +
    'Windows capture exists; it does not license a stale gallery frame.',
  statuses,
  requiredCount: required.length,
  required,
}

const serialized = JSON.stringify(ledger, null, 2) + '\n'

if (process.argv.includes('--check')) {
  if (!existsSync(ledgerPath) || readFileSync(ledgerPath, 'utf8') !== serialized) {
    process.stderr.write(
      'app/test/fixtures/capture-coverage.json is stale; re-run ' +
        'node script/extract-capture-coverage.mjs\n'
    )
    process.exit(1)
  }
  process.stdout.write('ok capture-coverage.json matches\n')
  process.exit(0)
}

writeFileSync(ledgerPath, serialized)
process.stdout.write(`wrote ${required.length} current capture rows\n`)
