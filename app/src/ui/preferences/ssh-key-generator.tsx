import * as React from 'react'
import { Button } from '../lib/button'
import { CopyButton } from '../copy-button'
import {
  generateSSHKey,
  getGeneratedSSHPrivateKey,
} from '../../lib/ssh/generate-ssh-key'

interface ISSHKeyGeneratorProps {
  /** Embedded in the generated public key as an identifying comment. */
  readonly email: string
}

interface ISSHKeyGeneratorState {
  readonly isGenerating: boolean
  readonly publicKey: string | null
  readonly hasStoredKey: boolean
  readonly errorMessage: string | null
}

/**
 * Lets the user generate a local Ed25519 SSH key pair with a single click.
 * The private key never leaves this process: it is written straight to the
 * OS-backed credential vault (the same store Desktop already uses for SSH
 * passphrases) and is never logged or rendered. Only the public key, which is
 * safe to share, is ever shown or copyable.
 */
export class SSHKeyGenerator extends React.Component<
  ISSHKeyGeneratorProps,
  ISSHKeyGeneratorState
> {
  public constructor(props: ISSHKeyGeneratorProps) {
    super(props)
    this.state = {
      isGenerating: false,
      publicKey: null,
      hasStoredKey: false,
      errorMessage: null,
    }
  }

  public componentDidMount() {
    this.checkForStoredKey()
  }

  private async checkForStoredKey() {
    try {
      const privateKey = await getGeneratedSSHPrivateKey()
      if (privateKey !== null) {
        this.setState({ hasStoredKey: true })
      }
    } catch {
      // Best-effort only: if the vault can't be reached the button below
      // still works, it just won't know a key already exists.
    }
  }

  private onGenerate = async () => {
    this.setState({ isGenerating: true, errorMessage: null })

    try {
      const { publicKey } = await generateSSHKey(this.props.email)
      this.setState({
        isGenerating: false,
        publicKey,
        hasStoredKey: true,
      })
    } catch (e) {
      log.error('Failed generating SSH key', e)
      this.setState({
        isGenerating: false,
        errorMessage: 'Could not generate an SSH key. See the log for details.',
      })
    }
  }

  public render() {
    const { isGenerating, publicKey, hasStoredKey, errorMessage } = this.state

    return (
      <div className="ssh-key-generator">
        <h2 id="ssh-key-generator-heading">SSH key</h2>
        <p id="ssh-key-generator-description" className="settings-description">
          Generate a new Ed25519 SSH key pair for authenticating with Git
          remotes. The private key is stored securely in{' '}
          {__DARWIN__
            ? 'the macOS Keychain'
            : __WIN32__
            ? 'Windows Credential Manager'
            : 'your system credential store'}{' '}
          and is never shown. Copy the public key below and add it to your Git
          host's SSH keys settings.
        </p>

        <Button
          onClick={this.onGenerate}
          disabled={isGenerating}
          ariaDescribedBy="ssh-key-generator-description"
        >
          {isGenerating
            ? 'Generating…'
            : hasStoredKey
            ? 'Generate new SSH key'
            : 'Generate SSH key'}
        </Button>

        {hasStoredKey && !isGenerating && publicKey === null && (
          <p className="settings-description">
            A generated key is already stored. Generate a new one to replace it
            and see its public key here.
          </p>
        )}

        {errorMessage !== null && (
          <p className="settings-description ssh-key-generator-error">
            {errorMessage}
          </p>
        )}

        {publicKey !== null && (
          <div className="ssh-key-generator-public-key">
            <label htmlFor="ssh-key-generator-public-key-value">
              Public key
            </label>
            <div className="ssh-key-generator-public-key-row">
              <input
                id="ssh-key-generator-public-key-value"
                type="text"
                readOnly={true}
                value={publicKey}
                onFocus={this.onPublicKeyFocus}
              />
              <CopyButton copyContent={publicKey} ariaLabel="Copy public key" />
            </div>
          </div>
        )}
      </div>
    )
  }

  private onPublicKeyFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select()
  }
}
