import {
  IMd3ActiveUnlock,
  IMd3Lock,
  Md3LockSurfaceKind,
  Md3LockSurfaceKinds,
  isMd3UnlockActive,
  isTargetLocked,
  locksForTarget,
  Md3LocksChangedEvent,
  readMd3Locks,
} from '../../lib/md3-locks'
import {
  ProfileAppearanceOwnerSelectors,
  profileAppearanceLockTargetId,
} from '../../models/element-appearance'
import {
  AppearanceAutoLockTargetAttribute,
  AppearanceActionableElementSelector,
  AppearanceElementRegistryChangedEvent,
  AppearanceLockTargetAttribute,
  installAppearanceElementInstrumentation,
  uninstallAppearanceElementInstrumentation,
} from './appearance-lock-element-registry'
export { AppearanceLockTargetAttribute } from './appearance-lock-element-registry'

/** Optional lock-surface kind for targets such as tabs and tab groups. */
export const AppearanceLockTargetKindAttribute = 'data-md3-lock-kind'

/**
 * A lock on an element's appearance also locks the element.
 *
 * WHY THIS EXISTS
 *
 * Locking an element used to record a lock and then change nothing: the lock
 * appeared in the manager, the element carried on working exactly as before,
 * and the only thing standing between the user and the "locked" control was a
 * row in a list. A lock nobody can feel is not a speed bump, it is a note.
 *
 * So the lock now gates the element's own activation as well as its
 * appearance. One capture-phase listener rather than a check inside every
 * control, for the same reason the appearance gesture is one predicate: a
 * guard implemented per control is implemented differently per control, and
 * the ones nobody thought about are the ones that stay open.
 *
 * HOW AN ELEMENT OPTS IN
 *
 * By carrying its lock target id in the DOM, via `appearanceLockTargetProps`.
 * The attribute is the join between a lock record (which knows only an id) and
 * a rendered element (which knows only itself), and it has to be in the DOM
 * because the listener meets an event target, not a component.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It is still a toy lock and the honesty rules are unchanged. It stops an
 * activation and asks for the credential; it does not encrypt the control, it
 * does not hide it, and it never claims to protect anything. Anyone who has
 * this computer can delete one folder and remove every lock on it.
 */

/** Raised when a locked element is activated. The shell opens the prompt. */
export const AppearanceLockBlockedEvent = 'desktop-material-lock-blocked'

/** Raised by the universal context/keyboard lock-creation affordance. */
export const AppearanceLockCreationRequestedEvent =
  'desktop-material-lock-creation-requested'
export const AppearanceUnlocksChangedEvent =
  'desktop-material-appearance-unlocks-changed'

export interface IAppearanceLockBlockedDetail {
  readonly targetId: string
  readonly targetKind?: Md3LockSurfaceKind
  /** The element that was activated, so the prompt can anchor to it. */
  readonly anchor: HTMLElement
}

export interface IAppearanceLockTargetResolution {
  readonly targetId: string
  readonly targetKind: Md3LockSurfaceKind
  readonly anchor: HTMLElement
}

export interface IAppearanceLockCreationRequestedDetail {
  readonly targetId: string
  readonly targetLabel: string
  readonly anchor: HTMLElement
  /** True when an existing menu item already supplied the command label. */
  readonly openWizard?: boolean
}

let pendingContextMenuTarget: {
  readonly detail: IAppearanceLockCreationRequestedDetail
  readonly expiresAt: number
} | null = null

/** The semantic attributes every locked target exposes to assistive tech. */
export interface IAppearanceLockTargetSemantics {
  readonly 'aria-disabled': 'true' | undefined
  readonly 'data-md3-locked': 'true' | undefined
}

/**
 * Props to spread onto an element that has a lockable appearance.
 *
 * Returned as props rather than set imperatively so the attribute cannot drift
 * out of sync with the `lockTargetId` the editor was given — both come from
 * the same expression at the same call site.
 */
export function appearanceLockTargetProps(
  targetId: string,
  targetKind: Md3LockSurfaceKind = 'appearanceElement'
) {
  const semantics = appearanceLockTargetSemantics(
    targetId,
    Date.now(),
    targetKind
  )
  const props: Record<string, string> = {
    [AppearanceLockTargetAttribute]: targetId,
  }
  if (targetKind !== 'appearanceElement') {
    props[AppearanceLockTargetKindAttribute] = targetKind
  }
  if (semantics['aria-disabled'] !== undefined) {
    props['aria-disabled'] = semantics['aria-disabled']
  }
  if (semantics['data-md3-locked'] !== undefined) {
    props['data-md3-locked'] = semantics['data-md3-locked']
  }
  return props
}

/**
 * Return the current lock semantics for a rendered target.
 *
 * `aria-disabled` accompanies the native `disabled` property where the
 * platform exposes one. The capture gate remains the prompt route for pointer
 * and keyboard attempts, while this pair makes the state visible to assistive
 * technology and DOM-driven integrations.
 */
export function appearanceLockTargetSemantics(
  targetId: string,
  now: number = Date.now(),
  targetKind: Md3LockSurfaceKind = 'appearanceElement'
): IAppearanceLockTargetSemantics {
  const locked = isMd3TargetBlocked(targetKind, targetId, now)
  return {
    'aria-disabled': locked ? 'true' : undefined,
    'data-md3-locked': locked ? 'true' : undefined,
  }
}

/**
 * Live unlocks, by lock id. In memory only.
 *
 * Persisting these would mean a lock the user opened once stayed open across a
 * restart, which is the opposite of what `lockOnLaunch` promises.
 */
const unlocks = new Map<string, IMd3ActiveUnlock>()
const launchUnlockIds = new Set<string>()

/** Native disabled values are restored after the last applicable lock opens. */
const nativeDisabledBeforeAppearanceLock = new WeakMap<HTMLElement, boolean>()

export function recordAppearanceUnlock(unlock: IMd3ActiveUnlock): void {
  launchUnlockIds.delete(unlock.lockId)
  unlocks.set(unlock.lockId, unlock)
  refreshAppearanceLockSemantics()
  notifyAppearanceUnlocksChanged()
}

export function forgetAppearanceUnlock(lockId: string): void {
  unlocks.delete(lockId)
  launchUnlockIds.delete(lockId)
  refreshAppearanceLockSemantics()
  notifyAppearanceUnlocksChanged()
}

/** Exists so a test can start from a known state. */
export function clearAppearanceUnlocks(): void {
  unlocks.clear()
  launchUnlockIds.clear()
  refreshAppearanceLockSemantics()
  notifyAppearanceUnlocksChanged()
}

export function getAppearanceUnlocks(): ReadonlyArray<IMd3ActiveUnlock> {
  return Array.from(unlocks.values())
}

function notifyAppearanceUnlocksChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AppearanceUnlocksChangedEvent))
  }
}

/**
 * Apply the persisted lock-on-launch choice when the renderer starts. A lock
 * configured with `lockOnLaunch: false` is intentionally open for this app
 * session until the user chooses Lock again; the setting is not decorative.
 */
export function initializeAppearanceUnlocksForLaunch(): void {
  for (const lock of readMd3Locks()) {
    if (!lock.lockOnLaunch && !unlocks.has(lock.id)) {
      unlocks.set(lock.id, {
        lockId: lock.id,
        kind: 'session',
        expiresAt: null,
      })
      launchUnlockIds.add(lock.id)
    }
  }
  refreshAppearanceLockSemantics()
  notifyAppearanceUnlocksChanged()
}

/** Return the first credential that is still required for one target. */
export function firstLockedAppearanceLock(
  targetId: string,
  now: number = Date.now(),
  kind: Md3LockSurfaceKind = 'appearanceElement'
): IMd3Lock | null {
  return (
    locksForTarget(readMd3Locks(), kind, targetId).find(
      lock => !isMd3UnlockActive(unlocks.get(lock.id), now)
    ) ?? null
  )
}

/** Return the first credential still required for an exact surface kind. */
export function firstLockedTargetLock(
  targetKind: Md3LockSurfaceKind,
  targetId: string,
  now: number = Date.now()
): IMd3Lock | null {
  return firstLockedAppearanceLock(targetId, now, targetKind)
}

/**
 * Whether activating this target should be stopped right now.
 *
 * A target with no lock is never blocked. A target with a lock is blocked
 * unless every one of its locks has a live unlock — two locks on one element
 * are two answers, and opening one of them is not opening the element.
 */
export function isAppearanceTargetBlocked(
  targetId: string,
  now: number = Date.now()
): boolean {
  return isMd3TargetBlocked('appearanceElement', targetId, now)
}

/** Whether any lock blocks one exact surface-kind and target-id pair. */
export function isMd3TargetBlocked(
  targetKind: Md3LockSurfaceKind,
  targetId: string,
  now: number = Date.now()
): boolean {
  const locks = readMd3Locks()
  if (!isTargetLocked(locks, targetKind, targetId)) {
    return false
  }

  return !locks
    .filter(
      lock => lock.target.kind === targetKind && lock.target.id === targetId
    )
    .every(lock => isMd3UnlockActive(unlocks.get(lock.id), now))
}

/**
 * The nearest ancestor that declares a lock target, including the element
 * itself. A locked button whose label carries the click is still the button's
 * activation, so the walk starts at the event target rather than at the
 * element the handler happens to be bound to.
 */
export function resolveAppearanceLockTarget(
  node: EventTarget | null
): IAppearanceLockTargetResolution | null {
  return resolveAppearanceLockTargets(node)[0] ?? null
}

/**
 * Resolve every lock that applies to one activation, not merely the nearest
 * DOM owner. A toolbar can be locked while one of its buttons has its own
 * independent lock; either credential must then be answered. Returning the
 * complete chain is what prevents an auto-stamped descendant from becoming a
 * side door around a profile, tab, or group lock.
 */
export function resolveAppearanceLockTargets(
  node: EventTarget | null
): ReadonlyArray<IAppearanceLockTargetResolution> {
  if (!(node instanceof Element)) {
    return []
  }

  const resolutions: IAppearanceLockTargetResolution[] = []
  const seen = new Set<string>()
  const add = (
    targetId: string,
    anchor: HTMLElement,
    targetKind: Md3LockSurfaceKind = readTargetKind(anchor)
  ) => {
    const key = `${targetKind}:${targetId}`
    if (targetId !== '' && !seen.has(key)) {
      seen.add(key)
      resolutions.push({ targetId, targetKind, anchor })
    }
  }

  // An explicit product-owned attribute wins. Automatically discovered
  // attributes are handled below as independent entries, so they cannot hide
  // an explicit tab, group, or appearance owner.
  let current: Element | null = node
  while (current !== null) {
    if (current instanceof HTMLElement) {
      const targetId = current.getAttribute(AppearanceLockTargetAttribute)
      const automatic =
        current.getAttribute(AppearanceAutoLockTargetAttribute) === 'true'
      if (!automatic && targetId !== null && targetId !== '') {
        add(targetId, current)
      }
    }
    current = current.parentElement
  }

  // Add every automatically discovered target in the event's ancestor chain.
  // The nearest actionable ancestor is first so a child icon/label still
  // anchors to the control whose action it represents, while non-actionable
  // elements retain their own independent identity for appearance locks.
  // A click on a child icon or label is still the activation of its nearest
  // actionable ancestor. Without this walk, auto-stamping both a button and
  // its span would let a lock on the button be bypassed through the span.
  let automaticOwner: Element | null =
    node instanceof HTMLElement
      ? node
      : node instanceof Element
      ? node.parentElement
      : null
  while (automaticOwner !== null) {
    const targetId = automaticOwner.getAttribute(AppearanceLockTargetAttribute)
    if (
      automaticOwner.getAttribute(AppearanceAutoLockTargetAttribute) ===
        'true' &&
      automaticOwner.matches(AppearanceActionableElementSelector) &&
      targetId !== null &&
      targetId !== '' &&
      automaticOwner instanceof HTMLElement
    ) {
      add(targetId, automaticOwner)
    }
    automaticOwner = automaticOwner.parentElement
  }

  // Profile-level owners remain separate independent targets. A plain
  // descendant that is not itself actionable is still the profile owner's
  // appearance target; a button can therefore require both answers.
  for (const [selector, elementId] of ProfileAppearanceOwnerSelectors) {
    const anchor = node.closest(selector)
    if (anchor instanceof HTMLElement) {
      add(profileAppearanceLockTargetId(elementId), anchor, 'appearanceElement')
    }
  }

  // Finally include every automatically discovered non-actionable target in
  // the chain, including the event target itself when it is a DOM element.
  current = node
  while (current !== null) {
    if (current instanceof HTMLElement) {
      const targetId = current.getAttribute(AppearanceLockTargetAttribute)
      if (
        current.getAttribute(AppearanceAutoLockTargetAttribute) === 'true' &&
        targetId !== null &&
        targetId !== '' &&
        !current.matches(AppearanceActionableElementSelector)
      ) {
        add(targetId, current)
      }
    }
    current = current.parentElement
  }

  return resolutions
}

/**
 * Resolve the exact element being offered the creation command. Activation
 * still includes its actionable ancestor chain, but a user opening the menu
 * on an icon/label is allowed to lock that concrete rendered element itself.
 */
export function resolveAppearanceLockCreationTarget(
  node: EventTarget | null
): IAppearanceLockTargetResolution | null {
  if (!(node instanceof Element)) {
    return null
  }
  let current: Element | null = node
  while (current !== null) {
    if (current instanceof HTMLElement) {
      const targetId = current.getAttribute(AppearanceLockTargetAttribute)
      if (targetId !== null && targetId !== '') {
        return {
          targetId,
          targetKind: readTargetKind(current),
          anchor: current,
        }
      }
    }
    current = current.parentElement
  }
  return resolveAppearanceLockTargets(node)[0] ?? null
}

function readTargetKind(element: Element): Md3LockSurfaceKind {
  const raw = element.getAttribute(AppearanceLockTargetKindAttribute)
  return raw !== null && Md3LockSurfaceKinds.includes(raw as Md3LockSurfaceKind)
    ? (raw as Md3LockSurfaceKind)
    : 'appearanceElement'
}

/**
 * Stop an activation of a locked element and ask the shell for the prompt.
 *
 * Returns whether the event was blocked, so a caller can tell the difference
 * between "no lock here" and "handled".
 */
function gate(event: Event): boolean {
  const resolved = resolveAppearanceLockTargets(event.target)
  const blocked = resolved.find(target =>
    isMd3TargetBlocked(target.targetKind, target.targetId)
  )
  if (blocked === undefined) {
    return false
  }

  // Capture phase plus `stopImmediatePropagation`: a handler bound directly to
  // the element would otherwise still run, and the control would perform its
  // action behind the prompt asking permission for it.
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  announceAppearanceLockBlocked(
    blocked.targetId,
    blocked.anchor,
    blocked.targetKind
  )
  return true
}

/** Announce one blocked activation to the mounted prompt host. */
export function announceAppearanceLockBlocked(
  targetId: string,
  anchor: HTMLElement,
  targetKind: Md3LockSurfaceKind = 'appearanceElement'
): void {
  refreshAppearanceLockSemantics()
  const detail: IAppearanceLockBlockedDetail = {
    targetId,
    anchor,
    targetKind,
  }
  window.dispatchEvent(new CustomEvent(AppearanceLockBlockedEvent, { detail }))
}

/** Ask the mounted host to show the target-specific Lock this element command. */
export function announceAppearanceLockCreation(
  targetId: string,
  targetLabel: string,
  anchor: HTMLElement,
  openWizard = false
): void {
  const detail: IAppearanceLockCreationRequestedDetail = {
    targetId,
    targetLabel,
    anchor,
    openWizard,
  }
  window.dispatchEvent(
    new CustomEvent(AppearanceLockCreationRequestedEvent, { detail })
  )
}

/**
 * Claim the exact target of the most recent owner-backed context menu. The
 * menu builder consumes this once and appends the lock item to its existing
 * items; a stale event cannot leak into a later unrelated menu.
 */
export function consumeAppearanceLockContextMenuTarget(): IAppearanceLockCreationRequestedDetail | null {
  const pending = pendingContextMenuTarget
  pendingContextMenuTarget = null
  if (pending === null || pending.expiresAt < Date.now()) {
    return null
  }
  return pending.detail
}

/**
 * Guard an activation that does not travel through the DOM event system.
 *
 * Palette commands, context-menu callbacks, shortcut dispatch, and parent
 * callbacks can all invoke an action directly. Every one uses this helper so
 * a locked target cannot be reached merely by choosing a different input
 * route. The callback is never replayed after the prompt succeeds; the user
 * must activate it again deliberately.
 */
export function guardAppearanceActivation(
  targetId: string,
  anchor: HTMLElement,
  activate: () => void,
  targetKind: Md3LockSurfaceKind = 'appearanceElement'
): boolean {
  const blockedTarget = [
    { targetId, anchor, targetKind },
    ...resolveAppearanceLockTargets(anchor).filter(
      target =>
        target.targetId !== targetId || target.targetKind !== targetKind
    ),
  ].find(target => isMd3TargetBlocked(target.targetKind, target.targetId))
  if (blockedTarget !== undefined) {
    announceAppearanceLockBlocked(
      blockedTarget.targetId,
      blockedTarget.anchor,
      blockedTarget.targetKind
    )
    return false
  }
  activate()
  return true
}

/** Guard a direct callback using the target id carried by an element. */
export function guardAppearanceElementActivation(
  anchor: HTMLElement,
  activate: () => void
): boolean {
  const resolved = resolveAppearanceLockTargets(anchor)
  if (resolved.length === 0) {
    activate()
    return true
  }
  const blockedTarget = resolved.find(target =>
    isMd3TargetBlocked(target.targetKind, target.targetId)
  )
  if (blockedTarget !== undefined) {
    announceAppearanceLockBlocked(
      blockedTarget.targetId,
      blockedTarget.anchor,
      blockedTarget.targetKind
    )
    return false
  }
  activate()
  return true
}

/**
 * Keep semantic attributes current even when a lock is created by a separate
 * settings surface and the target itself does not re-render.
 */
export function refreshAppearanceLockSemantics(): void {
  if (typeof document === 'undefined') {
    return
  }

  const liveLockIds = new Set(readMd3Locks().map(lock => lock.id))
  const liveLocks = readMd3Locks()
  for (const lockId of unlocks.keys()) {
    if (!liveLockIds.has(lockId)) {
      unlocks.delete(lockId)
      launchUnlockIds.delete(lockId)
    }
  }
  for (const lock of liveLocks) {
    if (lock.lockOnLaunch && launchUnlockIds.has(lock.id)) {
      launchUnlockIds.delete(lock.id)
      unlocks.delete(lock.id)
    }
  }

  const targets = new Set<HTMLElement>()
  document
    .querySelectorAll<HTMLElement>(`[${AppearanceLockTargetAttribute}]`)
    .forEach(element => targets.add(element))
  for (const [selector] of ProfileAppearanceOwnerSelectors) {
    document
      .querySelectorAll<HTMLElement>(selector)
      .forEach(element => targets.add(element))
  }

  for (const element of targets) {
    const resolved = resolveAppearanceLockTargets(element)
    if (resolved.length === 0) {
      continue
    }
    const locked = resolved.some(target =>
      isMd3TargetBlocked(target.targetKind, target.targetId)
    )
    if (!locked) {
      element.removeAttribute('aria-disabled')
      element.removeAttribute('data-md3-locked')
      restoreNativeDisabledState(element)
    } else {
      element.setAttribute('aria-disabled', 'true')
      element.setAttribute('data-md3-locked', 'true')
      setNativeDisabledState(element)
    }
  }
}

type NativeDisableableElement =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement
  | HTMLFieldSetElement
  | HTMLOptGroupElement
  | HTMLOptionElement

function isNativeDisableableElement(
  element: HTMLElement
): element is NativeDisableableElement {
  return (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLFieldSetElement ||
    element instanceof HTMLOptGroupElement ||
    element instanceof HTMLOptionElement
  )
}

function setNativeDisabledState(element: HTMLElement): void {
  if (!isNativeDisableableElement(element)) {
    return
  }
  if (!nativeDisabledBeforeAppearanceLock.has(element)) {
    nativeDisabledBeforeAppearanceLock.set(element, element.disabled)
  }
  element.disabled = true
}

function restoreNativeDisabledState(element: HTMLElement): void {
  if (!isNativeDisableableElement(element)) {
    return
  }
  const before = nativeDisabledBeforeAppearanceLock.get(element)
  if (before === undefined) {
    return
  }
  element.disabled = before
  nativeDisabledBeforeAppearanceLock.delete(element)
}

const onPointer = (event: Event) => {
  gate(event)
}

function scheduleUnownedContextMenuFallback(
  detail: IAppearanceLockCreationRequestedDetail
): void {
  window.setTimeout(() => {
    const pending = pendingContextMenuTarget
    if (
      pending === null ||
      pending.detail.targetId !== detail.targetId ||
      pending.detail.anchor !== detail.anchor ||
      pending.expiresAt < Date.now()
    ) {
      return
    }
    pendingContextMenuTarget = null
    announceAppearanceLockCreation(
      detail.targetId,
      detail.targetLabel,
      detail.anchor
    )
  }, 0)
}

function targetLabel(anchor: HTMLElement): string {
  const explicit =
    anchor.getAttribute('data-md3-element-label') ?? anchor.getAttribute('role')
  if (explicit !== null && explicit.trim() !== '') {
    return explicit.trim().slice(0, 120)
  }
  return `${anchor.tagName.toLowerCase()} element`
}

const onContextMenu = (event: Event) => {
  if (gate(event)) {
    return
  }
  const target = resolveAppearanceLockCreationTarget(event.target)
  if (target !== null) {
    const detail: IAppearanceLockCreationRequestedDetail = {
      targetId: target.targetId,
      targetLabel: targetLabel(target.anchor),
      anchor: target.anchor,
    }
    const isShiftPointer =
      event instanceof MouseEvent && event.button === 2 && event.shiftKey
    // Shift+right-click is the frozen shell's appearance-editor gesture for
    // fallback owners without a data-context-menu-owner. Let that owner open
    // its editor; its own appearance lock control remains available there.
    if (isShiftPointer) {
      pendingContextMenuTarget = null
      return
    }
    // Suppress the browser menu once, but let the event reach any existing
    // React surface. Its call to showContextualMenu consumes the pending
    // target and appends the lock item to that same menu. If no owner handles
    // it, the next task opens the one generic lock menu instead.
    event.preventDefault()
    pendingContextMenuTarget = { detail, expiresAt: Date.now() + 1_500 }
    scheduleUnownedContextMenuFallback(detail)
  }
}

function isLockCreationShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === 'ContextMenu' ||
    (event.key === 'F10' && event.shiftKey) ||
    ((event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'l')
  )
}

const onKeyDown = (event: KeyboardEvent) => {
  const source =
    event.target instanceof Element ? event.target : document.activeElement
  const resolved = resolveAppearanceLockTargets(source)
  if (isLockCreationShortcut(event)) {
    const target = resolveAppearanceLockCreationTarget(source)
    if (target === null) {
      return
    }
    if (
      resolved.some(entry =>
        isMd3TargetBlocked(entry.targetKind, entry.targetId)
      )
    ) {
      gate(event)
      return
    }
    const sourceElement = source instanceof Element ? source : null
    const existingMenuOwner =
      sourceElement !== null &&
      sourceElement.closest('[data-context-menu-owner]') !== null
    const ownerKeyboardMenu =
      existingMenuOwner &&
      (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))
    if (ownerKeyboardMenu) {
      pendingContextMenuTarget = {
        detail: {
          targetId: target.targetId,
          targetLabel: targetLabel(target.anchor),
          anchor: target.anchor,
        },
        expiresAt: Date.now() + 1_500,
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    announceAppearanceLockCreation(
      target.targetId,
      targetLabel(target.anchor),
      target.anchor
    )
    return
  }
  if (
    !resolved.some(target =>
      isMd3TargetBlocked(target.targetKind, target.targetId)
    )
  ) {
    return
  }

  // Navigation through a locked button/tab remains possible. Editable and
  // choice controls, however, change state through ordinary keys such as
  // arrows or Backspace, so every key except focus escape routes is blocked.
  const anchor = resolved[0]?.anchor
  const interactiveEditor = anchor?.matches(
    'input, select, textarea, [contenteditable="true"]'
  )
  const activationKey =
    event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
  if (!interactiveEditor && !activationKey) {
    return
  }
  gate(event)
}

const onKeyUp = (event: KeyboardEvent) => {
  const resolved = resolveAppearanceLockTargets(event.target)
  if (
    !resolved.some(target =>
      isMd3TargetBlocked(target.targetKind, target.targetId)
    )
  ) {
    return
  }
  const anchor = resolved[0]?.anchor
  const interactiveEditor = anchor?.matches(
    'input, select, textarea, [contenteditable="true"]'
  )
  const activationKey =
    event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
  if (interactiveEditor || activationKey) {
    gate(event)
  }
}

let installed = false

/** Install the gate. Call once, during renderer start-up. */
export function installAppearanceLockGate(): void {
  if (installed) {
    return
  }
  installed = true
  installAppearanceElementInstrumentation()
  initializeAppearanceUnlocksForLaunch()
  // Pointer-down as well as click, because a control that acts on press — and
  // several do — would otherwise have already acted by the time click arrived.
  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('click', onPointer, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyUp, true)
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('auxclick', onPointer, true)
  document.addEventListener('dblclick', onPointer, true)
  document.addEventListener('change', onPointer, true)
  document.addEventListener('input', onPointer, true)
  window.addEventListener(Md3LocksChangedEvent, refreshAppearanceLockSemantics)
  window.addEventListener(
    AppearanceElementRegistryChangedEvent,
    refreshAppearanceLockSemantics
  )
  refreshAppearanceLockSemantics()
}

/** Exists so a test can leave the document as it found it. */
export function uninstallAppearanceLockGate(): void {
  installed = false
  document.removeEventListener('pointerdown', onPointer, true)
  document.removeEventListener('click', onPointer, true)
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('keyup', onKeyUp, true)
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('auxclick', onPointer, true)
  document.removeEventListener('dblclick', onPointer, true)
  document.removeEventListener('change', onPointer, true)
  document.removeEventListener('input', onPointer, true)
  window.removeEventListener(
    Md3LocksChangedEvent,
    refreshAppearanceLockSemantics
  )
  window.removeEventListener(
    AppearanceElementRegistryChangedEvent,
    refreshAppearanceLockSemantics
  )
  unlocks.clear()
  launchUnlockIds.clear()
  refreshAppearanceLockSemantics()
  notifyAppearanceUnlocksChanged()
  uninstallAppearanceElementInstrumentation()
}
