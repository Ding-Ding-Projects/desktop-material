#!/usr/bin/env node
// Audit a already-running app over the Chrome DevTools Protocol.
//
// `capture-app.js` launches its own Electron instance and drives it. This does
// not: it attaches to one that is already up, which is what you want when the
// app is running on an off-screen desktop, when you are stepping through a
// surface by hand, or when the launch-and-seed path is unavailable.
//
// Isolation is asserted, not assumed. The endpoint must expose exactly one page
// target: finding one acceptable target among several proves nothing about what
// else is attached, and auditing the wrong page produces a confident report
// about a surface nobody asked about.
//
// Usage:
//   node script/audit-live-app.mjs --endpoint=http://127.0.0.1:9455 \
//     --label=workspace --out=audit.json [--expect-url=<substring>]

import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { auditSurface } from './capture-audit.js'

function argument(name, fallback = null) {
  const prefix = `--${name}=`
  const found = process.argv.find(entry => entry.startsWith(prefix))
  return found === undefined ? fallback : found.slice(prefix.length)
}

const endpoint = argument('endpoint')
const label = argument('label')
const outPath = argument('out')
const expectUrl = argument('expect-url')

if (endpoint === null || label === null) {
  console.error(
    'usage: node script/audit-live-app.mjs --endpoint=<http://host:port> ' +
      '--label=<surface> [--out=<json>] [--expect-url=<substring>]'
  )
  process.exit(2)
}

const browser = await chromium.connectOverCDP(endpoint)

try {
  const pages = browser.contexts().flatMap(context => context.pages())

  if (pages.length !== 1) {
    const urls = pages.map(page => page.url()).join(', ')
    throw new Error(
      `expected exactly one page target at ${endpoint}, found ${pages.length}` +
        (urls === '' ? '' : `: ${urls}`)
    )
  }

  const page = pages[0]
  const url = page.url()

  if (expectUrl !== null && !url.includes(expectUrl)) {
    throw new Error(
      `the only page target is ${url}, which does not contain "${expectUrl}"`
    )
  }

  const record = await auditSurface(page, { label })
  record.url = url

  const errors = record.findings.filter(finding => finding.severity === 'error')
  const warnings = record.findings.filter(
    finding => finding.severity === 'warn'
  )

  console.log(`surface   ${label}`)
  console.log(`url       ${url}`)
  console.log(`viewport  ${record.viewport.width}x${record.viewport.height}`)
  console.log(`elements  ${record.elementsExamined}`)
  console.log(`errors    ${errors.length}`)
  console.log(`warnings  ${warnings.length}`)
  console.log('')

  for (const [bucket, count] of Object.entries(record.summary).sort()) {
    console.log(`  ${bucket.padEnd(32)} ${count}`)
  }

  if (outPath !== null) {
    writeFileSync(outPath, JSON.stringify(record, null, 2))
    console.log(`\nwrote ${outPath}`)
  }
} finally {
  await browser.close()
}
