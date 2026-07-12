import { readdir, readFile } from 'fs/promises'
import * as Path from 'path'
import {
  BuildRunEcosystem,
  IBuildProfile,
  ICommand,
  IRepoFileProbe,
  IToolchainCheck,
} from './types'

/**
 * Deterministic build-profile detection.
 *
 * {@link detectProfiles} is pure: it consumes an {@link IRepoFileProbe} and
 * returns ranked profiles, so it is fully unit-testable without disk access.
 * {@link probeRepository} is the thin, bounded-walk adapter that builds a probe
 * from a real working tree.
 */

/** Maximum number of profiles surfaced to the UI. */
const MAX_PROFILES = 6

/** Walk limits for {@link probeRepository}. */
const MAX_WALK_DEPTH = 3
const MAX_WALK_ENTRIES = 2000
const WALK_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  'target',
  'bin',
  'obj',
  'dist',
  'out',
  '.venv',
  '__pycache__',
])

/** Files whose text the detector is allowed to read (size-capped on disk). */
const READ_TEXT_ALLOW_LIST = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Makefile',
  'go.mod',
])
const MAX_READ_TEXT_BYTES = 256 * 1024

/** Manifest basenames that mark a directory as a candidate project root. */
const MANIFEST_MARKERS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'CMakeLists.txt',
  'Makefile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
]

/** Penalty applied to any profile discovered below the repository root. */
const NESTED_PENALTY = 4

/** Cap on candidate directories to keep detection bounded. */
const MAX_CANDIDATE_DIRS = 12

function cmd(
  exe: string,
  args: ReadonlyArray<string>,
  label?: string
): ICommand {
  return { exe, args, label: label ?? `${exe} ${args.join(' ')}`.trim() }
}

/**
 * A probe scoped to a sub-directory: paths are resolved relative to `dir`, and
 * `sampleFiles` only contains entries below it (with the prefix stripped).
 */
interface IScopedProbe extends IRepoFileProbe {
  readonly dir: string
}

function scopeProbe(probe: IRepoFileProbe, dir: string): IScopedProbe {
  if (dir === '') {
    return { ...probe, dir }
  }
  const prefix = `${dir}/`
  return {
    dir,
    platform: probe.platform,
    exists: p => probe.exists(`${prefix}${p}`),
    readText: p => probe.readText(`${prefix}${p}`),
    sampleFiles: probe.sampleFiles
      .filter(f => f.startsWith(prefix))
      .map(f => f.slice(prefix.length)),
  }
}

function hasGlob(probe: IScopedProbe, suffix: string): boolean {
  return probe.sampleFiles.some(
    f => f.endsWith(suffix) && !f.slice(0, -suffix.length).includes('/')
  )
}

/** A detector's output before the wrapper assigns id / cwd / nested penalty. */
type DetectionResult = Omit<IBuildProfile, 'id' | 'cwd'>

type Detector = (probe: IScopedProbe) => DetectionResult | null

// ── Node ───────────────────────────────────────────────────────────────────

type NodePackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

function resolvePackageManager(probe: IScopedProbe): {
  pm: NodePackageManager
  hasLock: boolean
} {
  if (probe.exists('yarn.lock')) {
    return { pm: 'yarn', hasLock: true }
  }
  if (probe.exists('pnpm-lock.yaml')) {
    return { pm: 'pnpm', hasLock: true }
  }
  if (probe.exists('bun.lockb')) {
    return { pm: 'bun', hasLock: true }
  }
  if (probe.exists('package-lock.json')) {
    return { pm: 'npm', hasLock: true }
  }
  return { pm: 'npm', hasLock: false }
}

function parsePackageJson(
  probe: IScopedProbe
): { scripts: Record<string, string>; deps: Set<string> } | null {
  const raw = probe.readText('package.json')
  if (raw == null) {
    return null
  }
  try {
    const json = JSON.parse(raw) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = new Set<string>([
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
    ])
    return { scripts: json.scripts ?? {}, deps }
  } catch {
    return { scripts: {}, deps: new Set() }
  }
}

const detectNode: Detector = probe => {
  if (!probe.exists('package.json')) {
    return null
  }
  const parsed = parsePackageJson(probe)
  const scripts = parsed?.scripts ?? {}
  const deps = parsed?.deps ?? new Set<string>()
  const { pm, hasLock } = resolvePackageManager(probe)

  const reasons: string[] = ['package.json found']
  let score = 10

  if (hasLock) {
    score += 3
    reasons.push(`${pm} lockfile`)
  }

  const installArgs = pm === 'npm' && hasLock ? ['ci'] : ['install']
  const install: ICommand[] = [cmd(pm, installArgs)]

  const build: ICommand[] = []
  if (typeof scripts.build === 'string') {
    build.push(cmd(pm, ['run', 'build'], `${pm} run build`))
    score += 2
    reasons.push('build script')
  }

  const hasElectron = deps.has('electron')
  const hasTauri = probe.exists('src-tauri/Cargo.toml')
  const runOrder = hasElectron
    ? ['electron', 'dev', 'start', 'serve']
    : ['dev', 'start', 'serve']
  const runScript = runOrder.find(name => typeof scripts[name] === 'string')

  const run: ICommand[] = []
  if (runScript) {
    run.push(cmd(pm, ['run', runScript], `${pm} run ${runScript}`))
    score += 2
    reasons.push(`${runScript} script`)
  }

  if (hasElectron) {
    reasons.push('electron app')
  }
  const extraIgnores = ['dist/', 'build/', '.next/', 'out/', 'coverage/']
  if (hasTauri) {
    reasons.push('tauri app')
    extraIgnores.push('src-tauri/target/')
  }

  const label = hasTauri
    ? 'Tauri app'
    : hasElectron
    ? 'Electron app'
    : `Node (${pm})`

  const toolchainCheck: IToolchainCheck = {
    cmd: cmd(pm, ['--version']),
    missingHint:
      pm === 'npm'
        ? 'npm was not found on your PATH. Install Node.js (includes npm) from https://nodejs.org/.'
        : `${pm} was not found on your PATH. Install it, or install Node.js from https://nodejs.org/.`,
  }

  return {
    ecosystem: 'node',
    label,
    toolIcon: 'server',
    install,
    build: build.length > 0 ? build : undefined,
    run: run.length > 0 ? run : undefined,
    toolchainCheck,
    needsElevation: false,
    gitignoreTemplateId: 'node',
    extraIgnores,
    score,
    reasons,
  }
}

// ── Rust ─────────────────────────────────────────────────────────────────────

const detectRust: Detector = probe => {
  if (!probe.exists('Cargo.toml')) {
    return null
  }
  const reasons: string[] = ['Cargo.toml found']
  let score = 10
  if (probe.exists('Cargo.lock')) {
    score += 3
    reasons.push('Cargo.lock')
  }

  const hasBin = probe.exists('src/main.rs')
  const hasLib = probe.exists('src/lib.rs')
  const libOnly = !hasBin && hasLib

  const run: ICommand[] | undefined = libOnly
    ? undefined
    : [cmd('cargo', ['run'])]
  if (libOnly) {
    reasons.push('library crate (no run target)')
  }

  return {
    ecosystem: 'rust',
    label: 'Rust',
    toolIcon: 'gear',
    build: [cmd('cargo', ['build'])],
    run,
    toolchainCheck: {
      cmd: cmd('cargo', ['--version']),
      missingHint:
        'cargo was not found on your PATH. Install Rust from https://rustup.rs/.',
    },
    needsElevation: false,
    gitignoreTemplateId: 'rust',
    extraIgnores: ['target/'],
    score,
    reasons,
  }
}

// ── Go ───────────────────────────────────────────────────────────────────────

const detectGo: Detector = probe => {
  if (!probe.exists('go.mod')) {
    return null
  }
  const reasons: string[] = ['go.mod found']
  let score = 10
  if (probe.exists('go.sum')) {
    score += 3
    reasons.push('go.sum')
  }
  return {
    ecosystem: 'go',
    label: 'Go',
    toolIcon: 'codeSquare',
    install: [cmd('go', ['mod', 'download'])],
    build: [cmd('go', ['build', './...'])],
    run: [cmd('go', ['run', '.'])],
    toolchainCheck: {
      cmd: cmd('go', ['version']),
      missingHint:
        'go was not found on your PATH. Install Go from https://go.dev/dl/.',
    },
    needsElevation: false,
    gitignoreTemplateId: 'go',
    extraIgnores: ['bin/'],
    score,
    reasons,
  }
}

// ── .NET ─────────────────────────────────────────────────────────────────────

const detectDotnet: Detector = probe => {
  const hasSln = hasGlob(probe, '.sln')
  const hasCsproj = hasGlob(probe, '.csproj')
  if (!hasSln && !hasCsproj) {
    return null
  }
  const reasons: string[] = []
  let score = 10
  if (hasSln) {
    reasons.push('solution file')
    score += 3
  }
  if (hasCsproj) {
    reasons.push('project file')
  }
  // `dotnet run` only applies to a runnable project, not a bare solution.
  const run: ICommand[] | undefined = hasCsproj
    ? [cmd('dotnet', ['run'])]
    : undefined
  return {
    ecosystem: 'dotnet',
    label: '.NET',
    toolIcon: 'container',
    install: [cmd('dotnet', ['restore'])],
    build: [cmd('dotnet', ['build'])],
    run,
    toolchainCheck: {
      cmd: cmd('dotnet', ['--version']),
      missingHint:
        'dotnet was not found on your PATH. Install the .NET SDK from https://dotnet.microsoft.com/download.',
    },
    needsElevation: false,
    gitignoreTemplateId: 'visualstudio',
    extraIgnores: ['bin/', 'obj/'],
    score,
    reasons,
  }
}

// ── Python ───────────────────────────────────────────────────────────────────

const detectPython: Detector = probe => {
  const hasPyproject = probe.exists('pyproject.toml')
  const hasRequirements = probe.exists('requirements.txt')
  if (!hasPyproject && !hasRequirements) {
    return null
  }
  const win = probe.platform === 'win32'
  const reasons: string[] = []
  let score = 10

  const sysPython = win ? 'python' : 'python3'
  const pipExe = win ? '.venv\\Scripts\\pip.exe' : '.venv/bin/pip'
  const venvPython = win ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'

  const install: ICommand[] = [
    cmd(sysPython, ['-m', 'venv', '.venv'], 'create .venv'),
  ]
  if (hasRequirements) {
    reasons.push('requirements.txt found')
    install.push(cmd(pipExe, ['install', '-r', 'requirements.txt']))
  } else {
    reasons.push('pyproject.toml found')
    install.push(cmd(pipExe, ['install', '-e', '.']))
    score += 3
  }

  // Resolve a run command from the strongest available signal.
  let run: ICommand[] | undefined
  if (probe.exists('manage.py')) {
    run = [
      cmd(venvPython, ['manage.py', 'runserver'], 'python manage.py runserver'),
    ]
    score += 2
    reasons.push('Django manage.py')
  } else {
    const requirementsText = probe.readText('requirements.txt') ?? ''
    const pyprojectText = probe.readText('pyproject.toml') ?? ''
    const mentionsUvicorn = /uvicorn/i.test(requirementsText + pyprojectText)
    if (mentionsUvicorn) {
      run = [
        cmd(
          venvPython,
          ['-m', 'uvicorn', 'main:app', '--reload'],
          'python -m uvicorn main:app'
        ),
      ]
      score += 2
      reasons.push('uvicorn app')
    } else if (probe.exists('main.py')) {
      run = [cmd(venvPython, ['main.py'], 'python main.py')]
      score += 2
      reasons.push('main.py entrypoint')
    }
  }

  return {
    ecosystem: 'python',
    label: 'Python',
    toolIcon: 'code',
    install,
    run,
    toolchainCheck: {
      cmd: cmd(sysPython, ['--version']),
      missingHint:
        'python was not found on your PATH. Install Python from https://python.org/downloads/.',
    },
    needsElevation: false,
    gitignoreTemplateId: 'python',
    extraIgnores: ['.venv/', '__pycache__/', '*.egg-info/', 'dist/', 'build/'],
    score,
    reasons,
  }
}

// ── Java (Gradle / Maven) ────────────────────────────────────────────────────

const detectJava: Detector = probe => {
  const win = probe.platform === 'win32'
  const hasGradleWrapper =
    probe.exists('gradlew') || probe.exists('gradlew.bat')
  const hasMavenWrapper = probe.exists('mvnw') || probe.exists('mvnw.cmd')
  const hasGradle =
    probe.exists('build.gradle') || probe.exists('build.gradle.kts')
  const hasMaven = probe.exists('pom.xml')

  if (!hasGradleWrapper && !hasMavenWrapper && !hasGradle && !hasMaven) {
    return null
  }

  const reasons: string[] = []
  let score = 10
  let build: ICommand[]
  let run: ICommand[] | undefined
  let toolchainCheck: IToolchainCheck

  if (hasGradleWrapper) {
    score += 3
    reasons.push('Gradle wrapper')
    const gradlew = win ? 'gradlew.bat' : './gradlew'
    build = [cmd(gradlew, ['build'])]
    run = [cmd(gradlew, ['run'])]
    toolchainCheck = {
      cmd: cmd(gradlew, ['--version']),
      missingHint:
        'The Gradle wrapper could not run. A JDK is required — install one from https://adoptium.net/.',
    }
  } else if (hasMavenWrapper) {
    score += 3
    reasons.push('Maven wrapper')
    const mvnw = win ? 'mvnw.cmd' : './mvnw'
    build = [cmd(mvnw, ['-q', 'package'])]
    run = undefined
    toolchainCheck = {
      cmd: cmd(mvnw, ['-v']),
      missingHint:
        'The Maven wrapper could not run. A JDK is required — install one from https://adoptium.net/.',
    }
  } else if (hasGradle) {
    reasons.push('Gradle build')
    build = [cmd('gradle', ['build'])]
    run = [cmd('gradle', ['run'])]
    toolchainCheck = {
      cmd: cmd('gradle', ['--version']),
      missingHint:
        'gradle was not found on your PATH. Install Gradle from https://gradle.org/install/.',
    }
  } else {
    reasons.push('Maven build')
    build = [cmd('mvn', ['-q', 'package'])]
    run = undefined
    toolchainCheck = {
      cmd: cmd('mvn', ['-v']),
      missingHint:
        'mvn was not found on your PATH. Install Maven from https://maven.apache.org/.',
    }
  }

  return {
    ecosystem: 'java',
    label: 'Java',
    toolIcon: 'cpu',
    build,
    run,
    toolchainCheck,
    needsElevation: false,
    gitignoreTemplateId: 'java',
    extraIgnores: ['build/', 'target/', '.gradle/'],
    score,
    reasons,
  }
}

// ── CMake ────────────────────────────────────────────────────────────────────

const detectCmake: Detector = probe => {
  if (!probe.exists('CMakeLists.txt')) {
    return null
  }
  return {
    ecosystem: 'cmake',
    label: 'CMake',
    toolIcon: 'tools',
    build: [cmd('cmake', ['-B', 'build']), cmd('cmake', ['--build', 'build'])],
    run: undefined,
    toolchainCheck: {
      cmd: cmd('cmake', ['--version']),
      missingHint:
        'cmake was not found on your PATH. Install CMake from https://cmake.org/download/.',
    },
    needsElevation: false,
    gitignoreTemplateId: '',
    extraIgnores: ['build/'],
    score: 10,
    reasons: ['CMakeLists.txt found'],
  }
}

// ── Make (generic fallback) ──────────────────────────────────────────────────

const detectMake: Detector = probe => {
  if (!probe.exists('Makefile')) {
    return null
  }
  const text = probe.readText('Makefile') ?? ''
  const hasRunTarget = /^run\s*:/m.test(text)
  const run: ICommand[] | undefined = hasRunTarget
    ? [cmd('make', ['run'])]
    : undefined
  const reasons: string[] = ['Makefile found']
  if (hasRunTarget) {
    reasons.push('run: target')
  }
  return {
    ecosystem: 'make',
    label: 'Make',
    toolIcon: 'terminal',
    build: [cmd('make', [])],
    run,
    toolchainCheck: {
      cmd: cmd('make', ['--version']),
      missingHint:
        'make was not found on your PATH. Install build tools for your platform (e.g. MSYS2 on Windows).',
    },
    needsElevation: false,
    gitignoreTemplateId: '',
    extraIgnores: ['build/', 'bin/'],
    score: 10,
    reasons,
  }
}

/** All detectors. `detectMake` is a generic fallback, suppressed elsewhere. */
const DETECTORS: ReadonlyArray<Detector> = [
  detectNode,
  detectRust,
  detectGo,
  detectDotnet,
  detectPython,
  detectJava,
  detectCmake,
  detectMake,
]

/** Collect candidate project-root directories (root plus nested manifests). */
function collectCandidateDirs(probe: IRepoFileProbe): ReadonlyArray<string> {
  const dirs = new Set<string>([''])
  for (const file of probe.sampleFiles) {
    const slash = file.lastIndexOf('/')
    if (slash === -1) {
      continue
    }
    const base = file.slice(slash + 1)
    const isMarker =
      MANIFEST_MARKERS.includes(base) ||
      base.endsWith('.csproj') ||
      base.endsWith('.sln')
    if (isMarker) {
      dirs.add(file.slice(0, slash))
    }
    if (dirs.size >= MAX_CANDIDATE_DIRS) {
      break
    }
  }
  return [...dirs]
}

function makeId(ecosystem: BuildRunEcosystem, dir: string): string {
  return dir === '' ? ecosystem : `${ecosystem}:${dir}`
}

/**
 * Detect ranked build profiles from a repository probe. Pure and
 * deterministic: results are sorted by score descending then label ascending,
 * only positive-scoring profiles are returned, and the list is capped at
 * {@link MAX_PROFILES}.
 */
export function detectProfiles(
  probe: IRepoFileProbe
): ReadonlyArray<IBuildProfile> {
  const profiles: IBuildProfile[] = []

  for (const dir of collectCandidateDirs(probe)) {
    const scoped = scopeProbe(probe, dir)
    const dirResults: DetectionResult[] = []
    for (const detector of DETECTORS) {
      const result = detector(scoped)
      if (result !== null) {
        dirResults.push(result)
      }
    }

    // `make` is a generic fallback: drop it when a real ecosystem matched here.
    const nonMake = dirResults.filter(r => r.ecosystem !== 'make')
    const effective = nonMake.length > 0 ? nonMake : dirResults

    for (const result of effective) {
      const nested = dir !== ''
      const score = nested ? result.score - NESTED_PENALTY : result.score
      if (score <= 0) {
        continue
      }
      profiles.push({
        ...result,
        id: makeId(result.ecosystem, dir),
        cwd: dir,
        score,
        reasons: nested
          ? [...result.reasons, `nested in ${dir}/ (−${NESTED_PENALTY})`]
          : result.reasons,
      })
    }
  }

  profiles.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.label.localeCompare(b.label)
  })

  return profiles.slice(0, MAX_PROFILES)
}

/**
 * Build a bounded probe of a repository's working tree. Skips heavy build /
 * dependency directories, caps the number of entries scanned, and only reads
 * the text of small allow-listed manifest files.
 */
export async function probeRepository(
  repoPath: string,
  platform: NodeJS.Platform = process.platform
): Promise<IRepoFileProbe> {
  const paths = new Set<string>()
  const sampleFiles: string[] = []
  const texts = new Map<string, string | null>()
  let entryCount = 0

  const queue: Array<{ dir: string; depth: number; rel: string }> = [
    { dir: repoPath, depth: 0, rel: '' },
  ]

  while (queue.length > 0 && entryCount < MAX_WALK_ENTRIES) {
    const { dir, depth, rel } = queue.shift()!

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entryCount >= MAX_WALK_ENTRIES) {
        break
      }
      entryCount++

      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      paths.add(relPath)

      if (entry.isDirectory()) {
        if (!WALK_SKIP_DIRS.has(entry.name) && depth < MAX_WALK_DEPTH) {
          queue.push({
            dir: Path.join(dir, entry.name),
            depth: depth + 1,
            rel: relPath,
          })
        }
      } else if (entry.isFile()) {
        sampleFiles.push(relPath)
        if (READ_TEXT_ALLOW_LIST.has(entry.name) && !texts.has(relPath)) {
          try {
            const buffer = await readFile(Path.join(dir, entry.name))
            texts.set(
              relPath,
              buffer.length > MAX_READ_TEXT_BYTES
                ? null
                : buffer.toString('utf8')
            )
          } catch {
            texts.set(relPath, null)
          }
        }
      }
    }
  }

  return {
    exists: relativePath => paths.has(relativePath),
    readText: relativePath => texts.get(relativePath) ?? null,
    sampleFiles,
    platform,
  }
}
