import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { Button } from '../lib/button'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Repositoryish } from '../repositories-list/group-repositories'
import {
  emitRepositoryGroupNotice,
  IRepositoryGroupAssignment,
  normalizeRepositoryGroupName,
  planRepositoryGroupAssignments,
  planRepositoryGroupRemoval,
  repositoriesInCustomGroup,
} from '../repositories-list/repository-group-actions'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'

interface IManageRepositoryGroupDialogProps {
  readonly dispatcher: Dispatcher
  /** Every repository the list knows about, grouped or not. */
  readonly repositories: ReadonlyArray<Repositoryish>
  /** The group being edited, or null to create a new one. */
  readonly groupName: string | null
  readonly onDismissed: () => void
}

interface IManageRepositoryGroupDialogState {
  readonly name: string
  readonly selectedIds: ReadonlySet<number>
  readonly query: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly languageMode: LanguageMode
}

/** The persistence id, audit identity, and regex-builder binding for the search. */
const RepositoryGroupFilterListId = 'repository-group-members'

const ListId = 'repository-group-member-list'

/** Every literal name this repository can be searched by. */
function repositoryMatchKeys(repository: Repository): ReadonlyArray<string> {
  return [
    repository.name,
    repository.alias ?? '',
    repository.gitHubRepository?.fullName ?? '',
    repository.path,
  ]
}

/**
 * Create, rename, re-populate, or dissolve a custom repository group.
 *
 * Before this existed a group could only be *implied*: you renamed one
 * repository's group at a time and hoped you spelled it identically, and the
 * only way back out was per-repository "Restore group name". This is the
 * explicit surface — name the group once, tick who belongs to it, and remove it
 * in one action.
 *
 * Removal is deliberately not confirmation-gated, because it is not
 * destructive: dissolving a group writes `null` into each member's group label
 * and stops. No repository is removed from the list, nothing on disk is touched,
 * and the hint below the picker says exactly that before the button is pressed.
 *
 * The member picker carries the app's standard search stack: plain text by
 * default, substring and regex as explicit opt-ins through the shared
 * `FilterModeControl` and its regex builder, and an invalid pattern that reports
 * itself without hiding a repository the user might be trying to tick.
 */
export class ManageRepositoryGroupDialog extends React.Component<
  IManageRepositoryGroupDialogProps,
  IManageRepositoryGroupDialogState
> {
  public constructor(props: IManageRepositoryGroupDialogProps) {
    super(props)
    const members =
      props.groupName === null
        ? []
        : repositoriesInCustomGroup(props.repositories, props.groupName)
    this.state = {
      name: props.groupName ?? '',
      selectedIds: new Set(members.map(repository => repository.id)),
      query: '',
      filterMode: readPersistedFilterMode(RepositoryGroupFilterListId),
      filterCaseSensitive: false,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
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

  private text(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, this.state.languageMode, variables)
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.state.languageMode)
  }

  /** Every repository that can carry a group label, in list order. */
  private get groupable(): ReadonlyArray<Repository> {
    return this.props.repositories.filter(
      (repository): repository is Repository => repository instanceof Repository
    )
  }

  /**
   * The rows to paint plus the regex-engine complaint, if any.
   *
   * An invalid pattern never empties the picker: the shared matcher returns
   * every repository untouched alongside the error, so a half-typed expression
   * cannot hide a repository whose box the user already ticked.
   */
  private getResults(): {
    readonly repositories: ReadonlyArray<Repository>
    readonly regexError: string | null
  } {
    const all = this.groupable
    if (this.state.query.trim().length === 0) {
      return { repositories: all, regexError: null }
    }

    const { results, regexError } = matchWithMode(
      this.state.query.trim(),
      all,
      repositoryMatchKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )
    const matched = new Set(results.map(result => result.item))
    return {
      repositories: all.filter(repository => matched.has(repository)),
      regexError,
    }
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.currentTarget.value })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(RepositoryGroupFilterListId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChange = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.groupable.map(repository =>
      repositoryMatchKeys(repository).join(' · ')
    )

  private onMemberToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const id = Number(event.currentTarget.value)
    const checked = event.currentTarget.checked
    if (!Number.isInteger(id)) {
      return
    }
    this.setState(state => {
      const selectedIds = new Set(state.selectedIds)
      if (checked) {
        selectedIds.add(id)
      } else {
        selectedIds.delete(id)
      }
      return { selectedIds }
    })
  }

  /**
   * Apply a planned set of label writes.
   *
   * Every write goes through the reviewed `changeRepositoryGroupName` path, so
   * the group label is the only field that can change; a failure is reported as
   * a notice rather than swallowed.
   */
  private applyAssignments(
    assignments: ReadonlyArray<IRepositoryGroupAssignment>,
    notice: string
  ) {
    Promise.all(
      assignments.map(assignment =>
        this.props.dispatcher.changeRepositoryGroupName(
          assignment.repository,
          assignment.groupName
        )
      )
    )
      .then(() => emitRepositoryGroupNotice(notice))
      .catch(error => {
        log.error('Failed to update repository group', error)
        emitRepositoryGroupNotice(this.text('repositoryGroups.actionFailed'))
      })
    this.props.onDismissed()
  }

  private onSubmit = () => {
    const name = normalizeRepositoryGroupName(this.state.name)
    if (name === null) {
      return
    }
    const assignments = planRepositoryGroupAssignments(
      this.props.repositories,
      this.props.groupName,
      name,
      this.state.selectedIds
    )
    const count = String(this.state.selectedIds.size)
    this.applyAssignments(
      assignments,
      this.text(
        this.props.groupName === null
          ? 'repositoryGroups.createdStatus'
          : 'repositoryGroups.updatedStatus',
        { group: name, count }
      )
    )
  }

  private onRemoveGroup = () => {
    const { groupName } = this.props
    if (groupName === null) {
      return
    }
    const assignments = planRepositoryGroupRemoval(
      this.props.repositories,
      groupName
    )
    this.applyAssignments(
      assignments,
      this.text('repositoryGroups.removedStatus', {
        group: groupName,
        count: String(assignments.length),
      })
    )
  }

  private renderMember(repository: Repository) {
    const checked = this.state.selectedIds.has(repository.id)
    return (
      <li key={repository.id} className="repository-group-member">
        <label aria-label={`${nameOf(repository)}. ${repository.path}`}>
          <input
            type="checkbox"
            value={String(repository.id)}
            checked={checked}
            onChange={this.onMemberToggle}
          />
          <span className="repository-group-member-copy">
            <strong>{nameOf(repository)}</strong>
            <span className="repository-group-member-path">
              {repository.path}
            </span>
          </span>
        </label>
      </li>
    )
  }

  public render() {
    const isEditing = this.props.groupName !== null
    const { repositories: results, regexError } = this.getResults()
    const total = this.groupable.length
    const isFiltering = this.state.query.trim().length > 0
    const titleKey: TranslationKey = isEditing
      ? 'repositoryGroups.editTitle'
      : 'repositoryGroups.createTitle'
    const disabled = normalizeRepositoryGroupName(this.state.name) === null

    return (
      <Dialog
        id="manage-repository-group"
        title={
          <>
            <span aria-hidden="true">{this.text(titleKey)}</span>
            <span className="sr-only">{this.accessibleText(titleKey)}</span>
          </>
        }
        ariaDescribedBy="manage-repository-group-intro"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p id="manage-repository-group-intro">
            {isEditing
              ? this.text('repositoryGroups.editIntro', {
                  group: this.props.groupName ?? '',
                  count: String(
                    repositoriesInCustomGroup(
                      this.props.repositories,
                      this.props.groupName ?? ''
                    ).length
                  ),
                })
              : this.text('repositoryGroups.createIntro')}
          </p>
          <TextBox
            label={this.text('repositoryGroups.nameLabel')}
            ariaLabel={this.accessibleText('repositoryGroups.nameLabel')}
            value={this.state.name}
            autoFocus={true}
            onValueChanged={this.onNameChanged}
          />

          <div className="repository-group-members-field">
            <span
              className="repository-group-members-label"
              aria-hidden="true"
              id="repository-group-members-label"
            >
              {this.text('repositoryGroups.membersLabel')}
            </span>
            <div className="repository-group-filter-row" role="search">
              <input
                data-search-surface-id="repository-group-members"
                className="repository-group-filter-input"
                type="search"
                aria-label={this.accessibleText('repositoryGroups.searchLabel')}
                aria-controls={ListId}
                autoComplete="off"
                placeholder={this.text('repositoryGroups.searchPlaceholder')}
                value={this.state.query}
                onChange={this.onQueryChange}
              />
              <FilterModeControl
                searchSurfaceId="repository-group-members"
                mode={this.state.filterMode}
                caseSensitive={this.state.filterCaseSensitive}
                onModeChange={this.onFilterModeChange}
                onCaseSensitiveChange={this.onFilterCaseSensitiveChange}
                regexBuilderTarget={this.accessibleText(
                  'repositoryGroups.searchTarget'
                )}
                getSampleItems={this.getFilterSampleItems}
                filterText={this.state.query}
                onRegexPatternApply={this.onRegexPatternApply}
              />
            </div>

            {regexError !== null && (
              <p className="repository-group-error" role="alert">
                {this.text('repositoryGroups.regexError', {
                  message: regexError,
                })}
              </p>
            )}

            {results.length === 0 ? (
              <p className="repository-group-empty">
                {this.text(
                  isFiltering
                    ? 'repositoryGroups.noMatches'
                    : 'repositoryGroups.empty'
                )}
              </p>
            ) : (
              <ul
                id={ListId}
                className="repository-group-member-list"
                aria-labelledby="repository-group-members-label"
              >
                {results.map(repository => this.renderMember(repository))}
              </ul>
            )}

            <p className="repository-group-count" role="status">
              {this.text('repositoryGroups.selectedCount', {
                selected: String(this.state.selectedIds.size),
                total: String(total),
              })}
            </p>
          </div>

          <p className="description">
            {this.text('repositoryGroups.removeHint')}
          </p>
        </DialogContent>
        <DialogFooter>
          {isEditing && (
            <Button
              type="button"
              className="repository-group-remove"
              ariaLabel={this.accessibleText('repositoryGroups.removeAction')}
              inferTooltip={false}
              onClick={this.onRemoveGroup}
            >
              {this.text('repositoryGroups.removeAction')}
            </Button>
          )}
          <OkCancelButtonGroup
            okButtonText={this.text(
              isEditing
                ? 'repositoryGroups.saveAction'
                : 'repositoryGroups.createAction'
            )}
            okButtonAriaLabel={this.accessibleText(
              isEditing
                ? 'repositoryGroups.saveAction'
                : 'repositoryGroups.createAction'
            )}
            okButtonDisabled={disabled}
            cancelButtonText={this.text('repositoryGroups.cancelAction')}
            cancelButtonAriaLabel={this.accessibleText(
              'repositoryGroups.cancelAction'
            )}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
