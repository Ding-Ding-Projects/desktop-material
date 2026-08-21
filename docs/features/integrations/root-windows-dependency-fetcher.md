# Root Windows dependency fetcher / 根目錄 Windows 依賴擷取器

The repository root now carries `download-dependencies.bat`, a one-click,
repeatable preparation path for a clean Windows checkout. It accepts `/s`,
`--silent`, or `SILENT=1`; silent preparation never prompts, opens a window,
or waits for input.

根目錄而家有 `download-dependencies.bat`，畀全新 Windows checkout 用一鍵、
可重覆嘅方式準備依賴。佢接受 `/s`、`--silent` 或者 `SILENT=1`；靜默模式唔會
問問題、開視窗或者等鍵盤輸入。

## What it prepares / 佢會準備啲乜

- Node.js `24.15.0`, selected for x64 or arm64 and verified against the
  checked-in SHA-256 manifest before extraction.
- The repository-vendored Yarn Classic `1.21.1` entrypoint.
- Visual Studio Build Tools 2022 with the C++ workload when the canonical
  `winget` package is available; the existing compiler and developer-command
  probes remain the post-install authority.
- The frozen root dependency tree through the repository's own Yarn
  post-install path, including native package outputs.

- Node.js `24.15.0`，按 x64 或 arm64 揀選，解壓之前會對照已提交嘅 SHA-256
  manifest 驗證。
- 儲存庫內置嘅 Yarn Classic `1.21.1` 入口。
- 如果有官方 `winget` package，就準備 Visual Studio Build Tools 2022 同 C++
  workload；安裝完成之後仍然由現有 compiler 同 developer-command probes 作準。
- 用儲存庫自己嘅 Yarn post-install 路徑準備 frozen root dependency tree，包含
  native package outputs。

## Safety and failure boundaries / 安全同失敗界線

The manifest at `script/windows-dependency-manifest.json` is the source of
truth for versions, canonical HTTPS URLs, Node archive hashes, package-manager
arguments, signing state, and scope. Install roots are user-scoped where the
upstream installer supports that choice. The Visual Studio installer may apply
its own elevation policy; the script does not weaken Windows security settings
or collect credentials, signing keys, or secrets.

`download-dependencies.bat` calls `script/build-windows.ps1 -Mode Prepare`, so
the build and installer entrypoints share the same resolver and frozen-lockfile
logic. Preparation does not build the application, package an installer, tag,
publish, or upload anything. A failure names the phase and exact dependency;
the script stops with a non-zero exit code and never claims a partial tree is
ready.

`script/windows-dependency-manifest.json` 係版本、官方 HTTPS URL、Node archive
hash、package-manager arguments、signing 狀態同 scope 嘅唯一準則。上游容許嘅
情況下會用 user-scoped install root。Visual Studio installer 可能有自己嘅
elevation policy；script 唔會降低 Windows security settings，亦唔會收集
credentials、signing keys 或 secrets。

`download-dependencies.bat` 會叫 `script/build-windows.ps1 -Mode Prepare`，所以
build 同 installer 入口共用同一套 resolver 同 frozen-lockfile 邏輯。準備階段
唔會 build app、package installer、tag、publish 或 upload。任何失敗都會講明
phase 同 exact dependency，以 non-zero exit code 停止，唔會話半套 tree 已 ready。

## Verification / 驗證

This lane adds the scripts and contracts only. Tests, lint, type checks, builds,
downloads, installation, desktop interaction, and captures were intentionally
not run here. A later verification lane must execute both warm and cold-cache
paths, confirm the archive hashes, and exercise `/s` without a prompt.

呢條 lane 只加 scripts 同 contracts。Tests、lint、type checks、builds、downloads、
installation、desktop interaction 同 captures 今次刻意冇行。之後嘅 verification
lane 要行 warm 同 cold-cache paths、確認 archive hashes，同埋用 `/s` 真係試一次
完全唔提示嘅路徑。

## Suggested articles / 建議文章

- [Windows-only graphical edition support](windows-only-platform-support.md)
- [Self-hosted Windows dependency bootstrap](self-hosted-windows-dependency-bootstrap.md)
- [Automated update build status and release notes](automated-updates-and-release-notes.md)
