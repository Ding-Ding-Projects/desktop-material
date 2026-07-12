import * as octicons from '../../ui/octicons/octicons.generated'

/**
 * Shared shapes for the one-click Build & Run feature.
 *
 * These types are consumed by the pure detection / auto-fix / gitignore
 * engines in this directory as well as the main-process runner and the
 * renderer UI. They deliberately carry no behaviour so they can be imported
 * from any process without pulling in Node or Electron dependencies.
 */

/** Build ecosystems the detector understands, in no particular order. */
export type BuildRunEcosystem =
  | 'node'
  | 'rust'
  | 'go'
  | 'dotnet'
  | 'python'
  | 'java'
  | 'make'
  | 'cmake'

/** The three sequential stages a plan may contain. */
export type BuildStageKind = 'install' | 'build' | 'run'

/**
 * A single executable invocation. `exe` is resolved against the user PATH by
 * the runner; `args` is always an explicit argv array so nothing is ever
 * interpolated into a shell string (`spawn(exe, args, { shell: false })`).
 */
export interface ICommand {
  readonly exe: string
  readonly args: ReadonlyArray<string>
  readonly label: string
}

/** A cheap "is the toolchain installed?" probe run before any stage. */
export interface IToolchainCheck {
  readonly cmd: ICommand
  /** Human-readable hint shown when the toolchain is missing. */
  readonly missingHint: string
}

/**
 * A ranked, ready-to-run build profile produced by the detection engine.
 * Everything needed to build a plan lives here; the runner never re-inspects
 * the working tree.
 */
export interface IBuildProfile {
  readonly id: string
  readonly ecosystem: BuildRunEcosystem
  readonly label: string
  readonly toolIcon: keyof typeof octicons
  /** Repo-relative working directory (forward-slash separated; '' = root). */
  readonly cwd: string
  readonly install?: ReadonlyArray<ICommand>
  readonly build?: ReadonlyArray<ICommand>
  readonly run?: ReadonlyArray<ICommand>
  readonly toolchainCheck: IToolchainCheck
  readonly needsElevation: boolean
  /** Catalog template id for auto-gitignore; '' when no catalog match. */
  readonly gitignoreTemplateId: string
  /** Extra artifact patterns wrapped in a managed "Build artifacts" section. */
  readonly extraIgnores: ReadonlyArray<string>
  readonly score: number
  readonly reasons: ReadonlyArray<string>
}

/**
 * A read-only probe of a repository's working tree. The pure detector consumes
 * this so it can be unit-tested without touching disk. Structurally a superset
 * of the gitignore feature's probe (adds bounded `readText`).
 */
export interface IRepoFileProbe {
  /** True when the given repo-relative path exists (file or directory). */
  readonly exists: (relativePath: string) => boolean
  /**
   * The text of a small, allow-listed manifest file (e.g. `package.json`,
   * `pyproject.toml`), or `null` when absent / not allow-listed / oversized.
   */
  readonly readText: (relativePath: string) => string | null
  /** A bounded sample of repo-relative file paths (forward-slash separated). */
  readonly sampleFiles: ReadonlyArray<string>
  /** The host platform, used for path-shape and toolchain decisions. */
  readonly platform: NodeJS.Platform
}
