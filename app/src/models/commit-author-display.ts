import { getBoolean, setBoolean } from '../lib/local-storage'

const ShowCommitAuthorInfoKey = 'show-commit-author-info'

export const ShowCommitAuthorInfoChangedEvent =
  'desktop-material-show-commit-author-info-changed'

export function getShowCommitAuthorInfo(): boolean {
  return getBoolean(ShowCommitAuthorInfoKey) ?? false
}

export function setShowCommitAuthorInfo(value: boolean): void {
  if (getShowCommitAuthorInfo() === value) {
    return
  }

  setBoolean(ShowCommitAuthorInfoKey, value)

  if (typeof document !== 'undefined') {
    const CustomEventConstructor =
      document.defaultView?.CustomEvent ?? CustomEvent
    document.dispatchEvent(
      new CustomEventConstructor(ShowCommitAuthorInfoChangedEvent, {
        detail: value,
      })
    )
  }
}
