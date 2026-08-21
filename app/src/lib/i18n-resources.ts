export type TranslationKey =
  | 'supportTickets.title'
  | 'supportTickets.subtitle'
  | 'supportTickets.entry.unlockPrompt'
  | 'supportTickets.entry.lockSetting'
  | 'supportTickets.entry.help'
  | 'supportTickets.entry.accessibleName'
  | 'supportTickets.arrivedFrom.unlockPrompt'
  | 'supportTickets.arrivedFrom.lockSetting'
  | 'supportTickets.arrivedFrom.help'
  | 'supportTickets.close'
  | 'supportTickets.disclosure'
  | 'supportTickets.deskLead.plain'
  | 'supportTickets.deskLead.light'
  | 'supportTickets.deskLead.playful'
  | 'supportTickets.deskLead.maximum'
  | 'supportTickets.explain.summary'
  | 'supportTickets.explain.body'
  | 'supportTickets.provenance.stored'
  | 'supportTickets.provenance.default'
  | 'supportTickets.form.legend'
  | 'supportTickets.form.category'
  | 'supportTickets.form.categoryHint'
  | 'supportTickets.form.severity'
  | 'supportTickets.form.severityHint'
  | 'supportTickets.form.description'
  | 'supportTickets.form.descriptionHint'
  | 'supportTickets.form.descriptionRequired'
  | 'supportTickets.form.submit'
  | 'supportTickets.category.forgottenPassword'
  | 'supportTickets.category.lostAuthenticator'
  | 'supportTickets.category.lockedTab'
  | 'supportTickets.category.lockedAppearance'
  | 'supportTickets.category.somethingElse'
  | 'supportTickets.severity.whenever'
  | 'supportTickets.severity.normal'
  | 'supportTickets.severity.urgent'
  | 'supportTickets.severity.critical'
  | 'supportTickets.searchPlaceholder'
  | 'supportTickets.searchField'
  | 'supportTickets.invalidPattern'
  | 'supportTickets.filters'
  | 'supportTickets.chip.open'
  | 'supportTickets.chip.resolved'
  | 'supportTickets.chip.urgent'
  | 'supportTickets.list'
  | 'supportTickets.empty.none'
  | 'supportTickets.empty.noMatch'
  | 'supportTickets.row.select'
  | 'supportTickets.row.advance'
  | 'supportTickets.row.delete'
  | 'supportTickets.row.detail'
  | 'supportTickets.row.opened'
  | 'supportTickets.row.responses'
  | 'supportTickets.status.received'
  | 'supportTickets.status.triaged'
  | 'supportTickets.status.awaitingCustomer'
  | 'supportTickets.status.resolved'
  | 'supportTickets.response.acknowledged.plain'
  | 'supportTickets.response.acknowledged.light'
  | 'supportTickets.response.acknowledged.playful'
  | 'supportTickets.response.acknowledged.maximum'
  | 'supportTickets.response.triaged'
  | 'supportTickets.response.awaitingCustomer'
  | 'supportTickets.response.resolved'
  | 'supportTickets.responseAt'
  | 'supportTickets.correspondence'
  | 'supportTickets.selectAllFiltered'
  | 'supportTickets.selectAllEverything'
  | 'supportTickets.selectionCount'
  | 'supportTickets.invertSelection'
  | 'supportTickets.bulkAdvance'
  | 'supportTickets.bulkExport'
  | 'supportTickets.bulkDelete'
  | 'supportTickets.bulkScoped'
  | 'supportTickets.scope.selection'
  | 'supportTickets.scope.filtered'
  | 'supportTickets.scope.all'
  | 'supportTickets.moreActions'
  | 'supportTickets.listMenu.title'
  | 'supportTickets.listMenu.selectFiltered'
  | 'supportTickets.listMenu.selectEverything'
  | 'supportTickets.listMenu.invert'
  | 'supportTickets.listMenu.clearSelection'
  | 'supportTickets.listMenu.advanceScope'
  | 'supportTickets.listMenu.export'
  | 'supportTickets.listMenu.deleteScope'
  | 'supportTickets.rowMenu.title'
  | 'supportTickets.rowMenu.advance'
  | 'supportTickets.rowMenu.copyNumber'
  | 'supportTickets.rowMenu.export'
  | 'supportTickets.rowMenu.delete'
  | 'supportTickets.rowMenu.select'
  | 'supportTickets.rowMenu.deselect'
  | 'supportTickets.export.saveDialogTitle'
  | 'supportTickets.exportMenu.title'
  | 'supportTickets.exportMenu.filterPlaceholder'
  | 'supportTickets.menuFilterPlaceholder'
  | 'supportTickets.toast.created'
  | 'supportTickets.toast.advanced'
  | 'supportTickets.toast.alreadyResolved'
  | 'supportTickets.toast.deleted'
  | 'supportTickets.toast.deletedMany'
  | 'supportTickets.toast.exported'
  | 'supportTickets.toast.copied'
  | 'supportTickets.toast.selectedAll'
  | 'supportTickets.toast.copiedPath'
  | 'supportTickets.toast.folderOpened'
  | 'supportTickets.toast.folderFailed'
  | 'supportTickets.toast.folderUnavailable'
  | 'supportTickets.resolution.heading'
  | 'supportTickets.resolution.lead.plain'
  | 'supportTickets.resolution.lead.light'
  | 'supportTickets.resolution.lead.playful'
  | 'supportTickets.resolution.lead.maximum'
  | 'supportTickets.resolution.pathLabel'
  | 'supportTickets.resolution.pathResolving'
  | 'supportTickets.resolution.pathUnavailable'
  | 'supportTickets.resolution.pathProvenanceResolved'
  | 'supportTickets.resolution.pathProvenanceUnresolved'
  | 'supportTickets.resolution.open'
  | 'supportTickets.resolution.copyPath'
  | 'supportTickets.resolution.neverDeletes'
  | 'supportTickets.resolution.opened'
  | 'supportTickets.resolution.failed'
  | 'supportTickets.resolution.unavailable'
  | 'supportTickets.gate.eyebrow'
  | 'supportTickets.gate.title'
  | 'supportTickets.gate.description'
  | 'supportTickets.gate.keysLegend'
  | 'supportTickets.gate.keyCount'
  | 'supportTickets.gate.keyScope'
  | 'supportTickets.gate.sliderLabel'
  | 'supportTickets.gate.sliderValue'
  | 'supportTickets.gate.statusLocked'
  | 'supportTickets.gate.statusReady'
  | 'supportTickets.gate.statusMoving'
  | 'supportTickets.gate.statusAuthorized'
  | 'supportTickets.gate.emergencyExit'
  | 'supportTickets.gate.confirm'
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
  | 'startup.loading'
  | 'repositorySection.actions'
  | 'repositorySection.releases'
  | 'repositorySection.issues'
  | 'repositorySection.triage'
  | 'repositorySection.tools'
  | 'repositorySection.launchpad'
  | 'repositorySection.historyGraph'
  | 'update.downloadingLabel'
  | 'update.downloadingValue'
  | 'update.comingSoon'
  | 'update.comingSoon.showDetails'
  | 'update.comingSoon.hideDetails'
  | 'update.comingSoon.detailsLabel'
  | 'update.comingSoon.estimateNotice'
  | 'update.comingSoon.etaMinutes'
  | 'update.comingSoon.etaHours'
  | 'update.comingSoon.etaDays'
  | 'update.comingSoon.etaShortly'
  | 'update.comingSoon.etaAnyMinute'
  | 'update.comingSoon.etaUnknown'
  | 'update.comingSoon.durationMinutes'
  | 'update.comingSoon.durationHours'
  | 'update.comingSoon.durationDays'
  | 'update.comingSoon.targetLabel'
  | 'update.comingSoon.targetUnknown'
  | 'update.comingSoon.signalLabel'
  | 'update.comingSoon.signalBuildRunning'
  | 'update.comingSoon.signalAwaitingRelease'
  | 'update.comingSoon.signalNewerCommit'
  | 'update.comingSoon.basisLabel'
  | 'update.comingSoon.basisRunningWorkflow'
  | 'update.comingSoon.basisRunningWorkflowUnmeasured'
  | 'update.comingSoon.basisGreenCI'
  | 'update.comingSoon.basisCadence'
  | 'update.comingSoon.basisCadenceUnmeasured'
  | 'update.comingSoon.cadenceLabel'
  | 'update.comingSoon.cadenceValue'
  | 'update.comingSoon.cadenceUnknown'
  | 'update.comingSoon.commitLabel'
  | 'update.comingSoon.viewCommit'
  | 'update.comingSoon.viewRun'
  | 'update.comingSoon.latestReleaseLabel'
  | 'update.comingSoon.latestReleaseUnknown'
  | 'appearance.updateProgressColor'
  | 'appearance.useAccentColor'
  | 'appearance.languageMode'
  | 'appearance.languageModeDescription'
  | 'appearance.languageAndNavigation'
  | 'appearance.playfulnessHeading'
  | 'appearance.playfulnessDescription'
  | 'appearance.englishPlayfulness'
  | 'appearance.cantonesePlayfulness'
  | 'appearance.playfulnessValue'
  | 'appearance.playfulnessSerious'
  | 'appearance.playfulnessMaximum'
  | 'dialogEmoji.heading'
  | 'dialogEmoji.toggleLabel'
  | 'dialogEmoji.explanationSummary'
  | 'dialogEmoji.explanation.plain'
  | 'dialogEmoji.explanation.light'
  | 'dialogEmoji.explanation.playful'
  | 'dialogEmoji.explanation.maximum'
  | 'dialogEmoji.boundaryNote'
  | 'dialogEmoji.provenanceDefault'
  | 'dialogEmoji.provenanceStored'
  | 'dialogEmoji.stateOn'
  | 'dialogEmoji.stateOff'
  | 'palette.showDialogEmoji'
  | 'palette.showDialogEmojiDescription'
  | 'settingsSearch.entry.appearanceDialogEmoji.title'
  | 'settingsSearch.entry.appearanceDialogEmoji.desc'
  | 'palette.showClassicToolbar'
  | 'palette.showClassicToolbarDescription'
  | 'settingsSearch.entry.appearanceClassicToolbar.title'
  | 'settingsSearch.entry.appearanceClassicToolbar.desc'
  | 'appearance.schoolModeHeading'
  | 'appearance.schoolModeDescription'
  | 'appearance.schoolModeName'
  | 'appearance.schoolModeNameDescription'
  | 'appearance.schoolModeEnabled'
  | 'appearance.schoolModeCredential'
  | 'appearance.schoolModeCredentialConfirm'
  | 'appearance.schoolModeUnlockDescription'
  | 'appearance.schoolModeResetDescription'
  | 'appearance.schoolModeEnable'
  | 'appearance.schoolModeDisable'
  | 'appearance.schoolModeCredentialInvalid'
  | 'appearance.schoolModeCredentialMismatch'
  | 'appearance.schoolModeCredentialError'
  | 'appearance.elementGestureHeading'
  | 'appearance.elementGesture.plain'
  | 'appearance.elementGesture.light'
  | 'appearance.elementGesture.playful'
  | 'appearance.elementGesture.maximum'
  | 'appearance.scheduledSettingsHeading'
  | 'appearance.scheduledSettingsDescription'
  | 'appearance.scheduledSettingsRuleDetails'
  | 'appearance.scheduledSettingsRuleHelp'
  | 'appearance.scheduledSettingsRuleProvenance'
  | 'appearance.scheduledSettingsSourceDetails'
  | 'appearance.scheduledSettingsSourceProvenance'
  | 'appearance.scheduledSettingsValueDetails'
  | 'appearance.scheduledSettingsValueProvenance'
  | 'appearance.scheduledSettingsAdd'
  | 'appearance.scheduledSettingsEmpty'
  | 'appearance.scheduledSettingsRule'
  | 'appearance.scheduledSettingsEnabled'
  | 'appearance.scheduledSettingsAllDays'
  | 'appearance.scheduledSettingsWeekdays'
  | 'appearance.scheduledSettingsStartDate'
  | 'appearance.scheduledSettingsEndDate'
  | 'appearance.scheduledSettingsDateRangeInvalid'
  | 'appearance.scheduledSettingsStartTime'
  | 'appearance.scheduledSettingsEndTime'
  | 'appearance.scheduledSettingsTimeZone'
  | 'appearance.scheduledSettingsSource'
  | 'appearance.scheduledSettingsLocal'
  | 'appearance.scheduledSettingsAPI'
  | 'appearance.scheduledSettingsHomeAssistant'
  | 'appearance.scheduledSettingsAPIEndpoint'
  | 'appearance.scheduledSettingsHomeAssistantBaseURL'
  | 'appearance.scheduledSettingsHomeAssistantEntity'
  | 'appearance.scheduledSettingsHomeAssistantToken'
  | 'appearance.scheduledSettingsSaveToken'
  | 'appearance.scheduledSettingsTestSensor'
  | 'appearance.scheduledSettingsTokenSaved'
  | 'appearance.scheduledSettingsSensorState'
  | 'appearance.scheduledSettingsValue'
  | 'appearance.scheduledSettingsValueDescription'
  | 'appearance.scheduledSettingsRemove'
  | 'appearance.scheduledSettingsSourceFailure'
  | 'appearance.scheduledSettingsSourceInvalid'
  | 'appearance.scheduledSettingsLanguage'
  | 'appearance.scheduledSettingsLanguageEnglish'
  | 'appearance.scheduledSettingsLanguageCantonese'
  | 'appearance.scheduledSettingsLanguageBilingual'
  | 'appearance.scheduledSettingsTheme'
  | 'appearance.scheduledSettingsAppearance'
  | 'appearance.scheduledSettingsOn'
  | 'appearance.scheduledSettingsOff'
  | 'appearance.scheduledSettingsDaySunday'
  | 'appearance.scheduledSettingsDayMonday'
  | 'appearance.scheduledSettingsDayTuesday'
  | 'appearance.scheduledSettingsDayWednesday'
  | 'appearance.scheduledSettingsDayThursday'
  | 'appearance.scheduledSettingsDayFriday'
  | 'appearance.scheduledSettingsDaySaturday'
  | 'appearance.scheduledSettingsThemeSystem'
  | 'appearance.scheduledSettingsThemeLight'
  | 'appearance.scheduledSettingsThemeDark'
  | 'appearance.scheduledSettingsNoChange'
  | 'appearance.scheduledSettingsAPIHelp'
  | 'appearance.scheduledSettingsHomeAssistantHelp'
  | 'appearance.scheduledSettingsAccentPalette'
  | 'appearance.scheduledSettingsUpdateProgressPalette'
  | 'appearance.scheduledSettingsSurfacePalette'
  | 'appearance.scheduledSettingsElevation'
  | 'appearance.scheduledSettingsUIFont'
  | 'appearance.scheduledSettingsMonospaceFont'
  | 'appearance.scheduledSettingsMotion'
  | 'appearance.scheduledSettingsToolbarLabels'
  | 'appearance.scheduledSettingsToolbarDensity'
  | 'appearance.scheduledSettingsRepositoryListDensity'
  | 'appearance.scheduledSettingsTabDensity'
  | 'appearance.scheduledSettingsTabWidth'
  | 'appearance.scheduledSettingsTabCloseButtons'
  | 'appearance.scheduledSettingsSubmoduleBackStyle'
  | 'appearance.scheduledSettingsSubmoduleBackLabel'
  | 'appearance.scheduledSettingsHighlightFeatures'
  | 'appearance.submoduleBackStyle'
  | 'appearance.submoduleBackLabel'
  | 'appearance.toolbarEditorTitle'
  | 'appearance.toolbarEditorDescription'
  | 'appearance.repositoryToolbarEditorTitle'
  | 'appearance.repositoryToolbarEditorDescription'
  | 'appearance.toolbarTypographyHeading'
  | 'appearance.toolbarTypographyProfile'
  | 'appearance.toolbarTypographyRepositoryInherited'
  | 'appearance.toolbarTypographyRepositoryOverride'
  | 'appearance.toolbarTypographyThemeDefaults'
  | 'appearance.toolbarTypographyInheritProfile'
  | 'appearance.toolbarTypographyPreview'
  | 'appearance.toolbarTypographyPreviewTitle'
  | 'appearance.toolbarTypographyPreviewDescription'
  | 'appearance.toolbarFontStyle'
  | 'appearance.toolbarBold'
  | 'appearance.toolbarItalic'
  | 'appearance.toolbarUnderline'
  | 'appearance.toolbarStrikethrough'
  | 'appearance.toolbarAlignment'
  | 'appearance.toolbarAlignLeft'
  | 'appearance.toolbarAlignCenter'
  | 'appearance.toolbarAlignRight'
  | 'appearance.toolbarFont'
  | 'appearance.toolbarThemeFont'
  | 'appearance.toolbarInheritFont'
  | 'appearance.toolbarSize'
  | 'appearance.toolbarThemeSize'
  | 'appearance.toolbarInheritSize'
  | 'appearance.toolbarLetterCase'
  | 'appearance.toolbarNormalCase'
  | 'appearance.toolbarUppercase'
  | 'appearance.toolbarLowercase'
  | 'appearance.toolbarCapitalize'
  | 'appearance.toolbarSmallCaps'
  | 'appearance.toolbarSpacing'
  | 'appearance.toolbarThemeSpacing'
  | 'appearance.toolbarInheritSpacing'
  | 'appearance.toolbarTextEffect'
  | 'appearance.toolbarNoEffect'
  | 'appearance.toolbarSoftShadow'
  | 'appearance.toolbarStrongShadow'
  | 'appearance.toolbarTextColor'
  | 'appearance.toolbarThemeColor'
  | 'appearance.toolbarInheritColor'
  | 'appearance.toolbarCustomColor'
  | 'tabs.appearanceLoading'
  | 'tabs.settingsCommitSaved'
  | 'tabs.settingsCommitCommitted'
  | 'tabs.settingsCommitTitle'
  | 'tabs.settingsHistory'
  | 'tabs.closedHistory'
  | 'tabs.closedHistoryTitle'
  | 'tabs.closedHistoryDescription'
  | 'tabs.closedHistoryEmpty'
  | 'tabs.closedHistoryNoMatches'
  | 'tabs.closedHistorySearch'
  | 'tabs.closedHistorySearchPlaceholder'
  | 'tabs.closedHistorySearchTarget'
  | 'tabs.closedHistoryForget'
  | 'tabs.closedHistoryClear'
  | 'tabs.closedHistoryCountOne'
  | 'tabs.closedHistoryCountMany'
  | 'tabs.undoSettingsChange'
  | 'tabs.redoSettingsChange'
  | 'tabs.settingsChangeUndone'
  | 'tabs.settingsChangeRedone'
  | 'tabs.groupAddNew'
  | 'tabs.groupMoveAction'
  | 'tabs.groupMoveTo'
  | 'tabs.groupRemoveFrom'
  | 'tabs.groupMoveDialogTitle'
  | 'tabs.groupMoveDialogIntro'
  | 'tabs.groupMoveSearchLabel'
  | 'tabs.groupMoveSearchPlaceholder'
  | 'tabs.groupMoveSearchTarget'
  | 'tabs.groupMoveListLabel'
  | 'tabs.groupMoveRemoveCurrent'
  | 'tabs.groupMoveDestinationLabel'
  | 'tabs.groupMoveEmpty'
  | 'tabs.groupMoveNoMatches'
  | 'tabs.groupMoveCountOne'
  | 'tabs.groupMoveCountMany'
  | 'tabs.groupMoveFilterCount'
  | 'tabs.groupMoveRegexError'
  | 'tabs.groupExpand'
  | 'tabs.groupCollapse'
  | 'tabs.groupDelete'
  | 'tabs.groupDialogTitle'
  | 'tabs.groupDialogIntro'
  | 'tabs.groupNameLabel'
  | 'tabs.groupColorLabel'
  | 'tabs.groupColorChoice'
  | 'tabs.groupColorBlue'
  | 'tabs.groupColorGreen'
  | 'tabs.groupColorYellow'
  | 'tabs.groupColorRed'
  | 'tabs.groupColorPurple'
  | 'tabs.groupColorGrey'
  | 'tabs.groupCreateAction'
  | 'tabs.groupCancelAction'
  | 'tabs.groupChipExpandedOne'
  | 'tabs.groupChipExpandedMany'
  | 'tabs.groupChipCollapsedOne'
  | 'tabs.groupChipCollapsedMany'
  | 'tabs.groupMemberLabel'
  | 'tabs.groupCreatedStatus'
  | 'tabs.groupMovedStatus'
  | 'tabs.groupRemovedStatus'
  | 'tabs.groupExpandedStatus'
  | 'tabs.groupCollapsedStatus'
  | 'tabs.groupDeletedStatus'
  | 'tabs.groupActionFailed'
  | 'tabs.groupEdit'
  | 'tabs.groupEditTitle'
  | 'tabs.groupEditIntroOne'
  | 'tabs.groupEditIntroMany'
  | 'tabs.groupSaveAction'
  | 'tabs.groupUpdatedStatus'
  | 'tabs.groupMembersButtonOne'
  | 'tabs.groupMembersButtonMany'
  | 'tabs.groupMembersTitle'
  | 'tabs.groupMembersDescription'
  | 'tabs.groupMembersListLabel'
  | 'tabs.groupMembersEmpty'
  | 'tabs.groupMembersCountOne'
  | 'tabs.groupMembersCountMany'
  | 'tabs.groupMembersKeepsTabs'
  | 'tabs.groupMembersShow'
  | 'tabs.tabPinnedSuffix'
  | 'tabs.tabFavoriteSuffix'
  | 'tabs.overflowButton'
  | 'tabs.overflowButtonLabelOne'
  | 'tabs.overflowButtonLabelMany'
  | 'tabs.overflowTitle'
  | 'tabs.searchTitle'
  | 'tabs.searchDescription'
  | 'tabs.searchLabel'
  | 'tabs.searchTarget'
  | 'tabs.searchEmpty'
  | 'tabs.searchListLabel'
  | 'tabs.searchCountOne'
  | 'tabs.searchCountMany'
  | 'tabs.close.matchStrategyRegex'
  | 'tabs.close.matchStrategyFuzzy'
  | 'tabs.close.matchStrategySubstring'
  | 'tabs.close.matchCaseSensitive'
  | 'tabs.close.matchCaseInsensitive'
  | 'tabs.close.matchDescription'
  | 'tabs.close.saveError'
  | 'tabs.close.noMatches'
  | 'tabs.close.cancel'
  | 'tabs.close.closing'
  | 'tabs.close.count'
  | 'tabs.close.action'
  | 'tabs.close.closeTabs'
  | 'tabs.close.openTabsTarget'
  | 'tabs.stripLabel'
  | 'tabs.openRepositoryNewTab'
  | 'tabs.closeContaining.title'
  | 'tabs.closeContaining.placeholder'
  | 'tabs.closeContaining.previewPrompt'
  | 'tabs.closeContaining.matchSummary'
  | 'tabs.closeExcept.title'
  | 'tabs.closeExcept.fieldLabel'
  | 'tabs.closeExcept.placeholder'
  | 'tabs.closeExcept.previewPrompt'
  | 'tabs.closeExcept.allStayOpenOne'
  | 'tabs.closeExcept.allStayOpenMany'
  | 'tabs.closeExcept.summary'
  | 'tabs.closeExcept.summaryWithPinned'
  | 'tabs.closeExcept.previewAria'
  | 'tabs.closeExcept.dispositionPinned'
  | 'tabs.closeExcept.dispositionClose'
  | 'tabs.closeExcept.dispositionKeep'
  | 'tabs.closeExcept.remainingOne'
  | 'tabs.closeExcept.remainingMany'
  | 'tabs.arrange.initialAnnouncement'
  | 'tabs.arrange.saveError'
  | 'tabs.arrange.movedFirst'
  | 'tabs.arrange.movedLeft'
  | 'tabs.arrange.movedRight'
  | 'tabs.arrange.movedLast'
  | 'tabs.arrange.pinned'
  | 'tabs.arrange.unpinned'
  | 'tabs.arrange.favoriteAdded'
  | 'tabs.arrange.favoriteRemoved'
  | 'tabs.arrange.sortedLabelAscending'
  | 'tabs.arrange.sortedLabelDescending'
  | 'tabs.arrange.sortedOpenedNewest'
  | 'tabs.arrange.sortedOpenedOldest'
  | 'tabs.arrange.sortedAttentionFirst'
  | 'tabs.arrange.sortedCleanFirst'
  | 'tabs.arrange.sortedFavoritesFirst'
  | 'tabs.arrange.sortedFavoritesLast'
  | 'tabs.arrange.title'
  | 'tabs.arrange.description'
  | 'tabs.arrange.filterLabel'
  | 'tabs.arrange.filterPlaceholder'
  | 'tabs.arrange.filterTarget'
  | 'tabs.arrange.filterCountOne'
  | 'tabs.arrange.filterCountMany'
  | 'tabs.arrange.manualOrder'
  | 'tabs.arrange.noMatches'
  | 'tabs.arrange.sortOnce'
  | 'tabs.arrange.sortHint'
  | 'tabs.arrange.pinnedChip'
  | 'tabs.arrange.favoriteChip'
  | 'tabs.arrange.pin'
  | 'tabs.arrange.unpin'
  | 'tabs.arrange.star'
  | 'tabs.arrange.unstar'
  | 'tabs.arrange.pinAria'
  | 'tabs.arrange.unpinAria'
  | 'tabs.arrange.favoriteAria'
  | 'tabs.arrange.unfavoriteAria'
  | 'tabs.arrange.moveFirstAria'
  | 'tabs.arrange.moveLeftAria'
  | 'tabs.arrange.moveRightAria'
  | 'tabs.arrange.moveLastAria'
  | 'tabs.arrange.first'
  | 'tabs.arrange.left'
  | 'tabs.arrange.right'
  | 'tabs.arrange.last'
  | 'tabs.arrange.sortLabelAscending'
  | 'tabs.arrange.sortLabelDescending'
  | 'tabs.arrange.sortOpenedNewest'
  | 'tabs.arrange.sortOpenedOldest'
  | 'tabs.arrange.sortAttentionFirst'
  | 'tabs.arrange.sortCleanFirst'
  | 'tabs.arrange.sortFavoritesFirst'
  | 'tabs.arrange.sortFavoritesLast'
  | 'tabs.arrange.done'
  | 'tabs.style.alignLeftAria'
  | 'tabs.style.alignCenterAria'
  | 'tabs.style.alignRightAria'
  | 'tabs.style.font'
  | 'tabs.style.searchFonts'
  | 'tabs.style.fontsTarget'
  | 'tabs.style.noMatchingFonts'
  | 'tabs.style.textColorSwatchAria'
  | 'tabs.style.highlightColorSwatchAria'
  | 'tabs.style.highlight'
  | 'tabs.style.textColor'
  | 'tabs.style.useDefaultBackgroundAria'
  | 'tabs.style.useDefaultTextAria'
  | 'tabs.style.noHighlight'
  | 'tabs.style.defaultColor'
  | 'tabs.style.custom'
  | 'tabs.style.customHighlightAria'
  | 'tabs.style.customTextColorAria'
  | 'tabs.style.recent'
  | 'tabs.style.defaultPreviewTitle'
  | 'tabs.style.previewAria'
  | 'tabs.style.preview'
  | 'tabs.style.title'
  | 'tabs.style.historyAria'
  | 'tabs.style.history'
  | 'tabs.style.clearAria'
  | 'tabs.style.clear'
  | 'tabs.style.bold'
  | 'tabs.style.italic'
  | 'tabs.style.underline'
  | 'tabs.style.strikethrough'
  | 'tabs.style.size'
  | 'tabs.style.letterCase'
  | 'tabs.style.normalCase'
  | 'tabs.style.uppercase'
  | 'tabs.style.lowercase'
  | 'tabs.style.capitalizeWords'
  | 'tabs.style.smallCaps'
  | 'tabs.style.spacing'
  | 'tabs.style.textEffect'
  | 'tabs.style.effectNone'
  | 'tabs.style.effectNoneAria'
  | 'tabs.style.effectSoft'
  | 'tabs.style.effectSoftAria'
  | 'tabs.style.effectStrong'
  | 'tabs.style.effectStrongAria'
  | 'commitPushAll.defaultMessage'
  | 'commitPushAll.title'
  | 'commitPushAll.intro'
  | 'commitPushAll.messageLabel'
  | 'commitPushAll.messagePlaceholder'
  | 'commitPushAll.filterPlaceholder'
  | 'commitPushAll.filterAria'
  | 'commitPushAll.filterTarget'
  | 'commitPushAll.selectionCount'
  | 'commitPushAll.selectShown'
  | 'commitPushAll.clearShown'
  | 'commitPushAll.repositoriesGroupAria'
  | 'commitPushAll.noMatches'
  | 'commitPushAll.empty'
  | 'commitPushAll.commitAll'
  | 'commitPushAll.commitCount'
  | 'commitPushAll.cancel'
  | 'commitPushAll.done'
  | 'commitPushAll.progressAria'
  | 'commitPushAll.overlineStopped'
  | 'commitPushAll.overlineComplete'
  | 'commitPushAll.overlineLive'
  | 'commitPushAll.headingFailed'
  | 'commitPushAll.headingComplete'
  | 'commitPushAll.headingRunning'
  | 'commitPushAll.repositoriesComplete'
  | 'commitPushAll.progressBarAria'
  | 'commitPushAll.metricComplete'
  | 'commitPushAll.metricActive'
  | 'commitPushAll.metricWaiting'
  | 'commitPushAll.allFinal'
  | 'commitPushAll.nowWorking'
  | 'commitPushAll.waitingNext'
  | 'commitPushAll.concurrencyHint'
  | 'commitPushAll.summary'
  | 'commitPushAll.noRepositoriesRun'
  | 'commitPushAll.resultsRegionAria'
  | 'commitPushAll.columnRepository'
  | 'commitPushAll.columnStatus'
  | 'commitPushAll.columnResult'
  | 'commitPushAll.runInBackground'
  | 'commitPushAll.status.waiting'
  | 'commitPushAll.status.pulling'
  | 'commitPushAll.status.committing'
  | 'commitPushAll.status.pushing'
  | 'commitPushAll.status.done'
  | 'commitPushAll.status.skipped'
  | 'commitPushAll.status.failed'
  | 'lazyView.loading.plain'
  | 'lazyView.loading.light'
  | 'lazyView.loading.playful'
  | 'lazyView.loading.maximum'
  | 'lazyView.failedTitle'
  | 'lazyView.failedBody.plain'
  | 'lazyView.failedBody.light'
  | 'lazyView.failedBody.playful'
  | 'lazyView.failedBody.maximum'
  | 'lazyView.failedDetail'
  | 'lazyView.retry'
  | 'lazyView.notificationTitle'
  | 'lazyView.notificationBody'
  | 'lazyView.section.actions'
  | 'lazyView.section.releases'
  | 'lazyView.section.issues'
  | 'lazyView.section.triage'
  | 'lazyView.section.tools'
  | 'tabs.overflowDescription.plain'
  | 'tabs.overflowDescription.light'
  | 'tabs.overflowDescription.playful'
  | 'tabs.overflowDescription.maximum'
  | 'tabs.overflowListLabel'
  | 'tabs.overflowEmpty'
  | 'tabs.overflowActiveSuffix'
  | 'tabs.overflowActiveChip'
  | 'tabs.overflowPinnedChip'
  | 'tabs.overflowFavoriteChip'
  | 'tabs.overflowCountOne'
  | 'tabs.overflowCountMany'
  | 'tabs.overflowSearchLabel'
  | 'tabs.overflowSearchPlaceholder'
  | 'tabs.overflowSearchTarget'
  | 'tabs.overflowNoMatches'
  | 'tabs.overflowFilterCountOne'
  | 'tabs.overflowFilterCountMany'
  | 'tabs.overflowRegexError'
  | 'tabs.overflowCustomize'
  | 'tabs.overflowCustomizeLabel'
  | 'tabs.overflowActionsHint'
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
  | 'submodule.temporaryOpenDescription'
  | 'submodule.diffTemporaryViewerTitle'
  | 'submodule.diffTemporaryViewerDescription'
  | 'submodule.diffTemporaryViewerAction'
  | 'submodule.closeTemporaryViewer'
  | 'submodule.appearanceHeading'
  | 'submodule.appearanceDescription'
  | 'submodule.appearancePreview'
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
  | 'submodule.summaryNeedsRepair'
  | 'submodule.statusUninitialized'
  | 'submodule.statusUpToDate'
  | 'submodule.statusOutOfDate'
  | 'submodule.statusConflicted'
  | 'submodule.statusMissingGitlink'
  | 'submodule.statusMissingDeclaration'
  | 'submodule.missingGitlinkTooltip'
  | 'submodule.missingDeclarationTooltip'
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
  | 'submodule.addCreateRemoteTab'
  | 'submodule.addCreateAndAddAction'
  | 'submodule.addCreateRemoteSignInGuidance'
  | 'submodule.addRemoteCreatedHeading'
  | 'submodule.addRemoteCreatedRetryHelp'
  | 'submodule.addRemoteOwnerLabel'
  | 'submodule.addRemoteNameLabel'
  | 'submodule.addRemoteDescriptionLabel'
  | 'submodule.addRemotePrivateLabel'
  | 'submodule.addRemoteNameHelp'
  | 'submodule.addRemoteDescriptionHelp'
  | 'submodule.addRemoteInitializeHelp'
  | 'submodule.addRemoteAccountRequiredError'
  | 'submodule.addRemoteOwnerUnavailableError'
  | 'submodule.addRemoteNameRequiredError'
  | 'submodule.addRemoteNameLengthError'
  | 'submodule.addRemoteNameCharactersError'
  | 'submodule.addRemoteDescriptionLengthError'
  | 'submodule.addRemoteDescriptionCharactersError'
  | 'submodule.addCreatingRemoteProgress'
  | 'submodule.addRemoteCreatedProgress'
  | 'submodule.addRemoteCreatedButAddFailed'
  | 'submodule.addRemoteCreateFailed'
  | 'submodule.addRemoteCreateCancelledUncertain'
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
  | 'submodule.addLoadBranchesAction'
  | 'submodule.addLoadingBranches'
  | 'submodule.addBranchListFailed'
  | 'submodule.addBranchFilterLabel'
  | 'submodule.addBranchPickerLabel'
  | 'submodule.addBranchDefaultOption'
  | 'submodule.addBranchCustomOption'
  | 'submodule.addBranchListEmpty'
  | 'submodule.addBranchListTruncated'
  | 'submodule.addBranchFilterNoMatches'
  | 'submodule.addBranchFilterInvalidPattern'
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
  | 'fileList.viewMode'
  | 'fileList.flat'
  | 'fileList.tree'
  | 'fileList.directory'
  | 'diff.context.legend'
  | 'diff.context.autoExpand'
  | 'diff.context.autoExpandHelp'
  | 'diff.context.stepLegend'
  | 'diff.context.lines'
  | 'history.scope'
  | 'history.scope.currentBranch'
  | 'history.scope.allRefs'
  | 'history.viewMode'
  | 'history.viewMode.list'
  | 'history.viewMode.graph'
  | 'history.graphPageTitle'
  | 'diff.structured.viewSwitcher'
  | 'diff.structured.code'
  | 'diff.structured.table'
  | 'diff.structured.csvCaption'
  | 'diff.structured.tsvCaption'
  | 'diff.structured.rowNumber'
  | 'diff.structured.column'
  | 'diff.structured.rowAdded'
  | 'diff.structured.rowRemoved'
  | 'diff.structured.rowChanged'
  | 'diff.structured.cellAdded'
  | 'diff.structured.cellRemoved'
  | 'diff.structured.cellChanged'
  | 'diff.structured.selectionHint'
  | 'prCreate.title'
  | 'prCreate.reviewTitle'
  | 'prCreate.successTitle'
  | 'prCreate.targetRepository'
  | 'prCreate.account'
  | 'prCreate.baseBranch'
  | 'prCreate.headBranch'
  | 'prCreate.currentBranch'
  | 'prCreate.template'
  | 'prCreate.noTemplate'
  | 'prCreate.loadingOptions'
  | 'prCreate.optionalWarning'
  | 'prCreate.titleField'
  | 'prCreate.descriptionField'
  | 'prCreate.charactersRemaining'
  | 'prCreate.markdownSupported'
  | 'prCreate.draftAction'
  | 'prCreate.reviewers'
  | 'prCreate.assignees'
  | 'prCreate.labels'
  | 'prCreate.milestone'
  | 'prCreate.none'
  | 'prCreate.choiceUnavailable'
  | 'prCreate.choiceCapped'
  | 'prCreate.cancel'
  | 'prCreate.close'
  | 'prCreate.reviewAction'
  | 'prCreate.backToEdit'
  | 'prCreate.createAction'
  | 'prCreate.createDraftAction'
  | 'prCreate.creating'
  | 'prCreate.waitingFor'
  | 'prCreate.cancelRequest'
  | 'prCreate.canceling'
  | 'prCreate.readyStatus'
  | 'prCreate.draftStatus'
  | 'prCreate.description'
  | 'prCreate.noDescription'
  | 'prCreate.metadataSummary'
  | 'prCreate.confirmation'
  | 'prCreate.created'
  | 'prCreate.draftCreated'
  | 'prCreate.done'
  | 'prCreate.openOnGitHub'
  | 'prCreate.partialSuccess'
  | 'prCreate.templateNotice'
  | 'mrEditor.createTitle'
  | 'mrEditor.editTitle'
  | 'mrEditor.description'
  | 'mrEditor.project'
  | 'mrEditor.boundAccount'
  | 'mrEditor.routeAria'
  | 'mrEditor.formAria'
  | 'mrEditor.sourceBranch'
  | 'mrEditor.sourceEditLocked'
  | 'mrEditor.targetBranch'
  | 'mrEditor.titleField'
  | 'mrEditor.descriptionField'
  | 'mrEditor.charactersRemaining'
  | 'mrEditor.markdownSupported'
  | 'mrEditor.draftAction'
  | 'mrEditor.reviewers'
  | 'mrEditor.assignees'
  | 'mrEditor.reviewersUnavailable'
  | 'mrEditor.assigneesUnavailable'
  | 'mrEditor.noneAvailable'
  | 'mrEditor.keyboardHint'
  | 'mrEditor.cancel'
  | 'mrEditor.refresh'
  | 'mrEditor.createAction'
  | 'mrEditor.saveAction'
  | 'mrEditor.creating'
  | 'mrEditor.saving'
  | 'mrEditor.created'
  | 'mrEditor.saved'
  | 'mrEditor.canceled'
  | 'mrEditor.loading'
  | 'mrEditor.emptyBranches'
  | 'mrEditor.emptySource'
  | 'mrEditor.emptyTarget'
  | 'mrEditor.emptyDescription'
  | 'mrEditor.errorTitle'
  | 'mrEditor.errorAuthentication'
  | 'mrEditor.errorPermission'
  | 'mrEditor.errorNetwork'
  | 'mrEditor.errorUnsupported'
  | 'mrEditor.errorInvalidResponse'
  | 'mrEditor.errorUnknown'
  | 'mrEditor.staleTitle'
  | 'mrEditor.staleDescription'
  | 'mrEditor.partialTitle'
  | 'mrEditor.partialUnavailable'
  | 'mrEditor.partialCapped'
  | 'mrEditor.readinessLabel'
  | 'mrEditor.readinessChecking'
  | 'mrEditor.readinessReady'
  | 'mrEditor.readinessBlocked'
  | 'mrEditor.readinessUnknown'
  | 'mrEditor.blockerStatus'
  | 'mrEditor.blockerCiMustPass'
  | 'mrEditor.blockerCiRunning'
  | 'mrEditor.blockerConflict'
  | 'mrEditor.blockerDiscussions'
  | 'mrEditor.blockerDraft'
  | 'mrEditor.blockerExternalChecks'
  | 'mrEditor.blockerJira'
  | 'mrEditor.blockerRebase'
  | 'mrEditor.blockerApproval'
  | 'mrEditor.blockerNotOpen'
  | 'mrEditor.blockerPolicy'
  | 'mrEditor.blockerCommitsStatus'
  | 'mrEditor.blockerRequestBlocked'
  | 'mrEditor.blockerMergeTime'
  | 'mrEditor.blockerRequestedChanges'
  | 'mrEditor.blockerSecurityPipeline'
  | 'mrEditor.blockerSecurityViolation'
  | 'mrEditor.blockerStatusChecks'
  | 'mrEditor.blockerLockedPaths'
  | 'mrEditor.blockerLockedLfs'
  | 'mrEditor.blockerTitleRegex'
  | 'mrEditor.validationTitle'
  | 'mrEditor.validationSource'
  | 'mrEditor.validationTarget'
  | 'mrEditor.validationBranchesDiffer'
  | 'mrEditor.validationTitleRequired'
  | 'mrEditor.validationTitleLength'
  | 'mrEditor.validationTitleInvalid'
  | 'mrEditor.validationBodyLength'
  | 'mrEditor.validationBodyInvalid'
  | 'mrEditor.validationReviewerLimit'
  | 'mrEditor.validationAssigneeLimit'
  | 'mrEditor.validationReviewerDuplicate'
  | 'mrEditor.validationAssigneeDuplicate'
  | 'mrEditor.validationReviewerInvalid'
  | 'mrEditor.validationAssigneeInvalid'
  | 'mrEditor.submitRejected'
  | 'mrEditor.submitNetwork'
  | 'mrEditor.submitStale'
  | 'mrEditor.submitInvalidResponse'
  | 'mrEditor.submitUnknown'
  | 'mrLifecycle.title'
  | 'mrLifecycle.loading'
  | 'mrLifecycle.empty'
  | 'mrLifecycle.emptyDescription'
  | 'mrLifecycle.unavailable'
  | 'mrLifecycle.unavailableDescription'
  | 'mrLifecycle.stale'
  | 'mrLifecycle.staleDescription'
  | 'mrLifecycle.partial'
  | 'mrLifecycle.summaryAria'
  | 'mrLifecycle.state'
  | 'mrLifecycle.stateOpened'
  | 'mrLifecycle.stateClosed'
  | 'mrLifecycle.stateMerged'
  | 'mrLifecycle.stateLocked'
  | 'mrLifecycle.draft'
  | 'mrLifecycle.author'
  | 'mrLifecycle.reviewers'
  | 'mrLifecycle.assignees'
  | 'mrLifecycle.none'
  | 'mrLifecycle.approval'
  | 'mrLifecycle.approvalUnavailable'
  | 'mrLifecycle.approvalComplete'
  | 'mrLifecycle.approvalProgress'
  | 'mrLifecycle.approvedBy'
  | 'mrLifecycle.pipeline'
  | 'mrLifecycle.pipelineUnavailable'
  | 'mrLifecycle.pipelineNone'
  | 'mrLifecycle.pipelinePending'
  | 'mrLifecycle.pipelineRunning'
  | 'mrLifecycle.pipelinePassed'
  | 'mrLifecycle.pipelineFailed'
  | 'mrLifecycle.pipelineCanceled'
  | 'mrLifecycle.pipelineSkipped'
  | 'mrLifecycle.pipelineUnknown'
  | 'mrLifecycle.readiness'
  | 'mrLifecycle.updated'
  | 'mrLifecycle.timeUnavailable'
  | 'mrLifecycle.close'
  | 'mrLifecycle.reopen'
  | 'mrLifecycle.approve'
  | 'mrLifecycle.unapprove'
  | 'mrLifecycle.refresh'
  | 'mrLifecycle.openCanonical'
  | 'mrLifecycle.operationRunning'
  | 'mrLifecycle.operationSuccess'
  | 'mrLifecycle.operationCanceled'
  | 'mrLifecycle.operationError'
  | 'forkCheckout.action'
  | 'forkCheckout.title'
  | 'forkCheckout.description'
  | 'forkCheckout.close'
  | 'forkCheckout.loadingForks'
  | 'forkCheckout.forkLabel'
  | 'forkCheckout.chooseFork'
  | 'forkCheckout.filterForks'
  | 'forkCheckout.loadingBranches'
  | 'forkCheckout.branchLabel'
  | 'forkCheckout.chooseBranch'
  | 'forkCheckout.filterBranches'
  | 'forkCheckout.localBranchLabel'
  | 'forkCheckout.review'
  | 'forkCheckout.reviewing'
  | 'forkCheckout.confirmHeading'
  | 'forkCheckout.source'
  | 'forkCheckout.head'
  | 'forkCheckout.local'
  | 'forkCheckout.remote'
  | 'forkCheckout.remoteNew'
  | 'forkCheckout.remoteReuse'
  | 'forkCheckout.remoteRef'
  | 'forkCheckout.staleGuard'
  | 'forkCheckout.confirm'
  | 'forkCheckout.checkingOut'
  | 'forkCheckout.success'
  | 'forkCheckout.limitNotice'
  | 'forkCheckout.rejectedNotice'
  | 'forkCheckout.emptyForks'
  | 'forkCheckout.emptyBranches'
  | 'forkCheckout.useSuggestion'
  | 'forkCheckout.errorUnsupported'
  | 'forkCheckout.errorSignIn'
  | 'forkCheckout.errorMalformed'
  | 'forkCheckout.errorStale'
  | 'forkCheckout.errorContext'
  | 'forkCheckout.errorInvalid'
  | 'forkCheckout.errorCollision'
  | 'forkCheckout.errorRemoteCollision'
  | 'forkCheckout.errorNetwork'
  | 'forkCheckout.errorMoved'
  | 'forkCheckout.errorGit'
  | 'forkCheckout.errorUnknown'
  | 'projects.title'
  | 'projects.description'
  | 'projects.refresh'
  | 'projects.sourceLive'
  | 'projects.sourceCached'
  | 'projects.sourceUnavailable'
  | 'projects.updatedAt'
  | 'projects.stale'
  | 'projects.refreshing'
  | 'projects.readOnly'
  | 'projects.errorSignedOut'
  | 'projects.errorAuthentication'
  | 'projects.errorPermission'
  | 'projects.errorRateLimit'
  | 'projects.errorNotFound'
  | 'projects.errorUnsupported'
  | 'projects.errorService'
  | 'projects.errorNetwork'
  | 'projects.errorInvalidResponse'
  | 'projects.cacheRecovery'
  | 'projects.partialTitle'
  | 'projects.partialProjects'
  | 'projects.partialItems'
  | 'projects.partialViews'
  | 'projects.partialClassic'
  | 'projects.listAria'
  | 'projects.itemCount'
  | 'projects.stateOpen'
  | 'projects.stateClosed'
  | 'projects.openOnGitHub'
  | 'projects.viewsAria'
  | 'projects.noItems'
  | 'projects.emptyTitle'
  | 'projects.emptyDescription'
  | 'projects.kindIssue'
  | 'projects.kindPullRequest'
  | 'projects.kindDraftIssue'
  | 'projects.kindNote'
  | 'projects.kindUnavailable'
  | 'projects.loading'
  | 'reviewRequest.manage'
  | 'reviewRequest.openInBrowser'
  | 'reviewRequest.reviewRequested'
  | 'reviewRequest.statusDraft'
  | 'reviewRequest.statusOpen'
  | 'reviewRequest.noDescription'
  | 'reviewRequest.markdownBodyAriaLabel'
  | 'reviewRequest.quickViewAriaLabel'
  | 'globalIgnore.title'
  | 'globalIgnore.description'
  | 'globalIgnore.pathLabel'
  | 'globalIgnore.loading'
  | 'globalIgnore.configuredExisting'
  | 'globalIgnore.configuredNew'
  | 'globalIgnore.notConfigured'
  | 'globalIgnore.starterRules'
  | 'globalIgnore.addEditorFiles'
  | 'globalIgnore.addOSFiles'
  | 'globalIgnore.rulesAria'
  | 'globalIgnore.patternPlaceholder'
  | 'globalIgnore.reload'
  | 'globalIgnore.savingAction'
  | 'globalIgnore.saveAction'
  | 'globalIgnore.savingStatus'
  | 'globalIgnore.savedStatus'
  | 'globalIgnore.loadError'
  | 'globalIgnore.saveError'
  | 'ignoreFilesContaining.title'
  | 'ignoreFilesContaining.description'
  | 'ignoreFilesContaining.patternLabel'
  | 'ignoreFilesContaining.builderLabel'
  | 'ignoreFilesContaining.preview'
  | 'ignoreFilesContaining.invalidPattern'
  | 'ignoreFilesContaining.noMatches'
  | 'ignoreFilesContaining.confirm'
  | 'customGit.title'
  | 'customGit.description'
  | 'customGit.savedPreset'
  | 'customGit.newUnsavedPreset'
  | 'customGit.newAction'
  | 'customGit.name'
  | 'customGit.subcommand'
  | 'customGit.arguments'
  | 'customGit.warning'
  | 'customGit.saveAction'
  | 'customGit.reviewAction'
  | 'customGit.deleteAction'
  | 'customGit.cancelRun'
  | 'customGit.confirmRunTitle'
  | 'customGit.confirmRunWarning'
  | 'customGit.runReviewed'
  | 'customGit.goBack'
  | 'customGit.confirmDeleteTitle'
  | 'customGit.confirmDeleteDescription'
  | 'customGit.keepPreset'
  | 'customGit.outputAria'
  | 'customGit.initialStatus'
  | 'customGit.repositoryChangedStatus'
  | 'customGit.invalidNameError'
  | 'customGit.savedStatus'
  | 'customGit.saveError'
  | 'customGit.removedStatus'
  | 'customGit.reviewError'
  | 'customGit.runningStatus'
  | 'customGit.startError'
  | 'customGit.completedStatus'
  | 'customGit.cancelledStatus'
  | 'customGit.failedStatus'
  | 'customGit.exitCodeError'
  | 'editor.wslDisplayName'
  | 'editor.wslDistributionMismatch'
  | 'editor.wslInvalidDistributionPath'
  | 'editor.wslTranslateFailed'
  | 'editor.wslInvalidTranslatedPath'
  | 'editor.wslInvalidTarget'
  | 'networkRepository.unavailable'
  | 'networkRepository.reconnect'
  | 'networkRepository.unavailableAria'
  | 'networkRepository.mappedDrive'
  | 'networkRepository.wslShare'
  | 'networkRepository.uncShare'
  | 'networkRepository.detected'
  | 'pullBranchDeleted.title'
  | 'pullBranchDeleted.loading'
  | 'pullBranchDeleted.reviewAria'
  | 'pullBranchDeleted.intro.plain'
  | 'pullBranchDeleted.intro.light'
  | 'pullBranchDeleted.intro.playful'
  | 'pullBranchDeleted.intro.maximum'
  | 'pullBranchDeleted.offer'
  | 'pullBranchDeleted.blockedTitle'
  | 'pullBranchDeleted.blockedNoDefaultBranch'
  | 'pullBranchDeleted.blockedNoCurrentBranch'
  | 'pullBranchDeleted.blockedAlreadyOnDefaultBranch'
  | 'pullBranchDeleted.blockedDirtyWorktree'
  | 'pullBranchDeleted.blockedConflictedWorktree'
  | 'pullBranchDeleted.blockedOperationInProgress'
  | 'pullBranchDeleted.planFailed'
  | 'pullBranchDeleted.deleteLabel'
  | 'pullBranchDeleted.deleteHint'
  | 'pullBranchDeleted.deleteStrandsCommits'
  | 'pullBranchDeleted.deleteStrandsCommitsOne'
  | 'pullBranchDeleted.deleteStrandsUnknown'
  | 'pullBranchDeleted.deleteFullyMerged'
  | 'pullBranchDeleted.switchAction'
  | 'pullBranchDeleted.close'
  | 'pullBranchDeleted.startedTitle'
  | 'pullBranchDeleted.startedBody'
  | 'pullBranchDeleted.recoveredTitle'
  | 'pullBranchDeleted.recovered.plain'
  | 'pullBranchDeleted.recovered.light'
  | 'pullBranchDeleted.recovered.playful'
  | 'pullBranchDeleted.recovered.maximum'
  | 'pullBranchDeleted.retryFailedTitle'
  | 'pullBranchDeleted.retryFailedBody'
  | 'pullBranchDeleted.checkoutFailedTitle'
  | 'pullBranchDeleted.checkoutFailedBody'
  | 'pullBranchDeleted.deletionDone'
  | 'pullBranchDeleted.deletionSkipped'
  | 'pullPreview.title'
  | 'pullPreview.loading'
  | 'pullPreview.progressTitle'
  | 'pullPreview.progressRefresh'
  | 'pullPreview.reviewAria'
  | 'pullPreview.routeAria'
  | 'pullPreview.localBranch'
  | 'pullPreview.upstreamBranch'
  | 'pullPreview.strategy'
  | 'pullPreview.strategyFastForward'
  | 'pullPreview.strategyMerge'
  | 'pullPreview.strategyRebase'
  | 'pullPreview.strategyRebaseMerges'
  | 'pullPreview.strategyRebaseInteractive'
  | 'pullPreview.strategyFastForwardOnly'
  | 'pullPreview.ahead'
  | 'pullPreview.behind'
  | 'pullPreview.upToDateTitle'
  | 'pullPreview.upToDateBody'
  | 'pullPreview.incomingCommits'
  | 'pullPreview.moreCommits'
  | 'pullPreview.changedFiles'
  | 'pullPreview.noChangedFiles'
  | 'pullPreview.moreFiles'
  | 'pullPreview.fileNew'
  | 'pullPreview.fileModified'
  | 'pullPreview.fileDeleted'
  | 'pullPreview.fileRenamed'
  | 'pullPreview.fileCopied'
  | 'pullPreview.exactCommitNote'
  | 'pullPreview.conflictNote'
  | 'pullPreview.dirtyWarning'
  | 'pullPreview.conflictedWarning'
  | 'pullPreview.fastForwardOnlyWarning'
  | 'pullPreview.detached'
  | 'pullPreview.noUpstream'
  | 'pullPreview.invalidState'
  | 'pullPreview.errorTitle'
  | 'pullPreview.errorBusy'
  | 'pullPreview.errorRemoteUnavailable'
  | 'pullPreview.errorFetchFailed'
  | 'pullPreview.errorNoIncoming'
  | 'pullPreview.errorDirty'
  | 'pullPreview.errorConflicted'
  | 'pullPreview.errorInvalidConfig'
  | 'pullPreview.errorStale'
  | 'pullPreview.errorPullFailed'
  | 'pullPreview.errorUnexpected'
  | 'pullPreview.cancel'
  | 'pullPreview.refresh'
  | 'pullPreview.pull'
  | 'pullPreview.pulling'
  | 'batchSync.title'
  | 'batchSync.loadingChoices'
  | 'batchSync.reviewAria'
  | 'batchSync.operation'
  | 'batchSync.pullActive'
  | 'batchSync.fetchOnly'
  | 'batchSync.mergeCleanup'
  | 'batchSync.mergeCleanupReview'
  | 'batchSync.mergeCleanupConfirm'
  | 'batchSync.chooseRepositories'
  | 'batchSync.selectAll'
  | 'batchSync.selectNone'
  | 'batchSync.noRepositories'
  | 'batchSync.candidatesAria'
  | 'batchSync.reviewSingle'
  | 'batchSync.reviewMultiple'
  | 'batchSync.cancel'
  | 'batchSync.startPull'
  | 'batchSync.startFetch'
  | 'batchSync.startMergeCleanup'
  | 'batchSync.progressAria'
  | 'batchSync.stopped'
  | 'batchSync.pullComplete'
  | 'batchSync.fetchComplete'
  | 'batchSync.mergeCleanupComplete'
  | 'batchSync.liveProgress'
  | 'batchSync.couldNotFinish'
  | 'batchSync.allProcessed'
  | 'batchSync.pullingRepositories'
  | 'batchSync.fetchingRepositories'
  | 'batchSync.mergingCleanupRepositories'
  | 'batchSync.completedOf'
  | 'batchSync.synchronizedAria'
  | 'batchSync.metricComplete'
  | 'batchSync.metricActive'
  | 'batchSync.metricWaiting'
  | 'batchSync.finalResult'
  | 'batchSync.nowPulling'
  | 'batchSync.nowFetching'
  | 'batchSync.nowMergingCleanup'
  | 'batchSync.waitingNext'
  | 'batchSync.backgroundNote'
  | 'batchSync.summaryPull'
  | 'batchSync.summaryFetch'
  | 'batchSync.summaryMergeCleanup'
  | 'batchSync.noneToPull'
  | 'batchSync.noneToMergeCleanup'
  | 'batchSync.resultsAria'
  | 'batchSync.repository'
  | 'batchSync.status'
  | 'batchSync.detail'
  | 'batchSync.runBackground'
  | 'batchSync.done'
  | 'batchSync.statusWaiting'
  | 'batchSync.statusPulling'
  | 'batchSync.statusFetching'
  | 'batchSync.statusMergingCleanup'
  | 'batchSync.statusPulled'
  | 'batchSync.statusFetched'
  | 'batchSync.statusMergedCleaned'
  | 'batchSync.statusSkipped'
  | 'batchSync.statusFailed'
  | 'repositoryPicker.status'
  | 'repositoryPicker.filters'
  | 'repositoryPicker.emptyTitle'
  | 'repositoryPicker.emptyBody'
  | 'repositoryPicker.emptyClone'
  | 'repositoryPicker.emptyAdd'
  | 'repositoryPicker.emptyCreate'
  | 'repositoryPicker.filtersActive'
  | 'repositoryPicker.all'
  | 'repositoryPicker.clean'
  | 'repositoryPicker.changed'
  | 'repositoryPicker.ahead'
  | 'repositoryPicker.behind'
  | 'repositoryPicker.missingOrCloning'
  | 'repositoryPicker.hideHiddenAria'
  | 'repositoryPicker.showHiddenAria'
  | 'repositoryPicker.showingHidden'
  | 'repositoryPicker.showHidden'
  | 'repositoryPicker.hidden'
  | 'repositoryPicker.privateRepository'
  | 'repositoryPicker.itemHiddenAria'
  | 'repositoryPicker.hideMenu'
  | 'repositoryPicker.unhideMenu'
  | 'repositoryPicker.customizeNameMenu'
  | 'repositoryPicker.customizeLogoMenu'
  | 'repositoryPicker.groupRepositoryOne'
  | 'repositoryPicker.groupRepositoryMany'
  | 'repositoryPicker.groupCollapsed.plain'
  | 'repositoryPicker.groupCollapsed.light'
  | 'repositoryPicker.groupCollapsed.playful'
  | 'repositoryPicker.groupCollapsed.maximum'
  | 'repositoryPicker.groupExpanded.plain'
  | 'repositoryPicker.groupExpanded.light'
  | 'repositoryPicker.groupExpanded.playful'
  | 'repositoryPicker.groupExpanded.maximum'
  | 'repositoryPicker.autoExpandedOne.plain'
  | 'repositoryPicker.autoExpandedOne.light'
  | 'repositoryPicker.autoExpandedOne.playful'
  | 'repositoryPicker.autoExpandedOne.maximum'
  | 'repositoryPicker.autoExpandedMany.plain'
  | 'repositoryPicker.autoExpandedMany.light'
  | 'repositoryPicker.autoExpandedMany.playful'
  | 'repositoryPicker.autoExpandedMany.maximum'
  | 'repositorySync.commitOne'
  | 'repositorySync.commitMany'
  | 'repositorySync.unknown.plain'
  | 'repositorySync.unknown.light'
  | 'repositorySync.unknown.playful'
  | 'repositorySync.unknown.maximum'
  | 'repositorySync.inSync.plain'
  | 'repositorySync.inSync.light'
  | 'repositorySync.inSync.playful'
  | 'repositorySync.inSync.maximum'
  | 'repositorySync.ahead.plain'
  | 'repositorySync.ahead.light'
  | 'repositorySync.ahead.playful'
  | 'repositorySync.ahead.maximum'
  | 'repositorySync.behind.plain'
  | 'repositorySync.behind.light'
  | 'repositorySync.behind.playful'
  | 'repositorySync.behind.maximum'
  | 'repositorySync.diverged.plain'
  | 'repositorySync.diverged.light'
  | 'repositorySync.diverged.playful'
  | 'repositorySync.diverged.maximum'
  | 'repositorySync.noUpstream.plain'
  | 'repositorySync.noUpstream.light'
  | 'repositorySync.noUpstream.playful'
  | 'repositorySync.noUpstream.maximum'
  | 'repositorySync.detached.plain'
  | 'repositorySync.detached.light'
  | 'repositorySync.detached.playful'
  | 'repositorySync.detached.maximum'
  | 'repositorySync.empty.plain'
  | 'repositorySync.empty.light'
  | 'repositorySync.empty.playful'
  | 'repositorySync.empty.maximum'
  | 'repositorySync.cloning.plain'
  | 'repositorySync.cloning.light'
  | 'repositorySync.cloning.playful'
  | 'repositorySync.cloning.maximum'
  | 'repositorySync.missing.plain'
  | 'repositorySync.missing.light'
  | 'repositorySync.missing.playful'
  | 'repositorySync.missing.maximum'
  | 'repositoryActions.add'
  | 'repositoryActions.addAria'
  | 'repositoryActions.select'
  | 'repositoryActions.more'
  | 'repositoryActions.moreAria'
  | 'relativeTime.justNow'
  | 'repositoryActions.commitPushAll'
  | 'repositoryBulk.enterSelection'
  | 'repositoryBulk.enterSelectionAria'
  | 'repositoryBulk.barAria'
  | 'repositoryBulk.selectAllVisible'
  | 'repositoryBulk.selectAllVisibleAria'
  | 'repositoryBulk.selectedCount'
  | 'repositoryBulk.selectRepositoryAria'
  | 'repositoryBulk.clear'
  | 'repositoryBulk.clearAria'
  | 'repositoryBulk.fetch'
  | 'repositoryBulk.pull'
  | 'repositoryBulk.favorite'
  | 'repositoryBulk.unfavorite'
  | 'repositoryBulk.groupLabel'
  | 'repositoryBulk.groupPlaceholder'
  | 'repositoryBulk.assignGroup'
  | 'repositoryBulk.removeGroup'
  | 'repositoryBulk.remove'
  | 'repositoryBulk.noticeAria'
  | 'repositoryBulk.favoritedNotice'
  | 'repositoryBulk.unfavoritedNotice'
  | 'repositoryBulk.assignedNotice'
  | 'repositoryBulk.removedGroupNotice'
  | 'repositoryBulk.removedNotice'
  | 'repositoryBulk.progressAria'
  | 'repositoryBulk.fetchingTitle'
  | 'repositoryBulk.pullingTitle'
  | 'repositoryBulk.completedOf'
  | 'repositoryBulk.progressTrackAria'
  | 'repositoryBulk.cancel'
  | 'repositoryBulk.cancelAria'
  | 'repositoryBulk.cancelling'
  | 'repositoryBulk.dismiss'
  | 'repositoryBulk.summary'
  | 'repositoryBulk.resultsAria'
  | 'repositoryBulk.repository'
  | 'repositoryBulk.status'
  | 'repositoryBulk.detail'
  | 'repositoryBulk.statusQueued'
  | 'repositoryBulk.statusRunning'
  | 'repositoryBulk.statusDone'
  | 'repositoryBulk.statusFailed'
  | 'repositoryBulk.statusSkipped'
  | 'repositoryBulk.statusCancelled'
  | 'repositoryBulk.noDetail'
  | 'repositoryBulk.removeTitleSingular'
  | 'repositoryBulk.removeTitlePlural'
  | 'repositoryBulk.removeDescription'
  | 'repositoryBulk.removeListAria'
  | 'repositoryBulk.removeConfirm'
  | 'repositoryBulk.removeCancel'
  | 'repositoryGroups.newButton'
  | 'repositoryGroups.newButtonAria'
  | 'repositoryGroups.actionsLabel'
  | 'repositoryGroups.editMenu'
  | 'repositoryGroups.removeMenu'
  | 'repositoryGroups.createTitle'
  | 'repositoryGroups.editTitle'
  | 'repositoryGroups.createIntro'
  | 'repositoryGroups.editIntro'
  | 'repositoryGroups.nameLabel'
  | 'repositoryGroups.membersLabel'
  | 'repositoryGroups.searchLabel'
  | 'repositoryGroups.searchPlaceholder'
  | 'repositoryGroups.searchTarget'
  | 'repositoryGroups.regexError'
  | 'repositoryGroups.noMatches'
  | 'repositoryGroups.empty'
  | 'repositoryGroups.selectedCount'
  | 'repositoryGroups.createAction'
  | 'repositoryGroups.saveAction'
  | 'repositoryGroups.cancelAction'
  | 'repositoryGroups.removeAction'
  | 'repositoryGroups.removeHint'
  | 'repositoryGroups.createdStatus'
  | 'repositoryGroups.updatedStatus'
  | 'repositoryGroups.removedStatus'
  | 'repositoryGroups.actionFailed'
  | 'repositoryGroups.noticeAria'
  | 'removeRepository.trashFailedMessage'
  | 'removeRepository.trashFailedWarning'
  | 'removeRepository.forceDeleteButton'
  | 'patchSeries.initialStatus'
  | 'patchSeries.runningExport'
  | 'patchSeries.runningImport'
  | 'patchSeries.runningContinue'
  | 'patchSeries.runningSkip'
  | 'patchSeries.runningAbort'
  | 'patchSeries.operation'
  | 'patchSeries.chooseExportTitle'
  | 'patchSeries.reviewExportStatus'
  | 'patchSeries.prepareExportError'
  | 'patchSeries.prepareExportFailed'
  | 'patchSeries.chooseImportTitle'
  | 'patchSeries.patchFileFilter'
  | 'patchSeries.reviewImportStatus'
  | 'patchSeries.prepareImportError'
  | 'patchSeries.prepareImportFailed'
  | 'patchSeries.runningStatus'
  | 'patchSeries.startError'
  | 'patchSeries.cancelledStatus'
  | 'patchSeries.failedStatus'
  | 'patchSeries.gitFailed'
  | 'patchSeries.gitFailedWithCode'
  | 'patchSeries.refreshingStatus'
  | 'patchSeries.exportedStatus'
  | 'patchSeries.abortedStatus'
  | 'patchSeries.completedStatus'
  | 'patchSeries.refreshFailedStatus'
  | 'patchSeries.refreshRequiredError'
  | 'patchSeries.exportConfirmTitle'
  | 'patchSeries.exportConfirmDescription'
  | 'patchSeries.exportAction'
  | 'patchSeries.goBack'
  | 'patchSeries.importConfirmTitle'
  | 'patchSeries.importConfirmDescription'
  | 'patchSeries.additionalPatches'
  | 'patchSeries.importAction'
  | 'patchSeries.recoveryAria'
  | 'patchSeries.recoveryDescription'
  | 'patchSeries.continueAction'
  | 'patchSeries.skipAction'
  | 'patchSeries.abortAction'
  | 'patchSeries.title'
  | 'patchSeries.heading'
  | 'patchSeries.description'
  | 'patchSeries.chooseExportAction'
  | 'patchSeries.chooseImportAction'
  | 'patchSeries.cancelAction'
  | 'patchSeries.resultsAria'
  | 'bulkBranchDelete.aria'
  | 'bulkBranchDelete.closeAction'
  | 'bulkBranchDelete.openAction'
  | 'bulkBranchDelete.reviewTitle'
  | 'bulkBranchDelete.protectedDescription'
  | 'bulkBranchDelete.selectAll'
  | 'bulkBranchDelete.selectNone'
  | 'bulkBranchDelete.empty'
  | 'bulkBranchDelete.listAria'
  | 'bulkBranchDelete.reviewDeletion'
  | 'bulkBranchDelete.confirmSingular'
  | 'bulkBranchDelete.confirmPlural'
  | 'bulkBranchDelete.remoteUnaffected'
  | 'bulkBranchDelete.deleteReviewed'
  | 'bulkBranchDelete.goBack'
  | 'bulkBranchDelete.deleting'
  | 'bulkBranchDelete.limitError'
  | 'bulkBranchDelete.reviewChangedError'
  | 'bulkBranchDelete.deleteError'
  | 'bulkBranchDelete.resultsAria'
  | 'stashManager.timeUnavailable'
  | 'stashManager.timestamp'
  | 'stashManager.operationCancelled'
  | 'stashManager.operationFailed'
  | 'stashManager.repositoryChangedStatus'
  | 'stashManager.operationProgress'
  | 'stashManager.cancellingStatus'
  | 'stashManager.createOperation'
  | 'stashManager.createSuccess'
  | 'stashManager.applyOperation'
  | 'stashManager.applySuccess'
  | 'stashManager.saveDetailsOperation'
  | 'stashManager.saveDetailsSuccess'
  | 'stashManager.clearOperation'
  | 'stashManager.clearSuccessSingular'
  | 'stashManager.clearSuccessPlural'
  | 'stashManager.stashChangedError'
  | 'stashManager.restoreOperation'
  | 'stashManager.restoreSuccess'
  | 'stashManager.discardOperation'
  | 'stashManager.discardSuccess'
  | 'stashManager.createBranchOperation'
  | 'stashManager.createBranchSuccess'
  | 'stashManager.createHeading'
  | 'stashManager.nameLabel'
  | 'stashManager.createPlaceholder'
  | 'stashManager.changesToSave'
  | 'stashManager.allTrackedChanges'
  | 'stashManager.selectedFileSingular'
  | 'stashManager.selectedFilePlural'
  | 'stashManager.includeUntracked'
  | 'stashManager.selectedScopeCaption'
  | 'stashManager.untrackedWarning'
  | 'stashManager.conflictsWarning'
  | 'stashManager.createAction'
  | 'stashManager.fileCountSingular'
  | 'stashManager.fileCountPlural'
  | 'stashManager.filesLoadWhenOpened'
  | 'stashManager.reviewStashAria'
  | 'stashManager.externalLabel'
  | 'stashManager.selectedActionsAria'
  | 'stashManager.workingChangesWarningSingular'
  | 'stashManager.workingChangesWarningPlural'
  | 'stashManager.applyAction'
  | 'stashManager.restoreAction'
  | 'stashManager.renameMoveAction'
  | 'stashManager.newBranchAction'
  | 'stashManager.discardAction'
  | 'stashManager.editStashAria'
  | 'stashManager.branchAssociation'
  | 'stashManager.metadataCaption'
  | 'stashManager.saveDetailsAction'
  | 'stashManager.cancelAction'
  | 'stashManager.branchFromAria'
  | 'stashManager.newLocalBranch'
  | 'stashManager.branchCaption'
  | 'stashManager.reviewBranchAction'
  | 'stashManager.confirmRestore'
  | 'stashManager.confirmDiscard'
  | 'stashManager.confirmBranch'
  | 'stashManager.confirmClearSingular'
  | 'stashManager.confirmClearPlural'
  | 'stashManager.createBranchAction'
  | 'stashManager.confirmAction'
  | 'stashManager.inventoryHeading'
  | 'stashManager.clearReviewedAction'
  | 'stashManager.emptyInventory'
  | 'stashManager.currentLabel'
  | 'stashManager.managedOnlyCaption'
  | 'stashManager.externalCaptionSingular'
  | 'stashManager.externalCaptionPlural'
  | 'stashManager.truncatedCaption'
  | 'stashManager.managerAria'
  | 'stashManager.repositoryStashSingular'
  | 'stashManager.repositoryStashPlural'
  | 'stashManager.checkoutBranchCaption'
  | 'stashManager.onBranchCaption'
  | 'stashManager.closeAction'
  | 'stashManager.manageAction'
  | 'stashManager.controlsAria'
  | 'stashManager.cancelOperationAction'
  | 'stashManager.filterLabel'
  | 'stashManager.filterPlaceholder'
  | 'stashManager.filterAria'
  | 'stashManager.filterRegexTarget'
  | 'stashManager.filterMatchSingular'
  | 'stashManager.filterMatchPlural'
  | 'stashManager.noMatches'
  | 'stashManager.invalidFilterPattern'
  | 'stashManager.openDialogAction'
  | 'stashManager.dialogTitle'
  | 'stashManager.dialogDescription'
  | 'stashManager.dialogTabsAria'
  | 'stashManager.openNewTabAction'
  | 'stashManager.allPagesOpen'
  | 'stashManager.morePages'
  | 'stashManager.manageTab'
  | 'stashManager.exportTab'
  | 'stashManager.historyTab'
  | 'stashManager.appearanceTab'
  | 'stashManager.closeDialogAction'
  | 'stashManager.historyHeading'
  | 'stashManager.historyDescription'
  | 'stashManager.appearanceHeading'
  | 'stashManager.appearanceDescription'
  | 'stashManager.editAppearanceAction'
  | 'stashManager.appearanceHint'
  | 'stashManager.exportPanelAria'
  | 'stashManager.exportDescription'
  | 'stashManager.exportSearchLabel'
  | 'stashManager.exportSearchAria'
  | 'stashManager.exportSearchRegexTarget'
  | 'stashManager.selectVisible'
  | 'stashManager.invertVisible'
  | 'stashManager.exportSelectedCount'
  | 'stashManager.exportFormatLabel'
  | 'stashManager.exportDirectory'
  | 'stashManager.exportSecurityNote'
  | 'stashManager.exportComplete'
  | 'stashManager.openExportInEditor'
  | 'stashManager.exportAction'
  | 'stashManager.exportingAction'
  | 'stashManager.exportSelectionRequired'
  | 'stashManager.exportFailed'
  | 'stashManager.chooseDirectoryTitle'
  | 'stashManager.chooseArchiveTitle'
  | 'stashManager.sevenZipOptionsHeading'
  | 'stashManager.sevenZipMethod'
  | 'stashManager.sevenZipLevel'
  | 'stashManager.sevenZipDictionary'
  | 'stashManager.sevenZipWordSize'
  | 'stashManager.sevenZipMatchFinder'
  | 'stashManager.sevenZipFastBytes'
  | 'stashManager.sevenZipThreads'
  | 'stashManager.sevenZipSplitVolumes'
  | 'stashManager.sevenZipSolid'
  | 'stashManager.sevenZipPassword'
  | 'stashManager.sevenZipEncryptHeaders'
  | 'stashManager.historySearchLabel'
  | 'stashManager.historySearchAria'
  | 'stashManager.historySearchRegexTarget'
  | 'stashManager.appearanceSearchLabel'
  | 'stashManager.appearanceSearchAria'
  | 'stashManager.appearanceSearchRegexTarget'
  | 'tagLifecycle.rejectedError'
  | 'tagLifecycle.operationFailedError'
  | 'tagLifecycle.createdStatus'
  | 'tagLifecycle.movedStatus'
  | 'tagLifecycle.deletedLocalStatus'
  | 'tagLifecycle.pushedStatus'
  | 'tagLifecycle.pushedAllStatus'
  | 'tagLifecycle.fetchedPrunedStatus'
  | 'tagLifecycle.deletedRemoteStatus'
  | 'tagLifecycle.confirmMove'
  | 'tagLifecycle.confirmDeleteLocal'
  | 'tagLifecycle.confirmPushNew'
  | 'tagLifecycle.confirmPushReplace'
  | 'tagLifecycle.confirmPushAll'
  | 'tagLifecycle.confirmFetchPrune'
  | 'tagLifecycle.confirmDeleteRemote'
  | 'tagLifecycle.createHeading'
  | 'tagLifecycle.nameLabel'
  | 'tagLifecycle.targetLabel'
  | 'tagLifecycle.targetPlaceholder'
  | 'tagLifecycle.typeLabel'
  | 'tagLifecycle.annotated'
  | 'tagLifecycle.lightweight'
  | 'tagLifecycle.messageLabel'
  | 'tagLifecycle.signConfigured'
  | 'tagLifecycle.signingConfigured'
  | 'tagLifecycle.signingNotConfigured'
  | 'tagLifecycle.createAction'
  | 'tagLifecycle.moveAria'
  | 'tagLifecycle.moveHeading'
  | 'tagLifecycle.reviewedObject'
  | 'tagLifecycle.newTargetLabel'
  | 'tagLifecycle.recreatedTypeLabel'
  | 'tagLifecycle.signRecreated'
  | 'tagLifecycle.reviewMoveAction'
  | 'tagLifecycle.cancelAction'
  | 'tagLifecycle.remoteNotLoaded'
  | 'tagLifecycle.localOnly'
  | 'tagLifecycle.pushed'
  | 'tagLifecycle.differentRemotely'
  | 'tagLifecycle.annotatedLower'
  | 'tagLifecycle.lightweightLower'
  | 'tagLifecycle.localTagMeta'
  | 'tagLifecycle.signedSuffix'
  | 'tagLifecycle.moveAction'
  | 'tagLifecycle.pushAction'
  | 'tagLifecycle.deleteRemoteAction'
  | 'tagLifecycle.deleteLocalAction'
  | 'tagLifecycle.remoteOnlyMeta'
  | 'tagLifecycle.confirmHeading'
  | 'tagLifecycle.typeToConfirm'
  | 'tagLifecycle.confirmAction'
  | 'tagLifecycle.managerAria'
  | 'tagLifecycle.title'
  | 'tagLifecycle.description'
  | 'tagLifecycle.refreshLocalAction'
  | 'tagLifecycle.loadRemoteAction'
  | 'tagLifecycle.readOnlyNotice'
  | 'tagLifecycle.loading'
  | 'tagLifecycle.filterLabel'
  | 'tagLifecycle.fetchedStatus'
  | 'tagLifecycle.fetchAction'
  | 'tagLifecycle.fetchPruneAction'
  | 'tagLifecycle.pushAllAction'
  | 'tagLifecycle.localTagsHeading'
  | 'tagLifecycle.noLocalMatches'
  | 'tagLifecycle.localTruncated'
  | 'tagLifecycle.remoteOnlyHeading'
  | 'tagLifecycle.noRemoteMatches'
  | 'tagLifecycle.remoteTruncated'
  | 'ollama.setup.heading'
  | 'ollama.setup.description'
  | 'ollama.setup.notConfiguredTitle'
  | 'ollama.setup.notConfiguredBody'
  | 'ollama.setup.endpointLabel'
  | 'ollama.setup.endpointHint'
  | 'ollama.setup.connect'
  | 'ollama.setup.connecting'
  | 'ollama.setup.invalidEndpoint'
  | 'ollama.setup.connectFailed'
  | 'ollama.setup.saveFailed'
  | 'ollama.setup.guidanceTitle'
  | 'ollama.setup.guidanceInstall'
  | 'ollama.setup.guidanceDefault'
  | 'ollama.setup.guidanceLocal'
  | 'ollama.setup.providerLabel'
  | 'ollama.providerType'
  | 'ollama.authenticationHeading'
  | 'ollama.authenticationDescription'
  | 'ollama.modelsSyncDescription'
  | 'ollama.modelsEmpty'
  | 'ollama.manager.openAction'
  | 'ollama.manager.backAction'
  | 'ollama.manager.title'
  | 'ollama.manager.subtitle'
  | 'ollama.manager.endpoint'
  | 'ollama.manager.configuredEndpoint'
  | 'ollama.manager.connected'
  | 'ollama.manager.unavailable'
  | 'ollama.manager.checking'
  | 'ollama.manager.partial'
  | 'ollama.manager.version'
  | 'ollama.manager.installed'
  | 'ollama.manager.running'
  | 'ollama.manager.refresh'
  | 'ollama.manager.refreshing'
  | 'ollama.manager.searchLabel'
  | 'ollama.manager.searchPlaceholder'
  | 'ollama.manager.clearSearch'
  | 'ollama.manager.scopeLabel'
  | 'ollama.manager.allModels'
  | 'ollama.manager.runningModels'
  | 'ollama.manager.inventoryLabel'
  | 'ollama.manager.loadingInventory'
  | 'ollama.manager.unavailableInventory'
  | 'ollama.manager.emptyInventory'
  | 'ollama.manager.emptyFilter'
  | 'ollama.manager.modelDetails'
  | 'ollama.manager.selectModel'
  | 'ollama.manager.loadingDetails'
  | 'ollama.manager.runningBadge'
  | 'ollama.manager.size'
  | 'ollama.manager.modified'
  | 'ollama.manager.digest'
  | 'ollama.manager.family'
  | 'ollama.manager.format'
  | 'ollama.manager.parameters'
  | 'ollama.manager.quantization'
  | 'ollama.manager.capabilities'
  | 'ollama.manager.license'
  | 'ollama.manager.noneReported'
  | 'ollama.manager.runtime'
  | 'ollama.manager.vram'
  | 'ollama.manager.context'
  | 'ollama.manager.expires'
  | 'ollama.manager.notRunning'
  | 'ollama.manager.pullTitle'
  | 'ollama.manager.pullHint'
  | 'ollama.manager.modelName'
  | 'ollama.manager.pullPlaceholder'
  | 'ollama.manager.pull'
  | 'ollama.manager.pulling'
  | 'ollama.manager.cancel'
  | 'ollama.manager.receiving'
  | 'ollama.manager.copyTitle'
  | 'ollama.manager.copyHint'
  | 'ollama.manager.copyDestination'
  | 'ollama.manager.copy'
  | 'ollama.manager.renameTitle'
  | 'ollama.manager.renameHint'
  | 'ollama.manager.renameDestination'
  | 'ollama.manager.rename'
  | 'ollama.manager.load'
  | 'ollama.manager.unload'
  | 'ollama.manager.delete'
  | 'ollama.manager.deleteTitle'
  | 'ollama.manager.deleteConfirm'
  | 'ollama.manager.invalidName'
  | 'ollama.manager.duplicateName'
  | 'ollama.manager.operationError'
  | 'ollama.manager.refreshError'
  | 'ollama.manager.detailsError'
  | 'ollama.manager.configurationPartial'
  | 'ollama.manager.renamePartial'
  | 'ollama.manager.pullCancelled'
  | 'ollama.manager.chatTitle'
  | 'ollama.manager.chatHint'
  | 'ollama.manager.chatModelLabel'
  | 'ollama.manager.chatPlaceholder'
  | 'ollama.manager.chatSend'
  | 'ollama.manager.chatStop'
  | 'ollama.manager.chatClear'
  | 'ollama.manager.chatStreaming'
  | 'ollama.manager.chatEmpty'
  | 'ollama.manager.chatNoModel'
  | 'ollama.manager.chatUnsupported'
  | 'ollama.manager.chatError'
  | 'ollama.manager.chatYou'
  | 'ollama.manager.chatAssistant'
  | 'ollama.manager.chatMessageLabel'
  | 'ollama.manager.chatSystem'
  | 'ollama.manager.chatSessionsHeading'
  | 'ollama.manager.chatDefaultTitle'
  | 'ollama.manager.chatNew'
  | 'ollama.manager.chatRename'
  | 'ollama.manager.chatDelete'
  | 'ollama.manager.chatCancel'
  | 'ollama.manager.chatConfirmDelete'
  | 'ollama.manager.chatSelectPrompt'
  | 'ollama.manager.chatLoading'
  | 'ollama.manager.chatLoadError'
  | 'ollama.manager.chatCopy'
  | 'ollama.manager.chatAttachImage'
  | 'ollama.manager.chatRemoveImage'
  | 'ollama.manager.chatUnsupportedImage'
  | 'ollama.manager.chatImageTooLarge'
  | 'ollama.manager.chatClearDraft'
  | 'ollama.manager.chatCustomize'
  | 'ollama.manager.chatHistory'
  | 'ollama.manager.chatAppearanceHeading'
  | 'ollama.manager.chatAccentLabel'
  | 'ollama.manager.chatSurfaceLabel'
  | 'ollama.manager.chatSurfaceTonal'
  | 'ollama.manager.chatSurfaceNeutral'
  | 'ollama.manager.chatMessageFont'
  | 'ollama.manager.chatComposerFont'
  | 'ollama.manager.chatSettingsHint'
  | 'ollama.manager.chatHistoryTitle'
  | 'ollama.manager.chatHistoryTimeline'
  | 'ollama.manager.chatHistoryDescription'
  | 'ollama.manager.chatHistorySearchLabel'
  | 'ollama.manager.chatHistorySearchPlaceholder'
  | 'ollama.manager.chatHistorySearchStatus'
  | 'ollama.manager.chatHistoryMatchingCount'
  | 'ollama.manager.chatHistoryUndo'
  | 'ollama.manager.chatHistoryRedo'
  | 'ollama.manager.chatHistoryCommitSingular'
  | 'ollama.manager.chatHistoryCommitCount'
  | 'ollama.manager.chatHistoryLoadingFiles'
  | 'ollama.manager.chatHistorySelectToInspect'
  | 'ollama.manager.chatHistoryNoFiles'
  | 'ollama.manager.chatHistoryRestoreLabel'
  | 'ollama.manager.chatHistoryRestoreTooltip'
  | 'ollama.manager.chatHistoryRestoreConfirmation'
  | 'ollama.manager.chatHistoryRestore'
  | 'ollama.manager.chatHistoryLoading'
  | 'ollama.manager.chatHistoryNoHistoryTitle'
  | 'ollama.manager.chatHistoryNoHistoryDescription'
  | 'ollama.manager.chatHistoryNoMatchesTitle'
  | 'ollama.manager.chatHistoryNoMatchesDescription'
  | 'ollama.manager.chatHistoryLoadingMore'
  | 'ollama.manager.chatHistoryLoadMore'
  | 'ollama.manager.chatHistoryLoadingDiff'
  | 'ollama.manager.chatHistoryNoTextChanges'
  | 'ollama.manager.chatHistoryDiffTruncated'
  | 'ollama.manager.chatHistoryDiffLabel'
  | 'ollama.manager.chatHistorySelectCommit'
  | 'ollama.manager.chatHistoryRetry'
  | 'ollama.manager.chatHistoryCloseLabel'
  | 'ollama.manager.chatHistoryCommitsLabel'
  | 'ollama.manager.chatHistoryDetailsLabel'
  | 'ollama.manager.chatHistoryChangeCreate'
  | 'ollama.manager.chatHistoryChangeMessage'
  | 'ollama.manager.chatHistoryChangeTurn'
  | 'ollama.manager.chatHistoryChangeRename'
  | 'ollama.manager.chatHistoryChangeModel'
  | 'ollama.manager.chatHistoryChangeAppearance'
  | 'ollama.manager.chatHistoryChangeFont'
  | 'ollama.manager.chatHistoryChangeRecover'
  | 'ollama.manager.chatHistoryChangeUndo'
  | 'ollama.manager.chatHistoryChangeRedo'
  | 'ollama.manager.chatHistoryChangeRestorePoint'
  | 'ollama.manager.chatHistoryError'
  | 'ollama.manager.chatDeletePrompt'
  | 'ollama.manager.chatMessageCount'
  | 'ollama.manager.chatImageAlt'
  | 'ollama.manager.chatImageLimit'
  | 'ollama.manager.unknown'
  | 'ollama.manager.never'
  | 'ollama.manager.showing'
  | 'ollama.manager.selectedModel'
  | 'ollama.manager.moreCapabilities'
  | 'ollama.manager.pullProgress'
  | 'ollama.manager.pullSucceeded'
  | 'ollama.manager.copySucceeded'
  | 'ollama.manager.renameSucceeded'
  | 'ollama.manager.loadSucceeded'
  | 'ollama.manager.unloadSucceeded'
  | 'ollama.manager.deleteSucceeded'
  | 'ollama.manager.confirmDelete'
  | 'subtree.title'
  | 'color.blue'
  | 'color.violet'
  | 'color.teal'
  | 'color.green'
  | 'color.amber'
  | 'color.rose'
  | 'settings.notificationsEnableTitle'
  | 'settings.notificationsEnableDescription'
  | 'settings.dialogTitle'
  | 'settings.closeAction'
  | 'settings.automationAutoCommitPushTitle'
  | 'settings.automationAutoCommitPushDescription'
  | 'settings.automationAutoPullTitle'
  | 'settings.automationAutoPullDescription'
  | 'settings.automationIntervalEvery'
  | 'settings.automationIntervalMinutes'
  | 'settings.automationIntervalGroupLabel'
  | 'settings.globalTabsLabel'
  | 'settings.accountsTab'
  | 'settings.integrationsTab'
  | 'settings.copilotTab'
  | 'settings.gitTab'
  | 'settings.appearanceTab'
  | 'settings.notificationsTab'
  | 'settings.promptsTab'
  | 'settings.advancedTab'
  | 'settings.accessibilityTab'
  | 'settings.agentAccessTab'
  | 'settings.selfHostedServerTab'
  | 'settings.automationTab'
  | 'settings.aiTab'
  | 'settings.attentionTab'
  | 'settings.browserTabSearch'
  | 'settings.browserTabOpenNew'
  | 'settings.browserTabAllOpen'
  | 'settings.browserTabMore'
  | 'settings.browserTabClose'
  | 'settings.browserTabPin'
  | 'settings.browserTabUnpin'
  | 'settings.browserTabPickerTitle'
  | 'settings.browserTabNoMatches'
  | 'settings.queueTab'
  | 'settings.queueHeading'
  | 'settings.queueDescription'
  | 'settings.queueNoAccounts'
  | 'settings.queueAutoCloneTitle'
  | 'settings.queueAutoCloneDescription'
  | 'settings.queueBaseDirectory'
  | 'settings.queueChooseDirectory'
  | 'settings.queueDirectoryPlaceholder'
  | 'settings.queueMode'
  | 'settings.queueModeParallel'
  | 'settings.queueModeSequential'
  | 'settings.queueEnabledStatus'
  | 'settings.queueDisabledStatus'
  | 'settings.queueDirectoryRequired'
  | 'settings.queueSafetyNote'
  | 'settings.soundTab'
  | 'settings.ollamaTab'
  | 'settings.soundHeading'
  | 'settings.soundDescription'
  | 'settings.soundMasterEnableTitle'
  | 'settings.soundMasterEnableDescription'
  | 'settings.soundSfxHeading'
  | 'settings.soundSfxEnableTitle'
  | 'settings.soundSfxEnableDescription'
  | 'settings.soundSfxVolumeLabel'
  | 'settings.soundPreviewCue'
  | 'settings.soundTtsHeading'
  | 'settings.soundTtsEnableTitle'
  | 'settings.soundTtsEnableDescription'
  | 'settings.soundTtsVolumeLabel'
  | 'settings.soundTtsCooldownLabel'
  | 'settings.soundRecordedNarrationTitle'
  | 'settings.soundRecordedNarrationDescription'
  | 'settings.soundPreviewNarration'
  | 'settings.soundFunnyHeading'
  | 'settings.soundFunnyEnglishLabel'
  | 'settings.soundFunnyCantoneseLabel'
  | 'settings.soundFunnyHint'
  | 'settings.soundMusicHeading'
  | 'settings.soundMusicEnableTitle'
  | 'settings.soundMusicEnableDescription'
  | 'settings.soundMusicVolumeLabel'
  | 'settings.soundMusicRepoLabel'
  | 'settings.soundMusicChoose'
  | 'settings.soundMusicClear'
  | 'settings.soundMusicNoRepo'
  | 'settings.soundMusicNoTrack'
  | 'settings.soundThemeSubheading'
  | 'settings.soundThemeExplanation'
  | 'settings.soundThemeCurrentLabel'
  | 'settings.soundThemeStateTheme'
  | 'settings.soundThemeStateCustom'
  | 'settings.soundThemeStateOff'
  | 'settings.soundThemeUseTheme'
  | 'settings.soundThemeMute'
  | 'settings.soundThemePreview'
  | 'settings.repoThemeNameFormat'
  | 'settings.repoThemeMoodCalm'
  | 'settings.repoThemeMoodBright'
  | 'settings.repoThemeMoodDriving'
  | 'settings.repoThemeMoodDreamy'
  | 'settings.repoThemeMoodMellow'
  | 'settings.repoThemeMoodPlayful'
  | 'settings.repoThemeMoodSolemn'
  | 'settings.repoThemeMoodElectric'
  | 'settings.repoThemeTexturePulse'
  | 'settings.repoThemeTextureCascade'
  | 'settings.repoThemeTextureDrift'
  | 'settings.repoThemeTextureBloom'
  | 'settings.repoThemeTextureCircuit'
  | 'settings.repoThemeTextureHorizon'
  | 'settings.repoThemeTextureLantern'
  | 'settings.repoThemeTextureTide'
  | 'settings.repoThemeScaleMajor'
  | 'settings.repoThemeScaleMinor'
  | 'settings.repoThemeScaleDorian'
  | 'settings.repoThemeScaleMixolydian'
  | 'settings.repoThemeScaleLydian'
  | 'settings.repoThemeScalePentatonic'
  | 'settings.soundQuietHoursHeading'
  | 'settings.soundQuietHoursEnableTitle'
  | 'settings.soundQuietHoursEnableDescription'
  | 'settings.soundQuietHoursStartLabel'
  | 'settings.soundQuietHoursEndLabel'
  | 'settings.soundReducedMotionTitle'
  | 'settings.soundReducedMotionDescription'
  | 'settings.soundSfxAuditionHeading'
  | 'settings.soundSfxAuditionHint'
  | 'settings.soundCuePlayLabel'
  | 'settings.soundFamilySuccess'
  | 'settings.soundFamilyProgress'
  | 'settings.soundFamilyWarning'
  | 'settings.soundFamilyError'
  | 'settings.soundFamilyNeutral'
  | 'settings.soundCueCommit'
  | 'settings.soundCuePush'
  | 'settings.soundCuePull'
  | 'settings.soundCueFetch'
  | 'settings.soundCueDetecting'
  | 'settings.soundCueInstalling'
  | 'settings.soundCueBuilding'
  | 'settings.soundCueRunning'
  | 'settings.soundCueSucceeded'
  | 'settings.soundCueFailed'
  | 'settings.soundCueCancelled'
  | 'settings.soundCueSuccess'
  | 'settings.soundCueError'
  | 'settings.soundCueInfo'
  | 'settings.mobileConnectionHeading'
  | 'settings.mobileConnectionDescription'
  | 'settings.mobileConnectionOpen'
  | 'settings.mobileConnectionChoosePairedMode'
  | 'settings.mobileConnectionStartServer'
  | 'settings.mobileConnectionOpenFailed'
  | 'settings.advancedUsageStatsTitle'
  | 'settings.advancedUsageStatsDescription'
  | 'settings.advancedCredentialStorageTitle'
  | 'settings.advancedCredentialStorageDescription'
  | 'settings.browserOpenModeTitle'
  | 'settings.browserOpenModeDescription'
  | 'settings.browserOpenModeInternal'
  | 'settings.browserOpenModeExternal'
  | 'browser.error.externalOpenFailedTitle'
  | 'browser.error.externalOpenFailed'
  | 'browser.title'
  | 'browser.contentRegionNote'
  | 'browser.tabs'
  | 'browser.newTab'
  | 'browser.closeTab'
  | 'browser.closeNamedTab'
  | 'browser.closeAuthenticationTab'
  | 'browser.authentication'
  | 'browser.authChip'
  | 'browser.back'
  | 'browser.forward'
  | 'browser.stop'
  | 'browser.refresh'
  | 'browser.addressLabel'
  | 'browser.addressPlaceholder'
  | 'browser.go'
  | 'browser.removeBookmark'
  | 'browser.addBookmark'
  | 'browser.openExternal'
  | 'browser.bookmarks'
  | 'browser.authNoticeTitle'
  | 'browser.authNoticeBody'
  | 'browser.openAuthExternal'
  | 'browser.findOpen'
  | 'browser.findLabel'
  | 'browser.findQueryLabel'
  | 'browser.findPlaceholder'
  | 'browser.findMode'
  | 'browser.findBuilder'
  | 'browser.findCaseSensitive'
  | 'browser.findPrevious'
  | 'browser.findNext'
  | 'browser.findClose'
  | 'browser.findTarget'
  | 'browser.findSearching'
  | 'browser.findNoMatches'
  | 'browser.findCount'
  | 'browser.findTruncated'
  | 'browser.findResults'
  | 'browser.findMatch'
  | 'browser.error.invalidAddress'
  | 'browser.error.loadFailed'
  | 'browser.error.certificate'
  | 'browser.error.downloadBlocked'
  | 'browser.error.rendererGone'
  | 'browser.error.tooManyTabs'
  | 'settings.integrationsExternalEditorTitle'
  | 'settings.integrationsExternalEditorSubtitle'
  | 'settings.integrationsShellTitle'
  | 'settings.integrationsShellSubtitle'
  | 'settings.integrationsChooseEditor'
  | 'settings.integrationsChooseShell'
  | 'settings.integrationsCustomEditorChoice'
  | 'settings.integrationsCustomShellChoice'
  | 'settings.integrationsCustomEditorLabel'
  | 'settings.integrationsCustomShellLabel'
  | 'settings.integrationsSelectEditor'
  | 'settings.tabsDockPosition'
  | 'settings.tabsDockDescription'
  | 'settings.tabsDockLeft'
  | 'settings.tabsDockTop'
  | 'settings.tabsDockBottom'
  | 'settings.tabsDockRight'
  | 'settings.contextMenuHeading'
  | 'settings.contextMenuDescription'
  | 'settings.contextMenuPlacementNote'
  | 'settings.contextMenuOpencodeLabel'
  | 'settings.contextMenuOpencodeDescription'
  | 'settings.contextMenuDesktopMaterialLabel'
  | 'settings.contextMenuDesktopMaterialDescription'
  | 'settings.contextMenuOpencodeMissing'
  | 'settings.contextMenuAppPathUnknown'
  | 'settings.contextMenuNeedsRepair'
  | 'settings.contextMenuBusy'
  | 'settings.contextMenuStateError'
  | 'settings.contextMenuApplyError'
  | 'settings.contextMenuModernLabel'
  | 'settings.contextMenuModernDescription'
  | 'settings.contextMenuModeModern'
  | 'settings.contextMenuModeClassic'
  | 'settings.contextMenuModeNone'
  | 'settings.contextMenuNeedsWindows11'
  | 'settings.contextMenuPackageMissing'
  | 'settings.contextMenuNeedsDeveloperMode'
  | 'settings.contextMenuRegistrationStale'
  | 'quickAction.loading'
  | 'quickAction.notARepository'
  | 'quickAction.noChanges'
  | 'quickAction.needSummary'
  | 'quickAction.detachedHead'
  | 'quickAction.busy'
  | 'quickAction.changeCount'
  | 'quickAction.summaryLabel'
  | 'quickAction.summaryPlaceholder'
  | 'quickAction.commitAndPush'
  | 'quickAction.openInFullApp'
  | 'quickAction.pushed'
  | 'quickAction.genericError'
  | 'push.ghCliFallbackSuccessTitle'
  | 'push.ghCliFallbackSuccessBody'
  | 'clone.visibilityPublic'
  | 'clone.visibilityPrivate'
  | 'clone.visibilityAll'
  | 'clone.visibilityForked'
  | 'clone.noDescription'
  | 'clone.starsLabel'
  | 'clone.forksLabel'
  | 'clone.sizeLabel'
  | 'clone.defaultBranchLabel'
  | 'clone.updatedLabel'
  | 'clone.languageLabel'
  | 'clone.languageFilterLabel'
  | 'clone.languageFilterAria'
  | 'clone.visibilityFilterAria'
  | 'clone.visibilityFilterLabel'
  | 'clone.filters.button'
  | 'clone.filters.buttonActive'
  | 'clone.filters.activeCount'
  | 'clone.filters.metadataAria'
  | 'clone.cheapLfs.badgeTitle'
  | 'clone.cheapLfs.badgeAriaOne'
  | 'clone.cheapLfs.badgeAriaMany'
  | 'clone.cheapLfs.selectorTitle'
  | 'clone.cheapLfs.selectorSummaryOne'
  | 'clone.cheapLfs.selectorSummaryMany'
  | 'clone.cheapLfs.selectorSearchPlaceholder'
  | 'clone.cheapLfs.selectorSearchAria'
  | 'clone.cheapLfs.selectorRegexTarget'
  | 'clone.cheapLfs.selectorSelectedCount'
  | 'clone.cheapLfs.selectorSelectAll'
  | 'clone.cheapLfs.selectorSelectNone'
  | 'clone.cheapLfs.selectorNoMatches'
  | 'clone.cheapLfs.selectorTreeAria'
  | 'clone.cheapLfs.selectorIncludeOne'
  | 'clone.cheapLfs.selectorIncludeMany'
  | 'clone.cheapLfs.selectorFileAria'
  | 'clone.cheapLfs.selectorFolderAria'
  | 'clone.cheapLfs.selectorCollapse'
  | 'clone.cheapLfs.selectorExpand'
  | 'clone.orgScopeMissing'
  | 'clone.orgReconnect'
  | 'clone.orgRestrictionNote'
  | 'clone.orgReviewAccess'
  | 'commandPalette.title'
  | 'commandPalette.searchPlaceholder'
  | 'commandPalette.searchLabel'
  | 'commandPalette.commands'
  | 'commandPalette.noMatches'
  | 'commandPalette.searchTerms'
  | 'commandPalette.customizeAppearance'
  | 'commandPalette.appearanceDialog'
  | 'commandPalette.appearanceHeading'
  | 'commandPalette.randomPerRepository'
  | 'commandPalette.randomPerRepositoryDescription'
  | 'commandPalette.paletteSize'
  | 'commandPalette.sizeCompact'
  | 'commandPalette.sizeCompactDescription'
  | 'commandPalette.sizeMedium'
  | 'commandPalette.sizeMediumDescription'
  | 'commandPalette.sizeFull'
  | 'commandPalette.sizeFullDescription'
  | 'repositorySettings.tabRemote'
  | 'repositorySettings.tabIgnoredFiles'
  | 'repositorySettings.tabGitConfig'
  | 'repositorySettings.tabBuildRun'
  | 'repositorySettings.tabCheapLfs'
  | 'repositorySettings.tabSubmodules'
  | 'repositorySettings.tabSubtrees'
  | 'repositorySettings.tabAutomation'
  | 'repositorySettings.tabMetadata'
  | 'repositorySettings.tabAppearance'
  | 'repositorySettings.tabAISecurity'
  | 'repositorySettings.tabForkSettings'
  | 'repositorySettings.tabsLabel'
  | 'repositorySettings.dialogTitle'
  | 'commandPalette.homeRepositorySettings'
  | 'palette.repositorySettingsRemote'
  | 'palette.repositorySettingsIgnoredFiles'
  | 'palette.repositorySettingsGitConfig'
  | 'palette.repositorySettingsBuildRun'
  | 'palette.repositorySettingsCheapLfs'
  | 'palette.repositorySettingsSubmodules'
  | 'palette.repositorySettingsSubtrees'
  | 'palette.repositorySettingsAutomation'
  | 'palette.repositorySettingsMetadata'
  | 'palette.repositorySettingsAppearance'
  | 'palette.repositorySettingsForkSettings'
  | 'palette.reportIssue'
  | 'palette.reportIssueDescription'
  | 'palette.contactSupport'
  | 'palette.contactSupportDescription'
  | 'palette.userGuides'
  | 'palette.userGuidesDescription'
  | 'palette.keyboardShortcuts'
  | 'palette.keyboardShortcutsDescription'
  | 'palette.showLogsFolder'
  | 'palette.showLogsFolderDescription'
  | 'commandPalette.homeMenuBar'
  | 'commandPalette.linkFailed'
  | 'palette.increaseActiveResizableWidth'
  | 'palette.decreaseActiveResizableWidth'
  | 'palette.setThemeMode.light'
  | 'palette.setThemeMode.dark'
  | 'palette.setThemeMode.system'
  | 'palette.setThemeMode'
  | 'palette.setUiScale'
  | 'palette.setAutoFitZoom'
  | 'palette.setShowRecentRepositories'
  | 'palette.setBranchNameInRepoList.always'
  | 'palette.setBranchNameInRepoList.notDefault'
  | 'palette.setBranchNameInRepoList.never'
  | 'palette.setBranchNameInRepoList'
  | 'palette.setBranchSort.lastModified'
  | 'palette.setBranchSort.alphabetical'
  | 'palette.setBranchSort'
  | 'palette.setDateFormat'
  | 'palette.setTimeFormat'
  | 'palette.setNumberFormat'
  | 'palette.setPreferAbsoluteDates'
  | 'palette.setAutoSwitchAccount'
  | 'palette.setRepositoryIndicators'
  | 'palette.setUsageStats'
  | 'palette.setVerboseLogging'
  | 'palette.setLargeRepoAutoDetect'
  | 'palette.setLargeRepoAutoRepack'
  | 'palette.setBrowserOpenMode.internal'
  | 'palette.setBrowserOpenMode.external'
  | 'palette.setBrowserOpenMode'
  | 'palette.setConfirmDiscardPermanently'
  | 'palette.setConfirmDiscardStash'
  | 'palette.setConfirmCheckoutCommit'
  | 'palette.setConfirmUndoCommit'
  | 'palette.setConfirmCommitMessageOverride'
  | 'palette.setConfirmWorktreeRemoval'
  | 'palette.setConfirmCommitFilteredChanges'
  | 'palette.setUncommittedChangesStrategy.askForConfirmation'
  | 'palette.setUncommittedChangesStrategy.moveToNewBranch'
  | 'palette.setUncommittedChangesStrategy.stashOnCurrentBranch'
  | 'palette.setUncommittedChangesStrategy'
  | 'palette.setDiffCheckMarks'
  | 'palette.setErrorPresentation.notice'
  | 'palette.setErrorPresentation.dialog'
  | 'palette.setErrorPresentation'
  | 'palette.entryGitAuthorName'
  | 'palette.entryGitAuthorEmail'
  | 'palette.setShowCommitIdentity'
  | 'palette.entryDefaultBranchName'
  | 'palette.setGitHookEnv'
  | 'palette.setGitHookEnvShell'
  | 'palette.setGitHookEnvCache'
  | 'palette.globalIgnore'
  | 'palette.setExternalEditor'
  | 'palette.setShell'
  | 'palette.setContextMenuOpencode'
  | 'palette.setContextMenuDesktopMaterial'
  | 'palette.setContextMenuModern'
  | 'palette.branchPresetScript'
  | 'palette.customIntegrations'
  | 'palette.setAgentServerEnabled'
  | 'palette.agentAccessMode'
  | 'palette.agentPairing'
  | 'palette.agentToken'
  | 'palette.setAutoCommitPush'
  | 'palette.setAutoCommitPushInterval'
  | 'palette.setAutoPull'
  | 'palette.setAutoPullInterval'
  | 'palette.automationAccountOverrides'
  | 'palette.queueCloneSettings'
  | 'palette.setSoundEnabled'
  | 'palette.setSoundEffects'
  | 'palette.setSoundEffectVolume'
  | 'palette.setSoundNarrator'
  | 'palette.setSoundRecordedNarration'
  | 'palette.setSoundNarratorVolume'
  | 'palette.setSoundNarratorVoice'
  | 'settings.soundNarratorVoiceTitle'
  | 'settings.soundNarratorVoiceDescription'
  | 'settings.soundNarratorEnglishVoiceLabel'
  | 'settings.soundNarratorCantoneseVoiceLabel'
  | 'settings.soundNarratorChooseAutomatically'
  | 'settings.soundNarratorNetworkVoiceOption'
  | 'settings.soundNarratorVoiceMissingOption'
  | 'settings.soundNarratorVoiceAutomaticStatus'
  | 'settings.soundNarratorVoiceInstalledStatus'
  | 'settings.soundNarratorVoiceNetworkStatus'
  | 'settings.soundNarratorVoiceMissingStatus'
  | 'settings.soundNarratorVoiceNoneStatus'
  | 'settings.soundNarratorRateLabel'
  | 'settings.soundNarratorPitchLabel'
  | 'settings.personalVocabularyTitle'
  | 'settings.personalVocabularyDescription'
  | 'palette.setPersonalVocabulary'
  | 'palette.setSoundNarratorCooldown'
  | 'palette.setSoundMusic'
  | 'palette.setSoundMusicVolume'
  | 'palette.setSoundQuietHours'
  | 'palette.setSoundQuietHoursStart'
  | 'palette.setSoundQuietHoursEnd'
  | 'palette.setSoundReducedMotion'
  | 'palette.repositoryMusicTrack'
  | 'palette.auditionSoundCues'
  | 'palette.copilotCommitModel'
  | 'palette.copilotConflictModel'
  | 'palette.setCopilotAlwaysResolveConflicts'
  | 'palette.addAiProvider'
  | 'palette.entryOllamaEndpoint'
  | 'palette.sshWorkingCopy'
  | 'palette.setBuildAutoInstall'
  | 'palette.setBuildPreElevate'
  | 'palette.setBuildRunAfterBuild'
  | 'palette.setBuildAutoIgnoreOutputs'
  | 'palette.setBuildAfterPull'
  | 'palette.setBuildOfferAgents'
  | 'palette.setBuildFixProvider.codex'
  | 'palette.setBuildFixProvider.opencode'
  | 'palette.setBuildFixProvider'
  | 'palette.setBuildFixAutoApprove'
  | 'palette.setCheapLfsAutoMaterialize'
  | 'palette.setCheapLfsAutoPin'
  | 'palette.setCheapLfsCloneHelper'
  | 'palette.setCheapLfsParallelUploads'
  | 'palette.setCheapLfsStorageProvider.release'
  | 'palette.setCheapLfsStorageProvider.ghcr'
  | 'palette.setCheapLfsStorageProvider.dockerhub'
  | 'palette.setCheapLfsStorageProvider'
  | 'palette.setCheapLfsCloudCompression'
  | 'palette.cheapLfsEncryption'
  | 'palette.setSigningCommits'
  | 'palette.setSigningTags'
  | 'palette.signingPolicy'
  | 'palette.setDiffAutoExpandContext'
  | 'palette.setDiffContextStep'
  | 'palette.appearance'
  | 'palette.setPaletteDensity'
  | 'palette.setPaletteRandomPerRepository'
  | 'palette.setPaletteShowIcons'
  | 'palette.setPaletteShowGroupChips'
  | 'palette.setPaletteShowKeywords'
  | 'palette.newTabGroup'
  | 'palette.editTabGroup'
  | 'palette.closeTabsContaining'
  | 'palette.closeTabsNotContaining'
  | 'palette.pinTab'
  | 'palette.unpinTab'
  | 'palette.editTabAppearance'
  | 'palette.searchTabs'
  | 'palette.editAppAppearance'
  | 'palette.editAppIdentity'
  | 'palette.editToolbarAppearance'
  | 'palette.editRepositoryListAppearance'
  | 'palette.editRepositoryTabsAppearance'
  | 'palette.editRepositoryLogo'
  | 'palette.manageRepositoryGroups'
  | 'palette.repositoryAccount'
  | 'palette.regexBuilder'
  | 'palette.closeTab'
  | 'palette.closeOtherTabs'
  | 'palette.closeTabsToLeft'
  | 'palette.closeTabsToRight'
  | 'palette.favoriteTab'
  | 'palette.renameTab'
  | 'palette.moveTabToGroup'
  | 'palette.collapseTabGroup'
  | 'palette.deleteTabGroup'
  | 'palette.sortTabsLabelAscending'
  | 'palette.sortTabsLabelDescending'
  | 'palette.sortTabsOpenedNewest'
  | 'palette.sortTabsOpenedOldest'
  | 'palette.sortTabsStatusAttentionFirst'
  | 'palette.sortTabsStatusCleanFirst'
  | 'palette.sortTabsFavoriteFirst'
  | 'palette.sortTabsFavoriteLast'
  | 'palette.undoSettingsChange'
  | 'palette.redoSettingsChange'
  | 'palette.signInDotcom'
  | 'palette.signInEnterprise'
  | 'palette.md3.changes'
  | 'palette.md3.history'
  | 'palette.md3.branches'
  | 'palette.md3.actions'
  | 'palette.md3.inbox'
  | 'palette.md3.terminal'
  | 'palette.md3.agents'
  | 'palette.md3.repositories'
  | 'palette.md3.focusSearch'
  | 'palette.md3.searchRegex'
  | 'palette.md3.searchRegexDescription'
  | 'palette.md3.searchBuilder'
  | 'palette.md3.searchMenu'
  | 'palette.md3.regexGuide'
  | 'palette.md3.compose'
  | 'palette.md3.drawer'
  | 'palette.md3.drawerDescription'
  | 'palette.md3.drawerMenu'
  | 'palette.md3.repositoryMenu'
  | 'palette.md3.branchMenu'
  | 'palette.md3.paneMenu'
  | 'palette.md3.commitSort'
  | 'palette.md3.commitSortDescription'
  | 'palette.md3.commitSortNewest'
  | 'palette.md3.commitSortOldest'
  | 'palette.md3.groupCommitsByDay'
  | 'palette.md3.groupCommitsByDayDescription'
  | 'palette.md3.commitGraph'
  | 'palette.md3.commitGraphDescription'
  | 'palette.md3.wrapLongLines'
  | 'palette.md3.wrapLongLinesDescription'
  | 'palette.md3.diffContextLines'
  | 'palette.md3.diffContextLinesDescription'
  | 'palette.md3.groupChangesByFolder'
  | 'palette.md3.groupChangesByFolderDescription'
  | 'commandPalette.homeMd3Drawer'
  | 'commandPalette.homeMd3Header'
  | 'commandPalette.homeMd3PaneHeader'
  | 'commandPalette.homeRepositoryTools'
  | 'commandPalette.homePalette'
  | 'commandPalette.homeTabStrip'
  | 'commandPalette.homeWorkspace'
  | 'commandPalette.homeRepositoryAppearance'
  | 'commandPalette.rowDensity'
  | 'commandPalette.comfortable'
  | 'commandPalette.comfortableDescription'
  | 'commandPalette.compact'
  | 'commandPalette.compactDescription'
  | 'commandPalette.showInEachRow'
  | 'commandPalette.icons'
  | 'commandPalette.groupChips'
  | 'commandPalette.keywordLine'
  | 'commandPalette.resetDefaults'
  | 'commandPalette.groupApp'
  | 'commandPalette.groupBranch'
  | 'commandPalette.groupChanges'
  | 'commandPalette.groupEdit'
  | 'commandPalette.groupNavigate'
  | 'commandPalette.groupRepository'
  | 'palette.selectAll'
  | 'palette.toggleTheme'
  | 'palette.preferencesAccounts'
  | 'palette.preferencesAppearance'
  | 'palette.preferencesIntegrations'
  | 'palette.preferencesAutomation'
  | 'palette.preferencesAdvanced'
  | 'palette.preferencesNotifications'
  | 'palette.preferencesGit'
  | 'palette.preferencesAccessibility'
  | 'palette.ollamaModelManager'
  | 'palette.ollamaChat'
  | 'palette.preferencesCopilot'
  | 'palette.preferencesSound'
  | 'palette.backgroundQueue'
  | 'palette.buildAndRun'
  | 'palette.cheapLfsSettings'
  | 'palette.repositoryAutomation'
  | 'palette.tagLifecycle'
  | 'palette.githubApiExplorer'
  | 'palette.notificationCentre'
  | 'palette.notificationHistory'
  | 'palette.notificationAutomations'
  | 'palette.copyRepoPath'
  | 'palette.copyBranchName'
  | 'palette.copyCommitSha'
  | 'palette.resolveConflictsAgent'
  | 'palette.fixCiAgent'
  | 'palette.hideBackgroundProgress'
  | 'palette.showBackgroundProgress'
  | 'palette.toggleCheapLfsProgress'
  | 'commandPalette.homeDialog'
  | 'commandPalette.homeNotificationCentre'
  | 'commandPalette.homeToolbar'
  | 'commandPalette.homeSidebar'
  | 'commandPalette.homeChangesView'
  | 'commandPalette.homeCommitBox'
  | 'commandPalette.homeRepositoryList'
  | 'commandPalette.homeSettings'
  | 'commandPalette.whereItLives'
  | 'commandPalette.goThere'
  | 'commandPalette.runCommand'
  | 'commandPalette.applyValue'
  | 'commandPalette.close'
  | 'commandPalette.detailEmpty'
  | 'commandPalette.valueOn'
  | 'commandPalette.valueOff'
  | 'commandPalette.matchCount'
  | 'commandPalette.hintMove'
  | 'commandPalette.hintGo'
  | 'commandPalette.hintRun'
  | 'commandPalette.hintClose'
  | 'commandPalette.rangeHint'
  | 'commandPalette.currentValue'
  | 'commandPalette.detailsRegion'
  | 'commandPalette.controlsColumn'
  | 'commandPalette.settingRow'
  | 'commandPalette.actionRow'
  | 'commandPalette.teleportMissing'
  | 'palette.toggleThemeDescription'
  | 'palette.languageMode'
  | 'palette.languageModeDescription'
  | 'palette.funnyEnglish'
  | 'palette.funnyCantonese'
  | 'palette.funnyLevelDescription'
  | 'palette.tabSize'
  | 'palette.tabSizeDescription'
  | 'palette.highlightFeatures'
  | 'palette.highlightFeaturesDescription'
  | 'palette.confirmDiscard'
  | 'palette.confirmDiscardDescription'
  | 'palette.confirmForcePush'
  | 'palette.confirmForcePushDescription'
  | 'palette.confirmRepositoryRemoval'
  | 'palette.confirmRepositoryRemovalDescription'
  | 'palette.commitLengthWarning'
  | 'palette.commitLengthWarningDescription'
  | 'palette.notificationsEnabled'
  | 'palette.notificationsEnabledDescription'
  | 'palette.underlineLinks'
  | 'palette.underlineLinksDescription'
  | 'palette.externalCredentialHelper'
  | 'palette.externalCredentialHelperDescription'
  | 'palette.windowsOpenSSH'
  | 'palette.windowsOpenSSHDescription'
  | 'palette.sideBySideDiff'
  | 'palette.sideBySideDiffDescription'
  | 'palette.hideWhitespaceChanges'
  | 'palette.hideWhitespaceChangesDescription'
  | 'palette.commitSummary'
  | 'palette.commitSummaryDescription'
  | 'palette.commitSummaryPlaceholder'
  | 'palette.cloneUrl'
  | 'palette.cloneUrlDescription'
  | 'palette.cloneUrlPlaceholder'
  | 'palette.preferencesPrompts'
  | 'palette.preferencesAgentAccess'
  | 'buildRun.closeDisabledRunning'
  | 'buildRun.fixingWithOpencode'
  | 'buildRun.stopConfirmTitle'
  | 'buildRun.stopConfirmBody'
  | 'buildRun.stopConfirmConfirm'
  | 'buildRun.stopConfirmCancel'
  | 'buildRun.scrollToBottom'
  | 'buildRun.autoScroll'
  | 'buildRun.truncateOutput'
  | 'buildRun.backgroundProgress'
  | 'buildRun.backgroundWorking'
  | 'buildRun.hideRunningPanel'
  | 'buildRun.elapsed'
  | 'buildRun.estimatedFinish'
  | 'buildRun.estimatedFinishUnknown'
  | 'conflicts.resolveWithAgent'
  | 'actions.fixCiWithAgent'
  | 'actions.elapsed.run'
  | 'actions.elapsed.pending'
  | 'actions.elapsed.unavailable'
  | 'actions.elapsed.workflowCompleted'
  | 'actions.elapsed.workflowRunning'
  | 'actions.elapsed.workflowPending'
  | 'actions.elapsed.workflowUnavailable'
  | 'actions.elapsed.workflowNone'
  | 'githubReleaseTransfer.stalled'
  | 'githubReleaseTransfer.cliUnavailable'
  | 'githubReleaseTransfer.cliFailed'
  | 'githubReleaseTransfer.incompleteAsset'
  | 'buildRun.sendToOpencode'
  | 'buildRun.sendIntro'
  | 'buildRun.sendPromptLabel'
  | 'buildRun.sendPromptPlaceholder'
  | 'buildRun.sendEmptyError'
  | 'buildRun.sendSubmit'
  | 'buildRun.sendAutoApproveLabel'
  | 'buildRun.sendAutoApproveWarning'
  | 'buildRun.sendAutoApproveNote'
  | 'buildRun.sendRunningTitle'
  | 'buildRun.providerLabel'
  | 'buildRun.fixingWithProvider'
  | 'buildRun.fixWithProvider'
  | 'buildRun.sendToProvider'
  | 'buildRun.fixIntroProvider'
  | 'buildRun.sendIntroProvider'
  | 'buildRun.checkingCli'
  | 'buildRun.detectFailedProvider'
  | 'buildRun.notInstalledCli'
  | 'buildRun.installingCli'
  | 'buildRun.authMissingProvider'
  | 'buildRun.authCommandGuidance'
  | 'buildRun.promptLabelProvider'
  | 'buildRun.promptPlaceholderProvider'
  | 'buildRun.autoApproveProvider'
  | 'buildRun.autoApproveWarningProvider'
  | 'buildRun.codexAutoApproveTrustWarning'
  | 'buildRun.approvalOnRequestProvider'
  | 'buildRun.diagnosingProvider'
  | 'buildRun.verifyingProvider'
  | 'buildRun.workingProvider'
  | 'buildRun.preferredProvider'
  | 'buildRun.offerAgents'
  | 'buildRun.autoApproveRepositoryProvider'
  | 'buildRun.installCliAction'
  | 'buildRun.runCliAction'
  | 'buildRun.runCliAgainAction'
  | 'buildRun.offerAgentsHelp'
  | 'buildRun.autoApproveRepositoryHelp'
  | 'buildRun.codexInstallSafety'
  | 'buildRun.opencodeInstallSafety'
  | 'buildRun.title'
  | 'buildRun.stop'
  | 'buildRun.phase.detecting'
  | 'buildRun.phase.preparing'
  | 'buildRun.phase.installing'
  | 'buildRun.phase.building'
  | 'buildRun.phase.running'
  | 'buildRun.phase.succeeded'
  | 'buildRun.phase.failed'
  | 'buildRun.phase.cancelled'
  | 'buildRun.phase.idle'
  | 'buildRun.pill.stopRunningTooltip'
  | 'buildRun.pill.cancelBuildTooltip'
  | 'buildRun.pill.failedTitle'
  | 'buildRun.pill.failedTooltip'
  | 'buildRun.pill.idleTooltip'
  | 'buildRun.pill.chooseProfile'
  | 'buildRun.closePanel'
  | 'buildRun.restorePanel'
  | 'buildRun.minimizePanel'
  | 'buildRun.copyAll'
  | 'buildRun.clearOutput'
  | 'buildRun.notify.succeededTitle'
  | 'buildRun.notify.succeededBody'
  | 'buildRun.notify.failedTitle'
  | 'buildRun.notify.failedBody'
  | 'actionsLocalRun.commandTitle'
  | 'actionsLocalRun.dialogTitle'
  | 'actionsLocalRun.subtitle'
  | 'actionsLocalRun.checkingTools'
  | 'actionsLocalRun.toolsMissingTitle'
  | 'actionsLocalRun.actMissing'
  | 'actionsLocalRun.actInstalling'
  | 'actionsLocalRun.actInstallingAutomatically'
  | 'actionsLocalRun.actInstallFailed'
  | 'actionsLocalRun.dockerMissing'
  | 'actionsLocalRun.installHint'
  | 'actionsLocalRun.installActLink'
  | 'actionsLocalRun.installDockerLink'
  | 'actionsLocalRun.retryDetection'
  | 'actionsLocalRun.noWorkflows'
  | 'actionsLocalRun.workflowLabel'
  | 'actionsLocalRun.eventLabel'
  | 'actionsLocalRun.jobLabel'
  | 'actionsLocalRun.allJobs'
  | 'actionsLocalRun.parseErrorPrefix'
  | 'actionsLocalRun.inputsHeading'
  | 'actionsLocalRun.inputRequired'
  | 'actionsLocalRun.secretsHeading'
  | 'actionsLocalRun.secretsHint'
  | 'actionsLocalRun.addSecret'
  | 'actionsLocalRun.secretNamePlaceholder'
  | 'actionsLocalRun.secretValuePlaceholder'
  | 'actionsLocalRun.removeSecret'
  | 'actionsLocalRun.dryRunLabel'
  | 'actionsLocalRun.dryRunHelp'
  | 'actionsLocalRun.runButton'
  | 'actionsLocalRun.dryRunButton'
  | 'actionsLocalRun.stopButton'
  | 'actionsLocalRun.stoppingButton'
  | 'actionsLocalRun.closeButton'
  | 'actionsLocalRun.clearLog'
  | 'actionsLocalRun.logRegionLabel'
  | 'actionsLocalRun.statusStarting'
  | 'actionsLocalRun.statusRunning'
  | 'actionsLocalRun.statusSucceeded'
  | 'actionsLocalRun.statusFailed'
  | 'actionsLocalRun.statusCancelled'
  | 'actionsLocalRun.releaseUploadHeading'
  | 'actionsLocalRun.releaseUploadNote'
  | 'actionsLocalRun.releaseUploadWarning'
  | 'actionsLocalRun.filterPlaceholder'
  | 'actionsLocalRun.filterLabel'
  | 'actionsLocalRun.filterRegexTarget'
  | 'actionsLocalRun.filterStatusCount'
  | 'actionsLocalRun.filterStatusNone'
  | 'batchClone.filterPlaceholder'
  | 'batchClone.filterLabel'
  | 'batchClone.filterRegexTarget'
  | 'batchClone.filterStatusCount'
  | 'batchClone.filterStatusNone'
  | 'repositoryTransfer.cheapLfsNote'
  | 'branchRules.filterPlaceholder'
  | 'branchRules.filterLabel'
  | 'branchRules.filterRegexTarget'
  | 'branchRules.filterStatusCount'
  | 'branchRules.filterStatusNone'
  | 'branchRules.filterNoMatchesInList'
  | 'cheapLfs.files.one'
  | 'cheapLfs.files.many'
  | 'cheapLfs.workingTree.menu.one'
  | 'cheapLfs.workingTree.menu.many'
  | 'cheapLfs.workingTree.menu.wholeFileRequired'
  | 'cheapLfs.workingTree.title'
  | 'cheapLfs.workingTree.reviewBody'
  | 'cheapLfs.workingTree.reviewWarning'
  | 'cheapLfs.workingTree.skipped.one'
  | 'cheapLfs.workingTree.skipped.many'
  | 'cheapLfs.workingTree.skipped.deleted'
  | 'cheapLfs.workingTree.skipped.partial'
  | 'cheapLfs.workingTree.progress.label'
  | 'cheapLfs.workingTree.progress.files'
  | 'cheapLfs.workingTree.progress.count'
  | 'cheapLfs.workingTree.progress.canceling'
  | 'cheapLfs.workingTree.result.canceled'
  | 'cheapLfs.workingTree.result.stored.one'
  | 'cheapLfs.workingTree.result.stored.many'
  | 'cheapLfs.workingTree.result.storedLabel'
  | 'cheapLfs.workingTree.result.unchangedLabel'
  | 'cheapLfs.workingTree.result.error'
  | 'cheapLfs.workingTree.result.unknownError'
  | 'cheapLfs.workingTree.done'
  | 'cheapLfs.workingTree.canceling'
  | 'cheapLfs.workingTree.store.one'
  | 'cheapLfs.workingTree.store.many'
  | 'cheapLfs.commitBlocked.restoreTitle'
  | 'cheapLfs.commitBlocked.restoreBody'
  | 'cheapLfs.managerRail'
  | 'cheapLfs.managerTitle'
  | 'cheapLfs.managerIntro'
  | 'cheapLfs.settings.location'
  | 'cheapLfs.settings.open'
  | 'cheapLfs.cloud.title'
  | 'cheapLfs.cloud.publicAutomatic'
  | 'cheapLfs.cloud.privateToggle'
  | 'cheapLfs.cloud.privateHelp'
  | 'cheapLfs.cloud.visibilityUnknown'
  | 'cheapLfs.cloud.localOnly'
  | 'cheapLfs.cloud.workflowAdded'
  | 'cheapLfs.cloud.workflowReady'
  | 'cheapLfs.cloud.workflowDisabled'
  | 'cheapLfs.cloud.builderRouted'
  | 'cheapLfs.cloud.autoInstall.startedTitle'
  | 'cheapLfs.cloud.autoInstall.startedBody'
  | 'cheapLfs.cloud.autoInstall.succeededTitle'
  | 'cheapLfs.cloud.autoInstall.succeededBody'
  | 'cheapLfs.cloud.autoInstall.deferredTitle'
  | 'cheapLfs.cloud.autoInstall.deferredBody'
  | 'cheapLfs.cloud.autoInstall.pendingDefaultTitle'
  | 'cheapLfs.cloud.autoInstall.pendingDefaultBody'
  | 'cheapLfs.cloud.autoInstall.failedTitle'
  | 'cheapLfs.cloud.autoInstall.failedBody'
  | 'cheapLfs.cloud.autoInstall.failedWorkflowScope'
  | 'cheapLfs.cloud.autoInstall.failedRejected'
  | 'cheapLfs.cloud.autoInstall.failedUnknown'
  | 'cheapLfs.cloud.autoInstall.failedNoRepository'
  | 'cheapLfs.cloud.autoInstall.failedNoRemote'
  | 'cheapLfs.cloud.autoInstall.failedDetachedHead'
  | 'cheapLfs.cloud.autoInstall.failedNoDefaultBranch'
  | 'cheapLfs.cloud.autoInstall.updateTitle'
  | 'cheapLfs.cloud.autoInstall.updateBody'
  | 'cheapLfs.cloud.autoInstall.updateAction'
  | 'cheapLfs.cloud.autoInstall.updateWarning'
  | 'cheapLfs.cloud.autoInstall.updateConfirm'
  | 'cheapLfs.cloud.autoInstall.updateCancel'
  | 'cheapLfs.cloud.autoInstall.unownedTitle'
  | 'cheapLfs.cloud.autoInstall.unownedBody'
  | 'cheapLfs.cloud.autoInstall.visibilityUnknownTitle'
  | 'cheapLfs.cloud.autoInstall.visibilityUnknownBody'
  | 'cheapLfs.cloud.autoInstall.builderTitle'
  | 'cheapLfs.cloud.autoInstall.builderUnavailableBody'
  | 'cheapLfs.cloud.autoInstall.builderLeakRefusedBody'
  | 'cheapLfs.cloud.autoInstall.builderNoIdentityBody'
  | 'cheapLfs.cloud.autoInstall.builderPreparationFailedBody'
  | 'cheapLfs.cloud.raw'
  | 'cheapLfs.cloud.compressed'
  | 'cheapLfs.cloud.mixed'
  | 'cheapLfs.manualUpload'
  | 'cheapLfs.manualUploadStarting'
  | 'cheapLfs.cancel'
  | 'cheapLfs.cancelConfirmation'
  | 'cheapLfs.progress.amendSuffix'
  | 'cheapLfs.progress.preparing'
  | 'cheapLfs.progress.hashing'
  | 'cheapLfs.progress.release'
  | 'cheapLfs.progress.uploadStarting'
  | 'cheapLfs.progress.uploading'
  | 'cheapLfs.progress.verifying'
  | 'cheapLfs.progress.manualPreparing'
  | 'cheapLfs.progress.manualWaiting'
  | 'cheapLfs.progress.manualVerifying'
  | 'cheapLfs.progress.manualDetected'
  | 'cheapLfs.progress.terminalTitle'
  | 'cheapLfs.progress.terminalCurrentFile'
  | 'cheapLfs.progress.terminalFiles'
  | 'cheapLfs.progress.terminalFilesDetailed'
  | 'cheapLfs.progress.terminalFailuresLabel'
  | 'cheapLfs.progress.terminalFailedFile'
  | 'cheapLfs.progress.terminalFailedFileWithStatus'
  | 'cheapLfs.progress.terminalFailedFileNoReason'
  | 'cheapLfs.progress.terminalFailuresOmitted'
  | 'cheapLfs.progress.terminalBytes'
  | 'cheapLfs.progress.terminalFileBytes'
  | 'cheapLfs.progress.terminalBytesPending'
  | 'cheapLfs.progress.terminalActivity'
  | 'cheapLfs.progress.terminalAwaitingAction'
  | 'cheapLfs.progress.terminalManualVerification'
  | 'cheapLfs.progress.terminalManualComplete'
  | 'cheapLfs.progress.terminalObservedElapsed'
  | 'cheapLfs.progress.terminalTiming'
  | 'cheapLfs.progress.terminalRatePending'
  | 'cheapLfs.progress.terminalEtaPending'
  | 'cheapLfs.progress.terminalProgressLabel'
  | 'cheapLfs.progress.terminalStorageSelected'
  | 'cheapLfs.progress.terminalStorage'
  | 'cheapLfs.progress.terminalStorageMatched'
  | 'cheapLfs.progress.terminalLayer'
  | 'cheapLfs.progress.terminalLayers'
  | 'cheapLfs.progress.terminalProviderGit'
  | 'cheapLfs.progress.terminalProviderUnknown'
  | 'cheapLfs.progress.terminalReasonOrdinaryGit'
  | 'cheapLfs.progress.terminalReasonSingleRelease'
  | 'cheapLfs.progress.terminalReasonGhcr'
  | 'cheapLfs.progress.terminalReasonDockerHub'
  | 'cheapLfs.progress.terminalReasonReleaseFallback'
  | 'cheapLfs.progress.terminalStagePreparing'
  | 'cheapLfs.progress.terminalStageHashing'
  | 'cheapLfs.progress.terminalStageRelease'
  | 'cheapLfs.progress.terminalStageUploading'
  | 'cheapLfs.progress.terminalStageVerifying'
  | 'cheapLfs.progress.terminalStageManualPreparing'
  | 'cheapLfs.progress.terminalStageManualWaiting'
  | 'cheapLfs.progress.terminalStageManualVerifying'
  | 'cheapLfs.progress.terminalStageManualDetected'
  | 'cheapLfs.settings.autoMaterialize'
  | 'cheapLfs.settings.autoPin'
  | 'cheapLfs.settings.autoPinHelp'
  | 'cheapLfs.settings.cloneHelper'
  | 'cheapLfs.settings.cloneHelperHelp'
  | 'cheapLfs.settings.summary'
  | 'cheapLfs.settings.parallelUploads'
  | 'cheapLfs.settings.parallelUploadsHelp'
  | 'cheapLfs.settings.ghcrStorage'
  | 'cheapLfs.settings.ghcrStorageHelp'
  | 'cheapLfs.settings.storageProvider'
  | 'cheapLfs.settings.storageRelease'
  | 'cheapLfs.settings.storageGhcr'
  | 'cheapLfs.settings.storageDockerHub'
  | 'cheapLfs.encryption.title'
  | 'cheapLfs.encryption.toggle'
  | 'cheapLfs.encryption.help'
  | 'cheapLfs.encryption.metadataNotice'
  | 'cheapLfs.encryption.statusChecking'
  | 'cheapLfs.encryption.statusSaved'
  | 'cheapLfs.encryption.statusMissing'
  | 'cheapLfs.encryption.statusUnavailable'
  | 'cheapLfs.encryption.setPassword'
  | 'cheapLfs.encryption.changePassword'
  | 'cheapLfs.encryption.forgetPassword'
  | 'cheapLfs.encryption.saved'
  | 'cheapLfs.encryption.notSaved'
  | 'cheapLfs.encryption.saveUnavailable'
  | 'cheapLfs.encryption.forgot'
  | 'cheapLfs.encryption.forgetMissing'
  | 'cheapLfs.encryption.forgetUnavailable'
  | 'cheapLfs.encryption.dialog.encryptTitle'
  | 'cheapLfs.encryption.dialog.commitTitle'
  | 'cheapLfs.encryption.dialog.decryptTitle'
  | 'cheapLfs.encryption.dialog.changeTitle'
  | 'cheapLfs.encryption.dialog.forgetTitle'
  | 'cheapLfs.encryption.dialog.staleForgetTitle'
  | 'cheapLfs.encryption.dialog.encryptDescription'
  | 'cheapLfs.encryption.dialog.commitDescription.plain'
  | 'cheapLfs.encryption.dialog.commitDescription.light'
  | 'cheapLfs.encryption.dialog.commitDescription.playful'
  | 'cheapLfs.encryption.dialog.commitDescription.maximum'
  | 'cheapLfs.encryption.dialog.decryptDescription'
  | 'cheapLfs.encryption.dialog.changeDescription'
  | 'cheapLfs.encryption.dialog.forgetDescription'
  | 'cheapLfs.encryption.dialog.staleForgetDescription'
  | 'cheapLfs.encryption.dialog.irreversibleWarning'
  | 'cheapLfs.encryption.dialog.password'
  | 'cheapLfs.encryption.dialog.confirmPassword'
  | 'cheapLfs.encryption.dialog.remember'
  | 'cheapLfs.encryption.dialog.rememberHelp'
  | 'cheapLfs.encryption.dialog.irreversibleAck'
  | 'cheapLfs.encryption.dialog.forgetAck'
  | 'cheapLfs.encryption.dialog.staleForgetAck'
  | 'cheapLfs.encryption.dialog.passwordRequired'
  | 'cheapLfs.encryption.dialog.passwordMismatch'
  | 'cheapLfs.encryption.dialog.continue'
  | 'cheapLfs.encryption.dialog.forget'
  | 'cheapLfs.encryption.dialog.cancel'
  | 'password.visibilityToggle'
  | 'remoteVerification.warningTitle'
  | 'remoteVerification.warningBody'
  | 'remoteVerification.changeUrl'
  | 'ignoredSubmodule.dialogTitle'
  | 'ignoredSubmodule.openAction'
  | 'ignoredSubmodule.openTooltip'
  | 'ignoredSubmodule.intro.plain'
  | 'ignoredSubmodule.intro.light'
  | 'ignoredSubmodule.intro.playful'
  | 'ignoredSubmodule.intro.maximum'
  | 'ignoredSubmodule.reviewLead.plain'
  | 'ignoredSubmodule.reviewLead.light'
  | 'ignoredSubmodule.reviewLead.playful'
  | 'ignoredSubmodule.reviewLead.maximum'
  | 'ignoredSubmodule.loading'
  | 'ignoredSubmodule.loadFailed'
  | 'ignoredSubmodule.empty'
  | 'ignoredSubmodule.truncated'
  | 'ignoredSubmodule.searchLabel'
  | 'ignoredSubmodule.searchPlaceholder'
  | 'ignoredSubmodule.searchTarget'
  | 'ignoredSubmodule.noMatches'
  | 'ignoredSubmodule.filterCount'
  | 'ignoredSubmodule.regexError'
  | 'ignoredSubmodule.listLabel'
  | 'ignoredSubmodule.proof'
  | 'ignoredSubmodule.fileMeta'
  | 'ignoredSubmodule.selectAll'
  | 'ignoredSubmodule.clearSelection'
  | 'ignoredSubmodule.selectionSummary'
  | 'ignoredSubmodule.destinationLabel'
  | 'ignoredSubmodule.destinationHelp'
  | 'ignoredSubmodule.reviewAction'
  | 'ignoredSubmodule.reviewHeading'
  | 'ignoredSubmodule.reviewDestination'
  | 'ignoredSubmodule.reviewFilesHeading'
  | 'ignoredSubmodule.willHeading'
  | 'ignoredSubmodule.willCopy'
  | 'ignoredSubmodule.willCreate'
  | 'ignoredSubmodule.willAdd'
  | 'ignoredSubmodule.willKeep'
  | 'ignoredSubmodule.willRecover'
  | 'ignoredSubmodule.wontHeading'
  | 'ignoredSubmodule.wontUpload'
  | 'ignoredSubmodule.wontRemote'
  | 'ignoredSubmodule.wontPointer'
  | 'ignoredSubmodule.wontCommit'
  | 'ignoredSubmodule.wontReplace'
  | 'ignoredSubmodule.confirmAction'
  | 'ignoredSubmodule.backAction'
  | 'ignoredSubmodule.cancelAction'
  | 'ignoredSubmodule.doneAction'
  | 'ignoredSubmodule.progressHeading'
  | 'ignoredSubmodule.progressStatus'
  | 'ignoredSubmodule.progressLabel'
  | 'ignoredSubmodule.successHeading'
  | 'ignoredSubmodule.successDescription'
  | 'ignoredSubmodule.rejectedHeading'
  | 'ignoredSubmodule.rejectedRow'
  | 'ignoredSubmodule.failedHeading'
  | 'ignoredSubmodule.recoveryRetained'
  | 'ignoredSubmodule.notification.startedTitle'
  | 'ignoredSubmodule.notification.startedBody'
  | 'ignoredSubmodule.notification.succeededTitle'
  | 'ignoredSubmodule.notification.succeededBody'
  | 'ignoredSubmodule.notification.failedTitle'
  | 'ignoredSubmodule.notification.failedBody'
  | 'ignoredSubmodule.reason.notProvenIgnored'
  | 'ignoredSubmodule.reason.symbolicLink'
  | 'ignoredSubmodule.reason.reparsePoint'
  | 'ignoredSubmodule.reason.notRegularFile'
  | 'ignoredSubmodule.reason.gitControlPath'
  | 'ignoredSubmodule.reason.nestedRepository'
  | 'ignoredSubmodule.reason.pathEscape'
  | 'ignoredSubmodule.reason.duplicateSelection'
  | 'ignoredSubmodule.reason.destinationCollision'
  | 'ignoredSubmodule.reason.insideDestination'
  | 'ignoredSubmodule.reason.staleInventory'
  | 'ignoredSubmodule.destination.empty'
  | 'ignoredSubmodule.destination.absolute'
  | 'ignoredSubmodule.destination.segments'
  | 'ignoredSubmodule.destination.gitControlPath'
  | 'ignoredSubmodule.destination.existingSubmodule'
  | 'ignoredSubmodule.destination.repositoryRoot'
  | 'ignoredSubmodule.destination.unsafeLink'
  | 'ignoredSubmodule.destination.occupied'
  | 'ignoredSubmodule.destination.ignored'
  | 'githubReleases.compactTools'
  | 'githubReleases.compactSummary'
  | 'githubReleases.statsSummaryLabel'
  | 'githubReleases.statsSummary'
  | 'githubPackages.scopeRecovery'
  | 'githubPackages.signInAgain'
  | 'githubReleases.filterSummary'
  | 'githubReleases.dismissDownload'
  | 'githubReleases.metadataLabel'
  | 'githubReleases.metadataSummary'
  | 'githubReleases.openFile'
  | 'githubReleases.showInFolder'
  | 'githubReleases.openFileError'
  | 'githubReleases.loadAll'
  | 'githubReleases.loadAllBusy'
  | 'githubReleases.loadAllProgress'
  | 'githubReleases.loadAllComplete'
  | 'githubReleases.loadAllTruncated'
  | 'githubReleases.loadAllRateLimited'
  | 'githubReleases.loadAllFailed'
  | 'githubReleases.loadAllCanceled'
  | 'githubReleases.bulkDeleteReview'
  | 'githubReleases.bulkDeleteProgressLabel'
  | 'githubReleases.bulkDeleteProgress'
  | 'githubReleases.bulkDeleteStop'
  | 'githubReleases.bulkDeleteStopping'
  | 'githubReleases.bulkDeleteSummary'
  | 'githubReleases.bulkDeleteSummaryStopped'
  | 'githubReleases.bulkDeleteFailures'
  | 'githubReleases.bulkDeleteFailure'
  | 'githubReleases.bulkDeleteFailuresOmitted'
  | 'githubReleases.silentInstall'
  | 'githubReleases.silentInstallAttempt'
  | 'githubReleases.silentInstallRunning'
  | 'githubReleases.silentInstallSucceeded'
  | 'githubReleases.silentInstallFailed'
  | 'githubReleases.silentInstallLaunchFailed'
  | 'githubReleases.silentInstallOutput'
  | 'githubReleases.silentInstallRefusedMissing'
  | 'githubReleases.silentInstallRefusedNotAFile'
  | 'githubReleases.silentInstallRefusedSize'
  | 'githubReleases.silentInstallRefusedName'
  | 'githubReleases.silentInstallRefusedKind'
  | 'githubReleases.silentInstallRefusedPlatform'
  | 'githubReleases.sortLabel'
  | 'githubReleases.sortNewest'
  | 'githubReleases.sortOldest'
  | 'cheapLfs.pinFailures.title'
  | 'cheapLfs.pinFailures.one'
  | 'cheapLfs.pinFailures.many'
  | 'cheapLfs.pinFailures.manyOmitted'
  | 'cheapLfs.pinFailures.reason'
  | 'cheapLfs.pinFailures.reasonWithStatus'
  | 'cheapLfs.alreadyStored.title'
  | 'cheapLfs.alreadyStored.one'
  | 'cheapLfs.alreadyStored.many'
  | 'cheapLfs.alreadyStored.manyOmitted'
  | 'cheapLfs.firstPublish.noRepository'
  | 'cheapLfs.firstPublish.noRemote'
  | 'cheapLfs.firstPublish.detachedHead'
  | 'cheapLfs.firstPublish.unbornBranch'
  | 'cheapLfs.firstPublish.publishFailed'
  | 'cheapLfs.firstPublish.reasonWithDetail'
  | 'cheapLfs.firstPublish.abortTitle'
  | 'cheapLfs.unattendedEncryption.title'
  | 'cheapLfs.unattendedEncryption.reason'
  | 'cheapLfs.unattendedEncryption.body.plain'
  | 'cheapLfs.unattendedEncryption.body.light'
  | 'cheapLfs.unattendedEncryption.body.playful'
  | 'cheapLfs.unattendedEncryption.body.maximum'
  | 'cheapLfs.localState.pointer'
  | 'cheapLfs.localState.materialized'
  | 'cheapLfs.localState.modified'
  | 'actionsMetadata.tooLarge.title'
  | 'actionsMetadata.tooLarge.body'
  | 'actionsArtifacts.searchPlaceholder'
  | 'actionsArtifacts.searchAriaLabel'
  | 'actionsArtifacts.regexTarget'
  | 'actionsArtifacts.filterCount'
  | 'actionsArtifacts.noMatches'
  | 'commit.postCommitMaintenance.title'
  | 'commit.postCommitMaintenance.body'
  | 'push.commitBatch.message'
  | 'push.commitBatch.completedTitle'
  | 'push.commitBatch.existingBody'
  | 'push.commitBatch.rewrittenBody'
  | 'changesFilter.cheapLfsCandidates'
  | 'changesFilter.filtersAriaLabel'
  | 'workflowDispatch.searchPlaceholder'
  | 'workflowDispatch.searchAriaLabel'
  | 'workflowDispatch.listAriaLabel'
  | 'workflowDispatch.empty'
  | 'workflowDispatch.noMatches'
  | 'workflowDispatch.stateActive'
  | 'workflowDispatch.stateDisabled'
  | 'publish.organization.label'
  | 'publish.organization.searchPlaceholder'
  | 'publish.organization.searchAriaLabel'
  | 'publish.organization.listAriaLabel'
  | 'publish.organization.none'
  | 'publish.organization.resultCountOne'
  | 'publish.organization.resultCountMany'
  | 'publish.organization.noMatches'
  | 'publish.organization.selectedHint'
  | 'publish.organization.regexErrorPrefix'
  | 'publish.organization.loadError'
  | 'publish.organization.retry'
  | 'publish.authentication.signInAgain'
  | 'publish.authentication.signInAgainMessage'
  | 'settingsSearch.inputLabel'
  | 'settingsSearch.inputPlaceholder'
  | 'settingsSearch.resultsHeading'
  | 'settingsSearch.noResults'
  | 'settingsSearch.resultCountOne'
  | 'settingsSearch.resultCountMany'
  | 'settingsSearch.inTab'
  | 'settingsSearch.clear'
  | 'settingsSearch.jumpHint'
  | 'settingsSearch.tabName.accounts'
  | 'settingsSearch.tabName.integrations'
  | 'settingsSearch.tabName.copilot'
  | 'settingsSearch.tabName.git'
  | 'settingsSearch.tabName.appearance'
  | 'settingsSearch.tabName.notifications'
  | 'settingsSearch.tabName.prompts'
  | 'settingsSearch.tabName.advanced'
  | 'settingsSearch.tabName.accessibility'
  | 'settingsSearch.tabName.agentAccess'
  | 'settingsSearch.tabName.selfHostedServer'
  | 'settingsSearch.tabName.automation'
  | 'settingsSearch.tabName.queue'
  | 'settingsSearch.tabName.sound'
  | 'settingsSearch.tabName.ollama'
  | 'settingsSearch.tabName.ai'
  | 'settingsSearch.tabName.attention'
  | 'settingsSearch.entry.attentionFocus.title'
  | 'settingsSearch.entry.attentionFocus.desc'
  | 'settingsSearch.entry.attentionLowStimulation.title'
  | 'settingsSearch.entry.attentionLowStimulation.desc'
  | 'settingsSearch.entry.attentionTimeAwareness.title'
  | 'settingsSearch.entry.attentionTimeAwareness.desc'
  | 'settingsSearch.entry.attentionOneThing.title'
  | 'settingsSearch.entry.attentionOneThing.desc'
  | 'settingsSearch.entry.attentionMomentum.title'
  | 'settingsSearch.entry.attentionMomentum.desc'
  | 'settingsSearch.entry.aiMasterSwitch.title'
  | 'settingsSearch.entry.aiMasterSwitch.desc'
  | 'settingsSearch.entry.aiRepositoryEligibility.title'
  | 'settingsSearch.entry.aiRepositoryEligibility.desc'
  | 'settingsSearch.entry.accountsSignIn.title'
  | 'settingsSearch.entry.accountsSignIn.desc'
  | 'settingsSearch.entry.accountsEnterprise.title'
  | 'settingsSearch.entry.accountsEnterprise.desc'
  | 'settingsSearch.entry.copilotModels.title'
  | 'settingsSearch.entry.copilotModels.desc'
  | 'settingsSearch.entry.copilotConflict.title'
  | 'settingsSearch.entry.copilotConflict.desc'
  | 'settingsSearch.entry.gitName.title'
  | 'settingsSearch.entry.gitName.desc'
  | 'settingsSearch.entry.gitEmail.title'
  | 'settingsSearch.entry.gitEmail.desc'
  | 'settingsSearch.entry.gitDefaultBranch.title'
  | 'settingsSearch.entry.gitDefaultBranch.desc'
  | 'settingsSearch.entry.appearanceTheme.title'
  | 'settingsSearch.entry.appearanceLanguageMode.title'
  | 'settingsSearch.entry.appearanceLanguageMode.desc'
  | 'settingsSearch.entry.appearanceTone.title'
  | 'settingsSearch.entry.appearanceTone.desc'
  | 'settingsSearch.entry.appearanceTheme.desc'
  | 'settingsSearch.entry.appearanceAccent.title'
  | 'settingsSearch.entry.appearanceAccent.desc'
  | 'settingsSearch.entry.appearanceFont.title'
  | 'settingsSearch.entry.appearanceFont.desc'
  | 'settingsSearch.entry.appearanceZoom.title'
  | 'settingsSearch.entry.appearanceZoom.desc'
  | 'settingsSearch.entry.notificationsErrorStyle.title'
  | 'settingsSearch.entry.notificationsErrorStyle.desc'
  | 'settingsSearch.entry.promptsDiscard.title'
  | 'settingsSearch.entry.promptsDiscard.desc'
  | 'settingsSearch.entry.promptsForcePush.title'
  | 'settingsSearch.entry.promptsForcePush.desc'
  | 'settingsSearch.entry.promptsRemoveRepo.title'
  | 'settingsSearch.entry.promptsRemoveRepo.desc'
  | 'settingsSearch.entry.advancedOpenSSH.title'
  | 'settingsSearch.entry.advancedOpenSSH.desc'
  | 'settingsSearch.entry.accessibilityUnderline.title'
  | 'settingsSearch.entry.accessibilityUnderline.desc'
  | 'settingsSearch.entry.accessibilityDiffMarks.title'
  | 'settingsSearch.entry.accessibilityDiffMarks.desc'
  | 'settingsSearch.entry.agentAccessServer.title'
  | 'settingsSearch.entry.agentAccessServer.desc'
  | 'settingsSearch.entry.selfHostedServer.title'
  | 'settingsSearch.entry.selfHostedServer.desc'
  | 'settingsSearch.entry.queueMode.desc'
  | 'settingsSearch.entry.ollamaManager.title'
  | 'settingsSearch.entry.ollamaManager.desc'
  | 'settingsSearch.entry.ollamaChat.title'
  | 'settingsSearch.entry.ollamaChat.desc'
  | 'settingsSearch.entry.selfHostedServer.title'
  | 'settingsSearch.entry.selfHostedServer.desc'
  | 'settingsSearch.entry.gitGlobalIgnore.title'
  | 'settingsSearch.entry.gitGlobalIgnore.desc'
  | 'settingsSearch.entry.gitHooks.title'
  | 'settingsSearch.entry.gitHooks.desc'
  | 'repositorySettings.buildRunTab'
  | 'repositorySettings.cheapLfsTab'
  | 'repositorySettings.automationTab'
  | 'repositorySettings.appearanceTab'
  | 'repositorySettings.searchLabel'
  | 'repositorySettings.appearance.intro'
  | 'repositorySettings.appearance.introHint'
  | 'repositorySettings.appearance.loading'
  | 'repositorySettings.appearance.unavailable'
  | 'repositorySettings.appearance.loadFailed'
  | 'repositorySettings.appearance.saveFailed'
  | 'repositorySettings.appearance.workspaceSection'
  | 'repositorySettings.appearance.toolbarSection'
  | 'repositorySettings.appearance.tabsSection'
  | 'repositorySettings.appearance.listNameSection'
  | 'repositorySettings.appearance.logoSection'
  | 'repositorySettings.appearance.inheriting'
  | 'repositorySettings.appearance.overridden'
  | 'repositorySettings.appearance.reset'
  | 'repositorySettings.appearance.resetAccessibleName'
  | 'repositorySettings.appearance.history'
  | 'repositorySettings.appearance.historyAccessibleName'
  | 'repositorySettings.appearance.previewLabel'
  | 'repositorySettings.appearance.previewDescription'
  | 'repositorySettings.appearance.resolvedAccent'
  | 'repositorySettings.appearance.resolvedSurface'
  | 'repositorySettings.appearance.resolvedLabels'
  | 'repositorySettings.appearance.resolvedDensity'
  | 'repositorySettings.appearance.resolvedWidth'
  | 'repositorySettings.appearance.inheritedSuffix'
  | 'repositorySettings.appearance.overriddenSuffix'
  | 'repositorySettings.appearance.listNameInherits'
  | 'repositorySettings.appearance.logoInherits'
  | 'githubApi.railLabel'
  | 'cheapLfs.settings.sectionHeading'
  | 'cheapLfs.cloneHelper.conflictTitle'
  | 'cheapLfs.cloneHelper.conflictBody'
  | 'cheapLfs.cloneHelper.failureTitle'
  | 'cheapLfs.cloneHelper.failureBody'
  | 'cheapLfs.cloneSelection.rejectedTitle'
  | 'cheapLfs.cloneSelection.rejectedBody'
  | 'gitAutoFix.fixIt'
  | 'gitAutoFix.staleIndexLock.title'
  | 'gitAutoFix.staleIndexLock.summary'
  | 'gitAutoFix.staleIndexLock.action'
  | 'gitAutoFix.autoGcRetry.title'
  | 'gitAutoFix.autoGcRetry.summary'
  | 'gitAutoFix.pushNonFastForward.title'
  | 'gitAutoFix.pushNonFastForward.summary'
  | 'gitAutoFix.pushForbiddenGithubCli.title'
  | 'gitAutoFix.pushForbiddenGithubCli.summary'
  | 'gitAutoFix.detachedHeadRescueBranch.title'
  | 'gitAutoFix.detachedHeadRescueBranch.summary'
  | 'gitAutoFix.detachedHeadRescueBranch.action'
  | 'gitAutoFix.unknown.title'
  | 'gitAutoFix.unknown.summary'
  | 'gitAutoFix.unknown.action'
  | 'gitAutoFix.rescueBranch.successTitle'
  | 'gitAutoFix.rescueBranch.successBody'
  | 'gitAutoFix.rescueBranch.failureTitle'
  | 'gitAutoFix.rescueBranch.failureBody'
  | 'largeRepo.settings.title'
  | 'largeRepo.settings.autoDetect'
  | 'largeRepo.settings.autoDetectDescription'
  | 'largeRepo.settings.autoRepack'
  | 'largeRepo.settings.autoRepackDescription'
  | 'largeRepo.status.computing'
  | 'largeRepo.repack.progressTitle'
  | 'largeRepo.repack.progressBody'
  | 'largeRepo.repack.successTitle'
  | 'largeRepo.repack.successBody'
  | 'largeRepo.repack.failedTitle'
  | 'largeRepo.repack.failedBody'
  | 'largeRepo.lock.removedTitle'
  | 'largeRepo.lock.removedBody'
  | 'largeRepo.missing.title'
  | 'largeRepo.missing.body'
  | 'largeRepo.missing.locate'
  | 'largeRepo.missing.remove'
  | 'largeRepo.nestedGit.title'
  | 'largeRepo.nestedGit.body'
  | 'largeRepo.nestedGit.confirm'
  | 'largeRepo.nestedGit.cancel'
  | 'settingsSearch.entry.largeRepoAutoDetect.title'
  | 'settingsSearch.entry.largeRepoAutoDetect.desc'
  | 'settingsSearch.entry.largeRepoAutoRepack.title'
  | 'settingsSearch.entry.largeRepoAutoRepack.desc'
  | 'accountFallback.searching'
  | 'accountFallback.usingAccount'
  | 'accountFallback.switchedTitle'
  | 'accountFallback.switchedBody'
  | 'accountFallback.askTitle'
  | 'accountFallback.askBody'
  | 'accountFallback.askAction'
  | 'accountFallback.notFoundTitle'
  | 'accountFallback.notFoundBody'
  | 'accountFallback.notFoundNoAccounts'
  | 'accountFallback.triedAccounts'
  | 'shallowHistory.progress.label'
  | 'shallowHistory.progress.contacting'
  | 'shallowHistory.progress.step'
  | 'shallowHistory.progress.detail'
  | 'shallowHistory.progress.valueText'
  | 'shallowHistory.progress.valueTextCounted'
  | 'tagLifecycle.progressLabel'
  | 'tagLifecycle.workingStatus'
  | 'tagLifecycle.refreshingStatus'
  | 'tagLifecycle.creatingStatus'
  | 'tagLifecycle.movingStatus'
  | 'tagLifecycle.deletingLocalStatus'
  | 'tagLifecycle.pushingStatus'
  | 'tagLifecycle.pushingAllStatus'
  | 'tagLifecycle.fetchingStatus'
  | 'tagLifecycle.fetchingPrunedStatus'
  | 'tagLifecycle.deletingRemoteStatus'
  | 'remoteManager.applyProgressLabel'
  | 'remoteManager.applyProgressStatus'
  | 'remoteManager.applyProgressPreparing'
  | 'bulkBranchDelete.progressLabel'
  | 'bulkBranchDelete.progressStatus'
  | 'bulkBranchDelete.progressCurrent'
  | 'subtree.splitProgressLabel'
  | 'subtree.splitProgressCommits'
  | 'bisect.progressLabel'
  | 'bisect.progressStarting'
  | 'bisect.progressMarking'
  | 'bisect.progressResetting'
  | 'bisect.progressLogLabel'
  | 'commitRewrite.progressLabel'
  | 'commitRewrite.progressStatus'
  | 'commitRewrite.progressPreparing'
  | 'commit.maintenance.repacking'
  | 'commit.maintenance.repackingLabel'
  | 'ollama.manager.operationProgressLabel'
  | 'ollama.manager.operationLoading'
  | 'ollama.manager.operationUnloading'
  | 'ollama.manager.operationDeleting'
  | 'ollama.manager.operationCopying'
  | 'ollama.manager.operationRenaming'
  | 'ollama.manager.operationCancelled'
  | 'addRepositories.progressLabel'
  | 'addRepositories.progressStatus'
  | 'notificationCentre.bulkProgressLabel'
  | 'notificationCentre.bulkProgressStatus'
  | 'notificationCentre.clearAllProgressStatus'
  | 'regex.error.patternTooLong'
  | 'regex.error.inputTooLong'
  | 'regex.error.invalidOrUnsupported'
  | 'regex.error.unknown'
  | 'dateRange.from'
  | 'dateRange.to'
  | 'dateRange.presetsLabel'
  | 'dateRange.calendarLabel'
  | 'dateRange.month'
  | 'dateRange.year'
  | 'dateRange.previousMonth'
  | 'dateRange.nextMonth'
  | 'dateRange.preset.all'
  | 'dateRange.preset.last7'
  | 'dateRange.preset.last30'
  | 'dateRange.preset.last90'
  | 'dateRange.preset.thisYear'
  | 'dateRange.preset.lastYear'
  | 'dateRange.error.incomplete'
  | 'dateRange.error.outOfRange'
  | 'dateRange.error.unrecognized'
  | 'changelog.title'
  | 'changelog.searchPlaceholder'
  | 'changelog.searchLabel'
  | 'changelog.dateFilter'
  | 'changelog.dateFilterActive'
  | 'changelog.openCommit'
  | 'changelog.categories'
  | 'changelog.categoryAll'
  | 'changelog.uncategorized'
  | 'changelog.copy'
  | 'changelog.copied'
  | 'changelog.export'
  | 'changelog.exportMarkdown'
  | 'changelog.exportText'
  | 'changelog.exported'
  | 'changelog.exportFailed'
  | 'changelog.copyFailed'
  | 'changelog.reset'
  | 'changelog.close'
  | 'changelog.showMore'
  | 'changelog.currentVersion'
  | 'changelog.dateUnrecorded'
  | 'changelog.noChanges'
  | 'changelog.includeUndated'
  | 'changelog.undatedHidden'
  | 'changelog.summary.plain'
  | 'changelog.summary.light'
  | 'changelog.summary.playful'
  | 'changelog.summary.maximum'
  | 'changelog.empty.plain'
  | 'changelog.empty.light'
  | 'changelog.empty.playful'
  | 'changelog.empty.maximum'
  // The in-app offline documentation browser. Only its framing carries funny
  // bands: an article's title, its category, its source path and the prose
  // itself are the documentation's own words, and they read identically at
  // every level in every mode.
  | 'docsBrowser.title'
  | 'docsBrowser.close'
  | 'docsBrowser.searchPlaceholder'
  | 'docsBrowser.searchField'
  | 'docsBrowser.categoriesLabel'
  | 'docsBrowser.categoryAll'
  | 'docsBrowser.category.agentApi'
  | 'docsBrowser.category.collaboration'
  | 'docsBrowser.category.designSystem'
  | 'docsBrowser.category.identityAndWorkspace'
  | 'docsBrowser.category.integrations'
  | 'docsBrowser.category.linuxTui'
  | 'docsBrowser.category.qualityAndReliability'
  | 'docsBrowser.category.repositoryManagement'
  | 'docsBrowser.category.reviewAndDiff'
  | 'docsBrowser.category.root'
  | 'docsBrowser.listLabel'
  | 'docsBrowser.articleLabel'
  | 'docsBrowser.sourcePath'
  | 'docsBrowser.selectArticle'
  | 'docsBrowser.selectionCount'
  | 'docsBrowser.selectAllMatches'
  | 'docsBrowser.selectAllArticles'
  | 'docsBrowser.invertSelection'
  | 'docsBrowser.clearSelection'
  | 'docsBrowser.selectionHint'
  | 'docsBrowser.export'
  | 'docsBrowser.exportMenuLabel'
  | 'docsBrowser.exportMarkdown'
  | 'docsBrowser.exportText'
  | 'docsBrowser.exportJson'
  | 'docsBrowser.exported'
  | 'docsBrowser.exportFailed'
  | 'docsBrowser.exportEmpty'
  | 'docsBrowser.deleteLabel'
  | 'docsBrowser.deleteUnavailable'
  | 'docsBrowser.linkUnbundled'
  | 'docsBrowser.linkSection'
  | 'docsBrowser.linkOpened'
  | 'docsBrowser.linkUnreadable'
  | 'docsBrowser.linkExternal'
  | 'docsBrowser.searchInvalid'
  | 'docsBrowser.resetSearch'
  | 'docsBrowser.offlineNote'
  | 'docsBrowser.summary.plain'
  | 'docsBrowser.summary.light'
  | 'docsBrowser.summary.playful'
  | 'docsBrowser.summary.maximum'
  | 'docsBrowser.empty.plain'
  | 'docsBrowser.empty.light'
  | 'docsBrowser.empty.playful'
  | 'docsBrowser.empty.maximum'
  | 'palette.docsBrowser'
  | 'palette.docsBrowserDescription'
  | 'commandPalette.groupDocumentation'
  // The dim sum surprise. Only the framing carries bands: the dish's own name,
  // its romanization and the picture's description are facts the card exists
  // to state, and they read identically at every level in every mode.
  | 'dimSum.region'
  | 'dimSum.dismiss'
  | 'dimSum.romanization'
  | 'dimSum.title.plain'
  | 'dimSum.title.light'
  | 'dimSum.title.playful'
  | 'dimSum.title.maximum'
  | 'dimSum.lead.plain'
  | 'dimSum.lead.light'
  | 'dimSum.lead.playful'
  | 'dimSum.lead.maximum'
  | 'contextMenu.filterPlaceholder'
  | 'contextMenu.filterLabel'
  | 'contextMenu.empty'
  | 'contextMenu.shortcut'
  | 'contextMenu.cut'
  | 'contextMenu.copy'
  | 'contextMenu.paste'
  | 'contextMenu.selectAll'
  | 'filter.mode.fuzzy'
  | 'filter.mode.substring'
  | 'filter.mode.regex'
  | 'filter.mode.cycleLabel'
  | 'filter.case.match'
  | 'filter.regexBuilder.open'
  | 'filter.regexBuilder.label'
  | 'filter.regexBuilder.literalCategory'
  | 'filter.regexBuilder.literalField'
  | 'filter.regexBuilder.literalPlaceholder'
  | 'filter.regexBuilder.literalInsert'
  | 'filter.regexBuilder.literalPreview'
  | 'branch.filter.notUpdatedWith'
  | 'regex.builder.viewsLabel'
  | 'regex.builder.view.build'
  | 'regex.builder.view.guide'
  | 'regex.builder.title'
  | 'regex.builder.description'
  | 'regex.builder.close'
  | 'regex.builder.patternLabel'
  | 'regex.builder.patternPlaceholder'
  | 'regex.builder.deleteLast'
  | 'regex.builder.clear'
  | 'regex.builder.flag.ignoreCase'
  | 'regex.builder.cancel'
  | 'regex.builder.apply'
  | 'regex.builder.categoriesLabel'
  | 'regex.builder.category.anchors'
  | 'regex.builder.category.characterClasses'
  | 'regex.builder.category.quantifiers'
  | 'regex.builder.category.groups'
  | 'regex.builder.category.alternation'
  | 'regex.builder.token.start'
  | 'regex.builder.token.end'
  | 'regex.builder.token.wordBoundary'
  | 'regex.builder.token.nonBoundary'
  | 'regex.builder.token.anyCharacter'
  | 'regex.builder.token.digit'
  | 'regex.builder.token.nonDigit'
  | 'regex.builder.token.wordCharacter'
  | 'regex.builder.token.nonWordCharacter'
  | 'regex.builder.token.whitespace'
  | 'regex.builder.token.nonWhitespace'
  | 'regex.builder.token.anyOf'
  | 'regex.builder.token.noneOf'
  | 'regex.builder.token.range'
  | 'regex.builder.token.tab'
  | 'regex.builder.token.zeroOrMore'
  | 'regex.builder.token.oneOrMore'
  | 'regex.builder.token.optional'
  | 'regex.builder.token.exactlyThree'
  | 'regex.builder.token.twoOrMore'
  | 'regex.builder.token.betweenTwoAndFive'
  | 'regex.builder.token.lazyZeroOrMore'
  | 'regex.builder.token.lazyOneOrMore'
  | 'regex.builder.token.capturingGroup'
  | 'regex.builder.token.nonCapturingGroup'
  | 'regex.builder.token.namedGroup'
  | 'regex.builder.token.or'
  | 'regex.builder.token.aOrB'
  | 'regex.builder.guide.matching.title'
  | 'regex.builder.guide.matching.body'
  | 'regex.builder.guide.matching.note'
  | 'regex.builder.guide.anchors.title'
  | 'regex.builder.guide.anchors.body'
  | 'regex.builder.guide.anchors.note'
  | 'regex.builder.guide.classes.title'
  | 'regex.builder.guide.classes.body'
  | 'regex.builder.guide.classes.note'
  | 'regex.builder.guide.quantifiers.title'
  | 'regex.builder.guide.quantifiers.body'
  | 'regex.builder.guide.quantifiers.note'
  | 'regex.builder.guide.groups.title'
  | 'regex.builder.guide.groups.body'
  | 'regex.builder.guide.groups.note'
  | 'regex.builder.guide.alternation.title'
  | 'regex.builder.guide.alternation.body'
  | 'regex.builder.guide.alternation.note'
  | 'regex.builder.guide.flags.title'
  | 'regex.builder.guide.flags.body'
  | 'regex.builder.guide.usage.title'
  | 'regex.builder.guide.usage.body'
  | 'regex.test.heading'
  | 'regex.test.sampleLabel'
  | 'regex.test.capture.unmatched'
  | 'regex.test.capture.empty'
  | 'regex.test.capture.truncated'
  | 'regex.test.capture.groupLabel'
  | 'regex.test.capture.heading'
  | 'regex.test.capture.more'
  | 'regex.test.status.invalid'
  | 'regex.test.status.oneMatch'
  | 'regex.test.status.matches'
  | 'cheapLfs.stage.hashingLabel'
  | 'cheapLfs.stage.hashingStatus'
  | 'cheapLfs.stage.releaseLabel'
  | 'cheapLfs.stage.releaseStatus'
  | 'cheapLfs.restore.label'
  | 'cheapLfs.restore.status'
  | 'cheapLfs.restore.cancel'
  | 'cheapLfs.restore.canceling'
  | 'cheapLfs.restore.collapse'
  | 'cheapLfs.restore.expand'
  | 'cheapLfs.restore.title'
  | 'cheapLfs.restore.sectionLabel'
  | 'cheapLfs.restore.summary'
  | 'cheapLfs.restore.progressLabel'
  | 'cheapLfs.restore.progressValueText'
  | 'cheapLfs.restore.filesLabel'
  | 'cheapLfs.restore.filesValue'
  | 'cheapLfs.restore.logicalBytesLabel'
  | 'cheapLfs.restore.logicalBytesValue'
  | 'cheapLfs.restore.actualBytesLabel'
  | 'cheapLfs.restore.downloadWithTotal'
  | 'cheapLfs.restore.downloadWithoutTotal'
  | 'cheapLfs.restore.downloadTotalOnly'
  | 'cheapLfs.restore.notReported'
  | 'cheapLfs.restore.rateLabel'
  | 'cheapLfs.restore.rateValue'
  | 'cheapLfs.restore.ratePending'
  | 'cheapLfs.restore.etaLabel'
  | 'cheapLfs.restore.etaPending'
  | 'cheapLfs.restore.elapsedLabel'
  | 'cheapLfs.restore.queueLabel'
  | 'cheapLfs.restore.queueValue'
  | 'cheapLfs.restore.lookAheadStarts'
  | 'cheapLfs.restore.lookAheadStarting'
  | 'cheapLfs.restore.lookAheadActive'
  | 'cheapLfs.restore.lookAheadBoundary'
  | 'cheapLfs.restore.currentLane'
  | 'cheapLfs.restore.prefetchLane'
  | 'cheapLfs.restore.laneGroupLabel'
  | 'cheapLfs.restore.laneFile'
  | 'cheapLfs.restore.lanePart'
  | 'cheapLfs.restore.laneProgressLabel'
  | 'cheapLfs.restore.laneValueText'
  | 'cheapLfs.restore.laneValueIndeterminate'
  | 'cheapLfs.restore.laneBytes'
  | 'cheapLfs.restore.laneBytesWithoutTotal'
  | 'cheapLfs.restore.laneWaiting'
  | 'cheapLfs.restore.pathUnavailable'
  | 'cheapLfs.restore.failuresLabel'
  | 'cheapLfs.restore.failureReason'
  | 'cheapLfs.restore.failureReasonWithStatus'
  | 'cheapLfs.restore.failureUnknown'
  | 'cheapLfs.restore.failuresOmitted'
  | 'cheapLfs.restore.providerBadge'
  | 'cheapLfs.restore.phaseBadge'
  | 'cheapLfs.restore.provider.githubRelease'
  | 'cheapLfs.restore.provider.ghcr'
  | 'cheapLfs.restore.provider.dockerHub'
  | 'cheapLfs.restore.provider.mixed'
  | 'cheapLfs.restore.provider.unknown'
  | 'cheapLfs.restore.phase.preparing'
  | 'cheapLfs.restore.phase.downloading'
  | 'cheapLfs.restore.phase.decompressing'
  | 'cheapLfs.restore.phase.decrypting'
  | 'cheapLfs.restore.phase.decrypting.plain'
  | 'cheapLfs.restore.phase.decrypting.light'
  | 'cheapLfs.restore.phase.decrypting.playful'
  | 'cheapLfs.restore.phase.decrypting.maximum'
  | 'cheapLfs.restore.phase.verifying'
  | 'cheapLfs.restore.phase.materializing'
  | 'cheapLfs.restore.phase.canceling'
  | 'batchClone.finalizingLabel'
  | 'batchClone.finalizingStatus'
  | 'batchClone.restoringStatus'
  | 'accounts.metadataReadFailed'
  | 'accounts.metadataRepaired'
  | 'accounts.metadataWriteFailed'
  | 'accounts.keychainLocked'
  | 'accounts.tokenWriteFailed'
  | 'accounts.credentialUnavailable'
  | 'accounts.picker.label'
  | 'accounts.picker.choose'
  | 'accounts.picker.close'
  | 'accounts.picker.title'
  | 'accounts.picker.searchLabel'
  | 'accounts.picker.searchPlaceholder'
  | 'accounts.picker.countOne'
  | 'accounts.picker.countMany'
  | 'accounts.picker.matchCount'
  | 'accounts.picker.noAccounts'
  | 'accounts.picker.noMatch'
  | 'accounts.picker.add'
  | 'repositoryTransfer.importTitle'
  | 'repositoryTransfer.exportTitle'
  | 'repositoryTransfer.chooseList'
  | 'repositoryTransfer.fileFilterName'
  | 'repositoryTransfer.chooseFile'
  | 'repositoryTransfer.changeFile'
  | 'repositoryTransfer.baseDirectory'
  | 'repositoryTransfer.baseDirectoryPlaceholder'
  | 'repositoryTransfer.chooseDirectory'
  | 'repositoryTransfer.cloneMode'
  | 'repositoryTransfer.parallel'
  | 'repositoryTransfer.sequential'
  | 'repositoryTransfer.selectedOne'
  | 'repositoryTransfer.selectedMany'
  | 'repositoryTransfer.selectAtLeastOne'
  | 'repositoryTransfer.chooseBaseDirectory'
  | 'repositoryTransfer.invalidList'
  | 'repositoryTransfer.selectForImport'
  | 'repositoryTransfer.alreadyCloned'
  | 'repositoryTransfer.cloneOne'
  | 'repositoryTransfer.cloneMany'
  | 'repositoryTransfer.exportIntro'
  | 'repositoryTransfer.noRemote'
  | 'repositoryTransfer.skippedOne'
  | 'repositoryTransfer.skippedMany'
  | 'repositoryTransfer.selectForExport'
  | 'repositoryTransfer.exportOne'
  | 'repositoryTransfer.exportMany'
  | 'accounts.invalidatedTokenTitle'
  | 'accounts.invalidatedTokenTitleDarwin'
  | 'accounts.invalidatedTokenBody'
  | 'accounts.invalidatedTokenOthersKept'
  | 'accounts.invalidatedTokenPrompt'
  | 'accounts.invalidatedTokenSignIn'
  | 'accounts.invalidatedTokenLater'
  | 'agentSessions.sidebarLabel'
  | 'agentSessions.listTab'
  | 'agentSessions.agentsTab'
  | 'agentSessions.worktrees'
  | 'agentSessions.newSession'
  | 'agentSessions.empty'
  | 'agentSessions.locked'
  | 'agentSessions.missing'
  | 'agentSessions.detachedAt'
  | 'agentSessions.onBranch'
  | 'agentSessions.options'
  | 'agentSessions.baseBranch'
  | 'agentSessions.codingAgent'
  | 'agentSessions.taskLabel'
  | 'agentSessions.taskPlaceholder'
  | 'agentSessions.configureSetup'
  | 'agentSessions.setup.title'
  | 'agentSessions.setup.description'
  | 'agentSessions.setup.count.none'
  | 'agentSessions.setup.count.one'
  | 'agentSessions.setup.count.some'
  | 'agentSessions.setup.count.unavailable'
  | 'agentSessions.setup.unavailable'
  | 'agentSessions.setup.retryPlan.all'
  | 'agentSessions.setup.retryPlan.one'
  | 'agentSessions.setup.retryPlan.some'
  | 'agentSessions.setup.retryPlan.restart'
  | 'agentSessions.setup.restart'
  | 'agentSessions.setup.commandLabel'
  | 'agentSessions.setup.enabled'
  | 'agentSessions.setup.executable'
  | 'agentSessions.setup.argumentLabel'
  | 'agentSessions.setup.removeArgument'
  | 'agentSessions.setup.addArgument'
  | 'agentSessions.setup.moveUp'
  | 'agentSessions.setup.moveDown'
  | 'agentSessions.setup.removeCommand'
  | 'agentSessions.setup.addCommand'
  | 'agentSessions.setup.save'
  | 'agentSessions.setup.cancelRun'
  | 'agentSessions.setup.problem.tooManyCommands'
  | 'agentSessions.setup.problem.missingArgument'
  | 'agentSessions.setup.problem.emptyArgument'
  | 'agentSessions.setup.problem.tooManyArguments'
  | 'agentSessions.setup.problem.argumentTooLong'
  | 'agentSessions.setup.problem.credential'
  | 'agentSessions.setup.problem.cwdOverride'
  | 'agentSessions.setup.problem.commandString'
  | 'agentSessions.setup.problem.unsafeArgument'
  | 'agentSessions.setup.problem.saveFailed'
  | 'agentSessions.worktreeName'
  | 'agentSessions.cancel'
  | 'agentSessions.start'
  | 'agentSessions.agent.none'
  | 'agentSessions.agent.notDetected'
  | 'agentSessions.agent.notAuthenticated'
  | 'agentSessions.noneHint'
  | 'agentSessions.problem.nameEmpty'
  | 'agentSessions.problem.nameTooLong'
  | 'agentSessions.problem.nameSeparator'
  | 'agentSessions.problem.nameIllegal'
  | 'agentSessions.problem.nameReserved'
  | 'agentSessions.problem.duplicateWorktree'
  | 'agentSessions.problem.duplicateBranch'
  | 'agentSessions.problem.baseEmpty'
  | 'agentSessions.problem.baseUnknown'
  | 'agentSessions.problem.agentUnavailable'
  | 'agentSessions.problem.promptEmpty'
  | 'agentSessions.problem.promptTooLong'
  | 'agentSessions.status.errorLabel'
  | 'agentSessions.status.failed'
  | 'agentSessions.status.failedWithReason'
  | 'agentSessions.status.workingLabel'
  | 'agentSessions.status.working'
  | 'agentSessions.status.workingEdited'
  | 'agentSessions.status.oneFile'
  | 'agentSessions.status.files'
  | 'agentSessions.status.oneLine'
  | 'agentSessions.status.lines'
  | 'agentSessions.status.diff'
  | 'agentSessions.status.notMeasuredLabel'
  | 'agentSessions.status.notMeasured'
  | 'agentSessions.status.noChangesLabel'
  | 'agentSessions.status.noChanges'
  | 'agentSessions.notification.unavailableTitle'
  | 'agentSessions.notification.unavailableBody'
  | 'agentSessions.notification.invalidTitle'
  | 'agentSessions.notification.createFailedTitle'
  | 'agentSessions.notification.createdTitle'
  | 'agentSessions.notification.createdBody'
  | 'agentSessions.notification.finishedTitle'
  | 'agentSessions.notification.finishedBody'
  | 'agentSessions.notification.endedTitle'
  | 'agentSessions.notification.endedBody'
  | 'agentSessions.notification.failedTitle'
  | 'agentSessions.notification.failedBody'
  | 'agentSessions.notification.runnerCouldNotStart'
  | 'agentSessions.notification.runnerExitedWithCode'
  | 'agentSessions.notification.setupSaveFailedTitle'
  | 'agentSessions.notification.setupSaveFailedBody'
  | 'agentSessions.notification.setupLoadFailedTitle'
  | 'agentSessions.notification.setupLoadFailedBody'
  | 'agentSessions.notification.setupRetryUnavailableTitle'
  | 'agentSessions.notification.setupRetryUnavailableBody'
  | 'agentSessions.notification.setupVerificationFailedTitle'
  | 'agentSessions.notification.setupVerificationFailedBody'
  | 'agentSessions.notification.setupFailedTitle'
  | 'agentSessions.notification.setupFailedBody'
  | 'agentSessions.notification.setupFailedBeforeRunBody'
  | 'agentSessions.notification.setupFailedAfterRunBody'
  | 'agentSessions.notification.setupCancelledTitle'
  | 'agentSessions.notification.setupCancelledBody'
  | 'agentSessions.setup.failure.invalidRequest'
  | 'agentSessions.setup.failure.worktreeUnavailable'
  | 'agentSessions.setup.failure.executableUnavailable'
  | 'agentSessions.setup.failure.spawnFailed'
  | 'agentSessions.setup.failure.exitCode'
  | 'agentSessions.setup.failure.timeout'
  | 'agentSessions.setup.failure.outputLimit'
  | 'repositorySigning.title'
  | 'repositorySigning.hubDescription'
  | 'repositorySigning.shortcutLabel'
  | 'repositorySigning.cardTitle'
  | 'repositorySigning.intro'
  | 'repositorySigning.summaryTitle'
  | 'repositorySigning.notInspected'
  | 'repositorySigning.keyLabel'
  | 'repositorySigning.notConfigured'
  | 'repositorySigning.commitLabel'
  | 'repositorySigning.tagLabel'
  | 'repositorySigning.enabled'
  | 'repositorySigning.disabled'
  | 'repositorySigning.scopeLabel'
  | 'repositorySigning.scope.local'
  | 'repositorySigning.scope.global'
  | 'repositorySigning.formatLabel'
  | 'repositorySigning.replacementKeyLabel'
  | 'repositorySigning.replacementKeyHelp'
  | 'repositorySigning.signCommits'
  | 'repositorySigning.signTags'
  | 'repositorySigning.reviewAction'
  | 'repositorySigning.reviewTitle'
  | 'repositorySigning.review.scope'
  | 'repositorySigning.review.format'
  | 'repositorySigning.review.publicKey'
  | 'repositorySigning.review.preserveKey'
  | 'repositorySigning.review.replaceKey'
  | 'repositorySigning.review.defaults'
  | 'repositorySigning.review.commitOn'
  | 'repositorySigning.review.commitOff'
  | 'repositorySigning.review.tagOn'
  | 'repositorySigning.review.tagOff'
  | 'repositorySigning.review.description'
  | 'repositorySigning.applyAction'
  | 'repositorySigning.goBack'
  | 'repositorySigning.verificationTitle'
  | 'repositorySigning.verifyHead'
  | 'repositorySigning.loadTags'
  | 'repositorySigning.annotatedTag'
  | 'repositorySigning.verifyTag'
  | 'repositorySigning.result.target'
  | 'repositorySigning.result.state'
  | 'repositorySigning.result.signer'
  | 'repositorySigning.result.notReported'
  | 'repositorySigning.inspectAction'
  | 'repositorySigning.inspectAgainAction'
  | 'repositorySigning.cancelAction'
  | 'repositorySigning.status.idle'
  | 'repositorySigning.status.cancelledPartial'
  | 'repositorySigning.status.cancelledClean'
  | 'repositorySigning.status.inspected'
  | 'repositorySigning.status.noTags'
  | 'repositorySigning.status.loadedTags'
  | 'repositorySigning.status.updatedRefreshing'
  | 'repositorySigning.status.applying'
  | 'repositorySigning.status.verification'
  | 'repositorySigning.status.failedPartial'
  | 'repositorySigning.status.failedSafe'
  | 'repositorySigning.status.inspecting'
  | 'repositorySigning.status.review'
  | 'repositorySigning.status.rechecking'
  | 'repositorySigning.status.verifyingHead'
  | 'repositorySigning.status.loadingTags'
  | 'repositorySigning.status.verifyingTag'
  | 'repositorySigning.status.cancelling'
  | 'repositorySigning.status.changeAgain'
  | 'repositorySigning.error.start'
  | 'repositorySigning.error.tooMuchData'
  | 'repositorySigning.error.gitFailed'
  | 'repositorySigning.error.configChanged'
  | 'repositorySigning.error.tagUnavailable'
  | 'repositorySigning.error.tagChanged'
  | 'repositorySigning.error.unexpectedState'
  | 'repositorySigning.error.reviewUnavailable'
  | 'repositorySigning.error.inspectFirst'
  | 'repositorySigning.error.formatNeedsKey'
  | 'repositorySigning.error.prepare'
  | 'repositorySigning.error.cancel'
  | 'repositorySigning.error.partial'
  | 'repositorySigning.error.detail'
  | 'repositorySigning.grade.good'
  | 'repositorySigning.grade.bad'
  | 'repositorySigning.grade.goodUnknownValidity'
  | 'repositorySigning.grade.expiredSignature'
  | 'repositorySigning.grade.expiredKey'
  | 'repositorySigning.grade.revokedKey'
  | 'repositorySigning.grade.cannotVerify'
  | 'repositorySigning.grade.unsigned'
  | 'repositorySigning.grade.unknown'
  | 'md3.search.clear'
  | 'md3.search.regexMode'
  | 'md3.search.regexBuilder'
  | 'md3.search.hits'
  | 'md3.chip.filterBy'
  | 'md3.emptyState.resetFilters'
  | 'md3.regexBuilder.title'
  | 'md3.regexBuilder.close'
  | 'md3.regexBuilder.patternLabel'
  | 'md3.regexBuilder.patternPlaceholder'
  | 'md3.regexBuilder.flagsLabel'
  | 'md3.regexBuilder.flagToggle'
  | 'md3.regexBuilder.flag.i'
  | 'md3.regexBuilder.flag.g'
  | 'md3.regexBuilder.flag.m'
  | 'md3.regexBuilder.flag.s'
  | 'md3.regexBuilder.flag.u'
  | 'md3.regexBuilder.flag.y'
  | 'md3.regexBuilder.group.anchors'
  | 'md3.regexBuilder.group.classes'
  | 'md3.regexBuilder.group.quantifiers'
  | 'md3.regexBuilder.group.groups'
  | 'md3.regexBuilder.token.insert'
  | 'md3.regexBuilder.token.start'
  | 'md3.regexBuilder.token.end'
  | 'md3.regexBuilder.token.wordBoundary'
  | 'md3.regexBuilder.token.word'
  | 'md3.regexBuilder.token.digit'
  | 'md3.regexBuilder.token.space'
  | 'md3.regexBuilder.token.charRange'
  | 'md3.regexBuilder.token.notX'
  | 'md3.regexBuilder.token.any'
  | 'md3.regexBuilder.token.oneOrMore'
  | 'md3.regexBuilder.token.zeroOrMore'
  | 'md3.regexBuilder.token.optional'
  | 'md3.regexBuilder.token.repeatRange'
  | 'md3.regexBuilder.token.capture'
  | 'md3.regexBuilder.token.nonCapture'
  | 'md3.regexBuilder.token.either'
  | 'md3.regexBuilder.token.lookahead'
  | 'md3.regexBuilder.token.lookbehind'
  | 'md3.regexBuilder.group.escapes'
  | 'md3.regexBuilder.group.lazy'
  | 'md3.regexBuilder.group.references'
  | 'md3.regexBuilder.token.notWordBoundary'
  | 'md3.regexBuilder.token.notWord'
  | 'md3.regexBuilder.token.notDigit'
  | 'md3.regexBuilder.token.notSpace'
  | 'md3.regexBuilder.token.tab'
  | 'md3.regexBuilder.token.newline'
  | 'md3.regexBuilder.token.carriageReturn'
  | 'md3.regexBuilder.token.hexEscape'
  | 'md3.regexBuilder.token.unicodeEscape'
  | 'md3.regexBuilder.token.unicodePoint'
  | 'md3.regexBuilder.token.unicodeLetter'
  | 'md3.regexBuilder.token.unicodeNumber'
  | 'md3.regexBuilder.token.unicodeScript'
  | 'md3.regexBuilder.token.lazyOneOrMore'
  | 'md3.regexBuilder.token.lazyZeroOrMore'
  | 'md3.regexBuilder.token.lazyOptional'
  | 'md3.regexBuilder.token.lazyRepeatRange'
  | 'md3.regexBuilder.token.exactly'
  | 'md3.regexBuilder.token.atLeast'
  | 'md3.regexBuilder.token.namedCapture'
  | 'md3.regexBuilder.token.namedBackreference'
  | 'md3.regexBuilder.token.backreference'
  | 'md3.regexBuilder.token.negativeLookahead'
  | 'md3.regexBuilder.token.negativeLookbehind'
  | 'md3.regexBuilder.tester'
  | 'md3.regexBuilder.testLabel'
  | 'md3.regexBuilder.result.idle'
  | 'md3.regexBuilder.result.match'
  | 'md3.regexBuilder.result.matchWithGroups'
  | 'md3.regexBuilder.result.noMatch'
  | 'md3.regexBuilder.result.invalid'
  | 'md3.regexBuilder.apply'
  | 'md3.regexBuilder.applyName'
  | 'md3.regexBuilder.clear'
  | 'md3.regexBuilder.clearName'
  | 'md3.regexBuilder.guide'
  | 'md3.regexBuilder.guideName'
  | 'md3.regexBuilder.guideHeading'
  | 'md3.menu.filterPlaceholder'
  | 'md3.menu.hint.active'
  | 'md3.menu.hint.on'
  | 'md3.menu.hint.off'
  | 'md3.menu.hint.ask'
  | 'md3.menu.hint.current'
  | 'md3.menu.hint.anchor'
  | 'md3.menu.hint.class'
  | 'md3.menu.hint.quantifier'
  | 'md3.menu.hint.group'
  | 'md3.menu.hint.alternation'
  | 'md3.menu.hint.flags'
  | 'md3.menu.theme.dark'
  | 'md3.menu.theme.light'
  | 'md3.menuOverlay.close'
  | 'md3.menuOverlay.itemsLabel'
  | 'md3.menuOverlay.noMatches'
  | 'md3.menuOverlay.clearFilter'
  | 'md3.menuOverlay.invalidPattern'
  | 'md3.menu.palette.title'
  | 'md3.menu.palette.placeholder'
  | 'md3.menu.palette.commitPushAll'
  | 'md3.menu.palette.fetchOrigin'
  | 'md3.menu.palette.pullAll'
  | 'md3.menu.palette.mergeAll'
  | 'md3.menu.palette.openRegexBuilder'
  | 'md3.menu.palette.goRepositories'
  | 'md3.menu.palette.goChanges'
  | 'md3.menu.palette.goHistory'
  | 'md3.menu.palette.goActions'
  | 'md3.menu.palette.openSettings'
  | 'md3.menu.settings.title'
  | 'md3.menu.settings.placeholder'
  | 'md3.menu.settings.appearance'
  | 'md3.menu.settings.absoluteDates'
  | 'md3.menu.settings.automation'
  | 'md3.menu.settings.accounts'
  | 'md3.menu.settings.copilot'
  | 'md3.menu.settings.undoHistory'
  | 'md3.menu.settings.git'
  | 'md3.menu.settings.integrations'
  | 'md3.menu.settings.notifications'
  | 'md3.menu.account.title'
  | 'md3.menu.account.entry'
  | 'md3.menu.account.addGitHub'
  | 'md3.menu.account.addGitLab'
  | 'md3.menu.repoMenu.title'
  | 'md3.menu.repoMenu.placeholder'
  | 'md3.menu.repoMenu.entry'
  | 'md3.menu.repoMenu.browseAll'
  | 'md3.menu.branchMenu.title'
  | 'md3.menu.branchMenu.placeholder'
  | 'md3.menu.branchMenu.browseAll'
  | 'md3.menu.paneMenu.title'
  | 'md3.menu.paneMenu.commitPushCopilot'
  | 'md3.menu.paneMenu.pullOrigin'
  | 'md3.menu.paneMenu.forcePush'
  | 'md3.menu.paneMenu.buildAndRun'
  | 'md3.menu.paneMenu.mergeAll'
  | 'md3.menu.paneMenu.openInTerminal'
  | 'md3.menu.paneMenu.repositorySettings'
  | 'md3.menu.listMenu.title'
  | 'md3.menu.listMenu.newestFirst'
  | 'md3.menu.listMenu.oldestFirst'
  | 'md3.menu.listMenu.groupByDay'
  | 'md3.menu.listMenu.showGraph'
  | 'md3.menu.listMenu.selectMultiple'
  | 'md3.menu.diffOptions.title'
  | 'md3.menu.diffOptions.unified'
  | 'md3.menu.diffOptions.split'
  | 'md3.menu.diffOptions.wrap'
  | 'md3.menu.diffOptions.hideWhitespace'
  | 'md3.menu.diffOptions.moreContext'
  | 'md3.menu.fileMenu.title'
  | 'md3.menu.fileMenu.openInEditor'
  | 'md3.menu.fileMenu.copyPath'
  | 'md3.menu.fileMenu.fileHistory'
  | 'md3.menu.fileMenu.blame'
  | 'md3.menu.fileMenu.discardChanges'
  | 'md3.menu.fileMenu.ignoreFile'
  | 'md3.menu.rowMenu.title'
  | 'md3.menu.rowMenu.revert'
  | 'md3.menu.rowMenu.cherryPick'
  | 'md3.menu.rowMenu.createTag'
  | 'md3.menu.rowMenu.reset'
  | 'md3.menu.rowMenu.copySha'
  | 'md3.menu.rowMenu.viewOnGitHub'
  | 'md3.menu.changesMenu.title'
  | 'md3.menu.changesMenu.includeAll'
  | 'md3.menu.changesMenu.excludeAll'
  | 'md3.menu.changesMenu.stashAll'
  | 'md3.menu.changesMenu.discardAll'
  | 'md3.menu.changesMenu.groupByFolder'
  | 'md3.menu.changeRowMenu.title'
  | 'md3.menu.changeRowMenu.discardChanges'
  | 'md3.menu.changeRowMenu.ignoreFile'
  | 'md3.menu.changeRowMenu.ignoreType'
  | 'md3.menu.changeRowMenu.reveal'
  | 'md3.menu.changeRowMenu.openInEditor'
  | 'md3.menu.branchRowMenu.title'
  | 'md3.menu.branchRowMenu.mergeInto'
  | 'md3.menu.branchRowMenu.rebaseOnto'
  | 'md3.menu.branchRowMenu.openPullRequest'
  | 'md3.menu.branchRowMenu.rename'
  | 'md3.menu.branchRowMenu.delete'
  | 'md3.menu.runMenu.title'
  | 'md3.menu.runMenu.rerunAll'
  | 'md3.menu.runMenu.rerunFailed'
  | 'md3.menu.runMenu.cancel'
  | 'md3.menu.runMenu.dispatch'
  | 'md3.menu.runMenu.rawLogs'
  | 'md3.menu.repoRowMenu.title'
  | 'md3.menu.repoRowMenu.fetch'
  | 'md3.menu.repoRowMenu.pull'
  | 'md3.menu.repoRowMenu.changeAlias'
  | 'md3.menu.repoRowMenu.moveToGroup'
  | 'md3.menu.repoRowMenu.reveal'
  | 'md3.menu.repoRowMenu.remove'
  | 'md3.menu.compose.title'
  | 'md3.menu.compose.openComposer'
  | 'md3.menu.compose.copilotMessage'
  | 'md3.menu.compose.addCoAuthors'
  | 'md3.menu.compose.commitAndPush'
  | 'md3.menu.agentAccess.title'
  | 'md3.menu.agentAccess.readAccess'
  | 'md3.menu.agentAccess.commits'
  | 'md3.menu.agentAccess.push'
  | 'md3.menu.agentAccess.sessionLog'
  | 'md3.menu.inboxRowMenu.title'
  | 'md3.menu.inboxRowMenu.markRead'
  | 'md3.menu.inboxRowMenu.markUnread'
  | 'md3.menu.inboxRowMenu.openInBrowser'
  | 'md3.menu.inboxRowMenu.mute'
  | 'md3.menu.inboxRowMenu.delete'
  | 'md3.menu.agentRowMenu.title'
  | 'md3.menu.agentRowMenu.resume'
  | 'md3.menu.agentRowMenu.pause'
  | 'md3.menu.agentRowMenu.openLog'
  | 'md3.menu.agentRowMenu.duplicate'
  | 'md3.menu.agentRowMenu.access'
  | 'md3.menu.agentRowMenu.delete'
  | 'md3.menu.terminalMenu.title'
  | 'md3.menu.terminalMenu.copy'
  | 'md3.menu.terminalMenu.paste'
  | 'md3.menu.terminalMenu.clear'
  | 'md3.menu.terminalMenu.split'
  | 'md3.menu.terminalMenu.openSystem'
  | 'md3.menu.terminalMenu.newShell'
  | 'md3.menu.drawerMenu.title'
  | 'md3.menu.drawerMenu.collapse'
  | 'md3.menu.drawerMenu.expand'
  | 'md3.menu.drawerMenu.goRepositories'
  | 'md3.menu.drawerMenu.goChanges'
  | 'md3.menu.drawerMenu.goHistory'
  | 'md3.menu.drawerMenu.goBranches'
  | 'md3.menu.drawerMenu.goActions'
  | 'md3.menu.drawerMenu.goInbox'
  | 'md3.menu.drawerMenu.goTerminal'
  | 'md3.menu.drawerMenu.goAgents'
  | 'md3.menu.searchMenu.title'
  | 'md3.menu.searchMenu.openBuilder'
  | 'md3.menu.searchMenu.toggleRegex'
  | 'md3.menu.searchMenu.clearField'
  | 'md3.menu.searchMenu.howRegexWorks'
  | 'md3.menu.guide.title'
  | 'md3.menu.guide.caret'
  | 'md3.menu.guide.dollar'
  | 'md3.menu.guide.classes'
  | 'md3.menu.guide.quantifiers'
  | 'md3.menu.guide.groups'
  | 'md3.menu.guide.alternation'
  | 'md3.menu.guide.flags'
  | 'md3.appHeader.label'
  | 'md3.appHeader.menu'
  | 'md3.appHeader.commitAndPush'
  | 'md3.appHeader.commitAndPushHint'
  | 'md3.appHeader.searchPlaceholder'
  | 'md3.appHeader.searchField'
  | 'md3.appHeader.commandPalette'
  | 'md3.appHeader.notifications'
  | 'md3.appHeader.notificationsUnread'
  | 'md3.appHeader.unreadBadge'
  | 'md3.appHeader.theme'
  | 'md3.appHeader.settings'
  | 'md3.appHeader.account'
  | 'md3.appHeader.accountFor'
  | 'md3.drawer.label'
  | 'md3.drawer.destinations'
  | 'md3.drawer.commit'
  | 'md3.drawer.destinationWithCount'
  | 'md3.drawer.repository'
  | 'md3.drawer.destination.changes'
  | 'md3.drawer.destination.history'
  | 'md3.drawer.destination.branches'
  | 'md3.drawer.destination.actions'
  | 'md3.drawer.destination.inbox'
  | 'md3.drawer.destination.terminal'
  | 'md3.drawer.destination.agents'
  | 'md3.drawer.destination.repositories'
  | 'md3.rail.label'
  | 'md3.rail.destinations'
  | 'md3.rail.destinationWithCount'
  | 'md3.rail.settings'
  | 'md3.rail.account'
  | 'md3.rail.accountFor'
  | 'md3.compose.title'
  | 'md3.compose.close'
  | 'md3.compose.context'
  | 'md3.compose.summaryPlaceholder'
  | 'md3.compose.copilot'
  | 'md3.compose.copilotAccessibleName'
  | 'md3.compose.descriptionPlaceholder'
  | 'md3.compose.addCoAuthors'
  | 'md3.compose.hintCharacters'
  | 'md3.compose.hintRequired'
  | 'md3.compose.commitOnly'
  | 'md3.compose.commitAndPush'
  | 'md3.compose.summaryStillRequired'
  | 'md3.toast.undo'
  | 'md3.toast.dismiss'
  | 'md3.toast.region'
  | 'md3.inbox.pane'
  | 'md3.inbox.list'
  | 'md3.inbox.filters'
  | 'md3.inbox.searchPlaceholder'
  | 'md3.inbox.searchField'
  | 'md3.inbox.invalidPattern'
  | 'md3.inbox.exportName'
  | 'md3.inbox.chip.unread'
  | 'md3.inbox.chip.failures'
  | 'md3.inbox.chip.mentions'
  | 'md3.inbox.markAllRead'
  | 'md3.inbox.muted'
  | 'md3.inbox.state.read'
  | 'md3.inbox.state.unread'
  | 'md3.inbox.tone.success'
  | 'md3.inbox.tone.failure'
  | 'md3.inbox.tone.info'
  | 'md3.inbox.detail'
  | 'md3.inbox.detailNoSource'
  | 'md3.inbox.row.select'
  | 'md3.inbox.row.markRead'
  | 'md3.inbox.row.markUnread'
  | 'md3.inbox.row.delete'
  | 'md3.inbox.row.received'
  | 'md3.inbox.selectAllFiltered'
  | 'md3.inbox.selectAllEverything'
  | 'md3.inbox.selectionCount'
  | 'md3.inbox.invertSelection'
  | 'md3.inbox.bulkMarkRead'
  | 'md3.inbox.bulkMarkReadScoped'
  | 'md3.inbox.bulkMarkUnread'
  | 'md3.inbox.bulkMarkUnreadScoped'
  | 'md3.inbox.bulkDelete'
  | 'md3.inbox.bulkDeleteScoped'
  | 'md3.inbox.bulkExport'
  | 'md3.inbox.bulkExportScoped'
  | 'md3.inbox.moreActions'
  | 'md3.inbox.empty.noMatch'
  | 'md3.inbox.empty.caughtUp'
  | 'md3.inbox.scope.selection'
  | 'md3.inbox.scope.filtered'
  | 'md3.inbox.scope.all'
  | 'md3.inbox.scope.one'
  | 'md3.inbox.undo'
  | 'md3.inbox.toast.opened'
  | 'md3.inbox.toast.deleted'
  | 'md3.inbox.toast.deletedMany'
  | 'md3.inbox.toast.markedRead'
  | 'md3.inbox.toast.markedUnread'
  | 'md3.inbox.toast.allRead'
  | 'md3.inbox.toast.exported'
  | 'md3.inbox.toast.selectedAll'
  | 'md3.inbox.toast.muted'
  | 'md3.inbox.toast.unmuted'
  | 'md3.inbox.rowMenu.unmute'
  | 'md3.inbox.rowMenu.automations'
  | 'md3.inbox.rowMenu.select'
  | 'md3.inbox.rowMenu.deselect'
  | 'md3.inbox.rowMenu.copyDetails'
  | 'md3.inbox.rowMenu.exportOne'
  | 'md3.inbox.listMenu.title'
  | 'md3.inbox.listMenu.selectFiltered'
  | 'md3.inbox.listMenu.selectEverything'
  | 'md3.inbox.listMenu.invert'
  | 'md3.inbox.listMenu.clearSelection'
  | 'md3.inbox.listMenu.deleteScope'
  | 'md3.inbox.listMenu.export'
  | 'md3.inbox.listMenu.history'
  | 'md3.inbox.listMenu.githubInbox'
  | 'md3.inbox.exportMenu.title'
  | 'md3.inbox.exportMenu.filterPlaceholder'
  | 'md3.paneHeader.fetch'
  | 'md3.paneHeader.moreActions'
  | 'md3.paneHeader.push'
  | 'md3.paneHeader.upToDate'
  | 'md3.paneHeader.repository'
  | 'md3.paneHeader.branch'
  | 'md3.paneHeader.progress'
  | 'md3.shell.destinationAnnouncement.plain'
  | 'md3.shell.destinationAnnouncement.light'
  | 'md3.shell.destinationAnnouncement.playful'
  | 'md3.shell.destinationAnnouncement.maximum'
  | 'md3.shell.branchGroup.local'
  | 'md3.shell.branchGroup.remote'
  | 'md3.shell.searchTarget.global'
  | 'md3.shell.searchTarget.history'
  | 'md3.shell.searchTarget.changes'
  | 'md3.shell.searchTarget.branches'
  | 'md3.shell.searchTarget.actions'
  | 'md3.shell.searchTarget.logs'
  | 'md3.shell.searchTarget.inbox'
  | 'md3.shell.searchTarget.terminal'
  | 'md3.shell.searchTarget.agents'
  | 'md3.shell.searchTarget.repositories'
  | 'md3.shell.searchTarget.diffSearch'
  | 'md3.shell.carry.compareToBranch'
  | 'md3.shell.carry.unreachableCommits'
  | 'md3.shell.carry.workflowManager'
  | 'md3.shell.carry.workflowCatalog'
  | 'md3.shell.carry.cacheManager'
  | 'md3.shell.carry.runnerManager'
  | 'md3.shell.carry.refreshRuns'
  | 'md3.shell.carry.runCount'
  | 'md3.shell.carry.jumpToAttempt'
  | 'md3.shell.carry.logGroupCollapse'
  | 'md3.shell.carry.paneDivider'
  | 'md3.shell.carry.discardFile'
  | 'md3.shell.carry.permanentlyDiscardFile'
  | 'md3.shell.carry.stashFile'
  | 'md3.shell.carry.ignoreFolder'
  | 'md3.shell.carry.copyRelativePath'
  | 'md3.shell.carry.copySelectedPaths'
  | 'md3.shell.carry.openWithDefaultProgram'
  | 'md3.shell.carry.cheapLfsPin'
  | 'md3.shell.carry.includeSelectedFiles'
  | 'md3.shell.carry.excludeSelectedFiles'
  | 'md3.shell.carry.discardAll'
  | 'md3.shell.carry.permanentlyDiscardAll'
  | 'md3.shell.carry.stashAll'
  | 'md3.shell.carry.mergeAndDelete'
  | 'md3.shell.carry.compareBranch'
  | 'md3.shell.carry.copyBranchName'
  | 'md3.shell.carry.togglePinBranch'
  | 'md3.shell.carry.hideBranch'
  | 'md3.shell.carry.soloBranch'
  | 'md3.shell.carry.restoreBranchVisibility'
  | 'md3.shell.carry.checkoutInNewWorktree'
  | 'md3.shell.carry.switchToWorktree'
  | 'md3.shell.carry.viewBranchOnForge'
  | 'md3.shell.carry.viewPullRequestOnForge'
  | 'md3.shell.carry.sortBranchesByName'
  | 'md3.shell.carry.sortBranchesByRecent'
  | 'md3.shell.carry.showPullRequests'
  | 'md3.shell.carry.fetchRemoteBranches'
  | 'md3.shell.carry.restoreAllBranches'
  | 'md3.shell.carry.bulkDeleteBranches'
  | 'md3.shell.carry.repositoryListMenu'
  | 'md3.shell.carry.newAgentSession'
  | 'md3.carry.close'
  | 'md3.carry.workflowManagerTitle'
  | 'md3.carry.cacheManagerTitle'
  | 'md3.carry.runnerManagerTitle'
  | 'md3.carry.bulkDeleteTitle'
  | 'md3.carry.gate.discardTitle'
  | 'md3.carry.gate.discardConfirm'
  | 'md3.carry.gate.discardSummary'
  | 'md3.carry.gate.discardIrreversible'
  | 'md3.carry.gate.discardTargetKey'
  | 'md3.carry.gate.discardEffectKey'
  | 'md3.carry.gate.discardPermanentTitle'
  | 'md3.carry.gate.discardPermanentConfirm'
  | 'md3.carry.gate.discardPermanentSummary'
  | 'md3.carry.gate.discardPermanentIrreversible'
  | 'md3.carry.gate.discardPermanentEffectKey'
  | 'md3.carry.gate.mergeAndDeleteTitle'
  | 'md3.carry.gate.mergeAndDeleteConfirm'
  | 'md3.carry.gate.mergeAndDeleteSummary'
  | 'md3.carry.gate.mergeAndDeleteIrreversible'
  | 'md3.carry.gate.mergeAndDeleteTargetKey'
  | 'md3.carry.gate.mergeAndDeleteEffectKey'
  | 'md3.carry.gate.bulkDeleteTitle'
  | 'md3.carry.gate.bulkDeleteConfirm'
  | 'md3.carry.gate.bulkDeleteSummary'
  | 'md3.carry.gate.bulkDeleteIrreversible'
  | 'md3.carry.gate.bulkDeleteTargetKey'
  | 'md3.carry.gate.bulkDeleteEffectKey'
  | 'classicToolbar.heading'
  | 'classicToolbar.toggleLabel'
  | 'classicToolbar.explanationSummary'
  | 'classicToolbar.explanation.plain'
  | 'classicToolbar.explanation.light'
  | 'classicToolbar.explanation.playful'
  | 'classicToolbar.explanation.maximum'
  | 'classicToolbar.boundaryNote'
  | 'classicToolbar.provenanceDefault'
  | 'classicToolbar.provenanceStored'
  | 'classicToolbar.stateOn'
  | 'classicToolbar.stateOff'
  | 'md3.repositories.searchPlaceholder'
  | 'md3.repositories.gone'
  | 'md3.repositories.favourited'
  | 'md3.repositories.unfavourited'
  | 'md3.repositories.removed'
  | 'md3.repositories.pullingAll'
  | 'md3.repositories.pulling'
  | 'md3.repositories.fetching'
  | 'md3.repositories.assigningGroup'
  | 'md3.repositories.removingGroup'
  | 'md3.repositories.dismissNotice'
  | 'md3.repositories.searchFieldName'
  | 'md3.repositories.filtersLabel'
  | 'md3.repositories.hasChanges'
  | 'md3.repositories.clone'
  | 'md3.repositories.addLocal'
  | 'md3.repositories.pullAll'
  | 'md3.repositories.pullAllName'
  | 'md3.repositories.selectMultiple'
  | 'md3.repositories.listLabel'
  | 'md3.repositories.empty'
  | 'md3.repositories.invalidPattern'
  | 'md3.repositories.meta'
  | 'md3.repositories.neverFetched'
  | 'md3.repositories.detail'
  | 'md3.repositories.languageUnknown'
  | 'md3.repositories.size'
  | 'md3.repositories.sizeUnknown'
  | 'md3.repositories.branchAheadBehind'
  | 'md3.repositories.branchInSync'
  | 'md3.repositories.branchNotChecked'
  | 'md3.repositories.branchNoUpstream'
  | 'md3.repositories.branchDetached'
  | 'md3.repositories.branchEmpty'
  | 'md3.repositories.branchCloning'
  | 'md3.repositories.branchMissing'
  | 'md3.repositories.branchNone'
  | 'md3.repositories.remotes'
  | 'md3.repositories.remotesOne'
  | 'md3.repositories.changes'
  | 'md3.repositories.changesOne'
  | 'md3.repositories.clean'
  | 'md3.repositories.changesUnknown'
  | 'md3.repositories.open'
  | 'md3.repositories.openName'
  | 'md3.repositories.current'
  | 'md3.repositories.rowMenu'
  | 'md3.repositories.rowMenuHint'
  | 'md3.repositories.pinnedFlag'
  | 'md3.repositories.hiddenFlag'
  | 'md3.repositories.missingFlag'
  | 'md3.repositories.selectRow'
  | 'md3.repositories.bulkRegion'
  | 'md3.repositories.selectAllVisible'
  | 'md3.repositories.selectionScope'
  | 'md3.repositories.selectedCount'
  | 'md3.repositories.invertSelection'
  | 'md3.repositories.clearSelection'
  | 'md3.repositories.exitSelection'
  | 'md3.repositories.groupFieldLabel'
  | 'md3.repositories.groupFieldPlaceholder'
  | 'md3.repositories.bulkFetch'
  | 'md3.repositories.bulkPull'
  | 'md3.repositories.bulkOpen'
  | 'md3.repositories.bulkFavorite'
  | 'md3.repositories.bulkUnfavorite'
  | 'md3.repositories.bulkAssignGroup'
  | 'md3.repositories.bulkRemoveGroup'
  | 'md3.repositories.bulkExport'
  | 'md3.repositories.bulkRemove'
  | 'md3.repositories.bulkActionName'
  | 'md3.repositories.runRegion'
  | 'md3.repositories.runCount'
  | 'md3.repositories.runProgressText'
  | 'md3.repositories.runCancelling'
  | 'md3.repositories.runSummary'
  | 'md3.repositories.runResults'
  | 'md3.repositories.runNoDetail'
  | 'md3.repositories.runCancel'
  | 'md3.repositories.runCancelName'
  | 'md3.repositories.runDismiss'
  | 'md3.repositories.runStatusQueued'
  | 'md3.repositories.runStatusRunning'
  | 'md3.repositories.runStatusDone'
  | 'md3.repositories.runStatusFailed'
  | 'md3.repositories.runStatusSkipped'
  | 'md3.repositories.runStatusCancelled'
  | 'md3.repositories.removeEyebrow'
  | 'md3.repositories.removeTitle'
  | 'md3.repositories.removeTitleOne'
  | 'md3.repositories.removeDescription'
  | 'md3.repositories.removeListLabel'
  | 'md3.repositories.removeKeysLegend'
  | 'md3.repositories.removeKeyList'
  | 'md3.repositories.removeKeyDisk'
  | 'md3.repositories.removeSlider'
  | 'md3.repositories.removeSliderName'
  | 'md3.repositories.removeSliderValue'
  | 'md3.repositories.removeStateLocked'
  | 'md3.repositories.removeStateMoving'
  | 'md3.repositories.removeStateReady'
  | 'md3.repositories.removeConfirm'
  | 'md3.repositories.removeCancel'
  | 'md3.actions.filterPlaceholder'
  | 'md3.actions.runFieldLabel'
  | 'md3.actions.logPlaceholder'
  | 'md3.actions.logFieldLabel'
  | 'md3.actions.chipRowLabel'
  | 'md3.actions.chip.running'
  | 'md3.actions.chip.failed'
  | 'md3.actions.chip.success'
  | 'md3.actions.chip.thisBranch'
  | 'md3.actions.cancelRequested'
  | 'md3.actions.cancelRefused'
  | 'md3.actions.bulkDone'
  | 'md3.actions.bulkPartial'
  | 'md3.actions.workflowEnabled'
  | 'md3.actions.workflowDisabled'
  | 'md3.actions.unsupported'
  | 'md3.actions.moreFilters'
  | 'md3.actions.selectRuns'
  | 'md3.actions.dispatch'
  | 'md3.actions.filtersHeading'
  | 'md3.actions.filterWorkflow'
  | 'md3.actions.filterBranch'
  | 'md3.actions.filterEvent'
  | 'md3.actions.filterStatus'
  | 'md3.actions.resetFilters'
  | 'md3.actions.bulkLabel'
  | 'md3.actions.selectAllVisible'
  | 'md3.actions.selectedCount'
  | 'md3.actions.bulkRerun'
  | 'md3.actions.bulkCancel'
  | 'md3.actions.clearSelection'
  | 'md3.actions.selectRun'
  | 'md3.actions.runList'
  | 'md3.actions.runMeta'
  | 'md3.actions.runDetail'
  | 'md3.actions.rerun'
  | 'md3.actions.rerunRun'
  | 'md3.actions.runMenuFor'
  | 'md3.actions.runMenuHint'
  | 'md3.actions.noRuns'
  | 'md3.actions.showMoreRuns'
  | 'md3.actions.pagination'
  | 'md3.actions.loadMoreRuns'
  | 'md3.actions.loadingMore'
  | 'md3.actions.loadAllRuns'
  | 'md3.actions.stopLoading'
  | 'md3.actions.detailLabel'
  | 'md3.actions.detailHeading'
  | 'md3.actions.rerunFailed'
  | 'md3.actions.rerunFailedFor'
  | 'md3.actions.paneMenu'
  | 'md3.actions.runToolbar'
  | 'md3.actions.attempt'
  | 'md3.actions.attemptOption'
  | 'md3.actions.attemptLatest'
  | 'md3.actions.cancelRun'
  | 'md3.actions.fixCiLocally'
  | 'md3.actions.fixCiLocallyHint'
  | 'md3.actions.artifacts'
  | 'md3.actions.openOnGitHub'
  | 'md3.actions.jobList'
  | 'md3.actions.jobsLoading'
  | 'md3.actions.jobsTruncated'
  | 'md3.actions.loadMoreJobs'
  | 'md3.actions.reloadJobs'
  | 'md3.actions.rerunJob'
  | 'md3.actions.jobOnGitHub'
  | 'md3.actions.noRunSelected'
  | 'md3.actions.logRegion'
  | 'md3.actions.logLoading'
  | 'md3.actions.logExpired'
  | 'md3.actions.logRetry'
  | 'md3.actions.logEmpty'
  | 'md3.actions.logNoMatch'
  | 'md3.actions.logShowMore'
  | 'md3.actions.logShowing'
  | 'md3.actions.noRepository'
  | 'md3.repositories.exportTitle'
  | 'md3.repositories.exportBody'
  | 'md3.inbox.exportTitle'
  | 'md3.inbox.exportBody'
  | 'md3.adapters.diff.none'
  | 'md3.adapters.diff.noChanges'
  | 'md3.adapters.diff.image'
  | 'md3.adapters.diff.binary'
  | 'md3.adapters.diff.submodule'
  | 'md3.adapters.diff.unrenderable'
  | 'md3.adapters.branch.metaSha'
  | 'md3.adapters.branch.metaUpdated'
  | 'md3.adapters.repository.cloning'
  | 'md3.adapters.repository.local'
  | 'md3.adapters.repository.fetchUnknown'
  | 'md3.adapters.agent.permissions'
  | 'md3.adapters.agent.missing'
  | 'md3.adapters.agent.notRunning'
  | 'md3.adapters.agent.status.running'
  | 'md3.adapters.agent.status.exited'
  | 'md3.adapters.agent.status.failed'
  | 'md3.adapters.agent.status.cancelled'
  | 'md3.diffPane.region'
  | 'md3.diffPane.linesRegion'
  | 'md3.diffPane.noFile'
  | 'md3.diffPane.empty'
  | 'md3.diffPane.searchField'
  | 'md3.diffPane.searchPlaceholder'
  | 'md3.diffPane.details'
  | 'md3.diffPane.detailsName'
  | 'md3.diffPane.includeHunk'
  | 'md3.diffPane.includeHunkName'
  | 'md3.diffPane.wrap'
  | 'md3.diffPane.diffOptions'
  | 'md3.diffPane.fileTabs'
  | 'md3.diffPane.fileTabName'
  | 'md3.changes.searchField'
  | 'md3.changes.searchPlaceholder'
  | 'md3.changes.filters'
  | 'md3.changes.includeAll'
  | 'md3.changes.changesMenu'
  | 'md3.changes.list'
  | 'md3.changes.include'
  | 'md3.changes.rowMenu'
  | 'md3.changes.fileMenu'
  | 'md3.changes.status.new'
  | 'md3.changes.status.deleted'
  | 'md3.changes.status.modified'
  | 'md3.changes.state.included'
  | 'md3.changes.state.excluded'
  | 'md3.changes.empty'
  | 'md3.changes.composer'
  | 'md3.changes.avatar'
  | 'md3.changes.summaryPlaceholder'
  | 'md3.changes.descriptionPlaceholder'
  | 'md3.changes.copilot'
  | 'md3.changes.coAuthors'
  | 'md3.changes.coAuthorsName'
  | 'md3.changes.summaryHint'
  | 'md3.changes.summaryHintLong'
  | 'md3.changes.commitTo'
  | 'md3.changes.commitNeedsSummary'
  | 'md3.changes.commitAndPush'
  | 'md3.agents.sessionsPane'
  | 'md3.agents.conversationPane'
  | 'md3.agents.listLabel'
  | 'md3.agents.actionsLabel'
  | 'md3.agents.searchPlaceholder'
  | 'md3.agents.searchFieldLabel'
  | 'md3.agents.newSession'
  | 'md3.agents.agentAccess'
  | 'md3.agents.emptyNoMatches'
  | 'md3.agents.emptyNoSessions'
  | 'md3.agents.state.running'
  | 'md3.agents.state.done'
  | 'md3.agents.state.paused'
  | 'md3.agents.state.error'
  | 'md3.agents.state.idle'
  | 'md3.agents.meta.started'
  | 'md3.agents.meta.notStarted'
  | 'md3.agents.meta.branchStarted'
  | 'md3.agents.meta.branchNotStarted'
  | 'md3.agents.detail.model'
  | 'md3.agents.detail.noModel'
  | 'md3.agents.detail.turns'
  | 'md3.agents.detail.oneTurn'
  | 'md3.agents.elapsed.seconds'
  | 'md3.agents.elapsed.minutes'
  | 'md3.agents.elapsed.hours'
  | 'md3.agents.badge.main'
  | 'md3.agents.badge.locked'
  | 'md3.agents.badge.missing'
  | 'md3.agents.noSelection'
  | 'md3.agents.noSelectionHint'
  | 'md3.agents.noTurns'
  | 'md3.agents.conversationLabel'
  | 'md3.agents.role.you'
  | 'md3.agents.role.error'
  | 'md3.agents.pause'
  | 'md3.agents.resume'
  | 'md3.agents.pauseAccessibleName'
  | 'md3.agents.resumeAccessibleName'
  | 'md3.agents.more'
  | 'md3.agents.instructionPlaceholder'
  | 'md3.agents.send'
  | 'md3.agents.sendAccessibleName'
  | 'md3.agents.nothingToSend'
  | 'md3.terminal.region'
  | 'md3.terminal.shells'
  | 'md3.terminal.newShell'
  | 'md3.terminal.closeShell'
  | 'md3.terminal.restart'
  | 'md3.terminal.restartName'
  | 'md3.terminal.stop'
  | 'md3.terminal.stopName'
  | 'md3.terminal.searchPlaceholder'
  | 'md3.terminal.searchField'
  | 'md3.terminal.output'
  | 'md3.terminal.truncated'
  | 'md3.terminal.noMatches'
  | 'md3.terminal.noOutput'
  | 'md3.terminal.clearSearch'
  | 'md3.terminal.noSessions'
  | 'md3.terminal.openShell'
  | 'md3.terminal.inputPlaceholder'
  | 'md3.terminal.inputLabel'
  | 'md3.terminal.run'
  | 'md3.terminal.runName'
  | 'md3.terminal.nothingToRun'
  | 'md3.terminal.status.connecting'
  | 'md3.terminal.status.ready'
  | 'md3.terminal.status.running'
  | 'md3.terminal.status.exited'
  | 'md3.terminal.status.error'
  | 'md3.terminal.sessionLabel'
  | 'md3.terminal.banner'
  | 'md3.terminal.cancelled'
  | 'md3.terminal.failedWithError'
  | 'md3.terminal.exitedWithCode'
  | 'md3.terminal.failed'
  | 'md3.terminal.notAllowed'
  | 'md3.terminal.refreshFailed'
  | 'md3.terminal.startFailed'
  | 'md3.branches.filterPlaceholder'
  | 'md3.branches.fieldLabel'
  | 'md3.branches.chipsLabel'
  | 'md3.branches.chip.local'
  | 'md3.branches.chip.remote'
  | 'md3.branches.listLabel'
  | 'md3.branches.newBranch'
  | 'md3.branches.mergeAll'
  | 'md3.branches.mergeAllRunning'
  | 'md3.branches.mergeAllProgress'
  | 'md3.branches.mergeAllProgressBranch'
  | 'md3.branches.empty'
  | 'md3.branches.current'
  | 'md3.branches.checkout'
  | 'md3.branches.checkoutLabel'
  | 'md3.branches.rowLabel'
  | 'md3.branches.rowMenu'
  | 'md3.branches.rowMenuHint'
  | 'md3.branches.aheadLabel'
  | 'md3.branches.behindLabel'
  | 'md3.branches.group.current'
  | 'md3.branches.group.local'
  | 'md3.branches.group.remote'
  | 'md3.branches.detail.tip'
  | 'md3.branches.detail.tracks'
  | 'md3.branches.detail.trackingRemote'
  | 'md3.branches.detail.untracked'
  | 'md3.branches.detail.diverged'
  | 'md3.branches.detail.inSync'
  | 'md3.branches.detail.pullRequest'
  | 'md3.branches.action.merge'
  | 'md3.branches.action.rebase'
  | 'md3.branches.action.openPullRequest'
  | 'md3.branches.action.rename'
  | 'md3.branches.action.delete'
  | 'md3.branches.action.mergeAndDelete'
  | 'md3.branches.action.compare'
  | 'md3.branches.action.copyName'
  | 'md3.branches.action.pin'
  | 'md3.branches.action.unpin'
  | 'md3.branches.action.hide'
  | 'md3.branches.action.solo'
  | 'md3.branches.action.restoreVisibility'
  | 'md3.branches.action.checkoutInNewWorktree'
  | 'md3.branches.action.switchToWorktree'
  | 'md3.branches.action.viewOnForge'
  | 'md3.branches.action.viewPullRequestOnForge'
  | 'md3.branches.list.sortByName'
  | 'md3.branches.list.sortByNameActive'
  | 'md3.branches.list.sortByRecent'
  | 'md3.branches.list.sortByRecentActive'
  | 'md3.branches.list.pullRequests'
  | 'md3.branches.list.fetchRemotes'
  | 'md3.branches.list.bulkDelete'
  | 'md3.locks.title'
  | 'md3.locks.subtitle'
  | 'md3.locks.search.placeholder'
  | 'md3.locks.search.fieldLabel'
  | 'md3.locks.empty.none'
  | 'md3.locks.empty.noMatch'
  | 'md3.locks.list.label'
  | 'md3.locks.surface.tab'
  | 'md3.locks.surface.tabGroup'
  | 'md3.locks.surface.appearanceProperty'
  | 'md3.locks.surface.appearanceElement'
  | 'md3.locks.surface.appearancePreset'
  | 'md3.locks.factor.password'
  | 'md3.locks.factor.otp'
  | 'md3.locks.row.created'
  | 'md3.locks.row.lockOnLaunch'
  | 'md3.locks.row.unlockedUntil'
  | 'md3.locks.row.unlockedSession'
  | 'md3.locks.row.unlockedSurface'
  | 'md3.locks.row.locked'
  | 'md3.locks.row.select'
  | 'md3.locks.row.edit'
  | 'md3.locks.row.remove'
  | 'md3.locks.row.lockAgain'
  | 'md3.locks.duration.surface'
  | 'md3.locks.duration.minutes'
  | 'md3.locks.duration.session'
  | 'md3.locks.duration.minutesValue'
  | 'md3.locks.selection.count'
  | 'md3.locks.selection.selectAllFiltered'
  | 'md3.locks.selection.selectAllEverything'
  | 'md3.locks.selection.invert'
  | 'md3.locks.selection.clear'
  | 'md3.locks.bulk.remove'
  | 'md3.locks.bulk.export'
  | 'md3.locks.bulk.exportFormat'
  | 'md3.locks.toast.exported'
  | 'md3.locks.toast.removed'
  | 'md3.locks.toast.added'
  | 'md3.locks.toast.updated'
  | 'md3.locks.toast.unlocked'
  | 'md3.locks.toast.relocked'
  | 'md3.locks.toast.selectedAll'
  | 'md3.locks.gate.eyebrow'
  | 'md3.locks.gate.title'
  | 'md3.locks.gate.description'
  | 'md3.locks.gate.keysLegend'
  | 'md3.locks.gate.keyCount'
  | 'md3.locks.gate.keyScope'
  | 'md3.locks.gate.sliderLabel'
  | 'md3.locks.gate.sliderValue'
  | 'md3.locks.gate.statusLocked'
  | 'md3.locks.gate.statusReady'
  | 'md3.locks.gate.statusMoving'
  | 'md3.locks.gate.statusAuthorized'
  | 'md3.locks.gate.emergencyExit'
  | 'md3.locks.gate.confirm'
  | 'md3.locks.setup.title'
  | 'md3.locks.setup.titleEdit'
  | 'md3.locks.setup.close'
  | 'md3.locks.setup.factorLegend'
  | 'md3.locks.setup.factorPassword'
  | 'md3.locks.setup.factorOtp'
  | 'md3.locks.setup.otpUnavailable'
  | 'md3.locks.setup.password'
  | 'md3.locks.setup.passwordConfirm'
  | 'md3.locks.setup.otpAccount'
  | 'md3.locks.setup.otpAccountHint'
  | 'md3.locks.setup.durationLegend'
  | 'md3.locks.setup.lockOnLaunch'
  | 'md3.locks.setup.forFun'
  | 'md3.locks.setup.recovery'
  | 'md3.locks.setup.recoveryUnknown'
  | 'md3.locks.setup.explanationShow'
  | 'md3.locks.setup.explanationHide'
  | 'md3.locks.setup.explanation'
  | 'md3.locks.setup.provenanceDefault'
  | 'md3.locks.setup.provenanceStored'
  | 'md3.locks.setup.save'
  | 'md3.locks.setup.cancel'
  | 'md3.locks.setup.errorTooShort'
  | 'md3.locks.setup.errorMismatch'
  | 'md3.locks.setup.errorOtpAccount'
  | 'md3.locks.setup.errorVault'
  | 'md3.locks.setup.errorOtpUnavailable'
  | 'md3.locks.setup.minutesLabel'
  | 'md3.locks.unlock.title'
  | 'md3.locks.unlock.passwordLabel'
  | 'md3.locks.unlock.codeLabel'
  | 'md3.locks.unlock.durationLegend'
  | 'md3.locks.unlock.submit'
  | 'md3.locks.unlock.cancel'
  | 'md3.locks.unlock.forFun'
  | 'md3.locks.unlock.recovery'
  | 'md3.locks.unlock.recoveryUnknown'
  | 'md3.locks.unlock.forgotten'
  | 'md3.locks.unlock.forgottenUnavailable'
  | 'md3.locks.unlock.throttled'
  | 'md3.locks.unlock.unavailable'
  | 'md3.locks.unlock.success'
  | 'md3.locks.unlock.lockAgain'
  | 'md3.locks.unlock.minutesLabel'
  | 'md3.locks.menu.lockTab'
  | 'md3.locks.menu.lockGroup'
  | 'md3.locks.menu.editLock'
  | 'md3.locks.menu.removeLock'
  | 'md3.locks.menu.lockAgain'
  | 'md3.locks.menu.manage'
  | 'md3.locks.affordance.locked'
  | 'md3.locks.affordance.unlocked'
  | 'md3.locks.searchResult.locked'
  | 'md3.locks.bulkClose.excluded'
  | 'md3.locks.settings.title'
  | 'md3.locks.settings.description'
  | 'md3.locks.setupLead.plain'
  | 'md3.locks.setupLead.light'
  | 'md3.locks.setupLead.playful'
  | 'md3.locks.setupLead.maximum'
  | 'md3.locks.unlockLead.plain'
  | 'md3.locks.unlockLead.light'
  | 'md3.locks.unlockLead.playful'
  | 'md3.locks.unlockLead.maximum'
  | 'md3.locks.wrongAttempt.plain'
  | 'md3.locks.wrongAttempt.light'
  | 'md3.locks.wrongAttempt.playful'
  | 'md3.locks.wrongAttempt.maximum'
  | 'md3.locks.managerLead.plain'
  | 'md3.locks.managerLead.light'
  | 'md3.locks.managerLead.playful'
  | 'md3.locks.managerLead.maximum'
  | 'md3.history.filterPlaceholder'
  | 'md3.history.fieldLabel'
  | 'md3.history.chipRowLabel'
  | 'md3.history.chip.unpushed'
  | 'md3.history.chip.tagged'
  | 'md3.history.chip.mine'
  | 'md3.history.chip.merges'
  | 'md3.history.toggleGraph'
  | 'md3.history.toggleDates'
  | 'md3.history.sortAndGroup'
  | 'md3.history.listLabel'
  | 'md3.history.empty'
  | 'md3.history.byline'
  | 'md3.history.detail'
  | 'md3.history.detailWithoutStats'
  | 'md3.history.kind.merge'
  | 'md3.history.kind.verified'
  | 'md3.history.kind.unverified'
  | 'md3.history.notPushed'
  | 'md3.history.pin'
  | 'md3.history.unpin'
  | 'md3.history.rowMenu'
  | 'md3.history.rowMenuHint'
  | 'md3.history.fileMenu'
  | 'md3.history.sheet.byline'
  | 'md3.history.sheet.close'
  | 'md3.history.sheet.copySha'
  | 'md3.history.sheet.fileCount'
  | 'md3.history.sheet.fileListLabel'
  | 'md3.history.sheet.fileEntry'
  | 'md3.history.sheet.viewOnGitHub'
  | 'md3.history.sheet.revert'
  | 'md3.history.sheet.menu'
  | 'md3.destructiveGate.eyebrow'
  | 'md3.destructiveGate.lead.plain'
  | 'md3.destructiveGate.lead.light'
  | 'md3.destructiveGate.lead.playful'
  | 'md3.destructiveGate.lead.maximum'
  | 'md3.destructiveGate.irreversibleLabel'
  | 'md3.destructiveGate.keysLegend'
  | 'md3.destructiveGate.keyTarget'
  | 'md3.destructiveGate.keyEffect'
  | 'md3.destructiveGate.sliderLabel'
  | 'md3.destructiveGate.sliderValue'
  | 'md3.destructiveGate.stateLocked'
  | 'md3.destructiveGate.stateArmed'
  | 'md3.destructiveGate.stateMoving'
  | 'md3.destructiveGate.stateAuthorized'
  | 'md3.destructiveGate.emergencyExit'
  | 'md3.destructiveGate.emergencyExitName'
  | 'md3.destructiveGate.busy'
  | 'md3.inbox.gate.title'
  | 'md3.inbox.gate.summary'
  | 'md3.inbox.gate.irreversible'
  | 'md3.inbox.gate.keyTarget'
  | 'md3.inbox.gate.keyEffect'
  | 'md3.inbox.gate.confirm'
  | 'md3.auth.pane'
  | 'md3.auth.list'
  | 'md3.auth.searchPlaceholder'
  | 'md3.auth.searchField'
  | 'md3.auth.invalidPattern'
  | 'md3.auth.filters'
  | 'md3.auth.chipUngrouped'
  | 'md3.auth.addFactor'
  | 'md3.auth.empty.none.plain'
  | 'md3.auth.empty.none.light'
  | 'md3.auth.empty.none.playful'
  | 'md3.auth.empty.none.maximum'
  | 'md3.auth.empty.noMatch'
  | 'md3.auth.selectAllFiltered'
  | 'md3.auth.selectAllEverything'
  | 'md3.auth.selectionCount'
  | 'md3.auth.invertSelection'
  | 'md3.auth.bulkGroup'
  | 'md3.auth.bulkDelete'
  | 'md3.auth.bulkExport'
  | 'md3.auth.scopedAction'
  | 'md3.auth.moreActions'
  | 'md3.auth.scope.selection'
  | 'md3.auth.scope.filtered'
  | 'md3.auth.scope.all'
  | 'md3.auth.scope.one'
  | 'md3.auth.explain.toggle'
  | 'md3.auth.explain.body'
  | 'md3.auth.explain.provenance'
  | 'md3.auth.row.select'
  | 'md3.auth.row.code'
  | 'md3.auth.row.codeChanged'
  | 'md3.auth.row.copyCode'
  | 'md3.auth.row.nextCode'
  | 'md3.auth.row.countdown'
  | 'md3.auth.row.countdownText'
  | 'md3.auth.row.missingSecret'
  | 'md3.auth.row.edit'
  | 'md3.auth.row.delete'
  | 'md3.auth.row.added'
  | 'md3.auth.row.parameters'
  | 'md3.auth.clock.ok'
  | 'md3.auth.clock.ahead'
  | 'md3.auth.clock.behind'
  | 'md3.auth.clock.unverified'
  | 'md3.auth.toast.registered'
  | 'md3.auth.toast.edited'
  | 'md3.auth.toast.deleted'
  | 'md3.auth.toast.deletedMany'
  | 'md3.auth.toast.vaultFailed'
  | 'md3.auth.toast.grouped'
  | 'md3.auth.toast.ungrouped'
  | 'md3.auth.toast.copied'
  | 'md3.auth.toast.exported'
  | 'md3.auth.toast.secretsExported'
  | 'md3.auth.toast.selectedAll'
  | 'md3.auth.toast.moved'
  | 'md3.auth.listMenu.title'
  | 'md3.auth.listMenu.selectFiltered'
  | 'md3.auth.listMenu.selectEverything'
  | 'md3.auth.listMenu.invert'
  | 'md3.auth.listMenu.clearSelection'
  | 'md3.auth.listMenu.group'
  | 'md3.auth.listMenu.deleteScope'
  | 'md3.auth.listMenu.export'
  | 'md3.auth.listMenu.exportSecrets'
  | 'md3.auth.rowMenu.title'
  | 'md3.auth.rowMenu.copyCode'
  | 'md3.auth.rowMenu.copyNext'
  | 'md3.auth.rowMenu.edit'
  | 'md3.auth.rowMenu.group'
  | 'md3.auth.rowMenu.moveUp'
  | 'md3.auth.rowMenu.moveDown'
  | 'md3.auth.rowMenu.select'
  | 'md3.auth.rowMenu.deselect'
  | 'md3.auth.rowMenu.delete'
  | 'md3.auth.rowMenu.exportOne'
  | 'md3.auth.exportMenu.title'
  | 'md3.auth.exportMenu.filterPlaceholder'
  | 'md3.auth.groupMenu.title'
  | 'md3.auth.groupMenu.filterPlaceholder'
  | 'md3.auth.groupMenu.ungrouped'
  | 'md3.auth.groupMenu.empty'
  | 'md3.auth.export.omissionNotice'
  | 'md3.auth.secrets.warning'
  | 'md3.auth.gate.title'
  | 'md3.auth.gate.summary'
  | 'md3.auth.gate.irreversible'
  | 'md3.auth.gate.keyTarget'
  | 'md3.auth.gate.keyEffect'
  | 'md3.auth.gate.confirm'
  | 'md3.auth.secretsGate.title'
  | 'md3.auth.secretsGate.summary'
  | 'md3.auth.secretsGate.irreversible'
  | 'md3.auth.secretsGate.keyTarget'
  | 'md3.auth.secretsGate.keyEffect'
  | 'md3.auth.secretsGate.confirm'
  | 'md3.auth.register.title'
  | 'md3.auth.register.editTitle'
  | 'md3.auth.register.close'
  | 'md3.auth.register.sourceLegend'
  | 'md3.auth.register.source.generate'
  | 'md3.auth.register.source.uri'
  | 'md3.auth.register.source.manual'
  | 'md3.auth.register.source.image'
  | 'md3.auth.register.source.clipboard'
  | 'md3.auth.register.source.camera'
  | 'md3.auth.register.hint.generate'
  | 'md3.auth.register.hint.uri'
  | 'md3.auth.register.hint.manual'
  | 'md3.auth.register.hint.image'
  | 'md3.auth.register.hint.clipboard'
  | 'md3.auth.register.hint.camera'
  | 'md3.auth.register.issuerLabel'
  | 'md3.auth.register.issuerPlaceholder'
  | 'md3.auth.register.accountLabel'
  | 'md3.auth.register.accountPlaceholder'
  | 'md3.auth.register.groupLabel'
  | 'md3.auth.register.groupPlaceholder'
  | 'md3.auth.register.algorithmLabel'
  | 'md3.auth.register.digitsLabel'
  | 'md3.auth.register.periodLabel'
  | 'md3.auth.register.secretLabel'
  | 'md3.auth.register.secretPlaceholder'
  | 'md3.auth.register.uriLabel'
  | 'md3.auth.register.uriPlaceholder'
  | 'md3.auth.register.revealSecret'
  | 'md3.auth.register.hideSecret'
  | 'md3.auth.register.secretHidden'
  | 'md3.auth.register.copySecret'
  | 'md3.auth.register.copiedSecret'
  | 'md3.auth.register.qrAlt'
  | 'md3.auth.register.qrAltNoIssuer'
  | 'md3.auth.register.qrCaption'
  | 'md3.auth.register.parameterSummary'
  | 'md3.auth.register.chooseImage'
  | 'md3.auth.register.readClipboard'
  | 'md3.auth.register.startCamera'
  | 'md3.auth.register.stopCamera'
  | 'md3.auth.register.cameraLive'
  | 'md3.auth.register.cameraPreview'
  | 'md3.auth.register.cameraMissing'
  | 'md3.auth.register.cameraRefused'
  | 'md3.auth.register.confirmHeading'
  | 'md3.auth.register.confirmHint.plain'
  | 'md3.auth.register.confirmHint.light'
  | 'md3.auth.register.confirmHint.playful'
  | 'md3.auth.register.confirmHint.maximum'
  | 'md3.auth.register.confirmLabel'
  | 'md3.auth.register.confirmPlaceholder'
  | 'md3.auth.register.verifyFailed'
  | 'md3.auth.register.add'
  | 'md3.auth.register.save'
  | 'md3.auth.register.cancel'
  | 'md3.auth.register.error.badUri'
  | 'md3.auth.register.error.wrongType'
  | 'md3.auth.register.error.badSecret'
  | 'md3.auth.register.error.missingAccount'
  | 'md3.auth.register.error.noQr'
  | 'md3.auth.register.error.unreadableFile'
  | 'md3.auth.register.error.notSquare'
  | 'md3.auth.register.error.damaged'
  | 'md3.auth.register.error.unsupported'
  | 'md3.auth.register.error.encodeFailed'
  | 'md3.auth.register.error.accountRequired'
  | 'md3.auth.register.explain.toggle'
  | 'md3.auth.register.explain.storage'
  | 'md3.auth.register.explain.provenanceDefault'
  | 'md3.auth.register.explain.provenanceIssuer'
  | 'md3.bulk.selectAllFiltered'
  | 'md3.bulk.selectAllEverything'
  | 'md3.bulk.selectionCount'
  | 'md3.bulk.invertSelection'
  | 'md3.bulk.clearSelection'
  | 'md3.bulk.export'
  | 'md3.bulk.scopedAction'
  | 'md3.bulk.scopeSelected'
  | 'md3.bulk.scopeFiltered'
  | 'md3.bulk.scopeEverything'
  | 'md3.bulk.excluded'
  | 'md3.bulk.exportMenu.title'
  | 'md3.bulk.exportMenu.filterPlaceholder'
  | 'md3.bulk.toast.exported'
  | 'md3.bulk.toast.exportedLossy'
  | 'md3.listExport.schema'
  | 'md3.listExport.lossLineBreaks'
  | 'md3.destructiveGate.previewHeading'
  | 'md3.destructiveGate.previewExcludedHeading'
  | 'md3.branches.bulkLabel'
  | 'md3.branches.bulkPin'
  | 'md3.branches.bulkHide'
  | 'md3.branches.bulkDelete'
  | 'md3.branches.bulkCopyNames'
  | 'md3.branches.bulkSkipCurrent'
  | 'md3.branches.bulkSkipCannotHide'
  | 'md3.branches.row.select'
  | 'md3.branches.gate.title'
  | 'md3.branches.gate.summary'
  | 'md3.branches.gate.irreversible'
  | 'md3.branches.gate.keyTarget'
  | 'md3.branches.gate.keyEffect'
  | 'md3.branches.gate.confirm'
  | 'md3.branches.detail.notCompared'
  | 'md3.branches.detail.tracksGone'
  | 'md3.branches.mergeAllProgressUnknown'
  | 'md3.branches.mergeAllProgressBranchUnknown'
  | 'md3.history.bulkLabel'
  | 'md3.history.bulkCopyShas'
  | 'md3.history.row.select'
  | 'md3.history.detailWithoutBranch'
  | 'md3.history.detailWithoutStatsOrBranch'
  | 'md3.history.sheet.statsPending'
  | 'md3.history.sheet.fileEntryWithoutStats'
  | 'md3.actions.meta.number'
  | 'md3.actions.detail.actor'
  | 'md3.actions.detail.jobs'
  | 'md3.actions.detail.attempt'
  | 'md3.actions.status.queued'
  | 'md3.actions.status.running'
  | 'md3.actions.status.success'
  | 'md3.actions.status.failed'
  | 'md3.actions.status.cancelled'
  | 'md3.actions.status.skipped'
  | 'md3.actions.status.neutral'
  | 'md3.actions.status.timedOut'
  | 'md3.actions.status.actionRequired'
  | 'md3.actions.status.stale'
  | 'md3.actions.status.startupFailure'
  | 'md3.adapters.day.today'
  | 'md3.adapters.day.yesterday'
  | 'md3.adapters.branch.pullRequestOpen'
  | 'md3.adapters.branch.metaUpdatedBy'
  | 'md3.adapters.agent.busy'
  | 'md3.adapters.agent.noAgent'
  | 'md3.adapters.agent.noInstruction'
  | 'md3.adapters.agent.noRunner'
  | 'md3.adapters.agent.instructionSentTitle'
  | 'md3.adapters.agent.instructionSentBody'
  | 'md3.adapters.agent.instructionRefusedTitle'
  | 'md3.adapters.agent.permissions.read'
  | 'md3.adapters.agent.permissions.commit'
  | 'md3.adapters.agent.permissions.push'
  | 'md3.adapters.agent.permissions.none'
  | 'md3.adapters.agent.permissions.granted'
  | 'md3.adapters.agent.permissions.asks'
  | 'md3.inbox.time.unknown'
  | 'md3.repositories.remotesUnknown'
  | 'md3.terminal.alreadyRunning'
  | 'md3.terminal.noRepository'
  | 'md3.terminal.sessionLabelNumbered'
  | 'md3.compose.contextWithoutStats'
  | 'md3.diffPane.fileTabNameWithoutStats'
  | 'md3.search.invalidPattern'
  | 'md3.search.patternTooLong'
  | 'palette.authenticator'
  | 'palette.authenticatorDescription'
  | 'palette.surfaceLocks'
  | 'palette.surfaceLocksDescription'
  | 'palette.supportTickets'
  | 'palette.supportTicketsDescription'
  | 'authenticatorSettings.heading'
  | 'authenticatorSettings.manage'
  | 'authenticatorSettings.close'
  | 'authenticatorSettings.explanationSummary'
  | 'authenticatorSettings.boundaryNote'
  | 'authenticatorSettings.provenanceNone'
  | 'authenticatorSettings.provenanceOne'
  | 'authenticatorSettings.provenanceMany'
  | 'authenticatorSettings.provenanceUnread'
  | 'authenticatorSettings.unavailable'
  | 'surfaceLocks.heading'
  | 'surfaceLocks.manage'
  | 'surfaceLocks.close'
  | 'surfaceLocks.explanationSummary'
  | 'surfaceLocks.boundaryNote'
  | 'surfaceLocks.provenanceNone'
  | 'surfaceLocks.provenanceOne'
  | 'surfaceLocks.provenanceMany'
  | 'supportTicketsSetting.explanationSummary'
  | 'supportTicketsSetting.boundaryNote'
  | 'supportTicketsSetting.provenanceNone'
  | 'supportTicketsSetting.provenanceOne'
  | 'supportTicketsSetting.provenanceMany'
  | 'md3.agents.bulkLabel'
  | 'md3.agents.bulkPause'
  | 'md3.agents.bulkResume'
  | 'md3.agents.bulkOpenLog'
  | 'md3.agents.bulkDuplicate'
  | 'md3.agents.bulkDelete'
  | 'md3.agents.bulkSkipNotRunning'
  | 'md3.agents.bulkSkipNotPaused'
  | 'md3.agents.bulkSkipMissing'
  | 'md3.agents.bulkSkipProtected'
  | 'md3.agents.gate.title'
  | 'md3.agents.gate.summary'
  | 'md3.agents.gate.irreversible'
  | 'md3.agents.gate.keyTarget'
  | 'md3.agents.gate.keyEffect'
  | 'md3.agents.gate.confirm'
  | 'md3.agents.row.select'
  | 'md3.changes.bulkLabel'
  | 'md3.changes.bulkInclude'
  | 'md3.changes.bulkExclude'
  | 'md3.changes.bulkCopyPaths'
  | 'md3.changes.bulkDiscard'
  | 'md3.changes.bulkSkipIncluded'
  | 'md3.changes.bulkSkipExcluded'
  | 'md3.changes.row.select'
  | 'md3.changes.gate.title'
  | 'md3.changes.gate.summary'
  | 'md3.changes.gate.irreversible'
  | 'md3.changes.gate.keyTarget'
  | 'md3.changes.gate.keyEffect'
  | 'md3.changes.gate.confirm'
  | 'md3.history.bulkPin'
  | 'md3.history.bulkViewOnGitHub'
  | 'md3.history.bulkRevert'
  | 'md3.history.bulkSkipMerge'
  | 'md3.history.gate.title'
  | 'md3.history.gate.summary'
  | 'md3.history.gate.irreversible'
  | 'md3.history.gate.keyTarget'
  | 'md3.history.gate.keyEffect'
  | 'md3.history.gate.confirm'
  | 'md3.history.kind.unchecked'
  | 'md3.repositories.bulkSkipMissing'
  | 'md3.actions.bulkSkipActive'
  | 'md3.actions.bulkSkipFinished'
  | 'md3.actions.gate.title'
  | 'md3.actions.gate.summary'
  | 'md3.actions.gate.irreversible'
  | 'md3.actions.gate.keyTarget'
  | 'md3.actions.gate.keyEffect'
  | 'md3.actions.gate.confirm'
  | 'md3.terminal.bulkLabel'
  | 'md3.terminal.bulkRestart'
  | 'md3.terminal.bulkClose'
  | 'md3.terminal.bulkSelected'
  | 'md3.terminal.bulkSkipNotRunning'
  | 'md3.terminal.bulkSkipHealthy'
  | 'md3.terminal.gate.title'
  | 'md3.terminal.gate.summary'
  | 'md3.terminal.gate.irreversible'
  | 'md3.terminal.gate.keyTarget'
  | 'md3.terminal.gate.keyEffect'
  | 'md3.terminal.gate.confirm'
  | 'md3.inbox.bulkLabel'
  | 'md3.inbox.bulkMute'
  | 'md3.inbox.bulkUnmute'
  | 'md3.inbox.bulkCopyDetails'
  | 'md3.inbox.bulkSkipAlreadyRead'
  | 'md3.inbox.bulkSkipAlreadyUnread'
  | 'md3.inbox.bulkSkipAlreadyMuted'
  | 'md3.inbox.bulkSkipNotMuted'
  | 'md3.inbox.toast.mutedMany'
  | 'md3.inbox.toast.unmutedMany'
  | 'md3.locks.bulkLabel'
  | 'md3.locks.bulkLockAgain'
  | 'md3.locks.bulkRemove'
  | 'md3.locks.bulkSkipAlreadyLocked'
  | 'md3.repositories.empty.plain'
  | 'md3.repositories.empty.light'
  | 'md3.repositories.empty.playful'
  | 'md3.repositories.empty.maximum'
  | 'md3.changes.empty.plain'
  | 'md3.changes.empty.light'
  | 'md3.changes.empty.playful'
  | 'md3.changes.empty.maximum'
  | 'md3.history.empty.plain'
  | 'md3.history.empty.light'
  | 'md3.history.empty.playful'
  | 'md3.history.empty.maximum'
  | 'md3.branches.empty.plain'
  | 'md3.branches.empty.light'
  | 'md3.branches.empty.playful'
  | 'md3.branches.empty.maximum'
  | 'md3.actions.logEmpty.plain'
  | 'md3.actions.logEmpty.light'
  | 'md3.actions.logEmpty.playful'
  | 'md3.actions.logEmpty.maximum'
  | 'md3.agents.emptyNoSessions.plain'
  | 'md3.agents.emptyNoSessions.light'
  | 'md3.agents.emptyNoSessions.playful'
  | 'md3.agents.emptyNoSessions.maximum'
  | 'md3.inbox.empty.caughtUp.plain'
  | 'md3.inbox.empty.caughtUp.light'
  | 'md3.inbox.empty.caughtUp.playful'
  | 'md3.inbox.empty.caughtUp.maximum'
  | 'md3.terminal.noSessions.plain'
  | 'md3.terminal.noSessions.light'
  | 'md3.terminal.noSessions.playful'
  | 'md3.terminal.noSessions.maximum'
  | 'surfaceLocks.explanation.plain'
  | 'surfaceLocks.explanation.light'
  | 'surfaceLocks.explanation.playful'
  | 'surfaceLocks.explanation.maximum'
  | 'authenticatorSettings.explanation.plain'
  | 'authenticatorSettings.explanation.light'
  | 'authenticatorSettings.explanation.playful'
  | 'authenticatorSettings.explanation.maximum'
  | 'supportTicketsSetting.explanation.plain'
  | 'supportTicketsSetting.explanation.light'
  | 'supportTicketsSetting.explanation.playful'
  | 'supportTicketsSetting.explanation.maximum'
  | 'md3.changes.filter.new'
  | 'md3.changes.filter.modified'
  | 'md3.changes.filter.deleted'
  | 'md3.changes.filter.included'
  | 'md3.changes.filter.excluded'
  | 'md3.inbox.kind.prReviewSubmit'
  | 'md3.inbox.kind.prComment'
  | 'md3.inbox.kind.prChecksFailed'
  | 'md3.inbox.kind.appError'
  | 'md3.inbox.kind.cloneBatch'
  | 'md3.inbox.kind.autoCommit'
  | 'md3.inbox.kind.mergeAll'
  | 'md3.inbox.kind.autoPull'
  | 'md3.inbox.kind.cheapLfs'
  | 'md3.inbox.kind.buildRun'
  | 'md3.inbox.kind.info'
  | 'settingsSearch.entry.appearanceSurfaceLocks.title'
  | 'settingsSearch.entry.appearanceSurfaceLocks.desc'
  | 'settingsSearch.entry.appearanceSupportTickets.title'
  | 'settingsSearch.entry.appearanceSupportTickets.desc'
  | 'settingsSearch.entry.advancedAuthenticator.title'
  | 'settingsSearch.entry.advancedAuthenticator.desc'
  | 'classicExperience.heading'
  | 'classicExperience.toggleLabel'
  | 'classicExperience.explanationSummary'
  | 'classicExperience.explanation.plain'
  | 'classicExperience.explanation.light'
  | 'classicExperience.explanation.playful'
  | 'classicExperience.explanation.maximum'
  | 'classicExperience.boundaryNote'
  | 'classicExperience.provenanceDefault'
  | 'classicExperience.provenanceStored'
  | 'classicExperience.stateOn'
  | 'classicExperience.stateOff'
  | 'md3.classicSection.releases'
  | 'md3.classicSection.issues'
  | 'md3.classicSection.triage'
  | 'md3.classicSection.cheapLfs'
  | 'md3.classicSection.launchpad'
  | 'md3.classicSection.historyGraph'

/** Complete base catalog. Every missing locale entry falls back to this. */
export const englishTranslations: Readonly<Record<TranslationKey, string>> = {
  'supportTickets.title': 'Support Tickets',
  'supportTickets.subtitle':
    'A local desk for getting back into a lock you set yourself.',
  'supportTickets.entry.unlockPrompt': 'Forgotten your password?',
  'supportTickets.entry.lockSetting': 'Support Tickets',
  'supportTickets.entry.help': 'Support Tickets',
  'supportTickets.entry.accessibleName':
    '{label} — open the local Support Tickets desk',
  'supportTickets.arrivedFrom.unlockPrompt':
    'You arrived from the unlock prompt.',
  'supportTickets.arrivedFrom.lockSetting':
    'You arrived from the lock setting.',
  'supportTickets.arrivedFrom.help': 'You arrived from Help.',
  'supportTickets.close': 'Close the desk',
  'supportTickets.disclosure':
    'Nothing here is sent anywhere. No ticket exists outside this machine, no network request is made, no data is collected, and nobody is reading it. Do not wait for a reply.',
  'supportTickets.deskLead.plain':
    'Fill in a ticket to record what happened, then open the resolution below. The resolution is the only step that changes anything.',
  'supportTickets.deskLead.light':
    'Take a ticket, tell it your troubles, then open the resolution below — that last step is the one that actually does something.',
  'supportTickets.deskLead.playful':
    'Welcome to the desk. Take a ticket, describe the disaster in your own words, and admire the status as it advances. The resolution below is the only part that actually does anything.',
  'supportTickets.deskLead.maximum':
    'Welcome to the desk. There is one chair, no queue, and the entire staff is a switch statement. Take a ticket, describe the disaster in loving detail, and watch the status advance with the solemnity of an institution. The resolution below is the only part that actually does anything.',
  'supportTickets.explain.summary': 'How this desk behaves',
  'supportTickets.explain.body':
    'Tickets are written to this profile only, on this machine. Numbers are generated here, statuses advance only when you advance them, and severity changes nothing. The resolution opens the application data folder in your file manager; deleting it is your own action, in your own file manager, and this app never deletes it for you.',
  'supportTickets.provenance.stored':
    'Value from this profile’s local ticket store: {count} recorded.',
  'supportTickets.provenance.default':
    'No ticket store has been written yet, so the desk is showing its shipped default: an empty queue.',
  'supportTickets.form.legend': 'Raise a ticket',
  'supportTickets.form.category': 'Category',
  'supportTickets.form.categoryHint':
    'Recorded on the ticket and included in every export. It does not route the ticket anywhere, because there is nowhere to route it to.',
  'supportTickets.form.severity': 'Severity',
  'supportTickets.form.severityHint':
    'Recorded and shown, and honoured by nobody: every severity behaves identically, because there is no queue and no agent.',
  'supportTickets.form.description': 'What happened',
  'supportTickets.form.descriptionHint':
    '{used} of {max} characters. Stored on this machine only.',
  'supportTickets.form.descriptionRequired':
    'Describe what happened before raising the ticket.',
  'supportTickets.form.submit': 'Raise ticket',
  'supportTickets.category.forgottenPassword': 'I have forgotten a password',
  'supportTickets.category.lostAuthenticator': 'I have lost my authenticator',
  'supportTickets.category.lockedTab': 'A tab is locked',
  'supportTickets.category.lockedAppearance': 'An appearance setting is locked',
  'supportTickets.category.somethingElse': 'Something else',
  'supportTickets.severity.whenever': 'Whenever',
  'supportTickets.severity.normal': 'Normal',
  'supportTickets.severity.urgent': 'Urgent',
  'supportTickets.severity.critical': 'Critical, business stopped',
  'supportTickets.searchPlaceholder': 'Search tickets',
  'supportTickets.searchField': 'support tickets',
  'supportTickets.invalidPattern':
    'That regular expression is not valid, so every ticket is still shown.',
  'supportTickets.filters': 'Ticket filters',
  'supportTickets.chip.open': 'Open',
  'supportTickets.chip.resolved': 'Resolved',
  'supportTickets.chip.urgent': 'Urgent or critical',
  'supportTickets.list': 'Support tickets',
  'supportTickets.empty.none':
    'No tickets yet. Raise one above if you would like the full experience.',
  'supportTickets.empty.noMatch':
    'No ticket matches the current search and filters.',
  'supportTickets.row.select': 'Select ticket {number}',
  'supportTickets.row.advance': 'Advance ticket {number}',
  'supportTickets.row.delete': 'Delete ticket {number}',
  'supportTickets.row.detail': '{category} · {severity} · {status}',
  'supportTickets.row.opened': 'Raised {timestamp}',
  'supportTickets.row.responses': '{count} desk responses',
  'supportTickets.status.received': 'Received',
  'supportTickets.status.triaged': 'Triaged',
  'supportTickets.status.awaitingCustomer': 'Awaiting customer',
  'supportTickets.status.resolved': 'Resolved',
  'supportTickets.response.acknowledged.plain':
    'Ticket received. It was written to this machine and to nowhere else. The resolution is below.',
  'supportTickets.response.acknowledged.light':
    'Thank you for contacting the desk. Your ticket was filed on this machine, where it will remain. The resolution is below.',
  'supportTickets.response.acknowledged.playful':
    'Thank you for contacting Support. Your ticket has been logged and assigned to a highly qualified switch statement. No human has been notified, because there is no human. The resolution is below.',
  'supportTickets.response.acknowledged.maximum':
    'Thank you for contacting Support. Your ticket has been logged, stamped, filed and assigned to a highly qualified switch statement, which has read the manual once and remembers most of it. Your case is important to us in the sense that it is stored on your own disk. No human has been notified, because there is no human. The resolution is below.',
  'supportTickets.response.triaged':
    'Triaged. The category and severity were recorded, and neither changed anything.',
  'supportTickets.response.awaitingCustomer':
    'Awaiting customer: the remaining step is yours. Open the folder below and delete it yourself.',
  'supportTickets.response.resolved':
    'Resolved. The desk has nothing further; the resolution below is what it had all along.',
  'supportTickets.responseAt': 'Recorded {time}',
  'supportTickets.correspondence': 'Desk responses for ticket {number}',
  'supportTickets.selectAllFiltered': 'Select the {count} matching tickets',
  'supportTickets.selectAllEverything': 'Select all {count} tickets',
  'supportTickets.selectionCount': '{count} selected',
  'supportTickets.invertSelection': 'Invert selection',
  'supportTickets.bulkAdvance': 'Advance',
  'supportTickets.bulkExport': 'Export',
  'supportTickets.bulkDelete': 'Delete',
  'supportTickets.bulkScoped': '{label} — {scope}',
  'supportTickets.scope.selection': '{count} selected tickets',
  'supportTickets.scope.filtered':
    'the {count} tickets matching the current search and filters',
  'supportTickets.scope.all': 'all {count} tickets',
  'supportTickets.moreActions': 'More ticket actions',
  'supportTickets.listMenu.title': 'Tickets',
  'supportTickets.listMenu.selectFiltered':
    'Select the {count} matching tickets',
  'supportTickets.listMenu.selectEverything': 'Select all {count} tickets',
  'supportTickets.listMenu.invert': 'Invert selection',
  'supportTickets.listMenu.clearSelection': 'Clear selection',
  'supportTickets.listMenu.advanceScope': 'Advance {count} tickets',
  'supportTickets.listMenu.export': 'Export {count} tickets…',
  'supportTickets.listMenu.deleteScope': 'Delete {count} tickets…',
  'supportTickets.rowMenu.title': 'Ticket {number}',
  'supportTickets.rowMenu.advance': 'Advance this ticket',
  'supportTickets.rowMenu.copyNumber': 'Copy ticket number',
  'supportTickets.rowMenu.export': 'Export this ticket…',
  'supportTickets.rowMenu.delete': 'Delete this ticket',
  'supportTickets.rowMenu.select': 'Select this ticket',
  'supportTickets.rowMenu.deselect': 'Deselect this ticket',
  'supportTickets.export.saveDialogTitle': 'Export support tickets',
  'supportTickets.exportMenu.title': 'Export format',
  'supportTickets.exportMenu.filterPlaceholder': 'Filter formats',
  'supportTickets.menuFilterPlaceholder': 'Filter this menu',
  'supportTickets.toast.created': 'Ticket {number} raised on this machine.',
  'supportTickets.toast.advanced': 'Ticket {number} is now {status}.',
  'supportTickets.toast.alreadyResolved':
    'Ticket {number} is already resolved; there is no further status.',
  'supportTickets.toast.deleted': 'Ticket {number} deleted.',
  'supportTickets.toast.deletedMany': '{count} tickets deleted.',
  'supportTickets.toast.exported': '{count} tickets serialized as {format}.',
  'supportTickets.toast.copied': 'Ticket number {number} copied.',
  'supportTickets.toast.selectedAll': 'Selected all {count} tickets.',
  'supportTickets.toast.copiedPath': 'Copied the folder path: {path}',
  'supportTickets.toast.folderOpened': 'Opened {path} in your file manager.',
  'supportTickets.toast.folderFailed':
    'The file manager could not open {path}. It reported: {error}',
  'supportTickets.toast.folderUnavailable':
    'No folder could be opened. {error}',
  'supportTickets.resolution.heading': 'Resolution',
  'supportTickets.resolution.lead.plain':
    'Open the application data folder and delete it yourself. That resets every lock in this app.',
  'supportTickets.resolution.lead.light':
    'Here is the whole solution: open the application data folder and delete it yourself. That resets every lock in this app.',
  'supportTickets.resolution.lead.playful':
    'After extensive investigation, the desk recommends the following: open the application data folder and delete it yourself. That resets every lock in this app.',
  'supportTickets.resolution.lead.maximum':
    'After extensive investigation, escalation to a second switch statement, and a brief internal review conducted entirely by this paragraph, the desk recommends the following: open the application data folder and delete it yourself. That resets every lock in this app. Please rate this experience out of nothing.',
  'supportTickets.resolution.pathLabel': 'Application data folder',
  'supportTickets.resolution.pathResolving':
    'Resolving the folder from the running application…',
  'supportTickets.resolution.pathUnavailable':
    'The folder could not be resolved, so there is nothing to open. Its usual location is the app data directory of your user profile.',
  'supportTickets.resolution.pathProvenanceResolved':
    'Value from the running application, not a guess: this is the folder the Open button opens.',
  'supportTickets.resolution.pathProvenanceUnresolved':
    'No value from the running application yet, so no folder is shown and the Open button stays unavailable.',
  'supportTickets.resolution.open': 'Open the folder',
  'supportTickets.resolution.copyPath': 'Copy the path',
  'supportTickets.resolution.neverDeletes':
    'This app opens the folder and stops there. It never deletes it for you.',
  'supportTickets.resolution.opened': 'Opened {path} in your file manager.',
  'supportTickets.resolution.failed':
    'The file manager could not open {path}. It reported: {error}',
  'supportTickets.resolution.unavailable': 'No folder could be opened. {error}',
  'supportTickets.gate.eyebrow': 'Irreversible in one gesture',
  'supportTickets.gate.title': 'Delete {count} tickets',
  'supportTickets.gate.description':
    'This deletes {count} tickets — {scope} — from this machine. Their descriptions and desk responses go with them, and there is no undo.',
  'supportTickets.gate.keysLegend': 'Turn both keys',
  'supportTickets.gate.keyCount':
    'I understand {count} tickets will be deleted',
  'supportTickets.gate.keyScope': 'I understand this applies to {scope}',
  'supportTickets.gate.sliderLabel': 'Slide to authorize ({percent}%)',
  'supportTickets.gate.sliderValue':
    '{percent} percent of the way to authorized',
  'supportTickets.gate.statusLocked':
    'Both keys are still off. Nothing can be deleted yet.',
  'supportTickets.gate.statusReady':
    'Both keys are turned. Slide all the way across to authorize.',
  'supportTickets.gate.statusMoving':
    'Authorizing. Release before the end to stop.',
  'supportTickets.gate.statusAuthorized':
    'Authorized. Delete is now available.',
  'supportTickets.gate.emergencyExit': 'Emergency exit',
  'supportTickets.gate.confirm': 'Delete {count} tickets',
  'settingsSearch.entry.appearanceLanguageMode.title': 'Language mode',
  'settingsSearch.entry.appearanceLanguageMode.desc':
    'Choose English, playful Hong Kong Cantonese, or a compact bilingual view.',
  'settingsSearch.entry.appearanceTone.title': 'Funny level (tone)',
  'settingsSearch.entry.appearanceTone.desc':
    'Independent English and Cantonese sliders from 1 (fully serious) to 5 (maximum playfulness). Styles every message including errors and warnings, never the facts.',
  'lazyView.loading.plain': 'Loading {name}…',
  'lazyView.loading.light': 'Fetching {name}. The rest of the app still works.',
  'lazyView.loading.playful':
    'Waking {name} up. Everything else keeps working while it stretches.',
  'lazyView.loading.maximum':
    'Sending {name} a very polite wake-up call. It says it is doing its hair. Everything else clocked in ages ago.',
  'lazyView.failedTitle': '{name} could not be loaded',
  'lazyView.failedBody.plain':
    'Nothing else in the app was affected. Select Try again to load {name} once more.',
  'lazyView.failedBody.light':
    'Only {name} is affected — the rest of the app is fine. Select Try again to load it once more.',
  'lazyView.failedBody.playful':
    '{name} tripped on the doorstep; the rest of the app never noticed. Select Try again to give it another go.',
  'lazyView.failedBody.maximum':
    '{name} went for a dramatic entrance and missed the stage entirely; the rest of the app kept the show running without dropping a beat. Select Try again to send it back on.',
  'lazyView.failedDetail': 'Reported error: {error}',
  'lazyView.retry': 'Try again',
  'lazyView.notificationTitle': 'Could not open {name}',
  'lazyView.notificationBody':
    '{name} failed to load and is showing a retry button. Nothing else was affected. Reported error: {error}',
  'lazyView.section.actions': 'Actions',
  'lazyView.section.releases': 'Releases',
  'lazyView.section.issues': 'Issues',
  'lazyView.section.triage': 'Triage',
  'lazyView.section.tools': 'Repository tools',
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
  'startup.loading': 'Opening your workspace…',
  'repositorySection.actions': 'Actions',
  'repositorySection.releases': 'Releases',
  'repositorySection.issues': 'Issues',
  'repositorySection.triage': 'Triage',
  'repositorySection.tools': 'Repository tools',
  'repositorySection.launchpad': 'Launchpad',
  'repositorySection.historyGraph': 'Graph',
  'update.downloadingLabel': 'Downloading app update',
  'update.downloadingValue': 'Downloading',
  'update.comingSoon': 'New update coming soon',
  'update.comingSoon.showDetails': 'Show more details',
  'update.comingSoon.hideDetails': 'Hide details',
  'update.comingSoon.detailsLabel': 'Coming update details',
  'update.comingSoon.estimateNotice':
    'This is an estimate derived from public build signals, not a promise.',
  'update.comingSoon.etaMinutes': 'Estimated in about {count} min',
  'update.comingSoon.etaHours': 'Estimated in about {count} h',
  'update.comingSoon.etaDays': 'Estimated in about {count} days',
  'update.comingSoon.etaShortly': 'Estimated to arrive shortly',
  'update.comingSoon.etaAnyMinute': 'Estimated to arrive any minute now',
  'update.comingSoon.etaUnknown': 'No arrival time can be estimated yet',
  'update.comingSoon.durationMinutes': '{count} min',
  'update.comingSoon.durationHours': '{count} h',
  'update.comingSoon.durationDays': '{count} days',
  'update.comingSoon.targetLabel': 'Target version',
  'update.comingSoon.targetUnknown': 'Not tagged yet',
  'update.comingSoon.signalLabel': 'Driving signal',
  'update.comingSoon.signalBuildRunning':
    'A Windows build for a newer commit is running now',
  'update.comingSoon.signalAwaitingRelease':
    'A newer commit built successfully; no release carries it yet',
  'update.comingSoon.signalNewerCommit':
    'A newer commit is on main; no build has finished for it yet',
  'update.comingSoon.basisLabel': 'Estimate basis',
  'update.comingSoon.basisRunningWorkflow':
    'Median duration of the last {count} successful runs, minus the time this run has already taken',
  'update.comingSoon.basisRunningWorkflowUnmeasured':
    'A run is in progress, but no finished run was readable to time it against',
  'update.comingSoon.basisGreenCI':
    'The build already passed, so only the publishing step is outstanding',
  'update.comingSoon.basisCadence':
    'Median gap between the last {count} published releases, measured from the newest one',
  'update.comingSoon.basisCadenceUnmeasured':
    'Not enough published releases to measure a cadence',
  'update.comingSoon.cadenceLabel': 'Recent cadence',
  'update.comingSoon.cadenceValue':
    'About one release every {gap}, over {count} gaps',
  'update.comingSoon.cadenceUnknown': 'Not measured',
  'update.comingSoon.commitLabel': 'Commit',
  'update.comingSoon.viewCommit': 'Compare on GitHub',
  'update.comingSoon.viewRun': 'View the build run',
  'update.comingSoon.latestReleaseLabel': 'Latest published release',
  'update.comingSoon.latestReleaseUnknown': 'Unknown',
  'appearance.updateProgressColor': 'Update progress color',
  'appearance.useAccentColor': 'Use accent color',
  'appearance.languageMode': 'Language',
  'appearance.languageModeDescription':
    'Choose English, playful Hong Kong Cantonese, or a compact bilingual view.',
  'appearance.languageAndNavigation': 'Language',
  'appearance.playfulnessHeading': 'Playfulness',
  'appearance.playfulnessDescription':
    'Choose each language’s tone independently. 1 stays fully serious; 5 is maximum fun. Facts, errors, and safety messages stay clear at every level.',
  'appearance.englishPlayfulness': 'English playfulness',
  'appearance.cantonesePlayfulness': 'Cantonese playfulness',
  'appearance.playfulnessValue': 'Level {value} of 5',
  'appearance.playfulnessSerious': '1 · Fully serious',
  'appearance.playfulnessMaximum': '5 · Maximum fun',
  'dialogEmoji.heading': 'Dialogs and message boxes',
  'dialogEmoji.toggleLabel': 'Show emojis in dialogs and message boxes',
  'dialogEmoji.explanationSummary': 'What this setting changes',
  'dialogEmoji.explanation.plain':
    'When this is on, a dialog or message box shows one emoji beside its title, chosen for the kind of dialog it is. When it is off, the same dialog shows the same words without the emoji. No wording changes either way, and the emoji never appears in a button, an action label, a field label, or anything a screen reader announces.',
  'dialogEmoji.explanation.light':
    'On means a dialog gets one small emoji beside its title, picked to suit the kind of dialog it is. Off means the same dialog, the same words, one fewer picture. Nothing is reworded, and the emoji stays out of buttons, action labels, field labels, and everything a screen reader announces.',
  'dialogEmoji.explanation.playful':
    'Flip this on and every dialog turns up wearing one emoji beside its title, chosen to match the occasion. Flip it off and the same dialog turns up in plain clothes saying exactly the same thing. The words never change, and the emoji is barred from buttons, action labels, field labels, and anything a screen reader reads out.',
  'dialogEmoji.explanation.maximum':
    'On, and every dialog arrives with one emoji pinned beside its title like a little enamel badge for the occasion. Off, and the very same dialog arrives badge-free, saying precisely the same thing in precisely the same words. The badge is decoration and knows it: it is banned from buttons, action labels, field labels, and everything a screen reader announces, so nobody is ever asked to interpret a picture to work out what a button does.',
  'dialogEmoji.boundaryNote':
    'The emoji is decoration only. It is hidden from screen readers and never appears in a button, an action label, or a field label.',
  'dialogEmoji.provenanceDefault':
    'No choice has been recorded on this computer, so the shipped value is in use: {value}.',
  'dialogEmoji.provenanceStored':
    'A choice was recorded on this computer: {value}.',
  'dialogEmoji.stateOn': 'shown',
  'dialogEmoji.stateOff': 'hidden',
  'palette.showDialogEmoji': 'Show emojis in dialogs and message boxes',
  'palette.showDialogEmojiDescription':
    'Add one decorative emoji beside a dialog title. The wording is identical either way, and the emoji never reaches a button, a label, or a screen reader.',
  'settingsSearch.entry.appearanceDialogEmoji.title':
    'Show emojis in dialogs and message boxes',
  'settingsSearch.entry.appearanceDialogEmoji.desc':
    'Decorate dialog titles with one emoji, or keep the same copy without it.',
  'palette.showClassicToolbar': 'Show the classic toolbar',
  'palette.showClassicToolbarDescription':
    'Keep the toolbar band above the content pane. Turning it off loses nothing: every action it carries is also on the pane header or in the pane menu.',
  'settingsSearch.entry.appearanceClassicToolbar.title':
    'Show the classic toolbar',
  'settingsSearch.entry.appearanceClassicToolbar.desc':
    'Show or hide the toolbar band the MD3 shell replaced. Its actions stay reachable from the pane header and the pane menu either way.',
  'appearance.schoolModeHeading': '{name}',
  'appearance.schoolModeDescription':
    '{name} forces English and temporarily hides Cantonese, bilingual, funny-level, and dim sum presentation. This is a local presentation lock, not a security boundary.',
  'appearance.schoolModeName': '{name} name',
  'appearance.schoolModeNameDescription':
    'Choose the name shown for {name} across the app. The application identity and data location do not change.',
  'appearance.schoolModeEnabled': 'Enable {name}',
  'appearance.schoolModeCredential': 'Unlock credential',
  'appearance.schoolModeCredentialConfirm': 'Confirm unlock credential',
  'appearance.schoolModeUnlockDescription':
    'Enter the locally verified unlock credential to turn {name} off. The credential is stored only as a salted local digest.',
  'appearance.schoolModeResetDescription':
    'If the credential is lost, deleting the local application profile resets {name}; it does not protect data from someone who can access that profile.',
  'appearance.schoolModeEnable': 'Enable {name}',
  'appearance.schoolModeDisable': 'Turn off {name}',
  'appearance.schoolModeCredentialInvalid':
    'Use an unlock credential between 4 and 128 characters.',
  'appearance.schoolModeCredentialMismatch':
    'The two unlock credential entries do not match.',
  'appearance.schoolModeCredentialError':
    'The unlock credential was not accepted, or local credential storage is unavailable.',
  'appearance.elementGestureHeading': 'Element appearance',
  // Every band names the same three facts: the gesture that opens an element's
  // appearance editor, what a plain right-click does instead, and the keyboard
  // route. Only the voice moves.
  'appearance.elementGesture.plain':
    'Shift+Right-click an element to open its appearance editor. A plain right-click opens that element’s ordinary menu instead. From the keyboard, focus the element and press Shift+F10 or the Menu key. Each element keeps its settings and history separate.',
  'appearance.elementGesture.light':
    'Want to restyle something? Shift+Right-click it and its appearance editor opens. A plain right-click stays out of the way and opens that element’s ordinary menu. From the keyboard, focus the element and press Shift+F10 or the Menu key. Each element keeps its settings and history separate.',
  'appearance.elementGesture.playful':
    'Hold Shift, right-click anything, and its appearance editor pops out ready for a fresh coat of paint. A plain right-click keeps its day job: that element’s ordinary menu. Keyboard fans, focus the element and hit Shift+F10 or the Menu key. Every element hoards its own settings and history like a squirrel.',
  'appearance.elementGesture.maximum':
    'Hold Shift, right-click anything at all, and its appearance editor bursts in with colour swatches like a renovation-show host. A plain right-click keeps its day job — that element’s ordinary menu, no drama. Keyboard purists: focus the element and press Shift+F10 or the Menu key for the same grand entrance. Every element hoards its own settings and history, so one button’s makeover never touches another’s wardrobe.',
  'appearance.scheduledSettingsHeading': 'Scheduled settings',
  'appearance.scheduledSettingsDescription':
    'Apply language, theme, and appearance customizations during local date and time windows. A schedule can also read a validated API or a Home Assistant boolean entity; external failures leave the local settings unchanged.',
  'appearance.scheduledSettingsRuleDetails': 'How this schedule works',
  'appearance.scheduledSettingsRuleHelp':
    'The rule matches the selected local weekdays and time window. Every day overrides the weekday checklist; a window that crosses midnight continues from the selected start day into the next local day.',
  'appearance.scheduledSettingsRuleProvenance':
    'Source: the active profile’s saved scheduled-settings-v1 record. New rules are seeded with {startTime}–{endTime}; the current values are stored with this rule.',
  'appearance.scheduledSettingsSourceDetails': 'About the value source',
  'appearance.scheduledSettingsSourceProvenance':
    'Source: {source}. Local values are saved with the rule; API values are fetched only from the validated endpoint; Home Assistant values are saved locally and gated by the selected boolean entity.',
  'appearance.scheduledSettingsValueDetails': 'About applied settings',
  'appearance.scheduledSettingsValueProvenance':
    'Source: the value payload for this rule. Only fields present in the payload change; all other appearance and language settings keep their saved values.',
  'appearance.scheduledSettingsAdd': 'Add schedule',
  'appearance.scheduledSettingsEmpty':
    'No schedules yet. Add one to give the app a timetable instead of making it guess.',
  'appearance.scheduledSettingsRule': 'Schedule {number}',
  'appearance.scheduledSettingsEnabled': 'Schedule is enabled',
  'appearance.scheduledSettingsAllDays': 'Every day',
  'appearance.scheduledSettingsWeekdays': 'Days of week',
  'appearance.scheduledSettingsStartDate': 'Start date (optional)',
  'appearance.scheduledSettingsEndDate': 'End date (optional)',
  'appearance.scheduledSettingsDateRangeInvalid':
    'End date must be on or after the start date. This schedule is paused until the range is corrected.',
  'appearance.scheduledSettingsStartTime': 'Start time',
  'appearance.scheduledSettingsEndTime': 'End time',
  'appearance.scheduledSettingsTimeZone':
    'Uses {timeZone} local time. Daylight-saving changes are followed automatically. The end time is exclusive; matching start and end times cover the selected day.',
  'appearance.scheduledSettingsSource': 'Value source',
  'appearance.scheduledSettingsLocal': 'Local scheduled value',
  'appearance.scheduledSettingsAPI': 'Validated API',
  'appearance.scheduledSettingsHomeAssistant': 'Home Assistant boolean',
  'appearance.scheduledSettingsAPIEndpoint': 'API endpoint',
  'appearance.scheduledSettingsHomeAssistantBaseURL': 'Home Assistant URL',
  'appearance.scheduledSettingsHomeAssistantEntity': 'Boolean entity ID',
  'appearance.scheduledSettingsHomeAssistantToken': 'Access token',
  'appearance.scheduledSettingsSaveToken': 'Save token securely',
  'appearance.scheduledSettingsTestSensor': 'Test sensor',
  'appearance.scheduledSettingsTokenSaved':
    'Token saved in the OS credential vault.',
  'appearance.scheduledSettingsSensorState': 'Sensor state: {state}',
  'appearance.scheduledSettingsValue': 'Settings applied when active',
  'appearance.scheduledSettingsValueDescription':
    'Later matching schedules win for fields they set. API responses must be version 1 and contain language, theme, or appearance values.',
  'appearance.scheduledSettingsRemove': 'Remove schedule',
  'appearance.scheduledSettingsSourceFailure':
    'This external source could not be read; the schedule was skipped and the previous settings remain active.',
  'appearance.scheduledSettingsSourceInvalid':
    'This rule is paused until its external source is valid. Enter a valid endpoint or entity ID, then enable the schedule.',
  'appearance.scheduledSettingsLanguage': 'Language value',
  'appearance.scheduledSettingsLanguageEnglish': 'English',
  'appearance.scheduledSettingsLanguageCantonese':
    'Playful Hong Kong Cantonese',
  'appearance.scheduledSettingsLanguageBilingual': 'Bilingual',
  'appearance.scheduledSettingsTheme': 'Theme value',
  'appearance.scheduledSettingsAppearance': 'Appearance customization',
  'appearance.scheduledSettingsOn': 'on',
  'appearance.scheduledSettingsOff': 'off',
  'appearance.scheduledSettingsDaySunday': 'Sunday',
  'appearance.scheduledSettingsDayMonday': 'Monday',
  'appearance.scheduledSettingsDayTuesday': 'Tuesday',
  'appearance.scheduledSettingsDayWednesday': 'Wednesday',
  'appearance.scheduledSettingsDayThursday': 'Thursday',
  'appearance.scheduledSettingsDayFriday': 'Friday',
  'appearance.scheduledSettingsDaySaturday': 'Saturday',
  'appearance.scheduledSettingsThemeSystem': 'System',
  'appearance.scheduledSettingsThemeLight': 'Light',
  'appearance.scheduledSettingsThemeDark': 'Dark',
  'appearance.scheduledSettingsNoChange': 'No change',
  'appearance.scheduledSettingsAPIHelp':
    'HTTPS is required, except for localhost, 127.0.0.1, or ::1. The API response must be version 1 JSON.',
  'appearance.scheduledSettingsHomeAssistantHelp':
    'The token stays in the OS credential vault. The schedule uses the entity only when its boolean state is on.',
  'appearance.scheduledSettingsAccentPalette': 'Accent palette',
  'appearance.scheduledSettingsUpdateProgressPalette':
    'Update progress palette',
  'appearance.scheduledSettingsSurfacePalette': 'Surface palette',
  'appearance.scheduledSettingsElevation': 'Elevation',
  'appearance.scheduledSettingsUIFont': 'UI font',
  'appearance.scheduledSettingsMonospaceFont': 'Monospace font',
  'appearance.scheduledSettingsMotion': 'Motion',
  'appearance.scheduledSettingsToolbarLabels': 'Toolbar labels',
  'appearance.scheduledSettingsToolbarDensity': 'Toolbar density',
  'appearance.scheduledSettingsRepositoryListDensity':
    'Repository list density',
  'appearance.scheduledSettingsTabDensity': 'Tab density',
  'appearance.scheduledSettingsTabWidth': 'Tab width',
  'appearance.scheduledSettingsTabCloseButtons': 'Tab close buttons',
  'appearance.scheduledSettingsSubmoduleBackStyle': 'Submodule Back style',
  'appearance.scheduledSettingsSubmoduleBackLabel': 'Submodule Back label',
  'appearance.scheduledSettingsHighlightFeatures':
    'Highlight Desktop Material features',
  'appearance.submoduleBackStyle': 'Submodule Back button style',
  'appearance.submoduleBackLabel': 'Submodule Back button label',
  'appearance.toolbarEditorTitle': 'Toolbar appearance',
  'appearance.toolbarEditorDescription':
    'Customize toolbar labels, spacing, text color, and typography.',
  'appearance.repositoryToolbarEditorTitle': 'Repository toolbar appearance',
  'appearance.repositoryToolbarEditorDescription':
    'Override labels, spacing, text color, and typography while this repository is active.',
  'appearance.toolbarTypographyHeading': 'Toolbar typography',
  'appearance.toolbarTypographyProfile': 'Profile customization',
  'appearance.toolbarTypographyRepositoryInherited':
    'Inheriting profile typography',
  'appearance.toolbarTypographyRepositoryOverride': 'Repository override',
  'appearance.toolbarTypographyThemeDefaults': 'Use theme defaults',
  'appearance.toolbarTypographyInheritProfile': 'Inherit profile',
  'appearance.toolbarTypographyPreview': 'Live toolbar preview',
  'appearance.toolbarTypographyPreviewTitle': 'Current repository',
  'appearance.toolbarTypographyPreviewDescription': 'Current branch',
  'appearance.toolbarFontStyle': 'Font style',
  'appearance.toolbarBold': 'Bold',
  'appearance.toolbarItalic': 'Italic',
  'appearance.toolbarUnderline': 'Underline',
  'appearance.toolbarStrikethrough': 'Strikethrough',
  'appearance.toolbarAlignment': 'Text alignment',
  'appearance.toolbarAlignLeft': 'Align left',
  'appearance.toolbarAlignCenter': 'Align center',
  'appearance.toolbarAlignRight': 'Align right',
  'appearance.toolbarFont': 'Font family',
  'appearance.toolbarThemeFont': 'Use theme font',
  'appearance.toolbarInheritFont': 'Inherit profile font',
  'appearance.toolbarSize': 'Font size',
  'appearance.toolbarThemeSize': 'Use theme size',
  'appearance.toolbarInheritSize': 'Inherit profile size',
  'appearance.toolbarLetterCase': 'Letter case',
  'appearance.toolbarNormalCase': 'Normal case',
  'appearance.toolbarUppercase': 'Uppercase',
  'appearance.toolbarLowercase': 'Lowercase',
  'appearance.toolbarCapitalize': 'Capitalize words',
  'appearance.toolbarSmallCaps': 'Small caps',
  'appearance.toolbarSpacing': 'Character spacing',
  'appearance.toolbarThemeSpacing': 'Use theme spacing',
  'appearance.toolbarInheritSpacing': 'Inherit profile spacing',
  'appearance.toolbarTextEffect': 'Text effect',
  'appearance.toolbarNoEffect': 'No text effect',
  'appearance.toolbarSoftShadow': 'Soft shadow',
  'appearance.toolbarStrongShadow': 'Strong shadow',
  'appearance.toolbarTextColor': 'Text color',
  'appearance.toolbarThemeColor': 'Use theme color',
  'appearance.toolbarInheritColor': 'Inherit profile color',
  'appearance.toolbarCustomColor': 'Custom text color',
  'tabs.appearanceLoading': 'Tab appearance is still loading. Try again.',
  'tabs.settingsCommitSaved': 'Saved · {sha}',
  'tabs.settingsCommitCommitted': 'Committed {sha}',
  'tabs.settingsCommitTitle':
    "Every tab and settings change commits to this account's local settings repo.",
  'tabs.settingsHistory': 'Settings history',
  'tabs.closedHistory': 'Recently closed tabs',
  'tabs.closedHistoryTitle': 'Tab history',
  'tabs.closedHistoryDescription':
    'Restore a tab you closed recently, or forget it permanently.',
  'tabs.closedHistoryEmpty': 'No recently closed tabs.',
  'tabs.closedHistoryNoMatches': 'No closed tabs match this search.',
  'tabs.closedHistorySearch': 'Search closed tabs',
  'tabs.closedHistorySearchPlaceholder': 'Name, alias, or path',
  'tabs.closedHistorySearchTarget': 'Closed tabs',
  'tabs.closedHistoryForget': 'Forget closed tab {name}',
  'tabs.closedHistoryClear': 'Clear history',
  'tabs.closedHistoryCountOne': '1 closed tab',
  'tabs.closedHistoryCountMany': '{count} closed tabs',
  'tabs.undoSettingsChange': 'Undo last settings change',
  'tabs.redoSettingsChange': 'Redo settings change',
  'tabs.settingsChangeUndone': 'Settings change undone.',
  'tabs.settingsChangeRedone': 'Settings change redone.',
  'tabs.groupAddNew': 'Add tab to new group…',
  'tabs.groupMoveAction': 'Move tab to group…',
  'tabs.groupMoveTo': 'Move to “{name}”',
  'tabs.groupRemoveFrom': 'Remove from “{name}”',
  'tabs.groupMoveDialogTitle': 'Move tab to group',
  'tabs.groupMoveDialogIntro':
    'Choose a destination for “{tab}”. Moving it only reorganizes the tab strip; it never closes the tab.',
  'tabs.groupMoveSearchLabel': 'Search tab groups',
  'tabs.groupMoveSearchPlaceholder': 'Group name',
  'tabs.groupMoveSearchTarget': 'Tab groups',
  'tabs.groupMoveListLabel': 'Available tab groups',
  'tabs.groupMoveRemoveCurrent': 'No group — remove from “{name}”',
  'tabs.groupMoveDestinationLabel': 'Move tab to “{name}”',
  'tabs.groupMoveEmpty':
    'No compatible destination groups are available. Create a group from the tab context menu first.',
  'tabs.groupMoveNoMatches': 'No tab group matches this search.',
  'tabs.groupMoveCountOne': '1 available destination',
  'tabs.groupMoveCountMany': '{count} available destinations',
  'tabs.groupMoveFilterCount': '{visible} of {total} destinations shown',
  'tabs.groupMoveRegexError': 'Invalid regular expression: {message}.',
  'tabs.groupExpand': 'Expand “{name}”',
  'tabs.groupCollapse': 'Collapse “{name}”',
  'tabs.groupDelete': 'Delete group “{name}”',
  'tabs.groupDialogTitle': 'New tab group',
  'tabs.groupDialogIntro':
    '“{tab}” becomes the first tab in this group. Grouping only organizes the strip; it never closes a tab.',
  'tabs.groupNameLabel': 'Group name',
  'tabs.groupColorLabel': 'Group color',
  'tabs.groupColorChoice': '{color} group color',
  'tabs.groupColorBlue': 'Blue',
  'tabs.groupColorGreen': 'Green',
  'tabs.groupColorYellow': 'Yellow',
  'tabs.groupColorRed': 'Red',
  'tabs.groupColorPurple': 'Purple',
  'tabs.groupColorGrey': 'Grey',
  'tabs.groupCreateAction': 'Create group',
  'tabs.groupCancelAction': 'Cancel',
  'tabs.groupChipExpandedOne':
    '{name} group, {count} tab, expanded. Collapse group.',
  'tabs.groupChipExpandedMany':
    '{name} group, {count} tabs, expanded. Collapse group.',
  'tabs.groupChipCollapsedOne':
    '{name} group, {count} tab, collapsed. Expand group.',
  'tabs.groupChipCollapsedMany':
    '{name} group, {count} tabs, collapsed. Expand group.',
  'tabs.groupMemberLabel': '{tab}, {name} group',
  'tabs.groupCreatedStatus': '{name} group created.',
  'tabs.groupMovedStatus': '{tab} moved to {name}.',
  'tabs.groupRemovedStatus': '{tab} removed from {name}.',
  'tabs.groupExpandedStatus': '{name} group expanded.',
  'tabs.groupCollapsedStatus': '{name} group collapsed.',
  'tabs.groupDeletedStatus': '{name} group deleted. Its tabs stayed open.',
  'tabs.groupActionFailed': 'Could not update the tab group. Try again.',
  'tabs.groupEdit': 'Edit group “{name}”…',
  'tabs.groupEditTitle': 'Edit tab group',
  'tabs.groupEditIntroOne':
    'Rename or recolor “{name}”. Its {count} tab stays open and stays in the group.',
  'tabs.groupEditIntroMany':
    'Rename or recolor “{name}”. Its {count} tabs stay open and stay in the group.',
  'tabs.groupSaveAction': 'Save group',
  'tabs.groupUpdatedStatus': '{name} group updated.',
  'tabs.groupMembersButtonOne': 'Show the {count} tab in {name}',
  'tabs.groupMembersButtonMany': 'Show the {count} tabs in {name}',
  'tabs.groupMembersTitle': 'Tabs in “{name}”',
  'tabs.groupMembersDescription':
    'Every tab in this group, listed even while the group is collapsed. Choosing one switches to it.',
  'tabs.groupMembersListLabel': 'Tabs in this group',
  'tabs.groupMembersEmpty':
    'This group holds no tabs yet. Move a tab in from that tab’s context menu.',
  'tabs.groupMembersCountOne': '{count} tab in this group.',
  'tabs.groupMembersCountMany': '{count} tabs in this group.',
  'tabs.groupMembersKeepsTabs':
    'Deleting the group clears the label only; every tab stays open.',
  'tabs.groupMembersShow': 'Show tabs in “{name}”',
  'tabs.tabPinnedSuffix': ', pinned',
  'tabs.tabFavoriteSuffix': ', favorite',
  'tabs.overflowButton': '{count} more',
  'tabs.overflowButtonLabelOne': 'Show {count} more tab',
  'tabs.overflowButtonLabelMany': 'Show {count} more tabs',
  'tabs.overflowTitle': 'More tabs',
  'tabs.searchTitle': 'Search tabs',
  'tabs.searchDescription':
    'Find an open tab by name, alias, path, or clone URL.',
  'tabs.searchLabel': 'Search open tabs',
  'tabs.searchTarget': 'Open tabs',
  'tabs.searchEmpty': 'No open tabs match this search.',
  'tabs.searchListLabel': 'Matching repository tabs',
  'tabs.searchCountOne': '1 matching tab',
  'tabs.searchCountMany': '{count} matching tabs',
  'tabs.close.matchStrategyRegex': 'regular expressions',
  'tabs.close.matchStrategyFuzzy': 'fuzzy matching',
  'tabs.close.matchStrategySubstring': 'literal substrings',
  'tabs.close.matchCaseSensitive': 'matches letter case',
  'tabs.close.matchCaseInsensitive': 'ignores letter case',
  'tabs.close.matchDescription':
    'Matching uses {strategy} and {casing}, exactly as “Close tabs containing” does.',
  'tabs.close.saveError':
    'The change could not be saved. Review open tabs before trying again.',
  'tabs.close.noMatches': 'No tabs match. Nothing will close.',
  'tabs.close.cancel': 'Cancel',
  'tabs.close.closing': 'Closing…',
  'tabs.close.count': 'Close {count}',
  'tabs.close.action': 'Close',
  'tabs.close.closeTabs': 'Close tabs',
  'tabs.close.openTabsTarget': 'Open tabs',
  'tabs.stripLabel': 'Repository tabs',
  'tabs.openRepositoryNewTab': 'Open a repository in a new tab',
  'tabs.closeContaining.title': 'Close tabs containing',
  'tabs.closeContaining.placeholder': 'Filter by name',
  'tabs.closeContaining.previewPrompt': 'Type to preview matches.',
  'tabs.closeContaining.matchSummary':
    '{closeCount} close, {pinnedCount} pinned protected.',
  'tabs.closeExcept.title': 'Close all tabs except those containing…',
  'tabs.closeExcept.fieldLabel': 'Text to keep',
  'tabs.closeExcept.placeholder': 'Repository name, alias, or path',
  'tabs.closeExcept.previewPrompt':
    'Type a phrase to preview which tabs stay open.',
  'tabs.closeExcept.allStayOpenOne': 'The {count} tab stays open.',
  'tabs.closeExcept.allStayOpenMany': 'All {count} tabs stay open.',
  'tabs.closeExcept.summary': '{keptCount} kept, {closedCount} closed.',
  'tabs.closeExcept.summaryWithPinned':
    '{keptCount} kept, {closedCount} closed, {pinnedCount} pinned protected.',
  'tabs.closeExcept.previewAria': 'Tab close preview',
  'tabs.closeExcept.dispositionPinned': 'Protected pinned',
  'tabs.closeExcept.dispositionClose': 'Close',
  'tabs.closeExcept.dispositionKeep': 'Keep',
  'tabs.closeExcept.remainingOne': 'And {count} more tab',
  'tabs.closeExcept.remainingMany': 'And {count} more tabs',
  'tabs.arrange.initialAnnouncement':
    'Choose a manual move or a one-time sort.',
  'tabs.arrange.saveError':
    'The tab order could not be saved. Review the current order and try again.',
  'tabs.arrange.movedFirst': '{label} moved to first.',
  'tabs.arrange.movedLeft': '{label} moved left.',
  'tabs.arrange.movedRight': '{label} moved right.',
  'tabs.arrange.movedLast': '{label} moved to last.',
  'tabs.arrange.pinned': '{label} pinned.',
  'tabs.arrange.unpinned': '{label} unpinned.',
  'tabs.arrange.favoriteAdded': '{label} added to favorites.',
  'tabs.arrange.favoriteRemoved': '{label} removed from favorites.',
  'tabs.arrange.sortedLabelAscending': 'Tabs arranged from A to Z.',
  'tabs.arrange.sortedLabelDescending': 'Tabs arranged from Z to A.',
  'tabs.arrange.sortedOpenedNewest': 'Tabs arranged by newest opened first.',
  'tabs.arrange.sortedOpenedOldest': 'Tabs arranged by oldest opened first.',
  'tabs.arrange.sortedAttentionFirst': 'Tabs needing attention moved first.',
  'tabs.arrange.sortedCleanFirst': 'Clean tabs moved first.',
  'tabs.arrange.sortedFavoritesFirst': 'Favorite tabs moved first.',
  'tabs.arrange.sortedFavoritesLast': 'Favorite tabs moved last.',
  'tabs.arrange.title': 'Arrange tabs',
  'tabs.arrange.description':
    'Drag tabs on the strip, or use these keyboard-friendly controls. Pinned tabs remain in the leading group.',
  'tabs.arrange.filterLabel': 'Filter tabs',
  'tabs.arrange.filterPlaceholder': 'Name, alias, path, or URL',
  'tabs.arrange.filterTarget': 'Open tabs',
  'tabs.arrange.filterCountOne': '{visible} of {total} tab',
  'tabs.arrange.filterCountMany': '{visible} of {total} tabs',
  'tabs.arrange.manualOrder': 'Manual order',
  'tabs.arrange.noMatches': 'No tabs match this filter.',
  'tabs.arrange.sortOnce': 'Sort once',
  'tabs.arrange.sortHint':
    'Sort actions apply to all open tabs, even while filtering.',
  'tabs.arrange.pinnedChip': 'Pinned',
  'tabs.arrange.favoriteChip': 'Favorite',
  'tabs.arrange.pin': 'Pin',
  'tabs.arrange.unpin': 'Unpin',
  'tabs.arrange.star': 'Star',
  'tabs.arrange.unstar': 'Unstar',
  'tabs.arrange.pinAria': 'Pin {label}',
  'tabs.arrange.unpinAria': 'Unpin {label}',
  'tabs.arrange.favoriteAria': 'Favorite {label}',
  'tabs.arrange.unfavoriteAria': 'Unfavorite {label}',
  'tabs.arrange.moveFirstAria': 'Move {label} to first',
  'tabs.arrange.moveLeftAria': 'Move {label} left',
  'tabs.arrange.moveRightAria': 'Move {label} right',
  'tabs.arrange.moveLastAria': 'Move {label} to last',
  'tabs.arrange.first': 'First',
  'tabs.arrange.left': 'Left',
  'tabs.arrange.right': 'Right',
  'tabs.arrange.last': 'Last',
  'tabs.arrange.sortLabelAscending': 'Label A → Z',
  'tabs.arrange.sortLabelDescending': 'Label Z → A',
  'tabs.arrange.sortOpenedNewest': 'Newest opened',
  'tabs.arrange.sortOpenedOldest': 'Oldest opened',
  'tabs.arrange.sortAttentionFirst': 'Needs attention first',
  'tabs.arrange.sortCleanFirst': 'Clean first',
  'tabs.arrange.sortFavoritesFirst': 'Favorites first',
  'tabs.arrange.sortFavoritesLast': 'Favorites last',
  'tabs.arrange.done': 'Done',
  'tabs.style.alignLeftAria': 'Align left',
  'tabs.style.alignCenterAria': 'Align center',
  'tabs.style.alignRightAria': 'Align right',
  'tabs.style.font': 'Font',
  'tabs.style.searchFonts': 'Search fonts',
  'tabs.style.fontsTarget': 'Fonts',
  'tabs.style.noMatchingFonts': 'No matching fonts',
  'tabs.style.textColorSwatchAria': 'Text color {color}',
  'tabs.style.highlightColorSwatchAria': 'Highlight color {color}',
  'tabs.style.highlight': 'Highlight',
  'tabs.style.textColor': 'Text color',
  'tabs.style.useDefaultBackgroundAria': 'Use default background color',
  'tabs.style.useDefaultTextAria': 'Use default text color',
  'tabs.style.noHighlight': 'No highlight',
  'tabs.style.defaultColor': 'Default',
  'tabs.style.custom': 'Custom…',
  'tabs.style.customHighlightAria': 'Custom highlight color',
  'tabs.style.customTextColorAria': 'Custom text color',
  'tabs.style.recent': 'Recent',
  'tabs.style.defaultPreviewTitle': 'Repository tab',
  'tabs.style.previewAria': 'Live tab preview',
  'tabs.style.preview': 'Preview',
  'tabs.style.title': 'Tab appearance',
  'tabs.style.historyAria': 'Open tab appearance history',
  'tabs.style.history': 'History',
  'tabs.style.clearAria': 'Clear tab formatting',
  'tabs.style.clear': 'Clear',
  'tabs.style.bold': 'Bold',
  'tabs.style.italic': 'Italic',
  'tabs.style.underline': 'Underline',
  'tabs.style.strikethrough': 'Strikethrough',
  'tabs.style.size': 'Size',
  'tabs.style.letterCase': 'Letter case',
  'tabs.style.normalCase': 'Normal case',
  'tabs.style.uppercase': 'Uppercase',
  'tabs.style.lowercase': 'Lowercase',
  'tabs.style.capitalizeWords': 'Capitalize words',
  'tabs.style.smallCaps': 'Small caps',
  'tabs.style.spacing': 'Spacing',
  'tabs.style.textEffect': 'Text effect',
  'tabs.style.effectNone': 'None',
  'tabs.style.effectNoneAria': 'No text effect',
  'tabs.style.effectSoft': 'Soft',
  'tabs.style.effectSoftAria': 'Soft text shadow',
  'tabs.style.effectStrong': 'Strong',
  'tabs.style.effectStrongAria': 'Strong text shadow',
  'commitPushAll.defaultMessage': 'Commit local changes',
  'commitPushAll.title': 'Commit and push all repositories',
  'commitPushAll.intro':
    'Each repository you tick below is pulled, all of its local changes are committed with the message you provide, and the result is pushed. Clean repositories are skipped, and a failure in one repository will not stop the others.',
  'commitPushAll.messageLabel': 'Commit message',
  'commitPushAll.messagePlaceholder': 'Describe these changes',
  'commitPushAll.filterPlaceholder': 'Filter repositories',
  'commitPushAll.filterAria': 'Filter the repositories to commit and push',
  'commitPushAll.filterTarget': 'repository name',
  'commitPushAll.selectionCount': '{selectedCount} of {totalCount} selected',
  'commitPushAll.selectShown': 'Select shown',
  'commitPushAll.clearShown': 'Clear shown',
  'commitPushAll.repositoriesGroupAria':
    'Repositories to be committed and pushed',
  'commitPushAll.noMatches': 'No repository name matches this search.',
  'commitPushAll.empty':
    'No repositories have local changes or unpushed commits, so there is nothing to commit and push.',
  'commitPushAll.commitAll': 'Commit & push all',
  'commitPushAll.commitCount': 'Commit & push {count}',
  'commitPushAll.cancel': 'Cancel',
  'commitPushAll.done': 'Done',
  'commitPushAll.progressAria': 'Commit and push progress',
  'commitPushAll.overlineStopped': 'Run stopped',
  'commitPushAll.overlineComplete': 'Run complete',
  'commitPushAll.overlineLive': 'Live progress',
  'commitPushAll.headingFailed': 'Commit and push all could not finish',
  'commitPushAll.headingComplete': 'All repositories processed',
  'commitPushAll.headingRunning': 'Committing and pushing repositories',
  'commitPushAll.repositoriesComplete':
    '{completed} of {total} repositories complete',
  'commitPushAll.progressBarAria': 'Repositories committed and pushed',
  'commitPushAll.metricComplete': '{count} complete',
  'commitPushAll.metricActive': '{count} active',
  'commitPushAll.metricWaiting': '{count} waiting',
  'commitPushAll.allFinal': 'Every repository has a final result.',
  'commitPushAll.nowWorking': 'Now working on: {repositories}',
  'commitPushAll.waitingNext': 'Waiting for the next repository to start.',
  'commitPushAll.concurrencyHint':
    'Up to three repositories are processed at a time. You can leave this dialog open while the work continues.',
  'commitPushAll.summary': '{done} pushed, {skipped} skipped, {failed} failed.',
  'commitPushAll.noRepositoriesRun': 'There were no repositories to run.',
  'commitPushAll.resultsRegionAria': 'Commit and push all repository progress',
  'commitPushAll.columnRepository': 'Repository',
  'commitPushAll.columnStatus': 'Status',
  'commitPushAll.columnResult': 'Current operation or result',
  'commitPushAll.runInBackground': 'Run in background',
  'commitPushAll.status.waiting': 'Waiting',
  'commitPushAll.status.pulling': 'Pulling',
  'commitPushAll.status.committing': 'Committing',
  'commitPushAll.status.pushing': 'Pushing',
  'commitPushAll.status.done': 'Done',
  'commitPushAll.status.skipped': 'Skipped',
  'commitPushAll.status.failed': 'Failed',
  // The three bands are the funny-level voice (1-2 plain, 3 light, 4-5
  // playful). Every band states the same fact — these tabs did not fit in the
  // strip and are still fully usable from here — because the voice moves and
  // the facts never do.
  'tabs.overflowDescription.plain':
    'Tabs that did not fit in the strip. Search them, switch to one, or customize one.',
  'tabs.overflowDescription.light':
    'These tabs ran out of room in the strip. Search them, switch to one, or customize one.',
  'tabs.overflowDescription.playful':
    'These tabs got elbowed off the strip. Search them, switch to one, or give one a makeover.',
  'tabs.overflowDescription.maximum':
    'These tabs are queuing outside a full strip like it is Saturday yum cha at peak hour. Search them, switch to one, or hand one a whole new outfit while it waits for a table.',
  'tabs.overflowListLabel': 'Overflowing repository tabs',
  'tabs.overflowEmpty': 'Every tab fits in the strip.',
  'tabs.overflowActiveSuffix': ', active',
  'tabs.overflowActiveChip': 'Active',
  'tabs.overflowPinnedChip': 'Pinned',
  'tabs.overflowFavoriteChip': 'Favorite',
  'tabs.overflowCountOne': '1 tab in this menu',
  'tabs.overflowCountMany': '{count} tabs in this menu',
  'tabs.overflowSearchLabel': 'Search tabs in this menu',
  'tabs.overflowSearchPlaceholder': 'Name, alias, path, or URL',
  'tabs.overflowSearchTarget': 'Overflowing tabs',
  'tabs.overflowNoMatches': 'No tab in this menu matches this search.',
  'tabs.overflowFilterCountOne': '{visible} of {total} tab in this menu',
  'tabs.overflowFilterCountMany': '{visible} of {total} tabs in this menu',
  'tabs.overflowRegexError':
    'Invalid regular expression: {message}. Every tab in this menu is still listed.',
  'tabs.overflowCustomize': 'Customize appearance',
  'tabs.overflowCustomizeLabel': 'Customize appearance of {name}',
  'tabs.overflowActionsHint':
    'Right-click a tab here for the same actions a tab in the strip has.',
  'language.english': 'English',
  'language.cantonese': 'Playful Hong Kong Cantonese',
  'language.bilingual': 'Bilingual',
  'submodule.backStyleTonal': 'Tonal',
  'submodule.backStyleFilled': 'Filled accent',
  'submodule.backStyleOutlined': 'Outlined',
  'submodule.backLabelFull': 'Back to parent',
  'submodule.backLabelParent': 'Parent name',
  'submodule.backLabelIcon': 'Icon only',
  'submodule.openAsRepository': 'Open temporary viewer',
  'submodule.temporaryOpenDescription':
    'Opens a temporary, read-only viewer in this workspace. Close returns to the parent; it is never added to your repository list.',
  'submodule.diffTemporaryViewerTitle': 'Open a temporary viewer in {app}',
  'submodule.diffTemporaryViewerDescription':
    'Open the checked-out submodule in a temporary, read-only viewer. Close returns to the parent and clears the viewer; it is never added to your repository list.',
  'submodule.diffTemporaryViewerAction': 'Open temporary viewer',
  'submodule.closeTemporaryViewer': 'Close viewer',
  'submodule.appearanceHeading': 'Back button appearance',
  'submodule.appearanceDescription':
    'Shift+right-click the preview Back button, or focus it and press the Context Menu key or Shift+F10, to open its editor beside the button. Save applies this to the active profile.',
  'submodule.appearancePreview': 'Preview',
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
    'Temporary, read-only view of {child} inside {parent}. Close returns to the parent and clears this viewer; it is never added to your repository list.',
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
  'submodule.summaryNeedsRepair': '{count} need repair',
  'submodule.statusUninitialized': 'Not initialized',
  'submodule.statusUpToDate': 'Up to date',
  'submodule.statusOutOfDate': 'Out of date',
  'submodule.statusConflicted': 'Conflicted',
  'submodule.statusMissingGitlink': 'Missing Git link',
  'submodule.statusMissingDeclaration': 'Missing .gitmodules entry',
  'submodule.missingGitlinkTooltip':
    'This .gitmodules path is not tracked as a submodule. Restore its Git link or remove the stale entry.',
  'submodule.missingDeclarationTooltip':
    'This indexed submodule has no matching .gitmodules entry. Restore its configuration before managing it.',
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
  'submodule.addCreateRemoteTab': 'Create remote',
  'submodule.addCreateAndAddAction': 'Create and add submodule',
  'submodule.addCreateRemoteSignInGuidance':
    'Sign in to GitHub.com or GitHub Enterprise to create a remote repository for this submodule.',
  'submodule.addRemoteCreatedHeading': 'Remote repository created',
  'submodule.addRemoteCreatedRetryHelp':
    'The remote is ready. Retry to add that existing remote without creating it again.',
  'submodule.addRemoteOwnerLabel': 'Owner',
  'submodule.addRemoteNameLabel': 'Repository name',
  'submodule.addRemoteDescriptionLabel': 'Description (optional)',
  'submodule.addRemotePrivateLabel': 'Keep this repository private',
  'submodule.addRemoteNameHelp':
    'Use the exact name to create on the selected GitHub host.',
  'submodule.addRemoteDescriptionHelp':
    'A short description for the new remote repository.',
  'submodule.addRemoteInitializeHelp':
    'Desktop initializes the remote with a first commit so Git can track it as a submodule immediately.',
  'submodule.addRemoteAccountRequiredError':
    'Choose an authenticated GitHub account before creating the remote repository.',
  'submodule.addRemoteOwnerUnavailableError':
    'The selected organization is no longer available for this account. Choose an owner again.',
  'submodule.addRemoteNameRequiredError':
    'Enter a name for the new remote repository.',
  'submodule.addRemoteNameLengthError':
    'Repository names must be 100 characters or fewer.',
  'submodule.addRemoteNameCharactersError':
    'Use only letters, numbers, periods, hyphens, and underscores in the repository name.',
  'submodule.addRemoteDescriptionLengthError':
    'Repository descriptions must be 350 characters or fewer.',
  'submodule.addRemoteDescriptionCharactersError':
    'The repository description contains unsupported control characters.',
  'submodule.addCreatingRemoteProgress': 'Creating the remote repository…',
  'submodule.addRemoteCreatedProgress':
    'Remote created. Adding it as a submodule…',
  'submodule.addRemoteCreatedButAddFailed':
    'The remote repository was created at {repository}, but Desktop could not add it as a submodule: {error}. Retry to use the existing remote.',
  'submodule.addRemoteCreateFailed':
    'Desktop could not create the remote repository: {error}',
  'submodule.addRemoteCreateCancelledUncertain':
    'The creation request ended before Desktop received a result. The remote host may still have created the repository. Check it before retrying to avoid a duplicate.',
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
  'submodule.addLoadBranchesAction': 'Load branches',
  'submodule.addLoadingBranches': 'Asking the remote for its branches…',
  'submodule.addBranchListFailed':
    'Desktop could not list branches from the remote: {error}. You can still type a branch name.',
  'submodule.addBranchFilterLabel': 'Filter branches',
  'submodule.addBranchPickerLabel': 'Branch from the remote',
  'submodule.addBranchDefaultOption': '{branch} (remote default)',
  'submodule.addBranchCustomOption': 'Custom branch (from the branch field)',
  'submodule.addBranchListEmpty':
    'The remote has no branches yet, so the submodule will follow its future default branch.',
  'submodule.addBranchListTruncated':
    'Showing the first {count} branches from the remote.',
  'submodule.addBranchFilterNoMatches': 'No branches match the current filter.',
  'submodule.addBranchFilterInvalidPattern':
    'Invalid branch search pattern: {error}',
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
  'fileList.viewMode': 'Changed-files layout',
  'fileList.flat': 'Flat',
  'fileList.tree': 'Tree',
  'fileList.directory': 'Directory {path}',
  'diff.context.legend': 'Diff context',
  'diff.context.autoExpand': 'Automatically expand whole-file context',
  'diff.context.autoExpandHelp':
    'Small files open fully; large or partial files stay safely collapsed.',
  'diff.context.stepLegend': 'Context expansion step',
  'diff.context.lines': '{count} lines',
  'history.scope': 'History scope',
  'history.scope.currentBranch': 'Current branch',
  'history.scope.allRefs': 'All branches & tags',
  'history.viewMode': 'History view',
  'history.viewMode.list': 'Commit list',
  'history.viewMode.graph': 'Graph',
  'history.graphPageTitle': 'History graph',
  'diff.structured.viewSwitcher': 'Structured diff view',
  'diff.structured.code': 'Code',
  'diff.structured.table': 'Table',
  'diff.structured.csvCaption': 'CSV table diff',
  'diff.structured.tsvCaption': 'TSV table diff',
  'diff.structured.rowNumber': 'Row number',
  'diff.structured.column': 'Column {number}',
  'diff.structured.rowAdded': 'Added row',
  'diff.structured.rowRemoved': 'Removed row',
  'diff.structured.rowChanged': 'Changed row',
  'diff.structured.cellAdded': 'Added cell',
  'diff.structured.cellRemoved': 'Removed cell',
  'diff.structured.cellChanged': 'Changed cell',
  'diff.structured.selectionHint':
    'Switch to Code to select or discard individual lines.',
  'prCreate.title': 'Create GitHub pull request',
  'prCreate.reviewTitle': 'Review GitHub pull request',
  'prCreate.successTitle': 'GitHub pull request created',
  'prCreate.targetRepository': 'Target repository',
  'prCreate.account': 'Account',
  'prCreate.baseBranch': 'Base branch',
  'prCreate.headBranch': 'Head branch',
  'prCreate.currentBranch': 'Local branch: {branch}',
  'prCreate.template': 'Pull request template',
  'prCreate.noTemplate': 'Blank pull request',
  'prCreate.loadingOptions': 'Loading templates and repository choices…',
  'prCreate.optionalWarning':
    'Some optional choices are unavailable. You can still create the pull request.',
  'prCreate.titleField': 'Title',
  'prCreate.descriptionField': 'Description (optional)',
  'prCreate.charactersRemaining': '{count} characters remaining',
  'prCreate.markdownSupported': 'Markdown supported',
  'prCreate.draftAction': 'Create as draft pull request',
  'prCreate.reviewers': 'Reviewers',
  'prCreate.assignees': 'Assignees',
  'prCreate.labels': 'Labels',
  'prCreate.milestone': 'Milestone',
  'prCreate.none': 'None',
  'prCreate.choiceUnavailable': 'Suggestions unavailable for this account',
  'prCreate.choiceCapped': 'Showing the first bounded set of choices',
  'prCreate.cancel': 'Cancel',
  'prCreate.close': 'Close',
  'prCreate.reviewAction': 'Review pull request',
  'prCreate.backToEdit': 'Back to edit',
  'prCreate.createAction': 'Create pull request',
  'prCreate.createDraftAction': 'Create draft pull request',
  'prCreate.creating': 'Creating pull request…',
  'prCreate.waitingFor': 'Waiting for {target}',
  'prCreate.cancelRequest': 'Cancel request',
  'prCreate.canceling': 'Canceling…',
  'prCreate.readyStatus': 'Ready for review',
  'prCreate.draftStatus': 'Draft',
  'prCreate.description': 'Description',
  'prCreate.noDescription': 'No description',
  'prCreate.metadataSummary':
    'Reviewers: {reviewers}; assignees: {assignees}; labels: {labels}; milestone: {milestone}',
  'prCreate.confirmation':
    'Confirming will create this {status} pull request in {target} as {account}. A canceled request may still have reached GitHub.',
  'prCreate.created': 'Pull request #{number} created',
  'prCreate.draftCreated': 'Draft pull request #{number} created',
  'prCreate.done': 'Done',
  'prCreate.openOnGitHub': 'Open on GitHub',
  'prCreate.partialSuccess':
    'The pull request was created, with follow-up notices:',
  'prCreate.templateNotice': 'Template notice: {notice}',
  'mrEditor.createTitle': 'Create merge request',
  'mrEditor.editTitle': 'Edit merge request',
  'mrEditor.description':
    'Prepare bounded merge-request details for this repository-bound GitLab account.',
  'mrEditor.project': 'Project',
  'mrEditor.boundAccount': 'Repository account',
  'mrEditor.routeAria': 'Exact GitLab project and repository account',
  'mrEditor.formAria': 'Merge request details',
  'mrEditor.sourceBranch': 'Source branch',
  'mrEditor.sourceEditLocked':
    'GitLab does not support changing the source branch after creation.',
  'mrEditor.targetBranch': 'Target branch',
  'mrEditor.titleField': 'Title',
  'mrEditor.descriptionField': 'Description (optional)',
  'mrEditor.charactersRemaining': '{count} characters remaining',
  'mrEditor.markdownSupported': 'Markdown supported',
  'mrEditor.draftAction': 'Draft merge request',
  'mrEditor.reviewers': 'Reviewers',
  'mrEditor.assignees': 'Assignees',
  'mrEditor.reviewersUnavailable':
    'Reviewer choices are unavailable. Other fields remain editable.',
  'mrEditor.assigneesUnavailable':
    'Assignee choices are unavailable. Other fields remain editable.',
  'mrEditor.noneAvailable': 'No choices are available.',
  'mrEditor.keyboardHint':
    'Press Enter in Title or Ctrl+Enter in Description to submit.',
  'mrEditor.cancel': 'Cancel',
  'mrEditor.refresh': 'Refresh merge-request context',
  'mrEditor.createAction': 'Create merge request',
  'mrEditor.saveAction': 'Save merge request',
  'mrEditor.creating': 'Creating merge request…',
  'mrEditor.saving': 'Saving merge request…',
  'mrEditor.created': 'Merge request created.',
  'mrEditor.saved': 'Merge request saved.',
  'mrEditor.canceled': 'The merge-request operation was canceled.',
  'mrEditor.loading': 'Loading bounded merge-request choices…',
  'mrEditor.emptyBranches': 'No branches are available for a merge request.',
  'mrEditor.emptySource': 'No source branches are available.',
  'mrEditor.emptyTarget': 'No target branches are available.',
  'mrEditor.emptyDescription':
    'Refresh after the repository and its GitLab project have branches.',
  'mrEditor.errorTitle': 'Merge-request choices are unavailable',
  'mrEditor.errorAuthentication':
    'The repository-bound GitLab account could not be authenticated.',
  'mrEditor.errorPermission':
    'The repository-bound GitLab account cannot read this project.',
  'mrEditor.errorNetwork':
    'GitLab could not be reached. Check the network and retry.',
  'mrEditor.errorUnsupported':
    'This GitLab server does not expose the required merge-request API.',
  'mrEditor.errorInvalidResponse':
    'GitLab returned data that could not be safely validated.',
  'mrEditor.errorUnknown':
    'The merge-request context could not be loaded. Refresh and try again.',
  'mrEditor.staleTitle': 'Repository or account context changed',
  'mrEditor.staleDescription':
    'This editor is bound to an older repository, account, endpoint, or request version. Refresh before submitting.',
  'mrEditor.partialTitle': 'Some optional choices are incomplete',
  'mrEditor.partialUnavailable':
    'Unavailable reviewer or assignee fields are disabled; required fields remain usable.',
  'mrEditor.partialCapped':
    'One or more choice lists reached a safety limit or contained rejected entries.',
  'mrEditor.readinessLabel': 'Merge readiness',
  'mrEditor.readinessChecking': 'GitLab is still checking merge readiness…',
  'mrEditor.readinessReady': 'Ready to merge',
  'mrEditor.readinessBlocked': 'Blocked: {reason}',
  'mrEditor.readinessUnknown': 'Merge readiness is not available yet.',
  'mrEditor.blockerStatus': 'project policy or merge checks',
  'mrEditor.blockerCiMustPass': 'the pipeline must pass',
  'mrEditor.blockerCiRunning': 'the pipeline is still running',
  'mrEditor.blockerConflict': 'source and target have conflicts',
  'mrEditor.blockerDiscussions': 'review discussions remain unresolved',
  'mrEditor.blockerDraft': 'the merge request is still a draft',
  'mrEditor.blockerExternalChecks': 'external status checks are incomplete',
  'mrEditor.blockerJira': 'a required Jira association is missing',
  'mrEditor.blockerRebase': 'the source branch needs a rebase',
  'mrEditor.blockerApproval': 'required approvals are missing',
  'mrEditor.blockerNotOpen': 'the merge request is not open',
  'mrEditor.blockerPolicy': 'a merge policy denied this request',
  'mrEditor.blockerCommitsStatus': 'one or more commit statuses are blocking',
  'mrEditor.blockerRequestBlocked':
    'another merge-request condition is blocking',
  'mrEditor.blockerMergeTime': 'the scheduled merge time has not arrived',
  'mrEditor.blockerRequestedChanges': 'a reviewer requested changes',
  'mrEditor.blockerSecurityPipeline':
    'the security-policy pipeline check is incomplete',
  'mrEditor.blockerSecurityViolation': 'a security policy has violations',
  'mrEditor.blockerStatusChecks': 'required status checks must pass',
  'mrEditor.blockerLockedPaths': 'one or more changed paths are locked',
  'mrEditor.blockerLockedLfs': 'one or more changed LFS files are locked',
  'mrEditor.blockerTitleRegex': 'the title does not match project policy',
  'mrEditor.validationTitle': 'Fix these merge-request details:',
  'mrEditor.validationSource': 'Choose a valid source branch.',
  'mrEditor.validationTarget': 'Choose a valid target branch.',
  'mrEditor.validationBranchesDiffer':
    'Source and target branches must be different.',
  'mrEditor.validationTitleRequired': 'Enter a merge-request title.',
  'mrEditor.validationTitleLength':
    'The title exceeds the 255-character safety limit.',
  'mrEditor.validationTitleInvalid':
    'Remove surrounding whitespace or unsupported control characters from the title.',
  'mrEditor.validationBodyLength':
    'The description exceeds the 128 KiB safety limit.',
  'mrEditor.validationBodyInvalid':
    'The description contains an unsupported null character.',
  'mrEditor.validationReviewerLimit': 'Select at most 20 reviewers.',
  'mrEditor.validationAssigneeLimit': 'Select at most 20 assignees.',
  'mrEditor.validationReviewerDuplicate':
    'Each reviewer may be selected only once.',
  'mrEditor.validationAssigneeDuplicate':
    'Each assignee may be selected only once.',
  'mrEditor.validationReviewerInvalid':
    'A selected reviewer is not in the current bounded choices.',
  'mrEditor.validationAssigneeInvalid':
    'A selected assignee is not in the current bounded choices.',
  'mrEditor.submitRejected':
    'GitLab rejected the merge-request update. Refresh and review the current state.',
  'mrEditor.submitNetwork':
    'The merge-request update could not reach GitLab. Check the network and retry.',
  'mrEditor.submitStale':
    'The repository, account, merge request, or HEAD changed before the update completed.',
  'mrEditor.submitInvalidResponse':
    'GitLab returned an update result that could not be safely validated.',
  'mrEditor.submitUnknown':
    'The merge-request update did not complete. Refresh before retrying.',
  'mrLifecycle.title': 'Merge request lifecycle',
  'mrLifecycle.loading': 'Loading the merge-request lifecycle…',
  'mrLifecycle.empty': 'No merge request is selected',
  'mrLifecycle.emptyDescription':
    'Create or select a merge request to manage its lifecycle.',
  'mrLifecycle.unavailable': 'Merge-request lifecycle is unavailable',
  'mrLifecycle.unavailableDescription':
    'Refresh the repository-bound GitLab context and try again.',
  'mrLifecycle.stale': 'Merge-request lifecycle context changed',
  'mrLifecycle.staleDescription':
    'Repository, account, merge request, or HEAD details changed. Refresh before acting.',
  'mrLifecycle.partial':
    'Some lifecycle details are unavailable; available actions remain bounded.',
  'mrLifecycle.summaryAria': 'Merge request lifecycle summary',
  'mrLifecycle.state': 'State',
  'mrLifecycle.stateOpened': 'Open',
  'mrLifecycle.stateClosed': 'Closed',
  'mrLifecycle.stateMerged': 'Merged',
  'mrLifecycle.stateLocked': 'Locked',
  'mrLifecycle.draft': 'Draft',
  'mrLifecycle.author': 'Author',
  'mrLifecycle.reviewers': 'Reviewers',
  'mrLifecycle.assignees': 'Assignees',
  'mrLifecycle.none': 'None',
  'mrLifecycle.approval': 'Approval progress',
  'mrLifecycle.approvalUnavailable': 'Approval state is unavailable.',
  'mrLifecycle.approvalComplete': 'Required approvals complete',
  'mrLifecycle.approvalProgress': '{approved} of {required} required approvals',
  'mrLifecycle.approvedBy': 'Approved by {names}',
  'mrLifecycle.pipeline': 'Pipeline',
  'mrLifecycle.pipelineUnavailable': 'Pipeline state is unavailable.',
  'mrLifecycle.pipelineNone': 'No pipeline reported',
  'mrLifecycle.pipelinePending': 'Pending',
  'mrLifecycle.pipelineRunning': 'Running',
  'mrLifecycle.pipelinePassed': 'Passed',
  'mrLifecycle.pipelineFailed': 'Failed',
  'mrLifecycle.pipelineCanceled': 'Canceled',
  'mrLifecycle.pipelineSkipped': 'Skipped',
  'mrLifecycle.pipelineUnknown': 'Unknown',
  'mrLifecycle.readiness': 'Merge readiness',
  'mrLifecycle.updated': 'Updated',
  'mrLifecycle.timeUnavailable': 'Time unavailable',
  'mrLifecycle.close': 'Close merge request',
  'mrLifecycle.reopen': 'Reopen merge request',
  'mrLifecycle.approve': 'Approve current HEAD',
  'mrLifecycle.unapprove': 'Remove approval',
  'mrLifecycle.refresh': 'Refresh lifecycle',
  'mrLifecycle.openCanonical': 'Open on GitLab',
  'mrLifecycle.operationRunning': '{action}…',
  'mrLifecycle.operationSuccess': '{action} completed.',
  'mrLifecycle.operationCanceled': 'The lifecycle operation was canceled.',
  'mrLifecycle.operationError':
    'The lifecycle operation did not complete. Refresh before retrying.',
  'forkCheckout.action': 'Checkout from another fork…',
  'forkCheckout.title': 'Checkout a branch from another fork',
  'forkCheckout.description':
    'Choose an exact fork and branch head, review the managed refs, then checkout safely.',
  'forkCheckout.close': 'Close fork branch checkout',
  'forkCheckout.loadingForks': 'Loading repository network…',
  'forkCheckout.forkLabel': 'Fork repository',
  'forkCheckout.chooseFork': 'Choose a fork',
  'forkCheckout.filterForks': 'Filter forks by owner or repository',
  'forkCheckout.loadingBranches': 'Loading exact branch heads…',
  'forkCheckout.branchLabel': 'Fork branch',
  'forkCheckout.chooseBranch': 'Choose a branch',
  'forkCheckout.filterBranches': 'Filter fork branches',
  'forkCheckout.localBranchLabel': 'New local branch',
  'forkCheckout.review': 'Review checkout',
  'forkCheckout.reviewing': 'Reviewing local refs…',
  'forkCheckout.confirmHeading': 'Confirm exact checkout',
  'forkCheckout.source': 'Source',
  'forkCheckout.head': 'Reviewed head',
  'forkCheckout.local': 'Local branch',
  'forkCheckout.remote': 'Managed remote',
  'forkCheckout.remoteNew': '{remote} (will be created)',
  'forkCheckout.remoteReuse': '{remote} (existing Desktop remote)',
  'forkCheckout.remoteRef': 'Managed remote ref',
  'forkCheckout.staleGuard':
    'Confirmation rechecks the repository, fork, branch head, remotes, and local branch before changing Git.',
  'forkCheckout.confirm': 'Fetch and checkout',
  'forkCheckout.checkingOut': 'Revalidating, fetching, and preparing checkout…',
  'forkCheckout.success':
    'Prepared {branch} at {sha}. If local changes need attention, finish Desktop’s checkout prompt.',
  'forkCheckout.limitNotice':
    'This list reached its safety cap. Filter the visible results or refresh after narrowing the network on GitHub.',
  'forkCheckout.rejectedNotice':
    '{count} malformed or unsafe API item(s) were ignored.',
  'forkCheckout.emptyForks':
    'No other visible forks were found for this network.',
  'forkCheckout.emptyBranches': 'No valid branches were found in this fork.',
  'forkCheckout.useSuggestion': 'Use suggested branch {branch}',
  'forkCheckout.errorUnsupported':
    'This workflow is available only for a GitHub repository.',
  'forkCheckout.errorSignIn':
    'Sign in with the account assigned to this repository, then try again.',
  'forkCheckout.errorMalformed':
    'GitHub returned repository-network data that could not be safely used.',
  'forkCheckout.errorStale':
    'The reviewed fork, branch, or local remote state changed. Refresh and review again.',
  'forkCheckout.errorContext':
    'The selected repository changed. Reopen its Branches panel and review again.',
  'forkCheckout.errorInvalid':
    'Choose a valid fork branch and a valid new local branch name.',
  'forkCheckout.errorCollision':
    'That local branch already exists. Choose a different local branch name.',
  'forkCheckout.errorRemoteCollision':
    'Desktop could not reserve a managed fork remote without overwriting an existing remote.',
  'forkCheckout.errorNetwork':
    'GitHub or Git could not read this fork. Check the network, account access, and repository permission, then retry.',
  'forkCheckout.errorMoved':
    'The fork branch moved after review. Reload its branches and review the new head.',
  'forkCheckout.errorGit':
    'Git could not prepare the reviewed refs. No existing local branch was overwritten.',
  'forkCheckout.errorUnknown':
    'The fork branch checkout could not be completed. Refresh and try again.',
  'projects.title': 'GitHub Projects',
  'projects.description':
    'Browse a bounded, read-only snapshot of this repository’s project views, items, and status fields.',
  'projects.refresh': 'Refresh Projects',
  'projects.sourceLive': 'Live from GitHub',
  'projects.sourceCached': 'Offline cache',
  'projects.sourceUnavailable': 'No snapshot',
  'projects.updatedAt': 'Snapshot from {timestamp}',
  'projects.stale': 'Cached more than 24 hours ago',
  'projects.refreshing': 'Refreshing…',
  'projects.readOnly':
    'Read-only: this workspace never edits Projects, fields, views, or items.',
  'projects.errorSignedOut':
    'Sign in with the GitHub account selected for this repository to refresh Projects.',
  'projects.errorAuthentication':
    'GitHub could not authenticate the selected account. Sign in again, then retry.',
  'projects.errorPermission':
    'GitHub denied access to Projects. Check this account’s repository and Projects permissions.',
  'projects.errorRateLimit':
    'The GitHub API rate limit was reached. Keep using the cache and retry after it resets.',
  'projects.errorNotFound':
    'GitHub could not find this repository or its Projects for the selected account.',
  'projects.errorUnsupported':
    'This GitHub server does not expose a supported Projects read API.',
  'projects.errorService':
    'GitHub Projects is temporarily unavailable. Retry in a moment.',
  'projects.errorNetwork':
    'GitHub Projects could not be reached. Check the network and retry.',
  'projects.errorInvalidResponse':
    'GitHub returned Projects data the app could not safely validate.',
  'projects.cacheRecovery': 'Showing the last validated offline snapshot.',
  'projects.partialTitle': 'Partial snapshot',
  'projects.partialProjects':
    'The project safety limit was reached; additional projects are not shown.',
  'projects.partialItems':
    'The item safety limit was reached; additional items are not shown.',
  'projects.partialViews':
    'The view safety limit was reached; additional views are not shown.',
  'projects.partialClassic':
    'Projects v2 is unavailable on this server, so this snapshot uses the read-only classic API fallback.',
  'projects.listAria': 'Repository Projects',
  'projects.itemCount': '{count} loaded items',
  'projects.stateOpen': 'Open',
  'projects.stateClosed': 'Closed',
  'projects.openOnGitHub': 'Open on GitHub',
  'projects.viewsAria': 'Project views',
  'projects.noItems': 'No items were returned for this project.',
  'projects.emptyTitle': 'No Projects returned',
  'projects.emptyDescription':
    'This repository has no visible Projects, or the selected account cannot see them.',
  'projects.kindIssue': 'Issue',
  'projects.kindPullRequest': 'Pull request',
  'projects.kindDraftIssue': 'Draft issue',
  'projects.kindNote': 'Note',
  'projects.kindUnavailable': 'Unavailable item',
  'projects.loading': 'Loading a bounded Projects snapshot…',
  'reviewRequest.manage': 'Manage review request…',
  'reviewRequest.openInBrowser': 'Open review request in browser',
  'reviewRequest.reviewRequested': 'Review requested',
  'reviewRequest.statusDraft': 'Draft',
  'reviewRequest.statusOpen': 'Open',
  'reviewRequest.noDescription': 'No description provided.',
  'reviewRequest.markdownBodyAriaLabel': 'Review request markdown body',
  'reviewRequest.quickViewAriaLabel': 'Review request #{number} quick view',
  'globalIgnore.title': 'Global ignore rules',
  'globalIgnore.description':
    "These rules apply to every local repository through Git's core.excludesFile. Repository .gitignore files remain separate and can add repository-specific rules.",
  'globalIgnore.pathLabel': 'Ignore file',
  'globalIgnore.loading': 'Loading the effective Git configuration…',
  'globalIgnore.configuredExisting':
    'Git is configured to use this existing file.',
  'globalIgnore.configuredNew': 'Git is configured to use this new file.',
  'globalIgnore.notConfigured':
    'Saving will create this file and configure Git to use it.',
  'globalIgnore.starterRules': 'Starter rules',
  'globalIgnore.addEditorFiles': 'Add editor files',
  'globalIgnore.addOSFiles': 'Add OS files',
  'globalIgnore.rulesAria': 'Global ignore rules',
  'globalIgnore.patternPlaceholder': 'One gitignore pattern per line',
  'globalIgnore.reload': 'Reload',
  'globalIgnore.savingAction': 'Saving…',
  'globalIgnore.saveAction': 'Save global rules',
  'globalIgnore.savingStatus': 'Saving global ignore rules…',
  'globalIgnore.savedStatus': 'Global ignore rules saved and activated.',
  'globalIgnore.loadError': 'Global ignore rules could not be loaded: {error}',
  'globalIgnore.saveError': 'Global ignore rules were not changed: {error}',
  'ignoreFilesContaining.title': 'Ignore files containing',
  'ignoreFilesContaining.description':
    'Build a wildcard rule from the filename, review the live matches, then add it to .gitignore.',
  'ignoreFilesContaining.patternLabel': 'Wildcard pattern',
  'ignoreFilesContaining.builderLabel': 'Wildcard builder',
  'ignoreFilesContaining.preview':
    '{count} matching file(s) in this working tree',
  'ignoreFilesContaining.invalidPattern':
    'Use a valid wildcard pattern. Close every character class and keep it under 256 characters.',
  'ignoreFilesContaining.noMatches':
    'This wildcard matches no current files. Adjust it before adding the rule.',
  'ignoreFilesContaining.confirm': 'Add to .gitignore',
  'customGit.title': 'Custom Git command presets',
  'customGit.description':
    'Save local, non-shell Git argument presets. Every run is reviewed and bound to the currently selected repository.',
  'customGit.savedPreset': 'Saved preset',
  'customGit.newUnsavedPreset': 'New unsaved preset',
  'customGit.newAction': 'New',
  'customGit.name': 'Name',
  'customGit.subcommand': 'Git subcommand',
  'customGit.arguments': 'Arguments',
  'customGit.warning':
    'Do not put passwords or tokens in presets. Interactive commands are unsupported because standard input is closed.',
  'customGit.saveAction': 'Save preset',
  'customGit.reviewAction': 'Review run',
  'customGit.deleteAction': 'Delete preset',
  'customGit.cancelRun': 'Cancel run',
  'customGit.confirmRunTitle': 'Run this command in the selected repository?',
  'customGit.confirmRunWarning':
    'Git built-ins can change files, refs, remotes, and published history. Review the complete preset before continuing.',
  'customGit.runReviewed': 'Run reviewed command',
  'customGit.goBack': 'Go back',
  'customGit.confirmDeleteTitle': 'Delete this local preset?',
  'customGit.confirmDeleteDescription': 'The repository is not changed.',
  'customGit.keepPreset': 'Keep preset',
  'customGit.outputAria': 'Custom Git command output',
  'customGit.initialStatus': 'Create or select a local command preset.',
  'customGit.repositoryChangedStatus':
    'Repository changed. Review the preset again.',
  'customGit.invalidNameError':
    'Preset names must be 1–80 printable characters.',
  'customGit.savedStatus': 'Preset saved on this device.',
  'customGit.saveError': 'Unable to save the preset.',
  'customGit.removedStatus': 'Preset removed from this device.',
  'customGit.reviewError': 'Unable to review command.',
  'customGit.runningStatus': 'Running reviewed Git preset…',
  'customGit.startError': 'The preset could not start.',
  'customGit.completedStatus': 'Custom Git preset completed.',
  'customGit.cancelledStatus': 'Custom Git preset cancelled.',
  'customGit.failedStatus': 'Custom Git preset failed.',
  'customGit.exitCodeError': 'Git exited with code {code}.',
  'editor.wslDisplayName': '{editor} — WSL: {distribution}',
  'editor.wslDistributionMismatch':
    'This path belongs to WSL distribution “{distribution}”. Choose its matching WSL editor entry.',
  'editor.wslInvalidDistributionPath':
    'Choose a valid WSL distribution and path.',
  'editor.wslTranslateFailed':
    'WSL could not translate this path. Check that the selected distribution is running and try again.',
  'editor.wslInvalidTranslatedPath': 'WSL returned an invalid translated path.',
  'editor.wslInvalidTarget': 'Choose a valid WSL editor target.',
  'networkRepository.unavailable':
    'This network location is unavailable or does not appear to be a Git repository.',
  'networkRepository.reconnect':
    'Reconnect the share, mapped drive, VPN, or WSL distribution and try again.',
  'networkRepository.unavailableAria':
    'This network location is unavailable or is not a Git repository. Reconnect it and try again.',
  'networkRepository.mappedDrive': 'mapped network drive',
  'networkRepository.wslShare': 'WSL share',
  'networkRepository.uncShare': 'UNC network share',
  'networkRepository.detected':
    'Detected a {location}. Desktop Material keeps its exact path; reconnect it before Git operations if the location goes offline.',
  'pullBranchDeleted.title': 'Remote branch is gone',
  'pullBranchDeleted.loading':
    'Checking what switching branches would do in this repository…',
  'pullBranchDeleted.reviewAria': 'Deleted remote branch recovery',
  'pullBranchDeleted.intro.plain':
    'Pulling {repository} failed because {remote} no longer has the branch {remoteBranch}, which the local branch {branch} tracks.',
  'pullBranchDeleted.intro.light':
    'The pull of {repository} had nowhere to go: {remote} no longer has {remoteBranch}, and the local branch {branch} is still tracking it.',
  'pullBranchDeleted.intro.playful':
    '{repository} tried to pull from a branch that has left the building. {remote} no longer has {remoteBranch}, and your local {branch} is still loyally tracking the ghost.',
  'pullBranchDeleted.intro.maximum':
    '{repository} rang {remote} to pull {remoteBranch}, and the number has been disconnected — that branch moved out and left no forwarding address. Your local {branch} is still writing it letters.',
  'pullBranchDeleted.offer':
    'Desktop Material can check out {default} in {repository} and pull that instead.',
  'pullBranchDeleted.blockedTitle': 'Cannot switch branches',
  'pullBranchDeleted.blockedNoDefaultBranch':
    'No default branch is configured for {repository}, so there is nothing to switch to. Desktop Material will not guess at one — check out the branch you want yourself.',
  'pullBranchDeleted.blockedNoCurrentBranch':
    '{repository} has no checked-out branch to move away from.',
  'pullBranchDeleted.blockedAlreadyOnDefaultBranch':
    '{repository} is already on its default branch, so switching to it would change nothing.',
  'pullBranchDeleted.blockedDirtyWorktree':
    '{repository} has uncommitted changes. Commit or stash them yourself first — switching branches here will never stash or discard your work for you.',
  'pullBranchDeleted.blockedConflictedWorktree':
    '{repository} has unresolved conflicts. Finish or abort that operation before switching branches.',
  'pullBranchDeleted.blockedOperationInProgress':
    'Another push, pull, or fetch is already running in {repository}. Wait for it to finish, then try again.',
  'pullBranchDeleted.planFailed':
    'Could not read the current state of {repository}. Nothing was changed.',
  'pullBranchDeleted.deleteLabel': 'Also delete the local branch {branch}',
  'pullBranchDeleted.deleteHint':
    'Off by default. A failed pull is not a reason to delete a branch.',
  'pullBranchDeleted.deleteStrandsCommits':
    '{count} commits exist only on {branch} and not on {default}. Deleting the branch would strand them.',
  'pullBranchDeleted.deleteStrandsCommitsOne':
    '1 commit exists only on {branch} and not on {default}. Deleting the branch would strand it.',
  'pullBranchDeleted.deleteStrandsUnknown':
    'Desktop Material could not count the commits that exist only on {branch}. Deleting it may strand work.',
  'pullBranchDeleted.deleteFullyMerged':
    'Every commit on {branch} is already on {default}.',
  'pullBranchDeleted.switchAction': 'Switch to {default} and pull',
  'pullBranchDeleted.close': 'Close',
  'pullBranchDeleted.startedTitle': 'Switching branch',
  'pullBranchDeleted.startedBody':
    'Switching {repository} from {branch} to {default} and pulling again.',
  'pullBranchDeleted.recoveredTitle': 'Pulled the default branch',
  'pullBranchDeleted.recovered.plain':
    '{repository} is now on {default} and the pull completed.',
  'pullBranchDeleted.recovered.light':
    '{repository} has moved to {default}, and the pull finally went through.',
  'pullBranchDeleted.recovered.playful':
    '{repository} has moved on to {default}, and the pull that had nothing to pull from finally pulled something.',
  'pullBranchDeleted.recovered.maximum':
    '{repository} packed its bags, moved to {default}, and the pull that spent all day tugging at thin air finally reeled in a real catch.',
  'pullBranchDeleted.retryFailedTitle': 'Switched branch, pull failed',
  'pullBranchDeleted.retryFailedBody':
    '{repository} is now on {default}, but the pull failed: {error}',
  'pullBranchDeleted.checkoutFailedTitle': 'Branch not switched',
  'pullBranchDeleted.checkoutFailedBody':
    '{repository} could not be checked out onto {default}. Nothing else was changed.',
  'pullBranchDeleted.deletionDone':
    'The local branch {branch} was deleted. Its remote branch was already gone.',
  'pullBranchDeleted.deletionSkipped':
    'The local branch {branch} was kept: {reason}',
  'pullPreview.title': 'Preview pull',
  'pullPreview.loading':
    'Fetching the latest upstream state without changing your worktree…',
  'pullPreview.progressTitle': 'Preparing pull preview',
  'pullPreview.progressRefresh': 'Refreshing repository state',
  'pullPreview.reviewAria': 'Reviewed pull preview',
  'pullPreview.routeAria': 'Pull route',
  'pullPreview.localBranch': 'Local branch',
  'pullPreview.upstreamBranch': 'Upstream branch',
  'pullPreview.strategy': 'Integration',
  'pullPreview.strategyFastForward': 'Fast-forward',
  'pullPreview.strategyMerge': 'Merge',
  'pullPreview.strategyRebase': 'Rebase',
  'pullPreview.strategyRebaseMerges': 'Rebase (preserve merges)',
  'pullPreview.strategyRebaseInteractive': 'Interactive rebase',
  'pullPreview.strategyFastForwardOnly': 'Fast-forward only',
  'pullPreview.ahead': '{count} ahead',
  'pullPreview.behind': '{count} behind',
  'pullPreview.upToDateTitle': 'Already up to date',
  'pullPreview.upToDateBody':
    'The fetch found no upstream commits to pull into this branch.',
  'pullPreview.incomingCommits': 'Incoming commits',
  'pullPreview.moreCommits': '{count} more commits are included in this pull.',
  'pullPreview.changedFiles': 'Incoming changed files',
  'pullPreview.noChangedFiles':
    'No net file changes are present in the incoming commits.',
  'pullPreview.moreFiles':
    '{count} more changed files are included in this pull.',
  'pullPreview.fileNew': 'New',
  'pullPreview.fileModified': 'Modified',
  'pullPreview.fileDeleted': 'Deleted',
  'pullPreview.fileRenamed': 'Renamed',
  'pullPreview.fileCopied': 'Copied',
  'pullPreview.exactCommitNote':
    'Pull integrates the exact upstream commit shown here; it does not fetch a newer tip after confirmation.',
  'pullPreview.conflictNote':
    'A diverged pull can still pause for conflicts. Your existing conflict workflow remains available.',
  'pullPreview.dirtyWarning':
    'Commit or stash local changes, then refresh this preview before pulling.',
  'pullPreview.conflictedWarning':
    'Resolve the current conflicts, then refresh this preview before pulling.',
  'pullPreview.fastForwardOnlyWarning':
    'This branch has diverged, but Git is configured for fast-forward-only pulls. Change the pull configuration or reconcile the branch before pulling.',
  'pullPreview.detached': 'Check out a local branch before previewing a pull.',
  'pullPreview.noUpstream':
    'Publish this branch or configure an upstream before previewing a pull.',
  'pullPreview.invalidState':
    'The current branch or its upstream could not be read safely. Refresh the repository and try again.',
  'pullPreview.errorTitle': 'Pull preview needs attention',
  'pullPreview.errorBusy':
    'Another network operation is running. Wait for it to finish, then refresh the preview.',
  'pullPreview.errorRemoteUnavailable':
    'The configured upstream remote is unavailable. Check the branch tracking settings and try again.',
  'pullPreview.errorFetchFailed':
    'The latest upstream state could not be fetched, so no stale preview was shown. Check the connection and try again.',
  'pullPreview.errorNoIncoming':
    'There are no reviewed upstream commits to pull. Refresh the preview.',
  'pullPreview.errorDirty':
    'Local changes appeared after review. Commit or stash them, then refresh the preview.',
  'pullPreview.errorConflicted':
    'Conflicts appeared after review. Resolve them, then refresh the preview.',
  'pullPreview.errorInvalidConfig':
    'Git pull configuration is invalid or changed while being reviewed. Fix it, then refresh the preview.',
  'pullPreview.errorStale':
    'The local branch or upstream changed after review. Refresh the preview before pulling.',
  'pullPreview.errorPullFailed':
    'The reviewed pull did not complete. Check the Git error, then refresh before trying again.',
  'pullPreview.errorUnexpected':
    'An unexpected error stopped the preview. Refresh the repository and try again.',
  'pullPreview.cancel': 'Cancel',
  'pullPreview.refresh': 'Refresh preview',
  'pullPreview.pull': 'Pull reviewed commit',
  'pullPreview.pulling': 'Pulling reviewed commit…',
  'batchSync.title': 'Sync repositories',
  'batchSync.loadingChoices': 'Loading repository choices…',
  'batchSync.reviewAria': 'Repository batch review',
  'batchSync.operation': 'Operation',
  'batchSync.pullActive': 'Pull active branches',
  'batchSync.fetchOnly': 'Fetch only (leave worktrees unchanged)',
  'batchSync.mergeCleanup':
    'Merge completed work into main, push, then clean up',
  'batchSync.mergeCleanupReview':
    'Desktop Material inventories local and remote branches, linked worktrees, and stashes. The configured Codex or OpenCode provider may resolve merge conflicts. Cleanup starts only after remote main exactly matches local main and every candidate tip is proved to be its ancestor. Dirty, unmerged, protected, default, moved, unpushed, or ownership-uncertain state is retained.',
  'batchSync.mergeCleanupConfirm':
    'I confirm that verified non-default branches and linked worktrees may be permanently deleted from this computer and their exact tracked remote branches.',
  'batchSync.chooseRepositories': 'Choose repositories',
  'batchSync.selectAll': 'Select all',
  'batchSync.selectNone': 'Select none',
  'batchSync.noRepositories': 'No repositories are available.',
  'batchSync.candidatesAria': 'Repositories to synchronize',
  'batchSync.reviewSingle':
    'Up to three repositories run at once. Each repository keeps an isolated result, and only this {count} reviewed repository is included.',
  'batchSync.reviewMultiple':
    'Up to three repositories run at once. Each repository keeps an isolated result, and only these {count} reviewed repositories are included.',
  'batchSync.cancel': 'Cancel',
  'batchSync.startPull': 'Start pull',
  'batchSync.startFetch': 'Start fetch',
  'batchSync.startMergeCleanup': 'Merge, push & clean up',
  'batchSync.progressAria': 'Sync progress',
  'batchSync.stopped': 'Sync stopped',
  'batchSync.pullComplete': 'Pull complete',
  'batchSync.fetchComplete': 'Fetch complete',
  'batchSync.mergeCleanupComplete': 'Merge and cleanup complete',
  'batchSync.liveProgress': 'Live progress',
  'batchSync.couldNotFinish': 'Repository sync could not finish',
  'batchSync.allProcessed': 'All repositories processed',
  'batchSync.pullingRepositories': 'Pulling repositories',
  'batchSync.fetchingRepositories': 'Fetching repositories',
  'batchSync.mergingCleanupRepositories':
    'Merging, pushing, and verifying cleanup',
  'batchSync.completedOf': '{completed} of {total} repositories complete',
  'batchSync.synchronizedAria': 'Repositories synchronized',
  'batchSync.metricComplete': '{count} complete',
  'batchSync.metricActive': '{count} active',
  'batchSync.metricWaiting': '{count} waiting',
  'batchSync.finalResult': 'Every repository has a final result.',
  'batchSync.nowPulling': 'Now pulling: {repositories}',
  'batchSync.nowFetching': 'Now fetching: {repositories}',
  'batchSync.nowMergingCleanup': 'Now integrating: {repositories}',
  'batchSync.waitingNext': 'Waiting for the next repository to start.',
  'batchSync.backgroundNote':
    'Up to three repositories are synchronized at a time. You can run this in the background while the work continues.',
  'batchSync.summaryPull':
    '{completed} pulled, {skipped} skipped, {failed} failed.',
  'batchSync.summaryFetch':
    '{completed} fetched, {skipped} skipped, {failed} failed.',
  'batchSync.summaryMergeCleanup':
    '{completed} merged, pushed, and cleaned; {skipped} skipped; {failed} need review.',
  'batchSync.noneToPull': 'There were no repositories to pull.',
  'batchSync.noneToMergeCleanup':
    'There were no repositories to merge and clean up.',
  'batchSync.resultsAria': 'Repository sync progress',
  'batchSync.repository': 'Repository',
  'batchSync.status': 'Status',
  'batchSync.detail': 'Current operation or result',
  'batchSync.runBackground': 'Run in background',
  'batchSync.done': 'Done',
  'batchSync.statusWaiting': 'Waiting',
  'batchSync.statusPulling': 'Pulling',
  'batchSync.statusFetching': 'Fetching',
  'batchSync.statusMergingCleanup': 'Merging & verifying',
  'batchSync.statusPulled': 'Pulled',
  'batchSync.statusFetched': 'Fetched',
  'batchSync.statusMergedCleaned': 'Merged & cleaned',
  'batchSync.statusSkipped': 'Skipped',
  'batchSync.statusFailed': 'Failed',
  'repositoryPicker.status': 'Repository status',
  'repositoryPicker.filters': 'Filters',
  'repositoryPicker.emptyTitle': 'No repositories yet',
  'repositoryPicker.emptyBody':
    'Clone one from a remote, add a folder you already have, or start a brand new repository.',
  'repositoryPicker.emptyClone': 'Clone repository',
  'repositoryPicker.emptyAdd': 'Add local repository',
  'repositoryPicker.emptyCreate': 'Create new repository',
  'repositoryPicker.filtersActive': 'Filters · {count}',
  'repositoryPicker.all': 'All',
  'repositoryPicker.clean': 'Clean',
  'repositoryPicker.changed': 'Changed',
  'repositoryPicker.ahead': 'Ahead',
  'repositoryPicker.behind': 'Behind',
  'repositoryPicker.missingOrCloning': 'Missing / cloning',
  'repositoryPicker.hideHiddenAria': 'Hide hidden repositories',
  'repositoryPicker.showHiddenAria': 'Show hidden repositories ({count})',
  'repositoryPicker.showingHidden': 'Showing hidden ({count})',
  'repositoryPicker.showHidden': 'Show hidden ({count})',
  'repositoryPicker.hidden': 'Hidden',
  'repositoryPicker.privateRepository': 'Private repository',
  'repositoryPicker.itemHiddenAria': '{repository}, hidden',
  'repositoryPicker.hideMenu': 'Hide repository',
  'repositoryPicker.unhideMenu': 'Unhide repository',
  'repositoryPicker.customizeNameMenu': 'Customize name appearance',
  'repositoryPicker.customizeLogoMenu': 'Customize logo appearance',
  // Repository-list group disclosure. The three bands are the funny-level
  // voice (1-2 plain, 3 light, 4-5 playful). The group name and the member
  // count are interpolated identically into every band: a folded group must
  // say exactly how many repositories it is holding, however playfully it says
  // that it is folded.
  'repositoryPicker.groupRepositoryOne': '1 repository',
  'repositoryPicker.groupRepositoryMany': '{count} repositories',
  'repositoryPicker.groupCollapsed.plain': '{group}, {repositories}, collapsed',
  'repositoryPicker.groupCollapsed.light':
    '{group}, {repositories}, currently folded away',
  'repositoryPicker.groupCollapsed.playful':
    '{group}, {repositories}, folded up and hiding',
  'repositoryPicker.groupCollapsed.maximum':
    '{group}, {repositories}, folded flat and pretending to be furniture',
  'repositoryPicker.groupExpanded.plain': '{group}, {repositories}, expanded',
  'repositoryPicker.groupExpanded.light':
    '{group}, {repositories}, currently open',
  'repositoryPicker.groupExpanded.playful':
    '{group}, {repositories}, wide open for business',
  'repositoryPicker.groupExpanded.maximum':
    '{group}, {repositories}, doors flung open and the kettle on',
  'repositoryPicker.autoExpandedOne.plain':
    'Filtering expanded 1 collapsed group so its matches stay visible.',
  'repositoryPicker.autoExpandedOne.light':
    'Filtering opened 1 collapsed group so none of its matches can hide.',
  'repositoryPicker.autoExpandedOne.playful':
    'Popped 1 folded group open — a search hit was hiding in there.',
  'repositoryPicker.autoExpandedOne.maximum':
    'The search warrant came through: 1 folded group opened up, and there was the match, hiding behind the sofa.',
  'repositoryPicker.autoExpandedMany.plain':
    'Filtering expanded {count} collapsed groups so their matches stay visible.',
  'repositoryPicker.autoExpandedMany.light':
    'Filtering opened {count} collapsed groups so none of their matches can hide.',
  'repositoryPicker.autoExpandedMany.playful':
    'Popped {count} folded groups open — search hits were hiding in there.',
  // Repository-list sync line. The four bands per state are the funny-level
  // voice (1-2 plain, 3 light, 4 playful, 5 maximum); the counts and the state
  // named in every band are identical, because the voice may change but the
  // facts never do.
  'repositoryPicker.autoExpandedMany.maximum':
    'Search warrants for {count} folded groups — every one of them was hiding matches behind the sofa.',
  'repositorySync.commitOne': '1 commit',
  'repositorySync.commitMany': '{count} commits',
  'repositorySync.unknown.plain': 'Sync state unknown, not checked yet',
  'repositorySync.unknown.light':
    'Not checked yet, so the sync state is unknown',
  'repositorySync.unknown.playful':
    'No idea yet, nobody has looked at the remote',
  'repositorySync.unknown.maximum':
    'A total mystery — nobody has so much as waved at the remote yet',
  'repositorySync.inSync.plain': 'In sync as of the last check',
  'repositorySync.inSync.light': 'Nothing to push or pull as of the last check',
  'repositorySync.inSync.playful':
    'Spotless at the last check, nothing to push or pull',
  'repositorySync.inSync.maximum':
    'Immaculate — the remote and this branch finish each other’s sentences; nothing to push, nothing to pull',
  'repositorySync.ahead.plain': '{ahead} to push, nothing to pull',
  'repositorySync.ahead.light': '{ahead} waiting to push, nothing to pull',
  'repositorySync.ahead.playful':
    '{ahead} queued for take-off, nothing to pull',
  'repositorySync.ahead.maximum':
    '{ahead} strapped in and revving on the runway, nothing to pull',
  'repositorySync.behind.plain': '{behind} to pull, nothing to push',
  'repositorySync.behind.light': '{behind} waiting to pull, nothing to push',
  'repositorySync.behind.playful':
    '{behind} parked at the remote with your name on them, nothing to push',
  'repositorySync.behind.maximum':
    '{behind} at the remote holding a little sign with your name on it, nothing to push',
  'repositorySync.diverged.plain': '{ahead} to push, {behind} to pull',
  'repositorySync.diverged.light':
    'Diverged: {ahead} to push and {behind} to pull',
  'repositorySync.diverged.playful':
    'Diverged, {ahead} to push and {behind} to pull, pick a lane',
  'repositorySync.diverged.maximum':
    'Diverged: {ahead} to push, {behind} to pull, and both sides think they are the main character',
  'repositorySync.noUpstream.plain': 'No upstream branch',
  'repositorySync.noUpstream.light': 'No upstream branch to compare against',
  'repositorySync.noUpstream.playful':
    'No upstream branch, this one is off the grid',
  'repositorySync.noUpstream.maximum':
    'No upstream branch — this one moved to the woods, fully off the grid',
  'repositorySync.detached.plain': 'Detached HEAD, no branch to compare',
  'repositorySync.detached.light':
    'Detached HEAD, so there is no branch to compare',
  'repositorySync.detached.playful':
    'Detached HEAD, floating free with no branch to compare',
  'repositorySync.detached.maximum':
    'Detached HEAD, drifting through space with no branch to phone home to',
  'repositorySync.empty.plain': 'No commits yet',
  'repositorySync.empty.light':
    'No commits yet, so there is nothing to compare',
  'repositorySync.empty.playful': 'Blank page energy, no commits yet',
  'repositorySync.empty.maximum':
    'No commits yet — a blank page doing breathing exercises before its big debut',
  'repositorySync.cloning.plain': 'Cloning, sync state not known yet',
  'repositorySync.cloning.light':
    'Still cloning, so the sync state is not known yet',
  'repositorySync.cloning.playful':
    'Still cloning, hold your horses before asking about the remote',
  'repositorySync.cloning.maximum':
    'Still cloning — the repository is literally being born, let it get dressed before you ask about the remote',
  'repositorySync.missing.plain': 'Missing from disk, sync state unknown',
  'repositorySync.missing.light':
    'Missing from disk, so the sync state is unknown',
  'repositorySync.missing.playful':
    'Vanished from disk, so the remote cannot be checked',
  'repositorySync.missing.maximum':
    'Gone from disk without leaving a note, so the remote cannot be checked',
  'repositoryActions.add': 'Add',
  'repositoryActions.addAria': 'Add a repository',
  'repositoryActions.select': 'Select',
  'repositoryActions.more': 'More',
  'repositoryActions.moreAria': 'More repository actions',
  'relativeTime.justNow': 'just now',
  'repositoryActions.commitPushAll': 'Commit & push all',
  'repositoryBulk.enterSelection': 'Select multiple',
  'repositoryBulk.enterSelectionAria': 'Select multiple repositories',
  'repositoryBulk.barAria': 'Bulk repository actions',
  'repositoryBulk.selectAllVisible': 'Select all visible',
  'repositoryBulk.selectAllVisibleAria': 'Select all visible repositories',
  'repositoryBulk.selectedCount': '{count} selected',
  'repositoryBulk.selectRepositoryAria': 'Select repository {repository}',
  'repositoryBulk.clear': 'Clear',
  'repositoryBulk.clearAria': 'Clear the selection and leave multi-select',
  'repositoryBulk.fetch': 'Fetch ({count})',
  'repositoryBulk.pull': 'Pull ({count})',
  'repositoryBulk.favorite': 'Favorite ({count})',
  'repositoryBulk.unfavorite': 'Unfavorite ({count})',
  'repositoryBulk.groupLabel': 'Group',
  'repositoryBulk.groupPlaceholder': 'Group name',
  'repositoryBulk.assignGroup': 'Assign to group ({count})',
  'repositoryBulk.removeGroup': 'Remove from group ({count})',
  'repositoryBulk.remove': 'Remove from list ({count})',
  'repositoryBulk.noticeAria': 'Bulk action result',
  'repositoryBulk.favoritedNotice': 'Favorited {count} repositories.',
  'repositoryBulk.unfavoritedNotice':
    'Removed {count} repositories from favorites.',
  'repositoryBulk.assignedNotice': 'Assigned {count} repositories to {group}.',
  'repositoryBulk.removedGroupNotice':
    'Removed {count} repositories from their group.',
  'repositoryBulk.removedNotice': 'Removed {count} repositories from the list.',
  'repositoryBulk.progressAria': 'Bulk repository progress',
  'repositoryBulk.fetchingTitle': 'Fetching selected repositories',
  'repositoryBulk.pullingTitle': 'Pulling selected repositories',
  'repositoryBulk.completedOf': '{completed} of {total} repositories complete',
  'repositoryBulk.progressTrackAria': 'Repositories processed',
  'repositoryBulk.cancel': 'Cancel',
  'repositoryBulk.cancelAria': 'Stop after the current repository finishes',
  'repositoryBulk.cancelling':
    'Stopping after the current repository finishes.',
  'repositoryBulk.dismiss': 'Dismiss',
  'repositoryBulk.summary':
    '{done} done, {failed} failed, {skipped} skipped, {remaining} not started.',
  'repositoryBulk.resultsAria': 'Per-repository results',
  'repositoryBulk.repository': 'Repository',
  'repositoryBulk.status': 'Status',
  'repositoryBulk.detail': 'Detail',
  'repositoryBulk.statusQueued': 'Waiting',
  'repositoryBulk.statusRunning': 'Working',
  'repositoryBulk.statusDone': 'Done',
  'repositoryBulk.statusFailed': 'Failed',
  'repositoryBulk.statusSkipped': 'Skipped',
  'repositoryBulk.statusCancelled': 'Not started',
  'repositoryBulk.noDetail': 'No detail reported.',
  'repositoryBulk.removeTitleSingular':
    'Remove {count} repository from Desktop Material?',
  'repositoryBulk.removeTitlePlural':
    'Remove {count} repositories from Desktop Material?',
  'repositoryBulk.removeDescription':
    'This removes them from this list only. Nothing on disk is deleted and no Git data is changed.',
  'repositoryBulk.removeListAria': 'Repositories that will be removed',
  'repositoryBulk.removeConfirm': 'Remove from list',
  'repositoryBulk.removeCancel': 'Cancel',
  'repositoryGroups.newButton': 'Group',
  'repositoryGroups.newButtonAria': 'Create a repository group',
  'repositoryGroups.actionsLabel': 'Group actions for {group}',
  'repositoryGroups.editMenu': 'Edit group…',
  'repositoryGroups.removeMenu': 'Remove group',
  'repositoryGroups.createTitle': 'New repository group',
  'repositoryGroups.editTitle': 'Edit repository group',
  'repositoryGroups.createIntro':
    'Name the group and tick the repositories that join it. A group only organizes this list; no repository is cloned, moved, or removed.',
  'repositoryGroups.editIntro':
    'Rename “{group}” or change which repositories it holds. It currently holds {count} repositories.',
  'repositoryGroups.nameLabel': 'Group name',
  'repositoryGroups.membersLabel': 'Repositories in this group',
  'repositoryGroups.searchLabel': 'Search repositories',
  'repositoryGroups.searchPlaceholder': 'Filter repositories',
  'repositoryGroups.searchTarget': 'repository names and paths',
  'repositoryGroups.regexError': 'Regex: {message}',
  'repositoryGroups.noMatches': 'No repository matches that search.',
  'repositoryGroups.empty': 'There are no repositories to group yet.',
  'repositoryGroups.selectedCount':
    '{selected} of {total} repositories chosen.',
  'repositoryGroups.createAction': 'Create group',
  'repositoryGroups.saveAction': 'Save group',
  'repositoryGroups.cancelAction': 'Cancel',
  'repositoryGroups.removeAction': 'Remove group',
  'repositoryGroups.removeHint':
    'Removing a group clears the group label only. Every repository stays in the list and nothing on disk is touched.',
  'repositoryGroups.createdStatus':
    'Created the {group} group with {count} repositories.',
  'repositoryGroups.updatedStatus':
    'Updated the {group} group. It now holds {count} repositories.',
  'repositoryGroups.removedStatus':
    'Removed the {group} group. Its {count} repositories stayed in the list.',
  'repositoryGroups.actionFailed':
    'Could not update the repository group. Try again.',
  'repositoryGroups.noticeAria': 'Repository group result',
  'removeRepository.trashFailedMessage':
    "The repository couldn't be moved to {trash}. A file may be open in another program, or the location (such as a network or removable drive) may not support {trash}.",
  'removeRepository.trashFailedWarning':
    'Force delete permanently removes the folder and all of its contents from your disk. This cannot be undone.',
  'removeRepository.forceDeleteButton': 'Force delete permanently',
  'patchSeries.initialStatus': 'Choose an export or import operation.',
  'patchSeries.runningExport':
    'Exporting commits ahead of the configured upstream',
  'patchSeries.runningImport': 'Applying the reviewed patch series',
  'patchSeries.runningContinue': 'Continuing the current patch session',
  'patchSeries.runningSkip': 'Skipping the current patch',
  'patchSeries.runningAbort': 'Aborting the current patch session',
  'patchSeries.operation': 'Patch-series operation',
  'patchSeries.chooseExportTitle': 'Choose a new patch-series folder',
  'patchSeries.reviewExportStatus': 'Review the new export folder.',
  'patchSeries.prepareExportError':
    'Unable to prepare the patch-series export.',
  'patchSeries.prepareExportFailed': 'Patch export preparation failed.',
  'patchSeries.chooseImportTitle': 'Choose patch files in apply order',
  'patchSeries.patchFileFilter': 'Git patch series',
  'patchSeries.reviewImportStatus': 'Review the selected patch order.',
  'patchSeries.prepareImportError':
    'Unable to prepare the patch-series import.',
  'patchSeries.prepareImportFailed': 'Patch import preparation failed.',
  'patchSeries.runningStatus': '{operation}…',
  'patchSeries.startError': 'Unable to start the patch-series operation.',
  'patchSeries.cancelledStatus': 'Patch-series operation cancelled.',
  'patchSeries.failedStatus': '{operation} failed.',
  'patchSeries.gitFailed': 'Git could not complete this operation.',
  'patchSeries.gitFailedWithCode':
    'Git could not complete this operation (exit {code}).',
  'patchSeries.refreshingStatus': 'Refreshing repository…',
  'patchSeries.exportedStatus': 'Patch series exported to a new folder.',
  'patchSeries.abortedStatus':
    'Patch session aborted and repository state restored.',
  'patchSeries.completedStatus': 'Patch-series operation completed.',
  'patchSeries.refreshFailedStatus':
    'The patch operation completed, but refresh failed.',
  'patchSeries.refreshRequiredError':
    'Refresh the repository before starting another operation.',
  'patchSeries.exportConfirmTitle': 'Export commits ahead of upstream?',
  'patchSeries.exportConfirmDescription':
    'Git will create a new numbered patch-series folder at {destination}. Existing destinations are never replaced.',
  'patchSeries.exportAction': 'Export patch series',
  'patchSeries.goBack': 'Go back',
  'patchSeries.importConfirmTitle': 'Apply {count} patches in this order?',
  'patchSeries.importConfirmDescription':
    'Git will create commits with three-way fallback. Resolve any conflict in Changes, then continue, skip, or abort here.',
  'patchSeries.additionalPatches': '{count} additional patches selected.',
  'patchSeries.importAction': 'Apply patch series',
  'patchSeries.recoveryAria': 'Patch conflict recovery',
  'patchSeries.recoveryDescription':
    'After resolving files in Changes, continue this patch, skip it, or abort the complete import.',
  'patchSeries.continueAction': 'Continue',
  'patchSeries.skipAction': 'Skip patch',
  'patchSeries.abortAction': 'Abort import',
  'patchSeries.title': 'Patch series',
  'patchSeries.heading': 'Exchange reviewable commit series',
  'patchSeries.description':
    'Export commits ahead of the configured upstream, or apply a native-picker selection of numbered patches in reviewed order.',
  'patchSeries.chooseExportAction': 'Choose export destination',
  'patchSeries.chooseImportAction': 'Choose patch files',
  'patchSeries.cancelAction': 'Cancel',
  'patchSeries.resultsAria': 'Patch-series results',
  'bulkBranchDelete.aria': 'Bulk branch deletion',
  'bulkBranchDelete.closeAction': 'Close branch cleanup',
  'bulkBranchDelete.openAction': 'Delete branches…',
  'bulkBranchDelete.reviewTitle': 'Review local branches',
  'bulkBranchDelete.protectedDescription':
    'Current and default branches are protected.',
  'bulkBranchDelete.selectAll': 'Select all',
  'bulkBranchDelete.selectNone': 'Select none',
  'bulkBranchDelete.empty': 'No other local branches can be deleted.',
  'bulkBranchDelete.listAria': 'Local branches to delete',
  'bulkBranchDelete.reviewDeletion': 'Review deletion ({count})',
  'bulkBranchDelete.confirmSingular':
    'Permanently delete {count} exact local branch?',
  'bulkBranchDelete.confirmPlural':
    'Permanently delete {count} exact local branches?',
  'bulkBranchDelete.remoteUnaffected':
    'Remote branches are not changed. Each local tip is rechecked before deletion and logged for recovery.',
  'bulkBranchDelete.deleteReviewed': 'Delete reviewed branches',
  'bulkBranchDelete.goBack': 'Go back',
  'bulkBranchDelete.deleting': 'Deleting branches…',
  'bulkBranchDelete.limitError': 'Review at most {count} branches at a time.',
  'bulkBranchDelete.reviewChangedError': 'The reviewed branch list changed.',
  'bulkBranchDelete.deleteError': 'The reviewed branches could not be deleted.',
  'bulkBranchDelete.resultsAria': 'Deletion results',
  'stashManager.timeUnavailable': 'Time unavailable',
  'stashManager.timestamp': '{timestamp}',
  'stashManager.operationCancelled':
    '{operation} cancelled. The repository was refreshed.',
  'stashManager.operationFailed':
    '{operation} could not finish. Git may have left working-tree conflicts; the stash was kept whenever restore was not clean. Review Changes and try again.',
  'stashManager.repositoryChangedStatus':
    'Repository changed. The stash manager was reset.',
  'stashManager.operationProgress': '{operation}…',
  'stashManager.cancellingStatus': 'Cancelling…',
  'stashManager.createOperation': 'Creating named stash',
  'stashManager.createSuccess':
    'Named stash created. It is available under its recorded branch.',
  'stashManager.applyOperation': 'Applying stash copy',
  'stashManager.applySuccess':
    'Stashed changes were applied. The stash was kept for recovery.',
  'stashManager.saveDetailsOperation': 'Saving stash details',
  'stashManager.saveDetailsSuccess':
    'Stash name and branch association updated.',
  'stashManager.clearOperation': 'Clearing reviewed stashes',
  'stashManager.clearSuccessSingular':
    '{count} reviewed Desktop-managed stash cleared. Other Git stashes were not touched.',
  'stashManager.clearSuccessPlural':
    '{count} reviewed Desktop-managed stashes cleared. Other Git stashes were not touched.',
  'stashManager.stashChangedError':
    'That stash changed. Refresh and review the current list.',
  'stashManager.restoreOperation': 'Restoring stash',
  'stashManager.restoreSuccess':
    'Stash restored and removed. Resolve any Changes conflicts before continuing.',
  'stashManager.discardOperation': 'Discarding stash',
  'stashManager.discardSuccess': 'Reviewed Desktop-managed stash discarded.',
  'stashManager.createBranchOperation': 'Creating branch from stash',
  'stashManager.createBranchSuccess':
    'New branch created and checked out. The stash was consumed only after a clean restore.',
  'stashManager.createHeading': 'Create a named stash',
  'stashManager.nameLabel': 'Name',
  'stashManager.createPlaceholder': 'What are you saving?',
  'stashManager.changesToSave': 'Changes to save',
  'stashManager.allTrackedChanges': 'All tracked changes',
  'stashManager.selectedFileSingular': '{count} selected file',
  'stashManager.selectedFilePlural': '{count} selected files',
  'stashManager.includeUntracked': 'Include untracked files in this scope',
  'stashManager.selectedScopeCaption':
    'Selected scope saves whole files and rechecks the selected paths before Git runs. Partial-hunk staging is left in Changes.',
  'stashManager.untrackedWarning':
    'Selected untracked files stay in Changes unless Include untracked is checked.',
  'stashManager.conflictsWarning':
    'Resolve the current working-tree conflicts before creating another stash.',
  'stashManager.createAction': 'Create named stash',
  'stashManager.fileCountSingular': '{count} file',
  'stashManager.fileCountPlural': '{count} files',
  'stashManager.filesLoadWhenOpened': 'Files load when opened',
  'stashManager.reviewStashAria': 'Review {name} for stash clear',
  'stashManager.externalLabel': 'External',
  'stashManager.selectedActionsAria': 'Selected stash actions',
  'stashManager.workingChangesWarningSingular':
    'Changes already contains {count} file. Apply or restore may conflict; a failed restore keeps the stash.',
  'stashManager.workingChangesWarningPlural':
    'Changes already contains {count} files. Apply or restore may conflict; a failed restore keeps the stash.',
  'stashManager.applyAction': 'Apply copy',
  'stashManager.restoreAction': 'Restore',
  'stashManager.renameMoveAction': 'Rename or move',
  'stashManager.newBranchAction': 'New branch',
  'stashManager.discardAction': 'Discard',
  'stashManager.editStashAria': 'Edit {name}',
  'stashManager.branchAssociation': 'Branch association',
  'stashManager.metadataCaption':
    'This changes Desktop Material’s grouping only; it does not switch branches or modify the saved files.',
  'stashManager.saveDetailsAction': 'Save details',
  'stashManager.cancelAction': 'Cancel',
  'stashManager.branchFromAria': 'Branch from {name}',
  'stashManager.newLocalBranch': 'New local branch',
  'stashManager.branchCaption':
    'Git validates that the branch is new, checks it out, and consumes the stash only after its changes apply cleanly.',
  'stashManager.reviewBranchAction': 'Review branch creation',
  'stashManager.confirmRestore':
    'Restore applies these changes and removes the stash only if Git finishes cleanly.',
  'stashManager.confirmDiscard':
    'Discard permanently removes this reviewed repository stash.',
  'stashManager.confirmBranch':
    'Create and check out “{name}” from this stash?',
  'stashManager.confirmClearSingular':
    'Permanently clear {count} reviewed repository stash? Only the exact checked identities are included.',
  'stashManager.confirmClearPlural':
    'Permanently clear {count} reviewed repository stashes? Only the exact checked identities are included.',
  'stashManager.createBranchAction': 'Create branch',
  'stashManager.confirmAction': 'Confirm',
  'stashManager.inventoryHeading': 'Repository stash inventory',
  'stashManager.clearReviewedAction': 'Clear reviewed ({count})',
  'stashManager.emptyInventory': 'No stashes in this repository.',
  'stashManager.currentLabel': 'Current',
  'stashManager.managedOnlyCaption':
    'All listed stashes were created by Desktop Material.',
  'stashManager.externalCaptionSingular':
    '{count} external Git stash is shown. Apply, restore, branch, and exact reviewed discard are supported; external metadata stays unchanged.',
  'stashManager.externalCaptionPlural':
    '{count} external Git stashes are shown. Apply, restore, branch, and exact reviewed discard are supported; external metadata stays unchanged.',
  'stashManager.truncatedCaption':
    ' The inventory is limited to the newest 500 entries; refresh after clearing a reviewed batch.',
  'stashManager.managerAria': 'Stash manager',
  'stashManager.repositoryStashSingular': '{count} repository stash',
  'stashManager.repositoryStashPlural': '{count} repository stashes',
  'stashManager.checkoutBranchCaption': 'Check out a branch to create one',
  'stashManager.onBranchCaption': '{count} on {branch}',
  'stashManager.closeAction': 'Close',
  'stashManager.manageAction': 'Manage',
  'stashManager.controlsAria': 'Managed stash controls',
  'stashManager.cancelOperationAction': 'Cancel operation',
  'stashManager.filterLabel': 'Filter stashes',
  'stashManager.filterPlaceholder': 'Filter by name or branch',
  'stashManager.filterAria': 'Filter repository stashes by name or branch',
  'stashManager.filterRegexTarget': 'Stashes',
  'stashManager.filterMatchSingular': '{count} stash matches',
  'stashManager.filterMatchPlural': '{count} stashes match',
  'stashManager.noMatches': 'No stashes match this filter.',
  'stashManager.invalidFilterPattern': 'Invalid search pattern: {error}',
  'stashManager.openDialogAction': 'Open full manager',
  'stashManager.dialogTitle': 'Stash manager',
  'stashManager.dialogDescription':
    'Name, search, review, restore, and export every local stash. The inventory has no entry-count cap; Git storage and the bounded metadata read are the practical limits.',
  'stashManager.dialogTabsAria': 'Stash manager sections',
  'stashManager.openNewTabAction': 'Open a Stash manager page in a new tab',
  'stashManager.allPagesOpen': 'All Stash manager pages are already open',
  'stashManager.morePages': '{count} more Stash manager pages',
  'stashManager.manageTab': 'Manage',
  'stashManager.exportTab': 'Export',
  'stashManager.historyTab': 'History',
  'stashManager.appearanceTab': 'Appearance and voice',
  'stashManager.closeDialogAction': 'Close manager',
  'stashManager.historyHeading': 'Recoverable stash history',
  'stashManager.historyDescription':
    'Each row keeps the exact stash object identity, branch association, and name visible for review before an action changes anything.',
  'stashManager.appearanceHeading': 'Make this dialog yours',
  'stashManager.appearanceDescription':
    'This surface inherits the app appearance, language mode, funny-level sliders, focus treatment, reduced-motion behavior, and notification history. Open Settings to change the shared values; the dialog refreshes when they change.',
  'stashManager.editAppearanceAction': 'Open appearance settings',
  'stashManager.appearanceHint':
    'Search remains plain text by default, regex is opt-in, destructive actions stay reviewable, and errors remain factual at every voice level.',
  'stashManager.exportPanelAria': 'Export selected stashes',
  'stashManager.exportDescription':
    'Select any number of named or external stashes and copy their metadata plus exact Git trees to a directory, ZIP, or 7z archive.',
  'stashManager.exportSearchLabel': 'Search stashes to export',
  'stashManager.exportSearchAria':
    'Search exportable stashes by name, branch, or object ID',
  'stashManager.exportSearchRegexTarget': 'Exportable stashes',
  'stashManager.selectVisible': 'Select visible',
  'stashManager.invertVisible': 'Invert visible selection',
  'stashManager.exportSelectedCount': '{count} selected for export',
  'stashManager.exportFormatLabel': 'Export format',
  'stashManager.exportDirectory': 'Directory copy',
  'stashManager.exportSecurityNote':
    'Archive passwords are used only for this export. Header encryption hides 7z filenames when a password is present; passwords are never saved in the stash metadata.',
  'stashManager.exportComplete': 'Export complete',
  'stashManager.openExportInEditor': 'Open export in VS Code',
  'stashManager.exportAction': 'Export selected stashes',
  'stashManager.exportingAction': 'Exporting…',
  'stashManager.exportSelectionRequired':
    'Select at least one stash to export.',
  'stashManager.exportFailed': 'The stash export failed.',
  'stashManager.chooseDirectoryTitle': 'Choose a directory for the stash copy',
  'stashManager.chooseArchiveTitle': 'Choose the stash archive destination',
  'stashManager.sevenZipOptionsHeading': '7z options',
  'stashManager.sevenZipMethod': 'Compression method',
  'stashManager.sevenZipLevel': 'Compression level (0–9)',
  'stashManager.sevenZipDictionary': 'Dictionary size',
  'stashManager.sevenZipWordSize': 'Word size',
  'stashManager.sevenZipMatchFinder': 'Match finder',
  'stashManager.sevenZipFastBytes': 'Fast bytes',
  'stashManager.sevenZipThreads': 'Threads',
  'stashManager.sevenZipSplitVolumes': 'Split volumes (for example 100m)',
  'stashManager.sevenZipSolid': 'Solid archive',
  'stashManager.sevenZipPassword': 'Password',
  'stashManager.sevenZipEncryptHeaders': 'Encrypt 7z headers and filenames',
  'stashManager.historySearchLabel': 'Search stash history',
  'stashManager.historySearchAria':
    'Search stash history by name, branch, or object ID',
  'stashManager.historySearchRegexTarget': 'Stash history',
  'stashManager.appearanceSearchLabel': 'Search appearance and voice controls',
  'stashManager.appearanceSearchAria':
    'Search this dialog appearance and voice controls',
  'stashManager.appearanceSearchRegexTarget': 'Appearance and voice controls',
  'tagLifecycle.rejectedError':
    'Git rejected the tag operation. Review the application error for details.',
  'tagLifecycle.operationFailedError': 'The tag operation failed.',
  'tagLifecycle.createdStatus': 'Created local tag {name}.',
  'tagLifecycle.movedStatus': 'Moved local tag {name}.',
  'tagLifecycle.deletedLocalStatus': 'Deleted local tag {name}.',
  'tagLifecycle.pushedStatus': 'Pushed tag {name}.',
  'tagLifecycle.pushedAllStatus': 'Pushed {count} local tags.',
  'tagLifecycle.fetchedPrunedStatus': 'Fetched and pruned tags from {remote}.',
  'tagLifecycle.deletedRemoteStatus': 'Deleted remote tag {name}.',
  'tagLifecycle.confirmMove': 'Recreate {name} at {target} as a {kind} tag.',
  'tagLifecycle.confirmDeleteLocal':
    'Delete local tag {name}. This does not delete the remote tag.',
  'tagLifecycle.confirmPushNew': 'Push new remote tag {name}.',
  'tagLifecycle.confirmPushReplace':
    'Push {name}, replacing only the exact reviewed remote tag object if it differs.',
  'tagLifecycle.confirmPushAll':
    'Push all {count} reviewed local tags, replacing only exact reviewed remote objects where needed.',
  'tagLifecycle.confirmFetchPrune':
    'Fetch tags from {remote} and delete reviewed local tags that the remote no longer advertises.',
  'tagLifecycle.confirmDeleteRemote':
    'Delete {name} from the default remote after revalidating object {object}.',
  'tagLifecycle.createHeading': 'Create tag',
  'tagLifecycle.nameLabel': 'Name',
  'tagLifecycle.targetLabel': 'Target',
  'tagLifecycle.targetPlaceholder': 'HEAD, branch, or object ID',
  'tagLifecycle.typeLabel': 'Type',
  'tagLifecycle.annotated': 'Annotated',
  'tagLifecycle.lightweight': 'Lightweight',
  'tagLifecycle.messageLabel': 'Message',
  'tagLifecycle.signConfigured': "Sign using Git's configured {format} signer",
  'tagLifecycle.signingConfigured':
    'Git reports an explicit signing key for this repository.',
  'tagLifecycle.signingNotConfigured':
    'No explicit user.signingkey is set; Git may use a default signer or report that signing is unavailable.',
  'tagLifecycle.createAction': 'Create local tag',
  'tagLifecycle.moveAria': 'Move {name}',
  'tagLifecycle.moveHeading': 'Move or recreate {name}',
  'tagLifecycle.reviewedObject':
    'The reviewed object is {object}. Git will reject this operation if the tag changes before confirmation.',
  'tagLifecycle.newTargetLabel': 'New target',
  'tagLifecycle.recreatedTypeLabel': 'Recreated type',
  'tagLifecycle.signRecreated': 'Sign recreated tag',
  'tagLifecycle.reviewMoveAction': 'Review move',
  'tagLifecycle.cancelAction': 'Cancel',
  'tagLifecycle.remoteNotLoaded': 'Remote not loaded',
  'tagLifecycle.localOnly': 'Local only',
  'tagLifecycle.pushed': 'Pushed',
  'tagLifecycle.differentRemotely': 'Different remotely',
  'tagLifecycle.annotatedLower': 'annotated',
  'tagLifecycle.lightweightLower': 'lightweight',
  'tagLifecycle.localTagMeta': '{kind} · {target} · {remoteStatus}{signed}',
  'tagLifecycle.signedSuffix': ' · signed',
  'tagLifecycle.moveAction': 'Move',
  'tagLifecycle.pushAction': 'Push',
  'tagLifecycle.deleteRemoteAction': 'Delete remote',
  'tagLifecycle.deleteLocalAction': 'Delete local',
  'tagLifecycle.remoteOnlyMeta': 'remote only · {target}',
  'tagLifecycle.confirmHeading': 'Confirm tag operation',
  'tagLifecycle.typeToConfirm': 'Type {phrase} to confirm',
  'tagLifecycle.confirmAction': 'Confirm',
  'tagLifecycle.managerAria': 'Tag lifecycle manager',
  'tagLifecycle.title': 'Tag lifecycle',
  'tagLifecycle.description':
    'Inventory, create, move, sign, push, fetch, prune, and delete tags through bounded Git operations.',
  'tagLifecycle.refreshLocalAction': 'Refresh local',
  'tagLifecycle.loadRemoteAction': 'Load remote',
  'tagLifecycle.readOnlyNotice':
    'Temporary submodule workspaces are read-only in Repository tools.',
  'tagLifecycle.loading': 'Loading tag inventory…',
  'tagLifecycle.filterLabel': 'Filter tags',
  'tagLifecycle.fetchedStatus': 'Fetched tags from {remote}.',
  'tagLifecycle.fetchAction': 'Fetch tags',
  'tagLifecycle.fetchPruneAction': 'Fetch and prune',
  'tagLifecycle.pushAllAction': 'Push all',
  'tagLifecycle.localTagsHeading': 'Local tags ({count})',
  'tagLifecycle.noLocalMatches': 'No local tags match this filter.',
  'tagLifecycle.localTruncated':
    'Showing the first 500 local tags. Narrow the repository tag set before bulk operations.',
  'tagLifecycle.remoteOnlyHeading': 'Remote-only tags ({count}) on {remote}',
  'tagLifecycle.noRemoteMatches': 'No remote-only tags match this filter.',
  'tagLifecycle.remoteTruncated':
    'Showing the first 500 remote tags. Remote deletion is disabled for undisplayed tags, and bulk push/prune stay unavailable until the inventory is complete.',
  'ollama.setup.heading': 'Ollama local models',
  'ollama.setup.description':
    'Run and manage large language models on this machine. Desktop Material only talks to Ollama over a loopback address.',
  'ollama.setup.notConfiguredTitle': 'Connect to Ollama',
  'ollama.setup.notConfiguredBody':
    'No Ollama endpoint is configured yet. Start Ollama on this machine, then connect to the loopback address it listens on.',
  'ollama.setup.endpointLabel': 'Ollama endpoint',
  'ollama.setup.endpointHint':
    'Only loopback addresses are accepted: localhost, 127.0.0.0/8, or ::1.',
  'ollama.setup.connect': 'Connect',
  'ollama.setup.connecting': 'Connecting…',
  'ollama.setup.invalidEndpoint':
    'Enter a loopback Ollama endpoint, for example http://127.0.0.1:11434.',
  'ollama.setup.connectFailed':
    'Could not reach Ollama at that endpoint. Check that Ollama is running, then try again.',
  'ollama.setup.saveFailed': 'The Ollama endpoint could not be saved.',
  'ollama.setup.guidanceTitle': 'Before you connect',
  'ollama.setup.guidanceInstall':
    'Install Ollama and start it, or run `ollama serve` in a terminal.',
  'ollama.setup.guidanceDefault':
    'A stock install listens on http://127.0.0.1:11434.',
  'ollama.setup.guidanceLocal':
    'Models, prompts, and chats stay on this machine.',
  'ollama.setup.providerLabel': 'Ollama provider',
  'ollama.providerType': 'Ollama (local)',
  'ollama.authenticationHeading': 'Authentication',
  'ollama.authenticationDescription':
    "Ollama runs locally without an API key. Desktop Material will only use its native management API at this provider's configured URL.",
  'ollama.modelsSyncDescription':
    'Installed Ollama models will be synchronized from the model manager after you add this provider.',
  'ollama.modelsEmpty':
    'No models synchronized yet. Add this provider, then open its model manager.',
  'ollama.manager.openAction': 'Manage models',
  'ollama.manager.backAction': 'Back to providers',
  'ollama.manager.title': 'Ollama model manager',
  'ollama.manager.subtitle':
    'Install, inspect, and control models on this Ollama provider.',
  'ollama.manager.endpoint': 'Endpoint',
  'ollama.manager.configuredEndpoint': 'Configured endpoint',
  'ollama.manager.connected': 'Connected',
  'ollama.manager.unavailable': 'Unavailable',
  'ollama.manager.checking': 'Checking…',
  'ollama.manager.partial': 'Some model information could not be loaded.',
  'ollama.manager.version': 'Version',
  'ollama.manager.installed': 'Installed',
  'ollama.manager.running': 'Running',
  'ollama.manager.refresh': 'Refresh',
  'ollama.manager.refreshing': 'Refreshing…',
  'ollama.manager.searchLabel': 'Search installed models',
  'ollama.manager.searchPlaceholder': 'Search by name, family, or capability…',
  'ollama.manager.clearSearch': 'Clear search',
  'ollama.manager.scopeLabel': 'Model inventory filter',
  'ollama.manager.allModels': 'All models',
  'ollama.manager.runningModels': 'Running only',
  'ollama.manager.inventoryLabel': 'Installed Ollama models',
  'ollama.manager.loadingInventory': 'Loading models…',
  'ollama.manager.unavailableInventory': 'The model inventory is unavailable.',
  'ollama.manager.emptyInventory': 'No models are installed on this endpoint.',
  'ollama.manager.emptyFilter': 'No models match the current filters.',
  'ollama.manager.modelDetails': 'Model details',
  'ollama.manager.selectModel':
    'Select an installed model to inspect and manage it.',
  'ollama.manager.loadingDetails': 'Loading model details…',
  'ollama.manager.runningBadge': 'Running',
  'ollama.manager.size': 'Size',
  'ollama.manager.modified': 'Modified',
  'ollama.manager.digest': 'Digest',
  'ollama.manager.family': 'Family',
  'ollama.manager.format': 'Format',
  'ollama.manager.parameters': 'Parameters',
  'ollama.manager.quantization': 'Quantization',
  'ollama.manager.capabilities': 'Capabilities',
  'ollama.manager.license': 'License summary',
  'ollama.manager.noneReported': 'Not reported',
  'ollama.manager.runtime': 'Runtime',
  'ollama.manager.vram': 'VRAM',
  'ollama.manager.context': 'Context length',
  'ollama.manager.expires': 'Expires',
  'ollama.manager.notRunning': 'This model is not currently loaded.',
  'ollama.manager.pullTitle': 'Install a model',
  'ollama.manager.pullHint':
    'Enter an Ollama model name. The configured endpoint is used as-is.',
  'ollama.manager.modelName': 'Model name',
  'ollama.manager.pullPlaceholder': 'llama3.2:latest',
  'ollama.manager.pull': 'Pull and install',
  'ollama.manager.pulling': 'Installing…',
  'ollama.manager.cancel': 'Cancel',
  'ollama.manager.receiving': 'Receiving model data…',
  'ollama.manager.copyTitle': 'Copy model',
  'ollama.manager.copyHint':
    'Create another local model name from the selected model.',
  'ollama.manager.copyDestination': 'Copy destination',
  'ollama.manager.copy': 'Copy',
  'ollama.manager.renameTitle': 'Rename model',
  'ollama.manager.renameHint':
    'Copy to the new name, then remove the original.',
  'ollama.manager.renameDestination': 'New model name',
  'ollama.manager.rename': 'Rename',
  'ollama.manager.load': 'Load / start',
  'ollama.manager.unload': 'Unload / stop',
  'ollama.manager.delete': 'Delete',
  'ollama.manager.deleteTitle': 'Delete model?',
  'ollama.manager.deleteConfirm': 'Delete model',
  'ollama.manager.invalidName': 'Enter a model name.',
  'ollama.manager.duplicateName': 'Choose a different model name.',
  'ollama.manager.operationError':
    'The model operation could not be completed.',
  'ollama.manager.refreshError':
    'Ollama could not be reached at this provider endpoint.',
  'ollama.manager.detailsError':
    'Extended details could not be loaded for this model.',
  'ollama.manager.configurationPartial':
    'The Ollama operation succeeded, but the configured model list could not be updated.',
  'ollama.manager.renamePartial':
    'The copy succeeded, but the original model could not be removed.',
  'ollama.manager.pullCancelled': 'Model installation canceled.',
  'ollama.manager.chatTitle': 'Chat',
  'ollama.manager.chatHint':
    'Send a prompt to a model on this endpoint and stream the reply.',
  'ollama.manager.chatModelLabel': 'Chat model',
  'ollama.manager.chatPlaceholder': 'Send a message…',
  'ollama.manager.chatSend': 'Send',
  'ollama.manager.chatStop': 'Stop',
  'ollama.manager.chatClear': 'Clear chat',
  'ollama.manager.chatStreaming': 'Generating a reply…',
  'ollama.manager.chatEmpty': 'Start a conversation with the selected model.',
  'ollama.manager.chatNoModel': 'Install a model to start chatting.',
  'ollama.manager.chatUnsupported': 'Chat is unavailable for this provider.',
  'ollama.manager.chatError': 'The chat request could not be completed.',
  'ollama.manager.chatYou': 'You',
  'ollama.manager.chatAssistant': 'Assistant',
  'ollama.manager.chatMessageLabel': 'Message',
  'ollama.manager.chatSystem': 'System',
  'ollama.manager.chatSessionsHeading': 'Chats',
  'ollama.manager.chatDefaultTitle': 'New chat',
  'ollama.manager.chatNew': 'New chat',
  'ollama.manager.chatRename': 'Rename',
  'ollama.manager.chatDelete': 'Delete',
  'ollama.manager.chatCancel': 'Cancel',
  'ollama.manager.chatConfirmDelete': 'Delete chat',
  'ollama.manager.chatSelectPrompt': 'Select a chat or start a new one.',
  'ollama.manager.chatLoading': 'Loading chats…',
  'ollama.manager.chatLoadError':
    'The local chat workspace could not be loaded.',
  'ollama.manager.chatCopy': 'Copy',
  'ollama.manager.chatAttachImage': 'Attach image',
  'ollama.manager.chatRemoveImage': 'Remove image',
  'ollama.manager.chatUnsupportedImage':
    'Choose a PNG, JPEG, GIF, or WebP image.',
  'ollama.manager.chatImageTooLarge': 'That image is too large to attach.',
  'ollama.manager.chatClearDraft': 'Clear draft',
  'ollama.manager.chatCustomize': 'Customize',
  'ollama.manager.chatHistory': 'History',
  'ollama.manager.chatAppearanceHeading': 'Chat appearance and fonts',
  'ollama.manager.chatAccentLabel': 'Accent',
  'ollama.manager.chatSurfaceLabel': 'Surface',
  'ollama.manager.chatSurfaceTonal': 'Tonal',
  'ollama.manager.chatSurfaceNeutral': 'Neutral',
  'ollama.manager.chatMessageFont': 'Message font',
  'ollama.manager.chatComposerFont': 'Composer font',
  'ollama.manager.chatSettingsHint':
    'These settings belong only to this chat and are committed to its local history.',
  'ollama.manager.chatHistoryTitle': 'Chat history',
  'ollama.manager.chatHistoryTimeline': 'Conversation Git history',
  'ollama.manager.chatHistoryDescription':
    'Every message and setting change is committed in this chat’s own local Git repository. Undo, redo, and restore create new commits.',
  'ollama.manager.chatHistorySearchLabel': 'Search chat history',
  'ollama.manager.chatHistorySearchPlaceholder':
    'Search messages, hashes, or dates',
  'ollama.manager.chatHistorySearchStatus': 'Search the loaded timeline',
  'ollama.manager.chatHistoryMatchingCount':
    '{visible} of {loaded} loaded commits match',
  'ollama.manager.chatHistoryUndo': 'Undo',
  'ollama.manager.chatHistoryRedo': 'Redo',
  'ollama.manager.chatHistoryCommitSingular': '1 commit',
  'ollama.manager.chatHistoryCommitCount': '{count} commits',
  'ollama.manager.chatHistoryLoadingFiles': 'Loading files…',
  'ollama.manager.chatHistorySelectToInspect': 'Select to inspect',
  'ollama.manager.chatHistoryNoFiles': 'No files',
  'ollama.manager.chatHistoryRestoreLabel': 'Restore {summary}',
  'ollama.manager.chatHistoryRestoreTooltip': 'Restore to this point',
  'ollama.manager.chatHistoryRestoreConfirmation':
    'Restore this point? This creates a new commit.',
  'ollama.manager.chatHistoryRestore': 'Restore',
  'ollama.manager.chatHistoryLoading': 'Loading history…',
  'ollama.manager.chatHistoryNoHistoryTitle': 'No chat history yet',
  'ollama.manager.chatHistoryNoHistoryDescription':
    'The first committed chat change will appear here.',
  'ollama.manager.chatHistoryNoMatchesTitle': 'No matching chat history',
  'ollama.manager.chatHistoryNoMatchesDescription': 'Try another search term.',
  'ollama.manager.chatHistoryLoadingMore': 'Loading…',
  'ollama.manager.chatHistoryLoadMore': 'Load more',
  'ollama.manager.chatHistoryLoadingDiff': 'Loading diff…',
  'ollama.manager.chatHistoryNoTextChanges':
    'No textual changes for this selection.',
  'ollama.manager.chatHistoryDiffTruncated':
    'Showing the first {shown} lines; {hidden} more were truncated for safety.',
  'ollama.manager.chatHistoryDiffLabel': 'Chat history change diff',
  'ollama.manager.chatHistorySelectCommit':
    'Select a commit to inspect its changes.',
  'ollama.manager.chatHistoryRetry': 'Retry',
  'ollama.manager.chatHistoryCloseLabel': 'Close chat history',
  'ollama.manager.chatHistoryCommitsLabel': 'Chat history commits',
  'ollama.manager.chatHistoryDetailsLabel': 'Chat history details',
  'ollama.manager.chatHistoryChangeCreate': 'Create chat',
  'ollama.manager.chatHistoryChangeMessage': 'Add chat message',
  'ollama.manager.chatHistoryChangeTurn': 'Add chat turn',
  'ollama.manager.chatHistoryChangeRename': 'Rename chat',
  'ollama.manager.chatHistoryChangeModel': 'Change chat model',
  'ollama.manager.chatHistoryChangeAppearance': 'Update chat appearance',
  'ollama.manager.chatHistoryChangeFont': 'Update chat font',
  'ollama.manager.chatHistoryChangeRecover': 'Recover chat session',
  'ollama.manager.chatHistoryChangeUndo': 'Undo: {change}',
  'ollama.manager.chatHistoryChangeRedo': 'Redo: {change}',
  'ollama.manager.chatHistoryChangeRestorePoint': 'Restore chat to {point}',
  'ollama.manager.chatHistoryError':
    'The chat history operation could not be completed.',
  'ollama.manager.chatDeletePrompt':
    'Delete “{title}” and its complete local history?',
  'ollama.manager.chatMessageCount': '{count} messages',
  'ollama.manager.chatImageAlt': 'Attached image {index}',
  'ollama.manager.chatImageLimit': 'You can attach up to {count} images.',
  'ollama.manager.unknown': 'Unknown',
  'ollama.manager.never': 'Never',
  'ollama.manager.showing': 'Showing {visible} of {total} models',
  'ollama.manager.selectedModel': 'Select {name}',
  'ollama.manager.moreCapabilities': '+{count} more',
  'ollama.manager.pullProgress': '{percent}% complete',
  'ollama.manager.pullSucceeded': 'Installed {name}.',
  'ollama.manager.copySucceeded': 'Copied {source} to {destination}.',
  'ollama.manager.renameSucceeded': 'Renamed {source} to {destination}.',
  'ollama.manager.loadSucceeded': 'Loaded {name}.',
  'ollama.manager.unloadSucceeded': 'Unloaded {name}.',
  'ollama.manager.deleteSucceeded': 'Deleted {name}.',
  'ollama.manager.confirmDelete':
    'Delete {name} from this Ollama endpoint? This cannot be undone.',
  'subtree.title': 'Subtrees',
  'color.blue': 'Blue',
  'color.violet': 'Violet',
  'color.teal': 'Teal',
  'color.green': 'Green',
  'color.amber': 'Amber',
  'color.rose': 'Rose',
  'settings.dialogTitle': 'Settings',
  'settings.closeAction': 'Close',
  'settings.notificationsEnableTitle': 'Enable notifications',
  'settings.notificationsEnableDescription':
    'Allows the display of notifications when high-signal events take place in the current repository.',
  'settings.automationAutoCommitPushTitle': 'Automatically commit and push',
  'settings.automationAutoCommitPushDescription':
    'Copilot writes the commit message; skipped while you have a draft message or an operation in flight.',
  'settings.automationAutoPullTitle': 'Automatically pull',
  'settings.automationAutoPullDescription':
    'Pulls when the working tree is clean and an upstream is set.',
  'settings.automationIntervalEvery': 'Every',
  'settings.automationIntervalMinutes': '{minutes} min',
  'settings.automationIntervalGroupLabel': '{title} interval',
  'settings.globalTabsLabel': 'Settings pages',
  'settings.accountsTab': 'Accounts',
  'settings.integrationsTab': 'Integrations',
  'settings.copilotTab': 'Copilot',
  'settings.gitTab': 'Git',
  'settings.appearanceTab': 'Appearance',
  'settings.notificationsTab': 'Notifications',
  'settings.promptsTab': 'Prompts',
  'settings.advancedTab': 'Advanced',
  'settings.accessibilityTab': 'Accessibility',
  'settings.agentAccessTab': 'Agent access',
  'settings.selfHostedServerTab': 'Self-hosted server',
  'settings.automationTab': 'Automation',
  'settings.aiTab': 'AI',
  'settings.attentionTab': 'Attention accommodations',
  'settings.browserTabSearch': 'Search {surface}',
  'settings.browserTabOpenNew': 'Open a {surface} page in a new tab',
  'settings.browserTabAllOpen': 'All {surface} pages are already open',
  'settings.browserTabMore': '{count} more {surface} pages',
  'settings.browserTabClose': 'Close {page} tab',
  'settings.browserTabPin': 'Pin {page} tab',
  'settings.browserTabUnpin': 'Unpin {page} tab',
  'settings.browserTabPickerTitle': 'Choose a {surface} page',
  'settings.browserTabNoMatches': 'No {surface} page matches that.',
  'settings.queueTab': 'Clone queue',
  'settings.queueHeading': 'Clone queue',
  'settings.queueDescription':
    'Configure how each signed-in account watches for and clones newly discovered repositories.',
  'settings.queueNoAccounts':
    'Sign in to a hosted account to configure its clone queue.',
  'settings.queueAutoCloneTitle': 'Automatically clone new repositories',
  'settings.queueAutoCloneDescription':
    'Checks in the background after Settings closes and clones only repositories discovered after the baseline is saved.',
  'settings.queueBaseDirectory': 'Base directory',
  'settings.queueChooseDirectory': 'Choose folder',
  'settings.queueDirectoryPlaceholder': 'Choose a base directory',
  'settings.queueMode': 'Clone mode',
  'settings.queueModeParallel': 'Parallel — up to 3 at once',
  'settings.queueModeSequential': 'Sequential — one at a time',
  'settings.queueEnabledStatus': 'On · checks every 5 minutes',
  'settings.queueDisabledStatus': 'Off',
  'settings.queueDirectoryRequired':
    'Choose a base directory before turning on this queue.',
  'settings.queueSafetyNote':
    'Each batch is bounded to 500 repositories, existing folders are reviewed safely, and background queues never open an unsolicited progress dialog.',
  'settings.soundTab': 'Sound',
  'settings.ollamaTab': 'Ollama',
  'settings.soundHeading': 'Sound',
  'settings.soundDescription':
    'An optional audio system: a spoken narrator, sound effects for common actions, and quiet per-repository music. Everything is off by default.',
  'settings.soundMasterEnableTitle': 'Enable sound',
  'settings.soundMasterEnableDescription':
    'Master switch for the whole audio system. When off, nothing ever plays.',
  'settings.soundSfxHeading': 'Sound effects',
  'settings.soundSfxEnableTitle': 'Play sound effects',
  'settings.soundSfxEnableDescription':
    'Short synthesized cues for commit, push, pull, success, and errors.',
  'settings.soundSfxVolumeLabel': 'Effect volume',
  'settings.soundPreviewCue': 'Preview effect',
  'settings.soundTtsHeading': 'Spoken narrator',
  'settings.soundTtsEnableTitle': 'Speak selected events',
  'settings.soundTtsEnableDescription':
    'Narrates meaningful events in English or Cantonese, rate-limited so it never chatters. Suppressed when a screen reader would already announce the same thing.',
  'settings.soundTtsVolumeLabel': 'Narrator volume',
  'settings.soundTtsCooldownLabel': 'Minimum gap between lines',
  'settings.soundRecordedNarrationTitle': 'Use recorded narration',
  'settings.soundRecordedNarrationDescription':
    'Play the pre-recorded voice lines and their melodies that ship with the app instead of live speech synthesis. Falls back to live narration automatically when a clip is unavailable.',
  'settings.soundPreviewNarration': 'Preview narration',
  'settings.soundFunnyHeading': 'Narrator tone',
  'settings.soundFunnyEnglishLabel': 'English playfulness',
  'settings.soundFunnyCantoneseLabel': 'Cantonese playfulness',
  'settings.soundFunnyHint':
    'Set English and Cantonese playfulness in Appearance. Errors always stay clear.',
  'settings.soundMusicHeading': 'Per-repository music',
  'settings.soundMusicEnableTitle': 'Play themed music',
  'settings.soundMusicEnableDescription':
    'Loops a track you choose for the current repository, quietly. Pausable any time.',
  'settings.soundMusicVolumeLabel': 'Music volume',
  'settings.soundMusicRepoLabel': 'Track for {repository}',
  'settings.soundMusicChoose': 'Choose track',
  'settings.soundMusicClear': 'Clear',
  'settings.soundMusicNoRepo': 'Open a repository to choose its music.',
  'settings.soundMusicNoTrack': 'No track chosen.',
  'settings.soundThemeSubheading': 'Repository theme',
  'settings.soundThemeExplanation':
    'Every repository gets its own looping theme, synthesized from its name — no files to download.',
  'settings.soundThemeCurrentLabel': 'Theme for {repository}',
  'settings.soundThemeStateTheme': 'Playing this repository’s generated theme.',
  'settings.soundThemeStateCustom':
    'Playing your chosen track instead of the theme.',
  'settings.soundThemeStateOff': 'Music is muted for this repository.',
  'settings.soundThemeUseTheme': 'Use generated theme',
  'settings.soundThemeMute': 'Mute here',
  'settings.soundThemePreview': 'Preview theme',
  'settings.repoThemeNameFormat': '{mood} {texture} in {root} {scale}',
  'settings.repoThemeMoodCalm': 'Calm',
  'settings.repoThemeMoodBright': 'Bright',
  'settings.repoThemeMoodDriving': 'Driving',
  'settings.repoThemeMoodDreamy': 'Dreamy',
  'settings.repoThemeMoodMellow': 'Mellow',
  'settings.repoThemeMoodPlayful': 'Playful',
  'settings.repoThemeMoodSolemn': 'Solemn',
  'settings.repoThemeMoodElectric': 'Electric',
  'settings.repoThemeTexturePulse': 'Pulse',
  'settings.repoThemeTextureCascade': 'Cascade',
  'settings.repoThemeTextureDrift': 'Drift',
  'settings.repoThemeTextureBloom': 'Bloom',
  'settings.repoThemeTextureCircuit': 'Circuit',
  'settings.repoThemeTextureHorizon': 'Horizon',
  'settings.repoThemeTextureLantern': 'Lantern',
  'settings.repoThemeTextureTide': 'Tide',
  'settings.repoThemeScaleMajor': 'major',
  'settings.repoThemeScaleMinor': 'minor',
  'settings.repoThemeScaleDorian': 'Dorian',
  'settings.repoThemeScaleMixolydian': 'Mixolydian',
  'settings.repoThemeScaleLydian': 'Lydian',
  'settings.repoThemeScalePentatonic': 'pentatonic',
  'settings.soundQuietHoursHeading': 'Quiet hours',
  'settings.soundQuietHoursEnableTitle': 'Mute during quiet hours',
  'settings.soundQuietHoursEnableDescription':
    'Silences effects, narration, and music in the window below. Errors are still spoken so nothing important is missed.',
  'settings.soundQuietHoursStartLabel': 'From (hour)',
  'settings.soundQuietHoursEndLabel': 'To (hour)',
  'settings.soundReducedMotionTitle': 'Follow reduced-motion for sound',
  'settings.soundReducedMotionDescription':
    'When the system asks for reduced motion, also mute non-essential sound and music.',
  'settings.soundSfxAuditionHeading': 'Audition each cue',
  'settings.soundSfxAuditionHint':
    'Every app event has its own recognizable cue, grouped by family. Push, fetch and pull are distinct, and each build-and-run phase has its own sound.',
  'settings.soundCuePlayLabel': 'Play the {cue} cue',
  'settings.soundFamilySuccess': 'Success',
  'settings.soundFamilyProgress': 'Progress',
  'settings.soundFamilyWarning': 'Warning',
  'settings.soundFamilyError': 'Error',
  'settings.soundFamilyNeutral': 'Neutral',
  'settings.soundCueCommit': 'Commit',
  'settings.soundCuePush': 'Push',
  'settings.soundCuePull': 'Pull',
  'settings.soundCueFetch': 'Fetch',
  'settings.soundCueDetecting': 'Detecting',
  'settings.soundCueInstalling': 'Installing',
  'settings.soundCueBuilding': 'Building',
  'settings.soundCueRunning': 'Running',
  'settings.soundCueSucceeded': 'Succeeded',
  'settings.soundCueFailed': 'Failed',
  'settings.soundCueCancelled': 'Cancelled',
  'settings.soundCueSuccess': 'Success',
  'settings.soundCueError': 'Error',
  'settings.soundCueInfo': 'Info',
  'settings.mobileConnectionHeading': 'Mobile connection',
  'settings.mobileConnectionDescription':
    'Opens a fresh one-time pairing link in your default browser. Its secret stays in the URL fragment and is replaced the next time you open one.',
  'settings.mobileConnectionOpen': 'Open mobile connection page',
  'settings.mobileConnectionChoosePairedMode':
    'Choose Paired LAN devices above to connect the mobile site securely.',
  'settings.mobileConnectionStartServer':
    'Turn on the agent server to create a one-time mobile connection.',
  'settings.mobileConnectionOpenFailed':
    'Desktop Material could not open the mobile connection page.',
  'settings.advancedUsageStatsTitle': 'Usage stats',
  'settings.advancedUsageStatsDescription':
    'Submit anonymized usage data to help improve Desktop Material.',
  'settings.advancedCredentialStorageTitle': 'Credential storage',
  'settings.advancedCredentialStorageDescription':
    'Tokens are kept in the operating-system credential store and are never written to repository configuration.',
  'settings.browserOpenModeTitle': 'Open web links',
  'settings.browserOpenModeDescription':
    'Use your system browser by default. This is recommended when the in-app browser is blank; choose Inside Desktop Material only when you intentionally want the app-hosted browser.',
  'settings.browserOpenModeInternal': 'Inside Desktop Material',
  'settings.browserOpenModeExternal':
    'In the system browser (default and recommended)',
  'browser.error.externalOpenFailedTitle': 'System browser did not open',
  'browser.error.externalOpenFailed':
    'Desktop Material could not open this web link in the system browser. Nothing else was opened. Check your default browser and retry, or deliberately choose Inside Desktop Material under Settings → Advanced.',
  'browser.title': 'Desktop Material browser',
  // The page is drawn by a separate native view with its own accessibility
  // tree, so this element is deliberately empty. Said out loud rather than
  // leaving a screen-reader user at a blank panel with no explanation.
  'browser.contentRegionNote':
    'The page is shown by the browser view itself. Move focus into the page to read it.',
  'browser.tabs': 'Browser tabs',
  'browser.newTab': 'New tab',
  'browser.closeTab': 'Close tab',
  'browser.closeNamedTab': 'Close tab: {title}',
  'browser.closeAuthenticationTab': 'Close authentication tab: {title}',
  'browser.authentication': 'Authentication tab',
  'browser.authChip': 'SIGN IN',
  'browser.back': 'Back',
  'browser.forward': 'Forward',
  'browser.stop': 'Stop loading',
  'browser.refresh': 'Refresh',
  'browser.addressLabel': 'Web address',
  'browser.addressPlaceholder': 'Enter a web address',
  'browser.go': 'Go',
  'browser.removeBookmark': 'Remove bookmark',
  'browser.addBookmark': 'Add bookmark',
  'browser.openExternal': 'Open externally',
  'browser.bookmarks': 'Bookmarks',
  'browser.authNoticeTitle': 'Private sign-in session.',
  'browser.authNoticeBody':
    'This tab shares an in-memory session only with sign-in popups. Its address and data are cleared when sign-in closes, and it cannot be bookmarked.',
  'browser.openAuthExternal': 'Continue in system browser',
  'browser.findOpen': 'Find in page (Ctrl+F)',
  'browser.findLabel': 'Find in page',
  'browser.findQueryLabel': 'Find text or pattern',
  'browser.findPlaceholder': 'Find in page…',
  'browser.findMode': 'Toggle plain-text or regex mode',
  'browser.findBuilder': 'Regex builder',
  'browser.findCaseSensitive': 'Match case',
  'browser.findPrevious': 'Find previous',
  'browser.findNext': 'Find next',
  'browser.findClose': 'Close find bar',
  'browser.findTarget': 'this page',
  'browser.findSearching': 'Searching…',
  'browser.findNoMatches': 'No matches',
  'browser.findCount': '{active} of {total}',
  'browser.findTruncated': 'page text capped',
  'browser.findResults': 'Regex matches',
  'browser.findMatch': 'Go to match {number}',
  'browser.error.invalidAddress': 'Enter a valid HTTP or HTTPS web address.',
  'browser.error.loadFailed': 'This page could not be loaded.',
  'browser.error.certificate':
    'This page was blocked because its certificate could not be verified.',
  'browser.error.downloadBlocked':
    'The in-app browser does not save downloads. Open this page externally to download.',
  'browser.error.rendererGone':
    'This page stopped unexpectedly. Refresh it or open it externally.',
  'browser.error.tooManyTabs':
    'The in-app browser is limited to 20 tabs. Close a tab before opening another.',
  'settings.integrationsExternalEditorTitle': 'External editor',
  'settings.integrationsExternalEditorSubtitle':
    'Used when opening files or repositories in your editor',
  'settings.integrationsShellTitle': 'Shell',
  'settings.integrationsShellSubtitle':
    'Used when opening a repository in the command line',
  'settings.integrationsChooseEditor': 'Choose external editor',
  'settings.integrationsChooseShell': 'Choose shell',
  'settings.integrationsCustomEditorChoice': 'Configure custom editor…',
  'settings.integrationsCustomShellChoice': 'Configure custom shell…',
  'settings.integrationsCustomEditorLabel': 'Custom editor',
  'settings.integrationsCustomShellLabel': 'Custom shell',
  'settings.integrationsSelectEditor': 'Select editor',
  'settings.tabsDockPosition': 'Settings tab position',
  'settings.tabsDockDescription':
    'Choose where this tab strip sits. Preferences and Repository Settings save their positions separately; missing or invalid values use Left.',
  'settings.tabsDockLeft': 'Left',
  'settings.tabsDockTop': 'Top',
  'settings.tabsDockBottom': 'Bottom',
  'settings.tabsDockRight': 'Right',
  'settings.contextMenuHeading': 'Windows context menu',
  'settings.contextMenuDescription':
    'Add Desktop Material actions to the right-click menu for folders and folder backgrounds in File Explorer.',
  'settings.contextMenuPlacementNote':
    'Windows 11 hides these classic entries behind “Show more options” (or press Shift+F10 to open the classic menu directly). Placing them in the top-level Windows 11 menu needs a packaged shell extension, which this build does not install.',
  'settings.contextMenuOpencodeLabel': 'Open with OpenCode here',
  'settings.contextMenuOpencodeDescription':
    'Opens a terminal in the folder running the opencode CLI.',
  'settings.contextMenuDesktopMaterialLabel': 'Open in Desktop Material',
  'settings.contextMenuDesktopMaterialDescription':
    'Opens the folder as a repository, adding it if it is not already in your list.',
  'settings.contextMenuOpencodeMissing':
    'opencode was not found on this computer, so this entry cannot be added.',
  'settings.contextMenuAppPathUnknown':
    'The application path could not be determined, so entries cannot be added.',
  'settings.contextMenuNeedsRepair':
    'This entry exists but does not match this install. Turn it off and on again to repair it.',
  'settings.contextMenuBusy': 'Updating the context menu…',
  'settings.contextMenuStateError':
    'Unable to read the current context menu state.',
  'settings.contextMenuApplyError': 'Unable to update the context menu.',
  'settings.contextMenuModernLabel': 'Show in the main Windows 11 menu',
  'settings.contextMenuModernDescription':
    'Registers a packaged shell extension so the actions appear at the top level of the right-click menu instead of under “Show more options”.',
  'settings.contextMenuModeModern':
    'Active: actions appear in the main right-click menu.',
  'settings.contextMenuModeClassic':
    'Active: actions appear under “Show more options”.',
  'settings.contextMenuModeNone': 'No context menu actions are installed.',
  'settings.contextMenuNeedsWindows11':
    'The main-menu placement needs Windows 11.',
  'settings.contextMenuPackageMissing':
    'This build does not include the packaged shell extension.',
  'settings.contextMenuNeedsDeveloperMode':
    'The main-menu placement needs sideloading enabled in Windows Settings → System → For developers. Desktop Material will not change that setting for you.',
  'settings.contextMenuRegistrationStale':
    'The registration still points at a folder from an earlier version, so Windows is no longer showing these actions. Turn this on again to re-register it against the current install.',
  'quickAction.loading': 'Reading the folder…',
  'quickAction.notARepository': 'This folder is not a Git repository.',
  'quickAction.noChanges': 'No changes to commit.',
  'quickAction.needSummary': 'Enter a summary to commit.',
  'quickAction.detachedHead':
    'This repository is not on a branch. Open it in the full app to continue.',
  'quickAction.busy': 'Working…',
  'quickAction.changeCount': '{count} changed file(s) ready to commit.',
  'quickAction.summaryLabel': 'Summary',
  'quickAction.summaryPlaceholder': 'Describe your changes',
  'quickAction.commitAndPush': 'Commit & push',
  'quickAction.openInFullApp': 'Open in full app',
  'quickAction.pushed': 'Committed {sha} and pushed.',
  'quickAction.genericError': 'Something went wrong.',
  'push.ghCliFallbackSuccessTitle': 'Pushed using GitHub CLI credentials',
  'push.ghCliFallbackSuccessBody':
    'The push to {remote} was rejected, so Desktop Material retried it with your GitHub CLI login and it succeeded.',
  'clone.visibilityPublic': 'Public',
  'clone.visibilityPrivate': 'Private',
  'clone.visibilityAll': 'All',
  'clone.visibilityForked': 'Forked',
  'clone.noDescription': 'No description provided',
  'clone.starsLabel': '{count} stars',
  'clone.forksLabel': '{count} forks',
  'clone.sizeLabel': 'Repository size {size}',
  'clone.defaultBranchLabel': 'Default branch {branch}',
  'clone.updatedLabel': 'Updated {time}',
  'clone.languageLabel': 'Language: {language}',
  'clone.languageFilterLabel': 'Language',
  'clone.languageFilterAria': 'Filter repositories by language',
  'clone.visibilityFilterAria': 'Filter repositories by visibility',
  'clone.visibilityFilterLabel': 'Visibility',
  'clone.filters.button': 'Repository filters',
  'clone.filters.buttonActive': 'Repository filters · {count}',
  'clone.filters.activeCount': '{count} active',
  'clone.filters.metadataAria': 'Repository metadata filters',
  'clone.cheapLfs.badgeTitle': 'Cheap LFS files',
  'clone.cheapLfs.badgeAriaOne':
    'Choose whether to download the 1 Cheap LFS file when cloning {repository}',
  'clone.cheapLfs.badgeAriaMany':
    'Choose which of the {count} Cheap LFS files to download when cloning {repository}',
  'clone.cheapLfs.selectorTitle': 'Choose Cheap LFS files',
  'clone.cheapLfs.selectorSummaryOne':
    'Choose whether to download the Cheap LFS file in {repository}. Everything is selected by default.',
  'clone.cheapLfs.selectorSummaryMany':
    'Choose which {count} Cheap LFS files to download in {repository}. Everything is selected by default.',
  'clone.cheapLfs.selectorSearchPlaceholder': 'Search large-file paths',
  'clone.cheapLfs.selectorSearchAria': 'Search Cheap LFS files',
  'clone.cheapLfs.selectorRegexTarget': 'Cheap LFS asset paths',
  'clone.cheapLfs.selectorSelectedCount': '{selected} of {count} selected',
  'clone.cheapLfs.selectorSelectAll': 'Select all',
  'clone.cheapLfs.selectorSelectNone': 'Select none',
  'clone.cheapLfs.selectorNoMatches': 'No Cheap LFS files match this search.',
  'clone.cheapLfs.selectorTreeAria': 'Cheap LFS files',
  'clone.cheapLfs.selectorIncludeOne': 'Include {count} file',
  'clone.cheapLfs.selectorIncludeMany': 'Include {count} files',
  'clone.cheapLfs.selectorFileAria': 'Include {path} in the Cheap LFS download',
  'clone.cheapLfs.selectorFolderAria':
    '{selected} of {count} files selected in {path}',
  'clone.cheapLfs.selectorCollapse': 'Collapse {path}',
  'clone.cheapLfs.selectorExpand': 'Expand {path}',
  'clone.orgScopeMissing':
    "We couldn't see any organizations. This sign-in may be missing organization access.",
  'clone.orgReconnect': 'Reconnect to load organizations',
  'clone.orgRestrictionNote':
    'Organizations that restrict third-party access must approve this app before they appear here.',
  'clone.orgReviewAccess': 'Review OAuth app access',
  'commandPalette.title': 'Command palette',
  'commandPalette.searchPlaceholder': 'Search commands',
  'commandPalette.searchLabel': 'Search command palette',
  'commandPalette.commands': 'Commands',
  'commandPalette.noMatches': 'No matching commands',
  'commandPalette.searchTerms': 'Search terms: {terms}',
  'commandPalette.customizeAppearance': 'Customize command palette appearance',
  'commandPalette.appearanceDialog': 'Command palette appearance settings',
  'commandPalette.appearanceHeading': 'Appearance',
  'commandPalette.randomPerRepository': 'Random per repository',
  'commandPalette.randomPerRepositoryDescription':
    'A stable look chosen for each repository',
  'commandPalette.paletteSize': 'Palette size',
  'commandPalette.sizeCompact': 'Small',
  'commandPalette.sizeCompactDescription':
    'A small card - the list only, no detail pane',
  'commandPalette.sizeMedium': 'Standard',
  'commandPalette.sizeMediumDescription':
    'A card floating over the app, with the detail pane',
  'commandPalette.sizeFull': 'Full screen',
  'commandPalette.sizeFullDescription': 'The palette covers the whole app',
  'repositorySettings.tabRemote': 'Remote',
  'repositorySettings.tabIgnoredFiles': 'Ignored files',
  'repositorySettings.tabGitConfig': 'Git config',
  'repositorySettings.tabBuildRun': 'Build and run',
  'repositorySettings.tabCheapLfs': 'Large files',
  'repositorySettings.tabSubmodules': 'Submodules',
  'repositorySettings.tabSubtrees': 'Subtrees',
  'repositorySettings.tabAutomation': 'Automation',
  'repositorySettings.tabMetadata': 'Metadata',
  'repositorySettings.tabAppearance': 'Appearance',
  'repositorySettings.tabAISecurity': 'AI features',
  'repositorySettings.tabForkSettings': 'Fork settings',
  'repositorySettings.tabsLabel': 'Repository settings pages',
  'repositorySettings.dialogTitle': 'Repository settings',
  'commandPalette.homeRepositorySettings': 'Repository settings ▸ {tab}',
  'palette.repositorySettingsRemote': 'Repository remotes',
  'palette.repositorySettingsIgnoredFiles': 'Ignored files',
  'palette.repositorySettingsGitConfig': 'Repository Git config',
  'palette.repositorySettingsBuildRun': 'Build and run settings',
  'palette.repositorySettingsCheapLfs': 'Large file settings',
  'palette.repositorySettingsSubmodules': 'Submodule settings',
  'palette.repositorySettingsSubtrees': 'Subtree settings',
  'palette.repositorySettingsAutomation': 'Repository automation overrides',
  'palette.repositorySettingsMetadata': 'Repository metadata',
  'palette.repositorySettingsAppearance': 'Repository appearance',
  'palette.repositorySettingsForkSettings': 'Fork behaviour',
  'palette.reportIssue': 'Report an issue',
  'palette.reportIssueDescription': 'Opens the issue tracker in your browser',
  'palette.contactSupport': 'Contact support',
  'palette.contactSupportDescription': 'Opens the support page in your browser',
  'palette.userGuides': 'Show the user guides',
  'palette.userGuidesDescription': 'Opens the documentation in your browser',
  'palette.keyboardShortcuts': 'Show keyboard shortcuts',
  'palette.keyboardShortcutsDescription':
    'Opens the keyboard shortcut reference in your browser',
  'palette.showLogsFolder': 'Show the logs folder',
  'palette.showLogsFolderDescription':
    'Reveals the folder holding this app\u2019s log files',
  'commandPalette.homeMenuBar': 'The application menu bar',
  'commandPalette.linkFailed': 'Could not open {url} in your browser',
  'palette.increaseActiveResizableWidth': 'Expand the active resizable pane',
  'palette.decreaseActiveResizableWidth': 'Contract the active resizable pane',
  'palette.setThemeMode.light': 'Light',
  'palette.setThemeMode.dark': 'Dark',
  'palette.setThemeMode.system': 'Match the system',
  'palette.setThemeMode': 'Theme',
  'palette.setUiScale': 'Interface scale',
  'palette.setAutoFitZoom': 'Shrink the interface to fit small windows',
  'palette.setShowRecentRepositories': 'Show recent repositories',
  'palette.setBranchNameInRepoList.always': 'Always',
  'palette.setBranchNameInRepoList.notDefault':
    'Only when not the default branch',
  'palette.setBranchNameInRepoList.never': 'Never',
  'palette.setBranchNameInRepoList':
    'Show the branch name in the repository list',
  'palette.setBranchSort.lastModified': 'By when they were last changed',
  'palette.setBranchSort.alphabetical': 'Alphabetically',
  'palette.setBranchSort': 'Sort branches',
  'palette.setDateFormat': 'Date format',
  'palette.setTimeFormat': 'Time format',
  'palette.setNumberFormat': 'Number format',
  'palette.setPreferAbsoluteDates': 'Prefer absolute dates over relative',
  'palette.setAutoSwitchAccount':
    'Switch the active account to the repository owner',
  'palette.setRepositoryIndicators': 'Show status icons in the repository list',
  'palette.setUsageStats': 'Submit usage stats',
  'palette.setVerboseLogging': 'Verbose logging (debug level)',
  'palette.setLargeRepoAutoDetect': 'Detect large repositories automatically',
  'palette.setLargeRepoAutoRepack': 'Repack large repositories when idle',
  'palette.setBrowserOpenMode.internal': 'In a window inside the app',
  'palette.setBrowserOpenMode.external': 'In your usual browser',
  'palette.setBrowserOpenMode': 'Open web links',
  'palette.setConfirmDiscardPermanently':
    'Confirm before permanently discarding changes',
  'palette.setConfirmDiscardStash': 'Confirm before discarding a stash',
  'palette.setConfirmCheckoutCommit': 'Confirm before checking out a commit',
  'palette.setConfirmUndoCommit': 'Confirm before undoing a commit',
  'palette.setConfirmCommitMessageOverride':
    'Confirm before overwriting the commit message with a generated one',
  'palette.setConfirmWorktreeRemoval': 'Confirm before removing a worktree',
  'palette.setConfirmCommitFilteredChanges':
    'Confirm before committing changes hidden by the filter',
  'palette.setUncommittedChangesStrategy.askForConfirmation': 'Ask each time',
  'palette.setUncommittedChangesStrategy.moveToNewBranch':
    'Bring them to the new branch',
  'palette.setUncommittedChangesStrategy.stashOnCurrentBranch':
    'Stash them on this branch',
  'palette.setUncommittedChangesStrategy':
    'When switching branches with uncommitted changes',
  'palette.setDiffCheckMarks': 'Show check marks in the diff',
  'palette.setErrorPresentation.notice': 'As a notification',
  'palette.setErrorPresentation.dialog': 'As a dialog',
  'palette.setErrorPresentation': 'Application error presentation',
  'palette.entryGitAuthorName': 'Git author name',
  'palette.entryGitAuthorEmail': 'Git author email',
  'palette.setShowCommitIdentity':
    'Show the effective identity above the commit message',
  'palette.entryDefaultBranchName': 'Default branch name for new repositories',
  'palette.setGitHookEnv': 'Load Git hook environment variables from the shell',
  'palette.setGitHookEnvShell': 'Shell used to load the hook environment',
  'palette.setGitHookEnvCache': 'Cache Git hook environment variables',
  'palette.globalIgnore': 'Global ignore rules',
  'palette.setExternalEditor': 'External editor',
  'palette.setShell': 'Shell',
  'palette.setContextMenuOpencode':
    'Explorer context menu: Open with OpenCode here',
  'palette.setContextMenuDesktopMaterial':
    'Explorer context menu: Open in Desktop Material',
  'palette.setContextMenuModern': 'Show in the main Windows 11 menu',
  'palette.branchPresetScript': 'Branch name preset script',
  'palette.customIntegrations': 'Custom editor and shell commands',
  'palette.setAgentServerEnabled': 'Agent server',
  'palette.agentAccessMode': 'Agent access mode',
  'palette.agentPairing': 'Pair a mobile device',
  'palette.agentToken': 'Desktop bearer token',
  'palette.setAutoCommitPush': 'Automatically commit and push',
  'palette.setAutoCommitPushInterval': 'Commit and push interval',
  'palette.setAutoPull': 'Automatically pull',
  'palette.setAutoPullInterval': 'Pull interval',
  'palette.automationAccountOverrides': 'Automation overrides (per account)',
  'palette.queueCloneSettings': 'Clone queue settings (per account)',
  'palette.setSoundEnabled': 'Sound',
  'palette.setSoundEffects': 'Play sound effects',
  'palette.setSoundEffectVolume': 'Effect volume',
  'palette.setSoundNarrator': 'Spoken narrator',
  'palette.setSoundRecordedNarration': 'Use recorded narration',
  'palette.setSoundNarratorVolume': 'Narrator volume',
  'palette.setSoundNarratorVoice': 'Narrator voice',
  'settings.soundNarratorVoiceTitle': 'Narrator voice',
  'settings.soundNarratorVoiceDescription':
    'Choose which installed voice reads English and which reads Cantonese, or let the app pick the closest match.',
  'settings.soundNarratorEnglishVoiceLabel': 'English narrator voice',
  'settings.soundNarratorCantoneseVoiceLabel': 'Cantonese narrator voice',
  'settings.soundNarratorChooseAutomatically': 'Choose automatically',
  'settings.soundNarratorNetworkVoiceOption': 'network voice',
  'settings.soundNarratorVoiceMissingOption':
    '{uri} — not installed on this computer',
  'settings.soundNarratorVoiceAutomaticStatus':
    'Chosen automatically: the closest match this computer has for the language being spoken.',
  'settings.soundNarratorVoiceInstalledStatus':
    '{voice} ({lang}), installed on this computer.',
  'settings.soundNarratorVoiceNetworkStatus':
    '{voice} ({lang}). This voice is provided over the network and will not speak while you are offline.',
  'settings.soundNarratorVoiceMissingStatus':
    'The voice this was set to ({uri}) is not installed on this computer, so the narrator is falling back to the closest match. Your choice has been kept in case the voice comes back.',
  'settings.soundNarratorVoiceNoneStatus':
    'This computer has no voice installed that can read this language. The narrator will stay silent for it until one is added.',
  'settings.soundNarratorRateLabel': 'Speaking rate',
  'settings.soundNarratorPitchLabel': 'Voice pitch',
  'settings.personalVocabularyTitle': 'Personal vocabulary file',
  'settings.personalVocabularyDescription':
    'Load a local JSON file that renames the words this app shows you. Nothing is uploaded.',
  'palette.setPersonalVocabulary': 'Personal vocabulary file',
  'palette.setSoundNarratorCooldown': 'Minimum gap between narrated lines',
  'palette.setSoundMusic': 'Play themed music',
  'palette.setSoundMusicVolume': 'Music volume',
  'palette.setSoundQuietHours': 'Mute during quiet hours',
  'palette.setSoundQuietHoursStart': 'Quiet hours start',
  'palette.setSoundQuietHoursEnd': 'Quiet hours end',
  'palette.setSoundReducedMotion': 'Follow reduced motion for sound',
  'palette.repositoryMusicTrack': 'Music track for this repository',
  'palette.auditionSoundCues': 'Audition the sound cues',
  'palette.copilotCommitModel': 'Copilot commit-message model',
  'palette.copilotConflictModel': 'Copilot conflict-resolution model',
  'palette.setCopilotAlwaysResolveConflicts':
    'Always use Copilot when conflicts are detected',
  'palette.addAiProvider': 'Add an AI provider (BYOK)',
  'palette.entryOllamaEndpoint': 'Ollama endpoint',
  'palette.sshWorkingCopy': 'SSH working copy',
  'palette.setBuildAutoInstall': 'Auto-install missing build tools',
  'palette.setBuildPreElevate': 'Pre-elevate the build chain',
  'palette.setBuildRunAfterBuild': 'Run after a successful build',
  'palette.setBuildAutoIgnoreOutputs': 'Auto-ignore build outputs',
  'palette.setBuildAfterPull': 'Build after pulling new commits',
  'palette.setBuildOfferAgents': 'Offer Codex/OpenCode to fix build errors',
  'palette.setBuildFixProvider.codex': 'Codex',
  'palette.setBuildFixProvider.opencode': 'OpenCode',
  'palette.setBuildFixProvider': 'Preferred build-fix provider',
  'palette.setBuildFixAutoApprove':
    'Auto-approve the build-fix agent in this repository',
  'palette.setCheapLfsAutoMaterialize': 'Download large files after cloning',
  'palette.setCheapLfsAutoPin': 'Pin large files when committing',
  'palette.setCheapLfsCloneHelper': 'Include the clone helper script',
  'palette.setCheapLfsParallelUploads': 'Simultaneous Cheap LFS uploads',
  'palette.setCheapLfsStorageProvider.release': 'GitHub releases',
  'palette.setCheapLfsStorageProvider.ghcr': 'GitHub container registry',
  'palette.setCheapLfsStorageProvider.dockerhub': 'Docker Hub',
  'palette.setCheapLfsStorageProvider': 'Large-file storage provider',
  'palette.setCheapLfsCloudCompression':
    'Cloud compression for this private repository',
  'palette.cheapLfsEncryption': 'Encrypt new Release payloads with a password',
  'palette.setSigningCommits': 'Sign commits by default',
  'palette.setSigningTags': 'Sign annotated tags by default',
  'palette.signingPolicy': 'Manage the signing policy',
  'palette.setDiffAutoExpandContext': 'Automatically expand whole-file context',
  'palette.setDiffContextStep': 'Context expansion step',
  'palette.appearance': 'Customize the command palette',
  'palette.setPaletteDensity': 'Command palette row density',
  'palette.setPaletteRandomPerRepository':
    "Randomize the palette's look per repository",
  'palette.setPaletteShowIcons': 'Show icons in palette rows',
  'palette.setPaletteShowGroupChips': 'Show group chips in palette rows',
  'palette.setPaletteShowKeywords': 'Show the keyword line in palette rows',
  'palette.newTabGroup': 'New tab group',
  'palette.editTabGroup': 'Edit the current tab group',
  'palette.closeTabsContaining': 'Close tabs containing text',
  'palette.closeTabsNotContaining': 'Close tabs not containing text',
  'palette.pinTab': 'Pin the current tab',
  'palette.unpinTab': 'Unpin the current tab',
  'palette.editTabAppearance': "Edit the current tab's appearance",
  'palette.searchTabs': 'Search open tabs',
  'palette.editAppAppearance': "Edit the app's appearance",
  'palette.editAppIdentity': 'Edit the app name and logo',
  'palette.editToolbarAppearance': "Edit the toolbar's appearance",
  'palette.editRepositoryListAppearance':
    "Edit the repository list's appearance",
  'palette.editRepositoryTabsAppearance': 'Edit repository tab appearance',
  'palette.editRepositoryLogo': 'Edit the repository logo',
  'palette.manageRepositoryGroups': 'Manage repository groups',
  'palette.repositoryAccount': 'Repository account',
  'palette.regexBuilder': 'Open the regex builder',
  'palette.closeTab': 'Close the current tab',
  'palette.closeOtherTabs': 'Close other tabs',
  'palette.closeTabsToLeft': 'Close tabs to the left',
  'palette.closeTabsToRight': 'Close tabs to the right',
  'palette.favoriteTab': 'Favorite the current tab',
  'palette.renameTab': 'Rename the current tab',
  'palette.moveTabToGroup': 'Move the current tab to a group',
  'palette.collapseTabGroup': 'Collapse the current tab group',
  'palette.deleteTabGroup': 'Delete the current tab group',
  'palette.sortTabsLabelAscending': 'Sort tabs A to Z',
  'palette.sortTabsLabelDescending': 'Sort tabs Z to A',
  'palette.sortTabsOpenedNewest': 'Sort tabs newest first',
  'palette.sortTabsOpenedOldest': 'Sort tabs oldest first',
  'palette.sortTabsStatusAttentionFirst':
    'Sort tabs by status, needs attention first',
  'palette.sortTabsStatusCleanFirst': 'Sort tabs by status, clean first',
  'palette.sortTabsFavoriteFirst': 'Sort tabs, favorites first',
  'palette.sortTabsFavoriteLast': 'Sort tabs, favorites last',
  'palette.undoSettingsChange': 'Undo the last settings change',
  'palette.redoSettingsChange': 'Redo the last settings change',
  'palette.signInDotcom': 'Sign in to GitHub.com',
  'palette.signInEnterprise': 'Sign in to GitHub Enterprise',
  'palette.md3.changes': 'Go to Changes',
  'palette.md3.history': 'Go to History',
  'palette.md3.branches': 'Go to Branches',
  'palette.md3.actions': 'Go to Actions',
  'palette.md3.inbox': 'Go to Inbox',
  'palette.md3.terminal': 'Go to Terminal',
  'palette.md3.agents': 'Go to Agents',
  'palette.md3.repositories': 'Go to Repositories',
  'palette.md3.focusSearch': 'Focus the global search',
  'palette.md3.searchRegex': 'Read the global search as a regular expression',
  'palette.md3.searchRegexDescription':
    'Turns regular expression matching on for the header search field only. Every other search field keeps its own mode.',
  'palette.md3.searchBuilder': 'Build a pattern for the global search',
  'palette.md3.searchMenu': 'Open the search menu',
  'palette.md3.regexGuide': 'Open the regular expression guide',
  'palette.md3.compose': 'Open the commit composer',
  'palette.md3.drawer': 'Expand the navigation drawer',
  'palette.md3.drawerDescription':
    'On, the drawer shows its destination labels; off, it narrows to icons and keeps every destination reachable by name.',
  'palette.md3.drawerMenu': 'Open the navigation drawer menu',
  'palette.md3.repositoryMenu': 'Open the repository menu',
  'palette.md3.branchMenu': 'Open the branch menu',
  'palette.md3.paneMenu': 'Open the pane menu',
  'palette.md3.commitSort': 'Commit order',
  'palette.md3.commitSortDescription':
    'Which way round the commit list is ordered. The History menu shows the live value as its hint.',
  'palette.md3.commitSortNewest': 'Newest first',
  'palette.md3.commitSortOldest': 'Oldest first',
  'palette.md3.groupCommitsByDay': 'Group commits by day',
  'palette.md3.groupCommitsByDayDescription':
    'Puts a date heading above each day of commits instead of one unbroken list.',
  'palette.md3.commitGraph': 'Show the commit graph',
  'palette.md3.commitGraphDescription':
    'Draws the ancestry column beside the commit list.',
  'palette.md3.wrapLongLines': 'Wrap long diff lines',
  'palette.md3.wrapLongLinesDescription':
    'Wraps a long line onto the next row instead of scrolling the diff sideways.',
  'palette.md3.diffContextLines': 'Diff context lines',
  'palette.md3.diffContextLinesDescription':
    'How many unchanged lines are shown around each change, from 1 to 20.',
  'palette.md3.groupChangesByFolder': 'Group changes by folder',
  'palette.md3.groupChangesByFolderDescription':
    'Groups the changed files under their folders instead of listing every path flat.',
  'commandPalette.homeMd3Drawer': 'The navigation drawer',
  'commandPalette.homeMd3Header': 'The app header',
  'commandPalette.homeMd3PaneHeader': 'The pane header',
  'commandPalette.homeRepositoryTools': 'Repository tools',
  'commandPalette.homePalette': 'The command palette itself',
  'commandPalette.homeTabStrip': 'The repository tab strip',
  'commandPalette.homeWorkspace': 'The workspace',
  'commandPalette.homeRepositoryAppearance': 'Repository settings ▸ Appearance',
  'commandPalette.rowDensity': 'Row density',
  'commandPalette.comfortable': 'Comfortable',
  'commandPalette.comfortableDescription': 'More detail and spacing',
  'commandPalette.compact': 'Compact',
  'commandPalette.compactDescription': 'Show more commands at once',
  'commandPalette.showInEachRow': 'Show in each row',
  'commandPalette.icons': 'Icons',
  'commandPalette.groupChips': 'Group chips',
  'commandPalette.keywordLine': 'Keyword line',
  'commandPalette.resetDefaults': 'Reset defaults',
  'commandPalette.groupApp': 'App',
  'commandPalette.groupBranch': 'Branch',
  'commandPalette.groupChanges': 'Changes',
  'commandPalette.groupEdit': 'Edit',
  'commandPalette.groupNavigate': 'Navigate',
  'commandPalette.groupRepository': 'Repository',
  'palette.selectAll': 'Select all',
  'palette.toggleTheme': 'Dark theme',
  'palette.preferencesAccounts': 'Preferences: Accounts',
  'palette.preferencesAppearance': 'Preferences: Appearance',
  'palette.preferencesIntegrations': 'Preferences: Integrations',
  'palette.preferencesAutomation': 'Preferences: Automation',
  'palette.preferencesAdvanced': 'Preferences: Advanced',
  'palette.preferencesNotifications': 'Preferences: Notifications',
  'palette.preferencesGit': 'Preferences: Git',
  'palette.preferencesAccessibility': 'Preferences: Accessibility',
  'palette.ollamaModelManager': 'Ollama model manager',
  'palette.ollamaChat': 'Ollama chat',
  'palette.preferencesCopilot': 'Preferences: Copilot and AI providers',
  'palette.preferencesSound': 'Preferences: Sound',
  'palette.backgroundQueue': 'Background action and API queue',
  'palette.buildAndRun': 'Build and run',
  'palette.cheapLfsSettings': 'Large files (Cheap LFS) settings',
  'palette.repositoryAutomation': 'Automation overrides (this repository)',
  'palette.tagLifecycle': 'Tag lifecycle manager',
  'palette.githubApiExplorer': 'GitHub API explorer',
  'palette.notificationCentre': 'Open notification centre',
  'palette.notificationHistory':
    'Notification version history (undo, redo, restore)',
  'palette.notificationAutomations': 'Notification automations',
  'palette.copyRepoPath': 'Copy repository path',
  'palette.copyBranchName': 'Copy current branch name',
  'palette.copyCommitSha': 'Copy current commit SHA',
  'palette.resolveConflictsAgent': 'Resolve conflicts with Codex/OpenCode',
  'palette.fixCiAgent': 'Fix CI with Codex/OpenCode',
  'palette.hideBackgroundProgress': 'Hide background progress',
  'palette.showBackgroundProgress': 'Show background progress',
  'palette.toggleCheapLfsProgress':
    'Expand/collapse Cheap LFS restore progress',
  'commandPalette.homeDialog': 'Opens as a dialog',
  'commandPalette.homeNotificationCentre': 'Notification centre',
  'commandPalette.homeToolbar': 'Toolbar',
  'commandPalette.homeSidebar': 'Repository rail',
  'commandPalette.homeChangesView': 'Changes view',
  'commandPalette.homeCommitBox': 'Commit box',
  'commandPalette.homeRepositoryList': 'Repository list',
  'commandPalette.homeSettings': 'Settings › {tab}',
  'commandPalette.whereItLives': 'Where it lives',
  'commandPalette.goThere': 'Go there',
  'commandPalette.runCommand': 'Run',
  'commandPalette.applyValue': 'Apply',
  'commandPalette.close': 'Close the command palette',
  'commandPalette.detailEmpty':
    'Pick a command to see what it does and where it lives.',
  'commandPalette.valueOn': 'On',
  'commandPalette.valueOff': 'Off',
  'commandPalette.matchCount': '{count} of {total} commands',
  'commandPalette.hintMove': 'move',
  'commandPalette.hintGo': 'go there',
  'commandPalette.hintRun': 'run',
  'commandPalette.hintClose': 'close',
  'commandPalette.rangeHint': '{min}–{max}',
  'commandPalette.currentValue': 'Now: {value}',
  'commandPalette.detailsRegion': 'Command details',
  'commandPalette.controlsColumn': 'Setting',
  'commandPalette.settingRow': 'Setting, adjustable here',
  'commandPalette.actionRow': 'Action',
  'commandPalette.teleportMissing':
    '{place} is not on screen right now, so nothing was highlighted.',
  'palette.toggleThemeDescription':
    'Switch the whole app between the light and dark themes.',
  'palette.languageMode': 'Language mode',
  'palette.languageModeDescription':
    'English, playful Cantonese, or both at once.',
  'palette.funnyEnglish': 'Playfulness (English)',
  'palette.funnyCantonese': 'Playfulness (Cantonese)',
  'palette.funnyLevelDescription':
    '1 is fully serious, 5 is maximum playfulness. It styles the voice of every message; what happened and what to do never changes.',
  'palette.tabSize': 'Diff tab size',
  'palette.tabSizeDescription':
    'How many columns a tab character occupies in diffs.',
  'palette.highlightFeatures': 'Highlight Desktop Material features',
  'palette.highlightFeaturesDescription':
    'Marks the entry points Desktop Material adds on top of GitHub Desktop.',
  'palette.confirmDiscard': 'Confirm before discarding changes',
  'palette.confirmDiscardDescription':
    'Turning this off discards immediately, with no dialog and no second chance.',
  'palette.confirmForcePush': 'Confirm before force pushing',
  'palette.confirmForcePushDescription':
    'Turning this off force pushes immediately, rewriting the remote branch with no dialog.',
  'palette.confirmRepositoryRemoval': 'Confirm before removing a repository',
  'palette.confirmRepositoryRemovalDescription':
    'Removing takes the repository out of the app; the files stay on disk.',
  'palette.commitLengthWarning': 'Warn about long commit summaries',
  'palette.commitLengthWarningDescription':
    'Shows the length warning once a commit summary runs past the recommended width.',
  'palette.notificationsEnabled': 'Desktop notifications',
  'palette.notificationsEnabledDescription':
    'System notifications for finished pushes, checks, and review activity.',
  'palette.underlineLinks': 'Underline links',
  'palette.underlineLinksDescription':
    'Underlines every link so it is identifiable without relying on colour.',
  'palette.externalCredentialHelper': 'Use the external credential helper',
  'palette.externalCredentialHelperDescription':
    "Authenticates Git through the system credential helper instead of the app's own store.",
  'palette.windowsOpenSSH': 'Use the Windows OpenSSH client',
  'palette.windowsOpenSSHDescription':
    'Runs SSH remotes through the OpenSSH client shipped with Windows.',
  'palette.sideBySideDiff': 'Side-by-side diff',
  'palette.sideBySideDiffDescription':
    'Shows removals and additions in two columns instead of one unified column.',
  'palette.hideWhitespaceChanges': 'Hide whitespace in the changes diff',
  'palette.hideWhitespaceChangesDescription':
    'Ignores whitespace-only edits while reviewing uncommitted changes.',
  'palette.commitSummary': 'Commit summary',
  'palette.commitSummaryDescription':
    'Types straight into the commit box without leaving the palette.',
  'palette.commitSummaryPlaceholder': 'Summary (required)',
  'palette.cloneUrl': 'Clone from a URL',
  'palette.cloneUrlDescription':
    'Opens the clone dialog with this URL already filled in.',
  'palette.cloneUrlPlaceholder': 'https://github.com/owner/repository',
  'palette.preferencesPrompts': 'Preferences: Prompts and confirmations',
  'palette.preferencesAgentAccess': 'Preferences: Agent access',
  'buildRun.closeDisabledRunning':
    'A task is running — stop it before closing the panel',
  'buildRun.fixingWithOpencode': 'Fixing with OpenCode…',
  'buildRun.stopConfirmTitle': 'Stop the running task?',
  'buildRun.stopConfirmBody':
    'The in-progress build and any OpenCode work will be terminated. This cannot be undone.',
  'buildRun.stopConfirmConfirm': 'Stop',
  'buildRun.stopConfirmCancel': 'Cancel',
  'buildRun.scrollToBottom': 'Scroll to bottom',
  'buildRun.autoScroll': 'Auto-scroll output',
  'buildRun.truncateOutput': 'Truncate long lines',
  'buildRun.backgroundProgress': 'Background operation progress',
  'buildRun.backgroundWorking': 'Working in the background',
  'buildRun.hideRunningPanel':
    'Hide this panel; the operation will continue in the background',
  'buildRun.elapsed': '{elapsed} elapsed',
  'buildRun.estimatedFinish': 'Estimated finish {time}',
  'buildRun.estimatedFinishUnknown':
    'Finish time becomes available when measurable',
  'conflicts.resolveWithAgent': 'Resolve with Codex/OpenCode',
  'actions.fixCiWithAgent': 'Fix CI with Codex/OpenCode',
  'actions.elapsed.run': 'Elapsed {duration}',
  'actions.elapsed.pending': 'Elapsed: waiting to start',
  'actions.elapsed.unavailable': 'Elapsed: unavailable',
  'actions.elapsed.workflowCompleted': 'Last run {duration}',
  'actions.elapsed.workflowRunning': 'Current run {duration}',
  'actions.elapsed.workflowPending': 'Latest run: waiting to start',
  'actions.elapsed.workflowUnavailable': 'Latest run time unavailable',
  'actions.elapsed.workflowNone': 'No loaded run time',
  'githubReleaseTransfer.stalled':
    'The release asset upload stopped making network progress. Retry it or use Manual upload.',
  'githubReleaseTransfer.cliUnavailable':
    'GitHub CLI is unavailable for the verified release asset upload. Install GitHub CLI and retry, or use Manual upload.',
  'githubReleaseTransfer.cliFailed':
    'GitHub CLI could not finish the release asset upload after two safe attempts. Retry it or use Manual upload.',
  'githubReleaseTransfer.incompleteAsset':
    'This release has an incomplete asset with the same name. In Releases, choose Delete for the Processing asset, then retry.',
  'buildRun.sendToOpencode': 'Send to opencode',
  'buildRun.sendIntro':
    'opencode is an AI coding agent. Type a request and it will work in this repository, running entirely on your machine.',
  'buildRun.sendPromptLabel': 'What should opencode do?',
  'buildRun.sendPromptPlaceholder':
    'Describe what you want opencode to do in this repository…',
  'buildRun.sendEmptyError': 'Type a request before sending it to opencode.',
  'buildRun.sendSubmit': 'Send to opencode',
  'buildRun.sendAutoApproveLabel':
    "Auto-approve opencode's edits and commands for this run (yolo)",
  'buildRun.sendAutoApproveWarning':
    'opencode will edit files and run shell commands in this repository without asking for confirmation. It is scoped to this repository — it cannot touch files outside it.',
  'buildRun.sendAutoApproveNote':
    'opencode will ask before editing files or running commands. Turn on auto-approve above to let it work unattended in this repository.',
  'buildRun.sendRunningTitle': 'opencode is working on your request…',
  'buildRun.providerLabel': 'AI coding provider',
  'buildRun.fixingWithProvider': 'Fixing with {provider}…',
  'buildRun.fixWithProvider': 'Fix with {provider}',
  'buildRun.sendToProvider': 'Send to {provider}',
  'buildRun.fixIntroProvider':
    '{provider} is a local AI coding agent. It receives bounded build-failure context and can try to fix this repository on your machine.',
  'buildRun.sendIntroProvider':
    '{provider} is a local AI coding agent. Type a bounded request and it will work in this repository on your machine.',
  'buildRun.checkingCli': 'Checking for the {cli} CLI…',
  'buildRun.detectFailedProvider':
    '{provider} could not be detected on this machine.',
  'buildRun.notInstalledCli':
    'The {cli} CLI is not installed. It can be installed now with this command:',
  'buildRun.installingCli': 'Installing the {cli} CLI…',
  'buildRun.authMissingProvider':
    '{provider} is installed but is not authenticated, so it cannot run yet.',
  'buildRun.authCommandGuidance':
    'Open a terminal and run {command}, then re-check. Desktop Material never asks you to paste or store a secret here.',
  'buildRun.promptLabelProvider': 'What should {provider} do?',
  'buildRun.promptPlaceholderProvider':
    'Describe what you want {provider} to do in this repository…',
  'buildRun.autoApproveProvider':
    "Auto-approve {provider}'s edits and commands for this run",
  'buildRun.autoApproveWarningProvider':
    '{provider} may edit files and run commands here without pausing. Codex keeps its workspace-write sandbox; OpenCode keeps its repository permission block.',
  'buildRun.codexAutoApproveTrustWarning':
    "Codex is fixed here to workspace-write, ignores execution rules, and disables lifecycle hooks. Trusted project MCP configuration remains part of Codex's user trust boundary; review .codex/config.toml before unattended auto-approve.",
  'buildRun.approvalOnRequestProvider':
    '{provider} uses approval-on-request. This detached run may stop rather than perform an action that needs approval.',
  'buildRun.diagnosingProvider':
    '{provider} is diagnosing and fixing the build…',
  'buildRun.verifyingProvider':
    '{provider} finished. Re-running Build & Run to verify the build rather than trusting the agent exit status…',
  'buildRun.workingProvider': '{provider} is working on your request…',
  'buildRun.preferredProvider': 'Preferred build-fix provider',
  'buildRun.offerAgents': 'Offer opencode to fix build errors, or use Codex',
  'buildRun.autoApproveRepositoryProvider':
    'Auto-approve {provider} in this repository',
  'buildRun.installCliAction': 'Install {cli}',
  'buildRun.runCliAction': 'Run {cli}',
  'buildRun.runCliAgainAction': 'Run {cli} again',
  'buildRun.offerAgentsHelp':
    'When a run fails, offer OpenCode or Codex to diagnose and fix the errors. Nothing runs until you choose a provider and approve the launch dialog.',
  'buildRun.autoApproveRepositoryHelp':
    'Runs {provider} in auto-approve mode, applying repository-scoped edits and commands without pausing. Codex retains its workspace-write sandbox; OpenCode retains its repository permission block. Leave this off unless you trust the selected agent to work unattended.',
  'buildRun.codexInstallSafety':
    'Installs the official @openai/codex npm package globally. Desktop Material never asks for or stores your OpenAI credentials.',
  'buildRun.opencodeInstallSafety':
    'Installs OpenCode using its official npm package. Desktop Material never asks for or stores your OpenCode credentials.',
  'buildRun.title': 'Build & run',
  'buildRun.stop': 'Stop',
  'buildRun.phase.detecting': 'Detecting',
  'buildRun.phase.preparing': 'Preparing',
  'buildRun.phase.installing': 'Installing',
  'buildRun.phase.building': 'Building',
  'buildRun.phase.running': 'Running',
  'buildRun.phase.succeeded': 'Succeeded',
  'buildRun.phase.failed': 'Failed',
  'buildRun.phase.cancelled': 'Cancelled',
  'buildRun.phase.idle': 'Idle',
  'buildRun.pill.stopRunningTooltip': 'Stop the running app',
  'buildRun.pill.cancelBuildTooltip': 'Cancel the build',
  'buildRun.pill.failedTitle': 'Build failed',
  'buildRun.pill.failedTooltip': 'Build failed — click to retry',
  'buildRun.pill.idleTooltip': 'Build and run this repository ({profile})',
  'buildRun.pill.chooseProfile': 'Choose project and build profile',
  'buildRun.closePanel': 'Close panel',
  'buildRun.restorePanel': 'Restore panel',
  'buildRun.minimizePanel': 'Minimize panel',
  'buildRun.copyAll': 'Copy all output',
  'buildRun.clearOutput': 'Clear output',
  'buildRun.notify.succeededTitle': 'Build succeeded',
  'buildRun.notify.succeededBody':
    'Building {repository} finished successfully.',
  'buildRun.notify.failedTitle': 'Build failed',
  'buildRun.notify.failedBody':
    'Building {repository} failed with exit code {code}.',
  'actionsLocalRun.commandTitle': 'Run Actions locally',
  'actionsLocalRun.dialogTitle': 'Run GitHub Actions locally',
  'actionsLocalRun.subtitle':
    'Pick a workflow and event, then run it on your machine with act and Docker.',
  'actionsLocalRun.checkingTools': 'Checking for act and Docker…',
  'actionsLocalRun.toolsMissingTitle': 'Local runner tools are missing',
  'actionsLocalRun.actMissing':
    'act (nektos/act) was not found on your PATH. It runs your workflows locally.',
  'actionsLocalRun.actInstalling':
    'Installing act (nektos/act) for you. It runs your workflows locally, and it is going into this app’s own folder — nothing is installed system-wide.',
  'actionsLocalRun.actInstallingAutomatically':
    'act (nektos/act) is not installed yet. It runs your workflows locally, and the app is fetching it for you now.',
  'actionsLocalRun.actInstallFailed':
    'act could not be installed automatically. Install it yourself and it will be picked up from your PATH.',
  'actionsLocalRun.dockerMissing':
    'Docker was not found on your PATH. act needs a running Docker engine to execute jobs.',
  'actionsLocalRun.installHint':
    'Install the missing tools, make sure they are on your PATH, then check again.',
  'actionsLocalRun.installActLink': 'How to install act',
  'actionsLocalRun.installDockerLink': 'Get Docker',
  'actionsLocalRun.retryDetection': 'Check again',
  'actionsLocalRun.noWorkflows':
    'No workflow files were found under .github/workflows in this repository.',
  'actionsLocalRun.workflowLabel': 'Workflow',
  'actionsLocalRun.eventLabel': 'Event',
  'actionsLocalRun.jobLabel': 'Job',
  'actionsLocalRun.allJobs': 'All jobs',
  'actionsLocalRun.parseErrorPrefix': 'Could not fully parse this workflow: ',
  'actionsLocalRun.inputsHeading': 'Workflow inputs',
  'actionsLocalRun.inputRequired': 'required',
  'actionsLocalRun.secretsHeading': 'Secrets',
  'actionsLocalRun.secretsHint':
    'Secrets are written to a temporary file for this run only and deleted afterwards. They are never logged.',
  'actionsLocalRun.addSecret': 'Add secret',
  'actionsLocalRun.secretNamePlaceholder': 'SECRET_NAME',
  'actionsLocalRun.secretValuePlaceholder': 'value',
  'actionsLocalRun.removeSecret': 'Remove secret',
  'actionsLocalRun.dryRunLabel': 'Dry run (list steps without executing)',
  'actionsLocalRun.dryRunHelp':
    'Runs act with -n so you can preview the plan without starting any containers.',
  'actionsLocalRun.runButton': 'Run workflow',
  'actionsLocalRun.dryRunButton': 'Dry run',
  'actionsLocalRun.stopButton': 'Stop',
  'actionsLocalRun.stoppingButton': 'Stopping…',
  'actionsLocalRun.closeButton': 'Close',
  'actionsLocalRun.clearLog': 'Clear output',
  'actionsLocalRun.logRegionLabel': 'Local Actions run output',
  'actionsLocalRun.statusStarting': 'Starting…',
  'actionsLocalRun.statusRunning': 'Running…',
  'actionsLocalRun.statusSucceeded': 'Run succeeded',
  'actionsLocalRun.statusFailed': 'Run failed',
  'actionsLocalRun.statusCancelled': 'Run cancelled',
  'actionsLocalRun.releaseUploadHeading': 'Release upload detected',
  'actionsLocalRun.releaseUploadNote':
    'This workflow contains a step that would upload a release asset. A local run does not touch your real GitHub releases.',
  'actionsLocalRun.releaseUploadWarning':
    'To upload a produced artifact to the real release, use the guarded release upload after the run — it always asks for confirmation before publishing.',
  'actionsLocalRun.filterPlaceholder': 'Filter output',
  'actionsLocalRun.filterLabel': 'Filter run output',
  'actionsLocalRun.filterRegexTarget': 'Run output',
  'actionsLocalRun.filterStatusCount': '{matched} of {total} lines',
  'actionsLocalRun.filterStatusNone': 'No lines match',
  'batchClone.filterPlaceholder': 'Filter clone queue',
  'batchClone.filterLabel': 'Filter clone queue',
  'batchClone.filterRegexTarget': 'Clone queue',
  'batchClone.filterStatusCount': '{matched} of {total} repositories',
  'batchClone.filterStatusNone': 'No repositories match',
  'repositoryTransfer.cheapLfsNote':
    'After each clone, Cheap LFS restores large files according to the repository setting “Download large files after cloning” (enabled by default). The shared list carries URLs only, so account affinity and explicit file selections stay local; when restore is disabled or no eligible provider account is available, pointer files remain ready for a later restore.',
  'branchRules.filterPlaceholder': 'Filter results',
  'branchRules.filterLabel': 'Filter branch rule results',
  'branchRules.filterRegexTarget': 'Branch rule results',
  'branchRules.filterStatusCount': '{matched} of {total} match',
  'branchRules.filterStatusNone': 'No results match',
  'branchRules.filterNoMatchesInList': 'No values match the filter',
  'cheapLfs.files.one': '{count} large file',
  'cheapLfs.files.many': '{count} large files',
  'cheapLfs.workingTree.menu.one': 'Store selected file in cheap LFS…',
  'cheapLfs.workingTree.menu.many':
    'Store {count} selected files in cheap LFS…',
  'cheapLfs.workingTree.menu.wholeFileRequired':
    'Store in cheap LFS (whole file required)',
  'cheapLfs.workingTree.title': 'Store files in Cheap LFS?',
  'cheapLfs.workingTree.reviewBody':
    'The selected working-tree files will be uploaded to the configured Cheap LFS storage and replaced locally with small pointers. This keeps their raw bytes out of future Git history; it does not delete the uploaded content.',
  'cheapLfs.workingTree.reviewWarning':
    'Review the exact files before continuing. A pointer replaces the complete file, so a partial diff selection is never uploaded as though it were a whole file.',
  'cheapLfs.workingTree.skipped.one':
    '1 selected file was skipped before upload:',
  'cheapLfs.workingTree.skipped.many':
    '{count} selected files were skipped before upload:',
  'cheapLfs.workingTree.skipped.deleted':
    'Deleted files have no working-tree bytes to upload.',
  'cheapLfs.workingTree.skipped.partial':
    'Select the whole file before replacing it with a pointer.',
  'cheapLfs.workingTree.progress.label': 'Cheap LFS batch progress',
  'cheapLfs.workingTree.progress.files': '{completed} of {total} files',
  'cheapLfs.workingTree.progress.count': '{completed}/{total}',
  'cheapLfs.workingTree.progress.canceling':
    'Cancellation requested; finishing safe cleanup…',
  'cheapLfs.workingTree.result.canceled':
    'The Cheap LFS batch was canceled. Files not completed were left unchanged.',
  'cheapLfs.workingTree.result.stored.one': '1 file was stored in Cheap LFS.',
  'cheapLfs.workingTree.result.stored.many':
    '{count} files were stored in Cheap LFS.',
  'cheapLfs.workingTree.result.storedLabel': 'Stored files:',
  'cheapLfs.workingTree.result.unchangedLabel': 'Files left unchanged:',
  'cheapLfs.workingTree.result.error':
    'Cheap LFS could not complete this batch: {error}',
  'cheapLfs.workingTree.result.unknownError':
    'The provider returned no safe error detail.',
  'cheapLfs.workingTree.done': 'Done',
  'cheapLfs.workingTree.canceling': 'Canceling…',
  'cheapLfs.workingTree.store.one': 'Store file in Cheap LFS',
  'cheapLfs.workingTree.store.many': 'Store {count} files in Cheap LFS',
  'cheapLfs.commitBlocked.restoreTitle': 'Commit waits for the file restore',
  'cheapLfs.commitBlocked.restoreBody':
    'A Cheap LFS file clone or restore is still running in {name}. No commit started. Wait for its progress to finish, then retry.',
  'cheapLfs.managerRail': 'Large files',
  'repositorySettings.buildRunTab': 'Build & run',
  'repositorySettings.cheapLfsTab': 'Cheap LFS',
  'repositorySettings.automationTab': 'Automation (this repository)',
  'repositorySettings.appearanceTab': 'Appearance',
  'repositorySettings.searchLabel': 'Search settings',
  'repositorySettings.appearance.intro':
    'Everything here belongs to this repository alone. Each section edits the same owner — the same setting, the same local Git repository, and the same history — that you reach by Shift+right-clicking the actual element.',
  'repositorySettings.appearance.introHint':
    'Prefer editing in place? Shift+right-click the repository row, its logo, or the toolbar (or focus it and press the Context Menu key or Shift+F10) to open the very same editor beside it.',
  'repositorySettings.appearance.loading':
    'Opening this repository’s appearance owners…',
  'repositorySettings.appearance.unavailable':
    'Appearance owners are still starting up. Reopen Repository settings in a moment.',
  'repositorySettings.appearance.loadFailed':
    'Could not read this repository’s appearance owners. Close Repository settings and try again.',
  'repositorySettings.appearance.saveFailed':
    'Could not save that appearance change. The value shown was restored from the owner on disk.',
  'repositorySettings.appearance.workspaceSection': 'Workspace colors',
  'repositorySettings.appearance.toolbarSection': 'Toolbar',
  'repositorySettings.appearance.tabsSection': 'Repository tabs',
  'repositorySettings.appearance.listNameSection':
    'Name in the repository list',
  'repositorySettings.appearance.logoSection': 'Repository logo',
  'repositorySettings.appearance.inheriting': 'Inherits the profile default',
  'repositorySettings.appearance.overridden': 'Overridden for this repository',
  'repositorySettings.appearance.reset': 'Reset to default',
  'repositorySettings.appearance.resetAccessibleName':
    'Reset {section} to the inherited default',
  'repositorySettings.appearance.history': 'History',
  'repositorySettings.appearance.historyAccessibleName':
    'Open {section} history',
  'repositorySettings.appearance.previewLabel': 'Live preview',
  'repositorySettings.appearance.previewDescription':
    'A sample of how {section} renders with the values above.',
  'repositorySettings.appearance.resolvedAccent': 'Accent: {value}',
  'repositorySettings.appearance.resolvedSurface': 'Surface: {value}',
  'repositorySettings.appearance.resolvedLabels': 'Labels: {value}',
  'repositorySettings.appearance.resolvedDensity': 'Density: {value}',
  'repositorySettings.appearance.resolvedWidth': 'Width: {value}',
  'repositorySettings.appearance.inheritedSuffix': 'inherited',
  'repositorySettings.appearance.overriddenSuffix': 'this repository',
  'repositorySettings.appearance.listNameInherits':
    'Inherits the ordinary row typography',
  'repositorySettings.appearance.logoInherits':
    'Inherits the profile default logo',
  'githubApi.railLabel': 'API explorer',
  'cheapLfs.managerTitle': 'Cheap LFS manager',
  'cheapLfs.managerIntro':
    'Find, pin, search, and restore repository large files here. You do not need to browse GitHub Releases or decode asset names.',
  'cheapLfs.settings.location':
    'Cheap LFS settings are in Repository settings → Cheap LFS.',
  'cheapLfs.settings.open': 'Open Cheap LFS settings',
  'cheapLfs.cloud.title': 'Cloud compression',
  'cheapLfs.cloud.publicAutomatic':
    'Automatic for public repositories. Commit and push the reviewed workflow change once; each release object is then compressed one by one.',
  'cheapLfs.cloud.privateToggle':
    'Enable cloud compression for this private repository',
  'cheapLfs.cloud.privateHelp':
    'Off by default for private repositories. Enabling adds and publishes the reviewed workflow in this repository. Its runs use your private GitHub Actions minutes, compress Release objects one by one, and publish verified pointer commits back to this repository.',
  'cheapLfs.cloud.visibilityUnknown':
    'Off until GitHub confirms whether this repository is public or private.',
  'cheapLfs.cloud.localOnly':
    'GitHub Actions compresses only. Desktop Material downloads and decompresses compressed objects locally, then verifies their original size and SHA-256.',
  'cheapLfs.cloud.workflowAdded':
    'Cloud-compression policy queued. Desktop Material publishes the managed workflow in the background from the checked-out default branch and proves the remote tip.',
  'cheapLfs.cloud.workflowReady':
    'The managed cloud-compression policy is prepared. The background publisher checks the default branch and leaves already-matching policy untouched.',
  'cheapLfs.cloud.workflowDisabled':
    'Private cloud compression is off. If an existing managed caller needs closing, Desktop Material publishes its closed guard in the background; raw objects remain cloneable.',
  'cheapLfs.cloud.builderRouted':
    'No workflow was added to this private repository and none of your private Actions minutes are spent. Compression runs through the encrypted public builder, which is set up outside Desktop Material; until it is, objects stay raw and cloneable.',
  'cheapLfs.cloud.autoInstall.startedTitle':
    'Publishing cloud compression policy',
  'cheapLfs.cloud.autoInstall.startedBody':
    'Reconciling {path} with this repository’s current setting in the background. Desktop Material will commit and prove the exact remote policy when safe, or defer without pushing unrelated commits.',
  'cheapLfs.cloud.autoInstall.succeededTitle':
    'Cloud compression policy published',
  'cheapLfs.cloud.autoInstall.succeededBody':
    'Remote branch {branch} now contains {path} with the guard that matches the current setting. Release objects follow that policy.',
  'cheapLfs.cloud.autoInstall.deferredTitle':
    'Cloud compression policy committed',
  'cheapLfs.cloud.autoInstall.deferredBody':
    'Committed {path}, but this branch also has commits that are not on {remote}. Nothing was pushed automatically; the policy travels with your next reviewed push.',
  'cheapLfs.cloud.autoInstall.pendingDefaultTitle':
    'Cloud compression policy is waiting for the default branch',
  'cheapLfs.cloud.autoInstall.pendingDefaultBody':
    'The current branch is {branch}. The background publisher changes only the provider-reported default branch, {defaultBranch}; check it out and retry. No background commit or push was made. Any already prepared working-tree policy remains visible for review.',
  'cheapLfs.cloud.autoInstall.failedTitle':
    'Could not publish cloud compression policy',
  'cheapLfs.cloud.autoInstall.failedBody':
    'The remote policy at {path} is not yet proven to match this setting. {reason}',
  'cheapLfs.cloud.autoInstall.failedWorkflowScope':
    'The push was rejected because the signed-in account lacks the `workflow` scope, which GitHub requires for any change under .github/workflows. Sign out and back in to grant it, or review and push the managed policy yourself.',
  'cheapLfs.cloud.autoInstall.failedRejected':
    'The push was rejected because the remote branch moved. Pull, review the managed policy, then push again.',
  'cheapLfs.cloud.autoInstall.failedUnknown':
    'The commit or push did not complete. The managed workflow may remain in Changes for review; the remote policy was not reported as published.',
  'cheapLfs.cloud.autoInstall.failedNoRepository':
    'This checkout is not associated with a GitHub repository, so there is nowhere to run the compression workflow.',
  'cheapLfs.cloud.autoInstall.failedNoRemote':
    'This repository has no push remote configured, so the workflow cannot be published.',
  'cheapLfs.cloud.autoInstall.failedDetachedHead':
    'HEAD is detached, so there is no branch to commit the workflow on. Check out a branch and try again.',
  'cheapLfs.cloud.autoInstall.failedNoDefaultBranch':
    'GitHub did not provide a default branch for this repository. Refresh or publish its default branch, then retry; no workflow commit was created.',
  'cheapLfs.cloud.autoInstall.updateTitle':
    'Cloud compression workflow is out of date',
  'cheapLfs.cloud.autoInstall.updateBody':
    '{path} differs from the version this release of Desktop Material installs. It was left exactly as it is. Update it only if you did not mean to change it.',
  'cheapLfs.cloud.autoInstall.updateAction': 'Update workflow',
  'cheapLfs.cloud.autoInstall.updateWarning':
    'This replaces your version of the file with the one Desktop Material ships, then commits and pushes it. Your edits to it are lost.',
  'cheapLfs.cloud.autoInstall.updateConfirm': 'Replace and push',
  'cheapLfs.cloud.autoInstall.updateCancel': 'Keep mine',
  'cheapLfs.cloud.autoInstall.unownedTitle':
    'Cloud compression workflow not installed',
  'cheapLfs.cloud.autoInstall.unownedBody':
    'A file Desktop Material does not manage already occupies {path}. It was left untouched, so cloud compression is not set up automatically here.',
  'cheapLfs.cloud.autoInstall.visibilityUnknownTitle':
    'Cloud compression is waiting on repository visibility',
  'cheapLfs.cloud.autoInstall.visibilityUnknownBody':
    'GitHub has not confirmed whether this repository is public or private, so nothing was installed and nothing was prepared anywhere public. Sign in or refresh the repository, then compression resumes on its own.',
  'cheapLfs.cloud.autoInstall.builderTitle':
    'Private compression runs on the external builder',
  'cheapLfs.cloud.autoInstall.builderUnavailableBody':
    'No compression workflow was added to this private repository, because every pass would bill your own Actions minutes. Compression belongs on the encrypted public builder, whose registration is ready: builder {builder}, project {project}, secrets {secrets}. Desktop Material cannot create that public repository or write its secrets for you, so compression does not run until you do. Nothing about this repository was published anywhere.',
  'cheapLfs.cloud.autoInstall.builderLeakRefusedBody':
    'Preparing the external builder was stopped because a value bound for a public place carried this repository’s name, a file path, or an asset name. Nothing was installed and nothing was published. Rename the colliding item or keep compression off.',
  'cheapLfs.cloud.autoInstall.builderNoIdentityBody':
    'This checkout has no private GitHub repository to register with the external builder, so nothing was installed and nothing was published.',
  'cheapLfs.cloud.autoInstall.builderPreparationFailedBody':
    'The external-builder registration could not be prepared, so compression did not start. Nothing was installed in this repository and nothing was published anywhere. Objects stay raw and cloneable; try again after reopening the repository.',
  'cheapLfs.cloud.raw': 'Raw',
  'cheapLfs.cloud.compressed': 'Compressed · {savings}% smaller',
  'cheapLfs.cloud.mixed':
    'Mixed · {compressed}/{total} objects compressed · {savings}% smaller',
  'cheapLfs.manualUpload': 'Manual upload',
  'cheapLfs.manualUploadStarting': 'Switching to manual upload…',
  'cheapLfs.cancel': 'Cancel',
  'cheapLfs.cancelConfirmation':
    'Cancel this Cheap LFS transfer?\n\nThe upload or manual handoff will stop. Files already converted to pointers in the worktree or uploaded to the GitHub Release may remain, but no commit will be created.',
  'cheapLfs.progress.amendSuffix': ' before amending',
  'cheapLfs.progress.preparing': 'Preparing {files} for cheap LFS{amend}',
  'cheapLfs.progress.hashing':
    'Hashing {files} for cheap LFS ({percentage}%){amend}',
  'cheapLfs.progress.release':
    'Preparing the GitHub Release for {files}{amend}',
  'cheapLfs.progress.uploadStarting':
    'Starting the cheap-LFS upload for {files}{amend}',
  'cheapLfs.progress.uploading':
    'Uploading {files} to cheap LFS ({percentage}%){amend}',
  'cheapLfs.progress.verifying': 'Verifying {files} for cheap LFS{amend}',
  'cheapLfs.progress.manualPreparing':
    'Preparing the manual upload handoff ({percentage}%)',
  'cheapLfs.progress.manualWaiting':
    'Upload all prepared files and save the GitHub release',
  'cheapLfs.progress.manualVerifying': 'Checking your manual upload',
  'cheapLfs.progress.manualDetected': 'Manual upload detected and verified',
  'cheapLfs.progress.terminalTitle': 'Cheap LFS upload activity',
  'cheapLfs.progress.terminalCurrentFile': 'Current file: {path}',
  'cheapLfs.progress.terminalFiles': 'Files complete: {completed}/{total}',
  'cheapLfs.progress.terminalFilesDetailed':
    'Settled {completed}/{total} · pinned {succeeded} · failed {failed}',
  'cheapLfs.progress.terminalFailuresLabel': 'Failures',
  'cheapLfs.progress.terminalFailedFile': '{path} — {reason}',
  'cheapLfs.progress.terminalFailedFileWithStatus':
    '{path} — HTTP {status}: {reason}',
  'cheapLfs.progress.terminalFailedFileNoReason':
    '{path} — the storage provider gave no reason.',
  'cheapLfs.progress.terminalFailuresOmitted': 'and {count} more',
  'cheapLfs.progress.terminalBytes': 'Batch data: {transferred} / {total}',
  'cheapLfs.progress.terminalFileBytes':
    '{transferred} / {total} ({percentage}%)',
  'cheapLfs.progress.terminalBytesPending':
    'Batch data: waiting for byte progress',
  'cheapLfs.progress.terminalActivity':
    'Workers: {active} active · {queued} waiting',
  'cheapLfs.progress.terminalAwaitingAction':
    'Files awaiting your action: {count}',
  'cheapLfs.progress.terminalManualVerification':
    'Files left to verify: {count}',
  'cheapLfs.progress.terminalManualComplete': 'Manual upload verified',
  'cheapLfs.progress.terminalObservedElapsed': 'Observed {elapsed}',
  'cheapLfs.progress.terminalTiming': 'Observed {elapsed} · {rate} · ETA {eta}',
  'cheapLfs.progress.terminalRatePending': 'measuring speed',
  'cheapLfs.progress.terminalEtaPending': 'pending',
  'cheapLfs.progress.terminalProgressLabel': 'Cheap LFS transfer progress',
  'cheapLfs.progress.terminalStorageSelected': 'Destination {selected}{layers}',
  'cheapLfs.progress.terminalStorage':
    'Using {selected} · recommended {recommended}{layers}',
  'cheapLfs.progress.terminalStorageMatched':
    'Using {selected} · recommended for this batch{layers}',
  'cheapLfs.progress.terminalLayer': ' · estimated 1 OCI layer',
  'cheapLfs.progress.terminalLayers': ' · estimated {count} OCI layers',
  'cheapLfs.progress.terminalProviderGit': 'Ordinary Git',
  'cheapLfs.progress.terminalProviderUnknown': 'Unknown storage',
  'cheapLfs.progress.terminalReasonOrdinaryGit':
    'Recommendation: this selected batch still fits ordinary Git.',
  'cheapLfs.progress.terminalReasonSingleRelease':
    'Recommendation: this batch fits one release-backed transfer.',
  'cheapLfs.progress.terminalReasonGhcr':
    'Recommendation: this large GitHub batch benefits from reusable GHCR layers.',
  'cheapLfs.progress.terminalReasonDockerHub':
    'Recommendation: this large batch benefits from reusable Docker Hub layers.',
  'cheapLfs.progress.terminalReasonReleaseFallback':
    'Recommendation: no registry is available, so release storage is the safe fallback.',
  'cheapLfs.progress.terminalStagePreparing': 'Preparing',
  'cheapLfs.progress.terminalStageHashing': 'Hashing',
  'cheapLfs.progress.terminalStageRelease': 'Preparing release',
  'cheapLfs.progress.terminalStageUploading': 'Uploading',
  'cheapLfs.progress.terminalStageVerifying': 'Verifying',
  'cheapLfs.progress.terminalStageManualPreparing': 'Preparing manual upload',
  'cheapLfs.progress.terminalStageManualWaiting': 'Waiting for manual upload',
  'cheapLfs.progress.terminalStageManualVerifying': 'Checking manual upload',
  'cheapLfs.progress.terminalStageManualDetected': 'Manual upload verified',
  'githubReleases.compactTools': 'Filters and selection',
  'githubReleases.compactSummary': '{visible} shown · {selected} selected',
  'githubReleases.statsSummaryLabel': 'Release stats',
  'githubReleases.statsSummary':
    '{loaded} loaded · {published} published · latest {latest}',
  'githubPackages.scopeRecovery':
    'A token cannot gain a scope in place. Sign in again and approve {scope} to list packages.',
  'githubPackages.signInAgain': 'Sign in again',
  'githubReleases.filterSummary':
    'Filtering {visible} of {total} loaded releases',
  'githubReleases.dismissDownload': 'OK',
  'githubReleases.metadataLabel': 'Release details',
  'githubReleases.metadataSummary': '{status} · {assets} assets',
  'githubReleases.openFile': 'Open file',
  'githubReleases.showInFolder': 'Show in folder',
  'githubReleases.openFileError':
    'The downloaded release asset could not be opened. Check that Windows has an app associated with this file type, then try again. {detail}',
  'githubReleases.loadAll': 'Load all releases',
  'githubReleases.loadAllBusy': 'Loading every release…',
  'githubReleases.loadAllProgress':
    'Loading every release… {loaded} of ? loaded, through page {page}.',
  'githubReleases.loadAllComplete':
    'Loaded every release in this repository: {loaded} in total. The search filter now covers all of them.',
  'githubReleases.loadAllTruncated':
    'Loaded {loaded} releases and stopped at the {pages}-page safety limit. Older releases past that limit were not loaded, so the filter does not cover them.',
  'githubReleases.loadAllRateLimited':
    'Stopped at GitHub’s API rate limit with {loaded} releases loaded. The releases already loaded are still shown and still filterable. Try again after the limit resets.',
  'githubReleases.loadAllFailed':
    'Stopped after {loaded} releases were loaded. {detail}',
  'githubReleases.loadAllCanceled':
    'Stopped loading. {loaded} releases are loaded and still filterable.',
  'githubReleases.bulkDeleteReview':
    'Each exact reviewed release is revalidated immediately before permanent deletion, one at a time, with progress shown. Git tags are not deleted. A release that fails is reported with its reason and the remaining releases continue.',
  'githubReleases.bulkDeleteProgressLabel':
    'Selected release deletion progress',
  'githubReleases.bulkDeleteProgress':
    'Deleting selected releases: {deleted} deleted, {failed} failed, of {total}.',
  'githubReleases.bulkDeleteStop': 'Stop after this release',
  'githubReleases.bulkDeleteStopping':
    'Stopping after the release now being deleted. {deleted} deleted, {failed} failed, of {total}.',
  'githubReleases.bulkDeleteSummary':
    'Deleted {deleted} of {total} selected releases, {failed} failed. Git tags were not deleted.',
  'githubReleases.bulkDeleteSummaryStopped':
    'Stopped after {attempted} of {total} selected releases: {deleted} deleted, {failed} failed, {remaining} not attempted. Git tags were not deleted.',
  'githubReleases.bulkDeleteFailures': 'Releases that could not be deleted',
  'githubReleases.bulkDeleteFailure': '{tag}: {reason}',
  'githubReleases.bulkDeleteFailuresOmitted':
    'and {count} more not shown here.',
  'githubReleases.silentInstall': 'Silent install {file}',
  'githubReleases.silentInstallAttempt': 'Attempt silent install of {file}',
  'githubReleases.silentInstallRunning':
    'Running {file} unattended… {seconds}s elapsed. Windows may still prompt for permission before it can continue.',
  'githubReleases.silentInstallSucceeded':
    '{file} finished with exit code {code}.',
  'githubReleases.silentInstallFailed':
    '{file} did not install. It exited with code {code}. If Windows asked for administrator permission, run the installer manually.',
  'githubReleases.silentInstallLaunchFailed':
    '{file} could not be started. {detail}',
  'githubReleases.silentInstallOutput': 'Installer output: {output}',
  'githubReleases.silentInstallRefusedMissing':
    '{file} is no longer at the downloaded location, so nothing was run. Download it again.',
  'githubReleases.silentInstallRefusedNotAFile':
    'The downloaded location for {file} is not a file, so nothing was run.',
  'githubReleases.silentInstallRefusedSize':
    'The file at the downloaded location no longer matches the size of {file}, so nothing was run. Download it again.',
  'githubReleases.silentInstallRefusedName':
    'The downloaded location holds a different file from {file}, so nothing was run. Download it again.',
  'githubReleases.silentInstallRefusedKind':
    '{file} is not an installer this app runs, so nothing was run.',
  'githubReleases.silentInstallRefusedPlatform':
    'Unattended installation is available on Windows only, so nothing was run.',
  'githubReleases.sortLabel': 'Sort',
  'githubReleases.sortNewest': 'Newest first',
  'githubReleases.sortOldest': 'Oldest first',
  'cheapLfs.settings.sectionHeading': 'Large files & storage (Cheap LFS)',
  'cheapLfs.settings.autoMaterialize': 'Download large files after cloning',
  'cheapLfs.settings.autoPin': 'Pin large files when committing',
  'cheapLfs.settings.autoPinHelp':
    'Files over about 100 MB are uploaded to the selected Cheap LFS storage and replaced with small pointers. Failed files stay in Changes for the next commit while other selected safe changes continue.',
  'cheapLfs.settings.cloneHelper': 'Include the Windows and Linux clone helper',
  'cheapLfs.settings.cloneHelperHelp':
    'Enabled by default. Cheap LFS commits keep a managed Markdown guide and one-command Windows/Linux hydration scripts under .desktop-material/cheap-lfs. Turning this off stops future updates without deleting files already committed.',
  'cheapLfs.settings.summary':
    'Pinning uploads committed files over about 100 MB to the selected Cheap LFS storage and commits a small pointer instead. Uploads use the selected one-to-three lanes; retries use one lane, and failed files stay in Changes while safe files can still commit. GHCR and Docker Hub keep the repository object set in one digest-pinned OCI image, with tracked-key encryption for private repositories. The clone helper and Desktop Material restore selected pointers after cloning or pulling.',
  'cheapLfs.settings.parallelUploads': 'Simultaneous Cheap LFS uploads',
  'cheapLfs.settings.parallelUploadsHelp':
    'Choose 1, 2, or 3 upload lanes. Upload retries fall back to one lane; downloads keep their existing restore behavior.',
  'cheapLfs.settings.ghcrStorage': 'Store Cheap LFS in one GHCR image',
  'cheapLfs.settings.ghcrStorageHelp':
    'Publishes one digest-pinned OCI image for all repository objects. Private repositories encrypt objects with a shared key tracked in that private repository.',
  'cheapLfs.settings.storageProvider': 'Large-file storage',
  'cheapLfs.settings.storageRelease': 'GitHub published prerelease',
  'cheapLfs.settings.storageGhcr': 'GHCR · one OCI image',
  'cheapLfs.settings.storageDockerHub': 'Docker Hub · one OCI image',
  'cheapLfs.cloneHelper.conflictTitle':
    'Cheap LFS clone helper needs attention',
  'cheapLfs.cloneHelper.conflictBody':
    'Desktop Material left these non-managed files unchanged: {paths}. Move or rename them, then commit again to generate the managed Windows and Linux helper safely.',
  'cheapLfs.cloneHelper.failureTitle': 'Cheap LFS clone helper was not updated',
  'cheapLfs.cloneHelper.failureBody':
    'The uploaded Cheap LFS pointers remain valid, but Desktop Material could not safely update the managed Windows and Linux hydration helper. Review the repository files and retry the commit.',
  'cheapLfs.cloneSelection.rejectedTitle':
    'Selected Cheap LFS files were not downloaded',
  'cheapLfs.cloneSelection.rejectedBody':
    'The repository manifest, branch, account, or pointer files changed after selection ({reason}). The clone completed with its pointer files intact. Reopen Clone Repository and choose the assets again.',
  'cheapLfs.encryption.title': 'Release payload encryption',
  'cheapLfs.encryption.toggle': 'Encrypt new Release payloads with a password',
  'cheapLfs.encryption.help':
    'Encrypts new Cheap LFS payload content before it is uploaded to GitHub Releases. It is off by default and does not re-encrypt existing payloads.',
  'cheapLfs.encryption.metadataNotice':
    'Encryption protects payload contents at the provider. File names, paths, sizes, hashes, and commit history remain visible.',
  'cheapLfs.encryption.statusChecking': 'Checking Windows Credential Manager…',
  'cheapLfs.encryption.statusSaved':
    'A password is saved in Windows Credential Manager for this repository.',
  'cheapLfs.encryption.statusMissing':
    'No password is saved for this repository.',
  'cheapLfs.encryption.statusUnavailable':
    'Windows Credential Manager is unavailable. Passwords will not be saved.',
  'cheapLfs.encryption.setPassword': 'Set password…',
  'cheapLfs.encryption.changePassword': 'Change saved password…',
  'cheapLfs.encryption.forgetPassword': 'Forget saved password…',
  'cheapLfs.encryption.saved':
    'The password was saved in Windows Credential Manager.',
  'cheapLfs.encryption.notSaved':
    'The password was not saved. You will be prompted when an encrypted payload operation needs it.',
  'cheapLfs.encryption.saveUnavailable':
    'Windows Credential Manager could not save the password. It was not written anywhere else.',
  'cheapLfs.encryption.forgot':
    'The saved password was removed from Windows Credential Manager.',
  'cheapLfs.encryption.forgetMissing': 'There was no saved password to remove.',
  'cheapLfs.encryption.forgetUnavailable':
    'Windows Credential Manager could not remove the saved password.',
  'cheapLfs.encryption.dialog.encryptTitle': 'Set a Release payload password',
  'cheapLfs.encryption.dialog.commitTitle':
    'Password required before encrypted commit',
  'cheapLfs.encryption.dialog.decryptTitle':
    'Enter the Release payload password',
  'cheapLfs.encryption.dialog.changeTitle':
    'Change the saved Release payload password',
  'cheapLfs.encryption.dialog.forgetTitle': 'Forget the saved password?',
  'cheapLfs.encryption.dialog.staleForgetTitle':
    'Forget the password that did not work?',
  'cheapLfs.encryption.dialog.encryptDescription':
    'Enter the password for encrypting new Release payloads. Desktop Material cannot recover a lost password.',
  'cheapLfs.encryption.dialog.commitDescription.plain':
    'This commit is waiting for a password so its large files can be pinned and uploaded only as encrypted ciphertext. Cancel stops the commit before any upload starts. Desktop Material cannot recover a lost password.',
  'cheapLfs.encryption.dialog.commitDescription.light':
    'This commit is paused for a password: its large files will be pinned and uploaded only as encrypted ciphertext. Cancel stops the commit before any upload starts. Desktop Material cannot recover a lost password.',
  'cheapLfs.encryption.dialog.commitDescription.playful':
    'This commit is waiting at the encryption gate. Its large files will be pinned and uploaded only as encrypted ciphertext; Cancel stops the commit before any upload starts. Desktop Material cannot recover a lost password.',
  'cheapLfs.encryption.dialog.commitDescription.maximum':
    'This commit is at the encryption gate doing the secret handshake, and the gate still wants the password first. Its large files will be pinned and uploaded only as encrypted ciphertext; Cancel stops the commit before a single byte is uploaded. One part is said with a straight face: Desktop Material cannot recover a lost password — there is no locksmith.',
  'cheapLfs.encryption.dialog.decryptDescription':
    'Enter the password that was used to encrypt this Release payload.',
  'cheapLfs.encryption.dialog.changeDescription':
    'Set the password used for future encrypted payload operations. Existing payloads keep the password that encrypted them.',
  'cheapLfs.encryption.dialog.forgetDescription':
    'This removes the repository password from Windows Credential Manager. It does not decrypt, delete, or change any payload.',
  'cheapLfs.encryption.dialog.staleForgetDescription':
    'The saved password could not decrypt this payload. Remove it from Windows Credential Manager so the next attempt asks for another password.',
  'cheapLfs.encryption.dialog.irreversibleWarning':
    'If this password is lost, payloads encrypted with it cannot be recovered. There is no backdoor, reset, or support override.',
  'cheapLfs.encryption.dialog.password': 'Password',
  'cheapLfs.encryption.dialog.confirmPassword': 'Confirm password',
  'cheapLfs.encryption.dialog.remember': 'Save in Windows Credential Manager',
  'cheapLfs.encryption.dialog.rememberHelp':
    'Off by default. Saving lets anyone using this Windows account decrypt with the stored credential. Losing access to the account or its credential vault can still remove access.',
  'cheapLfs.encryption.dialog.irreversibleAck':
    'I understand that losing this password makes payloads encrypted with it unrecoverable.',
  'cheapLfs.encryption.dialog.forgetAck':
    'I understand that this removes the saved password and does not change any encrypted payload.',
  'cheapLfs.encryption.dialog.staleForgetAck':
    'I understand that this removes the password that failed and the next attempt will ask again.',
  'cheapLfs.encryption.dialog.passwordRequired': 'Enter a password.',
  'cheapLfs.encryption.dialog.passwordMismatch': 'The passwords do not match.',
  'cheapLfs.encryption.dialog.continue': 'Continue',
  'cheapLfs.encryption.dialog.forget': 'Forget password',
  'cheapLfs.encryption.dialog.cancel': 'Cancel',
  'password.visibilityToggle': 'Toggle password visibility',
  'remoteVerification.warningTitle': 'Remote URL needs attention',
  'remoteVerification.warningBody':
    'Desktop Material could not verify this repository’s remote URL. No push was attempted. Review the remote URL, then try again.',
  'remoteVerification.changeUrl': 'Change remote URL',
  'ignoredSubmodule.dialogTitle': 'Move ignored files into a local submodule',
  'ignoredSubmodule.openAction': 'Ignored files to a local submodule…',
  'ignoredSubmodule.openTooltip':
    'Copy files Git currently proves are ignored into a new local repository and add it as a submodule. The originals stay exactly where they are.',
  // The three bands are the funny-level voice (1-2 plain, 3 light, 4-5
  // playful). Every band states the same facts — only Git-proven ignored
  // files are listed, copies are verified, the originals are never touched,
  // and nothing is uploaded — because the voice moves and the facts never do.
  'ignoredSubmodule.intro.plain':
    'This lists only files Git currently proves are ignored. Selected files are copied into a new local repository, each copy is verified by size and SHA-256, and the repository is added as a submodule. Your original files stay byte-for-byte at their current paths. Nothing is uploaded, no remote is created, and nothing is pushed.',
  'ignoredSubmodule.intro.light':
    'Only files Git itself swears are ignored show up here. The ones you pick get copied into a new local repository, every copy is checked by size and SHA-256, and that repository is added as a submodule. Your originals stay byte-for-byte where they are. Nothing is uploaded, no remote is created, and nothing is pushed.',
  'ignoredSubmodule.intro.playful':
    'Only files Git will personally vouch for as ignored get in here — no guessing, no reading .gitignore over its shoulder. Whatever you tick gets copied into a brand-new local repository, every copy frisked for size and SHA-256, and that repository joins the family as a submodule. Your originals do not move one byte. Nothing is uploaded, no remote is created, and nothing is pushed.',
  'ignoredSubmodule.intro.maximum':
    'Entry is strictly guest-list: only files Git will swear under oath are ignored — no guessing, no reading .gitignore over anyone’s shoulder. Everything you tick is copied into a brand-new local repository, each copy weighed (size) and fingerprinted (SHA-256) at the door, and that repository joins the family as a submodule. Your originals do not move a single byte. Nothing is uploaded, no remote is created, and nothing is pushed — the entire party stays in your house.',
  'ignoredSubmodule.reviewLead.plain':
    'Review this before it runs. Every step below happens locally, in this order, and the copy proofs finish before anything is added to Git.',
  'ignoredSubmodule.reviewLead.light':
    'Have a proper look before this runs. Everything below happens locally, in this order, and every copy is proven before Git is asked to change anything.',
  'ignoredSubmodule.reviewLead.playful':
    'Last look before the button does something real. Everything below happens on this machine, in this order, and every copy has to pass its size and hash check before Git is allowed to touch a single index entry.',
  'ignoredSubmodule.reviewLead.maximum':
    'Final boarding call — past this button things happen for real. Every step below runs on this machine, in exactly this order, and each copy must ace both its size and hash exams before Git is allowed anywhere near a single index entry.',
  'ignoredSubmodule.loading': 'Asking Git which files it currently ignores…',
  'ignoredSubmodule.loadFailed':
    'Could not read the ignored files from Git: {error}',
  'ignoredSubmodule.empty':
    'Git does not currently prove any working file in this repository is ignored, so there is nothing to move.',
  'ignoredSubmodule.truncated':
    'Only the first {count} ignored files are listed. Narrow your ignore rules or move these first, then reopen this dialog for the rest.',
  'ignoredSubmodule.searchLabel': 'Search ignored files',
  'ignoredSubmodule.searchPlaceholder': 'Path, ignore rule, or pattern',
  'ignoredSubmodule.searchTarget': 'Ignored files',
  'ignoredSubmodule.noMatches': 'No ignored file matches this search.',
  'ignoredSubmodule.filterCount': '{visible} of {total} ignored files',
  'ignoredSubmodule.regexError':
    'Invalid regular expression: {message}. Every ignored file is still listed.',
  'ignoredSubmodule.listLabel': 'Ignored files Git proves are ignored',
  'ignoredSubmodule.proof': 'Ignored by {source}:{line} — {pattern}',
  'ignoredSubmodule.fileMeta': '{bytes} bytes',
  'ignoredSubmodule.selectAll': 'Select all listed',
  'ignoredSubmodule.clearSelection': 'Clear selection',
  'ignoredSubmodule.selectionSummary': '{count} files selected · {bytes} bytes',
  'ignoredSubmodule.destinationLabel': 'New submodule folder',
  'ignoredSubmodule.destinationHelp':
    'A repository-relative folder that does not exist yet and does not overlap an existing submodule. The new repository is created here.',
  'ignoredSubmodule.reviewAction': 'Review this operation',
  'ignoredSubmodule.reviewHeading': 'Confirm before anything changes',
  'ignoredSubmodule.reviewDestination': 'New submodule folder: {path}',
  'ignoredSubmodule.reviewFilesHeading':
    'These {count} files will be copied ({bytes} bytes)',
  'ignoredSubmodule.willHeading': 'What this will do',
  'ignoredSubmodule.willCopy':
    'Copy each listed file into {path}, keeping its exact relative path, and verify every copy by size and SHA-256.',
  'ignoredSubmodule.willCreate':
    'Create a new Git repository in {path} and make one commit there containing those verified copies.',
  'ignoredSubmodule.willAdd':
    'Add that repository to this repository as a submodule at {path}. The change is staged, not committed — you review and commit it yourself.',
  'ignoredSubmodule.willKeep':
    'Leave every original file byte-for-byte at its current path. Nothing is moved, linked, or truncated.',
  'ignoredSubmodule.willRecover':
    'Keep an independent copy of every original outside the working tree until all of them pass a final check, then delete those copies.',
  'ignoredSubmodule.wontHeading': 'What this will not do',
  'ignoredSubmodule.wontUpload':
    'It will not upload any Cheap LFS object or choose a storage provider.',
  'ignoredSubmodule.wontRemote':
    'It will not create a repository on GitHub or any other host, and will not add a remote.',
  'ignoredSubmodule.wontPointer':
    'It will not convert any file into a Cheap LFS pointer.',
  'ignoredSubmodule.wontCommit':
    'It will not commit in this repository and will not push anything anywhere.',
  'ignoredSubmodule.wontReplace':
    'It will not replace your original files with links.',
  'ignoredSubmodule.confirmAction': 'Copy files and add the submodule',
  'ignoredSubmodule.backAction': 'Back to the file list',
  'ignoredSubmodule.cancelAction': 'Cancel',
  'ignoredSubmodule.doneAction': 'Done',
  'ignoredSubmodule.progressHeading': 'Copying and verifying',
  'ignoredSubmodule.progressStatus': 'Verified {completed} of {total} files…',
  'ignoredSubmodule.progressLabel': 'Ignored file staging progress',
  'ignoredSubmodule.successHeading': 'Submodule added',
  'ignoredSubmodule.successDescription':
    '{count} verified copies ({bytes} bytes) are committed in the new repository at {path}, which is now staged as a submodule. Every original is unchanged at its original path. Review and commit the staged change when you are ready.',
  'ignoredSubmodule.rejectedHeading':
    'These files were refused and nothing was changed',
  'ignoredSubmodule.rejectedRow': '{path} — {reason}',
  'ignoredSubmodule.failedHeading': 'The operation stopped',
  'ignoredSubmodule.recoveryRetained':
    'Your original files were never written to. Independent copies are still available at {path}.',
  'ignoredSubmodule.notification.startedTitle': 'Staging ignored files',
  'ignoredSubmodule.notification.startedBody':
    'Copying and verifying {count} ignored files into {path}. Originals are left untouched.',
  'ignoredSubmodule.notification.succeededTitle': 'Local submodule created',
  'ignoredSubmodule.notification.succeededBody':
    '{count} verified copies are committed in {path} and the submodule is staged. Every original is unchanged. Nothing was uploaded or pushed.',
  'ignoredSubmodule.notification.failedTitle': 'Ignored file staging stopped',
  'ignoredSubmodule.notification.failedBody':
    'Nothing was added to this repository. {error}',
  'ignoredSubmodule.reason.notProvenIgnored':
    'Git does not currently prove this path is ignored — a tracked file never can be.',
  'ignoredSubmodule.reason.symbolicLink':
    'This path is a link or junction, which is never followed.',
  'ignoredSubmodule.reason.reparsePoint':
    'This path reaches its content through a reparse point, junction, or mount point, so its bytes do not live where the path says.',
  'ignoredSubmodule.reason.notRegularFile': 'This path is not a regular file.',
  'ignoredSubmodule.reason.gitControlPath':
    'This path is inside a Git control directory.',
  'ignoredSubmodule.reason.nestedRepository':
    'This path is inside another Git repository.',
  'ignoredSubmodule.reason.pathEscape': 'This path leaves the repository root.',
  'ignoredSubmodule.reason.duplicateSelection':
    'This path was selected more than once.',
  'ignoredSubmodule.reason.destinationCollision':
    'This path would collide with another selected file at the destination, which Windows treats as the same name.',
  'ignoredSubmodule.reason.insideDestination':
    'This path is inside the new submodule folder.',
  'ignoredSubmodule.reason.staleInventory':
    'This file changed since it was listed, so the bytes you reviewed are no longer the bytes on disk.',
  'ignoredSubmodule.destination.empty': 'Enter a folder for the new submodule.',
  'ignoredSubmodule.destination.absolute':
    'Enter a folder relative to this repository, not an absolute path.',
  'ignoredSubmodule.destination.segments':
    'The folder cannot contain empty, current-directory, or parent-directory segments.',
  'ignoredSubmodule.destination.gitControlPath':
    'The folder cannot use Git control directories.',
  'ignoredSubmodule.destination.existingSubmodule':
    'The folder overlaps a submodule this repository already has.',
  'ignoredSubmodule.destination.repositoryRoot':
    'The folder cannot be the repository root itself.',
  'ignoredSubmodule.destination.unsafeLink':
    'The folder is a link, junction, or mount point and is never followed.',
  'ignoredSubmodule.destination.occupied':
    'The folder already exists and is not empty. Choose one that does not exist yet.',
  'ignoredSubmodule.destination.ignored':
    'Git ignores this folder, so it cannot hold a submodule. Choose a folder your ignore rules do not match.',
  'cheapLfs.pinFailures.title': 'Some large files were not pinned',
  'cheapLfs.pinFailures.one':
    '{names} remains in Changes and was excluded so its raw large-file content is not committed. Other selected safe changes can continue now; commit again to retry this file.',
  'cheapLfs.pinFailures.many':
    '{count} large files ({names}) remain in Changes and were excluded from this commit. Other selected safe changes can continue now; commit again to retry these files.',
  'cheapLfs.pinFailures.manyOmitted':
    '{count} large files ({names}, plus {omitted} more) remain in Changes and were excluded from this commit. Other selected safe changes can continue now; commit again to retry these files.',
  'cheapLfs.pinFailures.reason': ' Reason: {reason}',
  'cheapLfs.pinFailures.reasonWithStatus': ' Reason: HTTP {status} — {reason}',
  'cheapLfs.alreadyStored.title': 'Some large files were already stored',
  'cheapLfs.alreadyStored.one':
    '{names} was left out of this commit: its bytes were verified to be exactly the large file the committed pointer already names, so nothing was uploaded and the commit already holds that pointer.',
  'cheapLfs.alreadyStored.many':
    '{count} large files ({names}) were left out of this commit: their bytes were verified to be exactly the large files the committed pointers already name, so nothing was uploaded and the commit already holds those pointers.',
  'cheapLfs.alreadyStored.manyOmitted':
    '{count} large files ({names}, plus {omitted} more) were left out of this commit: their bytes were verified to be exactly the large files the committed pointers already name, so nothing was uploaded and the commit already holds those pointers.',
  'cheapLfs.firstPublish.noRepository':
    'This repository is not connected to a GitHub repository, so no release can hold its large files. Publish the repository to GitHub, then commit again.',
  'cheapLfs.firstPublish.noRemote':
    'This repository has no push remote, so a release cannot be anchored to a published commit. Add a remote and publish the branch, then commit again.',
  'cheapLfs.firstPublish.detachedHead':
    'HEAD is detached, so there is no branch to publish before a release is created. Check out a branch, then commit again.',
  'cheapLfs.firstPublish.unbornBranch':
    'This branch has no commit yet, so there is nothing to publish for a release to point at. Make an ordinary first commit, then commit the large files.',
  'cheapLfs.firstPublish.publishFailed':
    'The branch could not be published before uploading, so the release has no commit to point at. Publish this branch, then commit again.',
  'cheapLfs.firstPublish.reasonWithDetail': '{reason} Git reported: {detail}',
  'cheapLfs.firstPublish.abortTitle':
    'Commit stopped before the branch was published',
  'cheapLfs.unattendedEncryption.title':
    'Automatic commit did not pin large files',
  'cheapLfs.unattendedEncryption.reason':
    'Windows Credential Manager had no usable saved password. This file stayed unchanged in the working tree and out of the commit; it was not encrypted or uploaded, and no Release anchor was created. Retry interactively to enter the password, or save it in Repository settings > Large files & storage.',
  'cheapLfs.unattendedEncryption.body.plain':
    'Windows Credential Manager has no usable saved password. Nothing was encrypted or uploaded; no Release anchor was created. Unchanged and out of the commit: {names} ({count} total). Other selected changes remain eligible. Retry interactively, or save it in Repository settings > Large files & storage.',
  'cheapLfs.unattendedEncryption.body.light':
    'No usable saved password was available in Windows Credential Manager, so the unattended commit stopped. Nothing was encrypted or uploaded; no Release anchor was created. Unchanged and out of the commit: {names} ({count} total). Other changes remain eligible. Retry interactively, or save it in Repository settings > Large files & storage.',
  'cheapLfs.unattendedEncryption.body.playful':
    'The unattended commit found no usable saved key in Windows Credential Manager and left the lock alone. Nothing was encrypted or uploaded; no Release anchor was created. Unchanged and out of the commit: {names} ({count} total). Other changes remain eligible. Retry interactively, or save it in Repository settings > Large files & storage.',
  'cheapLfs.unattendedEncryption.body.maximum':
    'The unattended commit found no usable saved password in Windows Credential Manager and refused to guess. Nothing was encrypted or uploaded; no Release anchor was created. Unchanged and out of the commit: {names} ({count} total). Other changes remain eligible. Retry interactively, or save it in Repository settings > Large files & storage.',
  'cheapLfs.localState.pointer': 'Pointer stored locally',
  'cheapLfs.localState.materialized':
    'Materialized locally · verified against the committed pointer',
  'cheapLfs.localState.modified':
    'Local bytes changed · the next commit uploads them as a new release asset. The asset the committed pointer names is left untouched, so older commits still restore their own version.',
  'actionsMetadata.tooLarge.title': 'Some GitHub Actions data was skipped',
  'actionsMetadata.tooLarge.body':
    'GitHub returned more Actions metadata than this app reads in one response, so that check was skipped. Nothing else is affected and no action is needed.',
  'actionsArtifacts.searchPlaceholder':
    'Filter artifacts by name, workflow, branch, or commit…',
  'actionsArtifacts.searchAriaLabel': 'Filter workflow artifacts',
  'actionsArtifacts.regexTarget': 'Workflow artifacts',
  'actionsArtifacts.filterCount':
    'Showing {loaded} loaded of {total} artifacts · {visible} visible.',
  'actionsArtifacts.noMatches':
    'No workflow artifacts match the current filter.',
  'commit.postCommitMaintenance.title':
    'Commit created; maintenance needs attention',
  'commit.postCommitMaintenance.body':
    'The commit was created successfully, but Git reported a later maintenance problem. It is safe to push; run repository maintenance separately when convenient.',
  'push.commitBatch.message': 'Automatic push batch {current} of {total}',
  'push.commitBatch.completedTitle': 'Large local push completed in batches',
  'push.commitBatch.existingBody':
    'Pushed and verified {count} existing local commit batches before continuing.',
  'push.commitBatch.rewrittenBody':
    'Safely rebuilt oversized local-only history, then pushed and verified {count} batches without force-pushing.',
  'changesFilter.cheapLfsCandidates': 'Cheap LFS candidates (>100 MiB)',
  'changesFilter.filtersAriaLabel': 'Change filters',
  'workflowDispatch.searchPlaceholder': 'Filter workflows by name or file…',
  'workflowDispatch.searchAriaLabel': 'Filter workflows',
  'workflowDispatch.listAriaLabel': 'Workflows',
  'workflowDispatch.empty': 'No workflows available.',
  'workflowDispatch.noMatches': 'No workflows match the current filter.',
  'workflowDispatch.stateActive': 'Active',
  'workflowDispatch.stateDisabled': 'Disabled',
  'publish.organization.label': 'Organization',
  'publish.organization.searchPlaceholder': 'Search organizations…',
  'publish.organization.searchAriaLabel': 'Search organizations',
  'publish.organization.listAriaLabel': 'Organizations',
  'publish.organization.none': 'None — publish to my personal account',
  'publish.organization.resultCountOne': '1 destination found',
  'publish.organization.resultCountMany': '{count} destinations found',
  'publish.organization.noMatches':
    'No publishing destinations match the current search.',
  'publish.organization.selectedHint': 'Selected',
  'publish.organization.regexErrorPrefix': 'Pattern error:',
  'publish.organization.loadError':
    'Organizations could not be loaded. You can still publish to your personal account.',
  'publish.organization.retry': 'Retry loading organizations',
  'publish.authentication.signInAgain': 'Sign in again',
  'publish.authentication.signInAgainMessage':
    'Your GitHub.com sign-in was refused. Sign in again, then choose Publish repository to retry this publication.',
  'settingsSearch.inputLabel': 'Search settings',
  'settingsSearch.inputPlaceholder': 'Search settings',
  'settingsSearch.resultsHeading': 'Search results',
  'settingsSearch.noResults': 'No settings match “{query}”.',
  'settingsSearch.resultCountOne': '1 setting found',
  'settingsSearch.resultCountMany': '{count} settings found',
  'settingsSearch.inTab': 'in {tab}',
  'settingsSearch.clear': 'Clear settings search',
  'settingsSearch.jumpHint': 'Press Enter to open the setting’s tab.',
  'settingsSearch.tabName.accounts': 'Accounts',
  'settingsSearch.tabName.integrations': 'Integrations',
  'settingsSearch.tabName.copilot': 'Copilot',
  'settingsSearch.tabName.git': 'Git',
  'settingsSearch.tabName.appearance': 'Appearance',
  'settingsSearch.tabName.notifications': 'Notifications',
  'settingsSearch.tabName.prompts': 'Prompts',
  'settingsSearch.tabName.advanced': 'Advanced',
  'settingsSearch.tabName.accessibility': 'Accessibility',
  'settingsSearch.tabName.agentAccess': 'Agent access',
  'settingsSearch.tabName.selfHostedServer': 'Self-hosted server',
  'settingsSearch.tabName.automation': 'Automation',
  'settingsSearch.tabName.queue': 'Clone queue',
  'settingsSearch.tabName.sound': 'Sound',
  'settingsSearch.tabName.ollama': 'Ollama',
  'settingsSearch.tabName.ai': 'AI',
  'settingsSearch.tabName.attention': 'Attention accommodations',
  'settingsSearch.entry.attentionFocus.title': 'Focus',
  'settingsSearch.entry.attentionFocus.desc':
    'De-emphasize inactive regions while keeping them available.',
  'settingsSearch.entry.attentionLowStimulation.title': 'Low stimulation',
  'settingsSearch.entry.attentionLowStimulation.desc':
    'Reduce non-essential motion, colour intensity, and sound.',
  'settingsSearch.entry.attentionTimeAwareness.title': 'Time awareness',
  'settingsSearch.entry.attentionTimeAwareness.desc':
    'Show elapsed session time and time since activity.',
  'settingsSearch.entry.attentionOneThing.title': 'One thing at a time',
  'settingsSearch.entry.attentionOneThing.desc':
    'Keep one user-chosen next action visible.',
  'settingsSearch.entry.attentionMomentum.title': 'Momentum',
  'settingsSearch.entry.attentionMomentum.desc':
    'Offer a dismissible inactivity prompt with a defer interval.',
  'settingsSearch.entry.aiMasterSwitch.title': 'AI kill switch',
  'settingsSearch.entry.aiMasterSwitch.desc':
    'Turn AI features on or off, and choose which providers are permitted.',
  'settingsSearch.entry.aiRepositoryEligibility.title':
    'Repository AI eligibility',
  'settingsSearch.entry.aiRepositoryEligibility.desc':
    'Set the default whether repositories may send diffs to an AI provider.',
  'settingsSearch.entry.accountsSignIn.title': 'Sign in to GitHub',
  'settingsSearch.entry.accountsSignIn.desc':
    'Add a GitHub.com account to Desktop Material.',
  'settingsSearch.entry.accountsEnterprise.title': 'GitHub Enterprise sign in',
  'settingsSearch.entry.accountsEnterprise.desc':
    'Connect a GitHub Enterprise Server account.',
  'settingsSearch.entry.copilotModels.title': 'Copilot models',
  'settingsSearch.entry.copilotModels.desc':
    'Choose which AI models Copilot uses for each feature.',
  'settingsSearch.entry.copilotConflict.title':
    'Use Copilot for conflict resolution',
  'settingsSearch.entry.copilotConflict.desc':
    'Let Copilot help resolve merge conflicts automatically.',
  'settingsSearch.entry.ollamaManager.title': 'Ollama local models',
  'settingsSearch.entry.ollamaManager.desc':
    'Connect a loopback Ollama endpoint, then pull, inspect, run, and remove local models.',
  'settingsSearch.entry.ollamaChat.title': 'Ollama chat',
  'settingsSearch.entry.ollamaChat.desc':
    'Chat with a local Ollama model without leaving Desktop Material.',
  'settingsSearch.entry.selfHostedServer.title': 'Self-hosted server',
  'settingsSearch.entry.selfHostedServer.desc':
    'Set up, join, and sign in to the Docker-hosted team server on your own machine.',
  'settingsSearch.entry.gitGlobalIgnore.title': 'Global ignore',
  'settingsSearch.entry.gitGlobalIgnore.desc':
    'Edit the ignore rules (core.excludesFile) that apply to every repository.',
  'settingsSearch.entry.gitHooks.title': 'Git hooks',
  'settingsSearch.entry.gitHooks.desc':
    'Hook environment and cache settings for pre-commit and other hooks.',
  'settingsSearch.entry.gitName.title': 'Name',
  'settingsSearch.entry.gitName.desc':
    'The author name written to your commits.',
  'settingsSearch.entry.gitEmail.title': 'Email',
  'settingsSearch.entry.gitEmail.desc':
    'The author email address written to your commits.',
  'settingsSearch.entry.gitDefaultBranch.title': 'Default branch',
  'settingsSearch.entry.gitDefaultBranch.desc':
    'The branch name used when creating new repositories.',
  'settingsSearch.entry.appearanceTheme.title': 'Theme',
  'settingsSearch.entry.appearanceTheme.desc':
    'Switch between light, dark, and system themes.',
  'settingsSearch.entry.appearanceAccent.title': 'Accent color',
  'settingsSearch.entry.appearanceAccent.desc':
    'Pick the seed color used across the interface.',
  'settingsSearch.entry.appearanceFont.title': 'Interface font',
  'settingsSearch.entry.appearanceFont.desc':
    'Choose the UI font family, size, and weight.',
  'settingsSearch.entry.appearanceZoom.title': 'Zoom',
  'settingsSearch.entry.appearanceZoom.desc':
    'Scale the whole interface up or down.',
  'settingsSearch.entry.notificationsErrorStyle.title': 'Error display style',
  'settingsSearch.entry.notificationsErrorStyle.desc':
    'Show errors as a banner or a dialog.',
  'settingsSearch.entry.promptsDiscard.title': 'Confirm discarding changes',
  'settingsSearch.entry.promptsDiscard.desc':
    'Ask before discarding uncommitted changes.',
  'settingsSearch.entry.promptsForcePush.title': 'Confirm force push',
  'settingsSearch.entry.promptsForcePush.desc':
    'Ask before force-pushing to a remote.',
  'settingsSearch.entry.promptsRemoveRepo.title': 'Confirm removing repository',
  'settingsSearch.entry.promptsRemoveRepo.desc':
    'Ask before removing a repository from the list.',
  'settingsSearch.entry.advancedOpenSSH.title': 'Use system OpenSSH',
  'settingsSearch.entry.advancedOpenSSH.desc':
    'Use the operating system’s OpenSSH client instead of the bundled one.',
  'settingsSearch.entry.accessibilityUnderline.title': 'Underline links',
  'settingsSearch.entry.accessibilityUnderline.desc':
    'Always underline links for easier recognition.',
  'settingsSearch.entry.accessibilityDiffMarks.title': 'Diff check marks',
  'settingsSearch.entry.accessibilityDiffMarks.desc':
    'Show +/− marks in diffs so color is not the only cue.',
  'settingsSearch.entry.agentAccessServer.title': 'Agent access server',
  'settingsSearch.entry.agentAccessServer.desc':
    'Let local agents and MCP tools talk to Desktop Material.',
  'settingsSearch.entry.queueMode.desc':
    'Clone queued repositories in parallel or one at a time.',
  'gitAutoFix.fixIt': 'Fix it',
  'gitAutoFix.staleIndexLock.title': 'Repository is locked',
  'gitAutoFix.staleIndexLock.summary':
    'A leftover index.lock is blocking Git. If no Git process is running, the stale lock can be removed and the operation retried.',
  'gitAutoFix.staleIndexLock.action': 'Remove lock file',
  'gitAutoFix.autoGcRetry.title': 'Background maintenance stalled',
  'gitAutoFix.autoGcRetry.summary':
    'Git background packing or maintenance interrupted the operation. It can be retried with automatic maintenance disabled.',
  'gitAutoFix.pushNonFastForward.title': 'Push rejected (out of date)',
  'gitAutoFix.pushNonFastForward.summary':
    'The remote has commits your branch does not. Integrate them with fetch and rebase, or pull, then push again. Force-pushing is never done automatically.',
  'gitAutoFix.pushForbiddenGithubCli.title': 'Push was forbidden (403)',
  'gitAutoFix.pushForbiddenGithubCli.summary':
    'The remote refused the push. Desktop can retry once using your GitHub CLI credentials, without changing which account gh uses.',
  'gitAutoFix.detachedHeadRescueBranch.title': 'Commit is on a detached HEAD',
  'gitAutoFix.detachedHeadRescueBranch.summary':
    'This commit is not on any branch and could be lost. Create a rescue branch to keep it.',
  'gitAutoFix.detachedHeadRescueBranch.action': 'Create rescue branch',
  'gitAutoFix.unknown.title': 'Git operation failed',
  'gitAutoFix.unknown.summary':
    'Desktop does not have an automatic fix for this error. Review the details and resolve it manually.',
  'gitAutoFix.unknown.action': 'View details',
  'gitAutoFix.rescueBranch.successTitle': 'Rescue branch created',
  'gitAutoFix.rescueBranch.successBody': 'Your commit was saved on {branch}.',
  'gitAutoFix.rescueBranch.failureTitle': 'Could not create rescue branch',
  'gitAutoFix.rescueBranch.failureBody':
    'The rescue branch could not be created: {error}',
  'largeRepo.settings.title': 'Large repository handling',
  'largeRepo.settings.autoDetect': 'Detect large repositories automatically',
  'largeRepo.settings.autoDetectDescription':
    'Above {files} files, suppress background gc and maintenance on this repository’s Git operations so a long repack never stalls status, add, checkout, or fetch.',
  'largeRepo.settings.autoRepack': 'Repack large repositories when idle',
  'largeRepo.settings.autoRepackDescription':
    'Run one controlled git repack at a quiet moment, with a non-blocking progress notification.',
  'largeRepo.status.computing': 'Checking for local changes…',
  'largeRepo.repack.progressTitle': 'Optimizing large repository',
  'largeRepo.repack.progressBody': 'Repacking {name} in the background…',
  'largeRepo.repack.successTitle': 'Repository optimized',
  'largeRepo.repack.successBody': '{name} was repacked.',
  'largeRepo.repack.failedTitle': 'Could not optimize repository',
  'largeRepo.repack.failedBody': 'Repacking {name} failed: {error}',
  'largeRepo.lock.removedTitle': 'Cleared a stale lock',
  'largeRepo.lock.removedBody':
    'A leftover index.lock in {name} was removed before continuing.',
  'largeRepo.missing.title': 'Repository missing on disk',
  'largeRepo.missing.body':
    '{name} could not be found on disk. Background updates are paused. Locate the folder or remove it from Desktop Material.',
  'largeRepo.missing.locate': 'Locate…',
  'largeRepo.missing.remove': 'Remove',
  'largeRepo.nestedGit.title': 'Nested Git repositories found',
  'largeRepo.nestedGit.body':
    'Found {count} nested .git folder(s) in {name}. Compress them into {archive} to speed up Git operations?',
  'largeRepo.nestedGit.confirm': 'Compress nested repositories',
  'largeRepo.nestedGit.cancel': 'Keep as-is',
  'settingsSearch.entry.largeRepoAutoDetect.title': 'Detect large repositories',
  'settingsSearch.entry.largeRepoAutoDetect.desc':
    'Suppress background gc and maintenance on big repositories automatically.',
  'settingsSearch.entry.largeRepoAutoRepack.title': 'Repack large repositories',
  'settingsSearch.entry.largeRepoAutoRepack.desc':
    'Run one controlled repack at a quiet moment with a progress notification.',
  'accountFallback.searching':
    'Checking your other signed-in accounts for {repository}…',
  'accountFallback.usingAccount': 'Using {account}',
  'accountFallback.switchedTitle': 'Used a different account',
  'accountFallback.switchedBody':
    '{repository} is visible to {account}, so that account was used.',
  'accountFallback.askTitle': 'Another account can see this repository',
  'accountFallback.askBody':
    '{repository} was not found with the current account, but {account} can see it.',
  'accountFallback.askAction': 'Use {account}',
  'accountFallback.notFoundTitle': 'Repository not found',
  'accountFallback.notFoundBody':
    '{repository} could not be found with any of your signed-in accounts.',
  'accountFallback.notFoundNoAccounts':
    '{repository} could not be found, and no other account is signed in for this host.',
  'accountFallback.triedAccounts': 'Accounts tried: {accounts}.',
  'shallowHistory.progress.label': 'Fetching older history',
  'shallowHistory.progress.contacting': 'Contacting the remote',
  'shallowHistory.progress.step': '{step}…',
  'shallowHistory.progress.detail': '{step}: {value} of {total}',
  'shallowHistory.progress.valueText': '{step}, {percent} percent complete',
  'shallowHistory.progress.valueTextCounted':
    '{step}, {value} of {total}, {percent} percent complete',
  'tagLifecycle.progressLabel': 'Tag operation progress',
  'tagLifecycle.workingStatus': 'Working on the reviewed tag operation…',
  'tagLifecycle.refreshingStatus': 'Refreshing the tag inventory…',
  'tagLifecycle.creatingStatus': 'Creating local tag {name}…',
  'tagLifecycle.movingStatus': 'Moving local tag {name}…',
  'tagLifecycle.deletingLocalStatus': 'Deleting local tag {name}…',
  'tagLifecycle.pushingStatus': 'Pushing tag {name}…',
  'tagLifecycle.pushingAllStatus': 'Pushing {count} local tags…',
  'tagLifecycle.fetchingStatus': 'Fetching tags from {remote}…',
  'tagLifecycle.fetchingPrunedStatus':
    'Fetching and pruning tags from {remote}…',
  'tagLifecycle.deletingRemoteStatus': 'Deleting remote tag {name}…',
  'remoteManager.applyProgressLabel': 'Applying remote changes',
  'remoteManager.applyProgressStatus':
    'Applying remote change {index} of {total}…',
  'remoteManager.applyProgressPreparing': 'Reading the current remote layout…',
  'bulkBranchDelete.progressLabel': 'Deleting branches',
  'bulkBranchDelete.progressStatus': 'Deleted {completed} of {total} branches…',
  'bulkBranchDelete.progressCurrent': 'Deleting {name}…',
  'subtree.splitProgressLabel': 'Splitting subtree history',
  'subtree.splitProgressCommits': '{processed} of {total} commits rewritten',
  'bisect.progressLabel': 'Bisect step progress',
  'bisect.progressStarting': 'Starting the bisect session…',
  'bisect.progressMarking':
    'Recording the verdict and checking out the next commit…',
  'bisect.progressResetting': 'Ending the session and restoring your branch…',
  'bisect.progressLogLabel': 'Bisect command output',
  'commitRewrite.progressLabel': 'Rewriting commits',
  'commitRewrite.progressStatus':
    'Replaying commit {index} of {total}: {summary}',
  'commitRewrite.progressPreparing': 'Preparing the rewrite sequence…',
  'commit.maintenance.repacking': 'Repacking the repository after the batches…',
  'commit.maintenance.repackingLabel': 'Repository repack progress',
  'ollama.manager.operationProgressLabel': 'Ollama operation progress',
  'ollama.manager.operationLoading': 'Loading {model} into memory…',
  'ollama.manager.operationUnloading': 'Unloading {model} from memory…',
  'ollama.manager.operationDeleting': 'Deleting {model}…',
  'ollama.manager.operationCopying': 'Copying {model}…',
  'ollama.manager.operationRenaming': 'Renaming {model}…',
  'ollama.manager.operationCancelled': 'Model operation stopped.',
  'addRepositories.progressLabel': 'Adding repositories',
  'addRepositories.progressStatus': 'Adding {name} — {index} of {total}',
  'notificationCentre.bulkProgressLabel': 'Notification triage progress',
  'notificationCentre.bulkProgressStatus':
    'Updated {completed} of {total} notifications…',
  'notificationCentre.clearAllProgressStatus':
    'Marking {completed} of {total} notifications done…',
  'cheapLfs.stage.hashingLabel': 'Hashing progress',
  'cheapLfs.stage.hashingStatus': 'Hashing {path}…',
  'cheapLfs.stage.releaseLabel': 'Release preparation progress',
  'cheapLfs.stage.releaseStatus': 'Preparing release bucket…',
  'cheapLfs.restore.label': 'Restoring large files',
  'cheapLfs.restore.status':
    'Restoring large files — {files} files, {bytes} transferred',
  'cheapLfs.restore.cancel': 'Stop restoring',
  'cheapLfs.restore.canceling': 'Stopping…',
  'cheapLfs.restore.collapse': 'Collapse restore progress details',
  'cheapLfs.restore.expand': 'Expand restore progress details',
  'cheapLfs.restore.title': 'Large-file restore',
  'cheapLfs.restore.sectionLabel':
    'Large-file restore progress for {repository}',
  'cheapLfs.restore.summary':
    'Restore {percent}% · {succeeded} succeeded · {failed} failed · {remaining} remaining',
  'cheapLfs.restore.progressLabel': 'Overall large-file restore progress',
  'cheapLfs.restore.progressValueText':
    '{processed} of {total} restored, {percent}%; {succeeded} succeeded, {failed} failed, {remaining} remaining',
  'cheapLfs.restore.filesLabel': 'Files',
  'cheapLfs.restore.filesValue':
    '{succeeded} succeeded · {failed} failed · {remaining} remaining · {total} total',
  'cheapLfs.restore.logicalBytesLabel': 'Original file data',
  'cheapLfs.restore.logicalBytesValue': '{processed} / {total}',
  'cheapLfs.restore.actualBytesLabel': 'Network download',
  'cheapLfs.restore.downloadWithTotal': '{downloaded} / {total}',
  'cheapLfs.restore.downloadWithoutTotal':
    '{downloaded} downloaded · total not reported',
  'cheapLfs.restore.downloadTotalOnly':
    'Total {total} · waiting for first byte',
  'cheapLfs.restore.notReported': 'Not reported by this provider',
  'cheapLfs.restore.rateLabel': 'Download rate',
  'cheapLfs.restore.rateValue': '{rate}',
  'cheapLfs.restore.ratePending': 'Measuring…',
  'cheapLfs.restore.etaLabel': 'Time remaining',
  'cheapLfs.restore.etaPending': 'Calculating…',
  'cheapLfs.restore.elapsedLabel': 'Elapsed',
  'cheapLfs.restore.queueLabel': 'Waiting queue',
  'cheapLfs.restore.queueValue': '{files} files · {parts} parts',
  'cheapLfs.restore.lookAheadStarts':
    'Next download starts when this lane reaches exactly {percent}%.',
  'cheapLfs.restore.lookAheadStarting':
    'This lane reached {percent}%; starting the next download…',
  'cheapLfs.restore.lookAheadActive':
    'Next download is already running — it started at {percent}%.',
  'cheapLfs.restore.lookAheadBoundary':
    'Look-ahead boundary: {percent}% · nothing else is queued.',
  'cheapLfs.restore.currentLane': 'Restoring now',
  'cheapLfs.restore.prefetchLane': 'Next download',
  'cheapLfs.restore.laneGroupLabel': '{lane}: {path}',
  'cheapLfs.restore.laneFile': 'File {current}/{total}',
  'cheapLfs.restore.lanePart': 'Part {current}/{total}',
  'cheapLfs.restore.laneProgressLabel': 'Download progress for {path}',
  'cheapLfs.restore.laneValueText':
    '{processed} of {total} downloaded for {path}, {percent}%',
  'cheapLfs.restore.laneValueIndeterminate':
    '{processed} downloaded for {path}; total not reported',
  'cheapLfs.restore.laneBytes': '{processed} / {total}',
  'cheapLfs.restore.laneBytesWithoutTotal': '{processed} downloaded',
  'cheapLfs.restore.laneWaiting': 'Waiting for the first provider lane…',
  'cheapLfs.restore.pathUnavailable': 'Path unavailable',
  'cheapLfs.restore.failuresLabel': 'Restore failures',
  'cheapLfs.restore.failureReason': 'Reason: {reason}',
  'cheapLfs.restore.failureReasonWithStatus':
    'HTTP {status} · reason: {reason}',
  'cheapLfs.restore.failureUnknown': 'The provider did not report a reason.',
  'cheapLfs.restore.failuresOmitted': '{count} more failures are not shown.',
  'cheapLfs.restore.providerBadge': 'Provider: {provider}',
  'cheapLfs.restore.phaseBadge': 'Phase: {phase}',
  'cheapLfs.restore.provider.githubRelease': 'GitHub Releases',
  'cheapLfs.restore.provider.ghcr': 'GHCR',
  'cheapLfs.restore.provider.dockerHub': 'Docker Hub',
  'cheapLfs.restore.provider.mixed': 'Mixed providers',
  'cheapLfs.restore.provider.unknown': 'Provider pending',
  'cheapLfs.restore.phase.preparing': 'Preparing',
  'cheapLfs.restore.phase.downloading': 'Downloading',
  'cheapLfs.restore.phase.decompressing': 'Decompressing',
  'cheapLfs.restore.phase.decrypting': 'Decrypting',
  'cheapLfs.restore.phase.decrypting.plain': 'Decrypting',
  'cheapLfs.restore.phase.decrypting.light': 'Securely decrypting',
  'cheapLfs.restore.phase.decrypting.playful': 'Decrypting the locked bytes',
  'cheapLfs.restore.phase.decrypting.maximum':
    'Sweet-talking the ciphertext into opening up',
  'cheapLfs.restore.phase.verifying': 'Verifying',
  'cheapLfs.restore.phase.materializing': 'Restoring',
  'cheapLfs.restore.phase.canceling': 'Stopping',
  'batchClone.finalizingLabel': 'Finishing the cloned repositories',
  'batchClone.finalizingStatus': 'Registering {index} of {total} repositories…',
  'batchClone.restoringStatus': 'Restoring large files in {name}…',
  'accounts.metadataReadFailed':
    'Desktop Material could not read saved account metadata. You may need to sign in again.',
  'accounts.metadataRepaired':
    'Desktop Material repaired invalid saved account metadata. You may need to sign in again.',
  'accounts.metadataWriteFailed':
    'Desktop Material could not save account metadata. Your accounts remain available in this window.',
  'accounts.keychainLocked':
    "{app} was unable to store the token for {login} in the keychain. Please check you have unlocked access to the 'login' keychain, then sign in again.",
  'accounts.tokenWriteFailed':
    'Desktop Material could not save the sign-in token for {login}, so that account was not added. Please sign in again. ({error})',
  'accounts.credentialUnavailable':
    'Desktop Material could not read the saved sign-in token for {logins}. Please sign in again to restore access.',
  'accounts.picker.label': 'Accounts',
  'accounts.picker.choose': 'Choose an account',
  'accounts.picker.close': 'Close account picker',
  'accounts.picker.title': 'Accounts · {host}',
  'accounts.picker.searchLabel': 'Search accounts',
  'accounts.picker.searchPlaceholder':
    'Search accounts by name, login, or host',
  'accounts.picker.countOne': '{count} signed-in account',
  'accounts.picker.countMany': '{count} signed-in accounts',
  'accounts.picker.matchCount': '{matched} of {total} accounts match',
  'accounts.picker.noAccounts': 'No signed-in accounts.',
  'accounts.picker.noMatch': 'No accounts match “{query}”.',
  'accounts.picker.add': 'Add another account',
  'repositoryTransfer.importTitle': 'Import repository list',
  'repositoryTransfer.exportTitle': 'Export repository list',
  'repositoryTransfer.chooseList': 'Choose a repository list file to import.',
  'repositoryTransfer.fileFilterName': 'Repository list',
  'repositoryTransfer.chooseFile': 'Choose File…',
  'repositoryTransfer.changeFile': 'Change…',
  'repositoryTransfer.baseDirectory': 'Base directory',
  'repositoryTransfer.baseDirectoryPlaceholder': 'Clone destination',
  'repositoryTransfer.chooseDirectory': 'Choose…',
  'repositoryTransfer.cloneMode': 'Clone mode:',
  'repositoryTransfer.parallel': 'Parallel',
  'repositoryTransfer.sequential': 'One at a time',
  'repositoryTransfer.selectedOne': '{selected} of {total} selected',
  'repositoryTransfer.selectedMany': '{selected} of {total} selected',
  'repositoryTransfer.selectAtLeastOne': 'Select at least one repository.',
  'repositoryTransfer.chooseBaseDirectory': 'Choose a base directory.',
  'repositoryTransfer.invalidList':
    'That file is not a valid repository list export.',
  'repositoryTransfer.selectForImport': 'Select {url} for import',
  'repositoryTransfer.alreadyCloned': 'Already cloned',
  'repositoryTransfer.cloneOne': 'Clone {count} repository',
  'repositoryTransfer.cloneMany': 'Clone {count} repositories',
  'repositoryTransfer.exportIntro':
    'Only remote URLs are exported. Local paths and account tokens are never written to the file.',
  'repositoryTransfer.noRemote': 'No portable remote URL — cannot be exported',
  'repositoryTransfer.skippedOne':
    '1 repository has no portable remote URL and will be skipped.',
  'repositoryTransfer.skippedMany':
    '{count} repositories have no portable remote URL and will be skipped.',
  'repositoryTransfer.selectForExport': 'Select {name} for export',
  'repositoryTransfer.exportOne': 'Export {count} repository',
  'repositoryTransfer.exportMany': 'Export {count} repositories',
  'accounts.invalidatedTokenTitle': 'Invalidated account token',
  'accounts.invalidatedTokenTitleDarwin': 'Invalidated Account Token',
  'accounts.invalidatedTokenBody':
    'The sign-in token for {login} on {endpoint} is no longer valid, so that account has been signed out.',
  'accounts.invalidatedTokenOthersKept':
    'Your other accounts on {endpoint} are still signed in.',
  'accounts.invalidatedTokenPrompt': 'Do you want to sign in as {login} again?',
  'accounts.invalidatedTokenSignIn': 'Sign in again',
  'accounts.invalidatedTokenLater': 'Not now',
  'dateRange.from': 'From',
  'dateRange.to': 'To',
  'dateRange.presetsLabel': 'Date range presets',
  'dateRange.calendarLabel': 'Choose a date range',
  'dateRange.month': 'Month',
  'dateRange.year': 'Year',
  'dateRange.previousMonth': 'Previous month',
  'dateRange.nextMonth': 'Next month',
  'dateRange.preset.all': 'All time',
  'dateRange.preset.last7': 'Last 7 days',
  'dateRange.preset.last30': 'Last 30 days',
  'dateRange.preset.last90': 'Last 90 days',
  'dateRange.preset.thisYear': 'This year',
  'dateRange.preset.lastYear': 'Last year',
  // Each names the actual problem: "invalid" alone leaves the reader guessing
  // which of the three it is.
  'dateRange.error.incomplete': 'Keep going — that date is not complete yet.',
  'dateRange.error.outOfRange': 'That day does not exist in that month.',
  'dateRange.error.unrecognized':
    'Use YYYY-MM-DD, or a four-digit year in the date order shown.',
  'changelog.title': 'Release history',
  'changelog.searchPlaceholder': 'Search every release',
  'changelog.searchLabel': 'Search the release history',
  'changelog.dateFilter': 'Dates',
  'changelog.dateFilterActive': 'Dates: {range}',
  'changelog.openCommit': 'Open commit {commit} on the web',
  'changelog.categories': 'Categories',
  'changelog.categoryAll': 'All',
  'changelog.uncategorized': 'Uncategorized',
  'changelog.copy': 'Copy',
  'changelog.copied': 'Copied {count} release(s) to the clipboard.',
  'changelog.export': 'Export',
  'changelog.exportMarkdown': 'Export as Markdown…',
  'changelog.exportText': 'Export as plain text…',
  'changelog.exported': 'Exported {count} release(s) to {path}.',
  'changelog.exportFailed': 'The export could not be written: {error}',
  'changelog.copyFailed': 'Nothing was copied to the clipboard: {error}',
  'changelog.reset': 'Clear filters',
  'changelog.close': 'Close',
  'changelog.showMore': 'Show {count} more',
  'changelog.currentVersion': 'You are running this version',
  // Said plainly rather than left blank: a blank date reads as a bug.
  'changelog.dateUnrecorded': 'date unrecorded',
  'changelog.noChanges': 'No changes recorded for this release.',
  'changelog.includeUndated': 'Include releases with no recorded date',
  'changelog.undatedHidden':
    '{count} release(s) hidden: no release tag records their date.',
  'changelog.summary.plain':
    '{releases} of {total} releases, {entries} entries.',
  'changelog.summary.light':
    '{releases} of {total} releases in view — {entries} entries.',
  'changelog.summary.playful':
    '{releases} of {total} releases dug up, {entries} entries and counting.',
  'changelog.summary.maximum':
    '{releases} of {total} releases hauled up from the archive, {entries} entries dusted off and on display.',
  'changelog.empty.plain': 'No releases match the current filters.',
  'changelog.empty.light': 'Nothing here matches those filters.',
  'changelog.empty.playful':
    'Not one release matches that. The filters win this round.',
  'changelog.empty.maximum':
    'Zero releases survived those filters — a flawless victory for the filters and a quiet afternoon for history.',
  'docsBrowser.title': 'Feature documentation',
  'docsBrowser.close': 'Close the documentation browser',
  'docsBrowser.searchPlaceholder': 'Search titles and article text',
  'docsBrowser.searchField': 'the documentation',
  'docsBrowser.categoriesLabel': 'Documentation categories',
  'docsBrowser.categoryAll': 'All categories',
  'docsBrowser.category.agentApi': 'Agent API',
  'docsBrowser.category.collaboration': 'Collaboration',
  'docsBrowser.category.designSystem': 'Design system',
  'docsBrowser.category.identityAndWorkspace': 'Identity and workspace',
  'docsBrowser.category.integrations': 'Integrations',
  'docsBrowser.category.linuxTui': 'Linux TUI',
  'docsBrowser.category.qualityAndReliability': 'Quality and reliability',
  'docsBrowser.category.repositoryManagement': 'Repository management',
  'docsBrowser.category.reviewAndDiff': 'Review and diff',
  'docsBrowser.category.root': 'Overview',
  'docsBrowser.listLabel': 'Feature articles',
  'docsBrowser.articleLabel': 'Documentation article: {title}',
  'docsBrowser.sourcePath': 'Source: {path}',
  'docsBrowser.selectArticle': 'Select {title}',
  'docsBrowser.selectionCount': '{count} selected',
  'docsBrowser.selectAllMatches': 'Select all {count} matching articles',
  'docsBrowser.selectAllArticles': 'Select all {count} articles',
  'docsBrowser.invertSelection': 'Invert selection',
  'docsBrowser.clearSelection': 'Clear selection',
  'docsBrowser.selectionHint':
    'Space selects the focused article, Shift+click selects a range, Ctrl+A selects everything listed.',
  'docsBrowser.export': 'Export',
  'docsBrowser.exportMenuLabel': 'Export the selected articles',
  'docsBrowser.exportMarkdown': 'Export as Markdown',
  'docsBrowser.exportText': 'Export as plain text',
  'docsBrowser.exportJson': 'Export as JSON',
  'docsBrowser.exported': 'Exported {count} article(s) to {path}.',
  'docsBrowser.exportFailed': 'The export was not written: {message}',
  'docsBrowser.exportEmpty': 'Select at least one article to export.',
  'docsBrowser.deleteLabel': 'Delete',
  'docsBrowser.deleteUnavailable':
    'These articles ship inside the app and are read-only, so there is nothing to delete. Export the selection instead.',
  'docsBrowser.linkUnbundled':
    'That link points at {path}, which is not one of the bundled feature articles.',
  'docsBrowser.linkSection':
    'That link points at the "{section}" section of the article you are reading.',
  'docsBrowser.linkOpened': 'Opened {title}.',
  'docsBrowser.linkUnreadable': 'That link could not be read: {href}',
  'docsBrowser.linkExternal': 'Opening {href} in your browser.',
  'docsBrowser.searchInvalid': 'That pattern was not searched: {message}',
  'docsBrowser.resetSearch': 'Clear the search',
  'docsBrowser.offlineNote':
    'Every article is bundled into this build. Nothing here is downloaded, so it all works offline.',
  'docsBrowser.summary.plain': '{shown} of {total} articles.',
  'docsBrowser.summary.light': '{shown} of {total} articles in view.',
  'docsBrowser.summary.playful':
    '{shown} of {total} articles rounded up and waiting to be read.',
  'docsBrowser.summary.maximum':
    '{shown} of {total} articles hauled out of the shelf, dusted off and lined up for you.',
  'docsBrowser.empty.plain': 'No article matches {query}.',
  'docsBrowser.empty.light': 'Nothing in the documentation matches {query}.',
  'docsBrowser.empty.playful':
    'Not one article admits to knowing anything about {query}.',
  'docsBrowser.empty.maximum':
    'Every bundled article searched its pockets and not one of them has ever heard of {query}.',
  'palette.docsBrowser': 'Browse feature documentation',
  'palette.docsBrowserDescription':
    'Open the offline documentation browser, which carries every feature article inside the app.',
  'commandPalette.groupDocumentation': 'Documentation',
  'dimSum.region': 'Dim sum surprise',
  'dimSum.dismiss': 'Dismiss the dim sum surprise',
  // Read after the name, so it lands as "Har Gow, said haa1 gaau2".
  'dimSum.romanization': 'said {jyutping}',
  'dimSum.title.plain': 'Dim sum surprise',
  'dimSum.title.light': 'One from the trolley',
  'dimSum.title.playful': 'The trolley squeaked past',
  // The two facts every band states: the odds, and that the card leaves on its
  // own. Neither promises a way to switch it off, because there is not one.
  'dimSum.title.maximum': 'The trolley chose you',
  'dimSum.lead.plain':
    'About 1 launch in 10 shows a dish. This card clears itself.',
  'dimSum.lead.light':
    'About 1 launch in 10 gets a dish. This one clears itself, so carry on.',
  'dimSum.lead.playful':
    'You drew the 1 launch in 10 that comes with food. It clears itself — no need to eat quickly.',
  'dimSum.lead.maximum':
    'One launch in 10 comes with food, and you are holding the winning ticket. The card clears itself — the dumplings, regrettably, are pixels.',
  'contextMenu.filterPlaceholder': 'Filter actions',
  'contextMenu.filterLabel': 'Filter menu actions',
  'contextMenu.empty': 'No matching actions',
  // Spoken to screen readers after the item's own label, so it reads as
  // "Copy, shortcut Ctrl+C" rather than leaving the shortcut visual-only.
  'contextMenu.shortcut': 'shortcut {keys}',
  'contextMenu.cut': 'Cut',
  'contextMenu.copy': 'Copy',
  'contextMenu.paste': 'Paste',
  'contextMenu.selectAll': 'Select all',
  'filter.mode.fuzzy': 'Fuzzy',
  'filter.mode.substring': 'Substring',
  'filter.mode.regex': 'Regex',
  'filter.mode.cycleLabel': 'Filter mode: {mode} (click to change)',
  'filter.case.match': 'Match case',
  'filter.regexBuilder.open': 'Open regex builder',
  'filter.regexBuilder.label': 'Regex builder',
  'filter.regexBuilder.literalCategory': 'Literal text',
  'filter.regexBuilder.literalField': 'Text to match exactly',
  'filter.regexBuilder.literalPlaceholder': 'e.g. c++',
  'filter.regexBuilder.literalInsert': 'Insert as literal',
  'filter.regexBuilder.literalPreview': 'Inserts',
  'branch.filter.notUpdatedWith': 'Not updated with {branch}',
  'regex.builder.viewsLabel': 'Regex builder views',
  'regex.builder.view.build': 'Build',
  'regex.builder.view.guide': 'How regex works',
  'regex.builder.title': 'Regex builder',
  'regex.builder.description':
    'Compose a pattern from building blocks, test it live, then apply it to the {target} search.',
  'regex.builder.close': 'Close',
  'regex.builder.patternLabel': 'Regular expression pattern',
  'regex.builder.patternPlaceholder': 'pattern',
  'regex.builder.deleteLast': 'Delete last character',
  'regex.builder.clear': 'Clear pattern',
  'regex.builder.flag.ignoreCase': 'ignore case',
  'regex.builder.cancel': 'Cancel',
  'regex.builder.apply': 'Apply to {target}',
  'regex.builder.categoriesLabel':
    'Regular expression building-block categories',
  'regex.builder.category.anchors': 'Anchors',
  'regex.builder.category.characterClasses': 'Character classes',
  'regex.builder.category.quantifiers': 'Quantifiers',
  'regex.builder.category.groups': 'Groups',
  'regex.builder.category.alternation': 'Alternation',
  'regex.builder.token.start': 'start of searched item',
  'regex.builder.token.end': 'end of searched item',
  'regex.builder.token.wordBoundary': 'word boundary',
  'regex.builder.token.nonBoundary': 'non-boundary',
  'regex.builder.token.anyCharacter': 'any character',
  'regex.builder.token.digit': 'digit',
  'regex.builder.token.nonDigit': 'non-digit',
  'regex.builder.token.wordCharacter': 'word char',
  'regex.builder.token.nonWordCharacter': 'non-word char',
  'regex.builder.token.whitespace': 'whitespace',
  'regex.builder.token.nonWhitespace': 'non-whitespace',
  'regex.builder.token.anyOf': 'any of a, b, c',
  'regex.builder.token.noneOf': 'none of a, b, c',
  'regex.builder.token.range': 'a range',
  'regex.builder.token.tab': 'tab',
  'regex.builder.token.zeroOrMore': 'zero or more',
  'regex.builder.token.oneOrMore': 'one or more',
  'regex.builder.token.optional': 'optional',
  'regex.builder.token.exactlyThree': 'exactly 3',
  'regex.builder.token.twoOrMore': '2 or more',
  'regex.builder.token.betweenTwoAndFive': 'between 2 and 5',
  'regex.builder.token.lazyZeroOrMore': 'lazy zero or more',
  'regex.builder.token.lazyOneOrMore': 'lazy one or more',
  'regex.builder.token.capturingGroup': 'capturing group',
  'regex.builder.token.nonCapturingGroup': 'non-capturing group',
  'regex.builder.token.namedGroup': 'named group',
  'regex.builder.token.or': 'or',
  'regex.builder.token.aOrB': 'a or b',
  'regex.builder.guide.matching.title': 'How matching works',
  'regex.builder.guide.matching.body':
    'Desktop Material uses the linear-time RE2 engine. It scans text left to right and explores alternatives without catastrophic backtracking, so a user-authored search pattern cannot freeze the renderer. A search matches when the whole pattern can be satisfied somewhere in the text.',
  'regex.builder.guide.matching.note':
    '— plain characters match themselves; this finds "material" anywhere',
  'regex.builder.guide.anchors.title': 'Anchors pin the position',
  'regex.builder.guide.anchors.body':
    'Anchors match positions, not characters. ^ is the start of each searched item, $ is the end, \\b is the boundary between a word character and anything else, \\B is everywhere that is not a boundary.',
  'regex.builder.guide.anchors.note':
    '— paths that start with app/ and end in .scss',
  'regex.builder.guide.classes.title': 'Character classes',
  'regex.builder.guide.classes.body':
    'A class matches exactly one character from a set: \\d a digit, \\w a word character, \\s whitespace, and . any character at all. Square brackets build your own sets — [a-z] is a range, [^abc] means anything except a, b, or c.',
  'regex.builder.guide.classes.note':
    '— exactly seven hex characters: a short commit sha',
  'regex.builder.guide.quantifiers.title': 'Quantifiers and greediness',
  'regex.builder.guide.quantifiers.body':
    'Quantifiers repeat the token before them: * means zero or more, + one or more, ? optional, {n,m} between n and m times. They are greedy — they grab as much text as possible. Append ? to make one lazy so it stops as early as it can.',
  'regex.builder.guide.quantifiers.note':
    '— lazy: matches each quoted string separately instead of one giant match',
  'regex.builder.guide.groups.title': 'Groups and captures',
  'regex.builder.guide.groups.body':
    'Parentheses capture what they matched. (?:…) groups without capturing, and (?<name>…) gives a capture a readable name. RE2 deliberately rejects backreferences and lookaround because they cannot be evaluated with its linear-time safety guarantee.',
  'regex.builder.guide.groups.note': '— captures app or docs as the named area',
  'regex.builder.guide.alternation.title': 'Alternation',
  'regex.builder.guide.alternation.body':
    'The pipe | means or. Combine it with a group to keep it scoped: gr(a|e)y matches gray and grey. Without the group, the | splits the entire pattern in two.',
  'regex.builder.guide.alternation.note':
    '— files ending in .scss, .ts, or .tsx',
  'regex.builder.guide.flags.title': 'Flags change the rules',
  'regex.builder.guide.flags.body':
    'The i flag ignores case and stays synchronized with the search bar’s Match case control. Desktop Material always enumerates matches safely and uses Unicode-aware RE2 semantics, so unsupported JavaScript-only flags are not shown.',
  'regex.builder.guide.usage.title': 'How Desktop Material uses regex',
  'regex.builder.guide.usage.body':
    'Every search bar in the app has a .* toggle that switches it from plain-text to safe RE2 matching. An invalid or unsupported pattern shows a localized error and filters nothing until fixed. This builder tests the exact pattern and case mode that Apply sends back to the search bar.',
  'regex.error.patternTooLong':
    'Pattern is too long (maximum {max} characters).',
  'regex.error.inputTooLong':
    'Search text is too long to evaluate safely (maximum {max} characters).',
  'regex.error.invalidOrUnsupported':
    'Invalid or unsupported safe RE2 pattern: {detail}',
  'regex.error.unknown': 'Unknown regular-expression error',
  'regex.test.capture.unmatched': 'unmatched',
  'regex.test.capture.empty': 'empty',
  'regex.test.capture.truncated': '{value}… ({count} characters)',
  'regex.test.capture.groupLabel': 'Capture groups from the first match',
  'regex.test.capture.heading': 'CAPTURES',
  'regex.test.capture.more': '+{count} more',
  'regex.test.status.invalid': 'Invalid pattern',
  'regex.test.status.oneMatch': '{count} match',
  'regex.test.status.matches': '{count} matches',
  'regex.test.heading': 'TEST',
  'regex.test.sampleLabel': 'Sample text for testing the regular expression',
  'agentSessions.sidebarLabel': 'Repository sidebar',
  'agentSessions.listTab': 'List',
  'agentSessions.agentsTab': 'Agents',
  'agentSessions.worktrees': 'Worktrees',
  'agentSessions.newSession': 'New Agent Session',
  'agentSessions.empty':
    'No worktrees yet. Create one to start an agent session.',
  'agentSessions.locked': 'Locked',
  'agentSessions.missing': 'Missing',
  'agentSessions.detachedAt': 'detached at ',
  'agentSessions.onBranch': 'on branch ',
  'agentSessions.options': 'Options',
  'agentSessions.baseBranch': 'Base branch',
  'agentSessions.codingAgent': 'Coding agent',
  'agentSessions.taskLabel': 'Task for the agent',
  'agentSessions.taskPlaceholder': 'What should the agent do in this worktree?',
  'agentSessions.configureSetup': 'Configure setup commands',
  'agentSessions.setup.title': 'Setup commands',
  'agentSessions.setup.description':
    'Review the executable and each separate argument. Enabled commands run in order after Git creates the worktree and before the coding agent starts.',
  'agentSessions.setup.count.none': 'No setup commands configured',
  'agentSessions.setup.count.one': '1 setup command configured',
  'agentSessions.setup.count.some': '{count} setup commands configured',
  'agentSessions.setup.count.unavailable': 'Setup commands unavailable',
  'agentSessions.setup.unavailable':
    'Setup commands could not be read safely. Restore local storage access before starting.',
  'agentSessions.setup.retryPlan.all':
    'This preserved worktree will retry every enabled setup command.',
  'agentSessions.setup.retryPlan.one':
    '1 unchanged completed command will be skipped. Setup continues with the next reviewed command.',
  'agentSessions.setup.retryPlan.some':
    '{count} unchanged completed commands will be skipped. Setup continues with the next reviewed command.',
  'agentSessions.setup.retryPlan.restart':
    'Every enabled setup command will run again from command 1.',
  'agentSessions.setup.restart': 'Run setup again from command 1',
  'agentSessions.setup.commandLabel': 'Command {count}',
  'agentSessions.setup.enabled': 'Run this command',
  'agentSessions.setup.executable': 'Executable',
  'agentSessions.setup.argumentLabel': 'Argument {count}',
  'agentSessions.setup.removeArgument': 'Remove argument {count}',
  'agentSessions.setup.addArgument': 'Add argument',
  'agentSessions.setup.moveUp': 'Move command {count} up',
  'agentSessions.setup.moveDown': 'Move command {count} down',
  'agentSessions.setup.removeCommand': 'Remove command {count}',
  'agentSessions.setup.addCommand': 'Add command',
  'agentSessions.setup.save': 'Save setup commands',
  'agentSessions.setup.cancelRun': 'Cancel setup',
  'agentSessions.setup.problem.tooManyCommands':
    'Keep at most {count} setup commands.',
  'agentSessions.setup.problem.missingArgument':
    'Command {command} needs at least one non-empty argument.',
  'agentSessions.setup.problem.emptyArgument':
    'Command {command}, argument {argument} cannot be empty.',
  'agentSessions.setup.problem.tooManyArguments':
    'Command {command} may have at most {count} arguments.',
  'agentSessions.setup.problem.argumentTooLong':
    'Command {command}, argument {argument} is too long.',
  'agentSessions.setup.problem.credential':
    'Command {command}, argument {argument} looks like a credential. Setup commands never store secrets.',
  'agentSessions.setup.problem.cwdOverride':
    'Command {command}, argument {argument} would change the reviewed worktree directory.',
  'agentSessions.setup.problem.commandString':
    'Command {command}, argument {argument} would evaluate a command string. Choose a script file instead.',
  'agentSessions.setup.problem.unsafeArgument':
    'Command {command}, argument {argument} contains unsupported shell, expansion, or control syntax.',
  'agentSessions.setup.problem.saveFailed':
    'The setup commands could not be saved. The previous list is unchanged.',
  'agentSessions.worktreeName': 'Worktree name',
  'agentSessions.cancel': 'Cancel',
  'agentSessions.start': 'Start',
  'agentSessions.agent.none': '<None>',
  'agentSessions.agent.notDetected': '{name} — not detected',
  'agentSessions.agent.notAuthenticated': '{name} — authentication required',
  'agentSessions.noneHint':
    '<None> runs configured setup commands but starts no coding agent.',
  'agentSessions.problem.nameEmpty': 'Enter a name for the new worktree.',
  'agentSessions.problem.nameTooLong': 'Use {count} characters or fewer.',
  'agentSessions.problem.nameSeparator':
    'A worktree name cannot contain a path separator.',
  'agentSessions.problem.nameIllegal':
    'Git will not accept this name. Avoid spaces, control characters, and the characters ~ ^ : ? * [ \\ and consecutive dots.',
  'agentSessions.problem.nameReserved':
    '{name} is a reserved device name on Windows.',
  'agentSessions.problem.duplicateWorktree':
    'A worktree named {name} already exists.',
  'agentSessions.problem.duplicateBranch':
    'A branch named {name} already exists.',
  'agentSessions.problem.baseEmpty': 'Choose a base branch.',
  'agentSessions.problem.baseUnknown':
    '{branch} is not a branch in this repository.',
  'agentSessions.problem.agentUnavailable':
    'That coding agent cannot run on this computer.',
  'agentSessions.problem.promptEmpty':
    'Describe the task for the agent, or choose <None>.',
  'agentSessions.problem.promptTooLong': 'Use {count} characters or fewer.',
  'agentSessions.status.errorLabel': 'Error',
  'agentSessions.status.failed': '{name} failed',
  'agentSessions.status.failedWithReason': '{name} failed: {reason}',
  'agentSessions.status.workingLabel': 'Working',
  'agentSessions.status.working': '{name} is working',
  'agentSessions.status.workingEdited': '{name} is working, {files} edited',
  'agentSessions.status.oneFile': '1 file',
  'agentSessions.status.files': '{count} files',
  'agentSessions.status.oneLine': '1 line',
  'agentSessions.status.lines': '{count} lines',
  'agentSessions.status.diff':
    '{name} has {added} added and {deleted} deleted across {files}',
  'agentSessions.status.notMeasuredLabel': 'Not measured',
  'agentSessions.status.notMeasured': '{name} has no measured changes yet',
  'agentSessions.status.noChangesLabel': 'No changes',
  'agentSessions.status.noChanges': '{name} has no changes',
  'agentSessions.notification.unavailableTitle': 'Agent session is unavailable',
  'agentSessions.notification.unavailableBody':
    '{name} is no longer registered as a worktree. Refresh the repository and try again.',
  'agentSessions.notification.invalidTitle': 'Agent session request is invalid',
  'agentSessions.notification.createFailedTitle':
    'Agent session could not be created',
  'agentSessions.notification.createdTitle': 'Agent session created',
  'agentSessions.notification.createdBody':
    '{name} is ready. No coding agent was started.',
  'agentSessions.notification.finishedTitle': 'Agent session finished',
  'agentSessions.notification.finishedBody':
    '{agent} finished in {name}. Review the worktree before integrating its changes.',
  'agentSessions.notification.endedTitle': '{agent} exited',
  'agentSessions.notification.endedBody':
    '{agent} exited cleanly in {name}. Review the worktree to confirm the task outcome before integrating changes.',
  'agentSessions.notification.failedTitle': 'Agent session failed',
  'agentSessions.notification.failedBody': '{name}: {error}',
  'agentSessions.notification.runnerCouldNotStart':
    '{agent} could not start cleanly.',
  'agentSessions.notification.runnerExitedWithCode':
    '{agent} exited with code {code}.',
  'agentSessions.notification.setupSaveFailedTitle':
    'Setup commands could not be saved',
  'agentSessions.notification.setupSaveFailedBody':
    'The reviewed list for this repository is unchanged. Check local storage access and try again.',
  'agentSessions.notification.setupLoadFailedTitle':
    'Setup commands could not be read',
  'agentSessions.notification.setupLoadFailedBody':
    "No worktree was created. Restore local storage access, review this repository's setup list, and try again.",
  'agentSessions.notification.setupRetryUnavailableTitle':
    'Worktree setup cannot be retried',
  'agentSessions.notification.setupRetryUnavailableBody':
    '{name} no longer matches the preserved linked worktree path and branch. No setup command ran. Review the current worktree before creating a replacement.',
  'agentSessions.notification.setupVerificationFailedTitle':
    'Worktree setup could not be verified',
  'agentSessions.notification.setupVerificationFailedBody':
    '{name} was kept, but its linked path and branch could not be verified. No setup command or coding agent started. Refresh the repository and retry.',
  'agentSessions.notification.setupFailedTitle': 'Worktree setup failed',
  'agentSessions.notification.setupFailedBody':
    '{name} was kept. Command {command} did not finish: {reason} Review the setup list, then select Start again to retry.',
  'agentSessions.notification.setupFailedBeforeRunBody':
    '{name} was kept. Setup did not start: {reason} Review the setup list, then select Start again to retry.',
  'agentSessions.notification.setupFailedAfterRunBody':
    '{name} was kept. {count} setup command(s) finished, but final worktree verification failed: {reason} Review the worktree before retrying.',
  'agentSessions.notification.setupCancelledTitle': 'Worktree setup cancelled',
  'agentSessions.notification.setupCancelledBody':
    '{name} was kept. Review the setup list, then select Start again to retry.',
  'agentSessions.setup.failure.invalidRequest':
    'the reviewed command list was invalid.',
  'agentSessions.setup.failure.worktreeUnavailable':
    'the Git worktree was unavailable.',
  'agentSessions.setup.failure.executableUnavailable':
    'the selected native executable was not available.',
  'agentSessions.setup.failure.spawnFailed':
    'the selected executable could not be started.',
  'agentSessions.setup.failure.exitCode':
    'the executable returned a non-zero exit code.',
  'agentSessions.setup.failure.timeout': 'the fixed execution timeout expired.',
  'agentSessions.setup.failure.outputLimit':
    'the fixed private-output limit was exceeded.',
  'repositorySigning.title': 'Commit and tag signing',
  'repositorySigning.hubDescription':
    'Inspect and review the repository or global signing policy for commits and annotated tags.',
  'repositorySigning.shortcutLabel': 'Signing policy shortcut',
  'repositorySigning.cardTitle': 'Manage signing policy',
  'repositorySigning.intro':
    'Inspect public signing configuration, choose local or global defaults, and verify HEAD or annotated tags without exposing raw verifier output.',
  'repositorySigning.summaryTitle': 'Effective signing policy',
  'repositorySigning.notInspected': 'Not inspected',
  'repositorySigning.keyLabel': 'Signing key',
  'repositorySigning.notConfigured': 'Not configured',
  'repositorySigning.commitLabel': 'Commit signing',
  'repositorySigning.tagLabel': 'Tag signing',
  'repositorySigning.enabled': 'Enabled',
  'repositorySigning.disabled': 'Disabled',
  'repositorySigning.scopeLabel': 'Configuration scope',
  'repositorySigning.scope.local': 'This repository',
  'repositorySigning.scope.global': 'All repositories',
  'repositorySigning.formatLabel': 'Signing format',
  'repositorySigning.replacementKeyLabel': 'Replacement public key',
  'repositorySigning.replacementKeyHelp':
    'Leave blank to preserve the configured key. OpenPGP and X.509 accept a public fingerprint; SSH accepts an inline key:: public key. Private key paths and comments are rejected. Changing formats while a key is configured requires a compatible replacement.',
  'repositorySigning.signCommits': 'Sign commits by default',
  'repositorySigning.signTags': 'Sign annotated tags by default',
  'repositorySigning.reviewAction': 'Review signing settings',
  'repositorySigning.reviewTitle': 'Apply these signing settings?',
  'repositorySigning.review.scope': 'Scope',
  'repositorySigning.review.format': 'Format',
  'repositorySigning.review.publicKey': 'Public key',
  'repositorySigning.review.preserveKey': 'Preserve current key',
  'repositorySigning.review.replaceKey':
    'Replace with reviewed public identifier',
  'repositorySigning.review.defaults': 'Commit / tag defaults',
  'repositorySigning.review.commitOn': 'Commit on',
  'repositorySigning.review.commitOff': 'Commit off',
  'repositorySigning.review.tagOn': 'tag on',
  'repositorySigning.review.tagOff': 'tag off',
  'repositorySigning.review.description':
    'The selected scope is rechecked before fixed Git config updates run. Secret key material, signer programs, and allowed-signers paths are never read or shown.',
  'repositorySigning.applyAction': 'Apply signing settings',
  'repositorySigning.goBack': 'Go back',
  'repositorySigning.verificationTitle': 'Safe signature verification',
  'repositorySigning.verifyHead': 'Verify HEAD commit',
  'repositorySigning.loadTags': 'Load annotated tags',
  'repositorySigning.annotatedTag': 'Annotated tag',
  'repositorySigning.verifyTag': 'Verify selected tag',
  'repositorySigning.result.target': 'Target',
  'repositorySigning.result.state': 'State',
  'repositorySigning.result.signer': 'Signer',
  'repositorySigning.result.notReported': 'Not reported',
  'repositorySigning.inspectAction': 'Inspect signing settings',
  'repositorySigning.inspectAgainAction': 'Inspect signing settings again',
  'repositorySigning.cancelAction': 'Cancel signing operation',
  'repositorySigning.status.idle':
    'Inspect signing configuration before making changes.',
  'repositorySigning.status.cancelledPartial':
    'Signing operation cancelled. Some reviewed settings may already be applied; inspect the current state again.',
  'repositorySigning.status.cancelledClean':
    'Signing operation cancelled. No reviewed signing update was started.',
  'repositorySigning.status.inspected':
    'Signing configuration inspected safely.',
  'repositorySigning.status.noTags':
    'No annotated tags are available to verify.',
  'repositorySigning.status.loadedTags': 'Loaded {count} annotated {noun}.',
  'repositorySigning.status.updatedRefreshing':
    'Signing settings updated. Refreshing repository state…',
  'repositorySigning.status.applying':
    'Applying reviewed signing setting {index} of {total}…',
  'repositorySigning.status.verification': '{target}: {state}.',
  'repositorySigning.status.failedPartial':
    'The signing update did not fully complete.',
  'repositorySigning.status.failedSafe':
    'The signing operation stopped safely.',
  'repositorySigning.status.inspecting':
    'Inspecting repository signing settings…',
  'repositorySigning.status.review':
    'Review the exact signing settings before applying them.',
  'repositorySigning.status.rechecking':
    'Rechecking signing settings before applying…',
  'repositorySigning.status.verifyingHead':
    'Checking the HEAD commit signature…',
  'repositorySigning.status.loadingTags':
    'Loading bounded annotated-tag metadata…',
  'repositorySigning.status.verifyingTag': 'Checking the {tag} tag signature…',
  'repositorySigning.status.cancelling': 'Cancelling the signing operation…',
  'repositorySigning.status.changeAgain':
    'Change the signing settings or review them again.',
  'repositorySigning.error.start':
    'The signing operation could not be started safely.',
  'repositorySigning.error.tooMuchData':
    'Git returned more signing data than can be reviewed safely.',
  'repositorySigning.error.gitFailed':
    'Git could not complete the bounded signing operation.',
  'repositorySigning.error.configChanged':
    'Signing configuration changed after review. Inspect and review it again.',
  'repositorySigning.error.tagUnavailable':
    'The reviewed annotated tag is no longer available.',
  'repositorySigning.error.tagChanged':
    'The annotated tag changed after selection. Reload tags before verifying.',
  'repositorySigning.error.unexpectedState':
    'The signing operation entered an unexpected state.',
  'repositorySigning.error.reviewUnavailable':
    'The reviewed signing update is no longer available.',
  'repositorySigning.error.inspectFirst':
    'Inspect signing configuration before reviewing it.',
  'repositorySigning.error.formatNeedsKey':
    'Changing the signing format while a key is configured requires a compatible replacement public key.',
  'repositorySigning.error.prepare':
    'The signing update could not be prepared safely.',
  'repositorySigning.error.cancel':
    'The signing operation could not be cancelled.',
  'repositorySigning.error.partial':
    '{detail} Some reviewed settings may already be applied; inspect signing settings again before another update.',
  'repositorySigning.error.detail': '{detail}',
  'repositorySigning.grade.good': 'Good signature',
  'repositorySigning.grade.bad': 'Bad signature',
  'repositorySigning.grade.goodUnknownValidity':
    'Cryptographically good; trust is unknown',
  'repositorySigning.grade.expiredSignature':
    'Good signature made after its expiry',
  'repositorySigning.grade.expiredKey': 'Good signature made by an expired key',
  'repositorySigning.grade.revokedKey': 'Good signature made by a revoked key',
  'repositorySigning.grade.cannotVerify': 'Signature could not be checked',
  'repositorySigning.grade.unsigned': 'Unsigned',
  'repositorySigning.grade.unknown': 'Unknown signature state',
  'md3.search.clear': 'Clear {field}',
  'md3.search.regexMode': 'Regex mode for {field}',
  'md3.search.regexBuilder': 'Regex builder for {field}',
  'md3.search.hits': '{count} hits',
  'md3.chip.filterBy': 'Filter by {label}',
  'md3.emptyState.resetFilters': 'Reset filters',
  'md3.regexBuilder.title': 'Regex builder — {target}',
  'md3.regexBuilder.close': 'Close the regex builder',
  'md3.regexBuilder.patternLabel': 'Regular expression pattern',
  'md3.regexBuilder.patternPlaceholder': 'pattern',
  'md3.regexBuilder.flagsLabel': 'Regular expression flags',
  'md3.regexBuilder.flagToggle': 'Flag {flag} — {name}',
  'md3.regexBuilder.flag.i': 'case-insensitive',
  'md3.regexBuilder.flag.g': 'global',
  'md3.regexBuilder.flag.m': 'multiline',
  'md3.regexBuilder.flag.s': 'dotall',
  'md3.regexBuilder.flag.u': 'unicode',
  'md3.regexBuilder.flag.y': 'sticky',
  'md3.regexBuilder.group.anchors': 'Anchors',
  'md3.regexBuilder.group.classes': 'Classes',
  'md3.regexBuilder.group.quantifiers': 'Quantifiers',
  'md3.regexBuilder.group.groups': 'Groups and logic',
  'md3.regexBuilder.token.insert': 'Insert {token} — {label}',
  'md3.regexBuilder.token.start': 'start',
  'md3.regexBuilder.token.end': 'end',
  'md3.regexBuilder.token.wordBoundary': 'word boundary',
  'md3.regexBuilder.token.word': 'word',
  'md3.regexBuilder.token.digit': 'digit',
  'md3.regexBuilder.token.space': 'space',
  'md3.regexBuilder.token.charRange': 'range',
  'md3.regexBuilder.token.notX': 'not x',
  'md3.regexBuilder.token.any': 'any',
  'md3.regexBuilder.token.oneOrMore': 'one or more',
  'md3.regexBuilder.token.zeroOrMore': 'zero or more',
  'md3.regexBuilder.token.optional': 'optional',
  'md3.regexBuilder.token.repeatRange': 'range',
  'md3.regexBuilder.token.capture': 'capture',
  'md3.regexBuilder.token.nonCapture': 'non-capture',
  'md3.regexBuilder.token.either': 'either',
  'md3.regexBuilder.token.lookahead': 'lookahead',
  'md3.regexBuilder.token.lookbehind': 'lookbehind',
  'md3.regexBuilder.group.escapes': 'Escapes and Unicode',
  'md3.regexBuilder.group.lazy': 'Lazy quantifiers',
  'md3.regexBuilder.group.references': 'References and assertions',
  'md3.regexBuilder.token.notWordBoundary': 'not a word boundary',
  'md3.regexBuilder.token.notWord': 'not a word character',
  'md3.regexBuilder.token.notDigit': 'not a digit',
  'md3.regexBuilder.token.notSpace': 'not whitespace',
  'md3.regexBuilder.token.tab': 'tab',
  'md3.regexBuilder.token.newline': 'newline',
  'md3.regexBuilder.token.carriageReturn': 'carriage return',
  'md3.regexBuilder.token.hexEscape': 'hex character',
  'md3.regexBuilder.token.unicodeEscape': 'code unit',
  'md3.regexBuilder.token.unicodePoint': 'code point (needs u)',
  'md3.regexBuilder.token.unicodeLetter': 'any letter (needs u)',
  'md3.regexBuilder.token.unicodeNumber': 'any digit (needs u)',
  'md3.regexBuilder.token.unicodeScript': 'Han script (needs u)',
  'md3.regexBuilder.token.lazyOneOrMore': 'one or more, lazy',
  'md3.regexBuilder.token.lazyZeroOrMore': 'zero or more, lazy',
  'md3.regexBuilder.token.lazyOptional': 'optional, lazy',
  'md3.regexBuilder.token.lazyRepeatRange': 'repeat range, lazy',
  'md3.regexBuilder.token.exactly': 'exactly three',
  'md3.regexBuilder.token.atLeast': 'two or more',
  'md3.regexBuilder.token.namedCapture': 'named capture',
  'md3.regexBuilder.token.namedBackreference': 'named backreference',
  'md3.regexBuilder.token.backreference': 'backreference to group 1',
  'md3.regexBuilder.token.negativeLookahead': 'negative lookahead',
  'md3.regexBuilder.token.negativeLookbehind': 'negative lookbehind',
  'md3.regexBuilder.tester': 'Live tester',
  'md3.regexBuilder.testLabel': 'Test string',
  'md3.regexBuilder.result.idle': 'Enter a pattern to test.',
  'md3.regexBuilder.result.match': 'Match: "{text}"',
  'md3.regexBuilder.result.matchWithGroups':
    'Match: "{text}" · groups: {groups}',
  'md3.regexBuilder.result.noMatch': 'No match in the test string.',
  'md3.regexBuilder.result.invalid': 'Invalid pattern: {message}',
  'md3.regexBuilder.apply': 'Apply to search',
  'md3.regexBuilder.applyName': 'Apply to search {target}',
  'md3.regexBuilder.clear': 'Clear',
  'md3.regexBuilder.clearName': 'Clear the pattern',
  'md3.regexBuilder.guide': 'Guide',
  'md3.regexBuilder.guideName': 'Guide to how regex works',
  'md3.regexBuilder.guideHeading': 'How regex works',
  'md3.menu.filterPlaceholder': 'Search these actions',
  'md3.menu.hint.active': 'Active',
  'md3.menu.hint.on': 'On',
  'md3.menu.hint.off': 'Off',
  'md3.menu.hint.ask': 'Ask',
  'md3.menu.hint.current': 'Current',
  'md3.menu.hint.anchor': 'anchor',
  'md3.menu.hint.class': 'class',
  'md3.menu.hint.quantifier': 'quantifier',
  'md3.menu.hint.group': 'group',
  'md3.menu.hint.alternation': 'alternation',
  'md3.menu.hint.flags': 'flags',
  'md3.menu.theme.dark': 'dark',
  'md3.menu.theme.light': 'light',
  'md3.menuOverlay.close': 'Close',
  'md3.menuOverlay.itemsLabel': '{title} actions',
  'md3.menuOverlay.noMatches': 'Nothing in {title} matches what you typed.',
  'md3.menuOverlay.clearFilter': 'Clear the filter',
  'md3.menuOverlay.invalidPattern':
    'That is not a valid regular expression yet, so nothing is being filtered.',
  'md3.menu.palette.title': 'Command palette',
  'md3.menu.palette.placeholder': 'Type a command',
  'md3.menu.palette.commitPushAll': 'Commit and push all changes',
  'md3.menu.palette.fetchOrigin': 'Fetch origin',
  'md3.menu.palette.pullAll': 'Pull all repositories',
  'md3.menu.palette.mergeAll': 'Merge all branches into {branch}',
  'md3.menu.palette.openRegexBuilder': 'Open regex builder',
  'md3.menu.palette.goRepositories': 'Go to Repositories',
  'md3.menu.palette.goChanges': 'Go to Changes',
  'md3.menu.palette.goHistory': 'Go to History',
  'md3.menu.palette.goActions': 'Go to GitHub Actions',
  'md3.menu.palette.openSettings': 'Open Settings',
  'md3.menu.settings.title': 'Settings',
  'md3.menu.settings.placeholder': 'Search settings',
  'md3.menu.settings.appearance': 'Appearance — theme, accent, UI scaling',
  'md3.menu.settings.absoluteDates': 'Absolute commit dates',
  'md3.menu.settings.automation': 'Automation — auto commit & push, auto pull',
  'md3.menu.settings.accounts': 'Accounts — GitHub, GitLab self-hosted',
  'md3.menu.settings.copilot': 'Copilot preferences',
  'md3.menu.settings.undoHistory': 'Undo history manager',
  'md3.menu.settings.git': 'Git — name, email, default branch',
  'md3.menu.settings.integrations': 'Integrations — editor, shell, terminal',
  'md3.menu.settings.notifications': 'Notifications and sounds',
  'md3.menu.account.title': 'Accounts',
  'md3.menu.account.entry': '{name} — {host}',
  'md3.menu.account.addGitHub': 'Add GitHub account',
  'md3.menu.account.addGitLab': 'Add GitLab self-hosted (endpoint + token)',
  'md3.menu.repoMenu.title': 'Switch repository',
  'md3.menu.repoMenu.placeholder': 'Filter repositories',
  'md3.menu.repoMenu.entry': '{name} — {org}',
  'md3.menu.repoMenu.browseAll': 'Browse all repositories',
  'md3.menu.branchMenu.title': 'Switch branch',
  'md3.menu.branchMenu.placeholder': 'Filter branches',
  'md3.menu.branchMenu.browseAll': 'Browse all branches',
  'md3.menu.paneMenu.title': 'Repository actions',
  'md3.menu.paneMenu.commitPushCopilot': 'Commit & push with Copilot message',
  'md3.menu.paneMenu.pullOrigin': 'Pull origin',
  'md3.menu.paneMenu.forcePush': 'Force push',
  'md3.menu.paneMenu.buildAndRun': 'Build & run',
  'md3.menu.paneMenu.mergeAll': 'Merge all branches',
  'md3.menu.paneMenu.openInTerminal': 'Open in terminal',
  'md3.menu.paneMenu.repositorySettings': 'Repository settings',
  'md3.menu.listMenu.title': 'Commit list',
  'md3.menu.listMenu.newestFirst': 'Newest first',
  'md3.menu.listMenu.oldestFirst': 'Oldest first',
  'md3.menu.listMenu.groupByDay': 'Group by day',
  'md3.menu.listMenu.showGraph': 'Show commit graph',
  'md3.menu.listMenu.selectMultiple': 'Select multiple commits',
  'md3.menu.diffOptions.title': 'Diff options',
  'md3.menu.diffOptions.unified': 'Unified diff',
  'md3.menu.diffOptions.split': 'Split diff',
  'md3.menu.diffOptions.wrap': 'Wrap long lines',
  'md3.menu.diffOptions.hideWhitespace': 'Hide whitespace changes',
  'md3.menu.diffOptions.moreContext': 'More context lines',
  'md3.menu.fileMenu.title': 'File actions',
  'md3.menu.fileMenu.openInEditor': 'Open in external editor',
  'md3.menu.fileMenu.copyPath': 'Copy file path',
  'md3.menu.fileMenu.fileHistory': 'File history',
  'md3.menu.fileMenu.blame': 'Blame',
  'md3.menu.fileMenu.discardChanges': 'Discard changes',
  'md3.menu.fileMenu.ignoreFile': 'Ignore file',
  'md3.menu.rowMenu.title': '{sha} — commit actions',
  'md3.menu.rowMenu.revert': 'Revert this commit',
  'md3.menu.rowMenu.cherryPick': 'Cherry-pick to branch…',
  'md3.menu.rowMenu.createTag': 'Create tag here…',
  'md3.menu.rowMenu.reset': 'Reset to this commit…',
  'md3.menu.rowMenu.copySha': 'Copy SHA',
  'md3.menu.rowMenu.viewOnGitHub': 'View on GitHub',
  'md3.menu.changesMenu.title': 'Changed files',
  'md3.menu.changesMenu.includeAll': 'Include all files',
  'md3.menu.changesMenu.excludeAll': 'Exclude all files',
  'md3.menu.changesMenu.stashAll': 'Stash all changes',
  'md3.menu.changesMenu.discardAll': 'Discard all changes…',
  'md3.menu.changesMenu.groupByFolder': 'Group by folder',
  'md3.menu.changeRowMenu.title': 'File actions',
  'md3.menu.changeRowMenu.discardChanges': 'Discard changes',
  'md3.menu.changeRowMenu.ignoreFile': 'Ignore file',
  'md3.menu.changeRowMenu.ignoreType': 'Ignore all files of this type',
  'md3.menu.changeRowMenu.reveal': 'Reveal in file manager',
  'md3.menu.changeRowMenu.openInEditor': 'Open in external editor',
  'md3.menu.branchRowMenu.title': 'Branch actions',
  'md3.menu.branchRowMenu.mergeInto': 'Merge into {branch}',
  'md3.menu.branchRowMenu.rebaseOnto': 'Rebase onto {branch}',
  'md3.menu.branchRowMenu.openPullRequest': 'Open pull request',
  'md3.menu.branchRowMenu.rename': 'Rename branch…',
  'md3.menu.branchRowMenu.delete': 'Delete branch…',
  'md3.menu.runMenu.title': 'Workflow run',
  'md3.menu.runMenu.rerunAll': 'Re-run all jobs',
  'md3.menu.runMenu.rerunFailed': 'Re-run failed jobs',
  'md3.menu.runMenu.cancel': 'Cancel run',
  'md3.menu.runMenu.dispatch': 'Run workflow (workflow_dispatch)…',
  'md3.menu.runMenu.rawLogs': 'View raw logs',
  'md3.menu.repoRowMenu.title': 'Repository actions',
  'md3.menu.repoRowMenu.fetch': 'Fetch',
  'md3.menu.repoRowMenu.pull': 'Pull',
  'md3.menu.repoRowMenu.changeAlias': 'Change alias…',
  'md3.menu.repoRowMenu.moveToGroup': 'Move to group…',
  'md3.menu.repoRowMenu.reveal': 'Reveal in file manager',
  'md3.menu.repoRowMenu.remove': 'Remove from list…',
  'md3.menu.compose.title': 'New commit',
  'md3.menu.compose.openComposer': 'Open the commit composer',
  'md3.menu.compose.copilotMessage': 'Let Copilot write the message',
  'md3.menu.compose.addCoAuthors': 'Add co-authors',
  'md3.menu.compose.commitAndPush': 'Commit and push',
  'md3.menu.agentAccess.title': 'Agent access',
  'md3.menu.agentAccess.readAccess': 'Allow read access to working tree',
  'md3.menu.agentAccess.commits': 'Allow commits',
  'md3.menu.agentAccess.push': 'Allow push',
  'md3.menu.agentAccess.sessionLog': 'Session log',
  'md3.menu.inboxRowMenu.title': 'Notification',
  'md3.menu.inboxRowMenu.markRead': 'Mark as read',
  'md3.menu.inboxRowMenu.markUnread': 'Mark as unread',
  'md3.menu.inboxRowMenu.openInBrowser': 'Open in browser',
  'md3.menu.inboxRowMenu.mute': 'Mute this thread',
  'md3.menu.inboxRowMenu.delete': 'Delete notification',
  'md3.menu.agentRowMenu.title': 'Agent session',
  'md3.menu.agentRowMenu.resume': 'Resume session',
  'md3.menu.agentRowMenu.pause': 'Pause session',
  'md3.menu.agentRowMenu.openLog': 'Open session log',
  'md3.menu.agentRowMenu.duplicate': 'Duplicate session',
  'md3.menu.agentRowMenu.access': 'Agent access…',
  'md3.menu.agentRowMenu.delete': 'Delete session',
  'md3.menu.terminalMenu.title': 'Terminal',
  'md3.menu.terminalMenu.copy': 'Copy selection',
  'md3.menu.terminalMenu.paste': 'Paste',
  'md3.menu.terminalMenu.clear': 'Clear output',
  'md3.menu.terminalMenu.split': 'Split shell',
  'md3.menu.terminalMenu.openSystem': 'Open in system terminal',
  'md3.menu.terminalMenu.newShell': 'New shell session',
  'md3.menu.drawerMenu.title': 'Navigation',
  'md3.menu.drawerMenu.collapse': 'Collapse drawer',
  'md3.menu.drawerMenu.expand': 'Expand drawer',
  'md3.menu.drawerMenu.goRepositories': 'Go to Repositories',
  'md3.menu.drawerMenu.goChanges': 'Go to Changes',
  'md3.menu.drawerMenu.goHistory': 'Go to History',
  'md3.menu.drawerMenu.goBranches': 'Go to Branches',
  'md3.menu.drawerMenu.goActions': 'Go to Actions',
  'md3.menu.drawerMenu.goInbox': 'Go to Inbox',
  'md3.menu.drawerMenu.goTerminal': 'Go to Terminal',
  'md3.menu.drawerMenu.goAgents': 'Go to Agents',
  'md3.menu.searchMenu.title': 'Search field',
  'md3.menu.searchMenu.openBuilder': 'Open regex builder',
  'md3.menu.searchMenu.toggleRegex': 'Toggle regex mode',
  'md3.menu.searchMenu.clearField': 'Clear this field',
  'md3.menu.searchMenu.howRegexWorks': 'How regex works',
  'md3.menu.guide.title': 'How regex works',
  'md3.menu.guide.caret': '^ anchors the match to the start of the line',
  'md3.menu.guide.dollar': '$ anchors the match to the end of the line',
  'md3.menu.guide.classes': '\\d matches any digit, \\w any word character',
  'md3.menu.guide.quantifiers':
    '+ means one or more, * zero or more, ? optional',
  'md3.menu.guide.groups':
    '(…) captures a group, (?:…) groups without capturing',
  'md3.menu.guide.alternation': 'a|b matches either side of the alternation',
  'md3.menu.guide.flags':
    'Flags: i g m s u y — case, global, multiline, dotall',
  'md3.appHeader.label': 'Application header',
  'md3.appHeader.menu': 'Menu',
  'md3.appHeader.commitAndPush': 'Commit & push',
  'md3.appHeader.commitAndPushHint': 'Commit and push',
  'md3.appHeader.searchPlaceholder':
    'Search commits, files, branches, repositories',
  'md3.appHeader.searchField': 'the global search',
  'md3.appHeader.commandPalette': 'Command palette ({shortcut})',
  'md3.appHeader.notifications': 'Notification centre',
  'md3.appHeader.notificationsUnread': 'Notification centre, {count} unread',
  'md3.appHeader.unreadBadge': '{count} unread notifications',
  'md3.appHeader.theme': 'Light / dark',
  'md3.appHeader.settings': 'Settings',
  'md3.appHeader.account': 'Account switcher',
  'md3.appHeader.accountFor': 'Account switcher for {name}',
  'md3.paneHeader.fetch': 'Fetch origin',
  'md3.paneHeader.moreActions': 'More actions',
  'md3.paneHeader.push': 'Push · {count}',
  'md3.paneHeader.upToDate': 'Up to date',
  'md3.paneHeader.repository': 'Repository {name}',
  'md3.paneHeader.branch': 'Branch {name}',
  'md3.paneHeader.progress': '{operation}, {percent}% complete',
  // The destination's own name is interpolated verbatim into every band. A
  // screen reader hears this on each navigation, so the name comes early and
  // no band is longer than a breath.
  'md3.shell.destinationAnnouncement.plain': 'Showing {name}',
  'md3.shell.destinationAnnouncement.light': 'Showing {name} now',
  'md3.shell.destinationAnnouncement.playful': 'Here we go — {name}',
  'md3.shell.destinationAnnouncement.maximum': 'Ta-da! {name}, as requested',
  'md3.shell.branchGroup.local': 'Local',
  'md3.shell.branchGroup.remote': 'Remote',
  'md3.shell.searchTarget.global': 'the global search',
  'md3.shell.searchTarget.history': 'commits',
  'md3.shell.searchTarget.changes': 'changed files',
  'md3.shell.searchTarget.branches': 'branches',
  'md3.shell.searchTarget.actions': 'workflow runs',
  'md3.shell.searchTarget.logs': 'log output',
  'md3.shell.searchTarget.inbox': 'notifications',
  'md3.shell.searchTarget.terminal': 'terminal output',
  'md3.shell.searchTarget.agents': 'agent sessions',
  'md3.shell.searchTarget.repositories': 'repositories',
  'md3.shell.searchTarget.diffSearch': 'the diff',
  'md3.shell.carry.compareToBranch': 'Compare to branch…',
  'md3.shell.carry.unreachableCommits': 'Unreachable commits…',
  'md3.shell.carry.workflowManager': 'Workflow manager…',
  'md3.shell.carry.workflowCatalog': 'New workflow from a template…',
  'md3.shell.carry.cacheManager': 'Actions cache manager…',
  'md3.shell.carry.runnerManager': 'Self-hosted runner manager…',
  'md3.shell.carry.refreshRuns': 'Refresh workflow runs',
  'md3.shell.carry.runCount': 'Load every workflow run',
  'md3.shell.carry.jumpToAttempt': 'Jump to the previous attempt',
  'md3.shell.carry.logGroupCollapse': 'Collapse log groups',
  'md3.shell.carry.paneDivider': 'Resize the run list',
  'md3.shell.carry.discardFile': 'Discard changes',
  'md3.shell.carry.permanentlyDiscardFile': 'Permanently discard changes',
  'md3.shell.carry.stashFile': 'Stash changes',
  'md3.shell.carry.ignoreFolder': 'Ignore this folder',
  'md3.shell.carry.copyRelativePath': 'Copy relative path',
  'md3.shell.carry.copySelectedPaths': 'Copy the selected paths',
  'md3.shell.carry.openWithDefaultProgram': 'Open with the default program',
  'md3.shell.carry.cheapLfsPin': 'Pin with Cheap LFS',
  'md3.shell.carry.includeSelectedFiles': 'Include the selected files',
  'md3.shell.carry.excludeSelectedFiles': 'Exclude the selected files',
  'md3.shell.carry.discardAll': 'Discard all changes',
  'md3.shell.carry.permanentlyDiscardAll': 'Permanently discard all changes',
  'md3.shell.carry.stashAll': 'Stash all changes',
  'md3.shell.carry.mergeAndDelete': 'Merge and delete this branch',
  'md3.shell.carry.compareBranch': 'Compare with this branch',
  'md3.shell.carry.copyBranchName': 'Copy branch name',
  'md3.shell.carry.togglePinBranch': 'Pin or unpin this branch',
  'md3.shell.carry.hideBranch': 'Hide this branch',
  'md3.shell.carry.soloBranch': 'Show only this branch',
  'md3.shell.carry.restoreBranchVisibility': 'Restore hidden branches',
  'md3.shell.carry.checkoutInNewWorktree': 'Check out in a new worktree',
  'md3.shell.carry.switchToWorktree': 'Switch to this branch’s worktree',
  'md3.shell.carry.viewBranchOnForge': 'View this branch on the forge',
  'md3.shell.carry.viewPullRequestOnForge':
    'View the pull request on the forge',
  'md3.shell.carry.sortBranchesByName': 'Sort branches by name',
  'md3.shell.carry.sortBranchesByRecent': 'Sort branches by most recent',
  'md3.shell.carry.showPullRequests': 'Show pull requests',
  'md3.shell.carry.fetchRemoteBranches': 'Fetch remote branches',
  'md3.shell.carry.restoreAllBranches': 'Restore all hidden branches',
  'md3.shell.carry.bulkDeleteBranches': 'Delete the selected branches…',
  'md3.shell.carry.repositoryListMenu': 'Repository actions…',
  'md3.shell.carry.newAgentSession': 'New agent session…',
  'md3.carry.close': 'Close',
  'md3.carry.workflowManagerTitle': 'Workflow manager',
  'md3.carry.cacheManagerTitle': 'Actions cache manager',
  'md3.carry.runnerManagerTitle': 'Self-hosted runner manager',
  'md3.carry.bulkDeleteTitle': 'Delete branches in bulk',
  // Every fact below is rendered verbatim by the shared gate at every funny
  // level and in every language mode: which files, which branch, which
  // repository, and exactly what cannot be taken back.
  'md3.carry.gate.discardTitle': 'Discard changes?',
  'md3.carry.gate.discardConfirm': 'Discard changes',
  'md3.carry.gate.discardSummary':
    'Discards the uncommitted changes in {count} file(s): {files}.',
  'md3.carry.gate.discardIrreversible':
    'The changes are moved to the trash. Anything Git never recorded cannot be recovered from Git.',
  'md3.carry.gate.discardTargetKey': '{count} file(s) in {repository}',
  'md3.carry.gate.discardEffectKey':
    'their uncommitted changes go to the trash',
  'md3.carry.gate.discardPermanentTitle': 'Permanently discard changes?',
  'md3.carry.gate.discardPermanentConfirm': 'Permanently discard',
  'md3.carry.gate.discardPermanentSummary':
    'Permanently deletes the uncommitted changes in {count} file(s): {files}.',
  'md3.carry.gate.discardPermanentIrreversible':
    'Nothing is moved to the trash. The changes are deleted from disk and cannot be restored.',
  'md3.carry.gate.discardPermanentEffectKey':
    'their uncommitted changes are deleted from disk',
  'md3.carry.gate.mergeAndDeleteTitle': 'Merge and delete this branch?',
  'md3.carry.gate.mergeAndDeleteConfirm': 'Merge and delete',
  'md3.carry.gate.mergeAndDeleteSummary':
    'Merges {branch} into {target}, then deletes the local branch {branch} once Git reports the merge completed.',
  'md3.carry.gate.mergeAndDeleteIrreversible':
    'The local branch is removed. A conflict, a hook failure or an aborted merge stops before the deletion and keeps the branch.',
  'md3.carry.gate.mergeAndDeleteTargetKey': 'the local branch {branch}',
  'md3.carry.gate.mergeAndDeleteEffectKey':
    'it is deleted after a completed merge',
  'md3.carry.gate.bulkDeleteTitle': 'Delete branches in bulk?',
  'md3.carry.gate.bulkDeleteConfirm': 'Open the reviewed deletion',
  'md3.carry.gate.bulkDeleteSummary':
    'Opens the reviewed bulk deletion for {repository}, where up to {count} local branch(es) can be selected. The current and default branches are never candidates.',
  'md3.carry.gate.bulkDeleteIrreversible':
    'Every branch confirmed in that review is deleted locally. Each deletion records a recovery object id, and remote branches are never touched.',
  'md3.carry.gate.bulkDeleteTargetKey': 'local branches in {repository}',
  'md3.carry.gate.bulkDeleteEffectKey':
    'the branches chosen in the review are deleted',
  'classicToolbar.heading': 'Classic toolbar',
  'classicToolbar.toggleLabel': 'Show the classic toolbar',
  'classicToolbar.explanationSummary': 'What this setting changes',
  'classicToolbar.explanation.plain':
    'When this is on, the classic toolbar band — the repository, worktree, branch, sync, build-and-run and theme controls — is shown above the main pane. When it is off, the band is hidden and every one of those actions stays reachable from the pane header and the pane’s More actions menu. Nothing is removed either way.',
  'classicToolbar.explanation.light':
    'On puts the classic toolbar band back above the pane: repository, worktree, branch, sync, build-and-run, theme. Off tucks it away, and every one of those actions is still in the pane header or the pane’s More actions menu. Nothing goes missing either way.',
  'classicToolbar.explanation.playful':
    'On, and the old toolbar band takes its usual seat above the pane with repository, worktree, branch, sync, build-and-run and theme all present and correct. Off, and it takes the evening off — every one of those actions is waiting in the pane header or behind More actions. Nothing is lost, only relocated.',
  'classicToolbar.explanation.maximum':
    'On, and the classic toolbar band strolls back to its old seat above the pane with the whole crew — repository, worktree, branch, sync, build-and-run, theme — exactly where a decade of muscle memory expects them. Off, and the band clocks off for the night, having first handed every single one of those actions to the pane header and the More actions menu. Not one of them is retired, sacked, or quietly lost down the back of the interface.',
  'classicToolbar.boundaryNote':
    'Hiding the band never removes an action. The repository tab strip is separate and is always shown.',
  'classicToolbar.provenanceDefault':
    'No choice has been recorded on this computer, so the shipped value is in use: {value}.',
  'classicToolbar.provenanceStored':
    'A choice was recorded on this computer: {value}.',
  'classicToolbar.stateOn': 'shown',
  'classicToolbar.stateOff': 'hidden',
  'md3.repositories.searchPlaceholder': 'Search repositories, orgs, languages',
  // Each of these states what actually happened and to how many
  // repositories. The counts are interpolated facts, never rounded.
  'md3.repositories.gone': 'This repository is no longer in the list.',
  'md3.repositories.favourited': 'Favorited {count} repositories.',
  'md3.repositories.unfavourited': 'Unfavorited {count} repositories.',
  'md3.repositories.removed': 'Removed {count} repositories from the list.',
  'md3.repositories.pullingAll': 'Pulling every selected repository.',
  'md3.repositories.pulling': 'Pulling the selected repositories.',
  'md3.repositories.fetching': 'Fetching the selected repositories.',
  'md3.repositories.assigningGroup': 'Moving them into {group}.',
  'md3.repositories.removingGroup': 'Taking them out of their group.',
  'md3.repositories.dismissNotice': 'Dismiss this message',
  'md3.repositories.searchFieldName': 'repositories',
  'md3.repositories.filtersLabel': 'Repository filters',
  'md3.repositories.hasChanges': 'Has changes',
  'md3.repositories.clone': 'Clone',
  'md3.repositories.addLocal': 'Add local',
  'md3.repositories.pullAll': 'Pull all',
  'md3.repositories.pullAllName':
    'Pull all {count} repositories the filter is showing',
  'md3.repositories.selectMultiple': 'Select several repositories',
  'md3.repositories.listLabel': 'Repositories',
  'md3.repositories.empty': 'No repositories match.',
  'md3.repositories.invalidPattern':
    'That regular expression does not compile, so nothing was filtered out.',
  'md3.repositories.meta': '{path} · fetched {when}',
  'md3.repositories.neverFetched': 'never',
  'md3.repositories.detail':
    '{language} · {size} · {branch} · {remotes} · {changes}',
  'md3.repositories.languageUnknown': 'Language not detected',
  'md3.repositories.size': '{size} MB',
  'md3.repositories.sizeUnknown': 'size not measured',
  'md3.repositories.branchAheadBehind': '{branch} ↑{ahead} ↓{behind}',
  'md3.repositories.branchInSync': '{branch} in sync',
  'md3.repositories.branchNotChecked': '{branch} not checked yet',
  'md3.repositories.branchNoUpstream': '{branch} has no upstream',
  'md3.repositories.branchDetached': 'detached HEAD',
  'md3.repositories.branchEmpty': 'no commits yet',
  'md3.repositories.branchCloning': 'cloning',
  'md3.repositories.branchMissing': 'missing from disk',
  'md3.repositories.branchNone': 'no branch',
  'md3.repositories.remotes': '{count} remotes',
  'md3.repositories.remotesOne': '1 remote',
  'md3.repositories.changes': '{count} changes',
  'md3.repositories.changesOne': '1 change',
  'md3.repositories.clean': 'Clean',
  'md3.repositories.changesUnknown': 'Not inspected',
  'md3.repositories.open': 'Open',
  'md3.repositories.openName': 'Open {name}',
  'md3.repositories.current': 'Current',
  'md3.repositories.rowMenu': 'Actions for {name}',
  'md3.repositories.rowMenuHint': 'Fetch, remove, reveal, settings',
  'md3.repositories.pinnedFlag': 'Pinned',
  'md3.repositories.hiddenFlag': 'Hidden',
  'md3.repositories.missingFlag': 'Missing',
  'md3.repositories.selectRow': 'Select {name}',
  'md3.repositories.bulkRegion': 'Bulk repository actions',
  'md3.repositories.selectAllVisible': 'Select all {count} shown',
  'md3.repositories.selectionScope':
    'Select all covers the {shown} repositories this filter is showing, not all {total} in the app.',
  'md3.repositories.selectedCount': '{count} selected',
  'md3.repositories.invertSelection': 'Invert the selection',
  'md3.repositories.clearSelection': 'Clear the selection',
  'md3.repositories.exitSelection': 'Done selecting',
  'md3.repositories.groupFieldLabel': 'Group name',
  'md3.repositories.groupFieldPlaceholder': 'An existing or new group',
  'md3.repositories.bulkFetch': 'Fetch',
  'md3.repositories.bulkPull': 'Pull',
  'md3.repositories.bulkOpen': 'Open',
  'md3.repositories.bulkFavorite': 'Pin',
  'md3.repositories.bulkUnfavorite': 'Unpin',
  'md3.repositories.bulkAssignGroup': 'Assign to group',
  'md3.repositories.bulkRemoveGroup': 'Remove from group',
  'md3.repositories.bulkExport': 'Export',
  'md3.repositories.bulkRemove': 'Remove from list',
  'md3.repositories.bulkActionName':
    '{action} the {count} selected repositories',
  'md3.repositories.runRegion': 'Repository batch progress',
  'md3.repositories.runCount': '{completed} of {total}',
  'md3.repositories.runProgressText': '{operation}, {percent}% complete',
  'md3.repositories.runCancelling':
    'Cancelling. The repository already running finishes first; the rest never start.',
  'md3.repositories.runSummary':
    '{done} of {total} succeeded · {failed} failed · {skipped} skipped · {remaining} never ran',
  'md3.repositories.runResults': 'Result for every repository in this batch',
  'md3.repositories.runNoDetail': 'No detail reported',
  'md3.repositories.runCancel': 'Cancel',
  'md3.repositories.runCancelName': 'Cancel {operation}',
  'md3.repositories.runDismiss': 'Dismiss these results',
  'md3.repositories.runStatusQueued': 'Queued',
  'md3.repositories.runStatusRunning': 'Running',
  'md3.repositories.runStatusDone': 'Done',
  'md3.repositories.runStatusFailed': 'Failed',
  'md3.repositories.runStatusSkipped': 'Skipped',
  'md3.repositories.runStatusCancelled': 'Never ran',
  'md3.repositories.removeEyebrow': 'Destructive action',
  'md3.repositories.removeTitle':
    'Remove these {count} repositories from the list?',
  'md3.repositories.removeTitleOne': 'Remove this repository from the list?',
  'md3.repositories.removeDescription':
    'They stop being tracked here. Nothing on disk is deleted, and each one can be added again.',
  'md3.repositories.removeListLabel': 'Repositories that will be removed',
  'md3.repositories.removeKeysLegend': 'Authorize this exact removal',
  'md3.repositories.removeKeyList':
    'I read the list above and it is exactly what I want removed.',
  'md3.repositories.removeKeyDisk':
    'I understand all {count} stay on disk and can be added back later.',
  'md3.repositories.removeSlider':
    'Slide fully to authorize the removal ({percent}%)',
  'md3.repositories.removeSliderName': 'Full-range removal authorization',
  'md3.repositories.removeSliderValue': '{percent}% authorized',
  'md3.repositories.removeStateLocked':
    'Both confirmations are required before the slider moves.',
  'md3.repositories.removeStateMoving':
    'Keep sliding to the end to authorize the removal.',
  'md3.repositories.removeStateReady':
    'Authorization complete. Choose Remove from list to finish.',
  'md3.repositories.removeConfirm': 'Remove from list',
  'md3.repositories.removeCancel': 'Emergency exit',
  'md3.actions.filterPlaceholder': 'Filter workflow runs',
  'md3.actions.runFieldLabel': 'workflow runs',
  'md3.actions.logPlaceholder': 'Search log output',
  'md3.actions.logFieldLabel': 'the log',
  'md3.actions.chipRowLabel': 'Workflow run filters',
  // The chip identifiers stay the contract's English words because a
  // filter matches on them; these are what the chips actually read.
  'md3.actions.chip.running': 'Running',
  'md3.actions.chip.failed': 'Failed',
  'md3.actions.chip.success': 'Success',
  'md3.actions.chip.thisBranch': 'This branch',
  // A cancellation is a request GitHub may refuse, so the two
  // outcomes read differently rather than both claiming it stopped.
  'md3.actions.cancelRequested': 'Cancellation requested.',
  'md3.actions.cancelRefused':
    'GitHub would not cancel this run. It may have already finished.',
  'md3.actions.bulkDone': 'Done for {count} runs.',
  'md3.actions.bulkPartial': 'Done for {done} runs, {failed} failed.',
  'md3.actions.workflowEnabled': 'Enabled {name}.',
  'md3.actions.workflowDisabled': 'Disabled {name}.',
  'md3.actions.unsupported':
    'This repository is not on GitHub, so it has no workflow runs.',
  'md3.actions.moreFilters': 'More workflow run filters',
  'md3.actions.selectRuns': 'Select workflow runs',
  'md3.actions.dispatch': 'Run workflow',
  'md3.actions.filtersHeading': 'Workflow run filters',
  'md3.actions.filterWorkflow': 'Workflow',
  'md3.actions.filterBranch': 'Branch',
  'md3.actions.filterEvent': 'Event',
  'md3.actions.filterStatus': 'Status',
  'md3.actions.resetFilters': 'Reset filters',
  'md3.actions.bulkLabel': 'Bulk workflow run actions',
  'md3.actions.selectAllVisible': 'Select all visible',
  'md3.actions.selectedCount': '{count} selected',
  'md3.actions.bulkRerun': 'Re-run completed ({count})',
  'md3.actions.bulkCancel': 'Cancel active ({count})',
  'md3.actions.clearSelection': 'Clear selection',
  'md3.actions.selectRun': 'Select workflow run {name}',
  'md3.actions.runList': 'Workflow runs',
  'md3.actions.runMeta': '#{number} · {branch} · {event} · {duration}',
  'md3.actions.runDetail':
    '{status} · triggered by {actor} · {sha} · {jobs} jobs · {time} · attempt {attempt}',
  'md3.actions.rerun': 'Re-run',
  'md3.actions.rerunRun': 'Re-run {name}',
  'md3.actions.runMenuFor': 'Actions for {name}',
  'md3.actions.runMenuHint': 'Re-run failed jobs, cancel, view logs',
  'md3.actions.noRuns': 'No workflow runs match.',
  'md3.actions.showMoreRuns': 'Show more runs',
  'md3.actions.pagination':
    'Showing {shown} matching from {loaded} loaded of {total} workflow runs.',
  'md3.actions.loadMoreRuns': 'Load more runs',
  'md3.actions.loadingMore': 'Loading more…',
  'md3.actions.loadAllRuns': 'Load all runs',
  'md3.actions.stopLoading': 'Stop loading',
  'md3.actions.detailLabel': 'Selected workflow run',
  'md3.actions.detailHeading': '{name} · #{number} · {branch}',
  'md3.actions.rerunFailed': 'Re-run failed',
  'md3.actions.rerunFailedFor': 'Re-run failed jobs of {name}',
  'md3.actions.paneMenu': 'More',
  'md3.actions.runToolbar': 'Workflow run actions',
  'md3.actions.attempt': 'Jobs from attempt',
  'md3.actions.attemptOption': 'Attempt {attempt}',
  'md3.actions.attemptLatest': 'Attempt {attempt} (latest)',
  'md3.actions.cancelRun': 'Cancel run',
  'md3.actions.fixCiLocally': 'Fix CI locally',
  'md3.actions.fixCiLocallyHint':
    'Fix locally with Codex or OpenCode, verify, then push to start cloud CI',
  'md3.actions.artifacts': 'Artifacts',
  'md3.actions.openOnGitHub': 'View on GitHub',
  'md3.actions.jobList': 'Jobs and steps',
  'md3.actions.jobsLoading': 'Loading jobs…',
  'md3.actions.jobsTruncated':
    'GitHub truncated this job list; reload to see the rest.',
  'md3.actions.loadMoreJobs': 'Load more jobs',
  'md3.actions.reloadJobs': 'Reload jobs',
  'md3.actions.rerunJob': 'Re-run job {name}',
  'md3.actions.jobOnGitHub': 'Open {name} on GitHub',
  'md3.actions.noRunSelected': 'Select a workflow run to see its jobs and log.',
  'md3.actions.logRegion': 'Job log',
  'md3.actions.logLoading': 'Downloading job log…',
  'md3.actions.logExpired': 'These workflow logs have expired on GitHub.',
  'md3.actions.logRetry': 'Retry',
  'md3.actions.logEmpty': 'No log output yet.',
  'md3.actions.logNoMatch': 'No log lines match.',
  'md3.actions.logShowMore': 'Show more log lines',
  'md3.actions.logShowing': 'Showing {shown} of {total} log lines.',
  'md3.drawer.label': 'Main navigation',
  'md3.drawer.destinations': 'Destinations',
  'md3.drawer.commit': 'Commit',
  'md3.drawer.destinationWithCount': '{label}, {count}',
  'md3.drawer.repository': '{name}, switch repository',
  'md3.drawer.destination.changes': 'Changes',
  'md3.drawer.destination.history': 'History',
  'md3.drawer.destination.branches': 'Branches',
  'md3.drawer.destination.actions': 'Actions',
  'md3.drawer.destination.inbox': 'Inbox',
  'md3.drawer.destination.terminal': 'Terminal',
  'md3.drawer.destination.agents': 'Agents',
  'md3.drawer.destination.repositories': 'Repositories',
  'md3.rail.label': 'Main navigation',
  'md3.rail.destinations': 'Destinations',
  'md3.rail.destinationWithCount': '{label}, {count}',
  'md3.rail.settings': 'Settings',
  'md3.rail.account': '{repository}, switch account',
  'md3.rail.accountFor': '{name}, switch account · {repository}',
  'md3.compose.title': 'Compose commit message',
  'md3.compose.close': 'Close the commit composer',
  'md3.compose.context':
    '{included} of {total} files included · {stat} · {branch}',
  'md3.compose.summaryPlaceholder': 'Summary (required)',
  'md3.compose.copilot': 'Copilot',
  'md3.compose.copilotAccessibleName': 'Copilot — draft the commit message',
  'md3.compose.descriptionPlaceholder': 'Description (optional)',
  'md3.compose.addCoAuthors': 'Add co-authors',
  'md3.compose.hintCharacters': '{count}/{limit} characters',
  'md3.compose.hintRequired': 'A summary is required before committing.',
  'md3.compose.commitOnly': 'Commit only',
  'md3.compose.commitAndPush': 'Commit & push',
  'md3.compose.summaryStillRequired': 'A summary is still required',
  'md3.toast.undo': 'Undo',
  'md3.toast.dismiss': 'Dismiss this notification',
  'md3.toast.region': 'Notifications',
  'md3.inbox.pane': 'Notifications',
  'md3.inbox.list': 'Notifications',
  'md3.inbox.filters': 'Notification filters',
  'md3.inbox.searchPlaceholder': 'Search notifications',
  'md3.inbox.searchField': 'notifications',
  'md3.inbox.invalidPattern':
    'That regular expression is not valid yet, so every notification is still showing.',
  'md3.inbox.exportName': 'notifications',
  'md3.inbox.chip.unread': 'Unread',
  'md3.inbox.chip.failures': 'Failures',
  'md3.inbox.chip.mentions': 'Mentions',
  'md3.inbox.markAllRead': 'Mark all read',
  'md3.inbox.muted': 'Muted',
  'md3.inbox.state.read': 'read',
  'md3.inbox.state.unread': 'unread',
  'md3.inbox.tone.success': 'success',
  'md3.inbox.tone.failure': 'failure',
  'md3.inbox.tone.info': 'info',
  'md3.inbox.detail': '{source} · {state} · {tone}',
  'md3.inbox.detailNoSource': '{state} · {tone}',
  'md3.inbox.row.select': 'Select {title}',
  'md3.inbox.row.markRead': 'Mark {title} as read',
  'md3.inbox.row.markUnread': 'Mark {title} as unread',
  'md3.inbox.row.delete': 'Delete {title}',
  'md3.inbox.row.received': 'Received {timestamp}',
  'md3.inbox.selectAllFiltered': 'Select all {count} matching these filters',
  'md3.inbox.selectAllEverything': 'Select all {count} notifications',
  'md3.inbox.selectionCount': '{count} selected',
  'md3.inbox.invertSelection': 'Invert selection',
  'md3.inbox.bulkMarkRead': 'Mark read',
  'md3.inbox.bulkMarkReadScoped': '{label} — {scope}',
  'md3.inbox.bulkMarkUnread': 'Mark unread',
  'md3.inbox.bulkMarkUnreadScoped': '{label} — {scope}',
  'md3.inbox.bulkDelete': 'Delete',
  'md3.inbox.bulkDeleteScoped': '{label} — {scope}',
  'md3.inbox.bulkExport': 'Export',
  'md3.inbox.bulkExportScoped': '{label} — {scope}',
  'md3.inbox.moreActions': 'More notification actions',
  'md3.inbox.empty.noMatch':
    'No notifications match this search or these filters.',
  'md3.inbox.empty.caughtUp': 'You are all caught up.',
  'md3.inbox.scope.selection': '{count} selected notifications',
  'md3.inbox.scope.filtered': '{count} notifications matching these filters',
  'md3.inbox.scope.all': 'all {count} notifications',
  'md3.inbox.scope.one': '{count} notification',
  'md3.inbox.undo': 'Undo',
  'md3.inbox.toast.opened': 'Opened: {title}',
  'md3.inbox.toast.deleted': 'Deleted {title}',
  'md3.inbox.toast.deletedMany': 'Deleted {count} notifications',
  'md3.inbox.toast.markedRead': 'Marked {count} notifications read',
  'md3.inbox.toast.markedUnread': 'Marked {count} notifications unread',
  'md3.inbox.toast.allRead': 'All notifications marked read',
  'md3.inbox.toast.exported': 'Exported {count} notifications as {format}',
  'md3.inbox.toast.selectedAll': 'Selected all {count} notifications',
  'md3.inbox.toast.muted': 'Muted the thread for {title}',
  'md3.inbox.toast.unmuted': 'Unmuted the thread for {title}',
  'md3.inbox.rowMenu.unmute': 'Unmute this thread',
  'md3.inbox.rowMenu.automations': 'Notification automations…',
  'md3.inbox.rowMenu.select': 'Select this notification',
  'md3.inbox.rowMenu.deselect': 'Deselect this notification',
  'md3.inbox.rowMenu.copyDetails': 'Copy details',
  'md3.inbox.rowMenu.exportOne': 'Export this notification…',
  'md3.inbox.listMenu.title': 'Notification list',
  'md3.inbox.listMenu.selectFiltered':
    'Select all {count} matching these filters',
  'md3.inbox.listMenu.selectEverything': 'Select all {count} notifications',
  'md3.inbox.listMenu.invert': 'Invert selection',
  'md3.inbox.listMenu.clearSelection': 'Clear selection',
  'md3.inbox.listMenu.deleteScope': 'Delete {count} notifications…',
  'md3.inbox.listMenu.export': 'Export {count} notifications…',
  'md3.inbox.listMenu.history': 'Notification history…',
  'md3.inbox.listMenu.githubInbox': 'GitHub notifications…',
  'md3.inbox.exportMenu.title': 'Export notifications',
  'md3.inbox.exportMenu.filterPlaceholder': 'Filter formats',
  // The adapters turn real repository state into the views' row shapes, and
  // these are the sentences that state what Git actually reported. Every one
  // names the concrete situation rather than saying "nothing to show".
  'md3.actions.noRepository': 'No repository is selected.',
  'md3.repositories.exportTitle': 'Repository selection exported',
  'md3.repositories.exportBody':
    '{count} repositories were written to the export.',
  'md3.inbox.exportTitle': 'Notifications exported',
  'md3.inbox.exportBody': '{count} notifications were written to the export.',
  'md3.adapters.diff.none': 'No diff to show for this file.',
  'md3.adapters.diff.noChanges': 'This file has no textual changes.',
  'md3.adapters.diff.image': 'This is an image. Open it to see the change.',
  'md3.adapters.diff.binary':
    'This is a binary file, so there are no lines to compare.',
  'md3.adapters.diff.submodule':
    'This is a submodule. Its own commits are the change.',
  'md3.adapters.diff.unrenderable': 'This diff is too large to render.',
  'md3.adapters.branch.metaSha': 'Tip {sha}',
  'md3.adapters.branch.metaUpdated': 'Updated {when}',
  'md3.adapters.repository.cloning': 'Cloning',
  'md3.adapters.repository.local': 'Local',
  'md3.adapters.repository.fetchUnknown': 'not checked yet',
  'md3.adapters.agent.permissions': 'Runs in {path}',
  'md3.adapters.agent.missing':
    'This worktree is missing, so nothing can be sent to it.',
  'md3.adapters.agent.notRunning':
    'This session is not running. Resume it before sending an instruction.',
  'md3.adapters.agent.status.running': 'Running',
  'md3.adapters.agent.status.exited': 'Exited',
  'md3.adapters.agent.status.failed': 'Failed',
  'md3.adapters.agent.status.cancelled': 'Cancelled',
  'md3.diffPane.region': 'Diff',
  'md3.diffPane.linesRegion': 'Diff lines',
  'md3.diffPane.noFile': 'No file selected',
  'md3.diffPane.empty': 'This file has no textual changes.',
  'md3.diffPane.searchField': 'the diff',
  'md3.diffPane.searchPlaceholder': 'Find in diff',
  'md3.diffPane.details': 'Details',
  'md3.diffPane.detailsName': 'Details about this commit',
  'md3.diffPane.includeHunk': 'Include hunk',
  'md3.diffPane.includeHunkName': 'Include hunk in the commit',
  'md3.diffPane.wrap': 'Wrap lines',
  'md3.diffPane.diffOptions': 'Diff options',
  'md3.diffPane.fileTabs': 'Files in this commit',
  'md3.diffPane.fileTabName': '{name} — {path}, +{added} −{deleted}',
  'md3.changes.searchField': 'changed files',
  'md3.changes.searchPlaceholder': 'Filter changed files',
  'md3.changes.filters': 'Changed file filters',
  'md3.changes.includeAll': '{included} of {total} included',
  'md3.changes.changesMenu': 'Discard, ignore, stash',
  'md3.changes.list': 'Changed files',
  'md3.changes.include': 'Include {name} in the commit',
  'md3.changes.rowMenu': 'Discard, ignore, reveal {name}',
  'md3.changes.fileMenu': 'Open in editor, discard, ignore',
  'md3.changes.status.new': 'new file',
  'md3.changes.status.deleted': 'deleted',
  'md3.changes.status.modified': 'modified',
  'md3.changes.state.included': 'included',
  'md3.changes.state.excluded': 'excluded',
  'md3.changes.empty': 'No changed files match this filter.',
  'md3.changes.composer': 'Commit composer',
  'md3.changes.avatar': 'Committing as {name}',
  'md3.changes.summaryPlaceholder': 'Summary (required)',
  'md3.changes.descriptionPlaceholder': 'Description',
  'md3.changes.copilot': 'Let Copilot write the message',
  'md3.changes.coAuthors': 'Co-authors',
  'md3.changes.coAuthorsName':
    'Co-authors — credit the people who worked on this commit',
  'md3.changes.summaryHint': '{count}/{limit}',
  'md3.changes.summaryHintLong': '{count}/{limit} — summary is long',
  'md3.changes.commitTo': 'Commit to {branch}',
  'md3.changes.commitNeedsSummary':
    'A summary is required — this opens the commit composer',
  'md3.changes.commitAndPush': 'One-click commit & push',
  'md3.agents.sessionsPane': 'Agent sessions',
  'md3.agents.conversationPane': 'Agent conversation',
  'md3.agents.listLabel': 'Agent sessions',
  'md3.agents.actionsLabel': 'Agent session actions',
  'md3.agents.searchPlaceholder': 'Search agent sessions',
  'md3.agents.searchFieldLabel': 'agent sessions',
  'md3.agents.newSession': 'New session',
  'md3.agents.agentAccess': 'Agent access',
  'md3.agents.emptyNoMatches': 'No agent sessions match.',
  'md3.agents.emptyNoSessions': 'No agent sessions yet.',
  'md3.agents.state.running': 'Running',
  'md3.agents.state.done': 'Done',
  'md3.agents.state.paused': 'Paused',
  'md3.agents.state.error': 'Error',
  'md3.agents.state.idle': 'Idle',
  'md3.agents.meta.started': '{agent} · started {time}',
  'md3.agents.meta.notStarted': '{agent} · not started',
  'md3.agents.meta.branchStarted': '{agent} · {branch} · started {time}',
  'md3.agents.meta.branchNotStarted': '{agent} · {branch} · not started',
  'md3.agents.detail.model': 'model {model}',
  'md3.agents.detail.noModel': 'model not reported',
  'md3.agents.detail.turns': '{count} turns',
  'md3.agents.detail.oneTurn': '1 turn',
  'md3.agents.elapsed.seconds': '{seconds}s',
  'md3.agents.elapsed.minutes': '{minutes}m {seconds}s',
  'md3.agents.elapsed.hours': '{hours}h {minutes}m',
  'md3.agents.badge.main': 'Main worktree',
  'md3.agents.badge.locked': 'Locked',
  'md3.agents.badge.missing': 'Missing',
  'md3.agents.noSelection': 'No session selected',
  'md3.agents.noSelectionHint':
    'Select a session on the left to read its conversation.',
  'md3.agents.noTurns': 'This session has not produced any output yet.',
  'md3.agents.conversationLabel': 'Conversation with {name}',
  'md3.agents.role.you': 'You',
  'md3.agents.role.error': 'Error',
  'md3.agents.pause': 'Pause',
  'md3.agents.resume': 'Resume',
  'md3.agents.pauseAccessibleName': '{label} — {name}',
  'md3.agents.resumeAccessibleName': '{label} — {name}',
  'md3.agents.more': 'More session actions',
  'md3.agents.instructionPlaceholder': 'Send an instruction',
  'md3.agents.send': 'Send',
  'md3.agents.sendAccessibleName': '{label} the instruction to {name}',
  'md3.agents.nothingToSend': 'Nothing to send',
  'md3.terminal.region': 'Terminal',
  'md3.terminal.shells': 'Shell sessions',
  'md3.terminal.newShell': 'New shell',
  'md3.terminal.closeShell': 'Close {shell}',
  'md3.terminal.restart': 'Restart',
  'md3.terminal.restartName': 'Restart {shell}',
  'md3.terminal.stop': 'Stop',
  'md3.terminal.stopName': 'Stop the command running in {shell}',
  'md3.terminal.searchPlaceholder': 'Search terminal output',
  'md3.terminal.searchField': 'terminal output',
  'md3.terminal.output': 'Output from {shell}',
  'md3.terminal.truncated':
    'Showing the last {shown} of {total} lines. Search still reaches the rest.',
  'md3.terminal.noMatches': 'No output matches.',
  'md3.terminal.noOutput': 'This shell has printed nothing yet.',
  'md3.terminal.clearSearch': 'Clear the search',
  'md3.terminal.noSessions': 'No shell is open.',
  'md3.terminal.openShell': 'Open a shell',
  'md3.terminal.inputPlaceholder': 'Run a command',
  'md3.terminal.inputLabel': 'Command to run in {shell} at {prompt}',
  'md3.terminal.run': 'Run',
  'md3.terminal.runName': 'Run this command in {shell}',
  'md3.terminal.nothingToRun': 'Nothing to run',
  'md3.terminal.status.connecting': 'Starting up',
  'md3.terminal.status.ready': 'Ready',
  'md3.terminal.status.running': 'Running a command',
  'md3.terminal.status.exited': 'Exited',
  'md3.terminal.status.error': 'Failed to start',
  'md3.terminal.sessionLabel': '{shell} — {repository}',
  'md3.terminal.banner': 'Working in {path}',
  // Why a command stopped is the whole point of these, so the exit
  // code and the reported error are carried through verbatim.
  'md3.terminal.cancelled': 'Cancelled.',
  'md3.terminal.failedWithError': 'Failed: {error}',
  'md3.terminal.exitedWithCode': 'Exited with code {code}.',
  'md3.terminal.failed': 'Failed.',
  'md3.terminal.notAllowed': 'This command is not allowed here.',
  'md3.terminal.refreshFailed': 'Could not refresh this session.',
  'md3.terminal.startFailed': 'Could not start this command.',
  'md3.branches.filterPlaceholder': 'Filter branches',
  'md3.branches.fieldLabel': 'branches',
  'md3.branches.chipsLabel': 'Branch filters',
  'md3.branches.chip.local': 'Local',
  'md3.branches.chip.remote': 'Remote',
  'md3.branches.listLabel': 'Branches',
  'md3.branches.newBranch': 'New branch',
  'md3.branches.mergeAll': 'Merge all',
  'md3.branches.mergeAllRunning': '{label} — already running',
  'md3.branches.mergeAllProgress':
    'Merging all branches, {completed} of {total}',
  'md3.branches.mergeAllProgressBranch':
    'Merging {branch}, {completed} of {total}',
  'md3.branches.empty': 'No branch matches this filter.',
  'md3.branches.current': 'Current',
  'md3.branches.checkout': 'Checkout',
  'md3.branches.checkoutLabel': 'Check out {name}',
  'md3.branches.rowLabel': '{name}, {group}',
  'md3.branches.rowMenu': 'Actions for {name}',
  'md3.branches.rowMenuHint': 'Merge, rename, delete, open PR',
  'md3.branches.aheadLabel': '{count} commits ahead',
  'md3.branches.behindLabel': '{count} commits behind',
  'md3.branches.group.current': 'Current',
  'md3.branches.group.local': 'Local',
  'md3.branches.group.remote': 'Remote',
  'md3.branches.detail.tip': 'tip {sha}',
  'md3.branches.detail.tracks': 'tracks {upstream}',
  'md3.branches.detail.trackingRemote': 'tracking origin',
  'md3.branches.detail.untracked': 'no upstream',
  'md3.branches.detail.diverged': '↑{ahead} ↓{behind}',
  'md3.branches.detail.inSync': 'in sync',
  'md3.branches.detail.pullRequest': 'PR #{number} {state}',
  'md3.branches.action.merge': 'Merge into {branch}',
  'md3.branches.action.rebase': 'Rebase onto {branch}',
  'md3.branches.action.openPullRequest': 'Open pull request',
  'md3.branches.action.rename': 'Rename branch…',
  'md3.branches.action.delete': 'Delete branch…',
  'md3.branches.action.mergeAndDelete': 'Merge and delete…',
  'md3.branches.action.compare': 'Compare with this branch',
  'md3.branches.action.copyName': 'Copy branch name',
  'md3.branches.action.pin': 'Pin branch',
  'md3.branches.action.unpin': 'Unpin branch',
  'md3.branches.action.hide': 'Hide branch',
  'md3.branches.action.solo': 'Solo branch',
  'md3.branches.action.restoreVisibility': 'Restore all branches',
  'md3.branches.action.checkoutInNewWorktree': 'Checkout in new worktree…',
  'md3.branches.action.switchToWorktree': 'Switch to existing worktree',
  'md3.branches.action.viewOnForge': 'View branch on the forge',
  'md3.branches.action.viewPullRequestOnForge':
    'View pull request on the forge',
  'md3.branches.list.sortByName': 'Sort by name',
  'md3.branches.list.sortByNameActive': 'Sort by name (current)',
  'md3.branches.list.sortByRecent': 'Sort by most recent',
  'md3.branches.list.sortByRecentActive': 'Sort by most recent (current)',
  'md3.branches.list.pullRequests': 'Show pull requests',
  'md3.branches.list.fetchRemotes': 'Fetch remote branches',
  'md3.branches.list.bulkDelete': 'Delete several branches…',
  'md3.locks.title': 'Locks',
  'md3.locks.subtitle':
    'Every lock on a tab, a tab group or an appearance value. Each one has its own credential.',
  'md3.locks.search.placeholder': 'Search locks',
  'md3.locks.search.fieldLabel': 'locks',
  'md3.locks.empty.none':
    'No locks yet. Add one from a tab’s context menu or from an appearance editor.',
  'md3.locks.empty.noMatch': 'No lock matches this search.',
  'md3.locks.list.label': 'Locks',
  'md3.locks.surface.tab': 'Tab',
  'md3.locks.surface.tabGroup': 'Tab group',
  'md3.locks.surface.appearanceProperty': 'Appearance value',
  'md3.locks.surface.appearanceElement': 'Appearance element',
  'md3.locks.surface.appearancePreset': 'Appearance preset',
  'md3.locks.factor.password': 'Password',
  'md3.locks.factor.otp': 'One-time password',
  'md3.locks.row.created': 'Created {date}',
  'md3.locks.row.lockOnLaunch': 'Locks again on launch',
  'md3.locks.row.unlockedUntil': 'Unlocked until {time}',
  'md3.locks.row.unlockedSession': 'Unlocked until the app closes',
  'md3.locks.row.unlockedSurface': 'Unlocked while you stay on this surface',
  'md3.locks.row.locked': 'Locked',
  'md3.locks.row.select': 'Select the lock on {label}',
  'md3.locks.row.edit': 'Edit the lock on {label}',
  'md3.locks.row.remove': 'Remove the lock on {label}',
  'md3.locks.row.lockAgain': 'Lock {label} again now',
  'md3.locks.duration.surface': 'This surface only',
  'md3.locks.duration.minutes': 'For a set number of minutes',
  'md3.locks.duration.session': 'Until the app closes',
  'md3.locks.duration.minutesValue': '{minutes} minutes',
  'md3.locks.selection.count': '{selected} of {total} selected',
  'md3.locks.selection.selectAllFiltered':
    'Select the {count} locks this search is showing',
  'md3.locks.selection.selectAllEverything':
    'Select all {count} locks, including the ones this search is hiding',
  'md3.locks.selection.invert': 'Invert the selection',
  'md3.locks.selection.clear': 'Clear the selection',
  'md3.locks.bulk.remove': 'Remove {count} locks…',
  'md3.locks.bulk.export': 'Export {count} locks',
  'md3.locks.bulk.exportFormat': 'Export format',
  'md3.locks.toast.exported':
    'Exported {count} locks as {format}. Credentials are never included.',
  'md3.locks.toast.removed': 'Removed {count} locks.',
  'md3.locks.toast.added':
    'Locked {label}. Only this lock’s own credential opens it.',
  'md3.locks.toast.updated': 'Updated the lock on {label}.',
  'md3.locks.toast.unlocked': 'Unlocked {label}.',
  'md3.locks.toast.relocked': 'Locked {label} again.',
  'md3.locks.toast.selectedAll': 'Selected all {count} locks.',
  'md3.locks.gate.eyebrow': 'Cannot be undone',
  'md3.locks.gate.title': 'Remove {count} locks?',
  'md3.locks.gate.description':
    'This removes {count} locks — {scope} — and forgets each one’s stored credential. The surfaces themselves and everything on them are untouched.',
  'md3.locks.gate.keysLegend': 'Turn both keys',
  'md3.locks.gate.keyCount': 'I want to remove {count} locks',
  'md3.locks.gate.keyScope': 'I have checked which locks those are: {scope}',
  'md3.locks.gate.sliderLabel': 'Slide all the way to authorize ({percent}%)',
  'md3.locks.gate.sliderValue': '{percent}% of the way',
  'md3.locks.gate.statusLocked': 'Turn both keys before the slider will move.',
  'md3.locks.gate.statusReady':
    'Both keys are turned. Slide all the way to authorize.',
  'md3.locks.gate.statusMoving': 'Keep going…',
  'md3.locks.gate.statusAuthorized': 'Authorized. Remove is now available.',
  'md3.locks.gate.emergencyExit': 'Emergency exit',
  'md3.locks.gate.confirm': 'Remove {count} locks',
  'md3.locks.setup.title': 'Lock {label}',
  'md3.locks.setup.titleEdit': 'Edit the lock on {label}',
  'md3.locks.setup.close': 'Close without saving',
  'md3.locks.setup.factorLegend': 'How this lock is answered',
  'md3.locks.setup.factorPassword': 'A password',
  'md3.locks.setup.factorOtp': 'A one-time password from your authenticator',
  'md3.locks.setup.otpUnavailable':
    'The one-time-password option needs the app’s authenticator, which is not available yet.',
  'md3.locks.setup.password': 'Password for this lock',
  'md3.locks.setup.passwordConfirm': 'Type it again',
  'md3.locks.setup.otpAccount': 'Authenticator entry for this lock',
  'md3.locks.setup.otpAccountHint':
    'The name of the entry in the app’s authenticator. The app never reads the secret itself.',
  'md3.locks.setup.durationLegend': 'How long an unlock lasts',
  'md3.locks.setup.lockOnLaunch': 'Lock again when the app starts',
  'md3.locks.setup.forFun':
    'This is just for fun. It is not security, nothing is encrypted, and it does not keep out anybody else who has this computer.',
  'md3.locks.setup.recovery':
    'Forgotten the credential? Delete this folder and every lock goes with it: {folder}',
  'md3.locks.setup.recoveryUnknown':
    'Forgotten the credential? Deleting the app’s local application-data folder removes every lock. The folder’s exact path could not be read just now.',
  'md3.locks.setup.explanationShow': 'What does this do?',
  'md3.locks.setup.explanationHide': 'Hide the explanation',
  'md3.locks.setup.explanation':
    'A locked surface keeps its name and shows a lock beside it. Opening it asks for this lock’s own credential and nothing else: unlocking one surface never unlocks another, and a locked value inside a locked tab is two locks with two answers.',
  'md3.locks.setup.provenanceDefault':
    'Using the shipped default: {value}. Nothing has been saved for this lock yet.',
  'md3.locks.setup.provenanceStored': 'Saved for this lock: {value}.',
  'md3.locks.setup.save': 'Save this lock',
  'md3.locks.setup.cancel': 'Cancel',
  'md3.locks.setup.errorTooShort':
    'A lock password must be {min} to {max} characters.',
  'md3.locks.setup.errorMismatch': 'The two passwords are different.',
  'md3.locks.setup.errorOtpAccount':
    'Name the authenticator entry this lock reads.',
  'md3.locks.setup.errorVault': 'The lock was not saved: {error}',
  'md3.locks.setup.errorOtpUnavailable':
    'The lock was not saved: the app’s authenticator is not available, so a one-time password cannot be checked.',
  'md3.locks.setup.minutesLabel': 'Minutes',
  'md3.locks.unlock.title': 'Unlock {label}',
  'md3.locks.unlock.passwordLabel': 'This lock’s password',
  'md3.locks.unlock.codeLabel': 'The current code from your authenticator',
  'md3.locks.unlock.durationLegend': 'Keep it unlocked',
  'md3.locks.unlock.submit': 'Unlock',
  'md3.locks.unlock.cancel': 'Cancel',
  'md3.locks.unlock.forFun':
    'This is just for fun. It is not security, nothing is encrypted, and it does not keep out anybody else who has this computer.',
  'md3.locks.unlock.recovery':
    'Forgotten it? Delete this folder and every lock goes with it: {folder}',
  'md3.locks.unlock.recoveryUnknown':
    'Forgotten it? Deleting the app’s local application-data folder removes every lock. The folder’s exact path could not be read just now.',
  'md3.locks.unlock.forgotten': 'Forgotten your password?',
  'md3.locks.unlock.forgottenUnavailable':
    'Support Tickets is not wired up in this build, so use the folder above.',
  'md3.locks.unlock.throttled':
    'Too many wrong answers just now. Try again in {seconds} seconds, or use the recovery route above.',
  'md3.locks.unlock.unavailable':
    'This lock cannot be checked right now: its credential is missing from the credential vault. Use the recovery route above.',
  'md3.locks.unlock.success': 'Unlocked {label}.',
  'md3.locks.unlock.lockAgain': 'Lock again',
  'md3.locks.unlock.minutesLabel': 'Minutes',
  'md3.locks.menu.lockTab': 'Lock this tab…',
  'md3.locks.menu.lockGroup': 'Lock this group…',
  'md3.locks.menu.editLock': 'Edit this lock…',
  'md3.locks.menu.removeLock': 'Remove this lock',
  'md3.locks.menu.lockAgain': 'Lock again now',
  'md3.locks.menu.manage': 'Manage locks…',
  'md3.locks.affordance.locked': '{label} is locked. Open it to unlock.',
  'md3.locks.affordance.unlocked':
    '{label} is unlocked. Select to lock it again.',
  'md3.locks.searchResult.locked': '{label} (locked)',
  'md3.locks.bulkClose.excluded':
    '{count} locked tabs were left open, the same way pinned tabs are.',
  'md3.locks.settings.title': 'Surface locks',
  'md3.locks.settings.description':
    'A for-fun password or one-time-password speed bump on a tab, a tab group or an appearance value. Off by default; every lock has its own credential.',
  'md3.locks.setupLead.plain':
    'Set a credential for this lock. It is answered on its own, and no other lock shares it.',
  'md3.locks.setupLead.light':
    'Give this lock its own credential. Nothing else uses it, and nothing else is opened by it.',
  'md3.locks.setupLead.playful':
    'One lock, one credential, no group discount. Nothing else uses it, and nothing else is opened by it.',
  'md3.locks.setupLead.maximum':
    'This lock gets its own credential and refuses to share it with any other lock, out of principle. Nothing else uses it, and nothing else is opened by it.',
  'md3.locks.unlockLead.plain':
    'This surface is locked. Answer this lock to open it.',
  'md3.locks.unlockLead.light':
    'This surface is locked. Only this lock’s own credential opens it.',
  'md3.locks.unlockLead.playful':
    'You locked this one yourself. Only this lock’s own credential opens it.',
  'md3.locks.unlockLead.maximum':
    'Past you locked this and told nobody. Only this lock’s own credential opens it.',
  'md3.locks.wrongAttempt.plain':
    'That did not match. Wrong answers so far: {failures}. If you cannot remember it, delete the folder named below.',
  'md3.locks.wrongAttempt.light':
    'Not that one. Wrong answers so far: {failures}. If you cannot remember it, delete the folder named below.',
  'md3.locks.wrongAttempt.playful':
    'Nope. Wrong answers so far: {failures}. If you cannot remember it, delete the folder named below — that is the whole recovery plan.',
  'md3.locks.wrongAttempt.maximum':
    'Still no. Wrong answers so far: {failures}. Forgetting a toy lock is entirely normal, so if you cannot remember it, delete the folder named below — that is the whole recovery plan.',
  'md3.locks.managerLead.plain':
    'Every lock is listed here and can be edited or removed one at a time or in bulk.',
  'md3.locks.managerLead.light':
    'Every lock is listed here, each with its own credential, and can be edited or removed one at a time or in bulk.',
  'md3.locks.managerLead.playful':
    'The complete list of speed bumps you have laid for yourself. Each has its own credential, and can be edited or removed one at a time or in bulk.',
  'md3.locks.managerLead.maximum':
    'Behold: every speed bump you have laid across your own path, catalogued. Each has its own credential, and can be edited or removed one at a time or in bulk.',
  'md3.history.filterPlaceholder': 'Filter commits',
  'md3.history.fieldLabel': 'commits',
  'md3.history.chipRowLabel': 'Commit filters',
  'md3.history.chip.unpushed': 'Unpushed',
  'md3.history.chip.tagged': 'Tagged',
  'md3.history.chip.mine': 'Mine',
  'md3.history.chip.merges': 'Merges',
  'md3.history.toggleGraph': 'Commit graph',
  'md3.history.toggleDates': 'Absolute dates',
  'md3.history.sortAndGroup': 'Sort and group',
  'md3.history.listLabel': 'Commits',
  'md3.history.empty': 'No commits match this filter.',
  'md3.history.byline': '{author} · {time}',
  'md3.history.detail': '{stat} · {files} files · {kind} · {branch}',
  'md3.history.detailWithoutStats': '{kind} · {branch}',
  'md3.history.kind.merge': 'merge commit',
  'md3.history.kind.verified': 'verified',
  'md3.history.kind.unverified': 'unverified',
  'md3.history.notPushed': 'Not pushed',
  'md3.history.pin': 'Pin commit',
  'md3.history.unpin': 'Unpin commit',
  'md3.history.rowMenu': 'Actions for commit {sha}',
  'md3.history.rowMenuHint': 'Revert, cherry-pick, tag, reset',
  'md3.history.fileMenu': 'Open in editor, copy path, blame',
  'md3.history.sheet.byline': '{author} committed {time}',
  'md3.history.sheet.close': 'Close commit details',
  'md3.history.sheet.copySha': 'Copy the SHA {sha}',
  'md3.history.sheet.fileCount': '{count} files',
  'md3.history.sheet.fileListLabel': 'Files in this commit',
  'md3.history.sheet.fileEntry': '{path}, {stat}',
  'md3.history.sheet.viewOnGitHub': 'View on GitHub',
  'md3.history.sheet.revert': 'Revert commit',
  'md3.history.sheet.menu': 'Cherry-pick, tag, reset',
  'md3.destructiveGate.eyebrow': 'Destructive action',
  'md3.destructiveGate.lead.plain':
    'Turn both keys, then slide the authorization all the way to the end. Nothing happens before that.',
  'md3.destructiveGate.lead.light':
    'Two keys, then one slider all the way to the end. The ceremony is deliberate: nothing happens before the slider lands.',
  'md3.destructiveGate.lead.playful':
    'Two keys and a full-length slider stand between you and this one. It is deliberately more work than a stray click, and nothing at all happens until the slider lands on the far end.',
  'md3.destructiveGate.lead.maximum':
    'Behold the two-key launch console. Turn both, then walk the slider all the way to the far end like you mean it. Nothing whatsoever happens until it gets there, which is the entire reason you are being made to do all this.',
  'md3.destructiveGate.irreversibleLabel': 'Cannot be undone:',
  'md3.destructiveGate.keysLegend': 'Turn both keys to unlock the slider',
  'md3.destructiveGate.keyTarget': 'I checked the exact target: {target}',
  'md3.destructiveGate.keyEffect': 'I accept the exact effect: {effect}',
  'md3.destructiveGate.sliderLabel': 'Slide fully to the end to authorize',
  'md3.destructiveGate.sliderValue': '{percent}% authorized',
  'md3.destructiveGate.stateLocked':
    'Both keys are required before the slider moves.',
  'md3.destructiveGate.stateArmed':
    'Both keys are turned. Slide fully to the end to authorize.',
  'md3.destructiveGate.stateMoving':
    'Keep going. Nothing is destroyed until the slider reaches the far end.',
  'md3.destructiveGate.stateAuthorized':
    'Authorized. The confirm button is now available.',
  'md3.destructiveGate.emergencyExit': 'Emergency exit',
  'md3.destructiveGate.emergencyExitName':
    'Emergency exit — close without running this destructive action',
  'md3.destructiveGate.busy':
    'Running. The gate stays open until the exact result is known.',
  'md3.inbox.gate.title': 'Delete {count} notifications?',
  'md3.inbox.gate.summary':
    'This deletes {count} notifications from the inbox: {scope}.',
  'md3.inbox.gate.irreversible':
    'Deleted notifications cannot be restored from the inbox.',
  'md3.inbox.gate.keyTarget': '{count} notifications — {scope}',
  'md3.inbox.gate.keyEffect':
    'They leave the inbox and cannot be restored from it.',
  'md3.inbox.gate.confirm': 'Delete {count}',
  'md3.auth.pane': 'Authenticator',
  'md3.auth.list': 'Registered second factors',
  'md3.auth.searchPlaceholder': 'Search factors',
  'md3.auth.searchField': 'authenticator factors',
  'md3.auth.invalidPattern':
    'That pattern is not valid, so nothing has been filtered out yet.',
  'md3.auth.filters': 'Group filters',
  'md3.auth.chipUngrouped': 'Ungrouped',
  'md3.auth.addFactor': 'Add factor',
  'md3.auth.empty.none.plain':
    'No second factors are registered. Add one and this app will show its codes.',
  'md3.auth.empty.none.light':
    'Nothing registered yet. Add a factor and the codes turn up here, thirty seconds at a time.',
  'md3.auth.empty.none.playful':
    'An empty authenticator, which is at least very fast. Add a factor and it will start counting down for you.',
  'md3.auth.empty.none.maximum':
    'Zero factors. Nothing to count, nothing to copy, nothing to lose — a spectacular result for a security tool and a useless one for you. Add a factor and it will earn its keep.',
  'md3.auth.empty.noMatch': 'No factor matches.',
  'md3.auth.selectAllFiltered': 'Select the {count} matching factors',
  'md3.auth.selectAllEverything': 'Select all {count} factors',
  'md3.auth.selectionCount': '{count} selected',
  'md3.auth.invertSelection': 'Invert selection',
  'md3.auth.bulkGroup': 'Move into group',
  'md3.auth.bulkDelete': 'Delete',
  'md3.auth.bulkExport': 'Export',
  'md3.auth.scopedAction': '{label} — {scope}',
  'md3.auth.moreActions': 'More authenticator actions',
  'md3.auth.scope.selection': '{count} selected factors',
  'md3.auth.scope.filtered': '{count} factors matching the current filters',
  'md3.auth.scope.all': 'all {count} factors',
  'md3.auth.scope.one': 'one factor',
  'md3.auth.explain.toggle': 'How this list works',
  'md3.auth.explain.body':
    'Codes are computed on this machine from the system clock and a secret held in the operating system’s credential store. Nothing is sent anywhere, there is no account and no sync, and an ordinary export carries every field except the secret.',
  'md3.auth.explain.provenance':
    'Default in use: new factors are created as {algorithm} with {digits} digits every {period} seconds — the shipped values, because nothing has changed them.',
  'md3.auth.row.select': 'Select {title}',
  'md3.auth.row.code': 'Current code for {title}',
  'md3.auth.row.codeChanged': 'New code for {title}: {code}',
  'md3.auth.row.copyCode': 'Copy the current code for {title}',
  'md3.auth.row.nextCode': 'Next: {code}',
  'md3.auth.row.countdown': '{seconds}s',
  'md3.auth.row.countdownText':
    'This code is valid for another {seconds} seconds',
  'md3.auth.row.missingSecret':
    'No secret is stored for this factor, so it cannot produce a code. Delete it and register it again.',
  'md3.auth.row.edit': 'Edit {title}',
  'md3.auth.row.delete': 'Delete {title}',
  'md3.auth.row.added': 'Registered {timestamp}',
  'md3.auth.row.parameters': '{algorithm}, {digits} digits, every {period}s',
  'md3.auth.clock.ok':
    'This machine’s clock matches the reference within {tolerance} seconds, so codes will be accepted.',
  'md3.auth.clock.ahead':
    'This machine’s clock is {seconds} seconds ahead of the reference, which is more than the {tolerance} seconds these codes tolerate. Fix the system time or the codes below will be refused.',
  'md3.auth.clock.behind':
    'This machine’s clock is {seconds} seconds behind the reference, which is more than the {tolerance} seconds these codes tolerate. Fix the system time or the codes below will be refused.',
  'md3.auth.clock.unverified':
    'Nothing has been compared against this machine’s clock, so whether these codes will be accepted is unknown.',
  'md3.auth.toast.registered': 'Registered {title}',
  'md3.auth.toast.edited': 'Updated {title}',
  'md3.auth.toast.deleted': 'Deleted {title}',
  'md3.auth.toast.deletedMany': 'Deleted {count} factors',
  'md3.auth.toast.vaultFailed':
    '{count} secrets could not be removed from the credential store and are still on this machine.',
  'md3.auth.toast.grouped': 'Moved {count} factors into {group}',
  'md3.auth.toast.ungrouped': 'Moved {count} factors out of every group',
  'md3.auth.toast.copied': 'Copied the code for {title}',
  'md3.auth.toast.exported':
    'Exported {count} factors as {format}, without their secrets',
  'md3.auth.toast.secretsExported':
    'Exported {count} working secrets in the clear',
  'md3.auth.toast.selectedAll': 'Selected all {count} factors',
  'md3.auth.toast.moved': 'Moved {title}',
  'md3.auth.listMenu.title': 'Authenticator',
  'md3.auth.listMenu.selectFiltered': 'Select the {count} matching factors',
  'md3.auth.listMenu.selectEverything': 'Select all {count} factors',
  'md3.auth.listMenu.invert': 'Invert selection',
  'md3.auth.listMenu.clearSelection': 'Clear selection',
  'md3.auth.listMenu.group': 'Move… into group…',
  'md3.auth.listMenu.deleteScope': 'Delete {count} factors…',
  'md3.auth.listMenu.export': 'Export {count} factors…',
  'md3.auth.listMenu.exportSecrets': 'Export {count} secrets in the clear…',
  'md3.auth.rowMenu.title': 'Factor',
  'md3.auth.rowMenu.copyCode': 'Copy the current code',
  'md3.auth.rowMenu.copyNext': 'Copy the next code',
  'md3.auth.rowMenu.edit': 'Edit this factor…',
  'md3.auth.rowMenu.group': 'Move… into group…',
  'md3.auth.rowMenu.moveUp': 'Move up',
  'md3.auth.rowMenu.moveDown': 'Move down',
  'md3.auth.rowMenu.select': 'Add to the selection',
  'md3.auth.rowMenu.deselect': 'Remove from the selection',
  'md3.auth.rowMenu.delete': 'Delete this factor',
  'md3.auth.rowMenu.exportOne': 'Export this factor…',
  'md3.auth.exportMenu.title': 'Export without secrets',
  'md3.auth.exportMenu.filterPlaceholder': 'Filter formats',
  'md3.auth.groupMenu.title': 'Move into group',
  'md3.auth.groupMenu.filterPlaceholder': 'Filter groups',
  'md3.auth.groupMenu.ungrouped': 'No group',
  'md3.auth.groupMenu.empty':
    'No groups exist yet. Name one while editing a factor and it will appear here.',
  'md3.auth.export.omissionNotice':
    'Secrets are deliberately omitted from this file. Every factor below lists its issuer, account and parameters only.',
  'md3.auth.secrets.warning':
    'This file contains working second factors in the clear. Anyone who reads it can produce your codes.',
  'md3.auth.gate.title': 'Delete {count} factors',
  'md3.auth.gate.summary':
    'Deletes {count} registered factors ({scope}) and forgets their secrets.',
  'md3.auth.gate.irreversible':
    'The secrets are removed from this machine’s credential store. Nothing here can bring them back — each account would have to issue you a new factor.',
  'md3.auth.gate.keyTarget': '{count} factors — {scope}',
  'md3.auth.gate.keyEffect':
    'Their secrets leave this machine and cannot be recovered.',
  'md3.auth.gate.confirm': 'Delete {count}',
  'md3.auth.secretsGate.title': 'Export {count} secrets in the clear',
  'md3.auth.secretsGate.summary':
    'Writes {count} working second factors ({scope}) into a plain text file as otpauth:// links.',
  'md3.auth.secretsGate.irreversible':
    'Once the file is written this app cannot take it back. Anyone who reads it can produce your codes for those accounts.',
  'md3.auth.secretsGate.keyTarget': '{count} factors — {scope}',
  'md3.auth.secretsGate.keyEffect':
    'The file will hold usable secrets, not just a list of accounts.',
  'md3.auth.secretsGate.confirm': 'Export {count} secrets',
  'md3.auth.register.title': 'Add a second factor',
  'md3.auth.register.editTitle': 'Edit {title}',
  'md3.auth.register.close': 'Close without adding a factor',
  'md3.auth.register.sourceLegend': 'Where the secret comes from',
  'md3.auth.register.source.generate': 'Generate here',
  'md3.auth.register.source.uri': 'Paste a link',
  'md3.auth.register.source.manual': 'Type the secret',
  'md3.auth.register.source.image': 'Read an image',
  'md3.auth.register.source.clipboard': 'Read the clipboard',
  'md3.auth.register.source.camera': 'Scan with a camera',
  'md3.auth.register.hint.generate':
    'This app generates a secret on this machine and draws the QR for you to scan into the account you are protecting.',
  'md3.auth.register.hint.uri':
    'Paste the otpauth:// link the issuer gave you. It is read here and sent nowhere.',
  'md3.auth.register.hint.manual':
    'Type the base32 secret and its parameters exactly as the issuer stated them.',
  'md3.auth.register.hint.image':
    'Choose a saved QR image. It is decoded on this machine.',
  'md3.auth.register.hint.clipboard':
    'Reads a QR image, or an otpauth:// link, out of the clipboard.',
  'md3.auth.register.hint.camera':
    'Points a camera on this machine at the QR the issuer is showing you.',
  'md3.auth.register.issuerLabel': 'Issuer',
  'md3.auth.register.issuerPlaceholder': 'The service this factor protects',
  'md3.auth.register.accountLabel': 'Account',
  'md3.auth.register.accountPlaceholder': 'Your username or address there',
  'md3.auth.register.groupLabel': 'Group',
  'md3.auth.register.groupPlaceholder': 'Leave empty for no group',
  'md3.auth.register.algorithmLabel': 'Algorithm',
  'md3.auth.register.digitsLabel': 'Digits',
  'md3.auth.register.periodLabel': 'Seconds per code',
  'md3.auth.register.secretLabel': 'Base32 secret',
  'md3.auth.register.secretPlaceholder': 'Letters A–Z and digits 2–7',
  'md3.auth.register.uriLabel': 'otpauth:// link',
  'md3.auth.register.uriPlaceholder': 'otpauth://totp/…',
  'md3.auth.register.revealSecret': 'Show the secret',
  'md3.auth.register.hideSecret': 'Hide the secret',
  'md3.auth.register.secretHidden':
    'The secret is hidden. Show it only if you are pairing by hand rather than scanning.',
  'md3.auth.register.copySecret': 'Copy the secret',
  'md3.auth.register.copiedSecret': 'Copied the secret to the clipboard',
  'md3.auth.register.qrAlt':
    'Pairing QR for {account} at {issuer}. It encodes the same secret shown beside it, using {algorithm} with {digits} digits every {period} seconds.',
  'md3.auth.register.qrAltNoIssuer':
    'Pairing QR for {account}. It encodes the same secret shown beside it, using {algorithm} with {digits} digits every {period} seconds.',
  'md3.auth.register.qrCaption':
    'Scan this with the account you are protecting, or type the secret beside it.',
  'md3.auth.register.parameterSummary':
    '{algorithm} · {digits} digits · {period} seconds',
  'md3.auth.register.chooseImage': 'Choose a QR image',
  'md3.auth.register.readClipboard': 'Read the clipboard',
  'md3.auth.register.startCamera': 'Start the camera',
  'md3.auth.register.stopCamera': 'Stop the camera',
  'md3.auth.register.cameraLive':
    'The camera is running. Hold the QR square to the lens; a code photographed at a steep angle cannot be read.',
  'md3.auth.register.cameraPreview': 'Live camera preview',
  'md3.auth.register.cameraMissing':
    'This machine has no camera, so there is nothing to scan with. Read the QR from an image file instead.',
  'md3.auth.register.cameraRefused':
    'The camera was refused. Grant this app camera access, or read the QR from an image file instead.',
  'md3.auth.register.confirmHeading': 'Confirm the pairing',
  'md3.auth.register.confirmHint.plain':
    'Type one current code back. The factor is added only once a code matches, so a mis-scanned secret cannot lock you out later.',
  'md3.auth.register.confirmHint.light':
    'Type one code back so we both know it works. The factor is added only once a code matches — better to find a mis-scanned secret now than at a login screen.',
  'md3.auth.register.confirmHint.playful':
    'One code, typed back, and we are done. The factor is added only once a code matches, because discovering a mis-scanned secret at a login screen is nobody’s idea of a good evening.',
  'md3.auth.register.confirmHint.maximum':
    'Prove it. Type one current code back at us. The factor is added only once a code matches, because the alternative is a beautifully stored secret that produces confident, wrong, universally rejected digits — and you find that out at the worst possible moment.',
  'md3.auth.register.confirmLabel': 'Current code',
  'md3.auth.register.confirmPlaceholder': 'The code showing right now',
  'md3.auth.register.verifyFailed':
    'That code does not match this secret. Check the code, and check that this machine’s clock is right.',
  'md3.auth.register.add': 'Add factor',
  'md3.auth.register.save': 'Save changes',
  'md3.auth.register.cancel': 'Cancel',
  'md3.auth.register.error.badUri':
    'That is not an otpauth:// link this app can read.',
  'md3.auth.register.error.wrongType':
    'That link is for a counter-based factor. This authenticator reads time-based codes only.',
  'md3.auth.register.error.badSecret':
    'That secret is not valid base32. It should be letters A to Z and digits 2 to 7.',
  'md3.auth.register.error.missingAccount':
    'That link carries no account name, so there is nothing to file the factor under.',
  'md3.auth.register.error.noQr': 'No QR was found in that image.',
  'md3.auth.register.error.unreadableFile':
    'That file could not be read as an image.',
  'md3.auth.register.error.notSquare':
    'A QR was found but its grid could not be read. Hold the code square to the lens and try again.',
  'md3.auth.register.error.damaged':
    'A QR was found but is too damaged to read.',
  'md3.auth.register.error.unsupported':
    'That QR carries content this app cannot read.',
  'md3.auth.register.error.encodeFailed':
    'The pairing link is too long to draw as a QR: {detail}',
  'md3.auth.register.error.accountRequired': 'An account name is required.',
  'md3.auth.register.explain.toggle': 'What happens to this secret',
  'md3.auth.register.explain.storage':
    'The secret is generated on this machine and kept in the operating system’s credential store under this factor’s own id. It never enters the settings file, an export, a log, a screenshot or the app’s local history, and it never leaves this machine.',
  'md3.auth.register.explain.provenanceDefault':
    'Default in use: {algorithm}, {digits} digits, every {period} seconds — the shipped values, because nothing has stated anything different.',
  'md3.auth.register.explain.provenanceIssuer':
    'Set by the issuer: {algorithm}, {digits} digits, every {period} seconds — read from the link you supplied, not from this app’s defaults.',

  // Bulk actions across every MD3 list destination. English.
  'md3.bulk.selectAllFiltered': 'Select all {count} matching these filters',
  'md3.bulk.selectAllEverything': 'Select all {count}',
  'md3.bulk.selectionCount': '{count} selected',
  'md3.bulk.invertSelection': 'Invert selection',
  'md3.bulk.clearSelection': 'Clear selection',
  'md3.bulk.export': 'Export',
  'md3.bulk.scopedAction': '{label} — {scope}',
  'md3.bulk.scopeSelected': '{count} selected',
  'md3.bulk.scopeFiltered': '{count} matching these filters',
  'md3.bulk.scopeEverything': 'all {count}',
  'md3.bulk.excluded': '{count} skipped: {reason}',
  'md3.bulk.exportMenu.title': 'Export {scope}',
  'md3.bulk.exportMenu.filterPlaceholder': 'Filter formats',
  'md3.bulk.toast.exported': 'Exported {count} as {format}.',
  'md3.bulk.toast.exportedLossy': 'Exported {count} as {format}. {loss}.',
  'md3.listExport.schema': 'UTF-8, LF line endings. {count} fields: {fields}.',
  'md3.listExport.lossLineBreaks':
    'Line breaks in {fields} become spaces in this format',
  'md3.destructiveGate.previewHeading': 'This will affect {count}:',
  'md3.destructiveGate.previewExcludedHeading':
    '{count} will be left alone — {reason}:',
  'md3.branches.bulkLabel': 'Bulk actions for branches',
  'md3.branches.bulkPin': 'Pin',
  'md3.branches.bulkHide': 'Hide',
  'md3.branches.bulkDelete': 'Delete',
  'md3.branches.bulkCopyNames': 'Copy names',
  'md3.branches.bulkSkipCurrent': 'the branch you have checked out',
  'md3.branches.bulkSkipCannotHide': 'already hidden, or cannot be hidden',
  'md3.branches.row.select': 'Select {name} for a bulk action',
  'md3.branches.gate.title': 'Delete {count} branches',
  'md3.branches.gate.summary':
    'This deletes {count} branches ({scope}) from this computer.',
  'md3.branches.gate.irreversible':
    'A commit reachable from no other branch goes with it, and this app cannot bring it back.',
  'md3.branches.gate.keyTarget': 'Delete {count} branches ({scope})',
  'md3.branches.gate.keyEffect': 'I understand these branches will be deleted',
  'md3.branches.gate.confirm': 'Delete {count} branches',
  'md3.branches.detail.notCompared': 'not compared yet',
  'md3.branches.detail.tracksGone':
    'tracked {upstream}, now gone from the remote',
  'md3.branches.mergeAllProgressUnknown':
    'Merging all branches, {completed} done so far',
  'md3.branches.mergeAllProgressBranchUnknown':
    'Merging {branch}, {completed} done so far',
  'md3.history.bulkLabel': 'Bulk actions for commits',
  'md3.history.bulkCopyShas': 'Copy SHAs',
  'md3.history.row.select': 'Select the commit {summary} for a bulk action',
  'md3.history.detailWithoutBranch': '{kind} · {stat} · {files}',
  'md3.history.detailWithoutStatsOrBranch': '{kind}',
  'md3.history.sheet.statsPending': 'Counting what changed',
  'md3.history.sheet.fileEntryWithoutStats': '{path}',
  'md3.actions.meta.number': '#{number}',
  'md3.actions.detail.actor': 'triggered by {actor}',
  'md3.actions.detail.jobs': '{jobs} jobs',
  'md3.actions.detail.attempt': 'attempt {attempt}',
  'md3.actions.status.queued': 'queued',
  'md3.actions.status.running': 'running',
  'md3.actions.status.success': 'success',
  'md3.actions.status.failed': 'failed',
  'md3.actions.status.cancelled': 'cancelled',
  'md3.actions.status.skipped': 'skipped',
  'md3.actions.status.neutral': 'neutral',
  'md3.actions.status.timedOut': 'timed out',
  'md3.actions.status.actionRequired': 'action required',
  'md3.actions.status.stale': 'stale',
  'md3.actions.status.startupFailure': 'failed to start',
  'md3.adapters.day.today': 'Today',
  'md3.adapters.day.yesterday': 'Yesterday',
  'md3.adapters.branch.pullRequestOpen': 'pull request open',
  'md3.adapters.branch.metaUpdatedBy': 'Updated {when} by {author}',
  'md3.adapters.agent.busy':
    'The agent is still working. Pause it before sending another instruction.',
  'md3.adapters.agent.noAgent': 'No agent is attached to this worktree.',
  'md3.adapters.agent.noInstruction':
    'This session has no recorded instruction to resume. Type one below and send it.',
  'md3.adapters.agent.noRunner':
    '{agent} is not installed on this computer, so nothing can be sent to it.',
  'md3.adapters.agent.instructionSentTitle': 'Sent to {agent}',
  'md3.adapters.agent.instructionSentBody': '{agent} is working on {name}.',
  'md3.adapters.agent.instructionRefusedTitle': 'Nothing was sent',
  'md3.adapters.agent.permissions.read': 'read',
  'md3.adapters.agent.permissions.commit': 'commit',
  'md3.adapters.agent.permissions.push': 'push',
  'md3.adapters.agent.permissions.none': 'no permissions granted',
  'md3.adapters.agent.permissions.granted': '{list} permissions',
  'md3.adapters.agent.permissions.asks': '{name} on request',
  'md3.inbox.time.unknown': 'unknown time',
  'md3.repositories.remotesUnknown': 'remotes not counted',
  'md3.terminal.alreadyRunning':
    'A command is already running in this session.',
  'md3.terminal.noRepository': 'Open a repository before starting a terminal.',
  'md3.terminal.sessionLabelNumbered': '{shell} — {repository} ({number})',
  'md3.compose.contextWithoutStats': '{included} of {total} files on {branch}',
  'md3.diffPane.fileTabNameWithoutStats': '{name} — {path}',
  'md3.search.invalidPattern':
    'Nothing is being filtered: that pattern will not compile. {reason}',
  'md3.search.patternTooLong':
    'Keep the pattern to {limit} characters or fewer.',
  'palette.authenticator': 'Open the authenticator',
  'palette.authenticatorDescription':
    'Read a live one-time code, or register a new account by QR or by typing its secret.',
  'palette.surfaceLocks': 'Manage surface locks',
  'palette.surfaceLocksDescription':
    'See every locked tab and appearance value, and remove a lock you no longer want.',
  'palette.supportTickets': 'Open Support Tickets',
  'palette.supportTicketsDescription':
    'The local, entirely fictional support desk that walks you through resetting a forgotten lock.',
  'authenticatorSettings.heading': 'Authenticator',
  'authenticatorSettings.manage': 'Manage authenticator accounts…',
  'authenticatorSettings.close': 'Close the authenticator',
  'authenticatorSettings.explanationSummary': 'What this setting changes',
  'authenticatorSettings.boundaryNote':
    'Codes are generated on this computer and no account is involved. Secrets live in the operating system credential vault, never in settings files or exports.',
  'authenticatorSettings.provenanceNone':
    'No accounts are registered on this computer.',
  'authenticatorSettings.provenanceOne':
    'One account is registered on this computer.',
  'authenticatorSettings.provenanceMany':
    '{count} accounts are registered on this computer.',
  'authenticatorSettings.provenanceUnread':
    'The registered accounts have not been read yet.',
  'authenticatorSettings.unavailable':
    'The credential vault could not be read, so no account can be shown: {error}',
  'surfaceLocks.heading': 'Surface locks',
  'surfaceLocks.manage': 'Manage locks…',
  'surfaceLocks.close': 'Close the lock manager',
  'surfaceLocks.explanationSummary': 'What this setting changes',
  'surfaceLocks.boundaryNote':
    'This is a speed bump for fun, not security: it is not encryption and it protects nothing from anyone else using this computer. Forgot a lock? Delete the application data folder to clear every one of them.',
  'surfaceLocks.provenanceNone': 'Nothing on this computer is locked.',
  'surfaceLocks.provenanceOne': 'One surface on this computer is locked.',
  'surfaceLocks.provenanceMany':
    '{count} surfaces on this computer are locked.',
  'supportTicketsSetting.explanationSummary': 'What this setting changes',
  'supportTicketsSetting.boundaryNote':
    'Nothing is sent anywhere. No ticket exists outside this computer, no request is made, and nobody is reading it.',
  'supportTicketsSetting.provenanceNone':
    'No tickets have been filed on this computer.',
  'supportTicketsSetting.provenanceOne':
    'One ticket has been filed on this computer.',
  'supportTicketsSetting.provenanceMany':
    '{count} tickets have been filed on this computer.',
  'md3.agents.bulkLabel': 'Bulk actions for agent sessions',
  'md3.agents.bulkPause': 'Pause',
  'md3.agents.bulkResume': 'Resume',
  'md3.agents.bulkOpenLog': 'Open logs',
  'md3.agents.bulkDuplicate': 'Duplicate',
  'md3.agents.bulkDelete': 'Delete',
  'md3.agents.bulkSkipNotRunning': 'they are not running',
  'md3.agents.bulkSkipNotPaused': 'they are not paused',
  'md3.agents.bulkSkipMissing': 'their worktree is gone from disk',
  'md3.agents.bulkSkipProtected':
    'they are the main worktree, locked, or already gone',
  'md3.agents.gate.title': 'Delete {count} sessions',
  'md3.agents.gate.summary':
    'This deletes {count} agent sessions ({scope}), their worktrees and their transcripts.',
  'md3.agents.gate.irreversible':
    'A deleted session, its worktree and its transcript cannot be recovered.',
  'md3.agents.gate.keyTarget': 'Delete {count} sessions ({scope})',
  'md3.agents.gate.keyEffect':
    'I understand these worktrees and transcripts will be destroyed',
  'md3.agents.gate.confirm': 'Delete {count} sessions',
  'md3.agents.row.select': 'Select session {title}',
  'md3.changes.bulkLabel': 'Bulk actions for changed files',
  'md3.changes.bulkInclude': 'Include',
  'md3.changes.bulkExclude': 'Exclude',
  'md3.changes.bulkCopyPaths': 'Copy paths',
  'md3.changes.bulkDiscard': 'Discard',
  'md3.changes.bulkSkipIncluded': 'already included in the commit',
  'md3.changes.bulkSkipExcluded': 'already excluded from the commit',
  'md3.changes.row.select': 'Select {name} for a bulk action',
  'md3.changes.gate.title': 'Discard changes to {count} files',
  'md3.changes.gate.summary':
    'This throws away every working-tree change to {count} files ({scope}).',
  'md3.changes.gate.irreversible':
    'These changes are in no commit. Once discarded, this app cannot bring them back.',
  'md3.changes.gate.keyTarget': 'Discard {count} files ({scope})',
  'md3.changes.gate.keyEffect': 'I understand these changes will be lost',
  'md3.changes.gate.confirm': 'Discard {count} files',
  'md3.history.bulkPin': 'Pin',
  'md3.history.bulkViewOnGitHub': 'View on GitHub',
  'md3.history.bulkRevert': 'Revert',
  'md3.history.bulkSkipMerge':
    'a merge commit needs a parent chosen before it can be reverted',
  'md3.history.gate.title': 'Revert {count} commits',
  'md3.history.gate.summary':
    'This writes one revert commit for each of {count} commits ({scope}) onto the current branch.',
  'md3.history.gate.irreversible':
    'The revert commits are real commits on the current branch, and undoing them means more history surgery.',
  'md3.history.gate.keyTarget': 'Revert {count} commits ({scope})',
  'md3.history.gate.keyEffect':
    'I understand a revert commit will be written for each one',
  'md3.history.gate.confirm': 'Revert {count} commits',
  'md3.history.kind.unchecked': 'signature not checked',
  'md3.repositories.bulkSkipMissing':
    'their working directory is gone from disk',
  'md3.actions.bulkSkipActive': 'still running',
  'md3.actions.bulkSkipFinished': 'already finished',
  'md3.actions.gate.title': 'Cancel {count} workflow runs',
  'md3.actions.gate.summary':
    'This abandons {count} of {scope}. Whatever each run had done so far goes with it.',
  'md3.actions.gate.irreversible':
    'A cancelled run cannot be resumed. It can only be started again from the beginning.',
  'md3.actions.gate.keyTarget': 'Key 1 — cancel {count} of {scope}',
  'md3.actions.gate.keyEffect':
    'Key 2 — I understand the unfinished work is lost',
  'md3.actions.gate.confirm': 'Cancel {count} runs',
  'md3.terminal.bulkLabel': 'Bulk actions for shells',
  'md3.terminal.bulkRestart': 'Restart',
  'md3.terminal.bulkClose': 'Close',
  'md3.terminal.bulkSelected': 'In the bulk selection',
  'md3.terminal.bulkSkipNotRunning': 'no command is running in them',
  'md3.terminal.bulkSkipHealthy': 'they have not exited or failed',
  'md3.terminal.gate.title': 'Close {count} shells',
  'md3.terminal.gate.summary':
    'This closes {count} shells ({scope}). Any command running in them is ended and their scrollback is discarded.',
  'md3.terminal.gate.irreversible': 'Discarded scrollback cannot be recovered.',
  'md3.terminal.gate.keyTarget': 'Close {count} shells ({scope})',
  'md3.terminal.gate.keyEffect':
    'I understand these shells and their scrollback will be gone',
  'md3.terminal.gate.confirm': 'Close {count} shells',
  'md3.inbox.bulkLabel': 'Bulk actions for notifications',
  'md3.inbox.bulkMute': 'Mute',
  'md3.inbox.bulkUnmute': 'Unmute',
  'md3.inbox.bulkCopyDetails': 'Copy details',
  'md3.inbox.bulkSkipAlreadyRead': 'already read',
  'md3.inbox.bulkSkipAlreadyUnread': 'already unread',
  'md3.inbox.bulkSkipAlreadyMuted': 'already muted',
  'md3.inbox.bulkSkipNotMuted': 'not muted',
  'md3.inbox.toast.mutedMany': 'Muted {count} threads',
  'md3.inbox.toast.unmutedMany': 'Unmuted {count} threads',
  'md3.locks.bulkLabel': 'Bulk actions for locks',
  'md3.locks.bulkLockAgain': 'Lock again',
  'md3.locks.bulkRemove': 'Remove locks…',
  'md3.locks.bulkSkipAlreadyLocked': 'already locked',

  // Bulk actions across every MD3 list destination. English.
  'md3.repositories.empty.plain': 'No repositories match.',
  'md3.repositories.empty.light': 'No repositories match that.',
  'md3.repositories.empty.playful':
    'No repositories match. The filter has been thorough.',
  'md3.repositories.empty.maximum':
    'Not one repository matches. The filter has swept the shelf clean and is standing there looking pleased with itself.',
  'md3.changes.empty.plain': 'No changed files match this filter.',
  'md3.changes.empty.light': 'Nothing changed matches this filter.',
  'md3.changes.empty.playful':
    'No changed files match this filter. Either everything is tidy or the filter is fussy.',
  'md3.changes.empty.maximum':
    'Not a single changed file survives this filter. Either the working tree is spotless or the filter has standards nobody can meet.',
  'md3.history.empty.plain': 'No commits match this filter.',
  'md3.history.empty.light': 'No commit matches this filter.',
  'md3.history.empty.playful':
    'No commits match this filter. History is being shy.',
  'md3.history.empty.maximum':
    'No commits match this filter at all. The entire history has reviewed your criteria and politely declined.',
  'md3.branches.empty.plain': 'No branch matches this filter.',
  'md3.branches.empty.light': 'No branch matches that.',
  'md3.branches.empty.playful': 'No branch matches this filter. Not one.',
  'md3.branches.empty.maximum':
    'No branch matches this filter. Every last one of them has looked at what you typed and wandered off.',
  'md3.actions.logEmpty.plain': 'No log output yet.',
  'md3.actions.logEmpty.light': 'Nothing has been logged yet.',
  'md3.actions.logEmpty.playful':
    'No log output yet. The run has not said anything.',
  'md3.actions.logEmpty.maximum':
    'No log output yet. The run is maintaining a dignified silence and has told us precisely nothing.',
  'md3.agents.emptyNoSessions.plain': 'No agent sessions yet.',
  'md3.agents.emptyNoSessions.light': 'No agent session has been started yet.',
  'md3.agents.emptyNoSessions.playful':
    'No agent sessions yet. Nobody has been put to work.',
  'md3.agents.emptyNoSessions.maximum':
    'No agent sessions yet. The whole crew is sitting around waiting to be given something to do.',
  'md3.inbox.empty.caughtUp.plain': 'You are all caught up.',
  'md3.inbox.empty.caughtUp.light': 'Nothing left to read.',
  'md3.inbox.empty.caughtUp.playful':
    'All caught up. Nothing is waiting for you.',
  'md3.inbox.empty.caughtUp.maximum':
    'Completely caught up. There is nothing here, nothing pending, and nothing quietly waiting to ambush you later.',
  'md3.terminal.noSessions.plain': 'No shell is open.',
  'md3.terminal.noSessions.light': 'No shell is open yet.',
  'md3.terminal.noSessions.playful':
    'No shell is open. Start one and the prompt is yours.',
  'md3.terminal.noSessions.maximum':
    'Not one shell is open. Start one, and a blinking cursor will appear entirely at your service and entirely without judgement.',
  'surfaceLocks.explanation.plain':
    'A lock asks for a password or a one-time code before a tab or an appearance value can be opened or changed. Each lock has its own credential; unlocking one never unlocks another. This is a self-imposed speed bump, not security.',
  'surfaceLocks.explanation.light':
    'A lock puts a password or a one-time code in front of a tab or an appearance value. Every lock carries its own credential, so opening one opens only that one. It is a speed bump you set for yourself, not security.',
  'surfaceLocks.explanation.playful':
    'A lock makes you prove yourself with a password or a one-time code before a tab or an appearance value will budge. Each lock keeps its own credential, so getting past one gets you past exactly one. It is a speed bump you built yourself, and it is not security.',
  'surfaceLocks.explanation.maximum':
    'A lock plants a password or a one-time code in front of a tab or an appearance value and refuses to budge without it. Every single lock hoards its own credential, so triumphantly opening one gets you exactly one, and the next is still standing there unimpressed. It is a speed bump you cheerfully built for yourself, and it is not security, not encryption, and no obstacle whatsoever to anyone else sitting at this computer.',
  'authenticatorSettings.explanation.plain':
    'The authenticator holds one-time-code accounts and shows their current codes. Register an account by scanning a QR code, pasting an otpauth link, or typing the secret. Codes are generated on this computer; no account and no network are involved.',
  'authenticatorSettings.explanation.light':
    'The authenticator keeps your one-time-code accounts and shows the current code for each. Add one by scanning a QR code, pasting an otpauth link, or typing the secret. Everything is generated here — no account, no network.',
  'authenticatorSettings.explanation.playful':
    'The authenticator is where your one-time-code accounts live and where their codes tick over. Scan a QR code, paste an otpauth link, or type the secret in by hand. Every code is worked out on this computer — no account, no network, nobody watching.',
  'authenticatorSettings.explanation.maximum':
    'The authenticator is the little vault where your one-time-code accounts sit, quietly counting down and producing a fresh six digits before you have finished reading the last six. Feed it by scanning a QR code, pasting an otpauth link, or typing the secret in by hand like a Victorian. Every code is worked out right here on this computer — no account to create, no network call to make, and nobody on the other end taking an interest.',
  'supportTicketsSetting.explanation.plain':
    'Support Tickets is a joke support desk that exists only on this computer. It walks a locked-out user to the real recovery route: opening the application data folder so it can be deleted by hand. Nothing is sent anywhere and nobody replies.',
  'supportTicketsSetting.explanation.light':
    'Support Tickets is a pretend support desk that lives only on this computer. Its job is to walk a locked-out user to the one thing that actually works: opening the application data folder so you can delete it yourself. Nothing is sent anywhere and nobody replies.',
  'supportTicketsSetting.explanation.playful':
    'Support Tickets is a support desk that is entirely made up and lives only on this computer. It takes your ticket, gives it a number, advances its status with great ceremony, and then does the only useful thing available: opens the application data folder so you can delete it yourself. Nothing is sent anywhere and nobody replies.',
  'supportTicketsSetting.explanation.maximum':
    'Support Tickets is a support desk of pure fiction, resident entirely on this computer, staffed by nobody. It will take your ticket, issue it a number, assign it a severity that will be honoured by no one, advance its status with all the ceremony of an organisation that has read the manual once, and then perform the single genuinely useful act in its repertoire: opening the application data folder so that you, personally, can delete it. Nothing is sent anywhere, no request is made, and no reply is coming.',
  'md3.changes.filter.new': 'New',
  'md3.changes.filter.modified': 'Modified',
  'md3.changes.filter.deleted': 'Deleted',
  'md3.changes.filter.included': 'Included',
  'md3.changes.filter.excluded': 'Excluded',
  'md3.inbox.kind.prReviewSubmit': 'Pull request review',
  'md3.inbox.kind.prComment': 'Pull request comment',
  'md3.inbox.kind.prChecksFailed': 'Failed checks',
  'md3.inbox.kind.appError': 'Application error',
  'md3.inbox.kind.cloneBatch': 'Batch clone',
  'md3.inbox.kind.autoCommit': 'Automatic commit',
  'md3.inbox.kind.mergeAll': 'Merge all',
  'md3.inbox.kind.autoPull': 'Automatic pull',
  'md3.inbox.kind.cheapLfs': 'Large file transfer',
  'md3.inbox.kind.buildRun': 'Build and run',
  'md3.inbox.kind.info': 'Information',
  'settingsSearch.entry.appearanceSurfaceLocks.title': 'Surface locks',
  'settingsSearch.entry.appearanceSurfaceLocks.desc':
    'Lock a tab or an appearance value behind a password or a one-time code, and manage the locks already set.',

  // Bulk actions across every MD3 list destination. English.
  'settingsSearch.entry.appearanceSupportTickets.title': 'Support Tickets',
  'settingsSearch.entry.appearanceSupportTickets.desc':
    'The local, entirely fictional support desk that walks a locked-out user to the application data folder. Nothing is sent anywhere.',
  'settingsSearch.entry.advancedAuthenticator.title': 'Authenticator',
  'settingsSearch.entry.advancedAuthenticator.desc':
    'Register one-time-code accounts by QR, otpauth link or typed secret, and read their live codes. Everything is generated on this computer.',

  // Bulk actions across every MD3 list destination. English.
  'classicExperience.heading': 'Interface mode',
  'classicExperience.toggleLabel': 'Use Classic mode',
  'classicExperience.explanationSummary': 'What this setting changes',
  'classicExperience.explanation.plain':
    'The app ships two interfaces. Material mode is the Material Design 3 shell, with a navigation drawer and eight destinations. Classic mode is the interface the app had before that rewrite: the repository tab strip, the classic toolbar, the sidebar and the repository workspace. Both reach the same features; only the layout differs, and switching takes effect immediately.',
  'classicExperience.explanation.light':
    'Two interfaces, one switch. Material mode is the new shell with its drawer and eight destinations; Classic mode is the tab strip, toolbar, sidebar and workspace from before the rewrite. Same features either way, different furniture, and the change lands immediately.',
  'classicExperience.explanation.playful':
    'Two interfaces, and you pick. Material mode brings the new shell with its drawer and eight destinations. Classic mode walks the old one back in exactly as it was: tab strip, toolbar, sidebar, workspace, every one of them where a decade of muscle memory left them. Neither can do anything the other cannot, and the change takes effect the moment you click it — no restart, no ceremony.',
  'classicExperience.explanation.maximum':
    'Two entire interfaces, and the switch is yours. Material mode gives you the Material Design 3 shell with its navigation drawer and its eight destinations. Classic mode strolls the whole pre-rewrite interface back to its old seat — tab strip, toolbar, sidebar, workspace, the crew present and correct and exactly where you left them. Not one capability lives on only one side of this switch: everything the classic chrome offered is carried into the shell, and everything the shell added opens perfectly well from the classic layout. It takes effect the instant you click it — no restart, no relaunch, no being told to try turning it off and on again.',
  'classicExperience.boundaryNote':
    'Neither mode can reach anything the other cannot. While Classic mode is on, the separate "Show the classic toolbar" setting no longer applies: the toolbar is part of that interface rather than a band above the Material pane.',
  'classicExperience.provenanceDefault':
    'No mode has been chosen on this computer, so the shipped one is in use: {value}.',
  'classicExperience.provenanceStored':
    'A mode was chosen on this computer: {value}.',
  'classicExperience.stateOn': 'Classic mode',
  'classicExperience.stateOff': 'Material mode',

  // Bulk actions across every MD3 list destination. English.
  'md3.classicSection.releases': 'Releases',
  'md3.classicSection.issues': 'Issues',
  'md3.classicSection.triage': 'Triage',
  'md3.classicSection.cheapLfs': 'Large files',
  'md3.classicSection.launchpad': 'Launchpad',
  'md3.classicSection.historyGraph': 'History graph',
}

/** Hong Kong Cantonese catalog. Missing entries deliberately use English. */
export const cantoneseTranslations: Readonly<
  Partial<Record<TranslationKey, string>>
> = {
  'supportTickets.title': 'Support Tickets 支援櫃檯',
  'supportTickets.subtitle': '呢個係本機櫃檯，專門幫你搞返自己落嘅鎖。',
  'supportTickets.entry.unlockPrompt': '唔記得咗密碼？',
  'supportTickets.entry.lockSetting': 'Support Tickets 支援櫃檯',
  'supportTickets.entry.help': 'Support Tickets 支援櫃檯',
  'supportTickets.entry.accessibleName':
    '{label} — 打開本機 Support Tickets 支援櫃檯',
  'supportTickets.arrivedFrom.unlockPrompt': '你係由解鎖嗰版入嚟嘅。',
  'supportTickets.arrivedFrom.lockSetting': '你係由個鎖嘅設定入嚟嘅。',
  'supportTickets.arrivedFrom.help': '你係由「說明」入嚟嘅。',
  'supportTickets.close': '閂咗個櫃檯',
  'supportTickets.disclosure':
    '呢度嘅嘢一律唔會send去任何地方。呢部機以外根本冇呢張飛，唔會出網絡request，唔會收集資料，亦都冇人會睇。唔好等回覆。',
  'supportTickets.deskLead.plain':
    '填張飛記低發生咗咩事，跟住睇下面嘅解決方法。得嗰步先至真係做到嘢。',
  'supportTickets.deskLead.light':
    '攞張飛，講下你有幾慘，跟住睇下面嘅解決方法——最後嗰步先至真係做到嘢。',
  'supportTickets.deskLead.playful':
    '歡迎光臨支援櫃檯。攞張飛，用你自己嘅字講下件慘案，再欣賞下個狀態一步步行。下面嘅解決方法先至係真係做到嘢嗰部分。',
  'supportTickets.deskLead.maximum':
    '歡迎光臨支援櫃檯。得一張凳，冇人排隊，全體員工就係一句 switch。攞張飛，繪聲繪影咁講你件慘案，再莊嚴咁睇住個狀態一步步行。下面嘅解決方法先至係真係做到嘢嗰部分。',
  'supportTickets.explain.summary': '呢個櫃檯係點運作',
  'supportTickets.explain.body':
    '啲飛淨係寫喺呢部機、呢個 profile 度。飛號喺本機生成，狀態要你自己撳先會行，緊急程度乜都改變唔到。解決方法會喺你嘅檔案總管打開 application data 資料夾；要刪嘅話係你自己喺檔案總管度動手，呢個 app 永遠唔會幫你刪。',
  'supportTickets.provenance.stored':
    '呢個數字嚟自本 profile 嘅本機飛紀錄：有 {count} 張。',
  'supportTickets.provenance.default':
    '仲未寫過任何飛紀錄，所以櫃檯而家show緊出廠預設：吉隊。',
  'supportTickets.form.legend': '開一張飛',
  'supportTickets.form.category': '分類',
  'supportTickets.form.categoryHint':
    '會記喺張飛度，export 亦都有。佢唔會將張飛送去邊度，因為根本冇地方可以送。',
  'supportTickets.form.severity': '緊急程度',
  'supportTickets.form.severityHint':
    '會記低亦都會show，但冇人會理：每個等級行為完全一樣，因為根本冇排隊亦都冇客服。',
  'supportTickets.form.description': '發生咗咩事',
  'supportTickets.form.descriptionHint':
    '用咗 {used} 個字，上限 {max} 個。淨係存喺呢部機。',
  'supportTickets.form.descriptionRequired': '開飛之前請講低發生咗咩事。',
  'supportTickets.form.submit': '開飛',
  'supportTickets.category.forgottenPassword': '我唔記得咗密碼',
  'supportTickets.category.lostAuthenticator': '我唔見咗個驗證器',
  'supportTickets.category.lockedTab': '有個分頁鎖咗',
  'supportTickets.category.lockedAppearance': '有個外觀設定鎖咗',
  'supportTickets.category.somethingElse': '第二啲嘢',
  'supportTickets.severity.whenever': '幾時都得',
  'supportTickets.severity.normal': '普通',
  'supportTickets.severity.urgent': '緊急',
  'supportTickets.severity.critical': '極緊急，成盤生意停晒',
  'supportTickets.searchPlaceholder': '搵飛',
  'supportTickets.searchField': '支援飛',
  'supportTickets.invalidPattern': '呢個正規表達式唔啱，所以全部飛照show。',
  'supportTickets.filters': '飛嘅篩選',
  'supportTickets.chip.open': '未完',
  'supportTickets.chip.resolved': '已解決',
  'supportTickets.chip.urgent': '緊急或極緊急',
  'supportTickets.list': '支援飛',
  'supportTickets.empty.none': '仲未有飛。想體驗全套嘅話，喺上面開一張。',
  'supportTickets.empty.noMatch': '冇飛啱而家嘅搜尋同篩選。',
  'supportTickets.row.select': '揀飛 {number}',
  'supportTickets.row.advance': '推進飛 {number}',
  'supportTickets.row.delete': '刪走飛 {number}',
  'supportTickets.row.detail': '{category} · {severity} · {status}',
  'supportTickets.row.opened': '{timestamp} 開嘅',
  'supportTickets.row.responses': '櫃檯回覆 {count} 條',
  'supportTickets.status.received': '已收到',
  'supportTickets.status.triaged': '已分流',
  'supportTickets.status.awaitingCustomer': '等緊客人',
  'supportTickets.status.resolved': '已解決',
  'supportTickets.response.acknowledged.plain':
    '飛已收到。淨係寫咗喺呢部機，第二度都冇。解決方法喺下面。',
  'supportTickets.response.acknowledged.light':
    '多謝你搵支援櫃檯。你張飛已經歸檔喺呢部機，就咁一直擺喺度。解決方法喺下面。',
  'supportTickets.response.acknowledged.playful':
    '多謝你聯絡支援部。你張飛已經登記咗，並且交畀一句非常專業嘅 switch 處理。冇通知過任何人，因為根本冇人。解決方法喺下面。',
  'supportTickets.response.acknowledged.maximum':
    '多謝你聯絡支援部。你張飛已經登記、蓋印、歸檔，並交畀一句非常專業嘅 switch 處理；佢睇過一次手冊，仲記得大部分。你嘅個案對我哋好重要，重要到我哋擺咗喺你自己嘅硬碟度。冇通知過任何人，因為根本冇人。解決方法喺下面。',
  'supportTickets.response.triaged':
    '已分流。分類同緊急程度都記低咗，兩樣都改變唔到任何嘢。',
  'supportTickets.response.awaitingCustomer':
    '等緊客人：淨返嘅一步係你嘅。打開下面個資料夾，自己刪走佢。',
  'supportTickets.response.resolved':
    '已解決。櫃檯冇嘢再做；下面嗰個解決方法由頭到尾都係佢唯一有嘅嘢。',
  'supportTickets.responseAt': '{time} 記低',
  'supportTickets.correspondence': '飛 {number} 嘅櫃檯回覆',
  'supportTickets.selectAllFiltered': '揀晒啱嘅 {count} 張飛',
  'supportTickets.selectAllEverything': '揀晒全部 {count} 張飛',
  'supportTickets.selectionCount': '揀咗 {count} 張',
  'supportTickets.invertSelection': '反轉揀選',
  'supportTickets.bulkAdvance': '推進',
  'supportTickets.bulkExport': '匯出',
  'supportTickets.bulkDelete': '刪走',
  'supportTickets.bulkScoped': '{label} — {scope}',
  'supportTickets.scope.selection': '揀咗嘅 {count} 張飛',
  'supportTickets.scope.filtered': '啱而家搜尋同篩選嘅 {count} 張飛',
  'supportTickets.scope.all': '全部 {count} 張飛',
  'supportTickets.moreActions': '更多飛嘅操作',
  'supportTickets.listMenu.title': '啲飛',
  'supportTickets.listMenu.selectFiltered': '揀晒啱嘅 {count} 張飛',
  'supportTickets.listMenu.selectEverything': '揀晒全部 {count} 張飛',
  'supportTickets.listMenu.invert': '反轉揀選',
  'supportTickets.listMenu.clearSelection': '清走揀選',
  'supportTickets.listMenu.advanceScope': '推進 {count} 張飛',
  'supportTickets.listMenu.export': '匯出 {count} 張飛…',
  'supportTickets.listMenu.deleteScope': '刪走 {count} 張飛…',
  'supportTickets.rowMenu.title': '飛 {number}',
  'supportTickets.rowMenu.advance': '推進呢張飛',
  'supportTickets.rowMenu.copyNumber': '複製飛號',
  'supportTickets.rowMenu.export': '匯出呢張飛…',
  'supportTickets.rowMenu.delete': '刪走呢張飛',
  'supportTickets.rowMenu.select': '揀呢張飛',
  'supportTickets.rowMenu.deselect': '唔揀呢張飛',
  'supportTickets.export.saveDialogTitle': '匯出啲支援飛',
  'supportTickets.exportMenu.title': '匯出格式',
  'supportTickets.exportMenu.filterPlaceholder': '篩選格式',
  'supportTickets.menuFilterPlaceholder': '篩選呢個選單',
  'supportTickets.toast.created': '飛 {number} 已經喺呢部機開咗。',
  'supportTickets.toast.advanced': '飛 {number} 而家係「{status}」。',
  'supportTickets.toast.alreadyResolved':
    '飛 {number} 已經解決咗，冇下一個狀態。',
  'supportTickets.toast.deleted': '飛 {number} 已刪。',
  'supportTickets.toast.deletedMany': '刪咗 {count} 張飛。',
  'supportTickets.toast.exported': '{count} 張飛已經整成 {format}。',
  'supportTickets.toast.copied': '飛號 {number} 已複製。',
  'supportTickets.toast.selectedAll': '揀晒全部 {count} 張飛。',
  'supportTickets.toast.copiedPath': '已複製資料夾路徑：{path}',
  'supportTickets.toast.folderOpened': '已經喺你嘅檔案總管打開 {path}。',
  'supportTickets.toast.folderFailed': '檔案總管打唔開 {path}。佢報：{error}',
  'supportTickets.toast.folderUnavailable': '冇資料夾可以打開。{error}',
  'supportTickets.resolution.heading': '解決方法',
  'supportTickets.resolution.lead.plain':
    '打開 application data 資料夾，自己刪走佢。咁樣就會 reset 咗呢個 app 入面全部鎖。',
  'supportTickets.resolution.lead.light':
    '成套方案就係咁：打開 application data 資料夾，自己刪走佢。咁樣就會 reset 咗呢個 app 入面全部鎖。',
  'supportTickets.resolution.lead.playful':
    '經過深入調查之後，櫃檯建議如下：打開 application data 資料夾，自己刪走佢。咁樣就會 reset 咗呢個 app 入面全部鎖。',
  'supportTickets.resolution.lead.maximum':
    '經過深入調查、上報畀第二句 switch，再由呢段文字自己開咗個內部檢討會之後，櫃檯建議如下：打開 application data 資料夾，自己刪走佢。咁樣就會 reset 咗呢個 app 入面全部鎖。請為今次服務評分，滿分係零。',
  'supportTickets.resolution.pathLabel': 'Application data 資料夾',
  'supportTickets.resolution.pathResolving':
    '正喺行緊嘅程式度攞緊個資料夾位置…',
  'supportTickets.resolution.pathUnavailable':
    '攞唔到個資料夾位置，所以冇嘢可以打開。佢平時喺你 user profile 嘅 app data 目錄入面。',
  'supportTickets.resolution.pathProvenanceResolved':
    '呢個位置係行緊嘅程式報返嚟，唔係估：撳「打開」開嘅就係呢個資料夾。',
  'supportTickets.resolution.pathProvenanceUnresolved':
    '行緊嘅程式仲未報返個位置，所以唔show資料夾，「打開」掣亦都撳唔到。',
  'supportTickets.resolution.open': '打開個資料夾',
  'supportTickets.resolution.copyPath': '複製路徑',
  'supportTickets.resolution.neverDeletes':
    '呢個 app 淨係幫你打開個資料夾，之後乜都唔做。佢永遠唔會幫你刪。',
  'supportTickets.resolution.opened': '已經喺你嘅檔案總管打開 {path}。',
  'supportTickets.resolution.failed': '檔案總管打唔開 {path}。佢報：{error}',
  'supportTickets.resolution.unavailable': '冇資料夾可以打開。{error}',
  'supportTickets.gate.eyebrow': '一撳落去冇得返轉頭',
  'supportTickets.gate.title': '刪走 {count} 張飛',
  'supportTickets.gate.description':
    '呢個動作會由呢部機刪走 {count} 張飛——{scope}。連內容同櫃檯回覆一齊冇埋，而且冇得 undo。',
  'supportTickets.gate.keysLegend': '扭齊兩條匙',
  'supportTickets.gate.keyCount': '我明白會刪走 {count} 張飛',
  'supportTickets.gate.keyScope': '我明白呢個動作針對 {scope}',
  'supportTickets.gate.sliderLabel': '拉到盡先做得（{percent}%）',
  'supportTickets.gate.sliderValue': '距離授權完成 {percent}%',
  'supportTickets.gate.statusLocked': '兩條匙都仲未扭。而家乜都刪唔到。',
  'supportTickets.gate.statusReady': '兩條匙都扭咗。拉到最盡就授權。',
  'supportTickets.gate.statusMoving': '授權緊。未到盡頭放手就會停。',
  'supportTickets.gate.statusAuthorized': '已授權。而家可以刪。',
  'supportTickets.gate.emergencyExit': '緊急出口',
  'supportTickets.gate.confirm': '刪走 {count} 張飛',
  'settingsSearch.entry.appearanceLanguageMode.title': '語言模式',
  'settingsSearch.entry.appearanceLanguageMode.desc':
    '揀英文、玩味港式廣東話，或者慳位雙語模式。',
  'settingsSearch.entry.appearanceTone.title': '搞笑等級（語氣）',
  'settingsSearch.entry.appearanceTone.desc':
    '英文同廣東話各有一條滑桿，1 係完全認真，5 係玩到盡。改嘅係全 app 文案嘅講法，錯誤同警告都包，但事實一個字都唔會少。',
  'lazyView.loading.plain': '載入緊 {name}…',
  'lazyView.loading.light': '拎緊 {name} 出嚟，其他部分照用得。',
  'lazyView.loading.playful': '嗌緊 {name} 起身，佢伸緊懶腰，其他嘢照玩。',
  'lazyView.loading.maximum':
    '好有禮貌咁嗌緊 {name} 起身，佢話整緊個頭先肯出嚟。其他嘢一早返晒工。',
  'lazyView.failedTitle': '載入唔到 {name}',
  'lazyView.failedBody.plain':
    'App 其他部分冇受影響。撳「再試一次」可以再載入 {name}。',
  'lazyView.failedBody.light':
    '淨係 {name} 出事，App 其他部分無恙。撳「再試一次」再載入佢。',
  'lazyView.failedBody.playful':
    '{name} 一出門口就仆親，App 其他部分完全唔知發生咩事。撳「再試一次」畀佢再嚟過。',
  'lazyView.failedBody.maximum':
    '{name} 想華麗登場，點知一步踩空成個跌落台；App 其他部分繼續做騷，半拍都冇亂。撳「再試一次」請佢再上台。',
  'lazyView.failedDetail': '錯誤訊息：{error}',
  'lazyView.retry': '再試一次',
  'lazyView.notificationTitle': '打唔開 {name}',
  'lazyView.notificationBody':
    '{name} 載入失敗，嗰度有粒「再試一次」掣等你撳。其他嘢冇受影響。錯誤訊息：{error}',
  'lazyView.section.actions': 'Actions 工作流程',
  'lazyView.section.releases': 'Releases 發布',
  'lazyView.section.issues': 'Issues 議題',
  'lazyView.section.triage': 'Triage 分流',
  'lazyView.section.tools': 'Repository 工具',
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
  'startup.loading': '打開緊你嘅工作區…',
  'repositorySection.actions': '操作',
  'repositorySection.releases': '版本發布',
  'repositorySection.issues': '問題',
  'repositorySection.triage': '分流',
  'repositorySection.tools': 'Repo 工具',
  'repositorySection.launchpad': '發射台',
  'repositorySection.historyGraph': '圖表',
  'update.downloadingLabel': '下載緊應用程式更新',
  'update.downloadingValue': '下載緊',
  'update.comingSoon': '新版本就快焗好出爐',
  'update.comingSoon.showDetails': '睇多啲詳情',
  'update.comingSoon.hideDetails': '收埋詳情',
  'update.comingSoon.detailsLabel': '新版本詳情',
  'update.comingSoon.estimateNotice':
    '呢個係根據公開建置訊號嘅估算，唔係承諾。',
  'update.comingSoon.etaMinutes': '估計仲有大約 {count} 分鐘',
  'update.comingSoon.etaHours': '估計仲有大約 {count} 小時',
  'update.comingSoon.etaDays': '估計仲有大約 {count} 日',
  'update.comingSoon.etaShortly': '估計好快就到',
  'update.comingSoon.etaAnyMinute': '估計隨時都到',
  'update.comingSoon.etaUnknown': '暫時估唔到幾時到',
  'update.comingSoon.durationMinutes': '{count} 分鐘',
  'update.comingSoon.durationHours': '{count} 小時',
  'update.comingSoon.durationDays': '{count} 日',
  'update.comingSoon.targetLabel': '目標版本',
  'update.comingSoon.targetUnknown': '仲未開 tag',
  'update.comingSoon.signalLabel': '訊號來源',
  'update.comingSoon.signalBuildRunning':
    '有個更新 commit 嘅 Windows 建置而家行緊',
  'update.comingSoon.signalAwaitingRelease':
    '更新 commit 已經建置成功，但仲未有 release 帶住佢',
  'update.comingSoon.signalNewerCommit':
    'main 上面有更新 commit，仲未有建置完成',
  'update.comingSoon.basisLabel': '估算依據',
  'update.comingSoon.basisRunningWorkflow':
    '最近 {count} 次成功建置嘅中位時間，減去今次已經行咗嘅時間',
  'update.comingSoon.basisRunningWorkflowUnmeasured':
    '有建置行緊，但讀唔到已完成嘅建置嚟做比較',
  'update.comingSoon.basisGreenCI': '建置已經過咗，淨返發布呢一步',
  'update.comingSoon.basisCadence':
    '最近 {count} 段發布間隔嘅中位數，由最新一個 release 起計',
  'update.comingSoon.basisCadenceUnmeasured':
    '已發布嘅 release 唔夠多，量唔到節奏',
  'update.comingSoon.cadenceLabel': '近期發布節奏',
  'update.comingSoon.cadenceValue':
    '大約每 {gap}出一個 release，睇咗 {count} 段間隔',
  'update.comingSoon.cadenceUnknown': '未量到',
  'update.comingSoon.commitLabel': 'Commit',
  'update.comingSoon.viewCommit': '喺 GitHub 睇對比',
  'update.comingSoon.viewRun': '睇吓個建置',
  'update.comingSoon.latestReleaseLabel': '最新已發布版本',
  'update.comingSoon.latestReleaseUnknown': '唔知',
  'appearance.updateProgressColor': '更新進度列顏色',
  'appearance.useAccentColor': '跟強調色',
  'appearance.languageMode': '語言',
  'appearance.languageModeDescription':
    '揀英文、玩味港式廣東話，或者慳位雙語模式。',
  'appearance.languageAndNavigation': '語言',
  'appearance.playfulnessHeading': '搞笑程度',
  'appearance.playfulnessDescription':
    '英文同廣東話可以各自揀語氣。1 係完全認真，5 係最玩得。事實、錯誤同安全訊息每一級都會保持清楚。',
  'appearance.englishPlayfulness': '英文搞笑程度',
  'appearance.cantonesePlayfulness': '廣東話搞笑程度',
  'appearance.playfulnessValue': '第 {value} 級，共 5 級',
  'appearance.playfulnessSerious': '1 · 完全認真',
  'appearance.playfulnessMaximum': '5 · 最玩得',
  'dialogEmoji.heading': '對話框同訊息框',
  'dialogEmoji.toggleLabel': '喺對話框同訊息框顯示 emoji',
  'dialogEmoji.explanationSummary': '呢個設定會改咩',
  'dialogEmoji.explanation.plain':
    '開咗之後，對話框同訊息框會喺標題側邊顯示一個 emoji，按照嗰個對話框嘅類型揀。閂咗之後，同一個對話框會用同樣嘅字，但冇 emoji。兩邊嘅字句完全一樣，而 emoji 唔會出現喺按鈕、動作名、欄位標籤，或者任何螢幕閱讀器讀出嘅內容入面。',
  'dialogEmoji.explanation.light':
    '開咗，對話框標題側邊會多咗一粒細細嘅 emoji，按類型揀啱嗰隻。閂咗，同一個對話框、同樣嘅字，少咗一幅圖啫。字句一個字都唔會改，emoji 亦都入唔到按鈕、動作名、欄位標籤，同埋螢幕閱讀器會讀嘅嘢。',
  'dialogEmoji.explanation.playful':
    '撳開佢，每個對話框都會喺標題側邊戴住一粒襯返場合嘅 emoji 出場。撳閂佢，同一個對話框素顏出場，講嘅嘢一個字都唔差。字句永遠唔會變，而粒 emoji 係唔准入按鈕、動作名、欄位標籤，同埋任何螢幕閱讀器會讀出嚟嘅位。',
  'dialogEmoji.explanation.maximum':
    '開咗，每個對話框都會喺標題側邊別住一粒 emoji，好似襟章咁襯返今次嘅場合。閂咗，同一個對話框冇襟章咁出場，講返一模一樣嘅字、一模一樣嘅句。粒襟章好清楚自己只係裝飾：佢入唔到按鈕、動作名、欄位標籤，亦都入唔到螢幕閱讀器會讀嘅內容，所以冇人需要靠估幅圖去知撳落去會做咩。',
  'dialogEmoji.boundaryNote':
    'Emoji 純粹係裝飾。佢會對螢幕閱讀器隱藏，亦都唔會出現喺按鈕、動作名或者欄位標籤入面。',
  'dialogEmoji.provenanceDefault':
    '呢部電腦未記錄過你嘅選擇，所以而家用緊出廠設定：{value}。',
  'dialogEmoji.provenanceStored': '呢部電腦記錄咗你嘅選擇：{value}。',
  'dialogEmoji.stateOn': '顯示',
  'dialogEmoji.stateOff': '隱藏',
  'palette.showDialogEmoji': '喺對話框同訊息框顯示 emoji',
  'palette.showDialogEmojiDescription':
    '喺對話框標題側邊加一粒裝飾用嘅 emoji。開定閂，字句都一模一樣，而 emoji 唔會入到按鈕、標籤或者螢幕閱讀器度。',
  'settingsSearch.entry.appearanceDialogEmoji.title':
    '喺對話框同訊息框顯示 emoji',
  'settingsSearch.entry.appearanceDialogEmoji.desc':
    '喺對話框標題加一粒 emoji 做裝飾，或者用返同樣嘅字但唔要 emoji。',
  'palette.showClassicToolbar': '顯示經典工具列',
  'palette.showClassicToolbarDescription':
    '喺內容窗上面保留返嗰條工具列。閂咗都唔會少咗嘢：佢上面每一個動作，內容標題列或者選單都做得到。',
  'settingsSearch.entry.appearanceClassicToolbar.title': '顯示經典工具列',
  'settingsSearch.entry.appearanceClassicToolbar.desc':
    '顯示或者收起被 MD3 外殼取代嗰條工具列。無論開定閂，佢啲動作喺內容標題列同選單都仲揾得返。',
  'appearance.schoolModeHeading': '{name}',
  'appearance.schoolModeDescription':
    '{name}會強制使用英文，暫時收起廣東話、雙語、搞笑程度同點心顯示。呢個只係本地顯示鎖，唔係保安界線。',
  'appearance.schoolModeName': '{name}名稱',
  'appearance.schoolModeNameDescription':
    '揀一個全個程式顯示嘅{name}名稱。程式身份同資料位置唔會改。',
  'appearance.schoolModeEnabled': '開啟{name}',
  'appearance.schoolModeCredential': '解鎖憑證',
  'appearance.schoolModeCredentialConfirm': '確認解鎖憑證',
  'appearance.schoolModeUnlockDescription':
    '輸入本地驗證嘅解鎖憑證先可以關閉{name}。憑證只會以加鹽摘要留喺本地。',
  'appearance.schoolModeResetDescription':
    '如果唔記得憑證，刪除本地程式 profile 就可以重設{name}；任何可以讀取該 profile 嘅人都唔會因此被阻擋。',
  'appearance.schoolModeEnable': '開啟{name}',
  'appearance.schoolModeDisable': '關閉{name}',
  'appearance.schoolModeCredentialInvalid': '解鎖憑證要有 4 至 128 個字元。',
  'appearance.schoolModeCredentialMismatch': '兩次輸入嘅解鎖憑證唔一致。',
  'appearance.schoolModeCredentialError':
    '解鎖憑證唔正確，或者本地憑證儲存暫時用唔到。',
  'appearance.elementGestureHeading': '元素外觀',
  'appearance.elementGesture.plain':
    '撳住 Shift 再右擊一個元素，就會開佢嘅外觀編輯器。單純右擊照舊開返該元素本身嘅選單。用鍵盤嘅話，先聚焦該元素，再撳 Shift+F10 或者 Menu 鍵。每個元素嘅設定同歷史都各自分開。',
  'appearance.elementGesture.light':
    '想改個樣？撳住 Shift 右擊佢，外觀編輯器就會彈出嚟。淨係右擊就唔阻你，照開返該元素本身嘅選單。用鍵盤就先聚焦該元素，再撳 Shift+F10 或者 Menu 鍵。每個元素嘅設定同歷史都各自分開。',
  'appearance.elementGesture.playful':
    '撳住 Shift 再右擊，外觀編輯器即刻彈出嚟等你落色。淨係右擊嘅話，佢繼續做返本份——開該元素本身嘅選單。鍾意用鍵盤？聚焦該元素，撳 Shift+F10 或者 Menu 鍵。每個元素都好似松鼠咁，收埋自己嘅設定同歷史。',
  'appearance.elementGesture.maximum':
    '撳住 Shift 再右擊，外觀編輯器即刻拎住成板色卡衝出嚟，好似裝修節目主持咁問你今日想點裝。淨係右擊佢就照返朝九晚五——開該元素本身嘅選單，唔加戲。鍵盤派：聚焦該元素，撳 Shift+F10 或者 Menu 鍵，一樣咁隆重。每個元素自己收自己嘅設定同歷史，執靚呢個掣，嗰個掣件衫一條紋都唔會皺。',
  'appearance.scheduledSettingsHeading': '排程設定',
  'appearance.scheduledSettingsDescription':
    '喺指定本地日期同時間套用語言、主題同外觀自訂。排程亦可以讀經驗證嘅 API 或 Home Assistant 布林實體；外部來源失敗時，會保留本地設定唔亂郁。',
  'appearance.scheduledSettingsRuleDetails': '呢條排程點樣運作',
  'appearance.scheduledSettingsRuleHelp':
    '呢條規則會按照你揀嘅本地星期同時間範圍匹配。「每日」會覆蓋星期清單；跨午夜嘅時間窗會由所選開始日延續到下一個本地日。',
  'appearance.scheduledSettingsRuleProvenance':
    '來源：目前個人檔案已儲存嘅 scheduled-settings-v1 紀錄。新規則預設係 {startTime}–{endTime}；目前數值會同呢條規則一齊儲存。',
  'appearance.scheduledSettingsSourceDetails': '設定來源資料',
  'appearance.scheduledSettingsSourceProvenance':
    '來源：{source}。本地數值會同規則一齊儲存；API 數值只會由經驗證端點讀取；Home Assistant 數值會本地儲存，再由揀定嘅布林實體控制。',
  'appearance.scheduledSettingsValueDetails': '套用設定資料',
  'appearance.scheduledSettingsValueProvenance':
    '來源：呢條規則嘅數值內容。只有內容入面出現嘅欄位會改變，其餘外觀同語言設定會保留已儲存數值。',
  'appearance.scheduledSettingsAdd': '加個排程',
  'appearance.scheduledSettingsEmpty':
    '而家未有排程。加一個啦，等個 app 有時間表，唔使靠估。',
  'appearance.scheduledSettingsRule': '排程 {number}',
  'appearance.scheduledSettingsEnabled': '啟用排程',
  'appearance.scheduledSettingsAllDays': '每日',
  'appearance.scheduledSettingsWeekdays': '星期',
  'appearance.scheduledSettingsStartDate': '開始日期（可留空）',
  'appearance.scheduledSettingsEndDate': '結束日期（可留空）',
  'appearance.scheduledSettingsDateRangeInvalid':
    '結束日期要係開始日期當日或之後；修正日期範圍之前，呢條排程會暫停。',
  'appearance.scheduledSettingsStartTime': '開始時間',
  'appearance.scheduledSettingsEndTime': '結束時間',
  'appearance.scheduledSettingsTimeZone':
    '使用 {timeZone} 本地時間。夏令時間轉換會自動跟隨；結束時間唔包括喺內，相同開始同結束時間就代表覆蓋所選嗰日。',
  'appearance.scheduledSettingsSource': '設定來源',
  'appearance.scheduledSettingsLocal': '本機排程值',
  'appearance.scheduledSettingsAPI': '已驗證 API',
  'appearance.scheduledSettingsHomeAssistant': 'Home Assistant 布林值',
  'appearance.scheduledSettingsAPIEndpoint': 'API 端點',
  'appearance.scheduledSettingsHomeAssistantBaseURL': 'Home Assistant 網址',
  'appearance.scheduledSettingsHomeAssistantEntity': '布林實體 ID',
  'appearance.scheduledSettingsHomeAssistantToken': '存取 token',
  'appearance.scheduledSettingsSaveToken': '安全咁儲存 token',
  'appearance.scheduledSettingsTestSensor': '測試感應器',
  'appearance.scheduledSettingsTokenSaved': 'Token 已儲喺作業系統憑證庫。',
  'appearance.scheduledSettingsSensorState': '感應器狀態：{state}',
  'appearance.scheduledSettingsValue': '啟用時套用嘅設定',
  'appearance.scheduledSettingsValueDescription':
    '多個排程撞時間時，後面嘅排程會覆寫佢有設定嘅欄位。API 回應必須係 version 1，並包含語言、主題或外觀值。',
  'appearance.scheduledSettingsRemove': '移除排程',
  'appearance.scheduledSettingsSourceFailure':
    '呢個外部來源讀唔到；今次排程會跳過，之前嘅設定繼續用。',
  'appearance.scheduledSettingsSourceInvalid':
    '呢條規則會暫停，直到外部來源有效。請輸入有效端點或實體 ID，再重新啟用排程。',
  'appearance.scheduledSettingsLanguage': '語言值',
  'appearance.scheduledSettingsLanguageEnglish': '英文',
  'appearance.scheduledSettingsLanguageCantonese': '香港廣東話（玩味版）',
  'appearance.scheduledSettingsLanguageBilingual': '雙語',
  'appearance.scheduledSettingsTheme': '主題值',
  'appearance.scheduledSettingsAppearance': '外觀自訂',
  'appearance.scheduledSettingsOn': '開',
  'appearance.scheduledSettingsOff': '關',
  'appearance.scheduledSettingsDaySunday': '星期日',
  'appearance.scheduledSettingsDayMonday': '星期一',
  'appearance.scheduledSettingsDayTuesday': '星期二',
  'appearance.scheduledSettingsDayWednesday': '星期三',
  'appearance.scheduledSettingsDayThursday': '星期四',
  'appearance.scheduledSettingsDayFriday': '星期五',
  'appearance.scheduledSettingsDaySaturday': '星期六',
  'appearance.scheduledSettingsThemeSystem': '跟隨系統',
  'appearance.scheduledSettingsThemeLight': '淺色',
  'appearance.scheduledSettingsThemeDark': '深色',
  'appearance.scheduledSettingsNoChange': '唔改',
  'appearance.scheduledSettingsAPIHelp':
    '除咗 localhost、127.0.0.1 同 ::1，其他都要用 HTTPS。API 回應要係 version 1 JSON。',
  'appearance.scheduledSettingsHomeAssistantHelp':
    'Token 會留喺作業系統憑證庫。只有布林狀態係開，排程先會用呢個實體。',
  'appearance.scheduledSettingsAccentPalette': '主色調色板',
  'appearance.scheduledSettingsUpdateProgressPalette': '更新進度色板',
  'appearance.scheduledSettingsSurfacePalette': '表面調色板',
  'appearance.scheduledSettingsElevation': '陰影層次',
  'appearance.scheduledSettingsUIFont': '介面字型',
  'appearance.scheduledSettingsMonospaceFont': '等寬字型',
  'appearance.scheduledSettingsMotion': '動態效果',
  'appearance.scheduledSettingsToolbarLabels': '工具列標籤',
  'appearance.scheduledSettingsToolbarDensity': '工具列密度',
  'appearance.scheduledSettingsRepositoryListDensity': 'Repo 列表密度',
  'appearance.scheduledSettingsTabDensity': '分頁密度',
  'appearance.scheduledSettingsTabWidth': '分頁寬度',
  'appearance.scheduledSettingsTabCloseButtons': '分頁關閉掣',
  'appearance.scheduledSettingsSubmoduleBackStyle': '子模組返回掣款式',
  'appearance.scheduledSettingsSubmoduleBackLabel': '子模組返回掣文字',
  'appearance.scheduledSettingsHighlightFeatures': '標示 Desktop Material 功能',
  'appearance.submoduleBackStyle': '子模組返回掣款式',
  'appearance.submoduleBackLabel': '子模組返回掣文字',
  'appearance.toolbarEditorTitle': '工具列外觀',
  'appearance.toolbarEditorDescription':
    '自訂工具列標籤、間距、文字顏色同字款。',
  'appearance.repositoryToolbarEditorTitle': 'Repo 工具列外觀',
  'appearance.repositoryToolbarEditorDescription':
    '只喺呢個 repo 啟用嗰陣覆寫標籤、間距、文字顏色同字款。',
  'appearance.toolbarTypographyHeading': '工具列字款',
  'appearance.toolbarTypographyProfile': 'Profile 自訂款式',
  'appearance.toolbarTypographyRepositoryInherited': '沿用 profile 字款',
  'appearance.toolbarTypographyRepositoryOverride': 'Repo 專用覆寫',
  'appearance.toolbarTypographyThemeDefaults': '用返主題預設',
  'appearance.toolbarTypographyInheritProfile': '沿用 profile',
  'appearance.toolbarTypographyPreview': '工具列即時預覽',
  'appearance.toolbarTypographyPreviewTitle': '目前 repo',
  'appearance.toolbarTypographyPreviewDescription': '目前分支',
  'appearance.toolbarFontStyle': '字款樣式',
  'appearance.toolbarBold': '粗體',
  'appearance.toolbarItalic': '斜體',
  'appearance.toolbarUnderline': '底線',
  'appearance.toolbarStrikethrough': '刪除線',
  'appearance.toolbarAlignment': '文字對齊',
  'appearance.toolbarAlignLeft': '靠左',
  'appearance.toolbarAlignCenter': '置中',
  'appearance.toolbarAlignRight': '靠右',
  'appearance.toolbarFont': '字型',
  'appearance.toolbarThemeFont': '用主題字型',
  'appearance.toolbarInheritFont': '沿用 profile 字型',
  'appearance.toolbarSize': '字體大小',
  'appearance.toolbarThemeSize': '用主題大小',
  'appearance.toolbarInheritSize': '沿用 profile 大小',
  'appearance.toolbarLetterCase': '英文字母大小寫',
  'appearance.toolbarNormalCase': '一般大小寫',
  'appearance.toolbarUppercase': '全大寫',
  'appearance.toolbarLowercase': '全小寫',
  'appearance.toolbarCapitalize': '每字首大寫',
  'appearance.toolbarSmallCaps': '小型大寫字母',
  'appearance.toolbarSpacing': '字元間距',
  'appearance.toolbarThemeSpacing': '用主題間距',
  'appearance.toolbarInheritSpacing': '沿用 profile 間距',
  'appearance.toolbarTextEffect': '文字效果',
  'appearance.toolbarNoEffect': '無文字效果',
  'appearance.toolbarSoftShadow': '柔和陰影',
  'appearance.toolbarStrongShadow': '明顯陰影',
  'appearance.toolbarTextColor': '文字顏色',
  'appearance.toolbarThemeColor': '用主題顏色',
  'appearance.toolbarInheritColor': '沿用 profile 顏色',
  'appearance.toolbarCustomColor': '自訂文字顏色',
  'tabs.appearanceLoading': '分頁外觀仲載入緊，等陣再試。',
  'tabs.settingsCommitSaved': '已存 · {sha}',
  'tabs.settingsCommitCommitted': '啱啱存 {sha}',
  'tabs.settingsCommitTitle':
    '每次改分頁或設定，都會即刻 commit 落呢個帳戶嘅本機設定 repo。',
  'tabs.settingsHistory': '設定歷史',
  'tabs.closedHistory': '最近關閉嘅分頁',
  'tabs.closedHistoryTitle': '分頁歷史',
  'tabs.closedHistoryDescription': '可以還原啱啱關閉嘅分頁，或者永久忘記佢。',
  'tabs.closedHistoryEmpty': '暫時冇最近關閉嘅分頁。',
  'tabs.closedHistoryNoMatches': '冇關閉分頁符合呢個搜尋。',
  'tabs.closedHistorySearch': '搜尋關閉咗嘅分頁',
  'tabs.closedHistorySearchPlaceholder': '名、別名或者路徑',
  'tabs.closedHistorySearchTarget': '關閉咗嘅分頁',
  'tabs.closedHistoryForget': '忘記關閉咗嘅分頁「{name}」',
  'tabs.closedHistoryClear': '清除歷史',
  'tabs.closedHistoryCountOne': '有 1 個關閉咗嘅分頁',
  'tabs.closedHistoryCountMany': '有 {count} 個關閉咗嘅分頁',
  'tabs.undoSettingsChange': '復原上一個設定改動',
  'tabs.redoSettingsChange': '重做設定改動',
  'tabs.settingsChangeUndone': '已復原設定改動。',
  'tabs.settingsChangeRedone': '已重做設定改動。',
  'tabs.groupAddNew': '將分頁加入新群組…',
  'tabs.groupMoveAction': '將分頁移去群組…',
  'tabs.groupMoveTo': '移去「{name}」',
  'tabs.groupRemoveFrom': '從「{name}」移走',
  'tabs.groupMoveDialogTitle': '將分頁移去群組',
  'tabs.groupMoveDialogIntro':
    '揀「{tab}」要去邊個群組。搬位只會整理分頁列，絕對唔會閂咗個分頁。',
  'tabs.groupMoveSearchLabel': '搜尋分頁群組',
  'tabs.groupMoveSearchPlaceholder': '群組名',
  'tabs.groupMoveSearchTarget': '分頁群組',
  'tabs.groupMoveListLabel': '可用嘅分頁群組',
  'tabs.groupMoveRemoveCurrent': '唔入群組 — 從「{name}」移走',
  'tabs.groupMoveDestinationLabel': '將分頁移去「{name}」',
  'tabs.groupMoveEmpty': '暫時冇相容嘅目的地群組。請先喺分頁右鍵選單建立群組。',
  'tabs.groupMoveNoMatches': '冇分頁群組符合呢個搜尋。',
  'tabs.groupMoveCountOne': '有 1 個可用目的地',
  'tabs.groupMoveCountMany': '有 {count} 個可用目的地',
  'tabs.groupMoveFilterCount': '顯示緊 {total} 個目的地入面嘅 {visible} 個',
  'tabs.groupMoveRegexError': '正規表示式無效：{message}。',
  'tabs.groupExpand': '展開「{name}」',
  'tabs.groupCollapse': '收起「{name}」',
  'tabs.groupDelete': '刪除群組「{name}」',
  'tabs.groupDialogTitle': '新分頁群組',
  'tabs.groupDialogIntro':
    '「{tab}」會做呢個群組嘅第一個分頁。分組只係整理分頁列，絕對唔會閂分頁。',
  'tabs.groupNameLabel': '群組名',
  'tabs.groupColorLabel': '群組顏色',
  'tabs.groupColorChoice': '{color}群組顏色',
  'tabs.groupColorBlue': '藍色',
  'tabs.groupColorGreen': '綠色',
  'tabs.groupColorYellow': '黃色',
  'tabs.groupColorRed': '紅色',
  'tabs.groupColorPurple': '紫色',
  'tabs.groupColorGrey': '灰色',
  'tabs.groupCreateAction': '建立群組',
  'tabs.groupCancelAction': '取消',
  'tabs.groupChipExpandedOne':
    '「{name}」群組，{count} 個分頁，已展開。收起群組。',
  'tabs.groupChipExpandedMany':
    '「{name}」群組，{count} 個分頁，已展開。收起群組。',
  'tabs.groupChipCollapsedOne':
    '「{name}」群組，{count} 個分頁，已收起。展開群組。',
  'tabs.groupChipCollapsedMany':
    '「{name}」群組，{count} 個分頁，已收起。展開群組。',
  'tabs.groupMemberLabel': '{tab}，「{name}」群組',
  'tabs.groupCreatedStatus': '已建立「{name}」群組。',
  'tabs.groupMovedStatus': '已將 {tab} 移去「{name}」。',
  'tabs.groupRemovedStatus': '已將 {tab} 從「{name}」移走。',
  'tabs.groupExpandedStatus': '已展開「{name}」群組。',
  'tabs.groupCollapsedStatus': '已收起「{name}」群組。',
  'tabs.groupDeletedStatus': '已刪除「{name}」群組，入面啲分頁仲開住。',
  'tabs.groupActionFailed': '未能更新分頁群組，等陣再試。',
  'tabs.groupEdit': '編輯群組「{name}」…',
  'tabs.groupEditTitle': '編輯分頁群組',
  'tabs.groupEditIntroOne':
    '改「{name}」個名或者顏色。入面 {count} 個分頁照樣開住，亦都留喺呢個群組。',
  'tabs.groupEditIntroMany':
    '改「{name}」個名或者顏色。入面 {count} 個分頁照樣開住，亦都留喺呢個群組。',
  'tabs.groupSaveAction': '儲存群組',
  'tabs.groupUpdatedStatus': '已更新「{name}」群組。',
  'tabs.groupMembersButtonOne': '打開「{name}」入面 {count} 個分頁',
  'tabs.groupMembersButtonMany': '打開「{name}」入面 {count} 個分頁',
  'tabs.groupMembersTitle': '「{name}」入面嘅分頁',
  'tabs.groupMembersDescription':
    '呢個群組入面所有分頁，就算收埋咗一樣列晒出嚟。撳一下就即刻跳去嗰個分頁。',
  'tabs.groupMembersListLabel': '呢個群組入面嘅分頁',
  'tabs.groupMembersEmpty':
    '呢個群組暫時未有分頁。喺分頁嘅右鍵選單度將分頁搬入嚟。',
  'tabs.groupMembersCountOne': '呢個群組有 {count} 個分頁。',
  'tabs.groupMembersCountMany': '呢個群組有 {count} 個分頁。',
  'tabs.groupMembersKeepsTabs': '刪除群組只係甩個標籤，每個分頁都會繼續開住。',
  'tabs.groupMembersShow': '睇「{name}」入面嘅分頁',
  'tabs.tabPinnedSuffix': '，已置頂',
  'tabs.tabFavoriteSuffix': '，最愛',
  'tabs.overflowButton': '仲有 {count} 個',
  'tabs.overflowButtonLabelOne': '打開多 {count} 個分頁',
  'tabs.overflowButtonLabelMany': '打開多 {count} 個分頁',
  'tabs.overflowTitle': '仲有啲分頁',
  'tabs.searchTitle': '搜尋分頁',
  'tabs.searchDescription': '用名、別名、路徑或者 clone 網址搵已開啟分頁。',
  'tabs.searchLabel': '搜尋已開啟分頁',
  'tabs.searchTarget': '已開啟分頁',
  'tabs.searchEmpty': '冇已開啟分頁符合呢個搜尋。',
  'tabs.searchListLabel': '符合嘅 repository 分頁',
  'tabs.searchCountOne': '有 1 個符合嘅分頁',
  'tabs.searchCountMany': '有 {count} 個符合嘅分頁',
  'tabs.close.matchStrategyRegex': '正則表達式',
  'tabs.close.matchStrategyFuzzy': '模糊配對',
  'tabs.close.matchStrategySubstring': '原封不動嘅字串片段',
  'tabs.close.matchCaseSensitive': '會分大小寫',
  'tabs.close.matchCaseInsensitive': '唔分大小寫',
  'tabs.close.matchDescription':
    '配對會用{strategy}，而且{casing}，同「閂咗含指定文字嘅分頁」完全同一套，唔會各自發明玩法。',
  'tabs.close.saveError':
    '未能儲存今次改動。請先望清楚而家開住嘅分頁，再試一次。',
  'tabs.close.noMatches': '冇分頁符合，今次一個都唔會閂。',
  'tabs.close.cancel': '取消',
  'tabs.close.closing': '閂緊…',
  'tabs.close.count': '閂 {count} 個',
  'tabs.close.action': '閂',
  'tabs.close.closeTabs': '閂分頁',
  'tabs.close.openTabsTarget': '已開啟分頁',
  'tabs.stripLabel': 'Repo 分頁',
  'tabs.openRepositoryNewTab': '開個新分頁揀 repository',
  'tabs.closeContaining.title': '閂咗含指定文字嘅分頁',
  'tabs.closeContaining.placeholder': '按名稱篩選',
  'tabs.closeContaining.previewPrompt': '打啲字先可以預覽符合項目。',
  'tabs.closeContaining.matchSummary':
    '{closeCount} 個會閂，{pinnedCount} 個置頂分頁受保護。',
  'tabs.closeExcept.title': '閂晒其他分頁，只留低含指定文字嘅…',
  'tabs.closeExcept.fieldLabel': '要保留嘅文字',
  'tabs.closeExcept.placeholder': 'Repository 名、別名或者路徑',
  'tabs.closeExcept.previewPrompt': '打句字先預覽邊啲分頁會留低。',
  'tabs.closeExcept.allStayOpenOne': '嗰 {count} 個分頁會繼續開住。',
  'tabs.closeExcept.allStayOpenMany': '全部 {count} 個分頁會繼續開住。',
  'tabs.closeExcept.summary': '保留 {keptCount} 個，閂 {closedCount} 個。',
  'tabs.closeExcept.summaryWithPinned':
    '保留 {keptCount} 個，閂 {closedCount} 個，另有 {pinnedCount} 個置頂分頁受保護。',
  'tabs.closeExcept.previewAria': '閂分頁預覽',
  'tabs.closeExcept.dispositionPinned': '置頂，受保護',
  'tabs.closeExcept.dispositionClose': '會閂',
  'tabs.closeExcept.dispositionKeep': '保留',
  'tabs.closeExcept.remainingOne': '另外仲有 {count} 個分頁',
  'tabs.closeExcept.remainingMany': '另外仲有 {count} 個分頁',
  'tabs.arrange.initialAnnouncement': '揀手動搬位，或者一次過排好佢。',
  'tabs.arrange.saveError': '未能儲存分頁次序。請睇清楚而家個排列，再試一次。',
  'tabs.arrange.movedFirst': '已將 {label} 搬到最前。',
  'tabs.arrange.movedLeft': '已將 {label} 向左搬。',
  'tabs.arrange.movedRight': '已將 {label} 向右搬。',
  'tabs.arrange.movedLast': '已將 {label} 搬到最後。',
  'tabs.arrange.pinned': '已將 {label} 置頂。',
  'tabs.arrange.unpinned': '已取消置頂 {label}。',
  'tabs.arrange.favoriteAdded': '已將 {label} 加入最愛。',
  'tabs.arrange.favoriteRemoved': '已將 {label} 移出最愛。',
  'tabs.arrange.sortedLabelAscending': '分頁已經由 A 排到 Z。',
  'tabs.arrange.sortedLabelDescending': '分頁已經由 Z 排到 A。',
  'tabs.arrange.sortedOpenedNewest': '最新開啟嘅分頁排咗最前。',
  'tabs.arrange.sortedOpenedOldest': '最早開啟嘅分頁排咗最前。',
  'tabs.arrange.sortedAttentionFirst': '要留神嘅分頁已經搬到最前。',
  'tabs.arrange.sortedCleanFirst': '乾淨嘅分頁已經搬到最前。',
  'tabs.arrange.sortedFavoritesFirst': '最愛分頁已經搬到最前。',
  'tabs.arrange.sortedFavoritesLast': '最愛分頁已經搬到最後。',
  'tabs.arrange.title': '排列分頁',
  'tabs.arrange.description':
    '喺分頁列拖動，或者用以下鍵盤友善控制。置頂分頁會繼續企喺最前嗰組。',
  'tabs.arrange.filterLabel': '篩選分頁',
  'tabs.arrange.filterPlaceholder': '名稱、別名、路徑或者網址',
  'tabs.arrange.filterTarget': '已開啟分頁',
  'tabs.arrange.filterCountOne': '{total} 個分頁入面顯示 {visible} 個',
  'tabs.arrange.filterCountMany': '{total} 個分頁入面顯示 {visible} 個',
  'tabs.arrange.manualOrder': '手動排序',
  'tabs.arrange.noMatches': '冇分頁符合呢個篩選。',
  'tabs.arrange.sortOnce': '排一次',
  'tabs.arrange.sortHint': '排序會套用到所有已開啟分頁，就算而家篩選緊都一樣。',
  'tabs.arrange.pinnedChip': '已置頂',
  'tabs.arrange.favoriteChip': '最愛',
  'tabs.arrange.pin': '置頂',
  'tabs.arrange.unpin': '取消置頂',
  'tabs.arrange.star': '加星',
  'tabs.arrange.unstar': '取消星號',
  'tabs.arrange.pinAria': '置頂 {label}',
  'tabs.arrange.unpinAria': '取消置頂 {label}',
  'tabs.arrange.favoriteAria': '將 {label} 加入最愛',
  'tabs.arrange.unfavoriteAria': '將 {label} 移出最愛',
  'tabs.arrange.moveFirstAria': '將 {label} 搬到最前',
  'tabs.arrange.moveLeftAria': '將 {label} 向左搬',
  'tabs.arrange.moveRightAria': '將 {label} 向右搬',
  'tabs.arrange.moveLastAria': '將 {label} 搬到最後',
  'tabs.arrange.first': '最前',
  'tabs.arrange.left': '向左',
  'tabs.arrange.right': '向右',
  'tabs.arrange.last': '最後',
  'tabs.arrange.sortLabelAscending': '標籤 A → Z',
  'tabs.arrange.sortLabelDescending': '標籤 Z → A',
  'tabs.arrange.sortOpenedNewest': '最新開啟先',
  'tabs.arrange.sortOpenedOldest': '最早開啟先',
  'tabs.arrange.sortAttentionFirst': '要留神嘅先',
  'tabs.arrange.sortCleanFirst': '乾淨嘅先',
  'tabs.arrange.sortFavoritesFirst': '最愛先',
  'tabs.arrange.sortFavoritesLast': '最愛最後',
  'tabs.arrange.done': '完成',
  'tabs.style.alignLeftAria': '靠左對齊',
  'tabs.style.alignCenterAria': '置中對齊',
  'tabs.style.alignRightAria': '靠右對齊',
  'tabs.style.font': '字體',
  'tabs.style.searchFonts': '搜尋字體',
  'tabs.style.fontsTarget': '字體',
  'tabs.style.noMatchingFonts': '冇字體符合',
  'tabs.style.textColorSwatchAria': '文字顏色 {color}',
  'tabs.style.highlightColorSwatchAria': '底色 {color}',
  'tabs.style.highlight': '底色',
  'tabs.style.textColor': '文字顏色',
  'tabs.style.useDefaultBackgroundAria': '使用預設背景顏色',
  'tabs.style.useDefaultTextAria': '使用預設文字顏色',
  'tabs.style.noHighlight': '冇底色',
  'tabs.style.defaultColor': '預設',
  'tabs.style.custom': '自訂…',
  'tabs.style.customHighlightAria': '自訂底色',
  'tabs.style.customTextColorAria': '自訂文字顏色',
  'tabs.style.recent': '最近用過',
  'tabs.style.defaultPreviewTitle': 'Repository 分頁',
  'tabs.style.previewAria': '即時分頁預覽',
  'tabs.style.preview': '預覽',
  'tabs.style.title': '分頁外觀',
  'tabs.style.historyAria': '打開分頁外觀歷史',
  'tabs.style.history': '歷史',
  'tabs.style.clearAria': '清除分頁格式',
  'tabs.style.clear': '清除',
  'tabs.style.bold': '粗體',
  'tabs.style.italic': '斜體',
  'tabs.style.underline': '底線',
  'tabs.style.strikethrough': '刪除線',
  'tabs.style.size': '大小',
  'tabs.style.letterCase': '英文字母大小寫',
  'tabs.style.normalCase': '一般大小寫',
  'tabs.style.uppercase': '全大寫',
  'tabs.style.lowercase': '全小寫',
  'tabs.style.capitalizeWords': '每字首大寫',
  'tabs.style.smallCaps': '小型大寫字母',
  'tabs.style.spacing': '字距',
  'tabs.style.textEffect': '文字效果',
  'tabs.style.effectNone': '冇',
  'tabs.style.effectNoneAria': '冇文字效果',
  'tabs.style.effectSoft': '柔和',
  'tabs.style.effectSoftAria': '柔和文字陰影',
  'tabs.style.effectStrong': '明顯',
  'tabs.style.effectStrongAria': '明顯文字陰影',
  'commitPushAll.defaultMessage': 'Commit 本機改動',
  'commitPushAll.title': 'Commit 同 push 全部 repository',
  'commitPushAll.intro':
    '下面剔選嘅每個 repository 都會先 pull，再用你提供嘅訊息 commit 所有本機改動，最後 push 結果。乾淨嘅 repository 會略過；其中一個失敗，其他照樣繼續，唔會成隊企定。',
  'commitPushAll.messageLabel': 'Commit 訊息',
  'commitPushAll.messagePlaceholder': '形容今次改咗啲咩',
  'commitPushAll.filterPlaceholder': '篩選 repository',
  'commitPushAll.filterAria': '篩選要 commit 同 push 嘅 repository',
  'commitPushAll.filterTarget': 'repository 名稱',
  'commitPushAll.selectionCount':
    '已揀 {totalCount} 個入面嘅 {selectedCount} 個',
  'commitPushAll.selectShown': '揀晒顯示緊嘅',
  'commitPushAll.clearShown': '清除顯示緊嘅選擇',
  'commitPushAll.repositoriesGroupAria': '將會 commit 同 push 嘅 repository',
  'commitPushAll.noMatches': '冇 repository 名稱符合呢個搜尋。',
  'commitPushAll.empty':
    '冇 repository 有本機改動或者未 push 嘅 commit，所以今次冇嘢要 commit 同 push。',
  'commitPushAll.commitAll': 'Commit 同 push 全部',
  'commitPushAll.commitCount': 'Commit 同 push {count} 個',
  'commitPushAll.cancel': '取消',
  'commitPushAll.done': '完成',
  'commitPushAll.progressAria': 'Commit 同 push 進度',
  'commitPushAll.overlineStopped': '執行已停止',
  'commitPushAll.overlineComplete': '執行完成',
  'commitPushAll.overlineLive': '即時進度',
  'commitPushAll.headingFailed': '未能完成 commit 同 push 全部項目',
  'commitPushAll.headingComplete': '全部 repository 已處理',
  'commitPushAll.headingRunning': 'Commit 同 push 緊 repository',
  'commitPushAll.repositoriesComplete':
    '{total} 個 repository 入面完成咗 {completed} 個',
  'commitPushAll.progressBarAria': '已 commit 同 push 嘅 repository',
  'commitPushAll.metricComplete': '{count} 個完成',
  'commitPushAll.metricActive': '{count} 個處理緊',
  'commitPushAll.metricWaiting': '{count} 個等緊',
  'commitPushAll.allFinal': '每個 repository 都有最終結果。',
  'commitPushAll.nowWorking': '而家處理緊：{repositories}',
  'commitPushAll.waitingNext': '等緊下一個 repository 開始。',
  'commitPushAll.concurrencyHint':
    '每次最多同時處理三個 repository。工作繼續期間，你可以由得呢個對話框開住。',
  'commitPushAll.summary':
    '成功 push {done} 個，略過 {skipped} 個，失敗 {failed} 個。',
  'commitPushAll.noRepositoriesRun': '今次冇 repository 要執行。',
  'commitPushAll.resultsRegionAria': 'Commit 同 push 全部 repository 嘅進度',
  'commitPushAll.columnRepository': 'Repository',
  'commitPushAll.columnStatus': '狀態',
  'commitPushAll.columnResult': '目前操作或者結果',
  'commitPushAll.runInBackground': '放到背景繼續',
  'commitPushAll.status.waiting': '等緊',
  'commitPushAll.status.pulling': 'Pull 緊',
  'commitPushAll.status.committing': 'Commit 緊',
  'commitPushAll.status.pushing': 'Push 緊',
  'commitPushAll.status.done': '完成',
  'commitPushAll.status.skipped': '已略過',
  'commitPushAll.status.failed': '失敗',
  'tabs.overflowDescription.plain':
    '呢啲分頁擠唔落條分頁列。喺呢度可以搵、揀，或者改外觀。',
  'tabs.overflowDescription.light':
    '呢啲分頁喺條分頁列冇位企。喺呢度可以搵、揀，或者改外觀。',
  'tabs.overflowDescription.playful':
    '呢啲分頁俾人擠咗出嚟。喺呢度照搵、照揀，仲可以幫佢整色整水。',
  'tabs.overflowDescription.maximum':
    '條分頁列爆晒棚，呢啲分頁喺出面排緊隊，猶如禮拜六朝早等位飲茶。喺呢度照搵、照揀，等位嗰陣仲可以順便幫佢換套新衫。',
  'tabs.overflowListLabel': '擠唔落嘅倉庫分頁',
  'tabs.overflowEmpty': '所有分頁都擺得落。',
  'tabs.overflowActiveSuffix': '，使用緊',
  'tabs.overflowActiveChip': '使用緊',
  'tabs.overflowPinnedChip': '已置頂',
  'tabs.overflowFavoriteChip': '最愛',
  'tabs.overflowCountOne': '呢個選單有 1 個分頁',
  'tabs.overflowCountMany': '呢個選單有 {count} 個分頁',
  'tabs.overflowSearchLabel': '喺呢個選單搵分頁',
  'tabs.overflowSearchPlaceholder': '名、別名、路徑或者網址',
  'tabs.overflowSearchTarget': '擠唔落嘅分頁',
  'tabs.overflowNoMatches': '呢個選單冇分頁夾到呢個搜尋。',
  'tabs.overflowFilterCountOne': '呢個選單 {total} 個分頁入面有 {visible} 個',
  'tabs.overflowFilterCountMany': '呢個選單 {total} 個分頁入面有 {visible} 個',
  'tabs.overflowRegexError':
    '規則式唔啱：{message}。呢個選單啲分頁一個都冇少，照樣列晒出嚟。',
  'tabs.overflowCustomize': '整色整水',
  'tabs.overflowCustomizeLabel': '幫「{name}」整色整水',
  'tabs.overflowActionsHint': '喺呢度撳右鍵，分頁列有嘅功能一樣照有。',
  'language.english': '英文',
  'language.cantonese': '玩味港式廣東話',
  'language.bilingual': '雙語',
  'submodule.backStyleTonal': '柔和色調',
  'submodule.backStyleFilled': '實色強調',
  'submodule.backStyleOutlined': '外框',
  'submodule.backLabelFull': '返去主 repo',
  'submodule.backLabelParent': '顯示主 repo 名',
  'submodule.backLabelIcon': '淨圖示',
  'submodule.openAsRepository': '開臨時檢視器',
  'submodule.temporaryOpenDescription':
    '會喺呢個工作區開一個臨時唯讀檢視器；撳「關閉檢視器」就返去主 repo，亦絕對唔會加落 repo 清單。',
  'submodule.diffTemporaryViewerTitle': '用 {app} 開臨時檢視器',
  'submodule.diffTemporaryViewerDescription':
    '喺臨時唯讀檢視器睇目前 checkout 嘅子模組；關閉就返去主 repo 同清走臨時狀態，絕對唔會加落 repo 清單。',
  'submodule.diffTemporaryViewerAction': '開臨時檢視器',
  'submodule.closeTemporaryViewer': '關閉檢視器',
  'submodule.appearanceHeading': '返回掣外觀',
  'submodule.appearanceDescription':
    '撳住 Shift 再右擊預覽返回掣，或者 focus 住撳 Context Menu 掣／Shift+F10，就會喺掣旁邊打開編輯器。按「儲存」先套用到目前 profile。',
  'submodule.appearancePreview': '預覽',
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
    '而家喺 {parent} 入面臨時唯讀睇緊 {child}；關閉會返去主 repo 同清走檢視器，亦唔會加落 repo 清單。',
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
  'submodule.summaryNeedsRepair': '{count} 個要修復',
  'submodule.statusUninitialized': '未初始化',
  'submodule.statusUpToDate': '已經最新',
  'submodule.statusOutOfDate': '未追到最新',
  'submodule.statusConflicted': '有衝突',
  'submodule.statusMissingGitlink': 'Git link 唔見咗',
  'submodule.statusMissingDeclaration': '欠咗 .gitmodules 設定',
  'submodule.missingGitlinkTooltip':
    '呢條 .gitmodules 路徑未有當子模組追蹤；請還原 Git link，或者移除過時設定。',
  'submodule.missingDeclarationTooltip':
    '呢個已索引子模組搵唔到對應嘅 .gitmodules 設定；請先還原設定再管理。',
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
  'submodule.addCreateRemoteTab': '開新遠端',
  'submodule.addCreateAndAddAction': '開埋加埋做子模組',
  'submodule.addCreateRemoteSignInGuidance':
    '登入 GitHub.com 或者 GitHub Enterprise，先可以幫今次子模組開個遠端 repo。',
  'submodule.addRemoteCreatedHeading': '遠端 repo 開好咗',
  'submodule.addRemoteCreatedRetryHelp':
    '遠端已經準備好。撳「再試一次」就會用返現成嗰個，唔會再開多個。',
  'submodule.addRemoteOwnerLabel': '擁有者',
  'submodule.addRemoteNameLabel': 'Repo 名',
  'submodule.addRemoteDescriptionLabel': '描述（可以唔填）',
  'submodule.addRemotePrivateLabel': '將呢個 repo 設做私人',
  'submodule.addRemoteNameHelp': '填清楚要喺揀咗嘅 GitHub 主機開嘅名。',
  'submodule.addRemoteDescriptionHelp': '幫新遠端 repo 寫句簡短描述。',
  'submodule.addRemoteInitializeHelp':
    'Desktop 會幫遠端整個第一個 commit，Git 先可以即刻當佢係子模組咁追蹤。',
  'submodule.addRemoteAccountRequiredError':
    '開遠端 repo 之前，要先揀一個已經登入嘅 GitHub 帳戶。',
  'submodule.addRemoteOwnerUnavailableError':
    '揀咗嘅組織已經唔屬於呢個帳戶。請再揀過擁有者。',
  'submodule.addRemoteNameRequiredError': '請幫新遠端 repo 改個名。',
  'submodule.addRemoteNameLengthError': 'Repo 名最多 100 個字元。',
  'submodule.addRemoteNameCharactersError':
    'Repo 名淨係可以用英文字母、數字、句號、連字號同底線。',
  'submodule.addRemoteDescriptionLengthError': 'Repo 描述最多 350 個字元。',
  'submodule.addRemoteDescriptionCharactersError':
    'Repo 描述入面有唔支援嘅控制字元。',
  'submodule.addCreatingRemoteProgress': '開緊遠端 repo…',
  'submodule.addRemoteCreatedProgress': '遠端開好喇，而家加緊佢做子模組…',
  'submodule.addRemoteCreatedButAddFailed':
    '遠端 repo 已經喺 {repository} 開咗，不過 Desktop 加唔到佢做子模組：{error}。撳「再試一次」就會用返現成嗰個。',
  'submodule.addRemoteCreateFailed': 'Desktop 開唔到遠端 repo：{error}',
  'submodule.addRemoteCreateCancelledUncertain':
    '開 repo 嘅請求喺 Desktop 收到結果之前就完咗。遠端主機可能已經開咗個 repo，再試之前記得去睇清楚，唔好開重複。',
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
  'submodule.addLoadBranchesAction': '載入分支',
  'submodule.addLoadingBranches': '問緊遠端攞分支清單…',
  'submodule.addBranchListFailed':
    'Desktop 未能由遠端列出分支：{error}。你仍然可以自己打分支名。',
  'submodule.addBranchFilterLabel': '篩選分支',
  'submodule.addBranchPickerLabel': '遠端分支',
  'submodule.addBranchDefaultOption': '{branch}（遠端預設）',
  'submodule.addBranchCustomOption': '自訂分支（用分支欄打嗰個）',
  'submodule.addBranchListEmpty':
    '遠端暫時未有分支，子模組會跟佢將來嘅預設分支。',
  'submodule.addBranchListTruncated': '只顯示遠端頭 {count} 條分支。',
  'submodule.addBranchFilterNoMatches': '而家嘅篩選搵唔到分支。',
  'submodule.addBranchFilterInvalidPattern': '分支搜尋 pattern 無效：{error}',
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
  'fileList.viewMode': '變更檔案排法',
  'fileList.flat': '平鋪',
  'fileList.tree': '檔案樹',
  'fileList.directory': '資料夾 {path}',
  'diff.context.legend': '差異上下文',
  'diff.context.autoExpand': '自動攤開整份檔案內容',
  'diff.context.autoExpandHelp':
    '細檔會爽快攤開；大檔或者未讀完整嘅檔案會安全收好，唔拖慢你。',
  'diff.context.stepLegend': '每次展開幾多上下文',
  'diff.context.lines': '{count} 行',
  'history.scope': '歷史範圍',
  'history.scope.currentBranch': '而家呢條分支',
  'history.scope.allRefs': '全部分支同標籤',
  'history.viewMode': '歷史檢視',
  'history.viewMode.list': '提交清單',
  'history.viewMode.graph': '圖表',
  'history.graphPageTitle': '歷史圖表',
  'diff.structured.viewSwitcher': '結構化差異檢視',
  'diff.structured.code': '程式碼',
  'diff.structured.table': '表格',
  'diff.structured.csvCaption': 'CSV 表格差異',
  'diff.structured.tsvCaption': 'TSV 表格差異',
  'diff.structured.rowNumber': '列號',
  'diff.structured.column': '欄 {number}',
  'diff.structured.rowAdded': '新增列',
  'diff.structured.rowRemoved': '移除列',
  'diff.structured.rowChanged': '已變更列',
  'diff.structured.cellAdded': '新增儲存格',
  'diff.structured.cellRemoved': '移除儲存格',
  'diff.structured.cellChanged': '已變更儲存格',
  'diff.structured.selectionHint':
    '想逐行揀選或者丟棄變更，切返去「程式碼」就得。',
  'prCreate.title': '建立 GitHub pull request',
  'prCreate.reviewTitle': '覆核 GitHub pull request',
  'prCreate.successTitle': 'GitHub pull request 已建立',
  'prCreate.targetRepository': '目標 repo',
  'prCreate.account': '帳戶',
  'prCreate.baseBranch': '基礎分支',
  'prCreate.headBranch': '來源分支',
  'prCreate.currentBranch': '本機分支：{branch}',
  'prCreate.template': 'Pull request 範本',
  'prCreate.noTemplate': '空白 pull request',
  'prCreate.loadingOptions': '載入緊範本同 repo 選項…',
  'prCreate.optionalWarning': '有啲可選項目暫時用唔到；pull request 照樣開得。',
  'prCreate.titleField': '標題',
  'prCreate.descriptionField': '描述（可選）',
  'prCreate.charactersRemaining': '仲可以輸入 {count} 個字元',
  'prCreate.markdownSupported': '支援 Markdown',
  'prCreate.draftAction': '建立做草稿 pull request',
  'prCreate.reviewers': '覆核者',
  'prCreate.assignees': '負責人',
  'prCreate.labels': '標籤',
  'prCreate.milestone': '里程碑',
  'prCreate.none': '無',
  'prCreate.choiceUnavailable': '呢個帳戶暫時攞唔到建議',
  'prCreate.choiceCapped': '安全起見，只顯示頭一批選項',
  'prCreate.cancel': '取消',
  'prCreate.close': '關閉',
  'prCreate.reviewAction': '覆核 pull request',
  'prCreate.backToEdit': '返去編輯',
  'prCreate.createAction': '建立 pull request',
  'prCreate.createDraftAction': '建立草稿 pull request',
  'prCreate.creating': '建立緊 pull request…',
  'prCreate.waitingFor': '等緊 {target}',
  'prCreate.cancelRequest': '取消請求',
  'prCreate.canceling': '取消緊…',
  'prCreate.readyStatus': '準備好俾人覆核',
  'prCreate.draftStatus': '草稿',
  'prCreate.description': '描述',
  'prCreate.noDescription': '無描述',
  'prCreate.metadataSummary':
    '覆核者：{reviewers}；負責人：{assignees}；標籤：{labels}；里程碑：{milestone}',
  'prCreate.confirmation':
    '確認後會用 {account} 身份，喺 {target} 建立一個{status} pull request。取消咗嘅請求都有可能已經送到 GitHub。',
  'prCreate.created': 'Pull request #{number} 已建立',
  'prCreate.draftCreated': '草稿 pull request #{number} 已建立',
  'prCreate.done': '完成',
  'prCreate.openOnGitHub': '喺 GitHub 開啟',
  'prCreate.partialSuccess': 'Pull request 已建立，不過有以下跟進提示：',
  'prCreate.templateNotice': '範本提示：{notice}',
  'mrEditor.createTitle': '建立 merge request',
  'mrEditor.editTitle': '編輯 merge request',
  'mrEditor.description':
    '用呢個 repo 已綁定嘅 GitLab 帳戶，準備有安全界線嘅 merge request 資料。',
  'mrEditor.project': 'Project',
  'mrEditor.boundAccount': 'Repo 綁定帳戶',
  'mrEditor.routeAria': '指定 GitLab project 同 repo 綁定帳戶',
  'mrEditor.formAria': 'Merge request 詳情',
  'mrEditor.sourceBranch': '來源分支',
  'mrEditor.sourceEditLocked':
    'GitLab 建立 merge request 之後唔支援更改來源分支。',
  'mrEditor.targetBranch': '目標分支',
  'mrEditor.titleField': '標題',
  'mrEditor.descriptionField': '描述（可選）',
  'mrEditor.charactersRemaining': '仲可以輸入 {count} 個字元',
  'mrEditor.markdownSupported': '支援 Markdown',
  'mrEditor.draftAction': '草稿 merge request',
  'mrEditor.reviewers': '覆核者',
  'mrEditor.assignees': '負責人',
  'mrEditor.reviewersUnavailable':
    '暫時攞唔到覆核者選項；其他欄位仍然可以編輯。',
  'mrEditor.assigneesUnavailable':
    '暫時攞唔到負責人選項；其他欄位仍然可以編輯。',
  'mrEditor.noneAvailable': '暫時冇可用選項。',
  'mrEditor.keyboardHint':
    '喺「標題」按 Enter，或者喺「描述」按 Ctrl+Enter 就可以提交。',
  'mrEditor.cancel': '取消',
  'mrEditor.refresh': '重新整理 merge request 資料',
  'mrEditor.createAction': '建立 merge request',
  'mrEditor.saveAction': '儲存 merge request',
  'mrEditor.creating': '建立緊 merge request…',
  'mrEditor.saving': '儲存緊 merge request…',
  'mrEditor.created': 'Merge request 已建立。',
  'mrEditor.saved': 'Merge request 已儲存。',
  'mrEditor.canceled': 'Merge request 操作已取消。',
  'mrEditor.loading': '載入緊有安全上限嘅 merge request 選項…',
  'mrEditor.emptyBranches': '暫時冇分支可以建立 merge request。',
  'mrEditor.emptySource': '暫時冇可用來源分支。',
  'mrEditor.emptyTarget': '暫時冇可用目標分支。',
  'mrEditor.emptyDescription':
    '等 repo 同 GitLab project 有分支之後，再重新整理。',
  'mrEditor.errorTitle': '暫時攞唔到 merge request 選項',
  'mrEditor.errorAuthentication': '認證唔到呢個 repo 已綁定嘅 GitLab 帳戶。',
  'mrEditor.errorPermission':
    '呢個 repo 已綁定嘅 GitLab 帳戶冇權讀取此 project。',
  'mrEditor.errorNetwork': '連唔到 GitLab；請檢查網絡再試。',
  'mrEditor.errorUnsupported':
    '呢部 GitLab 伺服器未提供所需嘅 merge request API。',
  'mrEditor.errorInvalidResponse':
    'GitLab 回傳嘅資料未能安全驗證，所以冇使用。',
  'mrEditor.errorUnknown': '載入唔到 merge request 資料；請重新整理再試。',
  'mrEditor.staleTitle': 'Repo 或帳戶資料已經轉咗',
  'mrEditor.staleDescription':
    '呢個編輯器綁住較舊嘅 repo、帳戶、端點或者請求版本；提交之前請先重新整理。',
  'mrEditor.partialTitle': '有部分可選資料未齊',
  'mrEditor.partialUnavailable':
    '用唔到嘅覆核者或負責人欄位已停用；必填欄位仍然可以使用。',
  'mrEditor.partialCapped':
    '一個或以上選項清單已到安全上限，或者有項目未通過驗證。',
  'mrEditor.readinessLabel': 'Merge 準備狀態',
  'mrEditor.readinessChecking': 'GitLab 仲檢查緊可唔可以 merge…',
  'mrEditor.readinessReady': '可以 merge',
  'mrEditor.readinessBlocked': '暫時未可以 merge：{reason}',
  'mrEditor.readinessUnknown': '暫時未有 merge 準備狀態。',
  'mrEditor.blockerStatus': 'project 政策或者 merge 檢查',
  'mrEditor.blockerCiMustPass': 'pipeline 要先通過',
  'mrEditor.blockerCiRunning': 'pipeline 仲運行緊',
  'mrEditor.blockerConflict': '來源同目標分支有衝突',
  'mrEditor.blockerDiscussions': '仲有覆核討論未解決',
  'mrEditor.blockerDraft': 'merge request 仲係草稿',
  'mrEditor.blockerExternalChecks': '外部狀態檢查仲未完成',
  'mrEditor.blockerJira': '欠缺必要 Jira 關聯',
  'mrEditor.blockerRebase': '來源分支要先 rebase',
  'mrEditor.blockerApproval': '仲未有齊必要批准',
  'mrEditor.blockerNotOpen': 'merge request 唔係開放狀態',
  'mrEditor.blockerPolicy': 'merge 政策拒絕咗今次請求',
  'mrEditor.blockerCommitsStatus': '有一個或以上 commit 狀態阻擋緊',
  'mrEditor.blockerRequestBlocked': '有另一個 merge request 條件阻擋緊',
  'mrEditor.blockerMergeTime': '未到預定 merge 時間',
  'mrEditor.blockerRequestedChanges': '覆核者要求咗修改',
  'mrEditor.blockerSecurityPipeline': '安全政策 pipeline 檢查仲未完成',
  'mrEditor.blockerSecurityViolation': '有安全政策違規',
  'mrEditor.blockerStatusChecks': '必要狀態檢查要先通過',
  'mrEditor.blockerLockedPaths': '有一個或以上已改路徑被鎖定',
  'mrEditor.blockerLockedLfs': '有一個或以上已改 LFS 檔案被鎖定',
  'mrEditor.blockerTitleRegex': '標題唔符合 project 政策',
  'mrEditor.validationTitle': '請修正以下 merge request 資料：',
  'mrEditor.validationSource': '請揀一條有效來源分支。',
  'mrEditor.validationTarget': '請揀一條有效目標分支。',
  'mrEditor.validationBranchesDiffer': '來源同目標分支唔可以一樣。',
  'mrEditor.validationTitleRequired': '請輸入 merge request 標題。',
  'mrEditor.validationTitleLength': '標題超過 255 字元安全上限。',
  'mrEditor.validationTitleInvalid': '請移除標題前後空白或者唔支援嘅控制字元。',
  'mrEditor.validationBodyLength': '描述超過 128 KiB 安全上限。',
  'mrEditor.validationBodyInvalid': '描述包含唔支援嘅 null 字元。',
  'mrEditor.validationReviewerLimit': '最多揀 20 位覆核者。',
  'mrEditor.validationAssigneeLimit': '最多揀 20 位負責人。',
  'mrEditor.validationReviewerDuplicate': '每位覆核者只可以揀一次。',
  'mrEditor.validationAssigneeDuplicate': '每位負責人只可以揀一次。',
  'mrEditor.validationReviewerInvalid':
    '有一位已揀覆核者唔喺目前安全選項入面。',
  'mrEditor.validationAssigneeInvalid':
    '有一位已揀負責人唔喺目前安全選項入面。',
  'mrEditor.submitRejected':
    'GitLab 拒絕咗 merge request 更新；請重新整理並覆核目前狀態。',
  'mrEditor.submitNetwork': 'Merge request 更新連唔到 GitLab；請檢查網絡再試。',
  'mrEditor.submitStale':
    '更新完成之前，repo、帳戶、merge request 或 HEAD 已經轉咗。',
  'mrEditor.submitInvalidResponse': 'GitLab 回傳嘅更新結果未能安全驗證。',
  'mrEditor.submitUnknown': 'Merge request 更新未完成；再試之前請先重新整理。',
  'mrLifecycle.title': 'Merge request 生命週期',
  'mrLifecycle.loading': '載入緊 merge request 生命週期…',
  'mrLifecycle.empty': '未揀 merge request',
  'mrLifecycle.emptyDescription':
    '建立或者揀一個 merge request，先可以管理佢嘅生命週期。',
  'mrLifecycle.unavailable': '暫時用唔到 merge request 生命週期',
  'mrLifecycle.unavailableDescription':
    '請重新整理 repo 綁定嘅 GitLab 資料再試。',
  'mrLifecycle.stale': 'Merge request 生命週期資料已經轉咗',
  'mrLifecycle.staleDescription':
    'Repo、帳戶、merge request 或 HEAD 資料已經轉咗；操作之前請先重新整理。',
  'mrLifecycle.partial': '有部分生命週期資料未能提供；可用操作仍然有安全界線。',
  'mrLifecycle.summaryAria': 'Merge request 生命週期摘要',
  'mrLifecycle.state': '狀態',
  'mrLifecycle.stateOpened': '開放',
  'mrLifecycle.stateClosed': '已關閉',
  'mrLifecycle.stateMerged': '已 merge',
  'mrLifecycle.stateLocked': '已鎖定',
  'mrLifecycle.draft': '草稿',
  'mrLifecycle.author': '作者',
  'mrLifecycle.reviewers': '覆核者',
  'mrLifecycle.assignees': '負責人',
  'mrLifecycle.none': '冇',
  'mrLifecycle.approval': '批准進度',
  'mrLifecycle.approvalUnavailable': '暫時未有批准狀態。',
  'mrLifecycle.approvalComplete': '已經有齊必要批准',
  'mrLifecycle.approvalProgress': '必要批准已完成 {approved}/{required}',
  'mrLifecycle.approvedBy': '由 {names} 批准',
  'mrLifecycle.pipeline': 'Pipeline',
  'mrLifecycle.pipelineUnavailable': '暫時未有 pipeline 狀態。',
  'mrLifecycle.pipelineNone': '未有 pipeline',
  'mrLifecycle.pipelinePending': '等候中',
  'mrLifecycle.pipelineRunning': '運行緊',
  'mrLifecycle.pipelinePassed': '已通過',
  'mrLifecycle.pipelineFailed': '失敗',
  'mrLifecycle.pipelineCanceled': '已取消',
  'mrLifecycle.pipelineSkipped': '已略過',
  'mrLifecycle.pipelineUnknown': '未知',
  'mrLifecycle.readiness': 'Merge 準備狀態',
  'mrLifecycle.updated': '更新時間',
  'mrLifecycle.timeUnavailable': '暫時未有時間',
  'mrLifecycle.close': '關閉 merge request',
  'mrLifecycle.reopen': '重新開啟 merge request',
  'mrLifecycle.approve': '批准目前 HEAD',
  'mrLifecycle.unapprove': '移除批准',
  'mrLifecycle.refresh': '重新整理生命週期',
  'mrLifecycle.openCanonical': '喺 GitLab 開啟',
  'mrLifecycle.operationRunning': '{action}…',
  'mrLifecycle.operationSuccess': '{action}已完成。',
  'mrLifecycle.operationCanceled': '生命週期操作已取消。',
  'mrLifecycle.operationError': '生命週期操作未完成；再試之前請先重新整理。',
  'forkCheckout.action': '由另一個 fork checkout…',
  'forkCheckout.title': 'Checkout 另一個 fork 嘅分支',
  'forkCheckout.description':
    '揀實一個 fork 同分支 head，覆核受管 refs，之後先安全 checkout。',
  'forkCheckout.close': '關閉 fork 分支 checkout',
  'forkCheckout.loadingForks': '載入緊 repo 網絡…',
  'forkCheckout.forkLabel': 'Fork repo',
  'forkCheckout.chooseFork': '揀一個 fork',
  'forkCheckout.filterForks': '用擁有者或者 repo 名篩選 fork',
  'forkCheckout.loadingBranches': '載入緊精確分支 head…',
  'forkCheckout.branchLabel': 'Fork 分支',
  'forkCheckout.chooseBranch': '揀一條分支',
  'forkCheckout.filterBranches': '篩選 fork 分支',
  'forkCheckout.localBranchLabel': '新本機分支',
  'forkCheckout.review': '覆核 checkout',
  'forkCheckout.reviewing': '覆核緊本機 refs…',
  'forkCheckout.confirmHeading': '確認精確 checkout',
  'forkCheckout.source': '來源',
  'forkCheckout.head': '已覆核 head',
  'forkCheckout.local': '本機分支',
  'forkCheckout.remote': '受管遠端',
  'forkCheckout.remoteNew': '{remote}（會新增）',
  'forkCheckout.remoteReuse': '{remote}（現有 Desktop 遠端）',
  'forkCheckout.remoteRef': '受管遠端 ref',
  'forkCheckout.staleGuard':
    '確認時會再核對 repo、fork、分支 head、遠端同本機分支，啱晒先至改 Git。',
  'forkCheckout.confirm': 'Fetch 並 checkout',
  'forkCheckout.checkingOut': '再核對、fetch 同準備 checkout 緊…',
  'forkCheckout.success':
    '已準備 {branch}，位置係 {sha}。如果本機變更要處理，跟埋 Desktop checkout 提示就搞掂。',
  'forkCheckout.limitNotice':
    '清單去到安全上限喇。可以篩選而家嘅結果，或者去 GitHub 收窄網絡後再重新整理。',
  'forkCheckout.rejectedNotice':
    '已忽略 {count} 個格式有問題或者唔安全嘅 API 項目。',
  'forkCheckout.emptyForks': '呢個網絡搵唔到其他睇得到嘅 fork。',
  'forkCheckout.emptyBranches': '呢個 fork 搵唔到有效分支。',
  'forkCheckout.useSuggestion': '用建議分支 {branch}',
  'forkCheckout.errorUnsupported': '呢個流程只適用於 GitHub repo。',
  'forkCheckout.errorSignIn': '請用指派俾呢個 repo 嘅帳戶登入，再試一次。',
  'forkCheckout.errorMalformed':
    'GitHub 回傳嘅 repo 網絡資料唔夠安全，未能使用。',
  'forkCheckout.errorStale':
    '已覆核嘅 fork、分支或者本機遠端狀態變咗；請重新載入再覆核。',
  'forkCheckout.errorContext':
    '已揀 repo 變咗；請重新打開佢嘅「分支」面板再覆核。',
  'forkCheckout.errorInvalid': '請揀有效 fork 分支，同埋有效嘅新本機分支名。',
  'forkCheckout.errorCollision': '嗰條本機分支已經存在，請換另一個分支名。',
  'forkCheckout.errorRemoteCollision':
    'Desktop 搵唔到唔會覆寫現有遠端嘅安全受管 fork 遠端名。',
  'forkCheckout.errorNetwork':
    'GitHub 或 Git 讀唔到呢個 fork。檢查網絡、帳戶存取同 repo 權限，再試一次。',
  'forkCheckout.errorMoved': 'Fork 分支覆核之後郁咗；請重新載入並覆核新 head。',
  'forkCheckout.errorGit': 'Git 未能準備已覆核 refs；現有本機分支冇被覆寫。',
  'forkCheckout.errorUnknown': 'Fork 分支 checkout 未完成；請重新載入再試。',
  'projects.title': 'GitHub Projects',
  'projects.description':
    '用唯讀模式睇呢個 repo 嘅 Project 視圖、項目同狀態欄位；有安全上限，唔會無限拉資料。',
  'projects.refresh': '重新整理 Projects',
  'projects.sourceLive': 'GitHub 即時資料',
  'projects.sourceCached': '離線快取',
  'projects.sourceUnavailable': '未有快照',
  'projects.updatedAt': '快照時間：{timestamp}',
  'projects.stale': '快取已經超過 24 小時',
  'projects.refreshing': '更新緊…',
  'projects.readOnly':
    '唯讀保證：呢個工作區唔會改 Project、欄位、視圖或者項目。',
  'projects.errorSignedOut':
    '請用呢個 repo 所揀嘅 GitHub 帳戶登入，先可以更新 Projects。',
  'projects.errorAuthentication': 'GitHub 認證唔到所揀帳戶；請重新登入再試。',
  'projects.errorPermission':
    'GitHub 唔畀睇 Projects；請檢查帳戶嘅 repo 同 Projects 權限。',
  'projects.errorRateLimit':
    'GitHub API 配額用完；可以照睇快取，等重設之後再試。',
  'projects.errorNotFound':
    'GitHub 搵唔到呢個 repo，或者所揀帳戶睇唔到相關 Projects。',
  'projects.errorUnsupported':
    '呢部 GitHub 伺服器未提供支援嘅 Projects 唯讀 API。',
  'projects.errorService': 'GitHub Projects 暫時休息緊，等一陣再試。',
  'projects.errorNetwork': '連唔到 GitHub Projects；請檢查網絡再試。',
  'projects.errorInvalidResponse':
    'GitHub 回傳嘅 Projects 資料未能安全驗證，所以冇顯示。',
  'projects.cacheRecovery': '而家顯示上次驗證過嘅離線快照。',
  'projects.partialTitle': '部分資料快照',
  'projects.partialProjects': '已到 Project 安全上限；其餘 Project 冇載入。',
  'projects.partialItems': '已到項目安全上限；其餘項目冇載入。',
  'projects.partialViews': '已到視圖安全上限；其餘視圖冇載入。',
  'projects.partialClassic':
    '呢部伺服器冇 Projects v2，所以用唯讀 classic API 後備。',
  'projects.listAria': 'Repo Projects',
  'projects.itemCount': '已載入 {count} 個項目',
  'projects.stateOpen': '開放',
  'projects.stateClosed': '已關閉',
  'projects.openOnGitHub': '喺 GitHub 打開',
  'projects.viewsAria': 'Project 視圖',
  'projects.noItems': '呢個 Project 冇回傳任何項目。',
  'projects.emptyTitle': '未有 Project 資料',
  'projects.emptyDescription':
    '呢個 repo 冇可見 Project，或者所揀帳戶未有權限睇。',
  'projects.kindIssue': 'Issue',
  'projects.kindPullRequest': 'Pull request',
  'projects.kindDraftIssue': '草稿 issue',
  'projects.kindNote': '記事',
  'projects.kindUnavailable': '暫時睇唔到嘅項目',
  'projects.loading': '載入緊有安全上限嘅 Projects 快照…',
  'reviewRequest.manage': '管理審閱請求…',
  'reviewRequest.openInBrowser': '喺瀏覽器打開審閱請求',
  'reviewRequest.reviewRequested': '已要求審閱',
  'reviewRequest.statusDraft': '草稿',
  'reviewRequest.statusOpen': '開放',
  'reviewRequest.noDescription': '未有提供描述。',
  'reviewRequest.markdownBodyAriaLabel': '審閱請求 Markdown 內容',
  'reviewRequest.quickViewAriaLabel': '審閱請求 #{number} 快速預覽',
  'globalIgnore.title': '全域忽略規則',
  'globalIgnore.description':
    '呢啲規則會透過 Git 嘅 core.excludesFile 套用到每個本機 repo。各 repo 嘅 .gitignore 會保持獨立，可以再加專屬規則。',
  'globalIgnore.pathLabel': '忽略規則檔案',
  'globalIgnore.loading': '讀取緊有效嘅 Git 設定…',
  'globalIgnore.configuredExisting': 'Git 已設定使用呢個現有檔案。',
  'globalIgnore.configuredNew': 'Git 已設定使用呢個新檔案。',
  'globalIgnore.notConfigured': '儲存時會建立呢個檔案，並設定 Git 使用佢。',
  'globalIgnore.starterRules': '常用起步規則',
  'globalIgnore.addEditorFiles': '加入編輯器檔案',
  'globalIgnore.addOSFiles': '加入系統檔案',
  'globalIgnore.rulesAria': '全域忽略規則',
  'globalIgnore.patternPlaceholder': '每行一個 gitignore 規則',
  'globalIgnore.reload': '重新載入',
  'globalIgnore.savingAction': '儲存緊…',
  'globalIgnore.saveAction': '儲存全域規則',
  'globalIgnore.savingStatus': '儲存緊全域忽略規則…',
  'globalIgnore.savedStatus': '全域忽略規則已儲存並啟用。',
  'globalIgnore.loadError': '讀唔到全域忽略規則：{error}',
  'globalIgnore.saveError': '全域忽略規則冇更改：{error}',
  'ignoreFilesContaining.title': '忽略包含指定文字嘅檔案',
  'ignoreFilesContaining.description':
    '用檔名砌 wildcard 規則，即時睇對中邊啲檔案，確認後先加落 .gitignore。',
  'ignoreFilesContaining.patternLabel': 'Wildcard 規則',
  'ignoreFilesContaining.builderLabel': 'Wildcard builder',
  'ignoreFilesContaining.preview': '目前 working tree 有 {count} 個對中檔案',
  'ignoreFilesContaining.invalidPattern':
    'Wildcard 規則唔有效；請關好每個字元類別，並保持少過 256 個字元。',
  'ignoreFilesContaining.noMatches':
    '呢個 wildcard 暫時對唔中任何檔案；改好先加規則。',
  'ignoreFilesContaining.confirm': '加落 .gitignore',
  'customGit.title': '自訂 Git 指令預設',
  'customGit.description':
    '儲存本機、唔經 shell 嘅 Git 參數預設。每次執行都要先覆核，並只會套用到目前所揀 repo。',
  'customGit.savedPreset': '已儲存預設',
  'customGit.newUnsavedPreset': '未儲存嘅新預設',
  'customGit.newAction': '新增',
  'customGit.name': '名稱',
  'customGit.subcommand': 'Git 子指令',
  'customGit.arguments': '參數',
  'customGit.warning':
    '唔好喺預設放密碼或者 token。標準輸入已關閉，所以唔支援互動式指令。',
  'customGit.saveAction': '儲存預設',
  'customGit.reviewAction': '覆核執行',
  'customGit.deleteAction': '刪除預設',
  'customGit.cancelRun': '取消執行',
  'customGit.confirmRunTitle': '喺所揀 repo 執行呢條指令？',
  'customGit.confirmRunWarning':
    'Git 內建指令可以改檔案、refs、遠端同已發佈歷史。繼續之前請覆核完整預設。',
  'customGit.runReviewed': '執行已覆核指令',
  'customGit.goBack': '返回',
  'customGit.confirmDeleteTitle': '刪除呢個本機預設？',
  'customGit.confirmDeleteDescription': 'Repo 唔會有任何更改。',
  'customGit.keepPreset': '保留預設',
  'customGit.outputAria': '自訂 Git 指令輸出',
  'customGit.initialStatus': '建立或者揀一個本機指令預設。',
  'customGit.repositoryChangedStatus': 'Repo 變咗；請重新覆核預設。',
  'customGit.invalidNameError': '預設名稱要有 1 至 80 個可顯示字元。',
  'customGit.savedStatus': '預設已儲存喺呢部裝置。',
  'customGit.saveError': '儲存唔到預設。',
  'customGit.removedStatus': '預設已由呢部裝置移除。',
  'customGit.reviewError': '覆核唔到指令。',
  'customGit.runningStatus': '執行緊已覆核 Git 預設…',
  'customGit.startError': '預設未能開始執行。',
  'customGit.completedStatus': '自訂 Git 預設已完成。',
  'customGit.cancelledStatus': '自訂 Git 預設已取消。',
  'customGit.failedStatus': '自訂 Git 預設執行失敗。',
  'customGit.exitCodeError': 'Git 以代碼 {code} 結束。',
  'editor.wslDisplayName': '{editor} — WSL：{distribution}',
  'editor.wslDistributionMismatch':
    '呢個路徑屬於 WSL 發行版「{distribution}」。請揀返配對嘅 WSL 編輯器項目。',
  'editor.wslInvalidDistributionPath': '請揀有效嘅 WSL 發行版同路徑。',
  'editor.wslTranslateFailed':
    'WSL 轉換唔到呢個路徑。請檢查所揀發行版有冇運行，再試一次。',
  'editor.wslInvalidTranslatedPath': 'WSL 回傳咗無效嘅轉換路徑。',
  'editor.wslInvalidTarget': '請揀有效嘅 WSL 編輯器目標。',
  'networkRepository.unavailable':
    '呢個網絡位置而家用唔到，或者睇落唔係 Git repo。',
  'networkRepository.reconnect':
    '請重新連接共享、映射磁碟、VPN 或 WSL 發行版，再試一次。',
  'networkRepository.unavailableAria':
    '呢個網絡位置而家用唔到，或者唔係 Git repo。請重新連接再試。',
  'networkRepository.mappedDrive': '映射網絡磁碟',
  'networkRepository.wslShare': 'WSL 共享',
  'networkRepository.uncShare': 'UNC 網絡共享',
  'networkRepository.detected':
    '偵測到以下位置：{location}。Desktop Material 會保留精確路徑；如果位置離線，做 Git 操作前請先重新連接。',
  'pullBranchDeleted.title': '遠端分支已經冇咗',
  'pullBranchDeleted.loading': '睇緊喺呢個 repo 轉分支會發生咩事…',
  'pullBranchDeleted.reviewAria': '遠端分支被刪救援',
  'pullBranchDeleted.intro.plain':
    'Pull {repository}失敗，因為 {remote} 已經冇咗 {remoteBranch} 呢條分支，而本地分支 {branch} 就係追蹤住佢。',
  'pullBranchDeleted.intro.light':
    'Pull {repository} 拉咗個吉：{remote} 已經冇咗 {remoteBranch}，但係本地分支 {branch} 仲死心不息咁追蹤住佢。',
  'pullBranchDeleted.intro.playful':
    '{repository} 去 pull 一條走咗人嘅分支。{remote} 已經冇咗 {remoteBranch}，你部機嘅 {branch} 仲喺度癡心追蹤緊隻鬼。',
  'pullBranchDeleted.intro.maximum':
    '{repository} 打去 {remote} 想 pull {remoteBranch}，點知嗰邊話「呢條分支已經搬走，冇留地址」。你本地嘅 {branch} 仲日日寫緊信畀佢。',
  'pullBranchDeleted.offer':
    'Desktop Material 可以喺 {repository} 幫你 checkout 返 {default}，然後 pull 嗰條。',
  'pullBranchDeleted.blockedTitle': '轉唔到分支',
  'pullBranchDeleted.blockedNoDefaultBranch':
    '{repository} 未設定預設分支，所以冇嘢可以轉過去。Desktop Material 唔會靠估幫你揀——請你自己 checkout 想要嗰條。',
  'pullBranchDeleted.blockedNoCurrentBranch':
    '{repository} 而家冇 checkout 住任何分支，冇得走。',
  'pullBranchDeleted.blockedAlreadyOnDefaultBranch':
    '{repository} 本身已經企喺預設分支度，轉過去等於原地踏步。',
  'pullBranchDeleted.blockedDirtyWorktree':
    '{repository} 仲有未 commit 嘅改動。請你自己先 commit 或者 stash——喺呢度轉分支永遠唔會幫你 stash 或者掉咗啲嘢。',
  'pullBranchDeleted.blockedConflictedWorktree':
    '{repository} 仲有未解決嘅衝突。搞掂或者 abort 咗嗰個操作先至可以轉分支。',
  'pullBranchDeleted.blockedOperationInProgress':
    '{repository} 而家仲有另一個 push、pull 或者 fetch 喺度行緊。等佢完咗再試。',
  'pullBranchDeleted.planFailed':
    '讀唔到 {repository} 嘅現時狀態，乜都冇改過。',
  'pullBranchDeleted.deleteLabel': '順手刪埋本地分支 {branch}',
  'pullBranchDeleted.deleteHint': '預設係熄嘅。Pull 失敗唔係刪分支嘅理由。',
  'pullBranchDeleted.deleteStrandsCommits':
    '有 {count} 個 commit 只係喺 {branch} 度有，{default} 度冇。刪咗條分支就會斷咗佢哋條路。',
  'pullBranchDeleted.deleteStrandsCommitsOne':
    '有 1 個 commit 只係喺 {branch} 度有，{default} 度冇。刪咗條分支就會斷咗佢條路。',
  'pullBranchDeleted.deleteStrandsUnknown':
    'Desktop Material 數唔到 {branch} 獨有幾多個 commit。刪咗可能會斷咗啲嘢。',
  'pullBranchDeleted.deleteFullyMerged':
    '{branch} 上面每個 commit 喺 {default} 度都已經有。',
  'pullBranchDeleted.switchAction': '轉去 {default} 再 pull',
  'pullBranchDeleted.close': '閂咗佢',
  'pullBranchDeleted.startedTitle': '轉緊分支',
  'pullBranchDeleted.startedBody':
    '幫緊 {repository} 由 {branch} 轉去 {default}，然後再 pull 一次。',
  'pullBranchDeleted.recoveredTitle': '預設分支 pull 好咗',
  'pullBranchDeleted.recovered.plain':
    '{repository} 而家喺 {default} 度，pull 已經完成。',
  'pullBranchDeleted.recovered.light':
    '{repository} 搬咗去 {default}，今次 pull 終於過到骨。',
  'pullBranchDeleted.recovered.playful':
    '{repository} 移民去咗 {default}，之前拉極都拉唔到嘢嗰個 pull，今次終於拉到嘢返嚟。',
  'pullBranchDeleted.recovered.maximum':
    '{repository} 執好包袱搬咗去 {default}，拉咗成日空氣嗰個 pull，今次終於拉到真嘢返嚟。',
  'pullBranchDeleted.retryFailedTitle': '轉咗分支，但係 pull 失敗',
  'pullBranchDeleted.retryFailedBody':
    '{repository} 而家喺 {default} 度，不過 pull 失敗咗：{error}',
  'pullBranchDeleted.checkoutFailedTitle': '轉唔到分支',
  'pullBranchDeleted.checkoutFailedBody':
    '{repository} checkout 唔到去 {default}。其他嘢一律冇改過。',
  'pullBranchDeleted.deletionDone':
    '本地分支 {branch} 已經刪咗。佢個遠端分支本來就已經冇咗。',
  'pullBranchDeleted.deletionSkipped': '本地分支 {branch} 保留咗：{reason}',
  'pullPreview.title': '預覽 Pull',
  'pullPreview.loading': 'Fetch 緊最新 upstream 狀態，唔會郁你個 worktree…',
  'pullPreview.progressTitle': '準備緊 Pull 預覽',
  'pullPreview.progressRefresh': '重新整理緊 repo 狀態',
  'pullPreview.reviewAria': '已覆核 Pull 預覽',
  'pullPreview.routeAria': 'Pull 路線',
  'pullPreview.localBranch': '本機分支',
  'pullPreview.upstreamBranch': 'Upstream 分支',
  'pullPreview.strategy': '整合方式',
  'pullPreview.strategyFastForward': '快轉',
  'pullPreview.strategyMerge': '合併',
  'pullPreview.strategyRebase': 'Rebase',
  'pullPreview.strategyRebaseMerges': 'Rebase（保留合併）',
  'pullPreview.strategyRebaseInteractive': '互動式 Rebase',
  'pullPreview.strategyFastForwardOnly': '只准快轉',
  'pullPreview.ahead': '領先 {count} 個',
  'pullPreview.behind': '落後 {count} 個',
  'pullPreview.upToDateTitle': '已經最新喇',
  'pullPreview.upToDateBody':
    'Fetch 完發現冇 upstream commit 要 Pull 入呢條分支。',
  'pullPreview.incomingCommits': '即將拉入嘅 commit',
  'pullPreview.moreCommits': '今次 Pull 仲包括另外 {count} 個 commit。',
  'pullPreview.changedFiles': '即將變更嘅檔案',
  'pullPreview.noChangedFiles': '即將拉入嘅 commit 冇淨檔案變更。',
  'pullPreview.moreFiles': '今次 Pull 仲包括另外 {count} 個變更檔案。',
  'pullPreview.fileNew': '新增',
  'pullPreview.fileModified': '修改',
  'pullPreview.fileDeleted': '刪除',
  'pullPreview.fileRenamed': '改名',
  'pullPreview.fileCopied': '複製',
  'pullPreview.exactCommitNote':
    'Pull 只會整合畫面顯示嘅精確 upstream commit；確認之後唔會再 Fetch 更新嘅 tip。',
  'pullPreview.conflictNote':
    '分支有分歧時仍然可能要處理衝突；到時可以照用現有衝突流程。',
  'pullPreview.dirtyWarning':
    '請先 commit 或 stash 本機變更，再重新整理預覽先 Pull。',
  'pullPreview.conflictedWarning': '請先解決目前衝突，再重新整理預覽先 Pull。',
  'pullPreview.fastForwardOnlyWarning':
    '分支已經有分歧，但 Git 設定只准快轉 Pull。請先調整 Pull 設定或者整理好分支，再繼續。',
  'pullPreview.detached': '預覽 Pull 前，請先 checkout 一條本機分支。',
  'pullPreview.noUpstream':
    '請先發布呢條分支或者設定 upstream，先可以預覽 Pull。',
  'pullPreview.invalidState':
    '而家未能安全讀取分支或 upstream。請重新整理 repo 再試。',
  'pullPreview.errorTitle': 'Pull 預覽要處理一下',
  'pullPreview.errorBusy': '另一個網絡操作做緊。等佢完成，再重新整理預覽。',
  'pullPreview.errorRemoteUnavailable':
    '設定咗嘅 upstream remote 而家用唔到。請檢查分支追蹤設定再試。',
  'pullPreview.errorFetchFailed':
    'Fetch 唔到最新 upstream 狀態，所以冇顯示可能過時嘅預覽。請檢查連線再試。',
  'pullPreview.errorNoIncoming':
    '冇已覆核嘅 upstream commit 可以 Pull。請重新整理預覽。',
  'pullPreview.errorDirty':
    '覆核之後出現咗本機變更。請先 commit 或 stash，再重新整理預覽。',
  'pullPreview.errorConflicted':
    '覆核之後出現咗衝突。請先解決，再重新整理預覽。',
  'pullPreview.errorInvalidConfig':
    'Git Pull 設定無效，或者覆核期間變咗。請先修正設定，再重新整理預覽。',
  'pullPreview.errorStale':
    '覆核之後，本機分支或者 upstream 變咗。Pull 前請重新整理預覽。',
  'pullPreview.errorPullFailed':
    '已覆核 Pull 未完成。請檢查 Git 錯誤，再重新整理先重試。',
  'pullPreview.errorUnexpected': '預覽遇到未預期錯誤。請重新整理 repo 再試。',
  'pullPreview.cancel': '取消',
  'pullPreview.refresh': '重新整理預覽',
  'pullPreview.pull': 'Pull 已覆核 commit',
  'pullPreview.pulling': 'Pull 緊已覆核 commit…',
  'batchSync.title': '同步 repo',
  'batchSync.loadingChoices': '載入緊 repo 選項…',
  'batchSync.reviewAria': 'Repo 批次覆核',
  'batchSync.operation': '操作',
  'batchSync.pullActive': 'Pull 使用中嘅分支',
  'batchSync.fetchOnly': '只 Fetch（唔郁 worktree）',
  'batchSync.mergeCleanup': '合併完成工作去 main、Push，再安全清理',
  'batchSync.mergeCleanupReview':
    'Desktop Material 會點算本機同遠端分支、linked worktree 同 stash；有衝突時會用呢個 repo 已設定嘅 Codex 或 OpenCode。只有 remote main 同 local main 完全一致，而且逐個證明候選 tip 都係 main 嘅 ancestor，先會開始清理。未 commit、未合併、受保護、預設、移動咗、未 push 或者擁有權唔肯定嘅狀態全部保留，唔會扮熟亂刪。',
  'batchSync.mergeCleanupConfirm':
    '我確認：已驗證嘅非預設分支同 linked worktree 可以喺呢部電腦永久刪除，而佢哋精確追蹤嘅遠端分支亦可以刪除。',
  'batchSync.chooseRepositories': '揀 repo',
  'batchSync.selectAll': '全部揀晒',
  'batchSync.selectNone': '全部唔揀',
  'batchSync.noRepositories': '而家冇可用 repo。',
  'batchSync.candidatesAria': '要同步嘅 repo',
  'batchSync.reviewSingle':
    '每次最多同步三個 repo。每個 repo 都有獨立結果，今次只包括呢 {count} 個已覆核 repo。',
  'batchSync.reviewMultiple':
    '每次最多同步三個 repo。每個 repo 都有獨立結果，今次只包括呢 {count} 個已覆核 repo。',
  'batchSync.cancel': '取消',
  'batchSync.startPull': '開始 Pull',
  'batchSync.startFetch': '開始 Fetch',
  'batchSync.startMergeCleanup': '合併、Push 同清理',
  'batchSync.progressAria': '同步進度',
  'batchSync.stopped': '同步已停止',
  'batchSync.pullComplete': 'Pull 完成',
  'batchSync.fetchComplete': 'Fetch 完成',
  'batchSync.mergeCleanupComplete': '合併同清理完成',
  'batchSync.liveProgress': '即時進度',
  'batchSync.couldNotFinish': 'Repo 同步未能完成',
  'batchSync.allProcessed': '所有 repo 都處理好喇',
  'batchSync.pullingRepositories': 'Pull 緊 repo',
  'batchSync.fetchingRepositories': 'Fetch 緊 repo',
  'batchSync.mergingCleanupRepositories': '合併、Push 同驗證清理緊',
  'batchSync.completedOf': '{total} 個 repo 入面已完成 {completed} 個',
  'batchSync.synchronizedAria': '已同步 repo',
  'batchSync.metricComplete': '{count} 個完成',
  'batchSync.metricActive': '{count} 個進行中',
  'batchSync.metricWaiting': '{count} 個等緊',
  'batchSync.finalResult': '每個 repo 都有最終結果。',
  'batchSync.nowPulling': '而家 Pull 緊：{repositories}',
  'batchSync.nowFetching': '而家 Fetch 緊：{repositories}',
  'batchSync.nowMergingCleanup': '而家整合緊：{repositories}',
  'batchSync.waitingNext': '等緊下一個 repo 開始。',
  'batchSync.backgroundNote':
    '每次最多同步三個 repo。工作會繼續，你可以放心放佢去背景。',
  'batchSync.summaryPull':
    'Pull 咗 {completed} 個，略過 {skipped} 個，失敗 {failed} 個。',
  'batchSync.summaryFetch':
    'Fetch 咗 {completed} 個，略過 {skipped} 個，失敗 {failed} 個。',
  'batchSync.summaryMergeCleanup':
    '合併、Push 同清理咗 {completed} 個；略過 {skipped} 個；{failed} 個要再睇。',
  'batchSync.noneToPull': '冇 repo 需要 Pull。',
  'batchSync.noneToMergeCleanup': '冇 repo 需要合併同清理。',
  'batchSync.resultsAria': 'Repo 同步進度',
  'batchSync.repository': 'Repo',
  'batchSync.status': '狀態',
  'batchSync.detail': '目前操作或者結果',
  'batchSync.runBackground': '放去背景跑',
  'batchSync.done': '完成',
  'batchSync.statusWaiting': '等緊',
  'batchSync.statusPulling': 'Pull 緊',
  'batchSync.statusFetching': 'Fetch 緊',
  'batchSync.statusMergingCleanup': '合併同驗證緊',
  'batchSync.statusPulled': '已 Pull',
  'batchSync.statusFetched': '已 Fetch',
  'batchSync.statusMergedCleaned': '已合併同清理',
  'batchSync.statusSkipped': '已略過',
  'batchSync.statusFailed': '失敗',
  'repositoryPicker.status': 'Repo 狀態',
  'repositoryPicker.filters': '篩選器',
  'repositoryPicker.emptyTitle': '一個倉庫都未有',
  'repositoryPicker.emptyBody':
    'Clone 個返嚟、加返部電腦入面已經有嘅資料夾，或者由零開個新倉庫都得。',
  'repositoryPicker.emptyClone': 'Clone 倉庫',
  'repositoryPicker.emptyAdd': '加入本機倉庫',
  'repositoryPicker.emptyCreate': '開個新倉庫',
  'repositoryPicker.filtersActive': '篩選器 · {count}',
  'repositoryPicker.all': '全部',
  'repositoryPicker.clean': '乾淨',
  'repositoryPicker.changed': '有變更',
  'repositoryPicker.ahead': '領先',
  'repositoryPicker.behind': '落後',
  'repositoryPicker.missingOrCloning': '遺失／複製緊',
  'repositoryPicker.hideHiddenAria': '收埋隱藏 repo',
  'repositoryPicker.showHiddenAria': '顯示隱藏 repo（{count}）',
  'repositoryPicker.showingHidden': '顯示緊隱藏項目（{count}）',
  'repositoryPicker.showHidden': '顯示隱藏項目（{count}）',
  'repositoryPicker.hidden': '已隱藏',
  'repositoryPicker.privateRepository': '私人 repo',
  'repositoryPicker.itemHiddenAria': '{repository}，已隱藏',
  'repositoryPicker.hideMenu': '隱藏 repo',
  'repositoryPicker.unhideMenu': '取消隱藏 repo',
  'repositoryPicker.customizeNameMenu': '自訂名稱外觀',
  'repositoryPicker.customizeLogoMenu': '自訂標誌外觀',
  'repositoryPicker.groupRepositoryOne': '1 個 repo',
  'repositoryPicker.groupRepositoryMany': '{count} 個 repo',
  'repositoryPicker.groupCollapsed.plain': '{group}，{repositories}，已摺埋',
  'repositoryPicker.groupCollapsed.light':
    '{group}，{repositories}，而家摺埋咗',
  'repositoryPicker.groupCollapsed.playful':
    '{group}，{repositories}，摺埋晒匿咗喺入面',
  'repositoryPicker.groupCollapsed.maximum':
    '{group}，{repositories}，摺到扁晒扮緊家俬',
  'repositoryPicker.groupExpanded.plain': '{group}，{repositories}，已展開',
  'repositoryPicker.groupExpanded.light': '{group}，{repositories}，而家打開咗',
  'repositoryPicker.groupExpanded.playful':
    '{group}，{repositories}，攤到大大版',
  'repositoryPicker.groupExpanded.maximum':
    '{group}，{repositories}，大門敞開仲煲埋水沖茶',
  'repositoryPicker.autoExpandedOne.plain':
    '篩選期間自動展開咗 1 個摺埋嘅組，令入面嘅結果唔會被隱藏。',
  'repositoryPicker.autoExpandedOne.light':
    '篩選幫你打開咗 1 個摺埋嘅組，唔會食咗入面嘅結果。',
  'repositoryPicker.autoExpandedOne.playful':
    '撬開咗 1 個摺埋嘅組 —— 有搵到嘅嘢匿咗喺入面。',
  'repositoryPicker.autoExpandedOne.maximum':
    '搜查令一到，撬開咗 1 個摺埋嘅組——個結果匿喺梳化後面，即場斷正。',
  'repositoryPicker.autoExpandedMany.plain':
    '篩選期間自動展開咗 {count} 個摺埋嘅組，令入面嘅結果唔會被隱藏。',
  'repositoryPicker.autoExpandedMany.light':
    '篩選幫你打開咗 {count} 個摺埋嘅組，唔會食咗入面嘅結果。',
  'repositoryPicker.autoExpandedMany.playful':
    '撬開咗 {count} 個摺埋嘅組 —— 有搵到嘅嘢匿咗喺入面。',
  'repositoryPicker.autoExpandedMany.maximum':
    '攞住搜查令撬開咗 {count} 個摺埋嘅組——每個入面都有結果匿緊，全部斷正。',
  'repositorySync.commitOne': '1 個 commit',
  'repositorySync.commitMany': '{count} 個 commit',
  'repositorySync.unknown.plain': '未檢查過，同步狀態未知',
  'repositorySync.unknown.light': '重未睇過，所以同步狀態係未知',
  'repositorySync.unknown.playful': '完全未知，仲未有人望過個遠端',
  'repositorySync.unknown.maximum': '一團謎——連個遠端都未同人打過招呼',
  'repositorySync.inSync.plain': '上次檢查時同步咗',
  'repositorySync.inSync.light': '上次檢查時冇嘢要 push 又冇嘢要 pull',
  'repositorySync.inSync.playful':
    '上次望嗰陣乾乾淨淨，冇嘢要 push 又冇嘢要 pull',
  'repositorySync.inSync.maximum':
    '乾淨到反光，遠端同呢邊心有靈犀——冇嘢要 push，冇嘢要 pull',
  'repositorySync.ahead.plain': '{ahead} 要 push，冇嘢要 pull',
  'repositorySync.ahead.light': '有 {ahead} 排住隊等 push，冇嘢要 pull',
  'repositorySync.ahead.playful': '{ahead} 喺跑道等起飛，冇嘢要 pull',
  'repositorySync.ahead.maximum': '{ahead} 喺跑道扣好安全帶踩緊油，冇嘢要 pull',
  'repositorySync.behind.plain': '{behind} 要 pull，冇嘢要 push',
  'repositorySync.behind.light': '有 {behind} 喺遠端等你 pull，冇嘢要 push',
  'repositorySync.behind.playful':
    '{behind} 喺遠端寫住你個名等你 pull，冇嘢要 push',
  'repositorySync.behind.maximum':
    '{behind} 喺遠端舉住寫咗你個名嘅牌仔等接機，冇嘢要 push',
  'repositorySync.diverged.plain': '{ahead} 要 push，{behind} 要 pull',
  'repositorySync.diverged.light':
    '已經分岔：{ahead} 要 push，{behind} 要 pull',
  'repositorySync.diverged.playful':
    '分咗岔喇，{ahead} 要 push、{behind} 要 pull，快啲揀邊條路',
  'repositorySync.diverged.maximum':
    '分咗岔：{ahead} 要 push，{behind} 要 pull，兩邊都覺得自己先係主角',
  'repositorySync.noUpstream.plain': '冇上游分支',
  'repositorySync.noUpstream.light': '冇上游分支可以比較',
  'repositorySync.noUpstream.playful': '冇上游分支，呢條枝自己玩自己',
  'repositorySync.noUpstream.maximum':
    '冇上游分支——呢條枝搬咗入深山，同世界斷聯',
  'repositorySync.detached.plain': 'HEAD 已分離，冇分支可以比較',
  'repositorySync.detached.light': 'HEAD 已分離，所以冇分支可以比較',
  'repositorySync.detached.playful': 'HEAD 飄咗開，冇分支可以比較',
  'repositorySync.detached.maximum':
    'HEAD 甩咗纜飄緊喺太空，冇分支可以打電話返屋企',
  'repositorySync.empty.plain': '仲未有 commit',
  'repositorySync.empty.light': '仲未有 commit，所以冇嘢可以比較',
  'repositorySync.empty.playful': '一張白紙，仲未有 commit',
  'repositorySync.empty.maximum':
    '仲未有 commit——張白紙做緊深呼吸，準備人生首演',
  'repositorySync.cloning.plain': '複製緊，同步狀態未知',
  'repositorySync.cloning.light': '仲複製緊，所以同步狀態未知',
  'repositorySync.cloning.playful': '仲複製緊，等陣先問遠端啦',
  'repositorySync.cloning.maximum':
    '仲複製緊——個 repo 啱啱出世，畀佢着好衫先問遠端啦',
  'repositorySync.missing.plain': '磁碟上搵唔到，同步狀態未知',
  'repositorySync.missing.light': '磁碟上搵唔到，所以同步狀態未知',
  'repositorySync.missing.playful': '喺磁碟上人間蒸發，查唔到個遠端',
  'repositorySync.missing.maximum': '喺磁碟上走佬冇留紙仔，遠端想查都查唔到',
  'repositoryActions.add': '新增',
  'repositoryActions.addAria': '新增 repo',
  'repositoryActions.select': '揀選',
  'repositoryActions.more': '更多',
  'repositoryActions.moreAria': '更多 repo 操作',
  'relativeTime.justNow': '啱啱',
  'repositoryActions.commitPushAll': '全部 commit 同 push',
  'repositoryBulk.enterSelection': '揀多個',
  'repositoryBulk.enterSelectionAria': '一次揀多個 repo',
  'repositoryBulk.barAria': 'Repo 批次操作',
  'repositoryBulk.selectAllVisible': '揀晒睇到嗰啲',
  'repositoryBulk.selectAllVisibleAria': '揀晒而家睇到嘅 repo',
  'repositoryBulk.selectedCount': '揀咗 {count} 個',
  'repositoryBulk.selectRepositoryAria': '揀 repo {repository}',
  'repositoryBulk.clear': '清走',
  'repositoryBulk.clearAria': '清走揀好嘅嘢，順便退出多選',
  'repositoryBulk.fetch': 'Fetch（{count}）',
  'repositoryBulk.pull': 'Pull（{count}）',
  'repositoryBulk.favorite': '加最愛（{count}）',
  'repositoryBulk.unfavorite': '除最愛（{count}）',
  'repositoryBulk.groupLabel': '分組',
  'repositoryBulk.groupPlaceholder': '分組名',
  'repositoryBulk.assignGroup': '放入分組（{count}）',
  'repositoryBulk.removeGroup': '撳出分組（{count}）',
  'repositoryBulk.remove': '喺清單移除（{count}）',
  'repositoryBulk.noticeAria': '批次操作結果',
  'repositoryBulk.favoritedNotice': '已經加咗 {count} 個 repo 做最愛。',
  'repositoryBulk.unfavoritedNotice': '已經喺最愛拎走 {count} 個 repo。',
  'repositoryBulk.assignedNotice': '已經將 {count} 個 repo 放入 {group}。',
  'repositoryBulk.removedGroupNotice': '已經將 {count} 個 repo 撳出分組。',
  'repositoryBulk.removedNotice': '已經喺清單移除 {count} 個 repo。',
  'repositoryBulk.progressAria': 'Repo 批次進度',
  'repositoryBulk.fetchingTitle': '正喺度 fetch 揀好嘅 repo',
  'repositoryBulk.pullingTitle': '正喺度 pull 揀好嘅 repo',
  'repositoryBulk.completedOf': '{total} 個 repo 之中完成咗 {completed} 個',
  'repositoryBulk.progressTrackAria': '已處理嘅 repo',
  'repositoryBulk.cancel': '取消',
  'repositoryBulk.cancelAria': '等手頭上嗰個做完就停',
  'repositoryBulk.cancelling': '等手頭上嗰個 repo 做完就會停。',
  'repositoryBulk.dismiss': '收起',
  'repositoryBulk.summary':
    '完成 {done} 個，失敗 {failed} 個，跳過 {skipped} 個，未開始 {remaining} 個。',
  'repositoryBulk.resultsAria': '逐個 repo 嘅結果',
  'repositoryBulk.repository': 'Repo',
  'repositoryBulk.status': '狀態',
  'repositoryBulk.detail': '詳情',
  'repositoryBulk.statusQueued': '等緊',
  'repositoryBulk.statusRunning': '做緊',
  'repositoryBulk.statusDone': '完成',
  'repositoryBulk.statusFailed': '失敗',
  'repositoryBulk.statusSkipped': '跳過',
  'repositoryBulk.statusCancelled': '未開始',
  'repositoryBulk.noDetail': '冇報告詳情。',
  'repositoryBulk.removeTitleSingular':
    '喺 Desktop Material 移除 {count} 個 repo？',
  'repositoryBulk.removeTitlePlural':
    '喺 Desktop Material 移除 {count} 個 repo？',
  'repositoryBulk.removeDescription':
    '只係喺呢個清單移除。磁碟上嘅檔案唔會刪除，Git 資料亦唔會改動。',
  'repositoryBulk.removeListAria': '將會移除嘅 repo',
  'repositoryBulk.removeConfirm': '喺清單移除',
  'repositoryBulk.removeCancel': '取消',
  'repositoryGroups.newButton': '分組',
  'repositoryGroups.newButtonAria': '建立 repo 分組',
  'repositoryGroups.actionsLabel': '「{group}」嘅分組操作',
  'repositoryGroups.editMenu': '編輯分組…',
  'repositoryGroups.removeMenu': '移除分組',
  'repositoryGroups.createTitle': '新 repo 分組',
  'repositoryGroups.editTitle': '編輯 repo 分組',
  'repositoryGroups.createIntro':
    '改個組名，再剔返邊幾個 repo 入組。分組淨係整理呢個清單，唔會 clone、搬走或者移除任何 repo。',
  'repositoryGroups.editIntro':
    '改「{group}」個名，或者換入面有邊幾個 repo。而家有 {count} 個 repo。',
  'repositoryGroups.nameLabel': '分組名',
  'repositoryGroups.membersLabel': '呢個分組入面嘅 repo',
  'repositoryGroups.searchLabel': '搵 repo',
  'repositoryGroups.searchPlaceholder': '篩選 repo',
  'repositoryGroups.searchTarget': 'repo 名同路徑',
  'repositoryGroups.regexError': 'Regex：{message}',
  'repositoryGroups.noMatches': '無 repo 夾到呢個搜尋。',
  'repositoryGroups.empty': '暫時未有 repo 可以分組。',
  'repositoryGroups.selectedCount': '{total} 個 repo 之中揀咗 {selected} 個。',
  'repositoryGroups.createAction': '建立分組',
  'repositoryGroups.saveAction': '儲存分組',
  'repositoryGroups.cancelAction': '取消',
  'repositoryGroups.removeAction': '移除分組',
  'repositoryGroups.removeHint':
    '移除分組淨係甩咗個分組標籤。每個 repo 都會留喺清單，磁碟上乜都唔會郁。',
  'repositoryGroups.createdStatus':
    '已建立「{group}」分組，入面有 {count} 個 repo。',
  'repositoryGroups.updatedStatus':
    '已更新「{group}」分組，而家有 {count} 個 repo。',
  'repositoryGroups.removedStatus':
    '已移除「{group}」分組，入面 {count} 個 repo 全部留喺清單。',
  'repositoryGroups.actionFailed': '未能更新 repo 分組，等陣再試。',
  'repositoryGroups.noticeAria': 'Repo 分組結果',
  'removeRepository.trashFailedMessage':
    '呢個 repo 無法移去{trash}。可能有檔案喺其他程式度開住，又或者呢個位置（例如網絡磁碟或者可移除磁碟）唔支援{trash}。',
  'removeRepository.trashFailedWarning':
    '強制刪除會永久喺你嘅磁碟度移除呢個資料夾同埋入面所有內容，無法復原。',
  'removeRepository.forceDeleteButton': '強制永久刪除',
  'patchSeries.initialStatus': '揀匯出或者匯入操作。',
  'patchSeries.runningExport': '匯出緊領先上游嘅 commit',
  'patchSeries.runningImport': '套用緊已覆核嘅 patch 系列',
  'patchSeries.runningContinue': '繼續緊目前 patch 工作階段',
  'patchSeries.runningSkip': '略過緊目前 patch',
  'patchSeries.runningAbort': '中止緊目前 patch 工作階段',
  'patchSeries.operation': 'Patch 系列操作',
  'patchSeries.chooseExportTitle': '揀新 patch 系列資料夾',
  'patchSeries.reviewExportStatus': '覆核新匯出資料夾。',
  'patchSeries.prepareExportError': '準備唔到 patch 系列匯出。',
  'patchSeries.prepareExportFailed': 'Patch 匯出準備失敗。',
  'patchSeries.chooseImportTitle': '按套用次序揀 patch 檔案',
  'patchSeries.patchFileFilter': 'Git patch 系列',
  'patchSeries.reviewImportStatus': '覆核所揀 patch 次序。',
  'patchSeries.prepareImportError': '準備唔到 patch 系列匯入。',
  'patchSeries.prepareImportFailed': 'Patch 匯入準備失敗。',
  'patchSeries.runningStatus': '{operation}…',
  'patchSeries.startError': 'Patch 系列操作未能開始。',
  'patchSeries.cancelledStatus': 'Patch 系列操作已取消。',
  'patchSeries.failedStatus': '{operation}失敗。',
  'patchSeries.gitFailed': 'Git 未能完成呢個操作。',
  'patchSeries.gitFailedWithCode': 'Git 未能完成呢個操作（結束代碼 {code}）。',
  'patchSeries.refreshingStatus': '重新整理緊 repo…',
  'patchSeries.exportedStatus': 'Patch 系列已匯出到新資料夾。',
  'patchSeries.abortedStatus': 'Patch 工作階段已中止，repo 狀態已復原。',
  'patchSeries.completedStatus': 'Patch 系列操作完成。',
  'patchSeries.refreshFailedStatus': 'Patch 操作完成咗，不過重新整理失敗。',
  'patchSeries.refreshRequiredError': '開始另一個操作之前，請先重新整理 repo。',
  'patchSeries.exportConfirmTitle': '匯出領先上游嘅 commit？',
  'patchSeries.exportConfirmDescription':
    'Git 會喺 {destination} 建立有編號嘅新 patch 系列資料夾，絕對唔會取代現有目的地。',
  'patchSeries.exportAction': '匯出 patch 系列',
  'patchSeries.goBack': '返回',
  'patchSeries.importConfirmTitle': '按呢個次序套用 {count} 個 patch？',
  'patchSeries.importConfirmDescription':
    'Git 會用三方後備方式建立 commit。有衝突就先喺「變更」解決，再返嚟繼續、略過或者中止。',
  'patchSeries.additionalPatches': '另外揀咗 {count} 個 patch。',
  'patchSeries.importAction': '套用 patch 系列',
  'patchSeries.recoveryAria': 'Patch 衝突復原',
  'patchSeries.recoveryDescription':
    '喺「變更」解決檔案之後，可以繼續呢個 patch、略過佢，或者中止成個匯入。',
  'patchSeries.continueAction': '繼續',
  'patchSeries.skipAction': '略過 patch',
  'patchSeries.abortAction': '中止匯入',
  'patchSeries.title': 'Patch 系列',
  'patchSeries.heading': '交換方便覆核嘅 commit 系列',
  'patchSeries.description':
    '匯出領先已設定上游嘅 commit，或者按已覆核次序套用原生選檔器揀好嘅編號 patch。',
  'patchSeries.chooseExportAction': '揀匯出目的地',
  'patchSeries.chooseImportAction': '揀 patch 檔案',
  'patchSeries.cancelAction': '取消',
  'patchSeries.resultsAria': 'Patch 系列結果',
  'bulkBranchDelete.aria': '批次刪除分支',
  'bulkBranchDelete.closeAction': '收起分支清理',
  'bulkBranchDelete.openAction': '刪除分支…',
  'bulkBranchDelete.reviewTitle': '覆核本機分支',
  'bulkBranchDelete.protectedDescription': '目前同預設分支已受保護。',
  'bulkBranchDelete.selectAll': '全選',
  'bulkBranchDelete.selectNone': '清除選取',
  'bulkBranchDelete.empty': '冇其他本機分支可以刪除。',
  'bulkBranchDelete.listAria': '準備刪除嘅本機分支',
  'bulkBranchDelete.reviewDeletion': '覆核刪除（{count}）',
  'bulkBranchDelete.confirmSingular': '永久刪除呢 {count} 條指定本機分支？',
  'bulkBranchDelete.confirmPlural': '永久刪除呢 {count} 條指定本機分支？',
  'bulkBranchDelete.remoteUnaffected':
    '遠端分支唔會更改。刪除前會重新核對每個本機 tip，並記錄資料方便復原。',
  'bulkBranchDelete.deleteReviewed': '刪除已覆核分支',
  'bulkBranchDelete.goBack': '返回',
  'bulkBranchDelete.deleting': '刪除緊分支…',
  'bulkBranchDelete.limitError': '每次最多覆核 {count} 條分支。',
  'bulkBranchDelete.reviewChangedError': '已覆核嘅分支清單變咗。',
  'bulkBranchDelete.deleteError': '未能刪除已覆核分支。',
  'bulkBranchDelete.resultsAria': '刪除結果',
  'stashManager.timeUnavailable': '時間暫時睇唔到',
  'stashManager.timestamp': '{timestamp}',
  'stashManager.operationCancelled': '{operation}已取消。Repo 已重新整理。',
  'stashManager.operationFailed':
    '{operation}未能完成。Git 可能留低工作樹衝突；如果還原未能乾淨完成，stash 會保留。請檢查「變更」再試。',
  'stashManager.repositoryChangedStatus': 'Repo 變咗；stash 管理員已重設。',
  'stashManager.operationProgress': '{operation}緊…',
  'stashManager.cancellingStatus': '取消緊…',
  'stashManager.createOperation': '建立命名 stash',
  'stashManager.createSuccess': '命名 stash 已建立，並已放喺記錄咗嘅分支下面。',
  'stashManager.applyOperation': '套用 stash 副本',
  'stashManager.applySuccess': 'Stash 變更已套用，stash 亦保留作復原。',
  'stashManager.saveDetailsOperation': '儲存 stash 詳情',
  'stashManager.saveDetailsSuccess': 'Stash 名稱同分支關聯已更新。',
  'stashManager.clearOperation': '清除已覆核 stash',
  'stashManager.clearSuccessSingular':
    '已清除 {count} 個經 Desktop 管理同覆核嘅 stash；其他 Git stash 完全冇郁過。',
  'stashManager.clearSuccessPlural':
    '已清除 {count} 個經 Desktop 管理同覆核嘅 stash；其他 Git stash 完全冇郁過。',
  'stashManager.stashChangedError':
    '嗰個 stash 變咗；請重新整理並覆核目前清單。',
  'stashManager.restoreOperation': '還原 stash',
  'stashManager.restoreSuccess':
    'Stash 已還原並移除。繼續之前，請先處理「變更」入面嘅衝突。',
  'stashManager.discardOperation': '丟棄 stash',
  'stashManager.discardSuccess': '已丟棄經 Desktop 管理同覆核嘅 stash。',
  'stashManager.createBranchOperation': '由 stash 建立分支',
  'stashManager.createBranchSuccess':
    '新分支已建立並 checkout；只有乾淨還原之後先會消耗 stash。',
  'stashManager.createHeading': '建立命名 stash',
  'stashManager.nameLabel': '名稱',
  'stashManager.createPlaceholder': '今次想暫存啲咩？',
  'stashManager.changesToSave': '要儲存嘅變更',
  'stashManager.allTrackedChanges': '所有已追蹤變更',
  'stashManager.selectedFileSingular': '已揀 {count} 個檔案',
  'stashManager.selectedFilePlural': '已揀 {count} 個檔案',
  'stashManager.includeUntracked': '呢個範圍亦包含未追蹤檔案',
  'stashManager.selectedScopeCaption':
    '所揀範圍會儲存完整檔案，Git 執行前亦會重新核對路徑；部分 hunk staging 會留喺「變更」。',
  'stashManager.untrackedWarning':
    '如果唔剔「包含未追蹤檔案」，已揀嘅未追蹤檔案會留喺「變更」。',
  'stashManager.conflictsWarning':
    '建立另一個 stash 之前，請先處理目前工作樹衝突。',
  'stashManager.createAction': '建立命名 stash',
  'stashManager.fileCountSingular': '{count} 個檔案',
  'stashManager.fileCountPlural': '{count} 個檔案',
  'stashManager.filesLoadWhenOpened': '打開時先載入檔案',
  'stashManager.reviewStashAria': '覆核 {name} 以清除 stash',
  'stashManager.externalLabel': '外部',
  'stashManager.selectedActionsAria': '所揀 stash 操作',
  'stashManager.workingChangesWarningSingular':
    '「變更」已經有 {count} 個檔案。套用或者還原可能衝突；還原失敗會保留 stash。',
  'stashManager.workingChangesWarningPlural':
    '「變更」已經有 {count} 個檔案。套用或者還原可能衝突；還原失敗會保留 stash。',
  'stashManager.applyAction': '套用副本',
  'stashManager.restoreAction': '還原',
  'stashManager.renameMoveAction': '重新命名或移動',
  'stashManager.newBranchAction': '新分支',
  'stashManager.discardAction': '丟棄',
  'stashManager.editStashAria': '編輯 {name}',
  'stashManager.branchAssociation': '分支關聯',
  'stashManager.metadataCaption':
    '呢度只會改 Desktop Material 嘅分組；唔會切換分支，亦唔會修改已儲存檔案。',
  'stashManager.saveDetailsAction': '儲存詳情',
  'stashManager.cancelAction': '取消',
  'stashManager.branchFromAria': '由 {name} 建立分支',
  'stashManager.newLocalBranch': '新本機分支',
  'stashManager.branchCaption':
    'Git 會驗證分支係新嘅、將佢 checkout，並只會喺變更乾淨套用後先消耗 stash。',
  'stashManager.reviewBranchAction': '覆核建立分支',
  'stashManager.confirmRestore':
    '還原會套用呢啲變更，並只會喺 Git 乾淨完成時移除 stash。',
  'stashManager.confirmDiscard': '丟棄會永久移除呢個已覆核 repo stash。',
  'stashManager.confirmBranch': '由呢個 stash 建立並 checkout「{name}」？',
  'stashManager.confirmClearSingular':
    '永久清除呢 {count} 個已覆核 repo stash？只會包括已剔選嘅指定身份。',
  'stashManager.confirmClearPlural':
    '永久清除呢 {count} 個已覆核 repo stash？只會包括已剔選嘅指定身份。',
  'stashManager.createBranchAction': '建立分支',
  'stashManager.confirmAction': '確認',
  'stashManager.inventoryHeading': 'Repo stash 清單',
  'stashManager.clearReviewedAction': '清除已覆核（{count}）',
  'stashManager.emptyInventory': '呢個 repo 冇 stash。',
  'stashManager.currentLabel': '目前',
  'stashManager.managedOnlyCaption':
    '清單入面所有 stash 都係由 Desktop Material 建立。',
  'stashManager.externalCaptionSingular':
    '顯示緊 {count} 個外部 Git stash。支援套用、還原、建立分支同精確覆核後丟棄；外部 metadata 會保持不變。',
  'stashManager.externalCaptionPlural':
    '顯示緊 {count} 個外部 Git stash。支援套用、還原、建立分支同精確覆核後丟棄；外部 metadata 會保持不變。',
  'stashManager.truncatedCaption':
    ' 清單只保留最新 500 項；清除一批已覆核項目後請重新整理。',
  'stashManager.managerAria': 'Stash 管理員',
  'stashManager.repositoryStashSingular': '{count} 個 repo stash',
  'stashManager.repositoryStashPlural': '{count} 個 repo stash',
  'stashManager.checkoutBranchCaption': 'Checkout 一條分支先可以建立 stash',
  'stashManager.onBranchCaption': '{branch} 上有 {count} 個',
  'stashManager.closeAction': '關閉',
  'stashManager.manageAction': '管理',
  'stashManager.controlsAria': '受管 stash 控制',
  'stashManager.cancelOperationAction': '取消操作',
  'stashManager.filterLabel': '篩選 stash',
  'stashManager.filterPlaceholder': '按名或者分支篩走',
  'stashManager.filterAria': '按名或者分支篩選 repo stash',
  'stashManager.filterRegexTarget': 'Stash',
  'stashManager.filterMatchSingular': '中咗 {count} 個 stash',
  'stashManager.filterMatchPlural': '中咗 {count} 個 stash',
  'stashManager.noMatches': '冇 stash 啱呢個篩選。',
  'stashManager.invalidFilterPattern': '搜尋格式唔啱：{error}',
  'stashManager.openDialogAction': '打開完整管理員',
  'stashManager.dialogTitle': 'Stash 管理員',
  'stashManager.dialogDescription':
    '可以命名、搜尋、覆核、還原同匯出所有本機 stash。清單冇項目數上限；實際界線係 Git 儲存量同有界 metadata 讀取。',
  'stashManager.dialogTabsAria': 'Stash 管理員分區',
  'stashManager.openNewTabAction': '開新分頁打開 Stash 管理員頁面',
  'stashManager.allPagesOpen': 'Stash 管理員頁面已經全部開晒',
  'stashManager.morePages': '仲有 {count} 個 Stash 管理員頁面',
  'stashManager.manageTab': '管理',
  'stashManager.exportTab': '匯出',
  'stashManager.historyTab': '歷史',
  'stashManager.appearanceTab': '外觀同語氣',
  'stashManager.closeDialogAction': '關閉管理員',
  'stashManager.historyHeading': '可以復原嘅 stash 歷史',
  'stashManager.historyDescription':
    '每行都會顯示精確 stash 物件身份、分支關聯同名稱，改動之前先俾你睇清楚，唔玩估估下。',
  'stashManager.appearanceHeading': '整到呢個對話框啱你心水',
  'stashManager.appearanceDescription':
    '呢個介面會跟隨應用程式外觀、語言模式、兩個搞笑程度滑桿、焦點顯示、減少動畫同通知歷史。去設定改共享值；值一變，對話框會即時更新。',
  'stashManager.editAppearanceAction': '打開外觀設定',
  'stashManager.appearanceHint':
    '預設係普通文字搜尋，regex 要你主動開；破壞性操作一定可以覆核，而錯誤訊息無論幾搞笑都會講足事實。',
  'stashManager.exportPanelAria': '匯出已揀 stash',
  'stashManager.exportDescription':
    '揀任意數量嘅命名或外部 stash，將 metadata 同精確 Git tree 複製到目錄、ZIP 或 7z 封存。',
  'stashManager.exportSearchLabel': '搜尋要匯出嘅 stash',
  'stashManager.exportSearchAria': '按名稱、分支或者物件 ID 搜尋可匯出 stash',
  'stashManager.exportSearchRegexTarget': '可匯出 stash',
  'stashManager.selectVisible': '揀晒目前顯示',
  'stashManager.invertVisible': '反轉目前顯示選取',
  'stashManager.exportSelectedCount': '已揀 {count} 個匯出',
  'stashManager.exportFormatLabel': '匯出格式',
  'stashManager.exportDirectory': '目錄副本',
  'stashManager.exportSecurityNote':
    '封存密碼只用於今次匯出。有密碼時，header 加密會連 7z 檔名都遮埋；密碼唔會寫入 stash metadata。',
  'stashManager.exportComplete': '匯出完成',
  'stashManager.openExportInEditor': '用 VS Code 打開匯出',
  'stashManager.exportAction': '匯出已揀 stash',
  'stashManager.exportingAction': '匯出緊…',
  'stashManager.exportSelectionRequired': '至少揀一個 stash 先可以匯出。',
  'stashManager.exportFailed': 'Stash 匯出失敗。',
  'stashManager.chooseDirectoryTitle': '揀 stash 副本嘅目錄',
  'stashManager.chooseArchiveTitle': '揀 stash 封存目的地',
  'stashManager.sevenZipOptionsHeading': '7z 選項',
  'stashManager.sevenZipMethod': '壓縮方法',
  'stashManager.sevenZipLevel': '壓縮級別（0–9）',
  'stashManager.sevenZipDictionary': '字典大小',
  'stashManager.sevenZipWordSize': '字詞大小',
  'stashManager.sevenZipMatchFinder': '配對搜尋器',
  'stashManager.sevenZipFastBytes': '快速 bytes',
  'stashManager.sevenZipThreads': '執行緒',
  'stashManager.sevenZipSplitVolumes': '分拆 volumes（例如 100m）',
  'stashManager.sevenZipSolid': 'Solid 封存',
  'stashManager.sevenZipPassword': '密碼',
  'stashManager.sevenZipEncryptHeaders': '加密 7z header 同檔名',
  'stashManager.historySearchLabel': '搜尋 stash 歷史',
  'stashManager.historySearchAria': '按名稱、分支或者物件 ID 搜尋 stash 歷史',
  'stashManager.historySearchRegexTarget': 'Stash 歷史',
  'stashManager.appearanceSearchLabel': '搜尋外觀同語氣控制',
  'stashManager.appearanceSearchAria': '搜尋呢個對話框嘅外觀同語氣控制',
  'stashManager.appearanceSearchRegexTarget': '外觀同語氣控制',
  'tagLifecycle.rejectedError': 'Git 拒絕咗標籤操作；請查看應用程式錯誤詳情。',
  'tagLifecycle.operationFailedError': '標籤操作未能完成。',
  'tagLifecycle.createdStatus': '已建立本機標籤 {name}。',
  'tagLifecycle.movedStatus': '已移動本機標籤 {name}。',
  'tagLifecycle.deletedLocalStatus': '已刪除本機標籤 {name}。',
  'tagLifecycle.pushedStatus': '已 push 標籤 {name}。',
  'tagLifecycle.pushedAllStatus': '已 push {count} 個本機標籤。',
  'tagLifecycle.fetchedPrunedStatus': '已由 {remote} fetch 並清理標籤。',
  'tagLifecycle.deletedRemoteStatus': '已刪除遠端標籤 {name}。',
  'tagLifecycle.confirmMove': '喺 {target} 重新建立 {name}，類型係{kind}標籤。',
  'tagLifecycle.confirmDeleteLocal':
    '刪除本機標籤 {name}。遠端標籤唔會被刪除。',
  'tagLifecycle.confirmPushNew': 'Push 新遠端標籤 {name}。',
  'tagLifecycle.confirmPushReplace':
    'Push {name}；如果遠端唔同，只會取代已精確覆核嘅遠端標籤物件。',
  'tagLifecycle.confirmPushAll':
    'Push 全部 {count} 個已覆核本機標籤；有需要時只會取代精確覆核過嘅遠端物件。',
  'tagLifecycle.confirmFetchPrune':
    '由 {remote} fetch 標籤，並刪除遠端已經唔再提供嘅已覆核本機標籤。',
  'tagLifecycle.confirmDeleteRemote':
    '重新驗證物件 {object} 後，由預設遠端刪除 {name}。',
  'tagLifecycle.createHeading': '建立標籤',
  'tagLifecycle.nameLabel': '名稱',
  'tagLifecycle.targetLabel': '目標',
  'tagLifecycle.targetPlaceholder': 'HEAD、分支或者物件 ID',
  'tagLifecycle.typeLabel': '類型',
  'tagLifecycle.annotated': '附註標籤',
  'tagLifecycle.lightweight': '輕量標籤',
  'tagLifecycle.messageLabel': '訊息',
  'tagLifecycle.signConfigured': '用 Git 已設定嘅 {format} 簽署器簽署',
  'tagLifecycle.signingConfigured': 'Git 顯示呢個 repo 已明確設定簽署金鑰。',
  'tagLifecycle.signingNotConfigured':
    '未明確設定 user.signingkey；Git 可能使用預設簽署器，或者回報簽署功能用唔到。',
  'tagLifecycle.createAction': '建立本機標籤',
  'tagLifecycle.moveAria': '移動 {name}',
  'tagLifecycle.moveHeading': '移動或者重新建立 {name}',
  'tagLifecycle.reviewedObject':
    '已覆核物件係 {object}。如果確認前標籤有變，Git 會拒絕今次操作。',
  'tagLifecycle.newTargetLabel': '新目標',
  'tagLifecycle.recreatedTypeLabel': '重新建立嘅類型',
  'tagLifecycle.signRecreated': '簽署重新建立嘅標籤',
  'tagLifecycle.reviewMoveAction': '覆核移動',
  'tagLifecycle.cancelAction': '取消',
  'tagLifecycle.remoteNotLoaded': '未載入遠端',
  'tagLifecycle.localOnly': '只限本機',
  'tagLifecycle.pushed': '已 push',
  'tagLifecycle.differentRemotely': '同遠端唔同',
  'tagLifecycle.annotatedLower': '附註',
  'tagLifecycle.lightweightLower': '輕量',
  'tagLifecycle.localTagMeta': '{kind} · {target} · {remoteStatus}{signed}',
  'tagLifecycle.signedSuffix': ' · 已簽署',
  'tagLifecycle.moveAction': '移動',
  'tagLifecycle.pushAction': 'Push',
  'tagLifecycle.deleteRemoteAction': '刪除遠端',
  'tagLifecycle.deleteLocalAction': '刪除本機',
  'tagLifecycle.remoteOnlyMeta': '只限遠端 · {target}',
  'tagLifecycle.confirmHeading': '確認標籤操作',
  'tagLifecycle.typeToConfirm': '輸入 {phrase} 以確認',
  'tagLifecycle.confirmAction': '確認',
  'tagLifecycle.managerAria': '標籤生命週期管理員',
  'tagLifecycle.title': '標籤生命週期',
  'tagLifecycle.description':
    '透過有安全界線嘅 Git 操作，管理標籤清單、建立、移動、簽署、push、fetch、清理同刪除。',
  'tagLifecycle.refreshLocalAction': '重新整理本機',
  'tagLifecycle.loadRemoteAction': '載入遠端',
  'tagLifecycle.readOnlyNotice': '臨時子模組工作區喺「Repo 工具」入面係唯讀。',
  'tagLifecycle.loading': '載入緊標籤清單…',
  'tagLifecycle.filterLabel': '篩選標籤',
  'tagLifecycle.fetchedStatus': '已由 {remote} fetch 標籤。',
  'tagLifecycle.fetchAction': 'Fetch 標籤',
  'tagLifecycle.fetchPruneAction': 'Fetch 並清理',
  'tagLifecycle.pushAllAction': '全部 push',
  'tagLifecycle.localTagsHeading': '本機標籤（{count}）',
  'tagLifecycle.noLocalMatches': '冇本機標籤符合呢個篩選。',
  'tagLifecycle.localTruncated':
    '只顯示頭 500 個本機標籤。做批次操作前，請先收窄 repo 標籤集合。',
  'tagLifecycle.remoteOnlyHeading': '{remote} 上只限遠端嘅標籤（{count}）',
  'tagLifecycle.noRemoteMatches': '冇只限遠端嘅標籤符合呢個篩選。',
  'tagLifecycle.remoteTruncated':
    '只顯示頭 500 個遠端標籤。未顯示嘅標籤唔可以刪除；清單完整之前，批次 push 同清理亦會保持停用。',
  'ollama.setup.heading': 'Ollama 本地模型',
  'ollama.setup.description':
    '喺呢部機行同管理大型語言模型。Desktop Material 淨係會經 loopback 位址同 Ollama 傾偈。',
  'ollama.setup.notConfiguredTitle': '連接 Ollama',
  'ollama.setup.notConfiguredBody':
    '仲未設定 Ollama 端點。喺呢部機開咗 Ollama，再連去佢監聽緊嘅 loopback 位址。',
  'ollama.setup.endpointLabel': 'Ollama 端點',
  'ollama.setup.endpointHint':
    '淨係接受 loopback 位址：localhost、127.0.0.0/8 或者 ::1。',
  'ollama.setup.connect': '連接',
  'ollama.setup.connecting': '連接緊…',
  'ollama.setup.invalidEndpoint':
    '請輸入 loopback 嘅 Ollama 端點，例如 http://127.0.0.1:11434。',
  'ollama.setup.connectFailed':
    '喺嗰個端點搵唔到 Ollama。睇下 Ollama 開咗未，然後再試多次。',
  'ollama.setup.saveFailed': '存唔到呢個 Ollama 端點。',
  'ollama.setup.guidanceTitle': '連接之前',
  'ollama.setup.guidanceInstall':
    '裝好 Ollama 再開佢，又或者喺終端機行 `ollama serve`。',
  'ollama.setup.guidanceDefault': '原裝安裝預設監聽 http://127.0.0.1:11434。',
  'ollama.setup.guidanceLocal': '模型、提示同對話全部留喺呢部機。',
  'ollama.setup.providerLabel': 'Ollama 供應商',
  'ollama.providerType': 'Ollama（本機）',
  'ollama.authenticationHeading': '驗證',
  'ollama.authenticationDescription':
    'Ollama 喺本機運行，唔需要 API key。Desktop Material 只會用呢個供應商已設定網址嘅原生管理 API。',
  'ollama.modelsSyncDescription':
    '加咗呢個供應商之後，模型管理員會同步已安裝嘅 Ollama 模型。',
  'ollama.modelsEmpty':
    '未同步任何模型。加咗呢個供應商之後，再開啟佢嘅模型管理員。',
  'ollama.manager.openAction': '管理模型',
  'ollama.manager.backAction': '返去供應商',
  'ollama.manager.title': 'Ollama 模型管理員',
  'ollama.manager.subtitle':
    '安裝、睇資料，同控制呢個 Ollama 供應商上面嘅模型。',
  'ollama.manager.endpoint': '端點',
  'ollama.manager.configuredEndpoint': '已設定嘅端點',
  'ollama.manager.connected': '已連線',
  'ollama.manager.unavailable': '暫時用唔到',
  'ollama.manager.checking': '檢查緊…',
  'ollama.manager.partial': '有部分模型資料載入唔到。',
  'ollama.manager.version': '版本',
  'ollama.manager.installed': '已安裝',
  'ollama.manager.running': '運行緊',
  'ollama.manager.refresh': '重新整理',
  'ollama.manager.refreshing': '重新整理緊…',
  'ollama.manager.searchLabel': '搜尋已安裝模型',
  'ollama.manager.searchPlaceholder': '用名稱、系列或者能力搜尋…',
  'ollama.manager.clearSearch': '清除搜尋',
  'ollama.manager.scopeLabel': '模型清單篩選',
  'ollama.manager.allModels': '全部模型',
  'ollama.manager.runningModels': '只睇運行緊',
  'ollama.manager.inventoryLabel': '已安裝嘅 Ollama 模型',
  'ollama.manager.loadingInventory': '載入緊模型…',
  'ollama.manager.unavailableInventory': '暫時攞唔到模型清單。',
  'ollama.manager.emptyInventory': '呢個端點未安裝任何模型。',
  'ollama.manager.emptyFilter': '而家嘅篩選搵唔到模型。',
  'ollama.manager.modelDetails': '模型詳情',
  'ollama.manager.selectModel': '揀一個已安裝模型嚟睇資料同管理。',
  'ollama.manager.loadingDetails': '載入緊模型詳情…',
  'ollama.manager.runningBadge': '運行緊',
  'ollama.manager.size': '大小',
  'ollama.manager.modified': '修改時間',
  'ollama.manager.digest': '雜湊摘要',
  'ollama.manager.family': '系列',
  'ollama.manager.format': '格式',
  'ollama.manager.parameters': '參數',
  'ollama.manager.quantization': '量化',
  'ollama.manager.capabilities': '能力',
  'ollama.manager.license': '授權摘要',
  'ollama.manager.noneReported': '未有資料',
  'ollama.manager.runtime': '運行狀態',
  'ollama.manager.vram': 'VRAM',
  'ollama.manager.context': 'Context 長度',
  'ollama.manager.expires': '到期時間',
  'ollama.manager.notRunning': '呢個模型而家未載入。',
  'ollama.manager.pullTitle': '安裝模型',
  'ollama.manager.pullHint': '輸入 Ollama 模型名稱；會原樣使用已設定嘅端點。',
  'ollama.manager.modelName': '模型名稱',
  'ollama.manager.pullPlaceholder': 'llama3.2:latest',
  'ollama.manager.pull': 'Pull 並安裝',
  'ollama.manager.pulling': '安裝緊…',
  'ollama.manager.cancel': '取消',
  'ollama.manager.receiving': '接收緊模型資料…',
  'ollama.manager.copyTitle': '複製模型',
  'ollama.manager.copyHint': '用所選模型建立另一個本機模型名稱。',
  'ollama.manager.copyDestination': '複製目的地',
  'ollama.manager.copy': '複製',
  'ollama.manager.renameTitle': '重新命名模型',
  'ollama.manager.renameHint': '先複製做新名稱，再移除原本嗰個。',
  'ollama.manager.renameDestination': '新模型名稱',
  'ollama.manager.rename': '重新命名',
  'ollama.manager.load': '載入 / 啟動',
  'ollama.manager.unload': '卸載 / 停止',
  'ollama.manager.delete': '刪除',
  'ollama.manager.deleteTitle': '刪除模型？',
  'ollama.manager.deleteConfirm': '刪除模型',
  'ollama.manager.invalidName': '請輸入模型名稱。',
  'ollama.manager.duplicateName': '請揀另一個模型名稱。',
  'ollama.manager.operationError': '未能完成模型操作。',
  'ollama.manager.refreshError': '呢個供應商端點暫時連唔到 Ollama。',
  'ollama.manager.detailsError': '未能載入呢個模型嘅延伸詳情。',
  'ollama.manager.configurationPartial':
    'Ollama 操作成功咗，不過未能更新已設定嘅模型清單。',
  'ollama.manager.renamePartial': '複製成功咗，不過未能移除原本模型。',
  'ollama.manager.pullCancelled': '已取消安裝模型。',
  'ollama.manager.chatTitle': '傾偈',
  'ollama.manager.chatHint': '揀個模型傾偈，佢會即時串流回覆畀你。',
  'ollama.manager.chatModelLabel': '傾偈模型',
  'ollama.manager.chatPlaceholder': '打句嘢傾下…',
  'ollama.manager.chatSend': '傳送',
  'ollama.manager.chatStop': '停',
  'ollama.manager.chatClear': '清空對話',
  'ollama.manager.chatStreaming': '回覆緊…',
  'ollama.manager.chatEmpty': '同揀咗嘅模型開始傾偈啦。',
  'ollama.manager.chatNoModel': '要先安裝一個模型先可以傾偈。',
  'ollama.manager.chatUnsupported': '呢個供應商用唔到傾偈功能。',
  'ollama.manager.chatError': '未能完成傾偈要求。',
  'ollama.manager.chatYou': '你',
  'ollama.manager.chatAssistant': '助手',
  'ollama.manager.chatMessageLabel': '訊息',
  'ollama.manager.chatSystem': '系統',
  'ollama.manager.chatSessionsHeading': '對話',
  'ollama.manager.chatDefaultTitle': '新對話',
  'ollama.manager.chatNew': '開新對話',
  'ollama.manager.chatRename': '改名',
  'ollama.manager.chatDelete': '刪除',
  'ollama.manager.chatCancel': '取消',
  'ollama.manager.chatConfirmDelete': '刪除對話',
  'ollama.manager.chatSelectPrompt': '揀一個對話，或者開個新嘅先。',
  'ollama.manager.chatLoading': '載入緊對話…',
  'ollama.manager.chatLoadError': '本機對話工作區載入唔到。',
  'ollama.manager.chatCopy': '複製',
  'ollama.manager.chatAttachImage': '附加圖片',
  'ollama.manager.chatRemoveImage': '移除圖片',
  'ollama.manager.chatUnsupportedImage': '請揀 PNG、JPEG、GIF 或 WebP 圖片。',
  'ollama.manager.chatImageTooLarge': '張圖太大，附加唔到。',
  'ollama.manager.chatClearDraft': '清空草稿',
  'ollama.manager.chatCustomize': '自訂',
  'ollama.manager.chatHistory': '歷史',
  'ollama.manager.chatAppearanceHeading': '對話外觀同字款',
  'ollama.manager.chatAccentLabel': '主色',
  'ollama.manager.chatSurfaceLabel': '表面',
  'ollama.manager.chatSurfaceTonal': '色調',
  'ollama.manager.chatSurfaceNeutral': '中性',
  'ollama.manager.chatMessageFont': '訊息字款',
  'ollama.manager.chatComposerFont': '輸入框字款',
  'ollama.manager.chatSettingsHint':
    '呢啲設定只屬於呢個對話，亦會 commit 入佢嘅本機歷史。',
  'ollama.manager.chatHistoryTitle': '對話歷史',
  'ollama.manager.chatHistoryTimeline': '對話 Git 歷史',
  'ollama.manager.chatHistoryDescription':
    '每段訊息同設定變更都會 commit 入呢個對話自己嘅本機 Git repo。復原、重做同還原都會建立新 commit，條歷史唔會失蹤。',
  'ollama.manager.chatHistorySearchLabel': '搜尋對話歷史',
  'ollama.manager.chatHistorySearchPlaceholder': '搜尋訊息、hash 或者日期',
  'ollama.manager.chatHistorySearchStatus': '喺已載入嘅時間線度搜尋',
  'ollama.manager.chatHistoryMatchingCount':
    '{visible}/{loaded} 個已載入 commit 符合',
  'ollama.manager.chatHistoryUndo': '復原',
  'ollama.manager.chatHistoryRedo': '重做',
  'ollama.manager.chatHistoryCommitSingular': '1 個 commit',
  'ollama.manager.chatHistoryCommitCount': '{count} 個 commit',
  'ollama.manager.chatHistoryLoadingFiles': '載入緊檔案…',
  'ollama.manager.chatHistorySelectToInspect': '揀一個嚟睇',
  'ollama.manager.chatHistoryNoFiles': '冇檔案',
  'ollama.manager.chatHistoryRestoreLabel': '還原「{summary}」',
  'ollama.manager.chatHistoryRestoreTooltip': '還原到呢一點',
  'ollama.manager.chatHistoryRestoreConfirmation':
    '還原到呢一點？系統會建立新 commit，舊歷史唔會消失。',
  'ollama.manager.chatHistoryRestore': '還原',
  'ollama.manager.chatHistoryLoading': '載入緊歷史…',
  'ollama.manager.chatHistoryNoHistoryTitle': '仲未有對話歷史',
  'ollama.manager.chatHistoryNoHistoryDescription':
    '第一個已 commit 嘅對話變更會喺呢度出現。',
  'ollama.manager.chatHistoryNoMatchesTitle': '搵唔到符合嘅對話歷史',
  'ollama.manager.chatHistoryNoMatchesDescription': '換個關鍵字再試下。',
  'ollama.manager.chatHistoryLoadingMore': '載入緊…',
  'ollama.manager.chatHistoryLoadMore': '載入更多',
  'ollama.manager.chatHistoryLoadingDiff': '載入緊差異…',
  'ollama.manager.chatHistoryNoTextChanges': '呢個選項冇文字變更。',
  'ollama.manager.chatHistoryDiffTruncated':
    '安全起見只顯示頭 {shown} 行，仲有 {hidden} 行截咗冇顯示。',
  'ollama.manager.chatHistoryDiffLabel': '對話歷史變更差異',
  'ollama.manager.chatHistorySelectCommit': '揀一個 commit 嚟睇佢改咗啲乜。',
  'ollama.manager.chatHistoryRetry': '再試',
  'ollama.manager.chatHistoryCloseLabel': '關閉對話歷史',
  'ollama.manager.chatHistoryCommitsLabel': '對話歷史 commit',
  'ollama.manager.chatHistoryDetailsLabel': '對話歷史詳情',
  'ollama.manager.chatHistoryChangeCreate': '建立對話',
  'ollama.manager.chatHistoryChangeMessage': '加入對話訊息',
  'ollama.manager.chatHistoryChangeTurn': '加入一輪對話',
  'ollama.manager.chatHistoryChangeRename': '改對話名',
  'ollama.manager.chatHistoryChangeModel': '更改對話模型',
  'ollama.manager.chatHistoryChangeAppearance': '更新對話外觀',
  'ollama.manager.chatHistoryChangeFont': '更新對話字款',
  'ollama.manager.chatHistoryChangeRecover': '修復對話工作階段',
  'ollama.manager.chatHistoryChangeUndo': '復原：{change}',
  'ollama.manager.chatHistoryChangeRedo': '重做：{change}',
  'ollama.manager.chatHistoryChangeRestorePoint': '還原對話到 {point}',
  'ollama.manager.chatHistoryError': '未能完成對話歷史操作。',
  'ollama.manager.chatDeletePrompt':
    '刪除「{title}」同佢成份本機歷史？刪咗冇得救喎。',
  'ollama.manager.chatMessageCount': '{count} 段訊息',
  'ollama.manager.chatImageAlt': '附加圖片 {index}',
  'ollama.manager.chatImageLimit': '最多可以附加 {count} 張圖片。',
  'ollama.manager.unknown': '未知',
  'ollama.manager.never': '永不',
  'ollama.manager.showing': '顯示緊 {visible}/{total} 個模型',
  'ollama.manager.selectedModel': '揀選 {name}',
  'ollama.manager.moreCapabilities': '仲有 {count} 項',
  'ollama.manager.pullProgress': '已完成 {percent}%',
  'ollama.manager.pullSucceeded': '已安裝 {name}。',
  'ollama.manager.copySucceeded': '已由 {source} 複製去 {destination}。',
  'ollama.manager.renameSucceeded': '已由 {source} 改名做 {destination}。',
  'ollama.manager.loadSucceeded': '已載入 {name}。',
  'ollama.manager.unloadSucceeded': '已卸載 {name}。',
  'ollama.manager.deleteSucceeded': '已刪除 {name}。',
  'ollama.manager.confirmDelete':
    '要由呢個 Ollama 端點刪除 {name} 嗎？刪咗冇得返轉頭。',
  'subtree.title': '子樹',
  'color.blue': '藍色',
  'color.violet': '紫色',
  'color.teal': '藍綠色',
  'color.green': '綠色',
  'color.amber': '琥珀色',
  'color.rose': '玫瑰色',
  'settings.dialogTitle': '設定',
  'settings.closeAction': '關閉',
  'settings.notificationsEnableTitle': '開啟通知',
  'settings.notificationsEnableDescription':
    '喺目前 repository 有重要事件發生嗰陣，即刻彈通知話你知。',
  'settings.automationAutoCommitPushTitle': '自動 commit 同 push',
  'settings.automationAutoCommitPushDescription':
    'Copilot 幫你寫 commit 訊息；如果你仲有草稿訊息或者有操作進行緊，就會自動跳過。',
  'settings.automationAutoPullTitle': '自動 pull',
  'settings.automationAutoPullDescription':
    '當工作區乾淨又已經設定咗上游，先至會 pull。',
  'settings.automationIntervalEvery': '每隔',
  'settings.automationIntervalMinutes': '{minutes} 分鐘',
  'settings.automationIntervalGroupLabel': '{title}間隔',
  'settings.globalTabsLabel': '設定頁面',
  'settings.accountsTab': '帳戶',
  'settings.integrationsTab': '整合',
  'settings.copilotTab': 'Copilot',
  'settings.gitTab': 'Git',
  'settings.appearanceTab': '外觀',
  'settings.notificationsTab': '通知',
  'settings.promptsTab': '提示詞',
  'settings.advancedTab': '進階',
  'settings.accessibilityTab': '無障礙',
  'settings.agentAccessTab': 'Agent 存取權',
  'settings.selfHostedServerTab': '自託管伺服器',
  'settings.automationTab': '自動化',
  'settings.aiTab': 'AI',
  'settings.browserTabSearch': '搵 {surface}',
  'settings.browserTabOpenNew': '開新分頁打開 {surface} 頁面',
  'settings.browserTabAllOpen': '{surface} 頁面已經全部開晒',
  'settings.browserTabMore': '仲有 {count} 個 {surface} 頁面',
  'settings.browserTabClose': '關閉 {page} 分頁',
  'settings.browserTabPin': '釘選 {page} 分頁',
  'settings.browserTabUnpin': '取消釘選 {page} 分頁',
  'settings.browserTabPickerTitle': '揀一個 {surface} 頁面',
  'settings.browserTabNoMatches': '搵唔到啱嘅 {surface} 頁面。',
  'settings.queueTab': 'Clone 隊列',
  'settings.attentionTab': '專注與節奏調節',
  'settings.queueHeading': 'Clone 隊列',
  'settings.queueDescription':
    '逐個登入帳戶設定點樣留意同 clone 新發現嘅 repository。',
  'settings.queueNoAccounts':
    '登入託管帳戶之後，就可以喺度設定佢嘅 clone 隊列。',
  'settings.queueAutoCloneTitle': '自動 clone 新 repository',
  'settings.queueAutoCloneDescription':
    '關咗設定頁都會喺背景檢查，只會 clone 儲存基準之後先發現嘅 repository。',
  'settings.queueBaseDirectory': '基礎資料夾',
  'settings.queueChooseDirectory': '揀資料夾',
  'settings.queueDirectoryPlaceholder': '先揀一個基礎資料夾',
  'settings.queueMode': 'Clone 模式',
  'settings.queueModeParallel': '並行 — 最多同時 3 個',
  'settings.queueModeSequential': '逐個嚟 — 一次 1 個',
  'settings.queueEnabledStatus': '已開 · 每 5 分鐘檢查',
  'settings.queueDisabledStatus': '已關',
  'settings.queueDirectoryRequired': '開啟隊列之前，請先揀基礎資料夾。',
  'settings.queueSafetyNote':
    '每批最多 500 個 repository；遇到現有資料夾會安全覆核，而且背景隊列唔會無啦啦彈進度視窗阻住你。',
  'settings.soundTab': '聲音',
  'settings.ollamaTab': '本地模型',
  'settings.soundHeading': '聲音',
  'settings.soundDescription':
    '一套可選嘅音效系統：有旁白、常見動作嘅音效、仲有每個 repository 靜靜哋播嘅音樂。全部預設關閉。',
  'settings.soundMasterEnableTitle': '開啟聲音',
  'settings.soundMasterEnableDescription':
    '成套音效系統嘅總掣。熄咗就乜都唔會出聲。',
  'settings.soundSfxHeading': '音效',
  'settings.soundSfxEnableTitle': '播音效',
  'settings.soundSfxEnableDescription':
    'commit、push、pull、成功同出錯都有短短嘅合成提示聲。',
  'settings.soundSfxVolumeLabel': '音效音量',
  'settings.soundPreviewCue': '試聽音效',
  'settings.soundTtsHeading': '旁白',
  'settings.soundTtsEnableTitle': '讀出指定事件',
  'settings.soundTtsEnableDescription':
    '會用英文或者廣東話讀出有意義嘅事件，有限速唔會嘈住晒。如果螢幕閱讀器已經會讀，就會自動收聲。',
  'settings.soundTtsVolumeLabel': '旁白音量',
  'settings.soundTtsCooldownLabel': '兩句之間最短間隔',
  'settings.soundRecordedNarrationTitle': '用錄好嘅旁白',
  'settings.soundRecordedNarrationDescription':
    '播應用程式內附嘅預錄語音同旋律，唔使即時合成。如果搵唔到對應嘅錄音，會自動改用即時旁白。',
  'settings.soundPreviewNarration': '試聽旁白',
  'settings.soundFunnyHeading': '旁白語氣',
  'settings.soundFunnyEnglishLabel': '英文搞笑程度',
  'settings.soundFunnyCantoneseLabel': '廣東話搞笑程度',
  'settings.soundFunnyHint':
    '去「外觀」設定英文同廣東話搞笑程度。出錯訊息永遠都會講清楚。',
  'settings.soundMusicHeading': '每個 repository 嘅音樂',
  'settings.soundMusicEnableTitle': '播主題音樂',
  'settings.soundMusicEnableDescription':
    '會靜靜哋 loop 你為呢個 repository 揀嘅一首歌，隨時可以暫停。',
  'settings.soundMusicVolumeLabel': '音樂音量',
  'settings.soundMusicRepoLabel': '{repository} 嘅音樂',
  'settings.soundMusicChoose': '揀歌',
  'settings.soundMusicClear': '清除',
  'settings.soundMusicNoRepo': '開一個 repository 先可以揀佢嘅音樂。',
  'settings.soundMusicNoTrack': '未揀歌。',
  'settings.soundThemeSubheading': 'Repository 主題曲',
  'settings.soundThemeExplanation':
    '每個 repository 都有自己嘅 loop 主題曲，用個名即場砌出嚟，唔使 download 任何檔案。',
  'settings.soundThemeCurrentLabel': '{repository} 嘅主題曲',
  'settings.soundThemeStateTheme': '而家播緊呢個 repository 自動生成嘅主題曲。',
  'settings.soundThemeStateCustom': '而家播緊你揀嘅歌，冇播主題曲。',
  'settings.soundThemeStateOff': '呢個 repository 嘅音樂已經靜咗音。',
  'settings.soundThemeUseTheme': '用返生成主題曲',
  'settings.soundThemeMute': '呢度靜音',
  'settings.soundThemePreview': '試聽主題曲',
  'settings.repoThemeNameFormat': '{root} {scale}・{mood}{texture}',
  'settings.repoThemeMoodCalm': '靜謐',
  'settings.repoThemeMoodBright': '明亮',
  'settings.repoThemeMoodDriving': '澎湃',
  'settings.repoThemeMoodDreamy': '夢幻',
  'settings.repoThemeMoodMellow': '柔和',
  'settings.repoThemeMoodPlayful': '俏皮',
  'settings.repoThemeMoodSolemn': '莊嚴',
  'settings.repoThemeMoodElectric': '電感',
  'settings.repoThemeTexturePulse': '脈動',
  'settings.repoThemeTextureCascade': '流瀑',
  'settings.repoThemeTextureDrift': '漂浮',
  'settings.repoThemeTextureBloom': '綻放',
  'settings.repoThemeTextureCircuit': '電路',
  'settings.repoThemeTextureHorizon': '天際',
  'settings.repoThemeTextureLantern': '燈火',
  'settings.repoThemeTextureTide': '潮汐',
  'settings.repoThemeScaleMajor': '大調',
  'settings.repoThemeScaleMinor': '小調',
  'settings.repoThemeScaleDorian': '多利安調',
  'settings.repoThemeScaleMixolydian': '混合利底亞調',
  'settings.repoThemeScaleLydian': '利底亞調',
  'settings.repoThemeScalePentatonic': '五聲音階',
  'settings.soundQuietHoursHeading': '安靜時段',
  'settings.soundQuietHoursEnableTitle': '安靜時段內靜音',
  'settings.soundQuietHoursEnableDescription':
    '喺下面嘅時段內熄晒音效、旁白同音樂。但出錯訊息照樣會讀出嚟，唔會漏咗重要嘢。',
  'settings.soundQuietHoursStartLabel': '由（幾點）',
  'settings.soundQuietHoursEndLabel': '到（幾點）',
  'settings.soundReducedMotionTitle': '跟隨減少動態嘅設定收聲',
  'settings.soundReducedMotionDescription':
    '當系統要求減少動態時，順便靜音非必要嘅聲音同音樂。',
  'settings.soundSfxAuditionHeading': '試聽每種提示音',
  'settings.soundSfxAuditionHint':
    '每個事件都有自己認得出嘅提示音，按家族分組。Push、fetch 同 pull 各有唔同，build 同 run 每個階段亦有自己嘅聲。',
  'settings.soundCuePlayLabel': '播「{cue}」提示音',
  'settings.soundFamilySuccess': '成功',
  'settings.soundFamilyProgress': '進行中',
  'settings.soundFamilyWarning': '警告',
  'settings.soundFamilyError': '出錯',
  'settings.soundFamilyNeutral': '一般',
  'settings.soundCueCommit': 'Commit',
  'settings.soundCuePush': 'Push',
  'settings.soundCuePull': 'Pull',
  'settings.soundCueFetch': 'Fetch',
  'settings.soundCueDetecting': '偵測中',
  'settings.soundCueInstalling': '安裝中',
  'settings.soundCueBuilding': 'Build 緊',
  'settings.soundCueRunning': '執行中',
  'settings.soundCueSucceeded': '成功',
  'settings.soundCueFailed': '失敗',
  'settings.soundCueCancelled': '已取消',
  'settings.soundCueSuccess': '完成',
  'settings.soundCueError': '出錯',
  'settings.soundCueInfo': '資訊',
  'settings.mobileConnectionHeading': '手機連線',
  'settings.mobileConnectionDescription':
    '用預設瀏覽器開一條全新嘅一次性配對連結；秘密只放喺 URL fragment，下次再開就會換新。',
  'settings.mobileConnectionOpen': '開啟手機連線頁面',
  'settings.mobileConnectionChoosePairedMode':
    '請先喺上面揀「已配對 LAN 裝置」，再安全連接手機網站。',
  'settings.mobileConnectionStartServer':
    '請先開啟 agent server，先可以建立一次性手機連線。',
  'settings.mobileConnectionOpenFailed':
    'Desktop Material 開唔到手機連線頁面。',
  'settings.advancedUsageStatsTitle': '使用統計',
  'settings.advancedUsageStatsDescription':
    '提交匿名使用數據，幫手改善 Desktop Material。',
  'settings.advancedCredentialStorageTitle': '憑證儲存',
  'settings.advancedCredentialStorageDescription':
    '權杖只會存喺作業系統嘅憑證庫，絕對唔會寫入 repository 嘅設定檔。',
  'settings.browserOpenModeTitle': '開啟網頁連結',
  'settings.browserOpenModeDescription':
    '預設交畀系統瀏覽器開。如果 app 內瀏覽器一片空白，建議用呢個；只係你明確想用 app 內瀏覽器先揀「喺 Desktop Material 入面」。',
  'settings.browserOpenModeInternal': '喺 Desktop Material 入面',
  'settings.browserOpenModeExternal': '喺系統瀏覽器（預設兼建議）',
  'browser.error.externalOpenFailedTitle': '系統瀏覽器開唔到連結',
  'browser.error.externalOpenFailed':
    'Desktop Material 未能喺系統瀏覽器開呢條網頁連結，亦冇改用其他方法開。請檢查預設瀏覽器再試；或者去「設定 → 進階」明確揀「喺 Desktop Material 入面」。',
  'browser.title': 'Desktop Material 瀏覽器',
  'browser.contentRegionNote':
    '網頁內容由瀏覽器檢視本身顯示。要睇內容，將焦點移入個頁面。',
  'browser.tabs': '瀏覽器分頁',
  'browser.newTab': '新分頁',
  'browser.closeTab': '關閉分頁',
  'browser.closeNamedTab': '關閉分頁：{title}',
  'browser.closeAuthenticationTab': '關閉登入分頁：{title}',
  'browser.authentication': '登入分頁',
  'browser.authChip': '登入',
  'browser.back': '上一頁',
  'browser.forward': '下一頁',
  'browser.stop': '停止載入',
  'browser.refresh': '重新整理',
  'browser.addressLabel': '網址',
  'browser.addressPlaceholder': '輸入網址',
  'browser.go': '前往',
  'browser.removeBookmark': '移除書籤',
  'browser.addBookmark': '加入書籤',
  'browser.openExternal': '喺外部開啟',
  'browser.bookmarks': '書籤',
  'browser.authNoticeTitle': '私人登入工作階段。',
  'browser.authNoticeBody':
    '呢個分頁只會同登入彈出分頁共享記憶體內嘅工作階段；關閉登入後會清走網址同資料，而且唔可以加書籤。',
  'browser.openAuthExternal': '轉去系統瀏覽器繼續',
  'browser.findOpen': '喺頁面搵嘢（Ctrl+F）',
  'browser.findLabel': '喺頁面搵嘢',
  'browser.findQueryLabel': '搵文字或者樣式',
  'browser.findPlaceholder': '喺頁面搵嘢…',
  'browser.findMode': '切換純文字或者 regex 模式',
  'browser.findBuilder': 'Regex 建構器',
  'browser.findCaseSensitive': '分大小寫',
  'browser.findPrevious': '搵上一個',
  'browser.findNext': '搵下一個',
  'browser.findClose': '關閉搵嘢列',
  'browser.findTarget': '呢頁',
  'browser.findSearching': '搵緊…',
  'browser.findNoMatches': '搵唔到配對',
  'browser.findCount': '第 {active} 個，共 {total} 個',
  'browser.findTruncated': '頁面文字已封頂',
  'browser.findResults': 'Regex 配對',
  'browser.findMatch': '去第 {number} 個配對',
  'browser.error.invalidAddress': '請輸入有效嘅 HTTP 或 HTTPS 網址。',
  'browser.error.loadFailed': '載入唔到呢個頁面。',
  'browser.error.certificate': '頁面憑證驗證唔到，已經安全擋住。',
  'browser.error.downloadBlocked':
    'App 內瀏覽器唔會儲存下載；要下載請喺外部開啟呢個頁面。',
  'browser.error.rendererGone':
    '呢個頁面意外停止咗。請重新整理，或者喺外部開啟。',
  'browser.error.tooManyTabs':
    'App 內瀏覽器最多只可以開 20 個分頁。請先關閉一個分頁再開新嘅。',
  'settings.integrationsExternalEditorTitle': '外部編輯器',
  'settings.integrationsExternalEditorSubtitle':
    '喺編輯器打開檔案或者 repository 時會用到',
  'settings.integrationsShellTitle': '命令列 Shell',
  'settings.integrationsShellSubtitle': '喺命令列打開 repository 時會用到',
  'settings.integrationsChooseEditor': '揀外部編輯器',
  'settings.integrationsChooseShell': '揀命令列 Shell',
  'settings.integrationsCustomEditorChoice': '設定自訂編輯器…',
  'settings.integrationsCustomShellChoice': '設定自訂命令列…',
  'settings.integrationsCustomEditorLabel': '自訂編輯器',
  'settings.integrationsCustomShellLabel': '自訂命令列',
  'settings.integrationsSelectEditor': '揀編輯器',
  'settings.tabsDockPosition': '設定分頁位置',
  'settings.tabsDockDescription':
    '揀呢條分頁列擺邊。設定同儲存庫設定會分開記住；冇記錄或者記錄唔啱就用左邊。',
  'settings.tabsDockLeft': '左邊',
  'settings.tabsDockTop': '頂部',
  'settings.tabsDockBottom': '底部',
  'settings.tabsDockRight': '右邊',
  'settings.contextMenuHeading': 'Windows 右鍵選單',
  'settings.contextMenuDescription':
    '喺檔案總管撳右鍵嗰陣，喺資料夾同資料夾空白位加返 Desktop Material 嘅動作。',
  'settings.contextMenuPlacementNote':
    'Windows 11 會將呢啲經典項目收埋喺「顯示更多選項」入面（或者撳 Shift+F10 直接開經典選單）。想擺上 Windows 11 第一層選單就要裝打包過嘅 shell extension，呢個版本冇裝。',
  'settings.contextMenuOpencodeLabel': '喺呢度開 OpenCode',
  'settings.contextMenuOpencodeDescription':
    '喺該資料夾開個終端機，即刻行 opencode CLI。',
  'settings.contextMenuDesktopMaterialLabel': '用 Desktop Material 打開',
  'settings.contextMenuDesktopMaterialDescription':
    '將個資料夾當 repository 打開；如果未喺清單度會順手加埋。',
  'settings.contextMenuOpencodeMissing':
    '喺呢部電腦搵唔到 opencode，所以加唔到呢個項目。',
  'settings.contextMenuAppPathUnknown':
    '搵唔到應用程式路徑，所以加唔到呢啲項目。',
  'settings.contextMenuNeedsRepair':
    '呢個項目存在，但同今次安裝對唔上。閂咗再開一次就會整返好。',
  'settings.contextMenuBusy': '更新緊右鍵選單…',
  'settings.contextMenuStateError': '讀唔到而家嘅右鍵選單狀態。',
  'settings.contextMenuApplyError': '更新唔到右鍵選單。',
  'settings.contextMenuModernLabel': '喺 Windows 11 主選單度出',
  'settings.contextMenuModernDescription':
    '註冊一個打包好嘅 shell extension，令啲動作直接喺右鍵選單第一層度出，唔使揿「顯示更多選項」。',
  'settings.contextMenuModeModern': '而家係：啲動作喺右鍵主選單度出。',
  'settings.contextMenuModeClassic': '而家係：啲動作喺「顯示更多選項」入面。',
  'settings.contextMenuModeNone': '而家冇裝任何右鍵選單動作。',
  'settings.contextMenuNeedsWindows11': '要 Windows 11 先可以擺上主選單。',
  'settings.contextMenuPackageMissing': '呢個版本冇打包個 shell extension。',
  'settings.contextMenuNeedsDeveloperMode':
    '要喺 Windows 設定 → 系統 → 開發人員專用 度開咗側載，先可以擺上主選單。Desktop Material 唔會幫你改呢個設定。',
  'settings.contextMenuRegistrationStale':
    '個註冊仲指住舊版本嗰個資料夾，所以 Windows 已經冇再顯示呢啲動作。撳返開一次，就會用返而家嘅安裝重新註冊。',
  'quickAction.loading': '讀緊個資料夾…',
  'quickAction.notARepository': '呢個資料夾唔係 Git repository。',
  'quickAction.noChanges': '冇改動可以 commit。',
  'quickAction.needSummary': '打個摘要先可以 commit。',
  'quickAction.detachedHead':
    '呢個 repository 而家唔喺任何 branch 上面。用完整版打開再搞。',
  'quickAction.busy': '做緊嘢…',
  'quickAction.changeCount': '有 {count} 個檔案改咗，可以 commit。',
  'quickAction.summaryLabel': '摘要',
  'quickAction.summaryPlaceholder': '講吓你改咗啲乜',
  'quickAction.commitAndPush': 'Commit 埋 push',
  'quickAction.openInFullApp': '用完整版打開',
  'quickAction.pushed': 'Commit 咗 {sha}，亦都 push 咗喇。',
  'quickAction.genericError': '有嘢出錯咗。',
  'push.ghCliFallbackSuccessTitle': '用咗 GitHub CLI 帳戶推送成功',
  'push.ghCliFallbackSuccessBody':
    '推送去 {remote} 一開始俾人拒絕，所以 Desktop Material 改用你嘅 GitHub CLI 登入再試一次，今次搞掂咗。',
  'clone.visibilityPublic': '公開',
  'clone.visibilityPrivate': '私人',
  'clone.visibilityAll': '全部',
  'clone.visibilityForked': 'Fork 咗',
  'clone.noDescription': '未有描述',
  'clone.starsLabel': '{count} 個 star',
  'clone.forksLabel': '{count} 個 fork',
  'clone.sizeLabel': '倉庫大細 {size}',
  'clone.defaultBranchLabel': '預設分支 {branch}',
  'clone.updatedLabel': '{time}更新',
  'clone.languageLabel': '語言：{language}',
  'clone.languageFilterLabel': '語言',
  'clone.languageFilterAria': '按語言篩選倉庫',
  'clone.visibilityFilterAria': '按公開狀態篩選倉庫',
  'clone.visibilityFilterLabel': '公開狀態',
  'clone.filters.button': '倉庫篩選器',
  'clone.filters.buttonActive': '倉庫篩選器 · {count}',
  'clone.filters.activeCount': '{count} 個使用中',
  'clone.filters.metadataAria': '倉庫資料篩選器',
  'clone.cheapLfs.badgeTitle': 'Cheap LFS 檔案',
  'clone.cheapLfs.badgeAriaOne':
    'Clone {repository} 時揀呢 1 個 Cheap LFS 檔案下唔下載',
  'clone.cheapLfs.badgeAriaMany':
    'Clone {repository} 時揀 {count} 個 Cheap LFS 檔案入面邊啲要下載',
  'clone.cheapLfs.selectorTitle': '揀 Cheap LFS 檔案',
  'clone.cheapLfs.selectorSummaryOne':
    '揀 {repository} 入面嗰個 Cheap LFS 檔案下唔下載；預設已經勾好。',
  'clone.cheapLfs.selectorSummaryMany':
    '揀 {repository} 入面邊啲 Cheap LFS 檔案要下載；{count} 個預設全部勾好。',
  'clone.cheapLfs.selectorSearchPlaceholder': '搜尋大檔案路徑',
  'clone.cheapLfs.selectorSearchAria': '搜尋 Cheap LFS 檔案',
  'clone.cheapLfs.selectorRegexTarget': 'Cheap LFS 檔案路徑',
  'clone.cheapLfs.selectorSelectedCount': '已揀 {selected} 個，共 {count} 個',
  'clone.cheapLfs.selectorSelectAll': '全部揀晒',
  'clone.cheapLfs.selectorSelectNone': '全部唔揀',
  'clone.cheapLfs.selectorNoMatches': '今次搜尋搵唔到相符嘅 Cheap LFS 檔案。',
  'clone.cheapLfs.selectorTreeAria': 'Cheap LFS 檔案',
  'clone.cheapLfs.selectorIncludeOne': '包括 {count} 個檔案',
  'clone.cheapLfs.selectorIncludeMany': '包括 {count} 個檔案',
  'clone.cheapLfs.selectorFileAria': '下載 Cheap LFS 時包括 {path}',
  'clone.cheapLfs.selectorFolderAria':
    '{path} 入面揀咗 {selected} 個檔案，共 {count} 個',
  'clone.cheapLfs.selectorCollapse': '收起 {path}',
  'clone.cheapLfs.selectorExpand': '展開 {path}',
  'clone.orgScopeMissing': '睇唔到任何組織，可能今次登入未攞到組織權限。',
  'clone.orgReconnect': '重新連接以載入組織',
  'clone.orgRestrictionNote':
    '有啲組織限制第三方存取，要批准咗呢個 app 先會喺度出現。',
  'clone.orgReviewAccess': '查看 OAuth app 存取權',
  'commandPalette.title': '命令面板',
  'commandPalette.searchPlaceholder': '搜尋指令',
  'commandPalette.searchLabel': '搜尋命令面板',
  'commandPalette.commands': '指令',
  'commandPalette.noMatches': '搵唔到配對指令',
  'commandPalette.searchTerms': '搜尋字詞：{terms}',
  'commandPalette.customizeAppearance': '自訂命令面板外觀',
  'commandPalette.appearanceDialog': '命令面板外觀設定',
  'commandPalette.appearanceHeading': '外觀',
  'commandPalette.randomPerRepository': '每個 repo 隨機外觀',
  'commandPalette.randomPerRepositoryDescription':
    '每個 repo 自己抽一款，重開都唔會再洗牌',
  'commandPalette.paletteSize': '指令板尺寸',
  'commandPalette.sizeCompact': '細張',
  'commandPalette.sizeCompactDescription': '細細張卡，淨係得清單，冇詳情欄',
  'commandPalette.sizeMedium': '標準',
  'commandPalette.sizeMediumDescription': '浮喺 app 上面嘅卡，連詳情欄',
  'commandPalette.sizeFull': '全螢幕',
  'commandPalette.sizeFullDescription': '成個 app 都畀佢冚晒',
  'repositorySettings.tabRemote': '遠端',
  'repositorySettings.tabIgnoredFiles': '忽略清單',
  'repositorySettings.tabGitConfig': 'Git 設定',
  'repositorySettings.tabBuildRun': '建置同執行',
  'repositorySettings.tabCheapLfs': '大檔案',
  'repositorySettings.tabSubmodules': '子模組',
  'repositorySettings.tabSubtrees': '子樹',
  'repositorySettings.tabAutomation': '自動化',
  'repositorySettings.tabMetadata': '中繼資料',
  'repositorySettings.tabAppearance': '外觀',
  'repositorySettings.tabAISecurity': 'AI 功能',
  'repositorySettings.tabForkSettings': 'Fork 設定',
  'repositorySettings.tabsLabel': '儲存庫設定頁面',
  'repositorySettings.dialogTitle': '儲存庫設定',
  'commandPalette.homeRepositorySettings': '儲存庫設定 ▸ {tab}',
  'palette.repositorySettingsRemote': '遠端設定',
  'palette.repositorySettingsIgnoredFiles': '忽略檔案',
  'palette.repositorySettingsGitConfig': '本 repo 嘅 Git 設定',
  'palette.repositorySettingsBuildRun': '建置同執行設定',
  'palette.repositorySettingsCheapLfs': '大檔案設定',
  'palette.repositorySettingsSubmodules': '子模組設定',
  'palette.repositorySettingsSubtrees': '子樹設定',
  'palette.repositorySettingsAutomation': '本 repo 嘅自動化覆寫',
  'palette.repositorySettingsMetadata': '儲存庫中繼資料',
  'palette.repositorySettingsAppearance': '儲存庫外觀',
  'palette.repositorySettingsForkSettings': 'Fork 行為',
  'palette.reportIssue': '報告問題',
  'palette.reportIssueDescription': '喺瀏覽器開返個 issue tracker',
  'palette.contactSupport': '聯絡支援',
  'palette.contactSupportDescription': '喺瀏覽器開返支援頁',
  'palette.userGuides': '睇使用指南',
  'palette.userGuidesDescription': '喺瀏覽器開返文件',
  'palette.keyboardShortcuts': '睇快捷鍵',
  'palette.keyboardShortcutsDescription': '喺瀏覽器開返快捷鍵一覽',
  'palette.showLogsFolder': '打開 log 資料夾',
  'palette.showLogsFolderDescription': '喺檔案總管度指返啲 log 檔喺邊',
  'commandPalette.homeMenuBar': '上面條選單列',
  'commandPalette.linkFailed': '開唔到 {url}，瀏覽器唔畀面',
  'palette.increaseActiveResizableWidth': '拉闊而家個窗格',
  'palette.decreaseActiveResizableWidth': '收窄而家個窗格',
  'palette.setThemeMode.light': '淺色',
  'palette.setThemeMode.dark': '深色',
  'palette.setThemeMode.system': '跟系統',
  'palette.setThemeMode': '主題',
  'palette.setUiScale': '介面縮放',
  'palette.setAutoFitZoom': '視窗細就自動縮細介面',
  'palette.setShowRecentRepositories': '顯示最近用過嘅 repo',
  'palette.setBranchNameInRepoList.always': '次次都show',
  'palette.setBranchNameInRepoList.notDefault': '唔係預設分支先show',
  'palette.setBranchNameInRepoList.never': '唔好show',
  'palette.setBranchNameInRepoList': 'Repo 列表度顯示分支名',
  'palette.setBranchSort.lastModified': '按最近改過',
  'palette.setBranchSort.alphabetical': '按字母',
  'palette.setBranchSort': '分支排序',
  'palette.setDateFormat': '日期格式',
  'palette.setTimeFormat': '時間格式',
  'palette.setNumberFormat': '數字格式',
  'palette.setPreferAbsoluteDates': '寧願睇實際日期，唔要相對',
  'palette.setAutoSwitchAccount': '自動轉去 repo 主人個帳戶',
  'palette.setRepositoryIndicators': 'Repo 列表度顯示狀態圖示',
  'palette.setUsageStats': '交使用統計',
  'palette.setVerboseLogging': '詳細 log（debug 級）',
  'palette.setLargeRepoAutoDetect': '自動偵測大 repo',
  'palette.setLargeRepoAutoRepack': '得閒就幫大 repo 重新打包',
  'palette.setBrowserOpenMode.internal': '喺 app 入面開',
  'palette.setBrowserOpenMode.external': '用你平時個瀏覽器',
  'palette.setBrowserOpenMode': '點開網頁連結',
  'palette.setConfirmDiscardPermanently': '永久丟變更前先問一問',
  'palette.setConfirmDiscardStash': '丟 stash 前先問一問',
  'palette.setConfirmCheckoutCommit': 'Checkout commit 前先問',
  'palette.setConfirmUndoCommit': '撤銷 commit 前先問一問',
  'palette.setConfirmCommitMessageOverride':
    '用生成嘅 commit 訊息蓋走原本前先問',
  'palette.setConfirmWorktreeRemoval': '移除 worktree 前先問一問',
  'palette.setConfirmCommitFilteredChanges': 'Commit 埋畀篩選收埋嘅變更前先問',
  'palette.setUncommittedChangesStrategy.askForConfirmation': '每次問返',
  'palette.setUncommittedChangesStrategy.moveToNewBranch': '搬去新分支',
  'palette.setUncommittedChangesStrategy.stashOnCurrentBranch':
    'stash 喺呢條分支',
  'palette.setUncommittedChangesStrategy': '有未 commit 變更去轉分支時',
  'palette.setDiffCheckMarks': 'Diff 度顯示剔號',
  'palette.setErrorPresentation.notice': '出個通知',
  'palette.setErrorPresentation.dialog': '彈個窗',
  'palette.setErrorPresentation': '程式錯誤點樣顯示',
  'palette.entryGitAuthorName': 'Git 作者名',
  'palette.entryGitAuthorEmail': 'Git 作者 email',
  'palette.setShowCommitIdentity': 'Commit 訊息上面顯示實際身分',
  'palette.entryDefaultBranchName': '新 repo 嘅預設分支名',
  'palette.setGitHookEnv': '由 shell 載入 Git hook 環境變數',
  'palette.setGitHookEnvShell': '用邊個 shell 載 hook 環境',
  'palette.setGitHookEnvCache': '快取 Git hook 環境變數',
  'palette.globalIgnore': '全域忽略規則',
  'palette.setExternalEditor': '外部編輯器',
  'palette.setShell': 'Shell 終端機',
  'palette.setContextMenuOpencode': '檔案總管右鍵：喺呢度用 OpenCode 開',
  'palette.setContextMenuDesktopMaterial':
    '檔案總管右鍵：用 Desktop Material 開',
  'palette.setContextMenuModern': '擺埋喺 Windows 11 主選單度',
  'palette.branchPresetScript': '分支名預設腳本',
  'palette.customIntegrations': '自訂編輯器同 shell 指令',
  'palette.setAgentServerEnabled': 'Agent 伺服器',
  'palette.agentAccessMode': 'Agent 存取模式',
  'palette.agentPairing': '配對手機',
  'palette.agentToken': '桌面 bearer token',
  'palette.setAutoCommitPush': '自動 commit 同 push',
  'palette.setAutoCommitPushInterval': 'Commit 同 push 嘅間隔',
  'palette.setAutoPull': '自動 pull',
  'palette.setAutoPullInterval': 'Pull 嘅間隔',
  'palette.automationAccountOverrides': '自動化覆寫（逐個帳戶）',
  'palette.queueCloneSettings': 'Clone 佇列設定（逐個帳戶）',
  'palette.setSoundEnabled': '聲音',
  'palette.setSoundEffects': '播音效',
  'palette.setSoundEffectVolume': '音效音量',
  'palette.setSoundNarrator': '語音旁白',
  'palette.setSoundRecordedNarration': '用錄好嘅旁白',
  'palette.setSoundNarratorVolume': '旁白音量',
  'palette.setSoundNarratorVoice': '旁白把聲',
  'settings.soundNarratorVoiceTitle': '旁白把聲',
  'settings.soundNarratorVoiceDescription':
    '揀邊把聲讀英文、邊把聲讀廣東話，唔揀就由個 app 幫你搵最啱嗰把。',
  'settings.soundNarratorEnglishVoiceLabel': '英文旁白把聲',
  'settings.soundNarratorCantoneseVoiceLabel': '廣東話旁白把聲',
  'settings.soundNarratorChooseAutomatically': '由個 app 自己揀',
  'settings.soundNarratorNetworkVoiceOption': '網絡聲音',
  'settings.soundNarratorVoiceMissingOption':
    '{uri} — 呢部電腦冇裝呢把聲',
  'settings.soundNarratorVoiceAutomaticStatus':
    '由個 app 自己揀：用呢部電腦最啱讀而家語言嗰把聲。',
  'settings.soundNarratorVoiceInstalledStatus':
    '{voice}（{lang}），已經裝喺呢部電腦。',
  'settings.soundNarratorVoiceNetworkStatus':
    '{voice}（{lang}）。呢把聲由網絡提供，冇網絡就唔會出聲。',
  'settings.soundNarratorVoiceMissingStatus':
    '之前揀嗰把聲（{uri}）而家冇裝喺呢部電腦，所以旁白會暫時用最接近嗰把聲。你揀過嘅選擇會保留，等佢返嚟。',
  'settings.soundNarratorVoiceNoneStatus':
    '呢部電腦冇裝任何可以讀呢種語言嘅聲音。加返一把之前，旁白會保持靜音。',
  'settings.soundNarratorRateLabel': '講嘢速度',
  'settings.soundNarratorPitchLabel': '聲線音高',
  'settings.personalVocabularyTitle': '個人字典檔案',
  'settings.personalVocabularyDescription':
    '載入一個本機 JSON 檔，換走呢個 app 顯示嘅字眼。 唔會上載去任何地方。',
  'palette.setPersonalVocabulary': '個人字典檔案',
  'palette.setSoundNarratorCooldown': '兩句旁白之間最短間隔',
  'palette.setSoundMusic': '播主題音樂',
  'palette.setSoundMusicVolume': '音樂音量',
  'palette.setSoundQuietHours': '安靜時段熄晒聲',
  'palette.setSoundQuietHoursStart': '安靜時段幾點開始',
  'palette.setSoundQuietHoursEnd': '安靜時段幾點收工',
  'palette.setSoundReducedMotion': '聲音跟隨減少動態設定',
  'palette.repositoryMusicTrack': '呢個 repo 用邊首歌',
  'palette.auditionSoundCues': '試聽啲音效提示',
  'palette.copilotCommitModel': 'Copilot commit 訊息模型',
  'palette.copilotConflictModel': 'Copilot 解衝突嘅模型',
  'palette.setCopilotAlwaysResolveConflicts': '一撞到衝突就次次用 Copilot',
  'palette.addAiProvider': '加個 AI 供應商（自備 key）',
  'palette.entryOllamaEndpoint': 'Ollama 端點',
  'palette.sshWorkingCopy': 'SSH 工作副本',
  'palette.setBuildAutoInstall': '自動裝返欠咗嘅建置工具',
  'palette.setBuildPreElevate': '建置前先攞埋管理員權限',
  'palette.setBuildRunAfterBuild': '建置成功就即刻行',
  'palette.setBuildAutoIgnoreOutputs': '自動忽略建置輸出',
  'palette.setBuildAfterPull': 'Pull 到新 commit 就建置',
  'palette.setBuildOfferAgents': '建置出錯就問用唔用 Codex/OpenCode 執',
  'palette.setBuildFixProvider.codex': 'Codex',
  'palette.setBuildFixProvider.opencode': 'OpenCode',
  'palette.setBuildFixProvider': '執建置錯首選邊個供應商',
  'palette.setBuildFixAutoApprove': '呢個 repo 自動批准執錯 agent',
  'palette.setCheapLfsAutoMaterialize': 'Clone 完自動落大檔案',
  'palette.setCheapLfsAutoPin': 'Commit 時釘住大檔案',
  'palette.setCheapLfsCloneHelper': '連埋 clone 輔助腳本',
  'palette.setCheapLfsParallelUploads': '同時上載幾多個 Cheap LFS',
  'palette.setCheapLfsStorageProvider.release': 'GitHub releases',
  'palette.setCheapLfsStorageProvider.ghcr': 'GitHub container registry',
  'palette.setCheapLfsStorageProvider.dockerhub': 'Docker Hub',
  'palette.setCheapLfsStorageProvider': '大檔案儲存供應商',
  'palette.setCheapLfsCloudCompression': '呢個私人 repo 用雲端壓縮',
  'palette.cheapLfsEncryption': '新 Release 檔用密碼加密',
  'palette.setSigningCommits': '預設簽署 commit',
  'palette.setSigningTags': '預設簽署註解標籤',
  'palette.signingPolicy': '管理簽署政策',
  'palette.setDiffAutoExpandContext': '自動展開成個檔嘅上下文',
  'palette.setDiffContextStep': '上下文一次展開幾多',
  'palette.appearance': '自訂命令面板',
  'palette.setPaletteDensity': '命令面板列距',
  'palette.setPaletteRandomPerRepository': '每個 repo 面板外觀隨機',
  'palette.setPaletteShowIcons': '面板列顯示圖示',
  'palette.setPaletteShowGroupChips': '面板列顯示群組標籤',
  'palette.setPaletteShowKeywords': '面板列顯示關鍵字列',
  'palette.newTabGroup': '開個新分頁群組',
  'palette.editTabGroup': '改而家個分頁群組',
  'palette.closeTabsContaining': '閂咗含住嗰段字嘅分頁',
  'palette.closeTabsNotContaining': '閂咗冇嗰段字嘅分頁',
  'palette.pinTab': '釘住而家個分頁',
  'palette.unpinTab': '解返而家個分頁嘅釘',
  'palette.editTabAppearance': '改而家個分頁嘅外觀',
  'palette.searchTabs': '搵開咗嘅分頁',
  'palette.editAppAppearance': '改 app 外觀',
  'palette.editAppIdentity': '改 app 個名同 logo',
  'palette.editToolbarAppearance': '改工具列外觀',
  'palette.editRepositoryListAppearance': '改 repo 列表外觀',
  'palette.editRepositoryTabsAppearance': '改 repo 分頁外觀',
  'palette.editRepositoryLogo': '改 repo 個 logo',
  'palette.manageRepositoryGroups': '管理 repo 群組',
  'palette.repositoryAccount': 'Repo 帳戶',
  'palette.regexBuilder': '打開 regex 砌法器',
  'palette.closeTab': '閂咗依個 tab',
  'palette.closeOtherTabs': '閂晒其他 tab',
  'palette.closeTabsToLeft': '閂晒左邊嘅 tab',
  'palette.closeTabsToRight': '閂晒右邊嘅 tab',
  'palette.favoriteTab': '收藏依個 tab',
  'palette.renameTab': '改依個 tab 個名',
  'palette.moveTabToGroup': '搬依個 tab 去個 group',
  'palette.collapseTabGroup': '收埋依個 tab group',
  'palette.deleteTabGroup': '刪除依個 tab group',
  'palette.sortTabsLabelAscending': 'Tab 由 A 排到 Z',
  'palette.sortTabsLabelDescending': 'Tab 由 Z 排到 A',
  'palette.sortTabsOpenedNewest': 'Tab 新開嘅排前面',
  'palette.sortTabsOpenedOldest': 'Tab 舊開嘅排前面',
  'palette.sortTabsStatusAttentionFirst': 'Tab 照狀態排，要留意嘅排前面',
  'palette.sortTabsStatusCleanFirst': 'Tab 照狀態排，乾淨嘅排前面',
  'palette.sortTabsFavoriteFirst': 'Tab 收藏咗嘅排前面',
  'palette.sortTabsFavoriteLast': 'Tab 收藏咗嘅排後面',
  'palette.undoSettingsChange': '復原上一次設定改動',
  'palette.redoSettingsChange': '重做上一次設定改動',
  'palette.signInDotcom': '登入 GitHub.com',
  'palette.signInEnterprise': '登入 GitHub Enterprise',
  'palette.md3.changes': '去「改動」',
  'palette.md3.history': '去「歷史」',
  'palette.md3.branches': '去「分支」',
  'palette.md3.actions': '去「Actions」',
  'palette.md3.inbox': '去「收件匣」',
  'palette.md3.terminal': '去「終端機」',
  'palette.md3.agents': '去「Agent」',
  'palette.md3.repositories': '去「儲存庫」',
  'palette.md3.focusSearch': '跳去上面個全域搜尋格',
  'palette.md3.searchRegex': '全域搜尋當正則表達式睇',
  'palette.md3.searchRegexDescription':
    '淨係開上面個搜尋格嘅正則模式。其他搜尋格各有各嘅模式，唔會跟住變。',
  'palette.md3.searchBuilder': '幫全域搜尋砌個 pattern',
  'palette.md3.searchMenu': '開搜尋選單',
  'palette.md3.regexGuide': '開正則表達式指南',
  'palette.md3.compose': '開 commit 撰寫視窗',
  'palette.md3.drawer': '攤開左邊個導覽抽屜',
  'palette.md3.drawerDescription':
    '開咗就見到每個目的地嘅名；閂咗就收窄成一行圖示，但每個目的地照樣搵得返。',
  'palette.md3.drawerMenu': '開導覽抽屜嘅選單',
  'palette.md3.repositoryMenu': '開儲存庫選單',
  'palette.md3.branchMenu': '開分支選單',
  'palette.md3.paneMenu': '開版面選單',
  'palette.md3.commitSort': 'Commit 排序',
  'palette.md3.commitSortDescription':
    '個 commit 清單邊個行先。History 選單會用而家嘅值做提示。',
  'palette.md3.commitSortNewest': '新嘅行先',
  'palette.md3.commitSortOldest': '舊嘅行先',
  'palette.md3.groupCommitsByDay': '按日子分組 commit',
  'palette.md3.groupCommitsByDayDescription':
    '每日加個日期標題，唔使成條長清單掃到眼花。',
  'palette.md3.commitGraph': '顯示 commit 圖',
  'palette.md3.commitGraphDescription': '喺 commit 清單隔籬畫返條血緣線。',
  'palette.md3.wrapLongLines': '長嘅 diff 行自動換行',
  'palette.md3.wrapLongLinesDescription':
    '太長嘅行摺落下一行，唔使成份 diff 向左右拉。',
  'palette.md3.diffContextLines': 'Diff 上下文行數',
  'palette.md3.diffContextLinesDescription':
    '每段改動前後顯示幾多行冇改過嘅嘢，1 到 20。',
  'palette.md3.groupChangesByFolder': '按資料夾分組改動',
  'palette.md3.groupChangesByFolderDescription':
    '啲改咗嘅檔案按資料夾疊埋，唔係一條條平鋪路徑。',
  'commandPalette.homeMd3Drawer': '導覽抽屜',
  'commandPalette.homeMd3Header': '應用程式頂欄',
  'commandPalette.homeMd3PaneHeader': '版面頂欄',
  'commandPalette.homeRepositoryTools': '儲存庫工具',
  'commandPalette.homePalette': '指令板本身',
  'commandPalette.homeTabStrip': '上面條 repo 分頁',
  'commandPalette.homeWorkspace': '工作區',
  'commandPalette.homeRepositoryAppearance': '儲存庫設定 ▸ 外觀',
  'commandPalette.rowDensity': '列距',
  'commandPalette.comfortable': '舒適',
  'commandPalette.comfortableDescription': '闊落啲，資料睇得齊啲',
  'commandPalette.compact': '精簡',
  'commandPalette.compactDescription': '慳位啲，一次睇多幾個指令',
  'commandPalette.showInEachRow': '每列顯示',
  'commandPalette.icons': '圖示',
  'commandPalette.groupChips': '群組標籤',
  'commandPalette.keywordLine': '關鍵字列',
  'commandPalette.resetDefaults': '還原預設',
  'commandPalette.groupApp': '應用程式',
  'commandPalette.groupBranch': '分支',
  'commandPalette.groupChanges': '變更',
  'commandPalette.groupEdit': '編輯',
  'commandPalette.groupNavigate': '導覽',
  'commandPalette.groupRepository': '倉庫',
  'palette.selectAll': '全部揀晒',
  'palette.toggleTheme': '深色主題',
  'palette.preferencesAccounts': '設定：帳戶',
  'palette.preferencesAppearance': '設定：外觀',
  'palette.preferencesIntegrations': '設定：整合',
  'palette.preferencesAutomation': '設定：自動化',
  'palette.preferencesAdvanced': '設定：進階',
  'palette.preferencesNotifications': '設定：通知',
  'palette.preferencesGit': '設定：Git',
  'palette.preferencesAccessibility': '設定：無障礙',
  'palette.ollamaModelManager': 'Ollama 模型管理員',
  'palette.ollamaChat': 'Ollama 對話',
  'palette.preferencesCopilot': '設定：Copilot 同 AI 供應商',
  'palette.preferencesSound': '設定：聲音',
  'palette.backgroundQueue': '背景操作同 API 佇列',
  'palette.buildAndRun': '構建同執行',
  'palette.cheapLfsSettings': '大型檔案（Cheap LFS）設定',
  'palette.repositoryAutomation': '自動化覆寫（呢個存放庫）',
  'palette.tagLifecycle': '標籤生命週期管理員',
  'palette.githubApiExplorer': 'GitHub API 瀏覽器',
  'palette.notificationCentre': '打開通知中心',
  'palette.notificationHistory': '通知版本歷史（復原、重做、還原）',
  'palette.notificationAutomations': '通知自動化',
  'palette.copyRepoPath': '複製倉庫路徑',
  'palette.copyBranchName': '複製而家分支個名',
  'palette.copyCommitSha': '複製而家 commit SHA',
  'palette.resolveConflictsAgent': '用 Codex/OpenCode 執衝突',
  'palette.fixCiAgent': '用 Codex/OpenCode 執 CI',
  'palette.hideBackgroundProgress': '收埋背景進度',
  'palette.showBackgroundProgress': '顯示背景進度',
  'palette.toggleCheapLfsProgress': '展開／收埋 Cheap LFS 還原進度',
  'commandPalette.homeDialog': '按咗就彈對話框',
  'commandPalette.homeNotificationCentre': '通知中心',
  'commandPalette.homeToolbar': '工具列',
  'commandPalette.homeSidebar': '倉庫側邊欄',
  'commandPalette.homeChangesView': '變更畫面',
  'commandPalette.homeCommitBox': 'Commit 輸入框',
  'commandPalette.homeRepositoryList': '倉庫列表',
  'commandPalette.homeSettings': '設定 › {tab}',
  'commandPalette.whereItLives': '住喺邊度',
  'commandPalette.goThere': '帶我去',
  'commandPalette.runCommand': '執行',
  'commandPalette.applyValue': '套用',
  'commandPalette.close': '關掉命令面板',
  'commandPalette.detailEmpty': '挹一個命令，就知佢做咗嘅，以及住喺邊度。',
  'commandPalette.valueOn': '開咗',
  'commandPalette.valueOff': '關咗',
  'commandPalette.matchCount': '{total} 個命令中嘅 {count} 個',
  'commandPalette.hintMove': '移動',
  'commandPalette.hintGo': '帶我去',
  'commandPalette.hintRun': '執行',
  'commandPalette.hintClose': '關掉',
  'commandPalette.rangeHint': '{min}–{max}',
  'commandPalette.currentValue': '現在：{value}',
  'commandPalette.detailsRegion': '命令詳情',
  'commandPalette.controlsColumn': '設定',
  'commandPalette.settingRow': '設定，喺呢度就改到',
  'commandPalette.actionRow': '動作',
  'commandPalette.teleportMissing':
    '{place} 而家唔喺畫面度，所以沒高亮到任何東西。',
  'palette.toggleThemeDescription': '整個 app 喺淺色跟深色主題之間彈來彈去。',
  'palette.languageMode': '語言模式',
  'palette.languageModeDescription': '英文、香港廣東話，或者兩樣一齊來。',
  'palette.funnyEnglish': '搞笑程度（英文）',
  'palette.funnyCantonese': '搞笑程度（廣東話）',
  'palette.funnyLevelDescription':
    '1 是完全正經，5 是夠靈夠搞笑。佢只改語氣；發生咗嘅、要做嘅永遠講得一樣清楚。',
  'palette.tabSize': 'Diff Tab 寬度',
  'palette.tabSizeDescription': '喺 diff 度一個 Tab 佔幾多個字位。',
  'palette.highlightFeatures': '高亮 Desktop Material 功能',
  'palette.highlightFeaturesDescription':
    '把 Desktop Material 額外加嘅入口標出來，一眼分到。',
  'palette.confirmDiscard': '丟掉變更前先問一問',
  'palette.confirmDiscardDescription': '關咗就即刻丟，沒對話框也沒後悔藥。',
  'palette.confirmForcePush': '強行 push 前先問一問',
  'palette.confirmForcePushDescription':
    '關咗就即刻強行 push，直接覆寫遠端分支，一個對話框都沒有。',
  'palette.confirmRepositoryRemoval': '移除倉庫前先問一問',
  'palette.confirmRepositoryRemovalDescription':
    '移除只係喺 app 度拿走，硬碟嘅檔案仍然喺度。',
  'palette.commitLengthWarning': 'Commit 標題太長就提醒',
  'palette.commitLengthWarningDescription': 'Commit 標題長過建議寬度就彈提醒。',
  'palette.notificationsEnabled': '桌面通知',
  'palette.notificationsEnabledDescription':
    'Push 完、檢查完、有人 review，系統通知話你知。',
  'palette.underlineLinks': '連結加底線',
  'palette.underlineLinksDescription': '每條連結都加底線，唔使靠顏色先認得出。',
  'palette.externalCredentialHelper': '用外部憑證助理',
  'palette.externalCredentialHelperDescription':
    '用系統嘅憑證助理走 Git 驗證，唔用 app 自己嘅儲存。',
  'palette.windowsOpenSSH': '用 Windows OpenSSH',
  'palette.windowsOpenSSHDescription':
    'SSH 遠端走 Windows 自帶嘅 OpenSSH client。',
  'palette.sideBySideDiff': '左右對照 diff',
  'palette.sideBySideDiffDescription': '刪嘅跟加嘅分兩欄看，唔係疊埋一欄。',
  'palette.hideWhitespaceChanges': '變更 diff 唔理空白',
  'palette.hideWhitespaceChangesDescription':
    '看未 commit 嘅變更時，只改咗空白嘅行唔算。',
  'palette.commitSummary': 'Commit 標題',
  'palette.commitSummaryDescription': '唔使離開面板，直接打入 commit 框度。',
  'palette.commitSummaryPlaceholder': '標題（必填）',
  'palette.cloneUrl': '用 URL clone',
  'palette.cloneUrlDescription': '开 clone 對話框，URL 已經填好。',
  'palette.cloneUrlPlaceholder': 'https://github.com/owner/repository',
  'palette.preferencesPrompts': '設定：提醒跟確認',
  'palette.preferencesAgentAccess': '設定：Agent 存取',
  'buildRun.closeDisabledRunning': '而家有任務行緊，要先停咗佢先可以閂呢個面板',
  'buildRun.fixingWithOpencode': 'OpenCode 修緊…',
  'buildRun.stopConfirmTitle': '要停咗行緊嘅任務？',
  'buildRun.stopConfirmBody':
    '行緊嘅 build 同 OpenCode 嘅工作都會即刻終止，停咗就無得返轉頭。',
  'buildRun.stopConfirmConfirm': '停止',
  'buildRun.stopConfirmCancel': '唔好',
  'buildRun.scrollToBottom': '碌到最底',
  'buildRun.autoScroll': '自動碌去最新輸出',
  'buildRun.truncateOutput': '截短太長嘅輸出行',
  'buildRun.backgroundProgress': '背景操作進度',
  'buildRun.backgroundWorking': '背景做緊嘢',
  'buildRun.hideRunningPanel': '收埋面板；個操作會繼續喺背景做，唔會扮失蹤',
  'buildRun.elapsed': '行咗 {elapsed}',
  'buildRun.estimatedFinish': '估計 {time} 完成',
  'buildRun.estimatedFinishUnknown': '量度到先會顯示估計完成時間',
  'conflicts.resolveWithAgent': '用 Codex/OpenCode 執衝突',
  'actions.fixCiWithAgent': '用 Codex/OpenCode 執 CI',
  'actions.elapsed.run': '行咗 {duration}',
  'actions.elapsed.pending': '已用時間：等緊開跑',
  'actions.elapsed.unavailable': '已用時間：暫時量唔到',
  'actions.elapsed.workflowCompleted': '上次行咗 {duration}',
  'actions.elapsed.workflowRunning': '今次行咗 {duration}',
  'actions.elapsed.workflowPending': '最新一次：等緊開跑',
  'actions.elapsed.workflowUnavailable': '最新一次暫時量唔到時間',
  'actions.elapsed.workflowNone': '未載入到執行時間',
  'githubReleaseTransfer.stalled':
    'Release 資產上載停止咗網絡進度。請重試，或者使用手動上載。',
  'githubReleaseTransfer.cliUnavailable':
    '搵唔到 GitHub CLI，所以未能用已驗證嘅方式上載 Release 資產。請安裝 GitHub CLI 再試，或者使用手動上載。',
  'githubReleaseTransfer.cliFailed':
    'GitHub CLI 安全重試兩次之後，仍然未能完成 Release 資產上載。請再試一次，或者使用手動上載。',
  'githubReleaseTransfer.incompleteAsset':
    '呢個 Release 有一個同名但未完成嘅資產。請去 Releases，喺顯示「處理中」嘅資產撳「刪除」，跟住再試。',
  'buildRun.sendToOpencode': '傳去 opencode',
  'buildRun.sendIntro':
    'opencode 係個 AI 寫程式助手。你打低想做乜，佢就會喺呢個 repo 度做，全部喺你部機度行。',
  'buildRun.sendPromptLabel': '想 opencode 做啲乜？',
  'buildRun.sendPromptPlaceholder': '講低你想 opencode 喺呢個 repo 度做啲乜…',
  'buildRun.sendEmptyError': '傳去 opencode 之前，要先打低你嘅要求。',
  'buildRun.sendSubmit': '傳去 opencode',
  'buildRun.sendAutoApproveLabel': '呢次自動批准 opencode 改嘢同行指令（yolo）',
  'buildRun.sendAutoApproveWarning':
    'opencode 會喺呢個 repo 度改檔案同行 shell 指令，唔會問過你。佢淨係鎖死喺呢個 repo，掂唔到出面嘅檔案。',
  'buildRun.sendAutoApproveNote':
    'opencode 改檔案或者行指令之前會問你。撳上面嗰個自動批准，佢就可以喺呢個 repo 度自己搞掂。',
  'buildRun.sendRunningTitle': 'opencode 幫緊你搞緊個要求…',
  'buildRun.providerLabel': 'AI 寫程式助手',
  'buildRun.fixingWithProvider': '{provider} 執緊個 build…',
  'buildRun.fixWithProvider': '用 {provider} 修正',
  'buildRun.sendToProvider': '傳去 {provider}',
  'buildRun.fixIntroProvider':
    '{provider} 係本機 AI 寫程式助手。佢只會收到有限長度嘅 build 失敗資料，然後喺你部機度試修正呢個 repo。',
  'buildRun.sendIntroProvider':
    '{provider} 係本機 AI 寫程式助手。打低有限長度嘅要求，佢就會喺你部機同呢個 repo 度做。',
  'buildRun.checkingCli': '搵緊 {cli} CLI…',
  'buildRun.detectFailedProvider': '呢部機搵唔到 {provider}。',
  'buildRun.notInstalledCli': '未裝 {cli} CLI。你可以確認後用以下指令安裝：',
  'buildRun.installingCli': '裝緊 {cli} CLI…',
  'buildRun.authMissingProvider':
    '{provider} 已經裝好，但未登入，所以暫時未行得。',
  'buildRun.authCommandGuidance':
    '請開 terminal 行 {command}，之後再檢查。Desktop Material 唔會叫你喺呢度貼出或儲存秘密資料。',
  'buildRun.promptLabelProvider': '想 {provider} 做啲乜？',
  'buildRun.promptPlaceholderProvider':
    '講低想 {provider} 喺呢個 repo 度做啲乜…',
  'buildRun.autoApproveProvider': '呢次自動批准 {provider} 改檔案同行指令',
  'buildRun.autoApproveWarningProvider':
    '{provider} 可以唔停低問你就喺呢度改檔案同行指令。Codex 仍然受 workspace-write sandbox 限制；OpenCode 仍然受 repo 權限設定限制。',
  'buildRun.codexAutoApproveTrustWarning':
    '呢度 Codex 固定用 workspace-write、唔會套用 execution rules，亦會關閉 lifecycle hooks。不過受信任 repo 嘅 MCP 設定仍然係 Codex 嘅 user trust boundary；畀佢自動批准自己做之前，請先睇清楚 .codex/config.toml。',
  'buildRun.approvalOnRequestProvider':
    '{provider} 會按需要要求批准。呢個背景工作遇到要批准嘅動作時，可能會停低而唔係照做。',
  'buildRun.diagnosingProvider': '{provider} 搵緊問題兼修緊個 build…',
  'buildRun.verifyingProvider':
    '{provider} 做完喇。依家重新行 Build & Run 驗證，唔會淨係信 AI 個結束狀態…',
  'buildRun.workingProvider': '{provider} 幫緊你搞個要求…',
  'buildRun.preferredProvider': '預設 build 修正助手',
  'buildRun.offerAgents': 'Build 出錯時提供 OpenCode 或 Codex 修正',
  'buildRun.autoApproveRepositoryProvider': '喺呢個 repo 自動批准 {provider}',
  'buildRun.installCliAction': '安裝 {cli}',
  'buildRun.runCliAction': '執行 {cli}',
  'buildRun.runCliAgainAction': '再執行 {cli}',
  'buildRun.offerAgentsHelp':
    'Build 出錯時，可以畀 OpenCode 或 Codex 搵問題兼修正。你揀好助手、再喺啟動視窗批准之前，乜都唔會自動行。',
  'buildRun.autoApproveRepositoryHelp':
    '{provider} 會用自動批准模式，喺呢個 repo 改檔案同行指令，唔會中途停低。Codex 仍然受 workspace-write sandbox 限制；OpenCode 仍然受 repo 權限設定限制。除非你信任個助手可以自己做，否則請保持關閉。',
  'buildRun.codexInstallSafety':
    '會用 npm 全域安裝 OpenAI 官方嘅 @openai/codex 套件。Desktop Material 唔會問你攞、亦唔會儲存 OpenAI 登入資料。',
  'buildRun.opencodeInstallSafety':
    '會用 OpenCode 官方 npm 套件安裝 OpenCode。Desktop Material 唔會問你攞、亦唔會儲存 OpenCode 登入資料。',
  'buildRun.title': '構建同執行',
  'buildRun.stop': '停止',
  'buildRun.phase.detecting': '偵測緊',
  'buildRun.phase.preparing': '準備緊',
  'buildRun.phase.installing': '安裝緊',
  'buildRun.phase.building': '構建緊',
  'buildRun.phase.running': '執行緊',
  'buildRun.phase.succeeded': '成功',
  'buildRun.phase.failed': '失敗',
  'buildRun.phase.cancelled': '已取消',
  'buildRun.phase.idle': '閒置',
  'buildRun.pill.stopRunningTooltip': '停止執行緊嘅 app',
  'buildRun.pill.cancelBuildTooltip': '取消構建',
  'buildRun.pill.failedTitle': '構建失敗',
  'buildRun.pill.failedTooltip': '構建失敗 — 撳一下再試',
  'buildRun.pill.idleTooltip': '構建同執行呢個 repo（{profile}）',
  'buildRun.pill.chooseProfile': '揀專案同構建設定檔',
  'buildRun.closePanel': '關閉面板',
  'buildRun.restorePanel': '還原面板',
  'buildRun.minimizePanel': '縮到最細',
  'buildRun.copyAll': '複製全部輸出',
  'buildRun.clearOutput': '清除輸出',
  'buildRun.notify.succeededTitle': '構建成功',
  'buildRun.notify.succeededBody': '構建 {repository} 順利完成。',
  'buildRun.notify.failedTitle': '構建失敗',
  'buildRun.notify.failedBody': '構建 {repository} 失敗，結束代碼 {code}。',
  'actionsLocalRun.commandTitle': '喺本機行 Actions',
  'actionsLocalRun.dialogTitle': '喺本機行 GitHub Actions',
  'actionsLocalRun.subtitle':
    '揀個 workflow 同事件，就可以用 act 加 Docker 喺你部機度行。',
  'actionsLocalRun.checkingTools': '檢查緊有冇 act 同 Docker⋯',
  'actionsLocalRun.toolsMissingTitle': '本機執行工具唔齊',
  'actionsLocalRun.actMissing':
    '喺你嘅 PATH 搵唔到 act（nektos/act），佢係負責喺本機行 workflow 嘅。',
  'actionsLocalRun.actInstalling':
    '而家幫緊你裝 act（nektos/act）。佢負責喺本機行 workflow，只會落喺 app 自己個資料夾度，唔會裝入成部電腦。',
  'actionsLocalRun.actInstallingAutomatically':
    '你部機仲未裝 act（nektos/act）。佢負責喺本機行 workflow，app 而家幫你搏緊落載。',
  'actionsLocalRun.actInstallFailed':
    '自動裝 act 失敗咗。你自己裝一次，app 就會喺 PATH 揾到佢。',
  'actionsLocalRun.dockerMissing':
    '喺你嘅 PATH 搵唔到 Docker。act 要有個行緊嘅 Docker engine 先可以執行啲 job。',
  'actionsLocalRun.installHint':
    '裝好欠咗嘅工具，確認佢哋喺 PATH 上面，然後再檢查多次。',
  'actionsLocalRun.installActLink': '點裝 act',
  'actionsLocalRun.installDockerLink': '攞 Docker',
  'actionsLocalRun.retryDetection': '再檢查',
  'actionsLocalRun.noWorkflows':
    '呢個 repo 嘅 .github/workflows 度搵唔到任何 workflow 檔。',
  'actionsLocalRun.workflowLabel': 'Workflow',
  'actionsLocalRun.eventLabel': '事件',
  'actionsLocalRun.jobLabel': 'Job',
  'actionsLocalRun.allJobs': '全部 job',
  'actionsLocalRun.parseErrorPrefix': '呢個 workflow 未能完全解析：',
  'actionsLocalRun.inputsHeading': 'Workflow 輸入',
  'actionsLocalRun.inputRequired': '必填',
  'actionsLocalRun.secretsHeading': 'Secrets',
  'actionsLocalRun.secretsHint':
    'Secrets 只會為呢次執行寫入一個暫存檔，行完即刻刪走，亦唔會寫落 log。',
  'actionsLocalRun.addSecret': '加 secret',
  'actionsLocalRun.secretNamePlaceholder': 'SECRET_NAME',
  'actionsLocalRun.secretValuePlaceholder': '數值',
  'actionsLocalRun.removeSecret': '刪走 secret',
  'actionsLocalRun.dryRunLabel': '試行（只列步驟，唔真正執行）',
  'actionsLocalRun.dryRunHelp':
    '會用 -n 行 act，等你可以預覽個計劃而唔使開任何 container。',
  'actionsLocalRun.runButton': '行 workflow',
  'actionsLocalRun.dryRunButton': '試行',
  'actionsLocalRun.stopButton': '停',
  'actionsLocalRun.stoppingButton': '停緊⋯',
  'actionsLocalRun.closeButton': '閂',
  'actionsLocalRun.clearLog': '清走輸出',
  'actionsLocalRun.logRegionLabel': '本機 Actions 執行輸出',
  'actionsLocalRun.statusStarting': '起動緊⋯',
  'actionsLocalRun.statusRunning': '行緊⋯',
  'actionsLocalRun.statusSucceeded': '執行成功',
  'actionsLocalRun.statusFailed': '執行失敗',
  'actionsLocalRun.statusCancelled': '執行已取消',
  'actionsLocalRun.releaseUploadHeading': '偵測到 release 上載',
  'actionsLocalRun.releaseUploadNote':
    '呢個 workflow 有一步會上載 release 資產。本機執行唔會郁到你真正嘅 GitHub release。',
  'actionsLocalRun.releaseUploadWarning':
    '如果要將整出嚟嘅 artifact 上載去真正 release，請喺執行後用有防護嘅 release 上載——佢每次公開之前都會問你確認。',
  'actionsLocalRun.filterPlaceholder': '篩走冇關嘅輸出',
  'actionsLocalRun.filterLabel': '篩選執行輸出',
  'actionsLocalRun.filterRegexTarget': '執行輸出',
  'actionsLocalRun.filterStatusCount': '{total} 行揀到 {matched} 行',
  'actionsLocalRun.filterStatusNone': '冇一行啱',
  'batchClone.filterPlaceholder': '篩選 clone 佇列',
  'batchClone.filterLabel': '篩選 clone 佇列',
  'batchClone.filterRegexTarget': 'Clone 佇列',
  'batchClone.filterStatusCount': '{total} 個 repo 揀到 {matched} 個',
  'batchClone.filterStatusNone': '冇 repo 啱',
  'repositoryTransfer.cheapLfsNote':
    '每次 clone 完，Cheap LFS 會按 repo 個「clone 後下載大檔案」設定（預設開啟）還原大檔。分享清單只帶 URL，所以帳戶綁定同逐檔揀選留喺本機；如果關咗還原，或者冇合資格嘅 provider 帳戶，大檔會留低 pointer，之後再還原都得。',
  'branchRules.filterPlaceholder': '篩選結果',
  'branchRules.filterLabel': '篩選分支規則結果',
  'branchRules.filterRegexTarget': '分支規則結果',
  'branchRules.filterStatusCount': '{total} 項揀到 {matched} 項',
  'branchRules.filterStatusNone': '冇結果啱',
  'branchRules.filterNoMatchesInList': '呢個清單冇數值啱',
  'cheapLfs.files.one': '{count} 個大檔案',
  'cheapLfs.files.many': '{count} 個大檔案',
  'cheapLfs.workingTree.menu.one': '將揀咗嘅檔案存入 cheap LFS…',
  'cheapLfs.workingTree.menu.many': '將揀咗嘅 {count} 個檔案存入 cheap LFS…',
  'cheapLfs.workingTree.menu.wholeFileRequired':
    '存入 cheap LFS（要揀成個檔案）',
  'cheapLfs.workingTree.title': '將檔案存入 Cheap LFS？',
  'cheapLfs.workingTree.reviewBody':
    '揀咗嘅工作目錄檔案會上載去已設定嘅 Cheap LFS 儲存位置，然後喺本機換成細小 pointer。咁樣可以避免原始 bytes 污染日後嘅 Git 歷史；已上載嘅內容唔會刪除。',
  'cheapLfs.workingTree.reviewWarning':
    '繼續之前請核對清楚檔案。pointer 會取代成個檔案，所以只揀咗部分 diff 時，絕對唔會當成完整檔案上載。',
  'cheapLfs.workingTree.skipped.one': '1 個揀咗嘅檔案喺上載之前已跳過：',
  'cheapLfs.workingTree.skipped.many': '{count} 個揀咗嘅檔案喺上載之前已跳過：',
  'cheapLfs.workingTree.skipped.deleted':
    '刪除咗嘅檔案冇工作目錄 bytes 可以上載。',
  'cheapLfs.workingTree.skipped.partial':
    '請揀成個檔案，先可以用 pointer 取代佢。',
  'cheapLfs.workingTree.progress.label': 'Cheap LFS 成批進度',
  'cheapLfs.workingTree.progress.files': '已完成 {completed}/{total} 個檔案',
  'cheapLfs.workingTree.progress.count': '{completed}/{total}',
  'cheapLfs.workingTree.progress.canceling': '已要求取消；而家完成安全清理緊……',
  'cheapLfs.workingTree.result.canceled':
    'Cheap LFS 成批操作已取消。未完成嘅檔案保持原狀。',
  'cheapLfs.workingTree.result.stored.one': '1 個檔案已存入 Cheap LFS。',
  'cheapLfs.workingTree.result.stored.many': '{count} 個檔案已存入 Cheap LFS。',
  'cheapLfs.workingTree.result.storedLabel': '已存入嘅檔案：',
  'cheapLfs.workingTree.result.unchangedLabel': '保持原狀嘅檔案：',
  'cheapLfs.workingTree.result.error': 'Cheap LFS 未能完成呢批操作：{error}',
  'cheapLfs.workingTree.result.unknownError':
    '儲存服務冇提供可以安全顯示嘅錯誤詳情。',
  'cheapLfs.workingTree.done': '完成',
  'cheapLfs.workingTree.canceling': '取消緊……',
  'cheapLfs.workingTree.store.one': '將檔案存入 Cheap LFS',
  'cheapLfs.workingTree.store.many': '將 {count} 個檔案存入 Cheap LFS',
  'cheapLfs.commitBlocked.restoreTitle': 'Commit 要等檔案還原完成',
  'cheapLfs.commitBlocked.restoreBody':
    '「{name}」仲有 Cheap LFS 檔案 clone 緊或還原緊。今次未有開始 commit；等進度跑完再試，唔好同個檔案玩搶櫈仔。',
  'cheapLfs.managerRail': '大檔案',
  'repositorySettings.buildRunTab': '建置同執行',
  'repositorySettings.cheapLfsTab': 'Cheap LFS 大檔案',
  'repositorySettings.automationTab': '自動化（呢個存放庫）',
  'repositorySettings.appearanceTab': '外觀',
  'repositorySettings.searchLabel': '搵設定',
  'repositorySettings.appearance.intro':
    '呢度全部只係屬於呢個 repo。每一段都係改緊同一個主人——同一份設定、同一個本機 Git 倉、同一段歷史，即係你撳住 Shift 再右 click 個實物時開嗰個。',
  'repositorySettings.appearance.introHint':
    '想就地改？撳住 Shift 再右 click 個 repo 列、佢個 logo 或者工具列（或者 focus 住撳 Context Menu 掣／Shift+F10），就會喺旁邊開返同一個編輯器。',
  'repositorySettings.appearance.loading': '開緊呢個 repo 嘅外觀主人……',
  'repositorySettings.appearance.unavailable':
    '外觀主人仲啟動緊。請稍後再開 Repository settings。',
  'repositorySettings.appearance.loadFailed':
    '讀唔到呢個 repo 嘅外觀設定。請關閉 Repository settings 再試一次。',
  'repositorySettings.appearance.saveFailed':
    '儲存唔到呢項外觀改動。畫面顯示嘅值已經由磁碟上嘅設定還原。',
  'repositorySettings.appearance.workspaceSection': '工作區顏色',
  'repositorySettings.appearance.toolbarSection': '工具列',
  'repositorySettings.appearance.tabsSection': 'Repo 分頁',
  'repositorySettings.appearance.listNameSection': 'Repo 清單入面嘅名',
  'repositorySettings.appearance.logoSection': 'Repo Logo',
  'repositorySettings.appearance.inheriting': '跟返 profile 預設',
  'repositorySettings.appearance.overridden': '呢個 repo 自己蓋咗',
  'repositorySettings.appearance.reset': '還原做預設',
  'repositorySettings.appearance.resetAccessibleName':
    '將{section}還原做繼承嘅預設',
  'repositorySettings.appearance.history': '歷史',
  'repositorySettings.appearance.historyAccessibleName': '開啟{section}歷史',
  'repositorySettings.appearance.previewLabel': '即時預覽',
  'repositorySettings.appearance.previewDescription':
    '用上面嘅設定睇下{section}會點樣出。',
  'repositorySettings.appearance.resolvedAccent': '主色：{value}',
  'repositorySettings.appearance.resolvedSurface': '底色：{value}',
  'repositorySettings.appearance.resolvedLabels': '標籤：{value}',
  'repositorySettings.appearance.resolvedDensity': '密度：{value}',
  'repositorySettings.appearance.resolvedWidth': '闊度：{value}',
  'repositorySettings.appearance.inheritedSuffix': '繼承',
  'repositorySettings.appearance.overriddenSuffix': '呢個 repo',
  'repositorySettings.appearance.listNameInherits': '跟返一般列嘅字體',
  'repositorySettings.appearance.logoInherits': '跟返 profile 預設 logo',
  'githubApi.railLabel': 'API 瀏覽器',
  'cheapLfs.managerTitle': 'Cheap LFS 管理器',
  'cheapLfs.managerIntro':
    '喺呢度就可以搵、釘選、搜尋同還原 repo 嘅大檔案，唔使自己走入 GitHub Releases 猜資產檔名。',
  'cheapLfs.settings.location':
    'Cheap LFS 設定喺 Repository settings → Cheap LFS 分頁，唔使周圍搵。',
  'cheapLfs.settings.open': '開啟 Cheap LFS 設定',
  'cheapLfs.cloud.title': '雲端壓縮',
  'cheapLfs.cloud.publicAutomatic':
    '公開 repo 會自動開啟。第一次先檢查、commit 同 push 個 workflow 改動；之後每個 Release 物件會逐件壓縮。',
  'cheapLfs.cloud.privateToggle': '為呢個私人 repo 開啟雲端壓縮',
  'cheapLfs.cloud.privateHelp':
    '私人 repo 預設關閉。開啟後會喺呢個 repo 加入並 publish 已審核嘅 workflow；每次運行會用你嘅私人 GitHub Actions 分鐘，逐件壓縮 Release 物件，再將驗證過嘅 pointer commit 推返嚟。慳容量還慳容量，分鐘張單照樣識搵門口。',
  'cheapLfs.cloud.visibilityUnknown':
    'GitHub 未確認個 repo 係公開定私人之前，會穩陣噉保持關閉。',
  'cheapLfs.cloud.localOnly':
    'GitHub Actions 只負責壓縮。Desktop Material 會喺你部機下載同解壓，再核對原本大小同 SHA-256。',
  'cheapLfs.cloud.workflowAdded':
    '雲端壓縮政策已排隊。Desktop Material 會喺背景由已 checkout 嘅預設 branch publish 個受管 workflow，再核實 remote tip，唔會叫個檔案自己識飛。',
  'cheapLfs.cloud.workflowReady':
    '受管雲端壓縮政策已準備好。背景 publisher 會檢查預設 branch；如果政策本身已對，就唔會多手郁佢。',
  'cheapLfs.cloud.workflowDisabled':
    '私人雲端壓縮已關閉。如果舊受管 caller 仲要落閘，Desktop Material 會喺背景 publish 關閉 guard；raw 物件照樣 clone 得返。',
  'cheapLfs.cloud.builderRouted':
    '呢個私人 repo 冇加過 workflow，你嘅私人 Actions 分鐘一分鐘都冇燒。壓縮會經加密 public builder 做，而個 builder 要喺 Desktop Material 以外set好；未set好之前，啲物件會保持 raw，照樣 clone 得返。',
  'cheapLfs.cloud.autoInstall.startedTitle': 'Publish 緊雲端壓縮政策',
  'cheapLfs.cloud.autoInstall.startedBody':
    '而家喺背景將 {path} 同呢個 repo 嘅設定對齊；安全時先會 commit 同核實精確 remote 政策，否則會 defer，唔會順手 push 埋無關 commit。',
  'cheapLfs.cloud.autoInstall.succeededTitle': '雲端壓縮政策已 publish',
  'cheapLfs.cloud.autoInstall.succeededBody':
    'Remote branch {branch} 而家有 {path}，入面個 guard 同目前設定一致；Release 物件會照呢份政策辦事。',
  'cheapLfs.cloud.autoInstall.deferredTitle': '雲端壓縮政策已 commit',
  'cheapLfs.cloud.autoInstall.deferredBody':
    '已經 commit 咗 {path}，但呢條 branch 仲有其他 commit 未上 {remote}，所以背景冇擅自 push；政策會跟你下一次經審核嘅 push 一齊出門。',
  'cheapLfs.cloud.autoInstall.pendingDefaultTitle':
    '雲端壓縮政策等緊預設 branch',
  'cheapLfs.cloud.autoInstall.pendingDefaultBody':
    '目前係 {branch}。背景 publisher 只會改 provider 回報嘅預設 branch {defaultBranch}；checkout 過去再試。今次冇背景 commit 或 push；如果 working tree 本身已有準備好嘅政策，會留低畀你 review。',
  'cheapLfs.cloud.autoInstall.failedTitle': 'Publish 唔到雲端壓縮政策',
  'cheapLfs.cloud.autoInstall.failedBody':
    'Remote 上 {path} 嘅政策仲未證實同目前設定一致。{reason}',
  'cheapLfs.cloud.autoInstall.failedWorkflowScope':
    'Push 被拒絕，因為登入緊嘅帳戶冇 `workflow` 權限範圍；GitHub 規定改 .github/workflows 入面任何嘢都要有。請登出再登入授權，或者檢查清楚再自己 push 份受管政策。',
  'cheapLfs.cloud.autoInstall.failedRejected':
    'Push 被拒絕，因為 remote branch 已經行前咗。請先 pull、檢查受管政策，再 push 一次。',
  'cheapLfs.cloud.autoInstall.failedUnknown':
    'Commit 或者 push 未完成。受管 workflow 可能仲喺 Changes 等你檢查；remote 政策冇被報成已 publish。',
  'cheapLfs.cloud.autoInstall.failedNoRepository':
    '呢個 checkout 冇連住 GitHub repo，所以冇地方行壓縮 workflow。',
  'cheapLfs.cloud.autoInstall.failedNoRemote':
    '呢個 repo 冇設定 push remote，所以個 workflow publish 唔到。',
  'cheapLfs.cloud.autoInstall.failedDetachedHead':
    'HEAD 而家係 detached，冇 branch 可以 commit 個 workflow。請 checkout 返一條 branch 再試。',
  'cheapLfs.cloud.autoInstall.failedNoDefaultBranch':
    'GitHub 冇提供呢個 repo 嘅預設 branch。Refresh 或者先 publish 預設 branch 再試；今次冇建立 workflow commit。',
  'cheapLfs.cloud.autoInstall.updateTitle': '壓縮 workflow 版本唔同咗',
  'cheapLfs.cloud.autoInstall.updateBody':
    '{path} 同呢個版本嘅 Desktop Material 會裝嘅唔一樣。個檔案原封不動冇改過。如果唔係你自己特登改，先好更新佢。',
  'cheapLfs.cloud.autoInstall.updateAction': '更新 workflow',
  'cheapLfs.cloud.autoInstall.updateWarning':
    '呢個動作會用 Desktop Material 內置嗰份取代你嗰份，再 commit 同 push。你喺入面嘅改動會冇咗。',
  'cheapLfs.cloud.autoInstall.updateConfirm': '取代並 push',
  'cheapLfs.cloud.autoInstall.updateCancel': '保留我嗰份',
  'cheapLfs.cloud.autoInstall.unownedTitle': '未安裝壓縮 workflow',
  'cheapLfs.cloud.autoInstall.unownedBody':
    '{path} 已經俾一個唔係 Desktop Material 管理嘅檔案佔咗。我哋原封不動冇郁過佢，所以呢度唔會自動開雲端壓縮。',
  'cheapLfs.cloud.autoInstall.visibilityUnknownTitle':
    '未知公定私，雲端壓縮暫時企定',
  'cheapLfs.cloud.autoInstall.visibilityUnknownBody':
    'GitHub 未confirm呢個 repo 係公開定私人，所以乜都冇裝，公開嗰邊亦都乜都冇準備過。登入或者refresh返個 repo，壓縮就會自己接返落去。',
  'cheapLfs.cloud.autoInstall.builderTitle':
    '私人 repo 嘅壓縮改由外部 builder 做',
  'cheapLfs.cloud.autoInstall.builderUnavailableBody':
    '呢個私人 repo 冇加壓縮 workflow，因為每壓一次就燒你自己嘅 Actions 分鐘。壓縮應該擺去加密 public builder 度做，登記資料已經整好：builder {builder}、project {project}、secrets {secrets}。Desktop Material 唔可以幫你開嗰個公開 repo，亦唔會幫你寫 secret，所以你未搞掂之前壓縮唔會行。呢個 repo 嘅任何嘢都冇 publish 過去邊度。',
  'cheapLfs.cloud.autoInstall.builderLeakRefusedBody':
    '準備外部 builder 嗰陣即刻煞停咗：有個準備擺去公開位置嘅值，入面帶住呢個 repo 嘅名、檔案路徑或者 asset 名。乜都冇裝，乜都冇 publish。改個名避開撞，或者索性唔開壓縮。',
  'cheapLfs.cloud.autoInstall.builderNoIdentityBody':
    '呢個 checkout 冇私人 GitHub repo 可以拎去外部 builder 登記，所以乜都冇裝，亦冇 publish 過任何嘢。',
  'cheapLfs.cloud.autoInstall.builderPreparationFailedBody':
    '外部 builder 嘅登記資料整唔掂，所以壓縮冇開始過。呢個 repo 入面乜都冇裝，出面亦都乜都冇 publish。啲物件會保持 raw，照樣 clone 得返；重新開返個 repo 再試下。',
  'cheapLfs.cloud.raw': 'Raw 原檔',
  'cheapLfs.cloud.compressed': '已壓縮 · 慳咗 {savings}%',
  'cheapLfs.cloud.mixed':
    '混合 · {compressed}/{total} 件已壓縮 · 慳咗 {savings}%',
  'cheapLfs.manualUpload': '手動上載',
  'cheapLfs.manualUploadStarting': '轉緊做手動上載…',
  'cheapLfs.cancel': '取消',
  'cheapLfs.cancelConfirmation':
    '確定取消今次 Cheap LFS 傳輸？\n\n上載或者手動交接會即刻停止。工作目錄入面已經轉成 pointer 嘅檔案，或者已經上載去 GitHub Release 嘅資產可能會保留，但唔會建立 commit。',
  'cheapLfs.progress.amendSuffix': '，跟住先改上一個 commit',
  'cheapLfs.progress.preparing': '幫 {files} 準備 cheap LFS{amend}',
  'cheapLfs.progress.hashing':
    '幫 {files} 計緊雜湊，準備放入 cheap LFS（{percentage}%）{amend}',
  'cheapLfs.progress.release': '幫 {files} 準備緊 GitHub Release{amend}',
  'cheapLfs.progress.uploadStarting':
    '準備開始上載 {files} 去 cheap LFS{amend}',
  'cheapLfs.progress.uploading':
    '上載緊 {files} 去 cheap LFS（{percentage}%）{amend}',
  'cheapLfs.progress.verifying': '核實緊 {files} 嘅 cheap LFS 資料{amend}',
  'cheapLfs.progress.manualPreparing':
    '執緊手動上載交接資料夾（{percentage}%）',
  'cheapLfs.progress.manualWaiting':
    '喺 GitHub 上載晒準備好嘅檔案，跟住撳儲存 Release',
  'cheapLfs.progress.manualVerifying': '核實緊你手動上載嘅檔案',
  'cheapLfs.progress.manualDetected': '見到手動上載喇，亦都核實完成',
  'cheapLfs.progress.terminalTitle': 'Cheap LFS 上載實況',
  'cheapLfs.progress.terminalCurrentFile': '而家處理緊：{path}',
  'cheapLfs.progress.terminalFiles': '搞掂檔案：{completed}/{total}',
  'cheapLfs.progress.terminalFilesDetailed':
    '處理完 {completed}/{total} · pin 咗 {succeeded} · 失手 {failed}',
  'cheapLfs.progress.terminalFailuresLabel': '失敗原因',
  'cheapLfs.progress.terminalFailedFile': '{path} — {reason}',
  'cheapLfs.progress.terminalFailedFileWithStatus':
    '{path} — HTTP {status}：{reason}',
  'cheapLfs.progress.terminalFailedFileNoReason':
    '{path} — 儲存服務冇提供原因。',
  'cheapLfs.progress.terminalFailuresOmitted': '仲有 {count} 個',
  'cheapLfs.progress.terminalBytes': '成批數據：{transferred} / {total}',
  'cheapLfs.progress.terminalFileBytes':
    '{transferred} / {total}（{percentage}%）',
  'cheapLfs.progress.terminalBytesPending': '成批數據：等緊第一批 bytes',
  'cheapLfs.progress.terminalActivity':
    '工作線：{active} 條做緊 · {queued} 個等緊',
  'cheapLfs.progress.terminalAwaitingAction': '等緊你處理嘅檔案：{count}',
  'cheapLfs.progress.terminalManualVerification': '仲要核實嘅檔案：{count}',
  'cheapLfs.progress.terminalManualComplete': '手動上載已核實',
  'cheapLfs.progress.terminalObservedElapsed': '已觀察 {elapsed}',
  'cheapLfs.progress.terminalTiming':
    '已觀察 {elapsed} · {rate} · 預計仲要 {eta}',
  'cheapLfs.progress.terminalRatePending': '量度緊速度',
  'cheapLfs.progress.terminalEtaPending': '等緊數據',
  'cheapLfs.progress.terminalProgressLabel': 'Cheap LFS 傳輸進度',
  'cheapLfs.progress.terminalStorageSelected': '目的地 {selected}{layers}',
  'cheapLfs.progress.terminalStorage':
    '而家用 {selected} · 呢批建議用 {recommended}{layers}',
  'cheapLfs.progress.terminalStorageMatched':
    '而家用 {selected} · 呢批檔案啱用{layers}',
  'cheapLfs.progress.terminalLayer': ' · 預計 1 個 OCI layer',
  'cheapLfs.progress.terminalLayers': ' · 預計 {count} 個 OCI layers',
  'cheapLfs.progress.terminalProviderGit': '普通 Git',
  'cheapLfs.progress.terminalProviderUnknown': '未知儲存位置',
  'cheapLfs.progress.terminalReasonOrdinaryGit':
    '建議原因：呢批已揀資料仲適合用普通 Git。',
  'cheapLfs.progress.terminalReasonSingleRelease':
    '建議原因：呢批資料放得入一次 Release-backed 傳輸。',
  'cheapLfs.progress.terminalReasonGhcr':
    '建議原因：呢批 GitHub 大量資料用可重用 GHCR layers 會更合適。',
  'cheapLfs.progress.terminalReasonDockerHub':
    '建議原因：呢批大量資料用可重用 Docker Hub layers 會更合適。',
  'cheapLfs.progress.terminalReasonReleaseFallback':
    '建議原因：而家未有可用 registry，所以穩陣噉用 Release 儲存做後備。',
  'cheapLfs.progress.terminalStagePreparing': '準備緊',
  'cheapLfs.progress.terminalStageHashing': '計緊 hash',
  'cheapLfs.progress.terminalStageRelease': '準備緊 Release',
  'cheapLfs.progress.terminalStageUploading': '上載緊',
  'cheapLfs.progress.terminalStageVerifying': '核實緊',
  'cheapLfs.progress.terminalStageManualPreparing': '準備手動上載',
  'cheapLfs.progress.terminalStageManualWaiting': '等緊你手動上載',
  'cheapLfs.progress.terminalStageManualVerifying': '檢查緊手動上載',
  'cheapLfs.progress.terminalStageManualDetected': '手動上載核實咗',
  'githubReleases.compactTools': '篩選同選取',
  'githubReleases.compactSummary': '顯示 {visible} 個 · 已選 {selected} 個',
  'githubReleases.statsSummaryLabel': '發佈統計',
  'githubReleases.statsSummary':
    '載入咗 {loaded} 個 · 已發佈 {published} 個 · 最新 {latest}',
  'githubPackages.scopeRecovery':
    '個 token 冇得原地加權限。要重新登入，批准 {scope}，先列到 packages。',
  'githubPackages.signInAgain': '重新登入',
  'githubReleases.filterSummary':
    '篩選緊已載入 Release 入面嘅 {visible}/{total} 個',
  'githubReleases.dismissDownload': '知道喇',
  'githubReleases.metadataLabel': '發行詳情',
  'githubReleases.metadataSummary': '{status} · {assets} 個檔案',
  'githubReleases.openFile': '開啟檔案',
  'githubReleases.showInFolder': '喺資料夾顯示',
  'githubReleases.openFileError':
    '開唔到下載咗嘅 Release 檔案。請檢查 Windows 有冇 app 可以開呢種檔案，跟住再試。{detail}',
  'githubReleases.loadAll': '載入全部 Release',
  'githubReleases.loadAllBusy': '載入緊全部 Release…',
  'githubReleases.loadAllProgress':
    '載入緊全部 Release… 已載入 {loaded} 個（總數未知），去到第 {page} 頁。',
  'githubReleases.loadAllComplete':
    '成個 repository 嘅 Release 都載入晒喇，一共 {loaded} 個。而家搜尋會篩晒全部。',
  'githubReleases.loadAllTruncated':
    '載入咗 {loaded} 個 Release，去到 {pages} 頁嘅安全上限就停。超出上限嘅舊 Release 未載入，所以篩選唔包佢哋。',
  'githubReleases.loadAllRateLimited':
    '撞到 GitHub API 用量上限，已載入 {loaded} 個 Release 就停低。已經載入嘅照樣顯示、照樣可以篩選。等上限重設之後再試。',
  'githubReleases.loadAllFailed':
    '載入咗 {loaded} 個 Release 之後停低。{detail}',
  'githubReleases.loadAllCanceled':
    '已經停止載入。而家有 {loaded} 個 Release，仲可以照篩選。',
  'githubReleases.bulkDeleteReview':
    '每個已審核嘅 Release 都會喺永久刪除前即時重新核實，逐個處理並顯示進度。Git tag 唔會刪除。有 Release 失敗會列出原因，其餘嘅會繼續處理。',
  'githubReleases.bulkDeleteProgressLabel': '刪除已選 Release 嘅進度',
  'githubReleases.bulkDeleteProgress':
    '刪除緊已選 Release：已刪除 {deleted} 個、失敗 {failed} 個，總共 {total} 個。',
  'githubReleases.bulkDeleteStop': '刪完呢個就停',
  'githubReleases.bulkDeleteStopping':
    '刪完手上呢個就會停。已刪除 {deleted} 個、失敗 {failed} 個，總共 {total} 個。',
  'githubReleases.bulkDeleteSummary':
    '喺 {total} 個已選 Release 入面刪除咗 {deleted} 個，{failed} 個失敗。Git tag 冇刪除。',
  'githubReleases.bulkDeleteSummaryStopped':
    '喺 {total} 個已選 Release 入面處理咗 {attempted} 個就停：刪除咗 {deleted} 個、{failed} 個失敗、{remaining} 個未處理。Git tag 冇刪除。',
  'githubReleases.bulkDeleteFailures': '刪唔到嘅 Release',
  'githubReleases.bulkDeleteFailure': '{tag}：{reason}',
  'githubReleases.bulkDeleteFailuresOmitted': '仲有 {count} 個未喺度列出。',
  'githubReleases.silentInstall': '靜默安裝 {file}',
  'githubReleases.silentInstallAttempt': '試下靜默安裝 {file}',
  'githubReleases.silentInstallRunning':
    '正在無人手安裝 {file}… 已經行咗 {seconds} 秒。Windows 可能仲會彈窗要你批准先繼續到。',
  'githubReleases.silentInstallSucceeded': '{file} 完成，結束代碼 {code}。',
  'githubReleases.silentInstallFailed':
    '{file} 未有安裝到。結束代碼係 {code}。如果 Windows 要你俾管理員權限，請手動執行個安裝檔。',
  'githubReleases.silentInstallLaunchFailed': '啟動唔到 {file}。{detail}',
  'githubReleases.silentInstallOutput': '安裝程式輸出：{output}',
  'githubReleases.silentInstallRefusedMissing':
    '{file} 已經唔喺下載位置度，所以冇執行過任何嘢。請重新下載。',
  'githubReleases.silentInstallRefusedNotAFile':
    '{file} 嘅下載位置唔係一個檔案，所以冇執行過任何嘢。',
  'githubReleases.silentInstallRefusedSize':
    '下載位置嗰個檔案嘅大細已經同 {file} 唔一樣，所以冇執行過任何嘢。請重新下載。',
  'githubReleases.silentInstallRefusedName':
    '下載位置擺住嘅唔係 {file} 嗰個檔案，所以冇執行過任何嘢。請重新下載。',
  'githubReleases.silentInstallRefusedKind':
    '{file} 唔係本 app 會執行嘅安裝程式，所以冇執行過任何嘢。',
  'githubReleases.silentInstallRefusedPlatform':
    '無人手安裝淨係喺 Windows 先用得，所以冇執行過任何嘢。',
  'githubReleases.sortLabel': '排序',
  'githubReleases.sortNewest': '最新排先',
  'githubReleases.sortOldest': '最舊排先',
  'cheapLfs.settings.sectionHeading': '大型檔案同儲存（Cheap LFS）',
  'cheapLfs.settings.autoMaterialize': 'Clone 完自動下載大檔案',
  'cheapLfs.settings.autoPin': 'Commit 嗰陣自動 pin 大檔案',
  'cheapLfs.settings.autoPinHelp':
    '大過約 100 MB 嘅檔案會上載去揀好嘅 Cheap LFS 儲存位置，再換成細 pointer。失手嘅檔案會留喺 Changes 等下次 commit，其他揀咗嘅安全變更會照行。',
  'cheapLfs.settings.cloneHelper': '包括 Windows 同 Linux clone helper',
  'cheapLfs.settings.cloneHelperHelp':
    '預設開啟。Cheap LFS commit 會喺 .desktop-material/cheap-lfs 保持一份受管理 Markdown 指南，同埋 Windows/Linux 一行指令 hydration scripts。關閉後只會停止日後更新，已經 commit 嘅檔案唔會偷偷刪走。',
  'cheapLfs.settings.summary':
    'Pinning 會將 commit 入面大過約 100 MB 嘅檔案上載去揀好嘅 Cheap LFS 儲存位置，再 commit 一條細 pointer。上載會用你揀嘅一至三條通道，重試就逐個嚟；失敗檔案留喺 Changes，安全檔案照樣可以 commit。GHCR 同 Docker Hub 會將倉庫物件放喺一個鎖定 digest 嘅 OCI image，私人倉庫就用 track 咗嘅 key 加密。Clone helper 同 Desktop Material 會喺 clone 或 pull 後還原你揀嘅 pointers。',
  'cheapLfs.settings.parallelUploads': 'Cheap LFS 同時上載數量',
  'cheapLfs.settings.parallelUploadsHelp':
    '揀 1、2 或 3 條上載通道；上載重試會穩陣啲逐個嚟，下載就保留原本還原方式，唔會亂改車道。',
  'cheapLfs.settings.ghcrStorage': '用一個 GHCR image 儲晒 Cheap LFS',
  'cheapLfs.settings.ghcrStorageHelp':
    '成個 repository 嘅物件會放入一個鎖定 digest 嘅 OCI image。私人 repository 會用一條一齊 track 嘅共享 key 加密物件。',
  'cheapLfs.settings.storageProvider': '大檔案儲存位置',
  'cheapLfs.settings.storageRelease': 'GitHub 已發佈 prerelease',
  'cheapLfs.settings.storageGhcr': 'GHCR · 一個 OCI image',
  'cheapLfs.settings.storageDockerHub': 'Docker Hub · 一個 OCI image',
  'cheapLfs.cloneHelper.conflictTitle': 'Cheap LFS clone helper 要你望一望',
  'cheapLfs.cloneHelper.conflictBody':
    'Desktop Material 冇郁過呢啲唔屬於受管理 helper 嘅檔案：{paths}。請搬走或者改名，再 commit 一次，就可以安全產生 Windows 同 Linux helper。',
  'cheapLfs.cloneHelper.failureTitle': 'Cheap LFS clone helper 未有更新',
  'cheapLfs.cloneHelper.failureBody':
    '已上載嘅 Cheap LFS pointers 仍然有效，但 Desktop Material 未能安全更新受管理嘅 Windows/Linux hydration helper。請檢查倉庫檔案，再試一次 commit。',
  'cheapLfs.cloneSelection.rejectedTitle': '已揀嘅 Cheap LFS 檔案未有下載',
  'cheapLfs.cloneSelection.rejectedBody':
    '你揀完之後，倉庫 manifest、branch、account 或 pointer 檔案有變（{reason}）。Clone 已完成，pointer 檔案保持原樣。請重新打開 Clone Repository 再揀資產。',
  'cheapLfs.encryption.title': 'Release payload 加密',
  'cheapLfs.encryption.toggle': '用密碼加密新嘅 Release payload',
  'cheapLfs.encryption.help':
    '上載去 GitHub Releases 之前，先加密新嘅 Cheap LFS payload 內容。預設係關閉，亦唔會重新加密現有 payload。',
  'cheapLfs.encryption.metadataNotice':
    '加密會保護 provider 上面嘅 payload 內容。檔案名、路徑、大小、hash 同 commit 歷史仍然會睇到。',
  'cheapLfs.encryption.statusChecking': '檢查緊 Windows Credential Manager…',
  'cheapLfs.encryption.statusSaved':
    '呢個 repository 有密碼儲咗喺 Windows Credential Manager。',
  'cheapLfs.encryption.statusMissing': '呢個 repository 冇儲存密碼。',
  'cheapLfs.encryption.statusUnavailable':
    'Windows Credential Manager 而家用唔到。密碼唔會被儲存。',
  'cheapLfs.encryption.setPassword': '設定密碼…',
  'cheapLfs.encryption.changePassword': '更改已儲存密碼…',
  'cheapLfs.encryption.forgetPassword': '忘記已儲存密碼…',
  'cheapLfs.encryption.saved': '密碼已儲存喺 Windows Credential Manager。',
  'cheapLfs.encryption.notSaved':
    '密碼冇儲存。加密 payload 操作需要時會再問你。',
  'cheapLfs.encryption.saveUnavailable':
    'Windows Credential Manager 儲存唔到密碼，亦冇將密碼寫去其他地方。',
  'cheapLfs.encryption.forgot':
    '已經由 Windows Credential Manager 移除已儲存密碼。',
  'cheapLfs.encryption.forgetMissing': '冇已儲存密碼可以移除。',
  'cheapLfs.encryption.forgetUnavailable':
    'Windows Credential Manager 移除唔到已儲存密碼。',
  'cheapLfs.encryption.dialog.encryptTitle': '設定 Release payload 密碼',
  'cheapLfs.encryption.dialog.commitTitle': '加密 commit 前需要密碼',
  'cheapLfs.encryption.dialog.decryptTitle': '輸入 Release payload 密碼',
  'cheapLfs.encryption.dialog.changeTitle': '更改已儲存嘅 Release payload 密碼',
  'cheapLfs.encryption.dialog.forgetTitle': '忘記已儲存密碼？',
  'cheapLfs.encryption.dialog.staleForgetTitle': '忘記呢個無效密碼？',
  'cheapLfs.encryption.dialog.encryptDescription':
    '輸入用嚟加密新 Release payload 嘅密碼。Desktop Material 無法復原遺失嘅密碼。',
  'cheapLfs.encryption.dialog.commitDescription.plain':
    '呢個 commit 正等緊密碼，之後先會將大檔 pin 好，而且只會以加密 ciphertext 上載。撳「取消」會喺任何上載開始前停止 commit。Desktop Material 無法復原遺失嘅密碼。',
  'cheapLfs.encryption.dialog.commitDescription.light':
    '呢個 commit 暫停咗等密碼；大檔 pin 好之後只會以加密 ciphertext 上載。撳「取消」會喺任何上載開始前停止 commit。Desktop Material 無法復原遺失嘅密碼。',
  'cheapLfs.encryption.dialog.commitDescription.playful':
    '呢個 commit 喺加密閘口等緊密碼。大檔 pin 好之後只會以加密 ciphertext 上載；撳「取消」會喺任何上載開始前停止 commit。Desktop Material 無法復原遺失嘅密碼。',
  'cheapLfs.encryption.dialog.commitDescription.maximum':
    '呢個 commit 喺加密閘口耍緊暗號，個閘口都係嗰句：要密碼先放行。大檔 pin 好之後只會以加密 ciphertext 上載；撳「取消」就會喺一個 byte 都未上載之前叫停。呢句就要板起面講：Desktop Material 無法復原遺失嘅密碼——冇鎖匠㗎。',
  'cheapLfs.encryption.dialog.decryptDescription':
    '輸入當初用嚟加密呢個 Release payload 嘅密碼。',
  'cheapLfs.encryption.dialog.changeDescription':
    '設定日後加密 payload 操作用嘅密碼。現有 payload 仍然保留當初加密佢嘅密碼。',
  'cheapLfs.encryption.dialog.forgetDescription':
    '呢個操作會由 Windows Credential Manager 移除 repository 密碼，唔會解密、刪除或者改動任何 payload。',
  'cheapLfs.encryption.dialog.staleForgetDescription':
    '已儲存密碼解密唔到呢個 payload。由 Windows Credential Manager 移除之後，下次會再問另一個密碼。',
  'cheapLfs.encryption.dialog.irreversibleWarning':
    '如果遺失呢個密碼，用佢加密嘅 payload 將無法復原。冇後門、重設或者支援人員繞過方法。',
  'cheapLfs.encryption.dialog.password': '密碼',
  'cheapLfs.encryption.dialog.confirmPassword': '確認密碼',
  'cheapLfs.encryption.dialog.remember': '儲存喺 Windows Credential Manager',
  'cheapLfs.encryption.dialog.rememberHelp':
    '預設關閉。儲存之後，任何使用呢個 Windows 帳戶嘅人都可以用已儲存憑證解密。失去帳戶或者憑證庫存取權，仍然可能令你失去解密能力。',
  'cheapLfs.encryption.dialog.irreversibleAck':
    '我明白遺失呢個密碼，就無法復原用佢加密嘅 payload。',
  'cheapLfs.encryption.dialog.forgetAck':
    '我明白呢個操作只會移除已儲存密碼，唔會改動任何加密 payload。',
  'cheapLfs.encryption.dialog.staleForgetAck':
    '我明白呢個操作會移除失效密碼，下次會再問我。',
  'cheapLfs.encryption.dialog.passwordRequired': '請輸入密碼。',
  'cheapLfs.encryption.dialog.passwordMismatch': '兩次輸入嘅密碼唔一致。',
  'cheapLfs.encryption.dialog.continue': '繼續',
  'cheapLfs.encryption.dialog.forget': '忘記密碼',
  'cheapLfs.encryption.dialog.cancel': '取消',
  'password.visibilityToggle': '切換顯示密碼',
  'remoteVerification.warningTitle': 'Remote URL 需要處理',
  'remoteVerification.warningBody':
    'Desktop Material 無法驗證呢個 repository 嘅 remote URL。冇嘗試 push。請檢查 remote URL，然後再試。',
  'remoteVerification.changeUrl': '更改 remote URL',
  'ignoredSubmodule.dialogTitle': '將被忽略嘅檔案搬入本機 submodule',
  'ignoredSubmodule.openAction': '被忽略檔案搬入本機 submodule…',
  'ignoredSubmodule.openTooltip':
    '將 Git 而家證實係 ignored 嘅檔案複製入一個新嘅本機 repo，再加做 submodule。原本嗰啲檔案原地唔郁。',
  // 三個語氣層次跟 funny level（1-2 正經、3 輕鬆、4-5 最好玩）。每一層講嘅事
  // 完全一樣——只列 Git 證實 ignored 嘅檔案、每份複本都核對過、原檔一律唔郁、
  // 亦唔會上載——因為語氣可以變，事實唔可以變。
  'ignoredSubmodule.intro.plain':
    '呢度只會列出 Git 而家證實係 ignored 嘅檔案。你揀嘅檔案會複製入一個新嘅本機 repo，每份複本都會核對大小同 SHA-256，然後將個 repo 加做 submodule。你原本嘅檔案會逐個 byte 留喺原本嘅路徑。唔會上載任何嘢，唔會開 remote，亦唔會 push。',
  'ignoredSubmodule.intro.light':
    '入到嚟嘅，全部係 Git 親口認咗係 ignored 嘅檔案。你剔嘅會複製入一個新嘅本機 repo，每份複本都要過大小同 SHA-256 呢兩關，跟住個 repo 加做 submodule。原檔逐個 byte 留喺原位。唔會上載，唔會開 remote，亦唔會 push。',
  'ignoredSubmodule.intro.playful':
    '呢度淨係收 Git 肯拍心口擔保係 ignored 嘅檔案——唔靠估，亦唔會偷睇 .gitignore 自己解讀。你剔邊個，邊個就會俾人抄一份入一個全新嘅本機 repo，每份複本都要量身高（大小）同對指紋（SHA-256），過到關個 repo 先入嚟做 submodule。原檔一個 byte 都唔會郁。唔上載、唔開 remote、唔 push。',
  'ignoredSubmodule.intro.maximum':
    '呢度把關嚴過酒樓大堂：淨係收 Git 肯上庭作供話係 ignored 嘅檔案——唔靠估，亦唔會伸個頭過去偷睇 .gitignore。你剔邊個，邊個就抄一份入全新嘅本機 repo，每份複本喺門口過磅（大小）兼打指模（SHA-256），全部及格個 repo 先入嚟做 submodule。原檔一個 byte 都唔會郁。唔上載、唔開 remote、唔 push——成個派對都喺你屋企搞。',
  'ignoredSubmodule.reviewLead.plain':
    '執行之前請先睇清楚。下面每一步都喺你部機做，順序如下；所有複製核對做完，先至會改動 Git。',
  'ignoredSubmodule.reviewLead.light':
    '撳落去之前，好好睇一睇。下面全部喺你部機做，順序如下；每份複本核對完，先至輪到 Git 改嘢。',
  'ignoredSubmodule.reviewLead.playful':
    '撳之前望多眼，呢下係真㗎。下面全部喺你部機做，順序如下；每份複本要先過大小同 hash 兩關，Git 先有資格郁一條 index 記錄。',
  'ignoredSubmodule.reviewLead.maximum':
    '最後召集，過咗呢個掣就係嚟真。下面每一步都喺你部機做，次序一格都唔會亂；每份複本要考埋大小同 hash 兩科攞晒 A，Git 先有資格掂一條 index 記錄。',
  'ignoredSubmodule.loading': '問緊 Git 而家有邊啲檔案係 ignored…',
  'ignoredSubmodule.loadFailed': '讀唔到 Git 嘅 ignored 檔案清單：{error}',
  'ignoredSubmodule.empty':
    'Git 而家證實唔到呢個 repo 有任何 working 檔案係 ignored，所以冇嘢可以搬。',
  'ignoredSubmodule.truncated':
    '只列出頭 {count} 個 ignored 檔案。你可以收窄 ignore 規則，或者先搬呢批，之後再開返呢個對話框處理其餘。',
  'ignoredSubmodule.searchLabel': '搜尋被忽略嘅檔案',
  'ignoredSubmodule.searchPlaceholder': '路徑、ignore 規則或者樣式',
  'ignoredSubmodule.searchTarget': '被忽略嘅檔案',
  'ignoredSubmodule.noMatches': '冇 ignored 檔案配對到呢個搜尋。',
  'ignoredSubmodule.filterCount':
    '{total} 個 ignored 檔案入面顯示緊 {visible} 個',
  'ignoredSubmodule.regexError':
    '正則表達式無效：{message}。所有 ignored 檔案照樣列晒出嚟。',
  'ignoredSubmodule.listLabel': 'Git 證實係 ignored 嘅檔案',
  'ignoredSubmodule.proof': '由 {source}:{line} 忽略 — {pattern}',
  'ignoredSubmodule.fileMeta': '{bytes} bytes',
  'ignoredSubmodule.selectAll': '全選列出嘅檔案',
  'ignoredSubmodule.clearSelection': '清除選擇',
  'ignoredSubmodule.selectionSummary': '揀咗 {count} 個檔案 · {bytes} bytes',
  'ignoredSubmodule.destinationLabel': '新 submodule 資料夾',
  'ignoredSubmodule.destinationHelp':
    '要係一個相對呢個 repo、而家仲未存在、亦唔會同現有 submodule 重疊嘅資料夾。個新 repo 會喺呢度建立。',
  'ignoredSubmodule.reviewAction': '檢查呢個操作',
  'ignoredSubmodule.reviewHeading': '未改任何嘢之前，請確認',
  'ignoredSubmodule.reviewDestination': '新 submodule 資料夾：{path}',
  'ignoredSubmodule.reviewFilesHeading':
    '以下 {count} 個檔案會被複製（{bytes} bytes）',
  'ignoredSubmodule.willHeading': '呢個操作會做嘅嘢',
  'ignoredSubmodule.willCopy':
    '將每個列出嘅檔案照原本嘅相對路徑複製入 {path}，並且核對每份複本嘅大小同 SHA-256。',
  'ignoredSubmodule.willCreate':
    '喺 {path} 建立一個新嘅 Git repo，並且喺入面做一個 commit，裝住嗰啲核對過嘅複本。',
  'ignoredSubmodule.willAdd':
    '將嗰個 repo 以 submodule 形式加入呢個 repo 嘅 {path}。改動只會 stage 住，唔會 commit——由你自己檢查同 commit。',
  'ignoredSubmodule.willKeep':
    '每個原檔逐個 byte 留喺而家嘅路徑。唔會搬、唔會轉做 link、唔會截短。',
  'ignoredSubmodule.willRecover':
    '喺 working tree 以外保留每個原檔嘅獨立複本，直到全部通過最後檢查，之後先刪除嗰啲複本。',
  'ignoredSubmodule.wontHeading': '呢個操作唔會做嘅嘢',
  'ignoredSubmodule.wontUpload':
    '唔會上載任何 Cheap LFS 物件，亦唔會揀儲存供應商。',
  'ignoredSubmodule.wontRemote':
    '唔會喺 GitHub 或者任何 host 開 repo，亦唔會加 remote。',
  'ignoredSubmodule.wontPointer': '唔會將任何檔案轉做 Cheap LFS pointer。',
  'ignoredSubmodule.wontCommit':
    '唔會喺呢個 repo commit，亦唔會 push 去任何地方。',
  'ignoredSubmodule.wontReplace': '唔會用 link 取代你原本嘅檔案。',
  'ignoredSubmodule.confirmAction': '複製檔案並加入 submodule',
  'ignoredSubmodule.backAction': '返去檔案清單',
  'ignoredSubmodule.cancelAction': '取消',
  'ignoredSubmodule.doneAction': '完成',
  'ignoredSubmodule.progressHeading': '複製同核對緊',
  'ignoredSubmodule.progressStatus':
    '已核對 {total} 個檔案入面嘅 {completed} 個…',
  'ignoredSubmodule.progressLabel': '被忽略檔案暫存進度',
  'ignoredSubmodule.successHeading': 'Submodule 已加入',
  'ignoredSubmodule.successDescription':
    '{count} 份核對過嘅複本（{bytes} bytes）已經 commit 咗喺 {path} 嘅新 repo，而個 repo 已經 stage 咗做 submodule。每個原檔喺原本路徑上完全冇變。你準備好就檢查同 commit 嗰個 staged 改動。',
  'ignoredSubmodule.rejectedHeading': '以下檔案被拒絕，亦冇改動過任何嘢',
  'ignoredSubmodule.rejectedRow': '{path} — {reason}',
  'ignoredSubmodule.failedHeading': '操作已停止',
  'ignoredSubmodule.recoveryRetained':
    '你原本嘅檔案由頭到尾冇被寫入過。獨立複本仲喺 {path}。',
  'ignoredSubmodule.notification.startedTitle': '暫存緊被忽略嘅檔案',
  'ignoredSubmodule.notification.startedBody':
    '複製同核對緊 {count} 個 ignored 檔案入 {path}。原檔一律唔郁。',
  'ignoredSubmodule.notification.succeededTitle': '本機 submodule 已建立',
  'ignoredSubmodule.notification.succeededBody':
    '{count} 份核對過嘅複本已經 commit 咗喺 {path}，submodule 亦已 stage。每個原檔完全冇變。冇上載過，亦冇 push 過。',
  'ignoredSubmodule.notification.failedTitle': '被忽略檔案暫存已停止',
  'ignoredSubmodule.notification.failedBody':
    '呢個 repo 冇加入過任何嘢。{error}',
  'ignoredSubmodule.reason.notProvenIgnored':
    'Git 而家證實唔到呢個路徑係 ignored——被追蹤嘅檔案永遠都證實唔到。',
  'ignoredSubmodule.reason.symbolicLink':
    '呢個路徑係 link 或者 junction，一律唔會跟落去。',
  'ignoredSubmodule.reason.reparsePoint':
    '呢個路徑要經 reparse point、junction 或者掛載點先攞到內容，即係啲 bytes 唔係真係喺路徑講嘅位置。',
  'ignoredSubmodule.reason.notRegularFile': '呢個路徑唔係普通檔案。',
  'ignoredSubmodule.reason.gitControlPath': '呢個路徑喺 Git 控制目錄入面。',
  'ignoredSubmodule.reason.nestedRepository':
    '呢個路徑喺另一個 Git repo 入面。',
  'ignoredSubmodule.reason.pathEscape': '呢個路徑走出咗 repo 根目錄。',
  'ignoredSubmodule.reason.duplicateSelection': '呢個路徑俾人揀咗超過一次。',
  'ignoredSubmodule.reason.destinationCollision':
    '喺目的地，呢個路徑會同另一個揀咗嘅檔案撞名——Windows 當佢哋係同一個名。',
  'ignoredSubmodule.reason.insideDestination':
    '呢個路徑喺新 submodule 資料夾入面。',
  'ignoredSubmodule.reason.staleInventory':
    '呢個檔案自從上榜之後改過，即係你睇過嗰啲 bytes 已經唔係磁碟上嗰啲。',
  'ignoredSubmodule.destination.empty': '請輸入新 submodule 嘅資料夾。',
  'ignoredSubmodule.destination.absolute':
    '請輸入相對呢個 repo 嘅資料夾，唔好用絕對路徑。',
  'ignoredSubmodule.destination.segments':
    '資料夾唔可以有空白、目前目錄或者上層目錄嘅路徑段。',
  'ignoredSubmodule.destination.gitControlPath':
    '資料夾唔可以用 Git 控制目錄。',
  'ignoredSubmodule.destination.existingSubmodule':
    '資料夾同呢個 repo 現有嘅 submodule 重疊咗。',
  'ignoredSubmodule.destination.repositoryRoot':
    '資料夾唔可以係 repo 根目錄本身。',
  'ignoredSubmodule.destination.unsafeLink':
    '資料夾係 link、junction 或者掛載點，一律唔會跟落去。',
  'ignoredSubmodule.destination.occupied':
    '資料夾已經存在而且唔係空。請揀一個仲未存在嘅。',
  'ignoredSubmodule.destination.ignored':
    'Git 忽略咗呢個資料夾，所以佢載唔到 submodule。請揀一個唔會被 ignore 規則配對嘅資料夾。',
  'cheapLfs.pinFailures.title': '有啲大檔案未 pin 到',
  'cheapLfs.pinFailures.one':
    '{names} 會留喺 Changes；為免原裝大檔案入咗 commit，今次已經排除佢。其他揀咗嘅安全變更會照行；完成後再 commit 一次就會重試呢個檔案。',
  'cheapLfs.pinFailures.many':
    '{count} 個大檔案（{names}）會留喺 Changes，今次 commit 已經排除佢哋。其他揀咗嘅安全變更會照行；完成後再 commit 一次就會重試呢啲檔案。',
  'cheapLfs.pinFailures.manyOmitted':
    '{count} 個大檔案（{names}，仲有 {omitted} 個）會留喺 Changes，今次 commit 已經排除佢哋。其他揀咗嘅安全變更會照行；完成後再 commit 一次就會重試呢啲檔案。',
  'cheapLfs.pinFailures.reason': ' 原因：{reason}',
  'cheapLfs.pinFailures.reasonWithStatus': ' 原因：HTTP {status} — {reason}',
  'cheapLfs.alreadyStored.title': '有啲大檔案本身已經存好咗',
  'cheapLfs.alreadyStored.one':
    '{names} 冇入今次 commit：核對過佢啲 bytes 同 commit 咗嘅 pointer 指住嗰個大檔案一模一樣，所以冇再上載，而個 commit 本身已經有嗰個 pointer。',
  'cheapLfs.alreadyStored.many':
    '{count} 個大檔案（{names}）冇入今次 commit：核對過佢哋啲 bytes 同 commit 咗嘅 pointer 指住嗰啲大檔案一模一樣，所以冇再上載，而個 commit 本身已經有嗰啲 pointer。',
  'cheapLfs.alreadyStored.manyOmitted':
    '{count} 個大檔案（{names}，仲有 {omitted} 個）冇入今次 commit：核對過佢哋啲 bytes 同 commit 咗嘅 pointer 指住嗰啲大檔案一模一樣，所以冇再上載，而個 commit 本身已經有嗰啲 pointer。',
  'cheapLfs.firstPublish.noRepository':
    '呢個 repository 未連到 GitHub repository，冇 release 可以放大檔案。請先將 repository 發佈到 GitHub，然後再 commit 一次。',
  'cheapLfs.firstPublish.noRemote':
    '呢個 repository 冇 push remote，release 冇已發佈嘅 commit 可以掛住。請加返 remote 並發佈個 branch，然後再 commit 一次。',
  'cheapLfs.firstPublish.detachedHead':
    'HEAD 係 detached，建立 release 之前冇 branch 可以發佈。請先 check out 一個 branch，然後再 commit 一次。',
  'cheapLfs.firstPublish.unbornBranch':
    '呢個 branch 未有任何 commit，release 冇嘢可以指向。請先做一個普通嘅首個 commit，之後再 commit 大檔案。',
  'cheapLfs.firstPublish.publishFailed':
    '上載之前發佈唔到個 branch，所以 release 冇 commit 可以指向。請先發佈呢個 branch，然後再 commit 一次。',
  'cheapLfs.firstPublish.reasonWithDetail': '{reason} Git 報告：{detail}',
  'cheapLfs.firstPublish.abortTitle': 'Commit 已經停低，個 branch 未發佈到',
  'cheapLfs.unattendedEncryption.title': '自動 commit 冇 pin 到啲大檔案',
  'cheapLfs.unattendedEncryption.reason':
    'Windows Credential Manager 冇可用嘅已儲密碼。呢個檔案喺 working tree 原封不動、冇入 commit、冇加密、冇上載，亦冇建立 Release anchor。請人手重試輸入密碼，或喺 Repository settings > 大檔案同儲存 儲低。',
  'cheapLfs.unattendedEncryption.body.plain':
    'Windows Credential Manager 冇可用已儲密碼。冇加密、冇上載，亦冇建立 Release anchor。以下大檔案原封不動、冇入 commit：{names}（總共 {count} 個）。其他已揀變更仍可繼續。請人手重試，或喺 Repository settings > 大檔案同儲存 儲低。',
  'cheapLfs.unattendedEncryption.body.light':
    'Windows Credential Manager 冇可用已儲密碼，排程 commit 喺加密閘前停低。冇加密、冇上載，亦冇建立 Release anchor。原封不動、冇入 commit：{names}（總共 {count} 個）。其他變更仍可繼續。請人手重試，或喺 Repository settings > 大檔案同儲存 儲低密碼。',
  'cheapLfs.unattendedEncryption.body.playful':
    '排程 commit 喺 Windows Credential Manager 搵唔到可用已儲鎖匙，所以冇亂闖。冇加密、冇上載，亦冇建立 Release anchor。原封不動、冇入 commit：{names}（總共 {count} 個）。其他變更仍可繼續。請人手重試，或喺 Repository settings > 大檔案同儲存 儲低密碼。',
  'cheapLfs.unattendedEncryption.body.maximum':
    '排程 commit 敲 Windows Credential Manager 冇門，搵唔到可用已儲密碼，就唔亂估。冇加密、冇上載，亦冇建立 Release anchor。以下大檔原封不動、冇入 commit：{names}（總共 {count} 個）。其他變更仍可繼續。請人手重試，或喺 Repository settings > 大檔案同儲存 儲低密碼。',
  'cheapLfs.localState.pointer': '本機淨係擺住個 pointer',
  'cheapLfs.localState.materialized':
    '已經喺本機還原 · 同 commit 咗嘅 pointer 對得上',
  'cheapLfs.localState.modified':
    '本機內容改咗 · 下次 commit 會將佢當一件全新 release asset 上載。舊 pointer 指住嗰件 asset 唔會郁，所以舊 commit 一樣還原到自己嗰個版本。',
  'actionsMetadata.tooLarge.title': '有部分 GitHub Actions 資料略過咗',
  'actionsMetadata.tooLarge.body':
    'GitHub 一次過回覆嘅 Actions 資料多過本程式單次讀取上限，所以略過咗嗰項檢查。其他功能唔受影響，你唔使做任何嘢。',
  'actionsArtifacts.searchPlaceholder':
    '用名稱、workflow、branch 或 commit 篩 artifact…',
  'actionsArtifacts.searchAriaLabel': '篩 workflow artifact',
  'actionsArtifacts.regexTarget': 'Workflow artifact 清單',
  'actionsArtifacts.filterCount':
    '已載入 {loaded}/{total} 件 artifact · 而家見到 {visible} 件。',
  'actionsArtifacts.noMatches': '冇 workflow artifact 啱而家嘅篩選。',
  'commit.postCommitMaintenance.title': 'Commit 搞掂咗；維護要跟進',
  'commit.postCommitMaintenance.body':
    'Commit 已經成功建立，不過 Git 之後做維護嗰陣報錯。你可以安全 push，得閒先另外做 repository 維護。',
  'push.commitBatch.message': '自動 push 第 {current}/{total} 批',
  'push.commitBatch.completedTitle': '大型本機 push 已分批搞掂',
  'push.commitBatch.existingBody':
    '已經逐批 push 同核實 {count} 個現有本機 commit，之後先繼續。',
  'push.commitBatch.rewrittenBody':
    '已安全重整過大而只喺本機嘅歷史，再用非 force push 逐批 push 同核實 {count} 批。',
  'changesFilter.cheapLfsCandidates': 'Cheap LFS 候選檔案（>100 MiB）',
  'changesFilter.filtersAriaLabel': '變更篩選器',
  'workflowDispatch.searchPlaceholder': '打字搵 workflow，睇個名或者檔案…',
  'workflowDispatch.searchAriaLabel': '篩 workflow',
  'workflowDispatch.listAriaLabel': 'Workflow 清單',
  'workflowDispatch.empty': '未有任何 workflow。',
  'workflowDispatch.noMatches': '冇 workflow 啱而家嘅篩選。',
  'workflowDispatch.stateActive': '開緊',
  'workflowDispatch.stateDisabled': '停咗',
  'publish.organization.label': 'Organization／機構',
  'publish.organization.searchPlaceholder': '搜尋 organization…',
  'publish.organization.searchAriaLabel': '搜尋 organization',
  'publish.organization.listAriaLabel': 'Organization 清單',
  'publish.organization.none': 'None — 發佈去我個人帳戶',
  'publish.organization.resultCountOne': '搵到 1 個發佈目的地',
  'publish.organization.resultCountMany': '搵到 {count} 個發佈目的地',
  'publish.organization.noMatches': '冇發佈目的地啱而家嘅搜尋。',
  'publish.organization.selectedHint': '已揀',
  'publish.organization.regexErrorPrefix': 'Pattern 有問題：',
  'publish.organization.loadError':
    '載入唔到 organization；你仍然可以發佈去自己個人帳戶。',
  'publish.organization.retry': '重試載入 organization',
  'publish.authentication.signInAgain': '再次登入',
  'publish.authentication.signInAgainMessage':
    '你個 GitHub.com 登入被拒絕咗。再次登入，然後揀「發佈儲存庫」再試呢次發佈。',
  'settingsSearch.inputLabel': '搜尋設定',
  'settingsSearch.inputPlaceholder': '打字搵設定…',
  'settingsSearch.resultsHeading': '搜尋結果',
  'settingsSearch.noResults': '搵唔到啱「{query}」嘅設定。',
  'settingsSearch.resultCountOne': '搵到 1 項設定',
  'settingsSearch.resultCountMany': '搵到 {count} 項設定',
  'settingsSearch.inTab': '喺{tab}',
  'settingsSearch.clear': '清走搜尋',
  'settingsSearch.jumpHint': '撳 Enter 就跳去嗰個設定分頁。',
  'settingsSearch.tabName.accounts': '帳戶',
  'settingsSearch.tabName.integrations': '整合',
  'settingsSearch.tabName.copilot': 'Copilot',
  'settingsSearch.tabName.git': 'Git',
  'settingsSearch.tabName.appearance': '外觀',
  'settingsSearch.tabName.notifications': '通知',
  'settingsSearch.tabName.prompts': '提示',
  'settingsSearch.tabName.advanced': '進階',
  'settingsSearch.tabName.accessibility': '無障礙',
  'settingsSearch.tabName.agentAccess': '代理存取',
  'settingsSearch.tabName.selfHostedServer': '自託管伺服器',
  'settingsSearch.tabName.automation': '自動化',
  'settingsSearch.tabName.queue': 'Clone 隊列',
  'settingsSearch.tabName.sound': '聲音',
  'settingsSearch.tabName.ollama': 'Ollama 本地模型',
  'settingsSearch.tabName.attention': '專注與節奏調節',
  'settingsSearch.entry.attentionFocus.title': '專注',
  'settingsSearch.entry.attentionFocus.desc':
    '淡化冇郁緊嘅區域，但仍然保留全部內容。',
  'settingsSearch.entry.attentionLowStimulation.title': '低刺激',
  'settingsSearch.entry.attentionLowStimulation.desc':
    '減少非必要動畫、顏色強度同聲音。',
  'settingsSearch.entry.attentionTimeAwareness.title': '時間感知',
  'settingsSearch.entry.attentionTimeAwareness.desc':
    '顯示工作階段經過幾耐，同上次活動隔咗幾耐。',
  'settingsSearch.entry.attentionOneThing.title': '一次一件事',
  'settingsSearch.entry.attentionOneThing.desc':
    '保留一件由你揀嘅下一步。',
  'settingsSearch.entry.attentionMomentum.title': '動力提示',
  'settingsSearch.entry.attentionMomentum.desc':
    '冇活動一段時間後提示一下，仲可以延後。',
  'settingsSearch.tabName.ai': 'AI',
  'settingsSearch.entry.aiMasterSwitch.title': 'AI 總開關',
  'settingsSearch.entry.aiMasterSwitch.desc':
    '開關 AI 功能，仲可以揀邊個 provider 準用。',
  'settingsSearch.entry.aiRepositoryEligibility.title': 'Repository AI 資格',
  'settingsSearch.entry.aiRepositoryEligibility.desc':
    '設定 repository 預設可唔可以將 diff 送去 AI provider。',
  'settingsSearch.entry.accountsSignIn.title': '登入 GitHub',
  'settingsSearch.entry.accountsSignIn.desc':
    '喺 Desktop Material 加個 GitHub.com 帳戶。',
  'settingsSearch.entry.accountsEnterprise.title': '登入 GitHub Enterprise',
  'settingsSearch.entry.accountsEnterprise.desc':
    '駁埋你嘅 GitHub Enterprise Server 帳戶。',
  'settingsSearch.entry.copilotModels.title': 'Copilot 模型',
  'settingsSearch.entry.copilotModels.desc': '揀每個功能用邊個 AI 模型。',
  'settingsSearch.entry.copilotConflict.title': '用 Copilot 幫手解衝突',
  'settingsSearch.entry.copilotConflict.desc':
    '俾 Copilot 自動幫你處理 merge 衝突。',
  'settingsSearch.entry.ollamaManager.title': 'Ollama 本地模型',
  'settingsSearch.entry.ollamaManager.desc':
    '駁通 loopback Ollama 端點，之後就可以拉、睇、行同刪走本地模型。',
  'settingsSearch.entry.ollamaChat.title': 'Ollama 對話',
  'settingsSearch.entry.ollamaChat.desc':
    '唔使離開 Desktop Material，直接同本地 Ollama 模型傾偈。',
  'settingsSearch.entry.selfHostedServer.title': '自託管伺服器',
  'settingsSearch.entry.selfHostedServer.desc':
    '喺自己部機設定、加入同登入用 Docker 託管嘅團隊伺服器。',
  'settingsSearch.entry.gitGlobalIgnore.title': '全域忽略',
  'settingsSearch.entry.gitGlobalIgnore.desc':
    '編輯套用喺每個存放庫嘅忽略規則（core.excludesFile）。',
  'settingsSearch.entry.gitHooks.title': 'Git 掛鉤',
  'settingsSearch.entry.gitHooks.desc': 'pre-commit 等掛鉤嘅環境同快取設定。',
  'settingsSearch.entry.gitName.title': '名',
  'settingsSearch.entry.gitName.desc': '寫入 commit 嘅作者名。',
  'settingsSearch.entry.gitEmail.title': '電郵',
  'settingsSearch.entry.gitEmail.desc': '寫入 commit 嘅作者電郵。',
  'settingsSearch.entry.gitDefaultBranch.title': '預設分支',
  'settingsSearch.entry.gitDefaultBranch.desc':
    '開新 repository 時用嘅分支名。',
  'settingsSearch.entry.appearanceTheme.title': '主題',
  'settingsSearch.entry.appearanceTheme.desc': '喺淺色、深色同跟系統之間揀。',
  'settingsSearch.entry.appearanceAccent.title': '主色',
  'settingsSearch.entry.appearanceAccent.desc': '揀成個介面用嘅種子顏色。',
  'settingsSearch.entry.appearanceFont.title': '介面字體',
  'settingsSearch.entry.appearanceFont.desc': '揀介面字體、字型大細同粗幼。',
  'settingsSearch.entry.appearanceZoom.title': '縮放',
  'settingsSearch.entry.appearanceZoom.desc': '將成個介面放大或者縮細。',
  'settingsSearch.entry.notificationsErrorStyle.title': '錯誤顯示方式',
  'settingsSearch.entry.notificationsErrorStyle.desc':
    '錯誤用橫額定係對話框顯示。',
  'settingsSearch.entry.promptsDiscard.title': '捨棄改動前問一問',
  'settingsSearch.entry.promptsDiscard.desc': '捨棄未 commit 嘅改動前先確認。',
  'settingsSearch.entry.promptsForcePush.title': '強制 push 前問一問',
  'settingsSearch.entry.promptsForcePush.desc':
    '強制 push 去 remote 前先確認。',
  'settingsSearch.entry.promptsRemoveRepo.title': '移除 repository 前問一問',
  'settingsSearch.entry.promptsRemoveRepo.desc':
    '喺清單度移除 repository 前先確認。',
  'settingsSearch.entry.advancedOpenSSH.title': '用系統 OpenSSH',
  'settingsSearch.entry.advancedOpenSSH.desc':
    '用作業系統嘅 OpenSSH，唔用內附嗰個。',
  'settingsSearch.entry.accessibilityUnderline.title': '連結加底線',
  'settingsSearch.entry.accessibilityUnderline.desc':
    '成日俾連結加底線，易認啲。',
  'settingsSearch.entry.accessibilityDiffMarks.title': 'Diff 加符號',
  'settingsSearch.entry.accessibilityDiffMarks.desc':
    '喺 diff 度加 +/− 符號，唔淨係靠顏色。',
  'settingsSearch.entry.agentAccessServer.title': '代理存取伺服器',
  'settingsSearch.entry.agentAccessServer.desc':
    '俾本機代理同 MCP 工具駁到 Desktop Material。',
  'settingsSearch.entry.queueMode.desc':
    '隊列入面嘅 repository 一齊 clone 定逐個 clone。',
  'gitAutoFix.fixIt': '修復',
  'gitAutoFix.staleIndexLock.title': '版本庫俾鎖住咗',
  'gitAutoFix.staleIndexLock.summary':
    '有殘留嘅 index.lock 阻住 Git。如果冇 Git 程序行緊，可以移除呢個殘留鎖，再重試操作。',
  'gitAutoFix.staleIndexLock.action': '移除鎖檔',
  'gitAutoFix.autoGcRetry.title': '背景維護卡住咗',
  'gitAutoFix.autoGcRetry.summary':
    'Git 背景打包或者維護中斷咗今次操作。可以停用自動維護再重試。',
  'gitAutoFix.pushNonFastForward.title': '推送被拒（版本落後）',
  'gitAutoFix.pushNonFastForward.summary':
    '遠端有你本機未有嘅提交。用 fetch 加 rebase，或者 pull 整合返，再推送。系統永遠唔會自動強制推送。',
  'gitAutoFix.pushForbiddenGithubCli.title': '推送被拒（403）',
  'gitAutoFix.pushForbiddenGithubCli.summary':
    '遠端拒絕咗今次推送。Desktop 可以用你嘅 GitHub CLI 憑證重試一次，唔會轉 gh 用邊個帳戶。',
  'gitAutoFix.detachedHeadRescueBranch.title': '提交喺分離 HEAD 上面',
  'gitAutoFix.detachedHeadRescueBranch.summary':
    '呢個提交唔喺任何分支上面，有機會唔見咗。開一個救援分支保住佢。',
  'gitAutoFix.detachedHeadRescueBranch.action': '開救援分支',
  'gitAutoFix.unknown.title': 'Git 操作失敗',
  'gitAutoFix.unknown.summary':
    'Desktop 冇自動修復呢個錯誤。請睇詳情自行處理。',
  'gitAutoFix.unknown.action': '睇詳情',
  'gitAutoFix.rescueBranch.successTitle': '已建立救援分支',
  'gitAutoFix.rescueBranch.successBody': '你嘅提交已經保存喺 {branch}。',
  'gitAutoFix.rescueBranch.failureTitle': '建立救援分支失敗',
  'gitAutoFix.rescueBranch.failureBody': '建立唔到救援分支：{error}',
  'largeRepo.settings.title': '大型 repository 處理',
  'largeRepo.settings.autoDetect': '自動偵測大型 repository',
  'largeRepo.settings.autoDetectDescription':
    '超過 {files} 個檔案就會喺呢個 repository 嘅 Git 操作停埋背景 gc 同 maintenance，唔會俾長時間 repack 卡住 status、add、checkout 或 fetch。',
  'largeRepo.settings.autoRepack': '得閒就同大型 repository repack',
  'largeRepo.settings.autoRepackDescription':
    '揀個靜靜時做一次受控嘅 git repack，會有唔阻手嘅進度通知。',
  'largeRepo.status.computing': '查緊有冇本地改動…',
  'largeRepo.repack.progressTitle': '優化緊大型 repository',
  'largeRepo.repack.progressBody': '喺背景 repack 緊 {name}…',
  'largeRepo.repack.successTitle': 'Repository 優化好',
  'largeRepo.repack.successBody': '{name} 已經 repack 好。',
  'largeRepo.repack.failedTitle': '無法優化 repository',
  'largeRepo.repack.failedBody': 'Repack {name} 失敗：{error}',
  'largeRepo.lock.removedTitle': '已清走殘留鎖',
  'largeRepo.lock.removedBody':
    '繼續之前，已移除 {name} 入面殘留嘅 index.lock。',
  'largeRepo.missing.title': 'Repository 喺磁碟上搵唔到',
  'largeRepo.missing.body':
    '喺磁碟上搵唔到 {name}。背景更新已暫停。請定位資料夾，或者喺 Desktop Material 移除佢。',
  'largeRepo.missing.locate': '定位…',
  'largeRepo.missing.remove': '移除',
  'largeRepo.nestedGit.title': '搵到巢狀 Git repository',
  'largeRepo.nestedGit.body':
    '喺 {name} 入面搵到 {count} 個巢狀 .git 資料夾。要唔要壓縮成 {archive} 令 Git 快啲？',
  'largeRepo.nestedGit.confirm': '壓縮巢狀 repository',
  'largeRepo.nestedGit.cancel': '維持原狀',
  'settingsSearch.entry.largeRepoAutoDetect.title': '偵測大型 repository',
  'settingsSearch.entry.largeRepoAutoDetect.desc':
    '自動喺大 repository 停埋背景 gc 同 maintenance。',
  'settingsSearch.entry.largeRepoAutoRepack.title': 'Repack 大型 repository',
  'settingsSearch.entry.largeRepoAutoRepack.desc':
    '揀個靜靜時做一次受控 repack，有進度通知。',
  'accountFallback.searching': '幫緊你用其他已登入帳戶搵 {repository}⋯',
  'accountFallback.usingAccount': '用緊 {account}',
  'accountFallback.switchedTitle': '轉咗用另一個帳戶',
  'accountFallback.switchedBody': '{account} 睇到 {repository}，所以用咗佢。',
  'accountFallback.askTitle': '有另一個帳戶睇到呢個 repository',
  'accountFallback.askBody':
    '而家嘅帳戶搵唔到 {repository}，但係 {account} 睇到。',
  'accountFallback.askAction': '用 {account}',
  'accountFallback.notFoundTitle': '搵唔到 repository',
  'accountFallback.notFoundBody': '你所有已登入嘅帳戶都搵唔到 {repository}。',
  'accountFallback.notFoundNoAccounts':
    '搵唔到 {repository}，而呢個主機都冇第二個帳戶登入咗。',
  'accountFallback.triedAccounts': '試過嘅帳戶：{accounts}。',
  'shallowHistory.progress.label': '攞緊舊嘅歷史',
  'shallowHistory.progress.contacting': '聯絡緊遠端',
  'shallowHistory.progress.step': '{step}…',
  'shallowHistory.progress.detail': '{step}：{value} / {total}',
  'shallowHistory.progress.valueText': '{step}，做咗 {percent}%',
  'shallowHistory.progress.valueTextCounted':
    '{step}，{value} / {total}，做咗 {percent}%',
  'tagLifecycle.progressLabel': '標籤操作進度',
  'tagLifecycle.workingStatus': '做緊你審過嘅標籤操作…',
  'tagLifecycle.refreshingStatus': '刷新緊標籤清單…',
  'tagLifecycle.creatingStatus': '起緊本機標籤 {name}…',
  'tagLifecycle.movingStatus': '搬緊本機標籤 {name}…',
  'tagLifecycle.deletingLocalStatus': '刪緊本機標籤 {name}…',
  'tagLifecycle.pushingStatus': 'Push 緊標籤 {name}…',
  'tagLifecycle.pushingAllStatus': 'Push 緊 {count} 個本機標籤…',
  'tagLifecycle.fetchingStatus': '由 {remote} fetch 緊標籤…',
  'tagLifecycle.fetchingPrunedStatus': '由 {remote} fetch 同清理緊標籤…',
  'tagLifecycle.deletingRemoteStatus': '刪緊遠端標籤 {name}…',
  'remoteManager.applyProgressLabel': '套用緊 remote 改動',
  'remoteManager.applyProgressStatus':
    '套用緊第 {index} / {total} 項 remote 改動…',
  'remoteManager.applyProgressPreparing': '讀緊而家嘅 remote 佈局…',
  'bulkBranchDelete.progressLabel': '刪緊分支',
  'bulkBranchDelete.progressStatus': '刪咗 {completed} / {total} 個分支…',
  'bulkBranchDelete.progressCurrent': '刪緊 {name}…',
  'subtree.splitProgressLabel': 'Subtree 歷史分拆進度',
  'subtree.splitProgressCommits': '重寫咗 {processed} / {total} 個 commit',
  'bisect.progressLabel': 'Bisect 步驟進度',
  'bisect.progressStarting': '開緊 bisect 會話…',
  'bisect.progressMarking': '記低判斷，跟住 checkout 下一個 commit…',
  'bisect.progressResetting': '收緊尾，幫你還原返原本個分支…',
  'bisect.progressLogLabel': 'Bisect 指令輸出',
  'commitRewrite.progressLabel': '重寫緊 commit',
  'commitRewrite.progressStatus':
    '重播緊第 {index} / {total} 個 commit：{summary}',
  'commitRewrite.progressPreparing': '準備緊重寫次序…',
  'commit.maintenance.repacking': '批次做完，repack 緊個 repository…',
  'commit.maintenance.repackingLabel': 'Repository repack 進度',
  'ollama.manager.operationProgressLabel': 'Ollama 操作進度',
  'ollama.manager.operationLoading': '載入緊 {model} 入記憶體…',
  'ollama.manager.operationUnloading': '由記憶體卸載緊 {model}…',
  'ollama.manager.operationDeleting': '刪緊 {model}…',
  'ollama.manager.operationCopying': '複製緊 {model}…',
  'ollama.manager.operationRenaming': '改緊 {model} 個名…',
  'ollama.manager.operationCancelled': '模型操作已經停咗。',
  'addRepositories.progressLabel': '加緊 repository',
  'addRepositories.progressStatus': '加緊 {name} — 第 {index} / {total} 個',
  'notificationCentre.bulkProgressLabel': '通知整理進度',
  'notificationCentre.bulkProgressStatus':
    '處理咗 {completed} / {total} 個通知…',
  'notificationCentre.clearAllProgressStatus':
    '標記緊 {completed} / {total} 個通知做完…',
  'cheapLfs.stage.hashingLabel': '計 hash 進度',
  'cheapLfs.stage.hashingStatus': '計緊 {path} 嘅 hash…',
  'cheapLfs.stage.releaseLabel': 'Release 準備進度',
  'cheapLfs.stage.releaseStatus': '準備緊 release 空位…',
  'cheapLfs.restore.label': '還原緊大檔案',
  'cheapLfs.restore.status': '還原緊大檔案 — {files} 個檔案，傳咗 {bytes}',
  'cheapLfs.restore.cancel': '停止還原',
  'cheapLfs.restore.canceling': '停緊…',
  'cheapLfs.restore.collapse': '收埋還原進度詳情',
  'cheapLfs.restore.expand': '展開還原進度詳情',
  'cheapLfs.restore.title': '大檔案還原實況',
  'cheapLfs.restore.sectionLabel': '{repository} 嘅大檔案還原進度',
  'cheapLfs.restore.summary':
    '還原咗 {percent}% · 搞掂 {succeeded} · 失手 {failed} · 仲有 {remaining}',
  'cheapLfs.restore.progressLabel': '大檔案整體還原進度',
  'cheapLfs.restore.progressValueText':
    '還原咗 {processed} / {total}，即係 {percent}%；成功 {succeeded}，失敗 {failed}，仲有 {remaining}',
  'cheapLfs.restore.filesLabel': '檔案',
  'cheapLfs.restore.filesValue':
    '成功 {succeeded} · 失敗 {failed} · 仲有 {remaining} · 合共 {total}',
  'cheapLfs.restore.logicalBytesLabel': '原檔數據',
  'cheapLfs.restore.logicalBytesValue': '{processed} / {total}',
  'cheapLfs.restore.actualBytesLabel': '實際網絡下載',
  'cheapLfs.restore.downloadWithTotal': '{downloaded} / {total}',
  'cheapLfs.restore.downloadWithoutTotal':
    '下載咗 {downloaded} · provider 未報總數',
  'cheapLfs.restore.downloadTotalOnly': '總數 {total} · 等緊第一批 bytes',
  'cheapLfs.restore.notReported': '呢個 provider 未有報數',
  'cheapLfs.restore.rateLabel': '下載速度',
  'cheapLfs.restore.rateValue': '{rate}',
  'cheapLfs.restore.ratePending': '量度緊…',
  'cheapLfs.restore.etaLabel': '預計仲要',
  'cheapLfs.restore.etaPending': '計緊…',
  'cheapLfs.restore.elapsedLabel': '已用時間',
  'cheapLfs.restore.queueLabel': '等候隊列',
  'cheapLfs.restore.queueValue': '{files} 個檔案 · {parts} 個 parts',
  'cheapLfs.restore.lookAheadStarts':
    '呢條下載線一到正正 {percent}% 就開下一條，唔使呆等。',
  'cheapLfs.restore.lookAheadStarting':
    '呢條下載線到咗 {percent}%；開緊下一條下載線…',
  'cheapLfs.restore.lookAheadActive':
    '下一條下載線已經開跑 — 正正 {percent}% 嗰陣起步。',
  'cheapLfs.restore.lookAheadBoundary':
    '預先下載界線：{percent}% · 而家冇其他檔案排隊。',
  'cheapLfs.restore.currentLane': '而家還原緊',
  'cheapLfs.restore.prefetchLane': '下一條下載線',
  'cheapLfs.restore.laneGroupLabel': '{lane}：{path}',
  'cheapLfs.restore.laneFile': '檔案 {current}/{total}',
  'cheapLfs.restore.lanePart': 'Part {current}/{total}',
  'cheapLfs.restore.laneProgressLabel': '{path} 嘅下載進度',
  'cheapLfs.restore.laneValueText':
    '{path} 下載咗 {processed} / {total}，即係 {percent}%',
  'cheapLfs.restore.laneValueIndeterminate':
    '{path} 下載咗 {processed}；provider 未報總數',
  'cheapLfs.restore.laneBytes': '{processed} / {total}',
  'cheapLfs.restore.laneBytesWithoutTotal': '下載咗 {processed}',
  'cheapLfs.restore.laneWaiting': '等緊 provider 開第一條下載線…',
  'cheapLfs.restore.pathUnavailable': '未有檔案路徑',
  'cheapLfs.restore.failuresLabel': '還原失敗',
  'cheapLfs.restore.failureReason': '原因：{reason}',
  'cheapLfs.restore.failureReasonWithStatus': 'HTTP {status} · 原因：{reason}',
  'cheapLfs.restore.failureUnknown': 'Provider 冇報失敗原因。',
  'cheapLfs.restore.failuresOmitted': '仲有 {count} 個失敗未顯示。',
  'cheapLfs.restore.providerBadge': 'Provider：{provider}',
  'cheapLfs.restore.phaseBadge': '階段：{phase}',
  'cheapLfs.restore.provider.githubRelease': 'GitHub Releases',
  'cheapLfs.restore.provider.ghcr': 'GHCR',
  'cheapLfs.restore.provider.dockerHub': 'Docker Hub',
  'cheapLfs.restore.provider.mixed': '混合 providers',
  'cheapLfs.restore.provider.unknown': '等緊 provider',
  'cheapLfs.restore.phase.preparing': '準備緊',
  'cheapLfs.restore.phase.downloading': '下載緊',
  'cheapLfs.restore.phase.decompressing': '解壓緊',
  'cheapLfs.restore.phase.decrypting': '解密緊',
  'cheapLfs.restore.phase.decrypting.plain': '解密緊',
  'cheapLfs.restore.phase.decrypting.light': '安全解密緊',
  'cheapLfs.restore.phase.decrypting.playful': '幫啲加密資料解密緊',
  'cheapLfs.restore.phase.decrypting.maximum': '氹緊啲密文開口講嘢',
  'cheapLfs.restore.phase.verifying': '核實緊',
  'cheapLfs.restore.phase.materializing': '還原緊',
  'cheapLfs.restore.phase.canceling': '停緊',
  'batchClone.finalizingLabel': '執緊 clone 完嘅 repository',
  'batchClone.finalizingStatus': '登記緊第 {index} / {total} 個 repository…',
  'batchClone.restoringStatus': '還原緊 {name} 入面嘅大檔案…',
  'accounts.metadataReadFailed':
    'Desktop Material 讀唔到已儲存嘅帳戶資料，可能要重新登入一次。',
  'accounts.metadataRepaired':
    'Desktop Material 修復咗有問題嘅帳戶資料，可能要重新登入一次。',
  'accounts.metadataWriteFailed':
    'Desktop Material 儲存唔到帳戶資料。喺呢個視窗入面，啲帳戶仲用得。',
  'accounts.keychainLocked':
    '{app} 存唔到 {login} 嘅登入權杖入 keychain。請確認已經解鎖「login」keychain，然後重新登入一次。',
  'accounts.tokenWriteFailed':
    'Desktop Material 儲存唔到 {login} 嘅登入權杖，所以個帳戶未加到入去。請重新登入一次。（{error}）',
  'accounts.credentialUnavailable':
    'Desktop Material 讀唔到 {logins} 已儲存嘅登入權杖。請重新登入一次，先可以用返呢啲帳戶。',
  'accounts.picker.label': '帳戶',
  'accounts.picker.choose': '揀一個帳戶',
  'accounts.picker.close': '關閉帳戶選擇器',
  'accounts.picker.title': '帳戶 · {host}',
  'accounts.picker.searchLabel': '搜尋帳戶',
  'accounts.picker.searchPlaceholder': '按名稱、登入名稱或主機搜尋帳戶',
  'accounts.picker.countOne': '{count} 個已登入帳戶',
  'accounts.picker.countMany': '{count} 個已登入帳戶',
  'accounts.picker.matchCount': '{total} 個帳戶入面有 {matched} 個啱',
  'accounts.picker.noAccounts': '冇已登入帳戶。',
  'accounts.picker.noMatch': '冇帳戶啱「{query}」。',
  'accounts.picker.add': '新增另一個帳戶',
  'repositoryTransfer.importTitle': '匯入 repository 清單',
  'repositoryTransfer.exportTitle': '匯出 repository 清單',
  'repositoryTransfer.chooseList': '揀一個 repository 清單檔案匯入。',
  'repositoryTransfer.fileFilterName': 'Repository 清單',
  'repositoryTransfer.chooseFile': '揀檔案…',
  'repositoryTransfer.changeFile': '更改…',
  'repositoryTransfer.baseDirectory': '基礎資料夾',
  'repositoryTransfer.baseDirectoryPlaceholder': 'Clone 目的地',
  'repositoryTransfer.chooseDirectory': '揀資料夾…',
  'repositoryTransfer.cloneMode': 'Clone 模式：',
  'repositoryTransfer.parallel': '平行進行',
  'repositoryTransfer.sequential': '逐個進行',
  'repositoryTransfer.selectedOne': '揀咗 {selected} 個，共 {total} 個',
  'repositoryTransfer.selectedMany': '揀咗 {selected} 個，共 {total} 個',
  'repositoryTransfer.selectAtLeastOne': '至少揀一個 repository。',
  'repositoryTransfer.chooseBaseDirectory': '揀一個基礎資料夾。',
  'repositoryTransfer.invalidList':
    '呢個檔案唔係有效嘅 repository 清單匯出檔。',
  'repositoryTransfer.selectForImport': '揀 {url} 匯入',
  'repositoryTransfer.alreadyCloned': '已經 clone 咗',
  'repositoryTransfer.cloneOne': 'Clone {count} 個 repository',
  'repositoryTransfer.cloneMany': 'Clone {count} 個 repository',
  'repositoryTransfer.exportIntro':
    '只會匯出 remote URL；本機路徑同帳戶權杖永遠唔會寫入檔案。',
  'repositoryTransfer.noRemote': '冇可攜式 remote URL，所以唔可以匯出',
  'repositoryTransfer.skippedOne':
    '有 1 個 repository 冇可攜式 remote URL，會略過。',
  'repositoryTransfer.skippedMany':
    '有 {count} 個 repository 冇可攜式 remote URL，會略過。',
  'repositoryTransfer.selectForExport': '揀 {name} 匯出',
  'repositoryTransfer.exportOne': '匯出 {count} 個 repository',
  'repositoryTransfer.exportMany': '匯出 {count} 個 repository',
  'accounts.invalidatedTokenTitle': '帳戶權杖已經失效',
  'accounts.invalidatedTokenTitleDarwin': '帳戶權杖已經失效',
  'accounts.invalidatedTokenBody':
    '{endpoint} 上面 {login} 嘅登入權杖已經失效，所以呢個帳戶已經登出咗。',
  'accounts.invalidatedTokenOthersKept':
    '你喺 {endpoint} 嘅其他帳戶仍然登入緊。',
  'accounts.invalidatedTokenPrompt': '要唔要用返 {login} 重新登入？',
  'accounts.invalidatedTokenSignIn': '重新登入',
  'accounts.invalidatedTokenLater': '暫時唔使',
  'dateRange.from': '由',
  'dateRange.to': '到',
  'dateRange.presetsLabel': '常用日期範圍',
  'dateRange.calendarLabel': '揀個日期範圍',
  'dateRange.month': '月份',
  'dateRange.year': '年份',
  'dateRange.previousMonth': '上個月',
  'dateRange.nextMonth': '下個月',
  'dateRange.preset.all': '全部時間',
  'dateRange.preset.last7': '最近 7 日',
  'dateRange.preset.last30': '最近 30 日',
  'dateRange.preset.last90': '最近 90 日',
  'dateRange.preset.thisYear': '今年',
  'dateRange.preset.lastYear': '舊年',
  'dateRange.error.incomplete': '打多幾個字，個日期未夠完整。',
  'dateRange.error.outOfRange': '嗰個月冇呢一日喎。',
  'dateRange.error.unrecognized':
    '請用 YYYY-MM-DD，或者跟住下面提示嘅日期次序。',
  'changelog.title': '版本更新紀錄',
  'changelog.searchPlaceholder': '搵勻所有版本',
  'changelog.searchLabel': '搜尋版本更新紀錄',
  'changelog.dateFilter': '日期',
  'changelog.dateFilterActive': '日期：{range}',
  'changelog.openCommit': '喺網頁開返 commit {commit} 睇下',
  'changelog.categories': '分類',
  'changelog.categoryAll': '全部',
  'changelog.uncategorized': '冇分類',
  'changelog.copy': '複製',
  'changelog.copied': '已經複製咗 {count} 個版本落剪貼簿。',
  'changelog.export': '匯出',
  'changelog.exportMarkdown': '匯出做 Markdown…',
  'changelog.exportText': '匯出做純文字…',
  'changelog.exported': '已經將 {count} 個版本匯出去 {path}。',
  'changelog.exportFailed': '寫唔到份匯出檔：{error}',
  'changelog.copyFailed': '複製唔到落剪貼簿：{error}',
  'changelog.reset': '清走篩選',
  'changelog.close': '閂咗佢',
  'changelog.showMore': '再睇多 {count} 個',
  'changelog.currentVersion': '你而家行緊呢個版本',
  'changelog.dateUnrecorded': '冇記低日期',
  'changelog.noChanges': '呢個版本冇記低任何改動。',
  'changelog.includeUndated': '連冇記低日期嘅版本一齊計',
  'changelog.undatedHidden': '收埋咗 {count} 個版本：佢哋冇 tag 記低日期。',
  'changelog.summary.plain':
    '{total} 個版本入面顯示 {releases} 個，{entries} 條紀錄。',
  'changelog.summary.light':
    '{total} 個版本入面睇緊 {releases} 個，總共 {entries} 條紀錄。',
  'changelog.summary.playful':
    '喺 {total} 個版本度掘咗 {releases} 個出嚟，{entries} 條紀錄任你睇。',
  'changelog.summary.maximum':
    '喺 {total} 個版本嘅倉底捧咗 {releases} 個出嚟，{entries} 條紀錄抹到閃令令任你慢慢睇。',
  'changelog.empty.plain': '冇版本夾到而家嘅篩選條件。',
  'changelog.empty.light': '呢啲條件之下，乜都搵唔到。',
  'changelog.empty.playful': '一個都夾唔到，今鋪篩選贏咗。',
  'changelog.empty.maximum':
    '一個版本都闖唔過呢啲篩選條件，篩選今鋪完勝，歷史今日放假。',
  'docsBrowser.title': '功能說明書',
  'docsBrowser.close': '閂咗說明書',
  'docsBrowser.searchPlaceholder': '搵標題同內文',
  'docsBrowser.searchField': '說明書',
  'docsBrowser.categoriesLabel': '說明書分類',
  'docsBrowser.categoryAll': '全部分類',
  'docsBrowser.category.agentApi': 'Agent API',
  'docsBrowser.category.collaboration': '協作',
  'docsBrowser.category.designSystem': '設計系統',
  'docsBrowser.category.identityAndWorkspace': '身分同工作區',
  'docsBrowser.category.integrations': '整合',
  'docsBrowser.category.linuxTui': 'Linux TUI',
  'docsBrowser.category.qualityAndReliability': '品質同可靠度',
  'docsBrowser.category.repositoryManagement': '存放庫管理',
  'docsBrowser.category.reviewAndDiff': '審閱同 diff',
  'docsBrowser.category.root': '總覽',
  'docsBrowser.listLabel': '功能文章',
  'docsBrowser.articleLabel': '說明書文章：{title}',
  'docsBrowser.sourcePath': '來源：{path}',
  'docsBrowser.selectArticle': '揀「{title}」',
  'docsBrowser.selectionCount': '揀咗 {count} 篇',
  'docsBrowser.selectAllMatches': '揀晒夾到嘅 {count} 篇文章',
  'docsBrowser.selectAllArticles': '揀晒全部 {count} 篇文章',
  'docsBrowser.invertSelection': '反轉揀選',
  'docsBrowser.clearSelection': '清走揀選',
  'docsBrowser.selectionHint':
    '撳空白鍵揀住個焦點文章，撳住 Shift 再 click 就揀一段，Ctrl+A 揀晒清單入面全部。',
  'docsBrowser.export': '匯出',
  'docsBrowser.exportMenuLabel': '匯出揀咗嘅文章',
  'docsBrowser.exportMarkdown': '匯出做 Markdown',
  'docsBrowser.exportText': '匯出做純文字',
  'docsBrowser.exportJson': '匯出做 JSON',
  'docsBrowser.exported': '已經匯出 {count} 篇文章去 {path}。',
  'docsBrowser.exportFailed': '今次冇寫到匯出檔案：{message}',
  'docsBrowser.exportEmpty': '最少揀一篇文章先可以匯出。',
  'docsBrowser.deleteLabel': '刪除',
  'docsBrowser.deleteUnavailable':
    '呢啲文章係跟住個 app 一齊入面嚟，只可以讀，所以冇嘢刪得。想留底就匯出揀咗嗰啲啦。',
  'docsBrowser.linkUnbundled':
    '個連結指去 {path}，但係嗰個唔係內置嘅功能文章之一。',
  'docsBrowser.linkSection':
    '個連結指去你而家睇緊呢篇文章嘅「{section}」嗰段。',
  'docsBrowser.linkOpened': '已經開咗「{title}」。',
  'docsBrowser.linkUnreadable': '呢個連結讀唔到：{href}',
  'docsBrowser.linkExternal': '而家用你部瀏覽器開 {href}。',
  'docsBrowser.searchInvalid': '呢個 pattern 冇搵到嘢做：{message}',
  'docsBrowser.resetSearch': '清走搜尋',
  'docsBrowser.offlineNote':
    '全部文章都係跟住呢個 build 入面，唔使上網下載，斷晒網一樣睇得。',
  'docsBrowser.summary.plain': '{total} 篇文章入面顯示 {shown} 篇。',
  'docsBrowser.summary.light': '{total} 篇文章入面而家睇緊 {shown} 篇。',
  'docsBrowser.summary.playful':
    '喺 {total} 篇文章度捉咗 {shown} 篇出嚟排好隊等你睇。',
  'docsBrowser.summary.maximum':
    '喺 {total} 篇文章嘅書架度捧咗 {shown} 篇出嚟，抹到閃令令排定隊等你翻。',
  'docsBrowser.empty.plain': '冇文章夾到 {query}。',
  'docsBrowser.empty.light': '成本說明書都冇嘢夾到 {query}。',
  'docsBrowser.empty.playful': '一篇文章都唔認識 {query} 呢樣嘢。',
  'docsBrowser.empty.maximum':
    '每篇文章都摷晒個袋，冇一篇聽過 {query} 呢個名。',
  'palette.docsBrowser': '揭功能說明書',
  'palette.docsBrowserDescription':
    '開內置嘅離線說明書，成套功能文章都係跟住個 app 入面，唔使上網。',
  'commandPalette.groupDocumentation': '說明書',
  'dimSum.region': '點心驚喜',
  'dimSum.dismiss': '收起點心驚喜',
  'dimSum.romanization': '讀做 {jyutping}',
  'dimSum.title.plain': '點心驚喜',
  'dimSum.title.light': '推車經過，落咗一籠',
  'dimSum.title.playful': '點心車推到你枱邊',
  'dimSum.title.maximum': '架推車今日揀咗你',
  'dimSum.lead.plain': '大約每 10 次開機有 1 次會有點心。呢張卡會自己收埋。',
  'dimSum.lead.light':
    '大約每 10 次開機得 1 次有得食。呢張卡自己會走，你照做嘢得㗎喇。',
  'dimSum.lead.playful':
    '10 次開機先中 1 次，今次連食嘅都有埋。佢自己會收，唔使趕住食。',
  'dimSum.lead.maximum':
    '開 10 次 app 先有 1 次有嘢食，今次畀你抽中咗。張卡自己會收——不過啲點心係像素嚟，食唔落肚，見諒。',
  'contextMenu.filterPlaceholder': '篩走用唔著嘅動作',
  'contextMenu.filterLabel': '篩選選單動作',
  'contextMenu.empty': '搵唔到夾得上嘅動作',
  'contextMenu.shortcut': '快捷鍵 {keys}',
  'contextMenu.cut': '剪下',
  'contextMenu.copy': '複製',
  'contextMenu.paste': '貼上',
  'contextMenu.selectAll': '全選',
  'filter.mode.fuzzy': '模糊配對',
  'filter.mode.substring': '包含文字',
  'filter.mode.regex': '正則表達式',
  'filter.mode.cycleLabel': '配對模式：{mode}（撳一下轉模式）',
  'filter.case.match': '分大小寫',
  'filter.regexBuilder.open': '打開正則表達式砌法器',
  'filter.regexBuilder.label': '正則表達式砌法器',
  'filter.regexBuilder.literalCategory': '純文字',
  'filter.regexBuilder.literalField': '要一字不差搵到嘅文字',
  'filter.regexBuilder.literalPlaceholder': '例如 c++',
  'filter.regexBuilder.literalInsert': '加入做純文字',
  'filter.regexBuilder.literalPreview': '會加入',
  'branch.filter.notUpdatedWith': '未追齊 {branch}',
  'regex.builder.viewsLabel': '正則表達式砌法器檢視',
  'regex.builder.view.build': '砌樣式',
  'regex.builder.view.guide': '正則表達式點運作',
  'regex.builder.title': '正則表達式砌法器',
  'regex.builder.description':
    '用積木砌出樣式，即場試清楚，再套用到「{target}」搜尋。',
  'regex.builder.close': '關閉',
  'regex.builder.patternLabel': '正則表達式樣式',
  'regex.builder.patternPlaceholder': '樣式',
  'regex.builder.deleteLast': '刪除最後一個字元',
  'regex.builder.clear': '清除樣式',
  'regex.builder.flag.ignoreCase': '唔分大小寫',
  'regex.builder.cancel': '取消',
  'regex.builder.apply': '套用到「{target}」',
  'regex.builder.categoriesLabel': '正則表達式積木分類',
  'regex.builder.category.anchors': '定位符',
  'regex.builder.category.characterClasses': '字元類別',
  'regex.builder.category.quantifiers': '數量詞',
  'regex.builder.category.groups': '群組',
  'regex.builder.category.alternation': '二揀一',
  'regex.builder.token.start': '搜尋項目開頭',
  'regex.builder.token.end': '搜尋項目結尾',
  'regex.builder.token.wordBoundary': '字詞邊界',
  'regex.builder.token.nonBoundary': '非字詞邊界',
  'regex.builder.token.anyCharacter': '任何字元',
  'regex.builder.token.digit': '數字',
  'regex.builder.token.nonDigit': '非數字',
  'regex.builder.token.wordCharacter': '字詞字元',
  'regex.builder.token.nonWordCharacter': '非字詞字元',
  'regex.builder.token.whitespace': '空白字元',
  'regex.builder.token.nonWhitespace': '非空白字元',
  'regex.builder.token.anyOf': 'a、b、c 其中一個',
  'regex.builder.token.noneOf': '唔係 a、b 或 c',
  'regex.builder.token.range': '一段範圍',
  'regex.builder.token.tab': 'Tab 字元',
  'regex.builder.token.zeroOrMore': '零次或以上',
  'regex.builder.token.oneOrMore': '一次或以上',
  'regex.builder.token.optional': '有都得冇都得',
  'regex.builder.token.exactlyThree': '啱啱 3 次',
  'regex.builder.token.twoOrMore': '2 次或以上',
  'regex.builder.token.betweenTwoAndFive': '2 至 5 次',
  'regex.builder.token.lazyZeroOrMore': '慳住搶嘅零次或以上',
  'regex.builder.token.lazyOneOrMore': '慳住搶嘅一次或以上',
  'regex.builder.token.capturingGroup': '擷取群組',
  'regex.builder.token.nonCapturingGroup': '非擷取群組',
  'regex.builder.token.namedGroup': '有名群組',
  'regex.builder.token.or': '或者',
  'regex.builder.token.aOrB': 'a 或者 b',
  'regex.builder.guide.matching.title': '配對點運作',
  'regex.builder.guide.matching.body':
    'Desktop Material 用線性時間嘅 RE2 引擎，由左至右掃文字，亦唔會因為災難性回溯而卡死。你自己寫嘅搜尋樣式唔會凍結 renderer；只要成個樣式喺文字其中一處成立，就算配對成功。',
  'regex.builder.guide.matching.note':
    '— 普通字元會配對自己；呢個樣式會喺任何位置搵到「material」',
  'regex.builder.guide.anchors.title': '定位符釘實位置',
  'regex.builder.guide.anchors.body':
    '定位符配對位置，唔係字元。^ 代表每個搜尋項目開頭，$ 代表結尾，\\b 係字詞字元同其他字元之間嘅邊界，\\B 就係唔屬於邊界嘅位置。',
  'regex.builder.guide.anchors.note': '— 路徑由 app/ 開頭，而且以 .scss 結尾',
  'regex.builder.guide.classes.title': '字元類別',
  'regex.builder.guide.classes.body':
    '字元類別會由一組字元入面配對啱啱一個：\\d 係數字、\\w 係字詞字元、\\s 係空白，而 . 係任何字元。方括號可以自砌集合；[a-z] 係範圍，[^abc] 嘅意思係除咗 a、b、c 之外嘅字元。',
  'regex.builder.guide.classes.note':
    '— 啱啱七個十六進制字元，即係短版 commit SHA',
  'regex.builder.guide.quantifiers.title': '數量詞同貪心配對',
  'regex.builder.guide.quantifiers.body':
    '數量詞會重複前面嘅積木：* 係零次或以上，+ 係一次或以上，? 係可有可無，{n,m} 係 n 至 m 次。預設會貪心咁盡量攞多啲文字；後面加 ? 就會變懶惰，夠用即停。',
  'regex.builder.guide.quantifiers.note':
    '— 懶惰配對：逐段配對引號字串，唔會一啖吞晒',
  'regex.builder.guide.groups.title': '群組同擷取',
  'regex.builder.guide.groups.body':
    '括號會擷取配對到嘅內容。(?:…) 只分組但唔擷取，(?<name>…) 就會俾擷取結果一個易明嘅名。RE2 會拒絕反向引用同環視，因為佢哋守唔到線性時間安全保證。',
  'regex.builder.guide.groups.note': '— 將 app 或 docs 擷取做名為 area 嘅內容',
  'regex.builder.guide.alternation.title': '二揀一',
  'regex.builder.guide.alternation.body':
    '直線 | 代表「或者」。配合群組就可以限制範圍：gr(a|e)y 可以配對 gray 同 grey；冇群組嘅話，| 會將成個樣式斬開兩邊。',
  'regex.builder.guide.alternation.note': '— 以 .scss、.ts 或 .tsx 結尾嘅檔案',
  'regex.builder.guide.flags.title': '旗標改變規則',
  'regex.builder.guide.flags.body':
    'i 旗標會忽略大小寫，並同搜尋列嘅「分大小寫」控制保持同步。Desktop Material 會安全咁列舉配對，亦會用支援 Unicode 嘅 RE2 語意，所以唔會顯示只屬於 JavaScript、但唔支援嘅旗標。',
  'regex.builder.guide.usage.title': 'Desktop Material 點用正則表達式',
  'regex.builder.guide.usage.body':
    'App 入面每個搜尋列都有 .* 切換掣，可以由純文字轉做安全 RE2 配對。無效或者唔支援嘅樣式會顯示本地化錯誤，修好之前唔會過濾任何項目。砌法器會測試「套用」真正交返畀搜尋列嘅同一個樣式同大小寫模式。',
  'regex.error.patternTooLong': '樣式太長，最多只可以有 {max} 個字元。',
  'regex.error.inputTooLong':
    '搜尋文字太長，未能安全評估（最多 {max} 個字元）。',
  'regex.error.invalidOrUnsupported': '安全 RE2 樣式無效或者唔支援：{detail}',
  'regex.error.unknown': '未知嘅正則表達式錯誤',
  'regex.test.capture.unmatched': '未配對',
  'regex.test.capture.empty': '空白',
  'regex.test.capture.truncated': '{value}…（原本 {count} 個字元）',
  'regex.test.capture.groupLabel': '第一次配對嘅擷取群組',
  'regex.test.capture.heading': '擷取群組',
  'regex.test.capture.more': '仲有 {count} 個',
  'regex.test.status.invalid': '樣式無效',
  'regex.test.status.oneMatch': '{count} 個配對',
  'regex.test.status.matches': '{count} 個配對',
  'regex.test.heading': '測試',
  'regex.test.sampleLabel': '用嚟測試正則表達式嘅範例文字',
  'agentSessions.sidebarLabel': 'Repository 側欄',
  'agentSessions.listTab': '清單',
  'agentSessions.agentsTab': '代理',
  'agentSessions.worktrees': '工作樹',
  'agentSessions.newSession': '新增代理工作階段',
  'agentSessions.empty': '未有工作樹。新增一個就可以開始代理工作階段。',
  'agentSessions.locked': '已鎖定',
  'agentSessions.missing': '路徑遺失',
  'agentSessions.detachedAt': '分離於 ',
  'agentSessions.onBranch': '位於分支 ',
  'agentSessions.options': '選項',
  'agentSessions.baseBranch': '基礎分支',
  'agentSessions.codingAgent': '程式代理',
  'agentSessions.taskLabel': '交畀代理嘅工作',
  'agentSessions.taskPlaceholder': '代理要喺呢棵工作樹做乜？',
  'agentSessions.configureSetup': '設定準備指令',
  'agentSessions.setup.title': '準備指令',
  'agentSessions.setup.description':
    '請逐項覆核執行檔同每個獨立參數。Git 建好工作樹之後，已啟用指令會依次執行，全部成功先至啟動程式代理。',
  'agentSessions.setup.count.none': '未設定準備指令',
  'agentSessions.setup.count.one': '已設定 1 條準備指令',
  'agentSessions.setup.count.some': '已設定 {count} 條準備指令',
  'agentSessions.setup.count.unavailable': '準備指令暫時不可用',
  'agentSessions.setup.unavailable':
    '未能安全讀取準備指令。請恢復本機儲存權限先再開始。',
  'agentSessions.setup.retryPlan.all':
    '呢棵已保留工作樹會重試全部已啟用準備指令。',
  'agentSessions.setup.retryPlan.one':
    '會略過 1 條內容無變而且已完成嘅指令，再由下一條已覆核指令繼續。',
  'agentSessions.setup.retryPlan.some':
    '會略過 {count} 條內容無變而且已完成嘅指令，再由下一條已覆核指令繼續。',
  'agentSessions.setup.retryPlan.restart':
    '全部已啟用準備指令會由第一條重新執行。',
  'agentSessions.setup.restart': '由第一條重新執行準備指令',
  'agentSessions.setup.commandLabel': '指令 {count}',
  'agentSessions.setup.enabled': '執行呢條指令',
  'agentSessions.setup.executable': '執行檔',
  'agentSessions.setup.argumentLabel': '參數 {count}',
  'agentSessions.setup.removeArgument': '移除參數 {count}',
  'agentSessions.setup.addArgument': '加入參數',
  'agentSessions.setup.moveUp': '將指令 {count} 上移',
  'agentSessions.setup.moveDown': '將指令 {count} 下移',
  'agentSessions.setup.removeCommand': '移除指令 {count}',
  'agentSessions.setup.addCommand': '加入指令',
  'agentSessions.setup.save': '儲存準備指令',
  'agentSessions.setup.cancelRun': '取消準備',
  'agentSessions.setup.problem.tooManyCommands':
    '最多保留 {count} 條準備指令。',
  'agentSessions.setup.problem.missingArgument':
    '指令 {command} 至少要有一個非空白參數。',
  'agentSessions.setup.problem.emptyArgument':
    '指令 {command} 嘅參數 {argument} 唔可以留空。',
  'agentSessions.setup.problem.tooManyArguments':
    '指令 {command} 最多可以有 {count} 個參數。',
  'agentSessions.setup.problem.argumentTooLong':
    '指令 {command} 嘅參數 {argument} 太長。',
  'agentSessions.setup.problem.credential':
    '指令 {command} 嘅參數 {argument} 似係憑證。準備指令唔會儲存秘密。',
  'agentSessions.setup.problem.cwdOverride':
    '指令 {command} 嘅參數 {argument} 會離開已覆核嘅工作樹目錄。',
  'agentSessions.setup.problem.commandString':
    '指令 {command} 嘅參數 {argument} 會直接執行指令字串；請改用腳本檔案。',
  'agentSessions.setup.problem.unsafeArgument':
    '指令 {command} 嘅參數 {argument} 包含唔支援嘅 shell、展開或控制語法。',
  'agentSessions.setup.problem.saveFailed':
    '未能儲存準備指令；原有清單保持不變。',
  'agentSessions.worktreeName': '工作樹名稱',
  'agentSessions.cancel': '取消',
  'agentSessions.start': '開始',
  'agentSessions.agent.none': '<無>',
  'agentSessions.agent.notDetected': '{name} — 未偵測到',
  'agentSessions.agent.notAuthenticated': '{name} — 需要先完成登入驗證',
  'agentSessions.noneHint': '<無> 會先跑已設定嘅準備指令，但唔會啟動程式代理。',
  'agentSessions.problem.nameEmpty': '請輸入新工作樹名稱。',
  'agentSessions.problem.nameTooLong': '請用 {count} 個字元或以下。',
  'agentSessions.problem.nameSeparator': '工作樹名稱唔可以包含路徑分隔符號。',
  'agentSessions.problem.nameIllegal':
    'Git 唔接受呢個名稱。請避開空格、控制字元、~ ^ : ? * [ \\ 同連續句點。',
  'agentSessions.problem.nameReserved': '{name} 係 Windows 保留裝置名稱。',
  'agentSessions.problem.duplicateWorktree': '已經有一棵叫 {name} 嘅工作樹。',
  'agentSessions.problem.duplicateBranch': '已經有一條叫 {name} 嘅分支。',
  'agentSessions.problem.baseEmpty': '請揀基礎分支。',
  'agentSessions.problem.baseUnknown': '{branch} 唔係呢個 repository 嘅分支。',
  'agentSessions.problem.agentUnavailable': '呢個程式代理喺此電腦未能執行。',
  'agentSessions.problem.promptEmpty': '請描述代理工作，或者揀 <無>。',
  'agentSessions.problem.promptTooLong': '請用 {count} 個字元或以下。',
  'agentSessions.status.errorLabel': '出錯',
  'agentSessions.status.failed': '{name} 執行失敗',
  'agentSessions.status.failedWithReason': '{name} 執行失敗：{reason}',
  'agentSessions.status.workingLabel': '處理中',
  'agentSessions.status.working': '{name} 處理中',
  'agentSessions.status.workingEdited': '{name} 處理中，已改 {files}',
  'agentSessions.status.oneFile': '1 個檔案',
  'agentSessions.status.files': '{count} 個檔案',
  'agentSessions.status.oneLine': '1 行',
  'agentSessions.status.lines': '{count} 行',
  'agentSessions.status.diff':
    '{name} 新增 {added}、刪除 {deleted}，涉及 {files}',
  'agentSessions.status.notMeasuredLabel': '未量度',
  'agentSessions.status.notMeasured': '{name} 暫時未量度變更',
  'agentSessions.status.noChangesLabel': '冇變更',
  'agentSessions.status.noChanges': '{name} 冇變更',
  'agentSessions.notification.unavailableTitle': '代理工作階段已不可用',
  'agentSessions.notification.unavailableBody':
    '{name} 已經唔係已登記工作樹。請重新整理 repository 再試。',
  'agentSessions.notification.invalidTitle': '代理工作階段要求無效',
  'agentSessions.notification.createFailedTitle': '未能新增代理工作階段',
  'agentSessions.notification.createdTitle': '代理工作階段已新增',
  'agentSessions.notification.createdBody':
    '{name} 已準備好；今次冇啟動程式代理。',
  'agentSessions.notification.finishedTitle': '代理工作階段已完成',
  'agentSessions.notification.finishedBody':
    '{agent} 已經喺 {name} 完成。整合變更之前，請先檢查工作樹。',
  'agentSessions.notification.endedTitle': '{agent} 已退出',
  'agentSessions.notification.endedBody':
    '{agent} 已經喺 {name} 正常退出。整合變更之前，請檢查工作樹並確認工作結果。',
  'agentSessions.notification.failedTitle': '代理工作階段失敗',
  'agentSessions.notification.failedBody': '{name}：{error}',
  'agentSessions.notification.runnerCouldNotStart': '{agent} 未能正常啟動。',
  'agentSessions.notification.runnerExitedWithCode':
    '{agent} 以代碼 {code} 退出。',
  'agentSessions.notification.setupSaveFailedTitle': '未能儲存準備指令',
  'agentSessions.notification.setupSaveFailedBody':
    '呢個 repository 嘅已覆核清單保持不變。請檢查本機儲存權限再試。',
  'agentSessions.notification.setupLoadFailedTitle': '未能讀取準備指令',
  'agentSessions.notification.setupLoadFailedBody':
    '未有新增工作樹。請恢復本機儲存權限、覆核呢個 repository 嘅準備清單，再試一次。',
  'agentSessions.notification.setupRetryUnavailableTitle': '未能重試工作樹準備',
  'agentSessions.notification.setupRetryUnavailableBody':
    '已保留嘅 {name} 已經唔再符合原本連結工作樹路徑同分支。未有執行準備指令。請先檢查現有工作樹，再決定係咪新增替代品。',
  'agentSessions.notification.setupVerificationFailedTitle':
    '未能驗證工作樹準備',
  'agentSessions.notification.setupVerificationFailedBody':
    '已保留 {name}，但未能驗證佢嘅連結路徑同分支。未有執行準備指令或啟動程式代理。請重新整理 repository 再重試。',
  'agentSessions.notification.setupFailedTitle': '工作樹準備失敗',
  'agentSessions.notification.setupFailedBody':
    '已保留 {name}。指令 {command} 未完成：{reason} 請覆核準備清單，再揀「開始」重試。',
  'agentSessions.notification.setupFailedBeforeRunBody':
    '已保留 {name}。準備程序未有啟動：{reason} 請覆核準備清單，再揀「開始」重試。',
  'agentSessions.notification.setupFailedAfterRunBody':
    '已保留 {name}。有 {count} 條準備指令完成，但最後工作樹驗證失敗：{reason} 請先檢查工作樹再重試。',
  'agentSessions.notification.setupCancelledTitle': '已取消工作樹準備',
  'agentSessions.notification.setupCancelledBody':
    '已保留 {name}。請覆核準備清單，再揀「開始」重試，棵樹唔會走佬。',
  'agentSessions.setup.failure.invalidRequest': '已覆核指令清單無效。',
  'agentSessions.setup.failure.worktreeUnavailable': 'Git 工作樹不可用。',
  'agentSessions.setup.failure.executableUnavailable':
    '揀選嘅原生執行檔不可用。',
  'agentSessions.setup.failure.spawnFailed': '未能啟動揀選嘅執行檔。',
  'agentSessions.setup.failure.exitCode': '執行檔傳回非零退出代碼。',
  'agentSessions.setup.failure.timeout': '已超過固定執行時限。',
  'agentSessions.setup.failure.outputLimit': '已超過固定私人輸出上限。',
  'repositorySigning.title': 'Commit 同 tag 簽署',
  'repositorySigning.hubDescription':
    '檢查同覆核呢個 repository 或全域嘅 commit 同 annotated tag 簽署政策。',
  'repositorySigning.shortcutLabel': '簽署政策捷徑',
  'repositorySigning.cardTitle': '管理簽署政策',
  'repositorySigning.intro':
    '檢查公開簽署設定、揀呢個 repository 或全域預設，並安全驗證 HEAD 或 annotated tag；原始驗證器輸出唔會顯示。',
  'repositorySigning.summaryTitle': '目前生效嘅簽署政策',
  'repositorySigning.notInspected': '未檢查',
  'repositorySigning.keyLabel': '簽署金鑰',
  'repositorySigning.notConfigured': '未設定',
  'repositorySigning.commitLabel': 'Commit 簽署',
  'repositorySigning.tagLabel': 'Tag 簽署',
  'repositorySigning.enabled': '已啟用',
  'repositorySigning.disabled': '已停用',
  'repositorySigning.scopeLabel': '設定範圍',
  'repositorySigning.scope.local': '呢個 repository',
  'repositorySigning.scope.global': '所有 repository',
  'repositorySigning.formatLabel': '簽署格式',
  'repositorySigning.replacementKeyLabel': '替代公開金鑰',
  'repositorySigning.replacementKeyHelp':
    '留空會保留目前金鑰。OpenPGP 同 X.509 接受公開 fingerprint；SSH 接受 inline key:: public key。私人金鑰路徑同註解會被拒絕。如果已設定金鑰後改格式，必須提供相容嘅替代金鑰。',
  'repositorySigning.signCommits': '預設簽署 commit',
  'repositorySigning.signTags': '預設簽署 annotated tag',
  'repositorySigning.reviewAction': '覆核簽署設定',
  'repositorySigning.reviewTitle': '套用呢啲簽署設定？',
  'repositorySigning.review.scope': '範圍',
  'repositorySigning.review.format': '格式',
  'repositorySigning.review.publicKey': '公開金鑰',
  'repositorySigning.review.preserveKey': '保留目前金鑰',
  'repositorySigning.review.replaceKey': '換成已覆核嘅公開識別碼',
  'repositorySigning.review.defaults': 'Commit / tag 預設',
  'repositorySigning.review.commitOn': 'Commit 開啟',
  'repositorySigning.review.commitOff': 'Commit 關閉',
  'repositorySigning.review.tagOn': 'tag 開啟',
  'repositorySigning.review.tagOff': 'tag 關閉',
  'repositorySigning.review.description':
    '執行固定 Git 設定更新前，系統會再檢查所選範圍。私人金鑰資料、簽署程式同 allowed-signers 路徑一律唔會讀取或顯示。',
  'repositorySigning.applyAction': '套用簽署設定',
  'repositorySigning.goBack': '返回',
  'repositorySigning.verificationTitle': '安全簽署驗證',
  'repositorySigning.verifyHead': '驗證 HEAD commit',
  'repositorySigning.loadTags': '載入 annotated tag',
  'repositorySigning.annotatedTag': 'Annotated tag',
  'repositorySigning.verifyTag': '驗證所選 tag',
  'repositorySigning.result.target': '目標',
  'repositorySigning.result.state': '狀態',
  'repositorySigning.result.signer': '簽署者',
  'repositorySigning.result.notReported': '未有報告',
  'repositorySigning.inspectAction': '檢查簽署設定',
  'repositorySigning.inspectAgainAction': '再次檢查簽署設定',
  'repositorySigning.cancelAction': '取消簽署操作',
  'repositorySigning.status.idle': '請先檢查簽署設定，再作更改。',
  'repositorySigning.status.cancelledPartial':
    '簽署操作已取消。部分已覆核設定可能已經套用；請再次檢查目前狀態。',
  'repositorySigning.status.cancelledClean':
    '簽署操作已取消，未有開始任何已覆核簽署更新。',
  'repositorySigning.status.inspected': '簽署設定已安全檢查。',
  'repositorySigning.status.noTags': '未有 annotated tag 可供驗證。',
  'repositorySigning.status.loadedTags': '已載入 {count} 個 annotated {noun}。',
  'repositorySigning.status.updatedRefreshing':
    '簽署設定已更新，正重新整理 repository 狀態…',
  'repositorySigning.status.applying':
    '正套用第 {index} 項已覆核簽署設定，共 {total} 項…',
  'repositorySigning.status.verification': '{target}：{state}。',
  'repositorySigning.status.failedPartial': '簽署更新未有完整完成。',
  'repositorySigning.status.failedSafe': '簽署操作已安全停止。',
  'repositorySigning.status.inspecting': '正檢查 repository 簽署設定…',
  'repositorySigning.status.review': '套用前請覆核確實嘅簽署設定。',
  'repositorySigning.status.rechecking': '套用前正再次檢查簽署設定…',
  'repositorySigning.status.verifyingHead': '正檢查 HEAD commit 簽署…',
  'repositorySigning.status.loadingTags': '正載入有限量 annotated-tag 資料…',
  'repositorySigning.status.verifyingTag': '正檢查 {tag} tag 簽署…',
  'repositorySigning.status.cancelling': '正取消簽署操作…',
  'repositorySigning.status.changeAgain': '請更改簽署設定，或者再次覆核。',
  'repositorySigning.error.start': '未能安全啟動簽署操作。',
  'repositorySigning.error.tooMuchData':
    'Git 傳回嘅簽署資料太多，未能安全覆核。',
  'repositorySigning.error.gitFailed': 'Git 未能完成有限量簽署操作。',
  'repositorySigning.error.configChanged':
    '簽署設定喺覆核後有變。請再次檢查同覆核。',
  'repositorySigning.error.tagUnavailable':
    '已覆核嘅 annotated tag 已經唔再可用。',
  'repositorySigning.error.tagChanged':
    'Annotated tag 喺揀選後有變。請重新載入 tag 再驗證。',
  'repositorySigning.error.unexpectedState': '簽署操作進入咗非預期狀態。',
  'repositorySigning.error.reviewUnavailable': '已覆核嘅簽署更新已經唔再可用。',
  'repositorySigning.error.inspectFirst': '覆核前請先檢查簽署設定。',
  'repositorySigning.error.formatNeedsKey':
    '已有金鑰時更改簽署格式，必須提供相容嘅替代公開金鑰。',
  'repositorySigning.error.prepare': '未能安全準備簽署更新。',
  'repositorySigning.error.cancel': '未能取消簽署操作。',
  'repositorySigning.error.partial':
    '{detail} 部分已覆核設定可能已經套用；再次更新前請重新檢查簽署設定。',
  'repositorySigning.error.detail': '{detail}',
  'repositorySigning.grade.good': '簽署有效',
  'repositorySigning.grade.bad': '簽署無效',
  'repositorySigning.grade.goodUnknownValidity': '密碼學上有效；信任狀態未知',
  'repositorySigning.grade.expiredSignature': '簽署有效，但建立時已過期',
  'repositorySigning.grade.expiredKey': '簽署有效，但使用咗已過期金鑰',
  'repositorySigning.grade.revokedKey': '簽署有效，但使用咗已撤銷金鑰',
  'repositorySigning.grade.cannotVerify': '未能檢查簽署',
  'repositorySigning.grade.unsigned': '未簽署',
  'repositorySigning.grade.unknown': '簽署狀態未知',
  'md3.search.clear': '清走「{field}」入面打咗嘅字',
  'md3.search.regexMode': '「{field}」嘅 regex 模式',
  'md3.search.regexBuilder': '「{field}」嘅 regex 建立器',
  'md3.search.hits': '{count} 個命中',
  'md3.chip.filterBy': '用「{label}」篩選',
  'md3.emptyState.resetFilters': '重設篩選',
  'md3.regexBuilder.title': 'Regex 建立器 — {target}',
  'md3.regexBuilder.close': '閂咗 regex 建立器',
  'md3.regexBuilder.patternLabel': '正則表達式 pattern',
  'md3.regexBuilder.patternPlaceholder': '樣式',
  'md3.regexBuilder.flagsLabel': '正則表達式旗標',
  'md3.regexBuilder.flagToggle': '旗標 {flag} — {name}',
  'md3.regexBuilder.flag.i': '唔理大細楷',
  'md3.regexBuilder.flag.g': '全域',
  'md3.regexBuilder.flag.m': '多行',
  'md3.regexBuilder.flag.s': '點號包埋換行',
  'md3.regexBuilder.flag.u': 'Unicode',
  'md3.regexBuilder.flag.y': '黐住開頭',
  'md3.regexBuilder.group.anchors': '錨點',
  'md3.regexBuilder.group.classes': '字元類',
  'md3.regexBuilder.group.quantifiers': '數量詞',
  'md3.regexBuilder.group.groups': '分組同邏輯',
  'md3.regexBuilder.token.insert': '插入 {token} — {label}',
  'md3.regexBuilder.token.start': '開頭',
  'md3.regexBuilder.token.end': '結尾',
  'md3.regexBuilder.token.wordBoundary': '字詞邊界',
  'md3.regexBuilder.token.word': '字詞字元',
  'md3.regexBuilder.token.digit': '數字',
  'md3.regexBuilder.token.space': '空白',
  'md3.regexBuilder.token.charRange': '範圍',
  'md3.regexBuilder.token.notX': '唔係 x',
  'md3.regexBuilder.token.any': '任何字元',
  'md3.regexBuilder.token.oneOrMore': '一個或以上',
  'md3.regexBuilder.token.zeroOrMore': '零個或以上',
  'md3.regexBuilder.token.optional': '可有可無',
  'md3.regexBuilder.token.repeatRange': '範圍',
  'md3.regexBuilder.token.capture': '捕捉',
  'md3.regexBuilder.token.nonCapture': '唔捕捉',
  'md3.regexBuilder.token.either': '二揀一',
  'md3.regexBuilder.token.lookahead': '向前望',
  'md3.regexBuilder.token.lookbehind': '向後望',
  'md3.regexBuilder.group.escapes': '轉義同 Unicode',
  'md3.regexBuilder.group.lazy': '最少數量詞',
  'md3.regexBuilder.group.references': '回引同斷言',
  'md3.regexBuilder.token.notWordBoundary': '唔係字詞邊界',
  'md3.regexBuilder.token.notWord': '非字詞字元',
  'md3.regexBuilder.token.notDigit': '非數字',
  'md3.regexBuilder.token.notSpace': '非空白',
  'md3.regexBuilder.token.tab': 'Tab 位',
  'md3.regexBuilder.token.newline': '換行',
  'md3.regexBuilder.token.carriageReturn': '回車',
  'md3.regexBuilder.token.hexEscape': '十六進位字元',
  'md3.regexBuilder.token.unicodeEscape': '編碼單位',
  'md3.regexBuilder.token.unicodePoint': '碼位（要 u）',
  'md3.regexBuilder.token.unicodeLetter': '任何字母（要 u）',
  'md3.regexBuilder.token.unicodeNumber': '任何數字（要 u）',
  'md3.regexBuilder.token.unicodeScript': '漢字（要 u）',
  'md3.regexBuilder.token.lazyOneOrMore': '一個或以上，最少',
  'md3.regexBuilder.token.lazyZeroOrMore': '零個或以上，最少',
  'md3.regexBuilder.token.lazyOptional': '可有可無，最少',
  'md3.regexBuilder.token.lazyRepeatRange': '重複範圍，最少',
  'md3.regexBuilder.token.exactly': '啱啱三次',
  'md3.regexBuilder.token.atLeast': '兩次或以上',
  'md3.regexBuilder.token.namedCapture': '具名擷取',
  'md3.regexBuilder.token.namedBackreference': '具名回引',
  'md3.regexBuilder.token.backreference': '回引第一組',
  'md3.regexBuilder.token.negativeLookahead': '否定向前望',
  'md3.regexBuilder.token.negativeLookbehind': '否定向後望',
  'md3.regexBuilder.tester': '即時測試',
  'md3.regexBuilder.testLabel': '測試字串',
  'md3.regexBuilder.result.idle': '打個 pattern 嚟試下先。',
  'md3.regexBuilder.result.match': '命中：「{text}」',
  'md3.regexBuilder.result.matchWithGroups': '命中：「{text}」· 分組：{groups}',
  'md3.regexBuilder.result.noMatch': '測試字串入面搵唔到。',
  'md3.regexBuilder.result.invalid': 'Pattern 有問題：{message}',
  'md3.regexBuilder.apply': '套用去搜尋',
  'md3.regexBuilder.applyName': '套用去搜尋 {target}',
  'md3.regexBuilder.clear': '清走',
  'md3.regexBuilder.clearName': '清走個 pattern',
  'md3.regexBuilder.guide': '教學',
  'md3.regexBuilder.guideName': '教學：regex 點運作',
  'md3.regexBuilder.guideHeading': 'Regex 點運作',
  'md3.menu.filterPlaceholder': '搵下呢度嘅動作',
  'md3.menu.hint.active': '用緊',
  'md3.menu.hint.on': '開',
  'md3.menu.hint.off': '閂',
  'md3.menu.hint.ask': '問過先',
  'md3.menu.hint.current': '而家用緊',
  'md3.menu.hint.anchor': '錨點',
  'md3.menu.hint.class': '字元類',
  'md3.menu.hint.quantifier': '數量詞',
  'md3.menu.hint.group': '分組',
  'md3.menu.hint.alternation': '交替',
  'md3.menu.hint.flags': '旗標',
  'md3.menu.theme.dark': '深色',
  'md3.menu.theme.light': '淺色',
  'md3.menuOverlay.close': '閂咗佢',
  'md3.menuOverlay.itemsLabel': '{title} 嘅動作',
  'md3.menuOverlay.noMatches': '{title} 入面冇嘢配到你打嘅字。',
  'md3.menuOverlay.clearFilter': '清走個篩選',
  'md3.menuOverlay.invalidPattern':
    '呢個仲未係有效嘅正規表達式，所以乜都冇篩到。',
  'md3.menu.palette.title': '指令面板',
  'md3.menu.palette.placeholder': '打個指令',
  'md3.menu.palette.commitPushAll': 'Commit 晒所有改動再 push',
  'md3.menu.palette.fetchOrigin': '去 origin 攞更新',
  'md3.menu.palette.pullAll': 'Pull 晒所有 repository',
  'md3.menu.palette.mergeAll': '將所有 branch merge 入 {branch}',
  'md3.menu.palette.openRegexBuilder': '開 regex 建立器',
  'md3.menu.palette.goRepositories': '去 Repositories',
  'md3.menu.palette.goChanges': '去 Changes',
  'md3.menu.palette.goHistory': '去 History',
  'md3.menu.palette.goActions': '去 GitHub Actions',
  'md3.menu.palette.openSettings': '開設定',
  'md3.menu.settings.title': '設定',
  'md3.menu.settings.placeholder': '搵設定',
  'md3.menu.settings.appearance': '外觀 — 主題、強調色、介面縮放',
  'md3.menu.settings.absoluteDates': '絕對嘅 commit 日期',
  'md3.menu.settings.automation': '自動化 — 自動 commit & push、自動 pull',
  'md3.menu.settings.accounts': '帳戶 — GitHub、自架 GitLab',
  'md3.menu.settings.copilot': 'Copilot 偏好設定',
  'md3.menu.settings.undoHistory': '還原記錄管理員',
  'md3.menu.settings.git': 'Git — 名、電郵、預設 branch',
  'md3.menu.settings.integrations': '整合 — 編輯器、shell、終端機',
  'md3.menu.settings.notifications': '通知同聲音',
  'md3.menu.account.title': '帳戶',
  'md3.menu.account.entry': '{name} — {host}',
  'md3.menu.account.addGitHub': '加個 GitHub 帳戶',
  'md3.menu.account.addGitLab': '加自架 GitLab（endpoint + token）',
  'md3.menu.repoMenu.title': '轉 repository',
  'md3.menu.repoMenu.placeholder': '篩 repository',
  'md3.menu.repoMenu.entry': '{name} — {org}',
  'md3.menu.repoMenu.browseAll': '睇晒所有 repository',
  'md3.menu.branchMenu.title': '轉 branch',
  'md3.menu.branchMenu.placeholder': '篩 branch',
  'md3.menu.branchMenu.browseAll': '睇晒所有 branch',
  'md3.menu.paneMenu.title': 'Repository 動作',
  'md3.menu.paneMenu.commitPushCopilot': '用 Copilot 寫嘅訊息 commit & push',
  'md3.menu.paneMenu.pullOrigin': '由 origin 拉落嚟',
  'md3.menu.paneMenu.forcePush': '強制 push',
  'md3.menu.paneMenu.buildAndRun': 'Build 完就行',
  'md3.menu.paneMenu.mergeAll': 'Merge 晒所有 branch',
  'md3.menu.paneMenu.openInTerminal': '喺終端機度開',
  'md3.menu.paneMenu.repositorySettings': 'Repository 設定',
  'md3.menu.listMenu.title': 'Commit 清單',
  'md3.menu.listMenu.newestFirst': '最新排頭先',
  'md3.menu.listMenu.oldestFirst': '最舊排頭先',
  'md3.menu.listMenu.groupByDay': '按日分組',
  'md3.menu.listMenu.showGraph': '顯示 commit 圖',
  'md3.menu.listMenu.selectMultiple': '揀多過一個 commit',
  'md3.menu.diffOptions.title': 'Diff 選項',
  'md3.menu.diffOptions.unified': '統一 diff',
  'md3.menu.diffOptions.split': '分欄 diff',
  'md3.menu.diffOptions.wrap': '長行自動換行',
  'md3.menu.diffOptions.hideWhitespace': '收起空白改動',
  'md3.menu.diffOptions.moreContext': '多啲 context 行',
  'md3.menu.fileMenu.title': '檔案動作',
  'md3.menu.fileMenu.openInEditor': '喺外部編輯器開',
  'md3.menu.fileMenu.copyPath': '複製檔案路徑',
  'md3.menu.fileMenu.fileHistory': '檔案歷史',
  'md3.menu.fileMenu.blame': '逐行追溯',
  'md3.menu.fileMenu.discardChanges': '掉咗啲改動',
  'md3.menu.fileMenu.ignoreFile': '忽略呢個檔案',
  'md3.menu.rowMenu.title': '{sha} — commit 動作',
  'md3.menu.rowMenu.revert': 'Revert 呢個 commit',
  'md3.menu.rowMenu.cherryPick': 'Cherry-pick 去第個 branch…',
  'md3.menu.rowMenu.createTag': '喺呢度開個 tag…',
  'md3.menu.rowMenu.reset': 'Reset 返去呢個 commit…',
  'md3.menu.rowMenu.copySha': '複製 SHA',
  'md3.menu.rowMenu.viewOnGitHub': '去 GitHub 睇',
  'md3.menu.changesMenu.title': '改咗嘅檔案',
  'md3.menu.changesMenu.includeAll': '全部檔案都要',
  'md3.menu.changesMenu.excludeAll': '全部檔案都唔要',
  'md3.menu.changesMenu.stashAll': 'Stash 晒所有改動',
  'md3.menu.changesMenu.discardAll': '掉晒所有改動…',
  'md3.menu.changesMenu.groupByFolder': '按資料夾分組',
  'md3.menu.changeRowMenu.title': '檔案動作',
  'md3.menu.changeRowMenu.discardChanges': '掉咗啲改動',
  'md3.menu.changeRowMenu.ignoreFile': '忽略呢個檔案',
  'md3.menu.changeRowMenu.ignoreType': '忽略晒呢類檔案',
  'md3.menu.changeRowMenu.reveal': '喺檔案總管度顯示',
  'md3.menu.changeRowMenu.openInEditor': '喺外部編輯器開',
  'md3.menu.branchRowMenu.title': 'Branch 動作',
  'md3.menu.branchRowMenu.mergeInto': 'Merge 入 {branch}',
  'md3.menu.branchRowMenu.rebaseOnto': 'Rebase 落 {branch}',
  'md3.menu.branchRowMenu.openPullRequest': '開 pull request',
  'md3.menu.branchRowMenu.rename': '改 branch 個名…',
  'md3.menu.branchRowMenu.delete': '刪咗個 branch…',
  'md3.menu.runMenu.title': '工作流程執行',
  'md3.menu.runMenu.rerunAll': '重跑晒所有 job',
  'md3.menu.runMenu.rerunFailed': '重跑失敗嗰啲 job',
  'md3.menu.runMenu.cancel': '取消呢個 run',
  'md3.menu.runMenu.dispatch': '行 workflow（workflow_dispatch）…',
  'md3.menu.runMenu.rawLogs': '睇原始 log',
  'md3.menu.repoRowMenu.title': 'Repository 動作',
  'md3.menu.repoRowMenu.fetch': '攞更新',
  'md3.menu.repoRowMenu.pull': '拉落嚟',
  'md3.menu.repoRowMenu.changeAlias': '改個別名…',
  'md3.menu.repoRowMenu.moveToGroup': '搬去第個群組…',
  'md3.menu.repoRowMenu.reveal': '喺檔案總管度顯示',
  'md3.menu.repoRowMenu.remove': '喺清單度攞走…',
  'md3.menu.compose.title': '新 commit',
  'md3.menu.compose.openComposer': '開 commit 編寫器',
  'md3.menu.compose.copilotMessage': '叫 Copilot 幫手寫段訊息',
  'md3.menu.compose.addCoAuthors': '加 co-author',
  'md3.menu.compose.commitAndPush': 'Commit 完就 push',
  'md3.menu.agentAccess.title': 'Agent 權限',
  'md3.menu.agentAccess.readAccess': '容許讀取 working tree',
  'md3.menu.agentAccess.commits': '容許 commit',
  'md3.menu.agentAccess.push': '容許 push',
  'md3.menu.agentAccess.sessionLog': '工作階段紀錄',
  'md3.menu.inboxRowMenu.title': '通知',
  'md3.menu.inboxRowMenu.markRead': '標做已讀',
  'md3.menu.inboxRowMenu.markUnread': '標做未讀',
  'md3.menu.inboxRowMenu.openInBrowser': '喺瀏覽器開',
  'md3.menu.inboxRowMenu.mute': '靜音呢條 thread',
  'md3.menu.inboxRowMenu.delete': '刪咗個通知',
  'md3.menu.agentRowMenu.title': '代理工作階段',
  'md3.menu.agentRowMenu.resume': '繼續個 session',
  'md3.menu.agentRowMenu.pause': '暫停個 session',
  'md3.menu.agentRowMenu.openLog': '開 session log',
  'md3.menu.agentRowMenu.duplicate': '複製個 session',
  'md3.menu.agentRowMenu.access': 'Agent 權限…',
  'md3.menu.agentRowMenu.delete': '刪咗個 session',
  'md3.menu.terminalMenu.title': '終端機',
  'md3.menu.terminalMenu.copy': '複製揀咗嘅嘢',
  'md3.menu.terminalMenu.paste': '貼上',
  'md3.menu.terminalMenu.clear': '清走啲輸出',
  'md3.menu.terminalMenu.split': '分開個 shell',
  'md3.menu.terminalMenu.openSystem': '喺系統終端機開',
  'md3.menu.terminalMenu.newShell': '開個新 shell session',
  'md3.menu.drawerMenu.title': '導覽',
  'md3.menu.drawerMenu.collapse': '收埋側欄',
  'md3.menu.drawerMenu.expand': '打開側欄',
  'md3.menu.drawerMenu.goRepositories': '去 Repositories',
  'md3.menu.drawerMenu.goChanges': '去 Changes',
  'md3.menu.drawerMenu.goHistory': '去 History',
  'md3.menu.drawerMenu.goBranches': '去 Branches',
  'md3.menu.drawerMenu.goActions': '去 Actions',
  'md3.menu.drawerMenu.goInbox': '去 Inbox',
  'md3.menu.drawerMenu.goTerminal': '去 Terminal',
  'md3.menu.drawerMenu.goAgents': '去 Agents',
  'md3.menu.searchMenu.title': '搜尋欄',
  'md3.menu.searchMenu.openBuilder': '開 regex 建立器',
  'md3.menu.searchMenu.toggleRegex': '切換 regex 模式',
  'md3.menu.searchMenu.clearField': '清走呢欄',
  'md3.menu.searchMenu.howRegexWorks': 'Regex 點用',
  'md3.menu.guide.title': 'Regex 點用',
  'md3.menu.guide.caret': '^ 將配對錨定喺行頭',
  'md3.menu.guide.dollar': '$ 將配對錨定喺行尾',
  'md3.menu.guide.classes': '\\d 配任何數字，\\w 配任何字詞字元',
  'md3.menu.guide.quantifiers': '+ 係一個或以上，* 係零個或以上，? 係可有可無',
  'md3.menu.guide.groups': '(…) 會擷取一組，(?:…) 淨係分組唔擷取',
  'md3.menu.guide.alternation': 'a|b 兩邊邊個配到都算',
  'md3.menu.guide.flags': '旗標：i g m s u y — 大小寫、全域、多行、dotall',
  'md3.appHeader.label': '應用程式頂欄',
  'md3.appHeader.menu': '選單',
  'md3.appHeader.commitAndPush': 'Commit ＆ 推上去',
  'md3.appHeader.commitAndPushHint': 'Commit 完順手推上去',
  'md3.appHeader.searchPlaceholder': '搵 commit、檔案、branch、repository',
  'md3.appHeader.searchField': '全域搜尋',
  'md3.appHeader.commandPalette': '命令面板（{shortcut}）',
  'md3.appHeader.notifications': '通知中心',
  'md3.appHeader.notificationsUnread': '通知中心，有 {count} 個未睇',
  'md3.appHeader.unreadBadge': '{count} 個未睇嘅通知',
  'md3.appHeader.theme': '淺色／深色',
  'md3.appHeader.settings': '設定',
  'md3.appHeader.account': '轉帳戶',
  'md3.appHeader.accountFor': '轉帳戶（{name}）',
  'md3.paneHeader.fetch': '去 origin 攞返最新嘅嘢',
  'md3.paneHeader.moreActions': '仲有其他動作',
  'md3.paneHeader.push': '推 · {count}',
  'md3.paneHeader.upToDate': '同步齊晒',
  'md3.paneHeader.repository': 'Repo {name}',
  'md3.paneHeader.branch': '分支 {name}',
  'md3.paneHeader.progress': '{operation}，做咗 {percent}%',
  'md3.shell.destinationAnnouncement.plain': '而家睇緊{name}',
  'md3.shell.destinationAnnouncement.light': '而家睇緊{name}喇',
  'md3.shell.destinationAnnouncement.playful': '嚟啦，{name}到咗',
  'md3.shell.destinationAnnouncement.maximum': '登登登凳——{name}，即刻上枱',
  'md3.shell.branchGroup.local': '本機',
  'md3.shell.branchGroup.remote': '遠端',
  'md3.shell.searchTarget.global': '全域搜尋',
  'md3.shell.searchTarget.history': '啲 commit',
  'md3.shell.searchTarget.changes': '改咗嘅檔案',
  'md3.shell.searchTarget.branches': '啲分支',
  'md3.shell.searchTarget.actions': '啲 workflow run',
  'md3.shell.searchTarget.logs': 'log 內容',
  'md3.shell.searchTarget.inbox': '啲通知',
  'md3.shell.searchTarget.terminal': '終端機輸出',
  'md3.shell.searchTarget.agents': 'agent 對話',
  'md3.shell.searchTarget.repositories': '啲 repo',
  'md3.shell.searchTarget.diffSearch': '份 diff',
  'md3.shell.carry.compareToBranch': '同第個分支比較…',
  'md3.shell.carry.unreachableCommits': '搵唔返嘅 commit…',
  'md3.shell.carry.workflowManager': 'Workflow 管理…',
  'md3.shell.carry.workflowCatalog': '用範本開新 workflow…',
  'md3.shell.carry.cacheManager': 'Actions 快取管理…',
  'md3.shell.carry.runnerManager': '自架 runner 管理…',
  'md3.shell.carry.refreshRuns': '重新攞 workflow run',
  'md3.shell.carry.runCount': '攞晒所有 workflow run',
  'md3.shell.carry.jumpToAttempt': '跳返上一個 attempt',
  'md3.shell.carry.logGroupCollapse': '摺埋 log 嘅分組',
  'md3.shell.carry.paneDivider': '較 run 清單嘅闊度',
  'md3.shell.carry.discardFile': '掉咗啲改動',
  'md3.shell.carry.permanentlyDiscardFile': '永久掉咗啲改動',
  'md3.shell.carry.stashFile': 'Stash 起啲改動',
  'md3.shell.carry.ignoreFolder': '唔理呢個資料夾',
  'md3.shell.carry.copyRelativePath': '複製相對路徑',
  'md3.shell.carry.copySelectedPaths': '複製揀咗嘅路徑',
  'md3.shell.carry.openWithDefaultProgram': '用預設程式打開',
  'md3.shell.carry.cheapLfsPin': '用 Cheap LFS 釘住',
  'md3.shell.carry.includeSelectedFiles': '包埋揀咗嘅檔案',
  'md3.shell.carry.excludeSelectedFiles': '唔包揀咗嘅檔案',
  'md3.shell.carry.discardAll': '掉晒所有改動',
  'md3.shell.carry.permanentlyDiscardAll': '永久掉晒所有改動',
  'md3.shell.carry.stashAll': 'Stash 起所有改動',
  'md3.shell.carry.mergeAndDelete': 'Merge 完順手刪咗呢個分支',
  'md3.shell.carry.compareBranch': '同呢個分支比較',
  'md3.shell.carry.copyBranchName': '複製分支名',
  'md3.shell.carry.togglePinBranch': '釘住或者放低呢個分支',
  'md3.shell.carry.hideBranch': '收埋呢個分支',
  'md3.shell.carry.soloBranch': '淨係睇呢個分支',
  'md3.shell.carry.restoreBranchVisibility': '攞返收埋咗嘅分支',
  'md3.shell.carry.checkoutInNewWorktree': '喺新 worktree checkout',
  'md3.shell.carry.switchToWorktree': '轉去呢個分支嘅 worktree',
  'md3.shell.carry.viewBranchOnForge': '喺 forge 睇呢個分支',
  'md3.shell.carry.viewPullRequestOnForge': '喺 forge 睇個 pull request',
  'md3.shell.carry.sortBranchesByName': '按名排分支',
  'md3.shell.carry.sortBranchesByRecent': '按最近用過排分支',
  'md3.shell.carry.showPullRequests': '顯示 pull request',
  'md3.shell.carry.fetchRemoteBranches': '去攞遠端分支',
  'md3.shell.carry.restoreAllBranches': '攞返所有收埋咗嘅分支',
  'md3.shell.carry.bulkDeleteBranches': '刪咗揀嘅分支…',
  'md3.shell.carry.repositoryListMenu': 'Repo 動作…',
  'md3.shell.carry.newAgentSession': '開新 agent 對話…',
  'md3.carry.close': '閂咗佢',
  'md3.carry.workflowManagerTitle': 'Workflow 管理',
  'md3.carry.cacheManagerTitle': 'Actions 快取管理',
  'md3.carry.runnerManagerTitle': '自架 runner 管理',
  'md3.carry.bulkDeleteTitle': '一次過刪分支',
  'md3.carry.gate.discardTitle': '要掉咗啲改動？',
  'md3.carry.gate.discardConfirm': '掉咗啲改動',
  'md3.carry.gate.discardSummary':
    '會掉咗 {count} 個檔案未 commit 嘅改動：{files}。',
  'md3.carry.gate.discardIrreversible':
    '啲改動會入資源回收筒。Git 從來冇記錄過嘅嘢，Git 亦都救唔返。',
  'md3.carry.gate.discardTargetKey': '{repository} 入面 {count} 個檔案',
  'md3.carry.gate.discardEffectKey': '佢哋未 commit 嘅改動會入資源回收筒',
  'md3.carry.gate.discardPermanentTitle': '要永久掉咗啲改動？',
  'md3.carry.gate.discardPermanentConfirm': '永久掉咗',
  'md3.carry.gate.discardPermanentSummary':
    '會永久刪走 {count} 個檔案未 commit 嘅改動：{files}。',
  'md3.carry.gate.discardPermanentIrreversible':
    '唔會入資源回收筒。啲改動直接喺硬碟刪走，冇得攞返。',
  'md3.carry.gate.discardPermanentEffectKey':
    '佢哋未 commit 嘅改動會喺硬碟刪走',
  'md3.carry.gate.mergeAndDeleteTitle': '要 merge 完順手刪咗呢個分支？',
  'md3.carry.gate.mergeAndDeleteConfirm': 'Merge 完刪咗佢',
  'md3.carry.gate.mergeAndDeleteSummary':
    '會將 {branch} merge 入 {target}，等 Git 話 merge 完成之後，先刪走本機分支 {branch}。',
  'md3.carry.gate.mergeAndDeleteIrreversible':
    '本機分支會刪走。撞到衝突、hook 失敗或者 merge 中途停低，就會喺刪走之前停手，分支照樣留低。',
  'md3.carry.gate.mergeAndDeleteTargetKey': '本機分支 {branch}',
  'md3.carry.gate.mergeAndDeleteEffectKey': 'merge 完成之後就會刪走佢',
  'md3.carry.gate.bulkDeleteTitle': '要一次過刪分支？',
  'md3.carry.gate.bulkDeleteConfirm': '打開審核刪除',
  'md3.carry.gate.bulkDeleteSummary':
    '會打開 {repository} 嘅批次刪除審核，最多可以揀 {count} 條本機分支。而家用緊嗰條同預設分支永遠唔會入候選。',
  'md3.carry.gate.bulkDeleteIrreversible':
    '喺嗰個審核入面確認嘅分支都會喺本機刪走。每次刪除都會記低一個復原 object id，遠端分支唔會郁。',
  'md3.carry.gate.bulkDeleteTargetKey': '{repository} 入面嘅本機分支',
  'md3.carry.gate.bulkDeleteEffectKey': '審核入面揀咗嘅分支會刪走',
  'classicToolbar.heading': '舊版工具列',
  'classicToolbar.toggleLabel': '顯示舊版工具列',
  'classicToolbar.explanationSummary': '呢個設定會改咩',
  'classicToolbar.explanation.plain':
    '開咗之後，舊版工具列（repo、worktree、分支、同步、Build and run 同主題）會喺主面板上面顯示。閂咗之後，條工具列會收埋，而以上每一個動作都仲可以喺面板標題列同「仲有其他動作」選單搵到。兩邊都唔會少咗任何功能。',
  'classicToolbar.explanation.light':
    '開咗，舊版工具列返返去面板上面：repo、worktree、分支、同步、Build and run、主題。閂咗，收埋佢，但每個動作都仲喺面板標題列或者「仲有其他動作」入面。兩邊都冇嘢會唔見。',
  'classicToolbar.explanation.playful':
    '開咗，舊版工具列照舊坐返面板上面，repo、worktree、分支、同步、Build and run 同主題一個都冇走雞。閂咗，佢就放個假，而嗰啲動作全部喺面板標題列或者「仲有其他動作」度等緊你。冇嘢會唔見，淨係搬咗屋。',
  'classicToolbar.explanation.maximum':
    '開咗，舊版工具列就大搖大擺行返上面板頭頂嗰個熟悉嘅位，成隊人馬齊晒：repo、worktree、分支、同步、Build and run、主題，十年肌肉記憶擺喺邊就係邊。閂咗，佢就落更收工，臨走前將每一個動作都交晒俾面板標題列同「仲有其他動作」選單。冇一個會被裁、被退休，或者靜靜雞跌咗落介面後面。',
  'classicToolbar.boundaryNote':
    '收埋條工具列唔會刪走任何動作。Repo 分頁列係另一件事，佢一直都會顯示。',
  'classicToolbar.provenanceDefault':
    '呢部電腦未記錄過你嘅選擇，所以而家用緊出廠設定：{value}。',
  'classicToolbar.provenanceStored': '呢部電腦記錄咗你嘅選擇：{value}。',
  'classicToolbar.stateOn': '顯示',
  'classicToolbar.stateOff': '隱藏',
  'md3.repositories.searchPlaceholder': '搵 repo、組織或者語言',
  'md3.repositories.gone': '呢個 repo 已經唔喺個列表入面。',
  'md3.repositories.favourited': '收藏咗 {count} 個 repo。',
  'md3.repositories.unfavourited': '取消收藏咗 {count} 個 repo。',
  'md3.repositories.removed': '喺個列表度移走咗 {count} 個 repo。',
  'md3.repositories.pullingAll': 'Pull 緊揀晒嘅 repo。',
  'md3.repositories.pulling': 'Pull 緊揀咗嘅 repo。',
  'md3.repositories.fetching': 'Fetch 緊揀咗嘅 repo。',
  'md3.repositories.assigningGroup': '搬緊佢哋入 {group}。',
  'md3.repositories.removingGroup': '將佢哋抌出個組。',
  'md3.repositories.dismissNotice': '收埋呢句嘢',
  'md3.repositories.searchFieldName': '啲 repo',
  'md3.repositories.filtersLabel': 'Repo 篩選',
  'md3.repositories.hasChanges': '有改動',
  'md3.repositories.clone': '複製落嚟',
  'md3.repositories.addLocal': '加本機',
  'md3.repositories.pullAll': '全部 pull',
  'md3.repositories.pullAllName': '全部 pull 篩選出嚟嘅 {count} 個 repo',
  'md3.repositories.selectMultiple': '一次揀幾個 repo',
  'md3.repositories.listLabel': 'Repo 清單',
  'md3.repositories.empty': '冇 repo 啱呢個篩選。',
  'md3.repositories.invalidPattern': '呢條正則寫唔通，所以乜都冇篩走。',
  'md3.repositories.meta': '{path} · 上次 fetch：{when}',
  'md3.repositories.neverFetched': '未 fetch 過',
  'md3.repositories.detail':
    '{language} · {size} · {branch} · {remotes} · {changes}',
  'md3.repositories.languageUnknown': '認唔到語言',
  'md3.repositories.size': '{size} MB',
  'md3.repositories.sizeUnknown': '未量過大細',
  'md3.repositories.branchAheadBehind': '{branch} ↑{ahead} ↓{behind}',
  'md3.repositories.branchInSync': '{branch} 同步緊',
  'md3.repositories.branchNotChecked': '{branch} 未查過',
  'md3.repositories.branchNoUpstream': '{branch} 冇上游',
  'md3.repositories.branchDetached': 'HEAD 甩咗 branch',
  'md3.repositories.branchEmpty': '重未有 commit',
  'md3.repositories.branchCloning': 'clone 緊',
  'md3.repositories.branchMissing': '磁碟度搵唔到',
  'md3.repositories.branchNone': '冇 branch',
  'md3.repositories.remotes': '{count} 個 remote',
  'md3.repositories.remotesOne': '1 個 remote',
  'md3.repositories.changes': '{count} 個改動',
  'md3.repositories.changesOne': '1 個改動',
  'md3.repositories.clean': '乾淨',
  'md3.repositories.changesUnknown': '未查過',
  'md3.repositories.open': '打開',
  'md3.repositories.openName': '打開 {name}',
  'md3.repositories.current': '而家用緊',
  'md3.repositories.rowMenu': '{name} 嘅動作',
  'md3.repositories.rowMenuHint': 'Fetch、移除、開資料夾、設定',
  'md3.repositories.pinnedFlag': '釘咗',
  'md3.repositories.hiddenFlag': '收埋咗',
  'md3.repositories.missingFlag': '搵唔到',
  'md3.repositories.selectRow': '揀 {name}',
  'md3.repositories.bulkRegion': '批次 repo 動作',
  'md3.repositories.selectAllVisible': '揀晒眼前 {count} 個',
  'md3.repositories.selectionScope':
    '「揀晒」淨係包篩選而家見到嘅 {shown} 個 repo，唔係全部 {total} 個。',
  'md3.repositories.selectedCount': '揀咗 {count} 個',
  'md3.repositories.invertSelection': '反轉揀嘅嘢',
  'md3.repositories.clearSelection': '清走揀咗嘅嘢',
  'md3.repositories.exitSelection': '揀完',
  'md3.repositories.groupFieldLabel': '組名',
  'md3.repositories.groupFieldPlaceholder': '舊組或者開個新組',
  'md3.repositories.bulkFetch': '攞更新',
  'md3.repositories.bulkPull': '拉落嚟',
  'md3.repositories.bulkOpen': '打開',
  'md3.repositories.bulkFavorite': '釘住',
  'md3.repositories.bulkUnfavorite': '唔釘',
  'md3.repositories.bulkAssignGroup': '放入組',
  'md3.repositories.bulkRemoveGroup': '踢出組',
  'md3.repositories.bulkExport': '匯出',
  'md3.repositories.bulkRemove': '喺清單度移除',
  'md3.repositories.bulkActionName': '對揀咗嘅 {count} 個 repo{action}',
  'md3.repositories.runRegion': 'Repo 批次進度',
  'md3.repositories.runCount': '{total} 個做咗 {completed} 個',
  'md3.repositories.runProgressText': '{operation}，做咗 {percent}%',
  'md3.repositories.runCancelling':
    '取消緊。行緊嗰個做完先停，跟住嗰啲唔會開始。',
  'md3.repositories.runSummary':
    '{total} 個之中 {done} 個成功 · {failed} 個失敗 · {skipped} 個跳過 · {remaining} 個未開始',
  'md3.repositories.runResults': '每個 repo 嘅結果',
  'md3.repositories.runNoDetail': '冇詳細講',
  'md3.repositories.runCancel': '取消',
  'md3.repositories.runCancelName': '取消{operation}',
  'md3.repositories.runDismiss': '收埋呢啲結果',
  'md3.repositories.runStatusQueued': '排緊隊',
  'md3.repositories.runStatusRunning': '行緊',
  'md3.repositories.runStatusDone': '搞掂',
  'md3.repositories.runStatusFailed': '失敗',
  'md3.repositories.runStatusSkipped': '跳咗',
  'md3.repositories.runStatusCancelled': '未行過',
  'md3.repositories.removeEyebrow': '破壞性動作',
  'md3.repositories.removeTitle': '真係要喺清單度移除呢 {count} 個 repo？',
  'md3.repositories.removeTitleOne': '真係要喺清單度移除呢個 repo？',
  'md3.repositories.removeDescription':
    '呢度唔會再跟住佢哋。磁碟上面乜都唔會刪，之後想加返都得。',
  'md3.repositories.removeListLabel': '會被移除嘅 repo',
  'md3.repositories.removeKeysLegend': '授權呢一次移除',
  'md3.repositories.removeKeyList': '我睇咗上面張清單，冇錯就係要移除呢啲。',
  'md3.repositories.removeKeyDisk':
    '我明白呢 {count} 個檔案仲喺磁碟度，遲啲可以加返。',
  'md3.repositories.removeSlider': '拉到盡先可以授權移除（{percent}%）',
  'md3.repositories.removeSliderName': '全程移除授權',
  'md3.repositories.removeSliderValue': '授權咗 {percent}%',
  'md3.repositories.removeStateLocked': '兩個確認都要剔咗，個滑桿先郁得。',
  'md3.repositories.removeStateMoving': '繼續拉到最尾先算授權。',
  'md3.repositories.removeStateReady': '授權完成。撳「喺清單度移除」就完成。',
  'md3.repositories.removeConfirm': '喺清單度移除',
  'md3.repositories.removeCancel': '緊急退出',
  'md3.actions.filterPlaceholder': '篩 workflow run',
  'md3.actions.runFieldLabel': 'workflow run',
  'md3.actions.logPlaceholder': '搵 log 內容',
  'md3.actions.logFieldLabel': '份 log',
  'md3.actions.chipRowLabel': 'Workflow run 篩選',
  'md3.actions.chip.running': '跑緊',
  'md3.actions.chip.failed': '失敗',
  'md3.actions.chip.success': '成功',
  'md3.actions.chip.thisBranch': '呢條分支',
  'md3.actions.cancelRequested': '叫咗佢停喇。',
  'md3.actions.cancelRefused': 'GitHub 唔肯取消呢個 run，可能佢早就跑完咗。',
  'md3.actions.bulkDone': '{count} 個 run 搞掂晒。',
  'md3.actions.bulkPartial': '{done} 個 run 搞掂，{failed} 個失敗。',
  'md3.actions.workflowEnabled': '開咗 {name}。',
  'md3.actions.workflowDisabled': '熄咗 {name}。',
  'md3.actions.unsupported':
    '呢個 repo 唔喺 GitHub，所以冇 workflow run 好睇。',
  'md3.actions.moreFilters': '仲有更多 workflow run 篩選',
  'md3.actions.selectRuns': '揀 workflow run',
  'md3.actions.dispatch': '行 workflow',
  'md3.actions.filtersHeading': 'Workflow run 篩選',
  'md3.actions.filterWorkflow': '工作流程',
  'md3.actions.filterBranch': '分支',
  'md3.actions.filterEvent': '觸發事件',
  'md3.actions.filterStatus': '狀態',
  'md3.actions.resetFilters': '重設篩選',
  'md3.actions.bulkLabel': '批量 workflow run 動作',
  'md3.actions.selectAllVisible': '揀晒睇得到嗰啲',
  'md3.actions.selectedCount': '揀咗 {count} 個',
  'md3.actions.bulkRerun': '重跑做完嗰啲（{count}）',
  'md3.actions.bulkCancel': '取消仲行緊嗰啲（{count}）',
  'md3.actions.clearSelection': '清走揀咗嘅',
  'md3.actions.selectRun': '揀 workflow run {name}',
  'md3.actions.runList': 'Workflow run',
  'md3.actions.runMeta': '#{number} · {branch} · {event} · {duration}',
  'md3.actions.runDetail':
    '{status} · 由 {actor} 撳起 · {sha} · {jobs} 個 job · {time} · 第 {attempt} 次',
  'md3.actions.rerun': '重跑',
  'md3.actions.rerunRun': '重跑 {name}',
  'md3.actions.runMenuFor': '{name} 嘅動作',
  'md3.actions.runMenuHint': '重跑失敗 job、取消、睇 log',
  'md3.actions.noRuns': '冇 workflow run 啱呢個篩選。',
  'md3.actions.showMoreRuns': '睇多啲 run',
  'md3.actions.pagination':
    '載咗 {loaded} 個（總共 {total} 個）workflow run，其中 {shown} 個啱篩選。',
  'md3.actions.loadMoreRuns': '載多啲 run',
  'md3.actions.loadingMore': '載緊…',
  'md3.actions.loadAllRuns': '全部載晒',
  'md3.actions.stopLoading': '唔好載住',
  'md3.actions.detailLabel': '揀咗嘅 workflow run',
  'md3.actions.detailHeading': '{name} · #{number} · {branch}',
  'md3.actions.rerunFailed': '重跑失敗嗰啲',
  'md3.actions.rerunFailedFor': '重跑 {name} 失敗嗰啲 job',
  'md3.actions.paneMenu': '更多',
  'md3.actions.runToolbar': 'Workflow run 動作',
  'md3.actions.attempt': '睇邊次嘗試嘅 job',
  'md3.actions.attemptOption': '第 {attempt} 次',
  'md3.actions.attemptLatest': '第 {attempt} 次（最新）',
  'md3.actions.cancelRun': '取消呢個 run',
  'md3.actions.fixCiLocally': '喺本機修 CI',
  'md3.actions.fixCiLocallyHint':
    '用 Codex 或者 OpenCode 喺本機修好、驗證完先 push，跟住雲端 CI 就會行',
  'md3.actions.artifacts': 'Artifact',
  'md3.actions.openOnGitHub': '喺 GitHub 度睇',
  'md3.actions.jobList': 'Job 同步驟',
  'md3.actions.jobsLoading': '載緊 job…',
  'md3.actions.jobsTruncated': 'GitHub 剪短咗呢張 job 清單，重新載入睇返晒。',
  'md3.actions.loadMoreJobs': '載多啲 job',
  'md3.actions.reloadJobs': '重新載入 job',
  'md3.actions.rerunJob': '重跑 job {name}',
  'md3.actions.jobOnGitHub': '喺 GitHub 開 {name}',
  'md3.actions.noRunSelected': '揀個 workflow run 就會見到佢啲 job 同 log。',
  'md3.actions.logRegion': '工作紀錄',
  'md3.actions.logLoading': '下載緊 job log…',
  'md3.actions.logExpired': '呢啲 workflow log 喺 GitHub 度過咗期喇。',
  'md3.actions.logRetry': '再試多次',
  'md3.actions.logEmpty': '暫時未有 log 輸出。',
  'md3.actions.logNoMatch': '冇 log 行啱呢個搜尋。',
  'md3.actions.logShowMore': '睇多啲 log',
  'md3.actions.logShowing': '顯示緊 {total} 行 log 入面嘅 {shown} 行。',
  'md3.drawer.label': '主導覽',
  'md3.drawer.destinations': '目的地',
  'md3.drawer.commit': '提交',
  'md3.drawer.destinationWithCount': '{label}，{count}',
  'md3.drawer.repository': '{name}，轉倉庫',
  'md3.drawer.destination.changes': '變更',
  'md3.drawer.destination.history': '歷史',
  'md3.drawer.destination.branches': '分支',
  'md3.drawer.destination.actions': '操作',
  'md3.drawer.destination.inbox': '收件匣',
  'md3.drawer.destination.terminal': '終端機',
  'md3.drawer.destination.agents': '代理',
  'md3.drawer.destination.repositories': '倉庫',
  'md3.rail.label': '主導覽',
  'md3.rail.destinations': '目的地',
  'md3.rail.destinationWithCount': '{label}，{count}',
  'md3.rail.settings': '設定',
  'md3.rail.account': '{repository}，轉帳戶',
  'md3.rail.accountFor': '{name}，轉帳戶 · {repository}',
  'md3.compose.title': '砌返個 commit 訊息',
  'md3.compose.close': '閂咗個 commit 編寫器',
  'md3.compose.context':
    '{total} 個檔案入面揀咗 {included} 個 · {stat} · {branch}',
  'md3.compose.summaryPlaceholder': '摘要（一定要填）',
  'md3.compose.copilot': 'Copilot',
  'md3.compose.copilotAccessibleName': 'Copilot — 幫你草擬 commit 訊息',
  'md3.compose.descriptionPlaceholder': '詳細講吓（填唔填都得）',
  'md3.compose.addCoAuthors': '加埋共同作者',
  'md3.compose.hintCharacters': '{count}/{limit} 個字',
  'md3.compose.hintRequired': '未寫摘要就 commit 唔到㗎。',
  'md3.compose.commitOnly': '淨係 commit',
  'md3.compose.commitAndPush': 'Commit 埋推上去',
  'md3.compose.summaryStillRequired': '摘要仲係要填㗎',
  'md3.toast.undo': '返轉頭',
  'md3.toast.dismiss': '收咗呢個通知',
  'md3.toast.region': '通知',
  'md3.inbox.pane': '通知',
  'md3.inbox.list': '通知',
  'md3.inbox.filters': '通知篩選',
  'md3.inbox.searchPlaceholder': '搵通知',
  'md3.inbox.searchField': '通知',
  'md3.inbox.invalidPattern': '個 regex 仲未啱用，所以啲通知全部照樣顯示緊。',
  'md3.inbox.exportName': '通知',
  'md3.inbox.chip.unread': '未睇',
  'md3.inbox.chip.failures': '炒咗嘅',
  'md3.inbox.chip.mentions': '有人叫你',
  'md3.inbox.markAllRead': '全部當睇咗',
  'md3.inbox.muted': '靜咗音',
  'md3.inbox.state.read': '睇咗',
  'md3.inbox.state.unread': '未睇',
  'md3.inbox.tone.success': '搞掂',
  'md3.inbox.tone.failure': '炒咗',
  'md3.inbox.tone.info': '資訊',
  'md3.inbox.detail': '{source} · {state} · {tone}',
  'md3.inbox.detailNoSource': '{state} · {tone}',
  'md3.inbox.row.select': '揀「{title}」',
  'md3.inbox.row.markRead': '將「{title}」當睇咗',
  'md3.inbox.row.markUnread': '將「{title}」當未睇',
  'md3.inbox.row.delete': '刪咗「{title}」',
  'md3.inbox.row.received': '{timestamp} 收到',
  'md3.inbox.selectAllFiltered': '揀晒篩選後嘅 {count} 個',
  'md3.inbox.selectAllEverything': '揀晒全部 {count} 個通知',
  'md3.inbox.selectionCount': '揀咗 {count} 個',
  'md3.inbox.invertSelection': '反轉揀嘅嘢',
  'md3.inbox.bulkMarkRead': '當睇咗',
  'md3.inbox.bulkMarkReadScoped': '{label} — {scope}',
  'md3.inbox.bulkMarkUnread': '當未睇',
  'md3.inbox.bulkMarkUnreadScoped': '{label} — {scope}',
  'md3.inbox.bulkDelete': '刪咗佢',
  'md3.inbox.bulkDeleteScoped': '{label} — {scope}',
  'md3.inbox.bulkExport': '匯出',
  'md3.inbox.bulkExportScoped': '{label} — {scope}',
  'md3.inbox.moreActions': '通知仲有其他動作',
  'md3.inbox.empty.noMatch': '冇通知配到呢個搜尋或者篩選。',
  'md3.inbox.empty.caughtUp': '全部睇晒喇，好嘢。',
  'md3.inbox.scope.selection': '揀咗嘅 {count} 個通知',
  'md3.inbox.scope.filtered': '篩選後嘅 {count} 個通知',
  'md3.inbox.scope.all': '全部 {count} 個通知',
  'md3.inbox.scope.one': '{count} 個通知',
  'md3.inbox.undo': '返轉頭',
  'md3.inbox.toast.opened': '開咗：{title}',
  'md3.inbox.toast.deleted': '刪咗「{title}」',
  'md3.inbox.toast.deletedMany': '刪咗 {count} 個通知',
  'md3.inbox.toast.markedRead': '將 {count} 個通知當睇咗',
  'md3.inbox.toast.markedUnread': '將 {count} 個通知當未睇',
  'md3.inbox.toast.allRead': '全部通知都當睇咗喇',
  'md3.inbox.toast.exported': '用 {format} 匯出咗 {count} 個通知',
  'md3.inbox.toast.selectedAll': '揀晒全部 {count} 個通知',
  'md3.inbox.toast.muted': '「{title}」條 thread 靜咗音',
  'md3.inbox.toast.unmuted': '「{title}」條 thread 開返聲',
  'md3.inbox.rowMenu.unmute': '開返呢條 thread 嘅聲',
  'md3.inbox.rowMenu.automations': '通知自動化…',
  'md3.inbox.rowMenu.select': '揀呢個通知',
  'md3.inbox.rowMenu.deselect': '唔揀呢個通知',
  'md3.inbox.rowMenu.copyDetails': 'copy 埋啲詳情',
  'md3.inbox.rowMenu.exportOne': '匯出呢個通知…',
  'md3.inbox.listMenu.title': '通知清單',
  'md3.inbox.listMenu.selectFiltered': '揀晒篩選後嘅 {count} 個',
  'md3.inbox.listMenu.selectEverything': '揀晒全部 {count} 個通知',
  'md3.inbox.listMenu.invert': '反轉揀嘅嘢',
  'md3.inbox.listMenu.clearSelection': '唔揀住先',
  'md3.inbox.listMenu.deleteScope': '刪咗 {count} 個通知…',
  'md3.inbox.listMenu.export': '匯出 {count} 個通知…',
  'md3.inbox.listMenu.history': '通知歷史…',
  'md3.inbox.listMenu.githubInbox': 'GitHub 通知…',
  'md3.inbox.exportMenu.title': '匯出通知',
  'md3.inbox.exportMenu.filterPlaceholder': '篩選格式',
  'md3.actions.noRepository': '而家冇揀 repo。',
  'md3.repositories.exportTitle': 'Repo 揀選已匯出',
  'md3.repositories.exportBody': '匯出咗 {count} 個 repo。',
  'md3.inbox.exportTitle': '通知已匯出',
  'md3.inbox.exportBody': '匯出咗 {count} 個通知。',
  'md3.adapters.diff.none': '呢個檔案冇 diff 好睇。',
  'md3.adapters.diff.noChanges': '呢個檔案冇文字上嘅改動。',
  'md3.adapters.diff.image': '呢個係圖片，開嚟睇先見到改咗咩。',
  'md3.adapters.diff.binary': '呢個係二進位檔案，冇得逐行比。',
  'md3.adapters.diff.submodule': '呢個係 submodule，佢自己啲 commit 就係改動。',
  'md3.adapters.diff.unrenderable': '呢個 diff 太大，畫唔出。',
  'md3.adapters.branch.metaSha': '頂位 {sha}',
  'md3.adapters.branch.metaUpdated': '{when}更新過',
  'md3.adapters.repository.cloning': 'Clone 緊',
  'md3.adapters.repository.local': '本機',
  'md3.adapters.repository.fetchUnknown': '仲未查過',
  'md3.adapters.agent.permissions': '喺 {path} 度跑',
  'md3.adapters.agent.missing': '搵唔到呢個 worktree，所以送唔到嘢入去。',
  'md3.adapters.agent.notRunning':
    '呢個 session 冇跑緊。想落指令就要先 resume 返佢。',
  'md3.adapters.agent.status.running': '跑緊',
  'md3.adapters.agent.status.exited': '收咗工',
  'md3.adapters.agent.status.failed': '爆咗',
  'md3.adapters.agent.status.cancelled': '取消咗',
  'md3.diffPane.region': '差異',
  'md3.diffPane.linesRegion': '差異行',
  'md3.diffPane.noFile': '未揀檔案',
  'md3.diffPane.empty': '呢個檔案冇文字改動。',
  'md3.diffPane.searchField': '差異',
  'md3.diffPane.searchPlaceholder': '喺差異度搵嘢',
  'md3.diffPane.details': '詳情',
  'md3.diffPane.detailsName': '呢個 commit 嘅詳情',
  'md3.diffPane.includeHunk': '加埋呢段',
  'md3.diffPane.includeHunkName': '將呢段改動加入 commit',
  'md3.diffPane.wrap': '自動換行',
  'md3.diffPane.diffOptions': '差異選項',
  'md3.diffPane.fileTabs': '呢個 commit 入面嘅檔案',
  'md3.diffPane.fileTabName': '{name} — {path}，+{added} −{deleted}',
  'md3.changes.searchField': '改咗嘅檔案',
  'md3.changes.searchPlaceholder': '篩選改咗嘅檔案',
  'md3.changes.filters': '改動檔案篩選',
  'md3.changes.includeAll': '{total} 個入面揀咗 {included} 個',
  'md3.changes.changesMenu': '掉咗、唔理、擺埋一邊',
  'md3.changes.list': '改咗嘅檔案',
  'md3.changes.include': '將「{name}」加入 commit',
  'md3.changes.rowMenu': '掉咗、唔理、開資料夾睇「{name}」',
  'md3.changes.fileMenu': '用編輯器開、掉咗、唔理',
  'md3.changes.status.new': '新檔案',
  'md3.changes.status.deleted': '刪咗',
  'md3.changes.status.modified': '改咗',
  'md3.changes.state.included': '會 commit',
  'md3.changes.state.excluded': '唔 commit',
  'md3.changes.empty': '冇改咗嘅檔案啱呢個篩選。',
  'md3.changes.composer': 'Commit 訊息編輯區',
  'md3.changes.avatar': '用「{name}」身份 commit',
  'md3.changes.summaryPlaceholder': '摘要（一定要填）',
  'md3.changes.descriptionPlaceholder': '詳細講吓',
  'md3.changes.copilot': '叫 Copilot 幫你寫訊息',
  'md3.changes.coAuthors': '共同作者',
  'md3.changes.coAuthorsName': '共同作者 — 記低同你一齊做嘅人',
  'md3.changes.summaryHint': '{count}/{limit}',
  'md3.changes.summaryHintLong': '{count}/{limit} — 摘要有啲長',
  'md3.changes.commitTo': 'Commit 落 {branch}',
  'md3.changes.commitNeedsSummary': '一定要有摘要 — 撳落去會開埋編輯區',
  'md3.changes.commitAndPush': '一撳就 commit 埋推上去',
  'md3.agents.sessionsPane': '代理工作階段',
  'md3.agents.conversationPane': '同代理傾嘅嘢',
  'md3.agents.listLabel': '代理工作階段',
  'md3.agents.actionsLabel': '代理工作階段動作',
  'md3.agents.searchPlaceholder': '搵代理工作階段',
  'md3.agents.searchFieldLabel': '代理工作階段',
  'md3.agents.newSession': '開個新嘅',
  'md3.agents.agentAccess': '代理權限',
  'md3.agents.emptyNoMatches': '搵唔到夾嘅代理工作階段。',
  'md3.agents.emptyNoSessions': '仲未有代理工作階段。',
  'md3.agents.state.running': '行緊',
  'md3.agents.state.done': '搞掂',
  'md3.agents.state.paused': '暫停咗',
  'md3.agents.state.error': '出咗事',
  'md3.agents.state.idle': '閒置',
  'md3.agents.meta.started': '{agent} · {time}開始',
  'md3.agents.meta.notStarted': '{agent} · 仲未開始',
  'md3.agents.meta.branchStarted': '{agent} · {branch} · {time}開始',
  'md3.agents.meta.branchNotStarted': '{agent} · {branch} · 仲未開始',
  'md3.agents.detail.model': '模型 {model}',
  'md3.agents.detail.noModel': '冇報模型',
  'md3.agents.detail.turns': '{count} 個回合',
  'md3.agents.detail.oneTurn': '1 個回合',
  'md3.agents.elapsed.seconds': '{seconds} 秒',
  'md3.agents.elapsed.minutes': '{minutes} 分 {seconds} 秒',
  'md3.agents.elapsed.hours': '{hours} 個鐘 {minutes} 分',
  'md3.agents.badge.main': '主工作樹',
  'md3.agents.badge.locked': '鎖咗',
  'md3.agents.badge.missing': '唔見咗',
  'md3.agents.noSelection': '未揀工作階段',
  'md3.agents.noSelectionHint': '喺左邊揀個工作階段，就睇到佢傾過啲乜。',
  'md3.agents.noTurns': '呢個工作階段仲未出過任何嘢。',
  'md3.agents.conversationLabel': '同「{name}」傾嘅嘢',
  'md3.agents.role.you': '你',
  'md3.agents.role.error': '錯誤',
  'md3.agents.pause': '暫停',
  'md3.agents.resume': '繼續',
  'md3.agents.pauseAccessibleName': '{label}「{name}」',
  'md3.agents.resumeAccessibleName': '{label}「{name}」',
  'md3.agents.more': '仲有其他工作階段動作',
  'md3.agents.instructionPlaceholder': '打個指示畀佢',
  'md3.agents.send': '寄出',
  'md3.agents.sendAccessibleName': '{label}指示畀「{name}」',
  'md3.agents.nothingToSend': '冇嘢可以寄',
  'md3.terminal.region': '終端機',
  'md3.terminal.shells': 'Shell session 一覽',
  'md3.terminal.newShell': '開個新 shell',
  'md3.terminal.closeShell': '閂咗 {shell}',
  'md3.terminal.restart': '重開',
  'md3.terminal.restartName': '重開 {shell}',
  'md3.terminal.stop': '停',
  'md3.terminal.stopName': '停低 {shell} 行緊嗰個指令',
  'md3.terminal.searchPlaceholder': '搵吓終端機輸出',
  'md3.terminal.searchField': '終端機輸出',
  'md3.terminal.output': '{shell} 嘅輸出',
  'md3.terminal.truncated':
    '而家淨係顯示最後 {shown} 行，總共 {total} 行。搵嘢仲係搵晒全部㗎。',
  'md3.terminal.noMatches': '冇輸出啱。',
  'md3.terminal.noOutput': '呢個 shell 仲未出過嘢。',
  'md3.terminal.clearSearch': '清走個搜尋',
  'md3.terminal.noSessions': '一個 shell 都未開。',
  'md3.terminal.openShell': '開個 shell',
  'md3.terminal.inputPlaceholder': '入個指令嚟行',
  'md3.terminal.inputLabel': '喺 {shell} 嘅 {prompt} 度行嘅指令',
  'md3.terminal.run': '行',
  'md3.terminal.runName': '喺 {shell} 度行呢個指令',
  'md3.terminal.nothingToRun': '冇嘢可以行',
  'md3.terminal.status.connecting': '開緊機',
  'md3.terminal.status.ready': '準備好',
  'md3.terminal.status.running': '行緊指令',
  'md3.terminal.status.exited': '已經收咗工',
  'md3.terminal.status.error': '開唔到',
  'md3.terminal.sessionLabel': '{shell} — {repository}',
  'md3.terminal.banner': '喺 {path} 度做嘢',
  'md3.terminal.cancelled': '取消咗。',
  'md3.terminal.failedWithError': '爆咗：{error}',
  'md3.terminal.exitedWithCode': '收工咗，退出碼 {code}。',
  'md3.terminal.failed': '爆咗。',
  'md3.terminal.notAllowed': '呢度唔准跑呢個指令。',
  'md3.terminal.refreshFailed': '刷新唔到呢個 session。',
  'md3.terminal.startFailed': '開唔到呢個指令。',
  'md3.branches.filterPlaceholder': '篩分支',
  'md3.branches.fieldLabel': '分支',
  'md3.branches.chipsLabel': '分支篩選',
  'md3.branches.chip.local': '本機',
  'md3.branches.chip.remote': '遠端',
  'md3.branches.listLabel': '分支',
  'md3.branches.newBranch': '開新分支',
  'md3.branches.mergeAll': '全部合併',
  'md3.branches.mergeAllRunning': '{label} — 做緊喇',
  'md3.branches.mergeAllProgress': '合併緊全部分支，做咗 {completed}/{total}',
  'md3.branches.mergeAllProgressBranch':
    '合併緊「{branch}」，做咗 {completed}/{total}',
  'md3.branches.empty': '冇分支啱呢個篩選。',
  'md3.branches.current': '而家呢個',
  'md3.branches.checkout': '轉去',
  'md3.branches.checkoutLabel': '轉去「{name}」',
  'md3.branches.rowLabel': '{name}，{group}',
  'md3.branches.rowMenu': '「{name}」嘅動作',
  'md3.branches.rowMenuHint': '合併、改名、刪走、開 PR',
  'md3.branches.aheadLabel': '快咗 {count} 個 commit',
  'md3.branches.behindLabel': '慢咗 {count} 個 commit',
  'md3.branches.group.current': '而家呢個',
  'md3.branches.group.local': '本機',
  'md3.branches.group.remote': '遠端',
  'md3.branches.detail.tip': '頂端 {sha}',
  'md3.branches.detail.tracks': '跟住 {upstream}',
  'md3.branches.detail.trackingRemote': '跟住 origin',
  'md3.branches.detail.untracked': '冇上游',
  'md3.branches.detail.diverged': '↑{ahead} ↓{behind}',
  'md3.branches.detail.inSync': '同步齊晒',
  'md3.branches.detail.pullRequest': 'PR #{number} {state}',
  'md3.branches.action.merge': '合併入「{branch}」',
  'md3.branches.action.rebase': '重訂基底去「{branch}」',
  'md3.branches.action.openPullRequest': '開 pull request',
  'md3.branches.action.rename': '改分支個名…',
  'md3.branches.action.delete': '刪走分支…',
  'md3.branches.action.mergeAndDelete': '合併完再刪走…',
  'md3.branches.action.compare': '同呢個分支比較',
  'md3.branches.action.copyName': '複製分支名',
  'md3.branches.action.pin': '釘住分支',
  'md3.branches.action.unpin': '唔釘住分支',
  'md3.branches.action.hide': '收埋分支',
  'md3.branches.action.solo': '淨係睇呢個分支',
  'md3.branches.action.restoreVisibility': '全部分支show返出嚟',
  'md3.branches.action.checkoutInNewWorktree': '喺新工作樹度轉去…',
  'md3.branches.action.switchToWorktree': '轉去現有工作樹',
  'md3.branches.action.viewOnForge': '喺網站度睇呢個分支',
  'md3.branches.action.viewPullRequestOnForge': '喺網站度睇個 pull request',
  'md3.branches.list.sortByName': '照個名排',
  'md3.branches.list.sortByNameActive': '照個名排（而家用緊）',
  'md3.branches.list.sortByRecent': '照最近郁過排',
  'md3.branches.list.sortByRecentActive': '照最近郁過排（而家用緊）',
  'md3.branches.list.pullRequests': '睇 pull request',
  'md3.branches.list.fetchRemotes': '攞返遠端分支',
  'md3.branches.list.bulkDelete': '一次過刪走幾個分支…',
  'md3.locks.title': '鎖',
  'md3.locks.subtitle':
    '所有喺分頁、分頁群組同外觀設定上面嘅鎖。每一把鎖有佢自己嘅密碼，唔會互通。',
  'md3.locks.search.placeholder': '搵鎖',
  'md3.locks.search.fieldLabel': '啲鎖',
  'md3.locks.empty.none':
    '而家一把鎖都冇。喺分頁嘅右掣選單，或者外觀編輯器度加一把。',
  'md3.locks.empty.noMatch': '呢個搜尋冇對到任何一把鎖。',
  'md3.locks.list.label': '啲鎖',
  'md3.locks.surface.tab': '分頁',
  'md3.locks.surface.tabGroup': '分頁群組',
  'md3.locks.surface.appearanceProperty': '外觀數值',
  'md3.locks.surface.appearanceElement': '外觀元件',
  'md3.locks.surface.appearancePreset': '外觀預設',
  'md3.locks.factor.password': '密碼',
  'md3.locks.factor.otp': '一次性密碼',
  'md3.locks.row.created': '{date} 整嘅',
  'md3.locks.row.lockOnLaunch': '開 App 就再鎖返',
  'md3.locks.row.unlockedUntil': '解咗鎖，去到 {time} 為止',
  'md3.locks.row.unlockedSession': '解咗鎖，閂 App 之前都唔使再解',
  'md3.locks.row.unlockedSurface': '解咗鎖，你唔行開就一路開住',
  'md3.locks.row.locked': '鎖住',
  'md3.locks.row.select': '揀 {label} 嗰把鎖',
  'md3.locks.row.edit': '改 {label} 嗰把鎖',
  'md3.locks.row.remove': '除咗 {label} 嗰把鎖',
  'md3.locks.row.lockAgain': '而家即刻再鎖返 {label}',
  'md3.locks.duration.surface': '淨係呢一版',
  'md3.locks.duration.minutes': '指定幾多分鐘',
  'md3.locks.duration.session': '直至閂咗 App',
  'md3.locks.duration.minutesValue': '{minutes} 分鐘',
  'md3.locks.selection.count': '揀咗 {selected} 個，一共 {total} 個',
  'md3.locks.selection.selectAllFiltered':
    '揀晒呢個搜尋 show 緊嘅 {count} 把鎖',
  'md3.locks.selection.selectAllEverything':
    '揀晒全部 {count} 把鎖，連搜尋收埋咗嗰啲都要',
  'md3.locks.selection.invert': '反轉揀嘅嘢',
  'md3.locks.selection.clear': '唔揀住任何一個',
  'md3.locks.bulk.remove': '除咗 {count} 把鎖…',
  'md3.locks.bulk.export': '匯出 {count} 把鎖',
  'md3.locks.bulk.exportFormat': '匯出格式',
  'md3.locks.toast.exported':
    '用 {format} 匯出咗 {count} 把鎖。密碼同一次性密碼嘅秘密永遠唔會喺入面。',
  'md3.locks.toast.removed': '除咗 {count} 把鎖。',
  'md3.locks.toast.added': '{label} 鎖咗。淨係呢把鎖自己嗰個密碼開得到佢。',
  'md3.locks.toast.updated': '改咗 {label} 嗰把鎖。',
  'md3.locks.toast.unlocked': '{label} 解咗鎖。',
  'md3.locks.toast.relocked': '{label} 再鎖返咗。',
  'md3.locks.toast.selectedAll': '揀晒全部 {count} 把鎖。',
  'md3.locks.gate.eyebrow': '收唔返轉頭',
  'md3.locks.gate.title': '真係要除咗 {count} 把鎖？',
  'md3.locks.gate.description':
    '呢下會除咗 {count} 把鎖（{scope}），順手唔記得晒佢哋各自存住嗰個密碼記錄。啲版面同入面啲嘢一樣都唔會少。',
  'md3.locks.gate.keysLegend': '兩條匙都要扭',
  'md3.locks.gate.keyCount': '我要除咗 {count} 把鎖',
  'md3.locks.gate.keyScope': '我睇清楚係邊幾把：{scope}',
  'md3.locks.gate.sliderLabel': '推到盡先算批准（{percent}%）',
  'md3.locks.gate.sliderValue': '推咗 {percent}%',
  'md3.locks.gate.statusLocked': '兩條匙都扭埋，條桿先郁得。',
  'md3.locks.gate.statusReady': '兩條匙扭好晒。推到盡就批准。',
  'md3.locks.gate.statusMoving': '繼續推…',
  'md3.locks.gate.statusAuthorized': '批准咗。而家撳得「除咗佢」。',
  'md3.locks.gate.emergencyExit': '緊急走佬',
  'md3.locks.gate.confirm': '除咗 {count} 把鎖',
  'md3.locks.setup.title': '鎖住 {label}',
  'md3.locks.setup.titleEdit': '改 {label} 嗰把鎖',
  'md3.locks.setup.close': '唔存檔，閂咗佢',
  'md3.locks.setup.factorLegend': '呢把鎖點樣開',
  'md3.locks.setup.factorPassword': '用個密碼',
  'md3.locks.setup.factorOtp': '用你 authenticator 嗰個一次性密碼',
  'md3.locks.setup.otpUnavailable':
    '一次性密碼要靠 App 自己嗰個 authenticator，而家仲未有得用。',
  'md3.locks.setup.password': '呢把鎖嘅密碼',
  'md3.locks.setup.passwordConfirm': '再打多次',
  'md3.locks.setup.otpAccount': '呢把鎖用邊個 authenticator 記錄',
  'md3.locks.setup.otpAccountHint':
    '係 App authenticator 入面嗰個記錄嘅名嚟。個秘密本身 App 唔會攞出嚟睇。',
  'md3.locks.setup.durationLegend': '解一次鎖用得幾耐',
  'md3.locks.setup.lockOnLaunch': '開 App 嗰陣自動再鎖返',
  'md3.locks.setup.forFun':
    '呢個純粹好玩。唔係保安，冇加密，第二個人攞到部電腦一樣入到去。',
  'md3.locks.setup.recovery':
    '唔記得密碼？刪咗呢個資料夾，全部鎖一齊冇埋：{folder}',
  'md3.locks.setup.recoveryUnknown':
    '唔記得密碼？刪咗 App 嗰個本機資料夾就全部鎖一齊冇。不過而家攞唔到個確實路徑。',
  'md3.locks.setup.explanationShow': '呢樣做乜㗎？',
  'md3.locks.setup.explanationHide': '收埋個解釋',
  'md3.locks.setup.explanation':
    '鎖咗嘅版面個名照樣睇到，旁邊多粒鎖。撳入去就淨係問呢把鎖自己嗰個密碼：解咗一把唔會順手解埋第二把，鎖住嘅分頁入面再鎖住個數值，就係兩把鎖兩個答案。',
  'md3.locks.setup.provenanceDefault':
    '而家用緊出廠設定：{value}。呢把鎖仲未存過任何嘢。',
  'md3.locks.setup.provenanceStored': '呢把鎖存住嘅係：{value}。',
  'md3.locks.setup.save': '存呢把鎖',
  'md3.locks.setup.cancel': '算把啦',
  'md3.locks.setup.errorTooShort': '鎖嘅密碼要 {min} 到 {max} 個字符。',
  'md3.locks.setup.errorMismatch': '兩次打嘅密碼唔一樣。',
  'md3.locks.setup.errorOtpAccount': '講清楚呢把鎖睇邊個 authenticator 記錄。',
  'md3.locks.setup.errorVault': '存唔到呢把鎖：{error}',
  'md3.locks.setup.errorOtpUnavailable':
    '存唔到呢把鎖：App 嗰個 authenticator 而家用唔到，一次性密碼冇得對。',
  'md3.locks.setup.minutesLabel': '幾多分鐘',
  'md3.locks.unlock.title': '開 {label}',
  'md3.locks.unlock.passwordLabel': '呢把鎖嘅密碼',
  'md3.locks.unlock.codeLabel': 'Authenticator 而家 show 緊嗰組數',
  'md3.locks.unlock.durationLegend': '解完鎖幾耐',
  'md3.locks.unlock.submit': '開鎖',
  'md3.locks.unlock.cancel': '算把啦',
  'md3.locks.unlock.forFun':
    '呢個純粹好玩。唔係保安，冇加密，第二個人攞到部電腦一樣入到去。',
  'md3.locks.unlock.recovery':
    '唔記得咗？刪咗呢個資料夾，全部鎖一齊冇埋：{folder}',
  'md3.locks.unlock.recoveryUnknown':
    '唔記得咗？刪咗 App 嗰個本機資料夾就全部鎖一齊冇。不過而家攞唔到個確實路徑。',
  'md3.locks.unlock.forgotten': '唔記得咗密碼？',
  'md3.locks.unlock.forgottenUnavailable':
    '呢個版本仲未接得埋 Support Tickets，所以照上面個資料夾嚟做。',
  'md3.locks.unlock.throttled':
    '啱啱錯得太密。等 {seconds} 秒再試，或者用返上面條退路。',
  'md3.locks.unlock.unavailable':
    '呢把鎖而家對唔到：credential vault 入面搵唔到佢個記錄。用返上面條退路啦。',
  'md3.locks.unlock.success': '{label} 開咗。',
  'md3.locks.unlock.lockAgain': '再鎖返',
  'md3.locks.unlock.minutesLabel': '幾多分鐘',
  'md3.locks.menu.lockTab': '鎖住呢個分頁…',
  'md3.locks.menu.lockGroup': '鎖住呢個群組…',
  'md3.locks.menu.editLock': '改呢把鎖…',
  'md3.locks.menu.removeLock': '除咗呢把鎖',
  'md3.locks.menu.lockAgain': '而家即刻再鎖',
  'md3.locks.menu.manage': '管理啲鎖…',
  'md3.locks.affordance.locked': '{label} 鎖住咗。撳入去解鎖。',
  'md3.locks.affordance.unlocked': '{label} 解咗鎖。撳一下就再鎖返。',
  'md3.locks.searchResult.locked': '{label}（鎖住）',
  'md3.locks.bulkClose.excluded':
    '有 {count} 個鎖住嘅分頁冇閂，同釘住嗰啲一樣咁處理。',
  'md3.locks.settings.title': '版面鎖',
  'md3.locks.settings.description':
    '喺分頁、分頁群組或者外觀數值上面加個好玩嘅密碼／一次性密碼路障。預設冇開；每把鎖有自己嘅密碼。',
  'md3.locks.setupLead.plain':
    '畀呢把鎖set個密碼。佢自己一把鎖自己答，同其他鎖冇關係。',
  'md3.locks.setupLead.light':
    '畀呢把鎖set個自己嘅密碼。冇第二度會用佢，佢亦都開唔到第二度。',
  'md3.locks.setupLead.playful':
    '一把鎖一個密碼，冇得夾份平啲。冇第二度用佢，佢亦都開唔到第二度。',
  'md3.locks.setupLead.maximum':
    '呢把鎖要自己一個密碼，同其他鎖有原則咁死都唔夾份。冇第二度用佢，佢亦都開唔到第二度。',
  'md3.locks.unlockLead.plain': '呢一版鎖住咗。答返呢把鎖就開得。',
  'md3.locks.unlockLead.light': '呢一版鎖住咗。淨係佢自己嗰個密碼開得到。',
  'md3.locks.unlockLead.playful':
    '呢把鎖係你自己落嘅。淨係佢自己嗰個密碼開得到。',
  'md3.locks.unlockLead.maximum':
    '之前嗰個你落咗鎖，仲要冇同人講。淨係佢自己嗰個密碼開得到。',
  'md3.locks.wrongAttempt.plain':
    '對唔上。到而家錯咗 {failures} 次。真係唔記得就刪咗下面個資料夾。',
  'md3.locks.wrongAttempt.light':
    '唔係呢個喎。到而家錯咗 {failures} 次。真係唔記得就刪咗下面個資料夾。',
  'md3.locks.wrongAttempt.playful':
    '唔啱喎。到而家錯咗 {failures} 次。真係唔記得就刪咗下面個資料夾——條退路就係咁多。',
  'md3.locks.wrongAttempt.maximum':
    '仲係唔啱。到而家錯咗 {failures} 次。玩具鎖唔記得晒好正常嘅，真係唔記得就刪咗下面個資料夾——條退路就係咁多。',
  'md3.locks.managerLead.plain':
    '所有鎖都喺呢度，一把把改／除，或者一次過搞掂都得。',
  'md3.locks.managerLead.light':
    '所有鎖都喺呢度，每把有自己嘅密碼，一把把改／除，或者一次過搞掂都得。',
  'md3.locks.managerLead.playful':
    '你自己畀自己整嘅路障，全部喺呢度。每把有自己嘅密碼，一把把改／除，或者一次過搞掂都得。',
  'md3.locks.managerLead.maximum':
    '嚟啦，你自己攔自己條路嘅路障大全，一個都冇漏。每把有自己嘅密碼，一把把改／除，或者一次過搞掂都得。',
  'md3.history.filterPlaceholder': '篩吓啲 commit',
  'md3.history.fieldLabel': 'commit',
  'md3.history.chipRowLabel': 'Commit 篩選',
  'md3.history.chip.unpushed': '未推上去',
  'md3.history.chip.tagged': '有 tag',
  'md3.history.chip.mine': '我嘅',
  'md3.history.chip.merges': 'Merge',
  'md3.history.toggleGraph': 'Commit 圖',
  'md3.history.toggleDates': '真實日期',
  'md3.history.sortAndGroup': '排序同分組',
  'md3.history.listLabel': 'Commit 清單',
  'md3.history.empty': '呢個篩選冇夾到任何 commit。',
  'md3.history.byline': '{author} · {time}',
  'md3.history.detail': '{stat} · {files} 個檔案 · {kind} · {branch}',
  'md3.history.detailWithoutStats': '{kind} · {branch}',
  'md3.history.kind.merge': '合併 commit',
  'md3.history.kind.verified': '驗證過',
  'md3.history.kind.unverified': '未驗證',
  'md3.history.notPushed': '未推上去',
  'md3.history.pin': '釘住呢個 commit',
  'md3.history.unpin': '唔釘住呢個 commit',
  'md3.history.rowMenu': 'Commit {sha} 嘅動作',
  'md3.history.rowMenuHint': 'Revert、cherry-pick、開 tag、reset',
  'md3.history.fileMenu': '喺編輯器開、複製路徑、睇 blame',
  'md3.history.sheet.byline': '{author} 喺 {time} commit',
  'md3.history.sheet.close': '閂咗 commit 詳情',
  'md3.history.sheet.copySha': '複製 SHA {sha}',
  'md3.history.sheet.fileCount': '{count} 個檔案',
  'md3.history.sheet.fileListLabel': '呢個 commit 入面嘅檔案',
  'md3.history.sheet.fileEntry': '{path}，{stat}',
  'md3.history.sheet.viewOnGitHub': '喺 GitHub 度睇',
  'md3.history.sheet.revert': 'Revert 呢個 commit',
  'md3.history.sheet.menu': 'Cherry-pick、開 tag、reset',
  'md3.destructiveGate.eyebrow': '破壞性操作',
  'md3.destructiveGate.lead.plain':
    '扭好兩條匙，跟住將授權桿一路拉到最尾。未到之前咩都唔會發生。',
  'md3.destructiveGate.lead.light':
    '兩條匙，再加一條要拉到盡嘅桿。整到咁煩係故意嘅，條桿未到尾之前咩都唔會發生。',
  'md3.destructiveGate.lead.playful':
    '兩條匙加一條長桿擋喺你同呢件事中間。整到咁麻煩就係唔想你手滑撳錯，條桿未拉到最尾之前，一樣嘢都唔會郁。',
  'md3.destructiveGate.lead.maximum':
    '歡迎光臨雙匙發射台：兩條匙扭晒，再認認真真將條桿推到最盡。未到最尾之前一樣嘢都唔會發生 —— 要你做足呢一輪，為嘅就係呢一句。',
  'md3.destructiveGate.irreversibleLabel': '救唔返：',
  'md3.destructiveGate.keysLegend': '扭好兩條匙先解鎖到條桿',
  'md3.destructiveGate.keyTarget': '我核對咗要郁邊個：{target}',
  'md3.destructiveGate.keyEffect': '我接受個後果：{effect}',
  'md3.destructiveGate.sliderLabel': '將條桿一路拉到最尾先批准',
  'md3.destructiveGate.sliderValue': '批准咗 {percent}%',
  'md3.destructiveGate.stateLocked': '兩條匙都要扭咗，條桿先郁得。',
  'md3.destructiveGate.stateArmed': '兩條匙扭好喇，將條桿一路拉到最尾就批准。',
  'md3.destructiveGate.stateMoving': '繼續拉。條桿未到最尾，咩都唔會刪。',
  'md3.destructiveGate.stateAuthorized': '批准咗，而家撳到確認掣。',
  'md3.destructiveGate.emergencyExit': '緊急撤退',
  'md3.destructiveGate.emergencyExitName':
    '緊急撤退 —— 唔執行呢個破壞性操作，直接關咗佢',
  'md3.destructiveGate.busy': '執行緊。要等到知道實際結果，呢個閘先會收。',
  'md3.inbox.gate.title': '刪走 {count} 個通知？',
  'md3.inbox.gate.summary': '呢下會喺收件匣度刪走 {count} 個通知：{scope}。',
  'md3.inbox.gate.irreversible': '刪咗嘅通知喺收件匣度攞唔返。',
  'md3.inbox.gate.keyTarget': '{count} 個通知 —— {scope}',
  'md3.inbox.gate.keyEffect': '佢哋會離開收件匣，喺收件匣度攞唔返。',
  'md3.inbox.gate.confirm': '刪走 {count} 個',
  'md3.auth.pane': '驗證器',
  'md3.auth.list': '已登記嘅第二重驗證',
  'md3.auth.searchPlaceholder': '搵驗證項目',
  'md3.auth.searchField': '驗證器項目',
  'md3.auth.invalidPattern': '呢個 pattern 唔啱格式，所以而家乜都未篩走。',
  'md3.auth.filters': '分組篩選',
  'md3.auth.chipUngrouped': '未分組',
  'md3.auth.addFactor': '加驗證項目',
  'md3.auth.empty.none.plain':
    '而家一個第二重驗證都未登記。加一個，個 App 就會幫你顯示佢嘅密碼。',
  'md3.auth.empty.none.light':
    '而家乜都未登記。加個項目，啲密碼就會喺度出現，三十秒轉一次。',
  'md3.auth.empty.none.playful':
    '空空如也嘅驗證器，起碼快到爆。加個項目，佢就會開始幫你倒數。',
  'md3.auth.empty.none.maximum':
    '零個項目。冇嘢好數、冇嘢好複製、冇嘢好蝕——做保安工具嚟講勁到冇朋友，做你嘅工具嚟講就完全冇用。加個項目，等佢做返啲嘢。',
  'md3.auth.empty.noMatch': '搵唔到夾嘅項目。',
  'md3.auth.selectAllFiltered': '揀晒夾到嘅 {count} 個項目',
  'md3.auth.selectAllEverything': '揀晒全部 {count} 個項目',
  'md3.auth.selectionCount': '揀咗 {count} 個',
  'md3.auth.invertSelection': '揀返相反嗰啲',
  'md3.auth.bulkGroup': '搬入分組',
  'md3.auth.bulkDelete': '刪走',
  'md3.auth.bulkExport': '匯出',
  'md3.auth.scopedAction': '{label}——{scope}',
  'md3.auth.moreActions': '更多驗證器操作',
  'md3.auth.scope.selection': '揀咗嘅 {count} 個項目',
  'md3.auth.scope.filtered': '夾到而家篩選嘅 {count} 個項目',
  'md3.auth.scope.all': '全部 {count} 個項目',
  'md3.auth.scope.one': '一個項目',
  'md3.auth.explain.toggle': '呢個清單點運作',
  'md3.auth.explain.body':
    '啲密碼係喺呢部機度計出嚟嘅，用系統時鐘同埋收喺作業系統憑證庫入面嘅密鑰。冇嘢會傳去任何地方，冇帳戶、冇同步；平時匯出會帶齊每個欄位，就係唔會帶密鑰。',
  'md3.auth.explain.provenance':
    '而家用緊嘅預設值：新項目一律用 {algorithm}、{digits} 位數、每 {period} 秒轉一次——出廠值嚟嘅，因為冇人改過。',
  'md3.auth.row.select': '揀 {title}',
  'md3.auth.row.code': '{title} 而家嘅密碼',
  'md3.auth.row.codeChanged': '{title} 嘅新密碼：{code}',
  'md3.auth.row.copyCode': '複製 {title} 而家嘅密碼',
  'md3.auth.row.nextCode': '下一個：{code}',
  'md3.auth.row.countdown': '{seconds} 秒',
  'md3.auth.row.countdownText': '呢個密碼仲有 {seconds} 秒有效',
  'md3.auth.row.missingSecret':
    '呢個項目冇存到密鑰，所以出唔到密碼。刪咗佢再登記過。',
  'md3.auth.row.edit': '改 {title}',
  'md3.auth.row.delete': '刪走 {title}',
  'md3.auth.row.added': '{timestamp} 登記',
  'md3.auth.row.parameters': '{algorithm}、{digits} 位數、每 {period} 秒',
  'md3.auth.clock.ok':
    '呢部機嘅時鐘同參考時間相差喺 {tolerance} 秒之內，所以啲密碼會俾人收。',
  'md3.auth.clock.ahead':
    '呢部機嘅時鐘快咗 {seconds} 秒，超出咗呢啲密碼容忍嘅 {tolerance} 秒。快啲校返系統時間，唔係下面啲密碼會俾人彈返轉頭。',
  'md3.auth.clock.behind':
    '呢部機嘅時鐘慢咗 {seconds} 秒，超出咗呢啲密碼容忍嘅 {tolerance} 秒。快啲校返系統時間，唔係下面啲密碼會俾人彈返轉頭。',
  'md3.auth.clock.unverified':
    '未同呢部機嘅時鐘對過任何參考，所以唔知呢啲密碼會唔會俾人收。',
  'md3.auth.toast.registered': '登記咗 {title}',
  'md3.auth.toast.edited': '更新咗 {title}',
  'md3.auth.toast.deleted': '刪走咗 {title}',
  'md3.auth.toast.deletedMany': '刪走咗 {count} 個項目',
  'md3.auth.toast.vaultFailed':
    '有 {count} 條密鑰喺憑證庫度刪唔到，仲留喺呢部機度。',
  'md3.auth.toast.grouped': '搬咗 {count} 個項目入 {group}',
  'md3.auth.toast.ungrouped': '搬咗 {count} 個項目出晒所有分組',
  'md3.auth.toast.copied': '複製咗 {title} 嘅密碼',
  'md3.auth.toast.exported': '用 {format} 匯出咗 {count} 個項目，冇帶密鑰',
  'md3.auth.toast.secretsExported': '用明文匯出咗 {count} 條可用密鑰',
  'md3.auth.toast.selectedAll': '揀晒全部 {count} 個項目',
  'md3.auth.toast.moved': '搬咗 {title}',
  'md3.auth.listMenu.title': '驗證器',
  'md3.auth.listMenu.selectFiltered': '揀晒夾到嘅 {count} 個項目',
  'md3.auth.listMenu.selectEverything': '揀晒全部 {count} 個項目',
  'md3.auth.listMenu.invert': '揀返相反嗰啲',
  'md3.auth.listMenu.clearSelection': '唔揀住',
  'md3.auth.listMenu.group': '搬…入分組…',
  'md3.auth.listMenu.deleteScope': '刪走 {count} 個項目…',
  'md3.auth.listMenu.export': '匯出 {count} 個項目…',
  'md3.auth.listMenu.exportSecrets': '用明文匯出 {count} 條密鑰…',
  'md3.auth.rowMenu.title': '驗證項目',
  'md3.auth.rowMenu.copyCode': '複製而家嘅密碼',
  'md3.auth.rowMenu.copyNext': '複製下一個密碼',
  'md3.auth.rowMenu.edit': '改呢個項目…',
  'md3.auth.rowMenu.group': '搬…入分組…',
  'md3.auth.rowMenu.moveUp': '搬上',
  'md3.auth.rowMenu.moveDown': '搬落',
  'md3.auth.rowMenu.select': '加入揀咗嗰堆',
  'md3.auth.rowMenu.deselect': '喺揀咗嗰堆度攞走',
  'md3.auth.rowMenu.delete': '刪走呢個項目',
  'md3.auth.rowMenu.exportOne': '匯出呢個項目…',
  'md3.auth.exportMenu.title': '匯出（唔帶密鑰）',
  'md3.auth.exportMenu.filterPlaceholder': '篩格式',
  'md3.auth.groupMenu.title': '搬入分組',
  'md3.auth.groupMenu.filterPlaceholder': '篩分組',
  'md3.auth.groupMenu.ungrouped': '唔要分組',
  'md3.auth.groupMenu.empty':
    '而家仲未有分組。改項目嗰陣改個名，佢就會喺度出現。',
  'md3.auth.export.omissionNotice':
    '呢個檔案特登冇帶任何密鑰。下面每個項目淨係列出發行方、帳戶同參數。',
  'md3.auth.secrets.warning':
    '呢個檔案用明文裝住可以用嘅第二重驗證。邊個睇到都可以整出你嘅密碼。',
  'md3.auth.gate.title': '刪走 {count} 個項目',
  'md3.auth.gate.summary':
    '會刪走 {count} 個已登記項目（{scope}），連佢哋嘅密鑰一齊唔記得晒。',
  'md3.auth.gate.irreversible':
    '啲密鑰會喺呢部機嘅憑證庫度消失。呢度冇嘢救得返——每個帳戶都要重新發一條俾你。',
  'md3.auth.gate.keyTarget': '{count} 個項目——{scope}',
  'md3.auth.gate.keyEffect': '佢哋嘅密鑰會離開呢部機，救唔返。',
  'md3.auth.gate.confirm': '刪走 {count} 個',
  'md3.auth.secretsGate.title': '用明文匯出 {count} 條密鑰',
  'md3.auth.secretsGate.summary':
    '會將 {count} 條可以用嘅第二重驗證（{scope}）用 otpauth:// 連結寫入一個純文字檔。',
  'md3.auth.secretsGate.irreversible':
    '個檔案一寫咗出去，個 App 就收唔返。邊個睇到都可以整出你嗰啲帳戶嘅密碼。',
  'md3.auth.secretsGate.keyTarget': '{count} 個項目——{scope}',
  'md3.auth.secretsGate.keyEffect':
    '個檔案入面係可以用嘅密鑰，唔淨係一張帳戶清單。',
  'md3.auth.secretsGate.confirm': '匯出 {count} 條密鑰',
  'md3.auth.register.title': '加一個第二重驗證',
  'md3.auth.register.editTitle': '改 {title}',
  'md3.auth.register.close': '唔加住，閂咗佢',
  'md3.auth.register.sourceLegend': '條密鑰邊度嚟',
  'md3.auth.register.source.generate': '喺度整一條',
  'md3.auth.register.source.uri': '貼條連結',
  'md3.auth.register.source.manual': '自己打密鑰',
  'md3.auth.register.source.image': '讀張圖',
  'md3.auth.register.source.clipboard': '讀剪貼簿',
  'md3.auth.register.source.camera': '用鏡頭掃',
  'md3.auth.register.hint.generate':
    '個 App 會喺呢部機度整條密鑰，再畫個 QR 俾你掃入你要保護嗰個帳戶。',
  'md3.auth.register.hint.uri':
    '貼返發行方俾你嘅 otpauth:// 連結。喺呢度讀，唔會傳去任何地方。',
  'md3.auth.register.hint.manual': '照發行方講嘅，打返個 base32 密鑰同啲參數。',
  'md3.auth.register.hint.image': '揀返張儲低咗嘅 QR 圖。喺呢部機度解碼。',
  'md3.auth.register.hint.clipboard':
    '喺剪貼簿度讀個 QR 圖，或者一條 otpauth:// 連結。',
  'md3.auth.register.hint.camera': '用呢部機嘅鏡頭影住發行方 show 緊嗰個 QR。',
  'md3.auth.register.issuerLabel': '發行方',
  'md3.auth.register.issuerPlaceholder': '呢個驗證保護緊邊個服務',
  'md3.auth.register.accountLabel': '帳戶',
  'md3.auth.register.accountPlaceholder': '你喺嗰邊嘅用戶名或者電郵',
  'md3.auth.register.groupLabel': '分組',
  'md3.auth.register.groupPlaceholder': '唔想分組就留白',
  'md3.auth.register.algorithmLabel': '演算法',
  'md3.auth.register.digitsLabel': '位數',
  'md3.auth.register.periodLabel': '每個密碼幾多秒',
  'md3.auth.register.secretLabel': 'Base32 密鑰',
  'md3.auth.register.secretPlaceholder': '得 A 至 Z 同 2 至 7',
  'md3.auth.register.uriLabel': 'otpauth:// 連結',
  'md3.auth.register.uriPlaceholder': 'otpauth://totp/…',
  'md3.auth.register.revealSecret': 'show 條密鑰出嚟',
  'md3.auth.register.hideSecret': '收埋條密鑰',
  'md3.auth.register.secretHidden':
    '條密鑰收埋咗。如果你唔係掃 QR，而係要自己打入去，先至 show 佢。',
  'md3.auth.register.copySecret': '複製條密鑰',
  'md3.auth.register.copiedSecret': '條密鑰複製咗去剪貼簿',
  'md3.auth.register.qrAlt':
    '{issuer} 嘅 {account} 配對 QR。入面裝住旁邊嗰條一模一樣嘅密鑰，用 {algorithm}、{digits} 位數、每 {period} 秒轉一次。',
  'md3.auth.register.qrAltNoIssuer':
    '{account} 嘅配對 QR。入面裝住旁邊嗰條一模一樣嘅密鑰，用 {algorithm}、{digits} 位數、每 {period} 秒轉一次。',
  'md3.auth.register.qrCaption':
    '攞你要保護嗰個帳戶掃呢個，或者照旁邊條密鑰打入去。',
  'md3.auth.register.parameterSummary':
    '{algorithm} · {digits} 位數 · {period} 秒',
  'md3.auth.register.chooseImage': '揀張 QR 圖',
  'md3.auth.register.readClipboard': '讀剪貼簿',
  'md3.auth.register.startCamera': '開鏡頭',
  'md3.auth.register.stopCamera': '熄鏡頭',
  'md3.auth.register.cameraLive':
    '鏡頭開緊。將個 QR 擺正對住鏡頭；斜住影嘅碼係讀唔到嘅。',
  'md3.auth.register.cameraPreview': '鏡頭即時畫面',
  'md3.auth.register.cameraMissing':
    '呢部機冇鏡頭，冇嘢好掃。用圖檔嗰條路讀個 QR 啦。',
  'md3.auth.register.cameraRefused':
    '鏡頭俾人拒絕咗。開返個 App 嘅鏡頭權限，或者改用圖檔讀個 QR。',
  'md3.auth.register.confirmHeading': '確認配對',
  'md3.auth.register.confirmHint.plain':
    '打返一個而家嘅密碼。夾到先加得呢個項目，咁掃錯咗條密鑰就唔會遲啲鎖死你。',
  'md3.auth.register.confirmHint.light':
    '打返一個密碼，等大家都知佢 work。夾到先加得——寧願而家發現掃錯，好過登入嗰陣先發現。',
  'md3.auth.register.confirmHint.playful':
    '打返一個密碼就搞掂。夾到先加得呢個項目，因為喺登入畫面前面先發現掃錯咗條密鑰，個晚一定唔會好過。',
  'md3.auth.register.confirmHint.maximum':
    '證明俾我睇。打返一個而家嘅密碼。夾到先加得，因為唔係嘅話你會有一條收得靚靚、出嚟嘅數字又靚又自信又全世界都唔收嘅密鑰——而你一定係喺最衰嗰刻先發現。',
  'md3.auth.register.confirmLabel': '而家嘅密碼',
  'md3.auth.register.confirmPlaceholder': '而家 show 緊嗰個密碼',
  'md3.auth.register.verifyFailed':
    '呢個密碼同呢條密鑰對唔上。睇清楚個密碼，順便睇下呢部機嘅時鐘啱唔啱。',
  'md3.auth.register.add': '加驗證項目',
  'md3.auth.register.save': '儲低啲改動',
  'md3.auth.register.cancel': '算數',
  'md3.auth.register.error.badUri': '呢條唔係個 App 讀得明嘅 otpauth:// 連結。',
  'md3.auth.register.error.wrongType':
    '呢條連結係計數器嗰種驗證。呢個驗證器淨係讀時間制嘅密碼。',
  'md3.auth.register.error.badSecret':
    '呢條密鑰唔係正確嘅 base32。應該淨係 A 至 Z 同 2 至 7。',
  'md3.auth.register.error.missingAccount':
    '呢條連結冇帶帳戶名，冇嘢好將個項目歸檔。',
  'md3.auth.register.error.noQr': '喺張圖度搵唔到 QR。',
  'md3.auth.register.error.unreadableFile': '呢個檔案讀唔到做圖片。',
  'md3.auth.register.error.notSquare':
    '搵到個 QR，但係格網讀唔到。將個碼擺正對住鏡頭再試過。',
  'md3.auth.register.error.damaged': '搵到個 QR，但係爛得滯讀唔到。',
  'md3.auth.register.error.unsupported': '呢個 QR 裝住個 App 讀唔到嘅內容。',
  'md3.auth.register.error.encodeFailed':
    '條配對連結太長，畫唔到做 QR：{detail}',
  'md3.auth.register.error.accountRequired': '一定要有個帳戶名。',
  'md3.auth.register.explain.toggle': '呢條密鑰會點',
  'md3.auth.register.explain.storage':
    '條密鑰喺呢部機度整，收喺作業系統嘅憑證庫入面，用呢個項目自己個 id 做鎖匙。佢唔會入設定檔、匯出檔、log、截圖或者個 App 嘅本機歷史，亦都唔會離開呢部機。',
  'md3.auth.register.explain.provenanceDefault':
    '而家用緊嘅預設值：{algorithm}、{digits} 位數、每 {period} 秒——出廠值嚟嘅，因為冇嘢講過唔同。',
  'md3.auth.register.explain.provenanceIssuer':
    '由發行方定：{algorithm}、{digits} 位數、每 {period} 秒——喺你俾嘅連結度讀返嚟，唔係個 App 嘅預設值。',

  // Bulk actions across every MD3 list destination. Cantonese.
  'md3.bulk.selectAllFiltered': '揀晒符合篩選嘅 {count} 個',
  'md3.bulk.selectAllEverything': '全部揀晒（{count} 個）',
  'md3.bulk.selectionCount': '揀咗 {count} 個',
  'md3.bulk.invertSelection': '反轉選取',
  'md3.bulk.clearSelection': '清走選取',
  'md3.bulk.export': '匯出',
  'md3.bulk.scopedAction': '{label} — {scope}',
  'md3.bulk.scopeSelected': '揀咗嘅 {count} 個',
  'md3.bulk.scopeFiltered': '符合篩選嘅 {count} 個',
  'md3.bulk.scopeEverything': '全部 {count} 個',
  'md3.bulk.excluded': '跳咗 {count} 個：{reason}',
  'md3.bulk.exportMenu.title': '匯出{scope}',
  'md3.bulk.exportMenu.filterPlaceholder': '篩格式',
  'md3.bulk.toast.exported': '已經用 {format} 匯出咗 {count} 個。',
  'md3.bulk.toast.exportedLossy': '已經用 {format} 匯出咗 {count} 個。{loss}。',
  'md3.listExport.schema': 'UTF-8、LF 換行。{count} 個欄位：{fields}。',
  'md3.listExport.lossLineBreaks': '呢個格式會將 {fields} 入面嘅換行變做空格',
  'md3.destructiveGate.previewHeading': '呢下會搞到呢 {count} 個：',
  'md3.destructiveGate.previewExcludedHeading':
    '有 {count} 個唔會郁到——{reason}：',
  'md3.branches.bulkLabel': '分支嘅批量操作',
  'md3.branches.bulkPin': '釘住',
  'md3.branches.bulkHide': '收埋',
  'md3.branches.bulkDelete': '刪走',
  'md3.branches.bulkCopyNames': '複製名',
  'md3.branches.bulkSkipCurrent': '你而家 check out 緊嗰條分支',
  'md3.branches.bulkSkipCannotHide': '本來就收埋咗，或者收唔到',
  'md3.branches.row.select': '揀「{name}」嚟做批量操作',
  'md3.branches.gate.title': '刪走 {count} 條分支',
  'md3.branches.gate.summary':
    '呢下會喺呢部電腦度刪走 {count} 條分支（{scope}）。',
  'md3.branches.gate.irreversible':
    '淨係得嗰條分支搵到嘅 commit 會一齊冇埋，呢個 app 救唔返。',
  'md3.branches.gate.keyTarget': '刪走 {count} 條分支（{scope}）',
  'md3.branches.gate.keyEffect': '我明白呢啲分支會冇咗',
  'md3.branches.gate.confirm': '刪走 {count} 條分支',
  'md3.branches.detail.notCompared': '仲未比較過',
  'md3.branches.detail.tracksGone': '本來跟住 {upstream}，而家遠端已經冇咗佢',
  'md3.branches.mergeAllProgressUnknown':
    '合併緊所有分支，暫時搞掂咗 {completed} 條',
  'md3.branches.mergeAllProgressBranchUnknown':
    '合併緊 {branch}，暫時搞掂咗 {completed} 條',
  'md3.history.bulkLabel': 'Commit 嘅批量操作',
  'md3.history.bulkCopyShas': '複製 SHA',
  'md3.history.row.select': '揀 commit「{summary}」嚟做批量操作',
  'md3.history.detailWithoutBranch': '{kind} · {stat} · {files}',
  'md3.history.detailWithoutStatsOrBranch': '{kind}',
  'md3.history.sheet.statsPending': '數緊改咗啲乜',
  'md3.history.sheet.fileEntryWithoutStats': '{path}',
  'md3.actions.meta.number': '#{number}',
  'md3.actions.detail.actor': '由 {actor} 觸發',
  'md3.actions.detail.jobs': '{jobs} 個工作',
  'md3.actions.detail.attempt': '第 {attempt} 次嘗試',
  'md3.actions.status.queued': '排緊隊',
  'md3.actions.status.running': '跑緊',
  'md3.actions.status.success': '成功',
  'md3.actions.status.failed': '仆咗街',
  'md3.actions.status.cancelled': '取消咗',
  'md3.actions.status.skipped': '跳咗過',
  'md3.actions.status.neutral': '唔好唔壞',
  'md3.actions.status.timedOut': '超咗時',
  'md3.actions.status.actionRequired': '要你出手',
  'md3.actions.status.stale': '過咗氣',
  'md3.actions.status.startupFailure': '起步就仆咗',
  'md3.adapters.day.today': '今日',
  'md3.adapters.day.yesterday': '尋日',
  'md3.adapters.branch.pullRequestOpen': '有 pull request 開緊',
  'md3.adapters.branch.metaUpdatedBy': '{when}由 {author} 更新',
  'md3.adapters.agent.busy': '個代理仲做緊嘢。想再落指令，就要先撳暫停。',
  'md3.adapters.agent.noAgent': '呢個工作樹未掛住任何代理。',
  'md3.adapters.agent.noInstruction':
    '呢個工作階段冇記低過任何指令，續唔到。喺下面打一句再 send。',
  'md3.adapters.agent.noRunner':
    '呢部電腦冇裝 {agent}，所以乜都 send 唔到俾佢。',
  'md3.adapters.agent.instructionSentTitle': 'send 咗俾 {agent}',
  'md3.adapters.agent.instructionSentBody': '{agent} 而家喺度搞緊 {name}。',
  'md3.adapters.agent.instructionRefusedTitle': '乜都冇 send 到',
  'md3.adapters.agent.permissions.read': '讀',
  'md3.adapters.agent.permissions.commit': 'commit',
  'md3.adapters.agent.permissions.push': 'push',
  'md3.adapters.agent.permissions.none': '乜權限都冇俾',
  'md3.adapters.agent.permissions.granted': '{list} 權限',
  'md3.adapters.agent.permissions.asks': '{name}（要問過先）',
  'md3.inbox.time.unknown': '時間不明',
  'md3.repositories.remotesUnknown': '未數過有幾多個遠端',
  'md3.terminal.alreadyRunning': '呢個 session 有指令跑緊。',
  'md3.terminal.noRepository': '開個 repository 先至開得終端機。',
  'md3.terminal.sessionLabelNumbered': '{shell} — {repository}（{number}）',
  'md3.compose.contextWithoutStats':
    '{branch} 上面 {total} 個檔案入面揀咗 {included} 個',
  'md3.diffPane.fileTabNameWithoutStats': '{name} — {path}',
  'md3.search.invalidPattern':
    '而家乜都冇篩到：呢個 pattern 編譯唔到。{reason}',
  'md3.search.patternTooLong': '個 pattern 唔好多過 {limit} 個字元。',
  'palette.authenticator': '開驗證器',
  'palette.authenticatorDescription':
    '睇即時嘅一次性密碼，或者掃 QR／打密鑰去登記新帳戶。',
  'palette.surfaceLocks': '管理介面鎖',
  'palette.surfaceLocksDescription':
    '睇晒鎖咗嘅分頁同外觀設定，順手拆返你唔想要嗰個鎖。',
  'palette.supportTickets': '開支援櫃檯',
  'palette.supportTicketsDescription':
    '純屬虛構、淨係喺本機行嘅支援櫃檯，教你點樣重設唔記得咗嘅鎖。',
  'authenticatorSettings.heading': '驗證器',
  'authenticatorSettings.manage': '管理驗證器帳戶⋯',
  'authenticatorSettings.close': '閂咗個驗證器',
  'authenticatorSettings.explanationSummary': '呢個設定會改咩',
  'authenticatorSettings.boundaryNote':
    '啲密碼喺呢部電腦度計出嚟，唔使開任何帳戶。密鑰淨係擺喺作業系統嘅憑證保險箱，唔會入設定檔或者匯出檔。',
  'authenticatorSettings.provenanceNone': '呢部電腦一個帳戶都未登記。',
  'authenticatorSettings.provenanceOne': '呢部電腦登記咗一個帳戶。',
  'authenticatorSettings.provenanceMany': '呢部電腦登記咗 {count} 個帳戶。',
  'authenticatorSettings.provenanceUnread': '仲未讀過登記咗嘅帳戶。',
  'authenticatorSettings.unavailable':
    '讀唔到憑證保險箱，所以一個帳戶都顯示唔到：{error}',
  'surfaceLocks.heading': '介面鎖',
  'surfaceLocks.manage': '管理啲鎖⋯',
  'surfaceLocks.close': '閂咗個鎖管理員',
  'surfaceLocks.explanationSummary': '呢個設定會改咩',
  'surfaceLocks.boundaryNote':
    '呢個係好玩嘅減速墊，唔係保安：唔係加密，亦都擋唔到其他用呢部電腦嘅人。唔記得咗個鎖？刪咗個應用程式資料夾就一次過清晒。',
  'surfaceLocks.provenanceNone': '呢部電腦冇嘢鎖住。',
  'surfaceLocks.provenanceOne': '呢部電腦鎖住咗一個介面。',
  'surfaceLocks.provenanceMany': '呢部電腦鎖住咗 {count} 個介面。',
  'supportTicketsSetting.explanationSummary': '呢個設定會改咩',
  'supportTicketsSetting.boundaryNote':
    '乜都唔會 send 去邊。除咗呢部電腦之外根本冇任何工單，唔會發任何請求，亦都冇人喺度睇。',
  'supportTicketsSetting.provenanceNone': '呢部電腦未開過任何工單。',
  'supportTicketsSetting.provenanceOne': '呢部電腦開咗一張工單。',
  'supportTicketsSetting.provenanceMany': '呢部電腦開咗 {count} 張工單。',
  'md3.agents.bulkLabel': 'Agent 工作階段嘅批量動作',
  'md3.agents.bulkPause': '暫停',
  'md3.agents.bulkResume': '繼續',
  'md3.agents.bulkOpenLog': '開晒啲記錄',
  'md3.agents.bulkDuplicate': '複製多份',
  'md3.agents.bulkDelete': '刪咗佢',
  'md3.agents.bulkSkipNotRunning': '佢哋根本冇喺度行緊',
  'md3.agents.bulkSkipNotPaused': '佢哋根本冇暫停過',
  'md3.agents.bulkSkipMissing': '佢哋個工作目錄喺硬碟度唔見咗',
  'md3.agents.bulkSkipProtected': '佢哋係主工作區、上咗鎖、又或者早就唔見咗',
  'md3.agents.gate.title': '刪走 {count} 個工作階段',
  'md3.agents.gate.summary':
    '呢下會刪走 {count} 個 agent 工作階段（{scope}）、佢哋嘅工作目錄同埋全部對話記錄。',
  'md3.agents.gate.irreversible':
    '刪咗嘅工作階段、工作目錄同對話記錄係救唔返㗎喇。',
  'md3.agents.gate.keyTarget': '刪走 {count} 個工作階段（{scope}）',
  'md3.agents.gate.keyEffect': '我明白呢啲工作目錄同對話記錄會冇晒',
  'md3.agents.gate.confirm': '刪走 {count} 個工作階段',
  'md3.agents.row.select': '揀工作階段 {title}',
  'md3.changes.bulkLabel': '改動檔案嘅批量操作',
  'md3.changes.bulkInclude': '入埋佢',
  'md3.changes.bulkExclude': '唔要住',
  'md3.changes.bulkCopyPaths': '複製路徑',
  'md3.changes.bulkDiscard': '掉咗佢',
  'md3.changes.bulkSkipIncluded': '本來就已經入咗 commit',
  'md3.changes.bulkSkipExcluded': '本來就冇入 commit',
  'md3.changes.row.select': '揀「{name}」嚟做批量操作',
  'md3.changes.gate.title': '掉咗 {count} 個檔案嘅改動',
  'md3.changes.gate.summary':
    '呢下會將 {count} 個檔案（{scope}）喺工作目錄嘅改動全部掉晒。',
  'md3.changes.gate.irreversible':
    '呢啲改動未入過任何 commit，掉咗之後呢個 app 幫你救唔返㗎喇。',
  'md3.changes.gate.keyTarget': '掉咗 {count} 個檔案（{scope}）',
  'md3.changes.gate.keyEffect': '我明白呢啲改動會冇晒',
  'md3.changes.gate.confirm': '掉咗 {count} 個檔案',
  'md3.history.bulkPin': '釘住',
  'md3.history.bulkViewOnGitHub': '喺 GitHub 睇',
  'md3.history.bulkRevert': '還原',
  'md3.history.bulkSkipMerge':
    'merge commit 要先揀邊個 parent 先還原得，唔夠料喺呢度問你',
  'md3.history.gate.title': '還原 {count} 個 commit',
  'md3.history.gate.summary':
    '呢下會喺而家嘅 branch 逐個寫返轉頭，{count} 個 commit（{scope}）一個都唔走雞。',
  'md3.history.gate.irreversible':
    '啲還原 commit 係真嘅 commit，要拆返轉頭就要再郁 history，麻煩過而家。',
  'md3.history.gate.keyTarget': '還原 {count} 個 commit（{scope}）',
  'md3.history.gate.keyEffect': '我知每個都會寫多個還原 commit 出嚟',
  'md3.history.gate.confirm': '還原 {count} 個 commit',
  'md3.history.kind.unchecked': '未查過簽名',
  'md3.repositories.bulkSkipMissing': '佢哋個資料夾喺硬碟度唔見咗',
  'md3.actions.bulkSkipActive': '仲喺度行緊',
  'md3.actions.bulkSkipFinished': '早就跑完咗',
  'md3.actions.gate.title': '取消 {count} 個 workflow run',
  'md3.actions.gate.summary':
    '而家會放棄 {scope} 入面嘅 {count} 個 run，佢哋做咗嘅嘢都會一齊冇埋。',
  'md3.actions.gate.irreversible':
    '取消咗嘅 run 冇得接住行，淨係可以由頭再嚟過。',
  'md3.actions.gate.keyTarget': '第一條匙 —— 取消 {scope} 入面嘅 {count} 個',
  'md3.actions.gate.keyEffect': '第二條匙 —— 我知做咗一半嘅嘢會冇咗',
  'md3.actions.gate.confirm': '取消 {count} 個 run',
  'md3.terminal.bulkLabel': 'Shell 嘅批量動作',
  'md3.terminal.bulkRestart': '重開',
  'md3.terminal.bulkClose': '閂咗佢',
  'md3.terminal.bulkSelected': '已經揀咗嚟做批量動作',
  'md3.terminal.bulkSkipNotRunning': '嗰啲根本冇指令喺度行緊',
  'md3.terminal.bulkSkipHealthy': '嗰啲仲好地地，未收檔又未死',
  'md3.terminal.gate.title': '閂 {count} 個 shell',
  'md3.terminal.gate.summary':
    '呢下會閂咗 {count} 個 shell（{scope}）。入面行緊嘅指令會停晒，啲輸出紀錄亦都冇埋。',
  'md3.terminal.gate.irreversible': '啲輸出紀錄冇咗就搵唔返㗎喇。',
  'md3.terminal.gate.keyTarget': '閂 {count} 個 shell（{scope}）',
  'md3.terminal.gate.keyEffect': '我知呢啲 shell 同佢哋嘅輸出紀錄會冇晒',
  'md3.terminal.gate.confirm': '閂 {count} 個 shell',
  'md3.inbox.bulkLabel': '通知嘅批量操作',
  'md3.inbox.bulkMute': '熄佢聲',
  'md3.inbox.bulkUnmute': '開返聲',
  'md3.inbox.bulkCopyDetails': '複製詳情',
  'md3.inbox.bulkSkipAlreadyRead': '本來就睇咗',
  'md3.inbox.bulkSkipAlreadyUnread': '本來就未睇',
  'md3.inbox.bulkSkipAlreadyMuted': '本來就熄咗聲',
  'md3.inbox.bulkSkipNotMuted': '本來就冇熄聲',
  'md3.inbox.toast.mutedMany': '熄咗 {count} 條對話嘅聲',
  'md3.inbox.toast.unmutedMany': '開返 {count} 條對話嘅聲',
  'md3.locks.bulkLabel': '啲鎖嘅大批操作',
  'md3.locks.bulkLockAgain': '再鎖返',
  'md3.locks.bulkRemove': '除咗啲鎖…',
  'md3.locks.bulkSkipAlreadyLocked': '本身已經鎖咗',

  // Bulk actions across every MD3 list destination. Cantonese.
  'md3.repositories.empty.plain': '冇 repo 啱呢個篩選。',
  'md3.repositories.empty.light': '冇 repo 啱到呢個篩選喎。',
  'md3.repositories.empty.playful':
    '一個 repo 都唔啱。呢個篩選做嘢認真到有啲過分。',
  'md3.repositories.empty.maximum':
    '連一個 repo 都夾唔到。呢個篩選掃到成個櫃空晒，仲企喺度一副好滿意嘅樣。',
  'md3.changes.empty.plain': '冇改咗嘅檔案啱呢個篩選。',
  'md3.changes.empty.light': '呢個篩選夾唔到任何改咗嘅檔案。',
  'md3.changes.empty.playful':
    '冇改咗嘅檔案啱呢個篩選。唔係樣樣都執靚晒，就係個篩選揀擇。',
  'md3.changes.empty.maximum':
    '一個改咗嘅檔案都捱唔過呢個篩選。唔係個工作目錄乾淨到閃令令，就係呢個篩選嘅要求高到冇人達到到。',
  'md3.history.empty.plain': '呢個篩選冇夾到任何 commit。',
  'md3.history.empty.light': '呢個篩選夾唔到任何 commit 喎。',
  'md3.history.empty.playful': '冇 commit 啱呢個篩選。段歷史今日怕醜。',
  'md3.history.empty.maximum':
    '一個 commit 都唔啱呢個篩選。成段歷史睇完你嘅條件之後，好有禮貌噉拒絕咗。',
  'md3.branches.empty.plain': '冇分支啱呢個篩選。',
  'md3.branches.empty.light': '呢個篩選夾唔到任何分支。',
  'md3.branches.empty.playful': '冇分支啱呢個篩選。一條都冇。',
  'md3.branches.empty.maximum':
    '冇一條分支啱呢個篩選。佢哋逐條望完你打嗰啲字，然後就散水晒。',
  'md3.actions.logEmpty.plain': '暫時未有 log 輸出。',
  'md3.actions.logEmpty.light': '暫時仲未有 log 出到嚟。',
  'md3.actions.logEmpty.playful': '暫時未有 log。呢次執行仲未開過口。',
  'md3.actions.logEmpty.maximum':
    '暫時一行 log 都冇。呢次執行喺度扮高深，一個字都唔肯講。',
  'md3.agents.emptyNoSessions.plain': '仲未有代理工作階段。',
  'md3.agents.emptyNoSessions.light': '暫時仲未開過代理工作階段。',
  'md3.agents.emptyNoSessions.playful': '仲未有代理工作階段。仲未派過工俾人。',
  'md3.agents.emptyNoSessions.maximum':
    '一個代理工作階段都未有。成班人坐晒喺度等你派工。',
  'md3.inbox.empty.caughtUp.plain': '全部睇晒喇，好嘢。',
  'md3.inbox.empty.caughtUp.light': '冇嘢剩低要睇。',
  'md3.inbox.empty.caughtUp.playful': '全部睇晒。冇嘢等緊你。',
  'md3.inbox.empty.caughtUp.maximum':
    '全部清晒。呢度乜都冇，冇嘢吊住，亦都冇嘢收埋喺度等陣間再彈出嚟嚇你。',
  'md3.terminal.noSessions.plain': '一個 shell 都未開。',
  'md3.terminal.noSessions.light': '暫時一個 shell 都未開。',
  'md3.terminal.noSessions.playful':
    '一個 shell 都未開。開一個，個 prompt 就係你嘅。',
  'md3.terminal.noSessions.maximum':
    '一個 shell 都未開。開一個啦，個游標會即刻喺度眨吓眨吓咁聽你差遣，兼且乜都唔會批評你。',
  'surfaceLocks.explanation.plain':
    '上咗鎖之後，要輸密碼或者一次性密碼先開得或者改得嗰個分頁／外觀設定。每個鎖各有自己嘅憑證，解一個鎖唔會連第二個一齊解。呢樣係你自己俾自己嘅減速墊，唔係保安。',
  'surfaceLocks.explanation.light':
    '上咗鎖，就即係喺個分頁或者外觀設定前面擺個密碼／一次性密碼。每個鎖有自己嘅憑證，解一個就淨係開嗰一個。係你自己擺俾自己嘅減速墊，唔係保安。',
  'surfaceLocks.explanation.playful':
    '上咗鎖，你要用密碼或者一次性密碼證明自己身分，個分頁或者外觀設定先肯郁。每個鎖各有各憑證，過到一個就淨係過到嗰一個。呢個減速墊係你自己砌嘅，唔係保安嚟㗎。',
  'surfaceLocks.explanation.maximum':
    '上咗鎖，就會喺個分頁或者外觀設定前面插支密碼／一次性密碼，冇佢就死都唔郁。每一個鎖都孤寒到自己收埋自己嗰個憑證，所以你威威噉開咗一個，都係得嗰一個，下一個仲企喺度當你透明。呢個減速墊係你自己開開心心砌返嚟，唔係保安、唔係加密，對住其他坐喺呢部電腦前面嘅人更加係一啲阻力都冇。',
  'authenticatorSettings.explanation.plain':
    '驗證器負責存住一次性密碼嘅帳戶，同埋顯示佢哋而家嘅密碼。你可以掃 QR、貼 otpauth 連結或者手打密鑰嚟登記。啲密碼喺呢部電腦度計出嚟，唔使開帳戶，亦都唔使上網。',
  'authenticatorSettings.explanation.light':
    '驗證器幫你收埋啲一次性密碼帳戶，逐個顯示而家嘅密碼。掃 QR、貼 otpauth 連結或者打密鑰都加得。全部喺本機計，唔使帳戶亦都唔使上網。',
  'authenticatorSettings.explanation.playful':
    '驗證器就係你啲一次性密碼帳戶嘅屋企，啲密碼喺嗰度一格格咁跳。掃 QR、貼 otpauth 連結，或者親手打粒密鑰入去都得。每一個密碼都喺呢部電腦度計，唔使帳戶、唔使上網、亦都冇人喺度睇。',
  'authenticatorSettings.explanation.maximum':
    '驗證器就係個細細個夾萬，你啲一次性密碼帳戶就坐喺入面，靜靜雞倒數，你上一組六位數字仲未讀完，佢已經又整咗新一組出嚟。餵佢嘅方法：掃 QR、貼 otpauth 連結，或者好似古代人噉逐粒字打入去。每一個密碼都係喺呢部電腦度計出嚟——唔使開帳戶、唔使打任何網絡請求，另一邊亦都冇人對你有興趣。',
  'supportTicketsSetting.explanation.plain':
    '支援櫃檯係個玩笑嚟嘅客服台，淨係存在於呢部電腦。佢會帶被鎖住嘅用家去真正嘅救命路：開個應用程式資料夾，等你自己手動刪。乜都唔會 send 去邊，亦都冇人會覆你。',
  'supportTicketsSetting.explanation.light':
    '支援櫃檯係個扮嘢客服台，淨係住喺呢部電腦入面。佢嘅工作係帶俾鎖住咗嘅用家去做真正有用嗰件事：開個應用程式資料夾，等你自己刪。乜都唔會 send 去邊，亦都冇人覆。',
  'supportTicketsSetting.explanation.playful':
    '支援櫃檯係個完全虛構嘅客服台，淨係住喺呢部電腦。佢會收你張工單、俾個編號你、好隆重噉逐步更新個狀態，然後做返唯一真係有用嗰件事：開個應用程式資料夾，等你自己刪。乜都唔會 send 去邊，亦都冇人覆。',
  'supportTicketsSetting.explanation.maximum':
    '支援櫃檯係個純屬虛構嘅客服台，完全住喺呢部電腦入面，一個員工都冇。佢會收你張工單、派個編號、標個冇人會理嘅嚴重程度，然後好似一間淨係讀過一次說明書嘅大機構噉隆重其事咁逐步更新狀態，最後做返佢識做嘅唯一一件真正有用嘅嘢：開個應用程式資料夾，等你——係你本人——親手刪咗佢。乜都唔會 send 去邊，唔會發任何請求，亦都唔會有覆。',
  'md3.changes.filter.new': '新加',
  'md3.changes.filter.modified': '改咗',
  'md3.changes.filter.deleted': '刪咗',
  'md3.changes.filter.included': '入咗',
  'md3.changes.filter.excluded': '冇入',
  'md3.inbox.kind.prReviewSubmit': 'Pull request 覆核',
  'md3.inbox.kind.prComment': 'Pull request 留言',
  'md3.inbox.kind.prChecksFailed': '檢查唔過',
  'md3.inbox.kind.appError': '程式出錯',
  'md3.inbox.kind.cloneBatch': '批次複製',
  'md3.inbox.kind.autoCommit': '自動 commit',
  'md3.inbox.kind.mergeAll': '全部合併',
  'md3.inbox.kind.autoPull': '自動 pull',
  'md3.inbox.kind.cheapLfs': '大檔案傳送',
  'md3.inbox.kind.buildRun': '建置同執行',
  'md3.inbox.kind.info': '資訊',
  'settingsSearch.entry.appearanceSurfaceLocks.title': '介面鎖',
  'settingsSearch.entry.appearanceSurfaceLocks.desc':
    '用密碼或者一次性密碼鎖住個分頁或者外觀設定，順便管理已經上咗嘅鎖。',

  // Bulk actions across every MD3 list destination. Cantonese.
  'settingsSearch.entry.appearanceSupportTickets.title': '支援櫃檯',
  'settingsSearch.entry.appearanceSupportTickets.desc':
    '純屬虛構、淨係喺本機行嘅支援櫃檯，帶俾鎖住咗嘅用家搵返個應用程式資料夾。乜都唔會 send 去邊。',
  'settingsSearch.entry.advancedAuthenticator.title': '驗證器',
  'settingsSearch.entry.advancedAuthenticator.desc':
    '用 QR、otpauth 連結或者手打密鑰去登記一次性密碼帳戶，睇佢哋嘅即時密碼。全部喺呢部電腦度計出嚟。',

  // Bulk actions across every MD3 list destination. Cantonese.
  'classicExperience.heading': '介面模式',
  'classicExperience.toggleLabel': '用 Classic 模式',
  'classicExperience.explanationSummary': '呢個設定會改咩',
  'classicExperience.explanation.plain':
    '呢個 app 有兩個介面。Material 模式係 Material Design 3 新殼，有導覽抽屜同八個目的地。Classic 模式就係重寫之前嗰個介面：repository 分頁條、經典工具列、側欄同 repository 工作區。兩邊功能一樣齊，淨係擺位唔同，而且轉模式即刻生效。',
  'classicExperience.explanation.light':
    '兩個介面，一個掣。Material 模式係新殼，有抽屜同八個目的地；Classic 模式就係重寫之前嗰套分頁條、工具列、側欄同工作區。兩邊功能一樣，淨係傢俬擺法唔同，一撳即刻見到。',
  'classicExperience.explanation.playful':
    '兩個介面，你揀。Material 模式帶嚟新殼，有抽屜同八個目的地。Classic 模式就將舊嗰個原原本本行返入嚟：分頁條、工具列、側欄、工作區，件件都喺你十年肌肉記憶擺低嗰個位。兩邊冇邊個做得到啲嘢另一邊做唔到，撳落去即刻生效——唔使重開，唔使搞儀式。',
  'classicExperience.explanation.maximum':
    '兩個完整嘅介面，個掣喺你手。Material 模式俾你 Material Design 3 新殼，有導覽抽屜同八個目的地。Classic 模式就將成個重寫之前嘅介面施施然搬返去佢個舊位——分頁條、工具列、側欄、工作區，成班人齊齊整整，全部喺你走嗰陣擺低嗰度。冇任何一樣功能係淨係得一邊有：經典外殼有嘅嘢全部搬咗入新殼，新殼加嘅嘢喺經典佈局度一樣開得。撳落去嗰秒即刻生效——唔使重開、唔使重新啟動、更加唔使人叫你「試吓熄咗再開」。',
  'classicExperience.boundaryNote':
    '兩個模式冇邊個去得到啲地方另一邊去唔到。用緊 Classic 模式嗰陣，另外嗰個「顯示舊版工具列」設定就唔再適用：工具列本身就係嗰個介面嘅一部分，唔係 Material 面板上面嗰條額外橫額。',
  'classicExperience.provenanceDefault':
    '呢部電腦未揀過模式，所以用緊出廠嗰個：{value}。',
  'classicExperience.provenanceStored': '呢部電腦揀咗一個模式：{value}。',
  'classicExperience.stateOn': 'Classic 模式',
  'classicExperience.stateOff': 'Material 模式',

  // Bulk actions across every MD3 list destination. Cantonese.
  'md3.classicSection.releases': '發佈版本',
  'md3.classicSection.issues': '議題',
  'md3.classicSection.triage': '分流',
  'md3.classicSection.cheapLfs': '大檔案',
  'md3.classicSection.launchpad': '發射台',
  'md3.classicSection.historyGraph': '歷史圖譜',
}
