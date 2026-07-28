import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { t } from '../../lib/i18n'
import { getPersistedLanguageMode } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'

interface ICheapLfsEncryptionGateProps {
  readonly repositoryName: string

  /**
   * Confirmed with the passphrase and whether to remember it. Only ever called
   * after the irreversibility acknowledgement has been ticked and the two
   * passphrase fields match.
   */
  readonly onConfirmed: (passphrase: string, remember: boolean) => void

  readonly onDismissed: () => void
}

interface ICheapLfsEncryptionGateState {
  readonly passphrase: string
  readonly confirmation: string
  readonly remember: boolean
  readonly acknowledged: boolean
  readonly error: string | null
}

/**
 * The modal that has to be got through before a repository encrypts anything.
 *
 * This exists because the failure it guards against is the one that cannot be
 * undone. Every other Cheap LFS mistake costs an upload; this one costs the
 * file. So the warning is a blocking modal with its own explicit checkbox
 * rather than a line of help text next to a toggle, the passphrase is typed
 * twice so a typo is caught before it is the only copy, and the sentence about
 * irreversibility is a fixed string that no funny level rewrites.
 *
 * Only the surrounding framing carries the per-language playfulness bands. A
 * user at maximum playfulness still reads the same unambiguous "there is no
 * reset, no backup key, no recovery code" sentence as a user at level 1.
 */
export class CheapLfsEncryptionGate extends React.Component<
  ICheapLfsEncryptionGateProps,
  ICheapLfsEncryptionGateState
> {
  public constructor(props: ICheapLfsEncryptionGateProps) {
    super(props)
    this.state = {
      passphrase: '',
      confirmation: '',
      remember: false,
      acknowledged: false,
      error: null,
    }
  }

  private onPassphraseChanged = (passphrase: string) => {
    this.setState({ passphrase, error: null })
  }

  private onConfirmationChanged = (confirmation: string) => {
    this.setState({ confirmation, error: null })
  }

  private onRememberChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ remember: event.currentTarget.checked })
  }

  private onAcknowledgedChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ acknowledged: event.currentTarget.checked })
  }

  private onSubmit = () => {
    const { passphrase, confirmation, remember, acknowledged } = this.state
    if (!acknowledged) {
      return
    }
    if (passphrase.length === 0) {
      this.setState({ error: t('cheapLfs.encryptionGate.empty') })
      return
    }
    // Compared before anything is enabled, so a mistyped passphrase never
    // becomes the only key to a file that no longer exists in the clear.
    if (passphrase !== confirmation) {
      this.setState({ error: t('cheapLfs.encryptionGate.mismatch') })
      return
    }
    this.props.onConfirmed(passphrase, remember)
  }

  public render() {
    const { acknowledged, error } = this.state
    const intro = translateWithFunnyLevel(
      'cheapLfs.encryptionGate.intro',
      getPersistedLanguageMode(),
      readFunnyLevels()
    )

    return (
      <Dialog
        id="cheap-lfs-encryption-gate"
        modal={true}
        title={t('cheapLfs.encryptionGate.title', {
          repository: this.props.repositoryName,
        })}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="cheap-lfs-encryption-intro">{intro}</p>
          <p className="cheap-lfs-encryption-irreversible" role="alert">
            <Octicon symbol={octicons.alert} />
            {t('cheapLfs.encryptionGate.irreversible')}
          </p>
          <p className="cheap-lfs-encryption-disclosure">
            {t('cheapLfs.encryptionGate.pointerDisclosure')}
          </p>
          <TextBox
            type="password"
            label={t('cheapLfs.encryptionGate.passphrase')}
            value={this.state.passphrase}
            onValueChanged={this.onPassphraseChanged}
          />
          <TextBox
            type="password"
            label={t('cheapLfs.encryptionGate.confirmPassphrase')}
            value={this.state.confirmation}
            onValueChanged={this.onConfirmationChanged}
          />
          <Checkbox
            label={t('cheapLfs.encryptionGate.remember')}
            value={this.state.remember ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onRememberChanged}
          />
          <p className="cheap-lfs-encryption-remember-warning">
            {t('cheapLfs.encryptionGate.rememberWarning')}
          </p>
          <Checkbox
            label={t('cheapLfs.encryptionGate.acknowledge')}
            value={acknowledged ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onAcknowledgedChanged}
          />
          {error === null ? null : (
            <p className="cheap-lfs-encryption-error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('cheapLfs.encryptionGate.confirm')}
            okButtonDisabled={!acknowledged}
            destructive={true}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
