# Supply-chain and CI hardening

Desktop Material's continuous-integration workflow builds and signs the Windows
installers that users actually run, so what its jobs install and how its runs
are scheduled are security properties, not conveniences. Three things enforce
that: Dependabot proposes dependency updates instead of letting pins rot, every
install in CI is pinned to the committed lock file, and a dedicated **Supply
chain** job checks lock-file provenance and reports npm advisories.

The trusted CI and Super Express paths are self-hosted-only. CI jobs and all
seven jobs in `Build Installers / Express Release` use static `self-hosted`
plus operating-system and architecture labels. The Windows jobs additionally
require `desktop-material-windows-local`, and Linux/WSL jobs require
`desktop-material-wsl-local`; those custom labels are attached to the project's
registered local Windows and WSL runners so another incomplete self-hosted
machine cannot claim a release job accidentally. CI and Super Express
concurrency are ref-scoped, so obsolete trusted runs are cancelled while other
publication workflows retain their immutable run-and-attempt history.
Reusable CI calls are accepted only from `Ding-Ding-Projects/desktop-material`
and only check out that repository, so an external caller cannot turn the local
runner into a general-purpose executor.

The fresh-install contract is checked against the repository's pinned
toolchain: the parity generator and generated YAML must declare the same 206
desktop features, and the TypeScript configurations must remain valid for the
pinned TypeScript 5.8.2 release. The dependency compatibility test guards
those settings so a TypeScript 6-only option or a script root that cannot
resolve repository imports fails locally before consuming a self-hosted run.
The settings-tab migration map is intentionally consumed by persistence code
in a class method; its lint annotation documents that ownership rather than
hiding an unused property.

The composite dependency setup also treats Linux and Windows self-hosted
runners as first-class environments. It installs uv 0.11.26, provisions the
pinned Python 3.11 interpreter with `uv python install`, exports the resolved
interpreter to `npm_config_python`, and skips `actions/setup-python`'s hosted
tool cache whenever `runner.environment` is `self-hosted`. This matters on
Debian 13, where the hosted Python manifest does not contain the requested
3.11 x64 entry; relying on that action would fail before the actual lint or
package work starts.

Self-hosted setup deliberately does not register archive-cache post hooks.
The exact installed-dependency cache, uv cache upload, and setup-node Yarn
download cache remain available to hosted jobs, but self-hosted jobs install
their declared dependencies directly. On a persistent local runner, a cache
save runs after the real build has finished and can keep the runner marked busy
while it uploads a large tree; disabling those optional hooks keeps the
runner available without weakening the dependency install itself. The
focused contract test checks the split so a future cache optimization cannot
quietly reintroduce the long post-run hold.

The Windows E2E lane does not install a second system-wide FFmpeg package.
The repository post-install step provisions Playwright's pinned FFmpeg payload,
and the dependency-cache sentinel verifies that payload before a cache is used.
Avoiding a Chocolatey install keeps the self-hosted Windows service usable
without administrator rights and prevents a stale system package lock from
blocking the entire E2E job.

The self-hosted Linux release lanes also bootstrap the pinned GitHub CLI when
the runner image does not provide `gh`. The bootstrap reuses an existing CLI or
downloads the canonical Linux archive into `RUNNER_TEMP`, verifies its published
SHA-256 checksum, and adds only that temporary bin directory to `GITHUB_PATH`.
Release-gate API calls therefore do not depend on a cloud-runner convenience
package or a system-wide install. The sibling-run lookup also uses the CLI's
built-in `--jq` evaluator and returns one tab-separated record, so it does not
silently assume that a separate `jq` executable happens to be installed on the
self-hosted image. This keeps the dependency surface explicit: the only
release API binary that must be bootstrapped is the pinned `gh` archive whose
checksum is verified above.

## Behaviour

### Dependency update proposals

`.github/dependabot.yml` covers three manifests:

| Ecosystem        | Directory | Schedule      | Open-PR limit |
| ---------------- | --------- | ------------- | ------------- |
| `github-actions` | `/`       | Weekly Monday | 3             |
| `npm` (Yarn 1)   | `/`       | Weekly Monday | 5             |
| `npm` (Yarn 1)   | `/app`    | Weekly Monday | 3             |

Before this was added, the file contained only the `github-actions` entry with
`open-pull-requests-limit: 0`, which disables version updates entirely: no
update was ever proposed for the workflows, and neither the root toolchain nor
the packaged app's own dependencies were covered at all.

Updates are grouped so the queue stays readable. Each npm entry raises one
pull request for development-dependency minors and patches, and one for
production patches; production minors and every major arrive individually
because they deserve individual review. Action updates arrive as a single
grouped pull request, since each one is a change to the pipeline that publishes
releases.

The limits are small on purpose. Every pull request against this repository
runs the full CI matrix — a Windows x64 and arm64 build, a packaged E2E smoke
run, and the Python TUI matrix — so an open-PR limit is really a budget for
reviewer attention and runner minutes. Five at the root leaves room for the two
groups plus a few individual majors; three for `app/` is deliberately tighter
because those dependencies ship inside the installer.

`versioning-strategy: increase-if-necessary` keeps a `^`-style range in
`package.json` untouched when the new version already satisfies it, so most
proposals are lock-file-only changes.

Some dependencies are ignored because a bot cannot update them correctly:

- **`electron`** — the version is asserted in three coordinated places:
  `devDependencies`, `target` in `app/.npmrc`, and `ValidElectronVersions` in
  `script/validate-electron-version.ts`. Editing only the first produces a
  build that fails release validation.
- **`@types/react`, `@types/minimatch`, `mkdirp`** — pinned by the
  `resolutions` block in `package.json`, which Dependabot does not rewrite, so
  a bump would be silently overridden.
- **`brace-expansion`** — resolved to the reviewed shim in
  `vendor/brace-expansion-compat`, not to a registry version.

Not covered, deliberately: the `file:` dependencies in `vendor/`
(`desktop-trampoline`, `desktop-notifications`, `windows-argv-parser`,
`printenvz`), because Dependabot cannot propose updates for a path dependency;
and `tui/uv.lock`, which is outside this repository's current desktop-only work
and would only produce pull requests nobody is allowed to act on.

### Lock-file enforcement

Every CI install now resolves exactly what the committed lock file says.

- `ci-linux.yml` → `lint` runs `yarn install --frozen-lockfile`.
- `ci-windows.yml` → `build` → "Run desktop-trampoline tests" runs
  `yarn install --frozen-lockfile` inside `vendor/desktop-trampoline`.
- `pages.yml` → docs build already ran
  `yarn install --frozen-lockfile --ignore-scripts --non-interactive` before
  this change, and is unchanged.

With Yarn Classic, a plain `yarn` silently re-resolves and rewrites `yarn.lock`
when it no longer matches the manifests. `--frozen-lockfile` makes that an
explicit failure at the install step instead of a mystery later: the install
stops with "Your lockfile needs to be updated, but yarn was run with
`--frozen-lockfile`". In the `lint` job that fails earlier, and names the cause,
where the existing `git diff --name-status --exit-code` guard would only report
that some file changed at the end of the job. Yarn Classic's message is generic
and does not name the drifted dependency — running `yarn install` locally shows
which one it is.

Three install sites are **not** covered because they live in files outside this
change's scope, and all three are recorded here so the gap is visible rather
than assumed closed:

- `.github/actions/setup-ci-environment/action.yml` runs a bounded retry loop
  around a plain `yarn`. This is the install used by the `build` and `e2e-smoke`
  jobs.
- `script/post-install.ts` installs `app/` with the vendored Yarn using
  `install --force`, which re-fetches packages and can rewrite `app/yarn.lock`.
  The `lint` job's clean-working-directory check catches the resulting drift,
  but only after the fact.
- `.github/workflows/build-installers.yml` runs a plain `yarn install` for the
  desktop-trampoline tests in the release lane.

On self-hosted Windows arm64 jobs, the setup action also discovers Visual Studio
with `vswhere.exe`, reads `Microsoft.VCToolsVersion.default.txt`, and installs
the `Microsoft.VisualStudio.Component.VC.Tools.ARM64` and
`Microsoft.VisualStudio.Component.VC.Tools.x86.x64` components when the exact
default MSVC version lacks `VC\Tools\MSVC\<version>\bin\Hostx64\arm64\cl.exe`.
The arm64 helper runs before ClangCL, waits up to 120 five-second checks for the
compiler after a quiet installer return, and exports the selected instance in
`npm_config_msvs_version` so the later ClangCL check cannot silently choose a
different installation. The action handles a runner where the MSVC directory
is absent, verifies the compiler after installation, and fails before
production build if setup did not complete. The installer smoke test checks the
Squirrel process exit code and requires the exact package version's newly
written executable, preventing a stale persistent runner installation from
being accepted.

All self-hosted Windows jobs also verify the architecture-specific ClangCL
toolset required by the `vendor/desktop-trampoline` native test. The setup
action selects one Visual Studio instance with the matching `Toolset.props`,
`Toolset.targets`, `MSBuild\Current\Bin\MSBuild.exe`, x64 MSVC compiler, and
`VC\Tools\Llvm\<architecture>\bin\clang-cl.exe`, then exports that instance
through `npm_config_msvs_version` so node-gyp does not choose a different
incomplete installation. When no complete instance is available, it asks the
installed Visual Studio instance to add both
`Microsoft.VisualStudio.Component.VC.Llvm.Clang` and
`Microsoft.VisualStudio.Component.VC.Tools.x86.x64` with the installer's
supported quiet/no-restart flags. Because that invocation can return before
the installer has materialized the files, the script then polls for the
compiler and both MSBuild toolset files for up to 120 five-second checks before
failing with an explicit setup error. Installer status codes `0`, `3010`,
`1001`, and `1618` remain eligible for that bounded verification; other codes
fail immediately. The installer has no `--wait` option on the runner's Visual
Studio Installer 4.7.25, so the setup contract rejects that unsupported flag.
This keeps the native test from racing an in-progress installation while still
failing closed when the runner never receives a usable toolset.

### Lock-file provenance and integrity (blocking)

The `supply-chain` job's first step reads `yarn.lock` and `app/yarn.lock` and
fails the job if either:

- resolves a package from a host other than `registry.yarnpkg.com` or
  `registry.npmjs.org`, or
- has a `resolved` URL with no `integrity` line.

At the time this was written both files are clean: 906 resolved packages in
`yarn.lock` and 324 in `app/yarn.lock`, all from `registry.yarnpkg.com`, all
carrying an `integrity` hash.

Entries with no `resolved` line at all — the `file:` resolutions pointing into
`vendor/` — are skipped, because their content is reviewed as repository code.
`vendor/desktop-trampoline/yarn.lock` is upstream's own file and is not checked:
three of its 145 entries (`balanced-match`, `isexe`, `safer-buffer`) predate
`integrity` and would fail the check without anything being wrong in this
repository.

### Dependency advisories (reporting, never blocking)

The job's second step runs `yarn audit` for the root and `app/` manifests and
writes both reports into the run's job summary, adding a `::warning`
annotation when advisories are found. **It always exits 0.**

That asymmetry is the point. `yarn audit` exits with a bitfield of the
severities it found (1 info, 2 low, 4 moderate, 8 high, 16 critical), so gating
on its exit code fails every commit for as long as an advisory exists —
including a transitive advisory with no published fix, which no commit in this
repository can repair. At the time of writing, `yarn audit` in `app/` reports
exactly that case: one **high** advisory for `ansi-html`, reached through
`webpack-hot-middleware > ansi-html`, patched in `>=0.0.8` upstream but not yet
released through that dependency chain. A blocking audit would have turned CI
red on arrival and stayed red.

So the split is — blocking, because each is deterministic and offline:

- the lock file no longer matches the manifests (the install itself fails);
- a lock-file entry resolves from an unexpected host;
- a lock-file entry lost its `integrity` hash.

Reporting only, because neither is something a commit can be sure of fixing:

- an npm advisory exists, at any severity, with or without an available fix —
  job summary plus a warning annotation;
- `yarn audit` could not run at all (registry unreachable, manifest error) — a
  warning annotation stating that advisories were **not** evaluated.

The "could not run" case is reported explicitly rather than passing quietly,
because a silent empty audit looks identical to a clean one. The step
distinguishes the two by looking for `Packages audited` in the output, not by
the exit code, which is ambiguous between "found advisories" and "failed".

### Run concurrency

The self-hosted CI and Express Release groups are keyed by ref and cancel older
trusted runs; other installer and Pages publication workflows retain unique
run-and-attempt groups:

| Workflow family                              | Group                   | `cancel-in-progress` |
| --------------------------------------------- | ----------------------- | -------------------- |
| Push and manual CI validation                 | Per ref                 | Yes                  |
| Express Release self-hosted release           | Per ref                 | Yes                  |
| Other installer and Pages publication         | Per run and attempt     | No                   |

Ten pushes to one branch now leave only the newest trusted CI run active. The
registered self-hosted pool is scarce, so cancelling obsolete work keeps the
runner focused on the commit that can still ship. The workflow safety test
allows this behavior only for `ci-linux.yml`, `ci-windows.yml`,
`build-installers.yml`, and the three `super-express-release*.yml` files.

## Security considerations

- The provenance check defends against the realistic lock-file attack: an entry
  quietly repointed at an attacker-controlled host, or stripped of its
  `integrity` hash so any tarball is accepted. It is a text check over files
  already in the commit, so it cannot be influenced by the network at run time.
- `--frozen-lockfile` closes the window where a compromised or merely careless
  manifest edit causes CI to resolve a version nobody reviewed.
- CI jobs run on registered self-hosted Linux or Windows runners for trusted
  pushes, manual dispatches, and workflow calls. The CI workflows deliberately
  have no `pull_request` trigger, because untrusted PR code must never execute
  on the public repository's self-hosted machines.
- The Linux TUI job installs the repository's pinned Node.js version before
  parity generation. The Windows TUI job enables repository-local Git long
  paths before Git-backed history tests, because the profile fixture can exceed
  the Windows default path limit. These steps are local runner preparation,
  not cloud-runner fallback.
- The `supply-chain` job requests only `contents: read` and installs nothing,
  so a malicious postinstall script has no opportunity to run in it.
- Dependabot pull requests are proposals, not deployments: nothing in this
  repository publishes a Release from a pull request. `build-installers.yml`
  requires a `push` event on `main` from this repository.
- Advisory text and lock-file paths are the only data written to the job
  summary. No token, signing credential, or secret is echoed.

## Failure modes

**`error Your lockfile needs to be updated` at an install step.** A manifest
changed without its lock file. Run `yarn install` locally and commit the
updated `yarn.lock`.

**`Lock file provenance` error annotation.** A `resolved` URL points somewhere
unexpected, or an `integrity` line is missing. Review the `yarn.lock` diff
before merging. A legitimately new registry has to be added to the allowlist in
`ci-linux.yml` deliberately.

**Warning annotation "Dependency advisories".** `yarn audit` found advisories.
Read the job summary; upgrade if a fix exists, otherwise record the accepted
risk. CI stays green either way.

**Warning annotation "Dependency audit unavailable".** `yarn audit` could not
complete. Treat that run as carrying **no** advisory evidence and re-run once
the registry is reachable.

**A trusted CI run says "Canceled".** A newer push or manual dispatch for the
same ref superseded it. This is expected: only the newest trusted commit's run
matters. CI has no pull-request trigger; review validation runs on a trusted
push or explicit manual dispatch instead.

**A `main` run says "Canceled".** A newer trusted `main` run may have
superseded it. The installer workflow will only publish from a successful CI
conclusion, so inspect the newest same-ref run for the release evidence.

**The Windows TUI job reports `Filename too long` while writing profile
history.** The checkout did not have `core.longpaths` enabled. Confirm the
workflow's repository-local Git setting runs immediately after checkout and
rerun the newest same-ref CI run; do not switch the job to a hosted runner.

**The Windows arm64 dependency setup reports a missing MSVC toolset.** The
self-hosted setup discovers the installed Visual Studio instance, installs its
arm64 C++ components when absent, and verifies `Hostx64\arm64\cl.exe` before
`node-gyp` runs. If installation cannot complete, the job reports that setup
failure and skips the production build instead of emitting misleading missing
module errors from a build guarded by `always()`.

**The Windows x64 job stalls in `desktop-trampoline` native tests.** Check the
setup log for `MSB8020` naming `ClangCL`. The shared self-hosted setup now
selects and exports a complete architecture-specific ClangCL instance before
the test; a failure to install it is a setup failure, not a test timeout to
ignore.

**A canceled Windows CI or release run keeps working.** Recovery steps
intentionally use `always()` so a genuine test failure can still leave a
diagnostic installer, but every heavy recovery, packaging, artifact-upload, and
release-publisher condition also checks `!cancelled()`. A newer push or release
dispatch therefore releases the self-hosted runner instead of allowing a stale
canceled run to continue its build or publish side effects.

## Verification

Performed on 2026-07-31 against the working tree, before any push:

- Both YAML files parse. `js-yaml` 4.3.0 and PyYAML both load
  `.github/workflows/ci-linux.yml` and `.github/dependabot.yml`; the folded
  concurrency expressions collapse to single-line strings with no embedded
  newlines.
- Both `run:` scripts in the `supply-chain` job were extracted from the parsed
  YAML and pass `bash -n`.
- The provenance step was executed locally: it reports 906 and 324 resolved
  packages and exits 0 for `yarn.lock` and `app/yarn.lock`.
- Negative control: run against `vendor/desktop-trampoline/yarn.lock` it exits
  1 and names the three entries with no `integrity` hash.
- Positive control: run against a copy of `yarn.lock` with one `resolved` host
  rewritten to `evil.example.com` and one `integrity` line deleted, it reports
  both defects and exits 1.
- The advisory step was executed locally with `RUNNER_TEMP` and
  `GITHUB_STEP_SUMMARY` pointed at temporary files. It exits 0, writes a clean
  report for the root manifest ("0 vulnerabilities found - Packages audited:
  975") and, for `app/`, records `yarn audit` exit code 8 plus the `ansi-html`
  advisory table and emits the warning annotation.
- `yarn audit` was confirmed to work with no `node_modules` present, so the
  `supply-chain` job needs no install: it resolves its tree from the lock file
  plus the in-repo `vendor/` path dependencies, none of which are git
  submodules.
- `npx prettier --write` was run on both YAML files.

ClangCL bootstrap verification performed on 2026-08-06:

- `.github/scripts/ensure-windows-clang.ps1` selected the complete Visual
  Studio Community instance for both `x64` and `arm64`, verified the matching
  compiler plus MSBuild props and targets, and wrote
  `npm_config_msvs_version` to the runner environment file.
- The exact Windows x64 native sequence passed locally: `node-gyp rebuild`
  produced all three trampoline executables, `yarn build` passed, and
  `yarn test` passed all 9 tests.
- `yarn test:unit app/test/unit/ci-setup-environment-test.ts` passed all 2
  focused setup-contract tests.
- Run `31077267784` exposed that Visual Studio Installer 4.7.25 rejects
  `--wait`; commit `28d7d032ef` removed the unsupported flag, and the local
  setup contract passes **2/2** with a negative guard for it. The replacement
  setup sequence then exposed that quiet installation can return before the
  toolset files are visible; commit `b5e6b7f825` added the bounded five-second
  poll, and the focused setup contract now covers both the unsupported-flag
  guard and the asynchronous completion path. Commit `87ec5b3452` extends
  that protection to arm64, keeps the two architecture helpers on one Visual
  Studio instance, and verifies the x64 MSVC/MSBuild prerequisites; the focused
  setup contract passes **32/32** across its four suites, and direct local
  probes pass for both x64 ClangCL and arm64 MSVC discovery.
- A new GitHub Actions run is still required to verify the registered
  self-hosted runner's own Visual Studio instance and the resulting Windows
  x64/arm64 CI and release lanes.

Not verified locally, and not verifiable without a run on GitHub:

- Whether Dependabot accepts the root manifest's `file:` dependencies and
  `resolutions` block without erroring. If it does error, it shows up in the
  repository's Dependabot logs rather than in CI.
- The evaluated value of the concurrency expressions, which only GitHub's
  expression engine produces. The expressions use the `github` context only —
  no `inputs` — specifically so they cannot fail to evaluate on a `push` or
  `pull_request` event.
- The `--frozen-lockfile` installs were not executed here (a full install would
  disturb a working tree other agents are using). Their premise was checked
  statically instead: every `dependencies`, `devDependencies`, and
  `optionalDependencies` entry of `package.json`, `app/package.json`, and
  `vendor/desktop-trampoline/package.json` already has a matching pattern key in
  its lock file, which is the condition `--frozen-lockfile` enforces.
