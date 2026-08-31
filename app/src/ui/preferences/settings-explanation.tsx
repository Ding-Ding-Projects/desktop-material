import * as React from 'react'

export type SettingValueProvenance =
  | 'compiled-default'
  | 'stored-choice'
  | 'runtime-only'
  | 'credential-vault'

export interface ISettingExplanationProps {
  /** Stable setting identity used by the hand-written completeness inventory. */
  readonly settingId: string
  /** Localized progressive-disclosure label. */
  readonly summary: string
  /** Localized explanation of the setting's actual behavior. */
  readonly explanation: string
  /** Localized factual source line naming the current and shipped values. */
  readonly provenance: string
  /** Machine-readable provenance category for focused coverage checks. */
  readonly source: SettingValueProvenance
}

export interface ISettingExplanationDescriptionIds {
  readonly explanationId: string
  readonly provenanceId: string
  readonly ariaDescribedBy: string
}

/**
 * Return stable ids shared by the control and its explanation block.
 *
 * Callers use `ariaDescribedBy` on the actual setting control. This makes the
 * progressive explanation and the factual provenance available to assistive
 * technology even while the visual disclosure is collapsed.
 */
export function settingExplanationDescriptionIds(
  settingId: string
): ISettingExplanationDescriptionIds {
  const explanationId = `${settingId}-setting-explanation`
  const provenanceId = `${settingId}-setting-provenance`
  return {
    explanationId,
    provenanceId,
    ariaDescribedBy: `${explanationId} ${provenanceId}`,
  }
}

/** Progressive explanation plus truthful default/source provenance. */
export function SettingExplanation(
  props: ISettingExplanationProps
): JSX.Element {
  const ids = settingExplanationDescriptionIds(props.settingId)
  return (
    <div
      className="setting-explanation"
      data-setting-explanation-id={props.settingId}
      data-setting-provenance={props.source}
    >
      <details className="setting-explanation__details">
        <summary>{props.summary}</summary>
        <p id={ids.explanationId}>{props.explanation}</p>
      </details>
      <p id={ids.provenanceId} className="setting-explanation__provenance">
        {props.provenance}
      </p>
    </div>
  )
}
