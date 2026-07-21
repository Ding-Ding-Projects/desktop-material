import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { AppTheme } from '../../../src/ui/app-theme'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'
import { DefaultAppearanceCustomization } from '../../../src/models/appearance-customization'
import { fireEvent, render } from '../../helpers/ui/render'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'

type TUnlinkBehavior = (path: string) => Promise<void>

let unlinkBehavior: TUnlinkBehavior = async () => {}

mock.module('fs/promises', {
  namedExports: {
    unlink: (path: string) => unlinkBehavior(path),
  },
})

async function getConfigLockFileExists() {
  return (await import('../../../src/ui/lib/config-lock-file-exists'))
    .ConfigLockFileExists
}

afterEach(async () => {
  unlinkBehavior = async () => {}
  document.body.className = ''
  document.body.style.removeProperty('--background-color')
  for (const attribute of [...document.body.attributes]) {
    if (attribute.name.startsWith('data-dm-')) {
      document.body.removeAttribute(attribute.name)
    }
  }
  document.documentElement.style.colorScheme = ''
  document.documentElement.lang = 'en'
  document.documentElement.removeAttribute('data-language-mode')
})

describe('helper side-effect surfaces', () => {
  it('applies theme classes, updates color scheme, and clears theme classes on unmount', async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    const sends: Array<[string, string]> = []
    const languageModes = new Array<string>()
    const onLanguageModeChanged = (event: Event) => {
      languageModes.push((event as CustomEvent<string>).detail)
    }
    document.addEventListener(LanguageModeChangedEvent, onLanguageModeChanged)

    electron.ipcRenderer.send = (channel: string, value: string) => {
      sends.push([channel, value])
    }

    try {
      document.body.style.setProperty('--background-color', 'rgb(1, 2, 3)')

      const view = render(
        <AppTheme
          theme={ApplicationTheme.Dark}
          appearance={DefaultAppearanceCustomization}
        />
      )

      assert.ok(document.body.classList.contains('theme-dark'))
      assert.equal(
        document.body.hasAttribute('data-dm-highlight-features'),
        false
      )
      assert.equal(
        document.body.getAttribute('data-dm-language-mode'),
        'english'
      )
      assert.equal(document.documentElement.lang, 'en')
      assert.equal(
        document.documentElement.getAttribute('data-language-mode'),
        'english'
      )
      assert.equal(
        document.body.getAttribute('data-dm-submodule-back-style'),
        'tonal'
      )
      assert.equal(document.documentElement.style.colorScheme, 'dark')
      assert.deepEqual(sends, [
        ['update-window-background-color', 'rgb(1, 2, 3)'],
      ])

      view.rerender(
        <AppTheme
          theme={ApplicationTheme.Dark}
          appearance={{
            ...DefaultAppearanceCustomization,
            languageMode: 'cantonese',
          }}
        />
      )

      assert.equal(document.documentElement.lang, 'zh-HK')
      assert.equal(
        document.documentElement.getAttribute('data-language-mode'),
        'cantonese'
      )

      view.rerender(
        <AppTheme
          theme={ApplicationTheme.Light}
          appearance={{
            ...DefaultAppearanceCustomization,
            accentPalette: 'violet',
            motion: 'reduced',
            languageMode: 'bilingual',
            submoduleBackButtonStyle: 'outlined',
            submoduleBackButtonLabel: 'icon-only',
            toolbarTextStyle: {
              fontFamily: 'Georgia',
              fontSize: 20,
              color: '#a93a5b',
              bold: true,
              italic: true,
              textAlign: 'center',
            },
            highlightDesktopMaterialFeatures: true,
          }}
        />
      )

      assert.equal(document.body.classList.contains('theme-dark'), false)
      assert.ok(document.body.classList.contains('theme-light'))
      assert.equal(document.body.getAttribute('data-dm-accent'), 'violet')
      assert.equal(document.body.getAttribute('data-dm-motion'), 'reduced')
      assert.equal(
        document.body.getAttribute('data-dm-language-mode'),
        'bilingual'
      )
      assert.equal(document.documentElement.lang, 'en')
      assert.equal(
        document.documentElement.getAttribute('data-language-mode'),
        'bilingual'
      )
      assert.equal(
        document.body.getAttribute('data-dm-submodule-back-style'),
        'outlined'
      )
      assert.equal(
        document.body.getAttribute('data-dm-submodule-back-label'),
        'icon-only'
      )
      assert.match(
        document.body.getAttribute('data-dm-toolbar-typography') ?? '',
        /Georgia/
      )
      assert.equal(
        document.body.style.getPropertyValue('--dm-toolbar-text-color'),
        '#a93a5b'
      )
      assert.equal(
        document.body.style.getPropertyValue('--dm-toolbar-title-font-size'),
        '20px'
      )
      assert.match(
        document.body.style.getPropertyValue('--dm-toolbar-font-family'),
        /Georgia/
      )
      assert.equal(
        document.body.hasAttribute('data-dm-highlight-features'),
        // Highlighting is owned by each concrete appearance surface. The
        // retired body-wide flag must stay absent after legacy state reloads.
        false
      )
      assert.equal(document.documentElement.style.colorScheme, 'light')
      assert.deepEqual(sends.at(-1), [
        'update-window-background-color',
        'rgb(1, 2, 3)',
      ])
      assert.deepEqual(languageModes, ['english', 'cantonese', 'bilingual'])

      view.unmount()

      assert.equal(document.body.classList.contains('theme-light'), false)
      assert.equal(document.body.hasAttribute('data-dm-accent'), false)
      assert.equal(
        document.body.hasAttribute('data-dm-highlight-features'),
        false
      )
      assert.equal(document.documentElement.lang, 'en')
      assert.equal(
        document.documentElement.hasAttribute('data-language-mode'),
        false
      )
    } finally {
      document.removeEventListener(
        LanguageModeChangedEvent,
        onLanguageModeChanged
      )
      electron.ipcRenderer.send = previousSend
    }
  })

  it('deletes the config lock file and retries when deletion succeeds or file is already gone', async () => {
    const deletedPaths: Array<string> = []
    let deletedCount = 0
    const errors: Array<string> = []

    unlinkBehavior = async path => {
      deletedPaths.push(path)
      if (path.endsWith('.missing.lock')) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
        throw error
      }
    }

    const ConfigLockFileExists = await getConfigLockFileExists()
    const view = render(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    view.rerender(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.missing.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    assert.deepEqual(deletedPaths, ['/tmp/repo.lock', '/tmp/repo.missing.lock'])
    assert.equal(deletedCount, 2)
    assert.deepEqual(errors, [])
  })

  it('reports config lock deletion failures other than ENOENT', async () => {
    let deletedCount = 0
    const errors: Array<string> = []

    unlinkBehavior = async () => {
      const error = Object.assign(new Error('permission denied'), {
        code: 'EACCES',
      })
      throw error
    }

    const ConfigLockFileExists = await getConfigLockFileExists()
    const view = render(
      <ConfigLockFileExists
        lockFilePath="/tmp/repo.lock"
        onLockFileDeleted={() => {
          deletedCount++
        }}
        onError={(error: Error) => {
          errors.push(error.message)
        }}
      />
    )

    fireEvent.click(view.container.querySelector('.link-button-component')!)
    await Promise.resolve()

    assert.equal(deletedCount, 0)
    assert.deepEqual(errors, ['permission denied'])
  })
})
