import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  productionConfigurationNames,
  runWebpackProduction,
} from './run-webpack-production.mjs'

const GiB = 1024 ** 3
function run(options = {}, results = []) {
  const calls = []
  let prepared = false
  const status = runWebpackProduction({
    environment: {},
    physicalMemory: 8 * GiB,
    ensureDependencies: () => {
      prepared = true
    },
    reportError: () => {},
    spawn: (executable, args, opts) => {
      assert.equal(prepared, true)
      calls.push({ executable, args, opts })
      return results[calls.length - 1] ?? { status: 0 }
    },
    ...options,
  })
  return { status, calls }
}

test('small hosts run all six named configurations sequentially in fresh children', () => {
  const { status, calls } = run()
  assert.equal(status, 0)
  assert.deepEqual(
    calls.map(call => call.args.at(-1)),
    ['main', 'renderer', 'crash', 'quick-action', 'cli', 'highlighter']
  )
  assert.equal(calls.length, 6)
  for (const call of calls) {
    assert.equal(call.executable, process.execPath)
    assert.equal(call.args[0], '--max-old-space-size=4096')
    assert.equal(call.args.at(-2), '--config-name')
    assert.ok(call.args.includes('app/webpack.production.ts'))
    assert.equal(call.opts.stdio, 'inherit')
  }
})

test('the 12 GiB boundary is inclusive and larger hosts keep the normal single invocation', () => {
  assert.equal(run({ physicalMemory: 12 * GiB }).calls.length, 6)
  const { calls } = run({ physicalMemory: 12 * GiB + 1 })
  assert.equal(calls.length, 1)
  assert.ok(!calls[0].args.includes('--config-name'))
  assert.equal(calls[0].opts.env.NODE_OPTIONS, '--max_old_space_size=16384')
})

test('explicit serial mode caps inherited heaps and preserves runtime flags and environment', () => {
  const environment = {
    DESKTOP_WEBPACK_SERIAL: '1',
    NODE_OPTIONS: '--max_old_space_size=16384 --trace-warnings',
    WEBPACK_DISABLE_CONCURRENT_RECOMPILATION: '1',
  }
  const original = { ...environment }
  const { calls } = run({ physicalMemory: 64 * GiB, environment })
  assert.equal(calls.length, 6)
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 3), [
      '--max-old-space-size=4096',
      '--no-concurrent-recompilation',
      '--no-opt',
    ])
    assert.equal(call.opts.env.NODE_OPTIONS, environment.NODE_OPTIONS)
  }
  assert.deepEqual(environment, original)
})

test('normal mode preserves a supplied NODE_OPTIONS and optional direct V8 flags', () => {
  const { calls } = run({
    physicalMemory: 64 * GiB,
    environment: {
      NODE_OPTIONS: '--trace-warnings',
      WEBPACK_DISABLE_CONCURRENT_RECOMPILATION: '1',
    },
  })
  assert.equal(calls[0].opts.env.NODE_OPTIONS, '--trace-warnings')
  assert.deepEqual(calls[0].args.slice(0, 2), [
    '--no-concurrent-recompilation',
    '--no-opt',
  ])
  assert.ok(!calls[0].args.includes('--max-old-space-size=4096'))
})

test('the direct heap cap overrides a larger inherited NODE_OPTIONS heap in real Node', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=4096',
      '-e',
      'console.log(require("node:v8").getHeapStatistics().heap_size_limit)',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=16384' },
    }
  )
  assert.ifError(child.error)
  assert.equal(child.status, 0, child.stderr)
  // V8 reserves a small amount beyond old space for its other heap regions.
  assert.ok(Number(child.stdout.trim()) < 4.2 * GiB)
  assert.ok(Number(child.stdout.trim()) >= 4 * GiB)
})

test('a compiler failure stops later configurations and preserves its exit status', () => {
  const { status, calls } = run({}, [{ status: 0 }, { status: 7 }])
  assert.equal(status, 7)
  assert.equal(calls.length, 2)
})

test('spawn errors and signaled children stop immediately with failure', () => {
  for (const result of [
    { error: new Error('spawn failed'), status: null },
    { signal: 'SIGTERM', status: null },
  ]) {
    const { status, calls } = run({}, [result])
    assert.equal(status, 1)
    assert.equal(calls.length, 1)
  }
})

test('dependency preparation failure prevents every compiler', () => {
  const { status, calls } = run({
    ensureDependencies: () => {
      throw new Error('missing dependency')
    },
  })
  assert.equal(status, 1)
  assert.equal(calls.length, 0)
})

test('production exports name every selectable configuration without changing production options', () => {
  const source = readFileSync(
    new URL('../app/webpack.production.ts', import.meta.url),
    'utf8'
  )
  for (const name of productionConfigurationNames)
    assert.ok(source.includes(`name: '${name}'`))
  assert.match(source, /mode: 'production'/)
  assert.match(source, /devtool: 'source-map'/)
  assert.match(
    source,
    /export default \[\s*mainConfig,\s*rendererConfig,\s*crashConfig,\s*quickActionConfig,\s*cliConfig,\s*highlighterConfig,/
  )
})
