import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { translate } from '../../src/lib/i18n'

const appSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'app.tsx'),
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
      /confirmOrForcePush\(state\.repository\)[\s\S]*?\.catch\(error =>\s*this\.props\.dispatcher\.postError\(asError\(error\)\)\)/
    )
    assert.match(
      push,
      /\.push\(state\.repository\)[\s\S]*?\.catch\(error =>\s*this\.props\.dispatcher\.postError\(asError\(error\)\)\)/
    )
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
