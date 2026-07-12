import { spawn } from 'child_process'

/**
 * Forcibly terminate a process and its entire descendant tree.
 *
 * On Windows there is no cheap POSIX-style process group, so we shell out to
 * `taskkill /PID <pid> /T /F` — spawned with an explicit argv and
 * `shell: false`, never a shell string, so a hostile working directory or PID
 * can't be interpolated into a command line. On POSIX we terminate the process
 * group via `process.kill(-pid)` and fall back to a direct kill.
 *
 * This is deliberately a tiny, dependency-free replacement for `tree-kill` so
 * the feature introduces no new native dependencies.
 */
export function killTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return
  }

  if (process.platform === 'win32') {
    try {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        shell: false,
      })
      child.on('error', err =>
        log.warn(`[build-run] taskkill failed for pid ${pid}`, err)
      )
    } catch (err) {
      log.warn(`[build-run] taskkill threw for pid ${pid}`, err)
    }
    return
  }

  // POSIX: prefer killing the whole process group (negative pid); fall back to
  // the single process if the child was not made a group leader.
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* already gone — nothing to do */
    }
  }
}
