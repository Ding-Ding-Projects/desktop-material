# Surface locks / 版面鎖

A for-fun password or one-time-password speed bump on a tab, a tab group, or any
appearance value. Off by default, opt-in per surface, and never described as
security.

一個純粹好玩嘅路障：可以喺分頁、分頁群組或者任何外觀數值上面加個密碼／一次性密碼。
預設冇開，逐個版面自己揀，永遠唔會當佢係保安。

---

## What it is, and what it deliberately is not

A lock makes a surface ask for a credential before it opens. That is all it does.

- Nothing is encrypted. The content behind a lock is stored exactly as it was
  before the lock existed.
- It does not keep out anybody else who has this computer. Deleting one folder
  removes every lock on the machine, and the app says so on the very controls
  that create and answer locks.
- It is not a security boundary and must never be presented as one. A unit test
  fails the build if any user-facing string under `md3.locks.*` describes a lock
  as securing, protecting or encrypting anything.

The design goal is the same as School mode's: a self-imposed speed bump the user
chose, with an obvious and self-service way out.

## Behaviour

### Where a lock is created

From the surface's own context menu, beside **Edit tab appearance…**. The menu
items are built by `buildMd3LockMenuItems` in
`app/src/ui/md3/md3-lock-menu-items.ts` and spliced into the menu the surface
already has, so they carry the same filter field and keyboard operation as every
other entry in that menu. Each item shows the shortcut that actually works in
that context (<kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>L</kbd> to lock,
<kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>K</kbd> for the manager), and the keyboard
route to the menu itself is the surface's existing one.

Selecting **Lock this tab…** opens `Md3LockSetupDialog`: an anchored, non-modal
panel beside the control that asked for it, never a detached dialog.

### One lock, one credential

Locks do not inherit and do not share.

- Locking a group does not relock its members under the group's credential.
- A locked value inside a locked tab is two locks with two answers.
- Locking the same target twice creates two independent locks with two
  independent credentials; the id is minted rather than derived from the target,
  so the second never silently overwrites the first.
- There is no master credential. A user who wants one credential everywhere gets
  there by deliberately reusing it, never because the app assumed it.

### Factors

| Factor | Answered by | Stored where |
| --- | --- | --- |
| Password | A password the user chooses for that one lock | A per-lock random salt and a SHA-256 digest, in the operating-system credential vault |
| One-time password | The current code from the app's own authenticator | Nothing extra — the lock records only the authenticator entry id, and the secret stays where the authenticator put it |

The OTP factor consumes `app/src/lib/authenticator/totp.ts` through the adapter
in `lock-totp-authenticator.ts`. There is exactly one RFC 6238 implementation in
the app, and this feature does not add a second. When no authenticator is
registered the OTP choice is disabled **and states the unmet condition**, rather
than sitting greyed out with no explanation.

### Unlocking

Activating a locked surface opens `Md3LockUnlockPrompt`: anchored beside the
control that was clicked, non-modal, and returning focus to that control when it
is cancelled or dismissed with <kbd>Esc</kbd>.

The same lock is enforced at every activation boundary. Pointer-down and click
capture, Enter/Space keyboard activation, direct component callbacks, tab
context-menu actions, and command-palette/search teleports all consult the
target's own lock record before invoking the action. A blocked route opens the
same anchored prompt rather than silently dropping the request. The target
keeps `aria-disabled="true"` and a `data-md3-locked="true"` marker while any
one of its locks is still closed; those semantics refresh when the lock
registry or an in-memory unlock changes. Native disableable controls also set
their real `disabled` property, while capture-phase pointer/context routes and
the lock manager remain available for the anchored unlock prompt.

Cancellation and failed verification leave the target disabled and return
focus to the exact element that was attempted. A successful answer is not
replayed into the interrupted action; the user activates it again deliberately.
When multiple locks cover one target, the prompt chooses the first still-closed
lock and never treats another lock's answer as a shared credential.

The prompt always shows, at every funny level and in every language mode:

1. The lead sentence, which the funny level styles.
2. The credential field for that lock's factor and nothing else.
3. The unlock duration — **this surface only**, **for N minutes**, or **until the
   app closes** — defaulting to whatever the lock was configured with.
4. The fixed honesty line saying this is just for fun and is not security. No
   funny level styles this sentence.
5. The recovery sentence, naming the real application-data folder.
6. A **Forgotten your password?** link to Support Tickets.

A successful unlock raises a non-blocking toast and grants an
`IMd3ActiveUnlock`. Unlocks live in memory only: they never survive a restart,
and a lock whose `lockOnLaunch` is set (the default) is locked again at start-up.

Every row in the lock manager offers **Lock again** while its unlock is live, and
the same command appears in the surface's context menu.

### Every rendered element

The renderer installs one appearance-lock instrumentation boundary from
`app/src/ui/appearance/appearance-lock-element-registry.ts`. It registers every
rendered element under the application body, including non-interactive rows,
labels, icons, and panels, as well as buttons, fields, tabs, and other
actionable controls. Product-owned `data-md3-lock-target` values remain the
explicit identity; other elements receive a bounded semantic identity and a
`data-md3-element-id` marker so an equivalent re-render keeps the same target.

An activation resolves the complete ancestor chain. A lock on a toolbar, tab,
group, or profile owner therefore remains in force when a nested child has its
own lock, and each lock still requires its own credential. Pointer, keyboard,
context-menu, input/change, and direct callback routes use the same chain.
Native disableable controls expose the real `disabled` property while any
applicable lock is closed and restore the prior value after every relevant lock
is answered.

Generic elements receive one **Lock this element…** context-menu surface and a
`Ctrl`+`Shift`+`L`/Menu-key equivalent that opens the existing anchored setup
wizard. A surface that already owns a context menu keeps its existing actions;
the shared menu builder appends the same lock item once, rather than opening a
competing overlay.

### A wrong answer

A wrong answer says so, states how many consecutive wrong answers there have
been, and names the recovery route. It never wipes content, never escalates, and
never claims a lockout is enforcement.

The first two wrong answers cost nothing, because the overwhelmingly common case
is a typo. From the third, the next attempt waits — 5 s, then 15 s, then 30 s —
with the remaining seconds counted down visibly on the prompt. The ledger is held
in memory only: persisting it would turn a typo into a delay that survives a
restart, which would be enforcement rather than a speed bump. A match clears it.

### Recovery

Deleting the app's local application-data folder removes every lock on the
machine. The exact path is shown on the setup dialog and on the unlock prompt —
the two places a user will be looking for it — and when the path cannot be
resolved the copy says so instead of inventing one. Forgetting a toy lock's
credential is a normal outcome, so the route is documented and self-service; a
lock is never the only thing standing between a user and their own content.

The **Forgotten your password?** link routes to Support Tickets, which opens the
folder in the platform's file manager. The app never deletes the folder for the
user.

### The lock manager

`Md3LocksView` lists every lock in the app. It carries what this project asks of
every list:

- Its own search bar, wired to the full anchored regex builder. Plain text is
  the default; regex is an explicit opt-in and evaluates through the repository's
  RE2 adapter, so an adversarial pattern cannot wedge the renderer. An invalid
  pattern reports itself and shows the unfiltered list rather than an empty one
  that would read as "you have no locks".
- Multi-select by click, shift-click for a range, and a keyboard equivalent
  (<kbd>Space</kbd> toggles, <kbd>Shift</kbd>+arrows extend).
- A select-all that states its scope out loud: **Select the N locks this search
  is showing** is a different control from **Select all N locks, including the
  ones this search is hiding**.
- Inverse selection, and a clear.
- Bulk removal and bulk export in every format that can carry the record.

Each row shows what the lock covers, which factor answers it, when it was made,
whether it is open right now, and whether it re-locks on launch. It shows nothing
whatsoever about the credential.

### Locked surfaces stay honest in search

A locked tab or property still appears in the tab searches, the settings search
and the command palette, labelled as locked by `md3LockedResultLabel`. Selecting
one prompts to unlock rather than teleporting past the lock or silently doing
nothing.

`excludeLockedFromBulkClose` holds locked tabs back from a bulk close by default,
exactly as pinned tabs are, and reports how many were held back. An explicit
`includeLocked` closes them too — and still states how many locked tabs it swept
up, so an inclusive close is never silently identical to an exclusive one.

## Configuration

| Value | Default | Where it lives |
| --- | --- | --- |
| Lock exists on a surface | none | `desktop-material-surface-locks-v1` in the profile's local storage |
| Factor | Password | Per lock |
| Unlock duration | 10 minutes | Per lock, overridable per unlock |
| Lock again on launch | On | Per lock |

The setup dialog carries its explanation behind progressive disclosure and a
truthful provenance line beside the duration: it says whether the current value
is the shipped default (naming the real value) or something saved for this
particular lock.

## Security considerations

The word "security" appears here to describe what this feature is **not**, and to
describe how its credential handling behaves anyway.

- **Nothing secret is persisted outside the credential vault.** The lock document
  records what a lock covers, its factor, its duration and its id. A test asserts
  the serialized document contains no `digest`, `salt`, `secret` or `credential`.
- **A password is verified against a stored hash, never a stored password.** Each
  lock has its own 16-byte random salt and a SHA-256 digest of `salt password`.
  Digest comparison is constant-time.
- **The OTP secret never reaches this feature.** The lock stores the
  authenticator entry id, and verification is delegated to the authenticator.
- **Nothing ever reads a credential back for display.** There is no API to do so
  and there will not be one. Neither the app nor an agent working on it may show,
  hint at, or characterise a stored credential's value, length or composition.
- **Removing a lock forgets its credential.** The setup dialog also removes a
  lock record it has just written if the vault refuses the credential, so the
  feature can never leave behind a lock nobody has the credential for.
- **The throttle is not enforcement.** It exists so a mistyped credential is not
  a hundred-a-second guessing game. It is in-memory, it resets on restart, and
  the copy never claims otherwise.
- **An export never contains a credential**, and says so in the file itself, in
  every format, because an export that silently omits a field is exactly what the
  export contract forbids.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| The credential vault is unavailable | The lock is not saved, the vault's own error is reported verbatim, and the lock record written a moment earlier is removed |
| The vault holds no credential for a lock | The unlock prompt reports the lock cannot be checked and points at the recovery route. Nothing is held against the user |
| No authenticator is registered | The OTP factor is disabled with the unmet condition named. An existing OTP lock reports `unavailable` rather than counting a failure |
| A stored OTP secret cannot be decoded | Verification fails closed and says nothing about the value |
| The lock document is corrupt | Reading yields an empty list rather than throwing; individual malformed entries are dropped without taking their siblings with them |
| A persisted `lockOnLaunch` is missing or malformed | Fails closed: the surface locks again on launch |
| The application-data path cannot be resolved | The recovery sentence says the exact path could not be read, and does not invent one |
| Support Tickets is not registered | The link says plainly that it is not wired up in this build and points back at the folder. It never appears to work and silently do nothing |

## Accessibility

- Both anchored panels are `role="dialog"` with a labelled title and a described
  status region, take focus on open, restore focus to the originating control on
  close, and dismiss on <kbd>Esc</kbd>.
- The removal gate is `role="alertdialog"`, traps <kbd>Tab</kbd>, and gives focus
  to its emergency exit so a gate opened under a stray keypress cannot remove
  anything on the next one.
- Every row's checkbox and every icon-only button carries an accessible name that
  includes the lock's own label, so a screen-reader user meeting six identical
  Remove buttons can tell which lock each belongs to.
- The select-all is genuinely tri-state; a partial selection is indeterminate
  rather than reading as either extreme.
- The status region is a live `role="status"` with a reserved height, so an
  appearing message does not shove the footer under a pointer that is about to
  press it.
- Long labels wrap rather than clipping, rows stack below 560 px, and every
  interactive row is at least 28 px tall so it remains an adequate target at
  100/125/150/200 % display scale and in bilingual mode where labels are longest.
- The gate's progress fill drops its transition under
  `prefers-reduced-motion: reduce`.

## Verification

```
node script/test.mjs app/test/unit/appearance-lock-gate-test.ts app/test/unit/appearance-lock-every-element-test.ts app/test/unit/appearance-lock-control-test.tsx
```

- `app/test/unit/appearance-lock-gate-test.ts` — the activation gate, profile
  owners, direct callback boundaries, and startup/prompt wiring.
- `app/test/unit/appearance-lock-control-test.tsx` — the appearance editor's
  shared password-or-authenticator setup join and its existing password-removal
  path.
- `app/test/unit/appearance-lock-every-element-test.ts` — the hand-written
  actionable/non-actionable inventory, late-render registration, equivalent-DOM
  identity, nested independent locks, native disabled state, activation routes,
  and generic/existing-owner lock creation paths.

The activation-boundary implementation is present in
`app/src/ui/appearance/appearance-lock-gate.ts`, the shared context-menu action
dispatcher, `app/src/ui/lib/teleport.ts`, and the tab/submodule activation
owners. The focused lock set passed 51/51 tests. The full TypeScript check still
reports pre-existing IPC tuple and `desktop-notifications` declaration errors;
none are in the changed files. Direct ESLint cannot load this checkout's custom
rule definitions, and packaged runtime interaction/captures remain deferred.

Six guard-shaped assertions were verified by breaking the thing they guard,
watching the test go red, and restoring it:

| Guard | Broken by | Result |
| --- | --- | --- |
| Every declared appearance value type has a lockable property | Deleting the only `preset` property | red |
| Every surface that creates or answers a lock renders the honesty line | Removing the line from the unlock prompt | red |
| No `md3.locks.*` string claims a lock secures/protects/encrypts | Adding "which protects the tab" to a menu label | red |
| Every funny band exists in both catalogues | Deleting one English band entry | red |
| No export writes anything that could open a lock | Adding a `digest` column | red |
| Bulk removal is behind the two-key gate | Enabling the slider without both keys | red |

## Runtime wiring

The renderer installs the operating-system lock vault and the authenticator OTP
adapter during startup. The adapter reads only the authenticator document's
public entry metadata into an in-memory lookup; when an OTP lock is answered it
resolves the selected entry's secret through the existing credential-vault
boundary and passes it to the single RFC 6238 implementation. Secrets never
enter the lock document, the lookup, application logs, exports, or local Git
history.

The authenticator settings surface publishes the same metadata-only snapshot
after initialization and after every add, edit, reorder, group, or removal
mutation. This joins its store instance to the startup lock adapter immediately
without duplicating the authenticator secret or history repository.

The appearance editor uses the same `Md3LockSetupDialog` as tabs and lock
manager surfaces. That means an appearance value can be created with either a
password or a registered authenticator factor, and its unlock duration and
lock-on-launch choice are saved through the shared lock model. If the
authenticator document cannot be initialized, OTP locks remain unavailable and
the setup surface names the unmet condition rather than accepting an
unanswerable lock. The Support Tickets route is installed alongside these
startup joins.

## Suggested articles

- [Destructive-action super confirmation](destructive-action-gate.md) — the gate
  a bulk lock removal runs through.
- [School mode](school-mode.md) — the app's other deliberately-not-security
  presentation lock, with the same folder-deletion reset.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — what the funny
  level may and may not style in this feature's copy.
