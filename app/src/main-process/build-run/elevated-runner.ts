import { spawn } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import { mkdir, open, rm, stat, writeFile, readFile } from 'fs/promises'
import { pathExists } from '../../lib/path-exists'
import {
  BuildRunLogStream,
  BuildStageKind,
  IBuildRunPlan,
  ICommand,
} from '../../lib/build-run/types'

/**
 * Elevated (single-UAC) execution path.
 *
 * Because a medium-integrity process cannot stream from, or kill, a
 * high-integrity child, we bridge the integrity boundary with the filesystem:
 *
 *   os.tmpdir()/desktop-material/build-run/<runId>/
 *     manifest.json   argv-encoded commands (never string-concatenated)
 *     run.ps1         chain that appends to output.log, polls cancel.flag
 *     output.log      combined stream, tailed by this (medium) process
 *     exit.code       written last; its appearance is the terminal signal
 *     cancel.flag     written by us to request cancellation
 *
 * A single `Start-Process -Verb RunAs` triggers exactly one UAC prompt. The
 * elevated chain ships pre-expanded fallbacks (e.g. `npm ci` →
 * `npm install --legacy-peer-deps`) because adaptive, output-driven auto-fix is
 * only available in the non-elevated runner.
 */

/** The origin of a streamed elevated log line, forwarded to the runner. */
export interface IElevatedEmit {
  (
    stage: BuildStageKind | 'toolchain',
    stream: BuildRunLogStream,
    text: string
  ): void
}

/** Terminal outcome of an elevated chain. */
export interface IElevatedResult {
  readonly code: number
  readonly cancelled: boolean
}

/** A live elevated run the caller can await and cancel. */
export interface IElevatedRun {
  readonly whenDone: Promise<IElevatedResult>
  cancel(): void
}

/** The Windows exit code we use to mark a cancelled (Ctrl-C-equivalent) run. */
const CANCELLED_EXIT_CODE = 1223

/** How often (ms) we tail output.log and check for the exit sentinel. */
const POLL_INTERVAL_MS = 150

/** Markers the run.ps1 emits into output.log so we can type each line. */
const CMD_MARKER = '##DM-CMD##'
const META_MARKER = '##DM-META##'

/** One flattened, argv-encoded command in the elevated manifest. */
interface IManifestCommand {
  readonly kind: BuildStageKind
  readonly exe: string
  readonly args: ReadonlyArray<string>
  readonly label: string
  readonly fallback?: {
    readonly exe: string
    readonly args: ReadonlyArray<string>
    readonly label: string
  }
  readonly fallbackNote?: string
}

interface IManifest {
  readonly cwd: string
  readonly env: Record<string, string>
  readonly commands: ReadonlyArray<IManifestCommand>
}

function cmd(exe: string, args: ReadonlyArray<string>): ICommand {
  return { exe, args, label: `${exe} ${args.join(' ')}`.trim() }
}

/**
 * A pre-expanded fallback for the elevated chain, mirroring the intent of the
 * non-elevated auto-fix but decided up front (no live output to inspect).
 */
function elevatedFallback(
  ecosystem: string,
  stage: BuildStageKind,
  command: ICommand,
  flags: { hasYarnLock: boolean; hasPnpmLock: boolean }
): ICommand | null {
  if (ecosystem !== 'node' || stage !== 'install') {
    return null
  }
  const exe = command.exe.toLowerCase()
  const first = command.args[0]
  if (exe.startsWith('npm') && first === 'ci') {
    if (flags.hasYarnLock) {
      return cmd('yarn', ['install'])
    }
    if (flags.hasPnpmLock) {
      return cmd('pnpm', ['install'])
    }
    return cmd('npm', ['install', '--legacy-peer-deps'])
  }
  if (exe.startsWith('npm') && first === 'install') {
    return cmd('npm', ['install', '--legacy-peer-deps'])
  }
  return null
}

function buildManifest(plan: IBuildRunPlan): IManifest {
  const commands: IManifestCommand[] = []
  for (const stage of plan.stages) {
    for (const command of stage.commands) {
      const fb = elevatedFallback(plan.ecosystem, stage.kind, command, {
        hasYarnLock: plan.probeFlags.hasYarnLock,
        hasPnpmLock: plan.probeFlags.hasPnpmLock,
      })
      commands.push({
        kind: stage.kind,
        exe: command.exe,
        args: command.args,
        label: command.label,
        fallback: fb
          ? { exe: fb.exe, args: fb.args, label: fb.label }
          : undefined,
        fallbackNote: fb
          ? `First attempt failed — retrying with ${fb.label}.`
          : undefined,
      })
    }
  }
  return { cwd: plan.cwd, env: plan.env, commands }
}

/**
 * The PowerShell chain, parameterised only by our own temp-dir path. Repo
 * paths and commands are read from manifest.json at runtime — never
 * interpolated into this script text.
 */
function runScript(baseDir: string): string {
  // Escape single quotes for a PowerShell single-quoted string literal.
  const b = baseDir.replace(/'/g, "''")
  return [
    `$ErrorActionPreference = 'Continue'`,
    `$base = '${b}'`,
    `$log = Join-Path $base 'output.log'`,
    `$exitFile = Join-Path $base 'exit.code'`,
    `$cancel = Join-Path $base 'cancel.flag'`,
    `$manifest = Get-Content (Join-Path $base 'manifest.json') -Raw | ConvertFrom-Json`,
    `$final = 0`,
    `foreach ($c in $manifest.commands) {`,
    `  if (Test-Path $cancel) { $final = ${CANCELLED_EXIT_CODE}; break }`,
    `  Add-Content -Path $log -Value ('${CMD_MARKER}' + $c.kind + '|' + $c.label)`,
    `  Set-Location -LiteralPath $manifest.cwd`,
    `  $cargs = @(); if ($c.args) { $cargs = @($c.args) }`,
    `  & $c.exe @cargs *>> $log 2>&1`,
    `  $code = $LASTEXITCODE`,
    `  if ($code -ne 0 -and $c.fallback) {`,
    `    if (Test-Path $cancel) { $final = ${CANCELLED_EXIT_CODE}; break }`,
    `    Add-Content -Path $log -Value ('${META_MARKER}' + $c.kind + '|' + $c.fallbackNote)`,
    `    Add-Content -Path $log -Value ('${CMD_MARKER}' + $c.kind + '|' + $c.fallback.label)`,
    `    $fargs = @(); if ($c.fallback.args) { $fargs = @($c.fallback.args) }`,
    `    & $c.fallback.exe @fargs *>> $log 2>&1`,
    `    $code = $LASTEXITCODE`,
    `  }`,
    `  if ($null -eq $code) { $code = 0 }`,
    `  if ($code -ne 0) { $final = $code; break }`,
    `}`,
    `Set-Content -Path $exitFile -Value ([string]$final)`,
    ``,
  ].join('\r\n')
}

/** Parse one output.log line into a typed emit, given the current stage. */
function parseLine(
  line: string,
  current: BuildStageKind | 'toolchain'
): {
  stage: BuildStageKind | 'toolchain'
  stream: BuildRunLogStream
  text: string
} {
  if (line.startsWith(CMD_MARKER)) {
    const [kind, ...rest] = line.slice(CMD_MARKER.length).split('|')
    return {
      stage: kind as BuildStageKind,
      stream: 'command',
      text: rest.join('|'),
    }
  }
  if (line.startsWith(META_MARKER)) {
    const [kind, ...rest] = line.slice(META_MARKER.length).split('|')
    return {
      stage: kind as BuildStageKind,
      stream: 'meta',
      text: rest.join('|'),
    }
  }
  return { stage: current, stream: 'stdout', text: line }
}

/** Read bytes appended to `file` since `offset`; returns text + new offset. */
async function readFrom(
  file: string,
  offset: number
): Promise<{ text: string; offset: number }> {
  let size = 0
  try {
    size = (await stat(file)).size
  } catch {
    return { text: '', offset }
  }
  if (size <= offset) {
    return { text: '', offset }
  }
  const length = size - offset
  const buffer = Buffer.alloc(length)
  let handle
  try {
    handle = await open(file, 'r')
    await handle.read(buffer, 0, length, offset)
  } catch {
    return { text: '', offset }
  } finally {
    await handle?.close().catch(() => {})
  }
  return { text: buffer.toString('utf8'), offset: size }
}

/**
 * Launch a plan under UAC and stream its progress. Windows-only; on other
 * platforms it resolves immediately as a failure with an explanatory line.
 */
export function startElevatedRun(
  plan: IBuildRunPlan,
  emit: IElevatedEmit
): IElevatedRun {
  if (process.platform !== 'win32') {
    emit(
      'toolchain',
      'meta',
      'Pre-elevated Build & Run is only supported on Windows.'
    )
    return {
      whenDone: Promise.resolve({ code: 1, cancelled: false }),
      cancel: () => {},
    }
  }

  const baseDir = path.join(
    os.tmpdir(),
    'desktop-material',
    'build-run',
    plan.runId
  )
  const logFile = path.join(baseDir, 'output.log')
  const exitFile = path.join(baseDir, 'exit.code')
  const cancelFile = path.join(baseDir, 'cancel.flag')

  let settled = false
  let cancelRequested = false
  let currentStage: BuildStageKind | 'toolchain' = 'toolchain'
  let readOffset = 0
  let lineBuffer = ''
  let ticking = false
  let outerExited = false
  let pollTimer: NodeJS.Timeout | null = null

  const whenDone = new Promise<IElevatedResult>(resolve => {
    const emitLine = (line: string) => {
      const parsed = parseLine(line, currentStage)
      if (parsed.stream === 'command') {
        currentStage = parsed.stage
      }
      emit(parsed.stage, parsed.stream, parsed.text)
    }

    const pump = async () => {
      const { text, offset } = await readFrom(logFile, readOffset)
      readOffset = offset
      if (text.length === 0) {
        return
      }
      lineBuffer += text.replace(/\r\n/g, '\n')
      let idx = lineBuffer.indexOf('\n')
      while (idx !== -1) {
        emitLine(lineBuffer.slice(0, idx))
        lineBuffer = lineBuffer.slice(idx + 1)
        idx = lineBuffer.indexOf('\n')
      }
    }

    const finish = async (result: IElevatedResult) => {
      if (settled) {
        return
      }
      settled = true
      if (pollTimer !== null) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      // Drain any final bytes before tearing down.
      await pump()
      if (lineBuffer.length > 0) {
        emitLine(lineBuffer)
        lineBuffer = ''
      }
      await rm(baseDir, { recursive: true, force: true }).catch(err =>
        log.warn(`[build-run] failed to clean elevated temp dir`, err)
      )
      resolve(result)
    }

    const readExitCode = async (): Promise<number | null> => {
      if (!(await pathExists(exitFile))) {
        return null
      }
      try {
        const raw = (await readFile(exitFile, 'utf8')).trim()
        return parseInt(raw, 10) || 0
      } catch {
        return 1
      }
    }

    const tick = async () => {
      if (ticking || settled) {
        return
      }
      ticking = true
      try {
        await pump()

        const code = await readExitCode()
        if (code !== null) {
          await finish({
            code,
            cancelled: code === CANCELLED_EXIT_CODE || cancelRequested,
          })
          return
        }

        // The medium launcher exited but no exit.code appeared — UAC was
        // declined or the elevated process never started.
        if (outerExited && readOffset === 0 && !cancelRequested) {
          emit(
            'toolchain',
            'meta',
            'Elevation was declined or the elevated process failed to start.'
          )
          await finish({ code: 1, cancelled: false })
        }
      } finally {
        ticking = false
      }
    }

    const prepare = async () => {
      await mkdir(baseDir, { recursive: true })
      await writeFile(
        path.join(baseDir, 'manifest.json'),
        JSON.stringify(buildManifest(plan)),
        'utf8'
      )
      const scriptPath = path.join(baseDir, 'run.ps1')
      await writeFile(scriptPath, runScript(baseDir), 'utf8')
      // Seed the log so the tail has a file to read immediately.
      await writeFile(logFile, '', 'utf8')

      const inner =
        `Start-Process -FilePath 'powershell' -Verb RunAs -WindowStyle Hidden ` +
        `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','` +
        scriptPath.replace(/'/g, "''") +
        `')`
      const outer = spawn(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', inner],
        { windowsHide: true, shell: false }
      )
      outer.on('error', err => {
        emit(
          'toolchain',
          'meta',
          `Failed to launch elevated process: ${err.message}`
        )
        void finish({ code: 1, cancelled: false })
      })
      outer.on('exit', () => {
        outerExited = true
      })

      pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS)
    }

    prepare().catch(err => {
      emit(
        'toolchain',
        'meta',
        `Failed to prepare elevated run: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      void finish({ code: 1, cancelled: false })
    })
  })

  const cancel = () => {
    if (settled || cancelRequested) {
      return
    }
    cancelRequested = true
    void writeFile(cancelFile, '1', 'utf8').catch(err =>
      log.warn(`[build-run] failed to write elevated cancel flag`, err)
    )
  }

  return { whenDone, cancel }
}
