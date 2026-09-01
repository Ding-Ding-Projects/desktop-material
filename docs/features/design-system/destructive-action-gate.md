# Destructive-action super confirmation / 破壞性操作嘅雙匙閘

Every action in Desktop Material that destroys something, or that cannot be
taken back from inside the app, is authorized through one shared gate:
`app/src/ui/md3/md3-destructive-gate.tsx`. Two keys are turned independently,
and only once both are turned does a full-range authorization slider become
usable at all. Nothing happens until that slider reaches its maximum, so no
single click, keypress or stray pointer gesture can destroy anything.

呢個閘係全部破壞性操作共用嘅：兩條匙要分開扭，兩條都扭咗，條授權桿先郁得，
再一路拉到最尾先做得。撳錯一下、掃錯一下，都刪唔到嘢。

## Behaviour

### The two shapes

| Export | Used by | What it brings |
| --- | --- | --- |
| `Md3DestructiveGate` | surfaces in the MD3 shell | scrim, anchored panel, focus trap, Escape, emergency exit, confirm button, error region |
| `Md3DestructiveGateBody` | surfaces already inside the app's `Dialog` | the two keys, the slider, the progress and completion treatments, the status region |

The contract prefers an anchored dialog beside the destructive control, and
`Md3DestructiveGate` is that: `md3GateAnchorPosition` places the panel directly
below the control that opened it, flips it above when there is no room below,
clamps it horizontally inside the viewport, and returns `null` — falling back to
a centred modal — when the panel could only fit by covering the control itself
or when the viewport is too small to hold it.

The authorization slider uses a 40px semantic block target for pointer and
keyboard input while retaining a centered 16px visual track. This is the
documented horizontal-control exception to the usual minimum target geometry:
the cross-axis is deliberately larger than the painted track so the control is
easy to operate without changing the compact visual anatomy. The target stays
40px at the supported 100%, 125%, 150%, and 200% display scales and in narrow
layouts.

Hosts that already sit inside the application's `Dialog` render the body only.
Nesting a modal inside a dialog would give a keyboard user two competing focus
traps, which is worse than either alone, so those hosts keep their own chrome,
rename their cancel button to **Emergency exit**, and hold their affirmative
button disabled until the body reports the gate authorized.

### The state machine

`md3GateState(targetKey, effectKey, progress)` is pure and exported:

- `locked` — one or both keys are off. Progress is ignored entirely in this
  state, which is what makes turning a key back off *retract* an authorization
  rather than leaving a slider parked at 100 for a single click to re-arm.
- `armed` — both keys turned, slider at zero.
- `moving` — the slider is between the ends. A light sweep runs across the
  filled portion of the progress bar.
- `authorized` — the slider reached `Md3GateAuthorizationMaximum` (100). The bar
  changes colour, flashes once and grows a check, and the confirm button becomes
  available.

Both treatments are decoration over a value that is also stated in words
directly beneath them, so nothing is lost when `prefers-reduced-motion: reduce`
turns them off.

### Cancelling and focus

The emergency exit, the Escape key and a click on the scrim all dismiss the
overlay. Focus moves to the emergency exit when the gate opens — so a gate that
appeared under a stray keypress cannot destroy anything on the next one — and
returns on close to `returnFocusTo`, then the anchor, then whatever was focused
when the gate opened.

While `busy` is set the confirmed action is actually running. The gate freezes
and says so rather than offering a cancel that would silently do nothing: an
irreversible operation already in flight cannot be called back.

### Copy

The framing sentence is the only banded copy
(`md3.destructiveGate.lead.plain` / `.light` / `.playful` / `.maximum`, selected
per language by that language's funny level). Everything a user acts on is
supplied by the calling surface and rendered verbatim at every level and in
every language mode: what is about to be destroyed, what cannot be undone, the
exact target, and the exact effect. A playful gate is fine; a gate that leaves
the user unsure what the button does is not.

All three language modes apply — English, Hong Kong Cantonese, and bilingual —
through the ordinary `t()` path, and the gate's own keys live under
`md3.destructiveGate.*` in both catalogs.

## Configuration

The gate has no settings of its own. It cannot be turned off, and there is no
"do not ask me again" for it — the per-dialog "Do not show this message again"
checkboxes that already exist (discarding changes, force pushing) control
whether the *dialog* appears, not whether the gate inside it can be skipped.

## The gated actions

`app/src/ui/md3/md3-destructive-actions.ts` holds a hand-written registry of
every action that must be gated. This is deliberate: a conformance test shaped
"every gate present is well-formed" passes cleanly on an application that gates
nothing, because it only ever iterates what it finds.

| Action | Surface | Host |
| --- | --- | --- |
| `discard-changes` | `discard-changes-dialog.tsx` | dialog |
| `discard-selection` | `discard-selection-dialog.tsx` | dialog |
| `delete-branch` | `delete-branch-dialog.tsx` | dialog |
| `delete-remote-branch` | `delete-remote-branch-dialog.tsx` | dialog |
| `delete-tag` | `delete-tag-dialog.tsx` | dialog |
| `remove-repository` | `confirm-remove-repository.tsx` | dialog |
| `reset-to-commit` | `warning-before-reset.tsx` | dialog |
| `force-push` | `confirm-force-push.tsx` | dialog |
| `repository-transfer` | `repository-transfer-dialog.tsx` | dialog |
| `self-hosted-runner-removal` | `self-hosted-runner-removal-dialog.tsx` | dialog |
| `inbox-bulk-delete` | `md3-inbox-view.tsx` | overlay |

Adding a destructive action to the application means adding it to that registry
in the same change.

## Failure modes

**A disabled button does not gate the keyboard.** A `Dialog` marked
`destructive` makes the affirmative control a plain button and the *cancel*
button the form's submit button, so Enter pressed anywhere in the form fires the
affirmative path regardless of whether that button is disabled. Every gated
dialog therefore returns early from its own submit handler when the gate has not
reported itself authorized, and a test asserts that guard exists in each one.
Disabling the button alone gates the pointer and leaves the keyboard wide open,
which is the worse half to lose.

**A changed consequence must re-arm the gate.** When what the action will do
changes while the gate is on screen — the Recycle Bin step failing and turning a
removal into a permanent delete, or the user opting a remote branch in — the
host gives the gate a new React `key` so it remounts. Otherwise it keeps the
authorization the user gave for a different outcome, which is precisely what two
keys and a slider exist to prevent. The remounted body's mount effect reports
`false`, which re-disables the host's affirmative button automatically.

**A fieldset's disabled state is not the input's.** The gate sets `disabled` on
the fieldset *and* on each key input. A fieldset genuinely disables its
descendants for interaction, but the `disabled` IDL property on an input
reflects only its own attribute, so anything reading that property sees an
enabled control on a frozen gate unless it is set in both places.

**Anchoring can fail honestly.** When the panel cannot be placed without
covering the control that opened it, `md3GateAnchorPosition` returns `null` and
the gate renders as a centred modal instead. An anchored surface painted over
its own trigger is the defect this avoids; a modal is an honest presentation
rather than a broken anchored one.

## Security considerations

The gate handles no credentials and stores nothing. It reads the persisted
language mode and funny levels once per instance and writes nothing back. It
performs no network access, loads no remote font or image, and records no
telemetry.

Because it is a user-experience gate and not a security boundary, it is never
described as protecting anything. It protects a user from their own pointer, and
it says so plainly rather than implying that anyone else is being kept out.

## Accessibility

- The overlay is `role="alertdialog"` with `aria-modal`, labelled by its title
  and described by the summary (and the error, when there is one).
- The slider's visible label is its accessible name and stays constant, so a
  screen reader is not read a new name on every step; the changing percentage
  reaches assistive technology through `aria-valuetext` and sighted users
  through the adjacent `<output>`.
- The progress bar is `aria-hidden`: the same value is already announced by the
  slider and restated in words by the status region, so announcing it a third
  time would be noise.
- Tab is trapped inside the panel and cycles; Escape dismisses.
- Each key row is a full-height label wrapping its checkbox, so the target is
  the whole row rather than an 18px box.
- Every animation is disabled under `prefers-reduced-motion: reduce`, and the
  gate remains fully readable and operable without any of them.
- Below 420px the panel drops its fixed width, the footer's buttons stack and
  the slider's value moves under the track, so neither the longest bilingual
  emergency-exit label nor the confirm label is clipped.

## Verification

`app/test/unit/md3-destructive-gate-test.tsx` covers:

- the registry agreeing with a hand-written required set, so deleting an entry
  goes red;
- every registered action's module actually rendering the shared gate with its
  own `actionId`, the matching shape for its host, an emergency exit, a gated
  affirmative button and a guarded submit handler;
- the state machine staying locked while either key is off, whatever the slider
  reports;
- anchoring below, flipping above, clamping horizontally, and refusing to place
  a panel that would cover its own control;
- the body keeping the slider unusable until both keys are turned, only
  reporting authorization at the maximum, retracting it when a key is turned
  back off, and freezing when disabled;
- the overlay refusing to confirm without a full gate, dismissing from the
  emergency exit, Escape and the scrim, focusing the emergency exit on open,
  returning focus to its anchor on close, refusing both dismissal and
  confirmation while busy, and stating a failure verbatim in an alert;
- every gate key existing in both catalogs with matching interpolation
  placeholders and no English text sitting in a Cantonese slot, and all four
  funny-level bands being distinct.

`app/test/unit/ui/confirm-remove-repository-test.tsx` additionally proves the
behaviour end to end on a real dialog: an unauthorized submission removes
nothing, the gate has to be operated before the removal runs, and the fallback
that deletes permanently requires its own fresh authorization.

Each guard-shaped assertion in these files was verified by breaking the thing it
guards and watching it go red before the change was restored.
