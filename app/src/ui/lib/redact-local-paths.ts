/**
 * Collapse absolute local filesystem paths in text that is about to be shown
 * to the user (and could be screenshotted or screen-shared). Settings and tab
 * appearance state persist an absolute `repositoryPath`, so the settings
 * history diff would otherwise expose the user's home/profile/Temp path.
 *
 * The redaction is display-only — stored data keeps the exact path. It handles
 * both plain (`C:\Users\name\...`) and JSON-escaped (`C:\\Users\\name\\...`)
 * backslashes, and POSIX home paths (`/Users/name/...`, `/home/name/...`). It
 * only ever matches home-rooted absolute paths, so ordinary settings content
 * (titles, colours, flags) is never altered.
 */
export function redactLocalPaths(text: string): string {
  if (text.length === 0) {
    return text
  }

  const windowsHomePath = /[A-Za-z]:(?:\\\\|\\)Users(?:\\\\|\\)[^"\r\n]*/g
  const posixHomePath = /\/(?:Users|home)\/[^"\r\n]*/g

  return text
    .replace(windowsHomePath, 'C:\\…\\(local path hidden)')
    .replace(posixHomePath, '/…/(local path hidden)')
}
