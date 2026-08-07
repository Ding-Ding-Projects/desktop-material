import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../..')
const releaseWorkflows = [
  '.github/workflows/ci-windows.yml',
  '.github/workflows/ci-linux.yml',
  '.github/workflows/build-installers.yml',
  '.github/workflows/super-express-release.yml',
  '.github/workflows/super-express-release-windows.yml',
]

describe('published OAuth build wiring', () => {
  it('does not override the registered callback client in CI or release builds', async () => {
    for (const relativePath of releaseWorkflows) {
      const workflow = await readFile(resolve(root, relativePath), 'utf8')
      assert.doesNotMatch(
        workflow,
        /DESKTOP_OAUTH_CLIENT_(?:ID|SECRET):\s*\$\{\{\s*secrets\./,
        `${relativePath} must use the built-in client unless a custom build explicitly opts in`
      )
    }
  })
})
