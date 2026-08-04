# The Material Design 3 site

The published site at <https://ding-ding-projects.github.io/desktop-material/>
is a full Material Design 3 rebuild of the landing page, the Cheap LFS guide,
the Cheap LFS versus Git LFS atlas, and the documentation front end. It is a
single **Design Component**: one file holding a template and the logic class
that renders it, plus a client-side runtime.

The rules this project applies to every user-facing surface apply to it in
full — the three language modes, both playfulness sliders, the regex builder on
every search bar, the four tab searches, the per-element appearance editor,
non-blocking notifications, export, and bulk actions. This page records how it
is built, what is vendored and why, how to change it, and how each of those
claims is verified.

## What the site is made of

| File | What it is |
| --- | --- |
| `site/index.html` | The Design Component: an `<x-dc>` template and the logic class in a `data-dc-script` block. Every page, panel, and piece of state lives here. |
| `site/Listbox.dc.html` | A sibling Design Component. Every select on the site is one of these — a searchable listbox with its own regex builder. |
| `site/support.js` | The Design Component runtime, byte-for-byte upstream. It parses the template, compiles the logic, and renders through React. |
| `site/vendor/**` | Everything the runtime would otherwise fetch from a CDN: React, ReactDOM, four font subsets, their licences, and the map that points the runtime at them. |
| `site/cheap-lfs.html`, `site/cheap-lfs-vs-git-lfs.html` | Redirects. See [the two retired routes](#the-two-retired-routes). |

Six pages live in that one component — Overview, Cheap LFS, Cheap LFS vs Git
LFS, Docs hub, the regex-builder article, and Docs search — presented as a
browser-style tab strip in two named, colour-coded, collapsible groups.

## Nothing is fetched from another host

The site loads no CDN script, no remote stylesheet, no webfont, no third-party
image, and no analytics. That is the same constraint the rendered documentation
has always held, and it is why the vendoring below exists rather than a `<link>`
to Google Fonts.

The runtime makes this awkward in one specific way: `support.js` is an upstream
build that hard-codes the unpkg URLs it loads React from. Rewriting it would
mean maintaining a fork. Instead it is used as designed — it consults a
`window.__resources` map before it reaches for any of those URLs, and
`site/vendor/dc-resources.js` supplies that map:

```js
window.__resources = Object.assign(window.__resources || {}, {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js':
    './vendor/react.production.min.js',
  // …
})
```

That file must load **before** `support.js` in the document head; the runtime
reads the map at load time, not at boot. `script/site-dc-pages-test.mjs`
asserts the ordering, because getting it wrong produces a page that works
perfectly on any machine with a network and fails closed on one without.

> [!NOTE]
> The CDN URLs still appear as strings inside `support.js`. That is expected —
> they are the keys of the map. The contract test therefore proves each one is
> remapped onto a file that shipped, rather than grepping for the hostname.

## The vendored assets

`script/vendor-site-assets.mjs` downloads everything and writes
`site/vendor/`. It needs a network; nothing in the build does, because its
output is committed.

```sh
node script/vendor-site-assets.mjs
```

| Asset | Source | Notes |
| --- | --- | --- |
| React 18.3.1, ReactDOM 18.3.1 | unpkg UMD builds | The downloaded bytes are re-hashed and compared against the SRI digests `support.js` pins. A mirror that served something else fails at vendoring time rather than in a reader's browser. |
| Roboto Flex, Roboto Mono | Google Fonts CSS v2 | Latin and Latin-Extended subsets only. |
| Material Symbols Outlined | Google Fonts, `icon_names=` | Subsetted to the ligatures the site actually names — 54 of them, roughly 13 KiB rather than several megabytes. |
| Noto Sans HK | Google Fonts, `text=` | Subsetted to the CJK characters the Cantonese copy actually renders — about 230 of them. |
| Licences | Upstream `LICENSE`/`OFL.txt` | Checked in under `site/vendor/licenses/`, with byte counts and digests recorded in `site/vendor/manifest.json`. |

Total: about 420 KiB on disk. A variable family answers every weight in a
`wght@400;500;700` request with the same binary, so the downloads are
content-addressed and the three Noto Sans HK faces share one file.

### Changing the copy means re-running the vendoring

The two content subsets are derived from `site/index.html` and
`site/Listbox.dc.html` on every run. Add an icon, or a line of Cantonese, and
the vendored subset no longer covers it — the icon renders as the word
`dark_mode` and the Cantonese renders as tofu.

This is exactly the kind of failure nobody notices in review, so it is a build
failure instead. `site/vendor/fonts/coverage.json` records what each subset was
built to cover, and the contract test compares it against what the page
actually renders:

```text
the icon subset is missing tab_close — those render as their ligature words.
Re-run: node script/vendor-site-assets.mjs
```

## Real URLs for a single-page site

A site whose pages are tabs still owes its readers linkable pages. `#lfs` names
a page and `#docs/coverage` names a section inside one. The route is read on
first load, written with `history.pushState` on every navigation, and re-read on
`popstate` and `hashchange`, so bookmarks, external links, and the browser's own
back button all address the same thing the tab strip does.

### The two retired routes

The Cheap LFS guide and the comparison atlas used to publish at
`/cheap-lfs.html` and `/cheap-lfs-vs-git-lfs.html`. Those files still exist as
redirects to `/#lfs` and `/#atlas`, carrying a canonical link, a meta refresh, a
scripted replace, and — for a reader whose browser blocked the refresh — a
sentence saying where the page went and a link to it.

## Narrow windows and phones

Every layout on this page is an inline style, and no stylesheet overrides an
inline style without `!important` — so the responsive rules in the helmet are
deliberately loud. They are keyed on the *property the template sets* rather
than on per-element hooks wherever possible, so re-importing the design from
the design tool cannot quietly drop them. Nothing in them applies above
**760px**, where the desktop layout is untouched.

Below that width:

| Rule | Why |
| --- | --- |
| Every `grid-template-columns` collapses to `1fr`, and its items get `min-width: 0` | Each grid asks for columns of at least 200px. A grid item defaults to `min-width: auto`, so without the second half one long token in a card widens the whole page — visible at 320px, not at 375px. |
| `[data-dm-fluid]` drops its `min-width` | Two elements declare a minimum wider than a phone. That is what drags the page sideways: the app bar stops fitting, the sticky header inherits its width, and both tab strips then measure their own `overflow-x: auto` against a container far wider than the screen — so they never scroll, they just push. |
| The app bar's search field becomes a search button | A 300px field plus five 44px buttons does not fit, and there is no <kbd>Ctrl</kbd>+<kbd>F</kbd> on a phone to open the panel with. The button opens the same search panel. |
| The brand subtitle and the keyboard hint are hidden; gutters and tab heights shrink | The header is sticky and holds the whole navigation, so every pixel it keeps is a pixel of the article nobody can read. This trims it from 256px to about 200px without dropping a control or taking a target below 34px. |
| Footer links get `min-height: 32px` | They are a list of destinations, not prose, and a 15px line box is not a tap target. |
| A sticky header goes `position: static` below **520px of height** | A phone held sideways has around 380px of height; a sticky header would take half of it. |

> [!NOTE]
> `[data-dm-fluid]` is an attribute rather than a `[style*="min-width:300px"]`
> selector on purpose. React re-serialises inline styles, so a selector keyed
> on the spacing it happens to emit silently stops matching.

The teleport helper measures the app bar instead of assuming a fixed offset,
because the bar is two or three lines tall on a phone and a fixed 160px landed
every teleported section underneath it.

**Measured**, in bilingual mode at the maximum 135% text scale, on all six
pages and all six overlay panels: no horizontal page scroll and no clipped text
at **320px** or **375px**, no touch target under 30px, and the desktop layout
unchanged above the breakpoint.

## Accessibility

The tab strips are real tab strips: `role="tablist"` around `role="tab"`
buttons that name the `role="tabpanel"` they control through `aria-controls`,
with the panel's `aria-labelledby` tracking the active page tab, a roving
`tabindex` so the strip is one stop in the page's tab order, and
<kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> moving between tabs.
Closing the current page's tab leaves the panel unlabelled rather than pointing
at an id that is no longer in the document.

Every slider carries an accessible name that contains its visible label; the
appearance editor's Bold, Italic, and Underline buttons expose `aria-pressed`;
every image has alt text; and the whole document declares its language.

### The accent seed carries its own on-colour

The accent setting replaces `--md-sys-color-primary` at runtime. Replacing it
without also replacing `--md-sys-color-on-primary` leaves the theme block's
text colour behind — which in dark mode put `#00344f` on `#006493`, a **2.02:1**
primary call to action. `onColor()` now derives black or white from WCAG
relative luminance, and all four offered accents clear 6.4:1 in both themes.
Both the contract test and `app/test/unit/site-accessibility-test.ts` assert
the two properties are set together.

## The documentation it links to

The site is the front end; the 249 rendered Markdown articles are published
beside it under `/docs/` by the same workflow. The Docs hub is the doorway:
**Open all 249 articles**, **Search every article**, and eight category cards
that each link to their rendered category index and state their real article
count.

Those counts are claims about the tree, so they are derived from it rather than
remembered:

```sh
node script/sync-site-doc-counts.mjs          # rewrite them from docs/
node script/sync-site-doc-counts.mjs --check  # report without writing
```

The contract test runs the same comparison, so adding a feature document
without re-running the sync is a red build rather than a page quietly
advertising a number that stopped being true.

## Screenshots

The design shipped six drag-and-drop upload placeholders and a hero slot. On a
published page those are empty boxes, so they were replaced with the captures
the repository already holds, each lazily loaded, each with alt text, and each
opening its full-size image. The Screenshots section links to the full
88-scene gallery at `/docs/screenshots/`; the count comes from
`docs/wiki/Feature-Gallery.md` and the contract test checks the two agree.

## Failure modes

| Symptom | Cause |
| --- | --- |
| Icons render as words like `dark_mode` | An icon was added without re-running the vendoring. The contract test catches this. |
| Cantonese renders as empty boxes | Same, for the Noto Sans HK subset. |
| The page renders but is unstyled and inert offline | `vendor/dc-resources.js` is loading after `support.js`, or was not published. |
| A select does nothing when an option is picked | The importing page is the browser's own document, where HTML lowercases attribute names, so the callback arrives as `onpick`. `Listbox` reads both spellings. |
| `sibling fetch for "Listbox" failed` in the console | `site/Listbox.dc.html` did not publish. Every select on the site is one. |
| An empty preview when opening `site/index.html` from disk | The runtime fetches its sibling over HTTP. Use `node script/serve-site.mjs site`. |

## Security considerations

The runtime compiles the logic class with `new Function`, which is why the
component is repository-owned and never fetched from anywhere else. Regex
evaluation in the builder is bounded to 200 matches and 20,000 characters with
a timeout, and patterns and sample text are never persisted or transmitted.
Only appearance, language, playfulness, and theme preferences are written to
`localStorage`, under the single key `dm3-site`.

## Verification

```sh
node script/site-dc-pages-test.mjs site
node script/test.mjs app/test/unit/site-accessibility-test.ts
node script/sync-site-doc-counts.mjs --check
```

The Pages workflow runs the contract against the assembled tree with
`--expect-docs`, which additionally proves the rendered documentation the hub
links into was published alongside the site.

## Suggested articles

- [Documentation site build](../../technical/documentation-site-build.md) — the
  workflow that assembles and publishes this site, and the Mermaid renderer.
- [The every-project regex builder](../../regex-guide.md) — the contract every
  search bar on the site implements.
- [Release-backed Cheap LFS](../repository-management/release-backed-cheap-lfs.md)
  — the feature the site's Cheap LFS page teaches.
- [Cheap LFS vs Git LFS](../repository-management/cheap-lfs-vs-git-lfs.md) —
  the comparison the site's atlas page presents.
