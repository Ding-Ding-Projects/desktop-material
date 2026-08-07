import { execFile } from 'node:child_process'
import process from 'node:process'

const LoopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function runCommand(executable, args) {
  return new Promise(resolve => {
    execFile(
      executable,
      args,
      { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 },
      (error, stdout) =>
        resolve({ ok: error === null, stdout: String(stdout ?? '') })
    )
  })
}

export function validateOrigin(value) {
  let origin
  try {
    origin = new URL(value)
  } catch {
    return { ok: false, reason: 'origin-invalid' }
  }
  const loopback = LoopbackHosts.has(origin.hostname)
  if (
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.username !== '' ||
    origin.password !== '' ||
    (origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:'))
  ) {
    return { ok: false, reason: 'origin-must-be-https-or-loopback-http' }
  }
  return { ok: true, origin: origin.origin }
}

export function evaluateHostDiagnostics({
  platform,
  dockerCliAvailable,
  composeAvailable,
  daemonAvailable,
}) {
  if (platform !== 'win32') {
    return {
      status: 'unsupported',
      code: 'unsupported-platform',
      detail: 'The self-hosted server wizard requires Windows.',
    }
  }
  if (!dockerCliAvailable || !composeAvailable) {
    return {
      status: 'blocked',
      code: 'docker-compose-unavailable',
      detail:
        'Docker Desktop and Docker Compose must be installed before provisioning.',
    }
  }
  if (!daemonAvailable) {
    return {
      status: 'blocked',
      code: 'docker-daemon-unavailable',
      detail: 'Docker Desktop is installed, but its engine is not responding.',
    }
  }
  return {
    status: 'ready',
    code: null,
    detail: 'Docker Desktop, Compose, and the engine are responding.',
  }
}

export async function collectHostDiagnostics({
  platform = process.platform,
  commandRunner = runCommand,
} = {}) {
  if (platform !== 'win32') {
    return evaluateHostDiagnostics({ platform })
  }
  const docker = await commandRunner('docker', [
    'version',
    '--format',
    '{{.Server.Version}}',
  ])
  const compose = await commandRunner('docker', ['compose', 'version'])
  return evaluateHostDiagnostics({
    platform,
    dockerCliAvailable: docker.ok,
    composeAvailable: compose.ok,
    daemonAvailable: docker.ok,
  })
}

export async function runAcceptance({
  origin,
  fetchImplementation = fetch,
} = {}) {
  const host = await collectHostDiagnostics()
  const report = {
    host,
    localServer: { status: 'not-run', code: null },
    secondMachine: {
      status: 'not-run',
      detail:
        'Requires a real second Windows machine and is never simulated by this harness.',
    },
  }
  if (host.status !== 'ready' || origin === undefined) {
    return report
  }
  const validated = validateOrigin(origin)
  if (!validated.ok) {
    report.localServer = { status: 'blocked', code: validated.reason }
    return report
  }
  try {
    const response = await fetchImplementation(`${validated.origin}/healthz`)
    report.localServer = {
      status: response.ok ? 'verified' : 'failed',
      code: response.ok ? null : `health-http-${response.status}`,
    }
  } catch {
    report.localServer = { status: 'failed', code: 'health-request-failed' }
  }
  return report
}

if (process.argv[1]?.endsWith('self-hosted-server-wizard-acceptance.mjs')) {
  const originIndex = process.argv.indexOf('--origin')
  const origin = originIndex === -1 ? undefined : process.argv[originIndex + 1]
  const report = await runAcceptance({ origin })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode =
    report.host.status === 'ready' &&
    report.localServer.status !== 'failed' &&
    report.localServer.status !== 'blocked' &&
    report.localServer.status !== 'not-run'
      ? 0
      : 2
}
