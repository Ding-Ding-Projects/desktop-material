/**
 * Send a web panel's public link to a Discord channel through a webhook, and
 * send it again whenever the link changes.
 *
 * The webhook address is a credential: it is passed in by the caller (who
 * keeps it in the operating-system vault) and never appears in a message, an
 * error or the returned state.
 */

export interface IPanelAnnouncement {
  /** The public link, or null when the panel is offline. */
  readonly url: string | null
  /** A one-use pairing code to send with the link, when the owner asked for it. */
  readonly pairingCode: string | null
}

export interface IPanelAnnouncerOptions {
  /** Send again automatically when the link changes. */
  readonly resendOnChange: boolean
  /** Edit the earlier message instead of posting a new one. */
  readonly replacePrevious: boolean
  /** Say so when the panel goes offline. */
  readonly announceOffline: boolean
}

export interface IPanelAnnouncerState {
  /** The last announcement that reached Discord. */
  readonly last: IPanelAnnouncement | null
  /** Discord's id for the last message, used to edit it in place. */
  readonly messageId: string | null
}

export const EmptyPanelAnnouncerState: IPanelAnnouncerState = {
  last: null,
  messageId: null,
}

export type PanelAnnouncementAction = 'none' | 'post' | 'edit'

export interface IWebhookResponse {
  readonly status: number
  readonly json: () => Promise<unknown>
}

export type WebhookFetch = (
  url: string,
  init: {
    readonly method: 'POST' | 'PATCH'
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
  }
) => Promise<IWebhookResponse>

export type PanelAnnounceResult =
  | {
      readonly ok: true
      readonly state: IPanelAnnouncerState
      readonly action: PanelAnnouncementAction
    }
  | {
      readonly ok: false
      readonly state: IPanelAnnouncerState
      readonly error: string
    }

const WebhookPath =
  /^\/api(?:\/v\d+)?\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,200}$/
const WebhookHosts = new Set([
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
])

/** Whether the text is a Discord webhook address and nothing else. */
export function isDiscordWebhookUrl(text: string): boolean {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    WebhookHosts.has(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    WebhookPath.test(url.pathname)
  )
}

/** The message body. Mentions are switched off so a link can never ping anyone. */
export function buildPanelMessage(announcement: IPanelAnnouncement): {
  readonly content: string
  readonly allowed_mentions: { readonly parse: ReadonlyArray<string> }
} {
  const lines =
    announcement.url === null
      ? ['The Minecraft panel is offline.']
      : [
          'The Minecraft panel is online:',
          announcement.url,
          announcement.pairingCode === null
            ? 'A pairing code is needed. Ask the host.'
            : `Pairing code: ${announcement.pairingCode} (works once, for 10 minutes)`,
        ]
  return { content: lines.join('\n'), allowed_mentions: { parse: [] } }
}

function sameAnnouncement(
  a: IPanelAnnouncement | null,
  b: IPanelAnnouncement
): boolean {
  return a !== null && a.url === b.url && a.pairingCode === b.pairingCode
}

/**
 * Decide what a change calls for. `force` is the Send now button: it always
 * sends, even when nothing changed.
 */
export function planPanelAnnouncement(
  state: IPanelAnnouncerState,
  next: IPanelAnnouncement,
  options: IPanelAnnouncerOptions,
  force: boolean = false
): PanelAnnouncementAction {
  if (!force) {
    if (sameAnnouncement(state.last, next)) {
      return 'none'
    }
    if (next.url === null && !options.announceOffline) {
      return 'none'
    }
    if (state.last !== null && !options.resendOnChange) {
      return 'none'
    }
  }
  return options.replacePrevious && state.messageId !== null ? 'edit' : 'post'
}

function messageIdOf(body: unknown): string | null {
  const id = (body as { id?: unknown } | null)?.id
  return typeof id === 'string' && /^\d{5,30}$/.test(id) ? id : null
}

async function send(
  webhookUrl: string,
  action: 'post' | 'edit',
  messageId: string | null,
  announcement: IPanelAnnouncement,
  fetch: WebhookFetch
): Promise<IWebhookResponse> {
  const base = webhookUrl.trim()
  return fetch(
    action === 'edit' ? `${base}/messages/${messageId}` : `${base}?wait=true`,
    {
      method: action === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPanelMessage(announcement)),
    }
  )
}

/**
 * Send, edit or skip an announcement. Failures never throw and never include
 * the webhook address; the previous state is kept so the next change retries.
 */
export async function announcePanel(
  webhookUrl: string,
  state: IPanelAnnouncerState,
  next: IPanelAnnouncement,
  options: IPanelAnnouncerOptions,
  fetch: WebhookFetch,
  force: boolean = false
): Promise<PanelAnnounceResult> {
  if (!isDiscordWebhookUrl(webhookUrl)) {
    return {
      ok: false,
      state,
      error: 'The Discord webhook address is not valid.',
    }
  }
  let action = planPanelAnnouncement(state, next, options, force)
  if (action === 'none') {
    return { ok: true, state, action }
  }

  try {
    let response = await send(webhookUrl, action, state.messageId, next, fetch)
    if (action === 'edit' && response.status === 404) {
      // The earlier message was deleted in Discord: post a new one instead.
      action = 'post'
      response = await send(webhookUrl, action, null, next, fetch)
    }
    if (response.status === 429) {
      return {
        ok: false,
        state,
        error:
          'Discord asked to slow down. The link will be sent again shortly.',
      }
    }
    if (response.status === 401 || response.status === 404) {
      return {
        ok: false,
        state,
        error:
          'Discord no longer accepts this webhook. Create a new one and paste it again.',
      }
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        state,
        error: `Discord did not accept the message (status ${response.status}).`,
      }
    }
    const messageId =
      messageIdOf(await response.json().catch(() => null)) ??
      (action === 'edit' ? state.messageId : null)
    return { ok: true, action, state: { last: next, messageId } }
  } catch {
    return {
      ok: false,
      state,
      error: 'Discord could not be reached. The panel keeps running.',
    }
  }
}
