import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

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

describe('CI environment setup', () => {
  it('uses an exact installed-dependency cache and skips cold setup only on a hit', () => {
    assert.match(setupAction, /Prefer Git Bash on Windows self-hosted runners/)
    assert.match(
      setupAction,
      /shell: powershell -NoProfile -ExecutionPolicy Bypass/
    )
    assert.doesNotMatch(setupAction, /shell: pwsh/)
    assert.match(setupAction, /GITHUB_PATH/)
    assert.match(setupAction, /bin\\bash\.exe/)
    assert.match(setupAction, /Install uv for self-hosted Windows Python/)
    assert.match(setupAction, /uv python install 3\.11/)
    assert.match(setupAction, /npm_config_python=\$python_path/)
    assert.match(
      setupAction,
      /Use Node\.js .*? before self-hosted Yarn bootstrap[\s\S]*?actions\/setup-node@v6[\s\S]*?node-version:[\s\S]*?Provide repository-pinned Yarn to self-hosted Windows actions[\s\S]*?bootstrap-pinned-yarn\.ps1/
    )
    assert.match(
      setupAction,
      /Provide repository-pinned Yarn to self-hosted Windows actions[\s\S]*?Expose repository-pinned Yarn to Git Bash[\s\S]*?cygpath -u[\s\S]*?GITHUB_PATH[\s\S]*?yarn --version[\s\S]*?Use Node\.js .*?with Yarn download cache/
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
      /uses: actions\/setup-python@v6[\s\S]*?runner\.environment != 'self-hosted'/
    )
    assert.match(setupAction, /uses: actions\/cache@v5/)
    assert.match(setupAction, /node_modules\s+app\/node_modules/)
    assert.match(setupAction, /AppData\/Local\/ms-playwright/)
    assert.match(
      setupAction,
      /installed-deps-v4-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-target-/
    )
    assert.doesNotMatch(setupAction, /restore-keys:/)
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
