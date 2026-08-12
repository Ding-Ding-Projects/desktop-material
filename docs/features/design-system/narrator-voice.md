# Narrator voice

Which voice reads app events aloud, chosen per language on **Settings → Sound →
Narrator**. English and Cantonese pick separately, and either can be left to the
app.

旁白用邊把聲讀嘢，英文同廣東話各揀各。 兩邊都可以留返俾個 app 自己揀。

---

## Why it is selectable at all

It used to pick its own: first exact locale match, then first language-family
match, then nothing. On a machine with a dozen installed voices that is a
decision made with no basis whatsoever, and the listener's only remaining
control over a voice they find grating was the off switch.

**Two pickers, not one.** Choosing an English voice says nothing about which
Cantonese voice should read the other half of a bilingual line, so each carries
its own selection, its own persistence, and its own status.

## Behavior

| Aspect | Behavior |
| --- | --- |
| Default | Empty, meaning **choose automatically** |
| Stored as | `SpeechSynthesisVoice.voiceURI`, per language |
| Storage | `ttsVoiceEnglish` / `ttsVoiceCantonese` in the audio settings blob |
| Rate | 0.5–2, default 1 |
| Pitch | 0–2, default 1 |
| Network | None. Voices come from the platform |

**Nothing ships with a named voice as its default.** The app cannot know what is
installed until it asks, so naming one would be a preference for a voice most
installs do not have.

## The three things that are easy to get wrong here

### The voice list arrives late

`getVoices()` commonly returns an **empty array on the first call** and fills in
a moment later, announced by a `voiceschanged` event. A picker that reads it
once reports *no voices installed* on a machine with forty — it looks broken,
and it is merely slow. The picker subscribes, re-reads, and unsubscribes on
teardown.

### Names are neither unique nor stable

A machine can carry several voices called "Microsoft Zira" from different
engines, and platforms localize the display name — so a profile written on an
English install would silently stop matching on a Chinese one. The `voiceURI` is
the only stable identity, and it is what gets persisted.

### A chosen voice can be uninstalled

Reported as **missing**, with the choice **kept**. Silently resetting it would
lose a deliberate decision on a machine that may get the voice back. The
narrator falls back to the closest match in the meantime, and the settings
screen is where that is said, because that is where the user can do something
about it.

## What the picker says is in effect

A select box that merely shows a value implies that value is what will be heard.
That is exactly the state that needs saying out loud when it is not true.

| Status | Copy |
| --- | --- |
| `automatic` | Chosen automatically: the closest match this computer has |
| `chosen`, local | The voice's name and language tag, installed on this computer |
| `chosen`, network | …and that it **will not speak while you are offline** |
| `missing` | Not installed on this computer; falling back; your choice has been kept |
| `none-available` | This computer has no voice that can read this language, and the narrator will stay silent for it |

`none-available` is deliberately distinct from `automatic`: automatic means the
app will pick one, and there is nothing to pick from. Saying "chosen
automatically" on a machine that will stay silent is a claim the user cannot
check.

## Which voices each side accepts

| Side | Language tags |
| --- | --- |
| English | `en`, `en-*` |
| Cantonese | `zh`, `zh-*`, `yue`, `yue-*` |

Cantonese takes the whole `zh` family rather than only `yue` because most
Windows and macOS installs label their Hong Kong voice `zh-HK`; a filter
demanding `yue` finds nothing on a machine that plainly has one.

Matching is on the whole subtag or a hyphen boundary, so `en` does not swallow
`enm`.

**Offline voices sort first.** A network voice that stops working on a train is
a worse thing to land on by accident than a local one.

## Failure modes

| Situation | Behavior |
| --- | --- |
| No speech synthesis at all | An empty list, and the picker is disabled with the reason stated. Not a throw — the settings screen still has to render |
| `getVoices()` throws | Same as above |
| Chosen voice uninstalled | Reported missing, choice kept, automatic fallback used |
| A stored value that matches nothing | Not reset; shown as missing |
| A stored value over 512 characters | Coerced to empty, i.e. automatic |

## Verification

```
node script/test.mjs app/test/unit/narrator-voices-test.ts
```

16 tests. Two guards verified by breaking them and watching them go red:
narrowing Cantonese to `yue` alone, and relaxing the language match to a bare
`startsWith` with no subtag boundary.

## Suggested articles

- [Audio system](audio-system.md) — the narrator, sound effects and music this
  setting lives inside.
- [Tone: per-language funny-level sliders](tone-funny-level.md) — which styles
  the narrator's wording while the voice reads it.
- [Personal vocabulary](personal-vocabulary.md) — the other per-language setting
  that changes what you hear and read.
