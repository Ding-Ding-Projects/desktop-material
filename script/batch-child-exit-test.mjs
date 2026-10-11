import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'

it('stops root build and installer entrypoints on negative preparation exits', {
  skip: process.platform !== 'win32' ? 'Requires cmd.exe' : false,
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-material-child-exit-'))
  try {
    mkdirSync(join(root, 'script'))
    writeFileSync(join(root, 'download-dependencies.bat'), '@exit /b -1\r\n')
    writeFileSync(join(root, 'script', 'build-windows.ps1'),
      'Set-Content -LiteralPath (Join-Path $PSScriptRoot "unexpected.txt") -Value "ran"\nexit 0\n')
    for (const name of ['build.bat', 'build-installer.bat']) {
      const source = readFileSync(name, 'utf8')
      writeFileSync(join(root, name), source)
      const run = () => spawnSync('cmd.exe', ['/d', '/c', name, '/s'], {
        cwd: root, encoding: 'utf8', timeout: 30000,
      })
      const fixed = run()
      assert.ifError(fixed.error)
      assert.equal(fixed.status, 4294967295)
      assert.equal(existsSync(join(root, 'script', 'unexpected.txt')), false)

      // Negative control: the previous positive-only check lets -1 through.
      writeFileSync(join(root, name), source.replace(
        'if not "%ERRORLEVEL%"=="0" exit /b %ERRORLEVEL%',
        'if errorlevel 1 exit /b %ERRORLEVEL%'))
      const broken = run()
      assert.ifError(broken.error)
      assert.equal(broken.status, 0)
      assert.equal(existsSync(join(root, 'script', 'unexpected.txt')), true)
      rmSync(join(root, 'script', 'unexpected.txt'))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
