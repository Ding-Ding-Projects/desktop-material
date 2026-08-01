# Design-system features

- [Command palette: full-app coverage, rich controls and
  teleport](command-palette-full-coverage.md) — the Ctrl+F palette as MD3's
  full-screen search view: inline switches/boxes/steppers/selects for
  settings rows, and click/Enter teleporting to the exact control that owns
  each feature (Ctrl+Enter to run instead).
- [Command palette rows and
  appearance](command-palette-appearance.md) — icon/keyword/group rows, the
  compact aligned Customize appearance editor, stable random-per-repository
  layouts, and discoverability entries for otherwise-buried surfaces.
- [Material ripple and theme reveal](material-ripple-and-theme-reveal.md) —
  shared interaction feedback and bounded animated theme transitions.
- [Dialog wheel and trackpad scrolling](dialog-wheel-scrolling.md) — route
  pointer scrolling from any descendant to the nearest usable dialog scroll
  owner while preserving nested controls and stacked-panel behavior.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — independent
  English and Cantonese 1..5 sliders on Settings → Appearance beside the
  language mode, wired to every category of copy (not just the narrator), with
  a live preview, the voice-not-facts rule, and searchable level names.
- [Audio system](audio-system.md) — optional, off-by-default spoken narrator,
  synthesized sound effects, and per-repository music, with rate-limiting,
  quiet hours, reduced-sound, screen-reader coexistence, and funny-level tone.
- [Recorded narration + melody assets](narration-assets.md) — plays the
  pre-generated per-event voice clips (English/Cantonese/bilingual, serialized
  in one non-overlapping queue) and melody cues in place of live speech and
  synthesized effects, with automatic fallback and a persisted toggle.
- [Distinct sound-effect event mapping](sfx-event-mapping.md) — pure event →
  category → motif mapping that gives push/fetch/pull and every Build & Run
  phase their own cue in four motif families, with per-category cooldowns and a
  per-cue audition grid in Settings → Sound.
- [Repository-themed music](repository-theme-music.md) — a deterministic,
  synthesized looping theme per repository (no bundled files) seeded from its
  identity, with per-repo custom-track/mute overrides persisted in a Git-backed
  dedicated setting and a one-time migration from localStorage.

This category has no HTTP API. Postman collections are not applicable.
