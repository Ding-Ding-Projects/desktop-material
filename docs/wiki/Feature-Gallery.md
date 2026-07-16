# Guided Feature Gallery

This page maps the guided feature documentation to its 47-image acceptance gallery. Every view
uses synthetic accounts, repositories, issues, pull requests, workflow runs, logs, and artifact
metadata; no personal path, credential, or account identifier belongs in the image set.

> **Publication status:** The gallery includes the July 14, 2026 Actions cache and headless
> pagination evidence and the current Pages accessibility/clipping gate. Final source, CI, Pages,
> wiki, and push receipts remain recorded in `HANDOFF.md` after verification.

The current customization maintenance release adds guarded tab close/arrange,
Actions cancellation, reviewed rebase, repository-account propagation, OAuth
scope alignment, and compact Repository Tools/Remote Manager/Regex Builder
corrections. Those implementations are described below, but no new asset name,
capture receipt, or acceptance claim is added before the integrated off-screen
review. The 47-image manifest and its existing references therefore remain
unchanged.

| Asset | Guided workflow shown |
| --- | --- |
| `material-welcome.png` | Material first-run task card and responsive workspace preview |
| `material-customization.png` | Git-backed profile appearance defaults and repository override guidance |
| `material-toolbar-overflow.png` | Measured narrow toolbar with Build & Run and Commit & Push in More |
| `material-shallow-clone-safe.png` | Reviewed shallow clone with a bounded commit depth |
| `material-clone-account-fallback.png` | Generic HTTPS clone completed through exact-origin signed-in account fallback |
| `material-pull-all-account-fallback.png` | Pull all with per-repository results and exact-origin account retry |
| `material-sparse-checkout-safe.png` | Validated cone-mode sparse-checkout review |
| `material-history-deepen.png` | Deepen-history result without exposing the account used |
| `material-remote-manager.png` | Reviewed named-remote administration |
| `material-native-pull-request.png` | Native pull-request creation with bounded metadata |
| `material-stash-manager.png` | Repository-wide stash selection and exact-entry actions |
| `material-actions-job-log.png` | Searchable in-app Actions job log |
| `material-actions-artifact-download.png` | Bounded artifact download with a locally computed digest |
| `material-actions-cache-manager.png` | Actions cache usage, inventory, refs, and deletion controls |
| `material-actions-pagination-headless.png` | Headless Actions run pagination and page-two sentinel |
| `material-actions-artifacts-headless.png` | Headless bounded artifact inventory |
| `material-actions-sentinel-headless.png` | Headless wrapped sentinel evidence with no clipping |
| `material-github-releases.png` | Repository-bound Releases and assets workspace |
| `material-github-issues.png` | Issue detail, comments, and reviewed lifecycle controls |
| `material-provider-triage.png` | Account- and repository-bound provider triage |
| `material-repository-tools.png` | Named Repository Tools administration hub |
| `material-workspace-changes.png` | Material Changes workspace and commit flow |
| `material-settings.png` | Responsive Material Settings dialog |
| `settings-history-manager.png` | Git-backed Settings history side sheet |
| `material-repositories-sheet.png` | Repository navigation side sheet |
| `material-branches-sheet.png` | Branch navigation and status side sheet |
| `regex-builder.png` | Block-based regular expression builder and live tester |
| `material-gitignore-manager.png` | Reviewed `.gitignore` template catalogue |
| `material-automation.png` | Layered automation schedules and account overrides |
| `material-notification-center.png` | Git-backed notification centre |
| `material-github-notifications.png` | Account-aware GitHub notifications |
| `material-provider-accounts.png` | GitHub, GitLab, and Bitbucket account controls |
| `material-multi-window-menu.png` | Open repositories and worktrees in another window |
| `material-scale-200-autofit.png` | 200% requested scale safely auto-fitted at minimum size |
| `material-responsive-overflow-fixed.png` | Exact-size responsive overflow regression proof |
| `material-history-power-tools.png` | Searchable History and commit ancestry graph |
| `material-branch-merge-all.png` | Merge All branches/worktrees with per-target state |
| `material-create-pull-request.png` | Native pull-request completion state |
| `material-effective-branch-rules.png` | Effective protection and ruleset policy |
| `material-actions-artifacts.png` | Artifact digest and attestation-presence context |
| `material-actions-pagination.png` | Workflow-run pagination retained across refresh |
| `material-actions-artifact-page-two.png` | Wrapped artifact page-two sentinel |
| `material-actions-jobs-pagination.png` | Attempt-aware job pagination and retry |
| `material-actions-pending-deployments.png` | Deployment environment review and history |
| `material-history-deepening.png` | Full-history state after a verified deepen |
| `material-shallow-clone.png` | Shallow-clone commit-depth controls |
| `material-sparse-checkout.png` | Sparse-checkout directory editor |

## Clone, pull, and working-tree scope

![Reviewed shallow clone with a bounded commit depth](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-shallow-clone-safe.png)

![Generic HTTPS clone completed through exact-origin signed-in account fallback](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-clone-account-fallback.png)

![Pull all showing a neutral exact-origin signed-in account fallback result](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-pull-all-account-fallback.png)

![Validated cone-mode sparse-checkout review](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-sparse-checkout-safe.png)

![Deepen-history result without displaying the account used](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-history-deepen.png)

## Repository administration

The current Remote Manager layout preserves readable semantic columns and
stacks a row before its name, fetch/push URLs, or controls collapse. Repository
Tools owns short-window vertical scrolling so Diagnostics and later results stay
reachable. The reviewed current-branch rebase uses searched target selection,
ahead/behind context, a bounded commit preview, fresh safety/ref checks, and the
existing conflict continue/abort path; it never force-pushes automatically.

![Reviewed named-remote administration](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-remote-manager.png)

![Repository-wide stash manager with an exact selected entry](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-stash-manager.png)

![Named Repository Tools administration hub](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-repository-tools.png)

![Reviewed gitignore template catalogue](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-gitignore-manager.png)

![Full-history state after a verified deepen](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-history-deepening.png)

## GitHub lifecycle

For queued, running, waiting, or pending workflow runs, the current Actions
surface adds an exact-run cancellation review with available ref/actor/commit
context. Repository/account/run identity and live status are revalidated before
one normal cancel request, duplicate submission is suppressed, and polling
continues to a terminal state with explicit authentication, SSO, and conflict
recovery.

![Native pull-request creation with bounded metadata](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-native-pull-request.png)

![Searchable in-app Actions job log](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-job-log.png)

![Bounded Actions artifact download with a locally computed digest](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-artifact-download.png)

![Actions cache manager with usage totals, refs, wrapped keys, and delete controls](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-cache-manager.png)

![Headless Actions run pagination with the page-two sentinel retained](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-pagination-headless.png)

![Headless Actions artifact inventory with bounded pagination](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-artifacts-headless.png)

![Headless Actions sentinel evidence with wrapped content and no clipping](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-sentinel-headless.png)

![Actions artifact digest and attestation-presence context](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-artifacts.png)

![Actions workflow-run pagination retained across refresh](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-pagination.png)

![Actions artifact page-two sentinel with wrapped content](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-artifact-page-two.png)

![Attempt-aware Actions job pagination and retry](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-jobs-pagination.png)

![Pending deployment environment review and history](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-actions-pending-deployments.png)

![Effective branch protection and ruleset policy](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-effective-branch-rules.png)

![Native pull-request completion state](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-create-pull-request.png)

![Repository-bound Releases and assets workspace](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-github-releases.png)

![Issue detail, comments, and reviewed lifecycle controls](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-github-issues.png)

## Provider triage

Provider Triage now consumes the canonical repository-account key saved by
Repository Settings and reacts to binding changes without reopening the
repository. Unique exact matches may bind only an unassigned repository;
multiple matches require **Use this account**, and signed-out, permission, or
organization-SSO states do not masquerade as unbound. GitHub browser sign-in
uses the bounded `repo user workflow notifications read:org` feature scopes and
excludes unrelated destructive/admin families.

![Account- and repository-bound provider triage with bounded results](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-provider-triage.png)

## Customization, welcome, and adaptive toolbar

The Word-style per-tab appearance surface combines typography, alignment, and
independent text/background palettes. The original regex close action remains;
the inverse literal close flow adds live counts/preview and cannot confirm empty
or zero-match input. Pinned/manual/keyboard arrangement plus stable one-shot
label/opened/status sorts persist without continuously reacting to later status
changes. App/profile appearance inheritance and measured toolbar overflow remain
as described by the three existing images below.

![Material first-run welcome with a focused setup card and tonal workspace preview](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-welcome.png)

![Profile-backed Appearance preferences with repository override guidance](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-customization.png)

![Measured narrow toolbar with Build and Run and Commit and Push available from More without clipping](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-toolbar-overflow.png)

## Material shell and accessibility

![Material Changes workspace and commit flow](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-workspace-changes.png)

![Responsive Material Settings dialog](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-settings.png)

![Git-backed Settings history side sheet](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/settings-history-manager.png)

![Repository navigation side sheet](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-repositories-sheet.png)

![Branch navigation and status side sheet](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-branches-sheet.png)

![Requested 200 percent scale safely auto-fitted at minimum size](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-scale-200-autofit.png)

![Exact-size responsive overflow regression proof](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-responsive-overflow-fixed.png)

## Search, history, accounts, and automation

At compact and zoomed sizes, Regex Builder reflows the category/token layout,
scrolls its body vertically, and keeps its live tester and footer actions
reachable without page-level horizontal clipping.

![Block-based regular expression builder and live tester](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/regex-builder.png)

![Searchable History and commit ancestry graph](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-history-power-tools.png)

![Layered automation schedules and account overrides](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-automation.png)

![Merge All branches and worktrees with per-target state](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-branch-merge-all.png)

![Git-backed notification centre](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-notification-center.png)

![Account-aware GitHub notifications](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-github-notifications.png)

![GitHub, GitLab, and Bitbucket account controls](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-provider-accounts.png)

![Open repositories and worktrees in another window](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-multi-window-menu.png)

![Shallow-clone commit-depth controls](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-shallow-clone.png)

![Sparse-checkout directory editor](https://raw.githubusercontent.com/codingmachineedge/desktop-material/main/docs/assets/screenshots/material-sparse-checkout.png)
