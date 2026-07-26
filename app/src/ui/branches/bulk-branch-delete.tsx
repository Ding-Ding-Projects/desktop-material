import * as React from 'react'
import { Branch, BranchType } from '../../models/branch'
import { Repository } from '../../models/repository'
import {
  IReviewedBranchDeletion,
  IReviewedBranchDeletionResult,
  MaximumReviewedBranchDeletions,
} from '../../lib/git'
import { Button } from '../lib/button'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { OperationProgressRow } from '../lib/operation-progress-row'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'

interface ILocalizedMessage {
  readonly key: TranslationKey
  readonly variables?: TranslationVariables
}

class ReviewedBranchListChangedError extends Error {}

interface IBulkBranchDeleteDispatcher {
  readonly deleteReviewedBranches: (
    repository: Repository,
    reviewed: ReadonlyArray<IReviewedBranchDeletion>,
    onBranchDeleted?: (
      completed: number,
      total: number,
      result: IReviewedBranchDeletionResult
    ) => void
  ) => Promise<ReadonlyArray<IReviewedBranchDeletionResult>>
}

interface IBulkBranchDeleteProps {
  readonly repository: Repository
  readonly allBranches: ReadonlyArray<Branch>
  readonly currentBranch: Branch | null
  readonly defaultBranch: Branch | null
  readonly dispatcher: IBulkBranchDeleteDispatcher
}

interface IBulkBranchDeleteState {
  readonly expanded: boolean
  readonly reviewedNames: ReadonlySet<string>
  readonly confirming: boolean
  readonly busy: boolean
  readonly results: ReadonlyArray<IReviewedBranchDeletionResult>
  readonly error: ILocalizedMessage | string | null
  readonly languageMode: LanguageMode
  /**
   * Determinate progress across the serial per-branch `git update-ref -d`
   * runs. Null when no deletion is in flight.
   */
  readonly progress: IBulkBranchDeleteProgress | null
}

interface IBulkBranchDeleteProgress {
  readonly completed: number
  readonly total: number
  /** Name of the branch that just settled, for the detail line. */
  readonly lastName: string | null
}

export class BulkBranchDelete extends React.Component<
  IBulkBranchDeleteProps,
  IBulkBranchDeleteState
> {
  /** Guards the streamed per-branch callbacks against a late unmount. */
  private isMounted = false

  public constructor(props: IBulkBranchDeleteProps) {
    super(props)
    this.state = {
      expanded: false,
      reviewedNames: new Set(),
      confirming: false,
      busy: false,
      results: [],
      error: null,
      languageMode: getPersistedLanguageMode(),
      progress: null,
    }
  }

  public componentDidMount(): void {
    this.isMounted = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount(): void {
    this.isMounted = false
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.state.languageMode)
  }

  private renderMessage(message: ILocalizedMessage): JSX.Element {
    return (
      <LocalizedText
        translationKey={message.key}
        variables={message.variables}
        languageMode={this.state.languageMode}
      />
    )
  }

  public componentDidUpdate(prevProps: IBulkBranchDeleteProps): void {
    if (
      prevProps.repository.id !== this.props.repository.id ||
      prevProps.allBranches !== this.props.allBranches
    ) {
      const candidates = new Set(this.candidates.map(branch => branch.name))
      this.setState(state => ({
        reviewedNames: new Set(
          [...state.reviewedNames].filter(name => candidates.has(name))
        ),
        confirming: false,
      }))
    }
  }

  private get candidates(): ReadonlyArray<Branch> {
    return this.props.allBranches.filter(
      branch =>
        branch.type === BranchType.Local &&
        branch.name !== this.props.currentBranch?.name &&
        branch.name !== this.props.defaultBranch?.name
    )
  }

  private toggleExpanded = () =>
    this.setState(state => ({
      expanded: !state.expanded,
      confirming: false,
      error: null,
    }))

  private onReviewedChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const name = event.currentTarget.dataset.branchName
    if (name === undefined) {
      return
    }
    const reviewedNames = new Set(this.state.reviewedNames)
    if (event.currentTarget.checked) {
      if (reviewedNames.size >= MaximumReviewedBranchDeletions) {
        this.setState({
          error: {
            key: 'bulkBranchDelete.limitError',
            variables: { count: String(MaximumReviewedBranchDeletions) },
          },
        })
        return
      }
      reviewedNames.add(name)
    } else {
      reviewedNames.delete(name)
    }
    this.setState({ reviewedNames, confirming: false, error: null })
  }

  private selectAll = () =>
    this.setState({
      reviewedNames: new Set(
        this.candidates
          .slice(0, MaximumReviewedBranchDeletions)
          .map(branch => branch.name)
      ),
      confirming: false,
      error: null,
    })

  private selectNone = () =>
    this.setState({
      reviewedNames: new Set(),
      confirming: false,
      error: null,
    })

  private requestConfirmation = () =>
    this.setState({ confirming: true, error: null })
  private cancelConfirmation = () => this.setState({ confirming: false })

  /**
   * Append each branch's outcome as it settles instead of holding the whole
   * results list back until the serial loop finishes.
   */
  private onBranchDeleted = (
    completed: number,
    total: number,
    result: IReviewedBranchDeletionResult
  ) => {
    if (!this.isMounted) {
      return
    }
    this.setState(state => ({
      progress: { completed, total, lastName: result.name },
      results: [...state.results, result],
    }))
  }

  /**
   * Replaces the static "Deleting…" paragraph. The count is known before the
   * first spawn, so this is determinate from the very first frame.
   */
  private renderDeleteProgress() {
    if (!this.state.busy) {
      return null
    }

    const progress = this.state.progress
    const total = progress?.total ?? this.state.reviewedNames.size
    const completed = progress?.completed ?? 0

    return (
      <OperationProgressRow
        className="bulk-branch-delete-progress"
        label={this.accessibleText('bulkBranchDelete.progressLabel')}
        description={translate(
          'bulkBranchDelete.progressStatus',
          this.state.languageMode,
          { completed: String(completed), total: String(total) }
        )}
        value={completed}
        max={total}
        countText={`${completed}/${total}`}
        detail={
          progress?.lastName == null
            ? undefined
            : translate(
                'bulkBranchDelete.progressCurrent',
                this.state.languageMode,
                { name: progress.lastName }
              )
        }
      />
    )
  }

  private confirmDelete = async () => {
    try {
      const candidates = new Map(
        this.candidates.map(branch => [branch.name, branch] as const)
      )
      const reviewed = [...this.state.reviewedNames].map(name => {
        const branch = candidates.get(name)
        if (branch === undefined) {
          throw new ReviewedBranchListChangedError()
        }
        return { name, expectedSha: branch.tip.sha }
      })
      this.setState({
        busy: true,
        confirming: false,
        error: null,
        results: [],
        progress: { completed: 0, total: reviewed.length, lastName: null },
      })
      const results = await this.props.dispatcher.deleteReviewedBranches(
        this.props.repository,
        reviewed,
        this.onBranchDeleted
      )
      this.setState({
        busy: false,
        reviewedNames: new Set(),
        results,
        progress: null,
      })
    } catch (error) {
      this.setState({
        busy: false,
        progress: null,
        error:
          error instanceof ReviewedBranchListChangedError
            ? { key: 'bulkBranchDelete.reviewChangedError' }
            : error instanceof Error
            ? error.message
            : { key: 'bulkBranchDelete.deleteError' },
      })
    }
  }

  public render() {
    const count = this.state.reviewedNames.size
    const countVariables = { count: String(count) }
    return (
      <section
        className="bulk-branch-delete"
        aria-label={this.accessibleText('bulkBranchDelete.aria')}
      >
        <Button
          size="small"
          ariaExpanded={this.state.expanded}
          onClick={this.toggleExpanded}
        >
          <LocalizedText
            translationKey={
              this.state.expanded
                ? 'bulkBranchDelete.closeAction'
                : 'bulkBranchDelete.openAction'
            }
            languageMode={this.state.languageMode}
          />
        </Button>
        {this.state.expanded ? (
          <div className="bulk-branch-delete-panel">
            <header>
              <div>
                <strong>
                  <LocalizedText
                    translationKey="bulkBranchDelete.reviewTitle"
                    languageMode={this.state.languageMode}
                  />
                </strong>
                <span>
                  <LocalizedText
                    translationKey="bulkBranchDelete.protectedDescription"
                    languageMode={this.state.languageMode}
                  />
                </span>
              </div>
              <div>
                <Button size="small" onClick={this.selectAll}>
                  <LocalizedText
                    translationKey="bulkBranchDelete.selectAll"
                    languageMode={this.state.languageMode}
                  />
                </Button>
                <Button size="small" onClick={this.selectNone}>
                  <LocalizedText
                    translationKey="bulkBranchDelete.selectNone"
                    languageMode={this.state.languageMode}
                  />
                </Button>
              </div>
            </header>
            {this.candidates.length === 0 ? (
              <p>
                <LocalizedText
                  translationKey="bulkBranchDelete.empty"
                  languageMode={this.state.languageMode}
                />
              </p>
            ) : (
              <div
                className="bulk-branch-delete-list"
                role="group"
                aria-label={this.accessibleText('bulkBranchDelete.listAria')}
              >
                {this.candidates.map(branch => (
                  <label key={branch.name}>
                    <input
                      type="checkbox"
                      data-branch-name={branch.name}
                      checked={this.state.reviewedNames.has(branch.name)}
                      disabled={this.state.busy}
                      onChange={this.onReviewedChanged}
                    />
                    <span>{branch.name}</span>
                    <code>{branch.tip.sha.slice(0, 12)}</code>
                  </label>
                ))}
              </div>
            )}
            <Button
              className="destructive"
              disabled={count === 0 || this.state.busy}
              onClick={this.requestConfirmation}
            >
              <LocalizedText
                translationKey="bulkBranchDelete.reviewDeletion"
                variables={countVariables}
                languageMode={this.state.languageMode}
              />
            </Button>
            {this.state.confirming ? (
              <div
                className="bulk-branch-delete-confirmation"
                role="alertdialog"
              >
                <strong>
                  <LocalizedText
                    translationKey={
                      count === 1
                        ? 'bulkBranchDelete.confirmSingular'
                        : 'bulkBranchDelete.confirmPlural'
                    }
                    variables={countVariables}
                    languageMode={this.state.languageMode}
                  />
                </strong>
                <p>
                  <LocalizedText
                    translationKey="bulkBranchDelete.remoteUnaffected"
                    languageMode={this.state.languageMode}
                  />
                </p>
                <div>
                  <Button className="destructive" onClick={this.confirmDelete}>
                    <LocalizedText
                      translationKey="bulkBranchDelete.deleteReviewed"
                      languageMode={this.state.languageMode}
                    />
                  </Button>
                  <Button onClick={this.cancelConfirmation}>
                    <LocalizedText
                      translationKey="bulkBranchDelete.goBack"
                      languageMode={this.state.languageMode}
                    />
                  </Button>
                </div>
              </div>
            ) : null}
            {this.renderDeleteProgress()}
            {this.state.error !== null ? (
              <p role="alert">
                {typeof this.state.error === 'string'
                  ? this.state.error
                  : this.renderMessage(this.state.error)}
              </p>
            ) : null}
            {this.state.results.length > 0 ? (
              <ul
                className="bulk-branch-delete-results"
                aria-label={this.accessibleText('bulkBranchDelete.resultsAria')}
              >
                {this.state.results.map(result => (
                  <li key={result.name} className={result.status}>
                    <strong>{result.name}</strong> — {result.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    )
  }
}
