import * as React from 'react'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { IRemote } from '../../models/remote'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../dispatcher'
import { getRemotes, IManagedSubtree } from '../../lib/git'
import { getPreferredGenericCloneAccountKey } from '../../lib/automation/clone-account-fallback'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Loading } from '../lib/loading'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'

/** The per-surface persistence id for the subtree search's filter mode. */
const SubtreesFilterId = 'subtree-manager'

/**
 * The Select value for the free-URL source fallback. Git remotes can never
 * have an empty name so this cannot collide with a real remote.
 */
const CustomUrlSource = ''

type SubtreeRowAction = 'pull' | 'push' | 'split'

interface ISubtreeManagerDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /** The signed-in accounts used to resolve a credential for the source. */
  readonly accounts: ReadonlyArray<Account>
  readonly onDismissed: () => void

  /** Overrides remote discovery, primarily for tests. */
  readonly listRemotes?: (
    repository: Repository
  ) => Promise<ReadonlyArray<IRemote>>
}

interface ISubtreeManagerDialogState {
  /** The discovered subtrees, or null until the first load resolves. */
  readonly subtrees: ReadonlyArray<IManagedSubtree> | null

  /** True while the subtree list is (re)loading. */
  readonly isLoading: boolean

  /** Whether the bundled Git ships `git subtree`, or null while probing. */
  readonly subtreeAvailable: boolean | null

  /** The repository's named remotes, offered as pull/push sources. */
  readonly remotes: ReadonlyArray<IRemote>

  /** The prefixes of subtrees with an in-flight per-row operation. */
  readonly busyPrefixes: ReadonlySet<string>

  /** The latest streamed progress line from an operation, if any. */
  readonly progress: string | null

  /** The most recent operation error, surfaced inline. */
  readonly error: string | null

  /** The most recent operation success summary, surfaced inline. */
  readonly notice: string | null

  /** Free-text query narrowing the list by prefix. */
  readonly filterText: string

  /** The text-match strategy for the search field. */
  readonly filterMode: FilterMode

  /** Whether Substring / Regex matching is case sensitive. */
  readonly filterCaseSensitive: boolean

  /** The prefix whose inline action editor is expanded, if any. */
  readonly expandedPrefix: string | null

  /** The action the expanded inline editor collects input for. */
  readonly expandedAction: SubtreeRowAction | null

  /** The chosen remote name, or {@link CustomUrlSource} for a free URL. */
  readonly sourceRemote: string

  /** The free source URL used when {@link CustomUrlSource} is chosen. */
  readonly sourceUrl: string

  /** The upstream ref a pull merges from or a push publishes to. */
  readonly ref: string

  /** Whether a pull imports the upstream history as one squashed commit. */
  readonly squash: boolean

  /** The new local branch name recording a split result. */
  readonly splitBranch: string
}

/**
 * The repository-page subtree manager.
 *
 * Lists the subtrees recorded in the repository history (prefix plus the last
 * merged upstream split and the local commit recording it) and offers per-row
 * Pull / Push / Split actions through a small inline editor collecting the
 * source, ref, and options. Every action routes through the {@link Dispatcher};
 * results are reflected by reloading the list. When the bundled Git lacks
 * `git subtree` the discovery list still renders but every action is disabled.
 */
export class SubtreeManagerDialog extends React.Component<
  ISubtreeManagerDialogProps,
  ISubtreeManagerDialogState
> {
  public constructor(props: ISubtreeManagerDialogProps) {
    super(props)
    this.state = {
      subtrees: null,
      isLoading: true,
      subtreeAvailable: null,
      remotes: [],
      busyPrefixes: new Set<string>(),
      progress: null,
      error: null,
      notice: null,
      filterText: '',
      filterMode: readPersistedFilterMode(SubtreesFilterId),
      filterCaseSensitive: false,
      expandedPrefix: null,
      expandedAction: null,
      sourceRemote: CustomUrlSource,
      sourceUrl: '',
      ref: '',
      squash: false,
      splitBranch: '',
    }
  }

  public componentDidMount() {
    this.loadSubtrees()
    this.probeAvailability()
    this.loadRemotes()
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private loadSubtrees = async () => {
    this.setState({ isLoading: true })
    try {
      const subtrees = await this.props.dispatcher.getSubtrees(
        this.props.repository
      )
      this.setState({ subtrees, isLoading: false })
    } catch (e) {
      log.error(
        `SubtreeManager: unable to discover subtrees for ${this.props.repository.path}`,
        e
      )
      this.setState({
        subtrees: [],
        isLoading: false,
        error: `Could not discover subtrees: ${this.formatError(e)}`,
      })
    }
  }

  private probeAvailability = async () => {
    try {
      const subtreeAvailable = await this.props.dispatcher.isSubtreeAvailable()
      this.setState({ subtreeAvailable })
    } catch (e) {
      log.warn('SubtreeManager: unable to probe for git subtree support', e)
      this.setState({ subtreeAvailable: false })
    }
  }

  private loadRemotes = async () => {
    try {
      const list = this.props.listRemotes ?? getRemotes
      const remotes = await list(this.props.repository)
      this.setState(prev => ({
        remotes,
        sourceRemote:
          prev.expandedPrefix === null
            ? this.getDefaultSourceRemote(remotes)
            : prev.sourceRemote,
      }))
    } catch (e) {
      log.warn(
        `SubtreeManager: unable to list remotes for ${this.props.repository.path}`,
        e
      )
    }
  }

  private getDefaultSourceRemote(remotes: ReadonlyArray<IRemote>): string {
    const origin = remotes.find(remote => remote.name === 'origin')
    return origin?.name ?? remotes.at(0)?.name ?? CustomUrlSource
  }

  private setPrefixBusy(prefix: string, busy: boolean) {
    this.setState(prev => {
      const busyPrefixes = new Set(prev.busyPrefixes)
      if (busy) {
        busyPrefixes.add(prefix)
      } else {
        busyPrefixes.delete(prefix)
      }
      return { busyPrefixes }
    })
  }

  private onProgress = (line: string) => {
    this.setState({ progress: line })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(SubtreesFilterId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ filterText: pattern })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    (this.state.subtrees ?? []).map(subtree => subtree.prefix)

  private onShowAddSubtree = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddSubtree,
      repository: this.props.repository,
      onAdded: this.loadSubtrees,
    })
  }

  private onToggleAction = (
    subtree: IManagedSubtree,
    action: SubtreeRowAction
  ) => {
    const { expandedPrefix, expandedAction } = this.state
    if (expandedPrefix === subtree.prefix && expandedAction === action) {
      this.collapseEditor()
      return
    }

    this.setState({
      expandedPrefix: subtree.prefix,
      expandedAction: action,
      sourceRemote: this.getDefaultSourceRemote(this.state.remotes),
      sourceUrl: '',
      ref: '',
      squash: false,
      splitBranch: '',
      error: null,
      notice: null,
    })
  }

  private collapseEditor = () => {
    this.setState({ expandedPrefix: null, expandedAction: null })
  }

  private onSourceRemoteChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.setState({ sourceRemote: event.currentTarget.value, error: null })
  }

  private onSourceUrlChanged = (sourceUrl: string) => {
    this.setState({ sourceUrl, error: null })
  }

  private onRefChanged = (ref: string) => {
    this.setState({ ref, error: null })
  }

  private onSquashChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ squash: event.currentTarget.checked, error: null })
  }

  private onSplitBranchChanged = (splitBranch: string) => {
    this.setState({ splitBranch, error: null })
  }

  /** The chosen source resolved to a URL git and the trampoline both accept. */
  private getSelectedSource(): string {
    const { sourceRemote, sourceUrl, remotes } = this.state
    if (sourceRemote === CustomUrlSource) {
      return sourceUrl.trim()
    }
    return remotes.find(remote => remote.name === sourceRemote)?.url ?? ''
  }

  /**
   * Resolve the signed-in identity for a source URL the same way the generic
   * URL tab of the add-submodule dialog does.
   */
  private resolveAccountKey = async (
    source: string
  ): Promise<string | undefined> => {
    const account = await findAccountForRemoteURL(source, this.props.accounts)
    return getPreferredGenericCloneAccountKey(
      source,
      this.props.accounts,
      account
    )
  }

  private onConfirmPull = () => this.runRemoteAction('pull')
  private onConfirmPush = () => this.runRemoteAction('push')

  private runRemoteAction = async (action: 'pull' | 'push') => {
    const prefix = this.state.expandedPrefix
    if (prefix === null) {
      return
    }

    const source = this.getSelectedSource()
    const ref = this.state.ref.trim()
    if (source.length === 0) {
      this.setState({ error: 'Choose a remote or enter a source URL.' })
      return
    }
    if (ref.length === 0) {
      this.setState({ error: `Enter the upstream ref to ${action}.` })
      return
    }

    this.setPrefixBusy(prefix, true)
    this.setState({ error: null, notice: null, progress: null })
    try {
      const accountKey = await this.resolveAccountKey(source)
      if (action === 'pull') {
        await this.props.dispatcher.pullSubtree(
          this.props.repository,
          prefix,
          source,
          ref,
          {
            squash: this.state.squash,
            accountKey,
            progressCallback: this.onProgress,
          }
        )
      } else {
        await this.props.dispatcher.pushSubtree(
          this.props.repository,
          prefix,
          source,
          ref,
          { accountKey, progressCallback: this.onProgress }
        )
      }
      this.collapseEditor()
      this.setState({
        notice:
          action === 'pull'
            ? `Pulled ${ref} into ${prefix}.`
            : `Pushed ${prefix} to ${ref}.`,
      })
      await this.loadSubtrees()
    } catch (e) {
      this.setState({
        error: `Failed ${
          action === 'pull' ? 'pulling' : 'pushing'
        } ${prefix}: ${this.formatError(e)}`,
      })
    } finally {
      this.setPrefixBusy(prefix, false)
      this.setState({ progress: null })
    }
  }

  private onConfirmSplit = async () => {
    const prefix = this.state.expandedPrefix
    if (prefix === null) {
      return
    }

    const branch = this.state.splitBranch.trim()
    if (branch.length === 0) {
      this.setState({
        error: 'Enter a branch name to record the split result.',
      })
      return
    }

    this.setPrefixBusy(prefix, true)
    this.setState({ error: null, notice: null })
    try {
      const sha = await this.props.dispatcher.splitSubtree(
        this.props.repository,
        prefix,
        { branch }
      )
      this.collapseEditor()
      this.setState({
        notice: `Split ${prefix} into branch ${branch} at ${sha.slice(0, 8)}.`,
      })
      await this.loadSubtrees()
    } catch (e) {
      this.setState({
        error: `Failed splitting ${prefix}: ${this.formatError(e)}`,
      })
    } finally {
      this.setPrefixBusy(prefix, false)
    }
  }

  private renderAvailabilityError(): JSX.Element | null {
    if (this.state.subtreeAvailable !== false) {
      return null
    }

    return (
      <DialogError>
        The bundled Git does not ship the `git subtree` command, so pull, push,
        split, and add are disabled. Subtrees recorded in the history are still
        listed below.
      </DialogError>
    )
  }

  private renderFilterControls(): JSX.Element | null {
    const { subtrees } = this.state
    if (subtrees === null || subtrees.length === 0) {
      return null
    }

    return (
      <div className="subtrees-filter-row">
        <div className="subtrees-filter-search">
          <TextBox
            className="subtrees-filter-text"
            placeholder="Search subtrees by prefix"
            ariaLabel="Search subtrees"
            value={this.state.filterText}
            onValueChanged={this.onFilterTextChanged}
          />
          <FilterModeControl
            mode={this.state.filterMode}
            caseSensitive={this.state.filterCaseSensitive}
            onModeChange={this.onFilterModeChanged}
            onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
            regexBuilderTarget="Subtrees"
            getSampleItems={this.getFilterSampleItems}
            filterText={this.state.filterText}
            onRegexPatternApply={this.onRegexPatternApply}
          />
        </div>
      </div>
    )
  }

  private getVisibleSubtrees(
    subtrees: ReadonlyArray<IManagedSubtree>
  ): ReadonlyArray<IManagedSubtree> {
    const { filterText, filterMode, filterCaseSensitive } = this.state
    const query = filterText.trim()

    if (query.length === 0) {
      return subtrees
    }

    const { results } = matchWithMode(
      query,
      subtrees,
      subtree => [subtree.prefix],
      { mode: filterMode, caseSensitive: filterCaseSensitive }
    )

    return results.map(result => result.item)
  }

  private renderSourceEditor(): JSX.Element {
    const { remotes, sourceRemote } = this.state

    return (
      <>
        <Select
          label="Source"
          value={sourceRemote}
          onChange={this.onSourceRemoteChanged}
        >
          {remotes.map(remote => (
            <option key={remote.name} value={remote.name}>
              {remote.name} — {remote.url}
            </option>
          ))}
          <option value={CustomUrlSource}>Custom URL…</option>
        </Select>
        {sourceRemote === CustomUrlSource && (
          <TextBox
            label="Source URL"
            placeholder="https://github.com/owner/repository.git"
            value={this.state.sourceUrl}
            onValueChanged={this.onSourceUrlChanged}
            spellcheck={false}
          />
        )}
      </>
    )
  }

  private renderEditor(
    subtree: IManagedSubtree,
    action: SubtreeRowAction,
    isBusy: boolean
  ): JSX.Element {
    if (action === 'split') {
      return (
        <div className="subtree-row-editor">
          <div className="subtree-editor-fields">
            <TextBox
              label="Branch name"
              placeholder={`${subtree.prefix.split('/').pop()}-split`}
              value={this.state.splitBranch}
              onValueChanged={this.onSplitBranchChanged}
              spellcheck={false}
              autoFocus={true}
            />
          </div>
          <p className="subtree-editor-help">
            Splits the history of {subtree.prefix} into standalone commits and
            records the result as a new local branch.
          </p>
          <div className="subtree-editor-actions">
            <Button
              type="button"
              disabled={isBusy}
              onClick={this.onConfirmSplit}
            >
              {isBusy ? <Loading /> : null}
              Split subtree
            </Button>
            <Button type="button" onClick={this.collapseEditor}>
              Cancel
            </Button>
          </div>
        </div>
      )
    }

    const confirm = action === 'pull' ? this.onConfirmPull : this.onConfirmPush

    return (
      <div className="subtree-row-editor">
        <div className="subtree-editor-fields">
          {this.renderSourceEditor()}
          <TextBox
            label="Ref"
            placeholder="main"
            value={this.state.ref}
            onValueChanged={this.onRefChanged}
            spellcheck={false}
          />
        </div>
        {action === 'pull' && (
          <Checkbox
            label="Squash the pulled history into one commit"
            value={this.state.squash ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onSquashChanged}
          />
        )}
        <div className="subtree-editor-actions">
          <Button type="button" disabled={isBusy} onClick={confirm}>
            {isBusy ? <Loading /> : null}
            {action === 'pull' ? 'Pull subtree' : 'Push subtree'}
          </Button>
          <Button type="button" onClick={this.collapseEditor}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  private renderRow(subtree: IManagedSubtree): JSX.Element {
    const isBusy = this.state.busyPrefixes.has(subtree.prefix)
    const actionsDisabled = isBusy || this.state.subtreeAvailable === false
    const expandedAction =
      this.state.expandedPrefix === subtree.prefix
        ? this.state.expandedAction
        : null

    return (
      <SubtreeRow
        key={subtree.prefix}
        subtree={subtree}
        actionsDisabled={actionsDisabled}
        expandedAction={expandedAction}
        onToggleAction={this.onToggleAction}
      >
        {expandedAction !== null &&
          this.renderEditor(subtree, expandedAction, isBusy)}
      </SubtreeRow>
    )
  }

  private renderList(): JSX.Element {
    const { subtrees, isLoading } = this.state

    if (isLoading && subtrees === null) {
      return (
        <p className="subtrees-empty">
          <Loading /> Discovering subtrees…
        </p>
      )
    }

    if (subtrees === null || subtrees.length === 0) {
      return (
        <p className="subtrees-empty">
          No subtrees are recorded in this repository's history yet.
        </p>
      )
    }

    const visible = this.getVisibleSubtrees(subtrees)

    if (visible.length === 0) {
      return (
        <p className="subtrees-empty">No subtrees match the current search.</p>
      )
    }

    return (
      <ul className="subtree-list">
        {visible.map(subtree => this.renderRow(subtree))}
      </ul>
    )
  }

  public render() {
    return (
      <Dialog
        id="subtree-manager"
        title={__DARWIN__ ? 'Subtree Manager' : 'Subtree manager'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderAvailabilityError()}
        <DialogContent>
          <div className="subtrees-manager">
            <section className="subtrees-section">
              <div className="subtrees-section-header">
                <h3 className="subtrees-section-title">
                  <Octicon symbol={octicons.gitMerge} />
                  Subtrees
                </h3>
                <div className="subtrees-header-actions">
                  <Button
                    type="button"
                    disabled={this.state.subtreeAvailable === false}
                    onClick={this.onShowAddSubtree}
                    tooltip="Choose a hosted repository or URL to add"
                  >
                    <Octicon symbol={octicons.plus} />
                    Add subtree…
                  </Button>
                </div>
              </div>
              {this.renderFilterControls()}
              {this.state.error !== null && (
                <p className="subtrees-error">{this.state.error}</p>
              )}
              {this.state.notice !== null && (
                <p className="subtrees-notice" role="status">
                  {this.state.notice}
                </p>
              )}
              {this.state.progress !== null && (
                <p className="subtrees-progress">{this.state.progress}</p>
              )}
              {this.renderList()}
            </section>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Close"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}

interface ISubtreeRowProps {
  readonly subtree: IManagedSubtree
  readonly actionsDisabled: boolean
  readonly expandedAction: SubtreeRowAction | null
  readonly onToggleAction: (
    subtree: IManagedSubtree,
    action: SubtreeRowAction
  ) => void
  readonly children?: React.ReactNode
}

/**
 * A single subtree row. Extracted so the per-row action handlers can be
 * stable callbacks bound to the subtree rather than inline arrows.
 */
function SubtreeRow(props: ISubtreeRowProps) {
  const { subtree, actionsDisabled, expandedAction } = props
  const onPull = React.useCallback(
    () => props.onToggleAction(subtree, 'pull'),
    [props.onToggleAction, subtree]
  )
  const onPush = React.useCallback(
    () => props.onToggleAction(subtree, 'push'),
    [props.onToggleAction, subtree]
  )
  const onSplit = React.useCallback(
    () => props.onToggleAction(subtree, 'split'),
    [props.onToggleAction, subtree]
  )

  const shortMergeSha = subtree.lastMergeSha
    ? subtree.lastMergeSha.slice(0, 8)
    : '—'
  const shortSplitSha = subtree.lastMergedSplitSha
    ? subtree.lastMergedSplitSha.slice(0, 8)
    : '—'

  return (
    <li className="subtree-row">
      <div className="subtree-row-body">
        <div className="subtree-row-main">
          <div className="subtree-row-heading">
            <Octicon
              className="subtree-row-icon"
              symbol={octicons.fileDirectory}
            />
            <span className="subtree-row-prefix">{subtree.prefix}</span>
          </div>
          <div className="subtree-row-meta">
            <TooltippedContent
              tagName="span"
              className="subtree-row-sha"
              tooltip={subtree.lastMergedSplitSha ?? 'No split recorded'}
            >
              <Octicon symbol={octicons.gitBranch} />
              Upstream split {shortSplitSha}
            </TooltippedContent>
            <TooltippedContent
              tagName="span"
              className="subtree-row-sha"
              tooltip={subtree.lastMergeSha ?? 'No merge recorded'}
            >
              <Octicon symbol={octicons.gitCommit} />
              Last merge {shortMergeSha}
            </TooltippedContent>
          </div>
        </div>
        <div className="subtree-row-actions">
          <Button
            type="button"
            disabled={actionsDisabled}
            onClick={onPull}
            ariaExpanded={expandedAction === 'pull'}
            tooltip="Merge the latest upstream changes into this subtree"
          >
            Pull…
          </Button>
          <Button
            type="button"
            disabled={actionsDisabled}
            onClick={onPush}
            ariaExpanded={expandedAction === 'push'}
            tooltip="Split out this subtree's history and push it upstream"
          >
            Push…
          </Button>
          <Button
            type="button"
            disabled={actionsDisabled}
            onClick={onSplit}
            ariaExpanded={expandedAction === 'split'}
            tooltip="Split this subtree's history into a new local branch"
          >
            Split…
          </Button>
        </div>
      </div>
      {props.children}
    </li>
  )
}
