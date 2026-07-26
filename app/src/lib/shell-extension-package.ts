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
    ProcessorArchitecture="x64" />

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
 */
export function decideShellExtensionPackageSource(
  besideExecutable: boolean,
  insideResources: boolean
): ShellExtensionPackageSource {
  if (besideExecutable) {
    return 'beside-executable'
  }
  return insideResources ? 'copy-from-resources' : 'missing'
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

/** What the main process observed about the modern route. */
export interface IModernContextMenuObservation {
  readonly isWindows11OrLater: boolean
  /** The generated package directory exists in this install. */
  readonly packagePresent: boolean
  /** `Add-AppxPackage -Register` is permitted for this user. */
  readonly canRegisterLoosePackage: boolean
  /** The package is currently registered for this user. */
  readonly packageRegistered: boolean
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
      : null

  if (observation.packageRegistered) {
    // Registration is the ground truth: if the package is live the menu is
    // modern regardless of what the prerequisites now report.
    return { mode: 'modern', modernBlocker: null }
  }

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

/** PowerShell argv reporting whether the package is registered. */
export function buildQueryPackageArguments(): ReadonlyArray<string> {
  return Object.freeze([
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `if (Get-AppxPackage -Name '${ShellExtensionPackageName}') { 'registered' } else { 'absent' }`,
  ])
}

/** Interpret the output of {@link buildQueryPackageArguments}. */
export function parsePackageRegistrationOutput(output: string): boolean {
  return output.trim().toLowerCase() === 'registered'
}
