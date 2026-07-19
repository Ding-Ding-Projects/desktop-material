import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const source = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)

function methodBody(start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `missing ${start}`)
  assert.notEqual(endIndex, -1, `missing boundary ${end}`)
  return source.slice(startIndex, endIndex)
}

describe('cheap LFS commit entry points', () => {
  it('routes scheduled commits through the auto-pin-aware commit flow', () => {
    const body = methodBody(
      'private async performScheduledCommitPush(',
      'private async performScheduledPush('
    )

    assert.match(body, /this\._commitIncludedChanges\(repository, context\)/)
    assert.doesNotMatch(body, /createCommit\(/)
  })

  it('routes commit-and-push-all through the auto-pin-aware commit flow', () => {
    const body = methodBody(
      'private async commitAllChangesForCommitPushAll(',
      'private async pushForCommitPushAll('
    )

    assert.match(body, /this\._commitIncludedChanges\(repository, context\)/)
    assert.doesNotMatch(body, /createCommit\(/)
  })
})
