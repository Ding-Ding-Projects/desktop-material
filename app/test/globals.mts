import 'fake-indexeddb/auto'
import 'global-jsdom/register'
import { mock } from 'node:test'
import { createRequire } from 'node:module'
import Module from 'node:module'

// The runner passes `--conditions=import` so CJS resolution can reach ESM-only
// packages that declare no "require" fallback. tslib pays for that: its
// "import" condition points at `modules/index.js`, an ESM wrapper that does
// `import tslib from '../tslib.js'` and then destructures `tslib.default`.
// Loaded as CJS through tsx that default is undefined, so the very first
// destructure throws `Cannot destructure property '__extends'` and takes the
// whole test file with it — which is why every UI test that pulls in a
// helper-emitting module has been failing since tslib 2.8.1 arrived.
//
// Resolve the bare specifier to tslib's CJS build instead. This touches tslib
// alone; every other package keeps the `import` condition it needs.
const requireFromHere = createRequire(import.meta.url)
const tslibCjs = (() => {
  try {
    return requireFromHere.resolve('tslib/tslib.js')
  } catch {
    return null
  }
})()

if (tslibCjs !== null) {
  const resolveFilename = Module._resolveFilename
  Module._resolveFilename = function (request, ...rest) {
    const resolved = resolveFilename.call(this, request, ...rest)
    // Only rescue the ESM wrapper. Matching on the bare specifier alone would
    // hand every caller the top-level copy and silently shadow a nested one —
    // tsutils vendors tslib 1.14.1 beside the app's 2.8.1, and swapping those
    // changes what the emitted helpers do with no error to read. Redirect the
    // exact file that cannot be loaded as CJS, and leave every other
    // resolution, nested copies included, exactly where Node put it.
    const normalized = resolved.split('\\').join('/')
    if (request === 'tslib' && normalized.endsWith('/tslib/modules/index.js')) {
      return tslibCjs
    }
    return resolved
  }
}

// Node 26 no longer mirrors jsdom's Storage globals onto globalThis. Several
// application modules read localStorage during evaluation, so expose the jsdom
// instance before any test modules are loaded.
if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: window.localStorage,
  })
}

// These constants are defined by Webpack at build time, but since tests aren't
// built with Webpack we need to make sure these exist at runtime.
const packageInfo = await import('../package.json')
const { AppDisplayName } = await import('../app-info')

Object.assign(globalThis, {
  __DEV__: false,
  __TEST__: true,
  __DEV_SECRETS__: false,
  __PROCESS_KIND__: 'ui',
  // Mirror production: `__APP_NAME__` is the user-visible display name
  // (`Desktop Material`), NOT the on-disk `productName` (`GitHub Desktop`).
  __APP_NAME__: AppDisplayName,
  __APP_VERSION__: packageInfo.version,
  __RELEASE_CHANNEL__: 'development',
  __UPDATES_URL__: '',
  __SHA__: 'test',
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __LINUX__: process.platform === 'linux',
  log: {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  },

  // The following types are part of the WebWorker support in Node.js and are a
  // common source of hangs in tests due to libraries creating them but not
  // properly cleaning them up. See for example
  // https://github.com/facebook/react/issues/20756, and
  // https://github.com/dexie/Dexie.js/pull/1577.
  //
  // We've upgraded Dexie already but react-dom is a bigger beast and we don't
  // need any of them to run our tests so we just delete them here. In fact,
  // this is exactly what the react-16-node-hanging-test-fix patch does, see
  // https://www.npmjs.com/package/react-16-node-hanging-test-fix?activeTab=code
  MessageChannel: undefined,
  MessagePort: undefined,
  BroadcastChannel: undefined,
})

mock.module('electron', {
  namedExports: {
    clipboard: { writeText: () => {} },
    shell: {},
    ipcRenderer: {
      on: mock.fn(x => {}),
      // `send` is fire-and-forget in the real renderer, so a no-op is a
      // faithful stub. Without it a component that merely announces something
      // on mount takes the whole render down with a TypeError, which looks
      // like a bug in the component rather than a gap in this mock.
      send: mock.fn(() => {}),
      removeListener: mock.fn(() => {}),
      // Real `invoke` always returns a promise, so the stub rejects rather than
      // throwing synchronously: a component that probes the main process on
      // mount must exercise its own error path here, not crash the render.
      // A test that needs a specific reply mocks the module itself.
      invoke: mock.fn(async () =>
        Promise.reject(
          new Error('electron.ipcRenderer.invoke is not available in tests')
        )
      ),
    },
    ipcMain: {
      on: () => {},
      once: () => {},
      handle: () => {},
      removeListener: () => {},
    },
    // Present so main-process modules that reference these as values (e.g. the
    // notification-automation and release-transfer runners) link under ESM.
    // Tests inject their own transports; touching these throws clearly.
    net: {
      request: () => {
        throw new Error('electron.net.request is not available in tests')
      },
    },
    session: {
      fromPartition: () => ({}),
    },
  },
})
