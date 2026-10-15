'use strict'

// Disposable filesystem fixture, never a replacement for the production store.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { parseArguments } = require('./seed_batch_clone_recovery_fixture')

const JournalName = 'clone-direct-v1.json'
const ContainerName = '.desktop-material-clone-staging-v1'
const Sentinel = 'Synthetic recovery fixture. Preserve this file.\n'
const RecoveryId = 'ad'.repeat(24)

function seedDirectCloneRecoveryFixture(requested) {
  const options = parseArguments([
    '--run-root', requested.runRoot,
    '--user-data-path', requested.userDataPath,
    '--destination-root', requested.destinationRoot,
  ])
  const { runRoot, userDataPath, destinationRoot } = options
  const variant = requested.variant ?? 'blocked'
  if (!['blocked', 'empty'].includes(variant)) throw new Error('Unknown fixture variant.')
  // Nested roots would allow destination writes to pollute the profile.
  for (const [a, b] of [[userDataPath, destinationRoot], [destinationRoot, userDataPath]]) {
    const relative = path.relative(a, b)
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Fixture roots overlap.')
  }
  if (fs.readdirSync(userDataPath).length || fs.readdirSync(destinationRoot).length) {
    throw new Error('Fixture roots must be empty.')
  }
  const receiptPath = path.join(runRoot, 'direct-recovery-fixture.json')
  if (fs.existsSync(receiptPath)) throw new Error('Fixture receipt already exists.')
  const retainedPath = path.join(destinationRoot, 'retained-local-repository')
  const sourcePath = path.join(destinationRoot, 'local-clone-source')
  const requestedPath = path.join(destinationRoot, 'requested-local-clone')
  const containerPath = path.join(destinationRoot, ContainerName)
  for (const directory of [retainedPath, sourcePath, containerPath]) fs.mkdirSync(directory)
  // No provider or network is involved. The source has one clean commit so
  // the real staged-clone completeness validator can accept its checkout.
  for (const directory of [retainedPath, sourcePath]) {
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '--quiet', '--initial-branch=main', directory], {
      windowsHide: true, stdio: 'pipe', timeout: 10000,
    })
  }
  fs.writeFileSync(path.join(sourcePath, 'README.txt'), 'Synthetic local clone source.\n', { flag: 'wx' })
  execFileSync('git', ['-C', sourcePath, 'add', '--', 'README.txt'], { windowsHide: true, stdio: 'pipe', timeout: 10000 })
  execFileSync('git', ['-C', sourcePath, '-c', 'commit.gpgsign=false', 'commit', '--quiet',
    '-m', 'Seed deterministic capture source', '-m', 'Keep the fixture small enough to inspect. 測試來源細細份，睇得清楚。',
    '-m', 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'], {
    windowsHide: true, stdio: 'pipe', timeout: 10000,
    env: { ...process.env, GIT_AUTHOR_NAME: 'Claude Fable 5.1', GIT_AUTHOR_EMAIL: 'noreply@anthropic.com',
      GIT_COMMITTER_NAME: 'Claude Fable 5.1', GIT_COMMITTER_EMAIL: 'noreply@anthropic.com',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' },
  })
  fs.writeFileSync(path.join(retainedPath, 'sentinel.txt'), Sentinel, { flag: 'wx' })
  if (variant === 'blocked') {
    fs.writeFileSync(path.join(containerPath, 'fixture-blocker.txt'), Sentinel, { flag: 'wx' })
  }
  const journal = {
    version: 2, updatedAt: '2026-01-01T00:00:00.000Z',
    items: [{ url: sourcePath, name: path.basename(retainedPath), path: retainedPath, recoveryId: RecoveryId }],
    statuses: [[retainedPath, { kind: 'interrupted' }]],
    mode: 'sequential', source: 'manual', paused: false, generation: 1,
  }
  const journalPath = path.join(userDataPath, JournalName)
  const bytes = JSON.stringify(journal, null, 2) + '\n'
  fs.writeFileSync(journalPath, bytes, { flag: 'wx', mode: 0o600 })
  const receipt = {
    version: 1, fixture: 'direct-clone-recovery', variant,
    runRoot, userDataPath, destinationRoot, journalPath,
    retainedPath, sourcePath, requestedPath, containerPath,
    recoveryId: RecoveryId, journalSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sentinelSha256: crypto.createHash('sha256').update(Sentinel).digest('hex'),
    network: 'none', published: false,
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return receipt
}

function verifyFixturePreserved(receipt, { journalRequired = true } = {}) {
  const { runRoot, userDataPath, destinationRoot } = parseArguments([
    '--run-root', receipt.runRoot, '--user-data-path', receipt.userDataPath,
    '--destination-root', receipt.destinationRoot,
  ])
  if (receipt.fixture !== 'direct-clone-recovery' || receipt.version !== 1 ||
      receipt.retainedPath !== path.join(destinationRoot, 'retained-local-repository') ||
      receipt.sourcePath !== path.join(destinationRoot, 'local-clone-source') ||
      receipt.requestedPath !== path.join(destinationRoot, 'requested-local-clone') ||
      receipt.containerPath !== path.join(destinationRoot, ContainerName) ||
      receipt.journalPath !== path.join(userDataPath, JournalName)) throw new Error('Fixture receipt mismatch.')
  for (const candidate of [receipt.retainedPath, receipt.sourcePath, receipt.requestedPath, receipt.containerPath]) {
    if (fs.existsSync(candidate) && (fs.lstatSync(candidate).isSymbolicLink() || fs.realpathSync(candidate) !== candidate)) {
      throw new Error('Fixture path changed identity.')
    }
  }
  const sentinelPath = path.join(receipt.retainedPath, 'sentinel.txt')
  if (!fs.lstatSync(sentinelPath).isFile() || fs.lstatSync(sentinelPath).isSymbolicLink() || fs.lstatSync(sentinelPath).nlink !== 1) throw new Error('Destination sentinel changed identity.')
  if (fs.readFileSync(sentinelPath, 'utf8') !== Sentinel) throw new Error('Destination sentinel changed.')
  if (journalRequired && crypto.createHash('sha256').update(fs.readFileSync(receipt.journalPath)).digest('hex') !== receipt.journalSha256) {
    throw new Error('Retained journal changed.')
  }
  return { preserved: true, runRoot }
}

function removeOwnedBlocker(receipt) {
  verifyFixturePreserved(receipt)
  const target = path.join(receipt.containerPath, 'fixture-blocker.txt')
  const entries = fs.readdirSync(receipt.containerPath)
  if (entries.length !== 1 || entries[0] !== 'fixture-blocker.txt' ||
      !fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() ||
      fs.lstatSync(target).nlink !== 1 || fs.readFileSync(target, 'utf8') !== Sentinel) {
    throw new Error('Only the exact owned synthetic blocker may be removed.')
  }
  fs.unlinkSync(target)
  return { removed: 'fixture-blocker.txt', destinationPreserved: true }
}

module.exports = { seedDirectCloneRecoveryFixture, verifyFixturePreserved, removeOwnedBlocker, JournalName, ContainerName, Sentinel }

if (require.main === module) {
  const argv = process.argv.slice(2)
  const variantIndex = argv.indexOf('--variant')
  const variant = variantIndex < 0 ? 'blocked' : argv.splice(variantIndex, 2)[1]
  const receipt = seedDirectCloneRecoveryFixture({ ...parseArguments(argv), variant })
  // Full paths belong only in the private run-root receipt.
  process.stdout.write(JSON.stringify({ fixture: receipt.fixture, variant, itemCount: 1, journalSha256: receipt.journalSha256 }) + '\n')
}
