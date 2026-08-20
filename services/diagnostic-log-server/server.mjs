import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const host = process.env.HOST || '0.0.0.0'
const port = boundedInteger(process.env.PORT, 4318, 1, 65_535)
const storageRoot = resolve(process.env.STORAGE_ROOT || '/data')
const retentionDays = boundedInteger(process.env.RETENTION_DAYS, 14, 1, 365)
const maximumStorageBytes = boundedInteger(
  process.env.MAX_STORAGE_BYTES,
  5 * 1024 ** 3,
  16 * 1024 ** 2,
  1024 ** 4
)
const maximumRequestBytes = 256 * 1024
const maximumQueryFiles = 200
const maximumQueryResults = 2_000
const maximumMessageBytes = 32 * 1024
const token = await loadToken()

class RequestTooLargeError extends Error {}

await mkdir(storageRoot, { recursive: true })

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response)
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, {
        ok: true,
        service: 'desktop-material-diagnostic-log-server',
      })
    }
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return response.end(dashboardHtml)
    }
    if (!authorized(request.headers.authorization)) {
      return json(response, 401, { ok: false, error: 'unauthorized' })
    }
    if (request.method === 'POST' && url.pathname === '/v1/logs') {
      return await ingest(request, response)
    }
    if (request.method === 'GET' && url.pathname === '/v1/logs') {
      return await query(url, response)
    }
    if (request.method === 'GET' && url.pathname === '/v1/storage') {
      return await storageStatus(response)
    }
    return json(response, 404, { ok: false, error: 'not_found' })
  } catch (error) {
    process.stderr.write(
      `${new Date().toISOString()} request_failed ${safeError(error)}\n`
    )
    if (!response.headersSent) {
      return json(response, 500, { ok: false, error: 'internal_error' })
    }
    response.end()
  }
})

server.listen(port, host, () => {
  process.stdout.write(
    `${new Date().toISOString()} listening ${host}:${port} storage=${storageRoot}\n`
  )
})

async function loadToken() {
  const tokenFile = process.env.TOKEN_FILE
  const value = tokenFile ? await readFile(tokenFile, 'utf8') : ''
  const normalized = value.trim()
  if (normalized.length < 32 || normalized.length > 512) {
    throw new Error('TOKEN_FILE must contain a 32-512 character token')
  }
  return Buffer.from(normalized)
}

function authorized(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return false
  }
  const supplied = Buffer.from(header.slice(7))
  return supplied.length === token.length && timingSafeEqual(supplied, token)
}

async function ingest(request, response) {
  let body
  try {
    body = await readBody(request)
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return json(response, 413, { ok: false, error: 'request_too_large' })
    }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return json(response, 400, { ok: false, error: 'invalid_json' })
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  if (candidates.length === 0 || candidates.length > 500) {
    return json(response, 400, { ok: false, error: 'invalid_batch_size' })
  }
  const receivedAt = new Date().toISOString()
  const accepted = []
  for (const candidate of candidates) {
    const event = normalizeEvent(candidate, receivedAt)
    if (event !== null) {
      accepted.push(event)
    }
  }
  if (accepted.length === 0) {
    return json(response, 400, { ok: false, error: 'no_valid_events' })
  }
  const day = receivedAt.slice(0, 10)
  const grouped = Map.groupBy(accepted, event => event.clientId)
  for (const [clientId, events] of grouped) {
    const directory = join(storageRoot, clientId)
    await mkdir(directory, { recursive: true })
    const output = events.map(event => JSON.stringify(event)).join('\n') + '\n'
    await appendFile(join(directory, `${day}.jsonl`), output, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
  void enforceRetention().catch(error =>
    process.stderr.write(
      `${new Date().toISOString()} retention_failed ${safeError(error)}\n`
    )
  )
  return json(response, 202, {
    ok: true,
    accepted: accepted.length,
    rejected: candidates.length - accepted.length,
  })
}

function normalizeEvent(candidate, receivedAt) {
  if (candidate === null || typeof candidate !== 'object') {
    return null
  }
  const clientId = safeSegment(candidate.clientId, 96)
  const sessionId = safeSegment(candidate.sessionId, 96)
  const level = ['debug', 'info', 'warn', 'error'].includes(candidate.level)
    ? candidate.level
    : null
  if (clientId === null || sessionId === null || level === null) {
    return null
  }
  const message = truncateUtf8(
    redact(String(candidate.message || '')),
    maximumMessageBytes
  )
  if (message.length === 0) {
    return null
  }
  const eventTime = validTimestamp(candidate.timestamp)
    ? new Date(candidate.timestamp).toISOString()
    : receivedAt
  return {
    receivedAt,
    timestamp: eventTime,
    level,
    clientId,
    sessionId,
    appVersion: safeText(candidate.appVersion, 64),
    releaseChannel: safeText(candidate.releaseChannel, 32),
    message,
  }
}

async function query(url, response) {
  const clientValue = url.searchParams.get('client')
  const client = optionalSafeSegment(clientValue, 96)
  if (clientValue !== null && clientValue !== '' && client === null) {
    return json(response, 400, { ok: false, error: 'invalid_client' })
  }
  const levelValue = url.searchParams.get('level')
  const level = levelValue === '' ? null : levelValue
  const needle = (url.searchParams.get('q') || '')
    .toLocaleLowerCase()
    .slice(0, 256)
  const limit = boundedInteger(
    url.searchParams.get('limit'),
    200,
    1,
    maximumQueryResults
  )
  if (level !== null && !['debug', 'info', 'warn', 'error'].includes(level)) {
    return json(response, 400, { ok: false, error: 'invalid_level' })
  }
  const files = await listLogFiles(client)
  const results = []
  for (const file of files.slice(0, maximumQueryFiles)) {
    const lines = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    })
    for await (const line of lines) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (level !== null && event.level !== level) {
        continue
      }
      if (
        needle.length > 0 &&
        !String(event.message).toLocaleLowerCase().includes(needle)
      ) {
        continue
      }
      const receivedAt = String(event.receivedAt)
      const insertionIndex = results.findIndex(
        item => receivedAt.localeCompare(String(item.receivedAt)) > 0
      )
      if (insertionIndex === -1) {
        if (results.length < limit) {
          results.push(event)
        }
      } else {
        results.splice(insertionIndex, 0, event)
        if (results.length > limit) {
          results.pop()
        }
      }
    }
  }
  results.sort((left, right) =>
    String(right.receivedAt).localeCompare(String(left.receivedAt))
  )
  return json(response, 200, {
    ok: true,
    count: results.length,
    events: results,
  })
}

async function listLogFiles(client) {
  const roots =
    client === null
      ? await childDirectories(storageRoot)
      : [join(storageRoot, client)]
  const files = []
  for (const root of roots) {
    for (const entry of await safeReadDir(root)) {
      if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name)) {
        files.push(join(root, entry.name))
      }
    }
  }
  return files.sort().reverse()
}

async function storageStatus(response) {
  const files = await listLogFiles(null)
  let bytes = 0
  for (const file of files) {
    bytes += (await stat(file)).size
  }
  return json(response, 200, {
    ok: true,
    storageRoot,
    retentionDays,
    maximumStorageBytes,
    usedBytes: bytes,
    fileCount: files.length,
    clientCount: (await childDirectories(storageRoot)).length,
  })
}

async function enforceRetention() {
  const cutoff = Date.now() - retentionDays * 86_400_000
  let files = await logFileStats()
  for (const file of files.filter(item => item.mtimeMs < cutoff)) {
    await rm(file.path, { force: true })
  }
  files = await logFileStats()
  let total = files.reduce((sum, item) => sum + item.size, 0)
  for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= maximumStorageBytes) {
      break
    }
    await rm(file.path, { force: true })
    total -= file.size
  }
}

async function logFileStats() {
  const files = await listLogFiles(null)
  return Promise.all(
    files.map(async path => {
      const details = await stat(path)
      return { path, size: details.size, mtimeMs: details.mtimeMs }
    })
  )
}

async function childDirectories(root) {
  return (await safeReadDir(root))
    .filter(
      entry => entry.isDirectory() && safeSegment(entry.name, 96) !== null
    )
    .map(entry => join(root, entry.name))
}

async function safeReadDir(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maximumRequestBytes) {
      throw new RequestTooLargeError()
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function redact(value) {
  return value
    .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@/gi, 'https://[REDACTED]@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(authorization|proxy-authorization|token|password|passwd|secret|api[-_]?key)\b\s*[:=]\s*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;]+)/gi,
      (_match, key) => `${key}=[REDACTED]`
    )
    .replace(
      /\b(?:gh[opsu]_|github_pat_)[A-Za-z0-9_]{12,}\b/g,
      '[REDACTED_TOKEN]'
    )
}

function safeSegment(value, maximumLength) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    return null
  }
  return value.length <= maximumLength ? value : null
}

function optionalSafeSegment(value, maximumLength) {
  if (value === null || value === '') {
    return null
  }
  return safeSegment(value, maximumLength)
}

function safeText(value, maximumLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, maximumLength)
}

function truncateUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) {
    return value
  }
  let bytes = 0
  let end = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maximumBytes) {
      break
    }
    bytes += characterBytes
    end += character.length
  }
  return value.slice(0, end)
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback
}

function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
  )
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

function safeError(error) {
  const digest = createHash('sha256')
    .update(error instanceof Error ? error.message : String(error))
    .digest('hex')
    .slice(0, 12)
  return `error-${digest}`
}

const dashboardHtml = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Desktop Material diagnostics</title>
<style>
body{font:16px system-ui;margin:0;background:#101418;color:#e2e8ee}main{max-width:1100px;margin:auto;padding:32px}
.card{background:#1b2229;border-radius:20px;padding:24px;box-shadow:0 8px 24px #0004}
label{display:block;margin:12px 0 4px}input,select,button{font:inherit;padding:12px;border-radius:12px;border:1px solid #53606d;background:#11171c;color:inherit}
input{width:min(100%,680px)}button{background:#a8c7fa;color:#062e6f;border:0;margin:12px 8px 12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b0f12;padding:16px;border-radius:12px;max-height:60vh;overflow:auto}
</style><main><h1>Desktop Material diagnostics</h1><div class="card">
<p>Search redacted client logs. Your bearer token stays in this page and is sent only to this server.</p>
<label>Bearer token<input id="token" type="password" autocomplete="off"></label>
<label>Text search<input id="query"></label>
<label>Level<select id="level"><option value="">All</option><option>error</option><option>warn</option><option>info</option><option>debug</option></select></label>
<button id="search">Search</button><button id="storage">Storage status</button><pre id="out">Ready.</pre>
</div></main><script>
const out=document.getElementById('out');const token=document.getElementById('token');
async function call(path){out.textContent='Loading…';try{const r=await fetch(path,{headers:{Authorization:'Bearer '+token.value}});out.textContent=JSON.stringify(await r.json(),null,2)}catch(e){out.textContent='Request failed'}}
document.getElementById('search').onclick=()=>call('/v1/logs?q='+encodeURIComponent(document.getElementById('query').value)+'&level='+encodeURIComponent(document.getElementById('level').value));
document.getElementById('storage').onclick=()=>call('/v1/storage');
</script></html>`
