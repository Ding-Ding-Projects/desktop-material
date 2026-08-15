import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { SupportTicketEntryPoint } from '../../lib/support-tickets'
import {
  SupportTicketFolderOpener,
  SupportTicketFolderResolver,
} from '../../lib/support-ticket-recovery'
import { MaterialSymbol } from '../lib/material-symbol'
import { Md3SupportTicketsDesk } from './md3-support-tickets-view'

/**
 * One of the three routes to the Support Tickets desk.
 *
 * The desk has to be reachable from the unlock prompt's "Forgotten your
 * password?" link, from the lock setting, and from Help. Each of those three is
 * this component with a different `entryPoint`, and each opens the same desk —
 * which then names the route it was reached by, so somebody who arrived from
 * the unlock prompt is not left wondering whether they are in the right place.
 *
 * The link owns the desk's open state, so a placement needs nothing but this
 * component: no dispatcher call, no popup type, no global host to remember to
 * mount. The desk itself is an overlay, so it works equally well from inside a
 * settings section and from inside a dialog.
 */

/** The link's visible words, which differ by route. */
function entryLabel(entryPoint: SupportTicketEntryPoint): string {
  switch (entryPoint) {
    case 'unlockPrompt':
      return t('supportTickets.entry.unlockPrompt')
    case 'lockSetting':
      return t('supportTickets.entry.lockSetting')
    case 'help':
      return t('supportTickets.entry.help')
  }
}

export interface IMd3SupportTicketEntryProps {
  /** Which route this placement is. */
  readonly entryPoint: SupportTicketEntryPoint

  readonly className?: string

  /** Passed straight through to the desk; injected by tests. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>

  /** Passed straight through to the desk; injected by tests. */
  readonly resolveFolder?: SupportTicketFolderResolver

  /** Passed straight through to the desk; injected by tests. */
  readonly openFolder?: SupportTicketFolderOpener

  /** Passed straight through to the desk; injected by tests. */
  readonly onExport?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>

  /** Passed straight through to the desk; injected by tests. */
  readonly onCopy?: (text: string) => void

  /** Passed straight through to the desk; injected by tests. */
  readonly now?: () => Date
}

export function Md3SupportTicketEntry(props: IMd3SupportTicketEntryProps) {
  const { entryPoint, className } = props
  const [open, setOpen] = React.useState(false)

  const onOpen = React.useCallback(() => setOpen(true), [])
  const onDismissed = React.useCallback(() => setOpen(false), [])

  const label = entryLabel(entryPoint)

  return (
    <>
      <button
        type="button"
        className={classNames('support-tickets-entry', className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('supportTickets.entry.accessibleName', { label })}
        onClick={onOpen}
      >
        <MaterialSymbol name="live_help" size={15} />
        <span>{label}</span>
      </button>
      {open ? (
        <Md3SupportTicketsDesk
          entryPoint={entryPoint}
          onDismissed={onDismissed}
          storage={props.storage}
          resolveFolder={props.resolveFolder}
          openFolder={props.openFolder}
          onExport={props.onExport}
          onCopy={props.onCopy}
          now={props.now}
        />
      ) : null}
    </>
  )
}
