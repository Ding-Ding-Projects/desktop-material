import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GroupHeader,
  Md3IconButton,
  Md3SearchField,
} from './md3-primitives'
import { formatAddDelete, initials, isGroupStart } from './md3-style-contract'
import {
  IMd3DiffFileTab,
  IMd3DiffPaneProps,
  Md3DiffPane,
} from './md3-diff-pane'

/**
 * The History destination of `design/History MD3.dc.html` — the
 * `<sc-if value="{{ isHistory }}">` branch and everything `renderVals()`
 * computes for it.
 *
 * Two panes. The left one filters and lists commits, grouped by day; the right
 * one is the shared `Md3DiffPane` wearing its `details` toggle, with the commit
 * detail sheet riding over the diff on the contract's `sheetOpen` branch.
 *
 * Every measurement lives in `app/styles/ui/_md3-history-view.scss`, and the
 * diff pane's in `_md3-diff-pane.scss`. What lives here is the behaviour the
 * contract's logic block describes, plus the parts a design prototype does not
 * have to think about and a shipped surface does:
 *
 *  - the commit list is a real grid with roving focus, so a keyboard user
 *    moves through commits with the arrow keys rather than tabbing through
 *    three controls per row, and the pin and overflow buttons of the focused
 *    row are the only ones in the tab order;
 *  - selection is a real multi-selection — click, Ctrl-click, Shift-click and
 *    Shift+Arrow — because the surface this replaces has one and nothing in
 *    the rewrite may take a capability away;
 *  - the detail sheet is a real dialog: it traps focus, closes on Escape, and
 *    hands focus back to whatever opened it;
 *  - the contract's `title` hints are rendered through the repository's own
 *    `Tooltip` (by way of `Md3IconButton`), because a `title` attribute is
 *    unreachable by keyboard.
 *
 * This component owns no application state. Everything it renders arrives as
 * props and every change leaves through a callback, so the same view can be
 * driven by the app store, by a test, or by `md3-history-view-fixtures.ts`.
 */

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** The four filter chips of the contract's `historyChips` state. */
export type Md3HistoryFilterId = 'unpushed' | 'tagged' | 'mine' | 'merges'

/** How a commit's signature and merge state read on the row's detail line. */
export type Md3CommitKind = 'merge' | 'verified' | 'unverified'

/** One commit in the left-hand list. */
export interface IMd3HistoryCommit {
  /** The short SHA the byline and the detail sheet render. Also the row key. */
  readonly sha: string

  /** The first line of the commit message. */
  readonly summary: string

  /** The rest of the commit message, shown in the detail sheet. */
  readonly body: string

  /** The author's display name; the avatar shows its initials. */
  readonly author: string

  /** "12 minutes ago" — used while `showAbsoluteDates` is off. */
  readonly relativeTime: string

  /** "10 Aug 2026, 09:41" — used while `showAbsoluteDates` is on. */
  readonly absoluteTime: string

  /** The uppercase group header this commit sits under, e.g. "Today". */
  readonly day: string

  /** The tag pill's text, or null for an untagged commit. */
  readonly tag: string | null

  /** Whether the commit has not reached the remote yet. */
  readonly unpushed: boolean

  /** Whether the signed-in user authored it — the "Mine" chip's predicate. */
  readonly isMine: boolean

  /** Whether the user has pinned it. */
  readonly pinned: boolean

  /**
   * How the third segment of the detail line reads: the contract's
   * `merge ? 'merge commit' : 'verified'`, with `unverified` added so a commit
   * whose signature did not check out is not described as one that did.
   */
  readonly kind: Md3CommitKind

  readonly addedLineCount: number

  readonly deletedLineCount: number

  /** How many files the commit touched — the detail line's "N files". */
  readonly changedFileCount: number

  /** The branch the commit is on — the detail line's last segment. */
  readonly branchName: string
}

export interface IMd3HistoryViewProps {
  // -- the commit list ------------------------------------------------------

  /**
   * The commits to list, newest first, already ordered and grouped by the
   * shell. Filtering by the search field and by the chips happens here;
   * ordering, grouping and paging do not.
   */
  readonly commits: ReadonlyArray<IMd3HistoryCommit>

  /**
   * The selected commits. The first entry is the primary selection — the one
   * the diff pane and the detail sheet describe. Empty is a legitimate state.
   */
  readonly selectedShas: ReadonlyArray<string>

  readonly onSelectionChanged: (shas: ReadonlyArray<string>) => void

  readonly filterText: string

  readonly filterRegexEnabled: boolean

  readonly onFilterTextChanged: (value: string) => void

  readonly onFilterRegexToggled: () => void

  /** Open the anchored regex builder for the commit filter field. */
  readonly onOpenFilterRegexBuilder: (pattern: string) => void

  /** The commit filter's own context menu — the contract's `searchMenu`. */
  readonly onFilterContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  readonly activeFilters: ReadonlyArray<Md3HistoryFilterId>

  readonly onFiltersChanged: (
    filters: ReadonlyArray<Md3HistoryFilterId>
  ) => void

  /** The contract's `graph` toggle, also reachable from the list menu. */
  readonly showCommitGraph: boolean

  readonly onShowCommitGraphChanged: (value: boolean) => void

  /** The contract's `absoluteDates` toggle, also in the settings menu. */
  readonly showAbsoluteDates: boolean

  readonly onShowAbsoluteDatesChanged: (value: boolean) => void

  // -- the diff pane --------------------------------------------------------

  /**
   * Everything the shared diff pane needs. `action`, `fileMenuLabel` and
   * `children` are supplied by this view — the contract fixes History's second
   * toolbar control to the Details toggle and hangs the commit detail sheet
   * off the pane — so the shell cannot accidentally hand History the Changes
   * pane's "Include hunk" button.
   *
   * `fileTabs` doubles as the detail sheet's file list, so the two can never
   * disagree about which files the commit touched.
   */
  readonly diff: Omit<
    IMd3DiffPaneProps,
    'action' | 'fileMenuLabel' | 'children'
  >

  // -- the commit detail sheet ----------------------------------------------

  /** The contract's `sheetOpen`. */
  readonly detailsOpen: boolean

  readonly onDetailsOpenChanged: (open: boolean) => void

  // -- menus and commands ---------------------------------------------------

  /** The `sort` button: the contract's `listMenu`. */
  readonly onOpenListMenu: (event: React.SyntheticEvent) => void

  /**
   * The per-commit `rowMenu`: revert, cherry-pick, tag, reset, copy SHA, view
   * on GitHub, amend, undo, checkout, reorder, squash — everything the commit
   * context menu this view replaces offers. Raised by the row's `more_vert`
   * button, by right-clicking a row, and by the detail sheet's own `more_vert`.
   */
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void

  /**
   * The `fileMenu` for one file of the commit, raised by right-clicking an
   * entry in the detail sheet's file list. The pane's own toolbar overflow
   * arrives through `diff.onOpenFileMenu`.
   */
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void

  // -- direct actions -------------------------------------------------------

  readonly onTogglePin: (sha: string) => void

  readonly onCopySha: (sha: string) => void

  readonly onViewOnGitHub: (sha: string) => void

  readonly onRevertCommit: (sha: string) => void

  /**
   * Begin dragging the current selection, so the shell can keep the existing
   * drag-a-commit-onto-a-branch cherry-pick gesture working. Omit it and the
   * rows are not draggable at all.
   */
  readonly onCommitDragStart?: (
    shas: ReadonlyArray<string>,
    event: React.DragEvent<HTMLElement>
  ) => void
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type FilterChipKey =
  | 'md3.history.chip.unpushed'
  | 'md3.history.chip.tagged'
  | 'md3.history.chip.mine'
  | 'md3.history.chip.merges'

/** The chips, in the contract's order, paired with their localized labels. */
const FilterChips: ReadonlyArray<{
  readonly id: Md3HistoryFilterId
  readonly key: FilterChipKey
}> = [
  { id: 'unpushed', key: 'md3.history.chip.unpushed' },
  { id: 'tagged', key: 'md3.history.chip.tagged' },
  { id: 'mine', key: 'md3.history.chip.mine' },
  { id: 'merges', key: 'md3.history.chip.merges' },
]

/** How long the copied SHA shows `check` before flipping back. */
const CopiedFlipDuration = 1400

/** How far PageUp and PageDown move through the commit list. */
const PageStep = 10

/**
 * The contract's `matcher(key)`: a plain case-insensitive substring test, or a
 * case-insensitive regular expression when the field's regex mode is on.
 *
 * An invalid pattern matches everything rather than nothing, exactly as the
 * contract's `catch` does — a half-typed expression must not blank the list out
 * from under someone who is still typing it.
 */
export function createMd3HistoryMatcher(
  query: string,
  regexEnabled: boolean
): (value: string) => boolean {
  const raw = query.trim()

  if (raw.length === 0) {
    return () => true
  }

  if (regexEnabled) {
    let expression: RegExp

    try {
      expression = new RegExp(raw, 'i')
    } catch {
      return () => true
    }

    return value => expression.test(value)
  }

  const lowered = raw.toLowerCase()
  return value => value.toLowerCase().includes(lowered)
}

/**
 * The contract's `commitRows` filter: the query is tested against the summary,
 * the author and the SHA, and each active chip narrows further.
 */
export function filterMd3HistoryCommits(
  commits: ReadonlyArray<IMd3HistoryCommit>,
  matches: (value: string) => boolean,
  activeFilters: ReadonlyArray<Md3HistoryFilterId>
): ReadonlyArray<IMd3HistoryCommit> {
  return commits.filter(commit => {
    if (
      !(
        matches(commit.summary) ||
        matches(commit.author) ||
        matches(commit.sha)
      )
    ) {
      return false
    }

    if (activeFilters.includes('unpushed') && !commit.unpushed) {
      return false
    }

    if (activeFilters.includes('tagged') && commit.tag === null) {
      return false
    }

    if (activeFilters.includes('merges') && commit.kind !== 'merge') {
      return false
    }

    if (activeFilters.includes('mine') && !commit.isMine) {
      return false
    }

    return true
  })
}

/** The contract's commit-row detail line. */
export function formatMd3CommitDetail(commit: IMd3HistoryCommit): string {
  const kind =
    commit.kind === 'merge'
      ? t('md3.history.kind.merge')
      : commit.kind === 'verified'
      ? t('md3.history.kind.verified')
      : t('md3.history.kind.unverified')

  return t('md3.history.detail', {
    stat: formatAddDelete(commit.addedLineCount, commit.deletedLineCount),
    files: String(commit.changedFileCount),
    kind,
    branch: commit.branchName,
  })
}

/** Elements that can hold focus inside the detail sheet. */
const FocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableWithin(panel: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FocusableSelector)
  ).filter(element => element.getClientRects().length > 0)
}

// ---------------------------------------------------------------------------
// One commit row
// ---------------------------------------------------------------------------

interface IMd3HistoryRowProps {
  readonly commit: IMd3HistoryCommit
  readonly selected: boolean
  readonly focused: boolean
  readonly showGraph: boolean
  readonly showAbsoluteDates: boolean
  readonly rowIndex: number
  readonly draggable: boolean
  readonly onActivate: (sha: string, event: React.MouseEvent) => void
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void
  readonly onTogglePin: (sha: string) => void
  readonly onDragStart: (
    sha: string,
    event: React.DragEvent<HTMLElement>
  ) => void
  readonly rowRef: (sha: string, element: HTMLDivElement | null) => void
}

const Md3HistoryRow = React.memo(function Md3HistoryRow(
  props: IMd3HistoryRowProps
) {
  const {
    commit,
    selected,
    focused,
    draggable,
    onActivate,
    onOpenRowMenu,
    onTogglePin,
    onDragStart,
    rowRef,
  } = props

  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => rowRef(commit.sha, element),
    [rowRef, commit.sha]
  )

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => onActivate(commit.sha, event),
    [onActivate, commit.sha]
  )

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onOpenRowMenu(commit.sha, event)
    },
    [onOpenRowMenu, commit.sha]
  )

  const onMenuClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenRowMenu(commit.sha, event)
    },
    [onOpenRowMenu, commit.sha]
  )

  const onPinClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onTogglePin(commit.sha)
    },
    [onTogglePin, commit.sha]
  )

  const onRowDragStart = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDragStart(commit.sha, event),
    [onDragStart, commit.sha]
  )

  const time = props.showAbsoluteDates
    ? commit.absoluteTime
    : commit.relativeTime

  // Only the focused row's own controls are tab stops; the grid itself is the
  // single stop that gets a keyboard user into and back out of the list.
  const tabIndex = focused ? 0 : -1

  return (
    <div
      ref={setRef}
      role="row"
      aria-rowindex={props.rowIndex}
      aria-selected={selected}
      data-sha={commit.sha}
      tabIndex={tabIndex}
      draggable={draggable}
      className={classNames('md3-row', 'md3-history__row', {
        'md3-row--active': selected,
        'md3-row--spined': props.showGraph,
      })}
      onClick={onClick}
      onKeyDown={props.onKeyDown}
      onContextMenu={onContextMenu}
      onDragStart={draggable ? onRowDragStart : undefined}
    >
      <div role="gridcell" className="md3-history__row-cell">
        {props.showGraph ? (
          <span
            aria-hidden={true}
            className={classNames('md3-history__spine', {
              'md3-history__spine--selected': selected,
              'md3-history__spine--unpushed': !selected && commit.unpushed,
            })}
          />
        ) : null}

        <span
          aria-hidden={true}
          className={classNames('md3-history__avatar', {
            'md3-history__avatar--selected': selected,
          })}
        >
          {initials(commit.author)}
        </span>

        <span className="md3-history__row-text">
          <span
            className={classNames('md3-row__name', {
              'md3-row__name--active': selected,
            })}
          >
            {commit.summary}
          </span>
          <span className="md3-history__byline">
            <span className="md3-history__byline-text">
              {t('md3.history.byline', { author: commit.author, time })}
            </span>
            <span className="md3-history__sha">{commit.sha}</span>
          </span>
          <span className="md3-row__detail md3-row__detail--inline">
            {formatMd3CommitDetail(commit)}
          </span>
        </span>

        {commit.tag === null ? null : (
          <span className="md3-history__tag">
            <MaterialSymbol name="sell" size={12} />
            <span>{commit.tag}</span>
          </span>
        )}

        {commit.unpushed ? (
          <span
            role="img"
            aria-label={t('md3.history.notPushed')}
            className="md3-history__unpushed"
          >
            <MaterialSymbol name="arrow_upward" size={12} />
          </span>
        ) : null}

        <Md3IconButton
          small={true}
          icon="push_pin"
          tabIndex={tabIndex}
          pressed={commit.pinned}
          className={classNames('md3-history__pin', {
            'md3-history__pin--on': commit.pinned,
          })}
          label={commit.pinned ? t('md3.history.unpin') : t('md3.history.pin')}
          onClick={onPinClick}
        />

        <Md3IconButton
          small={true}
          icon="more_vert"
          tabIndex={tabIndex}
          hasPopup="menu"
          label={t('md3.history.rowMenu', { sha: commit.sha })}
          tooltip={t('md3.history.rowMenuHint')}
          onClick={onMenuClick}
        />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// The commit detail sheet
// ---------------------------------------------------------------------------

interface IMd3CommitDetailSheetProps {
  readonly commit: IMd3HistoryCommit
  readonly files: ReadonlyArray<IMd3DiffFileTab>
  readonly activeFilePath: string | undefined
  readonly showAbsoluteDates: boolean
  readonly onSelectFile: ((path: string) => void) | undefined
  readonly onClose: () => void
  readonly onCopySha: (sha: string) => void
  readonly onViewOnGitHub: (sha: string) => void
  readonly onRevertCommit: (sha: string) => void
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void
}

/**
 * The contract's `sheetOpen` block: a right-anchored sheet over the diff pane,
 * behind a scrim that fills the pane rather than the window.
 *
 * It is a real dialog rather than a decorated panel — focus enters it, cannot
 * leave it by Tab, Escape closes it, and closing returns focus to whatever
 * opened it. Mount it only while it is open; it takes focus on mount.
 */
function Md3CommitDetailSheet(props: IMd3CommitDetailSheetProps) {
  const {
    commit,
    files,
    onClose,
    onCopySha,
    onViewOnGitHub,
    onRevertCommit,
    onOpenRowMenu,
  } = props

  const panelRef = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const titleId = React.useMemo(() => createUniqueId('md3-commit-sheet'), [])

  React.useEffect(() => () => releaseUniqueId(titleId), [titleId])

  const [copied, setCopied] = React.useState(false)

  // The contract flips the SHA chip's glyph to `check` for 1400ms after a copy.
  React.useEffect(() => {
    if (!copied) {
      return
    }

    const timer = window.setTimeout(() => setCopied(false), CopiedFlipDuration)
    return () => window.clearTimeout(timer)
  }, [copied])

  // A different commit's SHA has not been copied, whatever the last one's
  // state was.
  React.useEffect(() => {
    setCopied(false)
  }, [commit.sha])

  // Take focus on open and give it back on close. Without the second half a
  // keyboard user is returned to the top of the document every time the sheet
  // closes, which is nowhere near the Details button they pressed.
  React.useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus()
      }
    }
  }, [closeRef])

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const panel = panelRef.current

      if (panel === null) {
        return
      }

      const focusable = focusableWithin(panel)

      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = panel.contains(active)

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  const onScrimClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only the scrim itself closes the sheet; a click that started inside the
      // panel and bubbled up here must not close it out from under the user.
      if (event.target === event.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const onCopyClick = React.useCallback(() => {
    onCopySha(commit.sha)
    setCopied(true)
  }, [onCopySha, commit.sha])

  const onGitHubClick = React.useCallback(
    () => onViewOnGitHub(commit.sha),
    [onViewOnGitHub, commit.sha]
  )

  const onRevertClick = React.useCallback(
    () => onRevertCommit(commit.sha),
    [onRevertCommit, commit.sha]
  )

  const onMenuClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) =>
      onOpenRowMenu(commit.sha, event),
    [onOpenRowMenu, commit.sha]
  )

  const time = props.showAbsoluteDates
    ? commit.absoluteTime
    : commit.relativeTime

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the
       scrim's click is a pointer shortcut for the close button and Escape,
       both of which are present and both of which are keyboard reachable. */
    <div
      className="md3-history__sheet-scrim md3-anim-fade"
      onClick={onScrimClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        className="md3-history__sheet md3-anim-sheet"
      >
        <div className="md3-history__sheet-header">
          <span aria-hidden={true} className="md3-history__sheet-avatar">
            {initials(commit.author)}
          </span>
          <span className="md3-history__sheet-heading">
            <span id={titleId} className="md3-history__sheet-summary">
              {commit.summary}
            </span>
            <span className="md3-history__sheet-byline">
              {t('md3.history.sheet.byline', { author: commit.author, time })}
            </span>
          </span>
          <Md3IconButton
            small={true}
            icon="close"
            iconSize={16}
            buttonRef={closeRef}
            label={t('md3.history.sheet.close')}
            onClick={onClose}
          />
        </div>

        <div className="md3-history__sheet-stats">
          <button
            type="button"
            className="md3-history__sheet-sha"
            aria-label={t('md3.history.sheet.copySha', { sha: commit.sha })}
            onClick={onCopyClick}
          >
            <span>{commit.sha}</span>
            <MaterialSymbol
              name={copied ? 'check' : 'content_copy'}
              size={13}
            />
          </button>
          <span className="md3-history__sheet-pill md3-history__sheet-pill--add">
            {`+${commit.addedLineCount}`}
          </span>
          <span className="md3-history__sheet-pill md3-history__sheet-pill--del">
            {`−${commit.deletedLineCount}`}
          </span>
          <span className="md3-history__sheet-pill md3-history__sheet-pill--files">
            {t('md3.history.sheet.fileCount', { count: String(files.length) })}
          </span>
        </div>

        {commit.body.length === 0 ? null : (
          <div className="md3-history__sheet-body">{commit.body}</div>
        )}

        <div
          role="list"
          aria-label={t('md3.history.sheet.fileListLabel')}
          className="md3-history__sheet-files"
        >
          {files.map(file => (
            <Md3SheetFileRow
              key={file.path}
              file={file}
              active={file.path === props.activeFilePath}
              onSelect={props.onSelectFile}
              onOpenFileMenu={props.onOpenFileMenu}
            />
          ))}
        </div>

        <div className="md3-history__sheet-footer">
          <button
            type="button"
            className="md3-history__sheet-primary"
            onClick={onGitHubClick}
          >
            <MaterialSymbol name="open_in_new" size={15} />
            <span>{t('md3.history.sheet.viewOnGitHub')}</span>
          </button>
          <button
            type="button"
            className="md3-history__sheet-action"
            aria-label={t('md3.history.sheet.revert')}
            onClick={onRevertClick}
          >
            <MaterialSymbol name="undo" size={16} />
          </button>
          <button
            type="button"
            className="md3-history__sheet-action"
            aria-haspopup="menu"
            aria-label={t('md3.history.sheet.menu')}
            onClick={onMenuClick}
          >
            <MaterialSymbol name="more_vert" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

interface IMd3SheetFileRowProps {
  readonly file: IMd3DiffFileTab
  readonly active: boolean
  readonly onSelect: ((path: string) => void) | undefined
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void
}

function Md3SheetFileRow(props: IMd3SheetFileRowProps) {
  const { file, onSelect, onOpenFileMenu } = props

  const onClick = React.useCallback(
    () => onSelect?.(file.path),
    [onSelect, file.path]
  )

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onOpenFileMenu(file.path, event)
    },
    [onOpenFileMenu, file.path]
  )

  return (
    <div role="listitem" className="md3-history__sheet-file-item">
      <button
        type="button"
        className={classNames('md3-history__sheet-file', {
          'md3-history__sheet-file--active': props.active,
        })}
        aria-current={props.active}
        aria-label={t('md3.history.sheet.fileEntry', {
          path: file.path,
          stat: formatAddDelete(file.addedLineCount, file.deletedLineCount),
        })}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <MaterialSymbol
          name={file.kind === 'new' ? 'add_circle' : 'edit_square'}
          size={14}
          className={classNames('md3-history__file-icon', {
            'md3-history__file-icon--new': file.kind === 'new',
          })}
        />
        <span className="md3-history__sheet-file-path">{file.path}</span>
        <span className="md3-history__sheet-file-add">
          {`+${file.addedLineCount}`}
        </span>
        <span className="md3-history__sheet-file-del">
          {`−${file.deletedLineCount}`}
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function Md3HistoryView(props: IMd3HistoryViewProps) {
  const {
    commits,
    selectedShas,
    onSelectionChanged,
    filterText,
    filterRegexEnabled,
    onFilterTextChanged,
    onFilterRegexToggled,
    onOpenFilterRegexBuilder,
    activeFilters,
    onFiltersChanged,
    showCommitGraph,
    onShowCommitGraphChanged,
    showAbsoluteDates,
    onShowAbsoluteDatesChanged,
    diff,
    detailsOpen,
    onDetailsOpenChanged,
    onOpenRowMenu,
    onOpenFileMenu,
    onCommitDragStart,
  } = props

  // -- filtering ------------------------------------------------------------

  const commitMatches = React.useMemo(
    () => createMd3HistoryMatcher(filterText, filterRegexEnabled),
    [filterText, filterRegexEnabled]
  )

  const visibleCommits = React.useMemo(
    () => filterMd3HistoryCommits(commits, commitMatches, activeFilters),
    [commits, commitMatches, activeFilters]
  )

  const primaryCommit = React.useMemo(() => {
    const sha = selectedShas[0]
    return sha === undefined
      ? undefined
      : commits.find(commit => commit.sha === sha)
  }, [commits, selectedShas])

  // -- selection and roving focus ------------------------------------------

  const [focusedSha, setFocusedSha] = React.useState<string | null>(null)
  const anchorSha = React.useRef<string | null>(null)
  const rowElements = React.useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = React.useRef<string | null>(null)

  const registerRow = React.useCallback(
    (sha: string, element: HTMLDivElement | null) => {
      if (element === null) {
        rowElements.current.delete(sha)
      } else {
        rowElements.current.set(sha, element)
      }
    },
    []
  )

  // The row that owns the tab stop has to exist. When a filter removes it, fall
  // back to the selection and then to the first visible row, rather than
  // leaving the list with no way in from the keyboard at all.
  const effectiveFocusedSha = React.useMemo(() => {
    const shas = visibleCommits.map(commit => commit.sha)

    if (focusedSha !== null && shas.includes(focusedSha)) {
      return focusedSha
    }

    return selectedShas.find(sha => shas.includes(sha)) ?? shas[0] ?? null
  }, [visibleCommits, focusedSha, selectedShas])

  React.useLayoutEffect(() => {
    const sha = pendingFocus.current

    if (sha === null) {
      return
    }

    pendingFocus.current = null
    const element = rowElements.current.get(sha)
    element?.focus()
    element?.scrollIntoView({ block: 'nearest' })
  })

  const moveFocus = React.useCallback(
    (sha: string, extendSelection: boolean, keepSelection: boolean) => {
      setFocusedSha(sha)
      pendingFocus.current = sha

      if (keepSelection) {
        return
      }

      if (extendSelection) {
        const shas = visibleCommits.map(commit => commit.sha)
        const anchor = anchorSha.current ?? sha
        const from = shas.indexOf(anchor)
        const to = shas.indexOf(sha)

        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from]
          const range = shas.slice(start, end + 1)
          // The anchor stays first, and therefore stays the primary selection,
          // so the diff pane does not jump about while a range is extended.
          onSelectionChanged(from <= to ? range : [...range].reverse())
          return
        }
      }

      anchorSha.current = sha
      onSelectionChanged([sha])
    },
    [visibleCommits, onSelectionChanged]
  )

  const onRowActivate = React.useCallback(
    (sha: string, event: React.MouseEvent) => {
      setFocusedSha(sha)

      if (event.shiftKey) {
        moveFocus(sha, true, false)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        anchorSha.current = sha
        onSelectionChanged(
          selectedShas.includes(sha)
            ? selectedShas.filter(existing => existing !== sha)
            : [...selectedShas, sha]
        )
        return
      }

      anchorSha.current = sha
      onSelectionChanged([sha])
    },
    [moveFocus, onSelectionChanged, selectedShas]
  )

  const onListKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const shas = visibleCommits.map(commit => commit.sha)

      if (shas.length === 0) {
        return
      }

      const current =
        effectiveFocusedSha === null ? -1 : shas.indexOf(effectiveFocusedSha)

      let next = -1

      switch (event.key) {
        case 'ArrowDown':
          next = Math.min(shas.length - 1, current + 1)
          break
        case 'ArrowUp':
          next = Math.max(0, current - 1)
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = shas.length - 1
          break
        case 'PageDown':
          next = Math.min(shas.length - 1, current + PageStep)
          break
        case 'PageUp':
          next = Math.max(0, current - PageStep)
          break
        case 'Enter':
        case ' ':
          // Only when the row itself has focus. Inside it sit the pin toggle
          // and the overflow button, and both are activated by exactly these
          // two keys — swallowing them here would leave a keyboard user with a
          // pin button that cannot be pressed.
          if (
            effectiveFocusedSha !== null &&
            event.target === event.currentTarget
          ) {
            event.preventDefault()
            anchorSha.current = effectiveFocusedSha
            onSelectionChanged([effectiveFocusedSha])
          }
          return
        default:
          return
      }

      event.preventDefault()

      if (next === -1 || next === current) {
        return
      }

      moveFocus(shas[next], event.shiftKey, event.ctrlKey || event.metaKey)
    },
    [visibleCommits, effectiveFocusedSha, moveFocus, onSelectionChanged]
  )

  const onRowDragStart = React.useCallback(
    (sha: string, event: React.DragEvent<HTMLElement>) => {
      onCommitDragStart?.(
        selectedShas.includes(sha) ? selectedShas : [sha],
        event
      )
    },
    [onCommitDragStart, selectedShas]
  )

  // -- chips and toggles ----------------------------------------------------

  const onToggleFilter = React.useCallback(
    (id: Md3HistoryFilterId) => {
      onFiltersChanged(
        activeFilters.includes(id)
          ? activeFilters.filter(existing => existing !== id)
          : [...activeFilters, id]
      )
    },
    [activeFilters, onFiltersChanged]
  )

  const onResetFilters = React.useCallback(() => {
    onFiltersChanged([])
    onFilterTextChanged('')
  }, [onFiltersChanged, onFilterTextChanged])

  const onToggleGraph = React.useCallback(
    () => onShowCommitGraphChanged(!showCommitGraph),
    [onShowCommitGraphChanged, showCommitGraph]
  )

  const onToggleDates = React.useCallback(
    () => onShowAbsoluteDatesChanged(!showAbsoluteDates),
    [onShowAbsoluteDatesChanged, showAbsoluteDates]
  )

  const onClearFilterText = React.useCallback(
    () => onFilterTextChanged(''),
    [onFilterTextChanged]
  )

  const onOpenBuilder = React.useCallback(
    () => onOpenFilterRegexBuilder(filterText),
    [onOpenFilterRegexBuilder, filterText]
  )

  // -- the detail sheet -----------------------------------------------------

  const onToggleDetails = React.useCallback(
    () => onDetailsOpenChanged(!detailsOpen),
    [onDetailsOpenChanged, detailsOpen]
  )

  const onCloseDetails = React.useCallback(
    () => onDetailsOpenChanged(false),
    [onDetailsOpenChanged]
  )

  const sheetOpen = detailsOpen && primaryCommit !== undefined

  // -- render ---------------------------------------------------------------

  let rowIndex = 0
  let previousDay: string | undefined

  return (
    <div className="md3-history md3-anim-up">
      <div className="md3-history__list-pane">
        <Md3SearchField
          id="md3-history-filter"
          searchSurfaceId="md3-history"
          value={filterText}
          placeholder={t('md3.history.filterPlaceholder')}
          fieldLabel={t('md3.history.fieldLabel')}
          regexEnabled={filterRegexEnabled}
          onChange={onFilterTextChanged}
          onClear={onClearFilterText}
          onToggleRegex={onFilterRegexToggled}
          onOpenBuilder={onOpenBuilder}
          onContextMenu={props.onFilterContextMenu}
        />

        <Md3ChipRow label={t('md3.history.chipRowLabel')}>
          {FilterChips.map(chip => (
            <Md3HistoryFilterChip
              key={chip.id}
              id={chip.id}
              label={t(chip.key)}
              active={activeFilters.includes(chip.id)}
              onToggle={onToggleFilter}
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3IconButton
            small={true}
            icon="account_tree"
            label={t('md3.history.toggleGraph')}
            active={showCommitGraph}
            pressed={showCommitGraph}
            onClick={onToggleGraph}
          />
          <Md3IconButton
            small={true}
            icon="schedule"
            label={t('md3.history.toggleDates')}
            active={showAbsoluteDates}
            pressed={showAbsoluteDates}
            onClick={onToggleDates}
          />
          <Md3IconButton
            small={true}
            icon="sort"
            hasPopup="menu"
            label={t('md3.history.sortAndGroup')}
            onClick={props.onOpenListMenu}
          />
        </Md3ChipRow>

        <div className="md3-history__list-scroller">
          <div
            role="grid"
            aria-label={t('md3.history.listLabel')}
            aria-multiselectable={true}
            aria-rowcount={visibleCommits.length}
            className="md3-history__list"
          >
            {visibleCommits.map(commit => {
              const header = isGroupStart(previousDay, commit.day)
              previousDay = commit.day
              rowIndex += 1

              return (
                <React.Fragment key={commit.sha}>
                  {header ? (
                    <div role="row" className="md3-history__group-row">
                      <div role="gridcell">
                        <Md3GroupHeader label={commit.day} />
                      </div>
                    </div>
                  ) : null}
                  <Md3HistoryRow
                    commit={commit}
                    rowIndex={rowIndex}
                    selected={selectedShas.includes(commit.sha)}
                    focused={commit.sha === effectiveFocusedSha}
                    showGraph={showCommitGraph}
                    showAbsoluteDates={showAbsoluteDates}
                    draggable={onCommitDragStart !== undefined}
                    onActivate={onRowActivate}
                    onKeyDown={onListKeyDown}
                    onOpenRowMenu={onOpenRowMenu}
                    onTogglePin={props.onTogglePin}
                    onDragStart={onRowDragStart}
                    rowRef={registerRow}
                  />
                </React.Fragment>
              )
            })}
          </div>

          {visibleCommits.length === 0 ? (
            <Md3EmptyState
              message={t('md3.history.empty')}
              onAction={onResetFilters}
            />
          ) : null}
        </div>
      </div>

      <Md3DiffPane
        {...diff}
        fileMenuLabel={t('md3.history.fileMenu')}
        action={{
          kind: 'details',
          expanded: sheetOpen,
          onToggle: onToggleDetails,
        }}
      >
        {sheetOpen && primaryCommit !== undefined ? (
          <Md3CommitDetailSheet
            commit={primaryCommit}
            files={diff.fileTabs ?? []}
            activeFilePath={diff.activeFileTabPath}
            showAbsoluteDates={showAbsoluteDates}
            onSelectFile={diff.onSelectFileTab}
            onClose={onCloseDetails}
            onCopySha={props.onCopySha}
            onViewOnGitHub={props.onViewOnGitHub}
            onRevertCommit={props.onRevertCommit}
            onOpenRowMenu={onOpenRowMenu}
            onOpenFileMenu={onOpenFileMenu}
          />
        ) : null}
      </Md3DiffPane>
    </div>
  )
}

interface IMd3HistoryFilterChipProps {
  readonly id: Md3HistoryFilterId
  readonly label: string
  readonly active: boolean
  readonly onToggle: (id: Md3HistoryFilterId) => void
}

/**
 * `Md3Chip` reports its own visible label back on toggle; the view needs the
 * stable id instead, because the label is localized and changes with the
 * language mode.
 */
function Md3HistoryFilterChip(props: IMd3HistoryFilterChipProps) {
  const { id, onToggle } = props
  const onChipToggle = React.useCallback(() => onToggle(id), [onToggle, id])

  return (
    <Md3Chip
      label={props.label}
      active={props.active}
      onToggle={onChipToggle}
    />
  )
}
