import assert from 'node:assert'
import { describe, it } from 'node:test'
import { CloningRepository } from '../../../src/models/cloning-repository'
import { CloneOptions } from '../../../src/models/clone-options'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher/dispatcher'

describe('single-clone Cheap LFS selection', () => {
  for (const paths of [['assets/hero.psd'], []] as const) {
    it(`forwards ${
      paths.length === 0 ? 'an empty' : 'the selected'
    } manifest-bound subset through the first real-repository selection`, async () => {
      const url = 'https://github.com/example/game.git'
      const path = 'C:/single-clone-selection/game'
      const accountKey = 'https://api.github.com#1'
      const cloningRepository = new CloningRepository(path, url)
      const addedRepository = new Repository(path, 71, null, false)
      const selection = {
        accountKey,
        repositoryCloneUrl: url,
        defaultBranch: 'main',
        manifestBlobSha: 'a'.repeat(40),
        pointerSetSha256: 'b'.repeat(64),
        paths: [...paths],
      }
      const options: CloneOptions = {
        branch: 'main',
        cheapLfsSelection: selection,
      }
      const selections = new Array<ReadonlyArray<unknown>>()
      let directMaterializeCalls = 0
      const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
      Object.assign(dispatcher, {
        appStore: {
          _completeOpenInDesktop: async <T>(operation: () => Promise<T>) =>
            operation(),
          _clone: () => ({
            promise: Promise.resolve(true),
            repository: cloningRepository,
          }),
          _addRepositories: async () => [addedRepository],
          _selectRepository: async (...args: ReadonlyArray<unknown>) => {
            selections.push(args)
            return args[0] ?? null
          },
          maybeAutoMaterializeCheapLfs: async () => {
            directMaterializeCalls++
          },
        },
      })

      const result = await dispatcher.clone(url, path, options)

      assert.equal(result, addedRepository)
      assert.equal(directMaterializeCalls, 0)
      assert.equal(selections.length, 2)
      assert.equal(selections[0][0], cloningRepository)
      assert.deepEqual(selections[1], [
        addedRepository,
        true,
        false,
        {
          cheapLfsSelection: selection,
          expectedCloneUrl: url,
          expectedDefaultBranch: 'main',
        },
      ])
    })
  }
})
