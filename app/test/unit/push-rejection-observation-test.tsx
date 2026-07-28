import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import { AppStore } from '../../src/lib/stores/app-store'
import { ForcePushBranchState } from '../../src/lib/rebase'
import { Repository } from '../../src/models/repository'
import { TipState } from '../../src/models/tip'
import { Dispatcher } from '../../src/ui/dispatcher'
import {
  containBackgroundOperation,
  observeUserInitiatedOperation,
} from '../../src/ui/lib/observed-operations'
import { PushPullButton } from '../../src/ui/toolbar/push-pull-button'
import { fireEvent, render, screen, waitFor } from '../helpers/ui/render'

/**
 * Let every already-queued microtask and the surrounding event-loop turn run.
 * Node decides that a rejection is unhandled at the end of a turn, so a single
 * `await` is not enough to prove that nothing escaped.
 */
async function settle(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

/**
 * Run `body` while intercepting Node's unhandled rejection reporting, and
 * return every reason that escaped. Installing a listener also suppresses the
 * default behaviour of tearing down the process, so a regression fails as an
 * assertion instead of killing the run.
 */
async function withUnhandledRejections(
  body: () => Promise<void>
): Promise<ReadonlyArray<unknown>> {
  const escaped = new Array<unknown>()
  const onUnhandledRejection = (reason: unknown) => escaped.push(reason)
  process.on('unhandledRejection', onUnhandledRejection)
  try {
    await body()
    await settle()
  } finally {
    process.off('unhandledRejection', onUnhandledRejection)
  }
  return escaped
}

/** Capture `log.warn` calls for the duration of `body`. */
async function withCapturedWarnings(
  body: () => Promise<void>
): Promise<ReadonlyArray<string>> {
  const warnings = new Array<string>()
  const logger = log as unknown as { warn: typeof log['warn'] }
  const previousWarn = logger.warn
  logger.warn = message => {
    warnings.push(message)
  }
  try {
    await body()
  } finally {
    logger.warn = previousWarn
  }
  return warnings
}

function repository(): Repository {
  return new Repository('C:/work/observed', 1, null, false)
}

describe('observeUserInitiatedOperation', () => {
  it('presents a rejected operation exactly once', async () => {
    const failure = new Error('the destination could not be proven')
    const posted = new Array<Error>()

    const escaped = await withUnhandledRejections(async () => {
      observeUserInitiatedOperation(
        Promise.reject(failure),
        {
          postError: async error => {
            posted.push(error)
          },
        },
        'the test push'
      )
    })

    assert.deepEqual(posted, [failure])
    assert.equal(posted.length, 1)
    assert.deepEqual(escaped, [])
  })

  it('presents nothing when the operation succeeds', async () => {
    const posted = new Array<Error>()

    await withUnhandledRejections(async () => {
      observeUserInitiatedOperation(
        Promise.resolve('pushed'),
        {
          postError: async error => {
            posted.push(error)
          },
        },
        'the test push'
      )
    })

    assert.equal(posted.length, 0)
  })

  it('coerces a non-Error rejection reason into a reportable error', async () => {
    const posted = new Array<Error>()

    await withUnhandledRejections(async () => {
      observeUserInitiatedOperation(
        Promise.reject('the remote hung up'),
        {
          postError: async error => {
            posted.push(error)
          },
        },
        'the test push'
      )
    })

    assert.equal(posted.length, 1)
    assert.ok(posted[0] instanceof Error)
    assert.equal(posted[0].message, 'the remote hung up')
  })

  it('contains a failing presentation instead of rejecting a second time', async () => {
    let escaped: ReadonlyArray<unknown> = []
    const warnings = await withCapturedWarnings(async () => {
      escaped = await withUnhandledRejections(async () => {
        observeUserInitiatedOperation(
          Promise.reject(new Error('the destination could not be proven')),
          {
            postError: async () => {
              throw new Error('the error dialog is gone')
            },
          },
          'the test push'
        )
      })
    })

    assert.deepEqual(escaped, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /presenting the failure of the test push/)
  })
})

describe('containBackgroundOperation', () => {
  it('turns a background rejection into a diagnostic, not a user-facing notice', async () => {
    let escaped: ReadonlyArray<unknown> = []
    const warnings = await withCapturedWarnings(async () => {
      escaped = await withUnhandledRejections(async () => {
        containBackgroundOperation(
          Promise.reject(new Error('the provider is unavailable')),
          'refreshing provider triage'
        )
      })
    })

    assert.deepEqual(escaped, [])
    assert.equal(warnings.length, 1)
    assert.match(
      warnings[0],
      /Contained a background failure while refreshing provider triage\./
    )
  })

  it('stays silent when the background operation succeeds', async () => {
    const warnings = await withCapturedWarnings(async () => {
      containBackgroundOperation(
        Promise.resolve(),
        'refreshing provider triage'
      )
      await settle()
    })

    assert.deepEqual(warnings, [])
  })
})

describe('Dispatcher.push failure routing', () => {
  it('rejects without reporting, so the call site presents the failure once', async () => {
    // Everything the store reports for itself is caught by
    // `GitStore.performFailableOperation`, which emits and then resolves. A
    // rejection therefore reaches the caller unreported, which is why the call
    // site must present it — and why doing so cannot double-report.
    const failure = new Error('the destination could not be proven')
    const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
    let postErrorCalls = 0
    Reflect.set(dispatcher, 'appStore', {
      _push: async () => {
        throw failure
      },
    })
    Reflect.set(dispatcher, 'postError', async () => {
      postErrorCalls++
    })

    await assert.rejects(
      () => dispatcher.push(repository()),
      /the destination could not be proven/
    )
    assert.equal(postErrorCalls, 0)
  })
})

describe('the toolbar push button click path', () => {
  it('presents a rejected push once instead of leaving it unobserved', async () => {
    const failure = new Error(
      'GitHub could not verify the configured repository URL before the network operation.'
    )
    const posted = new Array<Error>()
    let pushes = 0
    const dispatcher = {
      closeFoldout: () => {},
      push: async () => {
        pushes++
        throw failure
      },
      postError: async (error: Error) => {
        posted.push(error)
      },
    } as unknown as Dispatcher

    const escaped = await withUnhandledRejections(async () => {
      render(
        <PushPullButton
          aheadBehind={{ ahead: 1, behind: 0 }}
          remoteName="origin"
          networkActionInProgress={false}
          lastFetched={null}
          progress={null}
          dispatcher={dispatcher}
          repository={repository()}
          tipState={TipState.Valid}
          rebaseInProgress={false}
          forcePushBranchState={ForcePushBranchState.NotAvailable}
          shouldNudge={false}
          numTagsToPush={0}
          isDropdownOpen={false}
          askForConfirmationOnForcePush={false}
          enableFocusTrap={false}
          pushPullButtonWidth={{ value: 230, min: 200, max: 400 }}
          onDropdownStateChanged={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Push origin/ }))

      await waitFor(() => assert.equal(posted.length, 1))
    })

    assert.equal(pushes, 1)
    assert.deepEqual(posted, [failure])
    assert.deepEqual(escaped, [])
  })
})

describe('user-initiated network entry points', () => {
  const sourceOf = (...segments: ReadonlyArray<string>) =>
    readFileSync(join(process.cwd(), 'app', 'src', ...segments), 'utf8')

  const sectionOf = (source: string, start: string, end: string) => {
    const startIndex = source.indexOf(start)
    assert.notEqual(startIndex, -1, `missing ${start}`)
    const endIndex = source.indexOf(end, startIndex + start.length)
    assert.notEqual(endIndex, -1, `missing boundary ${end}`)
    return source.slice(startIndex, endIndex)
  }

  const entryPoints = [
    {
      name: 'the toolbar push button',
      file: ['ui', 'toolbar', 'push-pull-button.tsx'],
      start: 'private push = () => {',
      end: 'private returnFocusOnDeactivate',
      helper: 'observeUserInitiatedOperation',
    },
    {
      name: 'the toolbar force push',
      file: ['ui', 'toolbar', 'push-pull-button.tsx'],
      start: 'private forcePushWithLease = () => {',
      end: 'private pull = () => {',
      helper: 'observeUserInitiatedOperation',
    },
    {
      name: 'the menu push and force push',
      file: ['ui', 'app.tsx'],
      start: 'private push(options?:',
      end: 'private async pull()',
      helper: 'observeUserInitiatedOperation',
    },
    {
      name: 'the force push confirmation dialog',
      file: ['ui', 'rebase', 'confirm-force-push.tsx'],
      start: 'private onForcePush = ',
      end: '\n}',
      helper: 'observeUserInitiatedOperation',
    },
    {
      name: 'the workflow push rejection dialog',
      file: ['ui', 'workflow-push-rejected', 'workflow-push-rejected.tsx'],
      start: 'private onSignIn = async () => {',
      end: '\n}',
      helper: 'observeUserInitiatedOperation',
    },
    {
      name: 'the provider triage refresh',
      file: ['ui', 'repository-tools', 'provider-triage.tsx'],
      start: 'private load = (',
      end: 'private refresh = () => {',
      helper: 'containBackgroundOperation',
    },
  ]

  for (const entryPoint of entryPoints) {
    it(`observes the promise started by ${entryPoint.name}`, () => {
      const section = sectionOf(
        sourceOf(...entryPoint.file),
        entryPoint.start,
        entryPoint.end
      )

      assert.ok(
        section.includes(`${entryPoint.helper}(`),
        `${entryPoint.name} must route its promise through ${entryPoint.helper}`
      )
    })
  }

  it('leaves no bare fire-and-forget provider triage refresh behind', () => {
    const source = sourceOf('ui', 'repository-tools', 'provider-triage.tsx')

    assert.ok(!source.includes('void this.store.load('))
  })
})

describe('AppStore._push canonical remote preflight', () => {
  it('performs no Git push when the canonical remote cannot be proven', async () => {
    const target = repository()
    const events = new Array<string>()
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      repositoryWithCanonicalRemoteForNetwork: async (
        candidate: Repository,
        isBackgroundTask: boolean,
        allowUnverifiedRemote?: boolean
      ) => {
        events.push('canonicalize')
        assert.equal(candidate, target)
        // A user-initiated push is a mutation: it must fail closed.
        assert.equal(isBackgroundTask, false)
        assert.equal(allowUnverifiedRemote, false)
        throw new Error(
          'GitHub could not verify the configured repository URL before the network operation.'
        )
      },
      performPush: async () => {
        events.push('push')
      },
    })

    await assert.rejects(
      () => (store as any)._push(target),
      /could not verify the configured repository URL/
    )
    assert.deepEqual(events, ['canonicalize'])
  })

  it('pushes against the canonicalized repository once the remote is proven', async () => {
    const target = repository()
    const resolved = new Repository(
      'C:/work/observed',
      1,
      null,
      false,
      'canonical model'
    )
    const events = new Array<string>()
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      repositoryWithCanonicalRemoteForNetwork: async () => {
        events.push('canonicalize')
        return resolved
      },
      performPush: async (candidate: Repository) => {
        events.push('push')
        assert.equal(candidate, resolved)
      },
    })

    await (store as any)._push(target)

    assert.deepEqual(events, ['canonicalize', 'push'])
  })
})
