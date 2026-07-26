import { shell } from '../../lib/app-shell'
import {
  externalOpenGuard,
  externalOpenTarget,
} from '../../lib/external-open-guard'
import { Dispatcher } from '../dispatcher'

/**
 * Hand a file to the operating system's default application for it.
 *
 * Guarded per path: "Open with default program" sits in several context menus
 * and is reachable twice in a row faster than the OS answers, and every answer
 * opens another window. The claim is taken synchronously and released once the
 * open settles, so a deliberate repeat afterwards still works.
 */
export async function openFile(
  fullPath: string,
  dispatcher: Dispatcher
): Promise<void> {
  await externalOpenGuard.run(
    externalOpenTarget('default-app', fullPath),
    async () => {
      const result = await shell.openExternal(`file://${fullPath}`)

      if (!result) {
        const error = {
          name: 'no-external-program',
          message: `Unable to open file ${fullPath} in an external program. Please check you have a program associated with this file extension`,
        }
        await dispatcher.postError(error)
      }
    }
  )
}
