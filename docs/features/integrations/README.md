# Integrations / 整合

Desktop Material integration features connect Git workflows to operating-system,
editor, shell, provider, and user-level Git configuration without placing
credentials or machine-specific state in a repository.

Desktop Material 嘅整合功能將 Git 工作流程接上作業系統、編輯器、shell、供應方同用戶層級嘅 Git 設定，同時唔會將憑證或者機器專有狀態放入儲存庫。

- [App-hosted browser](app-hosted-browser.md) — open HTTP(S) links in a
  sandboxed `WebContentsView` tab with address/navigation controls, bookmarks,
  popup and redirect capture, a persisted internal/external choice, and an
  isolated authentication escape. Combined local tests, the exact Windows
  production build, and hidden-desktop acceptance pass; packaged E2E and
  remote publication remain separate.
- [Windows-only graphical edition support](windows-only-platform-support.md)
- [Windows Explorer context menu and quick-action
  window](windows-explorer-context-menu.md)
- [Automated update build status and release
  notes](automated-updates-and-release-notes.md)
- [Self-hosted Windows dependency bootstrap](self-hosted-windows-dependency-bootstrap.md)
- [Root Windows dependency fetcher](root-windows-dependency-fetcher.md)
- [Build & Run output controls](build-run-output-controls.md)
- [Actions workflow manager](actions-workflow-manager.md) — workflow timing,
  bounded job-log transfer retries, and visible recovery actions for transient
  provider 404 responses.
- [Self-hosted GitHub Actions runner
  manager](self-hosted-runner-manager.md) — Windows runner setup with a rich,
  searchable account picker, immutable workflow and pending-job audits, public
  workflow trust checks, exact-account credentials, lifecycle recovery, and
  fail-closed WSL controls.
- [GitHub OAuth login](github-oauth-login.md) — upstream-compatible GitHub
  authorization and token exchange without an unregistered custom redirect.
- [Local GitHub Actions runner](local-actions-runner.md)
- [Local AI build repair with Codex or
  OpenCode](local-ai-build-fix.md)
- [Custom Git command presets](custom-git-command-presets.md)
- [WSL-aware editor opening](wsl-aware-editor-opening.md)
- [Global ignore management](global-ignore-management.md)
- [Editor discovery and one-click
  opening](editor-discovery-and-one-click-opening.md)
- [One-click editor actions](one-click-editor-actions.md)
- [Duplicate-open guard](duplicate-open-guard.md)
- [Broad editor support](broad-editor-support.md)
- [Copilot commit-message controls](copilot-commit-message-controls.md)
- [Ollama model manager](ollama-model-manager.md)
- [Repository-bound GitHub API functions](github-api-functions.md)
- [GitLab merge requests](gitlab-merge-request.md)
- [Repository Releases dashboard](repository-releases-dashboard.md)
- [Per-repository GitHub Packages explorer](github-packages-explorer.md)
- [SSH working copies and remote
  clone](ssh-working-copy-and-remote-clone.md)
- [GitHub CLI push credential
  fallback](gh-cli-push-fallback.md)

- [App 自寄瀏覽器](app-hosted-browser.md) — 喺沙箱 `WebContentsView` 分頁開 HTTP(S) 連結，有網址／導覽控制、書籤、彈出同轉址擷取、記住嘅內部／外部選擇，以及隔離嘅認證出口。合併本機測試、精確 Windows 生產建置同隱藏桌面接受全部通過；已打包 E2E 同遠端發佈仍然係另外嘅關卡。
- [淨係 Windows 嘅圖形版支援](windows-only-platform-support.md)
- [Windows 檔案總管右鍵選單同快速操作視窗](windows-explorer-context-menu.md)
- [自動更新建置狀態同發佈說明](automated-updates-and-release-notes.md)
- [自架 Windows 依賴啟動程序](self-hosted-windows-dependency-bootstrap.md)
- [Build & Run 輸出控制](build-run-output-controls.md)
- [Actions 工作流程管理員](actions-workflow-manager.md) — 工作流程計時、有界嘅 job log 傳輸重試，同針對供應方短暫 404 回應嘅可見復原操作。
- [自架 GitHub Actions runner 管理員](self-hosted-runner-manager.md) — Windows runner 設定，配豐富可搜尋嘅帳戶選擇器、不可變嘅工作流程同待處理工作審核、公開工作流程信任檢查、精確帳戶憑證、生命週期復原同 fail-closed 嘅 WSL 控制。
- [GitHub OAuth 登入](github-oauth-login.md) — 同上游相容嘅 GitHub 授權同 token 交換，唔帶未註冊嘅自訂轉址。
- [本機 GitHub Actions runner](local-actions-runner.md)
- [用 Codex 或者 OpenCode 做本機 AI 建置修復](local-ai-build-fix.md)
- [自訂 Git 命令預設](custom-git-command-presets.md)
- [感知 WSL 嘅編輯器開啟](wsl-aware-editor-opening.md)
- [全域 ignore 管理](global-ignore-management.md)
- [編輯器探索同一鍵開啟](editor-discovery-and-one-click-opening.md)
- [一鍵編輯器操作](one-click-editor-actions.md)
- [重複開啟防護](duplicate-open-guard.md)
- [廣泛編輯器支援](broad-editor-support.md)
- [Copilot commit 訊息控制](copilot-commit-message-controls.md)
- [Ollama 模型管理員](ollama-model-manager.md)
- [綁儲存庫嘅 GitHub API 功能](github-api-functions.md)
- [GitLab merge request](gitlab-merge-request.md)
- [儲存庫 Releases 儀表板](repository-releases-dashboard.md)
- [逐儲存庫 GitHub Packages 瀏覽器](github-packages-explorer.md)
- [SSH 工作副本同遠端 clone](ssh-working-copy-and-remote-clone.md)
- [GitHub CLI 推送憑證後備](gh-cli-push-fallback.md)

Credential and sign-in prompts are serialized through one recoverable FIFO so
concurrent Git/SSH requests cannot lose their visible completion path. See the
cross-cutting [responsiveness and resource lifecycle
contract](../quality-and-reliability/responsiveness-and-resource-lifecycle.md).


憑證同登入提示會經一條可復原嘅 FIFO 串行處理，所以同時發生嘅 Git／SSH 請求唔會失去佢哋可見嘅完成路徑。睇跨領域嘅 [反應速度同資源生命週期契約](../quality-and-reliability/responsiveness-and-resource-lifecycle.md)。
