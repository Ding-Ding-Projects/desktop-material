# Table of contents / 目錄

- [macOS](#macos)
  - ['The username or passphrase you entered is not correct' error after signing into account](#the-username-or-passphrase-you-entered-is-not-correct-error-after-signing-into-account)
  - [Checking for updates triggers a 'Could not create temporary directory: Permission denied' message](#checking-for-updates-triggers-a-could-not-create-temporary-directory-permission-denied-message)
- [Windows](#windows)
  - [Window is hidden after detaching secondary monitor](#window-is-hidden-after-detaching-secondary-monitor)
  - [Certificate revocation check fails](#certificate-revocation-check-fails)
  - [Using a repository configured with Folder Redirection](#using-a-repository-configured-with-folder-redirection)
  - [Enable Mandatory ASLR triggers cygheap errors](#enable-mandatory-aslr-triggers-cygheap-errors)
  - [I get a black screen when launching Desktop](#i-get-a-black-screen-when-launching-desktop)
  - [Failed to open CA file after an update](#failed-to-open-ca-file-after-an-update)
  - [Authentication errors due to modified registry entries](#authentication-errors-due-to-modified-registry-entries)

- [macOS](#macos)
  - [登入帳戶之後出現「The username or passphrase you entered is not correct」錯誤](#the-username-or-passphrase-you-entered-is-not-correct-error-after-signing-into-account--登入帳戶之後出現the-username-or-passphrase-you-entered-is-not-correct錯誤)
  - [檢查更新時出現「Could not create temporary directory: Permission denied」](#checking-for-updates-triggers-a-could-not-create-temporary-directory-permission-denied-message--檢查更新時出現could-not-create-temporary-directory-permission-denied)
- [Windows](#windows--windows)
  - [拆走第二個螢幕之後視窗唔見咗](#window-is-hidden-after-detaching-secondary-monitor--拆走第二個螢幕之後視窗唔見咗)
  - [憑證撤銷檢查失敗](#certificate-revocation-check-fails--憑證撤銷檢查失敗)
  - [使用設定咗資料夾重新導向嘅儲存庫](#using-a-repository-configured-with-folder-redirection--使用設定咗資料夾重新導向嘅儲存庫)
  - [開啟強制 ASLR 會觸發 cygheap 錯誤](#enable-mandatory-aslr-triggers-cygheap-errors--開啟強制-aslr-會觸發-cygheap-錯誤)
  - [啟動 Desktop 時出現黑畫面](#i-get-a-black-screen-when-launching-desktop--啟動-desktop-時出現黑畫面)
  - [更新之後開唔到 CA 檔案](#failed-to-open-ca-file-after-an-update--更新之後開唔到-ca-檔案)
  - [登錄檔項目被改動導致認證錯誤](#authentication-errors-due-to-modified-registry-entries--登錄檔項目被改動導致認證錯誤)

# Known Issues / 已知問題

This document outlines acknowledged issues with GitHub Desktop, including workarounds if known.

呢份文件列出已知嘅 GitHub Desktop 問題，如果有已知嘅暫時解決方法亦會一併寫低。

## What should I do if... / 我應該點做…

### I have encountered an issue listed here? / 我遇到咗呢度列出嘅問題？

Some known issues have a workaround that users have reported addresses the issue. Please try the workaround for yourself to confirm it addresses the issue.

有啲已知問題有用戶回報過可行嘅暫時解決方法。請自己試一次，確認佢真係解決到你嘅情況。

### I have additional questions about an issue listed here? / 我對呢度嘅問題仲有疑問？

Each known issue links off to an existing GitHub issue. If you have additional questions or feedback, please comment on the issue.

每個已知問題都連去一個現有嘅 GitHub issue。如果仲有疑問或者意見，請喺嗰個 issue 留言。

### My issue is not listed here? / 我嘅問題唔喺呢度？

Please check the [open](https://github.com/desktop/desktop/labels/bug) and [closed](https://github.com/desktop/desktop/issues?q=is%3Aclosed+label%3Abug) bugs in the issue tracker for the details of your bug. If you can't find it, or if you're not sure, open a [new issue](https://github.com/desktop/desktop/issues/new?template=bug_report.md).

請喺 issue 追蹤器度查[開啟中](https://github.com/desktop/desktop/labels/bug)同[已關閉](https://github.com/desktop/desktop/issues?q=is%3Aclosed+label%3Abug)嘅 bug 詳情。如果搵唔到，或者你唔肯定，就開一個[新 issue](https://github.com/desktop/desktop/issues/new?template=bug_report.md)。

## macOS / macOS

### 'The username or passphrase you entered is not correct' error after signing into account / 登入帳戶之後出現「The username or passphrase you entered is not correct」錯誤

Related issue: [#3263](https://github.com/desktop/desktop/issues/3263)

相關 issue：[#3263](https://github.com/desktop/desktop/issues/3263)

This seems to be caused by the Keychain being in an invalid state, affecting applications that try to use the keychain to store or retrieve credentials. This has been reported from macOS High Sierra 10.13 (17A365) to macOS Mojave 10.14.5 (18F132).

呢個似乎係 Keychain 處於無效狀態引起，影響所有想用 keychain 儲存或者攞憑證嘅應用程式。由 macOS High Sierra 10.13 (17A365) 到 macOS Mojave 10.14.5 (18F132) 都有人回報。

**Workaround:**

**暫時解決方法：**

- Open `Keychain Access.app`
- Right-click on the `login` keychain and try locking it
- Right-click on the `login` keychain and try unlocking it
- Sign into your GitHub account again

- 開 `Keychain Access.app`
- 喺 `login` keychain 上右鍵，試下鎖住佢
- 再喺 `login` keychain 上右鍵，試下解鎖
- 重新登入你嘅 GitHub 帳戶

### Checking for updates triggers a 'Could not create temporary directory: Permission denied' message / 檢查更新時出現「Could not create temporary directory: Permission denied」

Related issue: [#4115](https://github.com/desktop/desktop/issues/4115)

相關 issue：[#4115](https://github.com/desktop/desktop/issues/4115)

This issue seems to be caused by missing permissions for the `~/Library/Caches/com.github.GitHubClient.ShipIt` folder. This is a directory that Desktop uses to create and unpack temporary files as part of updating the application.

呢個問題似乎係 `~/Library/Caches/com.github.GitHubClient.ShipIt` 資料夾缺少權限引起。Desktop 更新應用程式嗰陣會用呢個目錄建立同解壓暫存檔。

**Workaround:**

**暫時解決方法：**

 - Close Desktop
 - Open Finder and navigate to `~/Library/Caches/`
 - Context-click `com.github.GitHubClient.ShipIt` and select **Get Info**
 - Expand the **Sharing & Permissions** section
 - If you do not see the "You can read and write" message, add yourself with
   the "Read & Write" permissions
 - Start Desktop again and check for updates

- 閂咗 Desktop
- 開 Finder，去 `~/Library/Caches/`
- 喺 `com.github.GitHubClient.ShipIt` 上按右鍵，揀 **Get Info**
- 展開 **Sharing & Permissions** 區段
- 如果見唔到「You can read and write」，就將自己加入去，權限設為「Read & Write」
- 重新開 Desktop，再檢查更新

### GitHub Desktop prompts admin password to install helper tool very frequently / GitHub Desktop 經常要求管理員密碼去安裝輔助工具

Related issue: [#13956](https://github.com/desktop/desktop/issues/13956)

相關 issue：[#13956](https://github.com/desktop/desktop/issues/13956)

Users who use macOS' Migration Assistant to keep their stuff intact when moving to a new computer might run into this problem because the Migration Assistant changes the owner of the `/Applications/GitHub Desktop.app` folder to `root`.

用 macOS 遷移助理搬去新電腦、想保留原有資料嘅用戶可能會撞到呢個問題，因為遷移助理會將 `/Applications/GitHub Desktop.app` 資料夾嘅擁有者改成 `root`。

Since GitHub Desktop is able to auto-update by changing the contents of the `/Applications/GitHub Desktop.app` folder, it needs to be able to write to it. If the owner of the folder is not the current user, the user will be prompted for an admin password every time GitHub Desktop tries to update itself.

因為 GitHub Desktop 自動更新嗰陣要改 `/Applications/GitHub Desktop.app` 資料夾嘅內容，所以佢要寫得入去。如果資料夾嘅擁有者唔係目前用戶，每次 GitHub Desktop 想自我更新都會要求管理員密碼。

**Workaround:** you need to restore the ownership and permissions of the application folder to the current user. If your app is located in `/Applications/GitHub Desktop.app`, you can probably do this by just running the following commands in Terminal:

**暫時解決方法：**你要將應用程式資料夾嘅擁有權同權限還原俾目前用戶。如果你個 app 喺 `/Applications/GitHub Desktop.app`，通常喺 Terminal 行以下命令就得：

```sh
sudo chown -R ${USER}:staff /Applications/GitHub\ Desktop.app
chmod -R g+w /Applications/GitHub\ Desktop.app
```

## Windows / Windows

### Window is hidden after detaching secondary monitor / 拆走第二個螢幕之後視窗唔見咗

Related issue: [#2107](https://github.com/desktop/desktop/issues/2107)

相關 issue：[#2107](https://github.com/desktop/desktop/issues/2107)

This is related to Desktop tracking the window position between launches, but not changes to your display configuration such as removing the secondary monitor where Desktop was positioned.

呢個同 Desktop 會記住每次啟動之間嘅視窗位置有關，但係佢唔會跟住你嘅顯示器設定變化（例如拆走咗 Desktop 原本擺放嗰個第二螢幕）。

**Workaround:**

**暫時解決方法：**

 - Remove `%APPDATA%\GitHub Desktop\window-state.json`
 - Restart Desktop

- 刪除 `%APPDATA%\GitHub Desktop\window-state.json`
- 重新啟動 Desktop

### Certificate revocation check fails / 憑證撤銷檢查失敗

Related issue: [#3326](https://github.com/desktop/desktop/issues/3326)

相關 issue：[#3326](https://github.com/desktop/desktop/issues/3326)

If you are using Desktop on a corporate network, you may encounter an error like this:

如果你喺公司網絡用 Desktop，可能會見到類似咁嘅錯誤：

```
fatal: unable to access 'https://github.com/owner/name.git/': schannel: next InitializeSecurityContext failed: Unknown error (0x80092012) - The revocation function was unable to check revocation for the certificate.
```

GitHub Desktop by default uses the Windows Secure Channel (SChannel) APIs to validate the certificate received from a server. Some networks will block the attempts by Windows to check the revocation status of a certificate, which then causes the whole operation to error.

GitHub Desktop 預設用 Windows Secure Channel (SChannel) API 驗證伺服器嘅憑證。有啲網絡會封鎖 Windows 檢查憑證撤銷狀態嘅嘗試，令成個操作出錯。

**Workaround:**

**暫時解決方法：**

**We do not recommend setting this config value for normal Git usage**. This is intended to be an "escape hatch" for situations where the network administrator has restricted the normal usage of SChannel APIs on Windows that Git is trying to use.

**我哋唔建議喺日常 Git 使用度設定呢個 config 值。** 佢係一個「逃生出口」，淨係俾網絡管理員限制咗 Git 想用嘅 Windows SChannel API 嗰啲情況用。

Run this command in your Git shell to disable the revocation check:

喺你嘅 Git shell 行呢條命令去停用撤銷檢查：

```shellsession
$ git config --global http.schannelCheckRevoke false
```

### Using a repository configured with Folder Redirection / 使用設定咗資料夾重新導向嘅儲存庫

Related issue: [#2972](https://github.com/desktop/desktop/issues/2972)

相關 issue：[#2972](https://github.com/desktop/desktop/issues/2972)

[Folder Redirection](https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/cc753996(v%3dws.11)) is a feature of Windows for administrators to ensure files and folders are managed on a network server, instead.

[資料夾重新導向](https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/cc753996(v%3dws.11)) 係 Windows 俾管理員將檔案同資料夾改為喺網絡伺服器管理嘅功能。

**Not supported** as Git is not able to resolve the working directory correctly:

**唔支援**，因為 Git 解析唔到正確嘅工作目錄：

```shellsession
2017-09-21T23:16:05.933Z - error: [ui] `git -c credential.helper= lfs clone --recursive --progress --progress -- https://github.com/owner/name.git \\harvest\Redirected\andrewd\My Documents\GitHub\name` exited with an unexpected code: 2.
Cloning into '\\harvest\Redirected\andrewd\My Documents\GitHub\name'...
remote: Counting objects: 4, done.
remote: Compressing objects:  33% (1/3)
remote: Compressing objects:  66% (2/3)
remote: Compressing objects: 100% (3/3)
remote: Compressing objects: 100% (3/3), done.
remote: Total 4 (delta 1), reused 4 (delta 1), pack-reused 0
fatal: unable to get current working directory: No such file or directory
warning: Clone succeeded, but checkout failed.
You can inspect what was checked out with 'git status'
and retry the checkout with 'git checkout -f HEAD'

Error(s) during clone:
git clone failed: exit status 128
```

### Enable Mandatory ASLR triggers cygheap errors / 開啟強制 ASLR 會觸發 cygheap 錯誤

Related issue: [#3096](https://github.com/desktop/desktop/issues/3096)

相關 issue：[#3096](https://github.com/desktop/desktop/issues/3096)

Windows 10 Fall Creators Edition (version 1709 or later) added enhancements to the Enhanced Mitigation Experience Toolkit, one being to enable Mandatory ASLR. This setting affects the embedded Git shipped in Desktop, and produces errors that look like this:

Windows 10 Fall Creators Edition（1709 或者之後）加強咗 Enhanced Mitigation Experience Toolkit，其中一項係啟用強制 ASLR。呢個設定會影響 Desktop 隨附嘅內嵌 Git，並且產生類似咁嘅錯誤：

```
      1 [main] sh (2072) C:\Users\bdorrans\AppData\Local\GitHubDesktop\app-1.0.4\resources\app\git\usr\bin\sh.exe: *** fatal error - cygheap base mismatch detected - 0x2E07408/0x2EC7408.
This problem is probably due to using incompatible versions of the cygwin DLL.
Search for cygwin1.dll using the Windows Start->Find/Search facility
and delete all but the most recent version.  The most recent version *should*
reside in x:\cygwin\bin, where 'x' is the drive on which you have
installed the cygwin distribution.  Rebooting is also suggested if you
are unable to find another cygwin DLL.
```

Enabling Mandatory ASLR affects the MSYS2 core library, which is relied upon by Git for Windows to emulate process forking.

啟用強制 ASLR 會影響 MSYS2 核心程式庫，而 Git for Windows 靠佢模擬行程 fork。

**Not supported:** this is an upstream limitation of MSYS2, and it is recommended that you either disable Mandatory ASLR or explicitly allow all executables under `<Git>\usr\bin` which depend on MSYS2.

**唔支援：**呢個係 MSYS2 上游嘅限制，建議你停用強制 ASLR，或者明確允許 `<Git>\usr\bin` 下面所有依賴 MSYS2 嘅執行檔。

### I get a black screen when launching Desktop / 啟動 Desktop 時出現黑畫面

Related issue: [#3921](https://github.com/desktop/desktop/issues/3921)

相關 issue：[#3921](https://github.com/desktop/desktop/issues/3921)

Electron enables hardware accelerated graphics by default, but some graphics cards have issues with hardware acceleration which means the application will launch successfully but it will be a black screen.

Electron 預設開啟硬件加速繪圖，但係有啲顯示卡對硬件加速有問題，令應用程式啟動得到但係得個黑畫面。

**Workaround:** if you set the `GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION` environment variable to any value and launch Desktop again it will disable hardware acceleration on launch, so the application is usable. Here are the steps to set the environment variable in PowerShell:

**暫時解決方法：**將環境變數 `GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION` 設成任何值再啟動 Desktop，就會喺啟動時停用硬件加速，令應用程式用得到。喺 PowerShell 設定環境變數嘅步驟如下：

1. Open PowerShell
2. Run the command `$env:GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION=1`
3. Launch GitHub Desktop

1. 開 PowerShell
2. 行 `$env:GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION=1`
3. 啟動 GitHub Desktop

### Failed to open CA file after an update / 更新之後開唔到 CA 檔案

Related issue: [#4832](https://github.com/desktop/desktop/issues/4832)

相關 issue：[#4832](https://github.com/desktop/desktop/issues/4832)

A recent upgrade to Git for Windows changed how it uses `http.sslCAInfo`.

最近一次 Git for Windows 升級改變咗佢點樣使用 `http.sslCAInfo`。

An example of this error:

呢個錯誤嘅例子：

> fatal: unable to access 'https://github.com/\<owner>/\<repo>.git/': schannel: failed to open CA file 'C:/Users/\<account>/AppData/Local/GitHubDesktop/app-1.2.2/resources/app/git/mingw64/bin/curl-ca-bundle.crt': No such file or directory

> > fatal: unable to access 'https://github.com/\<owner>/\<repo>.git/': schannel: failed to open CA file 'C:/Users/\<account>/AppData/Local/GitHubDesktop/app-1.2.2/resources/app/git/mingw64/bin/curl-ca-bundle.crt': No such file or directory

This is occurring because some users have an existing Git for Windows installation that created a special config at `C:\ProgramData\Git\config`, and this config may contain an `http.sslCAInfo` entry, which is inherited by Desktop.

出現嘅原因係有啲用戶原本裝咗 Git for Windows，佢喺 `C:\ProgramData\Git\config` 整咗一個特別設定，而呢個設定可能有 `http.sslCAInfo` 項目，之後俾 Desktop 繼承咗。

There's two problems with this current state:

呢個狀態有兩個問題：

 - Desktop doesn't need custom certificates for its Git operations - it uses SChannel by default, which uses the Windows Certificate Store to verify server certificates
 - this `http.sslCAInfo` config value may resolve to a location or file that doesn't exist in Desktop's Git installation

- Desktop 做 Git 操作唔需要自訂憑證 — 佢預設用 SChannel，而 SChannel 用 Windows 憑證存放區驗證伺服器憑證
- 呢個 `http.sslCAInfo` 值可能指向一個喺 Desktop 嘅 Git 安裝入面唔存在嘅位置或者檔案

**Workaround:**

**暫時解決方法：**

1. Verify that you have the problem configuration by checking the output of this command:

1. 用呢條命令嘅輸出確認你係咪有問題設定：

```
> git config -l --show-origin
```

You should have an entry that looks like this:

你應該會見到類似咁嘅一行：

```
file:"C:\ProgramData/Git/config" http.sslcainfo=[some value here]
```

2. Open `C:\ProgramData\Git\config` (requires elevated privileges) and remove the corresponding lines that look like this:

2. 開 `C:\ProgramData\Git\config`（需要提升權限），刪除類似咁嘅對應行：

```
[http]
sslCAInfo = [some value here]
```

### Authentication errors due to modified registry entries / 登錄檔項目被改動導致認證錯誤

Related issue: [#2623](https://github.com/desktop/desktop/issues/2623)

相關 issue：[#2623](https://github.com/desktop/desktop/issues/2623)

If either the user or an application has modified the `Command Processor` registry entries it can cause GitHub Desktop to throw an `Authentication failed` error. To check if these registry entries have been modified open the Registry Editor (regedit.exe) and navigate to the following locations:

如果用戶或者某個應用程式改咗 `Command Processor` 嘅登錄檔項目，可以令 GitHub Desktop 拋出 `Authentication failed` 錯誤。想檢查呢啲登錄檔項目有冇被改，開登錄編輯器（regedit.exe），去以下位置：

`HKEY_CURRENT_USER\Software\Microsoft\Command Processor\`
`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Command Processor\`

`HKEY_CURRENT_USER\Software\Microsoft\Command Processor\`
`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Command Processor\`

Check to see if there is an `Autorun` value in either of those location. If there is, deleting that value should resolve the `Authentication failed` error.

睇下嗰兩個位置有冇 `Autorun` 值。如果有，刪咗佢通常就解決到 `Authentication failed` 錯誤。

### "Not enough resources" error when signing in / 登入嗰陣出現「Not enough resources」錯誤

Related issue: [#15217](https://github.com/desktop/desktop/issues/15217)

相關 issue：[#15217](https://github.com/desktop/desktop/issues/15217)

If you see an error that says "Not enough resources are available to process this command" when signing in to GitHub Desktop, it's likely that you have too many credentials stored in Windows Credentials Manager.

如果你登入 GitHub Desktop 嗰陣見到「Not enough resources are available to process this command」，好大機會係 Windows 認證管理員入面存咗太多憑證。

**Workaround:** open the Credential Manager application, click on Windows Credentials and go through the list to see if there are some you can delete.


**暫時解決方法：**開「認證管理員」應用程式，撳 Windows 認證，逐個睇下有邊啲刪得。