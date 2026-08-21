# Browser-extension download handoff

## Status

Desktop Material now owns the Windows desktop surfaces and bounded message
contract for a browser-extension download handoff. It does **not** currently
ship a browser extension or a registered native-messaging host manifest, so the
integration must report unavailable rather than pretending the in-app browser
or a File Explorer shell extension can initiate this feature.

The existing **Preferences → Integrations** surface exposes this exact
unavailable state. It is a real status card inside the current frozen interface,
not a new destination or a browser-page mock.

## Behaviour

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
The current code is a receiving foundation, not a browser extension and not a
mocked browser page.

## Verification

Focused tests cover strict native-message parsing and the three owned surface
states. This ultra-speed implementation lane did not run tests, type checks,
builds, packaging, runtime interaction, or captures; real native-host and
browser-extension installation evidence remains pending.
