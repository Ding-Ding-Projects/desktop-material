import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  OCI_POINTER_VERSION,
  buildImage,
  deriveTarget,
  parseAdoptionReceipt,
  parseOciPointer,
  parseReleasePointer,
  requireOciPointerVisibility,
  requirePackagePolicy,
  requireRepairableAdoption,
  resolveConversionVisibility,
  runCanonicalPublicationTransaction,
  serializeAdoptionReceipt,
  serializeOciPointer,
} from './release-to-ghcr-core.mjs'

const shaA = 'a'.repeat(64)
const shaB = 'b'.repeat(64)

describe('Release-to-GHCR pointer parsing', () => {
  it('accepts canonical raw and compressed Release parts', () => {
    const pointer = parseReleasePointer(
      `version desktop-material/cheap-lfs/v1\n` +
        `release-tag assets\nasset-name bundle.bin\nsize 5\nsha256 ${shaA}\n` +
        `part ${shaA} 2 bundle.part-1\n` +
        `part-deflate ${shaB} 3 2 bundle.part-2.deflate\n`
    )
    assert.equal(pointer.parts.length, 2)
    assert.equal(pointer.parts[1].compression, 'deflate-raw')
    assert.equal(pointer.parts[1].storedSizeInBytes, 2)
  })

  it('rejects password-encrypted Release pointers without touching bytes', () => {
    assert.throws(
      () =>
        parseReleasePointer(
          `version desktop-material/cheap-lfs/v1\n` +
            `release-tag assets\nasset-name secret.bin\nsize 2\nsha256 ${shaA}\n` +
            `encryption 1\npart-encrypted ${shaA} 2 18 ${shaB} secret.enc\n`
        ),
      error => error.kind === 'encrypted-release-pointer'
    )
  })

  it('round-trips the canonical immutable OCI pointer', () => {
    const text = serializeOciPointer({
      image: `ghcr.io/octo/material-cheap-lfs@sha256:${shaA}`,
      object: `sha256:${shaB}`,
      sizeInBytes: 12,
      layers: [`sha256:${shaA}`],
    })
    assert.equal(text.startsWith(`version ${OCI_POINTER_VERSION}\n`), true)
    assert.deepEqual(parseOciPointer(text), {
      image: `ghcr.io/octo/material-cheap-lfs@sha256:${shaA}`,
      object: `sha256:${shaB}`,
      sizeInBytes: 12,
      layers: [`sha256:${shaA}`],
    })
  })
})

describe('Release-to-GHCR visibility consent', () => {
  it('allows a confirmed public repository without granting private consent', () => {
    assert.equal(resolveConversionVisibility('public', false), 'public')
  })

  it('blocks a public-to-private transition until the separate confirmation is explicit', () => {
    assert.throws(
      () => resolveConversionVisibility('private', false),
      error => error.kind === 'private-actions-unconfirmed'
    )
    assert.equal(resolveConversionVisibility('private', true), 'private')
  })

  it('blocks internal and unknown visibility even when a stale confirmation exists', () => {
    assert.throws(
      () => resolveConversionVisibility(null, true),
      error => error.kind === 'visibility-unknown'
    )
    assert.throws(
      () => resolveConversionVisibility('internal', true),
      error => error.kind === 'visibility-unknown'
    )
  })

  it('fails closed with actionable migration for existing public OCI pointers after a private transition', () => {
    assert.throws(
      () => requireOciPointerVisibility('private', [undefined]),
      error =>
        error.kind === 'public-to-private-oci-transition' &&
        /materialize/i.test(error.message) &&
        /repin/i.test(error.message) &&
        /no canonical tag or pointer was changed/i.test(error.message)
    )
    assert.equal(
      requireOciPointerVisibility('private', [`sha256:${shaA}`]),
      true
    )
  })
})

describe('Release-to-GHCR package adoption', () => {
  it('leaves public pointers unchanged when GHCR creates the package private', () => {
    assert.throws(
      () =>
        requirePackagePolicy({
          sourceVisibility: 'public',
          packageVisibility: 'private',
          repositoryIdentity: 'github.com/repositories/42',
          linkedRepositoryIdentity: 'github.com/repositories/42',
        }),
      error =>
        error.kind === 'public-package-private' &&
        /make the package public/i.test(error.message) &&
        /rerun/i.test(error.message)
    )
  })

  it('requires exact source linkage before pointer adoption', () => {
    assert.throws(
      () =>
        requirePackagePolicy({
          sourceVisibility: 'private',
          packageVisibility: 'private',
          repositoryIdentity: 'github.com/repositories/42',
          linkedRepositoryIdentity: 'github.com/repositories/43',
        }),
      error => error.kind === 'package-policy'
    )
  })
})

describe('Release-to-GHCR canonical image', () => {
  it('derives the same lowercase repository target as the desktop runtime', () => {
    assert.deepEqual(
      deriveTarget({
        id: 42,
        name: 'Material',
        owner: { login: 'Octo-Cat' },
      }),
      {
        repositoryIdentity: 'github.com/repositories/42',
        sourceRepositoryUrl: 'https://github.com/octo-cat/material',
        registryRepository: 'ghcr.io/octo-cat/material-cheap-lfs',
        registryPath: 'octo-cat/material-cheap-lfs',
        packageName: 'material-cheap-lfs',
      }
    )
  })

  it('builds one deterministic full-snapshot manifest', () => {
    const object = {
      sha256: shaB,
      sizeInBytes: 12,
      chunks: [
        {
          ordinal: 0,
          offset: 0,
          sizeInBytes: 12,
          plaintextSha256: shaA,
          blob: {
            mediaType: 'application/vnd.desktop-material.cheap-lfs.object.v1',
            digest: `sha256:${shaA}`,
            size: 12,
          },
          encryption: null,
        },
      ],
    }
    const first = buildImage({
      repositoryIdentity: 'github.com/repositories/42',
      sourceRepositoryUrl: 'https://github.com/octo/material',
      visibility: 'public',
      keyId: null,
      objects: [object],
    })
    const second = buildImage({
      repositoryIdentity: 'github.com/repositories/42',
      sourceRepositoryUrl: 'https://github.com/octo/material',
      visibility: 'public',
      keyId: null,
      objects: [object],
    })
    assert.equal(first.manifestDigest, second.manifestDigest)
    assert.deepEqual(first.manifestBytes, second.manifestBytes)
  })
})

describe('Release-to-GHCR publication transaction', () => {
  it('promotes the canonical tag only after immutable publication and exact remote adoption', async () => {
    const events = []
    const adoptionCommit = 'c'.repeat(40)
    const result = await runCanonicalPublicationTransaction({
      publishImmutableSnapshot: async () => events.push('immutable'),
      verifyPackagePolicy: async () => events.push('package-policy'),
      verifyCapturedDefault: async () => events.push('captured-head'),
      adoptPointers: async () => {
        events.push('git-cas')
        return adoptionCommit
      },
      verifyAdoptedDefault: async commit =>
        events.push(`adopted-head:${commit}`),
      publishCanonicalTag: async commit =>
        events.push(`canonical-tag:${commit}`),
    })
    assert.equal(result, adoptionCommit)
    assert.deepEqual(events, [
      'immutable',
      'package-policy',
      'captured-head',
      'git-cas',
      `adopted-head:${adoptionCommit}`,
      `canonical-tag:${adoptionCommit}`,
    ])
  })

  it('leaves Git and the canonical tag untouched when a first public package is still private', async () => {
    const events = []
    await assert.rejects(
      () =>
        runCanonicalPublicationTransaction({
          publishImmutableSnapshot: async () => events.push('immutable'),
          verifyPackagePolicy: async () => {
            events.push('package-policy')
            requirePackagePolicy({
              sourceVisibility: 'public',
              packageVisibility: 'private',
              repositoryIdentity: 'github.com/repositories/42',
              linkedRepositoryIdentity: 'github.com/repositories/42',
            })
          },
          verifyCapturedDefault: async () => events.push('captured-head'),
          adoptPointers: async () => {
            events.push('git-cas')
            return 'c'.repeat(40)
          },
          verifyAdoptedDefault: async () => events.push('adopted-head'),
          publishCanonicalTag: async () => events.push('canonical-tag'),
        }),
      error => error.kind === 'public-package-private'
    )
    assert.deepEqual(events, ['immutable', 'package-policy'])
  })

  it('never promotes the canonical tag when a concurrent run loses the Git compare-and-swap', async () => {
    const events = []
    await assert.rejects(
      () =>
        runCanonicalPublicationTransaction({
          publishImmutableSnapshot: async () => events.push('immutable'),
          verifyPackagePolicy: async () => events.push('package-policy'),
          verifyCapturedDefault: async () => events.push('captured-head'),
          adoptPointers: async () => {
            events.push('git-cas-lost')
            throw new Error('remote default advanced')
          },
          verifyAdoptedDefault: async () => events.push('adopted-head'),
          publishCanonicalTag: async () => events.push('canonical-tag'),
        }),
      /remote default advanced/
    )
    assert.deepEqual(events, [
      'immutable',
      'package-policy',
      'captured-head',
      'git-cas-lost',
    ])
  })

  it('never promotes the canonical tag when the adopted commit is no longer the remote default', async () => {
    const events = []
    await assert.rejects(
      () =>
        runCanonicalPublicationTransaction({
          publishImmutableSnapshot: async () => events.push('immutable'),
          verifyPackagePolicy: async () => events.push('package-policy'),
          verifyCapturedDefault: async () => events.push('captured-head'),
          adoptPointers: async () => 'd'.repeat(40),
          verifyAdoptedDefault: async () => {
            events.push('adopted-head-changed')
            throw new Error('adopted commit is no longer current')
          },
          publishCanonicalTag: async () => events.push('canonical-tag'),
        }),
      /no longer current/
    )
    assert.deepEqual(events, [
      'immutable',
      'package-policy',
      'captured-head',
      'adopted-head-changed',
    ])
  })
})

describe('Release-to-GHCR interrupted adoption repair', () => {
  const parentCommit = 'c'.repeat(40)
  const headCommit = 'd'.repeat(40)
  const manifestDigest = `sha256:${shaA}`
  const registryRepository = 'ghcr.io/octo/material-cheap-lfs'
  const receiptLine = serializeAdoptionReceipt({
    manifestDigest,
    parentCommit,
    visibility: 'public',
    pointerCount: 1,
  })
  const receipt = parseAdoptionReceipt(
    `Adopt Cheap LFS GHCR snapshot\n\n${receiptLine}\n`
  )
  const parentReleasePointers = [
    {
      path: 'assets/model.bin',
      mode: '100644',
      pointer: { sha256: shaB, sizeInBytes: 12 },
    },
  ]
  const currentOciPointers = [
    {
      path: 'assets/model.bin',
      mode: '100644',
      pointer: {
        image: `${registryRepository}@${manifestDigest}`,
        object: `sha256:${shaB}`,
        sizeInBytes: 12,
        layers: [`sha256:${shaA}`],
      },
    },
  ]

  it('round-trips one bounded machine-verifiable adoption receipt', () => {
    assert.deepEqual(receipt, {
      manifestDigest,
      parentCommit,
      visibility: 'public',
      pointerCount: 1,
    })
    assert.equal(parseAdoptionReceipt('ordinary commit\n'), null)
    assert.throws(
      () => parseAdoptionReceipt(`${receiptLine}\n${receiptLine}\n`),
      error => error.kind === 'invalid-adoption-receipt'
    )
  })

  it('permits canonical-tag repair only for the exact pointer-only adoption diff', () => {
    assert.deepEqual(
      requireRepairableAdoption({
        receipt,
        headCommit,
        parentCommit,
        changedPaths: ['assets/model.bin'],
        parentReleasePointers,
        currentReleasePointers: [],
        currentOciPointers,
        registryRepository,
        visibility: 'public',
      }),
      currentOciPointers
    )
  })

  it('rejects an unrelated tree change or a pointer aimed at another manifest', () => {
    assert.throws(
      () =>
        requireRepairableAdoption({
          receipt,
          headCommit,
          parentCommit,
          changedPaths: ['assets/model.bin', 'README.md'],
          parentReleasePointers,
          currentReleasePointers: [],
          currentOciPointers,
          registryRepository,
          visibility: 'public',
        }),
      error => error.kind === 'unrepairable-adoption'
    )
    assert.throws(
      () =>
        requireRepairableAdoption({
          receipt,
          headCommit,
          parentCommit,
          changedPaths: ['assets/model.bin'],
          parentReleasePointers,
          currentReleasePointers: [],
          currentOciPointers: [
            {
              ...currentOciPointers[0],
              pointer: {
                ...currentOciPointers[0].pointer,
                image: `${registryRepository}@sha256:${'e'.repeat(64)}`,
              },
            },
          ],
          registryRepository,
          visibility: 'public',
        }),
      error => error.kind === 'unrepairable-adoption'
    )
  })
})
