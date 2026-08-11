import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { API, IAPISelfHostedRunner } from '../../../src/lib/api'
import {
  ISelfHostedRunnerProgress,
  ISelfHostedRunnerStatus,
} from '../../../src/lib/self-hosted-runner/types'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  defaultSelfHostedRunnerLabel,
  SelfHostedRunnerManager,
} from '../../../src/ui/actions/self-hosted-runner-manager'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../helpers/ui/render'

class TestListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    const width = 640
    const height = 480
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: width,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: height,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width,
            height,
            top: 0,
            right: width,
            bottom: height,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

const account = new Account(
  'runner-owner',
  'https://api.github.com',
  'synthetic-runner-token',
  [],
  '',
  41,
  'Runner Owner',
  'free'
)

const secondaryAccount = new Account(
  'runner-secondary',
  'https://api.github.com',
  'synthetic-secondary-runner-token',
  [],
  '',
  42,
  'Secondary Runner Owner',
  'free'
)

const supportedStatus: ISelfHostedRunnerStatus = {
  supported: true,
  wslAvailable: true,
  distributions: ['Ubuntu-24.04'],
  runners: [],
  activeRunnerId: null,
}

const managedRunnerStatus: ISelfHostedRunnerStatus = {
  ...supportedStatus,
  runners: [
    {
      id: 'managed-running',
      accountKey: getAccountKey(account),
      owner: 'runner-owner',
      repository: 'desktop-material',
      name: 'primary-windows-runner',
      labels: ['self-hosted', 'Windows', 'X64'],
      platform: 'windows',
      wslDistribution: null,
      dedicatedWsl: false,
      createdAt: '2026-08-07T12:00:00.000Z',
      status: 'running',
    },
    {
      id: 'managed-stopped',
      accountKey: getAccountKey(account),
      owner: 'runner-owner',
      repository: 'desktop-material',
      name: 'backup-windows-runner',
      labels: ['self-hosted', 'Windows', 'X64'],
      platform: 'windows',
      wslDistribution: null,
      dedicatedWsl: false,
      createdAt: '2026-08-07T12:05:00.000Z',
      status: 'stopped',
    },
  ],
}

const liveRunner: IAPISelfHostedRunner = {
  id: 77,
  name: 'shared-windows-runner',
  os: 'Windows',
  busy: false,
  status: 'online',
  labels: [
    { name: 'self-hosted' },
    { name: 'Windows' },
    { name: 'X64' },
    { name: 'desktop-material-windows-local' },
  ],
}

function repository(isPrivate: boolean): Repository {
  const remote = new GitHubRepository(
    'desktop-material',
    new Owner('runner-owner', account.endpoint, 1),
    1,
    isPrivate
  )
  return new Repository(
    'C:/desktop-material',
    1,
    remote,
    false,
    null,
    {},
    false,
    undefined,
    getAccountKey(account)
  )
}

interface IRunnerIPCInvoke {
  readonly channel: string
  readonly args: ReadonlyArray<unknown>
}

type RunnerIPCHandler = (...args: ReadonlyArray<unknown>) => Promise<unknown>

async function installRunnerIPC(
  status: ISelfHostedRunnerStatus,
  handlers: Readonly<Record<string, RunnerIPCHandler>> = {}
) {
  const invokes: IRunnerIPCInvoke[] = []

  const rawIpcRenderer = (await import('electron')).ipcRenderer
  const previousInvoke = rawIpcRenderer.invoke
  const previousOn = rawIpcRenderer.on
  const previousRemoveListener = rawIpcRenderer.removeListener
  let progressListener:
    | ((
        event: Electron.IpcRendererEvent,
        progress: ISelfHostedRunnerProgress
      ) => void)
    | null = null

  rawIpcRenderer.invoke = ((channel: string, ...args: unknown[]) => {
    invokes.push({ channel, args })
    const handler = handlers[channel]
    if (handler !== undefined) {
      return handler(...args)
    }
    if (channel === 'get-self-hosted-runner-status') {
      return Promise.resolve(status)
    }
    if (channel === 'preflight-self-hosted-runner') {
      return Promise.resolve({
        ok: true,
        result: { commitSHA: 'a'.repeat(40), workflowCount: 1 },
      })
    }
    return Promise.reject(new Error(`Unexpected IPC invoke: ${channel}`))
  }) as Electron.IpcRenderer['invoke']
  rawIpcRenderer.on = ((channel, listener) => {
    if (channel === 'self-hosted-runner-progress') {
      progressListener = listener as typeof progressListener
    }
    return rawIpcRenderer
  }) as Electron.IpcRenderer['on']
  rawIpcRenderer.removeListener = ((channel, listener) => {
    if (
      channel === 'self-hosted-runner-progress' &&
      progressListener === listener
    ) {
      progressListener = null
    }
    return rawIpcRenderer
  }) as Electron.IpcRenderer['removeListener']

  return {
    invokes,
    emitProgress: (progress: ISelfHostedRunnerProgress) => {
      progressListener?.({} as Electron.IpcRendererEvent, progress)
    },
    restore: () => {
      rawIpcRenderer.invoke = previousInvoke
      rawIpcRenderer.on = previousOn
      rawIpcRenderer.removeListener = previousRemoveListener
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('self-hosted runner manager', () => {
  it('keeps default runner labels within 64 characters without truncating the platform suffix', () => {
    const longRepositoryName = 'A'.repeat(100)

    assert.equal(
      defaultSelfHostedRunnerLabel('desktop-material', 'windows'),
      'desktop-material-windows-local'
    )
    assert.equal(
      defaultSelfHostedRunnerLabel(longRepositoryName, 'windows'),
      `${'a'.repeat(50)}-windows-local`
    )
    assert.equal(
      defaultSelfHostedRunnerLabel(longRepositoryName, 'linux-wsl'),
      `${'a'.repeat(54)}-wsl-local`
    )
  })

  it('allows a public-repository setup after the main-process workflow audit', async () => {
    let workflowInventoryReads = 0
    let workflowContentReads = 0
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
        fetchWorkflows: async () => {
          workflowInventoryReads++
          return { total_count: 0, workflows: [] }
        },
        fetchWorkflowFileContent: async () => {
          workflowContentReads++
          return ''
        },
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus)
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(false)}
          accounts={[account]}
        />
      )

      assert.ok(
        await screen.findByText(
          /This repository is public\. Setup is permitted only after the immutable workflow audit/
        )
      )
      assert.ok(
        await screen.findByText(
          /Setup-form safety preflight: The main process proved public workflow triggers/
        )
      )
      assert.equal(
        screen
          .getByRole('button', { name: 'Set up runner' })
          .getAttribute('aria-disabled'),
        'true'
      )
      assert.equal(workflowInventoryReads, 0)
      assert.equal(workflowContentReads, 0)
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('requires both accessible trust acknowledgements after a safe audit', async () => {
    let setupRequest: {
      readonly acceptedPreflightRiskCode?: unknown
    } | null = null
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus, {
      'setup-self-hosted-runner': async request => {
        setupRequest = request as {
          readonly acceptedPreflightRiskCode?: unknown
        }
        return {
          ok: false,
          code: 'setup-test-refused',
          recovery: 'The test setup request stopped after request inspection.',
        }
      },
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(await screen.findByText(/The main process proved private-fork/))
      const setup = screen.getByRole('button', { name: 'Set up runner' })
      const workflowTrust = screen.getByRole('checkbox', {
        name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
      }) as HTMLInputElement
      const hostAccess = screen.getByRole('checkbox', {
        name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
      }) as HTMLInputElement

      assert.equal(workflowTrust.disabled, false)
      assert.equal(hostAccess.disabled, false)
      assert.equal(setup.getAttribute('aria-disabled'), 'true')

      fireEvent.click(workflowTrust)
      assert.equal(setup.getAttribute('aria-disabled'), 'true')

      fireEvent.click(hostAccess)
      await waitFor(() =>
        assert.equal(setup.getAttribute('aria-disabled'), null)
      )
      fireEvent.click(setup)
      await waitFor(() => assert.notEqual(setupRequest, null))
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          setupRequest,
          'acceptedPreflightRiskCode'
        ),
        false
      )
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('requires explicit acknowledgement for each completed known preflight warning without sending a renderer risk bypass', async () => {
    for (const risk of [
      {
        code: 'workflow-trust-unsafe' as const,
        recovery:
          'An untrusted pull-request workflow can reach the proposed runner labels.',
      },
      {
        code: 'runner-queued-job-blocked' as const,
        recovery: 'A queued job can claim the proposed runner labels.',
      },
    ]) {
      const fromAccount = mock.method(API, 'fromAccount', () => {
        return {
          fetchSelfHostedRunners: async () => ({
            total_count: 0,
            runners: [],
          }),
        } as unknown as API
      })
      const installedIPC = await installRunnerIPC(supportedStatus, {
        'preflight-self-hosted-runner': async () => ({
          ok: false,
          code: risk.code,
          recovery: risk.recovery,
        }),
        'setup-self-hosted-runner': async () => ({
          ok: false,
          code: risk.code,
          recovery: risk.recovery,
        }),
      })
      let view: ReturnType<typeof render> | null = null

      try {
        view = render(
          <SelfHostedRunnerManager
            repository={repository(true)}
            accounts={[account]}
          />
        )

        await waitFor(() =>
          assert.ok(
            screen
              .getAllByRole('alert')
              .some(alert => alert.textContent?.includes(risk.recovery))
          )
        )
        const setup = screen.getByRole('button', { name: 'Set up runner' })
        const workflowTrust = screen.getByRole('checkbox', {
          name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
        })
        const hostAccess = screen.getByRole('checkbox', {
          name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
        })
        const riskAcceptance = screen.getByRole('checkbox', {
          name: 'I reviewed this completed preflight warning and choose to set up this runner despite the stated risks',
        })

        assert.equal(setup.getAttribute('aria-disabled'), 'true')
        fireEvent.click(workflowTrust)
        fireEvent.click(hostAccess)
        assert.equal(setup.getAttribute('aria-disabled'), 'true')
        fireEvent.click(riskAcceptance)
        await waitFor(() =>
          assert.equal(setup.getAttribute('aria-disabled'), null)
        )
        fireEvent.click(setup)

        await waitFor(() => {
          const setupInvoke = installedIPC.invokes.find(
            invoke => invoke.channel === 'setup-self-hosted-runner'
          )
          assert.ok(setupInvoke)
          assert.equal(
            Object.prototype.hasOwnProperty.call(
              setupInvoke.args[0],
              'acceptedPreflightRiskCode'
            ),
            false
          )
        })
      } finally {
        view?.unmount()
        fromAccount.mock.restore()
        installedIPC.restore()
      }
    }
  })

  it('keeps unavailable preflight evidence blocking and does not offer a risk acceptance', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus, {
      'preflight-self-hosted-runner': async () => ({
        ok: false,
        code: 'workflow-trust-unavailable',
        recovery:
          'The complete immutable workflow inventory was unavailable for inspection.',
      }),
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      await waitFor(() =>
        assert.match(
          screen.getByText(/Setup-form safety preflight:/).textContent ?? '',
          /The complete immutable workflow inventory was unavailable for inspection\./
        )
      )
      const setup = screen.getByRole('button', { name: 'Set up runner' })
      assert.equal(
        screen.queryByRole('checkbox', {
          name: 'I reviewed this completed preflight warning and choose to set up this runner despite the stated risks',
        }),
        null
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
        })
      )
      assert.equal(setup.getAttribute('aria-disabled'), 'true')
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('resets risk acceptance whenever proposed runner labels change', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus, {
      'preflight-self-hosted-runner': async () => ({
        ok: false,
        code: 'workflow-trust-unsafe',
        recovery: 'The proposed labels have an unsafe workflow target.',
      }),
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      await screen.findByRole('checkbox', {
        name: 'I reviewed this completed preflight warning and choose to set up this runner despite the stated risks',
      })
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I reviewed this completed preflight warning and choose to set up this runner despite the stated risks',
        })
      )
      const setup = screen.getByRole('button', { name: 'Set up runner' })
      await waitFor(() =>
        assert.equal(setup.getAttribute('aria-disabled'), null)
      )

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Labels (comma-separated)' }),
        { target: { value: 'desktop-material-windows-local, GPU' } }
      )
      await waitFor(() =>
        assert.equal(setup.getAttribute('aria-disabled'), 'true')
      )
      const resetRiskAcceptance = (await screen.findByRole('checkbox', {
        name: 'I reviewed this completed preflight warning and choose to set up this runner despite the stated risks',
      })) as HTMLInputElement
      assert.equal(resetRiskAcceptance.checked, false)
      assert.equal(setup.getAttribute('aria-disabled'), 'true')
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('blocks more than twenty custom runner labels before sending another preflight or setup request', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus)
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )
      await screen.findByText(/Setup-form safety preflight:/)
      const preflightInvokes = () =>
        installedIPC.invokes.filter(
          invoke => invoke.channel === 'preflight-self-hosted-runner'
        )
      await waitFor(() => assert.equal(preflightInvokes().length, 1))

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Labels (comma-separated)' }),
        {
          target: {
            value: Array.from(
              { length: 21 },
              (_, index) => `custom-label-${index}`
            ).join(', '),
          },
        }
      )

      assert.ok(
        await screen.findByText(
          /Add between one and 20 custom runner labels before running the setup preflight\./
        )
      )
      assert.equal(
        screen
          .getByRole('button', { name: 'Set up runner' })
          .getAttribute('aria-disabled'),
        'true'
      )
      assert.equal(preflightInvokes().length, 1)
      assert.equal(
        installedIPC.invokes.some(
          invoke => invoke.channel === 'setup-self-hosted-runner'
        ),
        false
      )
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('binds setup-form preflight to the exact labels and selected account', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus)
    let view: ReturnType<typeof render> | null = null
    const previousGlobalResizeObserver = globalThis.ResizeObserver
    const previousWindowResizeObserver = window.ResizeObserver
    const previousOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetWidth'
    )
    const previousOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight'
    )
    Object.assign(globalThis, { ResizeObserver: TestListResizeObserver })
    Object.assign(window, { ResizeObserver: TestListResizeObserver })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 640,
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 480,
    })

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account, secondaryAccount]}
        />
      )

      assert.ok(await screen.findByText(/Setup-form safety preflight:/))
      const preflightInvokes = () =>
        installedIPC.invokes.filter(
          invoke => invoke.channel === 'preflight-self-hosted-runner'
        )
      await waitFor(() => assert.equal(preflightInvokes().length, 1))
      assert.deepEqual(preflightInvokes()[0].args, [
        {
          accountKey: getAccountKey(account),
          owner: 'runner-owner',
          repository: 'desktop-material',
          githubApiEndpoint: account.endpoint,
          labels: [
            'self-hosted',
            'desktop-material-windows-local',
            'Windows',
            process.arch === 'arm64' ? 'ARM64' : 'X64',
          ],
        },
      ])

      const labels = screen.getByRole('textbox', {
        name: 'Labels (comma-separated)',
      })
      fireEvent.change(labels, {
        target: {
          value: 'desktop-material-windows-local, GPU',
        },
      })
      assert.ok(
        screen.getByText(
          /Waiting to check the current setup form's account and proposed labels\./
        )
      )

      fireEvent.click(screen.getByRole('button', { name: 'GitHub account' }))
      const accountPicker = screen.getByRole('searchbox', {
        name: 'Search accounts',
      })
      fireEvent.change(accountPicker, {
        target: { value: secondaryAccount.login },
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('option'))
      await waitFor(() => assert.equal(preflightInvokes().length, 2))
      assert.deepEqual(preflightInvokes()[1].args, [
        {
          accountKey: getAccountKey(secondaryAccount),
          owner: 'runner-owner',
          repository: 'desktop-material',
          githubApiEndpoint: secondaryAccount.endpoint,
          labels: [
            'self-hosted',
            'desktop-material-windows-local',
            'GPU',
            'Windows',
            process.arch === 'arm64' ? 'ARM64' : 'X64',
          ],
        },
      ])
      assert.ok(
        await screen.findByText(
          /This result applies only to the selected account and proposed labels currently shown in the setup form\./
        )
      )
    } finally {
      view?.unmount()
      Object.assign(globalThis, {
        ResizeObserver: previousGlobalResizeObserver,
      })
      Object.assign(window, { ResizeObserver: previousWindowResizeObserver })
      if (previousOffsetWidth === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth')
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          'offsetWidth',
          previousOffsetWidth
        )
      }
      if (previousOffsetHeight === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight')
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          'offsetHeight',
          previousOffsetHeight
        )
      }
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('uses a fresh live-label audit for Start when setup-form preflight fails', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(managedRunnerStatus, {
      'preflight-self-hosted-runner': async () => ({
        ok: false,
        code: 'runner-queued-job-blocked',
        recovery:
          'The proposed setup-form labels currently match a pending job.',
      }),
      'start-self-hosted-runner': async () => ({
        ok: false,
        code: 'runner-queued-job-blocked',
        recovery:
          'The fresh main-process audit of the managed runner live labels blocked Start.',
      }),
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(
        await screen.findByText(
          /The proposed setup-form labels currently match a pending job\./
        )
      )
      const workflowTrust = screen.getByRole('checkbox', {
        name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
      }) as HTMLInputElement
      const hostAccess = screen.getByRole('checkbox', {
        name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
      }) as HTMLInputElement
      assert.equal(workflowTrust.disabled, false)
      assert.equal(hostAccess.disabled, false)

      const setup = screen.getByRole('button', { name: 'Set up runner' })
      const start = screen.getByRole('button', {
        name: 'Start backup-windows-runner',
      })
      assert.equal(setup.getAttribute('aria-disabled'), 'true')
      assert.equal(start.getAttribute('aria-disabled'), 'true')
      assert.ok(
        screen.getByText(
          /Starting backup-windows-runner runs a fresh main-process audit using that runner's exact live labels, private-fork policy, immutable default-branch workflows, and pending jobs\./
        )
      )

      fireEvent.click(workflowTrust)
      fireEvent.click(hostAccess)
      await waitFor(() =>
        assert.equal(start.getAttribute('aria-disabled'), null)
      )
      assert.equal(setup.getAttribute('aria-disabled'), 'true')
      fireEvent.click(start)

      await waitFor(() =>
        assert.deepEqual(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'start-self-hosted-runner'
          ),
          [
            {
              channel: 'start-self-hosted-runner',
              args: [
                {
                  id: 'managed-stopped',
                  owner: 'runner-owner',
                  repository: 'desktop-material',
                },
              ],
            },
          ]
        )
      )
      assert.ok(
        await screen.findByText(
          'The fresh main-process audit of the managed runner live labels blocked Start.'
        )
      )
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('keeps WSL setup disabled while rendering live runner labels', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 1,
          runners: [liveRunner],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus)
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(await screen.findByText(/The main process proved private-fork/))
      const wslOption = screen.getByRole('option', {
        name: 'Linux in WSL 2 (temporarily unavailable)',
      }) as HTMLOptionElement
      assert.equal(wslOption.disabled, true)

      const runnerRow = screen.getByText(liveRunner.name).closest('li')
      assert.ok(runnerRow)
      assert.equal(
        runnerRow.textContent?.replace(/\s+/g, ' ').trim(),
        'shared-windows-runner · Windows · online · self-hosted, Windows, X64, desktop-material-windows-local'
      )
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('names every managed runner action for its exact runner', async () => {
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(managedRunnerStatus)
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(
        await screen.findByRole('button', {
          name: 'Stop primary-windows-runner',
        })
      )
      assert.ok(
        screen.getByRole('button', {
          name: 'Remove primary-windows-runner',
        })
      )
      assert.ok(
        screen.getByRole('button', {
          name: 'Start backup-windows-runner',
        })
      )
      assert.ok(
        screen.getByRole('button', {
          name: 'Remove backup-windows-runner',
        })
      )
      assert.ok(
        screen.getByRole('status', {
          name: 'primary-windows-runner status: running',
        })
      )
      assert.ok(
        screen.getByRole('status', {
          name: 'backup-windows-runner status: stopped',
        })
      )
      assert.equal(screen.queryByRole('button', { name: 'Start' }), null)
      assert.equal(screen.queryByRole('button', { name: 'Stop' }), null)
      assert.equal(screen.queryByRole('button', { name: 'Remove' }), null)
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('cancels one in-flight setup and refuses duplicate setup', async () => {
    const setupResult = deferred<{
      readonly ok: false
      readonly code: string
      readonly recovery: string
    }>()
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(supportedStatus, {
      'setup-self-hosted-runner': () => setupResult.promise,
      'cancel-self-hosted-runner-operation': async () => true,
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(await screen.findByText(/The main process proved private-fork/))
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
        })
      )

      const setup = screen.getByRole('button', { name: 'Set up runner' })
      await waitFor(() =>
        assert.equal(setup.getAttribute('aria-disabled'), null)
      )
      fireEvent.click(setup)
      await waitFor(() =>
        assert.equal(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'setup-self-hosted-runner'
          ).length,
          1
        )
      )

      const cancel = screen.getByRole('button', {
        name: 'Cancel setup for desktop-material-x64',
      })
      assert.equal(cancel.textContent, 'Cancel setup')
      assert.equal(cancel.getAttribute('aria-disabled'), null)
      fireEvent.click(setup)
      fireEvent.click(cancel)
      fireEvent.click(cancel)

      const setupInvokes = installedIPC.invokes.filter(
        invoke => invoke.channel === 'setup-self-hosted-runner'
      )
      assert.equal(setupInvokes.length, 1)
      const setupRequest = setupInvokes[0].args[0] as { readonly id: string }
      assert.match(
        setupRequest.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
      await waitFor(() =>
        assert.deepEqual(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'cancel-self-hosted-runner-operation'
          ),
          [
            {
              channel: 'cancel-self-hosted-runner-operation',
              args: [setupRequest.id],
            },
          ]
        )
      )

      setupResult.resolve({
        ok: false,
        code: 'runner-setup-cancelled',
        recovery: 'Runner setup was cancelled.',
      })
      assert.ok(await screen.findByText('Runner setup was cancelled.'))
    } finally {
      setupResult.resolve({
        ok: false,
        code: 'runner-setup-cancelled',
        recovery: 'Runner setup was cancelled.',
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('cancels one in-flight managed start and refuses duplicates', async () => {
    const startResult = deferred<{
      readonly ok: false
      readonly code: string
      readonly recovery: string
    }>()
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(managedRunnerStatus, {
      'start-self-hosted-runner': () => startResult.promise,
      'cancel-self-hosted-runner-operation': async () => true,
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )

      assert.ok(await screen.findByText(/The main process proved private-fork/))
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I trust everyone allowed to run repository workflows that can target a managed runner on this machine',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I understand jobs run as my Windows user and WSL does not isolate Windows files or network access',
        })
      )

      const start = screen.getByRole('button', {
        name: 'Start backup-windows-runner',
      })
      await waitFor(() =>
        assert.equal(start.getAttribute('aria-disabled'), null)
      )
      fireEvent.click(start)
      await waitFor(() =>
        assert.deepEqual(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'start-self-hosted-runner'
          ),
          [
            {
              channel: 'start-self-hosted-runner',
              args: [
                {
                  id: 'managed-stopped',
                  owner: 'runner-owner',
                  repository: 'desktop-material',
                },
              ],
            },
          ]
        )
      )

      const cancel = screen.getByRole('button', {
        name: 'Cancel start for backup-windows-runner',
      })
      assert.equal(cancel.textContent, 'Cancel start')
      assert.equal(cancel.getAttribute('aria-disabled'), null)
      fireEvent.click(start)
      fireEvent.click(cancel)
      fireEvent.click(cancel)

      assert.equal(
        installedIPC.invokes.filter(
          invoke => invoke.channel === 'start-self-hosted-runner'
        ).length,
        1
      )
      await waitFor(() =>
        assert.deepEqual(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'cancel-self-hosted-runner-operation'
          ),
          [
            {
              channel: 'cancel-self-hosted-runner-operation',
              args: ['managed-stopped'],
            },
          ]
        )
      )

      startResult.resolve({
        ok: false,
        code: 'runner-start-cancelled',
        recovery: 'Runner start was cancelled.',
      })
      assert.ok(await screen.findByText('Runner start was cancelled.'))
    } finally {
      startResult.resolve({
        ok: false,
        code: 'runner-start-cancelled',
        recovery: 'Runner start was cancelled.',
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })

  it('routes irreversible removal progress into the exact open dialog', async () => {
    const removalResult = deferred<{
      readonly ok: true
      readonly result: { readonly warnings: ReadonlyArray<string> }
    }>()
    const fromAccount = mock.method(API, 'fromAccount', () => {
      return {
        fetchSelfHostedRunners: async () => ({
          total_count: 0,
          runners: [],
        }),
      } as unknown as API
    })
    const installedIPC = await installRunnerIPC(managedRunnerStatus, {
      'remove-self-hosted-runner': () => removalResult.promise,
    })
    let view: ReturnType<typeof render> | null = null

    try {
      view = render(
        <SelfHostedRunnerManager
          repository={repository(true)}
          accounts={[account]}
        />
      )
      assert.ok(await screen.findByText(/The main process proved private-fork/))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove backup-windows-runner',
        })
      )
      const dialog = screen.getByRole('alertdialog')

      // A destructive dialog makes its CANCEL button the form's submit button,
      // so Enter pressed anywhere in the form submits regardless of what the
      // affirmative button looks like. The dialog's own submit handler is what
      // gates the keyboard; a disabled button is not.
      fireEvent.submit(dialog)
      assert.equal(
        installedIPC.invokes.filter(
          invoke => invoke.channel === 'remove-self-hosted-runner'
        ).length,
        0
      )

      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I checked the exact target: the runner backup-windows-runner on runner-owner/desktop-material',
        })
      )
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'I accept the exact effect: it is unregistered from GitHub and its managed files are deleted',
        })
      )
      fireEvent.change(screen.getByRole('slider'), {
        target: { value: '100' },
      })
      fireEvent.submit(dialog)
      await waitFor(() =>
        assert.equal(
          installedIPC.invokes.filter(
            invoke => invoke.channel === 'remove-self-hosted-runner'
          ).length,
          1
        )
      )

      installedIPC.emitProgress({
        runnerId: 'managed-stopped',
        phase: 'removing-runner',
        detail: 'Waiting for GitHub to confirm the exact runner is absent.',
      })
      assert.ok(
        await screen.findByText(
          'Waiting for GitHub to confirm the exact runner is absent.'
        )
      )
      assert.equal(view.container.querySelector('.actions-banner.error'), null)
      assert.equal(
        screen.queryByRole('button', {
          name: /Cancel remove for backup-windows-runner/,
        }),
        null
      )

      removalResult.resolve({ ok: true, result: { warnings: [] } })
      await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null))
    } finally {
      view?.unmount()
      fromAccount.mock.restore()
      installedIPC.restore()
    }
  })
})
