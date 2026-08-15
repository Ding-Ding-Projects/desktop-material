import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  addEntry,
  assignGroup,
  createEntry,
  createEntryId,
  DefaultAuthenticatorDocument,
  entryHaystack,
  entryParameters,
  entryParameterSummary,
  entryTitle,
  IAuthenticatorDocument,
  isAuthenticatorDocument,
  isAuthenticatorEntry,
  MaximumAuthenticatorEntries,
  moveEntry,
  normalizeAuthenticatorDocument,
  removeEntries,
  removeGroup,
  renameGroup,
  updateEntry,
} from '../../src/lib/authenticator/entries'
import {
  AuthenticatorVaultService,
  deleteAuthenticatorSecret,
  deleteAuthenticatorSecrets,
  hasAuthenticatorSecret,
  IAuthenticatorVault,
  readAuthenticatorSecret,
  storeAuthenticatorSecret,
} from '../../src/lib/authenticator/secret-vault'
import {
  Md3AuthenticatorExportFormats,
  serializeMd3AuthenticatorExport,
  serializeMd3AuthenticatorSecrets,
} from '../../src/ui/md3/md3-authenticator-export'
import {
  filterMd3AuthenticatorFactors,
  md3AuthenticatorExportRecord,
  md3FactorTitle,
} from '../../src/ui/md3/md3-authenticator-view'
import {
  md3AuthenticatorFixtureFactors,
  md3AuthenticatorFixtureSecrets,
} from '../../src/ui/md3/md3-authenticator-fixtures'

/**
 * The authenticator's records, its credential-vault boundary, and its exports.
 *
 * The assertions that matter most here are the negative ones: that the
 * document never carries a secret, that an ordinary export never carries one
 * and says so out loud, and that the secrets export is a separate function
 * nothing else calls.
 */

const seed = (
  entries: IAuthenticatorDocument['entries'],
  groups: ReadonlyArray<string> = []
): IAuthenticatorDocument =>
  normalizeAuthenticatorDocument({ version: 1, entries, groups })

const entry = (id: string) =>
  createEntry(id, 'Issuer', `${id}@example.com`, {}, '2026-01-01T00:00:00Z')

describe('the authenticator document', () => {
  it('starts genuinely empty rather than seeded with an example', () => {
    assert.deepEqual(DefaultAuthenticatorDocument.entries, [])
    assert.deepEqual(DefaultAuthenticatorDocument.groups, [])
  })

  it('validates a well-formed document and rejects a malformed one', () => {
    assert.equal(isAuthenticatorDocument(DefaultAuthenticatorDocument), true)
    assert.equal(
      isAuthenticatorDocument({ version: 2, entries: [], groups: [] }),
      false
    )
    assert.equal(
      isAuthenticatorDocument({ version: 1, entries: {}, groups: [] }),
      false
    )
    assert.equal(isAuthenticatorDocument(null), false)
    assert.equal(isAuthenticatorEntry({ ...entry('a'), account: '' }), false)
    assert.equal(
      isAuthenticatorEntry({ ...entry('a'), algorithm: 'MD5' }),
      false
    )
  })

  it('never carries a secret field', () => {
    // The whole security design is that the document is ordinary settings data
    // and the secret lives in the credential vault. A field that crept in here
    // would be written to disk and to the local Git history.
    const document = addEntry(DefaultAuthenticatorDocument, entry('a'))
    for (const record of document.entries) {
      assert.equal('secret' in record, false)
      assert.equal(JSON.stringify(record).includes('secret'), false)
    }
  })

  it('drops a duplicate id rather than letting two rows share a vault key', () => {
    const document = seed([entry('a'), entry('a'), entry('b')])
    assert.deepEqual(
      document.entries.map(record => record.id),
      ['a', 'b']
    )
  })

  it('guarantees every referenced group exists in the group list', () => {
    const document = seed([
      { ...entry('a'), group: 'Work' },
      { ...entry('b'), group: 'Money' },
    ])
    assert.deepEqual(document.groups, ['Work', 'Money'])
  })

  it('keeps an empty group the user deliberately made', () => {
    const document = seed([entry('a')], ['Later'])
    assert.deepEqual(document.groups, ['Later'])
  })

  it('clamps parameters a hand-edited file could put out of range', () => {
    const document = seed([{ ...entry('a'), digits: 99, period: 0 }])
    assert.equal(document.entries[0].digits, 8)
    assert.equal(document.entries[0].period, 1)
  })

  it('bounds how many entries a file can carry', () => {
    const many = Array.from(
      { length: MaximumAuthenticatorEntries + 20 },
      (_, index) => entry(`entry-${index}`)
    )
    assert.equal(seed(many).entries.length, MaximumAuthenticatorEntries)
  })

  it('adds, edits and removes entries', () => {
    let document = addEntry(DefaultAuthenticatorDocument, entry('a'))
    document = addEntry(document, entry('b'))
    assert.equal(document.entries.length, 2)

    document = updateEntry(document, 'a', { issuer: 'Renamed' })
    assert.equal(document.entries[0].issuer, 'Renamed')

    document = removeEntries(document, ['a'])
    assert.deepEqual(
      document.entries.map(record => record.id),
      ['b']
    )
  })

  it('moves an entry to a new index and clamps out-of-range targets', () => {
    const document = seed([entry('a'), entry('b'), entry('c')])
    assert.deepEqual(
      moveEntry(document, 'a', 2).entries.map(record => record.id),
      ['b', 'c', 'a']
    )
    assert.deepEqual(
      moveEntry(document, 'c', -5).entries.map(record => record.id),
      ['c', 'a', 'b']
    )
    assert.deepEqual(
      moveEntry(document, 'a', 99).entries.map(record => record.id),
      ['b', 'c', 'a']
    )
    assert.equal(moveEntry(document, 'missing', 0), document)
  })

  it('groups, renames and ungroups', () => {
    let document = seed([entry('a'), entry('b')])
    document = assignGroup(document, ['a', 'b'], 'Work')
    assert.deepEqual(document.groups, ['Work'])
    assert.equal(
      document.entries.every(record => record.group === 'Work'),
      true
    )

    document = renameGroup(document, 'Work', 'Day job')
    assert.deepEqual(document.groups, ['Day job'])
    assert.equal(
      document.entries.every(record => record.group === 'Day job'),
      true
    )

    // Removing a group keeps its members; they simply stop being filed.
    document = removeGroup(document, 'Day job')
    assert.deepEqual(document.groups, [])
    assert.equal(
      document.entries.every(record => record.group === ''),
      true
    )
  })

  it('refuses to rename a group to nothing', () => {
    const document = assignGroup(seed([entry('a')]), ['a'], 'Work')
    assert.equal(renameGroup(document, 'Work', '   '), document)
  })

  it('describes an entry without inventing an issuer it does not have', () => {
    const named = { ...entry('a'), issuer: 'Example', account: 'lily' }
    const anonymous = { ...entry('b'), issuer: '', account: 'lily' }
    assert.equal(entryTitle(named), 'Example (lily)')
    assert.equal(entryTitle(anonymous), 'lily')
    assert.equal(entryParameterSummary(named), 'SHA1 · 6 · 30s')
    assert.deepEqual(entryParameters(named), {
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    assert.ok(entryHaystack(named).includes('Example'))
    assert.ok(entryHaystack(named).includes('30'))
  })

  it('mints ids that sort by creation and do not collide', () => {
    const first = createEntryId(1, 'aaaa')
    const second = createEntryId(2, 'bbbb')
    assert.notEqual(first, second)
    assert.ok(first.startsWith('totp-'))
  })
})

describe('the credential-vault boundary', () => {
  const makeVault = () => {
    const store = new Map<string, string>()
    const vault: IAuthenticatorVault & {
      readonly store: Map<string, string>
      failDeletes?: boolean
    } = {
      store,
      getItem: async (key, login) => store.get(`${key} ${login}`) ?? null,
      setItem: async (key, login, value) => {
        store.set(`${key} ${login}`, value)
      },
      deleteItem: async (key, login) => {
        if (vault.failDeletes === true) {
          throw new Error('the keychain is locked')
        }
        return store.delete(`${key} ${login}`)
      },
    }
    return vault
  }

  it('addresses a secret by the entry id under one stable service name', async () => {
    const vault = makeVault()
    await storeAuthenticatorSecret('entry-1', 'JBSWY3DPEHPK3PXP', vault)
    assert.equal(
      vault.store.get(`${AuthenticatorVaultService} entry-1`),
      'JBSWY3DPEHPK3PXP'
    )
    assert.equal(
      await readAuthenticatorSecret('entry-1', vault),
      'JBSWY3DPEHPK3PXP'
    )
    assert.equal(await hasAuthenticatorSecret('entry-1', vault), true)
    assert.equal(await hasAuthenticatorSecret('entry-2', vault), false)
  })

  it('forgets a secret when its entry goes', async () => {
    const vault = makeVault()
    await storeAuthenticatorSecret('entry-1', 'JBSWY3DPEHPK3PXP', vault)
    assert.equal(await deleteAuthenticatorSecret('entry-1', vault), true)
    assert.equal(await readAuthenticatorSecret('entry-1', vault), null)
  })

  it('names the ids a bulk delete could not clear', async () => {
    // A bulk delete that claims success while the vault kept the keys is the
    // worst outcome available: the rows are gone and the secrets are not.
    const vault = makeVault()
    await storeAuthenticatorSecret('a', 'JBSWY3DPEHPK3PXP', vault)
    await storeAuthenticatorSecret('b', 'JBSWY3DPEHPK3PXP', vault)
    vault.failDeletes = true
    assert.deepEqual(await deleteAuthenticatorSecrets(['a', 'b'], vault), [
      'a',
      'b',
    ])
    vault.failDeletes = false
    assert.deepEqual(await deleteAuthenticatorSecrets(['a', 'b'], vault), [])
  })
})

describe('filtering the list', () => {
  const noChips = { groups: new Set<string>(), ungrouped: false }

  const filter = (
    query: string,
    regexEnabled = false,
    extra: Partial<{
      groups: ReadonlySet<string>
      ungrouped: boolean
      caseSensitive: boolean
    }> = {}
  ) =>
    filterMd3AuthenticatorFactors(md3AuthenticatorFixtureFactors, {
      query,
      regexEnabled,
      caseSensitive: extra.caseSensitive ?? false,
      groups: extra.groups ?? noChips.groups,
      ungrouped: extra.ungrouped ?? noChips.ungrouped,
    }).map(factor => factor.id)

  it('matches every field the row actually shows', () => {
    assert.deepEqual(filter('registry'), ['factor-registry'])
    assert.deepEqual(filter('lily@example.net'), ['factor-mail'])
    assert.deepEqual(filter('Money'), ['factor-missing-secret'])
    assert.deepEqual(filter('SHA256'), ['factor-registry'])
    assert.deepEqual(filter('60'), ['factor-mail'])
  })

  it('composes the chips with the query instead of one overriding the other', () => {
    assert.deepEqual(filter('', false, { groups: new Set(['Work']) }), [
      'factor-forge',
      'factor-registry',
    ])
    assert.deepEqual(filter('registry', false, { groups: new Set(['Work']) }), [
      'factor-registry',
    ])
    assert.deepEqual(filter('', false, { ungrouped: true }), ['factor-mail'])
    assert.deepEqual(
      filter('', false, { groups: new Set(['Money']), ungrouped: true }),
      ['factor-mail', 'factor-missing-secret']
    )
  })

  it('reads a regular expression only when regex mode is on', () => {
    assert.deepEqual(filter('^Example (Forge|Mail)$', true), [
      'factor-forge',
      'factor-mail',
    ])
    assert.deepEqual(filter('^Example (Forge|Mail)$', false), [])
  })

  it('filters nothing at all on an invalid pattern', () => {
    // The alternative — filtering everything out — reads as "there is nothing
    // here" rather than "that pattern is broken".
    assert.equal(
      filter('(unclosed', true).length,
      md3AuthenticatorFixtureFactors.length
    )
  })

  it('honours case sensitivity in plain-text mode', () => {
    assert.deepEqual(filter('EXAMPLE MAIL', false, { caseSensitive: false }), [
      'factor-mail',
    ])
    assert.deepEqual(filter('EXAMPLE MAIL', false, { caseSensitive: true }), [])
  })
})

describe('exports', () => {
  const records = md3AuthenticatorFixtureFactors.map(
    md3AuthenticatorExportRecord
  )
  // Deliberately does not contain the word "omitted": the count below is an
  // exact per-record count of the marker, and a notice carrying the same word
  // would inflate it by one in every format that writes a header.
  const notice = 'Secrets are deliberately left out of this file.'

  it('never writes a secret, and says so in every format that can say it', () => {
    for (const descriptor of Md3AuthenticatorExportFormats) {
      const payload = serializeMd3AuthenticatorExport(
        records,
        descriptor.format,
        { scope: 'all 4 factors', omissionNotice: notice }
      )
      assert.equal(payload.containsSecrets, false)
      assert.equal(payload.omissionNotice, notice)
      assert.equal(payload.count, records.length)
      assert.equal(payload.filename, `authenticator.${descriptor.extension}`)

      // Every record's secret column reads `omitted` rather than being absent.
      const occurrences = payload.content.split('omitted').length - 1
      assert.equal(
        occurrences,
        records.length,
        `${descriptor.format} lost the omitted markers`
      )

      // JSONL, CSV and TSV have nowhere to put a comment without breaking the
      // parsers that read them, so in those three the statement is the
      // `secret` column itself — present in the header, `omitted` in every
      // row. Every other format carries the sentence in words as well.
      const columnar =
        descriptor.format === 'jsonl' ||
        descriptor.format === 'csv' ||
        descriptor.format === 'tsv'
      if (columnar) {
        assert.ok(
          payload.content.includes('secret'),
          `${descriptor.format} dropped the secret column`
        )
      } else {
        assert.ok(
          payload.content.includes(notice),
          `${descriptor.format} did not carry the omission notice`
        )
      }
    }
  })

  it('carries every field of every factor', () => {
    // Compared against the FACTORS rather than against `records`. Comparing an
    // export to the output of the same flattening function it was built from
    // asserts nothing: both sides move together, so a field silently replaced
    // by a wrong value stays green.
    const payload = serializeMd3AuthenticatorExport(records, 'json', {
      scope: 'all 4 factors',
      omissionNotice: notice,
    })
    const parsed = JSON.parse(payload.content) as {
      factors: ReadonlyArray<Record<string, unknown>>
    }
    assert.equal(parsed.factors.length, md3AuthenticatorFixtureFactors.length)

    md3AuthenticatorFixtureFactors.forEach((factor, index) => {
      assert.deepEqual(parsed.factors[index], {
        id: factor.id,
        issuer: factor.issuer,
        account: factor.account,
        group: factor.group,
        algorithm: factor.algorithm,
        digits: factor.digits,
        period: factor.period,
        addedAt: factor.addedAt,
        secret: 'omitted',
      })
    })
  })

  it('quotes a delimiter that appears inside a value', () => {
    const payload = serializeMd3AuthenticatorExport(
      [{ ...records[0], issuer: 'A, B "C"' }],
      'csv',
      { scope: 'one factor', omissionNotice: notice }
    )
    assert.ok(payload.content.includes('"A, B ""C"""'))
  })

  it('escapes markup rather than emitting it', () => {
    const payload = serializeMd3AuthenticatorExport(
      [{ ...records[0], account: '<script>&' }],
      'xml',
      { scope: 'one factor', omissionNotice: notice }
    )
    assert.ok(payload.content.includes('&lt;script&gt;&amp;'))
    assert.equal(payload.content.includes('<script>'), false)
  })

  it('refuses an unknown format by name', () => {
    assert.throws(
      () =>
        serializeMd3AuthenticatorExport(records, 'ini' as never, {
          scope: 'x',
          omissionNotice: notice,
        }),
      /Unknown authenticator export format: ini/
    )
  })

  it('keeps the secrets export a separate, self-labelling function', () => {
    const warning = 'This file contains working second factors in the clear.'
    const payload = serializeMd3AuthenticatorSecrets(
      ['otpauth://totp/a?secret=JBSWY3DPEHPK3PXP'],
      { scope: '1 selected factor', warning }
    )
    assert.equal(payload.containsSecrets, true)
    assert.ok(payload.content.includes(warning))
    assert.ok(payload.content.includes('otpauth://totp/a?secret='))
    assert.equal(payload.filename, 'authenticator-secrets.txt')
  })
})

describe('the fixture surface', () => {
  it('leaves one factor with no secret, because that state has to render', () => {
    const withoutSecret = md3AuthenticatorFixtureFactors.filter(
      factor => !md3AuthenticatorFixtureSecrets.has(factor.id)
    )
    assert.deepEqual(
      withoutSecret.map(factor => factor.id),
      ['factor-missing-secret']
    )
  })

  it('titles a fixture factor the way the row does', () => {
    assert.equal(
      md3FactorTitle(md3AuthenticatorFixtureFactors[0]),
      'Example Forge (lily@example.com)'
    )
  })
})
