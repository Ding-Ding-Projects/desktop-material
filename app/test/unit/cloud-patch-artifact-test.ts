import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  CloudPatchFutureClockSkewAllowanceMs,
  CloudPatchArtifactError,
  CloudPatchArtifactInput,
  CloudPatchArtifactErrorCode,
  ICloudPatchArtifact,
  ICloudPatchCommitRangeInput,
  ICloudPatchCreateOptions,
  ICloudPatchFileEntry,
  ICloudPatchVerificationOptions,
  ICloudPatchWorkingTreeInput,
  MaximumCloudPatchArtifactBytes,
  MaximumCloudPatchArtifactLifetimeMs,
  MaximumCloudPatchFileBytes,
  MaximumCloudPatchFiles,
  MaximumCloudPatchManifestBytes,
  MaximumCloudPatchPatchBytes,
  MaximumCloudPatchPathBytes,
  MaximumCloudPatchPathDepth,
  MaximumCloudPatchPathSegmentBytes,
  createCloudPatchArtifact as createCloudPatchArtifactWithClock,
  parseCloudPatchArtifact,
  verifyCloudPatchArtifact,
} from '../../src/lib/cloud-patches/patch-artifact'

const RepositoryId = `sha256:${'a'.repeat(64)}`
const OtherRepositoryId = `sha256:${'b'.repeat(64)}`
const BaseSha = '1'.repeat(40)
const HeadSha = '2'.repeat(40)
const OtherBaseSha = '3'.repeat(40)
const OtherHeadSha = '4'.repeat(40)
const CreatedAtMs = Date.UTC(2026, 7, 2, 12, 0, 0)
const ExpiresAtMs = CreatedAtMs + 60_000
const encoder = new TextEncoder()

const CommitFiles: ReadonlyArray<ICloudPatchFileEntry> = [
  { path: 'src/app.ts', mode: '100644', byteLength: 128 },
  { path: 'README.md', mode: '100644', byteLength: 64 },
]

const SecretMarkers = [
  'Bearer cloud-secret-token',
  'app-password=cloud-app-password',
  'https://user:cloud-password@example.invalid/private',
  'author@example.invalid',
]

const WorkingPatch = [
  'diff --git a/src/config.ts b/src/config.ts',
  'index 1111111..2222222 100644',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -1 +1,4 @@',
  '-export const enabled = false',
  '+export const enabled = true',
  `+const token = '${SecretMarkers[0]}'`,
  `+const password = '${SecretMarkers[1]}'`,
  `+const endpoint = '${SecretMarkers[2]}' // ${SecretMarkers[3]}`,
  '',
].join('\n')

const WorkingFiles: ReadonlyArray<ICloudPatchFileEntry> = [
  { path: 'src/config.ts', mode: '100644', byteLength: 256 },
]

function commitInput(
  overrides: Partial<ICloudPatchCommitRangeInput> = {}
): ICloudPatchCommitRangeInput {
  return {
    kind: 'commit-range',
    repositoryId: RepositoryId,
    createdAtMs: CreatedAtMs,
    expiresAtMs: ExpiresAtMs,
    baseSha: BaseSha,
    headSha: HeadSha,
    files: CommitFiles,
    ...overrides,
  }
}

function workingInput(
  overrides: Partial<ICloudPatchWorkingTreeInput> = {}
): ICloudPatchWorkingTreeInput {
  return {
    kind: 'working-tree-patch',
    repositoryId: RepositoryId,
    createdAtMs: CreatedAtMs,
    expiresAtMs: ExpiresAtMs,
    baseSha: BaseSha,
    files: WorkingFiles,
    patch: WorkingPatch,
    ...overrides,
  }
}

function artifactBytes(artifact: ICloudPatchArtifact): Uint8Array {
  return encoder.encode(artifact.serialized)
}

function assertCreateFailure(
  action: () => unknown,
  code: CloudPatchArtifactErrorCode
) {
  assert.throws(
    action,
    error => error instanceof CloudPatchArtifactError && error.code === code
  )
}

function assertParseFailure(
  result: ReturnType<typeof parseCloudPatchArtifact>,
  code: CloudPatchArtifactErrorCode,
  secrets: ReadonlyArray<string> = []
) {
  assert.equal(result.ok, false)
  if (result.ok) {
    return
  }
  assert.equal(result.error.code, code)
  const rendered = `${result.error.name} ${result.error.code} ${
    result.error.message
  } ${JSON.stringify(result.error)}`
  for (const secret of secrets) {
    assert.doesNotMatch(
      rendered,
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  }
}

function parseSerialized(artifact: ICloudPatchArtifact) {
  return JSON.parse(artifact.serialized) as {
    manifest: Record<string, unknown> & {
      files: Array<Record<string, unknown>>
    }
    content: string | null
  }
}

function serializeValue(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`)
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function rehashSerialized(value: ReturnType<typeof parseSerialized>): {
  readonly bytes: Uint8Array
  readonly artifactSha256: string
} {
  const { manifest, content } = value
  manifest.sha256 = sha256(
    encoder.encode(
      `${JSON.stringify({
        version: manifest.version,
        repositoryId: manifest.repositoryId,
        createdAtMs: manifest.createdAtMs,
        expiresAtMs: manifest.expiresAtMs,
        contentKind: manifest.contentKind,
        baseSha: manifest.baseSha,
        headSha: manifest.headSha,
        contentByteLength: manifest.contentByteLength,
        fileCount: manifest.fileCount,
        files: manifest.files,
        content,
      })}\n`
    )
  )
  const bytes = serializeValue(value)
  return { bytes, artifactSha256: sha256(bytes) }
}

function validNow() {
  return CreatedAtMs + 1
}

function createCloudPatchArtifact(
  input: CloudPatchArtifactInput,
  options: ICloudPatchCreateOptions = {}
): ICloudPatchArtifact {
  return createCloudPatchArtifactWithClock(input, {
    now: validNow,
    ...options,
  })
}

describe('Cloud Patch canonical artifact', () => {
  it('round-trips a deterministic immutable commit range', () => {
    const first = createCloudPatchArtifact(commitInput())
    const second = createCloudPatchArtifact(
      commitInput({ files: [...CommitFiles].reverse() })
    )

    assert.equal(first.serialized, second.serialized)
    assert.equal(first.manifest.sha256, second.manifest.sha256)
    assert.equal(first.artifactSha256, second.artifactSha256)
    assert.equal(first.content, null)
    assert.deepEqual(
      first.manifest.files.map(file => file.path),
      ['README.md', 'src/app.ts']
    )
    assert.equal(Object.isFrozen(first), true)
    assert.equal(Object.isFrozen(first.manifest), true)
    assert.equal(Object.isFrozen(first.manifest.files), true)

    const verified = verifyCloudPatchArtifact(
      artifactBytes(first),
      {
        kind: 'commit-range',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        headSha: HeadSha,
        expectedArtifactSha256: first.artifactSha256,
      },
      { now: validNow }
    )
    assert.equal(verified.ok, true)
    if (verified.ok) {
      assert.equal(verified.artifact.serialized, first.serialized)
      assert.equal(verified.artifact.artifactSha256, first.artifactSha256)
    }
  })

  it('round-trips reviewed working-tree patch content as inert data', () => {
    const first = createCloudPatchArtifact(workingInput())
    const second = createCloudPatchArtifact(workingInput())
    assert.equal(first.serialized, second.serialized)
    assert.equal(first.manifest.sha256, second.manifest.sha256)
    assert.equal(first.artifactSha256, second.artifactSha256)
    assert.equal(first.content, WorkingPatch)
    assert.equal(
      first.manifest.contentByteLength,
      encoder.encode(WorkingPatch).byteLength
    )

    const verified = verifyCloudPatchArtifact(
      artifactBytes(first),
      {
        kind: 'working-tree-patch',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: first.artifactSha256,
      },
      { now: validNow }
    )
    assert.equal(verified.ok, true)
    if (verified.ok) {
      assert.equal(verified.artifact.content, WorkingPatch)
      for (const secret of SecretMarkers) {
        assert.match(verified.artifact.content ?? '', new RegExp(secret))
      }
    }
  })

  it('binds verification to the reviewed complete-artifact digest', () => {
    const original = createCloudPatchArtifact(workingInput())
    const altered = createCloudPatchArtifact(
      workingInput({
        patch: WorkingPatch.replace(
          'export const enabled = true',
          'export const enabled = true // altered after review'
        ),
      })
    )

    assert.notEqual(altered.manifest.sha256, original.manifest.sha256)
    assert.notEqual(altered.artifactSha256, original.artifactSha256)
    assert.equal(
      parseCloudPatchArtifact(artifactBytes(altered), { now: validNow }).ok,
      true
    )

    const rejected = verifyCloudPatchArtifact(
      artifactBytes(altered),
      {
        kind: 'working-tree-patch',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: original.artifactSha256,
      },
      { now: validNow }
    )
    assertParseFailure(rejected, 'artifact-digest-mismatch', SecretMarkers)

    assert.equal(
      verifyCloudPatchArtifact(
        artifactBytes(altered),
        {
          kind: 'working-tree-patch',
          repositoryId: RepositoryId,
          baseSha: BaseSha,
          expectedArtifactSha256: altered.artifactSha256,
        },
        { now: validNow }
      ).ok,
      true
    )

    const malformedExpectation = verifyCloudPatchArtifact(
      artifactBytes(original),
      {
        kind: 'working-tree-patch',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: `sha256:${'A'.repeat(64)}`,
      },
      { now: validNow }
    )
    assertParseFailure(malformedExpectation, 'invalid-input', SecretMarkers)

    const forged = parseSerialized(altered)
    forged.manifest.sha256 = original.artifactSha256
    const rejectedHashOverride = verifyCloudPatchArtifact(
      serializeValue(forged),
      {
        kind: 'working-tree-patch',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: original.artifactSha256,
      },
      {
        now: validNow,
        sha256: () => original.artifactSha256,
      } as unknown as ICloudPatchVerificationOptions
    )
    assertParseFailure(rejectedHashOverride, 'digest-mismatch', SecretMarkers)
  })

  it('requires exactly one reviewed source variant and valid full object ids', () => {
    assertCreateFailure(
      () =>
        createCloudPatchArtifact({
          ...workingInput(),
          headSha: HeadSha,
        } as unknown as CloudPatchArtifactInput),
      'invalid-input'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact({
          ...commitInput(),
          patch: WorkingPatch,
        } as unknown as CloudPatchArtifactInput),
      'invalid-input'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact({
          ...commitInput(),
          kind: 'neither',
        } as unknown as CloudPatchArtifactInput),
      'invalid-content-kind'
    )

    for (const invalid of [
      'abc',
      'A'.repeat(40),
      'g'.repeat(40),
      '0'.repeat(40),
    ]) {
      assertCreateFailure(
        () => createCloudPatchArtifact(commitInput({ baseSha: invalid })),
        'invalid-range'
      )
    }
    assertCreateFailure(
      () => createCloudPatchArtifact(commitInput({ headSha: BaseSha })),
      'invalid-range'
    )
    assertCreateFailure(
      () => createCloudPatchArtifact(commitInput({ headSha: '2'.repeat(64) })),
      'invalid-range'
    )
  })

  it('rejects one-byte tampering and manifest count or length mismatches', () => {
    const artifact = createCloudPatchArtifact(workingInput())
    const tampered = parseSerialized(artifact)
    assert.equal(typeof tampered.content, 'string')
    tampered.content =
      tampered.content?.replace('enabled = true', 'enabled = trie') ?? null
    assert.equal(
      encoder.encode(tampered.content ?? '').byteLength,
      artifact.manifest.contentByteLength
    )
    assertParseFailure(
      parseCloudPatchArtifact(serializeValue(tampered), { now: validNow }),
      'digest-mismatch'
    )

    const wrongLength = parseSerialized(artifact)
    wrongLength.manifest.contentByteLength =
      artifact.manifest.contentByteLength + 1
    assertParseFailure(
      parseCloudPatchArtifact(serializeValue(wrongLength), { now: validNow }),
      'length-mismatch'
    )

    const wrongCount = parseSerialized(artifact)
    wrongCount.manifest.fileCount = 2
    assertParseFailure(
      parseCloudPatchArtifact(serializeValue(wrongCount), { now: validNow }),
      'file-count-mismatch'
    )
  })

  it('rejects the wrong repository, base, head, kind, and expiry boundary safely', () => {
    const range = createCloudPatchArtifact(commitInput())
    const bytes = artifactBytes(range)
    const options = { now: validNow }

    const wrongRepository = verifyCloudPatchArtifact(
      bytes,
      {
        kind: 'commit-range',
        repositoryId: OtherRepositoryId,
        baseSha: BaseSha,
        headSha: HeadSha,
        expectedArtifactSha256: range.artifactSha256,
      },
      options
    )
    assertParseFailure(wrongRepository, 'repository-mismatch', SecretMarkers)

    const wrongBase = verifyCloudPatchArtifact(
      bytes,
      {
        kind: 'commit-range',
        repositoryId: RepositoryId,
        baseSha: OtherBaseSha,
        headSha: HeadSha,
        expectedArtifactSha256: range.artifactSha256,
      },
      options
    )
    assertParseFailure(wrongBase, 'base-mismatch', SecretMarkers)

    const wrongHead = verifyCloudPatchArtifact(
      bytes,
      {
        kind: 'commit-range',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        headSha: OtherHeadSha,
        expectedArtifactSha256: range.artifactSha256,
      },
      options
    )
    assertParseFailure(wrongHead, 'head-mismatch', SecretMarkers)

    const wrongKind = verifyCloudPatchArtifact(
      bytes,
      {
        kind: 'working-tree-patch',
        repositoryId: RepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: range.artifactSha256,
      },
      options
    )
    assertParseFailure(wrongKind, 'content-kind-mismatch', SecretMarkers)

    assert.equal(
      parseCloudPatchArtifact(bytes, { now: () => ExpiresAtMs - 1 }).ok,
      true
    )
    assertParseFailure(
      parseCloudPatchArtifact(bytes, { now: () => ExpiresAtMs }),
      'expired',
      SecretMarkers
    )
  })

  it('bounds artifact lifetime and future clock skew at create and parse', () => {
    const now = validNow()
    const exactLifetime = createCloudPatchArtifact(
      commitInput({
        createdAtMs: now,
        expiresAtMs: now + MaximumCloudPatchArtifactLifetimeMs,
      }),
      { now: () => now }
    )
    assert.equal(
      parseCloudPatchArtifact(artifactBytes(exactLifetime), {
        now: () => now,
      }).ok,
      true
    )

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            createdAtMs: now,
            expiresAtMs: now + MaximumCloudPatchArtifactLifetimeMs + 1,
          }),
          { now: () => now }
        ),
      'invalid-time'
    )

    const tooLong = parseSerialized(exactLifetime)
    tooLong.manifest.expiresAtMs =
      Number(tooLong.manifest.createdAtMs) +
      MaximumCloudPatchArtifactLifetimeMs +
      1
    assertParseFailure(
      parseCloudPatchArtifact(rehashSerialized(tooLong).bytes, {
        now: () => now,
      }),
      'invalid-time'
    )

    const exactFuture = createCloudPatchArtifact(
      commitInput({
        createdAtMs: now + CloudPatchFutureClockSkewAllowanceMs,
        expiresAtMs: now + CloudPatchFutureClockSkewAllowanceMs + 60_000,
      }),
      { now: () => now }
    )
    assert.equal(
      parseCloudPatchArtifact(artifactBytes(exactFuture), {
        now: () => now,
      }).ok,
      true
    )

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            createdAtMs: now + CloudPatchFutureClockSkewAllowanceMs + 1,
            expiresAtMs: now + CloudPatchFutureClockSkewAllowanceMs + 60_001,
          }),
          { now: () => now }
        ),
      'invalid-time'
    )

    const futureCreated = parseSerialized(exactFuture)
    futureCreated.manifest.createdAtMs =
      now + CloudPatchFutureClockSkewAllowanceMs + 1
    futureCreated.manifest.expiresAtMs =
      Number(futureCreated.manifest.createdAtMs) + 60_000
    assertParseFailure(
      parseCloudPatchArtifact(rehashSerialized(futureCreated).bytes, {
        now: () => now,
      }),
      'invalid-time'
    )

    const twoCenturiesMs = 200 * 365 * 24 * 60 * 60 * 1000
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            createdAtMs: now,
            expiresAtMs: now + twoCenturiesMs,
          }),
          { now: () => now }
        ),
      'invalid-time'
    )
    const multiCentury = parseSerialized(exactLifetime)
    multiCentury.manifest.expiresAtMs = now + twoCenturiesMs
    assertParseFailure(
      parseCloudPatchArtifact(rehashSerialized(multiCentury).bytes, {
        now: () => now,
      }),
      'invalid-time'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({ createdAtMs: now - 1, expiresAtMs: now }),
          { now: () => now }
        ),
      'expired'
    )
  })

  it('rejects unknown, duplicate, and noncanonical JSON keys or spelling', () => {
    const artifact = createCloudPatchArtifact(workingInput())

    const unknown = parseSerialized(artifact)
    unknown.manifest.unexpected = true
    assertParseFailure(
      parseCloudPatchArtifact(serializeValue(unknown), { now: validNow }),
      'invalid-input'
    )

    const unknownFile = parseSerialized(artifact)
    unknownFile.manifest.files[0].ownerEmail = 'author@example.invalid'
    assertParseFailure(
      parseCloudPatchArtifact(serializeValue(unknownFile), { now: validNow }),
      'invalid-file',
      ['author@example.invalid']
    )

    const raw = parseSerialized(artifact)
    const duplicate = encoder.encode(
      `{"manifest":${JSON.stringify(raw.manifest)},"content":${JSON.stringify(
        raw.content
      )},"content":${JSON.stringify(raw.content)}}\n`
    )
    assertParseFailure(
      parseCloudPatchArtifact(duplicate, { now: validNow }),
      'noncanonical-artifact'
    )

    const reordered = encoder.encode(
      `{"content":${JSON.stringify(raw.content)},"manifest":${JSON.stringify(
        raw.manifest
      )}}\n`
    )
    assertParseFailure(
      parseCloudPatchArtifact(reordered, { now: validNow }),
      'noncanonical-artifact'
    )

    assertParseFailure(
      parseCloudPatchArtifact(
        encoder.encode(artifact.serialized.replace(/\n$/, '\r\n')),
        { now: validNow }
      ),
      'invalid-text'
    )
    assertParseFailure(
      parseCloudPatchArtifact(
        encoder.encode(artifact.serialized.slice(0, -1)),
        { now: validNow }
      ),
      'invalid-text'
    )
  })

  it('rejects malformed UTF-8, controls, and raw archive inputs', () => {
    assertParseFailure(
      parseCloudPatchArtifact(Uint8Array.from([0xc3, 0x28]), { now: validNow }),
      'invalid-utf8'
    )

    const artifact = createCloudPatchArtifact(workingInput())
    const controlled = artifactBytes(artifact)
    controlled[1] = 0
    assertParseFailure(
      parseCloudPatchArtifact(controlled, { now: validNow }),
      'invalid-text'
    )

    for (const archive of [
      [0x50, 0x4b, 0x03, 0x04],
      [0x1f, 0x8b, 0x08],
      [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    ]) {
      assertParseFailure(
        parseCloudPatchArtifact(Uint8Array.from(archive), { now: validNow }),
        'archive-input'
      )
    }

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({ patch: 'PK\u0003\u0004archive' })
        ),
      'archive-input'
    )
  })

  it('rejects unsafe paths, collisions, symlinks, submodules, and device entries', () => {
    const unsafePaths = [
      '../escape.ts',
      'src/../escape.ts',
      '/absolute.ts',
      'C:/drive.ts',
      '//server/share.ts',
      '\\\\?\\C:\\device.ts',
      'src\\backslash.ts',
      'NUL',
      'aux.txt',
      'trailing.',
      'trailing ',
      '.git/config',
    ]
    for (const path of unsafePaths) {
      assertCreateFailure(
        () =>
          createCloudPatchArtifact(
            commitInput({ files: [{ path, mode: '100644', byteLength: 1 }] })
          ),
        'unsafe-path'
      )
    }

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            files: [
              { path: 'src/File.ts', mode: '100644', byteLength: 1 },
              { path: 'src/file.ts', mode: '100644', byteLength: 1 },
            ],
          })
        ),
      'duplicate-file'
    )

    for (const mode of ['120000', '160000', 'device']) {
      assertCreateFailure(
        () =>
          createCloudPatchArtifact(
            commitInput({
              files: [
                {
                  path: 'src/unsafe',
                  mode,
                  byteLength: 1,
                } as unknown as ICloudPatchFileEntry,
              ],
            })
          ),
        'unsupported-entry'
      )
    }
  })

  it('rejects unsafe patch metadata and inventory mismatches', () => {
    for (const mode of ['120000', '160000']) {
      const patch = [
        'diff --git a/src/config.ts b/src/config.ts',
        `new file mode ${mode}`,
        '--- /dev/null',
        '+++ b/src/config.ts',
        '@@ -0,0 +1 @@',
        '+content',
        '',
      ].join('\n')
      assertCreateFailure(
        () => createCloudPatchArtifact(workingInput({ patch })),
        'unsupported-entry'
      )
    }

    const traversalPatch = WorkingPatch.replace(
      'diff --git a/src/config.ts b/src/config.ts',
      'diff --git a/../config.ts b/../config.ts'
    )
    assertCreateFailure(
      () => createCloudPatchArtifact(workingInput({ patch: traversalPatch })),
      'unsafe-path'
    )

    const traversalSideHeader = WorkingPatch.replace(
      '+++ b/src/config.ts',
      '+++ b/src/../../escape.ts'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(workingInput({ patch: traversalSideHeader })),
      'unsafe-path'
    )

    const mismatchedSideHeader = WorkingPatch.replace(
      '--- a/src/config.ts',
      '--- a/src/other.ts'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(workingInput({ patch: mismatchedSideHeader })),
      'patch-file-mismatch'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            files: [
              ...WorkingFiles,
              { path: 'src/other.ts', mode: '100644', byteLength: 1 },
            ],
          })
        ),
      'file-count-mismatch'
    )
  })

  it('requires one coherent side-header pair and rejects rename or copy metadata', () => {
    const malformedPairs = [
      WorkingPatch.replace('+++ b/src/config.ts', '+++ /dev/null'),
      WorkingPatch.replace('--- a/src/config.ts\n', ''),
      WorkingPatch.replace('+++ b/src/config.ts\n', ''),
      WorkingPatch.replace(
        '--- a/src/config.ts\n',
        '--- a/src/config.ts\n--- a/src/config.ts\n'
      ),
      WorkingPatch.replace(
        '--- a/src/config.ts\n+++ b/src/config.ts',
        '+++ b/src/config.ts\n--- a/src/config.ts'
      ),
      WorkingPatch.replace('--- a/src/config.ts', '--- /dev/null').replace(
        '+++ b/src/config.ts',
        '+++ /dev/null'
      ),
    ]
    for (const patch of malformedPairs) {
      assertCreateFailure(
        () => createCloudPatchArtifact(workingInput({ patch })),
        'invalid-patch'
      )
    }

    for (const metadata of [
      'rename from src/config.ts',
      'rename to src/renamed.ts',
      'copy from src/config.ts',
      'copy to src/copied.ts',
      'similarity index 100%',
      'dissimilarity index 90%',
    ]) {
      const patch = WorkingPatch.replace(
        'index 1111111..2222222 100644',
        `${metadata}\nindex 1111111..2222222 100644`
      )
      assertCreateFailure(
        () => createCloudPatchArtifact(workingInput({ patch })),
        'unsupported-entry'
      )
    }
  })

  it('binds patch disposition and resulting mode to the file inventory', () => {
    const mismatchedCreateMode = [
      'diff --git a/src/config.ts b/src/config.ts',
      'new file mode 100755',
      'index 0000000..2222222',
      '--- /dev/null',
      '+++ b/src/config.ts',
      '@@ -0,0 +1 @@',
      '+content',
      '',
    ].join('\n')
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(workingInput({ patch: mismatchedCreateMode })),
      'patch-file-mismatch'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: mismatchedCreateMode
              .replace('new file mode 100755', 'new file mode 100644')
              .replace('index 0000000..2222222', 'index 1111111..2222222'),
          })
        ),
      'invalid-patch'
    )

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: WorkingPatch.replace(
              'index 1111111..2222222 100644',
              'index 1111111..2222222 100755'
            ),
          })
        ),
      'patch-file-mismatch'
    )

    const modeChange = [
      'diff --git a/src/config.ts b/src/config.ts',
      'old mode 100644',
      'new mode 100755',
      'index 1111111..2222222',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n')
    assertCreateFailure(
      () => createCloudPatchArtifact(workingInput({ patch: modeChange })),
      'patch-file-mismatch'
    )
    assert.doesNotThrow(() =>
      createCloudPatchArtifact(
        workingInput({
          patch: modeChange,
          files: [{ path: 'src/config.ts', mode: '100755', byteLength: 256 }],
        })
      )
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: modeChange.replace(
              'index 1111111..2222222',
              'index 1111111..2222222 100644'
            ),
            files: [{ path: 'src/config.ts', mode: '100755', byteLength: 256 }],
          })
        ),
      'patch-file-mismatch'
    )

    const deletion = [
      'diff --git a/src/config.ts b/src/config.ts',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/src/config.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-content',
      '',
    ].join('\n')
    assert.doesNotThrow(() =>
      createCloudPatchArtifact(
        workingInput({
          patch: deletion,
          files: [{ path: 'src/config.ts', mode: 'deleted', byteLength: 0 }],
        })
      )
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: deletion.replace(
              'index 1111111..0000000',
              'index 1111111..2222222'
            ),
            files: [{ path: 'src/config.ts', mode: 'deleted', byteLength: 0 }],
          })
        ),
      'invalid-patch'
    )
    for (const index of [
      'index 0000000..2222222 100644',
      'index 1111111..22222222 100644',
    ]) {
      assertCreateFailure(
        () =>
          createCloudPatchArtifact(
            workingInput({
              patch: WorkingPatch.replace(
                'index 1111111..2222222 100644',
                index
              ),
            })
          ),
        'invalid-patch'
      )
    }
  })

  it('supports only inventory-bound metadata-only empty file changes', () => {
    const emptyCreate = [
      'diff --git a/empty.txt b/empty.txt',
      'new file mode 100644',
      'index 0000000..e69de29',
      '',
    ].join('\n')
    const created = createCloudPatchArtifact(
      workingInput({
        patch: emptyCreate,
        files: [{ path: 'empty.txt', mode: '100644', byteLength: 0 }],
      })
    )
    assert.equal(
      parseCloudPatchArtifact(artifactBytes(created), { now: validNow }).ok,
      true
    )

    const emptyDelete = [
      'diff --git a/empty.txt b/empty.txt',
      'deleted file mode 100644',
      'index e69de29..0000000',
      '',
    ].join('\n')
    const deleted = createCloudPatchArtifact(
      workingInput({
        patch: emptyDelete,
        files: [{ path: 'empty.txt', mode: 'deleted', byteLength: 0 }],
      })
    )
    assert.equal(
      parseCloudPatchArtifact(artifactBytes(deleted), { now: validNow }).ok,
      true
    )

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: emptyCreate,
            files: [{ path: 'empty.txt', mode: '100644', byteLength: 1 }],
          })
        ),
      'patch-file-mismatch'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: emptyCreate.replace('new file mode 100644\n', ''),
            files: [{ path: 'empty.txt', mode: '100644', byteLength: 0 }],
          })
        ),
      'invalid-patch'
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({
            patch: [
              'diff --git a/empty.txt b/empty.txt',
              'old mode 100644',
              'new mode 100755',
              'index e69de29..e69de29',
              '',
            ].join('\n'),
            files: [{ path: 'empty.txt', mode: '100755', byteLength: 0 }],
          })
        ),
      'invalid-patch'
    )
  })

  it('accepts exact caps and rejects values one byte or entry over', () => {
    const exactFile = createCloudPatchArtifact(
      commitInput({
        files: [
          {
            path: 'large.bin',
            mode: '100644',
            byteLength: MaximumCloudPatchFileBytes,
          },
        ],
      })
    )
    assert.equal(
      exactFile.manifest.files[0].byteLength,
      MaximumCloudPatchFileBytes
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            files: [
              {
                path: 'large.bin',
                mode: '100644',
                byteLength: MaximumCloudPatchFileBytes + 1,
              },
            ],
          })
        ),
      'file-too-large'
    )

    const prefix = [
      'diff --git a/src/config.ts b/src/config.ts',
      'index 1111111..2222222 100644',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -0,0 +1 @@',
      '+',
    ].join('\n')
    const exactPatch = `${prefix}${'x'.repeat(
      MaximumCloudPatchPatchBytes - encoder.encode(prefix).byteLength - 1
    )}\n`
    assert.equal(
      encoder.encode(exactPatch).byteLength,
      MaximumCloudPatchPatchBytes
    )
    assert.equal(
      createCloudPatchArtifact(workingInput({ patch: exactPatch })).manifest
        .contentByteLength,
      MaximumCloudPatchPatchBytes
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          workingInput({ patch: exactPatch.replace(/\n$/, 'x\n') })
        ),
      'patch-too-large'
    )

    const maximumFiles = Array.from(
      { length: MaximumCloudPatchFiles },
      (_, index) => ({
        path: `files/${index.toString().padStart(4, '0')}`,
        mode: '100644' as const,
        byteLength: 1,
      })
    )
    assert.equal(
      createCloudPatchArtifact(commitInput({ files: maximumFiles })).manifest
        .fileCount,
      MaximumCloudPatchFiles
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            files: [
              ...maximumFiles,
              { path: 'files/overflow', mode: '100644', byteLength: 1 },
            ],
          })
        ),
      'too-many-files'
    )
  })

  it('enforces path, manifest, and artifact cap boundaries', () => {
    const exactPath = [
      'a'.repeat(32),
      ...Array.from({ length: MaximumCloudPatchPathDepth - 1 }, () =>
        'a'.repeat(31)
      ),
    ].join('/')
    assert.equal(
      encoder.encode(exactPath).byteLength,
      MaximumCloudPatchPathBytes
    )
    assert.equal(exactPath.split('/').length, MaximumCloudPatchPathDepth)
    assert.doesNotThrow(() =>
      createCloudPatchArtifact(
        commitInput({
          files: [{ path: exactPath, mode: '100644', byteLength: 1 }],
        })
      )
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            files: [{ path: `${exactPath}a`, mode: '100644', byteLength: 1 }],
          })
        ),
      'unsafe-path'
    )
    assert.doesNotThrow(() =>
      createCloudPatchArtifact(
        commitInput({
          files: [
            {
              path: 'a'.repeat(MaximumCloudPatchPathSegmentBytes),
              mode: '100644',
              byteLength: 1,
            },
          ],
        })
      )
    )
    assertCreateFailure(
      () =>
        createCloudPatchArtifact(
          commitInput({
            files: [
              {
                path: 'a'.repeat(MaximumCloudPatchPathSegmentBytes + 1),
                mode: '100644',
                byteLength: 1,
              },
            ],
          })
        ),
      'unsafe-path'
    )

    const manifestOverhead = encoder.encode(
      `${JSON.stringify({ padding: '' })}\n`
    ).byteLength
    const manifestAtCap = {
      padding: 'x'.repeat(MaximumCloudPatchManifestBytes - manifestOverhead),
    }
    assertParseFailure(
      parseCloudPatchArtifact(
        serializeValue({ manifest: manifestAtCap, content: null }),
        { now: validNow }
      ),
      'invalid-input'
    )
    manifestAtCap.padding += 'x'
    assertParseFailure(
      parseCloudPatchArtifact(
        serializeValue({ manifest: manifestAtCap, content: null }),
        { now: validNow }
      ),
      'manifest-too-large'
    )

    assert.notEqual(
      parseCloudPatchArtifact(new Uint8Array(MaximumCloudPatchArtifactBytes), {
        now: validNow,
      }).ok,
      true
    )
    assertParseFailure(
      parseCloudPatchArtifact(
        new Uint8Array(MaximumCloudPatchArtifactBytes + 1),
        { now: validNow }
      ),
      'artifact-too-large'
    )
  })

  it('returns fixed safe errors without patch content or hash exceptions', () => {
    const artifact = createCloudPatchArtifact(workingInput())
    const wrongRepository = verifyCloudPatchArtifact(
      artifactBytes(artifact),
      {
        kind: 'working-tree-patch',
        repositoryId: OtherRepositoryId,
        baseSha: BaseSha,
        expectedArtifactSha256: artifact.artifactSha256,
      },
      { now: validNow }
    )
    assertParseFailure(wrongRepository, 'repository-mismatch', SecretMarkers)

    assertCreateFailure(
      () =>
        createCloudPatchArtifact(workingInput(), {
          sha256: () => {
            throw new Error(SecretMarkers.join(' '))
          },
        }),
      'hash-failure'
    )

    const failedHash = parseCloudPatchArtifact(artifactBytes(artifact), {
      now: validNow,
      sha256: () => {
        throw new Error(SecretMarkers.join(' '))
      },
    })
    assertParseFailure(failedHash, 'hash-failure', SecretMarkers)
  })
})
