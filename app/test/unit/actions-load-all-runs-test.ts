import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const view = Path.resolve(__dirname, '../../src/ui/actions/actions-view.tsx')

describe('Actions load-all-runs contract', () => {
  it('offers loading every remaining page, not only the next one', async () => {
    const source = await readFile(view, 'utf8')
    // Filtering by branch or actor only matches runs that are actually
    // loaded, so paging one screen at a time made the filters useless on a
    // repository with hundreds of runs.
    assert.match(source, /private loadAllRuns = async \(\) => \{/)
    assert.match(source, /'Load all runs'/)
  })

  it('can be stopped, and stops itself when the view goes away', async () => {
    const source = await readFile(view, 'utf8')

    // Clicking again aborts rather than starting a second sweep.
    assert.match(
      source,
      /if \(this\.state\.loadingAllRuns !== null\) \{\s*this\.state\.loadingAllRuns\.abort\(\)\s*return/
    )
    assert.match(source, /'Stop loading'/)

    // A sweep outliving the view would keep hitting the API for runs nobody
    // is looking at.
    assert.match(
      source,
      /componentWillUnmount\(\)[\s\S]{0,600}this\.state\.loadingAllRuns\?\.abort\(\)/
    )
  })

  it('re-reads the cursor each round instead of trusting a stale one', async () => {
    const source = await readFile(view, 'utf8')
    // A refresh can reset pagination underneath the loop; a captured cursor
    // would then either stop early or request a page that no longer exists.
    assert.match(
      source,
      /if \(this\.state\.actions\.runsNextPage === null\) \{\s*return/
    )
  })

  it('cannot spin forever against the API', async () => {
    const source = await readFile(view, 'utf8')
    // The real exit is the store reporting no further page. The ceiling is
    // there because a store that never clears its cursor would otherwise loop
    // indefinitely, and a runaway request loop is worse than a partial load.
    assert.match(source, /for \(let round = 0; round < \d+; round\+\+\)/)
  })

  it('stops when the repository changes underneath it', async () => {
    const source = await readFile(view, 'utf8')
    // Otherwise the runs still arriving belong to a repository the user has
    // already navigated away from.
    assert.match(
      source,
      /if \(generation !== this\.repositoryGeneration\) \{[\s\S]{0,200}return/
    )
  })
})
