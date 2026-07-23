import { CheapLfsStorageProvider } from '../../models/build-run-preferences'
import { CheapLfsPinThresholdBytes } from '../large-files'
import { CHEAP_LFS_PART_SIZE_BYTES } from './pointer'

export type CheapLfsRecommendedStorage = 'git' | CheapLfsStorageProvider

export type CheapLfsStorageRecommendationReason =
  | 'ordinary-git'
  | 'single-release-transfer'
  | 'github-registry-large-batch'
  | 'docker-hub-large-batch'
  | 'release-registry-unavailable'

export interface ICheapLfsStorageRecommendationInput {
  readonly fileSizesInBytes: ReadonlyArray<number>
  readonly isGitHubRepository: boolean
  readonly ghcrAvailable: boolean
  readonly dockerHubAvailable: boolean
}

export interface ICheapLfsStorageRecommendation {
  readonly provider: CheapLfsRecommendedStorage
  readonly reason: CheapLfsStorageRecommendationReason
  readonly totalBytes: number
  readonly largestFileBytes: number
  readonly estimatedRegistryLayers: number
}

function checkedSizes(sizes: ReadonlyArray<number>): ReadonlyArray<number> {
  for (const size of sizes) {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Cheap LFS storage recommendations require safe sizes.')
    }
  }
  return sizes
}

/**
 * Recommend storage without silently overriding the persisted user choice.
 * Release storage is the lowest-setup choice for one initial 1.5 GiB transfer;
 * larger batches benefit from content-addressed layer reuse. GHCR wins for a
 * GitHub repository when available, while Docker Hub is the registry fallback.
 */
export function recommendCheapLfsStorage(
  input: ICheapLfsStorageRecommendationInput
): ICheapLfsStorageRecommendation {
  const sizes = checkedSizes(input.fileSizesInBytes)
  const totalBytes = sizes.reduce((sum, size) => {
    const next = sum + size
    if (!Number.isSafeInteger(next)) {
      throw new Error('Cheap LFS selected bytes exceed the safe size range.')
    }
    return next
  }, 0)
  const largestFileBytes = sizes.reduce((largest, size) => {
    return Math.max(largest, size)
  }, 0)
  const estimatedRegistryLayers = sizes.reduce(
    (count, size) =>
      count + (size === 0 ? 1 : Math.ceil(size / CHEAP_LFS_PART_SIZE_BYTES)),
    0
  )

  // A large aggregate of individually small files can still exceed a practical
  // Git push. Base the ordinary-Git recommendation on all selected bytes, not
  // only the largest member.
  if (totalBytes <= CheapLfsPinThresholdBytes) {
    return {
      provider: 'git',
      reason: 'ordinary-git',
      totalBytes,
      largestFileBytes,
      estimatedRegistryLayers,
    }
  }

  if (totalBytes <= CHEAP_LFS_PART_SIZE_BYTES) {
    return {
      provider: 'release',
      reason: 'single-release-transfer',
      totalBytes,
      largestFileBytes,
      estimatedRegistryLayers,
    }
  }

  if (input.isGitHubRepository && input.ghcrAvailable) {
    return {
      provider: 'ghcr',
      reason: 'github-registry-large-batch',
      totalBytes,
      largestFileBytes,
      estimatedRegistryLayers,
    }
  }

  if (input.dockerHubAvailable) {
    return {
      provider: 'docker-hub',
      reason: 'docker-hub-large-batch',
      totalBytes,
      largestFileBytes,
      estimatedRegistryLayers,
    }
  }

  return {
    provider: 'release',
    reason: 'release-registry-unavailable',
    totalBytes,
    largestFileBytes,
    estimatedRegistryLayers,
  }
}
