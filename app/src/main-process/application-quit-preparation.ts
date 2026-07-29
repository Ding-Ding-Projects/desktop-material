export type ApplicationQuitIntent = 'quit' | 'install-update'
export type ApplicationClosePreparationClaim = 'application' | 'native-window'

export interface IApplicationQuitPreparationWindow {
  prepareForClose(claim: ApplicationClosePreparationClaim): Promise<unknown>
  markWillQuit(evenIfUpdating: boolean): void
  cancelQuitting(): void
}

export interface IPreventableApplicationQuitEvent {
  preventDefault(): void
}

export type ApplicationQuitPreparationFailure =
  | {
      readonly kind: 'prepare-window' | 'mark-window' | 'cancel-window'
      readonly window: IApplicationQuitPreparationWindow
      readonly error: Error
    }
  | {
      readonly kind: 'commit-check' | 'terminal-action'
      readonly intent: ApplicationQuitIntent
      readonly error: Error
    }

export type ApplicationQuitPreparationReporter = (
  failure: ApplicationQuitPreparationFailure
) => void

export type ApplicationQuitCommitCheck = (
  intent: ApplicationQuitIntent,
  evenIfUpdating: boolean
) => boolean

interface IPendingApplicationQuitPreparation {
  readonly generation: number
  readonly promise: Promise<void>
}

const ignoreFailure = (_failure: ApplicationQuitPreparationFailure) => {}
const allowCommit: ApplicationQuitCommitCheck = () => true

/**
 * Coordinates renderer-owned durable-state preparation before an application
 * quit. The class has no Electron dependency so the multi-window and re-entry
 * behavior can be verified with deterministic fakes.
 */
export class ApplicationQuitPreparationCoordinator {
  private generation = 0
  private pending: IPendingApplicationQuitPreparation | null = null
  private intent: ApplicationQuitIntent | null = null
  private evenIfUpdating = false
  private committed = false

  public constructor(
    private readonly getWindows: () => ReadonlyArray<IApplicationQuitPreparationWindow>,
    private readonly performTerminalAction: (
      intent: ApplicationQuitIntent,
      evenIfUpdating: boolean
    ) => void,
    private readonly report: ApplicationQuitPreparationReporter = ignoreFailure,
    private readonly canCommit: ApplicationQuitCommitCheck = allowCommit
  ) {}

  public get isCommitted(): boolean {
    return this.committed
  }

  public get isPreparing(): boolean {
    return this.pending !== null
  }

  /**
   * Starts or joins the current preparation generation. An update install is
   * terminally stronger than an ordinary quit, so a request arriving while the
   * same generation is draining upgrades (and never downgrades) its intent.
   */
  public request(
    intent: ApplicationQuitIntent,
    evenIfUpdating: boolean
  ): Promise<void> {
    if (this.committed) {
      return Promise.resolve()
    }

    if (this.intent !== 'install-update') {
      this.intent = intent
    }
    this.evenIfUpdating = this.evenIfUpdating || evenIfUpdating

    if (this.pending !== null) {
      return this.pending.promise
    }

    const generation = ++this.generation
    // Defer execution by one microtask so `pending` is installed before a
    // zero-window or already-prepared generation can complete synchronously.
    const promise = Promise.resolve().then(() => this.runGeneration(generation))
    this.pending = { generation, promise }
    return promise
  }

  /**
   * Electron `before-quit` integration: the first attempt is held for renderer
   * preparation, while the committed re-entry (and a no-window quit) passes.
   */
  public handleBeforeQuit(event: IPreventableApplicationQuitEvent): void {
    if (this.committed || this.getWindows().length === 0) {
      return
    }

    event.preventDefault()
    void this.request('quit', false)
  }

  /**
   * Invalidates the active generation and restores every current window. Work
   * already running may settle later, but its generation can no longer commit.
   */
  public cancel(): void {
    this.generation++
    this.pending = null
    this.intent = null
    this.evenIfUpdating = false
    this.committed = false

    for (const window of this.getWindows()) {
      try {
        window.cancelQuitting()
      } catch (error) {
        this.reportSafely({
          kind: 'cancel-window',
          window,
          error: normalizeError(error, 'Unable to cancel window quit'),
        })
      }
    }
  }

  private async runGeneration(generation: number): Promise<void> {
    const attemptedWindows = new Set<IApplicationQuitPreparationWindow>()

    while (generation === this.generation) {
      const windowsToPrepare = new Array<IApplicationQuitPreparationWindow>()

      for (const window of this.getWindows()) {
        if (attemptedWindows.has(window)) {
          continue
        }
        attemptedWindows.add(window)
        // Even a window whose renderer drain is already complete must receive
        // the application claim synchronously. This prevents an earlier native
        // close continuation from racing the app-wide/update terminal action.
        windowsToPrepare.push(window)
      }

      if (windowsToPrepare.length === 0) {
        break
      }

      await Promise.all(
        windowsToPrepare.map(window => {
          const reportPreparationFailure = (error: unknown) =>
            this.reportSafely({
              kind: 'prepare-window',
              window,
              error: normalizeError(
                error,
                'Unable to prepare window for application quit'
              ),
            })

          try {
            return Promise.resolve(window.prepareForClose('application')).catch(
              reportPreparationFailure
            )
          } catch (error) {
            reportPreparationFailure(error)
            return Promise.resolve()
          }
        })
      )
    }

    if (generation !== this.generation) {
      return
    }

    const intent = this.intent ?? 'quit'
    const evenIfUpdating = this.evenIfUpdating
    try {
      if (!this.canCommit(intent, evenIfUpdating)) {
        this.cancel()
        return
      }
    } catch (error) {
      this.reportSafely({
        kind: 'commit-check',
        intent,
        error: normalizeError(error, 'Unable to confirm application quit'),
      })
      this.cancel()
      return
    }

    // Commit before notifying windows. Electron can synchronously re-enter its
    // quit lifecycle from the terminal action or a window callback.
    this.committed = true
    if (this.pending?.generation === generation) {
      this.pending = null
    }

    for (const window of this.getWindows()) {
      if (generation !== this.generation || !this.committed) {
        return
      }

      try {
        window.markWillQuit(evenIfUpdating)
      } catch (error) {
        this.reportSafely({
          kind: 'mark-window',
          window,
          error: normalizeError(error, 'Unable to mark window as quitting'),
        })
      }
    }

    if (generation !== this.generation || !this.committed) {
      return
    }

    try {
      this.performTerminalAction(intent, evenIfUpdating)
    } catch (error) {
      this.reportSafely({
        kind: 'terminal-action',
        intent,
        error: normalizeError(
          error,
          `Unable to perform application terminal action: ${intent}`
        ),
      })
      // A synchronous updater/app quit failure leaves every renderer alive.
      // Roll the committed state back and resume producers so a later attempt
      // can safely prepare again instead of silently wedging in shutdown mode.
      this.cancel()
    }
  }

  private reportSafely(failure: ApplicationQuitPreparationFailure): void {
    try {
      this.report(failure)
    } catch {
      // Diagnostics must never become another reason application quit wedges.
    }
  }
}

const normalizeError = (error: unknown, fallbackMessage: string): Error =>
  error instanceof Error ? error : new Error(fallbackMessage)
