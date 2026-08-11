import assert from 'node:assert'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

const root = process.cwd()
const workflowDirectory = join(root, '.github', 'workflows')
const workflowFiles = readdirSync(workflowDirectory).filter(file =>
  /\.ya?ml$/.test(file)
)
const workflowSources = new Map(
  workflowFiles.map(file => [
    file,
    readFileSync(join(workflowDirectory, file), 'utf8'),
  ])
)

interface IWorkflowStep {
  readonly id?: string
  readonly if?: string
  readonly name?: string
  readonly run?: string
  readonly uses?: string
  readonly env?: Record<string, unknown>
  readonly with?: Record<string, unknown>
  readonly 'continue-on-error'?: boolean
}

interface IWorkflowJob {
  readonly if?: string
  readonly needs?: string | ReadonlyArray<string>
  readonly steps?: ReadonlyArray<IWorkflowStep>
  readonly strategy?: {
    readonly matrix?: { readonly arch?: ReadonlyArray<string> }
  }
}

interface IWorkflowDocument {
  readonly jobs?: Record<string, IWorkflowJob>
}

const readWorkflow = (name: string) => {
  const source = workflowSources.get(name)
  assert.notEqual(source, undefined, `${name} must exist`)
  return source as string
}

const parseWorkflow = (name: string) =>
  parse(readWorkflow(name)) as IWorkflowDocument

const windowsWorkflow = readWorkflow('ci-windows.yml')
const installerWorkflow = readWorkflow('build-installers.yml')
const superExpressWorkflow = readWorkflow('super-express-release.yml')
const superExpressWindowsWorkflow = readWorkflow(
  'super-express-release-windows.yml'
)
const pagesWorkflow = readWorkflow('pages.yml')
const windowsBuildAction = readFileSync(
  join(root, '.github', 'actions', 'super-express-windows-build', 'action.yml'),
  'utf8'
)

const forbiddenJob =
  /^(?:test|tests|lint|typecheck|type-check|coverage|codeql|static-analysis|e2e(?:-|$)|screenshot)/i
const forbiddenCommand =
  /(?:\byarn\s+(?:run\s+)?(?:test|lint|typecheck|coverage)|\bnpm\s+(?:run\s+)?(?:test|lint|typecheck|coverage)|\bpnpm\s+(?:run\s+)?(?:test|lint|typecheck|coverage)|\bnode\s+[^\r\n]*(?:-test|test\.mjs|screenshots?:check)|\bplaywright\b|codeql-action|\bactionlint\b)/i
const releaseTokenExpression =
  '${{ secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN }}'

const outOfScopeLinuxWorkflows = new Set([
  'ci-linux.yml',
  'super-express-release-linux-tui.yml',
])

describe('GitHub Actions delivery contract', () => {
  it('keeps the existing Linux workflows and removes the analysis workflow', () => {
    for (const preserved of outOfScopeLinuxWorkflows) {
      assert.equal(
        existsSync(join(workflowDirectory, preserved)),
        true,
        `${preserved} must remain present`
      )
    }

    assert.equal(
      existsSync(join(workflowDirectory, 'codeql.yml')),
      false,
      'codeql.yml must stay retired'
    )
    assert.doesNotMatch(windowsWorkflow, /codeql-action/)
  })

  it('keeps every workflow structurally parseable', () => {
    for (const [name, source] of workflowSources) {
      const document = parse(source) as IWorkflowDocument
      assert.ok(document && typeof document === 'object', name)
      assert.ok(document.jobs && Object.keys(document.jobs).length > 0, name)
    }
  })

  it('contains no test, lint, type, static-analysis, coverage, or screenshot jobs', () => {
    for (const [file, source] of workflowSources) {
      if (outOfScopeLinuxWorkflows.has(file)) {
        continue
      }
      const document = parse(source) as IWorkflowDocument
      for (const [jobName, job] of Object.entries(document.jobs ?? {})) {
        assert.doesNotMatch(jobName, forbiddenJob, `${file} job ${jobName}`)
        for (const step of job.steps ?? []) {
          assert.doesNotMatch(
            `${step.uses ?? ''}\n${step.run ?? ''}`,
            forbiddenCommand,
            `${file} ${jobName} ${step.name ?? 'unnamed step'}`
          )
        }
      }
    }
  })

  it('builds and packages both Windows architectures without quality gates', () => {
    const document = parseWorkflow('ci-windows.yml')
    assert.deepEqual(Object.keys(document.jobs ?? {}), ['build'])
    assert.deepEqual(document.jobs?.build?.strategy?.matrix?.arch, [
      'x64',
      'arm64',
    ])
    assert.match(windowsWorkflow, /^\s+push:\s*$/m)
    assert.match(windowsWorkflow, /^\s+workflow_dispatch:\s*$/m)
    assert.match(windowsWorkflow, /name: Build production app/)
    assert.match(windowsWorkflow, /name: Package production app/)
    assert.match(windowsWorkflow, /name: Require unsigned packaged installers/)
    assert.match(windowsWorkflow, /name: Upload packaged desktop artifacts/)
    assert.match(windowsWorkflow, /name: Upload bounded build evidence/)
    assert.match(
      windowsWorkflow,
      /windows-build-evidence-[\s\S]*?if-no-files-found: warn/
    )
    assert.doesNotMatch(windowsWorkflow, /e2e-smoke|yarn test|yarn lint/)
  })

  it('publishes installers without validation jobs in its needs chain', () => {
    const document = parseWorkflow('build-installers.yml')
    assert.deepEqual(Object.keys(document.jobs ?? {}), [
      'prepare',
      'release_notes',
      'package',
      'prepare_publication',
      'publish',
    ])
    const publicationNeeds = document.jobs?.prepare_publication?.needs
    assert.deepEqual(publicationNeeds, ['prepare', 'release_notes', 'package'])
    assert.doesNotMatch(
      document.jobs?.prepare_publication?.if ?? '',
      /needs\.(?:lint|test|typecheck|coverage|codeql|e2e)/
    )
    assert.match(installerWorkflow, /name: Build production app/)
    assert.match(installerWorkflow, /name: Package production app/)
    assert.match(installerWorkflow, /name: Require unsigned release installers/)
    assert.match(installerWorkflow, /name: Publish GitHub release/)
  })

  it('preserves release timing, immutable assets, and token scoping', () => {
    for (const source of [installerWorkflow, superExpressWindowsWorkflow]) {
      assert.match(source, /Workflow started/)
      assert.match(source, /Workflow completed/)
      assert.match(source, /Workflow duration/)
    }

    for (const source of [
      installerWorkflow,
      superExpressWorkflow,
      superExpressWindowsWorkflow,
    ]) {
      assert.match(source, /GitHubDesktopSetup-x64\.exe/)
      assert.match(source, /RELEASES/)
      assert.match(source, /full\.nupkg/)
      assert.doesNotMatch(source, /cancel-in-progress:\s*true/)
    }

    for (const [file, source] of [
      ['build-installers.yml', installerWorkflow],
      ['super-express-release.yml', superExpressWorkflow],
      ['super-express-release-windows.yml', superExpressWindowsWorkflow],
    ] as const) {
      const document = parse(source) as IWorkflowDocument
      for (const [jobName, job] of Object.entries(document.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (
            !Object.prototype.hasOwnProperty.call(step.env ?? {}, 'GH_TOKEN')
          ) {
            continue
          }
          assert.equal(
            step.env?.GH_TOKEN,
            releaseTokenExpression,
            `${file} ${jobName} ${step.name ?? 'unnamed step'}`
          )
        }
      }
    }
  })

  it('keeps packaging permanently unsigned', () => {
    for (const source of [
      windowsWorkflow,
      installerWorkflow,
      windowsBuildAction,
    ]) {
      assert.match(source, /WINDOWS_SIGNING_ENABLED: 'false'/)
      assert.match(source, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/)
      assert.doesNotMatch(source, /WINDOWS_SIGNING_ENABLED: 'true'/)
    }
  })

  it('builds and deploys Pages without running the removed site test', () => {
    assert.match(pagesWorkflow, /name: Assemble publish directory/)
    assert.match(pagesWorkflow, /name: Upload artifact/)
    assert.match(pagesWorkflow, /name: Deploy to GitHub Pages/)
    assert.doesNotMatch(pagesWorkflow, /site-dc-pages-test/)
  })
})
