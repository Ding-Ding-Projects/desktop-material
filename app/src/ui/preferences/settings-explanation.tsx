import * as React from 'react'
import { getPersistedLanguageMode } from '../../lib/i18n'

export type SettingValueProvenance =
  | 'compiled-default'
  | 'stored-choice'
  | 'runtime-only'
  | 'credential-vault'
  | 'main-process-config'

export interface ISettingExplanationProps {
  /** Stable setting identity used by the hand-written completeness inventory. */
  readonly settingId: string
  /**
   * Optional conceptual identity for repeated controls. The setting id stays
   * unique for DOM references while this value links every repeated instance
   * to one hand-written inventory row.
   */
  readonly inventoryId?: string
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
      data-setting-explanation-id={props.inventoryId ?? props.settingId}
      data-setting-instance-id={props.settingId}
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

export interface IBooleanSettingExplanationProps {
  readonly settingId: string
  readonly explanationEnglish: string
  readonly explanationCantonese: string
  readonly value: boolean
  readonly shippedValue: boolean
  readonly storageKey: string
}

function localize(english: string, cantonese: string): string {
  switch (getPersistedLanguageMode()) {
    case 'cantonese':
      return cantonese
    case 'bilingual':
      return `${english} · ${cantonese}`
    default:
      return english
  }
}

function hasStoredChoice(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

/** Shared localized provenance for ordinary persisted boolean settings. */
export function BooleanSettingExplanation(
  props: IBooleanSettingExplanationProps
): JSX.Element {
  const stored = hasStoredChoice(props.storageKey)
  const currentEnglish = props.value ? 'on' : 'off'
  const currentCantonese = props.value ? '開' : '關'
  const shippedEnglish = props.shippedValue ? 'on' : 'off'
  const shippedCantonese = props.shippedValue ? '開' : '關'
  return (
    <SettingExplanation
      settingId={props.settingId}
      summary={localize('What this setting changes', '呢個設定會改咩')}
      explanation={localize(
        props.explanationEnglish,
        props.explanationCantonese
      )}
      source={stored ? 'stored-choice' : 'compiled-default'}
      provenance={localize(
        stored
          ? `A choice is recorded on this computer. Current value: ${currentEnglish}. Shipped value: ${shippedEnglish}.`
          : `No choice is recorded on this computer. Current and shipped value: ${shippedEnglish}.`,
        stored
          ? `呢部電腦記錄咗選擇。目前值：${currentCantonese}。出廠值：${shippedCantonese}。`
          : `呢部電腦未記錄選擇。目前值同出廠值：${shippedCantonese}。`
      )}
    />
  )
}

export interface ISelectionSettingExplanationProps {
  readonly settingId: string
  readonly explanationEnglish: string
  readonly explanationCantonese: string
  readonly currentEnglish: string
  readonly currentCantonese: string
  readonly shippedEnglish: string
  readonly shippedCantonese: string
  readonly storageKey: string
}

/** Shared localized provenance for persisted selections and text values. */
export function SelectionSettingExplanation(
  props: ISelectionSettingExplanationProps
): JSX.Element {
  const stored = hasStoredChoice(props.storageKey)
  return (
    <SettingExplanation
      settingId={props.settingId}
      summary={localize('What this setting changes', '呢個設定會改咩')}
      explanation={localize(
        props.explanationEnglish,
        props.explanationCantonese
      )}
      source={stored ? 'stored-choice' : 'compiled-default'}
      provenance={localize(
        stored
          ? `A choice is recorded on this computer. Current value: ${props.currentEnglish}. Shipped value: ${props.shippedEnglish}.`
          : `No choice is recorded on this computer. Current and shipped value: ${props.shippedEnglish}.`,
        stored
          ? `呢部電腦記錄咗選擇。目前值：${props.currentCantonese}。出廠值：${props.shippedCantonese}。`
          : `呢部電腦未記錄選擇。目前值同出廠值：${props.shippedCantonese}。`
      )}
    />
  )
}
