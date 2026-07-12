import { getBoolean, setBoolean } from '../lib/local-storage'

const ShowCommitAuthorInfoKey = 'show-commit-author-info'

export function getShowCommitAuthorInfo(): boolean {
  return getBoolean(ShowCommitAuthorInfoKey) ?? false
}

export function setShowCommitAuthorInfo(value: boolean): void {
  setBoolean(ShowCommitAuthorInfoKey, value)
}
