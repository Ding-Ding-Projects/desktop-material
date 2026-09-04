import * as React from 'react'

import {
  IPersonalVocabulary,
  MaxVocabularyBytes,
  MaxVocabularyEntries,
  PersonalVocabularySchemaVersion,
  PersonalVocabularyStorageKey,
  cachePersonalVocabulary,
  clearPersonalVocabulary,
  parsePersonalVocabulary,
  readCachedPersonalVocabulary,
  setActivePersonalVocabulary,
} from '../../lib/personal-vocabulary'
import {
  getPersistedLanguageMode,
  translate,
  type TranslationKey,
  type TranslationVariables,
} from '../../lib/i18n'
import { Button } from '../lib/button'
import {
  SelectionSettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

/**
 * Where the user uploads their own vocabulary file.
 *
 * The control is visible **before a file exists**, which is the whole point: a
 * feature that only appears once it is already in use is a feature nobody
 * discovers. So there is always a file picker here, always an honest statement
 * of what is currently in effect, and — until a valid file is supplied — an
 * explicit "no file, everything reads as shipped".
 *
 * Nothing ships with mappings. No samples, no templates, no defaults. A
 * built-in example would be exactly the private content this feature exists to
 * keep out of the repository, and it would also be a lie about what the app is
 * currently rendering.
 *
 * Everything is local: the file is read in the renderer, validated in full
 * before any of it is displayed or cached, and never uploaded, logged, exported
 * or put in a capture. A refused file changes nothing at all — not even
 * partially — because a half-applied vocabulary leaves the user unable to tell
 * which words on screen are theirs.
 */

type VocabularyState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loaded'; readonly vocabulary: IPersonalVocabulary }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unreadable' }

interface IPersonalVocabularyControlProps {
  /** Raised when the active vocabulary changes, so surfaces can re-render. */
  readonly onChanged?: (vocabulary: IPersonalVocabulary | null) => void
}

interface IPersonalVocabularyControlState {
  readonly status: VocabularyState
}

export class PersonalVocabularyControl extends React.Component<
  IPersonalVocabularyControlProps,
  IPersonalVocabularyControlState
> {
  private readonly inputId = 'personal-vocabulary-file'
  private readonly statusId = 'personal-vocabulary-status'
  private readonly fileInputRef = React.createRef<HTMLInputElement>()
  private activeVocabulary: IPersonalVocabulary | null

  public constructor(props: IPersonalVocabularyControlProps) {
    super(props)
    const cached = readCachedPersonalVocabulary()
    this.activeVocabulary = cached
    this.state = {
      status:
        cached === null
          ? { kind: 'none' }
          : { kind: 'loaded', vocabulary: cached },
    }
  }

  private text(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, getPersistedLanguageMode(), variables)
  }

  private onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    // Clearing the input means choosing the same file twice in a row still
    // raises a change event, which is otherwise a control that works once.
    event.currentTarget.value = ''
    if (file === undefined) {
      return
    }

    // The size is checked here as well as inside the validator, so a file far
    // over the limit is never read into memory in the first place.
    if (file.size > MaxVocabularyBytes) {
      this.setState({
        status: {
          kind: 'rejected',
        },
      })
      return
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      this.setState({
        status: {
          kind: 'unreadable',
        },
      })
      return
    }

    const result = parsePersonalVocabulary(bytes)
    if (!result.ok) {
      // Note what is *not* happening here: the previously loaded vocabulary,
      // if any, stays exactly as it was. A refused file never displaces a good
      // one.
      this.setState({
        status: {
          kind: 'rejected',
        },
      })
      return
    }

    cachePersonalVocabulary(result.vocabulary)
    this.activeVocabulary = result.vocabulary
    setActivePersonalVocabulary(result.vocabulary)
    this.setState({ status: { kind: 'loaded', vocabulary: result.vocabulary } })
    this.props.onChanged?.(result.vocabulary)
  }

  private onClear = () => {
    clearPersonalVocabulary()
    this.activeVocabulary = null
    setActivePersonalVocabulary(null)
    this.setState({ status: { kind: 'none' } })
    this.props.onChanged?.(null)
  }

  private openFilePicker = () => {
    this.fileInputRef.current?.click()
  }

  private renderStatus() {
    const { status } = this.state
    switch (status.kind) {
      case 'none':
        return (
          <p
            className="settings-description"
            id={this.statusId}
            aria-live="polite"
          >
            {this.text('settings.personalVocabularyNoFile')}
          </p>
        )
      case 'loaded':
        return (
          <p
            className="settings-description"
            id={this.statusId}
            aria-live="polite"
          >
            {this.text(
              status.vocabulary.terms.size === 1
                ? 'settings.personalVocabularyLoadedOne'
                : 'settings.personalVocabularyLoadedMany',
              { count: String(status.vocabulary.terms.size) }
            )}
          </p>
        )
      case 'rejected':
      case 'unreadable':
        return (
          <p
            className="settings-description is-error"
            id={this.statusId}
            role="alert"
            aria-live="assertive"
          >
            {this.text(
              status.kind === 'rejected'
                ? 'settings.personalVocabularyRejected'
                : 'settings.personalVocabularyUnreadable'
            )}
          </p>
        )
    }
  }

  public render() {
    const loaded = this.activeVocabulary !== null
    return (
      <div className="personal-vocabulary-control">
        <div className="personal-vocabulary-label">
          <label htmlFor={this.inputId}>
            {this.text('settings.personalVocabularyChooseFile')}
          </label>
        </div>
        <div className="personal-vocabulary-actions">
          <input
            ref={this.fileInputRef}
            id={this.inputId}
            className="personal-vocabulary-file-input"
            type="file"
            accept="application/json,.json"
            tabIndex={-1}
            aria-hidden={true}
            onChange={this.onFileChosen}
          />
          <Button
            type="button"
            dataVerification="personal-vocabulary-choose-file"
            ariaDescribedBy={`${this.statusId} ${
              settingExplanationDescriptionIds('personal-vocabulary-file')
                .ariaDescribedBy
            }`}
            onClick={this.openFilePicker}
          >
            {this.text('settings.personalVocabularyChooseFile')}
          </Button>
          {/*
          Absent rather than disabled. A disabled text button has no container
          and no border, so "Nothing to clear" rendered as a line of stray grey
          text floating between two controls — it read as a caption nobody had
          styled rather than as a button that was unavailable. The state it was
          reporting is already stated, in words, by the status line directly
          below it.
        */}
          {loaded ? (
            <Button
              type="button"
              dataVerification="personal-vocabulary-clear"
              onClick={this.onClear}
              tooltip={this.text('settings.personalVocabularyClearTitle')}
            >
              {this.text('settings.personalVocabularyClear')}
            </Button>
          ) : null}
        </div>
        {this.renderStatus()}
        <SelectionSettingExplanation
          settingId="personal-vocabulary-file"
          explanationEnglish="Loads, replaces, or clears one validated local-only vocabulary file. Invalid input never partially applies, and clearing restores the original shipped wording."
          explanationCantonese="載入、更換或者清除一個經驗證嘅純本地詞彙檔案；無效輸入永遠唔會局部套用，清除後會恢復原本出廠字句。"
          currentEnglish={
            loaded ? 'valid local cache loaded' : 'original wording'
          }
          currentCantonese={loaded ? '已載入有效本地快取' : '原本字句'}
          shippedEnglish="original wording"
          shippedCantonese="原本字句"
          storageKey={PersonalVocabularyStorageKey}
        />
        <details>
          <summary>
            {this.text('settings.personalVocabularyFileShapeSummary')}
          </summary>
          <p className="settings-description">
            {this.text('settings.personalVocabularyFileShapeDescription', {
              version: String(PersonalVocabularySchemaVersion),
              entries: String(MaxVocabularyEntries),
              size: String(Math.round(MaxVocabularyBytes / 1024)),
            })}
          </p>
        </details>
      </div>
    )
  }
}
