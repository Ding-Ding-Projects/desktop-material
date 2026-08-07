# Repository transfer headless verification — 2026-08-05

- **Mode:** capture-only
- **Milestone:** account-aware repository transfer implementation
- **Worktree:** `C:\Users\cntow\Documents\GitHub\desktop-material-transfer-repository`
- **Branch:** `codex/transfer-repository`
- **Remote:** `https://github.com/Ding-Ding-Projects/desktop-material.git`
- **Expected UI state:** a cold, isolated Windows desktop launch using a disposable Git fixture; when account-backed repository data is available, the Repository transfer dialog should expose destination account, owner, repository name, Full history, Clean state, review, confirmation, progress, and recovery/error states.
- **Background interactions:** create a deterministic fixture; build through the cheap Lowlevel MCP HTTP server; create one named hidden desktop; launch the built Electron application directly with an isolated user-data directory and `--cli-open` fixture; resolve the HWND dynamically; capture client-only screenshots; close the verified window and desktop.
- **Disposable fixture root:** a unique directory below the process-owned Temp root; no repository or user data is reused.
- **Screenshot target:** the built Windows app at its first stable nonblank frame, original dimensions, inspected for blank pixels, clipping, and private data. Transfer-dialog capture is attempted only if the isolated fixture can truthfully expose an account-backed GitHub repository without credentials.
- **Documentation allowlist:** this manifest, `HANDOFF.md`, and the repository-transfer feature documentation. No user screenshots or unrelated documentation are changed.
- **Declared checks:** focused repository-transfer tests, changed-file ESLint, changed-path TypeScript diagnostics, unpackaged production build, and hidden-desktop launch/close evidence.
- **Verification server:** the exact `lowlevel-computer-use-mcp` checkout and cheap HTTP tool protocol, using an isolated loopback listener for this run because the fixed shared listener was occupied by other build clients.
