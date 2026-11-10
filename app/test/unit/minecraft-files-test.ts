import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  cleanMinecraftRelativePath,
  isViewableMinecraftFile,
  redactMinecraftSecrets,
  tailMinecraftText,
} from '../../src/lib/minecraft/files'

describe('Minecraft file browsing rules', () => {
  it('accepts paths inside the server folder only', () => {
    assert.deepEqual(cleanMinecraftRelativePath(''), [])
    assert.deepEqual(cleanMinecraftRelativePath('logs/latest.log'), [
      'logs',
      'latest.log',
    ])
    assert.deepEqual(
      cleanMinecraftRelativePath('plugins\\Essentials//config.yml'),
      ['plugins', 'Essentials', 'config.yml']
    )
    for (const bad of [
      '..',
      'logs/../../secret',
      './x',
      'C:\\Windows',
      '\\\\server\\share',
      'a\0b',
      'a:b',
      'trailing./x',
      'x'.repeat(2000),
    ]) {
      assert.equal(cleanMinecraftRelativePath(bad), null, bad)
    }
  })

  it('shows only plain text file types', () => {
    assert.equal(isViewableMinecraftFile('latest.log'), true)
    assert.equal(isViewableMinecraftFile('server.PROPERTIES'), true)
    assert.equal(isViewableMinecraftFile('ops.json'), true)
    assert.equal(isViewableMinecraftFile('server.jar'), false)
    assert.equal(isViewableMinecraftFile('level.dat'), false)
    assert.equal(isViewableMinecraftFile('.env'), false)
    assert.equal(isViewableMinecraftFile('noextension'), false)
  })

  it('hides secret values and keeps everything else', () => {
    assert.equal(
      redactMinecraftSecrets(
        'motd=Hi\nrcon.password=hunter2\nenable-rcon=true\n  "apiKey": "abc",\ntoken: xyz\nrcon.password=\n'
      ),
      'motd=Hi\nrcon.password=(hidden)\nenable-rcon=true\n  "apiKey": (hidden)\ntoken: (hidden)\nrcon.password=\n'
    )
  })

  it('drops the cut first line of a long file', () => {
    assert.equal(tailMinecraftText('half\nwhole\n', true), 'whole\n')
    assert.equal(tailMinecraftText('half\nwhole\n', false), 'half\nwhole\n')
  })
})
