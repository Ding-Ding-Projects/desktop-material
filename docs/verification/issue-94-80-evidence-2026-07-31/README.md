# Issue #94 and #80 built-app evidence — 2026-07-31

Real captures from the production bundle, produced on an off-screen Win32
desktop through the project's own `capture_gallery_cdp.js` harness. These are
**issue evidence**, not guided-gallery members: they are not listed in
`docs/wiki/Feature-Gallery.md`, are not in `docs/assets/screenshots/`, and do not
change the 86-target gallery contract.

## Provenance

| Field | Value |
| --- | --- |
| Source commit | `5c6e7dc54b3ca71eab05725d49a5f8c1acea7294` |
| Build | `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod` — exit 0, 664.80 s |
| Electron | 42.0.1 / Chromium 148.0.7778.97 |
| Runtime | real `out/main.js` on an off-screen Win32 desktop, `--disable-gpu`, isolated `--user-data-dir` |
| Provider | `p0_fake_github_provider.py` bound to `127.0.0.1:49432` (loopback only) |
| Fixture | disposable 15-commit repository, `main` `ce9c1605`, `feature/material-verification` `09d7ed3e` |
| Theme / language | light / english |
| Capture method | CDP `Page.captureScreenshot` after the harness's renderer privacy assertion |

Light theme rather than dark: `--theme dark` cannot be satisfied on a host whose
OS theme is light, because the renderer applies theme through
`setNativeThemeSource` → Electron `nativeTheme` and not from
`localStorage.theme`. Neither scene constrains the theme.

## Captures

| File | Size | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `tab-group-tooltip-dismissed-1440x960.png` | 1440×960 | 133,810 | `1c7901c2afefe4ca7b1132620a7d7488b06dd6df1aac0b3b94e6ce4e76f47c26` |
| `tab-group-tooltip-dismissed-1180x820.png` | 1180×820 | 124,463 | `f4701af03595baf10f6182ebffd4fa6b4ffedc2f0efa1b9c300e5b0cc651808d` |
| `canonical-remote-warning-1280x860.png` | 1280×860 | 143,577 | `31c514b8fe20ae7c83d7ee28c28979c84d5c7e81d6b36f173be95543685a4846` |

Every frame was inspected at original resolution for expected state, blank or
black pixels, clipping, theme, dimensions, and private data. All identities in
frame are fixture identities (`material-fixture`,
`feature/material-verification`, the `MV` avatar); no real account, path, or
credential appears.

## #94 — what each frame proves

Scene: `tab-group-tooltip-dismissal-evidence`.

The scene removes the gallery tooltip suppressor, opens the real repository-tab
context menu, waits for ButtonHints to genuinely show the hint on the row marked
`data-issue-94-target`, then activates that exact row so the menu and the
tooltip's target unmount together. It fails the run unless
`staleTooltipCount === 0`, and additionally requires the resulting dialog to be
inside the dialog layer, inside the viewport, and to expose six usable colour
swatches.

**What to look at: the top-left corner of the window.** In the pre-fix frames
attached to the issue, a stranded "Add tab to new group…" tooltip sits there,
still describing a menu item that no longer exists. In both frames here that
corner holds only the ordinary title bar — the hint was dismissed with its
target, and the "New tab group" dialog that replaced the menu is the only
remaining surface.

Both viewports match the pre-fix evidence so the before/after pair is directly
comparable.

## #80 — what the frame and its receipt prove

Scene: `canonical-remote-warning-evidence`, receipt
`canonical-remote-warning-evidence.json`.

The scene points origin at a same-endpoint, credential-free URL for a repository
that does not exist, then drives the genuinely enabled **Push origin** control.

Visible in frame, bottom-right: a single non-blocking notice titled **"Remote URL
needs attention"** reading *"Desktop Material could not verify this repository's
remote URL. **No push was attempted.** Review the remote URL, then try again."*
with a **Change remote URL** action. The reported defect was a generic *"A
background action stopped unexpectedly"* toast that never said whether the push
ran; this notice answers that question in its own body text.

The receipt carries the assertions a screenshot cannot:

| Receipt field | Value | Acceptance item it satisfies |
| --- | --- | --- |
| `dom.warningCount` | `1` | routed through normal error presentation **once** |
| `dom.genericBackgroundNoticeCount` | `0` | the generic containment toast is gone |
| `dom.duplicateOccurrenceCount` | `0` | no "Reported 2 times" dedup counter |
| `provider.receivePackCount` | `0` | **no Git push was attempted** |
| `fixture.localHeadBeforeClick` / `AfterClick` | `e72f073f` / `e72f073f` | no local ref moved |
| `fixture.remoteTrackingBeforeClick` / `AfterClick` | `09d7ed3e` / `09d7ed3e` | no remote-tracking ref moved |
| `fixture.providerRemoteBeforeClick` / `AfterClick` | `09d7ed3e` / `09d7ed3e` | no remote ref moved |
| `provider.mutationsBeforeClick` / `AfterClick` | `2` / `2` | zero provider mutations |
| `provider.requests[0]` | `GET … 404` | the canonical-remote preflight ran and failed closed |
| `dom.warningRole` / `warningAtomic` | `alert` / `true` | screen-reader announced |
| `dom.visibleDialogCount` | `0` | non-blocking, not a modal |
| `dom.focus.enabled` | `true` | focus returned to a usable Push origin control |

## Harness repairs this run required

Both were genuine defects that made these captures impossible, and both are
fixed in the same commit as this receipt.

1. **`canonical-remote-warning-evidence` queried a selector the shipped UI never
   emits.** It looked for `button.push-pull-button.push-pull-button--push`, but
   `push-pull-button.tsx` puts those classes on the wrapping
   `div.toolbar-button`; the inner element is `button.button-component`. The
   scene therefore always timed out on "real enabled Push origin control". Now
   `.toolbar-button.push-pull-button.push-pull-button--push button.button-component`.

2. **The fixture account could not hydrate, because a hand-written credential is
   invisible to keytar.** `seed` failed with `accountCount: 0` and
   `fixtureTokenPresent: false`. keytar's Windows implementation
   (`keytar_win.cc`) stores the credential under
   `service + '/' + account` — not the service alone — with the secret as raw
   **UTF-8** bytes. `cmdkey.exe` cannot write such a target at all, because it
   rejects names containing both `: ` and spaces. The new
   `.codex/verification/set_p0_provider_credential.ps1` writes it correctly and
   proves the round trip before returning.

A third prerequisite is behaviour, not a defect, and is now documented:
`validateAppearanceLanguageSurface()` fires `show-preferences` **before** any
scene runs, so a pristine profile's first-run welcome screen fails it.
`has-shown-welcome-flow` must be staged before the harness starts; only
`--canonical true` skips that validator.

## Cleanup

The run's headless desktop was closed, the app and provider processes were
terminated by saved PID, the fixture credential was deleted, and the owned
`%TEMP%` run root was removed. The loopback fixture token
(`dm-p0-loopback-token-20260713`) is a public constant in
`p0_fake_github_provider.py`, not a secret.
