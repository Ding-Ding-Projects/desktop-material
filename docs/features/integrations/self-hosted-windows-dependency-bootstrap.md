# Self-hosted Windows dependency bootstrap

Every self-hosted Windows job bootstraps its declared dependencies before it
builds, tests, packages, or publishes. A warm runner may reuse compatible tools
and exact dependency caches, but a cold runner is supported: the workflow does
not assume that Git Bash, Yarn, GitHub CLI, or `jq` was installed by an
administrator.

The hand-written inventory in
[`script/self-hosted-windows-job-inventory.json`](../../../script/self-hosted-windows-job-inventory.json)
keeps this coverage explicit. A workflow contract fails when a listed job loses
its dependency inventory, bootstrap path, or cold-bootstrap test.

## Covered Windows jobs

| Workflow | Job | Bootstrap path |
| --- | --- | --- |
| `build-installers.yml` | `test` | `setup-ci-environment` |
| `build-installers.yml` | `package` | `setup-ci-environment` |
| `ci-windows.yml` | `build` | `setup-ci-environment` |
| `ci-windows.yml` | `e2e-smoke` | `setup-ci-environment` |
| `super-express-release.yml` | `windows_build` | `super-express-windows-build` |
| `super-express-release-windows.yml` | `build` | `super-express-windows-build` |
| `super-express-release-windows.yml` | `publish` | Git Bash, GitHub CLI, and `jq` setup |

The direct Super Express Windows `build` and `publish` jobs both use
`[self-hosted, Windows, X64, desktop-material-windows-local]`. The ordinary
`CI Windows` manual dispatch keeps its explicit `cloud` or `self-hosted`
selection; automatic and untrusted invocations cannot select the local runner.

## Cold-bootstrap behavior

The shared Windows setup performs these steps before dependency installation:

1. An initial `actions/checkout` obtains the repository-owned bootstrap script.
   On an empty runner this checkout may use the archive fallback and therefore
   is not treated as the real Git checkout.
2. `.github/scripts/ensure-windows-git-bash.ps1` obtains the pinned Git for
   Windows `PortableGit-2.53.0.3-64-bit.7z.exe` asset from the canonical
   upstream release. Its archive is kept below `RUNNER_TOOL_CACHE`, checked
   against the repository-pinned SHA-256 value on every run, and extracted into
   a fresh job-local directory before execution.
3. The workflow repeats `actions/checkout` with identical inputs after Git is
   available. No Git, Bash, submodule, or local-action work begins before this
   second checkout has created a real repository.
4. `actions/setup-node@v6` supplies the requested Node.js version, pinned `uv`
   supplies Python 3.11 for native modules, and the setup verifies the selected
   Visual Studio, MSVC, ClangCL, and Windows SDK toolchain.
5. `.github/scripts/bootstrap-pinned-yarn.ps1` exposes the repository-owned
   Yarn `1.21.1` payload through both Windows and Git Bash launchers before
   cache probing or installation.
6. The current lockfiles drive a frozen dependency install whenever the exact
   verified dependency cache is unavailable. Older cache generations may warm
   the tree, but never replace current-lockfile verification.

The direct Windows publisher first runs the same Git Bash bootstrap. The
portable Git distribution supplies `curl`, `sha256sum`, and `unzip`, which the
publisher then uses to bootstrap its remaining release tools:

- `.github/scripts/ensure-github-cli.sh` caches the canonical GitHub CLI
  `2.97.0` archive, verifies its repository-pinned platform hash on every run,
  and extracts a fresh job-local executable;
- `.github/scripts/ensure-jq.sh` caches the canonical `jq` `1.7.1` binary,
  verifies its repository-pinned platform hash on every run, and copies a
  freshly verified executable into the job-local tool directory.

PortableGit and GitHub CLI archives plus the `jq` binary are stored under
versioned paths in `RUNNER_TOOL_CACHE`. A repeat run therefore reuses validated
download bytes without a new network request, while executables are recreated
under `RUNNER_TEMP` so a persistent extracted file is never trusted. Nothing is
installed machine-wide or committed to the repository.

## Yarn launcher details

The Yarn bootstrap copies the pinned payload to `RUNNER_TEMP` and creates:

- `yarn.cmd` for PowerShell and cmd-compatible action steps;
- `yarn` for Git Bash, which invokes the Node executable selected by the
  workflow and the copied payload beside it.

The launcher uses a relative payload path. This keeps temporary directories
with spaces or non-ASCII characters valid and avoids binding the launcher to a
Node executable from an older runner installation. The POSIX launcher is
normalized to LF before it is written, so a CRLF checkout cannot corrupt its
`/usr/bin/env bash` shebang.

## Configuration

The action input `node-version` remains the source of truth for Node.js. Tool
versions and upstream locations are pinned in their owning bootstrap files:

- PortableGit `2.53.0.3` in `ensure-windows-git-bash.ps1`;
- GitHub CLI `2.97.0` in `ensure-github-cli.sh`;
- `jq` `1.7.1` in `ensure-jq.sh`;
- Yarn `1.21.1` in `vendor/yarn-1.21.1.js`.

`RUNNER_TOOL_CACHE`, `RUNNER_TEMP`, `GITHUB_WORKSPACE`, `GITHUB_PATH`, and the
standard GitHub Actions environment files are the only runtime locations used.
No credential or package-registry value is written to the repository or cache.

## Failure modes

- A PortableGit, GitHub CLI, or `jq` download, missing repository-pinned hash,
  checksum mismatch, extraction failure, or executable-version failure stops
  the job at the bootstrap step and names the affected tool. Offline cache
  verification fails closed when the required cached bytes are absent or
  modified.
- Missing Node.js, Python, Visual Studio components, MSVC, ClangCL, or Windows
  SDK prerequisites stop setup before build or packaging work starts.
- A missing pinned Yarn payload, launcher write failure, `GITHUB_PATH` write
  failure, or unexpected bare-`yarn` resolution stops the job before cache
  probing.
- An incomplete dependency cache remains ineligible for reuse. Electron,
  Copilot, React, and Playwright runtime sentinels are checked before a build.

## Security considerations

Every fallback download uses HTTPS from the tool's canonical GitHub release and
is accepted only after repository-pinned SHA-256 verification. Persistent bytes
are checked again before every use; executables run from bounded job-local
paths, not an unrelated global toolchain. The bootstrap does not discover,
install, or invoke any signing credential or signing tool. Release credentials
exist only on steps that make authenticated API calls and are never printed or
cached.

## Verification

The committed fixture starts with an empty tool cache and proves that the exact
shared scripts produce working Git, Bash, `curl`, `sha256sum`, `unzip`, GitHub
CLI, and `jq`. It then forbids downloads and reruns the GitHub CLI and `jq`
scripts against the same cache, proving the warm path revalidates and reuses the
cached bytes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .github/scripts/test-windows-release-bootstrap.ps1
```

The focused workflow and bootstrap contracts are:

```text
node vendor/yarn-1.21.1.js test:unit app/test/unit/ci-setup-environment-test.ts
node vendor/yarn-1.21.1.js test:unit app/test/unit/ci-workflow-safety-test.ts
node vendor/yarn-1.21.1.js test:unit app/test/unit/super-express-release-workflow-test.ts
```

The clean dependency check is:

```text
node vendor/yarn-1.21.1.js install --frozen-lockfile
```

The registered self-hosted runner remains the final evidence for the complete
build-and-publish path; a local contract is not presented as a published
release.

## Suggested articles

- [Actions workflow manager](actions-workflow-manager.md)
- [Automated update build status and release notes](automated-updates-and-release-notes.md)
- [Local GitHub Actions runner](local-actions-runner.md)
