import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import {
  IgnoreFilesContainingDialog,
  wildcardPatternFromFilename,
  wildcardPatternToRegExp,
  wildcardPreview,
} from '../../../src/ui/changes/ignore-files-containing-dialog'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('ignore files containing wildcard builder', () => {
  it('prefills the filename between wildcards and previews live matches', () => {
    assert.equal(wildcardPatternFromFilename('.tmp-123'), '*.tmp-123*')
    assert.deepStrictEqual(
      wildcardPreview('*.tmp-*', ['a.tmp-123', 'keep.txt', 'nested/b.tmp-9']),
      ['a.tmp-123', 'nested/b.tmp-9']
    )
  })

  it('rejects an unfinished character class', () => {
    assert.equal(wildcardPatternToRegExp('*[abc'), null)
  })

  it('submits the edited wildcard after the live preview is reviewed', async () => {
    const appended: string[] = []
    const repository = new Repository('C:\\fixture', 1, null, false)
    render(
      <IgnoreFilesContainingDialog
        repository={repository}
        filename=".tmp-123"
        paths={['a.tmp-123', 'keep.txt']}
        dispatcher={
          {
            appendIgnoreRule: async (_repo: Repository, pattern: string) => {
              appended.push(pattern)
            },
          } as never
        }
        onDismissed={() => undefined}
      />
    )

    const pattern = screen.getByRole('textbox', { name: 'Wildcard pattern' })
    fireEvent.change(pattern, { target: { value: '*keep*' } })
    assert.match(screen.getByText(/1 matching file/).textContent ?? '', /1/)
    fireEvent.click(screen.getByRole('button', { name: 'Add to .gitignore' }))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepStrictEqual(appended, ['*keep*'])
  })
})
