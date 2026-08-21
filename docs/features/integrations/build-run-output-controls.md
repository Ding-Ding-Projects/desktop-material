# Build & Run output controls

The Build & Run log panel keeps long-running compiler and test output readable
without changing or discarding the underlying stream. Three header controls let
the user jump to the newest line, decide whether new output should follow
automatically, and shorten long lines visually.

## Behavior and configuration

- **Scroll to bottom** is a one-shot action. It moves the current log to its
  newest line without changing the auto-scroll preference.
- **Auto-scroll output** is enabled by default. While enabled, each new batch of
  output keeps the log at the tail. Scrolling upward to read older output pauses
  auto-scroll so later lines do not pull the view away; enabling it again jumps
  to the current tail.
- **Truncate long lines** is disabled by default. When enabled, each long line
  is displayed on one row with an ellipsis. This is a visual mode only: the full
  line stays in the log and **Copy all output** still copies the complete text.
- On Windows, a `.NET` profile's `dotnet run` application is launched as an
  independent process after the build succeeds. Closing Desktop Material does
  not close that application. Install, restore, and build commands remain
  supervised finite stages; only the final `dotnet run` application is
  detached.

Auto-scroll and visual truncation are stored as device-local application
preferences and survive closing and reopening the panel. They are not committed
to the repository and do not vary by repository or provider account. The jump
action is intentionally not persisted.

The controls have explicit pressed-state semantics and localized accessible
names in English and playful Hong Kong Cantonese. Bilingual mode presents both
labels through the shared compact bilingual translation layer.

## Failure modes and recovery

If saved preference data is absent or invalid, auto-scroll returns to enabled
and truncation returns to disabled. Turning truncation off immediately restores
normal wrapping. A paused auto-scroll state never pauses the command or output
capture; use **Scroll to bottom** or re-enable auto-scroll to catch up.

## Security and data considerations

These controls are renderer-only presentation and navigation choices. They do
not alter the command, process, output buffer, repository, or files. Visual
truncation does not remove text or conceal it from the existing copy action.
As with any build log, copied output can still contain paths or diagnostics from
the invoked tool, so review it before sharing.

## Verification

`build-run-panel-output-controls-test.tsx` covers the one-shot jump, explicit
toggle state, automatic pause while reading history, resume-at-tail behavior,
following only while enabled, persistence, and complete retained line text.
The Build & Run style contract covers the pressed state and display-only
ellipsis rule. Localization checks cover English, Cantonese, and bilingual
composition. The focused Build & Run UI, style, and localization checkpoint
passed 42/42 tests; the combined changed-surface gate passed 165/165 across 18
suites.

The Windows `.NET` lifetime regression in
`runner-shutdown-test.ts` verifies that only a run-stage `dotnet run` command is
detached. A disposable real `dotnet run` web application also remained alive
for eight seconds after its Node launcher exited; the probe process tree was
then terminated by its recorded PID. Production compilation completed
successfully at implementation commit
`9c7781aea90ab2799716202a45c6d077fd072a5d`.
