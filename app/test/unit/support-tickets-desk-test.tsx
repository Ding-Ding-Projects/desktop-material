import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { fireEvent, render, waitFor, within } from '../helpers/ui/render'
import { Md3SupportTicketsDesk } from '../../src/ui/md3/md3-support-tickets-view'
import { Md3SupportTicketEntry } from '../../src/ui/md3/md3-support-ticket-entry'
import {
  ISupportTicket,
  SupportTicketEntryPoint,
  SupportTicketEntryPoints,
  SupportTicketsStorageKey,
} from '../../src/lib/support-tickets'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../src/lib/i18n-resources'
import { LanguageModeStorageKey } from '../../src/lib/language-preference'
import { AudioSettingsStorageKey } from '../../src/lib/audio/audio-settings'
import { LanguageMode } from '../../src/models/language-mode'

const root = process.cwd()

/** A storage double, so no test touches the profile's real ticket store. */
function memoryStorage(tickets: ReadonlyArray<ISupportTicket> = []) {
  const values = new Map<string, string>([
    [SupportTicketsStorageKey, JSON.stringify(tickets)],
  ])
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    stored(): ReadonlyArray<ISupportTicket> {
      const raw = values.get(SupportTicketsStorageKey)
      return raw === undefined ? [] : JSON.parse(raw)
    },
  }
}

const folder = 'C:\\Users\\person\\AppData\\Roaming\\Desktop Material'

interface IDeskOptions {
  readonly entryPoint?: SupportTicketEntryPoint
  readonly storage?: ReturnType<typeof memoryStorage>
  readonly openFolder?: (path: string) => Promise<string>
  readonly resolveFolder?: () => Promise<string>
  readonly onExport?: (
    contents: string,
    fileName: string
  ) => Promise<string | null>
  readonly onCopy?: (text: string) => void
}

function renderDesk(options: IDeskOptions = {}) {
  const storage = options.storage ?? memoryStorage()
  const dismissed = { count: 0 }
  const view = render(
    <Md3SupportTicketsDesk
      entryPoint={options.entryPoint ?? 'unlockPrompt'}
      onDismissed={() => {
        dismissed.count += 1
      }}
      storage={storage}
      resolveFolder={options.resolveFolder ?? (async () => folder)}
      openFolder={options.openFolder ?? (async () => '')}
      onExport={
        options.onExport ?? (async () => 'C:\\out\\support-tickets.json')
      }
      onCopy={options.onCopy ?? (() => undefined)}
      now={() => new Date('2026-08-11T09:15:00.000Z')}
    />
  )
  return { view, storage, dismissed }
}

/** Raise a ticket through the real form. */
function raiseTicket(view: ReturnType<typeof render>, description: string) {
  fireEvent.change(view.getByLabelText('What happened'), {
    target: { value: description },
  })
  fireEvent.click(view.getByRole('button', { name: 'Raise ticket' }))
}

/** Every language/global preference this suite writes, so it can restore them. */
const preferenceKeys = [LanguageModeStorageKey, AudioSettingsStorageKey]
const savedPreferences = new Map<string, string | null>()

beforeEach(() => {
  for (const key of preferenceKeys) {
    savedPreferences.set(key, localStorage.getItem(key))
    localStorage.removeItem(key)
  }
})

afterEach(() => {
  for (const key of preferenceKeys) {
    const value = savedPreferences.get(key) ?? null
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  }
})

describe('Support Tickets desk: the three routes', () => {
  it('opens from the unlock prompt, the lock setting and Help, and names the route', () => {
    const expected: Record<SupportTicketEntryPoint, string> = {
      unlockPrompt: 'You arrived from the unlock prompt.',
      lockSetting: 'You arrived from the lock setting.',
      help: 'You arrived from Help.',
    }

    for (const entryPoint of SupportTicketEntryPoints) {
      const storage = memoryStorage()
      const view = render(
        <Md3SupportTicketEntry
          entryPoint={entryPoint}
          storage={storage}
          resolveFolder={async () => folder}
          openFolder={async () => ''}
          onCopy={() => undefined}
        />
      )

      const link = view.getByRole('button', { expanded: false })
      assert.equal(view.queryByRole('dialog'), null)
      fireEvent.click(link)

      const desk = view.getByRole('dialog')
      assert.ok(
        within(desk).getByText(expected[entryPoint]) !== null,
        `${entryPoint} must name its own route`
      )
      view.unmount()
    }
  })

  it('gives the unlock prompt the wording a locked-out user is looking for', () => {
    const view = render(
      <Md3SupportTicketEntry
        entryPoint="unlockPrompt"
        storage={memoryStorage()}
        resolveFolder={async () => folder}
      />
    )
    // The link's accessible name has to contain its visible words, or a speech
    // input user cannot activate what they can read.
    const link = view.getByRole('button', {
      name: 'Forgotten your password? — open the local Support Tickets desk',
    })
    assert.ok(link.textContent?.includes('Forgotten your password?'))
  })
})

describe('Support Tickets desk: the ticket lifecycle', () => {
  it('raises a ticket with a local number and a canned first response', () => {
    const { view, storage } = renderDesk()

    raiseTicket(view, 'I locked the History tab and forgot the PIN.')

    assert.ok(view.getByText('DM-20260811-0001') !== null)
    assert.ok(
      view.getByText('I locked the History tab and forgot the PIN.') !== null
    )
    // The canned acknowledgement is there immediately, locally, with no delay
    // that could read as a queue somebody is working through.
    assert.ok(
      view.getByText(/Thank you for contacting/) !== null,
      'the desk answers immediately and locally'
    )

    const stored = storage.stored()
    assert.equal(stored.length, 1)
    assert.equal(stored[0].number, 'DM-20260811-0001')
    assert.equal(stored[0].status, 'received')
    assert.equal(stored[0].entryPoint, 'unlockPrompt')
  })

  it('refuses an empty description and says which field needs filling in', () => {
    const { view, storage } = renderDesk()
    fireEvent.click(view.getByRole('button', { name: 'Raise ticket' }))

    assert.ok(
      view
        .getByRole('alert')
        .textContent?.includes(
          'Describe what happened before raising the ticket.'
        )
    )
    assert.equal(storage.stored().length, 0)
  })

  it('advances the status one step at a time and stops at resolved', () => {
    const { view, storage } = renderDesk()
    raiseTicket(view, 'Locked out of the appearance editor.')

    const advance = () =>
      fireEvent.click(
        view.getByRole('button', { name: 'Advance ticket DM-20260811-0001' })
      )

    advance()
    assert.equal(storage.stored()[0].status, 'triaged')
    advance()
    assert.equal(storage.stored()[0].status, 'awaitingCustomer')
    advance()
    assert.equal(storage.stored()[0].status, 'resolved')
    assert.equal(storage.stored()[0].responses.length, 4)

    // Resolved is terminal, and the control says so by being unavailable
    // rather than by silently doing nothing.
    assert.equal(
      view
        .getByRole('button', { name: 'Advance ticket DM-20260811-0001' })
        .hasAttribute('disabled'),
      true
    )
  })

  it('searches the list, and offers the regex builder beside the field', () => {
    const { view } = renderDesk()
    raiseTicket(view, 'alpha lockout')
    raiseTicket(view, 'beta lockout')

    const search = view.getByRole('searchbox', { name: 'Search tickets' })
    fireEvent.change(search, { target: { value: 'alpha' } })
    assert.ok(view.queryByText('alpha lockout') !== null)
    assert.equal(view.queryByText('beta lockout'), null)

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(
      view.getByRole('button', { name: 'Regex builder for support tickets' })
    )
    assert.ok(
      view.getAllByRole('dialog').length > 1,
      'the anchored regex builder opens from this field'
    )
  })

  it('selects in bulk and exports exactly the scope it names', async () => {
    const exported = new Array<{ contents: string; fileName: string }>()
    const { view } = renderDesk({
      onExport: async (contents, fileName) => {
        exported.push({ contents, fileName })
        return 'C:\\out\\support-tickets.json'
      },
    })
    raiseTicket(view, 'first lockout')
    raiseTicket(view, 'second lockout')

    // Select-all is honestly scoped: with no filter it says "all N tickets".
    const selectAll = view.getByLabelText('Select all 2 tickets')
    fireEvent.click(selectAll)
    assert.ok(view.getByText('2 selected') !== null)

    fireEvent.click(view.getByRole('button', { name: 'Invert selection' }))
    assert.ok(view.getByText('0 selected') !== null)

    fireEvent.click(selectAll)
    fireEvent.click(
      view.getByRole('button', {
        name: 'Export — 2 selected tickets',
      })
    )
    fireEvent.click(view.getByRole('menuitem', { name: 'JSON .json' }))

    await waitFor(() => assert.equal(exported.length, 1))
    const payload = JSON.parse(exported[0].contents)
    assert.equal(payload.tickets.length, 2)
    assert.equal(payload.scope, '2 selected tickets')
  })
})

describe('Support Tickets desk: destructive actions', () => {
  it('sends every ticket deletion through the two-key gate', () => {
    const { view, storage } = renderDesk()
    raiseTicket(view, 'Locked out, please help.')

    fireEvent.click(
      view.getByRole('button', { name: 'Delete ticket DM-20260811-0001' })
    )

    const gate = view.getByRole('alertdialog')
    // Nothing has gone yet, and the confirm button cannot be pressed.
    assert.equal(storage.stored().length, 1)
    const confirm = within(gate).getByRole('button', {
      name: 'Delete 1 tickets',
    })
    assert.equal(confirm.hasAttribute('disabled'), true)

    // One key alone is not enough.
    const keys = within(gate).getAllByRole('checkbox')
    fireEvent.click(keys[0])
    assert.equal(confirm.hasAttribute('disabled'), true)

    // Both keys, and the slider still has to travel its full range.
    fireEvent.click(keys[1])
    const slider = within(gate).getByRole('slider')
    fireEvent.change(slider, { target: { value: '60' } })
    assert.equal(confirm.hasAttribute('disabled'), true)
    assert.equal(storage.stored().length, 1)

    fireEvent.change(slider, { target: { value: '100' } })
    assert.equal(confirm.hasAttribute('disabled'), false)
    fireEvent.click(confirm)

    assert.equal(storage.stored().length, 0)
  })

  it('offers no route that deletes the application data folder', () => {
    const { view } = renderDesk()
    const buttons = view
      .getAllByRole('button')
      .map(
        button => button.getAttribute('aria-label') ?? button.textContent ?? ''
      )

    // The desk opens the folder and stops there; deletion is the user's own
    // act in their own file manager.
    for (const label of buttons) {
      assert.equal(
        /delete (the )?(application|app) data|delete .*folder|erase .*profile/i.test(
          label
        ),
        false,
        `no control may delete the profile: found "${label}"`
      )
    }
    assert.ok(
      view.getByText(
        'This app opens the folder and stops there. It never deletes it for you.'
      ) !== null
    )
  })
})

describe('Support Tickets desk: the resolution', () => {
  it('opens exactly the folder it displays', async () => {
    const opened = new Array<string>()
    const { view } = renderDesk({
      openFolder: async path => {
        opened.push(path)
        return ''
      },
    })

    await waitFor(() => assert.ok(view.getByText(folder) !== null))
    fireEvent.click(view.getByRole('button', { name: 'Open the folder' }))

    await waitFor(() => assert.deepStrictEqual(opened, [folder]))
    await waitFor(() =>
      assert.ok(
        view.getByText(`Opened ${folder} in your file manager.`) !== null
      )
    )
  })

  it('reports the file manager failure verbatim instead of claiming success', async () => {
    const { view } = renderDesk({
      openFolder: async () => 'Failed to open path',
    })

    await waitFor(() => assert.ok(view.getByText(folder) !== null))
    fireEvent.click(view.getByRole('button', { name: 'Open the folder' }))

    await waitFor(() =>
      assert.ok(
        view.getByText(
          `The file manager could not open ${folder}. It reported: Failed to open path`
        ) !== null
      )
    )
  })

  it('says plainly when no folder could be resolved, and offers nothing to press', async () => {
    const { view } = renderDesk({ resolveFolder: async () => '' })

    await waitFor(() =>
      assert.equal(
        view
          .getByRole('button', { name: 'Open the folder' })
          .hasAttribute('disabled'),
        true
      )
    )
    assert.ok(
      view.getByText(
        'No value from the running application yet, so no folder is shown and the Open button stays unavailable.'
      ) !== null
    )
  })

  it('copies the exact displayed path', async () => {
    const copied = new Array<string>()
    const { view } = renderDesk({ onCopy: text => copied.push(text) })
    await waitFor(() => assert.ok(view.getByText(folder) !== null))
    fireEvent.click(view.getByRole('button', { name: 'Copy the path' }))
    assert.deepStrictEqual(copied, [folder])
  })
})

describe('Support Tickets desk: the disclosure line', () => {
  const english = englishTranslations['supportTickets.disclosure']
  const cantonese = cantoneseTranslations['supportTickets.disclosure'] ?? ''

  function disclosureText(container: HTMLElement): string {
    const node = container.querySelector(
      '.md3-support-tickets__disclosure-text'
    )
    assert.ok(node !== null, 'the disclosure line must be rendered')
    return node.textContent ?? ''
  }

  /**
   * The one line the joke is not allowed to touch. A user who sits waiting for
   * a reply that was never coming is the failure this whole feature exists to
   * avoid, so the sentence must be identical at every funny level in every
   * language mode.
   *
   * This is a guard, and it has been watched to fail: routing the disclosure
   * through `translateWithFunnyLevel` turns the funny-level half of it red, and
   * putting it back turns it green.
   */
  it('is present and unaltered at every funny level in every language mode', () => {
    const modes: ReadonlyArray<LanguageMode> = [
      'english',
      'cantonese',
      'bilingual',
    ]

    for (const mode of modes) {
      localStorage.setItem(LanguageModeStorageKey, mode)
      for (let level = 1; level <= 5; level++) {
        localStorage.setItem(
          AudioSettingsStorageKey,
          JSON.stringify({
            funnyLevelEnglish: level,
            funnyLevelCantonese: level,
          })
        )

        const { view } = renderDesk()
        const expected =
          mode === 'english'
            ? english
            : mode === 'cantonese'
            ? cantonese
            : `${english} · ${cantonese}`

        assert.equal(
          disclosureText(view.container as HTMLElement),
          expected,
          `funny level ${level} in ${mode} must not alter the disclosure`
        )
        view.unmount()
      }
    }
  })

  it('states every promise the contract requires it to state', () => {
    for (const phrase of [
      'sent anywhere',
      'outside this machine',
      'no network request',
      'no data is collected',
      'nobody is reading it',
    ]) {
      assert.ok(
        english.toLowerCase().includes(phrase),
        `the disclosure must say "${phrase}"`
      )
    }
    assert.notEqual(cantonese, '')
    assert.notEqual(cantonese, english)
  })

  it('changes voice with the funny level everywhere the joke IS allowed', () => {
    localStorage.setItem(LanguageModeStorageKey, 'english')
    const readLead = (level: number) => {
      localStorage.setItem(
        AudioSettingsStorageKey,
        JSON.stringify({
          funnyLevelEnglish: level,
          funnyLevelCantonese: level,
        })
      )
      const { view } = renderDesk()
      const node = view.container.querySelector('.md3-support-tickets__lead')
      const text = node?.textContent ?? ''
      view.unmount()
      return text
    }

    assert.notEqual(readLead(1), readLead(5))
  })
})

describe('Support Tickets desk: no network', () => {
  /**
   * The disclosure promises no network request is made. This asserts it rather
   * than trusting the sentence: every transport jsdom exposes is replaced with
   * a recorder for the whole lifecycle of a ticket.
   */
  it('makes no network request anywhere in a full ticket lifecycle', async () => {
    const calls = new Array<string>()
    const globals = globalThis as unknown as Record<string, unknown>
    const saved = new Map<string, unknown>()

    for (const name of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
    ]) {
      saved.set(name, globals[name])
      globals[name] = function recorded() {
        calls.push(name)
        throw new Error(`${name} must never be reached from the support desk`)
      }
    }
    const sendBeacon = navigator.sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => {
        calls.push('sendBeacon')
        return false
      },
    })

    try {
      const { view } = renderDesk({ openFolder: async () => '' })
      raiseTicket(view, 'Nothing about this leaves the machine.')
      fireEvent.click(
        view.getByRole('button', { name: 'Advance ticket DM-20260811-0001' })
      )
      await waitFor(() => assert.ok(view.getByText(folder) !== null))
      fireEvent.click(view.getByRole('button', { name: 'Open the folder' }))
      await waitFor(() =>
        assert.ok(view.getByText(new RegExp('Opened ')) !== null)
      )
    } finally {
      for (const [name, value] of saved) {
        globals[name] = value
      }
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: sendBeacon,
      })
    }

    assert.deepStrictEqual(calls, [])
  })

  it('references no network API in its own source', () => {
    const modules = [
      'app/src/lib/support-tickets.ts',
      'app/src/lib/support-ticket-export.ts',
      'app/src/lib/support-ticket-recovery.ts',
      'app/src/ui/md3/md3-support-tickets-view.tsx',
      'app/src/ui/md3/md3-support-ticket-entry.tsx',
      'app/src/ui/md3/md3-support-ticket-delete-gate.tsx',
    ]
    for (const module of modules) {
      const text = readFileSync(join(root, module), 'utf8')
      for (const symbol of [
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
        'sendBeacon',
        'https://',
        'http://',
      ]) {
        assert.equal(
          text.includes(symbol),
          false,
          `${module} must not reference ${symbol}`
        )
      }
    }
  })
})
