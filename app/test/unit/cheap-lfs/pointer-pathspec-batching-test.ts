import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

import { batchCheapLfsPathspec } from '../../../src/lib/cheap-lfs/operations'

const operations = Path.resolve(
  __dirname,
  '../../../src/lib/cheap-lfs/operations.ts'
)

/** The byte cost one entry adds to the command line, `:(literal)` included. */
function cost(path: string): number {
  return Buffer.byteLength(`:(literal)${path}`, 'utf8') + 1
}

describe('Cheap LFS pointer pathspec batching', () => {
  it('keeps every batch inside the budget', () => {
    // 4,000 paths of ~40 bytes is ~200 KB of pathspec — six times what Windows
    // will spawn, and the shape of selection that produced ENAMETOOLONG.
    const paths = Array.from(
      { length: 4000 },
      (_, index) => `assets/textures/generated/tile-${index}-diffuse.png`
    )

    const batches = batchCheapLfsPathspec(paths)
    assert.ok(batches.length > 1, 'this many paths must not be one invocation')

    for (const batch of batches) {
      const used = batch.reduce((total, path) => total + cost(path), 0)
      assert.ok(
        used <= 24_000,
        `a batch carried ${used} bytes of pathspec, over the budget`
      )
    }
  })

  it('loses nothing and reorders nothing', () => {
    const paths = Array.from(
      { length: 500 },
      (_, i) => `a/${'x'.repeat(90)}/${i}`
    )
    const batches = batchCheapLfsPathspec(paths)
    assert.deepEqual(batches.flat(), paths)
  })

  it('measures the real byte length, not the character count', () => {
    // A path of multi-byte characters costs more than its length suggests, and
    // budgeting by `.length` would overshoot the limit on exactly the
    // repositories most likely to have long names.
    const wide = Array.from(
      { length: 200 },
      (_, i) => `資產/材質/超長名稱-${i}`
    )
    for (const batch of batchCheapLfsPathspec(wide, 1_000)) {
      const used = batch.reduce((total, path) => total + cost(path), 0)
      assert.ok(used <= 1_000 || batch.length === 1)
    }
  })

  it('gives an oversized single path its own batch rather than dropping it', () => {
    const huge = 'x'.repeat(50_000)
    const batches = batchCheapLfsPathspec(
      ['short.png', huge, 'other.png'],
      1_000
    )
    // Dropping it would understate the inventory silently; keeping it lets the
    // OS refuse it loudly, which is the honest outcome.
    assert.ok(batches.flat().includes(huge))
    assert.deepEqual(batches.flat(), ['short.png', huge, 'other.png'])
  })

  it('returns nothing for nothing', () => {
    assert.deepEqual(batchCheapLfsPathspec([]), [])
  })

  it('no longer inlines the whole pathspec into one command line', async () => {
    const source = await readFile(operations, 'utf8')

    // The original defect: every `:(literal)` entry pushed onto one argv, so a
    // large enough selection failed to spawn at all and the whole pointer
    // inventory surfaced as ENAMETOOLONG.
    assert.doesNotMatch(
      source,
      /args\.push\(\s*\.\.\.pathspec\.map/,
      'the pathspec must be split across invocations, not pushed onto one'
    )
    assert.match(source, /batchCheapLfsPathspec\(pathspec\)/)
  })

  it('does not shorten a path to make it fit', async () => {
    const source = await readFile(operations, 'utf8')
    // `git grep -- :(literal)<path>` matches the path it is given. A hashed or
    // truncated pathspec matches nothing, and an inventory that reports zero
    // pointers reads exactly like a clean repository — worse than the error.
    const helper = source.slice(
      source.indexOf('export function batchCheapLfsPathspec'),
      source.indexOf('async function gitPointerPaths')
    )
    assert.doesNotMatch(helper, /\.slice\(0,|createHash|substring\(/)
  })
})
