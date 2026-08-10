[Overview](../../README.md) · **Install** · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · [Roadmap & receipts](roadmap-and-receipts.md) · [Development](development.md)

[總覽](../../README.md) · **安裝** · [功能](features.md) · [完整清單](complete-feature-list.md) · [截圖](screenshots.md) · [路線圖同憑證](roadmap-and-receipts.md) · [開發](development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

<sub>分頁式 README — GitHub 唔行得 script，所以上面每個分頁都係獨立一版。</sub>

# Supported platform / 支援平台

Desktop Material ships as a Windows desktop application and as a Linux-first
terminal application. The terminal package keeps the clickable Git and GitHub
workflows, repository tabs, file browser, responsive layout, and terminal-safe
counterparts of desktop features without requiring a graphical desktop.

Desktop Material 出兩個形態：一個 Windows 桌面應用程式，同一個 Linux 優先嘅終端機應用程式。終端機套件保留可點擊嘅 Git 同 GitHub 工作流程、儲存庫分頁、檔案瀏覽器、響應式版面，同桌面功能喺終端機上安全嘅對應版本，唔需要圖形桌面。

# Install the Linux TUI on a fresh machine / 喺全新機安裝 Linux TUI

Paste the following single command into a fresh glibc-based Linux installation.
It detects `apt-get`, `dnf5`, `dnf`, `yum`, `zypper`, or `pacman`; obtains root
through `sudo` or `doas` only for native packages; installs HTTPS certificates
and `curl` when missing; and then runs the bounded release bootstrap. The
bootstrap installs Git, SSH, terminal/editor helpers, a pinned user-owned Python
runtime, `uv`, GitHub CLI's `gh`, and Desktop Material TUI. It also adds the
user bin directory to supported shell startup files so `github`, `dmt`, `gh`,
and `desktop-material-tui` are on `PATH` in the next shell.

將以下單一命令貼入一個全新嘅 glibc Linux 安裝。佢會偵測 `apt-get`、`dnf5`、`dnf`、`yum`、`zypper` 或者 `pacman`；淨係為原生套件經 `sudo` 或者 `doas` 攞 root；缺少嗰陣會安裝 HTTPS 憑證同 `curl`；然後行有界嘅發佈啟動程序。啟動程序會安裝 Git、SSH、終端機／編輯器輔助工具、一個釘住版本、用戶擁有嘅 Python 執行環境、`uv`、GitHub CLI 嘅 `gh`，同 Desktop Material TUI。佢亦都會將用戶 bin 目錄加入支援嘅 shell 啟動檔案，等下一個 shell 入面 `github`、`dmt`、`gh` 同 `desktop-material-tui` 都喺 `PATH`。

<!-- markdownlint-disable MD013 MD046 -->

```bash
sh -c 'set -eu; if ! command -v curl >/dev/null 2>&1; then p=; for x in apt-get dnf5 dnf yum zypper pacman; do if command -v "$x" >/dev/null 2>&1; then p=$x; break; fi; done; [ -n "$p" ] || { echo "No supported package manager was found." >&2; exit 1; }; s=; if [ "$(id -u)" != 0 ]; then if command -v sudo >/dev/null 2>&1; then s=sudo; elif command -v doas >/dev/null 2>&1; then s=doas; else echo "Installing curl requires root, sudo, or doas." >&2; exit 1; fi; fi; case "$p" in apt-get) $s env DEBIAN_FRONTEND=noninteractive apt-get -qq update; $s env DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends ca-certificates curl;; dnf5|dnf|yum) $s "$p" install -y ca-certificates curl;; zypper) $s zypper --non-interactive refresh; $s zypper --non-interactive install --no-recommends ca-certificates curl;; pacman) $s pacman -Syu --needed --noconfirm ca-certificates curl;; esac; fi; f=$(mktemp /tmp/desktop-material-tui-bootstrap.XXXXXX); trap "rm -f -- $f" EXIT HUP INT TERM; curl --proto =https --proto-redir =https --tlsv1.2 --fail --silent --show-error --location --output "$f" https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/bootstrap-linux-tui.sh; n=$(wc -c <"$f" | tr -d "[:space:]"); case "$n" in ""|*[!0-9]*) echo "Downloaded bootstrap size is invalid." >&2; exit 1;; esac; [ "$n" -le 1048576 ] && [ "$(sed -n 1p "$f")" = "#!/bin/sh" ] || { echo "Downloaded bootstrap failed validation." >&2; exit 1; }; sh "$f"'
```

The command is idempotent: running it again reuses verified matching tools and
refreshes the managed TUI installation. It never overwrites an unrelated
executable that already occupies one of its owned paths. ARM64 and x86-64 are
supported on GNU libc; musl distributions are rejected with an explicit
compatibility explanation because the required RE2 wheel is unavailable.

呢條命令係冪等嘅：再行一次會重用已驗證、相符嘅工具，並且刷新受管理嘅 TUI 安裝。佢永遠唔會覆寫一個已經佔住佢自己路徑嘅無關執行檔。GNU libc 上支援 ARM64 同 x86-64；musl 發行版會被拒絕，並附明確嘅相容性解釋，因為需要嘅 RE2 wheel 唔存在。

For an already-provisioned machine with `curl`, the shorter release bootstrap
is equivalent:

如果部機已經有 `curl`，用較短嘅發佈啟動程序效果一樣：

```bash
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/bootstrap-linux-tui.sh | sh
```

<!-- markdownlint-enable MD013 MD046 -->

Close and reopen the terminal afterward, then run `github` from inside a
repository or `github /path/to/repository`. The Open and Clone flows initially
select the process's current working directory, while their folder browser lets
you choose another destination without typing a path.

之後閂咗個終端機再開，然後喺一個儲存庫入面行 `github`，或者行 `github /path/to/repository`。Open 同 Clone 流程一開始會揀行程嘅目前工作目錄，而佢哋嘅資料夾瀏覽器可以唔使打路徑就揀第二個目的地。

`github`, `dmt`, and `desktop-material-tui` are identical launchers for the
terminal edition; the alias does not replace GitHub CLI's `gh`. If another
program or shell alias already owns `github`, use either longer name. Useful
noninteractive commands are:

`github`、`dmt` 同 `desktop-material-tui` 係終端機版本完全相同嘅啟動器；呢個別名唔會取代 GitHub CLI 嘅 `gh`。如果另一個程式或者 shell 別名已經佔咗 `github`，就用其中一個較長嘅名。有用嘅非互動命令：

```bash
github --help
github status --json
github push --dry-run
github pull --ff-only
github git status --short
```

Open/Create includes a clickable folder browser and safe quoted-path paste.
`github push` and `github pull` add Cheap LFS preflight/materialization, while
`github git …` preserves other native Git arguments without a shell. The
[Linux TUI guide](../features/linux-tui/README.md) links the detailed browser
and wrapper contracts.

Open／Create 有可點擊嘅資料夾瀏覽器同安全嘅引號路徑貼上。`github push` 同 `github pull` 加入 Cheap LFS 預檢／實體化，而 `github git …` 會唔經 shell 保留其他原生 Git 參數。[Linux TUI 指南](../features/linux-tui/README.md) 連去詳細嘅瀏覽器同 wrapper 契約。

`pipx install ./tui` is the corresponding isolated install route. The package
supports Python 3.10–3.13 and requires Git; provider surfaces also require an
authenticated `gh`. Contributors can instead use the locked project:

`pipx install ./tui` 係對應嘅隔離安裝路線。套件支援 Python 3.10–3.13 並且需要 Git；供應方介面另外需要一個已驗證嘅 `gh`。貢獻者可以改用鎖定嘅項目：

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

The release workflow builds a wheel and source distribution, derives a locked
runtime constraint file, installs the published payload in a clean Debian
container twice, and verifies all four launch commands before publication. The
[Linux TUI guide](../features/linux-tui/README.md) documents XDG persistence,
security boundaries, mouse and keyboard interaction, the file browser, Git
workflows, GitHub surfaces, and parity status. A tracked non-root image remains
available through the [container instructions](../features/linux-tui/container.md).

發佈工作流程會建置 wheel 同原始碼發行版、推導一個鎖定嘅執行期約束檔案、喺乾淨嘅 Debian 容器安裝已發佈負載兩次，並且喺發佈之前驗證全部四條啟動命令。[Linux TUI 指南](../features/linux-tui/README.md) 記錄 XDG 持久化、保安界線、滑鼠同鍵盤互動、檔案瀏覽器、Git 工作流程、GitHub 介面同對等狀態。一個受追蹤嘅非 root 映像仍然經 [容器說明](../features/linux-tui/container.md) 提供。

# Install on Windows / Windows 安裝

Desktop Material's automated releases provide a per-user x64 Windows installer.
The Windows package command also creates `dist/GitHub Desktop-x64.zip`, and the
gated release workflow requires that portable archive beside the installer
assets. A successful main CI run enters packaging directly; a manual express
dispatch runs lint, Windows x64 trampoline/unit/script tests, and packaging in
parallel. The packaging
job preserves the complete payload as a short-lived Actions artifact before
attempting its create-only GitHub Release, so installers remain available when
publication alone fails. Run this one line in Windows PowerShell 5.1 or
PowerShell 7; it does not require an administrator shell:

Desktop Material 嘅自動發佈提供每用戶嘅 x64 Windows 安裝程式。Windows 打包命令亦都會整 `dist/GitHub Desktop-x64.zip`，而受把關嘅發佈工作流程要求呢個可攜封存檔同安裝程式資產一齊存在。main CI 成功之後會直接入打包階段；手動 express 派送就會並行行 lint、Windows x64 trampoline／單元／script 測試同打包。打包工作會喺嘗試佢「只建立」嘅 GitHub Release 之前，將完整負載保留成短期 Actions 產物，所以就算淨係發佈失敗，安裝程式一樣攞得到。喺 Windows PowerShell 5.1 或者 PowerShell 7 行呢一行就得，唔使管理員 shell：

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

The [tracked installer script](../../script/install-windows.ps1) asks GitHub for this
exact repository's latest stable installer release, accepts only the installer
for the native architecture, verifies its release-asset size and GitHub SHA-256 digest,
checks any Authenticode signature, runs the Squirrel installer silently with
`--silent`, verifies the installed postcondition, and removes its controlled
temporary directory. Windows releases are permanently unsigned: packaging and
publication require the setup executable and MSI to report `NotSigned`, and the
release notes disclose that Windows may show SmartScreen or an unknown-publisher
warning. The script reports the unsigned status and stops on ARM64 until an
ARM64 asset is available. Review the script before running any remote command,
or use the
[latest release page](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest)
for a manual installer or portable-ZIP download. Extract the ZIP before running
the packaged executable. The focused archive/workflow contract is green; a
published baseline already contains the required installer, feed, and portable
ZIP assets. The updater-migration Releases additionally verify the complete
installer, feed, NuGet, MSI, and portable-ZIP payload on exact source
`04246fdf12`.

[受追蹤嘅安裝程式 script](../../script/install-windows.ps1) 會向 GitHub 攞呢個儲存庫最新嘅穩定安裝程式發佈，淨係接受原生架構嘅安裝程式，驗證佢嘅 release 資產大小同 GitHub SHA-256 摘要，檢查任何 Authenticode 簽章，用 `--silent` 靜默行 Squirrel 安裝程式，驗證安裝後嘅後置條件，然後移除佢受控嘅暫存目錄。Windows 發佈永久未簽署：打包同發佈都要求 setup 執行檔同 MSI 報告 `NotSigned`，而發佈說明會披露 Windows 可能顯示 SmartScreen 或者未知發佈者警告。Script 會報告未簽署狀態，並且喺 ARM64 上停低，直到有 ARM64 資產為止。行任何遠端命令之前請先覆核個 script，或者去 [最新發佈頁](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest) 手動下載安裝程式或者可攜 ZIP。行打包好嘅執行檔之前要先解壓個 ZIP。

## Unattended current-user operations / 無人值守嘅目前用戶操作

The one-line command above performs the default `Install` operation. For an
explicit install, update, or uninstall, load the reviewed script as a script
block and pass the operation:

上面嗰條單行命令行嘅係預設 `Install` 操作。如果要明確安裝、更新或者解除安裝，就將已覆核嘅 script 當 script block 載入，再傳操作：

```powershell
$installer = [scriptblock]::Create((Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1'))
& $installer -Operation Install -InstallScope CurrentUser
& $installer -Operation Update -InstallScope CurrentUser
& $installer -Operation Uninstall -InstallScope CurrentUser
```

`Install` may refresh an existing complete installation; `Update` requires one;
and `Uninstall` succeeds without changing anything when Desktop Material is
already absent. Install uses the downloaded, digest-verified setup asset with
`--silent`. Update validates the native release asset and invokes the installed
updater against the immutable tag-specific feed with `--update=<url> --silent`,
so it preserves Squirrel's update semantics instead of doing a full reinstall.
Uninstall uses only the installed
`%LOCALAPPDATA%\GitHubDesktop\Update.exe` with `--uninstall --silent`.

`Install` 可能會刷新一個現有嘅完整安裝；`Update` 需要有一個；而 Desktop Material 已經唔喺度嗰陣，`Uninstall` 會成功而且乜都唔改。Install 用已下載、摘要已驗證嘅 setup 資產配 `--silent`。Update 會驗證原生 release 資產，然後用已安裝嘅更新器針對不可變、綁 tag 嘅來源行 `--update=<url> --silent`，保留 Squirrel 嘅更新語意而唔係做完整重裝。Uninstall 淨係用已安裝嘅 `%LOCALAPPDATA%\GitHubDesktop\Update.exe` 配 `--uninstall --silent`。

`CurrentUser` is the only supported application scope. Squirrel's MSI is a
machine deployment bootstrapper that schedules a per-user setup at logon, not
an all-users application directory, so this script deliberately rejects
`AllUsers` instead of implying a scope the package does not provide. Mutating
operations also reject an elevated token before Squirrel can surface its
unsupported-elevation error; use a normal, non-administrator PowerShell. The
install path also preflights Squirrel's .NET Framework 4.5 minimum rather than
opening a framework installer or reboot prompt in unattended mode.

`CurrentUser` 係唯一支援嘅應用程式範圍。Squirrel 嘅 MSI 係一個機器部署啟動器，佢喺登入時安排逐用戶安裝，唔係一個全用戶應用程式目錄，所以呢個 script 刻意拒絕 `AllUsers`，唔會暗示一個套件根本冇提供嘅範圍。變更性操作亦都會喺 Squirrel 顯示「唔支援提權」錯誤之前拒絕提權 token；請用普通、非管理員嘅 PowerShell。安裝路徑亦都會預檢 Squirrel 要求嘅 .NET Framework 4.5 最低版本，而唔係喺無人值守模式下彈框架安裝程式或者重開機提示。

The script never force-closes the app. A running installed process or a partial
installation fails before mutation with a recovery instruction. Squirrel runs
hidden and must exit zero within 15 minutes; the expected installed or
removed postcondition must then appear within one minute. The returned receipt
records the operation, scope, child exit code, installation root, and resulting
executable path. Use `-ResolveOnly` to inspect the exact executable and argument
list without downloading or changing anything.

個 script 永遠唔會強制關閉個 app。如果有執行緊嘅已安裝行程，或者安裝唔完整，佢會喺改動之前失敗，並附復原指示。Squirrel 隱藏執行，必須喺 15 分鐘內以零離開；之後預期嘅已安裝或者已移除後置條件要喺一分鐘內出現。回傳嘅收據記錄操作、範圍、子行程離開碼、安裝根目錄同結果執行檔路徑。用 `-ResolveOnly` 可以喺唔下載、唔改動任何嘢嘅情況下檢視精確嘅執行檔同參數清單。

## Build and run from source / 由原始碼建置同執行

The same script can build Desktop Material from source instead of downloading a
release — a first-class path for contributors, air-gapped mirrors, or trying an
unreleased branch. Pass `-FromSource`:

同一個 script 亦都可以由原始碼建置 Desktop Material，而唔係下載發佈 — 對貢獻者、離線鏡像或者想試未發佈分支嘅人嚟講，呢個係一等公民路線。加 `-FromSource`：

```powershell
& ([scriptblock]::Create((Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1'))) -FromSource
```

or, from a local checkout of the script:

或者，喺本機 checkout 嘅 script：

```powershell
./script/install-windows.ps1 -FromSource
```

The from-source path detects its prerequisites — **git**, **Node.js** (the
version pinned in `.node-version`), and **Yarn** (`corepack enable` provides it)
— and stops with a per-tool install hint when any is missing. It then
shallow-clones the repository into `<Documents>\desktop-material-source` (override
with `-SourceDirectory`), checks out `main` (override with `-SourceRef`), runs
`yarn install` and `yarn build:prod`, and launches the freshly built
`dist\GitHubDesktop-win32-<arch>\GitHubDesktop.exe`. Re-runs are idempotent: an
existing checkout is fast-forwarded with a shallow fetch and hard reset to the
chosen ref rather than re-cloned, and a non-empty directory that is not that
checkout is refused rather than overwritten. Every step prints its own progress
line and fails with the exact command and exit code.

由原始碼建置嘅路徑會偵測前置條件 — **git**、**Node.js**（`.node-version` 釘住嗰個版本）同 **Yarn**（`corepack enable` 提供）— 缺邊個就停低並俾番對應嘅安裝提示。之後佢會將儲存庫淺 clone 落 `<Documents>\desktop-material-source`（可以用 `-SourceDirectory` 覆寫），checkout `main`（可以用 `-SourceRef` 覆寫），行 `yarn install` 同 `yarn build:prod`，然後啟動啱啱建好嘅 `dist\GitHubDesktop-win32-<arch>\GitHubDesktop.exe`。重覆執行係冪等嘅：現有 checkout 會用淺 fetch 同 hard reset 快進到揀咗嘅 ref，而唔係重新 clone；一個唔係嗰個 checkout 嘅非空目錄會被拒絕而唔會被覆寫。每一步都會印自己嘅進度行，失敗嗰陣會顯示精確命令同離開碼。

Add `-DryRun` to `-FromSource` to print the resolved build plan — prerequisites,
the clone-versus-update decision, the ordered steps, and the launch path —
without cloning, building, or launching anything. That same pure decision logic
is covered by [`script/install-windows-test.ps1`](../../script/install-windows-test.ps1).
Building from source is unsigned and unversioned against the release feed, so the
Squirrel auto-updater does not manage a from-source build; re-run `-FromSource`
to update it.

喺 `-FromSource` 加 `-DryRun` 就會印出已解析嘅建置計劃 — 前置條件、clone 定更新嘅決定、有次序嘅步驟同啟動路徑 — 而唔會 clone、建置或者啟動任何嘢。同一套純決策邏輯由 [`script/install-windows-test.ps1`](../../script/install-windows-test.ps1) 覆蓋。由原始碼建置係未簽署，亦都唔會對住發佈來源計版本，所以 Squirrel 自動更新器唔會管理由原始碼建置嘅版本；想更新就再行一次 `-FromSource`。

When GitHub Actions is actively building or packaging a newer exact commit but
has not yet published its Release, the About updater reports **New update coming
soon** in the selected English, playful Hong Kong Cantonese, or bilingual mode.
The state is transient and fails closed; normal Squirrel update behavior resumes
on the next check after publication. Automated Release notes list bounded,
sanitized commit subjects from the previous installer release through the exact
release SHA. CI, installer, and Pages runs use unique groups so a newer
invocation never cancels or replaces older running or pending work. See
[Automated update build status and release
notes](../features/integrations/automated-updates-and-release-notes.md).


當 GitHub Actions 正在建置或者打包一個更新嘅精確 commit，但係仲未發佈佢個 Release 嗰陣，About 更新器會用揀咗嘅英文、活潑香港廣東話或者雙語模式報告 **New update coming soon**。呢個狀態係短暫嘅，並且 fail closed；發佈之後下次檢查就會回復正常 Squirrel 更新行為。自動發佈說明會列出由上一個安裝程式發佈到精確發佈 SHA 之間、有界並且消毒過嘅 commit 標題。CI、安裝程式同 Pages 執行用獨立群組，所以較新嘅呼叫永遠唔會取消或者取代仲行緊或者等緊嘅工作。睇 [自動更新建置狀態同發佈說明](../features/integrations/automated-updates-and-release-notes.md)。