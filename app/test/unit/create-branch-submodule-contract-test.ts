import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const app = Path.resolve(__dirname, '../../src')

describe('create-branch submodule and debounce contract', () => {
  it('keeps the create button disabled for the whole operation', async () => {
    const source = await readFile(
      Path.join(app, 'ui/create-branch/create-branch-dialog.tsx'),
      'utf8'
    )

    // Creating a branch checks it out, and that checkout can clone
    // submodules, so the operation is long enough for a second click to land.
    // The button must stay disabled for its whole duration.
    assert.match(
      source,
      /const disabled =[\s\S]*?this\.state\.isCreatingBranch/,
      'the create button must be disabled while a create is in flight'
    )

    // The visible guard is not enough on its own: a keyboard submit bypasses
    // the button, so the handler refuses re-entry too.
    assert.match(
      source,
      /private createBranch = async \(\) => \{\s*(\/\/[^\n]*\n\s*)*if \(this\.state\.isCreatingBranch\) \{\s*return/,
      'the submit handler must refuse re-entry'
    )
  })

  it('offers the submodule choice only where there are submodules', async () => {
    const source = await readFile(
      Path.join(app, 'ui/create-branch/create-branch-dialog.tsx'),
      'utf8'
    )

    assert.match(source, /listSubmodules/)
    assert.match(
      source,
      /if \(this\.state\.hasSubmodules !== true\) \{\s*return null/,
      'a repository without submodules must not be asked about them'
    )
    // The choice has to actually reach the checkout, or it is decoration.
    assert.match(
      source,
      /createBranch\([\s\S]{0,160}this\.state\.updateSubmodules/,
      'the choice must be passed to the dispatcher'
    )
  })

  it('shows live checkout progress rather than a bare spinner', async () => {
    const source = await readFile(
      Path.join(app, 'ui/create-branch/create-branch-dialog.tsx'),
      'utf8'
    )
    assert.match(source, /renderCheckoutProgress/)
    assert.match(source, /this\.props\.checkoutProgress/)
    assert.match(source, /aria-live="polite"/)
  })

  it('lets the checkout skip submodules when declined', async () => {
    const checkout = await readFile(
      Path.join(app, 'lib/git/checkout.ts'),
      'utf8'
    )
    // Without this branch the option would be inert: submodules would be
    // cloned regardless of what the dialog reported.
    assert.match(
      checkout,
      /if \(updateSubmodules\) \{\s*await updateSubmodulesAfterOperation\(/
    )
  })
})
