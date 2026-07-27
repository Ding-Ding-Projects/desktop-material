**Overview** · [Install](docs/readme-tabs/install.md) · [Features](docs/readme-tabs/features.md) · [Complete list](docs/readme-tabs/complete-feature-list.md) · [Screenshots](docs/readme-tabs/screenshots.md) · [Roadmap & receipts](docs/readme-tabs/roadmap-and-receipts.md) · [Development](docs/readme-tabs/development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Desktop Material

Desktop Material is an independent Material Design 3 (M3 Expressive) remake of [GitHub Desktop](https://github.com/desktop/desktop). It rebuilds the entire application shell around Material Design 3 while keeping GitHub Desktop's full Git workflow and the same underlying stack: [TypeScript](https://www.typescriptlang.org), [React](https://react.dev), [Electron](https://www.electronjs.org), and [Sass](https://sass-lang.com). This project is in active development.

> **Platform support:** the graphical Electron edition remains Windows-only:
> Windows x64 is its installer and portable-ZIP target, with Windows x64/arm64
> builds and packaged Windows x64 E2E. A separate
> [Linux-first terminal edition](docs/features/linux-tui/README.md) now provides
> mouse, keyboard, and real text-field workflows as a Python package. It is not
> a Linux build of the Electron application.

<img
  width="1072"
  src="docs/assets/screenshots/material-app-identity-workspace.png"
  alt="Desktop Material workspace with a profile-customized app name and logo, a favorite repository tab, the Material navigation rail, and the Changes view"
/>

![CI](https://github.com/Ding-Ding-Projects/desktop-material/actions/workflows/ci.yml/badge.svg?branch=main)

## Install on Windows

Desktop Material's automated releases provide a per-user x64 Windows installer.
Run this one line in Windows PowerShell 5.1 or PowerShell 7; it does not require
an administrator shell:

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

See the [Install tab](docs/readme-tabs/install.md) for asset verification, manual
downloads, and updater behavior.

## Run the Linux-first TUI

Install the trusted checkout as an isolated tool, then launch a repository with
the literal `github` command:

```bash
uv tool install ./tui
github /path/to/repository
```

`github`, `dmt`, and `desktop-material-tui` are identical launchers for this
terminal edition. This alias does not replace GitHub CLI's `gh`. If another
program or shell alias already owns `github`, use `dmt` or
`desktop-material-tui` instead. Noninteractive discovery and status work too:

```bash
github --help
github status --json
```

For development, run the locked project directly:

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

It supports mouse clicks, keyboard focus, editable single-line and multiline
text controls, local Git workflows, GitHub workflows through `gh`, shared RE2
search, localization, notifications, and XDG persistence. It does **not** yet
claim all 198 graphical-edition capabilities; see the generated
[parity contract](tui/contracts/parity.yaml) and
[TUI documentation](docs/features/linux-tui/README.md).

A minimal non-root Docker image is also available; the
[container guide](docs/features/linux-tui/container.md) includes copy-paste
build and interactive run commands with repository and XDG persistence mounts.

<img
  width="1072"
  src="docs/assets/screenshots/linux-tui-overview.png"
  alt="Desktop Material TUI running Changes in an off-screen Linux terminal"
/>

## Explore the tabs

- **[Install](docs/readme-tabs/install.md)** — Windows installer and Linux TUI source/package routes
- **[Features](docs/readme-tabs/features.md)** — the full Material Design 3 shell plus every Git and GitHub workflow
- **[Complete list](docs/readme-tabs/complete-feature-list.md)** — every feature in one bilingual table, labelled Added / Extended / Inherited against GitHub Desktop
- **[Screenshots](docs/readme-tabs/screenshots.md)** — the annotated capture gallery
- **[Roadmap & receipts](docs/readme-tabs/roadmap-and-receipts.md)** — milestone status and published CI/release evidence
- **[Development](docs/readme-tabs/development.md)** — build Desktop Material from source

## Project site & docs

- Project site: https://ding-ding-projects.github.io/desktop-material/
- Wiki: https://github.com/Ding-Ding-Projects/desktop-material/wiki

## Credits & License

Desktop Material is built on [GitHub Desktop](https://github.com/desktop/desktop) (MIT), with feature-parity references from [desktop-plus](https://github.com/desktop-plus/desktop-plus) (MIT). Thanks to both projects and their contributors.

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo designs. GitHub reserves all trademark and copyright rights in and to all GitHub trademarks. GitHub's logos include, for instance, the stylized Invertocat designs that include "logo" in the file title in the following folder: [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's Trademarks or registered Trademarks. When using GitHub's logos, be sure to follow the GitHub [logo guidelines](https://github.com/logos).
