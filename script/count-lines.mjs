#!/usr/bin/env node

/**
 * Counts the repository's lines of code and prints the table the README
 * publishes.
 *
 * The shared instructions require every README to state the project's line
 * count, broken down rather than reduced to one flattering number, with the
 * exclusions stated and the tool recorded so anyone can reproduce it. This is
 * that tool: run it, paste the table, and the figure in the README is a
 * measurement rather than an estimate.
 *
 * Only files Git tracks are counted, so dependency directories, build output
 * and anything ignored are excluded by construction rather than by a
 * hand-maintained deny list. Vendored third-party trees are tracked but are
 * not this project's code, so they are counted into their own row and left out
 * of the project total.
 *
 * Usage: node script/count-lines.mjs [--json]
 */

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

/** Extensions counted as source. Binaries and assets are not code. */
const CountedExtensions = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'scss',
  'css',
  'html',
  'py',
  'sh',
  'ps1',
  'yml',
  'yaml',
  'json',
  'md',
])

/** A file bigger than this is data, not something a person maintains by hand. */
const MaximumFileBytes = 8 * 1024 * 1024

/**
 * Files that exist because a generator wrote them.
 *
 * Separated out because a reader wants to know how much of the project a
 * person actually wrote; folding a 288k-line catalog into "source" would
 * misrepresent that badly.
 */
const GeneratedPatterns = [
  /\.generated\.tsx?$/,
  /^app\/src\/lib\/changelog\/release-dates\.ts$/,
  /^docs\/assets\/site\/docs-[a-z-]*catalog\.js$/,
  /^changelog\.json$/,
  /^app\/static\/dim-sum\/manifest\.json$/,
  /^app\/static\/audio\/manifest\.json$/,
  /^tui\/contracts\/parity\.yaml$/,
  /^tui\/src\/desktop_material_tui\/assets\/changelog-catalog\.json$/,
  /^tui\/src\/desktop_material_tui\/assets\/dim-sum\/manifest\.json$/,
]

/**
 * Which row a tracked file belongs to. Ordered most specific first, because a
 * path under `app/test` is a test before it is anything else.
 */
const Areas = [
  {
    name: 'Vendored / third-party',
    test: /^(vendor|gemoji)\//,
    project: false,
  },
  {
    name: 'Linux TUI tests',
    test: /^tui\/tests\//,
    project: true,
  },
  {
    name: 'Linux TUI styles',
    test: /^tui\/.*\.(?:tcss|css)$/,
    project: true,
  },
  {
    name: 'Linux TUI source',
    test: /^tui\/src\//,
    project: true,
  },
  {
    name: 'Linux TUI packaging and contracts',
    test: /^tui\//,
    project: true,
  },
  { name: 'App tests', test: /^app\/test\//, project: true },
  { name: 'App source', test: /^app\/src\//, project: true },
  { name: 'App styles', test: /^app\/styles\//, project: true },
  { name: 'Build and tooling scripts', test: /^script\//, project: true },
  { name: 'Docs and documentation site', test: /^docs\//, project: true },
  { name: 'Remote-access site', test: /^remote-site\//, project: true },
  {
    name: 'Other subprojects',
    test: /^(site|design|services|shell-extension|eslint-rules)\//,
    project: true,
  },
  { name: 'App static assets', test: /^app\/static\//, project: true },
  // Agent run manifests, verification records and audits. Tracked evidence
  // about how the project was built, not the project — counted so the row is
  // visible, excluded from the total so it cannot inflate it.
  {
    name: 'Agent run and verification records',
    test: /^\.codex\//,
    project: false,
  },
  {
    name: 'CI workflows and editor config',
    test: /^\.(github|claude|vscode)\//,
    project: true,
  },
  { name: 'Repository root', test: /^[^/]+$/, project: true },
  // A catch-all rather than a silent drop: a counted file that matched no
  // pattern above must still appear somewhere, or the total quietly
  // misrepresents the project. If this row is ever large, it is a sign the
  // list above needs a new entry, not that the files do not count.
  { name: 'Unclassified', test: /.*/, project: true },
]

function areaFor(file) {
  // Every counted file lands somewhere: the last entry matches anything.
  return Areas.find(area => area.test.test(file)) ?? null
}

function isGenerated(file) {
  return GeneratedPatterns.some(pattern => pattern.test(file))
}

/**
 * Author identities that are an agent rather than a person.
 *
 * Matched against the commit author. A commit is also treated as agent-written
 * when it carries a `Co-Authored-By` trailer naming one, which covers work an
 * agent did while committing under the repository owner's own identity.
 */
const AgentAuthorPattern =
  /^(claude|codex|opencode|desktop material (automation|verification|test)|material fixture)/i

/** Trailer values that mean an agent wrote the change. */
const AgentTrailerPattern = /claude|codex|opencode/i

/**
 * Every commit an agent wrote, by full SHA.
 *
 * Built in one `git log` pass rather than one call per commit: the repository
 * has tens of thousands of commits and a call each would take longer than the
 * blame that follows.
 */
export function agentCommits() {
  const raw = execFileSync(
    'git',
    [
      'log',
      '--format=%H%x01%an%x01%(trailers:key=Co-Authored-By,valueonly,separator=%x02)',
    ],
    { maxBuffer: 1 << 28 }
  ).toString('utf8')

  const agents = new Set()
  for (const line of raw.split(String.fromCharCode(10))) {
    if (line.length === 0) {
      continue
    }
    const [sha, author = '', trailers = ''] = line.split(String.fromCharCode(1))
    if (AgentAuthorPattern.test(author) || AgentTrailerPattern.test(trailers)) {
      agents.add(sha)
    }
  }
  return agents
}

/**
 * Attribute every surviving line of `files` to an agent or a person.
 *
 * `git blame` is the only thing that answers "who wrote the code that is still
 * here" — counting added lines from the log would count churn instead, so a
 * line written and later deleted would inflate whoever wrote it. Blame costs
 * roughly 0.2s per file here, so the files are walked by a small pool of
 * concurrent processes rather than one at a time.
 */
async function attributeLines(files, agents, concurrency = 8) {
  const totals = { agent: 0, human: 0, unattributed: 0 }
  let next = 0

  async function blameOne(file) {
    const sha = await new Promise(resolve => {
      const child = spawn('git', ['blame', '--line-porcelain', '--', file], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      let buffered = ''
      const counts = { agent: 0, human: 0 }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        buffered += chunk
        const lines = buffered.split('\n')
        buffered = lines.pop() ?? ''
        for (const line of lines) {
          // A porcelain header line starts each blamed line: "<sha> <a> <b> <n>".
          const match = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line)
          if (match !== null) {
            if (agents.has(match[1])) {
              counts.agent++
            } else {
              counts.human++
            }
          }
        }
      })
      child.on('close', () => resolve(counts))
      child.on('error', () => resolve(null))
    })

    if (sha === null) {
      return
    }
    totals.agent += sha.agent
    totals.human += sha.human
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (next < files.length) {
      await blameOne(files[next++])
    }
  })
  await Promise.all(workers)

  return totals
}

export async function countRepository({ attribution = true } = {}) {
  const files = execSync('git ls-files -z', { maxBuffer: 1 << 28 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)

  const rows = new Map()
  const generated = { files: 0, lines: 0, nonBlank: 0 }
  const counted = []

  for (const file of files) {
    const extension = (file.split('.').pop() ?? '').toLowerCase()
    if (!CountedExtensions.has(extension)) {
      continue
    }

    let text
    try {
      if (statSync(file).size > MaximumFileBytes) {
        continue
      }
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\0')) {
      continue
    }

    const all = text.length === 0 ? [] : text.split('\n')
    // A file ending in a newline splits to a trailing empty element that is
    // not a line. Dropping it makes this agree with `wc -l` and, more
    // importantly, with `git blame` — otherwise the attribution table below
    // would be short by exactly one line per file, for no visible reason.
    if (all.length > 0 && all[all.length - 1] === '') {
      all.pop()
    }
    const lines = all.length
    const nonBlank = all.filter(line => line.trim() !== '').length

    const area = areaFor(file)
    if (area === null) {
      continue
    }

    // Only generated files inside the project total, so the sentence that
    // reports this ("of the project total, N lines are generated") is
    // arithmetically true. A generated file in an excluded row is already
    // outside that total and must not be counted against it.
    if (area.project && isGenerated(file)) {
      generated.files++
      generated.lines += lines
      generated.nonBlank += nonBlank
    }

    const row = rows.get(area.name) ?? {
      name: area.name,
      project: area.project,
      files: 0,
      lines: 0,
      nonBlank: 0,
    }
    row.files++
    row.lines += lines
    row.nonBlank += nonBlank
    rows.set(area.name, row)
    counted.push(file)
  }

  const ordered = [...rows.values()].sort((a, b) => b.lines - a.lines)
  const project = ordered.filter(row => row.project)
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0)

  // Who wrote the lines that are still here. Skipped with --no-attribution,
  // because blame is by far the slowest part of this script.
  const authored = attribution
    ? await attributeLines(counted, agentCommits())
    : null

  return {
    rows: ordered,
    generated,
    project: {
      files: sum(project, 'files'),
      lines: sum(project, 'lines'),
      nonBlank: sum(project, 'nonBlank'),
    },
    // Everything counted, including the rows held out of the project total.
    // Stated so the excluded rows are visible as part of a whole rather than
    // looking like they were quietly dropped.
    everything: {
      files: sum(ordered, 'files'),
      lines: sum(ordered, 'lines'),
      nonBlank: sum(ordered, 'nonBlank'),
    },
    authored,
    commit: execSync('git rev-parse --short HEAD').toString().trim(),
  }
}

function number(value) {
  return value.toLocaleString('en-US')
}

function markdown(result) {
  const lines = [
    '| Area | Files | Lines | Non-blank |',
    '| --- | ---: | ---: | ---: |',
  ]
  for (const row of result.rows) {
    const name = row.project ? row.name : `${row.name} *(excluded)*`
    lines.push(
      `| ${name} | ${number(row.files)} | ${number(row.lines)} | ${number(
        row.nonBlank
      )} |`
    )
  }
  lines.push(
    `| **Project total** | **${number(result.project.files)}** | **${number(
      result.project.lines
    )}** | **${number(result.project.nonBlank)}** |`
  )
  lines.push(
    `| **Everything counted** | **${number(
      result.everything.files
    )}** | **${number(result.everything.lines)}** | **${number(
      result.everything.nonBlank
    )}** |`
  )
  lines.push('')
  lines.push(
    `Of the project total, ${number(result.generated.lines)} lines across ` +
      `${number(result.generated.files)} files are generated by tooling ` +
      `rather than written by hand.`
  )

  if (result.authored !== null) {
    const { agent, human } = result.authored
    const attributed = agent + human
    const share =
      attributed === 0 ? 0 : Math.round((agent / attributed) * 1000) / 10
    lines.push('')
    lines.push('| Written by | Lines | Share |')
    lines.push('| --- | ---: | ---: |')
    lines.push(`| Agents | ${number(agent)} | ${share}% |`)
    lines.push(
      `| People | ${number(human)} | ${Math.round((100 - share) * 10) / 10}% |`
    )
    lines.push(
      `| **Total attributed** | **${number(attributed)}** | **100%** |`
    )
    lines.push('')
    lines.push(
      'Attribution is per surviving line via `git blame`, not lines added: a ' +
        'line written and later deleted counts for nobody. A commit counts as ' +
        'agent-written when its author is an automation identity or it carries a ' +
        '`Co-Authored-By` trailer naming an agent.'
    )
  }

  return lines.join('\n')
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? ' ')

if (invokedDirectly) {
  const result = await countRepository({
    attribution: !process.argv.includes('--no-attribution'),
  })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(markdown(result))
    console.log(`
Measured at ${result.commit}.`)
  }
}
