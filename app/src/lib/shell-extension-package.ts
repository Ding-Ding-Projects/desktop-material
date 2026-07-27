/**
 * Pure generator for the sparse MSIX package that puts Desktop Material's verbs
 * in the *top-level* Windows 11 context menu.
 *
 * Windows 11 shows only packaged `IExplorerCommand` handlers in its compact
 * menu; classic `Directory\shell` verbs are relegated to "Show more options".
 * The modern route therefore needs three things, all generated here:
 *
 *  1. an `AppxManifest.xml` declaring a `windows.comServer` in-process handler
 *     and a `desktop4:FileExplorerContextMenus` extension bound to its CLSID;
 *  2. a *sparse* package — `<uap10:AllowExternalContent>` — so the binaries stay
 *     in the app's ordinary install directory rather than being copied into a
 *     locked package root; and
 *  3. a registration command, run per user, with no elevation.
 *
 * ## Why registration can fail, honestly
 *
 * A signed MSIX only installs if its signing certificate is trusted, and
 * trusting a self-signed certificate means writing a machine-wide store — an
 * administrator action this feature will not take. The path that genuinely
 * works per user is a *loose registration* of the manifest
 * (`Add-AppxPackage -Register`), which needs no signature but does require the
 * user to have Developer Mode (or sideloading) enabled.
 *
 * So the modern route is offered, its single prerequisite is stated plainly,
 * and when registration fails the classic verbs remain as the working fallback.
 * The settings pane reports which mode is actually active rather than assuming
 * the better one succeeded.
 */

/** The identity of the sparse package. Stable: changing it orphans installs. */
export const ShellExtensionPackageName = 'DesktopMaterial.ShellExtension'
export const ShellExtensionPackageDisplayName = 'Desktop Material shell actions'
export const ShellExtensionPackageVersion = '1.0.0.0'

/**
 * The COM class the extension registers, matching the CLSID compiled into
 * `shell-extension/src/dllmain.cpp`. The two must stay identical; the contract
 * test asserts it.
 */
export const ShellExtensionClsid = '{6E2F4C1A-6E5D-4D5B-9D3F-3F0B2A7C9D41}'

/** The DLL filename produced by the shell-extension build. */
export const ShellExtensionDllName = 'DesktopMaterialShellExtension.dll'

/** Native architectures supported by the Windows product and Explorer. */
export type ShellExtensionArchitecture = 'x64' | 'arm64'

/**
 * The CLSID in the form the MSIX manifest schema requires: a bare, lower-case
 * GUID with no braces. The braced form above is the one Windows uses elsewhere,
 * so both are derived from a single constant rather than written twice.
 */
export function manifestClsid(clsid: string = ShellExtensionClsid): string {
  const bare = clsid.replace(/^\{|\}$/g, '').toLowerCase()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bare)
  ) {
    throw new Error(`Not a well-formed CLSID: ${clsid}`)
  }
  return bare
}

/** Inputs the manifest depends on. */
export interface IShellExtensionManifestOptions {
  /** Must match both the native DLL and the target device's File Explorer. */
  readonly architecture: ShellExtensionArchitecture
  /**
   * The publisher subject the package is registered under. For a loose
   * registration this is not verified, but it must be a well-formed X.500 name.
   */
  readonly publisher: string
  /** Display name shown in Settings → Apps for the registered package. */
  readonly publisherDisplayName: string
  /** Relative path, inside the external location, of the extension DLL. */
  readonly dllPath: string
  /** Relative path of the application executable, for the package identity. */
  readonly executablePath: string
  /**
   * Relative path of the directory holding the package logo assets. Every path
   * in the manifest resolves against the external location — the app's own
   * install directory — not against the manifest's own folder.
   */
  readonly assetsPath: string
}

/**
 * Characters an unquoted X.500 attribute value may not contain, per the
 * `Publisher` pattern the MSIX manifest schema enforces.
 */
const X500ValueNeedsQuoting = /[,+="<>#;]/

/**
 * Build a `Publisher` value from a common name.
 *
 * The schema's pattern rejects an unquoted value containing a comma, so
 * `CN=GitHub, Inc.` fails to parse while `CN="GitHub, Inc."` is accepted. This
 * is generated rather than hand-written because the failure only surfaces at
 * packaging time, long after the value is edited.
 */
export function formatX500Publisher(commonName: string): string {
  if (commonName.includes('"')) {
    throw new Error('Publisher common name must not contain a double quote')
  }
  return X500ValueNeedsQuoting.test(commonName)
    ? `CN="${commonName}"`
    : `CN=${commonName}`
}

/** Escape a value for an XML attribute or text node. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Reject a path that could escape the package's external location.
 *
 * Manifest paths are relative and are resolved by Windows against the external
 * location; a traversal segment or an absolute path would point the shell at a
 * binary outside the app's own directory.
 */
export function assertPackageRelativePath(value: string): string {
  if (value.length === 0) {
    throw new Error('Package-relative path must not be empty')
  }
  if (/^[A-Za-z]:|^[\\/]/.test(value)) {
    throw new Error(`Package-relative path must not be absolute: ${value}`)
  }
  if (value.split(/[\\/]/).includes('..')) {
    throw new Error(`Package-relative path must not traverse upwards: ${value}`)
  }
  return value.replace(/\//g, '\\')
}

/**
 * Generate the `AppxManifest.xml` for the sparse package.
 *
 * `uap10:AllowExternalContent` plus the `-ExternalLocation` argument on
 * registration is what makes this sparse: the package supplies identity and
 * extension declarations only, while every binary is loaded from the app's real
 * install directory.
 */
export function buildShellExtensionManifest(
  options: IShellExtensionManifestOptions
): string {
  const dllPath = assertPackageRelativePath(options.dllPath)
  const executablePath = assertPackageRelativePath(options.executablePath)
  const assetsPath = assertPackageRelativePath(options.assetsPath)
  const clsid = manifestClsid()

  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
  xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
  xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
  IgnorableNamespaces="uap uap10 rescap desktop4 desktop5 com">

  <Identity
    Name="${escapeXml(ShellExtensionPackageName)}"
    Publisher="${escapeXml(options.publisher)}"
    Version="${ShellExtensionPackageVersion}"
    ProcessorArchitecture="${options.architecture}" />

  <Properties>
    <DisplayName>${escapeXml(ShellExtensionPackageDisplayName)}</DisplayName>
    <PublisherDisplayName>${escapeXml(
      options.publisherDisplayName
    )}</PublisherDisplayName>
    <Logo>${escapeXml(`${assetsPath}\\StoreLogo.png`)}</Logo>
    <!-- Sparse package: binaries live in the external location, not here. -->
    <uap10:AllowExternalContent>true</uap10:AllowExternalContent>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily
      Name="Windows.Desktop"
      MinVersion="10.0.22000.0"
      MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us" />
  </Resources>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>

  <Applications>
    <Application
      Id="DesktopMaterial"
      Executable="${escapeXml(executablePath)}"
      uap10:TrustLevel="mediumIL"
      uap10:RuntimeBehavior="win32App">
      <uap:VisualElements
        DisplayName="${escapeXml(ShellExtensionPackageDisplayName)}"
        Description="${escapeXml(ShellExtensionPackageDisplayName)}"
        BackgroundColor="transparent"
        Square150x150Logo="${escapeXml(`${assetsPath}\\Square150x150Logo.png`)}"
        Square44x44Logo="${escapeXml(`${assetsPath}\\Square44x44Logo.png`)}"
        AppListEntry="none" />
      <Extensions>
        <!-- The in-process COM server that implements IExplorerCommand. -->
        <com:Extension Category="windows.comServer">
          <com:ComServer>
            <com:SurrogateServer DisplayName="${escapeXml(
              ShellExtensionPackageDisplayName
            )}">
              <com:Class Id="${clsid}" Path="${escapeXml(
    dllPath
  )}" ThreadingModel="STA" />
            </com:SurrogateServer>
          </com:ComServer>
        </com:Extension>
        <!-- Bind the handler to folders and folder backgrounds. Explorer shows
             these in the top-level Windows 11 menu.

             The ItemType elements come from the desktop5 schema, not desktop4:
             desktop4's own ItemType only accepts file extensions and '*', while
             'Directory' and 'Directory\\Background' were added in v5. -->
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type="Directory">
              <desktop5:Verb Id="DesktopMaterialFolder" Clsid="${clsid}" />
            </desktop5:ItemType>
            <desktop5:ItemType Type="Directory\\Background">
              <desktop5:Verb Id="DesktopMaterialBackground" Clsid="${clsid}" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
`
}

/** Which context-menu implementation is actually serving the user. */
/** Where the registrable package directory can come from in this install. */
export type ShellExtensionPackageSource =
  /** Already beside the executable — the layout registration requires. */
  | 'beside-executable'
  /** Shipped inside the packaged app resources; copy it beside the exe. */
  | 'copy-from-resources'
  /** This build does not include the package at all. */
  | 'missing'

/**
 * Decide where the registrable package comes from.
 *
 * Packaged builds ship `shell-extension/` inside the app resources (the
 * packager bundles the whole app directory), but registration needs it beside
 * `GitHubDesktop.exe`: the manifest's `shell-extension\...` paths resolve
 * against the external location, which must also contain the executable.
 * Copying once at registration self-heals every already-shipped build — the
 * 2026-07-26 live verification found no shipped build could register at all
 * because the folder only existed under `resources\app`.
 *
 * `refresh` re-copies over a folder that is already in place. It matters now
 * that the external location outlives a single version
 * ({@link decideShellExtensionExternalLocation}): the copy left at the Squirrel
 * root by an earlier release would otherwise be the one every later release
 * registers, forever.
 */
export function decideShellExtensionPackageSource(
  besideExecutable: boolean,
  insideResources: boolean,
  refresh: boolean = false
): ShellExtensionPackageSource {
  if (refresh && insideResources) {
    return 'copy-from-resources'
  }
  if (besideExecutable) {
    return 'beside-executable'
  }
  return insideResources ? 'copy-from-resources' : 'missing'
}

/**
 * Squirrel's per-version install directory, for example
 * `app-3.6.3-beta3-zadtuyunxj`.
 *
 * Every update installs into a *new* one of these and eventually deletes the
 * old one, so an absolute path recorded inside one has a shelf life of exactly
 * one release.
 */
const SquirrelVersionDirectory =
  /^app-\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z][0-9A-Za-z.-]*)?$/i

/**
 * Compare two Windows paths for identity.
 *
 * Windows paths are case-insensitive and accept either separator, and the two
 * values compared here reach this module from different sources — one from a
 * PowerShell property, one from a `path.join` — so plain string equality would
 * report a mismatch between two spellings of the same directory.
 */
export function isSameWindowsPath(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .replace(/[\\/]+/g, '\\')
      .replace(/\\+$/, '')
      .toLowerCase()
  return normalize(left) === normalize(right)
}

/**
 * The version-stable root of a Squirrel install — the directory holding the
 * update stub and every `app-<version>` directory — or null when the given
 * directory is not one of those versioned directories (a development run, a
 * portable layout, or an unpackaged build directory).
 */
export function squirrelUpdateRoot(executableDirectory: string): string | null {
  const trimmed = executableDirectory.replace(/[\\/]+$/, '')
  const separator = Math.max(
    trimmed.lastIndexOf('\\'),
    trimmed.lastIndexOf('/')
  )
  if (separator <= 0) {
    return null
  }
  return SquirrelVersionDirectory.test(trimmed.slice(separator + 1))
    ? trimmed.slice(0, separator)
    : null
}

/**
 * Decide which directory a registration names as the package's external
 * location.
 *
 * Windows records that path inside the registration and never revisits it, so
 * naming the directory `process.execPath` lives in — `app-<version>` in an
 * installed build — makes the registration outlive the directory it points at.
 * The next update installs beside it and eventually deletes it, while the
 * package goes on reporting `Status: Ok` from a location that no longer exists
 * and the context menu silently disappears (issue #66).
 *
 * The Squirrel root one level up is the stable answer: it holds the stub
 * `GitHubDesktop.exe` that the manifest's `Executable` names and that Squirrel
 * keeps pointed at the current version, and it survives every update. It is
 * chosen only when that stub is really there — `updateRootHoldsLauncher` — so a
 * layout without one keeps the executable's own directory rather than
 * registering against a directory with no executable in it.
 */
export function decideShellExtensionExternalLocation(
  executableDirectory: string,
  updateRootHoldsLauncher: boolean
): string {
  const root = squirrelUpdateRoot(executableDirectory)
  return root !== null && updateRootHoldsLauncher ? root : executableDirectory
}

export type ContextMenuMode =
  /** The packaged handler is registered: verbs are in the top-level menu. */
  | 'modern'
  /** Classic verbs only: entries live under "Show more options". */
  | 'classic'
  /** Neither is installed. */
  | 'none'

/** Why the modern route is unavailable on this host. */
export type ModernContextMenuBlocker =
  /** Windows 11 or newer is required for the packaged top-level menu. */
  | 'requires-windows-11'
  /** The sparse package was not shipped with this build. */
  | 'package-missing'
  /** Loose registration needs Developer Mode or sideloading enabled. */
  | 'developer-mode-required'
  /**
   * A package is registered, but against a directory this install does not
   * own. Explorer shows nothing while the package still reports itself
   * installed, so this must never read as "on".
   */
  | 'registration-stale'

/** What Windows reports about the registered package. */
export interface IShellExtensionRegistration {
  readonly registered: boolean
  /**
   * The directory Windows recorded for the registered manifest, or null when
   * nothing is registered. A registration whose directory has since been
   * deleted reports it as empty, which reads as null here.
   */
  readonly installLocation: string | null
}

/** How the live registration relates to this install. */
export type ShellExtensionRegistrationState =
  /** Nothing is registered: the user has not turned the feature on. */
  | 'absent'
  /** Registered against this install: the top-level menu really is live. */
  | 'current'
  /**
   * Registered against a directory this install does not own — most often an
   * `app-<version>` directory a later update deleted.
   */
  | 'stale'

/** What the main process observed about the live registration. */
export interface IShellExtensionRegistrationObservation {
  readonly registration: IShellExtensionRegistration
  /** Whether the recorded install location still exists on disk. */
  readonly installLocationExists: boolean
  /** The manifest directory this install would register. */
  readonly expectedManifestDirectory: string
  /** The external location this install would register against. */
  readonly expectedExternalLocation: string
}

/**
 * Decide whether the live registration still belongs to this install.
 *
 * `Get-AppxPackage` reports `Status: Ok` for a sparse package whose recorded
 * directory has rotted away, so "is it registered" is not the question worth
 * asking — "is it registered against *this* install" is.
 */
export function decideShellExtensionRegistrationState(
  observation: IShellExtensionRegistrationObservation
): ShellExtensionRegistrationState {
  const location = observation.registration.installLocation

  if (!observation.registration.registered) {
    return 'absent'
  }
  if (location === null || location.length === 0) {
    // Registered with nowhere recorded. Windows reports this once the
    // registered directory is gone, which is exactly the rotted case.
    return 'stale'
  }
  if (!observation.installLocationExists) {
    return 'stale'
  }
  // Either recording convention counts. Windows records the manifest's own
  // directory, but a registration naming the external location must not read
  // as broken just because it spelled the same install differently.
  return isSameWindowsPath(location, observation.expectedManifestDirectory) ||
    isSameWindowsPath(location, observation.expectedExternalLocation)
    ? 'current'
    : 'stale'
}

/** What a launch-time freshness check should do about the registration. */
export type ShellExtensionRepairAction = 'none' | 're-register'

/**
 * Decide whether a launch silently repairs the registration.
 *
 * Only a registration that already exists is rewritten. Repair restores what
 * the user chose; it never makes the choice for them, so `absent` — the state
 * of every user who never turned the feature on, and of everyone who turned it
 * off — is left strictly alone.
 */
export function decideShellExtensionRepair(
  state: ShellExtensionRegistrationState
): ShellExtensionRepairAction {
  return state === 'stale' ? 're-register' : 'none'
}

/**
 * Whether the user can still operate the modern toggle despite `blocker`.
 *
 * A stale registration is the one blocker the toggle itself clears: turning it
 * on re-registers against the current install. Every other blocker is a host
 * prerequisite the app will not change, so the toggle stays disabled rather
 * than offering an action that cannot succeed.
 */
export function isModernContextMenuActionable(
  blocker: ModernContextMenuBlocker | null
): boolean {
  return blocker === null || blocker === 'registration-stale'
}

/** What the main process observed about the modern route. */
export interface IModernContextMenuObservation {
  readonly isWindows11OrLater: boolean
  /** The generated package directory exists in this install. */
  readonly packagePresent: boolean
  /** `Add-AppxPackage -Register` is permitted for this user. */
  readonly canRegisterLoosePackage: boolean
  /** How the live registration relates to this install. */
  readonly registrationState: ShellExtensionRegistrationState
}

/**
 * Decide which mode is active and, when the modern route is unavailable, why.
 *
 * Pure so the settings pane's honesty — it must never claim top-level placement
 * it does not have — is covered by a test rather than by inspection.
 */
export function decideContextMenuMode(
  observation: IModernContextMenuObservation,
  classicInstalled: boolean
): {
  readonly mode: ContextMenuMode
  readonly modernBlocker: ModernContextMenuBlocker | null
} {
  const modernBlocker: ModernContextMenuBlocker | null =
    !observation.isWindows11OrLater
      ? 'requires-windows-11'
      : !observation.packagePresent
      ? 'package-missing'
      : !observation.canRegisterLoosePackage
      ? 'developer-mode-required'
      : observation.registrationState === 'stale'
      ? 'registration-stale'
      : null

  if (observation.registrationState === 'current') {
    // A registration pointing at this install is the ground truth: the menu is
    // modern regardless of what the prerequisites now report.
    return { mode: 'modern', modernBlocker: null }
  }

  // A stale registration deliberately does *not* report `modern`. The package
  // exists, but Explorer is showing nothing from it, and reporting the mode the
  // package claims rather than the one the user has is what turned issue #66
  // from a broken feature into an invisible one.
  return {
    mode: classicInstalled ? 'classic' : 'none',
    modernBlocker,
  }
}

/**
 * PowerShell argv registering the sparse package for the current user.
 *
 * A loose `-Register` of the manifest is used rather than installing a signed
 * `.msix`, because trusting a self-signed certificate requires writing a
 * machine-wide certificate store — an administrator action this feature does
 * not take. Generated as argv, never a concatenated script string.
 */
export function buildRegisterPackageArguments(
  manifestPath: string,
  externalLocation: string
): ReadonlyArray<string> {
  return Object.freeze([
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Add-AppxPackage',
    '-Register',
    manifestPath,
    '-ExternalLocation',
    externalLocation,
  ])
}

/** PowerShell argv removing the registered package for the current user. */
export function buildUnregisterPackageArguments(): ReadonlyArray<string> {
  return Object.freeze([
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Get-AppxPackage -Name '${ShellExtensionPackageName}' | Remove-AppxPackage`,
  ])
}

/**
 * PowerShell argv reporting whether the package is registered *and where from*.
 *
 * The location is the half that matters: a registration recorded against a
 * deleted directory still reports itself as registered, so asking only the
 * yes/no question is how a dead context menu passes for a live one.
 */
export function buildQueryPackageArguments(): ReadonlyArray<string> {
  return Object.freeze([
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$package = @(Get-AppxPackage -Name '${ShellExtensionPackageName}')[0]; if ($package) { 'registered'; "$($package.InstallLocation)" } else { 'absent' }`,
  ])
}

/**
 * Interpret the output of {@link buildQueryPackageArguments}: the registration
 * flag on the first line, the recorded directory on the second.
 */
export function parsePackageRegistrationOutput(
  output: string
): IShellExtensionRegistration {
  const [flag = '', location = ''] = output.split(/\r?\n/)
  const registered = flag.trim().toLowerCase() === 'registered'
  const installLocation = location.trim()

  return {
    registered,
    installLocation:
      registered && installLocation.length > 0 ? installLocation : null,
  }
}
