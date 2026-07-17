import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IRemediationFlags,
  planRemediation,
} from '../../../../src/lib/build-run/auto-fix'
import { ICommand } from '../../../../src/lib/build-run/types'

const noFlags: IRemediationFlags = {
  hasYarnLock: false,
  hasPnpmLock: false,
  hasVenv: false,
}

const install = (exe: string, args: string[]): ICommand => ({
  exe,
  args,
  label: `${exe} ${args.join(' ')}`,
})

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
      assert.equal(r!.commands.length, 1)
      assert.deepEqual(r!.commands[0].args, ['install', '--legacy-peer-deps'])
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
      assert.equal(r!.commands[0].exe, 'yarn')
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
      assert.equal(r!.commands[0].exe, 'pnpm')
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
      assert.equal(r!.commands[0].exe, 'node')
      assert.equal(r!.commands[0].label, 'delete node_modules')
      assert.notEqual(r!.replacesStage, true)
    })

    it('installs dependencies when a build cannot find a module', () => {
      const r = planRemediation(
        'build',
        'node',
        "Error: Cannot find module 'react'",
        0,
        noFlags,
        [install('yarn', ['install'])]
      )
      assert.ok(r)
      assert.equal(r!.commands[0].exe, 'yarn')
      assert.notEqual(r!.replacesStage, true)
    })

    it('falls back to npm install when the plan has no install stage', () => {
      const r = planRemediation(
        'run',
        'node',
        'ERR_MODULE_NOT_FOUND',
        0,
        noFlags,
        []
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0], {
        exe: 'npm',
        args: ['install'],
        label: 'npm install',
      })
    })

    it('does not treat a missing module during install as missing deps', () => {
      const r = planRemediation(
        'install',
        'node',
        "Cannot find module 'left-pad'",
        0,
        noFlags,
        [install('npm', ['install'])]
      )
      assert.equal(r, null)
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
      assert.deepEqual(r!.commands[0].args, ['-m', 'venv', '.venv'])
    })

    it('creates a venv when none exists yet', () => {
      const r = planRemediation('install', 'python', 'pip failed', 0, noFlags)
      assert.ok(r)
      assert.equal(r!.commands[0].label, 'create .venv')
    })

    it('offers no remediation once a venv already exists', () => {
      const r = planRemediation('install', 'python', 'pip failed', 0, {
        ...noFlags,
        hasVenv: true,
      })
      assert.equal(r, null)
    })

    it('re-runs the install stage on a missing import at run time', () => {
      const installCommands = [
        install('python', ['-m', 'venv', '.venv']),
        install('.venv/bin/pip', ['install', '-r', 'requirements.txt']),
      ]
      const r = planRemediation(
        'run',
        'python',
        "ModuleNotFoundError: No module named 'flask'",
        0,
        { ...noFlags, hasVenv: true },
        installCommands
      )
      assert.ok(r)
      assert.deepEqual(r!.commands, installCommands)
      assert.notEqual(r!.replacesStage, true)
    })
  })

  describe('missing-dependency recovery', () => {
    it('runs go mod tidy on a missing go.sum entry', () => {
      const r = planRemediation(
        'build',
        'go',
        'missing go.sum entry for module github.com/example/dep',
        0,
        noFlags,
        [install('go', ['mod', 'download'])]
      )
      assert.ok(r)
      assert.equal(r!.commands.length, 1)
      assert.deepEqual(r!.commands[0].args, ['mod', 'tidy'])
    })

    it('fetches crates when cargo cannot find one', () => {
      const r = planRemediation(
        'build',
        'rust',
        "error[E0463]: can't find crate for `serde`",
        0,
        noFlags,
        []
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0], {
        exe: 'cargo',
        args: ['fetch'],
        label: 'cargo fetch',
      })
    })

    it('restores NuGet packages on NU1101', () => {
      const restore = [install('dotnet', ['restore', 'App.csproj'])]
      const r = planRemediation(
        'build',
        'dotnet',
        'error NU1101: Unable to find package Contoso.Utils',
        0,
        noFlags,
        restore
      )
      assert.ok(r)
      assert.deepEqual(r!.commands, restore)
    })

    it('retries a Java build after a transient resolution failure', () => {
      const r = planRemediation(
        'build',
        'java',
        'Could not resolve com.example:library:1.0.0',
        0,
        noFlags,
        []
      )
      assert.ok(r)
      // No pre-steps: Gradle/Maven resolve dependencies inside the build.
      assert.equal(r!.commands.length, 0)
    })

    it('runs composer install when vendor/autoload.php is missing', () => {
      const r = planRemediation(
        'run',
        'php',
        "Failed opening required 'vendor/autoload.php'",
        0,
        noFlags,
        []
      )
      assert.ok(r)
      assert.equal(r!.commands[0].exe, 'composer')
    })

    it('runs bundle install on Bundler::GemNotFound', () => {
      const r = planRemediation(
        'run',
        'ruby',
        'Bundler::GemNotFound: Could not find rake-13.0.6 in locally installed gems',
        0,
        noFlags,
        [install('bundle', ['install'])]
      )
      assert.ok(r)
      assert.equal(r!.commands[0].exe, 'bundle')
    })

    it('runs mix deps.get on unchecked dependencies', () => {
      const r = planRemediation(
        'build',
        'elixir',
        'Unchecked dependencies for environment dev',
        0,
        noFlags,
        [install('mix', ['deps.get'])]
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0].args, ['deps.get'])
    })

    it('runs pub get when Dart suggests it', () => {
      const r = planRemediation(
        'run',
        'dart',
        'Try running `dart pub get` to fetch the packages.',
        0,
        noFlags,
        [install('dart', ['pub', 'get'])]
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0].args, ['pub', 'get'])
    })

    it('resolves Swift packages when one is missing', () => {
      const r = planRemediation(
        'build',
        'swift',
        'error: missing package product Algorithms',
        0,
        noFlags,
        []
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0].args, ['package', 'resolve'])
    })

    it('runs sbt update on a ResolveException', () => {
      const r = planRemediation(
        'build',
        'scala',
        'sbt.librarymanagement.ResolveException: Error downloading org.foo:bar_2.13:1.0',
        0,
        noFlags,
        [install('sbt', ['update'])]
      )
      assert.ok(r)
      assert.deepEqual(r!.commands[0].args, ['update'])
    })

    it('never proposes dependency recovery for the install stage itself', () => {
      const r = planRemediation(
        'install',
        'elixir',
        'Unchecked dependencies for environment dev',
        0,
        noFlags,
        [install('mix', ['deps.get'])]
      )
      assert.equal(r, null)
    })
  })

  describe('non-adaptive ecosystems', () => {
    for (const ecosystem of ['zig', 'make', 'cmake', 'haskell'] as const) {
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
