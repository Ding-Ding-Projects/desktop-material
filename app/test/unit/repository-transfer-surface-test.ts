import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8')

const dialog = read(
  'app',
  'src',
  'ui',
  'repository-transfer',
  'repository-transfer-dialog.tsx'
)
const appStore = read('app', 'src', 'lib', 'stores', 'app-store.ts')
const menu = read('app', 'src', 'main-process', 'menu', 'build-default-menu.ts')
const palette = read('app', 'src', 'lib', 'command-palette-catalog.ts')

describe('repository transfer surface', () => {
  it('offers the two explicit history modes and a second-account sign-in path', () => {
    assert.match(dialog, /Full history/)
    assert.match(dialog, /Clean state/)
    assert.match(dialog, /Sign in to another account/)
    assert.match(dialog, /showDotComSignInDialog\(resultCallback\)/)
    assert.match(dialog, /showEnterpriseSignInDialog\([\s\S]*resultCallback/)
  })

  it('requires two confirmations and a full-range authorization slider', () => {
    assert.match(dialog, /confirmedDestination/)
    assert.match(dialog, /confirmedHistory/)
    assert.match(dialog, /type="range"/)
    assert.match(dialog, /confirmationProgress === 100/)
    assert.match(dialog, /Emergency exit/)
  })

  it('keeps the old remote and history recoverable while publishing the destination', () => {
    assert.match(appStore, /cloneRepositoryTransferHistory/)
    assert.match(appStore, /pushRepositoryTransferBranches/)
    assert.match(appStore, /pushRepositoryTransferTags/)
    assert.match(appStore, /createRepositoryTransferRecoveryRef/)
    assert.match(appStore, /RepositoryTransferRecoveryRefPrefix/)
    assert.match(
      appStore,
      /mode === 'full-history' && status\.workingDirectory\.files\.length > 0/
    )
    assert.match(appStore, /addRemote\(repository, 'upstream'/)
    assert.match(appStore, /upstreamAdded = true[\s\S]*explicitOriginPushURL/)
    assert.match(appStore, /verifyRepositoryTransferRemote/)
  })

  it('is discoverable from the Repository menu and command palette', () => {
    assert.match(menu, /id: 'transfer-repository'/)
    assert.match(menu, /emit\('transfer-repository'\)/)
    assert.match(palette, /event: 'transfer-repository'/)
    assert.match(palette, /whenGitHubRepository/)
  })
})
