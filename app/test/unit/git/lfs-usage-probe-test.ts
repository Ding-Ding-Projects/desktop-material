import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Repository } from '../../../src/models/repository'
import {
  clearIsUsingLFSCache,
  gitAttributesTextDeclaresLfsFilter,
  isUsingLFS,
} from '../../../src/lib/git/lfs'

describe('gitAttributesTextDeclaresLfsFilter', () => {
  it('detects a standard git-lfs track rule', () => {
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter(
        '*.psd filter=lfs diff=lfs merge=lfs -text\n'
      ),
      true
    )
  })

  it('detects a rule that is not the first attribute on the line', () => {
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter('*.bin diff=lfs filter=lfs -text'),
      true
    )
  })

  it('ignores a non-LFS filter', () => {
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter('* filter=annex\n'),
      false
    )
  })

  it('ignores an unset or differently-valued filter token', () => {
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter('*.psd -filter'),
      false
    )
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter('*.psd filter=lfsx'),
      false
    )
  })

  it('ignores comment lines', () => {
    assert.strictEqual(
      gitAttributesTextDeclaresLfsFilter('# *.psd filter=lfs\n'),
      false
    )
  })

  it('returns false for empty or whitespace-only content', () => {
    assert.strictEqual(gitAttributesTextDeclaresLfsFilter(''), false)
    assert.strictEqual(gitAttributesTextDeclaresLfsFilter('\n  \n'), false)
  })
})

describe('isUsingLFS caching', () => {
  it('probes once per repository and serves the cached answer', async () => {
    const repository = new Repository('C:/tmp/repo-a', -1, null, false)
    clearIsUsingLFSCache(repository.path)
    let probes = 0
    const probe = async () => {
      probes += 1
      return true
    }
    assert.strictEqual(await isUsingLFS(repository, probe), true)
    assert.strictEqual(await isUsingLFS(repository, probe), true)
    assert.strictEqual(probes, 1)
    clearIsUsingLFSCache(repository.path)
  })

  it('caches a negative answer too', async () => {
    const repository = new Repository('C:/tmp/repo-b', -1, null, false)
    clearIsUsingLFSCache(repository.path)
    let probes = 0
    const probe = async () => {
      probes += 1
      return false
    }
    assert.strictEqual(await isUsingLFS(repository, probe), false)
    assert.strictEqual(await isUsingLFS(repository, probe), false)
    assert.strictEqual(probes, 1)
    clearIsUsingLFSCache(repository.path)
  })

  it('re-probes different repositories independently', async () => {
    const a = new Repository('C:/tmp/repo-c', -1, null, false)
    const b = new Repository('C:/tmp/repo-d', -1, null, false)
    clearIsUsingLFSCache()
    let probes = 0
    const probe = async () => {
      probes += 1
      return true
    }
    await isUsingLFS(a, probe)
    await isUsingLFS(b, probe)
    assert.strictEqual(probes, 2)
    clearIsUsingLFSCache()
  })

  it('re-probes after the cache is cleared', async () => {
    const repository = new Repository('C:/tmp/repo-e', -1, null, false)
    clearIsUsingLFSCache(repository.path)
    let probes = 0
    const probe = async () => {
      probes += 1
      return true
    }
    await isUsingLFS(repository, probe)
    clearIsUsingLFSCache(repository.path)
    await isUsingLFS(repository, probe)
    assert.strictEqual(probes, 2)
    clearIsUsingLFSCache(repository.path)
  })
})
