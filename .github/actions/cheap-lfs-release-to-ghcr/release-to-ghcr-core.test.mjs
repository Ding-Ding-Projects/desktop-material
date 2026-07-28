import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  OCI_POINTER_VERSION,
  buildImage,
  deriveTarget,
  parseOciPointer,
  parseReleasePointer,
  requirePackagePolicy,
  resolveConversionVisibility,
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
    assert.equal(resolveConversionVisibility(false, false), 'public')
  })

  it('blocks a public-to-private transition until the separate confirmation is explicit', () => {
    assert.throws(
      () => resolveConversionVisibility(true, false),
      error => error.kind === 'private-actions-unconfirmed'
    )
    assert.equal(resolveConversionVisibility(true, true), 'private')
  })

  it('blocks unknown visibility even when a stale confirmation exists', () => {
    assert.throws(
      () => resolveConversionVisibility(null, true),
      error => error.kind === 'visibility-unknown'
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
