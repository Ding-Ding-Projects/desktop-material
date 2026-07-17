import catalogSource from '../../../.codex/audits/github-rest-operations-2026-03-10.json'
import { GitHubRepository } from '../models/github-repository'

export type GitHubAPIOperationMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'

export interface IGitHubAPIOperationParameter {
  readonly name: string
  readonly in: 'path' | 'query'
  readonly required: boolean
  readonly type: string
  readonly values?: ReadonlyArray<unknown>
}

export interface IGitHubAPIOperation {
  readonly id: string
  readonly method: GitHubAPIOperationMethod
  readonly path: string
  readonly summary: string
  readonly category: string
  readonly subcategory: string | null
  readonly documentationUrl: string | null
  readonly cloudOnly: boolean
  readonly enabledForGitHubApps: boolean
  readonly deprecated: boolean
  readonly parameters: ReadonlyArray<IGitHubAPIOperationParameter>
  readonly requestBodyRequired: boolean
  readonly requestBodyContentTypes: ReadonlyArray<string>
}

interface IGitHubAPIOperationCatalogSource {
  readonly purpose: string
  readonly apiVersion: string
  readonly sourceCommit: string
  readonly previousSourceCommit: string
  readonly sourceSha256: string
  readonly sourceUrl: string
  readonly inventory: {
    readonly paths: number
    readonly operations: number
    readonly tags: number
    readonly categories: number
    readonly webhooks: number
  }
  readonly newOperationIds: ReadonlyArray<string>
  readonly categories: ReadonlyArray<{
    readonly name: string
    readonly count: number
  }>
  readonly operations: ReadonlyArray<IGitHubAPIOperation>
}

const catalog = catalogSource as unknown as IGitHubAPIOperationCatalogSource
const operationIds = new Set(catalog.operations.map(operation => operation.id))
if (
  catalog.operations.length !== catalog.inventory.operations ||
  operationIds.size !== catalog.operations.length
) {
  throw new Error(
    'The GitHub API operation catalog is incomplete or duplicated.'
  )
}
for (const operationId of catalog.newOperationIds) {
  if (!operationIds.has(operationId)) {
    throw new Error(`The GitHub API catalog is missing ${operationId}.`)
  }
}

export const GitHubAPICatalogVersion = catalog.apiVersion
export const GitHubAPICatalogSourceCommit = catalog.sourceCommit
export const GitHubAPICatalogPreviousSourceCommit = catalog.previousSourceCommit
export const GitHubAPICatalogSourceURL = catalog.sourceUrl
export const GitHubAPICatalogInventory = Object.freeze({ ...catalog.inventory })
export const GitHubAPICatalogCategories = Object.freeze(
  catalog.categories.map(category => Object.freeze({ ...category }))
)
export const GitHubAPIOperations = Object.freeze(
  catalog.operations.map(operation => Object.freeze(operation))
)
export const NewGitHubAPIOperationIds = Object.freeze([
  ...catalog.newOperationIds,
])

const newOperationIds = new Set(NewGitHubAPIOperationIds)

export function isNewGitHubAPIOperation(operationId: string): boolean {
  return newOperationIds.has(operationId)
}

export interface IGitHubAPIOperationFilter {
  readonly query?: string
  readonly category?: string | null
  readonly newOnly?: boolean
}

/** Search the complete catalog without changing its stable source order. */
export function filterGitHubAPIOperations(
  filter: IGitHubAPIOperationFilter
): ReadonlyArray<IGitHubAPIOperation> {
  const terms = (filter.query ?? '')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 0)
  return GitHubAPIOperations.filter(operation => {
    if (filter.newOnly === true && !newOperationIds.has(operation.id)) {
      return false
    }
    if (
      filter.category !== undefined &&
      filter.category !== null &&
      filter.category.length > 0 &&
      operation.category !== filter.category
    ) {
      return false
    }
    if (terms.length === 0) {
      return true
    }
    const searchable = [
      operation.id,
      operation.method,
      operation.path,
      operation.summary,
      operation.category,
      operation.subcategory ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase()
    return terms.every(term => searchable.includes(term))
  })
}

/** Fill repository coordinates while leaving unrelated placeholders editable. */
export function getGitHubAPIOperationPath(
  operation: IGitHubAPIOperation,
  repository: GitHubRepository
): string {
  return operation.path
    .replace(/\{owner\}/g, encodeURIComponent(repository.owner.login))
    .replace(/\{repo\}/g, encodeURIComponent(repository.name))
    .replace(/^\/+/, '')
}
