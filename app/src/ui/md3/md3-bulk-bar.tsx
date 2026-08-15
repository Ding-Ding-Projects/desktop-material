import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { MaterialSymbolName } from '../lib/material-symbol'
import { ObservableRef } from '../lib/observable-ref'
import { Md3GhostButton } from './md3-primitives'
import { IMd3MenuSpec } from './md3-menu-specs'
import {
  IMd3ListExportColumn,
  Md3ListExportFormat,
  Md3ListExportFormats,
  md3ListExportLoss,
  md3ListExportSchema,
} from './md3-list-export'
import {
  md3AllVisibleSelected,
  md3SelectAllLabel,
  md3SomeVisibleSelected,
} from './md3-list-selection'

/**
 * The bulk-action bar every MD3 list wears.
 *
 * The contract asks the same set of every list — multi-select, a select-all
 * that states its own scope, an inverse selection, the full action set in
 * bulk, and an export offering every format that can carry the data. Writing
 * that eight times produced eight nearly-identical bars in the surfaces that
 * had one at all, and nothing in the ones that did not. This is the one bar,
 * and a list supplies its verbs.
 *
 * It owns no state. The select-all checkbox is controlled, the count is
 * `role="status"` so a screen reader hears the selection change without
 * being moved, and every button leaves through a callback.
 *
 * The three-state checkbox is deliberate: `indeterminate` is the only honest
 * rendering of "some of these are selected", and a checkbox that shows
 * unchecked while four rows are selected is how a user clicks select-all
 * twice and ends up with nothing selected.
 */

/** One verb a list offers in bulk. */
export interface IMd3BulkAction {
  /** Stable identity, used as the React key and by tests. */
  readonly id: string

  readonly label: string

  readonly icon: MaterialSymbolName

  /**
   * The fuller accessible name, which must contain `label` verbatim so a
   * speech-input user can activate the control by the words on screen. Build
   * it with `md3.bulk.scopedAction` so the scope travels with the verb.
   */
  readonly accessibleName?: string

  readonly disabled?: boolean

  /** Paints the error role. For a destructive verb, which also wants a gate. */
  readonly destructive?: boolean

  /** `aria-haspopup`, for a verb that opens the destructive gate or a menu. */
  readonly hasPopup?: 'menu' | 'dialog'

  /** So the gate can anchor itself to the button that opened it. */
  readonly buttonRef?: ObservableRef<HTMLButtonElement>

  readonly onClick: () => void
}

export interface IMd3BulkBarProps {
  /**
   * A stable id for this list, used to build the bar's own class names and to
   * distinguish two bars on one surface in a test.
   */
  readonly listId: string

  /** The bar's accessible group name — "Bulk actions for branches". */
  readonly label: string

  /** The ids currently visible, after the query and the chips. */
  readonly visibleIds: ReadonlyArray<string>

  readonly selected: ReadonlySet<string>

  /**
   * Whether a query or a chip is narrowing the list.
   *
   * This is what decides whether the select-all says "all 12 matching these
   * filters" or "all 12". Passing `false` while a filter is on is the one
   * defect this component cannot detect and the user cannot either.
   */
  readonly filtered: boolean

  readonly onToggleSelectAll: () => void

  readonly onInvertSelection: () => void

  readonly onClearSelection: () => void

  /** The verbs, in render order. */
  readonly actions: ReadonlyArray<IMd3BulkAction>

  /** Omit to hide the export button entirely. */
  readonly onExport?: (format: Md3ListExportFormat) => void

  /** Required whenever `onExport` is supplied — the export's declared schema. */
  readonly exportColumns?: ReadonlyArray<IMd3ListExportColumn>

  /** Opens the export picker. Supplied by the view that renders the overlay. */
  readonly onOpenExport?: () => void

  readonly exportDisabled?: boolean

  readonly exportButtonRef?: ObservableRef<HTMLButtonElement>

  /** Everything the bar's verbs will run over, in words. */
  readonly scopeLabel: string

  /** Disables every control while a batch is in flight. */
  readonly busy?: boolean
}

/**
 * Build the export picker's menu spec.
 *
 * Each row carries the format's extension **and** what that format would drop
 * from this particular list, so the cost is visible in the row being clicked
 * rather than discovered later in the file. The menu's own title states the
 * encoding and the schema, which is the other half of the contract's "state
 * the encoding and the schema" and the half that is always missing.
 */
export function md3BulkExportMenuSpec(
  columns: ReadonlyArray<IMd3ListExportColumn>,
  scopeLabel: string,
  onPick: (format: Md3ListExportFormat) => void
): IMd3MenuSpec {
  return {
    kind: 'listMenu',
    title: t('md3.bulk.exportMenu.title', { scope: scopeLabel }),
    icon: 'cloud_download',
    width: 460,
    hasFilter: true,
    filterPlaceholder: t('md3.bulk.exportMenu.filterPlaceholder'),
    footer: md3ListExportSchema(columns),
    items: Md3ListExportFormats.map(descriptor => {
      const loss = md3ListExportLoss(columns, descriptor.format)
      return {
        id: descriptor.format,
        label: descriptor.label,
        icon: 'description' as MaterialSymbolName,
        hint: loss === null ? `.${descriptor.extension}` : loss,
        onClick: () => onPick(descriptor.format),
      }
    }),
  }
}

/** The scoped accessible name for one bulk verb. */
export function md3BulkActionName(label: string, scope: string): string {
  return t('md3.bulk.scopedAction', { label, scope })
}

export function Md3BulkBar(props: IMd3BulkBarProps) {
  const {
    visibleIds,
    selected,
    filtered,
    busy = false,
    onExport,
    exportColumns,
    onOpenExport,
  } = props

  const allSelected = md3AllVisibleSelected(visibleIds, selected)
  const someSelected = md3SomeVisibleSelected(visibleIds, selected)

  // `indeterminate` is a property, never an attribute, so React cannot set it
  // from JSX. Without this the partial state renders as plain unchecked.
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)
  React.useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const empty = visibleIds.length === 0
  const selectionCount = selected.size

  const exportOffered =
    onExport !== undefined &&
    exportColumns !== undefined &&
    onOpenExport !== undefined

  return (
    <div
      className={classNames('md3-bulk-bar', `md3-bulk-bar--${props.listId}`)}
      role="group"
      aria-label={props.label}
    >
      <label className="md3-bulk-bar__select-all">
        <input
          ref={selectAllRef}
          type="checkbox"
          className="md3-bulk-bar__checkbox"
          checked={allSelected}
          disabled={empty || busy}
          onChange={props.onToggleSelectAll}
        />
        <span>{md3SelectAllLabel(visibleIds.length, filtered)}</span>
      </label>

      <span className="md3-bulk-bar__count" role="status">
        {t('md3.bulk.selectionCount', { count: String(selectionCount) })}
      </span>

      <Md3GhostButton
        label={t('md3.bulk.invertSelection')}
        icon="swap_horiz"
        disabled={empty || busy}
        onClick={props.onInvertSelection}
      />

      <Md3GhostButton
        label={t('md3.bulk.clearSelection')}
        icon="backspace"
        disabled={selectionCount === 0 || busy}
        onClick={props.onClearSelection}
      />

      {props.actions.map(action => (
        <Md3GhostButton
          key={action.id}
          label={action.label}
          accessibleName={
            action.accessibleName ??
            md3BulkActionName(action.label, props.scopeLabel)
          }
          icon={action.icon}
          className={classNames({
            'md3-bulk-bar__danger': action.destructive === true,
          })}
          hasPopup={action.hasPopup}
          buttonRef={action.buttonRef}
          disabled={action.disabled === true || busy}
          onClick={action.onClick}
        />
      ))}

      {exportOffered ? (
        <Md3GhostButton
          label={t('md3.bulk.export')}
          accessibleName={md3BulkActionName(
            t('md3.bulk.export'),
            props.scopeLabel
          )}
          icon="cloud_download"
          hasPopup="menu"
          buttonRef={props.exportButtonRef}
          disabled={props.exportDisabled === true || empty || busy}
          onClick={onOpenExport}
        />
      ) : null}
    </div>
  )
}
