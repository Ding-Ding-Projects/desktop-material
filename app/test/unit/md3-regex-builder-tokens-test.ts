import assert from 'node:assert'
import { describe, it } from 'node:test'

import { Md3RegexTokenGroups } from '../../src/ui/md3/md3-regex-builder-dialog'
import {
  englishTranslations,
  cantoneseTranslations,
} from '../../src/lib/i18n-resources'

/**
 * A builder that offers a token it cannot actually produce is worse than one
 * that offers fewer: the user inserts it, the pattern stops compiling, and the
 * field blames them. So every advertised token is compiled here, and every one
 * carries a real label in both shipped languages.
 */

/** Placeholder glyph the builder uses for "your content goes here". */
const PLACEHOLDER = '…'

/** Tokens that only compile with the unicode flag, by design. */
const BACKSLASH = String.fromCharCode(92)

/** Tokens that only compile with the unicode flag, by design. */
function needsUnicodeFlag(token: string): boolean {
  return (
    token.includes(BACKSLASH + 'p{') ||
    token.includes(BACKSLASH + 'P{') ||
    token.includes(BACKSLASH + 'u{')
  )
}

/**
 * Put a token into the smallest context where it is legitimately usable.
 *
 * A quantifier is a fragment that follows an atom, and a backreference needs a
 * group to refer to, so compiling either on its own proves nothing except that
 * the test was naive. Each is given exactly what it needs and nothing more.
 */
function compilable(token: string): string {
  const body = token.split(PLACEHOLDER).join('x')

  // A backreference needs a group ahead of it to point at.
  if (body === BACKSLASH + '1') {
    return '(x)' + body
  }
  if (body.startsWith(BACKSLASH + 'k<')) {
    return '(?<name>x)' + body
  }

  // A quantifier follows an atom.
  if (/^[+*?{]/.test(body)) {
    return 'x' + body
  }

  return body
}

describe('every regex builder token is real', () => {
  const allTokens = Md3RegexTokenGroups.flatMap(group =>
    group.tokens.map(token => ({ group: group.id, ...token }))
  )

  it('offers a substantial token set across several groups', () => {
    assert.ok(
      Md3RegexTokenGroups.length >= 7,
      `expected at least 7 groups, found ${Md3RegexTokenGroups.length}`
    )
    assert.ok(
      allTokens.length >= 40,
      `expected at least 40 tokens, found ${allTokens.length}`
    )
  })

  it('uses a unique group id for every group', () => {
    const ids = Md3RegexTokenGroups.map(group => group.id)
    assert.equal(new Set(ids).size, ids.length, `duplicate group id in ${ids}`)
  })

  for (const entry of allTokens) {
    it(`compiles ${entry.group}: ${entry.token}`, () => {
      const source = compilable(entry.token)
      const flags = needsUnicodeFlag(entry.token) ? 'u' : ''
      assert.doesNotThrow(
        () => new RegExp(source, flags),
        `${entry.token} does not compile as a regex fragment`
      )
    })
  }

  const languages = [
    { name: 'English', resources: englishTranslations },
    { name: 'Cantonese', resources: cantoneseTranslations },
  ]

  for (const { name: language, resources } of languages) {
    it(`labels every token in ${language}`, () => {
      const missing = allTokens
        .filter(entry => {
          const value = (resources as Record<string, string>)[entry.labelKey]
          return value === undefined || value.trim().length === 0
        })
        .map(entry => entry.labelKey)
      assert.deepStrictEqual(missing, [], `unlabelled in ${language}`)
    })

    it(`labels every group in ${language}`, () => {
      const missing = Md3RegexTokenGroups.filter(group => {
        const value = (resources as Record<string, string>)[group.titleKey]
        return value === undefined || value.trim().length === 0
      }).map(group => group.titleKey)
      assert.deepStrictEqual(missing, [], `unlabelled group in ${language}`)
    })
  }
})
