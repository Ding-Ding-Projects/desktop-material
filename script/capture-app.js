// Reusable capture fixture for the built app.
//
// Launches `out/main.js` through Playwright's Electron driver with N
// repositories already open as tabs, runs an optional list of UI steps, and
// writes a PNG. Every run uses a throwaway `--user-data-dir` (and a throwaway
// fake home for Git) so it can never touch a developer profile, and every
// renderer console error is reported alongside the capture so a capture run
// doubles as a smoke check.
//
// Why the tabs are seeded rather than clicked: `--cli-open` honours only the
// first path, and driving the Add-repository dialog N times proved fragile (the
// typed path lands in the repositories-sheet filter instead of the dialog).
// Instead the repositories are written straight into the renderer's IndexedDB
// (`Database` → `repositories`, the store behind `RepositoriesDatabase`), the
// window is reloaded so the app reads them, and then one `cli-action`
// `open-repository` IPC per path is sent from the main process. Each one now
// matches an existing repository, so the app takes its own `selectRepository`
// → `ensureTabForRepository` path and a tab appears — no dialog involved.
//
// Usage:
//   node script/capture-app.js --out=shot.png --tabs=12
//   node script/capture-app.js --out=shot.png --repo=C:\a --repo=C:\b \
//     --size=1280x800 --step=click:.repository-tab-overflow --step=wait:600
//
// Options:
//   --out=<png>          output file (default <repoRoot>/app-shot.png)
//   --repo=<path>        repository to open as a tab (repeatable)
//   --tabs=<n>           create and open N throwaway git repositories
//   --repos-root=<dir>   where throwaway repositories are created
//   --size=<WxH>         window content size, applied before the tabs open
//   --step=<step>        UI step to run before the capture (repeatable)
//   --steps-file=<json>  JSON array of steps, appended after every --step
//   --wait=<ms>          settle time before the capture (default 2500)
//   --timeout=<ms>       per-operation timeout (default 15000)
//   --report=<json>      also write a JSON report (console errors, tab count)
//   --main=<main.js>     app entry point (default <repoRoot>/out/main.js)
//   --keep-user-data     do not delete the throwaway profile (debugging)
//   --keep-repos         do not delete the throwaway repositories
//   --strict-console     exit non-zero when the renderer logged errors
//
// Steps:
//   wait:<ms>                    sleep
//   wait-for:<selector>          wait for a selector to become visible
//   click:<selector>             click a selector
//   click-text:<text>            click by exact visible text (links included)
//   hover:<selector>             hover a selector
//   type:<selector>::<text>      fill a field
//   press:<key>                  press a key on the page
//   press:<selector>::<key>      press a key on a selector
//   resize:<WxH>                 resize the window mid-run

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

/**
 * The welcome flow, in order. Matched as visible text rather than by tag
 * because some of these are links and some are buttons, and every one of them
 * is optional: a profile that has already passed a step simply skips it.
 */
const WelcomeFlowSteps = [
  'Continue without signing in',
  'Finish',
  'Skip for now',
]

/** The Dexie database and object store that back `RepositoriesStore`. */
const RepositoriesDatabaseName = 'Database'
const RepositoriesObjectStoreName = 'repositories'

/**
 * How many tabs the strip currently owns, as a browser-side expression: the
 * tabs it renders plus the ones it pushed into the overflow dropdown. Overflowed
 * tabs are removed from the DOM, so counting rendered tabs alone under-reports
 * exactly when the interesting scenario starts.
 */
const TabCountExpression = `(() => {
  const strip = document.querySelector('.repository-tab-strip')
  if (strip === null) {
    return 0
  }
  const rendered = strip.querySelectorAll('[role="tab"]').length
  const label = strip.querySelector('.repository-tab-overflow-count')
  const overflowed = Number.parseInt((label && label.textContent) || '0', 10)
  return rendered + (Number.isFinite(overflowed) ? overflowed : 0)
})()`

const DefaultSettleMilliseconds = 2500
const DefaultTimeoutMilliseconds = 15000

/** Parse `<width>x<height>`, or return null when it is not a size. */
function parseSize(value) {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(String(value).trim())
  return match === null
    ? null
    : { width: Number(match[1]), height: Number(match[2]) }
}

/** Parse one `--step=` value into a structured step. Throws when malformed. */
function parseStep(raw) {
  const value = String(raw)
  const separator = value.indexOf(':')
  const kind = separator === -1 ? value : value.slice(0, separator)
  const rest = separator === -1 ? '' : value.slice(separator + 1)

  switch (kind) {
    case 'wait': {
      const milliseconds = Number.parseInt(rest, 10)
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error(`Invalid wait step: ${value}`)
      }
      return { kind, milliseconds }
    }
    case 'wait-for':
    case 'click':
    case 'hover': {
      if (rest.length === 0) {
        throw new Error(`Step ${kind} needs a selector: ${value}`)
      }
      return { kind, selector: rest }
    }
    case 'click-text': {
      if (rest.length === 0) {
        throw new Error(`Step click-text needs text: ${value}`)
      }
      return { kind, text: rest }
    }
    case 'type': {
      const index = rest.indexOf('::')
      if (index <= 0) {
        throw new Error(`Step type needs <selector>::<text>: ${value}`)
      }
      return {
        kind,
        selector: rest.slice(0, index),
        text: rest.slice(index + 2),
      }
    }
    case 'press': {
      const index = rest.indexOf('::')
      if (index === -1) {
        if (rest.length === 0) {
          throw new Error(`Step press needs a key: ${value}`)
        }
        return { kind, selector: null, key: rest }
      }
      return {
        kind,
        selector: rest.slice(0, index),
        key: rest.slice(index + 2),
      }
    }
    case 'resize': {
      const size = parseSize(rest)
      if (size === null) {
        throw new Error(`Step resize needs <width>x<height>: ${value}`)
      }
      return { kind, size }
    }
    default:
      throw new Error(`Unknown capture step: ${value}`)
  }
}

/** Turn `--flag=value` / `--flag` arguments into capture options. */
function parseCaptureArguments(argv) {
  const options = {
    outPath: null,
    repositoryPaths: [],
    tabs: 0,
    repositoriesRoot: null,
    size: null,
    steps: [],
    stepsFile: null,
    settleMilliseconds: DefaultSettleMilliseconds,
    timeoutMilliseconds: DefaultTimeoutMilliseconds,
    reportPath: null,
    mainPath: null,
    keepUserData: false,
    keepRepositories: false,
    strictConsole: false,
  }

  for (const argument of argv) {
    const match = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(argument)
    if (match === null) {
      if (options.outPath === null) {
        options.outPath = argument
        continue
      }
      throw new Error(`Unexpected argument: ${argument}`)
    }

    const [, name, rawValue] = match
    const value = rawValue === undefined ? '' : rawValue
    switch (name) {
      case 'out':
        options.outPath = value
        break
      case 'repo':
        options.repositoryPaths.push(value)
        break
      case 'tabs': {
        const count = Number.parseInt(value, 10)
        if (!Number.isFinite(count) || count < 0 || count > 64) {
          throw new Error(`--tabs must be between 0 and 64: ${value}`)
        }
        options.tabs = count
        break
      }
      case 'repos-root':
        options.repositoriesRoot = value
        break
      case 'size': {
        const size = parseSize(value)
        if (size === null) {
          throw new Error(`--size must be <width>x<height>: ${value}`)
        }
        options.size = size
        break
      }
      case 'step':
        options.steps.push(parseStep(value))
        break
      case 'steps-file':
        options.stepsFile = value
        break
      case 'wait': {
        const milliseconds = Number.parseInt(value, 10)
        if (!Number.isFinite(milliseconds) || milliseconds < 0) {
          throw new Error(`--wait must be a number of milliseconds: ${value}`)
        }
        options.settleMilliseconds = milliseconds
        break
      }
      case 'timeout': {
        const milliseconds = Number.parseInt(value, 10)
        if (!Number.isFinite(milliseconds) || milliseconds < 1000) {
          throw new Error(`--timeout must be at least 1000: ${value}`)
        }
        options.timeoutMilliseconds = milliseconds
        break
      }
      case 'report':
        options.reportPath = value
        break
      case 'main':
        options.mainPath = value
        break
      case 'keep-user-data':
        options.keepUserData = true
        break
      case 'keep-repos':
        options.keepRepositories = true
        break
      case 'strict-console':
        options.strictConsole = true
        break
      default:
        throw new Error(`Unknown option: --${name}`)
    }
  }

  return options
}

/** The Electron binary the built app is launched with. */
function getElectronExecutablePath() {
  if (process.env.ELECTRON_EXE) {
    return process.env.ELECTRON_EXE
  }

  const binary = process.platform === 'win32' ? 'electron.exe' : 'electron'
  return path.join(repoRoot, 'node_modules', 'electron', 'dist', binary)
}

function runGit(args, cwd) {
  execFileSync('git', [...args], { cwd, stdio: 'ignore' })
}

/**
 * Create `count` throwaway git repositories, one per tab. Deliberately the same
 * recipe as `ensureSmokeTestRepository` in `app/test/e2e/test-helpers.ts`
 * (init, local identity, one commit, one uncommitted file) so a captured
 * workspace looks like the one the e2e suite drives. Pass existing repositories
 * with `--repo=` instead when a capture needs specific ones.
 */
function createCaptureRepositories(count, root) {
  fs.mkdirSync(root, { recursive: true })

  const paths = []
  for (let index = 0; index < count; index++) {
    const name = `capture-repository-${String(index + 1).padStart(2, '0')}`
    const repositoryPath = path.join(root, name)

    fs.rmSync(repositoryPath, { recursive: true, force: true })
    fs.mkdirSync(repositoryPath, { recursive: true })

    runGit(['init'], repositoryPath)
    runGit(['config', 'user.name', 'Desktop Material Capture'], repositoryPath)
    runGit(
      ['config', 'user.email', 'desktop-capture@example.invalid'],
      repositoryPath
    )
    fs.writeFileSync(
      path.join(repositoryPath, 'README.md'),
      `# ${name}\n\nThrowaway repository created by script/capture-app.js.\n`
    )
    runGit(['add', 'README.md'], repositoryPath)
    runGit(['commit', '-m', 'Initial commit'], repositoryPath)
    fs.writeFileSync(
      path.join(repositoryPath, 'capture-change.txt'),
      'This file should appear in the changes list.\n'
    )

    paths.push(repositoryPath)
  }

  return paths
}

/** Click an element by its exact visible text. Returns false when absent. */
async function clickVisibleText(page, text, timeoutMilliseconds) {
  const target = page.getByText(text, { exact: true }).first()
  try {
    await target.waitFor({ state: 'visible', timeout: timeoutMilliseconds })
  } catch {
    return false
  }

  await target.click({ timeout: timeoutMilliseconds })
  return true
}

/**
 * Drive past the first-run/welcome flow. Every step is optional and matched as
 * text, so this is safe to call again after a reload.
 */
async function completeWelcomeFlow(page, timeoutMilliseconds) {
  const completed = []
  for (const step of WelcomeFlowSteps) {
    if (await clickVisibleText(page, step, timeoutMilliseconds)) {
      completed.push(step)
    }
  }
  return completed
}

/** Resize the app's window by content size (the viewport, not the frame). */
async function setWindowContentSize(electronApp, size) {
  await electronApp.evaluate(({ BrowserWindow }, target) => {
    const [window] = BrowserWindow.getAllWindows()
    if (window === undefined) {
      throw new Error('No BrowserWindow to resize')
    }
    window.setContentSize(target.width, target.height)
  }, size)
}

/**
 * Write repository rows straight into the renderer's IndexedDB. This is the
 * whole point of the fixture: it is the one setup path that does not depend on
 * the Add-repository dialog. The rows mirror `IDatabaseRepository` for a plain
 * local repository; ids come from the store's own autoIncrement key.
 */
function seedRepositories(page, repositoryPaths, timeoutMilliseconds) {
  return page.evaluate(
    async ({ paths, databaseName, storeName, timeout }) => {
      const deadline = Date.now() + timeout

      const openDatabase = () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () =>
            reject(request.error || new Error('indexedDB.open failed'))
          request.onblocked = () =>
            reject(new Error('indexedDB.open was blocked'))
        })

      let database = await openDatabase()
      while (
        !database.objectStoreNames.contains(storeName) &&
        Date.now() < deadline
      ) {
        database.close()
        await new Promise(resolve => setTimeout(resolve, 250))
        database = await openDatabase()
      }

      if (!database.objectStoreNames.contains(storeName)) {
        database.close()
        throw new Error(
          `The ${databaseName} database has no ${storeName} store yet`
        )
      }

      const seeded = await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const existing = store.getAll()
        let added = 0

        existing.onsuccess = () => {
          const known = new Set(
            (existing.result || []).map(row => String(row.path).toLowerCase())
          )
          for (const repositoryPath of paths) {
            if (known.has(repositoryPath.toLowerCase())) {
              continue
            }
            store.add({
              gitHubRepositoryID: null,
              path: repositoryPath,
              alias: null,
              missing: false,
              groupName: null,
              defaultBranch: null,
              customEditorOverride: null,
            })
            added++
          }
        }

        transaction.oncomplete = () => resolve(added)
        transaction.onerror = () =>
          reject(transaction.error || new Error('seed transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error || new Error('seed transaction aborted'))
      })

      database.close()
      return seeded
    },
    {
      paths: repositoryPaths,
      databaseName: RepositoriesDatabaseName,
      storeName: RepositoriesObjectStoreName,
      timeout: timeoutMilliseconds,
    }
  )
}

function readTabCount(page) {
  return page.evaluate(TabCountExpression)
}

function waitForTabCount(page, expected, timeoutMilliseconds) {
  return page.waitForFunction(`${TabCountExpression} >= ${expected}`, null, {
    timeout: timeoutMilliseconds,
  })
}

/**
 * Open one tab per repository by replaying the app's own CLI action. The
 * repositories are already in the database at this point, so each action takes
 * the `selectRepository` branch instead of showing the Add-repository dialog.
 */
async function openRepositoryTabs(
  electronApp,
  page,
  repositoryPaths,
  timeoutMilliseconds
) {
  for (const [index, repositoryPath] of repositoryPaths.entries()) {
    await electronApp.evaluate(({ BrowserWindow }, target) => {
      const [window] = BrowserWindow.getAllWindows()
      if (window === undefined) {
        throw new Error('No BrowserWindow to send the CLI action to')
      }
      window.webContents.send('cli-action', {
        kind: 'open-repository',
        path: target,
      })
    }, repositoryPath)

    await waitForTabCount(page, index + 1, timeoutMilliseconds)
  }
}

async function runStep(page, electronApp, step, timeoutMilliseconds) {
  switch (step.kind) {
    case 'wait':
      await page.waitForTimeout(step.milliseconds)
      return
    case 'wait-for':
      await page
        .locator(step.selector)
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMilliseconds })
      return
    case 'click':
      await page
        .locator(step.selector)
        .first()
        .click({ timeout: timeoutMilliseconds })
      return
    case 'click-text': {
      const clicked = await clickVisibleText(
        page,
        step.text,
        timeoutMilliseconds
      )
      if (!clicked) {
        throw new Error(`No visible element with the text “${step.text}”`)
      }
      return
    }
    case 'hover':
      await page
        .locator(step.selector)
        .first()
        .hover({ timeout: timeoutMilliseconds })
      return
    case 'type':
      await page
        .locator(step.selector)
        .first()
        .fill(step.text, { timeout: timeoutMilliseconds })
      return
    case 'press':
      if (step.selector === null) {
        await page.keyboard.press(step.key)
        return
      }
      await page
        .locator(step.selector)
        .first()
        .press(step.key, { timeout: timeoutMilliseconds })
      return
    case 'resize':
      await setWindowContentSize(electronApp, step.size)
      await page.waitForTimeout(400)
      return
    default:
      throw new Error(`Unknown capture step: ${JSON.stringify(step)}`)
  }
}

/**
 * Launch the built app with the given repositories open as tabs, run the given
 * steps, and write a PNG. Resolves with a report describing what happened.
 */
async function captureApp(options) {
  // Required lazily so argument parsing and the unit tests never need
  // Playwright (or a built app) to be installed.
  const { _electron } = require('playwright')

  const outPath = path.resolve(
    options.outPath || path.join(repoRoot, 'app-shot.png')
  )
  const mainPath = path.resolve(
    options.mainPath || path.join(repoRoot, 'out', 'main.js')
  )
  const timeoutMilliseconds =
    options.timeoutMilliseconds || DefaultTimeoutMilliseconds

  if (!fs.existsSync(mainPath)) {
    throw new Error(
      `No built app at ${mainPath}. Run: cross-env DESKTOP_SKIP_PACKAGE=1 yarn build:prod`
    )
  }

  const repositoriesRoot =
    options.repositoriesRoot ||
    path.join(os.tmpdir(), 'desktop-material-capture-repositories')
  const createdRepositoryPaths =
    options.tabs > 0
      ? createCaptureRepositories(options.tabs, repositoriesRoot)
      : []
  const repositoryPaths = [
    ...(options.repositoryPaths || []).map(entry => path.resolve(entry)),
    ...createdRepositoryPaths,
  ]

  // A throwaway profile every run: a capture must never read or write the
  // developer's real user data directory.
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-capture-profile-')
  )
  const fakeHomeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'desktop-material-capture-home-')
  )

  const consoleErrors = []
  let electronApp = null

  try {
    electronApp = await _electron.launch({
      executablePath: getElectronExecutablePath(),
      args: [mainPath, `--user-data-dir=${userDataDir}`],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // The same isolation the e2e fixture uses, so a capture can never pick
        // up the developer's Git identity, config, or SSH agent.
        GIT_CONFIG_GLOBAL: path.join(fakeHomeDir, '.gitconfig'),
        GIT_CONFIG_SYSTEM: path.join(fakeHomeDir, '.gitconfig-system'),
        XDG_CONFIG_HOME: path.join(fakeHomeDir, '.config'),
        SSH_AUTH_SOCK: '',
        GIT_SSH_COMMAND: 'false',
      },
      timeout: Math.max(timeoutMilliseconds, 30000),
    })

    const page = await electronApp.firstWindow()
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(`console.error: ${message.text()}`)
      }
    })
    page.on('pageerror', error => {
      consoleErrors.push(`pageerror: ${error.stack || error.message}`)
    })

    await page.waitForLoadState('domcontentloaded')

    const welcomeSteps = await completeWelcomeFlow(page, timeoutMilliseconds)
    await page
      .locator('#desktop-app-contents')
      .waitFor({ state: 'visible', timeout: timeoutMilliseconds })

    if (options.size) {
      await setWindowContentSize(electronApp, options.size)
      await page.waitForTimeout(400)
    }

    let seededCount = 0
    if (repositoryPaths.length > 0) {
      seededCount = await seedRepositories(
        page,
        repositoryPaths,
        timeoutMilliseconds
      )

      // The app reads its repositories once at startup, so seeded rows only
      // become real repositories after the renderer reloads.
      await page.reload({ timeout: Math.max(timeoutMilliseconds, 30000) })
      await page.waitForLoadState('domcontentloaded')
      await completeWelcomeFlow(page, 1500)
      await page
        .locator('#desktop-app-contents')
        .waitFor({ state: 'visible', timeout: timeoutMilliseconds })

      await openRepositoryTabs(
        electronApp,
        page,
        repositoryPaths,
        timeoutMilliseconds
      )
    }

    for (const step of options.steps || []) {
      await runStep(page, electronApp, step, timeoutMilliseconds)
    }

    await page.waitForTimeout(
      options.settleMilliseconds === undefined
        ? DefaultSettleMilliseconds
        : options.settleMilliseconds
    )

    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    await page.screenshot({ path: outPath })

    const overflowVisible = await page
      .locator('.repository-tab-overflow')
      .first()
      .isVisible()
      .catch(() => false)

    return {
      outPath,
      mainPath,
      userDataDir,
      repositoryPaths,
      seededCount,
      welcomeSteps,
      tabCount: await readTabCount(page),
      overflowVisible,
      // Playwright's viewportSize() is null for an Electron page, so ask the
      // renderer for the size that was actually captured.
      viewport: await page.evaluate(
        '({ width: window.innerWidth, height: window.innerHeight })'
      ),
      consoleErrors,
    }
  } finally {
    if (electronApp !== null) {
      await electronApp.close().catch(() => {})
    }
    if (options.keepUserData !== true) {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
    fs.rmSync(fakeHomeDir, { recursive: true, force: true })
    if (options.keepRepositories !== true) {
      for (const repositoryPath of createdRepositoryPaths) {
        fs.rmSync(repositoryPath, { recursive: true, force: true })
      }
    }
  }
}

async function main() {
  const options = parseCaptureArguments(process.argv.slice(2))

  if (options.stepsFile !== null) {
    const raw = JSON.parse(fs.readFileSync(options.stepsFile, 'utf8'))
    if (!Array.isArray(raw)) {
      throw new Error(`${options.stepsFile} must contain an array of steps`)
    }
    options.steps.push(...raw.map(parseStep))
  }

  const report = await captureApp(options)

  if (options.reportPath !== null) {
    fs.writeFileSync(
      path.resolve(options.reportPath),
      `${JSON.stringify(report, null, 2)}\n`
    )
  }

  const size =
    report.viewport === null
      ? 'unknown'
      : `${report.viewport.width}x${report.viewport.height}`
  /* eslint-disable no-console */
  console.log(
    `CAPTURE_OK ${report.outPath} ${size} tabs=${report.tabCount} overflow=${report.overflowVisible}`
  )
  console.log(`CAPTURE_CONSOLE_ERRORS ${report.consoleErrors.length}`)
  for (const error of report.consoleErrors) {
    console.log(`CAPTURE_CONSOLE ${error}`)
  }
  /* eslint-enable no-console */

  if (options.strictConsole && report.consoleErrors.length > 0) {
    process.exitCode = 2
  }
}

module.exports = {
  captureApp,
  createCaptureRepositories,
  parseCaptureArguments,
  parseSize,
  parseStep,
  TabCountExpression,
  WelcomeFlowSteps,
}

if (require.main === module) {
  main().catch(err => {
    // eslint-disable-next-line no-console
    console.error('CAPTURE_FAIL', err && err.stack ? err.stack : err)
    process.exit(1)
  })
}
