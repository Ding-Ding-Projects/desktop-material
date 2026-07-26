# Peer-closed stream writes

A write that finishes after the thing on the other end already went away is a
routine event, not a crash. This document describes how Desktop Material
contains that class of failure everywhere it can occur, and why the containment
is deliberately narrow.

## The failure

Node reports a failed stream write **twice**: once through the write's
completion callback, and once as an `'error'` event on the stream itself. A
stream with no `'error'` listener at that moment turns the event into an
uncaught exception, which the app treats as fatal:

```text
Error: write EOF
    at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87:19)
```

`write EOF` (`code: 'EOF'`, `errno: -4095`, `syscall: 'write'`) is what a
Windows named pipe produces; sockets produce `EPIPE`, `ECONNRESET`, or
`ECONNABORTED` instead.

The reported crash came from the Cheap LFS release upload. That upload streams
the asset into `gh api --input -`, and a multi-megabyte write to the child's
stdin pipe can still be in flight when `gh` exits — a token expiring mid-upload
and forcing a re-authorization is the everyday way that happens. The write
helper attached a per-write `once('error')` listener and its own completion
callback removed it, so the stream was listener-less by the time Node emitted
the event a tick later.

## Behavior

Cheap LFS / release upload, `gh` transport
: One permanent `'error'` listener on `child.stdin`, installed with the child.
  Both stdin helpers check the stream is still writable before writing, and
  route a synchronous throw into the existing retryable `cli-failed` path.

Cheap LFS / release upload, Electron transport
: `request.write` and `request.end` are wrapped, so a Chromium-side teardown
  becomes a `network` failure instead of escaping the read stream's `data`
  handler. The read stream, request, and response each keep their own
  `'error'` listener.

Cheap LFS registry transports
: The bundled ORAS process and the Docker credential helper get permanent
  guards on their stdin pipes, replacing a `once('error')` that a repeated
  report could outlive.

Trampoline server
: Every accepted socket gets its `'error'` listener before its first read, and
  the split-message stream gets one of its own (`pipe` does not forward
  errors). All replies go through one helper that skips the write when the
  client has already gone.

Agent server
: Responses are written through one guarded helper; requests, responses, and
  raw connections each get an `'error'` listener; `clientError` is owned
  explicitly; and the server keeps a permanent `'error'` listener after it
  starts listening.

Git hooks proxy
: The loopback proxy-process server gets an `'error'` listener, which it
  previously lacked entirely.

Process backstop
: The main-process `uncaughtException`/`unhandledRejection` handlers, the
  `uncaught-exception` IPC handler, and the renderer's `uncaughtException`
  handler contain a peer-closed write instead of showing the
  unrecoverable-error dialog.

The always-reply guarantee is unchanged. A trampoline client that is still
connected always receives its reply and its socket close; the guard only
declines to write to a client that has already disconnected, where there is
nothing left to wedge.

There is no OAuth loopback HTTP listener in this app — sign-in and
re-authorization use the `x-github-desktop-auth` custom protocol deep link, not
a local redirect server. The local HTTP responder that a browser can disconnect
from is the agent server, which is guarded above.

## Configuration

None. The guards are always on and have no user-facing settings.

## Failure modes

- **The transfer still fails.** Containment governs the *event*, never the
  operation. The upload fails through `cli-failed`/`network`, the credential
  request fails through Git's own error path, and the HTTP request simply has
  no reader. Nothing is silently reported as success.
- **Unknown exceptions stay fatal.** The classifier matches only errors
  carrying the shape of a peer-closed stream write. An error it has no positive
  evidence about — a `TypeError`, a `connect ECONNREFUSED`, a
  `listen EADDRINUSE`, prose that merely mentions `write EOF` — still reaches
  the crash dialog exactly as before.
- **The user is told.** A contained failure is logged with its code, reported
  as a non-fatal exception, and surfaced as a non-blocking in-app notice. The
  notice text is a fixed string, never taken from the error, so an arbitrary
  failure can never copy a credential into the UI.

## Security considerations

- Log lines name the error code and the subsystem, never the payload. A
  trampoline reply carries a credential and is never logged.
- The main→renderer `contained-background-failure` IPC message carries no
  detail at all; the diagnostics stay in the log.
- Containment never creates UI and never shows a window, so it cannot be used
  to steal focus.

## Verification

`app/test/unit/peer-closed-stream-error-test.ts`
: The classifier boundary — every peer-closed code and message form is
  recognized, and unknown errors, non-I/O syscalls, and prose that merely
  mentions a code all stay fatal.

`app/test/unit/trampoline-peer-close-test.ts`
: A real socket pair whose reader destroys the connection before the server
  replies, plus a live server whose client vanishes while a handler is still
  resolving. Asserts the reply is skipped, nothing is thrown, the credential
  never reaches a log line, and the next client still gets its reply.

`app/test/unit/main-process/github-release-transfer-peer-close-test.ts`
: A stdin fixture that reproduces Node's double report in the real order —
  callback first, `'error'` event a tick later. Asserts a listener is attached
  when the event arrives (this test fails against the pre-fix code) and that
  the upload fails through `cli-failed`. Also covers an Electron `request.write`
  that throws after the server FIN.

`app/test/unit/agent-server-peer-close-test.ts`
: A client that disconnects while a command is still running, and a malformed
  request whose sender leaves before the `400`. Asserts the server keeps
  serving afterwards.
