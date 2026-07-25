import { describe, it } from 'node:test'
import assert from 'node:assert'
import { composeBuildRunNotification } from '../../../../src/lib/build-run/build-run-notification'
import { BuildRunPhase } from '../../../../src/lib/build-run/types'

describe('composeBuildRunNotification', () => {
  it('does not notify for non-terminal or cancelled phases', () => {
    const silent: ReadonlyArray<BuildRunPhase> = [
      'detecting',
      'gitignore',
      'installing',
      'building',
      'running',
      'cancelled',
    ]
    for (const phase of silent) {
      assert.equal(
        composeBuildRunNotification(7, 'octo', phase, 0, 'english'),
        null,
        `${phase} must not post a notification`
      )
    }
  })

  it('posts a build-run success notification that opens the repository', () => {
    const input = composeBuildRunNotification(
      42,
      'octocat',
      'succeeded',
      0,
      'english'
    )
    assert.ok(input)
    assert.equal(input!.kind, 'build-run')
    assert.equal(input!.title, 'Build succeeded')
    assert.match(input!.body, /octocat/)
    assert.equal(input!.repositoryId, 42)
    assert.deepEqual(input!.action, {
      kind: 'open-repository',
      repositoryId: 42,
    })
  })

  it('reports the failing exit code, and a placeholder when unknown', () => {
    const withCode = composeBuildRunNotification(
      1,
      'octocat',
      'failed',
      17,
      'english'
    )
    assert.ok(withCode)
    assert.equal(withCode!.title, 'Build failed')
    assert.match(withCode!.body, /octocat/)
    assert.match(withCode!.body, /17/)

    const withoutCode = composeBuildRunNotification(
      1,
      'octocat',
      'failed',
      null,
      'english'
    )
    assert.match(withoutCode!.body, /\?/)
  })

  it('localizes the outcome in Cantonese and bilingual modes', () => {
    const english = composeBuildRunNotification(
      3,
      'repo',
      'succeeded',
      0,
      'english'
    )
    const cantonese = composeBuildRunNotification(
      3,
      'repo',
      'succeeded',
      0,
      'cantonese'
    )
    const bilingual = composeBuildRunNotification(
      3,
      'repo',
      'succeeded',
      0,
      'bilingual'
    )
    assert.ok(english && cantonese && bilingual)
    assert.notEqual(english!.title, cantonese!.title)
    assert.equal(bilingual!.title, `${english!.title} · ${cantonese!.title}`)
    // The repository name survives interpolation in every mode.
    assert.match(cantonese!.body, /repo/)
  })
})
