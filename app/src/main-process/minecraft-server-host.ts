import { ChildProcess, spawn as nodeSpawn } from 'child_process'
import { randomUUID } from 'crypto'
import {
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from 'fs/promises'
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
  setMinecraftServerProperty,
  validateMinecraftServer,
} from '../lib/minecraft/server'
import {
  IMinecraftNewWorld,
  IMinecraftPropertySpec,
  MaxMinecraftPropertiesBytes,
  checkMinecraftProperty,
  editableMinecraftProperties,
  minecraftBackupName,
  minecraftNewWorldProperties,
  minecraftWorldFolder,
  validateMinecraftNewWorld,
} from '../lib/minecraft/properties'
import {
  MaxMinecraftFileBytes,
  MaxMinecraftFileEntries,
  cleanMinecraftRelativePath,
  isViewableMinecraftFile,
  redactMinecraftSecrets,
  tailMinecraftText,
} from '../lib/minecraft/files'
import {
  IMinecraftSchedule,
  MaxMinecraftSchedules,
  MinecraftScheduleDraft,
  describeMinecraftSchedule,
  dueMinecraftSchedules,
  validateMinecraftSchedule,
} from '../lib/minecraft/schedules'

const StateFileName = 'servers.json'
const SchedulesFileName = 'schedules.json'
const RestartWaitMs = 60_000
const MaxServers = 50
const StopGraceMs = 20_000
const MaxBackups = 50
const BackupsFolder = 'backups'

export interface IMinecraftBackup {
  readonly name: string
  readonly createdAt: number
}

export interface IMinecraftFileEntry {
  readonly name: string
  readonly kind: 'folder' | 'file'
  readonly bytes: number
  /** Whether the panel may show it as text. */
  readonly viewable: boolean
}

export interface IMinecraftAddOn {
  readonly name: string
  readonly kind: 'plugin' | 'mod'
  readonly bytes: number
}

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
  private allSchedules: ReadonlyArray<IMinecraftSchedule> | null = null
  private readonly exitWaiters = new Map<string, Array<() => void>>()
  private lastTick: Date | null = null

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
    await this.saveSchedules(
      (await this.loadSchedules()).filter(s => s.serverId !== id)
    )
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
      for (const waiter of this.exitWaiters.get(id) ?? []) {
        waiter()
      }
      this.exitWaiters.delete(id)
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

  private async readProperties(server: IMinecraftServer): Promise<string> {
    try {
      const path = Path.join(server.directory, 'server.properties')
      if ((await stat(path)).size > MaxMinecraftPropertiesBytes) {
        throw new Error('server.properties is too large to read.')
      }
      return await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  /** The settings that may be changed, with their current values. */
  public async settings(id: string): Promise<
    ReadonlyArray<{
      readonly spec: IMinecraftPropertySpec
      readonly value: string
    }>
  > {
    return editableMinecraftProperties(
      await this.readProperties(await this.find(id))
    )
  }

  /**
   * Change one listed setting. Returns why it was refused, or null. A running
   * server reads the file only when it starts.
   */
  public async setSetting(
    id: string,
    key: string,
    value: string
  ): Promise<string | null> {
    const server = await this.find(id)
    const checked = checkMinecraftProperty(key, value)
    if (!checked.ok) {
      return checked.error
    }
    const text = await this.readProperties(server)
    await writeFile(
      Path.join(server.directory, 'server.properties'),
      setMinecraftServerProperty(text, key, checked.value)
    )
    return null
  }

  /** The folder name of the world the server uses now, if it is a plain one. */
  public async currentWorld(id: string): Promise<string | null> {
    return minecraftWorldFolder(await this.readProperties(await this.find(id)))
  }

  /**
   * Point the server at a new world that it will generate the next time it
   * starts. Only while stopped, and only to a folder name that does not exist
   * yet, so no existing world is touched or replaced.
   */
  public async newWorld(
    id: string,
    world: IMinecraftNewWorld
  ): Promise<ReadonlyArray<string>> {
    const server = await this.find(id)
    if (this.running.has(id)) {
      return ['Stop the server before creating a new world.']
    }
    const errors = validateMinecraftNewWorld(world)
    if (errors.length > 0) {
      return errors
    }
    try {
      const existing = await readdir(server.directory)
      if (
        existing.some(name => name.toLowerCase() === world.name.toLowerCase())
      ) {
        return ['Something with that name is already in the server folder.']
      }
    } catch {
      return ['The server folder could not be read.']
    }
    let text = await this.readProperties(server)
    for (const [key, value] of minecraftNewWorldProperties(world)) {
      text = setMinecraftServerProperty(text, key, value)
    }
    await writeFile(Path.join(server.directory, 'server.properties'), text)
    return []
  }

  /** Backups of the world, newest first. */
  public async backups(id: string): Promise<ReadonlyArray<IMinecraftBackup>> {
    const server = await this.find(id)
    const folder = Path.join(server.directory, BackupsFolder)
    try {
      const entries = await readdir(folder, { withFileTypes: true })
      const backups = await Promise.all(
        entries
          .filter(entry => entry.isDirectory())
          .map(async entry => ({
            name: entry.name,
            createdAt: (await stat(Path.join(folder, entry.name))).mtimeMs,
          }))
      )
      return backups.sort((a, b) => b.createdAt - a.createdAt)
    } catch {
      return []
    }
  }

  /**
   * Copy the world into `backups/`. Only while the server is stopped, so the
   * copy is never taken from a world that is being written.
   */
  public async backup(id: string): Promise<string | null> {
    const server = await this.find(id)
    if (this.running.has(id)) {
      return 'Stop the server before backing up its world.'
    }
    const world = minecraftWorldFolder(await this.readProperties(server))
    if (world === null) {
      return 'The world folder name in server.properties cannot be backed up from here.'
    }
    const source = Path.join(server.directory, world)
    try {
      if (!(await stat(source)).isDirectory()) {
        throw new Error('not a folder')
      }
    } catch {
      return `There is no ${world} folder to back up yet.`
    }
    if ((await this.backups(id)).length >= MaxBackups) {
      return `There are already ${MaxBackups} backups. Remove some from the backups folder first.`
    }
    const destination = Path.join(
      server.directory,
      BackupsFolder,
      minecraftBackupName(world, this.now())
    )
    await mkdir(Path.dirname(destination), { recursive: true })
    try {
      await cp(source, destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
      })
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST'
        ? 'A backup with this time already exists. Try again in a moment.'
        : 'The world could not be copied.'
    }
    return null
  }

  /**
   * Resolve a panel path inside the server folder. Symbolic links are
   * followed first, so a link cannot lead out of the folder.
   */
  private async inside(
    server: IMinecraftServer,
    relative: string
  ): Promise<string | null> {
    const segments = cleanMinecraftRelativePath(relative)
    if (segments === null) {
      return null
    }
    try {
      const root = await realpath(server.directory)
      const target = await realpath(Path.join(root, ...segments))
      return target === root || target.startsWith(root + Path.sep)
        ? target
        : null
    } catch {
      return null
    }
  }

  /** The entries of one folder inside the server folder. Read-only. */
  public async files(
    id: string,
    relative: string
  ): Promise<ReadonlyArray<IMinecraftFileEntry> | null> {
    const folder = await this.inside(await this.find(id), relative)
    if (folder === null) {
      return null
    }
    try {
      const entries = await readdir(folder, { withFileTypes: true })
      const listed = new Array<IMinecraftFileEntry>()
      for (const entry of entries.slice(0, MaxMinecraftFileEntries)) {
        if (entry.isDirectory()) {
          listed.push({
            name: entry.name,
            kind: 'folder',
            bytes: 0,
            viewable: false,
          })
        } else if (entry.isFile()) {
          listed.push({
            name: entry.name,
            kind: 'file',
            bytes: (await stat(Path.join(folder, entry.name))).size,
            viewable: isViewableMinecraftFile(entry.name),
          })
        }
      }
      return listed.sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) ||
          a.name.localeCompare(b.name)
      )
    } catch {
      return null
    }
  }

  /**
   * The text of one plain-text file, with secret values hidden. A long file
   * gives its newest part.
   */
  public async readTextFile(
    id: string,
    relative: string
  ): Promise<{ readonly text: string; readonly truncated: boolean } | null> {
    const file = await this.inside(await this.find(id), relative)
    if (file === null || !isViewableMinecraftFile(Path.basename(file))) {
      return null
    }
    try {
      const handle = await open(file, 'r')
      try {
        const { size } = await handle.stat()
        const length = Math.min(size, MaxMinecraftFileBytes)
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, size - length)
        const truncated = size > length
        return {
          text: redactMinecraftSecrets(
            tailMinecraftText(buffer.toString('utf8'), truncated)
          ),
          truncated,
        }
      } finally {
        await handle.close()
      }
    } catch {
      return null
    }
  }

  /**
   * Put a backup back as the world. Only while the server is stopped. The
   * world that is there now is not deleted: it is moved into `backups/` first
   * under a `before-restore` name, so a restore can itself be undone.
   */
  public async restore(id: string, name: string): Promise<string | null> {
    const server = await this.find(id)
    if (this.running.has(id)) {
      return 'Stop the server before restoring a backup.'
    }
    if (!(await this.backups(id)).some(backup => backup.name === name)) {
      return 'That backup is no longer in the backups folder.'
    }
    const world = minecraftWorldFolder(await this.readProperties(server))
    if (world === null) {
      return 'The world folder name in server.properties cannot be restored from here.'
    }
    const target = Path.join(server.directory, world)
    const source = Path.join(server.directory, BackupsFolder, name)
    const kept = Path.join(
      server.directory,
      BackupsFolder,
      `${minecraftBackupName(world, this.now())}-before-restore`
    )
    let moved = false
    try {
      try {
        await rename(target, kept)
        moved = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return 'The current world could not be set aside, so nothing was changed.'
        }
      }
      await cp(source, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      })
      return null
    } catch {
      if (moved) {
        // Put the world back exactly as it was.
        await rename(target, `${kept}-failed-copy`).catch(() => {})
        await rename(kept, target).catch(() => {})
      }
      return 'The backup could not be copied. The world was left as it was.'
    }
  }

  /** Jar files in `plugins/` and `mods/`. Read-only. */
  public async addOns(id: string): Promise<ReadonlyArray<IMinecraftAddOn>> {
    const server = await this.find(id)
    const found = new Array<IMinecraftAddOn>()
    for (const [folder, kind] of [
      ['plugins', 'plugin'],
      ['mods', 'mod'],
    ] as const) {
      try {
        const entries = await readdir(Path.join(server.directory, folder), {
          withFileTypes: true,
        })
        for (const entry of entries.slice(0, 500)) {
          if (entry.isFile() && /\.jar$/i.test(entry.name)) {
            found.push({
              name: entry.name,
              kind,
              bytes: (
                await stat(Path.join(server.directory, folder, entry.name))
              ).size,
            })
          }
        }
      } catch {
        // No such folder on this kind of server.
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name))
  }

  private async loadSchedules(): Promise<ReadonlyArray<IMinecraftSchedule>> {
    if (this.allSchedules !== null) {
      return this.allSchedules
    }
    let schedules: ReadonlyArray<IMinecraftSchedule> = []
    try {
      const parsed = JSON.parse(
        await readFile(Path.join(this.root, SchedulesFileName), 'utf8')
      )
      if (Array.isArray(parsed?.schedules)) {
        schedules = parsed.schedules
          .filter(
            (s: any) =>
              typeof s?.id === 'string' &&
              typeof s?.serverId === 'string' &&
              typeof s?.time === 'string' &&
              (s.command === null || typeof s.command === 'string') &&
              validateMinecraftSchedule(s).length === 0
          )
          .slice(0, MaxMinecraftSchedules)
          .map((s: IMinecraftSchedule) => ({
            id: s.id,
            serverId: s.serverId,
            time: s.time,
            action: s.action,
            command: s.command,
          }))
      }
    } catch {
      // No schedules yet.
    }
    this.allSchedules = schedules
    return schedules
  }

  private async saveSchedules(schedules: ReadonlyArray<IMinecraftSchedule>) {
    this.allSchedules = schedules
    await mkdir(this.root, { recursive: true })
    await writeFile(
      Path.join(this.root, SchedulesFileName),
      JSON.stringify({ version: 1, schedules }, null, 2)
    )
  }

  /** The schedules of one server, earliest time first. */
  public async schedules(
    id: string
  ): Promise<ReadonlyArray<IMinecraftSchedule>> {
    return (await this.loadSchedules())
      .filter(schedule => schedule.serverId === id)
      .sort((a, b) => a.time.localeCompare(b.time))
  }

  /** Add a daily schedule. Returns every problem with it. */
  public async addSchedule(
    draft: MinecraftScheduleDraft
  ): Promise<ReadonlyArray<string>> {
    await this.find(draft.serverId)
    const command =
      draft.action === 'command'
        ? normalizeMinecraftCommand(draft.command ?? '')
        : null
    const clean: MinecraftScheduleDraft = {
      serverId: draft.serverId,
      time: draft.time,
      action: draft.action,
      command: draft.action === 'command' ? (command ?? draft.command) : null,
    }
    const errors = validateMinecraftSchedule(clean)
    if (errors.length > 0) {
      return errors
    }
    const schedules = await this.loadSchedules()
    if (schedules.length >= MaxMinecraftSchedules) {
      return [`There can be at most ${MaxMinecraftSchedules} schedules.`]
    }
    await this.saveSchedules([...schedules, { id: randomUUID(), ...clean }])
    return []
  }

  public async removeSchedule(scheduleId: string): Promise<void> {
    await this.saveSchedules(
      (await this.loadSchedules()).filter(s => s.id !== scheduleId)
    )
  }

  private whenStopped(id: string, timeoutMs: number): Promise<boolean> {
    if (!this.running.has(id)) {
      return Promise.resolve(true)
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      const waiters = this.exitWaiters.get(id) ?? []
      waiters.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
      this.exitWaiters.set(id, waiters)
    })
  }

  private async runSchedule(schedule: IMinecraftSchedule): Promise<void> {
    const id = schedule.serverId
    let outcome: string | null = null
    try {
      switch (schedule.action) {
        case 'start':
          outcome = this.running.has(id) ? null : await this.start(id)
          break
        case 'stop':
          await this.stop(id)
          break
        case 'restart':
          await this.stop(id)
          outcome = (await this.whenStopped(id, RestartWaitMs))
            ? await this.start(id)
            : 'The server did not stop in time, so it was not started again.'
          break
        case 'backup':
          outcome = await this.backup(id)
          break
        case 'command':
          outcome = (await this.command(id, schedule.command ?? ''))
            ? null
            : 'The command was not sent because the server is not running.'
          break
      }
    } catch (error) {
      outcome = (error as Error).message
    }
    this.record(
      id,
      `--- Schedule (${describeMinecraftSchedule(schedule)})${
        outcome === null ? ' ran' : `: ${outcome}`
      } ---\n`
    )
  }

  /**
   * Run whatever became due since the last tick. Called on a timer; the first
   * call only notes the time, so nothing runs just because the app opened.
   */
  public async tick(now: Date = this.now()): Promise<void> {
    const previous = this.lastTick
    this.lastTick = now
    if (previous === null) {
      return
    }
    const servers = await this.load()
    const due = dueMinecraftSchedules(
      await this.loadSchedules(),
      previous,
      now
    ).filter(schedule => servers.some(s => s.id === schedule.serverId))
    await Promise.all(due.map(schedule => this.runSchedule(schedule)))
  }

  /** Stop everything at once; used when the app is closing. */
  public stopAll() {
    for (const entry of this.running.values()) {
      entry.status = 'stopping'
      entry.child.stdin?.write('stop\n')
    }
  }
}
