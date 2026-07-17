import {
  HKEY,
  RegistryStringEntry,
  RegistryValue,
  RegistryValueType,
  enumerateValuesSafe,
} from 'registry-js'

/**
 * Resolve the environment a build should run in.
 *
 * A GUI process on Windows inherits the PATH captured when Explorer launched
 * it, which frequently omits tools installed after login. To match what the
 * user sees in a fresh terminal we re-read the persisted PATH from the registry
 * (`HKCU\Environment` merged after `HKLM\…\Session Manager\Environment`),
 * expand `%VAR%` references, and overlay it on the current process env.
 *
 * A GUI process on macOS (and Linux) has the launchd/session PATH, which
 * typically omits Homebrew and per-user toolchain directories entirely. There
 * we append the well-known tool directories that shells pick up via profile
 * scripts, so builds find the same toolchains a terminal would.
 */

const HKLM_ENV_SUBKEY =
  'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'

function isStringValue(value: RegistryValue): value is RegistryStringEntry {
  return (
    value.type === RegistryValueType.REG_SZ ||
    value.type === RegistryValueType.REG_EXPAND_SZ
  )
}

function readPathValue(hkey: HKEY, subkey: string): string | null {
  for (const value of enumerateValuesSafe(hkey, subkey)) {
    if (value.name.toLowerCase() === 'path' && isStringValue(value)) {
      return value.data
    }
  }
  return null
}

/** Expand `%NAME%` references against the provided environment. */
function expandEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => {
    const resolved = env[name] ?? env[name.toUpperCase()]
    return resolved ?? whole
  })
}

function splitSegments(value: string): string[] {
  return value.split(';').filter(segment => segment.length > 0)
}

/**
 * Read the user's persisted PATH from the registry (machine PATH first, then
 * user PATH appended), with `%VAR%` expanded and duplicate segments removed.
 * Returns `null` on non-Windows platforms or when neither value can be read.
 */
export function readUserPathFromRegistry(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (process.platform !== 'win32') {
    return null
  }

  const machine = readPathValue(HKEY.HKEY_LOCAL_MACHINE, HKLM_ENV_SUBKEY)
  const user = readPathValue(HKEY.HKEY_CURRENT_USER, 'Environment')
  if (machine == null && user == null) {
    return null
  }

  const segments = [
    ...splitSegments(expandEnv(machine ?? '', env)),
    ...splitSegments(expandEnv(user ?? '', env)),
  ]

  const seen = new Set<string>()
  const merged: string[] = []
  for (const segment of segments) {
    const key = segment.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(segment)
    }
  }

  return merged.length > 0 ? merged.join(';') : null
}

/**
 * Well-known POSIX tool directories that login shells add via profile scripts
 * but GUI processes don't inherit. Appending a directory that doesn't exist is
 * harmless, so no disk probing is needed.
 */
export function wellKnownPosixToolDirs(env: NodeJS.ProcessEnv): string[] {
  const dirs = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
  ]
  const home = env.HOME ?? ''
  if (home.length > 0) {
    dirs.push(
      `${home}/.cargo/bin`,
      `${home}/go/bin`,
      `${home}/.local/bin`,
      `${home}/.deno/bin`,
      `${home}/.bun/bin`,
      `${home}/.pub-cache/bin`,
      `${home}/.dotnet/tools`,
      `${home}/.mix/escripts`
    )
  }
  return dirs
}

/** Append the well-known tool directories to a colon-separated PATH value. */
export function appendPosixToolDirs(
  pathValue: string,
  env: NodeJS.ProcessEnv
): string {
  const segments = pathValue.split(':').filter(segment => segment.length > 0)
  const seen = new Set(segments)
  for (const dir of wellKnownPosixToolDirs(env)) {
    if (!seen.has(dir)) {
      seen.add(dir)
      segments.push(dir)
    }
  }
  return segments.join(':')
}

/**
 * Build the environment record a build runs in: the base env overlaid with the
 * registry-resolved PATH on Windows, or with the well-known Homebrew and
 * per-user toolchain directories appended on macOS / Linux.
 */
export function resolveRunEnv(
  baseEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  if (process.platform === 'win32') {
    const registryPath = readUserPathFromRegistry(baseEnv)
    if (registryPath != null) {
      // Windows env keys are case-insensitive; normalize onto `Path`.
      delete env.PATH
      env.Path = registryPath
    }
  } else {
    env.PATH = appendPosixToolDirs(env.PATH ?? '', baseEnv)
  }

  return env
}
