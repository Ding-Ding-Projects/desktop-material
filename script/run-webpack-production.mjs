import { spawnSync } from 'node:child_process'
import { totalmem } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ensureVendoredDependencies } from './ensure-vendored-dependencies.mjs'

export const productionConfigurationNames = Object.freeze([
  'main',
  'renderer',
  'crash',
  'quick-action',
  'cli',
  'highlighter',
])

/** Run each compiler in a fresh process on memory-constrained hosts. */
export function runWebpackProduction({
  environment = process.env,
  physicalMemory = totalmem(),
  spawn = spawnSync,
  ensureDependencies = ensureVendoredDependencies,
  executable = process.execPath,
  reportError = error => console.error(error),
} = {}) {
  // Both compile:prod and build:prod:e2e need compiled local dependencies.
  try {
    ensureDependencies()
  } catch (error) {
    reportError(error.message)
    return 1
  }

  const childEnvironment = { ...environment }
  const serial =
    childEnvironment.DESKTOP_WEBPACK_SERIAL === '1' ||
    physicalMemory <= 12 * 1024 ** 3
  if (!childEnvironment.NODE_OPTIONS?.trim() && !serial) {
    childEnvironment.NODE_OPTIONS = '--max_old_space_size=16384'
  }

  const webpackPath = resolve('node_modules', 'webpack', 'bin', 'webpack.js')
  const nodeArguments = []
  if (serial) {
    // A command-line option overrides inherited singleton NODE_OPTIONS values.
    nodeArguments.push('--max-old-space-size=4096')
  }
  if (childEnvironment.WEBPACK_DISABLE_CONCURRENT_RECOMPILATION === '1') {
    // These V8 flags must be direct Node arguments, not NODE_OPTIONS.
    nodeArguments.push('--no-concurrent-recompilation', '--no-opt')
  }
  const names = serial ? productionConfigurationNames : [undefined]
  for (const name of names) {
    const argumentsForChild = [
      ...nodeArguments,
      webpackPath,
      '--config',
      'app/webpack.production.ts',
      ...(name === undefined ? [] : ['--config-name', name]),
    ]
    const result = spawn(executable, argumentsForChild, {
      env: childEnvironment,
      stdio: 'inherit',
    })
    if (result.error) {
      reportError(result.error)
      return 1
    }
    if (result.status !== 0) return result.status ?? 1
  }
  return 0
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(runWebpackProduction())
}
