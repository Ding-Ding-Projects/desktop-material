import * as ipcMain from '../ipc-main'
import { cliWorkbenchCatalog } from './catalog'
import { cliWorkbenchRunner } from './runner'

export { CLIWorkbenchCatalogService, cliWorkbenchCatalog } from './catalog'
export { CLIWorkbenchRunner, cliWorkbenchRunner } from './runner'

/** Register the typed renderer/main CLI workbench boundary. */
export function registerCLIWorkbenchIpc(): void {
  ipcMain.handle('get-cli-workbench-runtime', async () =>
    cliWorkbenchCatalog.getRuntime()
  )
  ipcMain.handle('start-cli-command', async (event, request) => {
    await cliWorkbenchRunner.start(request, event.sender)
  })
  ipcMain.handle('cancel-cli-command', async (event, id) =>
    cliWorkbenchRunner.cancel(id, event.sender)
  )
}
