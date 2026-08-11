import React from 'react'

import { Terminal } from '../terminal'

export const IntegratedTerminalSessionIdMaximumLength = 128
export const IntegratedTerminalSessionTitleMaximumLength = 256

export type IntegratedTerminalSessionStatus =
  | 'connecting'
  | 'ready'
  | 'exited'
  | 'error'

export interface IIntegratedTerminalSessionDescriptor {
  readonly id: string
  readonly title: string
  readonly status: IntegratedTerminalSessionStatus
  readonly output: ReadonlyArray<string>
}

export interface IIntegratedTerminalLabels {
  readonly view: string
  readonly tabList: string
  readonly create: string
  readonly closeActive: (title: string) => string
  readonly restart: (title: string) => string
  readonly terminal: (title: string) => string
  readonly empty: string
  readonly status: Readonly<Record<IntegratedTerminalSessionStatus, string>>
}

export interface IIntegratedTerminalViewProps {
  readonly sessions: ReadonlyArray<IIntegratedTerminalSessionDescriptor>
  readonly activeSessionId: string | null
  readonly labels: IIntegratedTerminalLabels
  readonly onSelectSession: (id: string) => void
  readonly onCreateSession?: () => void
  readonly onCloseSession?: (id: string) => void
  readonly onInput: (id: string, data: string) => void
  readonly onResize: (
    id: string,
    size: { readonly cols: number; readonly rows: number }
  ) => void
  readonly onRestartSession?: (id: string) => void
}

const descriptorKeys = ['id', 'output', 'status', 'title'] as const
const sessionStatuses = new Set<IntegratedTerminalSessionStatus>([
  'connecting',
  'ready',
  'exited',
  'error',
])

let nextIntegratedTerminalViewId = 0

/**
 * Copies an untrusted renderer session value into the narrow immutable shape
 * consumed by the view. This boundary deliberately carries terminal output as
 * opaque chunks; it never attempts to interpret commands or shell output.
 */
export function createIntegratedTerminalSessionDescriptor(
  value: unknown
): Readonly<IIntegratedTerminalSessionDescriptor> {
  const descriptors = ownDataDescriptors(value)
  const keys = Object.keys(descriptors).sort()
  if (
    keys.length !== descriptorKeys.length ||
    keys.some((key, index) => key !== descriptorKeys[index])
  ) {
    throw new TypeError('Terminal session descriptors must have exact fields.')
  }

  const id = descriptorValue(descriptors, 'id')
  const title = descriptorValue(descriptors, 'title')
  const status = descriptorValue(descriptors, 'status')
  const output = descriptorValue(descriptors, 'output')

  if (typeof id !== 'string') {
    throw new TypeError('Terminal session ids must be strings.')
  }
  if (
    id.length === 0 ||
    id.length > IntegratedTerminalSessionIdMaximumLength ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u.test(id)
  ) {
    throw new RangeError('Terminal session id is outside its safe bounds.')
  }
  if (typeof title !== 'string') {
    throw new TypeError('Terminal session titles must be strings.')
  }
  if (
    title.length === 0 ||
    title.length > IntegratedTerminalSessionTitleMaximumLength ||
    title.trim() !== title ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(title) ||
    hasUnpairedSurrogate(title)
  ) {
    throw new RangeError('Terminal session title is outside its safe bounds.')
  }
  if (typeof status !== 'string' || !isSessionStatus(status)) {
    throw new TypeError('Terminal session status is invalid.')
  }
  if (!Array.isArray(output)) {
    throw new TypeError('Terminal session output must be an array of strings.')
  }
  let outputCopy: ReadonlyArray<unknown>
  try {
    outputCopy = [...output]
  } catch {
    throw new TypeError('Terminal session output fields are unreadable.')
  }
  if (outputCopy.some(chunk => typeof chunk !== 'string')) {
    throw new TypeError('Terminal session output must be an array of strings.')
  }

  return Object.freeze({
    id,
    title,
    status,
    output: Object.freeze(outputCopy as ReadonlyArray<string>),
  })
}

export function isIntegratedTerminalSessionDescriptor(
  value: unknown
): value is IIntegratedTerminalSessionDescriptor {
  try {
    createIntegratedTerminalSessionDescriptor(value)
    return true
  } catch {
    return false
  }
}

export class IntegratedTerminalView extends React.Component<IIntegratedTerminalViewProps> {
  private readonly instanceId = ++nextIntegratedTerminalViewId
  private readonly terminalDataHandlers = new Map<
    string,
    (data: string) => void
  >()
  private readonly terminalResizeHandlers = new Map<
    string,
    (size: { readonly cols: number; readonly rows: number }) => void
  >()

  public componentDidUpdate(): void {
    this.pruneTerminalHandlers(
      new Set(this.props.sessions.map(session => session.id))
    )
  }

  public componentWillUnmount(): void {
    this.terminalDataHandlers.clear()
    this.terminalResizeHandlers.clear()
  }

  private getSessions(): ReadonlyArray<IIntegratedTerminalSessionDescriptor> {
    if (!Array.isArray(this.props.sessions)) {
      throw new TypeError('Integrated terminal sessions must be an array.')
    }

    const ids = new Set<string>()
    const sessions = this.props.sessions.map(session => {
      let descriptor: Readonly<IIntegratedTerminalSessionDescriptor>
      try {
        descriptor = createIntegratedTerminalSessionDescriptor(session)
      } catch {
        throw new TypeError(
          'Integrated terminal sessions contain an invalid descriptor.'
        )
      }
      if (ids.has(descriptor.id)) {
        throw new TypeError(
          'Integrated terminal session ids must be unique within a view.'
        )
      }
      ids.add(descriptor.id)
      return descriptor
    })
    return sessions
  }

  private getActiveSession(
    sessions: ReadonlyArray<IIntegratedTerminalSessionDescriptor>
  ): IIntegratedTerminalSessionDescriptor | null {
    const { activeSessionId } = this.props
    if (activeSessionId === null) {
      return null
    }
    return sessions.find(session => session.id === activeSessionId) ?? null
  }

  private getTabId(sessionId: string): string {
    return `integrated-terminal-${this.instanceId}-tab-${sessionId}`
  }

  private getPanelId(sessionId: string): string {
    return `integrated-terminal-${this.instanceId}-panel-${sessionId}`
  }

  private getTerminalDataHandler(sessionId: string): (data: string) => void {
    const existing = this.terminalDataHandlers.get(sessionId)
    if (existing !== undefined) {
      return existing
    }
    const handler = (data: string): void => this.onTerminalData(sessionId, data)
    this.terminalDataHandlers.set(sessionId, handler)
    return handler
  }

  private getTerminalResizeHandler(
    sessionId: string
  ): (size: { readonly cols: number; readonly rows: number }) => void {
    const existing = this.terminalResizeHandlers.get(sessionId)
    if (existing !== undefined) {
      return existing
    }
    const handler = (size: {
      readonly cols: number
      readonly rows: number
    }): void => this.onTerminalResize(sessionId, size)
    this.terminalResizeHandlers.set(sessionId, handler)
    return handler
  }

  private pruneTerminalHandlers(currentIds: ReadonlySet<string>): void {
    for (const sessionId of this.terminalDataHandlers.keys()) {
      if (!currentIds.has(sessionId)) {
        this.terminalDataHandlers.delete(sessionId)
      }
    }
    for (const sessionId of this.terminalResizeHandlers.keys()) {
      if (!currentIds.has(sessionId)) {
        this.terminalResizeHandlers.delete(sessionId)
      }
    }
  }

  private onTabClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const sessionId = event.currentTarget.dataset.sessionId
    if (sessionId !== undefined && this.hasSession(sessionId)) {
      this.props.onSelectSession(sessionId)
    }
  }

  private onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ): void => {
    const sessions = this.getSessions()
    if (sessions.length === 0) {
      return
    }

    const sessionId = event.currentTarget.dataset.sessionId
    const currentIndex = sessions.findIndex(session => session.id === sessionId)
    if (currentIndex < 0) {
      return
    }

    let nextIndex: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + sessions.length) % sessions.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % sessions.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = sessions.length - 1
        break
    }

    if (nextIndex === null) {
      return
    }
    event.preventDefault()
    const nextSession = sessions[nextIndex]
    const target = event.currentTarget.parentElement?.children.item(nextIndex)
    if (target instanceof HTMLElement) {
      target.focus()
    }
    this.props.onSelectSession(nextSession.id)
  }

  private onCreateSession = (): void => {
    this.props.onCreateSession?.()
  }

  private onCloseActiveSession = (): void => {
    const activeSession = this.getActiveSession(this.getSessions())
    if (activeSession !== null) {
      this.props.onCloseSession?.(activeSession.id)
    }
  }

  private onRestartActiveSession = (): void => {
    const activeSession = this.getActiveSession(this.getSessions())
    if (
      activeSession !== null &&
      (activeSession.status === 'exited' || activeSession.status === 'error')
    ) {
      this.props.onRestartSession?.(activeSession.id)
    }
  }

  private onTerminalData(sessionId: string, data: string): void {
    if (this.props.activeSessionId !== sessionId) {
      return
    }
    const activeSession = this.props.sessions.find(
      session => session.id === sessionId
    )
    if (activeSession?.status === 'ready') {
      this.props.onInput(sessionId, data)
    }
  }

  private onTerminalResize(
    sessionId: string,
    size: { readonly cols: number; readonly rows: number }
  ): void {
    if (
      this.props.activeSessionId === sessionId &&
      this.props.sessions.some(session => session.id === sessionId)
    ) {
      this.props.onResize(sessionId, { ...size })
    }
  }

  private hasSession(sessionId: string): boolean {
    return this.getSessions().some(session => session.id === sessionId)
  }

  private renderTab(
    session: IIntegratedTerminalSessionDescriptor,
    activeSession: IIntegratedTerminalSessionDescriptor | null,
    fallbackFocusable: boolean
  ): React.ReactNode {
    const selected = session.id === activeSession?.id
    return (
      <button
        key={session.id}
        id={this.getTabId(session.id)}
        className="integrated-terminal-view__tab"
        type="button"
        role="tab"
        aria-controls={this.getPanelId(session.id)}
        aria-selected={selected}
        tabIndex={selected || fallbackFocusable ? 0 : -1}
        data-session-id={session.id}
        onClick={this.onTabClick}
        onKeyDown={this.onTabKeyDown}
      >
        <span className="integrated-terminal-view__tab-title">
          {session.title}
        </span>
        <span
          className="integrated-terminal-view__tab-status"
          data-status={session.status}
        >
          {this.statusLabel(session.status)}
        </span>
      </button>
    )
  }

  private renderPanel(
    session: IIntegratedTerminalSessionDescriptor,
    activeSession: IIntegratedTerminalSessionDescriptor | null
  ): React.ReactNode {
    const selected = session.id === activeSession?.id
    return (
      <div
        key={session.id}
        id={this.getPanelId(session.id)}
        className="integrated-terminal-view__panel"
        role="tabpanel"
        aria-labelledby={this.getTabId(session.id)}
        hidden={!selected}
        tabIndex={selected ? 0 : -1}
      >
        {selected ? this.renderActiveSession(session) : null}
      </div>
    )
  }

  private renderActiveSession(
    session: IIntegratedTerminalSessionDescriptor
  ): React.ReactNode {
    const terminalLabel = requiredDynamicLabel(
      this.props.labels.terminal,
      session.title,
      'terminal'
    )
    return (
      <>
        <Terminal
          key={session.id}
          className="integrated-terminal-view__terminal"
          mode={session.status === 'ready' ? 'interactive' : 'read-only'}
          accessibleName={terminalLabel}
          terminalOutput={session.output}
          onData={this.getTerminalDataHandler(session.id)}
          onResize={this.getTerminalResizeHandler(session.id)}
        />
        {session.status === 'ready' ? null : this.renderStatusOverlay(session)}
      </>
    )
  }

  private renderStatusOverlay(
    session: IIntegratedTerminalSessionDescriptor
  ): React.ReactNode {
    const canRestart =
      this.props.onRestartSession !== undefined &&
      (session.status === 'exited' || session.status === 'error')
    return (
      <div
        className="integrated-terminal-view__status-overlay"
        data-status={session.status}
        role="status"
      >
        <span className="integrated-terminal-view__status">
          {this.statusLabel(session.status)}
        </span>
        {canRestart ? (
          <button
            className="integrated-terminal-view__restart"
            type="button"
            onClick={this.onRestartActiveSession}
          >
            {requiredDynamicLabel(
              this.props.labels.restart,
              session.title,
              'restart'
            )}
          </button>
        ) : null}
      </div>
    )
  }

  private statusLabel(status: IntegratedTerminalSessionStatus): string {
    return requiredLabel(this.props.labels.status[status], `status.${status}`)
  }

  public render(): React.ReactNode {
    validateLabels(this.props.labels)
    const sessions = this.getSessions()
    const activeSession = this.getActiveSession(sessions)
    const closeLabel =
      activeSession === null
        ? null
        : requiredDynamicLabel(
            this.props.labels.closeActive,
            activeSession.title,
            'closeActive'
          )

    return (
      <section
        className="integrated-terminal-view integrated-terminal-view--material-shell"
        aria-label={requiredLabel(this.props.labels.view, 'view')}
      >
        {sessions.length > 0 || this.props.onCreateSession !== undefined ? (
          <div className="integrated-terminal-view__tab-strip">
            {sessions.length === 0 ? null : (
              <div
                className="integrated-terminal-view__tablist"
                role="tablist"
                aria-label={requiredLabel(this.props.labels.tabList, 'tabList')}
              >
                {sessions.map((session, index) =>
                  this.renderTab(
                    session,
                    activeSession,
                    activeSession === null && index === 0
                  )
                )}
              </div>
            )}
            {this.props.onCreateSession !== undefined ||
            (this.props.onCloseSession !== undefined &&
              activeSession !== null) ? (
              <div className="integrated-terminal-view__tab-actions">
                {this.props.onCreateSession === undefined ? null : (
                  <button
                    className="integrated-terminal-view__action"
                    type="button"
                    aria-label={requiredLabel(
                      this.props.labels.create,
                      'create'
                    )}
                    onClick={this.onCreateSession}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                )}
                {this.props.onCloseSession === undefined ||
                activeSession === null ? null : (
                  <button
                    className="integrated-terminal-view__action"
                    type="button"
                    aria-label={closeLabel ?? undefined}
                    onClick={this.onCloseActiveSession}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {sessions.length === 0 ? (
          <p className="integrated-terminal-view__empty">
            {requiredLabel(this.props.labels.empty, 'empty')}
          </p>
        ) : (
          <div className="integrated-terminal-view__panels">
            {sessions.map(session => this.renderPanel(session, activeSession))}
          </div>
        )}
      </section>
    )
  }
}

function ownDataDescriptors(
  value: unknown
): Readonly<Record<string, PropertyDescriptor>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Terminal session descriptors must be objects.')
  }

  let descriptors: Record<string, PropertyDescriptor>
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    throw new TypeError('Terminal session descriptor fields are unreadable.')
  }
  if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) {
    throw new TypeError('Terminal session descriptors cannot contain symbols.')
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new TypeError('Terminal session fields must be enumerable data.')
    }
  }
  return descriptors
}

function descriptorValue(
  descriptors: Readonly<Record<string, PropertyDescriptor>>,
  name: string
): unknown {
  return descriptors[name]?.value
}

function isSessionStatus(
  value: string
): value is IntegratedTerminalSessionStatus {
  return sessionStatuses.has(value as IntegratedTerminalSessionStatus)
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1)
      if (trailing < 0xdc00 || trailing > 0xdfff) {
        return true
      }
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function requiredLabel(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Integrated terminal label ${name} is required.`)
  }
  return value
}

function requiredDynamicLabel(
  factory: ((title: string) => string) | undefined,
  title: string,
  name: string
): string {
  if (typeof factory !== 'function') {
    throw new TypeError(`Integrated terminal label ${name} is required.`)
  }
  return requiredLabel(factory(title), name)
}

function validateLabels(labels: IIntegratedTerminalLabels): void {
  if (typeof labels !== 'object' || labels === null) {
    throw new TypeError('Integrated terminal labels are required.')
  }
  requiredLabel(labels.view, 'view')
  requiredLabel(labels.tabList, 'tabList')
  requiredLabel(labels.create, 'create')
  requiredLabel(labels.empty, 'empty')
  if (
    typeof labels.closeActive !== 'function' ||
    typeof labels.restart !== 'function' ||
    typeof labels.terminal !== 'function'
  ) {
    throw new TypeError('Integrated terminal dynamic labels are required.')
  }
  if (typeof labels.status !== 'object' || labels.status === null) {
    throw new TypeError('Integrated terminal status labels are required.')
  }
  for (const status of sessionStatuses) {
    requiredLabel(labels.status[status], `status.${status}`)
  }
}
