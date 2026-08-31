import { enableHooksByDefault, enableHooksEnvironment } from '../feature-flag'
import { getBoolean, setBoolean } from '../local-storage'

export const defaultHooksEnvEnabledValue = enableHooksByDefault()
export const hooksEnvEnabledKey = 'git-hooks-env-enabled'

/**
 * Whether the hooks environment is enabled, takes into account the
 * `enableHooksEnvironment` feature flag.
 */
export const getHooksEnvEnabled = () =>
  enableHooksEnvironment() &&
  getBoolean(hooksEnvEnabledKey, defaultHooksEnvEnabledValue)

export const setHooksEnvEnabled = (enabled: boolean): void =>
  setBoolean(hooksEnvEnabledKey, enabled)

export const defaultCacheHooksEnvValue = true
export const cacheHooksEnvKey = 'git-cache-hooks-env'
export const getCacheHooksEnv = () =>
  getBoolean(cacheHooksEnvKey, defaultCacheHooksEnvValue)
export const setCacheHooksEnv = (enabled: boolean): void =>
  setBoolean(cacheHooksEnvKey, enabled)

export const defaultGitHookEnvShell: SupportedHooksEnvShell = 'git-bash'
export const gitHookEnvShellKey = 'git-hook-env-shell'
export const getGitHookEnvShell = (): SupportedHooksEnvShell => {
  const shell = localStorage.getItem(gitHookEnvShellKey)
  if (
    shell === 'git-bash' ||
    shell === 'pwsh' ||
    shell === 'powershell' ||
    shell === 'cmd'
  ) {
    return shell
  }
  return defaultGitHookEnvShell
}

export const shellFriendlyNames: Readonly<
  Record<SupportedHooksEnvShell, string>
> = {
  'git-bash': 'Git Bash',
  pwsh: 'PowerShell Core',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt',
}

export const setGitHookEnvShell = (shell: string) =>
  localStorage.setItem(gitHookEnvShellKey, shell)

export type SupportedHooksEnvShell = 'git-bash' | 'pwsh' | 'powershell' | 'cmd'
