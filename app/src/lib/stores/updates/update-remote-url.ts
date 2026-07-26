import { URL } from 'url'

import { IAPIRepository } from '../../api'
import { caseInsensitiveEquals } from '../../compare'
import { normalizeRemoteUrl } from '../../remote-management'
import { parseRemote } from '../../remote-parsing'
import { urlMatchesRemote } from '../../repository-matching'
import { IRemote } from '../../../models/remote'
import { GitStore } from '../git-store'

export type RemoteURLUpdateResult =
  | 'unchanged'
  | 'updated'
  | 'stale'
  | 'refused'
  | 'failed'
  | 'unproven'

interface IRemoteConfigSnapshot {
  readonly fetchURL: string | null
  readonly explicitPushURL: string | null
}

async function readRemoteConfigSnapshot(
  gitStore: GitStore,
  name: string
): Promise<IRemoteConfigSnapshot> {
  const [fetchURL, explicitPushURL] = await Promise.all([
    gitStore.getRemoteURL(name),
    gitStore.getExplicitRemotePushURL(name),
  ])
  return { fetchURL, explicitPushURL }
}

async function refreshRemoteInventory(gitStore: GitStore): Promise<boolean> {
  try {
    // This refresh deliberately bypasses error emission. A background repair
    // failure belongs in logs/notifications, never in a blocking global popup.
    await gitStore.loadRemotes(false)
    return true
  } catch (error) {
    log.warn('Could not refresh remotes after canonical URL repair.', error)
    return false
  }
}

/**
 * Update the exact remote which resolved a provider repository to its latest
 * canonical clone URL. The provider lookup itself is the authority for a
 * rename or transfer, so this also works when the checkout has not previously
 * been associated with a GitHubRepository model.
 */
export async function updateRemoteUrl(
  gitStore: GitStore,
  matchedRemote: IRemote,
  apiRepo: IAPIRepository
): Promise<RemoteURLUpdateResult> {
  const currentRemote = gitStore.defaultRemote

  // The provider request and config mutation are separated by an await. Never
  // rewrite a remote which changed while that request was in flight.
  if (
    currentRemote === null ||
    currentRemote.name !== matchedRemote.name ||
    currentRemote.url !== matchedRemote.url
  ) {
    return 'stale'
  }

  let remoteUrl: string
  try {
    remoteUrl = normalizeRemoteUrl(matchedRemote.url)
  } catch {
    return 'refused'
  }

  // Do not silently normalize a hand-authored value while repairing a
  // transfer. In particular, embedded web credentials must remain untouched.
  if (remoteUrl !== matchedRemote.url) {
    return 'refused'
  }

  const parsedRemote = parseRemote(remoteUrl)
  if (parsedRemote === null) {
    return 'refused'
  }

  const candidateValue =
    parsedRemote.protocol === 'ssh' ? apiRepo.ssh_url : apiRepo.clone_url
  let candidate: string
  try {
    candidate = normalizeRemoteUrl(candidateValue)
  } catch {
    return 'refused'
  }

  if (candidate !== candidateValue) {
    return 'refused'
  }

  const parsedCandidate = parseRemote(candidate)
  if (
    parsedCandidate === null ||
    parsedCandidate.protocol !== parsedRemote.protocol ||
    !caseInsensitiveEquals(parsedCandidate.hostname, parsedRemote.hostname)
  ) {
    return 'refused'
  }

  if (parsedRemote.protocol === 'https') {
    try {
      const oldWebURL = new URL(remoteUrl)
      const newWebURL = new URL(candidate)

      // parseRemote groups HTTP and HTTPS together. Preserve the exact web
      // scheme and authority, including a non-default port.
      if (oldWebURL.origin !== newWebURL.origin) {
        return 'refused'
      }
    } catch {
      return 'refused'
    }
  }

  // A separately configured write target is intentional unless it is exactly
  // the old fetch URL. Only that unambiguous transfer-coupled pushurl follows
  // the canonical repository; deploy mirrors and write-only remotes stay put.
  let explicitPushURL: string | null
  try {
    explicitPushURL = await gitStore.getExplicitRemotePushURL(
      matchedRemote.name
    )
  } catch {
    return 'unproven'
  }
  let updateExplicitPushURL = false
  if (explicitPushURL !== null) {
    try {
      updateExplicitPushURL =
        normalizeRemoteUrl(explicitPushURL) === remoteUrl &&
        normalizeRemoteUrl(explicitPushURL) === explicitPushURL
    } catch {
      updateExplicitPushURL = false
    }
  }

  // This exact disk read is intentionally the final operation before any
  // mutation. The conditional setters repeat the comparison under Git's
  // config lock, so an external editor wins even after this check.
  let freshFetchURL: string | null
  try {
    freshFetchURL = await gitStore.getRemoteURL(matchedRemote.name)
  } catch {
    return 'unproven'
  }
  if (freshFetchURL !== remoteUrl) {
    await refreshRemoteInventory(gitStore)
    return 'stale'
  }

  if (urlMatchesRemote(candidate, matchedRemote)) {
    if (!updateExplicitPushURL || explicitPushURL === candidate) {
      return 'unchanged'
    }
    if (explicitPushURL === null) {
      return 'unproven'
    }
    try {
      await gitStore.compareAndSetRemotePushURL(
        matchedRemote.name,
        explicitPushURL,
        candidate
      )
    } catch {
      await refreshRemoteInventory(gitStore)
      return 'failed'
    }
    try {
      const final = await readRemoteConfigSnapshot(gitStore, matchedRemote.name)
      if (final.fetchURL !== remoteUrl || final.explicitPushURL !== candidate) {
        await refreshRemoteInventory(gitStore)
        return 'unproven'
      }
    } catch {
      return 'unproven'
    }
    return (await refreshRemoteInventory(gitStore)) ? 'updated' : 'unproven'
  }

  try {
    await gitStore.compareAndSetRemoteURL(
      matchedRemote.name,
      remoteUrl,
      candidate
    )
  } catch {
    await refreshRemoteInventory(gitStore)
    return 'failed'
  }

  if (updateExplicitPushURL && explicitPushURL !== null) {
    try {
      await gitStore.compareAndSetRemotePushURL(
        matchedRemote.name,
        explicitPushURL,
        candidate
      )
    } catch {
      let rollbackSucceeded = false
      try {
        await gitStore.compareAndSetRemoteURL(
          matchedRemote.name,
          candidate,
          remoteUrl
        )
        const recovered = await readRemoteConfigSnapshot(
          gitStore,
          matchedRemote.name
        )
        rollbackSucceeded =
          recovered.fetchURL === remoteUrl &&
          recovered.explicitPushURL === explicitPushURL
      } catch {
        rollbackSucceeded = false
      }

      const refreshed = await refreshRemoteInventory(gitStore)
      return rollbackSucceeded && refreshed ? 'failed' : 'unproven'
    }
  }

  let final: IRemoteConfigSnapshot
  try {
    final = await readRemoteConfigSnapshot(gitStore, matchedRemote.name)
  } catch {
    return 'unproven'
  }
  const expectedPushURL = updateExplicitPushURL ? candidate : explicitPushURL
  if (
    final.fetchURL !== candidate ||
    final.explicitPushURL !== expectedPushURL
  ) {
    // Preserve a retryable all-old state when the second local config mutation
    // races or fails instead of claiming a split configuration is canonical.
    await refreshRemoteInventory(gitStore)
    return 'unproven'
  }
  return (await refreshRemoteInventory(gitStore)) ? 'updated' : 'unproven'
}
