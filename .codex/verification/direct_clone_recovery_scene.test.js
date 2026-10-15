'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const { execFileSync } = require('node:child_process')
const fixtureModule = require('./seed_direct_clone_recovery_fixture')
const scene = require('./direct_clone_recovery_scene')
const gallery = require('./gallery_capture_plan')

function ownedFixture(t, variant = 'blocked') {
  const runRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-material-p0-ui-direct-test-')))
  const userDataPath = path.join(runRoot, 'profile')
  const destinationRoot = path.join(runRoot, 'destinations')
  const outputRoot = path.join(runRoot, 'captures')
  for (const directory of [userDataPath, destinationRoot, outputRoot]) fs.mkdirSync(directory)
  t.after(() => {
    assert.ok(path.relative(fs.realpathSync(os.tmpdir()), runRoot).startsWith('desktop-material-p0-ui-direct-test-'))
    fs.rmSync(runRoot, { recursive: true, force: true })
  })
  return { fixture: fixtureModule.seedDirectCloneRecoveryFixture({ runRoot, userDataPath, destinationRoot, variant }), outputRoot }
}

function options(owned, tuple = scene.Matrix[0], phase = 'blocked') {
  return { ...owned, tuple, phase, receipt: path.join(owned.fixture.runRoot, 'lifecycle.json'), endpoint: 'http://127.0.0.1:9333', expectedUrl: 'file:///fixture/index.html' }
}

test('one private scene owns exactly two captures and 48 unique tuples', () => {
  const registration = gallery.registeredPrivateScene('direct-clone-recovery')
  assert.equal(gallery.PrivateCaptureSceneEntries.filter(row => row.scene === scene.SceneId).length, 1)
  assert.equal(registration.published, false)
  assert.deepEqual(registration.outputs, ['direct-clone-recovery-blocked.png', 'direct-clone-recovery-rechecked.png'])
  assert.equal(registration.matrix.length, 48)
  assert.equal(new Set(registration.matrix.map(row => JSON.stringify(row))).size, 48)
  assert.equal(registration.buildPlan, scene.buildPlan)
  assert.equal(gallery.GalleryCapturePlan.length, 98)
  for (const key of ['fixture', 'privacyGate', 'geometryGate', 'evidenceDestination']) assert.ok(registration[key])
})

test('removing the actual registration makes the registration check red; restored source passes', () => {
  const filename = path.join(__dirname, 'gallery_capture_plan.js')
  const source = fs.readFileSync(filename, 'utf8')
  const mutated = source.replace("scene: 'direct-clone-recovery',", "scene: 'removed-direct-clone-recovery',")
  assert.notEqual(mutated, source)
  const context = { require: createRequire(filename), __dirname, module: { exports: {} }, process }
  vm.runInNewContext(mutated, context, { filename })
  assert.throws(() => context.module.exports.registeredPrivateScene(scene.SceneId), /exactly once/)
  assert.equal(gallery.registeredPrivateScene(scene.SceneId).scene, scene.SceneId)
})

test('real local repositories and v2 retained journal preserve bytes across owned blocker removal', t => {
  const { fixture } = ownedFixture(t)
  assert.equal(execFileSync('git', ['-C', fixture.retainedPath, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', windowsHide: true }).trim(), 'true')
  const before = fs.readFileSync(fixture.journalPath)
  const journal = JSON.parse(before)
  assert.equal(journal.version, 2)
  assert.equal(journal.items[0].path, fixture.retainedPath)
  assert.equal(journal.items[0].url, fixture.sourcePath)
  assert.equal(journal.statuses[0][1].kind, 'interrupted')
  assert.equal(journal.items[0].recoveryId.length, 48)
  assert.equal(fixture.network, 'none')
  assert.equal(fixture.published, false)
  assert.equal(fixtureModule.verifyFixturePreserved(fixture).preserved, true)
  assert.deepEqual(fixtureModule.removeOwnedBlocker(fixture), { removed: 'fixture-blocker.txt', destinationPreserved: true })
  assert.deepEqual(fs.readFileSync(fixture.journalPath), before)
  assert.equal(fs.readFileSync(path.join(fixture.retainedPath, 'sentinel.txt'), 'utf8'), fixtureModule.Sentinel)
  assert.throws(() => fixtureModule.removeOwnedBlocker(fixture), /exact owned/)
})

test('each plan uses real entry/retry and a semantic/privacy/geometry check immediately before capture', t => {
  const owned = ownedFixture(t)
  for (const tuple of scene.Matrix) {
    for (const phase of ['blocked', 'rechecked']) {
      const plan = scene.buildPlan(options(owned, tuple, phase))
      assert.equal(plan.observeRuntime, true)
      assert.equal(plan.timeoutMs, 60000)
      assert.equal(plan.steps[1].id, phase === 'blocked' ? 'request-real-clone' : 'click-production-retry')
      assert.equal(plan.steps.at(-2).id, 'semantic-geometry-privacy')
      assert.equal(plan.steps.at(-1).op, 'capture')
      assert.equal(path.basename(plan.steps.at(-1).path), scene.Outputs[phase === 'blocked' ? 0 : 1])
    }
  }
  for (const phase of ['complete', 'empty']) {
    const plan = scene.buildPlan(options(owned, scene.Matrix[0], phase))
    assert.equal(plan.steps.some(step => step.op === 'capture'), false)
    assert.equal(plan.steps.at(-1).id, 'clone-completed')
  }
})

test('rejects changed receipt paths, sentinel, journal, unknown tuple and escaped outputs', t => {
  const owned = ownedFixture(t)
  for (const field of ['sourcePath', 'requestedPath', 'retainedPath', 'journalPath', 'containerPath']) {
    assert.throws(() => fixtureModule.verifyFixturePreserved({ ...owned.fixture, [field]: path.join(owned.fixture.runRoot, 'wrong') }), /mismatch/)
  }
  assert.throws(() => scene.buildPlan({ ...options(owned), outputRoot: path.dirname(owned.fixture.runRoot) }), /inside/)
  assert.throws(() => scene.buildPlan(options(owned, { ...scene.Matrix[0], width: 999 })), /Unsupported/)
  fs.appendFileSync(owned.fixture.journalPath, ' ')
  assert.throws(() => fixtureModule.verifyFixturePreserved(owned.fixture), /journal changed/)
  fs.writeFileSync(path.join(owned.fixture.retainedPath, 'sentinel.txt'), 'changed')
  assert.throws(() => fixtureModule.verifyFixturePreserved(owned.fixture, { journalRequired: false }), /sentinel changed/)
})

test('empty-container fixture retains its repository and never overwrites populated roots', t => {
  const { fixture } = ownedFixture(t, 'empty')
  assert.deepEqual(fs.readdirSync(fixture.containerPath), [])
  assert.equal(fixtureModule.verifyFixturePreserved(fixture).preserved, true)
  assert.throws(() => fixtureModule.seedDirectCloneRecoveryFixture(fixture), /empty/)
})
