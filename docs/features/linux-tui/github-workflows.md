# TUI GitHub workflows

## Prerequisite and authentication

GitHub features use the installed `gh` executable. Authenticate outside the app
with the GitHub CLI's normal device/browser flow:

```bash
gh auth login
gh auth status
```

Do not paste a token into a TUI text box, repository setting, command argument,
or support log. The TUI asks `gh` for status and required scopes; `gh` and its
credential store own the secret. Local Git workflows remain available if `gh` is
missing, signed out, or lacks a scope.

The provider adapter sets `GH_PROMPT_DISABLED=1`, disables the update notifier
and pagers, requests no color, runs `gh` without a shell, supplies stdin only
for an explicit request body, and applies a default 30-second/maximum 120-second
timeout.

## Repository binding

The GitHub pane derives the provider repository from the active Git remote.
Provider calls are scoped to that owner/name and host. If no unambiguous GitHub
remote can be derived, the pane reports the problem instead of guessing another
repository.

## Issues

The Issues tab can list and inspect issues, create one from title/body inputs,
comment, and close a selected issue. The service boundary has additional
metadata/state operations that are not all exposed in the terminal pane. The UI
is a useful core, not full desktop triage parity: saved views, bulk planning,
project mutation, and every timeline event are not claimed.

## Pull requests

The Pull Requests tab can list and inspect requests, create one from base/head,
title, and body inputs, submit explicit review states, and merge after
confirmation. Its nested Review surface loads paginated files with a 120 KiB
per-patch bound, combines exact-head check runs with legacy commit statuses,
lists review activity, and creates a comment only against an exact commit SHA,
path, line, and side. The Effective rules surface inspects active rules for one
exact branch without pretending to administer them.

Template discovery, draft/maintainer settings, exact-account selection,
multi-line suggestion editing, offline review, fork checkout, and complete
rule administration remain partial or unavailable and are labelled in the
surface rather than hidden.

## Actions

The Actions tab supports paginated workflow/run browsing with workflow, branch,
event, and status filters; jobs, steps, run logs, and bounded job-log inspection;
JSON-scalar dispatch inputs; full and failed-only reruns; and
confirmation-gated cancellation. Independent Caches and Artifacts surfaces use
their own regex-capable searches. Cache deletion requires a reviewed numeric
ID. Artifact download rejects expired or oversized records, uses bounded binary
transport and an atomic destination, and requires a matching SHA-256 digest.

Cache archive download, arbitrary dispatch field widgets, deployment approval,
and a local Actions runner are not claimed.

## Releases, packages, and projects

The Releases surface lists releases and assets and provides reviewed
create/update/publish/delete operations plus bounded, atomic asset download.
The Packages surface exposes versions and metadata. Multipart release upload,
package content transfer, and update-feed behavior are not claimed. The
dedicated [Cheap LFS manager](cheap-lfs.md) is a
narrow exception: after an explicit plan and confirmation it may create or add
verified immutable assets to an app-managed storage prerelease. It cannot edit
an ordinary Release. Projects inventory is also read-only and requires the
token scopes that GitHub enforces; a missing `read:project` scope is reported
rather than silently returning an empty workspace.

### Super Express Linux TUI lane

The manual `.github/workflows/super-express-release.yml` dispatcher calls
`.github/workflows/super-express-release-linux-tui.yml` on `ubuntu-latest` in
parallel with the Windows x64 lane. This is an emergency zero-test path: it
does not run the TUI suite, parity generation, Ruff, mypy, installer smoke, or
the Debian acceptance container. It does run the packaging-only checks needed
to avoid a misleading payload: the exact commit is checked out, `uv build`
creates one wheel and one source distribution, `uv export --locked` creates
the matching runtime constraints, and both checked-in shell installers pass
`sh -n` and are copied as executable release assets.

The dispatcher downloads the verified Windows and TUI artifacts and publishes
one combined immutable Release. The TUI wheel, source distribution, runtime
constraints, `install-linux-tui.sh`, and `bootstrap-linux-tui.sh` therefore
remain beside the Windows `RELEASES` feed, portable ZIP, installer, and NuGet
package under the same `latest` redirect. A failed lane prevents publication
but retains its artifact for recovery; clearing the dispatch `publish` input
also retains both lane artifacts without creating a Release.

## Repository notifications

The Notifications surface lists the active repository's inbox with an
independent regex-capable search, selected-thread detail, and an explicit
mark-selected-read action. It does not silently mark every notification read or
claim a cross-provider global inbox.

## Bounded API explorer

The API tab exposes method/path/body text inputs and a scrollable response. REST
paths and GraphQL documents pass through length, method, timeout, response, and
repository/host validation in the service. It is intended for deliberate
repository-scoped inspection, not arbitrary shell execution.

The TUI does not expose its own HTTP server, so a TUI-specific Postman
collection is not applicable. The repository's existing Postman collections
document the separate opt-in Agent API; the terminal explorer talks to GitHub's
API through `gh`.

An API call can mutate remote state when the chosen method and endpoint do so.
Review the method, exact path, active repository, and body. Decision
confirmations in purpose-built issue/PR/Actions flows do not automatically make
an arbitrary explorer request safe.

## Failure modes

- not signed in: run `gh auth login` in a trusted shell;
- missing scope: refresh the account through `gh auth refresh` after reviewing
  the requested scope;
- rate limit or server error: the pane keeps the failure visible for retry;
- timeout: narrow the request or retry after confirming network health;
- repository moved/renamed: repair the Git remote and rebind the pane;
- malformed/oversized response: the bounded client rejects it rather than
  filling memory or rendering untrusted terminal control data.
