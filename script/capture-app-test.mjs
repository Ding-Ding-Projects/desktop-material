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
    assert.equal(options.windowPixels, false)
    assert.equal(options.repositoryGroup, null)
    assert.equal(options.repositoryDefaultBranch, null)
    assert.deepEqual(options.localStorage, {})
    assert.ok(options.settleMilliseconds > 0)
    assert.ok(options.timeoutMilliseconds > 0)
  })

  it('collects the repository-row and startup-preference seeds', () => {
    const options = parseCaptureArguments([
      '--repo-group=Verification group',
      '--repo-default-branch=main',
      '--local-storage=zoom-factor=2',
      '--local-storage=zoom-auto-fit-enabled=1',
    ])

    assert.equal(options.repositoryGroup, 'Verification group')
    assert.equal(options.repositoryDefaultBranch, 'main')
    assert.deepEqual(options.localStorage, {
      'zoom-factor': '2',
      'zoom-auto-fit-enabled': '1',
    })
  })

  it('rejects seeds it cannot act on', () => {
    assert.throws(() => parseCaptureArguments(['--repo-group=']), /group name/)
    assert.throws(
      () => parseCaptureArguments(['--repo-default-branch=']),
      /branch name/
    )
    assert.throws(
      () => parseCaptureArguments(['--local-storage=zoom-factor']),
      /<key>=<value>/
    )
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

  it('accepts the window-pixel capture switch', () => {
    assert.equal(parseCaptureArguments(['--window-pixels']).windowPixels, true)
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
  it('parses a menu step and rejects anything that is not a menu-event id', () => {
    assert.deepEqual(parseStep('menu:show-repository-settings'), {
      kind: 'menu',
      name: 'show-repository-settings',
    })
    assert.deepEqual(parseStep('menu:  show-repository-settings  '), {
      kind: 'menu',
      name: 'show-repository-settings',
    })

    // Menu events are kebab-case identifiers. Anything else is a typo that
    // would otherwise be sent into the renderer and silently ignored, leaving
    // a capture of the wrong screen with no error to explain it.
    assert.throws(() => parseStep('menu:'), /menu-event id/)
    assert.throws(() => parseStep('menu:Show-Repository-Settings'), /menu/)
    assert.throws(() => parseStep('menu:show repository settings'), /menu/)
    assert.throws(() => parseStep('menu:-leading-dash'), /menu/)
    assert.throws(() => parseStep("menu:alert('x')"), /menu/)
  })

  it('parses shift-right-click as its own step, distinct from right-click', () => {
    // The two gestures must stay separable: plain right-click opens the
    // surface's ordinary menu, Shift+Right-click opens the appearance editor,
    // and a capture proving they no longer collide needs to drive each one.
    assert.deepEqual(parseStep('shift-right-click:.repository-list-item'), {
      kind: 'shift-right-click',
      selector: '.repository-list-item',
    })
    assert.deepEqual(parseStep('right-click:.repository-list-item'), {
      kind: 'right-click',
      selector: '.repository-list-item',
    })
    assert.throws(() => parseStep('shift-right-click:'), /needs a selector/)
  })

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
    assert.deepEqual(parseStep('right-click:.repository-list-item'), {
      kind: 'right-click',
      selector: '.repository-list-item',
    })
    assert.deepEqual(parseStep('hover:.repository-tab'), {
      kind: 'hover',
      selector: '.repository-tab',
    })
    assert.deepEqual(parseStep('scroll:.dialog-content::320'), {
      kind: 'scroll',
      selector: '.dialog-content',
      delta: 320,
    })
    assert.deepEqual(parseStep('scroll:.dialog-content::-120'), {
      kind: 'scroll',
      selector: '.dialog-content',
      delta: -120,
    })
    assert.deepEqual(parseStep('scroll-to:.bitbucket-accounts'), {
      kind: 'scroll-to',
      selector: '.bitbucket-accounts',
    })
    assert.deepEqual(parseStep('mouse:12,760'), {
      kind: 'mouse',
      x: 12,
      y: 760,
    })
    assert.deepEqual(parseStep('blur'), { kind: 'blur' })
    assert.deepEqual(parseStep('reload'), { kind: 'reload' })
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
    assert.deepEqual(parseStep('min-size:320x240'), {
      kind: 'min-size',
      size: { width: 320, height: 240 },
    })
    assert.deepEqual(parseStep('metrics:640x480'), {
      kind: 'metrics',
      size: { width: 640, height: 480 },
      scale: 1,
    })
    assert.deepEqual(parseStep('metrics:480x330@2'), {
      kind: 'metrics',
      size: { width: 480, height: 330 },
      scale: 2,
    })
    assert.deepEqual(parseStep('optional:click:.banner .close'), {
      kind: 'optional',
      step: { kind: 'click', selector: '.banner .close' },
    })
  })

  it('refuses an optional step that wraps nothing or itself', () => {
    assert.throws(() => parseStep('optional:'), /needs a step to wrap/)
    assert.throws(
      () => parseStep('optional:optional:wait:10'),
      /cannot wrap itself/
    )
    assert.throws(() => parseStep('optional:teleport:.tab'), /Unknown capture/)
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
    assert.throws(() => parseStep('mouse:12'), /<x>,<y>/)
    assert.throws(() => parseStep('blur:now'), /takes no argument/)
    assert.throws(() => parseStep('reload:now'), /takes no argument/)
    assert.throws(() => parseStep('right-click:'), /needs a selector/)
    assert.throws(() => parseStep('scroll-to:'), /needs a selector/)
    assert.throws(() => parseStep('scroll:.pane'), /<selector>::<dy>/)
    assert.throws(() => parseStep('scroll:.pane::0'), /non-zero pixel delta/)
    assert.throws(() => parseStep('scroll:.pane::down'), /non-zero pixel delta/)
    assert.throws(() => parseStep('min-size:small'), /<width>x<height>/)
    assert.throws(() => parseStep('metrics:small'), /<width>x<height>/)
    assert.throws(() => parseStep('metrics:640x480@0'), /scale must be/)
    assert.throws(() => parseStep('metrics:640x480@9'), /scale must be/)
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
