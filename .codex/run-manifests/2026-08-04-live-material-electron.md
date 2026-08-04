# Live Material Electron surface — 2026-08-04

## Scope

- Mode: `publish`
- Milestone: make the tracked Material design reference proveable through the
  production Windows Electron renderer
- Repository: `Ding-Ding-Projects/desktop-material`
- Branch: `main`
- Starting commit: `ab8c26d7535c9861f81b761e73798d1363bd78e1`
- Initial repository state: clean after the first milestone push
- Signing contract: Squirrel code signing remains intentionally skipped by the
  current private-builder contract; this run does not change signing policy

## Verification plan

1. Run the exact production build through the installed cheap Lowlevel route,
   without downloading dependencies.
2. Create one disposable Git fixture and isolated app-data root beneath a
   task-owned Temp directory.
3. Launch the built Electron application directly on one uniquely named hidden
   desktop, resolve its HWND dynamically, and capture the rendered surface
   without changing the user's visible desktop.
4. Exercise only safe startup/navigation checks available without credentials;
   close the exact window and remove only the owned Temp paths.
5. Run focused tests and package/runtime checks, update the factual handoff,
   commit intended evidence, push `main`, and verify the remote SHA and CI.

## Headless route

- Required route: installed `lowlevel-computer-use-cheap` executable from the
  canonical Lowlevel checkout, targeting the local service endpoint/host
- Desktop name: `DesktopMaterialLive-20260804-ab8c`
- Fixture root: `%TEMP%\desktop-material-live-20260804-ab8c`
- User-data root: `%TEMP%\desktop-material-live-20260804-ab8c\user-data`
- Capture root: `%TEMP%\desktop-material-live-20260804-ab8c\captures`
- Cleanup: only the owned run root and the exact launch PID/HWND after close

## Documentation allowlist

- This manifest
- `HANDOFF.md`
- affected production source/test files
- no generated build output, credentials, or private machine paths

## Verification state

The focused UI contracts passed 47/47 after the repository-settings cleanup,
with no React unmounted-update warning. The exact cheap-route production build
command exited 0 in 291.45 seconds and emitted the renderer, main, internal
browser, quick-action, CLI, shell-extension, license, and stylesheet outputs;
it reported only existing Sass and Node deprecation warnings. Packaging was
intentionally skipped for this renderer/runtime proof.

The built `out/main.js` was launched with the repository's Electron runtime on
the named hidden desktop. Dynamic window enumeration found the `Desktop
Material` main window at 976x668. Captures showed the first-run setup, Git
identity setup, welcome surface, and the live repository workspace after a
disposable Git fixture was added. The exact launch PID was closed, the hidden
desktop disappeared, and the task-owned Temp root was removed.

Remote run [30928494987](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30928494987)
is still in progress. Its Lint job currently fails on pre-existing formatting
findings in four files, and TUI jobs have also failed; Windows x64/arm64 and
CodeQL remain in progress. The changed renderer file passes its targeted ESLint
check. The TUI scope remains closed for this task.

Follow-up run [30929478484](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30929478484)
for commit `0969cbbb76ed18fe4f6d79d33ad95b6ae96a38d9` has the same Lint/TUI
failures. Its Windows arm64 job built and uploaded the artifact, then failed
the script-test step because the committed docs hub catalog/index are stale
relative to already-merged TUI articles. The generator plus `yarn test:script`
passes locally (214 tests, 213 passed, 1 optional skip), but its output would
modify the closed TUI documentation surface and was not committed. Windows
x64 and E2E remain in progress at this update.

Commit `a89900dd419e4dd78031516dea10c4edb1df9b38` formats the two installer
workflow `TUI_CONSTRAINTS_NAME` environment assignments that the remote Lint
job rejected. The change is formatting-only; it does not alter installer
behavior or the intentional skip-signing contract. File-scoped Prettier and
the Git whitespace check pass. It was pushed to `main`, where it is covered by
CI run [30931585531](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931585531),
Cheap LFS run [30931582576](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931582576),
and Code scanning run [30931582659](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30931582659).
Cheap LFS is verified green; the CI and Code scanning runs are queued or still
running at this checkpoint. The remaining TUI catalog formatting is outside
the closed desktop scope.

Commit `a9c69adfde9bb97cd03e48a99783ff6e6a5a87f1` formats the desktop
`app/test/unit/site-accessibility-test.ts` only. Its focused accessibility
contract suite passes 11/11, and file-scoped Prettier passes. The commit was
pushed to `main` and is covered by CI run
[30932145369](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30932145369)
and Cheap LFS run
[30932145377](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30932145377),
both queued at this checkpoint. The only known remaining formatter finding is
the closed-scope TUI catalog.
