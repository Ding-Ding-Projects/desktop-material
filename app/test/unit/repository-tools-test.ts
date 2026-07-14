import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  assertRepositoryBundleSourceUnchanged,
  getRepositoryToolOperation,
  normalizeBundleImportBranchName,
  parseRepositoryBundleHeads,
  prepareRepositoryArchive,
  prepareRepositoryBundle,
  prepareRepositoryBundleImport,
  prepareRepositoryBundleInspection,
  prepareRepositoryBundleVerification,
  RepositoryToolOperations,
} from '../../src/ui/repository-tools'
import { RepositorySectionTab } from '../../src/lib/app-state'
import {
  getRepositorySections,
  getRepositorySectionVisualIndex,
} from '../../src/ui/repository-sections'

describe('repository tool recipes', () => {
  it('exposes only reviewed, named fixed Git functions', () => {
    assert.deepStrictEqual(
      RepositoryToolOperations.map(operation => operation.id),
      [
        'status-summary',
        'repository-health',
        'signature-audit',
        'maintenance-preview',
        'maintenance-run',
        'reflog-view',
      ]
    )
    assert.ok(
      RepositoryToolOperations.every(operation => !('args' in operation))
    )
  })

  it('keeps every diagnostic and recovery view non-mutating', () => {
    for (const id of [
      'status-summary',
      'repository-health',
      'signature-audit',
      'maintenance-preview',
      'reflog-view',
    ] as const) {
      const operation = getRepositoryToolOperation(id)
      assert.equal(operation.mutatesRepository, false)
      assert.equal(operation.requiresConfirmation, false)
    }
    assert.equal('args' in getRepositoryToolOperation('reflog-view'), false)
    assert.equal('args' in getRepositoryToolOperation('signature-audit'), false)
  })

  it('requires confirmation for repository maintenance', () => {
    const maintenance = getRepositoryToolOperation('maintenance-run')
    assert.equal(maintenance.mutatesRepository, true)
    assert.equal(maintenance.requiresConfirmation, true)
    assert.match(
      maintenance.confirmationDescription ?? '',
      /rewrite object packs/i
    )
  })

  it('prepares only contained ZIP and TAR exports from HEAD', () => {
    assert.deepStrictEqual(
      prepareRepositoryArchive('C:\\work\\repo', 'C:\\exports\\repo', 'zip'),
      {
        format: 'zip',
        destination: 'C:\\exports\\repo.zip',
        operation: {
          id: 'archive-export',
          format: 'zip',
          destination: 'C:\\exports\\repo.zip',
        },
      }
    )
    assert.equal(
      prepareRepositoryArchive('C:\\work\\repo', 'C:\\exports\\repo.TAR', 'tar')
        .destination,
      'C:\\exports\\repo.TAR'
    )
    assert.throws(() =>
      prepareRepositoryArchive('C:\\work\\repo', 'relative.zip', 'zip')
    )
    assert.throws(() =>
      prepareRepositoryArchive(
        'C:\\work\\repo',
        'C:\\work\\repo\\.git\\private.zip',
        'zip'
      )
    )
  })

  it('prepares a contained full-history bundle with no editable ref', () => {
    assert.deepStrictEqual(
      prepareRepositoryBundle('C:\\work\\repo', 'C:\\exports\\backup'),
      {
        format: 'bundle',
        destination: 'C:\\exports\\backup.bundle',
        operation: {
          id: 'bundle-export',
          destination: 'C:\\exports\\backup.bundle',
        },
      }
    )
    assert.throws(() =>
      prepareRepositoryBundle(
        'C:\\work\\repo',
        'C:\\work\\repo\\.git\\backup.bundle'
      )
    )
  })

  it('prepares only an absolute bundle for read-only verification', () => {
    assert.deepStrictEqual(
      prepareRepositoryBundleVerification('C:\\exports\\backup.bundle'),
      { id: 'bundle-verify', bundlePath: 'C:\\exports\\backup.bundle' }
    )
    for (const path of ['backup.bundle', 'C:\\exports\\backup.zip', '']) {
      assert.throws(() => prepareRepositoryBundleVerification(path))
    }
  })

  it('strictly parses bounded advertised bundle refs', () => {
    const sha = 'A'.repeat(40)
    const sha256 = 'b'.repeat(64)
    assert.deepStrictEqual(
      parseRepositoryBundleHeads(
        `${sha} refs/heads/main\r\n${sha} HEAD\n${sha256} refs/tags/v2\n`
      ),
      [
        { oid: sha.toLowerCase(), ref: 'refs/heads/main' },
        { oid: sha256, ref: 'refs/tags/v2' },
      ]
    )
    for (const output of [
      '',
      `${sha} HEAD\n`,
      `${sha} refs/heads/bad ref\n`,
      `not-an-oid refs/heads/main\n`,
      `${sha} refs/heads/main\n${'b'.repeat(40)} refs/heads/main\n`,
    ]) {
      assert.throws(() => parseRepositoryBundleHeads(output))
    }
  })

  it('validates local branch destinations without accepting refspecs', () => {
    assert.equal(
      normalizeBundleImportBranchName(' feature/from-bundle '),
      'feature/from-bundle'
    )
    for (const branch of [
      '',
      '-force',
      'HEAD',
      'refs/heads/main:refs/heads/other',
      'bad..branch',
      'bad@{branch',
      'bad\\branch',
      '.hidden/main',
      'topic.lock',
    ]) {
      assert.throws(() => normalizeBundleImportBranchName(branch))
    }
  })

  it('prepares a fixed import recipe that cannot overwrite a branch', () => {
    const source = {
      oid: 'a'.repeat(40),
      ref: 'refs/heads/release',
    }
    const request = prepareRepositoryBundleImport(
      'C:\\exports\\backup.bundle',
      source,
      'restored/release'
    )
    assert.deepStrictEqual(request, {
      bundlePath: 'C:\\exports\\backup.bundle',
      verifyOperation: {
        id: 'bundle-verify',
        bundlePath: 'C:\\exports\\backup.bundle',
      },
      listHeadsOperation: {
        id: 'bundle-list-heads',
        bundlePath: 'C:\\exports\\backup.bundle',
      },
      source,
      branchName: 'restored/release',
      destinationRef: 'refs/heads/restored/release',
      validateDestinationOperation: {
        id: 'bundle-import-validate-destination',
        branchName: 'restored/release',
      },
      checkDestinationOperation: {
        id: 'bundle-import-check-destination',
        branchName: 'restored/release',
      },
      fetchObjectsOperation: {
        id: 'bundle-import-fetch-objects',
        bundlePath: 'C:\\exports\\backup.bundle',
        sourceRef: 'refs/heads/release',
      },
      validateCommitOperation: {
        id: 'bundle-import-validate-commit',
        oid: 'a'.repeat(40),
      },
      createBranchOperation: {
        id: 'bundle-import-create-branch',
        branchName: 'restored/release',
        oid: 'a'.repeat(40),
      },
    })
    assert.ok(
      request.createBranchOperation.id === 'bundle-import-create-branch' &&
        !request.createBranchOperation.branchName.includes(':')
    )
    assert.deepStrictEqual(
      prepareRepositoryBundleInspection('C:\\exports\\backup.bundle'),
      {
        bundlePath: 'C:\\exports\\backup.bundle',
        verifyOperation: {
          id: 'bundle-verify',
          bundlePath: 'C:\\exports\\backup.bundle',
        },
        listHeadsOperation: {
          id: 'bundle-list-heads',
          bundlePath: 'C:\\exports\\backup.bundle',
        },
      }
    )
  })

  it('fails closed if the selected advertised source changes', () => {
    const source = { oid: 'a'.repeat(40), ref: 'refs/heads/main' }
    assert.doesNotThrow(() =>
      assertRepositoryBundleSourceUnchanged([source], source)
    )
    assert.throws(() =>
      assertRepositoryBundleSourceUnchanged(
        [{ oid: 'b'.repeat(40), ref: source.ref }],
        source
      )
    )
    assert.throws(() => assertRepositoryBundleSourceUnchanged([], source))
  })
})

describe('repository section order', () => {
  it('keeps Repository Tools at visual index 2 when Actions is unavailable', () => {
    assert.deepStrictEqual(getRepositorySections(false), [
      RepositorySectionTab.Changes,
      RepositorySectionTab.History,
      RepositorySectionTab.Triage,
      RepositorySectionTab.RepositoryTools,
    ])
    assert.equal(
      getRepositorySectionVisualIndex(
        RepositorySectionTab.RepositoryTools,
        false
      ),
      3
    )
  })

  it('keeps Repository Tools at visual index 3 when Actions is available', () => {
    assert.deepStrictEqual(getRepositorySections(true), [
      RepositorySectionTab.Changes,
      RepositorySectionTab.History,
      RepositorySectionTab.Actions,
      RepositorySectionTab.Triage,
      RepositorySectionTab.RepositoryTools,
    ])
    assert.equal(
      getRepositorySectionVisualIndex(
        RepositorySectionTab.RepositoryTools,
        true
      ),
      4
    )
  })
})
