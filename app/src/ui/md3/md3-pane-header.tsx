import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { Md3IconButton } from './md3-primitives'

/**
 * The content pane's 48px header and the progress bar beneath it, from the MD3
 * shell design contract (`design/History MD3.dc.html`, markup lines 182–212 and
 * the `viewIcon` / `viewTitle` / `showCrumbs` / `showSync` / `crumbStyle` /
 * `pushStyle` / `progressBarStyle` values in `renderVals()`).
 *
 * Every measurement lives in `app/styles/ui/_md3-pane-header.scss`. The single
 * inline style here is the progress fill's width, which is genuinely dynamic.
 */

/** The contract's `destDefs` labels — the eight destinations the rail offers. */
export type Md3Destination =
  | 'Changes'
  | 'History'
  | 'Branches'
  | 'Actions'
  | 'Inbox'
  | 'Terminal'
  | 'Agents'
  | 'Repositories'

/** The contract's two `pushState` values. */
export type Md3PushState = 'ahead' | 'clean'

/**
 * The contract's `showCrumbs`: the repository and branch breadcrumbs appear on
 * the four repository-scoped destinations only.
 */
export function md3ShowBreadcrumbs(destination: Md3Destination): boolean {
  return (
    destination === 'History' ||
    destination === 'Changes' ||
    destination === 'Branches' ||
    destination === 'Actions'
  )
}

/**
 * The contract's `showSync`: the fetch and push controls appear on the three
 * destinations that can act on the remote. Actions is deliberately excluded —
 * a workflow run has nothing to push.
 */
export function md3ShowSync(destination: Md3Destination): boolean {
  return (
    destination === 'History' ||
    destination === 'Changes' ||
    destination === 'Branches'
  )
}

/** Keep the rendered fill inside the track whatever the caller reports. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, value))
}

export interface IMd3PaneHeaderProps {
  /** The active destination. Drives the breadcrumb and sync defaults. */
  readonly destination: Md3Destination

  /**
   * The visible pane title. Already localized by the caller — the contract
   * renders the destination's own label here.
   */
  readonly title: string

  /** The destination's glyph, rendered in primary at 18px. */
  readonly icon: MaterialSymbolName

  /**
   * Overrides the contract's per-destination breadcrumb rule. Omit it to get
   * `md3ShowBreadcrumbs(destination)`.
   */
  readonly showBreadcrumbs?: boolean

  /**
   * Overrides the contract's per-destination sync rule. Omit it to get
   * `md3ShowSync(destination)`.
   */
  readonly showSync?: boolean

  /** The active repository's display name, shown in the first breadcrumb. */
  readonly repositoryName: string

  /** The checked-out branch's name, shown in the second breadcrumb. */
  readonly branchName: string

  /**
   * `ahead` paints the primary push affordance and reads "Push · N"; `clean`
   * paints the surface-container-high resting state and reads "Up to date".
   */
  readonly pushState: Md3PushState

  /**
   * How many commits are waiting to be pushed. Rendered inside the `ahead`
   * label; ignored while `pushState` is `clean`.
   */
  readonly aheadCount: number

  /**
   * The running operation's completion, 0–100, or `null` when nothing is in
   * flight. The bar is absent entirely at `null`, exactly as the contract's
   * `progress: this.state.progress > 0` gate does.
   */
  readonly progress: number | null

  /**
   * What is in progress, already localized — "Fetching origin", "Pushing 3
   * commits". It is the progress bar's accessible name and the text announced
   * when the operation starts, so it must describe the operation rather than
   * merely say "Loading".
   */
  readonly progressLabel: string

  /** Whether the repository breadcrumb's menu is open, for `aria-expanded`. */
  readonly repositoryMenuOpen?: boolean

  /** Whether the branch breadcrumb's menu is open, for `aria-expanded`. */
  readonly branchMenuOpen?: boolean

  /** Whether the overflow menu is open, for `aria-expanded`. */
  readonly paneMenuOpen?: boolean

  readonly onOpenRepositoryMenu: () => void

  readonly onOpenBranchMenu: () => void

  readonly onFetch: () => void

  readonly onPush: () => void

  readonly onOpenPaneMenu: () => void

  readonly className?: string
}

/**
 * The pane header, its breadcrumbs, its remote controls and the progress bar
 * that appears beneath it while an operation runs.
 */
export function Md3PaneHeader(props: IMd3PaneHeaderProps) {
  const showBreadcrumbs =
    props.showBreadcrumbs ?? md3ShowBreadcrumbs(props.destination)
  // `no-sync` guards against blocking `*Sync` filesystem calls. This is the
  // contract's own name for whether the remote controls are shown, and reads
  // nothing from disk.
  // eslint-disable-next-line no-sync
  const showSync = props.showSync ?? md3ShowSync(props.destination)
  const isClean = props.pushState === 'clean'

  const pushLabel = isClean
    ? t('md3.paneHeader.upToDate')
    : t('md3.paneHeader.push', { count: String(props.aheadCount) })

  const percent = props.progress === null ? null : clampPercent(props.progress)

  return (
    <>
      <div className={classNames('md3-pane-header', props.className)}>
        <MaterialSymbol
          name={props.icon}
          className="md3-pane-header__icon"
          size={18}
        />
        <span className="md3-pane-header__title">{props.title}</span>
        {showBreadcrumbs ? (
          <>
            <MaterialSymbol
              name="chevron_right"
              className="md3-pane-header__separator"
              size={16}
            />
            {/*
              The two crumbs share their block class and are told apart by a
              modifier, which is what the palette's teleport selects on. Their
              accessible names are localized and would make a selector that
              stops matching the moment the language mode changes.
            */}
            <button
              type="button"
              className="md3-pane-header__crumb md3-pane-header__crumb--repository"
              aria-label={t('md3.paneHeader.repository', {
                name: props.repositoryName,
              })}
              aria-haspopup="menu"
              aria-expanded={props.repositoryMenuOpen ?? false}
              onClick={props.onOpenRepositoryMenu}
            >
              <span className="md3-pane-header__crumb-label">
                {props.repositoryName}
              </span>
              <MaterialSymbol
                name="expand_more"
                className="md3-pane-header__crumb-chevron"
                size={16}
              />
            </button>
            <button
              type="button"
              className="md3-pane-header__crumb md3-pane-header__crumb--branch"
              aria-label={t('md3.paneHeader.branch', {
                name: props.branchName,
              })}
              aria-haspopup="menu"
              aria-expanded={props.branchMenuOpen ?? false}
              onClick={props.onOpenBranchMenu}
            >
              <MaterialSymbol
                name="merge_type"
                className="md3-pane-header__crumb-branch-icon"
                size={15}
              />
              <span className="md3-pane-header__crumb-label">
                {props.branchName}
              </span>
              <MaterialSymbol
                name="expand_more"
                className="md3-pane-header__crumb-chevron"
                size={16}
              />
            </button>
          </>
        ) : null}
        <div className="md3-pane-header__spacer" />
        {showSync ? (
          <>
            <Md3IconButton
              className="md3-pane-header__fetch"
              icon="sync"
              iconSize={18}
              label={t('md3.paneHeader.fetch')}
              onClick={props.onFetch}
            />
            <button
              type="button"
              className={classNames('md3-pane-header__push', {
                'md3-pane-header__push--clean': isClean,
              })}
              onClick={props.onPush}
            >
              <MaterialSymbol
                name={isClean ? 'check' : 'arrow_upward'}
                size={16}
              />
              <span>{pushLabel}</span>
            </button>
          </>
        ) : null}
        <Md3IconButton
          className="md3-pane-header__menu"
          icon="more_vert"
          iconSize={18}
          label={t('md3.paneHeader.moreActions')}
          hasPopup="menu"
          expanded={props.paneMenuOpen ?? false}
          onClick={props.onOpenPaneMenu}
        />
      </div>
      {percent === null ? null : (
        <div
          className="md3-pane-header__progress"
          role="progressbar"
          aria-label={props.progressLabel}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={t('md3.paneHeader.progress', {
            operation: props.progressLabel,
            percent: String(Math.round(percent)),
          })}
        >
          <div
            className="md3-pane-header__progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {/*
       * A progressbar's value changes are only announced to a screen reader
       * that is already on the control, so a user who cannot see the bar would
       * otherwise get no signal that the pane is busy at all. This region is
       * always mounted and empty while idle, so the operation's name is
       * announced exactly once, when it starts.
       */}
      <div className="sr-only" role="status">
        {percent === null ? '' : props.progressLabel}
      </div>
    </>
  )
}
