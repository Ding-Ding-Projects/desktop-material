export const MaxOllamaHarnessProfiles = 64

export interface IOllamaHarnessProfile {
  readonly id: string
  readonly label: string
  readonly executable: string
  readonly arguments: ReadonlyArray<string>
  readonly workingDirectory: string
  readonly environmentKeys: ReadonlyArray<string>
}

export interface IOllamaHarnessSnapshot {
  readonly profileId: string
  readonly capturedAt: number
  readonly model: string
  readonly environmentKeys: ReadonlyArray<string>
}

/** Reject shell syntax so launch adapters may only execute explicitly registered profiles. */
export function isAllowlistedHarnessProfile(value: unknown): value is IOllamaHarnessProfile {
  if (typeof value !== 'object' || value === null) {return false}
  const profile = value as Record<string, unknown>
  return typeof profile.id === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(profile.id) &&
    typeof profile.label === 'string' && profile.label.trim().length > 0 && profile.label.length <= 120 &&
    typeof profile.executable === 'string' && profile.executable.length > 0 && !/[|&;<>()`$]/.test(profile.executable) &&
    typeof profile.workingDirectory === 'string' && profile.workingDirectory.length > 0 &&
    Array.isArray(profile.arguments) && profile.arguments.length <= 32 && profile.arguments.every(arg => typeof arg === 'string' && arg.length <= 512 && !/[|&;<>()`$]/.test(arg)) &&
    Array.isArray(profile.environmentKeys) && profile.environmentKeys.length <= 32 && profile.environmentKeys.every(key => typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
}
