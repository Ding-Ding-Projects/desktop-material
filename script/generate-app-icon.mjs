#!/usr/bin/env node
/**
 * Generate the packaged application icon from the committed master SVG.
 *
 * WHY THIS EXISTS
 *
 * The application must ship its own mark, and that mark has to reach the places
 * Windows actually shows one: the executable, the installer, the taskbar, the
 * window. Those want a multi-resolution `.ico`, and a PNG renamed to `.ico` is
 * not one — it is a file Windows renders at a single size or refuses outright,
 * which looks like a broken install rather than a wrong file.
 *
 * There is no rasteriser among this repository's dependencies, and adding one
 * for a handful of images would be a dependency nobody else needs. Electron is
 * already here and Chromium renders SVG properly, so the master is rendered by
 * the same engine that renders the application, at each required size, with a
 * transparent background, and the results are packed into a real `.ico`.
 *
 * ICO carries either a BMP or, since Windows Vista, a PNG per entry. PNG is
 * used here: it keeps the alpha exactly as rendered and avoids the bottom-up
 * BMP with its separate AND mask, which is the part that goes subtly wrong.
 *
 * Usage:
 *   node script/generate-app-icon.mjs            # write the icon set
 *   node script/generate-app-icon.mjs --check    # verify, change nothing
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const masterPath = join(
  root,
  'app/static/logos/master/desktop-material-logo.svg'
)
const checkOnly = process.argv.includes('--check')

/**
 * The sizes Windows asks for.
 *
 * 16 and 32 are the ones a user looks at all day — taskbar and title bar — so
 * they are rendered rather than downscaled from 256, which is what produces a
 * soft, unreadable small icon.
 */
const IconSizes = [16, 24, 32, 48, 64, 128, 256]

const PngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const say = message => process.stdout.write(`${message}\n`)
const fail = message => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

if (!existsSync(masterPath)) {
  fail(`master logo is missing: ${masterPath}`)
}

/** Electron, as repaired by script/ensure-electron-binary.mjs when needed. */
function electronBinary() {
  const executable =
    process.platform === 'win32'
      ? 'electron.exe'
      : process.platform === 'darwin'
      ? 'Electron.app/Contents/MacOS/Electron'
      : 'electron'
  const candidate = join(root, 'node_modules', 'electron', 'dist', executable)
  if (!existsSync(candidate)) {
    fail(
      `Electron binary is absent at ${candidate}.\n` +
        'Run: node script/ensure-electron-binary.mjs'
    )
  }
  return candidate
}

/** The driver Electron runs, with its inputs baked in as JSON literals. */
function driverSource(sizes, pagePath, resultPath) {
  return [
    "const { app, BrowserWindow, nativeImage } = require('electron')",
    "const { writeFileSync } = require('fs')",
    `const sizes = ${JSON.stringify(sizes)}`,
    `const pagePath = ${JSON.stringify(pagePath)}`,
    `const resultPath = ${JSON.stringify(resultPath)}`,
    'app.disableHardwareAcceleration()',
    // Destroying the window would otherwise trip Electron's default
    // `window-all-closed` handler, which quits the app — the process exits 0
    // with no result file, which reads exactly like a renderer that drew
    // nothing.
    "app.on('window-all-closed', () => {})",
    'app.whenReady().then(async () => {',
    // One window at the largest size, then Chromium's own scaler for the rest.
    //
    // Rendering each size in its own window is the obvious approach and does
    // not work: Windows enforces a minimum window size and applies the display
    // scale factor, so a 16px window captured 32x39 and the three smallest
    // icons came out byte-identical. A capture that is silently the wrong size
    // is worse than a failure, because it packs into a perfectly valid ICO.
    '  const largest = Math.max.apply(null, sizes)',
    '  const win = new BrowserWindow({',
    '    width: largest,',
    '    height: largest,',
    '    useContentSize: true,',
    '    show: false,',
    '    frame: false,',
    '    transparent: true,',
    "    backgroundColor: '#00000000',",
    '  })',
    '  await win.loadFile(pagePath)',
    // A hidden window paints, but `capturePage` can run before the first frame
    // lands and hand back an empty image, which packs into a valid ICO full of
    // blank squares.
    '  await win.webContents.executeJavaScript(',
    "    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'",
    '  )',
    '  const captured = await win.webContents.capturePage()',
    '  const size = captured.getSize()',
    '  if (size.width < largest || size.height < largest) {',
    "    throw new Error('captured ' + size.width + 'x' + size.height + ', smaller than ' + largest)",
    '  }',
    '  const out = {}',
    '  for (const target of sizes) {',
    "    const scaled = captured.resize({ width: target, height: target, quality: 'best' })",
    '    const got = scaled.getSize()',
    '    if (got.width !== target || got.height !== target) {',
    "      throw new Error('resized to ' + got.width + 'x' + got.height + ' for a ' + target + 'px icon')",
    '    }',
    "    out[target] = scaled.toPNG().toString('base64')",
    '  }',
    '  win.destroy()',
    "  writeFileSync(resultPath, JSON.stringify(out), 'utf8')",
    '  app.exit(0)',
    '}).catch(error => {',
    "  process.stderr.write('render failed: ' + ((error && error.stack) || error))",
    '  app.exit(1)',
    '})',
  ].join(String.fromCharCode(10))
}

/**
 * Render the master at every size, in one Electron process.
 *
 * The images come back through a file rather than stdout. Electron exits the
 * moment `app.exit` is called, and a large base64 payload on stdout is
 * truncated or lost on the way out — which presents as a renderer that
 * produced nothing, on a run that rendered everything.
 *
 * The page waits two animation frames before capturing. A hidden window does
 * paint, but `capturePage` can run before the first frame lands and hand back
 * an empty image, which packs into a valid ICO full of blank squares.
 */
function renderSizes(sizes) {
  const svg = readFileSync(masterPath, 'utf8')
  const resultPath = join(root, 'node_modules', '.icon-render-result.json')
  const driverPath = join(root, 'node_modules', '.icon-render-driver.cjs')
  const pagePath = join(root, 'node_modules', '.icon-render-page.html')
  rmSync(resultPath, { force: true })
  // A real file rather than a `data:` URL. The encoded SVG makes the URL long
  // enough that the load is refused, and the refusal arrives as a stop-loading
  // event rather than an exception, so it reads as a renderer that drew
  // nothing.
  writeFileSync(
    pagePath,
    '<!doctype html><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;background:transparent;' +
      'width:100%;height:100%;overflow:hidden}' +
      'svg{display:block;width:100%;height:100%}</style>' +
      svg,
    'utf8'
  )
  writeFileSync(driverPath, driverSource(sizes, pagePath, resultPath), 'utf8')

  return new Promise((resolve, reject) => {
    const child = spawn(electronBinary(), [driverPath], {
      cwd: root,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' },
    })
    let stderr = ''
    child.stdout.on('data', () => {})
    child.stderr.on('data', chunk => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('exit', code => {
      if (!existsSync(resultPath)) {
        reject(
          new Error(
            `the renderer produced no images (exit ${code}).` +
              (stderr.trim().length > 0 ? `\n${stderr.trim()}` : '')
          )
        )
        return
      }
      const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
      rmSync(resultPath, { force: true })
      rmSync(driverPath, { force: true })
      rmSync(pagePath, { force: true })
      resolve(
        new Map(
          Object.entries(parsed).map(([size, base64]) => [
            Number(size),
            Buffer.from(base64, 'base64'),
          ])
        )
      )
    })
  })
}

/**
 * Pack PNGs into a multi-resolution ICO.
 *
 * The directory is fixed-width and the image data follows it, so every offset
 * depends on the total header size — computed once rather than accumulated,
 * because an off-by-one there produces a file that opens in some viewers and
 * not in Explorer.
 */
function packIco(images) {
  const entries = [...images.entries()].sort((a, b) => a[0] - b[0])
  const headerSize = 6 + entries.length * 16

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = []
  let offset = headerSize
  for (const [size, png] of entries) {
    const entry = Buffer.alloc(16)
    // 256 is written as 0: the field is one byte and 256 does not fit in it.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    directory.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...directory, ...entries.map(([, p]) => p)])
}

/** Read back what was written, so a claim of success is a check. */
function describeIco(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error('not an ICO: the reserved word or type is wrong')
  }
  const count = buffer.readUInt16LE(4)
  const found = []
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 16
    const width = buffer.readUInt8(at) || 256
    const length = buffer.readUInt32LE(at + 8)
    const offset = buffer.readUInt32LE(at + 12)
    if (offset + length > buffer.length) {
      throw new Error(`entry ${index} points past the end of the file`)
    }
    // Every entry must really be a PNG, not a renamed something else — the
    // exact failure this script exists to make impossible.
    if (!buffer.subarray(offset, offset + 8).equals(PngSignature)) {
      throw new Error(`entry ${index} (${width}px) is not a PNG`)
    }
    found.push(width)
  }
  return found
}

const targets = [
  join(root, 'app/static/logos/prod/icon-logo.ico'),
  join(root, 'app/static/logos/dev/icon-logo.ico'),
]

if (checkOnly) {
  for (const target of targets) {
    if (!existsSync(target)) {
      fail(`missing icon: ${target}`)
    }
    const sizes = describeIco(readFileSync(target))
    for (const required of IconSizes) {
      if (!sizes.includes(required)) {
        fail(`${target} has no ${required}px image (found ${sizes.join(', ')})`)
      }
    }
    say(`ok ${target} — ${sizes.join(', ')}`)
  }
  process.exit(0)
}

say(`rendering ${masterPath} at ${IconSizes.join(', ')}`)
const images = await renderSizes(IconSizes)
for (const size of IconSizes) {
  const png = images.get(size)
  if (png === undefined || png.length === 0) {
    fail(`the renderer produced nothing for ${size}px`)
  }
  if (!png.subarray(0, 8).equals(PngSignature)) {
    fail(`the renderer produced a non-PNG for ${size}px`)
  }
}

const ico = packIco(images)
const sizes = describeIco(ico)

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, ico)
  say(
    `wrote ${target} — ${sizes.join(', ')} (${ico.length} bytes, sha256 ` +
      `${createHash('sha256').update(ico).digest('hex').slice(0, 16)})`
  )
}

const chromePng = join(root, 'app/static/logos/master/desktop-material-logo.png')
writeFileSync(chromePng, images.get(256))
say(`wrote ${chromePng}`)
