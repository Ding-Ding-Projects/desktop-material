import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { translate } from '../../src/lib/i18n'

const appSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'app.tsx'),
  'utf8'
)
const workflowPushRejectedSource = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'workflow-push-rejected',
    'workflow-push-rejected.tsx'
  ),
  'utf8'
)
const pushNeedsPullSource = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'push-needs-pull',
    'push-needs-pull-warning.tsx'
  ),
  'utf8'
)
const confirmedForcePushSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'rebase', 'confirm-force-push.tsx'),
  'utf8'
)
const providerTriageSource = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'repository-tools',
    'provider-triage.tsx'
  ),
  'utf8'
)

describe('App network-action rejection boundary', () => {
  it('observes both menu and shortcut push promises', () => {
    const start = appSource.indexOf('private push(')
    const end = appSource.indexOf('private async pull(', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const push = appSource.slice(start, end)

    assert.match(
      push,
      /observeUserInitiatedOperation\([\s\S]*?confirmOrForcePush\(state\.repository\)[\s\S]*?'menu force push'/
    )
    assert.match(
      push,
      /observeUserInitiatedOperation\([\s\S]*?\.push\(state\.repository\)[\s\S]*?'menu push'/
    )
  })

  it('observes menu fetch and every recovery-dialog network promise', () => {
    const fetchStart = appSource.indexOf('private async fetch(')
    const fetchEnd = appSource.indexOf(
      'private showStashedChanges(',
      fetchStart
    )
    assert.notEqual(fetchStart, -1)
    assert.notEqual(fetchEnd, -1)
    assert.match(
      appSource.slice(fetchStart, fetchEnd),
      /observeUserInitiatedOperation\([\s\S]*?\.fetch\([\s\S]*?state\.repository,[\s\S]*?'menu fetch'/
    )

    assert.match(
      workflowPushRejectedSource,
      /observeUserInitiatedOperation\([\s\S]*?dispatcher\.push\(repository\)[\s\S]*?'workflow-permission push retry'/
    )
    assert.match(
      pushNeedsPullSource,
      /await this\.props\.dispatcher\.fetch\([\s\S]*?observeUserInitiatedOperation\([\s\S]*?'fetch-before-push recovery'/
    )
    assert.match(
      confirmedForcePushSource,
      /observeUserInitiatedOperation\([\s\S]*?performForcePush\(this\.props\.repository\)[\s\S]*?'confirmed force push'/
    )
  })

  it('contains provider triage refreshes as background diagnostics', () => {
    assert.match(
      providerTriageSource,
      /containBackgroundOperation\([\s\S]*?this\.store\.load\([\s\S]*?'Background provider refresh'/
    )
    assert.doesNotMatch(providerTriageSource, /void this\.store\.load\(/)
  })

  it('observes remote-manager popup failures and supplies the notice to dismiss', () => {
    const start = appSource.indexOf('private onErrorNoticeAction')
    const end = appSource.indexOf('private setProfileAppearanceElement', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const action = appSource.slice(start, end)

    assert.match(
      action,
      /openRepositoryRemoteManager\(action\.repositoryId, notice\.id\)[\s\S]*?\.catch\(error =>\s*this\.props\.dispatcher\.postError\(asError\(error\)\)\)/
    )
  })

  it('keeps the fail-closed remote warning copy exact and localized', () => {
    assert.equal(
      translate('remoteVerification.warningTitle', 'english'),
      'Remote URL needs attention'
    )
    assert.equal(
      translate('remoteVerification.warningBody', 'english'),
      'Desktop Material could not verify this repository’s remote URL. No push was attempted. Review the remote URL, then try again.'
    )
    assert.equal(
      translate('remoteVerification.changeUrl', 'english'),
      'Change remote URL'
    )
    assert.match(
      translate('remoteVerification.warningBody', 'cantonese'),
      /冇嘗試 push/
    )
  })
})
