// Headless-style screenshot of the built app via Playwright's Electron driver.
// Launches out/main.js with the Electron binary (overridable via
// ELECTRON_EXE), captures the first window to a PNG, and exits. Used to verify
// the UI without depending on the interactive desktop.
//
// Usage: node script/headless-screenshot.js [outputPng]

const path = require('path')
const { _electron } = require('playwright')

const repoRoot = path.resolve(__dirname, '..')
const electronExe =
  process.env.ELECTRON_EXE ||
  path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const outPng = process.argv[2] || path.join(repoRoot, 'app-shot.png')
const waitMs = parseInt(process.env.SHOT_WAIT_MS || '5000', 10)

async function main() {
  const app = await _electron.launch({
    executablePath: electronExe,
    args: [path.join(repoRoot, 'out', 'main.js')],
    env: { ...process.env, NODE_ENV: 'production' },
    cwd: repoRoot,
  })

  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(waitMs)

  const size = win.viewportSize()
  await win.screenshot({ path: outPng })
  // eslint-disable-next-line no-console
  console.log(
    `SHOT_OK ${outPng} ${size ? size.width + 'x' + size.height : 'unknown'}`
  )

  await app.close()
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('SHOT_FAIL', err && err.stack ? err.stack : err)
  process.exit(1)
})
