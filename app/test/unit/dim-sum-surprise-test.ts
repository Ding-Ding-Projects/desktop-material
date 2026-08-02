import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  DimSumSurpriseDurationMs,
  DimSumSurpriseProbability,
  IDimSumDish,
  RetiredDimSumOptOutKeys,
  dimSumAltText,
  dimSumDisplayName,
  dimSumNameParts,
  dimSumSuppressionReason,
  migrateDimSumOptOut,
  pickDimSumDish,
  shouldShowDimSum,
} from '../../src/models/dim-sum'
import { getDimSumDishes } from '../../src/lib/dim-sum-assets'
import { drawUnitRandom } from '../../src/lib/dim-sum-random'

/** A launch with nothing wrong with it, which every case narrows from. */
const readyLaunch = {
  firstRun: false,
  errorState: false,
  updating: false,
  modalOpen: false,
  quietHours: false,
  alreadyDrawn: false,
  dishCount: 12,
}

function dish(overrides: Partial<IDimSumDish> = {}): IDimSumDish {
  return {
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
    sha256: 'a'.repeat(64),
    ...overrides,
  }
}

describe('dim sum surprise draw', () => {
  it('states the 10% chance and a duration a reader can actually use', () => {
    assert.equal(DimSumSurpriseProbability, 0.1)
    assert.ok(DimSumSurpriseDurationMs >= 5_000)
    assert.ok(DimSumSurpriseDurationMs <= 20_000)
  })

  it('shows only below the threshold and never at or above it', () => {
    for (const value of [0, 1e-9, 0.0001, 0.05, 0.099, 0.0999999]) {
      assert.equal(shouldShowDimSum(value), true, `${value} is inside the 10%`)
    }
    for (const value of [0.1, 0.100000001, 0.2, 0.5, 0.9, 0.999999]) {
      assert.equal(shouldShowDimSum(value), false, `${value} is outside`)
    }
  })

  it('treats a broken random source as a miss, never a lucky accident', () => {
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      -0.001,
      -1,
      1,
      1.5,
      undefined,
      null,
      '0.001',
      {},
      [],
      true,
    ]) {
      assert.equal(
        shouldShowDimSum(value),
        false,
        `${String(value)} must not show`
      )
    }
  })

  it('holds the stated rate across the whole unit interval', () => {
    let hits = 0
    const draws = 10_000
    for (let step = 0; step < draws; step++) {
      if (shouldShowDimSum(step / draws)) {
        hits++
      }
    }
    assert.equal(hits, draws * DimSumSurpriseProbability)
  })

  it('draws from a uniform source inside the interval it promises', () => {
    let hits = 0
    const draws = 200_000
    for (let step = 0; step < draws; step++) {
      const value = drawUnitRandom()
      assert.ok(value >= 0 && value < 1, `${value} left the unit interval`)
      if (shouldShowDimSum(value)) {
        hits++
      }
    }
    // Binomial with p=0.1 over 200k draws has a standard deviation near 134,
    // so a band of ±1% of the sample is many standard deviations wide: it
    // catches a source that is biased or stuck without ever flaking.
    const expected = draws * DimSumSurpriseProbability
    assert.ok(
      Math.abs(hits - expected) < draws * 0.01,
      `${hits} hits in ${draws} draws is not the stated 1 in 10`
    )
  })
})

describe('dim sum dish selection', () => {
  const dishes = [
    dish({ id: 'a', file: 'a.png' }),
    dish({ id: 'b', file: 'b.png' }),
    dish({ id: 'c', file: 'c.png' }),
    dish({ id: 'd', file: 'd.png' }),
  ]

  it('reaches every dish and both ends of the interval', () => {
    const seen = new Set<string>()
    for (let step = 0; step <= 1000; step++) {
      const picked = pickDimSumDish(dishes, step / 1000)
      assert.notEqual(picked, null)
      seen.add((picked as IDimSumDish).id)
    }
    assert.equal(seen.size, dishes.length)
    assert.equal(pickDimSumDish(dishes, 0)?.id, 'a')
    assert.equal(pickDimSumDish(dishes, 1)?.id, 'd')
  })

  it('falls back to a dish rather than throwing on a malformed draw', () => {
    for (const value of [NaN, Infinity, undefined, null, 'x', {}]) {
      assert.equal(pickDimSumDish(dishes, value)?.id, 'a')
    }
    // Out of range in either direction clamps rather than indexing off the end.
    assert.equal(pickDimSumDish(dishes, -5)?.id, 'a')
    assert.equal(pickDimSumDish(dishes, 5)?.id, 'd')
  })

  it('has nothing to pick from an empty table', () => {
    assert.equal(pickDimSumDish([], 0.5), null)
  })
})

describe('dim sum suppression', () => {
  it('lets an ordinary launch through', () => {
    assert.equal(dimSumSuppressionReason(readyLaunch), null)
  })

  it('stays away from first run, errors, updates, modals and quiet hours', () => {
    const cases: ReadonlyArray<[Partial<typeof readyLaunch>, string]> = [
      [{ firstRun: true }, 'first-run'],
      [{ errorState: true }, 'error'],
      [{ updating: true }, 'update'],
      [{ modalOpen: true }, 'modal'],
      [{ quietHours: true }, 'quiet-hours'],
      [{ alreadyDrawn: true }, 'already-drawn'],
      [{ dishCount: 0 }, 'no-dishes'],
    ]
    for (const [overrides, expected] of cases) {
      assert.equal(
        dimSumSuppressionReason({ ...readyLaunch, ...overrides }),
        expected,
        JSON.stringify(overrides)
      )
    }
  })

  it('reports the most serious reason when several apply at once', () => {
    assert.equal(
      dimSumSuppressionReason({
        ...readyLaunch,
        errorState: true,
        firstRun: true,
        quietHours: true,
        dishCount: 0,
      }),
      'error'
    )
    assert.equal(
      dimSumSuppressionReason({
        ...readyLaunch,
        firstRun: true,
        updating: true,
      }),
      'first-run'
    )
  })

  it('has no reason called "disabled": there is nothing to disable', () => {
    // Every field is exercised above; none of them is an off switch, and a
    // launch with all of them clear always goes ahead.
    assert.equal(dimSumSuppressionReason(readyLaunch), null)
    assert.equal(
      dimSumSuppressionReason({ ...readyLaunch, dishCount: 1 }),
      null,
      'a single bundled dish is still a surprise'
    )
  })
})

describe('dim sum opt-out migration', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial))
    return {
      values,
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
  }

  it('deletes every retired off switch a profile carries', () => {
    const storage = fakeStorage(
      Object.fromEntries(RetiredDimSumOptOutKeys.map(key => [key, 'off']))
    )
    const removed = migrateDimSumOptOut(storage)
    assert.deepEqual([...removed].sort(), [...RetiredDimSumOptOutKeys].sort())
    for (const key of RetiredDimSumOptOutKeys) {
      assert.equal(storage.getItem(key), null, `${key} must be gone`)
    }
  })

  it('leaves unrelated preferences alone and is a no-op when repeated', () => {
    const storage = fakeStorage({
      'language-mode-v1': 'cantonese',
      'dim-sum-surprise-enabled': 'false',
    })
    assert.deepEqual(migrateDimSumOptOut(storage), ['dim-sum-surprise-enabled'])
    assert.deepEqual(migrateDimSumOptOut(storage), [])
    assert.equal(storage.getItem('language-mode-v1'), 'cantonese')
  })

  it('never throws when storage is unreadable', () => {
    const broken = {
      getItem: () => {
        throw new Error('storage is gone')
      },
      removeItem: () => {
        throw new Error('storage is gone')
      },
    }
    assert.deepEqual(migrateDimSumOptOut(broken), [])
  })
})

describe('dim sum naming', () => {
  const har = dish()

  it('names the dish in both languages and only reorders them', () => {
    assert.equal(dimSumDisplayName(har, 'english'), 'Classic Har Gow · 蝦餃')
    assert.equal(dimSumDisplayName(har, 'cantonese'), '蝦餃 · Classic Har Gow')
    for (const primary of ['english', 'cantonese'] as const) {
      const name = dimSumDisplayName(har, primary)
      assert.ok(name.includes(har.name.en))
      assert.ok(name.includes(har.name.zhHant))
    }
  })

  it('marks the language of every run and rebuilds the name exactly', () => {
    for (const primary of ['english', 'cantonese'] as const) {
      const parts = dimSumNameParts(har, primary)
      assert.equal(
        parts.map(part => part.text).join(''),
        dimSumDisplayName(har, primary)
      )
      const tagged = parts.filter(part => part.lang !== null)
      assert.equal(tagged.length, 2)
      const han = tagged.filter(part => /[㐀-鿿]/.test(part.text))
      assert.equal(han.length, 1)
      assert.equal(han[0].lang, 'zh-HK')
      const latin = tagged.filter(part => !/[㐀-鿿]/.test(part.text))
      assert.equal(latin[0].lang, 'en')
    }
  })

  it('describes the picture and names the dish in both languages', () => {
    for (const primary of ['english', 'cantonese'] as const) {
      const alt = dimSumAltText(har, primary)
      assert.ok(alt.includes(har.name.en), alt)
      assert.ok(alt.includes(har.name.zhHant), alt)
      // Alt text describes the photograph, so it says more than the name.
      assert.ok(alt.length > dimSumDisplayName(har, primary).length)
    }
  })
})

describe('the bundled dish table', () => {
  const dishes = getDimSumDishes()

  it('bundles a usable spread of the tea house', () => {
    assert.ok(dishes.length >= 6, `only ${dishes.length} dishes survived`)
  })

  it('gives every dish a real name in both languages', () => {
    for (const bundled of dishes) {
      assert.match(bundled.name.en, /[A-Za-z]/, `${bundled.id} en`)
      assert.match(bundled.name.zhHant, /[㐀-鿿]/, `${bundled.id} zh`)
      assert.notEqual(bundled.name.en, bundled.name.zhHant)
      assert.ok(bundled.alt.en.trim().length > 0, `${bundled.id} alt en`)
      assert.ok(bundled.alt.yue.trim().length > 0, `${bundled.id} alt yue`)
    }
  })

  it('has no duplicate id or picture, so no dish is twice as likely', () => {
    assert.equal(new Set(dishes.map(d => d.id)).size, dishes.length)
    assert.equal(new Set(dishes.map(d => d.file)).size, dishes.length)
  })
})
