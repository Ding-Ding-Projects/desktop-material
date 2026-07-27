# Integrations

Desktop Material integration features connect Git workflows to operating-system,
editor, shell, provider, and user-level Git configuration without placing
credentials or machine-specific state in a repository.

- [App-hosted browser](app-hosted-browser.md) — open HTTP(S) links in a
  sandboxed `WebContentsView` tab with address/navigation controls, bookmarks,
  popup and redirect capture, a persisted internal/external choice, and an
  isolated authentication escape. Implemented on the current branch; combined
  Windows/build/CI/publication acceptance is pending.
- [Windows-only platform support](windows-only-platform-support.md)
- [Windows Explorer context menu and quick-action
  window](windows-explorer-context-menu.md)
- [Automated update build status and release
  notes](automated-updates-and-release-notes.md)
- [Build & Run output controls](build-run-output-controls.md)
- [Local GitHub Actions runner](local-actions-runner.md)
- [Local AI build repair with Codex or
  OpenCode](local-ai-build-fix.md)
- [Custom Git command presets](custom-git-command-presets.md)
- [WSL-aware editor opening](wsl-aware-editor-opening.md)
- [Global ignore management](global-ignore-management.md)
- [Editor discovery and one-click
  opening](editor-discovery-and-one-click-opening.md)
- [One-click editor actions](one-click-editor-actions.md)
- [Duplicate-open guard](duplicate-open-guard.md)
- [Broad editor support](broad-editor-support.md)
- [Copilot commit-message controls](copilot-commit-message-controls.md)
- [Ollama model manager](ollama-model-manager.md)
- [Repository-bound GitHub API functions](github-api-functions.md)
- [GitLab merge requests](gitlab-merge-request.md)
- [Repository Releases dashboard](repository-releases-dashboard.md)
- [Per-repository GitHub Packages explorer](github-packages-explorer.md)
- [SSH working copies and remote
  clone](ssh-working-copy-and-remote-clone.md)
- [GitHub CLI push credential
  fallback](gh-cli-push-fallback.md)

Credential and sign-in prompts are serialized through one recoverable FIFO so
concurrent Git/SSH requests cannot lose their visible completion path. See the
cross-cutting [responsiveness and resource lifecycle
contract](../quality-and-reliability/responsiveness-and-resource-lifecycle.md).
