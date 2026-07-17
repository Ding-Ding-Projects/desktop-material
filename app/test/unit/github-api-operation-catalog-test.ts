import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  filterGitHubAPIOperations,
  getGitHubAPIOperationPath,
  GitHubAPICatalogInventory,
  GitHubAPICatalogVersion,
  GitHubAPIOperations,
  isNewGitHubAPIOperation,
  NewGitHubAPIOperationIds,
} from '../../src/lib/github-api-operation-catalog'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

describe('GitHub API operation catalog', () => {
  it('contains every operation in the current official description', () => {
    assert.equal(GitHubAPICatalogVersion, '2026-03-10')
    assert.deepEqual(GitHubAPICatalogInventory, {
      paths: 796,
      operations: 1206,
      tags: 49,
      categories: 51,
      webhooks: 270,
    })
    assert.equal(GitHubAPIOperations.length, 1206)
    assert.equal(new Set(GitHubAPIOperations.map(value => value.id)).size, 1206)
  })

  it('marks all ten and only the ten operations added since the March audit', () => {
    assert.equal(NewGitHubAPIOperationIds.length, 10)
    assert.deepEqual(
      filterGitHubAPIOperations({ newOnly: true }).map(value => value.id),
      [
        'copilot/copilot-enterprise-repos-one-day-report',
        'copilot/copilot-organization-repos-one-day-report',
        'secret-scanning/bulk-create-org-custom-patterns',
        'secret-scanning/bulk-create-repo-custom-patterns',
        'secret-scanning/bulk-delete-org-custom-patterns',
        'secret-scanning/bulk-delete-repo-custom-patterns',
        'secret-scanning/list-org-custom-patterns',
        'secret-scanning/list-repo-custom-patterns',
        'secret-scanning/update-org-custom-pattern',
        'secret-scanning/update-repo-custom-pattern',
      ]
    )
    assert.ok(NewGitHubAPIOperationIds.every(id => isNewGitHubAPIOperation(id)))
  })

  it('searches identifiers, summaries, paths, categories, and subcategories', () => {
    const results = filterGitHubAPIOperations({
      query: 'secret-scanning custom-patterns repository',
      newOnly: true,
    })
    assert.deepEqual(
      results.map(value => value.id),
      [
        'secret-scanning/bulk-create-repo-custom-patterns',
        'secret-scanning/bulk-delete-repo-custom-patterns',
        'secret-scanning/list-repo-custom-patterns',
        'secret-scanning/update-repo-custom-pattern',
      ]
    )
  })

  it('fills repository coordinates without guessing other path parameters', () => {
    const repository = new GitHubRepository(
      'material explorer',
      new Owner('fixture owner', 'https://api.github.test', 1),
      1
    )
    const operation = GitHubAPIOperations.find(
      value => value.id === 'secret-scanning/update-repo-custom-pattern'
    )
    assert.ok(operation)
    assert.equal(
      getGitHubAPIOperationPath(operation, repository),
      'repos/fixture%20owner/material%20explorer/secret-scanning/custom-patterns/{pattern_id}'
    )
  })
})
