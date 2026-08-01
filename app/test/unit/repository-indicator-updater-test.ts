import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RepositoryIndicatorUpdater,
  withRepositoryIndicatorProgressCleanup,
} from '../../src/lib/stores/helpers/repository-indicator-updater'
import { Repository } from '../../src/models/repository'

interface IUpdaterHarness {
  running: boolean
  refreshAllRepositories: () => Promise<void>
  scheduleRefresh: () => void
}

describe('RepositoryIndicatorUpdater', () => {
  it('clears visible progress when a contained fetch rejects', async () => {
    let cleared = 0
    await assert.rejects(
      withRepositoryIndicatorProgressCleanup(
        async () => {
          throw new Error('provider offline')
        },
        () => {
          cleared += 1
        }
      ),
      /provider offline/
    )
    assert.equal(cleared, 1)
  })

  it('contains one repository failure, continues, and reschedules', async t => {
    const repositories = [
      { id: 1 },
      { id: 2 },
    ] as unknown as ReadonlyArray<Repository>
    const refreshed: number[] = []
    const errors: string[] = []
    let schedules = 0
    const originalLogError = log.error
    log.error = (message: string) => errors.push(message)
    t.after(() => {
      log.error = originalLogError
    })

    const updater = new RepositoryIndicatorUpdater(
      () => repositories,
      async repository => {
        refreshed.push(repository.id)
        if (repository.id === 1) {
          throw new Error('offline provider')
        }
      }
    )
    const harness = updater as unknown as IUpdaterHarness
    harness.running = true
    harness.scheduleRefresh = () => {
      schedules += 1
    }

    await harness.refreshAllRepositories()

    assert.deepEqual(refreshed, [1, 2])
    assert.equal(schedules, 1)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /repository 1; continuing/)
  })
})
