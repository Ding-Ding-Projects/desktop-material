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
  'accounts-bitbucket-authorization',
  'accounts-bitbucket-username',
  'accounts-gitlab-authorization',
  'accounts-gitlab-server',
  'accounts-jira-authorization',
  'accounts-jira-deployment',
  'accounts-jira-email',
  'accounts-jira-server',
  'accounts-trello-api-key',
  'accounts-trello-authorization',
  'accounts-trello-server',
  'advanced-auto-switch-account',
  'advanced-browser-open-mode',
  'advanced-external-credential-helper',
  'advanced-large-repository-auto-detect',
  'advanced-large-repository-auto-repack',
  'advanced-repository-indicators',
  'advanced-usage-reporting',
  'advanced-verbose-logging',
  'advanced-windows-openssh',
  'ai-default-repository-eligibility',
  'ai-master-switch',
  'ai-provider-byok',
  'ai-provider-github-copilot',
  'attention-focus',
  'attention-low-stimulation',
  'attention-time-awareness',
  'attention-one-thing-at-a-time',
  'attention-momentum',
  'attention-next-action',
  'attention-momentum-defer-interval',
  'prompts-commit-length-warning',
  'prompts-confirm-checkout-commit',
  'prompts-confirm-commit-filtered-changes',
  'prompts-confirm-commit-message-override',
  'prompts-confirm-discard-changes',
  'prompts-confirm-discard-permanently',
  'prompts-confirm-discard-stash',
  'prompts-confirm-force-push',
  'prompts-confirm-repository-removal',
  'prompts-confirm-undo-commit',
  'prompts-confirm-worktree-removal',
  'prompts-uncommitted-changes-strategy',
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
