import assert from 'node:assert'
import { describe, it } from 'node:test'

import { composeDimSumCard } from '../../src/lib/dim-sum-copy'
import { IDimSumDish } from '../../src/models/dim-sum'
import { IFunnyLevels } from '../../src/lib/funny-level-text'
import { LanguageMode } from '../../src/models/language-mode'

const harGow: IDimSumDish = {
  id: 'hk-dish-0001',
  slug: 'classic-har-gow',
  name: { en: 'Classic Har Gow', zhHant: '蝦餃' },
  jyutping: 'haa1 gaau2',
  category: 'steamed-dim-sum',
  alt: {
    en: 'Warm tea-house photograph of Classic Har Gow',
    yue: '港式茶樓木枱上嘅蝦餃',
  },
  file: 'hk-dish-0001-classic-har-gow.png',
  bytes: 1,
  width: 1,
  height: 1,
  sha256: 'b'.repeat(64),
}

const modes: ReadonlyArray<LanguageMode> = ['english', 'cantonese', 'bilingual']

function levels(english: number, cantonese: number): IFunnyLevels {
  return { english, cantonese }
}

describe('dim sum card copy', () => {
  it('states the odds and the self-clearing in every band, both languages', () => {
    for (const mode of modes) {
      for (let level = 1; level <= 5; level++) {
        const card = composeDimSumCard(harGow, mode, levels(level, level))
        for (const block of card.blocks) {
          assert.ok(block.title.trim().length > 0, `${mode}/${level} title`)
          // The fact every band must carry: one launch in ten.
          assert.match(block.lead, /10/, `${mode}/${level}: ${block.lead}`)
          // And never a promise of an off switch, because there is not one.
          assert.doesNotMatch(block.lead, /settings|preference/i)
          assert.doesNotMatch(block.lead, /設定/)
        }
      }
    }
  })

  it('moves the voice with the level while the facts hold still', () => {
    const plain = composeDimSumCard(harGow, 'english', levels(1, 1))
    const playful = composeDimSumCard(harGow, 'english', levels(5, 5))
    assert.notEqual(plain.blocks[0].lead, playful.blocks[0].lead)
    assert.notEqual(plain.blocks[0].title, playful.blocks[0].title)
    // The dish itself is not part of the voice.
    assert.equal(plain.name, playful.name)
    assert.equal(plain.alt, playful.alt)
    assert.equal(plain.romanization, playful.romanization)

    const seriousYue = composeDimSumCard(harGow, 'cantonese', levels(3, 1))
    const playfulYue = composeDimSumCard(harGow, 'cantonese', levels(3, 5))
    assert.notEqual(seriousYue.blocks[0].lead, playfulYue.blocks[0].lead)
  })

  it('reads each language at its own level in bilingual mode', () => {
    const mixed = composeDimSumCard(harGow, 'bilingual', levels(1, 5))
    assert.equal(mixed.blocks.length, 2)
    assert.equal(mixed.blocks[0].htmlLang, 'en')
    assert.equal(mixed.blocks[1].htmlLang, 'zh-HK')

    const plainEnglish = composeDimSumCard(harGow, 'english', levels(1, 1))
    const playfulCantonese = composeDimSumCard(
      harGow,
      'cantonese',
      levels(5, 5)
    )
    assert.equal(mixed.blocks[0].lead, plainEnglish.blocks[0].lead)
    assert.equal(mixed.blocks[1].lead, playfulCantonese.blocks[0].lead)
  })

  it('names the dish once, in both languages, in every mode', () => {
    for (const mode of modes) {
      const card = composeDimSumCard(harGow, mode, levels(3, 3))
      assert.ok(card.name.includes(harGow.name.en), mode)
      assert.ok(card.name.includes(harGow.name.zhHant), mode)
      assert.equal(card.nameParts.map(p => p.text).join(''), card.name)
      // One name, however many framing blocks the mode renders.
      assert.equal(card.blocks.length, mode === 'bilingual' ? 2 : 1)
    }

    // Cantonese leads with the Chinese name; the other two lead with English.
    assert.ok(
      composeDimSumCard(harGow, 'cantonese', levels(3, 3)).name.startsWith(
        harGow.name.zhHant
      )
    )
    for (const mode of ['english', 'bilingual'] as const) {
      assert.ok(
        composeDimSumCard(harGow, mode, levels(3, 3)).name.startsWith(
          harGow.name.en
        )
      )
    }
  })

  it('tags the card and its runs so a synthesiser switches voice', () => {
    assert.equal(
      composeDimSumCard(harGow, 'english', levels(3, 3)).htmlLang,
      'en'
    )
    assert.equal(
      composeDimSumCard(harGow, 'bilingual', levels(3, 3)).htmlLang,
      'en'
    )
    assert.equal(
      composeDimSumCard(harGow, 'cantonese', levels(3, 3)).htmlLang,
      'zh-HK'
    )

    for (const mode of modes) {
      const parts = composeDimSumCard(harGow, mode, levels(3, 3)).nameParts
      const han = parts.filter(part => /[㐀-鿿]/.test(part.text))
      assert.equal(han.length, 1)
      assert.equal(han[0].lang, 'zh-HK')
    }
  })

  it('names the dish in the alt text and labels its own controls', () => {
    for (const mode of modes) {
      const card = composeDimSumCard(harGow, mode, levels(3, 3))
      assert.ok(card.alt.includes(harGow.name.en), mode)
      assert.ok(card.alt.includes(harGow.name.zhHant), mode)
      assert.ok(card.region.trim().length > 0, mode)
      assert.ok(card.dismiss.trim().length > 0, mode)
    }
  })

  it('omits the romanization line rather than printing an empty one', () => {
    const withJyutping = composeDimSumCard(harGow, 'english', levels(3, 3))
    assert.ok((withJyutping.romanization ?? '').includes('haa1 gaau2'))

    const without = composeDimSumCard(
      { ...harGow, jyutping: '' },
      'english',
      levels(3, 3)
    )
    assert.equal(without.romanization, null)
  })
})
