export const GitflowBranchKinds = ['feature', 'release', 'hotfix'] as const
export type GitflowBranchKind = typeof GitflowBranchKinds[number]

const GitflowBranchPattern =
  /^(feature|release|hotfix)\/([A-Za-z0-9][A-Za-z0-9._/-]{0,127})$/

function normalizeName(name: string): string {
  const value = name.trim()
  if (
    value.length === 0 ||
    value.length > 128 ||
    value.startsWith('-') ||
    value.includes('..') ||
    value.includes('@{') ||
    value.includes('\\') ||
    value.endsWith('/') ||
    value.endsWith('.')
  ) {
    throw new Error('Use a non-empty Gitflow name without Git ref separators.')
  }
  return value
}

export function getGitflowBranchName(
  kind: GitflowBranchKind,
  name: string
): string {
  return `${kind}/${normalizeName(name)}`
}

export function parseGitflowBranch(
  branchName: string
): { readonly kind: GitflowBranchKind; readonly name: string } | null {
  const match = GitflowBranchPattern.exec(branchName.trim())
  return match === null
    ? null
    : { kind: match[1] as GitflowBranchKind, name: match[2] }
}

export function getGitflowTargetBranches(
  branches: ReadonlyArray<string>,
  kind: GitflowBranchKind
): string[] {
  const preferred =
    kind === 'feature'
      ? ['develop', 'main', 'master']
      : ['main', 'master', 'develop']
  return preferred.filter(branch => branches.includes(branch))
}
