import {
  IDisposable,
  ITerminalOptions,
  ITerminalInitOnlyOptions,
  Terminal as XTermTerminal,
} from '@xterm/xterm'
import React from 'react'
import { getMonospaceFontFamily } from './get-monospace-font-family'

export const defaultTerminalOptions: Readonly<ITerminalOptions> = {
  convertEol: true,
  fontFamily: getMonospaceFontFamily(),
  fontSize: 12,
  screenReaderMode: true,
}

export type TerminalMode = 'read-only' | 'interactive'
export type TerminalChunk = string | Uint8Array
export type TerminalData = TerminalChunk | ReadonlyArray<TerminalChunk>

export type TerminalProps = ITerminalOptions &
  ITerminalInitOnlyOptions & {
    readonly terminalOutput?: TerminalData
    readonly hideCursor?: boolean
    readonly mode?: TerminalMode
    readonly accessibleName?: string
    readonly className?: string
    readonly onData?: (data: string) => void
    readonly onResize?: (size: {
      readonly cols: number
      readonly rows: number
    }) => void
    readonly onFocus?: () => void
    readonly onBlur?: () => void
  }

export class Terminal extends React.Component<TerminalProps> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private terminal: XTermTerminal | null = null
  private dataSubscription: IDisposable | null = null
  private resizeSubscription: IDisposable | null = null
  private renderedChunks = new Array<TerminalChunk>()

  public get Terminal() {
    return this.terminal
  }

  public focus(): void {
    this.terminal?.focus()
  }

  public write(data: TerminalData): void {
    if (typeof data === 'string' || data instanceof Uint8Array) {
      this.terminal?.write(data)
      return
    }
    for (const chunk of data) {
      this.terminal?.write(chunk)
    }
  }

  public componentWillUnmount(): void {
    this.dataSubscription?.dispose()
    this.resizeSubscription?.dispose()
    this.dataSubscription = null
    this.resizeSubscription = null
    this.terminal?.dispose()
    this.terminal = null
  }

  public componentDidMount(): void {
    this.validateMode()
    const {
      terminalOutput,
      hideCursor,
      mode,
      accessibleName,
      className,
      onData,
      onResize,
      onFocus,
      onBlur,
      ...initOpts
    } = this.props
    void terminalOutput
    void hideCursor
    void accessibleName
    void className
    void onData
    void onResize
    void onFocus
    void onBlur
    this.terminal = new XTermTerminal({
      ...defaultTerminalOptions,
      ...initOpts,
      disableStdin: mode !== 'interactive',
      rows: this.props.rows ?? 20,
      cols: this.props.cols ?? 80,
    })

    this.reconcileDataSubscription()
    this.reconcileResizeSubscription()

    this.terminal.attachCustomKeyEventHandler((key: KeyboardEvent) => {
      if (key.key === 'Tab') {
        // Tab and Shift+Tab always belong to the app's focus navigation,
        // including when this terminal accepts other interactive input.
        return false
      }
      return true
    })

    if (this.terminalRef.current) {
      this.terminal.open(this.terminalRef.current)
      this.writeCursorVisibility()
      this.syncControlledOutput()
    }
  }

  public componentDidUpdate(prevProps: TerminalProps): void {
    this.validateMode()
    if (this.terminal === null) {
      return
    }

    const interactive = this.props.mode === 'interactive'
    if ((prevProps.mode === 'interactive') !== interactive) {
      this.terminal.options.disableStdin = !interactive
    }
    if (
      prevProps.mode !== this.props.mode ||
      prevProps.onData !== this.props.onData
    ) {
      this.reconcileDataSubscription()
    }
    if (prevProps.onResize !== this.props.onResize) {
      this.reconcileResizeSubscription()
    }
    if (
      this.shouldHideCursor(prevProps) !== this.shouldHideCursor(this.props)
    ) {
      this.writeCursorVisibility()
    }
    this.syncControlledOutput()
  }

  private validateMode(): void {
    if (
      this.props.mode !== undefined &&
      this.props.mode !== 'read-only' &&
      this.props.mode !== 'interactive'
    ) {
      throw new TypeError('Terminal mode is invalid.')
    }
    if (
      this.props.mode === 'interactive' &&
      (typeof this.props.accessibleName !== 'string' ||
        this.props.accessibleName.trim().length === 0)
    ) {
      throw new TypeError('Interactive terminals require an accessible name.')
    }
  }

  private reconcileDataSubscription(): void {
    const shouldSubscribe =
      this.terminal !== null &&
      this.props.mode === 'interactive' &&
      this.props.onData !== undefined
    if (shouldSubscribe === (this.dataSubscription !== null)) {
      return
    }
    this.dataSubscription?.dispose()
    this.dataSubscription = shouldSubscribe
      ? this.terminal!.onData(data => this.props.onData?.(data))
      : null
  }

  private reconcileResizeSubscription(): void {
    const shouldSubscribe =
      this.terminal !== null && this.props.onResize !== undefined
    if (shouldSubscribe === (this.resizeSubscription !== null)) {
      return
    }
    this.resizeSubscription?.dispose()
    this.resizeSubscription = shouldSubscribe
      ? this.terminal!.onResize(size => this.props.onResize?.({ ...size }))
      : null
  }

  private writeCursorVisibility(): void {
    this.terminal?.write(
      this.shouldHideCursor(this.props) ? '\x1b[?25l' : '\x1b[?25h'
    )
  }

  private shouldHideCursor(props: TerminalProps): boolean {
    return props.hideCursor ?? props.mode !== 'interactive'
  }

  private syncControlledOutput(): void {
    if (this.terminal === null) {
      return
    }

    const next = terminalChunks(this.props.terminalOutput)
    const appendOnly =
      this.renderedChunks.length <= next.length &&
      this.renderedChunks.every((chunk, index) =>
        terminalChunksEqual(chunk, next[index])
      )
    const start = appendOnly ? this.renderedChunks.length : 0
    if (!appendOnly) {
      this.terminal.reset()
      this.writeCursorVisibility()
    }
    for (let index = start; index < next.length; index++) {
      this.terminal.write(next[index])
    }
    this.renderedChunks = next.map(copyTerminalChunk)
  }

  private onFocus = () => {
    if (this.props.mode === 'interactive') {
      this.props.onFocus?.()
    }
  }

  private onBlur = () => {
    if (this.props.mode === 'interactive') {
      this.props.onBlur?.()
    }
  }

  public render() {
    this.validateMode()
    const hasAccessibleName =
      typeof this.props.accessibleName === 'string' &&
      this.props.accessibleName.trim().length > 0
    return (
      <div
        ref={this.terminalRef}
        className={this.props.className}
        role={hasAccessibleName ? 'region' : undefined}
        aria-label={hasAccessibleName ? this.props.accessibleName : undefined}
        onFocus={this.onFocus}
        onBlur={this.onBlur}
      />
    )
  }
}

function terminalChunks(
  data: TerminalData | undefined
): ReadonlyArray<TerminalChunk> {
  if (data === undefined) {
    return []
  }
  if (typeof data === 'string' || data instanceof Uint8Array) {
    return [data]
  }
  return data
}

function copyTerminalChunk(chunk: TerminalChunk): TerminalChunk {
  return typeof chunk === 'string' ? chunk : new Uint8Array(chunk)
}

function terminalChunksEqual(
  left: TerminalChunk,
  right: TerminalChunk
): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right
  }
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }
  return true
}
