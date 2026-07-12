import * as React from 'react'

import { IProfileHistoryPage } from '../../models/profile'
import {
  IVersionedStoreHistorySource,
  VersionedStoreHistory,
} from '../version-history'

export interface ISettingsHistoryDispatcher {
  readonly getSettingsHistory: (
    skip?: number,
    limit?: number
  ) => Promise<IProfileHistoryPage>
  readonly getSettingsHistoryFiles: (
    sha: string
  ) => Promise<ReadonlyArray<string>>
  readonly getSettingsHistoryDiff: (
    sha: string,
    file?: string
  ) => Promise<string>
  readonly undoLastSettingsChange: () => Promise<void>
  readonly redoLastSettingsChange: () => Promise<void>
  readonly restoreSettingsTo: (sha: string) => Promise<void>
}

interface ISettingsHistoryDialogProps {
  readonly dispatcher: ISettingsHistoryDispatcher
  readonly onDismissed: () => void
}

/** Thin profile-store adapter around the shared Git-backed history manager. */
export function SettingsHistoryDialog(props: ISettingsHistoryDialogProps) {
  const { dispatcher } = props
  const source: IVersionedStoreHistorySource = {
    getHistory: (skip, limit) => dispatcher.getSettingsHistory(skip, limit),
    getFiles: sha => dispatcher.getSettingsHistoryFiles(sha),
    getDiff: (sha, file) => dispatcher.getSettingsHistoryDiff(sha, file),
    undoLastChange: () => dispatcher.undoLastSettingsChange(),
    redoLastChange: () => dispatcher.redoLastSettingsChange(),
    restoreTo: sha => dispatcher.restoreSettingsTo(sha),
  }

  return (
    <VersionedStoreHistory
      className="settings-history-dialog"
      title="Settings history"
      timelineLabel="Profile settings timeline"
      description="Undo, redo, or restore any point without rewriting history."
      emptyTitle="No settings history yet"
      emptyDescription="Your first profile change will appear here."
      source={source}
      onDismissed={props.onDismissed}
    />
  )
}
