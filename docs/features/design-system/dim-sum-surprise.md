# The dim sum surprise

Roughly **one launch in ten**, Desktop Material puts a small photograph of a
Hong Kong dim sum dish in the bottom-left corner, names it in English and
Traditional Chinese, and takes it away again after about nine seconds.

That is the whole feature. It is a delight, not a system: there is nothing to
configure, nothing to acknowledge, and nothing it can stop you doing.

## Behavior

| Aspect | Behavior |
| --- | --- |
| Chance | `DimSumSurpriseProbability = 0.1`, drawn fresh on every launch |
| Draws per launch | Exactly one, whether it hits or misses |
| Duration | `DimSumSurpriseDurationMs = 9000`, then it clears itself |
| Position | Bottom-left, fixed; the error notice stack owns bottom-right |
| Focus | Never taken. `role="status"`, `aria-live="polite"`, no tab stop |
| Blocking | Never. It is not a dialog and it is not in the top layer |
| Dismissal | Self-clearing; a labelled close button only saves you the wait |
| Off switch | **None.** See [No opt-out](#no-opt-out) below |

### When it stays away

The launch's state is checked before the probability is consulted. A suppressed
launch simply shows nothing, and is **not** retried later: the check runs once,
at startup, so closing a dialog can never be ambushed by a surprise that was
waiting for it. In priority order:

| Reason | Meaning |
| --- | --- |
| `error` | Startup failed, or an error notice is on screen |
| `first-run` | The welcome flow owns the window |
| `update` | An update is being checked for, downloaded, or is ready |
| `modal` | A blocking dialog has the user mid-decision |
| `quiet-hours` | The user's configured quiet-hours window is open |
| `already-drawn` | This launch has spent its single draw |
| `no-dishes` | No bundled dish survived verification |

The most serious applicable reason is the one reported, so a user whose app
just failed to start is told `error`, never `quiet-hours`.

The draw runs at the very end of `performDeferredLaunchActions` in
[`app/src/ui/app.tsx`](../../../app/src/ui/app.tsx) — on an idle callback, well
after the shell is committed and the window is interactive. It cannot delay
startup, and the whole thing is wrapped: a failure costs you a picture of a
dumpling and nothing else.

### No opt-out

There is no setting that turns the surprise off, and the shared instructions
are explicit that there must not be. Three things follow:

- No preference, no searchable setting, no palette command mentions it. A test
  walks every settings surface and fails if one appears.
- `migrateDimSumOptOut` runs on every launch and **deletes** the retired keys
  (`dim-sum-surprise-enabled`, `dim-sum-surprise-v1`,
  `show-dim-sum-surprise`) rather than reading them. A profile carrying an old
  refusal simply rejoins the draw.
- What makes an un-optable surprise polite is everything above it: it never
  gates startup, never steals focus, never interrupts a task, and leaves on its
  own.

## The pictures

Every picture is a real photograph copied **byte for byte** out of the shared
dim sum catalog. Nothing is generated, downloaded, resized, or re-encoded at
any point, and nothing is fetched at runtime — the card builds a `file://` URL
into the app's own bundled directory.

| Aspect | Detail |
| --- | --- |
| Location | `app/static/dim-sum/`, copied to `out/static/dim-sum` by the build |
| Count | 12 dishes, about 27 MiB |
| Format | Lossless PNG, at least 1024×1024, exactly as the catalog holds them |
| Manifest | `manifest.json` — names, alt text, byte length, dimensions, SHA-256 |

Twelve rather than the whole catalog because each picture is a multi-megabyte
lossless PNG that the installer pays for. The twelve cover steamed, baked,
fried, rolled, bakery, dessert and drink, so the draw stays varied without
turning a small delight into a download.

### Regenerating them

```bash
yarn generate-dim-sum-assets [catalogDirectory]
```

The catalog directory defaults to `$DIM_SUM_CATALOG_DIR`, then to an
`agent-global-memory/dim-sum` checkout inside the current user's GitHub folder.
The script verifies that each file is a real PNG with a well-formed `IHDR` and
a terminating `IEND` chunk before copying it, records its SHA-256, and removes
any picture a previous run left behind. A dish whose picture is missing or
undecodable is **reported and skipped**, never replaced by a substitute.

This is a maintenance tool, not a build step. The pictures and the manifest are
committed, so a build, a test run, and CI never need the catalog present.

## Language and tone

The dish's **name is a fact, not voice.** It reads identically in all three
language modes and at all five playfulness levels; only the order changes.

| Mode | Rendered name |
| --- | --- |
| English | `Classic Har Gow · 蝦餃` |
| Bilingual | `Classic Har Gow · 蝦餃` |
| Cantonese | `蝦餃 · Classic Har Gow` |

The copy **around** the name is banded (`dimSum.title.*`, `dimSum.lead.*`) and
follows each language's own funny level, so English can read plainly while
Cantonese reads playfully. Every band states the same two facts: the odds
(one launch in ten) and that the card clears itself. No band promises a way to
switch it off, because there is not one.

## Accessibility

- **`role="status"` / `aria-live="polite"`** — announced without interrupting,
  and it never takes focus on mount.
- **Per-run language tags.** A dish name is always mixed-script, so each half
  declares its own `lang` (WCAG 3.1.2). Without it an English synthesiser reads
  蝦餃 as unknown glyphs and a Cantonese one mangles the Latin half. The tagged
  runs always rejoin into exactly the visible name, so what is rendered and
  what is spoken cannot drift apart.
- **Alt text names the dish in both languages** in every mode, so a
  screen-reader user gets the same delight — and describes the photograph
  rather than repeating the visible name.
- **Focus comes home.** A reader who tabs into the card has their origin
  remembered; when the card leaves, focus goes back there rather than to the
  top of the document. Tabbing in also cancels the auto-dismiss, so it cannot
  vanish mid-sentence.
- **44×44 dismiss target**, visible focus ring, `prefers-reduced-motion`
  removes the entry and leave animations, and `forced-colors` gets a real
  border.
- **It caps its own size.** A `position: fixed` card cannot be scrolled into
  reach, so it is bounded to the viewport (`dvh` with a `vh` fallback) and
  scrolls inside itself. A short window shrinks the photograph rather than the
  words.

## Security and privacy

- **No network.** No CDN, no analytics, no tracking pixel, no runtime fetch.
  The picture is a local file, and the source is asserted to contain no
  `http(s)` URL and no `fetch(`.
- **No path traversal.** A manifest filename must match
  `^[A-Za-z0-9._-]+\.png$` or the dish is dropped, so a hand-edited manifest
  cannot turn a data file into a way of reading the disk.
- **A uniform draw.** `drawUnitRandom` divides a full 32-bit CSPRNG value by
  its range, so the stated one-in-ten is the real rate. A draw that is not a
  usable number in `[0, 1)` is treated as a **miss**: a broken random source
  can never make the surprise more frequent than advertised.
- **Nothing is persisted.** The surprise writes no preference at all; the only
  storage it touches is the deletion of retired opt-out keys.

## Failure modes

| Failure | Result |
| --- | --- |
| Manifest missing or malformed | Zero dishes, `no-dishes`, no card |
| One dish entry corrupt | That dish is dropped; the rest still draw |
| Duplicate id or filename | The later copy is dropped, so no dish is twice as likely |
| Picture missing on disk | A broken image is possible only if the asset test was skipped; the test hashes every file on every run |
| `localStorage` unreadable | Migration is skipped; the surprise still shows |
| No CSPRNG reachable | The draw throws, is caught, and the launch shows nothing |
| Any unexpected error | Caught and logged at debug; startup is untouched |

## Verification

| Suite | Covers |
| --- | --- |
| `app/test/unit/dim-sum-surprise-test.ts` | The 10% band, malformed draws, uniformity over 200k CSPRNG draws, dish selection, every suppression reason, opt-out migration, bilingual naming and alt text |
| `app/test/unit/dim-sum-copy-test.ts` | All 15 mode × level combinations: the odds survive every band, no band promises an off switch, the name and alt text never change with voice |
| `app/test/unit/dim-sum-assets-test.ts` | Every bundled PNG exists, decodes, and hashes to the value the manifest recorded; the directory holds nothing else |
| `app/test/unit/dim-sum-wiring-test.ts` | Drawn from deferred startup, one draw per launch, every suppression path checked, no settings surface offers a toggle, reduced-motion and forced-colors honoured |
| `app/test/unit/ui/dim-sum-surprise-test.tsx` | The rendered card: polite roles, no tab stop, both names at every level, `file://` source, labelled dismiss |

## Suggested articles

- [Tone: per-language funny-level sliders](tone-funny-level.md) — the two
  sliders that style this card's framing copy.
- [Audio system](audio-system.md) — where the quiet-hours window this feature
  honours is configured.
- [Material ripple and theme reveal](material-ripple-and-theme-reveal.md) — the
  shared motion vocabulary the card's entry animation belongs to.
