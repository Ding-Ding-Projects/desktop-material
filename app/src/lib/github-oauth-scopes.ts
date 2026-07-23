/**
 * Classic GitHub OAuth scopes required by Desktop Material's implemented
 * GitHub features. Keep this list explicit and capability-based: GitHub
 * normalizes child scopes that are already included by `repo` or `user`.
 *
 * Deliberately excluded are destructive or unrelated administration scopes
 * such as delete_repo, admin:org, key management, package deletion, audit-log
 * access, gists, and Codespaces.
 */
export const GitHubOAuthScopes = [
  // Repository content, issues, pull requests, releases, checks, rules, and
  // private-repository Actions reads/mutations.
  'repo',
  // Authenticated identity and email/profile data used for account selection.
  'user',
  // Add or update workflow files through ordinary reviewed Git pushes.
  'workflow',
  // Read notifications and mark exact threads as read/done.
  'notifications',
  // Resolve private organization/team membership and collaborator metadata.
  'read:org',
  // Request package read/write permission used by GHCR. Registry acceptance is
  // still verified at runtime because GitHub's registry authentication policy
  // can reject an otherwise valid account credential.
  'write:packages',
] as const

export type GitHubOAuthScope = typeof GitHubOAuthScopes[number]
