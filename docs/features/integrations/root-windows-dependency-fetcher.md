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

Interactive `build.bat`, `build-installer.bat`, and `download-dependencies.bat`
preflight the current administrator role before touching dependency state. A
non-elevated interactive invocation requests one elevated child process and
propagates that child's exit code; cancelling the operating-system prompt is a
reported failure. `/s`, `--silent`, and `SILENT=1` deliberately skip that prompt,
print that the process is continuing without elevation, and rely on the
user-scoped installation paths or the upstream installer's own documented
privilege handling. No persistent execution-policy setting is changed: the
entrypoints use process-scoped `-ExecutionPolicy Bypass` only.

`build-installer.bat` does not call packaging until the runnable application has
been built. It then requires fresh, non-empty `GitHubDesktopSetup-<arch>.exe`,
`GitHubDesktopSetup-<arch>.msi`, `RELEASES`, and architecture-qualified full
`.nupkg` artifacts, verifies the Squirrel manifest's package hashes and sizes,
checks the setup and MSI signatures as `NotSigned`, and prints each artifact's
size, SHA-256, and source commit. The script never publishes, tags, or uploads.

`script/windows-dependency-manifest.json` 係版本、官方 HTTPS URL、Node archive
hash、package-manager arguments、signing 狀態同 scope 嘅唯一準則。上游容許嘅
情況下會用 user-scoped install root。Visual Studio installer 可能有自己嘅
elevation policy；script 唔會降低 Windows security settings，亦唔會收集
credentials、signing keys 或 secrets。

`download-dependencies.bat` 會叫 `script/build-windows.ps1 -Mode Prepare`，所以
build 同 installer 入口共用同一套 resolver 同 frozen-lockfile 邏輯。準備階段
唔會 build app、package installer、tag、publish 或 upload。任何失敗都會講明
phase 同 exact dependency，以 non-zero exit code 停止，唔會話半套 tree 已 ready。

互動式 `build.bat`、`build-installer.bat` 同 `download-dependencies.bat` 會先檢查
目前 administrator role，未提升權限就只會要求一次 elevated child process，並
原樣傳回 child exit code；取消系統提示會當成明確失敗。`/s`、`--silent` 同
`SILENT=1` 會刻意唔彈提示，印出未提升權限但繼續嘅狀態，交畀 user-scoped
安裝路徑或者上游 installer 自己嘅權限處理。唔會改永久 execution policy，入口
只用 process-scoped `-ExecutionPolicy Bypass`。

`build-installer.bat` 會先完成 runnable app，之後先 package。Packaging 完成後
一定要有新鮮、非空嘅 `GitHubDesktopSetup-<arch>.exe`、
`GitHubDesktopSetup-<arch>.msi`、`RELEASES` 同 architecture-qualified full
`.nupkg`，再驗證 Squirrel manifest 嘅 package hash 同 size、setup 同 MSI
係 `NotSigned`，並印出每件 artifact 嘅 size、SHA-256 同 source commit。Script
唔會 publish、tag 或 upload。

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
