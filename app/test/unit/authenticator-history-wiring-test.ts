import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')

function read(relativePath: string): string {
  return readFileSync(join(root, 'src', relativePath), 'utf8')
}

describe('authenticator history wiring', () => {
  it('exposes the store Git history through the shared history surface', () => {
    const settings = read('ui/preferences/authenticator-settings.tsx')

    assert.match(settings, /this\.store\.getHistorySource\(\)/)
    assert.match(settings, /<VersionedStoreHistory/)
    assert.match(settings, /sourceKey=\{this\.store\.getRepositoryPath\(\)\}/)
    assert.match(settings, /onStoreMutated=\{\(\) => this\.load\(\)\}/)
    assert.match(
      settings,
      /history\.missingSecrets/
    )
    assert.match(
      settings,
      /!this\.state\.secrets\.has\(entry\.id\)/,
      'restored metadata with a missing vault record must stay visibly unavailable'
    )
    assert.doesNotMatch(
      settings,
      /getSecret|exportSecret|secret[^\n]*history/i,
      'the history join must not expose credential material'
    )
  })

  it('routes the About/Help action to the Support Tickets help entry point', () => {
    const about = read('ui/about/about.tsx')
    const app = read('ui/app.tsx')

    assert.match(about, /onShowSupportTickets/)
    assert.match(about, /about\.supportTickets/)
    assert.match(app, /private showSupportTickets = \(\) =>/)
    assert.match(
      app,
      /type: PopupType\.SupportTickets,[\s\S]*entryPoint: 'help'/
    )
  })
})
