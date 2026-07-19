/** The three user-selectable language presentations supported by the app. */
export type LanguageMode = 'english' | 'cantonese' | 'bilingual'

export const languageModes: ReadonlyArray<LanguageMode> = [
  'english',
  'cantonese',
  'bilingual',
]

/** Normalize an untrusted profile value without consulting the host locale. */
export function normalizeLanguageMode(value: unknown): LanguageMode {
  return typeof value === 'string' &&
    languageModes.includes(value as LanguageMode)
    ? (value as LanguageMode)
    : 'english'
}
