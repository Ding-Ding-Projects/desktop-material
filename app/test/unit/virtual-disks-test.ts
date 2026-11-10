import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  diskpartCommand,
  planVirtualDiskOperation,
  virtualDiskFormat,
} from '../../src/lib/virtual-disks'

const script = (operation: Parameters<typeof planVirtualDiskOperation>[0]) => {
  const plan = planVirtualDiskOperation(operation)
  assert.ok(plan.ok, plan.ok ? '' : plan.errors.join(' '))
  return plan.script
}
const errors = (operation: Parameters<typeof planVirtualDiskOperation>[0]) => {
  const plan = planVirtualDiskOperation(operation)
  assert.ok(!plan.ok)
  return plan.errors.join(' ')
}
const path = 'D:\\Disks\\data.vhdx'

describe('virtual disk plans', () => {
  it('reads the format from the file name', () => {
    assert.equal(virtualDiskFormat('D:\\a.VHDX'), 'vhdx')
    assert.equal(virtualDiskFormat('D:\\a.vhd '), 'vhd')
    assert.equal(virtualDiskFormat('D:\\a.iso'), null)
  })

  it('writes the exact diskpart script for each operation', () => {
    assert.equal(
      script({
        kind: 'create',
        path,
        sizeMegabytes: 20480,
        allocation: 'expandable',
      }),
      'create vdisk file="D:\\Disks\\data.vhdx" maximum=20480 type=expandable'
    )
    assert.equal(
      script({ kind: 'attach', path, readOnly: true }),
      'select vdisk file="D:\\Disks\\data.vhdx"\nattach vdisk readonly'
    )
    assert.equal(
      script({ kind: 'attach', path, readOnly: false }),
      'select vdisk file="D:\\Disks\\data.vhdx"\nattach vdisk'
    )
    assert.equal(
      script({ kind: 'detach', path }),
      'select vdisk file="D:\\Disks\\data.vhdx"\ndetach vdisk'
    )
    assert.equal(
      script({ kind: 'expand', path, sizeMegabytes: 40960 }),
      'select vdisk file="D:\\Disks\\data.vhdx"\nexpand vdisk maximum=40960'
    )
    assert.equal(
      script({ kind: 'compact', path }),
      'select vdisk file="D:\\Disks\\data.vhdx"\nattach vdisk readonly\ncompact vdisk\ndetach vdisk'
    )
    assert.equal(
      script({ kind: 'merge', path, depth: 2 }),
      'select vdisk file="D:\\Disks\\data.vhdx"\nmerge vdisk depth=2'
    )
  })

  it('refuses paths that could break out of the script', () => {
    for (const bad of [
      'data.vhdx',
      'D:\\Disks\\a".vhdx',
      'D:\\Disks\\a.vhdx\nclean',
      '\\\\server\\share\\a.vhdx',
      'D:\\Disks\\a.iso',
    ]) {
      assert.ok(errors({ kind: 'detach', path: bad }).length > 0, bad)
    }
  })

  it('checks sizes against the format limits', () => {
    assert.match(
      errors({ kind: 'create', path, sizeMegabytes: 1, allocation: 'fixed' }),
      /at least 3/
    )
    assert.match(
      errors({
        kind: 'create',
        path: 'D:\\a.vhd',
        sizeMegabytes: 2041 * 1024,
        allocation: 'fixed',
      }),
      /2,040 GB/
    )
    assert.match(
      errors({ kind: 'expand', path, sizeMegabytes: 20.5 }),
      /whole number/
    )
    assert.match(errors({ kind: 'merge', path, depth: 0 }), /1 to 16/)
  })

  it('warns that a merge cannot be undone', () => {
    const plan = planVirtualDiskOperation({ kind: 'merge', path, depth: 1 })
    assert.ok(plan.ok)
    assert.match(plan.summary, /cannot be undone/)
    assert.equal(diskpartCommand('C:\\t\\s.txt'), 'diskpart /s "C:\\t\\s.txt"')
  })
})
