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
title, and body inputs, submit an approval or request-changes review, and merge
after confirmation. The service boundary supports more request metadata and an
expected-head SHA, but the pane does not yet expose template discovery, draft
or maintainer settings, exact-account selection, or every merge safeguard.

Full graphical review, inline multi-file conversations, fork checkout, branch
rules, and offline review parity remain partial or unavailable.

## Actions

The Actions tab supports workflow/run browsing, a job table, bounded log
metadata, ref-only workflow dispatch, full rerun, and confirmation-gated
cancellation. The service can request failed-job reruns, but the pane does not
yet expose that choice. Typed workflow-input discovery, cancellable-state and
identity revalidation, duplicate suppression, and polling until terminal state
are also not complete.

## Releases, packages, and projects

Release and package inventories are read-only in the general GitHub pane.
General asset upload, package file transfer, release authoring, and update-feed
behavior are not claimed. The dedicated [Cheap LFS manager](cheap-lfs.md) is a
narrow exception: after an explicit plan and confirmation it may create or add
verified immutable assets to an app-managed storage prerelease. It cannot edit
an ordinary Release. Projects inventory is also read-only and requires the
token scopes that GitHub enforces; a missing `read:project` scope is reported
rather than silently returning an empty workspace.

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
