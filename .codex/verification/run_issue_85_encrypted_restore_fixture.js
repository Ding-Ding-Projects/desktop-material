#!/usr/bin/env node
'use strict'

/**
 * Node bootstrap for the genuine issue #85 operation fixture.
 *
 * The application sources normally receive these compile-time constants from
 * webpack and their logger from Electron startup. This verifier runs the same
 * production Cheap LFS modules directly in Node, so it supplies inert test
 * values before ts-node loads that graph. No provider request is made.
 *
 *   node .codex/verification/run_issue_85_encrypted_restore_fixture.js \
 *     --run-root <owned-temp-root> --repository-path <disposable-repository> \
 *     --receipt <owned-temp-root>/receipts/operation.json
 */

process.env.TEST_ENV = '1'
process.env.TS_NODE_PROJECT = 'script/tsconfig.json'
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  jsx: 'react',
})

require('fake-indexeddb/auto')
require('global-jsdom/register')
if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: window.localStorage,
  })
}

const Module = require('module')
const silent = () => undefined
Object.assign(globalThis, {
  __DEV__: false,
  __DEV_SECRETS__: false,
  __OAUTH_CLIENT_ID__: '',
  __OAUTH_SECRET__: '',
  __DARWIN__: false,
  __WIN32__: true,
  __LINUX__: false,
  __APP_NAME__: 'Desktop Material verification',
  __APP_VERSION__: 'verification',
  __SHA__: '0000000000000000000000000000000000000000',
  __RELEASE_CHANNEL__: 'test',
  __UPDATES_URL__: '',
  __ERROR_REPORTING_ENDPOINT__: undefined,
  __NON_FATAL_ERROR_REPORTING_ENDPOINT__: undefined,
  __PROCESS_KIND__: 'main',
  log: {
    error: silent,
    warn: silent,
    info: silent,
    debug: silent,
  },
})

const electronStub = {
  clipboard: { writeText: silent },
  shell: {},
  ipcRenderer: {
    on: () => electronStub.ipcRenderer,
    once: () => electronStub.ipcRenderer,
    removeListener: () => electronStub.ipcRenderer,
    invoke: async () => {
      throw new Error('Electron IPC is unavailable in the operation verifier.')
    },
    send: silent,
    sendSync: silent,
  },
  ipcMain: {
    on: silent,
    once: silent,
    handle: silent,
    removeListener: silent,
  },
  net: {
    request: () => {
      throw new Error(
        'Electron networking is unavailable in the operation verifier.'
      )
    },
  },
  session: { fromPartition: () => ({}) },
}
const loadModule = Module._load
Module._load = function (request, parent, isMain) {
  return request === 'electron'
    ? electronStub
    : loadModule.call(this, request, parent, isMain)
}

require('ts-node/register/transpile-only')

const { main } = require('./prepare_issue_85_encrypted_restore_fixture.ts')

main().catch(error => {
  const detail =
    error instanceof Error
      ? error.stack ?? error.message
      : String(
          error ?? 'Unknown genuine Cheap LFS restore fixture bootstrap error.'
        )
  process.stderr.write(`${detail}\n`)
  process.exit(1)
})
