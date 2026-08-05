# Desktop Material bug-hunt run manifest

- Run date: 2026-08-03
- Mode: publish
- Milestone: full Windows desktop bug hunt and safe fixes
- Expected UI state: packaged/unpackaged production app launches on an isolated disposable fixture; findings are recorded as source/static, build, runtime, pixel, accessibility, or performance evidence.
- UI interaction policy: lowlevel-computer-use MCP at `http://127.0.0.1:8765/mcp`, headless Win32 Desktop only; resolve windows at runtime and use HWND-targeted background actions.
- Disposable fixture: unique owned Temp directory created after preflight; isolated user-data path and fixture only.
- Screenshot targets: only real built Desktop Material surfaces, unique temporary PNGs promoted to tracked targets only after visual inspection.
- Documentation allowlist: `HANDOFF.md`, `PLAN.md`, `README.md`, affected categorized feature docs, `site/`, `docs/wiki/`, and tracked screenshot targets only when evidence warrants.
- Verification: repository tests/typecheck/lint/build, focused regression tests for each fix, headless runtime capture where UI behavior is involved, remote SHA/CI/release verification after push.
- Expected branch: repository default branch after safe integration.
- Cleanup ledger: owned temp paths, desktop name, launch PID, resolved HWND, and cleanup status recorded during the run.
