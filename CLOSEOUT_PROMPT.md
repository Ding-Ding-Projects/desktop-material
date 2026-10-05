# Closeout prompt

Copy-ready continuation handoff for the current task on this repository. It
records state up to its own commit; it is not a completion claim.

```
Repository: Ding-Ding-Projects/desktop-material
Branch: codex/close-open-issues-20261005 (merged into main)
Date: 2026-10-05

Objective
- Close, fix and integrate every open issue that can be finished from a Linux
  cloud container; comment the exact blocker on the rest; merge the
  Dependabot pull requests whose checks are green and that GitHub reports
  mergeable.

Owner decisions (2026-10-05)
- Blocked issues stay open with their blocker commented; no partial slices.
- #223: delete the issue summarizer workflow instead of repairing it.
- The private feature name in the merge-all dialog becomes plain "Force
  cleanup"; git history is not rewritten.
- Dependabot: merge green and mergeable ones, comment the rest, never push to
  a Dependabot branch, revert on main if a merge breaks something.

Closed (fix on main, verified)
- #224 link previews: ae6f7bb. Open Graph and Twitter tags on the homepage,
  every pandoc docs page (per-page og:url) and the hub; pages.yml publishes
  /assets/social-preview.png with a byte-identical check;
  script/social-preview-test.mjs derives its page set (5/5, each guard
  mutation-checked); site-dc-pages-test allows absolute URLs in og: meta only.
  Verified live after Deploy Pages run 37374986486: all ten tags on the three
  page types, image HTTP 200, SHA-256 identical to the repository copy. The
  GitHub repository card image is an owner-only Settings upload (no API).
- #223 summarizer: 0df6022 deletes .github/workflows/summary.yml. No file
  under .github references actions/ai-inference; the two remaining
  issues:opened workflows only label. No live run observed yet (no issue was
  opened); the next new issue should show no summarizer run.
- #222 and #228 were already closed earlier in the session.

Merged Dependabot pull requests
- #243, #242, #237, #236, #235, #233, #232, #230 (main now 294531d).
- Local check on 294531d: both lockfiles install with --frozen-lockfile;
  tsc --noEmit clean; the terminal, popover, tga, declared-dependency and
  artifact-subject tests 32/33. The one failure (integrated-terminal-view
  "owns only tabs ...") expects a material-shell class that the source never
  renders, so it is independent of the bumps. eslint reports 306 errors, none
  from jsdoc or prettier rules. CI Linux passed on 294531d.
- Note: running yarn install with --ignore-scripts skips building
  vendor/desktop-notifications and makes tsc report missing modules; reinstall
  with scripts.

Not merged
- #244: Windows builds fail in the license dump because markdown-it 15.0.2
  pulls argparse@3.0.2 (PSF-2.0), and the branch now conflicts with main.
  Commented with both fixes (a license override, which is a maintainer
  decision, or holding markdown-it back).

Left open with the blocker commented
- #118, #119, #130, #133, #134, #212, #215: each needs Windows hosts, real
  identity providers, tracker accounts, or Windows captures of the built app.
- #240: code shipped in v4.0.131901; only the seven-sort-order clone dialog
  capture is missing (the Linux fixture cannot seed a multi-row clone list).

CI notes
- Cancelled jobs earlier today (arm64, supply chain, the issue-comment triage
  run) had runner_id 0 and no steps: no runner was assigned within the queue
  window. They are runner allocation failures, not code failures.

Next safe steps
1. Watch CI Windows on 294531d; if it is red, find the merge that caused it
   and revert that merge on main with a comment on its pull request.
2. Decide the argparse PSF-2.0 license override for #244.
3. On Windows: the captures for #134, #215 and #240.
4. Delete the merged remote branch codex/shortcuts-shift-f-explorer from a
   session the proxy allows to delete refs.
```
