import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  ActionsArtifactAttestationMaximumBundles,
  ActionsArtifactProvenanceMaximumProjectedBytes,
  IActionsArtifactVerificationPolicy,
} from '../../../src/lib/actions-artifact-provenance'
import {
  ActionsArtifactProvenanceJQProjection,
  parseActionsArtifactProvenanceProjectedResult,
} from '../../../src/main-process/actions-artifact-provenance-result'

const sha = '7d3af28c422bf02197a99f195b689b34377e11a2'
const subjectHex =
  '5c8cbe5000262fc77cbb58a56f5cb030c46075f3e89d9a9189c525d2968748e4'
const subjectDigest = `sha256:${subjectHex}`
const signerIdentity =
  'https://github.com/actions/attest/.github/workflows/prober.yml@refs/heads/main'

const policy: IActionsArtifactVerificationPolicy = {
  sourceRepositoryURI: 'https://github.com/actions/attest',
  sourceDigest: sha,
  sourceRef: 'refs/heads/main',
  signerIdentity,
  signerDigest: sha,
  repositoryVisibility: 'public',
}

const projected = () => ({
  subject: [{ name: 'artifact', digest: { sha256: subjectHex } }],
  predicateType: 'https://slsa.dev/provenance/v1',
  certificate: {
    certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev',
    subjectAlternativeName: signerIdentity,
    buildSignerURI: signerIdentity,
    buildSignerDigest: sha,
    issuer: 'https://token.actions.githubusercontent.com',
    runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: 'https://github.com/actions/attest',
    sourceRepositoryDigest: sha,
    sourceRepositoryRef: 'refs/heads/main',
    sourceRepositoryVisibilityAtSigning: 'public',
    runInvocationURI:
      'https://github.com/actions/attest/actions/runs/29283111640/attempts/1',
  },
  timestamps: [
    {
      type: 'Tlog',
      timestamp: '2026-07-13T16:37:25-04:00',
      uri: 'https://rekor.sigstore.dev',
    },
  ],
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parse(
  value: unknown,
  selectedPolicy: IActionsArtifactVerificationPolicy = policy
) {
  return parseActionsArtifactProvenanceProjectedResult(
    JSON.stringify(value),
    subjectDigest,
    selectedPolicy
  )
}

describe('Actions artifact provenance projected result', () => {
  it('uses a fixed projection that omits raw bundles and predicate bodies', () => {
    for (const required of [
      'subjectAlternativeName',
      'buildSignerDigest',
      'sourceRepositoryVisibilityAtSigning',
      'verifiedTimestamps',
    ]) {
      assert.equal(
        ActionsArtifactProvenanceJQProjection.includes(required),
        true
      )
    }
    for (const forbidden of [
      'dsseEnvelope',
      'verificationMaterial',
      '.attestation',
      'statement.predicate,',
    ]) {
      assert.equal(
        ActionsArtifactProvenanceJQProjection.includes(forbidden),
        false
      )
    }
  })

  it('normalizes the exact live run projection into one evidence record', () => {
    const evidence = parse([projected()])
    assert.deepEqual(evidence, {
      subjectDigest,
      predicateType: 'https://slsa.dev/provenance/v1',
      signerIdentity,
      signerDigest: sha,
      oidcIssuer: 'https://token.actions.githubusercontent.com',
      runnerEnvironment: 'github-hosted',
      sourceRepositoryURI: 'https://github.com/actions/attest',
      sourceRepositoryDigest: sha,
      sourceRepositoryRef: 'refs/heads/main',
      sourceRepositoryVisibilityAtSigning: 'public',
      attestations: [
        {
          subjectNames: ['artifact'],
          certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev',
          runInvocationURI:
            'https://github.com/actions/attest/actions/runs/29283111640/attempts/1',
          timestamps: [
            {
              type: 'Tlog',
              timestamp: '2026-07-13T16:37:25-04:00',
              uri: 'https://rekor.sigstore.dev',
            },
          ],
        },
      ],
    })
  })

  it('keeps every verified attestation distinct', () => {
    const second = projected()
    second.subject[0].name = 'artifact-copy'
    second.certificate.certificateIssuer = 'CN=GitHub Attestations'
    second.certificate.runInvocationURI =
      'https://github.com/actions/attest/actions/runs/29283111640/attempts/2'
    second.timestamps[0].timestamp = '2026-07-13T21:00:00Z'
    const evidence = parse([projected(), second])

    assert.equal(evidence.attestations.length, 2)
    assert.deepEqual(evidence.attestations[0].subjectNames, ['artifact'])
    assert.deepEqual(evidence.attestations[1].subjectNames, ['artifact-copy'])
    assert.notEqual(
      evidence.attestations[0].runInvocationURI,
      evidence.attestations[1].runInvocationURI
    )
  })

  it('derives and requires the tenant GHE.com issuer and internal visibility', () => {
    const tenantPolicy: IActionsArtifactVerificationPolicy = {
      ...policy,
      sourceRepositoryURI: 'https://octocorp.ghe.com/actions/attest',
      signerIdentity:
        'https://octocorp.ghe.com/actions/attest/.github/workflows/prober.yml@refs/heads/main',
      repositoryVisibility: 'internal',
    }
    const result = projected()
    result.certificate.subjectAlternativeName = tenantPolicy.signerIdentity
    result.certificate.buildSignerURI = tenantPolicy.signerIdentity
    result.certificate.issuer = 'https://token.actions.octocorp.ghe.com'
    result.certificate.sourceRepositoryURI = tenantPolicy.sourceRepositoryURI
    result.certificate.sourceRepositoryVisibilityAtSigning = 'internal'
    result.certificate.runInvocationURI =
      'https://octocorp.ghe.com/actions/attest/actions/runs/29283111640/attempts/1'

    const evidence = parse([result], tenantPolicy)
    assert.equal(evidence.oidcIssuer, 'https://token.actions.octocorp.ghe.com')
    assert.equal(evidence.sourceRepositoryVisibilityAtSigning, 'internal')
  })

  it('accepts one through thirty records and rejects zero or thirty-one', () => {
    assert.equal(parse([projected()]).attestations.length, 1)
    assert.equal(
      parse(
        Array.from(
          { length: ActionsArtifactAttestationMaximumBundles },
          projected
        )
      ).attestations.length,
      ActionsArtifactAttestationMaximumBundles
    )
    assert.throws(() => parse([]))
    assert.throws(() =>
      parse(
        Array.from(
          { length: ActionsArtifactAttestationMaximumBundles + 1 },
          projected
        )
      )
    )
  })

  it('rejects output over one MiB and malformed Unicode or JSON', () => {
    assert.throws(() =>
      parseActionsArtifactProvenanceProjectedResult(
        ' '.repeat(ActionsArtifactProvenanceMaximumProjectedBytes + 1),
        subjectDigest,
        policy
      )
    )
    assert.throws(() =>
      parseActionsArtifactProvenanceProjectedResult(
        new Uint8Array([0xff]),
        subjectDigest,
        policy
      )
    )
    assert.throws(() =>
      parseActionsArtifactProvenanceProjectedResult(
        '\ud800',
        subjectDigest,
        policy
      )
    )
    assert.throws(() =>
      parseActionsArtifactProvenanceProjectedResult('{', subjectDigest, policy)
    )
  })

  it('rejects extra keys at every projected level', () => {
    const mutations: ReadonlyArray<
      (value: ReturnType<typeof projected>) => void
    > = [
      value => Object.assign(value, { extra: true }),
      value => Object.assign(value.certificate, { extra: true }),
      value => Object.assign(value.subject[0], { extra: true }),
      value => Object.assign(value.subject[0].digest, { extra: true }),
      value => Object.assign(value.timestamps[0], { extra: true }),
    ]
    for (const mutate of mutations) {
      const value = projected()
      mutate(value)
      assert.throws(() => parse([value]))
    }
  })

  it('rejects every certificate or source policy mismatch', () => {
    const mutations: ReadonlyArray<
      (value: ReturnType<typeof projected>) => void
    > = [
      value => (value.predicateType = 'https://example.com/predicate'),
      value => (value.certificate.subjectAlternativeName += '/wrong'),
      value => (value.certificate.buildSignerURI += '/wrong'),
      value => (value.certificate.buildSignerDigest = 'b'.repeat(40)),
      value => (value.certificate.issuer = 'https://issuer.example.com'),
      value => (value.certificate.runnerEnvironment = 'self-hosted'),
      value => (value.certificate.sourceRepositoryURI += '-wrong'),
      value => (value.certificate.sourceRepositoryDigest = 'b'.repeat(40)),
      value => (value.certificate.sourceRepositoryRef = 'refs/heads/wrong'),
      value =>
        (value.certificate.sourceRepositoryVisibilityAtSigning = 'private'),
    ]
    for (const mutate of mutations) {
      const value = projected()
      mutate(value)
      assert.throws(() => parse([value]))
    }
  })

  it('rejects missing subjects, duplicate evidence, bad timestamps, and bad invocation', () => {
    const noMatch = projected()
    noMatch.subject[0].digest.sha256 = 'b'.repeat(64)
    assert.throws(() => parse([noMatch]))

    const duplicateName = projected()
    duplicateName.subject.push(clone(duplicateName.subject[0]))
    assert.throws(() => parse([duplicateName]))

    const duplicateTimestamp = projected()
    duplicateTimestamp.timestamps.push(clone(duplicateTimestamp.timestamps[0]))
    assert.throws(() => parse([duplicateTimestamp]))

    const noTimestamps = projected()
    noTimestamps.timestamps = []
    assert.throws(() => parse([noTimestamps]))

    const tooManyTimestamps = projected()
    tooManyTimestamps.timestamps = Array.from({ length: 9 }, (_, index) => ({
      ...clone(tooManyTimestamps.timestamps[0]),
      timestamp: `2026-07-13T16:37:${String(index).padStart(2, '0')}Z`,
    }))
    assert.throws(() => parse([tooManyTimestamps]))

    for (const uri of [
      'http://rekor.sigstore.dev',
      'https://user@rekor.sigstore.dev',
      'https://rekor.sigstore.dev/path?secret=value',
    ]) {
      const invalidTimestamp = projected()
      invalidTimestamp.timestamps[0].uri = uri
      assert.throws(() => parse([invalidTimestamp]))
    }

    const badInvocation = projected()
    badInvocation.certificate.runInvocationURI =
      'https://github.com/actions/attest/settings'
    assert.throws(() => parse([badInvocation]))
  })

  it('rejects an unknown visibility even when output and policy agree', () => {
    const unknownPolicy = {
      ...policy,
      repositoryVisibility: 'unknown',
    }
    const value = projected()
    value.certificate.sourceRepositoryVisibilityAtSigning = 'unknown'
    assert.throws(() =>
      parseActionsArtifactProvenanceProjectedResult(
        JSON.stringify([value]),
        subjectDigest,
        unknownPolicy
      )
    )
  })
})
