import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { ICheapLfsCloneInventoryAsset } from '../../../src/lib/cheap-lfs/clone-inventory'
import { FilterMode } from '../../../src/lib/fuzzy-find'
import { Account } from '../../../src/models/account'
import { BatchCloneMode } from '../../../src/models/batch-clone'
import { CheckboxValue } from '../../../src/ui/lib/checkbox'
import { filterByMode } from '../../../src/ui/lib/filter-string-list'
import {
  buildCheapLfsAssetTree,
  filterCheapLfsAssetTree,
  getCheapLfsAssetNodeCheckboxValue,
  getInitialCheapLfsExpandedPaths,
  toggleCheapLfsAssetNode,
} from '../../../src/ui/clone-repository/cheap-lfs-asset-tree'
import { CloneGithubRepository } from '../../../src/ui/clone-repository/clone-github-repository'
import { CloneableRepositoryListItem } from '../../../src/ui/clone-repository/cloneable-repository-filter-list'
import { ICloneableRepositoryListItem } from '../../../src/ui/clone-repository/group-repositories'
import * as octicons from '../../../src/ui/octicons/octicons.generated'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const assets: ReadonlyArray<ICheapLfsCloneInventoryAsset> = [
  {
    path: 'assets/audio/theme.flac',
    provider: 'release',
    size: 10,
    objectSha256: 'a'.repeat(64),
    pointerBlobSha256: 'b'.repeat(64),
  },
  {
    path: 'assets/images/logo.psd',
    provider: 'release',
    size: 20,
    objectSha256: 'c'.repeat(64),
    pointerBlobSha256: 'd'.repeat(64),
  },
  {
    path: 'assets/images/splash.psd',
    provider: 'ghcr',
    size: 30,
    objectSha256: 'e'.repeat(64),
    pointerBlobSha256: 'f'.repeat(64),
  },
]

function account(): Account {
  return new Account(
    'octocat',
    'https://api.github.com',
    'token',
    [],
    '',
    7,
    'Octocat',
    'free'
  )
}

function rowItem(): ICloneableRepositoryListItem {
  return {
    id: 'https://github.com/example/game',
    text: ['example/game'],
    url: 'https://github.com/example/game.git',
    name: 'game',
    icon: octicons.repo,
    isPrivate: false,
    defaultBranch: 'main',
  }
}

describe('Cheap LFS clone asset tree', () => {
  it('derives folder tri-state and toggles all descendants transactionally', () => {
    const tree = buildCheapLfsAssetTree(assets)
    assert.equal(tree.length, 1)
    const root = tree[0]
    assert.equal(root.kind, 'folder')
    assert.equal(root.path, 'assets')
    assert.deepEqual(
      root.descendantPaths,
      assets.map(asset => asset.path)
    )

    const all = new Set(assets.map(asset => asset.path))
    assert.equal(getCheapLfsAssetNodeCheckboxValue(root, all), CheckboxValue.On)
    const mixed = new Set([assets[0].path])
    assert.equal(
      getCheapLfsAssetNodeCheckboxValue(root, mixed),
      CheckboxValue.Mixed
    )
    assert.equal(
      getCheapLfsAssetNodeCheckboxValue(root, new Set()),
      CheckboxValue.Off
    )

    const completed = toggleCheapLfsAssetNode(root, mixed)
    assert.deepEqual(
      [...completed].sort(),
      assets.map(asset => asset.path)
    )
    assert.deepEqual([...toggleCheapLfsAssetNode(root, completed)], [])
    assert.deepEqual([...getInitialCheapLfsExpandedPaths(tree)], ['assets'])
  })

  it('keeps only matching files and ancestors during a search', () => {
    const filtered = filterByMode(
      assets,
      asset => [asset.path, asset.path.slice(asset.path.lastIndexOf('/') + 1)],
      'logo',
      FilterMode.Substring,
      false
    )
    assert.deepEqual(
      filtered.items.map(asset => asset.path),
      ['assets/images/logo.psd']
    )

    const visible = new Set(filtered.items.map(asset => asset.path))
    const tree = filterCheapLfsAssetTree(
      buildCheapLfsAssetTree(assets),
      visible
    )
    assert.equal(tree.length, 1)
    assert.deepEqual(tree[0].descendantPaths, ['assets/images/logo.psd'])
    assert.equal(tree[0].kind, 'folder')
    if (tree[0].kind === 'folder') {
      assert.equal(tree[0].children[0].path, 'assets/images')
    }
  })
})

describe('Cheap LFS clone dialog surfaces', () => {
  it('keeps metadata filters collapsed by default with an operable ARIA disclosure', () => {
    const selectedAccount = account()
    render(
      <CloneGithubRepository
        account={selectedAccount}
        accounts={[selectedAccount]}
        path="C:/clones"
        onPathChanged={() => undefined}
        onChooseDirectory={async () => undefined}
        selectedItem={null}
        onSelectionChanged={() => undefined}
        repositories={[]}
        loading={false}
        repositoryError={null}
        organizations={[]}
        organizationsLoading={false}
        organizationsError={null}
        organizationsLoaded={true}
        organizationsScopeMissing={false}
        selectedOrganization={null}
        organizationError={null}
        onSelectedOrganizationChanged={() => undefined}
        onRefreshOrganization={() => undefined}
        onReconnectAccount={() => undefined}
        filterText=""
        onFilterTextChanged={() => undefined}
        onRefreshRepositories={() => undefined}
        onItemClicked={() => undefined}
        onSelectedAccountChanged={() => undefined}
        checkedUrls={new Set()}
        onToggleItemChecked={() => undefined}
        onToggleAllItemsChecked={() => undefined}
        batchMode={BatchCloneMode.Sequential}
        onBatchModeChanged={() => undefined}
        onCloneBatch={() => undefined}
        autoCloneNewRepositories={false}
        onAutoCloneNewRepositoriesChanged={() => undefined}
        visibilityFilter="all"
        onVisibilityFilterChanged={() => undefined}
        languageFilter={new Set()}
        onToggleLanguageFilter={() => undefined}
        languageOptions={[]}
      />
    )

    const disclosure = screen.getByRole('button', {
      name: 'Repository filters',
    })
    const panel = document.querySelector('#clone-repository-metadata-filters')
    assert.ok(panel)
    assert.equal(disclosure.getAttribute('aria-expanded'), 'false')
    assert.equal(
      disclosure.getAttribute('aria-controls'),
      'clone-repository-metadata-filters'
    )
    assert.equal(panel.hasAttribute('hidden'), true)

    fireEvent.click(disclosure)
    assert.equal(disclosure.getAttribute('aria-expanded'), 'true')
    assert.equal(panel.hasAttribute('hidden'), false)
  })

  it('opens the Cheap LFS picker without bubbling into repository selection', () => {
    let openedUrl: string | null = null
    let parentClicks = 0
    render(
      <div onClick={() => parentClicks++}>
        <CloneableRepositoryListItem
          item={rowItem()}
          matches={{ title: [], subtitle: [] }}
          checked={false}
          cheapLfsAssetCount={3}
          onShowCheapLfsAssets={url => {
            openedUrl = url
          }}
          showMetadata={true}
          languageMode="english"
        />
      </div>
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /Choose which of the 3 Cheap LFS files to download when cloning example\/game/,
      })
    )
    assert.equal(openedUrl, 'https://github.com/example/game.git')
    assert.equal(parentClicks, 0)
  })
})
