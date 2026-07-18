export interface IPreventableShutdownEvent {
  preventDefault(): void
}

export interface IOwnedShutdownTask {
  readonly name: string
  readonly run: () => void | Promise<void>
}

export type OwnedShutdownEvent =
  | {
      readonly kind: 'started' | 'completed'
      readonly name: string
      readonly durationMilliseconds: number
    }
  | {
      readonly kind: 'failed' | 'timed-out'
      readonly name: string
      readonly durationMilliseconds: number
      readonly error: Error
    }

export interface IOwnedShutdownClock {
  readonly now: () => number
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown
  readonly clearTimeout: (handle: unknown) => void
}

export const DefaultOwnedShutdownTimeoutMilliseconds = 10_000

const defaultClock: IOwnedShutdownClock = {
  now: () => Date.now(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const defaultReporter = (_event: OwnedShutdownEvent) => {}

/**
 * Holds Electron's first `will-quit` event while every app-owned process gets
 * one concurrent cleanup attempt. Each task has the same hard deadline, so a
 * stuck child or HTTP request can never keep Squirrel waiting indefinitely for
 * the old app process before an update relaunch.
 */
export class OwnedProcessShutdownBarrier {
  private ready = false
  private started = false

  public constructor(
    private readonly tasks: ReadonlyArray<IOwnedShutdownTask>,
    private readonly quit: () => void,
    private readonly timeoutMilliseconds =
      DefaultOwnedShutdownTimeoutMilliseconds,
    private readonly report = defaultReporter,
    private readonly clock = defaultClock
  ) {}

  public handle(event: IPreventableShutdownEvent): void {
    if (this.ready) {
      return
    }

    event.preventDefault()
    if (this.started) {
      return
    }

    this.started = true
    void Promise.all(this.tasks.map(task => this.runTask(task))).then(() => {
      this.ready = true
      this.quit()
    })
  }

  private runTask(task: IOwnedShutdownTask): Promise<void> {
    const startedAt = this.clock.now()
    this.reportSafely({
      kind: 'started',
      name: task.name,
      durationMilliseconds: 0,
    })

    return new Promise(resolve => {
      let settled = false
      let timeoutHandle: unknown = null

      const finish = (event: OwnedShutdownEvent) => {
        if (settled) {
          return
        }
        settled = true
        if (timeoutHandle !== null) {
          this.clock.clearTimeout(timeoutHandle)
        }
        this.reportSafely(event)
        resolve()
      }

      timeoutHandle = this.clock.setTimeout(() => {
        const durationMilliseconds = this.clock.now() - startedAt
        finish({
          kind: 'timed-out',
          name: task.name,
          durationMilliseconds,
          error: new Error(
            `Timed out stopping ${task.name} after ${durationMilliseconds}ms`
          ),
        })
      }, this.timeoutMilliseconds)

      Promise.resolve()
        .then(() => task.run())
        .then(() =>
          finish({
            kind: 'completed',
            name: task.name,
            durationMilliseconds: this.clock.now() - startedAt,
          })
        )
        .catch(reason =>
          finish({
            kind: 'failed',
            name: task.name,
            durationMilliseconds: this.clock.now() - startedAt,
            error:
              reason instanceof Error
                ? reason
                : new Error(`Unable to stop ${task.name}`),
          })
        )
    })
  }

  private reportSafely(event: OwnedShutdownEvent): void {
    try {
      this.report(event)
    } catch {
      // Diagnostics must never become another reason update relaunch can hang.
    }
  }
}
