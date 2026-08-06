import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8')

const importer = read(
  'app',
  'src',
  'ui',
  'repository-list-transfer',
  'import-repositories-dialog.tsx'
)
const transferFormat = read('app', 'src', 'lib', 'repo-list-file.ts')
const batchStore = read('app', 'src', 'lib', 'stores', 'batch-clone-store.ts')
const appStore = read('app', 'src', 'lib', 'stores', 'app-store.ts')
const preferences = read('app', 'src', 'models', 'build-run-preferences.ts')

describe('repository-list transfer Cheap LFS contract', () => {
  it('keeps shared transfer files URL-only and token-free', () => {
    assert.match(transferFormat, /contains only remote clone URLs/)
    assert.match(transferFormat, /never local paths, account tokens/)
    assert.match(importer, /selected\.map\(url => \(\{\s*url,?\s*\}\)\)/)
    assert.doesNotMatch(importer, /token\s*:/)
  })

  it('runs the same post-clone Cheap LFS materialization used by normal clones', () => {
    assert.match(batchStore, /cheapLfsSelection:\s*item\.cheapLfsSelection/)
    assert.match(
      appStore,
      /await this\.maybeAutoMaterializeCheapLfs\(registered,\s*\{/
    )
    assert.match(appStore, /expectedCloneUrl: cloneItem\.url/)
    assert.match(appStore, /expectedDefaultBranch: cloneItem\.defaultBranch/)
  })

  it('keeps automatic large-file restoration enabled by default', () => {
    assert.match(preferences, /autoMaterializeCheapLfs:\s*true/)
  })

  it('tells the user what happens when account-bound selection is not portable', () => {
    assert.match(importer, /repositoryTransfer\.cheapLfsNote/)
    assert.match(importer, /t\('repositoryTransfer\.cheapLfsNote'\)/)
  })
})
