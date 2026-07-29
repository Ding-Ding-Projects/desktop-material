import assert from 'node:assert'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it, TestContext } from 'node:test'
import { promisify } from 'node:util'
import {
  CHEAP_LFS_CLONE_HELPER_DIRECTORY,
  ensureCheapLfsCloneHelperBundle,
} from '../../../src/lib/cheap-lfs/clone-helper'
import { parseCheapLfsCloneInventory } from '../../../src/lib/cheap-lfs/clone-inventory'
import {
  listAllCheapLfsPointers,
  listAllCheapLfsPointersAtHead,
} from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_POINTER_VERSION,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import { mergeCheapLfsPointersForProspectiveCommit } from '../../../src/lib/stores/app-store'
import type { ICheapLfsManagedPointerEntry } from '../../../src/lib/cheap-lfs/operations'
import { Repository } from '../../../src/models/repository'
import { createTempDirectory } from '../../helpers/temp'

const execFile = promisify(execFileCallback)

async function git(
  repositoryPath: string,
  args: ReadonlyArray<string>
): Promise<string> {
  const result = await execFile('git', [...args], {
    cwd: repositoryPath,
    encoding: 'utf8',
  })
  return result.stdout
}

function releaseEntryForPayload(
  relativePath: string,
  payload: Buffer,
  assetName: string
): Extract<ICheapLfsManagedPointerEntry, { readonly kind: 'release' }> {
  return {
    kind: 'release',
    provider: 'release',
    relativePath,
    workingTreeState: 'pointer',
    pointer: {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'desktop-material-lfs-v1',
      assetName,
      sizeInBytes: payload.length,
      sha256: createHash('sha256').update(payload).digest('hex'),
    },
  }
}

async function writePointer(
  root: string,
  entry: Extract<ICheapLfsManagedPointerEntry, { readonly kind: 'release' }>
): Promise<void> {
  const absolutePath = join(root, entry.relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, serializeCheapLfsPointer(entry.pointer), 'utf8')
}

async function createPointerRepository(
  t: TestContext
): Promise<{ readonly root: string; readonly repository: Repository }> {
  const root = await createTempDirectory(t)
  await git(root, ['init', '--quiet'])
  await git(root, ['config', 'user.name', 'Desktop Material Tests'])
  await git(root, ['config', 'user.email', 'desktop-material@example.test'])
  await git(root, ['config', 'core.autocrlf', 'false'])
  return { root, repository: new Repository(root, 91, null, false) }
}

function releaseEntry(
  relativePath: string,
  sha256: string,
  workingTreeState: ICheapLfsManagedPointerEntry['workingTreeState']
): Extract<ICheapLfsManagedPointerEntry, { readonly kind: 'release' }> {
  return {
    kind: 'release',
    provider: 'release',
    relativePath,
    workingTreeState,
    pointer: {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'desktop-material-lfs-v1',
      assetName: `${sha256}.bin`,
      sizeInBytes: 10,
      sha256,
    },
  }
}

describe('prospective Cheap LFS clone-helper inventory', () => {
  it('preserves unselected HEAD pointers and overlays only committed paths', () => {
    const hydrated = releaseEntry(
      'assets/hydrated.bin',
      'a'.repeat(64),
      'pointer'
    )
    const locallyDeleted = releaseEntry(
      'assets/locally-deleted.bin',
      'b'.repeat(64),
      'pointer'
    )
    const rewrittenHead = releaseEntry(
      'assets/rewritten.bin',
      'c'.repeat(64),
      'pointer'
    )
    const selectedDeletion = releaseEntry(
      'assets/selected-deletion.bin',
      'd'.repeat(64),
      'pointer'
    )
    const rewrittenWorktree = releaseEntry(
      'assets/rewritten.bin',
      'e'.repeat(64),
      'pointer'
    )
    const newlyPinned = releaseEntry(
      'assets/new.bin',
      'f'.repeat(64),
      'pointer'
    )

    const result = mergeCheapLfsPointersForProspectiveCommit(
      [hydrated, locallyDeleted, rewrittenHead, selectedDeletion],
      [
        { ...hydrated, workingTreeState: 'materialized' },
        rewrittenWorktree,
        newlyPinned,
      ],
      new Set([
        rewrittenWorktree.relativePath,
        newlyPinned.relativePath,
        selectedDeletion.relativePath,
      ])
    )

    assert.deepEqual(
      result.map(entry => [
        entry.relativePath,
        entry.kind === 'release'
          ? entry.pointer.sha256
          : entry.pointer.object.slice('sha256:'.length),
      ]),
      [
        [hydrated.relativePath, hydrated.pointer.sha256],
        [locallyDeleted.relativePath, locallyDeleted.pointer.sha256],
        [newlyPinned.relativePath, newlyPinned.pointer.sha256],
        [rewrittenWorktree.relativePath, rewrittenWorktree.pointer.sha256],
      ]
    )
  })

  it('removes the old side of a committed pointer rename', () => {
    const oldEntry = releaseEntry('assets/old.bin', '1'.repeat(64), 'pointer')
    const newEntry = releaseEntry('assets/new.bin', '1'.repeat(64), 'pointer')

    const result = mergeCheapLfsPointersForProspectiveCommit(
      [oldEntry],
      [newEntry],
      new Set([oldEntry.relativePath, newEntry.relativePath])
    )

    assert.deepEqual(
      result.map(entry => entry.relativePath),
      [newEntry.relativePath]
    )
  })

  it('publishes an inventory exactly matching the resulting committed tree', async t => {
    const { root, repository } = await createPointerRepository(t)
    const hydrated = releaseEntryForPayload(
      'assets/hydrated.bin',
      Buffer.from('hydrated payload'),
      'hydrated.bin'
    )
    const locallyDeleted = releaseEntryForPayload(
      'assets/locally-deleted.bin',
      Buffer.from('locally deleted payload'),
      'locally-deleted.bin'
    )
    const rewrittenHead = releaseEntryForPayload(
      'assets/rewritten.bin',
      Buffer.from('old rewritten payload'),
      'rewritten-old.bin'
    )
    const selectedDeletion = releaseEntryForPayload(
      'assets/selected-deletion.bin',
      Buffer.from('selected deletion payload'),
      'selected-deletion.bin'
    )
    for (const entry of [
      hydrated,
      locallyDeleted,
      rewrittenHead,
      selectedDeletion,
    ]) {
      await writePointer(root, entry)
    }
    await git(root, ['add', '--', 'assets'])
    await git(root, ['commit', '--quiet', '-m', 'initial pointers'])

    await writeFile(
      `${root}/${hydrated.relativePath}`,
      Buffer.from('hydrated payload')
    )
    await rm(`${root}/${locallyDeleted.relativePath}`)
    await rm(`${root}/${selectedDeletion.relativePath}`)
    const rewritten = releaseEntryForPayload(
      rewrittenHead.relativePath,
      Buffer.from('new rewritten payload'),
      'rewritten-new.bin'
    )
    const newlyPinned = releaseEntryForPayload(
      'assets/new.bin',
      Buffer.from('new payload'),
      'new.bin'
    )
    await writePointer(root, rewritten)
    await writePointer(root, newlyPinned)

    const committedPaths = new Set([
      rewritten.relativePath,
      newlyPinned.relativePath,
      selectedDeletion.relativePath,
    ])
    const prospective = mergeCheapLfsPointersForProspectiveCommit(
      await listAllCheapLfsPointersAtHead(repository),
      await listAllCheapLfsPointers(repository, undefined, [...committedPaths]),
      committedPaths
    )
    const helper = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: prospective,
    })
    assert.ok(helper.status === 'created' || helper.status === 'updated')

    await git(root, [
      'add',
      '-A',
      '--',
      ...committedPaths,
      CHEAP_LFS_CLONE_HELPER_DIRECTORY,
    ])
    await git(root, ['commit', '--quiet', '-m', 'selected pointer changes'])

    const inventoryText = await git(root, [
      'show',
      `HEAD:${CHEAP_LFS_CLONE_HELPER_DIRECTORY}/inventory.json`,
    ])
    const inventory = parseCheapLfsCloneInventory(inventoryText)
    assert.equal(inventory.kind, 'valid')
    const committed = await listAllCheapLfsPointersAtHead(repository)
    if (inventory.kind === 'valid') {
      assert.deepEqual(
        inventory.inventory.assets.map(asset => [
          asset.path,
          asset.objectSha256,
        ]),
        committed.map(entry => [
          entry.relativePath,
          entry.kind === 'release'
            ? entry.pointer.sha256
            : entry.pointer.object.slice('sha256:'.length),
        ])
      )
    }
    const status = await git(root, ['status', '--short'])
    assert.match(status, /assets\/hydrated\.bin/)
    assert.match(status, /assets\/locally-deleted\.bin/)
    assert.equal(
      await readFile(`${root}/${hydrated.relativePath}`, 'utf8'),
      'hydrated payload'
    )
  })
})
