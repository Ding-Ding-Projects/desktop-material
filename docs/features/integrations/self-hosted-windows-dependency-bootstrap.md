# Self-hosted Windows dependency bootstrap

The Windows self-hosted CI path must install dependencies before any build,
cache validation, or cross-compilation step invokes Yarn. The repository keeps
Yarn `1.21.1` in `vendor/yarn-1.21.1.js`; the setup action uses that file rather
than depending on a preinstalled global Yarn command.

## Behavior

For a Windows self-hosted runner, `.github/actions/setup-ci-environment/action.yml`
performs these steps in order:

1. Verify that Git and its bundled `bin/bash.exe` are available.
2. Install the requested Node.js version with `actions/setup-node@v6`.
3. Install the managed Python and configure the native-module Python path.
4. Run `.github/scripts/bootstrap-pinned-yarn.ps1`.
5. Add the temporary launcher directory to the GitHub Actions path in both
   Windows and MSYS forms.
6. Confirm that bare `yarn` in Git Bash resolves to the repository-owned POSIX
   launcher before cache probing or dependency installation.

The bootstrap copies the pinned Yarn payload to `RUNNER_TEMP` and creates:

- `yarn.cmd` for PowerShell and cmd-compatible action steps;
- `yarn` for Git Bash, which invokes the Node executable selected by the
  workflow and the copied payload next to it.

The launcher uses a relative payload path. This keeps temporary directories
with spaces or non-ASCII characters valid and avoids binding the launcher to a
Node executable from an older runner installation. The POSIX launcher is
normalized to LF before it is written, so a CRLF checkout cannot corrupt its
`/usr/bin/env bash` shebang.

## Configuration

The action input `node-version` remains the single source of truth for the
Node.js version. The pinned Yarn payload is deliberately versioned in the
repository and included in the dependency-cache key. `RUNNER_TEMP`,
`GITHUB_WORKSPACE`, `GITHUB_PATH`, and the standard GitHub Actions environment
files are the only runtime locations used; no credential or package registry
value is written to the repository.

## Failure modes

- Missing Node.js after the Node setup step stops the bootstrap with an
  actionable error.
- A missing pinned payload, launcher write failure, or `GITHUB_PATH` write
  failure stops the job before cache reuse.
- Missing Git Bash or an unexpected bare-`yarn` resolution stops the job before
  the cache and install steps, instead of allowing a later opaque command-not-
  found failure.
- An incomplete dependency cache remains ineligible for reuse. The existing
  cache completeness and final dependency checks still validate Electron,
  Copilot, React, and Playwright runtime files before the build.

## Security considerations

The bootstrap uses the repository-pinned Yarn file and the Node version chosen
by the workflow. It does not download an executable from an unverified URL,
embed a credential in a launcher, or copy a machine-specific absolute Node
path into a generated file. The temporary launchers are scoped to the current
job and are not committed or cached as project source.

## Verification

The focused contract test is:

```text
node vendor/yarn-1.21.1.js test:unit app/test/unit/ci-setup-environment-test.ts
```

The clean install check is:

```text
node vendor/yarn-1.21.1.js install --frozen-lockfile
```

The runtime probe selects Node `v24.15.0`, uses a temporary path containing a
space and a non-ASCII character, and verifies Yarn `1.21.1` through both the
Windows and Git Bash launchers. Remote Super Express CI remains the source of
truth for the actual registered runner.

## Suggested articles

- [Actions workflow manager](actions-workflow-manager.md)
- [Automated update build status and release notes](automated-updates-and-release-notes.md)
- [Local GitHub Actions runner](local-actions-runner.md)
