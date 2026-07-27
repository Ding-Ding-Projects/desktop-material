import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import captureModule from './capture-app.js'

const {
  captureApp,
  createCaptureRepositories,
  parseCaptureArguments,
  parseSize,
  parseStep,
  TabCountExpression,
  WelcomeFlowSteps,
} = captureModule

/** Evaluate the browser-side tab-count expression against a fake DOM. */
function countTabs({ tabs = 0, overflowLabel = null, hasStrip = true }) {
  const strip = {
    querySelectorAll: () => ({ length: tabs }),
    querySelector: selector =>
      selector === '.repository-tab-overflow-count' && overflowLabel !== null
        ? { textContent: overflowLabel }
        : null,
  }
  const document = {
    querySelector: () => (hasStrip ? strip : null),
  }
  // eslint-disable-next-line no-new-func
  return new Function('document', `return ${TabCountExpression}`)(document)
}

describe('capture-app option parsing', () => {
  it('defaults to no repositories and a settle wait', () => {
    const options = parseCaptureArguments([])
    assert.equal(options.outPath, null)
    assert.deepEqual(options.repositoryPaths, [])
    assert.equal(options.tabs, 0)
    assert.equal(options.size, null)
    assert.deepEqual(options.steps, [])
    assert.equal(options.keepUserData, false)
    assert.ok(options.settleMilliseconds > 0)
    assert.ok(options.timeoutMilliseconds > 0)
  })

  it('collects repeated repositories and steps in order', () => {
    const options = parseCaptureArguments([
      '--out=shot.png',
      '--repo=C:\\one',
      '--repo=C:\\two',
      '--size=1280x800',
      '--step=click:.repository-tab-overflow',
      '--step=wait:600',
    ])

    assert.equal(options.outPath, 'shot.png')
    assert.deepEqual(options.repositoryPaths, ['C:\\one', 'C:\\two'])
    assert.deepEqual(options.size, { width: 1280, height: 800 })
    assert.deepEqual(options.steps, [
      { kind: 'click', selector: '.repository-tab-overflow' },
      { kind: 'wait', milliseconds: 600 },
    ])
  })

  it('accepts a positional output path', () => {
    assert.equal(parseCaptureArguments(['out.png']).outPath, 'out.png')
  })

  it('rejects unknown options and out-of-range tab counts', () => {
    assert.throws(() => parseCaptureArguments(['--nope']), /Unknown option/)
    assert.throws(() => parseCaptureArguments(['--tabs=999']), /--tabs/)
    assert.throws(() => parseCaptureArguments(['--tabs=x']), /--tabs/)
    assert.throws(() => parseCaptureArguments(['--size=wide']), /--size/)
    assert.throws(
      () => parseCaptureArguments(['a.png', 'b.png']),
      /Unexpected argument/
    )
  })

  it('parses sizes only in <width>x<height> form', () => {
    assert.deepEqual(parseSize(' 900x700 '), { width: 900, height: 700 })
    assert.equal(parseSize('900'), null)
    assert.equal(parseSize('900*700'), null)
  })
})

describe('capture-app step parsing', () => {
  it('parses every supported step kind', () => {
    assert.deepEqual(parseStep('wait:250'), { kind: 'wait', milliseconds: 250 })
    assert.deepEqual(parseStep('wait-for:.repository-tab-overflow'), {
      kind: 'wait-for',
      selector: '.repository-tab-overflow',
    })
    assert.deepEqual(parseStep('click:.repository-tab-search'), {
      kind: 'click',
      selector: '.repository-tab-search',
    })
    assert.deepEqual(parseStep('click-text:Skip for now'), {
      kind: 'click-text',
      text: 'Skip for now',
    })
    assert.deepEqual(parseStep('hover:.repository-tab'), {
      kind: 'hover',
      selector: '.repository-tab',
    })
    assert.deepEqual(parseStep('type:input.search::capture'), {
      kind: 'type',
      selector: 'input.search',
      text: 'capture',
    })
    assert.deepEqual(parseStep('press:Enter'), {
      kind: 'press',
      selector: null,
      key: 'Enter',
    })
    assert.deepEqual(parseStep('press:input.search::Enter'), {
      kind: 'press',
      selector: 'input.search',
      key: 'Enter',
    })
    assert.deepEqual(parseStep('resize:900x700'), {
      kind: 'resize',
      size: { width: 900, height: 700 },
    })
  })

  it('keeps selectors that contain a colon intact', () => {
    assert.deepEqual(parseStep('click:button:has-text("More")'), {
      kind: 'click',
      selector: 'button:has-text("More")',
    })
  })

  it('rejects malformed steps rather than capturing the wrong thing', () => {
    assert.throws(() => parseStep('teleport:.tab'), /Unknown capture step/)
    assert.throws(() => parseStep('wait:soon'), /Invalid wait step/)
    assert.throws(() => parseStep('click:'), /needs a selector/)
    assert.throws(() => parseStep('click-text:'), /needs text/)
    assert.throws(() => parseStep('type:input.search'), /<selector>::<text>/)
    assert.throws(() => parseStep('resize:huge'), /<width>x<height>/)
  })
})

describe('capture-app tab counting', () => {
  it('counts the tabs the strip renders', () => {
    assert.equal(countTabs({ tabs: 4 }), 4)
  })

  it('adds the tabs hidden behind the overflow button', () => {
    assert.equal(countTabs({ tabs: 7, overflowLabel: '5' }), 12)
  })

  it('ignores an unreadable overflow count', () => {
    assert.equal(countTabs({ tabs: 3, overflowLabel: 'lots' }), 3)
  })

  it('reports zero before the strip exists', () => {
    assert.equal(countTabs({ hasStrip: false }), 0)
  })
})

describe('capture-app fixture', () => {
  it('keeps the known-good first-run sequence in order', () => {
    assert.deepEqual(WelcomeFlowSteps, [
      'Continue without signing in',
      'Finish',
      'Skip for now',
    ])
  })

  it('creates committed throwaway repositories', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-app-test-'))
    try {
      const paths = createCaptureRepositories(2, root)
      assert.equal(paths.length, 2)

      for (const repositoryPath of paths) {
        const head = execFileSync('git', ['log', '-1', '--pretty=%s'], {
          cwd: repositoryPath,
          encoding: 'utf8',
        }).trim()
        assert.equal(head, 'Initial commit')

        const status = execFileSync('git', ['status', '--short'], {
          cwd: repositoryPath,
          encoding: 'utf8',
        })
        assert.match(status, /capture-change\.txt/)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses to capture without a built app', async () => {
    await assert.rejects(
      captureApp({ mainPath: join(tmpdir(), 'no-such-main.js'), tabs: 3 }),
      /No built app/
    )
  })
})
