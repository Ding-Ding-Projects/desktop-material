import * as ipcMain from '../ipc-main'
import { actionsLocalRunner } from './runner'
import { discoverWorkflows } from './discovery'
import { detectActionsLocalTools } from './tool-resolver'
import { installAct } from './installer'

export { ActionsLocalRunner, actionsLocalRunner } from './runner'
export { detectActionsLocalTools, locateExecutable } from './tool-resolver'
export { discoverWorkflows } from './discovery'
export { installAct, managedActPath } from './installer'

/**
 * Register the Local Actions runner IPC handlers on the main process.
 *
 * Detection and discovery are pure request/response invokes; a run streams its
 * progress back to whichever renderer invoked `start-actions-local-run`
 * (captured as `event.sender`). Handlers are dormant until a renderer calls
 * them.
 */
export function registerActionsLocalRunIpc(): void {
  ipcMain.handle('detect-actions-local-tools', async () =>
    detectActionsLocalTools()
  )

  // Installs act into the app's own data directory and re-probes, so the
  // renderer gets back the same availability shape it already knows how to
  // render rather than having to model "installing" as a third state of
  // detection.
  ipcMain.handle('install-actions-local-act', async () => {
    await installAct()
    return detectActionsLocalTools()
  })

  ipcMain.handle('list-actions-workflows', async (_event, repositoryPath) =>
    discoverWorkflows(repositoryPath)
  )

  ipcMain.handle('start-actions-local-run', async (event, plan) => {
    actionsLocalRunner.start(plan, event.sender)
  })

  ipcMain.handle('cancel-actions-local-run', async (_event, runId) => {
    await actionsLocalRunner.cancel(runId)
  })
}
