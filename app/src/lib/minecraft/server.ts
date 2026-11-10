/**
 * Minecraft server manager: the rules for a locally run server.
 *
 * A server is a folder with a server jar that this computer runs with Java.
 * These rules validate a server entry, build its command line, track its
 * console and state, and guard the EULA: a server is never started until the
 * person has accepted Mojang's EULA for that server folder themselves.
 */

export interface IMinecraftServer {
  readonly id: string
  readonly name: string
  /** Absolute folder that holds the jar, the world and the settings. */
  readonly directory: string
  /** File name of the server jar inside the folder. */
  readonly jar: string
  /** `java`, or the full path of a Java executable. */
  readonly javaPath: string
  readonly memoryMegabytes: number
  readonly port: number
}

export type MinecraftServerStatus =
  'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface IMinecraftServerState {
  readonly server: IMinecraftServer
  readonly status: MinecraftServerStatus
  readonly eulaAccepted: boolean
  /** Why the last start failed or the server stopped by itself. */
  readonly message: string | null
}

export const MinecraftEulaUrl = 'https://aka.ms/MinecraftEULA'
export const MaxMinecraftConsoleLines = 2000
export const MaxMinecraftCommandLength = 256
export const DefaultMinecraftPort = 25565

export type MinecraftServerDraft = Omit<IMinecraftServer, 'id'>

const isAbsolutePath = (path: string) =>
  /^[a-zA-Z]:[\\/]/.test(path) ||
  path.startsWith('/') ||
  path.startsWith('\\\\')

/** Every problem with a server entry, in plain words. */
export function validateMinecraftServer(
  draft: MinecraftServerDraft
): ReadonlyArray<string> {
  const errors = new Array<string>()
  const name = draft.name.trim()
  if (name.length === 0 || name.length > 60) {
    errors.push('Give the server a name of 1 to 60 characters.')
  }
  if (!isAbsolutePath(draft.directory.trim())) {
    errors.push('Choose the server folder with its full path.')
  }
  if (!/^[^\\/:*?"<>|\r\n]+\.jar$/i.test(draft.jar.trim())) {
    errors.push(
      'The server jar must be a .jar file name inside the server folder.'
    )
  }
  const java = draft.javaPath.trim()
  if (java !== 'java' && !isAbsolutePath(java)) {
    errors.push('Java must be "java" or the full path of a Java program.')
  }
  if (
    !Number.isInteger(draft.memoryMegabytes) ||
    draft.memoryMegabytes < 512 ||
    draft.memoryMegabytes > 65536
  ) {
    errors.push('Memory must be a whole number of megabytes from 512 to 65536.')
  }
  if (
    !Number.isInteger(draft.port) ||
    draft.port < 1024 ||
    draft.port > 65535
  ) {
    errors.push('The port must be a whole number from 1024 to 65535.')
  }
  return errors
}

/** The Java arguments for a server. No shell is involved. */
export function minecraftServerArguments(
  server: IMinecraftServer
): ReadonlyArray<string> {
  return [`-Xmx${server.memoryMegabytes}M`, '-jar', server.jar.trim(), 'nogui']
}

/** Whether an `eula.txt` records acceptance. */
export function isMinecraftEulaAccepted(text: string): boolean {
  return /^\s*eula\s*=\s*true\s*$/im.test(text)
}

/** The `eula.txt` written when the person accepts. */
export function acceptedMinecraftEulaText(now: Date): string {
  return (
    `# Accepted in Desktop Material on ${now.toISOString()}.\n` +
    `# By setting this to true you agree to the Minecraft EULA (${MinecraftEulaUrl}).\n` +
    'eula=true\n'
  )
}

/** Set one key in `server.properties`, keeping every other line as it was. */
export function setMinecraftServerProperty(
  text: string,
  key: string,
  value: string
): string {
  if (!/^[a-z0-9.-]+$/i.test(key) || /[\r\n]/.test(value)) {
    throw new Error('That server property cannot be written.')
  }
  const lines = text.length === 0 ? [] : text.replace(/\r\n/g, '\n').split('\n')
  const index = lines.findIndex(line =>
    new RegExp(`^\\s*${key.replace(/\./g, '\\.')}\\s*=`).test(line)
  )
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  if (index >= 0 && index < lines.length) {
    lines[index] = `${key}=${value}`
  } else {
    lines.push(`${key}=${value}`)
  }
  return lines.join('\n') + '\n'
}

/** The line a vanilla-style server prints when it is ready for players. */
export function isMinecraftReadyLine(line: string): boolean {
  return /\bDone \([\d.,]+s\)!/.test(line)
}

/** A console command is one line of bounded length. */
export function normalizeMinecraftCommand(command: string): string | null {
  const trimmed = command.trim().replace(/^\/+/, '').trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > MaxMinecraftCommandLength ||
    /[\r\n\0]/.test(trimmed)
  ) {
    return null
  }
  return trimmed
}

/** A bounded console: complete lines only, the oldest dropped first. */
export class MinecraftConsoleBuffer {
  private partial = ''
  private readonly kept = new Array<string>()

  public constructor(private readonly max: number = MaxMinecraftConsoleLines) {}

  /** Add output and return the complete lines it finished. */
  public append(chunk: string): ReadonlyArray<string> {
    const pieces = (this.partial + chunk).replace(/\r\n/g, '\n').split('\n')
    this.partial = (pieces.pop() ?? '').slice(-4000)
    const lines = pieces.map(line => line.slice(0, 4000))
    this.kept.push(...lines)
    if (this.kept.length > this.max) {
      this.kept.splice(0, this.kept.length - this.max)
    }
    return lines
  }

  public get lines(): ReadonlyArray<string> {
    return this.kept
  }
}

const PlayerName = '[A-Za-z0-9_]{1,16}'
const JoinedLine = new RegExp(`\\]: (${PlayerName}) joined the game\\s*$`)
const LeftLine = new RegExp(`\\]: (${PlayerName}) left the game\\s*$`)

/** Whether the text is a Java Edition player name. */
export function isMinecraftPlayerName(name: string): boolean {
  return new RegExp(`^${PlayerName}$`).test(name)
}

/**
 * Follow who is online from the server's own join and leave lines. Chat lines
 * carry the speaker's name before the text, so they never match.
 */
export function reduceMinecraftPlayers(
  players: ReadonlyArray<string>,
  line: string
): ReadonlyArray<string> {
  const joined = JoinedLine.exec(line)
  if (joined !== null) {
    return players.includes(joined[1]) ? players : [...players, joined[1]]
  }
  const left = LeftLine.exec(line)
  if (left !== null) {
    return players.filter(name => name !== left[1])
  }
  return players
}
