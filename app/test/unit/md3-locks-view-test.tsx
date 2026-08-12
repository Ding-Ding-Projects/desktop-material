import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3LockCredentialVault,
  IMd3LockExport,
  clearAllMd3LockAttempts,
  readMd3Locks,
  setMd3LockSupportTicketsRoute,
  setMd3TotpVerifier,
  verifyMd3LockPassword,
} from '../../src/lib/md3-locks'
import {
  buildMd3LockMenuItems,
  excludeLockedFromBulkClose,
  md3LockedResultLabel,
  Md3LockExportColumns,
  md3LockExportRecord,
  Md3LocksView,
  Md3LockSetupDialog,
  Md3LockUnlockPrompt,
  md3LockPromptPosition,
} from '../../src/ui/md3'
import { fireEvent, render, screen, waitFor } from '../helpers/ui/render'

const ApplicationDataFolder =
  'C:\\Users\\example\\AppData\\Roaming\\Desktop Material'

function createVault(): IMd3LockCredentialVault {
  const entries = new Map<string, string>()
  return {
    read: async account => entries.get(account) ?? null,
    write: async (account, value) => {
      entries.set(account, value)
    },
    remove: async account => entries.delete(account),
  }
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

function lockFixture(overrides: Partial<IMd3Lock> = {}): IMd3Lock {
  return {
    id: 'lock-1',
    target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
    factor: 'password',
    createdAt: '2026-08-01T09:00:00.000Z',
    unlockDuration: { kind: 'minutes', minutes: 10 },
    lockOnLaunch: true,
    otpAccountKey: null,
    ...overrides,
  }
}

beforeEach(() => {
  clearAllMd3LockAttempts()
  setMd3TotpVerifier(null)
  setMd3LockSupportTicketsRoute(null)
})

describe('anchored unlock prompt', () => {
  it('keeps itself inside the viewport rather than painting past the edge', () => {
    const far = md3LockPromptPosition(
      { top: 500, left: 1180, width: 40, height: 24 },
      { width: 1200, height: 560 }
    )

    assert.ok(far.left + 320 <= 1200, 'the prompt ran off the right edge')
    assert.ok(far.top <= 560, 'the prompt ran off the bottom edge')

    const centred = md3LockPromptPosition(null, { width: 1200, height: 800 })
    assert.equal(centred.left, 440)
  })

  it('states that it is not security and names the recovery folder', () => {
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={() => {}}
        onDismissed={() => {}}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    assert.ok(screen.getByText(/just for fun/i))
    assert.ok(screen.getByText(/not security/i))
    assert.ok(screen.getByText(new RegExp('AppData')))
  })

  it('says the folder path is unknown rather than inventing one', () => {
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={null}
        onUnlocked={() => {}}
        onDismissed={() => {}}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    assert.ok(screen.getByText(/exact path could not be read/i))
  })

  it('reports a wrong answer honestly and never wipes anything', async () => {
    let unlocked = 0
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={() => unlocked++}
        onDismissed={() => {}}
        now={() => 1_000}
        verify={async () => ({
          outcome: 'mismatched',
          consecutiveFailures: 2,
          retryAt: 0,
        })}
      />
    )

    const field = screen.getByLabelText(/this lock’s password/i)
    fireEvent.change(field, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => {
      assert.ok(screen.getByText(/wrong answers so far: 2/i))
    })
    assert.equal(unlocked, 0)
  })

  it('grants the unlock the user chose the duration of', async () => {
    const granted: Array<IMd3ActiveUnlock> = []
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={unlock => granted.push(unlock)}
        onDismissed={() => {}}
        now={() => 1_000}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    fireEvent.change(screen.getByLabelText(/this lock’s password/i), {
      target: { value: 'a password' },
    })
    fireEvent.click(screen.getByLabelText(/until the app closes/i))
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => assert.equal(granted.length, 1))
    assert.equal(granted[0].kind, 'session')
    assert.equal(granted[0].expiresAt, null)
  })

  it('says plainly when Support Tickets is not wired up', async () => {
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={() => {}}
        onDismissed={() => {}}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /forgotten your password/i })
    )
    await waitFor(() => {
      assert.ok(screen.getByText(/not wired up in this build/i))
    })
  })

  it('reaches Support Tickets when a route is registered', async () => {
    const opened: Array<string> = []
    setMd3LockSupportTicketsRoute(context => opened.push(context.targetLabel))

    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={() => {}}
        onDismissed={() => {}}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /forgotten your password/i })
    )
    assert.deepEqual(opened, ['Release notes'])
  })

  it('cancels on Escape', () => {
    let dismissed = 0
    render(
      <Md3LockUnlockPrompt
        lock={lockFixture()}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onUnlocked={() => {}}
        onDismissed={() => dismissed++}
        verify={async () => ({
          outcome: 'matched',
          consecutiveFailures: 0,
          retryAt: 0,
        })}
      />
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    assert.equal(dismissed, 1)
  })
})

describe('lock setup dialog', () => {
  it('names the unmet condition rather than greying the OTP choice out silently', () => {
    render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={createStorage()}
        credentialVault={createVault()}
      />
    )

    const otp = screen.getByLabelText(
      /one-time password from your authenticator/i
    )
    assert.equal((otp as HTMLInputElement).disabled, true)
    assert.ok(screen.getByText(/needs the app’s authenticator/i))
  })

  it('keeps the explanation behind progressive disclosure', () => {
    render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={createStorage()}
        credentialVault={createVault()}
      />
    )

    assert.equal(
      screen.queryByText(/keeps its name and shows a lock beside it/i),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: /what does this do/i }))
    assert.ok(screen.getByText(/keeps its name and shows a lock beside it/i))
  })

  it('says whether a value is the shipped default or saved for this lock', () => {
    const created = render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={createStorage()}
        credentialVault={createVault()}
      />
    )
    assert.ok(screen.getByText(/Using the shipped default: 10 minutes/i))
    created.unmount()

    render(
      <Md3LockSetupDialog
        lock={lockFixture({
          unlockDuration: { kind: 'session', minutes: 10 },
        })}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={createStorage()}
        credentialVault={createVault()}
      />
    )
    assert.ok(screen.getByText(/Saved for this lock: Until the app closes/i))
  })

  it('refuses a mismatched confirmation without creating a lock', () => {
    const storage = createStorage()
    render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={storage}
        credentialVault={createVault()}
      />
    )

    fireEvent.change(screen.getByLabelText(/password for this lock/i), {
      target: { value: 'first password' },
    })
    fireEvent.change(screen.getByLabelText(/type it again/i), {
      target: { value: 'second password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save this lock/i }))

    assert.ok(screen.getByText(/two passwords are different/i))
    assert.deepEqual(readMd3Locks(storage), [])
  })

  it('creates a lock whose credential opens it and nothing else', async () => {
    const storage = createStorage()
    const vault = createVault()
    const saved: Array<IMd3Lock> = []

    render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={lock => saved.push(lock)}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={storage}
        credentialVault={vault}
      />
    )

    fireEvent.change(screen.getByLabelText(/password for this lock/i), {
      target: { value: 'first password' },
    })
    fireEvent.change(screen.getByLabelText(/type it again/i), {
      target: { value: 'first password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save this lock/i }))

    await waitFor(() => assert.equal(saved.length, 1))
    assert.equal(readMd3Locks(storage).length, 1)
    assert.equal(
      await verifyMd3LockPassword(saved[0].id, 'first password', vault),
      true
    )
    assert.equal(
      await verifyMd3LockPassword('some-other-lock', 'first password', vault),
      false
    )
  })

  it('leaves no lock behind when the credential vault refuses', async () => {
    const storage = createStorage()
    const refusing: IMd3LockCredentialVault = {
      read: async () => null,
      write: async () => {
        throw new Error('the vault is locked')
      },
      remove: async () => true,
    }

    render(
      <Md3LockSetupDialog
        lock={null}
        target={{ kind: 'tab', id: 'tab-1', label: 'Release notes' }}
        anchorRect={null}
        applicationDataFolder={ApplicationDataFolder}
        onSaved={() => {}}
        onDismissed={() => {}}
        totpAvailable={false}
        storage={storage}
        credentialVault={refusing}
      />
    )

    fireEvent.change(screen.getByLabelText(/password for this lock/i), {
      target: { value: 'first password' },
    })
    fireEvent.change(screen.getByLabelText(/type it again/i), {
      target: { value: 'first password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save this lock/i }))

    await waitFor(() => {
      assert.ok(screen.getByText(/the vault is locked/i))
    })
    assert.deepEqual(readMd3Locks(storage), [])
  })
})

describe('lock manager', () => {
  const locks = [
    lockFixture(),
    lockFixture({
      id: 'lock-2',
      factor: 'otp',
      otpAccountKey: 'entry-1',
      target: {
        kind: 'appearanceProperty',
        id: 'accentPalette',
        label: 'Seed colour',
      },
    }),
  ]

  function renderManager(
    overrides: Partial<React.ComponentProps<typeof Md3LocksView>> = {}
  ) {
    const exported: Array<IMd3LockExport> = []
    const removed: Array<ReadonlyArray<string>> = []
    const view = render(
      <Md3LocksView
        locks={locks}
        activeUnlocks={[]}
        applicationDataFolder={ApplicationDataFolder}
        onEditLock={() => {}}
        onRemoveLocks={ids => removed.push(ids)}
        onLockAgain={() => {}}
        onExport={result => exported.push(result)}
        now={() => 1_000}
        {...overrides}
      />
    )
    return { view, exported, removed }
  }

  it('lists every lock with what it covers and which factor answers it', () => {
    renderManager()

    assert.ok(screen.getByText('Release notes'))
    assert.ok(screen.getByText('Seed colour'))
    assert.ok(screen.getByText(/Tab · Password/))
    assert.ok(screen.getByText(/Appearance value · One-time password/))
  })

  it('filters through its own search bar and offers the regex builder', () => {
    renderManager()

    fireEvent.change(screen.getByRole('searchbox', { name: /search locks/i }), {
      target: { value: 'seed' },
    })

    assert.equal(screen.queryByText('Release notes'), null)
    assert.ok(screen.getByText('Seed colour'))
    assert.ok(screen.getByRole('button', { name: /regex builder for/i }))
  })

  it('scopes select-all honestly rather than saying "all" for a filtered set', () => {
    renderManager()

    assert.ok(screen.getByText(/^Select all 2$/i))

    fireEvent.change(screen.getByRole('searchbox', { name: /search locks/i }), {
      target: { value: 'seed' },
    })

    // The bar's own select-all stops at the search and says so; the escape
    // hatch beside it is the only control that reaches the hidden lock.
    assert.ok(screen.getByText(/Select all 1 matching these filters/i))
    assert.ok(
      screen.getByRole('button', {
        name: /Select all 2 locks, including the ones this search is hiding/i,
      })
    )
  })

  it('never lets a select-all reach past the search', () => {
    renderManager()

    fireEvent.change(screen.getByRole('searchbox', { name: /search locks/i }), {
      target: { value: 'seed' },
    })
    fireEvent.click(screen.getByLabelText(/Select all 1 matching these/i))
    fireEvent.change(screen.getByRole('searchbox', { name: /search locks/i }), {
      target: { value: '' },
    })

    assert.ok(screen.getByText('1 selected'))
    assert.equal(
      (
        screen.getByLabelText(
          /Select the lock on Release notes/i
        ) as HTMLInputElement
      ).checked,
      false
    )
  })

  it('carries the scope in every bulk verb’s accessible name', () => {
    renderManager()

    fireEvent.click(screen.getByLabelText(/Select the lock on Seed colour/i))

    assert.ok(screen.getByRole('button', { name: /Remove locks.* 1 selected/i }))
    assert.ok(screen.getByRole('button', { name: /Export .* 1 selected/i }))
  })

  it('inverts a selection within the searched set', () => {
    renderManager()

    fireEvent.click(screen.getByLabelText(/Select the lock on Release notes/i))
    assert.ok(screen.getByText('1 selected'))

    fireEvent.click(screen.getByRole('button', { name: /invert selection/i }))
    assert.ok(screen.getByText('1 selected'))
    assert.equal(
      (
        screen.getByLabelText(
          /Select the lock on Seed colour/i
        ) as HTMLInputElement
      ).checked,
      true
    )
  })

  it('locks again only the locks that are actually open', () => {
    const relocked: Array<string> = []
    const { view } = renderManager({
      activeUnlocks: [{ lockId: 'lock-1', kind: 'session', expiresAt: null }],
      onLockAgain: lock => relocked.push(lock.id),
    })

    fireEvent.click(screen.getByRole('button', { name: /Lock again/i }))

    // Both locks are in scope; only the open one can be locked again, so the
    // partition holds the other back rather than the verb reporting a count
    // it never achieved.
    assert.deepEqual(relocked, ['lock-1'])

    view.unmount()
    renderManager()

    // Nothing is open, so the verb has nothing eligible and says so by being
    // unavailable rather than by running over two rows and doing nothing.
    assert.equal(
      (
        screen.getByRole('button', { name: /Lock again/i }) as HTMLButtonElement
      ).disabled,
      true
    )
  })

  it('exports every declared column through the bar, credentials omitted', () => {
    const { exported } = renderManager()

    fireEvent.click(screen.getByLabelText(/Select the lock on Seed colour/i))
    fireEvent.click(screen.getByRole('button', { name: /^Export/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/i }))

    assert.equal(exported.length, 1)
    assert.equal(exported[0].format, 'csv')
    assert.equal(exported[0].count, 1)
    assert.ok(exported[0].content.includes('Seed colour'))
    assert.ok(exported[0].content.includes('Credentials are not included'))
    for (const column of Md3LockExportColumns) {
      assert.ok(
        exported[0].content.includes(column.name),
        `the CSV is missing the declared column ${column.name}`
      )
    }
  })

  it('declares exactly the columns the export record carries', () => {
    const record = md3LockExportRecord(lockFixture())

    assert.deepEqual(
      Md3LockExportColumns.map(column => column.name).sort(),
      Object.keys(record).sort()
    )
    // The record is the only thing an export writes, so nothing that could
    // open a lock may appear in it.
    for (const key of Object.keys(record)) {
      assert.ok(!/secret|digest|salt|password|credential/i.test(key))
    }
  })

  it('puts a bulk removal behind the two-key super confirmation', () => {
    const { removed } = renderManager()

    fireEvent.click(screen.getByRole('button', { name: /Remove locks/i }))

    const gate = screen.getByRole('alertdialog')
    const confirm = screen.getByRole('button', { name: /^Remove 2 locks$/i })
    assert.equal((confirm as HTMLButtonElement).disabled, true)

    const slider = screen.getByRole('slider')
    assert.equal((slider as HTMLInputElement).disabled, true)

    fireEvent.click(screen.getByLabelText(/I want to remove 2 locks/i))
    fireEvent.click(screen.getByLabelText(/I have checked which locks/i))
    assert.equal((slider as HTMLInputElement).disabled, false)

    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /^Remove 2 locks$/i }))

    assert.deepEqual(removed, [['lock-1', 'lock-2']])
    assert.ok(gate)
  })

  it('removes one named lock from its own row without a gate', () => {
    const { removed } = renderManager()

    fireEvent.click(
      screen.getByRole('button', { name: /Remove the lock on Release notes/i })
    )

    assert.deepEqual(removed, [['lock-1']])
    assert.equal(screen.queryByRole('alertdialog'), null)
  })

  it('shows an honest empty state when a search matches nothing', () => {
    renderManager()

    fireEvent.change(screen.getByRole('searchbox', { name: /search locks/i }), {
      target: { value: 'nothing at all matches this' },
    })

    assert.ok(screen.getByText(/No lock matches this search/i))
  })

  it('says a lock is open and until when', () => {
    renderManager({
      activeUnlocks: [{ lockId: 'lock-1', kind: 'session', expiresAt: null }],
    })

    assert.ok(screen.getByText(/Unlocked until the app closes/i))
    assert.ok(
      screen.getByRole('button', { name: /Lock Release notes again now/i })
    )
  })
})

describe('lock context-menu items', () => {
  it('offers to lock the surface and shows the shortcut that works there', () => {
    const items = buildMd3LockMenuItems(
      {
        target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
        locks: [],
        activeUnlocks: [],
        now: 1_000,
      },
      {
        onLockTarget: () => {},
        onEditLock: () => {},
        onRemoveLock: () => {},
        onLockAgain: () => {},
        onManageLocks: () => {},
      }
    )

    assert.deepEqual(
      items.map(item => item.id),
      ['md3-lock-create', 'md3-lock-manage']
    )
    assert.equal(items[0].label, 'Lock this tab…')
    assert.equal(items[0].hint, '⇧⌘L')
  })

  it('emits one edit and one remove per lock, because a target can carry several', () => {
    const items = buildMd3LockMenuItems(
      {
        target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
        locks: [lockFixture(), lockFixture({ id: 'lock-2' })],
        activeUnlocks: [{ lockId: 'lock-2', kind: 'session', expiresAt: null }],
        now: 1_000,
      },
      {
        onLockTarget: () => {},
        onEditLock: () => {},
        onRemoveLock: () => {},
        onLockAgain: () => {},
        onManageLocks: () => {},
      }
    )

    assert.deepEqual(
      items.map(item => item.id),
      [
        'md3-lock-create',
        'md3-lock-edit-lock-1',
        'md3-lock-remove-lock-1',
        'md3-lock-edit-lock-2',
        'md3-lock-relock-lock-2',
        'md3-lock-remove-lock-2',
        'md3-lock-manage',
      ]
    )
  })

  it('labels a locked surface in search rather than hiding it', () => {
    assert.equal(
      md3LockedResultLabel('Release notes', true),
      'Release notes (locked)'
    )
    assert.equal(md3LockedResultLabel('Release notes', false), 'Release notes')
  })

  it('excludes locked tabs from a bulk close by default and says how many', () => {
    const tabs = ['a', 'b', 'c']
    const isLocked = (tab: string) => tab === 'b'

    const excluded = excludeLockedFromBulkClose(tabs, isLocked, false)
    assert.deepEqual(excluded.closing, ['a', 'c'])
    assert.deepEqual(excluded.excluded, ['b'])
    assert.match(excluded.notice ?? '', /1 locked tabs were left open/)

    const included = excludeLockedFromBulkClose(tabs, isLocked, true)
    assert.deepEqual(included.closing, tabs)
    assert.deepEqual(included.excluded, [])
    // An inclusive close still states how many locked tabs it swept up, so it
    // is never silently identical to an exclusive one.
    assert.notEqual(included.notice, null)

    const none = excludeLockedFromBulkClose(tabs, () => false, false)
    assert.equal(none.notice, null)
  })
})
