/**
 * The silent-install flag table and its pre-launch review.
 *
 * A downloaded release asset that is an installer can be run unattended, but
 * "unattended" is exactly where a wrong switch does damage: the wrong family's
 * flag can leave an installer waiting on an invisible dialog, and the wrong
 * file can start something the operator never downloaded. Both decisions are
 * therefore pure, table-driven, and tested here, away from the process spawn.
 *
 * Two rules are deliberate and load-bearing:
 *
 * - Only files this table recognizes as installers are offered at all. An
 *   archive, a `.nupkg`, or anything unrecognized gets no button, because a
 *   "silent install" that is really "execute this download" is a trap.
 * - An `.exe` whose family could not be identified is offered honestly as an
 *   *attempt*. `/S` is the common convention, not a guarantee, and the caller
 *   is told the difference so the label can say so too.
 *
 * Nothing here elevates. The plan runs the file exactly as downloaded; if
 * Windows demands elevation the launch fails and is reported as a failure.
 */

/** The installer families whose silent switches this table knows. */
export type SilentInstallFamily =
  | 'msi'
  | 'inno-setup'
  | 'nsis-or-squirrel'
  | 'unknown-exe'

/** Cheap, read-only evidence about a downloaded file. */
export interface IInstallerEvidence {
  /** The asset's file name, used for the extension decision. */
  readonly fileName: string
  /**
   * Printable text scraped from the file's leading bytes, when the caller
   * could read them. Absent evidence downgrades an `.exe` to `unknown-exe`
   * rather than guessing a family.
   */
  readonly headText?: string
}

export interface ISilentInstallPlan {
  readonly family: SilentInstallFamily
  /** The executable to run: `msiexec` for an MSI, else the asset itself. */
  readonly command: string
  readonly args: ReadonlyArray<string>
  /**
   * `false` when the family could not be identified, so the surface must offer
   * the action as an attempt instead of promising a silent install.
   */
  readonly certain: boolean
}

/** Windows Installer's own host; never the downloaded file. */
const WindowsInstallerHost = 'msiexec.exe'

/**
 * The flag table. Each family's switches are the vendor-documented unattended
 * set, and each one suppresses the reboot the operator did not ask for.
 */
const SilentInstallFlags: Readonly<
  Record<SilentInstallFamily, ReadonlyArray<string>>
> = {
  msi: ['/qn', '/norestart'],
  'inno-setup': ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'],
  'nsis-or-squirrel': ['/S'],
  'unknown-exe': ['/S'],
}

/** Markers each family leaves in the first bytes of its own installer. */
const FamilyMarkers: ReadonlyArray<{
  readonly family: SilentInstallFamily
  readonly markers: ReadonlyArray<string>
}> = [
  { family: 'inno-setup', markers: ['inno setup', 'jr.inno.setup'] },
  {
    family: 'nsis-or-squirrel',
    markers: ['nullsoft', 'nsis', 'squirrel'],
  },
]

function extensionOf(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase()
  const dot = trimmed.lastIndexOf('.')
  return dot <= 0 ? '' : trimmed.slice(dot + 1)
}

/**
 * Which family's silent switches apply, or `null` when the file is not an
 * installer this table will run at all.
 */
export function detectSilentInstallFamily(
  evidence: IInstallerEvidence
): SilentInstallFamily | null {
  switch (extensionOf(evidence.fileName)) {
    case 'msi':
      return 'msi'
    case 'exe':
      break
    default:
      return null
  }

  const head = (evidence.headText ?? '').toLowerCase()
  if (head.length === 0) {
    return 'unknown-exe'
  }
  for (const candidate of FamilyMarkers) {
    if (candidate.markers.some(marker => head.includes(marker))) {
      return candidate.family
    }
  }
  return 'unknown-exe'
}

/** Can this asset be offered a silent install at all? */
export function isSilentInstallableAsset(fileName: string): boolean {
  return detectSilentInstallFamily({ fileName }) !== null
}

/**
 * The exact command line for one downloaded installer, or `null` when the file
 * is not an installer this table runs.
 */
export function planSilentInstall(
  evidence: IInstallerEvidence,
  path: string
): ISilentInstallPlan | null {
  const family = detectSilentInstallFamily(evidence)
  if (family === null || path.trim().length === 0) {
    return null
  }
  const flags = SilentInstallFlags[family]
  return {
    family,
    command: family === 'msi' ? WindowsInstallerHost : path,
    // `msiexec` takes the package as the value of `/i`; every other family is
    // its own host and takes only its switches.
    args: family === 'msi' ? ['/i', path, ...flags] : [...flags],
    certain: family !== 'unknown-exe',
  }
}

/** Why a reviewed silent install must not start. */
export type SilentInstallRefusal =
  | 'not-installable'
  | 'missing'
  | 'not-a-file'
  | 'size-mismatch'
  | 'name-mismatch'
  | 'unsupported-platform'

/** What the release said the asset is. */
export interface ISilentInstallExpectation {
  readonly fileName: string
  readonly sizeInBytes: number
}

/** What the file system says the downloaded path actually is. */
export interface ISilentInstallActual {
  readonly exists: boolean
  readonly isFile: boolean
  readonly sizeInBytes: number
  /**
   * The base name of the path that will actually be spawned. Every other gate
   * here reads the *expected* name, so without this the file that decides
   * "is this an installer, and which family" and the file that gets executed
   * are never required to be the same file.
   */
  readonly fileName: string
}

/**
 * Decide whether the exact downloaded file may be launched.
 *
 * The spawned path must be the file this release asset produced, unchanged. A
 * missing, replaced, or resized file is refused with a reason rather than run,
 * because "install the thing I downloaded" and "execute whatever is at this
 * path now" are not the same request.
 */
export function reviewSilentInstallTarget(
  expected: ISilentInstallExpectation,
  actual: ISilentInstallActual | null,
  platform: string = process.platform
): SilentInstallRefusal | null {
  if (platform !== 'win32') {
    return 'unsupported-platform'
  }
  if (!isSilentInstallableAsset(expected.fileName)) {
    return 'not-installable'
  }
  if (actual === null || !actual.exists) {
    return 'missing'
  }
  if (!actual.isFile) {
    return 'not-a-file'
  }
  // The extension gate above inspected the *release asset's* name; the spawn
  // runs whatever sits at the path. Requiring them to be the same file is what
  // makes "only files this table recognizes as installers are offered at all"
  // true of the thing that actually executes.
  if (
    actual.fileName.trim().toLowerCase() !==
    expected.fileName.trim().toLowerCase()
  ) {
    return 'name-mismatch'
  }
  return actual.sizeInBytes === expected.sizeInBytes ? null : 'size-mismatch'
}

/** One reviewed request to run a downloaded installer unattended. */
export interface ISilentInstallRequest {
  /** The exact path the download produced. */
  readonly path: string
  /** The release asset's name, which decides the family. */
  readonly fileName: string
  /** The release asset's size, which the file on disk must still match. */
  readonly sizeInBytes: number
}

export interface ISilentInstallResult {
  /** `true` only when the installer ran and exited zero. */
  readonly ok: boolean
  /** Set when the launch was refused before anything ran. */
  readonly refusal: SilentInstallRefusal | null
  readonly family: SilentInstallFamily | null
  /** The child's exit code, or `null` when it never started. */
  readonly exitCode: number | null
  /** Bounded, sanitized tail of the installer's own output. */
  readonly output: string
  /** Bounded reason the process could not be started at all. */
  readonly launchError: string | null
}

/** Keep a child process's output readable and bounded before it is shown. */
export const SilentInstallMaximumOutputLength = 400

/**
 * Reduce a child process's output to a short, printable tail.
 *
 * Installer output is not app-authored, so it is flattened the same way a
 * provider message is: control characters cannot forge extra lines, and the
 * length cannot push the rest of the notice off the surface.
 */
export function sanitizeSilentInstallOutput(output: string): string {
  const printable = Array.from(output, character => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f ? ' ' : character
  }).join('')
  const collapsed = printable.replace(/\s+/g, ' ').trim()
  return collapsed.length > SilentInstallMaximumOutputLength
    ? `…${collapsed.slice(
        collapsed.length - SilentInstallMaximumOutputLength + 1
      )}`
    : collapsed
}
