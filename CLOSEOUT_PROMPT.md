# Closeout prompt

Copy the block below to continue this work in a fresh session. It reflects the repository state at
the commit that contains this file.

```
Project: Desktop Material, a GitHub Desktop fork (Electron, React, TypeScript) for Windows, plus a
Linux terminal app. Repository: Ding-Ding-Projects/desktop-material. Read README.md, AGENTS.md,
ROADMAP.md and HANDOFF.md first.

State (2026-11-09): main at a8d2242 plus this file, pushed. v4.0.136804 is released from a8d2242
(Setup.exe, MSI, full nupkg, RELEASES, zip, line count). The usage allowance ran low, so this is a
preservation closeout.

Done and checked this session:
- Opening a real Git repository from Explorer, --cli-open, the desktop-material helper, quick
  actions or another app adds and selects it without the Add local repository dialog; the dialog
  stays for folders that are not usable repositories. Tests: app/test/unit/cli-open-adds-repository-test.ts.
- View on ... opens the web page of any remote (GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg,
  Gitea, self-hosted), with a Remote dropdown on the No local changes card when there are several;
  credentials are never shown or opened. Tests: app/test/unit/remote-web-page-test.ts and
  app/test/unit/ui/no-changes-remote-pages-test.tsx (60 focused tests pass).
- Windows CI green for x64 and arm64; the installer run needed retries after GitHub download 504s.

Known and unchanged on main: three source-pattern tests (palette-settings-coverage,
repository-transfer-surface, rewrite-surface-coverage) and eight ESLint errors in
app/src/lib/stores/app-store.ts already failed before this work. In build-installers.yml the
release-notes artifact name includes the run attempt, so re-running only failed jobs cannot publish;
re-run the whole workflow instead.

Remote branches: feature/open-adds-directly-remote-links is fully merged and listed for the
maintainer to delete in issue #261, with the other branches to review. Nothing was deleted.

Next steps:
1. Check the installed app opening a folder and a repository with several remotes; this session
   could not reach the maintainer's computer.
2. Update the HANDOFF entry for 2026-11-09, which predates the release.
3. Make every page and destination tab open by default (new shared default for every app).
```
