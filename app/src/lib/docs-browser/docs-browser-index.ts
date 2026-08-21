/**
 * Feature-article titles, without their bodies.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: yarn generate-docs-browser-bundle
 *
 * Built from the real Markdown tree under `docs/features`.
 * `app/test/unit/docs-browser-bundle-test.ts` fails when this file has
 * drifted from the files on disk, so an article added, renamed, retitled or
 * reworded without a regeneration is caught before it ships.
 */

import {
  IDocsBrowserArticleSummary,
  IDocsBrowserCategory,
} from './docs-browser-types'

/**
 * One summary per bundled article, ordered by article id.
 *
 * The command palette offers a row per article and must not drag a megabyte
 * of prose into every module that imports the palette catalog, so it reads
 * this rather than the bundle itself.
 */
export const DocsBrowserArticleSummaries: ReadonlyArray<IDocsBrowserArticleSummary> =
  [
    {
      id: 'agent-api/local-agent-http-api',
      category: 'agent-api',
      title: 'Local Agent HTTP API',
      description:
        'Desktop Material ships an opt-in Agent API for trusted automation. The main process owns one versioned command contract and publishes it through a REST compatibility surface…',
      sourcePath: 'docs/features/agent-api/local-agent-http-api.md',
    },
    {
      id: 'agent-api/README',
      category: 'agent-api',
      title: 'Agent API / Agent API',
      description:
        "Desktop Material's Agent API is the product-owned HTTP surface for trusted automation clients. It exposes the same versioned command contract through REST and MCP, with a…",
      sourcePath: 'docs/features/agent-api/README.md',
    },
    {
      id: 'collaboration/fork-branch-checkout',
      category: 'collaboration',
      title: 'Checkout branches from other forks',
      description:
        "Desktop Material's Branches side sheet includes Checkout from another fork… for authenticated GitHub repositories. The workflow discovers visible forks in the repository…",
      sourcePath: 'docs/features/collaboration/fork-branch-checkout.md',
    },
    {
      id: 'collaboration/offline-github-projects',
      category: 'collaboration',
      title: 'Offline GitHub Projects workspace',
      description:
        'Desktop Material exposes GitHub Projects inside the repository Tools hub for repositories associated with a GitHub account. The workspace is deliberately read-only: it can…',
      sourcePath: 'docs/features/collaboration/offline-github-projects.md',
    },
    {
      id: 'collaboration/pull-request-activity-notifications',
      category: 'collaboration',
      title: 'Pull-request activity notifications',
      description:
        'Desktop Material raises operating-system notifications for relevant pull request review submissions, issue/review comments, and failed checks received through its live provider…',
      sourcePath:
        'docs/features/collaboration/pull-request-activity-notifications.md',
    },
    {
      id: 'collaboration/pull-request-context-and-actions',
      category: 'collaboration',
      title: 'Rich pull-request context and actions',
      description:
        'The pull-request workspace keeps the exact base/head repository, branch, head object ID, author, draft/state, mergeability, checks, files, commits, reviews, issue comments, and…',
      sourcePath:
        'docs/features/collaboration/pull-request-context-and-actions.md',
    },
    {
      id: 'collaboration/pull-request-creation',
      category: 'collaboration',
      title: 'Native pull request creation',
      description:
        'Desktop Material can compose and create a GitHub pull request without exposing a raw REST editor or handing reviewed content to a browser form. The dialog is bound to the…',
      sourcePath: 'docs/features/collaboration/pull-request-creation.md',
    },
    {
      id: 'collaboration/pull-request-review-workspace',
      category: 'collaboration',
      title: 'Native pull request review workspace',
      description:
        "Open a pull request's context menu and choose Manage Pull Request… to load a single account-bound workspace. A fixed header names the current pull request, shows an Open,…",
      sourcePath:
        'docs/features/collaboration/pull-request-review-workspace.md',
    },
    {
      id: 'collaboration/README',
      category: 'collaboration',
      title: 'Collaboration features / 協作功能',
      description:
        'This category documents provider-backed workflows that let contributors review and manage collaboration state without leaving Desktop Material.',
      sourcePath: 'docs/features/collaboration/README.md',
    },
    {
      id: 'collaboration/self-hosted-server-wizard',
      category: 'collaboration',
      title: 'Self-hosted server wizard',
      description:
        "The Windows Preferences wizard provisions the repository's own services/desktop-material-server container. The main process owns the Docker and filesystem operations; the…",
      sourcePath: 'docs/features/collaboration/self-hosted-server-wizard.md',
    },
    {
      id: 'design-system/attention-accommodations',
      category: 'design-system',
      title: 'Attention accommodations',
      description:
        'Desktop Material provides five independently toggleable interface accommodations in Settings → Attention accommodations. They are all off by default, persist locally, and do…',
      sourcePath: 'docs/features/design-system/attention-accommodations.md',
    },
    {
      id: 'design-system/audio-system',
      category: 'design-system',
      title: 'Audio system (narrator, sound effects, per-repository music)',
      description:
        'An optional, settings-gated audio layer. Every part is off by default and designed never to become annoying. Three cooperating parts:',
      sourcePath: 'docs/features/design-system/audio-system.md',
    },
    {
      id: 'design-system/command-palette-appearance',
      category: 'design-system',
      title: 'Command palette rows and appearance',
      description:
        "The Ctrl+Shift+F command palette lists every named app function; that is the accelerator the application menu registers for command-palette, and the MD3 shell header's palette…",
      sourcePath: 'docs/features/design-system/command-palette-appearance.md',
    },
    {
      id: 'design-system/command-palette-coverage-gaps',
      category: 'design-system',
      title: 'Command palette coverage',
      description:
        'The shipped catalog currently contains 268 unique commands. The R5 command-palette expansion (see below) added 21 of those: tab management…',
      sourcePath:
        'docs/features/design-system/command-palette-coverage-gaps.md',
    },
    {
      id: 'design-system/command-palette-full-coverage',
      category: 'design-system',
      title: 'Command palette: full-app coverage, rich controls and teleport',
      description:
        "The Ctrl+Shift+F master command palette is Material Design 3's full-screen search view. That is the accelerator the application menu actually registers for the command-palette…",
      sourcePath:
        'docs/features/design-system/command-palette-full-coverage.md',
    },
    {
      id: 'design-system/destructive-action-gate',
      category: 'design-system',
      title: 'Destructive-action super confirmation / 破壞性操作嘅雙匙閘',
      description:
        'Every action in Desktop Material that destroys something, or that cannot be taken back from inside the app, is authorized through one shared gate:…',
      sourcePath: 'docs/features/design-system/destructive-action-gate.md',
    },
    {
      id: 'design-system/dialog-emoji-decoration',
      category: 'design-system',
      title: 'Show emojis in dialogs and message boxes',
      description:
        "A persisted, per-profile switch on Settings → Appearance that puts one decorative emoji beside a dialog's title. Turn it off and the same dialog says exactly the same words…",
      sourcePath: 'docs/features/design-system/dialog-emoji-decoration.md',
    },
    {
      id: 'design-system/dialog-wheel-scrolling',
      category: 'design-system',
      title: 'Dialog wheel and trackpad scrolling',
      description:
        "Desktop Material's floating dialogs accept vertical mouse-wheel and trackpad gestures anywhere over their scrollable content. Users no longer need to aim at the narrow…",
      sourcePath: 'docs/features/design-system/dialog-wheel-scrolling.md',
    },
    {
      id: 'design-system/dim-sum-surprise',
      category: 'design-system',
      title: 'The dim sum surprise',
      description:
        'Roughly one launch in ten, Desktop Material puts a small photograph of a Hong Kong dim sum dish in the bottom-left corner, names it in English and Traditional Chinese, and…',
      sourcePath: 'docs/features/design-system/dim-sum-surprise.md',
    },
    {
      id: 'design-system/material-design-3-site',
      category: 'design-system',
      title: 'The Material Design 3 site',
      description:
        'The published site at is a full Material Design 3 rebuild of the landing page, the Cheap LFS guide, the Cheap LFS versus Git LFS atlas, and the documentation front end. It is a',
      sourcePath: 'docs/features/design-system/material-design-3-site.md',
    },
    {
      id: 'design-system/material-ripple-and-theme-reveal',
      category: 'design-system',
      title: 'Material ripple state layer and theme reveal pulse',
      description:
        "Desktop Material mirrors the Desktop Material v2.dc.html prototype's two app-wide motion primitives:",
      sourcePath:
        'docs/features/design-system/material-ripple-and-theme-reveal.md',
    },
    {
      id: 'design-system/md3-shell',
      category: 'design-system',
      title: 'The Material Design 3 shell — RETIRED',
      description:
        'The application chrome, rewritten against design/History MD3.dc.html and assembled as one component. Md3Shell (app/src/ui/md3/md3-shell.tsx) is what App.renderApp() renders: a…',
      sourcePath: 'docs/features/design-system/md3-shell.md',
    },
    {
      id: 'design-system/narration-assets',
      category: 'design-system',
      title: 'Recorded narration + melody assets',
      description:
        'Wires the 244 pre-generated audio assets in app/static/audio/ into the optional audio runtime, so meaningful events can play a recorded human-style voice line and a composed…',
      sourcePath: 'docs/features/design-system/narration-assets.md',
    },
    {
      id: 'design-system/narrator-voice',
      category: 'design-system',
      title: 'Narrator voice',
      description:
        'Which voice reads app events aloud, chosen per language on Settings → Sound → Narrator. English and Cantonese pick separately, and either can be left to the app.',
      sourcePath: 'docs/features/design-system/narrator-voice.md',
    },
    {
      id: 'design-system/offline-documentation-browser',
      category: 'design-system',
      title: 'Offline documentation browser',
      description:
        'Every feature article in docs/features ships inside the application. Help → Feature documentation (or the command palette) opens a browser that lists all of them, searches…',
      sourcePath:
        'docs/features/design-system/offline-documentation-browser.md',
    },
    {
      id: 'design-system/personal-vocabulary',
      category: 'design-system',
      title: 'Personal vocabulary',
      description:
        'A local JSON file that renames the words this app shows you. Load it from Settings → Appearance → Personal vocabulary. Nothing ships with it, nothing is uploaded, and until you…',
      sourcePath: 'docs/features/design-system/personal-vocabulary.md',
    },
    {
      id: 'design-system/README',
      category: 'design-system',
      title: 'Design-system features / 設計系統功能',
      description: 'Attention accommodations — five independent,',
      sourcePath: 'docs/features/design-system/README.md',
    },
    {
      id: 'design-system/repository-theme-music',
      category: 'design-system',
      title: 'Repository-themed music',
      description:
        "Every repository gets its own recognizable, looping background theme — without shipping or downloading a single audio file. A stable hash of the repository's identity seeds a…",
      sourcePath: 'docs/features/design-system/repository-theme-music.md',
    },
    {
      id: 'design-system/school-mode',
      category: 'design-system',
      title: 'School mode',
      description:
        'School mode is a persisted, user-renamable presentation lock in Settings → Appearance. It keeps the application in English and temporarily removes the language, playfulness,…',
      sourcePath: 'docs/features/design-system/school-mode.md',
    },
    {
      id: 'design-system/sfx-event-mapping',
      category: 'design-system',
      title: 'Distinct sound-effect event mapping',
      description:
        'Builds on the audio system to give each meaningful app event its own recognizable sound effect instead of routing everything through the shared commit / auto-commit cue. It…',
      sourcePath: 'docs/features/design-system/sfx-event-mapping.md',
    },
    {
      id: 'design-system/status-hub',
      category: 'design-system',
      title: 'Status Hub projection',
      description:
        "The existing Agents sidebar is the desktop surface for the current repository's agent-session fleet. It shows a compact status line supplied by a main-process Status Hub…",
      sourcePath: 'docs/features/design-system/status-hub.md',
    },
    {
      id: 'design-system/surface-locks',
      category: 'design-system',
      title: 'Surface locks / 版面鎖',
      description:
        'A for-fun password or one-time-password speed bump on a tab, a tab group, or any appearance value. Off by default, opt-in per surface, and never described as security.',
      sourcePath: 'docs/features/design-system/surface-locks.md',
    },
    {
      id: 'design-system/tone-funny-level',
      category: 'design-system',
      title: 'Tone: the per-language funny-level sliders',
      description:
        "Two independent sliders — one for English, one for Cantonese — set how playful the app's copy reads, from 1 (fully serious) to 5 (maximum playfulness). They live on Settings →…",
      sourcePath: 'docs/features/design-system/tone-funny-level.md',
    },
    {
      id: 'design-system/universal-feature-completeness-inventory',
      category: 'design-system',
      title: 'Universal-feature completeness inventory',
      description:
        "The universal-feature completeness inventory is the repository's explicit map from each required user-facing feature to each user-facing surface that must ship it. It prevents…",
      sourcePath:
        'docs/features/design-system/universal-feature-completeness-inventory.md',
    },
    {
      id: 'design-system/unlock-ladder',
      category: 'design-system',
      title: 'Unlock ladder / 解鎖梯',
      description:
        'The lockout ladder is a wait-recovery surface. It gives a locked-out person a bounded activity that may clear the current waiting state, while leaving the credential and the…',
      sourcePath: 'docs/features/design-system/unlock-ladder.md',
    },
    {
      id: 'github-desktop-demand-backlog',
      category: 'root',
      title: 'GitHub Desktop demand backlog coverage',
      description:
        'This ledger maps the 30 user-demand statements in the supplied research brief to their Desktop Material implementation and feature contract. Complete means the behavior is…',
      sourcePath: 'docs/features/github-desktop-demand-backlog.md',
    },
    {
      id: 'identity-and-workspace/authenticator-and-qr-registration',
      category: 'identity-and-workspace',
      title: 'The built-in authenticator and QR pairing / 內置驗證器同 QR 配對',
      description:
        'Desktop Material ships its own TOTP authenticator: a place to register and keep second factors for whatever accounts the user likes, and to read live codes without reaching for…',
      sourcePath:
        'docs/features/identity-and-workspace/authenticator-and-qr-registration.md',
    },
    {
      id: 'identity-and-workspace/branch-switcher-workflows',
      category: 'identity-and-workspace',
      title: 'Branch switcher workflows',
      description:
        'The branch sheet combines local and remote branches with text filtering, recent branches, default-branch context, activity/alphabetical sorting, and explicit hidden/solo…',
      sourcePath:
        'docs/features/identity-and-workspace/branch-switcher-workflows.md',
    },
    {
      id: 'identity-and-workspace/collection-bulk-and-regex-safety',
      category: 'identity-and-workspace',
      title: 'Collection bulk actions and regex safety',
      description:
        'Desktop Material gives collection search fields one shared fuzzy, substring, and regular-expression contract. A tracked registry maps each real search input to a stable surface…',
      sourcePath:
        'docs/features/identity-and-workspace/collection-bulk-and-regex-safety.md',
    },
    {
      id: 'identity-and-workspace/multiple-accounts-and-repository-identity',
      category: 'identity-and-workspace',
      title: 'Multiple accounts and repository identity',
      description:
        'Desktop Material can retain multiple GitHub.com identities, multiple accounts on one Enterprise host, and GitLab or Bitbucket identities. Account metadata is stored separately…',
      sourcePath:
        'docs/features/identity-and-workspace/multiple-accounts-and-repository-identity.md',
    },
    {
      id: 'identity-and-workspace/owner-scoped-appearance-and-history',
      category: 'identity-and-workspace',
      title: 'Owner-scoped appearance and history',
      description:
        'Desktop Material attaches appearance controls to the element that owns the setting. Shift+right-click, the keyboard Context Menu key, or Shift+F10 opens an anchored editor…',
      sourcePath:
        'docs/features/identity-and-workspace/owner-scoped-appearance-and-history.md',
    },
    {
      id: 'identity-and-workspace/README',
      category: 'identity-and-workspace',
      title: 'Identity and workspace features / 身分同工作區功能',
      description:
        'This category covers account selection and fast navigation when one Desktop Material installation manages many identities, repositories, and branches.',
      sourcePath: 'docs/features/identity-and-workspace/README.md',
    },
    {
      id: 'identity-and-workspace/repository-sidebar-and-pinning',
      category: 'identity-and-workspace',
      title: 'Repository sidebar and pinning',
      description:
        'The repository sheet is a searchable workspace switcher rather than a flat recent list. It groups pinned repositories first, can show or hide the Recent group, and keeps…',
      sourcePath:
        'docs/features/identity-and-workspace/repository-sidebar-and-pinning.md',
    },
    {
      id: 'identity-and-workspace/scheduled-settings',
      category: 'identity-and-workspace',
      title: 'Scheduled language, appearance, and external settings',
      description:
        'Desktop Material can apply a settings value during a local date-and-time window. A rule can change the language presentation, theme, and appearance customizations together or…',
      sourcePath: 'docs/features/identity-and-workspace/scheduled-settings.md',
    },
    {
      id: 'identity-and-workspace/settings-browser-tabs',
      category: 'identity-and-workspace',
      title: 'Browser-style settings tabs',
      description:
        'Global Settings, Repository Settings, and Stash Manager use the same horizontal browser-style tab surface. Each page has a stable identity, a visible active state, a close…',
      sourcePath:
        'docs/features/identity-and-workspace/settings-browser-tabs.md',
    },
    {
      id: 'identity-and-workspace/settings-search',
      category: 'identity-and-workspace',
      title: 'Settings search / 設定搜尋',
      description:
        "A search box at the top of the Settings (Preferences) dialog's left rail lets you find a setting by name, description, or keyword across every tab, and jump straight to the tab…",
      sourcePath: 'docs/features/identity-and-workspace/settings-search.md',
    },
    {
      id: 'identity-and-workspace/settings-tab-docking',
      category: 'identity-and-workspace',
      title: 'Settings tab docking',
      description:
        'Repository Settings and application Settings use the same browser-style tab strip. The strip can be docked on the left, top, bottom, or right of its content. Left is the…',
      sourcePath:
        'docs/features/identity-and-workspace/settings-tab-docking.md',
    },
    {
      id: 'identity-and-workspace/support-tickets',
      category: 'identity-and-workspace',
      title:
        'Support Tickets: the local recovery desk / Support Tickets：本機支援櫃檯',
      description:
        'Desktop Material ships several for-fun locks — a tab a user can put behind a password, an appearance property behind an OTP, the renamable presentation lock in settings. Every…',
      sourcePath: 'docs/features/identity-and-workspace/support-tickets.md',
    },
    {
      id: 'identity-and-workspace/tab-groups',
      category: 'identity-and-workspace',
      title: 'Tab groups',
      description:
        'Repository tabs can be collected into named, colored groups. A group is an organizational label over the existing strip: it never changes what a tab does, never closes a tab,…',
      sourcePath: 'docs/features/identity-and-workspace/tab-groups.md',
    },
    {
      id: 'identity-and-workspace/tab-overflow-dropdown',
      category: 'identity-and-workspace',
      title: 'Tab-strip overflow dropdown',
      description:
        'When more repository tabs are open than the strip can show, the tabs that do not fit move into a "more tabs" dropdown instead of being clipped or reachable only by horizontal…',
      sourcePath:
        'docs/features/identity-and-workspace/tab-overflow-dropdown.md',
    },
    {
      id: 'identity-and-workspace/tab-strip-settings-commit-chip',
      category: 'identity-and-workspace',
      title: 'Tab-strip settings commit chip',
      description:
        "The repository tab strip's trailing cluster carries the signature per-account settings-repo feedback from the v2 design: a persistent commit chip, a Settings-history entry…",
      sourcePath:
        'docs/features/identity-and-workspace/tab-strip-settings-commit-chip.md',
    },
    {
      id: 'integrations/actions-workflow-manager',
      category: 'integrations',
      title: 'Actions workflow manager',
      description:
        'The Workflows tab of the Actions view lists every workflow in the repository, with a switch per row to enable or disable it, a filter bar wired to the full regex builder, and —…',
      sourcePath: 'docs/features/integrations/actions-workflow-manager.md',
    },
    {
      id: 'integrations/app-hosted-browser',
      category: 'integrations',
      title: 'App-hosted browser',
      description:
        'Desktop Material can open browser-bound HTTP and HTTPS links in a dedicated app-hosted window instead of always handing them to the system browser. The window supplies a URL…',
      sourcePath: 'docs/features/integrations/app-hosted-browser.md',
    },
    {
      id: 'integrations/automated-updates-and-release-notes',
      category: 'integrations',
      title: 'Automated update build status and release notes',
      description:
        'Desktop Material distinguishes an available Windows update from a newer commit that GitHub Actions is still packaging. Automated GitHub Releases also explain which exact…',
      sourcePath:
        'docs/features/integrations/automated-updates-and-release-notes.md',
    },
    {
      id: 'integrations/broad-editor-support',
      category: 'integrations',
      title: 'Broad editor support',
      description:
        "Desktop Material's supported Windows catalog includes Visual Studio Code/VSCodium variants, JetBrains IDEs, Sublime Text, Vim/Neovim front ends, and other Windows editors.…",
      sourcePath: 'docs/features/integrations/broad-editor-support.md',
    },
    {
      id: 'integrations/browser-extension-downloads',
      category: 'integrations',
      title: 'Browser-extension download handoff',
      description:
        'Desktop Material now owns the Windows desktop surfaces and bounded message contract for a browser-extension download handoff. It does not currently ship a browser extension or…',
      sourcePath: 'docs/features/integrations/browser-extension-downloads.md',
    },
    {
      id: 'integrations/build-run-output-controls',
      category: 'integrations',
      title: 'Build & Run output controls',
      description:
        'The Build & Run log panel keeps long-running compiler and test output readable without changing or discarding the underlying stream. Three header controls let the user jump to…',
      sourcePath: 'docs/features/integrations/build-run-output-controls.md',
    },
    {
      id: 'integrations/copilot-commit-message-controls',
      category: 'integrations',
      title: 'Copilot commit-message controls',
      description:
        'Eligible signed-in users can ask Copilot to draft a commit title and optional description from the currently included diff. The generated marker is cleared as soon as the user…',
      sourcePath:
        'docs/features/integrations/copilot-commit-message-controls.md',
    },
    {
      id: 'integrations/custom-git-command-presets',
      category: 'integrations',
      title: 'Custom Git command presets',
      description:
        'Repository Tools provides a controlled extensibility point for commands that are useful to a team member but too personal or specialized for a permanent toolbar button. A…',
      sourcePath: 'docs/features/integrations/custom-git-command-presets.md',
    },
    {
      id: 'integrations/duplicate-open-guard',
      category: 'integrations',
      title: 'Duplicate-open guard',
      description:
        'Handing a path to something outside Desktop Material — an external editor, a terminal, the file manager, or the system default application — spawns a process, and none of those…',
      sourcePath: 'docs/features/integrations/duplicate-open-guard.md',
    },
    {
      id: 'integrations/editor-discovery-and-one-click-opening',
      category: 'integrations',
      title: 'Editor discovery and one-click opening',
      description:
        'Desktop Material discovers a broad curated set of installed Windows editors, including Visual Studio Code/VSCodium variants, JetBrains IDEs, Sublime Text, and Vim/Neovim front…',
      sourcePath:
        'docs/features/integrations/editor-discovery-and-one-click-opening.md',
    },
    {
      id: 'integrations/gh-cli-push-fallback',
      category: 'integrations',
      title: 'GitHub CLI push credential fallback',
      description:
        'When a push to an organization-owned GitHub or GitHub Enterprise Server (GHES) repository is rejected for authentication reasons, Desktop Material can retry the push exactly…',
      sourcePath: 'docs/features/integrations/gh-cli-push-fallback.md',
    },
    {
      id: 'integrations/github-api-functions',
      category: 'integrations',
      title: 'Repository-bound GitHub API functions',
      description:
        'Desktop Material automatically adds a small set of safe, read-only GitHub API functions to an eligible repository the first time its API functions surface is opened. The…',
      sourcePath: 'docs/features/integrations/github-api-functions.md',
    },
    {
      id: 'integrations/github-oauth-login',
      category: 'integrations',
      title: 'GitHub OAuth login',
      description:
        'Desktop Material uses the same GitHub OAuth request shape as the upstream GitHub Desktop client. The authorization request supplies the registered client ID, bounded feature…',
      sourcePath: 'docs/features/integrations/github-oauth-login.md',
    },
    {
      id: 'integrations/github-packages-explorer',
      category: 'integrations',
      title: 'Per-repository GitHub Packages explorer',
      description:
        "Desktop Material exposes GitHub Packages beside Releases in the selected repository's Distribution surface. The explorer keeps the repository's chosen GitHub account and…",
      sourcePath: 'docs/features/integrations/github-packages-explorer.md',
    },
    {
      id: 'integrations/gitlab-merge-request',
      category: 'integrations',
      title: 'GitLab merge requests',
      description:
        'Desktop Material can create, review, and manage GitLab merge requests natively for a repository whose selected account is a GitLab or self-hosted GitLab account, without…',
      sourcePath: 'docs/features/integrations/gitlab-merge-request.md',
    },
    {
      id: 'integrations/global-ignore-management',
      category: 'integrations',
      title: 'Global ignore management',
      description:
        "Open Settings → Git → Global ignore to manage rules that should apply to every local repository. Desktop Material reads Git's effective core.excludesFile; when none is…",
      sourcePath: 'docs/features/integrations/global-ignore-management.md',
    },
    {
      id: 'integrations/local-actions-runner',
      category: 'integrations',
      title: 'Local GitHub Actions runner',
      description:
        "Run a repository's GitHub Actions workflows on your own machine before pushing, using act driving Docker. The feature discovers and parses the workflows under…",
      sourcePath: 'docs/features/integrations/local-actions-runner.md',
    },
    {
      id: 'integrations/local-ai-build-fix',
      category: 'integrations',
      title: 'Local AI build repair with Codex or OpenCode',
      description:
        'Desktop Material can hand a failed Build & Run stage, or a free-form repository request, to either the Codex CLI or OpenCode. The provider choice is stored with that repository…',
      sourcePath: 'docs/features/integrations/local-ai-build-fix.md',
    },
    {
      id: 'integrations/local-file-converter',
      category: 'integrations',
      title: 'Local file converter',
      description:
        'Desktop Material is establishing a local file-converter workspace for files a person chooses from their own machine. The workspace must identify source bytes before offering a…',
      sourcePath: 'docs/features/integrations/local-file-converter.md',
    },
    {
      id: 'integrations/ollama-model-manager',
      category: 'integrations',
      title: 'Ollama model manager',
      description:
        'Desktop Material manages an Ollama provider without exposing the native API as a free-form request editor. There are two ways in.',
      sourcePath: 'docs/features/integrations/ollama-model-manager.md',
    },
    {
      id: 'integrations/one-click-editor-actions',
      category: 'integrations',
      title: 'One-click editor actions',
      description:
        'The selected external editor is one action away from repository rows, the Changes empty state, changed-file context menus, conflict rows, and the diff header. File actions pass…',
      sourcePath: 'docs/features/integrations/one-click-editor-actions.md',
    },
    {
      id: 'integrations/README',
      category: 'integrations',
      title: 'Integrations / 整合',
      description:
        'Desktop Material integration features connect Git workflows to operating-system, editor, shell, provider, and user-level Git configuration without placing credentials or…',
      sourcePath: 'docs/features/integrations/README.md',
    },
    {
      id: 'integrations/repository-releases-dashboard',
      category: 'integrations',
      title: 'Repository Releases dashboard',
      description:
        'Open Releases from a GitHub repository rail to search and status-filter the bounded loaded catalog, select a release, inspect metadata and assets, or enter the existing…',
      sourcePath: 'docs/features/integrations/repository-releases-dashboard.md',
    },
    {
      id: 'integrations/root-windows-dependency-fetcher',
      category: 'integrations',
      title: 'Root Windows dependency fetcher / 根目錄 Windows 依賴擷取器',
      description:
        'The repository root now carries download-dependencies.bat, a one-click, repeatable preparation path for a clean Windows checkout. It accepts /s, --silent, or SILENT=1; silent…',
      sourcePath:
        'docs/features/integrations/root-windows-dependency-fetcher.md',
    },
    {
      id: 'integrations/self-hosted-runner-manager',
      category: 'integrations',
      title: 'Self-hosted GitHub Actions runner manager',
      description:
        'Desktop Material can set up and control a repository-scoped GitHub Actions runner on the Windows computer that is running the app. The manager lives in the repository Actions…',
      sourcePath: 'docs/features/integrations/self-hosted-runner-manager.md',
    },
    {
      id: 'integrations/self-hosted-windows-dependency-bootstrap',
      category: 'integrations',
      title: 'Self-hosted Windows dependency bootstrap',
      description:
        'Every self-hosted Windows job bootstraps its declared dependencies before it builds, tests, packages, or publishes. A warm runner may reuse compatible tools and exact…',
      sourcePath:
        'docs/features/integrations/self-hosted-windows-dependency-bootstrap.md',
    },
    {
      id: 'integrations/ssh-working-copy-and-remote-clone',
      category: 'integrations',
      title: 'SSH working copies and remote clone',
      description:
        'Repository Settings → Remote includes an SSH Working Copy manager for a canonical checkout on a chosen host. After saving and testing non-secret host metadata, a user can clone…',
      sourcePath:
        'docs/features/integrations/ssh-working-copy-and-remote-clone.md',
    },
    {
      id: 'integrations/windows-explorer-context-menu',
      category: 'integrations',
      title: 'Windows Explorer context menu and quick-action window',
      description:
        'Adds Desktop Material actions to the File Explorer right-click menu on folders and folder backgrounds, and gives those actions a small dedicated window instead of booting the…',
      sourcePath: 'docs/features/integrations/windows-explorer-context-menu.md',
    },
    {
      id: 'integrations/windows-only-platform-support',
      category: 'integrations',
      title: 'Windows-only product support',
      description:
        'Desktop Material is a Windows-only application. Windows is its only supported runtime, build, packaging, installer, release, and end-to-end acceptance environment. Source…',
      sourcePath: 'docs/features/integrations/windows-only-platform-support.md',
    },
    {
      id: 'integrations/wsl-aware-editor-opening',
      category: 'integrations',
      title: 'WSL-aware editor opening',
      description:
        'On Windows, installed Visual Studio Code editions gain one editor choice per detected Windows Subsystem for Linux distribution, for example Visual Studio Code — WSL: Ubuntu.…',
      sourcePath: 'docs/features/integrations/wsl-aware-editor-opening.md',
    },
    {
      id: 'linux-tui/architecture-and-persistence',
      category: 'linux-tui',
      title: 'TUI architecture and XDG persistence',
      description: 'The terminal edition separates:',
      sourcePath: 'docs/features/linux-tui/architecture-and-persistence.md',
    },
    {
      id: 'linux-tui/cheap-lfs',
      category: 'linux-tui',
      title: 'Cheap LFS in the terminal edition',
      description:
        'The Linux-first terminal edition can inspect, create, verify, and restore the same desktop-material/cheap-lfs/v1 GitHub Release pointers as the Windows graphical edition. It is…',
      sourcePath: 'docs/features/linux-tui/cheap-lfs.md',
    },
    {
      id: 'linux-tui/cheap-lfs-git-wrapper',
      category: 'linux-tui',
      title: 'Cheap LFS-aware Git CLI wrapper',
      description:
        'github exposes an argv-preserving Git wrapper alongside the interactive TUI:',
      sourcePath: 'docs/features/linux-tui/cheap-lfs-git-wrapper.md',
    },
    {
      id: 'linux-tui/container',
      category: 'linux-tui',
      title: 'Linux TUI container',
      description:
        'Desktop Material TUI ships a minimal multi-stage tui/Dockerfile for users who prefer an isolated Linux runtime. The builder creates a wheel from the local checkout, installs…',
      sourcePath: 'docs/features/linux-tui/container.md',
    },
    {
      id: 'linux-tui/external-editor-and-version-history',
      category: 'linux-tui',
      title: 'TUI external editor and local version history',
      description:
        "Settings includes editable editor and terminal command preferences plus editor detection. The toolbar's Editor action opens the active repository with the chosen program. The…",
      sourcePath:
        'docs/features/linux-tui/external-editor-and-version-history.md',
    },
    {
      id: 'linux-tui/file-browser',
      category: 'linux-tui',
      title: 'Repository file browser',
      description:
        'The Files workspace tab is a first-class, terminal-native browser for the active repository. It lists the real working tree, filters paths locally, shows a bounded preview, and…',
      sourcePath: 'docs/features/linux-tui/file-browser.md',
    },
    {
      id: 'linux-tui/github-workflows',
      category: 'linux-tui',
      title: 'TUI GitHub workflows',
      description:
        "GitHub features use the installed gh executable. Authenticate outside the app with the GitHub CLI's normal device/browser flow:",
      sourcePath: 'docs/features/linux-tui/github-workflows.md',
    },
    {
      id: 'linux-tui/install-and-packaging',
      category: 'linux-tui',
      title: 'Linux TUI installation and packaging',
      description:
        'x86-64 or ARM64 GNU/Linux with glibc (musl is not currently compatible with',
      sourcePath: 'docs/features/linux-tui/install-and-packaging.md',
    },
    {
      id: 'linux-tui/interaction-and-accessibility',
      category: 'linux-tui',
      title: 'TUI interaction and accessibility',
      description:
        'Mouse support is enabled when the application starts. In a compatible terminal, a user can:',
      sourcePath: 'docs/features/linux-tui/interaction-and-accessibility.md',
    },
    {
      id: 'linux-tui/language-appearance-notifications',
      category: 'linux-tui',
      title: 'TUI language, appearance, and notifications',
      description:
        'Settings persists exactly three application language modes:',
      sourcePath:
        'docs/features/linux-tui/language-appearance-notifications.md',
    },
    {
      id: 'linux-tui/README',
      category: 'linux-tui',
      title:
        'Linux TUI — revived August 2, 2026 / Linux TUI — 2026 年 8 月 2 日復活',
      description:
        "Desktop Material TUI is a separate terminal-native application built with Textual. It targets Linux first and shares the desktop edition's repository, Git, GitHub, search,…",
      sourcePath: 'docs/features/linux-tui/README.md',
    },
    {
      id: 'linux-tui/repositories-and-git',
      category: 'linux-tui',
      title: 'TUI repository and Git workflows',
      description: 'The repository rail supports:',
      sourcePath: 'docs/features/linux-tui/repositories-and-git.md',
    },
    {
      id: 'linux-tui/repository-path-browser',
      category: 'linux-tui',
      title: 'Repository path browser and quoted paste',
      description:
        "The terminal edition's Open repository, Create repository, and Clone repository dialogs combine a real editable path field with a terminal-native folder browser. A user can…",
      sourcePath: 'docs/features/linux-tui/repository-path-browser.md',
    },
    {
      id: 'linux-tui/repository-tabs',
      category: 'linux-tui',
      title: 'Repository tabs and saved sessions',
      description:
        'Desktop Material TUI keeps every open repository in a persistent, profile-scoped tab session. The compact strip provides immediate switching; the Tabs workspace provides…',
      sourcePath: 'docs/features/linux-tui/repository-tabs.md',
    },
    {
      id: 'linux-tui/search-and-regex',
      category: 'linux-tui',
      title: 'TUI search and RE2',
      description:
        'Plain literal search is the default. A user must deliberately select fuzzy or regex mode. The shared search control keeps query, mode, case choice, RE2 flags, validation, and…',
      sourcePath: 'docs/features/linux-tui/search-and-regex.md',
    },
    {
      id: 'linux-tui/security-and-failure-modes',
      category: 'linux-tui',
      title: 'TUI security and failure modes',
      description:
        'Git, GitHub CLI, editor, and terminal launches use argument arrays with shell=False. NUL/control validation, explicit repository working directories, stdin policy, captured…',
      sourcePath: 'docs/features/linux-tui/security-and-failure-modes.md',
    },
    {
      id: 'linux-tui/verification',
      category: 'linux-tui',
      title: 'TUI verification',
      description: 'From tui/:',
      sourcePath: 'docs/features/linux-tui/verification.md',
    },
    {
      id: 'quality-and-reliability/background-git-reliability',
      category: 'quality-and-reliability',
      title: 'Background Git reliability',
      description:
        'Desktop Material contains two independent failures found in the July 31, 2026 production log so background maintenance cannot flood the notification stack or silently stop.',
      sourcePath:
        'docs/features/quality-and-reliability/background-git-reliability.md',
    },
    {
      id: 'quality-and-reliability/canonical-remote-preflight-warning',
      category: 'quality-and-reliability',
      title: 'Canonical remote preflight warning',
      description:
        "Network mutations that depend on a GitHub repository association now fail closed when Desktop Material cannot prove the configured remote's canonical destination. Instead of…",
      sourcePath:
        'docs/features/quality-and-reliability/canonical-remote-preflight-warning.md',
    },
    {
      id: 'quality-and-reliability/central-diagnostic-logging',
      category: 'quality-and-reliability',
      title: 'Central diagnostic logging',
      description:
        'Desktop Material can keep logs locally, send them to a self-hosted diagnostic server, or do both. Local-only remains the default. Operators select the destination, optional…',
      sourcePath:
        'docs/features/quality-and-reliability/central-diagnostic-logging.md',
    },
    {
      id: 'quality-and-reliability/git-hook-execution',
      category: 'quality-and-reliability',
      title: 'Git hook execution environment',
      description:
        "Desktop Material runs a repository's own Git hooks (pre-commit, commit-msg, pre-push, …) through a proxy so a hook that expects a login shell environment behaves the same way…",
      sourcePath: 'docs/features/quality-and-reliability/git-hook-execution.md',
    },
    {
      id: 'quality-and-reliability/git-operation-auto-fix',
      category: 'quality-and-reliability',
      title: 'Git operation auto-fix',
      description:
        "Safe, recognized auto-fixes for common Git operation failures. A pure decision module classifies a failed operation's error text into a known fixable case, proposes a…",
      sourcePath:
        'docs/features/quality-and-reliability/git-operation-auto-fix.md',
    },
    {
      id: 'quality-and-reliability/native-large-repository-handling',
      category: 'quality-and-reliability',
      title: 'Native large-repository handling',
      description:
        'Root causes for this feature were found live on a 211k-file repository, where background Git maintenance, stale locks, deleted-directory polling, and a slow first git status…',
      sourcePath:
        'docs/features/quality-and-reliability/native-large-repository-handling.md',
    },
    {
      id: 'quality-and-reliability/no-op-render-update-suppression',
      category: 'quality-and-reliability',
      title: 'No-op renderer update suppression',
      description:
        'Changes and History share compare-form state. Selecting either repository section used to send showBranchList: false after every section change, even when the branch list was…',
      sourcePath:
        'docs/features/quality-and-reliability/no-op-render-update-suppression.md',
    },
    {
      id: 'quality-and-reliability/observed-user-initiated-operations',
      category: 'quality-and-reliability',
      title: 'Observed user-initiated operations',
      description:
        'A promise that nobody watches cannot report its own failure. This document describes why a rejected Push origin could surface as a generic "a background action stopped…',
      sourcePath:
        'docs/features/quality-and-reliability/observed-user-initiated-operations.md',
    },
    {
      id: 'quality-and-reliability/peer-closed-stream-writes',
      category: 'quality-and-reliability',
      title: 'Peer-closed stream writes',
      description:
        'A write that finishes after the thing on the other end already went away is a routine event, not a crash. This document describes how Desktop Material contains that class of…',
      sourcePath:
        'docs/features/quality-and-reliability/peer-closed-stream-writes.md',
    },
    {
      id: 'quality-and-reliability/progressive-lazy-loading',
      category: 'quality-and-reliability',
      title: 'Progressive asynchronous loading',
      description:
        'Desktop Material paints and reveals its usable application shell before optional startup work finishes. Expensive repository sections are downloaded and evaluated only when…',
      sourcePath:
        'docs/features/quality-and-reliability/progressive-lazy-loading.md',
    },
    {
      id: 'quality-and-reliability/README',
      category: 'quality-and-reliability',
      title: 'Quality and reliability / 品質同可靠性',
      description: 'Central diagnostic logging — opt-in',
      sourcePath: 'docs/features/quality-and-reliability/README.md',
    },
    {
      id: 'quality-and-reliability/renderer-startup-bundle-safety',
      category: 'quality-and-reliability',
      title: 'Renderer startup bundle safety',
      description:
        "Desktop Material's Windows renderer must mount its React root before the main window is shown. A Node-oriented dependency that is concatenated into the browser bundle can fail…",
      sourcePath:
        'docs/features/quality-and-reliability/renderer-startup-bundle-safety.md',
    },
    {
      id: 'quality-and-reliability/responsiveness-and-resource-lifecycle',
      category: 'quality-and-reliability',
      title: 'Responsiveness and resource lifecycle',
      description:
        'Desktop Material bounds repeated background work and releases resources at the same lifecycle boundary that created them. The behavior is automatic; it adds no preference,…',
      sourcePath:
        'docs/features/quality-and-reliability/responsiveness-and-resource-lifecycle.md',
    },
    {
      id: 'quality-and-reliability/root-renderer-resource-lifecycle',
      category: 'quality-and-reliability',
      title: 'Root renderer resource lifecycle',
      description:
        'The root App owns every long-lived renderer subscription and polling timer it starts. Store, updater, drag-manager, and IPC listeners are collected in one CompositeDisposable;…',
      sourcePath:
        'docs/features/quality-and-reliability/root-renderer-resource-lifecycle.md',
    },
    {
      id: 'quality-and-reliability/supply-chain-and-ci-hardening',
      category: 'quality-and-reliability',
      title: 'Supply-chain and CI hardening',
      description:
        "Desktop Material's continuous-integration workflow builds the Windows installers that users actually run, so what its jobs install, how its runs are scheduled, and how it…",
      sourcePath:
        'docs/features/quality-and-reliability/supply-chain-and-ci-hardening.md',
    },
    {
      id: 'README',
      category: 'root',
      title: 'Desktop Material feature documentation',
      description:
        'Feature documents are grouped by the part of the product that owns the behavior. Each document covers the user workflow, persistence boundary, failure modes, security…',
      sourcePath: 'docs/features/README.md',
    },
    {
      id: 'repository-management/advanced-history-discovery',
      category: 'repository-management',
      title: 'Advanced history discovery',
      description:
        'The History page can search loaded commits by title, body, author, tag, or full/short object ID using fuzzy, substring, or regular-expression matching. Its filter chips narrow…',
      sourcePath:
        'docs/features/repository-management/advanced-history-discovery.md',
    },
    {
      id: 'repository-management/automatic-commit-push-batching',
      category: 'repository-management',
      title: 'Automatic commit and push batching',
      description:
        'Desktop Material keeps one automatic Git push below a decimal 1.5 GB (1,500,000,000-byte) ceiling when a large selection contains many ordinary files. Changed blobs are capped…',
      sourcePath:
        'docs/features/repository-management/automatic-commit-push-batching.md',
    },
    {
      id: 'repository-management/automatic-remote-url-refresh',
      category: 'repository-management',
      title: 'Automatic remote URL refresh',
      description:
        "Desktop Material repairs a checkout's configured GitHub remote when the provider reports that the repository was renamed or transferred. The repair is a preflight for network…",
      sourcePath:
        'docs/features/repository-management/automatic-remote-url-refresh.md',
    },
    {
      id: 'repository-management/cheap-lfs-asset-versioning',
      category: 'repository-management',
      title: 'Cheap LFS asset versioning and commit provenance',
      description:
        'A pinned large file is not frozen. Users edit the video, re-export the model, re-record the sample, and commit again. This page describes exactly what Cheap LFS does with the…',
      sourcePath:
        'docs/features/repository-management/cheap-lfs-asset-versioning.md',
    },
    {
      id: 'repository-management/cheap-lfs-oci-registry-backend',
      category: 'repository-management',
      title: 'Cheap LFS OCI registry backend',
      description:
        'Desktop Material can represent the complete Cheap LFS object set for one Git repository as one logical OCI image in GitHub Container Registry (GHCR) or Docker Hub. Select GHCR…',
      sourcePath:
        'docs/features/repository-management/cheap-lfs-oci-registry-backend.md',
    },
    {
      id: 'repository-management/cheap-lfs-release-payload-encryption',
      category: 'repository-management',
      title: 'Cheap LFS Release payload encryption',
      description:
        'Desktop Material can encrypt newly uploaded GitHub Release-backed Cheap LFS payloads with a repository-scoped password. The option is deliberately off by default and applies…',
      sourcePath:
        'docs/features/repository-management/cheap-lfs-release-payload-encryption.md',
    },
    {
      id: 'repository-management/cheap-lfs-vs-git-lfs',
      category: 'repository-management',
      title: 'Cheap LFS versus Git LFS comparison atlas',
      description:
        'The standalone Cheap LFS versus Git LFS comparison atlas is the decision surface for teams choosing how large payloads should leave',
      sourcePath: 'docs/features/repository-management/cheap-lfs-vs-git-lfs.md',
    },
    {
      id: 'repository-management/clone-dialog-repository-metadata',
      category: 'repository-management',
      title: 'Clone dialog repository metadata',
      description:
        "Every row in the Clone dialog's GitHub repository list is a rich metadata card rather than a bare name, matching the Desktop Material v2 prototype. The card surfaces the…",
      sourcePath:
        'docs/features/repository-management/clone-dialog-repository-metadata.md',
    },
    {
      id: 'repository-management/clone-queue-settings',
      category: 'repository-management',
      title: 'Clone queue settings',
      description:
        'Desktop Material exposes its account-scoped automatic-clone policy at Settings → Clone queue. This page is the durable configuration surface for background discovery; it does…',
      sourcePath: 'docs/features/repository-management/clone-queue-settings.md',
    },
    {
      id: 'repository-management/commit-and-push-all',
      category: 'repository-management',
      title: 'Commit and push all repositories',
      description:
        'One action that walks every repository Desktop Material knows about, pulls it, commits everything in its working directory under a single message you supply, and pushes the…',
      sourcePath: 'docs/features/repository-management/commit-and-push-all.md',
    },
    {
      id: 'repository-management/deleted-upstream-pull-recovery',
      category: 'repository-management',
      title: 'Deleted upstream pull recovery',
      description:
        "When a pull fails because the current branch's remote-tracking branch no longer exists — someone deleted it after merging a pull request, or renamed it on the remote — Desktop…",
      sourcePath:
        'docs/features/repository-management/deleted-upstream-pull-recovery.md',
    },
    {
      id: 'repository-management/external-stash-interoperability',
      category: 'repository-management',
      title: 'External stash interoperability',
      description:
        'Desktop Material inventories every entry returned from refs/stash within the bounded metadata-read budget, including stashes created by the Git CLI, another desktop client, or…',
      sourcePath:
        'docs/features/repository-management/external-stash-interoperability.md',
    },
    {
      id: 'repository-management/history-commit-hover-time',
      category: 'repository-management',
      title: 'History commit hover time',
      description:
        'History commit rows expose an accessible hover/focus card with the author and authored date. The date now carries both the exact localized timestamp and a second relative line…',
      sourcePath:
        'docs/features/repository-management/history-commit-hover-time.md',
    },
    {
      id: 'repository-management/ignored-files-to-local-submodule',
      category: 'repository-management',
      title: 'Ignored files to a local Cheap LFS submodule (local phase)',
      description:
        'A reviewed workflow that copies working files Git itself currently proves are ignored into a newly created local Git repository and registers that repository as a submodule of…',
      sourcePath:
        'docs/features/repository-management/ignored-files-to-local-submodule.md',
    },
    {
      id: 'repository-management/launchpad',
      category: 'repository-management',
      title: 'Launchpad',
      description:
        'Launchpad is the repository workspace for reviewing the items that need attention first. It groups repository-backed work into Pinned, Ready to merge, Unassigned, CI failing,…',
      sourcePath: 'docs/features/repository-management/launchpad.md',
    },
    {
      id: 'repository-management/multi-remote-fetch-sync',
      category: 'repository-management',
      title: 'Multi-remote fetch sync',
      description:
        "The repository toolbar's ordinary Fetch action now reflects the complete configured topology. A checkout with more than one Git remote is fetched from every configured remote,…",
      sourcePath:
        'docs/features/repository-management/multi-remote-fetch-sync.md',
    },
    {
      id: 'repository-management/named-stash-manager',
      category: 'repository-management',
      title: 'Named multi-stash manager',
      description:
        'The repository-wide Stash Manager inventories every stash entry returned by Git without a Desktop entry-count cap and supports more than one Desktop-managed stash per branch. A…',
      sourcePath: 'docs/features/repository-management/named-stash-manager.md',
    },
    {
      id: 'repository-management/network-and-wsl-repository-paths',
      category: 'repository-management',
      title: 'Network and WSL repository paths',
      description:
        'Add local repository accepts normal UNC shares, Windows mapped drives, and WSL UNC shares as first-class repository locations. It preserves the exact UNC root instead of…',
      sourcePath:
        'docs/features/repository-management/network-and-wsl-repository-paths.md',
    },
    {
      id: 'repository-management/parent-folder-repository-discovery',
      category: 'repository-management',
      title: 'Parent-folder repository discovery',
      description:
        'Add Local Repository can scan a chosen parent folder, preview every safely detected Git working tree, and add the reviewed result in one action. This is a local discovery aid…',
      sourcePath:
        'docs/features/repository-management/parent-folder-repository-discovery.md',
    },
    {
      id: 'repository-management/patch-series',
      category: 'repository-management',
      title: 'Patch-series exchange',
      description:
        'Open Repository → Repository tools → Exchange patch series to move a reviewable sequence of commits without publishing a branch.',
      sourcePath: 'docs/features/repository-management/patch-series.md',
    },
    {
      id: 'repository-management/post-clone-runner-provisioning',
      category: 'repository-management',
      title: 'Opt-in post-clone runner provisioning',
      description:
        'Desktop Material can create a repository-scoped GitHub Actions self-hosted runner immediately after an interactive clone succeeds. The choice is off by default, applies to one…',
      sourcePath:
        'docs/features/repository-management/post-clone-runner-provisioning.md',
    },
    {
      id: 'repository-management/private-repository-lock-badge',
      category: 'repository-management',
      title: 'Private-repository lock badge',
      description:
        "Desktop Material shows a separate filled lock beside a repository's normal leading glyph when GitHub metadata explicitly identifies the repository as private. The lock does not…",
      sourcePath:
        'docs/features/repository-management/private-repository-lock-badge.md',
    },
    {
      id: 'repository-management/publish-organization-picker',
      category: 'repository-management',
      title: 'Publish organization picker',
      description:
        'The Publish repository dialog uses a searchable listbox to choose who will own the new GitHub repository. The first choice is always None — publish to my personal account;…',
      sourcePath:
        'docs/features/repository-management/publish-organization-picker.md',
    },
    {
      id: 'repository-management/pull-previews',
      category: 'repository-management',
      title: 'Reviewed ordinary Git pull previews',
      description:
        'The application-menu Pull action and a right click on the toolbar Pull remote button are a review boundary for an ordinary, single-repository Git pull. Desktop Material fetches…',
      sourcePath: 'docs/features/repository-management/pull-previews.md',
    },
    {
      id: 'repository-management/README',
      category: 'repository-management',
      title: 'Repository management features / 儲存庫管理功能',
      description:
        'This category documents workflows that change which Git worktree Desktop Material is displaying or how a repository is represented in the application.',
      sourcePath: 'docs/features/repository-management/README.md',
    },
    {
      id: 'repository-management/release-backed-cheap-lfs',
      category: 'repository-management',
      title: 'Release-backed large-file storage',
      description:
        'The generated mark above is documentation artwork. It is not embedded in the pointer format and is not required by the transfer protocol.',
      sourcePath:
        'docs/features/repository-management/release-backed-cheap-lfs.md',
    },
    {
      id: 'repository-management/repository-group-management',
      category: 'repository-management',
      title: 'Custom repository group management',
      description:
        'The repository side sheet groups rows under Pinned, Recent, one heading per GitHub owner, one per Enterprise host, Other, and any custom group a user has invented. A custom…',
      sourcePath:
        'docs/features/repository-management/repository-group-management.md',
    },
    {
      id: 'repository-management/repository-list-bulk-actions',
      category: 'repository-management',
      title: 'Repository list bulk actions',
      description:
        'The repository side sheet keeps its frequent workspace actions on one compact 44 px row: Add, Select, and More. More contains repository-group creation, workspace sync, and…',
      sourcePath:
        'docs/features/repository-management/repository-list-bulk-actions.md',
    },
    {
      id: 'repository-management/repository-list-group-collapse',
      category: 'repository-management',
      title: 'Repository list collapsible groups',
      description:
        'The repository side sheet has always grouped rows — Pinned, Recent, a custom group name, one heading per GitHub owner, one per Enterprise host, and Other for everything…',
      sourcePath:
        'docs/features/repository-management/repository-list-group-collapse.md',
    },
    {
      id: 'repository-management/repository-list-sync-summary',
      category: 'repository-management',
      title: 'Repository list sync summary',
      description:
        'Every row in the repository side sheet carries a small, low-emphasis second line under the repository name summarizing how far that repository has drifted from its tracked…',
      sourcePath:
        'docs/features/repository-management/repository-list-sync-summary.md',
    },
    {
      id: 'repository-management/repository-list-transfer',
      category: 'repository-management',
      title: 'Repository list transfer and Cheap LFS',
      description:
        'Repository list transfer moves a reviewed set of cloned repositories between Desktop Material profiles or machines. It is deliberately a clone recipe, not a credential or…',
      sourcePath:
        'docs/features/repository-management/repository-list-transfer.md',
    },
    {
      id: 'repository-management/repository-picker-filters-and-visibility',
      category: 'repository-management',
      title: 'Repository picker filters and visibility',
      description:
        'The repository side sheet combines text search with account, provider, and status filters so a large local workspace can be narrowed without changing its saved repository list.',
      sourcePath:
        'docs/features/repository-management/repository-picker-filters-and-visibility.md',
    },
    {
      id: 'repository-management/repository-transfer',
      category: 'repository-management',
      title: 'Repository transfer',
      description:
        'Transfer repository moves a GitHub-backed repository into a repository owned by another signed-in GitHub account or organization. It is available from the Repository menu, the…',
      sourcePath: 'docs/features/repository-management/repository-transfer.md',
    },
    {
      id: 'repository-management/reviewed-batch-sync',
      category: 'repository-management',
      title: 'Reviewed batch repository sync',
      description:
        'The repository picker exposes Sync repositories for workspace-scale network updates. The dialog loads the current persisted repositories, selects all by default, and lets the…',
      sourcePath: 'docs/features/repository-management/reviewed-batch-sync.md',
    },
    {
      id: 'repository-management/reviewed-bulk-branch-deletion',
      category: 'repository-management',
      title: 'Reviewed bulk branch deletion and merge cleanup',
      description:
        'The Branches side sheet includes a compact cleanup panel for removing several local branches in one reviewed batch. Current, default, and remote-only branches never enter the…',
      sourcePath:
        'docs/features/repository-management/reviewed-bulk-branch-deletion.md',
    },
    {
      id: 'repository-management/selective-stashes',
      category: 'repository-management',
      title: 'Selective stashes',
      description:
        'The Stash Manager can save all working-tree changes or only an explicitly reviewed set of changed files. Selected scope operates on whole paths: it does not imply partial-line…',
      sourcePath: 'docs/features/repository-management/selective-stashes.md',
    },
    {
      id: 'repository-management/sparse-checkout',
      category: 'repository-management',
      title: 'Guided sparse checkout',
      description:
        'Desktop Material manages cone-mode sparse checkout through a three-step Choose/Adjust/Restore → Review selection → Apply and refresh guide. The workflow changes which tracked…',
      sourcePath: 'docs/features/repository-management/sparse-checkout.md',
    },
    {
      id: 'repository-management/stash-export',
      category: 'repository-management',
      title: 'Stash export and recovery dialog',
      description:
        "The Stash Manager's separate non-blocking dialog has Manage, Export, History, and Appearance and voice tabs. Export searches names, branch associations, and exact stash object…",
      sourcePath: 'docs/features/repository-management/stash-export.md',
    },
    {
      id: 'repository-management/submodule-repository-navigation',
      category: 'repository-management',
      title: 'Temporary submodule repository navigation',
      description:
        "Desktop Material can display an initialized submodule as a repository in the current workspace without importing that submodule into the app's saved repository catalog.",
      sourcePath:
        'docs/features/repository-management/submodule-repository-navigation.md',
    },
    {
      id: 'repository-management/submodule-subtree-and-remote-creation',
      category: 'repository-management',
      title: 'Submodule, subtree, and remote creation workflows',
      description:
        'Repository Settings brings dependency topology into one workspace. The Submodules surface can add, clone/update, synchronize, configure, remove, or temporarily open a recorded…',
      sourcePath:
        'docs/features/repository-management/submodule-subtree-and-remote-creation.md',
    },
    {
      id: 'repository-management/sync-merge-cleanup',
      category: 'repository-management',
      title: 'Verified merge-and-cleanup repository sync',
      description:
        'The Sync repositories dialog includes a reviewed Merge completed work into main, push, then clean up operation. It integrates eligible local branch tips into main, pushes main…',
      sourcePath: 'docs/features/repository-management/sync-merge-cleanup.md',
    },
    {
      id: 'repository-management/tag-lifecycle-management',
      category: 'repository-management',
      title: 'Tag lifecycle management',
      description:
        "Desktop Material's Repository tools → Tag lifecycle surface manages local and remote Git tags without an editable command line. It provides a bounded inventory, creation and…",
      sourcePath:
        'docs/features/repository-management/tag-lifecycle-management.md',
    },
    {
      id: 'review-and-diff/changed-file-tree-view',
      category: 'review-and-diff',
      title: 'Changed-file tree view',
      description:
        'Changes, commit History, and pull-request file lists share a persisted Flat/Tree selector. Tree mode groups safe repository-relative paths into a deterministic depth-first…',
      sourcePath: 'docs/features/review-and-diff/changed-file-tree-view.md',
    },
    {
      id: 'review-and-diff/changed-file-trees-and-diff-context',
      category: 'review-and-diff',
      title: 'Changed-file trees and diff context',
      description:
        'Desktop Material can organize changed files by directory and remember how much surrounding text to reveal. Both features are presentation preferences: they do not modify…',
      sourcePath:
        'docs/features/review-and-diff/changed-file-trees-and-diff-context.md',
    },
    {
      id: 'review-and-diff/expanded-diff-context',
      category: 'review-and-diff',
      title: 'Expanded diff context',
      description:
        'Diff Options can automatically reveal whole-file context for eligible text diffs and can set manual expansion steps to 20, 50, or 100 lines. The preference is local…',
      sourcePath: 'docs/features/review-and-diff/expanded-diff-context.md',
    },
    {
      id: 'review-and-diff/README',
      category: 'review-and-diff',
      title: 'Review and diff features / 覆核同差異功能',
      description:
        "This category documents in-app presentations for safely reviewing repository changes without changing Git's underlying patch or selection behavior.",
      sourcePath: 'docs/features/review-and-diff/README.md',
    },
    {
      id: 'review-and-diff/structured-csv-and-tsv-diffs',
      category: 'review-and-diff',
      title: 'Structured CSV and TSV diffs',
      description:
        'Changed .csv and .tsv files can switch between the ordinary Code diff and an accessible Table diff. RFC-4180 quoting, escaped delimiters, CRLF/LF, and multiline quoted fields…',
      sourcePath:
        'docs/features/review-and-diff/structured-csv-and-tsv-diffs.md',
    },
    {
      id: 'review-and-diff/structured-data-and-tga-previews',
      category: 'review-and-diff',
      title: 'Structured data and TGA previews',
      description:
        'Desktop Material provides bounded, in-app review modes for delimited text and TGA image changes while preserving the existing Git diff as the source of truth.',
      sourcePath:
        'docs/features/review-and-diff/structured-data-and-tga-previews.md',
    },
    {
      id: 'review-and-diff/tga-image-previews',
      category: 'review-and-diff',
      title: 'TGA image previews',
      description:
        'Desktop Material can review supported .tga changes through the existing image-diff modes after an in-memory conversion to a PNG data URL. It supports uncompressed 24/32-bit…',
      sourcePath: 'docs/features/review-and-diff/tga-image-previews.md',
    },
    {
      id: 'review-and-diff/theme-aware-diff-surfaces',
      category: 'review-and-diff',
      title: 'Theme-aware diff surfaces',
      description:
        'Desktop Material keeps every text diff surface on the active Material surface token. Unified CodeMirror context rows and standalone side-by-side diffs use the same theme-aware…',
      sourcePath: 'docs/features/review-and-diff/theme-aware-diff-surfaces.md',
    },
  ]

/** Every category directory present under `docs/features`. */
export const DocsBrowserCategories: ReadonlyArray<IDocsBrowserCategory> = [
  {
    name: 'agent-api',
    label: 'Agent Api',
    count: 2,
  },
  {
    name: 'collaboration',
    label: 'Collaboration',
    count: 8,
  },
  {
    name: 'design-system',
    label: 'Design System',
    count: 25,
  },
  {
    name: 'identity-and-workspace',
    label: 'Identity And Workspace',
    count: 15,
  },
  {
    name: 'integrations',
    label: 'Integrations',
    count: 30,
  },
  {
    name: 'linux-tui',
    label: 'Linux Tui',
    count: 17,
  },
  {
    name: 'quality-and-reliability',
    label: 'Quality And Reliability',
    count: 15,
  },
  {
    name: 'repository-management',
    label: 'Repository Management',
    count: 42,
  },
  {
    name: 'review-and-diff',
    label: 'Review And Diff',
    count: 8,
  },
  {
    name: 'root',
    label: 'Root',
    count: 2,
  },
]

/** How many articles the bundle carries. Asserted against the tree in CI. */
export const DocsBrowserArticleCount = 164
