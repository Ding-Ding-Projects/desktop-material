import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const setupAction = readFileSync(
  join(process.cwd(), '.github/actions/setup-ci-environment/action.yml'),
  'utf8'
)
const yarnBootstrap = readFileSync(
  join(process.cwd(), '.github/scripts/bootstrap-pinned-yarn.ps1'),
  'utf8'
)
const windowsSigningAction = readFileSync(
  join(process.cwd(), '.github/actions/setup-windows-signing/action.yml'),
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
      step => step.name === 'Prefer Git Bash on Windows self-hosted runners'
    )
    assert.notEqual(preferGitBashStep, undefined)
    assert.equal(
      preferGitBashStep?.if,
      "${{ runner.os == 'Windows' && runner.environment == 'self-hosted' }}"
    )
    assert.match(
      setupAction,
      /shell: powershell -NoProfile -ExecutionPolicy Bypass/
    )
    assert.doesNotMatch(setupAction, /shell: pwsh/)
    assert.match(setupAction, /GITHUB_PATH/)
    assert.match(setupAction, /bin\\bash\.exe/)
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
    assert.equal(selfHostedRestoreKey, hostedKey)
    assert.equal(selfHostedSaveKey, hostedKey)
    assert.match(
      hostedKey,
      /\.github\/scripts\/ensure-windows-arm64-build-tools\.ps1/
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
      'Snapshot dependency manifests before cross-compilation install'
    )
    const crossInstallIndex = getNamedStepIndex(
      'Install cross-compilation copilot package'
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
    assert.ok(crossInstallIndex < restoreManifestIndex)
    assert.ok(restoreManifestIndex < verifyIndex)
    assert.ok(verifyIndex < saveIndex)
    assert.match(
      getNamedStep(
        'Snapshot dependency manifests before cross-compilation install'
      ).run ?? '',
      /RUNNER_TEMP[\s\S]*app-package\.json[\s\S]*app-yarn\.lock/
    )
    assert.match(
      getNamedStep(
        'Restore dependency manifests after cross-compilation install'
      ).run ?? '',
      /app-package\.json[\s\S]*app\/package\.json[\s\S]*app-yarn\.lock[\s\S]*app\/yarn\.lock[\s\S]*cmp -s/
    )
    assert.match(
      setupAction,
      /Verify installed dependencies before use[\s\S]*?Installed dependency cache is incomplete/
    )
    assert.match(
      setupAction,
      /Install and build dependencies[\s\S]*?cache-hit != 'true'/
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
    assert.match(
      windowsSigningAction,
      /shell: powershell -NoProfile -ExecutionPolicy Bypass/
    )
    assert.doesNotMatch(windowsSigningAction, /shell: pwsh/)
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
