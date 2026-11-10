import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { VirtualDiskPlanner } from '../../../src/ui/repository-tools/virtual-disk-planner'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('virtual disk planner', () => {
  it('shows the script only for a valid plan and copies it', () => {
    const copied = new Array<string>()
    render(<VirtualDiskPlanner copyText={text => copied.push(text)} />)

    assert.ok(screen.getByText(/Type the full path/))
    assert.equal(screen.queryByRole('button', { name: 'Copy script' }), null)

    fireEvent.change(screen.getByLabelText('Virtual disk file'), {
      target: { value: 'data.vhdx' },
    })
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /full Windows path/
    )

    fireEvent.change(screen.getByLabelText('Virtual disk file'), {
      target: { value: 'D:\\Disks\\data.vhdx' },
    })
    assert.equal(screen.queryByRole('alert'), null)
    assert.ok(
      screen.getByText(
        'create vdisk file="D:\\Disks\\data.vhdx" maximum=20480 type=expandable'
      )
    )

    fireEvent.change(screen.getByLabelText('What to do'), {
      target: { value: 'attach' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
    assert.deepEqual(copied, [
      'select vdisk file="D:\\Disks\\data.vhdx"\nattach vdisk readonly',
    ])
    assert.ok(screen.getByText('Copied.'))
  })
})
