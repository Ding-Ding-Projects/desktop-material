import { Repository } from '../../models/repository'
import { Repositoryish } from './group-repositories'

/**
 * First-class management of the repository list's *custom* groups.
 *
 * A custom group is not a stored record anywhere: it exists exactly as long as
 * at least one repository carries its `groupName`. That is why every operation
 * here is expressed as a set of per-repository group-name writes, and why
 * removing a group can never remove a repository — the only field it touches is
 * the label, and the only value it writes is `null`.
 */

/** The `getGroupKey` prefix a custom repository group key carries. */
const CustomGroupKeyPrefix = '2:custom:'

/** The longest accepted group name; longer names are truncated on entry. */
export const MaxRepositoryGroupNameLength = 64

/** Trim, collapse whitespace, and bound a name, or null when it is unusable. */
export function normalizeRepositoryGroupName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length === 0
    ? null
    : trimmed.slice(0, MaxRepositoryGroupNameLength)
}

/** Whether a repository-list group key identifies a user-created group. */
export function isCustomRepositoryGroupKey(groupKey: string): boolean {
  return groupKey.startsWith(CustomGroupKeyPrefix)
}

/**
 * The case-folded group name a custom group key encodes, or null for any other
 * kind of group (pinned, recent, dotcom owner, Enterprise host, other).
 */
export function customRepositoryGroupKeyName(groupKey: string): string | null {
  return isCustomRepositoryGroupKey(groupKey)
    ? groupKey.slice(CustomGroupKeyPrefix.length)
    : null
}

/** Repositories that can carry a group label at all (cloning rows cannot). */
function groupableRepositories(
  repositories: ReadonlyArray<Repositoryish>
): ReadonlyArray<Repository> {
  return repositories.filter(
    (repository): repository is Repository => repository instanceof Repository
  )
}

/**
 * Every repository whose group label matches `groupName`, compared the same way
 * `getGroupKey` folds it so "Work" and "work" are one group, not two.
 */
export function repositoriesInCustomGroup(
  repositories: ReadonlyArray<Repositoryish>,
  groupName: string
): ReadonlyArray<Repository> {
  const folded = groupName.toLocaleLowerCase()
  return groupableRepositories(repositories).filter(
    repository => repository.groupName?.toLocaleLowerCase() === folded
  )
}

/** Every custom group name currently in use, deduped and sorted for display. */
export function customRepositoryGroupNames(
  repositories: ReadonlyArray<Repositoryish>
): ReadonlyArray<string> {
  const names = new Map<string, string>()
  for (const repository of groupableRepositories(repositories)) {
    const name = repository.groupName
    if (name !== null) {
      const folded = name.toLocaleLowerCase()
      if (!names.has(folded)) {
        names.set(folded, name)
      }
    }
  }
  return [...names.values()].sort((x, y) => x.localeCompare(y))
}

/** One repository's new group label. `null` means "no group", never "remove". */
export interface IRepositoryGroupAssignment {
  readonly repository: Repository
  readonly groupName: string | null
}

/**
 * The minimal set of writes that makes `nextName` hold exactly `selectedIds`.
 *
 * Repositories already in the right state are omitted, so a rename of a group
 * nobody edited the membership of costs one write per member and nothing else.
 * A repository dropped from the group is written back to `null` — it keeps its
 * place in the list, its history, and every byte on disk.
 */
export function planRepositoryGroupAssignments(
  repositories: ReadonlyArray<Repositoryish>,
  previousName: string | null,
  nextName: string,
  selectedIds: ReadonlySet<number>
): ReadonlyArray<IRepositoryGroupAssignment> {
  const previousMembers = new Set(
    previousName === null
      ? []
      : repositoriesInCustomGroup(repositories, previousName).map(
          repository => repository.id
        )
  )

  const assignments: Array<IRepositoryGroupAssignment> = []
  for (const repository of groupableRepositories(repositories)) {
    const selected = selectedIds.has(repository.id)
    if (selected) {
      if (repository.groupName !== nextName) {
        assignments.push({ repository, groupName: nextName })
      }
      continue
    }
    // Only members of the group being edited are cleared. A repository that
    // belongs to some *other* custom group is left completely alone.
    if (previousMembers.has(repository.id) && repository.groupName !== null) {
      assignments.push({ repository, groupName: null })
    }
  }

  return assignments
}

/**
 * The writes that dissolve a group: every member's label goes back to `null`.
 *
 * Nothing else changes. This is the whole of "removing a group never removes a
 * repository" — there is no code path here that could close, hide, or delete
 * one, because the only value this function can produce is `null`.
 */
export function planRepositoryGroupRemoval(
  repositories: ReadonlyArray<Repositoryish>,
  groupName: string
): ReadonlyArray<IRepositoryGroupAssignment> {
  return repositoriesInCustomGroup(repositories, groupName).map(repository => ({
    repository,
    groupName: null,
  }))
}

/** The DOM event carrying a non-blocking repository-group result notice. */
export const RepositoryGroupNoticeEvent =
  'desktop-material-repository-group-notice'

/** The payload of {@link RepositoryGroupNoticeEvent}. */
export interface IRepositoryGroupNoticeDetail {
  readonly notice: string
}

/**
 * Announce a group result to whichever repository list is mounted.
 *
 * The dialog that performs a create/edit/remove is a popup living outside the
 * list, so it cannot render the list's own status line. Rather than turning an
 * informational result into a modal, it posts the sentence here and the list
 * paints it in its polite live region, which auto-clears.
 */
export function emitRepositoryGroupNotice(notice: string): void {
  if (typeof document === 'undefined') {
    return
  }
  document.dispatchEvent(
    new CustomEvent<IRepositoryGroupNoticeDetail>(RepositoryGroupNoticeEvent, {
      detail: { notice },
    })
  )
}
