'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, ipcMain, session } = require('electron')
const { catalogReceipt, parseArguments, runtimeHtml } = require('./catalog.cjs')

let launchConfiguration
try {
  launchConfiguration = parseArguments(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}

if (launchConfiguration.list) {
  process.stderr.write('Use node design-app/run.mjs --list true.\n')
  process.exit(2)
}

app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-default-apps')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch(
  'disable-features',
  'Translate,MediaRouter,OptimizationHints'
)
app.commandLine.appendSwitch('disable-sync')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND')
app.commandLine.appendSwitch('metrics-recording-only')
app.commandLine.appendSwitch('no-first-run')
app.commandLine.appendSwitch('no-pings')

let blockedNetworkRequests = 0

function registerIpc() {
  ipcMain.handle('design-reference:catalog', () => catalogReceipt())
  ipcMain.handle('design-reference:read', (_event, reference) =>
    runtimeHtml(reference)
  )
  ipcMain.handle('design-reference:launch-configuration', () => ({
    reference: launchConfiguration.reference,
    state: launchConfiguration.state,
    theme: launchConfiguration.theme,
    width: launchConfiguration.width,
    height: launchConfiguration.height,
    autoFit: launchConfiguration.autoFit,
    capture: Boolean(launchConfiguration.capture),
  }))
  ipcMain.handle('design-reference:window-action', (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return
    if (action === 'minimize') window.minimize()
    else if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    } else if (action === 'close') window.close()
  })
}

function configureSession() {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false)
    }
  )
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => {
      blockedNetworkRequests += 1
      callback({ cancel: true })
    }
  )
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (/^https?:/i.test(url)) event.preventDefault()
    })
  })
}

function webPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    backgroundThrottling: false,
  }
}

async function waitForCaptureReceipt(window) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript(
      'window.__designCaptureReceipt || null',
      true
    )
    if (result) {
      if (result.error) throw new Error(result.error)
      return result
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('The design reference did not reach a capture-ready state.')
}

async function runCapture() {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    width: launchConfiguration.width,
    height: launchConfiguration.height,
    backgroundColor: '#f8f9ff',
    webPreferences: webPreferences(),
  })
  try {
    window.webContents.setZoomFactor(1)
    await window.loadFile(path.join(__dirname, 'capture.html'))
    const rendererReceipt = await waitForCaptureReceipt(window)
    if (blockedNetworkRequests !== 0) {
      throw new Error(
        `The capture attempted ${blockedNetworkRequests} blocked network request(s).`
      )
    }
    const image = await window.webContents.capturePage()
    const size = image.getSize()
    if (
      size.width !== launchConfiguration.width ||
      size.height !== launchConfiguration.height
    ) {
      throw new Error(
        `Captured ${size.width}x${size.height}; expected ${launchConfiguration.width}x${launchConfiguration.height}.`
      )
    }
    const png = image.toPNG()
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (
      png.length <= pngSignature.length ||
      !png.subarray(0, 8).equals(pngSignature)
    ) {
      throw new Error('Electron did not return a PNG capture.')
    }
    fs.writeFileSync(launchConfiguration.capture, png, { flag: 'wx' })
    const receipt = {
      schemaVersion: 1,
      output: launchConfiguration.capture,
      bytes: png.length,
      sha256: crypto.createHash('sha256').update(png).digest('hex'),
      width: size.width,
      height: size.height,
      blockedNetworkRequests,
      reference: rendererReceipt.reference,
      state: rendererReceipt.state,
      observed: rendererReceipt.observed,
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}

async function openViewer() {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    useContentSize: true,
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f8f9ff',
    webPreferences: webPreferences(),
  })
  await window.loadFile(path.join(__dirname, 'index.html'))
  window.show()
}

app.whenReady().then(async () => {
  registerIpc()
  configureSession()
  try {
    if (launchConfiguration.capture) await runCapture()
    else await openViewer()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  } finally {
    if (launchConfiguration.capture) app.quit()
  }
})

app.on('window-all-closed', () => app.quit())
