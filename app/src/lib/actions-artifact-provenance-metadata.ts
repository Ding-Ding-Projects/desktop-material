import {
  ActionsArtifactRepositoryVisibility,
  IActionsArtifactReferencedWorkflow,
  normalizeActionsArtifactFullRef,
  normalizeActionsArtifactGitObjectId,
  normalizeActionsArtifactPositiveInteger,
  normalizeActionsArtifactRepositoryVisibility,
  normalizeActionsArtifactWorkflowPath,
} from './actions-artifact-provenance'

export const ActionsArtifactProvenanceMaximumReferencedWorkflows = 64
export const ActionsArtifactProvenanceMaximumAnnotatedTagDepth = 8

const repositoryPartPattern = /^[A-Za-z0-9_.-]{1,100}$/
const visibleASCII = /^[\x21-\x7e]+$/
const controlOrBidiPattern =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

export interface IActionsArtifactProvenanceRepositoryMetadata {
  readonly full_name: string
  readonly visibility: ActionsArtifactRepositoryVisibility
}

export interface IActionsArtifactProvenanceReferencedWorkflow
  extends IActionsArtifactReferencedWorkflow {
  readonly path: string | null
  readonly ref: string | null
  readonly sha: string | null
}

export interface IActionsArtifactProvenanceRunAttemptMetadata {
  readonly id: number
  readonly run_attempt: number
  readonly head_branch: string | null
  readonly head_sha: string
  readonly path: string
  readonly referenced_workflows: ReadonlyArray<IActionsArtifactProvenanceReferencedWorkflow>
}

export type ActionsArtifactProvenanceGitObjectType =
  | 'commit'
  | 'tag'
  | 'tree'
  | 'blob'

export interface IActionsArtifactProvenanceGitObject {
  readonly type: ActionsArtifactProvenanceGitObjectType
  readonly sha: string
}

export interface IActionsArtifactProvenanceGitRef {
  readonly ref: string
  readonly object: IActionsArtifactProvenanceGitObject
}

export interface IActionsArtifactProvenanceAnnotatedTag {
  readonly sha: string
  readonly object: IActionsArtifactProvenanceGitObject
}

export type ActionsArtifactProvenanceRefNamespace = 'heads' | 'tags'

export interface IActionsArtifactProvenanceRefLoader {
  readonly getRef: (
    namespace: ActionsArtifactProvenanceRefNamespace,
    name: string,
    signal?: AbortSignal
  ) => Promise<IActionsArtifactProvenanceGitRef | null>
  readonly getAnnotatedTag: (
    sha: string,
    signal?: AbortSignal
  ) => Promise<IActionsArtifactProvenanceAnnotatedTag>
}

function metadataError(label: string): Error {
  return new Error(`GitHub returned invalid artifact provenance ${label}.`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw metadataError(label)
  }
  return value as Record<string, unknown>
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function boundedString(
  value: unknown,
  label: string,
  maximumBytes: number
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    controlOrBidiPattern.test(value) ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    throw metadataError(label)
  }
  return value
}

function repositoryPart(value: unknown, label: string): string {
  const part = boundedString(value, label, 100)
  if (!repositoryPartPattern.test(part) || part === '.' || part === '..') {
    throw metadataError(label)
  }
  return part
}

function providerWorkflowSuffix(value: string): string {
  try {
    return normalizeActionsArtifactGitObjectId(value)
  } catch {
    // A provider may report a full ref or its branch/tag tail instead.
  }
  try {
    return normalizeActionsArtifactFullRef(value)
  } catch {
    return normalizeActionsArtifactSourceRefName(value)
  }
}

function runWorkflowPath(value: unknown): string {
  const path = boundedString(value, 'workflow path', 2048)
  const suffixAt = path.lastIndexOf('@')
  const rawPath = suffixAt === -1 ? path : path.slice(0, suffixAt)
  if (rawPath.includes('@')) {
    throw metadataError('workflow path')
  }
  try {
    normalizeActionsArtifactWorkflowPath(rawPath)
    if (suffixAt !== -1) {
      providerWorkflowSuffix(path.slice(suffixAt + 1))
    }
  } catch {
    throw metadataError('workflow path')
  }
  return path
}

function referencedWorkflowPath(value: unknown): string {
  const path = boundedString(value, 'referenced workflow path', 4096)
  const suffixAt = path.lastIndexOf('@')
  if (suffixAt <= 0 || path.slice(0, suffixAt).includes('@')) {
    throw metadataError('referenced workflow path')
  }
  const identity = path.slice(0, suffixAt)
  const parts = identity.split('/')
  if (parts.length < 5) {
    throw metadataError('referenced workflow path')
  }
  repositoryPart(parts[0], 'referenced workflow owner')
  repositoryPart(parts[1], 'referenced workflow repository')
  try {
    normalizeActionsArtifactWorkflowPath(parts.slice(2).join('/'))
    providerWorkflowSuffix(path.slice(suffixAt + 1))
  } catch {
    throw metadataError('referenced workflow path')
  }
  return path
}

function nullableField(
  value: Record<string, unknown>,
  key: string,
  normalize: (item: unknown) => string
): string | null {
  if (!hasOwn(value, key) || value[key] === null) {
    return null
  }
  return normalize(value[key])
}

function referencedWorkflow(
  value: unknown
): IActionsArtifactProvenanceReferencedWorkflow {
  const workflow = record(value, 'referenced workflow')
  return {
    path: nullableField(workflow, 'path', referencedWorkflowPath),
    ref: nullableField(workflow, 'ref', item => {
      try {
        return normalizeActionsArtifactFullRef(item)
      } catch {
        throw metadataError('referenced workflow ref')
      }
    }),
    sha: nullableField(workflow, 'sha', item => {
      try {
        return normalizeActionsArtifactGitObjectId(item)
      } catch {
        throw metadataError('referenced workflow sha')
      }
    }),
  }
}

export function parseActionsArtifactProvenanceRepositoryMetadata(
  value: unknown
): IActionsArtifactProvenanceRepositoryMetadata {
  const repository = record(value, 'repository metadata')
  const fullName = boundedString(
    repository.full_name,
    'repository full name',
    201
  )
  const parts = fullName.split('/')
  if (parts.length !== 2) {
    throw metadataError('repository full name')
  }
  repositoryPart(parts[0], 'repository owner')
  repositoryPart(parts[1], 'repository name')
  let visibility: ActionsArtifactRepositoryVisibility
  try {
    visibility = normalizeActionsArtifactRepositoryVisibility(
      repository.visibility
    )
  } catch {
    throw metadataError('repository visibility')
  }
  return { full_name: fullName, visibility }
}

export function parseActionsArtifactProvenanceRunAttemptMetadata(
  value: unknown
): IActionsArtifactProvenanceRunAttemptMetadata {
  const attempt = record(value, 'run attempt metadata')
  let id: number
  let runAttempt: number
  let headSHA: string
  try {
    id = normalizeActionsArtifactPositiveInteger(attempt.id, 'run id')
    runAttempt = normalizeActionsArtifactPositiveInteger(
      attempt.run_attempt,
      'run attempt'
    )
    headSHA = normalizeActionsArtifactGitObjectId(attempt.head_sha)
  } catch {
    throw metadataError('run attempt metadata')
  }

  let headBranch: string | null = null
  if (attempt.head_branch !== null) {
    try {
      headBranch = normalizeActionsArtifactSourceRefName(attempt.head_branch)
    } catch {
      throw metadataError('run head branch')
    }
  }

  const rawReferenced = hasOwn(attempt, 'referenced_workflows')
    ? attempt.referenced_workflows
    : []
  if (
    !Array.isArray(rawReferenced) ||
    rawReferenced.length > ActionsArtifactProvenanceMaximumReferencedWorkflows
  ) {
    throw metadataError('referenced workflows')
  }

  return {
    id,
    run_attempt: runAttempt,
    head_branch: headBranch,
    head_sha: headSHA,
    path: runWorkflowPath(attempt.path),
    referenced_workflows: rawReferenced.map(referencedWorkflow),
  }
}

function gitObject(value: unknown): IActionsArtifactProvenanceGitObject {
  const object = record(value, 'Git object')
  if (
    object.type !== 'commit' &&
    object.type !== 'tag' &&
    object.type !== 'tree' &&
    object.type !== 'blob'
  ) {
    throw metadataError('Git object type')
  }
  let sha: string
  try {
    sha = normalizeActionsArtifactGitObjectId(object.sha)
  } catch {
    throw metadataError('Git object sha')
  }
  return { type: object.type, sha }
}

export function parseActionsArtifactProvenanceGitRef(
  value: unknown
): IActionsArtifactProvenanceGitRef {
  const gitRef = record(value, 'Git ref')
  let ref: string
  try {
    ref = normalizeActionsArtifactFullRef(gitRef.ref)
  } catch {
    throw metadataError('Git ref name')
  }
  return { ref, object: gitObject(gitRef.object) }
}

export function parseActionsArtifactProvenanceAnnotatedTag(
  value: unknown
): IActionsArtifactProvenanceAnnotatedTag {
  const tag = record(value, 'annotated tag')
  let sha: string
  try {
    sha = normalizeActionsArtifactGitObjectId(tag.sha)
  } catch {
    throw metadataError('annotated tag sha')
  }
  return { sha, object: gitObject(tag.object) }
}

/** Validate an unqualified branch/tag lookup name before it enters an API path. */
export function normalizeActionsArtifactSourceRefName(value: unknown): string {
  const name = boundedString(value, 'source ref name', 1024)
  if (
    !visibleASCII.test(name) ||
    name === '@' ||
    name.startsWith('refs/') ||
    name.startsWith('-') ||
    name.startsWith('/') ||
    name.endsWith('/') ||
    name.includes('//') ||
    name.includes('..') ||
    name.includes('@{') ||
    name.includes('%') ||
    /[~^:?*\[\\]/.test(name) ||
    name
      .split('/')
      .some(
        part =>
          part.length === 0 ||
          part === '.' ||
          part === '..' ||
          part.startsWith('.') ||
          part.endsWith('.') ||
          part.endsWith('.lock')
      )
  ) {
    throw metadataError('source ref name')
  }
  return name
}

function abortError(): Error {
  const error = new Error('Artifact provenance metadata request canceled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError()
  }
}

function directCommitTarget(
  gitRef: IActionsArtifactProvenanceGitRef,
  label: string
): string {
  if (gitRef.object.type !== 'commit') {
    throw metadataError(`${label} target`)
  }
  return normalizeActionsArtifactGitObjectId(gitRef.object.sha)
}

async function tagCommitTarget(
  gitRef: IActionsArtifactProvenanceGitRef,
  loader: IActionsArtifactProvenanceRefLoader,
  signal?: AbortSignal
): Promise<string> {
  let object = gitRef.object
  if (object.type === 'commit') {
    return object.sha
  }
  if (object.type !== 'tag') {
    throw metadataError('tag target')
  }

  const visited = new Set<string>()
  for (
    let depth = 0;
    depth < ActionsArtifactProvenanceMaximumAnnotatedTagDepth;
    depth++
  ) {
    throwIfAborted(signal)
    const requestedSHA = normalizeActionsArtifactGitObjectId(object.sha)
    if (visited.has(requestedSHA)) {
      throw metadataError('annotated tag cycle')
    }
    visited.add(requestedSHA)
    const tag = await loader.getAnnotatedTag(requestedSHA, signal)
    throwIfAborted(signal)
    if (tag.sha !== requestedSHA) {
      throw metadataError('annotated tag sha')
    }
    object = tag.object
    if (object.type === 'commit') {
      return normalizeActionsArtifactGitObjectId(object.sha)
    }
    if (object.type !== 'tag') {
      throw metadataError('annotated tag target')
    }
  }
  throw metadataError('annotated tag depth')
}

/** Resolve one authoritative full source ref, or null when it is ambiguous. */
export async function resolveActionsArtifactProvenanceSourceRef(
  attempt: Pick<
    IActionsArtifactProvenanceRunAttemptMetadata,
    'head_branch' | 'head_sha'
  >,
  loader: IActionsArtifactProvenanceRefLoader,
  signal?: AbortSignal
): Promise<string | null> {
  throwIfAborted(signal)
  if (attempt.head_branch === null) {
    return null
  }
  const name = normalizeActionsArtifactSourceRefName(attempt.head_branch)
  const expectedSHA = normalizeActionsArtifactGitObjectId(attempt.head_sha)

  const headRef = await loader.getRef('heads', name, signal)
  throwIfAborted(signal)
  const tagRef = await loader.getRef('tags', name, signal)
  throwIfAborted(signal)

  const matches = new Array<string>()
  if (headRef !== null) {
    const expectedRef = `refs/heads/${name}`
    if (headRef.ref !== expectedRef) {
      throw metadataError('branch ref')
    }
    if (directCommitTarget(headRef, 'branch') === expectedSHA) {
      matches.push(expectedRef)
    }
  }
  if (tagRef !== null) {
    const expectedRef = `refs/tags/${name}`
    if (tagRef.ref !== expectedRef) {
      throw metadataError('tag ref')
    }
    if ((await tagCommitTarget(tagRef, loader, signal)) === expectedSHA) {
      matches.push(expectedRef)
    }
  }
  throwIfAborted(signal)
  return matches.length === 1 ? matches[0] : null
}
