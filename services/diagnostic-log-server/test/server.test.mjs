import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { after, before, test } from 'node:test'

const root = await mkdtemp(join(tmpdir(), 'desktop-log-server-test-'))
const storage = join(root, 'data')
const tokenFile = join(root, 'token')
const token = randomBytes(32).toString('hex')
const port = 43_000 + Math.floor(Math.random() * 1_000)
let child

before(async () => {
  await mkdir(storage)
  await writeFile(tokenFile, token, { mode: 0o600 })
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      STORAGE_ROOT: storage,
      TOKEN_FILE: tokenFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('server did not become healthy')
})

after(async () => {
  child?.kill()
  await rm(root, { recursive: true, force: true })
})

test('requires authorization for log data', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`)
  assert.equal(response.status, 401)
})

test('rejects an oversized request as client input', async () => {
  const body = JSON.stringify({
    clientId: 'oversized-client',
    sessionId: 'session-one',
    level: 'error',
    message: 'x'.repeat(256 * 1024),
  })
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'request_too_large',
  })
  assert.equal((await readdir(storage)).includes('oversized-client'), false)
})

test('serves a dashboard shell without exposing log data', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/`)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Desktop Material diagnostics/)
  assert.match(
    response.headers.get('content-security-policy') || '',
    /connect-src 'self'/
  )
})

test('ingests, redacts, stores, and searches structured events', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: 'client-one',
      sessionId: 'session-one',
      level: 'error',
      message: 'push failed token=do-not-store github_pat_0123456789abcdef',
      appVersion: '1.0.0',
    }),
  })
  assert.equal(response.status, 202)
  const stored = await readFile(
    join(
      storage,
      'client-one',
      `${new Date().toISOString().slice(0, 10)}.jsonl`
    ),
    'utf8'
  )
  assert.doesNotMatch(stored, /do-not-store|github_pat_/)
  assert.match(stored, /\[REDACTED\]/)

  const query = await fetch(
    `http://127.0.0.1:${port}/v1/logs?level=error&q=push`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const result = await query.json()
  assert.equal(result.count, 1)
  assert.equal(result.events[0].clientId, 'client-one')

  const dashboardDefaultQuery = await fetch(
    `http://127.0.0.1:${port}/v1/logs?level=&q=`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  assert.equal(dashboardDefaultQuery.status, 200)
  assert.equal((await dashboardDefaultQuery.json()).count, 1)

  const invalidClient = await fetch(
    `http://127.0.0.1:${port}/v1/logs?client=../all`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  assert.equal(invalidClient.status, 400)
})

test('reports bounded storage metadata for agents', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/storage`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const result = await response.json()
  assert.equal(result.ok, true)
  assert.equal(result.clientCount, 1)
  assert.equal(result.fileCount, 1)
  assert.ok(result.usedBytes > 0)
})

test('applies the query limit to the newest matching events', async () => {
  const clientStorage = join(storage, 'query-order-client')
  await mkdir(clientStorage)
  const event = (receivedAt, message) =>
    JSON.stringify({
      receivedAt,
      timestamp: receivedAt,
      level: 'info',
      clientId: 'query-order-client',
      sessionId: 'session-one',
      appVersion: '',
      releaseChannel: '',
      message,
    }) + '\n'

  await writeFile(
    join(clientStorage, '2026-01-01.jsonl'),
    event('2026-01-01T12:00:00.000Z', 'older event')
  )
  await writeFile(
    join(clientStorage, '2026-01-02.jsonl'),
    event('2026-01-02T12:00:00.000Z', 'newest event')
  )

  const response = await fetch(
    `http://127.0.0.1:${port}/v1/logs?client=query-order-client&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.count, 1)
  assert.equal(result.events[0].message, 'newest event')
})

test('caps stored messages by UTF-8 bytes without splitting characters', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: 'message-byte-client',
      sessionId: 'session-one',
      level: 'info',
      message: '😀'.repeat(20_000),
    }),
  })
  assert.equal(response.status, 202)

  const query = await fetch(
    `http://127.0.0.1:${port}/v1/logs?client=message-byte-client`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const result = await query.json()
  assert.equal(result.count, 1)
  assert.equal(Buffer.byteLength(result.events[0].message, 'utf8'), 32 * 1024)
  assert.equal(result.events[0].message, '😀'.repeat(8_192))
})

test('redacts complete quoted multiword credentials', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: 'quoted-secret-client',
      sessionId: 'session-one',
      level: 'error',
      message: 'login failed password="correct horse battery staple"',
    }),
  })
  assert.equal(response.status, 202)

  const query = await fetch(
    `http://127.0.0.1:${port}/v1/logs?client=quoted-secret-client`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const result = await query.json()
  assert.equal(result.count, 1)
  assert.equal(result.events[0].message, 'login failed password=[REDACTED]')

  const stored = await readFile(
    join(
      storage,
      'quoted-secret-client',
      `${new Date().toISOString().slice(0, 10)}.jsonl`
    ),
    'utf8'
  )
  assert.doesNotMatch(stored, /correct|horse|battery|staple/)
})

test('reports a missing storage root as an internal failure', async () => {
  await rm(storage, { recursive: true, force: true })
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/storage`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'internal_error',
    })
  } finally {
    await mkdir(storage, { recursive: true })
  }
})
