import * as React from 'react'
import { writeFile } from 'fs/promises'

import {
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3LockExport,
  Md3LocksChangedEvent,
  readMd3Locks,
  removeMd3Locks,
} from '../../lib/md3-locks'
import { removeMd3LockCredential } from '../../lib/md3-locks/lock-credentials'
import { resolveApplicationDataFolder } from '../../lib/support-ticket-recovery'
import { teleportAnchor } from '../../lib/teleport-targets'
import { translate, TranslationKey } from '../../lib/i18n'
import {
  IFunnyLevels,
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import { getPath, showSaveDialog } from '../main-process-proxy'
import { IMd3LockAnchorRect } from '../md3/md3-lock-unlock-prompt'
import { Md3LockSetupDialog } from '../md3/md3-lock-setup-dialog'
import { Md3LocksView } from '../md3/md3-locks-view'

/**
 * Settings → Appearance → the lock manager's own row.
 *
 * The rewrite can lock a tab, a tab group or any appearance value, each behind
 * its own credential. "Each and every lock carries its own credential" is only
 * checkable if the locks are enumerable, so the manager has to be reachable
 * from somewhere a user would look — and the place a user looks for what an
 * appearance lock is doing is the appearance settings.
 *
 * The row itself stays a row: the heading, the button that opens the manager,
 * the explanation behind progressive disclosure, and a provenance line that
 * names the real number of locks recorded on this computer rather than the
 * word "default". The manager is an overlay the button owns, in the same shape
 * as the support desk's entry link, so this placement needs no popup type and
 * no host to remember to mount.
 */

/** How the manager's own state is tracked while it is open. */
interface ISurfaceLocksState {
  readonly locks: ReadonlyArray<IMd3Lock>
  readonly open: boolean
  readonly activeUnlocks: ReadonlyArray<IMd3ActiveUnlock>
  readonly editing: {
    readonly lock: IMd3Lock
    readonly anchor: IMd3LockAnchorRect
  } | null
  readonly applicationDataFolder: string | null
}

export interface ISurfaceLocksPreferencesProps {
  readonly languageMode: LanguageMode

  /** Injected by tests. Defaults to `localStorage`. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>

  /** Injected by tests. Defaults to the app's own userData folder. */
  readonly resolveFolder?: () => Promise<string>

  /** Injected by tests so no export ever touches the file system. */
  readonly onExportFile?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>
}

export class SurfaceLocksPreferences extends React.Component<
  ISurfaceLocksPreferencesProps,
  ISurfaceLocksState
> {
  private mounted = false

  public constructor(props: ISurfaceLocksPreferencesProps) {
    super(props)
    this.state = {
      locks: readMd3Locks(props.storage),
      open: false,
      activeUnlocks: [],
      editing: null,
      applicationDataFolder: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    window.addEventListener(Md3LocksChangedEvent, this.onLocksChanged)
    void this.loadApplicationDataFolder()
  }

  public componentWillUnmount() {
    this.mounted = false
    window.removeEventListener(Md3LocksChangedEvent, this.onLocksChanged)
  }

  private async loadApplicationDataFolder() {
    const resolve = this.props.resolveFolder ?? (() => getPath('userData'))
    const folder = await resolveApplicationDataFolder(resolve)
    if (this.mounted) {
      this.setState({ applicationDataFolder: folder })
    }
  }

  private onLocksChanged = () => {
    this.setState({ locks: readMd3Locks(this.props.storage) })
  }

  private t = (key: TranslationKey, variables?: Record<string, string>) =>
    translate(key, this.props.languageMode, variables)

  private funnyLevels(): IFunnyLevels {
    return readFunnyLevels()
  }

  private onOpen = () => this.setState({ open: true })

  private onDismissed = () => this.setState({ open: false, editing: null })

  private onEditLock = (lock: IMd3Lock, anchor: IMd3LockAnchorRect) =>
    this.setState({ editing: { lock, anchor } })

  private onEditDismissed = () => this.setState({ editing: null })

  private onEditSaved = () => {
    this.setState({
      editing: null,
      locks: readMd3Locks(this.props.storage),
    })
  }

  /**
   * Remove locks and forget their credentials.
   *
   * The credential goes first. A lock removed from the registry while its
   * credential stayed in the vault would leave an orphaned secret nothing can
   * reach, and a credential removed for a lock that then failed to leave the
   * registry would leave a lock nobody can answer.
   */
  private onRemoveLocks = (lockIds: ReadonlyArray<string>) => {
    void Promise.all(
      lockIds.map(lockId => removeMd3LockCredential(lockId).catch(() => false))
    ).then(() => {
      removeMd3Locks(lockIds, this.props.storage)
      if (this.mounted) {
        this.setState({ locks: readMd3Locks(this.props.storage) })
      }
    })
  }

  private onLockAgain = (lock: IMd3Lock) =>
    this.setState(previous => ({
      activeUnlocks: previous.activeUnlocks.filter(
        unlock => unlock.lockId !== lock.id
      ),
    }))

  private onExport = (result: IMd3LockExport) => {
    const write = this.props.onExportFile ?? this.writeExport
    void write(result.content, result.filename)
  }

  private writeExport = async (contents: string, fileName: string) => {
    const destination = await showSaveDialog({
      title: 'Export surface locks',
      defaultPath: fileName,
    })
    if (destination === null) {
      return null
    }
    await writeFile(destination, contents, 'utf8')
    return destination
  }

  /**
   * The provenance line, stating what is actually recorded on this computer.
   *
   * A lock list has no shipped default to fall back to, so the honest line is
   * the count itself: none recorded, or exactly how many. "Default" would say
   * nothing a reader could check.
   */
  private renderProvenance() {
    const count = this.state.locks.length
    return (
      <p
        id="surface-locks-provenance"
        className="appearance-customization-caption surface-locks-provenance"
      >
        {count === 0
          ? this.t('surfaceLocks.provenanceNone')
          : count === 1
          ? this.t('surfaceLocks.provenanceOne')
          : this.t('surfaceLocks.provenanceMany', { count: String(count) })}
      </p>
    )
  }

  private renderManager() {
    if (!this.state.open) {
      return null
    }

    const { editing } = this.state

    return (
      <div className="surface-locks-manager" role="group">
        <Md3LocksView
          locks={this.state.locks}
          activeUnlocks={this.state.activeUnlocks}
          applicationDataFolder={this.state.applicationDataFolder}
          onEditLock={this.onEditLock}
          onRemoveLocks={this.onRemoveLocks}
          onLockAgain={this.onLockAgain}
          onExport={this.onExport}
        />
        <button
          type="button"
          className="surface-locks-close"
          onClick={this.onDismissed}
        >
          {this.t('surfaceLocks.close')}
        </button>
        {editing !== null ? (
          <Md3LockSetupDialog
            lock={editing.lock}
            target={editing.lock.target}
            anchorRect={editing.anchor}
            applicationDataFolder={this.state.applicationDataFolder}
            onSaved={this.onEditSaved}
            onDismissed={this.onEditDismissed}
            storage={this.props.storage}
          />
        ) : null}
      </div>
    )
  }

  public render() {
    const levels = this.funnyLevels()

    return (
      <div
        className="appearance-section appearance-customization-section surface-locks-section"
        {...teleportAnchor('settings-surface-locks')}
      >
        <h2>{this.t('surfaceLocks.heading')}</h2>
        <button
          type="button"
          className="surface-locks-open"
          onClick={this.onOpen}
          aria-describedby="surface-locks-provenance"
          aria-expanded={this.state.open}
        >
          {this.t('surfaceLocks.manage')}
        </button>
        <details className="surface-locks-explanation">
          <summary>{this.t('surfaceLocks.explanationSummary')}</summary>
          <p className="appearance-customization-caption">
            {translateWithFunnyLevel(
              'surfaceLocks.explanation',
              this.props.languageMode,
              levels
            )}
          </p>
          <p className="appearance-customization-caption">
            {this.t('surfaceLocks.boundaryNote')}
          </p>
        </details>
        {this.renderProvenance()}
        {this.renderManager()}
      </div>
    )
  }
}
