import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  isDemoModeEnabled,
  redactForDemo,
  redactHomePaths,
  redactPath,
  RedactedPrefix,
} from '../../src/lib/demo-mode'

describe('demo mode', () => {
  it('is off unless explicitly asked for', () => {
    assert.equal(isDemoModeEnabled([], {}), false)
    assert.equal(isDemoModeEnabled(['electron', 'out/main.js'], {}), false)
    // A build channel or a hostname must never imply it.
    assert.equal(
      isDemoModeEnabled([], { RELEASE_CHANNEL: 'development' }),
      false
    )
    assert.equal(
      isDemoModeEnabled([], { DESKTOP_MATERIAL_DEMO_MODE: '0' }),
      false
    )
    assert.equal(
      isDemoModeEnabled([], { DESKTOP_MATERIAL_DEMO_MODE: 'no' }),
      false
    )
  })

  it('turns on from the command line or the environment', () => {
    assert.equal(isDemoModeEnabled(['electron', '--demo-mode'], {}), true)
    assert.equal(
      isDemoModeEnabled([], { DESKTOP_MATERIAL_DEMO_MODE: '1' }),
      true
    )
    assert.equal(
      isDemoModeEnabled([], { DESKTOP_MATERIAL_DEMO_MODE: 'true' }),
      true
    )
  })

  it('keeps the part of a path that explains it, drops the identity', () => {
    // The tail is what makes a screenshot legible; the user name is not.
    assert.equal(
      redactPath('C:\\Users\\ada\\AppData\\Local\\Temp\\run\\repo'),
      RedactedPrefix + '\\Temp\\run\\repo'
    )
    assert.equal(
      redactPath('/home/ada/projects/desktop-material'),
      RedactedPrefix + '/projects/desktop-material'
    )
    assert.equal(
      redactPath('/Users/ada/Documents/code'),
      RedactedPrefix + '/Documents/code'
    )
  })

  it('never leaves a user name or drive letter behind', () => {
    const cases = [
      'C:\\Users\\ada\\AppData\\Local\\Temp\\x',
      'D:/Users/ada/Documents/y',
      '/home/ada/z',
      '/Users/ada/w',
    ]
    for (const value of cases) {
      const redacted = redactPath(value)
      assert.ok(!/\bada\b/.test(redacted), `${value} still names the user`)
      assert.ok(
        !/[a-zA-Z]:/.test(redacted),
        `${value} still has a drive letter`
      )
    }
  })

  it('redacts an absolute path that has no home marker at all', () => {
    // A bare drive path still discloses a location.
    assert.equal(
      redactPath('C:\\builds\\nightly\\out'),
      RedactedPrefix + '\\builds\\nightly\\out'
    )
    assert.equal(redactPath('C:\\'), RedactedPrefix)
  })

  it('leaves a relative path alone, because it discloses nothing', () => {
    assert.equal(
      redactPath('modules/material-widget'),
      'modules/material-widget'
    )
    assert.equal(redactPath('..\\already\\elided'), '..\\already\\elided')
    assert.equal(redactPath(''), '')
  })

  it('is idempotent, so two layers cannot mangle a value', () => {
    const once = redactPath('C:\\Users\\ada\\AppData\\Local\\Temp\\run')
    assert.equal(redactPath(once), once)
    const text = redactHomePaths('path: C:\\Users\\ada\\Temp\\run')
    assert.equal(redactHomePaths(text), text)
  })

  it('redacts paths embedded in prose without eating the prose', () => {
    const out = redactHomePaths(
      'Opened C:\\Users\\ada\\code\\app and then /home/ada/notes.md today.'
    )
    assert.ok(!out.includes('ada'), out)
    assert.ok(out.startsWith('Opened '), out)
    assert.ok(out.endsWith(' today.'), out)
  })

  it('handles the JSON-escaped form Settings history actually renders', () => {
    // This is the exact shape that made the capture harness refuse a frame.
    const json =
      '{"provider":"github","repositoryPath":"C:\\\\Users\\\\ada\\\\AppData\\\\Local\\\\Temp\\\\dm-run\\\\fixture"}'
    const out = redactHomePaths(json)
    assert.ok(!out.includes('ada'), out)
    assert.ok(!out.includes('C:'), out)
    // The surrounding JSON must still parse, so the escaping has to survive.
    const parsed = JSON.parse(out) as {
      readonly provider: string
      readonly repositoryPath: string
    }
    // The unrelated field must survive untouched: redaction targets paths, not
    // whatever else the payload happens to carry.
    assert.equal(parsed.provider, 'github')
    assert.ok(
      parsed.repositoryPath.startsWith(RedactedPrefix),
      parsed.repositoryPath
    )
    assert.ok(parsed.repositoryPath.includes('fixture'), parsed.repositoryPath)
  })

  it('redacts every path in one block, not just the first', () => {
    const out = redactHomePaths(
      'a=C:\\Users\\ada\\one b=C:\\Users\\bob\\two c=/home/cat/three'
    )
    for (const name of ['ada', 'bob', 'cat']) {
      assert.ok(!out.includes(name), `${name} survived: ${out}`)
    }
  })

  it('does nothing at all when demo mode is off', () => {
    const raw = 'C:\\Users\\ada\\AppData\\Local\\Temp\\run'
    assert.equal(redactForDemo(raw, false), raw)
    assert.notEqual(redactForDemo(raw, true), raw)
    assert.ok(!redactForDemo(raw, true).includes('ada'))
  })
})
