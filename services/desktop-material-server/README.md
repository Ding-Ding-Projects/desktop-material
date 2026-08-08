# Desktop Material self-hosted server

This service is the private rendezvous point for Desktop Material features that
need two machines to meet. It has no vendor backend and no telemetry path.

The first committed contract deliberately stays small:

- bounded health reporting;
- one-time, expiring join links whose secret lives in the URL fragment;
- opaque per-device credentials stored only as SHA-256 hashes;
- an authenticated admin operation that rotates the join link;
- a capability response that says unimplemented server features are unavailable
  instead of pretending they work.

The server never accepts a token in a URL query, never logs request bodies or
authorization headers, and never writes plaintext bootstrap or device tokens to
disk. A non-loopback listener requires TLS or an explicitly declared trusted
reverse proxy. The default Compose binding is loopback-only until the guided
wizard has configured the public HTTPS boundary.

## OAuth authorization server (roadmap item R2 / #119)

The same container issues identities: it is a minimal but real OAuth 2.0
authorization server (`oauth.mjs`), not a client of one. It is provisioned
by the wizard, not configured after the fact — the app's
`createSelfHostedServerBootstrap` (`app/src/lib/self-hosted-server/provisioning.ts`)
generates an ES256 signing keypair and a default client registration at the
same moment it creates the admin credential, and writes both into the exact
bootstrap file this server loads.

- `GET /.well-known/oauth-authorization-server` (and the `openid-configuration`
  alias) — discovery metadata.
- `GET /oauth/jwks.json` — the public signing key only; the private key never
  leaves the server process.
- `GET /oauth/authorize` — authorization-code + PKCE (S256 only), gated by
  either an `Authorization: Basic admin:<admin token>` header (the same admin
  identity `/v1/admin/join-links` already trusts) or a prior `dm_sso` session
  cookie.
- `POST /oauth/token` — `authorization_code` and rotating `refresh_token`
  grants; replaying a consumed refresh token revokes its whole token family.
- `GET /oauth/userinfo` — resolves a bearer access token to its subject and
  scopes.

**Single sign-on / multi-domain SSO**: approving `/oauth/authorize` for the
first client sets an in-memory `dm_sso` session cookie (httponly, 8-hour
lifetime). Any other client registered with this server — a different
`redirect_uri`, a different domain — that presents the same cookie is
authorized without re-prompting for the admin credential. That is this
server's whole SSO surface: one shared session, fanned out across every
client this authority knows about via ordinary OAuth authorize calls. It is
process-local and does not survive a restart.

**Identity model**: today this server has exactly one identity — its own
administrator, `sub: "admin"`. It does not (yet) run a multi-user account
database; per-user identity is out of scope for this pass.

**SAML federation**: the wizard accepts optional operator-supplied metadata
and the server validates and exposes its bounded, normalized record at
`GET /oauth/saml/metadata`. Validation requires an HTTPS entity ID, HTTPS
`SingleSignOnService` locations, and a bounded signing-certificate value; DTD
and entity declarations are rejected. This is configuration/metadata handling
only. Signed XML assertion verification, ACS bindings, and SAML login are not
implemented, and `capabilities.identity` still reflects only the OAuth
surface.

**Sign-in wiring decision**: this app has no loopback OAuth listener — see
`app/src/main-process/main.ts`'s `possibleProtocols` and
`internal-browser-window.ts`. Self-hosted sign-in therefore reuses the same
`x-github-desktop-auth` deep link and the same hardened, partitioned,
callback-correlated internal-browser authentication path dotcom sign-in
already uses, rather than opening a new listener. `parseAppURL` recognizes
`x-github-desktop-auth://self-hosted/oauth?code=…&state=…` as its own
action distinct from dotcom's `oauth` action
(`app/src/lib/parse-app-url.ts`), and
`app/src/lib/self-hosted-server/oauth-sign-in.ts` builds the PKCE authorize
request, performs the code exchange, and verifies `/oauth/userinfo` against the
same normalized tenant origin. The preferences wizard now exposes the
self-hosted sign-in entry point; the callback verifier accepts only the exact
in-memory state and verifier, then lands the verified `sub` as a
`self-hosted` account through the existing account store event. Refresh-token
rotation remains a server contract; the newly created account keeps the
short-lived access token and does not yet implement background refresh.

## Container boundary

`compose.yml` drops all Linux capabilities, enables `no-new-privileges`, uses a
read-only root filesystem, and exposes only `127.0.0.1` by default. Persistent
configuration and state live in the mounted `data` directory. The image is
pinned to the Docker Official Node 24.15.0 Alpine index digest.

## Local verification

```powershell
C:\Users\cntow\AppData\Local\DesktopMaterialToolchains\node-v24.15.0-win-x64\node.exe --test services/desktop-material-server/test/server.test.mjs
C:\Users\cntow\AppData\Local\DesktopMaterialToolchains\node-v24.15.0-win-x64\node.exe --test services/desktop-material-server/test/server-oauth.test.mjs
C:\Users\cntow\AppData\Local\DesktopMaterialToolchains\node-v24.15.0-win-x64\node.exe --test services/desktop-material-server/test/oauth.test.mjs
```

This foundation alone does not complete roadmap item R1. The in-app Windows
Docker installer, HTTPS provisioning, recovery UI, and real second-machine join
receipt remain completion gates and must be integrated before #118 can close.
R2 (#119) is still bounded: the OAuth authorization server and local callback
handshake are wired and tested, while SAML assertion acceptance, external
identity-provider acceptance, and full per-user identity remain outside this
local patch.
