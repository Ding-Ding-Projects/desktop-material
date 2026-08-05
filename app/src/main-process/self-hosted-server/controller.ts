import { execFile } from 'child_process'
import * as Path from 'path'

import {
  ISelfHostedServerControllerStatus,
  ISelfHostedServerProvisioningProgress,
  ISelfHostedServerProvisioningRequest,
  SelfHostedServerProvisioner,
  SelfHostedServerProvisioningError,
  SelfHostedServerProvisioningReply,
} from '../../lib/self-hosted-server/provisioning'
import { WindowsSelfHostedServerProvisioningDriver } from './provisioning-driver'

type ProgressListener = (
  progress: ISelfHostedServerProvisioningProgress
) => void

function run(executable: string, args: ReadonlyArray<string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

/** Parses `whoami /user /fo csv /nh` output into the current user's SID. */
function parseWhoamiSid(csv: string): string | null {
  const trimmed = csv.trim()
  const match = /"([^"]*)","(S-1-(?:\d+-){1,14}\d+)"/.exec(trimmed)
  return match === null ? null : match[2]
}

/**
 * Owns the self-hosted server provisioning wizard's main-process side. Only
 * ever active on Windows: every dependency it wires up (winget, Docker
 * Desktop paths, icacls) is Windows-specific, matching this app's packaged
 * platform. On any other platform the controller reports itself unsupported
 * so the renderer can degrade honestly to single-player instead of guessing.
 */
export class SelfHostedServerController {
  private provisioner: SelfHostedServerProvisioner | null = null
  private driver: WindowsSelfHostedServerProvisioningDriver | null = null
  private activeAbortController: AbortController | null = null
  private initializationError: string | null = null

  public constructor(
    private readonly userDataPath: string,
    private readonly bundledServicePath: string,
    private readonly onProgress: ProgressListener
  ) {}

  private async ensureDriver(): Promise<WindowsSelfHostedServerProvisioningDriver> {
    if (process.platform !== 'win32') {
      throw new Error('unsupported-platform')
    }
    if (this.driver !== null) {
      return this.driver
    }
    if (this.initializationError !== null) {
      throw new Error(this.initializationError)
    }
    try {
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
      const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
      const localAppData =
        process.env.LOCALAPPDATA ?? Path.join(this.userDataPath, '..')
      const wingetPath = Path.join(
        localAppData,
        'Microsoft',
        'WindowsApps',
        'winget.exe'
      )
      const sidOutput = await run('whoami', ['/user', '/fo', 'csv', '/nh'])
      const sid = parseWhoamiSid(sidOutput)
      if (sid === null) {
        this.initializationError = 'sid-resolution-failed'
        throw new Error(this.initializationError)
      }
      this.driver = new WindowsSelfHostedServerProvisioningDriver({
        userDataPath: this.userDataPath,
        bundledServicePath: this.bundledServicePath,
        programFilesPath: programFiles,
        windowsDirectoryPath: systemRoot,
        wingetExecutablePath: wingetPath,
        currentUserSid: sid,
      })
      this.provisioner = new SelfHostedServerProvisioner(this.driver)
      return this.driver
    } catch (error) {
      if (this.initializationError === null) {
        this.initializationError =
          error instanceof Error ? error.message : 'driver-init-failed'
      }
      throw error
    }
  }

  public async getStatus(): Promise<ISelfHostedServerControllerStatus> {
    if (process.platform !== 'win32') {
      return {
        supported: false,
        configured: false,
        publicOrigin: null,
        serverId: null,
        running: false,
      }
    }
    try {
      const driver = await this.ensureDriver()
      const controller = new AbortController()
      const existing = await driver.readExistingBootstrap(controller.signal)
      return {
        supported: true,
        configured: existing !== null,
        publicOrigin: existing?.publicOrigin ?? null,
        serverId: existing?.serverId ?? null,
        running: this.activeAbortController !== null,
      }
    } catch {
      return {
        supported: true,
        configured: false,
        publicOrigin: null,
        serverId: null,
        running: this.activeAbortController !== null,
      }
    }
  }

  public async provision(
    request: ISelfHostedServerProvisioningRequest
  ): Promise<SelfHostedServerProvisioningReply> {
    if (this.activeAbortController !== null) {
      return {
        ok: false,
        code: 'already-running',
        recovery: 'Wait for the current wizard run to finish, then retry.',
      }
    }
    try {
      await this.ensureDriver()
    } catch (error) {
      return {
        ok: false,
        code:
          error instanceof Error && error.message === 'unsupported-platform'
            ? 'unsupported-platform'
            : 'driver-init-failed',
        recovery:
          error instanceof Error && error.message === 'unsupported-platform'
            ? 'The self-hosted server wizard is only available on Windows today.'
            : 'Restart the app and try the wizard again.',
      }
    }
    const controller = new AbortController()
    this.activeAbortController = controller
    try {
      const result = await this.provisioner!.provision(
        request,
        controller.signal,
        progress => this.onProgress(progress)
      )
      return { ok: true, result }
    } catch (error) {
      if (error instanceof SelfHostedServerProvisioningError) {
        return { ok: false, code: error.code, recovery: error.recovery }
      }
      return {
        ok: false,
        code: 'unknown',
        recovery: 'Run the wizard again from the start.',
      }
    } finally {
      this.activeAbortController = null
    }
  }

  public cancel(): void {
    this.activeAbortController?.abort()
  }
}
