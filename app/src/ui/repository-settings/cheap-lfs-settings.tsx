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
import { Button } from '../lib/button'
import { t, translateForAccessibleName } from '../../lib/i18n'
import { getCheapLfsCloudCompressionPolicy } from '../../lib/cheap-lfs/cloud-compression'
import { Popup, PopupType } from '../../models/popup'
import {
  CheapLfsSavedPasswordForget,
  forgetSavedCheapLfsPayloadPassword,
  hasSavedCheapLfsPayloadPassword,
  saveCheapLfsPayloadPassword,
} from '../../lib/cheap-lfs/payload-encryption-credentials'

type CheapLfsCredentialStatus = 'checking' | 'saved' | 'missing' | 'unavailable'

type CheapLfsCredentialFeedback =
  | 'saved'
  | 'not-saved'
  | 'save-unavailable'
  | 'forgot'
  | 'forget-missing'
  | 'forget-unavailable'

interface ICheapLfsSettingsDispatcher {
  showPopup(popup: Popup): Promise<void>
  postError(error: Error): Promise<void>
}

interface ICheapLfsCredentialActions {
  getStatus(
    repository: Repository
  ): Promise<'saved' | 'missing' | 'unavailable'>
  save(repository: Repository, password: Uint8Array): Promise<boolean>
  forget(repository: Repository): Promise<CheapLfsSavedPasswordForget>
}

const defaultCredentialActions: ICheapLfsCredentialActions = {
  getStatus: hasSavedCheapLfsPayloadPassword,
  save: saveCheapLfsPayloadPassword,
  forget: forgetSavedCheapLfsPayloadPassword,
}

interface ICheapLfsSettingsProps {
  readonly repository: Repository
  readonly dispatcher?: ICheapLfsSettingsDispatcher
  readonly credentialActions?: ICheapLfsCredentialActions

  /** The working copy of the preferences, owned by the host dialog. */
  readonly preferences: IBuildRunPreferences

  /** Called with the next preferences whenever the user edits a field. */
  readonly onPreferencesChanged: (preferences: IBuildRunPreferences) => void
}

interface ICheapLfsSettingsState {
  readonly credentialStatus: CheapLfsCredentialStatus
  readonly credentialFeedback: CheapLfsCredentialFeedback | null
  readonly credentialBusy: boolean
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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
export class CheapLfsSettings extends React.Component<
  ICheapLfsSettingsProps,
  ICheapLfsSettingsState
> {
  private alive = false
  private credentialStatusRequest = 0

  public constructor(props: ICheapLfsSettingsProps) {
    super(props)
    this.state = {
      credentialStatus: 'checking',
      credentialFeedback: null,
      credentialBusy: false,
    }
  }

  public componentDidMount() {
    this.alive = true
    void this.refreshCredentialStatus()
  }

  public componentDidUpdate(prevProps: ICheapLfsSettingsProps) {
    if (
      prevProps.repository.path !== this.props.repository.path ||
      prevProps.repository.gitHubRepository?.fullName !==
        this.props.repository.gitHubRepository?.fullName
    ) {
      void this.refreshCredentialStatus()
    }
  }

  public componentWillUnmount() {
    this.alive = false
    this.credentialStatusRequest++
  }

  private get credentialActions(): ICheapLfsCredentialActions {
    return this.props.credentialActions ?? defaultCredentialActions
  }

  private async refreshCredentialStatus(): Promise<void> {
    const request = ++this.credentialStatusRequest
    if (this.alive) {
      this.setState({ credentialStatus: 'checking' })
    }
    const credentialStatus = await this.credentialActions.getStatus(
      this.props.repository
    )
    if (this.alive && request === this.credentialStatusRequest) {
      this.setState({ credentialStatus })
    }
  }

  private postError(error: unknown): void {
    const dispatcher = this.props.dispatcher
    if (dispatcher !== undefined) {
      void dispatcher.postError(asError(error))
    }
  }

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
      // Payload encryption is deliberately Release-provider only.
      cheapLfsPayloadEncryption:
        provider === 'release'
          ? this.props.preferences.cheapLfsPayloadEncryption
          : false,
      cheapLfsPayloadEncryptionConfirmed:
        provider === 'release'
          ? this.props.preferences.cheapLfsPayloadEncryptionConfirmed
          : false,
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

  private promptForPassword(
    purpose: 'encrypt' | 'change',
    requireIrreversibleAcknowledgement: boolean,
    enableEncryption: boolean
  ): void {
    const dispatcher = this.props.dispatcher
    if (dispatcher === undefined) {
      return
    }

    this.setState({ credentialBusy: true, credentialFeedback: null })
    let settled = false
    const settle = (
      password: Buffer | undefined,
      rememberPassword: boolean
    ) => {
      if (settled) {
        password?.fill(0)
        return
      }
      settled = true
      if (password === undefined) {
        if (this.alive) {
          this.setState({ credentialBusy: false })
        }
        return
      }

      void this.acceptPassword(password, rememberPassword, enableEncryption)
        .catch(error => this.postError(error))
        .finally(() => {
          password.fill(0)
          if (this.alive) {
            this.setState({ credentialBusy: false })
          }
        })
    }

    void dispatcher
      .showPopup({
        type: PopupType.CheapLfsPayloadPassword,
        repository: this.props.repository,
        purpose,
        requireIrreversibleAcknowledgement,
        onSubmit: settle,
        onRemoved: () => settle(undefined, false),
      })
      .catch(error => {
        settle(undefined, false)
        this.postError(error)
      })
  }

  private async acceptPassword(
    password: Buffer,
    rememberPassword: boolean,
    enableEncryption: boolean
  ): Promise<void> {
    let credentialFeedback: CheapLfsCredentialFeedback = 'not-saved'
    let credentialStatus = this.state.credentialStatus

    if (rememberPassword) {
      const saved = await this.credentialActions.save(
        this.props.repository,
        password
      )
      credentialFeedback = saved ? 'saved' : 'save-unavailable'
      credentialStatus = saved ? 'saved' : 'unavailable'
      if (!saved) {
        this.postError(new Error(t('cheapLfs.encryption.saveUnavailable')))
      }
    }

    if (!this.alive) {
      return
    }

    if (enableEncryption) {
      this.props.onPreferencesChanged({
        ...this.props.preferences,
        cheapLfsPayloadEncryption: true,
        cheapLfsPayloadEncryptionConfirmed: true,
      })
    }
    this.setState({ credentialFeedback, credentialStatus })
  }

  private onCheapLfsPayloadEncryptionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    if (!event.currentTarget.checked) {
      this.props.onPreferencesChanged({
        ...this.props.preferences,
        cheapLfsPayloadEncryption: false,
        cheapLfsPayloadEncryptionConfirmed: false,
      })
      return
    }

    this.promptForPassword(
      'encrypt',
      this.props.preferences.cheapLfsPayloadEncryptionConfirmed !== true,
      true
    )
  }

  private onSetOrChangePassword = () => {
    this.promptForPassword('change', false, false)
  }

  private onForgetPassword = () => {
    const dispatcher = this.props.dispatcher
    if (dispatcher === undefined) {
      return
    }

    this.setState({ credentialBusy: true, credentialFeedback: null })
    let settled = false
    const settle = (confirmation: Buffer | undefined) => {
      if (settled) {
        confirmation?.fill(0)
        return
      }
      settled = true
      if (confirmation === undefined) {
        if (this.alive) {
          this.setState({ credentialBusy: false })
        }
        return
      }

      void this.forgetPassword()
        .catch(error => this.postError(error))
        .finally(() => {
          confirmation.fill(0)
          if (this.alive) {
            this.setState({ credentialBusy: false })
          }
        })
    }

    void dispatcher
      .showPopup({
        type: PopupType.CheapLfsPayloadPassword,
        repository: this.props.repository,
        purpose: 'forget',
        onSubmit: settle,
        onRemoved: () => settle(undefined),
      })
      .catch(error => {
        settle(undefined)
        this.postError(error)
      })
  }

  private async forgetPassword(): Promise<void> {
    const result = await this.credentialActions.forget(this.props.repository)
    if (result === 'unavailable') {
      this.postError(new Error(t('cheapLfs.encryption.forgetUnavailable')))
    }
    if (!this.alive) {
      return
    }
    this.setState({
      credentialStatus: result === 'unavailable' ? 'unavailable' : 'missing',
      credentialFeedback:
        result === 'deleted'
          ? 'forgot'
          : result === 'missing'
          ? 'forget-missing'
          : 'forget-unavailable',
    })
  }

  private credentialStatusText(): string {
    switch (this.state.credentialStatus) {
      case 'checking':
        return t('cheapLfs.encryption.statusChecking')
      case 'saved':
        return t('cheapLfs.encryption.statusSaved')
      case 'missing':
        return t('cheapLfs.encryption.statusMissing')
      case 'unavailable':
        return t('cheapLfs.encryption.statusUnavailable')
    }
  }

  private credentialFeedbackText(): string | null {
    switch (this.state.credentialFeedback) {
      case 'saved':
        return t('cheapLfs.encryption.saved')
      case 'not-saved':
        return t('cheapLfs.encryption.notSaved')
      case 'save-unavailable':
        return t('cheapLfs.encryption.saveUnavailable')
      case 'forgot':
        return t('cheapLfs.encryption.forgot')
      case 'forget-missing':
        return t('cheapLfs.encryption.forgetMissing')
      case 'forget-unavailable':
        return t('cheapLfs.encryption.forgetUnavailable')
      case null:
        return null
    }
  }

  private renderPayloadEncryption() {
    const enabled = this.props.preferences.cheapLfsPayloadEncryption === true
    const credentialFeedback = this.credentialFeedbackText()
    const actionsDisabled =
      this.state.credentialBusy || this.props.dispatcher === undefined

    return (
      <div className="cheap-lfs-payload-encryption">
        <h4>{t('cheapLfs.encryption.title')}</h4>
        <Checkbox
          label={t('cheapLfs.encryption.toggle')}
          disabled={this.state.credentialBusy || (!enabled && actionsDisabled)}
          value={enabled ? CheckboxValue.On : CheckboxValue.Off}
          ariaDescribedBy="cheap-lfs-payload-encryption-help"
          onChange={this.onCheapLfsPayloadEncryptionChanged}
        />
        <p id="cheap-lfs-payload-encryption-help">
          {t('cheapLfs.encryption.help')}
        </p>
        <p className="cheap-lfs-payload-encryption-metadata">
          {t('cheapLfs.encryption.metadataNotice')}
        </p>
        <p
          className="cheap-lfs-payload-encryption-status"
          role="status"
          aria-live="polite"
        >
          {this.credentialStatusText()}
        </p>
        <div className="cheap-lfs-payload-encryption-actions">
          <Button
            type="button"
            disabled={actionsDisabled}
            onClick={this.onSetOrChangePassword}
          >
            {this.state.credentialStatus === 'saved'
              ? t('cheapLfs.encryption.changePassword')
              : t('cheapLfs.encryption.setPassword')}
          </Button>
          {this.state.credentialStatus === 'saved' && (
            <Button
              type="button"
              className="destructive"
              disabled={actionsDisabled}
              onClick={this.onForgetPassword}
            >
              {t('cheapLfs.encryption.forgetPassword')}
            </Button>
          )}
        </div>
        {credentialFeedback !== null && (
          <p
            className="cheap-lfs-payload-encryption-feedback"
            role="status"
            aria-live="polite"
          >
            {credentialFeedback}
          </p>
        )}
      </div>
    )
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
            {cheapLfsStorageProvider === 'release' &&
              this.renderPayloadEncryption()}
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
