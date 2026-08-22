import {
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3LockTarget,
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

/** The attribute an element carries so the gate can recognise it. */
export const AppearanceLockTargetAttribute = 'data-md3-lock-target'

/** Optional target-kind attribute for non-appearance locks. */
export const AppearanceLockTargetKindAttribute = 'data-md3-lock-kind'

/** Raised when a locked element is activated. The shell opens the prompt. */
export const AppearanceLockBlockedEvent = 'desktop-material-lock-blocked'

export interface IAppearanceLockBlockedDetail {
  readonly targetId: string
  readonly targetKind: IMd3LockTarget['kind']
  /** The element that was activated, so the prompt can anchor to it. */
  readonly anchor: HTMLElement
}

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
  targetKind: IMd3LockTarget['kind'] = 'appearanceElement'
) {
  const semantics = appearanceLockTargetSemantics(targetId, targetKind)
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
 * `aria-disabled` is deliberately used instead of the native `disabled`
 * property: a native-disabled button would prevent the activation event from
 * reaching the prompt host. The capture gate supplies the behavioral block;
 * this pair makes the state visible to assistive technology and DOM-driven
 * integrations without making the unlock route unreachable.
 */
export function appearanceLockTargetSemantics(
  targetId: string,
  targetKind: IMd3LockTarget['kind'] = 'appearanceElement',
  now: number = Date.now()
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

export function recordAppearanceUnlock(unlock: IMd3ActiveUnlock): void {
  unlocks.set(unlock.lockId, unlock)
  refreshAppearanceLockSemantics()
}

export function forgetAppearanceUnlock(lockId: string): void {
  unlocks.delete(lockId)
  refreshAppearanceLockSemantics()
}

/** Exists so a test can start from a known state. */
export function clearAppearanceUnlocks(): void {
  unlocks.clear()
  refreshAppearanceLockSemantics()
}

/** Return the first credential that is still required for one target. */
export function firstLockedAppearanceLock(
  targetId: string,
  now: number = Date.now()
): IMd3Lock | null {
  return firstLockedTargetLock('appearanceElement', targetId, now)
}

/** Return the first credential still required for any lockable target kind. */
export function firstLockedTargetLock(
  targetKind: IMd3LockTarget['kind'],
  targetId: string,
  now: number = Date.now()
): IMd3Lock | null {
  return (
    locksForTarget(readMd3Locks(), targetKind, targetId).find(
      lock => !isMd3UnlockActive(unlocks.get(lock.id), now)
    ) ?? null
  )
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

/** Whether any lock of the supplied kind blocks the exact target. */
export function isMd3TargetBlocked(
  targetKind: IMd3LockTarget['kind'],
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
export function resolveAppearanceLockTarget(node: EventTarget | null): {
  targetId: string
  targetKind: IMd3LockTarget['kind']
  anchor: HTMLElement
} | null {
  if (!(node instanceof Element)) {
    return null
  }

  // An explicit attribute wins. It is the more specific of the two routes —
  // a repository tab declares itself, and must not be resolved as the tab
  // strip that contains it.
  const owner = node.closest(`[${AppearanceLockTargetAttribute}]`)
  if (owner instanceof HTMLElement) {
    const targetId = owner.getAttribute(AppearanceLockTargetAttribute)
    if (targetId !== null && targetId !== '') {
      return {
        targetId,
        targetKind: readTargetKind(owner),
        anchor: owner,
      }
    }
  }

  // Then the profile-level owners, resolved from the same table the appearance
  // editor uses. These have no fixed anchor to stamp: any element inside the
  // toolbar is the toolbar's appearance target, so the gate has to walk for
  // them exactly as the editor does. Sharing the table is what stops a lock
  // created from one element being looked for on another — which would leave
  // the lock recorded, listed, and gating nothing.
  for (const [selector, elementId] of ProfileAppearanceOwnerSelectors) {
    const anchor = node.closest(selector)
    if (anchor instanceof HTMLElement) {
      return {
        targetId: profileAppearanceLockTargetId(elementId),
        targetKind: 'appearanceElement',
        anchor,
      }
    }
  }

  return null
}

function readTargetKind(element: Element): IMd3LockTarget['kind'] {
  const raw = element.getAttribute(AppearanceLockTargetKindAttribute)
  return raw === 'tab' ||
    raw === 'tabGroup' ||
    raw === 'appearanceProperty' ||
    raw === 'appearancePreset' ||
    raw === 'appearanceElement'
    ? raw
    : 'appearanceElement'
}

/** Resolve every nested target from the event node out to its owners. */
export function resolveAppearanceLockTargets(
  node: EventTarget | null
): ReadonlyArray<{
  targetId: string
  targetKind: IMd3LockTarget['kind']
  anchor: HTMLElement
}> {
  if (!(node instanceof Element)) {
    return []
  }

  const targets: Array<{
    targetId: string
    targetKind: IMd3LockTarget['kind']
    anchor: HTMLElement
  }> = []
  let current: Element | null = node
  while (current !== null) {
    if (current instanceof HTMLElement) {
      const targetId = current.getAttribute(AppearanceLockTargetAttribute)
      if (targetId !== null && targetId !== '') {
        targets.push({
          targetId,
          targetKind: readTargetKind(current),
          anchor: current,
        })
      }
    }
    current = current.parentElement
  }

  for (const [selector, elementId] of ProfileAppearanceOwnerSelectors) {
    const anchor = node.closest(selector)
    if (anchor instanceof HTMLElement) {
      const targetId = profileAppearanceLockTargetId(elementId)
      if (
        !targets.some(
          target =>
            target.targetId === targetId &&
            target.targetKind === 'appearanceElement'
        )
      ) {
        targets.push({ targetId, targetKind: 'appearanceElement', anchor })
      }
    }
  }
  return targets
}

/**
 * Stop an activation of a locked element and ask the shell for the prompt.
 *
 * Returns whether the event was blocked, so a caller can tell the difference
 * between "no lock here" and "handled".
 */
function gate(event: Event): boolean {
  const resolved = resolveAppearanceLockTargets(event.target).find(target =>
    isMd3TargetBlocked(target.targetKind, target.targetId)
  )
  if (resolved === undefined) {
    return false
  }

  // Capture phase plus `stopImmediatePropagation`: a handler bound directly to
  // the element would otherwise still run, and the control would perform its
  // action behind the prompt asking permission for it.
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  announceAppearanceLockBlocked(
    resolved.targetId,
    resolved.anchor,
    resolved.targetKind
  )
  return true
}

/** Announce one blocked activation to the mounted prompt host. */
export function announceAppearanceLockBlocked(
  targetId: string,
  anchor: HTMLElement,
  targetKind: IMd3LockTarget['kind'] = 'appearanceElement'
): void {
  refreshAppearanceLockSemantics()
  const detail: IAppearanceLockBlockedDetail = {
    targetId,
    targetKind,
    anchor,
  }
  window.dispatchEvent(new CustomEvent(AppearanceLockBlockedEvent, { detail }))
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
  targetKind: IMd3LockTarget['kind'] = 'appearanceElement'
): boolean {
  if (isMd3TargetBlocked(targetKind, targetId)) {
    announceAppearanceLockBlocked(targetId, anchor, targetKind)
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
  const resolved = resolveAppearanceLockTarget(anchor)
  if (resolved === null) {
    activate()
    return true
  }
  return guardAppearanceActivation(
    resolved.targetId,
    resolved.anchor,
    activate,
    resolved.targetKind
  )
}

/**
 * Keep semantic attributes current even when a lock is created by a separate
 * settings surface and the target itself does not re-render.
 */
export function refreshAppearanceLockSemantics(): void {
  if (typeof document === 'undefined') {
    return
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
    const resolved = resolveAppearanceLockTarget(element)
    const targetId =
      element.getAttribute(AppearanceLockTargetAttribute) ?? resolved?.targetId
    if (targetId === null || targetId === undefined || targetId.length === 0) {
      continue
    }
    const semantics = appearanceLockTargetSemantics(
      targetId,
      element.hasAttribute(AppearanceLockTargetKindAttribute)
        ? readTargetKind(element)
        : resolved?.targetKind ?? 'appearanceElement'
    )
    if (semantics['aria-disabled'] === undefined) {
      element.removeAttribute('aria-disabled')
    } else {
      element.setAttribute('aria-disabled', semantics['aria-disabled'])
    }
    if (semantics['data-md3-locked'] === undefined) {
      element.removeAttribute('data-md3-locked')
    } else {
      element.setAttribute('data-md3-locked', semantics['data-md3-locked'])
    }
  }
}

const onPointer = (event: Event) => {
  gate(event)
}

const onDoubleClick = (event: Event) => {
  gate(event)
}

const onContextMenu = (event: Event) => {
  gate(event)
}

const onKeyDown = (event: KeyboardEvent) => {
  // Only the keys that activate a control. Tabbing through a locked button,
  // or reading it with a screen reader, is not an activation and must not be
  // interrupted — a lock that swallowed arrow keys would make the surface
  // around it unnavigable.
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  gate(event)
}

let installed = false

/** Install the gate. Call once, during renderer start-up. */
export function installAppearanceLockGate(): void {
  if (installed) {
    return
  }
  installed = true
  // Pointer-down as well as click, because a control that acts on press — and
  // several do — would otherwise have already acted by the time click arrived.
  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('click', onPointer, true)
  document.addEventListener('dblclick', onDoubleClick, true)
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener(Md3LocksChangedEvent, refreshAppearanceLockSemantics)
  refreshAppearanceLockSemantics()
}

/** Exists so a test can leave the document as it found it. */
export function uninstallAppearanceLockGate(): void {
  installed = false
  document.removeEventListener('pointerdown', onPointer, true)
  document.removeEventListener('click', onPointer, true)
  document.removeEventListener('dblclick', onDoubleClick, true)
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener(
    Md3LocksChangedEvent,
    refreshAppearanceLockSemantics
  )
}
