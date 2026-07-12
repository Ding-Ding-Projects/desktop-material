import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildIgnoreText } from '../../../../src/lib/build-run/gitignore-integration'
import { getAppliedTemplates } from '../../../../src/lib/gitignore'
import { IBuildProfile } from '../../../../src/lib/build-run/types'

function profile(overrides: Partial<IBuildProfile> = {}): IBuildProfile {
  return {
    id: 'node',
    ecosystem: 'node',
    label: 'Node (npm)',
    toolIcon: 'server',
    cwd: '',
    toolchainCheck: {
      cmd: { exe: 'npm', args: ['--version'], label: 'npm --version' },
      missingHint: 'install node',
    },
    needsElevation: false,
    gitignoreTemplateId: 'node',
    extraIgnores: ['dist/', 'build/'],
    score: 10,
    reasons: [],
    ...overrides,
  }
}

describe('buildIgnoreText', () => {
  it('seeds a fresh file with the template and artifact sections', () => {
    const result = buildIgnoreText(null, profile())
    assert.ok(result)
    assert.ok(result!.text.includes('(dm-template:node)'))
    assert.ok(result!.text.includes('(dm-template:build-artifacts)'))
    assert.ok(result!.text.includes('dist/'))
    assert.equal(result!.appliedLabel, 'Node template + 2 artifact rules')

    const applied = getAppliedTemplates(result!.text).map(a => a.templateId)
    assert.deepEqual([...applied].sort(), ['build-artifacts', 'node'])
  })

  it('is idempotent — re-applying the same profile is a no-op', () => {
    const first = buildIgnoreText(null, profile())
    assert.ok(first)
    const second = buildIgnoreText(first!.text, profile())
    assert.equal(second, null)
  })

  it('treats a CRLF-only difference as unchanged', () => {
    const lf = buildIgnoreText(null, profile())!.text
    const crlf = lf.replace(/\n/g, '\r\n')
    assert.equal(buildIgnoreText(crlf, profile()), null)
  })

  it('applies only artifacts when the template id has no catalog match', () => {
    const result = buildIgnoreText(
      null,
      profile({
        gitignoreTemplateId: '',
        extraIgnores: ['build/', 'bin/'],
      })
    )
    assert.ok(result)
    assert.ok(!result!.text.includes('(dm-template:node)'))
    assert.ok(result!.text.includes('(dm-template:build-artifacts)'))
    assert.equal(result!.appliedLabel, '2 artifact rules')
  })

  it('returns null when there is nothing to apply', () => {
    const result = buildIgnoreText(
      null,
      profile({ gitignoreTemplateId: '', extraIgnores: [] })
    )
    assert.equal(result, null)
  })

  it('preserves hand-written content outside managed sections', () => {
    const result = buildIgnoreText('# my rules\nsecret.key\n', profile())
    assert.ok(result)
    assert.ok(result!.text.includes('secret.key'))
    assert.equal(result!.appliedLabel, 'Node template + 2 artifact rules')
  })

  it('uses a singular label for a single artifact rule', () => {
    const result = buildIgnoreText(
      null,
      profile({ gitignoreTemplateId: '', extraIgnores: ['dist/'] })
    )
    assert.equal(result!.appliedLabel, '1 artifact rule')
  })
})
