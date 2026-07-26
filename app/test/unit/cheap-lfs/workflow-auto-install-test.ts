import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  preferences: IBuildRunPreferences = defaultBuildRunPreferences
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
    preferences
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
    for (const policy of [
      'disabled-private',
      'visibility-unknown',
      'not-github',
    ] as const) {
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
})

describe('Cheap LFS cloud-compression workflow publish decision', () => {
  const base = {
    hasGitHubRepository: true,
    remoteName: 'origin',
    branchName: 'main',
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
    for (const boundary of [
      'public async _ensureCheapLfsCloudCompressionWorkflow(',
      'public async maybeAutoMaterializeCheapLfs(',
    ]) {
      const start = storeSource.indexOf(boundary)
      assert.notEqual(start, -1, `missing ${boundary}`)
      const body = storeSource.slice(start, start + 4_000)
      assert.match(
        body,
        /this\.maybeAutoInstallCheapLfsCloudCompressionWorkflow\(repository\)/
      )
    }
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
    // Fire-and-forget, guarded against a concurrent second install, and the
    // claim is released however the run ends.
    assert.match(body, /void this\.runCheapLfsWorkflowAutoInstall\(/)
    assert.match(
      body,
      /claimInFlight\(this\.cheapLfsWorkflowInstalls, target\)/
    )
    assert.match(body, /\.catch\(/)
    assert.match(body, /\.finally\(/)
    assert.match(body, /releaseInFlight\(/)
    assert.doesNotMatch(body, /await this\.runCheapLfsWorkflowAutoInstall\(/)
  })

  it('commits only the workflow path, with the bilingual message', () => {
    const start = storeSource.indexOf(
      'private async commitCheapLfsWorkflowPath('
    )
    assert.notEqual(start, -1)
    const body = storeSource.slice(start, start + 2_000)
    assert.match(
      body,
      /'add',\s*'--',\s*CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH/
    )
    assert.match(
      body,
      /CheapLfsWorkflowInstallCommitMessage,\s*'--',\s*CHEAP_LFS_CLOUD_COMPRESSION_WORKFLOW_PATH/
    )
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
  const fixture: IFixture = {
    repository,
    worktree,
    bare,
    notifications,
    notices,
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
    assertTemporaryRepositoryIsSafe: async () => undefined,
    _loadStatus: async () => undefined,
    _refreshRepository: async () => undefined,
    emitUpdate: () => undefined,
    postNotification: (input: { title: string; body: string }) =>
      notifications.push({ title: input.title, body: input.body }),
    postPersistentErrorNotice: (title: string, _m: string, dedupeKey: string) =>
      notices.push({ title, dedupeKey }),
    gitStoreCache: {
      get: () => ({
        remotes: [{ name: 'origin', url: bare }],
        loadBranches: async () => undefined,
      }),
    },
    readCheapLfsPublicationState: async () => ({
      hasGitHubRepository: true,
      remoteName: 'origin',
      branchName: 'main',
      localTipSha: git(worktree, ['rev-parse', 'HEAD']),
      remoteBranchSha: fixture.remoteBranchSha,
    }),
  })
  return fixture
}

async function runInstall(
  fixture: IFixture,
  replaceDivergent: boolean = false
): Promise<void> {
  await (fixture.store as any).runCheapLfsWorkflowAutoInstall(
    fixture.repository,
    replaceDivergent
  )
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
      'Cloud compression workflow added'
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
