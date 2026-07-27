import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { IgnoredSubmoduleDialog } from '../../../src/ui/repository-settings/ignored-submodule-dialog'
import {
  IIgnoredFileInventory,
  IIgnoredSubmoduleRequest,
  IIgnoredSubmoduleResult,
} from '../../../src/lib/cheap-lfs/ignored-submodule-local'
import { IgnoredSubmoduleRejectedError } from '../../../src/lib/cheap-lfs/ignored-submodule-local'
import { INotificationInput } from '../../../src/models/notification-centre'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialogShow: (() => void) | null = null
let restoreWindowResizeObserver: (() => void) | null = null

class DialogResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    const width = 720
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

beforeEach(async () => {
  localStorage.removeItem('language-mode-v1')
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => undefined
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }

  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  prototype.show = function () {
    this.setAttribute('open', '')
  }
  restoreDialogShow = () => {
    prototype.show = previousShow
    restoreDialogShow = null
  }

  const previousGlobalResizeObserver = globalThis.ResizeObserver
  const previousResizeObserver = window.ResizeObserver
  Object.assign(globalThis, { ResizeObserver: DialogResizeObserver })
  Object.assign(window, { ResizeObserver: DialogResizeObserver })
  restoreWindowResizeObserver = () => {
    Object.assign(globalThis, { ResizeObserver: previousGlobalResizeObserver })
    Object.assign(window, { ResizeObserver: previousResizeObserver })
    restoreWindowResizeObserver = null
  }
})

afterEach(() => {
  restoreIpcSend?.()
  restoreDialogShow?.()
  restoreWindowResizeObserver?.()
  localStorage.removeItem('language-mode-v1')
})

const repository = new Repository('C:/fixtures/superproject', 1, null, false)

const inventory: IIgnoredFileInventory = {
  id: 'inventory-1',
  capturedAtMs: 1_700_000_000_000,
  repositoryPath: repository.path,
  candidates: [
    {
      path: 'assets/data.bin',
      size: 21,
      modifiedAtMs: 1_700_000_000_000,
      proof: { source: '.gitignore', line: 2, pattern: '*.bin' },
    },
    {
      path: 'build/output.txt',
      size: 18,
      modifiedAtMs: 1_700_000_000_000,
      proof: { source: '.gitignore', line: 1, pattern: 'build/' },
    },
  ],
  truncated: false,
}

function stubDispatcher(notifications: INotificationInput[]): Dispatcher {
  return {
    postNotification: (input: INotificationInput) => {
      notifications.push(input)
    },
  } as unknown as Dispatcher
}

const successResult: IIgnoredSubmoduleResult = {
  destinationPath: 'local-large-files',
  stagedFiles: [{ path: 'assets/data.bin', size: 21, sha256: 'abc' }],
  commitSha: '1234567890abcdef1234567890abcdef12345678',
  totalBytes: 21,
  retainedRecoveryDirectory: null,
}

interface IRenderResult {
  readonly notifications: ReadonlyArray<INotificationInput>
  readonly requests: ReadonlyArray<IIgnoredSubmoduleRequest>
}

function renderDialog(
  onStage?: (
    request: IIgnoredSubmoduleRequest
  ) => Promise<IIgnoredSubmoduleResult>
): IRenderResult {
  const notifications: INotificationInput[] = []
  const requests: IIgnoredSubmoduleRequest[] = []

  render(
    <IgnoredSubmoduleDialog
      repository={repository}
      dispatcher={stubDispatcher(notifications)}
      onDismissed={() => undefined}
      onLoadInventory={async () => inventory}
      onStage={async (_repository, _inventory, request) => {
        requests.push(request)
        return onStage ? onStage(request) : successResult
      }}
    />
  )

  return { notifications, requests }
}

async function selectFirstCandidate() {
  const checkbox = await screen.findByLabelText('assets/data.bin')
  fireEvent.click(checkbox)
}

describe('IgnoredSubmoduleDialog', () => {
  it('lists proven-ignored files with the exact rule that proves them', async () => {
    renderDialog()

    assert.ok(await screen.findByLabelText('assets/data.bin'))
    assert.ok(screen.getByText('Ignored by .gitignore:2 — *.bin'))
    assert.ok(screen.getByText('Ignored by .gitignore:1 — build/'))
  })

  it('requires an explicit review and confirmation before doing anything', async () => {
    const { requests } = renderDialog()
    await selectFirstCandidate()

    // Nothing runs from the file list itself.
    assert.strictEqual(requests.length, 0)

    fireEvent.click(screen.getByRole('button', { name: /Review this/i }))

    // The review states exactly what will and will not happen.
    assert.ok(screen.getByText(/Confirm before anything changes/i))
    assert.ok(
      screen.getByText(/New submodule folder: local-large-files/i),
      'the destination is named'
    )
    assert.ok(screen.getByText(/These 1 files will be copied \(21 bytes\)/i))
    assert.ok(screen.getByText(/It will not upload any Cheap LFS object/i))
    assert.ok(
      screen.getByText(/will not create a repository on GitHub/i),
      'the deferred remote creation is stated'
    )
    assert.ok(screen.getByText(/will not commit in this repository/i))
    assert.strictEqual(requests.length, 0, 'reviewing still changes nothing')

    fireEvent.click(
      screen.getByRole('button', { name: /Copy files and add the submodule/i })
    )

    await waitFor(() => assert.strictEqual(requests.length, 1))
    assert.deepStrictEqual(requests[0].selectedPaths, ['assets/data.bin'])
    assert.strictEqual(requests[0].destinationPath, 'local-large-files')
  })

  it('reports progress and success through non-blocking notifications', async () => {
    const { notifications } = renderDialog()
    await selectFirstCandidate()
    fireEvent.click(screen.getByRole('button', { name: /Review this/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Copy files and add the submodule/i })
    )

    await waitFor(() => assert.strictEqual(notifications.length, 2))
    assert.match(notifications[0].title, /Staging ignored files/i)
    assert.match(notifications[1].title, /Local submodule created/i)
    assert.match(notifications[1].body, /Nothing was uploaded or pushed/i)
    assert.ok(await screen.findByText(/Submodule added/i))
  })

  it('shows every refused file with its own reason and changes nothing', async () => {
    const { notifications } = renderDialog(async () => {
      throw new IgnoredSubmoduleRejectedError(
        'refused',
        [
          {
            path: 'assets/data.bin',
            reason: 'stale-inventory',
            detail: 'changed on disk',
          },
        ],
        null
      )
    })

    await selectFirstCandidate()
    fireEvent.click(screen.getByRole('button', { name: /Review this/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /Copy files and add the submodule/i })
    )

    assert.ok(
      await screen.findByText(
        /assets\/data\.bin — This file changed since it was listed/i
      )
    )
    assert.ok(
      screen.getByText(/These files were refused and nothing was changed/i)
    )
    await waitFor(() => assert.strictEqual(notifications.length, 2))
    assert.match(notifications[1].title, /Ignored file staging stopped/i)
  })

  it('narrows the list through the registered shared search surface', async () => {
    renderDialog()
    await screen.findByLabelText('assets/data.bin')

    const search = screen.getByLabelText('Search ignored files')
    assert.strictEqual(
      search.getAttribute('data-search-surface-id'),
      'ignored-submodule-files'
    )

    fireEvent.change(search, { target: { value: 'build/' } })

    await waitFor(() =>
      assert.strictEqual(screen.queryByLabelText('assets/data.bin'), null)
    )
    assert.ok(screen.getByLabelText('build/output.txt'))
  })
})
