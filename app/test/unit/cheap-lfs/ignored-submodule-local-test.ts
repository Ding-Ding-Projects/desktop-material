import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, TestContext } from 'node:test'
import { exec } from 'dugite'

import { Repository } from '../../../src/models/repository'
import {
  IgnoredSubmoduleProofError,
  IgnoredSubmoduleRejectedError,
  IgnoredSubmodulePhase,
  IgnoredSubmoduleRecoveryManifestName,
  IIgnoredFileInventory,
  listIgnoredFileInventory,
  parseIgnoredStatusPaths,
  proveIgnoredPaths,
  stageIgnoredFilesIntoLocalSubmodule,
  validateIgnoredSubmoduleDestination,
  validateIgnoredSubmoduleSelection,
} from '../../../src/lib/cheap-lfs/ignored-submodule-local'
import { IgnoredSubmoduleRejectionReason } from '../../../src/lib/cheap-lfs/ignored-submodule-plan'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'

const DestinationPath = 'local-large-files'

const recoveryRootOf = (repository: Repository) =>
  join(
    repository.path,
    '.git',
    'desktop-material',
    'ignored-submodule-recovery'
  )

async function sha256(absolutePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(absolutePath))
    .digest('hex')
}

async function writeWorkingFile(
  repository: Repository,
  path: string,
  contents: string
): Promise<void> {
  const absolute = join(repository.path, ...path.split('/'))
  await mkdir(join(absolute, '..'), { recursive: true })
  await writeFile(absolute, contents)
}

/**
 * A repository whose ignore rules are real, with two genuinely ignored working
 * files, one ordinary tracked file, and one file which *matches* an ignore
 * pattern but was force-added and is therefore tracked.
 */
async function setupIgnoredRepository(t: TestContext): Promise<Repository> {
  const repository = await setupEmptyRepository(t)

  await makeCommit(repository, {
    entries: [
      {
        path: '.gitignore',
        contents: ['build/', '*.bin', 'secret-store', ''].join('\n'),
      },
      { path: 'tracked.txt', contents: 'tracked by git' },
    ],
  })

  await writeWorkingFile(repository, 'assets/forced.bin', 'forced into git')
  await exec(['add', '-f', '--', 'assets/forced.bin'], repository.path)
  await exec(['commit', '-m', 'force add'], repository.path)

  await writeWorkingFile(repository, 'build/output.txt', 'build output bytes')
  await writeWorkingFile(repository, 'assets/data.bin', 'ignored payload bytes')

  return repository
}

/** Build an inventory from the real files on disk, without enumerating. */
async function inventoryFor(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<IIgnoredFileInventory> {
  const candidates = []
  for (const path of paths) {
    const entry = await lstat(join(repository.path, ...path.split('/')))
    candidates.push({
      path,
      size: entry.size,
      modifiedAtMs: entry.mtimeMs,
      proof: { source: '.gitignore', line: 1, pattern: 'test' },
    })
  }

  return {
    id: 'test-inventory',
    capturedAtMs: Date.now(),
    repositoryPath: repository.path,
    candidates,
    truncated: false,
  }
}

async function reasonFor(
  repository: Repository,
  path: string,
  destinationPath = DestinationPath,
  inventoryPaths: ReadonlyArray<string> = []
): Promise<IgnoredSubmoduleRejectionReason | undefined> {
  const inventory = await inventoryFor(repository, inventoryPaths)
  const validation = await validateIgnoredSubmoduleSelection(
    repository,
    inventory,
    { destinationPath, selectedPaths: [path] }
  )
  assert.strictEqual(
    validation.accepted.length,
    0,
    `${path} must never be accepted`
  )
  return validation.rejected.find(rejection => rejection.path === path)?.reason
}

const stagedIndex = async (repository: Repository) =>
  (await exec(['ls-files', '--stage', '-z'], repository.path)).stdout

describe('parseIgnoredStatusPaths', () => {
  it('returns only ignored entries and never a rename origin', () => {
    const stdout = [
      '!! build/output.txt',
      'R  new-name.txt',
      'old-name.txt',
      '?? untracked.txt',
      '!! assets/data.bin',
      '',
    ].join('\0')

    assert.deepStrictEqual(parseIgnoredStatusPaths(stdout), [
      'build/output.txt',
      'assets/data.bin',
    ])
  })
})

describe('ignored file inventory', () => {
  it('lists only files Git proves are ignored, with the exact rule', async t => {
    const repository = await setupIgnoredRepository(t)

    const inventory = await listIgnoredFileInventory(repository)
    const paths = inventory.candidates.map(candidate => candidate.path)

    assert.ok(paths.includes('build/output.txt'))
    assert.ok(paths.includes('assets/data.bin'))
    assert.ok(
      !paths.includes('tracked.txt'),
      'an ordinary tracked file is never a candidate'
    )
    assert.ok(
      !paths.includes('assets/forced.bin'),
      'a tracked file matching an ignore pattern is never a candidate'
    )
    assert.strictEqual(inventory.truncated, false)

    const payload = inventory.candidates.find(
      candidate => candidate.path === 'assets/data.bin'
    )
    assert.ok(payload)
    assert.strictEqual(payload.proof.source, '.gitignore')
    assert.strictEqual(payload.proof.pattern, '*.bin')
    assert.ok(payload.proof.line > 0)
    assert.strictEqual(payload.size, 'ignored payload bytes'.length)
  })

  it('reports truncation instead of silently dropping candidates', async t => {
    const repository = await setupIgnoredRepository(t)

    const inventory = await listIgnoredFileInventory(repository, 1)

    assert.strictEqual(inventory.truncated, true)
    assert.strictEqual(inventory.candidates.length, 1)
  })

  it('never proves a tracked path ignored, even when a pattern matches it', async t => {
    const repository = await setupIgnoredRepository(t)

    const proofs = await proveIgnoredPaths(repository, [
      'assets/forced.bin',
      'assets/data.bin',
    ])

    assert.ok(!proofs.has('assets/forced.bin'))
    assert.ok(proofs.has('assets/data.bin'))
  })
})

describe('ignored submodule selection validation', () => {
  it('refuses a file Git does not prove is ignored', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await reasonFor(repository, 'tracked.txt', DestinationPath, [
        'tracked.txt',
      ]),
      'not-proven-ignored'
    )
    assert.strictEqual(
      await reasonFor(repository, 'assets/forced.bin', DestinationPath, [
        'assets/forced.bin',
      ]),
      'not-proven-ignored'
    )
  })

  it('refuses a link at the selected path without following it', async t => {
    const repository = await setupIgnoredRepository(t)
    const outside = await createTempDirectory(t)
    await writeFile(join(outside, 'payload.bin'), 'elsewhere')
    await symlink(outside, join(repository.path, 'linked.bin'), 'junction')

    assert.strictEqual(
      await reasonFor(repository, 'linked.bin', DestinationPath, []),
      'symbolic-link'
    )
  })

  it('refuses a file reached through a reparse point inside the repository', async t => {
    const repository = await setupIgnoredRepository(t)
    await writeWorkingFile(repository, 'real/payload.bin', 'real bytes')
    await symlink(
      join(repository.path, 'real'),
      join(repository.path, 'redirected'),
      'junction'
    )

    assert.strictEqual(
      await reasonFor(repository, 'redirected/payload.bin'),
      'reparse-point'
    )
  })

  it('refuses a file whose physical location escapes the repository', async t => {
    const repository = await setupIgnoredRepository(t)
    const outside = await createTempDirectory(t)
    await writeFile(join(outside, 'payload.bin'), 'elsewhere')
    await symlink(outside, join(repository.path, 'escape'), 'junction')

    assert.strictEqual(
      await reasonFor(repository, 'escape/payload.bin'),
      'path-escape'
    )
    assert.strictEqual(
      await reasonFor(repository, '../outside.bin'),
      'path-escape'
    )
  })

  it('refuses a file inside another Git repository', async t => {
    const repository = await setupIgnoredRepository(t)
    await mkdir(join(repository.path, 'nested'), { recursive: true })
    await exec(['init'], join(repository.path, 'nested'))
    await writeWorkingFile(repository, 'nested/payload.bin', 'nested bytes')

    assert.strictEqual(
      await reasonFor(repository, 'nested/payload.bin'),
      'nested-repository'
    )
  })

  it('refuses a Git control path', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await reasonFor(repository, '.git/config'),
      'git-control-path'
    )
  })

  it('refuses selections which collide case-insensitively at the destination', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)

    const validation = await validateIgnoredSubmoduleSelection(
      repository,
      inventory,
      {
        destinationPath: DestinationPath,
        selectedPaths: [
          'assets/data.bin',
          'ASSETS/DATA.BIN',
          'assets/data.bin',
        ],
      }
    )

    assert.deepStrictEqual(
      validation.rejected.map(rejection => rejection.reason),
      ['destination-case-collision', 'duplicate-selection']
    )
    assert.deepStrictEqual(
      validation.accepted.map(file => file.candidate.path),
      ['assets/data.bin']
    )
  })

  it('refuses a file inside the folder the submodule would occupy', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await reasonFor(repository, `${DestinationPath}/nested/thing.bin`),
      'inside-destination'
    )
  })

  it('refuses a selection whose inventory entry is stale', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)

    await writeWorkingFile(
      repository,
      'assets/data.bin',
      'ignored payload bytes, but longer now'
    )

    const validation = await validateIgnoredSubmoduleSelection(
      repository,
      inventory,
      {
        destinationPath: DestinationPath,
        selectedPaths: ['assets/data.bin'],
      }
    )

    assert.deepStrictEqual(
      validation.rejected.map(rejection => rejection.reason),
      ['stale-inventory']
    )
    assert.strictEqual(validation.accepted.length, 0)
  })

  it('refuses a path that was never part of the reviewed inventory', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await reasonFor(repository, 'assets/data.bin', DestinationPath, []),
      'stale-inventory'
    )
  })
})

describe('ignored submodule destination validation', () => {
  it('refuses a destination which already holds files', async t => {
    const repository = await setupIgnoredRepository(t)
    await writeWorkingFile(repository, 'occupied/keep.txt', 'in the way')

    assert.strictEqual(
      await validateIgnoredSubmoduleDestination(repository, 'occupied'),
      'occupied'
    )
  })

  it('refuses a destination Git itself ignores', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await validateIgnoredSubmoduleDestination(repository, 'secret-store'),
      'ignored'
    )
  })

  it('refuses a destination overlapping a declared submodule', async t => {
    const repository = await setupIgnoredRepository(t)
    await exec(
      [
        'config',
        '-f',
        '.gitmodules',
        'submodule.vendor/lib.path',
        'vendor/lib',
      ],
      repository.path
    )

    assert.strictEqual(
      await validateIgnoredSubmoduleDestination(repository, 'vendor/lib/inner'),
      'existing-submodule'
    )
    assert.strictEqual(
      await validateIgnoredSubmoduleDestination(repository, 'vendor'),
      'existing-submodule'
    )
  })

  it('accepts a fresh, non-overlapping, non-ignored destination', async t => {
    const repository = await setupIgnoredRepository(t)

    assert.strictEqual(
      await validateIgnoredSubmoduleDestination(repository, DestinationPath),
      null
    )
  })
})

describe('staging ignored files into a local submodule', () => {
  it('leaves every original byte-for-byte identical and adds the submodule', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)
    const selectedPaths = ['assets/data.bin', 'build/output.txt']

    const before = new Map<string, string>()
    for (const path of selectedPaths) {
      before.set(path, await sha256(join(repository.path, ...path.split('/'))))
    }

    const phases: IgnoredSubmodulePhase[] = []
    const result = await stageIgnoredFilesIntoLocalSubmodule(
      repository,
      inventory,
      { destinationPath: DestinationPath, selectedPaths },
      { onPhase: phase => void phases.push(phase) }
    )

    // Every original is still exactly where and what it was.
    for (const path of selectedPaths) {
      const absolute = join(repository.path, ...path.split('/'))
      const entry = await lstat(absolute)
      assert.ok(entry.isFile() && !entry.isSymbolicLink(), path)
      assert.strictEqual(await sha256(absolute), before.get(path), path)
    }

    // The verified copies live in the new repository at their exact paths.
    for (const path of selectedPaths) {
      const copied = join(repository.path, DestinationPath, ...path.split('/'))
      assert.strictEqual(await sha256(copied), before.get(path), path)
    }

    // The parent now declares and indexes the submodule.
    const gitmodules = await readFile(
      join(repository.path, '.gitmodules'),
      'utf8'
    )
    assert.match(gitmodules, /path = local-large-files/)
    assert.match(gitmodules, /url = \.\/local-large-files/)
    assert.match(
      await stagedIndex(repository),
      new RegExp(`160000 [0-9a-f]{40} 0\\t${DestinationPath}`)
    )

    // The new repository holds exactly one commit and it is the reported one.
    const head = await exec(
      ['rev-parse', 'HEAD'],
      join(repository.path, DestinationPath)
    )
    assert.strictEqual(head.stdout.trim(), result.commitSha)
    assert.strictEqual(result.stagedFiles.length, 2)
    assert.strictEqual(result.retainedRecoveryDirectory, null)

    // Copy proofs finish before anything is written to any index.
    assert.deepStrictEqual(phases, [
      'validate',
      'hash-originals',
      'recovery-copy',
      'stage-copy',
      'initialize-repository',
      'topology',
      'final-verification',
      'cleanup',
    ])
    assert.ok(
      phases.indexOf('stage-copy') < phases.indexOf('initialize-repository')
    )
    assert.ok(phases.indexOf('stage-copy') < phases.indexOf('topology'))
  })

  it('retains recovery copies until final verification, then removes them', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)
    const recoveryRoot = recoveryRootOf(repository)

    let recoveredAtTopology: ReadonlyArray<string> = []
    let manifestAtTopology: string | null = null

    await stageIgnoredFilesIntoLocalSubmodule(
      repository,
      inventory,
      {
        destinationPath: DestinationPath,
        selectedPaths: ['assets/data.bin'],
      },
      {
        onPhase: async phase => {
          if (phase !== 'topology') {
            return
          }
          const runs = await readdir(recoveryRoot)
          recoveredAtTopology = runs
          manifestAtTopology = await readFile(
            join(recoveryRoot, runs[0], IgnoredSubmoduleRecoveryManifestName),
            'utf8'
          )
          assert.strictEqual(
            await sha256(
              join(recoveryRoot, runs[0], 'originals', 'assets', 'data.bin')
            ),
            await sha256(join(repository.path, 'assets', 'data.bin'))
          )
        },
      }
    )

    assert.strictEqual(recoveredAtTopology.length, 1)
    assert.ok(manifestAtTopology !== null)
    assert.match(String(manifestAtTopology), /assets\/data\.bin/)
    assert.deepStrictEqual(await readdir(recoveryRoot), [])
  })

  it('aborts a failed copy proof before any topology change', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)
    // The staging code resolves the repository root through `realpath` before
    // building the destination, so the paths it hands to `hashFile` are the
    // resolved ones. Matching on the *unresolved* path worked locally and
    // silently stopped matching on CI, where the temporary directory resolves
    // to something else — no corruption was injected, the proof honestly
    // passed, and the test failed claiming a missing failure it had never
    // caused. Resolve here too, so the prefix is the one that is actually used.
    const repositoryRoot = await realpath(repository.path)
    const destinationAbsolute = join(repositoryRoot, DestinationPath)
    const indexBefore = await stagedIndex(repository)

    const phases: IgnoredSubmodulePhase[] = []
    let corruptedCopies = 0
    const failure = await stageIgnoredFilesIntoLocalSubmodule(
      repository,
      inventory,
      {
        destinationPath: DestinationPath,
        selectedPaths: ['assets/data.bin', 'build/output.txt'],
      },
      {
        onPhase: phase => void phases.push(phase),
        // The copy landing in the new repository reads back wrong. Nothing
        // downstream of the proof may run.
        hashFile: async absolutePath => {
          if (absolutePath.startsWith(destinationAbsolute)) {
            corruptedCopies += 1
            return 'corrupted'
          }
          return sha256(absolutePath)
        },
      }
    ).then(
      () => null,
      (error: unknown) => error
    )

    // Assert the fault was actually injected before asserting the reaction to
    // it. Without this, a prefix that stops matching turns this test into one
    // that quietly proves nothing and then blames the code for not failing.
    assert.ok(
      corruptedCopies > 0,
      `no copy was corrupted, so this test proved nothing; hashFile never saw a path under ${destinationAbsolute}`
    )
    assert.ok(
      failure instanceof IgnoredSubmoduleProofError,
      'the proof failure must be reported as such'
    )
    assert.strictEqual(failure.phase, 'stage-copy')
    assert.ok(!phases.includes('topology'), 'no topology change may happen')
    assert.ok(!phases.includes('initialize-repository'))

    // Nothing reached the parent repository.
    assert.strictEqual(await stagedIndex(repository), indexBefore)
    await assert.rejects(() => lstat(join(repository.path, '.gitmodules')))
    await assert.rejects(() => lstat(destinationAbsolute))

    // The originals are untouched and the recovery copies are named and kept.
    assert.ok(failure.retainedRecoveryDirectory !== null)
    assert.match(failure.message, /independent copies are retained at/i)
    assert.strictEqual(
      await sha256(join(repository.path, 'assets', 'data.bin')),
      await sha256(
        join(
          String(failure.retainedRecoveryDirectory),
          'originals',
          'assets',
          'data.bin'
        )
      )
    )
  })

  it('aborts on a stale inventory without creating anything', async t => {
    const repository = await setupIgnoredRepository(t)
    const inventory = await listIgnoredFileInventory(repository)
    const indexBefore = await stagedIndex(repository)

    await writeWorkingFile(
      repository,
      'assets/data.bin',
      'these are different bytes entirely'
    )

    const phases: IgnoredSubmodulePhase[] = []
    const failure = await stageIgnoredFilesIntoLocalSubmodule(
      repository,
      inventory,
      {
        destinationPath: DestinationPath,
        selectedPaths: ['assets/data.bin'],
      },
      { onPhase: phase => void phases.push(phase) }
    ).then(
      () => null,
      (error: unknown) => error
    )

    assert.ok(failure instanceof IgnoredSubmoduleRejectedError)
    assert.deepStrictEqual(
      failure.rejections.map(rejection => rejection.reason),
      ['stale-inventory']
    )
    assert.deepStrictEqual(phases, ['validate'])
    assert.strictEqual(await stagedIndex(repository), indexBefore)
    await assert.rejects(() => lstat(join(repository.path, '.gitmodules')))
    await assert.rejects(() => lstat(join(repository.path, DestinationPath)))
    await assert.rejects(() => readdir(recoveryRootOf(repository)))
  })
})
