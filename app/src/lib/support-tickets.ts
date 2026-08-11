/**
 * The local support-ticket desk.
 *
 * This is the recovery route for a user who has locked themselves out of one
 * of the application's for-fun locks. It is dressed as a service desk on
 * purpose — a category, a description, a locally generated ticket number, a
 * severity, a status that advances, and a canned first response — but every
 * part of it runs on this machine and nothing is ever sent anywhere. There is
 * no server, no queue, no agent, and nobody reading it. The desk's own copy
 * says so in a line that no funny level is allowed to style, because a user
 * sitting and waiting for a reply that was never coming is the one failure
 * this feature must not produce.
 *
 * The resolution the desk finally offers is the only thing that actually
 * works: it opens the application-data folder in the platform's own file
 * manager so the user can delete it themselves. This module never deletes
 * anything, and never will — see `support-ticket-recovery.ts` for the opener,
 * which likewise only opens.
 *
 * Everything here is pure and injectable so the desk's behaviour can be tested
 * without a clock, a storage implementation, or a running Electron app.
 */

/** Why the user came to the desk. Chosen in the form, stored on the ticket. */
export type SupportTicketCategory =
  | 'forgottenPassword'
  | 'lostAuthenticator'
  | 'lockedTab'
  | 'lockedAppearance'
  | 'somethingElse'

/** The categories, in the order the form lists them. */
export const SupportTicketCategories: ReadonlyArray<SupportTicketCategory> = [
  'forgottenPassword',
  'lostAuthenticator',
  'lockedTab',
  'lockedAppearance',
  'somethingElse',
]

/**
 * The severity nobody will honour.
 *
 * It is recorded, exported and shown, and it changes nothing at all about what
 * the desk does — which the surface states in plain words beside the control
 * rather than letting the user infer a priority queue that does not exist.
 */
export type SupportTicketSeverity =
  | 'whenever'
  | 'normal'
  | 'urgent'
  | 'critical'

/** The severities, in the order the form lists them. */
export const SupportTicketSeverities: ReadonlyArray<SupportTicketSeverity> = [
  'whenever',
  'normal',
  'urgent',
  'critical',
]

/** The desk's lifecycle. `resolved` is terminal. */
export type SupportTicketStatus =
  | 'received'
  | 'triaged'
  | 'awaitingCustomer'
  | 'resolved'

/** The statuses in the order a ticket advances through them. */
export const SupportTicketStatusOrder: ReadonlyArray<SupportTicketStatus> = [
  'received',
  'triaged',
  'awaitingCustomer',
  'resolved',
]

/**
 * Which of the three routes the user arrived by.
 *
 * The desk names its own origin, so somebody who reached it from the unlock
 * prompt is not left wondering whether they are in the right place.
 */
export type SupportTicketEntryPoint = 'unlockPrompt' | 'lockSetting' | 'help'

/** The three entry points, in the order the contract lists them. */
export const SupportTicketEntryPoints: ReadonlyArray<SupportTicketEntryPoint> =
  ['unlockPrompt', 'lockSetting', 'help']

/**
 * The kind of a desk response.
 *
 * The response text itself is NOT stored. Storing it would freeze one language
 * and one funny level into the record, so a user who switches to Cantonese
 * afterwards would read a ticket history in the language they left. The kind
 * is stored and the words are resolved at render time.
 */
export type SupportTicketResponseKind =
  | 'acknowledged'
  | 'triaged'
  | 'awaitingCustomer'
  | 'resolved'

/** One line of the desk's own correspondence. */
export interface ISupportTicketResponse {
  readonly kind: SupportTicketResponseKind
  /** ISO-8601, in UTC. */
  readonly at: string
}

/** A ticket, exactly as it is stored. */
export interface ISupportTicket {
  /** Stable identity. Equal to {@link ISupportTicket.number}. */
  readonly id: string
  /** The locally generated number, e.g. `DM-20260811-0001`. */
  readonly number: string
  readonly category: SupportTicketCategory
  readonly severity: SupportTicketSeverity
  /** What the user typed. Trimmed and length-bounded, never interpreted. */
  readonly description: string
  readonly status: SupportTicketStatus
  /** ISO-8601, in UTC. */
  readonly createdAt: string
  /** ISO-8601, in UTC. */
  readonly updatedAt: string
  readonly entryPoint: SupportTicketEntryPoint
  readonly responses: ReadonlyArray<ISupportTicketResponse>
}

/** The form's own values, before the desk turns them into a ticket. */
export interface ISupportTicketDraft {
  readonly category: SupportTicketCategory
  readonly severity: SupportTicketSeverity
  readonly description: string
  readonly entryPoint: SupportTicketEntryPoint
}

/** Where the ticket list lives, beside the app's other local data. */
export const SupportTicketsStorageKey = 'desktop-material-support-tickets-v1'

/** Raised on `window` whenever the stored list changes. */
export const SupportTicketsChangedEvent =
  'desktop-material-support-tickets-changed'

/** The longest description the form accepts. */
export const MaximumSupportTicketDescriptionLength = 2000

/** The shortest description the form accepts, after trimming. */
export const MinimumSupportTicketDescriptionLength = 1

/**
 * How many tickets are kept. A joke desk that grows without bound is still an
 * unbounded write to local storage, so the oldest entries fall off the end.
 */
export const MaximumStoredSupportTickets = 200

/** The prefix of every locally generated ticket number. */
const TicketNumberPrefix = 'DM'

/** How many digits the per-day sequence is padded to. */
const TicketSequenceDigits = 4

function isCategory(value: unknown): value is SupportTicketCategory {
  return SupportTicketCategories.includes(value as SupportTicketCategory)
}

function isSeverity(value: unknown): value is SupportTicketSeverity {
  return SupportTicketSeverities.includes(value as SupportTicketSeverity)
}

function isStatus(value: unknown): value is SupportTicketStatus {
  return SupportTicketStatusOrder.includes(value as SupportTicketStatus)
}

function isEntryPoint(value: unknown): value is SupportTicketEntryPoint {
  return SupportTicketEntryPoints.includes(value as SupportTicketEntryPoint)
}

function isResponseKind(value: unknown): value is SupportTicketResponseKind {
  return (
    value === 'acknowledged' ||
    value === 'triaged' ||
    value === 'awaitingCustomer' ||
    value === 'resolved'
  )
}

/** Trim and bound a description without silently discarding what was typed. */
export function normalizeSupportTicketDescription(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, MaximumSupportTicketDescriptionLength)
}

/** Whether the form may be submitted. */
export function isValidSupportTicketDescription(value: string): boolean {
  return (
    normalizeSupportTicketDescription(value).length >=
    MinimumSupportTicketDescriptionLength
  )
}

/** `YYYYMMDD` in UTC, so a ticket number is stable wherever it is read. */
export function supportTicketDateStamp(at: Date): string {
  const year = at.getUTCFullYear().toString().padStart(4, '0')
  const month = (at.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = at.getUTCDate().toString().padStart(2, '0')
  return `${year}${month}${day}`
}

/** `DM-YYYYMMDD-NNNN`. Generated here; it exists nowhere else. */
export function formatSupportTicketNumber(at: Date, sequence: number): string {
  const bounded = Math.max(1, Math.floor(sequence))
  return `${TicketNumberPrefix}-${supportTicketDateStamp(at)}-${String(
    bounded
  ).padStart(TicketSequenceDigits, '0')}`
}

/**
 * The next per-day sequence number, derived from the tickets already stored.
 *
 * Deriving it rather than persisting a counter means a partially restored or
 * hand-edited list cannot mint a duplicate number.
 */
export function nextSupportTicketSequence(
  tickets: ReadonlyArray<ISupportTicket>,
  at: Date
): number {
  const stamp = supportTicketDateStamp(at)
  const prefix = `${TicketNumberPrefix}-${stamp}-`
  let highest = 0
  for (const ticket of tickets) {
    if (!ticket.number.startsWith(prefix)) {
      continue
    }
    const parsed = Number.parseInt(ticket.number.slice(prefix.length), 10)
    if (Number.isFinite(parsed) && parsed > highest) {
      highest = parsed
    }
  }
  return highest + 1
}

export interface ICreateSupportTicketOptions {
  /** Defaults to now. Injected by tests so numbers and stamps are stable. */
  readonly at?: Date
  /** The tickets already stored, used to pick the next number. */
  readonly existing?: ReadonlyArray<ISupportTicket>
}

/**
 * Turn a draft into a ticket, with the desk's canned first response already
 * attached.
 *
 * The response arrives immediately and locally. It is not a simulated delay
 * and there is no second response coming: the desk has exactly the lines it
 * has, and the surface says so.
 */
export function createSupportTicket(
  draft: ISupportTicketDraft,
  options: ICreateSupportTicketOptions = {}
): ISupportTicket {
  const at = options.at ?? new Date()
  const timestamp = at.toISOString()
  const ticketNumber = formatSupportTicketNumber(
    at,
    nextSupportTicketSequence(options.existing ?? [], at)
  )

  return {
    id: ticketNumber,
    number: ticketNumber,
    category: draft.category,
    severity: draft.severity,
    description: normalizeSupportTicketDescription(draft.description),
    status: 'received',
    createdAt: timestamp,
    updatedAt: timestamp,
    entryPoint: draft.entryPoint,
    responses: [{ kind: 'acknowledged', at: timestamp }],
  }
}

/** The status after this one, or `null` when the ticket is already resolved. */
export function nextSupportTicketStatus(
  status: SupportTicketStatus
): SupportTicketStatus | null {
  const index = SupportTicketStatusOrder.indexOf(status)
  if (index < 0 || index >= SupportTicketStatusOrder.length - 1) {
    return null
  }
  return SupportTicketStatusOrder[index + 1]
}

/**
 * Advance a ticket one step, appending the response that step produces.
 *
 * A resolved ticket is returned unchanged — by identity, so a caller can tell
 * that nothing happened without comparing fields.
 */
export function advanceSupportTicket(
  ticket: ISupportTicket,
  at: Date = new Date()
): ISupportTicket {
  const next = nextSupportTicketStatus(ticket.status)
  if (next === null) {
    return ticket
  }
  const timestamp = at.toISOString()
  return {
    ...ticket,
    status: next,
    updatedAt: timestamp,
    responses: [
      ...ticket.responses,
      { kind: responseKindForStatus(next), at: timestamp },
    ],
  }
}

/**
 * The response a status change produces.
 *
 * `received` is the status a ticket is created in rather than one it advances
 * into, and its response is the canned acknowledgement, so the two vocabularies
 * are deliberately not the same type — an exhaustive switch is what keeps them
 * in step when either one grows.
 */
function responseKindForStatus(
  status: SupportTicketStatus
): SupportTicketResponseKind {
  switch (status) {
    case 'received':
      return 'acknowledged'
    case 'triaged':
      return 'triaged'
    case 'awaitingCustomer':
      return 'awaitingCustomer'
    case 'resolved':
      return 'resolved'
  }
}

/** Whether the desk's resolution step applies to this ticket. */
export function isSupportTicketResolved(ticket: ISupportTicket): boolean {
  return ticket.status === 'resolved'
}

function parseResponse(value: unknown): ISupportTicketResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (!isResponseKind(record.kind) || typeof record.at !== 'string') {
    return null
  }
  return { kind: record.kind, at: record.at }
}

function parseTicket(value: unknown): ISupportTicket | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const ticketNumber = record.number
  if (typeof ticketNumber !== 'string' || ticketNumber.length === 0) {
    return null
  }
  if (
    !isCategory(record.category) ||
    !isSeverity(record.severity) ||
    !isStatus(record.status) ||
    !isEntryPoint(record.entryPoint)
  ) {
    return null
  }
  if (
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return null
  }

  const responses = Array.isArray(record.responses)
    ? record.responses
        .map(parseResponse)
        .filter((entry): entry is ISupportTicketResponse => entry !== null)
    : []

  return {
    id:
      typeof record.id === 'string' && record.id.length > 0
        ? record.id
        : ticketNumber,
    number: ticketNumber,
    category: record.category,
    severity: record.severity,
    description: normalizeSupportTicketDescription(record.description),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    entryPoint: record.entryPoint,
    responses,
  }
}

/**
 * Read the stored tickets.
 *
 * Unreadable or partially damaged storage yields the entries that survive
 * parsing rather than an exception: a desk that cannot open because one record
 * is malformed has locked the user out of the route that exists to let them
 * back in.
 */
export function readSupportTickets(
  storage: Pick<Storage, 'getItem'> = localStorage
): ReadonlyArray<ISupportTicket> {
  try {
    const raw = storage.getItem(SupportTicketsStorageKey)
    if (raw === null) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map(parseTicket)
      .filter((entry): entry is ISupportTicket => entry !== null)
      .slice(0, MaximumStoredSupportTickets)
  } catch {
    return []
  }
}

/**
 * Write the tickets, newest first, and announce the change.
 *
 * Returns the list as it was actually stored, which is what a caller should
 * render — the cap is applied here rather than being left to the surface.
 */
export function writeSupportTickets(
  tickets: ReadonlyArray<ISupportTicket>,
  storage: Pick<Storage, 'setItem'> = localStorage
): ReadonlyArray<ISupportTicket> {
  const stored = tickets.slice(0, MaximumStoredSupportTickets)
  try {
    storage.setItem(SupportTicketsStorageKey, JSON.stringify(stored))
  } catch {
    // A full or unavailable storage must not take the desk down with it. The
    // in-memory list stays correct for this session and the surface keeps
    // working; nothing about the recovery route depends on persistence.
  }
  // `window.Event` rather than the global constructor: in a jsdom test the two
  // are different classes, and jsdom refuses an event built from the other one
  // with a type error that names neither the event nor the caller.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(SupportTicketsChangedEvent))
  }
  return stored
}
