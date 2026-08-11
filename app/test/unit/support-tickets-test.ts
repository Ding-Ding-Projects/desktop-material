import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  advanceSupportTicket,
  createSupportTicket,
  formatSupportTicketNumber,
  isValidSupportTicketDescription,
  ISupportTicket,
  MaximumStoredSupportTickets,
  MaximumSupportTicketDescriptionLength,
  nextSupportTicketSequence,
  nextSupportTicketStatus,
  normalizeSupportTicketDescription,
  readSupportTickets,
  SupportTicketsStorageKey,
  writeSupportTickets,
} from '../../src/lib/support-tickets'
import {
  serializeSupportTicketExport,
  SupportTicketExportFormats,
  toSupportTicketExportRecord,
} from '../../src/lib/support-ticket-export'

/** A storage double, so no test touches the profile's real localStorage. */
function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) {
    values.set(SupportTicketsStorageKey, initial)
  }
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

const at = new Date('2026-08-11T09:15:00.000Z')

function ticket(): ISupportTicket {
  return createSupportTicket(
    {
      category: 'forgottenPassword',
      severity: 'critical',
      description: 'I locked the appearance tab and cannot remember the PIN.',
      entryPoint: 'unlockPrompt',
    },
    { at }
  )
}

describe('support ticket records', () => {
  it('generates a dated, zero-padded number that exists only on this machine', () => {
    assert.equal(formatSupportTicketNumber(at, 1), 'DM-20260811-0001')
    assert.equal(formatSupportTicketNumber(at, 42), 'DM-20260811-0042')
    // A nonsense sequence is clamped rather than producing `DM-…-000-1`.
    assert.equal(formatSupportTicketNumber(at, 0), 'DM-20260811-0001')
  })

  it('derives the next sequence from the tickets already stored', () => {
    const existing = [
      { ...ticket(), number: 'DM-20260811-0003' },
      { ...ticket(), number: 'DM-20260811-0001' },
      // A different day must not raise today's sequence.
      { ...ticket(), number: 'DM-20260810-0099' },
    ]
    assert.equal(nextSupportTicketSequence(existing, at), 4)
    assert.equal(nextSupportTicketSequence([], at), 1)
  })

  it('attaches the canned first response when a ticket is raised', () => {
    const raised = createSupportTicket(
      {
        category: 'lostAuthenticator',
        severity: 'whenever',
        description: '  My phone went in the washing machine.  ',
        entryPoint: 'help',
      },
      { at }
    )

    assert.equal(raised.number, 'DM-20260811-0001')
    assert.equal(raised.id, raised.number)
    assert.equal(raised.status, 'received')
    assert.equal(raised.entryPoint, 'help')
    // Trimmed, never reinterpreted.
    assert.equal(raised.description, 'My phone went in the washing machine.')
    assert.deepStrictEqual(raised.responses, [
      { kind: 'acknowledged', at: at.toISOString() },
    ])
  })

  it('advances a ticket one status at a time and stops at resolved', () => {
    const raised = ticket()
    assert.equal(nextSupportTicketStatus('received'), 'triaged')
    assert.equal(nextSupportTicketStatus('resolved'), null)

    const triaged = advanceSupportTicket(raised, new Date(at.getTime() + 1000))
    assert.equal(triaged.status, 'triaged')
    assert.equal(triaged.responses.length, 2)
    assert.equal(triaged.responses[1].kind, 'triaged')

    const awaiting = advanceSupportTicket(triaged)
    assert.equal(awaiting.status, 'awaitingCustomer')
    const resolved = advanceSupportTicket(awaiting)
    assert.equal(resolved.status, 'resolved')
    assert.equal(resolved.responses.length, 4)

    // Terminal, and returned by identity so a caller can tell nothing happened.
    assert.ok(advanceSupportTicket(resolved) === resolved)
  })

  it('bounds and validates what the form may submit', () => {
    assert.equal(isValidSupportTicketDescription('   '), false)
    assert.equal(isValidSupportTicketDescription(' locked out '), true)
    assert.equal(
      normalizeSupportTicketDescription(
        'x'.repeat(MaximumSupportTicketDescriptionLength + 50)
      ).length,
      MaximumSupportTicketDescriptionLength
    )
    assert.equal(normalizeSupportTicketDescription(undefined), '')
  })
})

describe('support ticket storage', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    const stored = writeSupportTickets([ticket()], storage)
    assert.equal(stored.length, 1)
    assert.deepStrictEqual(readSupportTickets(storage), stored)
  })

  it('keeps the records that survive a damaged store instead of throwing', () => {
    // A desk that refuses to open because one record is malformed has locked
    // the user out of the route that exists to let them back in.
    const good = ticket()
    const storage = memoryStorage(
      JSON.stringify([good, { number: 'DM-1', category: 'nope' }, 7, null])
    )
    const read = readSupportTickets(storage)
    assert.equal(read.length, 1)
    assert.equal(read[0].number, good.number)

    assert.deepStrictEqual(readSupportTickets(memoryStorage('{oops')), [])
    assert.deepStrictEqual(readSupportTickets(memoryStorage('{}')), [])
    assert.deepStrictEqual(readSupportTickets(memoryStorage()), [])
  })

  it('caps the stored list rather than growing without bound', () => {
    const storage = memoryStorage()
    const many = Array.from(
      { length: MaximumStoredSupportTickets + 10 },
      (_, index) => ({
        ...ticket(),
        id: `id-${index}`,
        number: `DM-20260811-${String(index + 1).padStart(4, '0')}`,
      })
    )
    const stored = writeSupportTickets(many, storage)
    assert.equal(stored.length, MaximumStoredSupportTickets)
    assert.equal(stored[0].id, 'id-0')
  })
})

describe('support ticket export', () => {
  const record = toSupportTicketExportRecord(ticket(), {
    category: 'I have forgotten a password',
    severity: 'Critical, business stopped',
    status: 'Received',
    entryPoint: 'You arrived from the unlock prompt.',
  })

  it('offers every format and writes the whole record in each of them', () => {
    assert.equal(SupportTicketExportFormats.length, 9)
    for (const descriptor of SupportTicketExportFormats) {
      const payload = serializeSupportTicketExport(
        [record],
        descriptor.format,
        {
          scope: '1 selected ticket',
        }
      )
      assert.equal(payload.count, 1)
      assert.equal(payload.filename, `support-tickets.${descriptor.extension}`)
      assert.ok(
        payload.content.includes(record.number),
        `${descriptor.format} dropped the ticket number`
      )
      assert.ok(
        payload.content.includes('Received'),
        `${descriptor.format} dropped the status`
      )
    }
  })

  it('round-trips through JSON without losing a field', () => {
    const payload = serializeSupportTicketExport([record], 'json', {
      scope: 'all 1 tickets',
    })
    const parsed = JSON.parse(payload.content)
    assert.equal(parsed.scope, 'all 1 tickets')
    assert.deepStrictEqual(parsed.tickets[0], record)
  })

  it('escapes delimited and markup formats rather than corrupting them', () => {
    const awkward = { ...record, description: 'quote " pipe | comma , tag <b>' }
    const csv = serializeSupportTicketExport([awkward], 'csv', { scope: 's' })
    assert.ok(csv.content.includes('quote "" pipe | comma , tag <b>'))
    const md = serializeSupportTicketExport([awkward], 'markdown', {
      scope: 's',
    })
    assert.ok(md.content.includes('pipe \\| comma'))
    const xml = serializeSupportTicketExport([awkward], 'xml', { scope: 's' })
    assert.ok(xml.content.includes('&lt;b&gt;'))
  })
})
