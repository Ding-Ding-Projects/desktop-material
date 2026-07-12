import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  findWindowForRepositoryPath,
  nextWindowScope,
} from '../../src/main-process/window-routing'
import { windowScopeFromHash } from '../../src/lib/window-scope'

interface TestWindow {
  readonly name: string
  readonly selectedRepositoryPath: string | null
  readonly openRepositoryPaths: ReadonlyArray<string>
}

const windowState = (
  name: string,
  selectedRepositoryPath: string | null,
  openRepositoryPaths: ReadonlyArray<string>
): TestWindow => ({ name, selectedRepositoryPath, openRepositoryPaths })

describe('multi-window routing', () => {
  it('allocates stable reusable window scopes', () => {
    assert.equal(nextWindowScope(new Set()), 'primary')
    assert.equal(nextWindowScope(new Set(['primary'])), 'window-2')
    assert.equal(
      nextWindowScope(new Set(['primary', 'window-2', 'window-4'])),
      'window-3'
    )
  })

  it('routes to a repository open in a background tab', () => {
    const first = windowState('first', 'C:\\repos\\one', ['C:\\repos\\one'])
    const second = windowState('second', 'C:\\repos\\two', [
      'C:\\repos\\two',
      'C:\\repos\\target',
    ])
    assert.equal(
      findWindowForRepositoryPath(
        [first, second],
        'C:\\repos\\target\\src',
        true
      )?.name,
      'second'
    )
  })

  it('prefers the window where a matching tab is selected', () => {
    const background = windowState('background', 'C:\\repos\\other', [
      'C:\\repos\\target',
    ])
    const selected = windowState('selected', 'C:\\repos\\target', [
      'C:\\repos\\target',
    ])
    assert.equal(
      findWindowForRepositoryPath(
        [background, selected],
        'C:\\repos\\target',
        true
      )?.name,
      'selected'
    )
  })

  it('prefers the most specific nested repository', () => {
    const parent = windowState('parent', null, ['C:\\work\\repo'])
    const nested = windowState('nested', null, ['C:\\work\\repo\\vendor'])
    assert.equal(
      findWindowForRepositoryPath(
        [parent, nested],
        'C:\\work\\repo\\vendor\\src',
        true
      )?.name,
      'nested'
    )
  })

  it('honors path boundaries and Windows case insensitivity', () => {
    const target = windowState('target', null, ['C:\\Repos\\App'])
    assert.equal(
      findWindowForRepositoryPath([target], 'c:\\repos\\app\\src', true),
      target
    )
    assert.equal(
      findWindowForRepositoryPath([target], 'C:\\Repos\\Application', true),
      null
    )
  })

  it('parses a safe scope and rejects an invalid one', () => {
    assert.equal(windowScopeFromHash('#lc=CA&ws=window-2'), 'window-2')
    assert.equal(windowScopeFromHash('#ws=../../escape'), 'primary')
    assert.equal(windowScopeFromHash(''), 'primary')
  })
})
