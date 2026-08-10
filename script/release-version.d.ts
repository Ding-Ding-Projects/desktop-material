export function createReleaseVersion(
  baseVersion: string,
  runId: string,
  runAttempt?: string,
  /** Required when the base version carries no prerelease channel. */
  runNumber?: string
): string

export function validateReleaseVersion(
  version: string,
  baseVersion?: string
): string

export function compareReleaseVersions(
  leftVersion: string,
  rightVersion: string
): -1 | 0 | 1

export function selectHighestReleaseTag(tags: ReadonlyArray<string>): string

export function filterReleasesManifest(
  manifest: string,
  version: string,
  packageName?: string
): string
