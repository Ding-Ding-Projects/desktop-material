import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { addMd3Lock, writeMd3Locks } from '../../../src/lib/md3-locks'
import { DefaultMd3UnlockDuration } from '../../../src/lib/md3-locks/lock-model'
import { Repository } from '../../../src/models/repository'
import type { IRepositoryTab } from '../../../src/models/repository-tab'
import {
  AppearanceLockBlockedEvent,
  clearAppearanceUnlocks,
} from '../../../src/ui/appearance/appearance-lock-gate'
import { teleportTo } from '../../../src/ui/lib/teleport'
import { RepositoryTab } from '../../../src/ui/repository-tabs/repository-tab'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const tabId = 'activation-route-tab'
const tabTargetId = `repository-tab:${tabId}`
const profileTabsTargetId = 'profile:repository-tabs'

function lock(targetId: string) {
  return addMd3Lock({
    target: { kind: 'appearanceElement', id: targetId, label: targetId },
    factor: 'password',
    unlockDuration: DefaultMd3UnlockDuration,
    lockOnLaunch: true,
  })
}

function tabFor(repository: Repository): IRepositoryTab {
  return {
    id: tabId,
    repositoryId: repository.id,
    repositoryPath: repository.path,
    customLabel: null,
    titleStyle: null,
  }
}

function renderTab(
  onClose: (tab: IRepositoryTab) => void,
  onToggleFavorite: (tab: IRepositoryTab) => void
) {
  const repository = new Repository(
    '/missing/activation-routes',
    901,
    null,
    true
  )
  return render(
    <div className="repository-tab-strip">
      <RepositoryTab
        tab={tabFor(repository)}
        repository={repository}
        isActive={true}
        isDragging={false}
        onSelect={() => undefined}
        onClose={onClose}
        onToggleFavorite={onToggleFavorite}
        onRename={() => undefined}
        onContextMenu={() => undefined}
        onOpenStyleEditor={() => undefined}
        onDragStart={() => undefined}
        onDragOver={() => undefined}
        onDrop={() => undefined}
        onDragEnd={() => undefined}
      />
    </div>
  )
}

function listenForBlockedTarget() {
  const targets: string[] = []
  const listener = (event: Event) => {
    targets.push((event as CustomEvent<{ targetId: string }>).detail.targetId)
  }
  window.addEventListener(AppearanceLockBlockedEvent, listener)
  return {
    targets,
    stop: () =>
      window.removeEventListener(AppearanceLockBlockedEvent, listener),
  }
}

describe('toy-lock activation routes', () => {
  beforeEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
  })

  afterEach(() => {
    writeMd3Locks([])
    clearAppearanceUnlocks()
  })

  it('teleports to the exact unlock prompt when only the profile ancestor is locked', async () => {
    const strip = document.createElement('div')
    strip.className = 'repository-tab-strip'
    strip.tabIndex = -1
    const target = document.createElement('button')
    target.dataset.teleportTarget = 'settings-theme'
    strip.appendChild(target)
    document.body.appendChild(strip)

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    })
    const blocked = listenForBlockedTarget()
    try {
      lock(profileTabsTargetId)
      assert.equal(await teleportTo('settingsTheme', 0), true)
      assert.deepEqual(blocked.targets, [profileTabsTargetId])
      assert.equal(document.activeElement, strip)
    } finally {
      blocked.stop()
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
      strip.remove()
    }
  })

  it('teleports to the exact child unlock prompt when the profile is unlocked', async () => {
    const strip = document.createElement('div')
    strip.className = 'repository-tab-strip'
    const target = document.createElement('button')
    target.dataset.teleportTarget = 'settings-theme'
    target.setAttribute('data-md3-lock-target', 'settings-theme-control')
    strip.appendChild(target)
    document.body.appendChild(strip)

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    })
    const blocked = listenForBlockedTarget()
    try {
      lock('settings-theme-control')
      assert.equal(await teleportTo('settingsTheme', 0), true)
      assert.deepEqual(blocked.targets, ['settings-theme-control'])
      assert.equal(document.activeElement, target)
    } finally {
      blocked.stop()
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
      strip.remove()
    }
  })

  it('blocks synthetic and native middle-click routes behind the exact tab lock', () => {
    let closeCount = 0
    renderTab(
      () => closeCount++,
      () => undefined
    )
    const frame = screen.getByRole('tab')
    const blocked = listenForBlockedTarget()
    try {
      lock(tabTargetId)
      fireEvent.mouseDown(frame, { button: 1 })
      frame.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 1,
          bubbles: true,
          cancelable: true,
        })
      )
      assert.equal(closeCount, 0)
      assert.deepEqual(blocked.targets, [tabTargetId, tabTargetId])

      writeMd3Locks([])
      fireEvent.mouseDown(frame, { button: 1 })
      assert.equal(closeCount, 1)
    } finally {
      blocked.stop()
    }
  })

  it('blocks close and favorite child callbacks through an ancestor lock, then restores both when unlocked', () => {
    let closeCount = 0
    let favoriteCount = 0
    renderTab(
      () => closeCount++,
      () => favoriteCount++
    )
    const close = screen.getByRole('button', { name: 'Close tab' })
    const favorite = screen.getByRole('button', {
      name: 'Add activation-routes to favorites',
    })
    const blocked = listenForBlockedTarget()
    try {
      lock(profileTabsTargetId)
      fireEvent.click(close)
      fireEvent.click(favorite)
      assert.equal(closeCount, 0)
      assert.equal(favoriteCount, 0)
      assert.deepEqual(blocked.targets, [
        profileTabsTargetId,
        profileTabsTargetId,
      ])

      writeMd3Locks([])
      fireEvent.click(close)
      fireEvent.click(favorite)
      assert.equal(closeCount, 1)
      assert.equal(favoriteCount, 1)
    } finally {
      blocked.stop()
    }
  })
})
