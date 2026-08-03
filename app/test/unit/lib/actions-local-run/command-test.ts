import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ActionsLocalRunCommandError,
  buildActArgs,
  buildSecretFileContents,
  DefaultActPlatforms,
} from '../../../../src/lib/actions-local-run/command'

/**
 * Drop the `-P label=image` pairs every run carries so a test can assert the
 * part of the argv it actually cares about. The platform flags have their own
 * dedicated coverage below.
 */
function withoutPlatforms(args: ReadonlyArray<string>): ReadonlyArray<string> {
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-P') {
      i++
      continue
    }
    rest.push(args[i])
  }
  return rest
}

const base = {
  workflowRelativePath: '.github/workflows/ci.yml',
  event: 'push',
  job: null as string | null,
  inputs: [] as ReadonlyArray<{ name: string; value: string }>,
  dryRun: false,
  secretFilePath: null as string | null,
}

describe('buildActArgs', () => {
  it('builds a minimal push run addressing the exact workflow file', () => {
    assert.deepStrictEqual(withoutPlatforms(buildActArgs(base)), [
      'push',
      '-W',
      '.github/workflows/ci.yml',
    ])
  })

  it('adds the job selector', () => {
    assert.deepStrictEqual(
      withoutPlatforms(buildActArgs({ ...base, job: 'build' })),
      ['push', '-W', '.github/workflows/ci.yml', '-j', 'build']
    )
  })

  it('adds the dry-run flag', () => {
    const args = buildActArgs({ ...base, dryRun: true })
    assert.ok(args.includes('-n'))
  })

  it('passes inputs as single argv entries even with spaces', () => {
    const args = buildActArgs({
      ...base,
      event: 'workflow_dispatch',
      inputs: [{ name: 'reason', value: 'hot fix now' }],
    })
    const idx = args.indexOf('--input')
    assert.notStrictEqual(idx, -1)
    assert.strictEqual(args[idx + 1], 'reason=hot fix now')
  })

  it('references a secret file path without exposing values', () => {
    const args = buildActArgs({ ...base, secretFilePath: '/tmp/s/secrets.env' })
    const idx = args.indexOf('--secret-file')
    assert.notStrictEqual(idx, -1)
    assert.strictEqual(args[idx + 1], '/tmp/s/secrets.env')
  })

  it('rejects an invalid event name', () => {
    assert.throws(
      () => buildActArgs({ ...base, event: 'push; rm -rf /' }),
      ActionsLocalRunCommandError
    )
  })

  it('rejects an invalid job id', () => {
    assert.throws(
      () => buildActArgs({ ...base, job: 'build && evil' }),
      ActionsLocalRunCommandError
    )
  })

  it('rejects an invalid input name', () => {
    assert.throws(
      () =>
        buildActArgs({
          ...base,
          event: 'workflow_dispatch',
          inputs: [{ name: 'bad name', value: 'x' }],
        }),
      ActionsLocalRunCommandError
    )
  })

  it('rejects an absolute workflow path', () => {
    assert.throws(
      () => buildActArgs({ ...base, workflowRelativePath: '/etc/passwd' }),
      ActionsLocalRunCommandError
    )
  })

  it('rejects a path that escapes the repository', () => {
    assert.throws(
      () =>
        buildActArgs({
          ...base,
          workflowRelativePath: '../../.github/workflows/ci.yml',
        }),
      ActionsLocalRunCommandError
    )
  })

  it('rejects an empty workflow path', () => {
    assert.throws(
      () => buildActArgs({ ...base, workflowRelativePath: '' }),
      ActionsLocalRunCommandError
    )
  })
})

describe('buildSecretFileContents', () => {
  it('serialises secrets in NAME=value lines', () => {
    const text = buildSecretFileContents([
      { name: 'TOKEN', value: 'abc123' },
      { name: 'API_KEY', value: 'p@ss=word with spaces' },
    ])
    assert.strictEqual(text, 'TOKEN=abc123\nAPI_KEY=p@ss=word with spaces\n')
  })

  it('returns an empty string when there are no secrets', () => {
    assert.strictEqual(buildSecretFileContents([]), '')
  })

  it('rejects an invalid secret name', () => {
    assert.throws(
      () => buildSecretFileContents([{ name: 'bad name', value: 'x' }]),
      ActionsLocalRunCommandError
    )
  })

  it('rejects a value containing a line break', () => {
    assert.throws(
      () => buildSecretFileContents([{ name: 'TOKEN', value: 'a\nb' }]),
      ActionsLocalRunCommandError
    )
  })
})

describe('act default platforms', () => {
  it('always supplies platforms so act never opens its image chooser', () => {
    // Without these, act stops on an arrow-key menu asking for a default
    // image. Spawned with no terminal on stdin it cannot read the keypress and
    // dies with the Windows console error "Incorrect function.", which names
    // the failed console read and never mentions images.
    const args = buildActArgs(base)
    assert.ok(args.includes('-P'), 'every run must carry platform mappings')

    for (const [label, image] of DefaultActPlatforms) {
      assert.ok(
        args.includes(`${label}=${image}`),
        `${label} should map to ${image}`
      )
    }
  })

  it('maps ubuntu to a real image and Windows/macOS to self-hosted', () => {
    const mapped = new Map(DefaultActPlatforms)
    // act drives Linux containers, so there is no image that could host a
    // Windows or macOS job; -self-hosted runs them on the host instead of
    // failing to pull something that does not exist.
    assert.match(mapped.get('ubuntu-latest') ?? '', /^catthehacker\/ubuntu:/)
    assert.strictEqual(mapped.get('windows-latest'), '-self-hosted')
    assert.strictEqual(mapped.get('macos-latest'), '-self-hosted')
  })

  it('puts the platforms before the user-chosen job', () => {
    const args = buildActArgs({ ...base, job: 'build' })
    assert.ok(
      args.indexOf('-P') < args.indexOf('-j'),
      'platforms must be settled before the run selection'
    )
  })
})
