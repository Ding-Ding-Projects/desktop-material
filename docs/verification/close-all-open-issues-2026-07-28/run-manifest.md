# Close-all-open-issues verification run

- Run ID: `close-all-open-issues-20260728`
- Mode: `publish`
- Milestone: resolve, verify, publish, and close every actionable issue open at
  the start of this run: #23, #78, #80, #81, #82, #83, #85, #86, #87, and
  #89. Issues #92, #94, and #95 were discovered during the campaign and joined
  the same implementation, verification, publication, and closure gate. Issue
  #96 was filed while the campaign was active and is governed by that same
  gate; its initial fix first landed on `main`, was reconciled here, and was
  strengthened after adversarial review before final build and publication.
- Project worktree:
  `C:\Users\cntow\Documents\GitHub\desktop-material-close-issues-20260728`
- Initial source: `origin/main` at
  `75b45da89d494e031d01332a6c30c5407d371e21`
- Initial dirty-state baseline: clean, with zero divergence from `origin/main`
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Active GitHub account: `codingmachineedge`
- Working branch: `codex/close-all-open-issues-20260728`
- Expected publication branch: `main`
- Force push: prohibited

## Expected UI and behavior

- #23: the current guided gallery and capture campaign own exactly 84 Windows
  scenes, each requiring a fresh, original-pixel, private-data-free capture
  from the current built application; README, Pages, and wiki references render
  the promoted current assets. Five earlier Linux/Xvfb captures remain
  preserved with their dated manifests as historical evidence, explicitly
  outside this Windows exact set.
- #78: optional Cheap LFS payload encryption has a usable passphrase flow,
  authenticated ciphertext, legacy plaintext compatibility, and documented
  failure behavior.
- #80: user-initiated push/fetch/pull failures are observed exactly once and
  present the actionable underlying failure without a duplicate generic toast.
- #81: repository and tab groups can be managed as first-class entities and a
  group exposes a usable member dropdown.
- #82: expensive startup/view work loads progressively without a blocking
  screen, while errors and cancellation remain visible and recoverable.
- #83: independent English and Cantonese funny-level controls are visible,
  accessible, persisted, and reflected in previews.
- #85: decrypting encrypted Cheap LFS content reports a truthful decrypting
  stage rather than a decompressing stage.
- #86: repository removal/re-addition cannot orphan or accidentally reuse a
  saved Cheap LFS passphrase.
- #87: an encrypted unattended commit-time Cheap LFS pin has a safe,
  deterministic passphrase path and never hangs or silently uploads plaintext.
- #89: appearance editing is reachable with Shift+right-click while ordinary
  right-click retains its native/context-menu meaning.
- #92: tab-group create/edit dialogs render on the dialog layer and keep every
  color choice visible and keyboard reachable.
- #94: tab-group help is removed after its owner disappears, including at
  1440×960 and 1180×820.
- #95: every visible and accessible tab-count phrase uses a truthful singular
  or many form in English and natural classifier phrasing in Cantonese.
- #96: working-tree Cheap LFS inventory must never submit changed/untracked
  content to an unbounded Git grep. Raw and pointer-looking oversized payloads
  receive only a securely identity-proven 512-byte header read; pointer-shaped
  files continue to fail closed on malformed, oversized, or unverifiable
  metadata.

## Issue #96 strengthened source checkpoint

- Working-tree Git inventory now returns names only. Explicit pathspecs are
  validated before any of the working/index/HEAD tasks start.
- The tracked-path store reads at most 512 bytes from a settled,
  identity-proven regular single-link file, then revalidates the handle,
  visible path, and canonical parents. Symlinks/reparse points, gitlinks,
  unsafe traversal, identity drift, and invalid numeric bounds fail closed.
- Regression fixtures use NTFS sparse files at the issue's exact
  **55,581,030,080-byte** logical size. Git Trace2 proves that name inventory
  runs and `grep --untracked` does not.
- The final affected pair passes **82/82**. The complete Cheap LFS directory
  passes **673/673 across 48 files and 89 suites** in 187.55 seconds.
- Two independent adversarial reviews found no remaining actionable blocker in
  the reported working-tree scope. Index/HEAD object inventory is a separate
  broader hardening opportunity and is not represented as part of this fix.
- This is a local source checkpoint only. Final typecheck/lint, exact MCP
  production build, remote-default ancestry, applicable remote workflows, and
  the finished issue receipt remain required.

## Post-checkpoint acceptance and CI reconciliation

- Pushed checkpoint:
  `2fedf140e394fa2fea3e380203e716b6f7aa8628`.
- Reviewed gate-repair/provenance checkpoint:
  `107bd91a003f490fa3d91cc642a7beaa350d2c35`; branch CI
  [`30376865471`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30376865471)
  is queued. Rolling/public receipts:
  [Discussion #54](https://github.com/Ding-Ding-Projects/desktop-material/discussions/54#discussioncomment-17815363)
  and
  [issue #23](https://github.com/Ding-Ding-Projects/desktop-material/issues/23#issuecomment-5106684118).
  Those earlier receipts printed a nonexistent source-gate SHA. Public
  corrections are
  [Discussion comment 17815648](https://github.com/Ding-Ding-Projects/desktop-material/discussions/54#discussioncomment-17815648)
  and
  [issue #23 comment 5107001088](https://github.com/Ding-Ding-Projects/desktop-material/issues/23#issuecomment-5107001088);
  only `107bd91a003f490fa3d91cc642a7beaa350d2c35` is authoritative.
- Branch CI:
  [`30370044526`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30370044526).
  Lint, Windows TUI core, and packaged Windows x64 E2E smoke passed. The
  845-file/6,957-test Windows x64 unit run had exactly seven leaf failures: two
  deliberate missing-updater gallery gates and five stale source/copy
  assertions. The three Linux TUI matrix jobs stopped only at the generated
  parity-contract hash, which has been regenerated from the current 201-row
  source. Windows arm64 script tests stopped only at the documentation catalog;
  newer `main` contains that repair, and the generator will run again after
  final documentation reconciliation.
- Three source-shape tests have been aligned with current lazy
  repository-tools JSX wiring, the shared context-menu appearance helper, and
  localized subtree failure copy. Updater/wiki tests intentionally stay
  fail-closed until the new current-source updater frame exists.
- The acceptance audit found two otherwise unexecutable command templates.
  The internal-browser receipt now targets
  `<internal-root>\internal-browser-cdp-receipt.json`, a direct run-root child.
  The Ollama receipt now targets
  `<p0-root>\captures\material-ollama-model-manager.json`, a direct child of
  the verifier-owned captures directory. A cross-contract assertion pins both
  containment rules. The repaired app-test batch passes **46/46 across 3/3
  files**; checked generation accepts the regenerated 201-row parity contract;
  and the gallery plus live Cheap LFS contracts pass **75/75**. Prettier,
  application-test ESLint, verifier lint under its intentional
  CommonJS/synchronous overrides, syntax checks, and `git diff --check` are
  green. Logs:
  `%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65\logs\post-ci-repair-{targeted-tests,contracts,format-lint}.log`.
- The post-audit open set is exactly #23, #80, #81, #82, #85, #87, #94, #95,
  and #96.
- The active `codingmachineedge` identity cannot read
  `DingDingChae/desktop-material-cheap-lfs-private-20260722-153308`.
  `cheap-lfs-ui-acceptance.png` pins its retained pre-compression UI commit
  `e56519d4742c63bb2c9f5f1e917de3fca7379fdd`. No alternate repository or
  historical frame is accepted as a substitute.
- The `cloud-compression` scenario currently pins that same pre-compression
  commit while also requiring the compressed pointer first documented at
  `6259b0fa0dc6c65cdb5a90af8e1da9358b45b0ac` and current
  no-private-workflow encrypted-builder routing. The recorded contract is
  therefore not satisfiable from the documented `e56519d…` tree. Read access
  is required to inspect authentic later history before selecting a corrected
  SHA. If no retained commit meets both current conditions, a new narrowly
  scoped fixture commit requires separate owner authorization.
- The live verifier now bookends read-only Git state before attachment, after
  the settled production cloud surface, and immediately after capture. Every
  sample requires clean `main`, exact `origin/main`, the reviewed SHA, the
  reviewed GitHub origin, and unchanged real-directory identities for the
  repository root and `.git`; Git's reported top-level and absolute Git
  directory must match those owned paths. The cloud sample also proves the
  private workflow absent from `HEAD`, the index, and the real working tree;
  link/junction parents, ignored occupants, and every other non-absence fail
  closed. Version-2 receipts canonically bind the reviewed commit, hashed
  origin, filesystem identity, and absence booleans. Capture writes are
  exclusive, flushed, and identity-cleaned; fully written receipts publish
  atomically without overwriting. The focused contract passes **20/20**,
  including dangling-link, injected-write, and atomic-publication probes. These
  gates do not resolve the missing access or select a replacement SHA. A
  mutation that begins and fully reverts between samples is the residual
  read-only TOCTOU limit; freezing or mutating the real acceptance environment
  would invalidate the test.

## Final-build issue acceptance matrix

Existing PNG presence is not acceptance. All visual rows below require the
fresh final build, original-pixel inspection, privacy checks, and retained
receipts where declared.

<!-- markdownlint-disable MD013 -->

| Issue | Exact verifier/scene | Required candidate evidence | Ordering and fixture constraint |
| --- | --- | --- | --- |
| #23 | `gallery_capture_plan.js`; canonical capture; every declared specialist verifier; Pages verifier | 84 promoted Windows PNGs: 67 canonical plus 17 specialists; specialist receipts; Pages desktop/mobile captures | Canonical driver emits 68 candidates, but `material-cheap-lfs-preparing.png` is deferred. The private live pair and packaged updater are separate gates. |
| #80 | `capture_gallery_cdp.js --scenes canonical-remote-warning-evidence` | `canonical-remote-warning-1280x860.png`; `canonical-remote-warning-evidence.json` | Provider-backed P0 fixture, English, clean branch ahead of origin; exactly one actionable warning, no generic duplicate, dialog, receive-pack, or ref mutation; restore origin. |
| #81 | `capture_gallery_cdp.js --scenes tab-group-management-evidence` | collapsed, edit, and persisted 1280×860 PNGs; `switch-receipt.json` | Fresh isolated profile with one ungrouped tab and zero groups; the scene creates two fresh Git repositories. Also refresh the gallery tab-group frame. |
| #82 | `verify_progressive_loading_cdp.js` | failure and recovered 1280×860 PNGs; `issue82.json` | **First action in a fresh renderer**, before another deferred section opens; require all seven `repository-*.js` chunks; restore the sabotaged chunk and verifier state. |
| #85 | real operation fixture, then `verify_issue_85_encrypted_restore_cdp.js` | `operation.json`; `decrypting-bilingual.png`; `decrypting-bilingual.json` | Separate owned direct-Temp root and disposable Git repository; prove genuine Downloading → Decrypting → Decompressing → Verifying → Materializing callbacks. |
| #87 | canonical `error-notice` plus `cheap-lfs-commit-password-evidence` | `material-error-notice.png`; `commit-auto-pin-password-dialog.png` | Provider-backed fixture; background path is one non-modal skip notice with no password dialog, upload, anchor, or swallowed commit; interactive scene proves the real empty-password dialog and cancellation. |
| #94 | `capture_gallery_cdp.js --scenes tab-group-tooltip-dismissal-evidence` | 1440×960 and 1180×820 dismissal PNGs | Fresh profile; zero stale owner tooltip, dialog in `#dialog-layer`, six usable swatches, contained geometry. |
| #95 | `capture_gallery_cdp.js --scenes tab-group-member-singular-evidence` | `tab-group-member-singular-1280x860.png` | Fresh English/light profile; visible and accessible copy must both say “1 tab”; unit tests carry zero/many and Cantonese. |
| #96 | affected pair, then complete `app/test/unit/cheap-lfs` suite | test/build/CI logs; no PNG | Recorded source checkpoint is 82/82 and 673/673; rerun final-tree typecheck/lint/build and prove pushed-default ancestry and CI. |

<!-- markdownlint-enable MD013 -->

The P0 UI order is fixed: prepare the fixture/provider, launch the final
unpackaged build on the owned desktop, run #82 first in the untouched renderer,
then canonical and other P0 scenes. #81 uses a separate fresh profile, #85 a
separate owned root, and the updater a separate exact packaged development
build and desktop. Never promote a partial gallery.

## Ordered background interactions

1. Preflight the exact lowlevel-computer-use MCP HTTP server, scheduled-task
   command, and MCP checkout revision.
2. Run the reproducible unpackaged production build through the MCP server.
3. Create one owned temporary run root containing deterministic Git fixtures,
   isolated app user data, captures, logs, and a cleanup ledger.
4. Create one uniquely named off-screen Win32 desktop.
5. Launch only the freshly built Desktop Material Electron binary with
   `--disable-gpu`, the isolated user-data directory, and the disposable
   fixture supplied through `--cli-open`.
6. Resolve the live HWND from the saved PID, capture a stable nonblank frame,
   and use only HWND-targeted allowlisted input.
7. Exercise each UI acceptance path, recapturing after every meaningful state
   transition.
8. Inspect candidate PNGs at original resolution, promote only accepted
   captures, then verify dimensions, bytes, and SHA-256.
9. Gracefully close the verified HWND, fall back only to the exact saved PID,
   close the owned desktop, and remove only containment-checked owned paths.

## Fixture and capture contract

- Primary run root:
  `%TEMP%\DesktopMaterial-close-all-open-issues-20260728-1581a0ec8c65`
- Short-path repository-specialist/P0 runtime root:
  `%TEMP%\desktop-material-p0-ui-c1581a0e` (kept below the established gallery
  fixture path-length ceiling and matching the fixture scripts' ownership
  prefix)
- UI-state specialist root:
  `%TEMP%\desktop-material-gallery-ui-state-20260728-1581a0ec8c65`
- live Cheap LFS specialist root:
  `%TEMP%\desktop-material-gallery-cheap-lfs-live-20260728-1581a0ec8c65`
- Cheap LFS commit-progress specialist root:
  `%TEMP%\desktop-material-cheap-lfs-progress-20260728-1581a0ec8c65`
- Cheap LFS restore-progress specialist root:
  `%TEMP%\desktop-material-cheap-lfs-restore-progress-20260728-1581a0ec8c65`
- final issue-#85 decrypting-operation verifier root:
  `%TEMP%\desktop-material-cheap-lfs-restore-progress-issue85-20260728-1581a0ec8c65`
- internal-browser specialist root:
  `%TEMP%\desktop-material-internal-browser-cdp-20260728-1581a0ec8c65`
- updater-ready specialist root:
  `%TEMP%\desktop-material-updater-ready-20260728-1581a0ec8c65`
- Ollama specialist root:
  `%TEMP%\desktop-material-ollama-20260728-1581a0ec8c65`
- Every root above is independently owned, must be entered in the cleanup
  ledger before creation, and must be removed with post-run absence proof if it
  is created. A verifier may not substitute another direct-Temp path.
- Cleanup ledger:
  `docs/verification/close-all-open-issues-2026-07-28/cleanup-ledger.md`
- Headless desktop:
  `DesktopMaterialCloseIssues-20260728-<unique>`
- Theme: capture the theme required by each existing public target; the
  canonical 67-image Windows batch uses light/English exactly as declared by
  `gallery_capture_plan.js`.
- Dimensions: preserve each tracked target's documented dimensions; new
  milestone frames default to 1440x960, with any responsive variants recording
  their exact requested and observed sizes.
- Candidate capture location: beneath the exact verifier-owned root assigned
  above and recorded in the cleanup ledger only.
- Gallery promotion targets: only the 84 current Windows paths under
  `docs/assets/screenshots/`. Issue-specific acceptance frames and their JSON
  receipts are promoted only beneath this run directory. The five retained
  `linux-tui-*.png` assets are historical, are not capture-plan outputs, and
  must not be overwritten or promoted by this run. The July 22
  `auto-updater-update-ready.png` legacy-migration blob is likewise reserved
  historical evidence; current-source updater acceptance uses a distinct
  gallery target.

## Change and documentation allowlist

- Product sources under `app/src/` needed by the starting and discovered issues
- Regression and verification tests under `app/test/`, `script/`, and `tui/`
  when directly relevant
- Deterministic capture tooling under `script/`
- Deterministic headless capture plans and CDP drivers under
  `.codex/verification/`
- Issue-required public screenshots under `docs/assets/screenshots/`
- README, roadmap, Pages, gallery, and wiki references in `README.md`,
  `ROADMAP.md`, `site/index.html`, `docs/`, and `_config.yml`; `ROADMAP.md` and
  `site/index.html` are in scope because #23 requires the current 84-scene
  boundary and private cloud-compression behavior to stay truthful on every
  public catalogue surface
- This run's records under
  `docs/verification/close-all-open-issues-2026-07-28/`
- `HANDOFF.md`

Any path outside this allowlist requires an explicit manifest update explaining
why it is necessary before it is staged.

## Verification gates

- Issue-focused regression tests, including proof that each regression test
  fails when its corresponding fix is reverted where practical
- `node script/test.mjs` full suite
- `node script/test.mjs script`
- `npx tsc --noEmit`
- `yarn lint`
- repository-wide Prettier check
- relevant TUI tests, Ruff, mypy, and package build if TUI files change
- exact MCP production build and off-screen interaction/capture acceptance
- exact 84-row gallery/capture/Pages set, with the five historical Linux/Xvfb
  assets present but excluded from current figures and promotion
- `git diff --check`, full/staged diff review, and secret scan
- pushed `origin/main` SHA equality and ancestry proof for every completed
  source branch/worktree
- applicable CI, Pages, installer/release, README image, and wiki image checks

Issue closure requires shipped remote ancestry plus acceptance evidence. If an
issue is genuinely blocked by missing external authority or information, the
run will record the exact blocker and will not misrepresent it as closed.

## Headless preflight receipt

- `startup_status`: `ok: true`, installed, scheduled task state `Ready`
- Scheduled task: `\LowLevelComputerUseMCP`
- Executable: `uv`
- Arguments:
  `run --directory C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp lowlevel-computer-use-mcp --http --host 127.0.0.1 --port 8765`
- Working directory:
  `C:\Users\cntow\Documents\GitHub\lowlevel-computer-use-mcp`
- MCP checkout HEAD:
  `f2edfe442555cfe35a519dd0b058986cb09d6ee3`
- Endpoint: `http://127.0.0.1:8765/mcp`
- Every preflight call returned `client_ok: true`, `returncode: 0` where
  applicable, and `timed_out: false`.

## Final `main` integration updater capture continuation

- Start: `2026-07-28T20:18:18-04:00`
- Run ID: `main-integration-updater-20260728-441a0f01ca54`
- Mode: `publish`
- Milestone: merge both July 28 task lineages, repair their integration gates,
  capture the genuine current-source updater-ready surface, then push and prove
  the exact Windows CI/installer release.
- Project worktree:
  `C:\Users\Administrator\Documents\GitHub\desktop-material`
- Initial Git state: `main` at `46e82d2b66fb134871d0da6810f26a84bd8bbf0b`
  with `MERGE_HEAD` `f2629903525684ea4073557a186b0e58ce397c70`;
  the dirty index and working tree are the intentional in-progress integration
  of the two named task branches plus pre-push gate repairs.
- Remote: `https://github.com/Ding-Ding-Projects/desktop-material.git`
- Active GitHub account: `DingDingChae`
- Expected publication branch: `main`; force push is prohibited.
- Expected UI state: the real freshly built Windows application shows the
  current-source auto-updater **Update ready** surface named by
  `verify_gallery_auto_updater_ready_cdp.js`, with no private data, clipping,
  blank pixels, or unrelated desktop content.
- Ordered background interaction: preflight the fixed HTTP MCP and scheduled
  task; build through MCP; prepare the verifier-owned updater fixture and
  isolated user data; create one uniquely named headless desktop; launch the
  exact saved executable/PID; resolve its HWND at runtime; capture before input;
  drive only the verifier's HWND-targeted interactions; inspect the final PNG;
  promote it only after acceptance; then revalidate the HWND/PID and clean up
  the app, desktop, and owned temporary paths.
- Disposable root:
  `%TEMP%\desktop-material-updater-ready-20260728-441a0f01ca54`
- Headless desktop:
  `DesktopMaterialMainUpdater-20260728-441a0f01ca54`
- Screenshot target:
  `docs/assets/screenshots/auto-updater-current-source-ready.png`; dimensions
  and theme are the exact values declared by the updater verifier.
- Documentation allowlist: this run manifest, its cleanup ledger, `README.md`,
  `HANDOFF.md`, `ROADMAP.md`, `site/`, `docs/wiki/`, generated docs catalog
  outputs, and the single screenshot target.
- Required gates: updater verifier contracts, gallery/site/wiki contracts,
  `yarn lint`, `npx tsc --noEmit`, full unit/script suites, x64 production
  build/package/E2E, parity check, diff/secret review, pushed-default ancestry,
  remote CI/Pages/CodeQL/installer success, and a nonempty installer-bearing
  release targeting the exact pushed commit.

### Continuation preflight receipt

- `startup_status`: `ok: true`, installed, scheduled task state `Ready`.
- Scheduled task: `\LowLevelComputerUseMCP`.
- Executable:
  `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp\.venv\Scripts\python.exe`.
- Arguments:
  `-m lowlevel_computer_use_mcp.server --http --host 127.0.0.1 --port 8765`.
- Working directory:
  `C:\Users\Administrator\Documents\GitHub\lowlevel-computer-use-mcp`.
- MCP checkout HEAD:
  `547a102a49169d41da876de217856229ab7c03a1`.
- Endpoint: `http://127.0.0.1:8765/mcp`.
- Every continuation preflight call returned `client_ok: true`;
  `run_command` also returned `returncode: 0` and `timed_out: false`.
