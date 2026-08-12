import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import '../helpers/ui/setup'
import {
  AppearanceLockBlockedEvent,
  AppearanceLockTargetAttribute,
  appearanceLockTargetProps,
  clearAppearanceUnlocks,
  installAppearanceLockGate,
  isAppearanceTargetBlocked,
  recordAppearanceUnlock,
  resolveAppearanceLockTarget,
  uninstallAppearanceLockGate,
} from '../../src/ui/appearance/appearance-lock-gate'
import { addMd3Lock, writeMd3Locks } from '../../src/lib/md3-locks'
import { DefaultMd3UnlockDuration } from '../../src/lib/md3-locks/lock-model'

/**
 * A lock has to be felt to be a lock.
 *
 * Before this gate existed, locking an element recorded a lock and changed
 * nothing at all: the row appeared in the manager, the button carried on
 * working, and the only thing between the user and the "locked" control was an
 * entry in a list. These tests are mostly about the two halves of that being
 * true at once — a locked element does not activate, and an unlocked one is
 * not quietly broken by the guard.
 */

const lockElement = (targetId: string) =>
  addMd3Lock({
    target: { kind: 'appearanceElement', id: targetId, label: targetId },
    factor: 'password',
    unlockDuration: DefaultMd3UnlockDuration,
    lockOnLaunch: true,
  })

describe('whether an element is blocked', () => {
  beforeEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
  })
  afterEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
  })

  it('does not block an element with no lock', () => {
    assert.strictEqual(isAppearanceTargetBlocked('nothing-here'), false)
  })

  it('blocks an element that has one', () => {
    lockElement('the-button')
    assert.strictEqual(isAppearanceTargetBlocked('the-button'), true)
  })

  it('stops blocking once the lock has a live unlock', () => {
    const lock = lockElement('the-button')
    recordAppearanceUnlock({
      lockId: lock.id,
      kind: 'minutes',
      expiresAt: Date.now() + 60_000,
    })
    assert.strictEqual(isAppearanceTargetBlocked('the-button'), false)
  })

  it('blocks again once that unlock has expired', () => {
    const lock = lockElement('the-button')
    recordAppearanceUnlock({
      lockId: lock.id,
      kind: 'minutes',
      expiresAt: 1_000,
    })
    assert.strictEqual(isAppearanceTargetBlocked('the-button', 2_000), true)
  })

  it('needs every lock opened, not just one of them', () => {
    // Two locks on one element are two credentials, and opening one of them is
    // not opening the element. A guard using `some` here would let the second
    // lock be walked straight past.
    const first = lockElement('the-button')
    lockElement('the-button')
    recordAppearanceUnlock({
      lockId: first.id,
      kind: 'session',
      expiresAt: null,
    })
    assert.strictEqual(isAppearanceTargetBlocked('the-button'), true)
  })

  it('does not confuse one element lock for another', () => {
    lockElement('button-a')
    assert.strictEqual(isAppearanceTargetBlocked('button-b'), false)
  })
})

describe('finding which element an event belongs to', () => {
  it('finds nothing for a node that declares no target', () => {
    const div = document.createElement('div')
    assert.strictEqual(resolveAppearanceLockTarget(div), null)
  })

  it('finds the element itself', () => {
    const div = document.createElement('div')
    div.setAttribute(AppearanceLockTargetAttribute, 'me')
    assert.strictEqual(resolveAppearanceLockTarget(div)?.targetId, 'me')
  })

  it('finds the owner from a descendant', () => {
    // A click on a button's label is still the button's activation, so the
    // walk starts at the event target rather than the element a handler
    // happens to be bound to.
    const owner = document.createElement('button')
    owner.setAttribute(AppearanceLockTargetAttribute, 'owner')
    const label = document.createElement('span')
    owner.appendChild(label)
    assert.strictEqual(resolveAppearanceLockTarget(label)?.targetId, 'owner')
  })

  it('ignores an empty target id rather than treating it as one', () => {
    const div = document.createElement('div')
    div.setAttribute(AppearanceLockTargetAttribute, '')
    assert.strictEqual(resolveAppearanceLockTarget(div), null)
  })

  it('ignores a non-element event target', () => {
    assert.strictEqual(resolveAppearanceLockTarget(null), null)
    assert.strictEqual(resolveAppearanceLockTarget(window), null)
  })
})

describe('the gate stopping an activation', () => {
  let target: HTMLButtonElement
  let activations: number

  beforeEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
    activations = 0
    target = document.createElement('button')
    target.setAttribute(AppearanceLockTargetAttribute, 'gated')
    target.addEventListener('click', () => activations++)
    document.body.appendChild(target)
    installAppearanceLockGate()
  })

  afterEach(() => {
    uninstallAppearanceLockGate()
    target.remove()
    writeMd3Locks([])
    clearAppearanceUnlocks()
  })

  const click = () =>
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    )

  it('lets an unlocked element through untouched', () => {
    click()
    assert.strictEqual(activations, 1)
  })

  it('stops the handler bound to the element itself when it is locked', () => {
    // The handler is bound directly to the element, which is precisely the
    // case a bubbling guard would miss: the control would perform its action
    // behind the prompt asking permission for it.
    lockElement('gated')
    click()
    assert.strictEqual(activations, 0)
  })

  it('announces the block so the shell can offer the prompt', () => {
    // Without this the element would simply stop working, with nothing on
    // screen to say why or how to get in.
    lockElement('gated')
    let announced: string | null = null
    const listener = (event: Event) => {
      announced = (event as CustomEvent).detail.targetId
    }
    window.addEventListener(AppearanceLockBlockedEvent, listener)
    click()
    window.removeEventListener(AppearanceLockBlockedEvent, listener)
    assert.strictEqual(announced, 'gated')
  })

  it('leaves an unrelated element alone', () => {
    lockElement('some-other-element')
    click()
    assert.strictEqual(activations, 1)
  })

  it('does not swallow navigation keys', () => {
    // A lock that ate arrow keys would make the surface around it
    // unnavigable, and tabbing past a button is not pressing it.
    lockElement('gated')
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(arrow)
    assert.strictEqual(arrow.defaultPrevented, false)
  })

  it('stops Enter and Space, which do activate', () => {
    lockElement('gated')
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(event)
      assert.strictEqual(event.defaultPrevented, true, `${key} was not stopped`)
    }
  })

  it('stops a later capture listener on the document too', () => {
    // `stopPropagation` alone would be enough to keep the target's own handler
    // from running, so this is the case that makes `stopImmediatePropagation`
    // load-bearing rather than decorative: another capture-phase listener
    // registered on the document *after* the gate. Without the immediate form
    // it fires, and whatever it does happens behind the prompt.
    let sneaked = 0
    const later = () => sneaked++
    document.addEventListener('click', later, true)
    lockElement('gated')
    click()
    document.removeEventListener('click', later, true)
    assert.strictEqual(sneaked, 0)
  })

  it('detaches cleanly', () => {
    lockElement('gated')
    uninstallAppearanceLockGate()
    click()
    assert.strictEqual(activations, 1)
    installAppearanceLockGate()
  })
})

describe('elements advertise their lock target', () => {
  it('produces the attribute the gate looks for', () => {
    assert.deepStrictEqual(appearanceLockTargetProps('x'), {
      [AppearanceLockTargetAttribute]: 'x',
    })
  })

  it('is stamped by every surface that offers an appearance lock', () => {
    // A hand-written list, not a pattern. A rule that only checks the surfaces
    // it already found passes cleanly on a surface that has none, which is the
    // exact failure this is here to catch.
    const surfaces = [
      'app/src/ui/submodules/submodule-back-button.tsx',
      'app/src/ui/repository-tabs/repository-tab.tsx',
    ]
    for (const surface of surfaces) {
      const source = readFileSync(join(process.cwd(), surface), 'utf8')
      assert.ok(
        source.includes('appearanceLockTargetProps('),
        `${surface} offers a lock but never advertises its target, so the lock gates nothing`
      )
    }
  })

  it('is installed at renderer start-up', () => {
    // The whole feature is inert without this call, and the failure is silent:
    // locks are recorded and every locked element carries on working.
    const source = readFileSync(
      join(process.cwd(), 'app/src/ui/index.tsx'),
      'utf8'
    )
    assert.match(source, /installAppearanceLockGate\(\)/)
    // And the credential vault, without which creating a lock fails and the
    // button appears to do nothing at all.
    assert.match(source, /installOsLockCredentialVault\(\)/)
  })
})

describe('a blocked element gets a prompt, not silence', () => {
  it('mounts the prompt host in the shell', () => {
    // The gate without this is arguably worse than no gate: a locked button
    // simply stops responding, with nothing on screen to say why or how to
    // get in. A control that silently does nothing is the exact defect this
    // project forbids everywhere else, and a deliberate silence is no better.
    const shell = readFileSync(
      join(process.cwd(), 'app/src/ui/app.tsx'),
      'utf8'
    )
    assert.match(shell, /<AppearanceLockPromptHost/)
  })

  it('listens for the gate event the block raises', () => {
    const host = readFileSync(
      join(
        process.cwd(),
        'app/src/ui/appearance/appearance-lock-prompt-host.tsx'
      ),
      'utf8'
    )
    assert.match(host, /addEventListener\(AppearanceLockBlockedEvent/)
    assert.match(host, /removeEventListener\(AppearanceLockBlockedEvent/)
  })

  it('does not replay the activation it refused', () => {
    // Replaying the click would perform an action the user made before being
    // asked for a credential, and has not chosen since being interrupted. On
    // a destructive control that is a genuinely bad outcome, so the decision
    // is recorded in the code rather than left to be re-litigated.
    const host = readFileSync(
      join(
        process.cwd(),
        'app/src/ui/appearance/appearance-lock-prompt-host.tsx'
      ),
      'utf8'
    )
    assert.doesNotMatch(host, /anchor\.click\(\)/)
    assert.doesNotMatch(host, /dispatchEvent\(new MouseEvent/)
  })

  it('returns focus to the control that was blocked', () => {
    const host = readFileSync(
      join(
        process.cwd(),
        'app/src/ui/appearance/appearance-lock-prompt-host.tsx'
      ),
      'utf8'
    )
    assert.match(host, /anchor\?\.focus\(\)/)
  })
})
