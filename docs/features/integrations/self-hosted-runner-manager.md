# Self-hosted GitHub Actions runner manager

Desktop Material can set up and control a repository-scoped GitHub Actions
runner on the Windows computer that is running the app. The manager lives in
the repository **Actions** view and keeps the selected GitHub account,
repository, proposed labels, local process, and GitHub registration bound to
one identity throughout the operation.

This is different from the [local GitHub Actions
runner](local-actions-runner.md), which uses `act` and Docker to simulate a
workflow before it is pushed. A managed self-hosted runner registers with
GitHub and can receive real repository jobs.

## Behaviour

- The setup form proposes a bounded runner name and custom labels. The
  main-process preflight derives the complete label set GitHub will use,
  including the built-in self-hosted, operating-system, and architecture
  labels.
- A main-process preflight binds its result to the selected account,
  repository, and exact proposed labels. Changing any of them invalidates the
  result.
- The manager downloads the official Actions runner package, verifies its
  published SHA-256 digest, extracts it into the app's managed data directory,
  and configures it without replacing an existing registration.
- Setup does not report success until GitHub returns one new runner with the
  expected name, operating system, architecture, labels, and online state.
- Managed runner cards expose status, exact labels, **Start**, **Stop**, and a
  separately confirmed **Remove** action. A read-only GitHub inventory also
  shows runners that this app does not own.
- Every control request includes the repository scope, so an Actions view for
  one repository cannot control a runner belonging to another.

## Guided configuration

1. Open the repository's **Actions** view and find **Self-hosted runners**.
2. Connect the repository to GitHub and sign in to the account that owns the
   private repository.
3. Choose the account, enter a unique runner name, keep **Windows** selected,
   and review one to 20 comma-separated custom labels. GitHub adds the
   built-in `self-hosted`, operating-system, and architecture labels; the
   suggested project label follows the repository's dedicated-runner
   convention.
4. Wait for the setup-form safety preflight. It always runs before setup and
   reports the repository and workflow conditions described below for the exact
   account and labels now on screen.
5. Read and select both acknowledgements: workflow authors who can target the
   labels can run code on this computer, and that code receives the current
   Windows user's file and network access.
6. A safe preflight enables setup after those two acknowledgements. When a
   completed preflight instead finds either an unsafe workflow-trust path or a
   pending job that can claim the labels, read the displayed finding and select
   the separate risk-acceptance checkbox. The checkbox records intent only:
   setup repeats the audit in the main process and shows a Windows-owned
   confirmation for the current finding before it can proceed.
7. Choose **Set up runner**. Progress remains visible while dependencies,
   package download, registration, and readiness checks run. The active setup
   can be cancelled without starting a duplicate operation.
8. Use the runner card for later control. **Start** always performs a fresh
   main-process trust and queue audit against the runner's live labels; it never
   reuses the earlier setup-form result.

The setup button stays disabled with a visible reason when an account,
repository identity, private visibility proof, complete preflight,
acknowledgement, unique name, or valid label set is missing. The two
acknowledgements confirm the host-risk decisions. A third checkbox is shown
only for a completed known unsafe result. It never becomes an IPC permission:
the main process owns the later confirmation and stores any accepted evidence
only in memory for that setup operation. Incomplete, cancelled, malformed,
changing, or otherwise unavailable audit evidence never exposes an override and
remains blocked. A public repository whose untrusted event can reach the
proposed labels should still use an isolated host or restricted runner group
whenever that exposure is not an intentional, reviewed risk.

## Security boundary

Self-hosted workflow code is ordinary code running as the current Windows
user. It can reach that user's files and network services. A WSL distribution,
including a dedicated one, can reach mounted Windows drives and is not a
security boundary.

The manager therefore fails closed at several independent boundaries:

- **Public repositories are audited, not blanket-blocked.** A public repository
  normally requires the immutable workflow audit to prove that no untrusted
  event can reach the managed runner labels. A completed, classified unsafe
  result can be reviewed and accepted through the Windows-owned confirmation
  described below; unknown visibility still fails closed. This is a workflow-
  safety decision, not a promise that public workflow code is isolated from the
  Windows user.
- **Private-fork workflows disabled.** The selected account must prove through
  GitHub's repository Actions policy that pull-request workflows from private
  forks cannot run. Private visibility by itself is not sufficient.
- **Immutable workflow audit.** Every workflow is fetched and inspected from
  one resolved default-branch commit. Untrusted or indeterminate triggers,
  unsafe runner targeting, and reusable-workflow references that cannot be
  proven against the audited repository state block the operation.
- **Historical queue scan.** The manager reads complete paginated workflow-run
  and job inventories twice. A pending job whose labels can claim the proposed
  runner blocks setup or start. Malformed pages, duplicates, partial
  inventories, or changing snapshots are treated as unavailable evidence, not
  as an empty queue.
- **Explicit known-risk confirmation.** Setup performs its own workflow and
  queue checks before creating managed files, even after the form preflight has
  completed. The renderer checkbox is not authority. When a completed
  `workflow-trust-unsafe` or `runner-queued-job-blocked` finding remains, the
  main process shows a Windows-owned confirmation with the current repository,
  complete labels, and recovery detail. Its volatile receipt is bound to the
  account, repository, full labels, and fingerprinted audit evidence. It can
  cover only matching rechecks in that one setup operation, is erased by a safe
  recheck, and is never written to runner state. **Start** and the scheduled
  trust monitor never reuse it. A different warning, unavailable evidence,
  cancellation, inventory mismatch, package failure, registration failure, or
  process-control failure remains blocking.
- **Exact account credentials.** Same-endpoint accounts stay distinct through
  their stable identity. One-time registration and removal tokens remain in
  main-process memory; on Windows the token travels through the child process
  environment, never command-line arguments. Setup never uses `--replace`.
- **Owned-process proof.** Stop, cancellation, recovery, and shutdown require a
  matching process identity and a verified stopped postcondition before state
  is recorded as stopped.
- **Continuous recheck.** A scheduled trust monitor uses the same exclusive
  operation lease as user actions. If a ready runner's repository trust no
  longer passes, the manager attempts to stop only the process whose ownership
  it can prove and surfaces the exact result.

Linux-in-WSL setup and control remain disabled. The implementation can inspect
user-managed Debian or Ubuntu distributions and filters internal Docker
distributions, but it does not enable WSL management until it can prove
in-distribution process-group cancellation and teardown. Existing WSL records
remain visible with instructions to manage them directly in the distribution
and on GitHub.

This feature neither enables nor requires code signing. SHA-256 verification
protects the downloaded GitHub Actions runner package; it is unrelated to
Desktop Material's separate unsigned application-release policy.

## Lifecycle, cancellation, and recovery

Only one setup, control, status-reconciliation, or scheduled trust operation
owns the manager at a time. Duplicate submission is refused, cancellation is
bound to the exact runner operation, and app shutdown drains the active lease
before persisting final state.

The local state file acts as a lifecycle journal with provisioning,
registered, starting, ready, removing, and remote-removed phases. On restart,
the manager reconciles interrupted records before accepting new work:

- a persisted GitHub runner identifier is authoritative;
- when older state lacks that identifier, recovery requires one unique
  case-insensitive same-name registration with the expected Windows operating
  system and architecture;
- unreadable or malformed local `.runner` identity metadata stops recovery and
  retains managed files for inspection;
- failed or cancelled setup rolls back the registration when both the local
  process and remote identity can be proved; otherwise it retains a stopped
  recovery record rather than guessing that cleanup succeeded; and
- removal first proves the exact registration absent from stable GitHub
  inventory, then removes managed files. A partial local cleanup returns an
  explicit recovery instruction.

Removal is an irreversible operation and uses a dedicated alert dialog built on
the shared destructive-action gate. The user must turn both of the gate's keys —
the exact target, naming the runner and the repository it is registered on, and
the exact effect, naming what unregistering destroys — and then move a
full-range authorization slider before submission. **Emergency exit** and Escape
work before submission; once removal begins, the dialog stays open and shows
runner-specific progress until the exact result is known.

A destructive dialog makes its *cancel* button the form's submit button, so
Enter pressed anywhere in the form submits it. The dialog's own submit handler
is therefore what gates the keyboard: it returns without removing anything until
the gate reports itself authorized. Holding the affirmative button disabled
gates the pointer only.

## Failure modes and recovery

| Failure | Result and recovery |
| --- | --- |
| Repository visibility is unknown | Setup and start remain disabled until GitHub proves whether the repository is public or private. |
| A public workflow can reach the managed labels from an untrusted event | The completed preflight names the exact finding and offers a separate intent checkbox. Setup reruns the audit and requires a Windows-owned confirmation bound to the current evidence. Without that confirmation, setup remains blocked; **Start** remains strict. Use an isolated host or restricted organization runner group whenever possible. |
| Private-fork Actions policy permits pull-request workflows | The completed preflight names the repository policy finding and offers the same intent checkbox plus Windows-owned confirmation. Without that confirmation, setup remains blocked; **Start** remains strict. Disable the policy or use an isolated host whenever possible. |
| Workflow audit or queue inventory is unsafe, incomplete, duplicated, oversized, stalled, or changing | A completed `workflow-trust-unsafe` or `runner-queued-job-blocked` finding can proceed only after the intent checkbox and the main-process Windows confirmation of the current evidence. Incomplete, duplicated, oversized, stalled, changing, or unavailable evidence always fails closed; correct the workflows or retry when GitHub can return a complete stable inventory. |
| Runner name already exists | Choose a unique name. The app never replaces the existing registration. |
| Official package download redirects to an untrusted host or fails its digest | The package is discarded. Retry after network or GitHub availability is restored. |
| Registration appears but readiness cannot prove the exact runner online | Launch stops and the lifecycle journal is retained for recovery; setup does not claim success. |
| Cancellation or helper timeout occurs | The owned process tree is terminated and checked. Completed registration is rolled back when provable, otherwise a stopped recovery record remains. |
| Local process identity or registration metadata is ambiguous | No destructive action is taken. Repair the local metadata or remove the exact registration manually on GitHub before retrying. |
| WSL platform is selected | Setup remains unavailable until process-group ownership and cancellation can be proved. Use native Windows or manage the WSL runner directly. |

## Accessibility

- Setup, start, stop, cancel, and remove controls have runner-specific
  accessible names; status badges name both the runner and its state.
- Progress and success updates use polite live status regions. Security and
  operation failures use alerts, while disabled controls reference the visible
  reason that must be resolved.
- The removal alert dialog traps focus, labels its title and description,
  announces progress, supports Escape before submission, and returns focus to
  the originating control when it closes.
- Both of the gate's keys are independently keyboard-operable. The slider
  exposes its percentage through `aria-valuetext` and cannot move before both
  keys are turned.
- Suggested runner labels remain within GitHub's 64-character label bound while
  preserving the operating-system and architecture suffix used to identify the
  execution target.

## Verification

Focused Windows-app verification on August 9, 2026 passed **61/61** tests:

- `app/test/unit/self-hosted-runner-contract-test.ts`: main-process
  security, identity, workflow, queue, lifecycle, cancellation, recovery,
  process-ownership, readiness, and WSL fail-closed contracts, including public
  workflow auditing without the private-only fork-policy endpoint.
- `app/test/unit/ui/self-hosted-runner-manager-test.tsx`: setup-form account
  scoping, searchable rich account selection, trust acknowledgement,
  public-repository auditing, intent-only risk acknowledgement, unavailable-
  audit blocking, custom-label bounds, WSL-disabled presentation, exact
  accessible actions, cancellation, duplicate refusal, and removal-progress
  routing.
- `app/test/unit/ui/self-hosted-runner-removal-dialog-test.tsx`: the separate
  irreversible-removal confirmation contract.

Reproduce the focused result with:

```powershell
node script/test.mjs app/test/unit/self-hosted-runner-contract-test.ts app/test/unit/ui/self-hosted-runner-manager-test.tsx app/test/unit/ui/self-hosted-runner-removal-dialog-test.tsx
```

The broader Windows app suite, hidden-desktop runtime exercise, live runner
registration, and GitHub-hosted CI verdict remain separate evidence. The focused
result does not claim any of those external or end-to-end outcomes.

## Suggested articles

- [Actions workflow manager](actions-workflow-manager.md)
- [Local GitHub Actions runner](local-actions-runner.md)
- [Self-hosted Windows dependency bootstrap](self-hosted-windows-dependency-bootstrap.md)
- [Responsiveness and resource lifecycle](../quality-and-reliability/responsiveness-and-resource-lifecycle.md)
