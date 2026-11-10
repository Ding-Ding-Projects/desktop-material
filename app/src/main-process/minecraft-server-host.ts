import { ChildProcess, spawn as nodeSpawn } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import * as Path from 'path'

import {
  IMinecraftServer,
  IMinecraftServerState,
  MinecraftConsoleBuffer,
  MinecraftServerDraft,
  MinecraftServerStatus,
  acceptedMinecraftEulaText,
  isMinecraftEulaAccepted,
  isMinecraftReadyLine,
  minecraftServerArguments,
  normalizeMinecraftCommand,
  reduceMinecraftPlayers,
  validateMinecraftServer,
} from '../lib/minecraft/server'

const StateFileName = 'servers.json'
const MaxServers = 50
const StopGraceMs = 20_000

/** Environment names a Java server legitimately needs. Nothing else passes. */
const PassedEnvironment = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'JAVA_HOME',
  'LANG',
  'LC_ALL',
]

export type MinecraftSpawn = (
  command: string,
  args: ReadonlyArray<string>,
  options: { cwd: string; env: Record<string, string> }
) => ChildProcess

interface IRunningServer {
  readonly child: ChildProcess
  status: MinecraftServerStatus
  killTimer: NodeJS.Timeout | null
}

export interface IMinecraftConsolePage {
  /** Pass this back as `after` to get only newer lines. */
  readonly next: number
  readonly lines: ReadonlyArray<string>
  readonly status: MinecraftServerStatus
}

/**
 * Owns the local Minecraft servers: the saved list, the EULA guard, the Java
 * processes and their consoles. The window only asks; every check is repeated
 * here in the privileged process.
 */
export class MinecraftServerHost {
  private servers: ReadonlyArray<IMinecraftServer> | null = null
  private readonly running = new Map<string, IRunningServer>()
  private readonly consoles = new Map<
    string,
    { buffer: MinecraftConsoleBuffer; total: number }
  >()
  private readonly messages = new Map<string, string>()
  private readonly online = new Map<string, ReadonlyArray<string>>()

  public constructor(
    private readonly root: string,
    private readonly spawn: MinecraftSpawn = (command, args, options) =>
      nodeSpawn(command, [...args], {
        ...options,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    private readonly now: () => Date = () => new Date()
  ) {}

  private async load(): Promise<ReadonlyArray<IMinecraftServer>> {
    if (this.servers !== null) {
      return this.servers
    }
    let servers: ReadonlyArray<IMinecraftServer> = []
    try {
      const parsed = JSON.parse(
        await readFile(Path.join(this.root, StateFileName), 'utf8')
      )
      if (Array.isArray(parsed?.servers)) {
        servers = parsed.servers
          .filter(
            (s: any) =>
              typeof s?.id === 'string' &&
              typeof s?.name === 'string' &&
              typeof s?.directory === 'string' &&
              typeof s?.jar === 'string' &&
              typeof s?.javaPath === 'string' &&
              validateMinecraftServer(s).length === 0
          )
          .slice(0, MaxServers)
          .map((s: IMinecraftServer) => ({
            id: s.id,
            name: s.name,
            directory: s.directory,
            jar: s.jar,
            javaPath: s.javaPath,
            memoryMegabytes: s.memoryMegabytes,
            port: s.port,
          }))
      }
    } catch {
      // No saved list yet, or an unreadable one: start empty.
    }
    this.servers = servers
    return servers
  }

  private async save(servers: ReadonlyArray<IMinecraftServer>) {
    this.servers = servers
    await mkdir(this.root, { recursive: true })
    await writeFile(
      Path.join(this.root, StateFileName),
      JSON.stringify({ version: 1, servers }, null, 2)
    )
  }

  private async find(id: string): Promise<IMinecraftServer> {
    const server = (await this.load()).find(s => s.id === id)
    if (server === undefined) {
      throw new Error('That server is no longer in the list.')
    }
    return server
  }

  private statusOf(id: string): MinecraftServerStatus {
    return (
      this.running.get(id)?.status ??
      (this.messages.has(id) ? 'crashed' : 'stopped')
    )
  }

  private async eulaAccepted(server: IMinecraftServer): Promise<boolean> {
    try {
      return isMinecraftEulaAccepted(
        await readFile(Path.join(server.directory, 'eula.txt'), 'utf8')
      )
    } catch {
      return false
    }
  }

  public async list(): Promise<ReadonlyArray<IMinecraftServerState>> {
    const servers = await this.load()
    return Promise.all(
      servers.map(async server => ({
        server,
        status: this.statusOf(server.id),
        eulaAccepted: await this.eulaAccepted(server),
        message: this.messages.get(server.id) ?? null,
      }))
    )
  }

  /** Add a server, or change one that is not running. */
  public async saveServer(
    draft: MinecraftServerDraft,
    id: string | null
  ): Promise<ReadonlyArray<string>> {
    const errors = validateMinecraftServer(draft)
    if (errors.length > 0) {
      return errors
    }
    const servers = await this.load()
    const clean: MinecraftServerDraft = {
      name: draft.name.trim(),
      directory: draft.directory.trim(),
      jar: draft.jar.trim(),
      javaPath: draft.javaPath.trim(),
      memoryMegabytes: draft.memoryMegabytes,
      port: draft.port,
    }
    if (id === null) {
      if (servers.length >= MaxServers) {
        return [`The list holds at most ${MaxServers} servers.`]
      }
      await this.save([...servers, { id: randomUUID(), ...clean }])
      return []
    }
    if (this.running.has(id)) {
      return ['Stop the server before changing it.']
    }
    await this.find(id)
    await this.save(servers.map(s => (s.id === id ? { id, ...clean } : s)))
    return []
  }

  /** Forget a server. Its folder and world are never touched. */
  public async remove(id: string): Promise<void> {
    if (this.running.has(id)) {
      throw new Error('Stop the server before removing it from the list.')
    }
    await this.save((await this.load()).filter(s => s.id !== id))
    this.consoles.delete(id)
    this.messages.delete(id)
  }

  /** Record that the person accepted the Minecraft EULA for this folder. */
  public async acceptEula(id: string): Promise<void> {
    const server = await this.find(id)
    await writeFile(
      Path.join(server.directory, 'eula.txt'),
      acceptedMinecraftEulaText(this.now())
    )
  }

  private record(id: string, chunk: string) {
    let entry = this.consoles.get(id)
    if (entry === undefined) {
      entry = { buffer: new MinecraftConsoleBuffer(), total: 0 }
      this.consoles.set(id, entry)
    }
    const lines = entry.buffer.append(chunk)
    entry.total += lines.length
    return lines
  }

  /** Start a server. Returns why it could not start, or null. */
  public async start(id: string): Promise<string | null> {
    const server = await this.find(id)
    if (this.running.has(id)) {
      return 'That server is already running.'
    }
    if (!(await this.eulaAccepted(server))) {
      return 'Accept the Minecraft EULA for this server first.'
    }
    try {
      const jar = await stat(Path.join(server.directory, server.jar))
      if (!jar.isFile()) {
        throw new Error('not a file')
      }
    } catch {
      return `${server.jar} was not found in the server folder.`
    }

    const env: Record<string, string> = {}
    for (const name of PassedEnvironment) {
      const value = process.env[name]
      if (value !== undefined) {
        env[name] = value
      }
    }

    let child: ChildProcess
    try {
      child = this.spawn(server.javaPath, minecraftServerArguments(server), {
        cwd: server.directory,
        env,
      })
    } catch (error) {
      return `Java could not be started: ${(error as Error).message}`
    }

    const entry: IRunningServer = { child, status: 'starting', killTimer: null }
    this.running.set(id, entry)
    this.messages.delete(id)
    this.record(id, `--- Starting ${server.name} ---\n`)

    const onOutput = (data: Buffer | string) => {
      for (const line of this.record(id, data.toString())) {
        if (entry.status === 'starting' && isMinecraftReadyLine(line)) {
          entry.status = 'running'
        }
        this.online.set(
          id,
          reduceMinecraftPlayers(this.online.get(id) ?? [], line)
        )
      }
    }
    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', onOutput)

    const finish = (reason: string | null) => {
      if (this.running.get(id) !== entry) {
        return
      }
      if (entry.killTimer !== null) {
        clearTimeout(entry.killTimer)
      }
      this.running.delete(id)
      this.online.delete(id)
      const asked = entry.status === 'stopping'
      if (!asked && reason !== null) {
        this.messages.set(id, reason)
      }
      this.record(id, `--- ${asked ? 'Stopped' : (reason ?? 'Stopped')} ---\n`)
    }
    child.on('error', error =>
      finish(`Java could not be started: ${error.message}`)
    )
    child.on('exit', (code, signal) =>
      finish(
        code === 0
          ? null
          : `The server stopped unexpectedly (${
              signal ?? `exit code ${code}`
            }).`
      )
    )
    return null
  }

  /** Ask a server to stop, saving its world; force it only after a wait. */
  public async stop(id: string): Promise<void> {
    const entry = this.running.get(id)
    if (entry === undefined || entry.status === 'stopping') {
      return
    }
    entry.status = 'stopping'
    entry.child.stdin?.write('stop\n')
    entry.killTimer = setTimeout(() => entry.child.kill(), StopGraceMs)
  }

  /** Send one console command. Returns false when it was not sent. */
  public async command(id: string, command: string): Promise<boolean> {
    const entry = this.running.get(id)
    const line = normalizeMinecraftCommand(command)
    if (entry === undefined || line === null || entry.status === 'stopping') {
      return false
    }
    this.record(id, `> ${line}\n`)
    entry.child.stdin?.write(`${line}\n`)
    return true
  }

  /** Console lines after a position, for polling. */
  public console(id: string, after: number): IMinecraftConsolePage {
    const entry = this.consoles.get(id)
    const status = this.statusOf(id)
    if (entry === undefined) {
      return { next: 0, lines: [], status }
    }
    const kept = entry.buffer.lines
    const wanted = Math.max(
      0,
      Math.min(kept.length, entry.total - Math.max(0, Math.floor(after) || 0))
    )
    return {
      next: entry.total,
      lines: wanted === 0 ? [] : kept.slice(kept.length - wanted),
      status,
    }
  }

  /** Who is online, from the server's join and leave lines. */
  public players(id: string): ReadonlyArray<string> {
    return this.online.get(id) ?? []
  }

  /** Stop everything at once; used when the app is closing. */
  public stopAll() {
    for (const entry of this.running.values()) {
      entry.status = 'stopping'
      entry.child.stdin?.write('stop\n')
    }
  }
}
