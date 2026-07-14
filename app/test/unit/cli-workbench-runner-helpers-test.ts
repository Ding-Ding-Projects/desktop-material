import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdir, mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CLICommandOutputLimiter,
  validateCLICommandRequest,
} from '../../src/main-process/cli-workbench/runner-helpers'

async function createRepositoryFixture(): Promise<{
  readonly root: string
  readonly repositoryPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-cli-runner-'))
  const repositoryPath = join(root, 'repository')
  await mkdir(join(repositoryPath, '.git'), { recursive: true })
  return { root, repositoryPath }
}

describe('CLI workbench runner helpers', () => {
  it('accepts only named operations in an actual repository', async () => {
    const fixture = await createRepositoryFixture()
    try {
      const request = await validateCLICommandRequest({
        id: 'run-1',
        operation: { id: 'status-summary' },
        repositoryPath: fixture.repositoryPath,
      })
      assert.equal(request.id, 'run-1')
      assert.deepEqual(request.operation, { id: 'status-summary' })
      assert.equal(
        request.repositoryPath,
        await realpath(fixture.repositoryPath)
      )
      assert.equal(request.tool, 'git')
      assert.deepEqual(request.args, ['status', '--short', '--branch'])
      assert.equal(request.confirmed, false)

      await assert.rejects(
        validateCLICommandRequest({
          id: 'run-raw-argv',
          operation: { id: 'status-summary' },
          repositoryPath: fixture.repositoryPath,
          tool: 'gh',
          args: ['repo', 'delete', 'owner/repository'],
        }),
        /request fields are invalid/
      )
      await assert.rejects(
        validateCLICommandRequest({
          id: 'run-unknown',
          operation: { id: 'git-alias-shell' },
          repositoryPath: fixture.repositoryPath,
        }),
        /Unknown CLI workbench operation/
      )
      await assert.rejects(
        validateCLICommandRequest({
          id: 'run-relative',
          operation: { id: 'status-summary' },
          repositoryPath: '.',
        }),
        /repository path is invalid/
      )
      await assert.rejects(
        validateCLICommandRequest({
          id: 'run-missing',
          operation: { id: 'status-summary' },
          repositoryPath: join(fixture.root, 'missing'),
        }),
        /does not exist/
      )
      await assert.rejects(
        validateCLICommandRequest({
          id: 'run-not-repository',
          operation: { id: 'status-summary' },
          repositoryPath: fixture.root,
        }),
        /not a Git repository/
      )
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it('derives confirmation policy from the main-owned operation registry', async () => {
    const fixture = await createRepositoryFixture()
    try {
      const request = {
        id: 'run-maintenance',
        operation: { id: 'maintenance-run' },
        repositoryPath: fixture.repositoryPath,
      } as const
      await assert.rejects(
        validateCLICommandRequest(request),
        /requires confirmation/
      )
      const confirmed = await validateCLICommandRequest({
        ...request,
        confirmed: true,
      })
      assert.deepEqual(confirmed.args, ['maintenance', 'run'])
      assert.equal(confirmed.confirmed, true)

      await assert.rejects(
        validateCLICommandRequest({
          ...request,
          confirmed: true,
          operation: {
            id: 'maintenance-run',
            requiresConfirmation: false,
          },
        }),
        /operation fields are invalid/
      )
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  it('caps combined output and preserves split UTF-8 code points', () => {
    const utf8 = new CLICommandOutputLimiter(10)
    assert.equal(utf8.write('stdout', Buffer.from([0xe2])).data, '')
    assert.equal(utf8.write('stdout', Buffer.from([0x82, 0xac])).data, '€')

    const bounded = new CLICommandOutputLimiter(4)
    assert.deepEqual(bounded.write('stdout', Buffer.from('abc')), {
      data: 'abc',
      didTruncate: false,
    })
    assert.deepEqual(bounded.write('stderr', Buffer.from('def')), {
      data: 'd',
      didTruncate: true,
    })
    assert.deepEqual(bounded.write('stdout', Buffer.from('more')), {
      data: '',
      didTruncate: false,
    })
  })
})
