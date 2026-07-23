import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { createHash } from 'node:crypto'
import * as path from 'path'
import { chmod, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { pathExists } from '../../../src/lib/path-exists'

import { Repository } from '../../../src/models/repository'
import {
  createCommit,
  getCommits,
  getCommit,
  getChangedFiles,
  getWorkingDirectoryDiff,
  createMergeCommit,
  executeCommitWithHeadRecovery,
  git,
  GitError,
} from '../../../src/lib/git'

import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupConflictedRepo,
  setupConflictedRepoWithMultipleFiles,
} from '../../helpers/repositories'

import { exec } from 'dugite'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
  UnmergedEntrySummary,
  GitStatusEntry,
  isManualConflict,
} from '../../../src/models/status'
import {
  DiffSelectionType,
  DiffSelection,
  ITextDiff,
  DiffType,
} from '../../../src/models/diff'
import { getStatusOrThrow } from '../../helpers/status'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import { isConflictedFile } from '../../../src/lib/status'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  assert.equal(diff.kind, DiffType.Text)
  return diff as ITextDiff
}

describe('git/commit', () => {
  describe('post-commit maintenance recovery', () => {
    it('accepts a verified commit created before Git reports a maintenance failure', async () => {
      const before = 'a'.repeat(40)
      const after = 'b'.repeat(40)
      const maintenanceError = new Error('automatic packing failed')
      let head = before
      let notificationCount = 0
      let transition: ReadonlyArray<string | null | boolean> | undefined
      const attempt = {
        treeSha: 'c'.repeat(40),
        parentShas: [before],
        message: 'attempted message\n',
        headRef: 'refs/heads/main',
        cleanupMode: 'whitespace' as const,
        allowMessageChange: false,
        allowTreeChange: false,
      }

      const sha = await executeCommitWithHeadRecovery(
        {
          resolveHead: async () => head,
          captureAttempt: async () => attempt,
          executeCommit: async () => {
            head = after
            throw maintenanceError
          },
          verifyFailureEvidence: async () => true,
          verifyTransition: async (oldHead, newHead, amend, proof) => {
            transition = [oldHead, newHead, amend]
            assert.equal(proof, attempt)
            return true
          },
          abbreviate: async value => value.substring(0, 7),
        },
        false,
        () => notificationCount++
      )

      assert.equal(sha, 'bbbbbbb')
      assert.deepEqual(transition, [before, after, false])
      assert.equal(notificationCount, 1)
    })

    it('returns a stable verified prefix when abbreviation fails', async () => {
      const before = 'a'.repeat(40)
      const after = 'b'.repeat(40)
      let head = before

      const sha = await executeCommitWithHeadRecovery(
        {
          resolveHead: async () => head,
          captureAttempt: async () => ({
            treeSha: 'c'.repeat(40),
            parentShas: [before],
            message: 'attempted message\n',
            headRef: 'refs/heads/main',
            cleanupMode: 'whitespace',
            allowMessageChange: false,
            allowTreeChange: false,
          }),
          executeCommit: async () => {
            head = after
            throw new Error('maintenance failed')
          },
          verifyFailureEvidence: async () => true,
          verifyTransition: async () => true,
          abbreviate: async () => {
            throw new Error('rev-parse unavailable')
          },
        },
        false
      )

      assert.equal(sha, 'bbbbbbb')
    })

    it('keeps a genuine commit failure when HEAD did not advance', async () => {
      const head = 'a'.repeat(40)
      const commitError = new Error('commit rejected')
      let verificationCount = 0
      let notificationCount = 0

      await assert.rejects(
        executeCommitWithHeadRecovery(
          {
            resolveHead: async () => head,
            captureAttempt: async () => ({
              treeSha: 'c'.repeat(40),
              parentShas: [head],
              message: 'attempted message\n',
              headRef: 'refs/heads/main',
              cleanupMode: 'whitespace' as const,
              allowMessageChange: false,
              allowTreeChange: false,
            }),
            executeCommit: async () => {
              throw commitError
            },
            verifyFailureEvidence: async () => true,
            verifyTransition: async () => {
              verificationCount++
              return true
            },
            abbreviate: async value => value.substring(0, 7),
          },
          false,
          () => notificationCount++
        ),
        error => error === commitError
      )

      assert.equal(verificationCount, 0)
      assert.equal(notificationCount, 0)
    })

    it('rejects an unverified HEAD change instead of assuming a commit exists', async () => {
      const before = 'a'.repeat(40)
      const after = 'b'.repeat(40)
      const commitError = new Error('reachable commit verification failed')
      let head = before
      let notificationCount = 0

      await assert.rejects(
        executeCommitWithHeadRecovery(
          {
            resolveHead: async () => head,
            captureAttempt: async () => ({
              treeSha: 'c'.repeat(40),
              parentShas: [before],
              message: 'attempted message\n',
              headRef: 'refs/heads/main',
              cleanupMode: 'whitespace' as const,
              allowMessageChange: false,
              allowTreeChange: false,
            }),
            executeCommit: async () => {
              head = after
              throw commitError
            },
            verifyFailureEvidence: async () => true,
            verifyTransition: async () => false,
            abbreviate: async value => value.substring(0, 7),
          },
          false,
          () => notificationCount++
        ),
        error => error === commitError
      )

      assert.equal(notificationCount, 0)
    })

    it('fails closed when the attempted tree/message proof is unavailable', async () => {
      const before = 'a'.repeat(40)
      const after = 'b'.repeat(40)
      const commitError = new Error('commit command failed after moving HEAD')
      let head = before
      let verificationCount = 0

      await assert.rejects(
        executeCommitWithHeadRecovery(
          {
            resolveHead: async () => head,
            captureAttempt: async () => null,
            executeCommit: async () => {
              head = after
              throw commitError
            },
            verifyFailureEvidence: async () => true,
            verifyTransition: async () => {
              verificationCount++
              return true
            },
            abbreviate: async value => value.substring(0, 7),
          },
          false
        ),
        error => error === commitError
      )

      assert.equal(verificationCount, 0)
    })
  })

  describe('createCommit normal', () => {
    it('force-includes an exact ignored control file even when it is deselected', async t => {
      const repo = await setupEmptyRepository(t)
      const keyRelativePath = '.desktop-material/cheap-lfs-registry-key-v1'
      const keyText = `desktop-material-cheap-lfs-registry-key-v1\n${Buffer.alloc(
        32,
        0x31
      ).toString('base64url')}\n`
      await writeFile(
        path.join(repo.path, '.gitignore'),
        '.desktop-material/\n'
      )
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      await createCommit(
        repo,
        'base',
        (
          await getStatusOrThrow(repo)
        ).workingDirectory.files
      )
      await mkdir(path.join(repo.path, '.desktop-material'))
      await writeFile(path.join(repo.path, keyRelativePath), keyText)
      await writeFile(path.join(repo.path, 'selected.txt'), 'selected\n')
      const selected = (await getStatusOrThrow(repo)).workingDirectory.files
      assert.deepEqual(
        selected.map(file => file.path),
        ['selected.txt']
      )

      await createCommit(repo, 'pointer and key', selected, {
        requiredFiles: [
          {
            relativePath: keyRelativePath,
            contentSha256: createHash('sha256')
              .update(keyText, 'utf8')
              .digest('hex'),
          },
        ],
      })

      const committed = await git(
        ['show', `HEAD:${keyRelativePath}`],
        repo.path,
        'readIgnoredRequiredCommitFile'
      )
      assert.equal(committed.stdout, keyText)
    })

    it('overrides a deselected tracked key change with the exact required bytes', async t => {
      const repo = await setupEmptyRepository(t)
      const keyRelativePath = '.desktop-material/cheap-lfs-registry-key-v1'
      const keyPath = path.join(repo.path, keyRelativePath)
      const oldText = `desktop-material-cheap-lfs-registry-key-v1\n${Buffer.alloc(
        32,
        0x41
      ).toString('base64url')}\n`
      const newText = `desktop-material-cheap-lfs-registry-key-v1\n${Buffer.alloc(
        32,
        0x42
      ).toString('base64url')}\n`
      await mkdir(path.dirname(keyPath))
      await writeFile(keyPath, oldText)
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      await exec(
        ['add', '--force', '--', keyRelativePath, 'base.txt'],
        repo.path
      )
      await exec(['commit', '-m', 'base'], repo.path)
      await writeFile(keyPath, newText)
      await writeFile(path.join(repo.path, 'selected.txt'), 'selected\n')
      const selected = (
        await getStatusOrThrow(repo)
      ).workingDirectory.files.filter(file => file.path === 'selected.txt')

      await createCommit(repo, 'changed key', selected, {
        requiredFiles: [
          {
            relativePath: keyRelativePath,
            contentSha256: createHash('sha256')
              .update(newText, 'utf8')
              .digest('hex'),
          },
        ],
      })

      assert.equal(
        (
          await git(
            ['show', `HEAD:${keyRelativePath}`],
            repo.path,
            'readChangedRequiredCommitFile'
          )
        ).stdout,
        newText
      )
    })

    it('rolls back when a hook removes a required file from the commit tree', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      await exec(['add', '--', 'base.txt'], repo.path)
      await exec(['commit', '-m', 'base'], repo.path)
      const before = (
        await exec(['rev-parse', 'HEAD'], repo.path)
      ).stdout.trim()
      const keyRelativePath = '.desktop-material/cheap-lfs-registry-key-v1'
      const keyText = `desktop-material-cheap-lfs-registry-key-v1\n${Buffer.alloc(
        32,
        0x51
      ).toString('base64url')}\n`
      await mkdir(path.join(repo.path, '.desktop-material'))
      await writeFile(path.join(repo.path, keyRelativePath), keyText)
      await writeFile(path.join(repo.path, 'selected.txt'), 'selected\n')
      const selected = (await getStatusOrThrow(repo)).workingDirectory.files

      await assert.rejects(
        createCommit(
          repo,
          'unsafe hook',
          selected,
          {
            requiredFiles: [
              {
                relativePath: keyRelativePath,
                contentSha256: createHash('sha256')
                  .update(keyText, 'utf8')
                  .digest('hex'),
              },
            ],
          },
          {
            runCommit: async (args, cwd, name, options) => {
              // Simulate an enabled pre-commit hook mutating the reviewed index
              // without depending on the packaged hook proxy test fixture.
              await exec(
                ['rm', '--cached', '--ignore-unmatch', '--', keyRelativePath],
                cwd
              )
              return await git(args, cwd, name, options)
            },
          }
        ),
        /unsafe commit was rolled back/i
      )
      assert.equal(
        (await exec(['rev-parse', 'HEAD'], repo.path)).stdout.trim(),
        before
      )
      await assert.rejects(
        git(
          ['show', `HEAD:${keyRelativePath}`],
          repo.path,
          'proveRequiredFileNotCommitted'
        )
      )
    })

    it('commits the given files', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)
      await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files
      assert.equal(files.length, 1)

      const sha = await createCommit(repository, 'Special commit', files)
      assert.equal(sha.length, 7)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commits = await getCommits(repository, 'HEAD', 100)
      assert.equal(commits.length, 6)
      assert.equal(commits[0].summary, 'Special commit')
      assert.equal(commits[0].sha.substring(0, 7), sha)
    })

    it('disables auto-GC only for the commit command', async t => {
      const repo = await setupEmptyRepository(t)
      await exec(['config', '--local', 'gc.auto', '123'], repo.path)
      await writeFile(path.join(repo.path, 'file.txt'), 'content\n')

      const status = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'commit without auto gc',
        status.workingDirectory.files
      )

      const configured = await exec(
        ['config', '--local', '--get', 'gc.auto'],
        repo.path
      )
      assert.equal(configured.exitCode, 0)
      assert.equal(configured.stdout.trim(), '123')
    })

    it('recovers -F commits with each effective commit.cleanup mode', async t => {
      const cases = [
        [
          'default',
          '  Title\n\n# commentary\nBody\n\n# ------------------------ >8 ------------------------\nAfter scissors\n',
        ],
        ['strip', '  Title\n\nBody\n\nAfter scissors\n'],
        [
          'whitespace',
          '  Title\n\n# commentary\nBody\n\n# ------------------------ >8 ------------------------\nAfter scissors\n',
        ],
        [
          'verbatim',
          '  Title  \n\n# commentary\nBody  \n\n# ------------------------ >8 ------------------------\nAfter scissors  \n',
        ],
        [
          'scissors',
          '  Title\n\n# commentary\nBody\n\n# ------------------------ >8 ------------------------\nAfter scissors\n',
        ],
      ] as const

      for (const [cleanupMode, expectedMessage] of cases) {
        await t.test(cleanupMode, async child => {
          const repo = await setupEmptyRepository(child)
          await exec(
            ['config', '--local', 'commit.cleanup', cleanupMode],
            repo.path
          )
          await writeFile(path.join(repo.path, 'file.txt'), 'content\n')
          const status = await getStatusOrThrow(repo)
          const inputMessage =
            '  Title  \n\n# commentary\nBody  \n\n# ------------------------ >8 ------------------------\nAfter scissors  \n'
          let warningCount = 0

          await createCommit(
            repo,
            inputMessage,
            status.workingDirectory.files,
            { onRecoveredPostCommitFailure: () => warningCount++ },
            {
              runCommit: async (args, cwd, name, options) => {
                const result = await git(args, cwd, name, options)
                throw new GitError(
                  { ...result, exitCode: 1 },
                  args,
                  `synthetic ${cleanupMode} maintenance failure`
                )
              },
            }
          )

          const object = await exec(['cat-file', 'commit', 'HEAD'], repo.path)
          const messageStart = object.stdout.indexOf('\n\n')
          assert.notEqual(messageStart, -1)
          assert.equal(object.stdout.slice(messageStart + 2), expectedMessage)
          assert.equal(warningCount, 1)
        })
      }
    })

    it('recovers a verified amended commit after a simulated late failure', async t => {
      const repo = await setupEmptyRepository(t)
      const filePath = path.join(repo.path, 'file.txt')
      await writeFile(filePath, 'before\n')
      let status = await getStatusOrThrow(repo)
      await createCommit(repo, 'before amend', status.workingDirectory.files)
      const before = await exec(['rev-parse', 'HEAD'], repo.path)

      await writeFile(filePath, 'after\n')
      status = await getStatusOrThrow(repo)
      let warningCount = 0
      const shortSha = await createCommit(
        repo,
        'after amend',
        status.workingDirectory.files,
        {
          amend: true,
          onRecoveredPostCommitFailure: () => warningCount++,
        },
        {
          runCommit: async (args, cwd, name, options) => {
            const result = await git(args, cwd, name, options)
            throw new GitError(
              { ...result, exitCode: 1 },
              args,
              'synthetic amend maintenance failure'
            )
          },
        }
      )

      const after = await exec(['rev-parse', 'HEAD'], repo.path)
      assert.notEqual(after.stdout.trim(), before.stdout.trim())
      assert.equal(shortSha, after.stdout.trim().slice(0, shortSha.length))
      const commits = await exec(['rev-list', '--count', 'HEAD'], repo.path)
      assert.equal(commits.stdout.trim(), '1')
      assert.equal(warningCount, 1)
    })

    it('recovers one real hook-mutated commit after a simulated post-commit failure', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      let status = await getStatusOrThrow(repo)
      await createCommit(repo, 'base', status.workingDirectory.files)

      const hooksPath = path.join(repo.resolvedGitDir, 'hooks')
      await mkdir(hooksPath, { recursive: true })
      const preCommitHook = path.join(hooksPath, 'pre-commit')
      const commitMessageHook = path.join(hooksPath, 'commit-msg')
      const postCommitHook = path.join(hooksPath, 'post-commit')
      await Promise.all([
        writeFile(
          preCommitHook,
          ['#!/bin/sh', 'git add -- hook-added.txt', ''].join('\n')
        ),
        writeFile(
          commitMessageHook,
          ['#!/bin/sh', `printf '\\nHook-mutated message\\n' >> "$1"`, ''].join(
            '\n'
          )
        ),
        writeFile(
          postCommitHook,
          [
            '#!/bin/sh',
            `printf 'changed after commit\\n' > "$(git rev-parse --git-path COMMIT_EDITMSG)"`,
            `printf 'staged after commit\\n' > post-hook.txt`,
            'git add -- post-hook.txt',
            '',
          ].join('\n')
        ),
      ])
      await Promise.all([
        chmod(preCommitHook, 0o755),
        chmod(commitMessageHook, 0o755),
        chmod(postCommitHook, 0o755),
      ])

      await Promise.all([
        writeFile(path.join(repo.path, 'selected.txt'), 'selected\n'),
        writeFile(path.join(repo.path, 'hook-added.txt'), 'hook-added\n'),
      ])
      status = await getStatusOrThrow(repo)
      const selected = status.workingDirectory.files.find(
        file => file.path === 'selected.txt'
      )
      assert(selected !== undefined)

      let warningCount = 0
      let commitCommand: ReadonlyArray<string> | undefined
      const sha = await createCommit(
        repo,
        'original message',
        [selected],
        { onRecoveredPostCommitFailure: () => warningCount++ },
        {
          runCommit: async (args, cwd, name, options) => {
            commitCommand = [...args]
            const result = await git(args, cwd, name, {
              ...options,
              // Run the fixture's hooks directly in this real-Git test.
              interceptHooks: undefined,
            })
            throw new GitError(
              { ...result, exitCode: 1 },
              args,
              'synthetic post-commit maintenance failure'
            )
          },
        }
      )

      assert.deepEqual(commitCommand?.slice(0, 3), [
        '-c',
        'gc.auto=0',
        'commit',
      ])
      assert.equal(warningCount, 1)
      const head = await exec(['rev-parse', '--short', 'HEAD'], repo.path)
      assert.equal(sha, head.stdout.trim())
      const message = await exec(['log', '-1', '--format=%B'], repo.path)
      assert.match(
        message.stdout,
        /^original message\n\nHook-mutated message\n/m
      )
      const names = await exec(
        ['show', '--pretty=format:', '--name-only', 'HEAD'],
        repo.path
      )
      assert.deepEqual(
        names.stdout
          .split(/\r?\n/)
          .filter(name => name.length > 0)
          .sort(),
        ['hook-added.txt', 'selected.txt']
      )
      const stagedAfterCommit = await exec(
        ['diff', '--cached', '--name-only'],
        repo.path
      )
      assert.equal(stagedAfterCommit.stdout.trim(), 'post-hook.txt')
      const configured = await exec(
        ['config', '--local', '--get', 'gc.auto'],
        repo.path
      )
      assert.equal(configured.exitCode, 1)
    })

    it('keeps a real hook rejection when no commit was created', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      let status = await getStatusOrThrow(repo)
      await createCommit(repo, 'base', status.workingDirectory.files)
      const before = await exec(['rev-parse', 'HEAD'], repo.path)

      const hooksPath = path.join(repo.resolvedGitDir, 'hooks')
      await mkdir(hooksPath, { recursive: true })
      const commitMessageHook = path.join(hooksPath, 'commit-msg')
      await writeFile(
        commitMessageHook,
        ['#!/bin/sh', 'echo rejected >&2', 'exit 1', ''].join('\n')
      )
      await chmod(commitMessageHook, 0o755)
      await writeFile(path.join(repo.path, 'rejected.txt'), 'rejected\n')
      status = await getStatusOrThrow(repo)
      let warningCount = 0

      await assert.rejects(() =>
        createCommit(
          repo,
          'must fail',
          status.workingDirectory.files,
          { onRecoveredPostCommitFailure: () => warningCount++ },
          {
            runCommit: (args, cwd, name, options) =>
              git(args, cwd, name, {
                ...options,
                interceptHooks: undefined,
              }),
          }
        )
      )
      const after = await exec(['rev-parse', 'HEAD'], repo.path)
      assert.equal(after.stdout.trim(), before.stdout.trim())
      assert.equal(warningCount, 0)
      const configured = await exec(
        ['config', '--local', '--get', 'gc.auto'],
        repo.path
      )
      assert.equal(configured.exitCode, 1)
    })

    it('rejects an unrelated HEAD transition instead of claiming recovery', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'base.txt'), 'base\n')
      let status = await getStatusOrThrow(repo)
      await createCommit(repo, 'base', status.workingDirectory.files)
      const hooksPath = path.join(repo.resolvedGitDir, 'hooks')
      await mkdir(hooksPath, { recursive: true })
      const inertCommitMessageHook = path.join(hooksPath, 'commit-msg')
      await writeFile(
        inertCommitMessageHook,
        ['#!/bin/sh', 'exit 0', ''].join('\n')
      )
      await chmod(inertCommitMessageHook, 0o755)
      await writeFile(path.join(repo.path, 'selected.txt'), 'selected\n')
      status = await getStatusOrThrow(repo)

      const unrelatedFailure = new Error('unrelated command replaced HEAD')
      let warningCount = 0
      await assert.rejects(
        () =>
          createCommit(
            repo,
            'intended message',
            status.workingDirectory.files,
            { onRecoveredPostCommitFailure: () => warningCount++ },
            {
              runCommit: async (_args, cwd) => {
                await git(
                  ['reset', '--mixed', '--no-recurse-submodules', 'HEAD'],
                  cwd,
                  'simulateUnrelatedCommitReset'
                )
                await git(
                  [
                    '-c',
                    'gc.auto=0',
                    'commit',
                    '--allow-empty',
                    '-m',
                    'unrelated message',
                  ],
                  cwd,
                  'simulateUnrelatedCommit'
                )
                throw unrelatedFailure
              },
            }
          ),
        error => error === unrelatedFailure
      )

      assert.equal(warningCount, 0)
      const message = await exec(['log', '-1', '--format=%s'], repo.path)
      assert.equal(message.stdout.trim(), 'unrelated message')
      const configured = await exec(
        ['config', '--local', '--get', 'gc.auto'],
        repo.path
      )
      assert.equal(configured.exitCode, 1)
    })

    it('commit does not strip commentary by default', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files
      assert.equal(files.length, 1)

      const message = `Special commit

# this is a comment`

      const sha = await createCommit(repository, message, files)
      assert.equal(sha.length, 7)

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'Special commit')
      assert.equal(commit.body, '# this is a comment\n')
      assert.equal(commit.shortSha, sha)
    })

    it('can commit for empty repository', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')
      await writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 2)

      const allChanges = [
        files[0].withIncludeAll(true),
        files[1].withIncludeAll(true),
      ]

      const sha = await createCommit(
        repo,
        'added two files\n\nthis is a description',
        allChanges
      )
      assert.equal(sha, '(root-commit)')

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 0)

      const history = await getCommits(repo, 'HEAD', 2)

      assert.equal(history.length, 1)
      assert.equal(history[0].summary, 'added two files')
      assert.equal(history[0].body, 'this is a description\n')
    })

    it('can commit renames', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 0)
    })
  })

  describe('createCommit partials', () => {
    it('can commit some lines from new file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const newFileName = 'new-file.md'

      // select first five lines of file
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(
        newFileName,
        { kind: AppFileStatusKind.New },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, newFileName)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(
        f => f.path === newFileName
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit second hunk from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, file)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        diff.hunks[0].unifiedDiffStart,
        diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart,
        false
      )

      const updatedFile = file.withSelection(selection)

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [updatedFile])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit single delete from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const fileName = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const modifiedFile = new WorkingDirectoryFileChange(
        fileName,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, modifiedFile)

      const secondRemovedLine = diff.hunks[0].unifiedDiffStart + 5

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(secondRemovedLine, 1, true)

      const file = new WorkingDirectoryFileChange(
        fileName,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, fileName)
    })

    it('can commit multiple hunks from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, file)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        diff.hunks[1].unifiedDiffStart,
        diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart,
        false
      )

      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [updatedFile])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit some lines from deleted file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const deletedFile = 'deleted-file.md'

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(
        deletedFile,
        { kind: AppFileStatusKind.Deleted },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.sha.substring(0, 7), sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, deletedFile)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(
        f => f.path === deletedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Deleted)
    })

    it('can commit renames with modifications', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)
      assert(statusAfter.currentTip !== undefined)

      assert.equal(statusAfter.workingDirectory.files.length, 0)
      assert.equal(statusAfter.currentTip.substring(0, 7), sha)
    })

    // The scenario here is that the user has staged a rename (probably using git mv)
    // and then added some lines to the newly renamed file and they only want to
    // commit one of these lines.
    it('can commit renames with partially selected modifications', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'line1\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await writeFile(path.join(repo.path, 'bar'), 'line1\nline2\nline3\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('bar'))
      assert.equal(files[0].status.kind, AppFileStatusKind.Renamed)

      const selection = files[0].selection
        .withSelectNone()
        .withLineSelection(2, true)

      const partiallySelectedFile = files[0].withSelection(selection)

      const sha = await createCommit(repo, 'renamed a file', [
        partiallySelectedFile,
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 1)

      const diff = await getTextDiff(
        repo,
        statusAfter.workingDirectory.files[0]
      )

      assert.equal(diff.hunks.length, 1)
      assert.equal(diff.hunks[0].lines.length, 4)
      assert.equal(diff.hunks[0].lines[3].text, '+line3')
    })
  })

  describe('createCommit with a merge conflict', () => {
    it('creates a merge commit', async t => {
      const repo = await setupConflictedRepo(t)
      const filePath = path.join(repo.path, 'foo')

      const inMerge = await pathExists(
        path.join(repo.path, '.git', 'MERGE_HEAD')
      )
      assert(inMerge)

      await writeFile(filePath, 'b1b2')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert.equal(files[0].path, 'foo')

      assert.deepStrictEqual(files[0].status, {
        kind: AppFileStatusKind.Conflicted,
        entry: {
          kind: 'conflicted',
          action: UnmergedEntrySummary.BothModified,
          them: GitStatusEntry.UpdatedButUnmerged,
          us: GitStatusEntry.UpdatedButUnmerged,
          submoduleStatus: undefined,
        },
        conflictMarkerCount: 0,
      })

      const selection = files[0].selection.withSelectAll()
      const selectedFile = files[0].withSelection(selection)
      const sha = await createCommit(repo, 'Merge commit!', [selectedFile])
      assert.equal(sha.length, 7)

      const commits = await getCommits(repo, 'HEAD', 5)
      assert.equal(commits[0].parentSHAs.length, 2)
      assert.equal(commits[0]!.shortSha, sha)
    })
  })

  describe('createMergeCommit', () => {
    describe('with a simple merge conflict', () => {
      describe('with a merge conflict', () => {
        it('creates a merge commit', async t => {
          const repository = await setupConflictedRepo(t)

          const status = await getStatusOrThrow(repository)
          const trackedFiles = status.workingDirectory.files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )
          const sha = await createMergeCommit(repository, trackedFiles)
          const newStatus = await getStatusOrThrow(repository)
          assert.equal(sha.length, 7)
          assert.equal(newStatus.workingDirectory.files.length, 0)
        })

        it('surfaces a warning after recovering a verified merge commit', async t => {
          const repository = await setupConflictedRepo(t)
          const status = await getStatusOrThrow(repository)
          const trackedFiles = status.workingDirectory.files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )
          let warningCount = 0

          const sha = await createMergeCommit(
            repository,
            trackedFiles,
            new Map(),
            { onRecoveredPostCommitFailure: () => warningCount++ },
            {
              runCommit: async (args, cwd, name, options) => {
                const result = await git(args, cwd, name, options)
                throw new GitError(
                  { ...result, exitCode: 1 },
                  args,
                  'synthetic merge maintenance failure'
                )
              },
            }
          )

          const commit = await getCommit(repository, 'HEAD')
          assert(commit !== null)
          assert.equal(commit.parentSHAs.length, 2)
          assert.equal(commit.shortSha, sha)
          assert.equal(warningCount, 1)
        })
      })
    })

    describe('with a merge conflict and manual resolutions', () => {
      it('keeps files chosen to be added and commits', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['bar', ManualConflictResolution.ours],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(await pathExists(path.join(repository.path, 'bar')), true)
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('deletes files chosen to be removed and commits', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['bar', ManualConflictResolution.theirs],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(await pathExists(path.join(repository.path, 'bar')), false)
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('checks out our content for file added in both branches', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['baz', ManualConflictResolution.ours],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(
          await readFile(path.join(repository.path, 'baz'), 'utf8'),
          'b2'
        )
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('checks out their content for file added in both branches', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['baz', ManualConflictResolution.theirs],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(
          await readFile(path.join(repository.path, 'baz'), 'utf8'),
          'b1'
        )
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      describe('binary file conflicts', () => {
        const setup = async (t: TestContext) => {
          const repoPath = await setupFixtureRepository(
            t,
            'detect-conflict-in-binary-file'
          )
          const repository = new Repository(repoPath, -1, null, false)
          const fileName = 'my-cool-image.png'

          await exec(['checkout', 'master'], repoPath)

          const fileContentsTheirs = await readFile(
            path.join(repoPath, fileName),
            'utf8'
          )

          await exec(['checkout', 'make-a-change'], repoPath)

          const fileContentsOurs = await readFile(
            path.join(repoPath, fileName),
            'utf8'
          )

          return { repository, fileContentsTheirs, fileContentsOurs }
        }

        it('chooses `their` version of a file and commits', async t => {
          const { repository, fileContentsTheirs, fileContentsOurs } =
            await setup(t)

          await exec(['merge', 'master'], repository.path)

          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          assert.equal(files.length, 1)

          const file = files[0]
          assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
          assert.equal(
            isConflictedFile(file.status) && isManualConflict(file.status),
            true
          )

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.theirs],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          assert.notEqual(fileContents, fileContentsOurs)
          assert.equal(fileContents, fileContentsTheirs)
        })

        it('chooses `our` version of a file and commits', async t => {
          const { repository, fileContentsOurs } = await setup(t)

          await exec(['merge', 'master'], repository.path)

          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          assert.equal(files.length, 1)

          const file = files[0]
          assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
          assert.equal(
            isConflictedFile(file.status) && isManualConflict(file.status),
            true
          )

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.ours],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          assert.equal(fileContents, fileContentsOurs)
        })
      })
    })

    describe('with no changes', () => {
      it('throws an error', async t => {
        const repository = new Repository(
          await setupFixtureRepository(t, 'test-repo'),
          -1,
          null,
          false
        )
        const status = await getStatusOrThrow(repository)
        await assert.rejects(
          () => createMergeCommit(repository, status.workingDirectory.files),
          /There are no changes to commit./
        )
      })
    })
  })

  describe('index corner cases', () => {
    it('can commit when staged new file is then deleted', async t => {
      let status,
        files = null

      const repo = await setupEmptyRepository(t)

      const firstPath = path.join(repo.path, 'first')
      const secondPath = path.join(repo.path, 'second')

      await writeFile(firstPath, 'line1\n')
      await writeFile(secondPath, 'line2\n')

      await exec(['add', '.'], repo.path)

      await unlink(firstPath)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('second'))
      assert.equal(files[0].status.kind, AppFileStatusKind.New)

      const toCommit = status.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit everything', toCommit.files)
      assert.equal(sha, '(root-commit)')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'commit everything')
    })

    it('can commit when a delete is staged and the untracked file exists', async t => {
      let status,
        files = null

      const repo = await setupEmptyRepository(t)

      const firstPath = path.join(repo.path, 'first')
      await writeFile(firstPath, 'line1\n')

      await exec(['add', 'first'], repo.path)
      await exec(['commit', '-am', 'commit first file'], repo.path)
      await exec(['rm', '--cached', 'first'], repo.path)

      // if the text is now different, everything is fine
      await writeFile(firstPath, 'line2\n')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('first'))
      assert.equal(files[0].status.kind, AppFileStatusKind.Untracked)

      const toCommit = status.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit again!', toCommit.files)
      assert.equal(sha.length, 7)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'commit again!')
      assert.equal(commit.shortSha, sha)
    })

    it('file is deleted in index', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'secret'), 'contents\n')
      await writeFile(path.join(repo.path, '.gitignore'), '')

      // Setup repo to reproduce bug
      await exec(['add', '.'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)

      // Make changes that should remain secret
      await writeFile(path.join(repo.path, 'secret'), 'Somethign secret\n')

      // Ignore it
      await writeFile(path.join(repo.path, '.gitignore'), 'secret')

      // Remove from index to mark as deleted
      await exec(['rm', '--cached', 'secret'], repo.path)

      // Make sure that file is marked as deleted
      const beforeCommit = await getStatusOrThrow(repo)
      const files = beforeCommit.workingDirectory.files
      assert.equal(files.length, 2)
      assert.equal(files[1].status.kind, AppFileStatusKind.Deleted)

      // Commit changes
      await createCommit(repo, 'FAIL commit', files)
      const afterCommit = await getStatusOrThrow(repo)
      assert(afterCommit.currentTip !== undefined)
      assert.notEqual(beforeCommit.currentTip, afterCommit.currentTip)

      // Verify the file was delete in repo
      const changesetData = await getChangedFiles(repo, afterCommit.currentTip)
      assert.equal(changesetData.files.length, 2)
      assert.equal(
        changesetData.files[0].status.kind,
        AppFileStatusKind.Modified
      )
      assert.equal(
        changesetData.files[1].status.kind,
        AppFileStatusKind.Deleted
      )
    })
  })

  describe('createCommit allowEmpty', () => {
    it('creates an empty commit when allowEmpty is true', async t => {
      const repo = await setupEmptyRepository(t)

      // Create an initial commit so HEAD exists
      await writeFile(path.join(repo.path, 'file.txt'), 'content\n')
      const initialStatus = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'initial commit',
        initialStatus.workingDirectory.files
      )

      // Now create an empty commit with no file changes
      const tipBefore = (await getStatusOrThrow(repo)).currentTip
      const sha = await createCommit(repo, 'empty commit', [], {
        allowEmpty: true,
      })
      assert.equal(sha.length, 7)

      const tipAfter = (await getStatusOrThrow(repo)).currentTip
      assert.notEqual(tipBefore, tipAfter)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'empty commit')
    })

    it('fails to create an empty commit when allowEmpty is not set', async t => {
      const repo = await setupEmptyRepository(t)

      // Create an initial commit so HEAD exists
      await writeFile(path.join(repo.path, 'file.txt'), 'content\n')
      const initialStatus = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'initial commit',
        initialStatus.workingDirectory.files
      )

      // Attempt to commit with no changes and no allowEmpty flag
      await assert.rejects(() => createCommit(repo, 'should fail', []))
    })
  })
})
