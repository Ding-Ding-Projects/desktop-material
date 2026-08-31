import * as React from 'react'
import { UncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { RadioGroup } from '../lib/radio-group'
import { assertNever } from '../../lib/fatal-error'
import { teleportAnchor } from '../../lib/teleport-targets'
import { getPersistedLanguageMode } from '../../lib/i18n'
import { defaultUncommittedChangesStrategy } from '../../models/uncommitted-changes-strategy'
import {
  askForConfirmationOnForcePushDefault,
  confirmCheckoutCommitDefault,
  confirmCheckoutCommitKey,
  confirmCommitFilteredChangesDefault,
  confirmCommitFilteredChangesKey,
  confirmCommitMessageOverrideDefault,
  confirmCommitMessageOverrideKey,
  confirmDiscardChangesDefault,
  confirmDiscardChangesKey,
  confirmDiscardChangesPermanentlyDefault,
  confirmDiscardChangesPermanentlyKey,
  confirmDiscardStashDefault,
  confirmDiscardStashKey,
  confirmForcePushKey,
  confirmRepoRemovalDefault,
  confirmRepoRemovalKey,
  confirmUndoCommitDefault,
  confirmUndoCommitKey,
  confirmWorktreeRemovalDefault,
  confirmWorktreeRemovalKey,
  showCommitLengthWarningKey,
  uncommittedChangesStrategyKey,
} from '../../lib/stores/app-store'
import {
  BooleanSettingExplanation,
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IBooleanPromptSetting {
  readonly id: string
  readonly labelEnglish: string
  readonly labelCantonese: string
  readonly explanationEnglish: string
  readonly explanationCantonese: string
  readonly value: boolean
  readonly shippedValue: boolean
  readonly storageKey: string
  readonly onChange: (event: React.FormEvent<HTMLInputElement>) => void
}

interface IPromptsPreferencesProps {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly confirmCommitMessageOverride: boolean
  readonly confirmWorktreeRemoval: boolean
  readonly showCommitLengthWarning: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmDiscardChangesPermanentlyChanged: (checked: boolean) => void
  readonly onConfirmDiscardStashChanged: (checked: boolean) => void
  readonly onConfirmCheckoutCommitChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onConfirmForcePushChanged: (checked: boolean) => void
  readonly onConfirmUndoCommitChanged: (checked: boolean) => void
  readonly onShowCommitLengthWarningChanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyChanged: (
    value: UncommittedChangesStrategy
  ) => void
  readonly onAskForConfirmationOnCommitFilteredChanges: (value: boolean) => void
  readonly onConfirmCommitMessageOverrideChanged: (checked: boolean) => void
  readonly onConfirmWorktreeRemovalChanged: (checked: boolean) => void
}

interface IPromptsPreferencesState {
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly confirmCommitMessageOverride: boolean
  readonly confirmWorktreeRemoval: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
}

export class Prompts extends React.Component<
  IPromptsPreferencesProps,
  IPromptsPreferencesState
> {
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private renderBooleanSetting(value: IBooleanPromptSetting): JSX.Element {
    const ids = settingExplanationDescriptionIds(value.id)
    return (
      <>
        <Checkbox
          label={this.localize(value.labelEnglish, value.labelCantonese)}
          value={value.value ? CheckboxValue.On : CheckboxValue.Off}
          onChange={value.onChange}
          ariaDescribedBy={ids.ariaDescribedBy}
        />
        <BooleanSettingExplanation
          settingId={value.id}
          explanationEnglish={value.explanationEnglish}
          explanationCantonese={value.explanationCantonese}
          value={value.value}
          shippedValue={value.shippedValue}
          storageKey={value.storageKey}
        />
      </>
    )
  }

  private hasStoredChoice(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null
    } catch {
      return false
    }
  }

  public constructor(props: IPromptsPreferencesProps) {
    super(props)

    this.state = {
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmDiscardChangesPermanently:
        this.props.confirmDiscardChangesPermanently,
      confirmDiscardStash: this.props.confirmDiscardStash,
      confirmCheckoutCommit: this.props.confirmCheckoutCommit,
      confirmForcePush: this.props.confirmForcePush,
      confirmUndoCommit: this.props.confirmUndoCommit,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
      askForConfirmationOnCommitFilteredChanges:
        this.props.askForConfirmationOnCommitFilteredChanges,
      confirmCommitMessageOverride: this.props.confirmCommitMessageOverride,
      confirmWorktreeRemoval: this.props.confirmWorktreeRemoval,
    }
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
    this.props.onConfirmDiscardChangesChanged(value)
  }

  private onConfirmDiscardChangesPermanentlyChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChangesPermanently: value })
    this.props.onConfirmDiscardChangesPermanentlyChanged(value)
  }

  private onConfirmDiscardStashChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardStash: value })
    this.props.onConfirmDiscardStashChanged(value)
  }

  private onConfirmCheckoutCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmCheckoutCommit: value })
    this.props.onConfirmCheckoutCommitChanged(value)
  }

  private onConfirmForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmForcePush: value })
    this.props.onConfirmForcePushChanged(value)
  }

  private onConfirmUndoCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmUndoCommit: value })
    this.props.onConfirmUndoCommitChanged(value)
  }

  private onAskForConfirmationOnCommitFilteredChanges = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ askForConfirmationOnCommitFilteredChanges: value })
    this.props.onAskForConfirmationOnCommitFilteredChanges(value)
  }

  private onConfirmCommitMessageOverrideChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmCommitMessageOverride: value })
    this.props.onConfirmCommitMessageOverrideChanged(value)
  }

  private onConfirmWorktreeRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmWorktreeRemoval: value })
    this.props.onConfirmWorktreeRemovalChanged(value)
  }

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
  }

  private onUncommittedChangesStrategyChanged = (
    value: UncommittedChangesStrategy
  ) => {
    this.setState({ uncommittedChangesStrategy: value })
    this.props.onUncommittedChangesStrategyChanged(value)
  }

  private onShowCommitLengthWarningChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowCommitLengthWarningChanged(event.currentTarget.checked)
  }

  private switchBranchOptionLabel(
    key: UncommittedChangesStrategy,
    language: 'english' | 'cantonese'
  ): string {
    switch (key) {
      case UncommittedChangesStrategy.AskForConfirmation:
        return language === 'english'
          ? 'Ask me where I want the changes to go'
          : '問我啲變更要去邊'
      case UncommittedChangesStrategy.MoveToNewBranch:
        return language === 'english'
          ? 'Always bring my changes to my new branch'
          : '每次都將變更帶去新分支'
      case UncommittedChangesStrategy.StashOnCurrentBranch:
        return language === 'english'
          ? 'Always stash and leave my changes on the current branch'
          : '每次都 stash 變更並留喺目前分支'
      default:
        return assertNever(key, `Unknown uncommitted changes strategy: ${key}`)
    }
  }

  private renderSwitchBranchOptionLabel = (key: UncommittedChangesStrategy) =>
    this.localize(
      this.switchBranchOptionLabel(key, 'english'),
      this.switchBranchOptionLabel(key, 'cantonese')
    )

  private renderSwitchBranchOptions = () => {
    const settingId = 'prompts-uncommitted-changes-strategy'
    const options = [
      UncommittedChangesStrategy.AskForConfirmation,
      UncommittedChangesStrategy.MoveToNewBranch,
      UncommittedChangesStrategy.StashOnCurrentBranch,
    ]

    const selectedKey =
      options.find(o => o === this.state.uncommittedChangesStrategy) ??
      UncommittedChangesStrategy.AskForConfirmation

    return (
      <div
        className="advanced-section"
        {...teleportAnchor('settings-uncommitted-changes-strategy')}
      >
        <h2 id="switch-branch-heading">
          {this.localize(
            'If I have changes and I switch branches...',
            '如果我有變更又切換分支……'
          )}
        </h2>

        <RadioGroup<UncommittedChangesStrategy>
          ariaLabelledBy="switch-branch-heading"
          ariaDescribedBy={
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }
          selectedKey={selectedKey}
          radioButtonKeys={options}
          onSelectionChanged={this.onUncommittedChangesStrategyChanged}
          renderRadioButtonLabelContents={this.renderSwitchBranchOptionLabel}
        />
        <SettingExplanation
          settingId={settingId}
          summary={this.localize('What this setting changes', '呢個設定會改咩')}
          explanation={this.localize(
            'Chooses whether switching branches asks where uncommitted changes should go, moves them to the new branch, or stashes them on the current branch.',
            '揀切換分支時要問未提交變更去邊、將佢哋帶去新分支，定係 stash 喺目前分支。'
          )}
          source={
            this.hasStoredChoice(uncommittedChangesStrategyKey)
              ? 'stored-choice'
              : 'compiled-default'
          }
          provenance={this.localize(
            this.hasStoredChoice(uncommittedChangesStrategyKey)
              ? `A choice is recorded on this computer. Current value: ${this.switchBranchOptionLabel(
                  selectedKey,
                  'english'
                )}. Shipped value: ${this.switchBranchOptionLabel(
                  defaultUncommittedChangesStrategy,
                  'english'
                )}.`
              : `No choice is recorded on this computer. Current and shipped value: ${this.switchBranchOptionLabel(
                  defaultUncommittedChangesStrategy,
                  'english'
                )}.`,
            this.hasStoredChoice(uncommittedChangesStrategyKey)
              ? `呢部電腦記錄咗選擇。目前值：${this.switchBranchOptionLabel(
                  selectedKey,
                  'cantonese'
                )}。出廠值：${this.switchBranchOptionLabel(
                  defaultUncommittedChangesStrategy,
                  'cantonese'
                )}。`
              : `呢部電腦未記錄選擇。目前值同出廠值：${this.switchBranchOptionLabel(
                  defaultUncommittedChangesStrategy,
                  'cantonese'
                )}。`
          )}
        />
      </div>
    )
  }

  private renderCommittingFilteredChangesPrompt = () => {
    return (
      <div {...teleportAnchor('settings-confirm-commit-filtered-changes')}>
        {this.renderBooleanSetting({
          id: 'prompts-confirm-commit-filtered-changes',
          labelEnglish: 'Committing changes hidden by filter',
          labelCantonese: '提交被篩選器收埋嘅變更',
          explanationEnglish:
            'Shows a confirmation when a commit would include changes hidden by the active file filter.',
          explanationCantonese:
            '如果提交會包含目前檔案篩選器收埋咗嘅變更，就顯示確認。',
          value: this.state.askForConfirmationOnCommitFilteredChanges,
          shippedValue: confirmCommitFilteredChangesDefault,
          storageKey: confirmCommitFilteredChangesKey,
          onChange: this.onAskForConfirmationOnCommitFilteredChanges,
        })}
      </div>
    )
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2 id="show-confirm-dialog-heading">
            {this.localize(
              'Show a confirmation dialog before...',
              '做以下動作之前顯示確認……'
            )}
          </h2>
          <div role="group" aria-labelledby="show-confirm-dialog-heading">
            <div {...teleportAnchor('settings-confirm-repository-removal')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-repository-removal',
                labelEnglish: 'Removing repositories',
                labelCantonese: '移除儲存庫',
                explanationEnglish:
                  'Shows a confirmation before removing a repository from the tracked repository list.',
                explanationCantonese:
                  '由已追蹤儲存庫清單移除儲存庫之前顯示確認。',
                value: this.state.confirmRepositoryRemoval,
                shippedValue: confirmRepoRemovalDefault,
                storageKey: confirmRepoRemovalKey,
                onChange: this.onConfirmRepositoryRemovalChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-discard')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-discard-changes',
                labelEnglish: 'Discarding changes',
                labelCantonese: '捨棄變更',
                explanationEnglish:
                  'Shows a confirmation before moving ordinary uncommitted changes out of the working directory.',
                explanationCantonese:
                  '將一般未提交變更移出工作目錄之前顯示確認。',
                value: this.state.confirmDiscardChanges,
                shippedValue: confirmDiscardChangesDefault,
                storageKey: confirmDiscardChangesKey,
                onChange: this.onConfirmDiscardChangesChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-discard-permanently')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-discard-permanently',
                labelEnglish: 'Discarding changes permanently',
                labelCantonese: '永久捨棄變更',
                explanationEnglish:
                  'Shows a confirmation before permanently deleting changes when a recoverable recycle path is unavailable or declined.',
                explanationCantonese:
                  '可復原嘅回收路徑用唔到或者被拒時，永久刪除變更之前顯示確認。',
                value: this.state.confirmDiscardChangesPermanently,
                shippedValue: confirmDiscardChangesPermanentlyDefault,
                storageKey: confirmDiscardChangesPermanentlyKey,
                onChange: this.onConfirmDiscardChangesPermanentlyChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-discard-stash')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-discard-stash',
                labelEnglish: 'Discarding stash',
                labelCantonese: '捨棄 stash',
                explanationEnglish:
                  'Shows a confirmation before deleting a saved stash entry.',
                explanationCantonese: '刪除已儲存 stash 項目之前顯示確認。',
                value: this.state.confirmDiscardStash,
                shippedValue: confirmDiscardStashDefault,
                storageKey: confirmDiscardStashKey,
                onChange: this.onConfirmDiscardStashChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-checkout-commit')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-checkout-commit',
                labelEnglish: 'Checking out a commit',
                labelCantonese: 'Checkout 提交',
                explanationEnglish:
                  'Shows a confirmation before checking out a commit directly and entering detached HEAD state.',
                explanationCantonese:
                  '直接 checkout 一個提交並進入 detached HEAD 狀態之前顯示確認。',
                value: this.state.confirmCheckoutCommit,
                shippedValue: confirmCheckoutCommitDefault,
                storageKey: confirmCheckoutCommitKey,
                onChange: this.onConfirmCheckoutCommitChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-force-push')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-force-push',
                labelEnglish: 'Force pushing',
                labelCantonese: '強制推送',
                explanationEnglish:
                  'Shows a confirmation before replacing remote branch history through the force-push path.',
                explanationCantonese:
                  '經強制推送路徑取代遠端分支歷史之前顯示確認。',
                value: this.state.confirmForcePush,
                shippedValue: askForConfirmationOnForcePushDefault,
                storageKey: confirmForcePushKey,
                onChange: this.onConfirmForcePushChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-undo-commit')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-undo-commit',
                labelEnglish: 'Undo commit',
                labelCantonese: '復原提交',
                explanationEnglish:
                  'Shows a confirmation before moving the current branch back and returning the commit changes to the working directory.',
                explanationCantonese:
                  '將目前分支向後移並將提交變更放返工作目錄之前顯示確認。',
                value: this.state.confirmUndoCommit,
                shippedValue: confirmUndoCommitDefault,
                storageKey: confirmUndoCommitKey,
                onChange: this.onConfirmUndoCommitChanged,
              })}
            </div>
            <div
              {...teleportAnchor('settings-confirm-commit-message-override')}
            >
              {this.renderBooleanSetting({
                id: 'prompts-confirm-commit-message-override',
                labelEnglish:
                  'Overriding commit message with generated message',
                labelCantonese: '用產生嘅訊息覆蓋提交訊息',
                explanationEnglish:
                  'Shows a confirmation before generated text replaces a commit message already entered by the user.',
                explanationCantonese:
                  '產生嘅文字取代用戶已經輸入嘅提交訊息之前顯示確認。',
                value: this.state.confirmCommitMessageOverride,
                shippedValue: confirmCommitMessageOverrideDefault,
                storageKey: confirmCommitMessageOverrideKey,
                onChange: this.onConfirmCommitMessageOverrideChanged,
              })}
            </div>
            <div {...teleportAnchor('settings-confirm-worktree-removal')}>
              {this.renderBooleanSetting({
                id: 'prompts-confirm-worktree-removal',
                labelEnglish: 'Removing worktrees',
                labelCantonese: '移除 worktree',
                explanationEnglish:
                  'Shows a confirmation before removing a linked worktree and its checked-out directory.',
                explanationCantonese:
                  '移除 linked worktree 同佢嘅 checkout 目錄之前顯示確認。',
                value: this.state.confirmWorktreeRemoval,
                shippedValue: confirmWorktreeRemovalDefault,
                storageKey: confirmWorktreeRemovalKey,
                onChange: this.onConfirmWorktreeRemovalChanged,
              })}
            </div>
            {this.renderCommittingFilteredChangesPrompt()}
          </div>
        </div>
        {this.renderSwitchBranchOptions()}
        <div className="advanced-section">
          <h2>{this.localize('Commit length', '提交長度')}</h2>
          <div {...teleportAnchor('settings-commit-length-warning')}>
            {this.renderBooleanSetting({
              id: 'prompts-commit-length-warning',
              labelEnglish: 'Show commit length warning',
              labelCantonese: '顯示提交長度警告',
              explanationEnglish:
                'Shows a warning when the commit message summary exceeds the recommended length.',
              explanationCantonese: '提交訊息摘要超過建議長度時顯示警告。',
              value: this.props.showCommitLengthWarning,
              shippedValue: true,
              storageKey: showCommitLengthWarningKey,
              onChange: this.onShowCommitLengthWarningChanged,
            })}
          </div>
        </div>
      </DialogContent>
    )
  }
}
