import assert from 'node:assert'
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
import { fireEvent, render, screen } from '../../helpers/ui/render'
import { translate } from '../../../src/lib/i18n'

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

describe('Build & Run cheap-LFS preferences', () => {
  it('defaults both automation toggles on', () => {
    assert.equal(defaultBuildRunPreferences.autoMaterializeCheapLfs, true)
    assert.equal(defaultBuildRunPreferences.autoPinLargeFilesOnCommit, true)
    assert.equal(defaultBuildRunPreferences.parallelCheapLfsUploads, true)
    assert.equal(defaultBuildRunPreferences.cheapLfsStorageProvider, 'release')
  })

  it('toggles autoMaterializeCheapLfs through the settings checkbox', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <BuildRunSettings
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
      <BuildRunSettings
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
      <BuildRunSettings
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
      <BuildRunSettings
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
      <BuildRunSettings
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
      <BuildRunSettings
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
  })

  it('shows confirmed-public cloud compression as automatic', () => {
    render(
      <BuildRunSettings
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
      <BuildRunSettings
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
      <BuildRunSettings
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
