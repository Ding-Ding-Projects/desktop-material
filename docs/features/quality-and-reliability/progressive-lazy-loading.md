# Progressive asynchronous loading

Desktop Material paints and reveals its usable application shell before
optional startup work finishes. Expensive repository sections are evaluated
only when selected, with loading and failure state contained inside that
section.

## Startup boundary

`AppStore.loadInitialState()` remains the correctness boundary for accounts,
repositories, persisted preferences, and the applied theme. It does not wait
for work which can safely finish after first interaction:

- installed-editor discovery;
- interrupted clone-queue recovery;
- account refresh and permission audit; and
- automatic-clone monitoring.

The persisted external-editor choice is displayed as cached data while its
availability is checked. This is safe because the launch path resolves the
actual executable again before opening a file.

Each deferred task has its own rejection boundary. A failure is logged, sent to
non-fatal diagnostics, and placed in the notification centre without opening a
modal or cancelling sibling startup tasks.

The renderer sends its ready signal from `componentDidMount`, the first
committed shell. It does not wait for an animation frame because hidden Electron
windows can throttle that callback. There is no artificial timeout: startup
state continues behind a small polite status chip while the rest of the shell
remains available.

## Lazy repository sections

Changes and History stay in the initial renderer path because they are the
normal landing surfaces. These inactive sections defer module evaluation until
their first activation:

- Actions;
- Releases and Packages;
- Cheap LFS;
- Issues;
- GitHub API Explorer;
- provider triage; and
- Repository tools.

The imports use named asynchronous webpack chunks and point directly at each
surface module. A production renderer build must retain those separate chunks;
the bundle artifact is a verification gate so a barrel import or eager mode
cannot silently pull the heavy surfaces back into the initial renderer path.

`LazyView` announces loading with `role="status"`, `aria-live="polite"`, and
`aria-busy="true"`. Loader rejection and exceptions thrown while rendering a
successfully loaded surface use the same local `role="alert"`, include the
original error, and retain a **Try again** button. Render exceptions are caught
by a nested boundary so they cannot escalate to the application boundary.
Retrying starts the exact loader again behind a fresh render boundary. It never
moves focus. Each accepted failure is reported once through the matching
non-blocking owner callback, when provided, so it can remain reviewable after
navigation.

## Race and lifecycle guarantees

`ProgressiveLoad` issues a monotonic token for every request. Only the newest
token can publish, so a slow earlier response cannot overwrite a later
navigation. Reset and unmount advance the generation, fencing promises that
cannot otherwise be aborted. Repository submodule and subtree inventory probes
use the same boundary, including rapid A-B-A repository navigation.

The primitive may retain a previously verified value while refreshing. Source
promise rejections are converted to a fulfilled `failed` state containing the
real `Error`; launching a load with `void` cannot create an unhandled rejection.

Focused tests cover the pre-resolution fallback, retryable loader and render
failures, focus retention, unmount fencing, both stale-completion orders,
cached refresh state, and the absence of static heavy-view imports.
