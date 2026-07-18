import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function reservePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const { port } = address
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  )
  return port
}

async function waitForPage(url, child, output) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`standalone server exited early: ${output()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // The standalone listener is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`standalone server did not become ready: ${output()}`)
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  let timeout
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('standalone server did not stop')),
          5_000
        )
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

test('standalone production server delivers every rendered asset', async () => {
  const port = await reservePort()
  const chunks = []
  const child = spawn(process.execPath, ['dist/standalone/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', chunk => chunks.push(chunk.toString()))
  child.stderr.on('data', chunk => chunks.push(chunk.toString()))
  const output = () => chunks.join('').slice(-8_000)

  try {
    const pageUrl = `http://127.0.0.1:${port}/connect`
    const response = await waitForPage(pageUrl, child, output)
    const html = await response.text()
    assert.doesNotMatch(html, /file:\/\//i)

    const assetPaths = [
      ...html.matchAll(/(?:src|href)="([^"#?]+\.(?:css|js)(?:\?[^"#]*)?)"/gi),
    ].map(match => match[1])
    assert.ok(assetPaths.length > 0, 'rendered page must reference assets')

    for (const path of new Set(assetPaths)) {
      const asset = await fetch(new URL(path, pageUrl))
      assert.equal(asset.status, 200, `${path} should be delivered`)
      assert.ok(
        (await asset.arrayBuffer()).byteLength > 0,
        `${path} should not be empty`
      )
    }
  } finally {
    await stopChild(child)
  }
})
