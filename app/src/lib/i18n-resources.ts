export type TranslationKey =
  | 'ci.status'
  | 'ci.successful'
  | 'ci.failed'
  | 'ci.inProgress'
  | 'ci.timedOut'
  | 'ci.actionRequired'
  | 'ci.neutral'
  | 'ci.cancelled'
  | 'ci.skipped'
  | 'ci.stale'
  | 'update.downloadingLabel'
  | 'update.downloadingValue'
  | 'appearance.updateProgressColor'
  | 'appearance.useAccentColor'
  | 'appearance.languageMode'
  | 'appearance.languageModeDescription'
  | 'appearance.languageAndNavigation'
  | 'appearance.submoduleBackStyle'
  | 'appearance.submoduleBackLabel'
  | 'language.english'
  | 'language.cantonese'
  | 'language.bilingual'
  | 'submodule.backStyleTonal'
  | 'submodule.backStyleFilled'
  | 'submodule.backStyleOutlined'
  | 'submodule.backLabelFull'
  | 'submodule.backLabelParent'
  | 'submodule.backLabelIcon'
  | 'submodule.openAsRepository'
  | 'submodule.openUnavailable'
  | 'submodule.openFailed'
  | 'submodule.returnFailed'
  | 'submodule.workspaceUnsafe'
  | 'submodule.temporaryRemovalUnavailable'
  | 'submodule.temporarySettingsUnavailable'
  | 'submodule.navigation'
  | 'submodule.backToParent'
  | 'submodule.viewingContext'
  | 'submodule.managerTitle'
  | 'submodule.managerClose'
  | 'submodule.title'
  | 'submodule.addAction'
  | 'submodule.addTooltip'
  | 'submodule.updateAllAction'
  | 'submodule.updateAllTooltip'
  | 'submodule.syncAction'
  | 'submodule.syncTooltip'
  | 'submodule.configureAction'
  | 'submodule.configureTooltip'
  | 'submodule.removeAction'
  | 'submodule.removeTooltip'
  | 'submodule.listFailed'
  | 'submodule.updateAllFailed'
  | 'submodule.updateFailed'
  | 'submodule.syncFailed'
  | 'submodule.removeFailed'
  | 'submodule.temporaryToolsReadOnly'
  | 'submodule.summarySingle'
  | 'submodule.summaryMultiple'
  | 'submodule.summaryCloned'
  | 'submodule.summaryNotCloned'
  | 'submodule.statusUninitialized'
  | 'submodule.statusUpToDate'
  | 'submodule.statusOutOfDate'
  | 'submodule.statusConflicted'
  | 'submodule.searchPlaceholder'
  | 'submodule.searchAriaLabel'
  | 'submodule.filterByStatus'
  | 'submodule.filterAll'
  | 'submodule.filterCloned'
  | 'submodule.filterNotCloned'
  | 'submodule.filterOutOfDate'
  | 'submodule.filterConflicted'
  | 'submodule.loading'
  | 'submodule.none'
  | 'submodule.noMatches'
  | 'submodule.cloneAction'
  | 'submodule.cloneTooltip'
  | 'submodule.updateAction'
  | 'submodule.updateTooltip'
  | 'submodule.addDialogTitle'
  | 'submodule.addSubmitAction'
  | 'submodule.addCancelAction'
  | 'submodule.addCancelOperationAction'
  | 'submodule.addDoneAction'
  | 'submodule.addSignInAction'
  | 'submodule.addDotComSignInGuidance'
  | 'submodule.addEnterpriseSignInGuidance'
  | 'submodule.addProviderAccountAction'
  | 'submodule.addProviderSignInGuidance'
  | 'submodule.addOrganizationLoadFailed'
  | 'submodule.addTryAgainAction'
  | 'submodule.addRepositoryListLabel'
  | 'submodule.addRepositoryFilterPlaceholder'
  | 'submodule.addRepositoryUrlLabel'
  | 'submodule.addRepositoryUrlHelp'
  | 'submodule.addPathLabel'
  | 'submodule.addBranchLabel'
  | 'submodule.addRemoteDefaultBranchPlaceholder'
  | 'submodule.addPathChecking'
  | 'submodule.addPathHelp'
  | 'submodule.addBranchHelp'
  | 'submodule.addReviewLabel'
  | 'submodule.addReviewHeading'
  | 'submodule.addReviewRepositoryLabel'
  | 'submodule.addReviewChooseSource'
  | 'submodule.addReviewSuperprojectLabel'
  | 'submodule.addReviewCheckoutPathLabel'
  | 'submodule.addReviewNotSet'
  | 'submodule.addReviewTrackedBranchLabel'
  | 'submodule.addReviewRemoteDefault'
  | 'submodule.addProgressHeading'
  | 'submodule.addProgressLabel'
  | 'submodule.addSuccessHeading'
  | 'submodule.addSuccessDescription'
  | 'submodule.addAddingProgress'
  | 'submodule.addCancellingProgress'
  | 'submodule.addCheckingProgress'
  | 'submodule.addAddedProgress'
  | 'submodule.addCancelledError'
  | 'submodule.addFailed'
  | 'submodule.addPathValidationFailed'
  | 'submodule.addPathRequiredError'
  | 'submodule.addPathRelativeError'
  | 'submodule.addPathSegmentsError'
  | 'submodule.addPathGitMetadataError'
  | 'submodule.addPathDuplicateError'
  | 'submodule.addBranchInvalidError'
  | 'submodule.addSourceRequiredError'
  | 'submodule.addSourceControlCharacterError'
  | 'submodule.addPathUnreadableError'
  | 'submodule.addPathNotEmptyError'
  | 'submodule.addPathIsFileError'
  | 'submodule.configTitle'
  | 'submodule.configUrlRequired'
  | 'submodule.configSetUrlFailed'
  | 'submodule.configSetBranchFailed'
  | 'submodule.configSetKeyFailed'
  | 'submodule.configSyncFailed'
  | 'submodule.configInitFailed'
  | 'submodule.configDeinitFailed'
  | 'submodule.configRemoteUrlLabel'
  | 'submodule.configBranchLabel'
  | 'submodule.configUpdateStrategyLabel'
  | 'submodule.configUseDefaultCheckout'
  | 'submodule.configCheckoutOption'
  | 'submodule.configRebaseOption'
  | 'submodule.configMergeOption'
  | 'submodule.configNoneOption'
  | 'submodule.configIgnoreDirtyLabel'
  | 'submodule.configUseDefaultNone'
  | 'submodule.configUntrackedOption'
  | 'submodule.configDirtyOption'
  | 'submodule.configAllOption'
  | 'submodule.configFetchRecurseLabel'
  | 'submodule.configUseDefaultOnDemand'
  | 'submodule.configYesOption'
  | 'submodule.configOnDemandOption'
  | 'submodule.configNoOption'
  | 'submodule.configShallowCloneLabel'
  | 'submodule.configUseDefaultAction'
  | 'submodule.configUrlHelp'
  | 'submodule.configBranchHelp'
  | 'submodule.configShallowHelp'
  | 'submodule.configActionsLabel'
  | 'submodule.configInitAction'
  | 'submodule.configInitTooltip'
  | 'submodule.configDeinitRequestAction'
  | 'submodule.configDeinitAction'
  | 'submodule.configDeinitTooltip'
  | 'submodule.configSaveAction'
  | 'submodule.configCancelAction'
  | 'submodule.configDeinitConfirmation'
  | 'color.blue'
  | 'color.violet'
  | 'color.teal'
  | 'color.green'
  | 'color.amber'
  | 'color.rose'

/** Complete base catalog. Every missing locale entry falls back to this. */
export const englishTranslations: Readonly<Record<TranslationKey, string>> = {
  'ci.status': 'CI checks: {status}',
  'ci.successful': 'successful',
  'ci.failed': 'failed',
  'ci.inProgress': 'in progress',
  'ci.timedOut': 'timed out',
  'ci.actionRequired': 'action required',
  'ci.neutral': 'neutral',
  'ci.cancelled': 'cancelled',
  'ci.skipped': 'skipped',
  'ci.stale': 'stale',
  'update.downloadingLabel': 'Downloading app update',
  'update.downloadingValue': 'Downloading',
  'appearance.updateProgressColor': 'Update progress color',
  'appearance.useAccentColor': 'Use accent color',
  'appearance.languageMode': 'Language',
  'appearance.languageModeDescription':
    'Choose English, playful Hong Kong Cantonese, or a compact bilingual view.',
  'appearance.languageAndNavigation': 'Language and navigation',
  'appearance.submoduleBackStyle': 'Submodule Back button style',
  'appearance.submoduleBackLabel': 'Submodule Back button label',
  'language.english': 'English',
  'language.cantonese': 'Playful Hong Kong Cantonese',
  'language.bilingual': 'Bilingual',
  'submodule.backStyleTonal': 'Tonal',
  'submodule.backStyleFilled': 'Filled accent',
  'submodule.backStyleOutlined': 'Outlined',
  'submodule.backLabelFull': 'Back to parent',
  'submodule.backLabelParent': 'Parent name',
  'submodule.backLabelIcon': 'Icon only',
  'submodule.openAsRepository': 'Open as repository',
  'submodule.openUnavailable': 'Clone this submodule before opening it',
  'submodule.openFailed': 'Could not open {child} as a repository: {error}',
  'submodule.returnFailed': 'Could not return to {parent}: {error}',
  'submodule.workspaceUnsafe':
    'This temporary submodule workspace is no longer safe to use. Returned to {parent}. Details: {error}',
  'submodule.temporaryRemovalUnavailable':
    'This submodule is open temporarily. Return to {parent} to manage or remove it.',
  'submodule.temporarySettingsUnavailable':
    'Repository settings are saved only for repositories in your list. Return to {parent} to manage persisted settings.',
  'submodule.navigation': 'Temporary submodule repository navigation',
  'submodule.backToParent': 'Back to {parent}',
  'submodule.viewingContext':
    'Viewing submodule {child} inside {parent}. It is not added to your repository list.',
  'submodule.managerTitle': 'Submodule manager',
  'submodule.managerClose': 'Close',
  'submodule.title': 'Submodules',
  'submodule.addAction': 'Add submodule…',
  'submodule.addTooltip': 'Choose a hosted repository or URL to add',
  'submodule.updateAllAction': 'Update all',
  'submodule.updateAllTooltip': 'Initialize and update every submodule',
  'submodule.syncAction': 'Sync',
  'submodule.syncTooltip': 'Sync the remote URL from .gitmodules',
  'submodule.configureAction': 'Configure',
  'submodule.configureTooltip': "Edit this submodule's configuration",
  'submodule.removeAction': 'Remove',
  'submodule.removeTooltip': 'Deinitialize and remove this submodule',
  'submodule.listFailed': 'Could not list submodules: {error}',
  'submodule.updateAllFailed': 'Failed updating submodules: {error}',
  'submodule.updateFailed': 'Failed updating {path}: {error}',
  'submodule.syncFailed': 'Failed syncing {path}: {error}',
  'submodule.removeFailed': 'Failed removing {path}: {error}',
  'submodule.temporaryToolsReadOnly':
    'Temporary submodule workspaces allow read-only repository tools only. Return to {parent} before running a tool that changes this checkout.',
  'submodule.summarySingle': '{count} submodule',
  'submodule.summaryMultiple': '{count} submodules',
  'submodule.summaryCloned': '{count} cloned',
  'submodule.summaryNotCloned': '{count} not cloned',
  'submodule.statusUninitialized': 'Not initialized',
  'submodule.statusUpToDate': 'Up to date',
  'submodule.statusOutOfDate': 'Out of date',
  'submodule.statusConflicted': 'Conflicted',
  'submodule.searchPlaceholder': 'Search submodules by name, path, or URL',
  'submodule.searchAriaLabel': 'Search submodules',
  'submodule.filterByStatus': 'Filter submodules by status',
  'submodule.filterAll': 'All',
  'submodule.filterCloned': 'Cloned',
  'submodule.filterNotCloned': 'Not cloned',
  'submodule.filterOutOfDate': 'Out of date',
  'submodule.filterConflicted': 'Conflicted',
  'submodule.loading': 'Loading submodules…',
  'submodule.none': 'This repository has no submodules yet.',
  'submodule.noMatches':
    'No submodules match the current search and status filter.',
  'submodule.cloneAction': 'Clone',
  'submodule.cloneTooltip': 'Clone this submodule into the working tree',
  'submodule.updateAction': 'Update',
  'submodule.updateTooltip': 'Initialize and update this submodule',
  'submodule.addDialogTitle': 'Add a submodule',
  'submodule.addSubmitAction': 'Add submodule',
  'submodule.addCancelAction': 'Cancel',
  'submodule.addCancelOperationAction': 'Cancel operation',
  'submodule.addDoneAction': 'Done',
  'submodule.addSignInAction': 'Sign in',
  'submodule.addDotComSignInGuidance':
    'Sign in to GitHub.com to browse repositories for this submodule.',
  'submodule.addEnterpriseSignInGuidance':
    'Sign in to GitHub Enterprise to browse repositories for this submodule.',
  'submodule.addProviderAccountAction': 'Add provider account',
  'submodule.addProviderSignInGuidance':
    'Add a GitLab or Bitbucket account in Settings to browse its repositories.',
  'submodule.addOrganizationLoadFailed':
    "Desktop couldn't load every organization repository.",
  'submodule.addTryAgainAction': 'Try again',
  'submodule.addRepositoryListLabel': 'Choose a repository for the submodule',
  'submodule.addRepositoryFilterPlaceholder':
    'Filter repositories for this submodule',
  'submodule.addRepositoryUrlLabel': 'Repository URL',
  'submodule.addRepositoryUrlHelp':
    'HTTPS, SSH, and local Git remote URLs are supported.',
  'submodule.addPathLabel': 'Path inside repository',
  'submodule.addBranchLabel': 'Branch (optional)',
  'submodule.addRemoteDefaultBranchPlaceholder': 'Remote default branch',
  'submodule.addPathChecking':
    'Checking that the destination is safe and empty…',
  'submodule.addPathHelp':
    'A relative checkout path; the final segment becomes the default submodule name.',
  'submodule.addBranchHelp':
    'Leave empty to follow the repository’s remote default branch.',
  'submodule.addReviewLabel': 'Submodule review',
  'submodule.addReviewHeading': 'Review',
  'submodule.addReviewRepositoryLabel': 'Repository',
  'submodule.addReviewChooseSource': 'Choose a source above',
  'submodule.addReviewSuperprojectLabel': 'Superproject',
  'submodule.addReviewCheckoutPathLabel': 'Checkout path',
  'submodule.addReviewNotSet': 'Not set',
  'submodule.addReviewTrackedBranchLabel': 'Tracked branch',
  'submodule.addReviewRemoteDefault': 'Remote default',
  'submodule.addProgressHeading': 'Adding submodule',
  'submodule.addProgressLabel': 'Add submodule progress',
  'submodule.addSuccessHeading': 'Submodule added',
  'submodule.addSuccessDescription':
    'Git updated .gitmodules and checked out the repository at {path}.',
  'submodule.addAddingProgress': 'Adding the submodule…',
  'submodule.addCancellingProgress': 'Cancelling the Git operation…',
  'submodule.addCheckingProgress': 'Checking the repository and destination…',
  'submodule.addAddedProgress': 'Submodule added.',
  'submodule.addCancelledError':
    'Adding the submodule was cancelled. No further Git work is running.',
  'submodule.addFailed': 'Desktop could not add this submodule: {error}',
  'submodule.addPathValidationFailed':
    'Desktop could not validate this submodule path: {error}',
  'submodule.addPathRequiredError': 'Enter a path inside this repository.',
  'submodule.addPathRelativeError':
    'Choose a relative path inside this repository.',
  'submodule.addPathSegmentsError':
    'The path cannot contain empty, current-directory, or parent-directory segments.',
  'submodule.addPathGitMetadataError':
    'The path cannot use Git metadata directories.',
  'submodule.addPathDuplicateError': 'A submodule already uses this path.',
  'submodule.addBranchInvalidError':
    'Enter a valid branch name, or leave the branch empty to use the remote default.',
  'submodule.addSourceRequiredError': 'Choose a repository or enter its URL.',
  'submodule.addSourceControlCharacterError':
    'The repository URL contains unsupported control characters.',
  'submodule.addPathUnreadableError':
    'Unable to read the path on disk. Check the path and try again.',
  'submodule.addPathNotEmptyError':
    'This folder contains files. Git can only clone to empty folders.',
  'submodule.addPathIsFileError':
    'A file already uses this name. Git can only clone to a folder.',
  'submodule.configTitle': 'Configure {name}',
  'submodule.configUrlRequired':
    'Enter a remote URL, or use Deinit to retire this submodule instead.',
  'submodule.configSetUrlFailed': 'Failed setting the URL for {path}: {error}',
  'submodule.configSetBranchFailed':
    'Failed setting the branch for {path}: {error}',
  'submodule.configSetKeyFailed': 'Failed setting {setting}: {error}',
  'submodule.configSyncFailed': 'Failed syncing {path}: {error}',
  'submodule.configInitFailed': 'Failed initializing {path}: {error}',
  'submodule.configDeinitFailed': 'Failed deinitializing {path}: {error}',
  'submodule.configRemoteUrlLabel': 'Remote URL',
  'submodule.configBranchLabel': 'Branch',
  'submodule.configUpdateStrategyLabel': 'Update strategy',
  'submodule.configUseDefaultCheckout': 'Use default (checkout)',
  'submodule.configCheckoutOption': 'Checkout',
  'submodule.configRebaseOption': 'Rebase',
  'submodule.configMergeOption': 'Merge',
  'submodule.configNoneOption': 'None',
  'submodule.configIgnoreDirtyLabel': 'Ignore dirty state',
  'submodule.configUseDefaultNone': 'Use default (none)',
  'submodule.configUntrackedOption': 'Untracked',
  'submodule.configDirtyOption': 'Dirty',
  'submodule.configAllOption': 'All',
  'submodule.configFetchRecurseLabel': 'Fetch recurse submodules',
  'submodule.configUseDefaultOnDemand': 'Use default (on-demand)',
  'submodule.configYesOption': 'Yes',
  'submodule.configOnDemandOption': 'On demand',
  'submodule.configNoOption': 'No',
  'submodule.configShallowCloneLabel': 'Shallow clone',
  'submodule.configUseDefaultAction': 'Use default',
  'submodule.configUrlHelp':
    'Saving a new URL also syncs it into the checked-out submodule.',
  'submodule.configBranchHelp': 'Leave empty to track the remote HEAD.',
  'submodule.configShallowHelp':
    "When neither checked nor unchecked, Git's default (full history) applies.",
  'submodule.configActionsLabel': 'Submodule actions',
  'submodule.configInitAction': 'Init',
  'submodule.configInitTooltip':
    'Register this submodule in the local configuration',
  'submodule.configDeinitRequestAction': 'Deinit…',
  'submodule.configDeinitAction': 'Deinit',
  'submodule.configDeinitTooltip':
    'Unregister this submodule and clear its working tree',
  'submodule.configSaveAction': 'Save changes',
  'submodule.configCancelAction': 'Cancel',
  'submodule.configDeinitConfirmation':
    'Are you sure you want to deinit {path}? This unregisters the submodule and clears its working tree, discarding any local changes inside it.',
  'color.blue': 'Blue',
  'color.violet': 'Violet',
  'color.teal': 'Teal',
  'color.green': 'Green',
  'color.amber': 'Amber',
  'color.rose': 'Rose',
}

/** Hong Kong Cantonese catalog. Missing entries deliberately use English. */
export const cantoneseTranslations: Readonly<
  Partial<Record<TranslationKey, string>>
> = {
  'ci.status': 'CI 檢查：{status}',
  'ci.successful': '成功，掂晒',
  'ci.failed': '失敗',
  'ci.inProgress': '做緊',
  'ci.timedOut': '等太耐，已逾時',
  'ci.actionRequired': '要你處理',
  'ci.neutral': '中性',
  'ci.cancelled': '已取消',
  'ci.skipped': '已略過',
  'ci.stale': '資料舊咗',
  'update.downloadingLabel': '下載緊應用程式更新',
  'update.downloadingValue': '下載緊',
  'appearance.updateProgressColor': '更新進度列顏色',
  'appearance.useAccentColor': '跟強調色',
  'appearance.languageMode': '語言',
  'appearance.languageModeDescription':
    '揀英文、玩味港式廣東話，或者慳位雙語模式。',
  'appearance.languageAndNavigation': '語言同導覽',
  'appearance.submoduleBackStyle': '子模組返回掣款式',
  'appearance.submoduleBackLabel': '子模組返回掣文字',
  'language.english': '英文',
  'language.cantonese': '玩味港式廣東話',
  'language.bilingual': '雙語',
  'submodule.backStyleTonal': '柔和色調',
  'submodule.backStyleFilled': '實色強調',
  'submodule.backStyleOutlined': '外框',
  'submodule.backLabelFull': '返去主 repo',
  'submodule.backLabelParent': '顯示主 repo 名',
  'submodule.backLabelIcon': '淨圖示',
  'submodule.openAsRepository': '當獨立 repo 打開',
  'submodule.openUnavailable': '要先複製呢個子模組先開得',
  'submodule.openFailed': '未能將 {child} 當 repo 打開：{error}',
  'submodule.returnFailed': '未能返去 {parent}：{error}',
  'submodule.workspaceUnsafe':
    '呢個臨時子模組工作區已經唔再安全使用；已經返去 {parent}。詳情：{error}',
  'submodule.temporaryRemovalUnavailable':
    '呢個子模組只係臨時打開；請返去 {parent} 先管理或者移除。',
  'submodule.temporarySettingsUnavailable':
    'Repo 設定只會儲俾清單入面嘅 repo；請返去 {parent} 先管理要保存嘅設定。',
  'submodule.navigation': '臨時子模組 repo 導覽',
  'submodule.backToParent': '返去 {parent}',
  'submodule.viewingContext':
    '而家睇緊 {parent} 入面嘅子模組 {child}；唔會加落 repo 清單。',
  'submodule.managerTitle': '子模組管理',
  'submodule.managerClose': '關閉',
  'submodule.title': '子模組',
  'submodule.addAction': '新增子模組…',
  'submodule.addTooltip': '揀託管 repo 或者 URL 加入',
  'submodule.updateAllAction': '全部更新',
  'submodule.updateAllTooltip': '初始化兼更新全部子模組',
  'submodule.syncAction': '同步',
  'submodule.syncTooltip': '由 .gitmodules 同步遠端 URL',
  'submodule.configureAction': '設定',
  'submodule.configureTooltip': '編輯呢個子模組嘅設定',
  'submodule.removeAction': '移除',
  'submodule.removeTooltip': '取消初始化並移除呢個子模組',
  'submodule.listFailed': '未能列出子模組：{error}',
  'submodule.updateAllFailed': '未能更新子模組：{error}',
  'submodule.updateFailed': '未能更新 {path}：{error}',
  'submodule.syncFailed': '未能同步 {path}：{error}',
  'submodule.removeFailed': '未能移除 {path}：{error}',
  'submodule.temporaryToolsReadOnly':
    '臨時子模組工作區只可以用唯讀 repo 工具；執行會改動呢個 checkout 嘅工具之前，請先返去 {parent}。',
  'submodule.summarySingle': '{count} 個子模組',
  'submodule.summaryMultiple': '{count} 個子模組',
  'submodule.summaryCloned': '{count} 個已複製',
  'submodule.summaryNotCloned': '{count} 個未複製',
  'submodule.statusUninitialized': '未初始化',
  'submodule.statusUpToDate': '已經最新',
  'submodule.statusOutOfDate': '未追到最新',
  'submodule.statusConflicted': '有衝突',
  'submodule.searchPlaceholder': '用名稱、路徑或者 URL 搵子模組',
  'submodule.searchAriaLabel': '搜尋子模組',
  'submodule.filterByStatus': '按狀態篩選子模組',
  'submodule.filterAll': '全部',
  'submodule.filterCloned': '已複製',
  'submodule.filterNotCloned': '未複製',
  'submodule.filterOutOfDate': '未追到最新',
  'submodule.filterConflicted': '有衝突',
  'submodule.loading': '載入緊子模組…',
  'submodule.none': '呢個 repo 暫時未有子模組。',
  'submodule.noMatches': '而家嘅搜尋同狀態篩選搵唔到子模組。',
  'submodule.cloneAction': '複製',
  'submodule.cloneTooltip': '將呢個子模組複製入工作樹',
  'submodule.updateAction': '更新',
  'submodule.updateTooltip': '初始化兼更新呢個子模組',
  'submodule.addDialogTitle': '新增子模組',
  'submodule.addSubmitAction': '新增子模組',
  'submodule.addCancelAction': '取消',
  'submodule.addCancelOperationAction': '取消操作',
  'submodule.addDoneAction': '完成',
  'submodule.addSignInAction': '登入',
  'submodule.addDotComSignInGuidance':
    '登入 GitHub.com，就可以瀏覽今次子模組可用嘅 repo。',
  'submodule.addEnterpriseSignInGuidance':
    '登入 GitHub Enterprise，就可以瀏覽今次子模組可用嘅 repo。',
  'submodule.addProviderAccountAction': '新增供應商帳戶',
  'submodule.addProviderSignInGuidance':
    '去「設定」新增 GitLab 或 Bitbucket 帳戶，就可以瀏覽佢嘅 repo。',
  'submodule.addOrganizationLoadFailed': 'Desktop 未能載入組織嘅所有 repo。',
  'submodule.addTryAgainAction': '再試一次',
  'submodule.addRepositoryListLabel': '揀一個 repo 做子模組',
  'submodule.addRepositoryFilterPlaceholder': '篩選今次子模組可用嘅 repo',
  'submodule.addRepositoryUrlLabel': 'Repo URL',
  'submodule.addRepositoryUrlHelp': '支援 HTTPS、SSH 同本機 Git 遠端 URL。',
  'submodule.addPathLabel': 'Repo 內路徑',
  'submodule.addBranchLabel': '分支（可選）',
  'submodule.addRemoteDefaultBranchPlaceholder': '遠端預設分支',
  'submodule.addPathChecking': '檢查緊目的地係咪安全兼空白…',
  'submodule.addPathHelp':
    '請用相對 checkout 路徑；最後一段會成為預設子模組名稱。',
  'submodule.addBranchHelp': '留空就會跟 repo 嘅遠端預設分支。',
  'submodule.addReviewLabel': '子模組檢視',
  'submodule.addReviewHeading': '檢視',
  'submodule.addReviewRepositoryLabel': 'Repo',
  'submodule.addReviewChooseSource': '先喺上面揀來源',
  'submodule.addReviewSuperprojectLabel': '主 repo',
  'submodule.addReviewCheckoutPathLabel': 'Checkout 路徑',
  'submodule.addReviewNotSet': '未設定',
  'submodule.addReviewTrackedBranchLabel': '追蹤分支',
  'submodule.addReviewRemoteDefault': '遠端預設',
  'submodule.addProgressHeading': '加緊子模組',
  'submodule.addProgressLabel': '新增子模組進度',
  'submodule.addSuccessHeading': '子模組已新增',
  'submodule.addSuccessDescription':
    'Git 已更新 .gitmodules，並將 repo checkout 到 {path}。',
  'submodule.addAddingProgress': '加緊子模組…',
  'submodule.addCancellingProgress': '取消緊 Git 操作…',
  'submodule.addCheckingProgress': '檢查緊 repo 同目的地…',
  'submodule.addAddedProgress': '子模組已新增。',
  'submodule.addCancelledError': '新增子模組已取消，冇其他 Git 工作繼續運行。',
  'submodule.addFailed': 'Desktop 未能新增呢個子模組：{error}',
  'submodule.addPathValidationFailed':
    'Desktop 未能驗證呢個子模組路徑：{error}',
  'submodule.addPathRequiredError': '請輸入呢個 repo 入面嘅路徑。',
  'submodule.addPathRelativeError': '請揀呢個 repo 入面嘅相對路徑。',
  'submodule.addPathSegmentsError':
    '路徑唔可以包含空白、目前目錄或者上層目錄區段。',
  'submodule.addPathGitMetadataError': '路徑唔可以使用 Git metadata 目錄。',
  'submodule.addPathDuplicateError': '已經有子模組用緊呢條路徑。',
  'submodule.addBranchInvalidError':
    '請輸入有效分支名稱，或者留空以使用遠端預設分支。',
  'submodule.addSourceRequiredError': '請揀一個 repo，或者輸入佢嘅 URL。',
  'submodule.addSourceControlCharacterError': 'Repo URL 包含唔支援嘅控制字元。',
  'submodule.addPathUnreadableError': '讀唔到磁碟上嘅路徑；請檢查路徑再試。',
  'submodule.addPathNotEmptyError':
    '呢個資料夾有檔案；Git 只可以複製去空白資料夾。',
  'submodule.addPathIsFileError':
    '已經有檔案用緊呢個名稱；Git 只可以複製去資料夾。',
  'submodule.configTitle': '設定 {name}',
  'submodule.configUrlRequired':
    '請輸入遠端 URL；如果想停用呢個子模組，請改用「取消初始化」。',
  'submodule.configSetUrlFailed': '未能設定 {path} 嘅 URL：{error}',
  'submodule.configSetBranchFailed': '未能設定 {path} 嘅分支：{error}',
  'submodule.configSetKeyFailed': '未能設定 {setting}：{error}',
  'submodule.configSyncFailed': '未能同步 {path}：{error}',
  'submodule.configInitFailed': '未能初始化 {path}：{error}',
  'submodule.configDeinitFailed': '未能取消初始化 {path}：{error}',
  'submodule.configRemoteUrlLabel': '遠端 URL',
  'submodule.configBranchLabel': '分支',
  'submodule.configUpdateStrategyLabel': '更新策略',
  'submodule.configUseDefaultCheckout': '使用預設值（checkout）',
  'submodule.configCheckoutOption': 'Checkout',
  'submodule.configRebaseOption': 'Rebase',
  'submodule.configMergeOption': 'Merge',
  'submodule.configNoneOption': '無',
  'submodule.configIgnoreDirtyLabel': '忽略 dirty 狀態',
  'submodule.configUseDefaultNone': '使用預設值（無）',
  'submodule.configUntrackedOption': '未追蹤',
  'submodule.configDirtyOption': 'Dirty',
  'submodule.configAllOption': '全部',
  'submodule.configFetchRecurseLabel': 'Fetch 時遞迴子模組',
  'submodule.configUseDefaultOnDemand': '使用預設值（有需要先做）',
  'submodule.configYesOption': '係',
  'submodule.configOnDemandOption': '有需要先做',
  'submodule.configNoOption': '唔係',
  'submodule.configShallowCloneLabel': '淺層複製',
  'submodule.configUseDefaultAction': '使用預設值',
  'submodule.configUrlHelp': '儲存新 URL 時，亦會同步去已 checkout 嘅子模組。',
  'submodule.configBranchHelp': '留空就會追蹤遠端 HEAD。',
  'submodule.configShallowHelp':
    '冇剔選亦冇取消剔選時，會使用 Git 預設值（完整歷史）。',
  'submodule.configActionsLabel': '子模組操作',
  'submodule.configInitAction': '初始化',
  'submodule.configInitTooltip': '將呢個子模組登記入本機設定',
  'submodule.configDeinitRequestAction': '取消初始化…',
  'submodule.configDeinitAction': '取消初始化',
  'submodule.configDeinitTooltip': '取消登記呢個子模組並清空工作樹',
  'submodule.configSaveAction': '儲存變更',
  'submodule.configCancelAction': '取消',
  'submodule.configDeinitConfirmation':
    '確定要取消初始化 {path}？呢個操作會取消登記子模組並清空工作樹，入面未儲存嘅本機變更都會被丟棄。',
  'color.blue': '藍色',
  'color.violet': '紫色',
  'color.teal': '藍綠色',
  'color.green': '綠色',
  'color.amber': '琥珀色',
  'color.rose': '玫瑰色',
}
