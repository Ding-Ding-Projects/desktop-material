/**
 * Demo mode: an explicit opt-in that strips home directory paths out of
 * anything the interface renders, so a surface can be screenshotted without
 * leaking who ran it or where.
 *
 * This exists because the capture harness's privacy assertion correctly refused
 * a Settings history frame that rendered
 * `C:\Users\<name>\AppData\Local\Temp\...` inside a snapshot payload. Every
 * gallery capture is published to a public site and wiki, so a leaked home path
 * cannot be un-published. Redacting at render time is the fix; weakening the
 * gate is not.
 *
 * Three properties this deliberately holds:
 *
 * - **Off unless asked for.** Never inferred from a build channel or a hostname.
 *   A reader's real paths are useful to them, so ordinary runs are untouched.
 * - **Structure survives, identity does not.** `…\Temp\run\repo` still tells you
 *   the shape of a path; the drive, the user and the home prefix are gone. A
 *   redaction that destroyed the whole string would make screenshots useless for
 *   explaining what the surface does.
 * - **Idempotent.** Redacting already-redacted text changes nothing, so a value
 *   that passes through two layers is not mangled twice.
 */

/** The marker that replaces a redacted prefix. */
export const RedactedPrefix = '…'

/**
 * Segments that identify a home or per-user location on the platforms this app
 * ships for. Matching is case-insensitive because Windows paths are.
 */
const HomeSegments = [
  'users',
  'home',
  'documents and settings',
  'appdata',
  'localappdata',
]

/**
 * Reads the flag. Both forms are accepted because the capture harness launches
 * the app directly with argv, while a developer screenshotting by hand finds an
 * environment variable easier.
 */
export function isDemoModeEnabled(
  argv: ReadonlyArray<string> = typeof process === 'undefined'
    ? []
    : process.argv,
  env: Record<string, string | undefined> = typeof process === 'undefined'
    ? {}
    : process.env
): boolean {
  if (argv.some(argument => argument === '--demo-mode')) {
    return true
  }
  const value = env.DESKTOP_MATERIAL_DEMO_MODE
  return value === '1' || value === 'true'
}

/**
 * Replaces the private prefix of one path with `…`, keeping the tail that
 * explains what the path is for.
 *
 * The tail starts after the last home-identifying segment, so
 * `C:\Users\ada\AppData\Local\Temp\run\repo` becomes `…\Temp\run\repo` rather
 * than losing the part a reader needs in order to follow a screenshot.
 */
export function redactPath(value: string): string {
  if (value.length === 0) {
    return value
  }
  const separator = value.includes('\\') ? '\\' : '/'
  const segments = value.split(/[\\/]/)
  let lastHome = -1
  for (let index = 0; index < segments.length; index++) {
    if (HomeSegments.includes(segments[index].toLowerCase())) {
      // The segment *after* a home marker is the user name, so skip it too.
      lastHome = Math.max(lastHome, index + 1)
    }
  }

  if (lastHome === -1) {
    // A drive-absolute or UNC path with no home marker still exposes a location,
    // so drop its root but keep the rest.
    if (/^[a-z]:$/i.test(segments[0]) || value.startsWith('\\\\')) {
      const tail = segments.filter(
        segment => segment.length > 0 && !/^[a-z]:$/i.test(segment)
      )
      return tail.length === 0
        ? RedactedPrefix
        : RedactedPrefix + separator + tail.join(separator)
    }
    return value
  }

  const tail = segments
    .slice(lastHome + 1)
    .filter(segment => segment.length > 0)
  return tail.length === 0
    ? RedactedPrefix
    : RedactedPrefix + separator + tail.join(separator)
}

/**
 * Redacts every absolute path embedded anywhere in a block of text.
 *
 * Settings history renders JSON, so paths arrive escaped as `C:\\Users\\...`
 * inside a string. Both the plain and the JSON-escaped form are handled, and
 * the escaping style of the match is preserved so the surrounding JSON stays
 * parseable.
 */
export function redactHomePaths(text: string): string {
  if (text.length === 0) {
    return text
  }

  // Drive-absolute Windows paths, escaped or not, plus POSIX home paths. The
  // alternation is ordered longest-first so an escaped path is never matched by
  // the unescaped pattern and left half-redacted.
  const patterns = [
    /[a-zA-Z]:(?:\\\\[^"'\s\\]+)+/g,
    /[a-zA-Z]:(?:\\[^"'\s\\/]+)+/g,
    /[a-zA-Z]:(?:\/[^"'\s/]+)+/g,
    /\/(?:home|Users)\/[^"'\s:]+/g,
  ]

  let output = text
  for (const pattern of patterns) {
    output = output.replace(pattern, match => {
      const escaped = match.includes('\\\\')
      // Normalise to single separators, redact, then restore the escaping the
      // surrounding text used, or the JSON around it stops parsing.
      const plain = escaped ? match.replace(/\\\\/g, '\\') : match
      const redacted = redactPath(plain)
      return escaped ? redacted.replace(/\\/g, '\\\\') : redacted
    })
  }
  return output
}

/**
 * Applies `redactHomePaths` only when demo mode is on.
 *
 * Call sites use this rather than checking the flag themselves, so a surface
 * cannot accidentally redact for everyone or for nobody.
 */
export function redactForDemo(text: string, enabled: boolean): string {
  return enabled ? redactHomePaths(text) : text
}
