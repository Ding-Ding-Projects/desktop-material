# Original GitHub OAuth release verification run manifest

- Mode: `publish`
- Source exercised: `0e6273b46555d5fd683461db3560190d4d97a51e`; OAuth implementation commit `6f84c4f6ce7318ce999b7a2392404b5650f40e2a` is an ancestor. Upstream was later applied through `6680b4649080f2c8f37b5d8030b4aadb40ff7877` before the release-workflow repair.
- Milestone: prove that a production Windows build uses Desktop Material's original registered GitHub OAuth client and exact `x-github-client://oauth` callback, paints a nonblank startup surface, and reaches the real authorization page without a `redirect_uri` rejection.
- Privacy boundary: the captured authorization surface contains empty fields and no account, credential, authorization code, token, private repository, or private organization data.
- Build command: `npx --no-install cross-env RELEASE_CHANNEL=development DESKTOP_SKIP_PACKAGE=1 yarn build:prod`.
- Build result: exit `0` in `672.05 s`; built Electron executable SHA-256 `082d352efc6a9f5882354ee4096ae0b40b78bc6c8e52fc5084f3df9254c613ff`.
- Static proof: built-in OAuth configuration and exact callback were present in the built artifacts; no unresolved OAuth placeholders and no CI/release OAuth-secret overrides were present.
- Focused test: `app/test/unit/oauth-build-wiring-test.ts`, **1 passed, 0 failed**.
- Interaction route: cheap Lowlevel MCP HTTP service on a uniquely named off-screen Win32 desktop; Chromium DevTools Protocol drove only the built application's own internal browser window. The visible desktop, cursor, keyboard focus, and foreground application were untouched.
- Runtime result: the app's internal browser rendered the provider page for the original development application with no callback warning.
- Accepted capture: `docs/assets/screenshots/material-original-github-oauth-release-20260806.png`, 1,160×780, 59,122 bytes, SHA-256 `2da2b2b2f61dc64ee59043a029e82bff70651add7f6d1f55e608790e29c6793d`.
- Cleanup: owned process `65624` was terminated after the native close guard refused a background-window focus change; zero owned windows remained and the named hidden desktop closed successfully. No fixture, credential, token, or authorization state was promoted.
- Release state at capture time: no release from this proof was claimed. A new signed Latest release from the integrated tip remains a separate gate.
