import {
  translate,
  translatedVariable,
  TranslationKey,
  TranslationVariable,
} from '../../lib/i18n'
import type { LanguageMode } from '../../models/language-mode'
import type { IOllamaModelManagerStrings } from './ollama-model-manager'

const accentTranslationKeys = {
  blue: 'color.blue',
  violet: 'color.violet',
  teal: 'color.teal',
  green: 'color.green',
  amber: 'color.amber',
  rose: 'color.rose',
} as const

const chatHistoryChangeTranslationKeys: Readonly<
  Record<string, TranslationKey>
> = {
  'Create chat session': 'ollama.manager.chatHistoryChangeCreate',
  'Add chat message': 'ollama.manager.chatHistoryChangeMessage',
  'Add chat turn': 'ollama.manager.chatHistoryChangeTurn',
  'Rename chat': 'ollama.manager.chatHistoryChangeRename',
  'Clear chat model': 'ollama.manager.chatHistoryChangeModel',
  'Change chat model': 'ollama.manager.chatHistoryChangeModel',
  'Update chat appearance': 'ollama.manager.chatHistoryChangeAppearance',
  'Update chat accent': 'ollama.manager.chatHistoryChangeAppearance',
  'Update chat surface': 'ollama.manager.chatHistoryChangeAppearance',
  'Update chat font': 'ollama.manager.chatHistoryChangeFont',
  'Update chat message font': 'ollama.manager.chatHistoryChangeFont',
  'Update chat composer font': 'ollama.manager.chatHistoryChangeFont',
  'Record element setting present at startup':
    'ollama.manager.chatHistoryChangeRecover',
}

function chatHistoryChangeVariable(summary: string): TranslationVariable {
  const key = chatHistoryChangeTranslationKeys[summary]
  if (key !== undefined) {
    return translatedVariable(key)
  }
  if (summary.startsWith('Recover element setting from crash-safe ')) {
    return translatedVariable('ollama.manager.chatHistoryChangeRecover')
  }
  const restorePrefix = 'Restore profile to '
  if (summary.startsWith(restorePrefix)) {
    return translatedVariable('ollama.manager.chatHistoryChangeRestorePoint', {
      point: summary.slice(restorePrefix.length),
    })
  }
  return summary
}

/** Resolve the complete manager string contract for an explicit language mode. */
export function getOllamaModelManagerStrings(
  languageMode: LanguageMode
): IOllamaModelManagerStrings {
  const text = (
    key: Parameters<typeof translate>[0],
    variables: Parameters<typeof translate>[2] = {}
  ) => translate(key, languageMode, variables)
  const englishDateTime = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const cantoneseDateTime = new Intl.DateTimeFormat('zh-HK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return {
    title: text('ollama.manager.title'),
    subtitle: text('ollama.manager.subtitle'),
    endpoint: text('ollama.manager.endpoint'),
    configuredEndpoint: text('ollama.manager.configuredEndpoint'),
    connected: text('ollama.manager.connected'),
    unavailable: text('ollama.manager.unavailable'),
    checking: text('ollama.manager.checking'),
    partial: text('ollama.manager.partial'),
    version: text('ollama.manager.version'),
    installed: text('ollama.manager.installed'),
    running: text('ollama.manager.running'),
    refresh: text('ollama.manager.refresh'),
    refreshing: text('ollama.manager.refreshing'),
    searchLabel: text('ollama.manager.searchLabel'),
    searchPlaceholder: text('ollama.manager.searchPlaceholder'),
    scopeLabel: text('ollama.manager.scopeLabel'),
    allModels: text('ollama.manager.allModels'),
    runningModels: text('ollama.manager.runningModels'),
    inventoryLabel: text('ollama.manager.inventoryLabel'),
    loadingInventory: text('ollama.manager.loadingInventory'),
    unavailableInventory: text('ollama.manager.unavailableInventory'),
    emptyInventory: text('ollama.manager.emptyInventory'),
    emptyFilter: text('ollama.manager.emptyFilter'),
    modelDetails: text('ollama.manager.modelDetails'),
    selectModel: text('ollama.manager.selectModel'),
    loadingDetails: text('ollama.manager.loadingDetails'),
    runningBadge: text('ollama.manager.runningBadge'),
    size: text('ollama.manager.size'),
    modified: text('ollama.manager.modified'),
    digest: text('ollama.manager.digest'),
    family: text('ollama.manager.family'),
    format: text('ollama.manager.format'),
    parameters: text('ollama.manager.parameters'),
    quantization: text('ollama.manager.quantization'),
    capabilities: text('ollama.manager.capabilities'),
    license: text('ollama.manager.license'),
    noneReported: text('ollama.manager.noneReported'),
    runtime: text('ollama.manager.runtime'),
    vram: text('ollama.manager.vram'),
    context: text('ollama.manager.context'),
    expires: text('ollama.manager.expires'),
    notRunning: text('ollama.manager.notRunning'),
    pullTitle: text('ollama.manager.pullTitle'),
    pullHint: text('ollama.manager.pullHint'),
    modelName: text('ollama.manager.modelName'),
    pullPlaceholder: text('ollama.manager.pullPlaceholder'),
    pull: text('ollama.manager.pull'),
    pulling: text('ollama.manager.pulling'),
    cancel: text('ollama.manager.cancel'),
    receiving: text('ollama.manager.receiving'),
    copyTitle: text('ollama.manager.copyTitle'),
    copyHint: text('ollama.manager.copyHint'),
    copyDestination: text('ollama.manager.copyDestination'),
    copy: text('ollama.manager.copy'),
    renameTitle: text('ollama.manager.renameTitle'),
    renameHint: text('ollama.manager.renameHint'),
    renameDestination: text('ollama.manager.renameDestination'),
    rename: text('ollama.manager.rename'),
    load: text('ollama.manager.load'),
    unload: text('ollama.manager.unload'),
    delete: text('ollama.manager.delete'),
    deleteTitle: text('ollama.manager.deleteTitle'),
    deleteConfirm: text('ollama.manager.deleteConfirm'),
    invalidName: text('ollama.manager.invalidName'),
    duplicateName: text('ollama.manager.duplicateName'),
    operationError: text('ollama.manager.operationError'),
    refreshError: text('ollama.manager.refreshError'),
    detailsError: text('ollama.manager.detailsError'),
    configurationPartial: text('ollama.manager.configurationPartial'),
    renamePartial: text('ollama.manager.renamePartial'),
    pullCancelled: text('ollama.manager.pullCancelled'),
    chatTitle: text('ollama.manager.chatTitle'),
    chatHint: text('ollama.manager.chatHint'),
    chatModelLabel: text('ollama.manager.chatModelLabel'),
    chatPlaceholder: text('ollama.manager.chatPlaceholder'),
    chatSend: text('ollama.manager.chatSend'),
    chatStop: text('ollama.manager.chatStop'),
    chatClear: text('ollama.manager.chatClear'),
    chatStreaming: text('ollama.manager.chatStreaming'),
    chatEmpty: text('ollama.manager.chatEmpty'),
    chatNoModel: text('ollama.manager.chatNoModel'),
    chatUnsupported: text('ollama.manager.chatUnsupported'),
    chatError: text('ollama.manager.chatError'),
    chatYou: text('ollama.manager.chatYou'),
    chatAssistant: text('ollama.manager.chatAssistant'),
    chatMessageLabel: text('ollama.manager.chatMessageLabel'),
    chatSystem: text('ollama.manager.chatSystem'),
    chatSessionsHeading: text('ollama.manager.chatSessionsHeading'),
    chatDefaultTitle: text('ollama.manager.chatDefaultTitle'),
    chatNew: text('ollama.manager.chatNew'),
    chatRename: text('ollama.manager.chatRename'),
    chatDelete: text('ollama.manager.chatDelete'),
    chatCancel: text('ollama.manager.chatCancel'),
    chatConfirmDelete: text('ollama.manager.chatConfirmDelete'),
    chatSelectPrompt: text('ollama.manager.chatSelectPrompt'),
    chatLoading: text('ollama.manager.chatLoading'),
    chatLoadError: text('ollama.manager.chatLoadError'),
    chatCopy: text('ollama.manager.chatCopy'),
    chatAttachImage: text('ollama.manager.chatAttachImage'),
    chatRemoveImage: text('ollama.manager.chatRemoveImage'),
    chatUnsupportedImage: text('ollama.manager.chatUnsupportedImage'),
    chatImageTooLarge: text('ollama.manager.chatImageTooLarge'),
    chatClearDraft: text('ollama.manager.chatClearDraft'),
    chatCustomize: text('ollama.manager.chatCustomize'),
    chatHistory: text('ollama.manager.chatHistory'),
    chatAppearanceHeading: text('ollama.manager.chatAppearanceHeading'),
    chatAccentLabel: text('ollama.manager.chatAccentLabel'),
    chatSurfaceLabel: text('ollama.manager.chatSurfaceLabel'),
    chatSurfaceTonal: text('ollama.manager.chatSurfaceTonal'),
    chatSurfaceNeutral: text('ollama.manager.chatSurfaceNeutral'),
    chatMessageFont: text('ollama.manager.chatMessageFont'),
    chatComposerFont: text('ollama.manager.chatComposerFont'),
    chatSettingsHint: text('ollama.manager.chatSettingsHint'),
    chatHistoryTitle: text('ollama.manager.chatHistoryTitle'),
    chatHistoryTimeline: text('ollama.manager.chatHistoryTimeline'),
    chatHistoryDescription: text('ollama.manager.chatHistoryDescription'),
    chatHistoryStrings: {
      searchLabel: text('ollama.manager.chatHistorySearchLabel'),
      searchPlaceholder: text('ollama.manager.chatHistorySearchPlaceholder'),
      regexBuilderTarget: text('ollama.manager.chatHistoryTitle'),
      searchStatus: text('ollama.manager.chatHistorySearchStatus'),
      matchingCount: (visible, loaded) =>
        text('ollama.manager.chatHistoryMatchingCount', {
          visible: String(visible),
          loaded: String(loaded),
        }),
      undo: text('ollama.manager.chatHistoryUndo'),
      redo: text('ollama.manager.chatHistoryRedo'),
      commitCount: count =>
        count === 1
          ? text('ollama.manager.chatHistoryCommitSingular')
          : text('ollama.manager.chatHistoryCommitCount', {
              count: String(count),
            }),
      loadingFiles: text('ollama.manager.chatHistoryLoadingFiles'),
      selectToInspect: text('ollama.manager.chatHistorySelectToInspect'),
      noFiles: text('ollama.manager.chatHistoryNoFiles'),
      restoreLabel: summary =>
        text('ollama.manager.chatHistoryRestoreLabel', { summary }),
      restoreTooltip: text('ollama.manager.chatHistoryRestoreTooltip'),
      restoreConfirmation: text(
        'ollama.manager.chatHistoryRestoreConfirmation'
      ),
      cancel: text('ollama.manager.chatCancel'),
      restore: text('ollama.manager.chatHistoryRestore'),
      loadingHistory: text('ollama.manager.chatHistoryLoading'),
      noHistoryTitle: text('ollama.manager.chatHistoryNoHistoryTitle'),
      noHistoryDescription: text(
        'ollama.manager.chatHistoryNoHistoryDescription'
      ),
      noMatchesTitle: text('ollama.manager.chatHistoryNoMatchesTitle'),
      noMatchesDescription: text(
        'ollama.manager.chatHistoryNoMatchesDescription'
      ),
      loading: text('ollama.manager.chatHistoryLoadingMore'),
      loadMore: text('ollama.manager.chatHistoryLoadMore'),
      loadingDiff: text('ollama.manager.chatHistoryLoadingDiff'),
      noTextChanges: text('ollama.manager.chatHistoryNoTextChanges'),
      diffLabel: text('ollama.manager.chatHistoryDiffLabel'),
      selectCommit: text('ollama.manager.chatHistorySelectCommit'),
      retry: text('ollama.manager.chatHistoryRetry'),
      closeLabel: () => text('ollama.manager.chatHistoryCloseLabel'),
      commitsLabel: () => text('ollama.manager.chatHistoryCommitsLabel'),
      detailsLabel: () => text('ollama.manager.chatHistoryDetailsLabel'),
    },
    chatHistorySummary: summary => {
      const key = chatHistoryChangeTranslationKeys[summary]
      if (key !== undefined) {
        return text(key)
      }
      if (summary.startsWith('Recover element setting from crash-safe ')) {
        return text('ollama.manager.chatHistoryChangeRecover')
      }
      if (summary.startsWith('Undo ')) {
        return text('ollama.manager.chatHistoryChangeUndo', {
          change: chatHistoryChangeVariable(summary.slice('Undo '.length)),
        })
      }
      if (summary.startsWith('Redo ')) {
        return text('ollama.manager.chatHistoryChangeRedo', {
          change: chatHistoryChangeVariable(summary.slice('Redo '.length)),
        })
      }
      const restorePrefix = 'Restore profile to '
      if (summary.startsWith(restorePrefix)) {
        return text('ollama.manager.chatHistoryChangeRestorePoint', {
          point: summary.slice(restorePrefix.length),
        })
      }
      return summary
    },
    chatHistoryTimestamp: date => {
      const english = englishDateTime.format(date)
      const cantonese = cantoneseDateTime.format(date)
      return languageMode === 'cantonese'
        ? cantonese
        : languageMode === 'bilingual'
        ? `${english} · ${cantonese}`
        : english
    },
    chatHistoryError: text('ollama.manager.chatHistoryError'),
    chatDeletePrompt: title =>
      text('ollama.manager.chatDeletePrompt', { title }),
    chatMessageCount: count =>
      text('ollama.manager.chatMessageCount', { count: String(count) }),
    chatImageAlt: index =>
      text('ollama.manager.chatImageAlt', { index: String(index) }),
    chatImageLimit: count =>
      text('ollama.manager.chatImageLimit', { count: String(count) }),
    chatAccentName: palette => text(accentTranslationKeys[palette]),
    unknown: text('ollama.manager.unknown'),
    never: text('ollama.manager.never'),
    showing: (visible, total) =>
      text('ollama.manager.showing', {
        visible: String(visible),
        total: String(total),
      }),
    selectedModel: name => text('ollama.manager.selectedModel', { name }),
    moreCapabilities: count =>
      text('ollama.manager.moreCapabilities', { count: String(count) }),
    pullProgress: percent =>
      text('ollama.manager.pullProgress', { percent: String(percent) }),
    pullSucceeded: name => text('ollama.manager.pullSucceeded', { name }),
    copySucceeded: (source, destination) =>
      text('ollama.manager.copySucceeded', { source, destination }),
    renameSucceeded: (source, destination) =>
      text('ollama.manager.renameSucceeded', { source, destination }),
    loadSucceeded: name => text('ollama.manager.loadSucceeded', { name }),
    unloadSucceeded: name => text('ollama.manager.unloadSucceeded', { name }),
    deleteSucceeded: name => text('ollama.manager.deleteSucceeded', { name }),
    confirmDelete: name => text('ollama.manager.confirmDelete', { name }),
  }
}
