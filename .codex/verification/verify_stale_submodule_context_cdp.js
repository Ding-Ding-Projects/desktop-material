#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

function option(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) {
    throw new Error(`Missing ${name}`)
  }
  return process.argv[index + 1]
}

async function main() {
  const port = Number(option('--port'))
  const capture = path.resolve(option('--capture'))
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid loopback CDP port')
  }
  if (fs.existsSync(capture)) {
    throw new Error('Capture already exists')
  }
  fs.mkdirSync(path.dirname(capture), { recursive: true })

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  try {
    const pages = browser.contexts().flatMap(context => context.pages())
    const page = pages.find(candidate =>
      candidate.url().includes('/out/index.html')
    )
    if (page === undefined) {
      throw new Error('Desktop Material renderer unavailable')
    }
    const context = page.locator('.submodule-repository-context')
    if (
      (await page.locator('body').getAttribute('data-dm-language-mode')) !==
      'bilingual'
    ) {
      throw new Error('Bilingual mode is required for this failure check')
    }

    const triggeredRefresh = await context.isVisible()
    if (triggeredRefresh) {
      await page.evaluate(() => require('electron').ipcRenderer.emit('focus'))
      await context.waitFor({ state: 'hidden', timeout: 30_000 })
    }
    const presentation = page.locator('#app-error, .error-notice').first()
    await presentation.waitFor({ state: 'visible', timeout: 30_000 })
    const text = ((await presentation.textContent()) ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const repository = (
      (await page
        .locator('.toolbar-dropdown.foldout-style', {
          has: page.locator('.description', { hasText: 'Current repository' }),
        })
        .locator('.title')
        .textContent()) ?? ''
    ).trim()
    if (
      !text.includes('no longer safe to use') ||
      !text.includes('唔再安全使用') ||
      !text.includes('fixture') ||
      repository !== 'fixture'
    ) {
      throw new Error(
        'The stale-child failure was not bilingual or did not return to fixture'
      )
    }

    const session = await page.context().newCDPSession(page)
    const screenshot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    fs.writeFileSync(capture, Buffer.from(screenshot.data, 'base64'))
    const stat = fs.statSync(capture)
    process.stdout.write(
      `${JSON.stringify({
        status: 'passed',
        languageMode: 'bilingual',
        triggeredRefresh,
        returnedRepository: repository,
        englishNamed: true,
        cantoneseNamed: true,
        capture: { file: path.basename(capture), bytes: stat.size },
      })}\n`
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
