import { Buffer } from 'buffer'

import {
  DefaultAppearanceCustomization,
  IAppearanceCustomization,
  normalizeAppearanceCustomization,
} from './appearance-customization'
import { ITabTitleStyle, normalizeTabTitleStyle } from './repository-tab'
import { IOllamaChatMessage, OllamaChatRole } from '../lib/ollama/types'

/** Current on-disk schema for a Git-backed chat session. */
export const ChatSessionVersion = 1 as const

export type ChatMessageRole = OllamaChatRole

// Keep the current snapshot at Ollama's native outbound transcript ceiling.
// Older turns remain recoverable from the conversation's Git history.
export const MaxChatSessionMessages = 256
export const MaxChatMessageContentLength = 64 * 1024
export const MaxChatImagesPerMessage = 4
export const MaxChatImageBase64Length = 3 * 1024 * 1024
export const MaxChatImagesTotalBase64Length = 8 * 1024 * 1024
export const MaxChatTitleLength = 200
export const MaxChatModelNameLength = 512
export const DefaultChatTitle = 'New chat'
const MaxPreservedLeadingSystemMessages = 8

export type ChatImageMediaType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'

const chatImageMediaTypes = new Set<ChatImageMediaType>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const modelNamePattern = /^[A-Za-z0-9][A-Za-z0-9._/@:-]*$/
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** An allowlisted image. Raw base64 is kept separate from its media type. */
export interface IChatImageAttachment {
  readonly mediaType: ChatImageMediaType
  readonly data: string
}

export interface IChatSessionMessage {
  readonly id: string
  readonly role: ChatMessageRole
  readonly content: string
  readonly images?: ReadonlyArray<IChatImageAttachment>
  readonly createdAt: number
}

/** Validated per-session typography for transcript and composer text. */
export interface IChatFontSettings {
  readonly version: typeof ChatSessionVersion
  readonly messageStyle: ITabTitleStyle | null
  readonly inputStyle: ITabTitleStyle | null
}

export const DefaultChatFontSettings: IChatFontSettings = {
  version: ChatSessionVersion,
  messageStyle: null,
  inputStyle: null,
}

/** Complete snapshot committed to one session's dedicated local repository. */
export interface IChatSessionDocument {
  readonly version: typeof ChatSessionVersion
  readonly id: string
  readonly title: string
  readonly model: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly messages: ReadonlyArray<IChatSessionMessage>
  readonly appearance: IAppearanceCustomization
  readonly fontSettings: IChatFontSettings
}

export interface IChatSessionSummary {
  readonly id: string
  readonly title: string
  readonly model: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly messageCount: number
}

export interface IChatMessageInput {
  readonly role: ChatMessageRole
  readonly content: string
  readonly images?: ReadonlyArray<IChatImageAttachment>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isChatSessionId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0
}

export function normalizeChatModelName(value: unknown): string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MaxChatModelNameLength &&
    value === value.trim() &&
    modelNamePattern.test(value)
    ? value
    : ''
}

export function normalizeChatTitle(value: unknown): string {
  if (typeof value !== 'string') {
    return DefaultChatTitle
  }
  const trimmed = value.trim().slice(0, MaxChatTitleLength)
  return trimmed.length === 0 ? DefaultChatTitle : trimmed
}

export function normalizeChatImage(
  value: unknown
): IChatImageAttachment | null {
  if (
    !isRecord(value) ||
    typeof value.mediaType !== 'string' ||
    !chatImageMediaTypes.has(value.mediaType as ChatImageMediaType) ||
    typeof value.data !== 'string' ||
    value.data.length === 0 ||
    value.data.length > MaxChatImageBase64Length ||
    value.data.length % 4 !== 0 ||
    !base64Pattern.test(value.data)
  ) {
    return null
  }

  const header = new Uint8Array(Buffer.from(value.data.slice(0, 24), 'base64'))
  if (
    !matchesChatImageSignature(header, value.mediaType as ChatImageMediaType)
  ) {
    return null
  }

  return {
    mediaType: value.mediaType as ChatImageMediaType,
    data: value.data,
  }
}

/** Match an allowlisted MIME declaration to the file's leading magic bytes. */
export function matchesChatImageSignature(
  bytes: Uint8Array,
  mediaType: ChatImageMediaType
): boolean {
  switch (mediaType) {
    case 'image/png':
      return startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
    case 'image/jpeg':
      return startsWith(bytes, [255, 216, 255])
    case 'image/gif':
      return (
        startsWith(bytes, [71, 73, 70, 56, 55, 97]) ||
        startsWith(bytes, [71, 73, 70, 56, 57, 97])
      )
    case 'image/webp':
      return (
        startsWith(bytes, [82, 73, 70, 70]) &&
        bytes.length >= 12 &&
        startsWith(bytes.slice(8), [87, 69, 66, 80])
      )
  }
}

function startsWith(
  bytes: Uint8Array,
  signature: ReadonlyArray<number>
): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  )
}

function normalizeImages(
  value: unknown
): ReadonlyArray<IChatImageAttachment> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const images = new Array<IChatImageAttachment>()
  let totalLength = 0
  for (const candidate of value.slice(0, MaxChatImagesPerMessage)) {
    const image = normalizeChatImage(candidate)
    if (
      image === null ||
      totalLength + image.data.length > MaxChatImagesTotalBase64Length
    ) {
      continue
    }
    images.push(image)
    totalLength += image.data.length
  }
  return images.length === 0 ? undefined : images
}

/** Canonicalize one persisted message, dropping malformed values. */
export function normalizeChatMessage(
  value: unknown
): IChatSessionMessage | null {
  if (
    !isRecord(value) ||
    !isChatSessionId(value.id) ||
    (value.role !== 'system' &&
      value.role !== 'user' &&
      value.role !== 'assistant') ||
    typeof value.content !== 'string' ||
    value.content.length > MaxChatMessageContentLength
  ) {
    return null
  }

  const images = normalizeImages(value.images)
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    ...(images === undefined ? {} : { images }),
    createdAt: normalizeTimestamp(value.createdAt),
  }
}

function normalizeFontStyle(value: unknown): ITabTitleStyle | null {
  return value === null || value === undefined
    ? null
    : normalizeTabTitleStyle(value)
}

export function normalizeChatFontSettings(value: unknown): IChatFontSettings {
  const source = isRecord(value) ? value : {}
  return {
    version: ChatSessionVersion,
    messageStyle: normalizeFontStyle(source.messageStyle),
    inputStyle: normalizeFontStyle(source.inputStyle),
  }
}

/**
 * Normalize an untrusted document. The newest bounded transcript is retained,
 * and every value that can reach disk, the network, or inline CSS is checked.
 */
export function normalizeChatSessionDocument(
  value: unknown
): IChatSessionDocument {
  const source = isRecord(value) ? value : {}
  const messages = Array.isArray(source.messages)
    ? trimChatMessages(
        source.messages
          .map(normalizeChatMessage)
          .filter((message): message is IChatSessionMessage => message !== null)
      )
    : []

  return {
    version: ChatSessionVersion,
    id: isChatSessionId(source.id) ? source.id : '',
    title: normalizeChatTitle(source.title),
    model: normalizeChatModelName(source.model),
    createdAt: normalizeTimestamp(source.createdAt),
    updatedAt: normalizeTimestamp(source.updatedAt),
    messages,
    appearance: normalizeAppearanceCustomization(source.appearance),
    fontSettings: normalizeChatFontSettings(source.fontSettings),
  }
}

/**
 * Retain leading system context and evict complete oldest turns. This prevents
 * a capped outbound transcript from beginning with an orphan assistant reply.
 */
function trimChatMessages(
  messages: ReadonlyArray<IChatSessionMessage>
): ReadonlyArray<IChatSessionMessage> {
  if (messages.length <= MaxChatSessionMessages) {
    return messages
  }

  let systemCount = 0
  while (
    systemCount < messages.length &&
    messages[systemCount].role === 'system' &&
    systemCount < MaxPreservedLeadingSystemMessages
  ) {
    ++systemCount
  }
  const systems = messages.slice(0, systemCount)
  const available = MaxChatSessionMessages - systems.length
  let recent = messages.slice(systemCount).slice(-available)
  while (recent[0]?.role === 'assistant') {
    recent = recent.slice(1)
  }
  return [...systems, ...recent]
}

export function isChatSessionDocument(
  value: unknown
): value is IChatSessionDocument {
  return (
    isRecord(value) &&
    value.version === ChatSessionVersion &&
    isChatSessionId(value.id) &&
    jsonEqual(value, normalizeChatSessionDocument(value))
  )
}

export function createChatSessionDocument(options: {
  readonly id: string
  readonly model?: string
  readonly title?: string
  readonly now?: number
  readonly appearance?: IAppearanceCustomization
  readonly fontSettings?: IChatFontSettings
}): IChatSessionDocument {
  const now = normalizeTimestamp(options.now ?? Date.now())
  return normalizeChatSessionDocument({
    version: ChatSessionVersion,
    id: options.id,
    title: options.title ?? DefaultChatTitle,
    model: options.model ?? '',
    createdAt: now,
    updatedAt: now,
    messages: [],
    appearance: options.appearance ?? DefaultAppearanceCustomization,
    fontSettings: options.fontSettings ?? DefaultChatFontSettings,
  })
}

export function toChatSessionSummary(
  document: IChatSessionDocument
): IChatSessionSummary {
  return {
    id: document.id,
    title: document.title,
    model: document.model,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    messageCount: document.messages.length,
  }
}

/** Project persisted messages to the bounded native Ollama wire format. */
export function toOllamaChatMessages(
  messages: ReadonlyArray<IChatSessionMessage>
): ReadonlyArray<IOllamaChatMessage> {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
    ...(message.images === undefined
      ? {}
      : { images: message.images.map(image => image.data) }),
  }))
}
