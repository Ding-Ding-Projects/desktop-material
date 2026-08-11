import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GhostButton,
  Md3IconButton,
  Md3SearchField,
} from './md3-primitives'
import { formatAddDelete, statusTone } from './md3-style-contract'
import { Md3DiffPane, IMd3DiffPaneProps } from './md3-diff-pane'
import {
  useMd3MeasuredRowHeight,
  useMd3VirtualWindow,
} from './md3-virtual-window'

/**
 * The Changes destination of the MD3 shell contract
 * (`design/History MD3.dc.html`, the `isChanges` branch).
 *
 * A fixed 356px column holding the changed-file filter, the tri-state
 * include-all toggle, the file list and the commit composer pinned to its
 * foot, beside the shared diff pane.
 *
 * The measurements live in `app/styles/ui/_md3-changes-view.scss`; the diff
 * pane is `md3-diff-pane.tsx`, shared verbatim with History.
 *
 * Three things the contract's prototype does not draw, kept here because the
 * surface this replaces already had them and no feature may be lost in the
 * rewrite:
 *
 *  - **The filter chips.** The existing changes list filters by inclusion
 *    state and by file status. They render between the include-all toggle and
 *    the trailing overflow, so the contract's leading and trailing controls sit
 *    exactly where it puts them.
 *  - **Multi-selection.** Ctrl/Cmd-click adds to the selection and Shift-click
 *    extends it, which is what makes the existing bulk context-menu commands
 *    ("Include selected files", "Copy selected paths", ignoring several files
 *    at once) reachable at all.
 *  - **The native context menu.** Right-clicking a row, or the list itself,
 *    raises the host's own menu through `onFileContextMenu` /
 *    `onListContextMenu`. The contract's `changeRowMenu` and `changesMenu`
 *    overlays are the styled front door; the native menu is where discard,
 *    stash, ignore-folder, copy-relative-path, reveal, open-with and the Cheap
 *    LFS commands continue to live.
 *
 * The component owns no state beyond keyboard focus. Every value it renders
 * arrives as a prop and every change leaves as a callback, so the shell keeps
 * being the single place that knows what the working tree actually holds.
 */

/** A file's status letter, as the contract's `statusTone()` keys them. */
export type Md3ChangeStatus = 'A' | 'M' | 'D'

export interface IMd3ChangedFile {
  /** Repository-relative path. Unique, and used as the React key. */
  readonly path: string

  readonly status: Md3ChangeStatus

  /** Whether the file is included in the next commit. */
  readonly included: boolean

  /**
   * Whether only some of the file's hunks are included. The contract's row
   * checkbox is binary; partial selection is an existing capability of this
   * surface, so it renders the third glyph and reports `aria-checked="mixed"`
   * rather than rounding to one of the other two.
   */
  readonly partiallyIncluded?: boolean

  readonly addedLineCount: number

  readonly deletedLineCount: number
}

/** One filter chip in the row beneath the search field. */
export interface IMd3ChangesFilterChip {
  /** Unique within the row. */
  readonly id: string

  readonly label: string

  readonly active: boolean

  readonly onToggle: () => void
}

export interface IMd3ChangesViewProps {
  // -- the file list ------------------------------------------------------

  /** Every changed file that survives the current query and filters. */
  readonly files: ReadonlyArray<IMd3ChangedFile>

  /**
   * How many changed files the working tree holds in total, before the query
   * and the filters. The include-all label counts the whole tree, not the
   * filtered view, so a filtered list can never report a commit as smaller
   * than it is.
   */
  readonly totalFileCount: number

  /** How many of those are included in the next commit. */
  readonly includedFileCount: number

  /** The paths currently selected. The first drives the diff pane. */
  readonly selectedPaths: ReadonlyArray<string>

  readonly onSelectionChanged: (paths: ReadonlyArray<string>) => void

  /** Include or exclude one file. */
  readonly onIncludeChanged: (path: string, included: boolean) => void

  /** The tri-state toggle: include everything, or exclude everything. */
  readonly onIncludeAllChanged: (included: boolean) => void

  /** The contract's `changeRowMenu`. */
  readonly onOpenRowMenu: (
    path: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void

  /** The host's own context menu for a file, with the full command set. */
  readonly onFileContextMenu: (
    path: string,
    event: React.MouseEvent<HTMLElement>
  ) => void

  /** The contract's `changesMenu` — discard, ignore, stash, group by folder. */
  readonly onOpenChangesMenu: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void

  /** The host's own context menu for the list as a whole. */
  readonly onListContextMenu?: (event: React.MouseEvent<HTMLElement>) => void

  // -- the filter ---------------------------------------------------------

  readonly searchValue: string

  readonly searchRegexEnabled: boolean

  readonly onSearchChange: (value: string) => void

  readonly onSearchClear: () => void

  readonly onToggleSearchRegex: () => void

  readonly onOpenSearchBuilder: () => void

  readonly onSearchContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  /** Inclusion and status filters. Omitted renders no chips. */
  readonly filterChips?: ReadonlyArray<IMd3ChangesFilterChip>

  /** Clears the query and every filter, from the empty state. */
  readonly onResetFilters?: () => void

  // -- the composer -------------------------------------------------------

  /** The committing account's initials, for the composer avatar. */
  readonly authorInitials: string

  /** The committing account's name, which names the avatar. */
  readonly authorName: string

  readonly commitSummary: string

  readonly commitDescription: string

  readonly onCommitSummaryChanged: (summary: string) => void

  readonly onCommitDescriptionChanged: (description: string) => void

  /** The branch the commit lands on, named by the commit button. */
  readonly branchName: string

  /**
   * Replaces "Commit to {branch}" — for amending, or for committing onto a
   * detached HEAD, where naming a branch would be a lie.
   */
  readonly commitButtonLabel?: string

  /** Commit. Only called once there is a non-blank summary. */
  readonly onCommit: () => void

  /** Commit and push. Only called once there is a non-blank summary. */
  readonly onCommitAndPush: () => void

  /**
   * Open the full composer dialog.
   *
   * Committing with an empty summary opens it rather than doing nothing, which
   * is what the contract does: a button that silently refuses is a button the
   * user presses twice and then reports as broken. `push` carries whether it
   * was the one-click commit-and-push that was pressed, so the dialog can arm
   * the matching action.
   */
  readonly onOpenComposer: (push: boolean) => void

  readonly onDraftWithCopilot: () => void

  readonly onAddCoAuthors: () => void

  /** Disables both commit actions — mid-commit, mid-rebase, or read-only. */
  readonly commitDisabled?: boolean

  /**
   * Rendered between the file list and the composer: commit warnings,
   * oversized-file notices, an undo-commit offer, a continue-rebase prompt.
   * The shell owns them; the view owns where they sit.
   */
  readonly banners?: React.ReactNode

  /**
   * Rendered inside the composer beneath the description — the co-author
   * editor and the avatar stack it fills in.
   */
  readonly composerExtras?: React.ReactNode

  /**
   * Replaces the built-in empty state when the working tree is genuinely
   * clean, as opposed to filtered down to nothing.
   */
  readonly emptyContent?: React.ReactNode

  // -- the diff pane ------------------------------------------------------

  /**
   * Everything the shared diff pane needs. `action` and `fileMenuLabel` are
   * supplied by this view — the contract fixes them to "Include hunk" and the
   * working-tree file commands — so the shell cannot accidentally hand the
   * Changes pane History's Details toggle.
   */
  readonly diff: Omit<IMd3DiffPaneProps, 'action' | 'fileMenuLabel'>

  /** Include the hunk under the cursor in the commit. */
  readonly onIncludeHunk: () => void

  /** Set while there is no hunk to include. */
  readonly includeHunkDisabled?: boolean

  readonly className?: string
}

/** The contract's soft limit on summary length, reported by the hint. */
const SummaryLengthGuide = 50

/**
 * Above this many changed files the list renders a window rather than every
 * row. A generated-file sweep or a first commit routinely runs to thousands.
 */
const ListVirtualizeThreshold = 300

/** The row height assumed until the first row has been measured. */
const AssumedRowHeight = 62

/**
 * The composer is a `<form>` so that Enter in the summary field submits it
 * rather than doing nothing, but the commit itself runs through the button's
 * own handler; the browser's navigation is never wanted.
 */
function preventDefault(event: React.FormEvent) {
  event.preventDefault()
}

/** The contract's `c.name` — `path.split('/').pop()`. */
export function md3ChangeName(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/** The contract's `c.dir` — `path.split('/').slice(0, -1).join('/')`. */
export function md3ChangeDirectory(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

const basename = md3ChangeName
const directory = md3ChangeDirectory

/**
 * The extension segment of the detail line.
 *
 * The contract writes `path.split('.').pop()`, which answers the whole
 * filename for a file that has no dot at all — so `Makefile` would describe
 * itself as being of type "Makefile". A leading dot is a dotfile rather than
 * an extension, so `.gitignore` has none either.
 */
export function md3ChangeExtension(path: string): string | undefined {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1) : undefined
}

/**
 * The contract's `c.detail` — "new file · +24 −9 · tsx · included".
 *
 * Rendered from the file's real added and deleted counts rather than the
 * contract's `24 + i * 7` sample arithmetic, which exists only to give the
 * prototype eight distinguishable rows.
 */
export function md3ChangeDetail(file: IMd3ChangedFile): string {
  return [
    statusLabel(file.status),
    formatAddDelete(file.addedLineCount, file.deletedLineCount),
    md3ChangeExtension(file.path),
    file.included || file.partiallyIncluded === true
      ? t('md3.changes.state.included')
      : t('md3.changes.state.excluded'),
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(' · ')
}

/** The contract's `allCheckIcon`. */
export function md3IncludeAllIcon(
  includedCount: number,
  totalCount: number
): MaterialSymbolName {
  if (totalCount > 0 && includedCount === totalCount) {
    return 'check_box'
  }
  return includedCount === 0
    ? 'check_box_outline_blank'
    : 'indeterminate_check_box'
}

/** The contract's `summaryHint`: "12/50", and past 50 "62/50 — summary is long". */
export function md3SummaryHint(summaryLength: number): string {
  const params = {
    count: String(summaryLength),
    limit: String(SummaryLengthGuide),
  }
  return summaryLength > SummaryLengthGuide
    ? t('md3.changes.summaryHintLong', params)
    : t('md3.changes.summaryHint', params)
}

function statusLabel(status: Md3ChangeStatus): string {
  if (status === 'A') {
    return t('md3.changes.status.new')
  }
  if (status === 'D') {
    return t('md3.changes.status.deleted')
  }
  return t('md3.changes.status.modified')
}

function includeIcon(file: IMd3ChangedFile): MaterialSymbolName {
  if (file.partiallyIncluded === true) {
    return 'indeterminate_check_box'
  }
  return file.included ? 'check_box' : 'check_box_outline_blank'
}

function includeChecked(file: IMd3ChangedFile): boolean | 'mixed' {
  if (file.partiallyIncluded === true) {
    return 'mixed'
  }
  return file.included
}

/**
 * The row's own icon buttons.
 *
 * `Md3IconButton` is the right control everywhere else, but these two sit
 * inside a grid row with roving focus and therefore have to be removed from
 * the tab sequence, which that component does not expose. The class is the
 * shared one, so the pixels cannot drift; only the `tabIndex` differs.
 */
function Md3ChangesRowButton(props: {
  readonly icon: MaterialSymbolName
  readonly iconSize: number
  readonly label: string
  readonly checked?: boolean | 'mixed'
  readonly className?: string
  readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const ref = React.useMemo(() => createObservableRef<HTMLButtonElement>(), [])

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      role={props.checked === undefined ? undefined : 'checkbox'}
      aria-checked={props.checked}
      className={classNames(
        'md3-icon-button',
        'md3-icon-button--small',
        props.className
      )}
      aria-label={props.label}
      onClick={props.onClick}
    >
      <Tooltip target={ref} applyAriaDescribedBy={false}>
        {props.label}
      </Tooltip>
      <MaterialSymbol name={props.icon} size={props.iconSize} />
    </button>
  )
}

interface IMd3ChangesRowProps {
  readonly file: IMd3ChangedFile
  readonly index: number
  readonly selected: boolean
  readonly focused: boolean

  /**
   * Set on the first rendered row only, so the list can learn its real height
   * for the windowing arithmetic.
   */
  readonly rowRef?: React.RefObject<HTMLDivElement>

  readonly onSelect: (index: number, event: React.MouseEvent) => void
  readonly onToggleInclude: (path: string) => void
  readonly onOpenRowMenu: (
    path: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
  readonly onContextMenu: (
    path: string,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onKeyDown: (index: number, event: React.KeyboardEvent) => void
}

function Md3ChangesRow(props: IMd3ChangesRowProps) {
  const {
    file,
    index,
    onSelect,
    onToggleInclude,
    onOpenRowMenu,
    onKeyDown,
    onContextMenu,
  } = props

  const name = basename(file.path)
  const dir = directory(file.path)
  const tone = statusTone(file.status)
  const detail = md3ChangeDetail(file)

  const onRowClick = React.useCallback(
    (event: React.MouseEvent) => onSelect(index, event),
    [onSelect, index]
  )

  const onRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => onKeyDown(index, event),
    [onKeyDown, index]
  )

  const onRowContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => onContextMenu(file.path, event),
    [onContextMenu, file.path]
  )

  const onIncludeClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onToggleInclude(file.path)
    },
    [onToggleInclude, file.path]
  )

  const onMenuClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenRowMenu(file.path, event)
    },
    [onOpenRowMenu, file.path]
  )

  return (
    <div
      ref={props.rowRef}
      role="row"
      data-md3-change-index={index}
      aria-rowindex={index + 1}
      aria-selected={props.selected}
      aria-label={name}
      tabIndex={props.focused ? 0 : -1}
      className={classNames('md3-row', 'md3-changes-view__row', {
        'md3-row--active': props.selected,
      })}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
      onContextMenu={onRowContextMenu}
    >
      <span role="gridcell" className="md3-changes-view__cell">
        <Md3ChangesRowButton
          icon={includeIcon(file)}
          iconSize={13}
          checked={includeChecked(file)}
          className={classNames('md3-changes-view__include', {
            'md3-changes-view__include--off':
              !file.included && file.partiallyIncluded !== true,
          })}
          label={t('md3.changes.include', { name })}
          onClick={onIncludeClick}
        />
      </span>
      <span role="gridcell" className="md3-changes-view__body">
        <span
          className={classNames('md3-row__name', {
            'md3-row__name--active': props.selected,
          })}
        >
          {name}
        </span>
        <span className="md3-changes-view__dir">{dir}</span>
        <span className="md3-row__detail">{detail}</span>
      </span>
      <span role="gridcell" className="md3-changes-view__cell">
        {/*
          The letter alone is not speech-friendly, and the detail line above
          already carries the same fact in words ("new file", "deleted",
          "modified"). Announcing both would say it twice.
        */}
        <span
          className={classNames(
            'md3-changes-view__status',
            tone.container,
            tone.on
          )}
          aria-hidden={true}
        >
          {file.status}
        </span>
      </span>
      <span role="gridcell" className="md3-changes-view__cell">
        <Md3ChangesRowButton
          icon="more_vert"
          iconSize={15}
          label={t('md3.changes.rowMenu', { name })}
          onClick={onMenuClick}
        />
      </span>
    </div>
  )
}

export function Md3ChangesView(props: IMd3ChangesViewProps) {
  const {
    files,
    selectedPaths,
    onSelectionChanged,
    onIncludeChanged,
    onIncludeAllChanged,
    onFileContextMenu,
    commitSummary,
    onCommit,
    onCommitAndPush,
    onOpenComposer,
    totalFileCount,
    includedFileCount,
  } = props

  const listRef = React.useRef<HTMLDivElement>(null)
  const firstRowRef = React.useRef<HTMLDivElement>(null)

  /** The row that owns the tab stop. Selection can span several rows. */
  const [focusedIndex, setFocusedIndex] = React.useState(0)

  /** Set when a keyboard move has to land focus on a row once it renders. */
  const focusPending = React.useRef(false)

  const rowHeight = useMd3MeasuredRowHeight(
    firstRowRef,
    AssumedRowHeight,
    files.length
  )
  const virtualize = files.length > ListVirtualizeThreshold
  const view = useMd3VirtualWindow(
    listRef,
    files.length,
    rowHeight,
    virtualize,
    6
  )

  const clampedFocus = Math.min(focusedIndex, Math.max(0, files.length - 1))

  React.useEffect(() => {
    if (focusedIndex > 0 && focusedIndex >= files.length) {
      setFocusedIndex(Math.max(0, files.length - 1))
    }
  }, [files.length, focusedIndex])

  const moveFocus = React.useCallback(
    (index: number, extendSelection: boolean, selectionFollows: boolean) => {
      const next = Math.max(0, Math.min(files.length - 1, index))
      if (files.length === 0) {
        return
      }

      setFocusedIndex(next)
      focusPending.current = true

      const list = listRef.current
      if (list !== null && virtualize) {
        // Scroll first so the row exists by the time focus is applied.
        const top = next * rowHeight
        if (top < list.scrollTop) {
          list.scrollTop = top
        } else if (top + rowHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = top + rowHeight - list.clientHeight
        }
      }

      if (extendSelection) {
        const from = Math.min(clampedFocus, next)
        const to = Math.max(clampedFocus, next)
        onSelectionChanged(files.slice(from, to + 1).map(f => f.path))
        return
      }

      if (selectionFollows) {
        const target = files[next]
        if (target !== undefined) {
          onSelectionChanged([target.path])
        }
      }
    },
    [files, clampedFocus, onSelectionChanged, virtualize, rowHeight]
  )

  React.useLayoutEffect(() => {
    if (!focusPending.current) {
      return
    }
    const list = listRef.current
    if (list === null) {
      return
    }
    const row = list.querySelector<HTMLElement>(
      `[data-md3-change-index="${clampedFocus}"]`
    )
    if (row !== null) {
      focusPending.current = false
      row.focus()
    }
  })

  const onRowSelect = React.useCallback(
    (index: number, event: React.MouseEvent) => {
      const file = files[index]
      if (file === undefined) {
        return
      }

      setFocusedIndex(index)

      if (event.shiftKey && selectedPaths.length > 0) {
        const anchorIndex = files.findIndex(f => f.path === selectedPaths[0])
        const from = Math.min(anchorIndex === -1 ? index : anchorIndex, index)
        const to = Math.max(anchorIndex === -1 ? index : anchorIndex, index)
        onSelectionChanged(files.slice(from, to + 1).map(f => f.path))
        return
      }

      if (event.ctrlKey || event.metaKey) {
        const already = selectedPaths.includes(file.path)
        onSelectionChanged(
          already
            ? selectedPaths.filter(path => path !== file.path)
            : [...selectedPaths, file.path]
        )
        return
      }

      onSelectionChanged([file.path])
    },
    [files, selectedPaths, onSelectionChanged]
  )

  const onToggleInclude = React.useCallback(
    (path: string) => {
      const file = files.find(f => f.path === path)
      if (file === undefined) {
        return
      }
      // A partially included file is treated as included, so one press takes
      // it all the way out rather than to a second ambiguous state.
      onIncludeChanged(
        path,
        !(file.included || file.partiallyIncluded === true)
      )
    },
    [files, onIncludeChanged]
  )

  const onRowKeyDown = React.useCallback(
    (index: number, event: React.KeyboardEvent) => {
      const row = event.currentTarget as HTMLElement
      const onRowItself = event.target === row

      if (!onRowItself) {
        // Focus is on one of the row's buttons: left and right walk between
        // them, and Left from the first button returns to the row.
        const buttons = Array.from(
          row.querySelectorAll<HTMLButtonElement>('button')
        )
        const position = buttons.indexOf(event.target as HTMLButtonElement)

        if (event.key === 'ArrowRight' && position < buttons.length - 1) {
          event.preventDefault()
          buttons[position + 1].focus()
          return
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          if (position <= 0) {
            row.focus()
          } else {
            buttons[position - 1].focus()
          }
          return
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
          return
        }
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          moveFocus(index + 1, event.shiftKey, !event.ctrlKey && !event.metaKey)
          break
        case 'ArrowUp':
          event.preventDefault()
          moveFocus(index - 1, event.shiftKey, !event.ctrlKey && !event.metaKey)
          break
        case 'Home':
          event.preventDefault()
          moveFocus(0, event.shiftKey, !event.ctrlKey && !event.metaKey)
          break
        case 'End':
          event.preventDefault()
          moveFocus(
            files.length - 1,
            event.shiftKey,
            !event.ctrlKey && !event.metaKey
          )
          break
        case 'ArrowRight': {
          event.preventDefault()
          const first = row.querySelector<HTMLButtonElement>('button')
          if (first !== null) {
            first.focus()
          }
          break
        }
        case 'Enter': {
          event.preventDefault()
          const file = files[index]
          if (file !== undefined) {
            onSelectionChanged([file.path])
          }
          break
        }
        case ' ': {
          event.preventDefault()
          const file = files[index]
          if (file !== undefined) {
            onToggleInclude(file.path)
          }
          break
        }
        default:
          break
      }
    },
    [files, moveFocus, onSelectionChanged, onToggleInclude]
  )

  // -- the include-all toggle ---------------------------------------------

  const allIncluded = totalFileCount > 0 && includedFileCount === totalFileCount
  const noneIncluded = includedFileCount === 0

  const includeAllIcon = md3IncludeAllIcon(includedFileCount, totalFileCount)

  const includeAllLabel = t('md3.changes.includeAll', {
    included: String(includedFileCount),
    total: String(totalFileCount),
  })

  const onIncludeAllClick = React.useCallback(() => {
    onIncludeAllChanged(!allIncluded)
  }, [onIncludeAllChanged, allIncluded])

  // -- the composer -------------------------------------------------------

  const summaryHint = md3SummaryHint(commitSummary.length)

  const hasSummary = commitSummary.trim().length > 0

  const onCommitClick = React.useCallback(() => {
    if (!hasSummary) {
      onOpenComposer(false)
      return
    }
    onCommit()
  }, [hasSummary, onOpenComposer, onCommit])

  const onCommitAndPushClick = React.useCallback(() => {
    if (!hasSummary) {
      onOpenComposer(true)
      return
    }
    onCommitAndPush()
  }, [hasSummary, onOpenComposer, onCommitAndPush])

  const { onCommitSummaryChanged, onCommitDescriptionChanged } = props

  const onSummaryInput = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onCommitSummaryChanged(event.currentTarget.value)
    },
    [onCommitSummaryChanged]
  )

  const onDescriptionInput = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onCommitDescriptionChanged(event.currentTarget.value)
    },
    [onCommitDescriptionChanged]
  )

  const commitRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const commitPushRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const commitLabel =
    props.commitButtonLabel ??
    t('md3.changes.commitTo', { branch: props.branchName })

  const visibleFiles = files.slice(view.start, view.end)

  return (
    <div
      className={classNames('md3-changes-view', 'md3-anim-up', props.className)}
    >
      <div className="md3-changes-view__sidebar">
        <Md3SearchField
          id="md3-changes-search"
          searchSurfaceId="md3-changes"
          value={props.searchValue}
          placeholder={t('md3.changes.searchPlaceholder')}
          fieldLabel={t('md3.changes.searchField')}
          regexEnabled={props.searchRegexEnabled}
          onChange={props.onSearchChange}
          onClear={props.onSearchClear}
          onToggleRegex={props.onToggleSearchRegex}
          onOpenBuilder={props.onOpenSearchBuilder}
          onContextMenu={props.onSearchContextMenu}
        />

        <Md3ChipRow label={t('md3.changes.filters')}>
          <button
            type="button"
            role="checkbox"
            aria-checked={allIncluded ? true : noneIncluded ? false : 'mixed'}
            className="md3-changes-view__include-all"
            onClick={onIncludeAllClick}
          >
            <MaterialSymbol name={includeAllIcon} size={14} />
            <span>{includeAllLabel}</span>
          </button>
          {(props.filterChips ?? []).map(chip => (
            <Md3Chip
              key={chip.id}
              label={chip.label}
              active={chip.active}
              onToggle={chip.onToggle}
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3IconButton
            small={true}
            icon="more_vert"
            label={t('md3.changes.changesMenu')}
            hasPopup="dialog"
            onClick={props.onOpenChangesMenu}
          />
        </Md3ChipRow>

        <div
          ref={listRef}
          className="md3-changes-view__list"
          onScroll={view.onScroll}
          onContextMenu={props.onListContextMenu}
        >
          {files.length === 0 ? (
            props.emptyContent ?? (
              <Md3EmptyState
                message={t('md3.changes.empty')}
                onAction={props.onResetFilters}
              />
            )
          ) : (
            <div
              role="grid"
              aria-label={t('md3.changes.list')}
              aria-rowcount={files.length}
              aria-multiselectable={true}
              className="md3-changes-view__grid"
              style={
                virtualize
                  ? { paddingTop: view.topPad, paddingBottom: view.bottomPad }
                  : undefined
              }
            >
              {visibleFiles.map((file, offset) => {
                const index = view.start + offset
                return (
                  <Md3ChangesRow
                    key={file.path}
                    file={file}
                    index={index}
                    rowRef={offset === 0 ? firstRowRef : undefined}
                    selected={selectedPaths.includes(file.path)}
                    focused={index === clampedFocus}
                    onSelect={onRowSelect}
                    onToggleInclude={onToggleInclude}
                    onOpenRowMenu={props.onOpenRowMenu}
                    onContextMenu={onFileContextMenu}
                    onKeyDown={onRowKeyDown}
                  />
                )
              })}
            </div>
          )}
        </div>

        {props.banners}

        <form
          className="md3-changes-view__composer"
          aria-label={t('md3.changes.composer')}
          onSubmit={preventDefault}
        >
          <div className="md3-changes-view__composer-row">
            <span
              className="md3-changes-view__avatar"
              role="img"
              aria-label={t('md3.changes.avatar', { name: props.authorName })}
            >
              {props.authorInitials}
            </span>
            <input
              id="md3-changes-summary"
              type="text"
              className="md3-changes-view__summary"
              placeholder={t('md3.changes.summaryPlaceholder')}
              aria-label={t('md3.changes.summaryPlaceholder')}
              aria-describedby="md3-changes-summary-hint"
              value={commitSummary}
              onChange={onSummaryInput}
            />
            <Md3IconButton
              small={true}
              icon="smart_toy"
              iconSize={16}
              label={t('md3.changes.copilot')}
              onClick={props.onDraftWithCopilot}
            />
          </div>

          <textarea
            id="md3-changes-description"
            className="md3-changes-view__description"
            placeholder={t('md3.changes.descriptionPlaceholder')}
            aria-label={t('md3.changes.descriptionPlaceholder')}
            value={props.commitDescription}
            onChange={onDescriptionInput}
          />

          {props.composerExtras}

          <div className="md3-changes-view__composer-row md3-changes-view__composer-row--tight">
            <Md3GhostButton
              icon="group_add"
              label={t('md3.changes.coAuthors')}
              accessibleName={t('md3.changes.coAuthorsName')}
              onClick={props.onAddCoAuthors}
            />
            <span
              id="md3-changes-summary-hint"
              className="md3-changes-view__hint"
            >
              {summaryHint}
            </span>
          </div>

          <div className="md3-changes-view__composer-row md3-changes-view__composer-row--tight">
            <button
              ref={commitRef}
              type="button"
              className={classNames('md3-changes-view__commit', {
                'md3-changes-view__commit--armed': hasSummary,
              })}
              disabled={props.commitDisabled}
              onClick={onCommitClick}
            >
              <Tooltip target={commitRef} applyAriaDescribedBy={false}>
                {hasSummary ? commitLabel : t('md3.changes.commitNeedsSummary')}
              </Tooltip>
              <MaterialSymbol name="commit" size={16} />
              <span>{commitLabel}</span>
            </button>
            <button
              ref={commitPushRef}
              type="button"
              className="md3-changes-view__commit-push"
              aria-label={t('md3.changes.commitAndPush')}
              disabled={props.commitDisabled}
              onClick={onCommitAndPushClick}
            >
              <Tooltip target={commitPushRef} applyAriaDescribedBy={false}>
                {t('md3.changes.commitAndPush')}
              </Tooltip>
              <MaterialSymbol name="bolt" size={16} />
            </button>
          </div>
        </form>
      </div>

      <Md3DiffPane
        {...props.diff}
        fileMenuLabel={t('md3.changes.fileMenu')}
        action={{
          kind: 'includeHunk',
          onIncludeHunk: props.onIncludeHunk,
          disabled: props.includeHunkDisabled,
        }}
      />
    </div>
  )
}
