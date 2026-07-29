import * as keytar from 'keytar'

import {
  CheapLfsPayloadCredentialCleanupResult,
  CheapLfsPayloadPasswordService,
  ICheapLfsPayloadCredentialCleanupRequest,
  LegacyCheapLfsPayloadPasswordService,
} from '../lib/cheap-lfs/payload-encryption-credential-cleanup'

interface ICredential {
  readonly account: string
  readonly password: string
}

export interface ICheapLfsMainProcessCredentialVault {
  findCredentials(service: string): Promise<ReadonlyArray<ICredential>>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

const StableAccountPattern = /^[a-f0-9]{64}$/
const LegacyAccountPattern = /^repository-\d+$/

/**
 * Enumerate and rewrite credentials entirely in the main process. The renderer
 * supplies account labels and receives counts only; no enumerated password is
 * serialized over IPC, logged, or included in an error result.
 */
export async function cleanupCheapLfsPayloadCredentialsInMainProcess(
  request: ICheapLfsPayloadCredentialCleanupRequest,
  vault: ICheapLfsMainProcessCredentialVault = keytar
): Promise<CheapLfsPayloadCredentialCleanupResult> {
  try {
    const targets = request.currentRepositories
    if (
      !targets.every(
        target =>
          StableAccountPattern.test(target.canonicalAccount) &&
          LegacyAccountPattern.test(target.legacyNumericAccount) &&
          target.priorStableAliases.every(alias =>
            StableAccountPattern.test(alias)
          )
      ) ||
      new Set(targets.map(target => target.canonicalAccount)).size !==
        targets.length ||
      new Set(targets.map(target => target.legacyNumericAccount)).size !==
        targets.length
    ) {
      return { kind: 'unavailable' }
    }
    const canonicalAccounts = new Set(
      targets.map(target => target.canonicalAccount)
    )
    const targetsByLegacy = new Map(
      targets.map(target => [target.legacyNumericAccount, target])
    )
    const targetsByAlias = new Map(
      targets.flatMap(target =>
        target.priorStableAliases.map(alias => [alias, target] as const)
      )
    )

    const [stableCredentials, legacyCredentials] = await Promise.all([
      vault.findCredentials(CheapLfsPayloadPasswordService),
      vault.findCredentials(LegacyCheapLfsPayloadPasswordService),
    ])
    const stableByAccount = new Map(
      stableCredentials.map(credential => [credential.account, credential])
    )
    const legacyByAccount = new Map(
      legacyCredentials.map(credential => [credential.account, credential])
    )
    let migrated = 0
    let deleted = 0
    let pending = 0

    for (const target of targets) {
      if (stableByAccount.has(target.canonicalAccount)) {
        continue
      }
      const source =
        target.priorStableAliases
          .map(alias => stableByAccount.get(alias))
          .find(
            (credential): credential is ICredential => credential !== undefined
          ) ?? legacyByAccount.get(target.legacyNumericAccount)
      if (source === undefined) {
        continue
      }
      try {
        await vault.setPassword(
          CheapLfsPayloadPasswordService,
          target.canonicalAccount,
          source.password
        )
        stableByAccount.set(target.canonicalAccount, {
          account: target.canonicalAccount,
          password: source.password,
        })
        migrated++
      } catch {
        // Keep the only known source entry. A later startup retries it.
        pending++
      }
    }

    for (const credential of stableCredentials) {
      if (!StableAccountPattern.test(credential.account)) {
        continue
      }
      if (canonicalAccounts.has(credential.account)) {
        continue
      }
      const aliasedTarget = targetsByAlias.get(credential.account)
      if (
        aliasedTarget !== undefined &&
        !stableByAccount.has(aliasedTarget.canonicalAccount)
      ) {
        continue
      }
      try {
        if (
          await vault.deletePassword(
            CheapLfsPayloadPasswordService,
            credential.account
          )
        ) {
          deleted++
        }
      } catch {
        pending++
      }
    }

    for (const credential of legacyCredentials) {
      if (!LegacyAccountPattern.test(credential.account)) {
        continue
      }
      const target = targetsByLegacy.get(credential.account)
      if (
        target !== undefined &&
        !stableByAccount.has(target.canonicalAccount)
      ) {
        continue
      }
      try {
        if (
          await vault.deletePassword(
            LegacyCheapLfsPayloadPasswordService,
            credential.account
          )
        ) {
          deleted++
        }
      } catch {
        pending++
      }
    }

    return {
      kind: pending === 0 ? 'cleaned' : 'cleanup-pending',
      migrated,
      deleted,
      pending,
    }
  } catch {
    return { kind: 'unavailable' }
  }
}
