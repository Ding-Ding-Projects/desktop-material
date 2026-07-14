import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ActionsArtifactMaximumPage,
  ActionsArtifactPageSize,
  getActionsArtifactDefaultFileName,
  mergeActionsArtifactPage,
  parseActionsArtifactAttestationPresence,
  parseActionsArtifactList,
} from '../../src/lib/actions-artifacts'

const digest = `sha256:${'A'.repeat(64)}`

const artifact = (overrides: Record<string, unknown> = {}) => ({
  id: 19,
  name: 'Windows package',
  size_in_bytes: 2048,
  expired: false,
  created_at: '2026-07-13T10:00:00Z',
  expires_at: '2026-10-11T10:00:00Z',
  updated_at: '2026-07-13T10:01:00Z',
  digest,
  workflow_run: {
    id: 7,
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
  },
  ...overrides,
})

describe('GitHub Actions artifact contracts', () => {
  it('normalizes a bounded artifact page and its provenance context', () => {
    const parsed = parseActionsArtifactList(
      { total_count: 2, artifacts: [artifact()] },
      7
    )

    assert.equal(parsed.totalCount, 2)
    assert.equal(parsed.page, 1)
    assert.equal(parsed.nextPage, 2)
    assert.equal(parsed.truncated, true)
    assert.equal(parsed.artifacts[0].digest, digest.toLowerCase())
    assert.deepEqual(parsed.artifacts[0].workflowRun, {
      id: 7,
      headBranch: 'main',
      headSha: 'a'.repeat(40),
    })
    assert.equal(
      parsed.artifacts[0].expiresAt?.toISOString(),
      '2026-10-11T10:00:00.000Z'
    )
  })

  it('accepts old artifacts without a digest or embedded run', () => {
    const parsed = parseActionsArtifactList(
      {
        total_count: 1,
        artifacts: [artifact({ digest: null, workflow_run: null })],
      },
      7
    )
    assert.equal(parsed.artifacts[0].digest, null)
    assert.equal(parsed.artifacts[0].workflowRun, null)
  })

  it('rejects malformed, duplicate, cross-run, and unbounded results', () => {
    assert.throws(() =>
      parseActionsArtifactList(
        { total_count: 1, artifacts: [artifact({ digest: 'md5:bad' })] },
        7
      )
    )
    assert.throws(() =>
      parseActionsArtifactList(
        { total_count: 2, artifacts: [artifact(), artifact()] },
        7
      )
    )
    assert.throws(() =>
      parseActionsArtifactList(
        {
          total_count: 1,
          artifacts: [
            artifact({
              workflow_run: {
                id: 8,
                head_branch: 'main',
                head_sha: 'a'.repeat(40),
              },
            }),
          ],
        },
        7
      )
    )
    assert.throws(() =>
      parseActionsArtifactList(
        {
          total_count: ActionsArtifactPageSize + 1,
          artifacts: Array.from(
            { length: ActionsArtifactPageSize + 1 },
            (_, id) => artifact({ id: id + 1 })
          ),
        },
        7
      )
    )
    assert.throws(() =>
      parseActionsArtifactList({ total_count: 0, artifacts: [artifact()] }, 7)
    )
    for (const malformed of [
      { id: 0 },
      { name: 'invalid\u0000name' },
      { size_in_bytes: -1 },
      { created_at: 'not-a-date' },
      {
        workflow_run: {
          id: 7,
          head_branch: 'main',
          head_sha: 'not-an-object-id',
        },
      },
    ]) {
      assert.throws(() =>
        parseActionsArtifactList(
          { total_count: 1, artifacts: [artifact(malformed)] },
          7
        )
      )
    }
    for (const invalidPage of [0, Number.NaN, ActionsArtifactMaximumPage + 1]) {
      assert.throws(() =>
        parseActionsArtifactList(
          { total_count: 1, artifacts: [artifact()] },
          7,
          invalidPage
        )
      )
    }
  })

  it('merges shifted later pages without duplicate artifact cards', () => {
    const first = parseActionsArtifactList(
      {
        total_count: 61,
        artifacts: Array.from({ length: ActionsArtifactPageSize }, (_, index) =>
          artifact({ id: index + 1, name: `artifact ${index + 1}` })
        ),
      },
      7,
      1
    )
    const second = parseActionsArtifactList(
      {
        total_count: 61,
        artifacts: [
          artifact({ id: 30, name: 'artifact 30 updated' }),
          artifact({ id: 31, name: 'artifact 31' }),
        ],
      },
      7,
      2
    )

    const merged = mergeActionsArtifactPage(first, second)
    assert.equal(merged.artifacts.length, 31)
    assert.equal(merged.artifacts[29].name, 'artifact 30 updated')
    assert.equal(merged.artifacts[30].id, 31)
    assert.equal(merged.page, 2)
    assert.equal(merged.nextPage, 3)
    assert.equal(merged.truncated, true)
    assert.throws(() => mergeActionsArtifactPage(merged, second))
  })

  it('never offers a provider page beyond the validated maximum', () => {
    const parsed = parseActionsArtifactList(
      { total_count: Number.MAX_SAFE_INTEGER, artifacts: [artifact()] },
      7,
      ActionsArtifactMaximumPage
    )
    assert.equal(parsed.nextPage, null)
    assert.throws(() =>
      parseActionsArtifactList(
        { total_count: 1, artifacts: [artifact()] },
        7,
        ActionsArtifactMaximumPage + 1
      )
    )
  })

  it('uses one bounded probe when the last reported page only shifted ids', () => {
    const first = parseActionsArtifactList(
      {
        total_count: 31,
        artifacts: Array.from({ length: ActionsArtifactPageSize }, (_, index) =>
          artifact({ id: index + 1 })
        ),
      },
      7,
      1
    )
    const shiftedLast = parseActionsArtifactList(
      { total_count: 31, artifacts: [artifact({ id: 30 })] },
      7,
      2
    )
    const probe = mergeActionsArtifactPage(first, shiftedLast)
    assert.equal(probe.artifacts.length, 30)
    assert.equal(probe.nextPage, 3)

    const emptyProbe = parseActionsArtifactList(
      { total_count: 31, artifacts: [] },
      7,
      3
    )
    const stopped = mergeActionsArtifactPage(probe, emptyProbe)
    assert.equal(stopped.nextPage, null)
    assert.equal(stopped.truncated, true)

    const duplicateProbe = parseActionsArtifactList(
      { total_count: 31, artifacts: [artifact({ id: 30 })] },
      7,
      3
    )
    const bounded = mergeActionsArtifactPage(probe, duplicateProbe)
    assert.equal(bounded.nextPage, null)
  })

  it('reports attestation presence without interpreting the bundle', () => {
    assert.equal(
      parseActionsArtifactAttestationPresence({ attestations: [] }),
      false
    )
    assert.equal(
      parseActionsArtifactAttestationPresence({
        attestations: [{ bundle: { opaque: true } }],
      }),
      true
    )
    assert.throws(() =>
      parseActionsArtifactAttestationPresence({ attestations: [{}, {}] })
    )
  })

  it('builds Windows-safe, bounded archive names', () => {
    assert.equal(
      getActionsArtifactDefaultFileName('release: windows / x64.zip'),
      'release_ windows _ x64.zip'
    )
    assert.equal(getActionsArtifactDefaultFileName('CON'), '_CON.zip')
    assert.equal(getActionsArtifactDefaultFileName('...'), 'artifact.zip')
    assert.ok(getActionsArtifactDefaultFileName('x'.repeat(400)).length <= 184)
  })
})
