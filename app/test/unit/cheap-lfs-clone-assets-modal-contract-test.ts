import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `Missing contract boundary: ${start}`)

  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `Missing contract boundary: ${end}`)

  return source.slice(startIndex, endIndex)
}

describe('Cheap LFS clone asset selection modal contract', () => {
  it('keeps the manifest-bound selector blocking until the user decides', () => {
    const app = read('app/src/ui/app.tsx')
    const modalTypes = between(
      app,
      'const ModalPopupTypes = new Set<PopupType>([',
      '\n])'
    )
    assert.match(modalTypes, /PopupType\.CheapLfsCloneAssets,/)

    const popupCase = between(
      app,
      '      case PopupType.CheapLfsCloneAssets:',
      '\n      case PopupType.SubmoduleManager:'
    )
    assert.match(popupCase, /<CheapLfsAssetSelectorDialog/)
    assert.match(popupCase, /manifestBlobSha=\{popup\.manifestBlobSha\}/)
    assert.match(popupCase, /inventory=\{popup\.inventory\}/)
    assert.match(popupCase, /initialSelection=\{popup\.initialSelection\}/)
    assert.match(popupCase, /onDismissed=\{onPopupDismissedFn\}/)
  })
})
