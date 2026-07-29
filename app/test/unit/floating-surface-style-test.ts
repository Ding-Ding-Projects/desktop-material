import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('floating surface layout contracts', () => {
  it('portals and viewport-bounds the pull-request quick view', () => {
    const component = read('app/src/ui/pull-request-quick-view.tsx')
    const style = read('app/styles/ui/_pull-request-quick-view.scss')

    assert.match(component, /ReactDOM\.createPortal\(/)
    assert.match(component, /calculatePullRequestQuickViewGeometry\(/)
    assert.match(style, /position: fixed;/)
    assert.match(style, /max-width: calc\(100vw - 16px\);/)
    assert.match(style, /overflow-x: hidden;/)
  })

  it('clamps anchored foldouts and contracts the Worktree surface', () => {
    const dropdown = read('app/src/ui/toolbar/dropdown.tsx')
    const foldout = read('app/styles/ui/_foldout.scss')

    assert.match(dropdown, /getViewportSafeFoldoutLeft\(/)
    assert.match(dropdown, /window\.addEventListener\('resize'/)
    assert.match(
      foldout,
      /\.foldout:has\(\.worktree-list\)[\s\S]*?min-width: min\(365px, calc\(100vw - 16px\)\) !important;/
    )
  })

  it('keeps Regex Builder controls reachable and reuses dialog clamping', () => {
    const component = read('app/src/ui/lib/regex-builder/regex-builder.tsx')
    const style = read('app/styles/ui/_regex-builder.scss')

    // The overlay must portal out of its host dialog: every non-modal dialog is
    // a fixed-position containing block (transform: scale(1)) that also clips
    // (overflow: hidden), so an inline overlay is re-anchored to the small
    // dialog box and its palette/tester edges and Apply footer get cropped.
    // Portalling into a dedicated top-level layer rebinds `position: fixed` to
    // the viewport so the responsive contract below is honoured at true size.
    assert.match(component, /import \* as ReactDOM from 'react-dom'/)
    assert.match(component, /ReactDOM\.createPortal\(overlay, host\)/)
    assert.match(component, /function getRegexBuilderPortalHost\(\)/)
    assert.match(component, /const RegexBuilderLayerId = 'regex-builder-layer'/)
    assert.match(component, /host\.id = RegexBuilderLayerId/)
    // The host is an inert box (`display: contents`) so the overlay lays out and
    // stacks exactly as if it were a direct child of <body>.
    assert.match(style, /#regex-builder-layer\s*\{\s*display: contents;\s*\}/)

    assert.match(component, /clampDialogOffset\(/)
    assert.match(component, /className="regex-builder-scroll-region"/)
    assert.match(component, /role="dialog"/)
    assert.match(
      component,
      /aria-label=\{this\.accessibleText\('regex\.builder\.title'\)\}/
    )
    assert.match(
      component,
      /aria-label=\{this\.accessibleText\('regex\.builder\.patternLabel'\)\}/
    )
    assert.match(component, /this\.patternInputRef\.current\?\.focus\(\)/)
    assert.match(
      component,
      /returnFocusElement\?\.isConnected[\s\S]*?returnFocusElement\.focus\(\)/
    )
    assert.match(component, /onPointerCancel=\{this\.onHeaderPointerUp\}/)
    assert.match(
      style,
      /\.regex-builder-scroll-region\s*\{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/
    )
    assert.match(
      style,
      /\.regex-builder-palette\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow-x: hidden;/
    )
    // v2 prototype: content-sized token chips wrap in a contained flex row.
    assert.match(
      style,
      /\.regex-builder-tokens\s*\{[\s\S]*?min-width: 0;[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow-y: auto;/
    )
    assert.match(style, /@media \(max-width: 760px\)/)
    assert.match(style, /@media \(max-width: 620px\)/)
    assert.match(style, /@media \(max-height: 420px\)/)
  })

  it('keeps every feature-owned dialog on the dialog layer', () => {
    const strip = read('app/src/ui/repository-tabs/repository-tab-strip.tsx')
    const portal = read('app/src/ui/dialog/dialog-layer.tsx')
    const layer = read('app/styles/ui/_dialog-layer.scss')
    const tooltips = read('app/styles/ui/window/_tooltips.scss')

    // The stacking contract is *membership of #dialog-layer*, not a z-index
    // number: only `#dialog-layer dialog[open]` gives a dialog `position:
    // fixed` and the popup z-index. Nothing else in the app raises a dialog.
    assert.match(
      layer,
      /#dialog-layer\s*\{[\s\S]*?z-index: var\(--popup-z-index\);/
    )
    assert.match(layer, /dialog\s*\{\s*&\[open\]\s*\{[\s\S]*?position: fixed;/)

    // …because `Dialog` always carries `tooltip-host`, whose `position:
    // relative` beats the UA `position: absolute` a <dialog> starts with. A
    // dialog rendered anywhere else is therefore an ordinary in-flow box with
    // `z-index: auto`, which is how the New tab group dialog ended up laid out
    // inside the tab strip and painted under the app bar's pills (#92).
    assert.match(tooltips, /\.tooltip-host\s*\{[\s\S]*?position: relative;/)

    assert.match(portal, /ReactDOM\.createPortal\(content, host\)/)
    assert.match(portal, /export const DialogLayerId = 'dialog-layer'/)
    assert.match(portal, /document\.getElementById\(DialogLayerId\)/)

    // Both tab-group dialogs go through the portal, and the strip renders no
    // bare <Dialog> of its own.
    assert.match(
      strip,
      /<DialogLayerPortal>\s*<CreateTabGroupDialog/,
      'CreateTabGroupDialog must render inside the dialog layer'
    )
    assert.match(
      strip,
      /<DialogLayerPortal>\s*<EditTabGroupDialog/,
      'EditTabGroupDialog must render inside the dialog layer'
    )
  })

  it('guards long side-sheet and notification text', () => {
    const foldout = read('app/styles/ui/_foldout.scss')
    const notifications = read('app/styles/ui/_notification-centre.scss')

    assert.match(
      foldout,
      /\.side-sheet-title\s*\{[\s\S]*?min-width: 0;[\s\S]*?text-overflow: ellipsis;/
    )
    assert.match(
      notifications,
      /\.notification-item-title\s*\{[\s\S]*?overflow-wrap: anywhere;/
    )
    assert.match(
      notifications,
      /\.notification-item-text\s*\{[\s\S]*?overflow-wrap: anywhere;/
    )
  })
})
