# Status Hub projection

## Behaviour

The existing **Agents** sidebar is the desktop surface for the current
repository's agent-session fleet. It shows a compact status line supplied by a
main-process Status Hub client; it does not create a second dashboard or a
mock copy of the Hub.

The client projects a registered repository, current session state, heartbeat,
and evidence records. Evidence is explicitly `verified`, `running`, `unrun`,
or `blocked`; a local build, source file, or session label never becomes a
green claim by itself. The returned stable URL is shown only when the client
has an authenticated, configured Hub endpoint.

When no owner endpoint or credential is configured, the Agents surface says it
is using local session state only. This fallback is intentional and remains
truthful while the app is offline.

## Security boundary

Only the Electron main process performs Hub networking. Renderer IPC carries a
credential-free session projection and receives a credential-free status or
reply record. Credentials belong to the owner-managed operating-system vault;
they are never rendered, logged, exported, or placed in a Hub projection.

The Discord bridge is not a desktop client. Its scope is read-plus-reply in the
Hub's own session inbox. It may not obtain a desktop agent credential, mutate
the desktop session state, or act as an agent. Desktop reply delivery is called
confirmed only after the authenticated Hub inbox poll reports confirmation.

## Failure modes

| Condition | Result |
| --- | --- |
| No endpoint | Local-only status with no stable URL |
| Missing vault credential | Explicit authentication-unavailable status |
| Request timeout or refusal | Explicit unavailable status; local fleet remains usable |
| Oversized or malformed response | Rejected before it reaches the renderer |
| Reply poll lacks delivery confirmation | No delivered claim is shown |

## Verification

This Yum Leung Cha lane intentionally did not run focused tests, packaging,
runtime interaction, or captures. The evidence inventory records implementation
and documentation paths while those verification dimensions remain pending.
