# Bug-hunt cleanup ledger

- Run ID: `bug-hunt-2026-07-26-019f9f87`
- Owned MCP log root:
  `<system temporary folder>\desktop-material-bug-hunt-20260726-019f9f87`
- Superseded P0 UI harness root:
  `<system temporary folder>\desktop-material-p0-ui-bug-hunt-20260726-019f9f87`
- Final P0 UI harness root:
  `<system temporary folder>\desktop-material-p0-ui-bug-hunt-final-019f9f87-1`
- Owned Git fixture, bare remote, Electron profile, and transient captures were
  all children of those two allowlisted P0 roots.
- Final headless desktop: `DesktopMaterialBugHuntFinal-019f9f87`
- MCP-log-root state: created for the manually launched MCP server; it contains
  only that server's stdout/stderr logs and an otherwise empty capture
  directory. It is separate from the P0 fixture root.
- Final fixture state before teardown: deterministic branch one ahead and zero
  behind its exact `origin/feature/material-verification` ref, with no
  configured upstream and one controlled changed Markdown file.
- Final provider state: loopback-only provider PID `46072`; stopped after the
  disposable keychain entry was deleted and independently proved absent.
- Final desktop state: created once with handle `1416`, then released after its
  window count reached zero.
- Final launch PID: `39692`; gracefully terminated after the verified capture.
- Final resolved HWND: `3479594`, title
  `material-fixture - Desktop Material`; resolved at runtime, never reused as a
  hard-coded automation target.
- Accepted regex-builder capture: 92,564 bytes, SHA-256
  `BEFBFA90491120195884F7424AAB551B81CB3174068077E466A8020C335A28B1`,
  promoted to `docs/assets/screenshots/regex-builder.png`.
- Accepted issue-#39 capture: 110,183 bytes, SHA-256
  `568C2B927F555586CDBFA62BD1AC79B6E4A7C8B7CC17D4F98178CCF6441D4AC6`,
  promoted to `issue-39-push-origin.png` in this verification directory.
- Cleanup state: complete. Both allowlisted P0 roots were removed through the
  guarded cleanup helper after their app/provider processes stopped. The
  separately configured local Lowlevel MCP service remains available; its
  log-only root is not a fixture, profile, credential store, or product-data
  directory.
