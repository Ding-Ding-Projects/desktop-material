/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import { Account, getAccountKey } from '../../models/account'
import { BatchCloneMode } from '../../models/batch-clone'
import { getAutoClonePolicy } from '../../lib/stores/auto-clone-store'
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
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showOpenDialog } from '../main-process-proxy'

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
        >
          <div className="queue-heading-icon" aria-hidden={true}>
            <Octicon symbol={octicons.stack} />
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
            <Octicon symbol={octicons.person} />
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
          <Octicon symbol={octicons.shieldCheck} />
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
            ariaDescribedBy={descriptionId}
          />
        </div>

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
            />
            <button
              type="button"
              className="queue-tonal-button"
              onClick={() => this.chooseDirectory(account)}
            >
              <Octicon symbol={octicons.fileDirectoryOpenFill} />
              <LocalizedText
                translationKey="settings.queueChooseDirectory"
                languageMode={this.state.languageMode}
              />
            </button>
          </div>
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
