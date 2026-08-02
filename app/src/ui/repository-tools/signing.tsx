import * as React from 'react'
import {
  ICLICommandOutputEvent,
  ICLICommandStateEvent,
  ICLIWorkbenchOperationRequest,
  RepositorySigningFormat,
  RepositorySigningOperation,
  RepositorySigningScope,
} from '../../lib/cli-workbench'
import {
  getEffectiveRepositorySigningConfig,
  getRepositorySigningConfigToken,
  IRepositorySignatureVerification,
  IRepositorySigningConfig,
  IRepositorySigningEffectiveConfig,
  IRepositorySigningTag,
  normalizeRepositorySigningKey,
  parseRepositorySignatureVerification,
  parseRepositorySigningConfig,
  parseRepositorySigningKeyPresence,
  parseRepositorySigningTags,
  RepositorySignatureGrade,
} from '../../lib/repository-signing'
import {
  bilingualVariable,
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { Button } from '../lib/button'

const MaximumInspectionOutput = 64 * 1024

type SigningPhase =
  | 'idle'
  | 'inspecting-local-settings'
  | 'inspecting-local-key'
  | 'inspecting-global-settings'
  | 'inspecting-global-key'
  | 'ready'
  | 'review'
  | 'rechecking-settings'
  | 'rechecking-key'
  | 'applying'
  | 'refreshing'
  | 'verifying-head'
  | 'listing-tags'
  | 'verifying-tag'
  | 'cancelled'
  | 'failed'

interface ISigningClient {
  readonly start: (request: ICLIWorkbenchOperationRequest) => Promise<void>
  readonly cancel: (id: string) => Promise<boolean>
  readonly onOutput: (
    handler: (output: ICLICommandOutputEvent) => void
  ) => () => void
  readonly onState: (
    handler: (state: ICLICommandStateEvent) => void
  ) => () => void
}

export interface IRepositorySigningProps {
  readonly repositoryPath: string
  readonly disabled: boolean
  readonly client: ISigningClient
  readonly onRefreshRepository: () => Promise<void>
  readonly onBusyChanged: (busy: boolean) => void
}

interface ISigningReview {
  readonly scope: RepositorySigningScope
  readonly format: RepositorySigningFormat
  readonly key: string | null
  readonly commitSigning: boolean
  readonly tagSigning: boolean
  readonly configToken: string
}

interface IRepositorySigningState {
  readonly phase: SigningPhase
  readonly local: IRepositorySigningConfig | null
  readonly global: IRepositorySigningConfig | null
  readonly effective: IRepositorySigningEffectiveConfig | null
  readonly scope: RepositorySigningScope
  readonly format: RepositorySigningFormat
  readonly signingKey: string
  readonly commitSigning: boolean
  readonly tagSigning: boolean
  readonly review: ISigningReview | null
  readonly updateIndex: number
  readonly tags: ReadonlyArray<IRepositorySigningTag>
  readonly selectedTag: string
  readonly verification: IRepositorySignatureVerification | null
  readonly verificationTarget: string | null
  readonly status: ISigningMessage
  readonly error: ISigningMessage | null
  readonly languageMode: LanguageMode
}

interface ISigningMessage {
  readonly key: TranslationKey
  readonly variables?: TranslationVariables
}

interface IEditableSigningConfig {
  readonly format: RepositorySigningFormat
  readonly commitSigning: boolean
  readonly tagSigning: boolean
  readonly hasSigningKey: boolean
}

let nextSigningSequence = 0

function emptyConfig(scope: RepositorySigningScope): IRepositorySigningConfig {
  return {
    scope,
    format: null,
    hasSigningKey: false,
    signingKeyDescription: null,
    commitSigning: null,
    tagSigning: null,
  }
}

function signingMessage(
  key: TranslationKey,
  variables?: TranslationVariables
): ISigningMessage {
  return variables === undefined ? { key } : { key, variables }
}

class SigningMessageError extends Error {
  public constructor(public readonly signingMessage: ISigningMessage) {
    super(signingMessage.key)
  }
}

export class RepositorySigning extends React.Component<
  IRepositorySigningProps,
  IRepositorySigningState
> {
  private mounted = false
  private runId: string | null = null
  private commandStdout = ''
  private commandOutputTruncated = false
  private pendingSettingsOutput = ''
  private cancelRequested = false
  private mutationStarted = false
  private repositoryGeneration = 0
  private unsubscribeOutput: (() => void) | null = null
  private unsubscribeState: (() => void) | null = null
  private confirmButton: HTMLButtonElement | null = null

  public constructor(props: IRepositorySigningProps) {
    super(props)
    this.state = this.initialState()
  }

  private initialState(): IRepositorySigningState {
    return {
      phase: 'idle',
      local: null,
      global: null,
      effective: null,
      scope: 'local',
      format: 'openpgp',
      signingKey: '',
      commitSigning: false,
      tagSigning: false,
      review: null,
      updateIndex: 0,
      tags: [],
      selectedTag: '',
      verification: null,
      verificationTarget: null,
      status: signingMessage('repositorySigning.status.idle'),
      error: null,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    this.mounted = true
    this.subscribe(this.props.client)
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentDidUpdate(prevProps: IRepositorySigningProps) {
    const repositoryChanged =
      prevProps.repositoryPath !== this.props.repositoryPath
    const clientChanged = prevProps.client !== this.props.client
    if (!repositoryChanged && !clientChanged) {
      return
    }
    this.repositoryGeneration++
    this.cancelRun(clientChanged ? prevProps.client : this.props.client)
    if (clientChanged) {
      this.unsubscribe()
      this.subscribe(this.props.client)
    }
    this.props.onBusyChanged(false)
    this.mutationStarted = false
    this.setState(this.initialState())
  }

  public componentWillUnmount() {
    this.mounted = false
    this.repositoryGeneration++
    this.mutationStarted = false
    this.unsubscribe()
    this.cancelRun()
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

  private text = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

  private accessibleText = (
    key: TranslationKey,
    variables: TranslationVariables = {}
  ) => translateForAccessibleName(key, variables, this.state.languageMode)

  private renderMessage(message: ISigningMessage): string {
    return this.text(message.key, message.variables)
  }

  private errorMessage(
    error: unknown,
    fallbackKey: TranslationKey
  ): ISigningMessage {
    if (error instanceof SigningMessageError) {
      return error.signingMessage
    }
    if (error instanceof Error) {
      return signingMessage('repositorySigning.error.detail', {
        detail: error.message,
      })
    }
    return signingMessage(fallbackKey)
  }

  private throwMessage(
    key: TranslationKey,
    variables?: TranslationVariables
  ): never {
    throw new SigningMessageError(signingMessage(key, variables))
  }

  private scopeText(scope: RepositorySigningScope): string {
    return this.text(
      scope === 'local'
        ? 'repositorySigning.scope.local'
        : 'repositorySigning.scope.global'
    )
  }

  private gradeMessage(grade: RepositorySignatureGrade): ISigningMessage {
    switch (grade) {
      case 'good':
        return signingMessage('repositorySigning.grade.good')
      case 'bad':
        return signingMessage('repositorySigning.grade.bad')
      case 'good-unknown-validity':
        return signingMessage('repositorySigning.grade.goodUnknownValidity')
      case 'expired-signature':
        return signingMessage('repositorySigning.grade.expiredSignature')
      case 'expired-key':
        return signingMessage('repositorySigning.grade.expiredKey')
      case 'revoked-key':
        return signingMessage('repositorySigning.grade.revokedKey')
      case 'cannot-verify':
        return signingMessage('repositorySigning.grade.cannotVerify')
      case 'unsigned':
        return signingMessage('repositorySigning.grade.unsigned')
      default:
        return signingMessage('repositorySigning.grade.unknown')
    }
  }

  private subscribe(client: ISigningClient) {
    this.unsubscribeOutput = client.onOutput(this.onOutput)
    this.unsubscribeState = client.onState(this.onState)
  }

  private unsubscribe() {
    this.unsubscribeOutput?.()
    this.unsubscribeState?.()
    this.unsubscribeOutput = null
    this.unsubscribeState = null
  }

  private cancelRun(client: ISigningClient = this.props.client) {
    const id = this.runId
    this.runId = null
    if (id !== null) {
      void client.cancel(id).catch(() => {})
    }
  }

  private setBusy(busy: boolean) {
    this.props.onBusyChanged(busy)
  }

  private startCommand(
    phase: SigningPhase,
    operation: RepositorySigningOperation,
    confirmed: boolean
  ) {
    if (!this.mounted || this.runId !== null) {
      return
    }
    const id = `repository-signing-${Date.now()}-${++nextSigningSequence}`
    this.runId = id
    this.commandStdout = ''
    this.commandOutputTruncated = false
    this.cancelRequested = false
    this.setState({ phase, error: null })
    void this.props.client
      .start({
        id,
        repositoryPath: this.props.repositoryPath,
        operation,
        confirmed,
      })
      .catch(() => {
        if (this.mounted && this.runId === id) {
          this.runId = null
          this.fail(signingMessage('repositorySigning.error.start'))
        }
      })
  }

  private onOutput = (event: ICLICommandOutputEvent) => {
    if (!this.mounted || event.id !== this.runId) {
      return
    }
    if (event.stream === 'stdout') {
      const next = `${this.commandStdout}${event.data}`
      if (Buffer.byteLength(next, 'utf8') > MaximumInspectionOutput) {
        this.commandOutputTruncated = true
      } else {
        this.commandStdout = next
      }
    }
    if (event.data.includes('CLI workbench output truncated')) {
      this.commandOutputTruncated = true
    }
  }

  private onState = (event: ICLICommandStateEvent) => {
    if (!this.mounted || event.id !== this.runId) {
      return
    }
    if (event.state === 'running') {
      return
    }
    const phase = this.state.phase
    this.runId = null
    if (this.cancelRequested || event.state === 'cancelled') {
      this.cancelRequested = false
      const mutationStarted = this.mutationStarted
      this.mutationStarted = false
      this.setBusy(false)
      this.setState({
        phase: 'cancelled',
        review: null,
        status: mutationStarted
          ? signingMessage('repositorySigning.status.cancelledPartial')
          : signingMessage('repositorySigning.status.cancelledClean'),
        error: null,
      })
      return
    }
    if (this.commandOutputTruncated) {
      this.fail(signingMessage('repositorySigning.error.tooMuchData'))
      return
    }

    const emptyConfigResult =
      (phase === 'inspecting-local-settings' ||
        phase === 'inspecting-local-key' ||
        phase === 'inspecting-global-settings' ||
        phase === 'inspecting-global-key' ||
        phase === 'rechecking-settings' ||
        phase === 'rechecking-key') &&
      event.state === 'failed' &&
      event.exitCode === 1 &&
      this.commandStdout.length === 0
    if (event.state !== 'completed' && !emptyConfigResult) {
      this.fail(signingMessage('repositorySigning.error.gitFailed'))
      return
    }

    try {
      this.advance(phase)
    } catch (error) {
      this.fail(this.errorMessage(error, 'repositorySigning.status.failedSafe'))
    }
  }

  private advance(phase: SigningPhase) {
    switch (phase) {
      case 'inspecting-local-settings':
        this.pendingSettingsOutput = this.commandStdout
        this.startCommand(
          'inspecting-local-key',
          {
            id: 'repository-signing-inspection',
            scope: 'local',
            inspection: 'key-presence',
          },
          false
        )
        return
      case 'inspecting-local-key': {
        const local = parseRepositorySigningConfig(
          this.pendingSettingsOutput,
          'local',
          parseRepositorySigningKeyPresence(this.commandStdout)
        )
        this.setState({ local })
        this.startCommand(
          'inspecting-global-settings',
          {
            id: 'repository-signing-inspection',
            scope: 'global',
            inspection: 'settings',
          },
          false
        )
        return
      }
      case 'inspecting-global-settings':
        this.pendingSettingsOutput = this.commandStdout
        this.startCommand(
          'inspecting-global-key',
          {
            id: 'repository-signing-inspection',
            scope: 'global',
            inspection: 'key-presence',
          },
          false
        )
        return
      case 'inspecting-global-key': {
        const global = parseRepositorySigningConfig(
          this.pendingSettingsOutput,
          'global',
          parseRepositorySigningKeyPresence(this.commandStdout)
        )
        const local = this.state.local ?? emptyConfig('local')
        const effective = getEffectiveRepositorySigningConfig(local, global)
        this.setBusy(false)
        this.mutationStarted = false
        this.setState({
          phase: 'ready',
          global,
          effective,
          format: effective.format,
          commitSigning: effective.commitSigning,
          tagSigning: effective.tagSigning,
          signingKey: '',
          review: null,
          status: signingMessage('repositorySigning.status.inspected'),
          error: null,
        })
        return
      }
      case 'rechecking-settings':
        this.pendingSettingsOutput = this.commandStdout
        this.startCommand(
          'rechecking-key',
          {
            id: 'repository-signing-inspection',
            scope: this.requireReview().scope,
            inspection: 'key-presence',
          },
          false
        )
        return
      case 'rechecking-key': {
        const review = this.requireReview()
        const current = parseRepositorySigningConfig(
          this.pendingSettingsOutput,
          review.scope,
          parseRepositorySigningKeyPresence(this.commandStdout)
        )
        if (getRepositorySigningConfigToken(current) !== review.configToken) {
          this.throwMessage('repositorySigning.error.configChanged')
        }
        this.setState({ updateIndex: 0 })
        this.startNextUpdate(review, 0)
        return
      }
      case 'applying': {
        const review = this.requireReview()
        this.startNextUpdate(review, this.state.updateIndex + 1)
        return
      }
      case 'verifying-head':
        this.finishVerification('HEAD')
        return
      case 'listing-tags': {
        const tags = parseRepositorySigningTags(this.commandStdout)
        this.setBusy(false)
        this.setState({
          phase: 'ready',
          tags,
          selectedTag: tags[0]?.name ?? '',
          status:
            tags.length === 0
              ? signingMessage('repositorySigning.status.noTags')
              : signingMessage('repositorySigning.status.loadedTags', {
                  count: tags.length.toLocaleString(),
                  noun: bilingualVariable(
                    tags.length === 1 ? 'tag' : 'tags',
                    'tag'
                  ),
                }),
          error: null,
        })
        return
      }
      case 'verifying-tag': {
        const tag = this.state.tags.find(
          candidate => candidate.name === this.state.selectedTag
        )
        if (tag === undefined) {
          this.throwMessage('repositorySigning.error.tagUnavailable')
        }
        const verification = parseRepositorySignatureVerification(
          this.commandStdout
        )
        if (verification.object !== tag.object) {
          this.throwMessage('repositorySigning.error.tagChanged')
        }
        this.finishVerification(tag.name, verification)
        return
      }
      default:
        this.throwMessage('repositorySigning.error.unexpectedState')
    }
  }

  private requireReview(): ISigningReview {
    if (this.state.review === null) {
      this.throwMessage('repositorySigning.error.reviewUnavailable')
    }
    return this.state.review
  }

  /** Values belonging to one scope, with inherited values only for local UI. */
  private editableConfigForScope(
    scope: RepositorySigningScope
  ): IEditableSigningConfig {
    if (scope === 'local') {
      const effective = this.state.effective
      return {
        format: effective?.format ?? 'openpgp',
        commitSigning: effective?.commitSigning ?? false,
        tagSigning: effective?.tagSigning ?? false,
        hasSigningKey: effective?.hasSigningKey ?? false,
      }
    }

    const global = this.state.global
    return {
      format: global?.format ?? 'openpgp',
      commitSigning: global?.commitSigning ?? false,
      tagSigning: global?.tagSigning ?? false,
      hasSigningKey: global?.hasSigningKey ?? false,
    }
  }

  private updateOperations(
    review: ISigningReview
  ): ReadonlyArray<RepositorySigningOperation> {
    const operations = new Array<RepositorySigningOperation>(
      {
        id: 'repository-signing-update',
        scope: review.scope,
        operation: 'set-format',
        format: review.format,
      },
      {
        id: 'repository-signing-update',
        scope: review.scope,
        operation: 'set-commit-signing',
        enabled: review.commitSigning,
      },
      {
        id: 'repository-signing-update',
        scope: review.scope,
        operation: 'set-tag-signing',
        enabled: review.tagSigning,
      }
    )
    if (review.key !== null) {
      operations.splice(1, 0, {
        id: 'repository-signing-update',
        scope: review.scope,
        operation: 'set-key',
        format: review.format,
        key: review.key,
      })
    }
    return operations
  }

  private startNextUpdate(review: ISigningReview, index: number) {
    const operations = this.updateOperations(review)
    if (index >= operations.length) {
      this.setState({
        phase: 'refreshing',
        status: signingMessage('repositorySigning.status.updatedRefreshing'),
      })
      const repositoryPath = this.props.repositoryPath
      const generation = this.repositoryGeneration
      void this.props
        .onRefreshRepository()
        .catch(() => {})
        .then(() => {
          if (
            this.mounted &&
            this.props.repositoryPath === repositoryPath &&
            this.repositoryGeneration === generation
          ) {
            this.setState({ local: null, global: null, review: null })
            this.startCommand(
              'inspecting-local-settings',
              {
                id: 'repository-signing-inspection',
                scope: 'local',
                inspection: 'settings',
              },
              false
            )
          }
        })
      return
    }
    this.setState({
      updateIndex: index,
      status: signingMessage('repositorySigning.status.applying', {
        index: (index + 1).toLocaleString(),
        total: operations.length.toLocaleString(),
      }),
    })
    this.mutationStarted = true
    this.startCommand('applying', operations[index], true)
  }

  private finishVerification(
    target: string,
    parsed?: IRepositorySignatureVerification
  ) {
    const verification =
      parsed ?? parseRepositorySignatureVerification(this.commandStdout)
    this.setBusy(false)
    this.setState({
      phase: 'ready',
      verification,
      verificationTarget: target,
      status: signingMessage('repositorySigning.status.verification', {
        target,
        state: bilingualVariable(
          translate(
            this.gradeMessage(verification.grade).key,
            'english',
            this.gradeMessage(verification.grade).variables
          ),
          translate(
            this.gradeMessage(verification.grade).key,
            'cantonese',
            this.gradeMessage(verification.grade).variables
          )
        ),
      }),
      error: null,
    })
  }

  private fail(message: ISigningMessage) {
    const mutationStarted = this.mutationStarted
    this.runId = null
    this.cancelRequested = false
    this.mutationStarted = false
    this.setBusy(false)
    this.setState({
      phase: 'failed',
      review: null,
      status: mutationStarted
        ? signingMessage('repositorySigning.status.failedPartial')
        : signingMessage('repositorySigning.status.failedSafe'),
      error: mutationStarted
        ? signingMessage('repositorySigning.error.partial', {
            detail: bilingualVariable(
              translate(message.key, 'english', message.variables),
              translate(message.key, 'cantonese', message.variables)
            ),
          })
        : message,
    })
  }

  private onInspect = () => {
    if (this.props.disabled || this.runId !== null) {
      return
    }
    this.setBusy(true)
    this.mutationStarted = false
    this.setState({
      ...this.initialState(),
      phase: 'inspecting-local-settings',
      status: signingMessage('repositorySigning.status.inspecting'),
    })
    this.startCommand(
      'inspecting-local-settings',
      {
        id: 'repository-signing-inspection',
        scope: 'local',
        inspection: 'settings',
      },
      false
    )
  }

  private onReview = () => {
    if (
      this.props.disabled ||
      this.runId !== null ||
      this.state.phase !== 'ready'
    ) {
      return
    }
    try {
      const current =
        this.state.scope === 'local' ? this.state.local : this.state.global
      if (current === null) {
        this.throwMessage('repositorySigning.error.inspectFirst')
      }
      const editable = this.editableConfigForScope(this.state.scope)
      const replacementKey = this.state.signingKey.trim()
      if (
        replacementKey.length === 0 &&
        editable.hasSigningKey &&
        editable.format !== this.state.format
      ) {
        this.throwMessage('repositorySigning.error.formatNeedsKey')
      }
      const key =
        replacementKey.length === 0
          ? null
          : normalizeRepositorySigningKey(this.state.format, replacementKey)
      const review: ISigningReview = {
        scope: this.state.scope,
        format: this.state.format,
        key,
        commitSigning: this.state.commitSigning,
        tagSigning: this.state.tagSigning,
        configToken: getRepositorySigningConfigToken(current),
      }
      this.setState(
        {
          phase: 'review',
          review,
          status: signingMessage('repositorySigning.status.review'),
          error: null,
        },
        () => this.confirmButton?.focus()
      )
    } catch (error) {
      this.setState({
        error: this.errorMessage(error, 'repositorySigning.error.prepare'),
      })
    }
  }

  private onConfirm = () => {
    const review = this.state.review
    if (
      review === null ||
      this.state.phase !== 'review' ||
      this.props.disabled ||
      this.runId !== null
    ) {
      return
    }
    this.setBusy(true)
    this.setState({
      status: signingMessage('repositorySigning.status.rechecking'),
    })
    this.startCommand(
      'rechecking-settings',
      {
        id: 'repository-signing-inspection',
        scope: review.scope,
        inspection: 'settings',
      },
      false
    )
  }

  private onVerifyHead = () => {
    if (this.props.disabled || this.runId !== null) {
      return
    }
    this.setBusy(true)
    this.setState({
      status: signingMessage('repositorySigning.status.verifyingHead'),
    })
    this.startCommand(
      'verifying-head',
      {
        id: 'repository-signing-verify',
        target: 'head',
        tagName: null,
        expectedObject: null,
      },
      false
    )
  }

  private onLoadTags = () => {
    if (this.props.disabled || this.runId !== null) {
      return
    }
    this.setBusy(true)
    this.setState({
      status: signingMessage('repositorySigning.status.loadingTags'),
    })
    this.startCommand(
      'listing-tags',
      { id: 'repository-signing-list-tags' },
      false
    )
  }

  private onVerifyTag = () => {
    const tag = this.state.tags.find(
      candidate => candidate.name === this.state.selectedTag
    )
    if (tag === undefined || this.props.disabled || this.runId !== null) {
      return
    }
    this.setBusy(true)
    this.setState({
      status: signingMessage('repositorySigning.status.verifyingTag', {
        tag: tag.name,
      }),
    })
    this.startCommand(
      'verifying-tag',
      {
        id: 'repository-signing-verify',
        target: 'tag',
        tagName: tag.name,
        expectedObject: tag.object,
      },
      false
    )
  }

  private onCancel = () => {
    const id = this.runId
    if (id === null) {
      return
    }
    this.cancelRequested = true
    this.setState({
      status: signingMessage('repositorySigning.status.cancelling'),
      error: null,
    })
    void this.props.client.cancel(id).catch(() => {
      if (this.mounted && this.runId === id) {
        this.cancelRequested = false
        this.setState({
          error: signingMessage('repositorySigning.error.cancel'),
        })
      }
    })
  }

  private onScopeChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const scope = event.currentTarget.value as RepositorySigningScope
    const editable = this.editableConfigForScope(scope)
    this.setState({
      scope,
      format: editable.format,
      commitSigning: editable.commitSigning,
      tagSigning: editable.tagSigning,
      signingKey: '',
      review: null,
      error: null,
    })
  }

  private onFormatChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      format: event.currentTarget.value as RepositorySigningFormat,
      signingKey: '',
      error: null,
    })
  }

  private onKeyChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ signingKey: event.currentTarget.value, error: null })
  }

  private onCommitChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ commitSigning: event.currentTarget.checked, error: null })
  }

  private onTagChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ tagSigning: event.currentTarget.checked, error: null })
  }

  private onSelectedTagChanged = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    this.setState({ selectedTag: event.currentTarget.value, error: null })
  }

  private onGoBack = () => {
    this.setState({
      phase: 'ready',
      review: null,
      status: signingMessage('repositorySigning.status.changeAgain'),
      error: null,
    })
  }

  private onConfirmButtonRef = (button: HTMLButtonElement | null) => {
    this.confirmButton = button
  }

  private renderSummary() {
    const effective = this.state.effective
    return (
      <div className="repository-admin-state">
        <strong>{this.text('repositorySigning.summaryTitle')}</strong>
        <span>
          {effective === null
            ? this.text('repositorySigning.notInspected')
            : effective.format}
        </span>
        <dl>
          <div>
            <dt>{this.text('repositorySigning.keyLabel')}</dt>
            <dd>
              {effective?.hasSigningKey
                ? `${effective.signingKeyDescription} (${this.scopeText(
                    effective.signingKeyScope ?? 'local'
                  )})`
                : this.text('repositorySigning.notConfigured')}
            </dd>
          </div>
          <div>
            <dt>{this.text('repositorySigning.commitLabel')}</dt>
            <dd>
              {this.text(
                effective?.commitSigning
                  ? 'repositorySigning.enabled'
                  : 'repositorySigning.disabled'
              )}
            </dd>
          </div>
          <div>
            <dt>{this.text('repositorySigning.tagLabel')}</dt>
            <dd>
              {this.text(
                effective?.tagSigning
                  ? 'repositorySigning.enabled'
                  : 'repositorySigning.disabled'
              )}
            </dd>
          </div>
        </dl>
      </div>
    )
  }

  private renderForm() {
    if (this.state.effective === null || this.state.phase !== 'ready') {
      return null
    }
    return (
      <div className="repository-admin-form">
        <label htmlFor="repository-signing-scope">
          {this.text('repositorySigning.scopeLabel')}
        </label>
        <select
          id="repository-signing-scope"
          value={this.state.scope}
          disabled={this.props.disabled}
          onChange={this.onScopeChanged}
        >
          <option value="local">
            {this.text('repositorySigning.scope.local')}
          </option>
          <option value="global">
            {this.text('repositorySigning.scope.global')}
          </option>
        </select>
        <label htmlFor="repository-signing-format">
          {this.text('repositorySigning.formatLabel')}
        </label>
        <select
          id="repository-signing-format"
          value={this.state.format}
          disabled={this.props.disabled}
          onChange={this.onFormatChanged}
        >
          <option value="openpgp">OpenPGP</option>
          <option value="ssh">SSH</option>
          <option value="x509">X.509</option>
        </select>
        <label htmlFor="repository-signing-key">
          {this.text('repositorySigning.replacementKeyLabel')}
        </label>
        <input
          id="repository-signing-key"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={this.state.signingKey}
          disabled={this.props.disabled}
          aria-describedby="repository-signing-key-help"
          onChange={this.onKeyChanged}
        />
        <p id="repository-signing-key-help" className="repository-admin-help">
          {this.text('repositorySigning.replacementKeyHelp')}
        </p>
        <label className="repository-admin-check">
          <input
            type="checkbox"
            checked={this.state.commitSigning}
            disabled={this.props.disabled}
            onChange={this.onCommitChanged}
          />
          {this.text('repositorySigning.signCommits')}
        </label>
        <label className="repository-admin-check">
          <input
            type="checkbox"
            checked={this.state.tagSigning}
            disabled={this.props.disabled}
            onChange={this.onTagChanged}
          />
          {this.text('repositorySigning.signTags')}
        </label>
        <Button
          className="repository-tool-write-button"
          disabled={this.props.disabled}
          onClick={this.onReview}
          ariaLabel={this.accessibleText('repositorySigning.reviewAction')}
        >
          {this.text('repositorySigning.reviewAction')}
        </Button>
      </div>
    )
  }

  private renderReview() {
    const review = this.state.review
    if (this.state.phase !== 'review' || review === null) {
      return null
    }
    return (
      <div
        className="repository-admin-confirmation"
        role="alertdialog"
        aria-labelledby="repository-signing-review-title"
        aria-describedby="repository-signing-review-description"
      >
        <strong id="repository-signing-review-title">
          {this.text('repositorySigning.reviewTitle')}
        </strong>
        <dl>
          <div>
            <dt>{this.text('repositorySigning.review.scope')}</dt>
            <dd>{this.scopeText(review.scope)}</dd>
          </div>
          <div>
            <dt>{this.text('repositorySigning.review.format')}</dt>
            <dd>{review.format}</dd>
          </div>
          <div>
            <dt>{this.text('repositorySigning.review.publicKey')}</dt>
            <dd>
              {review.key === null
                ? this.text('repositorySigning.review.preserveKey')
                : this.text('repositorySigning.review.replaceKey')}
            </dd>
          </div>
          <div>
            <dt>{this.text('repositorySigning.review.defaults')}</dt>
            <dd>
              {this.text(
                review.commitSigning
                  ? 'repositorySigning.review.commitOn'
                  : 'repositorySigning.review.commitOff'
              )}
              ;{' '}
              {this.text(
                review.tagSigning
                  ? 'repositorySigning.review.tagOn'
                  : 'repositorySigning.review.tagOff'
              )}
            </dd>
          </div>
        </dl>
        <p id="repository-signing-review-description">
          {this.text('repositorySigning.review.description')}
        </p>
        <div className="repository-tool-controls">
          <Button
            className="repository-tool-confirm-button"
            onButtonRef={this.onConfirmButtonRef}
            disabled={this.props.disabled}
            onClick={this.onConfirm}
            ariaLabel={this.accessibleText('repositorySigning.applyAction')}
          >
            {this.text('repositorySigning.applyAction')}
          </Button>
          <Button
            disabled={this.props.disabled}
            onClick={this.onGoBack}
            ariaLabel={this.accessibleText('repositorySigning.goBack')}
          >
            {this.text('repositorySigning.goBack')}
          </Button>
        </div>
      </div>
    )
  }

  private renderVerification() {
    const verification = this.state.verification
    return (
      <div className="repository-admin-verification">
        <strong>{this.text('repositorySigning.verificationTitle')}</strong>
        <div className="repository-tool-controls">
          <Button
            disabled={this.props.disabled || this.runId !== null}
            onClick={this.onVerifyHead}
            ariaLabel={this.accessibleText('repositorySigning.verifyHead')}
          >
            {this.text('repositorySigning.verifyHead')}
          </Button>
          <Button
            disabled={this.props.disabled || this.runId !== null}
            onClick={this.onLoadTags}
            ariaLabel={this.accessibleText('repositorySigning.loadTags')}
          >
            {this.text('repositorySigning.loadTags')}
          </Button>
        </div>
        {this.state.tags.length > 0 && (
          <div className="repository-admin-inline-form">
            <label htmlFor="repository-signing-tag">
              {this.text('repositorySigning.annotatedTag')}
            </label>
            <select
              id="repository-signing-tag"
              value={this.state.selectedTag}
              disabled={this.props.disabled || this.runId !== null}
              onChange={this.onSelectedTagChanged}
            >
              {this.state.tags.map(tag => (
                <option key={tag.object} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
            <Button
              disabled={this.props.disabled || this.runId !== null}
              onClick={this.onVerifyTag}
              ariaLabel={this.accessibleText('repositorySigning.verifyTag')}
            >
              {this.text('repositorySigning.verifyTag')}
            </Button>
          </div>
        )}
        {verification !== null && (
          <dl className="repository-admin-verification-result">
            <div>
              <dt>{this.text('repositorySigning.result.target')}</dt>
              <dd>{this.state.verificationTarget}</dd>
            </div>
            <div>
              <dt>{this.text('repositorySigning.result.state')}</dt>
              <dd>
                {this.renderMessage(this.gradeMessage(verification.grade))}
              </dd>
            </div>
            <div>
              <dt>{this.text('repositorySigning.result.signer')}</dt>
              <dd>
                {verification.fingerprint ??
                  verification.key ??
                  this.text('repositorySigning.result.notReported')}
              </dd>
            </div>
          </dl>
        )}
      </div>
    )
  }

  public render() {
    const active = this.runId !== null
    return (
      <section
        className="repository-tools-category repository-signing"
        aria-labelledby="repository-signing-title"
      >
        <h2 id="repository-signing-title">
          {this.text('repositorySigning.title')}
        </h2>
        <article className="repository-tool-card repository-admin-card">
          <div>
            <h3>{this.text('repositorySigning.cardTitle')}</h3>
            <p>{this.text('repositorySigning.intro')}</p>
          </div>
          {this.renderSummary()}
          <div className="repository-tool-controls">
            <Button
              disabled={
                this.props.disabled || active || this.state.phase === 'review'
              }
              onClick={this.onInspect}
              ariaLabel={this.accessibleText(
                this.state.effective === null
                  ? 'repositorySigning.inspectAction'
                  : 'repositorySigning.inspectAgainAction'
              )}
            >
              {this.state.effective === null
                ? this.text('repositorySigning.inspectAction')
                : this.text('repositorySigning.inspectAgainAction')}
            </Button>
            {active && (
              <Button
                onClick={this.onCancel}
                ariaLabel={this.accessibleText(
                  'repositorySigning.cancelAction'
                )}
              >
                {this.text('repositorySigning.cancelAction')}
              </Button>
            )}
          </div>
          {this.renderForm()}
          {this.renderReview()}
          {this.state.effective !== null &&
            this.state.phase !== 'review' &&
            this.renderVerification()}
          <div className="repository-admin-results">
            <div role="status" aria-live="polite">
              {this.renderMessage(this.state.status)}
            </div>
            {this.state.error !== null && (
              <p className="repository-tools-error" role="alert">
                {this.renderMessage(this.state.error)}
              </p>
            )}
          </div>
        </article>
      </section>
    )
  }
}
