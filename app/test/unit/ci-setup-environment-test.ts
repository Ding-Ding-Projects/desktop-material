import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const setupAction = readFileSync(
  join(process.cwd(), '.github/actions/setup-ci-environment/action.yml'),
  'utf8'
)
const postInstallScript = readFileSync(
  join(process.cwd(), 'script/post-install.ts'),
  'utf8'
)
const printenvzPackage = JSON.parse(
  readFileSync(join(process.cwd(), 'vendor/printenvz/package.json'), 'utf8')
) as { scripts?: Record<string, string> }
const printenvzBuildScript = readFileSync(
  join(process.cwd(), 'vendor/printenvz/build.mjs'),
  'utf8'
)
const frozenManifestVerifier = join(
  process.cwd(),
  'script',
  'verify-frozen-manifests.mjs'
)
const yarnBootstrap = readFileSync(
  join(process.cwd(), '.github/scripts/bootstrap-pinned-yarn.ps1'),
  'utf8'
)
const windowsGitBashBootstrap = readFileSync(
  join(process.cwd(), '.github/scripts/ensure-windows-git-bash.ps1'),
  'utf8'
)
const windowsReleaseBootstrapTest = readFileSync(
  join(process.cwd(), '.github/scripts/test-windows-release-bootstrap.ps1'),
  'utf8'
)
const githubCliAction = readFileSync(
  join(process.cwd(), '.github/actions/setup-github-cli/action.yml'),
  'utf8'
)
const githubCliBootstrap = readFileSync(
  join(process.cwd(), '.github/scripts/ensure-github-cli.sh'),
  'utf8'
)
const jqAction = readFileSync(
  join(process.cwd(), '.github/actions/setup-jq/action.yml'),
  'utf8'
)
const jqBootstrap = readFileSync(
  join(process.cwd(), '.github/scripts/ensure-jq.sh'),
  'utf8'
)
const arm64ToolsetScript = readFileSync(
  join(process.cwd(), '.github/scripts/ensure-windows-arm64-build-tools.ps1'),
  'utf8'
)
const clangToolsetScript = readFileSync(
  join(process.cwd(), '.github/scripts/ensure-windows-clang.ps1'),
  'utf8'
)

interface ICompositeActionStep {
  name?: string
  if?: string
  run?: string
  shell?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}

interface ICompositeActionDocument {
  runs?: { steps?: ICompositeActionStep[] }
}

const setupActionDocument = parse(setupAction) as ICompositeActionDocument

function getNamedStep(name: string): ICompositeActionStep {
  const step = setupActionDocument.runs?.steps?.find(
    candidate => candidate.name === name
  )
  assert.notEqual(step, undefined, `workflow step ${name} must exist`)
  return step ?? {}
}

function getNamedStepIndex(name: string): number {
  const index = setupActionDocument.runs?.steps?.findIndex(
    candidate => candidate.name === name
  )
  assert.notEqual(index, undefined, `workflow step ${name} must exist`)
  assert.notEqual(index, -1, `workflow step ${name} must exist`)
  return index ?? -1
}

describe('CI environment setup', () => {
  it('uses exact dependency caches and keeps self-hosted cache writes explicit', () => {
    const preferGitBashStep = setupActionDocument.runs?.steps?.find(
      step =>
        step.name === 'Reuse or install Git Bash on Windows self-hosted runners'
    )
    assert.notEqual(preferGitBashStep, undefined)
    assert.equal(
      preferGitBashStep?.if,
      "${{ runner.os == 'Windows' && runner.environment == 'self-hosted' }}"
    )
    assert.equal(
      setupAction.match(
        /shell: cmd\r?\n\s+run: .*ensure-windows-git-bash\.cmd/g
      )?.length,
      1
    )
    assert.match(setupAction, /ensure-windows-git-bash\.cmd/)
    assert.doesNotMatch(setupAction, /shell: pwsh/)
    assert.match(setupAction, /ensure-windows-git-bash\.ps1/)
    assert.match(setupAction, /Install uv for self-hosted Windows Python/)
    assert.match(setupAction, /Install uv for self-hosted Linux Python/)
    assert.match(
      setupAction,
      /Install uv for self-hosted Windows Python[\s\S]*?enable-cache: false/
    )
    assert.match(
      setupAction,
      /Install uv for self-hosted Linux Python[\s\S]*?enable-cache: false/
    )
    assert.match(
      setupAction,
      /Restore exact installed dependencies[\s\S]*?runner\.environment != 'self-hosted'/
    )
    assert.match(
      setupAction,
      /Restore exact installed dependencies on Windows self-hosted runners[\s\S]*?if: \$\{\{ runner\.os == 'Windows' && runner\.environment == 'self-hosted' \}\}[\s\S]*?actions\/cache\/restore@v5/
    )
    assert.match(setupAction, /Select installed dependency cache result/)
    assert.match(
      setupAction,
      /Save exact installed dependencies from Windows self-hosted runners[\s\S]*?actions\/cache\/save@v5/
    )
    assert.match(setupAction, /uv python install 3\.11/)
    assert.match(setupAction, /npm_config_python=\$python_path/)
    assert.match(
      setupAction,
      /Install managed Python 3\.11 on self-hosted Linux[\s\S]*?runner\.os == 'Linux' && runner\.environment == 'self-hosted'/
    )
    assert.match(
      setupAction,
      /Install Windows arm64 C\+\+ toolset when missing[\s\S]*?ensure-windows-arm64-build-tools\.ps1/
    )
    assert.match(
      setupAction,
      /Install Windows ClangCL toolset when missing[\s\S]*?ensure-windows-clang\.ps1/
    )
    assert.match(
      clangToolsetScript,
      /Microsoft\.VisualStudio\.Component\.VC\.Llvm\.Clang/
    )
    assert.match(clangToolsetScript, /VC\\Tools\\Llvm\\\$platform/)
    assert.match(clangToolsetScript, /bin\\clang-cl\.exe/)
    assert.match(clangToolsetScript, /TargetArchitecture = 'x64'/)
    assert.match(
      setupAction,
      /ensure-windows-clang\.ps1[\s\S]*?TargetArchitecture/
    )
    assert.match(clangToolsetScript, /npm_config_msvs_version=/)
    assert.match(clangToolsetScript, /Toolset\.props/)
    assert.match(clangToolsetScript, /Toolset\.targets/)
    assert.match(clangToolsetScript, /MSBuild\\Current\\Bin\\MSBuild\.exe/)
    assert.match(clangToolsetScript, /VC\\Tools\\MSVC/)
    assert.match(clangToolsetScript, /Hostx64\\x64\\cl\.exe/)
    assert.match(
      clangToolsetScript,
      /Microsoft\.VisualStudio\.Component\.VC\.Tools\.x86\.x64/
    )
    assert.match(
      clangToolsetScript,
      /--installPath=\$\(\$instance\.installationPath\)/
    )
    assert.match(
      arm64ToolsetScript,
      /--installPath=\$\(\$instance\.installationPath\)/
    )
    assert.match(clangToolsetScript, /--quiet/)
    assert.match(clangToolsetScript, /--norestart/)
    assert.doesNotMatch(clangToolsetScript, /--wait/)
    assert.match(clangToolsetScript, /maxToolsetChecks = 120/)
    assert.match(clangToolsetScript, /Start-Sleep -Seconds 5/)
    assert.match(
      clangToolsetScript,
      /acceptedInstallerExitCodes = \@\(0, 3010, 1001, 1618\)/
    )
    assert.match(arm64ToolsetScript, /maxCompilerChecks = 120/)
    assert.match(arm64ToolsetScript, /Start-Sleep -Seconds 5/)
    assert.match(arm64ToolsetScript, /npm_config_msvs_version=/)
    assert.match(
      arm64ToolsetScript,
      /acceptedInstallerExitCodes = \@\(0, 3010, 1001, 1618\)/
    )
    assert.ok(
      setupAction.indexOf('Install Windows arm64 C++ toolset when missing') <
        setupAction.indexOf('Install Windows ClangCL toolset when missing')
    )
    assert.match(
      arm64ToolsetScript,
      /Microsoft\.VisualStudio\.Component\.VC\.Tools\.ARM64/
    )
    assert.match(
      arm64ToolsetScript,
      /Microsoft\.VisualStudio\.Component\.VC\.Tools\.x86\.x64/
    )
    assert.match(arm64ToolsetScript, /Microsoft\.VCToolsVersion\.default\.txt/)
    assert.match(arm64ToolsetScript, /--norestart/)
    assert.match(arm64ToolsetScript, /Hostx64\\arm64\\cl\.exe/)
    assert.match(
      setupAction,
      /Use Node\.js .*? before self-hosted Yarn bootstrap[\s\S]*?actions\/setup-node@v6[\s\S]*?node-version:[\s\S]*?Provide repository-pinned Yarn to self-hosted Windows actions[\s\S]*?bootstrap-pinned-yarn\.ps1/
    )
    assert.match(
      setupAction,
      /Provide repository-pinned Yarn to self-hosted Windows actions[\s\S]*?Expose repository-pinned Yarn to Git Bash[\s\S]*?cygpath -u[\s\S]*?GITHUB_PATH[\s\S]*?yarn --version[\s\S]*?Use Node\.js .*?with Yarn download cache[\s\S]*?runner\.environment != 'self-hosted'[\s\S]*?Use Node\.js[\s\S]*?before self-hosted dependency[\s\S]*?install/
    )
    assert.match(yarnBootstrap, /vendor\\yarn-1\.21\.1\.js/)
    assert.match(yarnBootstrap, /System\.IO\.File\]::Copy/)
    assert.match(yarnBootstrap, /%~dp0yarn-1\.21\.1\.js/)
    assert.match(yarnBootstrap, /yarn\.cmd/)
    assert.match(yarnBootstrap, /Join-Path \$shimRoot 'yarn'/)
    assert.match(yarnBootstrap, /usr\/bin\/env bash/)
    assert.match(yarnBootstrap, /dirname "\$0"\)\/yarn-1\.21\.1\.js/)
    assert.match(yarnBootstrap, /posixShim\.Replace/)
    assert.match(yarnBootstrap, /GITHUB_PATH/)
    assert.match(yarnBootstrap, /ErrorAction Stop/)
    assert.match(yarnBootstrap, /RUNNER_TEMP/)
    assert.match(
      yarnBootstrap,
      /Node\.js is required on a self-hosted Windows runner/
    )
    assert.match(yarnBootstrap, /LASTEXITCODE/)
    assert.match(
      setupAction,
      /uses: actions\/setup-python@v6[\s\S]*?if: \$\{\{ runner\.environment != 'self-hosted' \}\}/
    )
    assert.match(setupAction, /uses: actions\/cache@v5/)
    assert.match(setupAction, /node_modules\s+app\/node_modules/)
    assert.match(setupAction, /AppData\/Local\/ms-playwright/)
    assert.match(
      setupAction,
      /installed-deps-v6-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-target-/
    )
    assert.match(
      setupAction,
      /Restore exact installed dependencies on Windows self-hosted runners[\s\S]*?restore-keys:[\s\S]*?installed-deps-v5-\$\{\{ runner\.os \}\}[\s\S]*?installed-deps-v4-\$\{\{ runner\.os \}\}/
    )
    const hostedCache = getNamedStep(
      'Restore exact installed dependencies on hosted runners'
    )
    const selfHostedRestore = getNamedStep(
      'Restore exact installed dependencies on Windows self-hosted runners'
    )
    const selfHostedSave = getNamedStep(
      'Save exact installed dependencies from Windows self-hosted runners'
    )
    const hostedKey = String(hostedCache.with?.key ?? '')
    const selfHostedRestoreKey = String(selfHostedRestore.with?.key ?? '')
    const selfHostedSaveKey = String(selfHostedSave.with?.key ?? '')
    assert.notEqual(hostedKey, '')
    assert.notEqual(selfHostedRestoreKey, '')
    assert.equal(selfHostedSaveKey, selfHostedRestoreKey)
    assert.match(
      hostedKey,
      /\.github\/scripts\/ensure-windows-arm64-build-tools\.ps1/
    )
    assert.doesNotMatch(hostedKey, /windows-toolchain/)
    assert.match(
      selfHostedRestoreKey,
      /steps\.windows-toolchain\.outputs\.cache-suffix/
    )
    assert.match(selfHostedRestoreKey, /runner-/)
    assert.match(
      setupAction,
      /Capture Windows native toolchain fingerprint[\s\S]*?SHA256Managed[\s\S]*?BitConverter[\s\S]*?cache-suffix=/
    )
    assert.doesNotMatch(
      setupAction,
      /Capture Windows native toolchain fingerprint[\s\S]*?(?:ToHexString|HashData)/
    )
    assert.equal(
      String(selfHostedRestore.with?.['restore-keys'] ?? '').includes(
        'installed-deps-v5-'
      ),
      true
    )
    assert.equal(
      String(selfHostedRestore.with?.['restore-keys'] ?? '').includes(
        'installed-deps-v4-'
      ),
      true
    )
    assert.equal(
      selfHostedSave.uses,
      'actions/cache/save@v5',
      'self-hosted Windows cache writes must use the explicit save action'
    )
    assert.match(
      selfHostedSave.if ?? '',
      /installed-dependencies-self-hosted\.outputs\.cache-hit != 'true'/
    )
    assert.match(
      selfHostedSave.if ?? '',
      /dependency-cache-check\.outputs\.complete != 'true'/
    )
    assert.match(
      selfHostedSave.if ?? '',
      /verify-dependencies\.outcome == 'success'/
    )
    assert.equal(
      String(hostedCache.with?.path ?? ''),
      String(selfHostedRestore.with?.path ?? '')
    )
    assert.equal(
      String(selfHostedRestore.with?.path ?? ''),
      String(selfHostedSave.with?.path ?? '')
    )
    const snapshotIndex = getNamedStepIndex(
      'Snapshot dependency manifests before dependency install'
    )
    const crossInstallIndex = getNamedStepIndex(
      'Install cross-compilation copilot package'
    )
    const frozenManifestCheckIndex = getNamedStepIndex(
      'Verify frozen dependency install preserved manifests'
    )
    const restoreManifestIndex = getNamedStepIndex(
      'Restore dependency manifests after cross-compilation install'
    )
    const verifyIndex = getNamedStepIndex(
      'Verify installed dependencies before use'
    )
    const saveIndex = getNamedStepIndex(
      'Save exact installed dependencies from Windows self-hosted runners'
    )
    assert.ok(snapshotIndex < crossInstallIndex)
    assert.ok(snapshotIndex < frozenManifestCheckIndex)
    assert.ok(frozenManifestCheckIndex < crossInstallIndex)
    assert.ok(crossInstallIndex < restoreManifestIndex)
    assert.ok(restoreManifestIndex < verifyIndex)
    assert.ok(verifyIndex < saveIndex)
    assert.ok(
      getNamedStepIndex('Capture Windows native toolchain fingerprint') <
        getNamedStepIndex(
          'Restore exact installed dependencies on Windows self-hosted runners'
        )
    )
    assert.match(
      getNamedStep('Snapshot dependency manifests before dependency install')
        .run ?? '',
      /RUNNER_TEMP[\s\S]*root-package\.json[\s\S]*root-yarn\.lock[\s\S]*app-package\.json[\s\S]*app-yarn\.lock/
    )
    assert.match(
      getNamedStep(
        'Restore dependency manifests after cross-compilation install'
      ).run ?? '',
      /app-package\.json[\s\S]*app\/package\.json[\s\S]*app-yarn\.lock[\s\S]*app\/yarn\.lock/
    )
    assert.doesNotMatch(
      getNamedStep(
        'Restore dependency manifests after cross-compilation install'
      ).run ?? '',
      /cmp -s/
    )
    const frozenManifestRun =
      getNamedStep('Verify frozen dependency install preserved manifests')
        .run ?? ''
    assert.equal(
      frozenManifestRun,
      'node script/verify-frozen-manifests.mjs "$RUNNER_TEMP/desktop-material-manifests-before-cross-compilation"'
    )
    assert.match(
      setupAction,
      /Verify installed dependencies before use[\s\S]*?Installed dependency cache is incomplete/
    )
    assert.match(
      setupAction,
      /Check cached dependencies[\s\S]*?node_modules\/printenvz\/build\/Release\/printenvz\.exe/
    )
    assert.match(
      setupAction,
      /Verify installed dependencies before use[\s\S]*?node_modules\/printenvz\/build\/Release\/printenvz\.exe/
    )
    assert.match(
      setupAction,
      /Cached printenvz executable failed its bounded smoke test[\s\S]*?Installed printenvz executable failed/
    )
    assert.match(
      setupAction,
      /Install and build dependencies[\s\S]*?cache-hit != 'true'[\s\S]*?yarn --frozen-lockfile/
    )
    assert.equal(printenvzPackage.scripts?.install, 'node build.mjs --rebuild')
    assert.equal(printenvzPackage.scripts?.build, 'node build.mjs --build')
    assert.equal(printenvzPackage.scripts?.rebuild, 'node build.mjs --rebuild')
    assert.match(printenvzBuildScript, /requiresWindowsDirectCompiler/)
    assert.match(printenvzBuildScript, /node-gyp\/bin\/node-gyp\.js/)
    assert.match(printenvzBuildScript, /VsDevCmd\.bat/)
    assert.match(printenvzBuildScript, /vcvarsall\.bat/)
    assert.match(printenvzBuildScript, /vswhere\.exe/)
    assert.match(printenvzBuildScript, /discoverVisualStudioInstallation/)
    assert.match(printenvzBuildScript, /printenvz-build\.cmd/)
    assert.match(printenvzBuildScript, /-arch=\$\{targetArchitecture\}/)
    assert.match(printenvzBuildScript, /cl\.exe \/nologo \/O2 \/MT/)
    assert.match(
      printenvzBuildScript,
      /rmSync\(buildRoot, \{ recursive: true, force: true \}\)/
    )
    const dependencyInstallStep = getNamedStep('Install and build dependencies')
    assert.equal(dependencyInstallStep.env?.NODE_ENV, 'development')
    assert.equal(dependencyInstallStep.env?.YARN_PRODUCTION, 'false')
    assert.match(
      postInstallScript,
      /\[\s*path,\s*'--cwd',\s*'app',\s*'install',\s*'--force',\s*'--frozen-lockfile'\s*\]/
    )
    assert.match(setupAction, /Check cached dependencies/)
    assert.match(setupAction, /dependency-cache-check/)
    assert.match(
      setupAction,
      /dependency-cache-check\.outputs\.complete != 'true'/
    )
    assert.match(setupAction, /app\/node_modules\/react\/jsx-runtime\.js/)
    assert.match(
      setupAction,
      /app\/node_modules\/react-confetti\/package\.json/
    )
    assert.match(
      setupAction,
      /app\/node_modules\/react-confetti\/dist\/react-confetti\.mjs/
    )
    assert.match(setupAction, /node_modules\/electron\/dist\/electron\.exe/)
    assert.match(
      setupAction,
      /app\/node_modules\/@github\/copilot-win32-\$\{\{ inputs\.arch \}\}\/package\.json/
    )
    assert.match(
      setupAction,
      /Check cached dependencies[\s\S]*?copilot-win32-\$\{\{ inputs\.arch \}\}/
    )
    assert.match(
      setupAction,
      /Check cached dependencies[\s\S]*?Cached dependency is missing Playwright ffmpeg/
    )
    assert.match(setupAction, /cache-dependency-path:[\s\S]*?app\/yarn\.lock/)
    assert.match(setupAction, /actions\/setup-python@v6/)
    assert.match(setupAction, /missing Playwright ffmpeg/)
    assert.match(setupAction, /refusing to save or use this exact cache key/)
    assert.match(setupAction, /chmod \+x "\$shim_root\/yarn"/)
    assert.match(
      setupAction,
      /resolved_yarn=\"\$\(command -v yarn \\|\\| true\)\"/
    )
    assert.match(setupAction, /Git Bash resolved an unexpected Yarn command/)
    assert.match(
      setupAction,
      /find "\$root"[\s\S]*?-mindepth 2[\s\S]*?-maxdepth 2[\s\S]*?-type f[\s\S]*?-path "\$root\/ffmpeg-\*\/\*"/
    )
    assert.match(setupAction, /-name ffmpeg-linux/)
    assert.match(setupAction, /-name ffmpeg-mac/)
    assert.match(setupAction, /-name ffmpeg-win64\.exe/)
    assert.doesNotMatch(setupAction, /-name ['"]?ffmpeg\*['"]?/)
    assert.doesNotMatch(setupAction, /install-ffmpeg|choco install ffmpeg/)
    assert.match(setupAction, /copilot-win32-\$\{\{ inputs\.arch \}\}/)
    assert.equal(
      existsSync(
        join(process.cwd(), '.github/actions/setup-windows-signing/action.yml')
      ),
      false
    )
  })

  it('fails closed for every changed or missing frozen manifest', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'dm-frozen-manifests-'))
    const backupRoot = join(fixtureRoot, 'backup')
    const manifestPairs = [
      ['root-package.json', 'package.json'],
      ['root-yarn.lock', 'yarn.lock'],
      ['app-package.json', 'app/package.json'],
      ['app-yarn.lock', 'app/yarn.lock'],
    ] as const
    const verify = () =>
      spawnSync(process.execPath, [frozenManifestVerifier, backupRoot], {
        cwd: fixtureRoot,
        encoding: 'utf8',
      })

    try {
      mkdirSync(backupRoot, { recursive: true })
      mkdirSync(join(fixtureRoot, 'app'), { recursive: true })
      for (const [backupName, liveName] of manifestPairs) {
        const contents = `locked ${liveName}\n`
        writeFileSync(join(backupRoot, backupName), contents)
        writeFileSync(join(fixtureRoot, liveName), contents)
      }

      const unchanged = verify()
      assert.equal(unchanged.status, 0, unchanged.stderr)

      for (const [, liveName] of manifestPairs) {
        const livePath = join(fixtureRoot, liveName)
        const original = readFileSync(livePath)
        writeFileSync(livePath, Buffer.concat([original, Buffer.from('drift')]))
        const changed = verify()
        assert.equal(changed.status, 1, `${liveName}: ${changed.stderr}`)
        assert.match(
          changed.stderr,
          /Frozen dependency install changed a locked dependency manifest/
        )
        assert.ok(changed.stderr.includes(liveName))
        writeFileSync(livePath, original)
      }

      for (const [backupName, liveName] of manifestPairs) {
        const backupPath = join(backupRoot, backupName)
        const backup = readFileSync(backupPath)
        unlinkSync(backupPath)
        const missingBackup = verify()
        assert.equal(
          missingBackup.status,
          1,
          `${backupName}: ${missingBackup.stderr}`
        )
        assert.ok(missingBackup.stderr.includes(backupName))
        assert.ok(missingBackup.stderr.includes(liveName))
        writeFileSync(backupPath, backup)

        const livePath = join(fixtureRoot, liveName)
        const live = readFileSync(livePath)
        unlinkSync(livePath)
        const missingLive = verify()
        assert.equal(
          missingLive.status,
          1,
          `${liveName}: ${missingLive.stderr}`
        )
        assert.ok(missingLive.stderr.includes(liveName))
        writeFileSync(livePath, live)
      }

      const unreadableBackupName = manifestPairs[0][0]
      const unreadableLiveName = manifestPairs[0][1]
      const unreadableBackupPath = join(backupRoot, unreadableBackupName)
      const unreadableBackup = readFileSync(unreadableBackupPath)
      unlinkSync(unreadableBackupPath)
      mkdirSync(unreadableBackupPath)
      const unreadable = verify()
      assert.equal(
        unreadable.status,
        1,
        `${unreadableBackupName}: ${unreadable.stderr}`
      )
      assert.ok(unreadable.stderr.includes(unreadableLiveName))
      assert.doesNotMatch(unreadable.stderr, /ENOENT/)
      assert.match(unreadable.stderr, /EISDIR|EPERM|directory/i)
      rmSync(unreadableBackupPath, { recursive: true, force: true })
      writeFileSync(unreadableBackupPath, unreadableBackup)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('bootstraps every Windows release command from pinned canonical tools', () => {
    assert.match(
      windowsGitBashBootstrap,
      /git-for-windows\/git\/releases\/download\/\$ReleaseTag\/\$asset/
    )
    assert.match(windowsGitBashBootstrap, /RUNNER_TOOL_CACHE/)
    assert.match(windowsGitBashBootstrap, /Get-FileHash[\s\S]*?SHA256/)
    assert.match(
      windowsGitBashBootstrap,
      /ExpectedSha256 = 'b365da794b1d2225eb24d5f5e09ef7792cfd5fa26c3a3586210280c80dff3a2a'/
    )
    assert.match(windowsGitBashBootstrap, /ForceBootstrap/)
    assert.match(windowsGitBashBootstrap, /GITHUB_PATH/)
    assert.match(windowsGitBashBootstrap, /bin\\bash\.exe/)
    assert.match(
      windowsGitBashBootstrap,
      /Get-FileHash -LiteralPath \$archivePath -Algorithm SHA256/
    )
    assert.match(
      windowsGitBashBootstrap,
      /desktop-material-portable-git\\\$Version\\x64/
    )

    assert.match(
      githubCliAction,
      /run: bash \.github\/scripts\/ensure-github-cli\.sh/
    )
    assert.match(jqAction, /run: bash \.github\/scripts\/ensure-jq\.sh/)
    for (const bootstrap of [githubCliBootstrap, jqBootstrap]) {
      assert.match(bootstrap, /RUNNER_TOOL_CACHE/)
      assert.match(bootstrap, /sha256sum -c -/)
      assert.match(bootstrap, /--proto '=https'/)
      assert.match(bootstrap, /GITHUB_PATH/)
      assert.match(bootstrap, /DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE/)
      assert.match(bootstrap, /rm -rf "\$install_root"/)
      assert.doesNotMatch(bootstrap, /command -v (?:gh|jq)/)
    }
    assert.match(
      githubCliBootstrap,
      /cli\/cli\/releases\/download\/v\$\{version\}/
    )
    assert.match(githubCliBootstrap, /windows_\$\{archive_arch\}\.zip/)
    assert.match(
      githubCliBootstrap,
      /35d7fe05c4dd1411ffda1e73dfc7c6f44b75c936ca51fa6595c657fdc0350cec/
    )
    assert.match(jqBootstrap, /jqlang\/jq\/releases\/download\/jq-\$version/)
    assert.match(jqBootstrap, /jq-windows-amd64\.exe/)
    assert.match(
      jqBootstrap,
      /7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab/
    )

    assert.match(
      windowsReleaseBootstrapTest,
      /-ForceBootstrap -InstallRoot \$installRoot/
    )
    assert.equal(
      (
        windowsReleaseBootstrapTest.match(
          /-ForceBootstrap -InstallRoot \$installRoot/g
        ) ?? []
      ).length,
      2,
      'the fixture must invoke PortableGit once cold and once warm'
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /command -v curl && command -v sha256sum && command -v unzip/
    )
    assert.match(windowsReleaseBootstrapTest, /ensure-github-cli\.sh/)
    assert.match(windowsReleaseBootstrapTest, /ensure-jq\.sh/)
    assert.match(
      windowsReleaseBootstrapTest,
      /Get-FileHash -LiteralPath \$Path -Algorithm SHA256/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /cache must retain only the three checksum-verified archives/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Remove-Item -LiteralPath \$runnerTemp -Recurse -Force/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Job-local bootstrap output survived the cold-pass cleanup/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Set-Item -Path Function:Invoke-WebRequest/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Bootstrap fixture blocked Invoke-WebRequest network access\./
    )
    assert.match(windowsReleaseBootstrapTest, /\$env:BASH_ENV =/)
    assert.match(windowsReleaseBootstrapTest, /type -t curl\)" == "function"/)
    assert.match(
      windowsReleaseBootstrapTest,
      /curl --version >\/dev\/null 2>&1/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /curl network-denial probe returned \$LASTEXITCODE instead of 97/
    )
    assert.doesNotMatch(
      windowsReleaseBootstrapTest,
      /\$env:DESKTOP_MATERIAL_BOOTSTRAP_OFFLINE\s*=\s*'1'/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /PortableGit warm-cache bootstrap/
    )
    assert.match(windowsReleaseBootstrapTest, /GitHub CLI warm-cache/)
    assert.match(windowsReleaseBootstrapTest, /jq warm-cache/)
    assert.match(
      windowsReleaseBootstrapTest,
      /Warm-cache PortableGit failed its Git version probe/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Warm-cache PortableGit failed its Bash version probe/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Warm-cache GitHub CLI failed its version probe/
    )
    assert.match(
      windowsReleaseBootstrapTest,
      /Warm-cache jq failed its version probe/
    )
  })

  it('pins and retries the cross-compilation Copilot package install', () => {
    assert.match(
      setupAction,
      /PKG_VERSION=\$\(node -p "require\('\.\/app\/node_modules\/@github\/copilot\/package\.json'\)\.version"\)/
    )
    assert.match(setupAction, /"\$\{PKG\}@\$\{PKG_VERSION\}"/)
    assert.match(setupAction, /for attempt in 1 2 3; do/)
    assert.match(setupAction, /after 3 attempts/)
  })
})
