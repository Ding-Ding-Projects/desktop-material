import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'repositories-list',
    'repository-list-item.tsx'
  ),
  'utf8'
)

/**
 * A repository row unmounts whenever the list is filtered or the side sheet
 * closes, so every await that ends in `setState` has to consult the request id
 * that `componentWillUnmount` bumps. Checking only the repository path is not
 * enough: the row's own repository has not changed, the row is simply gone.
 */
describe('repository list item unmount guards', () => {
  it('bumps both request ids when the row unmounts', () => {
    const unmount = source.slice(source.indexOf('public componentWillUnmount'))
    assert.match(unmount, /this\.logoRequestId\+\+/)
    assert.match(unmount, /this\.appearanceEditorRequestId\+\+/)
  })

  it('checks the request id in every appearance refresh that sets state', () => {
    const method = source.slice(
      source.indexOf('private refreshEditorAppearance'),
      source.indexOf('private onAppearanceHistoryMutation')
    )

    assert.ok(method.includes('await '), 'the method awaits')
    assert.ok(method.includes('this.setState('), 'the method sets state')
    assert.match(
      method.slice(0, method.indexOf('this.setState(')),
      /requestId !== this\.appearanceEditorRequestId/
    )
  })

  it('checks the request id in the logo load that sets state', () => {
    const method = source.slice(
      source.indexOf('private loadLogo'),
      source.indexOf('private openAppearanceEditor')
    )

    // Only state set *after* an await needs the guard; the early-return branch
    // above the await runs synchronously and cannot outlive the row.
    const afterAwait = method.slice(method.indexOf('await '))
    assert.match(
      afterAwait.slice(0, afterAwait.indexOf('this.setState(')),
      /requestId === this\.logoRequestId/
    )
  })
})
