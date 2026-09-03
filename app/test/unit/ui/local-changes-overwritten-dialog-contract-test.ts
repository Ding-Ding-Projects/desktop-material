import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('local-changes rebase dismissal contract', () => {
  it('closes the outer rebase flow after dismissing the local-changes error', () => {
    const component = read(
      'app/src/ui/local-changes-overwritten/local-changes-overwritten-dialog.tsx'
    )

    assert.match(
      component,
      /import \{ PopupType \} from '\.\.\/\.\.\/models\/popup'/
    )
    assert.match(component, /onDismissed=\{this\.onDismissPopup\}/)
    assert.match(
      component,
      /private onDismissPopup = async \(\) => \{[\s\S]*?onDismissed\(\)[\s\S]*?if \(retryAction\.type === RetryActionType\.Rebase\) \{[\s\S]*?dispatcher\.closePopup\(PopupType\.MultiCommitOperation\)/
    )
  })

  it('keeps non-rebase dismissal from closing the outer flow', () => {
    const component = read(
      'app/src/ui/local-changes-overwritten/local-changes-overwritten-dialog.tsx'
    )
    const handler = component.slice(
      component.indexOf('private onDismissPopup'),
      component.indexOf(
        '  /**\n   * Returns a user-friendly string',
        component.indexOf('private onDismissPopup')
      )
    )

    assert.doesNotMatch(
      handler,
      /dispatcher\.closePopup\(PopupType\.MultiCommitOperation\)\s*\}\s*else/
    )
    assert.match(handler, /retryAction\.type === RetryActionType\.Rebase/)
  })

  it('advances past the dialog appearance grace period before interaction', () => {
    const behavior = read(
      'app/test/unit/ui/local-changes-overwritten-dialog-behavior-test.tsx'
    )
    assert.match(behavior, /advanceTimersBy\(250\)/)
    assert.match(behavior, /enableTestTimers\(\['setTimeout'\]\)/)
    assert.match(behavior, /resetTestTimers\(\)/)
  })
})
