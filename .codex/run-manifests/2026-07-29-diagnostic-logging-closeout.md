# Diagnostic logging and Cheap LFS close-out manifest

- Mode: `publish`
- Milestone: Finish the existing Cheap LFS hook-containment and central
  diagnostic logging work; add no new feature scope.
- Expected UI state: Existing Windows application launches from the
  reproducible unpackaged production build; no new UI surface or screenshot is
  part of this change.
- Ordered background interactions: preflight the fixed Lowlevel MCP endpoint;
  verify its registered hidden startup launcher and checkout; run the exact
  unpackaged production build; do not show or switch desktops.
- Disposable fixture path: Not applicable; no UI interaction or repository
  fixture is required for this non-visual close-out.
- Screenshot target/theme/dimensions: Not applicable; no visible behavior
  changed and no screenshot will be promoted.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`,
  `docs/features/agent-api/README.md`,
  `docs/features/quality-and-reliability/README.md`,
  `docs/features/quality-and-reliability/central-diagnostic-logging.md`,
  `docs/features/quality-and-reliability/central-diagnostic-logging.postman_collection.json`,
  `docs/postman/desktop-material.postman_collection.json`,
  `docs/readme-tabs/complete-feature-list.md`, and this manifest.
- Tests: diagnostic service unit/integration test; desktop remote-log transport
  unit test; Cheap LFS workflow auto-install regression; TypeScript; focused
  Prettier/ESLint/Markdown/JSON checks; reproducible unpackaged production
  build.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Expected branch: `main`
- Initial baseline: `main` at
  `ac8595f05abb14fb7e2b4ce81e0ed31c0ab9e760`, aligned with `origin/main`;
  the two existing feature surfaces and their documentation were dirty before
  this close-out manifest was created.
- Concurrent integration: `origin/main` advanced to
  `d99c09886001f778f11cbf51db67021e76b4f4ad`; the verified local scope was
  stashed, `main` was fast-forwarded, and the stash reapplied without
  conflict.
- Final remote-tip reconciliation: `origin/main` later advanced once more to
  `5a2fb5c228`, changing only
  `app/test/unit/ui/repository-group-management-test.tsx`. The staged
  close-out was preserved, `main` was fast-forwarded, and the index was
  reapplied without conflict. The production source built above did not change;
  the upstream focused test is rerun separately.
- Preflight result: `startup_status` returned `ok: true`; the registered VBS
  launcher uses the fixed Lowlevel checkout, its
  `.venv\\Scripts\\pythonw.exe`, `127.0.0.1:8765`, and checkout
  `dec8a543085100da168f56c310aae7c7b1fdbc33`.
- Verification result before concurrent integration: the exact MCP build
  passed in 402.68 seconds; focused desktop tests passed 38/38 across 2 files;
  service tests passed 4/4; TypeScript, focused Prettier/ESLint, JSON parsing,
  Compose validation, and `git diff --check` passed; the deployed health
  endpoint returned HTTP 200.
- Integrated build result: the exact MCP build on
  `d99c09886001f778f11cbf51db67021e76b4f4ad` plus this close-out passed in
  520.65 seconds with `client_ok: true`, return code 0, no stderr, and no
  timeout. The client reported a session-termination transport cleanup failure
  only after returning the complete successful result; this non-visual run
  created no headless desktop or app window.
- Final integrated gates: desktop tests passed 38/38 across 2 files; service
  tests passed 4/4; documentation catalog tests passed 19/19; TypeScript,
  focused Prettier and ESLint, new-file Markdown lint, JSON parsing, Compose
  validation, catalog parity, and `git diff --check` passed.
- Close-out review correction: the dashboard's default `level=` query now
  means “all levels,” and malformed non-empty client filters return HTTP 400
  instead of falling through to an all-client query. The 4/4 service suite
  covers both cases, and the formatted service image builds locally.
- Live deployment: host `192.168.50.242` was rechecked for architecture,
  memory, disk, workloads, port ownership, and Docker health. Only
  `desktop-material-diagnostic-log-server` was rebuilt/recreated. The final
  container is `running/healthy`; public health and authenticated default
  search return HTTP 200, malformed-client search returns HTTP 400, and the
  deployed `server.mjs` SHA-256 is
  `087a3e7b47d71c857dd9ee4b5111249dbf7e382dd3b0e3f44fde5beee37c9270`.
