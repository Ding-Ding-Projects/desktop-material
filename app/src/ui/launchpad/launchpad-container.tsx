import * as React from 'react'
import { Disposable } from 'event-kit'

import { Repository } from '../../models/repository'
import { IRepositoryState } from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'
import { TipState } from '../../models/tip'
import { getPullRequestCommitRef } from '../../models/pull-request'
import {
  APICheckConclusion,
  APICheckStatus,
} from '../../lib/api'
import { ICombinedRefCheck } from '../../lib/ci-checks/ci-checks'
import {
  ILaunchpadItemIdentity,
  LaunchpadItem,
  LaunchpadProviderItemKey,
  buildLaunchpadSections,
  LaunchpadUnavailable,
  LaunchpadNotApplicable,
  launchpadValue,
} from '../../lib/launchpad/launchpad-model'
import {
  LaunchpadPreferencesStore,
  ILaunchpadSnoozePreference,
} from '../../lib/launchpad/launchpad-preferences'
import {
  LaunchpadSnoozeDurationMs,
  LaunchpadView,
} from './launchpad-view'

interface ILaunchpadContainerProps {
  readonly repository: Repository
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
}

interface ILaunchpadContainerState {
  /** Combined ref check per pull request commit ref, as it becomes known. */
  readonly ciChecksByRef: ReadonlyMap<string, ICombinedRefCheck | null>
  readonly pinnedItemKeys: ReadonlySet<LaunchpadProviderItemKey>
  readonly snoozedItemKeys: ReadonlySet<LaunchpadProviderItemKey>
  readonly now: number
}

type ContainerCIStatus =
  | 'queued'
  | 'in-progress'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'action-required'

function ciStatusFromCheck(
  check: ICombinedRefCheck | null | undefined
): ContainerCIStatus | null {
  if (check === null || check === undefined) {
    return null
  }
  if (check.status === APICheckStatus.Queued) {
    return 'queued'
  }
  if (check.status === APICheckStatus.InProgress) {
    return 'in-progress'
  }
  switch (check.conclusion) {
    case APICheckConclusion.Success:
    case APICheckConclusion.Neutral:
    case APICheckConclusion.Skipped:
      return 'succeeded'
    case APICheckConclusion.Failure:
    case APICheckConclusion.TimedOut:
    case APICheckConclusion.Stale:
      return 'failed'
    case APICheckConclusion.Canceled:
      return 'cancelled'
    case APICheckConclusion.ActionRequired:
      return 'action-required'
    default:
      return null
  }
}

/**
 * Builds the Launchpad (issue #128) from data sources this app already
 * fetches for the selected repository:
 *
 *  - Open pull requests (`state.branchesState.openPullRequests`), populated
 *    by the existing `PullRequestCoordinator` / `PullRequestStore`.
 *  - Per pull request CI status, via the existing `CommitStatusStore`
 *    (reached through `dispatcher.subscribeToCommitStatus`, the same path
 *    the pull request list and PR badge already use).
 *  - Local work in progress and an in-progress merge/rebase conflict for the
 *    checked out branch, via `state.changesState`.
 *
 * Data this app does not already fetch in bulk - PR assignees/reviewers and
 * PR-level mergeable state - is reported as `unavailable` rather than
 * fabricated. See the Launchpad section of the R11 (#128) implementation
 * notes for the full list.
 */
export class LaunchpadContainer extends React.Component<
  ILaunchpadContainerProps,
  ILaunchpadContainerState
> {
  private readonly preferences: LaunchpadPreferencesStore
  private readonly subscriptions = new Map<string, Disposable>()
  private nowTimer: number | null = null

  public constructor(props: ILaunchpadContainerProps) {
    super(props)
    this.preferences = new LaunchpadPreferencesStore(
      launchpadPreferencesNamespace(props.repository)
    )
    this.state = {
      ciChecksByRef: new Map(),
      pinnedItemKeys: new Set(this.preferences.getPinnedItemKeys()),
      snoozedItemKeys: new Set(
        this.preferences
          .getSnoozedItems()
          .map((snooze: ILaunchpadSnoozePreference) => snooze.itemKey)
      ),
      now: Date.now(),
    }
  }

  public componentDidMount() {
    this.subscribeToPullRequestChecks()
    // The age column and expired snoozes both need a redraw as time passes.
    this.nowTimer = window.setInterval(() => {
      this.setState({ now: Date.now() })
      this.refreshSnoozes()
    }, 60_000)
  }

  public componentDidUpdate(prevProps: ILaunchpadContainerProps) {
    if (
      prevProps.repository.gitHubRepository?.dbID !==
        this.props.repository.gitHubRepository?.dbID ||
      prevProps.state.branchesState.openPullRequests !==
        this.props.state.branchesState.openPullRequests
    ) {
      this.subscribeToPullRequestChecks()
    }
  }

  public componentWillUnmount() {
    this.subscriptions.forEach(disposable => disposable.dispose())
    this.subscriptions.clear()
    if (this.nowTimer !== null) {
      window.clearInterval(this.nowTimer)
    }
  }

  private refreshSnoozes() {
    this.setState({
      snoozedItemKeys: new Set(
        this.preferences
          .getSnoozedItems()
          .map((snooze: ILaunchpadSnoozePreference) => snooze.itemKey)
      ),
    })
  }

  private subscribeToPullRequestChecks() {
    const { dispatcher, repository, state } = this.props
    const ghRepository = repository.gitHubRepository
    this.subscriptions.forEach(disposable => disposable.dispose())
    this.subscriptions.clear()

    if (ghRepository === null) {
      return
    }

    for (const pr of state.branchesState.openPullRequests) {
      const ref = getPullRequestCommitRef(pr.pullRequestNumber)
      const initial = dispatcher.tryGetCommitStatus(ghRepository, ref)
      this.setCheckForRef(ref, initial)

      const disposable = dispatcher.subscribeToCommitStatus(
        ghRepository,
        ref,
        check => this.setCheckForRef(ref, check)
      )
      this.subscriptions.set(ref, disposable)
    }
  }

  private setCheckForRef(ref: string, check: ICombinedRefCheck | null) {
    this.setState(prev => {
      const next = new Map(prev.ciChecksByRef)
      next.set(ref, check)
      return { ciChecksByRef: next }
    })
  }

  private buildItems(): ReadonlyArray<LaunchpadItem> {
    const { repository, state } = this.props
    const ghRepository = repository.gitHubRepository
    const items: LaunchpadItem[] = []

    if (ghRepository !== null) {
      const endpointId = ghRepository.owner.endpoint
      const repositoryId = String(ghRepository.dbID)

      for (const pr of state.branchesState.openPullRequests) {
        const identity: ILaunchpadItemIdentity<'pull-request'> = {
          endpointId,
          accountId: pr.author,
          repositoryId,
          kind: 'pull-request',
          itemId: String(pr.pullRequestNumber),
        }

        const ref = getPullRequestCommitRef(pr.pullRequestNumber)
        const check = this.state.ciChecksByRef.get(ref)
        const ciStatus = ciStatusFromCheck(check)
        const readyToMerge =
          !pr.draft && ciStatus === 'succeeded'
            ? launchpadValue(true)
            : ciStatus === null
            ? LaunchpadUnavailable
            : launchpadValue(false)

        items.push({
          kind: 'pull-request',
          identity,
          title: pr.title,
          updatedAt: launchpadValue(pr.created.toISOString()),
          referenceNumber: launchpadValue(pr.pullRequestNumber),
          branchName: launchpadValue(pr.head.ref),
          webUrl:
            ghRepository.htmlURL === null
              ? LaunchpadUnavailable
              : launchpadValue(
                  `${ghRepository.htmlURL}/pull/${pr.pullRequestNumber}`
                ),
          // Additions/deletions per pull request aren't part of the bulk
          // pull request fetch this app already does, so this is reported
          // honestly rather than estimated.
          diffStat: LaunchpadUnavailable,
          ciStatus: ciStatus === null ? LaunchpadUnavailable : launchpadValue(ciStatus),
          attention: {
            readyToMerge,
            // PR assignees aren't part of the bulk pull request fetch either.
            assignment: LaunchpadUnavailable,
            // PR-level mergeable state requires a per-PR API call this app
            // doesn't already make in bulk.
            mergeConflict: LaunchpadUnavailable,
          },
        })
      }
    }

    const tip = state.branchesState.tip
    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null
    const workingDirectory = state.changesState.workingDirectory
    const hasUncommittedChanges = workingDirectory.files.length > 0
    const conflictState = state.changesState.conflictState

    if (currentBranchName !== null && hasUncommittedChanges) {
      const endpointId = ghRepository?.owner.endpoint ?? 'local'
      const identity: ILaunchpadItemIdentity<'local-wip'> = {
        endpointId,
        accountId: 'local',
        repositoryId: repository.path,
        kind: 'local-wip',
        itemId: currentBranchName,
      }

      items.push({
        kind: 'local-wip',
        identity,
        title: `${currentBranchName} (uncommitted changes)`,
        updatedAt: LaunchpadUnavailable,
        referenceNumber: LaunchpadNotApplicable,
        branchName: launchpadValue(currentBranchName),
        webUrl: LaunchpadNotApplicable,
        // Per-file diff stats are tracked, but not their line counts - this
        // app doesn't compute working directory numstat totals today.
        diffStat: LaunchpadUnavailable,
        ciStatus: LaunchpadNotApplicable,
        attention: {
          readyToMerge: LaunchpadNotApplicable,
          assignment: LaunchpadNotApplicable,
          mergeConflict:
            conflictState !== null
              ? launchpadValue('conflicted')
              : launchpadValue('conflict-free'),
        },
      })
    }

    return items
  }

  private onPinChange = (
    itemKey: LaunchpadProviderItemKey,
    shouldPin: boolean
  ) => {
    if (shouldPin) {
      this.preferences.pin(itemKey)
    } else {
      this.preferences.unpin(itemKey)
    }
    this.setState({
      pinnedItemKeys: new Set(this.preferences.getPinnedItemKeys()),
    })
  }

  private onSnooze = (
    itemKey: LaunchpadProviderItemKey,
    durationMs: LaunchpadSnoozeDurationMs
  ) => {
    this.preferences.snooze(itemKey, Date.now() + durationMs)
    this.refreshSnoozes()
  }

  public render() {
    const items = this.buildItems()
    const result = buildLaunchpadSections(
      items,
      this.state.pinnedItemKeys,
      this.state.snoozedItemKeys
    )

    return (
      <LaunchpadView
        result={result}
        now={this.state.now}
        onPinChange={this.onPinChange}
        onSnooze={this.onSnooze}
      />
    )
  }
}

function launchpadPreferencesNamespace(repository: Repository): string {
  const ghRepository = repository.gitHubRepository
  if (ghRepository !== null) {
    return `github-repository:${ghRepository.dbID}`
  }
  return `local-repository:${repository.path}`
}
