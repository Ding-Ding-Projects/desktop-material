import { randomUUID } from 'crypto'

export type CheapLfsSidecarKind =
  | 'recovery'
  | 'consumed'
  | 'ghcr'
  | 'materialized'

const SidecarPrefix: Readonly<Record<CheapLfsSidecarKind, string>> = {
  // Keep the fixed `entry` stem compatible with the historical owned-artifact
  // matcher and `.git/info/exclude` glob without copying an unbounded basename.
  recovery: '.entry.cheap-lfs-recovery',
  consumed: '.cheap-lfs-consumed',
  ghcr: '.cheap-lfs-ghcr',
  materialized: '.cheap-lfs-materialized',
}

/**
 * Build a same-directory scratch name whose component length is independent
 * of the tracked filename. NTFS accepts a 255-unit filename but cannot create
 * `.<that filename>.<suffix>` when the suffix pushes the sidecar past 255.
 */
export function cheapLfsSidecarName(
  kind: CheapLfsSidecarKind,
  pid: number = process.pid,
  nonce: string = randomUUID()
): string {
  return `${SidecarPrefix[kind]}-${pid}-${nonce}`
}
