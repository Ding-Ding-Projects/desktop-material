import * as React from 'react'

import { Button } from '../lib/button'
import { Md3LockSetupDialog } from '../md3/md3-lock-setup-dialog'
import {
  md3LockPromptPosition,
  Md3LockUnlockPrompt,
} from '../md3/md3-lock-unlock-prompt'
import { IMd3ActiveUnlock, IMd3Lock } from '../../lib/md3-locks'
import {
  AppearanceLockBlockedEvent,
  AppearanceLockCreationRequestedEvent,
  IAppearanceLockCreationRequestedDetail,
  IAppearanceLockBlockedDetail,
  firstLockedAppearanceLock,
  refreshAppearanceLockSemantics,
  recordAppearanceUnlock,
} from './appearance-lock-gate'
import { resolveApplicationDataFolder } from '../../lib/support-ticket-recovery'
import { getPath } from '../main-process-proxy'
import { t } from '../../lib/i18n'

/**
 * The prompt a blocked element opens.
 *
 * Without this the gate is half a feature and arguably worse than none: a
 * locked button simply stops responding, with nothing on screen to say why or
 * how to get in. A control that silently does nothing is the exact defect this
 * project forbids everywhere else, and it is no more acceptable when the
 * silence was deliberate.
 *
 * Mounted once by the shell. It listens for the gate's blocked event, resolves
 * which lock is standing in the way, and anchors the existing unlock prompt to
 * the element the user actually pressed.
 */

interface IAppearanceLockPromptHostProps {
  /**
   * Injected by tests. In the app the folder is resolved from the main
   * process, so mounting the host is a single tag with nothing to remember to
   * pass — a prop the shell has to supply is a prop the shell will one day
   * supply as `null`, and the recovery sentence would quietly lose its path.
   */
  readonly resolveFolder?: () => Promise<string>
}

interface IAppearanceLockPromptHostState {
  readonly lock: IMd3Lock | null
  readonly anchorRect: DOMRect | null
  /** The control that was blocked, so focus can go back to it. */
  readonly anchor: HTMLElement | null
  readonly applicationDataFolder: string | null
  readonly creation: {
    readonly targetId: string
    readonly targetLabel: string
    readonly anchor: HTMLElement
    readonly anchorRect: DOMRect
  } | null
  readonly creationMenu: boolean
  readonly creationPosition: {
    readonly top: number
    readonly left: number
  } | null
}

export class AppearanceLockPromptHost extends React.Component<
  IAppearanceLockPromptHostProps,
  IAppearanceLockPromptHostState
> {
  public state: IAppearanceLockPromptHostState = {
    lock: null,
    anchorRect: null,
    anchor: null,
    applicationDataFolder: null,
    creation: null,
    creationMenu: false,
    creationPosition: null,
  }

  private mounted = false
  private creationMenuNode: HTMLDivElement | null = null
  private creationFirstButton: HTMLButtonElement | null = null

  public componentDidMount() {
    this.mounted = true
    window.addEventListener('resize', this.onWindowResize)
    window.addEventListener(AppearanceLockBlockedEvent, this.onBlocked)
    window.addEventListener(
      AppearanceLockCreationRequestedEvent,
      this.onCreationRequested
    )
    const resolve = this.props.resolveFolder ?? (() => getPath('userData'))
    void resolveApplicationDataFolder(resolve).then(folder => {
      if (this.mounted) {
        this.setState({ applicationDataFolder: folder })
      }
    })
  }

  public componentWillUnmount() {
    this.mounted = false
    window.removeEventListener('resize', this.onWindowResize)
    window.removeEventListener(AppearanceLockBlockedEvent, this.onBlocked)
    window.removeEventListener(
      AppearanceLockCreationRequestedEvent,
      this.onCreationRequested
    )
  }

  public componentDidUpdate(
    prevProps: IAppearanceLockPromptHostProps,
    previousState: IAppearanceLockPromptHostState
  ) {
    void prevProps
    if (
      this.state.creation !== null &&
      this.state.creationMenu &&
      (!previousState.creationMenu ||
        previousState.creation === null ||
        previousState.creation.targetId !== this.state.creation.targetId)
    ) {
      this.creationFirstButton?.focus()
      this.measureCreationMenu()
    }
  }

  private onWindowResize = () => {
    if (this.state.creationMenu) {
      this.measureCreationMenu()
    }
  }

  private onBlocked = (event: Event) => {
    const detail = (event as CustomEvent<IAppearanceLockBlockedDetail>).detail
    if (detail === undefined) {
      return
    }

    // The first still-closed lock on that element. Two locks are two answers,
    // so the user is asked for them one at a time rather than being shown a
    // form with two fields and no explanation of why.
    const lock = firstLockedAppearanceLock(
      detail.targetId,
      Date.now(),
      detail.targetKind ?? 'appearanceElement'
    )
    if (lock === null) {
      return
    }

    this.setState({
      lock,
      anchor: detail.anchor,
      anchorRect: detail.anchor.getBoundingClientRect(),
    })
  }

  private onCreationRequested = (event: Event) => {
    const detail = (
      event as CustomEvent<IAppearanceLockCreationRequestedDetail>
    ).detail
    if (detail === undefined) {
      return
    }
    this.setState({
      lock: null,
      anchor: detail.anchor,
      anchorRect: detail.anchor.getBoundingClientRect(),
      creation: {
        targetId: detail.targetId,
        targetLabel: detail.targetLabel,
        anchor: detail.anchor,
        anchorRect: detail.anchor.getBoundingClientRect(),
      },
      creationMenu: detail.openWizard !== true,
      creationPosition: null,
    })
  }

  private setCreationMenuNode = (node: HTMLDivElement | null) => {
    this.creationMenuNode = node
  }

  private setCreationFirstButton = (node: HTMLButtonElement | null) => {
    this.creationFirstButton = node
  }

  private measureCreationMenu = () => {
    const creation = this.state.creation
    const menu = this.creationMenuNode
    if (!this.state.creationMenu || creation === null || menu === null) {
      return
    }
    const rect = menu.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const position = md3LockPromptPosition(
      {
        top: creation.anchorRect.top,
        left: creation.anchorRect.left,
        width: creation.anchorRect.width,
        height: creation.anchorRect.height,
      },
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      { width: rect.width, height: rect.height }
    )
    const current = this.state.creationPosition
    if (current?.top === position.top && current.left === position.left) {
      return
    }
    this.setState({ creationPosition: position })
  }

  private openCreationSetup = () =>
    this.setState({ creationMenu: false, creationPosition: null })

  private onCreationMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.dismiss()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    const buttons =
      this.creationMenuNode?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]'
      )
    if (buttons === undefined || buttons.length === 0) {
      return
    }
    const current = Array.from(buttons).indexOf(
      document.activeElement as HTMLButtonElement
    )
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = (current + delta + buttons.length) % buttons.length
    event.preventDefault()
    buttons[next]?.focus()
  }

  private onCreationSaved = () => {
    refreshAppearanceLockSemantics()
    this.dismiss()
  }

  private onUnlocked = (unlock: IMd3ActiveUnlock) => {
    recordAppearanceUnlock(unlock)
    refreshAppearanceLockSemantics()
    this.dismiss()
    // Deliberately not re-firing the activation the user was refused. Replaying
    // a click they made before they were asked for a credential would perform
    // an action they have not chosen since being interrupted, and on a
    // destructive control that is a genuinely bad outcome. They press it again.
  }

  private dismiss = () => {
    const { anchor } = this.state
    this.setState(
      {
        lock: null,
        anchorRect: null,
        anchor: null,
        creation: null,
        creationMenu: false,
        creationPosition: null,
      },
      () => anchor?.focus()
    )
  }

  public render() {
    const { lock, anchorRect, creation, creationMenu, creationPosition } =
      this.state
    if (creation !== null && creationMenu) {
      return (
        <div
          className="md3-lock-setup md3-lock-creation-menu"
          role="menu"
          aria-label={t('md3.locks.menu.elementCommands')}
          ref={this.setCreationMenuNode}
          onKeyDown={this.onCreationMenuKeyDown}
          style={{
            position: 'fixed',
            top: creationPosition?.top ?? creation.anchorRect.bottom + 4,
            left: creationPosition?.left ?? creation.anchorRect.left,
          }}
        >
          {/* Shared Material buttons carrying the menuitem role; the raw
              buttons here previously rendered with browser default chrome. */}
          <Button
            role="menuitem"
            inferTooltip={false}
            ariaKeyshortcuts="Control+Shift+L"
            onButtonRef={this.setCreationFirstButton}
            onClick={this.openCreationSetup}
          >
            {t('md3.locks.menu.lockElement')}
          </Button>
          <Button role="menuitem" inferTooltip={false} onClick={this.dismiss}>
            {t('md3.locks.setup.cancel')}
          </Button>
        </div>
      )
    }
    if (creation !== null) {
      return (
        <Md3LockSetupDialog
          lock={null}
          target={{
            kind: 'appearanceElement',
            id: creation.targetId,
            label: creation.targetLabel,
          }}
          anchorRect={{
            top: creation.anchorRect.top,
            left: creation.anchorRect.left,
            width: creation.anchorRect.width,
            height: creation.anchorRect.height,
          }}
          applicationDataFolder={this.state.applicationDataFolder}
          onSaved={this.onCreationSaved}
          onDismissed={this.dismiss}
        />
      )
    }
    if (lock === null) {
      return null
    }

    return (
      <Md3LockUnlockPrompt
        lock={lock}
        anchorRect={
          anchorRect === null
            ? null
            : {
                top: anchorRect.top,
                left: anchorRect.left,
                width: anchorRect.width,
                height: anchorRect.height,
              }
        }
        applicationDataFolder={this.state.applicationDataFolder}
        onUnlocked={this.onUnlocked}
        onDismissed={this.dismiss}
      />
    )
  }
}
