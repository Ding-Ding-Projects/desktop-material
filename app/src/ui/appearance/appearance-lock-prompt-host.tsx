import * as React from 'react'

import { Md3LockSetupDialog } from '../md3/md3-lock-setup-dialog'
import { Md3LockUnlockPrompt } from '../md3/md3-lock-unlock-prompt'
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
  }

  private mounted = false

  public componentDidMount() {
    this.mounted = true
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
    window.removeEventListener(AppearanceLockBlockedEvent, this.onBlocked)
    window.removeEventListener(
      AppearanceLockCreationRequestedEvent,
      this.onCreationRequested
    )
  }

  private onBlocked = (event: Event) => {
    const detail = (event as CustomEvent<IAppearanceLockBlockedDetail>).detail
    if (detail === undefined) {
      return
    }

    // The first still-closed lock on that element. Two locks are two answers,
    // so the user is asked for them one at a time rather than being shown a
    // form with two fields and no explanation of why.
    const lock = firstLockedAppearanceLock(detail.targetId)
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
    })
  }

  private openCreationSetup = () => this.setState({ creationMenu: false })

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
      },
      () => anchor?.focus()
    )
  }

  public render() {
    const { lock, anchorRect, creation, creationMenu } = this.state
    if (creation !== null && creationMenu) {
      return (
        <div
          className="md3-lock-setup md3-lock-creation-menu"
          role="menu"
          aria-label="Element lock commands"
          style={{
            position: 'fixed',
            top: creation.anchorRect.bottom + 4,
            left: creation.anchorRect.left,
          }}
        >
          <button
            type="button"
            role="menuitem"
            aria-keyshortcuts="Control+Shift+L"
            onClick={this.openCreationSetup}
          >
            {t('md3.locks.menu.lockElement')}
          </button>
          <button type="button" role="menuitem" onClick={this.dismiss}>
            Cancel
          </button>
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
