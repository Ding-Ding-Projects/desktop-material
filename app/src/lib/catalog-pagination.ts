/**
 * Pure pagination model shared by the product catalogs (GitHub REST and GraphQL
 * operation catalogs). It turns a filtered result count into a clamped, one-page
 * window so the UI can render rich First/Previous/Next/Last controls and an exact
 * "showing A–B of N" range instead of silently truncating long result sets.
 */

/** Page sizes offered by the catalog controls, smallest first. */
export const CatalogPageSizeOptions: ReadonlyArray<number> = Object.freeze([
  25, 50, 100, 200,
])

/** Default items per page when a catalog first renders. */
export const DefaultCatalogPageSize = 50

export interface ICatalogPage {
  /** One-based page index, always clamped into `[1, pageCount]`. */
  readonly page: number
  /** Normalized items per page (a positive integer). */
  readonly pageSize: number
  /** Total number of pages, always at least 1 even for an empty catalog. */
  readonly pageCount: number
  /** Total number of items across every page. */
  readonly totalItems: number
  /** Zero-based inclusive slice start for the current page. */
  readonly startIndex: number
  /** Zero-based exclusive slice end for the current page. */
  readonly endIndex: number
  /** One-based number of the first visible item, or 0 when the page is empty. */
  readonly startItem: number
  /** One-based number of the last visible item, or 0 when the page is empty. */
  readonly endItem: number
  /** Number of items visible on the current page. */
  readonly visibleItems: number
  /** True when an earlier page exists. */
  readonly hasPrevious: boolean
  /** True when a later page exists. */
  readonly hasNext: boolean
}

/** Coerce an arbitrary page size into a positive integer, or the default. */
export function normalizeCatalogPageSize(
  pageSize: number,
  fallback: number = DefaultCatalogPageSize
): number {
  if (!Number.isFinite(pageSize)) {
    return fallback
  }
  const rounded = Math.floor(pageSize)
  return rounded >= 1 ? rounded : fallback
}

/**
 * Resolve the page window for a total item count. Out-of-range page or page-size
 * requests are clamped rather than rejected, so stale state (for example a page
 * left behind when a filter shrinks the result set) always renders a valid page.
 */
export function paginateCatalog(
  totalItems: number,
  page: number,
  pageSize: number
): ICatalogPage {
  const size = normalizeCatalogPageSize(pageSize)
  const total = Number.isFinite(totalItems)
    ? Math.max(0, Math.floor(totalItems))
    : 0
  const pageCount = Math.max(1, Math.ceil(total / size))
  const requestedPage = Number.isFinite(page) ? Math.floor(page) : 1
  const clampedPage = Math.min(Math.max(1, requestedPage), pageCount)
  const startIndex = total === 0 ? 0 : (clampedPage - 1) * size
  const endIndex = Math.min(startIndex + size, total)
  const visibleItems = endIndex - startIndex
  return {
    page: clampedPage,
    pageSize: size,
    pageCount,
    totalItems: total,
    startIndex,
    endIndex,
    startItem: visibleItems === 0 ? 0 : startIndex + 1,
    endItem: endIndex,
    visibleItems,
    hasPrevious: clampedPage > 1,
    hasNext: clampedPage < pageCount,
  }
}

export interface ICatalogPageResult<T> {
  readonly page: ICatalogPage
  readonly items: ReadonlyArray<T>
}

/** Slice a filtered list down to the requested (clamped) page window. */
export function paginateCatalogItems<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number
): ICatalogPageResult<T> {
  const resolved = paginateCatalog(items.length, page, pageSize)
  return {
    page: resolved,
    items: items.slice(resolved.startIndex, resolved.endIndex),
  }
}
