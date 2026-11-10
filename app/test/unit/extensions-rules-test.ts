import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  canRunExtension,
  grantExtensionConsent,
  parseExtensionManifest,
  permissionsNeedingConsent,
  revokeExtensionConsent,
} from '../../src/lib/extensions/manifest'
import {
  buildExtensionRequest,
  parseExtensionResponse,
} from '../../src/lib/extensions/protocol'

const valid = {
  manifestVersion: 1,
  id: 'todo-finder',
  name: 'TODO finder',
  version: '1.0.0',
  description: 'Lists TODO and FIXME notes in tracked files.',
  permissions: ['read-tracked-files', 'changed-files', 'changed-files'],
  command: 'node',
  args: ['main.js'],
}
const manifestOf = (overrides: object = {}) => {
  const result = parseExtensionManifest(
    JSON.stringify({ ...valid, ...overrides })
  )
  assert.ok(result.ok, result.ok ? '' : result.errors.join(' '))
  return result.manifest
}
const context = {
  repositoryPath: 'C:\\repos\\demo',
  branchName: 'main',
  changedFiles: ['a.ts', 'b.ts'],
}

describe('extension manifests', () => {
  it('accepts a complete manifest and tidies its permissions', () => {
    assert.deepEqual(manifestOf().permissions, [
      'changed-files',
      'read-tracked-files',
    ])
  })

  it('reports every problem at once', () => {
    const result = parseExtensionManifest(
      JSON.stringify({
        manifestVersion: 2,
        id: 'Bad Id',
        name: '',
        version: '1.0',
        description: 'x',
        permissions: ['read-everything'],
        command: '..\\..\\evil.exe',
        args: 'no',
      })
    )
    assert.ok(!result.ok)
    assert.equal(result.errors.length, 7)
    assert.ok(result.errors.some(e => e.includes('Unknown permission')))
    assert.ok(result.errors.some(e => e.includes('must not leave')))
  })

  it('refuses text that is not a JSON object', () => {
    for (const text of ['{', '[]', '"x"', 'x'.repeat(70_000)]) {
      assert.equal(parseExtensionManifest(text).ok, false)
    }
  })
})

describe('extension consent', () => {
  it('asks for everything first, then only for what an update adds', () => {
    const first = manifestOf()
    assert.deepEqual(permissionsNeedingConsent(first, {}), [
      'changed-files',
      'read-tracked-files',
    ])
    assert.equal(canRunExtension(first, {}, true), false)

    const consents = grantExtensionConsent(first, {})
    assert.equal(canRunExtension(first, consents, true), true)
    assert.equal(canRunExtension(first, consents, false), false)

    const update = manifestOf({
      version: '1.1.0',
      permissions: ['read-tracked-files', 'changed-files', 'branch-name'],
    })
    assert.deepEqual(permissionsNeedingConsent(update, consents), [
      'branch-name',
    ])
    assert.equal(canRunExtension(update, consents, true), false)
  })

  it('needs consent even when an extension asks for nothing', () => {
    const quiet = manifestOf({ permissions: [] })
    assert.equal(canRunExtension(quiet, {}, true), false)
    const consents = grantExtensionConsent(quiet, {})
    assert.equal(canRunExtension(quiet, consents, true), true)
    assert.deepEqual(revokeExtensionConsent(quiet.id, consents), {})
  })
})

describe('extension protocol', () => {
  it('sends only what the declared permissions cover', () => {
    assert.deepEqual(
      buildExtensionRequest(manifestOf({ permissions: [] }), context),
      {
        protocol: 1,
        action: 'run',
        extension: { id: 'todo-finder', version: '1.0.0' },
      }
    )
    const request = buildExtensionRequest(
      manifestOf({ permissions: ['branch-name', 'changed-files'] }),
      context
    )
    assert.equal(request.repositoryPath, undefined)
    assert.equal(request.branchName, 'main')
    assert.deepEqual(request.changedFiles, ['a.ts', 'b.ts'])
    assert.equal(
      buildExtensionRequest(manifestOf(), context).repositoryPath,
      'C:\\repos\\demo'
    )
  })

  it('accepts a good answer and bounds its size', () => {
    const result = parseExtensionResponse(
      JSON.stringify({
        protocol: 1,
        ok: true,
        title: 'Notes',
        text: 'x'.repeat(30_000),
      })
    )
    assert.ok(result.ok)
    assert.equal(result.title, 'Notes')
    assert.equal(result.text.length, 20_000)
  })

  it('turns every malformed answer into a plain error', () => {
    for (const [output, pattern] of [
      ['not json', /did not answer with JSON/],
      [JSON.stringify({ protocol: 2, ok: true, text: '' }), /protocol 2/],
      [JSON.stringify({ protocol: 1, ok: true }), /needs "ok" and a "text"/],
      [JSON.stringify({ protocol: 1, ok: false, error: 'No Git' }), /^No Git$/],
      ['"' + 'x'.repeat(300_000) + '"', /more than 256 KB/],
    ] as const) {
      const result = parseExtensionResponse(output)
      assert.ok(!result.ok)
      assert.match(result.error, pattern)
    }
  })
})
