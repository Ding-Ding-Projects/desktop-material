import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Loading } from '../lib/loading'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  t,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'
import {
  IgnoredSubmoduleDestinationKey,
  IgnoredSubmoduleRejectionKey,
  IIgnoredSubmoduleRejection,
  normalizeIgnoredPath,
} from '../../lib/cheap-lfs/ignored-submodule-plan'
import {
  IgnoredSubmoduleProofError,
  IgnoredSubmoduleRejectedError,
  IIgnoredFileCandidate,
  IIgnoredFileInventory,
  IIgnoredSubmoduleDependencies,
  IIgnoredSubmoduleRequest,
  IIgnoredSubmoduleResult,
  listIgnoredFileInventory,
  stageIgnoredFilesIntoLocalSubmodule,
} from '../../lib/cheap-lfs/ignored-submodule-local'
import { MaterialSymbol } from '../lib/material-symbol'

/** The per-surface persistence id for this search's filter mode. */
const IgnoredSubmoduleFilterId = 'ignored-submodule-files'

/** The folder offered before the user names their own. */
const DefaultDestinationPath = 'local-large-files'

interface ILocalizedMessage {
  readonly key: TranslationKey
  readonly variables?: TranslationVariables
}

type DialogPhase = 'loading' | 'select' | 'confirm' | 'running' | 'done'

interface IIgnoredSubmoduleDialogState {
  readonly phase: DialogPhase
  readonly inventory: IIgnoredFileInventory | null
  readonly selectedPaths: ReadonlySet<string>
  readonly destinationPath: string
  readonly filterText: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly error: ILocalizedMessage | null
  readonly rejections: ReadonlyArray<IIgnoredSubmoduleRejection>
  readonly retainedRecoveryDirectory: string | null
  readonly result: IIgnoredSubmoduleResult | null
  readonly completed: number
  readonly total: number
  readonly languageMode: LanguageMode
}

export interface IIgnoredSubmoduleDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  /** Called after the submodule has been staged, so lists can refresh. */
  readonly onCompleted?: () => void | Promise<void>
  /** Reads the proven-ignored inventory; tests inject a stub. */
  readonly onLoadInventory?: (
    repository: Repository
  ) => Promise<IIgnoredFileInventory>
  /** Runs the local staging operation; tests inject a stub. */
  readonly onStage?: (
    repository: Repository,
    inventory: IIgnoredFileInventory,
    request: IIgnoredSubmoduleRequest,
    dependencies: IIgnoredSubmoduleDependencies
  ) => Promise<IIgnoredSubmoduleResult>
}

/**
 * The reviewed, local-only workflow that copies files Git currently proves are
 * ignored into a new local repository and adds it as a submodule.
 *
 * The dialog is the confirmation gate: it lists every selected file, states the
 * exact destination, spells out what will and will not happen, and only then
 * offers the button that does the work. Progress and the outcome also arrive as
 * non-blocking notifications so the window is never the only place the result
 * exists.
 */
export class IgnoredSubmoduleDialog extends React.Component<
  IIgnoredSubmoduleDialogProps,
  IIgnoredSubmoduleDialogState
> {
  private mounted = false
  private readonly funnyLevels: IFunnyLevels = readFunnyLevels()

  public constructor(props: IIgnoredSubmoduleDialogProps) {
    super(props)

    this.state = {
      phase: 'loading',
      inventory: null,
      selectedPaths: new Set<string>(),
      destinationPath: DefaultDestinationPath,
      filterText: '',
      filterMode: readPersistedFilterMode(IgnoredSubmoduleFilterId),
      filterCaseSensitive: false,
      error: null,
      rejections: [],
      retainedRecoveryDirectory: null,
      result: null,
      completed: 0,
      total: 0,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    this.mounted = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.loadInventory()
  }

  public componentWillUnmount() {
    this.mounted = false
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ mode?: string }>).detail
    this.setState({
      languageMode: normalizeLanguageMode(
        detail?.mode ?? getPersistedLanguageMode()
      ),
    })
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.state.languageMode)
  }

  private localize(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, this.state.languageMode, variables)
  }

  private loadInventory = async () => {
    const load = this.props.onLoadInventory ?? listIgnoredFileInventory
    try {
      const inventory = await load(this.props.repository)
      if (!this.mounted) {
        return
      }
      this.setState({ inventory, phase: 'select' })
    } catch (error) {
      if (!this.mounted) {
        return
      }
      this.setState({
        phase: 'select',
        inventory: null,
        error: {
          key: 'ignoredSubmodule.loadFailed',
          variables: { error: String(error) },
        },
      })
    }
  }

  private getVisibleCandidates(): ReadonlyArray<IIgnoredFileCandidate> {
    const candidates = this.state.inventory?.candidates ?? []
    const query = this.state.filterText.trim()
    if (query.length === 0) {
      return candidates
    }

    const { results } = matchWithMode(
      query,
      candidates,
      candidate => [
        candidate.path,
        `${candidate.proof.source} ${candidate.proof.pattern}`,
      ],
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )
    return results.map(result => result.item)
  }

  private getSelectedCandidates(): ReadonlyArray<IIgnoredFileCandidate> {
    const candidates = this.state.inventory?.candidates ?? []
    return candidates.filter(candidate =>
      this.state.selectedPaths.has(candidate.path)
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(IgnoredSubmoduleFilterId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ filterText: pattern })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    (this.state.inventory?.candidates ?? []).map(
      candidate => `${candidate.path} · ${candidate.proof.pattern}`
    )

  private onDestinationChanged = (destinationPath: string) => {
    this.setState({ destinationPath })
  }

  private onToggleCandidate = (path: string) => {
    this.setState(previous => {
      const selectedPaths = new Set(previous.selectedPaths)
      if (selectedPaths.has(path)) {
        selectedPaths.delete(path)
      } else {
        selectedPaths.add(path)
      }
      return { selectedPaths }
    })
  }

  private onSelectAllVisible = () => {
    const visible = this.getVisibleCandidates()
    this.setState(previous => {
      const selectedPaths = new Set(previous.selectedPaths)
      for (const candidate of visible) {
        selectedPaths.add(candidate.path)
      }
      return { selectedPaths }
    })
  }

  private onClearSelection = () => {
    this.setState({ selectedPaths: new Set<string>() })
  }

  private onReview = () => {
    this.setState({ phase: 'confirm', error: null, rejections: [] })
  }

  private onBackToSelection = () => {
    this.setState({ phase: 'select' })
  }

  private onProgress = (completed: number, total: number) => {
    if (this.mounted) {
      this.setState({ completed, total })
    }
  }

  private onConfirm = async () => {
    const inventory = this.state.inventory
    if (inventory === null) {
      return
    }

    const selected = this.getSelectedCandidates()
    const destinationPath = normalizeIgnoredPath(this.state.destinationPath)
    const stage = this.props.onStage ?? stageIgnoredFilesIntoLocalSubmodule

    this.setState({
      phase: 'running',
      error: null,
      rejections: [],
      retainedRecoveryDirectory: null,
      completed: 0,
      total: selected.length,
    })

    this.props.dispatcher.postNotification({
      kind: 'cheap-lfs',
      title: this.localize('ignoredSubmodule.notification.startedTitle'),
      body: this.localize('ignoredSubmodule.notification.startedBody', {
        count: String(selected.length),
        path: destinationPath,
      }),
      repositoryId: this.props.repository.id,
    })

    try {
      const result = await stage(
        this.props.repository,
        inventory,
        {
          destinationPath,
          selectedPaths: selected.map(candidate => candidate.path),
        },
        { onProgress: this.onProgress }
      )

      this.props.dispatcher.postNotification({
        kind: 'cheap-lfs',
        title: this.localize('ignoredSubmodule.notification.succeededTitle'),
        body: this.localize('ignoredSubmodule.notification.succeededBody', {
          count: String(result.stagedFiles.length),
          path: result.destinationPath,
        }),
        repositoryId: this.props.repository.id,
      })

      await this.props.onCompleted?.()

      if (this.mounted) {
        this.setState({ phase: 'done', result })
      }
    } catch (error) {
      this.reportFailure(error)
    }
  }

  private reportFailure(error: unknown) {
    const rejections =
      error instanceof IgnoredSubmoduleRejectedError ? error.rejections : []
    const destinationError =
      error instanceof IgnoredSubmoduleRejectedError
        ? error.destinationError
        : null
    const retainedRecoveryDirectory =
      error instanceof IgnoredSubmoduleProofError
        ? error.retainedRecoveryDirectory
        : null

    const message: ILocalizedMessage =
      destinationError !== null
        ? { key: IgnoredSubmoduleDestinationKey[destinationError] }
        : {
            key: 'ignoredSubmodule.notification.failedBody',
            variables: {
              error: error instanceof Error ? error.message : String(error),
            },
          }

    this.props.dispatcher.postNotification({
      kind: 'cheap-lfs',
      title: this.localize('ignoredSubmodule.notification.failedTitle'),
      body: this.localize(message.key, message.variables),
      repositoryId: this.props.repository.id,
    })

    if (this.mounted) {
      this.setState({
        phase: 'confirm',
        error: message,
        rejections,
        retainedRecoveryDirectory,
      })
    }
  }

  private getDestinationError(): ILocalizedMessage | null {
    const destinationPath = normalizeIgnoredPath(this.state.destinationPath)
    if (destinationPath.length === 0) {
      return { key: IgnoredSubmoduleDestinationKey.empty }
    }
    return null
  }

  private canReview(): boolean {
    return (
      this.state.phase === 'select' &&
      this.state.selectedPaths.size > 0 &&
      this.getDestinationError() === null
    )
  }

  private renderMessage(message: ILocalizedMessage): React.ReactNode {
    return (
      <LocalizedText
        translationKey={message.key}
        variables={message.variables}
        languageMode={this.state.languageMode}
      />
    )
  }

  private renderSelectedBytes(
    candidates: ReadonlyArray<IIgnoredFileCandidate>
  ): string {
    return String(
      candidates.reduce((total, candidate) => total + candidate.size, 0)
    )
  }

  private renderFilterControls(): JSX.Element {
    return (
      <div className="ignored-submodule-filter-row">
        <TextBox
          searchSurfaceId="ignored-submodule-files"
          className="ignored-submodule-filter-text"
          placeholder={t('ignoredSubmodule.searchPlaceholder')}
          ariaLabel={this.accessibleText('ignoredSubmodule.searchLabel')}
          value={this.state.filterText}
          onValueChanged={this.onFilterTextChanged}
        />
        <FilterModeControl
          searchSurfaceId="ignored-submodule-files"
          mode={this.state.filterMode}
          caseSensitive={this.state.filterCaseSensitive}
          onModeChange={this.onFilterModeChanged}
          onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
          regexBuilderTarget={this.accessibleText(
            'ignoredSubmodule.searchTarget'
          )}
          getSampleItems={this.getFilterSampleItems}
          filterText={this.state.filterText}
          onRegexPatternApply={this.onRegexPatternApply}
        />
      </div>
    )
  }

  private renderCandidateList(): JSX.Element {
    const inventory = this.state.inventory
    if (inventory === null || inventory.candidates.length === 0) {
      return (
        <p className="ignored-submodule-empty">
          <LocalizedText
            translationKey="ignoredSubmodule.empty"
            languageMode={this.state.languageMode}
          />
        </p>
      )
    }

    const visible = this.getVisibleCandidates()
    if (visible.length === 0) {
      return (
        <p className="ignored-submodule-empty">
          <LocalizedText
            translationKey="ignoredSubmodule.noMatches"
            languageMode={this.state.languageMode}
          />
        </p>
      )
    }

    return (
      <ul
        className="ignored-submodule-list"
        aria-label={this.accessibleText('ignoredSubmodule.listLabel')}
      >
        {visible.map(candidate => (
          <IgnoredCandidateRow
            key={candidate.path}
            candidate={candidate}
            selected={this.state.selectedPaths.has(candidate.path)}
            languageMode={this.state.languageMode}
            onToggle={this.onToggleCandidate}
          />
        ))}
      </ul>
    )
  }

  private renderSelection(): JSX.Element {
    const inventory = this.state.inventory
    const selected = this.getSelectedCandidates()
    const visible = this.getVisibleCandidates()

    return (
      <DialogContent className="ignored-submodule-select">
        <p className="ignored-submodule-intro">
          {translateWithFunnyLevel(
            'ignoredSubmodule.intro',
            this.state.languageMode,
            this.funnyLevels
          )}
        </p>
        {inventory?.truncated === true && (
          <p className="ignored-submodule-truncated" role="status">
            <MaterialSymbol name="info" />
            <LocalizedText
              translationKey="ignoredSubmodule.truncated"
              variables={{ count: String(inventory.candidates.length) }}
              languageMode={this.state.languageMode}
            />
          </p>
        )}
        <Row>
          <TextBox
            className="ignored-submodule-destination"
            label={this.localize('ignoredSubmodule.destinationLabel')}
            value={this.state.destinationPath}
            onValueChanged={this.onDestinationChanged}
          />
        </Row>
        <p className="ignored-submodule-destination-help">
          <LocalizedText
            translationKey="ignoredSubmodule.destinationHelp"
            languageMode={this.state.languageMode}
          />
        </p>
        {this.renderFilterControls()}
        <div className="ignored-submodule-toolbar">
          <Button type="button" onClick={this.onSelectAllVisible}>
            <LocalizedText
              translationKey="ignoredSubmodule.selectAll"
              languageMode={this.state.languageMode}
            />
          </Button>
          <Button type="button" onClick={this.onClearSelection}>
            <LocalizedText
              translationKey="ignoredSubmodule.clearSelection"
              languageMode={this.state.languageMode}
            />
          </Button>
          <span className="ignored-submodule-count" role="status">
            <LocalizedText
              translationKey="ignoredSubmodule.filterCount"
              variables={{
                visible: String(visible.length),
                total: String(inventory?.candidates.length ?? 0),
              }}
              languageMode={this.state.languageMode}
            />
          </span>
        </div>
        {this.renderCandidateList()}
        <p className="ignored-submodule-summary" role="status">
          <LocalizedText
            translationKey="ignoredSubmodule.selectionSummary"
            variables={{
              count: String(selected.length),
              bytes: this.renderSelectedBytes(selected),
            }}
            languageMode={this.state.languageMode}
          />
        </p>
      </DialogContent>
    )
  }

  private renderConsequences(destinationPath: string): JSX.Element {
    const willKeys: ReadonlyArray<TranslationKey> = [
      'ignoredSubmodule.willCopy',
      'ignoredSubmodule.willCreate',
      'ignoredSubmodule.willAdd',
      'ignoredSubmodule.willKeep',
      'ignoredSubmodule.willRecover',
    ]
    const wontKeys: ReadonlyArray<TranslationKey> = [
      'ignoredSubmodule.wontUpload',
      'ignoredSubmodule.wontRemote',
      'ignoredSubmodule.wontPointer',
      'ignoredSubmodule.wontCommit',
      'ignoredSubmodule.wontReplace',
    ]

    return (
      <>
        <h3 className="ignored-submodule-will-heading">
          <MaterialSymbol name="check" />
          <LocalizedText
            translationKey="ignoredSubmodule.willHeading"
            languageMode={this.state.languageMode}
          />
        </h3>
        <ul className="ignored-submodule-will">
          {willKeys.map(key => (
            <li key={key}>
              <LocalizedText
                translationKey={key}
                variables={{ path: destinationPath }}
                languageMode={this.state.languageMode}
              />
            </li>
          ))}
        </ul>
        <h3 className="ignored-submodule-wont-heading">
          <MaterialSymbol name="close" />
          <LocalizedText
            translationKey="ignoredSubmodule.wontHeading"
            languageMode={this.state.languageMode}
          />
        </h3>
        <ul className="ignored-submodule-wont">
          {wontKeys.map(key => (
            <li key={key}>
              <LocalizedText
                translationKey={key}
                languageMode={this.state.languageMode}
              />
            </li>
          ))}
        </ul>
      </>
    )
  }

  private renderRejections(): JSX.Element | null {
    if (this.state.rejections.length === 0) {
      return null
    }

    return (
      <section className="ignored-submodule-rejections" role="alert">
        <h3>
          <LocalizedText
            translationKey="ignoredSubmodule.rejectedHeading"
            languageMode={this.state.languageMode}
          />
        </h3>
        <ul>
          {this.state.rejections.map(rejection => (
            <li key={`${rejection.path}:${rejection.reason}`}>
              <LocalizedText
                translationKey="ignoredSubmodule.rejectedRow"
                variables={{
                  path: rejection.path,
                  reason: this.localize(
                    IgnoredSubmoduleRejectionKey[rejection.reason]
                  ),
                }}
                languageMode={this.state.languageMode}
              />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  private renderConfirmation(): JSX.Element {
    const selected = this.getSelectedCandidates()
    const destinationPath = normalizeIgnoredPath(this.state.destinationPath)

    return (
      <DialogContent className="ignored-submodule-confirm">
        <h2 className="ignored-submodule-confirm-heading">
          <LocalizedText
            translationKey="ignoredSubmodule.reviewHeading"
            languageMode={this.state.languageMode}
          />
        </h2>
        <p className="ignored-submodule-confirm-lead">
          {translateWithFunnyLevel(
            'ignoredSubmodule.reviewLead',
            this.state.languageMode,
            this.funnyLevels
          )}
        </p>
        <p className="ignored-submodule-confirm-destination">
          <LocalizedText
            translationKey="ignoredSubmodule.reviewDestination"
            variables={{ path: destinationPath }}
            languageMode={this.state.languageMode}
          />
        </p>
        {this.renderConsequences(destinationPath)}
        <h3 className="ignored-submodule-confirm-files-heading">
          <LocalizedText
            translationKey="ignoredSubmodule.reviewFilesHeading"
            variables={{
              count: String(selected.length),
              bytes: this.renderSelectedBytes(selected),
            }}
            languageMode={this.state.languageMode}
          />
        </h3>
        <ul className="ignored-submodule-confirm-files">
          {selected.map(candidate => (
            <li key={candidate.path}>{candidate.path}</li>
          ))}
        </ul>
        {this.renderRejections()}
        {this.state.retainedRecoveryDirectory !== null && (
          <p className="ignored-submodule-recovery" role="alert">
            <LocalizedText
              translationKey="ignoredSubmodule.recoveryRetained"
              variables={{ path: this.state.retainedRecoveryDirectory }}
              languageMode={this.state.languageMode}
            />
          </p>
        )}
      </DialogContent>
    )
  }

  private renderProgress(): JSX.Element | null {
    if (this.state.phase !== 'running') {
      return null
    }

    return (
      <div
        className="ignored-submodule-progress"
        role="status"
        aria-live="polite"
      >
        <Loading />
        <div>
          <strong>
            <LocalizedText
              translationKey="ignoredSubmodule.progressHeading"
              languageMode={this.state.languageMode}
            />
          </strong>
          <span>
            <LocalizedText
              translationKey="ignoredSubmodule.progressStatus"
              variables={{
                completed: String(this.state.completed),
                total: String(this.state.total),
              }}
              languageMode={this.state.languageMode}
            />
          </span>
        </div>
        <progress
          aria-label={this.accessibleText('ignoredSubmodule.progressLabel')}
          max={Math.max(this.state.total, 1)}
          value={this.state.completed}
        />
      </div>
    )
  }

  private renderDone(): JSX.Element {
    const result = this.state.result

    return (
      <>
        <DialogContent className="ignored-submodule-success">
          <MaterialSymbol name="check_circle" />
          <div>
            <h2>
              <LocalizedText
                translationKey="ignoredSubmodule.successHeading"
                languageMode={this.state.languageMode}
              />
            </h2>
            <p>
              <LocalizedText
                translationKey="ignoredSubmodule.successDescription"
                variables={{
                  count: String(result?.stagedFiles.length ?? 0),
                  bytes: String(result?.totalBytes ?? 0),
                  path: result?.destinationPath ?? '',
                }}
                languageMode={this.state.languageMode}
              />
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="button-group">
            <Button
              type="button"
              onClick={this.props.onDismissed}
              ariaLabel={this.accessibleText('ignoredSubmodule.doneAction')}
            >
              <LocalizedText
                translationKey="ignoredSubmodule.doneAction"
                languageMode={this.state.languageMode}
              />
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  private renderFooter(): JSX.Element {
    const running = this.state.phase === 'running'

    if (this.state.phase === 'confirm') {
      return (
        <DialogFooter>
          <div className="button-group">
            <Button
              type="button"
              onClick={this.onConfirm}
              ariaLabel={this.accessibleText('ignoredSubmodule.confirmAction')}
            >
              <LocalizedText
                translationKey="ignoredSubmodule.confirmAction"
                languageMode={this.state.languageMode}
              />
            </Button>
            <Button
              type="button"
              onClick={this.onBackToSelection}
              ariaLabel={this.accessibleText('ignoredSubmodule.backAction')}
            >
              <LocalizedText
                translationKey="ignoredSubmodule.backAction"
                languageMode={this.state.languageMode}
              />
            </Button>
            <Button type="button" onClick={this.props.onDismissed}>
              <LocalizedText
                translationKey="ignoredSubmodule.cancelAction"
                languageMode={this.state.languageMode}
              />
            </Button>
          </div>
        </DialogFooter>
      )
    }

    return (
      <DialogFooter>
        <div className="button-group">
          <Button
            type="button"
            disabled={!this.canReview()}
            onClick={this.onReview}
            ariaLabel={this.accessibleText('ignoredSubmodule.reviewAction')}
          >
            <LocalizedText
              translationKey="ignoredSubmodule.reviewAction"
              languageMode={this.state.languageMode}
            />
          </Button>
          <Button
            type="button"
            disabled={running}
            onClick={this.props.onDismissed}
          >
            <LocalizedText
              translationKey="ignoredSubmodule.cancelAction"
              languageMode={this.state.languageMode}
            />
          </Button>
        </div>
      </DialogFooter>
    )
  }

  private renderBody(): JSX.Element {
    switch (this.state.phase) {
      case 'loading':
        return (
          <DialogContent className="ignored-submodule-loading">
            <Loading />{' '}
            <LocalizedText
              translationKey="ignoredSubmodule.loading"
              languageMode={this.state.languageMode}
            />
          </DialogContent>
        )
      case 'confirm':
      case 'running':
        return this.renderConfirmation()
      default:
        return this.renderSelection()
    }
  }

  public render() {
    const running = this.state.phase === 'running'

    return (
      <Dialog
        className="ignored-submodule-dialog"
        title={
          <LocalizedText
            translationKey="ignoredSubmodule.dialogTitle"
            languageMode={this.state.languageMode}
          />
        }
        titleId="ignored-submodule-title"
        onDismissed={this.props.onDismissed}
        dismissDisabled={running}
        loading={running}
      >
        {this.state.error !== null && (
          <DialogError>{this.renderMessage(this.state.error)}</DialogError>
        )}
        {this.state.phase === 'done' ? (
          this.renderDone()
        ) : (
          <>
            {this.renderBody()}
            {this.renderProgress()}
            {this.renderFooter()}
          </>
        )}
      </Dialog>
    )
  }
}

interface IIgnoredCandidateRowProps {
  readonly candidate: IIgnoredFileCandidate
  readonly selected: boolean
  readonly languageMode: LanguageMode
  readonly onToggle: (path: string) => void
}

/**
 * One proven-ignored file, with the exact Git rule that proves it.
 *
 * Extracted so the per-row toggle is a stable callback bound to its own path
 * rather than an inline arrow rebuilt on every render.
 */
function IgnoredCandidateRow(props: IIgnoredCandidateRowProps) {
  const { candidate, selected, languageMode } = props
  const onChange = React.useCallback(
    () => props.onToggle(candidate.path),
    [props.onToggle, candidate.path]
  )

  return (
    <li className="ignored-submodule-row">
      <Checkbox
        value={selected ? CheckboxValue.On : CheckboxValue.Off}
        onChange={onChange}
        label={candidate.path}
      />
      <span className="ignored-submodule-row-meta">
        <LocalizedText
          translationKey="ignoredSubmodule.fileMeta"
          variables={{ bytes: String(candidate.size) }}
          languageMode={languageMode}
        />
      </span>
      <span className="ignored-submodule-row-proof">
        <LocalizedText
          translationKey="ignoredSubmodule.proof"
          variables={{
            source: candidate.proof.source,
            line: String(candidate.proof.line),
            pattern: candidate.proof.pattern,
          }}
          languageMode={languageMode}
        />
      </span>
    </li>
  )
}
