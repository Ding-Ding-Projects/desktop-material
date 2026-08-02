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

## Container boundary

`compose.yml` drops all Linux capabilities, enables `no-new-privileges`, uses a
read-only root filesystem, and exposes only `127.0.0.1` by default. Persistent
configuration and state live in the mounted `data` directory. The image is
pinned to the Docker Official Node 24.15.0 Alpine index digest.

## Local verification

```powershell
C:\Users\cntow\AppData\Local\DesktopMaterialToolchains\node-v24.15.0-win-x64\node.exe --test services/desktop-material-server/test/server.test.mjs
```

This foundation alone does not complete roadmap item R1. The in-app Windows
Docker installer, HTTPS provisioning, recovery UI, and real second-machine join
receipt remain completion gates and must be integrated before #118 can close.
