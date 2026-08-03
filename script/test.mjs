import { spawn } from 'child_process'
import { join, resolve } from 'path'
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises'
import { availableParallelism, tmpdir, totalmem } from 'os'
import { pathToFileURL } from 'url'
import { parseEnv } from 'util'

function reporter(name, destination = 'stdout') {
  return ['--test-reporter', name, '--test-reporter-destination', destination]
}

async function findTestFilesIn(paths) {
  const files = []
  for (const path of paths) {
    const entry = await stat(path)
    if (entry.isFile()) {
      files.push(path)
      continue
    }

    for (const file of await readdir(path, { recursive: true }).then(x =>
      x
        .filter(f => /(?:-test|\.test)\.(ts|tsx|js|jsx|mts|mjs)$/.test(f))
        .map(f => join(path, f))
    )) {
      files.push(file)
    }
  }
  return files.sort((a, b) => a.localeCompare(b))
}

// Leave room for Windows' CreateProcess command-line limit as well as quoting
// added by Node. A full Desktop Material unit run contains hundreds of paths,
// so passing every file to one child process can fail with ENAMETOOLONG before
// the test runner starts.
export const maximumCommandLength =
  process.platform === 'win32' ? 24_000 : 96_000

// node-test-github-reporter writes one expandable block per test. The complete
// unit suite is large enough to exceed GitHub's 1 MiB step-summary limit, which
// turns otherwise-green output into an upload error. Keep the rich reporter for
// focused suites while the spec log and TAP accounting continue to cover large
// runs without an unbounded summary.
export const maximumGitHubReporterFiles = 250

export function shouldUseGitHubReporter(isGitHubActions, fileCount) {
  return isGitHubActions && fileCount <= maximumGitHubReporterFiles
}

// `node --test` runs one worker process per test file, several at a time, and
// V8 sizes each worker's old-space generation from the *machine's* memory
// rather than from how many workers are running. On a 64-bit host that ceiling
// is about 4 GB per worker, so a hosted Windows runner (4 CPUs, 16 GB RAM, and
// a small pagefile) can have four workers entitled to ~16 GB between them
// before the OS has given anything to git, the coordinator, or itself.
//
// Windows charges reserved commit, not just resident pages, so the machine
// hits its commit limit long before the tests actually need that memory. The
// failure is not one clean out-of-memory error in one test either — it lands
// as scattered, load-dependent damage across whichever files happen to be
// running: "The paging file is too small for this operation to complete",
// "Not enough memory resources are available to process this command",
// `spawn UNKNOWN`, git dying with "fatal: Out of memory", and V8's own
// "Array buffer allocation failed" / "JavaScript heap out of memory". Those
// read like unrelated flaky tests, which is exactly why this is worth pinning
// down here rather than retrying the suite.
//
// Cap each worker's heap so V8 collects instead of growing into commit it will
// never need, and keep the worst case for the whole fleet inside a fraction of
// the machine. The suite's heaviest single file peaks in the low hundreds of
// MB, so this ceiling bounds runaway growth without constraining real tests.
export const workerHeapMegabytes = 2048

// Leave most of the machine to everything the tests themselves spawn — git,
// the coordinator, jsdom's native bits, and the OS. Workers are the only part
// this harness controls, so they get a deliberately modest share.
export const workerMemoryBudgetRatio = 0.5

/**
 * How many test files to run at once.
 *
 * Bounded by the CPU count (more workers than cores only adds contention) and
 * by how many worker heaps of `heapMegabytes` fit inside `budgetRatio` of the
 * machine's memory. Always at least one, so a very small machine still runs
 * the suite serially rather than not at all.
 */
export function testConcurrency(
  totalMemoryBytes,
  cpuCount,
  heapMegabytes = workerHeapMegabytes,
  budgetRatio = workerMemoryBudgetRatio
) {
  const budget = Math.floor(
    (totalMemoryBytes * budgetRatio) / (heapMegabytes * 1024 * 1024)
  )
  return Math.max(1, Math.min(cpuCount, budget))
}

/**
 * Add the per-worker heap cap to NODE_OPTIONS.
 *
 * The cap has to travel in the environment rather than in this harness's own
 * argv: the workers are spawned by `node --test`, not by us, so an execArgv
 * flag would bound only the coordinator — the process that uses the least
 * memory of any of them. Existing NODE_OPTIONS are preserved, and an explicit
 * caller-supplied `--max-old-space-size` wins so this stays overridable.
 */
export function withWorkerHeapLimit(
  nodeOptions,
  heapMegabytes = workerHeapMegabytes
) {
  const existing = nodeOptions ?? ''
  if (existing.includes('--max-old-space-size')) {
    return existing
  }
  return `${existing} --max-old-space-size=${heapMegabytes}`.trim()
}

export function estimateCommandLength(args) {
  return (
    'node'.length + args.reduce((length, arg) => length + arg.length + 3, 0)
  )
}

export function partitionFiles(
  baseArgs,
  files,
  maxLength = maximumCommandLength
) {
  const batches = []
  let batch = []

  for (const file of files) {
    if (
      batch.length > 0 &&
      estimateCommandLength([...baseArgs, ...batch, file]) > maxLength
    ) {
      batches.push(batch)
      batch = []
    }

    batch.push(file)
  }

  if (batch.length > 0 || files.length === 0) {
    batches.push(batch)
  }

  return batches
}

// Parse how many tests a batch reported from its TAP reporter output. Node's
// test runner emits a final `# tests N` summary (and a `1..N` plan) only once
// it has finished running every file it was given. If that summary is missing
// the batch's coordinator process exited early (crash, OOM, kill, or a failed
// spawn), which means some of its files never produced results. Returns the
// count from the last summary line, or null when no summary was emitted.
export function parseReportedTests(tapOutput) {
  let reported = null
  const pattern = /^# tests (\d+)\s*$/gm
  let match
  while ((match = pattern.exec(tapOutput)) !== null) {
    reported = Number(match[1])
  }
  return reported
}

// Reconcile the set of discovered test files against what each batch actually
// executed. Every discovered file is assigned to exactly one batch, so a file
// that never appears in a completed batch produced no test results — either the
// batch failed to spawn, was killed by a signal, or exited before emitting its
// reporter summary. Such files are silently skipped work and must fail the run.
//
// Each entry of `batchResults` is
//   { files, exitCode, signal, spawnError, reportedTests }
// where `reportedTests` is the parsed `# tests N` count (null when absent).
export function summarizeRun(discoveredFiles, batchResults) {
  const accountedFiles = []
  const incompleteBatches = []
  let reportedTests = 0
  let failingExitCode = 0

  batchResults.forEach((batch, index) => {
    const files = batch.files ?? []
    const completed =
      !batch.spawnError && batch.signal == null && batch.reportedTests != null

    if (completed) {
      accountedFiles.push(...files)
      reportedTests += batch.reportedTests
    } else {
      incompleteBatches.push({
        index,
        files,
        exitCode: batch.exitCode ?? null,
        signal: batch.signal ?? null,
        spawnError: batch.spawnError ?? null,
      })
    }

    if (typeof batch.exitCode === 'number' && batch.exitCode !== 0) {
      failingExitCode = failingExitCode || batch.exitCode
    }
    if (batch.spawnError) {
      failingExitCode = failingExitCode || 1
    }
    if (batch.signal != null) {
      failingExitCode = failingExitCode || 128
    }
  })

  const accountedSet = new Set(accountedFiles)
  const missingFiles = discoveredFiles.filter(file => !accountedSet.has(file))
  const ok = missingFiles.length === 0 && failingExitCode === 0

  return {
    discovered: discoveredFiles.length,
    accounted: accountedSet.size,
    reportedTests,
    missingFiles,
    incompleteBatches,
    failingExitCode,
    ok,
  }
}

function reportAccounting(summary, batchCount) {
  const {
    discovered,
    accounted,
    reportedTests,
    missingFiles,
    incompleteBatches,
  } = summary

  console.log(
    `Test file accounting: ${accounted}/${discovered} discovered file(s) ` +
      `produced results across ${batchCount} batch(es); ` +
      `${reportedTests} test(s) reported.`
  )

  for (const batch of incompleteBatches) {
    const reason = batch.spawnError
      ? `failed to spawn (${batch.spawnError.code ?? batch.spawnError.message})`
      : batch.signal != null
      ? `was terminated by signal ${batch.signal}`
      : `exited (code ${batch.exitCode}) without emitting a reporter summary`
    console.error(
      `ERROR: test batch #${batch.index} ${reason}; ` +
        `${batch.files.length} file(s) may not have run.`
    )
  }

  if (missingFiles.length > 0) {
    console.error(
      `\nERROR: ${missingFiles.length} discovered test file(s) never produced ` +
        `results. A batch failed to spawn or crashed before finishing, ` +
        `silently skipping whole files. Missing files:`
    )
    for (const file of missingFiles) {
      console.error(`  - ${file}`)
    }
  }
}

function runNode(args) {
  return new Promise(resolveResult => {
    const child = spawn('node', args, {
      stdio: 'inherit',
      cwd: resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        NODE_OPTIONS: withWorkerHeapLimit(process.env.NODE_OPTIONS),
      },
    })

    child.on('error', spawnError => {
      resolveResult({ exitCode: null, signal: null, spawnError })
    })
    child.on('exit', (code, signal) => {
      resolveResult({ exitCode: code, signal, spawnError: null })
    })
  })
}

async function main() {
  const fileArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const switchArgs = process.argv.slice(2).filter(a => a.startsWith('--'))

  const projectRoot = join(import.meta.dirname, '..')
  const files =
    fileArgs.length > 0
      ? await findTestFilesIn(fileArgs)
      : await findTestFilesIn([join(projectRoot, 'app', 'test', 'unit')])

  // I would _looooove_ to use the `--env-file` option, but it doesn't override
  // existing environment variables and we need to override some of them.
  const testEnv = parseEnv(
    await readFile(join(projectRoot, '.test.env'), 'utf8')
  )
  Object.entries(testEnv).forEach(([k, v]) => (process.env[k] = v))

  const baseArgs = [
    '--disable-warning=ExperimentalWarning',
    '--experimental-test-module-mocks',
    // Allow CJS resolution to find ESM-only packages (e.g. @github/copilot-sdk)
    // whose "exports" only declare an "import" condition with no "require" fallback.
    '--conditions=import',
    ...['--import', 'tsx'],
    ...['--import', './app/test/globals.mts'],
    // Before `switchArgs`, so an explicit --test-concurrency on the command
    // line still wins over the memory-derived default.
    `--test-concurrency=${testConcurrency(totalmem(), availableParallelism())}`,
    ...switchArgs,
    '--test',
    ...reporter('spec'),
    ...(shouldUseGitHubReporter(
      Boolean(process.env.GITHUB_ACTIONS),
      files.length
    )
      ? reporter('node-test-github-reporter')
      : []),
  ]

  // Each batch additionally streams a machine-readable TAP report to a private
  // temp file that we parse for accounting. The human-facing spec reporter still
  // streams live to stdout, so this adds no visible output; the tiny extra write
  // is dwarfed by the cost of actually running the tests.
  const reportDir = await mkdtemp(join(tmpdir(), 'dm-test-accounting-'))

  // Account for the per-batch TAP reporter arguments when estimating command
  // length so partitioning keeps its Windows ENAMETOOLONG safety margin.
  const sampleReportArgs = reporter('tap', join(reportDir, 'batch-0000.tap'))
  const batches = partitionFiles([...baseArgs, ...sampleReportArgs], files)

  if (batches.length > 1) {
    console.log(
      `Running ${files.length} test files in ${batches.length} batches`
    )
  }

  const batchResults = []
  try {
    for (const [index, batch] of batches.entries()) {
      const tapPath = join(reportDir, `batch-${index}.tap`)
      const { exitCode, signal, spawnError } = await runNode([
        ...baseArgs,
        ...reporter('tap', tapPath),
        ...batch,
      ])

      let reportedTests = null
      try {
        reportedTests = parseReportedTests(await readFile(tapPath, 'utf8'))
      } catch {
        // No report file means the batch never got far enough to write one.
        reportedTests = null
      }

      batchResults.push({
        files: batch,
        exitCode,
        signal,
        spawnError,
        reportedTests,
      })
    }
  } finally {
    await rm(reportDir, { recursive: true, force: true })
  }

  const summary = summarizeRun(files, batchResults)
  reportAccounting(summary, batches.length)

  // A silent skip (missing files / crashed batch) or any nonzero batch exit
  // must fail the whole run loudly rather than looking green.
  process.exitCode = summary.ok ? 0 : summary.failingExitCode || 1
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main()
}
