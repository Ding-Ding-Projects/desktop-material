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

## Renderer surface

`app/src/ui/unlock-ladder/unlock-ladder.tsx` is a non-modal, keyboard-first
panel. It uses the repository's `RadioGroup`, `TextBox`, and MD3 text-button
primitives rather than rendering an ad-hoc HTML form. A countdown is always
readable as seconds, the status is announced through a polite live region,
focusable controls have visible focus, and the stylesheet disables motion under
`prefers-reduced-motion`.

The current application tree has no owning credential lockout/wait surface.
Consequently the panel is deliberately not mounted and this lane does not
claim a reachable user flow. The parent lane must mount it only from that real
lockout surface; it must not add a generic destination just to make the panel
appear.

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

The feature is intentionally local to the app process. It does not send
challenge answers to a network service, persist credentials, or expose private
answer material in exports, logs, or UI state.

## Evidence boundary

This implementation lane intentionally did not run tests, lint, typecheck,
reviews, builds, packaged interaction, or captures under the ultra-speed
delivery boundary. The parent integration lane must add focused tests for nonce
single-use/expiry, each rung transition, School mode start, rolling-hour
limits, no-authentication/no-refund invariants, keyboard and reduced-motion
behaviour, then run built-artifact and visual evidence separately.

Suggested articles: [School mode](school-mode.md),
[Surface locks](surface-locks.md), and
[Destructive-action super confirmation](destructive-action-gate.md).

