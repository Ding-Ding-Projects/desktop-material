import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  CatalogPageSizeOptions,
  DefaultCatalogPageSize,
  normalizeCatalogPageSize,
  paginateCatalog,
  paginateCatalogItems,
} from '../../src/lib/catalog-pagination'

describe('catalog pagination', () => {
  it('offers ascending, unique, positive page sizes including the default', () => {
    assert.ok(CatalogPageSizeOptions.length > 0)
    assert.ok(CatalogPageSizeOptions.includes(DefaultCatalogPageSize))
    const sorted = [...CatalogPageSizeOptions].sort((a, b) => a - b)
    assert.deepEqual([...CatalogPageSizeOptions], sorted)
    assert.equal(
      new Set(CatalogPageSizeOptions).size,
      CatalogPageSizeOptions.length
    )
    for (const size of CatalogPageSizeOptions) {
      assert.ok(Number.isInteger(size) && size > 0)
    }
  })

  it('normalizes page size to a positive integer or the fallback', () => {
    assert.equal(normalizeCatalogPageSize(50), 50)
    assert.equal(normalizeCatalogPageSize(50.9), 50)
    assert.equal(normalizeCatalogPageSize(0), DefaultCatalogPageSize)
    assert.equal(normalizeCatalogPageSize(-5), DefaultCatalogPageSize)
    assert.equal(normalizeCatalogPageSize(Number.NaN), DefaultCatalogPageSize)
    assert.equal(
      normalizeCatalogPageSize(Number.POSITIVE_INFINITY),
      DefaultCatalogPageSize
    )
    assert.equal(normalizeCatalogPageSize(0, 10), 10)
  })

  it('computes an exact first-page window', () => {
    const page = paginateCatalog(1446, 1, 50)
    assert.equal(page.page, 1)
    assert.equal(page.pageSize, 50)
    assert.equal(page.pageCount, 29)
    assert.equal(page.totalItems, 1446)
    assert.equal(page.startIndex, 0)
    assert.equal(page.endIndex, 50)
    assert.equal(page.startItem, 1)
    assert.equal(page.endItem, 50)
    assert.equal(page.visibleItems, 50)
    assert.equal(page.hasPrevious, false)
    assert.equal(page.hasNext, true)
  })

  it('computes a partial final page', () => {
    const page = paginateCatalog(1446, 29, 50)
    assert.equal(page.page, 29)
    assert.equal(page.startIndex, 1400)
    assert.equal(page.endIndex, 1446)
    assert.equal(page.startItem, 1401)
    assert.equal(page.endItem, 1446)
    assert.equal(page.visibleItems, 46)
    assert.equal(page.hasPrevious, true)
    assert.equal(page.hasNext, false)
  })

  it('clamps out-of-range and non-finite page requests to the valid range', () => {
    assert.equal(paginateCatalog(120, 999, 50).page, 3)
    assert.equal(paginateCatalog(120, 0, 50).page, 1)
    assert.equal(paginateCatalog(120, -4, 50).page, 1)
    assert.equal(paginateCatalog(120, Number.NaN, 50).page, 1)
  })

  it('always reports at least one page, even when empty', () => {
    const page = paginateCatalog(0, 1, 50)
    assert.equal(page.pageCount, 1)
    assert.equal(page.totalItems, 0)
    assert.equal(page.startIndex, 0)
    assert.equal(page.endIndex, 0)
    assert.equal(page.startItem, 0)
    assert.equal(page.endItem, 0)
    assert.equal(page.visibleItems, 0)
    assert.equal(page.hasPrevious, false)
    assert.equal(page.hasNext, false)
  })

  it('slices items to the clamped page window', () => {
    const items = Array.from({ length: 130 }, (_value, index) => index)
    const first = paginateCatalogItems(items, 1, 50)
    assert.deepEqual([...first.items], items.slice(0, 50))

    const last = paginateCatalogItems(items, 99, 50)
    assert.equal(last.page.page, 3)
    assert.deepEqual([...last.items], items.slice(100, 130))
    assert.equal(last.items.length, 30)
  })
})
