#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const backupRoot = process.argv[2]

if (!backupRoot) {
  console.error('Usage: node script/verify-frozen-manifests.mjs <backup-root>')
  process.exitCode = 1
} else {
  const manifestPairs = [
    ['root-package.json', 'package.json'],
    ['root-yarn.lock', 'yarn.lock'],
    ['app-package.json', 'app/package.json'],
    ['app-yarn.lock', 'app/yarn.lock'],
  ]
  const changed = []

  for (const [backupName, liveName] of manifestPairs) {
    try {
      const [backup, live] = await Promise.all([
        readFile(join(backupRoot, backupName)),
        readFile(liveName),
      ])
      if (!backup.equals(live)) {
        changed.push(liveName)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`Unable to verify ${liveName}: ${reason}`)
      process.exitCode = 1
    }
  }

  if (changed.length > 0) {
    console.error(
      `Frozen dependency install changed a locked dependency manifest: ${changed.join(
        ', '
      )}`
    )
    process.exitCode = 1
  }
}
