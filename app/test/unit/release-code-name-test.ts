import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import {
  clearReleaseCodeNameCache,
  fetchReleaseCodeName,
  parseReleaseCodeName,
  releaseTagForVersion,
} from '../../src/lib/release-code-name'

const notes = [
  '## Lines of code',
  '',
  'Counted by CI.',
  '',
  '## Release code name',
  '',
  'Dried Shrimp Rice Noodle Rolls · 蝦米腸粉',
  '',
  '[Public dish photo](https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0155-dried-shrimp-rice-noodle-rolls.png)',
  '',
  '## Workflow timing',
  '',
  'Not a dish',
].join('\n')

describe('release code name', () => {
  beforeEach(() => clearReleaseCodeNameCache())

  it('maps only real release versions to a tag', () => {
    assert.equal(releaseTagForVersion('4.0.143901'), 'v4.0.143901')
    assert.equal(releaseTagForVersion('4.0.1-beta1'), null)
    assert.equal(releaseTagForVersion('03ec570a1b'), null)
  })

  it('reads the name and the photo link from the notes', () => {
    assert.deepEqual(parseReleaseCodeName(notes), {
      name: 'Dried Shrimp Rice Noodle Rolls · 蝦米腸粉',
      photoUrl:
        'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0155-dried-shrimp-rice-noodle-rolls.png',
    })
  })

  it('gives nothing without the section and drops links it does not trust', () => {
    assert.equal(parseReleaseCodeName('## Workflow timing\n\nx'), null)
    assert.equal(parseReleaseCodeName('## Release code name\n\n## Next'), null)
    assert.equal(
      parseReleaseCodeName('## Release code name\n\n<img src=x>\n'),
      null
    )
    assert.deepEqual(
      parseReleaseCodeName(
        '## Release code name\n\nHar Gow · 蝦餃\n\n[Public dish photo](https://example.com/x.png)\n'
      ),
      { name: 'Har Gow · 蝦餃', photoUrl: null }
    )
  })

  it('asks for the right release once and never throws', async () => {
    const asked = new Array<string>()
    const ok = async (url: string) => {
      asked.push(url)
      return { ok: true, json: async () => ({ body: notes }) }
    }
    const first = await fetchReleaseCodeName('4.0.143901', ok)
    assert.equal(first?.name, 'Dried Shrimp Rice Noodle Rolls · 蝦米腸粉')
    await fetchReleaseCodeName('4.0.143901', ok)
    assert.deepEqual(asked, [
      'https://api.github.com/repos/Ding-Ding-Projects/desktop-material/releases/tags/v4.0.143901',
    ])

    assert.equal(await fetchReleaseCodeName('dev-build', ok), null)
    assert.equal(asked.length, 1)
    assert.equal(
      await fetchReleaseCodeName('4.0.2', async () => {
        throw new Error('offline')
      }),
      null
    )
    assert.equal(
      await fetchReleaseCodeName('4.0.3', async () => ({
        ok: false,
        json: async () => ({}),
      })),
      null
    )
  })
})
