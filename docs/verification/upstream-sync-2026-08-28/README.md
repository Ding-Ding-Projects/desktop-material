# Upstream synchronization ledger, 2026-08-28

## Scope and counting method

This hand-written ledger records every non-merge, patch-equivalent record returned by:

    git log --right-only --cherry-pick --no-merges --format="%H%x09%s" origin/main...upstream/development

The refreshed command was run against `origin/main` at
`83c91f6964cc1799fcc7e1d4fcd23f90e5e017f6``a5428c07d91830c109a37323fcee67ee4433a655` and `upstream/development` at
`b17e06dd0f0d9a45807eb39a51d223f52eb14da9`, with merge base
`d9080117b1fd01193d3eee51ae243714468c8176`. It returned 112 records in the
isolated ledger checkout. Stable patch IDs identify 108 unique patch effects.
Rows 094-097 are duplicate records paired exactly with rows 078, 080, 081,
and 082 respectively. They remain listed so no source record is lost from
review. The image-difference pair in rows 001-002 is not
silently collapsed: row 001 is an intermediate rendering hint, and row 002 is
the follow-up compositor correction.

Each row has a source SHA, exact subject, subsystem, disposition, and local
evidence or intended lane. The refreshed disposition contract is deliberately
closed: `ported` means the behavior is represented by a local implementation;
`already-equivalent` means no code delta is needed because the current tree
already has the behavior; `superseded by stronger local behavior` means the
current implementation intentionally replaces the upstream behavior;
`inapplicable because of platform/scope` records a platform, release-history,
or workflow-policy boundary; `reverted-history duplicate` records duplicate or
net-zero upstream history; and `review required` is a non-blocked, actionable
disposition for behavior awaiting parent implementation review or focused
verification. The ledger lane does not port product code, so review-required
rows name the owning issue and local evidence.

The historical `task/upstream-integration-20260828` query remains preserved in
the earlier handoff record. It is not the refreshed baseline, and it is not
used to decide whether an upstream record is accounted for.

## Refreshed disposition counts

| Disposition | Rows | Issue status |
| --- | ---: | --- |
| ported | 2 | Parent issue #212 remains open; local commits are linked in the index. |
| already-equivalent | 3 | Parent issue #212 remains open; no source change is required. |
| superseded by stronger local behavior | 1 | Parent issue #212 remains open; the local behavior is retained. |
| inapplicable because of platform/scope | 27 | Parent issue #212 remains open; no port is authorized for these rows. |
| reverted-history duplicate | 6 | Parent issue #212 remains open; no replay is authorized. |
| review required | 73 | Parent issue #212 remains open; implementation or focused verification is an actionable parent-lane follow-up, not a blocker. |
| **Total** | **112** | **Current local issue: [#212](https://github.com/Ding-Ding-Projects/desktop-material/issues/212), open.** |

## Re-verification, 2026-09-03

The counting baseline in this ledger was `origin/main` at `83c91f6964`. That
tip has since advanced to `a5428c07d9`, carrying nineteen integrated task
lanes. The canonical query was re-run against the new tip and still returns
**112 records**, which is the expected result and worth stating plainly: this
fork reimplements upstream behaviour rather than cherry-picking it, so
`--cherry-pick` cannot match the patches. The record count does not move; only
dispositions do.

Two rows were corrected. Rows 002 and 099 said their local adaptation was not
in `origin/main`; both are now ancestors of it and the evidence says so.

**No `review required` row has been flipped without per-row verification, and
that is deliberate.** Several areas the ledger lists as review-required now
have real implementations on `main`, and a reviewer can work through them
against these commits:

| Ledger area | Rows | Implementation now on `main` |
| --- | --- | --- |
| hook stdin | 086-088 | `app/src/lib/hooks/hook-stdin-spool.ts`, bounded at 64 MiB |
| protected branches | 077 | `protectedBranchRefreshGenerations` in `app-store.ts` |
| clone safety | 075 | `83dddea6e3`, retained direct clone recovery |
| dialog focus | 068-070 | `onDialogFocusIn` lifecycle in `app/src/ui/dialog/dialog.tsx` |
| worktree recovery | 064, 066-067 | `mainWorktreePath` in `repositories-database.ts` and `git/worktree.ts` |
| Copilot quota | 003-011, 018, 025-038 | `acd41a8d20`, per-account settings and quota cards |

Naming the implementation is not the same as proving the upstream behaviour is
matched, which is why the dispositions still read `review required`. Flipping
them on subject similarity alone would make this ledger assert something nobody
checked, and a ledger that does that is worse than a stale one.

The `copilot-conflict-ui` lane is **not** integrated. It and upstream row 015
(delete-vs-modify conflicts) describe two parallel designs of the same code
paths; merging it mechanically would drop one of them.

## Hard GUI boundary

The current GUI is the deliberately restored presentation. It remains Material
Design 3 through shared controls, dialogs, tokens, focus behavior, accessibility, and
state layers, but its reverted shell style is protected. This ledger authorizes
compatible behavior and control-level repairs only. It does not authorize a
shell redesign, a screen rebuild, a navigation rewrite, or import of the retired
shell.

The history that establishes this boundary is:

| Commit | Evidence |
| --- | --- |
| 427029d9bc8c86283962b6f02027ce8e400c251d | Reverted the redesign-era presentation while retaining required shared controls and dialogs. |
| f3f29f6ef0b5803db68e8f8d1199d2b922ae820a | Restored app/src/ui and app/styles to the selected pre-redesign state. |
| 3abcee9015145a1d1346022f4673922f625752d5 | Removed the later unsolicited shell rebuild. |
| 970570b1afd5dc2baebee9c66d6d79f36e060e62 | Integrated the second interface revert and reaffirmed the chosen chrome. |
| 8f364cfaf45665face921cb04afed5ac883ba22f | Retired the removed shell article as an implementation source. |
| ed2f49c68ae4f756fd3a461028061644d1816eca | Added the executable frozen-shell guard. |
| 0d04ec40f5989606f7e745c6c0f25f71a9172017 | Converted remaining raw controls to shared primitives on the retained GUI. |
| 2a211b87a11eb2c0fe36f5fcda6fe1555912a429 | Recorded the shared-control conformance sweep and evidence gaps. |

These commits are the provenance for the ledger rule: upstream behavior may
land in the existing GUI architecture, but upstream shell styling never becomes
an implementation order.

## Evidence key

The local evidence references below point at the current repository's corresponding
architecture and define the intended implementation lane.

| Key | Local evidence and lane |
| --- | --- |
| IMG | app/styles/ui/_diff.scss, compositor-only image-difference lane. |
| COP | app/src/lib/stores/copilot-store.ts and app/src/ui/preferences, account settings and quota lane. |
| CON | app/src/lib/copilot-conflict-resolution.ts and app/src/ui/multi-commit-operation/dialog, conflict-safety lane. |
| NUM | app/src/lib/format-number.ts and app/src/ui/preferences/snapshot-card.tsx, locale formatting lane. |
| WT | app/src/lib/git/worktree.ts, app/src/lib/stores/repositories-store.ts, and app/src/ui/worktrees, recovery lane. |
| DLG | app/src/ui/dialog/dialog.tsx, nested focus restoration lane. |
| CLN | app/src/lib/git/clone.ts and app/src/ui/clone-repository, path-safety lane. |
| PRO | app/src/lib/api.ts and app/src/lib/stores/app-store.ts, protected-branch refresh lane. |
| HOK | app/src/lib/hooks/hooks-proxy.ts and app/src/lib/hooks/with-hooks-env.ts, stdin buffering lane. |
| PKG | package.json, yarn.lock, script/build.ts, installer contract lane. |
| DEP | current package.json/yarn.lock or app/package.json/app/yarn.lock, manifest-only re-resolution lane. |
| WF | .github/workflows and .github/aw, current workflow policy review lane. |
| REL | app/package.json and changelog.json, release-history accounting only. |
| DOC | docs/features, docs/verification, README.md, ROADMAP.md, and HANDOFF.md, documentation lane. |
| TST | app/test/unit and related focused test helpers, test-support adaptation lane. |
| GUI | app/src/ui/md3, app/styles, shared controls and frozen-shell history, no-redesign boundary. |
| MAC | app/static/logos and script/build-icon-assets.sh, macOS scope boundary. |

## Complete record ledger

| # | SHA | Subject | Subsystem | Disposition | Local evidence or intended lane |
| --- | --- | --- | --- | --- | --- |
| 001 | 45bd1e743cbb92e5dc4d2fc828fb5a38bcd3c428 | Fix image diff sub-pixel misalignment on non-Retina displays | image diff | superseded by stronger local behavior | IMG, local antecedents `ec12749f2a` and `15f14b622a` established the behavior before the stronger local correction. |
| 002 | cd3693f347b4b747aef5b94ea63ef27203cd5e37 | Fix image diff sub-pixel misalignment | image diff | ported | IMG, local adaptation `0179541f33` is an ancestor of `origin/main` as of 2026-09-03; verified with `git merge-base --is-ancestor`. |
| 003 | 0e30e78f6cad03ebd5880ed9348139cb0dfabdbd | Create "usage snapshot card" | Copilot quota | review required | COP, implement the card in the existing preferences surface. |
| 004 | 9c5d1a1728c792ddf6191a8108d21e7752de564b | Extract Copilot settings to a component for a given account | Copilot settings | review required | COP, account-owned component boundary. |
| 005 | 87ac06f7b72bf18538ab1926dd85d7211d75facc | Support multi-account Copilot settings in preferences | Copilot settings | review required | COP, preserve existing account and provider state. |
| 006 | 9ce56ae40aa6e53398ad4ebe4c366aad53368373 | Route Copilot settings through popup stack | Copilot UI | review required | COP and GUI, use current popup stack without shell restyle. |
| 007 | c1f791c7ba7500282f396af858286d03d02537c7 | Rename Copilot user settings popup type | Copilot UI | review required | COP, rename only the type and registrations needed by current code. |
| 008 | 6d778076025f073f1d3c0821858f80e34137a028 | Fix bad conflict resolution :( | conflict resolution | review required | CON, preserve safety checks and surface the actual failure. |
| 009 | bb3a47a2733ff641f02bc6a093512f82dfc89d08 | Use SDK token billing flag for Copilot quotas | quota source | review required | COP, use the current billing metadata boundary. |
| 010 | 9bb31a42f9d3fd972aa5b473d2088cef3d7b55e6 | Add Copilot snapshot card test dialog | test fixture | review required | COP and TST, internal deterministic fixture only, not new product navigation. |
| 011 | ee90f6030d9bae14dff549268ab2028304d06773 | Keep Copilot preview fixed in test dialog | test fixture | review required | COP and TST, keep fixture behavior and current GUI. |
| 012 | 31dcddd1ee21eb8a1768d654f8c1370ce16b64cf | fix: menu kept disabled after abort rebase due to unstashed changes | rebase recovery | review required | GUI, local-changes-overwritten dialog state repair. |
| 013 | 8837c3a084fa179a048962b7ab6621aa03e5391f | Tune gh-aw issue triage comment guidance | workflow | inapplicable because of platform/scope | WF, current issue and release policy remains authoritative. |
| 014 | d3996e517a941e28c0bc760bc0a888fda02b5ad1 | Format issue-triage lock workflow | workflow | inapplicable because of platform/scope | WF, formatting may be re-applied only if it preserves current policy. |
| 015 | dcb73dc854a05c9ea90c9e54e86c60b536faf082 | Handle delete-vs-modify conflicts in Copilot conflict resolution | conflict resolution | review required | CON, add explicit delete-versus-modify choices. |
| 016 | 3dd945c3421f6871ffe48e4d0759b0c10b08706c | Fix Copilot settings layout and scroll reset | Copilot UI | review required | COP and GUI, repair layout inside the retained surface. |
| 017 | 0f5471b0f8bd440fed07aa945171c88fc4431f0e | Fix TS2322 in test helpers: include required entry fields | test support | review required | TST, update helper fixtures for current required fields. |
| 018 | 704273fc08678b7eeb8a2f5c346f673bc52c7811 | Group Copilot snapshots by account type | Copilot quota | review required | COP, account grouping without changing shell composition. |
| 019 | 931da4a1fae06fdfc3b3a84ea79ec21ba80a2128 | Draft release 3.6.3 | release metadata | inapplicable because of platform/scope | REL, historical release record, not a version change to the current 4.0.x line. |
| 020 | 74a66bc0dfb872ff6342e45d3f1e70706a0162a2 | Remove hasCopilotResolvableFiles guard | conflict resolution | review required | CON, replace stale eligibility assumption with current skipped-file state. |
| 021 | 71b108f4d981be29cba2d32332cbc05d6f0463ee | Refactor dropdown menu to eliminate duplication | Copilot UI | review required | CON and GUI, preserve shared menu primitives and current presentation. |
| 022 | 2d184d785233c7358175f48ad28bdb3f8ed28ec7 | Extract getOursTheirsLabels to avoid let declarations | conflict resolution | review required | CON, helper-only refactor. |
| 023 | 833d7fa870484ecb7e3e72a6b78560b858af206a | Potential fix for pull request finding | release metadata | inapplicable because of platform/scope | REL, changelog provenance only, no behavior inferred from the subject. |
| 024 | db4785c01d48f61572bad6992b27c5349bbe536c | Move Copilot providers to dedicated dialog | Copilot providers | review required | COP and GUI, use the existing dialog and popup lifecycle. |
| 025 | 77c49017658a85244beb51d134c5200450110621 | Adjust Copilot settings title and usage layout | Copilot UI | review required | COP and GUI, control-level layout repair only. |
| 026 | ab76a0cd4cf1fa3115582031b5eeb01f128a6065 | Stack Copilot snapshot preset buttons | Copilot UI | review required | COP and GUI, preserve current button primitives. |
| 027 | a38b06617afa102eea81b30ad02e8b7ba82681ba | Remove redundant Configure button ternary | Copilot UI | review required | COP, simplify the current component without visual redesign. |
| 028 | e0e15b8423d03e1523cfcef0f7a824739414abab | Don't await client stop in CopilotStore | Copilot runtime | review required | COP, preserve non-blocking stop semantics and error reporting. |
| 029 | f8813a1eaa16699cd2a22f16a565f047fd954695 | Fix tests | test support | review required | TST, update focused Copilot tests after behavioral changes. |
| 030 | e3fdd82db4e5a29109a3dcc9e8c0203a54871c08 | Report cause-specific errors for Copilot conflict resolution failures | conflict resolution | review required | CON, retain per-file causes through the current notification path. |
| 031 | e3532606249ed05b2a7497967897f6d4ff18ec3b | Wrap Copilot account cards in scroll container | Copilot UI | review required | COP and GUI, bounded scrolling inside the existing dialog. |
| 032 | 21bedfc2b4dd6bf0c1776b46cdbe954473f435ff | Surface underlying Copilot error instead of massaging the message | conflict resolution | review required | CON, pass through factual cause-specific errors. |
| 033 | ed1771f1d6a118b4908e104942dbd782433929b4 | Normalize thrown values to Error before rethrow/wrap | error handling | reverted-history duplicate | CON, later reverted by row 034 and not independently ported. |
| 034 | 40b06a0b4faecac66e2a371ce30e0089ef261aed | Revert Error normalization to match existing patterns | error handling | reverted-history duplicate | CON, final upstream state follows current error patterns. |
| 035 | 6751323db06e8f033926b443d3cceeb6376bb06e | Align Copilot settings account eligibility | Copilot settings | review required | COP, align eligibility with current account model. |
| 036 | 84e0a901f6736ae82d0221b0ee2ff9c19b1baa13 | Describe unlimited Copilot quotas accessibly | accessibility | review required | COP and GUI, explicit accessible unlimited state. |
| 037 | 0269fa8dc6b30784d1ce7b73db08eba2b276bd2a | Preserve Copilot quota snapshots without billing metadata | quota source | review required | COP, keep last valid snapshot when billing metadata is absent. |
| 038 | f95110a16de1247ef6201b103f6d148632f0d206 | Scope Copilot model picks per account | Copilot settings | review required | COP, account-keyed model state. |
| 039 | 5870a0ce46f8b669cd78f21b8a3efc64e3daf9b9 | Migrate Copilot model picks to account scope | Copilot settings | review required | COP, bounded migration from global state. |
| 040 | 1ac6901b70990b9119df7b1ef65b738609f3b627 | Fix infinite spinner on diff error in Copilot conflicts Changes tab | conflict UI | review required | CON and GUI, finite error state in the existing Changes tab. |
| 041 | 680ee863355b1490b7dcfefddf0cdb9df6769d1d | Skip Copilot resolution write when file resolved externally | conflict resolution | review required | CON, re-check status immediately before generated writes. |
| 042 | e5fb8496adecc39380b251121ace369f7f546901 | Gate Copilot conflict Continue on skipped files | conflict resolution | review required | CON, unresolved skipped files keep Continue unavailable. |
| 043 | 8a94e6018f86cc191928f4be3dcb0cdad14a2614 | Treat externally-resolved skipped files as resolved | conflict resolution | review required | CON, treat externally resolved files as resolved after independent status proof. |
| 044 | e4ebebd1c1eeaeeec28cf3c39fab434123865806 | Remove global Copilot model/quota state | Copilot settings | review required | COP, remove global consumers only after account state is wired. |
| 045 | 8671ad9e9b77e514e1def398b520e2170ccba8d5 | Improve documentation | Copilot stores | review required | DOC and COP, retain useful explanation and update current paths. |
| 046 | c5aec0ee63f14114f094340101a1aaf5c2810a1a | Remove useless legacy migration code | Copilot settings | already-equivalent | COP, current migration lane already owns bounded cleanup. |
| 047 | dc1ee7b718bc3a3dc0102244d6cc5b1fdee912f7 | Improve documentation | Copilot stores | review required | DOC and COP, reconcile wording with current implementation. |
| 048 | 2333787ad43d47381ed49dd1a8ce6382cfd18b33 | Improve naming | Copilot stores | review required | COP, names must follow current account-owned model. |
| 049 | bee756788c4211796b67b816c5b2413e9824ee86 | Remove unnecessary code | Copilot UI | already-equivalent | COP, review against current stronger local implementation before replay. |
| 050 | 80594be5b77ec9ca82a5158f3d736e6707e62b7e | Add maxFractionDigits to number formatting | number formatting | review required | NUM, add bounded fraction control to shared formatter. |
| 051 | 56eca7eb98d38038a215ef1baf2d88522dadc17d | Respect locale number formatting in snapshot card | number formatting | review required | NUM and COP, use locale-aware snapshot formatting. |
| 052 | d91d3a47cbe6912eebb5cf89e0981629d892ef40 | Omit decimal separator for zero fraction digits | number formatting | review required | NUM, preserve zero-fraction output without stray separator. |
| 053 | 759b47ee3c5c183217fd5de16eb831a9272d749b | Show Copilot code completion quotas | quota source | review required | COP, add code-completion quota to the current card. |
| 054 | 9a6b562f1707dc1b16642c7a61a80ad211e4b790 | Fix Copilot conflicts Changes tab diff contents | diff contents | review required | CON and GUI, use current staged-diff source and syntax path. |
| 055 | 5121f9c61ebcef3706fd78d2b42f14d1ec078372 | Announce worktree group label for screen readers | accessibility | review required | WT and GUI, accessible group announcements in current worktree list. |
| 056 | aca93ff93d4e4bfd9872cce7f732ab5845f20dba | Extract shared worktree display helpers | worktree UI | review required | WT, share helpers without changing shell composition. |
| 057 | 734d8a75ed415692e1b1f51e1facad3d3b6b5db7 | Draft release 3.6.4-beta1 | release metadata | inapplicable because of platform/scope | REL, historical metadata only. |
| 058 | db0af9ac513be232450b4eb22e2fdd7da510b7fa | Refresh gh-aw to stable v0.82.14 | workflow tooling | inapplicable because of platform/scope | WF, re-resolve only through current workflow policy. |
| 059 | 75126de93f4b0b8b973eea4018f7d4b815515823 | Retarget gh-aw refresh to pre-release v0.83.0 | workflow tooling | inapplicable because of platform/scope | WF, pre-release workflow target is not an automatic port. |
| 060 | 0f3a018c9986f1d12ba6147bc4e0646ab6632878 | Enable issue-intent on supported issue-triage safe output | workflow | inapplicable because of platform/scope | WF, current issue-triage safety contract controls adoption. |
| 061 | b10deb5cd81f676a71df015599d791ea60ca0f6c | Scope gh-aw refresh to issue-triage; drop maintenance workflow | workflow | inapplicable because of platform/scope | WF, do not drop current maintenance coverage without a new decision. |
| 062 | 237c9fa63101af059b69988e1a8b5834b3cf8ce4 | Retarget gh-aw refresh to stable v0.83.1 | workflow tooling | inapplicable because of platform/scope | WF, review as tooling only, not product behavior. |
| 063 | 3381d8e7c27791145655b5726c55c7d5f35d82e7 | Format v0.83.1 issue-triage lock with repo Prettier | workflow | inapplicable because of platform/scope | WF, formatting-only workflow record. |
| 064 | 74ebcd235f22711caa1e6c5769c9c3a591436e8a | Persist the main worktree path for missing-worktree recovery | worktree recovery | review required | WT, persist an optional recoverable hint in the current database. |
| 065 | 7db2848db131d4763442946b69d625841deee6e8 | Share Copilot no-access license constant | account model | review required | COP, use one current license constant across consumers. |
| 066 | e78b21461a954514aebe04cc0f10e8378c7c5e5b | Re-resolve the main worktree path when a repository is relocated | worktree recovery | review required | WT, re-resolve from Git metadata after relocation. |
| 067 | 7186c92efad4640d271ef1bf5444f77d23f7ace0 | Treat a recorded main worktree path as a hint, not the answer | worktree recovery | review required | WT, stale path is never authoritative. |
| 068 | 01ff80b82055cfc0974ea899575c4e7f0dcb9389 | Restore focus to trigger when a nested dialog is dismissed | dialog focus | review required | DLG, restore the actual trigger when it remains focusable. |
| 069 | 4c68259a3bef302de7c4545825a1909478dbd44f | Avoid restoring focus to dialog containers | dialog focus | review required | DLG, never return focus to an overlay container. |
| 070 | 85defc10d2426b7b06275eebf9fdae2102d0f341 | Fall back when dialog focus restoration fails | dialog focus | review required | DLG, use the existing suitable-child fallback. |
| 071 | d2eb2e2903279243b8ac08cd94aeef7dd0ff80ef | Potential fix for pull request finding | dialog focus | review required | DLG, source subject alone is not implementation evidence. |
| 072 | 3bde3d2d9d8186ba93cf739099dfe62fa69fef3a | Potential fix for pull request finding | dialog focus tests | review required | DLG and TST, retain only if current focused tests demonstrate a missing boundary. |
| 073 | e98e56c965fe0b6ee17df5e03fd9e84774ee793b | Fix dialog focus test prototype cleanup | dialog focus tests | review required | DLG and TST, isolate prototype cleanup from product styling. |
| 074 | 31b6486aac578cea7a2cb605dcba17f371fb11e7 | Track dialog focus before restoring it | dialog focus | review required | DLG, track focused descendants before nested overlays open. |
| 075 | 265801d73492741921600f718e2098bd2ebef5db | Harden clone path derivation | clone safety | review required | CLN, shared single-component sanitizer for single and batch flows. |
| 076 | ef4303985ea17b2b5237df1b6e17b11370dcd6f8 | Bump ip-address from 10.2.0 to 10.4.0 | dependency | review required | DEP, re-resolve from current manifest and lockfile. |
| 077 | c5f64b1ebdffa1bb9d921c1198664fd205cd290f | fix(api): preserve protected branches when refresh fails | protected branches | review required | PRO, null means retain state and empty array means successful empty state. |
| 078 | 1542b7a544c97cdc48ac8d17020a47c8d26c9d16 | Migrate to @electron/packager | packaging | inapplicable because of platform/scope | PKG, current repository has its own supported packager path; no blind migration. |
| 079 | 3dcda706cfa06b12eeca9a9fbf17dee572c87df9 | Bump fast-uri from 3.1.2 to 3.1.5 | dependency | review required | DEP, re-resolve and verify the current lockfile. |
| 080 | 9c14239d1133b194d990fe66926bd3b56fdcbce3 | Preserve legacy macOS icons with Packager 18 | packaging | inapplicable because of platform/scope | MAC, current delivery scope is Windows only. |
| 081 | 5a948e58b1a57a32ed839f87b6e595ffcccb85cc | Pin cross-compiled Copilot packages to the lockfile | CI dependency | review required | DEP and WF, preserve current cross-compile package pins where still consumed. |
| 082 | 5976ee49a9f6d0c11691ce24e13a400ec6b4a035 | Restore platform-specific packaging icons | packaging | review required | PKG, preserve active Windows icon requirements without restoring macOS work. |
| 083 | ab0bb5ad85c1f0c07b4dc3c5dd8e1d85b82b5545 | Draft release 3.6.4-beta2 | release metadata | inapplicable because of platform/scope | REL, historical metadata only. |
| 084 | 14afd321a0206a06ae3693fb7825cfb9e5e525c1 | Add Fixed prefix | changelog | inapplicable because of platform/scope | REL, historical release-note classification. |
| 085 | 5364e9f5db790f5c65e95bd8b44191305bec4dd7 | Update changelog.json | changelog | inapplicable because of platform/scope | REL, account for the record without copying stale release entries. |
| 086 | b8388597e578d91a8e70bb56e591b9255bd04c3c | Buffer stdin | hook stdin | review required | HOK, retain the current private per-call spool and bounded buffer. |
| 087 | a2c0bf249c428c4c5de2032250e20f59c230f314 | Handle interrupted hook stdin buffering | hook stdin | review required | HOK, interruption-aware cancellation and deterministic cleanup. |
| 088 | f4df68046d19517fd1ee030edb47612af0709635 | Use unique hook stdin file names | hook stdin | review required | HOK, unique per-call spool ownership. |
| 089 | 11db76c02281ea4698bea31936b67ec5cdd44c3b | Report hook stdin buffering failures | hook stdin | review required | HOK, preserve precise buffering errors. |
| 090 | 103ac147bda0c0b445165de663a953f3795f3fde | Bump nanoid from 3.3.11 to 3.3.18 | dependency | review required | DEP, re-resolve from the current root manifest. |
| 091 | cbdfb102ed7b965510d7a3534e2d2320ba3d9caa | Draft release 3.6.4 | release metadata | inapplicable because of platform/scope | REL, historical metadata only. |
| 092 | c57deba0e5f44fbba196678e464088ad946779d6 | Bump version and add changelog | release metadata | inapplicable because of platform/scope | REL, do not import upstream 3.6.x versioning into current 4.0.x. |
| 093 | 893818aa4c8e7e6ba40701d8d95b36154e85f579 | Update 3.6.4 changelog | release metadata | inapplicable because of platform/scope | REL, historical changelog record only. |
| 094 | ef9871e173d08bc32c03c57c97c084a1997af8b7 | Migrate to @electron/packager | packaging | reverted-history duplicate | PKG, duplicate of row 078, current packager path remains. |
| 095 | e338f9b83e7b494c258a2700ac77028f526721e8 | Preserve legacy macOS icons with Packager 18 | packaging | reverted-history duplicate | MAC, duplicate of row 080, outside current Windows scope. |
| 096 | 6e5fa0e5d9ae4287b1cc3ffb966d36177d5753d7 | Pin cross-compiled Copilot packages to the lockfile | CI dependency | reverted-history duplicate | DEP and WF, duplicate of row 081. |
| 097 | 28955b81295df6a3232857c15caba933bd7cd03b | Restore platform-specific packaging icons | packaging | reverted-history duplicate | PKG, duplicate of row 082. |
| 098 | 8a555fe5ec2e14652d888f60569fb0c380d2805f | Bump postcss from 8.5.12 to 8.5.26 | dependency | review required | DEP, re-resolve current lockfile and verify package consumers. |
| 099 | 6b4304f2c4e0e6bc65d44a70172ab1fbfd49ebc5 | Bump dompurify from 3.4.11 to 3.4.13 in /app | dependency | ported | DEP, local adaptation `1eed3b1a4d` is an ancestor of `origin/main` as of 2026-09-03; verified with `git merge-base --is-ancestor`. |
| 100 | 9a91f5bd32b54d9f0cdad5181757b3f6f99de923 | Draft release 3.6.5-beta1 | release metadata | inapplicable because of platform/scope | REL, historical metadata only. |
| 101 | 30651b4d1325078ce128ae7b075f39921cb45830 | Update changelog.json | changelog | inapplicable because of platform/scope | REL, preserve factual history without stale version replacement. |
| 102 | 34abbfcb56d43c9c1053b07e00f8ace770d44499 | Upgrade gh-aw to v0.85.4 | workflow tooling | inapplicable because of platform/scope | WF, current workflow and no-remote-test policy must be reconciled first. |
| 103 | a78fe96059f389994a4332d032260cd0c69e2ae9 | Format generated issue triage workflow | workflow | inapplicable because of platform/scope | WF, formatting-only workflow record. |
| 104 | caf0c8a4de19e7c3b0e2a78963f0d1176a1c2f93 | Use workflow token for Copilot automation | workflow permissions | inapplicable because of platform/scope | WF, current token chain and release permissions are stricter local policy. |
| 105 | 34c8e7f241f993066c60c84dc55a694b476739a3 | Grant Copilot requests permission | workflow permissions | inapplicable because of platform/scope | WF, do not broaden permissions without current scope proof. |
| 106 | a2250dce2a183c82f36a5518a599ba457deb4c32 | Refresh undici dependencies | dependency | review required | DEP, current root manifest and lockfile refresh. |
| 107 | 56588b46c77bd78aa325098660b37a3253a2c607 | Refresh security-sensitive dependencies | dependency | review required | DEP, security-sensitive lock refresh with current package constraints. |
| 108 | 425f012f8ee2823acb80c6f3efff290bb7cb7e95 | Upgrade printenvz and packaging dependencies | dependency | review required | DEP and PKG, update only consumed packages and verify packaging path. |
| 109 | 3e5a6dae257b3de8d97c11f202b2277f3424246a | Remove unused Azure storage dependency | dependency | already-equivalent | DEP, remove only after proving no active local release path consumes it. |
| 110 | 2eef2dd032a09ad7916949a45df3ea15b5061803 | Upgrade Markdown lint tooling | tooling dependency | review required | DEP and DOC, update only while current documentation checks remain valid. |
| 111 | 2c74a18940747d60701d8da65f925ba4716aab68 | Update issue triage agentic workflow | workflow | inapplicable because of platform/scope | WF, record for review under current issue-triage and permission policy. |
| 112 | 4c1bff5927c65289fae843f973ee76b8a852796f | Add gh-aw Dependabot ignore rule | workflow tooling | inapplicable because of platform/scope | WF, preserve current update policy and review ignore scope explicitly. |

## Refreshed source-link and issue index

The source SHA in every row is linked to the exact upstream commit. Stable patch IDs are computed from each non-merge record, yielding 108 unique patch effects across 112 source records. The evidence key links to the local implementation or evidence map above. Every row is tracked by the open parent issue [#212](https://github.com/Ding-Ding-Projects/desktop-material/issues/212); no row is marked complete merely because its upstream commit is merged upstream.

| Row | Upstream commit | Refreshed disposition | Local evidence | Issue status |
| ---: | --- | --- | --- | --- |
| 001 | [45bd1e743cbb92e5dc4d2fc828fb5a38bcd3c428](https://github.com/desktop/desktop/commit/45bd1e743cbb92e5dc4d2fc828fb5a38bcd3c428) | superseded by stronger local behavior | [IMG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 002 | [cd3693f347b4b747aef5b94ea63ef27203cd5e37](https://github.com/desktop/desktop/commit/cd3693f347b4b747aef5b94ea63ef27203cd5e37) | ported | [IMG](#evidence-key); local [0179541f33](https://github.com/Ding-Ding-Projects/desktop-material/commit/0179541f335c4ab1be8f1ee921c4c821ef8e24bb) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 003 | [0e30e78f6cad03ebd5880ed9348139cb0dfabdbd](https://github.com/desktop/desktop/commit/0e30e78f6cad03ebd5880ed9348139cb0dfabdbd) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 004 | [9c5d1a1728c792ddf6191a8108d21e7752de564b](https://github.com/desktop/desktop/commit/9c5d1a1728c792ddf6191a8108d21e7752de564b) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 005 | [87ac06f7b72bf18538ab1926dd85d7211d75facc](https://github.com/desktop/desktop/commit/87ac06f7b72bf18538ab1926dd85d7211d75facc) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 006 | [9ce56ae40aa6e53398ad4ebe4c366aad53368373](https://github.com/desktop/desktop/commit/9ce56ae40aa6e53398ad4ebe4c366aad53368373) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 007 | [c1f791c7ba7500282f396af858286d03d02537c7](https://github.com/desktop/desktop/commit/c1f791c7ba7500282f396af858286d03d02537c7) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 008 | [6d778076025f073f1d3c0821858f80e34137a028](https://github.com/desktop/desktop/commit/6d778076025f073f1d3c0821858f80e34137a028) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 009 | [bb3a47a2733ff641f02bc6a093512f82dfc89d08](https://github.com/desktop/desktop/commit/bb3a47a2733ff641f02bc6a093512f82dfc89d08) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 010 | [9bb31a42f9d3fd972aa5b473d2088cef3d7b55e6](https://github.com/desktop/desktop/commit/9bb31a42f9d3fd972aa5b473d2088cef3d7b55e6) | review required | [COP and TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 011 | [ee90f6030d9bae14dff549268ab2028304d06773](https://github.com/desktop/desktop/commit/ee90f6030d9bae14dff549268ab2028304d06773) | review required | [COP and TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 012 | [31dcddd1ee21eb8a1768d654f8c1370ce16b64cf](https://github.com/desktop/desktop/commit/31dcddd1ee21eb8a1768d654f8c1370ce16b64cf) | review required | [GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 013 | [8837c3a084fa179a048962b7ab6621aa03e5391f](https://github.com/desktop/desktop/commit/8837c3a084fa179a048962b7ab6621aa03e5391f) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 014 | [d3996e517a941e28c0bc760bc0a888fda02b5ad1](https://github.com/desktop/desktop/commit/d3996e517a941e28c0bc760bc0a888fda02b5ad1) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 015 | [dcb73dc854a05c9ea90c9e54e86c60b536faf082](https://github.com/desktop/desktop/commit/dcb73dc854a05c9ea90c9e54e86c60b536faf082) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 016 | [3dd945c3421f6871ffe48e4d0759b0c10b08706c](https://github.com/desktop/desktop/commit/3dd945c3421f6871ffe48e4d0759b0c10b08706c) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 017 | [0f5471b0f8bd440fed07aa945171c88fc4431f0e](https://github.com/desktop/desktop/commit/0f5471b0f8bd440fed07aa945171c88fc4431f0e) | review required | [TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 018 | [704273fc08678b7eeb8a2f5c346f673bc52c7811](https://github.com/desktop/desktop/commit/704273fc08678b7eeb8a2f5c346f673bc52c7811) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 019 | [931da4a1fae06fdfc3b3a84ea79ec21ba80a2128](https://github.com/desktop/desktop/commit/931da4a1fae06fdfc3b3a84ea79ec21ba80a2128) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 020 | [74a66bc0dfb872ff6342e45d3f1e70706a0162a2](https://github.com/desktop/desktop/commit/74a66bc0dfb872ff6342e45d3f1e70706a0162a2) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 021 | [71b108f4d981be29cba2d32332cbc05d6f0463ee](https://github.com/desktop/desktop/commit/71b108f4d981be29cba2d32332cbc05d6f0463ee) | review required | [CON and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 022 | [2d184d785233c7358175f48ad28bdb3f8ed28ec7](https://github.com/desktop/desktop/commit/2d184d785233c7358175f48ad28bdb3f8ed28ec7) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 023 | [833d7fa870484ecb7e3e72a6b78560b858af206a](https://github.com/desktop/desktop/commit/833d7fa870484ecb7e3e72a6b78560b858af206a) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 024 | [db4785c01d48f61572bad6992b27c5349bbe536c](https://github.com/desktop/desktop/commit/db4785c01d48f61572bad6992b27c5349bbe536c) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 025 | [77c49017658a85244beb51d134c5200450110621](https://github.com/desktop/desktop/commit/77c49017658a85244beb51d134c5200450110621) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 026 | [ab76a0cd4cf1fa3115582031b5eeb01f128a6065](https://github.com/desktop/desktop/commit/ab76a0cd4cf1fa3115582031b5eeb01f128a6065) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 027 | [a38b06617afa102eea81b30ad02e8b7ba82681ba](https://github.com/desktop/desktop/commit/a38b06617afa102eea81b30ad02e8b7ba82681ba) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 028 | [e0e15b8423d03e1523cfcef0f7a824739414abab](https://github.com/desktop/desktop/commit/e0e15b8423d03e1523cfcef0f7a824739414abab) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 029 | [f8813a1eaa16699cd2a22f16a565f047fd954695](https://github.com/desktop/desktop/commit/f8813a1eaa16699cd2a22f16a565f047fd954695) | review required | [TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 030 | [e3fdd82db4e5a29109a3dcc9e8c0203a54871c08](https://github.com/desktop/desktop/commit/e3fdd82db4e5a29109a3dcc9e8c0203a54871c08) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 031 | [e3532606249ed05b2a7497967897f6d4ff18ec3b](https://github.com/desktop/desktop/commit/e3532606249ed05b2a7497967897f6d4ff18ec3b) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 032 | [21bedfc2b4dd6bf0c1776b46cdbe954473f435ff](https://github.com/desktop/desktop/commit/21bedfc2b4dd6bf0c1776b46cdbe954473f435ff) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 033 | [ed1771f1d6a118b4908e104942dbd782433929b4](https://github.com/desktop/desktop/commit/ed1771f1d6a118b4908e104942dbd782433929b4) | reverted-history duplicate | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 034 | [40b06a0b4faecac66e2a371ce30e0089ef261aed](https://github.com/desktop/desktop/commit/40b06a0b4faecac66e2a371ce30e0089ef261aed) | reverted-history duplicate | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 035 | [6751323db06e8f033926b443d3cceeb6376bb06e](https://github.com/desktop/desktop/commit/6751323db06e8f033926b443d3cceeb6376bb06e) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 036 | [84e0a901f6736ae82d0221b0ee2ff9c19b1baa13](https://github.com/desktop/desktop/commit/84e0a901f6736ae82d0221b0ee2ff9c19b1baa13) | review required | [COP and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 037 | [0269fa8dc6b30784d1ce7b73db08eba2b276bd2a](https://github.com/desktop/desktop/commit/0269fa8dc6b30784d1ce7b73db08eba2b276bd2a) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 038 | [f95110a16de1247ef6201b103f6d148632f0d206](https://github.com/desktop/desktop/commit/f95110a16de1247ef6201b103f6d148632f0d206) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 039 | [5870a0ce46f8b669cd78f21b8a3efc64e3daf9b9](https://github.com/desktop/desktop/commit/5870a0ce46f8b669cd78f21b8a3efc64e3daf9b9) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 040 | [1ac6901b70990b9119df7b1ef65b738609f3b627](https://github.com/desktop/desktop/commit/1ac6901b70990b9119df7b1ef65b738609f3b627) | review required | [CON and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 041 | [680ee863355b1490b7dcfefddf0cdb9df6769d1d](https://github.com/desktop/desktop/commit/680ee863355b1490b7dcfefddf0cdb9df6769d1d) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 042 | [e5fb8496adecc39380b251121ace369f7f546901](https://github.com/desktop/desktop/commit/e5fb8496adecc39380b251121ace369f7f546901) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 043 | [8a94e6018f86cc191928f4be3dcb0cdad14a2614](https://github.com/desktop/desktop/commit/8a94e6018f86cc191928f4be3dcb0cdad14a2614) | review required | [CON](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 044 | [e4ebebd1c1eeaeeec28cf3c39fab434123865806](https://github.com/desktop/desktop/commit/e4ebebd1c1eeaeeec28cf3c39fab434123865806) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 045 | [8671ad9e9b77e514e1def398b520e2170ccba8d5](https://github.com/desktop/desktop/commit/8671ad9e9b77e514e1def398b520e2170ccba8d5) | review required | [DOC and COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 046 | [c5aec0ee63f14114f094340101a1aaf5c2810a1a](https://github.com/desktop/desktop/commit/c5aec0ee63f14114f094340101a1aaf5c2810a1a) | already-equivalent | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 047 | [dc1ee7b718bc3a3dc0102244d6cc5b1fdee912f7](https://github.com/desktop/desktop/commit/dc1ee7b718bc3a3dc0102244d6cc5b1fdee912f7) | review required | [DOC and COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 048 | [2333787ad43d47381ed49dd1a8ce6382cfd18b33](https://github.com/desktop/desktop/commit/2333787ad43d47381ed49dd1a8ce6382cfd18b33) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 049 | [bee756788c4211796b67b816c5b2413e9824ee86](https://github.com/desktop/desktop/commit/bee756788c4211796b67b816c5b2413e9824ee86) | already-equivalent | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 050 | [80594be5b77ec9ca82a5158f3d736e6707e62b7e](https://github.com/desktop/desktop/commit/80594be5b77ec9ca82a5158f3d736e6707e62b7e) | review required | [NUM](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 051 | [56eca7eb98d38038a215ef1baf2d88522dadc17d](https://github.com/desktop/desktop/commit/56eca7eb98d38038a215ef1baf2d88522dadc17d) | review required | [NUM and COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 052 | [d91d3a47cbe6912eebb5cf89e0981629d892ef40](https://github.com/desktop/desktop/commit/d91d3a47cbe6912eebb5cf89e0981629d892ef40) | review required | [NUM](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 053 | [759b47ee3c5c183217fd5de16eb831a9272d749b](https://github.com/desktop/desktop/commit/759b47ee3c5c183217fd5de16eb831a9272d749b) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 054 | [9a6b562f1707dc1b16642c7a61a80ad211e4b790](https://github.com/desktop/desktop/commit/9a6b562f1707dc1b16642c7a61a80ad211e4b790) | review required | [CON and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 055 | [5121f9c61ebcef3706fd78d2b42f14d1ec078372](https://github.com/desktop/desktop/commit/5121f9c61ebcef3706fd78d2b42f14d1ec078372) | review required | [WT and GUI](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 056 | [aca93ff93d4e4bfd9872cce7f732ab5845f20dba](https://github.com/desktop/desktop/commit/aca93ff93d4e4bfd9872cce7f732ab5845f20dba) | review required | [WT](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 057 | [734d8a75ed415692e1b1f51e1facad3d3b6b5db7](https://github.com/desktop/desktop/commit/734d8a75ed415692e1b1f51e1facad3d3b6b5db7) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 058 | [db0af9ac513be232450b4eb22e2fdd7da510b7fa](https://github.com/desktop/desktop/commit/db0af9ac513be232450b4eb22e2fdd7da510b7fa) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 059 | [75126de93f4b0b8b973eea4018f7d4b815515823](https://github.com/desktop/desktop/commit/75126de93f4b0b8b973eea4018f7d4b815515823) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 060 | [0f3a018c9986f1d12ba6147bc4e0646ab6632878](https://github.com/desktop/desktop/commit/0f3a018c9986f1d12ba6147bc4e0646ab6632878) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 061 | [b10deb5cd81f676a71df015599d791ea60ca0f6c](https://github.com/desktop/desktop/commit/b10deb5cd81f676a71df015599d791ea60ca0f6c) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 062 | [237c9fa63101af059b69988e1a8b5834b3cf8ce4](https://github.com/desktop/desktop/commit/237c9fa63101af059b69988e1a8b5834b3cf8ce4) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 063 | [3381d8e7c27791145655b5726c55c7d5f35d82e7](https://github.com/desktop/desktop/commit/3381d8e7c27791145655b5726c55c7d5f35d82e7) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 064 | [74ebcd235f22711caa1e6c5769c9c3a591436e8a](https://github.com/desktop/desktop/commit/74ebcd235f22711caa1e6c5769c9c3a591436e8a) | review required | [WT](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 065 | [7db2848db131d4763442946b69d625841deee6e8](https://github.com/desktop/desktop/commit/7db2848db131d4763442946b69d625841deee6e8) | review required | [COP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 066 | [e78b21461a954514aebe04cc0f10e8378c7c5e5b](https://github.com/desktop/desktop/commit/e78b21461a954514aebe04cc0f10e8378c7c5e5b) | review required | [WT](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 067 | [7186c92efad4640d271ef1bf5444f77d23f7ace0](https://github.com/desktop/desktop/commit/7186c92efad4640d271ef1bf5444f77d23f7ace0) | review required | [WT](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 068 | [01ff80b82055cfc0974ea899575c4e7f0dcb9389](https://github.com/desktop/desktop/commit/01ff80b82055cfc0974ea899575c4e7f0dcb9389) | review required | [DLG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 069 | [4c68259a3bef302de7c4545825a1909478dbd44f](https://github.com/desktop/desktop/commit/4c68259a3bef302de7c4545825a1909478dbd44f) | review required | [DLG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 070 | [85defc10d2426b7b06275eebf9fdae2102d0f341](https://github.com/desktop/desktop/commit/85defc10d2426b7b06275eebf9fdae2102d0f341) | review required | [DLG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 071 | [d2eb2e2903279243b8ac08cd94aeef7dd0ff80ef](https://github.com/desktop/desktop/commit/d2eb2e2903279243b8ac08cd94aeef7dd0ff80ef) | review required | [DLG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 072 | [3bde3d2d9d8186ba93cf739099dfe62fa69fef3a](https://github.com/desktop/desktop/commit/3bde3d2d9d8186ba93cf739099dfe62fa69fef3a) | review required | [DLG and TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 073 | [e98e56c965fe0b6ee17df5e03fd9e84774ee793b](https://github.com/desktop/desktop/commit/e98e56c965fe0b6ee17df5e03fd9e84774ee793b) | review required | [DLG and TST](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 074 | [31b6486aac578cea7a2cb605dcba17f371fb11e7](https://github.com/desktop/desktop/commit/31b6486aac578cea7a2cb605dcba17f371fb11e7) | review required | [DLG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 075 | [265801d73492741921600f718e2098bd2ebef5db](https://github.com/desktop/desktop/commit/265801d73492741921600f718e2098bd2ebef5db) | review required | [CLN](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 076 | [ef4303985ea17b2b5237df1b6e17b11370dcd6f8](https://github.com/desktop/desktop/commit/ef4303985ea17b2b5237df1b6e17b11370dcd6f8) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 077 | [c5f64b1ebdffa1bb9d921c1198664fd205cd290f](https://github.com/desktop/desktop/commit/c5f64b1ebdffa1bb9d921c1198664fd205cd290f) | review required | [PRO](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 078 | [1542b7a544c97cdc48ac8d17020a47c8d26c9d16](https://github.com/desktop/desktop/commit/1542b7a544c97cdc48ac8d17020a47c8d26c9d16) | inapplicable because of platform/scope | [PKG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 079 | [3dcda706cfa06b12eeca9a9fbf17dee572c87df9](https://github.com/desktop/desktop/commit/3dcda706cfa06b12eeca9a9fbf17dee572c87df9) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 080 | [9c14239d1133b194d990fe66926bd3b56fdcbce3](https://github.com/desktop/desktop/commit/9c14239d1133b194d990fe66926bd3b56fdcbce3) | inapplicable because of platform/scope | [MAC](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 081 | [5a948e58b1a57a32ed839f87b6e595ffcccb85cc](https://github.com/desktop/desktop/commit/5a948e58b1a57a32ed839f87b6e595ffcccb85cc) | review required | [DEP and WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 082 | [5976ee49a9f6d0c11691ce24e13a400ec6b4a035](https://github.com/desktop/desktop/commit/5976ee49a9f6d0c11691ce24e13a400ec6b4a035) | review required | [PKG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 083 | [ab0bb5ad85c1f0c07b4dc3c5dd8e1d85b82b5545](https://github.com/desktop/desktop/commit/ab0bb5ad85c1f0c07b4dc3c5dd8e1d85b82b5545) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 084 | [14afd321a0206a06ae3693fb7825cfb9e5e525c1](https://github.com/desktop/desktop/commit/14afd321a0206a06ae3693fb7825cfb9e5e525c1) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 085 | [5364e9f5db790f5c65e95bd8b44191305bec4dd7](https://github.com/desktop/desktop/commit/5364e9f5db790f5c65e95bd8b44191305bec4dd7) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 086 | [b8388597e578d91a8e70bb56e591b9255bd04c3c](https://github.com/desktop/desktop/commit/b8388597e578d91a8e70bb56e591b9255bd04c3c) | review required | [HOK](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 087 | [a2c0bf249c428c4c5de2032250e20f59c230f314](https://github.com/desktop/desktop/commit/a2c0bf249c428c4c5de2032250e20f59c230f314) | review required | [HOK](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 088 | [f4df68046d19517fd1ee030edb47612af0709635](https://github.com/desktop/desktop/commit/f4df68046d19517fd1ee030edb47612af0709635) | review required | [HOK](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 089 | [11db76c02281ea4698bea31936b67ec5cdd44c3b](https://github.com/desktop/desktop/commit/11db76c02281ea4698bea31936b67ec5cdd44c3b) | review required | [HOK](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 090 | [103ac147bda0c0b445165de663a953f3795f3fde](https://github.com/desktop/desktop/commit/103ac147bda0c0b445165de663a953f3795f3fde) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 091 | [cbdfb102ed7b965510d7a3534e2d2320ba3d9caa](https://github.com/desktop/desktop/commit/cbdfb102ed7b965510d7a3534e2d2320ba3d9caa) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 092 | [c57deba0e5f44fbba196678e464088ad946779d6](https://github.com/desktop/desktop/commit/c57deba0e5f44fbba196678e464088ad946779d6) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 093 | [893818aa4c8e7e6ba40701d8d95b36154e85f579](https://github.com/desktop/desktop/commit/893818aa4c8e7e6ba40701d8d95b36154e85f579) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 094 | [ef9871e173d08bc32c03c57c97c084a1997af8b7](https://github.com/desktop/desktop/commit/ef9871e173d08bc32c03c57c97c084a1997af8b7) | reverted-history duplicate | [PKG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 095 | [e338f9b83e7b494c258a2700ac77028f526721e8](https://github.com/desktop/desktop/commit/e338f9b83e7b494c258a2700ac77028f526721e8) | reverted-history duplicate | [MAC](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 096 | [6e5fa0e5d9ae4287b1cc3ffb966d36177d5753d7](https://github.com/desktop/desktop/commit/6e5fa0e5d9ae4287b1cc3ffb966d36177d5753d7) | reverted-history duplicate | [DEP and WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 097 | [28955b81295df6a3232857c15caba933bd7cd03b](https://github.com/desktop/desktop/commit/28955b81295df6a3232857c15caba933bd7cd03b) | reverted-history duplicate | [PKG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 098 | [8a555fe5ec2e14652d888f60569fb0c380d2805f](https://github.com/desktop/desktop/commit/8a555fe5ec2e14652d888f60569fb0c380d2805f) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 099 | [6b4304f2c4e0e6bc65d44a70172ab1fbfd49ebc5](https://github.com/desktop/desktop/commit/6b4304f2c4e0e6bc65d44a70172ab1fbfd49ebc5) | ported | [DEP](#evidence-key); local [1eed3b1a4d](https://github.com/Ding-Ding-Projects/desktop-material/commit/1eed3b1a4df7d7a64fa6a593f13d436ae4caf81b) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 100 | [9a91f5bd32b54d9f0cdad5181757b3f6f99de923](https://github.com/desktop/desktop/commit/9a91f5bd32b54d9f0cdad5181757b3f6f99de923) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 101 | [30651b4d1325078ce128ae7b075f39921cb45830](https://github.com/desktop/desktop/commit/30651b4d1325078ce128ae7b075f39921cb45830) | inapplicable because of platform/scope | [REL](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 102 | [34abbfcb56d43c9c1053b07e00f8ace770d44499](https://github.com/desktop/desktop/commit/34abbfcb56d43c9c1053b07e00f8ace770d44499) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 103 | [a78fe96059f389994a4332d032260cd0c69e2ae9](https://github.com/desktop/desktop/commit/a78fe96059f389994a4332d032260cd0c69e2ae9) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 104 | [caf0c8a4de19e7c3b0e2a78963f0d1176a1c2f93](https://github.com/desktop/desktop/commit/caf0c8a4de19e7c3b0e2a78963f0d1176a1c2f93) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 105 | [34c8e7f241f993066c60c84dc55a694b476739a3](https://github.com/desktop/desktop/commit/34c8e7f241f993066c60c84dc55a694b476739a3) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 106 | [a2250dce2a183c82f36a5518a599ba457deb4c32](https://github.com/desktop/desktop/commit/a2250dce2a183c82f36a5518a599ba457deb4c32) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 107 | [56588b46c77bd78aa325098660b37a3253a2c607](https://github.com/desktop/desktop/commit/56588b46c77bd78aa325098660b37a3253a2c607) | review required | [DEP](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 108 | [425f012f8ee2823acb80c6f3efff290bb7cb7e95](https://github.com/desktop/desktop/commit/425f012f8ee2823acb80c6f3efff290bb7cb7e95) | review required | [DEP and PKG](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 109 | [3e5a6dae257b3de8d97c11f202b2277f3424246a](https://github.com/desktop/desktop/commit/3e5a6dae257b3de8d97c11f202b2277f3424246a) | already-equivalent | [DEP](#evidence-key); `package.json` and `yarn.lock` contain no Azure storage dependency | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 110 | [2eef2dd032a09ad7916949a45df3ea15b5061803](https://github.com/desktop/desktop/commit/2eef2dd032a09ad7916949a45df3ea15b5061803) | review required | [DEP and DOC](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 111 | [2c74a18940747d60701d8da65f925ba4716aab68](https://github.com/desktop/desktop/commit/2c74a18940747d60701d8da65f925ba4716aab68) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |
| 112 | [4c1bff5927c65289fae843f973ee76b8a852796f](https://github.com/desktop/desktop/commit/4c1bff5927c65289fae843f973ee76b8a852796f) | inapplicable because of platform/scope | [WF](#evidence-key) | [#212 open](https://github.com/Ding-Ding-Projects/desktop-material/issues/212) |

Count check for this index: 112 rows, 112 exact upstream SHA links, 108 unique stable patch IDs, and 112 issue-status cells. The index is hand-written review data copied from the refreshed command output; it is not a generated discovery list.


The ledger is checked against the exact source command in this checkout by
`check-ledger.ps1`:

1. The source command returned 112 rows and 108 unique stable patch IDs.
2. The hand-written table contains rows 001 through 112 exactly once.
3. Every row has a 40-character source SHA, subject, subsystem, refreshed
   disposition, and local evidence or lane.
4. The source-link index contains 112 exact commit links, 108 unique stable
   patch IDs, and 112 open
   parent issue links.
5. Duplicate and net-zero history is explicitly identified in rows 033-034;
   the duplicate patch pairs are 078/094, 080/095, 081/096, and 082/097.
6. Platform/scope, stronger-local-behavior, already-equivalent, ported, and
   review-required dispositions are represented.
7. The checker was deliberately made red by removing row 112 from a temporary
   copy, then restored and returned green. It does not claim that review-required
   rows have been implemented or verified.
