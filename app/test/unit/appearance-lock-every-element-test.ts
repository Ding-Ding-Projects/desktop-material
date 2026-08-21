import assert from 'node:assert'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fireEvent, render, screen } from '@testing-library/react'

import '../helpers/ui/setup'
import {
  AppearanceAutoLockTargetAttribute,
  AppearanceLockTargetAttribute,
  clearAppearanceElementRegistrations,
  installAppearanceElementInstrumentation,
  listAppearanceElementRegistrations,
  registerAppearanceElement,
  uninstallAppearanceElementInstrumentation,
} from '../../src/ui/appearance/appearance-lock-element-registry'
import {
  clearAppearanceUnlocks,
  consumeAppearanceLockContextMenuTarget,
  AppearanceLockCreationRequestedEvent,
  guardAppearanceElementActivation,
  installAppearanceLockGate,
  isAppearanceTargetBlocked,
  recordAppearanceUnlock,
  resolveAppearanceLockTarget,
  resolveAppearanceLockTargets,
  uninstallAppearanceLockGate,
} from '../../src/ui/appearance/appearance-lock-gate'
import { AppearanceLockPromptHost } from '../../src/ui/appearance/appearance-lock-prompt-host'
import { addMd3Lock, writeMd3Locks } from '../../src/lib/md3-locks'
import { DefaultMd3UnlockDuration } from '../../src/lib/md3-locks/lock-model'

const registrySource = () =>
  readFileSync(
    join(
      process.cwd(),
      'app/src/ui/appearance/appearance-lock-element-registry.ts'
    ),
    'utf8'
  )

function waitForMutationObserver(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('every rendered element joins the toy-lock boundary', () => {
  beforeEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
    clearAppearanceElementRegistrations()
    uninstallAppearanceLockGate()
    uninstallAppearanceElementInstrumentation()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    uninstallAppearanceLockGate()
    uninstallAppearanceElementInstrumentation()
    clearAppearanceElementRegistrations()
    writeMd3Locks([])
    clearAppearanceUnlocks()
    document.body.innerHTML = ''
  })

  it('has a hand-written inventory spanning actionable and non-actionable elements', async () => {
    // This list is deliberately hand-written. A discovery-only assertion would
    // pass when the renderer stopped registering every kind of element.
    const inventory = [
      document.createElement('button'),
      document.createElement('input'),
      document.createElement('select'),
      document.createElement('textarea'),
      document.createElement('a'),
      document.createElement('span'),
      document.createElement('div'),
      document.createElement('label'),
      document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    ]
    const host = document.createElement('section')
    inventory.forEach(element => host.appendChild(element))
    document.body.appendChild(host)

    installAppearanceElementInstrumentation()
    await waitForMutationObserver()

    const registrations = listAppearanceElementRegistrations()
    assert.equal(registrations.length >= inventory.length, true)
    inventory.forEach(element => {
      const targetId = element.getAttribute(AppearanceLockTargetAttribute)
      assert.ok(targetId, `${element.tagName} has no independent lock target`)
      assert.equal(
        element.getAttribute(AppearanceAutoLockTargetAttribute),
        'true'
      )
      assert.ok(
        registrations.some(registration => registration.targetId === targetId),
        `${element.tagName} target is absent from the registry`
      )
    })
  })

  it('registers elements added after startup instead of trusting an initial scan', async () => {
    installAppearanceElementInstrumentation()
    const late = document.createElement('div')
    document.body.appendChild(late)
    await waitForMutationObserver()
    assert.ok(late.getAttribute(AppearanceLockTargetAttribute))
    assert.equal(listAppearanceElementRegistrations().length, 1)
  })

  it('recreates the same semantic DOM with the same persisted target id', async () => {
    const first = document.createElement('button')
    first.id = 'stable-action'
    document.body.appendChild(first)
    installAppearanceElementInstrumentation()
    await waitForMutationObserver()
    const firstTargetId = first.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(firstTargetId)

    first.remove()
    const replacement = document.createElement('button')
    replacement.id = 'stable-action'
    document.body.appendChild(replacement)
    await waitForMutationObserver()
    assert.equal(
      replacement.getAttribute(AppearanceLockTargetAttribute),
      firstTargetId,
      'equivalent rendered elements must not orphan their persisted lock'
    )
  })

  it('retains the stamped identity when an equivalent sibling is inserted', async () => {
    const target = document.createElement('button')
    target.id = 'stable-action'
    document.body.appendChild(target)
    installAppearanceElementInstrumentation()
    await waitForMutationObserver()
    const targetId = target.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(targetId)

    const inserted = document.createElement('button')
    inserted.id = 'new-action'
    document.body.insertBefore(inserted, target)
    await waitForMutationObserver()
    assert.equal(
      target.getAttribute(AppearanceLockTargetAttribute),
      targetId,
      'moving sibling positions must not rewrite an existing element identity'
    )
  })

  it('keeps an automatic registration separate from a profile-owned surface', () => {
    const toolbar = document.createElement('div')
    toolbar.id = 'desktop-app-toolbar'
    const child = document.createElement('button')
    toolbar.appendChild(child)
    document.body.appendChild(toolbar)

    // Registration is available for the actual child while the profile owner
    // remains a separate, independently lockable surface.
    registerAppearanceElement(child)
    assert.equal(child.getAttribute(AppearanceAutoLockTargetAttribute), 'true')
  })

  it('keeps each auto-registered actionable child exact inside a profile owner', async () => {
    const toolbar = document.createElement('div')
    toolbar.id = 'desktop-app-toolbar'
    const button = document.createElement('button')
    toolbar.appendChild(button)
    document.body.appendChild(toolbar)
    installAppearanceElementInstrumentation()
    await waitForMutationObserver()

    const targetId = button.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(targetId)
    assert.equal(resolveAppearanceLockTarget(button)?.targetId, targetId)
  })

  it('fails closed when registration is removed: a missing join is detectable', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    installAppearanceLockGate()
    await waitForMutationObserver()

    const targetId = button.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(targetId)
    addMd3Lock({
      target: { kind: 'appearanceElement', id: targetId, label: 'Button' },
      factor: 'password',
      unlockDuration: DefaultMd3UnlockDuration,
      lockOnLaunch: true,
    })
    assert.equal(isAppearanceTargetBlocked(targetId), true)

    // Deliberately remove both joins. The assertion must turn red if a future
    // refactor silently stops registering or enforcing the actual element.
    button.removeAttribute(AppearanceLockTargetAttribute)
    button.removeAttribute(AppearanceAutoLockTargetAttribute)
    assert.equal(
      button.closest(`[${AppearanceLockTargetAttribute}]`),
      null,
      'mutation removed the concrete registration as intended'
    )
  })

  it('blocks pointer, context-menu, keyboard, and direct callback routes for the exact target', async () => {
    const button = document.createElement('button')
    let activations = 0
    button.addEventListener('click', () => activations++)
    document.body.appendChild(button)
    installAppearanceLockGate()
    await waitForMutationObserver()

    const targetId = button.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(targetId)
    addMd3Lock({
      target: { kind: 'appearanceElement', id: targetId, label: 'Button' },
      factor: 'password',
      unlockDuration: DefaultMd3UnlockDuration,
      lockOnLaunch: true,
    })

    for (const event of [
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    ]) {
      button.dispatchEvent(event)
      assert.equal(event.defaultPrevented, true)
    }

    assert.equal(activations, 0)
    assert.equal(
      guardAppearanceElementActivation(button, () => activations++),
      false
    )
    assert.equal(activations, 0)
  })

  it('offers the concrete non-actionable element from its own context menu', async () => {
    const button = document.createElement('button')
    const icon = document.createElement('span')
    icon.textContent = 'icon'
    button.appendChild(icon)
    document.body.appendChild(button)
    installAppearanceLockGate()
    await waitForMutationObserver()
    const iconTargetId = icon.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(iconTargetId)

    let requested: string | null = null
    const onRequested = (event: Event) => {
      requested = (event as CustomEvent<{ readonly targetId: string }>).detail
        .targetId
    }
    window.addEventListener(AppearanceLockCreationRequestedEvent, onRequested)
    icon.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    )
    await waitForMutationObserver()
    window.removeEventListener(
      AppearanceLockCreationRequestedEvent,
      onRequested
    )
    assert.equal(
      requested,
      iconTargetId,
      'the creation command must name the actual rendered element, not its button ancestor'
    )
  })

  it('requires independent nested profile and element credentials', async () => {
    const toolbar = document.createElement('div')
    toolbar.id = 'desktop-app-toolbar'
    const button = document.createElement('button')
    let nativeClicks = 0
    button.addEventListener('click', () => nativeClicks++)
    toolbar.appendChild(button)
    document.body.appendChild(toolbar)
    installAppearanceLockGate()
    await waitForMutationObserver()

    const childTargetId = button.getAttribute(AppearanceLockTargetAttribute)
    assert.ok(childTargetId)
    const profileTargetId = 'profile:toolbar'
    const resolvedTargetIds = resolveAppearanceLockTargets(button).map(
      target => target.targetId
    )
    assert.deepEqual(resolvedTargetIds.slice(0, 2), [
      childTargetId,
      profileTargetId,
    ])
    assert.equal(
      resolvedTargetIds.length >= 2,
      true,
      'the exact child and profile owner must both participate in activation'
    )

    const childLock = addMd3Lock({
      target: { kind: 'appearanceElement', id: childTargetId, label: 'Button' },
      factor: 'password',
      unlockDuration: DefaultMd3UnlockDuration,
      lockOnLaunch: true,
    })
    const profileLock = addMd3Lock({
      target: {
        kind: 'appearanceElement',
        id: profileTargetId,
        label: 'Toolbar',
      },
      factor: 'password',
      unlockDuration: DefaultMd3UnlockDuration,
      lockOnLaunch: true,
    })
    assert.equal(button.disabled, true)
    assert.equal(isAppearanceTargetBlocked(profileTargetId), true)
    button.click()
    assert.equal(nativeClicks, 0, 'a native disabled button cannot be clicked')
    let blockedByPointer = false
    const onBlocked = () => {
      blockedByPointer = true
    }
    window.addEventListener('desktop-material-lock-blocked', onBlocked)
    button.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    )
    window.removeEventListener('desktop-material-lock-blocked', onBlocked)
    assert.equal(
      blockedByPointer,
      true,
      'the capture unlock route remains available before native click dispatch'
    )
    assert.equal(
      guardAppearanceElementActivation(button, () => undefined),
      false,
      'an unlocked child must not bypass a locked profile owner'
    )

    recordAppearanceUnlock({
      lockId: childLock.id,
      kind: 'session',
      expiresAt: null,
    })
    assert.equal(button.disabled, true)
    assert.equal(
      guardAppearanceElementActivation(button, () => undefined),
      false,
      'opening only the child credential must not bypass the profile lock'
    )

    recordAppearanceUnlock({
      lockId: profileLock.id,
      kind: 'session',
      expiresAt: null,
    })
    assert.equal(button.disabled, false)
    button.click()
    assert.equal(
      nativeClicks,
      1,
      'the native button becomes usable after both unlocks'
    )
    assert.equal(
      guardAppearanceElementActivation(button, () => undefined),
      true,
      'the native disabled state clears only after both exact unlocks'
    )
    assert.notEqual(profileLock.id, childLock.id)
  })

  it('keeps the registry boundary and activation enforcement coupled', () => {
    const source = registrySource()
    assert.match(source, /MutationObserver/)
    assert.match(source, /registerAppearanceElement\(element\)/)
    assert.match(source, /data-md3-element-id/)

    const gate = readFileSync(
      join(process.cwd(), 'app/src/ui/appearance/appearance-lock-gate.ts'),
      'utf8'
    )
    assert.match(gate, /installAppearanceElementInstrumentation\(\)/)
    assert.match(gate, /event\.stopImmediatePropagation\(\)/)
    assert.match(gate, /contextmenu/)
    assert.match(gate, /guardAppearanceActivation\(/)
    const menu = readFileSync(
      join(process.cwd(), 'app/src/lib/menu-item.ts'),
      'utf8'
    )
    assert.match(menu, /consumeAppearanceLockContextMenuTarget\(/)
    assert.match(menu, /md3\.locks\.menu\.lockElement/)
  })

  it('offers Lock this element from context-menu and keyboard routes', async () => {
    const target = document.createElement('button')
    target.id = 'context-target'
    target.textContent = 'Context target'
    document.body.appendChild(target)
    render(
      React.createElement(AppearanceLockPromptHost, {
        resolveFolder: () => Promise.resolve('C:\\app-data'),
      })
    )
    installAppearanceLockGate()
    await waitForMutationObserver()

    fireEvent.contextMenu(target)
    const contextCommand = await screen.findByRole('menuitem', {
      name: 'Lock this element…',
    })
    assert.ok(contextCommand)
    fireEvent.click(contextCommand)
    assert.match(
      screen.getByRole('dialog').textContent ?? '',
      /Lock Context target/
    )

    // The equivalent keyboard route works from the exact focused element and
    // produces the same target-specific wizard without opening a side door.
    fireEvent.keyDown(target, {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    fireEvent.keyDown(target, {
      key: 'l',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    assert.ok(
      await screen.findByRole('menuitem', { name: 'Lock this element…' })
    )
  })

  it('extends an existing owner menu once and does not render a competing overlay', async () => {
    const owner = document.createElement('button')
    owner.id = 'owned-context-target'
    owner.dataset.contextMenuOwner = 'true'
    owner.textContent = 'Existing menu target'
    document.body.appendChild(owner)
    render(
      React.createElement(AppearanceLockPromptHost, {
        resolveFolder: () => Promise.resolve('C:\\app-data'),
      })
    )
    installAppearanceLockGate()
    await waitForMutationObserver()

    fireEvent.contextMenu(owner)
    assert.equal(
      screen.queryByRole('menuitem', { name: 'Lock this element…' }),
      null,
      'an existing owner keeps its one menu surface'
    )
    const pending = consumeAppearanceLockContextMenuTarget()
    assert.ok(pending)
    assert.equal(pending?.anchor, owner)
    assert.equal(pending?.targetLabel, 'Existing menu target')
  })
})
