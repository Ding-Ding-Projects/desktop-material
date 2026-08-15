const DiffLineWrapStorageKey = 'desktop-material-diff-line-wrap'

export const DiffLineWrapChangedEvent =
  'desktop-material-diff-line-wrap-changed'

/** Read the shared diff wrapping preference without making renderer startup depend on storage. */
export function readDiffLineWrap(): boolean {
  try {
    const value = window.localStorage.getItem(DiffLineWrapStorageKey)
    return value === null ? true : value !== 'false'
  } catch {
    return true
  }
}

/** Persist and broadcast the preference so every mounted diff toolbar stays synchronized. */
export function writeDiffLineWrap(wrapLines: boolean): void {
  try {
    window.localStorage.setItem(DiffLineWrapStorageKey, String(wrapLines))
  } catch {
    // The live preference still applies when storage is unavailable.
  }

  document.dispatchEvent(
    new window.CustomEvent<boolean>(DiffLineWrapChangedEvent, {
      detail: wrapLines,
    })
  )
}
