import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { SemVer } from 'semver'

const workflow = readFileSync(
  join(process.cwd(), '.github/workflows/super-express-release.yml'),
  'utf8'
)
const windowsWorkflow = readFileSync(
  join(process.cwd(), '.github/workflows/super-express-release-windows.yml'),
  'utf8'
)
const tuiWorkflow = readFileSync(
  join(process.cwd(), '.github/workflows/super-express-release-linux-tui.yml'),
  'utf8'
)
const windowsBuildAction = readFileSync(
  join(process.cwd(), '.github/actions/super-express-windows-build/action.yml'),
  'utf8'
)
const tuiBuildAction = readFileSync(
  join(
    process.cwd(),
    '.github/actions/super-express-linux-tui-build/action.yml'
  ),
  'utf8'
)
const installerWorkflow = readFileSync(
  join(process.cwd(), '.github/workflows/build-installers.yml'),
  'utf8'
)
const promotionScript = readFileSync(
  join(process.cwd(), '.github/scripts/promote-current-release.sh'),
  'utf8'
)
const promotionScriptPath = join(
  process.cwd(),
  '.github/scripts/promote-current-release.sh'
)
const releasePullRequestWorkflow = readFileSync(
  join(process.cwd(), '.github/workflows/release-pr.yml'),
  'utf8'
)

interface IReleaseLifecycleHarnessOptions {
  args?: string[]
  env?: Record<string, string>
  gh: string
  git: string
  node?: string
}

function toBashPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`)
}

function resolveBashExecutable(): string {
  if (process.platform !== 'win32') {
    return 'bash'
  }

  const gitExecPath = spawnSync('git', ['--exec-path'], {
    encoding: 'utf8',
  })
  if (gitExecPath.status === 0) {
    const gitRoot = resolve(gitExecPath.stdout.trim(), '..', '..', '..')
    for (const candidate of [
      join(gitRoot, 'bin', 'bash.exe'),
      join(gitRoot, 'usr', 'bin', 'bash.exe'),
    ]) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  const gitLocations = spawnSync('where.exe', ['git.exe'], {
    encoding: 'utf8',
  })
  if (gitLocations.status === 0) {
    for (const gitExecutable of gitLocations.stdout.split(/\r?\n/u)) {
      if (!gitExecutable.trim()) {
        continue
      }
      const gitRoot = resolve(gitExecutable.trim(), '..', '..')
      for (const candidate of [
        join(gitRoot, 'bin', 'bash.exe'),
        join(gitRoot, 'usr', 'bin', 'bash.exe'),
      ]) {
        if (existsSync(candidate)) {
          return candidate
        }
      }
    }
  }

  throw new Error('Git Bash could not be resolved from the installed git.exe')
}

const bashExecutable = resolveBashExecutable()

function runReleaseLifecycleHarness({
  args = [],
  env = {},
  gh,
  git,
  node = '#!/usr/bin/env bash\ncat\n',
}: IReleaseLifecycleHarnessOptions) {
  const root = mkdtempSync(
    join(tmpdir(), 'desktop-material-release-lifecycle-')
  )
  const bin = join(root, 'bin')
  const logPath = join(root, 'calls.log')
  const outputPath = join(root, 'github-output.txt')
  mkdirSync(bin)

  const writeCommand = (name: string, source: string) => {
    const path = join(bin, name)
    writeFileSync(path, source.replaceAll('\r\n', '\n'), 'utf8')
    chmodSync(path, 0o755)
  }
  writeCommand('gh', gh)
  writeCommand('git', git)
  writeCommand('node', node)

  try {
    const result = spawnSync(
      bashExecutable,
      [
        '-c',
        'export PATH="$1:$PATH"; exec bash "$2" "${@:3}"',
        'release-lifecycle-harness',
        toBashPath(bin),
        toBashPath(promotionScriptPath),
        ...args,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          ...env,
          GITHUB_OUTPUT: toBashPath(outputPath),
          GITHUB_REPOSITORY: 'Ding-Ding-Projects/desktop-material',
          MOCK_LOG: toBashPath(logPath),
          PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        },
      }
    )
    return {
      calls: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '',
      output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

describe('Super Express Release workflow', () => {
  it('is manual-only with a script-gated Windows lane on self-hosted runners', () => {
    assert.match(workflow, /on:\s*\n\s+workflow_dispatch:/)
    assert.doesNotMatch(workflow, /\n\s+(?:push|workflow_run):/)
    assert.match(
      workflow,
      /prepare:\s*\n\s+name: Prepare exact release target\s*\n\s+runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/
    )
    assert.match(
      workflow,
      /publish:[\s\S]*?runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/
    )
    assert.doesNotMatch(workflow, /fromJSON\(needs\./)
    assert.doesNotMatch(
      workflow,
      /cloud|fallback|runner_selection|use_self_hosted/
    )
    assert.match(
      workflow,
      /GH_TOKEN:\s*\n\s+\$\{\{\s*secrets\.RELEASE_TOKEN\s+\|\|\s+secrets\.ORG_TOKEN\s+\|\|\s+secrets\.GITHUB_TOKEN\s*\}\}/
    )
    assert.match(
      workflow,
      /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64/
    )
    assert.match(
      workflow,
      /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/
    )
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/super-express-windows-build/
    )
    assert.match(
      workflow,
      /uses: \.\/\.github\/actions\/super-express-linux-tui-build/
    )
    assert.match(workflow, /windows_build:/)
    assert.match(workflow, /tui_build:/)
    assert.doesNotMatch(workflow, /uses: \.\/\.github\/workflows\//)
    assert.match(workflow, /Require a main-branch manual dispatch/)
    assert.match(workflow, /ref: \$\{\{ env\.RELEASE_TARGET_SHA \}\}/)
    assert.match(
      workflow,
      /needs:\s*\n\s+- prepare\s*\n\s+- windows_build\s*\n\s+- tui_build/
    )
    assert.match(workflow, /actions\/download-artifact@v8/)
    assert.match(
      workflow,
      /Windows x64 and Linux TUI packages were built in parallel/
    )
    assert.match(workflow, /node script\/count-lines\.mjs/)
    assert.doesNotMatch(workflow, /run: yarn test:unit/)
    assert.doesNotMatch(workflow, /run: yarn test:script/)
    assert.doesNotMatch(workflow, /generate-parity-contract/)
    assert.doesNotMatch(workflow, /\bpytest\b/)
    assert.doesNotMatch(workflow, /\bruff\b/)
    assert.doesNotMatch(workflow, /\bmypy\b/)
    assert.doesNotMatch(workflow, /uv venv/)
    assert.doesNotMatch(workflow, /uv build --clear/)
    assert.doesNotMatch(workflow, /yarn build:prod/)
    assert.doesNotMatch(workflow, /yarn package/)
    assert.doesNotMatch(workflow, /run:\s*yarn lint/)
    assert.doesNotMatch(workflow, /validate-changelog/)
    assert.match(
      workflow,
      /concurrency:\s*\n\s+group: super-express-release-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: false/
    )

    assert.match(windowsWorkflow, /workflow_call:/)
    assert.match(windowsWorkflow, /workflow_dispatch:/)
    assert.match(windowsWorkflow, /inputs\.release_target_sha \|\| github\.sha/)
    assert.match(windowsBuildAction, /Resolve release package version/)
    assert.match(
      windowsBuildAction,
      /outputs:[\s\S]*?value: \$\{\{ steps\.resolve_version\.outputs\.release_version \}\}/
    )
    assert.match(
      windowsBuildAction,
      /artifact_name:[\s\S]*?value: super-express-windows-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(windowsBuildAction, /id: resolve_version/)
    assert.match(
      windowsBuildAction,
      /release-version\.js create "\$base" "\$GITHUB_RUN_ID" "\$GITHUB_RUN_ATTEMPT"/
    )
    assert.match(
      windowsBuildAction,
      /release-version\.js validate "\$RELEASE_VERSION" "\$base"/
    )
    assert.match(
      windowsBuildAction,
      /Direct Super Express Windows dispatches must use main/
    )
    assert.match(
      windowsBuildAction,
      /Reuse or install Git Bash on Windows self-hosted runners[\s\S]*?shell: powershell -NoProfile -ExecutionPolicy Bypass[\s\S]*?ensure-windows-git-bash\.ps1/
    )
    assert.doesNotMatch(windowsBuildAction, /^\s*shell: powershell\s*$/m)
    assert.doesNotMatch(windowsBuildAction, /shell: pwsh/)
    assert.doesNotMatch(
      windowsWorkflow,
      /cloud|fallback|runner_selection|use_self_hosted/
    )
    assert.match(windowsWorkflow, /build:/)
    assert.match(
      windowsWorkflow,
      /build:[\s\S]*?permissions:\s*\n\s+contents: read/
    )
    assert.match(
      windowsWorkflow,
      /publish:[\s\S]*?permissions:\s*\n\s+contents: write\s*\n\s+actions: read/
    )
    assert.match(windowsWorkflow, /permissions:\s*\n\s+contents: write/)
    assert.match(
      windowsWorkflow,
      /publish:[\s\S]*?if: >-[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?needs\.build\.result == 'success'/
    )
    assert.match(
      windowsWorkflow,
      /publish:[\s\S]*?actions\/download-artifact@v8[\s\S]*?name: \$\{\{ needs\.build\.outputs\.artifact_name \}\}/
    )
    assert.match(windowsWorkflow, /gh release create "\$RELEASE_TAG"/)
    assert.match(windowsWorkflow, /--target "\$RELEASE_TARGET_SHA"/)
    assert.match(
      windowsWorkflow,
      /Require the current main tip for a direct release[\s\S]*?shell: powershell -NoProfile -ExecutionPolicy Bypass -Command "\. '\{0\}'"[\s\S]*?git fetch origin main/
    )
    assert.match(windowsWorkflow, /--draft/)
    assert.match(windowsWorkflow, /-F draft=false/)
    assert.doesNotMatch(windowsWorkflow, /--latest(?:\r?\n|\s)/)
    assert.match(
      windowsWorkflow,
      /git ls-remote --exit-code --tags origin "refs\/tags\/\$RELEASE_TAG"/
    )
    assert.match(windowsWorkflow, /publish:[\s\S]*?promote-current-release\.sh/)
    assert.match(
      windowsWorkflow,
      /actions\/runs\/\$GITHUB_RUN_ID\/jobs\?per_page=100[\s\S]*?\.jobs\[\]\.started_at[\s\S]*?Publish verified Windows release[\s\S]*?\.completed_at/
    )
    assert.doesNotMatch(windowsWorkflow, /\.run_started_at/)
    assert.match(
      windowsWorkflow,
      /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64/
    )
    assert.match(
      windowsWorkflow,
      /concurrency:\s*\n\s+group: super-express-release-windows-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: false/
    )
    assert.match(windowsWorkflow, /super-express-windows-build/)
    assert.match(windowsBuildAction, /yarn build:prod/)
    assert.match(windowsBuildAction, /yarn package/)
    assert.match(
      windowsBuildAction,
      /Run release script contracts[\s\S]*?run: yarn test:script/
    )
    const scriptGate = windowsBuildAction.indexOf(
      '    - name: Run release script contracts'
    )
    const versionMutation = windowsBuildAction.indexOf(
      '    - name: Apply the release package version'
    )
    const productionBuild = windowsBuildAction.indexOf(
      '    - name: Build production app'
    )
    assert.ok(scriptGate >= 0)
    assert.ok(scriptGate < versionMutation)
    assert.ok(versionMutation < productionBuild)
    assert.match(
      windowsBuildAction,
      /WINDOWS_SIGNING_ENABLED: 'false'[\s\S]*?CSC_IDENTITY_AUTO_DISCOVERY: 'false'/
    )
    assert.match(
      windowsBuildAction,
      /Require unsigned Windows release installers[\s\S]*?SignatureStatus\]::NotSigned/
    )
    assert.doesNotMatch(workflow, /^\s+sign:/m)
    assert.doesNotMatch(windowsWorkflow, /^\s+sign:/m)
    assert.doesNotMatch(windowsBuildAction, /setup-windows-signing/)
    assert.doesNotMatch(workflow, /AZURE_CODE_SIGNING_(?:CLIENT|TENANT)_ID/)
    assert.doesNotMatch(
      windowsWorkflow,
      /AZURE_CODE_SIGNING_(?:CLIENT|TENANT)_ID/
    )
    assert.match(
      windowsWorkflow,
      /publish:[\s\S]*?runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64\s*\n\s+- desktop-material-windows-local/
    )
    assert.doesNotMatch(windowsWorkflow, /ubuntu-latest/)
    assert.match(
      windowsWorkflow,
      /ensure-windows-git-bash\.ps1[\s\S]*?setup-github-cli[\s\S]*?setup-jq/
    )
    assert.match(
      windowsWorkflow,
      /Require downloaded installers to remain unsigned[\s\S]*?SignatureStatus\]::NotSigned/
    )
    for (const source of [windowsBuildAction, windowsWorkflow]) {
      assert.match(
        source,
        /node script\/verify-releases-manifest\.js[\s\S]*?release-payload\/installers\/RELEASES[\s\S]*?release-payload\/installers/
      )
    }
    assert.match(windowsBuildAction, /actions\/upload-artifact@v7/)
    assert.doesNotMatch(
      windowsBuildAction,
      /uv build|pytest|ruff|mypy|yarn test:unit|yarn lint/
    )

    assert.match(tuiWorkflow, /workflow_call:/)
    assert.match(tuiWorkflow, /workflow_dispatch:/)
    assert.match(tuiWorkflow, /inputs\.release_target_sha \|\| github\.sha/)
    assert.match(
      tuiBuildAction,
      /Direct Super Express Linux TUI dispatches must use main/
    )
    assert.doesNotMatch(
      tuiWorkflow,
      /cloud|fallback|runner_selection|use_self_hosted/
    )
    assert.match(tuiWorkflow, /build:/)
    assert.match(
      tuiWorkflow,
      /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/
    )
    assert.match(
      tuiWorkflow,
      /concurrency:\s*\n\s+group: super-express-release-linux-tui-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: false/
    )
    assert.match(tuiWorkflow, /super-express-linux-tui-build/)
    assert.match(tuiBuildAction, /uv python install 3\.12/)
    assert.doesNotMatch(tuiBuildAction, /actions\/setup-python@v7/)
    assert.match(tuiBuildAction, /uv build --clear/)
    assert.match(
      tuiBuildAction,
      /uv export --locked --no-dev --no-emit-project --no-hashes/
    )
    assert.match(
      tuiBuildAction,
      /artifact_name:[\s\S]*?value: super-express-tui-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(tuiBuildAction, /install-linux-tui\.sh/)
    assert.match(tuiBuildAction, /bootstrap-linux-tui\.sh/)
    assert.match(tuiBuildAction, /actions\/upload-artifact@v7/)
    assert.doesNotMatch(
      tuiBuildAction,
      /pytest|ruff|mypy|yarn test|yarn lint|generate-parity-contract/
    )
  })

  it('bootstraps a real checkout and finalizes direct releases before Latest promotion', () => {
    const buildStart = windowsWorkflow.indexOf('\n  build:')
    const publishStart = windowsWorkflow.indexOf('\n  publish:')
    assert.ok(buildStart >= 0)
    assert.ok(publishStart > buildStart)

    const buildJob = windowsWorkflow.slice(buildStart, publishStart)
    const publishJob = windowsWorkflow.slice(publishStart)
    const step = (name: string) => {
      const marker = `      - name: ${name}`
      const start = publishJob.indexOf(marker)
      assert.ok(start >= 0, `Missing direct-release step: ${name}`)
      const next = publishJob.indexOf('\n      - ', start + marker.length)
      return publishJob.slice(start, next >= 0 ? next : undefined)
    }

    for (const [job, ref] of [
      [buildJob, 'ref: ${{ inputs.release_target_sha || github.sha }}'],
      [publishJob, 'ref: ${{ env.RELEASE_TARGET_SHA }}'],
    ] as const) {
      assert.equal(
        (job.match(/uses: actions\/checkout@v7\.0\.1/g) ?? []).length,
        2
      )
      assert.equal(job.split(ref).length - 1, 2)
      assert.equal((job.match(/fetch-depth: 0/g) ?? []).length, 2)
      assert.equal((job.match(/persist-credentials: false/g) ?? []).length, 2)

      const firstCheckout = job.indexOf('uses: actions/checkout@v7.0.1')
      const bootstrap = job.indexOf('ensure-windows-git-bash.ps1')
      const secondCheckout = job.indexOf(
        'uses: actions/checkout@v7.0.1',
        firstCheckout + 1
      )
      assert.ok(firstCheckout >= 0)
      assert.ok(firstCheckout < bootstrap)
      assert.ok(bootstrap < secondCheckout)
    }

    const buildSecondCheckout = buildJob.lastIndexOf(
      'uses: actions/checkout@v7.0.1'
    )
    assert.ok(buildSecondCheckout < buildJob.indexOf('git config --local'))
    assert.ok(
      buildSecondCheckout <
        buildJob.indexOf('uses: ./.github/actions/super-express-windows-build')
    )
    const publishSecondCheckout = publishJob.lastIndexOf(
      'uses: actions/checkout@v7.0.1'
    )
    assert.ok(publishSecondCheckout < publishJob.indexOf('shell: bash'))
    assert.ok(
      publishSecondCheckout <
        publishJob.indexOf('uses: ./.github/actions/setup-github-cli')
    )

    const publishHeader = publishJob.slice(0, publishJob.indexOf('    steps:'))
    assert.doesNotMatch(publishHeader, /GH_TOKEN:/)
    const authenticatedSteps = [
      'Write Windows release notes',
      'Stage immutable Windows-only GitHub Release draft',
      'Verify draft target and assets before publication',
      'Publish verified Windows release',
      'Verify published target and assets',
      'Finalize exact workflow timing in release notes',
      'Reconcile this release as Latest',
      'Verify Latest and final release notes',
      'Remove failed release and reconcile Latest',
    ]
    assert.equal(
      (publishJob.match(/GH_TOKEN:/g) ?? []).length,
      authenticatedSteps.length
    )
    for (const name of authenticatedSteps) {
      assert.match(
        step(name),
        /env:\s*\n\s+GH_TOKEN:\s*\n\s+\$\{\{\s+secrets\.RELEASE_TOKEN\s+\|\|\s+secrets\.ORG_TOKEN\s+\|\|\s+secrets\.GITHUB_TOKEN\s+\}\}/
      )
    }

    const lifecycle = [
      'Stage immutable Windows-only GitHub Release draft',
      'Verify draft target and assets before publication',
      'Publish verified Windows release',
      'Verify published target and assets',
      'Finalize exact workflow timing in release notes',
      'Reconcile this release as Latest',
      'Verify Latest and final release notes',
      'Remove failed release and reconcile Latest',
    ]
    for (let index = 1; index < lifecycle.length; index++) {
      assert.ok(
        publishJob.indexOf(lifecycle[index - 1]) <
          publishJob.indexOf(lifecycle[index])
      )
    }

    const publishRelease = step('Publish verified Windows release')
    assert.match(publishRelease, /-F draft=false/)
    assert.match(publishRelease, /-f make_latest=false/)
    assert.doesNotMatch(publishRelease, /promote-current-release/)

    const stageRelease = step(
      'Stage immutable Windows-only GitHub Release draft'
    )
    assert.ok(
      stageRelease.indexOf('staging_attempted=true') <
        stageRelease.indexOf('gh release create')
    )
    assert.match(stageRelease, /draft_rows=\(\)/)
    assert.match(stageRelease, /"\$\{#draft_rows\[@\]\}" -ne 1/)
    assert.match(stageRelease, /draft_target.*RELEASE_TARGET_SHA/s)

    const verifyPublished = step('Verify published target and assets')
    assert.match(verifyPublished, /\.target_commitish/)
    assert.match(verifyPublished, /Published Windows release is missing/)
    assert.match(verifyPublished, /refs\/tags\/\$RELEASE_TAG\^\{commit\}/)
    assert.match(
      verifyPublished,
      /Release became Latest before its exact timing notes were verified/
    )

    const finalizeTiming = step(
      'Finalize exact workflow timing in release notes'
    )
    assert.match(
      finalizeTiming,
      /select\(\.name == "Publish verified Windows release"\)/
    )
    assert.doesNotMatch(finalizeTiming, /Reconcile this release as Latest/)
    assert.match(finalizeTiming, /gh release edit "\$RELEASE_TAG"/)
    assert.match(
      finalizeTiming,
      /Workflow started:[\s\S]*?Workflow completed:[\s\S]*?Workflow duration:/
    )
    assert.match(
      finalizeTiming,
      /Release became Latest before its exact timing notes were verified/
    )

    const reconcileLatest = step('Reconcile this release as Latest')
    assert.match(reconcileLatest, /id: reconcile_latest/)
    assert.match(
      promotionScript,
      /GITHUB_OUTPUT[\s\S]*?selected_tag=%s[\s\S]*?selected_sha=%s/
    )

    const verifyLatest = step('Verify Latest and final release notes')
    assert.match(verifyLatest, /steps\.reconcile_latest\.outputs\.selected_tag/)
    assert.match(verifyLatest, /steps\.reconcile_latest\.outputs\.selected_sha/)
    assert.match(verifyLatest, /expected reconciled winner/)
    assert.doesNotMatch(
      verifyLatest,
      /Latest release is \$latest, expected \$RELEASE_TAG/
    )

    const cleanup = step('Remove failed release and reconcile Latest')
    assert.match(
      cleanup,
      /steps\.draft_release\.outputs\.staging_attempted == 'true'/
    )
    assert.match(cleanup, /steps\.finalize_timing\.outcome != 'success'/)
    assert.match(cleanup, /FAILED_RELEASE_ID:/)
    assert.match(cleanup, /--cleanup-failed-release/)
  })

  it('cleans an orphan draft when creation succeeds but ID lookup fails', () => {
    const targetSha = 'a'.repeat(40)
    const result = runReleaseLifecycleHarness({
      args: ['--cleanup-failed-release'],
      env: {
        FAILED_RELEASE_ID: '',
        RELEASE_TAG: 'v-orphan-draft',
        RELEASE_TARGET_SHA: targetSha,
      },
      gh: `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\n' "$*" >> "$MOCK_LOG"
if [[ "$*" == *"--method DELETE"*"/releases/321"* ]]; then
  exit 0
fi
if [[ "$*" == *"/releases/321"* ]]; then
  printf '321\t%s\t%s\n' "$RELEASE_TAG" "$RELEASE_TARGET_SHA"
  exit 0
fi
if [[ "$*" == *"releases?per_page=100"* ]]; then
  count=0
  [ -f "$MOCK_LOG.count" ] && count=$(cat "$MOCK_LOG.count")
  count=$((count + 1))
  printf '%s\n' "$count" > "$MOCK_LOG.count"
  if [ "$count" -eq 1 ]; then
    printf '321\t%s\t%s\n' "$RELEASE_TAG" "$RELEASE_TARGET_SHA"
  fi
  exit 0
fi
exit 1
`,
      git: `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "$MOCK_LOG"
if [ "$1" = 'ls-remote' ]; then
  exit 2
fi
exit 1
`,
    })

    assert.equal(result.status, 0, `${result.stderr}\n${result.calls}`)
    assert.match(
      result.calls,
      /gh api --method DELETE repos\/Ding-Ding-Projects\/desktop-material\/releases\/321/
    )
    assert.doesNotMatch(result.calls, /git\/refs\/tags\/v-orphan-draft/)
  })

  it('refuses cleanup when the release identity changes before deletion', () => {
    const targetSha = 'a'.repeat(40)
    const changedSha = 'b'.repeat(40)
    const result = runReleaseLifecycleHarness({
      args: ['--cleanup-failed-release'],
      env: {
        FAILED_RELEASE_ID: '321',
        MOCK_CHANGED_SHA: changedSha,
        RELEASE_TAG: 'v-identity-race',
        RELEASE_TARGET_SHA: targetSha,
      },
      gh: `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\n' "$*" >> "$MOCK_LOG"
if [[ "$*" == *"--method DELETE"* ]]; then
  exit 99
fi
if [[ "$*" == *"/releases/321"* ]]; then
  printf '321\t%s\t%s\n' "$RELEASE_TAG" "$MOCK_CHANGED_SHA"
  exit 0
fi
if [[ "$*" == *"releases?per_page=100"* ]]; then
  printf '321\t%s\t%s\n' "$RELEASE_TAG" "$RELEASE_TARGET_SHA"
  exit 0
fi
exit 1
`,
      git: `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "$MOCK_LOG"
exit 99
`,
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /identity changed before cleanup/)
    assert.doesNotMatch(result.calls, /--method DELETE/)
  })

  it('retains a superseded release and outputs the newer Latest winner', () => {
    const releaseSha = 'a'.repeat(40)
    const newerSha = 'b'.repeat(40)
    const mainSha = 'c'.repeat(40)
    const result = runReleaseLifecycleHarness({
      env: {
        MOCK_MAIN_SHA: mainSha,
        MOCK_NEWER_SHA: newerSha,
        RELEASE_TAG: 'v-current-run',
        RELEASE_TARGET_SHA: releaseSha,
      },
      gh: `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\n' "$*" >> "$MOCK_LOG"
if [[ "$*" == *"--method DELETE"* ]]; then
  exit 99
fi
if [[ "$*" == *"releases/tags/v-current-run"*".prerelease"* ]]; then
  printf 'false\n'
  exit 0
fi
if [[ "$*" == *"releases?per_page=100"* ]]; then
  count=0
  [ -f "$MOCK_LOG.list-count" ] && count=$(cat "$MOCK_LOG.list-count")
  count=$((count + 1))
  printf '%s\n' "$count" > "$MOCK_LOG.list-count"
  printf 'v-current-run\n'
  if [ "$count" -ge 2 ]; then
    printf 'v-newer-release\n'
  fi
  exit 0
fi
if [[ "$*" == *"releases/latest"* ]]; then
  if [ -f "$MOCK_LOG.latest" ]; then
    cat "$MOCK_LOG.latest"
  else
    printf 'v-before\n'
  fi
  exit 0
fi
if [[ "$*" == *"releases/tags/v-current-run"* ]]; then
  printf '101\n'
  exit 0
fi
if [[ "$*" == *"releases/tags/v-newer-release"* ]]; then
  printf '102\n'
  exit 0
fi
if [[ "$*" == *"--method PATCH"*"/releases/101"* ]]; then
  printf 'v-current-run\n' > "$MOCK_LOG.latest"
  exit 0
fi
if [[ "$*" == *"--method PATCH"*"/releases/102"* ]]; then
  printf 'v-newer-release\n' > "$MOCK_LOG.latest"
  exit 0
fi
exit 1
`,
      git: `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\n' "$*" >> "$MOCK_LOG"
case "$1" in
  ls-remote)
    printf '%s\trefs/heads/main\n' "$MOCK_MAIN_SHA"
    ;;
  fetch)
    ;;
  merge-base)
    ;;
  rev-parse)
    case "$*" in
      *v-current-run*) printf '%s\n' "$RELEASE_TARGET_SHA" ;;
      *v-newer-release*) printf '%s\n' "$MOCK_NEWER_SHA" ;;
      *) exit 1 ;;
    esac
    ;;
  rev-list)
    case "$*" in
      *"$MOCK_NEWER_SHA"*) printf '20\n' ;;
      *"$RELEASE_TARGET_SHA"*) printf '10\n' ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
`,
    })

    assert.equal(result.status, 0, `${result.stderr}\n${result.calls}`)
    assert.match(result.output, /selected_tag=v-newer-release/)
    assert.match(result.output, new RegExp(`selected_sha=${newerSha}`))
    assert.match(result.calls, /--method PATCH .*\/releases\/102/)
    assert.doesNotMatch(result.calls, /--method DELETE/)
  })

  it('preserves artifacts and publishes a unique immutable release', () => {
    assert.match(workflow, /actions\/upload-artifact@v7/)
    assert.match(workflow, /compression-level: 0/)
    assert.match(workflow, /git ls-remote --exit-code --tags origin/)
    assert.match(workflow, /git show --no-patch/)
    assert.doesNotMatch(workflow, /generate-automated-release-notes\.ts/)
    assert.match(workflow, /gh release create "\$RELEASE_TAG"/)
    assert.match(workflow, /--target "\$RELEASE_TARGET_SHA"/)
    assert.match(workflow, /--latest(?:\r?\n|\s)/)
    assert.match(workflow, /--prerelease=false --latest/)
    assert.doesNotMatch(workflow, /--latest=false/)
    assert.match(workflow, /git rev-parse 'FETCH_HEAD\^\{commit\}'/)
    assert.match(workflow, /needs\.windows_build\.outputs\.artifact_name/)
    assert.match(workflow, /needs\.tui_build\.outputs\.artifact_name/)
    assert.match(
      workflow,
      /windows_build:[\s\S]*?steps\.package\.outputs\.artifact_name/
    )
    assert.match(
      workflow,
      /tui_build:[\s\S]*?steps\.package\.outputs\.artifact_name/
    )
    assert.match(workflow, /install-linux-tui\.sh/)
    assert.match(workflow, /bootstrap-linux-tui\.sh/)
    assert.match(
      workflow,
      /Restore executable bits on downloaded TUI scripts[\s\S]*?chmod 0755 release-payload\/tui\/install-linux-tui\.sh[\s\S]*?release-payload\/tui\/bootstrap-linux-tui\.sh/
    )
    assert.match(
      workflow,
      /Reconcile Latest to the newest main release[\s\S]*?bash \.github\/scripts\/promote-current-release\.sh/
    )
    assert.match(promotionScript, /git ls-remote origin refs\/heads\/main/)
    assert.match(promotionScript, /select_highest_target_tag/)
    assert.match(promotionScript, /reconciled_tag=/)
    assert.match(promotionScript, /-f make_latest=true/)
    assert.match(promotionScript, /-f make_latest=false/)
    // Monotonic reconcile: a superseded-but-on-main release still moves
    // Latest forward, and only a provably off-main Latest may be demoted.
    assert.match(promotionScript, /merge-base --is-ancestor/)
    assert.match(promotionScript, /git rev-list --count/)
    assert.match(workflow, /cancel-in-progress:\s*false/)
  })

  it('uses one Squirrel-monotonic version namespace across release lanes', () => {
    for (const source of [installerWorkflow, workflow]) {
      assert.match(
        source,
        /version=\$\(node script\/release-version\.js create "\$base" "\$GITHUB_RUN_ID" "\$GITHUB_RUN_ATTEMPT"\)/
      )
    }

    assert.doesNotMatch(installerWorkflow, /version="\$\{base\}-b/)
    assert.doesNotMatch(workflow, /version="\$\{base\}-s/)

    const installedLegacySuperExpress = new SemVer('3.6.3-beta3-s000000000201')
    const firstUnifiedRelease = new SemVer('3.6.3-beta3-zadtazjjug')
    const laterUnifiedRelease = new SemVer('3.6.3-beta3-zadtazjjuh')

    assert.ok(firstUnifiedRelease.compare(installedLegacySuperExpress) > 0)
    assert.ok(laterUnifiedRelease.compare(firstUnifiedRelease) > 0)
  })

  it('publishes a RELEASES manifest bounded to the release being built', () => {
    for (const source of [installerWorkflow, windowsBuildAction]) {
      assert.match(
        source,
        /node script\/release-version\.js filter "\$RELEASE_VERSION"[\s\S]*?> release-payload\/installers\/RELEASES/
      )
      // The manifest that seeds the package-copy loop must be the filtered one,
      // so a stale entry can never conjure a mislabelled published asset.
      assert.match(source, /done < release-payload\/installers\/RELEASES/)
      assert.doesNotMatch(source, /cp dist\/RELEASES/)
      assert.doesNotMatch(source, /done < dist\/RELEASES/)
    }
  })

  it('targets release pull requests at the Windows product default branch', () => {
    assert.match(releasePullRequestWorkflow, /--base main/)
    assert.doesNotMatch(releasePullRequestWorkflow, /--base development/)
  })

  it('neutral-skips non-push workflow completions instead of creating a red release run', () => {
    assert.match(
      installerWorkflow,
      /Installer packaging skipped: the completed workflow was not this repository's main push CI\./
    )
    assert.match(
      installerWorkflow,
      /echo "proceed=false" >> "\$GITHUB_OUTPUT"\s+exit 0/
    )
    assert.doesNotMatch(
      installerWorkflow,
      /Installer packaging skipped:[\s\S]{0,240}exit 1/
    )
  })
})
