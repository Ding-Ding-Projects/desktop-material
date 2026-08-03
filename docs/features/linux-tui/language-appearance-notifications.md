# TUI language, appearance, and notifications

## Language and tone

Settings persists exactly three application language modes:

- English;
- playful Hong Kong Cantonese;
- bilingual, with compact primary/secondary labels.

English is the fallback for a missing Cantonese key. Independent English and
Cantonese funny levels run from 1 (professional) to 5 (most playful). Every
catalog entry that offers tone variants produces distinct output at all five
positions. Tone can change wording but never changes repository names, paths,
SHAs, error facts, security guidance, destructive targets, or the meaning of a
choice.

the graphical edition's 2,000-plus-key catalog. Missing terminal copy therefore
falls back rather than being counted as complete desktop localization parity.
The shell and shared controls use the catalog; it is not yet the graphical
edition's 2,000-plus-key catalog. Missing terminal copy therefore falls back
rather than being counted as complete desktop localization parity.

## Dim-sum startup surprise

An eligible launch makes one fresh cryptographic random draw. Values in the
bottom 10% select one dish using a second independent draw from the bundled,
verified local catalog. The card shows the factual English and Traditional
Chinese names, Jyutping when available, meaningful bilingual alt text, and a
terminal true-color rendering decoded from the tracked PNG. It never fetches an
image or sends telemetry.

The card mounts after the shell is usable, never changes focus, stays within the
viewport, dismisses automatically, and has a keyboard/mouse dismiss action. A
first run, startup error, update, open modal, or configured quiet-hours window
spends the launch's opportunity without showing or loading the art; clearing
that condition later cannot trigger a delayed ambush. There is no disable
setting. Decoder byte, pixel, format, and checksum bounds make an invalid asset
fail closed without turning the optional delight into a startup failure.
the graphical edition's 2,000-plus-key catalog. Missing terminal copy therefore
falls back rather than being counted as complete desktop localization parity.

## Appearance

The TUI persists light/dark/system choice, comfortable/compact density, accent,
Unicode-border preference, and reduced motion. Settings also exposes
terminal-safe per-element foreground, background, emphasis, and border inputs.

The terminal emulator owns font family, point size, glyph fallback, cell
geometry, window opacity, and zoom. Those desktop capabilities are marked
`terminal_owned`, not falsely described as implemented. The app uses compact and
narrow responsive classes so controls reflow within available cells.

## Narrator preferences

Optional narrator settings are off by default and include English, Cantonese, or
Both; quiet-hour start/end; reduced sound; and yield-to-screen-reader. These
values validate and persist. Actual speech synthesis, debouncing, a serialized
playback queue, and assistive-technology ducking are not shipped in the first
preview, so the parity contract marks narration partial.

## Notifications

Informational, progress, success, and ordinary error events appear as
non-blocking corner notices. Decisions—destructive confirmation, merge/cancel,
or consent—remain dialogs. Notices are also written to app-owned SQLite so a
user can review them after the corner toast disappears.

The Notification tab supports:

- title/message/source/time search through the shared search modes;
- severity, read, and dismissed metadata;
- mark-read state;
- deletion and clear operations with appropriate confirmation;
- a detail `TextArea` for long messages and action metadata.

Notification storage contains operational text and repository metadata and
should be treated as private user data. It is not a secret vault, and the app
must not deliberately write credentials, tokens, or raw authorization headers
into a notice.

## Failure modes

- invalid color, density, language, funny level, quiet-hour time, or command
  preference fails full-config validation;
- a malformed config file remains on disk and defaults are used for startup;
- a locked config waits only for the bounded lock interval;
- an unavailable notification database must not make the operation being
  reported fail;
- unavailable Cantonese copy falls back to English;
- unsupported terminal color or Unicode border rendering degrades visually
  without changing action semantics.
