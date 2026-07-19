# CI recovery and ten-pass submodule navigation publish manifest

- Run date: 2026-07-18 (America/Toronto)
- Mode: `publish`
- Run id: `20260718-232824-ci-10-pass-submodule-navigation`
- Milestone: repair the failing Windows packaged E2E CI gate; let Submodule
  Manager open a checked-out submodule as a temporary repository context
  without registering it in the persistent repository list; provide a Back
  action that returns to the parent repository and whose presentation is
  configurable from the existing profile-backed Appearance settings; complete
  ten off-screen debug passes, fix discovered defects, refresh public evidence,
  and push the verified result to `main`
- Expected UI state: every checked-out Submodule Manager row exposes an
  unambiguous **Open as repository** action; opening it renders the submodule as
  the active repository context while the persistent repository-list cardinality
  and database remain unchanged; a visible and keyboard-reachable Back action
  identifies and returns to the parent repository; Appearance offers a
  persisted, live-previewed Back-action customization with safe defaults and
  English, playful Hong Kong-style Cantonese, and bilingual copy
- Ordered background interactions: preflight the fixed low-level MCP HTTP
  server and scheduled task; fast-forward the initially clean checkout to the
  authoritative remote `main`; reproduce and repair CI locally; implement and
  test the scoped navigation/customization flow; run the exact production build
  through MCP; create one owned Git fixture containing a real checked-out
  submodule and an isolated user-data path; create one uniquely named Win32
  headless desktop; launch only the fresh Electron build there; resolve the
  current HWND dynamically; execute and capture the ten passes below; close the
  revalidated HWND (saved-PID termination only as fallback), close the desktop,
  and remove only containment-checked owned temporary paths
- Disposable fixture root:
  `%LOCALAPPDATA%\Temp\desktop-material-p0-ui-debug-20260718-232824`
  (must be absent before creation); all fixture repositories, user data, logs,
  and temporary captures stay beneath this exact root
- Headless desktop: `DesktopMaterialDebug10-20260718-232824`, created exactly
  once; launch PID and runtime HWND must be recorded after launch
- Screenshot presentation: deterministic `1440x960` light-theme primary
  captures, plus bounded compact/dark/scaled variants; every promoted capture
  must be inspected at original resolution for nonblank pixels, clipping,
  private data, theme, and exact dimensions
- Screenshot targets: replace the contaminated or invalid
  `material-repository-tools.png`, `material-repository-tools-scroll.png`,
  `material-effective-branch-rules.png`, `add-submodule-dialog.png`, and
  `material-customization.png` frames, and add
  `material-submodule-context.png` for the Submodule Manager open action plus
  temporary child/Back context. Promote only accepted pixels under
  `docs/assets/screenshots/`, then update README, Pages, and actual Markdown
  images in `docs/wiki/` to those same tracked assets.
- Documentation allowlist: `README.md`, `ROADMAP.md`, `HANDOFF.md`, `PLAN.md`,
  categorized submodule/appearance documentation and indexes under `docs/`,
  `docs/wiki/Home.md`, `docs/wiki/User-Guide.md`, `docs/wiki/Submodules.md`,
  `docs/wiki/Feature-Gallery.md`, `site/index.html`, this manifest, and accepted
  screenshot assets
- Implementation allowlist: Submodule Manager/view/store/dispatcher navigation,
  repository context/session lifecycle, repository persistence boundaries,
  Appearance model/normalization/profile history/UI/theme styles, localization
  resources, focused tests, Windows packaged E2E/CI support, and deterministic
  verification helpers required by this milestone
- Tests: focused success/failure/stale/uninitialized/path-containment,
  non-registration, Back return/focus, multi-tab/window/session cleanup,
  customization normalization/persistence/rollback/live preview, all three
  language modes, compact/dark/scaled accessibility, Windows packaged E2E
  reproduction, repository-wide unit/script tests, TypeScript, lint, formatting,
  exact MCP production build, ten original-resolution headless inspections,
  diff/staged checks, and secret scans
- Remote: `https://github.com/codingmachineedge/desktop-material.git`, authenticated
  account `codingmachineedge`, default/expected branch `main`, no force push
- Initial repository state: clean local `main` at
  `a928ff9c34e79747eec969efefdf35e42143aa95`; one worktree, only local/remote
  `main`, no stash, and `0/0` against the then-stale local tracking ref. Direct
  remote proof subsequently resolved `refs/heads/main` to
  `19c1e2a06d0746f4c371d37a1c102ae961011f90`; fast-forward before editing and
  preserve all incoming work.
- CI baseline: run `29671087941` for remote source
  `19c1e2a06d0746f4c371d37a1c102ae961011f90` failed only in **E2E Smoke Windows
  x64 → Run packaged E2E smoke tests**; macOS packaged E2E, both Windows builds,
  both macOS builds, lint, and installer run `29671087924` succeeded
- Cleanup invariant: after exact-SHA remote proof, leave one clean canonical
  `main` checkout at `origin/main`, no staged/unstaged/untracked task work, no
  stash or unmerged branch/worktree, no owned headless desktop/process/listener
  or fixture path, and prove every completed source tip is an ancestor of pushed
  remote `main`

## Ten-pass matrix

1. Fresh launch and fixture-open stability at `1440x960` light theme; verify a
   nonblank frame, correct repository identity, no crash/error notice, and the
   initial persistent repository-list count.
2. Open Submodule Manager from Repository Tools; verify search/counters/status,
   checked-out versus unavailable-row gating, keyboard order, and the new
   **Open as repository** action; capture the manager evidence.
3. Open the checked-out submodule; verify active path/worktree/branch identity,
   content and Git operations are scoped to the child, no persistent repository
   database/list mutation occurs, and the Back action identifies the parent;
   capture the primary navigation evidence.
4. Use Back; verify exact parent restoration, prior tab/selection/scroll/focus
   continuity, no duplicate repository entry, and safe behavior after child HEAD
   or worktree state changes.
5. Reopen the submodule, exercise repository-tab switching and a controlled app
   restart; verify temporary context/session restoration policy, parent linkage,
   and no repository-list pollution across restart.
6. Open Appearance; customize the Back action, verify live preview, Save,
   Cancel rollback, profile local-Git history, invalid/legacy-value fallback,
   and capture the Appearance evidence.
7. Repeat child open/Back at compact dimensions with keyboard-only input and
   focus-visible/screen-reader labels; verify no horizontal page overflow,
   clipped label, unreachable control, or obscured content.
8. Repeat in dark theme and at 200%/auto-fit scaling; verify contrast, hit
   target, icon/text alignment, responsive fallback, and stable parent identity.
9. Exercise English, playful Hong Kong-style Cantonese, and bilingual modes on
   the manager, child-context Back action, confirmation/error copy, and compact
   layout; verify persisted language selection and safe fallback.
10. Regression sweep representative high-risk surfaces (Changes/History,
    Actions, Notifications, Releases, Repository Tools, Settings), then return
    through the child/parent flow; verify no blank frame, crash, stale context,
    repository-list mutation, private data, clipping, or cleanup leak.

## Receipts

### Local result

- Local acceptance: **COMPLETE** on 2026-07-19.
- Owned local runtime cleanup: **COMPLETE**. The app, provider, CDP listener,
  credential entry, headless desktop, and run root were each confirmed absent.
- Remote publication and final repository cleanup: **PENDING**; no remote SHA,
  run, release, Pages deployment, wiki commit, or clean published-checkout result
  is implied below.
- Exact low-level MCP checkout:
  `8d6940be6a5f6e7c37de3f73acd2259fa7651efe` at
  `http://127.0.0.1:8765/mcp`.
- Headless desktop: `DesktopMaterialDebug10-20260718-232824`.
- The desktop was created exactly once; the visible desktop and unrelated
  Electron processes were not used or mutated.
- Synthetic provider: PID `12096`, loopback port `50158`.
- App-native CDP: loopback port `62241`.
- Earlier accepted exact production build: exit code zero in **215.38 seconds**
  (**217 seconds wall time**). After the later stale-parent correction, the same
  MCP command rebuilt the renderer, but the client stream detached before a
  receipt returned; the fresh bundle passed the final duplicate Open/Back race
  regression recorded in `2026-07-19-final-exact-race-regression.md`.
- Final verifier state: pass `10`, persistent repository count `1`, repository
  tab count `1`, initialized child `modules/material-widget`, and uninitialized
  control `modules/dormant-addon`.
- Stable focused validation: **237/237**. The separate temporary-context
  lifecycle and localization sets passed **66/66** and **32/32**.
- Later supervised full unit validation: `node script/test.mjs` passed all
  **562** test files in three batches, with **3,986** passing tests, **one**
  skipped test, and a **537/537** final batch. Script tests passed **16/16**.
- TypeScript, full lint, actionlint for the changed workflows, and
  `git diff --check` passed.

### Runtime identities

| Stage | PID | HWND |
| --- | ---: | ---: |
| Diagnostic launch | 20380 | 67830826 |
| Accepted passes 1–4 | 6048 | 19464818 |
| Pass 5 and initial pass 6 | 17732 | 48956738 |
| Persistence-build verification | 13272 | 19661426 |
| Tokenized passes 6–9 before localization correction | 8624 | 73991674 |
| Final localized pass 9 and pass 10 | 32600 | 83101264 |
| Log-loop-fixed provider launch | 16460 | 90637818 |
| Fixture published-remote relaunch | 23188 | 56230330 |
| Final branch-rules environment launch | wrapper 24136; Electron main 5116 | 86050108 |
| Final post-build regression | wrapper 28356; Electron main 25584 | 62588622 |

### Ten-pass capture ledger

| Pass | Accepted file | Dimensions | Bytes | SHA-256 |
| ---: | --- | ---: | ---: | --- |
| 1 | `pass-01-launch-final.png` | 1440×960 | 110,384 | `21f098f11388e1b57028dbcf9288e51272932b9a8a14cd150d6a2e04766a981e` |
| 2 | `pass-02-manager-final.png` | 1440×960 | 140,353 | `2e883f275f7c888404a959d51be5dac0c88cf46fa39a343d4795315efd53c40d` |
| 3 | `pass-03-child-context.png` | 1440×960 | 103,250 | `25de28cb43ea3031f20788a52638095b0272b73424f4e36d7e43657ab7f381b0` |
| 4 | `pass-04-back-parent.png` | 1440×960 | 122,228 | `bec6bf8e2ae957ab8544df68babf12e6fffe88be179e0e88e996878619119ff5` |
| 5 | `pass-05-restart-policy.png` | 1440×960 | 140,116 | `a5402d2eb7b2a545c965eb0ce3a217a12a4fa634c7e85695ae050a3205b6e28e` |
| 6 | `pass-06-appearance-tokenized.png` | 1440×960 | 136,786 | `4e511ff542907575633335ffdd8d8eb379b13b3a2f5c08e32ca6cf51b4298169` |
| 7 | `pass-07-compact-keyboard.png` | 700×650 | 63,406 | `6cbbf7a893dbb0b5d111057364d040e1a57a6c42d30f2b392cb022fee6c2415d` |
| 8 | `pass-08-dark-200.png` | 640×480 | 61,722 | `2f79c502ce72fd4cfafe44b12ffd35e58d23ff703d507e6441e4ef846c3f37cf` |
| 9 | `pass-09-languages-localized.png` | 700×650 | 77,064 | `62c02c1040ecae78bfed9f7f24841b546719815994a772eaa1cd524c4ff9b4f9` |
| 10 | `pass-10-regression.png` | 1440×960 | 164,471 | `f86886bae8848f73bd35015cc9b87ba0dc3f2438c09791439347f2f697e71f0c` |

The separate stale bilingual recovery frame was 1443×993, 163,335 bytes,
SHA-256
`33a595e1faf1b7ade1b523c254ef826c0a9e5239c84a184a84e7cfe6f6b50a6b`.
The provider sweep accepted Actions at 1440×960, 109,546 bytes,
`bd682b6f465012f0737fd6e47eb054bdb58333c13d2eaaffdf092523b0529325`,
and Releases at 1440×960, 146,415 bytes,
`8dea0b61a0da101c730cb93e3534b5281d9aa3392c75acef8a1944cc36fbc1fb`.
It also accepted the effective branch-rules state at 1440×960, 162,231 bytes,
`6a391269c74dd638687100651f023d727667b47960ab2353a1717fde96037ba8`.

Two 2160×1440 Playwright pass-1 candidates were rejected because Windows 150%
device scaling changed the requested renderer pixels. Direct CDP capture
produced the exact accepted dimensions. Tooltip leakage, incomplete async waits,
and pre-fix localization candidates likewise did not advance the durable pass
state.

### Corrected defects and focused regression

The run corrected the persistent-database verifier, resilient toolbar and rail
selectors, bounded async waits, capture-only tooltip cleanup, Windows directory
`fsync`, same-PID/different-renderer profile-lock recovery, localized
stale-workspace recovery, notification-panel timing/close behavior, and the
recursive log-history profile Git-bookkeeping loop. Log-history failures now
disable their own queue before reporting, and timer/direct commits suppress the
history sink so Git bookkeeping cannot recursively log itself.

Localization resources are separated from rendering logic. Semantic localized
spans keep English, playful Hong Kong Cantonese, and bilingual labels,
separators, and accessible names correct across Submodule Manager, Add/Configure,
Appearance, Back context, repository tools, and CI status.

The final lifecycle audit added last-boundary guards across branch, tag, stash,
reset, merge, rebase, network, remote, worktree, submodule, subtree,
sparse-checkout, large-file, automation, shell/editor, and window-launch paths.
Temporary-child mutation and persistence are rejected, Repository Tools is
read-only, async cache generations are fenced, and listeners/controllers are
disposed on Back or context replacement.

A final exact-bundle race probe found and fixed one more harmless-but-important
identity edge: a legacy `gitDir` metadata refresh can replace a persisted parent
model while an already selected Submodule Manager popup still holds its prior
equivalent instance. The open boundary now rebinds only that selected stable-id
parent and still rejects a real selection change. The dedicated final receipt is
`.codex/run-manifests/2026-07-19-final-exact-race-regression.md`.

The release workflow now checks both immutable-tag availability and the exact
`origin/main` SHA before packaging and immediately before publication. Query
failure is fail-closed. The release-PR workflow declares `contents: read`.

### Final post-build regression and idle proof

After the final build, `final-postfix-child.png` reopened the initialized child,
confirmed its context bar, Back control, unchanged persistent repository count,
and read-only Repository Tools boundary at 1440×960. It was 134,223 bytes with
SHA-256
`53bae0c04eccedbafa4dbb749151b00df4d95fadce701758259ffd049fdc89ad`.
Back then restored the root in `final-postfix-regression.png`, also 1440×960,
159,924 bytes, SHA-256
`e11956f58a18216bd90b65276890f86579e0bdd1b559268a139861fe2f94dcf0`.
Both frames were inspected at original pixels and were nonblank, unclipped, and
free of private data.

The profile log-history repository stayed at HEAD
`af8c8e91c8d99f0bf99f05dd46c7903d2ef9baf1`, count `22682`, and clean status
through an eight-second idle interval. Before fixture deletion, the root was at
`5f4cc173` with only the expected modified submodule pointer, and the child was
clean at `de377c26`.

The exact app and wrapper, provider and launcher, listeners `62241` and `50158`,
owned credential entry, `DesktopMaterialDebug10-20260718-232824`, and the owned
temporary run root were closed or removed and then confirmed absent. The user's
visible desktop and unrelated Electron processes remained untouched.

A final privacy audit rejected the original Repository Tools pair because its
intro copy exposed the verifier account's Temp path. The same production bundle
was relaunched only on `DesktopMaterialPublicTools-20260719` against
`C:\DesktopMaterialEvidence-20260719\fixture`. The replacements expose only that
synthetic path; the 960×420 scene also proves a real function-list scroll. Both
frames passed original-pixel inspection, and exact PID `5608`, listener `62243`,
the hidden desktop, and the neutral evidence root were removed and confirmed
absent.

### Promoted public evidence

| Asset | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `material-repository-tools.png` | 1440×960 | 124,544 | `670295d148df32c1796951363a1cde5ddb4aa7b31ce3142e2a50949b7e56c398` |
| `material-repository-tools-scroll.png` | 960×420 | 68,162 | `4b47645776429875394280f0e5584aacf28988d2dcf2ccc79793e929a68f46f3` |
| `material-effective-branch-rules.png` | 1440×960 | 162,231 | `6a391269c74dd638687100651f023d727667b47960ab2353a1717fde96037ba8` |
| `add-submodule-dialog.png` | 1440×960 | 145,009 | `4c441e7d9757b6627e930bb9d43a39c86e38d408cc568b1c1ca874484b808a2a` |
| `material-customization.png` | 1440×960 | 165,740 | `478009bd887a067d007627a531206750bdb9e95508ec9860c609e8c090db2f15` |
| `material-submodule-context.png` | 1440×960 | 103,250 | `25de28cb43ea3031f20788a52638095b0272b73424f4e36d7e43657ab7f381b0` |

### Remote publication and repository-cleanup placeholders

- Exact pushed `main` SHA: **PENDING REMOTE PUBLICATION**.
- Exact CI run, including formerly failing Windows packaged E2E:
  **PENDING REMOTE PUBLICATION**.
- CodeQL run: **PENDING REMOTE PUBLICATION**.
- Build Installers run, unique tag, non-draft release target, and required
  non-empty assets: **PENDING REMOTE PUBLICATION**.
- Pages deployment and byte-identical live images:
  **PENDING REMOTE PUBLICATION**.
- Canonical wiki commit and live image references:
  **PENDING REMOTE PUBLICATION**.
- Owned credential/provider/CDP/headless-desktop/temp-root cleanup:
  **COMPLETE LOCALLY**.
- Clean one-worktree, no-stash, all-source-tips-merged, zero-divergence remote
  proof after publication: **PENDING PUBLICATION CLEANUP**.

The pre-repair failed-SHA installer run `29671087924` and its immutable release
`v3.6.3-beta3-b0000000163` are retained as historical state; the repaired
workflow must neither reuse nor rewrite them.
