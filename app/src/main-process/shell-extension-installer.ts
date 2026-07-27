import * as Path from 'path'
import { execFile } from 'child_process'
import { cp } from 'fs/promises'
import { HKEY, enumerateValuesSafe } from 'registry-js'
import { pathExists } from '../lib/path-exists'
import {
  ContextMenuMode,
  IModernContextMenuObservation,
  ModernContextMenuBlocker,
  ShellExtensionRegistrationState,
  buildQueryPackageArguments,
  buildRegisterPackageArguments,
  buildUnregisterPackageArguments,
  decideContextMenuMode,
  decideShellExtensionExternalLocation,
  decideShellExtensionPackageSource,
  decideShellExtensionRegistrationState,
  decideShellExtensionRepair,
  parsePackageRegistrationOutput,
  squirrelUpdateRoot,
} from '../lib/shell-extension-package'

/**
 * Registers and unregisters the sparse MSIX package that puts the app's verbs
 * in the top-level Windows 11 context menu.
 *
 * Every decision lives in `lib/shell-extension-package` and is unit-tested;
 * this file only performs I/O. Registration is per user and never elevates:
 * `Add-AppxPackage -Register` on a loose manifest requires no signature and no
 * administrator, but it does require the machine to permit sideloading.
 *
 * This project deliberately does not install a signing certificate. Trusting a
 * self-signed certificate means writing a machine-wide certificate store, which
 * is an administrator-level security change; offering it from a settings toggle
 * would be worse than falling back to the classic verbs.
 */

const PowerShellTimeoutMs = 30_000

/**
 * The directory a registration names as the package's external location.
 *
 * Every relative path in the manifest — the DLL, the assets, and the
 * `Executable` — resolves against this, so it must hold both
 * `GitHubDesktop.exe` and the `shell-extension` folder. In an installed build
 * that is the Squirrel root rather than the `app-<version>` directory
 * `process.execPath` lives in: Windows records this path once and never
 * revisits it, and the versioned directory is deleted by a later update while
 * the registration recorded against it survives (issue #66).
 *
 * `process.execPath` still decides *which* install this is, so a portable or
 * side-by-side layout registers its own copy rather than another install's.
 */
export async function shellExtensionExternalLocation(): Promise<string> {
  const executableDirectory = Path.dirname(process.execPath)
  const updateRoot = squirrelUpdateRoot(executableDirectory)
  const updateRootHoldsLauncher =
    updateRoot !== null &&
    (await pathExists(Path.join(updateRoot, Path.basename(process.execPath))))

  return decideShellExtensionExternalLocation(
    executableDirectory,
    updateRootHoldsLauncher
  )
}

/** Where the shell-extension package must sit for a registration to work. */
export async function shellExtensionPackageDirectory(): Promise<string> {
  return Path.join(await shellExtensionExternalLocation(), 'shell-extension')
}

/**
 * Where packaged builds actually ship the folder: the packager bundles the
 * whole app directory into `resources\app`, so the package arrives there
 * rather than beside the executable where registration needs it.
 */
export function shellExtensionResourcesDirectory(): string {
  return Path.join(process.resourcesPath, 'app', 'shell-extension')
}

/**
 * Make the registrable layout exist beside the executable the external
 * location names, copying the shipped folder into place. Returns the package
 * directory, or null when this build ships no package at all.
 *
 * The copy is refreshed on every registration, because the external location
 * now outlives the version that wrote it: without this, the folder an earlier
 * release left at the Squirrel root would be the one every later release
 * registers. It is best-effort — Explorer keeps the DLL loaded once the menu
 * has been shown, which locks the file — so a failed refresh falls back to the
 * folder already in place rather than losing a working registration.
 */
async function ensureRegistrableShellExtensionPackage(
  packageDirectory: string
): Promise<string | null> {
  const resourcesDirectory = shellExtensionResourcesDirectory()
  const [besideExecutable, insideResources] = await Promise.all([
    pathExists(Path.join(packageDirectory, 'AppxManifest.xml')),
    pathExists(Path.join(resourcesDirectory, 'AppxManifest.xml')),
  ])
  switch (
    decideShellExtensionPackageSource(besideExecutable, insideResources, true)
  ) {
    case 'beside-executable':
      return packageDirectory
    case 'copy-from-resources':
      try {
        await cp(resourcesDirectory, packageDirectory, { recursive: true })
      } catch (error) {
        if (!besideExecutable) {
          throw error
        }
        log.warn(
          'Could not refresh the shell-extension package; registering the copy already in place',
          error
        )
      }
      return packageDirectory
    case 'missing':
      return null
  }
}

function powerShellPath(): string {
  const systemRoot =
    process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows'
  return Path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
}

/** Run a generated PowerShell argv. Never a concatenated script string. */
function runPowerShell(args: ReadonlyArray<string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      powerShellPath(),
      args as string[],
      { timeout: PowerShellTimeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
        } else {
          resolve(stdout)
        }
      }
    )
  })
}

/**
 * Whether this machine permits registering an unsigned, loose package.
 *
 * `AllowDevelopmentWithoutDevLicense` (Developer Mode) is the per-machine
 * policy that gates it. It is only read here — enabling it is a system security
 * setting and is the user's decision to make in Windows Settings, not
 * something this app will change.
 */
function canRegisterLoosePackage(): boolean {
  try {
    const values = enumerateValuesSafe(
      HKEY.HKEY_LOCAL_MACHINE,
      'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock'
    )
    const entry = values.find(
      value => value.name === 'AllowDevelopmentWithoutDevLicense'
    )
    return entry !== undefined && Number(entry.data) === 1
  } catch {
    return false
  }
}

/** Windows 11 is build 22000 or later. */
function isWindows11OrLater(): boolean {
  if (process.platform !== 'win32') {
    return false
  }
  const build = Number(require('os').release().split('.')[2] ?? '0')
  return build >= 22000
}

/**
 * Ask Windows what is registered and judge it against this install.
 *
 * The judgement is the point: a package registered from a directory a later
 * update deleted still answers "registered", so believing that answer is what
 * let a dead context menu keep reporting itself as enabled.
 */
async function observeShellExtensionRegistration(): Promise<ShellExtensionRegistrationState> {
  let output: string
  try {
    output = await runPowerShell(buildQueryPackageArguments())
  } catch {
    // A failed query means we cannot prove anything is registered, which for a
    // status display is the same as nothing being registered.
    return 'absent'
  }

  const registration = parsePackageRegistrationOutput(output)
  const expectedExternalLocation = await shellExtensionExternalLocation()
  const installLocationExists =
    registration.installLocation !== null &&
    (await pathExists(registration.installLocation))

  return decideShellExtensionRegistrationState({
    registration,
    installLocationExists,
    expectedManifestDirectory: Path.join(
      expectedExternalLocation,
      'shell-extension'
    ),
    expectedExternalLocation,
  })
}

/** Probe everything the mode decision depends on. */
export async function observeModernContextMenu(): Promise<IModernContextMenuObservation> {
  if (process.platform !== 'win32') {
    return {
      isWindows11OrLater: false,
      packagePresent: false,
      canRegisterLoosePackage: false,
      registrationState: 'absent',
    }
  }

  // Present in either location counts: registration self-heals the layout by
  // copying the shipped folder beside the executable.
  const packageDirectory = await shellExtensionPackageDirectory()
  const [besideExecutable, insideResources, registrationState] =
    await Promise.all([
      pathExists(Path.join(packageDirectory, 'AppxManifest.xml')),
      pathExists(
        Path.join(shellExtensionResourcesDirectory(), 'AppxManifest.xml')
      ),
      observeShellExtensionRegistration(),
    ])
  const packagePresent =
    decideShellExtensionPackageSource(besideExecutable, insideResources) !==
    'missing'

  return {
    isWindows11OrLater: isWindows11OrLater(),
    packagePresent,
    canRegisterLoosePackage: canRegisterLoosePackage(),
    registrationState,
  }
}

export interface IContextMenuModeState {
  readonly mode: ContextMenuMode
  readonly modernBlocker: ModernContextMenuBlocker | null
}

/** Report which context-menu implementation is actually serving the user. */
export async function getContextMenuMode(
  classicInstalled: boolean
): Promise<IContextMenuModeState> {
  return decideContextMenuMode(
    await observeModernContextMenu(),
    classicInstalled
  )
}

/**
 * Register the sparse package for the current user.
 *
 * The update-stable install root is passed as the external location, which is
 * what lets the package reference binaries that live outside it — and what
 * keeps the reference valid after the next update moves the app into a new
 * `app-<version>` directory.
 */
export async function registerShellExtensionPackage(): Promise<void> {
  const externalLocation = await shellExtensionExternalLocation()
  const packageDirectory = await ensureRegistrableShellExtensionPackage(
    Path.join(externalLocation, 'shell-extension')
  )

  if (packageDirectory === null) {
    throw new Error(
      'This build does not include the Windows 11 shell extension package.'
    )
  }

  await runPowerShell(
    buildRegisterPackageArguments(
      Path.join(packageDirectory, 'AppxManifest.xml'),
      externalLocation
    )
  )
}

/** Remove the registered package for the current user. */
export async function unregisterShellExtensionPackage(): Promise<void> {
  await runPowerShell(buildUnregisterPackageArguments())
}

/** What a launch-time freshness check did. */
export type ShellExtensionRepairOutcome =
  /** Not Windows, so there is no registration to hold an opinion about. */
  | 'not-applicable'
  /** The user has not turned the feature on. Nothing is registered for them. */
  | 'not-registered'
  /** Already registered against this install. */
  | 'current'
  /** Was pointing somewhere this install does not own, and now is not. */
  | 'repaired'
  /** Needed repair and could not be repaired; settings reports it honestly. */
  | 'failed'

/**
 * Repair a registration left pointing at a directory this install no longer
 * owns — what a Squirrel update did to every registration recorded against
 * `app-<version>` (issue #66).
 *
 * Silent, and opt-in preserving: only an *existing* registration is rewritten,
 * so a user who never turned the feature on never finds it turned on, while a
 * user who did gets their menu back without having to discover that toggling a
 * setting off and on again is the cure.
 */
export async function repairStaleShellExtensionRegistration(): Promise<ShellExtensionRepairOutcome> {
  if (process.platform !== 'win32') {
    return 'not-applicable'
  }

  const state = await observeShellExtensionRegistration()
  if (decideShellExtensionRepair(state) === 'none') {
    return state === 'absent' ? 'not-registered' : 'current'
  }

  try {
    await registerShellExtensionPackage()
    log.info(
      'Re-registered the Windows 11 shell extension: the previous registration pointed outside this install'
    )
    return 'repaired'
  } catch (error) {
    log.warn(
      'Could not re-register the stale Windows 11 shell extension registration',
      error
    )
    return 'failed'
  }
}
