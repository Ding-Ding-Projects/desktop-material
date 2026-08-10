# Quality and reliability / 品質同可靠性

- [Central diagnostic logging](central-diagnostic-logging.md) — opt-in
  local/remote/both client logging plus an authenticated, redacted, bounded
  ARM64 Docker service for operators and troubleshooting agents.
- [Supply-chain and CI
  hardening](supply-chain-and-ci-hardening.md) — dependency-update proposals,
  frozen lock-file installs, blocking package provenance checks, advisory
  reporting, and concurrency rules that preserve every release-producing run.
- [Renderer startup bundle
  safety](renderer-startup-bundle-safety.md) — keep the Node-side Copilot SDK
  out of browser bundles and fail packaging before an undefined Webpack module
  binding can ship as a blank Windows startup.

- [中央診斷記錄](central-diagnostic-logging.md) — 可選擇嘅本機／遠端／兩者客戶端記錄，加一個已驗證、已遮蔽、有界嘅 ARM64 Docker 服務，俾營運者同排錯 agent 用。
- [供應鏈同 CI 加固](supply-chain-and-ci-hardening.md) — 依賴更新提案、凍結 lock file 安裝、會阻塞嘅套件來源檢查、諮詢報告，以及保住每一次會產生發佈嘅執行嘅並行規則。
- [Renderer 啟動 bundle 安全](renderer-startup-bundle-safety.md) — 將 Node 側嘅 Copilot SDK 擋喺瀏覽器 bundle 外，並且喺未定義嘅 Webpack module 綁定出貨成一個空白 Windows 啟動之前令打包失敗。

This category documents cross-cutting responsiveness, lifecycle, and recovery
contracts that span more than one user workflow.

呢個類別記錄跨越多過一個用戶工作流程嘅反應速度、生命週期同復原契約。

## Features / 功能

- [No-op renderer update
  suppression](no-op-render-update-suppression.md) — prevent an already-closed
  History branch list from emitting a second global app-state update and root
  render whenever users switch between Changes and History.
- [Progressive asynchronous
  loading](progressive-lazy-loading.md) — reveal the usable shell from cached
  and persisted state before optional startup work, evaluate the seven heavy
  inactive repository sections on first activation, and contain each load
  behind screen-reader-announced progress, retry, and newest-request-wins
  lifecycle guards.
- [Root renderer resource
  lifecycle](root-renderer-resource-lifecycle.md) — make store, updater,
  drag-manager, and IPC subscriptions disposable; retain and clear deferred
  polling timers; and release document/window handlers that otherwise keep a
  stale root renderer alive after unmount.
- [Responsiveness and resource
  lifecycle](responsiveness-and-resource-lifecycle.md) — avoid redundant remote
  discovery, hard-bound advisory process cleanup, coalesce stalled proxy work,
  serialize credential prompts, coalesce high-frequency appearance writes, and
  release request and markdown-preview resources deterministically.
- [Peer-closed stream writes](peer-closed-stream-writes.md) — contain the write
  that finishes after its peer already went away (`write EOF`/`EPIPE`) in the
  Cheap LFS upload, trampoline, agent-server, and hooks-proxy transports, plus a
  narrowly-scoped process backstop that turns it into a non-blocking notice
  while every unknown exception stays fatal.
- [Observed user-initiated
  operations](observed-user-initiated-operations.md) — push, force-push, pull,
  and fetch observe the promise they start, so a failed canonical-remote
  preflight is presented once through the normal error machinery instead of
  reaching the global `unhandledrejection` containment as a generic "a
  background action stopped unexpectedly" notice; background refreshes are
  contained as diagnostics instead.
- [Git operation auto-fix](git-operation-auto-fix.md) — a pure classifier that
  recognizes fixable Git failures (stale index.lock, auto-gc/maintenance hang,
  non-fast-forward push, forbidden org-remote push, detached-HEAD commit),
  proposes a safety-classed remediation, and surfaces a localized one-click
  "Fix it" action on the transient error notice without ever force-pushing.
- [Background Git reliability](background-git-reliability.md) — retry only the
  hook-free Windows startup history probe when the bundled launcher itself
  fails and contain repository-indicator failures per repository so one
  offline provider cannot abort the cycle or create an unhandled rejection.
- [Canonical remote preflight
  warning](canonical-remote-preflight-warning.md) — stop a protected network
  mutation before Git runs when the remote destination cannot be proven, then
  show a persistent yellow non-blocking warning with a repository-scoped
  **Change remote URL** action and no credential-bearing URL text.
- [Git hook execution environment](git-hook-execution.md) — proxy the
  repository's own hooks through the user's configured shell, spool hook
  standard input to a real file so the bundled Windows Git can open it, and
  keep the app-generated Cheap LFS first-publish anchor on `--no-verify` while
  every reviewed push still runs hooks.
- [Native large-repository
  handling](native-large-repository-handling.md) — per-repository large mode
  that extends gc/maintenance suppression to status/add/checkout/fetch plus a
  controlled repack, fail-closed stale-`index.lock` removal, an explicit
  status-computing state, suspended polling with one persistent notification for
  deleted repositories, and confirm-class nested-`.git` compression.

- [壓下無效 renderer 更新](no-op-render-update-suppression.md) — 用戶喺 Changes 同 History 之間切換嗰陣，唔好再令一個已經閂咗嘅 History 分支清單發出第二次全域 app 狀態更新同 root render。
- [漸進式非同步載入](progressive-lazy-loading.md) — 喺可選嘅啟動工作之前，由快取同持久化狀態顯示可用嘅外殼；七個重型嘅未啟用儲存庫區段喺第一次啟用先評估；每次載入都困喺螢幕閱讀器會播報嘅進度、重試同「最新請求先贏」嘅生命週期防護後面。
- [Root renderer 資源生命週期](root-renderer-resource-lifecycle.md) — 令 store、updater、拖放管理員同 IPC 訂閱可棄置；保留同清除延後嘅輪詢計時器；釋放否則會令過時 root renderer 喺 unmount 之後仍然生存嘅 document／window 處理器。
- [反應速度同資源生命週期](responsiveness-and-resource-lifecycle.md) — 避免重複嘅遠端探索、硬性界定嘅諮詢行程清理、合併停滯嘅 proxy 工作、串行化憑證提示、合併高頻率外觀寫入，並且確定性咁釋放請求同 markdown 預覽資源。
- [對端已關閉嘅串流寫入](peer-closed-stream-writes.md) — 喺 Cheap LFS 上載、trampoline、agent 伺服器同 hooks proxy 傳輸入面，處理對端已經走咗之後先完成嘅寫入（`write EOF`／`EPIPE`），再加一個範圍極窄嘅行程兜底，將佢變成唔阻塞嘅提示，而所有未知例外仍然係致命。
- [觀察用戶發起嘅操作](observed-user-initiated-operations.md) — push、force-push、pull 同 fetch 會觀察佢哋開出嘅 promise，所以失敗嘅標準 remote 預檢會經正常錯誤機制顯示一次，唔會跌落全域 `unhandledrejection` 兜底變成一句籠統嘅「背景操作意外停止」；背景刷新就當診斷處理。
- [Git 操作自動修復](git-operation-auto-fix.md) — 一個純分類器，識別得出可修復嘅 Git 失敗（過時 index.lock、auto-gc／維護卡住、非快進推送、被禁止嘅組織 remote 推送、detached HEAD commit），提出分好安全等級嘅補救，並且喺短暫錯誤提示上顯示本地化嘅一鍵「Fix it」操作，永遠唔會 force push。
- [背景 Git 可靠性](background-git-reliability.md) — 淨係喺隨附啟動器自己失敗嗰陣，重試無 hook 嘅 Windows 啟動歷史探測；並且逐個儲存庫困住儲存庫指標失敗，令一個離線供應方唔會中斷成個循環或者製造未處理嘅 rejection。
- [標準 remote 預檢警告](canonical-remote-preflight-warning.md) — 當證明唔到遠端目的地嗰陣，喺 Git 行之前就截停受保護嘅網絡變更，然後顯示一個持續、唔阻塞嘅黃色警告，附綁儲存庫嘅**變更 remote URL** 操作，而且唔會顯示帶憑證嘅網址文字。
- [Git hook 執行環境](git-hook-execution.md) — 經用戶設定嘅 shell 代理儲存庫自己嘅 hook，將 hook 標準輸入寫落真實檔案等隨附嘅 Windows Git 開得到，並且令 app 產生嘅 Cheap LFS 首次發佈錨點保持 `--no-verify`，而每一次經覆核嘅推送照樣行 hook。
- [原生大型儲存庫處理](native-large-repository-handling.md) — 逐儲存庫嘅大型模式，將 gc／維護抑制延伸到 status／add／checkout／fetch，加一次受控 repack、fail-closed 嘅過時 `index.lock` 移除、明確嘅「計算狀態中」狀態、暫停輪詢並為已刪除儲存庫保留一個持續通知，以及需要確認嘅巢狀 `.git` 壓縮。

## API applicability / API 適用性

These contracts change local desktop scheduling and cleanup behavior. They add
no HTTP endpoint, so a Postman collection is not applicable.


呢啲契約改變嘅係本機桌面嘅排程同清理行為。佢哋唔加 HTTP 端點，所以唔適用 Postman 集合。