import { AppearanceLockTargetAttribute } from './appearance-lock-target'

/**
 * Marker used for targets discovered by the renderer instrumentation boundary.
 *
 * Explicit product-owned targets keep using `data-md3-lock-target` without this
 * marker.  Keeping the two sources distinguishable matters for profile owners:
 * an automatically stamped descendant must not hide the profile-level target
 * which the appearance editor already knows how to lock.
 */
export const AppearanceAutoLockTargetAttribute = 'data-md3-auto-lock-target'

/** Raised when a new rendered element joins the lock instrumentation boundary. */
export const AppearanceElementRegistryChangedEvent =
  'desktop-material-appearance-elements-changed'

/** A stable, inspectable record for one rendered DOM element. */
export interface IAppearanceElementRegistration {
  readonly targetId: string
  readonly label: string
  readonly tagName: string
  readonly actionable: boolean
  readonly source: 'explicit' | 'automatic'
}

export interface IAppearanceElementRegistrationOptions {
  readonly targetId?: string
  readonly label?: string
}

/**
 * Controls are not the only rendered things a user can style or lock.  This
 * selector deliberately includes non-interactive elements too: a heading,
 * badge, icon, row, or panel can be an appearance target in its own right.
 */
const RenderedElementSelector =
  ':not(script):not(style):not(link):not(meta):not(title):not(noscript)'

export const AppearanceActionableElementSelector =
  'button, a, input, select, textarea, summary, [role="button"], [role="link"], ' +
  '[role="checkbox"], [role="combobox"], [role="menuitem"], [role="option"], ' +
  '[role="radio"], [role="switch"], [role="tab"], [contenteditable="true"], ' +
  '[tabindex]:not([tabindex="-1"])'

const registrations = new Map<string, IAppearanceElementRegistration>()
const elementIds = new WeakMap<Element, string>()
let observer: MutationObserver | null = null
let installed = false

function bounded(value: string, maximum: number): string {
  return value.trim().slice(0, maximum)
}

function safeHint(value: string): string {
  return bounded(value, 64).replace(/[^a-zA-Z0-9_.-]+/g, '_')
}

function elementHint(element: Element): string | null {
  const attributes = ['data-testid', 'id', 'name', 'role', 'aria-label']
  if (element.getAttribute(AppearanceAutoLockTargetAttribute) !== 'true') {
    attributes.unshift('data-md3-element-id')
  }
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute)
    if (value !== null && value.trim() !== '') {
      return safeHint(value)
    }
  }
  return null
}

function stableFingerprint(element: Element): string {
  const parts = [element.tagName.toLowerCase()]
  for (const attribute of [
    'data-md3-element-id',
    'data-testid',
    'id',
    'name',
    'role',
    'aria-label',
    'type',
  ]) {
    if (
      attribute === 'data-md3-element-id' &&
      element.getAttribute(AppearanceAutoLockTargetAttribute) === 'true'
    ) {
      continue
    }
    parts.push(`${attribute}=${element.getAttribute(attribute) ?? ''}`)
  }
  return parts.join('|')
}

function stableSiblingOrdinal(element: Element, parent: Element): number {
  const fingerprint = stableFingerprint(element)
  return Array.from(parent.children)
    .filter(sibling => stableFingerprint(sibling) === fingerprint)
    .indexOf(element)
}

/**
 * Build a stable structural identity without copying user-facing text into a
 * lock id.  Explicit ids and test ids are preferred; sibling positions make
 * otherwise identical icons and list rows distinct.  The resulting id is
 * intentionally bounded because DOM-derived strings must never become an
 * unbounded persistence input.
 */
function automaticTargetId(element: Element): string {
  const existing = elementIds.get(element)
  if (existing !== undefined) {
    return existing
  }

  // React reconciliation and DOM moves retain this marker on the actual
  // element, so sibling insertion cannot orphan an existing persisted lock.
  // A fresh equivalent DOM falls through to the semantic fingerprint below.
  const persistedMarker = element.getAttribute('data-md3-element-id')
  if (
    element.getAttribute(AppearanceAutoLockTargetAttribute) === 'true' &&
    persistedMarker !== null &&
    persistedMarker !== ''
  ) {
    elementIds.set(element, persistedMarker)
    return persistedMarker
  }

  const segments: string[] = []
  let current: Element | null = element
  while (current !== null && current !== document.body) {
    const ancestor: Element | null = current.parentElement
    const index =
      ancestor === null ? 0 : stableSiblingOrdinal(current, ancestor)
    const hint = elementHint(current)
    segments.unshift(
      `${current.tagName.toLowerCase()}-${hint ?? 'node'}-${Math.max(0, index)}`
    )
    current = ancestor
  }

  const id = `element:${bounded(segments.join('/'), 220)}`
  elementIds.set(element, id)
  return id
}

function defaultLabel(element: Element): string {
  const explicit =
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('data-md3-element-label')
  if (explicit !== null && explicit.trim() !== '') {
    return bounded(explicit, 120)
  }

  const text = bounded(element.textContent ?? '', 120).replace(/\s+/g, ' ')
  return text !== '' ? text : `${element.tagName.toLowerCase()} element`
}

function isIgnoredInfrastructure(element: Element): boolean {
  if (
    element.tagName === 'SCRIPT' ||
    element.tagName === 'STYLE' ||
    element.tagName === 'LINK' ||
    element.tagName === 'META' ||
    element.tagName === 'TITLE' ||
    element.tagName === 'NOSCRIPT' ||
    element === document.documentElement ||
    element === document.body
  ) {
    return true
  }

  // The prompt and setup surfaces are the route that answers a lock. Locking
  // their own fields would create a dead-end where the user could not answer
  // the credential that opens the target. Their underlying target remains
  // locked; only this lock infrastructure is exempt from discovery.
  return (
    element.closest(
      '.md3-lock-prompt, .md3-lock-setup-dialog, .appearance-lock-form'
    ) !== null
  )
}

function isActionable(element: Element): boolean {
  return element.matches(AppearanceActionableElementSelector)
}

function explicitTargetId(element: Element): string | null {
  const targetId = element.getAttribute(AppearanceLockTargetAttribute)
  if (
    targetId === null ||
    targetId.trim() === '' ||
    element.getAttribute(AppearanceAutoLockTargetAttribute) === 'true'
  ) {
    return null
  }
  return targetId
}

/**
 * Register one concrete element and return the target id used by the lock
 * gate.  Callers may provide a product-owned id; discovery supplies a bounded
 * structural id for every other rendered element.
 */
export function registerAppearanceElement(
  element: Element,
  options: IAppearanceElementRegistrationOptions = {}
): IAppearanceElementRegistration | null {
  if (isIgnoredInfrastructure(element)) {
    return null
  }

  const explicit = explicitTargetId(element)
  const targetId =
    options.targetId ??
    explicit ??
    element.getAttribute(AppearanceLockTargetAttribute) ??
    automaticTargetId(element)
  const source: IAppearanceElementRegistration['source'] =
    options.targetId !== undefined || explicit !== null
      ? 'explicit'
      : 'automatic'
  const label = bounded(options.label ?? defaultLabel(element), 120)

  if (source === 'automatic') {
    element.setAttribute(AppearanceLockTargetAttribute, targetId)
    element.setAttribute(AppearanceAutoLockTargetAttribute, 'true')
    element.setAttribute('data-md3-element-id', targetId)
  }

  const registration: IAppearanceElementRegistration = {
    targetId,
    label,
    tagName: element.tagName.toLowerCase(),
    actionable: isActionable(element),
    source,
  }
  registrations.set(targetId, registration)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AppearanceElementRegistryChangedEvent))
  }
  return registration
}

function registerTree(root: ParentNode): void {
  if (root instanceof Element) {
    registerAppearanceElement(root)
  }
  root
    .querySelectorAll<Element>(RenderedElementSelector)
    .forEach(element => registerAppearanceElement(element))
}

/** Return a read-only snapshot for inventories and diagnostics. */
export function listAppearanceElementRegistrations(): ReadonlyArray<IAppearanceElementRegistration> {
  return Array.from(registrations.values())
}

/** Clear the in-memory inventory; intended for focused tests only. */
export function clearAppearanceElementRegistrations(): void {
  registrations.clear()
}

/**
 * Discover every current and future rendered element.  This is installed by
 * the lock gate, so a feature cannot accidentally render outside the lock
 * contract merely because its component forgot a wrapper prop.
 */
export function installAppearanceElementInstrumentation(): void {
  if (installed || typeof document === 'undefined') {
    return
  }
  installed = true
  const root = document.body ?? document.documentElement
  registerTree(root)

  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) {
            registerTree(node)
          }
        }
      }
    })
    observer.observe(root, { childList: true, subtree: true })
  }
}

/** Stop observing without altering the DOM; the next install reuses targets. */
export function uninstallAppearanceElementInstrumentation(): void {
  observer?.disconnect()
  observer = null
  installed = false
}

/** Whether the instrumentation boundary is active. */
export function isAppearanceElementInstrumentationInstalled(): boolean {
  return installed
}

export { AppearanceLockTargetAttribute }
