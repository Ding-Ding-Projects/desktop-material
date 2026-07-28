const fs = require('node:fs')
const http = require('node:http')
const WebSocket = require('ws')

const port = Number(process.env.DM_CDP_PORT || 9223)
const output =
  process.env.DM_PERF_OUTPUT ||
  'docs/verification/renderer-responsiveness-2026-07-28/runtime-profile.json'
const sourceTag = process.env.DM_SOURCE_TAG || 'unknown'
const sourceCommit = process.env.DM_SOURCE_COMMIT || 'unknown'

const getJSON = url =>
  new Promise((resolve, reject) => {
    http
      .get(url, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => (body += chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })

async function main() {
  const targets = await getJSON(`http://127.0.0.1:${port}/json/list`)
  const page = targets.find(target => target.type === 'page')
  if (page === undefined) {
    throw new Error('No page target is available on the requested CDP port.')
  }

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })

  let id = 0
  const pending = new Map()
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString())
    if (message.id === undefined) {
      return
    }
    const entry = pending.get(message.id)
    if (entry === undefined) {
      return
    }
    pending.delete(message.id)
    if (message.error !== undefined) {
      entry.reject(new Error(message.error.message))
    } else {
      entry.resolve(message.result)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const callId = ++id
      pending.set(callId, { resolve, reject })
      socket.send(JSON.stringify({ id: callId, method, params }))
    })

  await send('Performance.enable')
  const runtime = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const frameDeltas = []
      let previous = performance.now()
      const end = previous + 2000
      await new Promise(resolve => {
        const sample = now => {
          frameDeltas.push(now - previous)
          previous = now
          if (now >= end) {
            resolve()
          } else {
            requestAnimationFrame(sample)
          }
        }
        requestAnimationFrame(sample)
      })
      frameDeltas.sort((a, b) => a - b)
      const percentile = p =>
        frameDeltas[Math.min(frameDeltas.length - 1, Math.floor(frameDeltas.length * p))]
      return {
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        nodeCount: document.getElementsByTagName('*').length,
        buttons: Array.from(document.querySelectorAll('button'))
          .map(button => (button.getAttribute('aria-label') || button.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 100),
        frameSample: {
          count: frameDeltas.length,
          averageMs: frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length,
          p95Ms: percentile(0.95),
          maximumMs: frameDeltas[frameDeltas.length - 1],
          over25Ms: frameDeltas.filter(value => value > 25).length,
          over50Ms: frameDeltas.filter(value => value > 50).length,
        },
        navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        measures: performance.getEntriesByType('measure').map(entry => entry.toJSON()),
      }
    })()`,
  })
  const metrics = await send('Performance.getMetrics')
  socket.close()

  const byName = Object.fromEntries(
    metrics.metrics.map(metric => [metric.name, metric.value])
  )
  const report = {
    capturedAt: new Date().toISOString(),
    sourceTag,
    sourceCommit,
    runtime: runtime.result.value,
    metrics: {
      taskDurationSeconds: byName.TaskDuration,
      scriptDurationSeconds: byName.ScriptDuration,
      layoutDurationSeconds: byName.LayoutDuration,
      recalcStyleDurationSeconds: byName.RecalcStyleDuration,
      jsHeapUsedBytes: byName.JSHeapUsedSize,
      jsHeapTotalBytes: byName.JSHeapTotalSize,
      documents: byName.Documents,
      frames: byName.Frames,
      nodes: byName.Nodes,
      layoutCount: byName.LayoutCount,
      recalcStyleCount: byName.RecalcStyleCount,
    },
  }
  fs.mkdirSync(require('node:path').dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
