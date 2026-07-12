import { BuildRunEcosystem, BuildStageKind, ICommand } from './types'

/**
 * Pure, bounded output-driven auto-fix.
 *
 * {@link planRemediation} inspects the tail of a failed command's output and
 * proposes a single remediation {@link ICommand} to run before re-attempting
 * the stage. It never mutates state and never spawns anything itself — the
 * runner owns execution and the retry loop.
 */

/** A remediation the runner should apply before re-running the failed stage. */
export interface IRemediation {
  readonly command: ICommand
  /** Human-readable note echoed as a `meta` line before the fix runs. */
  readonly note: string
  /**
   * When true the remediation command replaces the failed stage command for
   * the retry; when false/absent it runs as a pre-step and the original stage
   * command is re-run afterwards.
   */
  readonly replacesStage?: boolean
}

/** Cheap probe flags the pure planner needs but can't derive from output. */
export interface IRemediationFlags {
  readonly hasYarnLock: boolean
  readonly hasPnpmLock: boolean
  readonly hasVenv: boolean
}

/** Maximum number of retries attempted per stage. */
const MAX_ATTEMPTS = 2

function cmd(
  exe: string,
  args: ReadonlyArray<string>,
  label?: string
): ICommand {
  return { exe, args, label: label ?? `${exe} ${args.join(' ')}`.trim() }
}

/** A cross-platform, dependency-free `node_modules` delete via `node -e`. */
function deleteNodeModules(): ICommand {
  return cmd(
    'node',
    ['-e', 'require("fs").rmSync("node_modules",{recursive:true,force:true})'],
    'delete node_modules'
  )
}

function planNodeRemediation(
  outputTail: string,
  flags: IRemediationFlags
): IRemediation | null {
  // Peer-dependency resolution conflict → relax peer deps.
  if (/ERESOLVE/.test(outputTail) || /peer dep/i.test(outputTail)) {
    return {
      command: cmd('npm', ['install', '--legacy-peer-deps']),
      note: 'Peer dependency conflict detected — retrying with npm install --legacy-peer-deps.',
      replacesStage: true,
    }
  }

  // `npm ci` requires a package-lock.json; switch to the present manager.
  const npmCiLockError =
    /npm ci/.test(outputTail) &&
    /(package-lock\.json|npm-shrinkwrap\.json|lock ?file)/i.test(outputTail)
  if (npmCiLockError) {
    if (flags.hasYarnLock) {
      return {
        command: cmd('yarn', ['install']),
        note: 'npm ci needs a package-lock.json, but a yarn.lock is present — switching to yarn install.',
        replacesStage: true,
      }
    }
    if (flags.hasPnpmLock) {
      return {
        command: cmd('pnpm', ['install']),
        note: 'npm ci needs a package-lock.json, but a pnpm-lock.yaml is present — switching to pnpm install.',
        replacesStage: true,
      }
    }
  }

  // Locked / stale node_modules → remove it, then the stage reinstalls.
  if (/\b(EPERM|EBUSY|EEXIST)\b/.test(outputTail)) {
    return {
      command: deleteNodeModules(),
      note: 'A locked or stale node_modules was detected — deleting it before reinstalling.',
    }
  }

  return null
}

function planPythonRemediation(
  outputTail: string,
  flags: IRemediationFlags
): IRemediation | null {
  const needsVenv =
    /externally-managed-environment/i.test(outputTail) ||
    /No module named venv/i.test(outputTail) ||
    !flags.hasVenv
  if (needsVenv) {
    return {
      command: cmd('python', ['-m', 'venv', '.venv'], 'create .venv'),
      note: 'Installing into a virtual environment — creating .venv before reinstalling.',
    }
  }
  return null
}

/**
 * Propose a remediation for a failed stage, or `null` when none applies.
 *
 * Bounded to {@link MAX_ATTEMPTS} retries per stage. `attempt` is the number of
 * retries already made (0 on the first failure). rust/go command-not-found
 * failures deliberately yield no remediation — the runner surfaces the
 * toolchain hint instead. Generic transient retries are the runner's concern.
 */
export function planRemediation(
  stage: BuildStageKind,
  ecosystem: BuildRunEcosystem,
  outputTail: string,
  attempt: number,
  flags: IRemediationFlags
): IRemediation | null {
  if (attempt >= MAX_ATTEMPTS) {
    return null
  }

  switch (ecosystem) {
    case 'node':
      return planNodeRemediation(outputTail, flags)
    case 'python':
      return planPythonRemediation(outputTail, flags)
    default:
      // rust/go/dotnet/java/make/cmake: no adaptive remediation. A missing
      // toolchain is reported via the profile's missingHint by the runner.
      return null
  }
}
