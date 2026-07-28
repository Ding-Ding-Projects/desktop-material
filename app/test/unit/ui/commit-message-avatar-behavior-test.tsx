import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let identityIsLocal = false
let configLookups = 0

mock.module('../../../src/lib/git/config', {
  namedExports: {
    getConfigValue: async (
      _repository: Repository,
      name: string,
      localOnly: boolean
    ) => {
      assert.equal(localOnly, true)
      assert.ok(name === 'user.name' || name === 'user.email')
      configLookups += 1
      return identityIsLocal ? 'same-visible-value' : null
    },
  },
})

async function loadCommitMessageAvatar() {
  return (await import('../../../src/ui/changes/commit-message-avatar'))
    .CommitMessageAvatar
}

describe('CommitMessageAvatar Git config location lifecycle', () => {
  it('reloads unchanged identity scope on reopen and routes to local settings', async () => {
    identityIsLocal = false
    configLookups = 0
    let globalSettingsOpens = 0
    let repositorySettingsOpens = 0
    const CommitMessageAvatar = await loadCommitMessageAvatar()
    const repository = new Repository('C:\\scope-test', 41, null, false)

    render(
      <CommitMessageAvatar
        user={{
          name: 'Same Name',
          email: 'same@example.com',
          avatarURL: undefined,
          endpoint: null,
        }}
        email="same@example.com"
        warningType="none"
        branch="main"
        isEnterpriseAccount={false}
        accountEmails={[]}
        preferredAccountEmail=""
        repository={repository}
        onUpdateEmail={() => undefined}
        onOpenRepositorySettings={() => repositorySettingsOpens++}
        onOpenGitSettings={() => globalSettingsOpens++}
        accounts={[]}
      />
    )

    const avatar = screen.getByRole('button', {
      name: 'View commit author information',
    })
    fireEvent.click(avatar)
    await waitFor(() => assert.equal(configLookups, 2))
    await waitFor(() => assert.ok(screen.getByText(/global git configuration/)))
    fireEvent.click(avatar)

    identityIsLocal = true
    fireEvent.click(avatar)
    await waitFor(() => assert.equal(configLookups, 4))
    await waitFor(() => assert.ok(screen.getByText(/local git configuration/)))

    fireEvent.click(screen.getByRole('button', { name: 'Open git settings' }))
    assert.equal(repositorySettingsOpens, 1)
    assert.equal(globalSettingsOpens, 0)
  })
})
