#!/usr/bin/env node
'use strict'

/** Manage only the disposable P0 provider credential without printing it. */

const fs = require('fs')
const path = require('path')

function fail(message) {
  throw new Error(message)
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

  const keytar = require(keytarPath)
  if (mode === 'set') {
    await keytar.setPassword(ready.credentialService, login, ready.token)
    if (
      (await keytar.getPassword(ready.credentialService, login)) !== ready.token
    ) {
      fail('Credential readback did not match the disposable provider token.')
    }
  } else if (mode === 'delete') {
    await keytar.deletePassword(ready.credentialService, login)
  }
  const present =
    (await keytar.getPassword(ready.credentialService, login)) !== null
  if (mode !== 'set' && present) {
    fail('Disposable credential remained present after cleanup.')
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode,
      service: ready.credentialService,
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
