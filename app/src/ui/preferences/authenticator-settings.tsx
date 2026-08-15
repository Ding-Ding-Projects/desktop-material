import * as React from 'react'
import { join } from 'path'
import { writeFile } from 'fs/promises'

import {
  IAuthenticatorDocument,
  IAuthenticatorEntry,
} from '../../lib/authenticator/entries'
import { decodeBase32 } from '../../lib/authenticator/base32'
import { readAuthenticatorSecret } from '../../lib/authenticator/secret-vault'
import {
  AuthenticatorDirectoryName,
  AuthenticatorStore,
} from '../../lib/stores/authenticator-store'
import { teleportAnchor } from '../../lib/teleport-targets'
import { translate, TranslationKey } from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import { getPath, showSaveDialog } from '../main-process-proxy'
import {
  IMd3AuthenticatorExportRequest,
  IMd3AuthenticatorFactor,
  Md3AuthenticatorView,
} from '../md3/md3-authenticator-view'
import { IMd3RegistrationResult } from '../md3/md3-authenticator-registration'

/**
 * Settings → Advanced → the app's own authenticator.
 *
 * Every user-facing app in this project ships an authenticator: not only for
 * its own OTP factors but as a place a user keeps arbitrary TOTP secrets and
 * reads live codes. It has to be an ordinary destination reachable by name, so
 * it is a settings row with the list behind it — a heading, the button that
 * opens the list, the explanation behind progressive disclosure, and a
 * provenance line naming what is actually registered on this computer rather
 * than the word "default".
 *
 * The store is created when the list is first opened rather than at start-up.
 * It writes a Git-backed repository under the app's own data folder and reads
 * the credential vault, and doing either on every launch for a surface most
 * users never open would be work nobody asked for.
 */

/** Hex digits for the factor id, which is also its vault account key. */
const HexAlphabet = '0123456789abcdef'

/** A 96-bit identifier from the platform CSPRNG. */
function createFactorId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const byte of bytes) {
    id += HexAlphabet[(byte >> 4) & 0xf] + HexAlphabet[byte & 0xf]
  }
  return id
}

interface IAuthenticatorPreferencesState {
  readonly open: boolean
  /** `null` until the store has been created and read once. */
  readonly document: IAuthenticatorDocument | null
  readonly secrets: ReadonlyMap<string, Uint8Array>
  /** The exact failure, when the store or its folder could not be opened. */
  readonly error: string | null
}

export interface IAuthenticatorPreferencesProps {
  readonly languageMode: LanguageMode

  /**
   * Injected by tests so no test ever creates a repository or touches the
   * machine's real credential vault.
   */
  readonly createStore?: () => Promise<AuthenticatorStore>

  /** Injected by tests. Defaults to the credential vault. */
  readonly readSecret?: (id: string) => Promise<string | null>

  /** Injected by tests so no export ever touches the file system. */
  readonly onExportFile?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>
}

export class AuthenticatorPreferences extends React.Component<
  IAuthenticatorPreferencesProps,
  IAuthenticatorPreferencesState
> {
  private mounted = false
  private store: AuthenticatorStore | null = null

  public constructor(props: IAuthenticatorPreferencesProps) {
    super(props)
    this.state = {
      open: false,
      document: null,
      secrets: new Map(),
      error: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private t = (key: TranslationKey, variables?: Record<string, string>) =>
    translate(key, this.props.languageMode, variables)

  private funnyLevels(): IFunnyLevels {
    return readFunnyLevels()
  }

  private defaultCreateStore = async (): Promise<AuthenticatorStore> => {
    const userData = await getPath('userData')
    const store = new AuthenticatorStore({
      root: join(userData, AuthenticatorDirectoryName),
    })
    await store.initialize()
    return store
  }

  private onOpen = () => {
    this.setState({ open: true })
    void this.load()
  }

  private onDismissed = () => this.setState({ open: false })

  /**
   * Open the store, read the list, then read each secret out of the vault.
   *
   * A factor whose secret the vault no longer holds is left out of the map
   * rather than given an empty one: the view renders a missing secret as a row
   * that cannot produce a code and says why, which is exactly what a restored
   * entry with a forgotten vault key is.
   */
  private async load() {
    try {
      if (this.store === null) {
        const create = this.props.createStore ?? this.defaultCreateStore
        this.store = await create()
        this.store.onDidUpdate(document => {
          if (this.mounted) {
            this.setState({ document })
            void this.loadSecrets(document.entries)
          }
        })
      }
      const document = await this.store.get()
      if (!this.mounted) {
        return
      }
      this.setState({ document, error: null })
      await this.loadSecrets(document.entries)
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: `${error}` })
      }
    }
  }

  private async loadSecrets(entries: ReadonlyArray<IAuthenticatorEntry>) {
    const read = this.props.readSecret ?? (id => readAuthenticatorSecret(id))
    const secrets = new Map<string, Uint8Array>()
    for (const entry of entries) {
      try {
        const stored = await read(entry.id)
        if (stored !== null && stored.length > 0) {
          secrets.set(entry.id, decodeBase32(stored))
        }
      } catch {
        // A secret the vault refuses is a factor that cannot produce a code.
        // Leaving it out of the map is how the view is told that.
      }
    }
    if (this.mounted) {
      this.setState({ secrets })
    }
  }

  private onRegister = (result: IMd3RegistrationResult) => {
    const store = this.store
    if (store === null || result.secret === undefined) {
      return
    }
    const entry: IAuthenticatorEntry = {
      // The id is also the credential-vault account key for this factor's
      // secret, so a collision would hand two factors one secret. It is drawn
      // from the platform CSPRNG rather than from a timestamp.
      id: createFactorId(),
      issuer: result.issuer,
      account: result.account,
      group: result.group,
      algorithm: result.algorithm,
      digits: result.digits,
      period: result.period,
      addedAt: new Date().toISOString(),
    }
    void store.register(entry, result.secret).then(() => this.load())
  }

  private onEdit = (id: string, result: IMd3RegistrationResult) => {
    const store = this.store
    if (store === null) {
      return
    }
    void store
      .edit(id, {
        issuer: result.issuer,
        account: result.account,
        group: result.group,
        algorithm: result.algorithm,
        digits: result.digits,
        period: result.period,
      })
      .then(() => this.load())
  }

  private onDelete = async (ids: ReadonlyArray<string>) => {
    const store = this.store
    if (store === null) {
      return []
    }
    const refused = await store.delete(ids)
    await this.load()
    return refused
  }

  private onReorder = (id: string, toIndex: number) => {
    void this.store?.reorder(id, toIndex).then(() => this.load())
  }

  private onAssignGroup = (ids: ReadonlyArray<string>, group: string) => {
    void this.store?.group(ids, group).then(() => this.load())
  }

  private onExport = (request: IMd3AuthenticatorExportRequest) => {
    const write = this.props.onExportFile ?? this.writeExport
    void write(request.payload.content, request.payload.filename)
  }

  /**
   * The secrets export, which is a different act from the ordinary one.
   *
   * An ordinary export deliberately omits the secrets and says so. This one
   * writes usable secrets in the clear, so it is a separate, explicitly named
   * action that the view has already put behind the two-key destructive gate
   * before it ever reaches here. All that is left is to write the file — and
   * to name it as what it is in the save dialog, because the last chance to
   * notice what you are about to put on disk is the moment you choose where.
   *
   * It shares the writer rather than the title: two writers would be two
   * chances to disagree about encoding, and the title is the only part that
   * genuinely differs.
   */
  private onExportSecrets = (request: IMd3AuthenticatorExportRequest) => {
    const write = this.props.onExportFile ?? this.writeSecretsExport
    void write(request.payload.content, request.payload.filename)
  }

  private writeSecretsExport = (contents: string, fileName: string) =>
    this.write(contents, fileName, 'Export authenticator secrets in the clear')

  private writeExport = (contents: string, fileName: string) =>
    this.write(contents, fileName, 'Export authenticator factors')

  private write = async (contents: string, fileName: string, title: string) => {
    const destination = await showSaveDialog({
      title,
      defaultPath: fileName,
    })
    if (destination === null) {
      return null
    }
    await writeFile(destination, contents, 'utf8')
    return destination
  }

  private factors(): ReadonlyArray<IMd3AuthenticatorFactor> {
    return this.state.document?.entries ?? []
  }

  /**
   * The provenance line.
   *
   * A registered-factor list has no shipped default, so the honest line names
   * what is on this computer: nothing registered yet, or exactly how many.
   */
  private renderProvenance() {
    const count = this.state.document?.entries.length ?? 0
    const unread = this.state.document === null
    return (
      <p
        id="authenticator-provenance"
        className="appearance-customization-caption authenticator-provenance"
      >
        {unread
          ? this.t('authenticatorSettings.provenanceUnread')
          : count === 0
          ? this.t('authenticatorSettings.provenanceNone')
          : count === 1
          ? this.t('authenticatorSettings.provenanceOne')
          : this.t('authenticatorSettings.provenanceMany', {
              count: String(count),
            })}
      </p>
    )
  }

  private renderList() {
    if (!this.state.open) {
      return null
    }

    if (this.state.error !== null) {
      return (
        <p className="settings-error" role="alert">
          {this.t('authenticatorSettings.unavailable', {
            error: this.state.error,
          })}
        </p>
      )
    }

    return (
      <div className="authenticator-list" role="group">
        <Md3AuthenticatorView
          factors={this.factors()}
          secrets={this.state.secrets}
          groups={this.state.document?.groups ?? []}
          onRegister={this.onRegister}
          onEdit={this.onEdit}
          onDelete={this.onDelete}
          onReorder={this.onReorder}
          onAssignGroup={this.onAssignGroup}
          onExport={this.onExport}
          onExportSecrets={this.onExportSecrets}
        />
        <button
          type="button"
          className="authenticator-close"
          onClick={this.onDismissed}
        >
          {this.t('authenticatorSettings.close')}
        </button>
      </div>
    )
  }

  public render() {
    return (
      <div
        className="advanced-section authenticator-section"
        {...teleportAnchor('settings-authenticator')}
      >
        <h2>{this.t('authenticatorSettings.heading')}</h2>
        <button
          type="button"
          className="authenticator-open"
          onClick={this.onOpen}
          aria-describedby="authenticator-provenance"
          aria-expanded={this.state.open}
        >
          {this.t('authenticatorSettings.manage')}
        </button>
        <details className="authenticator-explanation">
          <summary>
            {this.t('authenticatorSettings.explanationSummary')}
          </summary>
          <p className="appearance-customization-caption">
            {translateWithFunnyLevel(
              'authenticatorSettings.explanation',
              this.props.languageMode,
              this.funnyLevels()
            )}
          </p>
          <p className="appearance-customization-caption">
            {this.t('authenticatorSettings.boundaryNote')}
          </p>
        </details>
        {this.renderProvenance()}
        {this.renderList()}
      </div>
    )
  }
}
