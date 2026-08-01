import assert from 'node:assert'
import { describe, it } from 'node:test'

import { isSameDocumentReloadUrl } from '../../src/lib/same-document-reload'

const AppUrl = 'file:///C:/app/out/index.html'

describe('isSameDocumentReloadUrl', () => {
  it('allows a reload of the exact current URL', () => {
    assert.equal(isSameDocumentReloadUrl(AppUrl, AppUrl), true)
  })

  it('ignores the fragment on either side', () => {
    assert.equal(isSameDocumentReloadUrl(`${AppUrl}#lc=CA&ws`, AppUrl), true)
    assert.equal(isSameDocumentReloadUrl(AppUrl, `${AppUrl}#restored`), true)
    assert.equal(isSameDocumentReloadUrl(`${AppUrl}#a`, `${AppUrl}#b`), true)
  })

  it('denies navigation to a different document', () => {
    assert.equal(isSameDocumentReloadUrl(AppUrl, 'https://example.com/'), false)
    assert.equal(
      isSameDocumentReloadUrl(AppUrl, 'file:///C:/app/out/other.html'),
      false
    )
  })

  it('denies when the current URL is unknown', () => {
    assert.equal(isSameDocumentReloadUrl('', AppUrl), false)
  })
})
