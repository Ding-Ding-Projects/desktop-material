#!/usr/bin/env node
/**
 * Build the screenshot coverage ledger for the MD3 shell.
 *
 * WHY: "replace all the screenshots" is not checkable as a sentence. A gallery
 * of 104 PNGs can be fully regenerated and still be wrong in the two ways that
 * matter — a surface the new shell introduced that nobody thought to capture,
 * and a frame that was regenerated from a build predating the change it claims
 * to show. Neither turns anything red. A reader looking at a confidently stale
 * capture has no way to tell.
 *
 * So coverage is enumerated instead. Two sources, deliberately:
 *
 *   DERIVED   the eight destinations and every menu kind come straight out of
 *             app/test/fixtures/md3-contract.json, which is itself extracted
 *             from the design contract. A destination cannot be forgotten,
 *             because the design is what supplies the list.
 *
 *   DECLARED  everything the design file does not enumerate — overlays, the
 *             universal-feature surfaces, the theme/scale/language states —
 *             is a HAND-WRITTEN list below. This half cannot be derived, and a
 *             guard that only validates the captures already present would pass
 *             on a gallery missing every one of them. Adding a surface to the
 *             product means adding a line here; that is the point, not an
 *             inconvenience.
 *
 * Each entry records the shot id, what it must show, and its status. `pending`
 * entries carry a reason and are reported as outstanding rather than silently
 * tolerated — a gap that is named is a gap somebody can close.
 *
 * Determinism: no clock, no randomness, no network.
 *
 * Usage:
 *   node script/extract-capture-coverage.mjs           # write the ledger
 *   node script/extract-capture-coverage.mjs --check   # fail if it would change
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = join(root, 'app', 'test', 'fixtures', 'md3-contract.json')
const ledgerPath = join(
  root,
  'app',
  'test',
  'fixtures',
  'capture-coverage.json'
)

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))

const slug = value =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Surfaces the design contract does not enumerate. HAND-WRITTEN ON PURPOSE —
 * see the header. Adding a user-facing surface to the app means adding a line.
 */
const DeclaredSurfaces = [
  // Shell chrome and its states
  [
    'shell-drawer-expanded',
    'The shell with the navigation drawer at 208px, labels visible',
  ],
  [
    'shell-drawer-collapsed',
    'The shell with the drawer at 68px, icon-only, labels still named to assistive technology',
  ],
  ['shell-light-theme', 'The whole shell in the light theme'],
  ['shell-dark-theme', 'The whole shell in the dark theme'],
  [
    'shell-progress-running',
    'The pane header progress bar mid-operation with its real label',
  ],
  [
    'shell-push-ahead',
    'The pane header push button in its ahead state showing the commit count',
  ],
  ['shell-push-clean', 'The pane header push button in its up-to-date state'],
  [
    'shell-repository-tabs',
    'The repository tab strip, retained and restyled, shown by default',
  ],
  [
    'shell-classic-toolbar-on',
    'The classic toolbar band with its setting enabled, the shipped default',
  ],
  [
    'shell-classic-toolbar-off',
    'The shell with the classic toolbar switched off, its actions still reachable from the pane header',
  ],

  // Overlays the contract draws
  ['overlay-compose-dialog', 'The commit composer with a summary present'],
  [
    'overlay-compose-empty-summary',
    'The composer refusing an empty summary, error border and required-summary hint',
  ],
  [
    'overlay-regex-builder',
    'The regex builder with a pattern, flags and a live match',
  ],
  [
    'overlay-regex-builder-invalid',
    'The regex builder reporting an invalid pattern',
  ],
  ['overlay-toast', 'A toast with its Undo action'],
  ['overlay-menu-filtered', 'A menu overlay filtered by its search field'],
  ['overlay-menu-regex', 'A menu overlay filtering in regex mode'],
  [
    'overlay-menu-no-match',
    'A menu overlay with an honest no-match message rather than a blank panel',
  ],

  // History detail
  ['history-commit-sheet', 'The commit detail sheet anchored over the diff'],
  [
    'history-empty-filter',
    'The History empty state after a filter matches nothing',
  ],
  [
    'diff-search-hits',
    'The diff pane with a search active, non-matching lines dimmed and the hit count shown',
  ],
  ['diff-wrap-lines', 'The diff pane with line wrapping on'],

  // Universal feature contracts
  [
    'destructive-gate-untouched',
    'The shared destructive gate before either key is turned',
  ],
  [
    'destructive-gate-both-keys',
    'The gate with both keys turned and the slider enabled',
  ],
  ['destructive-gate-complete', 'The gate after authorization'],
  ['emoji-toggle-on', 'A dialog with the emoji decoration enabled'],
  [
    'emoji-toggle-off',
    'The same dialog with emoji disabled and identical factual copy',
  ],
  [
    'docs-browser-article',
    'The in-app documentation browser rendering an article',
  ],
  [
    'docs-browser-search',
    'The documentation browser searching titles and body content',
  ],
  [
    'authenticator-registration-qr',
    'OTP registration showing the locally drawn QR and the manual secret',
  ],
  [
    'authenticator-codes',
    'The authenticator list showing a live code, its countdown and the next-code peek',
  ],
  [
    'support-tickets-form',
    'The Support Tickets form with its category and description',
  ],
  [
    'support-tickets-resolution',
    'The resolution step naming the application-data folder, with the disclosure line',
  ],
  [
    'locked-tab-affordance',
    'A locked tab keeping its readable label beside its lock affordance',
  ],
  [
    'locked-tab-unlock-prompt',
    'The anchored unlock prompt with its recovery route named',
  ],
  [
    'locked-appearance-property',
    'A locked appearance value in the appearance editor',
  ],
  ['lock-manager-list', 'The enumerable list of every lock, searchable'],

  // Language, funny level, scale and width
  ['language-english', 'The shell in English'],
  ['language-cantonese', 'The shell in playful Hong Kong Cantonese'],
  [
    'language-bilingual',
    'The shell in bilingual mode, where labels are longest',
  ],
  ['funny-level-1', 'Copy at funny level 1, fully professional'],
  [
    'funny-level-5',
    'Copy at funny level 5, maximum playfulness, facts unchanged',
  ],
  ['scale-125', 'The shell at 125% display scale'],
  ['scale-150', 'The shell at 150% display scale'],
  ['scale-200', 'The shell at 200% display scale'],
  [
    'narrow-width',
    'The shell at its narrowest supported width with nothing clipped',
  ],
]

const required = []

for (const destination of contract.destinations) {
  required.push({
    id: `destination-${slug(destination.label)}`,
    source: 'derived',
    shows: `The ${destination.label} destination as the design contract draws it`,
  })
}

for (const menu of contract.menus) {
  required.push({
    id: `menu-${slug(menu.kind)}`,
    source: 'derived',
    shows: `The ${menu.kind} menu overlay with its items and filter row`,
  })
}

for (const [id, shows] of DeclaredSurfaces) {
  required.push({ id, source: 'declared', shows })
}

const existing = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { statuses: {} }

const statuses = existing.statuses ?? {}

const ledger = {
  generatedBy: 'script/extract-capture-coverage.mjs',
  note:
    'Every surface that must carry a real capture of the built artifact. The ' +
    'destination and menu entries are derived from the design contract so one ' +
    'cannot be forgotten; the rest is hand-written, because a guard that only ' +
    'validates the captures already present passes on a gallery missing all of ' +
    'them. A capture that predates the shell it claims to show is stale, which ' +
    'is worse than absent: it is confidently wrong and the reader cannot tell.',
  // Carried forward across regenerations. An entry may be 'captured' (a real
  // frame exists), or 'pending' with a reason naming what is blocking it.
  statuses,
  requiredCount: required.length,
  required,
}

const serialized = JSON.stringify(ledger, null, 2) + '\n'

if (process.argv.includes('--check')) {
  if (
    !existsSync(ledgerPath) ||
    readFileSync(ledgerPath, 'utf8') !== serialized
  ) {
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

const derived = required.filter(entry => entry.source === 'derived').length
process.stdout.write(
  `wrote ${required.length} required captures ` +
    `(${derived} derived from the design contract, ` +
    `${required.length - derived} hand-declared)\n`
)
