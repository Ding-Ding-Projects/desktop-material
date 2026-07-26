import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron/main'

import type {
  RequestChannels,
  RequestResponseChannels,
} from '../lib/ipc-shared'
import {
  cancelGitHubReleaseTransfer,
  handleGitHubReleaseAssetDownload,
  handleGitHubReleaseAssetUpload,
} from './github-release-transfer'
import { handleSilentInstall } from './silent-install'

type GitHubReleaseTransferRequestChannel = 'cancel-github-release-transfer'
type GitHubReleaseTransferResponseChannel =
  | 'download-release-asset'
  | 'upload-release-asset'
  | 'silent-install-release-asset'

export interface IGitHubReleaseTransferIPCRegistrar {
  handle<T extends GitHubReleaseTransferResponseChannel>(
    channel: T,
    listener: (
      event: IpcMainInvokeEvent,
      ...args: Parameters<RequestResponseChannels[T]>
    ) => ReturnType<RequestResponseChannels[T]>
  ): void
  on<T extends GitHubReleaseTransferRequestChannel>(
    channel: T,
    listener: (
      event: IpcMainEvent,
      ...args: Parameters<RequestChannels[T]>
    ) => void
  ): unknown
}

/** Register the account-bound GitHub release asset transfer boundary. */
export function registerGitHubReleaseTransferIPC(
  ipc: IGitHubReleaseTransferIPCRegistrar
): void {
  ipc.handle('download-release-asset', (event, request) =>
    handleGitHubReleaseAssetDownload(event.sender, request)
  )
  ipc.handle('upload-release-asset', (event, request) =>
    handleGitHubReleaseAssetUpload(event.sender, request)
  )
  // The installer runs here rather than in the renderer so a long unattended
  // install never blocks the interface that started it.
  ipc.handle('silent-install-release-asset', (_event, request) =>
    handleSilentInstall(request)
  )
  ipc.on('cancel-github-release-transfer', (event, operationId) => {
    cancelGitHubReleaseTransfer(event.sender.id, operationId)
  })
}
