# Windows Explorer context menu and quick-action window

Adds Desktop Material actions to the File Explorer right-click menu on folders
and folder backgrounds, and gives those actions a small dedicated window instead
of booting the full application.

## What the user gets

Two verbs, both offered on a folder and on the empty space inside an open
folder:

| Verb | Effect |
| --- | --- |
| **Open with OpenCode here** | Opens a terminal already in that folder running the `opencode` CLI. |
| **Open in Desktop Material** | Opens the *quick-action window* scoped to that folder. |

Both are opt-in, per-user toggles in **Settings → Integrations → Windows context
menu**.

### The quick-action window

A right-click is a momentary intent, so the Desktop Material verb does not
restore the whole workspace. It launches

```
GitHubDesktop.exe --quick-action=status-commit-push --path=<folder>
```

which opens a small, always-on-top Material Design 3 panel showing the folder's
branch and changed-file count, a commit summary field, and a **Commit & push**
button with live progress. An **Open in full app** button is the escape hatch
for anything the panel does not cover; `Esc` dismisses it.

The panel is a separate webpack bundle (`quick-action`) with its own minimal
renderer, following the existing crash-window precedent, so it does not pay for
the main renderer's bundle. It stays on top only until it first loses focus —
a permanently-topmost panel becomes an obstruction rather than a convenience.

Commit-and-push follows the branch's configured tracking remote. For example,
`upstream/release/3.6` is pushed to branch `release/3.6` on `upstream`, even when
an `origin` remote also exists. If more than one configured remote can parse a
slash-containing tracking label, the push fails closed instead of guessing. An
unpublished branch still chooses `origin`, or the only configured remote;
ambiguous remotes are never guessed.

## Placement: two implementations

Windows 11's compact context menu shows only *packaged* `IExplorerCommand`
handlers. Classic `Directory\shell` verbs are relegated to **Show more
options** (or `Shift+F10`). The feature therefore ships both, and the settings
pane reports which one is actually serving the menu.

### Classic verbs (always available)

Per-user registry keys under `HKEY_CURRENT_USER\Software\Classes`:

```
Software\Classes\Directory\shell\DesktopMaterialOpenCodeHere
Software\Classes\Directory\Background\shell\DesktopMaterialOpenCodeHere
Software\Classes\Directory\shell\DesktopMaterialOpenRepository
Software\Classes\Directory\Background\shell\DesktopMaterialOpenRepository
```

Each verb key carries `MUIVerb` (the localized label) and `Icon`, with the
command on its `command` subkey's default value.

**Never `HKEY_LOCAL_MACHINE`, never elevated.** The generator's hive type has
exactly one member so a machine-wide write is not expressible.

### Packaged handler (top-level Windows 11 menu)

A real in-process COM server — `shell-extension/src/dllmain.cpp`, compiled with
MSVC — implements `IExplorerCommand` and `IEnumExplorerCommand`, presenting a
**Desktop Material** flyout with the same two actions. It ships in a *sparse*
MSIX package (`uap10:AllowExternalContent`), so the binaries stay in the app's
ordinary install directory rather than being copied into a package root.

The external layout is fixed as
`<app-root>\shell-extension\DesktopMaterialShellExtension.dll`, with
`GitHubDesktop.exe` one directory above `shell-extension`. The DLL validates
that directory name and requires the root executable to be a regular file
before enabling or returning an icon. Both the DLL's PE machine and the sparse
manifest identity match the product lane (`x64` or `arm64`); an ARM64 build on
an x64 runner uses MSVC's `Hostx64\arm64` cross-toolchain.

#### Where `<app-root>` points, and why it outlives an update

Windows records the external location **once, at registration**, and never
revisits it. An installed build runs from Squirrel's per-version directory
(`%LOCALAPPDATA%\GitHubDesktop\app-<version>\`), which the *next* update
replaces with a new one and eventually deletes — so a registration recorded
against it is valid for exactly one release. The package goes on reporting
`Status: Ok` from a folder that no longer exists, and the top-level menu
silently disappears. That was issue #66.

The contract is therefore:

<!-- markdownlint-disable MD013 -->

| Layout | External location | Why |
| --- | --- | --- |
| Installed (Squirrel) | `%LOCALAPPDATA%\GitHubDesktop\` — the update root | Holds the stub `GitHubDesktop.exe` the manifest's `Executable` names, which Squirrel keeps pointed at the current version, and survives every update. |
| Anything else (development, portable, an unpackaged build directory) | The directory holding `process.execPath` | Unchanged behaviour: there is no versioned directory to climb out of. |

<!-- markdownlint-enable MD013 -->

The update root is only chosen when that stub executable is genuinely there;
without it the manifest's `Executable` entry would not resolve, so the
executable's own directory is kept instead. `process.execPath` still decides
*which* install is registering, so a portable or side-by-side copy registers
itself rather than another install.

Because the external location now outlives the version that wrote it, the
`shell-extension` folder copied beside the launcher is **refreshed on every
registration** rather than only when absent — otherwise the first release's DLL
would be the one every later release registers. The refresh is best-effort:
Explorer keeps the DLL loaded once the menu has been shown, which locks the
file, so a failed copy falls back to the folder already in place rather than
losing a working registration.

#### Repair after an update, and the stale state

Registration state is not mirrored into a preference — the registration itself
*is* the user's opt-in. On every Windows launch the app asks
`Get-AppxPackage` not just *whether* the package is registered but **where
from**, and compares that recorded directory against the one this install would
register:

- **absent** — nothing registered. Left strictly alone: repair restores a
  choice, it never makes one, so a user who never turned the feature on (or who
  turned it off) never finds it on.
- **current** — recorded against this install. The mode reads `modern`.
- **stale** — recorded somewhere this install does not own, or nowhere at all
  (Windows empties `InstallLocation` once the folder is gone). Silently
  re-registered against the current install, with the outcome logged.

A stale registration deliberately **does not report `modern`**. It surfaces as
the `registration-stale` blocker with the mode falling back to `classic` or
`none`, because Explorer really is showing nothing; reporting the mode the
*package* claims rather than the one the *user* has is what turned a broken
feature into an invisible one. It is also the one blocker that leaves the
toggle operable — switching it on re-registers — where every other blocker
names a host prerequisite the app will not change and so disables the toggle.

**Known limitation:** the packaged handler's menu labels are English only. The
COM server is loaded by Explorer, not by the app, so it has no access to the
renderer's persisted language mode — unlike the classic verbs, whose `MUIVerb`
is written in the user's chosen language at install time. Localizing it means
either MRT resources in the package or a small shared config the DLL reads;
neither is implemented.

## Configuration

Settings → Integrations → **Windows context menu**:

- **Open with OpenCode here** — disabled with an explanation when `opencode` is
  not found on `PATH` or in a known install location.
- **Open in Desktop Material**
- **Show in the main Windows 11 menu** — registers the packaged handler.

Toggle state is read back from the live registry and package list rather than
mirrored into a preference, so an entry removed by another tool, or invalidated
by an app update, reports honestly. An entry whose command no longer matches the
current install reads as present with a "turn it off and on again to repair"
hint, because Explorer really is still showing it.

The packaged toggle is the mirror image: a registration pointing outside this
install reads as **off**, with a message saying it still points at a folder from
an earlier version, because Explorer really is showing nothing. Launch-time
repair normally clears it before the user ever opens the pane; it stays visible
when the repair could not run (sideloading turned off since, or a build with no
package).

## Failure modes

<!-- markdownlint-disable MD013 -->

| Situation | Behaviour |
| --- | --- |
| `opencode` not installed | The verb is never generated; the toggle is disabled with an explanation. A menu entry pointing at a missing binary fails silently from Explorer, where there is nowhere to show an error. |
| Windows 10 | Packaged handler unavailable (`requires-windows-11`); classic verbs work normally. |
| Build has no shell extension (no C++ toolchain at build time) | `package-missing`; classic verbs work normally. |
| Sideloading disabled | `developer-mode-required`. See the security note below. |
| App updated after the handler was registered | The launch-time check finds the recorded location is no longer this install and re-registers silently. The user's opt-in is preserved either way: nothing is registered for a user who had it off. |
| Registration is stale and cannot be repaired | `registration-stale`: reported as **not** active, with the reason, and the toggle stays operable so switching it on re-registers. A more fundamental blocker (Windows 10, no package, sideloading off) is named ahead of it, because that is what must be fixed first. |
| Refreshing the copied package fails because Explorer has the DLL loaded | The registration proceeds against the copy already in place rather than failing. |
| Registration fails at runtime | The error is shown verbatim and the classic verbs remain active. |
| Quick window fails to load | Falls back to opening the folder in the full app. |
| Unpublished repository has no remote, or several non-`origin` remotes | The commit still succeeds; the push is refused rather than guessing, and says so. |
| Configured tracking remote is missing | The commit still succeeds; the push is refused instead of silently redirecting to `origin`. |
| Tracking label is ambiguous between slash-containing remote names | The commit still succeeds; the push is refused rather than choosing the wrong remote. |
| DLL is copied outside the fixed `shell-extension` layout, or the root executable is missing | The packaged command reports disabled and never launches or advertises an unrelated executable. |
| Native toolchain is missing, or output architecture does not match the requested product lane | The build removes its generated package before returning, deletes partial output on failure, and reports the exact blocker; a stale or wrong-architecture DLL is never shipped. |
| Detached `HEAD` | Commit is blocked with an explanation and a pointer to the full app. |

<!-- markdownlint-enable MD013 -->

## Security considerations

- **Per-user scope only.** Every registry key is under `HKCU`. No elevation is
  requested at any point.
- **No certificate is ever installed.** A signed MSIX only installs if its
  signing certificate is trusted, and trusting a self-signed certificate means
  writing a machine-wide certificate store — an administrator-level security
  change. The app will not do that on the user's behalf. Registration is instead
  a loose, unsigned `Add-AppxPackage -Register`, which needs no signature but
  does require sideloading to be enabled in **Windows Settings → System → For
  developers**. The app reads that policy and reports it; it never changes it.
- **Command generation refuses suspicious input.** A path or label containing a
  double quote or a control character aborts generation rather than being
  escaped, because a double quote is not a legal Windows path character.
- **Labels crossing IPC are sanitized.** The renderer supplies the localized
  `MUIVerb` (it owns the language mode); the generator strips control
  characters, collapses whitespace, and length-caps before it reaches the
  registry.
- **Manifest paths cannot escape the package.** Absolute paths and `..`
  segments are rejected, so the shell can only be pointed at binaries inside the
  app's own install directory.
- **No shell interpretation.** `reg.exe` and PowerShell are invoked with
  generated argv and `shell: false`, never a concatenated command string.
- **Launch arguments are validated.** `--path` must be an absolute Windows or
  UNC path; a relative path is refused rather than resolved against whatever the
  working directory happens to be.
- **The native launch target is layout-derived and checked.** The COM server
  does not accept a registry-configurable executable path. It validates its
  owned `shell-extension` parent, climbs exactly one level, and requires the
  resulting `GitHubDesktop.exe` path to name a file.

## Verification

Unit tests (`node script/test.mjs`), none of which touch the live registry or
register a package:

- `app/test/unit/windows-context-menu-test.ts` — quoting and refusal cases,
  both surfaces, `opencode`-missing suppression, HKCU-only invariant,
  `REG_SZ`-only invariant, removal generation, and state detection including the
  outdated/partial-install cases.
- `app/test/unit/quick-action-test.ts` — argument parsing and validation, the
  launch-argument round trip against the parser, the commit gate's precedence,
  remote-branch derivation, unambiguous tracking-remote selection, slash-name
  ambiguity refusal, missing-upstream refusal, and unpublished-branch remote
  selection.
- `app/test/unit/shell-extension-package-test.ts` — manifest generation, the
  X.500 publisher and bare-CLSID forms the MSIX schema requires, path-traversal
  refusal, x64/arm64 identity, mode decision, and a cross-check that the
  manifest's CLSID matches the one compiled into `dllmain.cpp`. Plus the
  update-stability contract: the chosen external location never contains an
  `app-<version>` segment, an unpackaged layout is left exactly as it was, a
  registration whose location is gone or belongs to another install reads as
  stale, a stale registration never reports `modern`, and repair fires for
  `stale` while `absent` is left alone.
- `script/build-shell-extension-test.ts` — target-aware MSVC discovery, x64
  and ARM64 PE-machine validation, a real x64 DLL load from the packaged
  directory, root-executable state/icon resolution, and a real ARM64
  cross-compile with matching manifest identity when the toolchain is present,
  plus stale-package removal when a requested toolchain is absent.

Verified on a Windows 11 host during development:

- The COM server compiles with MSVC and exports `DllGetClassObject` and
  `DllCanUnloadNow` undecorated (`dumpbin /EXPORTS`).
- The generated manifest passes real MSIX schema validation — `makeappx pack`
  succeeds, which is what caught the quoted-publisher and bare-GUID
  requirements.
- The quick-action window builds as its own bundle and the launch path opens it.

Verified live on 2026-07-26 (Windows 11 Pro 26200, Developer Mode already
enabled — no security setting was changed):

- `Add-AppxPackage -Register … -ExternalLocation …` on the CI-built package
  from release `v3.6.3-beta3-zadttgmugx` registers cleanly per user:
  `DesktopMaterial.ShellExtension_1.0.0.0_x64__6yspk5eyn48ge`.
- The registered manifest wires both surfaces (`Directory`,
  `Directory\Background`) to the compiled class, and the DLL activates for
  real: `DllGetClassObject` returns `S_OK`, the root command reports
  `ECS_ENABLED` (proving the app-beside-DLL check), and the tooltip returns its
  coded `E_NOTIMPL`.
- Right-clicking a folder in an Explorer window opens the Windows 11 modern
  menu (its `Microsoft.UI.Content.PopupWindowSiteBridge` popups appear on
  demand). This ran on an off-screen desktop, where DWM does not compose XAML
  popups, so a pixel capture of the open menu is not obtainable headlessly —
  an interactive-session screenshot remains the one outstanding capture.
- The verification exposed a packaging gap, now fixed: packaged builds ship
  `shell-extension/` under `resources\app`, while registration needs it beside
  `GitHubDesktop.exe`. Registration now self-heals by copying the shipped
  folder into place (`decideShellExtensionPackageSource`), which also rescues
  every already-shipped build.

Diagnosed live on 2026-07-27 (issue #66, same host):

- `Get-AppxPackage -Name DesktopMaterial.ShellExtension` reported
  `Architecture: X64`, `Status: Ok` — and an `InstallLocation` of
  `…\Local\dm-ctxmenu-live\GitHubDesktop-win32-x64\shell-extension`, a scratch
  verification directory rather than the installed app. Two Squirrel
  `app-<version>` directories coexisted at the time, which is exactly the state
  that strands a registration.
- Architecture mismatch, COM activation failure, and a missing package were all
  ruled out. The registration was intact; the directory it named was not the
  app.
- The fix — a version-stable external location plus launch-time repair — is
  covered by unit tests. A real post-update re-registration has not yet been
  observed end to end on a shipped build, because that needs an installed build
  carrying this change to be updated over; when it is, record it here.

A cold-open timing figure from a packaged build is still outstanding; the
instrumentation is in place and logs `Quick action window interactive in <n>ms`.

## Build

`script/build-shell-extension.ts` compiles the DLL, generates the manifest from
the same module the app reads, and writes placeholder PNG package assets. It is
wired into `script/build.ts` for Windows builds and is **optional**: when no C++
toolchain is present the build logs a skip and continues, and the app falls back
to the classic verbs. The builder selects the x64 or ARM64 compiler from the
same Visual Studio installation, calls `vcvarsall` with the matching target,
and verifies the emitted PE machine before writing the architecture-specific
manifest. Pass `--pack` to also produce a signable `.msix` for anyone who has a
real signing certificate.
