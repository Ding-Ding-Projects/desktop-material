import assert from 'node:assert'
import { describe, it } from 'node:test'
import '../helpers/ui/setup'
import { CloneRepositoryTab } from '../../src/models/clone-repository-tab'
import { isMultiRepositoryCloneSelection } from '../../src/ui/clone-repository/clone-repository'

const urls = (...values: ReadonlyArray<string>) => new Set(values)

describe('isMultiRepositoryCloneSelection', () => {
  it('treats a single-select clone as a strict single destination', () => {
    // Zero or one checked repository means `path` is the exact clone
    // destination, so the strict empty-folder check must still apply.
    assert.equal(
      isMultiRepositoryCloneSelection(CloneRepositoryTab.DotCom, urls()),
      false
    )
    assert.equal(
      isMultiRepositoryCloneSelection(
        CloneRepositoryTab.DotCom,
        urls('https://github.com/desktop/desktop.git')
      ),
      false
    )
  })

  it('recognises a multi-repository batch clone on every hosted tab', () => {
    const checked = urls(
      'https://github.com/desktop/desktop.git',
      'https://github.com/desktop/dugite.git'
    )

    assert.equal(
      isMultiRepositoryCloneSelection(CloneRepositoryTab.DotCom, checked),
      true
    )
    assert.equal(
      isMultiRepositoryCloneSelection(CloneRepositoryTab.Enterprise, checked),
      true
    )
    assert.equal(
      isMultiRepositoryCloneSelection(CloneRepositoryTab.Providers, checked),
      true
    )
  })

  it('never treats the generic URL tab as a multi-repository clone', () => {
    assert.equal(
      isMultiRepositoryCloneSelection(
        CloneRepositoryTab.Generic,
        urls('https://github.com/desktop/desktop.git', 'https://x/y.git')
      ),
      false
    )
  })
})
