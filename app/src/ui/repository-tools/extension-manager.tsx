import * as React from 'react'

import {
  ExtensionPermissionLabels,
  IInstalledExtension,
} from '../../lib/extensions/manifest'
import {
  ExtensionRunResult,
  IExtensionContext,
} from '../../lib/extensions/protocol'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import {
  grantExtensionConsent,
  listExtensions,
  openExtensionsFolder,
  revokeExtensionConsent,
  runExtension,
  setExtensionEnabled,
} from '../main-process-proxy'

/** The calls the manager makes. Injectable for tests. */
export interface IExtensionManagerClient {
  readonly list: () => Promise<{
    readonly folder: string
    readonly extensions: ReadonlyArray<IInstalledExtension>
  }>
  readonly setEnabled: (id: string, enabled: boolean) => Promise<void>
  readonly grantConsent: (id: string) => Promise<void>
  readonly revokeConsent: (id: string) => Promise<void>
  readonly run: (
    id: string,
    context: IExtensionContext
  ) => Promise<ExtensionRunResult>
  readonly openFolder: () => Promise<void>
}

const defaultClient: IExtensionManagerClient = {
  list: listExtensions,
  setEnabled: setExtensionEnabled,
  grantConsent: grantExtensionConsent,
  revokeConsent: revokeExtensionConsent,
  run: runExtension,
  openFolder: openExtensionsFolder,
}

interface IExtensionManagerProps {
  readonly repositoryPath: string
  readonly branchName?: string | null
  readonly changedFiles?: ReadonlyArray<string>
  readonly client?: IExtensionManagerClient
}

interface IExtensionManagerState {
  readonly loading: boolean
  readonly folder: string
  readonly extensions: ReadonlyArray<IInstalledExtension>
  readonly query: string
  readonly error: string | null
  /** Id of the extension that is running, if any. */
  readonly running: string | null
  readonly results: Readonly<Record<string, ExtensionRunResult>>
}

/**
 * Extension manager: every installed extension with what it may see, a consent
 * step before anything runs, an on and off switch, and the result of a run.
 */
export class ExtensionManager extends React.Component<
  IExtensionManagerProps,
  IExtensionManagerState
> {
  private mounted = false

  public constructor(props: IExtensionManagerProps) {
    super(props)
    this.state = {
      loading: true,
      folder: '',
      extensions: [],
      query: '',
      error: null,
      running: null,
      results: {},
    }
  }

  private get client() {
    return this.props.client ?? defaultClient
  }

  public componentDidMount() {
    this.mounted = true
    void this.refresh()
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private refresh = async () => {
    try {
      const { folder, extensions } = await this.client.list()
      if (this.mounted) {
        this.setState({ loading: false, folder, extensions, error: null })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to read the extensions folder.',
        })
      }
    }
  }

  private async change(action: () => Promise<void>) {
    try {
      await action()
    } catch (error) {
      if (this.mounted) {
        this.setState({
          error: error instanceof Error ? error.message : 'That did not work.',
        })
      }
    }
    await this.refresh()
  }

  private onRun = async (id: string) => {
    this.setState({ running: id })
    let result: ExtensionRunResult
    try {
      result = await this.client.run(id, {
        repositoryPath: this.props.repositoryPath,
        branchName: this.props.branchName ?? null,
        changedFiles: this.props.changedFiles ?? [],
      })
    } catch (error) {
      result = {
        ok: false,
        error:
          error instanceof Error ? error.message : 'The extension did not run.',
      }
    }
    if (this.mounted) {
      this.setState(state => ({
        running: null,
        results: { ...state.results, [id]: result },
      }))
    }
  }

  private onQueryChanged = (query: string) => {
    this.setState({ query })
  }

  private onOpenFolder = () => {
    void this.client.openFolder()
  }

  private renderExtension(extension: IInstalledExtension) {
    const { manifest } = extension
    if (manifest === null) {
      return (
        <li className="extension-manager-item" key={extension.folder}>
          <div className="extension-manager-heading">
            <strong>{extension.folder}</strong>
            <span className="extension-manager-badge" data-kind="error">
              Cannot be used
            </span>
          </div>
          <ul className="extension-manager-reasons">
            {extension.errors.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </li>
      )
    }

    const { id } = manifest
    const result = this.state.results[id]
    const running = this.state.running === id
    const waitingForConsent = extension.enabled && !extension.canRun
    return (
      <li className="extension-manager-item" key={id}>
        <div className="extension-manager-heading">
          <strong>{manifest.name}</strong>
          <span className="extension-manager-version">{manifest.version}</span>
          {extension.builtIn && (
            <span className="extension-manager-badge">Built in</span>
          )}
          <Checkbox
            label={`Enable ${manifest.name}`}
            value={extension.enabled ? CheckboxValue.On : CheckboxValue.Off}
            onChange={event => {
              const enabled = event.currentTarget.checked
              void this.change(() => this.client.setEnabled(id, enabled))
            }}
          />
        </div>
        <p>{manifest.description}</p>
        <div className="extension-manager-permissions">
          <span>What it may see</span>
          {manifest.permissions.length === 0 ? (
            <p>Nothing from the repository.</p>
          ) : (
            <ul>
              {manifest.permissions.map(permission => (
                <li key={permission}>
                  {ExtensionPermissionLabels[permission]}
                  {extension.needsConsent.includes(permission) && (
                    <span className="extension-manager-badge" data-kind="new">
                      Needs your consent
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="extension-manager-actions">
          {waitingForConsent ? (
            <Button
              onClick={() =>
                void this.change(() => this.client.grantConsent(id))
              }
            >
              Allow and enable running
            </Button>
          ) : (
            <Button
              disabled={!extension.canRun || this.state.running !== null}
              onClick={() => void this.onRun(id)}
            >
              {running ? 'Running…' : 'Run on this repository'}
            </Button>
          )}
          {extension.canRun && (
            <Button
              onClick={() =>
                void this.change(() => this.client.revokeConsent(id))
              }
            >
              Withdraw consent
            </Button>
          )}
        </div>
        {waitingForConsent && (
          <p className="extension-manager-note">
            It runs as its own program with a time limit and never receives
            passwords, tokens or other credentials.
          </p>
        )}
        {result !== undefined &&
          (result.ok ? (
            <div className="extension-manager-result" role="status">
              <strong>{result.title}</strong>
              <pre>{result.text}</pre>
            </div>
          ) : (
            <p className="file-converter-error" role="alert">
              {result.error}
            </p>
          ))}
      </li>
    )
  }

  public render() {
    const { loading, extensions, query, error, folder } = this.state
    const needle = query.trim().toLowerCase()
    const shown = extensions.filter(extension => {
      const text = `${extension.manifest?.name ?? ''} ${
        extension.manifest?.description ?? ''
      } ${extension.manifest?.id ?? ''} ${extension.folder}`
      return text.toLowerCase().includes(needle)
    })
    return (
      <section
        className="extension-manager"
        aria-labelledby="extension-manager-title"
      >
        <div className="file-converter-section-heading">
          <h3 id="extension-manager-title">Extensions</h3>
          <span role="status">
            {loading
              ? 'Loading'
              : `${shown.length} of ${extensions.length} shown`}
          </span>
        </div>
        <div className="extension-manager-toolbar">
          <TextBox
            label="Search extensions"
            value={query}
            onValueChanged={this.onQueryChanged}
          />
          <Button onClick={this.refresh}>Refresh</Button>
          <Button onClick={this.onOpenFolder}>Open extensions folder</Button>
        </div>
        {error !== null && (
          <p className="file-converter-error" role="alert">
            {error}
          </p>
        )}
        {!loading && shown.length === 0 && (
          <p>
            {extensions.length === 0
              ? 'No extensions are installed.'
              : 'No extension matches the search.'}
          </p>
        )}
        <ul className="extension-manager-list">
          {shown.map(extension => this.renderExtension(extension))}
        </ul>
        <p className="extension-manager-note">
          To add one, put a folder with an extension.json in{' '}
          {folder.length > 0 ? folder : 'the extensions folder'} and press
          Refresh. The built-in ones are also samples to copy from.
        </p>
      </section>
    )
  }
}
