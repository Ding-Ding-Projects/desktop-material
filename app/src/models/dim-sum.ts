/**
 * The dim sum surprise: one launch in ten, Desktop Material puts a small
 * picture of a dim sum dish in the corner, names it in both languages, and
 * takes it away again on its own.
 *
 * Everything in this file is pure and DOM-free so the draw, the suppression
 * rules and the naming can be unit-tested without a renderer. The randomness
 * is always passed in, never taken from `Math.random` here, so a test can pin
 * every outcome.
 */

/** The chance, per launch, that the surprise appears. */
export const DimSumSurpriseProbability = 0.1

/**
 * How long the card stays before it dismisses itself.
 *
 * Long enough to read a dish name in two scripts, short enough that a user who
 * ignores it never has to deal with it.
 */
export const DimSumSurpriseDurationMs = 9_000

/** One bundled dish: its names, its picture, and what the picture shows. */
export interface IDimSumDish {
  /** The catalog id, e.g. `hk-dish-0001`. Stable across catalog releases. */
  readonly id: string
  readonly slug: string
  /** The dish's real name. Never styled by the funny level. */
  readonly name: {
    readonly en: string
    readonly zhHant: string
  }
  /** Jyutping romanization, or the empty string when the catalog has none. */
  readonly jyutping: string
  readonly category: string
  /** What the photograph shows, for the image's alt text. */
  readonly alt: {
    readonly en: string
    readonly yue: string
  }
  /** PNG filename inside the bundled asset directory. */
  readonly file: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  /** SHA-256 of the copied bytes, proving the picture is the catalog's. */
  readonly sha256: string
}

/** Why a launch is showing nothing. `null` means it may go ahead. */
export type DimSumSuppressionReason =
  /** The window is still starting, or the welcome flow owns the screen. */
  | 'first-run'
  /** Startup failed; a joke on top of a broken app is not a delight. */
  | 'error'
  /** An update is downloading, installing, or waiting to restart. */
  | 'update'
  /** A modal has the user mid-decision. */
  | 'modal'
  /** The user's quiet hours are open. */
  | 'quiet-hours'
  /** This launch has already drawn; there is exactly one draw per launch. */
  | 'already-drawn'
  /** No dish survived verification, so there is nothing to show. */
  | 'no-dishes'

/** What the app knows about itself when it considers drawing. */
export interface IDimSumLaunchContext {
  /** True while the welcome/first-run flow is on screen. */
  readonly firstRun: boolean
  /** True when startup failed or an error surface is showing. */
  readonly errorState: boolean
  /** True while an update is downloading, ready, or restarting. */
  readonly updating: boolean
  /** True while a blocking dialog is open. */
  readonly modalOpen: boolean
  /** True while the user's configured quiet hours are open. */
  readonly quietHours: boolean
  /** True once this launch has spent its single draw. */
  readonly alreadyDrawn: boolean
  /** How many verified dishes are bundled. */
  readonly dishCount: number
}

/**
 * Decide whether this launch may draw, and say why when it may not.
 *
 * Ordered so the most serious reason is reported first: a user whose app just
 * failed to start is told `error`, not `quiet-hours`.
 */
export function dimSumSuppressionReason(
  context: IDimSumLaunchContext
): DimSumSuppressionReason | null {
  if (context.errorState) {
    return 'error'
  }
  if (context.firstRun) {
    return 'first-run'
  }
  if (context.updating) {
    return 'update'
  }
  if (context.modalOpen) {
    return 'modal'
  }
  if (context.quietHours) {
    return 'quiet-hours'
  }
  if (context.alreadyDrawn) {
    return 'already-drawn'
  }
  if (context.dishCount <= 0) {
    return 'no-dishes'
  }
  return null
}

/**
 * True for exactly the bottom tenth of the unit interval.
 *
 * A draw that is not a usable number in `[0, 1)` is a miss rather than a lucky
 * accident: a broken random source must never make the surprise more frequent
 * than the stated one launch in ten.
 */
export function shouldShowDimSum(
  randomValue: unknown,
  probability: number = DimSumSurpriseProbability
): boolean {
  if (typeof randomValue !== 'number' || !isFinite(randomValue)) {
    return false
  }
  if (randomValue < 0 || randomValue >= 1) {
    return false
  }
  return randomValue < probability
}

/**
 * Select a dish from a second, independent draw.
 *
 * Every value in `[0, 1]` maps onto a dish, including 1, and a malformed draw
 * falls back to the first dish rather than throwing — a broken random source
 * costs the user a varied dish, never an error on startup.
 */
export function pickDimSumDish(
  dishes: ReadonlyArray<IDimSumDish>,
  randomValue: unknown
): IDimSumDish | null {
  if (dishes.length === 0) {
    return null
  }
  if (typeof randomValue !== 'number' || !isFinite(randomValue)) {
    return dishes[0]
  }

  const clamped = Math.min(1, Math.max(0, randomValue))
  const index = Math.min(dishes.length - 1, Math.floor(clamped * dishes.length))
  return dishes[index]
}

/**
 * The dish's visible name, both languages, primary first.
 *
 * The content is identical in every mode and at every funny level — only the
 * order changes. The name is the fact on the card, not part of the voice.
 */
export function dimSumDisplayName(
  dish: IDimSumDish,
  primary: 'english' | 'cantonese'
): string {
  return primary === 'cantonese'
    ? `${dish.name.zhHant} · ${dish.name.en}`
    : `${dish.name.en} · ${dish.name.zhHant}`
}

/** One run of same-language text, tagged so a screen reader switches voice. */
export interface IDimSumNamePart {
  readonly text: string
  /** BCP-47 tag, or null for the separator, which belongs to neither. */
  readonly lang: 'en' | 'zh-HK' | null
}

/**
 * Split the visible name into language-tagged runs.
 *
 * A dish name is always mixed-script. Without a per-run tag an English
 * synthesizer reads 蝦餃 as unknown glyphs and a Cantonese one mangles the
 * Latin half (WCAG 3.1.2). The runs always rejoin into exactly
 * {@link dimSumDisplayName}, so the rendered and the spoken name cannot drift.
 */
export function dimSumNameParts(
  dish: IDimSumDish,
  primary: 'english' | 'cantonese'
): ReadonlyArray<IDimSumNamePart> {
  const english: IDimSumNamePart = { text: dish.name.en, lang: 'en' }
  const cantonese: IDimSumNamePart = { text: dish.name.zhHant, lang: 'zh-HK' }
  const separator: IDimSumNamePart = { text: ' · ', lang: null }

  return primary === 'cantonese'
    ? [cantonese, separator, english]
    : [english, separator, cantonese]
}

/**
 * Alt text for the photograph.
 *
 * It names the dish in both languages in every mode, so a screen-reader user
 * gets the same delight as a sighted one, and it describes the picture rather
 * than repeating the visible name.
 */
export function dimSumAltText(
  dish: IDimSumDish,
  primary: 'english' | 'cantonese'
): string {
  const name = dimSumDisplayName(dish, primary)
  return primary === 'cantonese'
    ? `${dish.alt.yue}（${name}）`
    : `${dish.alt.en} (${name})`
}

/**
 * Keys a previous release may have used to switch the surprise off.
 *
 * There is no off switch any more, so these are deleted rather than read: a
 * profile carrying an old refusal simply rejoins the draw. They are listed
 * here so the migration is auditable and so nothing re-reads them by accident.
 */
export const RetiredDimSumOptOutKeys: ReadonlyArray<string> = [
  'dim-sum-surprise-enabled',
  'dim-sum-surprise-v1',
  'show-dim-sum-surprise',
]

/**
 * Delete every retired opt-out preference, returning the keys removed.
 *
 * Runs on every launch and is a no-op on a profile that never had one. A
 * storage failure is swallowed: losing the migration costs a stale unused key,
 * while throwing here would cost the user their startup.
 */
export function migrateDimSumOptOut(
  storage: Pick<Storage, 'getItem' | 'removeItem'>
): ReadonlyArray<string> {
  const removed: Array<string> = []
  for (const key of RetiredDimSumOptOutKeys) {
    try {
      if (storage.getItem(key) !== null) {
        storage.removeItem(key)
        removed.push(key)
      }
    } catch {
      // A profile whose storage is unreadable keeps the surprise anyway.
    }
  }
  return removed
}
