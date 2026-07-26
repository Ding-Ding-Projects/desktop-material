/* eslint-disable no-sync */

import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  buildShellExtension,
  findMsvcToolchain,
  getMsvcToolchainCoordinates,
  readPortableExecutableMachine,
  validateShellExtensionMachine,
} from './build-shell-extension'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function fakePortableExecutable(machine: number): Buffer {
  const image = Buffer.alloc(0x100)
  image.writeUInt16LE(0x5a4d, 0)
  image.writeUInt32LE(0x80, 0x3c)
  image.writeUInt32LE(0x00004550, 0x80)
  image.writeUInt16LE(machine, 0x84)
  return image
}

describe('shell extension native build contract', () => {
  it('maps x64-hosted target lanes to the matching MSVC tools', () => {
    assert.deepEqual(getMsvcToolchainCoordinates('x64', 'x64'), {
      hostDirectory: 'Hostx64',
      targetDirectory: 'x64',
      vcVarsArgument: 'x64',
      linkerMachine: 'X64',
      peMachine: 0x8664,
    })
    assert.deepEqual(getMsvcToolchainCoordinates('arm64', 'x64'), {
      hostDirectory: 'Hostx64',
      targetDirectory: 'arm64',
      vcVarsArgument: 'x64_arm64',
      linkerMachine: 'ARM64',
      peMachine: 0xaa64,
    })
  })

  it(
    'discovers an ARM64 cross-compiler and vcvarsall from one install',
    { skip: process.platform !== 'win32' },
    () => {
      const root = mkdtempSync(join(tmpdir(), 'dm-shell-toolchain-'))
      roots.push(root)
      const install = join(root, '2022', 'BuildTools')
      const vcvars = join(install, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat')
      const compiler = join(
        install,
        'VC',
        'Tools',
        'MSVC',
        '14.42.0',
        'bin',
        'Hostx64',
        'arm64',
        'cl.exe'
      )
      mkdirSync(join(vcvars, '..'), { recursive: true })
      mkdirSync(join(compiler, '..'), { recursive: true })
      writeFileSync(vcvars, '')
      writeFileSync(compiler, '')

      const result = findMsvcToolchain('arm64', root, 'x64')
      assert.notEqual(result, null)
      assert.equal(result!.compilerPath, compiler)
      assert.equal(result!.vcVarsAllPath, vcvars)
      assert.equal(result!.coordinates.vcVarsArgument, 'x64_arm64')
    }
  )

  it('reads and validates x64 and ARM64 PE machine fields', () => {
    const x64 = fakePortableExecutable(0x8664)
    const arm64 = fakePortableExecutable(0xaa64)

    assert.equal(readPortableExecutableMachine(x64), 0x8664)
    assert.equal(readPortableExecutableMachine(arm64), 0xaa64)
    assert.doesNotThrow(() => validateShellExtensionMachine(x64, 'x64'))
    assert.doesNotThrow(() => validateShellExtensionMachine(arm64, 'arm64'))
    assert.throws(
      () => validateShellExtensionMachine(x64, 'arm64'),
      /expected 0xaa64 for arm64/
    )
  })

  it('rejects a file without a valid PE header', () => {
    assert.throws(
      () => readPortableExecutableMachine(Buffer.from('not a dll')),
      /valid MZ executable/
    )
  })

  it(
    'removes stale generated output before a missing-toolchain return',
    { skip: process.platform !== 'win32' },
    () => {
      const root = mkdtempSync(join(tmpdir(), 'dm-shell-stale-output-'))
      roots.push(root)
      const staleDirectory = join(root, 'shell-extension')
      mkdirSync(staleDirectory, { recursive: true })
      writeFileSync(join(staleDirectory, 'stale-x64.dll'), 'stale')

      const result = buildShellExtension(root, {
        architecture: 'arm64',
        visualStudioRoot: join(root, 'missing-visual-studio'),
      })

      assert.equal(result.built, false)
      assert.match(result.reason ?? '', /no Visual Studio C\+\+ arm64/)
      assert.equal(existsSync(staleDirectory), false)
    }
  )

  it(
    'loads the native command from shell-extension and resolves the root exe',
    { skip: process.platform !== 'win32' },
    t => {
      const toolchain = findMsvcToolchain('x64')
      if (toolchain === null) {
        t.skip('Visual Studio C++ x64 tools are not installed')
        return
      }

      const root = mkdtempSync(join(tmpdir(), 'dm-shell-layout-contract-'))
      roots.push(root)
      const externalRoot = join(root, 'external-root')
      const build = buildShellExtension(externalRoot, {
        architecture: 'x64',
      })
      assert.equal(build.built, true, build.reason)

      const expectedExe = join(externalRoot, 'GitHubDesktop.exe')
      writeFileSync(expectedExe, '')
      const dll = join(
        externalRoot,
        'shell-extension',
        'DesktopMaterialShellExtension.dll'
      )
      const contractSource = join(
        __dirname,
        '..',
        'shell-extension',
        'test',
        'package-layout-contract.cpp'
      )
      const contractExe = join(root, 'package-layout-contract.exe')
      const compileScript = join(root, 'compile-layout-contract.bat')
      writeFileSync(
        compileScript,
        [
          '@echo off',
          `call "${toolchain.vcVarsAllPath}" ${toolchain.coordinates.vcVarsArgument} || exit /b 1`,
          `"${toolchain.compilerPath}" /nologo /std:c++17 /EHsc "${contractSource}" /Fe:"${contractExe}" /link ole32.lib`,
          'exit /b %ERRORLEVEL%',
        ].join('\r\n')
      )

      execFileSync('cmd.exe', ['/d', '/c', compileScript], {
        cwd: root,
        stdio: 'pipe',
        windowsHide: true,
      })
      execFileSync(contractExe, [dll, expectedExe], {
        cwd: root,
        stdio: 'pipe',
        windowsHide: true,
      })
    }
  )

  it(
    'cross-compiles an ARM64 DLL with a matching manifest identity',
    { skip: process.platform !== 'win32' },
    t => {
      if (findMsvcToolchain('arm64') === null) {
        t.skip('Visual Studio C++ ARM64 cross-tools are not installed')
        return
      }

      const root = mkdtempSync(join(tmpdir(), 'dm-shell-arm64-contract-'))
      roots.push(root)
      const result = buildShellExtension(root, { architecture: 'arm64' })
      assert.equal(result.built, true, result.reason)

      const packageRoot = join(root, 'shell-extension')
      const dll = readFileSync(
        join(packageRoot, 'DesktopMaterialShellExtension.dll')
      )
      const manifest = readFileSync(
        join(packageRoot, 'AppxManifest.xml'),
        'utf8'
      )
      assert.equal(readPortableExecutableMachine(dll), 0xaa64)
      assert.match(manifest, /ProcessorArchitecture="arm64"/)
    }
  )
})
