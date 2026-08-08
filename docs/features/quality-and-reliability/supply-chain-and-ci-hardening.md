# Supply-chain and CI hardening

Desktop Material's continuous-integration workflow builds the Windows
installers that users actually run, so what its jobs install, how its runs are
scheduled, and how it proves those installers remain unsigned are security
properties, not conveniences. Dependabot proposes dependency updates instead
of letting pins rot, every install in CI is pinned to the committed lock file,
and a dedicated **Supply chain** job checks lock-file provenance and reports npm
advisories.

Automatic `CI Windows` validation uses GitHub-hosted `windows-2022` machines. A
protected-main manual dispatch keeps the explicit `cloud` or `self-hosted`
choice for the desktop build and packaged E2E jobs; the self-hosted choice maps
only to `[self-hosted, Windows, X64, desktop-material-windows-local]`. Pull
requests, pushes, and reusable calls cannot select that local pool. The Windows
test/package jobs in `Build Installers / Express Release`, plus both jobs in the
direct Windows Super Express workflow, use the same project-labelled
self-hosted pool and its verified dependency and tool caches.

Replaceable Windows validation uses a workflow/event/ref concurrency group with
`cancel-in-progress: true`; a newer same-event, same-ref validation may
supersede an older one without letting a manual run cancel the push event that
gates publication. Release workflows use stable non-cancelling groups, so a
later dispatch cannot strand an in-flight tag or upload. Direct Super Express
Windows packaging and publication both require
`[self-hosted, Windows, X64, desktop-material-windows-local]`; publication does
not depend on a second operating system or runner pool. The publisher requires
the current `main` tip, stages a draft, verifies the exact target and all six
non-empty Squirrel assets, then publishes a unique non-draft Release with
`make_latest=false`. It records timing from the first Actions job's `started_at`
through the completed publication step, writes and verifies those notes, and
only then reconciles Latest. A same-job failure deletes the captured release ID
and only the exact newly created tag before restoring the prior Latest. The
write-capable release token is scoped to authenticated API steps rather than
the publisher job. Its optional unique code name searches every published
`catalog-v1*` photo volume without reusing a name when release history is
unavailable.
Reusable Super Express calls are accepted only from
`Ding-Ding-Projects/desktop-material` on protected `main`.

Windows packaging is permanently unsigned in every release lane. The package
steps explicitly disable certificate auto-discovery, clear Windows signing and
Azure identity inputs, and never call a signer. After packaging, both the setup
executable and MSI must report `NotSigned`; a present or attempted signature is
a failed build, not a reason to discover or request a credential. The release
notes state that the artifacts are unsigned and may trigger Windows SmartScreen
or an unknown-publisher warning.

The release gates still fail closed on the exact commit, unique version and
tag, filtered Squirrel `RELEASES` manifest, and all six required non-empty
assets. A streaming verifier recomputes every package SHA-1 and byte size named
by `RELEASES` both before artifact upload and after artifact download. The
unsigned policy changes no integrity, source-target, or immutable-release
check.

The Express release gate also distinguishes an ineligible completion from a
failed eligible build. A `workflow_run` for a cancelled manual dispatch, a
fork, or another non-publishable source writes `proceed=false` and exits
successfully, so no installer or Release is created and the guard does not
turn an intentional no-op into a red workflow. A completed `main` push from
this repository still follows the strict CI-conclusion and sibling-lane checks
below; an unknown lane or a failed eligible lane remains a real release-gate
failure.

The fresh-install contract is checked against the repository's pinned
toolchain: the parity generator and generated YAML must declare the same 206
desktop features, and the TypeScript configurations must remain valid for the
pinned TypeScript 5.8.2 release. The dependency compatibility test guards
those settings so a TypeScript 6-only option or a script root that cannot
resolve repository imports fails locally before consuming runner minutes.
The settings-tab migration map is intentionally consumed by persistence code
in a class method; its lint annotation documents that ownership rather than
hiding an unused property.

The composite dependency setup treats hosted CI and the remaining Linux and
Windows self-hosted Super Express runners as first-class environments. It
installs uv 0.11.26, provisions the
pinned Python 3.11 interpreter with `uv python install`, exports the resolved
interpreter to `npm_config_python`, and skips `actions/setup-python`'s hosted
tool cache whenever `runner.environment` is `self-hosted`. This matters on
Debian 13, where the hosted Python manifest does not contain the requested
3.11 x64 entry; relying on that action would fail before the actual lint or
package work starts.

Windows self-hosted setup restores the exact installed-dependency cache with an
explicit `actions/cache/restore` step and saves a verified miss with an explicit
`actions/cache/save` step before the build starts. The key includes both lock
files and manifests, the post-install/setup/tool-bootstrap actions, pinned
Yarn, local
native-vendor sources, the target architecture, and the Node/Python versions.
Older `installed-deps-v5` and `installed-deps-v4` caches may be restored only as
a warm start; their non-hit status still forces the current lock files through
the complete install. The cross-compilation install restores its package
manifests before the exact cache key is saved, and both Windows toolset scripts
participate in key invalidation. Self-hosted keys also include the runner
identity and selected Visual Studio/MSVC, ClangCL, and Windows SDK fingerprint;
the install uses `yarn --frozen-lockfile`. Hosted jobs retain the ordinary
cache post step, while self-hosted jobs avoid an unbounded post-job archive
hook. Build output, installers, Release assets, credentials, and runtime
configuration remain uncached. The focused contract test checks both the runner
selection and this restore/verify/save split.

The self-hosted Windows cold path also bootstraps release tools instead of
assuming a prepared image. An initial archive-capable checkout obtains the
bootstrap, the pinned PortableGit `2.53.0.3` archive is hash-verified, and a
second checkout creates the real Git repository before any Git or Bash work.
PortableGit, GitHub CLI `2.97.0`, and `jq` `1.7.1` keep only canonical download
bytes in versioned `RUNNER_TOOL_CACHE` paths. Those bytes are checked against
repository-pinned platform hashes on every run, then copied or extracted to
fresh job-local paths before execution. PortableGit supplies the `curl`,
`sha256sum`, and `unzip` prerequisites needed by the remaining installers. A
repeat run avoids network downloads without trusting a persistent executable;
no step mutates an unrelated system-wide installation.

The hosted Windows E2E lane does not install a second system-wide FFmpeg package.
The repository post-install step provisions Playwright's pinned FFmpeg payload,
and the dependency-cache sentinel verifies that payload before a cache is used.
Avoiding a Chocolatey install keeps the job reproducible and prevents a stale
system package lock from blocking the entire E2E job.

## Python 3.13 UI test process isolation

The Linux TUI matrix keeps Python 3.10 and 3.12 on the ordinary full-suite
command. Python 3.13 uses `tui/tools/run-tests-isolated.py`: it discovers every
test file, runs all non-UI files together, and launches each `tests/ui` file in
its own interpreter. This is a test-process boundary only; no product feature
or test assertion is disabled, and future UI files are included automatically.

The failure mode is a Python 3.13 native-process segfault after several
app-heavy Textual files share one interpreter. The fatal trace can appear in a
pure-Python stylesheet update while `tree_sitter_json._binding` is loaded, so
retrying the same monolithic command is not a useful diagnosis. The safe
recovery is to run the affected UI file in a fresh process and preserve the
full result set. The runner uses the current locked interpreter and
repository-owned paths only; it does not evaluate test paths from the network
or accept shell fragments, so the isolation adds no remote execution surface.
The committed unit contract verifies that the runner discovers all test files,
keeps the UI/non-UI sets disjoint, and includes representative root and layout
tests. Local WSL verification passed 574 non-UI tests and 99 UI tests with the
boundary; the remote Python 3.13 result remains the release gate.

The self-hosted Linux Super Express lanes also bootstrap the pinned GitHub CLI
when the runner image does not provide `gh`. The bootstrap reuses an existing
CLI or downloads the canonical Linux archive into `RUNNER_TEMP`, verifies its
published SHA-256 checksum, and adds only that temporary bin directory to
`GITHUB_PATH`.
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

The remaining nested and release installs are covered too:

- `.github/actions/setup-ci-environment/action.yml` runs its bounded root
  install with `yarn --frozen-lockfile`. It snapshots the root and app manifests
  first, then runs `script/verify-frozen-manifests.mjs` before the intentional
  cross-compilation package install. The verifier fails closed when any of the
  four live files changed, disappeared, or cannot be read.
- `script/post-install.ts` installs `app/` with the vendored Yarn using
  `install --force --frozen-lockfile`, so the nested install cannot rewrite
  `app/yarn.lock` while rebuilding native dependencies.
- `.github/workflows/build-installers.yml` runs
  `yarn install --frozen-lockfile --production=false` for the
  desktop-trampoline tests in the release lane.

On self-hosted Windows arm64 Super Express jobs, the setup action also
discovers Visual Studio with `vswhere.exe`, reads
`Microsoft.VCToolsVersion.default.txt`, and installs
the `Microsoft.VisualStudio.Component.VC.Tools.ARM64` and
`Microsoft.VisualStudio.Component.VC.Tools.x86.x64` components when the exact
default MSVC version lacks `VC\Tools\MSVC\<version>\bin\Hostx64\arm64\cl.exe`.
The arm64 helper runs before ClangCL, waits up to 120 five-second checks for the
compiler after a quiet installer return, and exports the selected instance in
`npm_config_msvs_version` so the later ClangCL check cannot silently choose a
different installation. The action handles a runner where the MSVC directory
is absent, verifies the compiler after installation, and fails before
production build if setup did not complete. The hosted installer smoke test
starts `Setup.exe` without PowerShell's descendant-inclusive `-Wait`, waits at
most 300 seconds for that installer process, and terminates its process tree if
the bound expires. It records pre-existing `GitHubDesktop` process IDs and the
installer session, then repeats a scoped cleanup while polling for the exact
package version's newly written executable. This prevents a Squirrel-launched
app from holding the step open, does not kill an unrelated process that
predated the test, and prevents a stale installation from being accepted.

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

Release and publication work retains non-cancelling run or ref groups. Windows
validation is deliberately replaceable:

| Workflow family                              | Group                   | `cancel-in-progress` |
| --------------------------------------------- | ----------------------- | -------------------- |
| Windows push/pull-request/reusable validation  | Per workflow and ref    | Yes                  |
| Windows protected-main manual validation       | Per workflow and ref    | Yes                  |
| Linux CI                                       | Per run and attempt     | No                   |
| Tested Express Release                        | Per run and attempt     | No                   |
| Pages publication                             | Per run and attempt     | No                   |
| Super Express emergency release               | Per ref                 | No                   |

A newer Windows commit cancels stale validation on the same ref but cannot
cancel a release. The registered Windows pool is available only to an explicit
protected-main manual choice or to the Windows release jobs enumerated in the
hand-written self-hosted inventory. The workflow safety test checks the exact
labels, cloud fallback, protected-ref gate, direct build/publisher placement,
and the non-cancelling release contracts.

## Security considerations

- The provenance check defends against the realistic lock-file attack: an entry
  quietly repointed at an attacker-controlled host, or stripped of its
  `integrity` hash so any tarball is accepted. It is a text check over files
  already in the commit, so it cannot be influenced by the network at run time.
- `--frozen-lockfile` closes the window where a compromised or merely careless
  manifest edit causes CI to resolve a version nobody reviewed.
- CI jobs run on hosted Linux or Windows runners for pushes, pull requests, and
  workflow calls. A protected-main manual Windows dispatch may explicitly use
  only the registered project-labelled pool for desktop build and packaged
  E2E; untrusted events cannot select it. Direct Windows release jobs use that
  same fixed pool and have no hosted fallback.
- The Linux TUI job installs the repository's pinned Node.js version before
  parity generation. The Windows TUI job enables repository-local Git long
  paths before Git-backed history tests, because the profile fixture can exceed
  the Windows default path limit. The TUI's app-owned profile-history
  repository enables the same setting locally because it cannot inherit the
  checkout repository's configuration. These are deterministic job setup steps
  on the selected hosted runner, not a fallback to another execution pool.
- The `supply-chain` job requests only `contents: read` and installs nothing,
  so a malicious postinstall script has no opportunity to run in it.
- Dependabot pull requests are proposals, not deployments: nothing in this
  repository publishes a Release from a pull request. `build-installers.yml`
  requires a `push` event on `main` from this repository.
- Advisory text and lock-file paths are the only data written to the job
  summary. No token or secret is echoed, and the permanent unsigned policy
  supplies no signing credential to print.

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

**A Windows CI validation says "Canceled".** Check whether a newer run on the
same ref replaced it. The cancelled run has no verdict and creates no release;
use the replacement's exact SHA rather than treating cancellation as success.

**A Super Express run says "Canceled".** Release workflows do not cancel one
another. Inspect a manual cancellation, runner loss, or provider interruption,
then rerun the exact commit without reusing its immutable tag.

**The Windows TUI job reports `Filename too long` while writing profile
history.** Both the checkout and the app-owned profile-history repository need
`core.longpaths`. Confirm the workflow's repository-local setting runs
immediately after checkout and that `GitProfileHistory` configures its isolated
repository before it stages files, then rerun the exact hosted CI commit.

**A Super Express Windows arm64 setup reports a missing MSVC toolset.** The
self-hosted setup discovers the installed Visual Studio instance, installs its
arm64 C++ components when absent, and verifies `Hostx64\arm64\cl.exe` before
`node-gyp` runs. If installation cannot complete, the job reports that setup
failure and skips the production build instead of emitting misleading missing
module errors from a build guarded by `always()`.

**A Super Express Windows x64 job stalls in `desktop-trampoline` native
tests.** Check the setup log for `MSB8020` naming `ClangCL`. The shared
self-hosted setup now
selects and exports a complete architecture-specific ClangCL instance before
the test; a failure to install it is a setup failure, not a test timeout to
ignore.

**A self-hosted Windows release job cannot find Git Bash, GitHub CLI, or
`jq`.** The job should enter the cold-bootstrap path. PortableGit, GitHub CLI,
and `jq` are downloaded only from their canonical release locations, verified
against pinned or published SHA-256 values, and stored below
`RUNNER_TOOL_CACHE`. A missing checksum, mismatch, extraction failure, or absent
executable stops the job at setup instead of allowing a later release command
to fail opaquely.

**A packaged setup executable or MSI reports a signature.** Windows release
jobs require `Get-AuthenticodeSignature` to return `NotSigned` for both files.
Any other status fails the lane. Do not add credentials or restore signing;
inspect which packaging input or tool attempted to sign the artifact.

**A cancelled Windows or release run keeps working.** Recovery steps
intentionally use `always()` so a genuine test failure can still leave a
diagnostic installer, but every heavy recovery, packaging, artifact-upload, and
release-publisher condition also checks `!cancelled()`. A newer Windows
validation may stop stale validation work; a newer release dispatch queues
instead of cancelling publication.

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
- A new Super Express run is still required to verify the registered
  self-hosted runner's own Visual Studio instance, permanent unsigned-package
  path, Windows-hosted publisher, and draft-first direct Windows release lane.

Current runner-selection and direct-release verification is also pending. The
local contract proves that untrusted and automatic CI stays hosted, only a
protected-main manual dispatch can select the exact Windows labels for ordinary
CI, direct Windows build and publication use the fixed project-labelled pool,
replaceable validation cancels by workflow/event/ref, and release publication
never cancels. Run
`31141543370` reached the old non-fatal submodule step but failed because Windows
PowerShell 5.1 cannot parse Bash `|| true`; the current step-level
`continue-on-error` contract removes that wrong-shell fallback and contains a
real submodule failure without hiding its outcome. The
Windows unit workflow must leave worker memory to `script/test.mjs`, and the
named installer step must
contain exactly one bounded `WaitForExit(300000)`, timeout tree cleanup, and
repeated same-session/pre-existing-PID-scoped application cleanup. No remote
green result is claimed for that working-tree repair yet.

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
