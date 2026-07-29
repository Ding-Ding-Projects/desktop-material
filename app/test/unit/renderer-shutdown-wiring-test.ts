import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readSource = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

describe('renderer shutdown wiring', () => {
  it('registers every renderer-owned durable store with the coordinator', async () => {
    const source = await readSource('ui/index.tsx')

    assert.match(
      source,
      /name: 'profile settings',[\s\S]*?await profileStoreInitialization[\s\S]*?await profileStore\.flush\(\)/
    )
    assert.match(
      source,
      /name: 'notification centre',[\s\S]*?await notificationCentreStoreInitialization[\s\S]*?await notificationCentreStore\.flush\(\)/
    )
    assert.match(
      source,
      /name: 'clone recovery journal',[\s\S]*?appStore\.flushForShutdown\(\)/
    )
  })

  it('does not start asynchronous durable writes from browser unload', async () => {
    const source = await readSource('ui/index.tsx')

    assert.doesNotMatch(
      source,
      /addEventListener\(['"]beforeunload['"][\s\S]*?prepareRendererShutdown/
    )
  })

  it('awaits a bounded renderer drain before native window close', async () => {
    const [windowSource, mainSource, rendererSource, channelsSource] =
      await Promise.all([
        readSource('main-process/app-window.ts'),
        readSource('main-process/main.ts'),
        readSource('ui/index.tsx'),
        readSource('lib/ipc-shared.ts'),
      ])

    assert.match(
      windowSource,
      /window\.on\('close'[\s\S]*?e\.preventDefault\(\)[\s\S]*?requestNativeWindowClose\(\)/
    )
    assert.match(
      windowSource,
      /NativeClosePreparationController[\s\S]*?prepare-window-close[\s\S]*?requestId/
    )
    assert.match(
      mainSource,
      /start-window-close-preparation[\s\S]*?startClosePreparation[\s\S]*?window-close-prepared[\s\S]*?completeClosePreparation/
    )
    assert.match(
      rendererSource,
      /prepare-window-close[\s\S]*?invoke\('start-window-close-preparation', requestId\)[\s\S]*?if \(!accepted\)[\s\S]*?runAfterRendererShutdown[\s\S]*?window-close-prepared/
    )
    assert.match(
      channelsSource,
      /'prepare-window-close': \(requestId: string\) => void/
    )
    assert.match(
      channelsSource,
      /'start-window-close-preparation': \(requestId: string\) => Promise<boolean>/
    )
    assert.match(
      channelsSource,
      /'window-close-prepared': \(requestId: string\) => void/
    )
  })

  it('awaits the coordinator before normal and update-install quit actions', async () => {
    const [mainSource, appStore, updateStore, rendererSource] =
      await Promise.all([
        readSource('main-process/main.ts'),
        readSource('lib/stores/app-store.ts'),
        readSource('ui/lib/update-store.ts'),
        readSource('ui/index.tsx'),
      ])

    assert.match(
      mainSource,
      /ApplicationQuitPreparationCoordinator[\s\S]*?autoUpdater\.quitAndInstall\(\)[\s\S]*?app\.quit\(\)/
    )
    assert.match(
      mainSource,
      /app\.on\('before-quit'[\s\S]*?preventApplicationQuitForUpdate[\s\S]*?handleBeforeQuit/
    )
    assert.match(
      mainSource,
      /quit-and-install-updates[\s\S]*?requestApplicationQuit\('install-update', true\)[\s\S]*?quit-app[\s\S]*?requestApplicationQuit\(\s*'quit',\s*typeof evenIfUpdating === 'boolean' && evenIfUpdating\s*\)/
    )

    assert.match(
      appStore,
      /async _quitApp[\s\S]*?await runAfterRendererShutdown\(\(\) => \{[\s\S]*?quitApp\(evenIfUpdating\)/
    )
    assert.match(
      appStore,
      /resumeAfterCancelledShutdown[\s\S]*?resetRendererShutdown\(\)[\s\S]*?batchCloneStore\.resume\(\)[\s\S]*?autoCloneStore\.start\(\)/
    )
    assert.match(
      rendererSource,
      /cancel-window-close-preparation[\s\S]*?resumeAfterCancelledShutdown\(\)/
    )
    assert.match(
      appStore,
      /flushForShutdown[\s\S]*?autoCloneStore\.stop\(\)[\s\S]*?await this\.batchCloneStore\.requestPause\(\)[\s\S]*?await this\.batchCloneStore\.flush\(\)/
    )
    assert.match(
      updateStore,
      /async quitAndInstallUpdate[\s\S]*?await runAfterRendererShutdown\(\(\) => \{[\s\S]*?quitAndInstallUpdate\(\)/
    )
  })

  it('does not cancel an accepted update quit when its dialog unmounts', async () => {
    const [dialog, dispatcher] = await Promise.all([
      readSource('ui/installing-update/installing-update.tsx'),
      readSource('ui/dispatcher/dispatcher.ts'),
    ])

    assert.match(
      dialog,
      /requestQuit[\s\S]*?this\.quitRequested = true[\s\S]*?await this\.props\.dispatcher\.quitApp\(evenIfUpdating\)/
    )
    assert.match(
      dialog,
      /componentWillUnmount[\s\S]*?if \(!this\.quitRequested\) \{[\s\S]*?cancelQuittingApp\(\)/
    )
    assert.match(
      dialog,
      /onQuitAnywayButtonClicked[\s\S]*?this\.requestQuit\(true\)/
    )
    assert.match(
      dispatcher,
      /quitApp\(evenIfUpdating: boolean\): Promise<void> \{[\s\S]*?return this\.appStore\._quitApp\(evenIfUpdating\)/
    )
  })
})
