# Actions workflow manager

The **Workflows** tab of the Actions view lists every workflow in the
repository, with a switch per row to enable or disable it, a filter bar wired to
the full regex builder, and — for each workflow — how long its most recent
completed run took.

Actions 版面嘅 Workflows 分頁列晒成個 repo 嘅 workflow，逐個有開關掣，仲會話你
知每個上次行咗幾耐，唔使開網頁逐個㩒入去數。

## Behavior and configuration

Each row shows the workflow's icon, its `name:`, and a secondary line reading
`<file> · <state>`, plus `· last run <duration>` when a completed run of that
workflow has been loaded.

The duration answers the question a workflow list is usually opened to answer:
*which of these is the slow one?* Before it existed, comparing two workflows'
cost meant opening each run individually, or leaving the app for the web UI.

Rows are filtered by name or file path from the search field. Plain-text
matching is the default; the adjacent control opens the anchored regex builder,
and the chosen pattern, flags, case sensitivity, and mode apply to that field
only. The filter mode persists per surface under the `actions-workflows` id.

## How the duration is derived

GitHub's workflow-run resource reports no explicit duration, so
`getLastRunDuration` (`app/src/ui/actions/workflow-manager.tsx`) computes
`updated_at − created_at` of the **newest completed run** whose `workflow_id`
matches the row. This is the same span the Actions web UI presents, and it
includes queued time — which is the honest answer to "how long until it was
done", not merely how long a runner was busy.

`formatRunDuration` renders that span the way a glance wants it:

| Span | Rendered |
| --- | --- |
| under a minute | `45s` |
| whole minutes | `1m` |
| minutes and seconds | `4m 12s` |
| whole hours | `1h` |
| hours and minutes | `1h 15m` |

A run that completed inside the same second reports `1s` rather than `0s`;
zero would read as "did not run".

## Failure modes

The duration is **omitted entirely** rather than guessed whenever it cannot be
stated truthfully:

- No run of that workflow has been loaded yet.
- Every loaded run is still queued or in progress — a partial time would read
  as a finished one.
- The run reports no `updated_at`.
- Either timestamp fails to parse, or the end precedes the start (clock skew);
  a negative duration is discarded, never shown.

Because it is derived from the runs already loaded into the Actions view, the
figure reflects the loaded page of run history. Loading more runs can reveal a
more recent completed run and update the row.

## Force-cancelling a stuck run

A run that ignores an ordinary cancellation cannot be stopped from the Actions
UI — the request is accepted and the jobs keep going. GitHub provides a separate
endpoint for this:

```
POST /repos/{owner}/{repo}/actions/runs/{run_id}/force-cancel
```

Desktop Material exposes it inside the **same reviewed confirmation** as an
ordinary cancel, as a **Force cancel** checkbox rather than a second button, so
the harsher action is chosen deliberately and with the run's identity already on
screen. Ticking it retitles the dialog to *Force-cancel workflow run?* and
relabels the confirm button, so the dialog never says one thing and does
another.

> **What it actually does.** `force-cancel` bypasses conditional evaluation.
> Steps guarded by `if: always()` — cleanup, artifact upload, teardown — **do
> not run**, and jobs are terminated outright. That is precisely why it works on
> a wedged run, and precisely why it is not the default.

Behavioural guarantees:

- The choice is **per confirmation and never remembered**, so a forced
  cancellation cannot be inherited by the next ordinary one.
- Forced and normal requests use **different in-flight keys**. A forced request
  is never deduplicated into a normal one that is already stalling — which is
  exactly the state the user reaches for this in.
- Every progress message says which kind was sent; a forced request never
  reports itself as a normal one.
- The same pre-POST revalidation applies: the run identity, repository, and
  account are rechecked immediately before the request crosses the boundary, and
  an already-terminal run is reported as finished rather than force-cancelled.

## Accessibility and language

The duration is part of the row's existing secondary line, so the row height,
switch target, and focus order are unchanged. It is ordinary text — readable by
a screen reader in sequence with the file name and state — and carries no
`title` tooltip, which would be invisible to keyboard and assistive-technology
users. It is tinted with the primary color and semibold rather than enlarged,
keeping it subordinate to the workflow name.

## Verification

`app/test/unit/actions-run-cancellation-store-test.ts` covers force cancellation:
a forced request POSTs to `force-cancel` while a concurrent normal request still
POSTs to `cancel`, the two are not merged, and the forced request's progress
messages identify themselves as forced and never as normal.

`app/test/unit/actions/workflow-run-duration-test.ts` covers the formatter
across every boundary in the table above, newest-completed-run selection across
multiple workflows, and each omission case: no runs, an in-progress run, a
missing `updated_at`, an unparseable timestamp, and a reversed interval.

## Suggested articles

- [Local GitHub Actions runner](local-actions-runner.md) — run these same
  workflows on your own machine before pushing.
- [Automated update build status and release
  notes](automated-updates-and-release-notes.md) — what the release side of CI
  publishes.
- [Repository releases dashboard](repository-releases-dashboard.md) — the
  artifacts those runs produce.
