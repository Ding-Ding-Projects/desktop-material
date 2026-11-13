# Closeout prompt

Copy the block below to continue this work in a fresh session. It reflects the repository state at
the commit that contains this file.

```
Project: Desktop Material, a GitHub Desktop fork (Electron, React, TypeScript) for Windows, plus a
Linux terminal app. Repository: Ding-Ding-Projects/desktop-material. Read README.md, AGENTS.md,
ROADMAP.md and HANDOFF.md first (the top HANDOFF entry is this session).

State (2026-11-10): everything is on main and pushed.

Done this session:
- Design: all boards from issue #262 are drawn in design/motion-and-polish (20 boards). The
  Minecraft web panel has its own folder, design/minecraft-web-panel (free Cloudflare quick tunnel
  link, Discord webhook with link and one-time pairing code, auto resend on change, nine-page panel).
  Designs only.
- Implemented: motion speed and per-surface switches (956b065), Svelte highlighting from upstream
  3.6.8 (e3eb9f4), Always show worktree list from upstream 3.6.7 (6e55b8c), Quick convert of dropped
  files and folders to Base64 text beside the originals (e9a8b02), Base64 text toolkit (f1ed021), motion polish on existing
  controls (480baf7), web panel tunnel and Discord rules with no screen yet (a991584), live charts with
  a live memory chart tool (50e37e3), sketch pad (1ed08cb).
- Also implemented: extensions with consent and a manager (aea6c10, 432413c), Repository tools
  layout fix (ceff56e), virtual disk planner that only plans (00b981e), Minecraft servers with the
  EULA step, start, stop and console (6313b45), and the Minecraft web panel: loopback-only, paired
  devices only, one-click free Cloudflare quick tunnel through an installed cloudflared, Discord
  webhook in the system vault with resend on change and optional one-time pairing code (4121e55).
  Upstream ports: #22881, #22889, #22883, #23019, #23046, #23056, #22900.
- Later: read-only Files page in the panel (818cd6e), panel and in-app settings, backups and plugin list (346c111, ac4e7f6), category counts and a
  folding chip row in Repository tools (ba85f02), vault failure no longer breaks the web panel card
  (70e75b5). docs/assets/linux-run holds labelled captures of published releases run under Linux;
  its README lists what those runs found. Tools: /tmp shim `globalThis.addEventListener ??= () => {}`
  preloaded with NODE_OPTIONS=--import lets UI tests load on Node 22.
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
3. Verified on published releases run under Linux (docs/assets/linux-run/README.md): web panel end
   to end over loopback (v4.0.142301), live chart slider and folded categories (v4.0.143701), the
   unreachable-push banner (v4.0.143901), Try again on a fetch notice (v4.0.144401), About with
   build commit and code name (v4.0.144801). Row stagger is not confirmable from a still capture. Unexercised: Cloudflare link, Discord, a real server jar.
   (b) Boards were audited (see the top HANDOFF entry): most surfaces already existed. Not in the
   app: nothing further from the audit; About now reads the release code name from the release notes. Pull, fetch and push failures that
   could not reach the host now offer Try again.
4. Upstream (issue #212): short-lived sign-in tokens (#22943) were dropped from the goal by the owner;
   the Git, Git LFS and
   Electron updates (#22862, #22872 and the visible part of #22607 are done); then classify the rest of the 435 commits since b17e06dd.
5. Confirm three design assumptions: sketch pad scope, first-run wizard steps, palette shortcuts.
```
