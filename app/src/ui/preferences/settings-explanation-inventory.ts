/**
 * Hand-written inventory of settings that use the shared progressive
 * explanation and truthful provenance component.
 *
 * This list is deliberately explicit. Source discovery cannot detect a
 * setting that disappeared entirely, so each newly covered setting is added
 * here in the same change as its control and focused proof.
 */
export const ImplementedSettingExplanationIds = [
  'accessibility-diff-check-marks',
  'accessibility-underline-links',
  'attention-focus',
  'attention-low-stimulation',
  'attention-time-awareness',
  'attention-one-thing-at-a-time',
  'attention-momentum',
  'attention-next-action',
  'attention-momentum-defer-interval',
  'status-hub-endpoint',
  'status-hub-authorization-replacement',
] as const

export type ImplementedSettingExplanationId =
  typeof ImplementedSettingExplanationIds[number]

export function assertImplementedSettingExplanationIds(
  ids: ReadonlyArray<string>
): void {
  const actual = [...ids].sort()
  const expected = [...ImplementedSettingExplanationIds].sort()
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `Setting explanation inventory mismatch. Expected ${expected.join(
        ', '
      )}; received ${actual.join(', ')}.`
    )
  }
}
