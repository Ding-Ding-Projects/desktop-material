'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { verifyFixturePreserved } = require('./seed_direct_clone_recovery_fixture')

const SceneId = 'direct-clone-recovery'
const Outputs = Object.freeze(['direct-clone-recovery-blocked.png', 'direct-clone-recovery-rechecked.png'])
const Matrix = Object.freeze([1440, 960].flatMap(width =>
  ['english', 'cantonese', 'bilingual'].flatMap(languageMode =>
    ['light', 'dark'].flatMap(theme => [1, 1.25, 1.5, 2].map(scale => Object.freeze({
      width, height: width === 1440 ? 960 : 660, languageMode, theme, scale,
      scaleEvidence: 'CDP raster scale only; native Windows display scale requires separate evidence',
    }))))))

// This reviewed seam discovers the real App component. It neither creates
// replacement DOM nor synthesizes a product error or a recovery action.
function runtime(action, config) {
  const node = document.querySelector('#desktop-app-container')?.querySelector('*')
  const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))
  let fiber = key ? node[key] : null
  let app = null
  for (let n = 0; fiber && n < 150; n++, fiber = fiber.return) {
    if (fiber.stateNode?.props?.appStore && fiber.stateNode?.props?.dispatcher) { app = fiber.stateNode; break }
  }
  if (!app) throw new Error('Real application dispatcher unavailable.')
  const state = app.props.appStore.getState()
  if (!Array.isArray(state.accounts) || state.accounts.length !== 0) throw new Error('Fixture profile contains accounts or account isolation is unproved.')
  if (action === 'start') {
    globalThis.__directRecoveryScene = { complete: false, succeeded: false }
    app.props.dispatcher.clone(config.sourcePath, config.requestedPath, { defaultBranch: 'main' }).then(
      result => { globalThis.__directRecoveryScene = { complete: true, succeeded: result !== null } },
      () => { globalThis.__directRecoveryScene = { complete: true, succeeded: false } }
    )
    return true
  }
  const dialog = document.querySelector('#app-error')
  if (action === 'complete') {
    const repositories = state.repositories ?? []
    return !dialog && repositories.some(repository => repository.path === config.requestedPath && repository.missing === false)
  }
  if (!dialog) return false
  const errorKey = Object.keys(dialog).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))
  let current = errorKey ? dialog[errorKey] : null
  let error = null
  for (let n = 0; current && n < 150; n++, current = current.return) {
    const candidate = current.stateNode?.props?.error
    if (candidate?.metadata?.retryAction) { error = candidate; break }
  }
  const retry = error?.metadata?.retryAction
  if (!retry?.retainedDirectRecovery || retry.retainedDirectRecovery.path !== config.retainedPath ||
      retry.path !== config.requestedPath || retry.url !== config.sourcePath) return false
  const buttons = [...dialog.querySelectorAll('button')].filter(button => !button.disabled)
  // The production submit button owns onRetryAction in AppError.
  const button = dialog.querySelector('button[type="submit"]')
  if (!button || button.disabled || !buttons.includes(button)) return false
  if (action === 'retry') { globalThis.__directRecoveryPreviousError = error; button.click(); return true }
  if (globalThis.__directRecoveryPreviousError === error) return false
  const visibleRect = element => {
    const r = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0 ||
        r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 ||
        style.display === 'none' || style.visibility === 'hidden') throw new Error('Recovery surface exceeds viewport.')
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  const dialogRect = visibleRect(dialog)
  const actionRect = visibleRect(button)
  const description = dialog.querySelector('#app-error-description')
  if (!description || description.scrollWidth > description.clientWidth + 1) throw new Error('Recovery text overflows horizontally.')
  if (actionRect.width < 24 || actionRect.height < 24) throw new Error('Recovery action is too small.')
  if (actionRect.x < dialogRect.x || actionRect.y < dialogRect.y ||
      actionRect.x + actionRect.width > dialogRect.x + dialogRect.width + 1 ||
      actionRect.y + actionRect.height > dialogRect.y + dialogRect.height + 1) throw new Error('Recovery action escapes dialog.')
  const text = document.body.innerText + '\n' + [...document.querySelectorAll('input,textarea,[title],[aria-label],a[href]')]
    .map(element => [element.value ?? '', element.getAttribute('title') ?? '', element.getAttribute('aria-label') ?? '', element.getAttribute('href') ?? ''].join('\n')).join('\n')
  let redacted = text
  for (const allowed of [config.retainedPath, config.requestedPath, config.sourcePath]) redacted = redacted.split(allowed).join('[synthetic fixture]')
  if (/\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)|Bearer\s+\S+|[A-Z]:[\\/]Users[\\/]|AppData[\\/]|\/home\/|\/Users\/|https?:\/\/[^\s/]+@/i.test(redacted)) throw new Error('Recovery capture privacy check failed.')
  if (!document.body.classList.contains('theme-' + config.theme) ||
      document.body.getAttribute('data-dm-language-mode') !== config.languageMode) throw new Error('Recovery presentation tuple mismatch.')
  if (!dialog.textContent.includes(pathName(config.retainedPath)) || !dialog.textContent.includes(pathName(config.sourcePath))) throw new Error('Recovery context names are missing.')
  return { semantic: true, privacy: 'private-synthetic-paths-only', published: false, dialogRect, actionRect, devicePixelRatio,
    nativeDisplayScaleVerified: false, actionText: button.textContent.trim(), title: dialog.querySelector('h1,h2')?.textContent?.trim() ?? null }

  function pathName(value) { return value.split(/[\\/]/).pop() }
}

function expression(action, fixture, tuple) {
  return `(${runtime.toString()})(${JSON.stringify(action)},${JSON.stringify({
    sourcePath: fixture.sourcePath, requestedPath: fixture.requestedPath, retainedPath: fixture.retainedPath,
    theme: tuple.theme, languageMode: tuple.languageMode,
  })})`
}

/** Generate only a plan for the established cdp_driver.mjs. Its exact complete
 * target-array check and native process ancestry proof run before evaluation.
 * Run each tuple against a fresh fixture/profile. The caller owns native launch,
 * first-run completion, presentation setup and post-capture pixel inspection.
 */
function buildPlan({ fixture, tuple, receipt, endpoint, expectedUrl, outputRoot, phase = 'blocked' }) {
  if (!Matrix.some(row => ['width', 'height', 'theme', 'languageMode', 'scale'].every(k => row[k] === tuple[k]))) throw new Error('Unsupported capture tuple.')
  if (!['blocked', 'rechecked', 'complete', 'empty'].includes(phase)) throw new Error('Unsupported recovery phase.')
  verifyFixturePreserved(fixture, { journalRequired: phase === 'blocked' || phase === 'rechecked' })
  const relative = path.relative(fixture.runRoot, path.resolve(outputRoot))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must remain inside fixture run root.')
  if (!fs.statSync(outputRoot).isDirectory() || fs.realpathSync(outputRoot) !== path.resolve(outputRoot)) throw new Error('Output must be an existing non-linked directory.')
  const steps = [{ id: 'viewport', op: 'emulate', width: tuple.width, height: tuple.height, scale: tuple.scale, mobile: false, touch: false }]
  if (phase === 'blocked' || phase === 'empty') steps.push({ id: 'request-real-clone', op: 'evaluate', expression: expression('start', fixture, tuple) })
  else steps.push({ id: 'click-production-retry', op: 'evaluate', expression: expression('retry', fixture, tuple) })
  if (phase === 'complete' || phase === 'empty') {
    steps.push({ id: 'clone-completed', op: 'poll', expression: expression('complete', fixture, tuple), equals: true, intervalMs: 200 })
    // Success is filesystem/runtime evidence. No unchecked background page is
    // captured: the scene's privacy and geometry assertions describe the dialog.
  } else {
    steps.push({ id: 'typed-recovery-visible', op: 'poll', expression: `Boolean(${expression('inspect', fixture, tuple)})`, equals: true, intervalMs: 200 })
    steps.push({ id: 'semantic-geometry-privacy', op: 'evaluate', expression: expression('inspect', fixture, tuple) })
    steps.push({ id: 'original-private-capture', op: 'capture', path: path.join(outputRoot, Outputs[phase === 'blocked' ? 0 : 1]), overwrite: false })
  }
  return { version: 1, receipt, endpoint, expectedUrl, allowEvaluate: true, observeRuntime: true, timeoutMs: 60000, steps }
}

module.exports = { SceneId, Outputs, Matrix, buildPlan, expression, runtime }
