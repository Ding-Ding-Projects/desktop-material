import { describe, it, mock } from 'node:test'
import * as React from 'react'
import { writeFileSync } from 'node:fs'

import { render } from '../helpers/ui/render'

mock.module('../../src/lib/git/config', {
  namedExports: {
    getConfigValue: async () => null,
    getGlobalConfigValue: async () => null,
    setConfigValue: async () => undefined,
    removeConfigValue: async () => undefined,
  },
})

const { Preferences } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../src/ui/preferences/preferences') as typeof import('../../src/ui/preferences/preferences')

const noop = () => undefined

describe('diag prefs', () => {
  it('dumps preferences html', async () => {
    const view = render(
      <Preferences
        {...({
          dispatcher: {
            closePopup: noop,
            fetchCopilotModels: noop,
            isElementAppearanceCoordinatorReady: () => false,
          },
          accounts: [],
          onDismissed: noop,
          confirmRepositoryRemoval: false,
          confirmDiscardChanges: false,
          confirmDiscardChangesPermanently: false,
          confirmDiscardStash: false,
          confirmCheckoutCommit: false,
          confirmForcePush: false,
          confirmUndoCommit: false,
          askForConfirmationOnCommitFilteredChanges: false,
          confirmCommitMessageOverride: false,
          confirmWorktreeRemoval: false,
          uncommittedChangesStrategy: 'askForConfirmation',
          selectedExternalEditor: null,
          selectedShell: null,
          selectedTheme: 'light',
          selectedTabSize: 2,
          repositoryIndicatorsEnabled: true,
          onSelectedThemeChanged: noop,
          onSelectedTabSizeChanged: noop,
          useWindowsOpenSSH: false,
          useExternalCredentialHelper: false,
          notificationsEnabled: true,
          optOutOfUsageTracking: false,
          showCommitLengthWarning: false,
          verboseLogging: false,
          appearanceCustomization: {},
          errorPresentationStyle: 'dialog',
          useCustomEditor: false,
          useCustomShell: false,
          underlineLinks: true,
          showDiffCheckMarks: true,
        } as any)}
      />
    )
    await new Promise(resolve => setTimeout(resolve, 200))
    writeFileSync(
      '/tmp/claude-0/-home-user-desktop-material/bb072003-1d68-5978-90df-3af2e05af65a/scratchpad/prefs.html',
      view.baseElement.innerHTML
    )
  })
})
