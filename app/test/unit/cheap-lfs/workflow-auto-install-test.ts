import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, TestContext } from 'node:test'

import {
  CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA,
  CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
  CHEAP_LFS_MANAGED_WORKFLOW_MARKER,
  inspectCheapLfsCloudCompressionWorkflow,
  renderCheapLfsCloudCompressionWorkflow,
} from '../../../src/lib/cheap-lfs/cloud-compression'
import {
  CheapLfsWorkflowInstallCommitMessage,
  cheapLfsWorkflowNoticeDedupeKey,
  cheapLfsWorkflowPublishIsBlocked,
  cheapLfsWorkflowPublishReasonKey,
  cheapLfsWorkflowPushFailureKey,
  classifyCheapLfsWorkflowPushFailure,
  decideCheapLfsWorkflowInstall,
  decideCheapLfsWorkflowPublish,
  ICheapLfsWorkflowObservation,
} from '../../../src/lib/cheap-lfs/workflow-auto-install'
import { AppStore } from '../../../src/lib/stores/app-store'
import {
  defaultBuildRunPreferences,
  IBuildRunPreferences,
} from '../../../src/models/build-run-preferences'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'

const canonicalPublic = renderCheapLfsCloudCompressionWorkflow(false)
const canonicalPrivate = renderCheapLfsCloudCompressionWorkflow(true)

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

function observation(
  overrides: Partial<ICheapLfsWorkflowObservation> = {}
): ICheapLfsWorkflowObservation {
  return {
    policy: 'automatic-public',
    provider: 'release',
    committedContents: null,
    workingTreeContents: null,
    canonicalContents: canonicalPublic,
    ...overrides,
  }
}

function repositoryAt(
  path: string,
  isPrivate: boolean | null,
  preferences: IBuildRunPreferences = defaultBuildRunPreferences,
  defaultBranch: string | null = 'main'
): Repository {
  return new Repository(
    path,
    1,
    new GitHubRepository(
      'material',
      new Owner('desktop', 'https://api.github.com', 1),
      1,
      isPrivate
    ),
    false,
    null,
    {},
    false,
    undefined,
    null,
    preferences,
    null,
    defaultBranch
  )
}

describe('Cheap LFS cloud-compression workflow install decision', () => {
  it('installs only when the committed tree carries no caller at all', () => {
    assert.equal(decideCheapLfsWorkflowInstall(observation()), 'install')
    assert.equal(
      decideCheapLfsWorkflowInstall(
        // Settings and clone repair already wrote the canonical file into the
        // working tree. GitHub Actions never sees an uncommitted file, so this
        // repository still does not have the workflow.
        observation({ workingTreeContents: canonicalPublic })
      ),
      'install'
    )
  })

  it('does nothing once the canonical caller is committed', () => {
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          committedContents: canonicalPublic,
          workingTreeContents: canonicalPublic,
        })
      ),
      'installed'
    )
  })

  it('leaves a committed caller the user edited alone rather than reinstalling', () => {
    const edited = `${canonicalPublic}# a local note\n`
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          committedContents: canonicalPublic,
          workingTreeContents: edited,
        })
      ),
      'installed'
    )
  })

  it('offers — never performs — an update when the committed caller differs', () => {
    const stale = canonicalPublic.replace(
      CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA,
      '0'.repeat(40)
    )
    assert.notEqual(stale, canonicalPublic)
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          committedContents: stale,
          workingTreeContents: stale,
        })
      ),
      'offer-update'
    )
  })

  it('offers an update rather than committing an edited uncommitted caller', () => {
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          committedContents: null,
          workingTreeContents: `${CHEAP_LFS_MANAGED_WORKFLOW_MARKER}\n# mine\n`,
        })
      ),
      'offer-update'
    )
  })

  it('refuses to touch a file it does not own, committed or not', () => {
    const foreign = 'name: someone else\non: push\n'
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({ workingTreeContents: foreign })
      ),
      'blocked-unowned'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({ committedContents: foreign })
      ),
      'blocked-unowned'
    )
  })

  it('stays out of the way when compression is off or has no Release caller', () => {
    for (const policy of ['disabled-private', 'not-github'] as const) {
      assert.equal(
        decideCheapLfsWorkflowInstall(observation({ policy })),
        'disabled'
      )
    }
    for (const provider of ['ghcr', 'docker-hub'] as const) {
      assert.equal(
        decideCheapLfsWorkflowInstall(observation({ provider })),
        'disabled'
      )
    }
  })

  it('publishes the closed guard for any committed app-owned noncanonical private caller', () => {
    const privateOptOut = (
      committedContents: string | null,
      workingTreeContents: string | null = committedContents
    ): ICheapLfsWorkflowObservation =>
      observation({
        policy: 'disabled-private',
        committedContents,
        workingTreeContents,
        canonicalContents: canonicalPublic,
      })

    assert.equal(
      decideCheapLfsWorkflowInstall(privateOptOut(canonicalPrivate)),
      'publish-disable'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(privateOptOut(null, canonicalPrivate)),
      'publish-disable'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        privateOptOut(canonicalPublic, canonicalPrivate)
      ),
      'publish-disable'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        privateOptOut(canonicalPrivate, canonicalPublic)
      ),
      'publish-disable'
    )
    const olderArmedCaller = canonicalPrivate.replace(
      CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA,
      '0'.repeat(40)
    )
    assert.match(olderArmedCaller, /\|\| true/)
    assert.equal(
      decideCheapLfsWorkflowInstall(privateOptOut(olderArmedCaller)),
      'publish-disable'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall({
        ...privateOptOut(olderArmedCaller),
        provider: 'ghcr',
      }),
      'publish-disable'
    )
    assert.equal(decideCheapLfsWorkflowInstall(privateOptOut(null)), 'disabled')
    assert.equal(
      decideCheapLfsWorkflowInstall(privateOptOut(canonicalPublic)),
      'disabled'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        privateOptOut('name: someone else\non: push\n')
      ),
      'blocked-unowned'
    )
  })

  it('closes private callers and removes public callers after leaving the Release provider', () => {
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          policy: 'disabled-private',
          provider: 'ghcr',
          committedContents: canonicalPrivate,
          workingTreeContents: canonicalPrivate,
          canonicalContents: canonicalPublic,
        })
      ),
      'publish-disable'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          policy: 'automatic-public',
          provider: 'docker-hub',
          committedContents: canonicalPublic,
          workingTreeContents: canonicalPublic,
        })
      ),
      'publish-remove'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          policy: 'automatic-public',
          provider: 'ghcr',
          committedContents: null,
          workingTreeContents: null,
        })
      ),
      'disabled'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({
          policy: 'automatic-public',
          provider: 'ghcr',
          committedContents: 'name: someone else\n',
          workingTreeContents: 'name: someone else\n',
        })
      ),
      'blocked-unowned'
    )
  })

  it('installs the armed caller only after the private opt-in and still protects unowned files', () => {
    const privateObservation = (
      contents: string | null
    ): ICheapLfsWorkflowObservation =>
      observation({
        policy: 'enabled-private',
        committedContents: contents,
        workingTreeContents: contents,
        canonicalContents: canonicalPrivate,
      })
    assert.equal(
      decideCheapLfsWorkflowInstall(privateObservation(null)),
      'install'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(privateObservation(canonicalPrivate)),
      'installed'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(privateObservation(canonicalPublic)),
      'install'
    )
    assert.equal(
      decideCheapLfsWorkflowInstall(privateObservation('name: someone else\n')),
      'blocked-unowned'
    )
  })

  it('fails closed and reports when GitHub has not confirmed visibility', () => {
    // Neither route may run: installing might bill private minutes, and
    // preparing a public builder might publish an identifier that turns out
    // to be private. This is a reported blocker, never a silent `disabled`.
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({ policy: 'visibility-unknown' })
      ),
      'blocked-visibility-unknown'
    )
    // …unless there is no Release caller in the picture at all.
    assert.equal(
      decideCheapLfsWorkflowInstall(
        observation({ policy: 'visibility-unknown', provider: 'ghcr' })
      ),
      'disabled'
    )
  })
})

describe('Cheap LFS cloud-compression workflow publish decision', () => {
  const base = {
    hasGitHubRepository: true,
    remoteName: 'origin',
    branchName: 'main',
    defaultBranchName: 'main',
    remoteBranchRef: 'refs/heads/main',
    localTipShaBeforeCommit: 'a'.repeat(40),
    remoteBranchSha: 'a'.repeat(40),
  }

  it('pushes only when the push can carry this one commit and nothing else', () => {
    assert.equal(decideCheapLfsWorkflowPublish(base), 'push')
  })

  it('reuses the anchor route for a branch that has never been published', () => {
    assert.equal(
      decideCheapLfsWorkflowPublish({ ...base, remoteBranchSha: null }),
      'anchor'
    )
  })

  it('never publishes local commits the user has not reviewed', () => {
    assert.equal(
      decideCheapLfsWorkflowPublish({
        ...base,
        remoteBranchSha: 'b'.repeat(40),
      }),
      'defer-unpushed-commits'
    )
  })

  it('defers a non-default branch before any commit or push decision', () => {
    const decision = decideCheapLfsWorkflowPublish({
      ...base,
      branchName: 'topic/listbox-fix',
      remoteBranchSha: null,
    })
    assert.equal(decision, 'defer-non-default')
    assert.equal(cheapLfsWorkflowPublishIsBlocked(decision), true)
    assert.equal(cheapLfsWorkflowPublishReasonKey(decision), null)
  })

  it('fails closed with an actionable reason', () => {
    const cases = [
      [{ hasGitHubRepository: false }, 'blocked-no-github-repository'],
      [{ remoteName: null }, 'blocked-no-remote'],
      [{ branchName: null }, 'blocked-detached-head'],
    ] as const
    for (const [override, expected] of cases) {
      const decision = decideCheapLfsWorkflowPublish({ ...base, ...override })
      assert.equal(decision, expected)
      assert.equal(cheapLfsWorkflowPublishIsBlocked(decision), true)
      assert.notEqual(cheapLfsWorkflowPublishReasonKey(decision), null)
    }
    assert.equal(cheapLfsWorkflowPublishReasonKey('push'), null)
    assert.equal(cheapLfsWorkflowPublishIsBlocked('anchor'), false)
    assert.equal(
      cheapLfsWorkflowPublishIsBlocked('defer-unpushed-commits'),
      false
    )
  })

  it('fails closed with a distinct decision when GitHub has no proven default branch', () => {
    const decision = decideCheapLfsWorkflowPublish({
      ...base,
      defaultBranchName: null,
    })
    assert.equal(decision, 'blocked-no-default-branch')
    assert.equal(cheapLfsWorkflowPublishIsBlocked(decision), true)
    assert.equal(
      cheapLfsWorkflowPublishReasonKey(decision),
      'cheapLfs.cloud.autoInstall.failedNoDefaultBranch'
    )
  })

  it('fails closed when the exact remote default-branch ref is ambiguous', () => {
    const decision = decideCheapLfsWorkflowPublish({
      ...base,
      remoteBranchRef: 'refs/heads/not-main',
    })
    assert.equal(decision, 'blocked-unproven-remote-target')
    assert.equal(cheapLfsWorkflowPublishIsBlocked(decision), true)
    assert.equal(
      cheapLfsWorkflowPublishReasonKey(decision),
      'cheapLfs.cloud.autoInstall.failedNoRemote'
    )
  })
})

describe('Cheap LFS cloud-compression workflow push failures', () => {
  it('names the missing workflow scope instead of relaying the raw refusal', () => {
    const oauth =
      '! [remote rejected] main -> main (refusing to allow an OAuth App to ' +
      "create or update workflow '.github/workflows/cheap-lfs-cloud-compression.yml' " +
      'without `workflow` scope)'
    const pat =
      'refusing to allow a Personal Access Token to create or update workflow ' +
      "'.github/workflows/cheap-lfs-cloud-compression.yml' without `workflow` scope"
    const app =
      'refusing to allow a GitHub App to create or update workflow ' +
      "'.github/workflows/cheap-lfs-cloud-compression.yml' without `workflows` permission"
    for (const detail of [oauth, pat, app]) {
      assert.equal(
        classifyCheapLfsWorkflowPushFailure(detail),
        'workflow-scope'
      )
    }
    assert.equal(
      cheapLfsWorkflowPushFailureKey('workflow-scope'),
      'cheapLfs.cloud.autoInstall.failedWorkflowScope'
    )
  })

  it('separates a moved branch from an unrecognized failure', () => {
    assert.equal(
      classifyCheapLfsWorkflowPushFailure(
        '! [rejected] main -> main (non-fast-forward)'
      ),
      'rejected'
    )
    assert.equal(
      classifyCheapLfsWorkflowPushFailure('git push unknown'),
      'unknown'
    )
    assert.equal(
      cheapLfsWorkflowPushFailureKey('rejected'),
      'cheapLfs.cloud.autoInstall.failedRejected'
    )
    assert.equal(
      cheapLfsWorkflowPushFailureKey('unknown'),
      'cheapLfs.cloud.autoInstall.failedUnknown'
    )
  })

  it('keeps one notice per repository and scope', () => {
    assert.notEqual(
      cheapLfsWorkflowNoticeDedupeKey(1, 'install'),
      cheapLfsWorkflowNoticeDedupeKey(1, 'update')
    )
    assert.notEqual(
      cheapLfsWorkflowNoticeDedupeKey(1, 'install'),
      cheapLfsWorkflowNoticeDedupeKey(2, 'install')
    )
  })
})

describe('Cheap LFS cloud-compression workflow install wiring', () => {
  const storeSource = readFileSync(
    join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
    'utf8'
  )
  const read = (relative: string): string =>
    readFileSync(
      join(process.cwd(), 'app', 'src', ...relative.split('/')),
      'utf8'
    )

  it('runs on enabling compression and on using it', () => {
    // Enabling the setting, and the automatic materialize pass that proves the
    // repository is already storing Release pointers, both ask for the repair.
    const ensureStart = storeSource.indexOf(
      'public async _ensureCheapLfsCloudCompressionWorkflow('
    )
    assert.notEqual(ensureStart, -1)
    assert.match(
      storeSource.slice(ensureStart, ensureStart + 4_000),
      /this\.runCheapLfsWorkflowAutoInstall\(\s*repository,\s*false,\s*preferences\s*\)/
    )
    const materializeStart = storeSource.indexOf(
      'public async maybeAutoMaterializeCheapLfs('
    )
    assert.notEqual(materializeStart, -1)
    assert.match(
      storeSource.slice(materializeStart, materializeStart + 10_000),
      /this\.maybeAutoInstallCheapLfsCloudCompressionWorkflow\(\s*latestRepository,\s*latestPreferences\s*\)/
    )
    assert.match(
      storeSource.slice(materializeStart, materializeStart + 10_000),
      /await this\.repositoriesStore\.getAll\(\)/
    )
  })

  it('never blocks its caller and never lets a failure escape', () => {
    const start = storeSource.indexOf(
      'public maybeAutoInstallCheapLfsCloudCompressionWorkflow('
    )
    assert.notEqual(start, -1)
    const body = storeSource.slice(
      start,
      storeSource.indexOf(
        'public async _updateCheapLfsCloudCompressionWorkflow(',
        start
      )
    )
    // Fire-and-forget. The per-repository generation queue absorbs concurrent
    // requests instead of dropping the later preference update.
    assert.match(body, /void this\.runCheapLfsWorkflowAutoInstall\(/)
    assert.match(body, /\.catch\(/)
    assert.doesNotMatch(body, /claimInFlight\(/)
    assert.doesNotMatch(body, /await this\.runCheapLfsWorkflowAutoInstall\(/)
    assert.match(storeSource, /queueCheapLfsWorkflowReconcile\(/)
    assert.match(storeSource, /\+\+state\.generation/)
  })

  it('commits only the workflow path, with the bilingual message', () => {
    const start = storeSource.indexOf(
      'private async commitCheapLfsWorkflowPath('
    )
    assert.notEqual(start, -1)
    const body = storeSource.slice(start, start + 12_000)
    assert.match(storeSource, /'hash-object',\s*'-w',\s*'--stdin'/)
    assert.match(storeSource, /'update-index'/)
    assert.match(storeSource, /'--cacheinfo'/)
    assert.match(body, /'commit-tree'/)
    assert.match(body, /CheapLfsWorkflowInstallCommitMessage/)
    assert.match(body, /'update-ref'/)
    assert.match(body, /GIT_INDEX_FILE/)
    assert.match(body, /isBackgroundTask: true/)
    assert.doesNotMatch(body, /'-a'|'--all'/)
  })

  it('registers the confirm-class update action across every surface it needs', () => {
    assert.match(
      read('models/error-notice.ts'),
      /kind: 'update-cheap-lfs-workflow'/
    )
    assert.match(storeSource, /kind: 'update-cheap-lfs-workflow'/)
    assert.match(
      read('ui/app.tsx'),
      /action\.kind === 'update-cheap-lfs-workflow'/
    )
    const stack = read('ui/error-notice-stack.tsx')
    assert.match(
      stack,
      /notice\.action\?\.kind === 'update-cheap-lfs-workflow'/
    )
    // The button opens a confirmation instead of dispatching the replacement.
    assert.match(stack, /confirmingWorkflowUpdate: true/)
    assert.match(stack, /onConfirmWorkflowUpdate/)
  })

  it('localizes every install string in English and Cantonese', () => {
    const resources = read('lib/i18n-resources.ts')
    const english = resources.indexOf('export const englishTranslations')
    const cantonese = resources.indexOf('export const cantoneseTranslations')
    assert.ok(english > 0 && cantonese > english)
    const keys = [
      ...new Set(
        [...resources.matchAll(/'(cheapLfs\.cloud\.autoInstall\.[^']+)'/g)].map(
          match => match[1]
        )
      ),
    ]
    assert.ok(keys.length >= 20, 'expected the full install string set')
    for (const key of keys) {
      assert.ok(
        resources.indexOf(`'${key}':`, english) > english,
        `${key} has no English string`
      )
      assert.ok(
        resources.indexOf(`'${key}':`, cantonese) > cantonese,
        `${key} has no Cantonese string`
      )
    }
  })
})

describe('Cheap LFS cloud-compression canonical template contract', () => {
  it('pins the compressor action by a full 40-character commit SHA', () => {
    assert.match(CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA, /^[0-9a-f]{40}$/)
  })

  it('pins every action it uses by a full commit SHA, never a tag or branch', () => {
    for (const template of [
      renderCheapLfsCloudCompressionWorkflow(false),
      renderCheapLfsCloudCompressionWorkflow(true),
    ]) {
      const uses = [...template.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)].map(
        match => match[1]
      )
      assert.ok(
        uses.length >= 2,
        'the caller must reference at least two actions'
      )
      for (const reference of uses) {
        assert.match(
          reference,
          /@[0-9a-f]{40}$/,
          `${reference} is not pinned by a full commit SHA`
        )
      }
    }
  })

  it('is recognizable as app-owned from its very first byte', () => {
    assert.ok(
      renderCheapLfsCloudCompressionWorkflow(false).startsWith(
        CHEAP_LFS_MANAGED_WORKFLOW_MARKER
      )
    )
  })

  it('commits with a bilingual message', () => {
    assert.match(CheapLfsWorkflowInstallCommitMessage, /^[\x20-\x7e]+ \/ .+$/u)
    assert.match(CheapLfsWorkflowInstallCommitMessage, /[一-鿿]/)
  })
})

function git(cwd: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Workflow Test',
      GIT_AUTHOR_EMAIL: 'workflow@example.invalid',
      GIT_COMMITTER_NAME: 'Workflow Test',
      GIT_COMMITTER_EMAIL: 'workflow@example.invalid',
    },
  }).trim()
}

interface IFixture {
  readonly repository: Repository
  readonly worktree: string
  readonly bare: string
  readonly notifications: Array<{ title: string; body: string }>
  readonly notices: Array<{ title: string; dedupeKey: string }>
  readonly store: AppStore
  readonly storeState: {
    isCommitting: boolean
    commitOperationPhase: unknown
    hookProgress: unknown
    subscribeToCommitOutput: unknown
    branchesState: {
      defaultBranch: { name: string } | null
    }
  }
  readonly workflowPath: string
  remoteBranchSha: string | null
}

/**
 * A real repository with a real local bare remote, driven through the real
 * `AppStore` method bodies. Only the surfaces that need Electron, the database,
 * or the network are replaced.
 */
async function setupFixture(t: TestContext): Promise<IFixture> {
  const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-workflow-install-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const worktree = join(root, 'worktree')
  const bare = join(root, 'remote.git')
  await mkdir(worktree)
  git(root, ['init', '--bare', '--initial-branch=main', bare])
  git(worktree, ['init', '--initial-branch=main'])
  git(worktree, ['config', 'user.name', 'Workflow Test'])
  git(worktree, ['config', 'user.email', 'workflow@example.invalid'])
  const hooks = join(root, 'hooks')
  await mkdir(hooks)
  git(worktree, ['config', 'core.hooksPath', hooks])
  await writeFile(join(worktree, 'readme.md'), 'base\n', 'utf8')
  git(worktree, ['add', '--', 'readme.md'])
  git(worktree, ['commit', '-m', 'base'])
  git(worktree, ['remote', 'add', 'origin', bare])
  git(worktree, ['push', 'origin', 'main'])

  const repository = repositoryAt(worktree, false)
  const notifications: Array<{ title: string; body: string }> = []
  const notices: Array<{ title: string; dedupeKey: string }> = []
  const storeState: IFixture['storeState'] = {
    isCommitting: false,
    commitOperationPhase: null,
    hookProgress: null,
    subscribeToCommitOutput: null,
    branchesState: {
      defaultBranch: { name: 'main' },
    },
  }
  const fixture: IFixture = {
    repository,
    worktree,
    bare,
    notifications,
    notices,
    storeState,
    workflowPath: join(
      worktree,
      ...CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH.split('/')
    ),
    remoteBranchSha: git(bare, ['rev-parse', 'refs/heads/main']),
    store: Object.create(AppStore.prototype) as AppStore,
  }

  Object.assign(fixture.store, {
    accounts: [],
    errorNotices: [],
    cheapLfsMaterializeOwners: new Map(),
    cheapLfsMaterializeTails: new Map(),
    cheapLfsCommitGates: new Map(),
    cheapLfsWorkflowReconciles: new Map(),
    assertTemporaryRepositoryIsSafe: async () => undefined,
    isTemporaryRepositoryActive: () => true,
    // The publish chain resolves the canonical remote before any network I/O;
    // this fixture exercises a local bare remote, so the resolution seam
    // passes the repository straight through.
    repositoryWithCanonicalRemoteForNetwork: async (target: Repository) =>
      target,
    _loadStatus: async () => undefined,
    _refreshRepository: async () => undefined,
    emitUpdate: () => undefined,
    postNotification: (input: { title: string; body: string }) =>
      notifications.push({ title: input.title, body: input.body }),
    postPersistentErrorNotice: (title: string, _m: string, dedupeKey: string) =>
      notices.push({ title, dedupeKey }),
    repositoryStateCache: {
      get: () => storeState,
      update: (
        _repository: Repository,
        update: (
          current: IFixture['storeState']
        ) => Partial<IFixture['storeState']>
      ) => Object.assign(storeState, update(storeState)),
    },
    gitStoreCache: {
      get: () => ({
        remotes: [{ name: 'origin', url: bare }],
        loadBranches: async () => undefined,
      }),
    },
    readCheapLfsPublicationState: async () => ({
      hasGitHubRepository: true,
      remoteName: 'origin',
      branchName: git(worktree, ['branch', '--show-current']) || null,
      localTipSha: git(worktree, ['rev-parse', 'HEAD']),
      remoteBranchSha:
        git(worktree, ['branch', '--show-current']) === 'main'
          ? fixture.remoteBranchSha
          : null,
    }),
  })
  return fixture
}

async function runInstall(
  fixture: IFixture,
  replaceDivergent: boolean = false,
  repository: Repository = fixture.repository,
  preferences: IBuildRunPreferences = repository.buildRunPreferences
): Promise<void> {
  if (replaceDivergent) {
    await (fixture.store as any).runCheapLfsWorkflowAutoInstall(
      repository,
      true,
      preferences
    )
    return
  }
  await fixture.store._ensureCheapLfsCloudCompressionWorkflow(
    repository,
    preferences
  )
  await waitForWorkflowReconcile(fixture)
}

async function waitForWorkflowReconcile(fixture: IFixture): Promise<void> {
  while ((fixture.store as any).cheapLfsWorkflowReconciles.size > 0) {
    const workers = [
      ...(fixture.store as any).cheapLfsWorkflowReconciles.values(),
    ]
      .map((state: { worker: Promise<void> | null }) => state.worker)
      .filter(
        (worker: Promise<void> | null): worker is Promise<void> =>
          worker !== null
      )
    await Promise.all(workers)
  }
}

describe('Cheap LFS cloud-compression workflow background install', () => {
  it('commits and pushes the canonical caller when the repository lacks one', async t => {
    const fixture = await setupFixture(t)
    await runInstall(fixture)

    const committed = git(fixture.worktree, [
      'cat-file',
      'blob',
      `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    assert.equal(committed.trim(), canonicalPublic.trim())
    assert.equal(
      git(fixture.worktree, ['log', '-1', '--format=%s']),
      CheapLfsWorkflowInstallCommitMessage
    )

    // Proven from the remote itself, not from a successful push.
    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), head)

    // Exactly one commit was published, and it touched exactly one path.
    assert.equal(
      git(fixture.worktree, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD',
      ]),
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH
    )
    assert.equal(git(fixture.worktree, ['rev-list', '--count', 'HEAD']), '2')

    assert.deepEqual(fixture.notices, [])
    assert.equal(fixture.notifications.length, 2)
    assert.match(fixture.notifications[0].body, /background/i)
    assert.match(fixture.notifications[1].body, /main/)
  })

  it('bypasses every hook, including a failing Git LFS-style post-commit hook', async t => {
    const fixture = await setupFixture(t)
    const hooks = git(fixture.worktree, ['config', 'core.hooksPath'])
    const marker = join(hooks, 'post-commit-ran')
    const hook = join(hooks, 'post-commit')
    await writeFile(
      hook,
      `#!/bin/sh\nprintf ran > '${marker.replace(/\\/g, '/')}'\nexit 1\n`,
      'utf8'
    )
    await chmod(hook, 0o755)

    await runInstall(fixture)

    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), head)
    await assert.rejects(() => readFile(marker, 'utf8'))
    assert.equal(
      git(fixture.worktree, ['log', '-1', '--format=%s']),
      CheapLfsWorkflowInstallCommitMessage
    )
    assert.deepEqual(fixture.notices, [])
  })

  it('never touches a foreign file at the workflow path', async t => {
    const fixture = await setupFixture(t)
    const foreign = 'name: not ours\non:\n  push:\njobs: {}\n'
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, foreign, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'someone else owns this'])
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture)

    assert.equal(await readFile(fixture.workflowPath, 'utf8'), foreign)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(fixture.notices.length, 1)
    assert.equal(
      fixture.notices[0].dedupeKey,
      cheapLfsWorkflowNoticeDedupeKey(fixture.repository.id, 'unowned')
    )
  })

  it('offers an update for a divergent managed caller and replaces it only once confirmed', async t => {
    const fixture = await setupFixture(t)
    const stale = canonicalPublic.replace(
      CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA,
      '0'.repeat(40)
    )
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, stale, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'an older managed caller'])
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    git(fixture.worktree, ['push', 'origin', 'main'])
    fixture.remoteBranchSha = before

    // Unconfirmed: reported, never rewritten.
    await runInstall(fixture)
    assert.equal(await readFile(fixture.workflowPath, 'utf8'), stale)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(
      fixture.notifications.at(-1)?.title,
      'Cloud compression workflow is out of date'
    )

    // Confirmed: replaced, committed, and pushed.
    await runInstall(fixture, true)
    assert.equal(await readFile(fixture.workflowPath, 'utf8'), canonicalPublic)
    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.notEqual(head, before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), head)
  })

  it('does nothing at all once the canonical caller is committed', async t => {
    const fixture = await setupFixture(t)
    await runInstall(fixture)
    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    fixture.remoteBranchSha = head
    fixture.notifications.length = 0

    await runInstall(fixture)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), head)
    assert.deepEqual(fixture.notifications, [])
    assert.deepEqual(fixture.notices, [])
  })

  it('commits but refuses to push local commits the user has not reviewed', async t => {
    const fixture = await setupFixture(t)
    await writeFile(
      join(fixture.worktree, 'draft.txt'),
      'private work\n',
      'utf8'
    )
    git(fixture.worktree, ['add', '--', 'draft.txt'])
    git(fixture.worktree, ['commit', '-m', 'work in progress'])
    const unpushed = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture)

    // The caller is committed locally so it rides out with the user's own push.
    assert.equal(
      git(fixture.worktree, [
        'cat-file',
        'blob',
        `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
      ]).trim(),
      canonicalPublic.trim()
    )
    assert.notEqual(git(fixture.worktree, ['rev-parse', 'HEAD']), unpushed)
    // Nothing left this machine: the remote still holds only the base commit.
    assert.equal(
      git(fixture.bare, ['rev-parse', 'refs/heads/main']),
      fixture.remoteBranchSha
    )
    assert.equal(
      fixture.notifications.at(-1)?.title,
      'Cloud compression policy committed'
    )
  })

  it('leaves the user staged selection untouched', async t => {
    const fixture = await setupFixture(t)
    await writeFile(join(fixture.worktree, 'staged.txt'), 'staged\n', 'utf8')
    git(fixture.worktree, ['add', '--', 'staged.txt'])

    await runInstall(fixture)

    // The background commit carried only the workflow; `staged.txt` is still
    // staged and uncommitted, exactly as the user left it.
    assert.equal(
      git(fixture.worktree, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD',
      ]),
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH
    )
    assert.equal(
      git(fixture.worktree, ['diff', '--cached', '--name-only']),
      'staged.txt'
    )
  })

  it('never commits a managed workflow edited after the scheduler snapshot', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const externalEdit = `${canonicalPublic}\n# external managed edit\n`
    const originalStage = (AppStore.prototype as any)
      .stageCheapLfsWorkflowIndexEntry
    let injected = false
    Reflect.set(
      fixture.store,
      'stageCheapLfsWorkflowIndexEntry',
      async (...args: ReadonlyArray<unknown>) => {
        if (!injected) {
          injected = true
          await writeFile(fixture.workflowPath, externalEdit, 'utf8')
        }
        return await originalStage.apply(fixture.store, args)
      }
    )

    await runInstall(fixture)

    assert.equal(injected, true)
    assert.equal(await readFile(fixture.workflowPath, 'utf8'), externalEdit)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, [
        'diff',
        '--cached',
        '--name-only',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
  })

  it('preserves a same-path stage that appears after the locked precheck', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const indexPath = join(fixture.worktree, '.git', 'index')
    const externalIndex = join(fixture.worktree, '.git', 'external-index')
    const originalStage = (AppStore.prototype as any)
      .stageCheapLfsWorkflowIndexEntry
    let injected = false
    Reflect.set(
      fixture.store,
      'stageCheapLfsWorkflowIndexEntry',
      async (...args: ReadonlyArray<unknown>) => {
        const result = await originalStage.apply(fixture.store, args)
        if (!injected) {
          injected = true
          await copyFile(indexPath, externalIndex)
          execFileSync(
            'git',
            ['add', '--', CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH],
            {
              cwd: fixture.worktree,
              env: { ...process.env, GIT_INDEX_FILE: externalIndex },
              stdio: 'pipe',
            }
          )
          await copyFile(externalIndex, indexPath)
        }
        return result
      }
    )

    await runInstall(fixture)

    assert.equal(injected, true)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, [
        'diff',
        '--cached',
        '--name-only',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH
    )
    await assert.rejects(() =>
      readFile(join(fixture.worktree, '.git', 'index.lock'))
    )
  })

  it('rolls back the exact ref and leaves the real index byte-exact when index publication fails', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const indexPath = join(fixture.worktree, '.git', 'index')
    const priorIndex = await readFile(indexPath)
    Reflect.set(
      fixture.store,
      'commitCheapLfsWorkflowIndexTransaction',
      async () => {
        throw new Error('injected index publication failure')
      }
    )

    await runInstall(fixture)

    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.deepEqual(await readFile(indexPath), priorIndex)
    await assert.rejects(() => readFile(`${indexPath}.lock`))
  })

  it('removes its acquired index lock when post-copy inspection fails', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    Reflect.set(fixture.store, 'readCheapLfsWorkflowIndexEntry', async () => {
      throw new Error('injected locked-index inspection failure')
    })

    await runInstall(fixture)

    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    await assert.rejects(() =>
      readFile(join(fixture.worktree, '.git', 'index.lock'))
    )
  })

  it('fails closed and leaves an originally absent real index absent', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const indexPath = join(fixture.worktree, '.git', 'index')
    await rm(indexPath)

    await runInstall(fixture)

    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    await assert.rejects(() => readFile(indexPath))
    await assert.rejects(() => readFile(`${indexPath}.lock`))
  })

  it('arms and pushes an existing managed caller when a private repository opts in', async t => {
    const fixture = await setupFixture(t)
    const staleOptedOutRepository = repositoryAt(fixture.worktree, true)
    const freshlyEnabledPreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsCloudCompression: true,
    }
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPublic, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'managed caller disabled'])
    git(fixture.worktree, ['push', 'origin', 'main'])
    fixture.remoteBranchSha = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(
      fixture,
      false,
      staleOptedOutRepository,
      freshlyEnabledPreferences
    )

    const committed = git(fixture.worktree, [
      'cat-file',
      'blob',
      `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    assert.equal(committed.trim(), canonicalPrivate.trim())
    assert.match(committed, /Private repository opt-in: enabled/)
    assert.match(committed, /\|\| true/)
    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), head)
    assert.equal(git(fixture.worktree, ['rev-list', '--count', 'HEAD']), '3')
    assert.deepEqual(fixture.notices, [])
    assert.equal(fixture.notifications.length, 2)
    assert.equal(
      git(fixture.worktree, ['log', '-1', '--format=%s']),
      CheapLfsWorkflowInstallCommitMessage
    )
  })

  it('publishes the closed guard from fresh opt-out preferences even when the repository snapshot is stale', async t => {
    const fixture = await setupFixture(t)
    const staleEnabledPreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsCloudCompression: true,
    }
    const staleEnabledRepository = repositoryAt(
      fixture.worktree,
      true,
      staleEnabledPreferences
    )
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPrivate, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'managed caller armed'])
    git(fixture.worktree, ['push', 'origin', 'main'])
    fixture.remoteBranchSha = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(
      fixture,
      false,
      staleEnabledRepository,
      defaultBuildRunPreferences
    )

    const committed = git(fixture.worktree, [
      'cat-file',
      'blob',
      `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    assert.equal(committed.trim(), canonicalPublic.trim())
    assert.match(committed, /Private repository opt-in: disabled/)
    assert.match(committed, /\|\| false/)
    const head = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), head)
    assert.notEqual(head, fixture.remoteBranchSha)
    assert.equal(
      fixture.notifications.at(-1)?.title,
      'Cloud compression policy published'
    )
  })

  it('closes an armed private caller when storage moves from Release to GHCR', async t => {
    const fixture = await setupFixture(t)
    const releasePreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsCloudCompression: true,
      cheapLfsStorageProvider: 'release' as const,
    }
    const ghcrPreferences = {
      ...releasePreferences,
      cheapLfsStorageProvider: 'ghcr' as const,
    }
    const privateRepository = repositoryAt(
      fixture.worktree,
      true,
      ghcrPreferences
    )
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPrivate, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'managed caller armed'])
    git(fixture.worktree, ['push', 'origin', 'main'])
    fixture.remoteBranchSha = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture, false, privateRepository, ghcrPreferences)

    const committed = git(fixture.worktree, [
      'cat-file',
      'blob',
      `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    assert.equal(committed.trim(), canonicalPublic.trim())
    assert.match(committed, /Private repository opt-in: disabled/)
    assert.equal(
      git(fixture.bare, ['rev-parse', 'refs/heads/main']),
      git(fixture.worktree, ['rev-parse', 'HEAD'])
    )
  })

  it('removes a public Release caller when storage moves to Docker Hub', async t => {
    const fixture = await setupFixture(t)
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPublic, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'managed public caller'])
    git(fixture.worktree, ['push', 'origin', 'main'])
    fixture.remoteBranchSha = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const dockerHubPreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsStorageProvider: 'docker-hub' as const,
    }
    const publicRepository = repositoryAt(
      fixture.worktree,
      false,
      dockerHubPreferences
    )

    await runInstall(fixture, false, publicRepository, dockerHubPreferences)

    assert.equal(
      git(fixture.worktree, [
        'ls-tree',
        '--name-only',
        'HEAD',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(
      git(fixture.bare, ['rev-parse', 'refs/heads/main']),
      git(fixture.worktree, ['rev-parse', 'HEAD'])
    )
  })

  it('does not create a caller merely to record a private opt-out', async t => {
    const fixture = await setupFixture(t)
    const privateRepository = repositoryAt(fixture.worktree, true)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(
      fixture,
      false,
      privateRepository,
      defaultBuildRunPreferences
    )

    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.deepEqual(fixture.notifications, [])
    assert.deepEqual(fixture.notices, [])
  })

  it('keeps the latest private opt-out when enable then disable queue behind a restore', async t => {
    const fixture = await setupFixture(t)
    const privateRepository = repositoryAt(fixture.worktree, true)
    const enabledPreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsCloudCompression: true,
    }
    const restoreStarted = deferred<void>()
    const finishRestore = deferred<void>()
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const restore = (fixture.store as any).withCheapLfsMaterializeLock(
      fixture.repository,
      undefined,
      async () => {
        restoreStarted.resolve()
        await finishRestore.promise
        return 'restored'
      }
    ) as Promise<string>
    await restoreStarted.promise

    await Promise.all([
      fixture.store._ensureCheapLfsCloudCompressionWorkflow(
        privateRepository,
        enabledPreferences
      ),
      fixture.store._ensureCheapLfsCloudCompressionWorkflow(
        privateRepository,
        defaultBuildRunPreferences
      ),
    ])
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)

    finishRestore.resolve()
    assert.equal(await restore, 'restored')
    await waitForWorkflowReconcile(fixture)
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
  })

  it('keeps the latest private opt-in when disable then enable queue behind a restore', async t => {
    const fixture = await setupFixture(t)
    const privateRepository = repositoryAt(fixture.worktree, true)
    const enabledPreferences = {
      ...defaultBuildRunPreferences,
      cheapLfsCloudCompression: true,
    }
    const restoreStarted = deferred<void>()
    const finishRestore = deferred<void>()
    const restore = (fixture.store as any).withCheapLfsMaterializeLock(
      fixture.repository,
      undefined,
      async () => {
        restoreStarted.resolve()
        await finishRestore.promise
        return 'restored'
      }
    ) as Promise<string>
    await restoreStarted.promise

    await Promise.all([
      fixture.store._ensureCheapLfsCloudCompressionWorkflow(
        privateRepository,
        defaultBuildRunPreferences
      ),
      fixture.store._ensureCheapLfsCloudCompressionWorkflow(
        privateRepository,
        enabledPreferences
      ),
    ])
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))

    finishRestore.resolve()
    assert.equal(await restore, 'restored')
    await waitForWorkflowReconcile(fixture)
    const committed = git(fixture.worktree, [
      'cat-file',
      'blob',
      `HEAD:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    assert.equal(committed.trim(), canonicalPrivate.trim())
    assert.equal(
      git(fixture.bare, ['rev-parse', 'refs/heads/main']),
      git(fixture.worktree, ['rev-parse', 'HEAD'])
    )
  })

  it('rolls back superseded bytes and index state before a blocking latest policy returns', async t => {
    const fixture = await setupFixture(t)
    const commitReached = deferred<void>()
    const releaseCommit = deferred<void>()
    const originalCommit = (AppStore.prototype as any)
      .commitCheapLfsWorkflowPath
    Reflect.set(
      fixture.store,
      'commitCheapLfsWorkflowPath',
      async (...args: ReadonlyArray<unknown>) => {
        commitReached.resolve()
        await releaseCommit.promise
        return await originalCommit.apply(fixture.store, args)
      }
    )
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const first = fixture.store._ensureCheapLfsCloudCompressionWorkflow(
      fixture.repository,
      defaultBuildRunPreferences
    )
    await commitReached.promise
    assert.equal(
      (await readFile(fixture.workflowPath, 'utf8')).trim(),
      canonicalPublic.trim()
    )

    const visibilityUnknown = repositoryAt(fixture.worktree, null)
    const latest = fixture.store._ensureCheapLfsCloudCompressionWorkflow(
      visibilityUnknown,
      defaultBuildRunPreferences
    )
    await latest
    releaseCommit.resolve()
    await first
    await waitForWorkflowReconcile(fixture)

    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, [
        'diff',
        '--cached',
        '--name-only',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
    assert.equal(
      git(fixture.worktree, [
        'status',
        '--porcelain',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
    assert.equal(
      fixture.notices.at(-1)?.dedupeKey,
      cheapLfsWorkflowNoticeDedupeKey(
        visibilityUnknown.id,
        'visibility-unknown'
      )
    )
  })

  it('conditionally rolls back a superseded ref/index transaction before push', async t => {
    const fixture = await setupFixture(t)
    const transactionCommitted = deferred<void>()
    const releaseStatus = deferred<void>()
    let statusLoads = 0
    Reflect.set(fixture.store, '_loadStatus', async () => {
      statusLoads++
      if (statusLoads === 2) {
        transactionCommitted.resolve()
        await releaseStatus.promise
      }
    })
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const first = fixture.store._ensureCheapLfsCloudCompressionWorkflow(
      fixture.repository,
      defaultBuildRunPreferences
    )
    await transactionCommitted.promise
    assert.notEqual(git(fixture.worktree, ['rev-parse', 'HEAD']), before)

    const visibilityUnknown = repositoryAt(fixture.worktree, null)
    const latest = fixture.store._ensureCheapLfsCloudCompressionWorkflow(
      visibilityUnknown,
      defaultBuildRunPreferences
    )
    releaseStatus.resolve()
    await Promise.all([first, latest])
    await waitForWorkflowReconcile(fixture)

    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, [
        'diff',
        '--cached',
        '--name-only',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
  })

  it('rolls back a superseded transaction when push proves the remote was untouched', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const visibilityUnknown = repositoryAt(fixture.worktree, null)
    const originalCreate = (AppStore.prototype as any)
      .createCheapLfsWorkflowLocalCommitBatchingGitSession
    let rejected = false
    Reflect.set(
      fixture.store,
      'createCheapLfsWorkflowLocalCommitBatchingGitSession',
      (...args: ReadonlyArray<unknown>) => {
        const session = originalCreate.apply(fixture.store, args)
        return {
          ...session,
          operations: {
            ...session.operations,
            push: async () => {
              rejected = true
              void fixture.store._ensureCheapLfsCloudCompressionWorkflow(
                visibilityUnknown,
                defaultBuildRunPreferences
              )
              return 'rejected'
            },
          },
        }
      }
    )

    await runInstall(fixture)
    await waitForWorkflowReconcile(fixture)

    assert.equal(rejected, true)
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, [
        'diff',
        '--cached',
        '--name-only',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      ''
    )
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
  })

  it('waits for an active restore before writing, committing, or publishing', async t => {
    const fixture = await setupFixture(t)
    const restoreStarted = deferred<void>()
    const finishRestore = deferred<void>()
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const restore = (fixture.store as any).withCheapLfsMaterializeLock(
      fixture.repository,
      undefined,
      async () => {
        restoreStarted.resolve()
        await finishRestore.promise
        return 'restored'
      }
    ) as Promise<string>
    await restoreStarted.promise

    let installSettled = false
    const install = runInstall(fixture).then(() => {
      installSettled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(installSettled, false)
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)

    finishRestore.resolve()
    assert.equal(await restore, 'restored')
    await install
    assert.equal(installSettled, true)
    const after = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.notEqual(after, before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), after)
  })

  it('waits for an accepted commit owner before publishing', async t => {
    const fixture = await setupFixture(t)
    const commitStarted = deferred<void>()
    const finishCommit = deferred<void>()
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const commit = (fixture.store as any).withIsCommitting(
      fixture.repository,
      async () => {
        commitStarted.resolve()
        await finishCommit.promise
        return true
      }
    ) as Promise<boolean>
    await commitStarted.promise

    let installSettled = false
    const install = runInstall(fixture).then(() => {
      installSettled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(installSettled, false)
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)

    finishCommit.resolve()
    assert.equal(await commit, true)
    await install
    const after = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.notEqual(after, before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), after)
  })

  it('rejects a create-only workflow push when the remote branch appears after inspection', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    git(fixture.bare, ['update-ref', '-d', 'refs/heads/main'])
    fixture.remoteBranchSha = null
    const originalProof = (AppStore.prototype as any)
      .proveCheapLfsWorkflowCommit
    let injected = false
    Reflect.set(
      fixture.store,
      'proveCheapLfsWorkflowCommit',
      async (...args: ReadonlyArray<unknown>) => {
        if (!injected) {
          injected = true
          git(fixture.bare, ['update-ref', 'refs/heads/main', before])
        }
        return await originalProof.apply(fixture.store, args)
      }
    )

    await runInstall(fixture)

    assert.equal(injected, true)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.notEqual(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(fixture.notices.length, 1)
    assert.equal(
      fixture.notifications.some(
        notice => notice.title === 'Cloud compression policy published'
      ),
      false
    )
  })

  it('rejects a workflow push when the existing remote branch moves after inspection', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const tree = git(fixture.bare, ['rev-parse', `${before}^{tree}`])
    const competing = git(fixture.bare, [
      'commit-tree',
      tree,
      '-p',
      before,
      '-m',
      'competing remote commit',
    ])
    const originalProof = (AppStore.prototype as any)
      .proveCheapLfsWorkflowCommit
    let injected = false
    Reflect.set(
      fixture.store,
      'proveCheapLfsWorkflowCommit',
      async (...args: ReadonlyArray<unknown>) => {
        if (!injected) {
          injected = true
          git(fixture.bare, [
            'update-ref',
            'refs/heads/main',
            competing,
            before,
          ])
        }
        return await originalProof.apply(fixture.store, args)
      }
    )

    await runInstall(fixture)

    assert.equal(injected, true)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), competing)
    assert.equal(fixture.notices.length, 1)
    assert.equal(
      fixture.notifications.some(
        notice => notice.title === 'Cloud compression policy published'
      ),
      false
    )
  })

  it('proves the workflow parent, sole path, symbolic branch, and exact local default ref', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const publication = {
      hasGitHubRepository: true,
      remoteName: 'origin',
      branchName: 'main',
      defaultBranchName: 'main',
      remoteBranchRef: 'refs/heads/main',
      localTipShaBeforeCommit: before,
      remoteBranchSha: before,
    }
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPublic, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'workflow only'])
    const workflowOnly = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const expectedWorkingTree = (
      await inspectCheapLfsCloudCompressionWorkflow(fixture.repository)
    ).snapshot
    assert.notEqual(expectedWorkingTree, null)
    const workflowBlob = git(fixture.worktree, [
      'rev-parse',
      `${workflowOnly}:${CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH}`,
    ])
    const receipt = {
      commitSha: workflowOnly,
      expectedBlobSha: workflowBlob,
      expectedWorkingTree,
      index: {
        indexPath: join(fixture.worktree, '.git', 'index'),
        priorContents: Buffer.alloc(0),
        committedContents: Buffer.alloc(0),
        priorEntry: '',
        committedEntry: '',
      },
    }
    assert.equal(
      await (fixture.store as any).proveCheapLfsWorkflowCommit(
        fixture.repository,
        publication,
        receipt
      ),
      true
    )

    git(fixture.worktree, ['checkout', '-b', 'external-checkout', before])
    assert.equal(
      await (fixture.store as any).proveCheapLfsWorkflowCommit(
        fixture.repository,
        publication,
        receipt
      ),
      false
    )
    git(fixture.worktree, ['checkout', 'main'])
    git(fixture.worktree, [
      'update-ref',
      'refs/heads/main',
      before,
      workflowOnly,
    ])
    assert.equal(
      await (fixture.store as any).proveCheapLfsWorkflowCommit(
        fixture.repository,
        publication,
        receipt
      ),
      false
    )

    git(fixture.worktree, ['reset', '--hard', before])
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPublic, 'utf8')
    await writeFile(join(fixture.worktree, 'extra.txt'), 'extra\n', 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      'extra.txt',
    ])
    git(fixture.worktree, ['commit', '-m', 'workflow plus extra'])
    const extraPath = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(
      await (fixture.store as any).proveCheapLfsWorkflowCommit(
        fixture.repository,
        publication,
        { ...receipt, commitSha: extraPath }
      ),
      false
    )

    git(fixture.worktree, ['reset', '--hard', before])
    await writeFile(
      join(fixture.worktree, 'external.txt'),
      'external\n',
      'utf8'
    )
    git(fixture.worktree, ['add', '--', 'external.txt'])
    git(fixture.worktree, ['commit', '-m', 'external parent'])
    await mkdir(dirname(fixture.workflowPath), { recursive: true })
    await writeFile(fixture.workflowPath, canonicalPublic, 'utf8')
    git(fixture.worktree, [
      'add',
      '--',
      CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
    ])
    git(fixture.worktree, ['commit', '-m', 'workflow after external parent'])
    const wrongParent = git(fixture.worktree, ['rev-parse', 'HEAD'])
    assert.equal(
      await (fixture.store as any).proveCheapLfsWorkflowCommit(
        fixture.repository,
        publication,
        { ...receipt, commitSha: wrongParent }
      ),
      false
    )
  })

  it('refuses the local ref update when an external checkout changes symbolic HEAD first', async t => {
    const fixture = await setupFixture(t)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])
    const originalMatch = (AppStore.prototype as any)
      .cheapLfsWorkflowHeadMatches
    let switched = false
    Reflect.set(
      fixture.store,
      'cheapLfsWorkflowHeadMatches',
      async (...args: ReadonlyArray<unknown>) => {
        if (!switched) {
          switched = true
          git(fixture.worktree, [
            'update-ref',
            'refs/heads/external-before-workflow-ref',
            before,
          ])
          git(fixture.worktree, [
            'symbolic-ref',
            'HEAD',
            'refs/heads/external-before-workflow-ref',
          ])
        }
        return await originalMatch.apply(fixture.store, args)
      }
    )

    await runInstall(fixture)

    assert.equal(switched, true)
    assert.equal(
      git(fixture.worktree, ['rev-parse', 'refs/heads/main']),
      before
    )
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(
      git(fixture.worktree, ['symbolic-ref', '--short', 'HEAD']),
      'external-before-workflow-ref'
    )
    assert.equal(
      git(fixture.worktree, [
        'rev-list',
        '--all',
        '--count',
        '--',
        CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH,
      ]),
      '0'
    )
  })

  it('does not write, commit, push, or report success from a non-default branch', async t => {
    const fixture = await setupFixture(t)
    git(fixture.worktree, ['checkout', '-b', 'topic/policy'])
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture)

    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.equal(fixture.notifications.length, 1)
    assert.equal(
      fixture.notifications[0].title,
      'Cloud compression policy is waiting for the default branch'
    )
    assert.deepEqual(fixture.notices, [])
  })

  it('fails accurately without mutating when GitHub has no proven default branch', async t => {
    const fixture = await setupFixture(t)
    const withoutDefaultBranch = repositoryAt(
      fixture.worktree,
      false,
      defaultBuildRunPreferences,
      null
    )
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture, false, withoutDefaultBranch)

    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.equal(git(fixture.bare, ['rev-parse', 'refs/heads/main']), before)
    assert.deepEqual(fixture.notifications, [])
    assert.equal(fixture.notices.length, 1)
    assert.equal(
      fixture.notices[0].title,
      'Could not publish cloud compression policy'
    )
  })

  it('fails closed and reports when GitHub has not confirmed visibility', async t => {
    const fixture = await setupFixture(t)
    const unknown = repositoryAt(fixture.worktree, null)
    const before = git(fixture.worktree, ['rev-parse', 'HEAD'])

    await runInstall(fixture, false, unknown)

    // Neither route ran, and the blocker was reported rather than guessed past.
    await assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
    assert.equal(git(fixture.worktree, ['rev-parse', 'HEAD']), before)
    assert.deepEqual(fixture.notifications, [])
    assert.equal(fixture.notices.length, 1)
    assert.equal(
      fixture.notices[0].dedupeKey,
      cheapLfsWorkflowNoticeDedupeKey(unknown.id, 'visibility-unknown')
    )
    assert.equal(
      fixture.notices[0].title,
      'Cloud compression is waiting on repository visibility'
    )
  })

  it('writes nothing when the working tree already holds the canonical caller', async t => {
    const fixture = await setupFixture(t)
    const inspection = await inspectCheapLfsCloudCompressionWorkflow(
      fixture.repository
    )
    assert.equal(inspection.contents, null)
    assert.equal(inspection.canonicalContents, canonicalPublic)
    // A read-only inspection must not create `.github/workflows`.
    assert.rejects(() => readFile(fixture.workflowPath, 'utf8'))
  })
})
