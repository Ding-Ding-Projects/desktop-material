import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readSource = (...segments: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...segments), 'utf8')

const appSource = readSource('app', 'src', 'ui', 'app.tsx')
const appStoreSource = readSource('app', 'src', 'lib', 'stores', 'app-store.ts')

describe('progressive startup safety boundaries', () => {
  it('reveals only a non-mutating shell until critical state is ready', () => {
    const startupShell = appSource.slice(
      appSource.indexOf('private renderStartupShell'),
      appSource.indexOf(
        'public render()',
        appSource.indexOf('private renderStartupShell')
      )
    )

    assert.match(
      appSource,
      /this\.loading \? \(\s*this\.renderStartupShell\(\)/
    )
    assert.doesNotMatch(appSource, /aria-busy=\{this\.loading\}/)
    assert.match(startupShell, /className="startup-shell" aria-busy=\{true\}/)
    assert.doesNotMatch(
      startupShell,
      /renderApp|renderWelcomeFlow|renderPopups|dispatcher/
    )
  })

  it('does not update or schedule renderer work after unmount', () => {
    assert.match(
      appSource,
      /loadInitialState\(\)\.then\([\s\S]*?if \(this\.disposed\) \{\s*return/
    )
    assert.match(
      appSource,
      /componentWillUnmount\(\)[\s\S]*?this\.disposed = true/
    )
    assert.match(
      appSource,
      /performDeferredLaunchActions\(\) \{\s*if \(!this\.mounted\) \{\s*return/
    )
    assert.match(
      appSource,
      /await isInApplicationFolder\(\)[\s\S]*?if \(!this\.mounted\) \{\s*return/
    )
  })

  it('starts automatic cloning only after successful current recovery', () => {
    const deferred = appStoreSource.slice(
      appStoreSource.indexOf('private async loadDeferredInitialState'),
      appStoreSource.indexOf('private notifyRecoveredBatchClone')
    )

    assert.match(
      deferred,
      /const cloneQueueRecovered = await this\.runDeferredStartupStep\([\s\S]*?batchCloneStore\.initialize\(\)[\s\S]*?finalizeBatchClone\(\)/
    )
    assert.match(
      deferred,
      /if \(\s*cloneQueueRecovered &&\s*this\.isDeferredStartupCurrent\(generation\)\s*\)[\s\S]*?autoCloneStore\.start\(\)/
    )
    assert.match(
      appStoreSource,
      /runDeferredStartupStep\([\s\S]*?\): Promise<boolean>/
    )
  })

  it('fences deferred startup before shutdown drains producers', () => {
    const shutdown = appStoreSource.slice(
      appStoreSource.indexOf('public async flushForShutdown'),
      appStoreSource.indexOf('public async _quitApp')
    )

    assert.match(shutdown, /this\.deferredStartupShutdown = true/)
    assert.match(shutdown, /this\.deferredStartupGeneration\+\+/)
    assert.ok(
      shutdown.indexOf('this.deferredStartupGeneration++') <
        shutdown.indexOf('this.autoCloneStore.stop()')
    )
  })

  it('keeps editor discovery side-effect free and rejects stale resolution', () => {
    const lookup = appStoreSource.slice(
      appStoreSource.indexOf('private async lookupSelectedExternalEditor'),
      appStoreSource.indexOf(
        '/**',
        appStoreSource.indexOf('private async lookupSelectedExternalEditor')
      )
    )
    const resolve = appStoreSource.slice(
      appStoreSource.indexOf('public async _resolveCurrentEditor'),
      appStoreSource.indexOf('public getResolvedExternalEditor')
    )

    assert.doesNotMatch(lookup, /localStorage\.(?:setItem|removeItem)/)
    assert.match(resolve, /requestedEditor = this\.selectedExternalEditor/)
    assert.match(resolve, /\+\+this\.externalEditorResolutionGeneration/)
    assert.match(resolve, /requestedEditor !== this\.selectedExternalEditor/)
  })

  it('audits refreshed account tokens and leaves transient failures retryable', () => {
    const deferred = appStoreSource.slice(
      appStoreSource.indexOf('private async loadDeferredInitialState'),
      appStoreSource.indexOf('private notifyRecoveredBatchClone')
    )
    const audit = appStoreSource.slice(
      appStoreSource.indexOf('private async auditAccountOAuthScopes'),
      appStoreSource.indexOf('public _recordInsufficientScopesDismissal')
    )

    assert.match(
      deferred,
      /const scopeAudit = accountRefresh\.then\(async refreshed =>/
    )
    assert.match(audit, /candidate\.token === account\.token/)
    assert.match(audit, /this\.scopeAuditedAccounts\.delete\(key\)/)
    assert.match(audit, /leaving it retryable/)
  })
})
