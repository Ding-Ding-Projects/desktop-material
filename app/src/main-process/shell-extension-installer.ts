import * as Path from 'path'
import { execFile } from 'child_process'
import { cp } from 'fs/promises'
import { HKEY, enumerateValuesSafe } from 'registry-js'
import { pathExists } from '../lib/path-exists'
import {
  ContextMenuMode,
  IModernContextMenuObservation,
  ModernContextMenuBlocker,
  buildQueryPackageArguments,
  buildRegisterPackageArguments,
  buildUnregisterPackageArguments,
  decideContextMenuMode,
  decideShellExtensionPackageSource,
  parsePackageRegistrationOutput,
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

/** Where the shell-extension package lives inside an install. */
export function shellExtensionPackageDirectory(): string {
  // `process.execPath` is the running executable, so a portable or side-by-side
  // install registers its own copy rather than another install's.
  return Path.join(Path.dirname(process.execPath), 'shell-extension')
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
 * Make the registrable layout exist, copying the shipped folder beside the
 * executable when this install has never registered before. Returns the
 * package directory, or null when this build ships no package at all.
 */
async function ensureRegistrableShellExtensionPackage(): Promise<
  string | null
> {
  const packageDirectory = shellExtensionPackageDirectory()
  const resourcesDirectory = shellExtensionResourcesDirectory()
  const [besideExecutable, insideResources] = await Promise.all([
    pathExists(Path.join(packageDirectory, 'AppxManifest.xml')),
    pathExists(Path.join(resourcesDirectory, 'AppxManifest.xml')),
  ])
  switch (
    decideShellExtensionPackageSource(besideExecutable, insideResources)
  ) {
    case 'beside-executable':
      return packageDirectory
    case 'copy-from-resources':
      await cp(resourcesDirectory, packageDirectory, { recursive: true })
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

async function isPackageRegistered(): Promise<boolean> {
  try {
    return parsePackageRegistrationOutput(
      await runPowerShell(buildQueryPackageArguments())
    )
  } catch {
    // A failed query means we cannot prove it is registered, which for a status
    // display is the same as not registered.
    return false
  }
}

/** Probe everything the mode decision depends on. */
export async function observeModernContextMenu(): Promise<IModernContextMenuObservation> {
  if (process.platform !== 'win32') {
    return {
      isWindows11OrLater: false,
      packagePresent: false,
      canRegisterLoosePackage: false,
      packageRegistered: false,
    }
  }

  // Present in either location counts: registration self-heals the layout by
  // copying the shipped folder beside the executable.
  const [besideExecutable, insideResources, packageRegistered] =
    await Promise.all([
      pathExists(
        Path.join(shellExtensionPackageDirectory(), 'AppxManifest.xml')
      ),
      pathExists(
        Path.join(shellExtensionResourcesDirectory(), 'AppxManifest.xml')
      ),
      isPackageRegistered(),
    ])
  const packagePresent =
    decideShellExtensionPackageSource(besideExecutable, insideResources) !==
    'missing'

  return {
    isWindows11OrLater: isWindows11OrLater(),
    packagePresent,
    canRegisterLoosePackage: canRegisterLoosePackage(),
    packageRegistered,
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
 * The app's install directory is passed as the external location, which is what
 * lets the package reference binaries that live outside it.
 */
export async function registerShellExtensionPackage(): Promise<void> {
  const packageDirectory = await ensureRegistrableShellExtensionPackage()

  if (packageDirectory === null) {
    throw new Error(
      'This build does not include the Windows 11 shell extension package.'
    )
  }

  await runPowerShell(
    buildRegisterPackageArguments(
      Path.join(packageDirectory, 'AppxManifest.xml'),
      Path.dirname(process.execPath)
    )
  )
}

/** Remove the registered package for the current user. */
export async function unregisterShellExtensionPackage(): Promise<void> {
  await runPowerShell(buildUnregisterPackageArguments())
}
