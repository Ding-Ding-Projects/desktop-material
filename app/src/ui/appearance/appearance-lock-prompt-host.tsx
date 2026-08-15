import * as React from 'react'

import { Md3LockUnlockPrompt } from '../md3/md3-lock-unlock-prompt'
import {
  IMd3ActiveUnlock,
  IMd3Lock,
  locksForTarget,
  readMd3Locks,
} from '../../lib/md3-locks'
import {
  AppearanceLockBlockedEvent,
  IAppearanceLockBlockedDetail,
  recordAppearanceUnlock,
} from './appearance-lock-gate'
import { resolveApplicationDataFolder } from '../../lib/support-ticket-recovery'
import { getPath } from '../main-process-proxy'

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
  }

  private mounted = false

  public componentDidMount() {
    this.mounted = true
    window.addEventListener(AppearanceLockBlockedEvent, this.onBlocked)
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
  }

  private onBlocked = (event: Event) => {
    const detail = (event as CustomEvent<IAppearanceLockBlockedDetail>).detail
    if (detail === undefined) {
      return
    }

    // The first still-closed lock on that element. Two locks are two answers,
    // so the user is asked for them one at a time rather than being shown a
    // form with two fields and no explanation of why.
    const [lock] = locksForTarget(
      readMd3Locks(),
      'appearanceElement',
      detail.targetId
    )
    if (lock === undefined) {
      return
    }

    this.setState({
      lock,
      anchor: detail.anchor,
      anchorRect: detail.anchor.getBoundingClientRect(),
    })
  }

  private onUnlocked = (unlock: IMd3ActiveUnlock) => {
    recordAppearanceUnlock(unlock)
    this.dismiss()
    // Deliberately not re-firing the activation the user was refused. Replaying
    // a click they made before they were asked for a credential would perform
    // an action they have not chosen since being interrupted, and on a
    // destructive control that is a genuinely bad outcome. They press it again.
  }

  private dismiss = () => {
    const { anchor } = this.state
    this.setState({ lock: null, anchorRect: null, anchor: null }, () =>
      anchor?.focus()
    )
  }

  public render() {
    const { lock, anchorRect } = this.state
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
