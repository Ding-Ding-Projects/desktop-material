const fs = require('node:fs')
const http = require('node:http')
const WebSocket = require('ws')

const port = Number(process.env.DM_CDP_PORT || 9223)
const mode = process.argv[2]
if (mode !== 'start' && mode !== 'finish') {
  throw new Error(
    'Usage: node renderer_interaction_probe_cdp.js <start|finish>'
  )
}

const getJSON = url =>
  new Promise((resolve, reject) => {
    http
      .get(url, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => (body += chunk))
        response.on('end', () => resolve(JSON.parse(body)))
      })
      .on('error', reject)
  })

async function main() {
  const targets = await getJSON(`http://127.0.0.1:${port}/json/list`)
  const page = targets.find(target => target.type === 'page')
  if (page === undefined) {
    throw new Error('No renderer page target found.')
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
    const entry = pending.get(message.id)
    if (entry === undefined) {
      return
    }
    pending.delete(message.id)
    message.error === undefined
      ? entry.resolve(message.result)
      : entry.reject(new Error(message.error.message))
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const callId = ++id
      pending.set(callId, { resolve, reject })
      socket.send(JSON.stringify({ id: callId, method, params }))
    })

  const expression =
    mode === 'start'
      ? `(() => {
          window.__dmPerfProbe?.observers?.forEach(observer => observer.disconnect())
          const data = {
            startedAt: performance.now(),
            longTasks: [],
            events: [],
            mutations: 0,
            observers: [],
          }
          try {
            const observer = new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                data.longTasks.push({
                  startTime: entry.startTime,
                  duration: entry.duration,
                  name: entry.name,
                })
              }
            })
            observer.observe({ type: 'longtask', buffered: true })
            data.observers.push(observer)
          } catch {}
          try {
            const observer = new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                if (entry.name === 'click' || entry.name === 'keydown') {
                  data.events.push({
                    name: entry.name,
                    duration: entry.duration,
                    processingStart: entry.processingStart,
                    processingEnd: entry.processingEnd,
                    startTime: entry.startTime,
                  })
                }
              }
            })
            observer.observe({ type: 'event', buffered: true, durationThreshold: 0 })
            data.observers.push(observer)
          } catch {}
          const mutations = new MutationObserver(records => {
            data.mutations += records.length
          })
          mutations.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          })
          data.observers.push(mutations)
          window.__dmPerfProbe = data
          return { started: true, supportedEntryTypes: PerformanceObserver.supportedEntryTypes }
        })()`
      : `(async () => {
          const data = window.__dmPerfProbe
          if (!data) {
            throw new Error('Interaction probe was not started.')
          }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          data.observers.forEach(observer => observer.disconnect())
          const events = data.events.filter(entry => entry.startTime >= data.startedAt)
          const longTasks = data.longTasks.filter(entry => entry.startTime >= data.startedAt)
          const durations = events.map(entry => entry.duration).sort((a, b) => a - b)
          const percentile = p =>
            durations.length === 0
              ? 0
              : durations[Math.min(durations.length - 1, Math.floor(durations.length * p))]
          return {
            elapsedMs: performance.now() - data.startedAt,
            eventCount: events.length,
            eventDurationsMs: durations,
            eventP95Ms: percentile(0.95),
            eventMaximumMs: durations[durations.length - 1] || 0,
            longTaskCount: longTasks.length,
            longTasks,
            mutationRecordCount: data.mutations,
            finalNodeCount: document.getElementsByTagName('*').length,
          }
        })()`
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  socket.close()
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text)
  }
  const value = result.result.value
  if (mode === 'finish') {
    const output =
      process.env.DM_PERF_OUTPUT ||
      'docs/verification/renderer-responsiveness-2026-07-28/interaction-profile.json'
    fs.mkdirSync(require('node:path').dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
