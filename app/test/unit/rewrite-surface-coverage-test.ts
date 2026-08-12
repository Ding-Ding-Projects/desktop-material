import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import {
  IRewriteSurface,
  RewriteSurfaces,
} from '../../src/lib/rewrite-surface-registry'
import {
  CommandPaletteCatalog,
  IPaletteCommand,
  resolvePaletteHome,
} from '../../src/lib/command-palette-catalog'
import {
  SettingsSearchCatalog,
  settingsSearchEntry,
} from '../../src/lib/settings-search/settings-search-catalog'
import {
  TeleportTargetSelectors,
  teleportTargetSelector,
} from '../../src/lib/teleport-targets'

const src = Path.resolve(__dirname, '../../src')

function commandFor(surface: IRewriteSurface): IPaletteCommand | undefined {
  return CommandPaletteCatalog.find(
    command => command.event === surface.paletteEvent
  )
}

describe('rewrite surface coverage', () => {
  // The registry is the point of this file. A guard that walks the palette
  // catalog and checks the rows it finds passes on an app that registers
  // nothing, so the enumeration is written by hand and the catalog is checked
  // against it rather than the other way round.
  it('names every surface the rewrite added', () => {
    const ids = RewriteSurfaces.map(surface => surface.id)
    assert.equal(
      new Set(ids).size,
      ids.length,
      'two surfaces share one id, so one of them is never really checked'
    )

    const destinations = RewriteSurfaces.filter(
      surface => surface.kind === 'destination'
    )
    assert.equal(
      destinations.length,
      8,
      'the shell has eight destinations; the registry must hold all eight'
    )

    for (const id of [
      'docs-browser',
      'authenticator',
      'surface-locks',
      'support-tickets',
      'setting-classic-toolbar',
      'setting-dialog-emoji',
    ]) {
      assert.ok(
        ids.includes(id),
        `${id} must stay in the registry — dropping it silently drops its coverage`
      )
    }
  })

  it('gives every registered surface a palette row', () => {
    for (const surface of RewriteSurfaces) {
      const command = commandFor(surface)
      assert.notEqual(
        command,
        undefined,
        `${surface.id} has no palette row (${surface.paletteEvent})`
      )
      assert.ok(
        (command?.title.length ?? 0) > 0,
        `${surface.id}'s palette row has no title`
      )
    }
  })

  it('lands each palette row on the exact element, never a general page', () => {
    for (const surface of RewriteSurfaces) {
      const command = commandFor(surface)
      assert.notEqual(command, undefined)
      const home = resolvePaletteHome(command as IPaletteCommand)

      if (surface.dialogHosted === true) {
        // A dialog-hosted surface arrives by opening: there is no element
        // inside it to spotlight until it exists.
        assert.equal(
          surface.teleportTargetId,
          undefined,
          `${surface.id} claims to be its own dialog and also names a target`
        )
        assert.equal(
          home.kind === 'surface' ? home.openEvent : undefined,
          'self',
          `${surface.id} must open itself when chosen`
        )
        continue
      }

      assert.notEqual(
        surface.teleportTargetId,
        undefined,
        `${surface.id} is neither dialog-hosted nor anchored to an element`
      )
      assert.equal(
        home.targetId,
        surface.teleportTargetId,
        `${surface.paletteEvent} must spotlight ${surface.teleportTargetId}`
      )
    }
  })

  it('resolves every registered teleport target to a real selector', () => {
    for (const surface of RewriteSurfaces) {
      const targetId = surface.teleportTargetId
      if (targetId === undefined) {
        continue
      }
      assert.ok(
        targetId in TeleportTargetSelectors,
        `${targetId} is not a teleport target`
      )
      assert.ok(
        teleportTargetSelector(targetId).length > 0,
        `${targetId} resolves to an empty selector`
      )
    }
  })

  it('renders the anchor every registered teleport target names', async () => {
    // A selector nothing renders is a teleport that quietly lands nowhere and
    // reports "the surface never appeared". The anchor is looked for in the
    // source that owns the surface rather than in a rendered DOM, so this
    // stays a node-only test.
    const sources = await Promise.all(
      [
        'ui/preferences/appearance.tsx',
        'ui/preferences/advanced.tsx',
        'ui/preferences/school-mode.tsx',
        'ui/preferences/surface-locks.tsx',
        'ui/preferences/authenticator-settings.tsx',
        'ui/md3/md3-navigation-drawer.tsx',
      ].map(relative => readFile(Path.join(src, relative), 'utf8'))
    )
    const haystack = sources.join('\n')

    for (const surface of RewriteSurfaces) {
      const targetId = surface.teleportTargetId
      if (targetId === undefined) {
        continue
      }
      const selector = teleportTargetSelector(targetId)
      // Both flavours of hook: an explicit `teleportAnchor('...')` call, and a
      // structural attribute the surface already renders for its own reasons.
      const anchor = /^\[data-teleport-target="(.+)"\]$/.exec(selector)
      const destination = /^\[data-destination-id="(.+)"\]$/.exec(selector)
      if (anchor !== null) {
        assert.ok(
          haystack.includes(`teleportAnchor('${anchor[1]}')`),
          `${targetId} names ${selector}, which no settings surface renders`
        )
      } else if (destination !== null) {
        assert.ok(
          haystack.includes('data-destination-id'),
          `${targetId} names ${selector}, which the drawer does not render`
        )
      } else {
        assert.fail(`${targetId} uses an unrecognized selector shape`)
      }
    }
  })

  it('makes every Settings-hosted surface findable in settings search', () => {
    for (const surface of RewriteSurfaces) {
      const entryId = surface.settingsSearchEntryId
      if (entryId === undefined) {
        // Only a drawer destination and the documentation browser may skip
        // this, and both do so because a settings-search result navigates
        // inside the Settings dialog.
        assert.ok(
          surface.kind === 'destination' || surface.dialogHosted === true,
          `${surface.id} lives in Settings and must be findable there`
        )
        continue
      }

      const entry = settingsSearchEntry(entryId)
      assert.notEqual(
        entry,
        undefined,
        `${surface.id} names settings-search entry ${entryId}, which does not exist`
      )
      assert.equal(
        entry?.teleportTargetId,
        surface.teleportTargetId,
        `${entryId} must land on the same row its palette row does`
      )
    }
  })

  it('lands a settings-search result on the row rather than the tab', async () => {
    // The regression this replaces: choosing a result selected the tab and
    // stopped, so a reader who searched "classic toolbar" arrived at the top
    // of a dozen-section Appearance tab with the row still to find. Only two
    // entry ids were special-cased; every other one went nowhere in
    // particular.
    const source = await readFile(
      Path.join(src, 'ui/preferences/preferences.tsx'),
      'utf8'
    )
    assert.match(
      source,
      /settingsSearchEntry\(entryId\)\?\.teleportTargetId/,
      'the Settings dialog must read the target off the catalog entry'
    )
    assert.match(
      source,
      /void teleportTo\(target\)/,
      'the Settings dialog must teleport to that target'
    )
  })

  it('keeps every settings-search target a real teleport target', () => {
    for (const entry of SettingsSearchCatalog) {
      if (entry.teleportTargetId === undefined) {
        continue
      }
      assert.ok(
        entry.teleportTargetId in TeleportTargetSelectors,
        `${entry.id} names ${entry.teleportTargetId}, which is not a teleport target`
      )
    }
  })

  it('explains each new settings row and states where its value came from', async () => {
    // Progressive disclosure plus a provenance line naming the real value.
    // Checked per surface rather than "every explanation present is
    // well-formed", which passes on a row that has none.
    const expectations: ReadonlyArray<{
      readonly file: string
      readonly summaryKey: string
      readonly explanationKey: string
      readonly provenanceKeys: ReadonlyArray<string>
    }> = [
      {
        file: 'ui/preferences/appearance.tsx',
        summaryKey: 'classicToolbar.explanationSummary',
        explanationKey: 'classicToolbar.explanation',
        provenanceKeys: [
          'classicToolbar.provenanceStored',
          'classicToolbar.provenanceDefault',
        ],
      },
      {
        file: 'ui/preferences/appearance.tsx',
        summaryKey: 'dialogEmoji.explanationSummary',
        explanationKey: 'dialogEmoji.explanation',
        provenanceKeys: [
          'dialogEmoji.provenanceStored',
          'dialogEmoji.provenanceDefault',
        ],
      },
      {
        file: 'ui/preferences/surface-locks.tsx',
        summaryKey: 'surfaceLocks.explanationSummary',
        explanationKey: 'surfaceLocks.explanation',
        provenanceKeys: [
          'surfaceLocks.provenanceNone',
          'surfaceLocks.provenanceOne',
          'surfaceLocks.provenanceMany',
        ],
      },
      {
        file: 'ui/preferences/authenticator-settings.tsx',
        summaryKey: 'authenticatorSettings.explanationSummary',
        explanationKey: 'authenticatorSettings.explanation',
        provenanceKeys: [
          'authenticatorSettings.provenanceNone',
          'authenticatorSettings.provenanceOne',
          'authenticatorSettings.provenanceMany',
        ],
      },
      {
        file: 'ui/preferences/school-mode.tsx',
        summaryKey: 'supportTicketsSetting.explanationSummary',
        explanationKey: 'supportTicketsSetting.explanation',
        provenanceKeys: [
          'supportTicketsSetting.provenanceNone',
          'supportTicketsSetting.provenanceOne',
          'supportTicketsSetting.provenanceMany',
        ],
      },
    ]

    for (const expectation of expectations) {
      const source = await readFile(
        Path.join(src, expectation.file),
        'utf8'
      )
      assert.ok(
        source.includes('<details'),
        `${expectation.file} must put its explanation behind progressive disclosure`
      )
      assert.ok(
        source.includes(`'${expectation.summaryKey}'`),
        `${expectation.summaryKey} is not rendered by ${expectation.file}`
      )
      assert.ok(
        source.includes(`'${expectation.explanationKey}'`),
        `${expectation.explanationKey} is not rendered by ${expectation.file}`
      )
      for (const key of expectation.provenanceKeys) {
        assert.ok(
          source.includes(`'${key}'`),
          `${key} is not rendered by ${expectation.file}`
        )
      }
    }
  })

  it('never says "default" where a real value belongs', async () => {
    // The provenance line exists to name the value, so a line that says the
    // word and nothing else is the failure it was written against.
    const resources = await readFile(
      Path.join(src, 'lib/i18n-resources.ts'),
      'utf8'
    )
    for (const key of [
      'surfaceLocks.provenanceNone',
      'surfaceLocks.provenanceOne',
      'surfaceLocks.provenanceMany',
      'authenticatorSettings.provenanceNone',
      'authenticatorSettings.provenanceOne',
      'authenticatorSettings.provenanceMany',
      'supportTicketsSetting.provenanceNone',
      'supportTicketsSetting.provenanceOne',
      'supportTicketsSetting.provenanceMany',
    ]) {
      const occurrences = resources.split(`'${key}':`).length - 1
      assert.equal(
        occurrences,
        2,
        `${key} must be translated in both catalogues, found ${occurrences}`
      )
    }
  })
})
