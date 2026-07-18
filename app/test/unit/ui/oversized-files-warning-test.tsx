import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { resolve } from 'node:path'
import * as React from 'react'

import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { ICommitContext } from '../../../src/models/commit'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { OversizedFiles } from '../../../src/ui/changes/oversized-files-warning'
import { shouldAutoPinLargeFilesOnCommit } from '../../../src/lib/cheap-lfs/operations'
import { getGitHubReleasesAvailability } from '../../../src/lib/stores/github-releases-store'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialogShow: (() => void) | null = null

beforeEach(async () => {
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }

  // jsdom does not implement <dialog>.showModal/show, which the Dialog wrapper
  // calls on mount; make them flip the `open` attribute so the form renders.
  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  const previousShowModal = prototype.showModal
  prototype.show = function () {
    this.setAttribute('open', '')
  }
  prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  restoreDialogShow = () => {
    prototype.show = previousShow
    prototype.showModal = previousShowModal
    restoreDialogShow = null
  }
})

afterEach(() => {
  restoreIpcSend?.()
  restoreDialogShow?.()
  document.body.innerHTML = ''
})

const account = new Account(
  'fixture-bot',
  'https://api.github.com',
  'fixture-token',
  [],
  '',
  42,
  'Fixture Bot'
)
const remote = new GitHubRepository(
  'material',
  new Owner('desktop', 'https://api.github.com', 1),
  1
)
const repoPath = resolve('work', 'material')

/** A GitHub-hosted repository, optionally bound to the signed-in account. */
function gitHubRepository(withAccount: boolean): Repository {
  return new Repository(
    repoPath,
    1,
    remote,
    false,
    null,
    {},
    false,
    undefined,
    withAccount ? getAccountKey(account) : null
  )
}

const nonGitHubRepository = new Repository(repoPath, 1, null, false)

const context: ICommitContext = {
  summary: 'Add a large asset',
  description: null,
}

const pinButtonName = __DARWIN__
  ? 'Pin to Release (Cheap LFS)'
  : 'Pin to release (cheap LFS)'
const commitAnywayName = __DARWIN__ ? 'Commit Anyway' : 'Commit anyway'

interface ICommitCall {
  readonly force: boolean | undefined
}

class FakeDispatcher {
  public readonly commitCalls: ICommitCall[] = []
  public setCommitMessageCalls = 0

  public commitIncludedChanges = async (
    _repository: Repository,
    _context: ICommitContext,
    forceAutoPinLargeFiles?: boolean
  ): Promise<boolean> => {
    this.commitCalls.push({ force: forceAutoPinLargeFiles })
    return true
  }

  public setCommitMessage = async (): Promise<void> => {
    this.setCommitMessageCalls++
  }
}

function renderDialog(
  repository: Repository,
  accounts: ReadonlyArray<Account>,
  dispatcher: FakeDispatcher,
  onDismissed: () => void = () => {}
) {
  return render(
    <OversizedFiles
      oversizedFiles={['assets/big.bin']}
      onDismissed={onDismissed}
      dispatcher={dispatcher as unknown as Dispatcher}
      context={context}
      repository={repository}
      accounts={accounts}
    />
  )
}

describe('OversizedFiles dialog', () => {
  it('always offers Commit anyway and Cancel', () => {
    renderDialog(gitHubRepository(true), [account], new FakeDispatcher())

    assert.ok(screen.getByRole('button', { name: commitAnywayName }))
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('offers the cheap-LFS pin action when Releases are available', () => {
    // Precondition: the same gate the button uses resolves to available.
    assert.equal(
      getGitHubReleasesAvailability(gitHubRepository(true), [account]),
      'available'
    )

    renderDialog(gitHubRepository(true), [account], new FakeDispatcher())

    assert.ok(screen.getByRole('button', { name: pinButtonName }))
    assert.ok(screen.getByText(/keeping the repository pushable/i))
  })

  it('hides the pin action for a non-GitHub repository and explains why', () => {
    renderDialog(nonGitHubRepository, [], new FakeDispatcher())

    assert.equal(screen.queryByRole('button', { name: pinButtonName }), null)
    assert.ok(
      screen.getByText(/needs a GitHub\s+repository with a signed-in account/i)
    )
  })

  it('hides the pin action when no account is signed in', () => {
    assert.equal(
      getGitHubReleasesAvailability(gitHubRepository(true), []),
      'signed-out'
    )

    renderDialog(gitHubRepository(true), [], new FakeDispatcher())

    assert.equal(screen.queryByRole('button', { name: pinButtonName }), null)
  })

  it('pins to a release and commits with the auto-pin forced', async () => {
    const dispatcher = new FakeDispatcher()
    let dismissed = 0
    renderDialog(
      gitHubRepository(true),
      [account],
      dispatcher,
      () => dismissed++
    )

    fireEvent.click(screen.getByRole('button', { name: pinButtonName }))

    await waitFor(() => assert.equal(dispatcher.commitCalls.length, 1))
    assert.equal(dispatcher.commitCalls[0].force, true)
    assert.equal(dismissed, 1)
    await waitFor(() => assert.equal(dispatcher.setCommitMessageCalls, 1))
  })

  it('commits the oversized files unchanged on Commit anyway', async () => {
    const dispatcher = new FakeDispatcher()
    const { container } = renderDialog(
      gitHubRepository(true),
      [account],
      dispatcher
    )

    const form = container.querySelector('form')
    assert.ok(form, 'Expected the dialog to render a form')
    fireEvent.submit(form)

    await waitFor(() => assert.equal(dispatcher.commitCalls.length, 1))
    // Commit anyway must not force the pin — it commits the files as-is.
    assert.equal(dispatcher.commitCalls[0].force, undefined)
  })
})

describe('oversized-files pre-empt gate', () => {
  // Mirrors ChangesSidebar.willAutoPinOversizedFilesOnCommit: the warning is
  // skipped exactly when committing will auto-pin every oversized file.
  function willAutoPin(
    repository: Repository,
    accounts: ReadonlyArray<Account>,
    autoPinEnabled: boolean
  ): boolean {
    return shouldAutoPinLargeFilesOnCommit(
      autoPinEnabled,
      getGitHubReleasesAvailability(repository, accounts)
    )
  }

  it('skips the warning for a GitHub repo with an account and the pref on', () => {
    assert.equal(willAutoPin(gitHubRepository(true), [account], true), true)
  })

  it('shows the warning when the auto-pin pref is off', () => {
    assert.equal(willAutoPin(gitHubRepository(true), [account], false), false)
  })

  it('shows the warning when no account is signed in', () => {
    assert.equal(willAutoPin(gitHubRepository(true), [], true), false)
  })

  it('shows the warning for a non-GitHub repository', () => {
    assert.equal(willAutoPin(nonGitHubRepository, [account], true), false)
  })
})
