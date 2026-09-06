import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

import {
  clone,
  createCloneProcessAbortHandler,
  ICloneProgressContext,
  isClonePathSensitive,
  mapCloneProgressEvent,
} from '../../../src/lib/git/clone'
import { SubmoduleFetchStage } from '../../../src/models/progress'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'
import { exec } from 'dugite'
import { git } from '../../../src/lib/git'

async function createEmptyBareRepository(
  t: import('node:test').TestContext
): Promise<string> {
  const bareParentPath = await createTempDirectory(t)
  const barePath = path.join(bareParentPath, 'remote.git')
  await git(['init', '--bare', barePath], bareParentPath, 'initBareRepository')
  return barePath
}

describe('git/clone', () => {
  it('identifies home and credential-sensitive destinations without rejecting normal children', async () => {
    const os = await import('os')
    const home = os.homedir()
    assert.equal(isClonePathSensitive(home), true)
    assert.equal(isClonePathSensitive(path.join(home, '.ssh', 'clone')), true)
    assert.equal(
      isClonePathSensitive(path.join(home, '.git-credentials')),
      true
    )
    assert.equal(
      isClonePathSensitive(path.join(home, '.config', 'git', 'clone')),
      true
    )
    assert.equal(
      isClonePathSensitive(path.join(home, 'Documents', 'GitHub', 'clone')),
      false
    )
    const caseVariantHome = path.join(
      path.dirname(home),
      path.basename(home).toLocaleUpperCase('en-US')
    )
    assert.equal(
      isClonePathSensitive(path.join(caseVariantHome, '.ssh', 'clone')),
      process.platform === 'win32'
    )
  })

  it('rejects a sensitive destination before starting Git', async () => {
    const os = await import('os')
    const destination = path.join(os.homedir(), '.ssh', 'clone')

    await assert.rejects(
      () => clone('https://example.com/repo.git', destination, {}),
      (error: unknown) =>
        error instanceof Error &&
        /sensitive system location/i.test(error.message) &&
        /Choose another folder and try again/i.test(error.message)
    )
  })

  it('covers configured credential roots while permitting local temporary clones', async () => {
    const os = await import('os')
    const previous = {
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      SystemRoot: process.env.SystemRoot,
    }
    const fixture = path.join(os.tmpdir(), 'desktop-material-clone-policy')
    const roaming = path.join(fixture, 'roaming')
    const local = path.join(fixture, 'local')
    const xdg = path.join(fixture, 'xdg')
    process.env.APPDATA = roaming
    process.env.LOCALAPPDATA = local
    process.env.XDG_CONFIG_HOME = xdg
    process.env.SystemRoot = path.join(fixture, 'system-root')

    try {
      assert.equal(isClonePathSensitive(path.join(roaming, 'clone')), true)
      assert.equal(isClonePathSensitive(path.join(xdg, 'clone')), true)
      if (process.platform === 'win32') {
        assert.equal(
          isClonePathSensitive(path.join(fixture, 'system-root', 'clone')),
          true
        )
      }
      assert.equal(
        isClonePathSensitive(path.join(local, 'Credentials', 'clone')),
        true
      )
      assert.equal(
        isClonePathSensitive(path.join(local, 'Microsoft', 'Vault', 'clone')),
        true
      )
      assert.equal(isClonePathSensitive(local), true)
      assert.equal(
        isClonePathSensitive(path.join(local, 'Temp', 'clone')),
        false
      )
      assert.equal(isClonePathSensitive(path.parse(os.homedir()).root), true)
      assert.equal(
        isClonePathSensitive(path.join(path.parse(os.homedir()).root, 'clone')),
        false
      )
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('owns an abort which arrives before Dugite exposes the process', async () => {
    const controller = new AbortController()
    const child = new EventEmitter() as ChildProcess
    let terminated: ChildProcess | null = null
    const abort = createCloneProcessAbortHandler(controller.signal, async p => {
      terminated = p
    })

    controller.abort()
    abort.processCallback(undefined)(child)
    await abort.abortAndWait()

    assert.equal(terminated, child)
  })

  it('keeps clone cancellation behind the full termination barrier', async () => {
    const controller = new AbortController()
    const child = new EventEmitter() as ChildProcess
    let releaseTermination: () => void = () => {}
    const termination = new Promise<void>(resolve => {
      releaseTermination = resolve
    })
    const abort = createCloneProcessAbortHandler(
      controller.signal,
      async () => await termination
    )
    abort.processCallback(undefined)(child)

    controller.abort()
    let settled = false
    const waiting = abort.abortAndWait().then(() => {
      settled = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(settled, false)

    releaseTermination()
    await waiting
    assert.equal(settled, true)
  })

  it('terminates the owned process when progress setup throws', async () => {
    const controller = new AbortController()
    const child = new EventEmitter() as ChildProcess
    const progressError = new Error('progress callback failed')
    let terminated = false
    const abort = createCloneProcessAbortHandler(
      controller.signal,
      async () => {
        terminated = true
      }
    )
    const callback = abort.processCallback(() => {
      throw progressError
    })

    assert.throws(
      () => callback(child),
      error => error === progressError
    )
    await abort.waitForTermination()
    assert.equal(terminated, true)
  })

  it('clones a local repository', async t => {
    // Create a source repo with a commit
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, {})

    assert.equal(existsSync(path.join(clonePath, '.git')), true)
    assert.equal(existsSync(path.join(clonePath, 'README.md')), true)
  })

  it('enables persisted long paths while checking out a Windows clone', async t => {
    if (process.platform !== 'win32') {
      t.skip('Long-path checkout is scoped to Windows.')
      return
    }

    const source = await setupEmptyRepository(t)
    const nestedDirectory = path.join(
      ...Array.from({ length: 7 }, (_, index) =>
        `nested-${index}`.padEnd(20, 'x')
      )
    )
    const relativePath = path.join(nestedDirectory, 'checked-out-file.txt')
    const sourceFile = path.join(source.path, relativePath)
    await mkdir(path.dirname(sourceFile), { recursive: true })
    await writeFile(sourceFile, 'long path')
    await exec(['config', 'core.longpaths', 'true'], source.path)
    await exec(['add', relativePath], source.path)
    await exec(['commit', '-m', 'long path fixture'], source.path)

    const destinationRoot = await createTempDirectory(t)
    const cloneParent = path.join(
      destinationRoot,
      ...Array.from({ length: 2 }, (_, index) =>
        `clone-${index}`.padEnd(20, 'y')
      )
    )
    await mkdir(cloneParent, { recursive: true })
    const clonePath = path.join(cloneParent, 'clone')
    assert.ok(path.join(clonePath, relativePath).length > 260)

    await clone(source.path, clonePath, {})

    assert.equal(existsSync(path.join(clonePath, relativePath)), true)
    const configured = await exec(
      ['config', '--local', '--get', 'core.longpaths'],
      clonePath
    )
    assert.equal(configured.stdout.trim(), 'true')
  })

  it('clones with a specific branch', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    // Create a feature branch on the source
    await exec(['branch', 'feature'], source.path)
    await exec(['checkout', 'feature'], source.path)
    await makeCommit(source, {
      entries: [{ path: 'feature.txt', contents: 'feature' }],
      commitMessage: 'feature commit',
    })
    await exec(['checkout', 'master'], source.path)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, { branch: 'feature' })

    // Verify the feature branch was checked out
    const result = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'feature')
    assert.equal(existsSync(path.join(clonePath, 'feature.txt')), true)
  })

  it('reports progress when callback is provided', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    const progressEvents: Array<{ kind: string }> = []
    await clone(source.path, clonePath, {}, progress => {
      progressEvents.push({ kind: progress.kind })
    })

    assert.ok(progressEvents.length > 0, 'Expected at least one progress event')
    assert.equal(progressEvents[0].kind, 'clone')
  })

  describe('mapCloneProgressEvent', () => {
    const title = 'Cloning into /tmp/repo'
    const freshContext = (): ICloneProgressContext => ({
      sawProgress: false,
      inSubmodulePhase: false,
    })

    it('surfaces the stage, within-stage fraction, and transfer speed', () => {
      const progress = mapCloneProgressEvent(
        {
          kind: 'progress',
          percent: 0.5,
          details: {
            title: 'Receiving objects',
            value: 50,
            total: 100,
            percent: 50,
            done: false,
            text: 'Receiving objects:  50% (50/100), 3.30 MiB | 1.29 MiB/s',
            bytesPerSecond: 1.29 * 1024 ** 2,
          },
        },
        title,
        freshContext()
      )

      assert.equal(progress.kind, 'clone')
      assert.equal(progress.stage, 'Receiving objects')
      assert.equal(progress.stagePercent, 0.5)
      assert.equal(progress.value, 0.5)
      assert.equal(progress.speedBytesPerSecond, 1.29 * 1024 ** 2)
      assert.equal(
        progress.description,
        'Receiving objects:  50% (50/100), 3.30 MiB | 1.29 MiB/s'
      )
    })

    it('ignores the main clone opening line before any progress', () => {
      const context = freshContext()
      const progress = mapCloneProgressEvent(
        { kind: 'context', percent: 0, text: "Cloning into 'repo'..." },
        title,
        context
      )

      assert.equal(context.inSubmodulePhase, false)
      assert.equal(progress.stage, undefined)
    })

    it('enters the submodule-fetch phase after the main clone', () => {
      const context = freshContext()

      // A recognized progress step precedes the submodule clone line.
      mapCloneProgressEvent(
        {
          kind: 'progress',
          percent: 1,
          details: {
            title: 'Checking out files',
            value: 10,
            total: 10,
            percent: 100,
            done: true,
            text: 'Checking out files: 100% (10/10), done',
          },
        },
        title,
        context
      )

      const submodule = mapCloneProgressEvent(
        { kind: 'context', percent: 1, text: "Cloning into 'vendor/dep'..." },
        title,
        context
      )
      assert.equal(context.inSubmodulePhase, true)
      assert.equal(submodule.stage, SubmoduleFetchStage)

      // Subsequent context lines stay in the submodule phase.
      const follow = mapCloneProgressEvent(
        { kind: 'context', percent: 1, text: 'Receiving objects: 100% (5/5)' },
        title,
        context
      )
      assert.equal(follow.stage, SubmoduleFetchStage)
    })
  })

  it('clones with a custom default branch name', async t => {
    // init.defaultBranch only takes effect when the remote's unborn HEAD
    // branch name is not advertised (protocol v0/v1). Force protocol v0
    // so we can verify the option actually drives the result, rather than
    // having the remote's initial-branch setting do the work.
    const savedGitConfigParams = process.env['GIT_CONFIG_PARAMETERS']
    process.env['GIT_CONFIG_PARAMETERS'] = "'protocol.version=0'"
    t.after(() => {
      if (savedGitConfigParams === undefined) {
        delete process.env['GIT_CONFIG_PARAMETERS']
      } else {
        process.env['GIT_CONFIG_PARAMETERS'] = savedGitConfigParams
      }
    })

    // Bare repo defaults to 'master' — clone must use defaultBranch to get 'trunk'
    const source = await createEmptyBareRepository(t)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source, clonePath, { defaultBranch: 'trunk' })

    assert.equal(existsSync(path.join(clonePath, '.git')), true)

    const result = await exec(['symbolic-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'refs/heads/trunk')
  })
})
