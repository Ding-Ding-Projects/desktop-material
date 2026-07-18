import assert from 'node:assert'
import { before, describe, it } from 'node:test'

let batchSpawnSpec: typeof import('../../../../src/main-process/build-run/runner').batchSpawnSpec

before(async () => {
  batchSpawnSpec = (
    await import('../../../../src/main-process/build-run/runner')
  ).batchSpawnSpec
})

describe('batchSpawnSpec', () => {
  it('wraps a batch shim in a verbatim cmd.exe invocation', () => {
    const spec = batchSpawnSpec(
      'C:\\Program Files\\nodejs\\npm.cmd',
      ['ci'],
      'C:\\Windows\\System32\\cmd.exe'
    )
    assert.ok(!('error' in spec))
    assert.equal(spec.exe, 'C:\\Windows\\System32\\cmd.exe')
    assert.deepEqual(spec.args, [
      '/d',
      '/s',
      '/c',
      '""C:\\Program Files\\nodejs\\npm.cmd" ci"',
    ])
  })

  it('falls back to cmd.exe when ComSpec is not set', () => {
    const spec = batchSpawnSpec('gradlew.bat', ['build'], undefined)
    assert.ok(!('error' in spec))
    assert.equal(spec.exe, 'cmd.exe')
    assert.deepEqual(spec.args, ['/d', '/s', '/c', '""gradlew.bat" build"'])
  })

  it('refuses arguments cmd.exe could reinterpret', () => {
    for (const arg of [
      'a&calc.sln',
      'a|b',
      'a b',
      '"quoted"',
      '%PATH%',
      'a^b',
      'a>b',
      '!var!',
      '',
    ]) {
      const spec = batchSpawnSpec('npm.cmd', ['run', arg], undefined)
      assert.ok('error' in spec, `expected refusal for ${JSON.stringify(arg)}`)
    }
  })

  it('refuses a script path cmd.exe could reinterpret', () => {
    const spec = batchSpawnSpec('C:\\evil%path\\npm.cmd', ['ci'], undefined)
    assert.ok('error' in spec)
  })

  it('accepts plain repo-relative arguments', () => {
    const spec = batchSpawnSpec(
      'mvnw.cmd',
      ['-q', 'package', 'Src/Newtonsoft.Json.slnx'],
      undefined
    )
    assert.ok(!('error' in spec))
  })
})
