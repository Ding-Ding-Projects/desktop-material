/**
 * Base interface containing all the properties that progress events
 * need to support.
 */
interface IProgress {
  /**
   * The overall progress of the operation, represented as a fraction between
   * 0 and 1.
   */
  readonly value: number

  /**
   * An informative text for user consumption indicating the current operation
   * state. This will be high level such as 'Pushing origin' or
   * 'Fetching upstream' and will typically persist over a number of progress
   * events. For more detailed information about the progress see
   * the description field
   */
  readonly title?: string

  /**
   * An informative text for user consumption. In the case of git progress this
   * will usually be the last raw line of output from git.
   */
  readonly description?: string
}

/**
 * An object describing progression of an operation that can't be
 * directly mapped or attributed to either one of the more specific
 * progress events (Fetch, Checkout etc). An example of this would be
 * our own refreshing of internal repository state that takes part
 * after fetch, push and pull.
 */
export interface IGenericProgress extends IProgress {
  kind: 'generic'
}

/**
 * An object describing the progression of a branch checkout operation
 */
export interface ICheckoutProgress extends IProgress {
  kind: 'checkout'

  /** The branch or commit that's currently being checked out */
  readonly target: string

  /**
   * Infotext for the user.
   */
  readonly description: string
}

/**
 * An object describing the progression of a fetch operation
 */
export interface IFetchProgress extends IProgress {
  kind: 'fetch'

  /**
   * The remote that's being fetched
   */
  readonly remote: string
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPullProgress extends IProgress {
  kind: 'pull'

  /**
   * The remote that's being pulled from
   */
  readonly remote: string
}

/**
 * An object describing the progression of a pull operation
 */
export interface IPushProgress extends IProgress {
  kind: 'push'

  /**
   * The remote that's being pushed to
   */
  readonly remote: string

  /**
   * The branch that's being pushed
   */
  readonly branch: string
}

/**
 * Stage label surfaced while `git clone --recursive` is fetching submodules
 * after the main working tree has been checked out. Submodule fetches don't
 * report a reliable aggregate percentage so this stage drives an indeterminate
 * bar in the UI.
 */
export const SubmoduleFetchStage = 'Fetching submodules'

/**
 * An object describing the progression of a fetch operation
 */
export interface ICloneProgress extends IProgress {
  kind: 'clone'

  /**
   * The current Git stage, e.g. 'Receiving objects' or 'Checking out files'.
   * This is the title of the underlying Git progress event and, while cloning
   * submodules, the {@link SubmoduleFetchStage} label.
   */
  readonly stage?: string

  /**
   * Progress within the current `stage` as a fraction between 0 and 1.
   * Absent when the stage doesn't report a total (e.g. submodule fetches).
   */
  readonly stagePercent?: number

  /**
   * Transfer speed in bytes per second, when Git reports throughput (during the
   * receiving-objects stage). Absent otherwise.
   */
  readonly speedBytesPerSecond?: number

  /**
   * Best-effort estimate of the seconds remaining, computed by the store from a
   * smoothed rate. Absent early on and whenever the rate can't be determined.
   */
  readonly etaSeconds?: number
}

/** An object describing the progression of a revert operation. */
export interface IRevertProgress extends IProgress {
  kind: 'revert'
}

export interface IMultiCommitOperationProgress extends IProgress {
  readonly kind: 'multiCommitOperation'
  /** The summary of the commit applied */
  readonly currentCommitSummary: string
  /** The number to signify which commit in a selection is being applied */
  readonly position: number
  /** The total number of commits in the operation */
  readonly totalCommitCount: number
}

export type Progress =
  | IGenericProgress
  | ICheckoutProgress
  | IFetchProgress
  | IPullProgress
  | IPushProgress
  | IRevertProgress
  | IMultiCommitOperationProgress

/**
 * Clamps progress values between minimum and maximum.
 * Useful for reserving portions of progress reporting for different stages.
 */
export function clampProgress<T extends Progress>(
  minimum: number,
  maximum: number,
  progressCallback: (progress: T) => void
): (progress: T) => void {
  return (progress: T) =>
    progressCallback({
      ...progress,
      value: minimum + progress.value * (maximum - minimum),
    })
}
