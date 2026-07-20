import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, opendir, symlink } from 'fs/promises'
import * as Path from 'path'
import { exec } from 'dugite'

import { findRepositoriesInDirectory } from '../../../src/lib/git/find-repositories'
import { createTempDirectory } from '../../helpers/temp'

async function initializeRepository(path: string) {
  await mkdir(path, { recursive: true })
  const result = await exec(['init'], path)
  assert.equal(result.exitCode, 0, result.stderr)
}

const sorted = (paths: ReadonlyArray<string>) =>
  [...paths].sort((a, b) => a.localeCompare(b))

describe('findRepositoriesInDirectory', () => {
  it('finds repositories without entering worktrees or heavy directories', async t => {
    const rootPath = await createTempDirectory(t)
    const firstRepositoryPath = Path.join(rootPath, 'alpha')
    const secondRepositoryPath = Path.join(rootPath, 'teams', 'beta')
    const nestedRepositoryPath = Path.join(
      firstRepositoryPath,
      'nested-repository'
    )
    const dependencyRepositoryPath = Path.join(
      rootPath,
      'node_modules',
      'dependency'
    )

    await initializeRepository(firstRepositoryPath)
    await initializeRepository(secondRepositoryPath)
    await initializeRepository(nestedRepositoryPath)
    await initializeRepository(dependencyRepositoryPath)

    const result = await findRepositoriesInDirectory(rootPath)

    assert.deepEqual(
      sorted(result.repositories),
      sorted([firstRepositoryPath, secondRepositoryPath])
    )
    assert.equal(result.truncated, false)
  })

  it('reports when depth and repository-count bounds stop the scan', async t => {
    const rootPath = await createTempDirectory(t)
    const deepRepositoryPath = Path.join(rootPath, 'one', 'two', 'deep')
    await initializeRepository(deepRepositoryPath)

    const shallowResult = await findRepositoriesInDirectory(rootPath, {
      maximumDepth: 2,
    })
    assert.deepEqual(shallowResult.repositories, [])
    assert.equal(shallowResult.truncated, true)

    const deepResult = await findRepositoriesInDirectory(rootPath, {
      maximumDepth: 3,
    })
    assert.deepEqual(deepResult.repositories, [deepRepositoryPath])
    assert.equal(deepResult.truncated, false)

    const secondRepositoryPath = Path.join(rootPath, 'another-repository')
    await initializeRepository(secondRepositoryPath)
    const limitedResult = await findRepositoriesInDirectory(rootPath, {
      maximumRepositories: 1,
    })
    assert.equal(limitedResult.repositories.length, 1)
    assert.equal(limitedResult.truncated, true)
  })

  it('does not follow directory links or junctions', async t => {
    const rootPath = await createTempDirectory(t)
    const externalRootPath = await createTempDirectory(t)
    const externalRepositoryPath = Path.join(externalRootPath, 'external')
    const linkedPath = Path.join(rootPath, 'linked-folder')
    await initializeRepository(externalRepositoryPath)

    try {
      await symlink(
        externalRootPath,
        linkedPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        t.skip('This machine does not allow directory links')
        return
      }

      throw error
    }

    const result = await findRepositoriesInDirectory(rootPath)
    assert.deepEqual(result.repositories, [])
    assert.equal(result.truncated, false)
  })

  it('treats differently-cased Git markers according to the platform', async t => {
    const rootPath = await createTempDirectory(t)
    const candidatePath = Path.join(rootPath, 'candidate')
    const nestedRepositoryPath = Path.join(candidatePath, 'nested')
    await initializeRepository(nestedRepositoryPath)
    await mkdir(Path.join(candidatePath, '.GIT'))

    const result = await findRepositoriesInDirectory(rootPath)

    assert.deepEqual(
      result.repositories,
      process.platform === 'win32' ? [] : [nestedRepositoryPath]
    )
    assert.equal(result.truncated, false)
  })

  it('rejects when the selected root cannot be opened', async t => {
    const rootPath = await createTempDirectory(t)
    const rejectOpen = (async () => {
      throw new Error('synthetic access denied')
    }) as typeof opendir

    await assert.rejects(
      findRepositoriesInDirectory(rootPath, { openDirectory: rejectOpen }),
      /selected folder could not be read/
    )
  })

  it('marks a scan truncated when a descendant cannot be opened', async t => {
    const rootPath = await createTempDirectory(t)
    const repositoryPath = Path.join(rootPath, 'readable-repository')
    const unreadablePath = Path.join(rootPath, 'unreadable-folder')
    await initializeRepository(repositoryPath)
    await mkdir(unreadablePath)

    const failDescendantOpen = (async (path: string) => {
      if (Path.resolve(path) === Path.resolve(unreadablePath)) {
        throw new Error('synthetic access denied')
      }

      return opendir(path)
    }) as typeof opendir
    const result = await findRepositoriesInDirectory(rootPath, {
      openDirectory: failDescendantOpen,
    })

    assert.deepEqual(result.repositories, [repositoryPath])
    assert.equal(result.truncated, true)
  })
})
