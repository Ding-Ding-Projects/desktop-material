# School mode

School mode is a persisted, user-renamable presentation lock in **Settings →
Appearance**. It keeps the application in English and temporarily removes the
language, playfulness, and dim-sum presentation surfaces from the user
interface. It is a local user-experience setting, not a security boundary.

## Behaviour

- The mode name is editable and is used in the mode's heading, descriptions,
  controls, command-palette result, and settings-search result.
- Enabling the mode requires a credential between 4 and 128 characters and a
  matching confirmation. The credential is never stored as plain text.
- While enabled, the app resolves every translation request as English, hides
  the language-mode, playfulness, and personal-vocabulary controls, removes
  their command-palette and settings-search rows, hides scheduled language
  selection, and suppresses the dim-sum surprise. Existing open windows—the
  main shell, Settings, and the internal browser—apply the change immediately
  from the shared `SchoolModeChangedEvent`; reopening a window is not required.
- Turning the mode off requires the locally verified credential. The selected
  display name and the user's previous language/playfulness values remain
  stored and become effective again after the mode is disabled.
- The command palette and settings search remain available so the user can
  navigate directly to the renamed mode and unlock it. Both surfaces resolve
  the current display name instead of leaking the shipped fallback or an
  interpolation placeholder.
- Scheduled settings keep saved language values for later use, but the active
  editor removes language controls and explains that language scheduling is
  unavailable until the presentation lock is turned off.

## Configuration and persistence

The presentation state is stored in renderer local storage under a versioned
key. The credential record contains a random 128-bit salt and a SHA-256 digest
of the salted credential, using the Web Crypto API. The product identity,
installer identifiers, and application-data directory are independent of the
display name.

Deleting the local application profile resets the mode if its credential is
lost. This reset path is stated in the UI because the mode does not protect
data from someone who can access the profile.

## Failure modes

- Invalid or mismatched credentials are rejected inline and leave the current
  mode unchanged.
- If Web Crypto or local credential storage is unavailable, enabling and
  disabling fail without changing the presentation state.
- Malformed stored mode data falls back to the disabled state and the shipped
  mode name. Malformed names are trimmed, control characters are removed, and
  values longer than 80 characters fall back to the shipped name.
- A stale dim-sum opt-out from an older profile is migrated away; it cannot
  disable the surprise permanently.

## Security considerations

The credential is a local unlock convenience only. It is not a password for
repository data, does not encrypt the profile, and must not be described as an
access-control boundary. The digest and salt stay in local storage; the
credential itself is held only in the password control while the user submits
it.

## Verification

- `app/test/unit/school-mode-test.ts` covers normalization, persistence, salted
  credential storage, credential verification, and hidden palette/search rows
  including personal vocabulary. The live-window and conditional-rendering
  changes in this lane were not executed under the current ultra-speed
  boundary; tests, lint, typecheck, builds, captures, and reviews remain
  unrun.

## Suggested articles

- [Tone: per-language funny-level sliders](tone-funny-level.md)
- [Command palette: full-app coverage, rich controls and teleport](command-palette-full-coverage.md)
- [The dim sum surprise](dim-sum-surprise.md)
