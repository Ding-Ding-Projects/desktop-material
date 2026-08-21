# Browser-extension download handoff

## Status

Desktop Material now owns the Windows desktop surfaces, a checked-in unpacked
browser-extension entry, and a bounded native-messaging contract for a
browser-extension download handoff. The extension is not presented as
installed: this repository still does not ship a native host executable or a
registered host manifest, so the integration reports unavailable rather than
pretending the in-app browser or a File Explorer shell extension can initiate
this feature.

The existing **Preferences → Integrations** surface exposes this exact
unavailable state. It is a real status card inside the current frozen interface,
not a new destination or a browser-page mock.

## Behaviour

The checked-in `browser-extension/` package adds a Manifest V3 service worker
and a small options page. A user action on a link is the only producer: it
reads the locally configured Windows destination, validates the request, and
uses `chrome.runtime.connectNative` to submit it. It does not observe or
replace the browser's ordinary download stream in the background.

An installed native-messaging host may submit one strict JSON request with an
HTTPS/HTTP source, suggested file name, chosen local destination, bounded id,
and timestamp. Unknown fields, invalid paths, unsupported schemes, control
characters, and unbounded payload values are rejected before a renderer can
see them.

When a genuine request reaches the desktop owner, it renders three separate
existing-dialog-system surfaces:

1. **Start download** names the file, source, and destination and requires an
   explicit confirmation before any transfer.
2. **Downloading** is a separate operation-progress surface showing truthful
   bytes, rate where available, pause, resume, and cancel controls.
3. **Completion** is a distinct completion dialog/notification-ready state
   naming the output rather than a background-only table entry.

The desktop queue supplies the eventual native-host executor a unique
same-volume temporary path, validates that it is a regular file, and atomically
materializes only the approved destination. It refuses to overwrite an existing
destination. A cancelled or failed transfer removes temporary output and never
claims a completed file.

## Security and boundaries

The handoff deliberately refuses to use either the app-hosted internal browser
download-blocked route or the File Explorer shell extension as proof of browser
extension integration. Renderer IPC is also not a native-messaging substitute.
The current code is a receiving foundation plus an unpacked extension source
tree, not an installed browser integration or a mocked browser page.
`app/src/lib/browser-extension-native-messaging.ts` implements native frame
bounds, strict UTF-8/JSON decoding, response framing, request validation, and
host-manifest generation. It also emits fixed `reg.exe` argv for the per-user
Chrome/Edge registry location; callers must execute that argv without a shell.
Host-manifest generation refuses wildcard origins and requires both an exact
32-character Chrome extension ID and an absolute Windows executable path.

The remaining packaging blocker is concrete: Chrome's native-messaging host
manifest must name a real executable and an exact extension ID. This unsigned
project does not generate or store a browser-extension signing key, and its
Windows package currently has no standalone native host executable. Therefore
the host manifest is intentionally a pure builder used by a future packaging
lane, not a checked-in manifest containing a guessed path or wildcard origin.
The extension source can be loaded unpacked for contract review, but it cannot
claim end-to-end delivery until a supported host executable and an owner-
approved stable extension ID exist.

## Verification

Focused tests cover strict request parsing, native-messaging framing, exact
host-origin generation, and the three owned surface states. The extension has
not been loaded into a browser, because no host executable is registered in
this build. Native-host installation, real browser interaction, packaged
runtime interaction, and captures therefore remain pending and are not claimed.
