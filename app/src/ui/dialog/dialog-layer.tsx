import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { DialogStackContext } from './dialog'

/**
 * Id of the top-level layer every floating dialog belongs to.
 *
 * `App` renders it once (`renderPopups`) as a sibling of the tab strip, the
 * toolbar and the repository view. _dialog-layer.scss gives it the popup
 * z-index and gives the `<dialog>` elements inside it their fixed, centered,
 * viewport-bounded geometry.
 */
export const DialogLayerId = 'dialog-layer'

/** The live dialog layer, or null before `App` has committed its first render. */
export function getDialogLayerHost(): HTMLElement | null {
  return typeof document === 'undefined'
    ? null
    : document.getElementById(DialogLayerId)
}

interface IDialogLayerPortalProps {
  /** The dialog to render inside the app's dialog layer. */
  readonly children: React.ReactNode
}

/**
 * Render a feature-owned `<Dialog>` inside the app's `#dialog-layer`.
 *
 * A `<dialog>` rendered anywhere else is not merely un-elevated, it is laid out
 * in normal flow. The UA stylesheet gives every `<dialog>` `position: absolute`,
 * but `Dialog` always carries the `tooltip-host` class and `.tooltip-host` sets
 * `position: relative` (_tooltips.scss) — which wins over the UA rule. Only the
 * `#dialog-layer dialog[open]` rule in _dialog-layer.scss puts it back out of
 * flow (`position: fixed`) and onto the popup layer.
 *
 * So an inline dialog becomes an ordinary in-flow box with `z-index: auto`,
 * inflating whatever flex row hosts it and painting *below* every later,
 * positioned sibling. That is exactly how the New tab group dialog ended up
 * spread across the tab strip with the app bar's Fetch origin / Commit & push /
 * Build & run pills drawn on top of its colour swatches (#92).
 *
 * Portalling here restores the whole contract at once — out of flow, centered,
 * bounded to the viewport, at `--popup-z-index` — without raising the tab strip
 * itself and without displacing anything that must stay above the popup layer
 * (tooltips at `--tooltip-z-index`, the Material context menu on its own
 * backdrop, notifications, the regex builder layer).
 *
 * React portals preserve component-tree event bubbling, so dialogs moved here
 * keep receiving the events their owning component listens for.
 */
export function DialogLayerPortal(
  props: IDialogLayerPortalProps
): JSX.Element | null {
  const host = getDialogLayerHost()

  // A feature dialog is opened by a user gesture, long after `App` mounted, so
  // the layer is always there in the running app. Rendering in place is only a
  // last resort for a component mounted outside `App` (tests, storybooks).
  const content = (
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      {props.children}
    </DialogStackContext.Provider>
  )

  return host === null ? content : ReactDOM.createPortal(content, host)
}
