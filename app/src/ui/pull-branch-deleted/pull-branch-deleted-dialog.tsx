import * as React from 'react'

import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import {
  FunnyLevelTextBase,
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { IPullBranchDeletedPlan } from '../../lib/pull-branch-deleted'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  buildPullBranchDeletedNotification,
  pullBranchDeletedBlockerKey,
} from './recovery-notification'

interface IPullBranchDeletedDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** The local branch whose remote-tracking branch no longer exists. */
  readonly branchName: string
  /** The remote that no longer advertises the branch. */
  readonly remoteName: string
  /** The branch name as it was expected to exist on that remote. */
  readonly remoteBranchName: string
  readonly onDismissed: () => void
}

interface IPullBranchDeletedDialogState {
  readonly languageMode: LanguageMode
  readonly funnyLevels: IFunnyLevels
  readonly phase: 'loading' | 'review'
  readonly plan: IPullBranchDeletedPlan | null
  readonly planFailed: boolean
  /** Deliberately false on mount, and never pre-ticked. */
  readonly deleteStaleBranch: boolean
}

/**
 * The decision shown when a pull fails because the branch's remote-tracking
 * branch no longer exists on the remote.
 *
 * The dialog is reserved for the decision itself: whether to leave the stale
 * branch for the repository's default branch, and whether to delete the stale
 * branch on the way. Everything after the decision — progress and the real
 * result of the retried pull — is reported through non-blocking notifications
 * rather than by keeping the application blocked.
 *
 * Adapted in intent from desktop-plus' MIT-licensed pull-branch-deleted
 * dialog; the plan, refusals, deletion warning, localization, and reporting
 * are this fork's own.
 */
export class PullBranchDeletedDialog extends React.Component<
  IPullBranchDeletedDialogProps,
  IPullBranchDeletedDialogState
> {
  private isMountedFlag = false

  public constructor(props: IPullBranchDeletedDialogProps) {
    super(props)
    this.state = {
      languageMode: getPersistedLanguageMode(),
      funnyLevels: readFunnyLevels(),
      phase: 'loading',
      plan: null,
      planFailed: false,
      deleteStaleBranch: false,
    }
  }

  public componentDidMount(): void {
    this.isMountedFlag = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    void this.loadPlan()
  }

  public componentWillUnmount(): void {
    this.isMountedFlag = false
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
      funnyLevels: readFunnyLevels(),
    })
  }

  private localize = (
    key: TranslationKey,
    variables?: TranslationVariables
  ): string => translate(key, this.state.languageMode, variables)

  private localizeWithFunnyLevel = (
    base: FunnyLevelTextBase,
    variables?: TranslationVariables
  ): string =>
    translateWithFunnyLevel(
      base,
      this.state.languageMode,
      this.state.funnyLevels,
      variables
    )

  private accessibleName(
    key: TranslationKey,
    variables?: TranslationVariables
  ): string {
    return translateForAccessibleName(
      key,
      variables ?? {},
      this.state.languageMode
    )
  }

  private async loadPlan(): Promise<void> {
    try {
      const plan = await this.props.dispatcher.getPullBranchDeletedRecoveryPlan(
        this.props.repository
      )
      if (this.isMountedFlag) {
        this.setState({ phase: 'review', plan, planFailed: false })
      }
    } catch (error) {
      log.error('Could not build the deleted-upstream recovery plan', error)
      if (this.isMountedFlag) {
        this.setState({ phase: 'review', plan: null, planFailed: true })
      }
    }
  }

  private onDeleteStaleBranchChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ deleteStaleBranch: event.currentTarget.checked })
  }

  private canSwitch(): boolean {
    const { phase, plan } = this.state
    return phase === 'review' && plan !== null && plan.blocker === null
  }

  private onSwitchToDefaultBranch = () => {
    const { plan, deleteStaleBranch } = this.state
    if (!this.canSwitch() || plan === null || plan.defaultBranchName === null) {
      return
    }

    const { dispatcher, repository, branchName } = this.props
    const localize = this.localize
    const localizeWithFunnyLevel = this.localizeWithFunnyLevel
    const defaultBranchName = plan.defaultBranchName

    // The decision has been made, so the modal gets out of the way. Progress
    // and the real outcome arrive as notifications instead of blocking the app.
    this.props.onDismissed()

    dispatcher.postNotification({
      kind: 'auto-pull',
      title: localize('pullBranchDeleted.startedTitle'),
      body: localize('pullBranchDeleted.startedBody', {
        repository: repository.name,
        branch: branchName,
        default: defaultBranchName,
      }),
      repositoryId: repository.id,
      action: { kind: 'open-repository', repositoryId: repository.id },
    })

    dispatcher
      .switchToDefaultBranchAndPull(repository, deleteStaleBranch)
      .then(outcome =>
        dispatcher.postNotification(
          buildPullBranchDeletedNotification(outcome, {
            repositoryId: repository.id,
            repositoryName: repository.name,
            staleBranchName: branchName,
            localize,
            localizeWithFunnyLevel,
          })
        )
      )
      .catch(error => {
        const normalized =
          error instanceof Error ? error : new Error(String(error))
        void dispatcher.postError(normalized)
      })
  }

  private renderDeletionWarning(plan: IPullBranchDeletedPlan): JSX.Element {
    const branch = this.props.branchName
    const defaultBranchName = plan.defaultBranchName ?? ''
    const count = plan.unmergedCommitCount

    if (count === null) {
      return (
        <p className="pull-branch-deleted-warning" role="alert">
          {this.localize('pullBranchDeleted.deleteStrandsUnknown', { branch })}
        </p>
      )
    }

    if (count === 0) {
      return (
        <p className="pull-branch-deleted-note">
          {this.localize('pullBranchDeleted.deleteFullyMerged', {
            branch,
            default: defaultBranchName,
          })}
        </p>
      )
    }

    return (
      <p className="pull-branch-deleted-warning" role="alert">
        {this.localize(
          count === 1
            ? 'pullBranchDeleted.deleteStrandsCommitsOne'
            : 'pullBranchDeleted.deleteStrandsCommits',
          { branch, default: defaultBranchName, count: String(count) }
        )}
      </p>
    )
  }

  private renderBody(): JSX.Element {
    const { repository, branchName, remoteName, remoteBranchName } = this.props
    const { phase, plan, planFailed } = this.state

    if (phase === 'loading') {
      return (
        <p className="pull-branch-deleted-loading" role="status">
          {this.localize('pullBranchDeleted.loading')}
        </p>
      )
    }

    const intro = (
      <p>
        {this.localizeWithFunnyLevel('pullBranchDeleted.intro', {
          repository: repository.name,
          branch: branchName,
          remote: remoteName,
          remoteBranch: remoteBranchName,
        })}
      </p>
    )

    if (planFailed || plan === null) {
      return (
        <div id="pull-branch-deleted-message">
          {intro}
          <p className="pull-branch-deleted-warning" role="alert">
            {this.localize('pullBranchDeleted.planFailed', {
              repository: repository.name,
            })}
          </p>
        </div>
      )
    }

    if (plan.blocker !== null) {
      return (
        <div id="pull-branch-deleted-message">
          {intro}
          <p className="pull-branch-deleted-warning" role="alert">
            <strong>{this.localize('pullBranchDeleted.blockedTitle')}</strong>{' '}
            {this.localize(pullBranchDeletedBlockerKey(plan.blocker), {
              repository: repository.name,
              branch: branchName,
            })}
          </p>
        </div>
      )
    }

    const defaultBranchName = plan.defaultBranchName ?? ''

    return (
      <div id="pull-branch-deleted-message">
        {intro}
        <p>
          {this.localize('pullBranchDeleted.offer', {
            repository: repository.name,
            default: defaultBranchName,
          })}
        </p>
        <div className="pull-branch-deleted-delete">
          <Checkbox
            label={this.localize('pullBranchDeleted.deleteLabel', {
              branch: branchName,
            })}
            ariaDescribedBy="pull-branch-deleted-delete-hint"
            value={
              this.state.deleteStaleBranch
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onDeleteStaleBranchChanged}
          />
          <div id="pull-branch-deleted-delete-hint">
            <p className="pull-branch-deleted-note">
              {this.localize('pullBranchDeleted.deleteHint')}
            </p>
            {this.renderDeletionWarning(plan)}
          </div>
        </div>
      </div>
    )
  }

  public render() {
    const { plan, phase } = this.state
    const defaultBranchName = plan?.defaultBranchName ?? ''

    return (
      <Dialog
        id="pull-branch-deleted"
        title={this.localize('pullBranchDeleted.title')}
        type="error"
        role="alertdialog"
        ariaDescribedBy="pull-branch-deleted-message"
        loading={phase === 'loading'}
        onSubmit={this.onSwitchToDefaultBranch}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <section
            aria-label={this.accessibleName('pullBranchDeleted.reviewAria')}
          >
            {this.renderBody()}
          </section>
        </DialogContent>
        <DialogFooter>
          <div className="button-group">
            <Button onClick={this.props.onDismissed}>
              {this.localize('pullBranchDeleted.close')}
            </Button>
            <Button type="submit" disabled={!this.canSwitch()}>
              {this.localize('pullBranchDeleted.switchAction', {
                default: defaultBranchName,
              })}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
