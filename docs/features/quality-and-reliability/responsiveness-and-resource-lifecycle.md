# Responsiveness and resource lifecycle

Desktop Material bounds repeated background work and releases resources at the
same lifecycle boundary that created them. The behavior is automatic; it adds
no preference, language string, credential format, or provider API.

## Behavior

- A background fetch first validates the local `refs/remotes/<remote>/HEAD`
  symbolic ref and verifies that its local target still exists. Desktop then
  reuses it instead of running another online `git remote set-head -a`.
  Missing, dangling, empty, malformed, or cross-remote values trigger exactly
  one authenticated discovery. A user-initiated fetch always refreshes the
  remote default. Discovery, including system proxy preparation, receives five
  seconds; process-tree termination then receives one final five-second grace
  window. The advisory refresh therefore settles within ten seconds even if
  taskkill/SIGKILL runs but the child never emits `close`. This catches a
  default-branch rename even while the old branch still exists without
  restoring the multi-minute hang. Repository clone cancellation deliberately
  keeps its stricter full-process-close barrier.
- Concurrent proxy preparation for the same exact URL shares one in-flight
  operating-system resolver promise. A caller can abandon its bounded wait
  without starting another identical resolver, and a completed or failed
  resolution leaves the map so a later operation can re-evaluate system proxy
  policy.
- Askpass and sign-in UI requests share one first-in, first-out prompt queue.
  Host-key acceptance, SSH key passphrases, SSH passwords, generic Git
  credentials, and GitHub sign-in therefore cannot replace or silently drop a
  concurrent prompt of the same type. Manager removal or eviction settles the
  affected prompt and lets the queue continue. When a contextual sheet or
  sign-in popup is deliberately replaced, the old owner is notified exactly
  once with a replacement reason. A replaced sign-in prompt settles its caller
  without clearing the global state now owned by the replacement.
- Adjacent synchronous appearance-setting calls share one mutation and persist
  only the latest normalized value. Queued `get()` reads, flushes, and history
  operations are ordering barriers, while separately awaited writes keep their
  sequential behavior and the existing owner-local Git history.
- The main-process same-origin header filter forgets a request's initial origin
  on both successful completion and network failure/cancellation. Failed
  requests cannot grow the request map for the rest of the app session.
- A sandboxed Markdown preview removes its capture-phase document listener with
  the same capture option used at registration. Unmount also cancels deferred
  scroll work and releases iframe document/frame references.

## Configuration and persistence

No migration is required. Appearance burst coalescing happens before the
existing 250-millisecond owner-local commit debounce; it does not combine
different owners or cross a queued `get()`/history barrier. Every caller in one
burst settles from the same mutation result, and the last normalized
description is the one recorded for that burst.

Remote-HEAD reuse is local, namespace-validated, target-validated, and limited
to background refreshes. Repositories with provider metadata continue to use
the provider's declared default branch. Fetch/prune turns a deleted old default
into a dangling ref, which Desktop repairs automatically. An explicit fetch
  also discovers a generic host's renamed default even when the prior branch
  still exists. Its abort signal bounds the secondary lookup to five seconds
  and its separate cleanup grace makes ten seconds the hard settlement bound.

Proxy coalescing is process-local and stores no proxy result. It keys only the
currently unresolved work by exact URL and resolver implementation; successful
and failed work is removed immediately. Authentication environment values are
still assembled independently for each Git operation.

## Failure modes and recovery

An askpass popup-dispatch failure rejects the affected prompt, normalizes the
queue tail, and allows the next request to appear. GitHub sign-in retains its
existing logged `undefined` result on dispatch failure. External removal and
stack eviction settle the affected prompt as cancelled; sign-in additionally
resets its retained store callback. Replacement also settles the old owner, but
does not reset state needed by the new sign-in popup. A failed appearance batch
rejects every caller in that batch without poisoning later store operations.
Invalid or dangling local remote-HEAD refs use the existing authenticated
discovery path and retain its bounded success/error handling. A process-tree
terminator failure is observed and logged. If termination or the child-close
event remains unresolved after the cleanup grace, Desktop stops awaiting this
advisory refresh so the completed fetch can return; the owned termination work
keeps a rejection observer for any later failure.

Electron's proxy resolver exposes no `AbortSignal`. A resolver which never
settles therefore leaves one shared in-flight entry for that exact URL until it
settles or the app restarts. This is bounded for repeated calls to the same URL,
but distinct permanently stalled URLs can each retain one entry.

Network errors remove only the exact failed request ID. The next request can
reuse an Electron request ID without inheriting a stale origin. Markdown
teardown is idempotent: pending debounce cancellation and null references are
safe even when no iframe finished loading.

## Security considerations

The remote lookup and prompt queue preserve exact account selection; no token
is added to arguments, environment, persistence, or logs. Same-origin cleanup
does not weaken redirect protection: authorization-like headers are still
removed when the current URL crosses the initial origin. Releasing a failed
entry also prevents a recycled request ID from being compared against another
request's stale origin.

Markdown remains sanitized and rendered inside its sandboxed iframe. Lifecycle
cleanup only releases listeners and references; it does not broaden link,
script, style, or content privileges.

Windows process-tree termination continues to resolve `taskkill.exe` through
the existing realpath, file-type, basename, and containment checks under the
configured `SystemRoot` (or the existing `C:\Windows` fallback). This repository
and its Node/Electron runtime expose no authoritative `GetSystemDirectoryW`
binding, so this correction does not swap that source for another environment
guess such as `WINDIR`. Authenticating the Windows installation directory
independently remains a defense-in-depth follow-up for a process whose inherited
environment and alternate filesystem tree are already attacker-controlled.

## Verification

`fetch-authenticated-git-test.ts` covers the validated background fast path,
bounded user refresh, a renamed default whose old target remains,
dangling-target and invalid-namespace fallback, exact account forwarding, an
injected never-settling terminator, and a late termination rejection after the
cleanup bound. `git/environment-test.ts` proves two concurrent preparations
invoke one resolver and that settled work is evicted. `git/clone-test.ts` proves
clone cancellation still waits for the complete injected termination barrier.
The focused Git gate passes 30/30 tests.

`popup-manager-test.ts` and `trampoline-ui-helper-test.ts` cover FIFO settlement
for every prompt family, pre-existing sign-in reuse,
duplicate/removed/evicted popup settlement, replacement reasons,
replacement-safe sign-in state, sign-in reset on ordinary removal, and recovery
after dispatch failure.
`dedicated-setting-store-test.ts` covers a 500-call burst, queued-read/history
and flush barriers, sequential writes, and failed-batch recovery.

`same-origin-filter-test.ts` fails a request, reuses its numeric ID, and proves
that same-origin authorization survives only after the stale record is
released. `sandboxed-markdown-lifecycle-test.tsx` performs 25 content reloads,
dispatches an actual scroll before and after unmount, and checks matching
listener removal, debounce cancellation, and released iframe references.

App-source candidate `aabb111d2c01f38e7535ab077048816a5ad16893` completed
the required fixed-Lowlevel-MCP production build in 1178.13 seconds. A final
visual audit rejected the first off-screen screenshot because a 780 px editor
was clipped by its 390 px anchored shell. The shell now inherits the existing
wide-editor contract while retaining the compact 390 px fallback; the rejected
image is not published.

Remote CI validated the Playwright ffmpeg cache correction on Windows x64,
packaged E2E, and arm64. The remaining x64 failure was one stale source
assertion added by a later provider integration. The runtime guard was already
centralized before side effects; the corrected test checks that shared boundary
and both delegating OpenCode wrappers. Final pushed-SHA CI, Release proof, and a
fresh unclipped visual recapture remain pending.
