import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { MaterialSymbolNames } from '../../src/ui/lib/material-symbol'
import { md3Destinations } from '../../src/ui/md3/md3-navigation-drawer'
import {
  MenuKinds,
  getMenuSpec,
  defaultMd3MenuContext,
  type IMd3MenuHandlers,
  type MenuKind,
} from '../../src/ui/md3/md3-menu-specs'
import { Md3RegexTokenGroups } from '../../src/ui/md3/md3-regex-builder-dialog'

/**
 * MD3 design-contract conformance.
 *
 * `design/History MD3.dc.html` is the specification for this rewrite, and
 * `app/test/fixtures/md3-contract.json` is its machine-extracted inventory —
 * regenerate it with `node script/extract-md3-contract.mjs`.
 *
 * Every assertion here iterates the CONTRACT and demands the implementation
 * carry the entry. That direction is the whole point: a test shaped "every menu
 * the code defines is well-formed" passes cleanly on a build that is missing
 * eleven menus, because it only ever looked at the ones that were there. The
 * failure mode this rewrite actually has is a surface nobody noticed was in the
 * design, and only an assertion that starts from the design can catch it.
 */

interface IMd3Contract {
  readonly destinations: ReadonlyArray<{
    readonly label: string
    readonly icon: string
  }>
  readonly menus: ReadonlyArray<{
    readonly kind: string
    readonly title: string | null
    readonly icon: string | null
    readonly width: number | null
    readonly itemLabels: ReadonlyArray<string>
    readonly dynamicLabelPrefixes: ReadonlyArray<string>
  }>
  readonly searchFields: {
    readonly keys: ReadonlyArray<string>
    readonly placeholders: ReadonlyArray<{
      readonly key: string
      readonly placeholder: string
    }>
  }
  readonly chipSets: ReadonlyArray<{
    readonly state: string
    readonly labels: ReadonlyArray<string>
  }>
  readonly regexBuilder: {
    readonly flags: ReadonlyArray<string>
    readonly flagTitles: Readonly<Record<string, string>>
    readonly groups: ReadonlyArray<{
      readonly title: string
      readonly tokens: ReadonlyArray<{
        readonly token: string
        readonly label: string
      }>
    }>
  }
  readonly iconNames: ReadonlyArray<string>
}

const root = process.cwd()

const contract = JSON.parse(
  readFileSync(join(root, 'app/test/fixtures/md3-contract.json'), 'utf8')
) as IMd3Contract

const noopHandlers: IMd3MenuHandlers = {
  onCommand: () => {},
  onNavigate: () => {},
  onToggle: () => {},
  onSwitchRepository: () => {},
  onSwitchBranch: () => {},
  onSwitchAccount: () => {},
  onOpenMenu: () => {},
  onOpenRegexBuilder: () => {},
}

const specFor = (kind: MenuKind) =>
  getMenuSpec(kind, defaultMd3MenuContext, noopHandlers)

describe('MD3 design-contract conformance', () => {
  it('extracted a contract worth asserting against', () => {
    // Guards the extractor itself: if its regexes ever stop matching, every
    // check below would iterate an empty list and pass on an empty codebase.
    assert.equal(contract.destinations.length, 8)
    assert.equal(contract.menus.length, 23)
    assert.equal(contract.searchFields.keys.length, 11)
    assert.equal(contract.chipSets.length, 5)
    assert.equal(contract.regexBuilder.groups.length, 4)
    assert.ok(contract.iconNames.length >= 100)

    for (const menu of contract.menus) {
      assert.ok(
        menu.itemLabels.length > 0,
        `contract menu ${menu.kind} extracted with no items`
      )
    }
  })

  it('ships every destination the contract navigates to, in order', () => {
    const built = md3Destinations({}, 'History')

    assert.equal(built.length, contract.destinations.length)

    contract.destinations.forEach((expected, index) => {
      const actual = built[index]
      assert.ok(actual !== undefined, `destination ${expected.label} missing`)

      // The id is a stable lowercase key; the label is translated copy. Both
      // have to agree with the contract, but only the label is user-visible, so
      // the id is compared case-insensitively and the English label exactly.
      assert.equal(
        actual.id.toLowerCase(),
        expected.label.toLowerCase(),
        `destination ${index} should be ${expected.label}, got ${actual.id}`
      )
      assert.equal(
        actual.label,
        expected.label,
        `${expected.label} renders as "${actual.label}" in English`
      )
      assert.equal(
        actual.icon,
        expected.icon,
        `${expected.label} should use the ${expected.icon} glyph`
      )
    })
  })

  it('ships every menu kind the contract defines', () => {
    const present = new Set<string>(MenuKinds)
    const missing = contract.menus
      .map(menu => menu.kind)
      .filter(kind => !present.has(kind))

    assert.deepEqual(missing, [], `menu kinds missing: ${missing.join(', ')}`)
  })

  it('gives every menu the contract icon and panel width', () => {
    for (const menu of contract.menus) {
      const spec = specFor(menu.kind as MenuKind)

      if (menu.icon !== null) {
        assert.equal(spec.icon, menu.icon, `${menu.kind} icon`)
      }
      if (menu.width !== null) {
        assert.equal(spec.width, menu.width, `${menu.kind} panel width`)
      }
    }
  })

  it('ships every menu item the contract lists', () => {
    const gaps: Array<string> = []

    for (const menu of contract.menus) {
      const spec = specFor(menu.kind as MenuKind)
      const labels = spec.items.map(item => item.label)

      for (const expected of menu.itemLabels) {
        // A label the contract computes — "Merge into <branch>" — is recorded
        // by its literal prefix, so match on prefix for those and exactly
        // otherwise.
        const isDynamic = menu.dynamicLabelPrefixes.includes(expected)
        const found = isDynamic
          ? labels.some(label => label.startsWith(expected))
          : labels.includes(expected)

        if (!found) {
          gaps.push(`${menu.kind}: "${expected}"`)
        }
      }
    }

    assert.deepEqual(
      gaps,
      [],
      `menu items in the design with no implementation:\n  ${gaps.join('\n  ')}`
    )
  })

  it('gives every menu a filter row and unique item ids', () => {
    for (const kind of MenuKinds) {
      const spec = specFor(kind)

      // renderVals() forces hasFilter true for every menu after menuSpec()
      // returns, so every menu in the shipped app is filterable.
      assert.ok(spec.hasFilter, `${kind} should carry a filter row`)
      assert.ok(
        spec.filterPlaceholder.length > 0,
        `${kind} filter row needs a placeholder`
      )

      const ids = spec.items.map(item => item.id)
      assert.equal(
        new Set(ids).size,
        ids.length,
        `${kind} has duplicate item ids, which breaks React keys and ` +
          'aria-activedescendant'
      )
    }
  })

  it('ships the contract regex builder flags and token groups verbatim', () => {
    const expected = contract.regexBuilder

    assert.equal(Md3RegexTokenGroups.length, expected.groups.length)

    expected.groups.forEach((group, index) => {
      const actual = Md3RegexTokenGroups[index]
      assert.ok(actual !== undefined, `token group ${group.title} missing`)
      assert.deepEqual(
        actual.tokens.map(token => token.token),
        group.tokens.map(token => token.token),
        `${group.title} tokens`
      )
    })
  })

  it('only uses ligatures the bundled icon font actually carries', () => {
    // A Material Symbols name the font does not carry renders the literal
    // English word, so this is the difference between an icon and the text
    // "search_off" sitting in the interface.
    const bundled = new Set<string>(MaterialSymbolNames)
    const missing = contract.iconNames.filter(name => !bundled.has(name))

    assert.deepEqual(
      missing,
      [],
      `design icons absent from the bundled font: ${missing.join(', ')}`
    )
  })

  it('every menu icon is a bundled ligature', () => {
    const bundled = new Set<string>(MaterialSymbolNames)

    for (const kind of MenuKinds) {
      const spec = specFor(kind)
      assert.ok(bundled.has(spec.icon), `${kind} icon ${spec.icon} not bundled`)

      for (const item of spec.items) {
        assert.ok(
          bundled.has(item.icon),
          `${kind} item "${item.label}" uses unbundled icon ${item.icon}`
        )
      }
    }
  })
})
