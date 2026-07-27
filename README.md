**Overview** · [Install](docs/readme-tabs/install.md) · [Features](docs/readme-tabs/features.md) · [Complete list](docs/readme-tabs/complete-feature-list.md) · [Screenshots](docs/readme-tabs/screenshots.md) · [Roadmap & receipts](docs/readme-tabs/roadmap-and-receipts.md) · [Development](docs/readme-tabs/development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Desktop Material

Desktop Material is an independent Material Design 3 (M3 Expressive) remake of [GitHub Desktop](https://github.com/desktop/desktop). It rebuilds the entire application shell around Material Design 3 while keeping GitHub Desktop's full Git workflow and the same underlying stack: [TypeScript](https://www.typescriptlang.org), [React](https://react.dev), [Electron](https://www.electronjs.org), and [Sass](https://sass-lang.com). This project is in active development.

> **Platform support:** Desktop Material is a Windows-only application. Windows
> x64 is the installer and portable-ZIP target; Windows x64/arm64 builds and
> Windows packaged E2E are the supported CI gates. macOS and Linux application
> packages are not produced or supported.

<img
  width="1072"
  src="docs/assets/screenshots/material-app-identity-workspace.png"
  alt="Desktop Material workspace with a profile-customized app name and logo, a favorite repository tab, the Material navigation rail, and the Changes view"
/>

![CI](https://github.com/Ding-Ding-Projects/desktop-material/actions/workflows/ci.yml/badge.svg?branch=main)

> **Locally accepted source — July 27, 2026:** Cheap LFS Release restores now
> open one bounded look-ahead lane at the exact 90% download point and expose
> detailed overall/file/part progress. Browser-bound links can also use a
> secure app-hosted tabbed browser with an explicit system-browser escape.
> Private repositories now keep a separate lock badge even when their leading
> repository glyph is a fork or custom logo. The combined 53-file suite passed
> **652/652**, verifier contracts passed **14/14**, TypeScript is clean, the
> exact Windows production build completed successfully, and the real built
> app passed isolated off-screen English/bilingual interaction and privacy
> inspection. Default-branch merge and push, remote CI, Pages/wiki publication,
> packaged E2E, and installer/Release evidence remain pending. See
> [Release-backed Cheap LFS](docs/features/repository-management/release-backed-cheap-lfs.md)
> the [app-hosted browser](docs/features/integrations/app-hosted-browser.md),
> and the [private-repository lock badge](docs/features/repository-management/private-repository-lock-badge.md).

![Detailed Cheap LFS restore progress with the current transfer at exactly 90% and the next transfer already active](docs/assets/screenshots/cheap-lfs-restore-lookahead.png)

![App-hosted browser showing redirect, popup, new-tab, bookmark, and private authentication behavior](docs/assets/screenshots/app-hosted-browser-authentication.png)

![Repository picker showing the separate lock badge for explicit private metadata](docs/assets/screenshots/private-repository-lock-badge.png)

## Install on Windows

Desktop Material's automated releases provide a per-user x64 Windows installer.
Run this one line in Windows PowerShell 5.1 or PowerShell 7; it does not require
an administrator shell:

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

See the [Install tab](docs/readme-tabs/install.md) for asset verification, manual
downloads, and updater behavior.

## Explore the tabs

- **[Install](docs/readme-tabs/install.md)** — Windows installer one-liner, script verification, manual downloads, and updater behavior
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
