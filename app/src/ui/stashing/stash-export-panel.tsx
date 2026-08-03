/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import {
  showItemInFolder,
  showOpenDialog,
  showSaveDialog,
} from '../main-process-proxy'
import { Button } from '../lib/button'
import { FilterModeControl } from '../lib/filter-mode-control'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import {
  getPersistedLanguageMode,
  translateForAccessibleName,
  TranslationKey,
} from '../../lib/i18n'
import { LocalizedText } from '../lib/localized-text'
import { IStashEntry, stashEntryTitle } from '../../models/stash-entry'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import {
  exportStashes,
  IStashSevenZipOptions,
  StashExportFormat,
  StashSevenZipMethod,
} from '../../lib/git/stash-export'

const exportSurfaceId = 'stash-export'

interface IStashExportPanelProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly entries: ReadonlyArray<IStashEntry>
}

interface IStashExportPanelState {
  readonly filter: string
  readonly filterMode: FilterMode
  readonly caseSensitive: boolean
  readonly selectedShas: ReadonlySet<string>
  readonly format: StashExportFormat
  readonly sevenZip: IStashSevenZipOptions
  readonly busy: boolean
  readonly error: string | null
  readonly result: string | null
}

const defaultSevenZip: IStashSevenZipOptions = {
  method: 'LZMA2',
  level: 5,
  dictionary: '64m',
  matchFinder: 'BT4',
  fastBytes: 64,
  solid: true,
  threads: 'on',
  splitVolumes: '',
  password: '',
  encryptHeaders: false,
}

export class StashExportPanel extends React.Component<
  IStashExportPanelProps,
  IStashExportPanelState
> {
  public constructor(props: IStashExportPanelProps) {
    super(props)
    this.state = {
      filter: '',
      filterMode: readPersistedFilterMode(exportSurfaceId),
      caseSensitive: false,
      selectedShas: new Set(props.entries.map(entry => entry.stashSha)),
      format: 'directory',
      sevenZip: defaultSevenZip,
      busy: false,
      error: null,
      result: null,
    }
  }

  public componentDidUpdate(prevProps: IStashExportPanelProps) {
    if (prevProps.entries !== this.props.entries) {
      const current = new Set(this.props.entries.map(entry => entry.stashSha))
      this.setState(state => ({
        selectedShas: new Set(
          [...state.selectedShas].filter(sha => current.has(sha))
        ),
      }))
    }
  }

  private localized(
    key: TranslationKey,
    variables: Record<string, string> = {}
  ) {
    return (
      <LocalizedText
        translationKey={key}
        variables={variables}
        languageMode={getPersistedLanguageMode()}
      />
    )
  }

  private accessible(key: TranslationKey): string {
    return translateForAccessibleName(key, {}, getPersistedLanguageMode())
  }

  private matchingEntries(): ReadonlyArray<IStashEntry> {
    const query = this.state.filter.trim()
    if (!query) {
      return this.props.entries
    }
    return matchWithMode(
      query,
      this.props.entries,
      entry => [stashEntryTitle(entry), entry.branchName, entry.stashSha],
      { mode: this.state.filterMode, caseSensitive: this.state.caseSensitive }
    ).results.map(result => result.item)
  }

  private onFilterChanged = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ filter: event.currentTarget.value, error: null })

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(exportSurfaceId, filterMode)
    this.setState({ filterMode })
  }

  private onCaseChanged = (caseSensitive: boolean) =>
    this.setState({ caseSensitive })

  private toggleSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sha = event.currentTarget.dataset.stashSha
    if (!sha) {
      return
    }
    const selected = new Set(this.state.selectedShas)
    if (event.currentTarget.checked) {
      selected.add(sha)
    } else {
      selected.delete(sha)
    }
    this.setState({ selectedShas: selected })
  }

  private selectVisible = (invert: boolean) => {
    const selected = new Set(this.state.selectedShas)
    for (const entry of this.matchingEntries()) {
      if (invert) {
        if (selected.has(entry.stashSha)) {
          selected.delete(entry.stashSha)
        } else {
          selected.add(entry.stashSha)
        }
      } else {
        selected.add(entry.stashSha)
      }
    }
    this.setState({ selectedShas: selected })
  }

  private updateSevenZip = <K extends keyof IStashSevenZipOptions>(
    key: K,
    value: IStashSevenZipOptions[K]
  ) =>
    this.setState(state => ({ sevenZip: { ...state.sevenZip, [key]: value } }))

  private chooseDestination = async (): Promise<string | null> => {
    if (this.state.format === 'directory') {
      return showOpenDialog({
        title: this.accessible('stashManager.chooseDirectoryTitle'),
        properties: ['openDirectory'],
      })
    }
    return showSaveDialog({
      title: this.accessible('stashManager.chooseArchiveTitle'),
      defaultPath: `desktop-material-stashes.${this.state.format}`,
      filters: [
        {
          name: this.state.format === 'zip' ? 'ZIP archive' : '7-Zip archive',
          extensions: [this.state.format],
        },
      ],
    })
  }

  private onExport = async () => {
    const entries = this.props.entries.filter(entry =>
      this.state.selectedShas.has(entry.stashSha)
    )
    if (entries.length === 0) {
      this.setState({
        error: this.accessible('stashManager.exportSelectionRequired'),
      })
      return
    }
    const destination = await this.chooseDestination()
    if (destination === null) {
      return
    }
    this.setState({ busy: true, error: null, result: null })
    try {
      const result = await exportStashes({
        repository: this.props.repository,
        entries,
        format: this.state.format,
        destination,
        sevenZip: this.state.sevenZip,
      })
      this.setState({ busy: false, result: result.destination })
      await showItemInFolder(result.destination)
    } catch (error) {
      this.setState({
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : this.accessible('stashManager.exportFailed'),
      })
    }
  }

  private openInEditor = async () => {
    if (this.state.result === null) {
      return
    }
    await this.props.dispatcher.openInExternalEditor(
      this.state.result,
      this.props.repository
    )
  }

  private renderSevenZipOptions() {
    const options = this.state.sevenZip
    return (
      <fieldset
        className="stash-export-seven-zip-options"
        disabled={this.state.busy}
      >
        <legend>{this.localized('stashManager.sevenZipOptionsHeading')}</legend>
        <label>
          {this.localized('stashManager.sevenZipMethod')}
          <select
            value={options.method}
            onChange={event =>
              this.updateSevenZip(
                'method',
                event.currentTarget.value as StashSevenZipMethod
              )
            }
          >
            {(
              [
                'Copy',
                'Deflate',
                'BZip2',
                'LZMA',
                'LZMA2',
                'PPMd',
              ] as ReadonlyArray<StashSevenZipMethod>
            ).map(method => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label>
          {this.localized('stashManager.sevenZipLevel')}
          <input
            type="number"
            min={0}
            max={9}
            value={options.level}
            onChange={event =>
              this.updateSevenZip('level', Number(event.currentTarget.value))
            }
          />
        </label>
        <label>
          {this.localized('stashManager.sevenZipDictionary')}
          <select
            value={options.dictionary}
            onChange={event =>
              this.updateSevenZip('dictionary', event.currentTarget.value)
            }
          >
            {['4m', '16m', '64m', '256m', '1g'].map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {this.localized('stashManager.sevenZipMatchFinder')}
          <select
            value={options.matchFinder}
            onChange={event =>
              this.updateSevenZip(
                'matchFinder',
                event.currentTarget
                  .value as IStashSevenZipOptions['matchFinder']
              )
            }
          >
            {(['BT2', 'BT3', 'BT4', 'HC4'] as const).map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {this.localized('stashManager.sevenZipFastBytes')}
          <input
            type="number"
            min={5}
            max={273}
            value={options.fastBytes}
            onChange={event =>
              this.updateSevenZip(
                'fastBytes',
                Number(event.currentTarget.value)
              )
            }
          />
        </label>
        <label>
          {this.localized('stashManager.sevenZipThreads')}
          <select
            value={options.threads}
            onChange={event =>
              this.updateSevenZip('threads', event.currentTarget.value)
            }
          >
            {['on', '1', '2', '4', '8'].map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          {this.localized('stashManager.sevenZipSplitVolumes')}
          <input
            type="text"
            value={options.splitVolumes}
            placeholder="100m"
            onChange={event =>
              this.updateSevenZip('splitVolumes', event.currentTarget.value)
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.solid}
            onChange={event =>
              this.updateSevenZip('solid', event.currentTarget.checked)
            }
          />
          {this.localized('stashManager.sevenZipSolid')}
        </label>
        <label>
          {this.localized('stashManager.sevenZipPassword')}
          <input
            type="password"
            autoComplete="new-password"
            value={options.password}
            onChange={event =>
              this.updateSevenZip('password', event.currentTarget.value)
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.encryptHeaders}
            disabled={!options.password}
            onChange={event =>
              this.updateSevenZip('encryptHeaders', event.currentTarget.checked)
            }
          />
          {this.localized('stashManager.sevenZipEncryptHeaders')}
        </label>
      </fieldset>
    )
  }

  public render() {
    const visible = this.matchingEntries()
    const selectedCount = this.state.selectedShas.size
    const result = this.state.result
    return (
      <section
        className="stash-export-panel"
        aria-label={this.accessible('stashManager.exportPanelAria')}
      >
        <p>{this.localized('stashManager.exportDescription')}</p>
        <div className="stash-export-search">
          <label htmlFor="stash-export-search-input">
            {this.localized('stashManager.exportSearchLabel')}
          </label>
          <div className="stash-manager-filter-field">
            <input
              id="stash-export-search-input"
              type="search"
              value={this.state.filter}
              onChange={this.onFilterChanged}
              aria-label={this.accessible('stashManager.exportSearchAria')}
            />
            <FilterModeControl
              searchSurfaceId={exportSurfaceId}
              mode={this.state.filterMode}
              caseSensitive={this.state.caseSensitive}
              onModeChange={this.onFilterModeChanged}
              onCaseSensitiveChange={this.onCaseChanged}
              regexBuilderTarget={this.accessible(
                'stashManager.exportSearchRegexTarget'
              )}
              getSampleItems={() =>
                this.props.entries.map(
                  entry => `${stashEntryTitle(entry)} · ${entry.branchName}`
                )
              }
              filterText={this.state.filter}
              onRegexPatternApply={filter => this.setState({ filter })}
            />
          </div>
        </div>
        <div className="stash-export-bulk-actions">
          <Button size="small" onClick={() => this.selectVisible(false)}>
            {this.localized('stashManager.selectVisible')}
          </Button>
          <Button size="small" onClick={() => this.selectVisible(true)}>
            {this.localized('stashManager.invertVisible')}
          </Button>
          <span role="status">
            {this.localized('stashManager.exportSelectedCount', {
              count: String(selectedCount),
            })}
          </span>
        </div>
        <ul className="stash-export-entry-list">
          {visible.map(entry => (
            <li key={entry.stashSha}>
              <label
                htmlFor={`stash-export-entry-${entry.stashSha}`}
                aria-label={stashEntryTitle(entry)}
              >
                <input
                  id={`stash-export-entry-${entry.stashSha}`}
                  type="checkbox"
                  data-stash-sha={entry.stashSha}
                  checked={this.state.selectedShas.has(entry.stashSha)}
                  onChange={this.toggleSelection}
                />
                <span>
                  <strong>{stashEntryTitle(entry)}</strong>
                  <small>
                    {entry.branchName} · {entry.stashSha}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {visible.length === 0 ? (
          <p className="stash-manager-empty">
            {this.localized('stashManager.noMatches')}
          </p>
        ) : null}
        <fieldset className="stash-export-format" disabled={this.state.busy}>
          <legend>{this.localized('stashManager.exportFormatLabel')}</legend>
          <label>
            <input
              type="radio"
              checked={this.state.format === 'directory'}
              onChange={() => this.setState({ format: 'directory' })}
            />
            {this.localized('stashManager.exportDirectory')}
          </label>
          <label>
            <input
              type="radio"
              checked={this.state.format === 'zip'}
              onChange={() => this.setState({ format: 'zip' })}
            />
            ZIP
          </label>
          <label>
            <input
              type="radio"
              checked={this.state.format === '7z'}
              onChange={() => this.setState({ format: '7z' })}
            />
            7z
          </label>
        </fieldset>
        {this.state.format === '7z' ? this.renderSevenZipOptions() : null}
        <p className="stash-manager-caption">
          {this.localized('stashManager.exportSecurityNote')}
        </p>
        {this.state.error !== null ? (
          <p className="stash-manager-error" role="alert">
            {this.state.error}
          </p>
        ) : null}
        {result !== null ? (
          <div className="stash-export-result" role="status">
            <strong>{this.localized('stashManager.exportComplete')}</strong>
            <code>{result}</code>
            <Button size="small" onClick={this.openInEditor}>
              {this.localized('stashManager.openExportInEditor')}
            </Button>
          </div>
        ) : null}
        <Button
          className="stash-manager-primary-action"
          disabled={this.state.busy || selectedCount === 0}
          onClick={this.onExport}
        >
          {this.state.busy
            ? this.localized('stashManager.exportingAction')
            : this.localized('stashManager.exportAction')}
        </Button>
      </section>
    )
  }
}
