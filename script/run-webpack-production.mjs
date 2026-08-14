import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { ensureVendoredDependencies } from './ensure-vendored-dependencies.mjs'

// Before webpack, not after. A vendored `file:` dependency whose TypeScript was
// never compiled fails deep inside the bundle with an error that names a
// missing module or a missing webpack loader, and neither is the actual
// problem. `build:prod:e2e` reaches webpack through this file rather than
// through `compile:prod`, so the npm pre-hook alone would not cover it.
try {
  ensureVendoredDependencies()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

const environment = { ...process.env }
if (!environment.NODE_OPTIONS?.trim()) {
  environment.NODE_OPTIONS = '--max_old_space_size=16384'
}

const webpackPath = resolve('node_modules', 'webpack', 'bin', 'webpack.js')
const nodeArguments = []
if (environment.WEBPACK_DISABLE_CONCURRENT_RECOMPILATION === '1') {
  // Node rejects this V8 flag in NODE_OPTIONS. Pass it as a direct child
  // argument for the self-hosted release runner, where concurrent teardown
  // has produced intermittent V8 code-metadata fatal errors. Node 24 can
  // still crash while collecting optimized executable code after concurrency
  // is off, so release builds disable optimization without disabling the
  // WebAssembly implementation webpack uses for MD4 hashing.
  nodeArguments.push('--no-concurrent-recompilation')
  nodeArguments.push('--no-opt')
}
const result = spawnSync(
  process.execPath,
  [...nodeArguments, webpackPath, '--config', 'app/webpack.production.ts'],
  {
    env: environment,
    stdio: 'inherit',
  }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
