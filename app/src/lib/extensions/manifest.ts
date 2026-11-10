/**
 * Extension manifests, permissions and consent.
 *
 * An extension is a folder holding `extension.json`. It runs as its own
 * process and talks to the app through a small JSON protocol (see
 * `protocol.ts`), so it can be written in any language. It only ever receives
 * what its declared permissions allow, and it never receives credentials.
 */

export const ExtensionManifestFileName = 'extension.json'
export const ExtensionManifestVersion = 1
export const MaxExtensionManifestBytes = 64 * 1024

export const ExtensionPermissions = [
  'repository-path',
  'changed-files',
  'branch-name',
  'read-tracked-files',
] as const
export type ExtensionPermission = (typeof ExtensionPermissions)[number]

export const ExtensionPermissionLabels: Readonly<
  Record<ExtensionPermission, string>
> = {
  'repository-path': 'See where the repository is on this computer',
  'changed-files': 'See the names of changed files',
  'branch-name': 'See the name of the current branch',
  'read-tracked-files': 'Read the files Git tracks in the repository',
}

export interface IExtensionManifest {
  readonly manifestVersion: number
  /** Lower-case id, unique among installed extensions. */
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly permissions: ReadonlyArray<ExtensionPermission>
  /** Program to run, relative to the extension folder or a bare command name. */
  readonly command: string
  readonly args: ReadonlyArray<string>
}

export type ExtensionManifestResult =
  | { readonly ok: true; readonly manifest: IExtensionManifest }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> }

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max

/** Parse and check a manifest. Every problem is reported, not only the first. */
export function parseExtensionManifest(text: string): ExtensionManifestResult {
  if (text.length > MaxExtensionManifestBytes) {
    return { ok: false, errors: ['The manifest is larger than 64 KB.'] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['The manifest is not valid JSON.'] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['The manifest must be a JSON object.'] }
  }
  const source = raw as Record<string, unknown>
  const errors = new Array<string>()

  if (source.manifestVersion !== ExtensionManifestVersion) {
    errors.push(`manifestVersion must be ${ExtensionManifestVersion}.`)
  }
  if (
    typeof source.id !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(source.id)
  ) {
    errors.push(
      'id must be 3 to 50 lower-case letters, digits or hyphens, and not start or end with a hyphen.'
    )
  }
  if (!isText(source.name, 80)) {
    errors.push('name is required and at most 80 characters.')
  }
  if (
    typeof source.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(source.version)
  ) {
    errors.push('version must look like 1.2.3.')
  }
  if (!isText(source.description, 400)) {
    errors.push('description is required and at most 400 characters.')
  }
  const permissions = Array.isArray(source.permissions)
    ? source.permissions
    : null
  if (permissions === null) {
    errors.push('permissions must be a list (it may be empty).')
  } else {
    for (const permission of permissions) {
      if (!ExtensionPermissions.includes(permission as ExtensionPermission)) {
        errors.push(`Unknown permission: ${String(permission).slice(0, 60)}.`)
      }
    }
  }
  if (
    !isText(source.command, 260) ||
    /[\r\n\0]/.test(source.command as string) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(source.command as string)
  ) {
    errors.push(
      'command is required, at most 260 characters, and must not leave the extension folder with "..".'
    )
  }
  const args = source.args === undefined ? [] : source.args
  if (
    !Array.isArray(args) ||
    args.length > 32 ||
    args.some(a => typeof a !== 'string' || a.length > 1000 || /\0/.test(a))
  ) {
    errors.push('args must be a list of at most 32 strings.')
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    manifest: {
      manifestVersion: ExtensionManifestVersion,
      id: source.id as string,
      name: (source.name as string).trim(),
      version: source.version as string,
      description: (source.description as string).trim(),
      permissions: [
        ...new Set(permissions as ReadonlyArray<ExtensionPermission>),
      ].sort(),
      command: source.command as string,
      args: args as ReadonlyArray<string>,
    },
  }
}

/** What the person has agreed to, per extension id. */
export type ExtensionConsents = Readonly<
  Record<string, ReadonlyArray<ExtensionPermission>>
>

/**
 * Permissions the person has not agreed to yet. A new extension lists all of
 * its permissions; an update lists only what it added.
 */
export function permissionsNeedingConsent(
  manifest: IExtensionManifest,
  consents: ExtensionConsents
): ReadonlyArray<ExtensionPermission> {
  const granted = new Set(consents[manifest.id] ?? [])
  return manifest.permissions.filter(permission => !granted.has(permission))
}

/** An extension may run only when it is enabled and nothing awaits consent. */
export function canRunExtension(
  manifest: IExtensionManifest,
  consents: ExtensionConsents,
  enabled: boolean
): boolean {
  return (
    enabled &&
    manifest.id in consents &&
    permissionsNeedingConsent(manifest, consents).length === 0
  )
}

/** Record consent for exactly what the manifest asks for today. */
export function grantExtensionConsent(
  manifest: IExtensionManifest,
  consents: ExtensionConsents
): ExtensionConsents {
  return { ...consents, [manifest.id]: [...manifest.permissions] }
}

export function revokeExtensionConsent(
  id: string,
  consents: ExtensionConsents
): ExtensionConsents {
  const { [id]: _removed, ...rest } = consents
  return rest
}

export interface IInstalledExtension {
  /** Folder name under the extensions root. */
  readonly folder: string
  readonly builtIn: boolean
  readonly manifest: IExtensionManifest | null
  /** Why the manifest could not be used. Empty when it is valid. */
  readonly errors: ReadonlyArray<string>
  readonly enabled: boolean
  readonly needsConsent: ReadonlyArray<ExtensionPermission>
  readonly canRun: boolean
}
