# Identity and workspace features / 身分同工作區功能

This category covers account selection and fast navigation when one Desktop
Material installation manages many identities, repositories, and branches.

當一個 Desktop Material 安裝要管理好多身分、儲存庫同分支，呢個類別講嘅就係帳戶選擇同快速導覽。

## Features / 功能

- [Multiple accounts, rich account picker, and repository
  identity](multiple-accounts-and-repository-identity.md)
- [Repository sidebar and
  pinning](repository-sidebar-and-pinning.md)
- [Branch switcher workflows](branch-switcher-workflows.md) — branch discovery,
  dirty-worktree switching, and the **Not updated with main** merge filter
- [Owner-scoped appearance and
  history](owner-scoped-appearance-and-history.md)
- [Tab-strip settings commit
  chip](tab-strip-settings-commit-chip.md)
- [Settings search](settings-search.md)
- [Settings tab docking](settings-tab-docking.md)
- [Scheduled language, appearance, and external
  settings](scheduled-settings.md)
- [Collection bulk actions and regex
  safety](collection-bulk-and-regex-safety.md)
- [Tab groups](tab-groups.md)
- [Tab-strip overflow dropdown](tab-overflow-dropdown.md)
- [Browser-style settings tabs](settings-browser-tabs.md)
- [Support Tickets: the local recovery desk](support-tickets.md) — the
  self-service route back in after forgetting a for-fun lock's credential
- [The built-in authenticator and QR
  pairing](authenticator-and-qr-registration.md) — registering TOTP second
  factors, the in-process QR, and where the secrets are kept

- [多帳戶、豐富帳戶選擇器同儲存庫身分](multiple-accounts-and-repository-identity.md)
- [儲存庫側欄同釘選](repository-sidebar-and-pinning.md)
- [分支切換工作流程](branch-switcher-workflows.md) — 分支探索、有未提交改動嗰陣嘅切換，同**未跟 main 更新**合併篩選
- [按擁有者劃分嘅外觀同歷史](owner-scoped-appearance-and-history.md)
- [分頁列設定 commit 標籤](tab-strip-settings-commit-chip.md)
- [設定搜尋](settings-search.md)
- [設定分頁停駐](settings-tab-docking.md)
- [排程語言、外觀同外部設定](scheduled-settings.md)
- [集合批次操作同 regex 安全](collection-bulk-and-regex-safety.md)
- [分頁群組](tab-groups.md)
- [分頁列溢出下拉](tab-overflow-dropdown.md)
- [瀏覽器式設定分頁](settings-browser-tabs.md)
- [Support Tickets：本機支援櫃檯](support-tickets.md) — 唔記得咗「好玩」鎖嘅密碼之後，自己行返入去嘅路
- [內置驗證器同 QR 配對](authenticator-and-qr-registration.md) — 登記 TOTP 第二重驗證、喺程序入面畫嘅 QR，同啲密鑰擺喺邊

High-frequency visual edits are coalesced before persistence, while remote
default-branch lookup reuses only a namespace-validated local symbolic ref.
The cross-cutting lifecycle contract is documented under
[Quality and reliability](../quality-and-reliability/README.md).

高頻率嘅視覺編輯會先合併再持久化，而遠端預設分支查詢淨係重用一個命名空間已驗證嘅本機符號 ref。跨領域嘅生命週期契約記錄喺 [品質同可靠性](../quality-and-reliability/README.md)。

## API applicability / API 適用性

Account-bound provider calls use the application's existing GitHub, GitLab,
and Bitbucket clients. These features add no standalone HTTP endpoint, so a
Postman collection is not applicable.


綁帳戶嘅供應方呼叫用返應用程式現有嘅 GitHub、GitLab 同 Bitbucket 客戶端。呢啲功能唔加獨立 HTTP 端點，所以唔適用 Postman 集合。