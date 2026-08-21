import {
  CodingAgentId,
  IAgentSessionDiffStat,
} from '../../models/agent-session'
import { win32 as WindowsPath } from 'path'
import { IAgentSessionOverlay } from './agent-session-fleet'
import {
  IStatusHubStatus,
  LocalStatusHubFallback,
} from '../../models/status-hub'

/** Default cadence for refreshing worktree change summaries. */
export const DefaultAgentSessionDiffPollIntervalMs = 2_000

/** Prevent a caller from accidentally creating a tight polling loop. */
export const MinimumAgentSessionDiffPollIntervalMs = 250

/** Keep a configured poll useful as live status rather than stale history. */
export const MaximumAgentSessionDiffPollIntervalMs = 60_000

/** Bound each poll to four Git children (two commands per worktree). */
export const MaximumConcurrentAgentSessionDiffReads = 2

/**
 * Canonical identity for an absolute Windows worktree path.
 *
 * Git and Electron can report the same directory with mixed separators,
 * trailing separators, or different casing. Windows treats those spellings as
 * one path, so all live-state and operation correlations must do the same.
 */
export function canonicalAgentSessionPath(worktreePath: string): string {
  const normalized = WindowsPath.normalize(worktreePath.trim())
  const root = WindowsPath.parse(normalized).root
  const withoutTrailingSeparators =
    normalized.length > root.length
      ? normalized.replace(/\\+$/, '')
      : normalized
  return withoutTrailingSeparators.toLocaleLowerCase('en-US')
}

/** The small portion of a streamed runner log needed to correlate activity. */
export interface IAgentSessionLogActivity {
  readonly operationId: string
}

/** A terminal result for one correlated coding-agent operation. */
export type AgentSessionRunOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly cancelled?: false
      readonly errorMessage: string
    }
  | { readonly ok: false; readonly cancelled: true }

/** Opaque timer handle so the pure store works in browsers and Node tests. */
export type AgentSessionIntervalHandle = unknown

/** Injected effects used by the otherwise pure live-status store. */
export interface IAgentSessionLiveStoreDependencies {
  readonly readDiffStat: (
    worktreePath: string
  ) => Promise<IAgentSessionDiffStat>
  readonly pollIntervalMs?: number
  readonly now?: () => number
  readonly scheduleInterval?: (
    callback: () => void,
    intervalMs: number
  ) => AgentSessionIntervalHandle
  readonly clearInterval?: (handle: AgentSessionIntervalHandle) => void
  readonly onPollError?: (error: unknown, worktreePath: string) => void
}

const EmptyAgentSessionOverlay: IAgentSessionOverlay = Object.freeze({})

function defaultScheduleInterval(
  callback: () => void,
  intervalMs: number
): AgentSessionIntervalHandle {
  return setInterval(callback, intervalMs)
}

function defaultClearInterval(handle: AgentSessionIntervalHandle): void {
  clearInterval(handle as ReturnType<typeof setInterval>)
}

function boundedPollInterval(value: number | undefined): number {
  const requested =
    value === undefined || !Number.isFinite(value)
      ? DefaultAgentSessionDiffPollIntervalMs
      : Math.round(value)

  return Math.min(
    MaximumAgentSessionDiffPollIntervalMs,
    Math.max(MinimumAgentSessionDiffPollIntervalMs, requested)
  )
}

function equalDiffStat(
  a: IAgentSessionDiffStat | null | undefined,
  b: IAgentSessionDiffStat | null | undefined
): boolean {
  return (
    a === b ||
    (a !== null &&
      a !== undefined &&
      b !== null &&
      b !== undefined &&
      a.filesChanged === b.filesChanged &&
      a.linesAdded === b.linesAdded &&
      a.linesDeleted === b.linesDeleted)
  )
}

function equalOverlay(
  a: IAgentSessionOverlay,
  b: IAgentSessionOverlay
): boolean {
  return (
    a.agent === b.agent &&
    a.runState === b.runState &&
    a.errorMessage === b.errorMessage &&
    equalDiffStat(a.diffStat, b.diffStat) &&
    a.editedFileCount === b.editedFileCount &&
    a.lastActivityAt === b.lastActivityAt
  )
}

interface IPollResult {
  readonly pathKey: string
  readonly worktreePath: string
  readonly pathVersion: number
  readonly diffStat: IAgentSessionDiffStat
}

/**
 * App-lifetime, observable live state for the worktrees rendered as agent
 * sessions. Git reads and timers are effects supplied by the caller, keeping
 * this module independent of Electron, React, and any particular git wrapper.
 */
export class AgentSessionLiveStore {
  private readonly overlays = new Map<string, IAgentSessionOverlay>()
  private readonly listeners = new Set<() => void>()
  /** Canonical path key to the latest original spelling used for Git reads. */
  private readonly worktreePaths = new Map<string, string>()
  private readonly pathVersions = new Map<string, number>()
  private readonly operationPaths = new Map<string, string>()
  private readonly pathOperations = new Map<string, string>()
  private readonly now: () => number
  private readonly scheduleInterval: (
    callback: () => void,
    intervalMs: number
  ) => AgentSessionIntervalHandle
  private readonly clearScheduledInterval: (
    handle: AgentSessionIntervalHandle
  ) => void
  private readonly pollIntervalMs: number
  private interval: { readonly handle: AgentSessionIntervalHandle } | null =
    null
  private pollInFlight: Promise<void> | null = null
  private pollRequested = false
  private nextPathVersion = 1
  private pollingEnabled = true
  private disposed = false
  /** One app-wide Hub status: all fleet rows share a single project record. */
  private statusHub: IStatusHubStatus = LocalStatusHubFallback

  public constructor(
    private readonly dependencies: IAgentSessionLiveStoreDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.scheduleInterval =
      dependencies.scheduleInterval ?? defaultScheduleInterval
    this.clearScheduledInterval =
      dependencies.clearInterval ?? defaultClearInterval
    this.pollIntervalMs = boundedPollInterval(dependencies.pollIntervalMs)
  }

  /** Observe overlay changes. The returned callback removes the listener. */
  public subscribe(listener: () => void): () => void {
    if (this.disposed) {
      return () => {}
    }

    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Get the latest overlay for a worktree without creating mutable state. */
  public getOverlay(worktreePath: string): IAgentSessionOverlay {
    return (
      this.overlays.get(canonicalAgentSessionPath(worktreePath)) ??
      EmptyAgentSessionOverlay
    )
  }

  /** Get the operation currently running in a worktree, if any. */
  public getOperationId(worktreePath: string): string | null {
    return (
      this.pathOperations.get(canonicalAgentSessionPath(worktreePath)) ?? null
    )
  }

  /** Read the truthful Hub state without exposing endpoint credentials. */
  public getStatusHubStatus(): IStatusHubStatus {
    return this.statusHub
  }

  /**
   * Update only from a main-process IPC result. The renderer cannot mark the
   * Hub connected by itself, which prevents a decorative green status chip.
   */
  public setStatusHubStatus(status: IStatusHubStatus): void {
    if (
      this.disposed ||
      (this.statusHub.connection === status.connection &&
        this.statusHub.stableURL === status.stableURL &&
        this.statusHub.message === status.message &&
        this.statusHub.lastUpdatedAt === status.lastUpdatedAt)
    ) {
      return
    }
    this.statusHub = status
    this.emit()
  }

  /**
   * Enable or suspend automatic diff polling without discarding any session
   * state. Explicit one-shot refreshes remain available while suspended.
   */
  public setPollingEnabled(enabled: boolean): void {
    if (this.disposed || this.pollingEnabled === enabled) {
      return
    }

    this.pollingEnabled = enabled
    if (!enabled) {
      this.stopInterval()
      this.pollRequested = false
      return
    }

    if (this.worktreePaths.size > 0) {
      this.ensureInterval()
      this.queueDiffRefresh()
    }
  }

  /**
   * Reconcile the paths reported by git, pruning removed worktrees and
   * starting or stopping the single bounded polling interval as appropriate.
   */
  public syncWorktreePaths(paths: ReadonlyArray<string>): void {
    if (this.disposed) {
      return
    }

    const nextPaths = new Map<string, string>()
    for (const path of paths) {
      if (path.trim().length > 0) {
        nextPaths.set(canonicalAgentSessionPath(path), path)
      }
    }
    let membershipChanged = false
    let overlayChanged = false

    for (const pathKey of this.worktreePaths.keys()) {
      if (nextPaths.has(pathKey)) {
        continue
      }

      membershipChanged = true
      this.worktreePaths.delete(pathKey)
      this.pathVersions.delete(pathKey)
      // A selected-repository change stops polling this path, but an agent
      // launched there still owns a real child process. Keep its correlation
      // until the runner ends so logs, cancellation, and the terminal
      // notification remain truthful while another repository is selected.
      if (!this.pathOperations.has(pathKey)) {
        overlayChanged = this.overlays.delete(pathKey) || overlayChanged
      }
    }

    for (const [pathKey, worktreePath] of nextPaths) {
      if (!this.worktreePaths.has(pathKey)) {
        membershipChanged = true
        this.trackPath(pathKey, worktreePath)
      } else {
        this.worktreePaths.set(pathKey, worktreePath)
      }
    }

    if (this.worktreePaths.size === 0) {
      this.stopInterval()
      this.pollRequested = false
    } else if (this.pollingEnabled) {
      this.ensureInterval()
      if (membershipChanged) {
        this.queueDiffRefresh()
      }
    }

    if (overlayChanged) {
      this.emit()
    }
  }

  /** Mark a newly launched run and remember how its streamed logs correlate. */
  public beginRun(
    worktreePath: string,
    agent: CodingAgentId,
    operationId: string
  ): void {
    if (this.disposed) {
      return
    }

    const pathKey = canonicalAgentSessionPath(worktreePath)
    const pathWasAdded = !this.worktreePaths.has(pathKey)
    if (pathWasAdded) {
      this.trackPath(pathKey, worktreePath)
      if (this.pollingEnabled) {
        this.ensureInterval()
      }
    } else {
      this.worktreePaths.set(pathKey, worktreePath)
    }

    const previousPath = this.operationPaths.get(operationId)
    if (previousPath !== undefined && previousPath !== pathKey) {
      this.pathOperations.delete(previousPath)
      this.setOverlay(previousPath, {
        ...this.getOverlayByKey(previousPath),
        runState: 'idle',
        errorMessage: null,
        lastActivityAt: this.now(),
      })
    }

    this.removeOperationForPath(pathKey)
    this.operationPaths.set(operationId, pathKey)
    this.pathOperations.set(pathKey, operationId)
    this.setOverlay(pathKey, {
      ...this.getOverlayByKey(pathKey),
      agent,
      runState: 'running',
      errorMessage: null,
      lastActivityAt: this.now(),
    })

    if (pathWasAdded && this.pollingEnabled) {
      this.queueDiffRefresh()
    }
  }

  /** Record activity only when a log belongs to a currently running session. */
  public recordLogActivity(log: IAgentSessionLogActivity): boolean {
    if (this.disposed) {
      return false
    }

    const worktreePath = this.operationPaths.get(log.operationId)
    if (
      worktreePath === undefined ||
      this.pathOperations.get(worktreePath) !== log.operationId
    ) {
      return false
    }

    this.setOverlay(worktreePath, {
      ...this.getOverlayByKey(worktreePath),
      lastActivityAt: this.now(),
    })
    return true
  }

  /** Finish a correlated run as either idle success or an actionable error. */
  public finishRun(
    operationId: string,
    outcome: AgentSessionRunOutcome
  ): boolean {
    if (this.disposed) {
      return false
    }

    const worktreePath = this.operationPaths.get(operationId)
    if (
      worktreePath === undefined ||
      this.pathOperations.get(worktreePath) !== operationId
    ) {
      return false
    }

    this.operationPaths.delete(operationId)
    this.pathOperations.delete(worktreePath)
    if (!this.worktreePaths.has(worktreePath)) {
      if (this.overlays.delete(worktreePath)) {
        this.emit()
      }
      return true
    }
    const cancelled = !outcome.ok && outcome.cancelled === true
    this.setOverlay(worktreePath, {
      ...this.getOverlayByKey(worktreePath),
      runState: outcome.ok ? 'idle' : cancelled ? 'cancelled' : 'error',
      errorMessage: outcome.ok || cancelled ? null : outcome.errorMessage,
      lastActivityAt: this.now(),
    })
    return true
  }

  /**
   * Cancel a correlated run immediately and reject any later terminal result
   * for the same operation. The caller can then await process teardown without
   * allowing a close event to overwrite the visible cancelled outcome.
   */
  public cancelRun(operationId: string): boolean {
    return this.finishRun(operationId, { ok: false, cancelled: true })
  }

  /** Replace a cancelled outcome only when no newer run owns the path. */
  public recordCancellationFailure(
    worktreePath: string,
    errorMessage: string
  ): boolean {
    if (this.disposed) {
      return false
    }

    const pathKey = canonicalAgentSessionPath(worktreePath)
    const previous = this.getOverlayByKey(pathKey)
    if (this.pathOperations.has(pathKey) || previous.runState !== 'cancelled') {
      return false
    }

    this.setOverlay(pathKey, {
      ...previous,
      runState: 'error',
      errorMessage,
      lastActivityAt: this.now(),
    })
    return true
  }

  /**
   * Refresh all tracked paths once. Concurrent callers share the current read
   * rather than overlapping it; interval ticks request at most one trailing
   * refresh.
   */
  public refreshDiffStats(): Promise<void> {
    if (this.disposed || this.worktreePaths.size === 0) {
      return Promise.resolve()
    }

    return this.pollInFlight ?? this.startDiffPoll()
  }

  /** Stop polling and release all retained session state and listeners. */
  public dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.stopInterval()
    this.pollRequested = false
    this.listeners.clear()
    this.overlays.clear()
    this.worktreePaths.clear()
    this.pathVersions.clear()
    this.operationPaths.clear()
    this.pathOperations.clear()
    this.statusHub = LocalStatusHubFallback
  }

  private trackPath(pathKey: string, worktreePath: string): void {
    this.worktreePaths.set(pathKey, worktreePath)
    this.pathVersions.set(pathKey, this.nextPathVersion++)
  }

  private removeOperationForPath(worktreePath: string): void {
    const operationId = this.pathOperations.get(worktreePath)
    if (operationId !== undefined) {
      this.pathOperations.delete(worktreePath)
      this.operationPaths.delete(operationId)
    }
  }

  private ensureInterval(): void {
    if (this.interval !== null || this.disposed || !this.pollingEnabled) {
      return
    }

    const handle = this.scheduleInterval(
      this.queueDiffRefresh,
      this.pollIntervalMs
    )
    this.interval = { handle }
  }

  private stopInterval(): void {
    if (this.interval === null) {
      return
    }

    this.clearScheduledInterval(this.interval.handle)
    this.interval = null
  }

  private readonly queueDiffRefresh = (): void => {
    if (
      this.disposed ||
      !this.pollingEnabled ||
      this.worktreePaths.size === 0
    ) {
      return
    }

    if (this.pollInFlight !== null) {
      this.pollRequested = true
      return
    }

    void this.startDiffPoll()
  }

  private startDiffPoll(): Promise<void> {
    const entries = Array.from(
      this.worktreePaths,
      ([pathKey, worktreePath]) => ({
        pathKey,
        worktreePath,
        pathVersion: this.pathVersions.get(pathKey) ?? 0,
      })
    )
    const poll = this.readDiffStats(entries)
    this.pollInFlight = poll

    void poll.then(() => {
      if (this.pollInFlight !== poll) {
        return
      }

      this.pollInFlight = null
      if (this.pollRequested && !this.disposed && this.pollingEnabled) {
        this.pollRequested = false
        this.queueDiffRefresh()
      } else if (!this.pollingEnabled) {
        this.pollRequested = false
      }
    })

    return poll
  }

  private async readDiffStats(
    entries: ReadonlyArray<{
      readonly pathKey: string
      readonly worktreePath: string
      readonly pathVersion: number
    }>
  ): Promise<void> {
    const results = new Array<IPollResult | null>(entries.length).fill(null)
    let nextIndex = 0
    const readNext = async (): Promise<void> => {
      while (nextIndex < entries.length) {
        const index = nextIndex++
        const { pathKey, worktreePath, pathVersion } = entries[index]
        try {
          results[index] = {
            pathKey,
            worktreePath,
            pathVersion,
            diffStat: await this.dependencies.readDiffStat(worktreePath),
          }
        } catch (error) {
          try {
            this.dependencies.onPollError?.(error, worktreePath)
          } catch {
            // A diagnostic callback cannot turn a contained poll failure into
            // an unhandled rejection.
          }
        }
      }
    }
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            MaximumConcurrentAgentSessionDiffReads,
            entries.length
          ),
        },
        readNext
      )
    )

    if (this.disposed) {
      return
    }

    let changed = false
    for (const result of results) {
      if (
        result === null ||
        this.pathVersions.get(result.pathKey) !== result.pathVersion
      ) {
        continue
      }

      const diffStat = { ...result.diffStat }
      const previous = this.getOverlayByKey(result.pathKey)
      const next: IAgentSessionOverlay = {
        ...previous,
        diffStat,
        editedFileCount: diffStat.filesChanged,
      }
      if (!equalOverlay(previous, next)) {
        this.overlays.set(result.pathKey, next)
        changed = true
      }
    }

    if (changed) {
      this.emit()
    }
  }

  private setOverlay(pathKey: string, overlay: IAgentSessionOverlay): void {
    const previous = this.getOverlayByKey(pathKey)
    if (equalOverlay(previous, overlay)) {
      return
    }

    this.overlays.set(pathKey, overlay)
    this.emit()
  }

  private getOverlayByKey(pathKey: string): IAgentSessionOverlay {
    return this.overlays.get(pathKey) ?? EmptyAgentSessionOverlay
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
