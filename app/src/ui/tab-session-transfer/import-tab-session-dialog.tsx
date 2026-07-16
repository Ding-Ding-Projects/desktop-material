import * as React from 'react'
import { readFile } from 'fs/promises'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { RepositoryTabsStore } from '../../lib/stores/repository-tabs-store'
import {
  ITabSessionFile,
  parseTabSession,
  TabSessionImportMode,
} from '../../lib/tab-session-file'
import { matchExistingRepository } from '../../lib/repository-matching'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { showOpenDialog } from '../main-process-proxy'

interface IImportTabSessionDialogProps {
  readonly dispatcher: Dispatcher
  readonly tabsStore: RepositoryTabsStore
  readonly existingRepositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IImportTabSessionDialogState {
  readonly session: ITabSessionFile | null
  readonly filePath: string | null
  readonly mode: TabSessionImportMode
  readonly importing: boolean
  readonly error: Error | null
}

/** Validate, preview, and restore a current-tab session from local JSON. */
export class ImportTabSessionDialog extends React.Component<
  IImportTabSessionDialogProps,
  IImportTabSessionDialogState
> {
  public constructor(props: IImportTabSessionDialogProps) {
    super(props)
    this.state = {
      session: null,
      filePath: null,
      mode: 'replace',
      importing: false,
      error: null,
    }
  }

  private onChooseFile = async () => {
    const filePath = await showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Desktop Material tab session', extensions: ['json'] }],
    })
    if (filePath === null) {
      return
    }
    try {
      const session = parseTabSession(await readFile(filePath, 'utf8'))
      this.setState({
        session,
        filePath,
        error:
          session === null
            ? new Error(
                'That file is not a valid Desktop Material tab session.'
              )
            : null,
      })
    } catch (error) {
      this.setState({ session: null, filePath, error })
    }
  }

  private onModeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ mode: event.currentTarget.value as TabSessionImportMode })
  }

  private onImport = async () => {
    const { session, mode } = this.state
    if (session === null) {
      await this.onChooseFile()
      return
    }
    this.setState({ importing: true, error: null })
    try {
      const missingPaths = session.tabs
        .map(tab => tab.repositoryPath)
        .filter(
          path =>
            matchExistingRepository(this.props.existingRepositories, path) ===
            undefined
        )
      const added = await this.props.dispatcher.addRepositories(missingPaths)
      const repositories = [...this.props.existingRepositories, ...added]
      const result = await this.props.tabsStore.importTabSession(
        session,
        repositories,
        mode
      )
      if (result.importedCount === 0) {
        this.setState({
          importing: false,
          error: new Error(
            'None of the repositories in this session are available on this computer.'
          ),
        })
        return
      }
      if (result.activeRepository !== null) {
        await this.props.dispatcher.selectRepository(result.activeRepository)
      }
      this.props.onDismissed()
    } catch (error) {
      this.setState({ importing: false, error })
    }
  }

  private renderPicker() {
    return (
      <div className="transfer-empty">
        <p>Choose a tab-session JSON file to preview and import.</p>
        <Button onClick={this.onChooseFile}>Choose File…</Button>
      </div>
    )
  }

  private renderPreview(session: ITabSessionFile) {
    const available = session.tabs.filter(
      tab =>
        matchExistingRepository(
          this.props.existingRepositories,
          tab.repositoryPath
        ) !== undefined
    ).length
    return (
      <>
        <Row className="transfer-file-row">
          <span className="file-path">{this.state.filePath}</span>
          <LinkButton onClick={this.onChooseFile}>Change…</LinkButton>
        </Row>
        <Select
          label="Import behavior"
          value={this.state.mode}
          onChange={this.onModeChanged}
        >
          <option value="replace">Replace current tabs</option>
          <option value="merge">Merge with current tabs</option>
        </Select>
        <p className="transfer-summary">
          {session.tabs.length} {session.tabs.length === 1 ? 'tab' : 'tabs'};{' '}
          {available} already available and the remaining repositories will be
          added automatically when their folders exist.
        </p>
        <ul className="transfer-list tab-session-list">
          {session.tabs.map(tab => (
            <li className="transfer-item" key={tab.repositoryPath}>
              <div className="details">
                <div className="name">
                  {tab.customLabel ?? tab.repositoryPath}
                </div>
                <div className="url">{tab.repositoryPath}</div>
                <div className="tab-session-badges">
                  {tab.isPinned === true && <span>Pinned</span>}
                  {tab.isFavorite === true && <span>Favorite</span>}
                  {tab.titleStyle !== null && <span>Styled</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  public render() {
    const count = this.state.session?.tabs.length ?? 0
    return (
      <Dialog
        id="import-tab-session"
        title="Import current tabs"
        onSubmit={this.onImport}
        onDismissed={this.props.onDismissed}
        loading={this.state.importing}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error.message}</DialogError>
        )}
        <DialogContent>
          {this.state.session === null
            ? this.renderPicker()
            : this.renderPreview(this.state.session)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              this.state.session === null
                ? 'Choose File…'
                : `Import ${count} ${count === 1 ? 'Tab' : 'Tabs'}`
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
