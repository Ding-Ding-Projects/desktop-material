import { createHash, randomUUID } from 'crypto'
import { lstat, readdir, rm } from 'fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'path'

import { Disposable } from 'event-kit'

import {
  AccentPalette,
  IAppearanceCustomization,
  SurfacePalette,
} from '../../models/appearance-customization'
import {
  createChatSessionDocument,
  IChatFontSettings,
  IChatMessageInput,
  IChatSessionDocument,
  IChatSessionSummary,
  isChatSessionDocument,
  isChatSessionId,
  normalizeChatModelName,
  normalizeChatTitle,
  toChatSessionSummary,
} from '../../models/chat-session'
import { IProfileHistoryPage } from '../../models/profile'
import { ITabTitleStyle } from '../../models/repository-tab'
import { getPath } from '../../ui/main-process-proxy'
import { IVersionedStoreHistorySource } from '../../ui/version-history'
import { readCrashSafeText } from '../crash-safe-file'
import { TypedBaseStore } from './base-store'
import {
  ChatSessionStore,
  IChatSessionStoreState,
  IChatSessionStoreOptions,
  MaxChatSessionFileBytes,
} from './chat-session-store'
import { DedicatedSettingFileName } from './dedicated-setting-store'

export const ChatsDirectoryName = 'ollama-chats'
export const MaxChatSessions = 1_000
const ChatSummaryReadConcurrency = 4

export interface IChatSessionsState {
  readonly initialized: boolean
  readonly activeSessionId: string | null
  readonly sessions: ReadonlyArray<IChatSessionSummary>
}

/** Collection owner for independently versioned conversation repositories. */
export class ChatSessionsStore extends TypedBaseStore<IChatSessionsState> {
  private rootPath: string | null = null
  private initialized = false
  private activeSessionId: string | null = null
  private summaries: ReadonlyArray<IChatSessionSummary> = []
  private readonly stores = new Map<string, ChatSessionStore>()
  private readonly initializations = new Map<
    string,
    Promise<ChatSessionStore>
  >()
  private readonly subscriptions = new Map<string, ReadonlyArray<Disposable>>()
  private operationTail: Promise<void> = Promise.resolve()

  public getState(): IChatSessionsState {
    return {
      initialized: this.initialized,
      activeSessionId: this.activeSessionId,
      sessions: this.summaries,
    }
  }

  public async initialize(rootPath?: string, ownerId?: string): Promise<void> {
    if (this.initialized) {
      return
    }
    if (rootPath !== undefined) {
      this.rootPath = resolve(rootPath)
    } else {
      const defaultRoot = join(await getPath('userData'), ChatsDirectoryName)
      this.rootPath = resolve(
        ownerId === undefined
          ? defaultRoot
          : join(defaultRoot, ownerDirectoryName(ownerId))
      )
    }
    await this.refreshSummaries()
    this.initialized = true
    this.emitUpdate(this.getState())
  }

  public async list(): Promise<ReadonlyArray<IChatSessionSummary>> {
    await this.refreshSummaries()
    this.emitUpdate(this.getState())
    return this.summaries
  }

  public create(
    options: { readonly model?: string; readonly title?: string } = {}
  ): Promise<ChatSessionStore> {
    return this.enqueue(async () => {
      if (this.summaries.length >= MaxChatSessions) {
        throw new Error('Too many chat sessions')
      }
      const id = randomUUID()
      const store = this.instantiate(
        id,
        createChatSessionDocument({
          id,
          model: options.model,
          title: options.title,
        })
      )
      await store.initialize()
      this.register(id, store)
      this.activeSessionId = id
      this.upsertSummary(store.getState().summary)
      this.emitUpdate(this.getState())
      return store
    })
  }

  public async getSession(id: string): Promise<ChatSessionStore> {
    if (!isChatSessionId(id)) {
      throw new Error('Invalid chat session id')
    }
    const existing = this.stores.get(id)
    if (existing !== undefined) {
      return existing
    }
    const pending = this.initializations.get(id)
    if (pending !== undefined) {
      return pending
    }

    const initialization = this.loadSession(id)
    this.initializations.set(id, initialization)
    const clear = () => {
      if (this.initializations.get(id) === initialization) {
        this.initializations.delete(id)
      }
    }
    void initialization.then(clear, clear)
    return initialization
  }

  public switchTo(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.getSession(id)
      this.activeSessionId = id
      this.emitUpdate(this.getState())
    })
  }

  /** Activate a session already loaded through the current navigation request. */
  public activateLoadedSession(id: string): void {
    if (!this.stores.has(id)) {
      throw new Error('Chat session is not loaded')
    }
    this.activeSessionId = id
    this.emitUpdate(this.getState())
  }

  public getActiveSession(): ChatSessionStore | null {
    return this.activeSessionId === null
      ? null
      : this.stores.get(this.activeSessionId) ?? null
  }

  public async appendMessage(
    id: string,
    message: IChatMessageInput
  ): Promise<string> {
    return this.enqueue(async () => {
      const messageId = await (await this.getSession(id)).appendMessage(message)
      return messageId
    })
  }

  public async appendTurn(
    id: string,
    turn: {
      readonly user: IChatMessageInput
      readonly assistant: IChatMessageInput
    }
  ): Promise<ReadonlyArray<string>> {
    return this.enqueue(async () => {
      const messageIds = await (await this.getSession(id)).appendTurn(turn)
      return messageIds
    })
  }

  public rename(id: string, title: string): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).rename(normalizeChatTitle(title))
    })
  }

  public setModel(id: string, model: string): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setModel(normalizeChatModelName(model))
    })
  }

  public async setAppearance(
    id: string,
    appearance: IAppearanceCustomization
  ): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setAppearance(appearance)
    })
  }

  public setAccentPalette(id: string, value: AccentPalette): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setAccentPalette(value)
    })
  }

  public setSurfacePalette(id: string, value: SurfacePalette): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setSurfacePalette(value)
    })
  }

  public async setFont(
    id: string,
    fontSettings: IChatFontSettings
  ): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setFont(fontSettings)
    })
  }

  public setFontStyle(
    id: string,
    target: 'messageStyle' | 'inputStyle',
    style: ITabTitleStyle | null
  ): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).setFontStyle(target, style)
    })
  }

  public async getHistory(
    id: string,
    skip?: number,
    limit?: number
  ): Promise<IProfileHistoryPage> {
    return (await this.getSession(id)).getHistory(skip, limit)
  }

  public async getHistorySource(
    id: string
  ): Promise<IVersionedStoreHistorySource> {
    return (await this.getSession(id)).getHistorySource()
  }

  public undo(id: string): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).undoLastChange()
    })
  }

  public redo(id: string): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).redoLastChange()
    })
  }

  public restoreTo(id: string, sha: string): Promise<void> {
    return this.enqueue(async () => {
      await (await this.getSession(id)).restoreTo(sha)
    })
  }

  /** Delete only after the owned repository has passed its path trust checks. */
  public delete(id: string): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.getSession(id)
      const directory = this.sessionPath(id)
      await store.flush()
      this.unregister(id)
      await rm(directory, { recursive: true, force: true })
      await rm(`${directory}.desktop-material.lock`, { force: true })
      if (this.activeSessionId === id) {
        this.activeSessionId = null
      }
      this.summaries = this.summaries.filter(summary => summary.id !== id)
      this.emitUpdate(this.getState())
    })
  }

  public async flush(): Promise<void> {
    await Promise.all([...this.stores.values()].map(store => store.flush()))
  }

  public dispose(): void {
    for (const id of [...this.stores.keys()]) {
      this.unregister(id)
    }
  }

  private async loadSession(id: string): Promise<ChatSessionStore> {
    const directory = this.sessionPath(id)
    let metadata
    try {
      metadata = await lstat(directory)
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        throw new Error('Chat session does not exist')
      }
      throw error
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('Chat session repository is not an ordinary directory')
    }
    const store = this.instantiate(id, createChatSessionDocument({ id }))
    await store.initialize()
    if (store.getState().session.id !== id) {
      store.dispose()
      throw new Error('Chat session identity does not match its repository')
    }
    this.register(id, store)
    return store
  }

  private instantiate(
    id: string,
    seed: IChatSessionDocument
  ): ChatSessionStore {
    const options: IChatSessionStoreOptions = {
      repositoryPath: this.sessionPath(id),
      ownershipRootPath: this.requireRoot(),
      seed,
    }
    return new ChatSessionStore(options)
  }

  private register(id: string, store: ChatSessionStore): void {
    this.unregister(id)
    this.stores.set(id, store)
    this.subscriptions.set(id, [
      store.onDidUpdate(state => this.onSessionUpdate(id, state)),
      store.onDidError(error => this.emitError(error)),
    ])
  }

  private unregister(id: string): void {
    for (const subscription of this.subscriptions.get(id) ?? []) {
      subscription.dispose()
    }
    this.subscriptions.delete(id)
    const store = this.stores.get(id)
    store?.dispose()
    this.stores.delete(id)
    this.initializations.delete(id)
  }

  private onSessionUpdate(id: string, state: IChatSessionStoreState): void {
    if (state.session.id !== id) {
      this.emitError(
        new Error('Chat session update changed repository identity')
      )
      return
    }
    this.upsertSummary(state.summary)
    this.emitUpdate(this.getState())
  }

  private upsertSummary(summary: IChatSessionSummary): void {
    this.summaries = [
      ...this.summaries.filter(candidate => candidate.id !== summary.id),
      summary,
    ].sort((left, right) => right.updatedAt - left.updatedAt)
  }

  private sessionPath(id: string): string {
    const root = this.requireRoot()
    const candidate = resolve(root, id)
    if (!isPathWithinOrEqual(root, candidate) || candidate === root) {
      throw new Error('Chat session path escaped its owner root')
    }
    return candidate
  }

  private requireRoot(): string {
    if (this.rootPath === null) {
      throw new Error('Chat sessions store has no root path')
    }
    return this.rootPath
  }

  private async refreshSummaries(): Promise<void> {
    const root = this.requireRoot()
    let ids: ReadonlyArray<string>
    try {
      const entries = await readdir(root, { withFileTypes: true })
      ids = entries
        .filter(entry => entry.isDirectory() && isChatSessionId(entry.name))
        .map(entry => entry.name)
        .slice(0, MaxChatSessions)
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        this.summaries = []
        return
      }
      throw error
    }

    const summaries = new Array<IChatSessionSummary | null>()
    for (
      let offset = 0;
      offset < ids.length;
      offset += ChatSummaryReadConcurrency
    ) {
      summaries.push(
        ...(await Promise.all(
          ids
            .slice(offset, offset + ChatSummaryReadConcurrency)
            .map(id => this.readSummary(id).catch(() => null))
        ))
      )
    }
    this.summaries = summaries
      .filter((summary): summary is IChatSessionSummary => summary !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }

  private async readSummary(id: string): Promise<IChatSessionSummary | null> {
    const loaded = this.stores.get(id)
    if (loaded !== undefined && loaded.getState().initialized) {
      return loaded.getState().summary
    }

    const saved = await readCrashSafeText(
      join(this.sessionPath(id), DedicatedSettingFileName),
      {
        maxBytes: MaxChatSessionFileBytes,
        validate: contents => isChatDocumentText(contents, id),
      }
    )
    if (saved === null) {
      return null
    }
    const document = JSON.parse(saved.contents) as IChatSessionDocument
    return toChatSessionSummary(document)
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.operationTail.then(action)
    this.operationTail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }
}

function isChatDocumentText(contents: string, id: string): boolean {
  try {
    const parsed: unknown = JSON.parse(contents)
    return isChatSessionDocument(parsed) && parsed.id === id
  } catch {
    return false
  }
}

function isPathWithinOrEqual(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return (
    child === '' ||
    (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  )
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

/** Hash untrusted provider identities before they become path segments. */
function ownerDirectoryName(ownerId: string): string {
  return createHash('sha256').update(ownerId).digest('hex').slice(0, 32)
}
