import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { DefaultRepositoryLogoDesign } from '../../../src/models/repository-logo'
import { IRepositoryLogoLoader } from '../../../src/ui/repository-logo/repository-logo-loader'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { render, waitFor } from '../../helpers/ui/render'

const noMatches = { title: [], subtitle: [] }

class ImmediateLogoLoader implements IRepositoryLogoLoader {
  public async load() {
    return DefaultRepositoryLogoDesign
  }
  public invalidate(): void {}
  public synchronizeProfile(): void {}
}

function row(
  repo: Repository,
  font: 'serif' | 'monospace' | 'rounded' | 'condensed' | undefined
) {
  return (
    <RepositoryListItem
      repository={repo}
      needsDisambiguation={false}
      matches={noMatches}
      aheadBehind={null}
      changedFilesCount={0}
      branchName={null}
      repositoryLogoLoader={new ImmediateLogoLoader()}
      repositoryListFontResolver={async () => font}
    />
  )
}

describe('repository-list per-repository fonts', () => {
  it('stamps the resolved font preference on the row', async () => {
    const { container } = render(
      row(new Repository('repo/mono', 1, null, false), 'monospace')
    )

    await waitFor(() => {
      const item = container.querySelector('.repository-list-item')
      assert.equal(item?.getAttribute('data-repo-font'), 'monospace')
    })
  })

  it('leaves the attribute off when the repository inherits', async () => {
    const { container } = render(
      row(new Repository('repo/inherit', 2, null, false), undefined)
    )

    // The logo resolves async; wait for it so an unresolved read cannot mask
    // a wrongly-stamped font.
    await waitFor(() => {
      assert.notEqual(container.querySelector('.repository-list-logo'), null)
    })
    const item = container.querySelector('.repository-list-item')
    assert.equal(item?.getAttribute('data-repo-font'), null)
  })
})
