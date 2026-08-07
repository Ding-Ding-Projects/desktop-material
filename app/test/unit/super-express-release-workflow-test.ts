import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { SemVer } from 'semver'
import { parse } from 'yaml'

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

interface IWorkflowStep {
  readonly name?: string
  readonly env?: Record<string, unknown>
  readonly run?: string
}

interface IWorkflowJob {
  readonly 'runs-on'?: string[]
  readonly env?: Record<string, unknown>
  readonly steps?: IWorkflowStep[]
}

interface IWorkflowDocument {
  readonly env?: Record<string, unknown>
  readonly jobs?: Record<string, IWorkflowJob>
}

interface ICompositeActionDocument {
  readonly runs?: { readonly steps?: IWorkflowStep[] }
}

const workflowDocument = parse(workflow) as IWorkflowDocument
const windowsWorkflowDocument = parse(windowsWorkflow) as IWorkflowDocument
const tuiWorkflowDocument = parse(tuiWorkflow) as IWorkflowDocument
const installerWorkflowDocument = parse(installerWorkflow) as IWorkflowDocument
const windowsBuildActionDocument = parse(
  windowsBuildAction
) as ICompositeActionDocument
const releaseTokenExpression =
  '${{ secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN }}'

function assertExactRunnerLabels(
  document: IWorkflowDocument,
  expected: Readonly<Record<string, readonly string[]>>
): void {
  const jobs = document.jobs ?? {}
  assert.deepEqual(Object.keys(jobs).sort(), Object.keys(expected).sort())
  for (const [name, labels] of Object.entries(expected)) {
    assert.deepEqual(jobs[name]?.['runs-on'], labels, `${name} runner labels`)
  }
}

function assertExactTokenSteps(
  document: IWorkflowDocument,
  expectedNames: readonly string[]
): void {
  const tokenKeys = new Set(['gh_token', 'github_token'])
  const workflowTokens = Object.keys(document.env ?? {}).filter(key =>
    tokenKeys.has(key.toLowerCase())
  )
  assert.deepEqual(workflowTokens, [])

  const actualNames = new Array<string>()
  for (const [jobName, job] of Object.entries(document.jobs ?? {})) {
    const jobTokens = Object.keys(job.env ?? {}).filter(key =>
      tokenKeys.has(key.toLowerCase())
    )
    assert.deepEqual(
      jobTokens,
      [],
      `${jobName} must not carry a job-wide token`
    )

    for (const step of job.steps ?? []) {
      const tokens = Object.entries(step.env ?? {}).filter(([key]) =>
        tokenKeys.has(key.toLowerCase())
      )
      if (tokens.length === 0) {
        continue
      }
      assert.deepEqual(
        tokens,
        [['GH_TOKEN', releaseTokenExpression]],
        `${step.name ?? 'unnamed step'} must use only the release-token chain`
      )
      actualNames.push(step.name ?? '')
    }
  }

  assert.deepEqual(actualNames, expectedNames)
}

function getWorkflowStepRun(
  document: IWorkflowDocument,
  expectedName: string
): string {
  const matches = Object.values(document.jobs ?? {}).flatMap(job =>
    (job.steps ?? []).filter(step => step.name === expectedName)
  )
  assert.equal(matches.length, 1, `${expectedName} must occur exactly once`)
  return matches[0]?.run ?? ''
}

function getActionStepRun(
  document: ICompositeActionDocument,
  expectedName: string
): string {
  const matches = (document.runs?.steps ?? []).filter(
    step => step.name === expectedName
  )
  assert.equal(matches.length, 1, `${expectedName} must occur exactly once`)
  return matches[0]?.run ?? ''
}

function assertExactActiveVersionStep(
  run: string,
  stepName: string,
  expectedLines: readonly string[]
): void {
  const activeLines = run
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('#'))
  assert.deepEqual(
    activeLines,
    expectedLines,
    `${stepName} must retain its exact rerun-safe active shell program`
  )
}

describe('Super Express Release workflow', () => {
  it('pins every job to its complete custom runner label set', () => {
    const linuxLabels = [
      'self-hosted',
      'Linux',
      'X64',
      'desktop-material-wsl-local',
    ] as const
    const windowsLabels = [
      'self-hosted',
      'Windows',
      'X64',
      'desktop-material-windows-local',
    ] as const

    assertExactRunnerLabels(workflowDocument, {
      prepare: linuxLabels,
      windows_build: windowsLabels,
      tui_build: linuxLabels,
      prepare_publication: linuxLabels,
      publish: linuxLabels,
    })
    assertExactRunnerLabels(windowsWorkflowDocument, {
      build: windowsLabels,
      publish: windowsLabels,
    })
    assertExactRunnerLabels(tuiWorkflowDocument, { build: linuxLabels })
  })

  it('scopes the exact release-token chain to every API step that needs it', () => {
    assertExactTokenSteps(workflowDocument, [
      'Publish immutable GitHub Release',
      'Reconcile Latest to the newest main release',
    ])
    assertExactTokenSteps(windowsWorkflowDocument, [
      'Write Windows release notes',
      'Stage immutable Windows-only GitHub Release draft',
      'Verify draft target and assets before publication',
      'Publish verified Windows release',
      'Verify published target and assets',
      'Finalize exact workflow timing in release notes',
      'Reconcile this release as Latest',
      'Verify Latest and final release notes',
      'Remove failed release and reconcile Latest',
    ])
  })

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
      /GH_TOKEN:\s*\n\s+\$\{\{\s*secrets\.RELEASE_TOKEN\s*\|\|\s*secrets\.ORG_TOKEN\s*\|\|\s*secrets\.GITHUB_TOKEN\s*\}\}/
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

    assert.match(windowsWorkflow, /workflow_call:/)
    assert.match(windowsWorkflow, /workflow_dispatch:/)
    assert.match(windowsWorkflow, /inputs\.release_target_sha \|\| github\.sha/)
    assert.match(windowsBuildAction, /Resolve release package version/)
    assert.match(
      windowsBuildAction,
      /Direct Super Express Windows dispatches must use main/
    )
    assert.match(
      windowsBuildAction,
      /Prefer Git Bash on Windows self-hosted runners[\s\S]*?shell: powershell -NoProfile -ExecutionPolicy Bypass -Command "& '\{0\}'"[\s\S]*?ensure-windows-git-bash\.ps1/
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
      /runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64/
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
    assert.match(tuiWorkflow, /super-express-linux-tui-build/)
    assert.match(tuiBuildAction, /uv python install 3\.12/)
    assert.doesNotMatch(tuiBuildAction, /actions\/setup-python@v7/)
    assert.match(tuiBuildAction, /uv build --clear/)
    assert.match(
      tuiBuildAction,
      /uv export --locked --no-dev --no-emit-project --no-hashes/
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
    assert.match(workflow, /--latest=false/)
    assert.doesNotMatch(workflow, /^\s+--latest\s*$/m)
    assert.match(workflow, /git rev-parse 'FETCH_HEAD\^\{commit\}'/)
    assert.match(
      windowsBuildAction,
      /super-express-windows-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(
      tuiBuildAction,
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
    assertExactActiveVersionStep(
      getWorkflowStepRun(
        installerWorkflowDocument,
        'Stamp cross-lane monotonic release version'
      ),
      'Stamp cross-lane monotonic release version',
      [
        'checked_out=$(git rev-parse HEAD)',
        'if [ "$checked_out" != "$RELEASE_TARGET_SHA" ]; then',
        'echo "Checked-out commit $checked_out does not match $RELEASE_TARGET_SHA." >&2',
        'exit 1',
        'fi',
        'base=$(node -p "require(\'./app/package.json\').version")',
        'version=$(node script/release-version.js create "$base" "${{ github.run_id }}" "${{ github.run_attempt }}")',
        'echo "version=$version" >> "$GITHUB_OUTPUT"',
        'echo "tag=v$version" >> "$GITHUB_OUTPUT"',
      ]
    )
    assertExactActiveVersionStep(
      getWorkflowStepRun(
        workflowDocument,
        'Create a cross-lane monotonic package version'
      ),
      'Create a cross-lane monotonic package version',
      [
        'base=$(node -p "require(\'./app/package.json\').version")',
        'version=$(node script/release-version.js create "$base" "${{ github.run_id }}" "${{ github.run_attempt }}")',
        'echo "version=$version" >> "$GITHUB_OUTPUT"',
        'echo "tag=v$version" >> "$GITHUB_OUTPUT"',
      ]
    )
    assertExactActiveVersionStep(
      getActionStepRun(
        windowsBuildActionDocument,
        'Resolve release package version'
      ),
      'Resolve release package version',
      [
        'if [ -z "$RELEASE_VERSION" ]; then',
        'base=$(node -p "require(\'./app/package.json\').version")',
        'version=$(node script/release-version.js create "$base" "${{ github.run_id }}" "${{ github.run_attempt }}")',
        'echo "RELEASE_VERSION=$version" >> "$GITHUB_ENV"',
        'else',
        'base=$(node -p "require(\'./app/package.json\').version")',
        'node script/release-version.js validate "$RELEASE_VERSION" "$base"',
        'version="$RELEASE_VERSION"',
        'echo "RELEASE_VERSION=$RELEASE_VERSION" >> "$GITHUB_ENV"',
        'fi',
        'echo "release_version=$version" >> "$GITHUB_OUTPUT"',
        'echo "release_tag=v$version" >> "$GITHUB_OUTPUT"',
      ]
    )

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
})
