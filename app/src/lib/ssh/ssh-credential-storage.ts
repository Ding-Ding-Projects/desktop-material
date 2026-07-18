import { TokenStore } from '../stores'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'

export function getSSHCredentialStoreKey(name: string) {
  return `${appName} - ${name}`
}

type SSHCredentialEntry = {
  /** Store where this entry is stored. */
  store: string

  /** Key used to identify the credential in the store (e.g. username or hash). */
  key: string

  /** Whether this operation wrote the value instead of reusing an old one. */
  createdDuringOperation: boolean
}

/**
 * Associates the most recently supplied vault credential with its in-flight
 * operation. Newly written values can be rolled back when the operation does
 * not prove them; previously remembered values are removed only after an
 * authentication failure.
 */
const mostRecentSSHCredentials = new Map<string, SSHCredentialEntry>()

/**
 * Stores an SSH credential and also keeps it in memory to be deleted later if
 * the ongoing git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param store         Store where the SSH credential is stored.
 * @param key           Key that identifies the SSH credential (e.g. username or
 *                      key hash).
 * @param password      Password for the SSH key / user.
 */
export async function setSSHCredential(
  operationGUID: string,
  store: string,
  key: string,
  password: string
) {
  setMostRecentSSHCredential(operationGUID, store, key, true)
  await TokenStore.setItem(store, key, password)
}

/**
 * Keeps the SSH credential details in memory to be deleted later if the ongoing
 * git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param store         Store where the SSH credential is stored.
 * @param key           Key that identifies the SSH credential (e.g. username or
 *                      key hash).
 */
export function setMostRecentSSHCredential(
  operationGUID: string,
  store: string,
  key: string,
  createdDuringOperation = false
) {
  mostRecentSSHCredentials.set(operationGUID, {
    store,
    key,
    createdDuringOperation,
  })
}

/**
 * Removes the SSH credential from memory. This must be used after a git
 * operation finished, regardless the result.
 */
export function removeMostRecentSSHCredential(operationGUID: string) {
  mostRecentSSHCredentials.delete(operationGUID)
}

/**
 * Deletes the SSH credential from the TokenStore. Used when the git operation
 * fails to authenticate.
 */
export async function deleteMostRecentSSHCredential(
  operationGUID: string,
  onlyIfCreatedDuringOperation = false
) {
  const entry = mostRecentSSHCredentials.get(operationGUID)
  if (
    entry &&
    (!onlyIfCreatedDuringOperation || entry.createdDuringOperation)
  ) {
    log.info(
      `SSH auth failed, deleting credential for ${entry.store}:${entry.key}`
    )

    await TokenStore.deleteItem(entry.store, entry.key)
  }
}
