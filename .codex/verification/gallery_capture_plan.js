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

const ExpectedPublishedGalleryCount = 89
const CanonicalCandidateCount = 68
const DeferredCanonicalOutputs = Object.freeze(['material-cheap-lfs-preparing'])

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
  'windows-internal-browser': Object.freeze({
    platform: 'windows-headless',
    commands: Object.freeze([
      'node .codex/verification/verify_internal_browser_cdp.js --port <owned-cdp-port> --run-root <owned-temp-run-root> --receipt <owned-temp-run-root>\\receipts\\internal-browser.json',
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
      'Lowlevel launch the owned legacy Super Express installation against the owned Squirrel update feed, wait for update-ready, then capture_screenshot(client_only=true, hwnd=<resolved-app-hwnd>, path=<owned-temp-run-root>\\captures\\auto-updater-update-ready.png)',
    ]),
    fixture:
      'Owned legacy alphabetic-s installation and deterministic newer alphabetic-z Squirrel feed on a hidden Win32 desktop.',
    privacyGate:
      'Use isolated user data and fixture identity only; inspect the original 960x660 client frame before promotion.',
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
  'linux-tui-lowlevel': Object.freeze({
    platform: 'linux-xvfb',
    commands: Object.freeze([
      'uv build --clear',
      '<owned-wheel-venv>/bin/desktop-material-tui <owned-linux-run-root>/fixture',
      'Lowlevel Linux Xvfb capture_screenshot(window_id=<resolved-terminal-window>, path=<owned-linux-run-root>/captures/<output>.png)',
    ]),
    fixture:
      'Fresh installed wheel; ephemeral Linux/Xvfb terminal; owned Git fixture with local bare origin, three controlled changes, branch, tag, stash, and isolated XDG roots.',
    privacyGate:
      'Use only fixture paths and example.invalid identity; inspect the original 1600x1000 terminal capture and run the secret-pattern scan before promotion.',
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
      'node .codex/verification/verify_ollama_manager_cdp.js --port <owned-cdp-port> --p0-run-root <owned-p0-run-root> --ollama-run-root <owned-ollama-run-root> --capture <owned-p0-run-root>\\captures\\material-ollama-model-manager.png --receipt <owned-p0-run-root>\\receipts\\material-ollama-model-manager.json',
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
    output: 'auto-updater-update-ready',
    scene: 'installed-update-ready',
    batch: 'windows-updater-lowlevel',
    interaction:
      'Start the legacy alphabetic-s installation, complete the real Squirrel download from the owned feed, and leave About showing the newer alphabetic-z update ready.',
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
      'Use a disposable private fixture, explicitly enable cloud compression, pin one synthetic compressible file, and leave the bilingual verified compressed-pointer row visible.',
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
      'Use the native picker in a disposable private repository, push one synthetic pointer through the real provider path, then show the verified row and Materialize action.',
  },
  {
    output: 'linux-tui-bilingual-narrow',
    scene: 'bilingual-narrow',
    batch: 'linux-tui-lowlevel',
    interaction:
      'Switch the installed TUI to bilingual mode, resize the terminal to 100 columns, dismiss a real toast by mouse, and prove primary controls remain unclipped.',
  },
  {
    output: 'linux-tui-cheap-lfs',
    scene: 'cheap-lfs-preview',
    batch: 'linux-tui-lowlevel',
    interaction:
      'Open Cheap LFS with one canonical pointer and one 101 MiB candidate, edit the path tag and repository/provider fields, click Preview, and make no provider mutation.',
  },
  {
    output: 'linux-tui-overview',
    scene: 'changes-overview',
    batch: 'linux-tui-lowlevel',
    interaction:
      'Open the installed wheel on the three-change fixture and leave Changes, repository rail, toolbar, tabs, and visible focus treatment in frame.',
  },
  {
    output: 'linux-tui-regex-builder',
    scene: 'regex-builder',
    batch: 'linux-tui-lowlevel',
    interaction:
      'Edit the raw (alpha|beta) pattern and multiline sample, click case-insensitive mode, and leave two matches plus capture groups visible.',
  },
  {
    output: 'linux-tui-text-input',
    scene: 'commit-text-input',
    batch: 'linux-tui-lowlevel',
    interaction:
      'Click the commit-summary Input, type TUI mouse proof, enter and edit a two-line TextArea body, and do not submit the commit.',
  },
  {
    output: 'material-command-palette-appearance',
    scene: 'command-palette-appearance',
    batch: 'windows-ui-state-lowlevel',
    interaction:
      'Open the command palette, type ollama, open its appearance editor, and leave five rich results plus the fully contained editor and Reset control visible at 1000x687.',
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
  const entries = [...canonical, ...SpecialistCaptureEntries].map(entry => {
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
  return Object.freeze(entries)
}

const GalleryCapturePlan = buildGalleryCapturePlan()

module.exports = {
  buildGalleryCapturePlan,
  CanonicalCandidateCount,
  CanonicalGalleryOutputs,
  CanonicalGalleryScenes,
  CaptureBatches,
  DeferredCanonicalOutputs,
  ExpectedPublishedGalleryCount,
  GalleryCapturePlan,
  PublishedGalleryOutputs,
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
        specialist: SpecialistCaptureEntries.length,
        batches: summary,
      },
      null,
      2
    )}\n`
  )
}
