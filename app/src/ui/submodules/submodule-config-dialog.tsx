import * as React from 'react'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { IManagedSubmodule, SubmoduleConfigKey } from '../../lib/git'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'

/**
 * The sentinel select value meaning "clear the key so git's default applies".
 * Deliberately not a value git accepts for any managed key.
 */
const UseDefault = 'inherit-default'

interface ISubmoduleConfigDialogProps {
  readonly repository: Repository
  /** The reconciled submodule whose configuration seeds the form. */
  readonly submodule: IManagedSubmodule
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface ISubmoduleConfigDialogState {
  /** The edited remote URL; the empty string when none is declared. */
  readonly url: string

  /** The edited tracked branch; the empty string tracks the remote HEAD. */
  readonly branch: string

  /** The edited `submodule.<name>.update` value, or {@link UseDefault}. */
  readonly update: string

  /** The edited `submodule.<name>.ignore` value, or {@link UseDefault}. */
  readonly ignore: string

  /** The edited shallow-clone request; null defers to git's default. */
  readonly shallow: boolean | null

  /**
   * The edited `submodule.<name>.fetchRecurseSubmodules` value, or
   * {@link UseDefault}.
   */
  readonly fetchRecurseSubmodules: string

  /** True while the changed configuration writes run. */
  readonly isSaving: boolean

  /** True while a Sync / Init / Deinit action runs. */
  readonly isBusy: boolean

  /** True while the destructive Deinit action awaits confirmation. */
  readonly confirmingDeinit: boolean

  /** The most recent per-step operation error, surfaced inline. */
  readonly error: ILocalizedMessage | null
  readonly languageMode: LanguageMode
}

interface ILocalizedMessage {
  readonly key: TranslationKey
  readonly variables?: TranslationVariables
}

/** A single configuration write derived from diffing the form and its seed. */
interface ISaveStep {
  readonly errorKey: TranslationKey
  readonly errorVariables: TranslationVariables
  readonly run: () => Promise<void>
}

/**
 * The per-submodule configuration editor.
 *
 * Seeds a form from a reconciled {@link IManagedSubmodule} and, on save, diffs
 * it against that seed so only the changed values are written: the URL through
 * `git submodule set-url`, the branch through `git submodule set-branch`, and
 * the optional update/ignore/shallow/fetch-recursion keys through direct
 * `.gitmodules` edits (choosing "Use default" clears a key entirely). The
 * dialog also hosts the in-place Sync, Init, and Deinit actions for the
 * submodule; Deinit is destructive and asks for confirmation first.
 */
export class SubmoduleConfigDialog extends React.Component<
  ISubmoduleConfigDialogProps,
  ISubmoduleConfigDialogState
> {
  public constructor(props: ISubmoduleConfigDialogProps) {
    super(props)

    const { submodule } = props
    this.state = {
      url: submodule.url ?? '',
      branch: submodule.branch ?? '',
      update: submodule.update ?? UseDefault,
      ignore: submodule.ignore ?? UseDefault,
      shallow: submodule.shallow,
      fetchRecurseSubmodules: submodule.fetchRecurseSubmodules ?? UseDefault,
      isSaving: false,
      isBusy: false,
      confirmingDeinit: false,
      error: null,
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

  private renderMessage(message: ILocalizedMessage): JSX.Element {
    return (
      <LocalizedText
        translationKey={message.key}
        variables={message.variables}
        languageMode={this.state.languageMode}
      />
    )
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private getUrlError(): ILocalizedMessage | null {
    // set-url cannot clear a declared URL; removal is what Deinit/Remove are
    // for. An empty field is only valid when no URL was declared to begin with.
    return this.state.url.trim().length === 0 &&
      this.props.submodule.url !== null
      ? { key: 'submodule.configUrlRequired' }
      : null
  }

  private onUrlChanged = (url: string) => this.setState({ url, error: null })

  private onBranchChanged = (branch: string) =>
    this.setState({ branch, error: null })

  private onUpdateStrategyChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => this.setState({ update: event.currentTarget.value, error: null })

  private onIgnoreChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ ignore: event.currentTarget.value, error: null })

  private onFetchRecurseChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({
      fetchRecurseSubmodules: event.currentTarget.value,
      error: null,
    })

  private onShallowChanged = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState({ shallow: event.currentTarget.checked, error: null })

  private onShallowReset = () => this.setState({ shallow: null, error: null })

  /** Diff the form against its seed into the ordered configuration writes. */
  private buildSaveSteps(): ReadonlyArray<ISaveStep> {
    const { repository, submodule, dispatcher } = this.props
    const steps = new Array<ISaveStep>()

    const url = this.state.url.trim()
    if (url.length > 0 && url !== (submodule.url ?? '')) {
      steps.push({
        errorKey: 'submodule.configSetUrlFailed',
        errorVariables: { path: submodule.path },
        run: () => dispatcher.setSubmoduleUrl(repository, submodule.path, url),
      })
    }

    const branch = this.state.branch.trim()
    if (branch !== (submodule.branch ?? '')) {
      steps.push({
        errorKey: 'submodule.configSetBranchFailed',
        errorVariables: { path: submodule.path },
        run: () =>
          dispatcher.setSubmoduleBranch(
            repository,
            submodule.path,
            branch.length > 0 ? branch : null
          ),
      })
    }

    const selectKeys: ReadonlyArray<{
      readonly key: SubmoduleConfigKey
      readonly seed: string
      readonly value: string
    }> = [
      {
        key: 'update',
        seed: submodule.update ?? UseDefault,
        value: this.state.update,
      },
      {
        key: 'ignore',
        seed: submodule.ignore ?? UseDefault,
        value: this.state.ignore,
      },
      {
        key: 'fetchRecurseSubmodules',
        seed: submodule.fetchRecurseSubmodules ?? UseDefault,
        value: this.state.fetchRecurseSubmodules,
      },
    ]

    for (const { key, seed, value } of selectKeys) {
      if (value !== seed) {
        steps.push({
          errorKey: 'submodule.configSetKeyFailed',
          errorVariables: {
            setting: `submodule.${submodule.name}.${key}`,
          },
          run: () =>
            dispatcher.setSubmoduleConfigKey(
              repository,
              submodule.name,
              key,
              value === UseDefault ? null : value
            ),
        })
      }
    }

    if (this.state.shallow !== submodule.shallow) {
      const shallow = this.state.shallow
      steps.push({
        errorKey: 'submodule.configSetKeyFailed',
        errorVariables: {
          setting: `submodule.${submodule.name}.shallow`,
        },
        run: () =>
          dispatcher.setSubmoduleConfigKey(
            repository,
            submodule.name,
            'shallow',
            shallow === null ? null : shallow ? 'true' : 'false'
          ),
      })
    }

    return steps
  }

  private onSave = async () => {
    const steps = this.buildSaveSteps()
    if (steps.length === 0) {
      this.props.onDismissed()
      return
    }

    this.setState({ isSaving: true, error: null })

    for (const step of steps) {
      try {
        await step.run()
      } catch (error) {
        this.setState({
          isSaving: false,
          error: {
            key: step.errorKey,
            variables: {
              ...step.errorVariables,
              error: this.formatError(error),
            },
          },
        })
        return
      }
    }

    this.props.onDismissed()
  }

  private onSyncSubmodule = async () => {
    this.setState({ isBusy: true, error: null })
    try {
      await this.props.dispatcher.syncSubmodules(this.props.repository, [
        this.props.submodule.path,
      ])
      this.setState({ isBusy: false })
    } catch (error) {
      this.setState({
        isBusy: false,
        error: {
          key: 'submodule.configSyncFailed',
          variables: {
            path: this.props.submodule.path,
            error: this.formatError(error),
          },
        },
      })
    }
  }

  private onInit = async () => {
    this.setState({ isBusy: true, error: null })
    try {
      await this.props.dispatcher.initSubmodule(
        this.props.repository,
        this.props.submodule.path
      )
      this.setState({ isBusy: false })
    } catch (error) {
      this.setState({
        isBusy: false,
        error: {
          key: 'submodule.configInitFailed',
          variables: {
            path: this.props.submodule.path,
            error: this.formatError(error),
          },
        },
      })
    }
  }

  private onDeinitRequested = () =>
    this.setState({ confirmingDeinit: true, error: null })

  private onCancelDeinit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.setState({ confirmingDeinit: false })
  }

  private performDeinit = async () => {
    this.setState({ isBusy: true, error: null })
    try {
      // Force mirrors the Remove action: proceed even when the checkout has
      // local modifications, which the confirmation step just warned about.
      await this.props.dispatcher.deinitSubmodule(
        this.props.repository,
        this.props.submodule.path,
        true
      )
      this.props.onDismissed()
    } catch (error) {
      this.setState({
        isBusy: false,
        confirmingDeinit: false,
        error: {
          key: 'submodule.configDeinitFailed',
          variables: {
            path: this.props.submodule.path,
            error: this.formatError(error),
          },
        },
      })
    }
  }

  private renderShallowValue(): CheckboxValue {
    const { shallow } = this.state
    return shallow === null
      ? CheckboxValue.Mixed
      : shallow
      ? CheckboxValue.On
      : CheckboxValue.Off
  }

  private renderForm() {
    const { submodule } = this.props
    const busy = this.state.isSaving || this.state.isBusy
    const urlError = this.getUrlError()

    return (
      <>
        <DialogContent>
          <div className="submodule-config-fields">
            <TextBox
              label={
                <LocalizedText
                  translationKey="submodule.configRemoteUrlLabel"
                  languageMode={this.state.languageMode}
                />
              }
              placeholder="https://github.com/owner/repository.git"
              value={this.state.url}
              onValueChanged={this.onUrlChanged}
              spellcheck={false}
              ariaDescribedBy="submodule-config-url-help"
            />
            <TextBox
              label={
                <LocalizedText
                  translationKey="submodule.configBranchLabel"
                  languageMode={this.state.languageMode}
                />
              }
              placeholder={this.text(
                'submodule.addRemoteDefaultBranchPlaceholder'
              )}
              value={this.state.branch}
              onValueChanged={this.onBranchChanged}
              spellcheck={false}
              ariaDescribedBy="submodule-config-branch-help"
            />
            <Select
              label={this.text('submodule.configUpdateStrategyLabel')}
              value={this.state.update}
              onChange={this.onUpdateStrategyChanged}
            >
              <option value={UseDefault}>
                {this.text('submodule.configUseDefaultCheckout')}
              </option>
              <option value="checkout">
                {this.text('submodule.configCheckoutOption')}
              </option>
              <option value="rebase">
                {this.text('submodule.configRebaseOption')}
              </option>
              <option value="merge">
                {this.text('submodule.configMergeOption')}
              </option>
              <option value="none">
                {this.text('submodule.configNoneOption')}
              </option>
            </Select>
            <Select
              label={this.text('submodule.configIgnoreDirtyLabel')}
              value={this.state.ignore}
              onChange={this.onIgnoreChanged}
            >
              <option value={UseDefault}>
                {this.text('submodule.configUseDefaultNone')}
              </option>
              <option value="none">
                {this.text('submodule.configNoneOption')}
              </option>
              <option value="untracked">
                {this.text('submodule.configUntrackedOption')}
              </option>
              <option value="dirty">
                {this.text('submodule.configDirtyOption')}
              </option>
              <option value="all">
                {this.text('submodule.configAllOption')}
              </option>
            </Select>
            <Select
              label={this.text('submodule.configFetchRecurseLabel')}
              value={this.state.fetchRecurseSubmodules}
              onChange={this.onFetchRecurseChanged}
            >
              <option value={UseDefault}>
                {this.text('submodule.configUseDefaultOnDemand')}
              </option>
              <option value="yes">
                {this.text('submodule.configYesOption')}
              </option>
              <option value="on-demand">
                {this.text('submodule.configOnDemandOption')}
              </option>
              <option value="no">
                {this.text('submodule.configNoOption')}
              </option>
            </Select>
            <div className="submodule-config-shallow">
              <Checkbox
                label={
                  <LocalizedText
                    translationKey="submodule.configShallowCloneLabel"
                    languageMode={this.state.languageMode}
                  />
                }
                value={this.renderShallowValue()}
                onChange={this.onShallowChanged}
                ariaDescribedBy="submodule-config-shallow-help"
              />
              {this.state.shallow !== null && (
                <LinkButton
                  onClick={this.onShallowReset}
                  ariaLabel={this.accessibleText(
                    'submodule.configUseDefaultAction'
                  )}
                >
                  <LocalizedText
                    translationKey="submodule.configUseDefaultAction"
                    languageMode={this.state.languageMode}
                  />
                </LinkButton>
              )}
            </div>
          </div>
          <div className="submodule-config-help">
            <small id="submodule-config-url-help">
              {this.renderMessage(
                urlError ?? { key: 'submodule.configUrlHelp' }
              )}
            </small>
            <small id="submodule-config-branch-help">
              <LocalizedText
                translationKey="submodule.configBranchHelp"
                languageMode={this.state.languageMode}
              />
            </small>
            <small id="submodule-config-shallow-help">
              <LocalizedText
                translationKey="submodule.configShallowHelp"
                languageMode={this.state.languageMode}
              />
            </small>
          </div>
          <section
            className="submodule-config-actions"
            aria-label={this.accessibleText('submodule.configActionsLabel')}
          >
            <Button
              type="button"
              disabled={busy}
              onClick={this.onSyncSubmodule}
              tooltip={this.accessibleText('submodule.syncTooltip')}
              ariaLabel={this.accessibleText('submodule.syncAction')}
            >
              <LocalizedText
                translationKey="submodule.syncAction"
                languageMode={this.state.languageMode}
              />
            </Button>
            {submodule.status === 'uninitialized' && (
              <Button
                type="button"
                disabled={busy}
                onClick={this.onInit}
                tooltip={this.accessibleText('submodule.configInitTooltip')}
                ariaLabel={this.accessibleText('submodule.configInitAction')}
              >
                <LocalizedText
                  translationKey="submodule.configInitAction"
                  languageMode={this.state.languageMode}
                />
              </Button>
            )}
            <Button
              type="button"
              disabled={busy}
              onClick={this.onDeinitRequested}
              tooltip={this.accessibleText('submodule.configDeinitTooltip')}
              ariaLabel={this.accessibleText(
                'submodule.configDeinitRequestAction'
              )}
            >
              <LocalizedText
                translationKey="submodule.configDeinitRequestAction"
                languageMode={this.state.languageMode}
              />
            </Button>
          </section>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              <LocalizedText
                translationKey="submodule.configSaveAction"
                languageMode={this.state.languageMode}
              />
            }
            okButtonAriaLabel={this.accessibleText(
              'submodule.configSaveAction'
            )}
            okButtonDisabled={busy || urlError !== null}
            cancelButtonText={
              <LocalizedText
                translationKey="submodule.configCancelAction"
                languageMode={this.state.languageMode}
              />
            }
            cancelButtonAriaLabel={this.accessibleText(
              'submodule.configCancelAction'
            )}
          />
        </DialogFooter>
      </>
    )
  }

  private renderDeinitConfirmation() {
    const { submodule } = this.props

    return (
      <>
        <DialogContent>
          <p id="submodule-config-deinit-confirmation">
            <LocalizedText
              translationKey="submodule.configDeinitConfirmation"
              variables={{ path: submodule.path }}
              languageMode={this.state.languageMode}
            />
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={
              <LocalizedText
                translationKey="submodule.configDeinitAction"
                languageMode={this.state.languageMode}
              />
            }
            okButtonAriaLabel={this.accessibleText(
              'submodule.configDeinitAction'
            )}
            cancelButtonText={
              <LocalizedText
                translationKey="submodule.configCancelAction"
                languageMode={this.state.languageMode}
              />
            }
            cancelButtonAriaLabel={this.accessibleText(
              'submodule.configCancelAction'
            )}
            onCancelButtonClick={this.onCancelDeinit}
          />
        </DialogFooter>
      </>
    )
  }

  public render() {
    const busy = this.state.isSaving || this.state.isBusy
    const title = (
      <LocalizedText
        translationKey="submodule.configTitle"
        variables={{ name: this.props.submodule.name }}
        languageMode={this.state.languageMode}
      />
    )

    // A deinit failure returns to the form, so the confirmation never has an
    // inline error of its own to render.
    if (this.state.confirmingDeinit) {
      return (
        <Dialog
          id="submodule-config"
          title={title}
          titleId="submodule-config-title"
          type="warning"
          role="alertdialog"
          ariaDescribedBy="submodule-config-deinit-confirmation"
          onSubmit={this.performDeinit}
          onDismissed={this.props.onDismissed}
          disabled={busy}
          loading={busy}
        >
          {this.renderDeinitConfirmation()}
        </Dialog>
      )
    }

    return (
      <Dialog
        id="submodule-config"
        title={title}
        titleId="submodule-config-title"
        onSubmit={this.onSave}
        onDismissed={this.props.onDismissed}
        disabled={busy}
        loading={busy}
      >
        {this.state.error !== null && (
          <DialogError>{this.renderMessage(this.state.error)}</DialogError>
        )}
        {this.renderForm()}
      </Dialog>
    )
  }
}
