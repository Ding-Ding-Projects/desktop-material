import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { getDimSumDish, getDimSumDishes } from '../../src/lib/dim-sum-assets'
import { readPngSize } from '../../src/lib/png-header'

const assetRoot = join(process.cwd(), 'app', 'static', 'dim-sum')

/**
 * The pictures ship with the app and are never fetched, generated or
 * re-encoded, so the only way to know they are still the catalog's is to check
 * the committed bytes against the committed manifest on every run. A picture
 * that stopped decoding would otherwise reach a user as a broken image inside
 * what is meant to be a small delight.
 */
describe('bundled dim sum pictures', () => {
  const dishes = getDimSumDishes()

  it('reads every dish out of the committed manifest', () => {
    assert.ok(dishes.length > 0, 'the manifest yielded no usable dish')
    assert.ok(existsSync(join(assetRoot, 'manifest.json')))
    for (const dish of dishes) {
      assert.equal(getDimSumDish(dish.id), dish)
    }
    assert.equal(getDimSumDish('not-a-dish'), null)
  })

  it('ships each picture locally, decodable, and byte-identical', () => {
    for (const dish of dishes) {
      const path = join(assetRoot, dish.file)
      assert.ok(existsSync(path), `missing bundled picture: ${dish.file}`)

      const bytes = readFileSync(path)
      assert.equal(bytes.length, dish.bytes, `${dish.file} size drifted`)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        dish.sha256,
        `${dish.file} is not the picture the manifest recorded`
      )

      // A structural decode: a real PNG header with real dimensions, and an
      // IEND at the end, which is what a truncated copy would be missing.
      const size = readPngSize(bytes)
      assert.equal(size.width, dish.width, `${dish.file} width`)
      assert.equal(size.height, dish.height, `${dish.file} height`)
      assert.ok(size.width >= 512 && size.height >= 512, `${dish.file} is tiny`)
    }
  })

  it('keeps the bundled directory to the manifest and its pictures', () => {
    const expected = new Set(['manifest.json', ...dishes.map(d => d.file)])
    for (const entry of readdirSync(assetRoot)) {
      assert.ok(expected.has(entry), `unexpected bundled file: ${entry}`)
    }
    assert.equal(readdirSync(assetRoot).length, expected.size)
  })

  it('records the catalog as the source and claims no other provenance', () => {
    const manifest = JSON.parse(
      readFileSync(join(assetRoot, 'manifest.json'), 'utf8')
    )
    assert.equal(manifest.version, 1)
    assert.match(manifest.source, /dim sum catalog/i)
    assert.equal(manifest.dishes.length, dishes.length)
  })
})
