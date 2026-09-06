import * as React from 'react'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'
import {
  isOllamaBYOKProvider,
  type IBYOKModel,
  type IBYOKProvider,
} from '../../lib/copilot/byok'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  type TranslationKey,
} from '../../lib/i18n'
import {
  createOllamaClient,
  isTrustedOllamaEndpoint,
  normalizeOllamaEndpoint,
} from '../../lib/ollama'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import {
  OllamaModelManager,
  type IOllamaManagerProvider,
  type IOllamaManagerProviderModel,
  type IOllamaModelManagerClient,
} from '../copilot/ollama-model-manager'
import { getOllamaModelManagerStrings } from '../copilot/ollama-model-manager-localization'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { LocalizedText } from '../lib/localized-text'
import { TextBox } from '../lib/text-box'
import { teleportAnchor } from '../../lib/teleport-targets'
import { MaterialSymbol } from '../lib/material-symbol'

/** The address a stock Ollama install listens on. */
export const DefaultOllamaEndpoint = 'http://127.0.0.1:11434'

/**
 * The provider name persisted when the setup state creates the managed
 * provider. Deliberately not localized: it is stored data shown in the Copilot
 * provider list, not display copy that may change with the language mode.
 */
const ManagedOllamaProviderName = 'Ollama'

const EndpointHintId = 'ollama-preferences-endpoint-hint'
const EndpointErrorId = 'ollama-preferences-endpoint-error'
const ProviderSelectId = 'ollama-preferences-provider'

type ConnectPhase = 'idle' | 'connecting'

interface IOllamaPreferencesProps {
  /**
   * The configured BYOK providers. Any entry that satisfies
   * {@linkcode isOllamaBYOKProvider} is manageable from this tab.
   */
  readonly byokProviders: ReadonlyArray<IBYOKProvider>

  /**
   * Persist a provider. The store treats an unknown id as an add, so the setup
   * state uses this single seam both to create the managed provider and to
   * synchronize its model list afterwards.
   */
  readonly onUpdateBYOKProvider: (
    provider: IBYOKProvider
  ) => Promise<void> | void

  /** Optional native-client seam for focused Preferences tests. */
  readonly ollamaClientFactory?: (endpoint: string) => IOllamaModelManagerClient

  /** Optional identifier seam so tests can assert a deterministic provider. */
  readonly createProviderId?: () => string
}

interface IOllamaPreferencesState {
  readonly languageMode: LanguageMode
  readonly selectedProviderId: string | null
  readonly endpoint: string
  readonly connectPhase: ConnectPhase
  readonly errorKey: TranslationKey | null
}

/**
 * The standalone Ollama settings tab.
 *
 * Unlike the Ollama surface embedded in Preferences → Copilot, this pane never
 * depends on Copilot access: the model manager is rendered directly as soon as
 * a loopback endpoint is configured, and the unconfigured case shows a setup
 * state rather than any Copilot sign-in content.
 */
export class OllamaPreferences extends React.Component<
  IOllamaPreferencesProps,
  IOllamaPreferencesState
> {
  private isMounted_ = false

  private localize(english: string, cantonese: string): string {
    switch (this.state.languageMode) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  public constructor(props: IOllamaPreferencesProps) {
    super(props)
    this.state = {
      languageMode: getPersistedLanguageMode(),
      selectedProviderId: null,
      endpoint: DefaultOllamaEndpoint,
      connectPhase: 'idle',
      errorKey: null,
    }
  }

  public componentDidMount() {
    this.isMounted_ = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    this.isMounted_ = false
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

  private get ollamaProviders(): ReadonlyArray<IBYOKProvider> {
    return this.props.byokProviders.filter(isOllamaBYOKProvider)
  }

  /**
   * The provider whose manager is rendered. Falls back to the first configured
   * Ollama provider so a removed selection never strands the pane.
   */
  private get activeProvider(): IBYOKProvider | null {
    const providers = this.ollamaProviders
    const selected = providers.find(
      provider => provider.id === this.state.selectedProviderId
    )
    return selected ?? providers[0] ?? null
  }

  private onSelectedProviderChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.setState({ selectedProviderId: event.currentTarget.value })
  }

  private onEndpointChanged = (endpoint: string) => {
    this.setState({ endpoint, errorKey: null })
  }

  private createClient = (provider: IOllamaManagerProvider) =>
    this.createClientForEndpoint(provider.baseUrl)

  private createClientForEndpoint = (
    endpoint: string
  ): IOllamaModelManagerClient => {
    const factory = this.props.ollamaClientFactory ?? createOllamaClient
    return factory(endpoint)
  }

  private onConnect = async () => {
    if (this.state.connectPhase === 'connecting') {
      return
    }

    const endpoint = this.state.endpoint.trim()
    if (!isTrustedOllamaEndpoint(endpoint)) {
      this.setState({ errorKey: 'ollama.setup.invalidEndpoint' })
      return
    }

    // Canonicalize before the probe so the persisted provider and the health
    // check always target the same loopback origin.
    const origin = normalizeOllamaEndpoint(endpoint)
    this.setState({ connectPhase: 'connecting', errorKey: null })

    try {
      await this.createClientForEndpoint(origin).health()
    } catch {
      if (this.isMounted_) {
        this.setState({
          connectPhase: 'idle',
          errorKey: 'ollama.setup.connectFailed',
        })
      }
      return
    }

    const provider: IBYOKProvider = {
      id: (this.props.createProviderId ?? (() => crypto.randomUUID()))(),
      name: ManagedOllamaProviderName,
      type: 'openai',
      // The manager talks to the native origin while the BYOK wire contract
      // stays on the OpenAI-compatible `/v1` base, matching a provider created
      // through the Copilot provider dialog.
      baseUrl: `${origin}/v1`,
      authKind: 'none',
      wireApi: 'completions',
      integration: 'ollama',
      models: [],
    }

    try {
      await this.props.onUpdateBYOKProvider(provider)
    } catch {
      if (this.isMounted_) {
        this.setState({
          connectPhase: 'idle',
          errorKey: 'ollama.setup.saveFailed',
        })
      }
      return
    }

    if (this.isMounted_) {
      this.setState({
        connectPhase: 'idle',
        errorKey: null,
        selectedProviderId: provider.id,
      })
    }
  }

  private onProviderModelsChanged = async (
    provider: IOllamaManagerProvider,
    models: ReadonlyArray<IOllamaManagerProviderModel>
  ) => {
    const currentProvider = this.props.byokProviders.find(
      candidate => candidate.id === provider.id
    )
    if (
      currentProvider === undefined ||
      !isOllamaBYOKProvider(currentProvider) ||
      currentProvider.baseUrl !== provider.baseUrl
    ) {
      return
    }

    const currentModels = new Map(
      currentProvider.models.map(model => [model.id, model])
    )
    const synchronizedModels: ReadonlyArray<IBYOKModel> = models.map(model => {
      const existing = currentModels.get(model.id)
      return existing?.reasoningEffort === undefined
        ? { id: model.id, name: model.name }
        : {
            id: model.id,
            name: model.name,
            reasoningEffort: existing.reasoningEffort,
          }
    })

    await this.props.onUpdateBYOKProvider({
      ...currentProvider,
      models: synchronizedModels,
    })
  }

  public render() {
    const { languageMode } = this.state
    const provider = this.activeProvider

    return (
      <DialogContent className="ollama-tab">
        <section className="ollama-tab-heading" data-verification="ollama-tab">
          <div className="ollama-tab-heading-icon" aria-hidden={true}>
            <MaterialSymbol name="smart_toy" />
          </div>
          <div>
            <h2>
              <LocalizedText
                translationKey="ollama.setup.heading"
                languageMode={languageMode}
              />
            </h2>
            <p>
              <LocalizedText
                translationKey="ollama.setup.description"
                languageMode={languageMode}
              />
            </p>
          </div>
        </section>

        <div className="ollama-tab-content">
          {provider === null
            ? this.renderSetup()
            : this.renderManager(provider)}
        </div>
      </DialogContent>
    )
  }

  private renderManager(provider: IBYOKProvider) {
    return (
      <>
        {this.renderProviderPicker()}
        <OllamaModelManager
          provider={provider}
          clientFactory={this.createClient}
          onProviderModelsChanged={this.onProviderModelsChanged}
          strings={getOllamaModelManagerStrings(this.state.languageMode)}
        />
      </>
    )
  }

  /**
   * Only rendered when more than one Ollama provider exists, so the common
   * single-endpoint case stays free of a redundant control.
   */
  private renderProviderPicker() {
    const providers = this.ollamaProviders
    if (providers.length < 2) {
      return null
    }

    const active = this.activeProvider
    return (
      <div className="ollama-tab-provider-picker">
        <label htmlFor={ProviderSelectId}>
          <LocalizedText
            translationKey="ollama.setup.providerLabel"
            languageMode={this.state.languageMode}
          />
        </label>
        <select
          id={ProviderSelectId}
          value={active?.id ?? ''}
          aria-describedby={
            settingExplanationDescriptionIds('ollama-provider-selection')
              .ariaDescribedBy
          }
          onChange={this.onSelectedProviderChanged}
        >
          {providers.map(provider => (
            <option key={provider.id} value={provider.id}>
              {`${provider.name} · ${provider.baseUrl}`}
            </option>
          ))}
        </select>
        <SettingExplanation
          settingId="ollama-provider-selection"
          summary={translate(
            'dialogEmoji.explanationSummary',
            this.state.languageMode
          )}
          explanation={this.localize(
            'Chooses which configured local Ollama provider this tab manages for the current settings session.',
            '揀呢個設定工作階段入面由呢個分頁管理邊個已設定本地 Ollama 供應方。'
          )}
          provenance={this.localize(
            `Current runtime selection: ${
              active?.name ?? 'none'
            }. Shipped runtime selection: first configured provider. Provider records persist through the BYOK provider store.`,
            `目前執行期選擇：${
              active?.name ?? '無'
            }。出廠執行期選擇：第一個已設定供應方。供應方紀錄由 BYOK 供應方儲存保留。`
          )}
          source="runtime-only"
        />
      </div>
    )
  }

  private renderSetup() {
    const { languageMode, endpoint, connectPhase, errorKey } = this.state
    const isConnecting = connectPhase === 'connecting'

    return (
      <section className="ollama-tab-setup" data-verification="ollama-setup">
        <h3>
          <LocalizedText
            translationKey="ollama.setup.notConfiguredTitle"
            languageMode={languageMode}
          />
        </h3>
        <p>
          <LocalizedText
            translationKey="ollama.setup.notConfiguredBody"
            languageMode={languageMode}
          />
        </p>

        <div
          className="ollama-tab-setup-endpoint"
          {...teleportAnchor('settings-ollama-endpoint')}
        >
          <TextBox
            label={
              <LocalizedText
                translationKey="ollama.setup.endpointLabel"
                languageMode={languageMode}
              />
            }
            value={endpoint}
            placeholder={DefaultOllamaEndpoint}
            onValueChanged={this.onEndpointChanged}
            onEnterPressed={this.onConnect}
            disabled={isConnecting}
            ariaDescribedBy={`${
              errorKey === null
                ? EndpointHintId
                : `${EndpointHintId} ${EndpointErrorId}`
            } ${
              settingExplanationDescriptionIds('ollama-endpoint')
                .ariaDescribedBy
            }`}
          />
          {/*
            Deliberately not disabled for an invalid endpoint: activating it
            explains what is wrong in the alert below, which a disabled control
            could not announce.
          */}
          <Button
            type="button"
            onClick={this.onConnect}
            disabled={isConnecting}
          >
            <LocalizedText
              translationKey={
                isConnecting
                  ? 'ollama.setup.connecting'
                  : 'ollama.setup.connect'
              }
              languageMode={languageMode}
            />
          </Button>
        </div>
        <SettingExplanation
          settingId="ollama-endpoint"
          summary={translate('dialogEmoji.explanationSummary', languageMode)}
          explanation={this.localize(
            'Sets the trusted loopback endpoint used to verify and create a local Ollama provider.',
            '設定用嚟驗證同建立本地 Ollama 供應方嘅可信 loopback 端點。'
          )}
          provenance={this.localize(
            `Current setup draft: ${endpoint}. Shipped setup draft: ${DefaultOllamaEndpoint}. A successful connection persists the endpoint in the created provider record.`,
            `目前設定草稿：${endpoint}。出廠設定草稿：${DefaultOllamaEndpoint}。成功連線後，端點會儲存喺新建供應方紀錄。`
          )}
          source="runtime-only"
        />

        <p className="ollama-tab-setup-hint" id={EndpointHintId}>
          <LocalizedText
            translationKey="ollama.setup.endpointHint"
            languageMode={languageMode}
          />
        </p>

        {errorKey !== null && (
          <p
            className="ollama-tab-setup-error"
            id={EndpointErrorId}
            role="alert"
          >
            <MaterialSymbol name="warning" />
            <LocalizedText
              translationKey={errorKey}
              languageMode={languageMode}
            />
          </p>
        )}

        <section className="ollama-tab-setup-guidance">
          <h4>
            <LocalizedText
              translationKey="ollama.setup.guidanceTitle"
              languageMode={languageMode}
            />
          </h4>
          <ul>
            <li>
              <LocalizedText
                translationKey="ollama.setup.guidanceInstall"
                languageMode={languageMode}
              />{' '}
              <LinkButton uri="https://ollama.com/download">
                ollama.com/download
              </LinkButton>
            </li>
            <li>
              <LocalizedText
                translationKey="ollama.setup.guidanceDefault"
                languageMode={languageMode}
              />
            </li>
            <li>
              <LocalizedText
                translationKey="ollama.setup.guidanceLocal"
                languageMode={languageMode}
              />
            </li>
          </ul>
        </section>
      </section>
    )
  }
}
