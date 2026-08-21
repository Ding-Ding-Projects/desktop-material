import * as React from 'react'

import { Button } from '../lib/button'
import { PasswordTextBox } from '../lib/password-text-box'
import {
  IMd3Lock,
  Md3LocksChangedEvent,
  isTargetLocked,
  locksForTarget,
  readMd3Locks,
  removeMd3Locks,
} from '../../lib/md3-locks'
import { verifyMd3LockPassword } from '../../lib/md3-locks/lock-credentials'
import { getPath } from '../main-process-proxy'
import { Md3LockSetupDialog } from '../md3/md3-lock-setup-dialog'
import { t } from '../../lib/i18n'

/**
 * The toy lock every appearance editor carries.
 *
 * The contract asks that every appearance value be lockable, so every element
 * that can be styled — which is every element whose editor opens on
 * Shift+right-click — can also be locked. Rather than trusting that each
 * editor remembers to offer one, the editor's props make the lock target
 * required: an appearance editor with no lock target does not compile.
 *
 * It is a speed bump for fun and the copy says so every time it is on screen.
 * It is not encryption, it protects nothing from anyone else using this
 * computer, and the recovery route — delete the application data folder — is
 * printed beside the control rather than hidden in a help page, because
 * forgetting the password is a completely normal outcome for a toy lock and a
 * user must never be stuck behind one.
 *
 * Each lock carries its own credential. Locking two properties produces two
 * locks with two passwords; unlocking one never unlocks the other. That is why
 * `addMd3Lock` mints a fresh id rather than deriving one from the target.
 */

interface IAppearanceLockControlProps {
  /** Stable identity of the element whose appearance this locks. */
  readonly targetId: string

  /** The element's visible name, shown in the lock manager. */
  readonly targetLabel: string
}

interface IAppearanceLockControlState {
  readonly locks: ReadonlyArray<IMd3Lock>

  /** Which form is open, if any. */
  readonly mode: 'idle' | 'creating' | 'removing'

  readonly password: string

  /** The exact failure, or `null`. Never a bare red border. */
  readonly problem: string | null

  readonly busy: boolean

  /** The real user-data folder named by the shared setup flow. */
  readonly applicationDataFolder: string | null
}

export class AppearanceLockControl extends React.Component<
  IAppearanceLockControlProps,
  IAppearanceLockControlState
> {
  private mounted = false

  public constructor(props: IAppearanceLockControlProps) {
    super(props)
    this.state = {
      locks: this.read(),
      mode: 'idle',
      password: '',
      problem: null,
      busy: false,
      applicationDataFolder: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    window.addEventListener(Md3LocksChangedEvent, this.onLocksChanged)
    void getPath('userData').then(
      folder => {
        if (this.mounted) {
          this.setState({ applicationDataFolder: folder })
        }
      },
      () => {
        // The shared setup dialog reports an unavailable path explicitly; it
        // must never invent one when the main-process bridge is unavailable.
      }
    )
  }

  public componentWillUnmount() {
    this.mounted = false
    window.removeEventListener(Md3LocksChangedEvent, this.onLocksChanged)
  }

  private read(): ReadonlyArray<IMd3Lock> {
    // The manager and this control write the same store, so a lock removed
    // from Settings has to disappear here without a reload.
    return locksForTarget(
      readMd3Locks(),
      'appearanceElement',
      this.props.targetId
    )
  }

  private onLocksChanged = () => {
    if (this.mounted) {
      this.setState({ locks: this.read() })
    }
  }

  private get locked(): boolean {
    return isTargetLocked(
      readMd3Locks(),
      'appearanceElement',
      this.props.targetId
    )
  }

  private onPasswordChanged = (value: string) =>
    this.setState({ password: value, problem: null })

  private startCreating = () =>
    this.setState({ mode: 'creating', password: '', problem: null })

  private startRemoving = () =>
    this.setState({ mode: 'removing', password: '', problem: null })

  private cancel = () =>
    this.setState({ mode: 'idle', password: '', problem: null })

  private onLockSaved = () => {
    if (this.mounted) {
      this.setState({
        busy: false,
        mode: 'idle',
        password: '',
        problem: null,
        locks: this.read(),
      })
    }
  }

  private removeLock = async () => {
    const [lock] = this.state.locks
    if (lock === undefined) {
      this.setState({ mode: 'idle' })
      return
    }

    this.setState({ busy: true, problem: null })
    const matched = await verifyMd3LockPassword(lock.id, this.state.password)
    if (!matched) {
      if (this.mounted) {
        this.setState({
          busy: false,
          problem: t('md3.locks.appearance.passwordMismatch'),
        })
      }
      return
    }

    removeMd3Locks([lock.id])
    if (this.mounted) {
      this.setState({
        busy: false,
        mode: 'idle',
        password: '',
        locks: this.read(),
      })
    }
  }

  private renderRecovery(): JSX.Element {
    return (
      <p className="appearance-lock-recovery">
        {this.state.applicationDataFolder === null
          ? t('md3.locks.appearance.recoveryUnknown')
          : t('md3.locks.appearance.recovery', {
              folder: this.state.applicationDataFolder,
            })}
      </p>
    )
  }

  private renderForm(submit: () => void, label: string): JSX.Element {
    return (
      <div className="appearance-lock-form">
        <PasswordTextBox
          label={label}
          value={this.state.password}
          onValueChanged={this.onPasswordChanged}
        />
        {this.state.problem === null ? null : (
          <p className="appearance-lock-problem" role="alert">
            {this.state.problem}
          </p>
        )}
        <div className="appearance-lock-actions">
          <Button type="button" onClick={submit} disabled={this.state.busy}>
            {label}
          </Button>
          <Button
            type="button"
            onClick={this.cancel}
            disabled={this.state.busy}
          >
            {t('md3.locks.setup.cancel')}
          </Button>
        </div>
        {this.renderRecovery()}
      </div>
    )
  }

  public render(): JSX.Element {
    if (this.state.mode === 'creating') {
      return (
        <Md3LockSetupDialog
          lock={null}
          target={{
            kind: 'appearanceElement',
            id: this.props.targetId,
            label: this.props.targetLabel,
          }}
          anchorRect={null}
          applicationDataFolder={this.state.applicationDataFolder}
          onSaved={this.onLockSaved}
          onDismissed={this.cancel}
        />
      )
    }
    if (this.state.mode === 'removing') {
      return this.renderForm(
        this.removeLock,
        t('md3.locks.appearance.removePassword')
      )
    }

    return (
      <div className="appearance-lock">
        {this.locked ? (
          <>
            <p className="appearance-lock-state">{t('md3.locks.row.locked')}</p>
            <Button type="button" onClick={this.startRemoving}>
              {t('md3.locks.appearance.remove')}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={this.startCreating}>
            {t('md3.locks.appearance.lock')}
          </Button>
        )}
        {this.renderRecovery()}
      </div>
    )
  }
}
