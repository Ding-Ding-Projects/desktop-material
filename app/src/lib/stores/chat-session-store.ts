import { randomUUID } from 'crypto'

import { Disposable } from 'event-kit'

import {
  AccentPalette,
  IAppearanceCustomization,
  SurfacePalette,
} from '../../models/appearance-customization'
import {
  IChatFontSettings,
  IChatMessageInput,
  IChatSessionDocument,
  IChatSessionMessage,
  IChatSessionSummary,
  isChatSessionDocument,
  normalizeChatFontSettings,
  normalizeChatMessage,
  normalizeChatModelName,
  normalizeChatSessionDocument,
  normalizeChatTitle,
  toChatSessionSummary,
} from '../../models/chat-session'
import { IProfileHistoryPage } from '../../models/profile'
import { ITabTitleStyle } from '../../models/repository-tab'
import { IVersionedStoreHistorySource } from '../../ui/version-history'
import { TypedBaseStore } from './base-store'
import { DedicatedSettingStore } from './dedicated-setting-store'

/** Maximum UTF-8 snapshot accepted from one conversation repository. */
export const MaxChatSessionFileBytes = 16 * 1024 * 1024

export interface IChatSessionStoreState {
  readonly session: IChatSessionDocument
  readonly summary: IChatSessionSummary
  readonly repositoryPath: string
  readonly initialized: boolean
}

export interface IChatSessionStoreOptions {
  readonly repositoryPath: string
  readonly ownershipRootPath: string
  readonly seed: IChatSessionDocument
}

/** One conversation, persisted in its own append-only local Git repository. */
export class ChatSessionStore extends TypedBaseStore<IChatSessionStoreState> {
  private readonly store: DedicatedSettingStore<IChatSessionDocument>
  private readonly subscriptions = new Array<Disposable>()
  private mutationTail: Promise<void> = Promise.resolve()

  public constructor(options: IChatSessionStoreOptions) {
    super()
    this.store = new DedicatedSettingStore<IChatSessionDocument>({
      repositoryPath: options.repositoryPath,
      ownershipRootPath: options.ownershipRootPath,
      seed: normalizeChatSessionDocument(options.seed),
      validate: isChatSessionDocument,
      normalize: normalizeChatSessionDocument,
      commitDelayMs: 0,
      maxFileBytes: MaxChatSessionFileBytes,
      initializationMessage: 'Create chat session',
    })
    this.subscriptions.push(
      this.store.onDidUpdate(() => this.emitUpdate(this.getState())),
      this.store.onDidError(error => this.emitError(error))
    )
  }

  public initialize(): Promise<void> {
    return this.store.initialize()
  }

  public getState(): IChatSessionStoreState {
    const state = this.store.getState()
    return {
      session: state.setting,
      summary: toChatSessionSummary(state.setting),
      repositoryPath: state.repositoryPath,
      initialized: state.initialized,
    }
  }

  public get(): Promise<IChatSessionDocument> {
    return this.store.get()
  }

  public getRepositoryPath(): string {
    return this.store.getRepositoryPath()
  }

  public appendMessage(message: IChatMessageInput): Promise<string> {
    return this.appendMessages([message]).then(ids => ids[0])
  }

  public appendMessages(
    messages: ReadonlyArray<IChatMessageInput>
  ): Promise<ReadonlyArray<string>> {
    return this.enqueue(async () => {
      if (messages.length === 0) {
        return []
      }

      const now = Date.now()
      const assigned = messages.map(message => {
        const candidate: IChatSessionMessage = {
          id: randomUUID(),
          role: message.role,
          content: message.content,
          ...(message.images === undefined ? {} : { images: message.images }),
          createdAt: now,
        }
        const normalized = normalizeChatMessage(candidate)
        if (
          normalized === null ||
          JSON.stringify(normalized) !== JSON.stringify(candidate)
        ) {
          throw new Error('Invalid chat message')
        }
        return normalized
      })

      const current = await this.store.get()
      const next = normalizeChatSessionDocument({
        ...current,
        messages: [...current.messages, ...assigned],
        updatedAt: now,
      })
      assertChatSessionSize(next)
      await this.store.set(next, describeAppend(messages))
      return assigned.map(message => message.id)
    })
  }

  public appendTurn(turn: {
    readonly user: IChatMessageInput
    readonly assistant: IChatMessageInput
  }): Promise<ReadonlyArray<string>> {
    return this.appendMessages([turn.user, turn.assistant])
  }

  public rename(title: string): Promise<void> {
    const normalized = normalizeChatTitle(title)
    return this.mutate(
      current =>
        current.title === normalized ? null : { ...current, title: normalized },
      'Rename chat'
    )
  }

  public setModel(model: string): Promise<void> {
    const normalized = normalizeChatModelName(model)
    return this.mutate(
      current =>
        current.model === normalized ? null : { ...current, model: normalized },
      normalized.length === 0 ? 'Clear chat model' : 'Change chat model'
    )
  }

  public setAppearance(appearance: IAppearanceCustomization): Promise<void> {
    return this.mutate(
      current =>
        jsonEqual(current.appearance, appearance)
          ? null
          : { ...current, appearance },
      'Update chat appearance'
    )
  }

  public setAccentPalette(accentPalette: AccentPalette): Promise<void> {
    return this.mutate(
      current => ({
        ...current,
        appearance: { ...current.appearance, accentPalette },
      }),
      'Update chat accent'
    )
  }

  public setSurfacePalette(surfacePalette: SurfacePalette): Promise<void> {
    return this.mutate(
      current => ({
        ...current,
        appearance: { ...current.appearance, surfacePalette },
      }),
      'Update chat surface'
    )
  }

  public setFont(fontSettings: IChatFontSettings): Promise<void> {
    const normalized = normalizeChatFontSettings(fontSettings)
    return this.mutate(
      current =>
        jsonEqual(current.fontSettings, normalized)
          ? null
          : { ...current, fontSettings: normalized },
      'Update chat font'
    )
  }

  public setFontStyle(
    target: 'messageStyle' | 'inputStyle',
    style: ITabTitleStyle | null
  ): Promise<void> {
    return this.mutate(
      current => ({
        ...current,
        fontSettings: normalizeChatFontSettings({
          ...current.fontSettings,
          [target]: style,
        }),
      }),
      target === 'messageStyle'
        ? 'Update chat message font'
        : 'Update chat composer font'
    )
  }

  public flush(): Promise<void> {
    return this.store.flush()
  }

  public getHistory(
    skip?: number,
    limit?: number
  ): Promise<IProfileHistoryPage> {
    return this.store.getHistory(skip, limit)
  }

  public getFiles(sha: string): Promise<ReadonlyArray<string>> {
    return this.store.getFiles(sha)
  }

  public getDiff(sha: string, file?: string): Promise<string> {
    return this.store.getDiff(sha, file)
  }

  public undoLastChange(): Promise<void> {
    return this.store.undoLastChange()
  }

  public redoLastChange(): Promise<void> {
    return this.store.redoLastChange()
  }

  public restoreTo(sha: string): Promise<void> {
    return this.store.restoreTo(sha)
  }

  public getHistorySource(): IVersionedStoreHistorySource {
    return {
      getHistory: (skip, limit) => this.store.getHistory(skip, limit),
      getFiles: sha => this.store.getFiles(sha),
      getDiff: (sha, file) => this.store.getDiff(sha, file),
      undoLastChange: () => this.store.undoLastChange(),
      redoLastChange: () => this.store.redoLastChange(),
      restoreTo: sha => this.store.restoreTo(sha),
    }
  }

  public dispose(): void {
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.dispose()
    }
  }

  private mutate(
    apply: (current: IChatSessionDocument) => IChatSessionDocument | null,
    description: string
  ): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.store.get()
      const updated = apply(current)
      if (updated === null) {
        return
      }
      const next = normalizeChatSessionDocument({
        ...updated,
        updatedAt: Date.now(),
      })
      assertChatSessionSize(next)
      await this.store.set(next, description)
    })
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.mutationTail.then(action)
    this.mutationTail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }
}

function describeAppend(messages: ReadonlyArray<IChatMessageInput>): string {
  return messages.length === 1 ? 'Add chat message' : 'Add chat turn'
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertChatSessionSize(document: IChatSessionDocument): void {
  if (
    Buffer.byteLength(JSON.stringify(document, null, 2), 'utf8') >
    MaxChatSessionFileBytes
  ) {
    throw new Error('Chat session exceeds its storage limit')
  }
}
