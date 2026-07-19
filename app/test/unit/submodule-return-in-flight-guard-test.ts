import assert from 'node:assert'
import { readFile } from 'fs/promises'
import { describe, it } from 'node:test'
import { join } from 'path'

import { SubmoduleReturnInFlightGuard } from '../../src/ui/submodules/submodule-return-in-flight-guard'

describe('temporary submodule Back transition guard', () => {
  it('coalesces rapid activation and releases disabled state on completion', async () => {
    const pendingStates = new Array<boolean>()
    let release: (() => void) | undefined
    let calls = 0
    const guard = new SubmoduleReturnInFlightGuard(() => {
      pendingStates.push(guard.pending)
    })

    const first = guard.run(
      () =>
        new Promise<void>(resolve => {
          calls += 1
          release = resolve
        })
    )
    const second = guard.run(async () => {
      calls += 1
    })

    assert.equal(first, second)
    assert.equal(guard.pending, true)
    await Promise.resolve()
    assert.equal(calls, 1)
    assert.ok(release !== undefined)
    release()
    await Promise.all([first, second])

    assert.equal(guard.pending, false)
    assert.deepEqual(pendingStates, [true, false])
  })

  it('clears after failure and detaches safely on disposal', async () => {
    const pendingStates = new Array<boolean>()
    const guard = new SubmoduleReturnInFlightGuard(() => {
      pendingStates.push(guard.pending)
    })

    await assert.rejects(
      guard.run(async () => {
        throw new Error('selection failed')
      }),
      /selection failed/
    )
    assert.equal(guard.pending, false)

    let rejectLate: ((error: Error) => void) | undefined
    const late = guard.run(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectLate = reject
        })
    )
    await Promise.resolve()
    guard.dispose()
    assert.equal(guard.pending, false)
    assert.ok(rejectLate !== undefined)
    rejectLate(new Error('late failure'))
    await assert.rejects(late, /late failure/)
    assert.deepEqual(pendingStates, [true, false, true])
  })

  it('wires pending state to the Back button and guarded dispatcher call', async () => {
    const source = await readFile(
      join(__dirname, '../../src/ui/app.tsx'),
      'utf8'
    )

    assert.match(
      source,
      /submoduleReturnInFlight\.run\(async \(\) =>[\s\S]*?returnToParentRepository\(repository\)/
    )
    assert.match(
      source,
      /const selectionAfterFailure = this\.state\.selectedState[\s\S]*?selectionAfterFailure\.repository !== repository[\s\S]*?return/
    )
    assert.match(source, /disabled=\{this\.submoduleReturnInFlight\.pending\}/)
    assert.match(source, /this\.submoduleReturnInFlight\.dispose\(\)/)
  })
})
