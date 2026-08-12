/**
 * Which voices this machine actually has, and which one a setting refers to.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * The Web Speech voice list is one of the more awkward browser APIs and every
 * awkwardness is invisible until it bites:
 *
 * - `getVoices()` frequently returns an **empty array on the first call** and
 *   fills in later, announced by a `voiceschanged` event. A picker built
 *   without that subscription shows "no voices installed" on a machine with
 *   forty, and looks like a broken control rather than a slow one.
 * - Voice **names are not unique and are localized by the platform**, so the
 *   `voiceURI` is the only stable identity to persist.
 * - A stored choice can name a voice that has since been **uninstalled**. That
 *   is worth saying out loud on the settings screen; silently resetting it
 *   loses a deliberate choice on a machine that may get the voice back.
 */

/** One selectable narrator voice. */
export interface INarratorVoice {
  /** Stable identity, and what gets persisted. */
  readonly uri: string
  /** What the platform calls it, for display only. */
  readonly name: string
  /** BCP-47 tag, e.g. `en-GB`, `zh-HK`. */
  readonly lang: string
  /** Whether the platform marks it as this machine's default. */
  readonly isDefault: boolean
  /** False for a network-backed voice, which will not work offline. */
  readonly localService: boolean
}

/** Which half of the narrator a voice list is for. */
export type NarratorVoiceLanguage = 'english' | 'cantonese'

/**
 * Language prefixes each side of the narrator will accept.
 *
 * Cantonese takes the whole `zh` family rather than only `yue`, because most
 * Windows and macOS installs label their Hong Kong voice `zh-HK` and a filter
 * demanding `yue` finds nothing on a machine that plainly has one.
 */
const prefixes: Record<NarratorVoiceLanguage, ReadonlyArray<string>> = {
  english: ['en'],
  cantonese: ['zh', 'yue'],
}

function toNarratorVoice(voice: SpeechSynthesisVoice): INarratorVoice {
  return {
    uri: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    isDefault: voice.default === true,
    localService: voice.localService !== false,
  }
}

/**
 * Every installed voice, or an empty list when speech synthesis is absent.
 *
 * Never throws. A settings screen that cannot enumerate voices still has to
 * render, and it says so rather than failing.
 */
export function readInstalledVoices(
  synthesis: SpeechSynthesis | undefined = typeof window === 'undefined'
    ? undefined
    : window.speechSynthesis
): ReadonlyArray<INarratorVoice> {
  if (synthesis === undefined) {
    return []
  }
  try {
    return synthesis.getVoices().map(toNarratorVoice)
  } catch {
    return []
  }
}

/** The installed voices one side of the narrator can use, sorted for display. */
export function voicesForLanguage(
  voices: ReadonlyArray<INarratorVoice>,
  language: NarratorVoiceLanguage
): ReadonlyArray<INarratorVoice> {
  const accepted = prefixes[language]
  return voices
    .filter(voice => {
      const tag = voice.lang.toLowerCase()
      return accepted.some(
        prefix => tag === prefix || tag.startsWith(`${prefix}-`)
      )
    })
    .slice()
    .sort((a, b) => {
      // Offline voices first: a network voice that stops working on a train is
      // a worse default than a local one, so it should not be the easiest to
      // land on.
      if (a.localService !== b.localService) {
        return a.localService ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
}

/** What the settings screen should say about the current choice. */
export type NarratorVoiceStatus =
  | { readonly kind: 'automatic' }
  | { readonly kind: 'chosen'; readonly voice: INarratorVoice }
  /** Chosen once, not installed now. The choice is kept, not reset. */
  | { readonly kind: 'missing'; readonly uri: string }
  /** No voice on this machine can read this language at all. */
  | { readonly kind: 'none-available' }

export function describeVoiceChoice(
  chosenUri: string,
  available: ReadonlyArray<INarratorVoice>
): NarratorVoiceStatus {
  if (chosenUri === '') {
    return available.length === 0
      ? { kind: 'none-available' }
      : { kind: 'automatic' }
  }
  const voice = available.find(candidate => candidate.uri === chosenUri)
  return voice === undefined
    ? { kind: 'missing', uri: chosenUri }
    : { kind: 'chosen', voice }
}

/** The sentence the settings screen shows beside the picker. */
export function narratorVoiceStatusText(status: NarratorVoiceStatus): string {
  switch (status.kind) {
    case 'automatic':
      return 'Chosen automatically: the closest match this computer has for the language being spoken.'
    case 'chosen':
      return status.voice.localService
        ? `${status.voice.name} (${status.voice.lang}), installed on this computer.`
        : `${status.voice.name} (${status.voice.lang}). This voice is provided over the network and will not speak while you are offline.`
    case 'missing':
      return 'The voice this was set to is not installed on this computer, so the narrator is falling back to the closest match. Your choice has been kept in case the voice comes back.'
    case 'none-available':
      return 'This computer has no voice installed that can read this language. The narrator will stay silent for it until one is added.'
  }
}

/**
 * Subscribe to the voice list filling in.
 *
 * Returns an unsubscribe function. Callers must call it: a settings screen that
 * leaves this attached keeps a closure over an unmounted component alive.
 */
export function onVoicesChanged(
  listener: () => void,
  synthesis: SpeechSynthesis | undefined = typeof window === 'undefined'
    ? undefined
    : window.speechSynthesis
): () => void {
  if (synthesis === undefined || synthesis.addEventListener === undefined) {
    return () => undefined
  }
  synthesis.addEventListener('voiceschanged', listener)
  return () => synthesis.removeEventListener('voiceschanged', listener)
}
