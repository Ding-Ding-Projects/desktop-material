import * as React from 'react'

import {
  CheapLfsPayloadPasswordContext,
  CheapLfsPayloadPasswordPurpose,
} from '../../models/popup'
import {
  getPersistedLanguageMode,
  t,
  translateForAccessibleName,
} from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { PasswordTextBox } from '../lib/password-text-box'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'

interface ICheapLfsPayloadPasswordProps {
  readonly purpose: CheapLfsPayloadPasswordPurpose
  readonly context?: CheapLfsPayloadPasswordContext
  readonly requireIrreversibleAcknowledgement?: boolean
  readonly onSubmit: (
    password: Buffer | undefined,
    rememberPassword: boolean
  ) => void
  readonly onDismissed: () => void
}

interface ICheapLfsPayloadPasswordState {
  readonly password: string
  readonly confirmation: string
  readonly rememberPassword: boolean
  readonly acknowledged: boolean
}

const descriptionId = 'cheap-lfs-payload-password-description'
const passwordErrorId = 'cheap-lfs-payload-password-error'
const rememberDescriptionId = 'cheap-lfs-payload-password-remember-description'

/**
 * Collects a Cheap LFS payload password without putting it in settings,
 * localStorage, logs, or component props. The submit callback owns the returned
 * buffer and is responsible for overwriting it after use.
 */
export class CheapLfsPayloadPassword extends React.Component<
  ICheapLfsPayloadPasswordProps,
  ICheapLfsPayloadPasswordState
> {
  private settled = false

  public constructor(props: ICheapLfsPayloadPasswordProps) {
    super(props)
    this.state = {
      password: '',
      confirmation: '',
      rememberPassword: false,
      acknowledged: false,
    }
  }

  private get isForget(): boolean {
    return (
      this.props.purpose === 'forget' || this.props.purpose === 'forget-stale'
    )
  }

  private get requiresConfirmation(): boolean {
    return this.props.purpose === 'encrypt' || this.props.purpose === 'change'
  }

  private get requiresAcknowledgement(): boolean {
    return (
      this.isForget || this.props.requireIrreversibleAcknowledgement === true
    )
  }

  private get title(): string {
    if (
      this.props.context === 'commit-auto-pin' &&
      this.props.purpose === 'encrypt'
    ) {
      return t('cheapLfs.encryption.dialog.commitTitle')
    }
    switch (this.props.purpose) {
      case 'encrypt':
        return t('cheapLfs.encryption.dialog.encryptTitle')
      case 'decrypt':
        return t('cheapLfs.encryption.dialog.decryptTitle')
      case 'change':
        return t('cheapLfs.encryption.dialog.changeTitle')
      case 'forget':
        return t('cheapLfs.encryption.dialog.forgetTitle')
      case 'forget-stale':
        return t('cheapLfs.encryption.dialog.staleForgetTitle')
    }
  }

  private get description(): string {
    if (
      this.props.context === 'commit-auto-pin' &&
      this.props.purpose === 'encrypt'
    ) {
      return translateWithFunnyLevel(
        'cheapLfs.encryption.dialog.commitDescription',
        getPersistedLanguageMode(),
        readFunnyLevels()
      )
    }
    switch (this.props.purpose) {
      case 'encrypt':
        return t('cheapLfs.encryption.dialog.encryptDescription')
      case 'decrypt':
        return t('cheapLfs.encryption.dialog.decryptDescription')
      case 'change':
        return t('cheapLfs.encryption.dialog.changeDescription')
      case 'forget':
        return t('cheapLfs.encryption.dialog.forgetDescription')
      case 'forget-stale':
        return t('cheapLfs.encryption.dialog.staleForgetDescription')
    }
  }

  private get acknowledgementLabel(): string {
    if (this.props.purpose === 'forget-stale') {
      return t('cheapLfs.encryption.dialog.staleForgetAck')
    }
    if (this.isForget) {
      return t('cheapLfs.encryption.dialog.forgetAck')
    }
    return t('cheapLfs.encryption.dialog.irreversibleAck')
  }

  private get passwordsMatch(): boolean {
    return (
      !this.requiresConfirmation ||
      this.state.password === this.state.confirmation
    )
  }

  private get canSubmit(): boolean {
    if (this.isForget) {
      return this.state.acknowledged
    }
    return (
      this.state.password.length > 0 &&
      this.passwordsMatch &&
      (!this.requiresAcknowledgement || this.state.acknowledged)
    )
  }

  private onPasswordChanged = (password: string) => {
    this.setState({ password })
  }

  private onConfirmationChanged = (confirmation: string) => {
    this.setState({ confirmation })
  }

  private onRememberPasswordChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ rememberPassword: event.currentTarget.checked })
  }

  private onAcknowledgementChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ acknowledged: event.currentTarget.checked })
  }

  private finish(
    password: Buffer | undefined,
    rememberPassword: boolean
  ): void {
    if (this.settled) {
      password?.fill(0)
      return
    }
    this.settled = true
    this.setState({ password: '', confirmation: '' })
    try {
      this.props.onSubmit(password, rememberPassword)
    } catch (error) {
      password?.fill(0)
      throw error
    } finally {
      this.props.onDismissed()
    }
  }

  private onSubmit = () => {
    if (!this.canSubmit) {
      return
    }
    const password = this.isForget
      ? Buffer.alloc(0)
      : Buffer.from(this.state.password, 'utf8')
    this.finish(password, this.isForget ? false : this.state.rememberPassword)
  }

  private onCancel = () => {
    this.finish(undefined, false)
  }

  private onCancelButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    this.onCancel()
  }

  public render() {
    const mismatch =
      this.requiresConfirmation &&
      this.state.confirmation.length > 0 &&
      !this.passwordsMatch
    const warning =
      this.props.requireIrreversibleAcknowledgement === true && !this.isForget
        ? t('cheapLfs.encryption.dialog.irreversibleWarning')
        : null

    return (
      <Dialog
        id="cheap-lfs-payload-password"
        className="cheap-lfs-payload-password-dialog"
        type={this.requiresAcknowledgement ? 'warning' : 'normal'}
        title={this.title}
        role="alertdialog"
        ariaDescribedBy={descriptionId}
        backdropDismissable={false}
        onSubmit={this.onSubmit}
        onDismissed={this.onCancel}
      >
        <DialogContent>
          <div id={descriptionId} className="cheap-lfs-payload-password-copy">
            <p>{this.description}</p>
            {warning !== null && (
              <p className="cheap-lfs-payload-password-warning">{warning}</p>
            )}
          </div>

          {!this.isForget && (
            <div className="cheap-lfs-payload-password-fields">
              <PasswordTextBox
                autoFocus={true}
                label={t('cheapLfs.encryption.dialog.password')}
                value={this.state.password}
                required={true}
                ariaDescribedBy={mismatch ? passwordErrorId : undefined}
                ariaInvalid={mismatch}
                onValueChanged={this.onPasswordChanged}
              />
              {this.requiresConfirmation && (
                <PasswordTextBox
                  label={t('cheapLfs.encryption.dialog.confirmPassword')}
                  value={this.state.confirmation}
                  required={true}
                  ariaDescribedBy={mismatch ? passwordErrorId : undefined}
                  ariaInvalid={mismatch}
                  onValueChanged={this.onConfirmationChanged}
                />
              )}
              {mismatch && (
                <p
                  id={passwordErrorId}
                  className="cheap-lfs-payload-password-error"
                  role="alert"
                >
                  {t('cheapLfs.encryption.dialog.passwordMismatch')}
                </p>
              )}
              <Checkbox
                label={t('cheapLfs.encryption.dialog.remember')}
                value={
                  this.state.rememberPassword
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                ariaDescribedBy={rememberDescriptionId}
                onChange={this.onRememberPasswordChanged}
              />
              <p
                id={rememberDescriptionId}
                className="cheap-lfs-payload-password-caption"
              >
                {t('cheapLfs.encryption.dialog.rememberHelp')}
              </p>
            </div>
          )}

          {this.requiresAcknowledgement && (
            <Checkbox
              className="cheap-lfs-payload-password-acknowledgement"
              label={this.acknowledgementLabel}
              value={
                this.state.acknowledged ? CheckboxValue.On : CheckboxValue.Off
              }
              onChange={this.onAcknowledgementChanged}
            />
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={this.isForget}
            okButtonText={
              this.isForget
                ? t('cheapLfs.encryption.dialog.forget')
                : t('cheapLfs.encryption.dialog.continue')
            }
            okButtonAriaLabel={translateForAccessibleName(
              this.isForget
                ? 'cheapLfs.encryption.dialog.forget'
                : 'cheapLfs.encryption.dialog.continue'
            )}
            okButtonDisabled={!this.canSubmit}
            cancelButtonText={t('cheapLfs.encryption.dialog.cancel')}
            cancelButtonAriaLabel={translateForAccessibleName(
              'cheapLfs.encryption.dialog.cancel'
            )}
            onCancelButtonClick={this.onCancelButtonClick}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
