import {
  ActionsArtifactAttestationMaximumBundles,
  ActionsArtifactProvenanceMaximumProjectedBytes,
  ActionsArtifactProvenanceMaximumTimestamps,
  ActionsArtifactProvenancePredicate,
  IActionsArtifactVerificationEvidence,
  IActionsArtifactVerificationPolicy,
  IActionsArtifactVerificationTimestamp,
  IActionsArtifactVerifiedAttestation,
  getActionsArtifactProvenanceOIDCIssuer,
  normalizeActionsArtifactSHA256,
  normalizeActionsArtifactVerificationPolicy,
} from '../lib/actions-artifact-provenance'
import {
  ActionsArtifactSubjectMaximumEntries,
  ActionsArtifactSubjectMaximumPathBytes,
} from '../lib/actions-artifact-subjects'

/**
 * Fixed gh projection: raw bundles, predicate bodies, certificate material,
 * and provider wrappers are omitted before stdout reaches this parser.
 */
export const ActionsArtifactProvenanceJQProjection = [
  '[.[] | {',
  'subject:[.verificationResult.statement.subject[]',
  '|select(.digest.sha256 != null)',
  '|{name:.name,digest:{sha256:.digest.sha256}}],',
  'predicateType:.verificationResult.statement.predicateType,',
  'certificate:(.verificationResult.signature.certificate|{',
  'certificateIssuer:.certificateIssuer,',
  'subjectAlternativeName:.subjectAlternativeName,',
  'buildSignerURI:.buildSignerURI,',
  'buildSignerDigest:.buildSignerDigest,',
  'issuer:.issuer,',
  'runnerEnvironment:.runnerEnvironment,',
  'sourceRepositoryURI:.sourceRepositoryURI,',
  'sourceRepositoryDigest:.sourceRepositoryDigest,',
  'sourceRepositoryRef:.sourceRepositoryRef,',
  'sourceRepositoryVisibilityAtSigning:.sourceRepositoryVisibilityAtSigning,',
  'runInvocationURI:.runInvocationURI}),',
  'timestamps:[.verificationResult.verifiedTimestamps[]',
  '|{type:.type,timestamp:.timestamp,uri:.uri}]',
  '}]',
].join('')

const controlOrBidiPattern =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/
const sha256HexPattern = /^[a-f0-9]{64}$/
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const timestampTypePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

function invalidResult(): Error {
  return new Error('The provenance verifier returned an invalid result.')
}

function projectedRecord(
  value: unknown,
  keys: ReadonlyArray<string>
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalidResult()
  }
  const result = value as Record<string, unknown>
  const actual = Object.keys(result).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index])
  ) {
    throw invalidResult()
  }
  return result
}

function boundedString(
  value: unknown,
  maximumBytes: number,
  pattern?: RegExp
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    controlOrBidiPattern.test(value) ||
    new TextEncoder().encode(value).byteLength > maximumBytes ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    throw invalidResult()
  }
  return value
}

function decodeProjectedOutput(value: string | Uint8Array): string {
  let bytes: Uint8Array
  if (typeof value === 'string') {
    bytes = new TextEncoder().encode(value)
    if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== value) {
      throw invalidResult()
    }
  } else if (value instanceof Uint8Array) {
    bytes = value
  } else {
    throw invalidResult()
  }
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > ActionsArtifactProvenanceMaximumProjectedBytes
  ) {
    throw invalidResult()
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalidResult()
  }
}

function expectedIssuer(policy: IActionsArtifactVerificationPolicy): string {
  return getActionsArtifactProvenanceOIDCIssuer(
    new URL(policy.sourceRepositoryURI).origin
  )
}

function normalizeTimestamp(
  value: unknown
): IActionsArtifactVerificationTimestamp {
  const timestamp = projectedRecord(value, ['timestamp', 'type', 'uri'])
  const type = boundedString(timestamp.type, 64, timestampTypePattern)
  const time = boundedString(timestamp.timestamp, 64, timestampPattern)
  if (!Number.isFinite(Date.parse(time))) {
    throw invalidResult()
  }
  let uri: string | null = null
  if (timestamp.uri !== null) {
    const rawURI = boundedString(timestamp.uri, 2048)
    let parsed: URL
    try {
      parsed = new URL(rawURI)
    } catch {
      throw invalidResult()
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw invalidResult()
    }
    uri = rawURI
  }
  return { type, timestamp: time, uri }
}

function normalizeInvocationURI(
  value: unknown,
  policy: IActionsArtifactVerificationPolicy
): string {
  const raw = boundedString(value, 2048)
  const expected = `${policy.sourceRepositoryURI}/actions/runs/${policy.runId}/attempts/${policy.runAttempt}`
  if (raw !== expected) {
    throw invalidResult()
  }
  return expected
}

function normalizeSubjects(
  value: unknown,
  subjectHexDigest: string
): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > ActionsArtifactSubjectMaximumEntries
  ) {
    throw invalidResult()
  }
  const matches = new Array<string>()
  const seenMatches = new Set<string>()
  for (const raw of value) {
    const subject = projectedRecord(raw, ['digest', 'name'])
    const name = boundedString(
      subject.name,
      ActionsArtifactSubjectMaximumPathBytes
    )
    const digest = projectedRecord(subject.digest, ['sha256'])
    const sha256 = boundedString(digest.sha256, 64, sha256HexPattern)
    if (sha256 === subjectHexDigest) {
      if (seenMatches.has(name)) {
        throw invalidResult()
      }
      seenMatches.add(name)
      matches.push(name)
    }
  }
  if (matches.length === 0) {
    throw invalidResult()
  }
  return matches
}

function normalizeAttestation(
  value: unknown,
  subjectHexDigest: string,
  policy: IActionsArtifactVerificationPolicy,
  oidcIssuer: string
): IActionsArtifactVerifiedAttestation {
  const result = projectedRecord(value, [
    'certificate',
    'predicateType',
    'subject',
    'timestamps',
  ])
  if (result.predicateType !== ActionsArtifactProvenancePredicate) {
    throw invalidResult()
  }
  const certificate = projectedRecord(result.certificate, [
    'buildSignerDigest',
    'buildSignerURI',
    'certificateIssuer',
    'issuer',
    'runInvocationURI',
    'runnerEnvironment',
    'sourceRepositoryDigest',
    'sourceRepositoryRef',
    'sourceRepositoryURI',
    'sourceRepositoryVisibilityAtSigning',
    'subjectAlternativeName',
  ])
  const certificateIssuer = boundedString(certificate.certificateIssuer, 2048)
  if (
    certificate.subjectAlternativeName !== policy.signerIdentity ||
    certificate.buildSignerURI !== policy.signerIdentity ||
    certificate.buildSignerDigest !== policy.signerDigest ||
    certificate.issuer !== oidcIssuer ||
    certificate.runnerEnvironment !== 'github-hosted' ||
    certificate.sourceRepositoryURI !== policy.sourceRepositoryURI ||
    certificate.sourceRepositoryDigest !== policy.sourceDigest ||
    certificate.sourceRepositoryRef !== policy.sourceRef ||
    certificate.sourceRepositoryVisibilityAtSigning !==
      policy.repositoryVisibility
  ) {
    throw invalidResult()
  }
  if (
    !Array.isArray(result.timestamps) ||
    result.timestamps.length === 0 ||
    result.timestamps.length > ActionsArtifactProvenanceMaximumTimestamps
  ) {
    throw invalidResult()
  }
  const timestamps = result.timestamps.map(normalizeTimestamp)
  const uniqueTimestamps = new Set(
    timestamps.map(x => `${x.type}\n${x.timestamp}\n${x.uri ?? ''}`)
  )
  if (uniqueTimestamps.size !== timestamps.length) {
    throw invalidResult()
  }
  return {
    subjectNames: normalizeSubjects(result.subject, subjectHexDigest),
    certificateIssuer,
    runInvocationURI: normalizeInvocationURI(
      certificate.runInvocationURI,
      policy
    ),
    timestamps,
  }
}

/** Parse only the fixed, bounded gh projection into renderer-safe evidence. */
export function parseActionsArtifactProvenanceProjectedResult(
  output: string | Uint8Array,
  rawSubjectDigest: unknown,
  rawPolicy: unknown
): IActionsArtifactVerificationEvidence {
  const subjectDigest = normalizeActionsArtifactSHA256(rawSubjectDigest)
  const policy = normalizeActionsArtifactVerificationPolicy(rawPolicy)
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeProjectedOutput(output)) as unknown
  } catch (error) {
    if (error instanceof Error && error.message === invalidResult().message) {
      throw error
    }
    throw invalidResult()
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > ActionsArtifactAttestationMaximumBundles
  ) {
    throw invalidResult()
  }
  const oidcIssuer = expectedIssuer(policy)
  const subjectHexDigest = subjectDigest.slice('sha256:'.length)
  const attestations = parsed.map(value =>
    normalizeAttestation(value, subjectHexDigest, policy, oidcIssuer)
  )
  return {
    subjectDigest,
    predicateType: ActionsArtifactProvenancePredicate,
    signerIdentity: policy.signerIdentity,
    signerDigest: policy.signerDigest,
    oidcIssuer,
    runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: policy.sourceRepositoryURI,
    sourceRepositoryDigest: policy.sourceDigest,
    sourceRepositoryRef: policy.sourceRef,
    sourceRepositoryVisibilityAtSigning: policy.repositoryVisibility,
    attestations,
  }
}
