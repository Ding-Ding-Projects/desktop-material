# Closeout prompt

Copy the block below to continue this work in a fresh session. It reflects the repository state at
the commit that contains this file.

```
Project: Desktop Material, a GitHub Desktop fork (Electron, React, TypeScript) for Windows, plus a
Linux terminal app. Repository: Ding-Ding-Projects/desktop-material. Read README.md, AGENTS.md,
ROADMAP.md and HANDOFF.md first (the top HANDOFF entry is this session).

State (2026-11-09, later): everything is on main and pushed.

Done this session:
- Design: all boards from issue #262 are drawn in design/motion-and-polish (20 boards). The
  Minecraft web panel has its own folder, design/minecraft-web-panel (free Cloudflare quick tunnel
  link, Discord webhook with link and one-time pairing code, auto resend on change, nine-page panel).
  Designs only.
- Implemented: motion speed and per-surface switches (956b065), Svelte highlighting from upstream
  3.6.8 (e3eb9f4), Always show worktree list from upstream 3.6.7 (6e55b8c), Quick convert of dropped
  files and folders to Base64 text beside the originals (e9a8b02), Base64 text toolkit (f1ed021), motion polish on existing
  controls (480baf7).
- Checked on Linux only: focused tests pass, TypeScript reports no errors. 30 tests in the wider
  appearance and shell set fail the same way with and without these changes.

Useful: a published release zip can be run under Linux for checks and captures by replacing
registry.node, fs_admin.node and desktop-notifications.node with an empty N-API module, keytar.node
with the Linux build, and git/cmd/git.exe with a wrapper around the system Git. Label such captures
as a Linux run, not a Windows capture. A reported palette crash ("webview error") was not reproduced.

Not done:
1. Windows CI result for these commits was not seen. Check it first.
2. No screenshot was renewed: captures need the built Windows app and script/capture-app.js. A Linux
   development build was tried and webpack ran out of memory on a 7 GB machine.
3. Implement the remaining boards one feature per commit, starting with the Minecraft server
   manager and its web panel (free Cloudflare quick tunnel link, Discord webhook with link and pairing
   code, resend on change), then extensions, live charts, virtual disks, recording, first-run wizard.
4. Upstream (issue #212): port short-lived sign-in tokens (3.6.8), the Git, Git LFS and Electron
   updates, check-summary icon contrast (3.6.7), folder-reveal confirmation (3.6.6) and the fixes in
   3.6.6 to 3.6.10; then classify the rest of the 435 commits since b17e06dd.
5. Confirm three design assumptions: sketch pad scope, first-run wizard steps, palette shortcuts.
```
