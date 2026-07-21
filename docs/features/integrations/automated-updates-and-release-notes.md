# Automated update build status and release notes

Desktop Material distinguishes an available Windows update from a newer commit
that GitHub Actions is still packaging. Automated GitHub Releases also explain
which exact commits they contain instead of publishing only a generic build
message.

## Behavior

After Squirrel reports that no update is available, the renderer derives the
GitHub repository from the configured `releases/latest/download/` feed. It asks
GitHub for bounded provider data from the `build-installers.yml` workflow and
shows **New update coming soon** only when all of these checks pass:

- the feed is an HTTPS `github.com/<owner>/<repository>/releases/...` URL;
- the installed build exposes an exact 40-character `__SHA__`;
- a `workflow_run` or manual-dispatch installer run is `in_progress` on `main`;
- bounded job data proves that run's exact `Windows x64` packaging job is
  itself `in_progress` for the same run ID and head SHA;
- the run exposes a different exact `head_sha`; and
- GitHub's compare endpoint reports that build SHA as `ahead` of the installed
  SHA.

The status is in-memory remote state. It is not written to local storage. The
ordinary last-successful-check timestamp remains persisted, so restart behavior
stays compatible. English renders **New update coming soon**, playful Hong Kong
Cantonese renders **新版本就快焗好出爐**, and bilingual mode renders both in the
shared compact format.

An updater transition generation guards every asynchronous no-update probe. If
Squirrel reports a real available or downloaded release while the provider
request is still running, the real updater event wins. A subsequent manual or
four-hour periodic check uses the release feed normally and begins the existing
download flow as soon as the release is published.

## Automated release notes

`Build Installers` checks out the exact `RELEASE_TARGET_SHA` with full history,
then runs `script/generate-automated-release-notes.ts` before the single publish
action. The generator:

1. requires `HEAD` to equal the exact release SHA;
2. reads the latest published GitHub Release through a bounded authenticated
   response and resolves its tag to an exact commit;
3. requires that previous release commit to be an ancestor of the release
   target;
4. reads at most the newest 50 commit IDs and subjects from the exact
   `previous..target` range;
5. collapses control characters and whitespace, neutralizes Markdown, HTML,
   and mentions, and limits each subject to 180 characters;
6. caps the complete notes at 24,000 characters and records any omitted count;
   and
7. writes exact commit links and the visible exact range to a new temporary
   file consumed through `body_path`.

The first release has no previous tag, so it uses the exact target's reachable
history with the same limits. A mismatched checkout, tag target, ancestry,
provider response, Git object ID, or output bound stops publication.

## Workflow concurrency

Every CI invocation uses its unique GitHub run ID and attempt as its concurrency
group with `cancel-in-progress: false`. A newer push, pull request, manual run,
or installer verification can therefore become eligible to run immediately
without cancelling or queueing an older CI invocation. Source-contract tests
scan every local workflow and reject `cancel-in-progress: true`.

Installer and Pages publication retain their shared serialization groups because
they mutate shared release/deployment state. Both explicitly use
`cancel-in-progress: false`, so a newer invocation waits instead of destroying
the evidence or result of an older in-progress run. Workflows without a shared
group, including CodeQL, remain independently runnable.

## Configuration

- `DESKTOP_UPDATES_URL` can replace the complete update endpoint. Coming-soon
  detection intentionally disables itself for custom or non-GitHub hosts.
- `DESKTOP_UPDATES_REPO` selects the GitHub `owner/repository` used by the
  default release feed.
- The runtime provider contract expects the active workflow file to remain
  `.github/workflows/build-installers.yml`.
- The release-note step receives `GITHUB_TOKEN` through its environment. It is
  never accepted as a command-line value or written to the notes.

## Failure modes and security

Network, rate-limit, malformed-response, oversized-response, non-GitHub-feed,
invalid-SHA, non-main, prerequisite-only, non-running, stale, behind, and
diverged results all fail closed to the ordinary no-update state. The probe
reads at most 256 KiB per provider response and times out after ten seconds. It
never grants an update or downloads executable content; only Squirrel's
existing feed can do that.

Commit subjects and release metadata are untrusted. The generator invokes Git
without a shell, validates tag refs and object IDs, bounds subprocess output,
neutralizes active Markdown/HTML/mention syntax, and uses create-new output-file
semantics. The workflow revalidates `origin/main` and immutable tag absence
before notes generation and publishes the same `RELEASE_TARGET_SHA` as the
release target.

## Verification

Focused acceptance covers safe feed parsing, bounded Actions data, exact
job/run/SHA binding, ahead-of comparison, prerequisite-only/manual-dispatch and
malformed/stale fail-closed behavior, transient storage, the updater-event race,
all three language modes, non-cancelling independent CI push runs, workflow
wiring, exact Git range collection, subject sanitization, output limits, and
first-release handling. The app and script TypeScript
projects, targeted formatting/lint, and workflow YAML are also checked locally.
Remote Actions and release publication remain required after integration. The
fixed headless service preflight passed, but its required no-download production
build could not start because the host does not provide `yarn`; no GUI capture
is claimed for this checkpoint.
