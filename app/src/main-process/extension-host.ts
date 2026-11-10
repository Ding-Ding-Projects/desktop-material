import { spawn } from 'child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import * as Path from 'path'

import { AppNodeCommand, BuiltInExtensions } from '../lib/extensions/built-in'
import {
  ExtensionConsents,
  ExtensionManifestFileName,
  ExtensionPermission,
  ExtensionPermissions,
  IExtensionManifest,
  IInstalledExtension,
  MaxExtensionManifestBytes,
  canRunExtension,
  grantExtensionConsent,
  parseExtensionManifest,
  permissionsNeedingConsent,
  revokeExtensionConsent,
} from '../lib/extensions/manifest'
import {
  ExtensionRunResult,
  ExtensionTimeoutMs,
  IExtensionContext,
  MaxExtensionOutputBytes,
  buildExtensionRequest,
  parseExtensionResponse,
} from '../lib/extensions/protocol'

const BuiltInFolder = 'builtin'
const StateFileName = 'state.json'
const MaxInstalledExtensions = 200

interface IExtensionState {
  readonly consents: ExtensionConsents
  readonly disabled: ReadonlyArray<string>
}

/**
 * Owns the extensions folder: discovery, consent, enablement and running.
 * Everything is enforced here in the privileged process; the window only asks.
 */
export class ExtensionHost {
  public constructor(
    private readonly root: string,
    /** Program used for `@app-node`, with the environment it needs. */
    private readonly appNode: {
      readonly command: string
      readonly env: Readonly<Record<string, string>>
    }
  ) {}

  public get folder() {
    return this.root
  }

  /** Write the built-in extensions, replacing older copies of them. */
  public async installBuiltIns(): Promise<void> {
    for (const extension of BuiltInExtensions) {
      const folder = Path.join(this.root, BuiltInFolder, extension.id)
      await mkdir(folder, { recursive: true })
      await writeFile(
        Path.join(folder, ExtensionManifestFileName),
        extension.manifest
      )
      await writeFile(Path.join(folder, 'main.js'), extension.script)
    }
  }

  private async readState(): Promise<IExtensionState> {
    try {
      const raw = JSON.parse(
        await readFile(Path.join(this.root, StateFileName), 'utf8')
      ) as Partial<IExtensionState>
      const consents: Record<string, ReadonlyArray<ExtensionPermission>> = {}
      for (const [id, granted] of Object.entries(raw.consents ?? {})) {
        if (Array.isArray(granted)) {
          consents[id] = granted.filter(p => ExtensionPermissions.includes(p))
        }
      }
      return {
        consents,
        disabled: Array.isArray(raw.disabled)
          ? raw.disabled.filter(id => typeof id === 'string')
          : [],
      }
    } catch {
      return { consents: {}, disabled: [] }
    }
  }

  private async writeState(state: IExtensionState): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await writeFile(
      Path.join(this.root, StateFileName),
      JSON.stringify(state, null, 2)
    )
  }

  private async folders(): Promise<
    ReadonlyArray<{ folder: string; builtIn: boolean }>
  > {
    const list = async (directory: string) => {
      try {
        return (await readdir(directory, { withFileTypes: true }))
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort()
      } catch {
        return []
      }
    }
    const builtIns = (await list(Path.join(this.root, BuiltInFolder))).map(
      name => ({ folder: Path.join(BuiltInFolder, name), builtIn: true })
    )
    const installed = (await list(this.root))
      .filter(name => name !== BuiltInFolder)
      .map(name => ({ folder: name, builtIn: false }))
    return [...builtIns, ...installed].slice(0, MaxInstalledExtensions)
  }

  private async readManifest(folder: string) {
    const path = Path.join(this.root, folder, ExtensionManifestFileName)
    try {
      if ((await stat(path)).size > MaxExtensionManifestBytes) {
        return {
          ok: false as const,
          errors: ['The manifest is larger than 64 KB.'],
        }
      }
      return parseExtensionManifest(await readFile(path, 'utf8'))
    } catch {
      return {
        ok: false as const,
        errors: [`This folder has no ${ExtensionManifestFileName}.`],
      }
    }
  }

  public async list(): Promise<ReadonlyArray<IInstalledExtension>> {
    const state = await this.readState()
    const seen = new Set<string>()
    const result = new Array<IInstalledExtension>()
    for (const { folder, builtIn } of await this.folders()) {
      const parsed = await this.readManifest(folder)
      if (!parsed.ok) {
        result.push({
          folder,
          builtIn,
          manifest: null,
          errors: parsed.errors,
          enabled: false,
          needsConsent: [],
          canRun: false,
        })
        continue
      }
      const { manifest } = parsed
      if (seen.has(manifest.id)) {
        result.push({
          folder,
          builtIn,
          manifest: null,
          errors: [`Another extension already uses the id ${manifest.id}.`],
          enabled: false,
          needsConsent: [],
          canRun: false,
        })
        continue
      }
      seen.add(manifest.id)
      const enabled = !state.disabled.includes(manifest.id)
      result.push({
        folder,
        builtIn,
        manifest,
        errors: [],
        enabled,
        needsConsent:
          manifest.id in state.consents
            ? permissionsNeedingConsent(manifest, state.consents)
            : manifest.permissions,
        canRun: canRunExtension(manifest, state.consents, enabled),
      })
    }
    return result
  }

  private async find(id: string) {
    const found = (await this.list()).find(e => e.manifest?.id === id)
    if (found === undefined || found.manifest === null) {
      throw new Error('That extension is not installed.')
    }
    return { ...found, manifest: found.manifest }
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.find(id)
    const state = await this.readState()
    const disabled = state.disabled.filter(other => other !== id)
    await this.writeState({
      ...state,
      disabled: enabled ? disabled : [...disabled, id],
    })
  }

  /** Record consent for exactly what the installed manifest asks for now. */
  public async grantConsent(id: string): Promise<void> {
    const { manifest } = await this.find(id)
    const state = await this.readState()
    await this.writeState({
      ...state,
      consents: grantExtensionConsent(manifest, state.consents),
    })
  }

  public async revokeConsent(id: string): Promise<void> {
    const state = await this.readState()
    await this.writeState({
      ...state,
      consents: revokeExtensionConsent(id, state.consents),
    })
  }

  private resolveCommand(folder: string, manifest: IExtensionManifest) {
    if (manifest.command === AppNodeCommand) {
      return { command: this.appNode.command, env: this.appNode.env }
    }
    if (/[\\/]/.test(manifest.command)) {
      const base = Path.join(this.root, folder)
      const resolved = Path.resolve(base, manifest.command)
      if (!resolved.startsWith(base + Path.sep)) {
        throw new Error('The extension command leaves its own folder.')
      }
      return { command: resolved, env: {} }
    }
    return { command: manifest.command, env: {} }
  }

  /**
   * Run one extension. It gets a scrubbed environment (no tokens or other
   * variables from the app), only the context its permissions cover, a time
   * limit and an output limit.
   */
  public async run(
    id: string,
    context: IExtensionContext,
    timeoutMs: number = ExtensionTimeoutMs
  ): Promise<ExtensionRunResult> {
    const extension = await this.find(id)
    if (!extension.canRun) {
      return {
        ok: false,
        error: extension.enabled
          ? 'This extension needs your consent before it can run.'
          : 'This extension is switched off.',
      }
    }
    const { manifest, folder } = extension
    let target: { command: string; env: Readonly<Record<string, string>> }
    try {
      target = this.resolveCommand(folder, manifest)
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }

    const env: Record<string, string> = { ...target.env }
    for (const name of [
      'PATH',
      'Path',
      'SystemRoot',
      'windir',
      'TEMP',
      'TMP',
    ]) {
      const value = process.env[name]
      if (value !== undefined) {
        env[name] = value
      }
    }

    return new Promise<ExtensionRunResult>(resolve => {
      let settled = false
      const finish = (result: ExtensionRunResult) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(result)
        }
      }
      const child = spawn(target.command, [...manifest.args], {
        cwd: Path.join(this.root, folder),
        env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      const timer = setTimeout(() => {
        child.kill()
        finish({
          ok: false,
          error: `The extension did not finish within ${Math.round(
            timeoutMs / 1000
          )} seconds and was stopped.`,
        })
      }, timeoutMs)

      const chunks = new Array<Buffer>()
      let size = 0
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MaxExtensionOutputBytes) {
          child.kill()
          finish({ ok: false, error: 'The extension wrote more than 256 KB.' })
        } else {
          chunks.push(chunk)
        }
      })
      child.on('error', () =>
        finish({
          ok: false,
          error: 'The extension program could not be started.',
        })
      )
      child.on('close', () =>
        finish(parseExtensionResponse(Buffer.concat(chunks).toString('utf8')))
      )
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(buildExtensionRequest(manifest, context)))
    })
  }
}
