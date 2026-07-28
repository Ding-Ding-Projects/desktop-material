import type { BuildFixProvider } from '../lib/build-run/codex'

/** Where newly pinned Cheap LFS objects are stored. */
export type CheapLfsStorageProvider = 'release' | 'ghcr' | 'docker-hub'

/**
 * Per-repository preferences for the one-click Build & Run feature.
 *
 * Persisted as an un-indexed Dexie blob alongside `workflowPreferences`
 * (see `IDatabaseRepository`), so adding it required no schema migration.
 */
export interface IBuildRunPreferences {
  /** The profile id run by default when the user clicks the pill. */
  readonly defaultProfileId?: string

  /** Pre-elevate the whole chain behind a single UAC prompt. */
  readonly elevated: boolean

  /** Run the `run` stage after a successful build. */
  readonly autoRunAfterBuild: boolean

  /** Seed `.gitignore` with the profile's build-output patterns before install. */
  readonly autoIgnoreBuildOutputs: boolean

  /**
   * Automatically install a missing toolchain (via winget / corepack) when the
   * pre-build toolchain probe fails, instead of only printing a hint. Optional
   * for back-compat with preferences persisted before this field existed;
   * treat an absent value as enabled (see {@link defaultBuildRunPreferences}).
   */
  readonly autoInstallMissingTools?: boolean

  /**
   * Start the selected Build & Run profile (e.g. a Docker image or app build)
   * automatically after an interactive pull that brought new commits. Optional
   * for back-compat with preferences persisted before this field existed;
   * treat an absent value as disabled (see {@link defaultBuildRunPreferences}).
   */
  readonly autoBuildOnPull?: boolean

  /**
   * Offer the "Fix with opencode" affordance when a run fails, launching the
   * opencode AI coding agent to diagnose and fix the errors. Enabled by
   * default so a failed build always surfaces the offer; merely showing the
   * button is harmless (clicking opens a consent dialog, and installing
   * opencode and enabling auto-approve are each separately gated). Optional
   * for back-compat with preferences persisted before this field existed;
   * treat an absent value as enabled (see {@link defaultBuildRunPreferences}).
   */
  readonly offerOpencodeAutoFix?: boolean

  /**
   * Preferred local AI build-fix provider. Stored per repository and seeded
   * into both the failed-build and free-form dialogs. Existing repositories
   * without this field keep OpenCode until the user chooses Codex.
   */
  readonly buildFixProvider?: BuildFixProvider

  /**
   * Auto-approve the selected provider's repository-scoped edits and commands.
   * Optional for back-compat; when absent, the legacy OpenCode preference is
   * used. Codex retains its `workspace-write` sandbox, ignores execution rules,
   * and disables lifecycle hooks even when enabled. Trusted project MCP config
   * remains part of Codex's user trust boundary and is called out in the UI.
   */
  readonly buildFixAutoApprove?: boolean

  /**
   * Run opencode in `--auto` (auto-approve, "yolo") mode, scoped to this
   * repository, so it applies edits and runs shell commands without prompting.
   * The enable-yolo-for-this-repo control; defaults FALSE and carries a
   * prominent warning. When off, opencode runs without `--auto`. Optional for
   * back-compat; treat an absent value as disabled.
   */
  readonly opencodeAutoApprove?: boolean

  /**
   * Automatically download (materialize) committed cheap-LFS pointers back into
   * their real bytes after cloning, pulling, or opening the repository. Gated on
   * a Releases-capable account being selected, cancelable, and posts a summary
   * notification. Optional for back-compat with preferences persisted before
   * this field existed; treat an absent value as enabled (see
   * {@link defaultBuildRunPreferences}).
   */
  readonly autoMaterializeCheapLfs?: boolean

  /**
   * Automatically pin a large file to a GitHub Release when committing it, so
   * only a small pointer is committed and the push stays under GitHub's file
   * size limit. Applies to selected files strictly over the cheap-LFS pin
   * threshold (`CheapLfsPinThresholdBytes`); failed files stay out of the commit
   * while other safe changes may continue. Gated on a Releases-capable account.
   * Optional for back-compat with preferences persisted before this field
   * existed; treat an absent value as enabled (see
   * {@link defaultBuildRunPreferences}).
   */
  readonly autoPinLargeFilesOnCommit?: boolean

  /**
   * Legacy parallel-upload switch retained for compatibility with older app
   * versions. New writes keep it synchronized with
   * `cheapLfsUploadConcurrency`: one lane is false and two or three lanes are
   * true.
   */
  readonly parallelCheapLfsUploads?: boolean

  /**
   * Maximum simultaneous Cheap LFS uploads. Optional for compatibility with
   * repositories persisted before configurable lanes existed; use
   * {@link getCheapLfsUploadConcurrency} instead of reading this field
   * directly.
   */
  readonly cheapLfsUploadConcurrency?: number

  /** Storage used for newly pinned objects; old pointer formats still restore. */
  readonly cheapLfsStorageProvider?: CheapLfsStorageProvider

  /** Legacy preview preference migrated to `cheapLfsStorageProvider`. */
  readonly cheapLfsGhcrStorage?: boolean

  /**
   * Explicit consent to run Cheap LFS cloud compression in a private
   * repository. Public repositories use cloud compression automatically;
   * private and unknown-visibility repositories remain off unless this value
   * is exactly true. The workflow compresses only. Desktop Material always
   * downloads and decompresses objects locally.
   */
  readonly cheapLfsCloudCompression?: boolean

  /**
   * Encrypt newly uploaded GitHub Release-backed Cheap LFS payloads with a
   * user-supplied password. Off by default and intentionally limited to the
   * Release provider; registry providers retain their existing repository-key
   * encryption contract. The password itself is never persisted here.
   */
  readonly cheapLfsPayloadEncryption?: boolean

  /**
   * Records only that the repository's irreversible password-loss warning was
   * acknowledged before its first encrypted upload. This is not a credential
   * and turning encryption off clears it so a later opt-in repeats the gate.
   */
  readonly cheapLfsPayloadEncryptionConfirmed?: boolean

  /**
   * Per-profile command-line overrides. A blank / absent value for a stage
   * means "use the detected command". Stored as raw command-line strings; the
   * dispatcher tokenises them into an argv array (never a shell string).
   */
  readonly overrides?: {
    readonly [profileId: string]: {
      readonly install?: string
      readonly build?: string
      readonly run?: string
    }
  }
}

/** The defaults applied when a repository has no persisted preferences. */
export const defaultBuildRunPreferences: IBuildRunPreferences = {
  elevated: false,
  autoRunAfterBuild: true,
  autoIgnoreBuildOutputs: true,
  autoInstallMissingTools: true,
  autoBuildOnPull: false,
  offerOpencodeAutoFix: true,
  buildFixProvider: 'opencode',
  buildFixAutoApprove: false,
  opencodeAutoApprove: false,
  autoMaterializeCheapLfs: true,
  autoPinLargeFilesOnCommit: true,
  parallelCheapLfsUploads: true,
  cheapLfsUploadConcurrency: 3,
  cheapLfsStorageProvider: 'release',
  cheapLfsPayloadEncryption: false,
  cheapLfsPayloadEncryptionConfirmed: false,
}

/** Resolve persisted preview builds and reject unknown provider values safely. */
export function getCheapLfsStorageProvider(
  preferences: IBuildRunPreferences
): CheapLfsStorageProvider {
  const provider = preferences.cheapLfsStorageProvider
  if (
    provider === 'release' ||
    provider === 'ghcr' ||
    provider === 'docker-hub'
  ) {
    return provider
  }
  return preferences.cheapLfsGhcrStorage === true ? 'ghcr' : 'release'
}

/**
 * Resolve the configurable Cheap LFS upload lane count while preserving the
 * legacy boolean contract. Persisted numeric values are clamped to the safe
 * one-to-three range; old false values stay sequential and true/absent values
 * retain the historical default of three lanes.
 */
export function getCheapLfsUploadConcurrency(
  preferences: IBuildRunPreferences
): number {
  const configured = preferences.cheapLfsUploadConcurrency
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return Math.min(3, Math.max(1, Math.floor(configured)))
  }
  return preferences.parallelCheapLfsUploads === false ? 1 : 3
}

/** Resolve the renamed provider-neutral approval setting compatibly. */
export function getBuildFixAutoApprove(
  preferences: IBuildRunPreferences
): boolean {
  return (
    preferences.buildFixAutoApprove ?? preferences.opencodeAutoApprove ?? false
  )
}
