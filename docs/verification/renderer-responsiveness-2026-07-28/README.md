# Renderer responsiveness verification

## Baseline

- **Source:** release `v3.6.3-beta3-zadughkqcv`
- **Commit:** `9bdfdb8b25e458e4834bdaa26473d44a5602621d`
- **Capture:** real portable Windows x64 application, isolated user data,
  disposable empty Git repository, Lowlevel MCP off-screen Win32 desktop
- **Window:** 1442×991 captured client, default light theme

The stable Changes workspace sampled 122 animation frames over two seconds:
16.51 ms average, 16.70 ms p95, 16.80 ms maximum, and zero frames above 25 ms.
The renderer used 27.2 MB of a 35.7 MB V8 heap at that point.

Twelve warmed switches between Changes and History produced event durations of
56–104 ms (104 ms p95/max), six long tasks of 59–67 ms, and 1,602 mutation
records. Isolating one Changes click measured 104 ms, one 62 ms long task, and
166 mutation records. The code path dispatched an identical compare-form update
after the real section update, forcing a second global `AppStore` emission and
root render.

## Fix

- repository navigation asks to close the compare branch list only when it is
  open;
- `AppStore._updateCompareForm` rejects identical partial updates before cache
  mutation and `emitUpdate`;
- a pure equality contract covers empty, identical, filter-text, and branch-list
  changes.

Focused tests pass 42/42. Changed-file ESLint is blocked because the reused
dependency tree cannot load five repository-specific rules; it reports only
missing rule definitions, not source findings. The repository-wide TypeScript
command remains blocked on missing baseline packages; no diagnostic names the
new helper or test.

## Evidence

- `workspace-idle-profile.json`
- `warm-interaction-profile.json`
- `history-click-profile.json`
- `changes-click-profile.json`
- `.codex/verification/profile_renderer_responsiveness_cdp.js`
- `.codex/verification/renderer_interaction_probe_cdp.js`

The first baseline capture that exposed the host Git identity was rejected and
remains only inside the owned temporary run directory pending deletion. It is
not tracked or published.
