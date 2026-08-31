# Status Hub and attention accommodations headless verification

- Mode: `local-docs`
- Milestone: persistent Status Hub owner settings and verified attention accommodations
- Source commit: `8fe1b02d8bd4d43dfaac1680543f376874c4a26a`
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
  6. Enable One thing at a time and Momentum.
  7. Capture the five-mode settings state and its two conditional controls.
- Owned temporary root: `C:\Users\cntow\AppData\Local\Temp\desktop-material-status-attention-8fe1b02d8b`
- Disposable fixture: `C:\Users\cntow\AppData\Local\Temp\desktop-material-status-attention-8fe1b02d8b\fixture`
- Isolated user data: `C:\Users\cntow\AppData\Local\Temp\desktop-material-status-attention-8fe1b02d8b\profile`
- Hidden desktop: `desktop-material-status-attention-8fe1b02d8b`
- Screenshot targets:
  - `docs/assets/screenshots/material-status-hub-owner-settings-20260831.png`
  - `docs/assets/screenshots/material-attention-accommodations-20260831.png`
- Theme and viewport: dark, 1280 x 900, 100% scale
- Documentation allowlist:
  - this manifest
  - both screenshot targets
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
- Cleanup ledger: pending creation PID and HWND values; every owned process, desktop, fixture, profile, and temporary capture must be removed in the final cleanup path.
