import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  MinecraftConsoleBuffer,
  acceptedMinecraftEulaText,
  isMinecraftEulaAccepted,
  isMinecraftReadyLine,
  minecraftServerArguments,
  normalizeMinecraftCommand,
  setMinecraftServerProperty,
  validateMinecraftServer,
  isMinecraftPlayerName,
  reduceMinecraftPlayers,
} from '../../src/lib/minecraft/server'

const draft = {
  name: 'Survival',
  directory: 'D:\\Minecraft\\survival',
  jar: 'server.jar',
  javaPath: 'java',
  memoryMegabytes: 4096,
  port: 25565,
}

describe('Minecraft server rules', () => {
  it('accepts a complete entry and lists every problem with a bad one', () => {
    assert.deepEqual(validateMinecraftServer(draft), [])
    assert.equal(
      validateMinecraftServer({
        name: ' ',
        directory: 'survival',
        jar: '..\\evil.jar',
        javaPath: 'bin\\java',
        memoryMegabytes: 100,
        port: 80,
      }).length,
      6
    )
  })

  it('builds the Java arguments without a shell', () => {
    assert.deepEqual(minecraftServerArguments({ id: 'a', ...draft }), [
      '-Xmx4096M',
      '-jar',
      'server.jar',
      'nogui',
    ])
  })

  it('treats the EULA as accepted only when the file says so', () => {
    assert.equal(isMinecraftEulaAccepted('#comment\neula=false\n'), false)
    assert.equal(isMinecraftEulaAccepted(''), false)
    assert.equal(isMinecraftEulaAccepted('# eula=true\n'), false)
    assert.equal(isMinecraftEulaAccepted('eula = TRUE\r\n'), true)
    const written = acceptedMinecraftEulaText(new Date('2026-11-09T20:00:00Z'))
    assert.equal(isMinecraftEulaAccepted(written), true)
    assert.match(written, /2026-11-09T20:00:00\.000Z/)
    assert.match(written, /aka\.ms\/MinecraftEULA/)
  })

  it('changes one server property and leaves the rest alone', () => {
    assert.equal(
      setMinecraftServerProperty(
        'motd=Hi\nserver-port=25565\npvp=true\n',
        'server-port',
        '25570'
      ),
      'motd=Hi\nserver-port=25570\npvp=true\n'
    )
    assert.equal(
      setMinecraftServerProperty('motd=Hi\n\n', 'server-port', '25570'),
      'motd=Hi\nserver-port=25570\n'
    )
    assert.equal(
      setMinecraftServerProperty('', 'server-port', '1'),
      'server-port=1\n'
    )
    assert.throws(() => setMinecraftServerProperty('', 'a b', '1'))
    assert.throws(() => setMinecraftServerProperty('', 'motd', 'x\nop=me'))
  })

  it('recognises the ready line and cleans console commands', () => {
    assert.equal(
      isMinecraftReadyLine(
        '[15:02:11] [Server thread/INFO]: Done (4.812s)! For help, type "help"'
      ),
      true
    )
    assert.equal(
      isMinecraftReadyLine('[15:02:11] INFO: Preparing level'),
      false
    )
    assert.equal(normalizeMinecraftCommand(' /say hi '), 'say hi')
    assert.equal(normalizeMinecraftCommand('say hi\nstop'), null)
    assert.equal(normalizeMinecraftCommand('   '), null)
    assert.equal(normalizeMinecraftCommand('x'.repeat(300)), null)
  })

  it('keeps complete console lines within a bound', () => {
    const buffer = new MinecraftConsoleBuffer(3)
    assert.deepEqual(buffer.append('one\ntw'), ['one'])
    assert.deepEqual(buffer.append('o\r\nthree\nfour\nfi'), [
      'two',
      'three',
      'four',
    ])
    assert.deepEqual(buffer.lines, ['two', 'three', 'four'])
  })

  it('follows players from join and leave lines only', () => {
    const lines = [
      '[15:02:11] [Server thread/INFO]: Steve joined the game',
      '[15:02:12] [Server thread/INFO]: Alex joined the game',
      '[15:02:13] [Server thread/INFO]: Steve joined the game',
      '[15:02:14] [Server thread/INFO]: <Alex> Herobrine joined the game',
      '[15:02:15] [Server thread/INFO]: Steve left the game',
    ]
    assert.deepEqual(lines.reduce(reduceMinecraftPlayers, []), ['Alex'])
    assert.equal(isMinecraftPlayerName('Steve_01'), true)
    assert.equal(isMinecraftPlayerName('Steve; op me'), false)
    assert.equal(isMinecraftPlayerName(''), false)
  })
})
