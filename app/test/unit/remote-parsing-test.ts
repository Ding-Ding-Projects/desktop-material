import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseRemote, sanitizeCloneName } from '../../src/lib/remote-parsing'

describe('URL remote parsing', () => {
  describe('sanitizeCloneName', () => {
    it('keeps ordinary names and removes a trailing git suffix', () => {
      assert.equal(sanitizeCloneName('Hello-World'), 'Hello-World')
      assert.equal(sanitizeCloneName('Hello-World.git'), 'Hello-World')
    })

    it('rejects path syntax, traversal, control characters, and device names', () => {
      const unsafeNames = [
        '',
        '.',
        '..',
        'nested/name',
        'nested\\name',
        'C:drive',
        'CON',
        'con.txt',
        'NUL ',
        'COM1.log',
        'repo.',
        'repo ',
        'repo\u0000name',
      ]

      for (const name of unsafeNames) {
        assert.equal(sanitizeCloneName(name), null, name)
      }
    })

    it('does not extract a component from a path-shaped name', () => {
      assert.equal(sanitizeCloneName('owner\\..\\.ssh'), null)
      assert.equal(sanitizeCloneName('../outside'), null)
    })

    it('rejects Windows-invalid punctuation, deceptive format characters, and oversized names', () => {
      for (const character of ['<', '>', '"', '|', '?', '*']) {
        assert.equal(sanitizeCloneName(`repo${character}name`), null)
      }
      for (const character of [
        '\u061c',
        '\u180e',
        '\u200b',
        '\u200f',
        '\u202e',
        '\u2060',
        '\ufeff',
      ]) {
        assert.equal(sanitizeCloneName(`repo${character}name`), null)
      }
      assert.equal(sanitizeCloneName('x'.repeat(101)), null)
      assert.equal(sanitizeCloneName('x'.repeat(100)), 'x'.repeat(100))
    })
  })

  it('parses HTTPS URLs with a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a trailing -git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses HTTPS URLs with a trailing -git and .git suffixes', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses HTTPS URLs without a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a trailing slash', () => {
    const remote = parseRemote('https://github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs which include a username', () => {
    const remote = parseRemote('https://monalisa@github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs', () => {
    const remote = parseRemote('git@github.com:hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with custom username', () => {
    const remote = parseRemote('niik@niik.ghe.com:hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'niik.ghe.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs without the git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs without the git suffix but with -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses SSH URLs with the .git suffix and -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses SSH URLs with a trailing slash', () => {
    const remote = parseRemote('git@github.com:hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs', () => {
    const remote = parseRemote('git:github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs without the git suffix', () => {
    const remote = parseRemote('git:github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs with a trailing slash', () => {
    const remote = parseRemote('git:github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix and trailing slash', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('does not parse invalid HTTP URLs when missing repo name', () => {
    const remote = parseRemote('https://github.com/someuser//')
    assert(remote === null)
  })

  it('does not parse invalid SSH URLs when missing repo name ', () => {
    const remote = parseRemote('git@github.com:hubot/')
    assert(remote === null)
  })

  it('does not parse invalid git URLs when missing repo name', () => {
    const remote = parseRemote('git:github.com/hubot/')
    assert(remote === null)
  })

  it('does not parse invalid HTTP URLs when missing repo owner', () => {
    const remote = parseRemote('https://github.com//somerepo')
    assert(remote === null)
  })

  it('does not parse invalid SSH URLs when missing repo owner', () => {
    const remote = parseRemote('git@github.com:/somerepo')
    assert(remote === null)
  })

  it('does not parse invalid git URLs when missing repo owner', () => {
    const remote = parseRemote('git:github.com/hubot/')
    assert(remote === null)
  })
})
