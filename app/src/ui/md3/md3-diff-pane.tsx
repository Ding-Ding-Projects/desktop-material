/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- the diff grid scrolls in both axes and holds no focusable content of its own, so without a tab stop a keyboard user cannot reach past its first screen */
import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import { Md3IconButton, Md3SearchField } from './md3-primitives'
import { useMd3VirtualWindow } from './md3-virtual-window'

/**
 * The diff pane shared by the History and Changes destinations of the MD3
 * shell contract (`design/History MD3.dc.html`, the right-hand column of both
 * the `isHistory` and `isChanges` branches).
 *
 * The contract writes the pane out twice, and the two copies differ in exactly
 * three places: History's toolbar carries a `Details` toggle where Changes
 * carries an `Include hunk` action, History lists the commit's files as a
 * scrolling chip strip above the diff, and the trailing overflow menu offers a
 * different set of file commands. Everything else — the 42px toolbar, the
 * `Find in diff` search row with its hit count, the 19px monospace line grid,
 * the add/delete/hunk backgrounds and gutters, the wrap toggle — is identical,
 * so it lives here once. Two copies of a diff renderer is two places for the
 * gutter width to drift.
 *
 * The measurements live in `app/styles/ui/_md3-diff-pane.scss`.
 */

/** The four kinds of line the contract paints differently. */
export type Md3DiffLineKind = 'context' | 'add' | 'delete' | 'hunk'

export interface IMd3DiffLine {
  /** Stable within the rendered diff. Used for the React key. */
  readonly id: string

  readonly kind: Md3DiffLineKind

  /** The line's text, without its leading sign. */
  readonly text: string

  /** The line number on the left-hand side, when it has one. */
  readonly oldLineNumber?: number

  /** The line number on the right-hand side, when it has one. */
  readonly newLineNumber?: number
}

/** One entry of History's file strip above the diff. */
export interface IMd3DiffFileTab {
  readonly path: string

  /** The basename, which is what the chip shows. */
  readonly name: string

  /** `new` takes the green `add_circle`; anything else takes `edit_square`. */
  readonly kind: 'new' | 'modified'

  /**
   * How many lines the file gained, when that is known.
   *
   * Optional because it genuinely is not always knowable: History builds these
   * tabs from a commit's changeset, which carries the commit's totals and no
   * per-file split. Sending a zero there is not a neutral default — it renders
   * as "this file changed nothing" beside a path that plainly did change — so
   * a caller with no count omits it and every reader drops the number rather
   * than printing a zero nobody counted.
   */
  readonly addedLineCount?: number

  /** How many lines the file lost, when that is known. */
  readonly deletedLineCount?: number
}

/**
 * The toolbar's second control, which is the one thing the two hosts disagree
 * about.
 *
 * A discriminated union rather than a bag of optional props: the History
 * variant is a toggle that reports pressed state and the Changes variant is a
 * command, and a single shape covering both would let a caller ship a toggle
 * with no state or a command with a stuck `aria-pressed`.
 */
export type Md3DiffPaneAction =
  | {
      readonly kind: 'details'

      /** Whether the commit-detail sheet is open. */
      readonly expanded: boolean

      readonly onToggle: () => void
    }
  | {
      readonly kind: 'includeHunk'

      readonly onIncludeHunk: () => void

      /** Set while there is no hunk to include — no selection, no diff. */
      readonly disabled?: boolean
    }
  | {
      /** Render no second control at all. */
      readonly kind: 'none'
    }

export interface IMd3DiffPaneProps {
  /**
   * The path shown in the toolbar. Empty renders the contract's toolbar with
   * an explicit "no file selected" line rather than a blank strip.
   */
  readonly filePath: string

  readonly action: Md3DiffPaneAction

  readonly wrapLines: boolean

  readonly onToggleWrap: () => void

  readonly onOpenDiffOptions: () => void

  /** Opens the `fileMenu`. */
  readonly onOpenFileMenu: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * The overflow button's accessible name, which names the commands the menu
   * actually holds — "Open in editor, copy path, blame" beside a commit,
   * "Open in editor, discard, ignore" beside a working-tree change.
   */
  readonly fileMenuLabel: string

  /**
   * The search input's DOM id. Defaults to `md3-diff-search`; pass one when a
   * surface renders two panes at once so the ids stay unique.
   */
  readonly searchFieldId?: string

  readonly searchValue: string

  readonly searchRegexEnabled: boolean

  readonly onSearchChange: (value: string) => void

  readonly onSearchClear: () => void

  readonly onToggleSearchRegex: () => void

  readonly onOpenSearchBuilder: () => void

  /** The search row's own context menu — the contract's `searchMenu`. */
  readonly onSearchContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  /**
   * How many lines the query matched. Omitted hides the label; the field
   * itself hides it while the query is blank, so an empty box can never
   * report "0 hits".
   */
  readonly matchCount?: number

  /**
   * Lines that failed the query are dimmed rather than removed, as the
   * contract does — the surrounding code is what makes a hit readable.
   */
  readonly matches?: (line: IMd3DiffLine) => boolean

  /** History's file strip. Omit it entirely for the Changes pane. */
  readonly fileTabs?: ReadonlyArray<IMd3DiffFileTab>

  readonly activeFileTabPath?: string

  readonly onSelectFileTab?: (path: string) => void

  readonly lines: ReadonlyArray<IMd3DiffLine>

  readonly onDiffContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void

  /** Shown in place of the line grid when `lines` is empty. */
  readonly emptyMessage?: string

  /**
   * Rendered inside the pane, after the diff. History's commit-detail sheet
   * anchors to the pane, so the pane establishes the positioning context.
   */
  readonly children?: React.ReactNode

  readonly className?: string
}

/** The contract's `line-height: 19px` on the diff grid. */
const DiffLineHeight = 19

/**
 * Above this many lines the grid renders a window rather than every row. A
 * 40,000-line diff is an ordinary thing to open and 40,000 flex rows is not.
 */
const DiffVirtualizeThreshold = 400

function fileTabIcon(kind: 'new' | 'modified'): MaterialSymbolName {
  return kind === 'new' ? 'add_circle' : 'edit_square'
}

function Md3DiffFileTab(props: {
  readonly tab: IMd3DiffFileTab
  readonly active: boolean
  readonly onSelect: (path: string) => void
}) {
  const { tab, onSelect } = props
  const onClick = React.useCallback(() => onSelect(tab.path), [onSelect, tab])

  // A chip whose counts were never loaded announces the file alone. The
  // alternative it replaces announced "+0 −0" to a screen-reader user for
  // every file of every commit, which is the one audience that cannot glance
  // at the diff and see that it is untrue.
  const stated =
    tab.addedLineCount !== undefined && tab.deletedLineCount !== undefined

  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={classNames('md3-diff-pane__file', {
        'md3-diff-pane__file--active': props.active,
      })}
      aria-label={
        stated
          ? t('md3.diffPane.fileTabName', {
              name: tab.name,
              path: tab.path,
              added: String(tab.addedLineCount),
              deleted: String(tab.deletedLineCount),
            })
          : t('md3.diffPane.fileTabNameWithoutStats', {
              name: tab.name,
              path: tab.path,
            })
      }
      onClick={onClick}
    >
      <MaterialSymbol
        name={fileTabIcon(tab.kind)}
        size={14}
        className={classNames('md3-diff-pane__file-icon', {
          'md3-diff-pane__file-icon--new': tab.kind === 'new',
        })}
      />
      <span>{tab.name}</span>
    </button>
  )
}

function Md3DiffFileTabs(props: {
  readonly tabs: ReadonlyArray<IMd3DiffFileTab>
  readonly activePath: string | undefined
  readonly onSelect: (path: string) => void
}) {
  return (
    <div
      className="md3-diff-pane__files"
      role="tablist"
      aria-label={t('md3.diffPane.fileTabs')}
    >
      {props.tabs.map(tab => (
        <Md3DiffFileTab
          key={tab.path}
          tab={tab}
          active={tab.path === props.activePath}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  )
}

function Md3DiffPaneActionButton(props: {
  readonly action: Md3DiffPaneAction
}) {
  const detailsRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const hunkRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const { action } = props

  if (action.kind === 'none') {
    return null
  }

  if (action.kind === 'details') {
    const label = t('md3.diffPane.details')
    return (
      <button
        ref={detailsRef}
        type="button"
        className={classNames('md3-diff-pane__details', {
          'md3-diff-pane__details--active': action.expanded,
        })}
        aria-pressed={action.expanded}
        aria-label={t('md3.diffPane.detailsName')}
        onClick={action.onToggle}
      >
        <Tooltip target={detailsRef} applyAriaDescribedBy={false}>
          {t('md3.diffPane.detailsName')}
        </Tooltip>
        <MaterialSymbol name="badge" size={15} />
        <span>{label}</span>
      </button>
    )
  }

  const includeLabel = t('md3.diffPane.includeHunk')

  return (
    <button
      ref={hunkRef}
      type="button"
      className="md3-tonal-button md3-diff-pane__include-hunk"
      disabled={action.disabled === true}
      aria-label={t('md3.diffPane.includeHunkName')}
      onClick={action.onIncludeHunk}
    >
      <Tooltip target={hunkRef} applyAriaDescribedBy={false}>
        {t('md3.diffPane.includeHunkName')}
      </Tooltip>
      <MaterialSymbol name="done_all" size={15} />
      <span>{includeLabel}</span>
    </button>
  )
}

export function Md3DiffPane(props: IMd3DiffPaneProps) {
  const {
    lines,
    matches,
    searchValue,
    fileTabs,
    activeFileTabPath,
    onSelectFileTab,
  } = props

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualize = lines.length > DiffVirtualizeThreshold
  const view = useMd3VirtualWindow(
    scrollRef,
    lines.length,
    DiffLineHeight,
    virtualize
  )

  const hasQuery = searchValue.trim().length > 0
  const visible = lines.slice(view.start, view.end)

  const showTabs =
    fileTabs !== undefined &&
    fileTabs.length > 0 &&
    onSelectFileTab !== undefined

  return (
    <section
      className={classNames('md3-diff-pane', props.className)}
      aria-label={t('md3.diffPane.region')}
    >
      <div className="md3-diff-pane__toolbar">
        <MaterialSymbol
          name="description"
          size={17}
          className="md3-diff-pane__toolbar-icon"
        />
        <span className="md3-diff-pane__path">
          {props.filePath.length > 0
            ? props.filePath
            : t('md3.diffPane.noFile')}
        </span>
        <Md3DiffPaneActionButton action={props.action} />
        <Md3IconButton
          medium={true}
          icon="wrap_text"
          iconSize={16}
          label={t('md3.diffPane.wrap')}
          pressed={props.wrapLines}
          active={props.wrapLines}
          onClick={props.onToggleWrap}
        />
        <Md3IconButton
          icon="tune"
          label={t('md3.diffPane.diffOptions')}
          hasPopup="dialog"
          onClick={props.onOpenDiffOptions}
        />
        <Md3IconButton
          icon="more_vert"
          label={props.fileMenuLabel}
          hasPopup="dialog"
          onClick={props.onOpenFileMenu}
        />
      </div>

      <Md3SearchField
        id={props.searchFieldId ?? 'md3-diff-search'}
        searchSurfaceId="md3-diff-search"
        value={props.searchValue}
        placeholder={t('md3.diffPane.searchPlaceholder')}
        fieldLabel={t('md3.diffPane.searchField')}
        regexEnabled={props.searchRegexEnabled}
        matchCount={props.matchCount}
        onChange={props.onSearchChange}
        onClear={props.onSearchClear}
        onToggleRegex={props.onToggleSearchRegex}
        onOpenBuilder={props.onOpenSearchBuilder}
        onContextMenu={props.onSearchContextMenu}
      />

      {showTabs ? (
        <Md3DiffFileTabs
          tabs={fileTabs}
          activePath={activeFileTabPath}
          onSelect={onSelectFileTab}
        />
      ) : null}

      <div
        ref={scrollRef}
        className={classNames('md3-diff-pane__lines', {
          'md3-diff-pane__lines--wrap': props.wrapLines,
        })}
        role="region"
        aria-label={t('md3.diffPane.linesRegion')}
        tabIndex={0}
        onScroll={view.onScroll}
        onContextMenu={props.onDiffContextMenu}
      >
        {lines.length === 0 ? (
          <p className="md3-diff-pane__empty">
            {props.emptyMessage ?? t('md3.diffPane.empty')}
          </p>
        ) : (
          <div
            className="md3-diff-pane__grid"
            style={
              virtualize
                ? { paddingTop: view.topPad, paddingBottom: view.bottomPad }
                : undefined
            }
          >
            {visible.map(line => {
              const hunk = line.kind === 'hunk'
              const dimmed = hasQuery && matches !== undefined && !matches(line)
              const hit = hasQuery && matches !== undefined && matches(line)

              return (
                <div
                  key={line.id}
                  className={classNames(
                    'md3-diff-pane__line',
                    `md3-diff-pane__line--${line.kind}`,
                    { 'md3-diff-pane__line--dimmed': dimmed }
                  )}
                >
                  <span className="md3-diff-pane__gutter">
                    {hunk || line.oldLineNumber === undefined
                      ? ''
                      : line.oldLineNumber}
                  </span>
                  <span className="md3-diff-pane__gutter">
                    {hunk || line.newLineNumber === undefined
                      ? ''
                      : line.newLineNumber}
                  </span>
                  <span className="md3-diff-pane__sign" aria-hidden={true}>
                    {line.kind === 'add'
                      ? '+'
                      : line.kind === 'delete'
                      ? '-'
                      : ''}
                  </span>
                  <span
                    className={classNames('md3-diff-pane__text', {
                      'md3-diff-pane__text--hit': hit,
                    })}
                  >
                    {line.text}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {props.children}
    </section>
  )
}
