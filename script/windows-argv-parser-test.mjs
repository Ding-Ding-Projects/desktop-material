import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parseCommandLineArgv } from '../vendor/windows-argv-parser/index.ts'

const cases = [
  ['', []],
  ['alpha "beta gamma"', ['alpha', 'beta gamma']],
  ['"alpha beta"gamma', ['alpha beta', 'gamma']],
  ['alpha"beta gamma', ['alpha"beta', 'gamma']],
  [' alpha', ['', 'alpha']],
  [' \t ', ['']],
  ['alpha ""', ['alpha', '']],
  ['alpha """', ['alpha', '"']],
  ['alpha """"', ['alpha', '"']],
  ['alpha """"""', ['alpha', '""']],
  ['alpha a\\"b', ['alpha', 'a"b']],
  ['alpha a\\\\"b c', ['alpha', 'a\\b c']],
  ['alpha a\nb', ['alpha', 'a\nb']],
  ['a\nb c', ['a', 'b', 'c']],
  ['\n香', ['', '香']],
  ['alpha 香港😀 é', ['alpha', '香港😀', 'é']],
  ['alpha a\0 ignored', ['alpha', 'a']],
  ['alpha "unclosed value', ['alpha', 'unclosed value']],
  ['alpha path\\\\', ['alpha', 'path\\\\']],
  ['"C:\\Program Files\\Editor.exe" "C:\\香港 folder\\file.txt"',
    ['C:\\Program Files\\Editor.exe', 'C:\\香港 folder\\file.txt']],
]

describe('in-process Windows argument parsing', () => {
  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => {
      assert.deepEqual(parseCommandLineArgv(input), expected)
    })
  }

  it('matches the native Unicode API over deterministic quoting combinations', {
    skip: process.platform !== 'win32' ? 'Requires the Windows shell32 API' : false,
  }, () => {
    const inputs = cases.map(([input]) => input).filter(input => input.length > 0)
    for (let quotes = 0; quotes <= 8; quotes++) {
      for (let slashes = 0; slashes <= 6; slashes++) {
        for (const prefix of ['', 'alpha ', ' alpha ', '"first value"']) {
          inputs.push(`${prefix}a${'\\'.repeat(slashes)}${'"'.repeat(quotes)}b c`)
        }
      }
    }
    let seed = 10710
    const chars = ['a', ' ', '\t', '"', '\\', '香', '😀', '\n']
    for (let sample = 0; sample < 2000; sample++) {
      let value = ''
      for (let index = 0; index < 1 + sample % 32; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        value += chars[(seed >>> 16) % chars.length]
      }
      inputs.push(value)
    }
    const result = spawnSync('pwsh.exe', [
      '-NoProfile', '-File', 'script/windows-argv-parser-oracle.ps1',
    ], { input: JSON.stringify(inputs), encoding: 'utf8', timeout: 30000,
      maxBuffer: 4 * 1024 * 1024 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    const expected = JSON.parse(result.stdout)
    assert.equal(expected.length, inputs.length)
    for (let index = 0; index < inputs.length; index++) {
      assert.deepEqual(parseCommandLineArgv(inputs[index]), expected[index],
        `Native mismatch for ${JSON.stringify(inputs[index])}`)
    }
  })

  it('retains the integration interface without a native load', () => {
    const source = readFileSync('vendor/windows-argv-parser/index.ts', 'utf8')
    assert.doesNotMatch(source, /require\s*\(|[.]node|process[.]platform/)
    assert.match(readFileSync('app/src/lib/custom-integration.ts', 'utf8'),
      /__WIN32__ \? parseCommandLineArgv\(args\) : stringArgv\(args\)/)
  })
})
