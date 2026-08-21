import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { AppearanceLockControl } from '../../src/ui/appearance/appearance-lock-control'
import {
  Md3LocksStorageKey,
  isTargetLocked,
  readMd3Locks,
} from '../../src/lib/md3-locks'
import {
  resetMd3LockCredentialVault,
  setMd3LockCredentialVault,
} from '../../src/lib/md3-locks/lock-credentials'
import { fireEvent, render, screen } from '../helpers/ui/render'

/**
 * The toy lock every appearance editor carries.
 *
 * Two things are asserted and the second is the one that matters. First, that
 * the control locks and unlocks and stays honest about being a toy. Second,
 * that EVERY appearance editor has one — not by checking the editors that
 * happen to have a lock, which would pass on an app where none of them do, but
 * by requiring the prop at the type level and proving here that no call site
 * has been added without it.
 */

const root = process.cwd()

/** An in-memory stand-in for the OS credential vault. */
function useMemoryVault(): Map<string, string> {
  const store = new Map<string, string>()
  setMd3LockCredentialVault({
    read: async account => store.get(account) ?? null,
    write: async (account, value) => void store.set(account, value),
    remove: async account => store.delete(account),
  })
  return store
}

beforeEach(() => {
  localStorage.removeItem(Md3LocksStorageKey)
  useMemoryVault()
})

afterEach(() => {
  localStorage.removeItem(Md3LocksStorageKey)
  resetMd3LockCredentialVault()
})

const control = () => (
  <AppearanceLockControl targetId="test:toolbar" targetLabel="Toolbar" />
)

/**
 * Wait until `condition` holds, rather than for a fixed tick.
 *
 * Locking and unlocking both await a salted digest, so a single
 * `setTimeout(0)` is a bet that the crypto resolves within one turn of the
 * loop. It does on an idle machine and does not under a full parallel suite —
 * this test passed alone and failed once in the whole run, which is the shape
 * every hardware-dependent wait eventually takes.
 */
async function waitFor(
  condition: () => boolean,
  what: string,
  attempts = 200
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail(`timed out waiting for ${what}`)
}

const locked = () =>
  isTargetLocked(readMd3Locks(), 'appearanceElement', 'test:toolbar')

/**
 * The rendered lock state, which is a strictly later event than the stored one.
 *
 * Waiting on the store alone returns as soon as the write lands and before
 * React has re-rendered, so the next `getByRole` looks for a button that is
 * about to exist. Waiting on the UI proves both.
 */
const showsRemove = () =>
  screen.queryByRole('button', { name: /Remove the lock…/ }) !== null

const showsLock = () =>
  screen.queryByRole('button', { name: /Lock this appearance…/ }) !== null

/** The appearance editor now delegates creation to the shared lock setup. */
const savePasswordLock = (password: string) => {
  fireEvent.change(screen.getByLabelText(/Password for this lock/), {
    target: { value: password },
  })
  fireEvent.change(screen.getByLabelText(/Type it again/), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save this lock' }))
}

/** An alert with real text, which is how the component reports a refusal. */
const alerted = () =>
  ((screen.queryByRole('alert')?.textContent ?? '') +
    (screen.queryByRole('status')?.textContent ?? '')).length > 0

describe('appearance lock control', () => {
  it('delegates creation to the shared password-or-authenticator setup', () => {
    const source = readFileSync(
      join(root, 'app/src/ui/appearance/appearance-lock-control.tsx'),
      'utf8'
    )
    assert.match(source, /<Md3LockSetupDialog/)
    assert.match(source, /lock=\{null\}/)
    assert.match(
      source,
      /applicationDataFolder=\{this\.state\.applicationDataFolder\}/
    )
    assert.match(source, /onLockSaved/)
  })

  it('says it is a toy before anything is locked', () => {
    render(control())

    const recovery = screen.getByText(/speed bump for fun/i)
    assert.ok(recovery !== null)
    assert.match(
      recovery.textContent ?? '',
      /not encryption/i,
      'the disclosure must not soften into something that sounds protective'
    )
    assert.match(
      recovery.textContent ?? '',
      /application data folder/i,
      'a toy lock must print its own recovery route, because forgetting the ' +
        'password is a normal outcome and nobody should be stuck behind one'
    )
  })

  it('locks the element behind a password of its own', async () => {
    render(control())

    fireEvent.click(
      screen.getByRole('button', { name: /Lock this appearance…/ })
    )
    savePasswordLock('correct horse')
    await waitFor(showsRemove, 'the locked state to render')

    const [lock] = readMd3Locks()
    assert.equal(lock.factor, 'password')
    assert.equal(lock.target.kind, 'appearanceElement')
    assert.equal(lock.target.label, 'Toolbar')
  })

  it('refuses a password too short to be one, and locks nothing', async () => {
    render(control())

    fireEvent.click(
      screen.getByRole('button', { name: /Lock this appearance…/ })
    )
    fireEvent.change(screen.getByLabelText(/Password for this lock/), {
      target: { value: 'x' },
    })
    fireEvent.change(screen.getByLabelText(/Type it again/), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save this lock' }))
    await waitFor(alerted, 'the refusal to be reported')

    assert.equal(readMd3Locks().length, 0, 'nothing may be locked')
    // The message says what to do, not merely that something was wrong.
    assert.match(
      screen.getByRole('status').textContent ?? '',
      /4 to 128 characters/
    )
  })

  it('keeps the lock in place when the wrong password is given', async () => {
    render(control())

    fireEvent.click(
      screen.getByRole('button', { name: /Lock this appearance…/ })
    )
    savePasswordLock('correct horse')
    await waitFor(showsRemove, 'the locked state to render')

    fireEvent.click(screen.getByRole('button', { name: /Remove the lock…/ }))
    fireEvent.change(screen.getByLabelText(/Remove the lock/), {
      target: { value: 'wrong horse' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove the lock' }))
    await waitFor(alerted, 'the refusal to be reported')

    assert.ok(locked(), 'a wrong password must leave the lock alone')
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /still in place/,
      'and must say so, rather than failing silently'
    )
  })

  it('removes the lock when the right password is given', async () => {
    render(control())

    fireEvent.click(
      screen.getByRole('button', { name: /Lock this appearance…/ })
    )
    savePasswordLock('correct horse')
    await waitFor(showsRemove, 'the locked state to render')

    fireEvent.click(screen.getByRole('button', { name: /Remove the lock…/ }))
    fireEvent.change(screen.getByLabelText(/Remove the lock/), {
      target: { value: 'correct horse' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove the lock' }))
    await waitFor(showsLock, 'the unlocked state to render')

    assert.equal(readMd3Locks().length, 0)
  })
})

describe('every appearance editor carries a lock', () => {
  /** Every `<AnchoredAppearanceEditor` in the tree, with its file. */
  function callSites(): ReadonlyArray<readonly [string, string]> {
    const found: Array<readonly [string, string]> = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const full = join(directory, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.endsWith('.tsx')) {
          continue
        }
        const source = readFileSync(full, 'utf8')
        // The definition itself is not a call site.
        if (entry === 'anchored-appearance-editor.tsx') {
          continue
        }
        for (const match of source.matchAll(
          /<AnchoredAppearanceEditor[\s\S]{0,1400}?>/g
        )) {
          found.push([full.slice(root.length + 1), match[0]])
        }
      }
    }
    walk(join(root, 'app/src'))
    return found
  }

  it('finds a set of editors worth asserting against', () => {
    // A broken scan would find none and report a perfectly locked app.
    assert.ok(
      callSites().length >= 5,
      `only ${callSites().length} appearance editors found; that is a broken ` +
        'scan rather than an app that stopped offering them'
    )
  })

  it('gives every editor a lock target', () => {
    // `lockTargetId` is a required prop, so this cannot currently fail without
    // the build failing first. It is here for the day somebody makes it
    // optional "just for this one call site" — which is exactly how seven
    // export pickers ended up unreachable.
    const missing = callSites()
      .filter(([, markup]) => !markup.includes('lockTargetId'))
      .map(([file]) => file)

    assert.deepEqual(
      missing,
      [],
      'these appearance editors style an element that cannot be locked:\n  ' +
        missing.join('\n  ')
    )
  })
})
