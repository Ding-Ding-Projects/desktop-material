import assert from 'node:assert'
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
  getCheapLfsUploadConcurrency,
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
    assert.equal(defaultBuildRunPreferences.cheapLfsCloneHelperEnabled, true)
    assert.equal(defaultBuildRunPreferences.parallelCheapLfsUploads, true)
    assert.equal(defaultBuildRunPreferences.cheapLfsUploadConcurrency, 3)
    assert.equal(defaultBuildRunPreferences.cheapLfsStorageProvider, 'release')
    assert.equal(defaultBuildRunPreferences.cheapLfsPayloadEncryption, false)
    assert.equal(
      defaultBuildRunPreferences.cheapLfsPayloadEncryptionConfirmed,
      false
    )
  })

  it('defaults the cross-platform clone helper on and persists an explicit opt-out', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={{
          ...defaultBuildRunPreferences,
          cheapLfsCloneHelperEnabled: undefined,
        }}
        onPreferencesChanged={preference => changes.push(preference)}
      />
    )

    const checkbox = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /include the windows and linux clone helper/i,
    })
    assert.equal(checkbox.checked, true)
    fireEvent.click(checkbox)
    assert.equal(changes.at(-1)?.cheapLfsCloneHelperEnabled, false)
    assert.match(
      screen.getByText(/one-command windows\/linux hydration scripts/i)
        .textContent ?? '',
      /\.desktop-material\/cheap-lfs/
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

  it('defaults legacy upload settings to three lanes and synchronizes the legacy switch', () => {
    const changes: IBuildRunPreferences[] = []
    const preferences = {
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: undefined,
      parallelCheapLfsUploads: undefined,
    }
    render(
      <CheapLfsSettings
        repository={repository()}
        preferences={preferences}
        onPreferencesChanged={preference => changes.push(preference)}
      />
    )

    const concurrency = screen.getByRole<HTMLSelectElement>('combobox', {
      name: /simultaneous cheap lfs uploads/i,
    })
    assert.equal(concurrency.value, '3')
    fireEvent.change(concurrency, { target: { value: '1' } })
    assert.equal(changes.at(-1)?.cheapLfsUploadConcurrency, 1)
    assert.equal(changes.at(-1)?.parallelCheapLfsUploads, false)
    assert.equal(changes.at(-1)?.autoPinLargeFilesOnCommit, true)
    assert.equal(changes.at(-1)?.autoMaterializeCheapLfs, true)
    fireEvent.change(concurrency, { target: { value: '2' } })
    assert.equal(changes.at(-1)?.cheapLfsUploadConcurrency, 2)
    assert.equal(changes.at(-1)?.parallelCheapLfsUploads, true)
    assert.equal(getCheapLfsUploadConcurrency(changes.at(-1)!), 2)
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
    assert.match(english, /simultaneous cheap lfs uploads/i)
    assert.match(cantonese, /cheap lfs 同時上載數量/i)
    assert.match(bilingual, /simultaneous cheap lfs uploads/i)
    assert.match(bilingual, /cheap lfs 同時上載數量/i)

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
    assert.match(help, /1, 2, or 3 upload lanes/i)
    assert.match(help, /retries fall back to one lane/i)
    assert.match(help, /downloads keep their existing restore behavior/i)
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

    const password = Buffer.from('not-persisted', 'utf8')
    popup.onSubmit(password, false)

    await waitFor(() =>
      assert.equal(changes.at(-1)?.cheapLfsPayloadEncryption, true)
    )
    assert.equal(changes.at(-1)?.cheapLfsPayloadEncryptionConfirmed, true)
    assert.doesNotMatch(JSON.stringify(changes), /not-persisted/)
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

  it('saves a changed password only through the credential action and zeroes it', async () => {
    let popup: Popup | undefined
    let savedValue = ''
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
            savedValue = Buffer.from(password).toString('utf8')
            return true
          },
          forget: async () => 'missing',
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

    const password = Buffer.from('vault-only', 'utf8')
    popup.onSubmit(password, true)
    await waitFor(() => assert.equal(savedValue, 'vault-only'))
    await waitFor(() =>
      assert.ok(screen.getByText(/password was saved in windows/i))
    )
    assert.ok(password.every(byte => byte === 0))
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
