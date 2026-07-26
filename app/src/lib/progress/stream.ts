import { IGitOutput, IGitProgress, IGitProgressParser } from './git'

/**
 * The number of buffered bytes we hold while waiting for a line terminator.
 * Git's progress lines are short; anything past this is not a progress line and
 * keeping it would let a hostile or broken stream grow the buffer without
 * bound.
 */
const MaximumPendingLineLength = 8 * 1024

/**
 * Feeds arbitrary chunks of a Git stderr stream through a progress parser.
 *
 * Unlike `createProgressProcessCallback`, which owns the child process and can
 * use `byline`, this accumulator is handed pre-read chunks — the CLI workbench
 * streams stdout/stderr to the renderer as `ICLICommandOutputEvent`s, so the
 * renderer never sees the process.
 *
 * Git writes `--progress` updates as carriage-return delimited records inside a
 * single "line", so both `\r` and `\n` terminate a record here.
 */
export class GitProgressStream {
  private pending = ''

  public constructor(private readonly parser: IGitProgressParser) {}

  /**
   * Push one chunk of stream data. Returns every complete record parsed out of
   * it, oldest first. A partial trailing record is retained until the next
   * chunk completes it.
   */
  public push(chunk: string): ReadonlyArray<IGitProgress | IGitOutput> {
    const results = new Array<IGitProgress | IGitOutput>()
    const combined = `${this.pending}${chunk}`
    const parts = combined.split(/\r\n|\r|\n/)
    this.pending = parts.pop() ?? ''

    if (this.pending.length > MaximumPendingLineLength) {
      // Not a progress line. Drop it rather than buffering forever; the raw
      // text is still shown verbatim by the surfaces that render the stream.
      this.pending = ''
    }

    for (const part of parts) {
      if (part.length === 0) {
        continue
      }
      results.push(this.parser.parse(part))
    }

    return results
  }

  /**
   * Parse whatever is still buffered, for use when the stream closes. Git does
   * not always terminate its final progress record.
   */
  public flush(): ReadonlyArray<IGitProgress | IGitOutput> {
    const remaining = this.pending
    this.pending = ''
    return remaining.length === 0 ? [] : [this.parser.parse(remaining)]
  }
}
