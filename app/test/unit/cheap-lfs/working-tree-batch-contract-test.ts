import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('working-tree Cheap LFS batch action', () => {
  it('routes the exact context-menu selection into one reviewable popup', () => {
    const changes = read('app/src/ui/changes/filter-changes-list.tsx')

    assert.match(changes, /selectedFileIDs\.forEach\(addItemToArray\)/)
    assert.match(changes, /const cheapLfsTargets = selectedFiles\.filter\(/)
    assert.match(
      changes,
      /selectedFile\.selection\.getSelectionType\(\) !== DiffSelectionType\.Partial/
    )
    assert.match(changes, /PopupType\.StoreWorkingTreeFilesInCheapLfs/)
    assert.match(
      changes,
      /paths: cheapLfsTargets\.map\(target => target\.path\)/
    )
    assert.match(changes, /excludedPaths: cheapLfsExcludedPaths/)
  })

  it('uses one backend batch and one repository refresh boundary', () => {
    const store = read('app/src/lib/stores/app-store.ts')
    const dispatcher = read('app/src/ui/dispatcher/dispatcher.ts')

    assert.match(store, /_storeWorkingTreeFilesInCheapLfs\(/)
    assert.match(store, /ensureCheapLfsReleaseAnchor\(repository\)/)
    assert.match(store, /reviewCheapLfsReleaseInventory\(repository\)/)
    assert.match(store, /pinCheapLfsFilesToOci\(/)
    assert.match(
      store,
      /finally \{\s*await this\._refreshRepository\(repository\)/
    )
    assert.match(dispatcher, /storeWorkingTreeFilesInCheapLfs\(/)
  })
})
