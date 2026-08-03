# Cheap LFS versus Git LFS comparison atlas

The standalone
[Cheap LFS versus Git LFS comparison atlas](https://ding-ding-projects.github.io/desktop-material/cheap-lfs-vs-git-lfs.html)
is the decision surface for teams choosing how large payloads should leave
ordinary Git objects. It is separate from the complete
[Cheap LFS product guide](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html):
the guide teaches one product from first pin through restore; the atlas spends
its entire surface comparing the two operating models.

The comparison is marketing-forward, but its outcome is not preselected. Cheap
LFS gets the clearer signal where Desktop Material has a guided Windows
workflow, explicit provider verification, Release/OCI choice, multipart logical
files, optional encryption, recovery, and detailed progress. Git LFS gets the
clearer signal where its published standard, cross-platform clients, host and
tool ecosystem, file locking, caching, pruning, history migration, CI, and
automation are the stronger fit. Cost, retention, several transfer choices, and
collaboration policy remain explicitly contextual.

## Scope and evidence boundary

The atlas contains exactly **72 criteria in 12 categories**, six criteria per
category:

| Category | What it separates |
| --- | --- |
| Identity and ecosystem | Supported platforms, primary experience, standardization, storage architecture, hosts, and audience |
| Setup and tracking | Installation, initialization, patterns, thresholds, exact-file review, and onboarding |
| Pointer and Git history | Format, identity, compactness, multipart receipts, readable location, and interoperability |
| Commit and push | Publication order, plain `git push`, first branches, missing objects, later push failure, and partial batches |
| Providers and storage | GitHub Releases, OCI, LFS servers, provider choice, content reuse, and provider migration |
| Limits, cost, and retention | GitHub limits, Release bounds, billing, budgets, bandwidth, and deletion responsibility |
| Transfer and performance | Parts/chunks, concurrency, retry/resume, compression, progress, and cancellation |
| Restore, cache, and offline | Hydration, selective retrieval, local cache, offline use, partial failure, and manual recovery |
| Integrity, security, and privacy | SHA-256, Release encryption, private OCI encryption, credentials, metadata, and Windows path hardening |
| Collaboration and review | Unaware clients, cross-platform teams, locking, forks, pull requests, and mixed tools |
| Migration and recovery | History import, no-rewrite adoption, scopes, export, remote reclamation, and recovery receipts |
| CI, archives, and operations | Headless commands, Actions checkout, archives, Pages, the manager, and public APIs |

Each criterion owns a stable `difference-NN` identifier, one category, one fit
signal (`cheap`, `git`, `tie`, or `depends`), English and Hong Kong Cantonese
copy for both products, a review date, and one or more source identifiers. A
source identifier resolves into the visible bibliography rather than merely
asserting that a relevant-looking link exists somewhere on the page.

“Every current documented difference” is intentionally dated **July 28,
2026**. It means every product-level distinction that this repository could
state and source at that checkpoint. It is not a promise that host prices,
limits, policy, clients, or this implementation can never change.

## Publication order and `git push`

The dedicated **Git push** tab makes the most easily confused boundary
explicit:

1. preflight the real push remote and canonical GitHub identity;
2. when the first Release-backed publication requires it, create and prove the
   app's create-only branch anchor;
3. upload, reread, and verify the provider bytes;
4. review and commit the Cheap LFS pointer;
5. run ordinary `git push` to publish that pointer commit; and
6. fetch, prove that `HEAD` equals `@{upstream}`, and exercise a fresh restore.

Plain `git push` does **not** pin a raw file into Cheap LFS. On an established
branch the app finishes the provider transaction before the pointer commit
exists. A first Release-backed branch is the documented exception: the app may
need a create-only, hook-skipping anchor before the Release can exist. OCI
publication does not need a Release anchor.

The safe inspection sequence is:

```console
git remote get-url --push origin
git show HEAD:path/to/large-file.bin
git push
git fetch origin
git rev-parse HEAD
git rev-parse '@{upstream}'
```

The last two values must match. `git show` reads the committed pointer even
when Desktop Material has deliberately materialized raw working bytes over it.
CLI `git status` may therefore show that working file as modified; users must
not accidentally `git add` the raw payload over the pointer.

`git push --set-upstream origin HEAD` is ordinary manual branch publication.
It can update an existing fast-forwardable branch and runs the normal hooks. It
is not equivalent to the app's create-only Release anchor.

Git LFS follows its standard filter and pre-push path: `git lfs track` writes a
shared `.gitattributes` rule, the clean filter records a Git LFS pointer, and
the installed pre-push hook uploads missing objects before Git completes its
ref update.

## Interaction and persisted configuration

The page uses six browser-style tabs: Verdict, All differences, Workflows,
Git push, Fit finder, and Sources. Tabs expose one roving keyboard tab stop,
Left/Right/Home/End navigation, drag reordering, explicit move controls,
pinning, a narrow-screen overflow selector, hash restoration, and persisted
order and pin state. A per-tab appearance editor persists font family, size,
selected color, and radius and can reset to the Material defaults.

Comparison filters compose across:

- plain text, which remains the default;
- an explicit bounded regular-expression mode;
- one of 12 categories; and
- one fit signal.

The filter count is live and atomic, and narrow screens receive a card layout
instead of document-level horizontal overflow. Category and fit choices
persist under route-specific keys; queries, patterns, and sample text do not.

The page shares the site-wide persisted language, theme, and independent
English/Cantonese funny-level keys. The baseline modes are English, playful
Hong Kong Cantonese, and bilingual. Funny levels alter surrounding voice, not
commands, dates, counts, limits, source names, or factual claims.

## Regex safety

The atlas loads the documentation site's shared `docs-regex-job.js` runner and
`docs-hub-regex-worker.js` evaluator. Reader-authored patterns never compile on
the page thread. Every search or builder operation runs in a fresh same-origin
worker that the page terminates at a hard **750 ms** deadline.

The builder labels the dialect as ECMAScript and provides literals, character
classes, anchors, groups, alternation, and quantifiers alongside a raw editor,
flags, sample text, syntax feedback, match offsets, capture previews, copy, and
apply. The route bounds its pattern to 240 characters and sample to 1,200
characters, inside the shared worker's 512/20,000 hard ceilings. The worker
advances zero-width Unicode matches safely. An unavailable or timed-out worker
fails closed instead of falling back to an uninterruptible UI-thread regex.

## Failure modes

| Failure | Visible behavior |
| --- | --- |
| Invalid stored filter or tab state | Reject the value and restore an allowlisted default |
| No comparison match | Show an atomic bilingual empty state; do not hide the reason |
| Invalid regex | Retain the user's pattern, report the syntax error inline, and apply no unsafe fallback |
| Regex timeout | Terminate the worker at 750 ms and show a persistent dismissible warning |
| Worker unavailable | Fail regex mode closed; plain-text filtering remains available |
| Provider or host policy changes | Keep dated wording and update the affected rows and sources together |
| Cheap provider preflight or first anchor fails | Produce no provider upload and no pointer commit |
| Later Cheap pointer push fails | Retain provider bytes and the local pointer commit for a non-duplicating retry |
| Missing Git LFS pre-push object | Let the Git LFS client refuse the incomplete push by its configured policy |
| JavaScript unavailable | The route shell and primary choice guidance remain readable; interactive matrix filtering requires the route controller |

## Security and privacy

- The page loads no remote script, stylesheet, font, or image. Its two
  marketing diagrams are repository-owned SVGs with titles and descriptions.
- Search patterns and sample text stay local and are not persisted.
- Source links separate core Git LFS facts from GitHub-specific billing,
  limits, forks, archives, Releases, and Pages policy.
- Neither SHA-256 pointer is described as encryption. Cheap LFS's optional
  encryption is scoped to the documented provider routes; Git LFS core not
  defining payload encryption does not mean an extension can never transform a
  stream.
- Encrypted Cheap pointers still expose plaintext size and SHA-256 plus
  provider structure. The page calls that out rather than marketing encryption
  as anonymity.
- The page does not claim unlimited file size, perpetual free bandwidth,
  universal speed, or drop-in pointer interoperability.
- Open issue
  [#96](https://github.com/Ding-Ding-Projects/desktop-material/issues/96)
  remains an explicit boundary on observed 50+ GiB inventory hardening.
  Issues
  [#80](https://github.com/Ding-Ding-Projects/desktop-material/issues/80),
  [#85](https://github.com/Ding-Ding-Projects/desktop-material/issues/85), and
  [#87](https://github.com/Ding-Ding-Projects/desktop-material/issues/87)
  remain visible where built recovery/decrypting/unattended evidence is not yet
  complete.

## Verification

The atlas is now a page of the
[Material Design 3 site](../design-system/material-design-3-site.md) at
`/#atlas` rather than a file of its own, and `/cheap-lfs-vs-git-lfs.html`
redirects there so every link ever made to it still arrives. Its contract moved
with it: `script/site-dc-pages-test.mjs` covers the whole site, including this
page, the redirect, and the assets it renders.

The Lowlevel MCP acceptance driver is
`.codex/verification/verify_cheap_lfs_vs_git_lfs_page.js`. It serves an
assembled Pages tree so the shared documentation worker paths resolve exactly
as they do in production, then drives installed Chrome on an off-screen Win32
desktop at 1440×960 and 390×844. The dated evidence and cleanup record live in
[`docs/verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/`](../../verification/cheap-lfs-vs-git-lfs-pages-2026-07-28/).

That receipt records a completed 35-check installed-Chrome run, the accepted
captures and their SHA-256 hashes, the bounded pre-fix application-build
boundary, and owned-resource cleanup. It remains a local acceptance record
until the pushed SHA, Pages run, and live route are proved separately.
