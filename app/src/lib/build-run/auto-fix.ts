import { BuildRunEcosystem, BuildStageKind, ICommand } from './types'

/**
 * Pure, bounded output-driven auto-fix.
 *
 * {@link planRemediation} inspects the tail of a failed command's output and
 * proposes remediation {@link ICommand}s to run before re-attempting the
 * stage. It never mutates state and never spawns anything itself — the runner
 * owns execution and the retry loop.
 *
 * Two families of fixes are proposed:
 *
 *   - ecosystem-specific repairs (relax npm peer deps, switch to the package
 *     manager whose lockfile is present, create a Python venv, delete a locked
 *     `node_modules`);
 *   - missing-dependency recovery for every ecosystem with a dependency
 *     manager: when a build or run stage fails because packages were never
 *     fetched (or went stale), the profile's install commands — or a sensible
 *     ecosystem default — run as pre-steps before the stage is retried.
 */

/** A remediation the runner should apply before re-running the failed stage. */
export interface IRemediation {
  /**
   * The commands to run, in order. With `replacesStage` unset they run as
   * pre-steps and the original stage command is re-run afterwards; an empty
   * array therefore means "just retry the stage" (used for transient
   * resolver/network failures).
   */
  readonly commands: ReadonlyArray<ICommand>
  /** Human-readable note echoed as a `meta` line before the fix runs. */
  readonly note: string
  /**
   * When true the remediation replaces the failed stage command for the
   * retry; such remediations always carry exactly one command.
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

/** The profile's install commands, or the given ecosystem default. */
function installOr(
  installCommands: ReadonlyArray<ICommand>,
  fallback: ICommand
): ReadonlyArray<ICommand> {
  return installCommands.length > 0 ? installCommands : [fallback]
}

function planNodeRemediation(
  stage: BuildStageKind,
  outputTail: string,
  flags: IRemediationFlags,
  installCommands: ReadonlyArray<ICommand>
): IRemediation | null {
  // Peer-dependency resolution conflict → relax peer deps.
  if (/ERESOLVE/.test(outputTail) || /peer dep/i.test(outputTail)) {
    return {
      commands: [cmd('npm', ['install', '--legacy-peer-deps'])],
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
        commands: [cmd('yarn', ['install'])],
        note: 'npm ci needs a package-lock.json, but a yarn.lock is present — switching to yarn install.',
        replacesStage: true,
      }
    }
    if (flags.hasPnpmLock) {
      return {
        commands: [cmd('pnpm', ['install'])],
        note: 'npm ci needs a package-lock.json, but a pnpm-lock.yaml is present — switching to pnpm install.',
        replacesStage: true,
      }
    }
  }

  // Locked / stale node_modules → remove it, then the stage reinstalls.
  if (/\b(EPERM|EBUSY|EEXIST)\b/.test(outputTail)) {
    return {
      commands: [deleteNodeModules()],
      note: 'A locked or stale node_modules was detected — deleting it before reinstalling.',
    }
  }

  // A build or run that can't resolve packages means deps were never
  // installed (or are stale) — install, then retry the stage.
  const missingModule =
    /Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND|Module not found/i.test(
      outputTail
    )
  if (stage !== 'install' && missingModule) {
    return {
      commands: installOr(installCommands, cmd('npm', ['install'])),
      note: 'Missing npm dependencies detected — installing them before retrying.',
    }
  }

  return null
}

function planPythonRemediation(
  stage: BuildStageKind,
  outputTail: string,
  flags: IRemediationFlags,
  installCommands: ReadonlyArray<ICommand>
): IRemediation | null {
  // A missing import at build/run time → (re-)install the dependencies.
  const missingModule = /ModuleNotFoundError|No module named/.test(outputTail)
  if (stage !== 'install' && missingModule && installCommands.length > 0) {
    return {
      commands: installCommands,
      note: 'Missing Python dependencies detected — installing them before retrying.',
    }
  }

  if (stage !== 'install') {
    return null
  }

  const needsVenv =
    /externally-managed-environment/i.test(outputTail) ||
    /No module named venv/i.test(outputTail) ||
    !flags.hasVenv
  if (needsVenv) {
    return {
      commands: [cmd('python', ['-m', 'venv', '.venv'], 'create .venv')],
      note: 'Installing into a virtual environment — creating .venv before reinstalling.',
    }
  }
  return null
}

/** A missing-dependency signature and how to recover from it. */
interface IDependencyRule {
  readonly pattern: RegExp
  readonly commands: (
    installCommands: ReadonlyArray<ICommand>
  ) => ReadonlyArray<ICommand>
  readonly note: string
}

/**
 * Missing-dependency signatures per ecosystem. Patterns deliberately include
 * the fix each toolchain suggests in its own error output (e.g. Elixir prints
 * "mix deps.get", Dart prints "pub get"), which keeps them precise across
 * toolchain versions.
 */
const DEPENDENCY_RULES: Partial<Record<BuildRunEcosystem, IDependencyRule>> = {
  go: {
    // `go mod download` fails on the same missing go.sum entries, so tidy is
    // the correct recovery regardless of what the install stage runs.
    pattern:
      /missing go\.sum entry|no required module provides|cannot find module|updates to go\.mod needed/i,
    commands: () => [cmd('go', ['mod', 'tidy'])],
    note: 'Missing Go module requirements detected — running go mod tidy before retrying.',
  },
  rust: {
    pattern:
      /can't find crate|failed to load source for dependency|no matching package|failed to download/i,
    commands: install => installOr(install, cmd('cargo', ['fetch'])),
    note: 'Missing crates detected — fetching dependencies before retrying.',
  },
  dotnet: {
    pattern: /NU1101|NETSDK1004|NuGet package restore|project\.assets\.json/i,
    commands: install => installOr(install, cmd('dotnet', ['restore'])),
    note: 'Missing NuGet packages detected — restoring before retrying.',
  },
  java: {
    // Gradle/Maven resolve dependencies inside the build itself; a resolution
    // failure is usually transient, so retry the stage without pre-steps.
    pattern: /Could not resolve|Could not find artifact|Could not GET/i,
    commands: () => [],
    note: 'Dependency resolution failed — retrying the build.',
  },
  php: {
    pattern:
      /vendor\/autoload\.php|composer install|Class ["'][\w\\]+["'] not found/i,
    commands: install => installOr(install, cmd('composer', ['install'])),
    note: 'Missing Composer packages detected — installing them before retrying.',
  },
  ruby: {
    pattern:
      /Bundler::GemNotFound|Could not find .+ in (?:any of the sources|locally installed gems)|bundle install/i,
    commands: install => installOr(install, cmd('bundle', ['install'])),
    note: 'Missing gems detected — running bundle install before retrying.',
  },
  elixir: {
    pattern: /Unchecked dependencies|could not find dependency|mix deps\.get/i,
    commands: install => installOr(install, cmd('mix', ['deps.get'])),
    note: 'Missing Hex dependencies detected — running mix deps.get before retrying.',
  },
  dart: {
    pattern: /pub get|Target of URI doesn't exist: 'package:/i,
    commands: install => installOr(install, cmd('dart', ['pub', 'get'])),
    note: 'Missing pub packages detected — running pub get before retrying.',
  },
  swift: {
    pattern: /missing package|could not find package|unknown package/i,
    commands: install =>
      installOr(install, cmd('swift', ['package', 'resolve'])),
    note: 'Missing Swift packages detected — resolving them before retrying.',
  },
  scala: {
    pattern: /ResolveException|unresolved dependency|Error downloading/i,
    commands: install => installOr(install, cmd('sbt', ['update'])),
    note: 'Missing sbt dependencies detected — running sbt update before retrying.',
  },
}

function planDependencyRemediation(
  stage: BuildStageKind,
  ecosystem: BuildRunEcosystem,
  outputTail: string,
  installCommands: ReadonlyArray<ICommand>
): IRemediation | null {
  // The install stage failing with these signatures is the failure itself,
  // not something a re-install pre-step can repair.
  if (stage === 'install') {
    return null
  }
  const rule = DEPENDENCY_RULES[ecosystem]
  if (rule === undefined || !rule.pattern.test(outputTail)) {
    return null
  }
  return { commands: rule.commands(installCommands), note: rule.note }
}

/**
 * Propose a remediation for a failed stage, or `null` when none applies.
 *
 * Bounded to {@link MAX_ATTEMPTS} retries per stage. `attempt` is the number of
 * retries already made (0 on the first failure). `installCommands` is the
 * plan's install stage (empty when the profile has none) so missing-dependency
 * recovery re-runs exactly what the user's plan installs with. Command-not-found
 * failures deliberately yield no remediation — the runner surfaces the
 * toolchain hint (and auto-install) instead.
 */
export function planRemediation(
  stage: BuildStageKind,
  ecosystem: BuildRunEcosystem,
  outputTail: string,
  attempt: number,
  flags: IRemediationFlags,
  installCommands: ReadonlyArray<ICommand> = []
): IRemediation | null {
  if (attempt >= MAX_ATTEMPTS) {
    return null
  }

  switch (ecosystem) {
    case 'node':
      return planNodeRemediation(stage, outputTail, flags, installCommands)
    case 'python':
      return planPythonRemediation(stage, outputTail, flags, installCommands)
    default:
      // Every other dependency-managed ecosystem recovers through its
      // missing-dependency rule; zig/cmake/make/haskell/deno fetch nothing
      // (or self-manage), so they intentionally have no adaptive remediation.
      return planDependencyRemediation(
        stage,
        ecosystem,
        outputTail,
        installCommands
      )
  }
}
