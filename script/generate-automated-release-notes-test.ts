import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { describe, it } from 'node:test'

import {
  buildAutomatedReleaseNotes,
  collectReleaseCommits,
  getLatestPublishedRelease,
  sanitizeCommitSubject,
} from './generate-automated-release-notes'

function runGit(cwd: string, args: ReadonlyArray<string>): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

describe('automated release notes', () => {
  it('collects commits only through the exact release SHA', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-material-release-notes-'))
    const originalDirectory = process.cwd()
    try {
      runGit(root, ['init'])
      runGit(root, ['config', 'user.name', 'Release Test'])
      runGit(root, ['config', 'user.email', 'release-test@example.invalid'])
      runGit(root, ['commit', '--allow-empty', '-m', 'Previous release'])
      const previousSHA = runGit(root, ['rev-parse', 'HEAD'])
      runGit(root, ['commit', '--allow-empty', '-m', 'Exact target subject'])
      const releaseSHA = runGit(root, ['rev-parse', 'HEAD'])
      runGit(root, ['commit', '--allow-empty', '-m', 'Later unshipped subject'])
      runGit(root, ['checkout', '--detach', releaseSHA])

      process.chdir(root)
      const result = collectReleaseCommits(previousSHA, releaseSHA)
      assert.equal(result.totalCommitCount, 1)
      assert.deepEqual(result.commits, [
        { sha: releaseSHA, subject: 'Exact target subject' },
      ])
    } finally {
      process.chdir(originalDirectory)
      assert.ok(root.startsWith(tmpdir()))
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sanitizes controls, Markdown, HTML, and mention syntax in subjects', () => {
    const subject = sanitizeCommitSubject(
      '  # Ship <script>bad()</script> @team [click](https://bad)\nnext  '
    )
    assert.doesNotMatch(subject, /\n|<script>|@team|\[click\]\(/)
    assert.match(subject, /&lt;script&gt;/)
    assert.match(subject, /@\u200bteam/)
    assert.ok(subject.length < 300)
  })

  it('binds every entry and the visible range to exact commit IDs', () => {
    const previousSHA = '1'.repeat(40)
    const releaseSHA = '2'.repeat(40)
    const commitSHA = '3'.repeat(40)
    const notes = buildAutomatedReleaseNotes({
      repository: 'codingmachineedge/desktop-material',
      version: '3.6.3-beta3-b0000000999',
      releaseSHA,
      previousRelease: {
        tagName: 'v3.6.3-beta3-b0000000998',
        targetCommitish: previousSHA,
      },
      previousReleaseSHA: previousSHA,
      commits: [{ sha: commitSHA, subject: 'Visible subject' }],
      totalCommitCount: 1,
    })

    assert.match(notes, new RegExp(`/commit/${releaseSHA}\\)`))
    assert.match(notes, new RegExp(`${previousSHA}\\.\\.${releaseSHA}`))
    assert.match(notes, new RegExp(`/commit/${commitSHA}\\)`))
    assert.match(notes, /Visible subject/)
    assert.match(notes, /releases\/latest\/download/)
  })

  it('keeps the commit list and final body bounded', () => {
    const commits = Array.from({ length: 50 }, (_, index) => ({
      sha: index.toString(16).padStart(40, '0'),
      subject: `${'<>&@_*[]()'.repeat(8)} ${index}`,
    }))
    const notes = buildAutomatedReleaseNotes({
      repository: 'codingmachineedge/desktop-material',
      version: '3.6.3-beta3-b0000001000',
      releaseSHA: 'f'.repeat(40),
      previousRelease: null,
      previousReleaseSHA: null,
      commits,
      totalCommitCount: 75,
    })

    assert.ok(notes.length <= 24_000)
    assert.match(
      notes,
      /25 older commits omitted by the release-note safety limits/
    )
  })

  it('uses a bounded provider response and treats no previous release as valid', async () => {
    const missing = await getLatestPublishedRelease(
      'codingmachineedge/desktop-material',
      'test-token',
      async () => new Response('[]', { status: 200 })
    )
    assert.equal(missing, null)

    await assert.rejects(
      getLatestPublishedRelease(
        'codingmachineedge/desktop-material',
        'test-token',
        async () => new Response(null, { status: 404 })
      ),
      /release lookup failed with 404/
    )

    const requestedPages = new Array<number>()
    const release = await getLatestPublishedRelease(
      'codingmachineedge/desktop-material',
      'test-token',
      async (input, init) => {
        const page = Number(new URL(String(input)).searchParams.get('page'))
        assert.equal(new URL(String(input)).searchParams.get('per_page'), '5')
        requestedPages.push(page)
        assert.match(
          new Headers(init?.headers).get('authorization') ?? '',
          /^Bearer /
        )
        if (page === 1) {
          return new Response(
            JSON.stringify(
              Array.from({ length: 5 }, (_, index) => ({
                tag_name: `assets-${index + 1}`,
                target_commitish: 'main',
                draft: false,
                prerelease: index > 0,
                assets: [{ name: `large-object-${index}.bin` }],
              }))
            ),
            { status: 200 }
          )
        }
        return new Response(
          JSON.stringify([
            {
              tag_name: 'v3.6.3-beta3-b0000000998',
              target_commitish: '1'.repeat(40),
              draft: false,
              prerelease: false,
              assets: [
                { name: 'RELEASES' },
                { name: 'GitHubDesktop-3.6.3-full.nupkg' },
              ],
            },
          ]),
          { status: 200 }
        )
      }
    )
    assert.deepEqual(release, {
      tagName: 'v3.6.3-beta3-b0000000998',
      targetCommitish: '1'.repeat(40),
    })
    assert.deepEqual(requestedPages, [1, 2])

    let boundedPages = 0
    await assert.rejects(
      getLatestPublishedRelease(
        'codingmachineedge/desktop-material',
        'test-token',
        async () => {
          boundedPages++
          return new Response(
            JSON.stringify(
              Array.from({ length: 5 }, (_, index) => ({
                tag_name: `assets-${boundedPages}-${index}`,
                target_commitish: 'main',
                draft: false,
                prerelease: true,
                assets: [],
              }))
            ),
            { status: 200 }
          )
        }
      ),
      /too many releases/
    )
    assert.equal(boundedPages, 20)

    await assert.rejects(
      getLatestPublishedRelease(
        'codingmachineedge/desktop-material',
        'test-token',
        async () =>
          new Response('[]', {
            status: 200,
            headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
          })
      ),
      /oversized release metadata/
    )
  })
})
