import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { getShell } from '../../src/lib/hooks/get-shell'
import { getShellEnv } from '../../src/lib/hooks/get-shell-env'
import { SupportedHooksEnvShell } from '../../src/lib/hooks/config'
import { getPrintenvzPath } from 'printenvz'

describe('getShellEnv', () => {
  const shellKinds: ReadonlyArray<SupportedHooksEnvShell | undefined> =
    __WIN32__ ? ['git-bash', 'pwsh', 'powershell', 'cmd'] : [undefined]

  for (const shellKind of shellKinds) {
    const label = shellKind ?? 'default shell'
    it(`returns an env containing PATH (${label})`, async (t: TestContext) => {
      // Every one of these shells is optional on Windows: PowerShell 7 and Git
      // Bash are separate installs. `getShellEnv` correctly reports failure for
      // one that is absent, so asserting success on a machine without it would
      // be testing the installer, not this code.
      if ((await getShell(shellKind)) === undefined) {
        t.skip(`${label} is not installed on this machine`)
        return
      }

      const result = await getShellEnv(undefined, shellKind, getPrintenvzPath())

      assert.equal(result.kind, 'success')

      if (result.kind !== 'success') {
        return
      }

      const pathKey = Object.keys(result.env).find(
        k => k.toLowerCase() === 'path'
      )

      assert.notEqual(
        pathKey,
        undefined,
        `Expected env to contain a PATH key but got keys: ${Object.keys(
          result.env
        ).join(', ')}`
      )
    })
  }
})
