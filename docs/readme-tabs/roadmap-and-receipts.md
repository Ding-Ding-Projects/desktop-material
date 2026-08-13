[Overview](../../README.md) · [Install](install.md) · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · **Roadmap & receipts** · [Development](development.md)

[總覽](../../README.md) · [安裝](install.md) · [功能](features.md) · [完整清單](complete-feature-list.md) · [截圖](screenshots.md) · **路線圖同憑證** · [開發](development.md)

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

<sub>分頁式 README — GitHub 唔行得 script，所以上面每個分頁都係獨立一版。</sub>

# Roadmap & receipts / 路線圖同憑證

## Current status / 目前狀態

Snapshot recorded on **August 13, 2026**:

- `main` and `origin/main` point to [`5cb2281643b788b0038412072b939b4ee9a6e635`](https://github.com/Ding-Ding-Projects/desktop-material/commit/5cb2281643b788b0038412072b939b4ee9a6e635).
- GitHub has one open issue: [#190 — Reconcile current roadmap and release receipts](https://github.com/Ding-Ding-Projects/desktop-material/issues/190).
- The latest published release is [`v4.0.119101`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.119101), published at `2026-08-13T23:02:56Z` for that exact commit. It has six downloadable assets: `GitHub.Desktop-x64.zip`, `GitHubDesktop-4.0.119101-full.nupkg`, `GitHubDesktop-4.0.119101-x64-full.nupkg`, `GitHubDesktopSetup-x64.exe`, `GitHubDesktopSetup-x64.msi`, and `RELEASES`.
- [CI Windows run 31747636431](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636431), [CI Linux run 31747636425](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636425), [Cheap LFS run 31747636429](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636429), and [release workflow run 31750286839](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31750286839) all completed successfully for this release evidence.

This tab's dated CI, release, and acceptance receipts remain historical evidence. Use this snapshot and the linked release for the current status.

**目前狀態快照 — 2026 年 8 月 13 日：**

- `main` 同 `origin/main` 係 [`5cb2281643b788b0038412072b939b4ee9a6e635`](https://github.com/Ding-Ding-Projects/desktop-material/commit/5cb2281643b788b0038412072b939b4ee9a6e635)。
- GitHub 而家有一個 open issue：[#190 — Reconcile current roadmap and release receipts](https://github.com/Ding-Ding-Projects/desktop-material/issues/190)。
- 最新已發佈嘅 Release 係 [`v4.0.119101`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.119101)，喺 `2026-08-13T23:02:56Z` 為呢個 exact commit 發佈。佢有六個可下載資產：`GitHub.Desktop-x64.zip`、`GitHubDesktop-4.0.119101-full.nupkg`、`GitHubDesktop-4.0.119101-x64-full.nupkg`、`GitHubDesktopSetup-x64.exe`、`GitHubDesktopSetup-x64.msi` 同 `RELEASES`。
- [CI Windows 執行 `31747636431`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636431)、[CI Linux 執行 `31747636425`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636425)、[Cheap LFS 執行 `31747636429`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31747636429) 同 [Release workflow 執行 `31750286839`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/31750286839) 都已經為今次 Release 證據成功完成。

呢個分頁入面有日期嘅 CI、Release 同接受憑證仍然係歷史證據；目前狀態請以上面嘅快照同已連結嘅 Release 為準。

## Product scope / 產品範圍

The numbered roadmap now extends through M27. M0–M21 and M23 have published
receipts, M22 retains its separately tracked visual refresh, and the exact
acceptance/publication state for M24–M27 is maintained in
[`ROADMAP.md`](../../ROADMAP.md). The July 22 feature continuation is published at
`f7b4760a13`: [CI `29972351158`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351158),
[code scanning `29972351173`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351173),
and [Build Installers `29973527338`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29973527338)
passed before the exact-target Windows release
[`v3.6.3-beta3-b0000040887`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000040887)
published with all six required assets.

編號路線圖而家去到 M27。M0–M21 同 M23 有已發佈憑證，M22 保留佢獨立追蹤嘅視覺更新，而 M24–M27 嘅精確接受／發佈狀態維護喺 [`ROADMAP.md`](../../ROADMAP.md)。7 月 22 日嘅功能接續發佈喺 `f7b4760a13`：[CI `29972351158`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351158)、[code scanning `29972351173`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29972351173) 同 [Build Installers `29973527338`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29973527338) 全部通過，之後精確目標嘅 Windows 發佈 [`v3.6.3-beta3-b0000040887`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-b0000040887) 帶齊六個必要資產出街。

Cross-lane updater recovery is now published and installed. Commits
[`241cc90`](https://github.com/Ding-Ding-Projects/desktop-material/commit/241cc90ce90f240bad075edac7ebe43eea515df8)
and
[`04246fdf`](https://github.com/Ding-Ding-Projects/desktop-material/commit/04246fdf12c09446b88d2f40130581d603131c8e)
gave automatic and Super Express packages one alphabetic `z…` namespace that
sorts above legacy `b…`/`s…` builds without overflowing Squirrel's comparer.
[CI `29977738533`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29977738533),
[Build Installers `29978844761`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29978844761),
and
[Super Express `29980281736`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29980281736)
succeeded on exact source `04246fdf12`; a live legacy `s000000000201` install
automatically migrated, then visibly downloaded the greater same-SHA
`zadtbhvdfc` package and reached **Quit and Install Update**.

跨線道嘅更新器復原已經發佈同裝到。Commit [`241cc90`](https://github.com/Ding-Ding-Projects/desktop-material/commit/241cc90ce90f240bad075edac7ebe43eea515df8) 同 [`04246fdf`](https://github.com/Ding-Ding-Projects/desktop-material/commit/04246fdf12c09446b88d2f40130581d603131c8e) 令自動同 Super Express 套件共用一個字母 `z…` 命名空間，排喺舊 `b…`／`s…` 建置之上，亦唔會令 Squirrel 嘅比較器溢位。[CI `29977738533`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29977738533)、[Build Installers `29978844761`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29978844761) 同 [Super Express `29980281736`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/29980281736) 喺精確來源 `04246fdf12` 上成功；一個真實嘅舊 `s000000000201` 安裝自動遷移，然後見到佢下載更大嘅同 SHA `zadtbhvdfc` 套件，去到 **Quit and Install Update**。

The July 23 Cheap LFS, batched-push, and responsive Releases continuation is
now published through corrective source
[`c22e29a03a`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c22e29a03ac14b01e35ab7b1434fa288bc794307).
Exact-source CI `30055965807`, code scanning `30055965809`, Pages
`30055965817`, and cloud-compression run `30055965804` passed. Installer run
[`30057456712`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30057456712)
then published the immutable six-asset exact-target Windows Release
[`v3.6.3-beta3-zadthusbjk`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-zadthusbjk).

7 月 23 日嘅 Cheap LFS、批次推送同響應式 Releases 接續，而家經修正來源 [`c22e29a03a`](https://github.com/Ding-Ding-Projects/desktop-material/commit/c22e29a03ac14b01e35ab7b1434fa288bc794307) 發佈。精確來源嘅 CI `30055965807`、code scanning `30055965809`、Pages `30055965817` 同雲端壓縮執行 `30055965804` 全部通過。之後安裝程式執行 [`30057456712`](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/30057456712) 發佈咗不可變、六資產、精確目標嘅 Windows Release [`v3.6.3-beta3-zadthusbjk`](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v3.6.3-beta3-zadthusbjk)。

The public
[`codingmachineedge/bambu-build`](https://github.com/codingmachineedge/bambu-build)
acceptance exercised **14,809,588,162 bytes across 8,305 files**, including ten
Cheap LFS pointers, through four UI-created and exact-SHA-proven batches. An
HTTP 408 left the first pending commit durable; the UI retry pushed that same
immutable SHA before continuing. Cloud run
[`30048474438`](https://github.com/codingmachineedge/bambu-build/actions/runs/30048474438)
reported **13 compressed, 0 kept raw, and 0 failed**, while retaining all 13
raw originals beside the 13 compressed assets. Final UI commit
[`712ad85`](https://github.com/codingmachineedge/bambu-build/commit/712ad85f92f9002474f0f13b6bb6991153d586af)
passed verifier run
[`30054805137`](https://github.com/codingmachineedge/bambu-build/actions/runs/30054805137)
and published its immutable manifest Release. A fresh UI clone restored all
ten logical hashes while Git retained 370–514-byte pointer blobs. Its first
automatic/manual materialization overlap produced two hash-identical CAS
recovery copies and prompted repository-scoped serialization; the exact final
corrected acceptance receipt remains in [`HANDOFF.md`](../../HANDOFF.md).

公開嘅 [`codingmachineedge/bambu-build`](https://github.com/codingmachineedge/bambu-build) 接受測試處理咗 **8,305 個檔案共 14,809,588,162 bytes**，包括十個 Cheap LFS pointer，經四個由 UI 建立、精確 SHA 證明嘅批次完成。一次 HTTP 408 令第一個待處理 commit 持久保留；UI 重試推送咗同一個不可變 SHA 先繼續。雲端執行 [`30048474438`](https://github.com/codingmachineedge/bambu-build/actions/runs/30048474438) 報告 **13 個已壓縮、0 個保留原始、0 個失敗**，同時喺 13 個壓縮資產旁邊保留晒 13 個原始檔。最後嘅 UI commit [`712ad85`](https://github.com/codingmachineedge/bambu-build/commit/712ad85f92f9002474f0f13b6bb6991153d586af) 通過驗證器執行 [`30054805137`](https://github.com/codingmachineedge/bambu-build/actions/runs/30054805137)，並且發佈咗佢不可變嘅 manifest Release。一個全新 UI clone 還原晒十個邏輯雜湊，而 Git 仍然保留 370–514 bytes 嘅 pointer blob。佢第一次自動／手動實體化重疊產生咗兩份雜湊相同嘅 CAS 復原副本，因此改成綁儲存庫嘅串行化；精確嘅最終修正接受收據留喺 [`HANDOFF.md`](../../HANDOFF.md)。

The persistent, visible/collapsible tab-group chips; localized command-palette
rows and appearance controls; deterministic bare-Alt menu sequencing; and
unit/script gates before Super Express packaging are included in the published
`f7b4760a13` checkpoint above. Its exact unpackaged production build and
isolated off-screen group/palette interaction passed, and the two accepted
synthetic-only captures appear in the [Screenshots](screenshots.md) tab. The implementation ledger is in
[`PLAN.md`](../../PLAN.md), with exact publication evidence in
[`HANDOFF.md`](../../HANDOFF.md).

持久、可見／可摺疊嘅分頁群組標籤；本地化嘅命令面板列同外觀控制；確定性嘅單獨 Alt 選單次序；以及 Super Express 打包前嘅單元／script 關卡，全部包含喺上面已發佈嘅 `f7b4760a13` 檢查點。佢嘅精確未打包生產建置同隔離離屏群組／面板互動通過，兩張接受咗嘅純合成擷取放喺 [截圖](screenshots.md) 分頁。實作分類帳喺 [`PLAN.md`](../../PLAN.md)，精確發佈證據喺 [`HANDOFF.md`](../../HANDOFF.md)。

The M20 platform wave and earlier post-M19 adaptive customization maintenance
release described in the [Features](features.md) tab are shipped on `main`. Their exact production build,
off-screen interaction review, compact and zoomed layout checks, safety
boundaries, and seven privacy-safe captures are recorded in
[`HANDOFF.md`](../../HANDOFF.md); the existing M0–M19 receipts remain historical
evidence for their original releases. The July 18–19 temporary-submodule
navigation and delivery-hardening changes have completed ten-pass off-screen
local acceptance, post-build child/Back regression, a final duplicate Open/Back
race regression, and owned headless-resource cleanup. The earlier accepted
exact MCP build returned zero in 215.38 seconds (217 seconds wall time). After
the later stale-parent correction, the same MCP command rebuilt the renderer,
but its client stream detached before returning a receipt; the resulting fresh
bundle passed the final off-screen race regression. The full local gate passed
237 focused checks, 66 temporary-context lifecycle checks, 32 localization
checks, all 562 unit-test files (3,986 passing tests and one skipped), and 16
script tests, plus TypeScript, lint, and workflow validation. The first
implementation commit (`751c9aef`) exposed a macOS arm64 error-ordering defect
and correctly produced no release. Its focused correction (`98d93ccc`) passed
the full [CI matrix](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805239)
and [CodeQL](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805243),
then published the immutable [Windows release `v3.6.3-beta3-b0000000165`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000165).
The detailed Pages, wiki, asset, and cleanup receipts are maintained in
[`HANDOFF.md`](../../HANDOFF.md).

[功能](features.md) 分頁講嘅 M20 平台浪潮，同更早期 M19 之後嘅自適應自訂維護版本，已經喺 `main` 出咗。佢哋嘅精確生產建置、離屏互動覆核、緊湊同放大版面檢查、安全界線同七張保護私隱嘅擷取，記錄喺 [`HANDOFF.md`](../../HANDOFF.md)；現有嘅 M0–M19 憑證繼續係佢哋原本版本嘅歷史證據。7 月 18–19 日嘅暫時 submodule 導覽同交付加固改動，已經完成十輪離屏本機接受、建置後嘅子項／返回回歸、最後一個重複 Open／Back 競態回歸，以及自己擁有嘅無頭資源清理。之前接受嘅精確 MCP 建置喺 215.38 秒（實際 217 秒）回傳零。之後修正過時父項之後，同一條 MCP 命令重新建置咗 renderer，但係佢個客戶端串流喺回收據之前斷咗；產生嘅新 bundle 通過咗最後嗰個離屏競態回歸。完整本機關卡通過 237 項聚焦檢查、66 項暫時脈絡生命週期檢查、32 項本地化檢查、全部 562 個單元測試檔案（3,986 個通過，一個略過）同 16 個 script 測試，加埋 TypeScript、lint 同工作流程驗證。第一個實作 commit（`751c9aef`）暴露咗一個 macOS arm64 錯誤排序缺陷，並且正確咁冇產生任何發佈。佢嘅聚焦修正（`98d93ccc`）通過完整 [CI 矩陣](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805239) 同 [CodeQL](https://github.com/codingmachineedge/desktop-material/actions/runs/29696805243)，然後發佈咗不可變嘅 [Windows 發佈 `v3.6.3-beta3-b0000000165`](https://github.com/codingmachineedge/desktop-material/releases/tag/v3.6.3-beta3-b0000000165)。詳細嘅 Pages、wiki、資產同清理收據維護喺 [`HANDOFF.md`](../../HANDOFF.md)。

## Roadmap / 路線圖

The M0–M27 status, M22 visual-publication acceptance, current maintenance work,
and acceptance rules live in [`ROADMAP.md`](../../ROADMAP.md). Detailed implementation
and verification receipts remain in [`PLAN.md`](../../PLAN.md) and
[`HANDOFF.md`](../../HANDOFF.md).


M0–M27 狀態、M22 視覺發佈接受、目前維護工作同接受規則喺 [`ROADMAP.md`](../../ROADMAP.md)。詳細嘅實作同驗證收據留喺 [`PLAN.md`](../../PLAN.md) 同 [`HANDOFF.md`](../../HANDOFF.md)。
