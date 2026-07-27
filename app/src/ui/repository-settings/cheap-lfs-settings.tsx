import * as React from 'react'
import { DialogContent } from '../dialog'
import { Repository } from '../../models/repository'
import {
  CheapLfsStorageProvider,
  IBuildRunPreferences,
  getCheapLfsStorageProvider,
} from '../../models/build-run-preferences'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToggledtippedContent } from '../lib/toggletipped-content'
import { Select } from '../lib/select'
import { t, translateForAccessibleName } from '../../lib/i18n'
import { getCheapLfsCloudCompressionPolicy } from '../../lib/cheap-lfs/cloud-compression'

interface ICheapLfsSettingsProps {
  readonly repository: Repository

  /** The working copy of the preferences, owned by the host dialog. */
  readonly preferences: IBuildRunPreferences

  /** Called with the next preferences whenever the user edits a field. */
  readonly onPreferencesChanged: (preferences: IBuildRunPreferences) => void
}

/**
 * The Repository Settings "Cheap LFS" tab.
 *
 * Hosts the large-file (Cheap LFS) preferences: the storage-provider selector,
 * the auto-pin / auto-materialize / parallel-upload toggles, and the
 * cloud-compression consent. The controls live in their own tab but still edit
 * the shared {@link IBuildRunPreferences} working copy owned by the host
 * `RepositorySettings` dialog, which persists it on submit exactly as it does
 * for the Build & Run tab.
 */
export class CheapLfsSettings extends React.Component<ICheapLfsSettingsProps> {
  private onAutoMaterializeCheapLfsChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPreferencesChanged({
      ...this.props.preferences,
      autoMaterializeCheapLfs: event.currentTarget.checked,
    })
  }

  private onAutoPinLargeFilesOnCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPreferencesChanged({
      ...this.props.preferences,
      autoPinLargeFilesOnCommit: event.currentTarget.checked,
    })
  }

  private onParallelCheapLfsUploadsChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPreferencesChanged({
      ...this.props.preferences,
      parallelCheapLfsUploads: event.currentTarget.checked,
    })
  }

  private onCheapLfsStorageProviderChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const provider = event.currentTarget.value as CheapLfsStorageProvider
    this.props.onPreferencesChanged({
      ...this.props.preferences,
      cheapLfsStorageProvider: provider,
      // Keep preview builds that only understood the GHCR boolean coherent.
      cheapLfsGhcrStorage: provider === 'ghcr',
    })
  }

  private onCheapLfsCloudCompressionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    if (this.props.repository.gitHubRepository?.isPrivate !== true) {
      return
    }
    this.props.onPreferencesChanged({
      ...this.props.preferences,
      cheapLfsCloudCompression: event.currentTarget.checked,
    })
  }

  public render() {
    const prefs = this.props.preferences
    const cheapLfsStorageProvider = getCheapLfsStorageProvider(prefs)
    const cloudPolicy = getCheapLfsCloudCompressionPolicy(
      this.props.repository,
      prefs
    )

    const autoPinLabel = (
      <span className="build-run-toggle-label">
        {t('cheapLfs.settings.autoPin')}
        <ToggledtippedContent
          className="build-run-toggle-tip"
          ariaLabel={translateForAccessibleName('cheapLfs.settings.autoPin')}
          ariaLiveMessage={t('cheapLfs.settings.autoPinHelp')}
          tooltip={t('cheapLfs.settings.autoPinHelp')}
        >
          <Octicon symbol={octicons.info} />
        </ToggledtippedContent>
      </span>
    )

    const parallelUploadsLabel = (
      <span className="build-run-toggle-label">
        {t('cheapLfs.settings.parallelUploads')}
        <ToggledtippedContent
          className="build-run-toggle-tip"
          ariaLabel={translateForAccessibleName(
            'cheapLfs.settings.parallelUploads'
          )}
          ariaLiveMessage={t('cheapLfs.settings.parallelUploadsHelp')}
          tooltip={t('cheapLfs.settings.parallelUploadsHelp')}
        >
          <Octicon symbol={octicons.info} />
        </ToggledtippedContent>
      </span>
    )

    const cloudCompressionLabel = (
      <span className="build-run-toggle-label">
        {cloudPolicy === 'automatic-public'
          ? t('cheapLfs.cloud.publicAutomatic')
          : t('cheapLfs.cloud.privateToggle')}
        <ToggledtippedContent
          className="build-run-toggle-tip"
          ariaLabel={t('cheapLfs.cloud.title')}
          ariaLiveMessage={
            cloudPolicy === 'visibility-unknown'
              ? t('cheapLfs.cloud.visibilityUnknown')
              : t('cheapLfs.cloud.privateHelp')
          }
          tooltip={
            cloudPolicy === 'visibility-unknown'
              ? t('cheapLfs.cloud.visibilityUnknown')
              : t('cheapLfs.cloud.privateHelp')
          }
        >
          <Octicon symbol={octicons.info} />
        </ToggledtippedContent>
      </span>
    )

    return (
      <DialogContent>
        <div className="build-run-settings cheap-lfs-settings">
          <section className="build-run-section">
            <h3 className="build-run-section-title">
              <Octicon symbol={octicons.database} />
              {t('cheapLfs.settings.sectionHeading')}
            </h3>
            <div className="build-run-toggles">
              <Checkbox
                label={t('cheapLfs.settings.autoMaterialize')}
                value={
                  prefs.autoMaterializeCheapLfs ?? true
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onAutoMaterializeCheapLfsChanged}
              />
              <Checkbox
                label={autoPinLabel}
                value={
                  prefs.autoPinLargeFilesOnCommit ?? true
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onAutoPinLargeFilesOnCommitChanged}
              />
              <Checkbox
                label={parallelUploadsLabel}
                value={
                  prefs.parallelCheapLfsUploads !== false
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onParallelCheapLfsUploadsChanged}
              />
              <Select
                className="cheap-lfs-storage-provider-select"
                label={t('cheapLfs.settings.storageProvider')}
                value={cheapLfsStorageProvider}
                onChange={this.onCheapLfsStorageProviderChanged}
              >
                <option value="release">
                  {t('cheapLfs.settings.storageRelease')}
                </option>
                <option value="ghcr">
                  {t('cheapLfs.settings.storageGhcr')}
                </option>
                <option value="docker-hub">
                  {t('cheapLfs.settings.storageDockerHub')}
                </option>
              </Select>
              {cloudPolicy !== 'not-github' &&
                cheapLfsStorageProvider === 'release' && (
                  <Checkbox
                    label={cloudCompressionLabel}
                    disabled={
                      cloudPolicy === 'automatic-public' ||
                      cloudPolicy === 'visibility-unknown'
                    }
                    value={
                      cloudPolicy === 'automatic-public' ||
                      cloudPolicy === 'enabled-private'
                        ? CheckboxValue.On
                        : CheckboxValue.Off
                    }
                    onChange={this.onCheapLfsCloudCompressionChanged}
                  />
                )}
            </div>
            <p className="build-run-section-description">
              Pinning large files uploads any committed file over ~100&nbsp;MB
              to the selected Cheap LFS storage and commits a small pointer in
              its place, so the push stays under GitHub's file size limit.
              Parallel uploads use up to three transfer lanes; failed files stay
              in Changes while safe files can still commit. GHCR and Docker Hub
              modes keep the repository object set in one digest-pinned OCI
              image; private repositories encrypt its objects with the shared
              tracked repository key. Downloading large files restores pointers
              after cloning or pulling.
            </p>
          </section>
        </div>
      </DialogContent>
    )
  }
}
