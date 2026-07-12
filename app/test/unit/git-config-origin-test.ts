import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  formatConfigPath,
  formatConfigScope,
  isConditionalInclude,
} from '../../src/lib/git/config'

describe('Git config origin formatting', () => {
  it('labels conditional global includes', () => {
    const origin = {
      scope: 'global',
      origin: 'file:C:/Users/example/.config/git/work.config',
      value: 'Example User',
    }

    assert.equal(isConditionalInclude(origin), true)
    assert.equal(formatConfigScope(origin), 'global via includeIf')
  })

  it('redacts the repository prefix from local config paths', () => {
    const origin = {
      scope: 'local',
      origin: 'file:C:/work/project/.git/config',
      value: 'example@example.com',
    }

    assert.equal(
      formatConfigPath(origin, 'C:/work/project'),
      '<repo>/.git/config'
    )
  })
})
