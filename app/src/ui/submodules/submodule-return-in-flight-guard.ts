/**
 * Coalesce rapid Back activations into one temporary-repository transition.
 * The tracked promise owns cleanup so both success and failure release the
 * disabled state, while disposal can detach a still-settling operation.
 */
export class SubmoduleReturnInFlightGuard {
  private operation: Promise<void> | null = null

  public constructor(private readonly onPendingChanged: () => void) {}

  public get pending(): boolean {
    return this.operation !== null
  }

  public run(operation: () => Promise<void>): Promise<void> {
    if (this.operation !== null) {
      return this.operation
    }

    const trackedOperation = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.operation === trackedOperation) {
          this.operation = null
          this.onPendingChanged()
        }
      })

    this.operation = trackedOperation
    this.onPendingChanged()
    return trackedOperation
  }

  public dispose(): void {
    this.operation = null
  }
}
