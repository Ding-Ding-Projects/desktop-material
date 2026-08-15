import { MaterialSymbolName } from '../lib/material-symbol'

/**
 * The shared pure mappings from the MD3 shell design contract
 * (`design/History MD3.dc.html`).
 *
 * The contract's logic block computes styles as inline strings. Everything
 * those strings resolve to lives in `app/styles/ui/_md3-shell.scss`, so the
 * helpers here return the matching class names instead — one source of truth
 * for the values, one source of truth for which value a given state picks.
 */

/**
 * The five tonal families `statusTone()` selects between.
 *
 * The contract keys them by several vocabularies at once — workflow run
 * statuses (`success` / `failed` / `running` / `cancelled`), notification
 * tones (`ok` / `bad` / `info`) and git file statuses (`A` / `D` / `M`) — and
 * every unrecognised key falls through to amber.
 */
export type Md3ToneKey = 'green' | 'error' | 'primary' | 'surface' | 'amber'

/**
 * A resolved tone: the container class paints the background, the on class
 * paints the foreground. They are separate so a caller that only needs the
 * foreground — the contract's run, branch, agent and inbox icon glyphs, whose
 * inline style is `'color: ' + tone[1]` alone — can apply `on` by itself.
 */
export interface IMd3Tone {
  /** Which tonal family was selected. */
  readonly tone: Md3ToneKey
  /** CSS class painting the tonal container background. */
  readonly container: string
  /** CSS class painting the on-container foreground colour. */
  readonly on: string
}

const Tones: Readonly<Record<Md3ToneKey, IMd3Tone>> = {
  green: {
    tone: 'green',
    container: 'md3-tone--green',
    on: 'md3-tone-on--green',
  },
  error: {
    tone: 'error',
    container: 'md3-tone--error',
    on: 'md3-tone-on--error',
  },
  primary: {
    tone: 'primary',
    container: 'md3-tone--primary',
    on: 'md3-tone-on--primary',
  },
  surface: {
    tone: 'surface',
    container: 'md3-tone--surface',
    on: 'md3-tone-on--surface',
  },
  amber: {
    tone: 'amber',
    container: 'md3-tone--amber',
    on: 'md3-tone-on--amber',
  },
}

/**
 * The contract's `statusTone(kind)`.
 *
 * `success` / `ok` / `A` are green, `failed` / `bad` / `D` are error,
 * `running` is primary, `cancelled` is the highest surface container, and
 * everything else — `info`, `M`, an unknown status — is amber.
 */
export function statusTone(kind: string): IMd3Tone {
  if (kind === 'success' || kind === 'ok' || kind === 'A') {
    return Tones.green
  }
  if (kind === 'failed' || kind === 'bad' || kind === 'D') {
    return Tones.error
  }
  if (kind === 'running') {
    return Tones.primary
  }
  if (kind === 'cancelled') {
    return Tones.surface
  }
  return Tones.amber
}

/** Look a tone up by its key, for callers that already know which family. */
export function toneByKey(key: Md3ToneKey): IMd3Tone {
  return Tones[key]
}

/**
 * The contract's `runIcon(status)` — the glyph beside a workflow run, a job
 * step, and (through the same statuses) an agent session.
 */
export function runIcon(status: string): MaterialSymbolName {
  if (status === 'success') {
    return 'check_circle'
  }
  if (status === 'failed') {
    return 'error'
  }
  if (status === 'running') {
    return 'progress_activity'
  }
  return 'cancel'
}

/**
 * The contract's `initials(name)` — the two-letter avatar text used by the
 * commit list, the commit detail sheet and the account button.
 *
 * Empty name parts are skipped so a doubled space cannot produce `undefined`
 * the way the contract's `p[0]` would.
 */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(part => part.length > 0)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Whether a row starts a new group, and therefore renders a group header.
 *
 * The contract computes this inline in the history, branches and repositories
 * lists as `!prev || prev.day !== c.day`, comparing against the previous
 * *visible* row rather than the previous row in the unfiltered data — so a
 * filtered list still shows a header above whichever row now comes first.
 */
export function isGroupStart(
  previousGroup: string | undefined,
  group: string
): boolean {
  return previousGroup === undefined || previousGroup !== group
}

/**
 * The contract's `'+' + add + ' −' + del` stat, used by the commit rows, the
 * commit detail sheet and the commit composer.
 *
 * The minus is U+2212 MINUS SIGN, as the contract writes it — not a hyphen.
 */
export function formatAddDelete(added: number, deleted: number): string {
  return `+${added} −${deleted}`
}
