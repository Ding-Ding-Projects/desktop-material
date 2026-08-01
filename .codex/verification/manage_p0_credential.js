#!/usr/bin/env node
'use strict'

/** Manage only the disposable P0 provider credential without printing it. */

const fs = require('fs')
const path = require('path')

function fail(message) {
  throw new Error(message)
}

/**
 * The credential service names the app reads, per build flavour.
 *
 * `getKeyForEndpoint` (app/src/lib/auth.ts) prefixes the endpoint with
 * `GitHub Desktop Dev` in a dev build and plain `GitHub` in a production
 * build (`__DEV__`). The provider's ready.json only records the dev-flavoured
 * name, which is how the 2026-07-31 capture run seeded a token a production
 * build could never find (accountCount stayed 0 and the whole gallery run
 * failed closed). Seed and clean both names so either build hydrates.
 */
function credentialServices(ready) {
  const endpoint = ready.credentialService.replace('GitHub Desktop Dev - ', '')
  return [ready.credentialService, `GitHub - ${endpoint}`]
}

async function main() {
  const [mode, readyArgument, keytarArgument, login = 'material-verifier-p0'] =
    process.argv.slice(2)
  if (!['set', 'delete', 'verify-absent'].includes(mode)) {
    fail('Mode must be set, delete, or verify-absent.')
  }
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) {
    fail('Credential login is invalid.')
  }

  const readyPath = path.resolve(readyArgument ?? '')
  const ownedRoot = path.dirname(path.dirname(readyPath))
  if (
    path.basename(path.dirname(ownedRoot)).toLowerCase() !== 'temp' ||
    !path.basename(ownedRoot).startsWith('desktop-material-p0-ui-') ||
    path.basename(readyPath) !== 'ready.json' ||
    path.basename(path.dirname(readyPath)) !== 'provider'
  ) {
    fail(`Ready file is outside an owned P0 run: ${readyPath}`)
  }
  const keytarPath = path.resolve(keytarArgument ?? '')
  if (path.basename(keytarPath).toLowerCase() !== 'keytar.node') {
    fail('The emitted keytar.node path is required.')
  }
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'))
  if (
    typeof ready.credentialService !== 'string' ||
    !ready.credentialService.startsWith(
      'GitHub Desktop Dev - http://localhost:'
    ) ||
    typeof ready.token !== 'string' ||
    ready.token.length < 16
  ) {
    fail('Provider credential metadata is invalid.')
  }

  const services = credentialServices(ready)
  const keytar = require(keytarPath)
  if (mode === 'set') {
    for (const service of services) {
      await keytar.setPassword(service, login, ready.token)
      if ((await keytar.getPassword(service, login)) !== ready.token) {
        fail('Credential readback did not match the disposable provider token.')
      }
    }
  } else if (mode === 'delete') {
    for (const service of services) {
      await keytar.deletePassword(service, login)
    }
  }
  let present = false
  for (const service of services) {
    present = present || (await keytar.getPassword(service, login)) !== null
  }
  if (mode !== 'set' && present) {
    fail('Disposable credential remained present after cleanup.')
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode,
      services,
      login,
      present,
    })}\n`
  )
}

main().catch(error => {
  process.stderr.write(
    `${error?.stack || error?.message || String(error ?? 'Unknown error.')}\n`
  )
  process.exitCode = 1
})
