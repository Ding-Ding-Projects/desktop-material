import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MaxVocabularyBytes,
  MaxVocabularyEntries,
  MaxVocabularyKeyLength,
  MaxVocabularyValueLength,
  PersonalVocabularySchemaVersion,
  applyPersonalVocabulary,
  describeVocabularyRejection,
  parsePersonalVocabulary,
} from '../../src/lib/personal-vocabulary'

/**
 * The vocabulary file is chosen by the user, and "chosen by the user" is not
 * the same as "safe to apply". Every one of these is a file somebody could
 * plausibly end up with — hand-edited, written by an older release, produced
 * by a script that got a type wrong — and the contract is the same for all of
 * them: refuse the whole thing, change nothing, and say why without ever
 * quoting the private part back.
 */

const encode = (value: string) => new TextEncoder().encode(value)

const valid = (terms: Record<string, string>) =>
  encode(JSON.stringify({ version: PersonalVocabularySchemaVersion, terms }))

describe('a valid vocabulary file', () => {
  it('is accepted and keeps every term', () => {
    const result = parsePersonalVocabulary(valid({ push: 'dew', bug: 'poke' }))
    assert.ok(result.ok)
    assert.strictEqual(result.vocabulary.terms.size, 2)
    assert.strictEqual(result.vocabulary.terms.get('push'), 'dew')
  })

  it('accepts an empty terms object', () => {
    // A file that maps nothing is a legitimate thing to load — it is how a
    // user empties their vocabulary without deleting the file.
    const result = parsePersonalVocabulary(valid({}))
    assert.ok(result.ok)
    assert.strictEqual(result.vocabulary.terms.size, 0)
  })
})

describe('a vocabulary file is refused whole or not at all', () => {
  const cases: ReadonlyArray<{
    readonly name: string
    readonly bytes: Uint8Array
    readonly kind: string
  }> = [
    { name: 'an empty file', bytes: encode(''), kind: 'empty' },
    { name: 'not JSON at all', bytes: encode('{not json'), kind: 'not-json' },
    {
      name: 'a JSON array rather than an object',
      bytes: encode('[]'),
      kind: 'not-an-object',
    },
    {
      name: 'a JSON string rather than an object',
      bytes: encode('"hello"'),
      kind: 'not-an-object',
    },
    {
      name: 'a version this build does not understand',
      bytes: encode(JSON.stringify({ version: 99, terms: {} })),
      kind: 'unsupported-version',
    },
    {
      name: 'no version at all',
      bytes: encode(JSON.stringify({ terms: {} })),
      kind: 'unsupported-version',
    },
    {
      name: 'no terms object',
      bytes: encode(
        JSON.stringify({ version: PersonalVocabularySchemaVersion })
      ),
      kind: 'missing-terms',
    },
    {
      name: 'a field this build does not recognise',
      bytes: encode(
        JSON.stringify({
          version: PersonalVocabularySchemaVersion,
          terms: {},
          upload: 'https://example.invalid',
        })
      ),
      kind: 'unexpected-field',
    },
    {
      name: 'a replacement that is not text',
      bytes: encode(
        JSON.stringify({
          version: PersonalVocabularySchemaVersion,
          terms: { push: 42 },
        })
      ),
      kind: 'value-not-a-string',
    },
    {
      name: 'an empty term',
      bytes: valid({ '': 'something' }),
      kind: 'key-too-long',
    },
    {
      name: 'a term over the length bound',
      bytes: valid({ ['x'.repeat(MaxVocabularyKeyLength + 1)]: 'y' }),
      kind: 'key-too-long',
    },
    {
      name: 'a replacement over the length bound',
      bytes: valid({ x: 'y'.repeat(MaxVocabularyValueLength + 1) }),
      kind: 'value-too-long',
    },
  ]

  for (const testCase of cases) {
    it(`refuses ${testCase.name}`, () => {
      const result = parsePersonalVocabulary(testCase.bytes)
      assert.ok(!result.ok, `${testCase.name} was accepted`)
      assert.strictEqual(result.rejection.kind, testCase.kind)
    })
  }

  it('refuses a file over the byte bound without parsing it', () => {
    // Deliberately valid JSON, so the only thing that can refuse it is the
    // size check. A validator that parsed first would accept this.
    const padding = 'a'.repeat(MaxVocabularyBytes)
    const result = parsePersonalVocabulary(valid({ term: padding }))
    assert.ok(!result.ok)
    assert.strictEqual(result.rejection.kind, 'too-large')
  })

  it('refuses more entries than the bound allows', () => {
    const terms: Record<string, string> = {}
    for (let i = 0; i <= MaxVocabularyEntries; i++) {
      terms[`t${i}`] = 'x'
    }
    const result = parsePersonalVocabulary(valid(terms))
    assert.ok(!result.ok)
    assert.strictEqual(result.rejection.kind, 'too-many-entries')
  })

  it('refuses a reserved object key rather than assigning through it', () => {
    // `JSON.parse` does not follow `__proto__`, but `Object.keys` still
    // reports it, and a validator that copied blindly into a plain object
    // would be one assignment away from a prototype write.
    const result = parsePersonalVocabulary(
      encode(
        `{"version":${PersonalVocabularySchemaVersion},"terms":{"__proto__":"x"}}`
      )
    )
    assert.ok(!result.ok)
    assert.strictEqual(result.rejection.kind, 'unsafe-key')
  })

  it('refuses bytes that are not valid UTF-8', () => {
    // A lone continuation byte. `TextDecoder` without `fatal` would silently
    // substitute U+FFFD and the file would parse as something the user never
    // wrote.
    const result = parsePersonalVocabulary(new Uint8Array([0xff, 0xfe, 0x80]))
    assert.ok(!result.ok)
    assert.strictEqual(result.rejection.kind, 'not-json')
  })
})

describe('the refusal message', () => {
  it('never quotes a term or a replacement back', () => {
    // This string is rendered on screen and could land in a capture. The whole
    // point of the feature is that the vocabulary stays private, so a message
    // that helpfully echoes the offending term defeats it.
    const secret = 'averysecretprivateword'
    const result = parsePersonalVocabulary(
      valid({ [secret]: 'x'.repeat(MaxVocabularyValueLength + 1) })
    )
    assert.ok(!result.ok)
    const message = describeVocabularyRejection(result.rejection)
    assert.ok(
      !message.includes(secret),
      `the message leaked the term: ${message}`
    )
  })

  it('says plainly that nothing changed', () => {
    const result = parsePersonalVocabulary(encode('{'))
    assert.ok(!result.ok)
    assert.match(
      describeVocabularyRejection(result.rejection),
      /Nothing has been changed/
    )
  })
})

describe('applying a vocabulary', () => {
  const load = (terms: Record<string, string>) => {
    const result = parsePersonalVocabulary(valid(terms))
    assert.ok(result.ok)
    return result.vocabulary
  }

  it('leaves text alone when nothing is loaded', () => {
    assert.strictEqual(applyPersonalVocabulary('push it', null), 'push it')
  })

  it('replaces a term', () => {
    assert.strictEqual(
      applyPersonalVocabulary('push it', load({ push: 'dew' })),
      'dew it'
    )
  })

  it('does not let one replacement be rewritten by another term', () => {
    // Replacing term by term would turn this into 'c': 'a' becomes 'b', and
    // the second pass then rewrites that 'b'. A mapping is not a chain, and a
    // user who wrote these two rules did not ask for one.
    assert.strictEqual(
      applyPersonalVocabulary('a', load({ a: 'b', b: 'c' })),
      'b'
    )
  })

  it('prefers the longest matching term', () => {
    assert.strictEqual(
      applyPersonalVocabulary(
        'force push',
        load({ push: 'dew', 'force push': 'force-dew' })
      ),
      'force-dew'
    )
  })

  it('treats a term containing regex syntax as literal text', () => {
    // Terms go into a RegExp. An unescaped '.' would match any character and
    // a stray '(' would throw, taking the whole render down with it.
    assert.strictEqual(
      applyPersonalVocabulary('a.c and abc', load({ 'a.c': 'X' })),
      'X and abc'
    )
    assert.doesNotThrow(() =>
      applyPersonalVocabulary('anything', load({ '(unclosed': 'X' }))
    )
  })
})
