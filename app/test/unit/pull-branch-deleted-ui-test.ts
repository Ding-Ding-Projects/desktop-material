import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { GitError as DugiteError } from 'dugite'

import { ErrorWithMetadata } from '../../src/lib/error-with-metadata'
import { GitError, IGitResult } from '../../src/lib/git/core'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import { translate } from '../../src/lib/i18n'
import { translateWithFunnyLevel } from '../../src/lib/funny-level-text'
import { PopupManager } from '../../src/lib/popup-manager'
import {
  IPullBranchDeletedPlan,
  PullBranchDeletedRecoveryOutcome,
} from '../../src/lib/pull-branch-deleted'
import { pullBranchDeletedHandler } from '../../src/ui/dispatcher/error-handlers'
import { PullBranchDeletedDialog } from '../../src/ui/pull-branch-deleted'
import {
  buildPullBranchDeletedNotification,
  pullBranchDeletedBlockerKey,
} from '../../src/ui/pull-branch-deleted/recovery-notification'
import { Popup, PopupType } from '../../src/models/popup'
import { Repository } from '../../src/models/repository'
import { RetryActionType } from '../../src/models/retry-actions'
import { Dispatcher } from '../../src/ui/dispatcher'

const sourceRoot = join(__dirname, '../../src')

const readSource = (relativePath: string) =>
  readFileSync(join(sourceRoot, relativePath), 'utf8')

const repository = new Repository('C:/work/widget', 42, null, false)

function gitFailure(kind: DugiteError, message = `${kind}`): GitError {
  return new GitError(
    {
      exitCode: 1,
      stdout: '',
      stderr: message,
      gitError: kind,
      gitErrorDescription: message,
      path: repository.path,
    } as IGitResult,
    ['pull'],
    message
  )
}

function pullFailure(kind: DugiteError): ErrorWithMetadata {
  return new ErrorWithMetadata(gitFailure(kind), {
    repository,
    gitContext: {
      kind: 'pull',
      currentBranch: 'feature',
      theirBranch: 'origin/feature',
    },
    retryAction: { type: RetryActionType.Pull, repository },
  })
}

function fakeDispatcher(offered: boolean, calls: Array<unknown>): Dispatcher {
  return {
    maybeOfferPullBranchDeletedRecovery: async (
      target: Repository,
      signals: unknown
    ) => {
      calls.push({ target, signals })
      return offered
    },
  } as unknown as Dispatcher
}

describe('deleted-upstream pull error handler', () => {
  it('hands a confirmed deleted upstream to the recovery dialog', async () => {
    const calls = new Array<unknown>()
    const error = pullFailure(DugiteError.NoExistingRemoteBranch)

    assert.equal(
      await pullBranchDeletedHandler(error, fakeDispatcher(true, calls)),
      null
    )
    assert.deepStrictEqual(calls, [
      {
        target: repository,
        signals: { reportedMissingRemoteRef: true, isPullOperation: true },
      },
    ])
  })

  it('returns the original error when the store declines to offer', async () => {
    const calls = new Array<unknown>()
    const error = pullFailure(DugiteError.NoExistingRemoteBranch)

    assert.equal(
      await pullBranchDeletedHandler(error, fakeDispatcher(false, calls)),
      error
    )
    assert.equal(calls.length, 1)
  })

  it('never offers for auth, network, conflict, or dirty-worktree failures', async () => {
    const calls = new Array<unknown>()
    for (const kind of [
      DugiteError.HTTPSAuthenticationFailed,
      DugiteError.SSHAuthenticationFailed,
      DugiteError.HostDown,
      DugiteError.RemoteDisconnection,
      DugiteError.MergeConflicts,
      DugiteError.RebaseConflicts,
      DugiteError.MergeWithLocalChanges,
      DugiteError.RebaseWithLocalChanges,
      DugiteError.LocalChangesOverwritten,
    ]) {
      const error = pullFailure(kind)
      assert.equal(
        await pullBranchDeletedHandler(error, fakeDispatcher(true, calls)),
        error,
        DugiteError[kind]
      )
    }
    assert.deepStrictEqual(
      calls,
      [],
      'no unrelated failure may reach the store'
    )
  })

  it('never offers for a push, merge, or bare Git error', async () => {
    const calls = new Array<unknown>()

    const push = new ErrorWithMetadata(
      gitFailure(DugiteError.NoExistingRemoteBranch),
      {
        repository,
        retryAction: { type: RetryActionType.Push, repository },
      }
    )
    assert.equal(
      await pullBranchDeletedHandler(push, fakeDispatcher(true, calls)),
      push
    )

    const merge = new ErrorWithMetadata(
      gitFailure(DugiteError.NoExistingRemoteBranch),
      {
        repository,
        gitContext: {
          kind: 'merge',
          currentBranch: 'feature',
          theirBranch: 'other',
        },
      }
    )
    assert.equal(
      await pullBranchDeletedHandler(merge, fakeDispatcher(true, calls)),
      merge
    )

    const bare = gitFailure(DugiteError.NoExistingRemoteBranch)
    assert.equal(
      await pullBranchDeletedHandler(bare, fakeDispatcher(true, calls)),
      bare
    )

    const plain = new Error('something else entirely')
    assert.equal(
      await pullBranchDeletedHandler(plain, fakeDispatcher(true, calls)),
      plain
    )

    assert.deepStrictEqual(calls, [])
  })
})

describe('deleted-upstream recovery popups', () => {
  const offer = (id: number): Popup => ({
    type: PopupType.PullBranchDeleted,
    repository: new Repository(`C:/work/${id}`, id, null, false),
    branchName: 'feature',
    remoteName: 'origin',
    remoteBranchName: 'feature',
  })

  it('keeps one decision per repository when a batch finds several', () => {
    const manager = new PopupManager()
    manager.addPopup(offer(1))
    manager.addPopup(offer(2))
    manager.addPopup(offer(3))

    assert.equal(
      manager.getPopupsOfType(PopupType.PullBranchDeleted).length,
      3,
      'each repository reviews its own recovery'
    )
  })

  it('drops a second identical offer for the same repository', () => {
    const manager = new PopupManager()
    manager.addPopup(offer(7))
    manager.addPopup(offer(7))

    assert.equal(manager.getPopupsOfType(PopupType.PullBranchDeleted).length, 1)
  })
})

describe('deleted-upstream recovery notifications', () => {
  const localize = (key: TranslationKey, variables = {}) =>
    translate(key, 'english', variables)
  const context = {
    repositoryId: 42,
    repositoryName: 'widget',
    staleBranchName: 'feature',
    localize,
    localizeWithFunnyLevel: (base: any, variables = {}) =>
      translateWithFunnyLevel(
        base,
        'english',
        { english: 1, cantonese: 1 },
        variables
      ),
  }

  const build = (outcome: PullBranchDeletedRecoveryOutcome) =>
    buildPullBranchDeletedNotification(outcome, context)

  it('names the real refusal instead of a generic failure', () => {
    const notification = build({ kind: 'blocked', blocker: 'dirty-worktree' })
    assert.match(notification.body, /uncommitted changes/i)
    assert.match(notification.body, /widget/)
    assert.doesNotMatch(notification.body, /stashed for you|discarded for you/i)
    assert.equal(notification.repositoryId, 42)
  })

  it('reports a failed retry with the Git message intact', () => {
    const notification = build({
      kind: 'completed',
      defaultBranchName: 'main',
      deletedStaleBranch: false,
      deletionSkippedReason: null,
      pull: 'failed',
      pullError: 'could not read Username for https://github.com',
    })
    assert.match(notification.body, /could not read Username/)
    assert.match(notification.title, /pull failed/i)
  })

  it('says when the stale branch was deleted and when it was kept', () => {
    const deleted = build({
      kind: 'completed',
      defaultBranchName: 'main',
      deletedStaleBranch: true,
      deletionSkippedReason: null,
      pull: 'succeeded',
      pullError: null,
    })
    assert.match(deleted.body, /feature/)
    assert.match(deleted.body, /deleted/i)

    const kept = build({
      kind: 'completed',
      defaultBranchName: 'main',
      deletedStaleBranch: false,
      deletionSkippedReason: 'branch is checked out in a worktree',
      pull: 'succeeded',
      pullError: null,
    })
    assert.match(kept.body, /kept/i)
    assert.match(kept.body, /checked out in a worktree/)

    const untouched = build({
      kind: 'completed',
      defaultBranchName: 'main',
      deletedStaleBranch: false,
      deletionSkippedReason: null,
      pull: 'succeeded',
      pullError: null,
    })
    assert.doesNotMatch(untouched.body, /deleted|kept/i)
  })

  it('maps every refusal to a message that names it', () => {
    for (const blocker of [
      'no-default-branch',
      'no-current-branch',
      'already-on-default-branch',
      'dirty-worktree',
      'conflicted-worktree',
      'operation-in-progress',
    ] as const) {
      const key = pullBranchDeletedBlockerKey(blocker)
      assert.ok(englishTranslations[key].length > 0, key)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0, key)
    }
  })
})

describe('deleted-upstream recovery localization', () => {
  const keys = Object.keys(englishTranslations).filter(key =>
    key.startsWith('pullBranchDeleted.')
  ) as ReadonlyArray<TranslationKey>

  it('translates every recovery string in both languages', () => {
    assert.ok(keys.length >= 30, 'the recovery surface must be localized')
    for (const key of keys) {
      assert.ok(englishTranslations[key].trim().length > 0, `en ${key}`)
      assert.ok(
        (cantoneseTranslations[key] ?? '').trim().length > 0,
        `zh-HK ${key}`
      )
      assert.notEqual(
        cantoneseTranslations[key],
        englishTranslations[key],
        `${key} must actually be translated`
      )
    }
  })

  it('keeps every fact at every funny level in both languages', () => {
    const variables = {
      repository: 'widget',
      branch: 'feature',
      remote: 'origin',
      remoteBranch: 'feature',
    }
    const rendered = new Set<string>()

    for (const level of [1, 2, 3, 4, 5]) {
      for (const languageMode of ['english', 'cantonese'] as const) {
        const text = translateWithFunnyLevel(
          'pullBranchDeleted.intro',
          languageMode,
          { english: level, cantonese: level },
          variables
        )
        rendered.add(`${languageMode}:${text}`)
        // The voice changes with the level; the facts never do.
        assert.match(text, /widget/, `${languageMode} ${level}`)
        assert.match(text, /feature/, `${languageMode} ${level}`)
        assert.match(text, /origin/, `${languageMode} ${level}`)
        assert.doesNotMatch(text, /\{/, `${languageMode} ${level}`)
      }
    }

    // Four distinct bands per language, so the slider demonstrably changes copy.
    assert.equal(rendered.size, 8)
  })

  it('lets each language pick its own band in bilingual mode', () => {
    const bilingual = translateWithFunnyLevel(
      'pullBranchDeleted.recovered',
      'bilingual',
      { english: 1, cantonese: 5 },
      { repository: 'widget', default: 'main' }
    )
    assert.match(bilingual, / · /)
    assert.match(bilingual, /widget/)
    assert.match(bilingual, /main/)
    assert.ok(
      bilingual.startsWith(
        englishTranslations['pullBranchDeleted.recovered.plain']
          .replace('{repository}', 'widget')
          .replace('{default}', 'main')
      )
    )
  })
})

describe('deleted-upstream recovery dialog', () => {
  const dialogProps = {
    dispatcher: {} as Dispatcher,
    repository,
    branchName: 'feature',
    remoteName: 'origin',
    remoteBranchName: 'feature',
    onDismissed: () => {},
  }

  const plan = (
    unmergedCommitCount: number | null,
    blocker: IPullBranchDeletedPlan['blocker'] = null
  ): IPullBranchDeletedPlan => ({
    staleBranchName: 'feature',
    defaultBranchName: 'main',
    blocker,
    unmergedCommitCount,
    deletionWouldStrandCommits:
      unmergedCommitCount === null || unmergedCommitCount > 0,
  })

  const deletionWarning = (
    dialog: PullBranchDeletedDialog,
    unmergedCommitCount: number | null
  ) => {
    const element = (
      Reflect.get(dialog, 'renderDeletionWarning') as (
        this: PullBranchDeletedDialog,
        value: IPullBranchDeletedPlan
      ) => JSX.Element
    ).call(dialog, plan(unmergedCommitCount))
    return {
      role: element.props.role,
      text: String(element.props.children),
    }
  }

  it('never pre-ticks the delete option', () => {
    const dialog = new PullBranchDeletedDialog(dialogProps)
    assert.equal(dialog.state.deleteStaleBranch, false)
    assert.equal(dialog.state.phase, 'loading')
    assert.match(
      englishTranslations['pullBranchDeleted.deleteHint'],
      /Off by default/
    )
  })

  it('warns, before deletion, about commits only the stale branch has', () => {
    const dialog = new PullBranchDeletedDialog(dialogProps)

    const many = deletionWarning(dialog, 4)
    assert.equal(many.role, 'alert')
    assert.match(many.text, /4 commits exist only on feature/)
    assert.match(many.text, /strand/)

    const one = deletionWarning(dialog, 1)
    assert.equal(one.role, 'alert')
    assert.match(one.text, /1 commit exists only on feature/)

    const unknown = deletionWarning(dialog, null)
    assert.equal(unknown.role, 'alert')
    assert.match(unknown.text, /could not count/)

    const merged = deletionWarning(dialog, 0)
    assert.notEqual(merged.role, 'alert')
    assert.match(merged.text, /already on main/)
  })

  it('offers no switch action while the plan is blocked or unread', () => {
    const dialog = new PullBranchDeletedDialog(dialogProps)
    const canSwitch = () =>
      (
        Reflect.get(dialog, 'canSwitch') as (
          this: PullBranchDeletedDialog
        ) => boolean
      ).call(dialog)

    assert.equal(canSwitch(), false, 'not while the plan is still loading')

    dialog.state = { ...dialog.state, phase: 'review', plan: null }
    assert.equal(canSwitch(), false, 'not without a plan')

    dialog.state = {
      ...dialog.state,
      plan: plan(0, 'dirty-worktree'),
    }
    assert.equal(canSwitch(), false, 'not while the worktree is dirty')

    dialog.state = { ...dialog.state, plan: plan(0) }
    assert.equal(canSwitch(), true)
  })
})

describe('deleted-upstream recovery wiring', () => {
  it('registers the handler and renders the dialog', () => {
    const index = readSource('ui/index.tsx')
    assert.match(index, /registerErrorHandler\(pullBranchDeletedHandler\)/)

    const app = readSource('ui/app.tsx')
    assert.match(app, /case PopupType\.PullBranchDeleted:/)
    assert.match(app, /<PullBranchDeletedDialog/)
    assert.match(app, /remoteBranchName=\{popup\.remoteBranchName\}/)
  })

  it('gives both batch sync entry points their own recovery budget', () => {
    const store = readSource('lib/stores/app-store.ts')
    assert.equal(
      store.match(/createPullBranchDeletedOfferBudget\(\)/g)?.length,
      2,
      'Pull all and reviewed batch sync each bound their own offers'
    )
    assert.match(store, /performPullAllRepository\([\s\S]{0,200}recoveryBudget/)
  })

  it('never stashes or discards to make the branch switch possible', () => {
    const store = readSource('lib/stores/app-store.ts')
    const method = store.slice(
      store.indexOf('public async _switchToDefaultBranchAndPull'),
      store.indexOf('private async performPullPreviewFetch')
    )
    assert.ok(method.length > 0)
    assert.doesNotMatch(method, /StashOnCurrentBranch|MoveToNewBranch|_stash/)
    assert.match(method, /UncommittedChangesStrategy\.AskForConfirmation/)
  })
})
