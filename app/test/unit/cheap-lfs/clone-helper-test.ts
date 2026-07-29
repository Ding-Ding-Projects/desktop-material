import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { deflateRawSync } from 'node:zlib'
import { describe, it } from 'node:test'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  ICheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import { CheapLfsTrackedPathStore } from '../../../src/lib/cheap-lfs/tracked-path-store'
import {
  CHEAP_LFS_CLONE_HELPER_DIRECTORY,
  CheapLfsCloneHelperBundleGenerator,
  CheapLfsCloneHelperEntry,
  ensureCheapLfsCloneHelperBundle,
  renderCheapLfsCloneHelperBundle,
  renderCheapLfsCloneHelperInventory,
  renderCheapLfsHydrationInventory,
} from '../../../src/lib/cheap-lfs/clone-helper'
import { CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES } from '../../../src/lib/cheap-lfs/clone-inventory'
import {
  CHEAP_LFS_CLONE_HELPER_MANAGED_BY,
  CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES,
} from '../../../src/lib/cheap-lfs/clone-helper-templates'

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fixture(t: { after(callback: () => unknown): void }) {
  const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-clone-helper-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  return root
}

function rawReleaseEntry(
  relativePath = 'assets/model.bin',
  bytes = Buffer.from('model bytes')
): CheapLfsCloneHelperEntry {
  return {
    kind: 'release',
    relativePath,
    pointer: {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'cheap-lfs-assets',
      assetName: 'model.bin',
      sizeInBytes: bytes.length,
      sha256: sha256(bytes),
    },
  }
}

function ociEntry(
  relativePath = 'assets/registry.bin'
): CheapLfsCloneHelperEntry {
  return {
    kind: 'oci',
    relativePath,
    pointer: {
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: `ghcr.io/owner/project-cheap-lfs@sha256:${'a'.repeat(64)}`,
      object: `sha256:${'b'.repeat(64)}`,
      sizeInBytes: 20,
      layers: [`sha256:${'c'.repeat(64)}`],
    },
  }
}

async function run(
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}> {
  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = new Array<Buffer>()
  const stderr = new Array<Buffer>()
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return {
    code,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }
}

describe('Cheap LFS clone-helper bundle', () => {
  it('renders a deterministic bounded inventory without timestamps or secrets', () => {
    const first = rawReleaseEntry('z/model.bin', Buffer.from('z'))
    const second = ociEntry('a/registry.bin')
    const forward = renderCheapLfsCloneHelperInventory([first, second])
    const reverse = renderCheapLfsCloneHelperInventory([second, first])
    const inventory = JSON.parse(forward)

    assert.equal(forward, reverse)
    assert.equal(inventory.schemaVersion, 1)
    assert.match(inventory.pointerSetSha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(
      inventory.assets.map((entry: { path: string }) => entry.path),
      ['a/registry.bin', 'z/model.bin']
    )
    const hydration = JSON.parse(
      renderCheapLfsHydrationInventory([second, first])
    )
    assert.equal(hydration.managedBy, CHEAP_LFS_CLONE_HELPER_MANAGED_BY)
    assert.deepEqual(
      hydration.entries.map((entry: { path: string }) => entry.path),
      ['a/registry.bin', 'z/model.bin']
    )
    assert.doesNotMatch(forward, /generatedAt|timestamp|token|password|secret/i)
    assert.ok(
      Buffer.byteLength(forward, 'utf8') <
        CHEAP_LFS_CLONE_INVENTORY_MAXIMUM_BYTES
    )
  })

  it('emits one Windows and one Linux command whose wrappers share the Node runtime', () => {
    const bundle = renderCheapLfsCloneHelperBundle([rawReleaseEntry()])

    assert.match(
      bundle['README.md'],
      /powershell -NoProfile -ExecutionPolicy Bypass -File "\.\\\.desktop-material\\cheap-lfs\\hydrate\.ps1"/
    )
    assert.match(
      bundle['README.md'],
      /sh \.\/\.desktop-material\/cheap-lfs\/hydrate\.sh/
    )
    assert.match(
      bundle['hydrate.ps1'],
      /& node \(Join-Path \$scriptDirectory 'hydrate\.mjs'\) @args/
    )
    assert.match(
      bundle['hydrate.sh'],
      /exec node "\$script_dir\/hydrate\.mjs" "\$@"/
    )
    assert.doesNotMatch(
      bundle['hydrate.ps1'] + bundle['hydrate.sh'],
      /curl|Invoke-Expression|\beval\b/i
    )
    assert.match(bundle['hydrate.mjs'], /shell: false/)
    assert.doesNotMatch(
      bundle['hydrate.mjs'],
      /shell: true|GH_TOKEN.*arguments/
    )
  })

  it('returns explicit no-op, create, unchanged, update, and foreign-conflict results', async t => {
    const root = await fixture(t)
    const first = rawReleaseEntry()

    assert.deepEqual(
      await ensureCheapLfsCloneHelperBundle({
        repositoryPath: root,
        enabled: false,
        entries: [first],
      }),
      {
        status: 'not-needed',
        reason: 'disabled',
        directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
      }
    )
    assert.deepEqual(
      await ensureCheapLfsCloneHelperBundle({
        repositoryPath: root,
        enabled: true,
        entries: [],
      }),
      {
        status: 'not-needed',
        reason: 'no-pointers',
        directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
      }
    )

    const created = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [first],
    })
    if (created.status !== 'created') {
      assert.fail(`expected created helper, received ${created.status}`)
    }
    assert.equal(created.created.length, 6)

    const unchanged = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [first],
    })
    if (unchanged.status !== 'unchanged') {
      assert.fail(`expected unchanged helper, received ${unchanged.status}`)
    }
    assert.equal(unchanged.unchanged.length, 6)

    const inventoryPath = join(
      root,
      '.desktop-material',
      'cheap-lfs',
      'inventory.json'
    )
    const previousInventory = await readFile(inventoryPath, 'utf8')
    const updated = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [rawReleaseEntry('assets/second.bin', Buffer.from('second'))],
    })
    assert.equal(updated.status, 'updated')
    assert.notEqual(await readFile(inventoryPath, 'utf8'), previousInventory)

    const emptied = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [],
    })
    assert.equal(emptied.status, 'updated')
    assert.deepEqual(
      JSON.parse(await readFile(inventoryPath, 'utf8')).assets,
      []
    )

    const readmePath = await realpath(
      join(root, '.desktop-material', 'cheap-lfs', 'README.md')
    )
    await writeFile(readmePath, '# User-owned helper\n')
    const beforeConflict = await readFile(inventoryPath, 'utf8')
    const conflict = await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [first],
    })
    assert.deepEqual(conflict, {
      status: 'conflict',
      directory: CHEAP_LFS_CLONE_HELPER_DIRECTORY,
      conflicts: [`${CHEAP_LFS_CLONE_HELPER_DIRECTORY}/README.md`],
    })
    assert.equal(await readFile(readmePath, 'utf8'), '# User-owned helper\n')
    assert.equal(await readFile(inventoryPath, 'utf8'), beforeConflict)
  })

  it('refuses unsafe paths, linked files, redirected directories, and oversized managed text', async t => {
    assert.throws(() =>
      renderCheapLfsCloneHelperInventory([rawReleaseEntry('../escape.bin')])
    )

    const linkedRoot = await fixture(t)
    await ensureCheapLfsCloneHelperBundle({
      repositoryPath: linkedRoot,
      enabled: true,
      entries: [rawReleaseEntry()],
    })
    const runtime = join(
      linkedRoot,
      '.desktop-material',
      'cheap-lfs',
      'hydrate.mjs'
    )
    await link(runtime, join(linkedRoot, 'linked-runtime.mjs'))
    await assert.rejects(
      ensureCheapLfsCloneHelperBundle({
        repositoryPath: linkedRoot,
        enabled: true,
        entries: [rawReleaseEntry()],
      }),
      /linked file/
    )

    const oversizedRoot = await fixture(t)
    await mkdir(join(oversizedRoot, '.desktop-material', 'cheap-lfs'), {
      recursive: true,
    })
    await writeFile(
      join(oversizedRoot, '.desktop-material', 'cheap-lfs', 'inventory.json'),
      `{\n  "managedBy": "${CHEAP_LFS_CLONE_HELPER_MANAGED_BY}",\n` +
        'x'.repeat(CHEAP_LFS_CLONE_HELPER_MAXIMUM_INVENTORY_BYTES)
    )
    await assert.rejects(
      ensureCheapLfsCloneHelperBundle({
        repositoryPath: oversizedRoot,
        enabled: true,
        entries: [rawReleaseEntry()],
      }),
      /oversized/
    )

    const redirectedRoot = await fixture(t)
    const outside = await fixture(t)
    try {
      await symlink(
        outside,
        join(redirectedRoot, '.desktop-material'),
        process.platform === 'win32' ? 'junction' : 'dir'
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }
    await assert.rejects(
      ensureCheapLfsCloneHelperBundle({
        repositoryPath: redirectedRoot,
        enabled: true,
        entries: [rawReleaseEntry()],
      }),
      /symlink|junction|redirected/
    )
  })

  it('detects a concurrent managed-file rewrite and preserves the new occupant', async t => {
    const root = await fixture(t)
    const first = rawReleaseEntry()
    await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [first],
    })
    const inventoryPath = await realpath(
      join(root, '.desktop-material', 'cheap-lfs', 'inventory.json')
    )
    let raced = false
    const store = new CheapLfsTrackedPathStore({
      beforeQuarantine: async proof => {
        if (!raced && proof.absolutePath === inventoryPath) {
          raced = true
          await writeFile(inventoryPath, 'concurrent occupant\n')
        }
      },
    })
    const generator = new CheapLfsCloneHelperBundleGenerator(store)

    await assert.rejects(
      generator.ensure({
        repositoryPath: root,
        enabled: true,
        entries: [
          rawReleaseEntry('assets/changed.bin', Buffer.from('changed')),
        ],
      }),
      /changed/
    )
    assert.equal(await readFile(inventoryPath, 'utf8'), 'concurrent occupant\n')
  })
})

describe('generated Cheap LFS hydration runtime', () => {
  it('hydrates raw multipart and deflate parts, but preserves the pointer after failed verification', async t => {
    const root = await fixture(t)
    const trackedName = `${'w'.repeat(196)}.bin`
    assert.equal(trackedName.length, 200)
    const rawPart = Buffer.from('raw-prefix-')
    const deflatedPart = Buffer.from('compress-me-'.repeat(80))
    const storedDeflate = deflateRawSync(deflatedPart)
    const whole = Buffer.concat([rawPart, deflatedPart])
    const pointer: ICheapLfsPointer = {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'cheap-lfs-assets',
      assetName: 'whole.bin',
      sizeInBytes: whole.length,
      sha256: sha256(whole),
      parts: [
        {
          name: 'raw.part',
          sizeInBytes: rawPart.length,
          sha256: sha256(rawPart),
        },
        {
          name: 'deflated.part',
          sizeInBytes: deflatedPart.length,
          deflatedSizeInBytes: storedDeflate.length,
          sha256: sha256(deflatedPart),
        },
      ],
    }
    const entry: CheapLfsCloneHelperEntry = {
      kind: 'release',
      relativePath: `assets/${trackedName}`,
      pointer,
    }
    await mkdir(join(root, 'assets'))
    const trackedPath = join(root, 'assets', trackedName)
    const pointerText = serializeCheapLfsPointer(pointer)
    await writeFile(trackedPath, pointerText)
    await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [entry],
    })

    const fakeGh = join(root, 'fake-gh.mjs')
    const argvLog = join(root, 'gh-argv.jsonl')
    await writeFile(
      fakeGh,
      `import { appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_GH_ARGV_LOG, JSON.stringify(args) + '\\n')
const assets = JSON.parse(process.env.FAKE_GH_ASSETS_JSON)
if (args[0] === 'repo' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ nameWithOwner: 'owner/repository' }))
} else if (args[0] === 'api' && args[1].includes('/releases/tags/')) {
  process.stdout.write(JSON.stringify({
    assets: assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      size: Buffer.from(asset.bytes, 'base64').length,
    })),
  }))
} else if (args[0] === 'api' && args[1].includes('/releases/assets/')) {
  const id = Number(args[1].split('/').at(-1))
  const asset = assets.find(candidate => candidate.id === id)
  process.stdout.write(Buffer.from(asset.bytes, 'base64'))
} else {
  process.stderr.write('unexpected fake gh arguments')
  process.exitCode = 2
}
`
    )
    const runtime = join(root, '.desktop-material', 'cheap-lfs', 'hydrate.mjs')
    const baseAssets = [
      {
        id: 1,
        name: 'raw.part',
        bytes: rawPart.toString('base64'),
      },
      {
        id: 2,
        name: 'deflated.part',
        bytes: storedDeflate.toString('base64'),
      },
    ]
    const environment = {
      ...process.env,
      GH_TOKEN: 'test-secret-that-must-not-reach-argv',
      DESKTOP_MATERIAL_CHEAP_LFS_GH_EXECUTABLE: process.execPath,
      DESKTOP_MATERIAL_CHEAP_LFS_GH_PREFIX_ARGS_JSON: JSON.stringify([fakeGh]),
      FAKE_GH_ARGV_LOG: argvLog,
      FAKE_GH_ASSETS_JSON: JSON.stringify(baseAssets),
    }
    const wrongRaw = Buffer.alloc(rawPart.length, 0x78)
    const failed = await run(process.execPath, [runtime], root, {
      ...environment,
      FAKE_GH_ASSETS_JSON: JSON.stringify([
        { ...baseAssets[0], bytes: wrongRaw.toString('base64') },
        baseAssets[1],
      ]),
    })

    const failedArguments = await readFile(argvLog, 'utf8').catch(() => '')
    assert.notEqual(
      failed.code,
      0,
      JSON.stringify({ ...failed, arguments: failedArguments })
    )
    assert.match(failed.stderr, /failed exact size or SHA-256 verification/)
    assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
    assert.doesNotMatch(
      failed.stdout + failed.stderr,
      /test-secret-that-must-not-reach-argv/
    )

    const succeeded = await run(
      process.execPath,
      [runtime, '--path', `assets\\${trackedName}`],
      root,
      environment
    )
    assert.equal(succeeded.code, 0, succeeded.stderr)
    assert.deepEqual(await readFile(trackedPath), whole)
    assert.deepEqual(JSON.parse(succeeded.stdout).hydrated, [
      `assets/${trackedName}`,
    ])

    const repeated = await run(process.execPath, [runtime], root, environment)
    assert.equal(repeated.code, 0, repeated.stderr)
    assert.deepEqual(JSON.parse(repeated.stdout).alreadyHydrated, [
      `assets/${trackedName}`,
    ])
    const loggedArguments = (await readFile(argvLog, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as ReadonlyArray<string>)
    assert.ok(loggedArguments.length > 0)
    assert.ok(
      loggedArguments.every(argumentsForGh =>
        argumentsForGh.every(
          argument => !argument.includes('test-secret-that-must-not-reach-argv')
        )
      )
    )
  })

  it('fails closed on unsafe selections and gives an actionable OCI provider boundary', async t => {
    const root = await fixture(t)
    const entry = ociEntry()
    await mkdir(join(root, 'assets'))
    await writeFile(
      join(root, 'assets', 'registry.bin'),
      serializeCheapLfsGhcrPointer(
        (entry as { readonly pointer: ICheapLfsGhcrPointer }).pointer
      )
    )
    await ensureCheapLfsCloneHelperBundle({
      repositoryPath: root,
      enabled: true,
      entries: [entry],
    })
    const runtime = join(root, '.desktop-material', 'cheap-lfs', 'hydrate.mjs')

    const unsafe = await run(
      process.execPath,
      [runtime, '--path', '../escape.bin'],
      root
    )
    assert.notEqual(unsafe.code, 0)
    assert.match(unsafe.stderr, /does not contain selected path/)

    const unsupported = await run(process.execPath, [runtime], root)
    assert.notEqual(unsupported.code, 0)
    assert.match(
      unsupported.stderr,
      /does not support Cheap LFS ghcr OCI pointers/
    )
    assert.match(unsupported.stderr, /Open this repository in Desktop Material/)
    assert.match(unsupported.stderr, /immutable manifest/)
  })
})
