import * as React from 'react'
import { writeFile } from 'fs/promises'
import { IProfileTabsState } from '../../models/repository-tab'
import { Repository } from '../../models/repository'
import { serializeTabSession } from '../../lib/tab-session-file'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showSaveDialog } from '../main-process-proxy'

interface IExportTabSessionDialogProps {
  readonly onDismissed: () => void
  readonly tabs: IProfileTabsState
  readonly repositories: ReadonlyArray<Repository>
}

interface IExportTabSessionDialogState {
  readonly saving: boolean
  readonly error: Error | null
}

/** Material preview and explicit save step for a portable current-tab session. */
export class ExportTabSessionDialog extends React.Component<
  IExportTabSessionDialogProps,
  IExportTabSessionDialogState
> {
  public constructor(props: IExportTabSessionDialogProps) {
    super(props)
    this.state = { saving: false, error: null }
  }

  private repositoryName(repositoryId: number, repositoryPath: string) {
    return (
      this.props.repositories.find(repository => repository.id === repositoryId)
        ?.name ?? repositoryPath
    )
  }

  private onExport = async () => {
    if (this.props.tabs.tabs.length === 0) {
      this.setState({ error: new Error('Open at least one repository tab.') })
      return
    }
    const path = await showSaveDialog({
      buttonLabel: 'Export tabs',
      defaultPath: 'desktop-material-tabs.json',
      filters: [{ name: 'Desktop Material tab session', extensions: ['json'] }],
    })
    if (path === null) {
      return
    }
    this.setState({ saving: true, error: null })
    try {
      await writeFile(path, serializeTabSession(this.props.tabs), 'utf8')
      this.props.onDismissed()
    } catch (error) {
      this.setState({ saving: false, error })
    }
  }

  public render() {
    const count = this.props.tabs.tabs.length
    return (
      <Dialog
        id="export-tab-session"
        title="Export current tabs"
        onSubmit={this.onExport}
        onDismissed={this.props.onDismissed}
        loading={this.state.saving}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error.message}</DialogError>
        )}
        <DialogContent>
          <p className="transfer-intro">
            Save the current order, active tab, favorites, pins, aliases, and
            per-tab appearance. The file contains local repository paths but no
            account tokens or credentials.
          </p>
          <ul className="transfer-list tab-session-list">
            {this.props.tabs.tabs.map(tab => (
              <li className="transfer-item" key={tab.id}>
                <div className="details">
                  <div className="name">
                    {tab.customLabel ??
                      this.repositoryName(tab.repositoryId, tab.repositoryPath)}
                  </div>
                  <div className="url">{tab.repositoryPath}</div>
                  <div className="tab-session-badges">
                    {tab.id === this.props.tabs.activeTabId && (
                      <span>Active</span>
                    )}
                    {tab.isPinned === true && <span>Pinned</span>}
                    {tab.isFavorite === true && <span>Favorite</span>}
                    {tab.titleStyle !== null && <span>Styled</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Export ${count} ${count === 1 ? 'Tab' : 'Tabs'}`}
            okButtonDisabled={count === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
