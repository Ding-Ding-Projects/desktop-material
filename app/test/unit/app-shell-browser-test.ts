import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import { shell as electronShell } from 'electron'
import {
  BrowserOpenModeStorageKey,
  IOpenExternalOptions,
} from '../../src/lib/internal-browser'

interface IOpenCall {
  readonly path: string
  readonly options: IOpenExternalOptions
}

let openResult = true
let openCalls: ReadonlyArray<IOpenCall> = []

mock.module('../../src/ui/main-process-proxy', {
  namedExports: {
    showItemInFolder: () => undefined,
    showFolderContents: () => undefined,
    openExternal: async (path: string, options: IOpenExternalOptions) => {
      openCalls = [...openCalls, { path, options }]
      return openResult
    },
    moveItemToTrash: async () => undefined,
    forceDeleteDirectory: async () => undefined,
  },
})

const mutableElectronShell = electronShell as {
  beep: () => void
  openPath: (path: string) => Promise<string>
}
mutableElectronShell.beep = () => undefined
mutableElectronShell.openPath = async () => ''

let appShell: typeof import('../../src/lib/app-shell').shell

before(async () => {
  ;({ shell: appShell } = await import('../../src/lib/app-shell'))
})

beforeEach(() => {
  localStorage.removeItem(BrowserOpenModeStorageKey)
  openResult = true
  openCalls = []
})

describe('app shell browser routing', () => {
  it('forwards a fresh external preference and one main-process failure report', async () => {
    assert.equal(await appShell.openExternal('https://example.com/docs'), true)
    assert.deepEqual(openCalls, [
      {
        path: 'https://example.com/docs',
        options: {
          mode: 'external',
          intent: 'default',
          reportFailure: true,
        },
      },
    ])
  })

  it('returns a rejected main-process result without creating a renderer-side duplicate', async () => {
    openResult = false

    assert.equal(
      await appShell.openExternal(
        'https://example.com/download?token=must-not-appear'
      ),
      false
    )
    assert.equal(openCalls.length, 1)
    assert.equal(openCalls[0].options.reportFailure, true)
  })

  it('preserves an explicit internal choice', async () => {
    localStorage.setItem(BrowserOpenModeStorageKey, 'internal')

    assert.equal(await appShell.openExternal('https://example.com/docs'), true)
    assert.equal(openCalls[0].options.mode, 'internal')
    assert.equal(openCalls[0].options.reportFailure, true)
  })

  it('forwards non-web targets for main-process filtering', async () => {
    openResult = false

    assert.equal(await appShell.openExternal('file:///C:/fixture.txt'), false)
    assert.equal(
      await appShell.openExternal('mailto:octocat@example.com'),
      false
    )
    assert.deepEqual(
      openCalls.map(call => call.options.reportFailure),
      [true, true]
    )
  })

  it('lets a caller suppress the main-process notice when it handles false itself', async () => {
    openResult = false

    assert.equal(
      await appShell.openExternal('https://example.com/manual-upload', {
        reportFailure: false,
      }),
      false
    )
    assert.equal(openCalls.length, 1)
    assert.equal(openCalls[0].options.reportFailure, false)
  })
})
