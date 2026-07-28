;(function () {
  'use strict'

  var StorageKeys = {
    category: 'desktop-material-lfs-atlas-category-v1',
    outcome: 'desktop-material-lfs-atlas-outcome-v1',
    tabOrder: 'desktop-material-lfs-atlas-tab-order-v1',
    pinnedTabs: 'desktop-material-lfs-atlas-pinned-tabs-v1',
    appearance: 'desktop-material-lfs-atlas-appearance-v1',
    fit: 'desktop-material-lfs-atlas-fit-v1',
  }

  var SourceRegistry = {
    C1: {
      icon: '🧭',
      en: 'Release-backed Cheap LFS technical reference',
      yue: 'Release-backed Cheap LFS 技術文件',
      kind: 'Cheap LFS',
      url: 'docs/features/repository-management/release-backed-cheap-lfs.html',
    },
    C2: {
      icon: '📦',
      en: 'Cheap LFS OCI registry backend',
      yue: 'Cheap LFS OCI registry backend',
      kind: 'Cheap LFS',
      url: 'docs/features/repository-management/cheap-lfs-oci-registry-backend.html',
    },
    C3: {
      icon: '🔐',
      en: 'Cheap LFS Release payload encryption',
      yue: 'Cheap LFS Release payload 加密',
      kind: 'Cheap LFS',
      url: 'docs/features/repository-management/cheap-lfs-release-payload-encryption.html',
    },
    C4: {
      icon: '🧾',
      en: 'Cheap LFS pointer implementation',
      yue: 'Cheap LFS pointer 實作',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/pointer.ts',
    },
    C5: {
      icon: '📏',
      en: 'Desktop Material large-file threshold',
      yue: 'Desktop Material 大檔門檻',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/large-files.ts',
    },
    C6: {
      icon: '🧠',
      en: 'Desktop Material application store',
      yue: 'Desktop Material application store',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/stores/app-store.ts',
    },
    C7: {
      icon: '🪟',
      en: 'Desktop Material supported platform',
      yue: 'Desktop Material 支援平台',
      kind: 'Project',
      url: 'README.html',
    },
    C8: {
      icon: '🚦',
      en: 'Open 50+ GiB inventory hardening issue',
      yue: '50+ GiB inventory hardening open issue',
      kind: 'Boundary',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/issues/96',
    },
    C9: {
      icon: '🎛️',
      en: 'Cheap LFS settings and inventory UI',
      yue: 'Cheap LFS 設定同 inventory UI',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/ui/repository-settings/cheap-lfs-settings.tsx',
    },
    C10: {
      icon: '🛡️',
      en: 'Tracked-path safety implementation',
      yue: 'Tracked-path 安全實作',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/tracked-path-store.ts',
    },
    C11: {
      icon: '🛟',
      en: 'Manual Release upload handoff',
      yue: '手動 Release upload 交接',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/manual-upload.ts',
    },
    C12: {
      icon: '📈',
      en: 'Restore progress model',
      yue: 'Restore progress 模型',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/restore-progress.ts',
    },
    C13: {
      icon: '🗜️',
      en: 'Cheap LFS cloud compression',
      yue: 'Cheap LFS 雲端壓縮',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/cloud-compression.ts',
    },
    C14: {
      icon: '🤖',
      en: 'Unattended encryption guard',
      yue: 'Unattended encryption 護欄',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/unattended-encryption.ts',
    },
    C15: {
      icon: '⚓',
      en: 'First-publication branch anchor',
      yue: '第一次發佈 branch anchor',
      kind: 'Cheap LFS source',
      url: 'https://github.com/Ding-Ding-Projects/desktop-material/blob/823f7fa0e5b4ebefd35ee8434c9c90ed420a6127/app/src/lib/cheap-lfs/first-publish.ts',
    },
    G1: {
      icon: '🐙',
      en: 'GitHub: About Git Large File Storage',
      yue: 'GitHub：Git Large File Storage 總覽',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage',
    },
    G2: {
      icon: '💳',
      en: 'GitHub: Git LFS billing',
      yue: 'GitHub：Git LFS 計費',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/billing/concepts/product-billing/git-lfs',
    },
    G3: {
      icon: '🤝',
      en: 'GitHub: Collaborating with Git LFS',
      yue: 'GitHub：Git LFS 協作',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files/collaboration-with-git-large-file-storage',
    },
    G4: {
      icon: '📜',
      en: 'Official Git LFS specification',
      yue: '官方 Git LFS 規格',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md',
    },
    G5: {
      icon: '⚙️',
      en: 'Official Git LFS configuration manual',
      yue: '官方 Git LFS 設定 manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc',
    },
    G6: {
      icon: '🎯',
      en: 'Official git-lfs-track manual',
      yue: '官方 git-lfs-track manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-track.adoc',
    },
    G7: {
      icon: '🚚',
      en: 'Official git-lfs-migrate manual',
      yue: '官方 git-lfs-migrate manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc',
    },
    G8: {
      icon: '🔒',
      en: 'Official Git LFS locking API',
      yue: '官方 Git LFS locking API',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md',
    },
    G9: {
      icon: '🏷️',
      en: 'GitHub: About Releases',
      yue: 'GitHub：Releases 總覽',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases',
    },
    G10: {
      icon: '📐',
      en: 'GitHub: Regular Git large-file limits',
      yue: 'GitHub：普通 Git 大檔限制',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github',
    },
    G11: {
      icon: '⚡',
      en: 'Official actions/checkout LFS input',
      yue: '官方 actions/checkout LFS input',
      kind: 'GitHub Actions',
      url: 'https://github.com/actions/checkout',
    },
    G12: {
      icon: '🧰',
      en: 'GitHub: Installing Git LFS',
      yue: 'GitHub：安裝 Git LFS',
      kind: 'Git LFS',
      url: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files/installing-git-large-file-storage',
    },
    G13: {
      icon: '🧹',
      en: 'Official git-lfs-prune manual',
      yue: '官方 git-lfs-prune manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-prune.adoc',
    },
    G14: {
      icon: '📥',
      en: 'Official git-lfs-fetch manual',
      yue: '官方 git-lfs-fetch manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-fetch.adoc',
    },
    G15: {
      icon: '🗑️',
      en: 'GitHub: Removing Git LFS objects',
      yue: 'GitHub：移除 Git LFS objects',
      kind: 'GitHub policy',
      url: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files/removing-files-from-git-large-file-storage',
    },
    G16: {
      icon: '🌍',
      en: 'Official Git LFS project',
      yue: '官方 Git LFS project',
      kind: 'Git LFS',
      url: 'https://git-lfs.com/',
    },
    G17: {
      icon: '🪝',
      en: 'Official git-lfs-pre-push manual',
      yue: '官方 git-lfs-pre-push manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pre-push.adoc',
    },
    G18: {
      icon: '🔁',
      en: 'Official Git LFS batch API',
      yue: '官方 Git LFS batch API',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md',
    },
    G19: {
      icon: '🧩',
      en: 'Official Git LFS extensions',
      yue: '官方 Git LFS extensions',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/extensions.md',
    },
    G20: {
      icon: '✅',
      en: 'Official git-lfs-checkout manual',
      yue: '官方 git-lfs-checkout manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-checkout.adoc',
    },
    G21: {
      icon: '🚀',
      en: 'Official git-lfs-push manual',
      yue: '官方 git-lfs-push manual',
      kind: 'Git LFS',
      url: 'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-push.adoc',
    },
  }

  var Categories = [
    {
      id: 'identity',
      emoji: '🧬',
      en: 'Identity & ecosystem',
      yue: '身份同生態',
    },
    { id: 'setup', emoji: '🧰', en: 'Setup & tracking', yue: '設定同追蹤' },
    {
      id: 'pointer',
      emoji: '🧾',
      en: 'Pointer & Git history',
      yue: 'Pointer 同 Git 歷史',
    },
    {
      id: 'push',
      emoji: '🚀',
      en: 'Commit & push',
      yue: 'Commit 同 push',
    },
    {
      id: 'storage',
      emoji: '☁️',
      en: 'Providers & storage',
      yue: 'Provider 同儲存',
    },
    {
      id: 'cost',
      emoji: '💸',
      en: 'Limits, cost & retention',
      yue: '限制、成本同保留',
    },
    {
      id: 'transfer',
      emoji: '⚡',
      en: 'Transfer & performance',
      yue: '傳輸同效能',
    },
    {
      id: 'restore',
      emoji: '🛟',
      en: 'Restore, cache & offline',
      yue: '還原、cache 同離線',
    },
    {
      id: 'security',
      emoji: '🛡️',
      en: 'Integrity, security & privacy',
      yue: '完整性、安全同私隱',
    },
    {
      id: 'collaboration',
      emoji: '🤝',
      en: 'Collaboration & review',
      yue: '協作同審閱',
    },
    {
      id: 'migration',
      emoji: '🚚',
      en: 'Migration & recovery',
      yue: '搬遷同救援',
    },
    {
      id: 'automation',
      emoji: '🤖',
      en: 'CI, archives & operations',
      yue: 'CI、archive 同營運',
    },
  ]

  var Rows = []

  function add(
    category,
    outcome,
    titleEn,
    titleYue,
    cheapEn,
    cheapYue,
    gitEn,
    gitYue,
    sources
  ) {
    Rows.push({
      id: 'difference-' + String(Rows.length + 1).padStart(2, '0'),
      number: Rows.length + 1,
      category: category,
      outcome: outcome,
      title: { en: titleEn, yue: titleYue },
      cheap: { en: cheapEn, yue: cheapYue },
      git: { en: gitEn, yue: gitYue },
      sources: sources,
      reviewed: '2026-07-28',
    })
  }

  add(
    'identity',
    'git',
    'Supported operating systems',
    '支援作業系統',
    'The supported Desktop Material product path is Windows-only.',
    'Desktop Material 正式支援嘅產品路線係 Windows-only。',
    'Official Git LFS packages and clients cover Windows, macOS, and Linux.',
    '官方 Git LFS package 同 client 覆蓋 Windows、macOS 同 Linux。',
    ['C7', 'G16']
  )
  add(
    'identity',
    'depends',
    'Primary experience',
    '主要使用體驗',
    'An integrated visual workflow for reviewing, pinning, restoring, and troubleshooting large files.',
    '整合式圖像流程，用嚟審閱、pin、還原同處理大檔問題。',
    'A CLI and Git-filter workflow, complemented by host and third-party integrations.',
    '以 CLI 同 Git filter 為主，再配 host 同第三方整合。',
    ['C1', 'C9', 'G16']
  )
  add(
    'identity',
    'git',
    'Published standard',
    '公開標準',
    'Uses the Desktop Material-specific <code>desktop-material/cheap-lfs/v1</code> pointer family.',
    '使用 Desktop Material 專用 <code>desktop-material/cheap-lfs/v1</code> pointer family。',
    'Publishes a documented pointer format plus client/server transfer contracts.',
    '有公開文件嘅 pointer 格式同 client/server transfer contract。',
    ['C4', 'G4', 'G18']
  )
  add(
    'identity',
    'depends',
    'Storage architecture',
    '儲存架構',
    'Points directly to GitHub Release assets or immutable OCI snapshot coordinates.',
    '直接指向 GitHub Release asset 或 immutable OCI snapshot coordinate。',
    'Points to SHA-256 objects served through an LFS-compatible endpoint.',
    '指向由 LFS-compatible endpoint 提供嘅 SHA-256 object。',
    ['C1', 'C2', 'G4', 'G18']
  )
  add(
    'identity',
    'git',
    'Host breadth',
    'Host 覆蓋範圍',
    'Purpose-built around GitHub plus selected GHCR and Docker Hub registry routes.',
    '為 GitHub、GHCR 同 Docker Hub 指定路線而設。',
    'Works with GitHub, GitHub Enterprise, and other compatible LFS servers.',
    '可配 GitHub、GitHub Enterprise 同其他 compatible LFS server。',
    ['C2', 'G5', 'G16']
  )
  add(
    'identity',
    'depends',
    'Best-fit audience',
    '最啱用家',
    'Windows teams that value guided provider checks, visible recovery, and app-managed state.',
    '重視 provider 檢查、可見救援同 app-managed state 嘅 Windows team。',
    'Cross-platform teams that value standard tools, broad integration, and scriptability.',
    '重視標準工具、廣泛整合同 scriptability 嘅跨平台 team。',
    ['C1', 'C7', 'G16']
  )

  add(
    'setup',
    'cheap',
    'Client installation',
    'Client 安裝',
    'Already built into Desktop Material; no separate large-file executable is needed for the supported app workflow.',
    '已經內置 Desktop Material；正式 app 流程唔使另裝大檔 executable。',
    'Requires Git LFS installation, then <code>git lfs install</code> for the user or repository.',
    '要先安裝 Git LFS，再為用家或 repo 跑 <code>git lfs install</code>。',
    ['C1', 'G12']
  )
  add(
    'setup',
    'depends',
    'Repository initialization',
    'Repo 初始化',
    'Provider, tracked files, restore behavior, and optional encryption are configured in the app.',
    '喺 app 設定 provider、tracked file、還原行為同可選加密。',
    'Initialization installs filters and hooks; tracking rules live in committed <code>.gitattributes</code>.',
    '初始化會安裝 filter 同 hook；追蹤規則寫入已 commit <code>.gitattributes</code>。',
    ['C1', 'C9', 'G6', 'G12']
  )
  add(
    'setup',
    'git',
    'Pattern-based tracking',
    'Pattern 追蹤',
    'Primarily reviews exact concrete files chosen through Desktop Material.',
    '主要經 Desktop Material 審閱逐個具體檔案。',
    '<code>git lfs track</code> writes glob or literal rules shared through <code>.gitattributes</code>.',
    '<code>git lfs track</code> 將 glob 或 literal 規則寫入共享 <code>.gitattributes</code>。',
    ['C1', 'G6']
  )
  add(
    'setup',
    'cheap',
    'Automatic size gate',
    '自動大小門檻',
    'Can automatically route selected working-tree files strictly over 100 MiB into the Cheap LFS review.',
    '可將嚴格大過 100 MiB 嘅所選 working-tree file 自動送入 Cheap LFS 審閱。',
    'Core Git LFS does not automatically choose files by a universal size threshold; teams define tracking rules.',
    'Core Git LFS 冇全域自動大小門檻；team 自己定 tracking rule。',
    ['C1', 'C5', 'G6', 'G10']
  )
  add(
    'setup',
    'cheap',
    'Exact-file review',
    '逐檔審閱',
    'Shows the path, provider, source facts, and intended pointer destination before a manual pin.',
    '手動 pin 前會顯示 path、provider、source 事實同預計 pointer 目的地。',
    'Offers CLI previews such as <code>git lfs track --dry-run</code>, but not the same integrated per-file review card.',
    '有 <code>git lfs track --dry-run</code> 等 CLI preview，但唔係同款整合逐檔 review card。',
    ['C1', 'G6']
  )
  add(
    'setup',
    'git',
    'Collaborator onboarding',
    '協作者上手',
    'Every collaborator who needs bytes must use Desktop Material-aware restore tooling and provider access.',
    '每個要真 bytes 嘅協作者都要 Desktop Material-aware 還原工具同 provider access。',
    'Committed attributes plus a widely available Git LFS client communicate and execute the repository policy.',
    '已 commit attribute 配廣泛可用 Git LFS client，傳達同執行 repo policy。',
    ['C1', 'G3', 'G6', 'G16']
  )

  add(
    'pointer',
    'git',
    'Canonical pointer format',
    '標準 pointer 格式',
    'A project-specific readable format with Release or OCI coordinates and optional multipart records.',
    'Project-specific 可讀格式，包含 Release／OCI coordinate 同可選 multipart record。',
    'The canonical v1 pointer is portable across compatible Git LFS clients.',
    'Canonical v1 pointer 可喺 compatible Git LFS client 之間流通。',
    ['C4', 'G4']
  )
  add(
    'pointer',
    'tie',
    'Logical payload identity',
    'Logical payload 身份',
    'Records the whole-file SHA-256 and exact byte size.',
    '記錄全檔 SHA-256 同精確 byte size。',
    'Records an SHA-256 OID and exact byte size.',
    '記錄 SHA-256 OID 同精確 byte size。',
    ['C4', 'G4']
  )
  add(
    'pointer',
    'git',
    'Pointer compactness',
    'Pointer 精簡度',
    'Multipart and encrypted pointers may list many ordered parts and are bounded far above one kilobyte.',
    'Multipart 同 encrypted pointer 可以列好多 ordered part，上限遠高於一 kilobyte。',
    'Canonical pointers remain deliberately tiny and must stay below 1,024 bytes.',
    'Canonical pointer 刻意保持細小，必須低過 1,024 bytes。',
    ['C4', 'G4']
  )
  add(
    'pointer',
    'cheap',
    'Per-part receipts',
    '逐 part 收據',
    'Multipart records retain ordered names, sizes, stored receipts, and hashes for Release or OCI reconstruction.',
    'Multipart record 保留順序、名稱、大小、stored receipt 同 hash，供 Release／OCI 重組。',
    'The pointer identifies one logical object; transfer chunking is not enumerated in the Git blob.',
    'Pointer 只識別一個 logical object；transfer chunk 唔會逐個列入 Git blob。',
    ['C2', 'C4', 'G4']
  )
  add(
    'pointer',
    'cheap',
    'Human-readable location',
    '人類可讀位置',
    'Exposes provider type, Release tag and asset names, or an immutable OCI digest directly in the pointer.',
    'Pointer 直接顯示 provider 類型、Release tag／asset name，或者 immutable OCI digest。',
    'Intentionally keeps only the spec version, OID, and size; the endpoint comes from repository configuration.',
    '刻意只留 spec version、OID 同 size；endpoint 由 repo 設定決定。',
    ['C2', 'C4', 'G4', 'G5']
  )
  add(
    'pointer',
    'git',
    'Cross-tool interoperability',
    '跨工具互通',
    'Requires Desktop Material-aware tooling. It is not a Git LFS pointer and must not be advertised as one.',
    '要 Desktop Material-aware 工具；佢唔係 Git LFS pointer，唔可以扮係。',
    'Designed for multiple compatible clients and servers that implement the published contracts.',
    '為實作公開 contract 嘅多款 compatible client 同 server 而設。',
    ['C4', 'G4', 'G18']
  )

  add(
    'push',
    'tie',
    'Heavy bytes before ref publication',
    '大 bytes 喺 ref 發佈前',
    'On an established branch, provider bytes are uploaded and verified before the pointer commit is created.',
    '喺已建立 branch，provider bytes 會先上傳驗證，再建立 pointer commit。',
    'The pre-push hook uploads required LFS objects before Git completes the ref update.',
    'Pre-push hook 先上傳所需 LFS object，再畀 Git 完成 ref update。',
    ['C1', 'G17']
  )
  add(
    'push',
    'git',
    'What plain git push does',
    '普通 git push 做咩',
    'Plain <code>git push</code> publishes an already-created pointer commit; it does not pin raw bytes by itself.',
    '普通 <code>git push</code> 只發佈已建立 pointer commit；佢自己唔會 pin 真 bytes。',
    'A normal push invokes the installed pre-push hook, which uploads missing referenced LFS objects.',
    '普通 push 會叫已安裝 pre-push hook，上傳 missing referenced LFS object。',
    ['C1', 'C6', 'G17']
  )
  add(
    'push',
    'git',
    'First unpublished branch',
    '第一次未發佈 branch',
    'Release storage may need a create-only branch anchor before it can create and verify the storage Release.',
    'Release storage 可能要先 create-only branch anchor，先可以建立同驗證 storage Release。',
    'A new branch follows the ordinary pre-push object and ref publication path.',
    '新 branch 跟普通 pre-push object 同 ref 發佈路線。',
    ['C1', 'C15', 'G17']
  )
  add(
    'push',
    'tie',
    'Missing-object protection',
    'Missing object 保護',
    'A failed provider upload suppresses that pointer commit, so Git does not advertise bytes that never arrived.',
    'Provider 上傳失敗就唔建立嗰個 pointer commit，Git 唔會宣傳未到貨 bytes。',
    'Incomplete pushes are refused by default when required local LFS objects are missing.',
    '所需本機 LFS object missing 時，預設會拒絕 incomplete push。',
    ['C1', 'G5']
  )
  add(
    'push',
    'depends',
    'Failure after pointer commit',
    'Pointer commit 後失敗',
    'If the later pointer push fails, verified provider bytes and the local pointer commit remain for a non-duplicating retry.',
    '之後 pointer push 失敗，已驗 provider bytes 同本機 pointer commit 會保留，可免重複上傳再試。',
    'If object upload or ref update fails, the client reports the transfer/push failure and the local commit remains.',
    'Object upload 或 ref update 失敗，client 會報 transfer／push failure，本機 commit 仍保留。',
    ['C1', 'G17', 'G21']
  )
  add(
    'push',
    'cheap',
    'Partial application batch',
    '部分 application batch 成功',
    'Can commit verified successful pointers and unrelated safe changes while leaving a failed raw file selected for retry.',
    '可 commit 已驗成功 pointer 同無關安全 change，失敗 raw file 保留俾重試。',
    'A missing object required by the ref commonly stops that Git push rather than creating an app-curated partial commit.',
    'Ref 所需 object missing 通常會停咗嗰次 Git push，唔會建立 app 揀過嘅 partial commit。',
    ['C1', 'G5']
  )

  add(
    'storage',
    'cheap',
    'GitHub Releases route',
    'GitHub Releases 路線',
    'Has a first-class guided Release bucket, owned-release sentinel checks, multipart assets, and manual browser fallback.',
    '有正式導航 Release bucket、owned-release sentinel 檢查、multipart asset 同手動 browser 後備。',
    'Git LFS objects are not GitHub Release assets; GitHub serves them through its LFS infrastructure.',
    'Git LFS object 唔係 GitHub Release asset；GitHub 經 LFS infrastructure 提供。',
    ['C1', 'C11', 'G1', 'G9']
  )
  add(
    'storage',
    'cheap',
    'OCI registry route',
    'OCI registry 路線',
    'Supports immutable GHCR or Docker Hub snapshot manifests with ordered content-addressed layers.',
    '支援 immutable GHCR／Docker Hub snapshot manifest 同 ordered content-addressed layer。',
    'Core Git LFS defines an LFS server interface, not an OCI snapshot backend.',
    'Core Git LFS 定義 LFS server interface，唔係 OCI snapshot backend。',
    ['C2', 'G18']
  )
  add(
    'storage',
    'git',
    'Compatible LFS servers',
    'Compatible LFS server',
    'Provider routes are intentionally narrow and app-owned.',
    'Provider 路線刻意收窄，由 app 管理。',
    'Endpoint configuration and the batch API support GitHub and other compatible servers.',
    'Endpoint 設定同 batch API 支援 GitHub 同其他 compatible server。',
    ['C2', 'G5', 'G18']
  )
  add(
    'storage',
    'cheap',
    'Guided provider choice',
    '導航式 provider 揀選',
    'The app recommends Releases, GHCR, or Docker Hub from size, visibility, and local setup—with a warning that it cannot prove quota or policy.',
    'App 會按大小、visibility 同本機 setup 建議 Releases、GHCR 或 Docker Hub，同時警告唔代表已證 quota／policy。',
    'Endpoint and transfer behavior are configured through Git and LFS settings rather than a comparable graphical provider recommender.',
    'Endpoint 同 transfer 由 Git／LFS 設定，唔係同款圖像 provider recommender。',
    ['C1', 'C2', 'G5']
  )
  add(
    'storage',
    'depends',
    'Content reuse',
    'Content 重用',
    'OCI reuses unchanged content-addressed blobs; Release assets use a different append-oriented bucket model.',
    'OCI 重用未變 content-addressed blob；Release asset 就係另一套 append-oriented bucket model。',
    'An LFS server can omit upload actions for OIDs it already holds.',
    'LFS server 對已經有嘅 OID 可以唔回 upload action。',
    ['C1', 'C2', 'G18']
  )
  add(
    'storage',
    'cheap',
    'Provider-to-provider migration',
    'Provider 之間搬遷',
    'Guarded GHCR↔Docker migration fully materializes and verifies a snapshot before republishing; old storage is not silently deleted.',
    'GHCR↔Docker 搬遷會先完整 materialize 同驗證 snapshot 再發佈；舊 storage 唔會靜雞刪。',
    'Core Git LFS can target different endpoints, but it does not define this exact OCI snapshot migration workflow.',
    'Core Git LFS 可轉 endpoint，但冇定義呢套 OCI snapshot 搬遷流程。',
    ['C2', 'G5']
  )

  add(
    'cost',
    'cheap',
    'GitHub per-file ceiling',
    'GitHub 單檔上限',
    'Release multipart storage can represent a logical file beyond GitHub LFS plan caps after bounded preflight succeeds; open #96 still limits any “huge file” boast.',
    'Release multipart 經 bounded preflight 後可表示超過 GitHub LFS plan cap 嘅 logical file；open #96 令「任大都得」廣告即場收聲。',
    'GitHub currently caps one LFS file at 2 GiB on Free/Pro, 4 GiB on Team, and 5 GiB on Enterprise Cloud.',
    'GitHub 現時單個 LFS file 上限：Free／Pro 2 GiB、Team 4 GiB、Enterprise Cloud 5 GiB。',
    ['C4', 'C8', 'G1']
  )
  add(
    'cost',
    'depends',
    'Release asset bounds',
    'Release asset 邊界',
    'New Release-backed writes use 500 MiB parts and remain bounded by pointer, bucket, asset-count, filesystem, and provider checks.',
    '新 Release-backed write 用 500 MiB part，仍受 pointer、bucket、asset count、filesystem 同 provider 邊界限制。',
    'GitHub documents up to 1,000 assets per Release, each under 2 GiB; those are Release limits, not Git LFS limits.',
    'GitHub 文件寫每個 Release 最多 1,000 asset、每個低過 2 GiB；呢啲係 Release limit，唔係 Git LFS limit。',
    ['C1', 'C4', 'G9']
  )
  add(
    'cost',
    'depends',
    'Billing model',
    '計費模式',
    'Uses the chosen Release or registry provider’s plan, storage, retention, and acceptable-use policies.',
    '跟所揀 Release／registry provider 嘅 plan、storage、retention 同 acceptable-use policy。',
    'GitHub Git LFS has a documented metered storage and bandwidth model; other LFS servers set their own policy.',
    'GitHub Git LFS 有公開 metered storage／bandwidth 模式；其他 LFS server 自訂 policy。',
    ['C1', 'C2', 'G2', 'G18']
  )
  add(
    'cost',
    'git',
    'Published allowance and budgets',
    '公開 allowance 同 budget',
    'There is no unified Cheap LFS budget control across Release and registry providers.',
    'Release 同 registry provider 之間冇統一 Cheap LFS budget 控制。',
    'GitHub publishes included storage/bandwidth and supports budgets and alerts; a zero budget can block overage.',
    'GitHub 公開 included storage／bandwidth，亦有 budget 同 alert；零 budget 可阻止 overage。',
    ['C1', 'C2', 'G2']
  )
  add(
    'cost',
    'cheap',
    'GitHub download accounting',
    'GitHub 下載計數',
    'GitHub currently documents no Release bandwidth limit, but terms, abuse controls, storage policy, and future pricing still apply.',
    'GitHub 現時文件話 Release 冇 bandwidth limit，但 terms、abuse control、storage policy 同將來收費仍然有效。',
    'GitHub LFS downloads consume the repository owner’s metered LFS bandwidth, including Actions downloads.',
    'GitHub LFS download 會用 repo owner 嘅 metered LFS bandwidth，包括 Actions download。',
    ['G2', 'G9', 'G11']
  )
  add(
    'cost',
    'depends',
    'Retention and deletion',
    '保留同刪除',
    'Historical provider objects needed by promised pointers are deliberately retained; durability can also accumulate storage.',
    '承諾仲原得到嘅 pointer 所需歷史 provider object 會刻意保留；耐用亦會積 storage。',
    'Local <code>git lfs prune</code> removes eligible cache objects; remote retention and deletion remain host policy.',
    '本機 <code>git lfs prune</code> 清合資格 cache object；remote retention 同 deletion 仍由 host policy 決定。',
    ['C1', 'C2', 'G13', 'G15']
  )

  add(
    'transfer',
    'cheap',
    'Multipart and chunk model',
    'Multipart 同 chunk 模型',
    'Release storage records 500 MiB parts; encrypted parts use a smaller authenticated bound; OCI records ordered chunks and layers.',
    'Release storage 記錄 500 MiB part；encrypted part 用較細 authenticated bound；OCI 記錄 ordered chunk 同 layer。',
    'One LFS OID identifies the whole object; transfer details are negotiated with the server or custom adapter.',
    '一個 LFS OID 識別全 object；transfer 細節同 server／custom adapter 協商。',
    ['C1', 'C2', 'C3', 'G18']
  )
  add(
    'transfer',
    'git',
    'Transfer concurrency',
    '傳輸並行數',
    'Uses deliberately bounded app lanes—sequential or up to three uploads, with two active Release restore downloads.',
    '用刻意有界 app lane：sequential 或最多三個 upload，Release restore 最多兩個 active download。',
    'Defaults to eight concurrent transfers and exposes configuration for tuning.',
    '預設八個 concurrent transfer，亦有設定可調。',
    ['C1', 'C2', 'G5']
  )
  add(
    'transfer',
    'git',
    'Retry and resume',
    '重試同續傳',
    'Retries bounded parts and can adaptively rechunk timed-out OCI layers, but does not resume inside every failed layer.',
    '會重試 bounded part，OCI layer timeout 可 adaptive rechunk，但唔係每個 failed layer 中途續傳。',
    'Supports range downloads, configurable retry/backoff, and optional unfinished tus uploads when supported.',
    '支援 range download、可設定 retry/backoff，同支援時可用 unfinished tus upload。',
    ['C1', 'C2', 'G5']
  )
  add(
    'transfer',
    'depends',
    'Compression',
    '壓縮',
    'Can adopt verified raw-DEFLATE Release parts through a managed repository workflow; encrypted payloads are not recompressed.',
    '可經 managed repo workflow 採用已驗 raw-DEFLATE Release part；encrypted payload 唔會再壓。',
    'Can request gzip/zstd HTTP download encoding and use clean/smudge extensions without changing the core object identity model.',
    '可要求 gzip／zstd HTTP download encoding，同用 clean／smudge extension，而唔改 core object identity model。',
    ['C1', 'C13', 'G5', 'G19']
  )
  add(
    'transfer',
    'cheap',
    'Progress detail',
    '進度細節',
    'The UI model exposes file, part, phase, provider, bytes, elapsed time, rate, ETA, lane, retry, and next-at-90% state.',
    'UI model 顯示 file、part、phase、provider、bytes、elapsed、rate、ETA、lane、retry 同 next-at-90% state。',
    'Provides terminal transfer progress, trace controls, and <code>GIT_LFS_PROGRESS</code> for machine-readable updates.',
    '提供 terminal transfer progress、trace control 同 <code>GIT_LFS_PROGRESS</code> machine-readable update。',
    ['C1', 'C12', 'G5']
  )
  add(
    'transfer',
    'cheap',
    'Cancellation contract',
    '取消合約',
    'Defines per-file and repository-batch cancellation, scratch cleanup, retained pointers, and honest partial results.',
    '定義逐檔同 repo batch 取消、scratch cleanup、pointer 保留同誠實 partial result。',
    'The process can be interrupted, but core Git LFS does not define this exact app-level cancellation and notification model.',
    'Process 可以中斷，但 core Git LFS 冇定義呢套 app-level cancellation 同 notification model。',
    ['C1', 'C12', 'G5']
  )

  add(
    'restore',
    'tie',
    'Clone hydration',
    'Clone 後還原',
    'A clone carries pointers; Desktop Material can deliberately auto-materialize on clone, pull, fetch, or open.',
    'Clone 先有 pointer；Desktop Material 可刻意喺 clone、pull、fetch 或 open 後 auto-materialize。',
    'A clone carries pointers, then the smudge/filter process or explicit checkout retrieves LFS objects.',
    'Clone 先有 pointer，再由 smudge／filter 或明確 checkout 取 LFS object。',
    ['C1', 'G1', 'G20']
  )
  add(
    'restore',
    'git',
    'Selective retrieval',
    '選擇性取檔',
    'Provides one-file and materialize-all actions in the app.',
    'App 有單檔同 materialize-all action。',
    'Adds include/exclude patterns plus recent-ref and recent-history fetch windows.',
    '另有 include／exclude pattern、recent-ref 同 recent-history fetch window。',
    ['C1', 'G5', 'G14']
  )
  add(
    'restore',
    'git',
    'Dedicated local cache',
    '專用本機 cache',
    'Uses bounded private scratch plus materialized working files; it does not expose a comparable durable object-cache manager.',
    '用 bounded private scratch 同 materialized working file；冇同款 durable object-cache manager。',
    'Normally keeps objects under <code>.git/lfs</code> and manages eligible old entries with <code>git lfs prune</code>.',
    '通常喺 <code>.git/lfs</code> 留 object，再用 <code>git lfs prune</code> 管 eligible 舊 entry。',
    ['C1', 'G5', 'G13']
  )
  add(
    'restore',
    'tie',
    'Offline use',
    '離線使用',
    'Already materialized files remain usable; a pointer whose provider bytes were never fetched cannot restore offline.',
    '已 materialize file 離線照用；從未 fetch provider bytes 嘅 pointer 離線還原唔到。',
    'Already cached and checked-out objects remain usable; an uncached pointer cannot hydrate offline.',
    '已 cache 同 checkout object 離線照用；uncached pointer 離線 hydrate 唔到。',
    ['C1', 'G5']
  )
  add(
    'restore',
    'cheap',
    'Batch partial failure',
    'Batch 部分失敗',
    'Continues remaining restores and leaves each failed item as its pointer, with per-file recovery detail.',
    '繼續其他 restore，每個失敗 item 保持 pointer，同時逐檔報救援細節。',
    'Can preserve pointers on download error when configured, but that is not the same default guided batch UX.',
    '設定後可喺 download error 保留 pointer，但唔係同款預設導航 batch UX。',
    ['C1', 'C2', 'G5']
  )
  add(
    'restore',
    'cheap',
    'Manual browser recovery',
    '手動 browser 救援',
    'Can prepare deterministic unencrypted Release parts for browser upload, then verify exact names, sizes, hashes, and downloads before adoption.',
    '可準備 deterministic 未加密 Release part 俾 browser upload，再驗精確名稱、大小、hash 同 download 先採用。',
    'Recovery uses LFS push/fetch/checkout and host diagnostics; it has no equivalent Release asset handoff.',
    '救援用 LFS push／fetch／checkout 同 host 診斷；冇對等 Release asset 交接。',
    ['C1', 'C11', 'G14', 'G20', 'G21']
  )

  add(
    'security',
    'tie',
    'SHA-256 verification',
    'SHA-256 驗證',
    'Checks whole-file identity and, where applicable, stored containers, parts, chunks, and provider receipts before replacement.',
    '替換前檢查全檔 identity，同適用嘅 stored container、part、chunk 同 provider receipt。',
    'Checks downloaded object content against the SHA-256 OID in the standard pointer.',
    '按標準 pointer 入面 SHA-256 OID 檢查下載 object content。',
    ['C1', 'C2', 'C3', 'C4', 'G4', 'G20']
  )
  add(
    'security',
    'cheap',
    'Release payload encryption',
    'Release payload 加密',
    'Offers optional AES-256-GCM containers with scrypt-derived keys and both stored and plaintext receipts.',
    '提供可選 AES-256-GCM container、scrypt-derived key，同 stored／plaintext 兩套 receipt。',
    'Core Git LFS defines no payload-encryption layer, though separately operated extensions can transform streams.',
    'Core Git LFS 冇定義 payload-encryption layer，但另行操作嘅 extension 可以 transform stream。',
    ['C3', 'G4', 'G19']
  )
  add(
    'security',
    'cheap',
    'Private OCI encryption',
    'Private OCI 加密',
    'Verified-private snapshots require authenticated encrypted chunks; the tracked repository key protects only against registry-only disclosure.',
    'Verified-private snapshot 要 authenticated encrypted chunk；tracked repo key 只防 registry 單獨洩漏。',
    'Core Git LFS delegates confidentiality to transport, server access controls, or separately configured extensions.',
    'Core Git LFS 將 confidentiality 交俾 transport、server access control 或另配 extension。',
    ['C2', 'G5', 'G19']
  )
  add(
    'security',
    'tie',
    'Credential handling',
    'Credential 處理',
    'Release passwords are operation-scoped or explicitly stored per repository in Windows Credential Manager.',
    'Release password 只限 operation，或者明確按 repo 存入 Windows Credential Manager。',
    'Integrates with Git credential helpers, askpass, SSH authorization, and host-specific authentication.',
    '整合 Git credential helper、askpass、SSH authorization 同 host-specific authentication。',
    ['C3', 'G5']
  )
  add(
    'security',
    'git',
    'Pointer metadata exposure',
    'Pointer metadata 暴露',
    'Encrypted pointers still reveal plaintext size and SHA-256 plus provider and asset structure; encryption is not anonymity.',
    'Encrypted pointer 仍顯示 plaintext size、SHA-256、provider 同 asset 結構；加密唔係匿名術。',
    'Standard pointers reveal version, SHA-256 OID, and size, with endpoint detail kept outside the pointer.',
    '標準 pointer 顯示 version、SHA-256 OID 同 size；endpoint 細節唔入 pointer。',
    ['C3', 'C4', 'G4', 'G5']
  )
  add(
    'security',
    'cheap',
    'Windows path and race hardening',
    'Windows path 同 race 護欄',
    'Explicitly rejects traversal, Git metadata, devices, ADS, case collisions, redirected parents, and link races before atomic publication.',
    'Atomic publication 前明確拒絕 traversal、Git metadata、device、ADS、case collision、redirected parent 同 link race。',
    'Git LFS has its own security maintenance, but it does not expose this Desktop Material-specific tracked-path review contract.',
    'Git LFS 有自己安全維護，但冇呢套 Desktop Material-specific tracked-path review contract。',
    ['C1', 'C10', 'G16']
  )

  add(
    'collaboration',
    'tie',
    'Collaborator without the aware client',
    '冇 aware client 嘅協作者',
    'Receives the committed Cheap LFS pointer text rather than original bytes.',
    '收到已 commit Cheap LFS pointer text，而唔係原 bytes。',
    'Receives the committed Git LFS pointer text rather than original bytes.',
    '收到已 commit Git LFS pointer text，而唔係原 bytes。',
    ['C1', 'G3']
  )
  add(
    'collaboration',
    'git',
    'Cross-platform contributors',
    '跨平台貢獻者',
    'The supported product workflow is limited to Windows Desktop Material.',
    '正式產品流程限於 Windows Desktop Material。',
    'Official clients and compatible tooling cover Windows, macOS, Linux, IDEs, terminals, and CI.',
    '官方 client 同 compatible tooling 覆蓋 Windows、macOS、Linux、IDE、terminal 同 CI。',
    ['C7', 'G16']
  )
  add(
    'collaboration',
    'git',
    'Binary file locking',
    'Binary file locking',
    'Does not define an interoperable lock protocol.',
    '冇定義 interoperable lock protocol。',
    'Defines a locking API and lockable attribute behavior when the server supports it.',
    'Server 支援時，有 locking API 同 lockable attribute 行為。',
    ['C1', 'G6', 'G8']
  )
  add(
    'collaboration',
    'depends',
    'Fork behavior',
    'Fork 行為',
    'Forked pointers retain original Release or OCI coordinates until an authorized explicit migration republishes them.',
    'Fork pointer 保留原本 Release／OCI coordinate，直至獲授權明確 migration 再發佈。',
    'GitHub attributes fork LFS usage to the parent owner and documents upload restrictions for public fork networks.',
    'GitHub 將 fork LFS usage 算俾 parent owner，亦有 public fork network upload restriction 文件。',
    ['C1', 'C2', 'G2', 'G3']
  )
  add(
    'collaboration',
    'tie',
    'Pull-request review',
    'Pull request 審閱',
    'The Git blob is readable pointer text; binary review requires local materialization when the host cannot render the payload.',
    'Git blob 係可讀 pointer text；host render 唔到 payload 時要本機 materialize 先審 binary。',
    'GitHub may show pointer text for some LFS content; non-rendered binary changes still need local inspection.',
    'GitHub 對部分 LFS content 可能顯示 pointer text；未 render binary change 仍要本機檢查。',
    ['C1', 'G3']
  )
  add(
    'collaboration',
    'git',
    'Mixed tools and editors',
    '混合工具同 editor',
    'The app can restore bytes, but other tools do not understand its pointer or provider transaction model.',
    'App 可還原 bytes，但其他工具唔識佢嘅 pointer 同 provider transaction model。',
    'Standard filters and clients integrate with Git-aware editors, hosts, and automation more broadly.',
    '標準 filter 同 client 可更廣泛整合 Git-aware editor、host 同 automation。',
    ['C1', 'C4', 'G4', 'G16']
  )

  add(
    'migration',
    'git',
    'Full-history import',
    '完整歷史 import',
    'Pins reviewed working-tree files going forward; it does not provide a general old-history converter.',
    '由已審 working-tree file 向前 pin；冇通用舊歷史 converter。',
    '<code>git lfs migrate import</code> can rewrite selected or reachable refs into LFS pointers.',
    '<code>git lfs migrate import</code> 可將所選或 reachable ref 重寫成 LFS pointer。',
    ['C1', 'G7']
  )
  add(
    'migration',
    'git',
    'No-rewrite adoption',
    '唔重寫歷史嘅採用',
    'A normal pin is forward-only and creates a new pointer commit.',
    '普通 pin 向前處理，建立新 pointer commit。',
    '<code>migrate import --no-rewrite</code> creates a conversion commit without rewriting earlier history.',
    '<code>migrate import --no-rewrite</code> 建 conversion commit，唔重寫之前歷史。',
    ['C1', 'G7']
  )
  add(
    'migration',
    'git',
    'Scoped migration controls',
    '有範圍搬遷控制',
    'Interactive selection focuses on concrete current working-tree files.',
    '互動揀選集中目前 working-tree 具體檔案。',
    'Migration supports include/exclude pathspecs, size thresholds, selected refs, and <code>--everything</code>.',
    'Migration 支援 include／exclude pathspec、size threshold、所選 ref 同 <code>--everything</code>。',
    ['C1', 'G7']
  )
  add(
    'migration',
    'git',
    'Export to ordinary Git',
    '匯出返普通 Git',
    'Has no general history exporter that converts all Cheap pointers back into Git blobs.',
    '冇通用歷史 exporter 將全部 Cheap pointer 轉返 Git blob。',
    '<code>git lfs migrate export</code> can convert selected LFS pointer history back to ordinary Git blobs.',
    '<code>git lfs migrate export</code> 可將所選 LFS pointer 歷史轉返普通 Git blob。',
    ['C1', 'G7']
  )
  add(
    'migration',
    'depends',
    'Remote reclamation',
    'Remote 空間回收',
    'Avoids deleting provider history required by retained pointers; deletion is deliberately conservative and provider-specific.',
    '避免刪 retained pointer 所需 provider 歷史；刪除刻意保守而且 provider-specific。',
    'Remote deletion is host-specific; GitHub documents a removal process while local prune does not reclaim server storage.',
    'Remote deletion 由 host 決定；GitHub 有 removal 流程，而本機 prune 唔會回收 server storage。',
    ['C1', 'C2', 'G13', 'G15']
  )
  add(
    'migration',
    'cheap',
    'Failure recovery receipts',
    '失敗救援收據',
    'Preserves operation-owned scratch/recovery state only as documented, verifies exact provider identities, and offers deterministic manual handoff.',
    '只按文件保留 operation-owned scratch／recovery state，驗精確 provider identity，並提供 deterministic 手動交接。',
    'Provides scriptable push, fetch, checkout, prune, and host diagnostics rather than the same GUI recovery receipt.',
    '提供可 script push、fetch、checkout、prune 同 host 診斷，而唔係同款 GUI recovery receipt。',
    ['C1', 'C10', 'C11', 'G13', 'G14', 'G20', 'G21']
  )

  add(
    'automation',
    'git',
    'Headless CLI automation',
    'Headless CLI 自動化',
    'The supported product path is the Windows app; CI must deliberately materialize provider bytes.',
    '正式產品路線係 Windows app；CI 要刻意 materialize provider bytes。',
    'Exposes install, fetch, checkout, push, migrate, prune, and environment-driven commands for scripts.',
    '有 install、fetch、checkout、push、migrate、prune 同環境驅動 command 俾 script。',
    ['C7', 'G13', 'G14', 'G16', 'G20', 'G21']
  )
  add(
    'automation',
    'git',
    'GitHub Actions checkout',
    'GitHub Actions checkout',
    'No native checkout switch interprets Cheap pointers; a build must run project-aware materialization.',
    '冇 native checkout switch 識 Cheap pointer；build 要跑 project-aware materialization。',
    '<code>actions/checkout</code> provides an official <code>lfs: true</code> input.',
    '<code>actions/checkout</code> 有官方 <code>lfs: true</code> input。',
    ['C1', 'G11']
  )
  add(
    'automation',
    'git',
    'GitHub source archives',
    'GitHub source archive',
    'Generated source archives normally contain committed Cheap pointer text; a separate build may materialize its own artifact.',
    '生成 source archive 通常有已 commit Cheap pointer text；另行 build 可 materialize 自己 artifact。',
    'A repository owner can configure GitHub-generated archives to include LFS objects.',
    'Repo owner 可設定 GitHub 生成 archive 包含 LFS object。',
    ['C1', 'G1']
  )
  add(
    'automation',
    'depends',
    'GitHub Pages',
    'GitHub Pages',
    'Pages does not natively dereference Cheap pointers; publication must deliberately materialize bytes into the built site.',
    'Pages 唔會原生 dereference Cheap pointer；發佈要刻意將 bytes materialize 入 built site。',
    'GitHub explicitly states that Git LFS cannot be used with GitHub Pages.',
    'GitHub 明確話 Git LFS 唔可以用於 GitHub Pages。',
    ['C1', 'G1']
  )
  add(
    'automation',
    'cheap',
    'Integrated operations manager',
    '整合式 operations manager',
    'One UI combines provider settings, inventory, one/all restore, progress, cancellation, manual handoff, and actionable notifications.',
    '一個 UI 集 provider 設定、inventory、單檔／全部 restore、progress、cancel、手動交接同 actionable notification。',
    'The CLI is broadly composable, but core Git LFS does not ship this exact Desktop Material management surface.',
    'CLI 廣泛可組合，但 core Git LFS 冇出呢套 Desktop Material management surface。',
    ['C1', 'C9', 'C11', 'C12', 'G16']
  )
  add(
    'automation',
    'git',
    'Public automation contracts',
    '公開自動化 contract',
    'Release and OCI coordination are currently internal Desktop Material implementation contracts.',
    'Release 同 OCI coordination 現時係 Desktop Material 內部 implementation contract。',
    'Publishes pointer, batch, transfer, extension, locking, and command contracts for independent implementations.',
    '公開 pointer、batch、transfer、extension、locking 同 command contract 俾獨立實作。',
    ['C1', 'C2', 'G4', 'G8', 'G18', 'G19']
  )

  var OutcomeCopy = {
    cheap: { emoji: '🟢', en: 'Cheap LFS edge', yue: 'Cheap LFS 較著數' },
    git: { emoji: '🟣', en: 'Git LFS edge', yue: 'Git LFS 較著數' },
    tie: { emoji: '🤝', en: 'Shared outcome', yue: '結果相若' },
    depends: { emoji: '🧭', en: 'Depends on fit', yue: '睇情況' },
  }

  var elements = {
    body: document.querySelector('[data-matrix-body]'),
    cards: document.querySelector('[data-matrix-cards]'),
    categoryFilters: document.querySelector('[data-category-filters]'),
    count: document.querySelector('[data-visible-count]'),
    empty: document.querySelector('[data-matrix-empty]'),
    form: document.querySelector('[data-matrix-form]'),
    query: document.querySelector('#matrix-search'),
    searchMode: document.querySelector('[data-search-mode-note]'),
    sourceLibrary: document.querySelector('[data-source-library]'),
    regexDialog: document.querySelector('#regex-dialog'),
    regexPattern: document.querySelector('#regex-pattern'),
    regexSample: document.querySelector('#regex-sample'),
    regexValidation: document.querySelector('[data-regex-validation]'),
    regexMatches: document.querySelector('[data-regex-matches]'),
    appearanceDialog: document.querySelector('#appearance-dialog'),
    toast: document.querySelector('[data-atlas-toast]'),
    rowNodes: [],
    cardNodes: [],
  }

  var state = {
    category: safeStored(StorageKeys.category, 'all'),
    outcome: safeStored(StorageKeys.outcome, 'all'),
    query: '',
    regexMode: false,
    regexFlags: 'iu',
    regexHitIndexes: null,
    regexError: '',
    activeTab: 'verdict',
    tabOrder: [],
    pinnedTabs: [],
  }

  var regexRunner =
    window.DesktopMaterialRegexJob === undefined
      ? null
      : window.DesktopMaterialRegexJob.create({
          workerPath: 'docs/assets/site/docs-hub-regex-worker.js',
          budgetMilliseconds: 750,
        })

  function safeStored(key, fallback) {
    try {
      var value = window.localStorage.getItem(key)
      return value === null ? fallback : value
    } catch (error) {
      return fallback
    }
  }

  function safeStore(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (error) {
      /* A private browsing quota must not break the page. */
    }
  }

  function safeJson(key, fallback) {
    try {
      var parsed = JSON.parse(safeStored(key, 'null'))
      return parsed === null ? fallback : parsed
    } catch (error) {
      return fallback
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function bilingual(en, yue) {
    return (
      '<span class="copy en">' +
      en +
      '</span><span class="copy yue" lang="zh-HK">' +
      yue +
      '</span>'
    )
  }

  function categoryFor(id) {
    return Categories.find(function (category) {
      return category.id === id
    })
  }

  function plainText(value) {
    var node = document.createElement('div')
    node.innerHTML = value
    return node.textContent || ''
  }

  function searchableText(row) {
    var category = categoryFor(row.category)
    return [
      row.title.en,
      row.title.yue,
      plainText(row.cheap.en),
      plainText(row.cheap.yue),
      plainText(row.git.en),
      plainText(row.git.yue),
      category.en,
      category.yue,
      row.outcome,
      row.sources.join(' '),
    ].join(' ')
  }

  function sourceChips(sourceIds) {
    return sourceIds
      .map(function (id) {
        var source = SourceRegistry[id]
        return (
          '<a class="source-chip" href="' +
          escapeHtml(source.url) +
          '" title="' +
          escapeHtml(source.en) +
          '">' +
          escapeHtml(id) +
          '</a>'
        )
      })
      .join('')
  }

  function fitPill(outcome) {
    var copy = OutcomeCopy[outcome]
    return (
      '<span class="fit-pill signal-' +
      outcome +
      '">' +
      copy.emoji +
      ' ' +
      bilingual(copy.en, copy.yue) +
      '</span>'
    )
  }

  function renderRows() {
    if (elements.body === null || elements.cards === null) {
      return
    }
    elements.body.innerHTML = Rows.map(function (row) {
      var category = categoryFor(row.category)
      return (
        '<tr id="' +
        row.id +
        '" data-row="' +
        row.id +
        '" data-category="' +
        row.category +
        '" data-outcome="' +
        row.outcome +
        '" data-reviewed="' +
        row.reviewed +
        '" data-source-ids="' +
        row.sources.join(' ') +
        '">' +
        '<td class="matrix-number">' +
        row.number +
        '</td>' +
        '<th scope="row" class="matrix-decision">' +
        bilingual(row.title.en, row.title.yue) +
        '<span class="matrix-category">' +
        category.emoji +
        ' ' +
        bilingual(category.en, category.yue) +
        '</span></th>' +
        '<td class="matrix-copy">' +
        bilingual(row.cheap.en, row.cheap.yue) +
        '</td>' +
        '<td class="matrix-copy">' +
        bilingual(row.git.en, row.git.yue) +
        '</td>' +
        '<td>' +
        fitPill(row.outcome) +
        '</td>' +
        '<td><div class="source-chips">' +
        sourceChips(row.sources) +
        '</div></td></tr>'
      )
    }).join('')

    elements.cards.innerHTML = Rows.map(function (row) {
      var category = categoryFor(row.category)
      return (
        '<article class="matrix-card" data-card="' +
        row.id +
        '" data-category="' +
        row.category +
        '" data-outcome="' +
        row.outcome +
        '">' +
        '<div class="matrix-card-head"><span class="matrix-number">#' +
        row.number +
        '</span><h3>' +
        bilingual(row.title.en, row.title.yue) +
        '</h3>' +
        fitPill(row.outcome) +
        '</div><div class="matrix-card-body">' +
        '<span class="matrix-category">' +
        category.emoji +
        ' ' +
        bilingual(category.en, category.yue) +
        '</span>' +
        '<div class="matrix-card-side"><strong>Cheap LFS</strong><p>' +
        bilingual(row.cheap.en, row.cheap.yue) +
        '</p></div>' +
        '<div class="matrix-card-side"><strong>Git LFS</strong><p>' +
        bilingual(row.git.en, row.git.yue) +
        '</p></div>' +
        '<div class="source-chips">' +
        sourceChips(row.sources) +
        '</div></div></article>'
      )
    }).join('')
    elements.rowNodes = Array.from(document.querySelectorAll('[data-row]'))
    elements.cardNodes = Array.from(document.querySelectorAll('[data-card]'))
  }

  function renderCategoryFilters() {
    if (elements.categoryFilters === null) {
      return
    }
    var all =
      '<button type="button" data-category="all" aria-pressed="true">✨ ' +
      bilingual('All 12', '全部 12 類') +
      '</button>'
    elements.categoryFilters.innerHTML =
      all +
      Categories.map(function (category) {
        return (
          '<button type="button" data-category="' +
          category.id +
          '" aria-pressed="false">' +
          category.emoji +
          ' ' +
          bilingual(category.en, category.yue) +
          '</button>'
        )
      }).join('')
  }

  function renderSources() {
    if (elements.sourceLibrary === null) {
      return
    }
    elements.sourceLibrary.innerHTML = Object.keys(SourceRegistry)
      .map(function (id) {
        var source = SourceRegistry[id]
        return (
          '<a class="source-card" id="source-' +
          id.toLowerCase() +
          '" href="' +
          escapeHtml(source.url) +
          '"><span class="source-card-icon" aria-hidden="true">' +
          source.icon +
          '</span><span><strong>' +
          bilingual(escapeHtml(source.en), escapeHtml(source.yue)) +
          '</strong><small>' +
          escapeHtml(source.kind) +
          '</small></span><code>' +
          id +
          '</code></a>'
        )
      })
      .join('')
  }

  function validCategory(value) {
    return (
      value === 'all' ||
      Categories.some(function (category) {
        return category.id === value
      })
    )
  }

  function validOutcome(value) {
    return ['all', 'cheap', 'git', 'tie', 'depends'].includes(value)
  }

  function rowMatches(row, index) {
    if (state.category !== 'all' && row.category !== state.category) {
      return false
    }
    if (state.outcome !== 'all' && row.outcome !== state.outcome) {
      return false
    }
    if (state.query === '') {
      return true
    }
    if (state.regexMode) {
      return state.regexHitIndexes !== null && state.regexHitIndexes.has(index)
    }
    return searchableText(row)
      .toLocaleLowerCase()
      .includes(state.query.toLocaleLowerCase())
  }

  function updateFilterButtons() {
    document.querySelectorAll('[data-category]').forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.category === state.category)
      )
    })
    document.querySelectorAll('[data-outcome]').forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.outcome === state.outcome)
      )
    })
  }

  function applyFilters() {
    var visible = 0
    Rows.forEach(function (row, index) {
      var show = rowMatches(row, index)
      elements.rowNodes[index].hidden = !show
      elements.cardNodes[index].hidden = !show
      if (show) {
        visible++
      }
    })
    if (elements.count !== null) {
      elements.count.textContent = String(visible)
    }
    if (elements.empty !== null) {
      elements.empty.hidden = visible !== 0
    }
    updateFilterButtons()
  }

  function setCategory(value) {
    state.category = validCategory(value) ? value : 'all'
    safeStore(StorageKeys.category, state.category)
    applyFilters()
  }

  function setOutcome(value) {
    state.outcome = validOutcome(value) ? value : 'all'
    safeStore(StorageKeys.outcome, state.outcome)
    applyFilters()
  }

  function selectedRegexFlags() {
    return Array.from(document.querySelectorAll('.regex-flags input:checked'))
      .map(function (input) {
        return input.value
      })
      .join('')
  }

  function setRegexFeedback(kind, detail) {
    if (elements.regexValidation === null) {
      return
    }
    var messages = {
      valid: {
        en: 'Valid and bounded in the worker.',
        yue: '有效，並喺 worker 有界執行。',
      },
      empty: {
        en: 'Enter a pattern to test it.',
        yue: '輸入 pattern 先可以測試。',
      },
      invalid: {
        en: 'Invalid regular expression: ',
        yue: 'Regex 無效：',
      },
      timeout: {
        en: 'Stopped after the 750 ms safety deadline.',
        yue: '去到 750 ms 安全期限已停止。',
      },
      unavailable: {
        en: 'The isolated regex worker is unavailable; regex fails closed.',
        yue: '隔離 regex worker 用唔到；regex 會 fail closed。',
      },
      long: {
        en: 'The pattern or sample exceeds this page’s safety bound.',
        yue: 'Pattern 或 sample 超過本頁安全上限。',
      },
    }
    var message = messages[kind] || messages.unavailable
    elements.regexValidation.dataset.error = String(
      ['invalid', 'timeout', 'unavailable', 'long'].includes(kind)
    )
    elements.regexValidation.innerHTML =
      bilingual(message.en, message.yue) +
      (detail === '' ? '' : ' <code>' + escapeHtml(detail) + '</code>')
  }

  function renderBuilderMatches(matches) {
    if (elements.regexMatches === null) {
      return
    }
    if (!Array.isArray(matches) || matches.length === 0) {
      elements.regexMatches.innerHTML =
        '<li>' + bilingual('No sample matches.', '測試文字冇 match。') + '</li>'
      return
    }
    elements.regexMatches.innerHTML = matches
      .slice(0, 20)
      .map(function (match) {
        var value =
          match.value !== null && typeof match.value === 'object'
            ? match.value.value
            : ''
        var captures = Array.isArray(match.captures)
          ? match.captures
              .map(function (capture, index) {
                var text =
                  capture !== null && typeof capture === 'object'
                    ? capture.value
                    : ''
                return ' g' + (index + 1) + '=' + String(text)
              })
              .join('')
          : ''
        return (
          '<li><strong>' +
          escapeHtml(value === '' ? '∅' : value) +
          '</strong> @' +
          (Number.isInteger(match.index) ? match.index : 0) +
          escapeHtml(captures) +
          '</li>'
        )
      })
      .join('')
  }

  function runBuilderPreview() {
    if (
      elements.regexPattern === null ||
      elements.regexSample === null ||
      regexRunner === null
    ) {
      setRegexFeedback('unavailable', '')
      return
    }
    var pattern = elements.regexPattern.value
    var sample = elements.regexSample.value
    if (pattern === '') {
      setRegexFeedback('empty', '')
      elements.regexMatches.innerHTML = ''
      return
    }
    if (pattern.length > 240 || sample.length > 1200) {
      setRegexFeedback('long', '')
      elements.regexMatches.innerHTML = ''
      return
    }
    setRegexFeedback('valid', '')
    regexRunner.run(
      'atlas-builder',
      {
        operation: 'builder',
        pattern: pattern,
        flags: selectedRegexFlags(),
        sample: sample,
        maximumMatches: 20,
      },
      function (data) {
        setRegexFeedback('valid', '')
        renderBuilderMatches(data.matches)
      },
      function (code, detail) {
        var kind =
          code === 'invalid'
            ? 'invalid'
            : code === 'timeout'
            ? 'timeout'
            : code.indexOf('too-long') === 0
            ? 'long'
            : 'unavailable'
        setRegexFeedback(kind, detail)
        elements.regexMatches.innerHTML = ''
      }
    )
  }

  function runRegexFilter() {
    if (state.query === '') {
      state.regexHitIndexes = null
      state.regexError = ''
      applyFilters()
      return
    }
    if (regexRunner === null) {
      state.regexHitIndexes = new Set()
      state.regexError = 'unavailable'
      setRegexFeedback('unavailable', '')
      applyFilters()
      return
    }
    var catalog = Rows.map(function (row) {
      return [
        row.title.en + ' ' + row.title.yue,
        row.category + ' ' + row.outcome + ' ' + row.sources.join(' '),
        searchableText(row),
      ]
    })
    regexRunner.run(
      'atlas-search',
      {
        operation: 'search',
        pattern: state.query,
        flags: state.regexFlags,
        catalog: catalog,
        maximumResults: 100,
        maximumRanges: 10,
      },
      function (data) {
        state.regexHitIndexes = new Set(
          data.hits.map(function (hit) {
            return hit.catalogIndex
          })
        )
        state.regexError = ''
        applyFilters()
      },
      function (code, detail) {
        state.regexHitIndexes = new Set()
        state.regexError = code
        setRegexFeedback(
          code === 'invalid'
            ? 'invalid'
            : code === 'timeout'
            ? 'timeout'
            : 'unavailable',
          detail
        )
        applyFilters()
        showToast(
          'Regex search stopped safely. Open the builder for details.',
          'Regex 搜尋已安全停止；開 Regex 工具睇詳情。',
          true
        )
      }
    )
  }

  function updateSearchMode() {
    if (elements.searchMode === null) {
      return
    }
    elements.searchMode.innerHTML = state.regexMode
      ? bilingual(
          'Regex search · ECMAScript · flags ' + state.regexFlags,
          'Regex 搜尋 · ECMAScript · flags ' + state.regexFlags
        )
      : bilingual(
          'Plain-text search · case-insensitive',
          '純文字搜尋 · 不分大小寫'
        )
  }

  function setPlainQuery(value) {
    state.query = String(value).slice(0, 240)
    state.regexMode = false
    state.regexHitIndexes = null
    updateSearchMode()
    applyFilters()
  }

  function applyRegexFromBuilder() {
    if (elements.regexPattern === null || elements.query === null) {
      return
    }
    state.query = elements.regexPattern.value.slice(0, 240)
    state.regexFlags = selectedRegexFlags()
    state.regexMode = true
    elements.query.value = state.query
    updateSearchMode()
    runRegexFilter()
    elements.regexDialog.close()
    showToast(
      'Regex mode applied to all 72 comparisons.',
      'Regex mode 已套用去全部 72 項比較。',
      false
    )
  }

  var toastTimer = 0
  function showToast(en, yue, persistent) {
    if (elements.toast === null) {
      return
    }
    window.clearTimeout(toastTimer)
    elements.toast.innerHTML =
      bilingual(en, yue) +
      (persistent
        ? '<button type="button" data-dismiss-toast aria-label="Dismiss">×</button>'
        : '')
    elements.toast.hidden = false
    if (!persistent) {
      toastTimer = window.setTimeout(function () {
        elements.toast.hidden = true
      }, 3600)
    }
  }

  function tabIds() {
    return Array.from(document.querySelectorAll('[data-tab]')).map(function (
      tab
    ) {
      return tab.dataset.tab
    })
  }

  function validTabOrder(order, allowed) {
    return (
      Array.isArray(order) &&
      order.length === allowed.length &&
      new Set(order).size === allowed.length &&
      order.every(function (id) {
        return allowed.includes(id)
      })
    )
  }

  function restoreTabState() {
    var allowed = tabIds()
    var storedOrder = safeJson(StorageKeys.tabOrder, [])
    state.tabOrder = validTabOrder(storedOrder, allowed)
      ? storedOrder
      : allowed.slice()
    var storedPins = safeJson(StorageKeys.pinnedTabs, [])
    state.pinnedTabs = Array.isArray(storedPins)
      ? storedPins.filter(function (id) {
          return allowed.includes(id)
        })
      : []
    reorderTabs()
  }

  function reorderTabs() {
    var tablist = document.querySelector('[data-atlas-tabs]')
    if (tablist === null) {
      return
    }
    var pinned = state.tabOrder.filter(function (id) {
      return state.pinnedTabs.includes(id)
    })
    var unpinned = state.tabOrder.filter(function (id) {
      return !state.pinnedTabs.includes(id)
    })
    state.tabOrder = pinned.concat(unpinned)
    state.tabOrder.forEach(function (id) {
      var tab = document.querySelector('[data-tab="' + id + '"]')
      if (tab !== null) {
        tab.dataset.pinned = String(state.pinnedTabs.includes(id))
        tablist.appendChild(tab)
      }
    })
    safeStore(StorageKeys.tabOrder, JSON.stringify(state.tabOrder))
    safeStore(StorageKeys.pinnedTabs, JSON.stringify(state.pinnedTabs))
  }

  function activateTab(id, options) {
    var settings = options || {}
    var tab = document.querySelector('[data-tab="' + id + '"]')
    var panel = document.querySelector('[data-panel="' + id + '"]')
    if (tab === null || panel === null) {
      id = 'verdict'
      tab = document.querySelector('[data-tab="verdict"]')
      panel = document.querySelector('[data-panel="verdict"]')
    }
    state.activeTab = id
    document.querySelectorAll('[data-tab]').forEach(function (item) {
      var selected = item === tab
      item.setAttribute('aria-selected', String(selected))
      item.tabIndex = selected ? 0 : -1
    })
    document.querySelectorAll('[data-panel]').forEach(function (item) {
      item.hidden = item !== panel
    })
    var jump = document.querySelector('#tab-jump')
    if (jump !== null) {
      jump.value = id
    }
    var pin = document.querySelector('[data-tab-action="pin"]')
    if (pin !== null) {
      pin.setAttribute(
        'aria-pressed',
        String(state.pinnedTabs.includes(state.activeTab))
      )
    }
    if (settings.updateHash !== false) {
      window.history.replaceState(null, '', '#' + id)
    }
    if (settings.focusTab === true) {
      tab.focus()
    }
    if (settings.focusPanel === true) {
      panel.focus()
    }
  }

  function moveActiveTab(direction) {
    var index = state.tabOrder.indexOf(state.activeTab)
    var target = index + direction
    if (index === -1 || target < 0 || target >= state.tabOrder.length) {
      return
    }
    var swapped = state.tabOrder[target]
    state.tabOrder[target] = state.activeTab
    state.tabOrder[index] = swapped
    reorderTabs()
    activateTab(state.activeTab, { updateHash: false, focusTab: true })
  }

  function togglePin() {
    var index = state.pinnedTabs.indexOf(state.activeTab)
    if (index === -1) {
      state.pinnedTabs.push(state.activeTab)
    } else {
      state.pinnedTabs.splice(index, 1)
    }
    reorderTabs()
    activateTab(state.activeTab, { updateHash: false, focusTab: true })
  }

  function handleTabKeys(event) {
    var tabs = Array.from(document.querySelectorAll('[data-tab]'))
    var current = tabs.indexOf(event.currentTarget)
    var target = current
    if (event.key === 'ArrowRight') {
      target = (current + 1) % tabs.length
    } else if (event.key === 'ArrowLeft') {
      target = (current - 1 + tabs.length) % tabs.length
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = tabs.length - 1
    } else {
      return
    }
    event.preventDefault()
    activateTab(tabs[target].dataset.tab, { focusTab: true })
  }

  function initializeTabs() {
    restoreTabState()
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        activateTab(tab.dataset.tab)
      })
      tab.addEventListener('keydown', handleTabKeys)
      tab.addEventListener('dragstart', function (event) {
        event.dataTransfer.setData('text/plain', tab.dataset.tab)
      })
      tab.addEventListener('dragover', function (event) {
        event.preventDefault()
      })
      tab.addEventListener('drop', function (event) {
        event.preventDefault()
        var moved = event.dataTransfer.getData('text/plain')
        var from = state.tabOrder.indexOf(moved)
        var to = state.tabOrder.indexOf(tab.dataset.tab)
        if (from === -1 || to === -1 || from === to) {
          return
        }
        state.tabOrder.splice(from, 1)
        state.tabOrder.splice(to, 0, moved)
        reorderTabs()
        activateTab(moved, { updateHash: false, focusTab: true })
      })
    })
    document
      .querySelector('#tab-jump')
      ?.addEventListener('change', function (event) {
        activateTab(event.target.value, { focusPanel: true })
      })
    document
      .querySelector('[data-tab-action="left"]')
      ?.addEventListener('click', function () {
        moveActiveTab(-1)
      })
    document
      .querySelector('[data-tab-action="right"]')
      ?.addEventListener('click', function () {
        moveActiveTab(1)
      })
    document
      .querySelector('[data-tab-action="pin"]')
      ?.addEventListener('click', togglePin)
    var hash = window.location.hash.replace(/^#/, '')
    activateTab(tabIds().includes(hash) ? hash : 'verdict', {
      updateHash: hash !== '',
    })
    window.addEventListener('hashchange', function () {
      var next = window.location.hash.replace(/^#/, '')
      if (tabIds().includes(next)) {
        activateTab(next, { updateHash: false })
      }
    })
  }

  function initializeAppearance() {
    var defaults = {
      size: 15,
      radius: 16,
      accent: '#6750a4',
      font: 'system-ui, sans-serif',
    }
    var stored = safeJson(StorageKeys.appearance, defaults)
    var settings = Object.assign({}, defaults, stored)
    var controls = {
      size: document.querySelector('#tab-size'),
      radius: document.querySelector('#tab-radius'),
      accent: document.querySelector('#tab-accent'),
      font: document.querySelector('#tab-font'),
    }

    function apply() {
      settings.size = Math.min(
        20,
        Math.max(13, Number(controls.size.value) || defaults.size)
      )
      settings.radius = Math.min(
        28,
        Math.max(0, Number(controls.radius.value) || defaults.radius)
      )
      settings.accent = /^#[0-9a-f]{6}$/i.test(controls.accent.value)
        ? controls.accent.value
        : defaults.accent
      settings.font = controls.font.value
      document.documentElement.style.setProperty(
        '--atlas-tab-size',
        settings.size + 'px'
      )
      document.documentElement.style.setProperty(
        '--atlas-tab-radius',
        settings.radius + 'px'
      )
      document.documentElement.style.setProperty(
        '--atlas-tab-accent',
        settings.accent
      )
      document.documentElement.style.setProperty(
        '--atlas-tab-font',
        settings.font
      )
      document.querySelector('#tab-size-value').textContent =
        settings.size + ' px'
      document.querySelector('#tab-radius-value').textContent =
        settings.radius + ' px'
      safeStore(StorageKeys.appearance, JSON.stringify(settings))
    }

    controls.size.value = String(settings.size)
    controls.radius.value = String(settings.radius)
    controls.accent.value = settings.accent
    controls.font.value = settings.font
    Object.values(controls).forEach(function (control) {
      control.addEventListener('input', apply)
      control.addEventListener('change', apply)
    })
    document
      .querySelector('[data-open-appearance]')
      ?.addEventListener('click', function () {
        elements.appearanceDialog.show()
      })
    document
      .querySelector('[data-reset-appearance]')
      ?.addEventListener('click', function () {
        settings = Object.assign({}, defaults)
        controls.size.value = String(settings.size)
        controls.radius.value = String(settings.radius)
        controls.accent.value = settings.accent
        controls.font.value = settings.font
        apply()
      })
    apply()
  }

  function initializeFitFinder() {
    var inputs = Array.from(
      document.querySelectorAll('[data-fit-cheap][data-fit-git]')
    )
    var stored = safeJson(StorageKeys.fit, [])
    if (Array.isArray(stored)) {
      stored.forEach(function (index) {
        if (inputs[index] !== undefined) {
          inputs[index].checked = true
        }
      })
    }

    function update() {
      var cheap = 0
      var git = 0
      var selected = []
      inputs.forEach(function (input, index) {
        if (!input.checked) {
          return
        }
        selected.push(index)
        cheap += Number(input.dataset.fitCheap)
        git += Number(input.dataset.fitGit)
      })
      safeStore(StorageKeys.fit, JSON.stringify(selected))
      document.querySelector('[data-fit-cheap-score]').textContent =
        String(cheap)
      document.querySelector('[data-fit-git-score]').textContent = String(git)
      var maximum = Math.max(1, cheap, git)
      document.querySelector('[data-fit-cheap-bar]').style.width =
        (cheap / maximum) * 100 + '%'
      document.querySelector('[data-fit-git-bar]').style.width =
        (git / maximum) * 100 + '%'
      var emoji = '🧭'
      var title = {
        en: 'Choose what matters to reveal a fit signal.',
        yue: '揀你重視嘅嘢，就會有配對提示。',
      }
      var detail = {
        en: 'The score starts neutral because software architecture should not read your mind.',
        yue: '分數由中立開始，因為軟件架構唔應該扮識讀心。',
      }
      if (cheap + git > 0 && cheap >= git + 3) {
        emoji = '🧭'
        title = {
          en: 'Cheap LFS is the stronger fit signal.',
          yue: 'Cheap LFS 配對訊號較強。',
        }
        detail = {
          en: 'Your choices favor guided Windows operations, provider control, or built-in verification. Audit the “depends” rows before committing.',
          yue: '你嘅選擇偏向 Windows 導航操作、provider 控制或內置驗證。落實前再查「睇情況」行。',
        }
      } else if (cheap + git > 0 && git >= cheap + 3) {
        emoji = '🌍'
        title = {
          en: 'Git LFS is the stronger fit signal.',
          yue: 'Git LFS 配對訊號較強。',
        }
        detail = {
          en: 'Your choices favor portability, standard tooling, locking, or automation. Confirm host limits and billing before rollout.',
          yue: '你嘅選擇偏向跨平台、標準工具、locking 或 automation。推出前確認 host 限制同計費。',
        }
      } else if (cheap + git > 0) {
        emoji = '🧩'
        title = {
          en: 'The fit is genuinely mixed.',
          yue: '配對結果真係混合。',
        }
        detail = {
          en: 'Split by repository or run a small proof with real contributors. Do not mix pointer assumptions inside one path.',
          yue: '按 repo 分開，或者用真貢獻者做細規模 proof。唔好喺同一路徑混合 pointer 假設。',
        }
      }
      document.querySelector('[data-fit-emoji]').textContent = emoji
      document.querySelector('[data-fit-title]').innerHTML = bilingual(
        title.en,
        title.yue
      )
      document.querySelector('[data-fit-detail]').innerHTML = bilingual(
        detail.en,
        detail.yue
      )
    }

    inputs.forEach(function (input) {
      input.addEventListener('change', update)
    })
    document
      .querySelector('[data-fit-form]')
      ?.addEventListener('reset', function () {
        window.setTimeout(update, 0)
      })
    update()
  }

  var ToneCopy = {
    en: [
      'Evidence-led large-file comparison',
      'The no-hand-waving large-file showdown',
      'Large files enter the comparison arena',
      'The heavyweight pointer championship',
      'Seventy-two differences walk into a Git repository',
    ],
    yue: [
      '大檔方案證據比較',
      '唔耍太極嘅大檔正面比拼',
      '大檔方案擂台逐項拆招',
      'Pointer 界重量級冠軍賽',
      '72 項差異入 Git repo 開擂台，冇一項准走數',
    ],
  }

  function updateAtlasTone(language) {
    var input = document.querySelector('#funny-' + language)
    var target = document.querySelector('[data-atlas-tone="' + language + '"]')
    if (input === null || target === null) {
      return
    }
    var level = Math.min(5, Math.max(1, Number(input.value) || 1))
    target.textContent = ToneCopy[language][level - 1]
  }

  function initializeTone() {
    ;['en', 'yue'].forEach(function (language) {
      var input = document.querySelector('#funny-' + language)
      input?.addEventListener('input', function () {
        updateAtlasTone(language)
      })
      updateAtlasTone(language)
    })
  }

  function initializeEvents() {
    elements.categoryFilters?.addEventListener('click', function (event) {
      var button = event.target.closest('[data-category]')
      if (button !== null) {
        setCategory(button.dataset.category)
      }
    })
    document
      .querySelector('.outcome-filters')
      ?.addEventListener('click', function (event) {
        var button = event.target.closest('[data-outcome]')
        if (button !== null) {
          setOutcome(button.dataset.outcome)
        }
      })
    elements.query?.addEventListener('input', function (event) {
      setPlainQuery(event.target.value)
    })
    elements.form?.addEventListener('reset', function () {
      window.setTimeout(function () {
        state.category = 'all'
        state.outcome = 'all'
        state.query = ''
        state.regexMode = false
        state.regexHitIndexes = null
        safeStore(StorageKeys.category, 'all')
        safeStore(StorageKeys.outcome, 'all')
        updateSearchMode()
        applyFilters()
      }, 0)
    })
    document.querySelectorAll('[data-open-regex]').forEach(function (button) {
      button.addEventListener('click', function () {
        elements.regexPattern.value = state.query
        runBuilderPreview()
        elements.regexDialog.show()
      })
    })
    document.querySelectorAll('[data-regex-token]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = elements.regexPattern
        var token = button.dataset.regexToken
        var start = input.selectionStart || input.value.length
        var end = input.selectionEnd || start
        input.value =
          input.value.slice(0, start) + token + input.value.slice(end)
        input.focus()
        input.setSelectionRange(start + token.length, start + token.length)
        runBuilderPreview()
      })
    })
    elements.regexPattern?.addEventListener('input', runBuilderPreview)
    elements.regexSample?.addEventListener('input', runBuilderPreview)
    document.querySelectorAll('.regex-flags input').forEach(function (input) {
      input.addEventListener('change', runBuilderPreview)
    })
    document
      .querySelector('[data-apply-regex]')
      ?.addEventListener('click', applyRegexFromBuilder)
    document
      .querySelector('[data-copy-regex]')
      ?.addEventListener('click', function () {
        var pattern = elements.regexPattern.value
        if (
          navigator.clipboard !== undefined &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          navigator.clipboard
            .writeText(pattern)
            .then(function () {
              showToast(
                'Pattern copied to the clipboard.',
                'Pattern 已複製去 clipboard。',
                false
              )
            })
            .catch(function () {
              showToast(
                'Clipboard access was refused; select the pattern manually.',
                'Clipboard access 被拒；請手動揀 pattern。',
                true
              )
            })
        } else {
          showToast(
            'Clipboard access is unavailable; select the pattern manually.',
            'Clipboard access 用唔到；請手動揀 pattern。',
            true
          )
        }
      })
    document.body.addEventListener('click', function (event) {
      var activation = event.target.closest('[data-activate-tab]')
      if (activation !== null) {
        event.preventDefault()
        activateTab(activation.dataset.activateTab, { focusPanel: true })
      }
      if (event.target.closest('[data-dismiss-toast]') !== null) {
        elements.toast.hidden = true
      }
    })
  }

  function initialize() {
    if (Rows.length !== 72 || Categories.length !== 12) {
      throw new Error('Comparison atlas contract must stay at 72 × 12.')
    }
    state.category = validCategory(state.category) ? state.category : 'all'
    state.outcome = validOutcome(state.outcome) ? state.outcome : 'all'
    renderRows()
    renderCategoryFilters()
    renderSources()
    initializeTabs()
    initializeAppearance()
    initializeFitFinder()
    initializeTone()
    initializeEvents()
    updateSearchMode()
    applyFilters()
  }

  initialize()
})()
