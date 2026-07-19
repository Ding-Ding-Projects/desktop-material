#!/usr/bin/env node
'use strict'

/**
 * Responsive CDP verifier for the assembled local Pages gallery.
 *
 * The caller owns the browser process, loopback CDP port, page URL, and unique
 * capture paths. This helper only inspects the supplied page target and never
 * launches, focuses, resizes, or terminates a browser.
 */

const {
  CDPClient,
  capture,
  evaluate,
  fail,
  getJSON,
  validateCapturePath,
  waitFor,
} = require('./verify_actions_pagination_cdp.js')

const milestoneImageDimensions = Object.freeze({
  'material-actions-jobs-pagination.png': Object.freeze({
    width: 960,
    height: 660,
  }),
  'material-actions-pending-deployments.png': Object.freeze({
    width: 944,
    height: 808,
  }),
  'material-repository-tools.png': Object.freeze({
    width: 1440,
    height: 960,
  }),
  'material-repository-tools-scroll.png': Object.freeze({
    width: 960,
    height: 420,
  }),
  'material-effective-branch-rules.png': Object.freeze({
    width: 1440,
    height: 960,
  }),
  'add-submodule-dialog.png': Object.freeze({ width: 1440, height: 960 }),
  'material-customization.png': Object.freeze({ width: 1440, height: 960 }),
  'material-submodule-context.png': Object.freeze({ width: 1440, height: 960 }),
})

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    values.set(name.slice(2), value)
  }

  const port = Number(values.get('port'))
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('port must be an integer from 1 through 65535.')
  }
  const pageUrlContains = values.get('page-url-contains')
  if (pageUrlContains === undefined || pageUrlContains.length < 1) {
    fail('page-url-contains is required.')
  }

  return {
    port,
    pageUrlContains,
    desktopCapture: validateCapturePath(
      values.get('desktop-capture'),
      'desktop-capture'
    ),
    mobileCapture: validateCapturePath(
      values.get('mobile-capture'),
      'mobile-capture'
    ),
  }
}

const geometryExpression = `(() => {
  const visible = element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      rect.width > 0 && rect.height > 0
  }
  const clientWidth = document.documentElement.clientWidth
  const overflow = [...document.body.querySelectorAll('*')]
    .filter(visible)
    .map(element => {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName,
        className: String(element.className || ''),
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }
    })
    .filter(rect => rect.left < -1 || rect.right > clientWidth + 1)
  const outsideControls = [...document.querySelectorAll(
    'a, button, input, select, textarea'
  )]
    .filter(visible)
    .map(element => {
      const rect = element.getBoundingClientRect()
      return {
        text: (element.textContent || element.getAttribute('aria-label') || '')
          .trim().slice(0, 80),
        left: rect.left,
        right: rect.right,
      }
    })
    .filter(rect => rect.left < -1 || rect.right > clientWidth + 1)
  const images = [...document.images].map(image => ({
    src: image.getAttribute('src'),
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))
  const galleryFigures = [...document.querySelectorAll('figure.shot')]
  const invalidGalleryCards = galleryFigures
    .map((figure, index) => ({
      index,
      imageCount: figure.querySelectorAll('img').length,
    }))
    .filter(figure => figure.imageCount !== 1)
  return {
    innerWidth,
    innerHeight,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    imageCount: images.length,
    figureCount: galleryFigures.length,
    galleryImageCount: document.querySelectorAll('figure.shot img').length,
    invalidGalleryCards,
    brokenImages: images.filter(image =>
      !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0
    ),
    milestoneImages: images.filter(image =>
      ${JSON.stringify(Object.keys(milestoneImageDimensions))}.some(file =>
        image.src?.includes(file)
      )
    ),
    overflow,
    outsideControls,
  }
})()`

function assertReceipt(receipt, label) {
  const exactMilestoneImages = Object.entries(milestoneImageDimensions).every(
    ([file, dimensions]) => {
      const matches = receipt.milestoneImages.filter(image =>
        image.src?.includes(file)
      )
      return (
        matches.length === 1 &&
        matches[0].naturalWidth === dimensions.width &&
        matches[0].naturalHeight === dimensions.height
      )
    }
  )
  if (receipt.documentClientWidth !== receipt.documentScrollWidth) {
    fail(
      `${label} document has horizontal overflow: ${JSON.stringify(receipt)}`
    )
  }
  if (receipt.bodyClientWidth !== receipt.bodyScrollWidth) {
    fail(`${label} body has horizontal overflow: ${JSON.stringify(receipt)}`)
  }
  // The gallery grows over time, so verify its structure instead of a fixed size.
  if (
    receipt.imageCount < 1 ||
    receipt.figureCount < 1 ||
    receipt.galleryImageCount !== receipt.figureCount ||
    receipt.invalidGalleryCards.length > 0 ||
    receipt.brokenImages.length > 0 ||
    !exactMilestoneImages ||
    receipt.overflow.length > 0 ||
    receipt.outsideControls.length > 0
  ) {
    fail(`${label} Pages gallery failed geometry: ${JSON.stringify(receipt)}`)
  }
}

async function loadEveryImage(client) {
  const count = await evaluate(client, 'document.images.length')
  await evaluate(
    client,
    `(() => {
      for (const image of document.images) {
        image.loading = 'eager'
      }
      return document.images.length
    })()`
  )
  await waitFor(
    client,
    `[...document.images].every(image =>
      image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    )`,
    `all ${count} Pages images`,
    10_000
  )
}

async function inspectViewport(client, spec, capturePath) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: spec.width,
    height: spec.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: spec.width,
    screenHeight: spec.height,
  })
  await loadEveryImage(client)
  await evaluate(
    client,
    `(() => {
      const image = [...document.images].find(value =>
        value.getAttribute('src')?.includes(${JSON.stringify(spec.target)})
      )
      document.documentElement.style.scrollBehavior = 'auto'
      if (image !== undefined) {
        const rect = image.getBoundingClientRect()
        window.scrollTo(0, scrollY + rect.top - (innerHeight - rect.height) / 2)
      }
      return image !== undefined
    })()`
  )
  await new Promise(resolve => setTimeout(resolve, 250))
  const receipt = await evaluate(client, geometryExpression)
  assertReceipt(receipt, spec.name)
  const captureBytes = await capture(client, capturePath)
  return { ...spec, receipt, capturePath, captureBytes }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const targets = await getJSON(options.port, '/json/list')
  const target = targets.find(
    value =>
      value.type === 'page' &&
      value.webSocketDebuggerUrl &&
      String(value.url).includes(options.pageUrlContains)
  )
  if (target === undefined) {
    fail('The assembled Pages target was not exposed on the owned CDP port.')
  }

  const client = new CDPClient(target.webSocketDebuggerUrl)
  await client.open()
  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    const desktop = await inspectViewport(
      client,
      {
        name: 'desktop',
        width: 960,
        height: 660,
        target: 'material-actions-jobs-pagination.png',
      },
      options.desktopCapture
    )
    const mobile = await inspectViewport(
      client,
      {
        name: 'mobile',
        width: 390,
        height: 844,
        target: 'material-actions-pending-deployments.png',
      },
      options.mobileCapture
    )
    process.stdout.write(`${JSON.stringify({ ok: true, desktop, mobile })}\n`)
  } finally {
    try {
      await client.send('Emulation.clearDeviceMetricsOverride')
    } finally {
      client.close()
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(
      `${error?.stack || error?.message || String(error ?? 'Unknown error.')}\n`
    )
    process.exitCode = 1
  })
}

module.exports = {
  assertReceipt,
  geometryExpression,
  milestoneImageDimensions,
  parseArguments,
}
