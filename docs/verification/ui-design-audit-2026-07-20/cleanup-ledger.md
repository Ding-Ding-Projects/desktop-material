# UI design audit cleanup ledger

- Run ID: `ui-design-audit-2026-07-20-9f64a2c1`
- Owned temporary root:
  `<system temporary folder>\desktop-material-ui-audit-20260720-9f64a2c1`
- Owned reference extraction: `<temporary-root>\reference`
- Owned Git fixture: `<temporary-root>\fixture`
- Owned bare fixture remote: `<temporary-root>\remote.git`
- Owned fixture provisioner: `<temporary-root>\prepare-fixture.ps1`
- Owned Electron user data: `<temporary-root>\user-data`
- Owned captures: `<temporary-root>\captures`
- Owned command shim: `<temporary-root>\bin\yarn.cmd`
- Audit-worktree dependency junctions: `node_modules` and `app\node_modules`.
- Audit-worktree gemoji state: isolated local shared clone at pinned gitlink
  `50865e8895c54037bf06c4c1691aa925d030a59d`; clean detached HEAD with all 845
  tracked Unicode images present.
- Audit-worktree local submodule copies (from the initialized default checkout,
  excluding all `.git` metadata): `app\static\common\choosealicense.com` and
  `app\static\common\gitignore`
- Copied submodule pointer files quarantined at
  `<temporary-root>\copied-git-metadata` so the audit worktree cannot resolve
  them against the default checkout's Git metadata.
- Detached unsafe build reparse points are quarantined at
  `<temporary-root>\detached-reparse-points`; this directory must never be
  recursively removed while they remain reparse points.
- Build-output repair: `out\emoji` is now a real directory containing the
  non-Unicode image set, not a reparse point.
- Cross-worktree incident: the first hydrated build preserved the source
  junction as `out\emoji`; its normal `out\emoji\unicode` removal traversed to
  the default checkout and deleted 845 tracked submodule images. The M24 task
  applied and dropped preservation stash
  `c92556b9f422ac258eebabebb79a1a87a8a66a37`, leaving the 845 deletions
  intentionally preserved and unstaged in the default submodule with an empty
  stash list. Those paths and the default checkout remain M24-owned state; this
  audit must not restore, reset, stage, delete, or otherwise alter them.
- Headless desktop: `DesktopMaterialAudit-20260720-9f64a2c1`
- Temporary-root state: created and path-validated beneath `%TEMP%`
- Fixture state: deterministic `material-shell` branch at
  `ab393b42a40bef78ede163ee6786811707bf4659`, tracking the owned bare remote,
  with exactly eight intended working-tree changes (five modified, three new).
- Headless-desktop state: not created
- Launch PID: not assigned
- Resolved HWND: not assigned
- Cleanup state: pending
