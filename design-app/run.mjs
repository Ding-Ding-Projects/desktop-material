#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { catalogReceipt, parseArguments } = require('./catalog.cjs')
const { assertLaunchResult } = require('./launch-result.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

function gitCommonRoot() {
  const result = spawnSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
  )
  if (result.status !== 0) return null
  const common = result.stdout.trim()
  return path.basename(common).toLowerCase() === '.git'
    ? path.dirname(common)
    : null
}

function electronCandidates() {
  const roots = [repoRoot, gitCommonRoot()].filter(Boolean)
  const candidates = []
  if (process.env.DESKTOP_MATERIAL_ELECTRON) {
    candidates.push(path.resolve(process.env.DESKTOP_MATERIAL_ELECTRON))
  }
  for (const root of new Set(roots)) {
    if (process.platform === 'win32') {
      candidates.push(
        path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
      )
    } else if (process.platform === 'darwin') {
      candidates.push(
        path.join(
          root,
          'node_modules',
          'electron',
          'dist',
          'Electron.app',
          'Contents',
          'MacOS',
          'Electron'
        )
      )
    } else {
      candidates.push(
        path.join(root, 'node_modules', 'electron', 'dist', 'electron')
      )
    }
  }
  return [...new Set(candidates)]
}

let options
try {
  options = parseArguments(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(2)
}

if (options.list) {
  process.stdout.write(`${JSON.stringify(catalogReceipt(), null, 2)}\n`)
  process.exit(0)
}

const electron = electronCandidates().find(candidate =>
  fs.existsSync(candidate)
)
if (!electron) {
  process.stderr.write(
    'Electron is unavailable. Install the repository dependencies or set DESKTOP_MATERIAL_ELECTRON to the Electron executable.\n'
  )
  process.exit(1)
}

const result = spawnSync(
  electron,
  [path.join(here, 'main.cjs'), ...process.argv.slice(2)],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: Boolean(options.capture),
  }
)
let exitCode
try {
  exitCode = assertLaunchResult(options, result)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}
process.exit(exitCode)
