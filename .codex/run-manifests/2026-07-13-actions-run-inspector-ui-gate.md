# Desktop Material Actions run inspector production UI gate

- Mode: `publish`
- Run id: `dm-actions-run-inspector-20260713-93cb7f41`
- Branch: `mega-feature-update`
- Expected remote: `origin` (`codingmachineedge/desktop-material`)
- Exact built and exercised source: `2f40d8949aaa7ae4ce5418cd949c28c643da0a37`
- Owned off-screen desktop: `DesktopMaterialRunInspector-20260713-93cb7f41`
- Disposable fixture root: `%TEMP%\desktop-material-p0-ui-20260713-actions-run-inspector-93cb7f41`
- Screenshot theme and target: light; original 960×660 job pagination and 944×808 pending-deployment PNGs
- Public repository mutations authorized: milestone commits/pushes, separate wiki merge/push, and Pages workflow dispatch; no GitHub API mutation may target a public provider

## Product contract

This milestone completes the existing Actions run-detail surface as purpose-built app functions. Users may load more jobs, choose a current or earlier attempt, open logs or re-run a loaded job, inspect pending deployment environments, approve or reject selected environments with a bounded comment, and approve an eligible fork pull-request run. No Git/`gh` command editor, REST method/path editor, GraphQL document editor, or searchable command/API catalogue may be exposed.

## Expected UI state and interactions

1. Open **Actions** in an isolated repository and select the deterministic inspector run.
2. Confirm attempt controls identify the current attempt and permit an earlier attempt without free-form input.
3. Load 50→51 jobs through **Load more jobs**, prove the page-two sentinel appears exactly once, and retain page one after a simulated later-page failure/retry.
4. Open logs for the page-two job and request its confirmed re-run using that exact job id and selected account.
5. Inspect two pending deployment environments with long wrapping names, reviewer identities, and wait-timer/protection context.
6. Select the approvable environment, enter a bounded review comment, review the exact intent, then exercise **Approve deployments** against the isolated provider; provider/API tests prove the same exact contract for `rejected` while the second environment remains visibly locked.
7. Exercise the separate confirmed **Approve fork run** function only when the fixture marks the run as approval-eligible.
8. Use the focused React regression gate to change run, attempt, repository, and account while requests are pending and prove stale responses cannot repopulate the surface; the live CDP gate exercises the stable end-to-end user paths above.

## Deterministic provider contract

- One run has two attempts and 51 jobs per attempt, delivered in fixed 50-item pages.
- Page two contains one deliberately long job sentinel with long step metadata and a retriable one-shot failure mode.
- Attempt paths, page numbers, log job ids, re-run job ids, pending deployment reads, and review bodies are recorded exactly.
- Pending deployments contain multiple environments, long names, long reviewer identities, and bounded protection metadata.
- Approval and rejection accept only exact selected environment ids, `approved`/`rejected` state, and a bounded normalized comment.
- Fork-run approval is a separate bodyless confirmed request and is never inferred from deployment-review state.

## Responsive and geometry matrix

- Regular production window.
- Supported 960×660 outer-window request.
- Supported minimum width with short height.
- Requested 200% base scale through actual app menu actions with auto-fit enabled, plus manual-scale inspection if the surface remains usable without auto-fit.
- Long run, job, step, environment, reviewer, branch, actor, comment, and error text.
- Light and dark screenshot candidates; promote only stable, privacy-safe, original-resolution captures.

Every accepted state must have equal document/body client and scroll widths, no page or dialog horizontal scrolling, no clipped visible controls, no interactive controls outside their containing surface or viewport, and no overlapping siblings. Horizontal scrolling is allowed only inside the intrinsically spatial log viewer.

## Declared checks

- Strict job-page and pending-review parser/validator tests.
- API path/body/status tests for current and historical attempts, pages, pending deployments, deployment reviews, and fork-run approval.
- Store account-routing and capability-aware error tests.
- React interaction, retained-page retry, stale-request cancellation, confirmation, focus, and accessibility tests.
- Deterministic loopback provider tests plus an Actions run-inspector CDP verifier.
- Focused TypeScript, lint, formatting, style-contract, and production-build checks.

## Implementation checkpoint

- The renderer exposes purpose-built attempt selection, bounded job paging, later-page retry, exact job logs/re-run, deployment review, review history, and fork-run approval controls. It does not expose a command, endpoint, method, or GraphQL editor.
- The API layer uses fixed current-attempt and historical-attempt paths, bounded streamed metadata, strict response validation, exact normalized review bodies, and bodyless fork approval.
- The store routes every new read and mutation through the repository-selected same-endpoint account and maps account, permission, unsupported-version, conflict, and service failures to bounded actionable copy.
- Same-run attempt changes abort the prior request and increment the operation generation. Later-page failures retain already loaded jobs and leave the named retry control available. Re-running a recovered job preserves the selected attempt and all loaded pages.
- Long run/job/step/environment/reviewer/comment/error text and action groups have zero-min-width, wrapping, stacking, and bounded-dialog style contracts. The job log header now wraps globally; the intrinsically spatial log body remains the only allowed horizontal-pan surface.
- Focused result before provider work: TypeScript `--noEmit` passed, targeted ESLint passed with the repository rule directory, Prettier rewrote the touched TypeScript/SCSS files cleanly, and the Actions suite passed 124/124 checks across 22 suites. The regression set now includes bounded single-byte JSON chunks, nonshrinking totals, 101-attempt reachability, retained-list recovery, latest-attempt historical-page reconstruction, shorter-page stopping, eligibility invalidation, and modal focus containment.
- Deterministic provider checkpoint: 11 tests and a live read-only probe pass for run `84152`/attempt 2, current jobs `85051`→`85101`, historical jobs `85000`→`85050`, a one-shot current page-two 503, exact log redirect/content, two pending environments, review history, stateful exact review/fork/re-run mutations, unchanged artifact integrity, and blocked receive-pack. The probe intentionally leaves the retry fault unconsumed for the UI interaction.
- The dedicated `verify_actions_run_inspector_cdp.js` verifier passes `node --check` and audits document/body width, named panels, clipping, sibling overlap, oversized headings, modal count, focus containment, and scrim pointer ownership.
- A first production interaction exposed a real short-window dialog defect: the deployment footer extended 7 pixels below the renderer because the layer was positioned against the tall scrolled Actions view. Fixed viewport positioning was committed and pushed at `2f40d8949a`, then rebuilt with the exact production command in 115 seconds.
- The rebuilt interaction loaded current and historical 50→51 job pages, recovered the reserved current page-two 503 on retry, opened exact redirected logs, re-ran job `85101`, reviewed two pending environments, approved environment `86101` with the exact bounded comment, and separately approved the eligible fork run.
- The provider recorded only the expected three POST mutations. Regular-height, supported short-height, true 960×660 capture, and requested 200%-base states had equal document/body client and scroll widths with empty overflow, clipping, outside-control, overlap, and oversized-text arrays. Every modal had one layer, contained focus, and owned pointer input.
- Promoted and original-resolution-inspected evidence: `material-actions-jobs-pagination.png` (960×660, 111,675 bytes, SHA-256 `0e61eb4e66c20bffbeac76c79eebb9508d44160cb104feb8fc47f2617dc94b90`) and `material-actions-pending-deployments.png` (944×808, 98,249 bytes, SHA-256 `6eea1333755d5edad469c8d0d06b8a3d62e43c991e6bc9de5e98080dee75c1bc`).
- Publication and cleanup complete: primary-repository documentation/evidence commit `6d00ab73531d5359d821b6fccef2bf9ffffb3035`, separate-wiki commit `e4f4a49a973a442078369c61b7c6da9696fd38a7`, Pages run `29283239381`/artifact `8292133247`, and the exact cleanup ledger below all passed.

## Documentation and evidence allowlist

- `README.md`
- `HANDOFF.md`
- `.codex/run-manifests/2026-07-13-actions-run-inspector-ui-gate.md`
- `docs/wiki/Home.md`
- `docs/wiki/User-Guide.md`
- `site/index.html`
- `.codex/verification/verify_pages_gallery_cdp.js`
- `docs/assets/screenshots/material-actions-jobs-pagination.png`
- `docs/assets/screenshots/material-actions-pending-deployments.png`

## Publication and cleanup receipt

Implementation, focused checks, deterministic provider, exact production build, hidden-desktop interaction, request receipt, responsive/modal geometry, screenshot inspection, and documentation publication are complete. The exact isolated POST receipt was job `85101` re-run (201, bodyless), run `84152` deployment review (204, body SHA-256 `32a6c1c2d4615f352f1d0060b11e688d3cf020146027c4ada23d56e82e460be8`), and run `84152` fork approval (204, bodyless), with current page two returning 503 then 200. The assembled Pages layout rendered 25 nonzero images across 24 gallery cards. At 960×660, document/body client and scroll widths were all 945; at 390×844 they were all 375. Overflow and outside-control arrays were empty, both new images retained their exact natural dimensions, and original desktop/mobile gallery captures were inspected.

- Primary-repository evidence and the two tracked PNGs were committed and pushed at `6d00ab73531d5359d821b6fccef2bf9ffffb3035`; local, tracking, and direct remote SHA matched with a clean worktree.
- The live wiki's newer pages were preserved while the Actions material was merged. Commit `e4f4a49a973a442078369c61b7c6da9696fd38a7` is present locally, on tracking, and on the direct wiki remote. Public Home and User Guide HTML contained the new workflow copy and image tags; raw Home/User Guide sources returned 200. Public raw wiki PNG responses returned 200 with 111,675 and 98,249 bytes and the two tracked SHA-256 values.
- Pages run `29283239381` targeted `6d00ab73531d5359d821b6fccef2bf9ffffb3035`. Checkout, Configure Pages, assembly, and upload all passed. Artifact `8292133247` (`github-pages`, 3,041,802 bytes) contained 41 traversal/link-safe entries; downloaded `artifact.tar` SHA-256 was `2c77b6bcac18a8c4214ad785c07533ed222c80f643b0eb4c3d7352c22602d935`. Its `index.html` and both PNG Git blob ids exactly matched the pushed source, and the extracted PNG SHA-256 values matched the promoted evidence. Deployment was correctly rejected before a runner started because `mega-feature-update` is not allowed by the `github-pages` environment protection rules.
- The fixture remote was restored to `http://material-provider.invalid/material-fixture-owner/material-fixture.git`. The exact `GitHub Desktop Dev - http://localhost:64402/api/v3` / `material-verifier-p0` credential was deleted and read back absent. The alternate-desktop window rejected the generic graceful-close resolver, so the revalidated saved launch-PID fallback terminated only owned app PID `6392`; the exact Edge PID `17552` and provider launcher/worker PIDs `16448`/`5416` were also terminated with their owned trees. PIDs and listeners on `62208`, `62209`, and `64402` were absent afterward.
- `DesktopMaterialRunInspectorDocs-20260713-93cb7f41` and `DesktopMaterialPagesActions-20260713-93cb7f41` each reported zero windows, closed exactly once, and subsequently returned not found. The containment-checked run root and separate wiki clone both resolved beneath `%TEMP%`, were removed, and returned `Test-Path=false`. The visible user desktop was never shown, focused, resized, or used for input.
