/**
 * Pure install planner for the opencode AI coding agent CLI.
 *
 * When "Fix with opencode" is clicked but `opencode --version` fails, the launch
 * flow offers to install the CLI first. {@link planOpencodeInstall} maps the
 * host platform to a concrete, argv-encoded install command.
 *
 * `npm i -g opencode-ai@latest` is the portable default on every platform: it
 * needs no elevation and — unlike `curl | bash`, scoop or winget — executes no
 * remote install script, so it is the only path we auto-run. The function is
 * pure and platform-parameterised (mirroring `planToolchainInstall`) so it is
 * fully unit-testable and carries no Node/Electron dependencies.
 */

/** A single, argv-encoded opencode install command. */
export interface IOpencodeInstallPlan {
  /** The executable to spawn (bare name, resolved against PATH by the runner). */
  readonly exe: string
  /** Explicit argv — never interpolated into a shell string. */
  readonly args: ReadonlyArray<string>
  /** Human-readable command for the "Installing …" panel line. */
  readonly label: string
  /** Short note explaining what the install does (surfaced before consent). */
  readonly hint: string
}

/**
 * Operator notes the launch flow repeats. Not a version gate — opencode
 * publishes no minimum we pin to — but the essential facts the UI needs: how to
 * authenticate and what the default install actually does.
 */
export const OPENCODE_MIN = {
  /** Shown when `opencode auth list` reports no configured provider. */
  authHint:
    "opencode has no provider configured — run 'opencode auth login' before launching.",
  /** Portable, no-elevation, no-remote-script install used as the default. */
  installNote:
    'Installs the opencode CLI globally via npm (no elevation, no remote script).',
} as const

/**
 * Plan how to install the opencode CLI on the given host.
 *
 * `platform` is accepted so a future host-specific path (for example scoop on
 * Windows) can slot in without a signature change; today every host resolves to
 * the portable npm global install, which is the safe fallback everywhere.
 */
export function planOpencodeInstall(
  platform: NodeJS.Platform
): IOpencodeInstallPlan {
  return {
    exe: 'npm',
    args: ['i', '-g', 'opencode-ai@latest'],
    label: 'npm i -g opencode-ai@latest',
    hint: OPENCODE_MIN.installNote,
  }
}
