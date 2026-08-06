import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  applyCloudPatch,
  CloudPatchOrchestrationError,
  shareCloudPatch,
} from '../../src/lib/cloud-patches/cloud-patch-orchestration'
import type { ICloudPatchUploadRequest } from '../../src/lib/cloud-patches/cloud-patch-server-client'
import {
  createCloudPatchArtifact,
  parseCloudPatchArtifact,
} from '../../src/lib/cloud-patches/patch-artifact'
import type { ICloudPatchFileEntry } from '../../src/lib/cloud-patches/patch-artifact'
import type { ITeamConnection } from '../../src/lib/self-hosted-server/team-connection'
import { Repository } from '../../src/models/repository'

const RepositoryId = `sha256:${'a'.repeat(64)}`
const BaseSha = '1'.repeat(40)
const HeadSha = '2'.repeat(40)
const ShareId = `cp_${'3'.repeat(64)}`
const ShareSecret = `cps_${'4'.repeat(43)}`
const RepositoryPath = 'C:/repositories/cloud-patch-test'
const FileEntries: ReadonlyArray<ICloudPatchFileEntry> = [
  { path: 'README.md', mode: '100644', byteLength: 12 },
]

const FormatPatch = [
  `From ${HeadSha} Mon Sep 17 00:00:00 2001`,
  'From: Cloud Patch <cloud-patch@example.invalid>',
  'Date: Wed, 5 Aug 2026 12:00:00 -0400',
  'Subject: [PATCH] Add the shared README line',
  '',
  '---',
  ' README.md | 1 +',
  ' 1 file changed, 1 insertion(+)',
  'diff --git a/README.md b/README.md',
  'index 1111111..2222222 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1,2 @@',
  ' existing',
  '+shared',
  '-- ',
  '2.50.0',
  '',
].join('\n')

const Connection: ITeamConnection = {
  publicOrigin: 'https://patches.example.invalid',
  serverId: 'server-1',
  deviceId: 'device-owner',
  deviceName: 'Owner',
  deviceToken: 'device-token',
}

const repository = new Repository(RepositoryPath, 1, null, false)

function assertCloudPatchError(code: string) {
  return (error: unknown) =>
    error instanceof CloudPatchOrchestrationError && error.code === code
}

function artifactBytes(now: number): Uint8Array {
  const artifact = createCloudPatchArtifact(
    {
      kind: 'format-patch',
      repositoryId: RepositoryId,
      createdAtMs: now,
      expiresAtMs: now + 60_000,
      baseSha: BaseSha,
      headSha: HeadSha,
      files: FileEntries,
      patch: FormatPatch,
    },
    { now: () => now }
  )
  return new TextEncoder().encode(artifact.serialized)
}

describe('Cloud Patch application-store orchestration', () => {
  it('formats, fingerprints, and uploads a real mailbox using the joined device identity', async () => {
    const now = Date.now()
    let formatCalls = 0
    let uploadConfig: { origin: string; deviceToken: string } | null = null
    let uploadRequest: ICloudPatchUploadRequest | undefined

    const result = await shareCloudPatch(
      repository,
      'base-ref',
      'head-ref',
      ['device-recipient'],
      {
        getConnection: async () => Connection,
        getRepositoryId: async () => RepositoryId,
        resolveCommit: async (_repository, revision) =>
          revision === 'base-ref' ? BaseSha : HeadSha,
        getChangedFiles: async () => FileEntries,
        formatPatch: async (_repository, base, head) => {
          formatCalls++
          assert.equal(base, BaseSha)
          assert.equal(head, HeadSha)
          return FormatPatch
        },
        upload: async (config, request) => {
          uploadConfig = config
          uploadRequest = request
          return {
            shareId: ShareId,
            shareSecret: ShareSecret,
            shareUrl: `https://patches.example.invalid/patches/${ShareId}#${ShareSecret}`,
            expiresAtMs: now + 60_000,
          }
        },
        now: () => now,
      }
    )

    assert.equal(result.kind, 'shared')
    assert.equal(formatCalls, 1)
    assert.deepEqual(uploadConfig, {
      origin: Connection.publicOrigin,
      deviceToken: Connection.deviceToken,
    })
    if (uploadRequest === undefined) {
      throw new Error('The upload request was not captured.')
    }
    assert.deepEqual(uploadRequest.recipientDeviceIds, ['device-recipient'])
    assert.equal(
      uploadRequest.expectedArtifactSha256.startsWith('sha256:'),
      true
    )
    const parsed = parseCloudPatchArtifact(uploadRequest.artifactBytes, {
      now: () => now + 1,
    })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.artifact.manifest.contentKind, 'format-patch')
      assert.equal(parsed.artifact.content, FormatPatch)
    }
  })

  it('degrades to single-player without reading Git or calling the server', async () => {
    let formatCalled = false
    const result = await shareCloudPatch(
      repository,
      BaseSha,
      HeadSha,
      ['device-recipient'],
      {
        getConnection: async () => null,
        formatPatch: async () => {
          formatCalled = true
          return FormatPatch
        },
      }
    )

    assert.deepEqual(result, {
      kind: 'unavailable',
      reason: 'no-server-configured',
    })
    assert.equal(formatCalled, false)
  })

  it('verifies the fetched artifact against the current base before git am', async () => {
    const now = Date.now()
    const bytes = artifactBytes(now)
    let appliedPatch: string | null = null
    const result = await applyCloudPatch(
      repository,
      `https://patches.example.invalid/patches/${ShareId}#${ShareSecret}`,
      {
        getConnection: async () => Connection,
        getRepositoryId: async () => RepositoryId,
        resolveCommit: async () => BaseSha,
        fetch: async () => ({ shareId: ShareId, artifactBytes: bytes }),
        applyFormatPatch: async (_repository, patch) => {
          appliedPatch = patch
        },
        now: () => now + 1,
      }
    )

    assert.deepEqual(result, {
      kind: 'applied',
      shareId: ShareId,
      headSha: HeadSha,
    })
    assert.equal(appliedPatch, FormatPatch)
  })

  it('surfaces invalid links, stale bases, and git-am failures without false success', async () => {
    await assert.rejects(
      applyCloudPatch(repository, 'not-a-cloud-patch-link', {
        getConnection: async () => Connection,
      }),
      assertCloudPatchError('invalid-share-link')
    )

    const now = Date.now()
    await assert.rejects(
      applyCloudPatch(
        repository,
        `https://patches.example.invalid/patches/${ShareId}#${ShareSecret}`,
        {
          getConnection: async () => Connection,
          getRepositoryId: async () => RepositoryId,
          resolveCommit: async () => '9'.repeat(40),
          fetch: async () => ({
            shareId: ShareId,
            artifactBytes: artifactBytes(now),
          }),
          now: () => now + 1,
        }
      ),
      assertCloudPatchError('artifact-verification-failed')
    )

    await assert.rejects(
      applyCloudPatch(
        repository,
        `https://patches.example.invalid/patches/${ShareId}#${ShareSecret}`,
        {
          getConnection: async () => Connection,
          getRepositoryId: async () => RepositoryId,
          resolveCommit: async () => BaseSha,
          fetch: async () => ({
            shareId: ShareId,
            artifactBytes: artifactBytes(now),
          }),
          applyFormatPatch: async () => {
            throw new Error('patch has a conflict')
          },
          now: () => now + 1,
        }
      ),
      assertCloudPatchError('git-am-failed')
    )
  })
})
