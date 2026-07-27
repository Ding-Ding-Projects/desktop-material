import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA } from '../../../src/lib/cheap-lfs/cloud-compression'
import {
  assertCheapLfsPublicSurfaceIsClean,
  buildCheapLfsEncryptedBuilderRegistration,
  CHEAP_LFS_ENCRYPTED_BUILDER_COMPRESSOR_URL,
  CheapLfsPrivateIdentifierLeakError,
  cheapLfsBuilderReleaseTargetSecretName,
  cheapLfsBuilderReleaseTokenSecretName,
  cheapLfsPrivateIdentifierTokens,
  cheapLfsPrivateIdentityFromRepository,
  decodeCheapLfsEncryptedBuilderPayload,
  deriveCheapLfsBuilderProjectId,
  deriveCheapLfsBuilderSecretSuffix,
  deriveCheapLfsPublicBuilderName,
  encodeCheapLfsEncryptedBuilderPayload,
  ICheapLfsPrivateIdentity,
  prepareCheapLfsEncryptedBuilder,
  renderCheapLfsEncryptedBuilderProjectBody,
} from '../../../src/lib/cheap-lfs/encrypted-builder'
import { defaultBuildRunPreferences } from '../../../src/models/build-run-preferences'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'

/**
 * A private repository whose every identifier — owner, name, tracked path, and
 * the asset name derived from that path — is a word no shell script, workflow
 * template, or GitHub keyword would ever contain on its own.
 */
const identity: ICheapLfsPrivateIdentity = {
  owner: 'Sunbeam-Holdings',
  name: 'orbital-teardown',
  releaseTarget: 'Sunbeam-Holdings/orbital-teardown',
  assetNames: ['cheap-lfs-marquetry%2Fquarterly-teardown.psd-part1.bin'],
  paths: ['marquetry/quarterly-teardown.psd'],
}

function privateRepositoryAt(
  owner: string,
  name: string,
  isPrivate: boolean | null = true
): Repository {
  return new Repository(
    'C:\\checkout',
    1,
    new GitHubRepository(
      name,
      new Owner(owner, 'https://api.github.com', 1),
      1,
      isPrivate
    ),
    false,
    null,
    {},
    false,
    undefined,
    null,
    defaultBuildRunPreferences
  )
}

describe('Cheap LFS encrypted builder identity', () => {
  it('reads an identity only from a confirmed-private GitHub repository', () => {
    assert.equal(
      cheapLfsPrivateIdentityFromRepository(
        privateRepositoryAt('desktop', 'material', false)
      ),
      null
    )
    assert.equal(
      cheapLfsPrivateIdentityFromRepository(
        privateRepositoryAt('desktop', 'material', null)
      ),
      null
    )
    assert.deepEqual(
      cheapLfsPrivateIdentityFromRepository(
        privateRepositoryAt('Sunbeam-Holdings', 'orbital-teardown')
      ),
      {
        owner: 'Sunbeam-Holdings',
        name: 'orbital-teardown',
        releaseTarget: 'Sunbeam-Holdings/orbital-teardown',
        assetNames: [],
        paths: [],
      }
    )
  })
})

describe('Cheap LFS encrypted builder opaque tokens', () => {
  it('derives ids and names from a hash, never from the repository name', () => {
    const projectId = deriveCheapLfsBuilderProjectId(identity)
    const suffix = deriveCheapLfsBuilderSecretSuffix(identity)
    const builder = deriveCheapLfsPublicBuilderName(identity)

    // Lowercase alphanumerics minus the pairs that read alike in a log.
    assert.match(projectId, /^[a-km-np-z2-9]{16}$/)
    assert.match(suffix, /^[A-HJ-NP-Z2-9]{12}$/)
    assert.match(builder, /^[a-z]{5}-[a-z]{5}-[a-z]{5}$/)

    // Nothing recognizable survives, in either direction.
    for (const token of cheapLfsPrivateIdentifierTokens(identity)) {
      for (const derived of [projectId, suffix, builder]) {
        assert.doesNotMatch(
          derived,
          new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          `${derived} leaks ${token}`
        )
      }
    }
    // Secret names stay inside GitHub's `A-Z0-9_` alphabet and never begin
    // with a digit or the reserved `GITHUB_` prefix.
    assert.match(
      cheapLfsBuilderReleaseTargetSecretName(suffix),
      /^[A-Z][A-Z0-9_]*$/
    )
    assert.doesNotMatch(
      cheapLfsBuilderReleaseTokenSecretName(suffix),
      /^GITHUB_/
    )
  })

  it('is stable for one repository and unrelated between two', () => {
    const other: ICheapLfsPrivateIdentity = {
      ...identity,
      name: 'orbital-teardowo',
      releaseTarget: 'Sunbeam-Holdings/orbital-teardowo',
    }
    assert.equal(
      deriveCheapLfsBuilderProjectId(identity),
      deriveCheapLfsBuilderProjectId({ ...identity, paths: ['unrelated'] })
    )
    // A one-character difference changes every token completely; nothing about
    // the derivation is positional or prefix-preserving.
    assert.notEqual(
      deriveCheapLfsBuilderProjectId(identity),
      deriveCheapLfsBuilderProjectId(other)
    )
    assert.notEqual(
      deriveCheapLfsBuilderSecretSuffix(identity),
      deriveCheapLfsBuilderSecretSuffix(other)
    )
    assert.notEqual(
      deriveCheapLfsPublicBuilderName(identity),
      deriveCheapLfsPublicBuilderName(other)
    )
    // Each token has its own domain separator, so one identity never produces
    // two tokens that give each other away.
    assert.notEqual(
      deriveCheapLfsBuilderProjectId(identity).toUpperCase(),
      deriveCheapLfsBuilderSecretSuffix(identity)
    )
  })
})

describe('Cheap LFS encrypted builder project body', () => {
  const body = renderCheapLfsEncryptedBuilderProjectBody()

  it('takes the target, the token, and even its own source from secrets', () => {
    assert.match(body, /\$\{RELEASE_TARGET:-\}/)
    assert.match(body, /\$\{RELEASE_TOKEN:-\}/)
    assert.match(body, /\$\{RUNTIME_SOURCE:-\}/)
    // Not one repository, owner, or URL is written into the job itself.
    assert.doesNotMatch(body, /github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.git/)
    assert.doesNotMatch(body, /raw\.githubusercontent\.com/)
  })

  it('masks the target before it is ever used, halves included', () => {
    const mask = body.indexOf('::add-mask::${RELEASE_TARGET}')
    const use = body.indexOf('git -c credential.helper=')
    assert.ok(mask > 0 && use > mask, 'the target is used before it is masked')
    assert.match(body, /::add-mask::\$\{RELEASE_TARGET%%\/\*\}/)
    assert.match(body, /::add-mask::\$\{RELEASE_TARGET##\*\/\}/)
    assert.match(body, /::add-mask::\$\{RELEASE_TOKEN\}/)
  })

  it('never lets the compressor print a path or an asset name publicly', () => {
    // The compressor logs `<path> / <asset>` for every object it touches and
    // writes the same into the job summary. On a public runner both would be
    // world-readable, so the summary is unset and the transcript is captured
    // to a runner-local file that is deleted, never echoed.
    assert.match(body, /env -u GITHUB_STEP_SUMMARY/)
    assert.match(body, /node "\$\{cl_root\}\/cl_mjs" >"\$\{cl_root\}\/cl_out"/)
    assert.match(body, /2>&1/)
    assert.match(body, /rm -rf "\$\{cl_root\}"/)
    assert.doesNotMatch(body, /cat .*cl_out|echo .*cl_out/)
    assert.doesNotMatch(body, /set -x/)
  })

  it('moves nothing through Actions artifacts or a public release', () => {
    assert.doesNotMatch(
      body,
      /upload-artifact|download-artifact|actions\/cache/
    )
    // The compressor publishes with `gh` against GITHUB_REPOSITORY, which is
    // set to the private target and nothing else.
    assert.match(body, /GITHUB_REPOSITORY="\$\{RELEASE_TARGET\}"/)
  })

  it('refuses to run on any trigger that could carry attacker code', () => {
    assert.match(body, /workflow_dispatch \| repository_dispatch\) ;;/)
    assert.match(body, /GITHUB_EVENT_NAME/)
    assert.match(body, /exit 78/)
  })

  it('runs the same reviewed, SHA-pinned compressor as the public route', async () => {
    assert.ok(
      CHEAP_LFS_ENCRYPTED_BUILDER_COMPRESSOR_URL.includes(
        CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA
      )
    )
    assert.ok(
      CHEAP_LFS_ENCRYPTED_BUILDER_COMPRESSOR_URL.endsWith(
        '/.github/actions/cheap-lfs-cloud-compression/cloud-compress.mjs'
      )
    )
    // …and that compressor is the one that verifies the round-trip, so the
    // private route keeps the same guarantee the public route has.
    const compressor = await readFile(
      join(
        process.cwd(),
        '.github',
        'actions',
        'cheap-lfs-cloud-compression',
        'cloud-compress.mjs'
      ),
      'utf8'
    )
    assert.match(compressor, /createHash\('sha256'\)/)
    assert.match(compressor, /assetMatches\(/)
  })
})

describe('Cheap LFS encrypted builder registration', () => {
  it('commits one opaque file that says nothing about what it builds', async () => {
    const registration = await buildCheapLfsEncryptedBuilderRegistration(
      identity
    )
    assert.equal(
      registration.loaderPath,
      `.github/workflows/${registration.projectId}.yml`
    )
    const stub = registration.loaderStub
    assert.match(stub, new RegExp(`^name: ${registration.builderName}\\n`))
    assert.match(stub, new RegExp(`types: \\[${registration.projectId}\\]`))
    assert.match(stub, /permissions: \{\}/)
    // Nothing in the committed file names the job, the product, or the target.
    assert.doesNotMatch(stub, /cheap|lfs|compress|desktop|material/i)
    assert.doesNotMatch(stub, /\bon:\n  push:/)
    // The stub references secrets by name and never carries a value.
    assert.match(
      stub,
      new RegExp(
        `secrets\\.${cheapLfsBuilderReleaseTargetSecretName(
          registration.secretSuffix
        )}`
      )
    )
    assert.deepEqual(
      registration.secrets.map(secret => secret.name),
      [
        `RELEASE_TARGET_${registration.secretSuffix}`,
        `RELEASE_TOKEN_${registration.secretSuffix}`,
        `RUNTIME_SOURCE_${registration.secretSuffix}`,
      ]
    )
    for (const secret of registration.secrets) {
      assert.equal(secret.location, 'public-builder')
      assert.ok(secret.contains.length > 0)
      // The description names the secret; it never contains one.
      assert.doesNotMatch(secret.contains, /gh[pousr]_|[A-Za-z0-9]{40}/)
    }
  })

  it('carries the project behind gzip+base64 that round-trips exactly', async () => {
    const registration = await buildCheapLfsEncryptedBuilderRegistration(
      identity
    )
    assert.match(registration.payload, /^[A-Za-z0-9+/]+=*$/)
    assert.ok(registration.loaderStub.includes(registration.payload))
    assert.equal(
      await decodeCheapLfsEncryptedBuilderPayload(registration.payload),
      renderCheapLfsEncryptedBuilderProjectBody()
    )
  })
})

describe('Cheap LFS private-identifier leak guard', () => {
  it('proves no private identifier reaches any public-bound value', async () => {
    const registration = await buildCheapLfsEncryptedBuilderRegistration(
      identity
    )
    const decoded = await decodeCheapLfsEncryptedBuilderPayload(
      registration.payload
    )
    const publicBound = [
      registration.builderName,
      registration.projectId,
      registration.secretSuffix,
      registration.loaderPath,
      registration.loaderStub.replace(registration.payload, ''),
      decoded,
      ...registration.secrets.map(secret => secret.name),
      ...registration.secrets.map(secret => secret.contains),
    ]
    const tokens = cheapLfsPrivateIdentifierTokens(identity)
    assert.ok(tokens.includes('Sunbeam-Holdings/orbital-teardown'))
    assert.ok(tokens.includes('Sunbeam-Holdings'))
    assert.ok(tokens.includes('orbital-teardown'))
    assert.ok(tokens.includes('marquetry'))
    assert.ok(tokens.includes('quarterly-teardown.psd'))
    assert.ok(tokens.includes('quarterly-teardown'))
    assert.ok(tokens.includes(identity.assetNames[0]))

    for (const value of publicBound) {
      for (const token of tokens) {
        assert.doesNotMatch(
          value,
          new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          `a public value carries the private identifier ${token}`
        )
      }
    }
  })

  it('sees through the base64 envelope that would hide a leak', async () => {
    // A planted target inside the project body is invisible to a scan of the
    // committed blob and obvious once the envelope is opened. The guard is
    // only meaningful because it scans the decoded plaintext.
    const leaking = `${renderCheapLfsEncryptedBuilderProjectBody()}
# ${identity.releaseTarget}
`
    const payload = await encodeCheapLfsEncryptedBuilderPayload(leaking)
    assert.doesNotThrow(() =>
      assertCheapLfsPublicSurfaceIsClean(
        [{ label: 'the committed payload', value: payload }],
        identity
      )
    )
    assert.throws(
      () =>
        assertCheapLfsPublicSurfaceIsClean(
          [
            {
              label: 'the decoded project body',
              value: leaking,
            },
          ],
          identity
        ),
      CheapLfsPrivateIdentifierLeakError
    )
  })

  it('refuses without ever repeating the identifier it refused', () => {
    let raised: unknown = null
    try {
      assertCheapLfsPublicSurfaceIsClean(
        [{ label: 'a test surface', value: `see ${identity.releaseTarget}` }],
        identity
      )
    } catch (error) {
      raised = error
    }
    assert.ok(raised instanceof CheapLfsPrivateIdentifierLeakError)
    assert.equal(raised.surface, 'a test surface')
    assert.equal(raised.identifierLength, identity.releaseTarget.length)
    // A leak report that repeats the leaked value is another leak.
    assert.doesNotMatch(raised.message, /Sunbeam|orbital|teardown/i)
  })

  it('scans a short identifier as a word and a long one anywhere', () => {
    const short: ICheapLfsPrivateIdentity = {
      owner: 'ab',
      name: 'cd',
      releaseTarget: 'ab/cd',
      assetNames: [],
      paths: [],
    }
    // `ab` inside `grab` is a coincidence, not a leak; blocking on it would
    // block every publication forever.
    assert.doesNotThrow(() =>
      assertCheapLfsPublicSurfaceIsClean(
        [{ label: 'a test surface', value: 'grab the cddisk' }],
        short
      )
    )
    assert.throws(
      () =>
        assertCheapLfsPublicSurfaceIsClean(
          [{ label: 'a test surface', value: 'push to ab/cd now' }],
          short
        ),
      CheapLfsPrivateIdentifierLeakError
    )
  })

  it('fails closed when a repository name collides with the public template', async () => {
    // `ubuntu` is in every runner label the stub emits. There is no safe way to
    // publish for this repository, so nothing is prepared and nothing is
    // published — the preparation reports the refusal instead.
    const colliding: ICheapLfsPrivateIdentity = {
      owner: 'someone',
      name: 'ubuntu',
      releaseTarget: 'someone/ubuntu',
      assetNames: [],
      paths: [],
    }
    await assert.rejects(
      buildCheapLfsEncryptedBuilderRegistration(colliding),
      CheapLfsPrivateIdentifierLeakError
    )
    assert.deepEqual(await prepareCheapLfsEncryptedBuilder(colliding), {
      kind: 'blocked',
      blocker: 'leak-refused',
    })
  })

  it('reports the boundary rather than pretending the builder exists', async () => {
    assert.deepEqual(await prepareCheapLfsEncryptedBuilder(null), {
      kind: 'blocked',
      blocker: 'no-identity',
    })
    const prepared = await prepareCheapLfsEncryptedBuilder(identity)
    assert.equal(prepared.kind, 'registration-required')
    // The registration is ready; creating the public repository and writing
    // its secrets happens outside this app, and until it does nothing runs.
    assert.equal(prepared.blocker, 'builder-unavailable')
  })
})
