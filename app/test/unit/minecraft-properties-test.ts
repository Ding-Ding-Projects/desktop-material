import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  checkMinecraftProperty,
  editableMinecraftProperties,
  minecraftBackupName,
  minecraftNewWorldProperties,
  minecraftWorldFolder,
  validateMinecraftNewWorld,
  parseMinecraftProperties,
} from '../../src/lib/minecraft/properties'

describe('Minecraft server properties', () => {
  it('reads key and value lines and skips comments', () => {
    const values = parseMinecraftProperties(
      '#Minecraft server properties\r\nmotd=Hello = world\n# pvp=false\nmax-players = 12\nbroken line\n'
    )
    assert.equal(values.get('motd'), 'Hello = world')
    assert.equal(values.get('max-players'), '12')
    assert.equal(values.has('pvp'), false)
    assert.equal(values.size, 2)
  })

  it('accepts only listed settings with valid values', () => {
    assert.deepEqual(checkMinecraftProperty('pvp', ' false '), {
      ok: true,
      value: 'false',
    })
    assert.deepEqual(checkMinecraftProperty('max-players', '007'), {
      ok: true,
      value: '7',
    })
    assert.equal(checkMinecraftProperty('max-players', '0').ok, false)
    assert.equal(checkMinecraftProperty('max-players', '1e2').ok, false)
    assert.equal(checkMinecraftProperty('difficulty', 'hard').ok, true)
    assert.equal(checkMinecraftProperty('difficulty', 'brutal').ok, false)
    assert.equal(checkMinecraftProperty('motd', 'Welcome!').ok, true)
    assert.equal(
      checkMinecraftProperty('motd', 'a\nonline-mode=false').ok,
      false
    )
    assert.equal(checkMinecraftProperty('motd', 'x'.repeat(60)).ok, false)
    assert.equal(checkMinecraftProperty('online-mode', 'false').ok, false)
    assert.equal(checkMinecraftProperty('level-name', '../../x').ok, false)
    assert.equal(checkMinecraftProperty('rcon.password', 'x').ok, false)
  })

  it('lists the editable settings with current or default values', () => {
    const settings = editableMinecraftProperties('pvp=false\n')
    assert.equal(settings.find(s => s.spec.key === 'pvp')?.value, 'false')
    assert.equal(settings.find(s => s.spec.key === 'max-players')?.value, '20')
  })

  it('only backs up a world that is a plain folder name', () => {
    assert.equal(minecraftWorldFolder(''), 'world')
    assert.equal(minecraftWorldFolder('level-name=My World\n'), 'My World')
    assert.equal(minecraftWorldFolder('level-name=..\n'), null)
    assert.equal(minecraftWorldFolder('level-name=../other\n'), null)
    assert.equal(minecraftWorldFolder('level-name=C:\\x\n'), null)
    assert.equal(
      minecraftBackupName('world', new Date('2026-11-10T03:04:05.678Z')),
      'world-2026-11-10T030405Z'
    )
  })

  it('checks a new world and writes the values that create it', () => {
    const world = {
      name: 'Skyblock 2',
      seed: ' 12345 ',
      type: 'minecraft:flat',
      structures: false,
    }
    assert.deepEqual(validateMinecraftNewWorld(world), [])
    assert.deepEqual(minecraftNewWorldProperties(world), [
      ['level-name', 'Skyblock 2'],
      ['level-seed', '12345'],
      ['level-type', 'minecraft\\:flat'],
      ['generate-structures', 'false'],
    ])
    assert.equal(
      validateMinecraftNewWorld({
        name: '../x',
        seed: 'a\nb',
        type: 'custom',
        structures: true,
      }).length,
      3
    )
    assert.equal(
      validateMinecraftNewWorld({ ...world, name: 'Backups' }).length,
      1
    )
  })
})
