import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import {
  CollapsedRepositoryGroupsKey,
  countAutoExpandedRepositoryGroups,
  getCollapsedRepositoryGroups,
  isRepositoryFilterActive,
  isRepositoryGroupCollapsed,
  MaximumCollapsedRepositoryGroups,
  setCollapsedRepositoryGroups,
  setRepositoryGroupCollapsed,
} from '../../src/lib/stores/repository-group-collapse'
import { profileSettingsRegistry } from '../../src/lib/profiles/profile-settings-registry'
import {
  getAutoExpandedGroupsSegments,
  getRepositoryGroupAccessibleName,
  repositoryGroupRowsId,
} from '../../src/ui/repositories-list/repository-group-header'
import { getGroupKey } from '../../src/ui/repositories-list/group-repositories'

const funny = { english: 1, cantonese: 1 }

describe('repository group collapse persistence', () => {
  beforeEach(() => localStorage.clear())

  it('is a registered profile setting so folds reach settings history', () => {
    const entry = profileSettingsRegistry.find(
      setting => setting.key === CollapsedRepositoryGroupsKey
    )

    assert.notEqual(
      entry,
      undefined,
      'collapsed groups must be snapshotted into the profile settings file'
    )
    assert.equal(entry?.label, 'collapsed repository groups')
  })

  it('round-trips a toggled group through storage', () => {
    assert.deepEqual(getCollapsedRepositoryGroups(), [])

    assert.deepEqual(setRepositoryGroupCollapsed('5:other', true), ['5:other'])
    assert.deepEqual(getCollapsedRepositoryGroups(), ['5:other'])

    assert.deepEqual(setRepositoryGroupCollapsed('5:other', false), [])
    assert.deepEqual(getCollapsedRepositoryGroups(), [])
  })

  it('stores a sorted, deduped set so the settings diff reads cleanly', () => {
    setRepositoryGroupCollapsed('5:other', true)
    setRepositoryGroupCollapsed('1:recent', true)
    setRepositoryGroupCollapsed('5:other', true)

    assert.deepEqual(getCollapsedRepositoryGroups(), ['1:recent', '5:other'])
    assert.equal(
      localStorage.getItem(CollapsedRepositoryGroupsKey),
      '["1:recent","5:other"]'
    )
  })

  it('repairs a corrupt or tampered persisted value on read', () => {
    localStorage.setItem(
      CollapsedRepositoryGroupsKey,
      JSON.stringify(['5:other', '  ', '5:other', 42, null, ' 1:recent '])
    )

    // getStringArray rejects a mixed-type array outright; a well-formed one is
    // still trimmed and deduped rather than trusted.
    assert.deepEqual(getCollapsedRepositoryGroups(), [])

    localStorage.setItem(
      CollapsedRepositoryGroupsKey,
      JSON.stringify(['5:other', '  ', '5:other', ' 1:recent '])
    )
    assert.deepEqual(getCollapsedRepositoryGroups(), ['1:recent', '5:other'])

    localStorage.setItem(CollapsedRepositoryGroupsKey, 'not json at all')
    assert.deepEqual(getCollapsedRepositoryGroups(), [])
  })

  it('bounds a tampered persisted set', () => {
    setCollapsedRepositoryGroups(
      Array.from({ length: 5_000 }, (_, index) => `group-${index}`)
    )

    assert.equal(
      getCollapsedRepositoryGroups().length,
      MaximumCollapsedRepositoryGroups
    )
  })
})

describe('repository group collapse policy', () => {
  it('treats only non-blank filter text as an active filter', () => {
    assert.equal(isRepositoryFilterActive(''), false)
    assert.equal(isRepositoryFilterActive('   '), false)
    assert.equal(isRepositoryFilterActive('repo'), true)
  })

  it('never reports a group as collapsed while a filter is running', () => {
    const collapsed = ['5:other']

    assert.equal(isRepositoryGroupCollapsed(collapsed, '5:other', false), true)
    assert.equal(isRepositoryGroupCollapsed(collapsed, '5:other', true), false)
    assert.equal(
      isRepositoryGroupCollapsed(collapsed, '1:recent', false),
      false
    )
  })

  it('counts only the folded groups a filter actually left on screen', () => {
    const collapsed = ['5:other', '1:recent']

    // Nothing is auto-expanded when no filter is running.
    assert.equal(
      countAutoExpandedRepositoryGroups(['5:other'], collapsed, false),
      0
    )
    // A folded group with no matches is not rendered, so it is not claimed.
    assert.equal(
      countAutoExpandedRepositoryGroups(['5:other'], collapsed, true),
      1
    )
    assert.equal(
      countAutoExpandedRepositoryGroups(
        ['5:other', '1:recent', '3:dotcom:octocat'],
        collapsed,
        true
      ),
      2
    )
  })
})

describe('repository group header text', () => {
  it('names the group, the exact count, and the disclosure state', () => {
    assert.equal(
      getRepositoryGroupAccessibleName('Other', 4, true, 'english', funny),
      'Other, 4 repositories, collapsed'
    )
    assert.equal(
      getRepositoryGroupAccessibleName('Other', 4, false, 'english', funny),
      'Other, 4 repositories, expanded'
    )
    assert.equal(
      getRepositoryGroupAccessibleName('Clients', 1, true, 'english', funny),
      'Clients, 1 repository, collapsed'
    )
  })

  it('keeps the count exact in Cantonese and at every funny level', () => {
    assert.equal(
      getRepositoryGroupAccessibleName('Other', 4, true, 'cantonese', funny),
      'Other，4 個 repo，已摺埋'
    )
    assert.equal(
      getRepositoryGroupAccessibleName('Other', 4, true, 'cantonese', {
        english: 5,
        cantonese: 5,
      }),
      'Other，4 個 repo，摺到扁晒扮緊家俬'
    )

    for (const level of [1, 2, 3, 4, 5]) {
      for (const name of [
        getRepositoryGroupAccessibleName('Other', 4, true, 'english', {
          english: level,
          cantonese: level,
        }),
        getRepositoryGroupAccessibleName('Other', 4, true, 'cantonese', {
          english: level,
          cantonese: level,
        }),
      ]) {
        assert.match(
          name,
          /4/,
          `funny level ${level} dropped the exact member count`
        )
        assert.match(name, /Other/)
      }
    }
  })

  it('reads the bilingual primary language for the accessible name', () => {
    // Bilingual leads with English, so the single spoken name does too rather
    // than announcing the count twice.
    assert.equal(
      getRepositoryGroupAccessibleName('Other', 2, false, 'bilingual', funny),
      'Other, 2 repositories, expanded'
    )
  })

  it('explains auto-expansion only when something was auto-expanded', () => {
    assert.deepEqual(getAutoExpandedGroupsSegments(0, 'english', funny), [])
    assert.deepEqual(getAutoExpandedGroupsSegments(1, 'english', funny), [
      {
        locale: 'en',
        text: 'Filtering expanded 1 collapsed group so its matches stay visible.',
      },
    ])
    assert.deepEqual(getAutoExpandedGroupsSegments(3, 'english', funny), [
      {
        locale: 'en',
        text: 'Filtering expanded 3 collapsed groups so their matches stay visible.',
      },
    ])
    assert.deepEqual(getAutoExpandedGroupsSegments(3, 'cantonese', funny), [
      {
        locale: 'zh-HK',
        text: '篩選期間自動展開咗 3 個摺埋嘅組，令入面嘅結果唔會被隱藏。',
      },
    ])
  })

  it('bands each language of the notice by its own funny level', () => {
    // English serious, Cantonese maximum: bilingual mode must honour both
    // rather than banding the pair from whichever language leads.
    assert.deepEqual(
      getAutoExpandedGroupsSegments(2, 'bilingual', {
        english: 1,
        cantonese: 5,
      }),
      [
        {
          locale: 'en',
          text: 'Filtering expanded 2 collapsed groups so their matches stay visible.',
        },
        {
          locale: 'zh-HK',
          text: '攞住搜查令撬開咗 2 個摺埋嘅組——每個入面都有結果匿緊，全部斷正。',
        },
      ]
    )
  })

  it('derives a valid, injective aria-controls id from any group key', () => {
    const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/

    const other = repositoryGroupRowsId(getGroupKey({ kind: 'other' }))
    const custom = repositoryGroupRowsId(
      getGroupKey({ kind: 'custom', name: 'Client work: 2026' })
    )
    const enterprise = repositoryGroupRowsId(
      getGroupKey({ kind: 'enterprise', host: 'ghe.example.com' })
    )

    for (const id of [other, custom, enterprise]) {
      assert.match(id, idPattern, `${id} is not a usable IDREF`)
    }
    assert.equal(new Set([other, custom, enterprise]).size, 3)

    // A name that literally spells an escape sequence must not collide with the
    // character that escape encodes.
    assert.notEqual(
      repositoryGroupRowsId('a:b'),
      repositoryGroupRowsId('a_3a_b')
    )
  })
})

describe('repository group header styles', () => {
  const style = readFileSync(
    join(process.cwd(), 'app', 'styles', 'ui', '_repository-list.scss'),
    'utf8'
  )

  it('strips the button chrome and fills the whole virtualized row', () => {
    assert.match(
      style,
      /\.repository-group-header\s*\{[\s\S]*?background: none;[\s\S]*?border: 0;[\s\S]*?cursor: pointer;[\s\S]*?font: inherit;[\s\S]*?height: 100%;[\s\S]*?width: 100%;/
    )
  })

  it('keeps focus visible and the collapsed count legible', () => {
    assert.match(
      style,
      /\.repository-group-header[\s\S]*?&:focus-visible\s*\{[\s\S]*?outline: 2px solid var\(--md-sys-color-primary\);/
    )
    assert.match(
      style,
      /\.repository-group-count\s*\{[\s\S]*?background: var\(--md-sys-color-secondary-container\);[\s\S]*?color: var\(--md-sys-color-on-secondary-container\);/
    )
    // The label, not the count or the chevron, is what may be truncated.
    assert.match(
      style,
      /\.repository-group-label\s*\{[\s\S]*?min-width: 0;[\s\S]*?text-overflow: ellipsis;/
    )
  })

  it('wraps the auto-expansion notice instead of clipping it', () => {
    assert.match(
      style,
      /\.repository-group-auto-expanded\s*\{[\s\S]*?align-items: flex-start;[\s\S]*?> span\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/
    )
  })

  it('turns the chevron but respects reduced motion', () => {
    assert.match(
      style,
      /&\[aria-expanded='false'\] \.repository-group-chevron\s*\{\s*transform: rotate\(-90deg\);/
    )
    assert.match(
      style,
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.repository-group-header \.repository-group-chevron\s*\{\s*transition: none;/
    )
  })
})
