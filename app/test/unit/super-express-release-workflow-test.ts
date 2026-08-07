import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const releasePullRequestWorkflow = readFileSync(
  join(process.cwd(), '.github/workflows/release-pr.yml'),
  'utf8'
)

describe('Super Express Release workflow', () => {
  it('is manual-only and dispatches self-hosted-only zero-test build lanes', () => {
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
      /GH_TOKEN:\s*\n\s+\$\{\{ secrets\.RELEASE_TOKEN \|\| secrets\.ORG_TOKEN \|\| secrets\.GITHUB_TOKEN\s*\}\}/
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
      /Prefer Git Bash on Windows self-hosted runners[\s\S]*?shell: powershell -NoProfile -ExecutionPolicy Bypass[\s\S]*?GITHUB_PATH/
    )
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
    assert.match(windowsWorkflow, /publish:[\s\S]*?runs-on:\s+ubuntu-latest/)
    assert.match(windowsWorkflow, /gh release create "\$RELEASE_TAG"/)
    assert.match(windowsWorkflow, /--target "\$RELEASE_TARGET_SHA"/)
    assert.match(
      windowsWorkflow,
      /Require the current main tip for a direct release[\s\S]*?shell: pwsh[\s\S]*?git fetch origin main/
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
      /actions\/runs\/\$GITHUB_RUN_ID\/jobs\?per_page=100[\s\S]*?\.jobs\[\]\.started_at[\s\S]*?Reconcile this release as Latest[\s\S]*?\.completed_at/
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
    assert.match(windowsBuildAction, /actions\/upload-artifact@v7/)
    assert.doesNotMatch(
      windowsBuildAction,
      /uv build|pytest|ruff|mypy|yarn test|yarn lint/
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
