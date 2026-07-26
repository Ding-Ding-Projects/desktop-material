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

## Failure modes

| Situation | Behaviour |
| --- | --- |
| `opencode` not installed | The verb is never generated; the toggle is disabled with an explanation. A menu entry pointing at a missing binary fails silently from Explorer, where there is nowhere to show an error. |
| Windows 10 | Packaged handler unavailable (`requires-windows-11`); classic verbs work normally. |
| Build has no shell extension (no C++ toolchain at build time) | `package-missing`; classic verbs work normally. |
| Sideloading disabled | `developer-mode-required`. See the security note below. |
| Registration fails at runtime | The error is shown verbatim and the classic verbs remain active. |
| Quick window fails to load | Falls back to opening the folder in the full app. |
| Repository has no remote, or several non-`origin` remotes | The commit still succeeds; the push is refused rather than guessing, and says so. |
| Detached `HEAD` | Commit is blocked with an explanation and a pointer to the full app. |

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

## Verification

Unit tests (`node script/test.mjs`), none of which touch the live registry or
register a package:

- `app/test/unit/windows-context-menu-test.ts` — quoting and refusal cases,
  both surfaces, `opencode`-missing suppression, HKCU-only invariant,
  `REG_SZ`-only invariant, removal generation, and state detection including the
  outdated/partial-install cases.
- `app/test/unit/quick-action-test.ts` — argument parsing and validation, the
  launch-argument round trip against the parser, the commit gate's precedence,
  remote-branch derivation, and remote selection.
- `app/test/unit/shell-extension-package-test.ts` — manifest generation, the
  X.500 publisher and bare-CLSID forms the MSIX schema requires, path-traversal
  refusal, mode decision, and a cross-check that the manifest's CLSID matches
  the one compiled into `dllmain.cpp`.

Verified on a Windows 11 host during development:

- The COM server compiles with MSVC and exports `DllGetClassObject` and
  `DllCanUnloadNow` undecorated (`dumpbin /EXPORTS`).
- The generated manifest passes real MSIX schema validation — `makeappx pack`
  succeeds, which is what caught the quoted-publisher and bare-GUID
  requirements.
- The quick-action window builds as its own bundle and the launch path opens it.

**Not yet verified:** live `Add-AppxPackage -Register` and the resulting
top-level menu entry. That requires sideloading to be enabled on the host, which
is a system security setting the agent does not change. A cold-open timing
figure from a packaged build is likewise still outstanding; the instrumentation
is in place and logs `Quick action window interactive in <n>ms`.

## Build

`script/build-shell-extension.ts` compiles the DLL, generates the manifest from
the same module the app reads, and writes placeholder PNG package assets. It is
wired into `script/build.ts` for Windows builds and is **optional**: when no C++
toolchain is present the build logs a skip and continues, and the app falls back
to the classic verbs. Pass `--pack` to also produce a signable `.msix` for
anyone who has a real signing certificate.
