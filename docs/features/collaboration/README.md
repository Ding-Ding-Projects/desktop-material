# Collaboration features / 協作功能

This category documents provider-backed workflows that let contributors review
and manage collaboration state without leaving Desktop Material.

呢個類別記錄由供應方支援嘅工作流程，等貢獻者唔使離開 Desktop Material 都覆核同管理到協作狀態。

## Features / 功能

- [Checkout branches from other forks](fork-branch-checkout.md) — discover a
  bounded GitHub repository network, review an exact fork branch head and
  Desktop-managed ref, then fetch and checkout with stale-state guards.
- [Native pull request creation](pull-request-creation.md) — discover bounded
  repository templates, review title/body/draft and provider-backed metadata,
  then create through the exact authenticated GitHub account and local head.
- [Native pull request review workspace](pull-request-review-workspace.md) —
  inspect a bounded, exact-head pull request workspace with a fixed summary and
  right rail; review files, commits, conversation, and checks; queue inline
  comments, safe fenced replacement suggestions, and replies; submit a review;
  and close, reopen, or merge with explicit confirmation.
- [Rich pull-request context and
  actions](pull-request-context-and-actions.md) — keep exact head/base context,
  metadata, checks, timelines, and guarded lifecycle actions in one workspace.
- [Pull-request activity
  notifications](pull-request-activity-notifications.md) — route relevant
  reviews, comments, and failed checks through de-duplicated OS notifications.
- [Offline GitHub Projects workspace](offline-github-projects.md) — inspect a
  bounded read-only Projects v2 snapshot, with a capability-aware classic
  fallback and a sanitized per-repository cache for offline recovery.
- [Self-hosted server wizard](self-hosted-server-wizard.md) — provision the
  bundled Windows Docker server with progress, safe retry boundaries,
  credential isolation, and truthful local/second-machine diagnostics.

- [由其他 fork checkout 分支](fork-branch-checkout.md) — 探索一個有界嘅 GitHub 儲存庫網絡，覆核精確嘅 fork 分支 head 同 Desktop 管理嘅 ref，然後喺有過時狀態防護下抓取同 checkout。
- [原生建立 pull request](pull-request-creation.md) — 探索有界嘅儲存庫範本，覆核標題／內文／草稿同供應方 metadata，然後用精確嘅已驗證 GitHub 帳戶同本機 head 建立。
- [原生 pull request 覆核工作區](pull-request-review-workspace.md) — 用固定摘要同右側欄檢視一個有界、精確 head 嘅 pull request 工作區；覆核檔案、commit、對話同檢查；排隊行內留言、安全嘅圍欄取代建議同回覆；提交覆核；並且喺明確確認之下關閉、重開或者合併。
- [豐富嘅 pull request 脈絡同操作](pull-request-context-and-actions.md) — 喺同一個工作區保留精確嘅 head／base 脈絡、metadata、檢查、時間軸同有防護嘅生命週期操作。
- [Pull request 活動通知](pull-request-activity-notifications.md) — 將相關嘅覆核、留言同失敗檢查，經去重嘅作業系統通知送出。
- [離線 GitHub Projects 工作區](offline-github-projects.md) — 檢視一個有界、唯讀嘅 Projects v2 快照，附感知能力嘅 classic 後備，同一個消毒過、逐儲存庫嘅快取做離線復原。
- [自架伺服器精靈](self-hosted-server-wizard.md) — 佈署隨附嘅 Windows Docker 伺服器，有進度、安全重試界線、憑證隔離同誠實嘅本機／第二部機診斷。

## API applicability / API 適用性

The workspace consumes authenticated GitHub REST endpoints through the existing
account-bound client. It does not expose an application HTTP endpoint, so a
Postman collection is not applicable. The provider routes and payload limits
are documented with the feature instead.


呢個工作區經現有嘅綁帳戶客戶端使用已驗證嘅 GitHub REST 端點。佢唔會開放應用程式 HTTP 端點，所以唔適用 Postman 集合。供應方路由同負載上限改為喺功能文件入面記錄。