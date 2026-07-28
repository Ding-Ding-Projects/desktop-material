# Documentation site build

The published documentation site at
<https://ding-ding-projects.github.io/desktop-material/docs/> is built by
[`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) on every
push to `main` that touches `site/`, `docs/`, or the workflow itself, and on
manual dispatch. This page records what each step does, and the contract a
documentation author can rely on when writing a page.

## The hard constraint: zero external resources

**A published page must load nothing from another host.** No CDN script, no
analytics beacon, no webfont, no remote image. Everything a browser needs is
either inlined in the page or served from the site's own origin.

That is why diagrams are pre-rendered rather than drawn in the browser: the
obvious fix for a Mermaid fence — a `<script src="https://cdn…/mermaid.js">`
tag — would break the constraint on the very first page load, and a vendored
runtime bundle would ship a few hundred kilobytes of JavaScript to draw
pictures that never change.

`script/render-mermaid-test.mjs` asserts the constraint over
`site/docs-template.html` and over generated output, matching `src=`,
`<link href=`, `url(…)`, and `@import` against absolute and protocol-relative
URLs. Navigation links to `github.com` are not assets and are allowed.

## Build steps

| Step | What it does |
| --- | --- |
| Install pandoc | The only Markdown renderer the site uses. |
| Assemble publish directory | Copies `site/` into `_site/`, drops the files that are build inputs rather than pages, and copies `docs/assets/screenshots`. |
| Render documentation to HTML | Runs `pandoc --from gfm --to html5` over every `docs/**/*.md` and every root-level `*.md`, through `site/docs-template.html` and the `site/md-links.lua` link rewriter. |
| Publish the documentation hub | Renders `docs/README.md` to `/docs/README.html` and copies the hand-built Material Design 3 hub to `/docs/index.html`. |
| Validate the Cheap LFS Pages surfaces | Runs the existing 30-row product-guide contract and the standalone 72-row comparison-atlas contract against the assembled `_site`, after the shared regex runner and worker have been copied. |
| Install the Mermaid pre-renderer | Installs `@mermaid-js/mermaid-cli` and `puppeteer` into `$RUNNER_TEMP`, outside the checkout, then downloads Chromium. |
| Pre-render Mermaid diagrams | Runs `site/render-mermaid.mjs` over `_site`. |
| Build documentation search index | Runs `site/build-search-index.js`, which extracts each page's text into `docs/search-index.json`. |
| Upload artifact / Deploy | Standard `actions/upload-pages-artifact` and `actions/deploy-pages`. |

The pre-render step runs **before** the search index, so the text inside a
diagram is indexed as part of the page and a reader can find a page by a node
label.

### Standalone Cheap LFS comparison route

`site/cheap-lfs-vs-git-lfs.html` publishes at
`/desktop-material/cheap-lfs-vs-git-lfs.html`. It uses only repository-owned
CSS, JavaScript, and two self-contained SVG diagrams. The route also loads:

```text
docs/assets/site/docs-regex-job.js
docs/assets/site/docs-hub-regex-worker.js
```

Those URLs do not exist beneath raw `site/`. They become valid only after the
**Publish the documentation hub** step copies `docs/assets/site/` into
`_site/docs/assets/site/`. Local browser acceptance must therefore serve an
assembled `_site` tree, or map that path to the repository's `docs/assets/site`
directory. Serving raw `site/` and reporting a broken regex worker is a false
failure.

The route contract is:

```sh
node script/cheap-lfs-vs-git-lfs-pages-test.mjs _site
```

It holds the data model at 72 criteria across 12 categories, resolves every
row-level source ID, checks the exact Cheap/Git push commands and caveats,
exercises tab/filter/fit/language/tone state, and refuses a page-thread regular
expression implementation. The existing `cheap-lfs-pages-test.mjs` continues
to protect the 30-row teaching guide independently.

## Mermaid diagrams

GitHub renders a ` ```mermaid ` fence natively, so diagrams have always been
correct when reading `docs/` on github.com. Pandoc does not: `--from gfm` turns
the fence into `<pre class="mermaid">`, which is why the site published diagram
source until this step existed.

[`site/render-mermaid.mjs`](../../site/render-mermaid.mjs) walks the generated
`_site` tree, finds each `<pre class="mermaid">`, renders the definition with
the Mermaid CLI in a headless Chromium, and splices the SVG straight into the
document inside `<figure class="mermaid-figure">`. Inline SVG means no second
request, nothing extra to copy into `_site`, and no runtime dependency.

### What an author can rely on

- **Write a plain ` ```mermaid ` fence.** No attributes, no wrapper, no
  per-page configuration. Whatever renders on github.com renders on the site.
- **Both readings stay in sync.** The Markdown file keeps the fence, so GitHub
  keeps rendering it natively; only the generated HTML holds an SVG.
- **The prose under the diagram is the accessible fallback and stays put.**
  The renderer replaces the fence and nothing else. Keep writing the bilingual
  English / 廣東話 description beneath each diagram — a diagram is never the
  only place a fact appears.
- **The diagram gets its name from the caption you already wrote.** The
  accessible name comes from the bold lead-in of the paragraph that follows the
  fence (`**How the strip is organized.** …` becomes "How the strip is
  organized"), falling back to the nearest preceding heading. Two diagrams
  sharing one caption are disambiguated with `(2)`, `(3)`. The name lands in
  the SVG's `<title>`, with `role="img"` and `aria-labelledby` on the SVG.
- **Colours follow the reader's light or dark preference.** Do not put colour
  in a diagram. `style`, `classDef`, and `%%{init}%%` colour directives will be
  baked in as written and will be unreadable in one of the two schemes.
- **A wide diagram scrolls; it does not shrink into unreadability.** A diagram
  may scale down to 80% of the size Mermaid drew it at, after which the figure
  scrolls horizontally inside its own container.
- **A broken fence fails the build.** See below.

### Theme safety

The site renders in light and dark. Mermaid bakes colours into the SVG it
produces, so a diagram rendered with any stock theme is legible in exactly one
of them.

The renderer solves this by handing Mermaid a palette of unique **sentinel**
colours — one per theme variable, `#0a0b01`, `#0a0b02`, … — and then replacing
every sentinel in the returned SVG with a CSS custom property. Mermaid keeps
all of its colours in one `<style>` element inside the SVG, so the substitution
reaches every rule. A second `<style>` is appended defining the palette for
light, with a `@media (prefers-color-scheme: dark)` block redefining it for
dark, plus overrides for the handful of colours Mermaid hard-codes past its own
theme variables (`.commit-id`, `.arrowheadPath`, the unused `look: neo` drop
shadow, KaTeX glyph paths).

Because the SVG is inline in the HTML document, the media query is evaluated in
the page's own context: the same file repaints for both schemes with no
JavaScript. Because the palette is defined inside the SVG rather than borrowed
from the page, a diagram opened on its own still themes correctly.

Any colour literal Mermaid emits that is **not** a sentinel is a colour stuck
in one scheme. The build audits every rendered stylesheet for exactly that and
prints a warning naming the diagram, the page, and the literal. The audit
tolerates only the literals the appended stylesheet already overrides, listed
as `InertColorLiterals`; a Mermaid upgrade that introduces a new baked colour
fails `script/render-mermaid-test.mjs` rather than quietly shipping a diagram
half of the readers cannot see.

Contrast is asserted, not assumed. The test computes the WCAG ratio of every
pair that carries meaning — text on each surface, lines and outlines against
the page background, branch chips against their label text — in both schemes,
requiring 4.5:1 for text and 3:1 for graphical parts.

### When a diagram fails to render

**A fence that will not render fails the build, loudly.** The published site
must never carry a blank frame, a broken diagram, or a wall of fence source, so
the renderer collects every failure, writes nothing for the pages holding them,
prints the page, the diagram's position and name, the Mermaid error, and the
offending source, and exits non-zero. The Pages deployment never runs.

That is deliberate rather than defensive: a fence is authored in this
repository, so a parse error is ours to fix, and a red build is cheaper than a
published page nobody can read.

### Building the site without the Mermaid toolchain

A contributor rendering the site locally should not have to install a headless
browser. Run without `--require-toolchain` and a missing toolchain is a warning
on stderr; every fence is left exactly as pandoc emitted it, which is the
behaviour the site had before this step existed:

```sh
node site/render-mermaid.mjs _site
```

To pre-render locally, install the toolchain anywhere and point at it:

```sh
mkdir -p /tmp/mermaid-toolchain && cd /tmp/mermaid-toolchain
npm init --yes
npm install @mermaid-js/mermaid-cli@11 puppeteer@25
npx puppeteer browsers install chrome
cd -
node site/render-mermaid.mjs _site --toolchain /tmp/mermaid-toolchain
```

The toolchain is searched for in this order: `--toolchain`, the
`DESKTOP_MERMAID_TOOLCHAIN` environment variable, the repository's own
`node_modules`, then `.mermaid-toolchain/`. Setting
`DESKTOP_MERMAID_TOOLCHAIN` also un-skips the end-to-end test in
`script/render-mermaid-test.mjs`, which renders a real committed fence through
a real browser.

The workflow passes `--require-toolchain`, which turns a missing toolchain from
a warning into a build failure. A published build either renders every diagram
or does not publish.

### Fonts

Diagram text is laid out at build time on the Linux runner with the site's own
font stack, `'Segoe UI', system-ui, -apple-system, sans-serif`. The runner has
none of those installed and falls back to its default sans, which is wider than
Segoe UI or Helvetica, so boxes sized on the runner have room to spare on a
reader's machine rather than clipping. Do not narrow the stack without
re-checking a long-labelled diagram.

## Verification

```sh
node script/test.mjs script          # includes script/render-mermaid-test.mjs
npx prettier --check site/docs-template.html .github/workflows/pages.yml
```
