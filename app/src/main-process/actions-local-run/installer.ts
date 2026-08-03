import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { chmod, mkdir, mkdtemp, rename, rm, readdir } from 'fs/promises'
import { get } from 'https'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'
import { pathExists } from '../../lib/path-exists'
import {
  actAssetName,
  actDownloadUrl,
  actExecutableName,
} from '../../lib/actions-local-run/act-release'

/**
 * Install `act` for the user, without asking them to.
 *
 * The runner used to detect a missing `act`, print a link to its install
 * instructions, and stop. That turns a one-command setup into a detour through
 * a package manager the user may not have, an installer that may want
 * administrator rights, and a PATH edit that needs a shell restart before the
 * app can see it — all to run a workflow they already asked to run.
 *
 * So the app fetches the release binary itself into its own data directory.
 * Nothing is installed machine-wide, nothing needs elevation, nothing edits
 * PATH, and nothing touches a `act` the user installed themselves: a
 * PATH-resolved copy always wins, and this managed copy is only consulted when
 * there is none.
 */

/** Where the managed copy lives: `<userData>/tools/act/`. */
export function managedActDirectory(): string {
  return path.join(app.getPath('userData'), 'tools', 'act')
}

/** The managed executable's absolute path, whether or not it exists yet. */
export function managedActPath(platform: string = process.platform): string {
  return path.join(managedActDirectory(), actExecutableName(platform))
}

/** True when a previously installed managed copy is present. */
export async function managedActInstalled(
  platform: string = process.platform
): Promise<boolean> {
  return pathExists(managedActPath(platform))
}

/**
 * Download a URL to a file, following the redirects GitHub's
 * `releases/latest/download` path always issues.
 *
 * Bounded so a wrong or hijacked URL cannot loop forever or stream without
 * end. Any non-success status is an error rather than a truncated file that
 * would later fail to extract for reasons nobody could trace back to here.
 */
async function download(
  url: string,
  destination: string,
  redirectsRemaining = 5
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = get(url, { timeout: 120_000 }, response => {
      const status = response.statusCode ?? 0
      const location = response.headers.location

      if (status >= 300 && status < 400 && location !== undefined) {
        response.resume()
        if (redirectsRemaining <= 0) {
          reject(new Error(`Too many redirects downloading act from ${url}.`))
          return
        }
        download(
          new URL(location, url).toString(),
          destination,
          redirectsRemaining - 1
        ).then(resolve, reject)
        return
      }

      if (status !== 200) {
        response.resume()
        reject(
          new Error(`Downloading act from ${url} returned HTTP ${status}.`)
        )
        return
      }

      const file = createWriteStream(destination)
      response.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
      response.on('error', reject)
    })

    request.on('timeout', () => {
      request.destroy(new Error(`Downloading act from ${url} timed out.`))
    })
    request.on('error', reject)
  })
}

/**
 * The `tar` to extract with.
 *
 * On Windows this is deliberately the absolute System32 path rather than
 * whatever `tar` PATH happens to resolve to. If Git for Windows, MSYS, or
 * Cygwin is installed — and on a developer's machine one of them usually is —
 * their GNU tar shadows the system one, and GNU tar reads `C:\...` as
 * `host:path`. Extraction then fails with `Cannot connect to C: resolve
 * failed`: a network error, about a drive letter, from a purely local file
 * copy. The bsdtar in System32 has understood drive letters since Windows 10
 * and reads both the zip Windows gets and the tar.gz everyone else gets.
 */
function tarExecutable(): string {
  if (process.platform !== 'win32') {
    return 'tar'
  }
  const root = process.env.SystemRoot ?? 'C:\\Windows'
  return path.join(root, 'System32', 'tar.exe')
}

/**
 * Extract an act archive, which avoids adding an archive dependency for one
 * file. Paths are passed relative to `directory` so no drive letter reaches
 * the argv at all — belt and braces alongside {@link tarExecutable}.
 */
async function extract(archive: string, directory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tarExecutable(), ['-xf', path.basename(archive)], {
      cwd: directory,
      windowsHide: true,
      shell: false,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(`Extracting act failed (tar exited ${code}). ${stderr}`)
        )
      }
    })
  })
}

/**
 * Download and install `act` into the app's own data directory, replacing any
 * previous managed copy, and return the executable's path.
 *
 * The install is staged in a temporary directory and moved into place only
 * once the executable is actually present, so a failed or half-finished
 * download never leaves something behind that detection would mistake for a
 * working install.
 */
export async function installAct(
  platform: string = process.platform,
  arch: string = process.arch
): Promise<string> {
  const assetName = actAssetName(platform, arch)
  const url = actDownloadUrl(assetName)
  const executableName = actExecutableName(platform)

  const staging = await mkdtemp(path.join(os.tmpdir(), 'desktop-material-act-'))

  try {
    const archive = path.join(staging, assetName)
    await download(url, archive)
    await extract(archive, staging)

    const staged = path.join(staging, executableName)
    if (!(await pathExists(staged))) {
      const found = (await readdir(staging)).join(', ')
      throw new Error(
        `The act archive did not contain ${executableName} (found: ${found}).`
      )
    }

    if (platform !== 'win32') {
      await chmod(staged, 0o755)
    }

    const directory = managedActDirectory()
    await mkdir(directory, { recursive: true })
    const destination = path.join(directory, executableName)
    // Windows refuses to rename over a running executable, and a stale copy is
    // never what we want to keep, so clear the way first.
    await rm(destination, { force: true })
    await rename(staged, destination)

    return destination
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
