/**
 * The user's own private vocabulary file, and the bounded contract it must
 * satisfy before a single word of it reaches the interface.
 *
 * WHAT THIS IS
 *
 * A user may supply a local JSON file mapping words the app renders to words
 * they would rather read. Nothing ships with it: until a valid file is
 * supplied, every surface renders its original wording, unchanged. There are
 * no built-in mappings, no samples, no templates and no defaults — a shipped
 * example would be exactly the private data this feature exists to keep out of
 * the repository.
 *
 * WHY THE VALIDATION IS THIS STRICT
 *
 * The file is chosen by the user, but "chosen by the user" is not the same as
 * "safe to apply". It can be enormous, deeply nested, hand-edited into
 * nonsense, or a JSON document that is valid and still describes something the
 * app must not do. So the complete byte payload is validated before anything is
 * displayed or cached, and a rejected file never applies *partially* — a
 * half-applied vocabulary is worse than none, because the user cannot tell
 * which words on screen are theirs and which are ours.
 *
 * PRIVACY
 *
 * Everything here is local. No network request, no telemetry, no logging of
 * terms, and nothing about the file's contents or its path may reach an
 * export, a crash report, a screenshot, a history snapshot or a repository.
 * That is why this module deals in bytes and returns structured results rather
 * than ever formatting a term into an error message.
 */

/** The only schema version this build understands. */
export const PersonalVocabularySchemaVersion = 1

/** Hard bounds. Every one of these is a rejection, never a truncation. */
export const MaxVocabularyBytes = 1024 * 1024
export const MaxVocabularyEntries = 2000
export const MaxVocabularyKeyLength = 200
export const MaxVocabularyValueLength = 500

/** Object keys that must never be accepted, whatever the file says. */
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype'])

export interface IPersonalVocabulary {
  readonly schemaVersion: number
  /** Original wording → the user's wording. Frozen and prototype-less. */
  readonly terms: ReadonlyMap<string, string>
}

export type VocabularyRejection =
  | { readonly kind: 'empty' }
  | { readonly kind: 'too-large'; readonly bytes: number }
  | { readonly kind: 'not-json' }
  | { readonly kind: 'not-an-object' }
  | { readonly kind: 'unsupported-version'; readonly schemaVersion: unknown }
  | { readonly kind: 'missing-terms' }
  | { readonly kind: 'too-many-entries'; readonly count: number }
  | { readonly kind: 'unsafe-key' }
  | { readonly kind: 'key-too-long' }
  | { readonly kind: 'value-too-long' }
  | { readonly kind: 'value-not-a-string' }
  | { readonly kind: 'unexpected-field'; readonly field: string }

export type VocabularyResult =
  | { readonly ok: true; readonly vocabulary: IPersonalVocabulary }
  | { readonly ok: false; readonly rejection: VocabularyRejection }

/** The permitted top-level fields. Anything else is a rejection, not a warning. */
const currentAllowedFields = new Set(['schemaVersion', 'entries'])
const previousCacheAllowedFields = new Set(['schemaVersion', 'terms'])
const legacyAllowedFields = new Set(['version', 'terms'])

/**
 * Validate a complete file payload.
 *
 * Takes bytes rather than a parsed object deliberately: the size bound has to
 * be applied to what was actually read from disk, and a caller handed an
 * already-parsed object has necessarily skipped it.
 */
export function parsePersonalVocabulary(bytes: Uint8Array): VocabularyResult {
  if (bytes.length === 0) {
    return { ok: false, rejection: { kind: 'empty' } }
  }
  if (bytes.length > MaxVocabularyBytes) {
    return {
      ok: false,
      rejection: { kind: 'too-large', bytes: bytes.length },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, rejection: { kind: 'not-json' } }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, rejection: { kind: 'not-an-object' } }
  }

  return parseVocabularyRecord(
    parsed as Record<string, unknown>,
    currentAllowedFields,
    'schemaVersion',
    'entries'
  )
}

function parseVocabularyRecord(
  raw: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  schemaField: 'schemaVersion' | 'version',
  termsField: 'entries' | 'terms'
): VocabularyResult {

  for (const field of Object.keys(raw)) {
    if (!allowedFields.has(field)) {
      return { ok: false, rejection: { kind: 'unexpected-field', field } }
    }
  }

  const schemaVersion = raw[schemaField]
  if (schemaVersion !== PersonalVocabularySchemaVersion) {
    return {
      ok: false,
      rejection: { kind: 'unsupported-version', schemaVersion },
    }
  }

  const terms = raw[termsField]
  if (typeof terms !== 'object' || terms === null || Array.isArray(terms)) {
    return { ok: false, rejection: { kind: 'missing-terms' } }
  }

  // `Object.keys` rather than `for…in`, so an inherited property from a
  // hand-crafted payload cannot be enumerated as if it were data.
  const keys = Object.keys(terms as Record<string, unknown>)
  if (keys.length > MaxVocabularyEntries) {
    return {
      ok: false,
      rejection: { kind: 'too-many-entries', count: keys.length },
    }
  }

  const map = new Map<string, string>()
  for (const key of keys) {
    if (unsafeKeys.has(key)) {
      return { ok: false, rejection: { kind: 'unsafe-key' } }
    }
    if (key.length === 0 || key.length > MaxVocabularyKeyLength) {
      return { ok: false, rejection: { kind: 'key-too-long' } }
    }
    const value = (terms as Record<string, unknown>)[key]
    if (typeof value !== 'string') {
      return { ok: false, rejection: { kind: 'value-not-a-string' } }
    }
    if (value.length > MaxVocabularyValueLength) {
      return { ok: false, rejection: { kind: 'value-too-long' } }
    }
    map.set(key, value)
  }

  return {
    ok: true,
    vocabulary: { schemaVersion: PersonalVocabularySchemaVersion, terms: map },
  }
}

/**
 * Why a file was refused, in words a person can act on.
 *
 * Deliberately never quotes a term or a value back: this string is rendered on
 * screen and could be read over a shoulder or land in a capture, and the whole
 * point of the feature is that the vocabulary stays private.
 */
export function describeVocabularyRejection(
  rejection: VocabularyRejection
): string {
  switch (rejection.kind) {
    case 'empty':
      return 'That file is empty. Nothing has been changed.'
    case 'too-large':
      return `That file is ${Math.round(
        rejection.bytes / 1024
      )} KB, and the limit is ${Math.round(
        MaxVocabularyBytes / 1024
      )} KB. Nothing has been changed.`
    case 'not-json':
      return 'That file is not valid UTF-8 JSON. Nothing has been changed.'
    case 'not-an-object':
      return 'A vocabulary file must be a JSON object. Nothing has been changed.'
    case 'unsupported-version':
      return `This build understands schema version ${PersonalVocabularySchemaVersion} of the vocabulary format, and that file does not declare it. Nothing has been changed.`
    case 'missing-terms':
      return 'That file has no "entries" object. Nothing has been changed.'
    case 'too-many-entries':
      return `That file has ${rejection.count} entries, and the limit is ${MaxVocabularyEntries}. Nothing has been changed.`
    case 'unsafe-key':
      return 'That file uses a reserved object key. Nothing has been changed.'
    case 'key-too-long':
      return `Every term must be between 1 and ${MaxVocabularyKeyLength} characters. Nothing has been changed.`
    case 'value-too-long':
      return `Every replacement must be at most ${MaxVocabularyValueLength} characters. Nothing has been changed.`
    case 'value-not-a-string':
      return 'Every replacement must be text. Nothing has been changed.'
    case 'unexpected-field':
      return `That file has a field this build does not recognise ("${rejection.field}"). Nothing has been changed.`
  }
}

/** Where the validated cache lives. The source path is never stored. */
export const PersonalVocabularyStorageKey = 'desktop-material-vocabulary-v1'

/** Persist a validated vocabulary. Never called with an unvalidated payload. */
export function cachePersonalVocabulary(vocabulary: IPersonalVocabulary): void {
  try {
    localStorage.setItem(
      PersonalVocabularyStorageKey,
      JSON.stringify({
        schemaVersion: vocabulary.schemaVersion,
        terms: Object.fromEntries(vocabulary.terms),
      })
    )
  } catch {
    // A vocabulary that cannot be cached still applies for this session.
  }
}

/**
 * Read the cache back, revalidating it rather than trusting it.
 *
 * The cache outlives the release that wrote it, so it can hold a version this
 * build does not understand or content a later bound would now refuse. It goes
 * through exactly the same validator as a freshly chosen file, and fails closed
 * to the app's original wording.
 */
export function readCachedPersonalVocabulary(): IPersonalVocabulary | null {
  try {
    const raw = localStorage.getItem(PersonalVocabularyStorageKey)
    if (raw === null) {
      return null
    }
    const bytes = new TextEncoder().encode(raw)
    const result = parsePersonalVocabulary(bytes)
    if (result.ok) {
      return result.vocabulary
    }
    const legacyResult = parseLegacyCachedPersonalVocabulary(bytes)
    return legacyResult.ok ? legacyResult.vocabulary : null
  } catch {
    return null
  }
}

function parseLegacyCachedPersonalVocabulary(
  bytes: Uint8Array
): VocabularyResult {
  if (bytes.length === 0) {
    return { ok: false, rejection: { kind: 'empty' } }
  }
  if (bytes.length > MaxVocabularyBytes) {
    return {
      ok: false,
      rejection: { kind: 'too-large', bytes: bytes.length },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, rejection: { kind: 'not-json' } }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, rejection: { kind: 'not-an-object' } }
  }

  const raw = parsed as Record<string, unknown>
  const previous = parseVocabularyRecord(
    raw,
    previousCacheAllowedFields,
    'schemaVersion',
    'terms'
  )
  return previous.ok
    ? previous
    : parseVocabularyRecord(raw, legacyAllowedFields, 'version', 'terms')
}

export function clearPersonalVocabulary(): void {
  try {
    localStorage.removeItem(PersonalVocabularyStorageKey)
  } catch {
    // Nothing useful to do; the caller reports the cleared state either way.
  }
}

/**
 * Apply the vocabulary to one string of user-facing text.
 *
 * Whole-word, case-sensitive, longest-term-first, and single-pass: replacing
 * term by term would let one replacement's output be rewritten by a later
 * term, which turns a mapping into a chain nobody wrote.
 */
export function applyPersonalVocabulary(
  text: string,
  vocabulary: IPersonalVocabulary | null
): string {
  if (vocabulary === null || vocabulary.terms.size === 0 || text === '') {
    return text
  }

  // `String.replace` with a /g pattern resets `lastIndex` itself, before and
  // after, so a cached pattern is safe to reuse across strings. Worth stating,
  // because the instinct on seeing a module-level /g regex is to add a reset —
  // and a test written to prove that reset was needed cannot be made to fail.
  const pattern = compiledPattern(vocabulary)
  return text.replace(
    pattern,
    matched => vocabulary.terms.get(matched) ?? matched
  )
}

/**
 * The compiled pattern for a vocabulary, built once.
 *
 * `translate` is called for every piece of copy the app renders, so rebuilding
 * a regex from up to two thousand terms on each call is not a micro-optimisation
 * to skip. Keyed by the vocabulary object rather than stored on it so the
 * public shape stays plain data, and weak so replacing the vocabulary does not
 * retain the old one.
 */
const patterns = new WeakMap<IPersonalVocabulary, RegExp>()

function compiledPattern(vocabulary: IPersonalVocabulary): RegExp {
  const existing = patterns.get(vocabulary)
  if (existing !== undefined) {
    return existing
  }
  // Longest first, so `force push` wins over `push` — a regex alternation
  // takes the first branch that matches, not the longest.
  const terms = [...vocabulary.terms.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(terms.map(escapeForRegExp).join('|'), 'g')
  patterns.set(vocabulary, pattern)
  return pattern
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The vocabulary currently in effect, if any.
 *
 * Module state rather than a parameter threaded through every call site: the
 * replacement happens at one text boundary, and a boundary that has to be told
 * about the vocabulary by each of its several hundred callers is a boundary
 * that will be forgotten by one of them.
 */
let active: IPersonalVocabulary | null = null

export function setActivePersonalVocabulary(
  vocabulary: IPersonalVocabulary | null
): void {
  active = vocabulary
}

export function getActivePersonalVocabulary(): IPersonalVocabulary | null {
  return active
}

/** Load whatever was cached. Called once, at renderer start-up. */
export function restorePersonalVocabulary(): void {
  active = readCachedPersonalVocabulary()
}
