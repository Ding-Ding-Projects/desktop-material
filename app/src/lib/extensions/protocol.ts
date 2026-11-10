/**
 * The extension protocol: one JSON request on standard input, one JSON
 * response on standard output, then the process exits. Language-neutral, with
 * hard limits on time and size so an extension cannot hang or flood the app.
 */

import { ExtensionPermission, IExtensionManifest } from './manifest'

export const ExtensionProtocolVersion = 1
export const ExtensionTimeoutMs = 10_000
export const MaxExtensionOutputBytes = 256 * 1024
export const MaxExtensionResultCharacters = 20_000
export const MaxExtensionChangedFiles = 2000

export interface IExtensionContext {
  readonly repositoryPath: string
  readonly branchName: string | null
  readonly changedFiles: ReadonlyArray<string>
}

export interface IExtensionRequest {
  readonly protocol: number
  readonly action: 'run'
  readonly extension: { readonly id: string; readonly version: string }
  readonly repositoryPath?: string
  readonly branchName?: string | null
  readonly changedFiles?: ReadonlyArray<string>
}

export type ExtensionRunResult =
  | { readonly ok: true; readonly title: string; readonly text: string }
  | { readonly ok: false; readonly error: string }

const has = (manifest: IExtensionManifest, permission: ExtensionPermission) =>
  manifest.permissions.includes(permission)

/**
 * Build the request. Only fields covered by a declared permission are
 * included, and credentials are never part of the context at all.
 */
export function buildExtensionRequest(
  manifest: IExtensionManifest,
  context: IExtensionContext
): IExtensionRequest {
  const needsPath =
    has(manifest, 'repository-path') || has(manifest, 'read-tracked-files')
  return {
    protocol: ExtensionProtocolVersion,
    action: 'run',
    extension: { id: manifest.id, version: manifest.version },
    ...(needsPath ? { repositoryPath: context.repositoryPath } : {}),
    ...(has(manifest, 'branch-name') ? { branchName: context.branchName } : {}),
    ...(has(manifest, 'changed-files')
      ? {
          changedFiles: context.changedFiles.slice(0, MaxExtensionChangedFiles),
        }
      : {}),
  }
}

/** Read an extension's output. Anything malformed is an error, never a guess. */
export function parseExtensionResponse(output: string): ExtensionRunResult {
  if (Buffer.byteLength(output, 'utf8') > MaxExtensionOutputBytes) {
    return { ok: false, error: 'The extension wrote more than 256 KB.' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(output)
  } catch {
    return { ok: false, error: 'The extension did not answer with JSON.' }
  }
  const source = raw as Record<string, unknown> | null
  if (typeof source !== 'object' || source === null) {
    return { ok: false, error: 'The extension did not answer with an object.' }
  }
  if (source.protocol !== ExtensionProtocolVersion) {
    return {
      ok: false,
      error: `The extension answered with protocol ${String(
        source.protocol
      ).slice(0, 20)}; this app speaks protocol ${ExtensionProtocolVersion}.`,
    }
  }
  if (source.ok === false) {
    return {
      ok: false,
      error:
        typeof source.error === 'string' && source.error.trim().length > 0
          ? source.error.slice(0, 500)
          : 'The extension reported a failure without a message.',
    }
  }
  if (source.ok !== true || typeof source.text !== 'string') {
    return {
      ok: false,
      error: 'The extension answer needs "ok" and a "text" string.',
    }
  }
  return {
    ok: true,
    title:
      typeof source.title === 'string' && source.title.trim().length > 0
        ? source.title.slice(0, 120)
        : 'Result',
    text: source.text.slice(0, MaxExtensionResultCharacters),
  }
}
