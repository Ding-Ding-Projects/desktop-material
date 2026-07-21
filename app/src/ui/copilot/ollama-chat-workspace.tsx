import * as React from 'react'

import { clipboard } from 'electron'
import { Disposable } from 'event-kit'

import {
  accentPalettes,
  AccentPalette,
  SurfacePalette,
} from '../../models/appearance-customization'
import {
  ChatImageMediaType,
  DefaultChatTitle,
  IChatImageAttachment,
  IChatSessionDocument,
  MaxChatImageBase64Length,
  MaxChatImagesPerMessage,
  MaxChatImagesTotalBase64Length,
  MaxChatMessageContentLength,
  MaxChatTitleLength,
  matchesChatImageSignature,
  toOllamaChatMessages,
} from '../../models/chat-session'
import { tabTitleStyleToCss } from '../../models/repository-tab'
import { ChatSessionStore } from '../../lib/stores/chat-session-store'
import {
  ChatSessionsStore,
  IChatSessionsState,
} from '../../lib/stores/chat-sessions-store'
import { DialogStackContext } from '../dialog'
import { ToolbarTextStyleEditor } from '../appearance/toolbar-text-style-editor'
import { Button } from '../lib/button'
import {
  IVersionedStoreHistoryStrings,
  IVersionedStoreHistorySource,
  VersionedStoreHistory,
} from '../version-history'
import type {
  IOllamaChatDelta,
  IOllamaModelManagerClient,
} from './ollama-model-manager'

export interface IOllamaChatWorkspaceStrings {
  readonly chatTitle: string
  readonly chatHint: string
  readonly chatModelLabel: string
  readonly chatPlaceholder: string
  readonly chatSend: string
  readonly chatStop: string
  readonly chatStreaming: string
  readonly chatEmpty: string
  readonly chatNoModel: string
  readonly chatError: string
  readonly chatYou: string
  readonly chatAssistant: string
  readonly chatSystem: string
  readonly chatMessageLabel: string
  readonly chatSessionsHeading: string
  readonly chatDefaultTitle: string
  readonly chatNew: string
  readonly chatRename: string
  readonly chatDelete: string
  readonly chatCancel: string
  readonly chatConfirmDelete: string
  readonly chatSelectPrompt: string
  readonly chatLoading: string
  readonly chatLoadError: string
  readonly chatCopy: string
  readonly chatAttachImage: string
  readonly chatRemoveImage: string
  readonly chatUnsupportedImage: string
  readonly chatImageTooLarge: string
  readonly chatClearDraft: string
  readonly chatCustomize: string
  readonly chatHistory: string
  readonly chatAppearanceHeading: string
  readonly chatAccentLabel: string
  readonly chatSurfaceLabel: string
  readonly chatSurfaceTonal: string
  readonly chatSurfaceNeutral: string
  readonly chatMessageFont: string
  readonly chatComposerFont: string
  readonly chatSettingsHint: string
  readonly chatHistoryTitle: string
  readonly chatHistoryTimeline: string
  readonly chatHistoryDescription: string
  readonly chatHistoryStrings: IVersionedStoreHistoryStrings
  readonly chatHistorySummary: (summary: string) => string
  readonly chatHistoryTimestamp: (date: Date) => string
  readonly chatHistoryError: string
  readonly chatDeletePrompt: (title: string) => string
  readonly chatMessageCount: (count: number) => string
  readonly chatImageAlt: (index: number) => string
  readonly chatImageLimit: (count: number) => string
  readonly chatAccentName: (palette: AccentPalette) => string
}

export interface IOllamaChatWorkspaceProps {
  readonly ownerId: string
  /** Test/embedding override; production defaults to the provider-scoped userData root. */
  readonly sessionsRootPath?: string
  readonly client: IOllamaModelManagerClient
  readonly models: ReadonlyArray<string>
  readonly preferredModel: string | null
  readonly strings: IOllamaChatWorkspaceStrings
}

interface IOllamaChatWorkspaceState {
  readonly initialized: boolean
  readonly sessions: IChatSessionsState['sessions']
  readonly activeSessionId: string | null
  readonly session: IChatSessionDocument | null
  readonly input: string
  readonly images: ReadonlyArray<IChatImageAttachment>
  readonly streaming: boolean
  readonly streamingText: string
  readonly error: string | null
  readonly settingsOpen: boolean
  readonly historyOpen: boolean
  readonly historySource: IVersionedStoreHistorySource | null
  readonly deletingSessionId: string | null
  readonly deletingBusyId: string | null
  readonly editingSessionId: string | null
  readonly editingTitle: string
}

const InitialState: IOllamaChatWorkspaceState = {
  initialized: false,
  sessions: [],
  activeSessionId: null,
  session: null,
  input: '',
  images: [],
  streaming: false,
  streamingText: '',
  error: null,
  settingsOpen: false,
  historyOpen: false,
  historySource: null,
  deletingSessionId: null,
  deletingBusyId: null,
  editingSessionId: null,
  editingTitle: '',
}

const ChatImageMediaTypes = new Set<ChatImageMediaType>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** Persisted multi-conversation workspace for one Ollama provider. */
export class OllamaChatWorkspace extends React.Component<
  IOllamaChatWorkspaceProps,
  IOllamaChatWorkspaceState
> {
  private readonly sessionsStore = new ChatSessionsStore()
  private sessionsSubscription: Disposable | null = null
  private sessionSubscription: Disposable | null = null
  private activeStore: ChatSessionStore | null = null
  private chatController: AbortController | null = null
  private chatRequestId = 0
  private navigationRequestId = 0
  private fileInput: HTMLInputElement | null = null
  private transcript: HTMLDivElement | null = null
  private mounted = false

  public constructor(props: IOllamaChatWorkspaceProps) {
    super(props)
    this.state = InitialState
  }

  public componentDidMount(): void {
    this.mounted = true
    this.sessionsSubscription = this.sessionsStore.onDidUpdate(
      this.onSessionsUpdated
    )
    void this.initialize()
  }

  public componentDidUpdate(
    prevProps: IOllamaChatWorkspaceProps,
    prevState: IOllamaChatWorkspaceState
  ): void {
    if (prevProps.ownerId !== this.props.ownerId) {
      return
    }
    if (
      prevState.session?.messages !== this.state.session?.messages ||
      prevState.streamingText !== this.state.streamingText
    ) {
      this.scrollToBottom()
    }
  }

  public componentWillUnmount(): void {
    this.mounted = false
    ++this.navigationRequestId
    this.invalidateChat()
    this.sessionsSubscription?.dispose()
    this.sessionSubscription?.dispose()
    void this.sessionsStore.flush().catch(() => undefined)
    this.sessionsStore.dispose()
  }

  private initialize = async () => {
    try {
      await this.sessionsStore.initialize(
        this.props.sessionsRootPath,
        this.props.ownerId
      )
      const sessions = this.sessionsStore.getState().sessions
      if (!this.mounted) {
        return
      }
      this.setState({ initialized: true, sessions })
      if (sessions.length > 0) {
        await this.switchSession(sessions[0].id)
      } else if (this.props.models.length > 0) {
        await this.createSession()
      }
    } catch {
      if (this.mounted) {
        this.setState({
          initialized: true,
          error: this.props.strings.chatLoadError,
        })
      }
    }
  }

  private onSessionsUpdated = (state: IChatSessionsState) => {
    if (!this.mounted) {
      return
    }
    this.setState({
      initialized: state.initialized,
      sessions: state.sessions,
    })
  }

  private observeSession(store: ChatSessionStore): void {
    this.sessionSubscription?.dispose()
    this.activeStore = store
    this.sessionSubscription = store.onDidUpdate(state => {
      if (this.mounted && this.activeStore === store) {
        this.setState({ session: state.session })
      }
    })
    this.setState({ session: store.getState().session })
  }

  private createSession = async () => {
    if (this.props.models.length === 0) {
      return
    }
    const navigationId = ++this.navigationRequestId
    this.invalidateChat()
    this.setState({ streaming: false, streamingText: '' })
    try {
      const store = await this.sessionsStore.create({
        model: this.props.preferredModel ?? this.props.models[0] ?? '',
      })
      if (!this.mounted || navigationId !== this.navigationRequestId) {
        return
      }
      this.observeSession(store)
      this.setState({
        activeSessionId: store.getState().session.id,
        input: '',
        images: [],
        error: null,
        settingsOpen: false,
        historyOpen: false,
        historySource: null,
      })
    } catch {
      if (this.mounted && navigationId === this.navigationRequestId) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    }
  }

  private switchSession = async (id: string) => {
    if (id === this.state.activeSessionId && this.activeStore !== null) {
      return
    }
    const navigationId = ++this.navigationRequestId
    this.invalidateChat()
    this.setState({ streaming: false, streamingText: '' })
    try {
      const store = await this.sessionsStore.getSession(id)
      if (!this.mounted || navigationId !== this.navigationRequestId) {
        return
      }
      this.sessionsStore.activateLoadedSession(id)
      this.observeSession(store)
      this.setState({
        activeSessionId: id,
        input: '',
        images: [],
        error: null,
        settingsOpen: false,
        historyOpen: false,
        historySource: null,
      })
    } catch {
      if (this.mounted && navigationId === this.navigationRequestId) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    }
  }

  private renameSession = async (id: string, title: string) => {
    this.setState({ editingSessionId: null, editingTitle: '' })
    try {
      const normalizedTitle =
        title.trim().length === 0 ||
        title === this.props.strings.chatDefaultTitle
          ? DefaultChatTitle
          : title
      await this.sessionsStore.rename(id, normalizedTitle)
    } catch {
      if (this.mounted) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    }
  }

  private deleteSession = async (id: string) => {
    if (this.state.deletingBusyId !== null) {
      return
    }
    const navigationId = ++this.navigationRequestId
    const deletingActive = id === this.state.activeSessionId
    if (deletingActive) {
      this.invalidateChat()
    }
    if (deletingActive) {
      this.setState({
        deletingBusyId: id,
        streaming: false,
        streamingText: '',
      })
    } else {
      this.setState({ deletingBusyId: id })
    }
    try {
      await this.sessionsStore.delete(id)
      if (!this.mounted) {
        return
      }
      if (deletingActive && navigationId === this.navigationRequestId) {
        const next = this.sessionsStore.getState().sessions[0]
        this.sessionSubscription?.dispose()
        this.sessionSubscription = null
        this.activeStore = null
        this.setState({
          session: null,
          activeSessionId: null,
          input: '',
          images: [],
        })
        if (next !== undefined) {
          await this.switchSession(next.id)
        }
      }
    } catch {
      if (this.mounted) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    } finally {
      if (this.mounted) {
        this.setState({ deletingSessionId: null, deletingBusyId: null })
      }
    }
  }

  private effectiveModel(): string | null {
    const selected = this.state.session?.model
    if (selected !== undefined && this.props.models.includes(selected)) {
      return selected
    }
    return this.props.preferredModel ?? this.props.models[0] ?? null
  }

  private onModelChanged = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const id = this.state.activeSessionId
    if (id === null) {
      return
    }
    this.invalidateChat()
    try {
      await this.sessionsStore.setModel(id, event.currentTarget.value)
    } catch {
      if (this.mounted) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    }
  }

  private canSend(): boolean {
    return (
      this.state.activeSessionId !== null &&
      this.effectiveModel() !== null &&
      !this.state.streaming &&
      (this.state.input.trim().length > 0 || this.state.images.length > 0)
    )
  }

  private send = async () => {
    const id = this.state.activeSessionId
    const store = this.activeStore
    const model = this.effectiveModel()
    const draftInput = this.state.input
    const content = this.state.input.trim()
    const images = this.state.images
    if (id === null || store === null || model === null || !this.canSend()) {
      return
    }

    const requestId = ++this.chatRequestId
    const controller = new AbortController()
    this.chatController?.abort()
    this.chatController = controller
    this.setState({
      streaming: true,
      streamingText: '',
      error: null,
    })

    try {
      if (this.state.session?.model !== model) {
        await this.sessionsStore.setModel(id, model)
      }
      if (
        this.state.session?.title === DefaultChatTitle &&
        content.length > 0
      ) {
        await this.sessionsStore.rename(
          id,
          content.replace(/\s+/g, ' ').slice(0, 60)
        )
      }
      await this.sessionsStore.appendMessage(id, {
        role: 'user',
        content,
        ...(images.length === 0 ? {} : { images }),
      })
      if (this.mounted && this.state.activeSessionId === id) {
        this.setState(state => ({
          input: state.input === draftInput ? '' : state.input,
          images: state.images === images ? [] : state.images,
        }))
      }
      if (!this.isCurrentChat(requestId, controller)) {
        return
      }
      const persisted = await store.get()
      if (!this.isCurrentChat(requestId, controller)) {
        return
      }

      const response = await this.props.client.chat!(
        model,
        toOllamaChatMessages(persisted.messages),
        {
          signal: controller.signal,
          onChunk: delta => this.onDelta(requestId, controller, delta),
        }
      )
      if (!this.isCurrentChat(requestId, controller)) {
        return
      }
      const assistant = response.slice(0, MaxChatMessageContentLength)
      if (assistant.length > 0) {
        await this.sessionsStore.appendMessage(id, {
          role: 'assistant',
          content: assistant,
        })
      }
      if (this.isCurrentChat(requestId, controller)) {
        this.chatController = null
        this.setState({ streaming: false, streamingText: '' })
      }
    } catch {
      if (!this.isCurrentChat(requestId, controller)) {
        return
      }
      this.chatController = null
      this.setState({
        streaming: false,
        streamingText: '',
        error: this.props.strings.chatError,
      })
    }
  }

  private onDelta(
    requestId: number,
    controller: AbortController,
    delta: IOllamaChatDelta
  ): void {
    if (
      !this.isCurrentChat(requestId, controller) ||
      delta.content.length === 0
    ) {
      return
    }
    this.setState(state => ({
      streamingText: (state.streamingText + delta.content).slice(
        0,
        MaxChatMessageContentLength
      ),
    }))
  }

  private stop = () => {
    const id = this.state.activeSessionId
    const partial = this.state.streamingText
    this.invalidateChat()
    this.setState({ streaming: false, streamingText: '' })
    if (id !== null && partial.length > 0) {
      void this.sessionsStore
        .appendMessage(id, { role: 'assistant', content: partial })
        .catch(() => this.setState({ error: this.props.strings.chatLoadError }))
    }
  }

  private invalidateChat(): void {
    ++this.chatRequestId
    this.chatController?.abort()
    this.chatController = null
  }

  private isCurrentChat(
    requestId: number,
    controller: AbortController
  ): boolean {
    return (
      this.mounted &&
      requestId === this.chatRequestId &&
      !controller.signal.aborted
    )
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    void this.send()
  }

  private onInputChanged = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({
      input: event.currentTarget.value.slice(0, MaxChatMessageContentLength),
    })
  }

  private onInputKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void this.send()
    }
  }

  private onPaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const files = Array.from(event.clipboardData.items)
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) {
      return
    }
    await this.ingestImages(files)
  }

  private onFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.currentTarget.files !== null) {
      await this.ingestImages(Array.from(event.currentTarget.files))
    }
    if (this.fileInput !== null) {
      this.fileInput.value = ''
    }
  }

  private ingestImages = async (files: ReadonlyArray<File>) => {
    const remaining = MaxChatImagesPerMessage - this.state.images.length
    if (remaining <= 0) {
      this.setState({
        error: this.props.strings.chatImageLimit(MaxChatImagesPerMessage),
      })
      return
    }

    const accepted = new Array<IChatImageAttachment>()
    let totalLength = this.state.images.reduce(
      (total, image) => total + image.data.length,
      0
    )
    for (const file of files.slice(0, remaining)) {
      const mediaType = file.type as ChatImageMediaType
      if (!ChatImageMediaTypes.has(mediaType)) {
        this.setState({ error: this.props.strings.chatUnsupportedImage })
        continue
      }
      if (file.size > Math.floor((MaxChatImageBase64Length * 3) / 4)) {
        this.setState({ error: this.props.strings.chatImageTooLarge })
        continue
      }
      let image: IChatImageAttachment | null
      try {
        image = await readValidatedImage(file, mediaType)
      } catch {
        image = null
      }
      if (image === null) {
        this.setState({ error: this.props.strings.chatUnsupportedImage })
        continue
      }
      if (totalLength + image.data.length > MaxChatImagesTotalBase64Length) {
        this.setState({ error: this.props.strings.chatImageTooLarge })
        continue
      }
      accepted.push(image)
      totalLength += image.data.length
    }

    if (files.length > remaining) {
      this.setState({
        error: this.props.strings.chatImageLimit(MaxChatImagesPerMessage),
      })
    }
    if (accepted.length > 0) {
      this.setState(state => {
        const images = [...state.images]
        let currentLength = images.reduce(
          (total, image) => total + image.data.length,
          0
        )
        for (const image of accepted) {
          if (
            images.length >= MaxChatImagesPerMessage ||
            currentLength + image.data.length > MaxChatImagesTotalBase64Length
          ) {
            break
          }
          images.push(image)
          currentLength += image.data.length
        }
        return { images }
      })
    }
  }

  private removeImage = (index: number) => {
    this.setState(state => ({
      images: state.images.filter((_, candidate) => candidate !== index),
    }))
  }

  private cancelDelete = () => this.setState({ deletingSessionId: null })

  private onEditingTitleChanged = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => this.setState({ editingTitle: event.currentTarget.value })

  private toggleSettings = () =>
    this.setState(state => ({
      settingsOpen: !state.settingsOpen,
      historyOpen: false,
    }))

  private setTranscriptRef = (element: HTMLDivElement | null) => {
    this.transcript = element
  }

  private setFileInputRef = (element: HTMLInputElement | null) => {
    this.fileInput = element
  }

  private openImagePicker = () => this.fileInput?.click()

  private clearDraft = () => this.setState({ input: '', images: [] })

  private closeHistory = () => this.setState({ historyOpen: false })

  private onMessageFontChanged = (
    style: IChatSessionDocument['fontSettings']['messageStyle']
  ) => void this.setFontStyle('messageStyle', style)

  private onInputFontChanged = (
    style: IChatSessionDocument['fontSettings']['inputStyle']
  ) => void this.setFontStyle('inputStyle', style)

  private openHistory = async () => {
    const id = this.state.activeSessionId
    if (id === null || this.state.streaming) {
      return
    }
    const navigationId = this.navigationRequestId
    try {
      const historySource = await this.sessionsStore.getHistorySource(id)
      if (
        !this.mounted ||
        navigationId !== this.navigationRequestId ||
        id !== this.state.activeSessionId ||
        this.state.streaming
      ) {
        return
      }
      this.setState({ historyOpen: true, historySource, settingsOpen: false })
    } catch {
      if (
        this.mounted &&
        navigationId === this.navigationRequestId &&
        id === this.state.activeSessionId
      ) {
        this.setState({ error: this.props.strings.chatLoadError })
      }
    }
  }

  private onHistoryMutation = async () => {
    const store = this.activeStore
    if (store === null) {
      return
    }
    const navigationId = this.navigationRequestId
    const session = await store.get()
    if (
      this.mounted &&
      navigationId === this.navigationRequestId &&
      store === this.activeStore
    ) {
      this.setState({ session })
    }
  }

  private displayTitle(title: string): string {
    return title === DefaultChatTitle
      ? this.props.strings.chatDefaultTitle
      : title
  }

  private setAccent = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = this.state.activeSessionId
    if (id === null) {
      return
    }
    try {
      await this.sessionsStore.setAccentPalette(
        id,
        event.currentTarget.value as AccentPalette
      )
    } catch {
      this.setState({ error: this.props.strings.chatLoadError })
    }
  }

  private setSurface = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = this.state.activeSessionId
    if (id === null) {
      return
    }
    try {
      await this.sessionsStore.setSurfacePalette(
        id,
        event.currentTarget.value as SurfacePalette
      )
    } catch {
      this.setState({ error: this.props.strings.chatLoadError })
    }
  }

  private setFontStyle = async (
    target: 'messageStyle' | 'inputStyle',
    style: IChatSessionDocument['fontSettings']['messageStyle']
  ) => {
    const id = this.state.activeSessionId
    if (id === null) {
      return
    }
    try {
      await this.sessionsStore.setFontStyle(id, target, style)
    } catch {
      this.setState({ error: this.props.strings.chatLoadError })
    }
  }

  private copyText(text: string): void {
    clipboard.writeText(text)
  }

  private scrollToBottom(): void {
    if (this.transcript !== null) {
      this.transcript.scrollTop = this.transcript.scrollHeight
    }
  }

  private renderSidebar(): JSX.Element {
    const { strings } = this.props
    return (
      <aside
        className="ollama-chat-sidebar"
        aria-label={strings.chatSessionsHeading}
      >
        <header>
          <strong>{strings.chatSessionsHeading}</strong>
          <Button
            size="small"
            dataVerification="ollama-chat-new"
            onClick={this.createSession}
            disabled={this.props.models.length === 0}
          >
            {strings.chatNew}
          </Button>
        </header>
        <ul data-verification="ollama-chat-sessions">
          {this.state.sessions.map(session => {
            const editing = this.state.editingSessionId === session.id
            const deleting = this.state.deletingSessionId === session.id
            const deletingBusy = this.state.deletingBusyId === session.id
            const displayTitle = this.displayTitle(session.title)
            return (
              <li
                key={session.id}
                className={
                  session.id === this.state.activeSessionId ? 'is-active' : ''
                }
              >
                {deleting ? (
                  <div
                    className="ollama-chat-delete-confirm"
                    role="alertdialog"
                    aria-label={strings.chatDelete}
                  >
                    <p>{strings.chatDeletePrompt(displayTitle)}</p>
                    <Button
                      size="small"
                      disabled={deletingBusy}
                      onClick={this.cancelDelete}
                    >
                      {strings.chatCancel}
                    </Button>
                    <Button
                      size="small"
                      className="destructive"
                      dataVerification="ollama-chat-delete-confirm"
                      disabled={deletingBusy}
                      // eslint-disable-next-line react/jsx-no-bind
                      onClick={() => void this.deleteSession(session.id)}
                    >
                      {strings.chatConfirmDelete}
                    </Button>
                  </div>
                ) : editing ? (
                  <input
                    autoFocus={true}
                    value={this.state.editingTitle}
                    maxLength={MaxChatTitleLength}
                    aria-label={strings.chatRename}
                    onChange={this.onEditingTitleChanged}
                    // eslint-disable-next-line react/jsx-no-bind
                    onBlur={() =>
                      void this.renameSession(
                        session.id,
                        this.state.editingTitle
                      )
                    }
                    // eslint-disable-next-line react/jsx-no-bind
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void this.renameSession(
                          session.id,
                          this.state.editingTitle
                        )
                      } else if (event.key === 'Escape') {
                        this.setState({
                          editingSessionId: null,
                          editingTitle: '',
                        })
                      }
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="ollama-chat-session-select"
                      aria-pressed={session.id === this.state.activeSessionId}
                      // eslint-disable-next-line react/jsx-no-bind
                      onClick={() => void this.switchSession(session.id)}
                    >
                      <span>{displayTitle}</span>
                      <small>
                        {strings.chatMessageCount(session.messageCount)}
                      </small>
                    </button>
                    <div className="ollama-chat-session-actions">
                      <Button
                        size="small"
                        ariaLabel={strings.chatRename}
                        tooltip={strings.chatRename}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() =>
                          this.setState({
                            editingSessionId: session.id,
                            editingTitle: displayTitle,
                            deletingSessionId: null,
                          })
                        }
                      >
                        {strings.chatRename}
                      </Button>
                      <Button
                        size="small"
                        ariaLabel={strings.chatDelete}
                        tooltip={strings.chatDelete}
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={() =>
                          this.setState({
                            deletingSessionId: session.id,
                            editingSessionId: null,
                          })
                        }
                      >
                        {strings.chatDelete}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </aside>
    )
  }

  private roleLabel(
    role: IChatSessionDocument['messages'][number]['role']
  ): string {
    switch (role) {
      case 'user':
        return this.props.strings.chatYou
      case 'assistant':
        return this.props.strings.chatAssistant
      case 'system':
        return this.props.strings.chatSystem
    }
  }

  private renderMessage(
    message: IChatSessionDocument['messages'][number],
    streaming: boolean = false
  ): JSX.Element {
    const { strings } = this.props
    const messageStyle = tabTitleStyleToCss(
      this.state.session?.fontSettings.messageStyle ?? null
    )
    return (
      <div
        key={message.id}
        className={`ollama-chat-message is-${message.role}${
          streaming ? ' is-streaming' : ''
        }`}
        data-verification={`ollama-chat-${message.role}`}
      >
        <header>
          <span className="ollama-chat-role">
            {this.roleLabel(message.role)}
          </span>
          <Button
            size="small"
            ariaLabel={strings.chatCopy}
            tooltip={strings.chatCopy}
            disabled={message.content.length === 0}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => this.copyText(message.content)}
          >
            {strings.chatCopy}
          </Button>
        </header>
        {message.images !== undefined && (
          <div className="ollama-chat-message-images">
            {message.images.map((image, index) => (
              <img
                key={index}
                src={`data:${image.mediaType};base64,${image.data}`}
                alt={strings.chatImageAlt(index + 1)}
              />
            ))}
          </div>
        )}
        <p style={messageStyle}>
          {message.content.length === 0 && streaming ? '…' : message.content}
        </p>
      </div>
    )
  }

  private renderSettings(): JSX.Element | null {
    const session = this.state.session
    if (!this.state.settingsOpen || session === null) {
      return null
    }
    const { strings } = this.props
    return (
      <section
        className="ollama-chat-settings"
        data-verification="ollama-chat-settings"
        aria-label={strings.chatAppearanceHeading}
      >
        <h4>{strings.chatAppearanceHeading}</h4>
        <p>{strings.chatSettingsHint}</p>
        <div className="ollama-chat-appearance-fields">
          <label>
            {strings.chatAccentLabel}
            <select
              value={session.appearance.accentPalette}
              onChange={this.setAccent}
            >
              {accentPalettes.map(palette => (
                <option key={palette} value={palette}>
                  {strings.chatAccentName(palette)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {strings.chatSurfaceLabel}
            <select
              value={session.appearance.surfacePalette}
              onChange={this.setSurface}
            >
              <option value="tonal">{strings.chatSurfaceTonal}</option>
              <option value="neutral">{strings.chatSurfaceNeutral}</option>
            </select>
          </label>
        </div>
        <section aria-label={strings.chatMessageFont}>
          <h5>{strings.chatMessageFont}</h5>
          <ToolbarTextStyleEditor
            value={session.fontSettings.messageStyle}
            onChange={this.onMessageFontChanged}
          />
        </section>
        <section aria-label={strings.chatComposerFont}>
          <h5>{strings.chatComposerFont}</h5>
          <ToolbarTextStyleEditor
            value={session.fontSettings.inputStyle}
            onChange={this.onInputFontChanged}
          />
        </section>
      </section>
    )
  }

  private renderConversation(): JSX.Element {
    const { strings, models } = this.props
    const session = this.state.session
    if (session === null) {
      return (
        <main className="ollama-chat-conversation is-empty">
          <p>
            {models.length === 0
              ? strings.chatNoModel
              : strings.chatSelectPrompt}
          </p>
          {models.length === 0 ? null : (
            <Button
              dataVerification="ollama-chat-empty-new"
              onClick={this.createSession}
            >
              {strings.chatNew}
            </Button>
          )}
        </main>
      )
    }
    const inputStyle = tabTitleStyleToCss(session.fontSettings.inputStyle)
    const effectiveModel = this.effectiveModel()
    return (
      <main className="ollama-chat-conversation">
        <header className="ollama-chat-conversation-toolbar">
          {models.length === 0 ? (
            <p role="status">{strings.chatNoModel}</p>
          ) : (
            <label>
              {strings.chatModelLabel}
              <select
                data-verification="ollama-chat-model"
                value={effectiveModel ?? ''}
                onChange={this.onModelChanged}
                disabled={this.state.streaming}
              >
                {models.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            size="small"
            dataVerification="ollama-chat-customize"
            onClick={this.toggleSettings}
          >
            {strings.chatCustomize}
          </Button>
          <Button
            size="small"
            dataVerification="ollama-chat-history"
            disabled={this.state.streaming}
            onClick={this.openHistory}
          >
            {strings.chatHistory}
          </Button>
        </header>
        {this.renderSettings()}
        <div
          className="ollama-chat-transcript"
          data-verification="ollama-chat-transcript"
          role="log"
          aria-label={strings.chatTitle}
          aria-live="polite"
          ref={this.setTranscriptRef}
        >
          {session.messages.length === 0 && !this.state.streaming ? (
            <p className="ollama-chat-empty">{strings.chatEmpty}</p>
          ) : (
            session.messages.map(message => this.renderMessage(message))
          )}
          {this.state.streaming &&
            this.renderMessage(
              {
                id: '__streaming__',
                role: 'assistant',
                content: this.state.streamingText,
                createdAt: Date.now(),
              },
              true
            )}
        </div>
        {this.state.streaming && (
          <p
            className="ollama-chat-streaming"
            data-verification="ollama-chat-streaming"
            role="status"
          >
            {strings.chatStreaming}
          </p>
        )}
        <form className="ollama-chat-composer" onSubmit={this.onSubmit}>
          {this.state.images.length > 0 && (
            <div className="ollama-chat-composer-images">
              {this.state.images.map((image, index) => (
                <span key={index}>
                  <img
                    src={`data:${image.mediaType};base64,${image.data}`}
                    alt={strings.chatImageAlt(index + 1)}
                  />
                  <Button
                    size="small"
                    ariaLabel={strings.chatRemoveImage}
                    tooltip={strings.chatRemoveImage}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => this.removeImage(index)}
                  >
                    ×
                  </Button>
                </span>
              ))}
            </div>
          )}
          <label
            className="ollama-chat-visually-hidden"
            htmlFor="ollama-chat-workspace-input"
          >
            {strings.chatMessageLabel}
          </label>
          <textarea
            id="ollama-chat-workspace-input"
            data-verification="ollama-chat-input"
            style={inputStyle}
            value={this.state.input}
            onChange={this.onInputChanged}
            onKeyDown={this.onInputKeyDown}
            onPaste={this.onPaste}
            placeholder={strings.chatPlaceholder}
            rows={3}
            maxLength={MaxChatMessageContentLength}
            disabled={effectiveModel === null}
          />
          <input
            ref={this.setFileInputRef}
            className="ollama-chat-visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple={true}
            tabIndex={-1}
            aria-hidden="true"
            onChange={this.onFilesSelected}
          />
          <div className="ollama-chat-composer-actions">
            <Button
              size="small"
              dataVerification="ollama-chat-attach"
              onClick={this.openImagePicker}
              disabled={
                this.state.images.length >= MaxChatImagesPerMessage ||
                effectiveModel === null
              }
            >
              {strings.chatAttachImage}
            </Button>
            <Button
              size="small"
              onClick={this.clearDraft}
              disabled={
                this.state.input.length === 0 && this.state.images.length === 0
              }
            >
              {strings.chatClearDraft}
            </Button>
            {this.state.streaming ? (
              <Button
                size="small"
                dataVerification="ollama-chat-stop"
                onClick={this.stop}
              >
                {strings.chatStop}
              </Button>
            ) : (
              <Button
                type="submit"
                size="small"
                dataVerification="ollama-chat-send"
                disabled={!this.canSend()}
              >
                {strings.chatSend}
              </Button>
            )}
          </div>
        </form>
      </main>
    )
  }

  public render(): JSX.Element {
    const { strings } = this.props
    if (!this.state.initialized) {
      return (
        <p className="ollama-chat-empty" role="status">
          {strings.chatLoading}
        </p>
      )
    }
    if (this.state.historyOpen && this.state.historySource !== null) {
      return (
        <DialogStackContext.Provider value={{ isTopMost: true }}>
          <VersionedStoreHistory
            className="ollama-chat-version-history"
            title={strings.chatHistoryTitle}
            timelineLabel={strings.chatHistoryTimeline}
            description={strings.chatHistoryDescription}
            strings={strings.chatHistoryStrings}
            formatEntrySummary={strings.chatHistorySummary}
            formatCommittedAt={strings.chatHistoryTimestamp}
            errorMessage={strings.chatHistoryError}
            showAdvancedFilterControls={false}
            source={this.state.historySource}
            onStoreMutated={this.onHistoryMutation}
            onDismissed={this.closeHistory}
          />
        </DialogStackContext.Provider>
      )
    }

    const appearance = this.state.session?.appearance
    return (
      <div
        className="ollama-chat-workspace"
        data-verification="ollama-chat-workspace"
        data-chat-accent={appearance?.accentPalette ?? 'blue'}
        data-chat-surface={appearance?.surfacePalette ?? 'tonal'}
      >
        {this.renderSidebar()}
        {this.renderConversation()}
        {this.state.error !== null && (
          <p className="ollama-chat-error" role="alert">
            {this.state.error}
          </p>
        )}
      </div>
    )
  }
}

/** Read, signature-check, and base64-encode one allowlisted image file. */
export async function readValidatedImage(
  file: File,
  mediaType: ChatImageMediaType
): Promise<IChatImageAttachment | null> {
  if (!ChatImageMediaTypes.has(mediaType) || file.type !== mediaType) {
    return null
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesChatImageSignature(bytes, mediaType)) {
    return null
  }
  const data = arrayBufferToBase64(bytes)
  if (data.length === 0 || data.length > MaxChatImageBase64Length) {
    return null
  }
  return { mediaType, data }
}

export function matchesImageSignature(
  bytes: Uint8Array,
  mediaType: ChatImageMediaType
): boolean {
  return matchesChatImageSignature(bytes, mediaType)
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }
  return window.btoa(binary)
}
