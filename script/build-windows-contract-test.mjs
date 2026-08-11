import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const root = process.cwd()

const read = async path =>
  (await readFile(join(root, path), 'utf8')).replaceAll('\r\n', '\n')

describe('one-click Windows build contract', () => {
  it('keeps both batch entrypoints thin and silent-aware', async () => {
    const [build, installer] = await Promise.all([
      read('build.bat'),
      read('build-installer.bat'),
    ])

    for (const [source, mode] of [
      [build, 'Build'],
      [installer, 'Installer'],
    ]) {
      assert.match(source, /script\\build-windows\.ps1/)
      assert.match(source, new RegExp(`-Mode ${mode}`))
      assert.match(source, /\/s/)
      assert.match(source, /--silent/)
      assert.match(source, /if "%SILENT%"=="1"/)
      assert.match(source, /-ExecutionPolicy Bypass/)
      assert.doesNotMatch(source, /yarn (?:install|build|package)/i)
    }
  })

  it('pins and bootstraps the declared toolchain before the frozen build', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /\$PinnedNodeVersion = '24\.15\.0'/)
    assert.match(source, /\$PinnedYarnVersion = '1\.21\.1'/)
    assert.match(source, /OpenJS\.NodeJS/)
    assert.match(source, /https:\/\/nodejs\.org\/dist/)
    assert.match(source, /SHASUMS256\.txt/)
    assert.match(source, /Refresh-ProcessPath/)
    assert.match(source, /Microsoft\.VisualStudio\.2022\.BuildTools/)
    assert.match(
      source,
      /Microsoft\.VisualStudio\.Component\.VC\.Tools\.x86\.x64/
    )

    const install = source.indexOf("'install', '--frozen-lockfile'")
    const build = source.indexOf("'build:prod'")
    const pack = source.indexOf("'package'")
    assert.ok(install > 0, 'frozen install must be present')
    assert.ok(build > install, 'production build must follow installation')
    assert.ok(pack > build, 'packaging must follow the production build')
  })

  it('fails closed on stale, incomplete, or signed artifacts', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /GitHubDesktop\.exe/)
    assert.match(source, /resources\\app\.asar/)
    assert.match(source, /GitHubDesktopSetup-\$TargetArchitecture\.exe/)
    assert.match(source, /GitHubDesktopSetup-\$TargetArchitecture\.msi/)
    assert.match(source, /'RELEASES'/)
    assert.match(
      source,
      /GitHubDesktop-\$releaseVersion-\$TargetArchitecture-full\.nupkg/
    )
    assert.match(source, /Ensure-ManifestPackageAlias/)
    assert.match(source, /verify-releases-manifest\.js/)
    assert.match(source, /\$releases\.FullName, \$DistDirectory/)
    assert.match(source, /Get-AuthenticodeSignature/)
    assert.match(source, /SignatureStatus\]::NotSigned/)
    assert.match(source, /WINDOWS_SIGNING_ENABLED = 'false'/)
    assert.match(source, /CSC_IDENTITY_AUTO_DISCOVERY = 'false'/)
    assert.match(source, /CSC_LINK = ''/)
    assert.match(source, /WIN_CSC_LINK = ''/)
  })

  it('prints reproducible receipts without shipping anything', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /rev-parse HEAD/)
    assert.match(source, /Get-FileHash[^\n]+SHA256/)
    assert.match(source, /Size:/)
    assert.match(source, /SHA256:/)
    assert.match(source, /Read-Host/)
    assert.match(source, /Start-Process/)
    assert.match(source, /\$Mode -eq 'Installer'/)
    assert.match(source, /-not \$IsSilent/)
    assert.doesNotMatch(source, /\bgit\s+push\b/i)
    assert.doesNotMatch(source, /\bgh\s+release\b/i)
    assert.doesNotMatch(source, /\bgit\s+tag\b/i)
  })
})
