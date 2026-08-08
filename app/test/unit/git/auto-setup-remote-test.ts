import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'

import { ensurePushAutoSetupRemote } from '../../../src/lib/git/auto-setup-remote'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../../src/lib/git/config'
import { createTempDirectory } from '../../helpers/temp'

async function isolatedHome(t: TestContext) {
  return { HOME: await createTempDirectory(t) }
}

describe('ensurePushAutoSetupRemote', () => {
  it('enables push.autoSetupRemote when it is not configured', async t => {
    const env = await isolatedHome(t)
    assert.equal(await getGlobalConfigValue('push.autoSetupRemote', env), null)

    assert.equal(await ensurePushAutoSetupRemote(env), 'enabled')
    assert.equal(
      await getGlobalConfigValue('push.autoSetupRemote', env),
      'true'
    )

    // A second run finds the value it wrote and changes nothing.
    assert.equal(await ensurePushAutoSetupRemote(env), 'already-configured')
    assert.equal(
      await getGlobalConfigValue('push.autoSetupRemote', env),
      'true'
    )
  })

  it('never overwrites an explicit user opt-out', async t => {
    const env = await isolatedHome(t)
    await setGlobalConfigValue('push.autoSetupRemote', 'false', env)

    assert.equal(await ensurePushAutoSetupRemote(env), 'already-configured')
    assert.equal(
      await getGlobalConfigValue('push.autoSetupRemote', env),
      'false'
    )
  })
})
