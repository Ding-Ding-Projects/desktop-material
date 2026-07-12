import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IRemediationFlags,
  planRemediation,
} from '../../../../src/lib/build-run/auto-fix'

const noFlags: IRemediationFlags = {
  hasYarnLock: false,
  hasPnpmLock: false,
  hasVenv: false,
}

describe('planRemediation', () => {
  it('returns null once the attempt budget is exhausted', () => {
    const result = planRemediation('install', 'node', 'ERESOLVE', 2, noFlags)
    assert.equal(result, null)
  })

  describe('node', () => {
    it('relaxes peer deps on an ERESOLVE conflict', () => {
      const r = planRemediation(
        'install',
        'node',
        'npm ERR! ERESOLVE unable to resolve dependency tree',
        0,
        noFlags
      )
      assert.ok(r)
      assert.deepEqual(r!.command.args, ['install', '--legacy-peer-deps'])
      assert.equal(r!.replacesStage, true)
    })

    it('switches to yarn when npm ci fails and a yarn.lock exists', () => {
      const r = planRemediation(
        'install',
        'node',
        'npm ci can only install with an up to date package-lock.json',
        0,
        { ...noFlags, hasYarnLock: true }
      )
      assert.ok(r)
      assert.equal(r!.command.exe, 'yarn')
      assert.equal(r!.replacesStage, true)
    })

    it('switches to pnpm when npm ci fails and a pnpm-lock.yaml exists', () => {
      const r = planRemediation(
        'install',
        'node',
        'npm ci requires an existing package-lock.json lockfile',
        0,
        { ...noFlags, hasPnpmLock: true }
      )
      assert.ok(r)
      assert.equal(r!.command.exe, 'pnpm')
    })

    it('does not switch managers without an alternative lockfile', () => {
      const r = planRemediation(
        'install',
        'node',
        'npm ci can only install with an up to date package-lock.json',
        0,
        noFlags
      )
      assert.equal(r, null)
    })

    it('deletes a locked node_modules as a pre-step', () => {
      const r = planRemediation(
        'install',
        'node',
        'npm ERR! EPERM: operation not permitted, rmdir node_modules',
        1,
        noFlags
      )
      assert.ok(r)
      assert.equal(r!.command.exe, 'node')
      assert.equal(r!.command.label, 'delete node_modules')
      assert.notEqual(r!.replacesStage, true)
    })

    it('returns null for unrecognized node output', () => {
      const r = planRemediation('build', 'node', 'some other error', 0, noFlags)
      assert.equal(r, null)
    })
  })

  describe('python', () => {
    it('creates a venv on an externally-managed-environment error', () => {
      const r = planRemediation(
        'install',
        'python',
        'error: externally-managed-environment',
        0,
        noFlags
      )
      assert.ok(r)
      assert.deepEqual(r!.command.args, ['-m', 'venv', '.venv'])
    })

    it('creates a venv when none exists yet', () => {
      const r = planRemediation('install', 'python', 'pip failed', 0, noFlags)
      assert.ok(r)
      assert.equal(r!.command.label, 'create .venv')
    })

    it('offers no remediation once a venv already exists', () => {
      const r = planRemediation('install', 'python', 'pip failed', 0, {
        ...noFlags,
        hasVenv: true,
      })
      assert.equal(r, null)
    })
  })

  describe('non-adaptive ecosystems', () => {
    for (const ecosystem of [
      'rust',
      'go',
      'dotnet',
      'java',
      'make',
      'cmake',
    ] as const) {
      it(`returns null for ${ecosystem}`, () => {
        const r = planRemediation(
          'build',
          ecosystem,
          'command not found',
          0,
          noFlags
        )
        assert.equal(r, null)
      })
    }
  })
})
