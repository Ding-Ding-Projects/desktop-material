import { describe, it } from 'node:test'
import assert from 'node:assert'
import { planToolchainInstall } from '../../../../src/lib/build-run/toolchain-install'

describe('planToolchainInstall', () => {
  it('returns null for SDKs on Linux (no safe system package manager)', () => {
    assert.equal(planToolchainInstall('node', 'npm', 'linux'), null)
    assert.equal(planToolchainInstall('dotnet', 'dotnet', 'linux'), null)
    assert.equal(planToolchainInstall('go', 'go', 'linux'), null)
  })

  it('returns null for tools with no known install path', () => {
    assert.equal(planToolchainInstall('dart', 'dart', 'win32'), null)
    assert.equal(planToolchainInstall('haskell', 'stack', 'win32'), null)
    assert.equal(planToolchainInstall('swift', 'swift', 'darwin'), null)
  })

  describe('winget-installed tools (Windows)', () => {
    const cases: ReadonlyArray<{
      ecosystem: Parameters<typeof planToolchainInstall>[0]
      exe: string
      id: string
    }> = [
      { ecosystem: 'node', exe: 'npm', id: 'OpenJS.NodeJS' },
      { ecosystem: 'node', exe: 'node', id: 'OpenJS.NodeJS' },
      { ecosystem: 'node', exe: 'bun', id: 'Oven-sh.Bun' },
      { ecosystem: 'python', exe: 'python', id: 'Python.Python.3.12' },
      { ecosystem: 'python', exe: 'python3', id: 'Python.Python.3.12' },
      { ecosystem: 'go', exe: 'go', id: 'GoLang.Go' },
      { ecosystem: 'rust', exe: 'cargo', id: 'Rustlang.Rustup' },
      { ecosystem: 'dotnet', exe: 'dotnet', id: 'Microsoft.DotNet.SDK.8' },
      { ecosystem: 'deno', exe: 'deno', id: 'DenoLand.Deno' },
      {
        ecosystem: 'java',
        exe: 'gradlew.bat',
        id: 'EclipseAdoptium.Temurin.21.JDK',
      },
      {
        ecosystem: 'java',
        exe: 'mvnw.cmd',
        id: 'EclipseAdoptium.Temurin.21.JDK',
      },
      { ecosystem: 'java', exe: 'gradle', id: 'Gradle.Gradle' },
      { ecosystem: 'java', exe: 'mvn', id: 'Apache.Maven' },
      { ecosystem: 'php', exe: 'php', id: 'PHP.PHP.8.3' },
      {
        ecosystem: 'ruby',
        exe: 'ruby',
        id: 'RubyInstallerTeam.RubyWithDevKit.3.2',
      },
      { ecosystem: 'elixir', exe: 'mix', id: 'Elixir.Elixir' },
      { ecosystem: 'scala', exe: 'sbt', id: 'sbt.sbt' },
      { ecosystem: 'swift', exe: 'swift', id: 'Swift.Toolchain' },
      { ecosystem: 'zig', exe: 'zig', id: 'zig.zig' },
      { ecosystem: 'cmake', exe: 'cmake', id: 'Kitware.CMake' },
      { ecosystem: 'make', exe: 'make', id: 'GnuWin32.Make' },
    ]

    for (const { ecosystem, exe, id } of cases) {
      it(`maps ${ecosystem}/${exe} to winget ${id} (elevated)`, () => {
        const plan = planToolchainInstall(ecosystem, exe, 'win32')
        assert.ok(plan)
        assert.equal(plan!.steps.length, 1)
        const [step] = plan!.steps
        assert.equal(step.command.exe, 'winget')
        assert.ok(step.command.args.includes('install'))
        assert.ok(step.command.args.includes(id))
        assert.equal(step.needsElevation, true)
        // Non-interactive: agreements must be pre-accepted so no prompt blocks.
        assert.ok(step.command.args.includes('--accept-package-agreements'))
        assert.ok(step.command.args.includes('--accept-source-agreements'))
      })
    }

    it('normalises path-qualified, extensioned executables', () => {
      const plan = planToolchainInstall(
        'python',
        'C:\\tools\\Python.exe',
        'win32'
      )
      assert.ok(plan)
      assert.ok(plan!.steps[0].command.args.includes('Python.Python.3.12'))
    })

    it('falls back to the ecosystem for an unrecognised executable name', () => {
      const plan = planToolchainInstall('dotnet', 'weird-wrapper', 'win32')
      assert.ok(plan)
      assert.ok(plan!.steps[0].command.args.includes('Microsoft.DotNet.SDK.8'))
    })
  })

  describe('Homebrew-installed tools (macOS)', () => {
    const cases: ReadonlyArray<{
      ecosystem: Parameters<typeof planToolchainInstall>[0]
      exe: string
      formula: string
    }> = [
      { ecosystem: 'node', exe: 'npm', formula: 'node' },
      { ecosystem: 'python', exe: 'python3', formula: 'python' },
      { ecosystem: 'go', exe: 'go', formula: 'go' },
      { ecosystem: 'rust', exe: 'cargo', formula: 'rust' },
      { ecosystem: 'dotnet', exe: 'dotnet', formula: 'dotnet' },
      { ecosystem: 'deno', exe: 'deno', formula: 'deno' },
      { ecosystem: 'java', exe: 'gradle', formula: 'gradle' },
      { ecosystem: 'java', exe: 'mvn', formula: 'maven' },
      { ecosystem: 'php', exe: 'php', formula: 'php' },
      { ecosystem: 'php', exe: 'composer', formula: 'composer' },
      { ecosystem: 'ruby', exe: 'ruby', formula: 'ruby' },
      { ecosystem: 'dart', exe: 'dart', formula: 'dart-lang/dart/dart' },
      { ecosystem: 'elixir', exe: 'mix', formula: 'elixir' },
      { ecosystem: 'scala', exe: 'sbt', formula: 'sbt' },
      { ecosystem: 'haskell', exe: 'stack', formula: 'haskell-stack' },
      { ecosystem: 'zig', exe: 'zig', formula: 'zig' },
      { ecosystem: 'cmake', exe: 'cmake', formula: 'cmake' },
      { ecosystem: 'make', exe: 'make', formula: 'make' },
    ]

    for (const { ecosystem, exe, formula } of cases) {
      it(`maps ${ecosystem}/${exe} to brew ${formula} (no elevation)`, () => {
        const plan = planToolchainInstall(ecosystem, exe, 'darwin')
        assert.ok(plan)
        assert.equal(plan!.steps.length, 1)
        const [step] = plan!.steps
        assert.equal(step.command.exe, 'brew')
        assert.ok(step.command.args.includes('install'))
        assert.ok(step.command.args.includes(formula))
        // Homebrew must never run elevated.
        assert.equal(step.needsElevation, false)
      })
    }

    it('installs the JDK as the temurin cask so wrappers can find it', () => {
      const plan = planToolchainInstall('java', './gradlew', 'darwin')
      assert.ok(plan)
      const [step] = plan!.steps
      assert.deepEqual(step.command.args, ['install', '--cask', 'temurin'])
      assert.equal(step.needsElevation, false)
    })

    it('installs Flutter as a cask', () => {
      const plan = planToolchainInstall('dart', 'flutter', 'darwin')
      assert.ok(plan)
      assert.deepEqual(plan!.steps[0].command.args, [
        'install',
        '--cask',
        'flutter',
      ])
    })
  })

  describe('runtime-provisioned package managers (all platforms)', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      for (const exe of ['yarn', 'pnpm'] as const) {
        it(`provisions ${exe} via corepack enable on ${platform}`, () => {
          const plan = planToolchainInstall('node', exe, platform)
          assert.ok(plan)
          assert.equal(plan!.steps.length, 1)
          const [step] = plan!.steps
          assert.deepEqual(step.command, {
            exe: 'corepack',
            args: ['enable'],
            label: 'corepack enable',
          })
          assert.equal(step.needsElevation, false)
        })
      }
    }

    it('provisions pipenv and poetry via pip without elevation', () => {
      for (const tool of ['pipenv', 'poetry'] as const) {
        const win = planToolchainInstall('python', tool, 'win32')
        assert.ok(win)
        assert.equal(win!.steps[0].command.exe, 'python')
        assert.deepEqual(win!.steps[0].command.args, [
          '-m',
          'pip',
          'install',
          '--user',
          tool,
        ])
        assert.equal(win!.steps[0].needsElevation, false)

        const posix = planToolchainInstall('python', tool, 'linux')
        assert.ok(posix)
        assert.equal(posix!.steps[0].command.exe, 'python3')
      }
    })

    it('provisions Bundler via gem without elevation', () => {
      for (const platform of ['win32', 'darwin', 'linux'] as const) {
        const plan = planToolchainInstall('ruby', 'bundle', platform)
        assert.ok(plan)
        assert.deepEqual(plan!.steps[0].command.args, ['install', 'bundler'])
        assert.equal(plan!.steps[0].command.exe, 'gem')
        assert.equal(plan!.steps[0].needsElevation, false)
      }
    })
  })
})
