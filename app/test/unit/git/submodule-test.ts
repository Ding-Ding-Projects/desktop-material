import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import {
  mkdir,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from 'fs/promises'

import { Repository, SubmoduleRepository } from '../../../src/models/repository'
import {
  listSubmodules,
  addSubmodule,
  validateSubmoduleAddPath,
  resetSubmodulePaths,
  parseGitModules,
  parseSubmoduleStatus,
  reconcileSubmodules,
  getSubmodules,
  setSubmoduleUrl,
  setSubmoduleBranch,
  setSubmoduleConfigKey,
  initSubmodule,
  deinitSubmodule,
  SubmoduleConfigKey,
  createSubmoduleRepository,
  revalidateSubmoduleRepository,
} from '../../../src/lib/git/submodule'
import {
  checkoutBranch,
  getBranches,
  getConfigValue,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'

describe('git/submodule', () => {
  describe('addSubmodule', () => {
    it('honors cancellation before inspecting or spawning Git', async () => {
      const repository = new Repository(
        'C:/missing/superproject',
        -1,
        null,
        false
      )
      const controller = new AbortController()
      controller.abort()

      await assert.rejects(
        addSubmodule(
          repository,
          'https://example.invalid/shared.git',
          'vendor/shared',
          null,
          { signal: controller.signal }
        ),
        (error: Error) =>
          error.name === 'AbortError' && /cancelled/.test(error.message)
      )
    })

    it('rejects live duplicate and occupied checkout paths', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const occupiedPath = path.join(testRepoPath, 'vendor', 'occupied')
      await mkdir(occupiedPath, { recursive: true })
      await writeFile(path.join(occupiedPath, 'README.md'), 'occupied\n')

      assert.match(
        (await validateSubmoduleAddPath(repository, 'foo/submodule')) ?? '',
        /already uses this path/
      )
      assert.match(
        (await validateSubmoduleAddPath(repository, 'vendor/occupied')) ?? '',
        /contains files/
      )
    })
  })

  describe('listSubmodules', () => {
    it('returns the submodule entry', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      assert.equal(result.length, 1)
      assert.equal(result[0].sha, 'c59617b65080863c4ca72c1f191fa1b423b92223')
      assert.equal(result[0].path, 'foo/submodule')
      assert.equal(result[0].describe, 'first-tag~2')
    })

    it('returns the expected tag', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      const result = await listSubmodules(repository)
      assert.equal(result.length, 1)
      assert.equal(result[0].sha, '14425bb2a4ee361af7f789a81b971f8466ae521d')
      assert.equal(result[0].path, 'foo/submodule')
      assert.equal(result[0].describe, 'heads/feature-branch')
    })
  })

  describe('parseGitModules', () => {
    it('parses a single submodule stanza', () => {
      const contents = [
        '[submodule "foo/submodule"]',
        '\tpath = foo/submodule',
        '\turl = https://github.com/owner/repo.git',
        '\tbranch = main',
      ].join('\n')

      const result = parseGitModules(contents)

      assert.equal(result.length, 1)
      assert.deepEqual(result[0], {
        name: 'foo/submodule',
        path: 'foo/submodule',
        url: 'https://github.com/owner/repo.git',
        branch: 'main',
        update: null,
        ignore: null,
        shallow: null,
        fetchRecurseSubmodules: null,
      })
    })

    it('parses the optional configuration keys', () => {
      const contents = [
        '[submodule "foo/submodule"]',
        '\tpath = foo/submodule',
        '\turl = https://github.com/owner/repo.git',
        '\tupdate = merge',
        '\tignore = untracked',
        '\tshallow = true',
        '\tfetchRecurseSubmodules = on-demand',
      ].join('\n')

      const result = parseGitModules(contents)

      assert.equal(result.length, 1)
      assert.equal(result[0].update, 'merge')
      assert.equal(result[0].ignore, 'untracked')
      assert.equal(result[0].shallow, true)
      assert.equal(result[0].fetchRecurseSubmodules, 'on-demand')
    })

    it('parses multiple stanzas and defaults branch to null', () => {
      const contents = [
        '[submodule "a"]',
        '  path = vendor/a',
        '  url = git@github.com:owner/a.git',
        '',
        '[submodule "b"]',
        '  path = vendor/b',
        '  url = https://example.com/b.git',
      ].join('\n')

      const result = parseGitModules(contents)

      assert.equal(result.length, 2)
      assert.equal(result[0].name, 'a')
      assert.equal(result[0].path, 'vendor/a')
      assert.equal(result[0].branch, null)
      assert.equal(result[1].name, 'b')
      assert.equal(result[1].url, 'https://example.com/b.git')
    })

    it('ignores comments and stray keys, and skips stanzas without a path', () => {
      const contents = [
        '# a comment',
        'url = https://ignored.example/orphan.git',
        '[submodule "no-path"]',
        '\turl = https://example.com/no-path.git',
        '[submodule "ok"]',
        '\tpath = pkg/ok',
        '\turl = https://example.com/ok.git',
      ].join('\n')

      const result = parseGitModules(contents)

      assert.equal(result.length, 1)
      assert.equal(result[0].name, 'ok')
      assert.equal(result[0].path, 'pkg/ok')
    })

    it('returns an empty array for empty content', () => {
      assert.deepEqual(parseGitModules(''), [])
    })
  })

  describe('parseSubmoduleStatus', () => {
    it('parses each status prefix into the expected kind', () => {
      const stdout = [
        ' 1111111111111111111111111111111111111111 up-to-date (v1.0.0)',
        '+2222222222222222222222222222222222222222 out-of-date (v1.0.0-2-gabc)',
        '-3333333333333333333333333333333333333333 uninitialized',
        'U4444444444444444444444444444444444444444 conflicted (v2.0.0)',
      ].join('\n')

      const result = parseSubmoduleStatus(stdout)

      assert.equal(result.length, 4)
      assert.equal(result[0].status, 'up-to-date')
      assert.equal(result[0].path, 'up-to-date')
      assert.equal(result[0].describe, 'v1.0.0')
      assert.equal(result[1].status, 'out-of-date')
      assert.equal(result[2].status, 'uninitialized')
      assert.equal(result[2].describe, null)
      assert.equal(result[3].status, 'conflicted')
    })

    it('ignores blank lines', () => {
      const stdout = '\n 5555555555555555555555555555555555555555 sub (v1)\n'
      const result = parseSubmoduleStatus(stdout)
      assert.equal(result.length, 1)
      assert.equal(result[0].sha, '5555555555555555555555555555555555555555')
      assert.equal(result[0].path, 'sub')
      assert.equal(result[0].describe, 'v1')
    })
  })

  describe('reconcileSubmodules', () => {
    it('merges config and status by path, sorted by path', () => {
      const config = parseGitModules(
        [
          '[submodule "b"]',
          '\tpath = vendor/b',
          '\turl = https://example.com/b.git',
          '\tbranch = dev',
          '\tupdate = rebase',
          '\tignore = dirty',
          '\tshallow = true',
          '\tfetchRecurseSubmodules = on-demand',
          '[submodule "a"]',
          '\tpath = vendor/a',
          '\turl = https://example.com/a.git',
        ].join('\n')
      )
      const status = parseSubmoduleStatus(
        [
          ' 1111111111111111111111111111111111111111 vendor/a (v1)',
          '-2222222222222222222222222222222222222222 vendor/b',
        ].join('\n')
      )

      const result = reconcileSubmodules(config, status)

      assert.equal(result.length, 2)
      // sorted: vendor/a before vendor/b
      assert.equal(result[0].path, 'vendor/a')
      assert.equal(result[0].url, 'https://example.com/a.git')
      assert.equal(result[0].branch, null)
      assert.equal(result[0].update, null)
      assert.equal(result[0].ignore, null)
      assert.equal(result[0].shallow, null)
      assert.equal(result[0].fetchRecurseSubmodules, null)
      assert.equal(result[0].sha, '1111111111111111111111111111111111111111')
      assert.equal(result[0].status, 'up-to-date')

      assert.equal(result[1].path, 'vendor/b')
      assert.equal(result[1].branch, 'dev')
      assert.equal(result[1].update, 'rebase')
      assert.equal(result[1].ignore, 'dirty')
      assert.equal(result[1].shallow, true)
      assert.equal(result[1].fetchRecurseSubmodules, 'on-demand')
      assert.equal(result[1].status, 'uninitialized')
      assert.equal(result[1].sha, null)
    })

    it('surfaces config-only submodules as uninitialized', () => {
      const config = parseGitModules(
        [
          '[submodule "c"]',
          '\tpath = vendor/c',
          '\turl = https://example.com/c.git',
        ].join('\n')
      )

      const result = reconcileSubmodules(config, [])

      assert.equal(result.length, 1)
      assert.equal(result[0].path, 'vendor/c')
      assert.equal(result[0].status, 'uninitialized')
      assert.equal(result[0].sha, null)
    })

    it('keeps status-only submodules missing from .gitmodules', () => {
      const status = parseSubmoduleStatus(
        ' 6666666666666666666666666666666666666666 orphan/sub (v1)'
      )

      const result = reconcileSubmodules([], status)

      assert.equal(result.length, 1)
      assert.equal(result[0].path, 'orphan/sub')
      // No config entry, so name falls back to the path and url is null.
      assert.equal(result[0].name, 'orphan/sub')
      assert.equal(result[0].url, null)
      assert.equal(result[0].status, 'up-to-date')
    })
  })

  describe('resetSubmodulePaths', () => {
    it('update submodule to original commit', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      let result = await listSubmodules(repository)
      assert.equal(result[0].describe, 'heads/feature-branch')

      await resetSubmodulePaths(repository, ['foo/submodule'])

      result = await listSubmodules(repository)
      assert.equal(result[0].describe, 'first-tag~2')
    })

    it('eliminate submodule dirty state', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')

      const filePath = path.join(submodulePath, 'README.md')
      await writeFile(filePath, 'changed', { encoding: 'utf8' })

      await resetSubmodulePaths(repository, ['foo/submodule'])

      const result = await readFile(filePath, { encoding: 'utf8' })
      assert.equal(result, '# submodule-test-case')
    })
  })

  describe('createSubmoduleRepository', () => {
    it('creates a stable negative-id model for an initialized checkout', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const parent = new Repository(testRepoPath, 42, null, false)
      const [managed] = await getSubmodules(parent)

      const first = await createSubmoduleRepository(parent, managed)
      const second = await createSubmoduleRepository(parent, managed)

      assert.ok(first instanceof SubmoduleRepository)
      assert.ok(first.id < 0)
      assert.equal(first.id, second.id)
      assert.equal(first.parentRepository, parent)
      assert.equal(first.containingRepository, parent)
      assert.equal(
        first.path,
        await realpath(path.join(testRepoPath, managed.path))
      )
      assert.equal(first.submodule.path, 'foo/submodule')
      assert.notEqual(first.resolvedGitDir, parent.resolvedGitDir)
    })

    it('rejects a stale entry after its checkout is deinitialized', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const parent = new Repository(testRepoPath, 43, null, false)
      const [managed] = await getSubmodules(parent)

      await deinitSubmodule(parent, managed.path, true)

      await assert.rejects(
        createSubmoduleRepository(parent, managed),
        /Initialize the submodule/
      )
    })

    it('requires the selected parent to be its repository root', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const root = new Repository(testRepoPath, 44, null, false)
      const [managed] = await getSubmodules(root)
      const nestedParent = new Repository(
        path.join(testRepoPath, 'foo'),
        root.id,
        null,
        false
      )

      await assert.rejects(
        createSubmoduleRepository(nestedParent, managed),
        /not a repository root/
      )
    })

    it('rejects a checkout redirected through a symlink or junction', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const parent = new Repository(testRepoPath, 45, null, false)
      const [managed] = await getSubmodules(parent)
      const checkoutPath = path.join(testRepoPath, 'foo', 'submodule')
      const outsideRoot = await createTempDirectory(t)
      const outsidePath = path.join(outsideRoot, 'repository-evil')

      await rename(checkoutPath, outsidePath)
      await symlink(
        outsidePath,
        checkoutPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      await assert.rejects(
        createSubmoduleRepository(parent, managed),
        /symbolic link|junction/
      )
    })

    it('revalidates an open workspace after a junction replacement', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const parent = new Repository(testRepoPath, 46, null, false)
      const [managed] = await getSubmodules(parent)
      const temporary = await createSubmoduleRepository(parent, managed)
      const checkoutPath = path.join(testRepoPath, 'foo', 'submodule')
      const outsideRoot = await createTempDirectory(t)
      const outsidePath = path.join(outsideRoot, 'repository-redirected')

      await rename(checkoutPath, outsidePath)
      await symlink(
        outsidePath,
        checkoutPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      await assert.rejects(
        revalidateSubmoduleRepository(temporary),
        /symbolic link|junction/
      )
    })
  })

  describe('setSubmoduleUrl', () => {
    it('rewrites .gitmodules and syncs the URL into the local config', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const url = 'https://example.com/owner/other.git'

      await setSubmoduleUrl(repository, 'foo/submodule', url)

      const submodules = await getSubmodules(repository)
      assert.equal(submodules.length, 1)
      assert.equal(submodules[0].url, url)
      assert.equal(
        await getConfigValue(repository, 'submodule.foo/submodule.url', true),
        url
      )
    })
  })

  describe('setSubmoduleBranch', () => {
    it('sets the tracked branch and resets it to the default', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      await setSubmoduleBranch(repository, 'foo/submodule', 'feature-branch')

      let submodules = await getSubmodules(repository)
      assert.equal(submodules[0].branch, 'feature-branch')

      await setSubmoduleBranch(repository, 'foo/submodule', null)

      submodules = await getSubmodules(repository)
      assert.equal(submodules[0].branch, null)
    })
  })

  describe('setSubmoduleConfigKey', () => {
    it('writes and removes the supported .gitmodules keys', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const name = 'foo/submodule'

      await setSubmoduleConfigKey(repository, name, 'update', 'rebase')
      await setSubmoduleConfigKey(repository, name, 'ignore', 'dirty')
      await setSubmoduleConfigKey(repository, name, 'shallow', 'true')
      await setSubmoduleConfigKey(
        repository,
        name,
        'fetchRecurseSubmodules',
        'on-demand'
      )

      let submodules = await getSubmodules(repository)
      assert.equal(submodules[0].update, 'rebase')
      assert.equal(submodules[0].ignore, 'dirty')
      assert.equal(submodules[0].shallow, true)
      assert.equal(submodules[0].fetchRecurseSubmodules, 'on-demand')

      await setSubmoduleConfigKey(repository, name, 'update', null)

      submodules = await getSubmodules(repository)
      assert.equal(submodules[0].update, null)
      assert.equal(submodules[0].ignore, 'dirty')
    })

    it('tolerates removing a key that is not set', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      await setSubmoduleConfigKey(repository, 'foo/submodule', 'ignore', null)

      const submodules = await getSubmodules(repository)
      assert.equal(submodules[0].ignore, null)
    })

    it('rejects values outside the allowed set without spawning git', async () => {
      const repository = new Repository(
        'C:/missing/superproject',
        -1,
        null,
        false
      )

      const invalid: ReadonlyArray<[SubmoduleConfigKey, string]> = [
        ['update', 'sideways'],
        ['ignore', 'sometimes'],
        ['shallow', 'maybe'],
        ['fetchRecurseSubmodules', 'always'],
      ]

      for (const [key, value] of invalid) {
        await assert.rejects(
          setSubmoduleConfigKey(repository, 'foo/submodule', key, value),
          (error: Error) =>
            /Invalid value/.test(error.message) &&
            /expected one of/.test(error.message)
        )
      }
    })
  })

  describe('initSubmodule and deinitSubmodule', () => {
    it('requires force to deinit a modified submodule', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const filePath = path.join(testRepoPath, 'foo', 'submodule', 'README.md')
      await writeFile(filePath, 'changed', { encoding: 'utf8' })

      await assert.rejects(deinitSubmodule(repository, 'foo/submodule', false))

      await deinitSubmodule(repository, 'foo/submodule', true)

      const submodules = await getSubmodules(repository)
      assert.equal(submodules.length, 1)
      assert.equal(submodules[0].status, 'uninitialized')
      assert.equal(submodules[0].sha, null)
    })

    it('re-registers a deinitialized submodule in the local config', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const configKey = 'submodule.foo/submodule.url'

      await deinitSubmodule(repository, 'foo/submodule', true)
      assert.equal(await getConfigValue(repository, configKey, true), null)

      await initSubmodule(repository, 'foo/submodule')

      assert.equal(
        await getConfigValue(repository, configKey, true),
        'https://github.com/shiftkey/submodule-test-case'
      )
    })
  })
})
