import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Git } from '../../../src/ui/preferences/git'
import { render, screen } from '../../helpers/ui/render'

const commonProps = {
  name: 'Example Author',
  email: 'author@example.test',
  defaultBranch: 'main',
  isLoadingGitConfig: false,
  accounts: [],
  onNameChanged: () => undefined,
  onEmailChanged: () => undefined,
  onDefaultBranchChanged: () => undefined,
  onEditGlobalGitConfig: () => undefined,
  onSelectedTabIndexChanged: () => undefined,
  onEnableGitHookEnvChanged: () => undefined,
  onCacheGitHookEnvChanged: () => undefined,
  onSelectedShellChanged: () => undefined,
  enableGitHookEnv: true,
  cacheGitHookEnv: true,
  selectedShell: 'git-bash',
  showCommitAuthorInfo: false,
  onShowCommitAuthorInfoChanged: () => undefined,
}

describe('Git settings explanations', () => {
  it('covers author, default-branch, and hook settings on their real tabs', () => {
    const view = render(<Git {...commonProps} selectedTabIndex={0} />)
    for (const id of [
      'git-author-name',
      'git-author-email',
      'git-show-commit-identity',
    ]) {
      assert.ok(
        view.container.querySelector(`[data-setting-explanation-id="${id}"]`),
        `missing setting explanation ${id}`
      )
    }
    assert.match(
      screen.getByLabelText('Name').getAttribute('aria-describedby') ?? '',
      /git-author-name-setting-explanation/
    )

    view.rerender(<Git {...commonProps} selectedTabIndex={1} />)
    assert.ok(
      view.container.querySelector(
        '[data-setting-explanation-id="git-default-branch-name"]'
      )
    )

    view.rerender(<Git {...commonProps} selectedTabIndex={2} />)
    for (const id of [
      'git-hook-environment-enabled',
      'git-hook-environment-cache',
      'git-hook-environment-shell',
    ]) {
      assert.ok(
        view.container.querySelector(`[data-setting-explanation-id="${id}"]`),
        `missing setting explanation ${id}`
      )
    }
  })
})
