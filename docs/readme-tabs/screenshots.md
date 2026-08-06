[Overview](../../README.md) · [Install](install.md) · [Features](features.md) · [Complete list](complete-feature-list.md) · **Screenshots** · [Roadmap & receipts](roadmap-and-receipts.md) · [Development](development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Screenshots

The compact selection below keeps this README scannable. The
[guided feature gallery](../wiki/Feature-Gallery.md) and
[task-oriented tutorial](../wiki/User-Guide.md) contain the full annotated
set.

The wiki now also includes a visual-learning layer: eight labeled workflow
diagrams—one on every wiki page—and seven conceptual illustrations covering the
safe Git loop, short-lived branches, conflict resolution, rebase, stash recovery,
automation, and account isolation. The diagrams are reproducible with
`node script/generate-wiki-diagrams.js`.

| Launchpad full-width empty state |
| --- |
| <img src="../assets/screenshots/material-launchpad-empty-full-width-20260806.png" alt="Launchpad empty state from the built Windows app, with five truthful zero-count groups filling the workspace and no blank sidebar" width="720"><br><sub>Full-width empty state · five truthful zero-count groups · cheap Lowlevel hidden-desktop capture</sub> |

## Historical Linux terminal captures

Five original-resolution Debian/Xvfb captures remain preserved with their
[dated run manifest](../verification/linux-tui-2026-07-27/run-manifest.md).
They are historical evidence, not current Windows screenshots, and are
therefore excluded from the 91-scene guided-gallery target, Pages manifest,
and current refresh campaign.

## Inherited external-UI assets — excluded from the capture mandate

Every screenshot of **Desktop Material's own interface** is produced by the
app's capture harness and is replaceable on demand. Six inherited assets are a
documented exception, because they show **other products' interfaces** that
this app cannot render and the harness therefore cannot reproduce:

| Asset | External interface shown |
| --- | --- |
| `../assets/git-credential-manager.png` | Git Credential Manager (Windows) |
| `../assets/ado-prompt.png` | Azure DevOps sign-in prompt |
| `../assets/bitbucket-prompt.png` | Bitbucket sign-in prompt |
| `../assets/gitlab-prompt.png` | GitLab sign-in prompt |
| `../assets/unreachable-commits-history.png` | Upstream GitHub Desktop docs |
| `../assets/unreachable-commits-demo.gif` | Upstream GitHub Desktop docs |

They are referenced from `docs/integrations/azure-devops.md`,
`docs/integrations/bitbucket.md`, `docs/integrations/gitlab.md`, and
`docs/learn-more/unreachable-commits.md`, where they illustrate third-party
sign-in flows a user meets outside this app.

Recapturing them would require live Azure DevOps, Bitbucket, and GitLab
accounts plus a credential-prompt environment, and the result would still be
someone else's UI rather than evidence about this app. They are therefore
**excluded** from "replace every screenshot" work and are not counted against
capture coverage. Decision recorded 2026-07-27 (issue #25, option A). Anyone
adding a new external-product screenshot should list it here with the same
justification rather than leaving it to be mistaken for a stale app capture.

## Current settings surfaces — browser-tab acceptance

These three frames come from the exact production Electron build on the named
hidden desktop run recorded in
[`settings-browser-tabs-headless-run-manifest.json`](../verification/settings-browser-tabs-headless-run-manifest.json).
They show the shared browser-style tab lane on Global Settings, Repository
Settings, and Stash Manager, including close actions, search/overflow/new-page
controls, and the active panel below the selected page.

| Global Settings | Repository Settings | Stash Manager |
| --- | --- | --- |
| <img src="../assets/screenshots/material-settings.png" alt="Global Settings with browser-style tabs, close actions, search, and overflow" width="320"><br><sub>SHA-256 `43ff361771efeeeb01eb8b40b778b9a4e5b3a311457fc632271d9ad4aa513fc`</sub> | <img src="../assets/screenshots/material-remote-manager.png" alt="Repository Settings with browser-style tabs and the Remote page selected" width="320"><br><sub>SHA-256 `4850a060ed8ffb9c8fd06bf013e6b503b4928c58bf0449c45e56887be09ad962`</sub> | <img src="../assets/screenshots/material-stash-manager.png" alt="Stash Manager with browser-style Manage, Export, History, and Appearance and voice pages" width="320"><br><sub>SHA-256 `52254a7b62ba0a9ce3d84c19fe3cd5e4e30a37ede79d3122afa57665b9759ca3`</sub> |

<sub>全域設定、倉庫設定同 Stash 管理員而家共用同一條似瀏覽器嘅分頁列；開新頁、關頁同搵滿瀉分頁都係同一套手勢。</sub>

| Searchable Publish organization owner |
| --- |
| <img src="../assets/screenshots/material-publish-organization-picker.png" alt="Bilingual Publish repository dialog with a searchable organization owner listbox fully visible at narrow width" width="720"><br><sub>Personal or organization owner · fuzzy/substring/safe regex · non-collapsing contained list</sub> |

| Custom app identity | Material Welcome | Appearance customization | Dynamic toolbar overflow |
| --- | --- | --- | --- |
| <img src="../assets/screenshots/material-app-identity-workspace.png" alt="Workspace with a customized in-app logo and name plus a favorite repository tab" width="320"><br><sub>Profile app identity</sub> | <img src="../assets/screenshots/material-welcome.png" alt="Pure Material first-run Welcome task card and tonal workspace preview" width="320"><br><sub>Material Welcome</sub> | <img src="../assets/screenshots/material-customization.png" alt="Appearance editor anchored beside its actual element with History, a dedicated local Git path, and burst-safe persistence" width="320"><br><sub>Anchored owner · burst-safe history</sub> | <img src="../assets/screenshots/material-toolbar-overflow.png" alt="Narrow app bar with lower-priority actions moved into the More surface before clipping" width="320"><br><sub>Measured More behavior</sub> |

| Word-style tab appearance | Arrange tabs | Actions cancellation | Reviewed rebase |
| --- | --- | --- | --- |
| <img src="../assets/screenshots/material-tab-appearance-word.png" alt="Word-style tab appearance editor with typography, alignment, and independent text and background palettes" width="320"><br><sub>Per-tab appearance</sub> | <img src="../assets/screenshots/material-tab-arrange.png" alt="Arrange tabs surface with pinned and manual movement controls plus one-shot label, opened-date, and repository-status sorts" width="320"><br><sub>Persistent tab order</sub> | <img src="../assets/screenshots/material-actions-cancel.png" alt="Material workflow-run cancellation review naming the exact run, ref, actor, and commit" width="320"><br><sub>Exact-run cancellation</sub> | <img src="../assets/screenshots/material-rebase-review.png" alt="Reviewed current-branch rebase showing current to target, ahead and behind counts, and a bounded commit preview" width="320"><br><sub>Rebase review</sub> |

| Persistent tab groups | Rich command palette |
| --- | --- |
| <img src="../assets/screenshots/material-tab-groups.png" alt="Desktop Material workspace with a visible named tab-group chip and its repository member" width="520"><br><sub>Named chip · collapse/expand · restart persistence</sub> | <img src="../assets/screenshots/material-command-palette-appearance.png" alt="Command palette showing Ollama results beside the compact aligned row appearance editor with random per repository mode" width="520"><br><sub>Aligned controls · stable random per repository</sub> |

| Live Cheap LFS pin and restore | Live cloud compression |
| --- | --- |
| <img src="../assets/screenshots/cheap-lfs-ui-acceptance.png" alt="Cheap LFS manager after a live private-repository UI pin with one verified pointer and its Materialize action" width="520"><br><sub>Public/private live GitHub · native picker · pushed pointer history</sub> | <img src="../assets/screenshots/cheap-lfs-cloud-compression.png" alt="Bilingual private-repository Cheap LFS manager with persisted cloud-compression consent, encrypted public-builder routing, and a verified 99.9%-compressed pointer row" width="520"><br><sub>Private opt-in · no private workflow · 99.9% smaller</sub> |

| Detailed Cheap LFS commit progress | Compact Repository Releases at 200% |
| --- | --- |
| <img src="../assets/screenshots/cheap-lfs-commit-progress.png" alt="Changes sidebar with the Large files filter and a three-lane Cheap LFS terminal below Commit" width="520"><br><sub>Three lanes · queue/provider context · timing and ETA · keyboard disclosure</sub> | <img src="../assets/screenshots/material-github-releases-compact.png" alt="Accepted 200% Repository Releases frame from the 100–200% physical-size gate, with a complete first row and compact keyboard-accessible tools" width="520"><br><sub>100–200% gate · complete row · 24-hour time</sub> |

| Live 14.8 GB Bambu Cheap LFS restore |
| --- |
| <img src="../assets/screenshots/cheap-lfs-bambu-build-live.png" alt="Live public Bambu build Cheap LFS inventory with ten tracked Release-backed pointer objects" width="720"><br><sub>8,305 files · four proven UI batches · ten pointers · separate 10/10 clone hash proof</sub> |

<!-- markdownlint-disable MD013 -->

| Current-source automatic updater ready | Historical cross-lane automatic update recovery |
| --- | --- |
| <img src="../assets/screenshots/auto-updater-current-source-ready.png" alt="Current-source About Desktop Material frame showing the automatic updater ready after the real Electron and Squirrel event path downloaded a disclosed verifier-owned inert payload" width="520"><br><sub>Accepted current-source frame · runtime `b069384ad7d8a65d1192ee06859a705fe484c9c8` · promoted `e3967f1b81ec039624500797dca40a1ab6d98598` · 960×660 · 47,086 bytes · SHA-256 `0fc9caf5b13eb5b914121090f403c394545e02ea4303b11dd4598afcb3a2dfca` · development proof, not a published payload<br>目前原始碼畫面已驗收 · 真 Electron/Squirrel 路徑配驗證器自有嘅無害 payload · 唔代表已發佈更新 payload</sub> | <img src="https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/923dbb51acad8f01f01f1c100c6945c7a2e08e23/docs/assets/screenshots/auto-updater-update-ready.png" alt="Historical About Desktop Material frame showing a newer alphabetic-z update ready for a legacy Super Express installation" width="520"><br><sub>Immutable July 22 evidence · legacy s lane → shared z lane · real Squirrel download</sub> |

<!-- markdownlint-enable MD013 -->

Cheap LFS can now install a reviewed, SHA-pinned GitHub Actions caller that
compresses Release objects sequentially without Actions artifacts or caches.
For a confirmed-public repository, Desktop Material automatically prepares the
owned caller in Changes; it starts running only after the user reviews, commits,
and pushes that workflow. Private repositories stay off until the user opts in;
that persisted consent installs no private-repository workflow and spends no
private Actions minutes, routing compression through the encrypted public
builder instead. Failed or non-beneficial objects keep their exact raw pointer
and asset, while successful objects become backward-compatible `part-deflate`
records. Decompression always happens locally in Desktop Material with bounded
expansion plus original part and whole-file SHA-256 verification. The historical
2026-07-22 public and private Actions acceptance converted separate 1 MiB
objects to verified 1,033-byte side assets while retaining their raw historical
assets; both compressed pointers restored to the exact original bytes through
the app.

| Repository workflows | GitHub workflows | Accessibility and shell |
| --- | --- | --- |
| <img src="../assets/screenshots/material-repository-tools.png" alt="Repository Tools administration hub" width="420"><br><sub>Repository Tools</sub> | <img src="../assets/screenshots/material-actions-cache-manager.png" alt="Actions cache manager" width="420"><br><sub>Actions caches</sub> | <img src="../assets/screenshots/material-scale-200-autofit.png" alt="Two hundred percent scale auto-fit without clipping" width="420"><br><sub>200% auto-fit</sub> |
| <img src="../assets/screenshots/material-pull-all-account-fallback.png" alt="Pull All results for several repositories" width="420"><br><sub>Pull All</sub> | <img src="../assets/screenshots/material-native-pull-request.png" alt="Native pull request creation" width="420"><br><sub>Pull requests</sub> | <img src="../assets/screenshots/material-workspace-changes.png" alt="Desktop Material Changes workspace" width="420"><br><sub>Changes workspace</sub> |
| <img src="../assets/screenshots/material-stash-manager.png" alt="Repository-wide stash manager" width="420"><br><sub>Stash manager</sub> | <img src="../assets/screenshots/material-github-issues.png" alt="GitHub issue detail and lifecycle controls" width="420"><br><sub>Issues</sub> | <img src="../assets/screenshots/material-responsive-overflow-fixed.png" alt="Responsive workspace without horizontal clipping" width="420"><br><sub>Responsive clipping gate</sub> |

| Runtime tab search | History commit actions | Repository Tools at the true bottom |
| --- | --- | --- |
| <img src="../assets/screenshots/material-tab-search.png" alt="Runtime repository-tab search matching the active local fixture by name and path" width="420"><br><sub>Search and switch tabs</sub> | <img src="../assets/screenshots/material-history-context-actions.png" alt="History commit row with its named More actions control and hover hint" width="420"><br><sub>Right-click and keyboard-equivalent actions</sub> | <img src="../assets/screenshots/material-repository-tools-scroll.png" alt="Short Repository Tools workspace scrolled to its reachable final results surface" width="420"><br><sub>Verified bottom reachability</sub> |

![History commit hover card showing an exact timestamp and relative age](../assets/screenshots/material-history-hover-time.png)

| History view tabs — List | History view tabs — Graph |
| --- | --- |
| <img src="../assets/screenshots/material-history-view-tabs-list.png" alt="Built Desktop Material History surface with the Commit list tab selected" width="560"><br><sub>Commit list</sub> | <img src="../assets/screenshots/material-history-view-tabs-graph.png" alt="Built Desktop Material History surface with the Graph tab selected" width="560"><br><sub>Graph</sub> |

| GitHub API functions |
| --- |
| <img src="../assets/screenshots/material-github-api-explorer.png" alt="Repository-bound GitHub API functions with runnable buttons and an advanced request builder" width="720"><br><sub>Auto-added read functions · hideable API rail item · reviewed custom requests</sub> |

| Custom repository-logo studio | Named API app functions |
| --- | --- |
| <img src="../assets/screenshots/material-repository-logo-studio.png" alt="Layered custom repository-logo studio with live preview, undo and redo, safe JSON transfer, and repository inheritance" width="520"><br><sub>Safe vector layers · profile default · repository override</sub> | <img src="../assets/screenshots/material-api-app-functions.png" alt="Named API app functions extending the selected repository through reviewed REST and GraphQL definitions" width="520"><br><sub>Versioned definitions · exact binding · reviewed execution</sub> |

| Temporary submodule repository navigation |
| --- |
| <img src="../assets/screenshots/material-submodule-context.png" alt="Initialized submodule opened temporarily in the workspace with a context bar and Back control to the persisted root repository" width="720"><br><sub>No repository import · customizable Back control · root return</sub> |

| Reviewed ordinary Git pull |
| --- |
| <img src="../assets/screenshots/material-pull-preview.png" alt="Reviewed ordinary Git pull showing exact branch identities, incoming commits, changed files, and a clean-worktree confirmation gate" width="720"><br><sub>Fresh fetch · exact reviewed OID · no second fetch</sub> |

| Advanced Git and collaboration workflows |
| --- |
| <img src="../assets/screenshots/advanced-workflows.png" alt="Tag lifecycle workspace showing local, pushed, and remote-only tags with bounded actions" width="720"><br><sub>Local and remote inventory · reviewed mutations · responsive workflow surface</sub> |

| Local Ollama model lifecycle |
| --- |
| <img src="../assets/screenshots/material-ollama-model-manager.png" alt="Ollama model manager with endpoint health, installed and running model inventory, selected model details, and lifecycle actions" width="720"><br><sub>Health · inventory · pull · copy/rename · load/unload · confirmed delete</sub> |

<details>
<summary><strong>Open 31 more verified screenshots</strong></summary>

| Clone and checkout | Repository administration | Accounts and automation |
| --- | --- | --- |
| <img src="../assets/screenshots/material-clone-account-fallback.png" alt="Exact-origin account fallback clone" width="360"><br><sub>Account-aware clone</sub> | <img src="../assets/screenshots/add-submodule-dialog.png" alt="Clone-style Add Submodule dialog reviewing a synthetic URL, checkout path, and tracked branch" width="360"><br><sub>Clone-style submodules</sub> | <img src="../assets/screenshots/material-remote-manager.png" alt="Named remote manager" width="360"><br><sub>Remote manager</sub> |
| <img src="../assets/screenshots/material-shallow-clone-safe.png" alt="Reviewed shallow clone" width="360"><br><sub>Shallow clone</sub> | <img src="../assets/screenshots/material-gitignore-manager.png" alt="Gitignore template manager" width="360"><br><sub>Gitignore manager</sub> | <img src="../assets/screenshots/material-automation.png" alt="Automation settings" width="360"><br><sub>Automation</sub> |
| <img src="../assets/screenshots/material-sparse-checkout-safe.png" alt="Guided sparse checkout with Review active, a locked editor, and the exact normalized selection" width="360"><br><sub>Guided sparse-checkout review</sub> | <img src="../assets/screenshots/material-history-deepening.png" alt="Full history after deepening" width="360"><br><sub>History deepening</sub> | <img src="../assets/screenshots/material-agent-access.png" alt="Local agent access settings" width="360"><br><sub>Agent access</sub> |
| <img src="../assets/screenshots/material-branches-sheet.png" alt="Branches side sheet" width="360"><br><sub>Branches</sub> | <img src="../assets/screenshots/material-repositories-sheet.png" alt="Dark repository side sheet with collapsed Filters and compact Add, Select, and More actions" width="360"><br><sub>Collapsible repository filters</sub> | <img src="../assets/screenshots/material-publish-organization-picker.png" alt="Bilingual Publish repository dialog with a searchable, contained organization owner listbox" width="360"><br><sub>Searchable publish owner</sub> |
| <img src="../assets/screenshots/material-history-power-tools.png" alt="History search and graph" width="360"><br><sub>History search</sub> | <img src="../assets/screenshots/material-branch-merge-all.png" alt="Merge all progress" width="360"><br><sub>Merge All</sub> | <img src="../assets/screenshots/material-multi-window-menu.png" alt="Open repository in a new window" width="360"><br><sub>Multi-window</sub> |
| <img src="../assets/screenshots/material-notification-bulk-actions.png" alt="Filtered Local notification centre with visible selection and bulk actions" width="360"><br><sub>Bulk notification triage</sub> |  |  |
| <img src="../assets/screenshots/regex-builder.png" alt="Safe RE2 builder with bounded live matches and captures" width="360"><br><sub>Safe regex builder</sub> | <img src="../assets/screenshots/settings-history-manager.png" alt="Settings history side sheet" width="360"><br><sub>Settings history</sub> | <img src="../assets/screenshots/material-error-notice.png" alt="Bottom-right Git lock error notice with a Remove lock file recovery action" width="360"><br><sub>Stale-lock recovery</sub> |

| Pull requests and rules | Actions | Releases, issues, and providers |
| --- | --- | --- |
| <img src="../assets/screenshots/material-create-pull-request.png" alt="Create pull request success" width="360"><br><sub>Create pull request</sub> | <img src="../assets/screenshots/material-actions-job-log.png" alt="Searchable Actions job log" width="360"><br><sub>Job log</sub> | <img src="../assets/screenshots/material-github-releases.png" alt="Releases dashboard with status summary and selected release metadata" width="360"><br><sub>Releases dashboard</sub> |
| <img src="../assets/screenshots/material-effective-branch-rules.png" alt="Effective branch rules" width="360"><br><sub>Branch rules</sub> | <img src="../assets/screenshots/material-actions-artifact-download.png" alt="Actions artifact download and digest" width="360"><br><sub>Artifact download</sub> | <img src="../assets/screenshots/material-provider-triage.png" alt="Provider-neutral triage" width="360"><br><sub>Provider triage</sub> |
| <img src="../assets/screenshots/material-actions-pending-deployments.png" alt="Pending deployment review" width="360"><br><sub>Deployment review</sub> | <img src="../assets/screenshots/material-actions-pagination.png" alt="Actions run pagination" width="360"><br><sub>Run pagination</sub> | <img src="../assets/screenshots/material-github-notifications.png" alt="GitHub notifications" width="360"><br><sub>GitHub notifications</sub> |
| <img src="../assets/screenshots/material-actions-jobs-pagination.png" alt="Attempt-aware Actions jobs" width="360"><br><sub>Attempt-aware jobs</sub> | <img src="../assets/screenshots/material-actions-artifact-page-two.png" alt="Actions artifact page two" width="360"><br><sub>Artifact pagination</sub> | <img src="../assets/screenshots/material-actions-artifacts.png" alt="Actions artifact provenance details" width="360"><br><sub>Artifact provenance</sub> |

</details>
