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
    assert.ok(install > 0, 'frozen install must be present')
    assert.ok(build > install, 'production build must follow installation')
  })

  it('keeps tool status off the success stream used for the Node path', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /function Invoke-StatusCommand/)
    assert.match(
      source,
      /& \$FilePath @ArgumentList 2>&1 \| ForEach-Object \{ Write-Host \$_ \}/
    )
    assert.doesNotMatch(source, /& \$winget\.Source install/)
    assert.match(source, /\$wingetExit = Invoke-StatusCommand/)
    assert.match(source, /\$installExit = Invoke-StatusCommand/)
    assert.match(source, /\$nodeResult = @\(Resolve-PinnedNode\)/)
    assert.match(source, /\$nodeResult\.Count -ne 1/)
    assert.match(source, /\[string\]\$node = \$nodeResult\[0\]/)
  })

  it('rebuilds the exact native printenvz prerequisite before production compilation', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /function Ensure-PrintenvzExecutable/)
    assert.match(
      source,
      /node_modules\\printenvz[\s\S]*?build\\Release\\printenvz\.exe/
    )
    assert.match(source, /Join-Path \$packageRoot 'build\.mjs'/)
    assert.match(
      source,
      /Invoke-Checked -FilePath \$NodePath -ArgumentList @\(\$buildScript, '--rebuild'\)/
    )
    assert.match(source, /\$executable\.Length -gt 0/)
    assert.match(source, /\$executable\.Length -le 0/)
    assert.match(source, /rebuild completed without creating/)

    const install = source.lastIndexOf("'install', '--frozen-lockfile'")
    const ensure = source.lastIndexOf(
      'Ensure-PrintenvzExecutable -NodePath $node'
    )
    const build = source.lastIndexOf("'build:prod'")
    assert.ok(install > 0, 'frozen install must be present')
    assert.ok(ensure > install, 'printenvz must be ensured after install')
    assert.ok(build > ensure, 'printenvz must be ensured before build:prod')
  })

  it('reuses only a lockfile-current warm tree with verified local native outputs', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /function Test-FrozenDependencyIntegrity/)
    assert.match(source, /'check',[\s\S]*?'--integrity'/)
    assert.match(source, /function Test-CurrentNativeOutputs/)
    assert.match(source, /\$output\.Length -le 0/)
    assert.match(source, /FileAttributes\]::ReparsePoint/)
    assert.match(
      source,
      /\$output\.LastWriteTimeUtc -lt \$latestSource\.LastWriteTimeUtc/
    )
    assert.match(source, /function Test-WarmNativeDependencyCache/)
    for (const artifact of [
      'windows-argv-parser\\build\\index.js',
      'windows-argv-parser\\build\\Release\\windows-argv-parser.node',
      'desktop-notifications\\dist\\index.js',
      'desktop-notifications\\build\\Release\\desktop-notifications.node',
      'desktop-trampoline\\dist\\index.js',
      'desktop-askpass-trampoline.exe',
      'desktop-credential-helper-trampoline.exe',
      'printenvz\\build\\Release\\printenvz.exe',
    ]) {
      assert.ok(source.includes(artifact), `missing native output ${artifact}`)
    }
    assert.match(source, /function Test-WindowsArgvParserRuntime/)
    assert.match(source, /function Test-WindowsArgvParserInputsMatch/)
    for (const input of [
      'binding.gyp',
      'index.ts',
      'main.cc',
      'package.json',
      'tsconfig.json',
    ]) {
      assert.ok(source.includes(`'${input}'`), `missing hashed input ${input}`)
    }
    assert.match(source, /Get-FileHash[^\n]+SHA256/)
    assert.match(source, /parseCommandLineArgv/)
    assert.match(source, /Reusing the verified frozen dependency tree/)

    const integrity = source.lastIndexOf(
      'Test-FrozenDependencyIntegrity -NodePath $node'
    )
    const reuse = source.lastIndexOf('if ($reuseWarmDependencies) {')
    const install = source.lastIndexOf("'install', '--frozen-lockfile'")
    const requiredOutputs = source.lastIndexOf(
      'if (-not (Test-WarmNativeDependencyCache -NodePath $node))'
    )
    assert.ok(integrity > 0, 'warm reuse must start with lockfile integrity')
    assert.ok(reuse > integrity, 'reuse decision must follow integrity')
    assert.ok(install > reuse, 'fresh install must remain in the fallback path')
    assert.ok(
      requiredOutputs > install,
      'every path must verify native outputs after install or reuse'
    )
  })

  it('restores only a current prior argv-parser build cache and keeps fresh native failures fatal', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(
      source,
      /function Restore-WindowsArgvParserFromBuildCache[\s\S]*?out\\windows-argv-parser\.node/
    )
    assert.match(
      source,
      /Test-CurrentNativeOutputs[\s\S]*?-OutputPaths @\(\$cachedAddon\)/
    )
    assert.match(source, /node_modules\\typescript\\bin\\tsc/)
    assert.match(source, /Copy-Item -LiteralPath \$cachedAddon/)
    assert.match(
      source,
      /return Test-WindowsArgvParserRuntime -NodePath \$NodePath/
    )

    const fallback = source.slice(
      source.lastIndexOf('if ($reuseWarmDependencies) {'),
      source.lastIndexOf(
        'if (-not (Test-WarmNativeDependencyCache -NodePath $node))'
      )
    )
    assert.match(
      fallback,
      /Invoke-Checked[\s\S]*?Frozen dependency installation/
    )
    assert.doesNotMatch(
      fallback,
      /catch\s*\{/,
      'a real CL.exe or node-gyp failure from a fresh install must propagate'
    )
    assert.match(
      source,
      /throw 'The frozen dependency tree is missing a current, nonempty local native output/
    )
  })

  it('forces dev dependencies before install and restores the process environment', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /\$env:NODE_ENV = 'development'/)
    assert.match(source, /\$env:YARN_PRODUCTION = 'false'/)
    assert.match(source, /\$env:npm_config_production = 'false'/)
    assert.match(source, /'--production=false'/)
    assert.match(source, /\$env:NODE_ENV = 'production'/)
    assert.match(source, /\$originalProcessEnvironment = @\{\}/)
    assert.match(source, /finally \{[\s\S]*?SetEnvironmentVariable\(/)

    const development = source.lastIndexOf("$env:NODE_ENV = 'development'")
    const install = source.lastIndexOf("'install', '--frozen-lockfile'")
    const printenvz = source.lastIndexOf(
      'Ensure-PrintenvzExecutable -NodePath $node'
    )
    const production = source.lastIndexOf("$env:NODE_ENV = 'production'")
    const build = source.lastIndexOf("'build:prod'")
    assert.ok(development > 0, 'dependency mode must be set')
    assert.ok(install > development, 'install must run in development mode')
    assert.ok(printenvz > install, 'printenvz must follow dependency install')
    assert.ok(production > printenvz, 'production mode must follow printenvz')
    assert.ok(build > production, 'build:prod must run in production mode')
  })

  it('passes the detected Visual Studio path only to the direct native rebuild', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /function Assert-VsDeveloperCommands/)
    assert.match(source, /Common7\\Tools\\VsDevCmd\.bat/)
    assert.match(source, /VC\\Auxiliary\\Build\\vcvarsall\.bat/)
    assert.match(source, /Assert-VsDeveloperCommands -InstallationPath/)
    assert.match(source, /\$env:GYP_MSVS_VERSION = '2022'/)
    assert.match(source, /\$env:npm_config_msvs_version = '2022'/)
    assert.match(source, /return \[string\]\$installationPath/)
    assert.match(source, /\$vsInstallationResult = @\(Ensure-VsBuildTools\)/)
    assert.match(source, /\[string\]\$vsInstallationPath =/)
    assert.match(
      source,
      /\$env:npm_config_msvs_version = \$VisualStudioInstallationPath/
    )
    assert.match(source, /\$previousMsvsVersion/)
    assert.match(
      source,
      /finally \{[\s\S]*?SetEnvironmentVariable\([\s\S]*?'npm_config_msvs_version'/
    )
    assert.match(
      source,
      /Ensure-PrintenvzExecutable -NodePath \$node -VisualStudioInstallationPath \$vsInstallationPath/
    )
  })

  it('fails closed on stale, incomplete, or signed artifacts', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /GitHubDesktop\.exe/)
    assert.match(source, /resources\\app\.asar/)
    assert.match(source, /resources\\app'/)
    for (const sentinel of [
      'package.json',
      'main.js',
      'renderer.js',
      'crash.js',
      'quick-action.js',
    ]) {
      assert.match(source, new RegExp(sentinel.replace('.', '\\.')))
    }
    assert.match(source, /\$executable\.Length -le 0/)
    assert.match(source, /\$asarPayload\.Length -gt 0/)
    assert.match(source, /\$sentinel\.Length -le 0/)
    assert.match(
      source,
      /\$unpackedPayload\.LastWriteTimeUtc -lt \$freshnessFloor/
    )
    assert.match(source, /Payload = \$unpackedPayload/)
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

  it('uses directory freshness instead of copied sentinel mtimes for unpacked payloads', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(
      source,
      /\$unpackedPayload = Get-Item -LiteralPath \$unpackedPayloadPath/
    )
    assert.match(
      source,
      /\$unpackedPayload\.LastWriteTimeUtc -lt \$freshnessFloor/
    )
    assert.match(source, /\$sentinel\.Length -le 0/)
    assert.doesNotMatch(source, /\$sentinel\.LastWriteTimeUtc/)
  })

  it('runs Squirrel packaging only for Installer mode after the runnable build', async () => {
    const source = await read('script/build-windows.ps1')
    const build = source.lastIndexOf("'build:prod'")
    const installer = source.lastIndexOf("if ($Mode -eq 'Installer')")
    const pack = source.lastIndexOf("@($yarn, 'package')")
    const signing = source.lastIndexOf("$env:WINDOWS_SIGNING_ENABLED = 'false'")

    assert.ok(signing > 0, 'signing inputs must be cleared')
    assert.ok(
      build > signing,
      'signing inputs must be cleared before build:prod'
    )
    assert.ok(installer > build, 'Installer mode must branch after build:prod')
    assert.ok(pack > installer, 'Yarn package must be inside Installer mode')
    assert.doesNotMatch(
      source.slice(build, installer),
      /@\(\$yarn, 'package'\)/,
      'Build mode must not run Squirrel packaging'
    )
    assert.match(source.slice(installer), /GitHubDesktopSetup-/)
    assert.match(source.slice(installer), /verify-releases-manifest\.js/)
  })

  it('prints reproducible receipts without shipping anything', async () => {
    const source = await read('script/build-windows.ps1')

    assert.match(source, /rev-parse HEAD/)
    assert.match(source, /Get-FileHash[^\n]+SHA256/)
    assert.match(source, /Size:/)
    assert.match(source, /SHA256:/)
    assert.match(source, /Payload:/)
    assert.match(source, /Write-ApplicationReceipt -Application \$application/)
    assert.match(source, /Read-Host/)
    assert.match(source, /Start-Process/)
    assert.match(source, /\$Mode -eq 'Installer'/)
    assert.match(source, /-not \$IsSilent/)
    assert.doesNotMatch(source, /\bgit\s+push\b/i)
    assert.doesNotMatch(source, /\bgh\s+release\b/i)
    assert.doesNotMatch(source, /\bgit\s+tag\b/i)
  })
})
