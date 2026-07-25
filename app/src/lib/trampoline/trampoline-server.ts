import { createServer, AddressInfo, Server, Socket } from 'net'
import split2 from 'split2'
import { sendNonFatalException } from '../helpers/non-fatal-exception'
import {
  ITrampolineCommand,
  TrampolineCommandHandler,
  TrampolineCommandIdentifier,
} from './trampoline-command'
import { TrampolineCommandParser } from './trampoline-command-parser'
import {
  isValidTrampolineToken,
  wasTrampolineTokenRecentlyDisposed,
} from './trampoline-tokens'

/**
 * Describe a command for a log line without ever including the token, the
 * standard input (which carries credentials for `store` and `erase`), or an
 * askpass prompt (which can carry a key path). The credential helper's
 * operation is a fixed verb and is safe to name.
 */
export function describeTrampolineCommand(command: ITrampolineCommand) {
  const operation =
    command.identifier === TrampolineCommandIdentifier.CredentialHelper
      ? command.parameters.at(0)
      : undefined

  const operationSuffix =
    operation === 'get' || operation === 'store' || operation === 'erase'
      ? ` ${operation}`
      : ''

  return `${command.identifier}${operationSuffix} (${command.parameters.length} parameter(s))`
}

/**
 * This class represents the "trampoline server". The trampoline is something
 * we'll hand to git in order to communicate with Desktop without noticing. A
 * notable example of this would be GIT_ASKPASS.
 *
 * This server is designed so that it will start lazily when the app performs a
 * remote git operation. At that point, the app will try to retrieve the
 * server's port, which will run the server first if needed.
 *
 * The idea behind this is to simplify the retry approach in case of error:
 * instead of reacting to errors with an immediate retry, the server will remain
 * closed until the next time the app needs it (i.e. in the next git remote
 * operation).
 */
export class TrampolineServer {
  private readonly server: Server
  private listeningPromise: Promise<void> | null = null

  private readonly commandHandlers = new Map<
    TrampolineCommandIdentifier,
    TrampolineCommandHandler
  >()

  public constructor() {
    this.server = createServer(socket => this.onNewConnection(socket))

    // Make sure the server is always unref'ed, so it doesn't keep the app alive
    // for longer than needed. Not having this made the CI tasks on Windows
    // timeout because the unit tests completed in about 7min, but the test
    // suite runner would never finish, hitting a 45min timeout for the whole
    // GitHub Action.
    this.server.unref()
  }

  private async listen(): Promise<void> {
    this.listeningPromise = new Promise((resolve, reject) => {
      // Observe errors while trying to start the server
      this.server.on('error', error => {
        reject(error)
        this.close()
      })

      this.server.listen(0, '127.0.0.1', async () => {
        // Replace the error handler
        this.server.removeAllListeners('error')
        this.server.on('error', this.onServerError)

        resolve()
      })
    })

    return this.listeningPromise
  }

  private async close() {
    // Make sure the server is not trying to start
    if (this.listeningPromise !== null) {
      await this.listeningPromise
    }

    // Reset the server, it will be restarted lazily the next time it's needed
    this.server.close()
    this.server.removeAllListeners('error')
    this.listeningPromise = null
  }

  /**
   * This function will retrieve the port of the server, or null if the server
   * is not running.
   *
   * In order to get the server port, it might need to start the server if it's
   * not running already.
   */
  public async getPort() {
    if (this.port !== null) {
      return this.port
    }

    if (this.listeningPromise !== null) {
      await this.listeningPromise
    } else {
      await this.listen()
    }

    return this.port
  }

  private get port(): number | null {
    const address = this.server.address() as AddressInfo

    if (address && address.port) {
      return address.port
    }

    return null
  }

  private onNewConnection(socket: Socket) {
    const parser = new TrampolineCommandParser()

    // Messages coming from the trampoline client will be separated by \0
    socket.pipe(split2(/\0/)).on('data', data => {
      this.onDataReceived(socket, parser, data)
    })

    socket.on('error', this.onClientError)
  }

  private onDataReceived(
    socket: Socket,
    parser: TrampolineCommandParser,
    data: Buffer
  ) {
    const value = data.toString('utf8')

    try {
      parser.processValue(value)
    } catch (error) {
      log.error('Error processing trampoline data', error)
      socket.end()
      return
    }

    if (!parser.hasFinished()) {
      return
    }

    const command = parser.toCommand()
    if (command === null) {
      socket.end()
      return
    }

    // processCommand contains its own error handling; the guard here is a
    // belt-and-braces measure so a socket event can never float a rejection.
    this.processCommand(socket, command).catch(error =>
      log.error('Error processing trampoline command', error)
    )
  }

  /**
   * Registers a handler for commands with a specific identifier. This will be
   * invoked when the server receives a command with the given identifier.
   *
   * @param identifier Identifier of the command.
   * @param handler Handler to register.
   */
  public registerCommandHandler(
    identifier: TrampolineCommandIdentifier,
    handler: TrampolineCommandHandler
  ) {
    this.commandHandlers.set(identifier, handler)
  }

  /**
   * Handle one parsed command.
   *
   * This must never reject. It is invoked from a socket `data` event, so a
   * rejection here becomes an unhandled renderer rejection *and* leaves the
   * client waiting on a reply that never arrives, wedging a live Git process
   * (and its lock files) until the app quits.
   */
  private async processCommand(socket: Socket, command: ITrampolineCommand) {
    try {
      if (!isValidTrampolineToken(command.trampolineToken)) {
        // A Git process can outlive the operation which created its token, so
        // this is a recoverable condition rather than a programming error. We
        // decline to serve credentials and let Git fail this one operation on
        // its own terms; nothing else is affected.
        const provenance = wasTrampolineTokenRecentlyDisposed(
          command.trampolineToken
        )
          ? 'the operation which issued it has already finished'
          : 'it was not issued by this session'

        log.warn(
          `Declining trampoline command ${describeTrampolineCommand(
            command
          )}: the token is no longer valid because ${provenance}.`
        )

        socket.end()
        return
      }

      const handler = this.commandHandlers.get(command.identifier)

      if (handler === undefined) {
        socket.end()
        return
      }

      const result = await handler(command).catch(e => {
        log.error(
          `Error processing trampoline command ${describeTrampolineCommand(
            command
          )}`,
          e
        )
        return undefined
      })

      if (result !== undefined) {
        socket.end(result)
      } else {
        socket.end()
      }
    } catch (error) {
      log.error(
        `Unexpected failure handling trampoline command ${describeTrampolineCommand(
          command
        )}`,
        error
      )

      // Always reply, even on an unexpected failure, so the client is never
      // left waiting on a socket which will not be closed.
      try {
        socket.end()
      } catch {
        // The socket may already have been destroyed by the client.
      }
    }
  }

  private onServerError = (error: Error) => {
    sendNonFatalException('trampolineServer', error)
    this.close()
  }

  private onClientError = (error: Error) => {
    log.error('Trampoline client error', error)
  }
}

export const trampolineServer = new TrampolineServer()
