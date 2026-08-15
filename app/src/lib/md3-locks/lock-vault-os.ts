import { TokenStore } from '../stores/token-store'
import {
  IMd3LockCredentialVault,
  setMd3LockCredentialVault,
} from './lock-credentials'

/**
 * The operating-system credential vault, wired to the surface-lock feature.
 *
 * This is the only file in the feature that touches the platform keychain, and
 * it exists as its own module for one practical reason: `TokenStore` loads a
 * native dependency, so anything importing it cannot be imported by a plain
 * Node test process. Keeping the wiring here lets every other module in the
 * feature — the model, the registry, the credential logic, the export — be
 * exercised directly, with a fake vault, while the real app installs this one.
 *
 * The service name is a stable constant. It must never be derived from the
 * user-renamable display name: a rename would orphan every stored credential
 * and lock the user out of surfaces they still have the password for, which is
 * exactly what the rename rule exists to prevent.
 */

/** The vault service name. Stable for the life of the feature. */
export const Md3LockVaultService = 'com.desktop-material.surface-locks'

export const osLockCredentialVault: IMd3LockCredentialVault = {
  read: account => TokenStore.getItem(Md3LockVaultService, account),
  write: async (account, value) => {
    await TokenStore.setItem(Md3LockVaultService, account, value)
  },
  remove: account => TokenStore.deleteItem(Md3LockVaultService, account),
}

/** Install the platform vault. Call once, during renderer start-up. */
export function installOsLockCredentialVault(): void {
  setMd3LockCredentialVault(osLockCredentialVault)
}
