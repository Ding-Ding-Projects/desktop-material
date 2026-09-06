# Repository management features / 儲存庫管理功能

This category documents workflows that change which Git worktree Desktop
Material is displaying or how a repository is represented in the application.

呢個類別記錄會改變 Desktop Material 顯示緊邊個 Git worktree，或者儲存庫喺應用程式入面點樣呈現嘅工作流程。

## Features / 功能

- [Direct clone progress and long paths](direct-clone-progress.md): immediate
  progress selection and Windows checkout configuration.

- [Launchpad](launchpad.md) — review repository work in a full-width grouped
  page with truthful counts and empty states.
- [Selective stashes](selective-stashes.md) — save only an exact reviewed set
  of whole changed files with repository-bound path validation.
- [Guided sparse checkout](sparse-checkout.md) — select, review every bounded
  normalized directory root, and apply cone-mode worktree changes through a
  retained result phase.
- [Named multi-stash manager](named-stash-manager.md) — create, inspect, apply,
  pop, rename, branch from, and clear exact object-identified stashes.
- [Stash export and recovery dialog](stash-export.md) — search and select any
  number of stashes, copy them to a directory or ZIP, configure 7z compression
  and encryption options, and review exact recovery identities in a separate
  tabbed dialog.
- [Advanced history
  discovery](advanced-history-discovery.md) — search rich commit metadata and
  page commits across local branches, remote-tracking branches, and tags while
  keeping cross-ref history read-only.
- [History commit hover
  time](history-commit-hover-time.md) — show the exact authored date and an
  auto-updating relative age together in the commit row's hover/focus card.
- [Reviewed bulk branch deletion and merge
  cleanup](reviewed-bulk-branch-deletion.md) — merge one branch, merge and
  delete only after success, or review exact local branch tips in bulk while
  protecting current/default/remote refs and retaining per-branch recovery IDs.
- [Network and WSL repository
  paths](network-and-wsl-repository-paths.md) — retain UNC roots, detect mapped
  drives and WSL shares, and provide offline reconnection guidance.
- [Reviewed ordinary Git pull previews](pull-previews.md) — fetch before
  review, require a clean worktree, and integrate only the exact reviewed
  upstream object ID without a second network fetch.
- [Deleted upstream pull
  recovery](deleted-upstream-pull-recovery.md) — offer to switch to the default
  branch and retry only after the remote itself confirms the tracked branch is
  gone, refusing a dirty worktree and never pre-ticking the branch deletion.
- [Automatic remote URL
  refresh](automatic-remote-url-refresh.md) — follow a GitHub repository rename
  or transfer before network work while preserving transport, web origin,
  unrelated remotes, and deliberately divergent push targets; scheduled Git
  fails without opening credential, hook, signing, or SSH prompts.
- [Multi-remote fetch
  sync](multi-remote-fetch-sync.md) — keep the focused `Fetch <remote>` action
  for a single-remote checkout and fetch every configured remote, in a stable
  current-first order, when more than one remote exists.
- [Reviewed batch repository sync](reviewed-batch-sync.md) — pull active
  branches or fetch only across an exact reviewed subset with bounded
  concurrency and isolated results.
- [Verified merge-and-cleanup repository
  sync](sync-merge-cleanup.md) — merge reviewed work into exact local and
  default `main`, use the configured Codex/OpenCode provider only for
  conflicted files, push without force, prove remote `main`, and delete only
  unchanged owned branches and worktrees behind expected-object safeguards.
- [External stash
  interoperability](external-stash-interoperability.md) — inspect and safely
  apply, restore, branch from, or explicitly discard stashes made by other Git
  clients without rewriting their metadata.
- [Repository picker filters and
  visibility](repository-picker-filters-and-visibility.md) — fold status,
  account, service, text, and regex controls into one state-preserving
  disclosure, and locally hide repositories with an explicit recovery path.
- [Publish organization
  picker](publish-organization-picker.md) — choose a personal or organization
  owner from an anchored searchable listbox with fuzzy, substring, safe-RE2,
  and the full Regex Builder while stale account requests fail closed.
- [Repository transfer](repository-transfer.md) — choose another signed-in
  GitHub account or organization, publish either every local ref with its
  history or one clean root snapshot, verify the destination, and retarget
  `origin` while preserving a recoverable source remote.
- [Repository list sync summary](repository-list-sync-summary.md) — a
  low-emphasis line under each repository name giving the exact commits waiting
  to push and to pull, an honest unknown state for anything never checked, and
  no network call to paint it.
- [Private-repository lock
  badge](private-repository-lock-badge.md) — show a separate localized,
  keyboard-focusable lock only for explicit private provider metadata while
  retaining the repository's fork glyph, custom logo, or ordinary icon.
- [Repository list bulk actions](repository-list-bulk-actions.md) — select the
  filter-visible rows to fetch, pull, favorite, group, or forget several
  repositories, with determinate progress, cancel between repositories, and a
  removal confirmation that never deletes on-disk content.
- [Repository list collapsible
  groups](repository-list-group-collapse.md) — fold a group heading away with a
  keyboard-reachable disclosure control that keeps saying how many repositories
  it holds, persisted as an undoable, diffable profile setting, and guaranteed
  never to hide a filter match.
- [Custom repository group
  management](repository-group-management.md) — create, rename, re-populate, and
  dissolve a custom group from the list itself, with a searchable member picker
  wired to the regex builder and a removal that clears the label only and never
  removes a repository.
- [Tag lifecycle management](tag-lifecycle-management.md) — inventory, create,
  move, sign, push, fetch, prune, and explicitly delete local and remote tags
  through stale-safe reviewed operations.
- [Temporary submodule repository
  navigation](submodule-repository-navigation.md) — open an initialized child
  or changed/new submodule commit in a temporary read-only viewer without
  importing it, then Close or return to the persisted root repository.
- [Release-backed large-file
  storage](release-backed-cheap-lfs.md) — replace large tracked bytes with a
  verified GitHub Release pointer, recover a stalled or length-rejected native
  upload automatically through a bounded trusted GitHub CLI transport, ignore
  ordinary ineligible Git metadata during automatic pointer discovery while
  explicit Cheap LFS paths remain fail-closed, retain a
  verified whole-batch browser handoff, automatically cloud-compress public
  repository objects one at a time from a caller committed to that repository
  (an opted-in private repository gets no caller at all and spends none of its
  own Actions minutes; compression is routed to the encrypted public builder
  behind a fail-closed leak guard, and unconfirmed visibility runs neither
  route), publish new storage as prereleases, migrate exact legacy drafts in
  place, restore explicitly public GitHub.com assets while signed out, fail
  safely at bounded capacity limits, and restore and verify raw or mixed
  objects locally while decompressing only `part-deflate` objects. Automatic
  preparation exposes up to three bounded worker lanes with queue, provider,
  phase, byte, elapsed-time, throughput, and ETA context plus a
  keyboard-accessible storage-recommendation disclosure. Release restores also
  use one shared maximum-two-download coordinator:
  the next file or part starts at the exact 90% network point, while a shared
  detailed panel reports overall/current/look-ahead lanes, file and part
  ordinals, logical and actual bytes, phase, rate, ETA, queue, failures, and
  cancellation. Combined local tests, the exact Windows production build, and
  hidden-desktop acceptance pass; packaged E2E and remote publication remain
  separate. The [bilingual Pages product
  guide](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html)
  adds a provider-first established-branch push walkthrough, the
  unpublished-branch Release-anchor caveat, and a cross-checked 30-criterion
  Cheap LFS versus Git LFS comparison.
- [Cheap LFS versus Git LFS comparison
  atlas](cheap-lfs-vs-git-lfs.md) — a standalone Pages decision surface with
  72 row-level sourced distinctions in 12 categories, honest Cheap/Git/tie/
  depends signals, provider-first versus pre-push diagrams, an exact six-stage
  publication proof, composable filters, a worker-isolated regex builder, and
  explicit Windows, host-policy, interoperability, privacy, and open-evidence
  boundaries.
- [Cheap LFS Release payload
  encryption](cheap-lfs-release-payload-encryption.md) — optionally encrypt new
  GitHub Release payloads with repository-scoped AES-256-GCM and scrypt,
  retaining the password only for the process or in the operating-system vault
  while verifying both plaintext and ciphertext receipts.
- [Cheap LFS asset versioning and commit
  provenance](cheap-lfs-asset-versioning.md) — treat every uploaded release
  asset as write-once, so editing a pinned file uploads the new bytes as a new
  asset and every historical commit keeps restoring its own version, deduplicate
  byte-identical content on proven provider digests, and record the introducing
  commit in the committed pointer plus a best-effort asset label.
- [Cheap LFS OCI registry
  backend](cheap-lfs-oci-registry-backend.md) — store the repository object set
  as one logical GHCR or Docker Hub image, reuse unchanged layers across
  additions and removals within explicit object/layer/metadata bounds, split new
  data into 1.5 GiB layers, halve timed-out layers, retention-tag historical
  manifests, retain existing collaborator/organization targets, migrate
  providers only from verified materialized raws, encrypt verified-private
  payloads with the exact shared tracked key, and restore only immutable digest-
  pinned objects through the verified, licensed ORAS runtime.
- [Commit and push all
  repositories](commit-and-push-all.md) — pull, commit and push a chosen subset
  of the repositories that have local work, picked with checkboxes and a search
  bar whose bulk actions never reach past the filter.
- [Automatic commit and push
  batching](automatic-commit-push-batching.md) — keep ordinary selections below
  a decimal 1.5 GB push with a 1.4 GB changed-blob budget and bounded proof
  overhead, require each fast-forward push to be proven before creating the
  next commit, and safely recover oversized local-only history created by older
  app versions without force-pushing. Each app-owned commit disables auto-GC
  only for that process and accepts a reported late maintenance failure only
  after proving the exact HEAD transition. Immutable automatic batches use
  process-local no-delta/no-compression packing to avoid CPU-bound HTTP
  timeouts without changing ordinary pushes or persistent Git configuration.
  A live 8,305-file public Bambu build acceptance proved four UI-created,
  exact-SHA-pushed batches after preserving and retrying an HTTP 408 pending
  commit, compressed 13 Release objects independently with every raw fallback
  retained, passed the exact manifest verifier, and restored all ten working
  files with matching hashes after a fresh UI clone. That first Materialize-all
  action also exposed an automatic-materialization overlap, leading to
  repository-scoped serialization. Deterministic disposable-Git and UI routing
  regressions cover the correction; the promoted live ten-pointer inventory and
  separate 10/10 clone hash receipt keep the visual and byte proofs distinct.
- [Parent-folder repository
  discovery](parent-folder-repository-discovery.md) — preview and register a
  bounded, link-safe set of working trees below one selected folder.
- [Submodule, subtree, and remote creation
  workflows](submodule-subtree-and-remote-creation.md) — manage dependency
  topology, pick the tracked branch from a searchable bounded listing of the
  remote's advertised heads, and create an initialized account-bound remote
  before adding it as a submodule.
- [Ignored files to a local
  submodule](ignored-files-to-local-submodule.md) — copy only files
  `git check-ignore` currently proves are ignored into a newly created local
  repository, prove every copy by size and SHA-256 before any index is touched,
  add that repository as a submodule at a safe non-overlapping path, and leave
  every original byte-for-byte where it was. Uploads, pointers, remotes, and
  pushes are a separate opt-in phase that this one deliberately does not do.
- [Clone dialog repository
  metadata](clone-dialog-repository-metadata.md) — render each cloneable
  repository as a rich card with description, language, stars, forks, size,
  default branch, last updated, and a visibility pill, plus data-derived
  language filter chips.
- [Clone queue settings](clone-queue-settings.md) — configure each signed-in
  account's background-clone directory, parallel/sequential mode, and enabled
  state from Settings while retaining the existing bounded recovery journal.
- [Opt-in post-clone runner provisioning](post-clone-runner-provisioning.md) —
  create a repository-scoped Windows or dedicated WSL/Linux Actions runner
  only after a private GitHub repository clone succeeds and the user confirms
  its workflow authors are trusted.
- [Patch-series import and export](patch-series.md) — preview, validate, export,
  and apply portable patch sequences without silently changing unrelated work.
- [Repository list transfer and Cheap LFS](repository-list-transfer.md) — export
  sanitized clone URLs, re-clone them through the batch engine, and restore
  Cheap LFS large files after cloning without exporting credentials or local
  account/file selections.

- [Launchpad](launchpad.md) — 喺一版全寬分組頁面覆核儲存庫工作，數字誠實，亦有空狀態。
- [選擇性 stash](selective-stashes.md) — 淨係儲存一組經覆核嘅完整改動檔案，並且做綁儲存庫嘅路徑驗證。
- [引導式 sparse checkout](sparse-checkout.md) — 揀選、覆核每一個有界正規化嘅目錄根，然後經一個保留結果嘅階段套用 cone 模式 worktree 改動。
- [具名多 stash 管理員](named-stash-manager.md) — 建立、檢視、套用、pop、改名、由佢開分支同清除精確物件識別嘅 stash。
- [Stash 匯出同復原對話框](stash-export.md) — 搜尋同選取任意數量嘅 stash、複製去資料夾或者 ZIP、設定 7z 壓縮同加密選項，並且喺獨立分頁對話框覆核精確嘅復原身分。
- [進階歷史探索](advanced-history-discovery.md) — 搜尋豐富嘅 commit metadata，並且跨本機分支、遠端追蹤分支同標籤翻頁，同時保持跨 ref 歷史唯讀。
- [History commit 懸停時間](history-commit-hover-time.md) — 喺 commit 行嘅懸停／焦點卡片同時顯示精確撰寫日期同自動更新嘅相對時間。
- [經覆核嘅批次分支刪除同合併清理](reviewed-bulk-branch-deletion.md) — 合併一條分支、成功之後先合併並刪除，或者批次覆核精確嘅本機分支 tip，同時保護目前／預設／遠端 ref 並保留逐分支嘅復原 ID。
- [網絡同 WSL 儲存庫路徑](network-and-wsl-repository-paths.md) — 保留 UNC 根、偵測對應磁碟機同 WSL 共享，並提供離線重連指引。
- [經覆核嘅普通 Git pull 預覽](pull-previews.md) — 覆核之前先抓取、要求乾淨 worktree，並且淨係整合精確覆核過嘅上游物件 ID，唔會再抓一次網絡。
- [上游被刪除嘅 pull 復原](deleted-upstream-pull-recovery.md) — 要等 remote 自己確認追蹤分支已經消失，先提議切換去預設分支同重試；拒絕污糟嘅 worktree，亦都永遠唔會預先剔選刪除分支。
- [自動 remote URL 更新](automatic-remote-url-refresh.md) — 喺網絡工作之前跟住 GitHub 儲存庫改名或者轉移，同時保留傳輸方式、web origin、無關 remote 同刻意分歧嘅推送目標；排程 Git 失敗時唔會彈憑證、hook、簽署或者 SSH 提示。
- [多 remote 抓取同步](multi-remote-fetch-sync.md) — 單 remote checkout 保持專注嘅 `Fetch <remote>` 操作；有多過一個 remote 就以穩定嘅「目前優先」次序抓取每一個已設定 remote。
- [經覆核嘅批次儲存庫同步](reviewed-batch-sync.md) — 喺一個精確覆核過嘅子集上 pull 使用中分支或者淨係 fetch，並行度有界，結果互相隔離。
- [已驗證嘅合併加清理儲存庫同步](sync-merge-cleanup.md) — 將覆核過嘅工作合併入精確嘅本機同預設 `main`，淨係喺衝突檔案上用已設定嘅 Codex／OpenCode 供應方，唔用 force 推送，證明遠端 `main`，並且喺預期物件防護之下淨係刪除冇改動、自己擁有嘅分支同 worktree。
- [外部 stash 互通](external-stash-interoperability.md) — 檢視並安全咁套用、還原、由佢開分支或者明確捨棄其他 Git 客戶端整嘅 stash，唔會改寫佢哋嘅 metadata。
- [儲存庫選擇器篩選同可見性](repository-picker-filters-and-visibility.md) — 將狀態、帳戶、服務、文字同 regex 控制收埋入一個會保留狀態嘅摺疊控制項，並且可以本機隱藏儲存庫，附明確嘅復原路徑。
- [Publish 組織選擇器](publish-organization-picker.md) — 由一個錨定、可搜尋嘅 listbox 揀個人或者組織擁有者，支援模糊、子字串、安全 RE2 同完整 Regex Builder，而過時嘅帳戶請求會 fail closed。
- [儲存庫轉移](repository-transfer.md) — 揀另一個已登入嘅 GitHub 帳戶或者組織，發佈每一條本機 ref 連歷史或者一個乾淨嘅 root 快照，驗證目的地，然後改 `origin`，同時保留一個可復原嘅來源 remote。
- [儲存庫清單同步摘要](repository-list-sync-summary.md) — 喺每個儲存庫名下面一行低調文字，講明確實有幾多 commit 等緊推同拉，從來未檢查過嘅就誠實顯示未知，而且畫佢嗰陣唔會叫任何網絡。
- [私人儲存庫鎖標記](private-repository-lock-badge.md) — 淨係喺有明確私人供應方 metadata 嗰陣，顯示一個獨立、本地化、鍵盤可聚焦嘅鎖，同時保留儲存庫嘅 fork 字形、自訂標誌或者普通圖示。
- [儲存庫清單批次操作](repository-list-bulk-actions.md) — 揀選篩選後見到嘅行去 fetch、pull、加入最愛、分組或者忘記多個儲存庫，有確定性進度、可以喺儲存庫之間取消，而移除確認永遠唔會刪除磁碟內容。
- [儲存庫清單可摺疊群組](repository-list-group-collapse.md) — 用一個鍵盤到得到嘅摺疊控制項收埋群組標題，同時繼續講明佢包住幾多個儲存庫，狀態存成一個可還原、可 diff 嘅設定檔設定，並且保證永遠唔會收埋一個符合篩選嘅項目。
- [自訂儲存庫群組管理](repository-group-management.md) — 由清單本身建立、改名、重新填充同解散自訂群組，配一個接駁 regex builder 嘅可搜尋成員選擇器，而移除淨係清走標籤，唔會移除儲存庫。
- [標籤生命週期管理](tag-lifecycle-management.md) — 經防過時嘅覆核操作盤點、建立、移動、簽署、推送、抓取、修剪同明確刪除本機同遠端標籤。
- [暫時 submodule 儲存庫導覽](submodule-repository-navigation.md) — 喺一個暫時唯讀檢視器打開已初始化嘅子項或者有改動／新嘅 submodule commit，唔使匯入，之後閂咗或者返回持久化嘅根儲存庫。
- [Release 支援嘅大檔案儲存](release-backed-cheap-lfs.md) — 用已驗證嘅 GitHub Release pointer 取代大型追蹤位元組；經一個有界、受信任嘅 GitHub CLI 傳輸自動復原停滯或者被拒長度嘅原生上載；自動 pointer 探索期間略過唔合資格嘅普通 Git metadata，而明確嘅 Cheap LFS 路徑保持 fail-closed；保留已驗證嘅整批瀏覽器交接；由一個已委身該儲存庫嘅呼叫方逐個自動雲端壓縮公開儲存庫物件（自願加入嘅私人儲存庫完全冇呼叫方，亦都唔會用自己嘅 Actions 分鐘；壓縮會喺 fail-closed 洩漏防護後面導向加密嘅公開建置器，而可見性未確認就兩條路都唔行）；將新儲存發佈成預發行；就地遷移精確嘅舊草稿；喺未登入嘅情況下還原明確公開嘅 GitHub.com 資產；喺有界容量上限安全咁失敗；並且喺本機還原同驗證原始或者混合物件，同時淨係解壓 `part-deflate` 物件。自動準備最多開三條有界工作線道，附佇列、供應方、階段、位元組、已用時間、吞吐量同 ETA 脈絡，加一個鍵盤可存取嘅儲存建議摺疊。Release 還原亦都用同一個「最多兩個下載」協調器：下一個檔案或者分段喺啱啱好 90% 網絡點開始，而一個共用嘅詳細面板報告整體／目前／預讀線道、檔案同分段序號、邏輯同實際位元組、階段、速率、ETA、佇列、失敗同取消。合併本機測試、精確 Windows 生產建置同隱藏桌面接受全部通過；已打包 E2E 同遠端發佈仍然係另外嘅關卡。[雙語 Pages 產品指南](https://ding-ding-projects.github.io/desktop-material/cheap-lfs.html) 加咗供應方優先嘅已建立分支推送教學、未發佈分支嘅 Release 錨點注意事項，同一個交叉核對嘅 30 準則 Cheap LFS 對 Git LFS 比較。
- [Cheap LFS 對 Git LFS 比較地圖](cheap-lfs-vs-git-lfs.md) — 一個獨立嘅 Pages 決策介面，12 個類別入面有 72 項逐行標明出處嘅差異，誠實嘅 Cheap／Git／打和／視情況訊號，供應方優先對 pre-push 圖表，一個精確嘅六階段發佈證明，可組合篩選、worker 隔離嘅 regex builder，以及明確嘅 Windows、主機政策、互通、私隱同公開證據界線。
- [Cheap LFS Release 負載加密](cheap-lfs-release-payload-encryption.md) — 可選咁用綁儲存庫嘅 AES-256-GCM 同 scrypt 加密新嘅 GitHub Release 負載，密碼淨係喺行程內或者作業系統保管庫保留，同時驗證明文同密文兩邊嘅收據。
- [Cheap LFS 資產版本同 commit 出處](cheap-lfs-asset-versioning.md) — 每一個上載嘅 release 資產都當一次寫入：改一個釘住嘅檔案就將新位元組上載成新資產，而每一個歷史 commit 繼續還原返自己嗰個版本；喺已證明嘅供應方摘要上為位元組相同嘅內容去重，並且喺已提交嘅 pointer 記錄引入 commit，加一個盡力而為嘅資產標籤。
- [Cheap LFS OCI registry 後端](cheap-lfs-oci-registry-backend.md) — 將儲存庫物件集存成一個邏輯 GHCR 或者 Docker Hub 映像，喺明確嘅物件／層／metadata 界限內，跨新增同移除重用冇改動嘅層；新資料切成 1.5 GiB 層；逾時嘅層對半再試；歷史 manifest 加保留標籤；保留現有嘅協作者／組織目標；淨係由已驗證嘅實體化原始資料遷移供應方；用精確嘅共用追蹤金鑰加密已驗證私人負載；並且淨係經已驗證、有授權嘅 ORAS 執行環境還原不可變、摘要釘住嘅物件。
- [提交同推送全部儲存庫](commit-and-push-all.md) — 對有本機工作嘅儲存庫，揀一個子集去 pull、commit 同 push，用勾選框同搜尋列揀，而批次操作永遠唔會伸出篩選範圍以外。
- [自動 commit 同 push 批次](automatic-commit-push-batching.md) — 令普通選取維持喺十進位 1.5 GB 推送以下，改動 blob 預算 1.4 GB，證明開銷有界；每次快進推送要證明咗先可以整下一個 commit；並且安全咁復原舊版本 app 造成嘅超大本機歷史，唔使 force push。每一個 app 擁有嘅 commit 淨係為該行程停用 auto-GC，而且要證明咗精確 HEAD 轉換之後，先接受一個報告出嚟嘅遲到維護失敗。不可變嘅自動批次用行程本地嘅無 delta／無壓縮打包，避免 CPU 綁住嘅 HTTP 逾時，同時唔改變普通推送或者持久 Git 設定。一次真實嘅 8,305 檔案公開 Bambu 建置接受測試，證明咗四個由 UI 建立、精確 SHA 推送嘅批次（期間保留同重試咗一個 HTTP 408 待處理 commit），獨立壓縮咗 13 個 Release 物件並保留每個原始後備，通過精確 manifest 驗證器，並且喺全新 UI clone 之後還原晒十個工作檔案同雜湊吻合。嗰次第一個 Materialize-all 操作亦都揭露咗自動實體化重疊，之後改成綁儲存庫嘅串行化。確定性嘅可棄 Git 同 UI 路由回歸覆蓋咗呢個修正；推廣咗嘅真實十 pointer 盤點同獨立嘅 10/10 clone 雜湊收據，令視覺同位元組證明分得清楚。
- [上層資料夾儲存庫探索](parent-folder-repository-discovery.md) — 預覽同註冊一個選定資料夾下面有界、防連結陷阱嘅工作樹集合。
- [Submodule、subtree 同 remote 建立工作流程](submodule-subtree-and-remote-creation.md) — 管理依賴拓撲，由 remote 公告 head 嘅有界可搜尋清單揀追蹤分支，並且喺加做 submodule 之前建立一個已初始化、綁帳戶嘅 remote。
- [將被忽略檔案放入本機 submodule](ignored-files-to-local-submodule.md) — 淨係將 `git check-ignore` 目前證明被忽略嘅檔案，複製入一個新建嘅本機儲存庫；喺郁任何 index 之前用大小同 SHA-256 證明每一次複製；將該儲存庫喺一個安全、唔重疊嘅路徑加做 submodule；並且將每一個原始位元組原封不動留喺原地。上載、pointer、remote 同推送係另一個要主動選擇嘅階段，呢一步刻意唔做。
- [Clone 對話框儲存庫 metadata](clone-dialog-repository-metadata.md) — 將每個可 clone 嘅儲存庫呈現成豐富卡片，有描述、語言、星數、fork 數、大小、預設分支、最後更新同可見性標籤，再加由資料推導嘅語言篩選標籤。
- [Clone 佇列設定](clone-queue-settings.md) — 喺設定入面為每個已登入帳戶設定背景 clone 目錄、並行／順序模式同啟用狀態，同時保留現有嘅有界復原日誌。
- [自願加入嘅 clone 後 runner 佈署](post-clone-runner-provisioning.md) — 淨係喺私人 GitHub 儲存庫 clone 成功、而且用戶確認信任佢嘅工作流程作者之後，先建立綁儲存庫嘅 Windows 或者專用 WSL／Linux Actions runner。
- [Patch 系列匯入同匯出](patch-series.md) — 預覽、驗證、匯出同套用可攜嘅 patch 序列，唔會靜靜雞改動無關嘅工作。
- [儲存庫清單轉移同 Cheap LFS](repository-list-transfer.md) — 匯出消毒過嘅 clone URL、經批次引擎重新 clone，並且喺 clone 之後還原 Cheap LFS 大檔案，唔會匯出憑證或者本機帳戶／檔案選取。

## API applicability / API 適用性

These features use the renderer, dispatcher, repository store, and bounded Git
helpers. They add no HTTP endpoint, so a Postman collection is not applicable.


呢啲功能用嘅係 renderer、dispatcher、儲存庫 store 同有界嘅 Git 輔助程式。佢哋唔加 HTTP 端點，所以唔適用 Postman 集合。
