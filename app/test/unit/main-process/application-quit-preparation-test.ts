import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  ApplicationClosePreparationClaim,
  ApplicationQuitIntent,
  ApplicationQuitPreparationCoordinator,
  ApplicationQuitPreparationFailure,
  IApplicationQuitPreparationWindow,
} from '../../../src/main-process/application-quit-preparation'

interface IDeferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

const deferred = (): IDeferred => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve))

class FakeWindow implements IApplicationQuitPreparationWindow {
  public prepareCalls = 0
  public cancelCalls = 0
  public readonly markCalls = new Array<boolean>()
  public readonly preparationClaims =
    new Array<ApplicationClosePreparationClaim>()

  public constructor(
    private readonly preparations: ReadonlyArray<Promise<unknown>>
  ) {}

  public prepareForClose(
    claim: ApplicationClosePreparationClaim
  ): Promise<unknown> {
    this.preparationClaims.push(claim)
    const preparation =
      this.preparations[this.prepareCalls++] ?? Promise.resolve()
    return preparation
  }

  public markWillQuit(evenIfUpdating: boolean): void {
    this.markCalls.push(evenIfUpdating)
  }

  public cancelQuitting(): void {
    this.cancelCalls++
  }
}

describe('application quit preparation coordinator', () => {
  it('shares one in-flight request and waits for two deferred windows', async () => {
    const firstDrain = deferred()
    const secondDrain = deferred()
    const first = new FakeWindow([firstDrain.promise])
    const second = new FakeWindow([secondDrain.promise])
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [first, second],
      intent => actions.push(intent)
    )

    const request = coordinator.request('quit', false)
    const duplicate = coordinator.request('quit', false)

    assert.strictEqual(duplicate, request)
    assert.equal(coordinator.isPreparing, true)
    await flushPromises()
    assert.equal(first.prepareCalls, 1)
    assert.equal(second.prepareCalls, 1)
    assert.deepEqual(actions, [])

    firstDrain.resolve()
    await flushPromises()
    assert.deepEqual(actions, [])

    secondDrain.resolve()
    await request

    assert.equal(coordinator.isCommitted, true)
    assert.equal(coordinator.isPreparing, false)
    assert.deepEqual(first.preparationClaims, ['application'])
    assert.deepEqual(second.preparationClaims, ['application'])
    assert.deepEqual(first.markCalls, [false])
    assert.deepEqual(second.markCalls, [false])
    assert.deepEqual(actions, ['quit'])
  })

  it('includes a window created while the first drain is running', async () => {
    const firstDrain = deferred()
    const secondDrain = deferred()
    const first = new FakeWindow([firstDrain.promise])
    const second = new FakeWindow([secondDrain.promise])
    const windows = new Array<FakeWindow>(first)
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => windows,
      intent => actions.push(intent)
    )

    const request = coordinator.request('quit', false)
    await flushPromises()
    windows.push(second)
    firstDrain.resolve()
    await flushPromises()

    assert.equal(second.prepareCalls, 1)
    assert.deepEqual(actions, [])

    secondDrain.resolve()
    await request
    assert.deepEqual(second.preparationClaims, ['application'])
    assert.deepEqual(second.markCalls, [false])
    assert.deepEqual(actions, ['quit'])
  })

  it('contains a rejection and does not mark a window removed during preparation', async () => {
    const rejectedDrain = deferred()
    const removedDrain = deferred()
    const rejected = new FakeWindow([rejectedDrain.promise])
    const removed = new FakeWindow([removedDrain.promise])
    const surviving = new FakeWindow([Promise.resolve()])
    const windows = new Array<FakeWindow>(rejected, removed, surviving)
    const actions = new Array<ApplicationQuitIntent>()
    const failures = new Array<ApplicationQuitPreparationFailure>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => windows,
      intent => actions.push(intent),
      failure => failures.push(failure)
    )

    const request = coordinator.request('quit', false)
    await flushPromises()
    windows.splice(windows.indexOf(removed), 1)
    rejectedDrain.reject(new Error('renderer rejected preparation'))
    removedDrain.resolve()
    await request

    assert.deepEqual(
      failures.map(failure => failure.kind),
      ['prepare-window']
    )
    assert.deepEqual(rejected.markCalls, [false])
    assert.deepEqual(surviving.markCalls, [false])
    assert.deepEqual(removed.markCalls, [])
    assert.deepEqual(actions, ['quit'])
  })

  it('upgrades an ordinary in-flight quit to one update-install action', async () => {
    const drain = deferred()
    const window = new FakeWindow([drain.promise])
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      intent => actions.push(intent)
    )

    const ordinary = coordinator.request('quit', false)
    await flushPromises()
    const update = coordinator.request('install-update', true)
    assert.strictEqual(update, ordinary)

    drain.resolve()
    await ordinary

    assert.deepEqual(window.markCalls, [true])
    assert.deepEqual(actions, ['install-update'])
  })

  it('claims a window even when its preparation returns immediately', async () => {
    const window = new FakeWindow([Promise.resolve()])
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      intent => actions.push(intent)
    )

    await coordinator.request('install-update', true)

    assert.equal(window.prepareCalls, 1)
    assert.deepEqual(window.preparationClaims, ['application'])
    assert.deepEqual(actions, ['install-update'])
  })

  it('prevents first before-quit attempts and allows committed re-entry', async () => {
    const drain = deferred()
    const window = new FakeWindow([drain.promise])
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      intent => actions.push(intent)
    )
    let prevented = 0
    const event = { preventDefault: () => prevented++ }

    coordinator.handleBeforeQuit(event)
    coordinator.handleBeforeQuit(event)
    const request = coordinator.request('quit', false)
    await flushPromises()

    assert.equal(prevented, 2)
    assert.equal(window.prepareCalls, 1)

    drain.resolve()
    await request
    coordinator.handleBeforeQuit(event)

    assert.equal(prevented, 2)
    assert.deepEqual(actions, ['quit'])

    const noWindows = new ApplicationQuitPreparationCoordinator(
      () => [],
      intent => actions.push(intent)
    )
    noWindows.handleBeforeQuit(event)
    assert.equal(prevented, 2)
  })

  it('invalidates canceled work and permits a fresh generation', async () => {
    const oldDrain = deferred()
    const freshDrain = deferred()
    const window = new FakeWindow([oldDrain.promise, freshDrain.promise])
    const actions = new Array<ApplicationQuitIntent>()
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      intent => actions.push(intent)
    )

    const oldRequest = coordinator.request('quit', false)
    await flushPromises()
    coordinator.cancel()

    assert.equal(coordinator.isCommitted, false)
    assert.equal(window.cancelCalls, 1)

    const freshRequest = coordinator.request('install-update', true)
    await flushPromises()
    assert.equal(window.prepareCalls, 2)

    oldDrain.resolve()
    await oldRequest
    assert.deepEqual(actions, [])

    freshDrain.resolve()
    await freshRequest

    assert.deepEqual(window.markCalls, [true])
    assert.deepEqual(actions, ['install-update'])
  })

  it('resumes windows and permits retry when the terminal action throws', async () => {
    const window = new FakeWindow([Promise.resolve(), Promise.resolve()])
    const failures = new Array<ApplicationQuitPreparationFailure>()
    let actionCalls = 0
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      () => {
        actionCalls++
        if (actionCalls === 1) {
          throw new Error('updater unavailable')
        }
      },
      failure => failures.push(failure)
    )

    await coordinator.request('install-update', true)

    assert.equal(coordinator.isCommitted, false)
    assert.equal(window.cancelCalls, 1)
    assert.deepEqual(
      failures.map(failure => failure.kind),
      ['terminal-action']
    )

    await coordinator.request('quit', false)

    assert.equal(coordinator.isCommitted, true)
    assert.equal(window.prepareCalls, 2)
    assert.equal(actionCalls, 2)
  })

  it('rechecks a late quit blocker before commit and permits a fresh retry', async () => {
    const drain = deferred()
    const window = new FakeWindow([drain.promise, Promise.resolve()])
    const actions = new Array<ApplicationQuitIntent>()
    let allowCommit = true
    const coordinator = new ApplicationQuitPreparationCoordinator(
      () => [window],
      intent => actions.push(intent),
      undefined,
      () => allowCommit
    )

    const blockedRequest = coordinator.request('quit', false)
    await flushPromises()
    allowCommit = false
    drain.resolve()
    await blockedRequest

    assert.equal(coordinator.isCommitted, false)
    assert.equal(window.cancelCalls, 1)
    assert.deepEqual(actions, [])

    allowCommit = true
    await coordinator.request('quit', false)

    assert.equal(coordinator.isCommitted, true)
    assert.equal(window.prepareCalls, 2)
    assert.deepEqual(actions, ['quit'])
  })

  it('exits instead of leaving a zero-window zombie after an updater error', () => {
    const mainSource = readFileSync(
      join(process.cwd(), 'app', 'src', 'main-process', 'main.ts'),
      'utf8'
    )
    const handlerStart = mainSource.indexOf("autoUpdater.on('error'")
    const handlerEnd = mainSource.indexOf(
      '\nfunction preventApplicationQuitForUpdate',
      handlerStart
    )
    assert.notEqual(handlerStart, -1)
    assert.notEqual(handlerEnd, -1)
    const handler = mainSource.slice(handlerStart, handlerEnd)

    assert.match(
      handler,
      /applicationQuitPreparation\.cancel\(\)\s+if \(getAppWindows\(\)\.length === 0\) \{\s+app\.quit\(\)/
    )
  })
})
