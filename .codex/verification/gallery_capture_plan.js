#!/usr/bin/env node
'use strict'

/**
 * Single source of truth for the production-capture ownership of every
 * published Guided Feature Gallery PNG.
 *
 * This file plans capture work; it does not launch Electron, Linux, a browser,
 * or a desktop. Runtime placeholders are deliberately explicit because the
 * headless skills must allocate fresh owned roots, ports, displays, and HWNDs.
 */

const fs = require('fs')
const path = require('path')

const ExpectedPublishedGalleryCount = 92
const CanonicalCandidateCount = 68
const DeferredCanonicalOutputs = Object.freeze([
  'material-cheap-lfs-preparing',
  'material-repositories-sheet',
])
const DeferredSpecialistOutputs = Object.freeze([])
const RetainedHistoricalEvidence = Object.freeze({
  'auto-updater-update-ready.png': Object.freeze({
    acceptedAt: '2026-07-22',
    document: 'docs/verification/auto-updater-version-order-2026-07-22.md',
    sourceCommit: '923dbb51acad8f01f01f1c100c6945c7a2e08e23',
    sha256: 'a02cffa612114be3af5e0fffcd5b602a4ba4dfd3226298e48d143a6bed76bd4d',
  }),
})

/**
 * Current Windows refresh gaps are explicit acceptance blockers, not missing
 * rows. The existing PNG remains retained evidence, while this machine-readable
 * record prevents the capture campaign from reporting it as freshly recaptured.
 * `commands` is filled from the owning batch below so the required rerun cannot
 * drift away from the batch's real command sequence.
 */
const CaptureGapDefinitions = Object.freeze([
  Object.freeze({
    output: 'material-tab-groups',
    status: 'blocked',
    blocker:
      'The disposable tab-group fixture is on a temporary drive that is unavailable after renderer reload; persisted group state was confirmed, but no current capture was produced.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run with a fixture path that remains available across reload, the original PNG, and the renderer privacy receipt.',
  }),
  Object.freeze({
    output: 'material-ollama-model-manager',
    status: 'blocked',
    blocker:
      'The manager surface exceeds the existing 1452x1001 acceptance frame by approximately 59px; the gate requires a complete in-viewport panel and therefore rejects the candidate.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop capture after the acceptance viewport or surface contract is reconciled, with the complete panel, geometry receipt, and privacy receipt.',
  }),
  Object.freeze({
    output: 'material-github-releases-compact',
    status: 'blocked',
    blocker:
      'At the existing 200% / 480x330 logical viewport, the real fixture renders zero complete release rows inside the gate list.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop 200% capture with one complete release row in the bounded list, plus the original PNG and privacy receipt.',
  }),
  Object.freeze({
    output: 'material-pull-preview',
    status: 'blocked',
    blocker:
      'At the existing 200% / 480x330 logical viewport, the real pull-preview fixture renders zero complete rows inside the gate list.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop 200% capture with one complete pull-preview row in the bounded list, plus the original PNG and privacy receipt.',
  }),
  Object.freeze({
    output: 'private-repository-lock-badge',
    status: 'blocked',
    blocker:
      'At the existing 200% / 480x330 logical viewport, the real private-repository fixture renders zero complete rows inside the gate list.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop 200% capture with one complete private-repository row in the bounded list, plus the original PNG and privacy receipt.',
  }),
  Object.freeze({
    output: 'cheap-lfs-bambu-build-live',
    status: 'blocked',
    blocker:
      'The live Cheap LFS scene needs its bespoke sparse-file/provider fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning Cheap LFS live fixture, its original PNG, and the scene privacy receipt.',
  }),
  Object.freeze({
    output: 'cheap-lfs-cloud-compression',
    status: 'blocked',
    blocker:
      'The live Cheap LFS scene needs its bespoke sparse-file/provider fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning Cheap LFS live fixture, its original PNG, and the scene privacy receipt.',
  }),
  Object.freeze({
    output: 'cheap-lfs-ui-acceptance',
    status: 'blocked',
    blocker:
      'The live Cheap LFS scene needs its bespoke sparse-file/provider fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning Cheap LFS live fixture, its original PNG, and the scene privacy receipt.',
  }),
  Object.freeze({
    output: 'cheap-lfs-commit-progress',
    status: 'blocked',
    blocker:
      'The Cheap LFS commit-progress scene needs its bespoke sparse-file fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning Cheap LFS commit fixture, its original PNG, and the progress receipt.',
  }),
  Object.freeze({
    output: 'cheap-lfs-restore-lookahead',
    status: 'blocked',
    blocker:
      'The Cheap LFS restore scene needs its bespoke restore fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning Cheap LFS restore fixture, its original PNG, and the restore receipt.',
  }),
  Object.freeze({
    output: 'app-hosted-browser-authentication',
    status: 'blocked',
    blocker:
      'The internal-browser scene needs its bespoke loopback browser fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning loopback browser fixture, its original PNG, and the browser privacy receipt.',
  }),
  Object.freeze({
    output: 'auto-updater-current-source-ready',
    status: 'blocked',
    blocker:
      'The current-source updater scene needs its bespoke signed-feed fixture; it was not re-run by the canonical gallery refresh.',
    requiredEvidence:
      'A genuine hidden-Windows-desktop run of the owning updater verifier with its original PNG, readiness receipt, and protected-resource cleanup evidence.',
  }),
])

const galleryPath = path.resolve(
  __dirname,
  '../../docs/wiki/Feature-Gallery.md'
)
const canonicalDriverPath = path.resolve(__dirname, 'capture_gallery_cdp.js')
const gallerySource = fs.readFileSync(galleryPath, 'utf8')
const canonicalSource = fs.readFileSync(canonicalDriverPath, 'utf8')

function frozenStringArray(source, name) {
  const match = source.match(
    new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\n\\]\\)`)
  )
  if (match === null) {
    throw new Error(`Could not read ${name}.`)
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, value]) => value)
}

function sceneForCanonicalOutput(output) {
  for (const scene of CanonicalGalleryScenes) {
    const start = canonicalSource.indexOf(`scene('${scene}'`)
    if (start === -1) {
      throw new Error(`Canonical scene ${scene} is not registered.`)
    }
    const next = canonicalSource.indexOf("\nscene('", start + 1)
    const body = canonicalSource.slice(
      start,
      next === -1 ? canonicalSource.length : next
    )
    if (body.includes(`'${output}'`)) {
      return scene
    }
  }
  throw new Error(`Canonical output ${output} has no owning scene.`)
}

const PublishedGalleryOutputs = Object.freeze(
  [...gallerySource.matchAll(/^\| `([^`]+)\.png` \| [^|]+ \|$/gm)].map(
    ([, output]) => output
  )
)
const CanonicalGalleryOutputs = Object.freeze(
  frozenStringArray(canonicalSource, 'CanonicalGalleryOutputs')
)
const CanonicalGalleryScenes = Object.freeze(
  frozenStringArray(canonicalSource, 'CanonicalGalleryScenes')
)

const CaptureBatches = Object.freeze({
  'windows-canonical-cdp': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'node .codex/verification/capture_gallery_cdp.js --canonical true --run-root <owned-p0-run-root> --fixture-path <owned-p0-run-root>\\fixture --out <owned-p0-run-root>\\captures\\gallery --port <owned-cdp-port> --theme light --language-mode english',
    ]),
    fixture:
      'Fresh owned P0 run root, isolated user data, disposable provider-backed Git fixture, and the exact production bundle on a hidden Win32 desktop.',
    privacyGate:
      'capture_gallery_cdp.js runs its renderer privacy assertion before every Page.captureScreenshot call; inspect every original PNG before promotion.',
  }),
  'windows-publish-organization-cdp': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'node .codex/verification/capture_gallery_cdp.js --scenes publish-organization-picker --run-root <owned-p0-run-root> --fixture-path <owned-p0-run-root>\\fixture --out <owned-p0-run-root>\\captures\\gallery --port <owned-cdp-port> --theme dark --language-mode bilingual --width 1440 --height 960',
    ]),
    fixture:
      'Fresh owned P0 run root with its clean real git-source repository (no remote), provider-backed fixture clone, isolated profile, and three deterministic organization owners including one deliberately long login.',
    privacyGate:
      'The scene proves the owned no-remote source before opening Publish Repository, rejects provider mutations, runs the renderer privacy assertion, and requires contained physical 390x844 auto-fit geometry before restoring and capturing at 1440x960.',
  }),
  'windows-history-hover': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'node .codex/verification/capture_gallery_cdp.js --scenes history-hover-time --run-root <owned-p0-run-root> --fixture-path <owned-p0-run-root>\\fixture --out <owned-p0-run-root>\\captures\\history-hover --port <owned-cdp-port> --theme dark --language-mode bilingual',
    ]),
    fixture:
      'Fresh owned P0 run root, isolated user data, disposable provider-backed Git fixture, and the exact production bundle on a hidden Win32 desktop.',
    privacyGate:
      'The scene requires the real contained hover card, both localized relative phrases, bundled fonts, and the renderer privacy assertion before capture.',
  }),
  'windows-repositories-sheet': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'node .codex/verification/capture_gallery_cdp.js --scenes seed,repositories-sheet --run-root <owned-p0-run-root> --fixture-path <owned-p0-run-root>\\fixture --out <owned-p0-run-root>\\captures\\repositories-sheet --port <owned-cdp-port> --theme dark --language-mode bilingual',
    ]),
    fixture:
      'Fresh owned P0 run root, isolated user data, disposable provider-backed Git fixture, and the exact production bundle on a hidden Win32 desktop.',
    privacyGate:
      'The scene requires the collapsed-by-default Filters disclosure, its restored active state, a single-row bilingual action strip at 390 px, and the renderer privacy assertion before capture.',
  }),
  'windows-internal-browser': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'node .codex/verification/verify_internal_browser_cdp.js --port <owned-cdp-port> --run-root <owned-temp-run-root> --receipt <owned-temp-run-root>\\internal-browser-cdp-receipt.json',
      'Lowlevel capture_screenshot(client_only=true, hwnd=<resolved-browser-hwnd>, path=<owned-temp-run-root>\\captures\\app-hosted-browser-authentication.png)',
    ]),
    fixture:
      'Production Electron plus the verifier-owned bounded loopback redirect, popup, bookmark, and authentication fixture.',
    privacyGate:
      'Verifier forbids account cookies, OAuth codes, signed URLs, tokens, user paths, and personal content; inspect the original client-only frame.',
  }),
  'windows-updater-lowlevel': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development yarn build:prod',
      'node .codex/verification/verify_gallery_auto_updater_ready_cdp.js --port <owned-cdp-port> --run-root <owned-temp-run-root> --protected-install-root <attested-protected-install-root> --protected-user-sid <attested-protected-user-sid> --execution-user-sid <attested-execution-user-sid> --desktop-name <owned-headless-desktop-name> --capture <owned-temp-run-root>\\captures\\auto-updater-current-source-ready.png --receipt <owned-temp-run-root>\\receipts\\auto-updater-current-source-ready-receipt.json --ready <owned-temp-run-root>\\receipts\\auto-updater-current-source-ready-verifier-ready.json',
      'Lowlevel wait for the verifier-owned ready handshake, launch only its exact executable, arguments, environment, identity, and non-default desktop, then let the verifier capture original Chromium pixels and exit through File > Exit without invoking Quit and Install',
    ]),
    fixture:
      'Exact freshly packaged development-channel production build in a unique owned Squirrel root, plus a bounded loopback feed containing one deterministic newer inert full nupkg with no executable payload.',
    privacyGate:
      'The verifier attests the current build, isolated identity, protected installation and same-user state, genuine Electron/Squirrel event path, exact 960x660 frame, path-free receipt, and complete owned cleanup before promotion.',
  }),
  'windows-cheap-lfs-live': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'Lowlevel launch the production bundle with the named disposable Cheap LFS fixture, perform the entry interaction exactly, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\<output>.png)',
    ]),
    fixture:
      'A newly cloned or newly created fixture named by the entry; never a developer checkout. Provider mutation is allowed only where the entry explicitly requires it.',
    privacyGate:
      'Use synthetic filenames and example.invalid identity; scan the renderer and original PNG for credentials, signed URLs, personal email, and user paths.',
  }),
  'windows-cheap-lfs-commit': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'node .codex/verification/verify_cheap_lfs_progress_cdp.js --port <owned-cdp-port> --run-root <owned-temp-run-root> --repository-path <owned-temp-run-root>\\fixture --scenario wide --capture <owned-temp-run-root>\\captures\\cheap-lfs-commit-progress.png --receipt <owned-temp-run-root>\\receipts\\cheap-lfs-commit-progress.json',
    ]),
    fixture:
      'Verifier-created disposable Git fixture with its bounded sparse large-file set and deterministic in-memory provider state.',
    privacyGate:
      'The verifier validates owned paths, fixture semantics, capture geometry, and privacy before writing its receipt.',
  }),
  'windows-cheap-lfs-restore': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'node .codex/verification/verify_cheap_lfs_restore_progress_cdp.js --port <owned-cdp-port> --run-root <owned-temp-run-root> --repository-path <owned-temp-run-root>\\fixture --scenario wide --capture <owned-temp-run-root>\\captures\\cheap-lfs-restore-lookahead.png --receipt <owned-temp-run-root>\\receipts\\cheap-lfs-restore-lookahead.json',
    ]),
    fixture:
      'Disposable Git fixture plus the verifier-published deterministic restore snapshot with current and prefetched lanes.',
    privacyGate:
      'The attach-only verifier validates owned paths, exact progress semantics, clipping, and privacy before capture.',
  }),
  'windows-ui-state-lowlevel': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'Lowlevel launch the production bundle with isolated user data and the entry fixture, perform the entry interaction exactly, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\<output>.png)',
    ]),
    fixture:
      'Fresh throwaway repositories and isolated renderer profile; all persisted UI state is created through app-owned interactions or an explicitly named app-native state hook.',
    privacyGate:
      'Run the pre-capture renderer privacy gate used by script/capture-app.js and inspect the original client-only PNG.',
  }),
  'windows-releases-compact': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'Lowlevel launch the production bundle with the P0 release fixture, set app zoom to 200%, open Repository Releases, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\material-github-releases-compact.png)',
    ]),
    fixture:
      'Owned P0 provider fixture with deterministic releases and isolated profile at a physical 960x660 app window.',
    privacyGate:
      'Validate the first complete release row, no clipping, fixture-only provider data, and no credentials or private paths.',
  }),
  'windows-ollama': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'node .codex/verification/verify_ollama_manager_cdp.js --port <owned-cdp-port> --p0-run-root <owned-p0-run-root> --ollama-run-root <owned-ollama-run-root> --capture <owned-p0-run-root>\\captures\\material-ollama-model-manager.png --receipt <owned-p0-run-root>\\captures\\material-ollama-model-manager.json',
    ]),
    fixture:
      'Owned P0 production-app fixture plus .codex/verification/fake_ollama_server.py in a separate validated owned run root.',
    privacyGate:
      'The verifier checks bounded loopback endpoints, semantic inventory, clipping, owned paths, and screenshot privacy.',
  }),
  'windows-pull-preview': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'Lowlevel launch the production bundle with the owned local/bare-origin fixture, activate Pull, wait for the frozen fetched preview, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\material-pull-preview.png)',
    ]),
    fixture:
      'Owned bare origin, seed checkout, and app checkout where origin/main has two incoming commits and three controlled changed paths.',
    privacyGate:
      'Require exact reviewed upstream OID, clean-worktree gate, fixture-only paths, and an original 960x660 privacy inspection.',
  }),
  'windows-private-badge': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod',
      'Lowlevel launch the production bundle with the disposable repository, set exact isPrivate=true through the app-native state hook, open the repository picker, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\private-repository-lock-badge.png)',
    ]),
    fixture:
      'One disposable repository and deterministic exact private metadata; no provider inference, account, or network lookup.',
    privacyGate:
      'Assert the lock is driven by exact isPrivate=true, then scan the renderer and original 960x660 frame for user paths and credentials.',
  }),
})

const SpecialistCaptureEntries = Object.freeze([
  {
    output: 'app-hosted-browser-authentication',
    scene: 'internal-browser-authentication',
    batch: 'windows-internal-browser',
    interaction:
      'Drive same-tab redirect, popup capture, New Tab, sanitized bookmark, then leave the nonbookmarkable authentication tab and external-browser escape action visible.',
  },
  {
    output: 'auto-updater-current-source-ready',
    scene: 'current-source-installed-update-ready',
    batch: 'windows-updater-lowlevel',
    interaction:
      'Invoke the real production check-for-updates IPC against the bounded loopback feed, observe the genuine Squirrel update-downloaded event, and leave the current-source About surface showing the disclosed inert fixture ready without clicking Quit and Install.',
  },
  {
    output: 'cheap-lfs-bambu-build-live',
    scene: 'bambu-build-live-inventory',
    batch: 'windows-cheap-lfs-live',
    interaction:
      'Clone the public Bambu build fixture afresh, open Cheap LFS, and show its ten verified Release-backed pointers without exposing an account.',
  },
  {
    output: 'cheap-lfs-cloud-compression',
    scene: 'private-cloud-compression-consent',
    batch: 'windows-cheap-lfs-live',
    interaction:
      'Use a caller-owned disposable private fixture with persisted cloud-compression consent and one retained verified compressed pointer; validate the current no-private-workflow encrypted public-builder route, then leave its bilingual routing notice and 99.9%-smaller row visible.',
  },
  {
    output: 'cheap-lfs-commit-progress',
    scene: 'wide-commit-progress',
    batch: 'windows-cheap-lfs-commit',
    interaction:
      'Run the verifier wide scenario and preserve its deterministic three-lane commit terminal at 1440x960.',
  },
  {
    output: 'cheap-lfs-restore-lookahead',
    scene: 'wide-restore-lookahead',
    batch: 'windows-cheap-lfs-restore',
    interaction:
      'Run the verifier wide scenario and preserve current transfer 90%, next transfer active, bounded concurrency, rate, ETA, and counters.',
  },
  {
    output: 'cheap-lfs-ui-acceptance',
    scene: 'private-live-pin-acceptance',
    batch: 'windows-cheap-lfs-live',
    interaction:
      'Fresh-clone the purpose-built private acceptance repository, verify its retained live Release-pointer history, then show the verified row and Materialize action without provider or repository mutation.',
  },
  {
    output: 'material-command-palette-appearance',
    scene: 'command-palette-appearance',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the command palette, type ollama, open its appearance editor, exercise deterministic random-per-repository mode, and leave a full screen of rich results (at least eight) plus the aligned, fully contained editor and Reset control visible at 1000x687.',
  },
  {
    output: 'material-command-palette-notification-after',
    scene: 'command-palette-notification-routes',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the command palette in the isolated production profile, leave the distinct live notification-centre and local notification-history routes visible, and preserve the route-selection evidence at 1000x687.',
  },
  {
    output: 'material-notification-centre-route',
    scene: 'notification-centre-route',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Activate the notification-centre command from the isolated production profile and preserve the live Notifications side sheet with its Local and GitHub tabs, filters, bulk controls, and caught-up state at 1000x687.',
  },
  {
    output: 'material-history-view-tabs-list',
    scene: 'history-view-tabs-list',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the built History surface in the isolated production profile, select its Commit list tab, and preserve the real tab strip, commit list, and accessible selected state at the reviewed capture size.',
  },
  {
    output: 'not-updated-with-main-filter',
    scene: 'merge-chooser-not-updated-with-main',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open Choose a branch to merge into main for the disposable repository, activate Not updated with main, verify the stale branch remains while the branch containing main is hidden, then inspect and promote the original client-only frame.',
  },
  {
    output: 'material-history-view-tabs-graph',
    scene: 'history-view-tabs-graph',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the built History surface in the isolated production profile, select its Graph tab, and preserve the real tab strip, ancestry graph, and accessible selected state at the reviewed capture size.',
  },
  {
    output: 'material-stash-manager-centered-20260803',
    scene: 'stash-manager-centered',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the built repository stash manager in the isolated production profile and preserve its centered Material dialog with Manage, Export, History, and Appearance and voice tabs at the reviewed capture size.',
  },
  {
    output: 'material-history-hover-time',
    scene: 'history-hover-time',
    batch: 'windows-history-hover',
    interaction:
      'Open History on the disposable repository, focus one real commit row, require a contained hover card with both its exact authored timestamp and a relative age, then preserve that card.',
  },
  {
    output: 'material-repositories-sheet',
    scene: 'repositories-sheet',
    batch: 'windows-repositories-sheet',
    interaction:
      'Open the repository sheet in dark bilingual mode, exercise the state-preserving Filters disclosure, and preserve the compact equal-width Add, Select, and More row after the narrow-width geometry gate passes.',
  },
  {
    output: 'material-github-releases-compact',
    scene: 'releases-compact-200-percent',
    batch: 'windows-releases-compact',
    interaction:
      'At 200% app zoom leave one complete release row and keyboard-reachable Filters and selection disclosure visible in the 960x660 client.',
  },
  {
    output: 'material-ollama-model-manager',
    scene: 'ollama-model-manager',
    batch: 'windows-ollama',
    interaction:
      'Run the attach-only verifier through endpoint health, installed/running inventory, selected details, and lifecycle controls, then retain its accepted final frame.',
  },
  {
    output: 'material-pull-preview',
    scene: 'reviewed-pull-preview',
    batch: 'windows-pull-preview',
    interaction:
      'Fetch once, open the exact frozen fast-forward review, and leave branch identities, incoming commits, changed files, and clean-worktree confirmation visible without confirming Pull.',
  },
  {
    output: 'material-publish-organization-picker',
    scene: 'publish-organization-picker',
    batch: 'windows-publish-organization-cdp',
    interaction:
      'Add and select the real P0 no-remote git-source repository through the shipped dialog, invoke Push to open Publish Repository, exercise fuzzy, substring, invalid and valid regex, the Regex Builder, keyboard selection of the final owner and None, then prove the bilingual picker at a physical 390x844 auto-fit window before restoring the reviewed 1440x960 frame.',
  },
  {
    output: 'material-tab-groups',
    scene: 'restored-tab-group',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Create a named colored tab group through the tab menu, relaunch the isolated profile, and leave the restored expanded group chip and member visible at 1000x687.',
  },
  {
    output: 'private-repository-lock-badge',
    scene: 'exact-private-metadata-badge',
    batch: 'windows-private-badge',
    interaction:
      'Open the repository picker after the app-native hook sets exact private metadata; retain the ordinary repository logo and separate focusable localized lock.',
  },
  {
    output: 'repository-groups-collapsed',
    scene: 'repository-group-collapsed',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Create one named repository group with three disposable members, activate its disclosure button once, and leave aria-expanded=false plus the member-count pill visible at 1180x820.',
  },
  {
    output: 'repository-groups-expanded',
    scene: 'repository-group-expanded',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Create one named repository group with three disposable members and leave aria-expanded=true with every member row and its fixture sync summary visible at 1180x820.',
  },
  {
    output: 'repository-list-sync-summary',
    scene: 'repository-row-sync-summary',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Use a disposable local/bare-origin repository with one known push and pull, open the repository picker, and crop the exact rendered row summary to 390x100 only after whole-window privacy inspection.',
  },
  {
    output: 'tab-overflow-search',
    scene: 'tab-overflow-regex-search',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open enough disposable repository tabs to force overflow at 1280x800, click the overflow button, enable regex mode, and leave its search field, results, and regex builder visible.',
  },
])

function buildGalleryCapturePlan() {
  const canonical = CanonicalGalleryOutputs.filter(
    output => !DeferredCanonicalOutputs.includes(output)
  ).map(output => ({
    output,
    scene: sceneForCanonicalOutput(output),
    batch: 'windows-canonical-cdp',
    interaction: `Run the registered ${sceneForCanonicalOutput(
      output
    )} scene in the complete canonical batch; promote only this output after the exact-set, semantic, geometry, font, and hash gates pass.`,
  }))
  const publishedSpecialists = SpecialistCaptureEntries.filter(
    entry => !DeferredSpecialistOutputs.includes(entry.output)
  )
  const entries = [...canonical, ...publishedSpecialists].map(entry => {
    const batch = CaptureBatches[entry.batch]
    if (batch === undefined) {
      throw new Error(`Unknown capture batch ${entry.batch}.`)
    }
    return Object.freeze({
      ...entry,
      file: `${entry.output}.png`,
      platform: batch.platform,
      commands: Object.freeze(
        batch.commands.map(command =>
          command.replaceAll('<output>', entry.output)
        )
      ),
      fixture: batch.fixture,
      privacyGate: batch.privacyGate,
    })
  })
  const byOutput = new Map(entries.map(entry => [entry.output, entry]))
  if (
    entries.length !== ExpectedPublishedGalleryCount ||
    byOutput.size !== entries.length
  ) {
    throw new Error(
      `Capture plan must contain ${ExpectedPublishedGalleryCount} unique outputs.`
    )
  }
  const missing = PublishedGalleryOutputs.filter(
    output => !byOutput.has(output)
  )
  const extra = entries
    .map(entry => entry.output)
    .filter(output => !PublishedGalleryOutputs.includes(output))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Capture plan/catalog mismatch: ${JSON.stringify({ missing, extra })}`
    )
  }
  const invalidDeferredSpecialists = DeferredSpecialistOutputs.filter(
    output =>
      !SpecialistCaptureEntries.some(entry => entry.output === output) ||
      PublishedGalleryOutputs.includes(output)
  )
  if (invalidDeferredSpecialists.length > 0) {
    throw new Error(
      `Deferred specialist outputs must be planned but unpublished: ${JSON.stringify(
        invalidDeferredSpecialists
      )}`
    )
  }
  return Object.freeze(entries)
}

const GalleryCapturePlan = buildGalleryCapturePlan()

const CaptureGaps = Object.freeze(
  CaptureGapDefinitions.map(definition => {
    const entry = GalleryCapturePlan.find(
      candidate => candidate.output === definition.output
    )
    if (entry === undefined) {
      throw new Error(
        `Capture gap ${definition.output} has no published gallery plan entry.`
      )
    }
    return Object.freeze({
      ...definition,
      file: entry.file,
      scene: entry.scene,
      batch: entry.batch,
      platform: entry.platform,
      commands: entry.commands,
    })
  })
)

module.exports = {
  buildGalleryCapturePlan,
  CanonicalCandidateCount,
  CanonicalGalleryOutputs,
  CanonicalGalleryScenes,
  CaptureBatches,
  CaptureGaps,
  DeferredCanonicalOutputs,
  DeferredSpecialistOutputs,
  ExpectedPublishedGalleryCount,
  GalleryCapturePlan,
  PublishedGalleryOutputs,
  RetainedHistoricalEvidence,
  SpecialistCaptureEntries,
}

if (require.main === module) {
  const summary = Object.entries(
    GalleryCapturePlan.reduce((counts, entry) => {
      counts[entry.batch] = (counts[entry.batch] ?? 0) + 1
      return counts
    }, {})
  ).map(([batch, count]) => ({ batch, count }))
  process.stdout.write(
    `${JSON.stringify(
      {
        published: GalleryCapturePlan.length,
        canonicalCandidates: CanonicalGalleryOutputs.length,
        deferredCanonical: DeferredCanonicalOutputs,
        deferredSpecialist: DeferredSpecialistOutputs,
        publishedSpecialist:
          SpecialistCaptureEntries.length - DeferredSpecialistOutputs.length,
        specialistCandidates: SpecialistCaptureEntries.length,
        batches: summary,
      },
      null,
      2
    )}\n`
  )
}
