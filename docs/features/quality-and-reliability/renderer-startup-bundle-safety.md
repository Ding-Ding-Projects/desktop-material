# Renderer startup bundle safety

Desktop Material's Windows renderer must mount its React root before the main
window is shown. A Node-oriented dependency that is concatenated into the
browser bundle can fail during module evaluation, leaving the window blank
before the app's normal error boundary exists.

## Behavior

The Copilot SDK is loaded as a packaged external rather than concatenated into
`renderer.js` or `internal-browser.js`. The application still loads the SDK
through Electron's existing Node-enabled renderer, while the build keeps its
Node child-process implementation out of the browser bundle. The packaging
step installs every entry in the Webpack external list into the output
dependency tree.

The build also checks both renderer bundles before packaging. A missing bundle
or the bare `__webpack_module__` binding fails the build with a direct path and
does not produce an artifact that can open to a blank window.

## Configuration

- `app/webpack.common.ts` owns the external package list. Keep the pinned
  `@github/copilot-sdk` package in that list when the renderer imports its
  runtime client.
- `script/build.ts` runs `assertRendererBundlesAreRunnable` after resources are
  copied and before packaging.
- `app/test/unit/dependency-runtime-compatibility-test.ts` protects the
  externalization contract, while `app/test/unit/build-copy-test.ts` verifies
  both sides of the bundle guard.

## Failure modes

- `ReferenceError: __webpack_module__ is not defined` means a Node-only module
  wrapper escaped into a renderer bundle. Fix the dependency boundary and let
  the build guard fail until both bundles are clean.
- A missing `resources/app/node_modules/@github/copilot-sdk` means the package
  was externalized without being included by `copyDependencies`. The artifact
  must not be shipped until the package and its declared transitive
  dependencies are present.
- A clean static bundle check is not runtime proof. Launch the exact packaged
  executable, observe the real page, and check for renderer exceptions before
  calling startup verified.

## Security considerations

The SDK remains pinned by `app/package.json` and is installed from the
repository's declared dependency graph. Externalization changes where the
existing Node client is loaded; it does not grant the renderer a new provider,
credential, or network path. The existing Electron window security boundary
is unchanged by this fix and remains a separate hardening concern.

## Verification

The pinned Yarn install completes the root and app dependencies, submodules,
script compilation, Electron runtime preparation, and Playwright ffmpeg setup.
The final integrated production build at `fe189e2f41` completed in `520.70s`,
printed `Checking renderer bundles…`, and produced `GitHubDesktop.exe` with
both renderer bundles and the packaged SDK present. Both bundles contain zero
`__webpack_module__` tokens. The focused contracts pass **15/15**. The exact
executable was launched on a hidden desktop; a CDP reload reached
`readyState=complete` with one populated `#desktop-app-container` child and no
captured runtime exceptions. A Lowlevel MCP capture at `960x660` shows the
first-run Desktop Material surface instead of a blank window. The promoted evidence frame is
[`material-blank-startup-fixed-20260806.png`](../../assets/screenshots/material-blank-startup-fixed-20260806.png)
with SHA-256 `00D8BD6FCE0EFA10107523BF92BEA54E80DDA6ED66B8E3700B21297D6CBF2A82`.

## Suggested articles

- [Progressive asynchronous loading](progressive-lazy-loading.md) — understand
  how startup work is staged after the shell can paint.
- [Root renderer resource lifecycle](root-renderer-resource-lifecycle.md) —
  keep mounted renderer resources and subscriptions disposable.
- [Supply-chain and CI hardening](supply-chain-and-ci-hardening.md) — preserve
  the dependency and release checks that protect packaged builds.
