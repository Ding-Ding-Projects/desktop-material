import assert from 'node:assert'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, it, mock } from 'node:test'
import type { IStashEntry } from '../../../src/models/stash-entry'
import { StashedChangesLoadStates } from '../../../src/models/stash-entry'
import type { Repository } from '../../../src/models/repository'
import type {
  IStashExportRequest,
  IStashSevenZipOptions,
  StashExportFormat,
} from '../../../src/lib/git/stash-export'

interface IExecOptions {
  readonly signal?: AbortSignal
}

type ArchiveRunner = (
  executable: string,
  args: ReadonlyArray<string>,
  options: IExecOptions
) => Promise<{ stdout: string; stderr: string }>

let archiveRunner: ArchiveRunner = async () => ({ stdout: '', stderr: '' })

mock.module('../../../src/lib/exec-file', {
  namedExports: {
    execFile: (
      executable: string,
      args: ReadonlyArray<string>,
      options: IExecOptions
    ) => archiveRunner(executable, args, options),
  },
})

mock.module('../../../src/lib/git/core', {
  namedExports: {
    git: async (args: ReadonlyArray<string>) => {
      const output = args.find(argument => argument.startsWith('--output='))
      assert.ok(output, 'git archive must name its output path')
      await writeFile(output.slice('--output='.length), '')
    },
  },
})

class EmptyZipFile extends EventEmitter {
  public readEntry(): void {
    queueMicrotask(() => this.emit('end'))
  }

  public close(): void {}
}

const require = createRequire(import.meta.url)

mock.module(pathToFileURL(require.resolve('yauzl')).href, {
  namedExports: {
    fromFd: (
      _fd: number,
      _options: unknown,
      callback: (error: Error | null, zip: EmptyZipFile) => void
    ) => callback(null, new EmptyZipFile()),
  },
})

const sevenZip: IStashSevenZipOptions = {
  method: 'LZMA2',
  level: 5,
  dictionary: '16m',
  matchFinder: 'BT4',
  fastBytes: 64,
  solid: true,
  threads: '2',
  splitVolumes: '',
  encryptHeaders: false,
}

const entry: IStashEntry = {
  name: 'refs/stash@{0}',
  branchName: 'main',
  stashSha: 'a'.repeat(40),
  files: { kind: StashedChangesLoadStates.NotLoaded },
  tree: 'b'.repeat(40),
  parents: [],
}

describe('git/stash-export archive cancellation', () => {
  it('forwards cancellation to ZIP and 7z archive processes and cannot report success after abort', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'stash-export-cancel-'))
    const previousProgramFiles = process.env.ProgramFiles
    t.after(async () => {
      archiveRunner = async () => ({ stdout: '', stderr: '' })
      if (previousProgramFiles === undefined) {
        delete process.env.ProgramFiles
      } else {
        process.env.ProgramFiles = previousProgramFiles
      }
      await rm(directory, { recursive: true, force: true })
    })

    const sevenZipDirectory = join(directory, '7-Zip')
    await mkdir(sevenZipDirectory)
    await writeFile(join(sevenZipDirectory, '7z.exe'), '')
    process.env.ProgramFiles = directory

    const { exportStashes } = await import('../../../src/lib/git/stash-export')
    const formats: ReadonlyArray<StashExportFormat> = ['zip', '7z']

    for (const format of formats) {
      const controller = new AbortController()
      let forwardedSignal: AbortSignal | undefined
      archiveRunner = async (_executable, _args, options) => {
        forwardedSignal = options.signal
        controller.abort()
        return { stdout: '', stderr: '' }
      }
      const destination = join(directory, `stashes.${format}`)
      const request: IStashExportRequest = {
        repository: { path: directory } as Repository,
        entries: [entry],
        format,
        destination,
        sevenZip: format === '7z' ? sevenZip : undefined,
        signal: controller.signal,
      }

      await assert.rejects(exportStashes(request), /Stash export cancelled/)
      assert.strictEqual(forwardedSignal, controller.signal)
      await assert.rejects(access(destination))
    }
  })
})
