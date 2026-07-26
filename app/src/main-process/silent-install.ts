import { spawn } from 'child_process'
import { open, stat } from 'fs/promises'

import {
  ISilentInstallRequest,
  ISilentInstallResult,
  planSilentInstall,
  reviewSilentInstallTarget,
  sanitizeSilentInstallOutput,
  SilentInstallFamily,
  SilentInstallRefusal,
} from '../lib/silent-install'

/**
 * Run a downloaded release asset's installer unattended, in the main process.
 *
 * The renderer never hosts the child: it asks over IPC and awaits a result, so
 * the interface stays responsive while an installer runs for minutes. The work
 * this module owns is the part that touches the machine — proving the file on
 * disk is still the one the release produced, then spawning it with the flags
 * the pure table chose.
 *
 * The launch is deliberately unprivileged. Nothing here uses a shell, a
 * `runas` verb, or any other elevation path: the installer runs exactly as the
 * app runs, and a Windows elevation prompt that blocks it surfaces as an
 * ordinary failure with its exit code rather than being worked around.
 */

/** Enough of the file to carry an installer's identifying strings. */
const SignatureProbeBytes = 128 * 1024

/** Keep a stuck unattended installer from pinning a slot forever. */
const SilentInstallTimeoutMilliseconds = 30 * 60 * 1000

/** Retain only the output tail; installers can be extremely chatty. */
const RetainedOutputCharacters = 4096

function refused(refusal: SilentInstallRefusal): ISilentInstallResult {
  return {
    ok: false,
    refusal,
    family: null,
    exitCode: null,
    output: '',
    launchError: null,
  }
}

/**
 * Scrape printable ASCII from the file's leading bytes.
 *
 * Installer families stamp their name near the start of the image, so a
 * bounded head read identifies most of them without parsing PE structures or
 * reading a multi-hundred-megabyte payload.
 */
async function readSignatureText(path: string): Promise<string | undefined> {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(SignatureProbeBytes)
    const { bytesRead } = await handle.read(buffer, 0, SignatureProbeBytes, 0)
    return buffer
      .subarray(0, bytesRead)
      .toString('latin1')
      .replace(/[^\x20-\x7e]+/g, ' ')
  } catch {
    // An unreadable head is not a failure: the plan simply falls back to the
    // honest "unknown installer" flags instead of guessing a family.
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Run one reviewed installer and report its exit code and output tail. */
export async function handleSilentInstall(
  request: ISilentInstallRequest
): Promise<ISilentInstallResult> {
  const expectation = {
    fileName: request.fileName,
    sizeInBytes: request.sizeInBytes,
  }

  let actual = null
  try {
    const entry = await stat(request.path)
    actual = {
      exists: true,
      isFile: entry.isFile(),
      sizeInBytes: entry.size,
    }
  } catch {
    actual = null
  }

  const refusal = reviewSilentInstallTarget(expectation, actual)
  if (refusal !== null) {
    log.warn(`Refused to silently install ${request.fileName}: ${refusal}.`)
    return refused(refusal)
  }

  const plan = planSilentInstall(
    {
      fileName: request.fileName,
      headText: await readSignatureText(request.path),
    },
    request.path
  )
  if (plan === null) {
    return refused('not-installable')
  }

  return await runPlan(plan.command, plan.args, plan.family)
}

function runPlan(
  command: string,
  args: ReadonlyArray<string>,
  family: SilentInstallFamily
): Promise<ISilentInstallResult> {
  return new Promise(resolve => {
    let output = ''
    let settled = false
    const finish = (result: ISilentInstallResult) => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(
        -RetainedOutputCharacters
      )
    }

    let child
    try {
      child = spawn(command, [...args], {
        // No shell: the path and switches are passed as argv so a file name
        // containing shell syntax cannot become part of a command line.
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      return finish({
        ok: false,
        refusal: null,
        family,
        exitCode: null,
        output: '',
        launchError: sanitizeSilentInstallOutput(
          error instanceof Error ? error.message : String(error)
        ),
      })
    }

    const timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        refusal: null,
        family,
        exitCode: null,
        output: sanitizeSilentInstallOutput(output),
        launchError: 'The installer did not finish within 30 minutes.',
      })
    }, SilentInstallTimeoutMilliseconds)
    timer.unref?.()

    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', error => {
      clearTimeout(timer)
      finish({
        ok: false,
        refusal: null,
        family,
        exitCode: null,
        output: sanitizeSilentInstallOutput(output),
        launchError: sanitizeSilentInstallOutput(error.message),
      })
    })
    child.on('close', code => {
      clearTimeout(timer)
      finish({
        ok: code === 0,
        refusal: null,
        family,
        exitCode: code,
        output: sanitizeSilentInstallOutput(output),
        launchError: null,
      })
    })
  })
}
