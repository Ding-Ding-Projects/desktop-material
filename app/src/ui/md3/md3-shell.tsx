import * as React from 'react'
import classNames from 'classnames'

import { getPersistedLanguageMode, t } from '../../lib/i18n'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import { IAppIdentityCustomization } from '../../models/app-identity'
import { MaterialSymbolName } from '../lib/material-symbol'

import { Md3AppHeader } from './md3-app-header'
import {
  Md3NavigationDrawer,
  Md3DestinationId,
  md3Destinations,
} from './md3-navigation-drawer'
import { Md3NavigationRail } from './md3-navigation-rail'
import { Md3PaneHeader, Md3Destination, Md3PushState } from './md3-pane-header'
import { Md3MenuOverlay } from './md3-menu-overlay'
import {
  IMd3MenuContext,
  IMd3MenuHandlers,
  IMd3MenuItem,
  IMd3MenuSpec,
  MenuKind,
  getMenuSpec,
} from './md3-menu-specs'
import {
  IMd3RegexBuilderApplication,
  Md3RegexBuilderDialog,
} from './md3-regex-builder-dialog'
import { IMd3ComposeDialogProps, Md3ComposeDialog } from './md3-compose-dialog'
import { Md3ToastHost } from './md3-toast'

import { IMd3ChangesViewProps, Md3ChangesView } from './md3-changes-view'
import { IMd3HistoryViewProps, Md3HistoryView } from './md3-history-view'
import { IMd3BranchesViewProps, Md3BranchesView } from './md3-branches-view'
import { IMd3ActionsViewProps, Md3ActionsView } from './md3-actions-view'
import { IMd3InboxViewProps, Md3InboxView } from './md3-inbox-view'
import { IMd3TerminalViewProps, Md3TerminalView } from './md3-terminal-view'
import { IMd3AgentsViewProps, Md3AgentsView } from './md3-agents-view'
import {
  IMd3RepositoriesViewProps,
  Md3RepositoriesView,
} from './md3-repositories-view'

/**
 * The MD3 shell — the whole of `design/History MD3.dc.html` above the
 * destination views, assembled as one component.
 *
 * The contract's `DCLogic` class keeps the shell's state in one place: which
 * destination is showing, whether the drawer is expanded, the eleven search
 * fields with their independent regex modes, which overlay is open, the regex
 * builder's target and seed pattern, and the transient progress value. This
 * module keeps exactly that state, as an exported shape driven by an exported
 * reducer, so a test can put the shell into any state without a running
 * application behind it.
 *
 * Layout lives in `app/styles/ui/_md3-shell-layout.scss`; everything shared
 * with the views is already in `_md3-shell.scss` and the per-component
 * partials.
 *
 * The shell reads nothing. It imports neither the dispatcher nor the app
 * store: every value it renders and every action it can take arrives as a
 * prop, which is what lets it be rendered from a screenshot harness and from
 * `app.tsx` with the same code path.
 */

// ---------------------------------------------------------------------------
// Search fields
// ---------------------------------------------------------------------------

/**
 * The eleven keys of the contract's `state.search`, in its order.
 *
 * Every one is independent: its own value, its own regex mode, and its own
 * regex builder target. The contract is explicit that applying a built pattern
 * writes it into the field that opened the builder and turns *that* field's
 * regex mode on — sharing one builder's state across fields would silently
 * rewrite a query the user is still looking at.
 */
export type Md3SearchFieldKey =
  | 'global'
  | 'history'
  | 'changes'
  | 'branches'
  | 'actions'
  | 'logs'
  | 'inbox'
  | 'terminal'
  | 'agents'
  | 'repositories'
  | 'diffSearch'

/**
 * Every key, written out by hand.
 *
 * A list derived from the state object would validate whichever fields
 * happened to survive; enumerating them is what makes a dropped field a
 * failure rather than a smaller green run.
 */
export const Md3SearchFieldKeys: ReadonlyArray<Md3SearchFieldKey> = [
  'global',
  'history',
  'changes',
  'branches',
  'actions',
  'logs',
  'inbox',
  'terminal',
  'agents',
  'repositories',
  'diffSearch',
]

/** One search field's independent state. */
export interface IMd3SearchFieldState {
  readonly value: string

  /** Whether this field — and only this field — reads its query as a regex. */
  readonly regexEnabled: boolean
}

const EmptySearchField: IMd3SearchFieldState = {
  value: '',
  regexEnabled: false,
}

/**
 * A short localized name for a search field, used as the regex builder's
 * target label so six builders opened from six fields are distinguishable by
 * ear as well as by eye.
 */
export function md3SearchFieldLabel(field: Md3SearchFieldKey): string {
  switch (field) {
    case 'global':
      return t('md3.shell.searchTarget.global')
    case 'history':
      return t('md3.shell.searchTarget.history')
    case 'changes':
      return t('md3.shell.searchTarget.changes')
    case 'branches':
      return t('md3.shell.searchTarget.branches')
    case 'actions':
      return t('md3.shell.searchTarget.actions')
    case 'logs':
      return t('md3.shell.searchTarget.logs')
    case 'inbox':
      return t('md3.shell.searchTarget.inbox')
    case 'terminal':
      return t('md3.shell.searchTarget.terminal')
    case 'agents':
      return t('md3.shell.searchTarget.agents')
    case 'repositories':
      return t('md3.shell.searchTarget.repositories')
    case 'diffSearch':
      return t('md3.shell.searchTarget.diffSearch')
  }
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/**
 * Where a regex builder was opened from, and therefore where its pattern goes
 * when the user applies it.
 *
 * A menu's filter is a search field too — it is simply owned by the menu
 * overlay rather than by a view — so applying a pattern to one re-opens that
 * menu with the pattern seeded and its regex mode on, which is the same
 * write-back the contract performs for a view's field.
 */
export type Md3BuilderTarget =
  | { readonly kind: 'search'; readonly field: Md3SearchFieldKey }
  | { readonly kind: 'menu'; readonly menu: MenuKind }

/** The single overlay the contract allows to be open at a time. */
export type Md3ShellOverlay =
  | {
      readonly kind: 'menu'
      readonly menu: MenuKind
      /** Seeds the menu's own filter — used when a built pattern is applied. */
      readonly filter: string
      readonly regexEnabled: boolean
    }
  | {
      readonly kind: 'builder'
      readonly target: Md3BuilderTarget
      readonly pattern: string
    }
  | { readonly kind: 'compose' }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * The shell's whole state.
 *
 * Exported so tests, screenshot harnesses and `app.tsx` can drive the shell
 * directly rather than reaching into it through simulated clicks.
 */
export interface IMd3ShellState {
  readonly destination: Md3DestinationId

  readonly drawerExpanded: boolean

  readonly search: Readonly<Record<Md3SearchFieldKey, IMd3SearchFieldState>>

  readonly overlay: Md3ShellOverlay | null

  /**
   * The running operation's completion, 0–100, or `null` when nothing is in
   * flight. `null` removes the pane's progress bar entirely, exactly as the
   * contract's `progress > 0` gate does.
   */
  readonly progress: number | null

  /**
   * What is in progress, already localized — "Fetching origin", "Pushing 3
   * commits". It names the operation rather than merely saying "Loading",
   * because it is what a screen reader announces when the bar appears.
   */
  readonly progressLabel: string
}

function emptySearchState(): Record<Md3SearchFieldKey, IMd3SearchFieldState> {
  const search = {} as Record<Md3SearchFieldKey, IMd3SearchFieldState>
  for (const key of Md3SearchFieldKeys) {
    search[key] = EmptySearchField
  }
  return search
}

/**
 * A fresh shell state.
 *
 * @param overrides Applied over the defaults. The contract opens on History
 *                  with the drawer expanded and nothing else set.
 */
export function createMd3ShellState(
  overrides?: Partial<IMd3ShellState>
): IMd3ShellState {
  return {
    destination: 'history',
    drawerExpanded: true,
    search: emptySearchState(),
    overlay: null,
    progress: null,
    progressLabel: '',
    ...overrides,
  }
}

/** Every state change the shell can make. */
export type Md3ShellAction =
  | {
      readonly type: 'select-destination'
      readonly destination: Md3DestinationId
    }
  | { readonly type: 'toggle-drawer' }
  | { readonly type: 'set-drawer'; readonly expanded: boolean }
  | {
      readonly type: 'set-search'
      readonly field: Md3SearchFieldKey
      readonly value: string
    }
  | { readonly type: 'clear-search'; readonly field: Md3SearchFieldKey }
  | { readonly type: 'toggle-search-regex'; readonly field: Md3SearchFieldKey }
  | {
      readonly type: 'set-search-regex'
      readonly field: Md3SearchFieldKey
      readonly enabled: boolean
    }
  | {
      readonly type: 'open-menu'
      readonly menu: MenuKind
      readonly filter?: string
      readonly regexEnabled?: boolean
    }
  | { readonly type: 'open-builder'; readonly target: Md3BuilderTarget }
  | { readonly type: 'apply-builder'; readonly pattern: string }
  | { readonly type: 'open-compose' }
  | { readonly type: 'close-overlay' }
  | {
      readonly type: 'set-progress'
      readonly progress: number | null
      readonly label?: string
    }

function withSearch(
  state: IMd3ShellState,
  field: Md3SearchFieldKey,
  next: IMd3SearchFieldState
): IMd3ShellState {
  return { ...state, search: { ...state.search, [field]: next } }
}

/** Keep a reported percentage inside the track whatever the caller says. */
function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, value))
}

/**
 * The shell's reducer. Pure — every action produces a new state and touches
 * nothing else, so a test can replay a sequence of them and assert the result.
 */
export function md3ShellReducer(
  state: IMd3ShellState,
  action: Md3ShellAction
): IMd3ShellState {
  switch (action.type) {
    case 'select-destination':
      if (state.destination === action.destination) {
        return state
      }
      // Switching destination closes whatever overlay was up: the contract's
      // menus act on the destination they were opened from, so leaving one
      // open over a different pane would offer commands for a surface that is
      // no longer showing.
      return { ...state, destination: action.destination, overlay: null }

    case 'toggle-drawer':
      return { ...state, drawerExpanded: !state.drawerExpanded }

    case 'set-drawer':
      return { ...state, drawerExpanded: action.expanded }

    case 'set-search':
      return withSearch(state, action.field, {
        ...state.search[action.field],
        value: action.value,
      })

    case 'clear-search':
      return withSearch(state, action.field, {
        ...state.search[action.field],
        value: '',
      })

    case 'toggle-search-regex':
      return withSearch(state, action.field, {
        ...state.search[action.field],
        regexEnabled: !state.search[action.field].regexEnabled,
      })

    case 'set-search-regex':
      return withSearch(state, action.field, {
        ...state.search[action.field],
        regexEnabled: action.enabled,
      })

    case 'open-menu':
      return {
        ...state,
        overlay: {
          kind: 'menu',
          menu: action.menu,
          filter: action.filter ?? '',
          regexEnabled: action.regexEnabled ?? false,
        },
      }

    case 'open-builder': {
      const pattern =
        action.target.kind === 'search'
          ? state.search[action.target.field].value
          : state.overlay !== null && state.overlay.kind === 'menu'
          ? state.overlay.filter
          : ''
      return {
        ...state,
        overlay: { kind: 'builder', target: action.target, pattern },
      }
    }

    case 'apply-builder': {
      const overlay = state.overlay
      if (overlay === null || overlay.kind !== 'builder') {
        return state
      }

      if (overlay.target.kind === 'menu') {
        // The pattern belongs to the menu's own filter, so the menu comes back
        // with it seeded and its regex mode on rather than the user having to
        // retype what they just built.
        return {
          ...state,
          overlay: {
            kind: 'menu',
            menu: overlay.target.menu,
            filter: action.pattern,
            regexEnabled: true,
          },
        }
      }

      // Writing the pattern without turning regex mode on would search for the
      // pattern's literal characters — the one failure this write-back exists
      // to prevent.
      return {
        ...withSearch(state, overlay.target.field, {
          value: action.pattern,
          regexEnabled: true,
        }),
        overlay: null,
      }
    }

    case 'open-compose':
      return { ...state, overlay: { kind: 'compose' } }

    case 'close-overlay':
      return state.overlay === null ? state : { ...state, overlay: null }

    case 'set-progress':
      return {
        ...state,
        progress:
          action.progress === null ? null : clampProgress(action.progress),
        progressLabel: action.label ?? state.progressLabel,
      }
  }
}

// ---------------------------------------------------------------------------
// Search bindings
// ---------------------------------------------------------------------------

/**
 * One search field's props, in the exact shape the views ask for.
 *
 * `IMd3ActionsSearch` and `IMd3TerminalSearch` are structurally this, and the
 * remaining views take the same six values under their own prop names — so a
 * host builds a view's search wiring by spreading or renaming this rather than
 * writing the same six closures per field.
 */
export interface IMd3SearchBinding {
  readonly value: string
  readonly regexEnabled: boolean
  readonly onChange: (value: string) => void
  readonly onClear: () => void
  readonly onToggleRegex: () => void
  readonly onOpenBuilder: () => void
}

/**
 * Bind one of the eleven search fields to a shell state and dispatch.
 *
 * The builder this opens targets that field alone, and applying its pattern
 * writes back into that field alone.
 */
export function md3SearchBinding(
  state: IMd3ShellState,
  dispatch: (action: Md3ShellAction) => void,
  field: Md3SearchFieldKey
): IMd3SearchBinding {
  return {
    value: state.search[field].value,
    regexEnabled: state.search[field].regexEnabled,
    onChange: (value: string) => dispatch({ type: 'set-search', field, value }),
    onClear: () => dispatch({ type: 'clear-search', field }),
    onToggleRegex: () => dispatch({ type: 'toggle-search-regex', field }),
    onOpenBuilder: () =>
      dispatch({ type: 'open-builder', target: { kind: 'search', field } }),
  }
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

/** The pane header names its destinations in the contract's capitalized form. */
const PaneDestinations: Readonly<Record<Md3DestinationId, Md3Destination>> = {
  changes: 'Changes',
  history: 'History',
  branches: 'Branches',
  actions: 'Actions',
  inbox: 'Inbox',
  terminal: 'Terminal',
  agents: 'Agents',
  repositories: 'Repositories',
}

/** Translate a drawer destination id into the pane header's own name. */
export function md3PaneDestination(id: Md3DestinationId): Md3Destination {
  return PaneDestinations[id]
}

/** Every destination id, in the contract's drawer order. */
export const Md3DestinationIds: ReadonlyArray<Md3DestinationId> = [
  'changes',
  'history',
  'branches',
  'actions',
  'inbox',
  'terminal',
  'agents',
  'repositories',
]

function isDestinationId(value: string): value is Md3DestinationId {
  return (Md3DestinationIds as ReadonlyArray<string>).includes(value)
}

/**
 * The eight destination views' props, as the host builds them.
 *
 * A `null` entry means the host has not handed this destination its MD3 view
 * and wants `renderLegacyDestination` to supply the surface instead. That is
 * how the repository tab strip and the classic surfaces stay reachable during
 * the rewrite: nothing is a placeholder, it is the app's existing real
 * surface rendered inside the MD3 chrome.
 */
export interface IMd3ShellViews {
  readonly changes: IMd3ChangesViewProps | null
  readonly history: IMd3HistoryViewProps | null
  readonly branches: IMd3BranchesViewProps | null
  readonly actions: IMd3ActionsViewProps | null
  readonly inbox: IMd3InboxViewProps | null
  readonly terminal: IMd3TerminalViewProps | null
  readonly agents: IMd3AgentsViewProps | null
  readonly repositories: IMd3RepositoriesViewProps | null
}

/** Every destination unhandled — the shape a host starts from. */
export const md3NoViews: IMd3ShellViews = {
  changes: null,
  history: null,
  branches: null,
  actions: null,
  inbox: null,
  terminal: null,
  agents: null,
  repositories: null,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IMd3ShellProps {
  // -- Controlled state ----------------------------------------------------

  /**
   * The shell's state. Supply it together with `onStateChange` to own the
   * state — which a host must do if it wants to build the destination views'
   * search props from the same eleven fields. Omit both to let the shell keep
   * its own.
   */
  readonly state?: IMd3ShellState

  /** Receives every state change and the action that produced it. */
  readonly onStateChange?: (
    state: IMd3ShellState,
    action: Md3ShellAction
  ) => void

  /** Seeds the internal state when the shell is uncontrolled. */
  readonly initialState?: Partial<IMd3ShellState>

  /**
   * Which navigation presentation the shell renders: the contract's own
   * 208px/68px `<nav>` drawer (`design/History MD3.dc.html`), or the fixed
   * 88px icon-pill rail Classic mode uses instead
   * (`design/Desktop Material v2.dc.html`). Both take the identical
   * destination array built by `md3Destinations()`, so switching never
   * changes which destinations are reachable — only how they are drawn.
   *
   * Defaults to `'drawer'`, so every existing caller is unchanged.
   */
  readonly navigation?: 'drawer' | 'rail'

  // -- Header --------------------------------------------------------------

  readonly appIdentity: IAppIdentityCustomization

  readonly accountInitials: string

  readonly accountName?: string

  readonly unreadCount: number

  readonly onCommitAndPush: () => void

  readonly commitAndPushDisabled?: boolean

  readonly onOpenPalette: () => void

  readonly onOpenNotifications: () => void

  readonly onToggleTheme: () => void

  readonly onOpenSettings: () => void

  readonly onOpenAccountSwitcher: () => void

  /** Focus target for the global search input, for a palette or a shortcut. */
  readonly searchInputRef?: React.Ref<HTMLInputElement>

  // -- Pane header ---------------------------------------------------------

  readonly repositoryName: string

  readonly branchName: string

  readonly pushState: Md3PushState

  readonly aheadCount: number

  readonly onFetch: () => void

  readonly onPush: () => void

  /** Per-destination badge text. An absent or empty entry renders no badge. */
  readonly destinationCounts?: Partial<Record<Md3DestinationId, string>>

  // -- Menus ---------------------------------------------------------------

  readonly menuContext: IMd3MenuContext

  readonly menuHandlers: IMd3MenuHandlers

  /**
   * Extra items appended to a menu, after the contract's own.
   *
   * This is where a capability the design never drew gets a real home: a
   * command the old toolbar owned, a row action the contract's five did not
   * include, a dialog only the classic chrome opened. The contract's items are
   * never replaced — a host adds to a menu, it cannot subtract from one.
   */
  readonly menuExtensions?: Partial<
    Record<MenuKind, ReadonlyArray<IMd3MenuItem>>
  >

  // -- Compose dialog ------------------------------------------------------

  /**
   * The compose dialog's content. `onDismissed` is supplied by the shell,
   * which owns whether the overlay is open.
   */
  readonly compose: Omit<IMd3ComposeDialogProps, 'onDismissed'>

  // -- Destinations --------------------------------------------------------

  readonly views: IMd3ShellViews

  /**
   * The surface for a destination whose MD3 view the host has not supplied.
   * Called only when `views[destination]` is `null`.
   */
  readonly renderLegacyDestination: (
    destination: Md3DestinationId
  ) => React.ReactNode

  // -- Legacy chrome -------------------------------------------------------

  /**
   * The repository tab strip, rendered between the header and the shell body.
   *
   * Multi-repository tabs are a real feature of this fork that the contract's
   * single-repository prototype simply never drew, so the strip is shown by
   * default and is not something the rewrite removes.
   */
  readonly repositoryTabStrip?: React.ReactNode

  /** Hides the tab strip. Shown when omitted. */
  readonly showRepositoryTabStrip?: boolean

  /** The classic toolbar band, rendered above the pane inside `<main>`. */
  readonly classicToolbar?: React.ReactNode

  /**
   * Whether the classic toolbar band is shown. Persisted by the host through
   * `app/src/lib/classic-toolbar.ts`, and enabled by default.
   */
  readonly showClassicToolbar?: boolean

  /** Rendered between the pane header and the destination — banners, notices. */
  readonly paneBanners?: React.ReactNode

  /** Rendered last inside the shell — popups, drag elements, drop overlays. */
  readonly children?: React.ReactNode

  readonly className?: string

  /** Extra attributes for the shell root, e.g. customization anchors. */
  readonly rootProps?: React.HTMLAttributes<HTMLDivElement>
}

/**
 * What the shell's live region says when the destination changes.
 *
 * The funny level styles the framing and nothing else: `{name}` is the
 * destination's own localized label, interpolated verbatim into every band, so
 * a listener always hears which surface they landed on however playful the
 * sentence around it reads. Each language picks its own band, which is why
 * this goes through `translateWithFunnyLevel` rather than reading one level
 * and applying it to both.
 */
export function md3DestinationAnnouncement(name: string): string {
  return translateWithFunnyLevel(
    'md3.shell.destinationAnnouncement',
    getPersistedLanguageMode(),
    readFunnyLevels(),
    { name }
  )
}

/** The DOM id of the shell's main pane, referenced by the drawer's tabs. */
export const Md3ShellPaneId = 'md3-shell-pane'

/** The DOM id of the pane's heading, which owns focus after a destination change. */
export const Md3ShellHeadingId = 'md3-shell-pane-heading'

function extendSpec(
  spec: IMd3MenuSpec,
  extras: ReadonlyArray<IMd3MenuItem> | undefined
): IMd3MenuSpec {
  if (extras === undefined || extras.length === 0) {
    return spec
  }
  return { ...spec, items: [...spec.items, ...extras] }
}

/**
 * Close the menu after an item runs, unless that item opened another one.
 *
 * The contract's own items each set `overlay: null` as part of their action.
 * Here the actions belong to the host, which cannot see the shell's overlay
 * state, so the shell closes for them — and checks first, because an item
 * whose whole job is to open the settings menu must not have that menu closed
 * out from under it a microsecond later.
 */
function closingItems(
  spec: IMd3MenuSpec,
  currentOverlay: () => Md3ShellOverlay | null,
  close: () => void
): IMd3MenuSpec {
  return {
    ...spec,
    items: spec.items.map(item => ({
      ...item,
      onClick: () => {
        const before = currentOverlay()
        item.onClick()
        const after = currentOverlay()
        if (after === before) {
          close()
        }
      },
    })),
  }
}

/** The whole contract shell: header, drawer, pane, destination and overlays. */
export function Md3Shell(props: IMd3ShellProps) {
  const {
    onStateChange,
    views,
    renderLegacyDestination,
    menuContext,
    menuHandlers,
    menuExtensions,
  } = props

  const [internalState, internalDispatch] = React.useReducer(
    md3ShellReducer,
    props.initialState,
    createMd3ShellState
  )

  const isControlled = props.state !== undefined
  const state = props.state ?? internalState

  // The dispatch closure is stable, so it reads the live state through a ref
  // rather than closing over a stale one — the classic source of a menu that
  // reopens with the filter it had two actions ago.
  const stateRef = React.useRef(state)
  stateRef.current = state
  const controlledRef = React.useRef(isControlled)
  controlledRef.current = isControlled

  const dispatch = React.useCallback(
    (action: Md3ShellAction) => {
      const next = md3ShellReducer(stateRef.current, action)
      stateRef.current = next
      if (!controlledRef.current) {
        internalDispatch(action)
      }
      onStateChange?.(next, action)
    },
    [onStateChange]
  )

  const destinations = md3Destinations(
    props.destinationCounts ?? {},
    state.destination
  )
  const active =
    destinations.find(d => d.id === state.destination) ?? destinations[0]
  const destinationLabel = active.label
  const destinationIcon: MaterialSymbolName = active.icon

  // -- Focus and announcement ---------------------------------------------

  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const lastDestination = React.useRef<Md3DestinationId | null>(null)

  React.useEffect(() => {
    if (lastDestination.current === null) {
      // The first paint is not a destination change; moving focus there would
      // steal it from whatever the app focused on startup.
      lastDestination.current = state.destination
      return
    }
    if (lastDestination.current === state.destination) {
      return
    }
    lastDestination.current = state.destination
    headingRef.current?.focus()
  }, [state.destination])

  // -- Handlers ------------------------------------------------------------

  const onSelectDestination = React.useCallback(
    (id: string) => {
      if (isDestinationId(id)) {
        dispatch({ type: 'select-destination', destination: id })
      }
    },
    [dispatch]
  )

  const onToggleDrawer = React.useCallback(
    () => dispatch({ type: 'toggle-drawer' }),
    [dispatch]
  )

  const onOpenCompose = React.useCallback(
    () => dispatch({ type: 'open-compose' }),
    [dispatch]
  )

  const onCloseOverlay = React.useCallback(
    () => dispatch({ type: 'close-overlay' }),
    [dispatch]
  )

  const openMenu = React.useCallback(
    (menu: MenuKind) => dispatch({ type: 'open-menu', menu }),
    [dispatch]
  )

  const onOpenRepositoryMenu = React.useCallback(
    () => openMenu('repoMenu'),
    [openMenu]
  )
  const onOpenBranchMenu = React.useCallback(
    () => openMenu('branchMenu'),
    [openMenu]
  )
  const onOpenPaneMenu = React.useCallback(
    () => openMenu('paneMenu'),
    [openMenu]
  )
  const onOpenDrawerMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      openMenu('drawerMenu')
    },
    [openMenu]
  )
  const onOpenSearchMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      openMenu('searchMenu')
    },
    [openMenu]
  )
  const onSelectRepositoryDestination = React.useCallback(
    () => dispatch({ type: 'select-destination', destination: 'repositories' }),
    [dispatch]
  )

  const globalSearch = md3SearchBinding(state, dispatch, 'global')

  /**
   * The handlers the menu specs are built with.
   *
   * Four of the eight are the shell's own business rather than the host's:
   * which destination is showing, whether the drawer is expanded, which menu
   * is open, and whether the regex builder is up are all shell state, and a
   * host has no way to change them. Those four are wrapped here — the host's
   * handler still runs, so it can record, notify or act on the same event, it
   * simply does not have to reimplement the shell.
   *
   * `onCommand` is wrapped for the same reason and for three commands only.
   * The search menu's own rows — toggle regex, clear the field, show the regex
   * guide — act on the global search's value, its regex mode and which overlay
   * is open. All three are shell state, so a host binding them could only
   * guess; the shell performs them and the host's handler still runs after.
   */
  const effectiveMenuHandlers: IMd3MenuHandlers = React.useMemo(
    () => ({
      ...menuHandlers,
      onCommand: command => {
        switch (command) {
          case 'toggleSearchRegexMode':
            dispatch({ type: 'toggle-search-regex', field: 'global' })
            break
          case 'clearSearchField':
            dispatch({ type: 'clear-search', field: 'global' })
            break
          case 'showRegexGuideEntry':
            dispatch({ type: 'open-menu', menu: 'guide' })
            break
          default:
            break
        }
        menuHandlers.onCommand(command)
      },
      onNavigate: destination => {
        const id = destination.toLowerCase()
        if (isDestinationId(id)) {
          dispatch({ type: 'select-destination', destination: id })
        }
        menuHandlers.onNavigate(destination)
      },
      onToggle: toggle => {
        if (toggle === 'drawer') {
          dispatch({ type: 'toggle-drawer' })
        }
        menuHandlers.onToggle(toggle)
      },
      onOpenMenu: kind => {
        dispatch({ type: 'open-menu', menu: kind })
        menuHandlers.onOpenMenu(kind)
      },
      onOpenRegexBuilder: pattern => {
        const overlay = stateRef.current.overlay
        const target: Md3BuilderTarget =
          overlay !== null && overlay.kind === 'menu'
            ? { kind: 'menu', menu: overlay.menu }
            : { kind: 'search', field: 'global' }
        if (target.kind === 'menu') {
          dispatch({ type: 'open-menu', menu: target.menu, filter: pattern })
        } else {
          dispatch({ type: 'set-search', field: 'global', value: pattern })
        }
        dispatch({ type: 'open-builder', target })
        menuHandlers.onOpenRegexBuilder(pattern)
      },
    }),
    [menuHandlers, dispatch]
  )

  const onMenuOpenBuilder = React.useCallback(
    (pattern: string) => {
      const overlay = stateRef.current.overlay
      if (overlay === null || overlay.kind !== 'menu') {
        return
      }
      // The menu's own filter text is the seed, so the builder opens with what
      // the user has already typed rather than an empty pattern.
      dispatch({ type: 'open-menu', menu: overlay.menu, filter: pattern })
      dispatch({
        type: 'open-builder',
        target: { kind: 'menu', menu: overlay.menu },
      })
    },
    [dispatch]
  )

  const onApplyBuilder = React.useCallback(
    (application: IMd3RegexBuilderApplication) =>
      dispatch({ type: 'apply-builder', pattern: application.pattern }),
    [dispatch]
  )

  /**
   * Close the builder — and only the builder.
   *
   * The dialog calls `onDismissed` immediately after `onApply`, which is
   * correct for a dialog that owns its own visibility and wrong here, where
   * applying a pattern is itself an overlay change. A builder opened from a
   * menu's filter puts that menu back with the pattern seeded; an unconditional
   * close then tore it straight back down, so the write-back the contract
   * describes never reached the screen. Checking what is actually open keeps
   * Escape, the scrim and the close button closing the builder exactly as
   * before.
   */
  const onCloseBuilder = React.useCallback(() => {
    const overlay = stateRef.current.overlay
    if (overlay !== null && overlay.kind === 'builder') {
      dispatch({ type: 'close-overlay' })
    }
  }, [dispatch])

  // -- Destination content -------------------------------------------------

  const renderDestination = (): React.ReactNode => {
    switch (state.destination) {
      case 'changes':
        return views.changes === null ? (
          renderLegacyDestination('changes')
        ) : (
          <Md3ChangesView {...views.changes} />
        )
      case 'history':
        return views.history === null ? (
          renderLegacyDestination('history')
        ) : (
          <Md3HistoryView {...views.history} />
        )
      case 'branches':
        return views.branches === null ? (
          renderLegacyDestination('branches')
        ) : (
          <Md3BranchesView {...views.branches} />
        )
      case 'actions':
        return views.actions === null ? (
          renderLegacyDestination('actions')
        ) : (
          <Md3ActionsView {...views.actions} />
        )
      case 'inbox':
        return views.inbox === null ? (
          renderLegacyDestination('inbox')
        ) : (
          <Md3InboxView {...views.inbox} />
        )
      case 'terminal':
        return views.terminal === null ? (
          renderLegacyDestination('terminal')
        ) : (
          <Md3TerminalView {...views.terminal} />
        )
      case 'agents':
        return views.agents === null ? (
          renderLegacyDestination('agents')
        ) : (
          <Md3AgentsView {...views.agents} />
        )
      case 'repositories':
        return views.repositories === null ? (
          renderLegacyDestination('repositories')
        ) : (
          <Md3RepositoriesView {...views.repositories} />
        )
    }
  }

  // -- Overlays ------------------------------------------------------------

  const renderOverlay = (): React.ReactNode => {
    const overlay = state.overlay
    if (overlay === null) {
      return null
    }

    if (overlay.kind === 'compose') {
      return (
        <Md3ComposeDialog {...props.compose} onDismissed={onCloseOverlay} />
      )
    }

    if (overlay.kind === 'builder') {
      const targetLabel =
        overlay.target.kind === 'search'
          ? md3SearchFieldLabel(overlay.target.field)
          : getMenuSpec(overlay.target.menu, menuContext, effectiveMenuHandlers)
              .title

      return (
        <Md3RegexBuilderDialog
          // Remounting per target keeps one builder's pattern, flags and test
          // string out of the next one — the fields are independent, and a
          // reused instance would carry state across them.
          key={
            overlay.target.kind === 'search'
              ? `search:${overlay.target.field}`
              : `menu:${overlay.target.menu}`
          }
          targetLabel={targetLabel}
          initialPattern={overlay.pattern}
          onApply={onApplyBuilder}
          onDismissed={onCloseBuilder}
        />
      )
    }

    const spec = closingItems(
      extendSpec(
        getMenuSpec(overlay.menu, menuContext, effectiveMenuHandlers),
        menuExtensions?.[overlay.menu]
      ),
      () => stateRef.current.overlay,
      onCloseOverlay
    )

    return (
      <Md3MenuOverlay
        key={`${overlay.menu}:${overlay.filter}:${overlay.regexEnabled}`}
        spec={spec}
        initialFilter={overlay.filter}
        initialRegexEnabled={overlay.regexEnabled}
        onDismiss={onCloseOverlay}
        onOpenRegexBuilder={onMenuOpenBuilder}
      />
    )
  }

  const showTabStrip =
    props.showRepositoryTabStrip !== false &&
    props.repositoryTabStrip !== undefined
  const showClassicToolbar =
    props.showClassicToolbar !== false && props.classicToolbar !== undefined

  return (
    <div
      {...props.rootProps}
      className={classNames(
        'md3-shell',
        { 'md3-shell--rail': props.navigation === 'rail' },
        props.className
      )}
    >
      <Md3AppHeader
        appIdentity={props.appIdentity}
        accountInitials={props.accountInitials}
        accountName={props.accountName}
        unreadCount={props.unreadCount}
        searchValue={globalSearch.value}
        searchRegexEnabled={globalSearch.regexEnabled}
        drawerExpanded={state.drawerExpanded}
        commitAndPushDisabled={props.commitAndPushDisabled}
        searchInputRef={props.searchInputRef}
        onToggleDrawer={onToggleDrawer}
        onCommitAndPush={props.onCommitAndPush}
        onSearchChange={globalSearch.onChange}
        onSearchClear={globalSearch.onClear}
        onToggleSearchRegex={globalSearch.onToggleRegex}
        onOpenSearchBuilder={globalSearch.onOpenBuilder}
        onSearchContextMenu={onOpenSearchMenu}
        onOpenPalette={props.onOpenPalette}
        onOpenNotifications={props.onOpenNotifications}
        onToggleTheme={props.onToggleTheme}
        onOpenSettings={props.onOpenSettings}
        onOpenAccountSwitcher={props.onOpenAccountSwitcher}
      />

      {showTabStrip ? (
        <div className="md3-shell__tab-strip">{props.repositoryTabStrip}</div>
      ) : null}

      <div className="md3-shell__body">
        {props.navigation === 'rail' ? (
          <Md3NavigationRail
            destinations={destinations}
            activeRepositoryName={props.repositoryName}
            accountInitials={props.accountInitials}
            accountName={props.accountName}
            mainPaneId={Md3ShellPaneId}
            onSelectDestination={onSelectDestination}
            onOpenSettings={props.onOpenSettings}
            onOpenAccountSwitcher={props.onOpenAccountSwitcher}
            onContextMenu={onOpenDrawerMenu}
          />
        ) : (
          <Md3NavigationDrawer
            destinations={destinations}
            expanded={state.drawerExpanded}
            activeRepositoryName={props.repositoryName}
            mainPaneId={Md3ShellPaneId}
            onSelectDestination={onSelectDestination}
            onOpenCompose={onOpenCompose}
            onSelectRepository={onSelectRepositoryDestination}
            onContextMenu={onOpenDrawerMenu}
          />
        )}

        <main className="md3-shell__main">
          {showClassicToolbar ? (
            <div className="md3-shell__classic-toolbar">
              {props.classicToolbar}
            </div>
          ) : null}

          <section
            id={Md3ShellPaneId}
            className="md3-shell__pane"
            aria-labelledby={Md3ShellHeadingId}
          >
            {/*
              The visible pane title is a span inside the pane header, so the
              pane has no heading of its own and no focus target for a
              destination change. This one is both: it names the region, and a
              keyboard user who switches destination lands on it instead of
              being stranded on a control that no longer exists.
            */}
            <h1
              ref={headingRef}
              id={Md3ShellHeadingId}
              className="sr-only"
              tabIndex={-1}
            >
              {destinationLabel}
            </h1>

            <Md3PaneHeader
              destination={md3PaneDestination(state.destination)}
              title={destinationLabel}
              icon={destinationIcon}
              repositoryName={props.repositoryName}
              branchName={props.branchName}
              pushState={props.pushState}
              aheadCount={props.aheadCount}
              progress={state.progress}
              progressLabel={state.progressLabel}
              repositoryMenuOpen={
                state.overlay?.kind === 'menu' &&
                state.overlay.menu === 'repoMenu'
              }
              branchMenuOpen={
                state.overlay?.kind === 'menu' &&
                state.overlay.menu === 'branchMenu'
              }
              paneMenuOpen={
                state.overlay?.kind === 'menu' &&
                state.overlay.menu === 'paneMenu'
              }
              onOpenRepositoryMenu={onOpenRepositoryMenu}
              onOpenBranchMenu={onOpenBranchMenu}
              onFetch={props.onFetch}
              onPush={props.onPush}
              onOpenPaneMenu={onOpenPaneMenu}
            />

            {props.paneBanners}

            <div className="md3-shell__destination">{renderDestination()}</div>
          </section>
        </main>
      </div>

      {/*
        The destination change is announced politely rather than assertively:
        it is the result of something the user just did, so it must not
        interrupt whatever a screen reader is already saying.
      */}
      <div className="sr-only" role="status">
        {md3DestinationAnnouncement(destinationLabel)}
      </div>

      {renderOverlay()}
      <Md3ToastHost />
      {props.children}
    </div>
  )
}
