import { createHash } from 'crypto'
import { promisify } from 'util'
import { gunzip, gzip } from 'zlib'
import { Repository } from '../../models/repository'
import { CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA } from './cloud-compression'

const compress = promisify(gzip)
const decompress = promisify(gunzip)

/**
 * Public, immutable location of the reviewed compressor this app already ships
 * for public repositories, pinned by commit SHA so the external runner executes
 * exactly the reviewed bytes.
 *
 * It is never committed to the public builder. The builder reads it from a
 * secret, so the committed stub does not even say what kind of job it runs.
 */
export const CHEAP_LFS_ENCRYPTED_BUILDER_COMPRESSOR_URL =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/' +
  `${CHEAP_LFS_CLOUD_COMPRESSION_ACTION_SHA}/.github/actions/` +
  'cheap-lfs-cloud-compression/cloud-compress.mjs'

/** Opaque-token alphabet without characters that read alike in a log. */
const OpaqueLowerAlphabet = 'abcdefghijkmnpqrstuvwxyz23456789'

/** GitHub Actions secret names accept `A-Z`, `0-9`, and `_` only. */
const OpaqueUpperAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Consonant and vowel pools that make a builder name pronounceable noise. */
const GibberishConsonants = 'bcdfghjklmnprstv'
const GibberishVowels = 'aeio'

/** Characters of the opaque per-project id committed to the public builder. */
const ProjectIdLength = 16

/** Characters of the opaque suffix every builder secret name carries. */
const SecretSuffixLength = 12

/**
 * Below this length a private identifier is too short to be scanned as a bare
 * substring without matching innocent words, so the guard anchors it to word
 * boundaries instead. At or above it, any occurrence anywhere is a leak.
 */
const SubstringScanMinimumLength = 4

/**
 * Stand-in for the base64 payload while the loader stub is scanned. The blob
 * is pseudo-random text whose only matches would be coincidences, and the
 * plaintext it encodes is scanned separately.
 */
const PayloadScanPlaceholder = '0'

/** Domain separators, so one identity never derives two equal tokens. */
const ProjectIdDomain = 'desktop-material/cheap-lfs/builder/project-id'
const SecretSuffixDomain = 'desktop-material/cheap-lfs/builder/secret-suffix'
const BuilderNameDomain = 'desktop-material/cheap-lfs/builder/builder-name'

/**
 * Everything about a private repository that must never reach a public place.
 *
 * Cheap LFS asset names are derived from the user's own file paths, so the
 * paths and the asset names are as sensitive as the repository name itself.
 */
export interface ICheapLfsPrivateIdentity {
  /** GitHub login that owns the private repository. */
  readonly owner: string
  /** Private repository name. */
  readonly name: string
  /** `owner/name`, the value that lives only in a secret. */
  readonly releaseTarget: string
  /** Release asset names, which encode user file paths. */
  readonly assetNames: ReadonlyArray<string>
  /** Repository-relative paths of the tracked large files. */
  readonly paths: ReadonlyArray<string>
}

/** Raised when a value bound for a public surface carries a private token. */
export class CheapLfsPrivateIdentifierLeakError extends Error {
  public constructor(
    public readonly surface: string,
    public readonly identifierLength: number
  ) {
    // The message deliberately withholds the identifier itself: this error is
    // logged, and a leak report that repeats the leaked value is another leak.
    super(
      `Cheap LFS refused to publish ${surface}: it carries a ${identifierLength}-character private repository identifier.`
    )
    this.name = 'CheapLfsPrivateIdentifierLeakError'
  }
}

/** Read the private identity of a repository, or `null` when it has none. */
export function cheapLfsPrivateIdentityFromRepository(
  repository: Repository,
  assetNames: ReadonlyArray<string> = [],
  paths: ReadonlyArray<string> = []
): ICheapLfsPrivateIdentity | null {
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository === null || gitHubRepository.isPrivate !== true) {
    return null
  }
  return {
    owner: gitHubRepository.owner.login,
    name: gitHubRepository.name,
    releaseTarget: gitHubRepository.fullName,
    assetNames,
    paths,
  }
}

function encodeOpaque(
  digest: Buffer,
  alphabet: string,
  length: number
): string {
  let token = ''
  for (let index = 0; index < length; index++) {
    // 256 is a multiple of 32, so a byte modulo a 32-character alphabet is
    // uniform; no character is more likely than another.
    token += alphabet[digest[index] % alphabet.length]
  }
  return token
}

function deriveDigest(
  domain: string,
  identity: ICheapLfsPrivateIdentity
): Buffer {
  return createHash('sha256')
    .update(domain, 'utf8')
    .update(' ', 'utf8')
    .update(identity.releaseTarget.toLowerCase(), 'utf8')
    .digest()
}

/**
 * The opaque per-project id the public builder commits. It is a hash digest
 * rendered in a fixed alphabet — no part of the repository name survives it,
 * and it cannot be read back into one.
 */
export function deriveCheapLfsBuilderProjectId(
  identity: ICheapLfsPrivateIdentity
): string {
  return encodeOpaque(
    deriveDigest(ProjectIdDomain, identity),
    OpaqueLowerAlphabet,
    ProjectIdLength
  )
}

/** The opaque suffix shared by every Actions secret this project needs. */
export function deriveCheapLfsBuilderSecretSuffix(
  identity: ICheapLfsPrivateIdentity
): string {
  return encodeOpaque(
    deriveDigest(SecretSuffixDomain, identity),
    OpaqueUpperAlphabet,
    SecretSuffixLength
  )
}

/**
 * A pronounceable but meaningless public builder repository name. Three
 * five-character syllable groups, drawn from the same digest, so it is stable
 * for one project and says nothing about it.
 */
export function deriveCheapLfsPublicBuilderName(
  identity: ICheapLfsPrivateIdentity
): string {
  const digest = deriveDigest(BuilderNameDomain, identity)
  const groups: Array<string> = []
  let cursor = 0
  for (let group = 0; group < 3; group++) {
    let syllables = ''
    for (let character = 0; character < 5; character++) {
      const pool = character % 2 === 0 ? GibberishConsonants : GibberishVowels
      syllables += pool[digest[cursor++] % pool.length]
    }
    groups.push(syllables)
  }
  return groups.join('-')
}

/** Name of the secret that holds `owner/name`, the only place it may live. */
export function cheapLfsBuilderReleaseTargetSecretName(suffix: string): string {
  return `RELEASE_TARGET_${suffix}`
}

/** Name of the secret holding the token that reads and writes the releases. */
export function cheapLfsBuilderReleaseTokenSecretName(suffix: string): string {
  return `RELEASE_TOKEN_${suffix}`
}

/**
 * Name of the secret holding the pinned location the runner fetches its job
 * from. Deliberately neutral: a committed name like `COMPRESSOR_SOURCE` would
 * tell any reader of the public builder exactly what the job does.
 */
export function cheapLfsBuilderRuntimeSourceSecretName(suffix: string): string {
  return `RUNTIME_SOURCE_${suffix}`
}

/**
 * The compression job that runs on the free public runner.
 *
 * It names nothing. The target, the token, and even the compressor's location
 * arrive from secrets; the target is masked in the runner log before it is
 * used; and every byte the compressor prints — which includes user file paths
 * and asset names — is redirected into a runner-local transcript that is
 * deleted and never uploaded, summarized, or echoed. `GITHUB_STEP_SUMMARY` is
 * unset for the same reason: the compressor writes paths and asset names into
 * it, and a public run's summary is public. Results go back through `gh` to the
 * private repository only; no Actions artifact ever carries them.
 *
 * The body is kept free of English prose so that the leak guard, which refuses
 * any private identifier of four characters or more anywhere in it, has as few
 * innocent words to collide with as possible.
 */
export function renderCheapLfsEncryptedBuilderProjectBody(): string {
  return `#!/usr/bin/env bash
set -eu
set +x

case "\${GITHUB_EVENT_NAME:-}" in
workflow_dispatch | repository_dispatch) ;;
*)
  exit 78
  ;;
esac

if [ -z "\${RELEASE_TARGET:-}" ] ||
  [ -z "\${RELEASE_TOKEN:-}" ] ||
  [ -z "\${RUNTIME_SOURCE:-}" ]; then
  exit 78
fi

echo "::add-mask::\${RELEASE_TARGET}"
echo "::add-mask::\${RELEASE_TARGET%%/*}"
echo "::add-mask::\${RELEASE_TARGET##*/}"
echo "::add-mask::\${RELEASE_TOKEN}"

cl_root="\${RUNNER_TEMP:-/tmp}/cl_root"
mkdir -p "\${cl_root}"
cd "\${cl_root}"

curl --fail --silent --show-error --location \\
  --output "\${cl_root}/cl_mjs" "\${RUNTIME_SOURCE}" >/dev/null 2>&1

git -c credential.helper= clone --depth 1 --quiet \\
  "https://x-access-token:\${RELEASE_TOKEN}@github.com/\${RELEASE_TARGET}.git" \\
  "\${cl_root}/cl_tree" >/dev/null 2>&1

cl_ref="\$(git -C "\${cl_root}/cl_tree" rev-parse --abbrev-ref HEAD)"
cl_sha="\$(git -C "\${cl_root}/cl_tree" rev-parse HEAD)"

cl_status=0
env -u GITHUB_STEP_SUMMARY \\
  GITHUB_WORKSPACE="\${cl_root}/cl_tree" \\
  GITHUB_REPOSITORY="\${RELEASE_TARGET}" \\
  GITHUB_REF_NAME="\${cl_ref}" \\
  GITHUB_SHA="\${cl_sha}" \\
  GH_TOKEN="\${RELEASE_TOKEN}" \\
  CHEAP_LFS_GITHUB_TOKEN="\${RELEASE_TOKEN}" \\
  node "\${cl_root}/cl_mjs" >"\${cl_root}/cl_out" 2>&1 || cl_status=\$?

rm -rf "\${cl_root}" || true
exit "\${cl_status}"
`
}

/** gzip, then base64: the exact envelope the public loader stub decodes. */
export async function encodeCheapLfsEncryptedBuilderPayload(
  body: string
): Promise<string> {
  const gzipped = await compress(Buffer.from(body, 'utf8'))
  return Buffer.from(gzipped).toString('base64')
}

/** Reverse the envelope, so a committed payload can be scanned and reviewed. */
export async function decodeCheapLfsEncryptedBuilderPayload(
  payload: string
): Promise<string> {
  const gunzipped = await decompress(Buffer.from(payload, 'base64'))
  return Buffer.from(gunzipped).toString('utf8')
}

/**
 * The one file committed to the public builder repository.
 *
 * Everything in it is opaque: a gibberish workflow name, a hash-derived job id,
 * hash-derived secret names, and one base64 blob. Nothing in it states what is
 * built, for whom, or where the result goes.
 */
export function renderCheapLfsEncryptedBuilderLoaderStub(
  builderName: string,
  projectId: string,
  secretSuffix: string,
  payload: string
): string {
  const target = cheapLfsBuilderReleaseTargetSecretName(secretSuffix)
  const token = cheapLfsBuilderReleaseTokenSecretName(secretSuffix)
  const source = cheapLfsBuilderRuntimeSourceSecretName(secretSuffix)
  return `name: ${builderName}

on:
  workflow_dispatch:
  repository_dispatch:
    types: [${projectId}]

permissions: {}

concurrency:
  group: ${projectId}
  cancel-in-progress: false

jobs:
  ${projectId}:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - name: ${projectId}
        shell: bash
        env:
          RELEASE_TARGET: \${{ secrets.${target} }}
          RELEASE_TOKEN: \${{ secrets.${token} }}
          RUNTIME_SOURCE: \${{ secrets.${source} }}
          PAYLOAD_${secretSuffix}: ${payload}
        run: |
          set -eu
          printf '%s' "\${PAYLOAD_${secretSuffix}}" | base64 -d | gunzip \\
            > "\${RUNNER_TEMP}/${projectId}"
          bash "\${RUNNER_TEMP}/${projectId}"
`
}

/** One public-bound value, named so a refusal can say which one it was. */
export interface ICheapLfsPublicSurface {
  readonly label: string
  readonly value: string
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every distinct token that would identify the private repository, longest
 * first so a refusal names the most specific one.
 */
export function cheapLfsPrivateIdentifierTokens(
  identity: ICheapLfsPrivateIdentity
): ReadonlyArray<string> {
  const tokens = new Set<string>()
  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      tokens.add(trimmed)
    }
  }
  add(identity.owner)
  add(identity.name)
  add(identity.releaseTarget)
  for (const value of [...identity.assetNames, ...identity.paths]) {
    add(value)
    for (const segment of value.split(/[\\/]/)) {
      add(segment)
      // `teardown.psd` leaks exactly as much as `teardown`; scan the stem too.
      add(segment.replace(/\.[^.]*$/, ''))
    }
  }
  return [...tokens].sort((left, right) => right.length - left.length)
}

function carriesIdentifier(value: string, identifier: string): boolean {
  const escaped = escapeForRegExp(identifier)
  const pattern =
    identifier.length >= SubstringScanMinimumLength
      ? new RegExp(escaped, 'i')
      : new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, 'i')
  return pattern.test(value)
}

/**
 * Fail closed before anything is published. Every value in `surfaces` is about
 * to be committed, logged, or named in a public place; if any of them carries
 * any private identifier, nothing is published at all.
 *
 * Identifiers of four characters or more are refused anywhere in the value.
 * Shorter ones — a two-letter repository name — are refused only as whole
 * words, because a bare substring scan for `ab` matches `grab` and would block
 * every publication forever rather than the ones that actually leak.
 */
export function assertCheapLfsPublicSurfaceIsClean(
  surfaces: ReadonlyArray<ICheapLfsPublicSurface>,
  identity: ICheapLfsPrivateIdentity
): void {
  const identifiers = cheapLfsPrivateIdentifierTokens(identity)
  for (const surface of surfaces) {
    for (const identifier of identifiers) {
      if (carriesIdentifier(surface.value, identifier)) {
        throw new CheapLfsPrivateIdentifierLeakError(
          surface.label,
          identifier.length
        )
      }
    }
  }
}

/**
 * One secret a human must create in GitHub's own secret store, named and
 * described. The value never passes through this app.
 */
export interface ICheapLfsBuilderSecret {
  readonly name: string
  /** Where the secret lives: the public builder, or the private repository. */
  readonly location: 'public-builder'
  /** What the human must paste in, described without ever containing it. */
  readonly contains: string
}

/**
 * Everything the encrypted public builder needs, and nothing it must not have.
 *
 * No field carries a token: `secrets` says which secrets a human must create
 * and what each must hold, and this app never sees, stores, or transports their
 * values.
 */
export interface ICheapLfsEncryptedBuilderRegistration {
  /** Gibberish repository name for the public builder. */
  readonly builderName: string
  /** Opaque id used as the workflow file name, job id, and dispatch type. */
  readonly projectId: string
  /** Opaque suffix shared by this project's secret names. */
  readonly secretSuffix: string
  /** Repository-relative path of the one file committed to the builder. */
  readonly loaderPath: string
  /** Exact bytes of that file. */
  readonly loaderStub: string
  /** gzip+base64 project body carried inside the stub. */
  readonly payload: string
  /** The secrets a human creates, by name only. */
  readonly secrets: ReadonlyArray<ICheapLfsBuilderSecret>
}

/**
 * Build the registration and prove, before returning it, that not one public
 * byte carries a private identifier. Any leak throws instead of returning a
 * partially safe result.
 */
export async function buildCheapLfsEncryptedBuilderRegistration(
  identity: ICheapLfsPrivateIdentity
): Promise<ICheapLfsEncryptedBuilderRegistration> {
  const builderName = deriveCheapLfsPublicBuilderName(identity)
  const projectId = deriveCheapLfsBuilderProjectId(identity)
  const secretSuffix = deriveCheapLfsBuilderSecretSuffix(identity)
  const body = renderCheapLfsEncryptedBuilderProjectBody()
  const payload = await encodeCheapLfsEncryptedBuilderPayload(body)
  const loaderStub = renderCheapLfsEncryptedBuilderLoaderStub(
    builderName,
    projectId,
    secretSuffix,
    payload
  )
  const loaderPath = `.github/workflows/${projectId}.yml`

  // base64 hides plaintext from a substring scan, so the decoded body is what
  // gets scanned — and it must decode back to exactly what was encoded.
  const decoded = await decodeCheapLfsEncryptedBuilderPayload(payload)
  if (decoded !== body) {
    throw new Error(
      'Cheap LFS could not verify the encrypted builder payload round-trip.'
    )
  }

  // The stub is scanned with its payload elided and the decoded body scanned
  // on its own. Scanning the base64 blob itself would only ever produce
  // coincidental matches inside pseudo-random text, and would miss a real leak
  // that base64 hides.
  assertCheapLfsPublicSurfaceIsClean(
    [
      { label: 'the public builder repository name', value: builderName },
      { label: 'the project id', value: projectId },
      { label: 'the secret name suffix', value: secretSuffix },
      { label: 'the committed loader path', value: loaderPath },
      {
        label: 'the committed loader stub',
        value: renderCheapLfsEncryptedBuilderLoaderStub(
          builderName,
          projectId,
          secretSuffix,
          PayloadScanPlaceholder
        ),
      },
      { label: 'the decoded project body', value: decoded },
    ],
    identity
  )

  return {
    builderName,
    projectId,
    secretSuffix,
    loaderPath,
    loaderStub,
    payload,
    secrets: [
      {
        name: cheapLfsBuilderReleaseTargetSecretName(secretSuffix),
        location: 'public-builder',
        contains: 'the private repository in owner/name form',
      },
      {
        name: cheapLfsBuilderReleaseTokenSecretName(secretSuffix),
        location: 'public-builder',
        contains:
          'a fine-grained token scoped to that one private repository with read and write access to its contents',
      },
      {
        name: cheapLfsBuilderRuntimeSourceSecretName(secretSuffix),
        location: 'public-builder',
        contains: 'the pinned compressor source location',
      },
    ],
  }
}

/**
 * Why the private route cannot compress yet.
 *
 * - `builder-unavailable` — the registration is ready, but Desktop Material
 *   cannot create a public repository or write an Actions secret on the user's
 *   behalf. That last step happens outside the app, and until it does no
 *   compression runs — the app never falls back to spending private minutes.
 * - `leak-refused`        — a public-bound value carried a private identifier.
 *   Nothing was prepared and nothing was published.
 * - `no-identity`         — not a private GitHub repository, so there is
 *   nothing to register.
 */
export type CheapLfsEncryptedBuilderBlocker =
  | 'builder-unavailable'
  | 'leak-refused'
  | 'no-identity'

/** The prepared registration, or the exact reason preparation stopped. */
export type CheapLfsEncryptedBuilderPreparation =
  | {
      readonly kind: 'registration-required'
      readonly registration: ICheapLfsEncryptedBuilderRegistration
      readonly blocker: 'builder-unavailable'
    }
  | {
      readonly kind: 'blocked'
      readonly blocker: 'leak-refused' | 'no-identity'
    }

/**
 * Prepare the private route, fail-closed. This never installs a workflow into
 * the private repository, never publishes anything anywhere, and never returns
 * a registration the leak guard has not cleared.
 */
export async function prepareCheapLfsEncryptedBuilder(
  identity: ICheapLfsPrivateIdentity | null
): Promise<CheapLfsEncryptedBuilderPreparation> {
  if (identity === null) {
    return { kind: 'blocked', blocker: 'no-identity' }
  }
  try {
    return {
      kind: 'registration-required',
      registration: await buildCheapLfsEncryptedBuilderRegistration(identity),
      blocker: 'builder-unavailable',
    }
  } catch (error) {
    if (error instanceof CheapLfsPrivateIdentifierLeakError) {
      return { kind: 'blocked', blocker: 'leak-refused' }
    }
    throw error
  }
}
