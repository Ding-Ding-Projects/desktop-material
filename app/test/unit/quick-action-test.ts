import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IQuickCommitInputs,
  QuickActionVerbs,
  chooseQuickPushRemote,
  chooseQuickTrackingRemote,
  decideQuickAction,
  decideQuickCommit,
  deriveRemoteBranchName,
  isQuickActionVerb,
  quickActionLaunchArguments,
  runQuickCommitAndPush,
} from '../../src/lib/quick-action'

// Pure decision coverage: argument parsing, the window-mode decision, and the
// commit-flow gate. The git calls themselves live in the renderer module and
// are exercised through these decisions rather than against a real repository.

describe('quick action', () => {
  describe('argument parsing', () => {
    it('reports no quick action when the flag is absent', () => {
      assert.deepEqual(decideQuickAction({}), { kind: 'not-requested' })
      assert.deepEqual(decideQuickAction({ 'cli-open': 'C:\\repo' }), {
        kind: 'not-requested',
      })
    })

    it('treats a bare --quick-action with no value as not requested', () => {
      // minimist yields `false` for a negated/valueless flag; that is not a
      // request for a verb and must not be reported as a malformed one.
      assert.deepEqual(decideQuickAction({ 'quick-action': false }), {
        kind: 'not-requested',
      })
    })

    it('accepts a known verb with an absolute Windows path', () => {
      assert.deepEqual(
        decideQuickAction({
          'quick-action': 'status-commit-push',
          path: 'C:\\Users\\test\\repo',
        }),
        {
          kind: 'quick-action',
          request: {
            verb: 'status-commit-push',
            path: 'C:\\Users\\test\\repo',
          },
        }
      )
    })

    it('accepts a UNC path', () => {
      const decision = decideQuickAction({
        'quick-action': 'status-commit-push',
        path: '\\\\server\\share\\repo',
      })
      assert.equal(decision.kind, 'quick-action')
    })

    it('accepts a POSIX absolute path', () => {
      const decision = decideQuickAction({
        'quick-action': 'open-in-full-app',
        path: '/home/test/repo',
      })
      assert.equal(decision.kind, 'quick-action')
    })

    it('rejects an unknown verb', () => {
      assert.deepEqual(
        decideQuickAction({ 'quick-action': 'rm-rf', path: 'C:\\repo' }),
        { kind: 'invalid', reason: 'unknown-verb' }
      )
    })

    it('rejects a missing or empty path', () => {
      assert.deepEqual(
        decideQuickAction({ 'quick-action': 'status-commit-push' }),
        { kind: 'invalid', reason: 'missing-path' }
      )
      assert.deepEqual(
        decideQuickAction({ 'quick-action': 'status-commit-push', path: '  ' }),
        { kind: 'invalid', reason: 'missing-path' }
      )
    })

    it('rejects a non-string path', () => {
      assert.deepEqual(
        decideQuickAction({ 'quick-action': 'status-commit-push', path: 42 }),
        { kind: 'invalid', reason: 'missing-path' }
      )
    })

    it('rejects a relative path rather than resolving it', () => {
      // Resolving against the process working directory would let an unexpected
      // launch act on a folder the user never chose.
      assert.deepEqual(
        decideQuickAction({
          'quick-action': 'status-commit-push',
          path: '..\\..\\somewhere',
        }),
        { kind: 'invalid', reason: 'relative-path' }
      )
    })

    it('rejects a path containing control characters', () => {
      assert.deepEqual(
        decideQuickAction({
          'quick-action': 'status-commit-push',
          path: 'C:\\repo\u0000\\etc',
        }),
        { kind: 'invalid', reason: 'malformed-path' }
      )
    })

    it('trims surrounding whitespace from an otherwise valid path', () => {
      const decision = decideQuickAction({
        'quick-action': 'status-commit-push',
        path: '  C:\\repo  ',
      })
      assert.equal(decision.kind, 'quick-action')
      assert.equal(
        decision.kind === 'quick-action' ? decision.request.path : null,
        'C:\\repo'
      )
    })

    it('guards verbs', () => {
      assert.ok(isQuickActionVerb('status-commit-push'))
      assert.ok(isQuickActionVerb('open-in-full-app'))
      assert.equal(isQuickActionVerb('status'), false)
      assert.equal(isQuickActionVerb(null), false)
      assert.equal(QuickActionVerbs.length, 2)
    })
  })

  describe('launch arguments', () => {
    it('encodes the verb and path as separate flags', () => {
      assert.deepEqual(quickActionLaunchArguments('status-commit-push', '%V'), [
        '--quick-action=status-commit-push',
        '--path=%V',
      ])
    })

    it('round-trips through the parser', () => {
      // The generated argv and the parser must not drift apart.
      const [verbArg, pathArg] = quickActionLaunchArguments(
        'status-commit-push',
        'C:\\repo'
      )
      const args = {
        'quick-action': verbArg.split('=')[1],
        path: pathArg.split('=')[1],
      }
      assert.deepEqual(decideQuickAction(args), {
        kind: 'quick-action',
        request: { verb: 'status-commit-push', path: 'C:\\repo' },
      })
    })
  })

  describe('commit gate', () => {
    function inputs(
      overrides: Partial<IQuickCommitInputs> = {}
    ): IQuickCommitInputs {
      return {
        phase: 'ready',
        isRepository: true,
        changedFileCount: 3,
        summary: 'Fix the thing',
        currentBranch: 'main',
        ...overrides,
      }
    }

    it('allows a commit when everything is in place', () => {
      assert.equal(decideQuickCommit(inputs()), null)
    })

    it('blocks while still loading', () => {
      assert.equal(decideQuickCommit(inputs({ phase: 'loading' })), 'loading')
    })

    it('blocks when the folder is not a repository', () => {
      assert.equal(
        decideQuickCommit(inputs({ isRepository: false })),
        'not-a-repository'
      )
    })

    it('blocks while committing or pushing', () => {
      assert.equal(decideQuickCommit(inputs({ phase: 'committing' })), 'busy')
      assert.equal(decideQuickCommit(inputs({ phase: 'pushing' })), 'busy')
    })

    it('blocks on a detached HEAD', () => {
      assert.equal(
        decideQuickCommit(inputs({ currentBranch: undefined })),
        'detached-head'
      )
    })

    it('blocks with no changes', () => {
      assert.equal(
        decideQuickCommit(inputs({ changedFileCount: 0 })),
        'no-changes'
      )
    })

    it('blocks on a blank summary', () => {
      assert.equal(decideQuickCommit(inputs({ summary: '' })), 'no-summary')
      assert.equal(decideQuickCommit(inputs({ summary: '   ' })), 'no-summary')
    })

    it('reports the most fundamental blocker first', () => {
      // Loading outranks everything: nothing else is known yet.
      assert.equal(
        decideQuickCommit(
          inputs({ phase: 'loading', isRepository: false, summary: '' })
        ),
        'loading'
      )
      // Not-a-repository outranks a missing summary.
      assert.equal(
        decideQuickCommit(inputs({ isRepository: false, summary: '' })),
        'not-a-repository'
      )
    })

    it('allows a further commit after a completed one', () => {
      assert.equal(decideQuickCommit(inputs({ phase: 'done' })), null)
    })
  })

  describe('commit and push flow', () => {
    interface IRecordedPush {
      readonly remote: string
      readonly localBranch: string
      readonly remoteBranch: string | null
    }

    function harness(
      overrides: {
        readonly remotes?: ReadonlyArray<{ name: string }>
        readonly commitError?: Error
        readonly pushError?: Error
      } = {}
    ) {
      const phases: Array<string> = []
      const progress: Array<string> = []
      const pushes: Array<IRecordedPush> = []
      const commits: Array<{ summary: string; fileCount: number }> = []

      const operations = {
        createCommit: async (summary: string, files: ReadonlyArray<string>) => {
          if (overrides.commitError) {
            throw overrides.commitError
          }
          commits.push({ summary, fileCount: files.length })
          return 'abc1234'
        },
        getRemotes: async () =>
          overrides.remotes ?? [{ name: 'origin' }, { name: 'upstream' }],
        push: async (
          remote: { name: string },
          localBranch: string,
          remoteBranch: string | null,
          onProgress: (description: string) => void
        ) => {
          onProgress('Compressing objects')
          if (overrides.pushError) {
            throw overrides.pushError
          }
          pushes.push({ remote: remote.name, localBranch, remoteBranch })
        },
      }

      return { phases, progress, pushes, commits, operations }
    }

    const target = {
      files: ['a.ts', 'b.ts'],
      currentBranch: 'main',
      currentUpstreamBranch: 'origin/main',
    }

    it('commits then pushes, reporting each phase in order', async () => {
      const h = harness()
      const sha = await runQuickCommitAndPush(
        target,
        'Fix the thing',
        h.operations,
        p => h.phases.push(p),
        d => h.progress.push(d)
      )

      assert.equal(sha, 'abc1234')
      assert.deepEqual(h.phases, ['committing', 'pushing'])
      assert.deepEqual(h.commits, [{ summary: 'Fix the thing', fileCount: 2 }])
      assert.deepEqual(h.pushes, [
        { remote: 'origin', localBranch: 'main', remoteBranch: 'main' },
      ])
      assert.deepEqual(h.progress, ['Compressing objects'])
    })

    it('sets an upstream on a branch that has none', async () => {
      const h = harness()
      await runQuickCommitAndPush(
        { ...target, currentUpstreamBranch: undefined },
        'x',
        h.operations,
        p => h.phases.push(p),
        d => h.progress.push(d)
      )
      // A null remote branch is what makes push set the upstream.
      assert.equal(h.pushes[0].remoteBranch, null)
    })

    it('pushes to the configured tracking remote instead of origin', async () => {
      const h = harness()
      await runQuickCommitAndPush(
        { ...target, currentUpstreamBranch: 'upstream/release/3.6' },
        'x',
        h.operations,
        p => h.phases.push(p),
        d => h.progress.push(d)
      )

      assert.deepEqual(h.pushes, [
        {
          remote: 'upstream',
          localBranch: 'main',
          remoteBranch: 'release/3.6',
        },
      ])
    })

    it('does not redirect a missing configured upstream to origin', async () => {
      const h = harness({ remotes: [{ name: 'origin' }] })
      await assert.rejects(
        runQuickCommitAndPush(
          { ...target, currentUpstreamBranch: 'upstream/main' },
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        /configured upstream remote is unavailable or ambiguous/
      )
      assert.equal(h.commits.length, 1)
      assert.equal(h.pushes.length, 0)
    })

    it('refuses to push with no remote but keeps the commit', async () => {
      const h = harness({ remotes: [] })
      await assert.rejects(
        runQuickCommitAndPush(
          { ...target, currentUpstreamBranch: undefined },
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        // The message leads with the commit: the work is safe either way, and
        // that is the first thing the user needs to know.
        /Committed abc1234, but this repository has no remote/
      )
      assert.equal(h.commits.length, 1)
      assert.equal(h.pushes.length, 0)
    })

    it('refuses to guess between several non-origin remotes', async () => {
      const h = harness({ remotes: [{ name: 'fork' }, { name: 'upstream' }] })
      await assert.rejects(
        runQuickCommitAndPush(
          { ...target, currentUpstreamBranch: undefined },
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        /Committed abc1234, but it is not clear which remote/
      )
      assert.equal(h.pushes.length, 0)
    })

    it('pushes to the only remote when it is not named origin', async () => {
      const h = harness({ remotes: [{ name: 'fork' }] })
      await runQuickCommitAndPush(
        { ...target, currentUpstreamBranch: undefined },
        'x',
        h.operations,
        p => h.phases.push(p),
        d => h.progress.push(d)
      )
      assert.equal(h.pushes[0].remote, 'fork')
    })

    it('never reaches the push phase when the commit fails', async () => {
      const h = harness({ commitError: new Error('hook rejected the commit') })
      await assert.rejects(
        runQuickCommitAndPush(
          target,
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        /hook rejected the commit/
      )
      assert.deepEqual(h.phases, ['committing'])
    })

    it('surfaces a push failure verbatim', async () => {
      // Authentication messages are the ones users act on, so they are not
      // paraphrased.
      const h = harness({ pushError: new Error('Authentication failed') })
      await assert.rejects(
        runQuickCommitAndPush(
          target,
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        /Authentication failed/
      )
      assert.deepEqual(h.phases, ['committing', 'pushing'])
    })

    it('refuses a detached HEAD before touching git', async () => {
      const h = harness()
      await assert.rejects(
        runQuickCommitAndPush(
          { ...target, currentBranch: undefined },
          'x',
          h.operations,
          p => h.phases.push(p),
          d => h.progress.push(d)
        ),
        /not a repository on a branch/
      )
      assert.deepEqual(h.phases, [])
      assert.equal(h.commits.length, 0)
    })
  })

  describe('remote branch derivation', () => {
    it('strips the remote prefix', () => {
      assert.equal(deriveRemoteBranchName('origin/main', 'origin'), 'main')
      assert.equal(
        deriveRemoteBranchName('upstream/release/3.6', 'upstream'),
        'release/3.6'
      )
    })

    it('returns null with no upstream so push sets one', () => {
      assert.equal(deriveRemoteBranchName(undefined, 'origin'), null)
    })

    it('rejects an upstream belonging to a different remote', () => {
      assert.equal(deriveRemoteBranchName('upstream/main', 'origin'), null)
    })
  })

  describe('remote selection', () => {
    it('prefers origin', () => {
      assert.deepEqual(
        chooseQuickPushRemote([
          { name: 'upstream' },
          { name: 'origin' },
          { name: 'fork' },
        ]),
        { name: 'origin' }
      )
    })

    it('uses the only remote when there is exactly one', () => {
      assert.deepEqual(chooseQuickPushRemote([{ name: 'fork' }]), {
        name: 'fork',
      })
    })

    it('refuses to guess between several non-origin remotes', () => {
      assert.equal(
        chooseQuickPushRemote([{ name: 'fork' }, { name: 'upstream' }]),
        null
      )
    })

    it('returns null with no remotes', () => {
      assert.equal(chooseQuickPushRemote([]), null)
    })

    it('fails closed when slash-containing remote names are ambiguous', () => {
      assert.equal(
        chooseQuickTrackingRemote(
          [{ name: 'team' }, { name: 'team/fork' }, { name: 'origin' }],
          'team/fork/topic'
        ),
        null
      )
    })

    it('matches a slash-containing remote when it is unambiguous', () => {
      assert.deepEqual(
        chooseQuickTrackingRemote(
          [{ name: 'team/fork' }, { name: 'origin' }],
          'team/fork/topic'
        ),
        { name: 'team/fork' }
      )
    })

    it('returns null when the configured tracking remote is missing', () => {
      assert.equal(
        chooseQuickTrackingRemote([{ name: 'origin' }], 'upstream/release/3.6'),
        null
      )
    })
  })
})
