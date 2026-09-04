# Unlock ladder / 解鎖梯

The lockout ladder is a wait-recovery surface. It gives a locked-out person a
bounded activity that may clear the current waiting state, while leaving the
credential and the lockout escalation untouched.

## Rungs

The normal order is:

1. a four-choice dim-sum question;
2. ten single- or double-digit sums after five wrong dish answers;
3. a timed whack-a-mole round after one wrong sum; and
4. the original clock after a lost mole round.

School mode begins at the sums rung. The hidden first rung is not named or
rendered while School mode is active.

The ladder has a maximum of three successful wait skips in a rolling hour. A
successful answer clears `WAITING` only and returns the user to ordinary
credential entry. It does not create a session, verify a credential, mint a
cookie, or refund an attempt. The original lockout deadline and escalation
level remain recorded.

## Main-process boundary

`app/src/main-process/unlock-ladder.ts` owns lockout state, answer material,
challenge expiry and nonce consumption. The parent authentication failure path
starts the state in the main process; there is deliberately no renderer IPC
route for inventing attempts, deadlines, or escalation. Mole hits are recorded
through a main-process receipt-time handler, so a client cannot submit forged
timestamps. Each challenge has an opaque random
nonce and a two-minute lifetime. `submit` removes the challenge from the
server-side map before checking the nonce, lockout id, expiry, or answer. A
replayed or cross-lockout submission therefore cannot be used to probe state.

The renderer receives the challenge prompt but never receives a server-side
answer key. Dim-sum correctness is compared against the private main-process
answer. Mole submissions must arrive after the round's own duration, may count
each mole only once, and must use hits recorded inside each mole's visible
window. The main process remains the source of truth for all of those times.

The typed IPC contract is declared in `app/src/lib/ipc-shared.ts`, proxied by
`app/src/ui/main-process-proxy.ts`, and registered by
`app/src/main-process/unlock-ladder-ipc.ts`. The owning application startup
must call `registerUnlockLadderIpc()` alongside the other main-process
registrations before exposing the panel.

`app/src/main-process/unlock-ladder-allowance-store.ts` persists only the
successful wait-skip timestamps in
`<userData>/unlock-ladder/allowance.json`. The versioned file is bounded to
4 KiB and 64 records, rejects malformed values, prunes entries outside the
rolling hour, and atomically publishes a unique temporary file through the
shared Windows rename-retry boundary. Writes are serialized, so simultaneous
lockouts cannot both spend the final slot. A corrupt or unreadable file fails
closed by leaving the original wait in place; it never resets the allowance.

## Renderer surface

`app/src/ui/unlock-ladder/unlock-ladder.tsx` is a non-modal, keyboard-first
panel. It uses the repository's `RadioGroup`, `TextBox`, and MD3 text-button
primitives rather than rendering an ad-hoc HTML form. A countdown is always
readable as seconds, the status is announced through a polite live region,
focusable controls have visible focus, and the stylesheet disables motion under
`prefers-reduced-motion`.

The real owning surface is `Md3LockUnlockPrompt`, the anchored password/OTP
prompt opened when a locked tab, group, or appearance value is activated. After
the prompt's existing credential verifier records a throttled retry wait, it
starts a main-process ladder record for that exact lock and mounts this panel in
the same prompt. The ordinary credential field returns after a correct rung;
the panel is never reachable as a generic destination.

The prompt clears only the retry deadline through `clearMd3LockWait`. The
consecutive-failure count remains in the lock credential ledger, so a ladder
win does not refund an attempt or erase escalation. The prompt still owns the
credential verification and its success callback; the ladder's result is never
treated as an unlock, session, or authentication result.

The component has no password field and no success callback that can establish
identity. Its parent must keep the credential screen mounted or return focus to
that screen after a successful wait clear.

## Localization and tone

`app/src/ui/unlock-ladder/unlock-ladder-localization.ts` contains English,
playful Hong Kong Cantonese, and bilingual copy. English and Cantonese funny
levels are independent and only change the framing voice. The waiting fact,
credential requirement, attempt count, timing rules, and result semantics stay
explicit at every level.

## Failure and recovery

- An expired, replayed, cross-lockout, malformed, duplicate-hit, invalid-hit,
  or too-early submission is rejected without authenticating or changing the
  credential state.
- A wrong dish increments only the dish-rung count; the fifth wrong dish moves
  the next challenge to sums.
- A wrong sum moves the next challenge to moles; a lost mole round moves the
  next state to the original clock.
- Exhausting the rolling-hour allowance leaves the original clock available and
  does not shorten the wait.
- Restarting the application reloads the same rolling-hour allowance. Advancing
  the system clock past the window prunes the expired entries on the next read.

The feature is intentionally local to the application. It does not send
challenge answers to a network service, persist credentials or authentication
state, or expose private answer material in exports, logs, or UI state. The
durable file contains timestamps only.

## Evidence boundary

Eight focused model/service tests cover nonce single-use and expiry, each rung
transition, School mode start, rolling-hour limits, restart persistence,
serialized concurrent spending, malformed-file refusal,
no-authentication/no-refund invariants, and clearing only the retry deadline.
Prompt integration coverage must keep the credential field as the only
authentication path and verify that the ladder is mounted only while this real
prompt is waiting. Built-artifact and visual interaction evidence remain
separate from these source-level checks.

Suggested articles: [School mode](school-mode.md),
[Surface locks](surface-locks.md), and
[Destructive-action super confirmation](destructive-action-gate.md).
