import * as React from 'react'

import {
  IGlobalIgnoreDocument,
  readGlobalIgnore,
  saveGlobalIgnore,
} from '../../lib/git/global-ignore'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translateForAccessibleName,
  TranslationKey,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { Button } from '../lib/button'
import { LocalizedText } from '../lib/localized-text'
import { TextArea } from '../lib/text-area'
import { teleportAnchor } from '../../lib/teleport-targets'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IGlobalIgnoreEditorProps {
  readonly load?: () => Promise<IGlobalIgnoreDocument>
  readonly save?: (
    path: string,
    contents: string
  ) => Promise<IGlobalIgnoreDocument>
}

interface IGlobalIgnoreEditorState {
  readonly path: string
  readonly contents: string
  readonly loading: boolean
  readonly saving: boolean
  readonly exists: boolean
  readonly configured: boolean
  readonly status: TranslationKey | null
  readonly error: {
    readonly key: TranslationKey
    readonly detail: string
  } | null
  readonly languageMode: LanguageMode
}

const CommonEditorRules = ['.idea/', '.vscode/', '*.swp', '*~']
const CommonOSRules = ['.DS_Store', 'Thumbs.db', 'Desktop.ini']

function appendRules(contents: string, rules: ReadonlyArray<string>): string {
  const current = contents.split(/\r?\n/)
  const present = new Set(current.map(line => line.trim()))
  const additions = rules.filter(rule => !present.has(rule))
  if (additions.length === 0) {
    return contents
  }
  const prefix = contents.length === 0 || contents.endsWith('\n') ? '' : '\n'
  return `${contents}${prefix}${additions.join('\n')}\n`
}

/** A bounded editor for Git's global core.excludesFile. */
export class GlobalIgnoreEditor extends React.Component<
  IGlobalIgnoreEditorProps,
  IGlobalIgnoreEditorState
> {
  private mounted = false

  private localizeText(english: string, cantonese: string): string {
    switch (this.state.languageMode) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  public constructor(props: IGlobalIgnoreEditorProps) {
    super(props)
    this.state = {
      path: '',
      contents: '',
      loading: true,
      saving: false,
      exists: false,
      configured: false,
      status: null,
      error: null,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    this.mounted = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    void this.reload()
  }

  public componentWillUnmount() {
    this.mounted = false
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

  private get loader() {
    return this.props.load ?? readGlobalIgnore
  }

  private get saver() {
    return this.props.save ?? saveGlobalIgnore
  }

  private applyDocument(
    document: IGlobalIgnoreDocument,
    status: TranslationKey | null
  ) {
    if (!this.mounted) {
      return
    }
    this.setState({
      path: document.path,
      contents: document.contents,
      exists: document.exists,
      configured: document.configured,
      loading: false,
      saving: false,
      status,
      error: null,
    })
  }

  private reload = async () => {
    this.setState({ loading: true, status: null, error: null })
    try {
      this.applyDocument(await this.loader(), null)
    } catch (error) {
      if (this.mounted) {
        this.setState({
          loading: false,
          saving: false,
          error: { key: 'globalIgnore.loadError', detail: String(error) },
        })
      }
    }
  }

  private save = async () => {
    if (this.state.path.trim().length === 0 || this.state.saving) {
      return
    }
    this.setState({
      saving: true,
      status: 'globalIgnore.savingStatus',
      error: null,
    })
    try {
      const document = await this.saver(this.state.path, this.state.contents)
      this.applyDocument(document, 'globalIgnore.savedStatus')
    } catch (error) {
      if (this.mounted) {
        this.setState({
          saving: false,
          status: null,
          error: { key: 'globalIgnore.saveError', detail: String(error) },
        })
      }
    }
  }

  private onPathChanged = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({
      path: event.currentTarget.value,
      status: null,
      error: null,
    })

  private onContentsChanged = (contents: string) =>
    this.setState({ contents, status: null, error: null })

  private addEditorRules = () =>
    this.setState(state => ({
      contents: appendRules(state.contents, CommonEditorRules),
      status: null,
      error: null,
    }))

  private addOSRules = () =>
    this.setState(state => ({
      contents: appendRules(state.contents, CommonOSRules),
      status: null,
      error: null,
    }))

  public render() {
    const busy = this.state.loading || this.state.saving
    const languageMode = this.state.languageMode
    return (
      <section
        className="global-ignore-editor"
        aria-labelledby="global-ignore-heading"
        {...teleportAnchor('settings-global-ignore')}
      >
        <h2 id="global-ignore-heading">
          <LocalizedText
            translationKey="globalIgnore.title"
            languageMode={languageMode}
          />
        </h2>
        <p id="global-ignore-description" className="settings-description">
          <LocalizedText
            translationKey="globalIgnore.description"
            languageMode={languageMode}
          />
        </p>

        <label htmlFor="global-ignore-path">
          <LocalizedText
            translationKey="globalIgnore.pathLabel"
            languageMode={languageMode}
          />
        </label>
        <input
          id="global-ignore-path"
          type="text"
          aria-label={translateForAccessibleName(
            'globalIgnore.pathLabel',
            {},
            languageMode
          )}
          value={this.state.path}
          disabled={busy}
          onChange={this.onPathChanged}
          aria-describedby={`global-ignore-path-state ${
            settingExplanationDescriptionIds('global-ignore-path')
              .ariaDescribedBy
          }`}
        />
        <p id="global-ignore-path-state" className="settings-description">
          {this.state.loading ? (
            <LocalizedText
              translationKey="globalIgnore.loading"
              languageMode={languageMode}
            />
          ) : this.state.configured ? (
            <LocalizedText
              translationKey={
                this.state.exists
                  ? 'globalIgnore.configuredExisting'
                  : 'globalIgnore.configuredNew'
              }
              languageMode={languageMode}
            />
          ) : (
            <LocalizedText
              translationKey="globalIgnore.notConfigured"
              languageMode={languageMode}
            />
          )}
        </p>
        <SettingExplanation
          settingId="global-ignore-path"
          summary={this.localizeText(
            'What this setting changes',
            '呢個設定會改咩'
          )}
          explanation={this.localizeText(
            "Chooses the file registered in Git's global core.excludesFile configuration. Saving creates the file when it does not exist.",
            '揀 Git 全域 core.excludesFile 設定登記嘅檔案；檔案唔存在時，儲存會建立佢。'
          )}
          provenance={this.localizeText(
            `Current value: ${
              this.state.configured
                ? this.state.exists
                  ? 'configured existing file'
                  : 'configured new file'
                : 'unconfigured'
            }. Shipped value: unconfigured. Source: managed Git configuration.`,
            `目前值：${
              this.state.configured
                ? this.state.exists
                  ? '已設定現有檔案'
                  : '已設定新檔案'
                : '未設定'
            }。出廠值：未設定。來源：受管理 Git 設定。`
          )}
          source="main-process-config"
        />

        <div
          className="global-ignore-starters"
          role="group"
          aria-label={translateForAccessibleName(
            'globalIgnore.starterRules',
            {},
            languageMode
          )}
        >
          <Button
            ariaLabel={translateForAccessibleName(
              'globalIgnore.addEditorFiles',
              {},
              languageMode
            )}
            disabled={busy}
            onClick={this.addEditorRules}
          >
            <LocalizedText
              translationKey="globalIgnore.addEditorFiles"
              languageMode={languageMode}
            />
          </Button>
          <Button
            ariaLabel={translateForAccessibleName(
              'globalIgnore.addOSFiles',
              {},
              languageMode
            )}
            disabled={busy}
            onClick={this.addOSRules}
          >
            <LocalizedText
              translationKey="globalIgnore.addOSFiles"
              languageMode={languageMode}
            />
          </Button>
        </div>

        <TextArea
          ariaLabel={translateForAccessibleName(
            'globalIgnore.rulesAria',
            {},
            languageMode
          )}
          ariaDescribedBy={`global-ignore-description ${
            settingExplanationDescriptionIds('global-ignore-rules')
              .ariaDescribedBy
          }`}
          placeholder={translateForAccessibleName(
            'globalIgnore.patternPlaceholder',
            {},
            languageMode
          )}
          value={this.state.contents}
          disabled={busy}
          onValueChanged={this.onContentsChanged}
          textareaClassName="global-ignore-rules"
        />
        <SettingExplanation
          settingId="global-ignore-rules"
          summary={this.localizeText(
            'What this setting changes',
            '呢個設定會改咩'
          )}
          explanation={this.localizeText(
            'Edits the ignore patterns stored in the selected global excludes file. Repository-specific ignore files remain unchanged.',
            '編輯所選全域 excludes 檔案入面嘅忽略規則；個別儲存庫嘅忽略檔案唔會改。'
          )}
          provenance={this.localizeText(
            `Current value: ${
              this.state.contents
                .split(/\r?\n/)
                .filter(line => line.trim().length > 0).length
            } non-empty patterns. Shipped value: 0 patterns. Source: selected file contents.`,
            `目前值：${
              this.state.contents
                .split(/\r?\n/)
                .filter(line => line.trim().length > 0).length
            } 條非空規則。出廠值：0 條規則。來源：所選檔案內容。`
          )}
          source="main-process-config"
        />

        <div className="global-ignore-actions">
          <Button
            ariaLabel={translateForAccessibleName(
              'globalIgnore.reload',
              {},
              languageMode
            )}
            disabled={busy}
            onClick={this.reload}
          >
            <LocalizedText
              translationKey="globalIgnore.reload"
              languageMode={languageMode}
            />
          </Button>
          <Button
            type="submit"
            ariaLabel={translateForAccessibleName(
              this.state.saving
                ? 'globalIgnore.savingAction'
                : 'globalIgnore.saveAction',
              {},
              languageMode
            )}
            disabled={busy || this.state.path.trim().length === 0}
            onClick={this.save}
          >
            <LocalizedText
              translationKey={
                this.state.saving
                  ? 'globalIgnore.savingAction'
                  : 'globalIgnore.saveAction'
              }
              languageMode={languageMode}
            />
          </Button>
        </div>
        {(this.state.status !== null || this.state.error !== null) && (
          <p
            className={this.state.error === null ? 'success' : 'error'}
            role={this.state.error === null ? 'status' : 'alert'}
          >
            {this.state.error !== null ? (
              <LocalizedText
                translationKey={this.state.error.key}
                variables={{ error: this.state.error.detail }}
                languageMode={languageMode}
              />
            ) : this.state.status !== null ? (
              <LocalizedText
                translationKey={this.state.status}
                languageMode={languageMode}
              />
            ) : null}
          </p>
        )}
      </section>
    )
  }
}

export { appendRules }
