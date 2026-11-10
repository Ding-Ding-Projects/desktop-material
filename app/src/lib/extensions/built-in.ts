/**
 * Built-in extensions. They are ordinary extensions: each has a manifest,
 * needs consent, and runs out of process through the same protocol. They ship
 * as text so they can be written into the extensions folder at start-up, and
 * they double as runnable samples for authors.
 */

/** A manifest `command` meaning "the app's own Node runtime". */
export const AppNodeCommand = '@app-node'

export interface IBuiltInExtension {
  readonly id: string
  readonly manifest: string
  readonly script: string
}

const prelude = `
const fs = require('fs')
const path = require('path')
function readRequest() {
  return JSON.parse(fs.readFileSync(0, 'utf8'))
}
function answer(title, text) {
  process.stdout.write(JSON.stringify({ protocol: 1, ok: true, title, text }))
}
function fail(error) {
  process.stdout.write(JSON.stringify({ protocol: 1, ok: false, error }))
}
function walk(root, limit) {
  const files = []
  const pending = [root]
  while (pending.length > 0 && files.length < limit) {
    const dir = pending.pop()
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      continue
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (entry.isFile() && files.length < limit) files.push(full)
    }
  }
  return files
}
`

const manifest = (
  id: string,
  name: string,
  description: string,
  permissions: ReadonlyArray<string>
) =>
  JSON.stringify(
    {
      manifestVersion: 1,
      id,
      name,
      version: '1.0.0',
      description,
      permissions,
      command: AppNodeCommand,
      args: ['main.js'],
    },
    null,
    2
  )

export const BuiltInExtensions: ReadonlyArray<IBuiltInExtension> = [
  {
    id: 'todo-finder',
    manifest: manifest(
      'todo-finder',
      'TODO finder',
      'Lists TODO and FIXME notes in the repository, with file and line.',
      ['read-tracked-files']
    ),
    script: `${prelude}
try {
  const request = readRequest()
  const root = request.repositoryPath
  const found = []
  for (const file of walk(root, 5000)) {
    if (found.length >= 200) break
    let stat
    try { stat = fs.statSync(file) } catch (e) { continue }
    if (stat.size > 262144) continue
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes('\\u0000')) continue
    const lines = text.split(/\\r?\\n/)
    for (let i = 0; i < lines.length && found.length < 200; i++) {
      const match = /\\b(TODO|FIXME)\\b[:\\s]*(.{0,120})/.exec(lines[i])
      if (match) {
        found.push(path.relative(root, file) + ':' + (i + 1) + '  ' + match[1] + ' ' + match[2].trim())
      }
    }
  }
  answer(
    found.length === 0 ? 'No notes found' : found.length + (found.length === 200 ? '+' : '') + ' notes',
    found.length === 0 ? 'No TODO or FIXME notes in this repository.' : found.join('\\n')
  )
} catch (e) {
  fail(String(e && e.message ? e.message : e))
}
`,
  },
  {
    id: 'repository-size-report',
    manifest: manifest(
      'repository-size-report',
      'Repository size report',
      'Adds up file sizes by file type and lists the largest files.',
      ['read-tracked-files']
    ),
    script: `${prelude}
try {
  const request = readRequest()
  const root = request.repositoryPath
  const byType = new Map()
  const sizes = []
  let total = 0
  const files = walk(root, 20000)
  for (const file of files) {
    let size = 0
    try { size = fs.statSync(file).size } catch (e) { continue }
    total += size
    const type = path.extname(file).toLowerCase() || '(no extension)'
    byType.set(type, (byType.get(type) || 0) + size)
    sizes.push([size, path.relative(root, file)])
  }
  const mb = n => (n / 1048576).toFixed(2) + ' MB'
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  const largest = sizes.sort((a, b) => b[0] - a[0]).slice(0, 10)
  answer(
    files.length + ' files, ' + mb(total),
    ['By file type:']
      .concat(types.map(t => '  ' + t[0].padEnd(16) + mb(t[1])))
      .concat(['', 'Largest files:'])
      .concat(largest.map(l => '  ' + mb(l[0]).padStart(12) + '  ' + l[1]))
      .concat(files.length >= 20000 ? ['', 'Stopped at 20,000 files.'] : [])
      .join('\\n')
  )
} catch (e) {
  fail(String(e && e.message ? e.message : e))
}
`,
  },
  {
    id: 'changed-files-summary',
    manifest: manifest(
      'changed-files-summary',
      'Changed files summary',
      'Groups the changed files by folder and file type. Sees file names only.',
      ['changed-files']
    ),
    script: `${prelude}
try {
  const request = readRequest()
  const files = request.changedFiles || []
  const count = (key) => {
    const map = new Map()
    for (const file of files) {
      const k = key(file)
      map.set(k, (map.get(k) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }
  const folders = count(f => (f.includes('/') ? f.split('/')[0] + '/' : '(top level)'))
  const types = count(f => path.extname(f).toLowerCase() || '(no extension)')
  answer(
    files.length + (files.length === 1 ? ' changed file' : ' changed files'),
    files.length === 0
      ? 'Nothing is changed right now.'
      : ['By folder:']
          .concat(folders.map(f => '  ' + String(f[1]).padStart(4) + '  ' + f[0]))
          .concat(['', 'By file type:'])
          .concat(types.map(t => '  ' + String(t[1]).padStart(4) + '  ' + t[0]))
          .join('\\n')
  )
} catch (e) {
  fail(String(e && e.message ? e.message : e))
}
`,
  },
]
