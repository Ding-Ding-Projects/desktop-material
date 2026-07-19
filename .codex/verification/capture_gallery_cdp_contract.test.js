'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const driverPath = path.join(__dirname, 'capture_gallery_cdp.js')
const source = fs.readFileSync(driverPath, 'utf8')

test('every requested scene resets before its runner executes', () => {
  const loopStart = source.indexOf('for (const name of names)')
  const loopEnd = source.indexOf('client.close()', loopStart)
  assert.notEqual(loopStart, -1)
  assert.notEqual(loopEnd, -1)

  const sceneLoop = source.slice(loopStart, loopEnd)
  const resetIndex = sceneLoop.indexOf('await resetSceneState(name)')
  const runIndex = sceneLoop.indexOf('await run()')
  assert.notEqual(resetIndex, -1)
  assert.notEqual(runIndex, -1)
  assert.ok(resetIndex < runIndex)
})

test('reset covers every transient surface that contaminated captures', () => {
  for (const contract of [
    "'dialog[open]'",
    '\'[role="dialog"]\'',
    "'#foldout-container'",
    "'#app-menu-foldout'",
    "'.material-context-menu-backdrop'",
    "'.error-notice-stack .error-notice'",
    "'.error-notice-dismiss'",
    '\'.tooltip, [role="tooltip"]\'',
    "'Input.dispatchMouseEvent'",
    "await menuEvent('zoom-reset')",
    "await menuEvent('show-changes')",
    'await assertNoSceneLeaks(`scene ${name}`)',
  ]) {
    assert.ok(source.includes(contract), `missing reset contract: ${contract}`)
  }
})

test('contaminated gallery scenes always restore the Changes base', () => {
  const match = source.match(
    /const StatePreservingScenes = new Set\(\[([\s\S]*?)\]\)/
  )
  assert.notEqual(match, null)
  const statePreservingScenes = match[1]

  for (const scene of [
    'repository-tools',
    'repository-tools-scroll',
    'branch-rules',
    'add-submodule',
    'settings-appearance',
  ]) {
    assert.ok(
      source.includes(`scene('${scene}'`),
      `gallery scene is missing: ${scene}`
    )
    assert.ok(
      !statePreservingScenes.includes(`'${scene}'`),
      `gallery scene may bypass the Changes reset: ${scene}`
    )
  }
})

test('reset rejects unknown base surfaces and residual leakage', () => {
  assert.ok(source.includes('No known base surface is available before'))
  assert.ok(source.includes('did not reset to a known base surface'))
  assert.ok(source.includes('Scene reset left visible UI leakage before'))
})

test('capture-only tooltip suppression is removed before disconnect', () => {
  const cleanup = source.indexOf(
    "document.getElementById('gallery-tooltip-suppressor')?.remove()"
  )
  const close = source.indexOf('client.close()', cleanup)
  assert.notEqual(cleanup, -1)
  assert.notEqual(close, -1)
  assert.ok(cleanup < close)
})
