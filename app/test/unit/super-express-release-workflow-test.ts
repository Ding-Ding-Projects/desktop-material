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
  it('is manual-only and dispatches independent zero-test build lanes', () => {
    assert.match(workflow, /on:\s*\n\s+workflow_dispatch:/)
    assert.doesNotMatch(workflow, /\n\s+(?:push|workflow_run):/)
    assert.match(workflow, /Require a main-branch manual dispatch/)
    assert.match(workflow, /ref: \$\{\{ env\.RELEASE_TARGET_SHA \}\}/)
    assert.match(
      workflow,
      /uses: \.\/\.github\/workflows\/super-express-release-windows\.yml/
    )
    assert.match(
      workflow,
      /uses: \.\/\.github\/workflows\/super-express-release-linux-tui\.yml/
    )
    assert.match(
      workflow,
      /needs:\s*\n\s+- prepare\s*\n\s+- windows\s*\n\s+- tui/
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

    assert.match(windowsWorkflow, /workflow_call:/)
    assert.match(windowsWorkflow, /runs-on: windows-2022/)
    assert.match(windowsWorkflow, /yarn build:prod/)
    assert.match(windowsWorkflow, /yarn package/)
    assert.match(windowsWorkflow, /actions\/upload-artifact@v7/)
    assert.doesNotMatch(
      windowsWorkflow,
      /uv build|pytest|ruff|mypy|yarn test|yarn lint/
    )

    assert.match(tuiWorkflow, /workflow_call:/)
    assert.match(tuiWorkflow, /runs-on: ubuntu-latest/)
    assert.match(tuiWorkflow, /uv build --clear/)
    assert.match(
      tuiWorkflow,
      /uv export --locked --no-dev --no-emit-project --no-hashes/
    )
    assert.match(tuiWorkflow, /install-linux-tui\.sh/)
    assert.match(tuiWorkflow, /bootstrap-linux-tui\.sh/)
    assert.match(tuiWorkflow, /actions\/upload-artifact@v7/)
    assert.doesNotMatch(
      tuiWorkflow,
      /pytest|ruff|mypy|yarn test|yarn lint|generate-parity-contract/
    )
  })

  it('preserves fallback artifacts and publishes a unique immutable release', () => {
    assert.match(workflow, /actions\/upload-artifact@v7/)
    assert.match(workflow, /compression-level: 0/)
    assert.match(workflow, /git ls-remote --exit-code --tags origin/)
    assert.match(workflow, /git show --no-patch/)
    assert.doesNotMatch(workflow, /generate-automated-release-notes\.ts/)
    assert.match(workflow, /gh release create "\$RELEASE_TAG"/)
    assert.match(workflow, /--target "\$RELEASE_TARGET_SHA"/)
    assert.match(workflow, /--latest=false/)
    assert.doesNotMatch(workflow, /^\s+--latest\s*$/m)
    assert.match(workflow, /git rev-parse 'FETCH_HEAD\^\{commit\}'/)
    assert.match(
      workflow,
      /super-express-windows-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(
      workflow,
      /super-express-tui-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(workflow, /install-linux-tui\.sh/)
    assert.match(workflow, /bootstrap-linux-tui\.sh/)
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
    assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/)
  })

  it('uses one Squirrel-monotonic version namespace across release lanes', () => {
    for (const source of [installerWorkflow, workflow]) {
      assert.match(
        source,
        /version=\$\(node script\/release-version\.js create "\$base" "\$GITHUB_RUN_ID"\)/
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
    for (const source of [installerWorkflow, windowsWorkflow]) {
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
})
