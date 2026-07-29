import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import {
  IBuildRunPreferences,
  defaultBuildRunPreferences,
} from '../../../src/models/build-run-preferences'
import { BuildRunSettings } from '../../../src/ui/repository-settings/build-run-settings'
import { CheapLfsSettings } from '../../../src/ui/repository-settings/cheap-lfs-settings'
import { RepositorySettingsTab } from '../../../src/ui/repository-settings/repository-settings'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import { translate } from '../../../src/lib/i18n'
import { Popup, PopupType } from '../../../src/models/popup'

const repository = () =>
  new Repository('C:/cheap-lfs-repo', 1, null, false, null, {}, false)

const githubRepository = (isPrivate: boolean | null) =>
  new Repository(
    'C:/cheap-lfs-repo',
    1,
    new GitHubRepository(
      'cheap-lfs-repo',
      new Owner('desktop', 'https://api.github.com', 1),
      1,
      isPrivate
    ),
    false
  )

describe('Cheap LFS settings tab preferences', () => {
  it('defaults both automation toggles on', () => {
    assert.equal(defaultBuildRunPreferences.autoMaterializeCheapLfs, true)
    assert.equal(defaultBuildRunPreferences.autoPinLargeFilesOnCommit, true)
    assert.equal(defaultBuildRunPreferences.parallelCheapLfsUploads, true)
    assert.equal(defaultBuildRunPreferences.cheapLfsStorageProvider, 'release')
    assert.equal(defaultBuildRunPreferences.cheapLfsPayloadEncryption, false)
    assert.equal(
      defaultBuildRunPreferences.cheapLfsPayloadEncryptionConfirmed,
      false
    )
  })

  it('toggles autoMaterializeCheapLfs through the settings checkbox', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={{
          ...defaultBuildRunPreferences,
          autoMaterializeCheapLfs: false,
        }}
        onPreferencesChanged={p => changes.push(p)}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /download large files after cloning/i,
    })
    fireEvent.click(checkbox)

    assert.equal(changes.length, 1)
    assert.equal(changes[0].autoMaterializeCheapLfs, true)
    // The pin toggle must not ride along with the materialize toggle.
    assert.equal(changes[0].autoPinLargeFilesOnCommit, true)
  })

  it('toggles autoPinLargeFilesOnCommit through the settings checkbox', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={{
          ...defaultBuildRunPreferences,
          autoPinLargeFilesOnCommit: false,
        }}
        onPreferencesChanged={p => changes.push(p)}
      />
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /pin large files when committing/i,
    })
    fireEvent.click(checkbox)

    assert.equal(changes.length, 1)
    assert.equal(changes[0].autoPinLargeFilesOnCommit, true)
    assert.equal(changes[0].autoMaterializeCheapLfs, true)
  })

  it('renders both checkboxes reflecting the persisted preferences', () => {
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={{
          ...defaultBuildRunPreferences,
          autoMaterializeCheapLfs: false,
          autoPinLargeFilesOnCommit: true,
        }}
        onPreferencesChanged={() => {}}
      />
    )

    const materialize = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /download large files after cloning/i,
    })
    const pin = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /pin large files when committing/i,
    })
    assert.equal(materialize.checked, false)
    assert.equal(pin.checked, true)
  })

  it('defaults a legacy missing parallel field on and persists sequential mode', () => {
    const changes: IBuildRunPreferences[] = []
    const preferences = {
      ...defaultBuildRunPreferences,
      parallelCheapLfsUploads: undefined,
    }
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={preferences}
        onPreferencesChanged={preference => changes.push(preference)}
      />
    )

    const parallel = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /upload up to 3 large files at once/i,
    })
    assert.equal(parallel.checked, true)
    fireEvent.click(parallel)
    assert.equal(changes.at(-1)?.parallelCheapLfsUploads, false)
    assert.equal(changes.at(-1)?.autoPinLargeFilesOnCommit, true)
    assert.equal(changes.at(-1)?.autoMaterializeCheapLfs, true)
  })

  it('provides English, Cantonese, and bilingual parallel-upload copy', () => {
    const english = translate('cheapLfs.settings.parallelUploads', 'english')
    const cantonese = translate(
      'cheapLfs.settings.parallelUploads',
      'cantonese'
    )
    const bilingual = translate(
      'cheapLfs.settings.parallelUploads',
      'bilingual'
    )
    assert.match(english, /3 large files/i)
    assert.match(cantonese, /3 個大檔案/)
    assert.match(bilingual, /3 large files/i)
    assert.match(bilingual, /3 個大檔案/)

    const autoPin = translate('cheapLfs.settings.autoPin', 'bilingual')
    const autoMaterialize = translate(
      'cheapLfs.settings.autoMaterialize',
      'bilingual'
    )
    const help = translate('cheapLfs.settings.parallelUploadsHelp', 'english')
    assert.match(autoPin, /Pin large files when committing/)
    assert.match(autoPin, /自動 pin 大檔案/)
    assert.match(autoMaterialize, /Download large files after cloning/)
    assert.match(autoMaterialize, /自動下載大檔案/)
    assert.match(help, /transfer lanes/)
    assert.doesNotMatch(help, /release lanes/i)
  })

  it('persists the Release, GHCR, and Docker Hub storage selector', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={preference => changes.push(preference)}
      />
    )

    const selector = screen.getByRole<HTMLSelectElement>('combobox', {
      name: /large-file storage/i,
    })
    assert.equal(selector.value, 'release')
    fireEvent.change(selector, { target: { value: 'ghcr' } })
    assert.equal(changes.at(-1)?.cheapLfsStorageProvider, 'ghcr')
    assert.equal(changes.at(-1)?.cheapLfsPayloadEncryption, false)
    assert.equal(changes.at(-1)?.cheapLfsPayloadEncryptionConfirmed, false)
    fireEvent.change(selector, { target: { value: 'docker-hub' } })
    assert.equal(changes.at(-1)?.cheapLfsStorageProvider, 'docker-hub')

    const cantonese = translate(
      'cheapLfs.settings.storageDockerHub',
      'cantonese'
    )
    const bilingual = translate('cheapLfs.settings.storageGhcr', 'bilingual')
    assert.match(cantonese, /Docker Hub/)
    assert.match(bilingual, /GHCR/)
  })

  it('hides Release cloud compression while GHCR storage is selected', () => {
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        preferences={{
          ...defaultBuildRunPreferences,
          cheapLfsStorageProvider: 'ghcr',
        }}
        onPreferencesChanged={() => {}}
      />
    )

    assert.equal(
      screen.queryByRole('checkbox', {
        name: /enable cloud compression for this private repository/i,
      }),
      null
    )
    assert.equal(
      screen.queryByRole('checkbox', {
        name: /encrypt new release payloads/i,
      }),
      null
    )
  })

  it('enables encryption only after the password warning is acknowledged and zeroes the callback buffer', async () => {
    const changes: IBuildRunPreferences[] = []
    let popup: Popup | undefined
    const dispatcher = {
      showPopup: async (nextPopup: Popup) => {
        popup = nextPopup
      },
      postError: async (_error: Error) => {},
    }
    const credentialActions = {
      getStatus: async () => 'missing' as const,
      save: async () => true,
      forget: async () => 'missing' as const,
      verify: async () => undefined,
    }

    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        dispatcher={dispatcher}
        credentialActions={credentialActions}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={preferences => changes.push(preferences)}
      />
    )

    await waitFor(() => assert.ok(screen.getByText(/no password is saved/i)))
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /encrypt new release payloads/i,
      })
    )

    await waitFor(() => assert.ok(popup !== undefined))
    if (popup?.type !== PopupType.CheapLfsPayloadPassword) {
      assert.fail('Expected the Cheap LFS payload-password popup')
    }
    assert.equal(popup.purpose, 'encrypt')
    assert.equal(popup.requireIrreversibleAcknowledgement, true)
    assert.equal(changes.length, 0)

    const password = randomBytes(32)
    const secretMarker = password.toString('hex')
    popup.onSubmit(password, false)

    await waitFor(() =>
      assert.equal(changes.at(-1)?.cheapLfsPayloadEncryption, true)
    )
    assert.equal(changes.at(-1)?.cheapLfsPayloadEncryptionConfirmed, true)
    assert.equal(JSON.stringify(changes).includes(secretMarker), false)
    assert.ok(password.every(byte => byte === 0))
  })

  it('leaves encryption off when its password popup is removed', async () => {
    const changes: IBuildRunPreferences[] = []
    let popup: Popup | undefined
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        dispatcher={{
          showPopup: async nextPopup => {
            popup = nextPopup
          },
          postError: async () => {},
        }}
        credentialActions={{
          getStatus: async () => 'missing',
          save: async () => true,
          forget: async () => 'missing',
          verify: async () => undefined,
        }}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={preferences => changes.push(preferences)}
      />
    )

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /encrypt new release payloads/i,
      })
    )
    await waitFor(() => assert.ok(popup !== undefined))
    popup?.onRemoved?.('removed')
    assert.equal(changes.length, 0)
  })

  it('keeps encryption off and does not save when the authenticated test block fails', async () => {
    const changes: IBuildRunPreferences[] = []
    let popup: Popup | undefined
    let saveCalls = 0
    let reportedErrors = 0
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        dispatcher={{
          showPopup: async nextPopup => {
            popup = nextPopup
          },
          postError: async () => {
            reportedErrors++
          },
        }}
        credentialActions={{
          getStatus: async () => 'missing',
          save: async () => {
            saveCalls++
            return true
          },
          forget: async () => 'missing',
          verify: async () => {
            throw new Error('authenticated test-block verification failed')
          },
        }}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={preferences => changes.push(preferences)}
      />
    )

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /encrypt new release payloads/i,
      })
    )
    await waitFor(() => assert.ok(popup !== undefined))
    if (popup?.type !== PopupType.CheapLfsPayloadPassword) {
      assert.fail('Expected the Cheap LFS payload-password popup')
    }
    const password = randomBytes(32)
    popup.onSubmit(password, true)

    await waitFor(() => assert.equal(reportedErrors, 1))
    assert.equal(changes.length, 0)
    assert.equal(saveCalls, 0)
    assert.ok(password.every(byte => byte === 0))
  })

  it('saves a changed password only through the credential action and zeroes it', async () => {
    let popup: Popup | undefined
    let savedValue: Buffer | undefined
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        dispatcher={{
          showPopup: async nextPopup => {
            popup = nextPopup
          },
          postError: async () => {},
        }}
        credentialActions={{
          getStatus: async () => 'missing',
          save: async (_repository, password) => {
            savedValue = Buffer.from(password)
            return true
          },
          forget: async () => 'missing',
          verify: async () => undefined,
        }}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={() => {}}
      />
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: /set password/i }))
    )
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))
    await waitFor(() => assert.ok(popup !== undefined))
    if (popup?.type !== PopupType.CheapLfsPayloadPassword) {
      assert.fail('Expected the Cheap LFS payload-password popup')
    }
    assert.equal(popup.purpose, 'change')

    const password = randomBytes(32)
    const expectedSavedValue = Buffer.from(password)
    popup.onSubmit(password, true)
    await waitFor(() => assert.deepEqual(savedValue, expectedSavedValue))
    await waitFor(() =>
      assert.ok(screen.getByText(/password was saved in windows/i))
    )
    assert.ok(password.every(byte => byte === 0))
    savedValue?.fill(0)
    expectedSavedValue.fill(0)
  })

  it('forgets a saved password only after explicit popup confirmation', async () => {
    let popup: Popup | undefined
    let forgetCalls = 0
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        dispatcher={{
          showPopup: async nextPopup => {
            popup = nextPopup
          },
          postError: async () => {},
        }}
        credentialActions={{
          getStatus: async () => 'saved',
          save: async () => true,
          forget: async () => {
            forgetCalls++
            return 'deleted'
          },
          verify: async () => undefined,
        }}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={() => {}}
      />
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: /forget saved password/i }))
    )
    fireEvent.click(
      screen.getByRole('button', { name: /forget saved password/i })
    )
    await waitFor(() => assert.ok(popup !== undefined))
    if (popup?.type !== PopupType.CheapLfsPayloadPassword) {
      assert.fail('Expected the Cheap LFS payload-password popup')
    }
    assert.equal(popup.purpose, 'forget')
    assert.equal(forgetCalls, 0)

    const confirmation = Buffer.alloc(0)
    popup.onSubmit(confirmation, false)
    await waitFor(() => assert.equal(forgetCalls, 1))
    await waitFor(() =>
      assert.ok(screen.getByText(/saved password was removed/i))
    )
    assert.ok(confirmation.every(byte => byte === 0))
  })

  it('shows confirmed-public cloud compression as automatic', () => {
    render(
      <CheapLfsSettings
        repository={githubRepository(false)}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={() => {}}
      />
    )

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /automatic for public repositories/i,
    })
    assert.equal(checkbox.checked, true)
    assert.equal(checkbox.disabled, true)
  })

  it('persists explicit private-repository cloud-compression consent', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <CheapLfsSettings
        repository={githubRepository(true)}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={preference => changes.push(preference)}
      />
    )

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /enable cloud compression for this private repository/i,
    })
    assert.equal(checkbox.checked, false)
    fireEvent.click(checkbox)
    assert.equal(changes.at(-1)?.cheapLfsCloudCompression, true)
  })

  it('fails closed when repository visibility is unknown', () => {
    render(
      <CheapLfsSettings
        repository={githubRepository(null)}
        preferences={{
          ...defaultBuildRunPreferences,
          cheapLfsCloudCompression: true,
        }}
        onPreferencesChanged={() => {}}
      />
    )

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /enable cloud compression for this private repository/i,
    })
    assert.equal(checkbox.checked, false)
    assert.equal(checkbox.disabled, true)
  })
})

describe('Cheap LFS repository-settings tab wiring', () => {
  const settingsSource = readFileSync(
    join(
      process.cwd(),
      'app/src/ui/repository-settings/repository-settings.tsx'
    ),
    'utf8'
  )

  it('registers the Cheap LFS tab immediately after Build & Run', () => {
    assert.equal(
      RepositorySettingsTab.CheapLfs,
      RepositorySettingsTab.BuildRun + 1
    )
    // The enum-position === TabBar-position invariant: the unconditional tabs
    // stay contiguous and ForkSettings stays last.
    assert.match(settingsSource, /BuildRun,\s*CheapLfs,\s*Submodules,/)
    assert.match(
      settingsSource,
      /translationKey="repositorySettings\.buildRunTab"[\s\S]*?translationKey="repositorySettings\.cheapLfsTab"[\s\S]*?translationKey="submodule\.title"/
    )
  })

  it('renders the Cheap LFS tab from the dedicated component with the shared preference plumbing', () => {
    assert.match(
      settingsSource,
      /case RepositorySettingsTab\.CheapLfs:[\s\S]*?<CheapLfsSettings[\s\S]*?repository=\{this\.props\.repository\}[\s\S]*?preferences=\{this\.state\.buildRunPreferences\}[\s\S]*?onPreferencesChanged=\{this\.onBuildRunPreferencesChanged\}/
    )
  })

  it('localizes the tab label in English and playful Cantonese', () => {
    const english = translate('repositorySettings.cheapLfsTab', 'english')
    const cantonese = translate('repositorySettings.cheapLfsTab', 'cantonese')
    assert.match(english, /Cheap LFS/)
    assert.match(cantonese, /Cheap LFS/)
    assert.notEqual(english, cantonese)
    assert.equal(
      translate('repositorySettings.cheapLfsTab', 'bilingual'),
      `${english} · ${cantonese}`
    )
  })

  it('keeps the Cheap LFS controls off the Build & Run tab', () => {
    render(
      <BuildRunSettings
        repository={githubRepository(true)}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={() => {}}
      />
    )

    assert.equal(
      screen.queryByRole('combobox', { name: /large-file storage/i }),
      null
    )
    assert.equal(
      screen.queryByRole('checkbox', {
        name: /pin large files when committing/i,
      }),
      null
    )
    assert.equal(
      screen.queryByRole('checkbox', {
        name: /download large files after cloning/i,
      }),
      null
    )
  })
})
