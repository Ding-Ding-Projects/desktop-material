/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import { Account, getAccountKey } from '../../models/account'
import { BatchCloneMode } from '../../models/batch-clone'
import {
  AutoClonePoliciesStorageKey,
  getAutoClonePolicy,
} from '../../lib/stores/auto-clone-store'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  TranslationKey,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { DialogContent } from '../dialog'
import type { Dispatcher } from '../dispatcher'
import { LocalizedText } from '../lib/localized-text'
import { MaterialSwitch } from '../lib/material-switch'
import { showOpenDialog } from '../main-process-proxy'
import { teleportAnchor } from '../../lib/teleport-targets'
import { MaterialSymbol } from '../lib/material-symbol'

interface IQueuePreferencesProps {
  readonly accounts: ReadonlyArray<Account>
  readonly dispatcher: Dispatcher
}

interface IQueueAccountDraft {
  readonly enabled: boolean
  readonly baseDirectory: string
  readonly mode: BatchCloneMode
  readonly error: TranslationKey | null
}

interface IQueuePreferencesState {
  readonly languageMode: LanguageMode
  readonly drafts: Readonly<Record<string, IQueueAccountDraft>>
}

function createDrafts(
  accounts: ReadonlyArray<Account>,
  previous: Readonly<Record<string, IQueueAccountDraft>> = {}
): Readonly<Record<string, IQueueAccountDraft>> {
  const drafts: Record<string, IQueueAccountDraft> = {}
  for (const account of accounts) {
    const key = getAccountKey(account)
    const prior = previous[key]
    if (prior !== undefined) {
      drafts[key] = prior
      continue
    }

    const policy = getAutoClonePolicy(account)
    drafts[key] = {
      enabled: policy !== null,
      baseDirectory: policy?.baseDirectory ?? '',
      mode: policy?.mode ?? BatchCloneMode.Parallel,
      error: null,
    }
  }
  return drafts
}

/** Account-scoped settings for the durable background clone queue. */
export class QueuePreferences extends React.Component<
  IQueuePreferencesProps,
  IQueuePreferencesState
> {
  private directoryRequest = 0

  public constructor(props: IQueuePreferencesProps) {
    super(props)
    this.state = {
      languageMode: getPersistedLanguageMode(),
      drafts: createDrafts(props.accounts),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentDidUpdate(prevProps: IQueuePreferencesProps) {
    const previousKeys = prevProps.accounts.map(getAccountKey).join('\n')
    const nextKeys = this.props.accounts.map(getAccountKey).join('\n')
    if (previousKeys !== nextKeys) {
      this.setState(state => ({
        drafts: createDrafts(this.props.accounts, state.drafts),
      }))
    }
  }

  public componentWillUnmount() {
    this.directoryRequest++
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public render() {
    const { languageMode } = this.state
    return (
      <DialogContent className="queue-preferences">
        <section
          className="queue-heading"
          data-verification="clone-queue-settings"
          {...teleportAnchor('settings-queue-accounts')}
        >
          <div className="queue-heading-icon" aria-hidden={true}>
            <MaterialSymbol name="layers" />
          </div>
          <div>
            <h2>
              <LocalizedText
                translationKey="settings.queueHeading"
                languageMode={languageMode}
              />
            </h2>
            <p>
              <LocalizedText
                translationKey="settings.queueDescription"
                languageMode={languageMode}
              />
            </p>
          </div>
        </section>

        {this.props.accounts.length === 0 ? (
          <div className="queue-empty-state" role="status">
            <MaterialSymbol name="person" />
            <LocalizedText
              translationKey="settings.queueNoAccounts"
              languageMode={languageMode}
            />
          </div>
        ) : (
          <div className="queue-account-list">
            {this.props.accounts.map((account, index) =>
              this.renderAccount(account, index)
            )}
          </div>
        )}

        <section className="queue-safety-note" role="note">
          <MaterialSymbol name="verified_user" />
          <LocalizedText
            translationKey="settings.queueSafetyNote"
            languageMode={languageMode}
          />
        </section>
      </DialogContent>
    )
  }

  private renderAccount(account: Account, index: number) {
    const key = getAccountKey(account)
    const draft = this.state.drafts[key]
    if (draft === undefined) {
      return null
    }

    const controlId = `queue-account-${account.id}-${index}`
    const titleId = `${controlId}-title`
    const toggleTitleId = `${controlId}-toggle-title`
    const descriptionId = `${controlId}-description`
    const statusKey = draft.enabled
      ? 'settings.queueEnabledStatus'
      : 'settings.queueDisabledStatus'
    const enabledSettingId = `${controlId}-auto-clone-enabled`
    const directorySettingId = `${controlId}-base-directory`
    const modeSettingId = `${controlId}-mode-setting`

    return (
      <section
        className="queue-account-card"
        key={key}
        aria-labelledby={titleId}
      >
        <div className="queue-account-header">
          <div className="queue-account-copy">
            <h3 id={titleId}>{account.login}</h3>
            <span>{account.friendlyEndpoint}</span>
          </div>
        </div>

        <div className="queue-policy-row">
          <div>
            <strong id={toggleTitleId}>
              <LocalizedText
                translationKey="settings.queueAutoCloneTitle"
                languageMode={this.state.languageMode}
              />
            </strong>
            <p id={descriptionId} className="queue-account-description">
              <LocalizedText
                translationKey="settings.queueAutoCloneDescription"
                languageMode={this.state.languageMode}
              />
            </p>
          </div>
          <MaterialSwitch
            checked={draft.enabled}
            onChange={enabled => this.onEnabledChanged(account, enabled)}
            ariaLabelledBy={toggleTitleId}
            ariaDescribedBy={`${descriptionId} ${
              settingExplanationDescriptionIds(enabledSettingId).ariaDescribedBy
            }`}
          />
        </div>
        <SelectionSettingExplanation
          settingId={enabledSettingId}
          inventoryId="queue-auto-clone-enabled"
          explanationEnglish="Controls whether newly discovered repositories for this account are added to the durable clone queue."
          explanationCantonese="控制呢個帳戶新發現嘅儲存庫係咪加入耐用 clone 佇列。"
          currentEnglish={draft.enabled ? 'on' : 'off'}
          currentCantonese={draft.enabled ? '開' : '關'}
          shippedEnglish="off"
          shippedCantonese="關"
          storageKey={AutoClonePoliciesStorageKey}
        />

        <div className="queue-field-group">
          <label htmlFor={`${controlId}-directory`}>
            <LocalizedText
              translationKey="settings.queueBaseDirectory"
              languageMode={this.state.languageMode}
            />
          </label>
          <div className="queue-directory-row">
            <input
              id={`${controlId}-directory`}
              type="text"
              value={draft.baseDirectory}
              readOnly={true}
              placeholder={translate(
                'settings.queueDirectoryPlaceholder',
                this.state.languageMode
              )}
              aria-describedby={
                settingExplanationDescriptionIds(directorySettingId)
                  .ariaDescribedBy
              }
            />
            <button
              type="button"
              className="queue-tonal-button"
              onClick={() => this.chooseDirectory(account)}
            >
              <MaterialSymbol name="folder_open" />
              <LocalizedText
                translationKey="settings.queueChooseDirectory"
                languageMode={this.state.languageMode}
              />
            </button>
          </div>
          <SelectionSettingExplanation
            settingId={directorySettingId}
            inventoryId="queue-base-directory"
            explanationEnglish="Chooses the local parent directory where this account's newly discovered repositories are cloned."
            explanationCantonese="揀呢個帳戶新發現儲存庫 clone 去邊個本地父目錄。"
            currentEnglish={
              draft.baseDirectory.length > 0 ? 'selected' : 'empty'
            }
            currentCantonese={
              draft.baseDirectory.length > 0 ? '已選擇' : '留空'
            }
            shippedEnglish="empty"
            shippedCantonese="留空"
            storageKey={AutoClonePoliciesStorageKey}
          />
        </div>

        <div className="queue-field-group">
          <label htmlFor={`${controlId}-mode`}>
            <LocalizedText
              translationKey="settings.queueMode"
              languageMode={this.state.languageMode}
            />
          </label>
          <select
            id={`${controlId}-mode`}
            value={draft.mode}
            aria-describedby={
              settingExplanationDescriptionIds(modeSettingId).ariaDescribedBy
            }
            onChange={event => this.onModeChanged(account, event)}
          >
            <option value={BatchCloneMode.Parallel}>
              {translate('settings.queueModeParallel', this.state.languageMode)}
            </option>
            <option value={BatchCloneMode.Sequential}>
              {translate(
                'settings.queueModeSequential',
                this.state.languageMode
              )}
            </option>
          </select>
          <SelectionSettingExplanation
            settingId={modeSettingId}
            inventoryId="queue-mode"
            explanationEnglish="Chooses whether repositories for this account clone in bounded parallel work or one after another."
            explanationCantonese="揀呢個帳戶嘅儲存庫用受限平行方式 clone，定係逐個進行。"
            currentEnglish={draft.mode}
            currentCantonese={draft.mode}
            shippedEnglish={BatchCloneMode.Parallel}
            shippedCantonese={BatchCloneMode.Parallel}
            storageKey={AutoClonePoliciesStorageKey}
          />
        </div>

        <div
          className={`queue-status ${draft.enabled ? 'enabled' : ''}`}
          role="status"
        >
          <span className="queue-status-dot" aria-hidden={true} />
          <LocalizedText
            translationKey={statusKey}
            languageMode={this.state.languageMode}
          />
        </div>

        {draft.error !== null && (
          <p className="queue-error" role="alert">
            <LocalizedText
              translationKey={draft.error}
              languageMode={this.state.languageMode}
            />
          </p>
        )}
      </section>
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  private onEnabledChanged(account: Account, enabled: boolean) {
    const key = getAccountKey(account)
    const draft = this.state.drafts[key]
    if (draft === undefined) {
      return
    }
    if (enabled && draft.baseDirectory.length === 0) {
      this.updateDraft(key, {
        error: 'settings.queueDirectoryRequired',
      })
      return
    }

    this.props.dispatcher.configureAutoClone(
      account,
      draft.baseDirectory,
      draft.mode,
      enabled
    )
    this.updateDraft(key, { enabled, error: null })
  }

  private onModeChanged(
    account: Account,
    event: React.FormEvent<HTMLSelectElement>
  ) {
    const mode = event.currentTarget.value as BatchCloneMode
    if (
      mode !== BatchCloneMode.Parallel &&
      mode !== BatchCloneMode.Sequential
    ) {
      return
    }

    const key = getAccountKey(account)
    const draft = this.state.drafts[key]
    if (draft === undefined) {
      return
    }
    this.updateDraft(key, { mode, error: null }, () => {
      if (draft.enabled) {
        this.props.dispatcher.configureAutoClone(
          account,
          draft.baseDirectory,
          mode,
          true
        )
      }
    })
  }

  private chooseDirectory = async (account: Account) => {
    const request = ++this.directoryRequest
    const directory = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })
    if (directory === null || request !== this.directoryRequest) {
      return
    }

    const key = getAccountKey(account)
    this.updateDraft(key, { baseDirectory: directory, error: null }, () => {
      const draft = this.state.drafts[key]
      if (draft?.enabled === true) {
        this.props.dispatcher.configureAutoClone(
          account,
          directory,
          draft.mode,
          true
        )
      }
    })
  }

  private updateDraft(
    key: string,
    change: Partial<IQueueAccountDraft>,
    callback?: () => void
  ) {
    this.setState(state => {
      const draft = state.drafts[key]
      return draft === undefined
        ? null
        : {
            drafts: {
              ...state.drafts,
              [key]: { ...draft, ...change },
            },
          }
    }, callback)
  }
}
