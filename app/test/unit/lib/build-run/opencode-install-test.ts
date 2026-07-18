import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  OPENCODE_MIN,
  planOpencodeInstall,
} from '../../../../src/lib/build-run/opencode-install'

describe('planOpencodeInstall', () => {
  for (const platform of ['win32', 'darwin', 'linux'] as const) {
    it(`installs opencode globally via npm on ${platform}`, () => {
      const plan = planOpencodeInstall(platform)
      assert.equal(plan.exe, 'npm')
      assert.deepEqual(plan.args, ['i', '-g', 'opencode-ai@latest'])
      assert.equal(plan.label, 'npm i -g opencode-ai@latest')
      assert.ok(plan.hint.length > 0)
    })
  }

  it('never resolves to a remote-script install path', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      const plan = planOpencodeInstall(platform)
      // npm is the only auto-runnable path — never curl|bash, scoop or winget.
      assert.notEqual(plan.exe, 'curl')
      assert.notEqual(plan.exe, 'scoop')
      assert.notEqual(plan.exe, 'winget')
      assert.notEqual(plan.exe, 'brew')
    }
  })

  it('exposes an auth hint pointing at opencode auth login', () => {
    assert.match(OPENCODE_MIN.authHint, /opencode auth login/)
    assert.ok(OPENCODE_MIN.installNote.length > 0)
  })
})
