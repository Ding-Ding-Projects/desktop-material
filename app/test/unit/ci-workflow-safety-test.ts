import assert from 'node:assert'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'
import { getMockUpdateEndpoint } from '../e2e/mock-update-server'

const root = process.cwd()
// CI is two workflows, one per operating system, so a red terminal test can
// never withhold the desktop installers and a red desktop build can never
// withhold the terminal package. Both still feed the one Release.
const linuxWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'ci-linux.yml'),
  'utf8'
)
const windowsWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'ci-windows.yml'),
  'utf8'
)
const gitmodules = readFileSync(join(root, '.gitmodules'), 'utf8')
const ciWorkflows = [
  { name: 'ci-linux.yml', source: linuxWorkflow },
  { name: 'ci-windows.yml', source: windowsWorkflow },
]
const installerWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'build-installers.yml'),
  'utf8'
)
const superExpressWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'super-express-release.yml'),
  'utf8'
)
const githubCliAction = readFileSync(
  join(root, '.github', 'actions', 'setup-github-cli', 'action.yml'),
  'utf8'
)
const lineCounter = readFileSync(
  join(root, 'script', 'count-lines.mjs'),
  'utf8'
)
const releasePromotionScript = readFileSync(
  join(root, '.github', 'scripts', 'promote-current-release.sh'),
  'utf8'
)
const codeQLWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'codeql.yml'),
  'utf8'
)
const releasePRWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'release-pr.yml'),
  'utf8'
)
const workflowDirectory = join(root, '.github', 'workflows')
const workflowSources = readdirSync(workflowDirectory)
  .filter(file => /\.ya?ml$/.test(file))
  .map(file => ({
    file,
    source: readFileSync(join(workflowDirectory, file), 'utf8'),
  }))
const selfHostedSuperExpressWorkflows = new Set([
  'build-installers.yml',
  'super-express-release.yml',
  'super-express-release-windows.yml',
  'super-express-release-linux-tui.yml',
])
const selfHostedCiWorkflows = new Set(['ci-linux.yml', 'ci-windows.yml'])

describe('CI workflow safety', () => {
  it('does not make hosted CI clone agent-only tooling', () => {
    assert.doesNotMatch(gitmodules, /lowlevel-computer-use-mcp/)
  })

  it('passes the Git trailer format as an argument instead of shell syntax', () => {
    assert.match(lineCounter, /import \{ execFileSync, execSync, spawn \}/)
    assert.match(
      lineCounter,
      /execFileSync\(\s*'git',\s*\[\s*'log',\s*'--format=%H%x01%an%x01%\(trailers:key=Co-Authored-By,valueonly,separator=%x02\)',\s*\]/
    )
    assert.doesNotMatch(lineCounter, /execSync\(\s*['"]git log/)
  })

  it('keeps the static lint install independent of native lifecycle scripts', () => {
    const lintJob = linuxWorkflow.match(
      /\r?\n  lint:\r?\n([\s\S]*?)(?=\r?\n  [a-z-]+:\r?\n)/
    )
    assert.notEqual(lintJob, null)
    assert.match(
      lintJob?.[1] ?? '',
      /yarn install --frozen-lockfile --ignore-scripts --non-interactive/
    )
  })

  it('installs Node before the self-hosted Linux TUI invokes Node', () => {
    const tuiJob = linuxWorkflow.match(
      /\r?\n  linux-tui:\r?\n([\s\S]*?)(?=\r?\n  [a-z-]+:\r?\n|$)/
    )
    assert.notEqual(tuiJob, null)
    const source = tuiJob?.[1] ?? ''
    assert.match(source, /uses: actions\/setup-node@v7/)
    assert.match(source, /node-version: \$\{\{ env\.NODE_VERSION \}\}/)
    assert.match(source, /node tui\/tools\/generate-parity-contract\.mjs/)
  })

  it('uses one configurable loopback endpoint for the E2E build and server', () => {
    assert.deepEqual(getMockUpdateEndpoint('http://127.0.0.1:43123/update'), {
      host: '127.0.0.1',
      port: 43123,
      origin: 'http://127.0.0.1:43123',
      updateURL: 'http://127.0.0.1:43123/update',
      controlURL: 'http://127.0.0.1:43123/_control',
    })
    assert.match(
      windowsWorkflow,
      /uses: \.\/\.github\/actions\/setup-e2e-update-port/
    )
    for (const { name, source } of ciWorkflows) {
      assert.doesNotMatch(source, /127\.0\.0\.1:51789/, name)
    }
  })

  it('rejects unsafe or ambiguous E2E update endpoints', () => {
    for (const value of [
      'https://127.0.0.1:43123/update',
      'http://localhost:43123/update',
      'http://127.0.0.1/update',
      'http://user:secret@127.0.0.1:43123/update',
      'http://127.0.0.1:43123/other',
    ]) {
      assert.throws(() => getMockUpdateEndpoint(value))
    }
  })

  it('publishes once after automatic CI or parallel express gates succeed', () => {
    assert.match(installerWorkflow, /workflow_run:/)
    assert.match(
      installerWorkflow,
      /workflows:\s*\n\s*- CI Linux\s*\n\s*- CI Windows/
    )
    assert.doesNotMatch(installerWorkflow, /^  push:/m)
    assert.match(installerWorkflow, /CI_CONCLUSION.*workflow_run\.conclusion/)
    assert.match(installerWorkflow, /CI_CONCLUSION" = "success"/)
    assert.match(
      installerWorkflow,
      /packaging an artifact but blocking Release publication/
    )
    assert.match(
      installerWorkflow,
      /needs\.prepare\.outputs\.publish == 'true'/
    )
    const tuiPackageJob = installerWorkflow.match(
      /\r?\n  tui_package:\r?\n([\s\S]*?)(?=\r?\n  [a-z_]+:\r?\n)/
    )
    assert.notEqual(tuiPackageJob, null)
    // Each packaging job answers to its own lane, and the publisher is
    // elected so the pair still produces exactly one Release per commit.
    assert.match(
      tuiPackageJob?.[1] ?? '',
      /needs\.prepare\.outputs\.publish == 'true' &&\s*needs\.prepare\.outputs\.linux_ok\s*== 'true'/
    )
    assert.match(
      installerWorkflow,
      /needs\.prepare\.outputs\.proceed == 'true' &&\s*needs\.prepare\.outputs\.windows_ok == 'true'/
    )
    assert.match(
      installerWorkflow,
      /it will publish this commit once it finishes/
    )
    assert.match(installerWorkflow, /finished later; it publishes this commit/)
    // A Release still happens when one lane is red — missing its half, and
    // saying so — but never when both are.
    assert.match(
      installerWorkflow,
      /needs\.package\.result == 'success' \|\|\s*needs\.tui_package\.result == 'success'/
    )
    assert.match(installerWorkflow, /## Partial release/)
    assert.match(installerWorkflow, /name: Express lint/)
    assert.match(installerWorkflow, /name: Express tests Windows x64/)
    assert.match(
      installerWorkflow,
      /name: Run unit tests[\s\S]*?yarn test:unit/
    )
    assert.match(
      installerWorkflow,
      /name: Run script tests[\s\S]*?yarn test:script/
    )
    assert.match(
      installerWorkflow,
      /needs\.lint\.result == 'success' && needs\.test\.result == 'success'/
    )
    assert.match(installerWorkflow, /DISPATCH_REF: \$\{\{ github\.ref \}\}/)
    assert.match(installerWorkflow, /DISPATCH_REF" != "refs\/heads\/main"/)
    assert.match(installerWorkflow, /publish="\$ci_can_publish"/)
    assert.match(
      installerWorkflow,
      /bash \.github\/scripts\/promote-current-release\.sh/
    )
    assert.match(
      releasePromotionScript,
      /git ls-remote origin refs\/heads\/main/
    )
    // Latest is reconciled monotonically: a release whose build outlived a
    // push to main still moves Latest forward along main, a commit that is
    // not on main can never own Latest, and a demotion requires proof that
    // the current Latest is off main — never a failed release listing.
    assert.match(releasePromotionScript, /merge-base --is-ancestor/)
    assert.match(
      releasePromotionScript,
      /is not on main; it will not own Latest/
    )
    assert.match(
      releasePromotionScript,
      /No promotable release in the newest page; leaving Latest untouched/
    )
    assert.doesNotMatch(installerWorkflow, /softprops\/action-gh-release/)
    assert.equal(
      installerWorkflow.match(/gh release create "\$RELEASE_TAG"/g)?.length,
      1
    )
    assert.match(installerWorkflow, /actions\/upload-artifact@v7/)
    assert.match(installerWorkflow, /compression-level: 0/)
    assert.match(
      installerWorkflow,
      /required=\([\s\S]*?"release-payload\/installers\/GitHub Desktop-x64\.zip"/
    )
    assert.match(installerWorkflow, /fetch-depth: 0/)
    assert.match(
      installerWorkflow,
      /Generate bounded exact-SHA release notes[\s\S]*?generate-automated-release-notes\.ts[\s\S]*?--release-sha "\$RELEASE_TARGET_SHA"/
    )
    // The notes no longer trail the installers: they describe the commit, not
    // a platform, so they are built off both lanes and a red Windows lane no
    // longer takes them down with the installers. What still has to hold is
    // that each stage is ordered within itself, and that publishing comes last.
    assert.match(
      installerWorkflow,
      /Generate bounded exact-SHA release notes[\s\S]*?Preserve exact release notes/
    )
    assert.match(
      installerWorkflow,
      /Verify required release assets[\s\S]*?Preserve express installer payload/
    )
    assert.match(
      installerWorkflow,
      /Revalidate immutable release tag before publishing[\s\S]*?Verify downloaded release payload[\s\S]*?Publish GitHub release[\s\S]*?Verify published release target[\s\S]*?Reconcile Latest to the newest main release/
    )
    assert.match(
      installerWorkflow,
      /--notes-file release-payload\/release-notes\.md/
    )
    assert.doesNotMatch(installerWorkflow, /--fail-on-no-commits/)
    assert.match(
      installerWorkflow,
      /permissions:\s*\n\s*actions: read\s*\n\s*contents: read/
    )
    assert.match(
      installerWorkflow,
      /block_reason: \$\{\{ steps\.target\.outputs\.block_reason \}\}/
    )
    assert.match(installerWorkflow, /block_reason=ci-failed/)
    assert.doesNotMatch(installerWorkflow, /block_reason=stale/)
    assert.doesNotMatch(installerWorkflow, /Record stale non-publishing result/)
    assert.doesNotMatch(installerWorkflow, /became stale while building/)
    assert.doesNotMatch(installerWorkflow, /group: build-installers-publisher/)
    assert.match(
      installerWorkflow,
      /Publish GitHub release[\s\S]*?gh release create[\s\S]*?--latest=false/
    )
    assert.doesNotMatch(installerWorkflow, /^\s+--latest\s*$/m)
    assert.match(releasePromotionScript, /select_highest_target_tag/)
    assert.match(releasePromotionScript, /index\("RELEASES"\) != null/)
    assert.match(releasePromotionScript, /endswith\("-full\.nupkg"\)/)
    assert.match(releasePromotionScript, /-f make_latest=true/)
    assert.match(releasePromotionScript, /-f make_latest=false/)
    assert.match(
      releasePromotionScript,
      /current_main_after=\$\(resolve_main\)/
    )
    assert.match(
      releasePromotionScript,
      /reconciled_tag=\$\(reconcile_once "\$current_main_after"\)/
    )
    assert.match(releasePromotionScript, /releases\/latest/)

    const upstreamFailureStep = installerWorkflow.match(
      /- name: Preserve the upstream CI failure result([\s\S]*?)(?=\n      - name:|\n  publish:)/
    )
    assert.notEqual(upstreamFailureStep, null)
    assert.match(
      upstreamFailureStep?.[1] ?? '',
      /if: needs\.prepare\.outputs\.block_reason == 'ci-failed'/
    )
    assert.match(upstreamFailureStep?.[1] ?? '', /exit 1/)

    assert.doesNotMatch(installerWorkflow, /^\s+body: \|/m)
  })

  it('cancels prior trusted CI runs and scopes self-hosted cancellation', () => {
    // CI is trusted push/manual/workflow-call automation. It deliberately has
    // no pull_request trigger because every CI job now runs self-hosted.
    for (const { name, source } of ciWorkflows) {
      assert.match(source, /on:\s*\n\s*push:\s*\n/, name)
      assert.match(source, /workflow_dispatch:/, name)
      assert.doesNotMatch(source, /\n\s+pull_request:/, name)
      assert.match(source, /cancel-in-progress: true/, name)
      assert.match(source, /repository:\s*\n\s*default:\s*''/, name)
      assert.equal(
        source.match(
          /github\.repository == 'Ding-Ding-Projects\/desktop-material'/g
        )?.length,
        3,
        `${name} must guard every self-hosted job against external callers`
      )
    }
    assert.match(linuxWorkflow, /group: ci-linux-\$\{\{ github\.ref \}\}/)
    assert.match(windowsWorkflow, /group: ci-windows-\$\{\{ github\.ref \}\}/)

    for (const required of [
      'ci-linux.yml',
      'ci-windows.yml',
      'build-installers.yml',
      'pages.yml',
    ]) {
      const workflow = workflowSources.find(({ file }) => file === required)
      assert.notEqual(workflow, undefined, `${required} must exist`)
      assert.match(
        workflow?.source ?? '',
        /^concurrency:/m,
        `${required} must declare its independent concurrency contract`
      )
    }

    for (const { file, source } of workflowSources) {
      if (
        selfHostedSuperExpressWorkflows.has(file) ||
        selfHostedCiWorkflows.has(file)
      ) {
        assert.match(
          source,
          /cancel-in-progress:\s*true/,
          `${file} may cancel an older trusted self-hosted run`
        )
        assert.match(
          source,
          /^  group: (?:ci-(?:linux|windows)-|super-express-release)[^\r\n]*\$\{\{ github\.ref \}\}\s*$/m,
          `${file} must scope cancellation to the dispatched ref`
        )
        continue
      }
      assert.doesNotMatch(
        source,
        /cancel-in-progress:\s*true/,
        `${file} must not cancel an older in-progress workflow run`
      )

      if (/^concurrency:/m.test(source)) {
        assert.match(
          source,
          /^\s+cancel-in-progress:\s*false$/m,
          `${file} concurrency must preserve the older run`
        )
        assert.match(
          source,
          /^  group: [^\r\n]*\$\{\{ github\.run_id \}\}[^\r\n]*\$\{\{ github\.run_attempt \}\}\s*$/m,
          `${file} must use a unique run-and-attempt concurrency group so GitHub cannot replace older pending work`
        )
      }
    }
  })

  it('keeps every Express Release job on the registered self-hosted pool', () => {
    assert.doesNotMatch(
      installerWorkflow,
      /(?:ubuntu-latest|windows-2022|macos-[A-Za-z0-9.]+)/i
    )
    assert.match(
      installerWorkflow,
      /^  group: super-express-release-\$\{\{ github\.ref \}\}$/m
    )
    assert.match(installerWorkflow, /cancel-in-progress:\s*true/)
    assert.equal(
      installerWorkflow.match(
        /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/g
      )?.length,
      5
    )
    assert.equal(
      installerWorkflow.match(
        /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64/g
      )?.length,
      2
    )
  })

  it('bootstraps GitHub CLI before self-hosted release API calls', () => {
    assert.match(githubCliAction, /default: '2\.97\.0'/)
    assert.match(
      githubCliAction,
      /cli\/cli\/releases\/download\/v\$\{GH_CLI_VERSION\}/
    )
    assert.match(githubCliAction, /sha256sum -c -/)
    assert.match(
      installerWorkflow,
      /ref: main[\s\S]*?setup-github-cli[\s\S]*?Require a successful main CI/
    )
    assert.match(
      installerWorkflow,
      /ref: \$\{\{ needs\.prepare\.outputs\.sha \}\}[\s\S]*?setup-github-cli[\s\S]*?actions\/setup-node@v7/
    )
    assert.match(
      superExpressWorkflow,
      /ref: \$\{\{ needs\.prepare\.outputs\.sha \}\}[\s\S]*?setup-github-cli[\s\S]*?actions\/setup-node@v7/
    )
  })

  it('builds, packages, and exercises the Windows application only', () => {
    assert.doesNotMatch(windowsWorkflow, /windows-2022|ubuntu-latest/)
    assert.match(windowsWorkflow, /arch: \[x64, arm64\]/)
    assert.match(windowsWorkflow, /friendlyName: Windows/)
    assert.match(windowsWorkflow, /Install app on Windows/)
    assert.match(
      windowsWorkflow,
      /Enable Git long paths for Windows TUI tests\s+run: git config core\.longpaths true/
    )
    assert.match(
      windowsWorkflow,
      /defaults:\s+run:\s+shell: powershell -NoProfile -ExecutionPolicy Bypass -Command \"\. '\{0\}'\"/
    )
    assert.doesNotMatch(windowsWorkflow, /shell: pwsh/)
    assert.equal(
      windowsWorkflow.match(
        /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64/g
      )?.length,
      3
    )
    assert.doesNotMatch(linuxWorkflow, /windows-2022|ubuntu-latest/)
    assert.equal(
      linuxWorkflow.match(
        /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Linux\s*\n\s+- X64/g
      )?.length,
      3
    )
    for (const { name, source } of ciWorkflows) {
      assert.doesNotMatch(source, /macos|APPLE_/i, name)
    }
  })

  it('preserves Windows installers when normal CI tests fail', () => {
    const windowsBuildJob = windowsWorkflow.match(
      /\r?\n  build:\r?\n([\s\S]*?)(?=\r?\n  e2e-smoke:\r?\n)/
    )
    assert.notEqual(windowsBuildJob, null)
    const source = windowsBuildJob?.[1] ?? ''

    assert.match(
      source,
      /name: Build production app\s+id: production_build\s+if: \$\{\{ always\(\) && steps\.setup_ci\.outcome == 'success' \}\}/
    )
    assert.match(
      source,
      /uses: \.\/\.github\/actions\/setup-windows-signing\s+id: windows_signing\s+if: \$\{\{ always\(\) && steps\.production_build\.outcome == 'success' \}\}/
    )
    assert.match(
      source,
      /name: Package production app\s+id: installer_package\s+if:[\s\S]*?always\(\) && steps\.production_build\.outcome == 'success' &&[\s\S]*?steps\.windows_signing\.outcome == 'success'/
    )
    assert.match(
      source,
      /name: Upload artifacts[\s\S]*?if:[\s\S]*?always\(\) && steps\.installer_package\.outcome == 'success' &&[\s\S]*?github\.event_name != 'workflow_call' \|\| inputs\.upload-artifacts/
    )
    assert.match(source, /dist\/GitHubDesktopSetup-\$\{\{matrix\.arch\}\}\.exe/)
    assert.match(source, /if-no-files-found: error/)

    const e2eJob = windowsWorkflow.match(
      /\r?\n  e2e-smoke:\r?\n([\s\S]*?)(?=\r?\n  [a-z-]+:\r?\n|$)/
    )
    assert.notEqual(e2eJob, null)
    const e2eSource = e2eJob?.[1] ?? ''
    assert.match(
      e2eSource,
      /Start-Process -FilePath \$setupExe -ArgumentList "\/S" -PassThru -Wait/
    )
    assert.match(e2eSource, /\$installer\.ExitCode -ne 0/)
    assert.match(e2eSource, /app-\$expectedVersion\\GitHubDesktop\.exe/)
    assert.match(e2eSource, /LastWriteTimeUtc -ge \$installStartedAt/)
  })

  it('scans the real default branch and supports manual dispatch', () => {
    assert.match(codeQLWorkflow, /push:\s*\n\s*branches: \['main'\]/)
    assert.match(codeQLWorkflow, /pull_request:\s*\n\s*branches: \['main'\]/)
    assert.match(codeQLWorkflow, /workflow_dispatch:/)
    assert.doesNotMatch(codeQLWorkflow, /development/)
  })

  it('uses the supported GitHub App token input for release pull requests', () => {
    assert.match(releasePRWorkflow, /uses: actions\/create-github-app-token@v3/)
    assert.match(
      releasePRWorkflow,
      /permissions:\s*\n\s*contents: read\s*\n\s*pull-requests: write/
    )
    assert.match(
      releasePRWorkflow,
      /app-id: \$\{\{ secrets\.DESKTOP_RELEASES_APP_ID \}\}/
    )
    assert.doesNotMatch(releasePRWorkflow, /client-id:/)
  })

  it('fails closed unless the immutable tag query proves no match', () => {
    assert.equal(
      installerWorkflow.match(/^\s+status=\$\?$/gm)?.length,
      2,
      'tag absence must be checked before the build and again before publish'
    )
    assert.equal(
      installerWorkflow.match(
        /Unable to prove release tag \$tag is absent \(git ls-remote exited \$status\)/g
      )?.length,
      2
    )
    assert.match(installerWorkflow, /Release tag \$tag appeared while building/)
    assert.match(
      installerWorkflow,
      /Revalidate immutable release tag before publishing[\s\S]*?Publish GitHub release/
    )
  })
})
