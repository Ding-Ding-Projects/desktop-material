/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import {
  IAIAdminPolicySettings,
  getExplicitRepositoryOverride,
  resolveRepositoryAIEligibility,
} from '../../lib/ai-admin-policy'

interface IAISecurityOverridesProps {
  readonly repositoryPath: string
  readonly settings: IAIAdminPolicySettings
  /** `null` clears the explicit override and falls back to the global default. */
  readonly onOverrideChanged: (override: 'allow' | 'deny' | null) => void
}

/**
 * Per-repository override for whether AI features (commit message
 * generation, conflict resolution, and similar) may read this repository's
 * diffs or file contents at all.
 *
 * This is the reusable per-repository settings pattern used elsewhere in
 * repository settings (see `automation-overrides.tsx`): a plain override
 * relative to the administrator's global default, persisted through
 * `ai-admin-policy.ts`.
 */
export function AISecurityOverrides(props: IAISecurityOverridesProps) {
  const { settings, repositoryPath } = props
  const explicitOverride = getExplicitRepositoryOverride(
    settings,
    repositoryPath
  )
  const effective = resolveRepositoryAIEligibility(settings, repositoryPath)

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    props.onOverrideChanged(
      value === 'inherit' ? null : (value as 'allow' | 'deny')
    )
  }

  return (
    <div className="repository-ai-security-settings">
      <h2>AI features</h2>
      <p>
        Controls whether commit message generation, conflict resolution, and
        other AI features may send this repository's diffs or file contents to a
        model. Every AI feature checks this before sending anything.
      </p>
      {!settings.aiFeaturesEnabled && (
        <p className="settings-description">
          An administrator has disabled AI features on this machine entirely.
          This repository-level setting only takes effect if that master switch
          is turned back on.
        </p>
      )}
      <label className="ai-security-override-row">
        <span>This repository</span>
        <select value={explicitOverride ?? 'inherit'} onChange={onChange}>
          <option value="inherit">
            Use global default (
            {settings.defaultRepositoryEligibility === 'allow'
              ? 'allowed'
              : 'denied'}
            )
          </option>
          <option value="allow">Allowed</option>
          <option value="deny">Denied</option>
        </select>
      </label>
      <p className="settings-description">
        Currently {effective === 'allow' ? 'allowed' : 'denied'} for{' '}
        <code>{repositoryPath}</code>.
      </p>
    </div>
  )
}
