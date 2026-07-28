# Tone: the per-language funny-level sliders

Two independent sliders — one for English, one for Cantonese — set how playful
the app's copy reads, from **1 (fully serious)** to **5 (maximum playfulness)**.
They live on **Settings → Appearance**, directly under the language-mode
selector, in a section headed **Tone**.

## Why they live on Appearance

They used to render on the **Sound** tab, beneath a *Text-to-Speech* heading.
That placement was wrong in two ways, and both were the substance of issue #83:

- **Discoverability.** A user hunting for a tone control has no reason to open a
  *Sound* tab, and the language mode they would naturally look for it beside was
  on a different tab entirely.
- **A false implication.** Sitting under a text-to-speech heading, the sliders
  read as if they only styled the spoken narrator. They do not. The funny level
  styles **every** category of user-facing copy — errors, warnings, destructive
  prompts, security notices — whether it is written on screen or spoken aloud.

The Sound tab keeps the narrator's own switches (whether it speaks, its volume,
its cooldown, recorded-versus-live narration) and now carries a **pointer** to
Appearance → Tone. It is deliberately a pointer and never a second copy of the
control, so the two surfaces cannot drift apart.

## Behavior

| Aspect | Behavior |
| --- | --- |
| Range | 1..5 integers, clamped on read and on write |
| Independence | English and Cantonese move separately; either may sit at 1 while the other sits at 5 |
| Band mapping | 1–2 → `plain`, 3 → `light`, 4–5 → `playful` |
| Default | 3 (lightly playful) for both languages |
| Live preview | Each card renders its own language at its own level, regardless of the viewer's display mode |

A key family opts into the funny level by declaring a `<base>` in
`FunnyLevelTextBase` (`app/src/lib/funny-level-text.ts`) and providing
`<base>.plain`, `<base>.light` and `<base>.playful` resources in both catalogs.
`translateWithFunnyLevel(base, languageMode, levels)` then picks each language's
own band from that language's own level, and joins them in bilingual mode
exactly the way the shared `translate` helper does.

## Tone changes voice, never facts

At every level a message must still name what happened, what is affected, and
what the user's options are. The established pattern for an unconditional fact
is a **separate fixed resource with no band variants at all**, rendered
alongside the banded framing:

- `appearance.toneWarningPreview.{plain,light,playful}` carries the framing, and
  every band names the same count (`3`) and the same repository
  (`desktop-material`).
- `appearance.toneWarningFixed` (`This cannot be undone.` / `呢個動作冇得復原。`)
  has no variants, so an irreversible action can never read as a maybe.

The same rule governs `cheapLfs.encryptionGate.intro`, where the sentence about
an unrecoverable passphrase is likewise a single fixed string.

## Accessibility

- Both sliders are native `<input type="range">` controls: full keyboard
  operation (arrows, Home/End, Page Up/Down) with a visible focus ring.
- The accessible **name** comes from a `<label for>`; the accessible **value**
  is `aria-valuetext`, which announces `Level 4 of 5, Playful` rather than a
  bare `4`. A number alone tells a screen-reader user nothing about how the app
  will read.
- `min`, `max` and `step` are `1`, `5`, `1`, so assistive technology reports the
  real bounds.
- The section is a labelled `role="group"`; the preview is a nested labelled
  group.
- Every decorative caption (the 1/5 scale ends, the level name, the numeric
  chip) is `aria-hidden` so the value is announced once, not three times.

## Layout

The section is Material 3: an outlined `surface-container-low` card with 16px
radius, tokens only (`--md-sys-color-*`, `--spacing*`, `--font-*`). Both slider
fields and both preview cards are `flex: 1 1 240px; min-width: 0`, and every
text run uses `overflow-wrap: anywhere`, so the longest strings in the app —
bilingual mode, where each label shows `English · 廣東話` — wrap instead of
clipping at narrow widths and at 125/150/200% display scale.

## Persistence

The pair is stored in the existing audio-settings blob
(`localStorage` key `audio-system-settings-v1`, fields `funnyLevelEnglish` and
`funnyLevelCantonese`), which stays the **single source of truth** for both the
written copy and the spoken narrator. Appearance writes through
`AudioCueStore.setSettings`, so a running narrator and the on-screen copy can
never disagree about the level. Readers use `readFunnyLevels()`, which clamps
out-of-range values and falls back to the defaults on a corrupt blob rather than
losing the setting.

## Search

Settings search (the field in the Preferences rail, wired to the shared regex
builder — RE2JS for user patterns, plain text by default) indexes the controls
as `appearance-tone` and `appearance-language-mode`. Both entries match in
English and Cantonese, and the tone entry lists all five level names as keywords
so a search for the setting's **current value** (`maximum playfulness`,
`玩到盡`) finds it, not only a search for its label. A match found while another
tab is open is reported as `in Appearance` / `喺外觀`.

## Verification

`app/test/unit/ui/funny-level-controls-test.tsx` (14 tests) covers: both sliders
rendering inside the same section as the language-mode selector; the 1..5
bounds; `aria-valuetext` naming each level; the rendered copy changing at every
level in English and in Cantonese, each without disturbing the other; the two
languages sitting at opposite ends simultaneously; the destructive-warning facts
surviving all five levels in both languages; bilingual labels; the persistence
round trip plus clamping and corrupt-blob fallback; the Sound tab carrying a
pointer and **no** second slider; and the search entries resolving to the
Appearance tab in fuzzy, substring, and regex modes.
