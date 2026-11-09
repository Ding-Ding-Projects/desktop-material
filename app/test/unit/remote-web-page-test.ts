import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  getRemoteHostName,
  getRemoteWebPages,
  getRemoteWebUrl,
} from '../../src/lib/remote-web-page'

describe('remote web pages', () => {
  describe('getRemoteWebUrl', () => {
    const cases: ReadonlyArray<[string, string]> = [
      [
        'https://github.com/octocat/Hello-World.git',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'https://github.com/octocat/Hello-World.git/',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'git@github.com:octocat/Hello-World.git',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'git@github.com:/octocat/Hello-World.git',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'ssh://git@github.com/octocat/Hello-World.git',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'git://github.com/octocat/Hello-World.git',
        'https://github.com/octocat/Hello-World',
      ],
      [
        'git+ssh://git@github.com/octocat/Hello-World',
        'https://github.com/octocat/Hello-World',
      ],
      ['org@org.ghe.com:team/tool.git', 'https://org.ghe.com/team/tool'],
      [
        'https://gitlab.com/group/subgroup/project.git',
        'https://gitlab.com/group/subgroup/project',
      ],
      [
        'git@gitlab.com:group/subgroup/project.git',
        'https://gitlab.com/group/subgroup/project',
      ],
      [
        'ssh://git@gitlab.example.com:2222/team/app.git',
        'https://gitlab.example.com/team/app',
      ],
      ['git@bitbucket.org:team/repo.git', 'https://bitbucket.org/team/repo'],
      [
        'https://codeberg.org/forgejo/forgejo.git',
        'https://codeberg.org/forgejo/forgejo',
      ],
      [
        'http://203.0.113.5:3000/me/notes.git',
        'http://203.0.113.5:3000/me/notes',
      ],
      [
        'https://git.example.com:8443/me/notes',
        'https://git.example.com:8443/me/notes',
      ],
      [
        'git@ssh.dev.azure.com:v3/contoso/Web%20Site/portal',
        'https://dev.azure.com/contoso/Web%20Site/_git/portal',
      ],
      [
        'https://contoso@dev.azure.com/contoso/Web%20Site/_git/portal',
        'https://dev.azure.com/contoso/Web%20Site/_git/portal',
      ],
      [
        'contoso@vs-ssh.visualstudio.com:v3/contoso/Site/portal',
        'https://contoso.visualstudio.com/Site/_git/portal',
      ],
      [
        'https://git-codecommit.eu-west-1.amazonaws.com/v1/repos/billing',
        'https://eu-west-1.console.aws.amazon.com/codesuite/codecommit/repositories/billing/browse?region=eu-west-1',
      ],
      [
        'https://bitbucket.example.com/scm/plat/api.git',
        'https://bitbucket.example.com/projects/PLAT/repos/api',
      ],
      [
        'https://bitbucket.example.com/scm/~ana/dotfiles.git',
        'https://bitbucket.example.com/users/ana/repos/dotfiles',
      ],
      [
        'ssh://git@bitbucket.example.com:7999/plat/api.git',
        'https://bitbucket.example.com/projects/PLAT/repos/api',
      ],
      [
        'https://github.com/scm/owner/repo',
        'https://github.com/scm/owner/repo',
      ],
      [
        'https://huggingface.co/datasets/org/set',
        'https://huggingface.co/datasets/org/set',
      ],
      [
        'https://github.com/octo%20cat/hello',
        'https://github.com/octo%20cat/hello',
      ],
    ]

    for (const [remote, page] of cases) {
      it(`opens ${page} for ${remote}`, () => {
        assert.equal(getRemoteWebUrl(remote), page)
      })
    }

    it('never carries a user name, password, token, query or fragment', () => {
      for (const remote of [
        'https://octocat:ghp_secret@github.com/octocat/private.git',
        'https://x-access-token:secret@github.com/octocat/private.git',
        'https://oauth2:secret@gitlab.com/team/private.git?private_token=secret#frag',
        'ssh://deploy:secret@git.example.com/team/private.git',
      ]) {
        const page = getRemoteWebUrl(remote)
        assert.notEqual(page, null, remote)
        assert.doesNotMatch(page!, /secret|@|\?private|#/, remote)
      }
    })

    it('gives no page for local paths, file URLs, helper transports and nonsense', () => {
      for (const remote of [
        '',
        '   ',
        '/srv/git/project.git',
        './relative/clone',
        '../sibling',
        'C:\\repos\\project',
        'C:/repos/project',
        '\\\\server\\share\\project',
        '//server/share/project',
        'file:///srv/git/project.git',
        'codecommit::eu-west-1://billing',
        'persistent-https::https://example.com/repo',
        'ftp://example.com/repo.git',
        'https://github.com/',
        'git@github.com:',
        'not a url',
      ]) {
        assert.equal(getRemoteWebUrl(remote), null, remote)
      }
    })
  })

  describe('getRemoteHostName', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['https://github.com/a/b', 'GitHub'],
      ['https://org.ghe.com/a/b', 'GitHub'],
      ['https://github.example.com/a/b', 'GitHub'],
      ['https://gitlab.com/a/b', 'GitLab'],
      ['https://gitlab.example.com/a/b', 'GitLab'],
      ['https://bitbucket.org/a/b', 'Bitbucket'],
      ['https://bitbucket.example.com/projects/A/repos/b', 'Bitbucket'],
      ['https://dev.azure.com/o/p/_git/r', 'Azure DevOps'],
      ['https://contoso.visualstudio.com/p/_git/r', 'Azure DevOps'],
      ['https://codeberg.org/a/b', 'Codeberg'],
      ['https://gitea.com/a/b', 'Gitea'],
      ['https://gitea.example.com/a/b', 'Gitea'],
      ['https://git.sr.ht/~a/b', 'SourceHut'],
      ['https://eu-west-1.console.aws.amazon.com/codesuite', 'AWS CodeCommit'],
      ['https://huggingface.co/a/b', 'Hugging Face'],
      ['https://git.example.com/a/b', 'git.example.com'],
      ['http://203.0.113.5:3000/a/b', '203.0.113.5:3000'],
    ]

    for (const [page, name] of cases) {
      it(`calls ${page} ${name}`, () => {
        assert.equal(getRemoteHostName(page), name)
      })
    }

    it('calls a GitHub Enterprise Server GitHub when its host is known', () => {
      assert.equal(
        getRemoteHostName('https://git.corp.example/a/b', ['git.corp.example']),
        'GitHub'
      )
      assert.equal(
        getRemoteHostName('https://git.corp.example/a/b', ['other.example']),
        'git.corp.example'
      )
    })
  })

  describe('getRemoteWebPages', () => {
    const remotes = [
      { name: 'origin', url: 'git@github.com:me/app.git' },
      { name: 'backup', url: '/mnt/backup/app.git' },
      { name: 'upstream', url: 'https://gitlab.com/team/app.git' },
      { name: 'mirror', url: 'https://token@github.com/me/app.git' },
    ]

    it('lists every remote with a page in configured order and skips the rest', () => {
      assert.deepEqual(getRemoteWebPages(remotes), [
        {
          remoteName: 'origin',
          url: 'https://github.com/me/app',
          hostName: 'GitHub',
          displayUrl: 'github.com/me/app',
        },
        {
          remoteName: 'upstream',
          url: 'https://gitlab.com/team/app',
          hostName: 'GitLab',
          displayUrl: 'gitlab.com/team/app',
        },
        {
          remoteName: 'mirror',
          url: 'https://github.com/me/app',
          hostName: 'GitHub',
          displayUrl: 'github.com/me/app',
        },
      ])
    })

    it('puts the preferred remote first', () => {
      assert.deepEqual(
        getRemoteWebPages(remotes, 'upstream').map(p => p.remoteName),
        ['upstream', 'origin', 'mirror']
      )
    })

    it('ignores a preferred remote that has no page or does not exist', () => {
      for (const preferred of ['backup', 'missing', null, undefined]) {
        assert.deepEqual(
          getRemoteWebPages(remotes, preferred).map(p => p.remoteName),
          ['origin', 'upstream', 'mirror']
        )
      }
    })

    it('returns nothing for a repository without remotes', () => {
      assert.deepEqual(getRemoteWebPages([]), [])
    })
  })
})
