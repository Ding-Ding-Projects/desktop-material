# Installing Desktop Material / 安裝 Desktop Material

Desktop Material has two distinct runtime surfaces. The graphical Electron
edition is supported on Windows only and publishes Windows x64 installers plus
a Squirrel update feed. The new Python/Textual terminal edition targets Linux;
it builds a wheel and source distribution and does not claim to be a Linux
Electron package.

Desktop Material 有兩個唔同嘅執行介面。圖形 Electron 版本淨係支援 Windows，發佈 Windows x64 安裝程式同一個 Squirrel 更新來源。新嘅 Python／Textual 終端機版本針對 Linux；佢建置 wheel 同原始碼發行版，並冇聲稱自己係 Linux Electron 套件。

## Linux terminal edition / Linux 終端機版本

Install Python 3.10–3.13, Git, and [uv](https://docs.astral.sh/uv/), then run
the following from the trusted parent directory where the checkout should be
created:

裝好 Python 3.10–3.13、Git 同 [uv](https://docs.astral.sh/uv/)，然後喺你想放 checkout 嘅受信任上層資料夾行以下命令：

One-line Linux shell installation from a fresh parent directory:

喺全新上層資料夾用一行 Linux shell 安裝：

<!-- markdownlint-disable MD013 -->

```bash
git clone https://github.com/Ding-Ding-Projects/desktop-material.git && cd desktop-material && uv tool install ./tui && uv tool update-shell
```

One-line Windows PowerShell installation from a fresh parent directory:

喺全新上層資料夾用一行 Windows PowerShell 安裝：

```powershell
git clone https://github.com/Ding-Ding-Projects/desktop-material.git; if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }; Set-Location .\desktop-material; uv tool install .\tui; if ($LASTEXITCODE -ne 0) { throw 'uv tool install failed' }; uv tool update-shell
```

<!-- markdownlint-enable MD013 -->

Close and reopen the terminal afterward so the updated `PATH` is loaded, then
run `github /path/to/repository` on Linux or
`github C:\path\to\repository` on Windows. The fully interactive acceptance
target remains Linux-first; the Windows Terminal launch path and cross-platform
core are also tested.

之後閂咗個終端機再開，等更新咗嘅 `PATH` 載入，然後喺 Linux 行 `github /path/to/repository`，喺 Windows 行 `github C:\path\to\repository`。完全互動嘅接受目標仍然係 Linux 優先；Windows Terminal 啟動路徑同跨平台核心亦都測試過。

The installed `github`, `dmt`, and `desktop-material-tui` commands are
identical TUI launchers. The literal alias does not replace GitHub CLI's `gh`.
If `github` already names another command or shell alias, use `dmt` or
`desktop-material-tui` instead. From a repository, inspect the launcher and
machine-readable status with:

裝好嘅 `github`、`dmt` 同 `desktop-material-tui` 係完全相同嘅 TUI 啟動器。呢個字面別名唔會取代 GitHub CLI 嘅 `gh`。如果 `github` 已經係另一個命令或者 shell 別名，就用 `dmt` 或者 `desktop-material-tui`。喺一個儲存庫入面，可以咁樣檢視啟動器同機器可讀狀態：

```bash
github --help
github status --json
```

Cheap-LFS-aware native Git forms are available immediately after installation:

安裝完之後即刻可以用感知 Cheap LFS 嘅原生 Git 形式：

```bash
github push --dry-run
github push origin main
github pull --ff-only
github git status --short
```

See the [Git wrapper contract](features/linux-tui/cheap-lfs-git-wrapper.md) for
preflight, restore, exit-code, and non-overwrite behavior.

預檢、還原、離開碼同唔覆寫嘅行為，睇 [Git wrapper 契約](features/linux-tui/cheap-lfs-git-wrapper.md)。

The locked contributor route remains:

鎖定嘅貢獻者路線仍然係：

```bash
cd tui
uv sync --locked --extra dev
uv run desktop-material-tui
```

`pipx install ./tui` is the corresponding isolated install route. GitHub
surfaces additionally require an installed and authenticated `gh` CLI.

`pipx install ./tui` 係對應嘅隔離安裝路線。GitHub 相關介面另外需要一個已安裝並已驗證嘅 `gh` CLI。

CI builds `desktop_material_tui-0.1.0-py3-none-any.whl` and the corresponding
source distribution as a short-lived workflow artifact. No immutable Linux
Release asset is claimed until one is actually published. See the complete
[Linux TUI installation and packaging
guide](features/linux-tui/install-and-packaging.md).

CI 會建置 `desktop_material_tui-0.1.0-py3-none-any.whl` 同對應嘅原始碼發行版，做成短期嘅工作流程產物。喺真係發佈之前，唔會聲稱有任何不可變嘅 Linux Release 資產。睇完整嘅 [Linux TUI 安裝同打包指南](features/linux-tui/install-and-packaging.md)。

For an isolated container installation, build the local wheel into the
non-root image:

如果要隔離嘅容器安裝，將本機 wheel 建入非 root 映像：

```bash
docker build \
  --build-arg APP_UID="$(id -u)" \
  --build-arg APP_GID="$(id -g)" \
  --tag desktop-material-tui:local \
  ./tui
```

The complete [container guide](features/linux-tui/container.md) provides the
copy-paste interactive `docker run --rm -it` command, current-repository bind
mount, and persistent XDG config/data/state/cache volumes.

完整嘅 [容器指南](features/linux-tui/container.md) 提供可以直接複製貼上嘅互動式 `docker run --rm -it` 命令、目前儲存庫嘅 bind mount，同持久嘅 XDG config／data／state／cache volume。

## Windows / Windows

From Windows PowerShell 5.1 or PowerShell 7, the verified current-user install
is:

喺 Windows PowerShell 5.1 或者 PowerShell 7，已驗證嘅目前用戶安裝係：

```powershell
Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1' | Microsoft.PowerShell.Utility\Invoke-Expression
```

The tracked script resolves this repository's latest release, verifies the
published GitHub SHA-256 asset digest and any Authenticode signature, installs
for the current user, and removes its temporary download. Current builds are
unsigned, which the script reports after digest verification.

呢個受追蹤嘅 script 會解析呢個儲存庫嘅最新發佈、驗證已發佈嘅 GitHub SHA-256 資產摘要同任何 Authenticode 簽章、為目前用戶安裝，然後移除佢嘅暫存下載。目前建置未簽署，script 會喺摘要驗證之後如實報告。

For an unattended install, verified refresh, or uninstall, review the script
and invoke it as a script block so parameters can be passed:

如果要無人值守安裝、已驗證更新或者解除安裝，請覆核個 script，再將佢當 script block 叫，咁就傳得參數：

```powershell
$installer = [scriptblock]::Create((Microsoft.PowerShell.Utility\Invoke-RestMethod 'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/script/install-windows.ps1'))
& $installer -Operation Install -InstallScope CurrentUser
& $installer -Operation Update -InstallScope CurrentUser
& $installer -Operation Uninstall -InstallScope CurrentUser
```

`Install` is the default and may refresh an existing complete installation.
`Update` requires an existing complete installation. `Uninstall` is idempotent
when the app is already absent. Install downloads and verifies the exact native
setup asset, then runs it with Squirrel's supported `--silent` flag. Update
validates that the release has the exact native setup asset, then runs the
already-installed updater against that release's immutable tag URL with
`--update=<url> --silent`; it does not turn an update into a destructive full
reinstall. Uninstall runs the same installed current-user `Update.exe` with
`--uninstall --silent`; it never downloads an executable for removal.

`Install` 係預設，可能會刷新一個現有嘅完整安裝。`Update` 需要現有嘅完整安裝。`Uninstall` 喺 app 已經唔喺度嗰陣係冪等。Install 會下載同驗證精確嘅原生 setup 資產，然後用 Squirrel 支援嘅 `--silent` 旗標行佢。Update 會驗證該發佈有精確嘅原生 setup 資產，然後用已安裝嘅更新器，針對該發佈嘅不可變 tag 網址行 `--update=<url> --silent`；佢唔會將一次更新變成破壞性嘅完整重裝。Uninstall 用同一個已安裝、目前用戶嘅 `Update.exe` 行 `--uninstall --silent`；佢永遠唔會為咗移除而下載執行檔。

The only supported scope is `CurrentUser`, rooted at
`%LOCALAPPDATA%\GitHubDesktop`. An `AllUsers` argument is rejected. The generated
MSI is a machine deployment bootstrapper that arranges per-user installation at
logon; it is not a conventional machine-wide Desktop Material payload and the
script does not present it as one. Run mutating operations from a normal,
non-administrator PowerShell session; the script rejects an elevated token
before Squirrel can display its unsupported-elevation error. Install also
preflights Squirrel's .NET Framework 4.5 minimum and fails with a recovery
instruction instead of opening a framework installer or reboot prompt.

唯一支援嘅範圍係 `CurrentUser`，根喺 `%LOCALAPPDATA%\GitHubDesktop`。`AllUsers` 參數會被拒絕。產生嘅 MSI 係一個機器部署啟動器，佢安排嘅係登入時嘅逐用戶安裝；佢唔係傳統嘅全機 Desktop Material 負載，個 script 亦都唔會扮佢係。變更性操作請喺普通、非管理員嘅 PowerShell 工作階段行；script 會喺 Squirrel 顯示佢「唔支援提權」錯誤之前就拒絕提權 token。Install 亦都會預檢 Squirrel 要求嘅 .NET Framework 4.5 最低版本，並且以復原指示失敗，而唔係開一個框架安裝程式或者重開機提示。

Before changing files, every operation detects a running installed app and
asks the caller to close it normally. It never force-kills Desktop Material.
The script starts Squirrel hidden, waits up to 15 minutes for its process,
propagates any nonzero child exit as failure, and then waits up to one minute
for the expected installed or removed postcondition. A success receipt includes
the operation, scope, Squirrel exit code, installation root, and final
executable path where applicable. `-ResolveOnly` returns the exact planned file
and arguments without downloading or changing the installation.

喺改任何檔案之前，每一個操作都會偵測到執行緊嘅已安裝 app，並且要求呼叫者正常閂咗佢。佢永遠唔會強制殺死 Desktop Material。Script 會隱藏咁啟動 Squirrel、最多等佢個行程 15 分鐘、將任何非零子行程離開碼當失敗傳出，然後最多等一分鐘等待預期嘅已安裝或者已移除後置條件。成功收據包括操作、範圍、Squirrel 離開碼、安裝根目錄，同適用時嘅最終執行檔路徑。`-ResolveOnly` 會回傳精確嘅計劃檔案同參數，唔會下載或者改動安裝。

For a manual installation, download one of these assets from the
[latest Ding-Ding-Projects release](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest):

如果要手動安裝，喺 [最新 Ding-Ding-Projects 發佈](https://github.com/Ding-Ding-Projects/desktop-material/releases/latest) 下載以下其中一個資產：

- `GitHubDesktopSetup-x64.exe` installs for the current user.
- `GitHubDesktopSetup-x64.msi` provides Squirrel's machine deployment
  bootstrapper; it still installs the application per user at logon.
- `GitHub.Desktop-x64.zip` is the portable package; extract it before running
  the packaged executable.

- `GitHubDesktopSetup-x64.exe` 為目前用戶安裝。
- `GitHubDesktopSetup-x64.msi` 提供 Squirrel 嘅機器部署啟動器；佢一樣係喺登入時逐用戶安裝應用程式。
- `GitHub.Desktop-x64.zip` 係可攜套件；行打包好嘅執行檔之前要先解壓。

An unsupported architecture or a missing or unverifiable graphical-edition
release asset fails closed. Use a supported Windows x64 system or Windows
virtual machine for Electron; the Linux TUI is a separate interface and not a
compatibility mode for that binary.

唔支援嘅架構，或者缺少／驗證唔到嘅圖形版發佈資產，都會 fail closed。Electron 請用支援嘅 Windows x64 系統或者 Windows 虛擬機；Linux TUI 係另一個介面，唔係嗰個二進位檔嘅相容模式。

## Data directories / 資料目錄

- `%LOCALAPPDATA%\GitHubDesktop\` contains the installed application and
  retained update versions.
- `%APPDATA%\GitHub Desktop\` contains user-specific application data and is
  created on first launch.

- `%LOCALAPPDATA%\GitHubDesktop\` 放住已安裝嘅應用程式同保留低嘅更新版本。
- `%APPDATA%\GitHub Desktop\` 放住用戶專屬嘅應用程式資料，第一次啟動嗰陣建立。

## Log files / 記錄檔

Application logs are stored below the user data directory in a `logs`
subdirectory, organized as `YYYY-MM-DD.desktop.production.log`.

應用程式記錄存喺用戶資料目錄下面嘅 `logs` 子目錄，格式係 `YYYY-MM-DD.desktop.production.log`。

Installer and updater diagnostics are stored in:

安裝程式同更新器嘅診斷存喺：

- `%LOCALAPPDATA%\GitHubDesktop\SquirrelSetup.log` for updates after install.
- `%LOCALAPPDATA%\SquirrelSetup.log` for the initial installation. This file
  may contain entries for other Squirrel applications, so focus on
  `GitHubDesktop.exe`.


- `%LOCALAPPDATA%\GitHubDesktop\SquirrelSetup.log`，記錄安裝之後嘅更新。
- `%LOCALAPPDATA%\SquirrelSetup.log`，記錄最初嘅安裝。呢個檔案可能包含其他 Squirrel 應用程式嘅項目，所以集中睇 `GitHubDesktop.exe`。