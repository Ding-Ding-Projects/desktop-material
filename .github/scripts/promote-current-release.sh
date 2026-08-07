#!/usr/bin/env bash

# Reconcile the repository's Latest release with the newest published release
# whose source commit is on main.
#
# Releases publish with --latest=false and this script decides Latest
# afterwards. The previous design only promoted a release whose target still
# equalled the tip of main at promotion time, so any push that landed while an
# installer build was running stranded Latest on an older release forever —
# and Squirrel auto-update polls releases/latest/download/, so installed apps
# silently stopped receiving fixes. Reconciliation is monotonic instead: among
# the published, non-draft, non-prerelease Windows-capable releases whose tags
# resolve to commits reachable from main, the tip-most commit wins, and
# same-commit ties go to the highest Squirrel version tag. A partial release
# without the Windows `RELEASES` feed is deliberately ineligible, so a newer
# Linux-only release cannot turn the Windows updater URL into a 404. A
# superseded-but-on-main release therefore still moves Latest forward, while
# a release for a commit that is not on main can never own Latest.

set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${RELEASE_TARGET_SHA:?RELEASE_TARGET_SHA is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"

if [[ ! "$RELEASE_TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release target is not an exact commit SHA." >&2
  exit 1
fi

# Test-only mode: prereleases are never promoted to Latest (GitHub also
# refuses make_latest for a prerelease). Reconciliation ignores prereleases,
# and resumes normal promotion once the lanes publish full releases again.
candidate_prerelease=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG" --jq .prerelease)
if [ "$candidate_prerelease" = "true" ]; then
  echo "::notice::$RELEASE_TAG is a prerelease; reconciling Latest without it."
fi

resolve_main() {
  git ls-remote origin refs/heads/main | awk 'NR == 1 { print $1 }'
}

# Ancestry checks need the remote objects, not just the remote SHA.
fetch_reconcile_objects() {
  git fetch --quiet origin refs/heads/main &&
    git fetch --quiet origin '+refs/tags/*:refs/tags/*'
}

# List published, non-draft, non-prerelease Windows-capable release tags
# (newest 100). A partial release may contain only the Linux/TUI payload; it
# must not own Latest because Squirrel would request a missing `RELEASES`
# asset. The page bound is deliberate: Latest is always a recent release, and
# older pages cannot outrank a newer on-main commit. A failed listing must
# abort the reconcile — an empty answer here is how a transient API error could
# otherwise masquerade as "no promotable releases" and trigger a demotion.
published_release_tags() {
  gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" \
    --jq '.[] |
      select(
        .draft == false and
        .prerelease == false and
        ([.assets[].name] | index("RELEASES") != null) and
        ([.assets[].name | select(endswith("-full.nupkg"))] | length > 0)
      ) |
      .tag_name'
}

# Print "tag<TAB>sha" for every published Windows-capable release tag that
# resolves locally to a commit reachable from main.
promotable_releases() {
  local main_sha="$1" release_tags="$2" tag sha
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    sha=$(git rev-parse -q --verify "refs/tags/$tag^{commit}" 2>/dev/null) || continue
    if git merge-base --is-ancestor "$sha" "$main_sha" 2>/dev/null; then
      printf '%s\t%s\n' "$tag" "$sha"
    fi
  done <<<"$release_tags"
}

# Among releases on main, find the tip-most source commit (largest ancestry
# count — a total order because every candidate is an ancestor of main).
select_best_main_sha() {
  local releases="$1" best_sha='' best_count=-1 sha count
  while IFS=$'\t' read -r _ sha; do
    [ -n "$sha" ] || continue
    if [ "$sha" = "$best_sha" ]; then
      continue
    fi
    count=$(git rev-list --count "$sha")
    if [ "$count" -gt "$best_count" ]; then
      best_count=$count
      best_sha=$sha
    fi
  done <<<"$releases"
  [ -n "$best_sha" ] && printf '%s\n' "$best_sha"
}

# Same-commit ties go to the highest Squirrel version so a lower lane's tag
# can never leave Latest below a published higher version for that source.
select_highest_target_tag() {
  local releases="$1" target_sha="$2" tags
  tags=$(awk -F '\t' -v sha="$target_sha" '$2 == sha { print $1 }' <<<"$releases")
  if [ -z "$tags" ]; then
    echo "No published releases resolve to $target_sha." >&2
    return 1
  fi
  printf '%s\n' "$tags" | node script/release-version.js max
}

current_latest_tag() {
  gh api "repos/$GITHUB_REPOSITORY/releases/latest" --jq .tag_name 2>/dev/null || true
}

promote_tag() {
  local tag="$1"
  local release_id
  release_id=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$tag" --jq .id)
  if [[ ! "$release_id" =~ ^[0-9]+$ ]]; then
    echo "Published Release $tag did not return a numeric database ID." >&2
    return 1
  fi
  gh api --method PATCH \
    "repos/$GITHUB_REPOSITORY/releases/$release_id" \
    -f make_latest=true >/dev/null
}

# Defensive only: if no on-main release exists but the current Latest resolves
# off main (for example after a history rewrite), clear its flag rather than
# leave auto-update serving a commit main no longer contains.
demote_if_latest() {
  local tag="$1"
  [ -n "$tag" ] || return 0
  local release_id
  release_id=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$tag" --jq .id)
  gh api --method PATCH \
    "repos/$GITHUB_REPOSITORY/releases/$release_id" \
    -f make_latest=false >/dev/null
}

reconcile_once() {
  local main_sha="$1" release_tags releases best_sha
  if ! release_tags=$(published_release_tags); then
    echo "Could not list published releases; Latest was not reconciled." >&2
    return 1
  fi
  releases=$(promotable_releases "$main_sha" "$release_tags")
  if [ -z "$releases" ]; then
    printf '\n'
    return 0
  fi
  best_sha=$(select_best_main_sha "$releases")
  select_highest_target_tag "$releases" "$best_sha"
}

set +e
current_main=$(resolve_main)
lookup_status=$?
set -e
if [ "$lookup_status" -ne 0 ] || [[ ! "$current_main" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve current main; Latest was not reconciled." >&2
  exit 1
fi
if ! fetch_reconcile_objects; then
  echo "Could not fetch main/tag objects; Latest was not reconciled." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$RELEASE_TARGET_SHA" "$current_main" 2>/dev/null; then
  echo "::notice::Published $RELEASE_TARGET_SHA is not on main; it will not own Latest."
fi

set +e
selected_tag=$(reconcile_once "$current_main")
reconcile_status=$?
set -e
if [ "$reconcile_status" -ne 0 ]; then
  exit 1
fi
if [ -z "$selected_tag" ]; then
  if [ "$candidate_prerelease" != "true" ]; then
    echo "No published Windows-capable release was available for Latest reconciliation." >&2
    exit 1
  fi
  previous_latest=$(current_latest_tag)
  previous_sha=''
  if [ -n "$previous_latest" ]; then
    previous_sha=$(git rev-parse -q --verify "refs/tags/$previous_latest^{commit}" 2>/dev/null) || previous_sha=''
  fi
  if [ -n "$previous_sha" ] &&
    ! git merge-base --is-ancestor "$previous_sha" "$current_main" 2>/dev/null; then
    echo "::warning::No published release is on main; demoting off-main Latest $previous_latest."
    demote_if_latest "$previous_latest"
  else
    echo "::notice::No promotable release in the newest page; leaving Latest untouched."
  fi
  exit 0
fi

if [ "$selected_tag" != "$RELEASE_TAG" ]; then
  echo "::notice::Release $selected_tag outranks candidate $RELEASE_TAG for Latest."
fi

if [ "$(current_latest_tag)" != "$selected_tag" ]; then
  promote_tag "$selected_tag"
fi

# A same-source or newer release can finish between selection and promotion.
# Re-resolve main and reconcile once more so a slower run can never leave
# Latest pointing below the newest published on-main release.
if ! fetch_reconcile_objects; then
  echo "Could not refresh objects for final Latest reconciliation." >&2
  exit 1
fi
set +e
current_main_after=$(resolve_main)
after_status=$?
set -e
if [ "$after_status" -ne 0 ] || [[ ! "$current_main_after" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve current main for final Latest reconciliation." >&2
  exit 1
fi
set +e
reconciled_tag=$(reconcile_once "$current_main_after")
reconcile_after_status=$?
set -e
if [ "$reconcile_after_status" -ne 0 ]; then
  echo "Final Latest reconciliation listing failed." >&2
  exit 1
fi
if [ -n "$reconciled_tag" ] && [ "$reconciled_tag" != "$selected_tag" ]; then
  promote_tag "$reconciled_tag"
  selected_tag=$reconciled_tag
fi

latest=$(current_latest_tag)
if [ "$latest" != "$selected_tag" ]; then
  echo "Latest Release is $latest, expected newest on-main release $selected_tag." >&2
  exit 1
fi
echo "::notice::Latest reconciled to $selected_tag."
