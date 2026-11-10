/**
 * Read-only file browsing inside one Minecraft server folder.
 *
 * Pure rules: which paths may be asked for, which files may be shown as text,
 * and which lines are hidden because they hold a secret.
 */

export const MaxMinecraftFileEntries = 500
export const MaxMinecraftFileBytes = 256 * 1024

const ViewableExtensions = new Set([
  'txt',
  'log',
  'properties',
  'json',
  'yml',
  'yaml',
  'toml',
  'cfg',
  'conf',
  'md',
  'mcmeta',
])

/**
 * Split a panel path into safe segments, or null when it could leave the
 * server folder. An empty path is the server folder itself.
 */
export function cleanMinecraftRelativePath(
  text: string
): ReadonlyArray<string> | null {
  if (text.length > 1024 || /[\0\r\n]/.test(text)) {
    return null
  }
  const segments = text.split(/[\\/]+/).filter(segment => segment.length > 0)
  for (const segment of segments) {
    if (
      segment === '.' ||
      segment === '..' ||
      /[:*?"<>|]/.test(segment) ||
      segment.endsWith(' ') ||
      segment.endsWith('.')
    ) {
      return null
    }
  }
  if (/^[\\/]{2}/.test(text) || /^[A-Za-z]:/.test(text)) {
    return null
  }
  return segments
}

/** Whether a file is plain text the panel may show. */
export function isViewableMinecraftFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && ViewableExtensions.has(name.slice(dot + 1).toLowerCase())
}

/**
 * Hide the value of any line whose key names a secret, such as the remote
 * console password in `server.properties`.
 */
export function redactMinecraftSecrets(text: string): string {
  return text.replace(
    /^(\s*["']?[\w.-]*(?:password|secret|token|api[-_]?key)[\w.-]*["']?\s*[=:]\s*)(.*\S.*)$/gim,
    '$1(hidden)'
  )
}

/** The newest part of a long file: whole lines from its end. */
export function tailMinecraftText(text: string, truncated: boolean): string {
  if (!truncated) {
    return text
  }
  const firstBreak = text.indexOf('\n')
  return firstBreak === -1 ? text : text.slice(firstBreak + 1)
}
