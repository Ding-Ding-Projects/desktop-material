# Git launch access-denied verification manifest

- Mode: `publish`
- Milestone: stop repeated `error launching git: Access is denied.` background failures
- Expected UI state: repository opens and refreshes without Git-launch or generic background-action error notices
- Ordered interactions: start isolated app; open disposable Git fixture; wait for refresh; inspect notification stack; exercise one repository refresh
- Disposable fixture: unique directory below `%TEMP%/desktop-material-git-access-denied-*`
- Screenshot: unique PNG under the same run root, dark or system theme, 1280x900 client capture
- Documentation allowlist: affected quality/reliability feature article, category index when needed, `ROADMAP.md`, `HANDOFF.md`, and relevant site article/index
- Tests: focused unit coverage, typecheck/lint as applicable, production unpackaged build, headless real-app acceptance
- Remote: `origin` (`Ding-Ding-Projects/desktop-material`)
- Expected branch: `main`
- Initial baseline: clean worktree at `ee9103877f9f6c8888ef32e1c09c5627a19a3993`
