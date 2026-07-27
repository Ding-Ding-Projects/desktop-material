# Repository list sync summary

Every row in the repository side sheet carries a small, low-emphasis second line
under the repository name summarizing how far that repository has drifted from
its tracked upstream: how many commits are waiting to be pushed, and how many
are waiting at the remote to be pulled.

Before this line existed, drift was only visible after selecting a repository
and reading the push/pull toolbar button, so in a workspace with dozens of
repositories the one that actually needed attention was invisible until you went
looking for it.

## Behavior

The line reads the same `ILocalRepositoryState` snapshot the push/pull toolbar
button is built from — the ahead/behind counts recorded by the repository
indicator refresh — rather than deriving a second source of truth.

### States

| State | When | English (funny level 1) |
| --- | --- | --- |
| Ahead | Tracking branch, ahead only | `2 commits to push, nothing to pull` |
| Behind | Tracking branch, behind only | `3 commits to pull, nothing to push` |
| Diverged | Tracking branch, both | `2 commits to push, 3 commits to pull` |
| In sync | Tracking branch, both zero | `In sync as of the last check` |
| Unknown | No status has been read, or a tracking branch with no recorded counts | `Sync state unknown, not checked yet` |
| No upstream | On a branch with no tracking branch | `No upstream branch` |
| Detached | Detached HEAD | `Detached HEAD, no branch to compare` |
| Empty | Unborn HEAD (no commits yet) | `No commits yet` |
| Cloning | The row is a clone in progress | `Cloning, sync state not known yet` |
| Missing | The repository is missing from disk | `Missing from disk, sync state unknown` |

**Unknown is never rendered as `0` and never as "in sync."** That is the whole
point of the state: a fabricated zero tells the user they are up to date when
nobody has looked. `ILocalRepositoryState.upstreamState` exists precisely so the
row can tell "there is nothing to report" apart from "nobody has looked yet" —
`aheadBehind` alone is `null` in both cases. A repository with no cache entry at
all resolves to `'unknown'`; a repository whose HEAD tracks an upstream but has
no recorded counts also resolves to `'unknown'`, not to zero.

"In sync" is deliberately worded as *as of the last check*, because the row
reflects the last known remote state and cannot prove present-tense freshness.

### Deliberately no network

Rendering this line performs no fetch, no Git invocation, and no dispatcher
call. It is a pure derivation of already-loaded state
(`app/src/ui/repositories-list/repository-sync-summary.ts` imports nothing from
`lib/git`, the API, or the dispatcher, and a test asserts that).

A list of forty repositories must not become forty network calls, and typing in
the filter box must not trigger any. Freshness therefore rides entirely on the
existing background-fetch cadence — `RepositoryIndicatorUpdater` and the
repository indicator refresh — which already updates the same state cache the
line reads.

## Layout, localization, and accessibility

- Small `--md-sys-color-on-surface-variant` text at `--font-size-sm`, not a
  badge; it must not compete with the repository name above it.
- Both lines ellipsize (`@include ellipsis` with `min-width: 0` on the stack) so
  a long summary truncates instead of clipping or widening the sheet.
- **Row heights are unchanged.** The list is virtualized, so a taller row than
  its slot would overlap its neighbours and mis-target clicks. The name/summary
  stack is sized to fit inside the existing geometry: `RowHeight` stays 54
  (2×10px padding + a 34px icon chip) and `CompactRowHeight` stays 38, with the
  compact block padding tightened from 5px to 3px and the compact summary set to
  11px to make room. Changing either constant requires changing the SCSS with
  it.
- English, playful Hong Kong Cantonese, and bilingual mode are all supported.
  Bilingual mode paints both languages with a decorative separator, each in its
  own `lang`-tagged span.
- The wording honours the persisted **per-language funny level** (1 serious .. 5
  maximum), read once by the list rather than once per row. Voice moves; facts
  do not — every band names the same state and the same exact counts.
- The row's `aria-label` replaces its inner text for assistive technology, so
  the summary is folded into that label: `repo-101, 2 commits waiting to push,
  nothing to pull, Other`. The accessible name is always a readable sentence,
  never bare digits such as "3 · 1", and in bilingual mode it is one language's
  sentence rather than a separator-joined pair.

## Performance

The list re-renders on every keystroke in the filter box, so nothing here may
scale with typing:

- Each row memoizes its own derivation with `memoizeOne` over reference-stable
  inputs (repository, upstream state, `aheadBehind`, language mode, two funny
  levels).
- The list memoizes the map of accessible names over the repository array and
  the state cache. The filter text is deliberately *not* an input, so typing
  reuses the same map instead of re-deriving one sentence per visible row per
  keystroke.
- The funny levels are read from persisted settings once into list state, never
  per row per render. They are re-read when the list mounts (the repository
  sheet is created each time it opens) and on the language-mode change event; a
  funny-level change made while the sheet is already open therefore takes effect
  the next time it opens.

## Failure modes

Cloning rows and repositories without a `gitHubRepository` are ordinary members
of this list and are handled explicitly; a missing repository outranks whatever
stale counts survive in the cache. Corrupt or absent persisted audio settings
fall back to the default funny level rather than throwing, and an absent
`upstreamState` prop falls back to `'unknown'` — the honest state — rather than
to a zero.

## Verification

`app/test/unit/repository-sync-summary-test.ts` covers state derivation for
ahead/behind/diverged/in-sync, singular and plural commit grammar, the
status-to-upstream-state mapping, per-language funny bands, the accessible-name
sentence, both translation catalogs being complete and distinct, the no-network
source contract, and the SCSS geometry.

`app/test/unit/ui/repository-list-sync-summary-test.tsx` renders the row and the
list: exact text per state, the unknown state asserted to contain no digit and
no "in sync" wording, no-upstream/detached/empty/cloning/missing rows rendering
without crashing, the summary folded into each row's accessible name, and no
network call (spied `fetch`, plus a recording dispatcher proxy) during render or
while filtering.
