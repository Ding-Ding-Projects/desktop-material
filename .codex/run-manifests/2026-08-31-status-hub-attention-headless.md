# Status Hub and attention accommodations headless verification

- Mode: `local-docs`
- Milestone: persistent Status Hub owner settings and verified attention accommodations
- Accepted source commit: `74159be0d9d4da10254ad18873496bb9bd1f5928`
- Initial inspected source commit: `8fe1b02d8bd4d43dfaac1680543f376874c4a26a`
- Expected branch: `codex/complete-universal-features-single-flight`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected UI states:
  - Settings > Integrations shows Status Hub endpoint, write-only authorization, save, connection-check, and clear controls.
  - Settings > Attention accommodations shows all five independent controls plus the conditional next-action and momentum-defer controls.
- Ordered hidden interactions:
  1. Launch the exact production build on a uniquely named hidden desktop with an isolated profile and disposable repository.
  2. Open Preferences and select Integrations.
  3. Inspect the Status Hub owner settings without entering an authorization value.
  4. Capture the complete Status Hub settings state.
  5. Select Attention accommodations.
  6. Enable all five modes and expose the One thing at a time and Momentum conditional controls.
  7. Restart with Focus persisted and verify the hidden repository-drop overlay remains hidden.
  8. Capture the five-mode settings state, conditional controls, Focus workspace, and Time awareness facts.
- Owned temporary root: `%LOCALAPPDATA%\Temp\desktop-material-status-attention-8fe1b02d8b`
- Disposable fixture: `%LOCALAPPDATA%\Temp\desktop-material-status-attention-8fe1b02d8b\fixture`
- Isolated user data: `%LOCALAPPDATA%\Temp\desktop-material-status-attention-8fe1b02d8b\profile`
- Hidden desktop: `desktop-material-status-attention-8fe1b02d8b`
- Screenshot targets:
  - `docs/assets/screenshots/material-status-hub-owner-settings-20260831.png`
  - `docs/assets/screenshots/material-attention-accommodations-20260831.png`
  - `docs/assets/screenshots/material-attention-accommodations-conditional-20260831.png`
  - `docs/assets/screenshots/material-attention-focus-workspace-20260831.png`
- Theme and viewport: light, 960 x 660 client area, 100% scale
- Documentation allowlist:
  - this manifest
  - the four dated screenshot targets and their capture-ledger aliases
  - `docs/features/design-system/status-hub.md`
  - `docs/features/design-system/attention-accommodations.md`
  - `HANDOFF.md`
  - `ROADMAP.md`
  - `app/test/fixtures/feature-completeness/evidence-paths.json`
- Declared checks:
  - exact Lowlevel startup and scheduled-task provenance
  - production build at the source commit
  - nonblank client-only capture before input
  - original-resolution privacy, clipping, theme, and dimension inspection
  - focused Status Hub, attention, documentation-bundle, surface-inventory, and capture-coverage tests
  - TypeScript and `git diff --check`
- Cleanup ledger: complete. Exact Electron PIDs were terminated only after background close attempts proved unreliable, both named hidden desktops reported zero windows before close, and both validated owned temporary roots were removed.

## Execution receipt

- Cheap Lowlevel endpoint: `http://127.0.0.1:8765/mcp`, listener command verified as the fixed checkout's `lowlevel-computer-use-mcp.exe --http --legacy-http --host 127.0.0.1 --port 8765`.
- Lowlevel checkout commit: `a30271e42ada397be567af7e9a2b258ffa3363ef`.
- Startup task boundary: no scheduled task exists on this host; the live listener process and port were verified directly through Lowlevel instead.
- Final accepted production build: `74159be0d9d4da10254ad18873496bb9bd1f5928`, `377.02s`, return code 0, `client_ok: true`.
- Local build limitation: the Windows shell-extension step was skipped because the Visual Studio C++ x64 build tools were unavailable. Renderer capture remained available.
- Privacy boundary: an initial onboarding frame exposed the host Git identity and was rejected. The accepted runs used an owned `GIT_CONFIG_GLOBAL` file with fixture-only values; no private onboarding frame was promoted.
- Status Hub defects found and repaired before acceptance:
  - `80e680b577417f5200c03965a71c6958aca91106` moved the result above the action row.
  - `a9f6b6f9fbbb743b2ee4ec3baa0872d82d7f1de9` compacted the result into the existing live region.
  - `d5038f1b56b280e5f4016c026a32abc1995e9625` moved that live region before the write-only field so every action cleared the fixed footer.
- Focus defect found and repaired before acceptance: `74159be0d9d4da10254ad18873496bb9bd1f5928` excludes hidden overlays from attention regions and establishes a deterministic active workspace region after startup.
- Accepted SHA-256 values:
  - Status Hub owner settings: `c6cc742e61025117ecffd2c93f0cec425af5efd38f880543458317d6ea4dbea0`.
  - All five attention modes: `655e66b54d8434f0dc9872e6391aa8dc7f812a1e31b00821b7a422b83e4fff2a`.
  - Conditional attention controls: `50b8e29cc54123605449351ad79e440267ce0cff2a2db9be18179f5fe42bd3c0`.
  - Focus workspace: `a1731026b6223c4d861e9d296324b607b54e41a48db6854c46f737860fabb2c1`.
