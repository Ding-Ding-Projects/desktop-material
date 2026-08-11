import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { menuAccelerator } from '../../lib/menu-accelerators'
import {
  getAppDisplayName,
  IAppIdentityCustomization,
} from '../../models/app-identity'
import { MaterialSymbol } from '../lib/material-symbol'
import { createObservableRef } from '../lib/observable-ref'
import { ariaKeyShortcuts } from '../lib/material-context-menu'
import { friendlyAcceleratorText } from '../app-menu/menu-list-item'
import { Tooltip } from '../lib/tooltip'
import { Md3IconButton, Md3SearchField } from './md3-primitives'
import { initials } from './md3-style-contract'

/**
 * The application header of the MD3 shell contract
 * (`design/History MD3.dc.html`, the `<header>` at lines 123–155).
 *
 * The contract's inline `style` strings live in
 * `app/styles/ui/_md3-app-header.scss`; the shared controls come from
 * `md3-primitives.tsx` so the header's 32px icon buttons are the same pixels as
 * every other `iconBtn` in the shell.
 *
 * Two deliberate departures from the literal contract, both required by rules
 * this repository already holds:
 *
 * - The contract hard-codes the product name as `Desktop Material`. The name is
 *   the user's to change, so it is read from the profile's app-identity
 *   customization instead. Renaming changes this label and nothing else — the
 *   data directory, the update feed and every package identifier stay put.
 * - The contract's command-palette chip reads `⌘K`. This build ships on
 *   Windows, where the palette is `Ctrl+Shift+F`; the chip renders whatever the
 *   application menu actually registered for the `command-palette` command, so
 *   the hint cannot drift from the binding.
 */

/**
 * The id of the application menu item that opens the command palette, as
 * declared in `app/src/main-process/menu/build-default-menu.ts`.
 */
const CommandPaletteMenuItemId = 'command-palette'

/**
 * The accelerator that menu item declares.
 *
 * `menuAccelerator` is a read-through of the menu the main process actually
 * built, and it is the record this chip prefers. It answers `undefined` until
 * the first menu has been delivered to the renderer, which on a cold start is
 * before the header's first paint — so the same accelerator string the menu
 * declares is the fallback, rather than an empty chip that fills in a moment
 * later.
 */
const CommandPaletteAccelerator = 'CmdOrCtrl+Shift+F'

function resolvePaletteAccelerator(): string {
  return menuAccelerator(CommandPaletteMenuItemId) ?? CommandPaletteAccelerator
}

/** The badge caps at this count and renders `99+` beyond it. */
const MaxRenderedUnreadCount = 99

export interface IMd3AppHeaderProps {
  /**
   * The profile's app identity. Only `displayName` is read: the brand mark is
   * the contract's own primary-filled square rather than the identity's logo,
   * because the contract fixes its size, radius and colour roles.
   */
  readonly appIdentity: IAppIdentityCustomization

  /** The signed-in account's initials, e.g. `CT`. */
  readonly accountInitials: string

  /**
   * The signed-in account's display name, used to name the avatar button. When
   * omitted the button is named "Account switcher" alone.
   */
  readonly accountName?: string

  /** Unread notifications. Zero hides the badge, exactly as the contract does. */
  readonly unreadCount: number

  /** The current global-search query. */
  readonly searchValue: string

  /** Whether the global search is reading its query as a regular expression. */
  readonly searchRegexEnabled: boolean

  /** Whether the navigation drawer is currently expanded. */
  readonly drawerExpanded: boolean

  readonly onToggleDrawer: () => void

  readonly onCommitAndPush: () => void

  /** Disables the commit pill — e.g. while a push is already in flight. */
  readonly commitAndPushDisabled?: boolean

  readonly onSearchChange: (value: string) => void

  readonly onSearchClear: () => void

  readonly onToggleSearchRegex: () => void

  /** Opens the regex builder anchored to the global search field. */
  readonly onOpenSearchBuilder: () => void

  /** The contract's `onContextSearch` — the search field's own context menu. */
  readonly onSearchContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  readonly onOpenPalette: () => void

  readonly onOpenNotifications: () => void

  readonly onToggleTheme: () => void

  readonly onOpenSettings: () => void

  readonly onOpenAccountSwitcher: () => void

  /** Focus target for the global search input. */
  readonly searchInputRef?: React.Ref<HTMLInputElement>

  readonly className?: string
}

/** The contract's `<header>`: brand, commit pill, global search, actions. */
export function Md3AppHeader(props: IMd3AppHeaderProps) {
  // `getAppDisplayName` is the same validator the identity editor writes
  // through, so a profile carrying a blank or control-character name renders
  // the shipped product name rather than an empty brand block.
  const displayName = getAppDisplayName(props.appIdentity.displayName)
  const brandMark = initials(displayName)

  const accelerator = resolvePaletteAccelerator()
  const shortcut = friendlyAcceleratorText(accelerator)
  const paletteLabel = t('md3.appHeader.commandPalette', { shortcut })

  const unread = Math.max(0, Math.trunc(props.unreadCount))
  const bellLabel =
    unread > 0
      ? t('md3.appHeader.notificationsUnread', { count: String(unread) })
      : t('md3.appHeader.notifications')
  const badgeLabel = t('md3.appHeader.unreadBadge', { count: String(unread) })
  const badgeText =
    unread > MaxRenderedUnreadCount ? `${MaxRenderedUnreadCount}+` : `${unread}`

  const accountLabel =
    props.accountName === undefined
      ? t('md3.appHeader.account')
      : t('md3.appHeader.accountFor', { name: props.accountName })

  const commitRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const paletteRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const bellRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const accountRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const commitLabel = t('md3.appHeader.commitAndPush')
  const commitHint = t('md3.appHeader.commitAndPushHint')

  return (
    <header
      className={classNames('md3-app-header', props.className)}
      aria-label={t('md3.appHeader.label')}
    >
      {/*
        The three block classes on the icon buttons below are the command
        palette's teleport hooks (`app/src/lib/teleport-targets.ts`). An
        `aria-label` would be the obvious thing to select on and is exactly the
        wrong thing: it is localized, so the selector would find nothing the
        moment the language mode changed.
      */}
      <Md3IconButton
        className="md3-app-header__drawer-toggle"
        icon="menu"
        iconSize={20}
        label={t('md3.appHeader.menu')}
        expanded={props.drawerExpanded}
        onClick={props.onToggleDrawer}
      />

      <div className="md3-app-header__brand">
        <span className="md3-app-header__mark" aria-hidden={true}>
          {brandMark}
        </span>
        <span className="md3-app-header__name">{displayName}</span>
      </div>

      <button
        ref={commitRef}
        type="button"
        className="md3-app-header__commit"
        disabled={props.commitAndPushDisabled}
        onClick={props.onCommitAndPush}
      >
        <Tooltip target={commitRef} applyAriaDescribedBy={false}>
          {commitHint}
        </Tooltip>
        <MaterialSymbol name="bolt" size={16} />
        <span>{commitLabel}</span>
      </button>

      <div className="md3-app-header__search">
        <div
          className="md3-app-header__search-pill"
          onContextMenu={props.onSearchContextMenu}
        >
          <Md3SearchField
            id="md3-app-header-search"
            className="md3-app-header__search-field"
            value={props.searchValue}
            placeholder={t('md3.appHeader.searchPlaceholder')}
            fieldLabel={t('md3.appHeader.searchField')}
            regexEnabled={props.searchRegexEnabled}
            iconSize={18}
            clearIconSize={16}
            builderIconSize={16}
            inputRef={props.searchInputRef}
            onChange={props.onSearchChange}
            onClear={props.onSearchClear}
            onToggleRegex={props.onToggleSearchRegex}
            onOpenBuilder={props.onOpenSearchBuilder}
          />
          <button
            ref={paletteRef}
            type="button"
            className="md3-app-header__palette"
            aria-label={paletteLabel}
            aria-keyshortcuts={ariaKeyShortcuts(accelerator)}
            aria-haspopup="dialog"
            onClick={props.onOpenPalette}
          >
            <Tooltip target={paletteRef} applyAriaDescribedBy={false}>
              {paletteLabel}
            </Tooltip>
            {shortcut}
          </button>
        </div>
      </div>

      <div className="md3-app-header__spacer" />

      <div className="md3-app-header__actions">
        {/*
          The bell is the shared `iconBtn` with the contract's badge anchored
          inside it. `Md3IconButton` takes no children, and the badge has to be
          a descendant for `position: absolute` to resolve against the button,
          so this one reuses the class rather than the component.
        */}
        <button
          ref={bellRef}
          type="button"
          className="md3-icon-button md3-app-header__bell"
          aria-label={bellLabel}
          onClick={props.onOpenNotifications}
        >
          <Tooltip target={bellRef} applyAriaDescribedBy={false}>
            {t('md3.appHeader.notifications')}
          </Tooltip>
          <MaterialSymbol name="notifications" size={20} />
          {unread > 0 ? (
            <span
              className="md3-app-header__badge"
              role="status"
              aria-label={badgeLabel}
            >
              {badgeText}
            </span>
          ) : null}
        </button>
        <Md3IconButton
          className="md3-app-header__theme"
          icon="contrast"
          iconSize={20}
          label={t('md3.appHeader.theme')}
          onClick={props.onToggleTheme}
        />
        <Md3IconButton
          className="md3-app-header__settings"
          icon="settings"
          iconSize={20}
          label={t('md3.appHeader.settings')}
          hasPopup="dialog"
          onClick={props.onOpenSettings}
        />
        <button
          ref={accountRef}
          type="button"
          className="md3-app-header__account"
          aria-label={accountLabel}
          aria-haspopup="dialog"
          onClick={props.onOpenAccountSwitcher}
        >
          <Tooltip target={accountRef} applyAriaDescribedBy={false}>
            {accountLabel}
          </Tooltip>
          <span aria-hidden={true}>{props.accountInitials}</span>
        </button>
      </div>
    </header>
  )
}
