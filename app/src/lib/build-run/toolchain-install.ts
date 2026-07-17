import { BuildRunEcosystem, ICommand } from './types'

/**
 * Pure toolchain auto-install mapping.
 *
 * When a profile's toolchain probe fails (e.g. `node`, `cargo` or `mix` is not
 * on PATH) the runner can install the missing tool instead of just printing a
 * hint. {@link planToolchainInstall} maps the missing executable / ecosystem /
 * host platform to a concrete, argv-encoded install plan:
 *
 *   - on Windows, SDKs and build tools install via `winget` behind a single
 *     UAC prompt (`needsElevation: true`);
 *   - on macOS, the same tools install via Homebrew (`brew install`, never
 *     elevated — Homebrew refuses to run as root);
 *   - package managers that ride on an already-present runtime are provisioned
 *     the same way on every platform (including Linux) without elevation:
 *     `yarn` / `pnpm` via `corepack enable`, `pipenv` / `poetry` via `pip`,
 *     and Bundler via `gem`.
 *
 * The function is pure and platform-parameterised so it is fully unit-testable
 * and carries no Node/Electron dependencies. It returns `null` when there is no
 * safe, known install path (unknown tool, or an SDK on a host without a
 * supported system package manager).
 */

/** A single install step, echoed and executed by the runner. */
export interface IToolchainInstallStep {
  /** The argv-encoded command to run. */
  readonly command: ICommand
  /** Human-readable tool name for the "Installing …" panel line. */
  readonly toolLabel: string
  /** Whether this step must run elevated (single UAC via the elevated runner). */
  readonly needsElevation: boolean
}

/** An ordered install plan produced from a missing toolchain. */
export interface IToolchainInstallPlan {
  /** Steps in execution order; elevated steps are batched into one UAC prompt. */
  readonly steps: ReadonlyArray<IToolchainInstallStep>
}

function cmd(
  exe: string,
  args: ReadonlyArray<string>,
  label?: string
): ICommand {
  return { exe, args, label: label ?? `${exe} ${args.join(' ')}`.trim() }
}

/** A silent, non-interactive `winget install <id>` from the winget source. */
function winget(id: string): ICommand {
  return cmd(
    'winget',
    [
      'install',
      '--id',
      id,
      '-e',
      '--source',
      'winget',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ],
    `winget install ${id}`
  )
}

/** A `brew install <formula>` (or `brew install --cask <token>`). */
function brew(formula: string, cask: boolean): ICommand {
  const args = cask ? ['install', '--cask', formula] : ['install', formula]
  return cmd('brew', args, `brew install ${cask ? '--cask ' : ''}${formula}`)
}

/** Reduce an executable reference to a bare, lower-cased, extension-free name. */
function normalizeExe(exe: string): string {
  let e = exe.toLowerCase().replace(/\\/g, '/')
  const slash = e.lastIndexOf('/')
  if (slash !== -1) {
    e = e.slice(slash + 1)
  }
  return e.replace(/\.(exe|cmd|bat|ps1)$/, '')
}

/**
 * A package-manager tool that is provisioned through an already-present
 * runtime rather than a system package manager. These steps never need
 * elevation and work identically on every platform, so they are checked
 * before the per-platform SDK maps.
 */
function provisionedToolStep(
  name: string,
  platform: NodeJS.Platform
): IToolchainInstallStep | null {
  if (name === 'yarn' || name === 'pnpm') {
    return {
      command: cmd('corepack', ['enable'], 'corepack enable'),
      toolLabel:
        name === 'yarn' ? 'Yarn (via Corepack)' : 'pnpm (via Corepack)',
      needsElevation: false,
    }
  }

  if (name === 'pipenv' || name === 'poetry') {
    const python = platform === 'win32' ? 'python' : 'python3'
    return {
      command: cmd(
        python,
        ['-m', 'pip', 'install', '--user', name],
        `pip install ${name}`
      ),
      toolLabel: name === 'pipenv' ? 'Pipenv (via pip)' : 'Poetry (via pip)',
      needsElevation: false,
    }
  }

  if (name === 'bundle' || name === 'bundler') {
    return {
      command: cmd('gem', ['install', 'bundler'], 'gem install bundler'),
      toolLabel: 'Bundler (via gem)',
      needsElevation: false,
    }
  }

  return null
}

/** The winget package id + display name for a tool, if known. */
function wingetPackage(
  ecosystem: BuildRunEcosystem,
  exe: string
): { id: string; label: string } | null {
  switch (exe) {
    case 'node':
    case 'npm':
    case 'npx':
      return { id: 'OpenJS.NodeJS', label: 'Node.js' }
    case 'bun':
      return { id: 'Oven-sh.Bun', label: 'Bun' }
    case 'python':
    case 'python3':
    case 'py':
    case 'pip':
    case 'pip3':
      return { id: 'Python.Python.3.12', label: 'Python 3.12' }
    case 'go':
      return { id: 'GoLang.Go', label: 'Go' }
    case 'cargo':
    case 'rustc':
    case 'rustup':
      return { id: 'Rustlang.Rustup', label: 'Rust (rustup)' }
    case 'dotnet':
      return { id: 'Microsoft.DotNet.SDK.8', label: '.NET SDK 8' }
    case 'deno':
      return { id: 'DenoLand.Deno', label: 'Deno' }
    case 'java':
    case 'gradlew':
    case 'mvnw':
      // A wrapper that cannot run means the JDK itself is missing.
      return { id: 'EclipseAdoptium.Temurin.21.JDK', label: 'Temurin JDK 21' }
    case 'gradle':
      return { id: 'Gradle.Gradle', label: 'Gradle' }
    case 'mvn':
      return { id: 'Apache.Maven', label: 'Apache Maven' }
    case 'php':
      return { id: 'PHP.PHP.8.3', label: 'PHP 8.3' }
    case 'ruby':
    case 'gem':
      return {
        id: 'RubyInstallerTeam.RubyWithDevKit.3.2',
        label: 'Ruby 3.2 (with DevKit)',
      }
    case 'mix':
    case 'elixir':
    case 'iex':
      return { id: 'Elixir.Elixir', label: 'Elixir' }
    case 'sbt':
      return { id: 'sbt.sbt', label: 'sbt' }
    case 'swift':
      return { id: 'Swift.Toolchain', label: 'Swift toolchain' }
    case 'zig':
      return { id: 'zig.zig', label: 'Zig' }
    case 'cmake':
      return { id: 'Kitware.CMake', label: 'CMake' }
    case 'make':
      return { id: 'GnuWin32.Make', label: 'GNU Make' }
    default:
      break
  }

  // Fall back to the ecosystem when the executable name is unrecognised (for
  // example a project-scoped wrapper), so the common case still resolves.
  switch (ecosystem) {
    case 'node':
      return { id: 'OpenJS.NodeJS', label: 'Node.js' }
    case 'python':
      return { id: 'Python.Python.3.12', label: 'Python 3.12' }
    case 'go':
      return { id: 'GoLang.Go', label: 'Go' }
    case 'rust':
      return { id: 'Rustlang.Rustup', label: 'Rust (rustup)' }
    case 'dotnet':
      return { id: 'Microsoft.DotNet.SDK.8', label: '.NET SDK 8' }
    case 'deno':
      return { id: 'DenoLand.Deno', label: 'Deno' }
    case 'java':
      return { id: 'EclipseAdoptium.Temurin.21.JDK', label: 'Temurin JDK 21' }
    case 'php':
      return { id: 'PHP.PHP.8.3', label: 'PHP 8.3' }
    case 'ruby':
      return {
        id: 'RubyInstallerTeam.RubyWithDevKit.3.2',
        label: 'Ruby 3.2 (with DevKit)',
      }
    case 'elixir':
      return { id: 'Elixir.Elixir', label: 'Elixir' }
    case 'scala':
      return { id: 'sbt.sbt', label: 'sbt' }
    case 'swift':
      return { id: 'Swift.Toolchain', label: 'Swift toolchain' }
    case 'zig':
      return { id: 'zig.zig', label: 'Zig' }
    case 'cmake':
      return { id: 'Kitware.CMake', label: 'CMake' }
    case 'make':
      return { id: 'GnuWin32.Make', label: 'GNU Make' }
    default:
      // dart / flutter and the Haskell toolchain have no reliable winget path.
      return null
  }
}

/** The Homebrew formula/cask + display name for a tool, if known. */
function brewPackage(
  ecosystem: BuildRunEcosystem,
  exe: string
): { formula: string; label: string; cask?: boolean } | null {
  switch (exe) {
    case 'node':
    case 'npm':
    case 'npx':
      return { formula: 'node', label: 'Node.js' }
    case 'bun':
      return { formula: 'oven-sh/bun/bun', label: 'Bun' }
    case 'python':
    case 'python3':
    case 'py':
    case 'pip':
    case 'pip3':
      return { formula: 'python', label: 'Python 3' }
    case 'go':
      return { formula: 'go', label: 'Go' }
    case 'cargo':
    case 'rustc':
    case 'rustup':
      return { formula: 'rust', label: 'Rust' }
    case 'dotnet':
      return { formula: 'dotnet', label: '.NET SDK' }
    case 'deno':
      return { formula: 'deno', label: 'Deno' }
    case 'java':
    case 'gradlew':
    case 'mvnw':
      // The Temurin cask registers with /usr/libexec/java_home, so wrappers
      // and the stub /usr/bin/java both find it — unlike keg-only openjdk.
      return { formula: 'temurin', label: 'Temurin JDK', cask: true }
    case 'gradle':
      return { formula: 'gradle', label: 'Gradle' }
    case 'mvn':
      return { formula: 'maven', label: 'Apache Maven' }
    case 'php':
      return { formula: 'php', label: 'PHP' }
    case 'composer':
      return { formula: 'composer', label: 'Composer' }
    case 'ruby':
    case 'gem':
      return { formula: 'ruby', label: 'Ruby' }
    case 'dart':
      return { formula: 'dart-lang/dart/dart', label: 'Dart' }
    case 'flutter':
      return { formula: 'flutter', label: 'Flutter', cask: true }
    case 'mix':
    case 'elixir':
    case 'iex':
      return { formula: 'elixir', label: 'Elixir' }
    case 'sbt':
      return { formula: 'sbt', label: 'sbt' }
    case 'stack':
      return { formula: 'haskell-stack', label: 'Haskell Stack' }
    case 'cabal':
      return { formula: 'cabal-install', label: 'Cabal' }
    case 'ghc':
      return { formula: 'ghc', label: 'GHC' }
    case 'zig':
      return { formula: 'zig', label: 'Zig' }
    case 'cmake':
      return { formula: 'cmake', label: 'CMake' }
    case 'make':
      return { formula: 'make', label: 'GNU Make' }
    default:
      break
  }

  switch (ecosystem) {
    case 'node':
      return { formula: 'node', label: 'Node.js' }
    case 'python':
      return { formula: 'python', label: 'Python 3' }
    case 'go':
      return { formula: 'go', label: 'Go' }
    case 'rust':
      return { formula: 'rust', label: 'Rust' }
    case 'dotnet':
      return { formula: 'dotnet', label: '.NET SDK' }
    case 'deno':
      return { formula: 'deno', label: 'Deno' }
    case 'java':
      return { formula: 'temurin', label: 'Temurin JDK', cask: true }
    case 'php':
      return { formula: 'php', label: 'PHP' }
    case 'ruby':
      return { formula: 'ruby', label: 'Ruby' }
    case 'dart':
      return { formula: 'dart-lang/dart/dart', label: 'Dart' }
    case 'elixir':
      return { formula: 'elixir', label: 'Elixir' }
    case 'scala':
      return { formula: 'sbt', label: 'sbt' }
    case 'haskell':
      return { formula: 'haskell-stack', label: 'Haskell Stack' }
    case 'zig':
      return { formula: 'zig', label: 'Zig' }
    case 'cmake':
      return { formula: 'cmake', label: 'CMake' }
    case 'make':
      return { formula: 'make', label: 'GNU Make' }
    default:
      // Swift ships with the Xcode command-line tools on macOS.
      return null
  }
}

/**
 * Plan how to install the tool a failed toolchain probe was looking for.
 *
 * `exe` is the missing executable (e.g. the resolved package manager for Node),
 * `ecosystem` the profile's ecosystem, and `platform` the host. Returns an
 * ordered {@link IToolchainInstallPlan}, or `null` when no known, safe install
 * path exists for that tool on that host.
 */
export function planToolchainInstall(
  ecosystem: BuildRunEcosystem,
  exe: string,
  platform: NodeJS.Platform
): IToolchainInstallPlan | null {
  const name = normalizeExe(exe)

  // Runtime-provisioned package managers install the same way everywhere.
  const provisioned = provisionedToolStep(name, platform)
  if (provisioned !== null) {
    return { steps: [provisioned] }
  }

  if (platform === 'win32') {
    const pkg = wingetPackage(ecosystem, name)
    if (pkg === null) {
      return null
    }
    return {
      steps: [
        { command: winget(pkg.id), toolLabel: pkg.label, needsElevation: true },
      ],
    }
  }

  if (platform === 'darwin') {
    const pkg = brewPackage(ecosystem, name)
    if (pkg === null) {
      return null
    }
    return {
      steps: [
        {
          command: brew(pkg.formula, pkg.cask === true),
          toolLabel: pkg.label,
          needsElevation: false,
        },
      ],
    }
  }

  // Linux has no universally safe, non-interactive SDK install path.
  return null
}
