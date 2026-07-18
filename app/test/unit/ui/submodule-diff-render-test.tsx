import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DiffType, ISubmoduleDiff } from '../../../src/models/diff'
import { SubmoduleStatus } from '../../../src/models/status'
import { DefaultAppDisplayName } from '../../../src/models/app-identity'
import { SubmoduleDiff } from '../../../src/ui/diff/submodule-diff'
import { fireEvent, render } from '../../helpers/ui/render'

const cleanStatus: SubmoduleStatus = {
  commitChanged: true,
  modifiedChanges: false,
  untrackedChanges: false,
}

function buildDiff(overrides: Partial<ISubmoduleDiff> = {}): ISubmoduleDiff {
  return {
    kind: DiffType.Submodule,
    fullPath: 'C:/repo/vendor/dependency',
    path: 'vendor/dependency',
    url: 'https://github.com/desktop/dependency.git',
    status: cleanStatus,
    oldSHA: '1111111111111111111111111111111111111111',
    newSHA: '2222222222222222222222222222222222222222',
    ...overrides,
  }
}

describe('SubmoduleDiff', () => {
  it('brands the open action with the app product name, not GitHub Desktop', () => {
    const view = render(<SubmoduleDiff diff={buildDiff()} readOnly={false} />)

    const text = view.container.textContent ?? ''
    assert.ok(text.includes(DefaultAppDisplayName))
    assert.ok(!text.includes('GitHub Desktop'))
  })

  it('shows the submodule name and both open and view actions', () => {
    const opened: Array<string> = []
    const view = render(
      <SubmoduleDiff
        diff={buildDiff()}
        readOnly={false}
        onOpenSubmodule={path => opened.push(path)}
      />
    )

    // Prominent submodule name derived from the full path's last segment.
    assert.equal(
      view.container.querySelector('.submodule-path')?.textContent,
      'dependency'
    )

    const openButton = view.getByRole('button', { name: /open repository/i })
    const viewButton = view.getByRole('button', { name: /open in browser/i })
    assert.ok(openButton !== null)
    assert.ok(viewButton !== null)

    // The view action is labelled for the parsed host.
    assert.ok((view.container.textContent ?? '').includes('View on GitHub'))

    fireEvent.click(openButton)
    assert.deepEqual(opened, ['C:/repo/vendor/dependency'])
  })

  it('renders an old-to-new SHA transition for a modified submodule', () => {
    const view = render(<SubmoduleDiff diff={buildDiff()} readOnly={false} />)

    const transition = view.container.querySelector('.sha-transition')
    assert.ok(transition !== null)
    assert.ok(transition?.querySelector('.sha-arrow') !== null)
    // Both the previous and new short SHAs are present with copy buttons.
    assert.equal(transition?.querySelectorAll('.sha-chip').length, 2)
  })

  it('renders no actions when the submodule has no url', () => {
    const view = render(
      <SubmoduleDiff diff={buildDiff({ url: null })} readOnly={true} />
    )

    assert.equal(view.container.querySelector('.suggested-action'), null)
  })
})
