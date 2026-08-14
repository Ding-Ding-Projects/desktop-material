import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { IMd3Destination } from './md3-navigation-drawer'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef, ObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'

/**
 * The Classic shell's navigation rail — the "Navigation rail" `<nav>` block
 * of `design/Desktop Material v2.dc.html` (lines 1194-1340).
 *
 * This is a second presentation of the same destination list the drawer
 * renders, not a smaller one. `Md3NavigationDrawer` stays the Material
 * shell's own `<nav>`; this component is what Classic mode's `<nav>` becomes
 * instead, once the rewrite stops routing Classic through
 * `renderMd3Shell(md3NoViews)` and gives it back its own layout. Both take
 * the identical `ReadonlyArray<IMd3Destination>` — built once by
 * `md3Destinations()` — so a caller cannot wire the rail to fewer
 * destinations than the drawer without changing that shared array itself.
 *
 * The prototype's 88px width is fixed and holds no resize affordance; every
 * literal measurement, color token and hover/active transform lives in
 * `app/styles/ui/_md3-navigation-rail.scss`, not here. Two things the static
 * contract cannot express are handled in this file instead:
 *
 * - `railLabelsOn` hides every visible label at once. When it does, each
 *   destination, the settings button and the account switcher still carry a
 *   full `aria-label`, so the rail stays eight (or more) named controls
 *   rather than eight unlabeled icons.
 * - The contract's `title="Settings"` / `title="Switch account"` hints are
 *   rendered through the app's own `Tooltip`, because `title` is unreachable
 *   by keyboard and this repository forbids it.
 *
 * The prototype's rail has no footer chip for the active repository — only a
 * Settings button and an account avatar sit below the destinations. Classic
 * mode's drawer-based predecessor surfaced that name on its own chip, and
 * dropping it silently would be a removed capability, not a redesign. Rather
 * than inventing a fourth footer control the contract never draws, this
 * component folds `activeRepositoryName` into the account switcher's own
 * accessible name and tooltip, so the information the drawer's chip gave a
 * screen-reader or tooltip user is still one hover or arrow-key press away.
 */

/**
 * The glyph size the contract gives every rail icon: each destination's pill
 * icon and the Settings icon share it (`font-size: 22px` in the design
 * source).
 */
const RailGlyphSize = 22

/**
 * Writes `instance` into whichever ref shape a caller supplied — a callback
 * ref or a `React.RefObject`/`ObservableRef` — without disturbing another ref
 * pointed at the same node. A DOM element can only take one `ref` prop, so
 * composing two refs onto one element means calling both by hand rather than
 * assigning either directly.
 */
function setExternalRef<T>(
  ref: React.Ref<T> | undefined,
  instance: T | null
): void {
  if (ref == null) {
    return
  }
  if (typeof ref === 'function') {
    ref(instance)
  } else {
    ;(ref as React.MutableRefObject<T | null>).current = instance
  }
}

export interface IMd3NavigationRailProps {
  /**
   * The destinations, in the order they are rendered. `md3Destinations`
   * builds the same array `Md3NavigationDrawer` takes — every entry it
   * returns must appear here too, or a destination the drawer can reach
   * becomes one the rail cannot.
   */
  readonly destinations: ReadonlyArray<IMd3Destination>

  /**
   * The repository named on the account switcher's accessible name and
   * tooltip. The prototype's rail has no separate repository chip, so this
   * is where that context now lives.
   */
  readonly activeRepositoryName: string

  /** The initials rendered inside the account avatar circle. */
  readonly accountInitials: string

  /**
   * The signed-in account's display name, when one is known. Present, it
   * sharpens the account switcher's accessible name and tooltip from
   * "switch account" to "switch account for {name}"; absent, the switcher
   * still names the active repository on its own.
   */
  readonly accountName?: string

  /**
   * The contract's `railLabelsOn`. True renders the label under every
   * destination's pill; false hides every label at once, matching the
   * prototype's global toggle rather than a per-item choice. Defaults to
   * true, the prototype's own default.
   */
  readonly showLabels?: boolean

  /** Receives the `id` of the destination the user chose. */
  readonly onSelectDestination: (id: string) => void

  /** The rail's Settings button. */
  readonly onOpenSettings: () => void

  /** The rail's account-avatar button. */
  readonly onOpenAccountSwitcher: () => void

  /**
   * Whether the rail's own avatar currently has the floating account
   * switcher open, for `aria-expanded`. The header carries the identical
   * control (`md3-app-header.tsx`) and the two are independent — only the
   * avatar that was actually clicked reports itself expanded.
   */
  readonly accountSwitcherOpen?: boolean

  /**
   * Exposes the account-avatar button so a host can anchor the floating
   * switcher's outside-click exclusion and focus-return to the exact element
   * the user clicked. Composed onto the rail's own `accountRef` below rather
   * than replacing it — see `setExternalRef` — so the Tooltip above keeps
   * the same target it always had.
   */
  readonly accountButtonRef?: React.Ref<HTMLButtonElement>

  /** The rail's own context menu. */
  readonly onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void

  /**
   * The DOM id of the main pane the destinations switch between. Supplied,
   * it becomes `aria-controls` on every destination so assistive technology
   * can follow the relationship; omitted, the destinations are simply
   * announced as a vertical tab list.
   */
  readonly mainPaneId?: string

  readonly className?: string
}

/**
 * The contract's navigation rail.
 *
 * Like the drawer, the destinations are a vertical tab list over the main
 * pane: exactly one is selected, activating one swaps the pane rather than
 * navigating away, and so they take a single tab stop with arrow keys moving
 * between them (roving `tabindex`, per the ARIA authoring practices for a
 * tab list). The selected pill also carries `aria-current="page"`.
 */
export function Md3NavigationRail(props: IMd3NavigationRailProps) {
  const {
    destinations,
    showLabels = true,
    onSelectDestination,
    onOpenSettings,
    onOpenAccountSwitcher,
  } = props

  const settingsRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const accountRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const { accountButtonRef } = props
  const setAccountRef = React.useCallback(
    (instance: HTMLButtonElement | null) => {
      accountRef(instance)
      setExternalRef(accountButtonRef, instance)
    },
    [accountRef, accountButtonRef]
  )

  // One observable ref per destination: it is both the tooltip's target and
  // the handle the roving tabindex moves focus with.
  const destinationRefs = React.useRef(
    new Map<string, ObservableRef<HTMLButtonElement>>()
  )
  const refFor = React.useCallback((id: string) => {
    const existing = destinationRefs.current.get(id)
    if (existing !== undefined) {
      return existing
    }
    const created = createObservableRef<HTMLButtonElement>()
    destinationRefs.current.set(id, created)
    return created
  }, [])

  // Destination ids are the contract's own fixed identifiers (never
  // whitespace-bearing), so a plain space is a safe join/split separator for
  // pruning stale refs when the destination list changes shape.
  const ids = destinations.map(d => d.id).join(' ')
  React.useEffect(() => {
    const live = new Set(ids.split(' '))
    for (const id of Array.from(destinationRefs.current.keys())) {
      if (!live.has(id)) {
        destinationRefs.current.delete(id)
      }
    }
  }, [ids])

  const [focusedId, setFocusedId] = React.useState<string | null>(null)

  // The tab stop follows the user's last arrow-key move, and otherwise sits
  // on the selected destination — never on a destination that has gone away.
  const activeDestination = destinations.find(d => d.active)
  const firstDestination = destinations.length > 0 ? destinations[0] : undefined
  const rovingId =
    destinations.find(d => d.id === focusedId)?.id ??
    activeDestination?.id ??
    firstDestination?.id

  const onDestinationKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = destinations.findIndex(
        d => d.id === event.currentTarget.dataset.destinationId
      )
      if (index === -1 || destinations.length === 0) {
        return
      }

      let next = index
      switch (event.key) {
        case 'ArrowDown':
          next = (index + 1) % destinations.length
          break
        case 'ArrowUp':
          next = (index - 1 + destinations.length) % destinations.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = destinations.length - 1
          break
        default:
          return
      }

      event.preventDefault()
      const target = destinations[next]
      setFocusedId(target.id)
      destinationRefs.current.get(target.id)?.current?.focus()
    },
    [destinations]
  )

  const onDestinationClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.destinationId
      if (id !== undefined) {
        setFocusedId(id)
        onSelectDestination(id)
      }
    },
    [onSelectDestination]
  )

  const settingsLabel = t('md3.rail.settings')
  const accountLabel =
    props.accountName === undefined
      ? t('md3.rail.account', { repository: props.activeRepositoryName })
      : t('md3.rail.accountFor', {
          name: props.accountName,
          repository: props.activeRepositoryName,
        })

  return (
    <nav
      className={classNames(
        'md3-navigation-rail',
        { 'md3-navigation-rail--no-labels': !showLabels },
        props.className
      )}
      aria-label={t('md3.rail.label')}
      onContextMenu={props.onContextMenu}
    >
      <div
        className="md3-navigation-rail__destinations"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('md3.rail.destinations')}
      >
        {destinations.map(destination => {
          const ref = refFor(destination.id)
          const hasCount = destination.count.length > 0
          const accessibleName = hasCount
            ? t('md3.rail.destinationWithCount', {
                label: destination.label,
                count: destination.count,
              })
            : destination.label

          return (
            <button
              key={destination.id}
              ref={ref}
              type="button"
              role="tab"
              data-destination-id={destination.id}
              className={classNames('md3-navigation-rail__destination', {
                'md3-navigation-rail__destination--active': destination.active,
              })}
              aria-selected={destination.active}
              aria-current={destination.active ? 'page' : undefined}
              aria-controls={props.mainPaneId}
              aria-label={accessibleName}
              tabIndex={destination.id === rovingId ? 0 : -1}
              onClick={onDestinationClick}
              onKeyDown={onDestinationKeyDown}
            >
              <Tooltip target={ref} applyAriaDescribedBy={false}>
                {destination.label}
              </Tooltip>
              <span
                className={classNames('md3-navigation-rail__pill', {
                  'md3-navigation-rail__pill--active': destination.active,
                })}
              >
                <MaterialSymbol
                  name={destination.icon}
                  className="md3-navigation-rail__icon"
                  size={RailGlyphSize}
                  fill={destination.active ? 1 : 0}
                />
                {hasCount ? (
                  <span className="md3-navigation-rail__badge">
                    {destination.count}
                  </span>
                ) : null}
              </span>
              {showLabels ? (
                <span
                  className={classNames(
                    'md3-navigation-rail__destination-label',
                    {
                      'md3-navigation-rail__destination-label--active':
                        destination.active,
                    }
                  )}
                >
                  {destination.label}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="md3-navigation-rail__spacer" />

      <button
        ref={settingsRef}
        type="button"
        className="md3-navigation-rail__settings"
        aria-label={settingsLabel}
        onClick={onOpenSettings}
      >
        <Tooltip target={settingsRef} applyAriaDescribedBy={false}>
          {settingsLabel}
        </Tooltip>
        <MaterialSymbol
          name="settings"
          className="md3-navigation-rail__settings-icon"
          size={RailGlyphSize}
        />
      </button>

      <button
        ref={setAccountRef}
        type="button"
        className="md3-navigation-rail__account"
        aria-label={accountLabel}
        aria-haspopup="dialog"
        aria-expanded={props.accountSwitcherOpen ?? false}
        onClick={onOpenAccountSwitcher}
      >
        <Tooltip target={accountRef} applyAriaDescribedBy={false}>
          {accountLabel}
        </Tooltip>
        {props.accountInitials}
      </button>
    </nav>
  )
}
