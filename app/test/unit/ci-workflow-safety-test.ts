import assert from 'node:assert'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'
import { parse } from 'yaml'
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
const superExpressWindowsWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'super-express-release-windows.yml'),
  'utf8'
)
const superExpressLinuxTuiWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'super-express-release-linux-tui.yml'),
  'utf8'
)
const superExpressWindowsBuildAction = readFileSync(
  join(root, '.github', 'actions', 'super-express-windows-build', 'action.yml'),
  'utf8'
)
const packageScript = readFileSync(join(root, 'script', 'package.ts'), 'utf8')
const productionWebpackRunner = readFileSync(
  join(root, 'script', 'run-webpack-production.mjs'),
  'utf8'
)
const githubCliAction = readFileSync(
  join(root, '.github', 'actions', 'setup-github-cli', 'action.yml'),
  'utf8'
)
const githubCliBootstrap = readFileSync(
  join(root, '.github', 'scripts', 'ensure-github-cli.sh'),
  'utf8'
)
const setupCiAction = readFileSync(
  join(root, '.github', 'actions', 'setup-ci-environment', 'action.yml'),
  'utf8'
)
const selfHostedWindowsJobInventoryPath = join(
  root,
  'script',
  'self-hosted-windows-job-inventory.json'
)
const selfHostedWindowsJobInventory = JSON.parse(
  readFileSync(selfHostedWindowsJobInventoryPath, 'utf8')
) as {
  version: number
  releaseBootstrapComponents: ReadonlyArray<string>
  jobs: ReadonlyArray<{
    workflow: string
    job: string
    dependencyInventory: string
    bootstrap: string
    bootstrapComponents?: ReadonlyArray<string>
    coldBootstrapTest: string
  }>
}
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
  'super-express-release.yml',
  'super-express-release-windows.yml',
  'super-express-release-linux-tui.yml',
])
const windowsDesktopRunnerExpression =
  "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.runner_mode == 'self-hosted' && fromJSON('[\"self-hosted\",\"Windows\",\"X64\",\"desktop-material-windows-local\"]') || 'windows-2022' }}"

interface IWorkflowStep {
  id?: string
  if?: string
  name?: string
  run?: string
  shell?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, unknown>
  'continue-on-error'?: boolean
}

interface IWorkflowJob {
  'runs-on'?: string | string[]
  defaults?: { run?: { shell?: string } }
  env?: Record<string, unknown>
  permissions?: Record<string, string>
  steps?: IWorkflowStep[]
}

interface IWorkflowDocument {
  env?: Record<string, unknown>
  jobs?: Record<string, IWorkflowJob>
  permissions?: Record<string, string>
}

interface ICompositeActionDocument {
  runs?: { steps?: IWorkflowStep[] }
}

const windowsWorkflowDocument = parse(windowsWorkflow) as IWorkflowDocument
const linuxWorkflowDocument = parse(linuxWorkflow) as IWorkflowDocument
const installerWorkflowDocument = parse(installerWorkflow) as IWorkflowDocument
const superExpressWorkflowDocument = parse(
  superExpressWorkflow
) as IWorkflowDocument
const setupCiActionDocument = parse(setupCiAction) as ICompositeActionDocument

function getJob(workflow: IWorkflowDocument, name: string): IWorkflowJob {
  const job = workflow.jobs?.[name]
  assert.notEqual(job, undefined, `workflow job ${name} must exist`)
  return job ?? {}
}

function getNamedStep(job: IWorkflowJob, name: string): IWorkflowStep {
  const step = job.steps?.find(candidate => candidate.name === name)
  assert.notEqual(step, undefined, `workflow step ${name} must exist`)
  return step ?? {}
}

function assertJobRunsOn(
  workflow: IWorkflowDocument,
  jobName: string,
  expectedRunner: string
): void {
  assert.equal(
    getJob(workflow, jobName)['runs-on'],
    expectedRunner,
    `${jobName} must run on ${expectedRunner}`
  )
}

function getSelfHostedJobNames(workflow: IWorkflowDocument): string[] {
  return Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => {
      const runners = Array.isArray(job['runs-on'])
        ? job['runs-on']
        : [job['runs-on']]
      return runners.includes('self-hosted')
    })
    .map(([name]) => name)
}

function assertWindowsBootstrapBeforeTrueCheckout(
  workflow: IWorkflowDocument,
  jobName: string,
  expectedCondition?: string
): void {
  const steps = getJob(workflow, jobName).steps ?? []
  const initialCheckout = steps[0]
  const bootstrap = steps[1]
  const repeatedCheckout = steps[2]

  assert.equal(initialCheckout.name, 'Initial checkout for Windows bootstrap')
  assert.equal(initialCheckout.uses, 'actions/checkout@v7.0.1')
  assert.equal(bootstrap.name, 'Bootstrap Git and Bash for self-hosted Windows')
  assert.equal(bootstrap.shell, 'cmd')
  assert.equal(
    bootstrap.run,
    '%GITHUB_WORKSPACE%\\.github\\scripts\\ensure-windows-git-bash.cmd'
  )
  assert.equal(repeatedCheckout.name, 'Repeat checkout with bootstrapped Git')
  assert.equal(repeatedCheckout.uses, 'actions/checkout@v7.0.1')
  assert.deepEqual(repeatedCheckout.with ?? {}, initialCheckout.with ?? {})
  assert.equal(bootstrap['if'], expectedCondition)
  assert.equal(repeatedCheckout['if'], expectedCondition)
}

function assertNoCaseInsensitiveEnvKey(
  env: Record<string, unknown> | undefined,
  key: string
): void {
  assert.equal(
    Object.keys(env ?? {}).some(candidate => candidate.toLowerCase() === key),
    false,
    `${key} must not be set through differently cased environment syntax`
  )
}

function getCaseInsensitiveEnvValue(
  env: Record<string, unknown> | undefined,
  key: string
): unknown {
  return Object.entries(env ?? {}).find(
    ([candidate]) => candidate.toLowerCase() === key
  )?.[1]
}

function assertReleasePublisherLeastPrivilege(
  workflow: IWorkflowDocument,
  publishStepName: string
): void {
  const releaseTokenExpression =
    '${{ secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN }}'
  const preparation = getJob(workflow, 'prepare_publication')
  const publisher = getJob(workflow, 'publish')

  assert.equal(preparation.permissions?.contents, 'read')
  assert.equal(publisher.permissions?.contents, 'write')

  for (const [jobName, job] of [
    ['prepare_publication', preparation],
    ['publish', publisher],
  ] as const) {
    assertNoCaseInsensitiveEnvKey(job.env, 'gh_token')
    assertNoCaseInsensitiveEnvKey(job.env, 'github_token')

    const checkouts = (job.steps ?? []).filter(step =>
      step.uses?.startsWith('actions/checkout@')
    )
    assert.notEqual(
      checkouts.length,
      0,
      `${jobName} must explicitly configure its checkout credentials`
    )
    for (const checkout of checkouts) {
      assert.equal(
        checkout.with?.['persist-credentials'],
        false,
        `${jobName} checkout must not persist credentials`
      )
    }
  }

  const mutationSteps = new Set([
    publishStepName,
    'Reconcile Latest to the newest main release',
  ])
  for (const step of publisher.steps ?? []) {
    const releaseToken = getCaseInsensitiveEnvValue(step.env, 'gh_token')
    if (mutationSteps.has(step.name ?? '')) {
      assert.equal(
        releaseToken,
        releaseTokenExpression,
        `${step.name} must use the release-token fallback chain`
      )
    } else {
      assert.equal(
        releaseToken,
        undefined,
        `${
          step.name ?? step.uses ?? 'unnamed step'
        } must not receive the release token`
      )
    }
  }
}

function assertDoesNotPersistNodeOptions(
  steps: IWorkflowStep[],
  owner: string
): void {
  for (const step of steps) {
    assertNoCaseInsensitiveEnvKey(step.env, 'node_options')
    assert.doesNotMatch(
      step.run ?? '',
      /node_options[\s\S]*github_env|github_env[\s\S]*node_options/i,
      `${owner} must not persist NODE_OPTIONS`
    )
  }
}

function assertHarnessOwnsWorkerMemory(
  workflow: IWorkflowDocument,
  jobName: string
): void {
  const job = getJob(workflow, jobName)
  const steps = job.steps ?? []
  const unitTestIndex = steps.findIndex(step => step.name === 'Run unit tests')
  assert.notEqual(unitTestIndex, -1, `${jobName} must run unit tests`)
  const unitTestStep = steps[unitTestIndex]

  assertNoCaseInsensitiveEnvKey(workflow.env, 'node_options')
  assertNoCaseInsensitiveEnvKey(job.env, 'node_options')
  assertNoCaseInsensitiveEnvKey(unitTestStep.env, 'node_options')
  assert.equal(unitTestStep.run, 'yarn test:unit')
  assertDoesNotPersistNodeOptions(
    steps.slice(0, unitTestIndex),
    `${jobName} before unit tests`
  )
  assertDoesNotPersistNodeOptions(
    setupCiActionDocument.runs?.steps ?? [],
    'setup-ci-environment'
  )
}

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

  it('keeps non-fatal submodule updates shell-neutral', () => {
    let guardedStepCount = 0

    for (const { file, source } of workflowSources) {
      const workflow = parse(source) as IWorkflowDocument
      for (const job of Object.values(workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (step.name !== 'Attempt to update submodules (non-fatal)') {
            continue
          }

          guardedStepCount += 1
          assert.equal(
            step['continue-on-error'],
            true,
            `${file} must make the complete submodule attempt non-fatal`
          )
          assert.doesNotMatch(
            step.run ?? '',
            /\|\|\s*true/,
            `${file} must not use Bash fallback syntax in a cross-platform step`
          )
        }
      }
    }

    assert.equal(guardedStepCount, 9)
  })

  it('checks out complete history before validating the TUI changelog', () => {
    const tuiJob = getJob(linuxWorkflowDocument, 'linux-tui')
    const checkout = tuiJob.steps?.find(step =>
      step.uses?.startsWith('actions/checkout@')
    )

    assert.notEqual(checkout, undefined)
    assert.equal(checkout?.with?.['fetch-depth'], 0)
    assert.equal(
      tuiJob.steps?.some(
        step =>
          step.run ===
          'node tui/tools/generate-tui-changelog-catalog.mjs --check'
      ),
      true
    )
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
    // Both tested payloads are mandatory; a red lane creates no Release.
    assert.match(
      installerWorkflow,
      /needs\.package\.result == 'success' && needs\.tui_package\.result ==\s*'success'/
    )
    assert.doesNotMatch(installerWorkflow, /## Partial release/)
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
      /Verify downloaded release payload[\s\S]*?Preserve verified release payload[\s\S]*?Revalidate immutable release tag before publishing[\s\S]*?Publish GitHub release[\s\S]*?Verify published release target[\s\S]*?Reconcile Latest to the newest main release/
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

  it('cancels replaceable Windows validation but never release publication', () => {
    for (const { name, source } of ciWorkflows) {
      assert.match(source, /on:\s*\n\s*push:\s*\n/, name)
      assert.match(source, /\n\s+pull_request:/, name)
      assert.match(source, /workflow_dispatch:/, name)
      assert.match(source, /repository:\s*\n\s*default:\s*''/, name)
      assert.doesNotMatch(
        source,
        /github\.repository == 'Ding-Ding-Projects\/desktop-material'/,
        name
      )
    }
    assert.match(
      linuxWorkflow,
      /group: ci-linux-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
    )
    assert.match(
      windowsWorkflow,
      /ci-windows-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}/
    )
    assert.match(windowsWorkflow, /cancel-in-progress: true/)
    assert.match(linuxWorkflow, /cancel-in-progress: false/)

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
      const workflow = parse(source) as IWorkflowDocument
      const jobsWithRunners = Object.entries(workflow.jobs ?? {}).filter(
        ([, job]) => job['runs-on'] !== undefined
      )
      if (selfHostedSuperExpressWorkflows.has(file)) {
        assert.match(
          source,
          /cancel-in-progress:\s*false/,
          `${file} must never cancel an in-flight release`
        )
        assert.match(
          source,
          /^  group: super-express-release[^\r\n]*\$\{\{ github\.ref \}\}\s*$/m,
          `${file} must scope cancellation to the dispatched ref`
        )
        assert.notEqual(jobsWithRunners.length, 0)
        for (const [jobName, job] of jobsWithRunners) {
          assert.equal(
            Array.isArray(job['runs-on']) &&
              job['runs-on'].includes('self-hosted'),
            true,
            `${file}:${jobName} must remain explicitly self-hosted`
          )
        }
        continue
      }
      for (const [jobName, job] of jobsWithRunners) {
        if (
          file === 'ci-windows.yml' &&
          ['build', 'e2e-smoke'].includes(jobName)
        ) {
          assert.equal(
            job['runs-on'],
            windowsDesktopRunnerExpression,
            `${file}:${jobName} must expose only the protected cloud/self-hosted choice`
          )
          continue
        }
        if (
          file === 'build-installers.yml' &&
          ['test', 'package'].includes(jobName)
        ) {
          assert.equal(
            Array.isArray(job['runs-on']) &&
              job['runs-on'].includes('self-hosted') &&
              job['runs-on'].includes('Windows') &&
              job['runs-on'].includes('desktop-material-windows-local'),
            true,
            `${file}:${jobName} must use the labelled self-hosted Windows runner`
          )
          continue
        }
        assert.equal(
          typeof job['runs-on'],
          'string',
          `${file}:${jobName} must declare one literal hosted runner`
        )
        assert.equal(
          ['ubuntu-latest', 'ubuntu-slim', 'windows-2022'].includes(
            job['runs-on'] as string
          ),
          true,
          `${file}:${jobName} must use an approved hosted runner`
        )
      }
      if (file === 'ci-windows.yml') {
        assert.match(source, /cancel-in-progress:\s*true/)
        continue
      }

      assert.doesNotMatch(source, /cancel-in-progress:\s*true/)

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

  it('keeps Windows Express and every Super Express job self-hosted', () => {
    assert.deepEqual(getSelfHostedJobNames(installerWorkflowDocument), [
      'test',
      'package',
    ])
    assert.match(
      installerWorkflow,
      /^  group: build-installers-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/m
    )
    assert.match(installerWorkflow, /cancel-in-progress:\s*false/)
    for (const jobName of [
      'prepare',
      'lint',
      'release_notes',
      'tui_package',
      'prepare_publication',
      'publish',
    ]) {
      assertJobRunsOn(installerWorkflowDocument, jobName, 'ubuntu-latest')
    }
    assert.match(
      superExpressWorkflow,
      /- Windows\s*\n\s+- X64\s*\n\s+- desktop-material-windows-local/
    )
    assert.match(
      superExpressWorkflow,
      /- Linux\s*\n\s+- X64\s*\n\s+- desktop-material-wsl-local/
    )
  })

  it('enumerates every Windows self-hosted job and its cold bootstrap path', () => {
    assert.equal(selfHostedWindowsJobInventory.version, 2)
    assert.deepEqual(selfHostedWindowsJobInventory.releaseBootstrapComponents, [
      '.github/scripts/ensure-windows-git-bash.ps1',
      '.github/scripts/ensure-github-cli.sh',
      '.github/scripts/ensure-jq.sh',
    ])
    for (const component of selfHostedWindowsJobInventory.releaseBootstrapComponents) {
      assert.equal(existsSync(join(root, component)), true)
    }
    const discovered: string[] = []
    for (const { file, source } of workflowSources) {
      const workflow = parse(source) as IWorkflowDocument
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const runner = JSON.stringify(job['runs-on'] ?? '')
        if (runner.includes('self-hosted') && runner.includes('Windows')) {
          discovered.push(`${file}#${jobName}`)
        }
      }
    }
    const inventoried = selfHostedWindowsJobInventory.jobs.map(
      entry => `${entry.workflow.split('/').at(-1)}#${entry.job}`
    )
    assert.deepEqual(discovered.sort(), inventoried.sort())

    for (const entry of selfHostedWindowsJobInventory.jobs) {
      for (const requiredPath of [
        entry.dependencyInventory,
        entry.bootstrap,
        entry.coldBootstrapTest,
      ]) {
        assert.equal(
          existsSync(join(root, requiredPath)),
          true,
          `${entry.workflow}#${entry.job} requires ${requiredPath}`
        )
      }
    }
    const publisher = selfHostedWindowsJobInventory.jobs.find(
      entry =>
        entry.job === 'publish' && entry.workflow.endsWith('-windows.yml')
    )
    assert.deepEqual(
      publisher?.bootstrapComponents,
      selfHostedWindowsJobInventory.releaseBootstrapComponents
    )
  })

  it('bootstraps Git and Bash before every self-hosted-capable Windows job uses Git', () => {
    for (const jobName of ['test', 'package']) {
      assertWindowsBootstrapBeforeTrueCheckout(
        installerWorkflowDocument,
        jobName
      )
    }
    for (const jobName of ['build', 'e2e-smoke']) {
      assertWindowsBootstrapBeforeTrueCheckout(
        windowsWorkflowDocument,
        jobName,
        "runner.environment == 'self-hosted'"
      )
    }
    assertWindowsBootstrapBeforeTrueCheckout(
      superExpressWorkflowDocument,
      'windows_build'
    )

    const expressTestSteps =
      getJob(installerWorkflowDocument, 'test').steps ?? []
    const coldBootstrapIndex = expressTestSteps.findIndex(
      step => step.name === 'Prove cold Windows release bootstrap'
    )
    assert.equal(coldBootstrapIndex, 3)
    assert.equal(
      expressTestSteps[coldBootstrapIndex].run,
      '%GITHUB_WORKSPACE%\\.github\\scripts\\test-windows-release-bootstrap.cmd'
    )
    assert.equal(expressTestSteps[coldBootstrapIndex].shell, 'cmd')
  })

  it('keeps combined release preparation read-only by default', () => {
    assert.equal(superExpressWorkflowDocument.permissions?.contents, 'read')
    assert.equal(
      getJob(superExpressWorkflowDocument, 'prepare_publication').permissions
        ?.contents,
      'read'
    )
    assert.equal(
      getJob(superExpressWorkflowDocument, 'publish').permissions?.contents,
      'write'
    )
  })

  it('scopes release credentials to exact publisher mutation steps', () => {
    assertReleasePublisherLeastPrivilege(
      installerWorkflowDocument,
      'Publish GitHub release'
    )
    assertReleasePublisherLeastPrivilege(
      superExpressWorkflowDocument,
      'Publish immutable GitHub Release'
    )
  })

  it('keeps the Windows package script permanently unsigned', () => {
    for (const forbiddenSignerWiring of [
      /WINDOWS_SIGNING_ENABLED/,
      /RUNNER_TEMP/,
      /AZURE_CODE_SIGNING/,
      /AZURE_(?:CLIENT|TENANT)_ID/,
      /(?:WIN_)?CSC_(?:LINK|KEY_PASSWORD)/,
      /Azure\.CodeSigning/,
      /codesigning\.azure/,
      /timestamp\.acs/,
      /signWithParams/,
      /windowsSign/,
      /signToolPath/,
      /certificateFile/,
      /certificatePassword/,
      /certificatePath/,
      /certificateSubjectName/,
    ]) {
      assert.doesNotMatch(packageScript, forbiddenSignerWiring)
    }
    assert.match(
      packageScript,
      /const options: electronInstaller\.Options = \{[\s\S]*?setupMsi: getWindowsInstallerName\(\),[\s\S]*?\}/
    )
    assert.match(packageScript, /const makeDelta = shouldMakeDelta\(\)/)
    assert.match(packageScript, /noDelta:\s*!makeDelta/)
    assert.match(
      packageScript,
      /electronInstaller\s*\.createWindowsInstaller\(options\)/
    )
  })

  it('keeps every Windows package and release path permanently unsigned', () => {
    assert.match(superExpressWindowsBuildAction, /RELEASE_CHANNEL: beta/)
    assert.match(
      superExpressWindowsBuildAction,
      /WINDOWS_SIGNING_ENABLED: 'false'[\s\S]*?CSC_IDENTITY_AUTO_DISCOVERY: 'false'/
    )
    assert.match(
      superExpressWindowsBuildAction,
      /Require unsigned Windows release installers[\s\S]*?Get-AuthenticodeSignature[\s\S]*?SignatureStatus\]::NotSigned/
    )
    for (const source of [
      superExpressWorkflow,
      superExpressWindowsWorkflow,
      windowsWorkflow,
      linuxWorkflow,
      installerWorkflow,
      setupCiAction,
      superExpressWindowsBuildAction,
    ]) {
      assert.doesNotMatch(source, /setup-windows-signing/)
      assert.doesNotMatch(source, /AZURE_CODE_SIGNING_(?:CLIENT|TENANT)_ID/)
      assert.doesNotMatch(source, /id-token: write/)
    }
    assert.equal(
      existsSync(
        join(root, '.github/actions/setup-windows-signing/action.yml')
      ),
      false
    )
    assert.doesNotMatch(superExpressWindowsWorkflow, /id-token: write/)
    assert.match(
      superExpressWindowsWorkflow,
      /permanently unsigned[\s\S]*?unknown-publisher or SmartScreen warning[\s\S]*?exact commit[\s\S]*?unsigned installer state[\s\S]*?Squirrel package hashes and sizes[\s\S]*?six required non-empty release assets/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /publish:[\s\S]*?runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64\s*\n\s+- desktop-material-windows-local/
    )
    assert.doesNotMatch(superExpressWindowsWorkflow, /ubuntu-latest/)
    assert.match(
      superExpressWindowsWorkflow,
      /setup-github-cli[\s\S]*?setup-jq[\s\S]*?Require downloaded installers to remain unsigned[\s\S]*?SignatureStatus\]::NotSigned/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /Workflow started:[\s\S]*?Workflow completed:[\s\S]*?Workflow duration:/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /actions\/runs\/\$GITHUB_RUN_ID\/jobs\?per_page=100[\s\S]*?\.jobs\[\]\.started_at[\s\S]*?\.completed_at[\s\S]*?Reconcile this release as Latest/
    )
    assert.doesNotMatch(superExpressWindowsWorkflow, /\.run_started_at/)
    assert.match(
      superExpressWindowsWorkflow,
      /Require the current main tip for a direct release[\s\S]*?shell: powershell -NoProfile -ExecutionPolicy Bypass -Command "\. '\{0\}'"[\s\S]*?git fetch origin main[\s\S]*?RELEASE_TARGET_SHA[\s\S]*?currentMain/
    )
    assert.doesNotMatch(
      superExpressWindowsWorkflow,
      /Require the current main tip for a direct release\s*[\s\S]*?shell: bash\s*[\s\S]*?git fetch origin main/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /Reconcile this release as Latest[\s\S]*?Verify Latest and final release notes/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /Stage immutable Windows-only GitHub Release draft[\s\S]*?gh release create[\s\S]*?--draft/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /Verify draft target and assets before publication[\s\S]*?Publish verified Windows release[\s\S]*?-F draft=false[\s\S]*?-f make_latest=false/
    )
    assert.doesNotMatch(
      superExpressWindowsWorkflow,
      /falling back to prerelease-then-clear/
    )
    assert.doesNotMatch(
      superExpressWindowsWorkflow,
      /notes-file release-payload\/release-notes\.md \\\n\s+--latest/
    )
    assert.match(superExpressWindowsWorkflow, /'GitHub\.Desktop-x64\.zip'/)
    assert.match(
      superExpressWindowsWorkflow,
      /select\(\.tag_name \| startswith\("catalog-v1"\)\)/
    )
    assert.match(
      superExpressWindowsWorkflow,
      /releases\/\$catalog_release_id\/assets\?per_page=100[\s\S]*?--paginate/
    )
    assert.doesNotMatch(
      `${superExpressWindowsBuildAction}\n${installerWorkflow}`,
      /\$installer:/
    )
    assert.match(
      installerWorkflow,
      /WINDOWS_SIGNING_ENABLED: 'false'[\s\S]*?CSC_IDENTITY_AUTO_DISCOVERY: 'false'[\s\S]*?Require unsigned release installers[\s\S]*?SignatureStatus\]::NotSigned/
    )
    assert.match(
      installerWorkflow,
      /package:[\s\S]*?runs-on:\s*\n\s+- self-hosted\s*\n\s+- Windows\s*\n\s+- X64\s*\n\s+- desktop-material-windows-local[\s\S]*?permissions:\s*\n\s+contents: read[\s\S]*?NODE_ENV: production[\s\S]*?RELEASE_CHANNEL: beta/
    )
    assert.match(
      installerWorkflow,
      /if \[ "\$windows_ok" = true \] && \[ "\$linux_ok" = true \]/
    )
    assert.doesNotMatch(
      releasePromotionScript,
      /Could not (?:resolve|fetch|list)[^\n]*leaving Latest untouched/
    )
  })

  it('gates reusable self-hosted Super Express lanes to protected main callers', () => {
    for (const [name, source] of [
      ['super-express-release-windows.yml', superExpressWindowsWorkflow],
      ['super-express-release-linux-tui.yml', superExpressLinuxTuiWorkflow],
    ] as const) {
      assert.match(
        source,
        /build:\s+name:[\s\S]*?if:\s+>-/,
        `${name} must restrict reusable self-hosted callers`
      )
      assert.match(
        source,
        /github\.event_name\s*==\s*'workflow_dispatch'/,
        name
      )
      assert.match(source, /github\.event_name\s*==\s*'workflow_call'/, name)
      assert.match(
        source,
        /github\.repository\s*==\s*'Ding-Ding-Projects\/desktop-material'/,
        name
      )
      assert.match(source, /github\.ref\s*==\s*'refs\/heads\/main'/, name)
    }
  })

  it('bootstraps GitHub CLI before self-hosted release API calls', () => {
    assert.match(githubCliAction, /default: '2\.97\.0'/)
    assert.match(
      githubCliAction,
      /run: bash \.github\/scripts\/ensure-github-cli\.sh/
    )
    assert.match(
      githubCliBootstrap,
      /cli\/cli\/releases\/download\/v\$\{version\}/
    )
    assert.match(githubCliBootstrap, /sha256sum -c -/)
    assert.match(
      installerWorkflow,
      /ref: main[\s\S]*?setup-github-cli[\s\S]*?Require a successful main CI/
    )
    for (const [workflow, publishStepName] of [
      [installerWorkflowDocument, 'Publish GitHub release'],
      [superExpressWorkflowDocument, 'Publish immutable GitHub Release'],
    ] as const) {
      const publisherSteps = getJob(workflow, 'publish').steps ?? []
      const setupIndex = publisherSteps.findIndex(
        step => step.uses === './.github/actions/setup-github-cli'
      )
      const publishIndex = publisherSteps.findIndex(
        step => step.name === publishStepName
      )
      assert.notEqual(setupIndex, -1)
      assert.notEqual(publishIndex, -1)
      assert.ok(setupIndex < publishIndex)
    }
    assert.match(
      installerWorkflow,
      /sibling_fields=\$\(gh api[\s\S]*?--jq[\s\S]*?@tsv/
    )
    assert.match(
      installerWorkflow,
      /IFS=\$'\\t' read -r sibling_status sibling_conclusion sibling_updated <<< "\$sibling_fields"/
    )
    assert.doesNotMatch(installerWorkflow, /printf '%s' "\$sibling_run" \| jq/)
  })

  it('builds, packages, and exercises the app on safe runner choices', () => {
    assert.match(
      productionWebpackRunner,
      /NODE_OPTIONS = '--max_old_space_size=16384'/
    )
    assert.match(
      productionWebpackRunner,
      /WEBPACK_DISABLE_CONCURRENT_RECOMPILATION === '1'[\s\S]*?--no-concurrent-recompilation/
    )
    assertJobRunsOn(windowsWorkflowDocument, 'windows-tui-core', 'windows-2022')
    for (const jobName of ['build', 'e2e-smoke']) {
      assert.equal(
        getJob(windowsWorkflowDocument, jobName)['runs-on'],
        windowsDesktopRunnerExpression
      )
    }
    for (const jobName of ['lint', 'supply-chain', 'linux-tui']) {
      assertJobRunsOn(linuxWorkflowDocument, jobName, 'ubuntu-latest')
    }
    assert.deepEqual(getSelfHostedJobNames(linuxWorkflowDocument), [])
    assert.match(windowsWorkflow, /arch: \[x64, arm64\]/)
    assert.match(windowsWorkflow, /friendlyName: Windows/)
    assert.match(
      windowsWorkflow,
      /workflow_dispatch:\s+inputs:\s+runner_mode:[\s\S]*?default: cloud[\s\S]*?type: choice[\s\S]*?options:\s+- cloud\s+- self-hosted/
    )
    assert.match(
      windowsWorkflow,
      /github\.event_name\s*==\s*'workflow_dispatch'[\s\S]*?github\.ref\s*==\s*'refs\/heads\/main'[\s\S]*?inputs\.runner_mode\s*==\s*'self-hosted'/
    )
    assert.match(
      windowsWorkflow,
      /fromJSON\('\["self-hosted","Windows","X64","desktop-material-windows-local"\]'\)\s*\|\|\s*'windows-2022'/
    )
    assert.match(windowsWorkflow, /workflow_call:\s+inputs:\s+repository:/)
    assert.match(windowsWorkflow, /Install app on Windows/)
    assert.equal(
      getNamedStep(
        getJob(windowsWorkflowDocument, 'e2e-smoke'),
        'Build production app'
      ).run,
      'yarn build:prod:e2e'
    )
    assert.match(
      windowsWorkflow,
      /Enable Git long paths for Windows TUI tests\s+run: git config core\.longpaths true/
    )
    assert.match(
      windowsWorkflow,
      /defaults:\s+run:\s+shell: powershell -NoProfile -ExecutionPolicy Bypass -Command \"\. '\{0\}'\"/
    )
    assert.doesNotMatch(windowsWorkflow, /shell: pwsh/)
    for (const { name, source } of ciWorkflows) {
      assert.doesNotMatch(source, /macos|APPLE_/i, name)
    }
  })

  it('preserves Windows installers when normal CI tests fail', () => {
    assert.equal(
      getJob(installerWorkflowDocument, 'package').defaults?.run?.shell,
      'powershell -NoProfile -ExecutionPolicy Bypass -Command ". \'{0}\'"'
    )
    const windowsBuildJob = windowsWorkflow.match(
      /\r?\n  build:\r?\n([\s\S]*?)(?=\r?\n  e2e-smoke:\r?\n)/
    )
    assert.notEqual(windowsBuildJob, null)
    const source = windowsBuildJob?.[1] ?? ''

    assert.equal(
      getNamedStep(
        getJob(installerWorkflowDocument, 'package'),
        'Build production app'
      ).env?.WEBPACK_DISABLE_CONCURRENT_RECOMPILATION,
      '1'
    )
    assert.match(
      superExpressWindowsBuildAction,
      /name: Build production app[\s\S]*?WEBPACK_DISABLE_CONCURRENT_RECOMPILATION: '1'/
    )

    assert.match(
      source,
      /name: Build production app[\s\S]*?id: production_build[\s\S]*?if:[\s\S]*?\$\{\{\s*always\(\)\s*&&\s*!cancelled\(\)\s*&&\s*steps\.setup_ci\.outcome == 'success'\s*\}\}/
    )
    assert.match(
      source,
      /name: Package production app\s+id: installer_package\s+if:[\s\S]*?always\(\) && !cancelled\(\) && steps\.production_build\.outcome\s*==\s*'success'/
    )
    assert.match(
      source,
      /name: Require unsigned packaged installers\s+id: unsigned_installers[\s\S]*?steps\.installer_package\.outcome\s*==\s*'success'[\s\S]*?SignatureStatus\]::NotSigned/
    )
    const uploadCondition =
      getNamedStep(
        getJob(windowsWorkflowDocument, 'build'),
        'Upload artifacts'
      )['if'] ?? ''
    assert.match(
      uploadCondition,
      /always\(\) && !cancelled\(\) && steps\.installer_package\.outcome == 'success' && steps\.unsigned_installers\.outcome == 'success'/
    )
    assert.doesNotMatch(uploadCondition, /unit|script|test/i)
    assert.match(source, /dist\/GitHubDesktopSetup-\$\{\{matrix\.arch\}\}\.exe/)
    assert.match(source, /if-no-files-found: error/)
    assertHarnessOwnsWorkerMemory(windowsWorkflowDocument, 'build')
    assertHarnessOwnsWorkerMemory(installerWorkflowDocument, 'test')

    const e2eStep = getNamedStep(
      getJob(windowsWorkflowDocument, 'e2e-smoke'),
      'Install app on Windows'
    )
    const e2eSource = e2eStep.run ?? ''
    assert.match(
      e2eSource,
      /\$installer = Start-Process -FilePath \$setupExe -ArgumentList "\/S" -PassThru/
    )
    assert.equal(
      e2eSource.match(/\.WaitForExit\(/g)?.length,
      1,
      'the installer step must have exactly one bounded process wait'
    )
    assert.match(e2eSource, /\$installer\.WaitForExit\(300000\)/)
    assert.doesNotMatch(e2eSource, /\.WaitForExit\(\s*\)/)
    assert.doesNotMatch(e2eSource, /\bWait-Process\b/)
    assert.doesNotMatch(
      e2eSource,
      /^\s*\$installer\s*=\s*Start-Process[^\r\n]*\s-Wait\b/m
    )
    assert.match(e2eSource, /taskkill\.exe \/PID \$installer\.Id \/T \/F/)
    assert.match(e2eSource, /\$preexistingDesktopProcessIds = @\(/)
    assert.match(e2eSource, /\$_\.SessionId -eq \$installerSessionId/)
    assert.match(
      e2eSource,
      /\$preexistingDesktopProcessIds -notcontains \$_\.Id/
    )
    assert.equal(
      e2eSource.match(/Stop-InstallerLaunchedDesktopProcesses/g)?.length,
      4,
      'the installer step must define one scoped cleanup and call it before, during, and after executable discovery'
    )
    assert.match(e2eSource, /Stop-Process -Force -ErrorAction SilentlyContinue/)
    assert.match(e2eSource, /Windows installer timed out after 300 seconds/)
    assert.match(e2eSource, /\$installer\.ExitCode -ne 0/)
    assert.match(e2eSource, /app-\$expectedVersion\\GitHubDesktop\.exe/)
    assert.match(e2eSource, /LastWriteTimeUtc -ge \$installStartedAt/)
    assert.match(
      windowsWorkflow,
      /name: Upload E2E artifacts\s+if: \$\{\{ always\(\) && !cancelled\(\) \}\}/
    )
    assert.match(
      installerWorkflow,
      /!cancelled\(\) && always\(\) && needs\.prepare\.result == 'success'/
    )
    assert.match(
      superExpressWorkflow,
      /!cancelled\(\) && always\(\) && needs\.prepare\.result == 'success'/
    )
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
