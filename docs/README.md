# Desktop Material documentation

Desktop Material keeps the upstream
[GitHub Desktop](https://github.com/desktop/desktop) development documentation
while adding product, Material Design, acceptance, and publishing guidance for
this fork.

## Product and Material design

- **[Project overview](../README.md)** - shipped workflows and the compact
  screenshot gallery
- **[Desktop Material roadmap](../ROADMAP.md)** - completed milestones,
  current maintenance, and acceptance gates
- **[Feature and acceptance plan](../PLAN.md)** - implementation ledger,
  architecture contracts, and historical receipts
- **[Material redesign contract](../MATERIAL_REDESIGN.md)** - design system,
  customization scopes, adaptive app-bar behavior, and entry surfaces

The current customization work includes 12 active-profile appearance defaults
in local Git-backed history, six repository-local overrides with app-default
inheritance, and Word-style profile-backed per-tab typography with independent
text/background colors. The measured app bar moves Build & Run and then Commit
& Push into **More** before clipping and restores those mounted actions as space
returns. The pure Material Welcome and landing redesigns share the same token
and surface language.

The same maintenance release adds pinned/manual/one-shot tab arrangement,
preserves the original regex close action, and adds a guarded literal
close-everything-except match with live counts and preview. It also completes
exact workflow-run cancellation, reviewed current-branch rebase, and immediate
Provider Triage propagation of the repository account selected in settings;
aligns GitHub OAuth with the bounded feature scopes; and corrects compact-height
scrolling/reflow in Repository Tools, Remote Manager, and Regex Builder. These
items are implemented, but their integrated build, off-screen UI, `main`, CI,
Pages, and wiki receipts remain final acceptance work.

The intended acceptance captures are
[`material-welcome.png`](assets/screenshots/material-welcome.png),
[`material-customization.png`](assets/screenshots/material-customization.png),
and
[`material-toolbar-overflow.png`](assets/screenshots/material-toolbar-overflow.png).
Their presence here does not assert capture or publication evidence.

## Contributing

If you are interested in contributing to the project, you should read these
resources to get familiar with how things work:

- **[How Can I Contribute?](../.github/CONTRIBUTING.md#how-can-i-contribute)** -
  details about how you can participate
- **[Development Environment Setup](contributing/setup.md)** - everything
  you need to know to get Desktop up and running
- **[Engineering Values](contributing/engineering-values.md)** - our
  high-level engineering values
- **[Style Guide](contributing/styleguide.md)** - notes on the coding style
- **[Tooling](contributing/tooling.md)** - if you have a preferred IDE,
  there's some enhancements to make your life easier
- **[Troubleshooting](contributing/troubleshooting.md)** - some additional
  known issues if you're having environment issues

## Process

Details about how the team is organizing and shipping Desktop Material:

- **[Upstream historical roadmap](process/roadmap.md)** - shipped GitHub
  Desktop release themes inherited by the fork
- **[Release Planning](process/release-planning.md)** - how we plan and execute
  releases
- **[Issue Triage](process/issue-triage.md)** - how we address issues reported
  by users
- **[Pull Requests](process/pull-requests.md)** - how code contributions are
  submitted and reviewed
- **[Writing Release Notes](process/writing-release-notes.md)** - how
  user-facing changes are described for a release

## Technical

These documents contain more details about the internals of GitHub Desktop
and how things work:

- **[Dialogs](technical/dialogs.md)** - details about the dialog component API
- **[Windows menu bar](technical/windows-menu-bar.md)** - Electron doesn't
  provide inbuilt support for styling the menu for Windows, so we've created
  our own custom components to achieve this.
- **[Developer OAuth App](technical/oauth.md)** - GitHub Desktop ships with
  the ability to OAuth on behalf of a user. A developer OAuth app is bundled
  to reduce the friction of getting started.
- **[Building and Packaging Desktop](technical/packaging.md)** - outlines how
  Desktop is currently packaged for all platforms
- **[Automatic Git Proxy support](technical/proxies.md)** - a pre-launch
  overview and troubleshooting guide for Git automatic proxy support
