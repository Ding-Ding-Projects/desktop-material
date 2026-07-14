import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  ActionsArtifactProvenanceMaximumAnnotatedTagDepth,
  ActionsArtifactProvenanceMaximumReferencedWorkflows,
  IActionsArtifactProvenanceAnnotatedTag,
  IActionsArtifactProvenanceGitRef,
  IActionsArtifactProvenanceRefLoader,
  normalizeActionsArtifactSourceRefName,
  parseActionsArtifactProvenanceAnnotatedTag,
  parseActionsArtifactProvenanceGitRef,
  parseActionsArtifactProvenanceRepositoryMetadata,
  parseActionsArtifactProvenanceRunAttemptMetadata,
  resolveActionsArtifactProvenanceSourceRef,
} from '../../src/lib/actions-artifact-provenance-metadata'

const runId = 29283111640
const sourceSHA = '7d3af28c422bf02197a99f195b689b34377e11a2'
const otherSHA = 'b'.repeat(40)

const attemptResponse = () => ({
  id: runId,
  run_attempt: 1,
  head_branch: 'release/v1',
  head_sha: sourceSHA,
  path: '.github/workflows/prober.yml',
  referenced_workflows: [],
})

function gitRef(
  ref: string,
  type: 'commit' | 'tag' | 'tree' | 'blob',
  sha: string
): IActionsArtifactProvenanceGitRef {
  return { ref, object: { type, sha } }
}

function annotatedTag(
  sha: string,
  type: 'commit' | 'tag' | 'tree' | 'blob',
  targetSHA: string
): IActionsArtifactProvenanceAnnotatedTag {
  return { sha, object: { type, sha: targetSHA } }
}

function loaderFor(
  refs: Readonly<Record<string, IActionsArtifactProvenanceGitRef | null>>,
  tags: Readonly<Record<string, IActionsArtifactProvenanceAnnotatedTag>> = {}
): {
  readonly loader: IActionsArtifactProvenanceRefLoader
  readonly calls: string[]
} {
  const calls = new Array<string>()
  return {
    calls,
    loader: {
      getRef: async (namespace, name) => {
        calls.push(`ref:${namespace}:${name}`)
        return refs[`${namespace}:${name}`] ?? null
      },
      getAnnotatedTag: async sha => {
        calls.push(`tag:${sha}`)
        const tag = tags[sha]
        if (tag === undefined) {
          throw new Error('missing test tag')
        }
        return tag
      },
    },
  }
}

describe('Actions artifact authoritative provenance metadata', () => {
  it('normalizes every exact visibility and drops repository provider fields', () => {
    for (const visibility of ['public', 'private', 'internal'] as const) {
      assert.deepEqual(
        parseActionsArtifactProvenanceRepositoryMetadata({
          full_name: 'actions/attest',
          visibility,
          private: visibility !== 'public',
          owner: { login: 'not returned' },
        }),
        { full_name: 'actions/attest', visibility }
      )
    }
    for (const value of [
      { full_name: 'actions/attest' },
      { full_name: 'actions/attest', visibility: 'unknown' },
      { full_name: 'actions/attest/extra', visibility: 'public' },
      { full_name: 'actions\u0000/attest', visibility: 'public' },
      new Date(),
    ]) {
      assert.throws(() =>
        parseActionsArtifactProvenanceRepositoryMetadata(value)
      )
    }
  })

  it('returns only the bounded exact run-attempt subset', () => {
    const result = parseActionsArtifactProvenanceRunAttemptMetadata({
      ...attemptResponse(),
      path: '.github/workflows/prober.yml@main',
      referenced_workflows: [
        {
          path: 'actions/reusable/.github/workflows/build.yml@refs/heads/main',
          ref: 'refs/heads/main',
          sha: sourceSHA,
          extra: 'not returned',
        },
        {
          path: 'actions/reusable/.github/workflows/build.yml@main',
        },
      ],
      token: 'not returned',
    })

    assert.deepEqual(result, {
      id: runId,
      run_attempt: 1,
      head_branch: 'release/v1',
      head_sha: sourceSHA,
      path: '.github/workflows/prober.yml@main',
      referenced_workflows: [
        {
          path: 'actions/reusable/.github/workflows/build.yml@refs/heads/main',
          ref: 'refs/heads/main',
          sha: sourceSHA,
        },
        {
          path: 'actions/reusable/.github/workflows/build.yml@main',
          ref: null,
          sha: null,
        },
      ],
    })
    assert.deepEqual(
      parseActionsArtifactProvenanceRunAttemptMetadata({
        id: runId,
        run_attempt: 1,
        head_branch: 'release/v1',
        head_sha: sourceSHA,
        path: '.github/workflows/prober.yml',
      }).referenced_workflows,
      []
    )
    assert.equal(
      parseActionsArtifactProvenanceRunAttemptMetadata({
        ...attemptResponse(),
        head_sha: 'a'.repeat(64),
      }).head_sha,
      'a'.repeat(64)
    )
  })

  it('rejects invalid attempts, refs, workflow metadata, and limits', () => {
    const invalidAttempts = [
      { ...attemptResponse(), id: 0 },
      { ...attemptResponse(), id: Number.MAX_SAFE_INTEGER + 1 },
      { ...attemptResponse(), run_attempt: 1.5 },
      { ...attemptResponse(), head_sha: sourceSHA.toUpperCase() },
      { ...attemptResponse(), head_branch: 'refs/heads/main' },
      { ...attemptResponse(), head_branch: '../main' },
      { ...attemptResponse(), head_branch: 'main?per_page=100' },
      { ...attemptResponse(), head_branch: 'main\u0000evil' },
      { ...attemptResponse(), path: '.github/workflows/../secret.yml' },
      {
        ...attemptResponse(),
        referenced_workflows: Array.from(
          {
            length: ActionsArtifactProvenanceMaximumReferencedWorkflows + 1,
          },
          () => ({})
        ),
      },
      {
        ...attemptResponse(),
        referenced_workflows: [
          {
            path: 'actions/reusable/.github/workflows/build.yml@main',
            ref: 'main',
            sha: sourceSHA,
          },
        ],
      },
      {
        ...attemptResponse(),
        referenced_workflows: [
          {
            path: 'actions/reusable/.github/workflows/build.yml@main',
            ref: 'refs/heads/main',
            sha: sourceSHA.toUpperCase(),
          },
        ],
      },
    ]
    for (const value of invalidAttempts) {
      assert.throws(() =>
        parseActionsArtifactProvenanceRunAttemptMetadata(value)
      )
    }
  })

  it('normalizes bounded Git refs and annotated tags without raw fields', () => {
    assert.deepEqual(
      parseActionsArtifactProvenanceGitRef({
        ref: 'refs/heads/release/v1',
        node_id: 'not returned',
        object: { type: 'commit', sha: sourceSHA, url: 'not returned' },
      }),
      gitRef('refs/heads/release/v1', 'commit', sourceSHA)
    )
    assert.deepEqual(
      parseActionsArtifactProvenanceAnnotatedTag({
        sha: 'a'.repeat(64),
        message: 'not returned',
        object: { type: 'tag', sha: 'b'.repeat(64), url: 'not returned' },
      }),
      annotatedTag('a'.repeat(64), 'tag', 'b'.repeat(64))
    )

    for (const value of [
      { ref: 'main', object: { type: 'commit', sha: sourceSHA } },
      {
        ref: 'refs/heads/main',
        object: { type: 'unknown', sha: sourceSHA },
      },
      {
        ref: 'refs/heads/main',
        object: { type: 'commit', sha: sourceSHA.toUpperCase() },
      },
      { ref: 'refs/heads/main', object: null },
    ]) {
      assert.throws(() => parseActionsArtifactProvenanceGitRef(value))
    }
    assert.throws(() =>
      parseActionsArtifactProvenanceAnnotatedTag({
        sha: sourceSHA,
        object: { type: 'commit', sha: 'bad' },
      })
    )
  })

  it('validates an unqualified conservative branch or tag lookup name', () => {
    assert.equal(
      normalizeActionsArtifactSourceRefName('feature/provenance-v1'),
      'feature/provenance-v1'
    )
    for (const value of [
      'refs/heads/main',
      '../main',
      '.hidden/main',
      'main.lock',
      'main//next',
      'main@{1}',
      '-main',
      'main?x=1',
      'main%2Fnext',
      'main\nnext',
      'máin',
    ]) {
      assert.throws(() => normalizeActionsArtifactSourceRefName(value))
    }
  })

  it('resolves exact branch and lightweight-tag commits serially', async () => {
    const branch = loaderFor({
      'heads:release/v1': gitRef('refs/heads/release/v1', 'commit', sourceSHA),
      'tags:release/v1': null,
    })
    assert.equal(
      await resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        branch.loader
      ),
      'refs/heads/release/v1'
    )
    assert.deepEqual(branch.calls, [
      'ref:heads:release/v1',
      'ref:tags:release/v1',
    ])

    const tag = loaderFor({
      'heads:release/v1': null,
      'tags:release/v1': gitRef('refs/tags/release/v1', 'commit', sourceSHA),
    })
    assert.equal(
      await resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        tag.loader
      ),
      'refs/tags/release/v1'
    )
  })

  it('does not request the tag namespace until the head lookup settles', async () => {
    const calls = new Array<string>()
    let settleHead: (() => void) | undefined
    const pendingHead = new Promise<IActionsArtifactProvenanceGitRef | null>(
      resolve => {
        settleHead = () => resolve(null)
      }
    )
    const pending = resolveActionsArtifactProvenanceSourceRef(
      parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
      {
        getRef: async namespace => {
          calls.push(namespace)
          return namespace === 'heads' ? await pendingHead : null
        },
        getAnnotatedTag: async () => {
          throw new Error('unreachable')
        },
      }
    )
    await Promise.resolve()
    assert.deepEqual(calls, ['heads'])
    assert.ok(settleHead !== undefined)
    settleHead()
    assert.equal(await pending, null)
    assert.deepEqual(calls, ['heads', 'tags'])
  })

  it('peels exact annotated and nested tags up to the depth limit', async () => {
    const root = 'a'.repeat(40)
    const nested = 'c'.repeat(40)
    const tags = loaderFor(
      {
        'heads:release/v1': null,
        'tags:release/v1': gitRef('refs/tags/release/v1', 'tag', root),
      },
      {
        [root]: annotatedTag(root, 'tag', nested),
        [nested]: annotatedTag(nested, 'commit', sourceSHA),
      }
    )
    assert.equal(
      await resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        tags.loader
      ),
      'refs/tags/release/v1'
    )
    assert.deepEqual(tags.calls, [
      'ref:heads:release/v1',
      'ref:tags:release/v1',
      `tag:${root}`,
      `tag:${nested}`,
    ])

    const chain = Array.from(
      { length: ActionsArtifactProvenanceMaximumAnnotatedTagDepth },
      (_, index) => index.toString(16).padStart(40, '0')
    )
    const chainTags: Record<string, IActionsArtifactProvenanceAnnotatedTag> = {}
    for (let index = 0; index < chain.length; index++) {
      chainTags[chain[index]] = annotatedTag(
        chain[index],
        index === chain.length - 1 ? 'commit' : 'tag',
        index === chain.length - 1 ? sourceSHA : chain[index + 1]
      )
    }
    const boundary = loaderFor(
      {
        'heads:release/v1': null,
        'tags:release/v1': gitRef('refs/tags/release/v1', 'tag', chain[0]),
      },
      chainTags
    )
    assert.equal(
      await resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        boundary.loader
      ),
      'refs/tags/release/v1'
    )
  })

  it('returns null for moved, missing, or ambiguous branch/tag candidates', async () => {
    const candidates: Array<
      Record<string, IActionsArtifactProvenanceGitRef | null>
    > = [
      {},
      {
        'heads:release/v1': gitRef('refs/heads/release/v1', 'commit', otherSHA),
        'tags:release/v1': gitRef('refs/tags/release/v1', 'commit', otherSHA),
      },
      {
        'heads:release/v1': gitRef(
          'refs/heads/release/v1',
          'commit',
          sourceSHA
        ),
        'tags:release/v1': gitRef('refs/tags/release/v1', 'commit', sourceSHA),
      },
    ]
    for (const refs of candidates) {
      const value = loaderFor(refs)
      assert.equal(
        await resolveActionsArtifactProvenanceSourceRef(
          parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
          value.loader
        ),
        null
      )
    }

    const noBranch = parseActionsArtifactProvenanceRunAttemptMetadata({
      ...attemptResponse(),
      head_branch: null,
    })
    const unused = loaderFor({})
    assert.equal(
      await resolveActionsArtifactProvenanceSourceRef(noBranch, unused.loader),
      null
    )
    assert.deepEqual(unused.calls, [])
  })

  it('rejects inconsistent refs, cycles, depth, trees, blobs, and tag roots', async () => {
    const root = 'a'.repeat(40)
    const nested = 'c'.repeat(40)
    const cases = [
      loaderFor({
        'heads:release/v1': gitRef('refs/heads/other', 'commit', sourceSHA),
      }),
      loaderFor({
        'heads:release/v1': gitRef('refs/heads/release/v1', 'tree', sourceSHA),
      }),
      loaderFor({
        'tags:release/v1': gitRef('refs/tags/release/v1', 'blob', sourceSHA),
      }),
      loaderFor(
        {
          'tags:release/v1': gitRef('refs/tags/release/v1', 'tag', root),
        },
        { [root]: annotatedTag(nested, 'commit', sourceSHA) }
      ),
      loaderFor(
        {
          'tags:release/v1': gitRef('refs/tags/release/v1', 'tag', root),
        },
        {
          [root]: annotatedTag(root, 'tag', nested),
          [nested]: annotatedTag(nested, 'tag', root),
        }
      ),
    ]
    for (const value of cases) {
      await assert.rejects(() =>
        resolveActionsArtifactProvenanceSourceRef(
          parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
          value.loader
        )
      )
    }

    const chain = Array.from(
      { length: ActionsArtifactProvenanceMaximumAnnotatedTagDepth + 1 },
      (_, index) => (index + 1).toString(16).padStart(40, '0')
    )
    const tooDeepTags: Record<string, IActionsArtifactProvenanceAnnotatedTag> =
      {}
    for (let index = 0; index < chain.length - 1; index++) {
      tooDeepTags[chain[index]] = annotatedTag(
        chain[index],
        'tag',
        chain[index + 1]
      )
    }
    const tooDeep = loaderFor(
      {
        'tags:release/v1': gitRef('refs/tags/release/v1', 'tag', chain[0]),
      },
      tooDeepTags
    )
    await assert.rejects(() =>
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        tooDeep.loader
      )
    )
  })

  it('preserves loader errors and exact abort timing', async () => {
    const failure = new Error('provider unavailable')
    await assert.rejects(
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        {
          getRef: async () => {
            throw failure
          },
          getAnnotatedTag: async () => {
            throw new Error('unreachable')
          },
        }
      ),
      error => error === failure
    )

    const preAborted = new AbortController()
    preAborted.abort()
    const unused = loaderFor({})
    await assert.rejects(
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        unused.loader,
        preAborted.signal
      ),
      error => (error as Error).name === 'AbortError'
    )
    assert.deepEqual(unused.calls, [])

    const between = new AbortController()
    const calls = new Array<string>()
    await assert.rejects(
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        {
          getRef: async namespace => {
            calls.push(namespace)
            between.abort()
            return null
          },
          getAnnotatedTag: async () => {
            throw new Error('unreachable')
          },
        },
        between.signal
      ),
      error => (error as Error).name === 'AbortError'
    )
    assert.deepEqual(calls, ['heads'])
  })

  it('preserves later tag-ref and annotated-tag provider failures', async () => {
    const tagRefFailure = new Error('tag ref unavailable')
    await assert.rejects(
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        {
          getRef: async namespace => {
            if (namespace === 'heads') {
              return gitRef('refs/heads/release/v1', 'commit', sourceSHA)
            }
            throw tagRefFailure
          },
          getAnnotatedTag: async () => {
            throw new Error('unreachable')
          },
        }
      ),
      error => error === tagRefFailure
    )

    const annotatedTagFailure = new Error('annotated tag unavailable')
    await assert.rejects(
      resolveActionsArtifactProvenanceSourceRef(
        parseActionsArtifactProvenanceRunAttemptMetadata(attemptResponse()),
        {
          getRef: async namespace =>
            namespace === 'heads'
              ? null
              : gitRef('refs/tags/release/v1', 'tag', 'a'.repeat(40)),
          getAnnotatedTag: async () => {
            throw annotatedTagFailure
          },
        }
      ),
      error => error === annotatedTagFailure
    )
  })
})
