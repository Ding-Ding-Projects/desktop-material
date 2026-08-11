import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import captureModule from './capture-app.js'

const {
  assertCaptureBuildArtifacts,
  assertCapturePrivacy,
  assertWindowControlsEvidence,
  captureApp,
  createCaptureRepositories,
  parseCaptureArguments,
  parseSize,
  parseStep,
  TabCountExpression,
  WelcomeFlowSteps,
} = captureModule
const captureSource = readFileSync(
  new URL('./capture-app.js', import.meta.url),
  'utf8'
)

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

function probeRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

function visibleProbeElement(rect, overrides = {}) {
  return {
    rect,
    display: 'flex',
    visibility: 'visible',
    opacity: 1,
    pointerEvents: 'auto',
    minWidth: 0,
    minHeight: 0,
    ...overrides,
  }
}

function expectedWindowControlsScenario() {
  return {
    contentWidth: 390,
    contentHeight: 844,
    zoomFactor: 2,
  }
}

function passingWindowControlsEvidence() {
  const controls = [
    ['window-control-minimize', 'Minimize', 57],
    ['window-control-maximize', 'Maximize', 103],
    ['window-control-close', 'Close', 149],
  ].map(([verification, ariaLabel, left]) => ({
    ...visibleProbeElement(probeRect(left, 0, 46, 44), {
      minWidth: 44,
      minHeight: 44,
    }),
    verification,
    ariaLabel,
    ariaHidden: null,
    ariaDisabled: null,
    disabled: false,
    tagName: 'BUTTON',
    tabIndex: 0,
    focused: true,
    hitTargets: {
      center: true,
      topLeft: true,
      topRight: true,
      bottomLeft: true,
      bottomRight: true,
    },
  }))

  return {
    viewport: {
      width: 195,
      height: 422,
      devicePixelRatio: 2,
    },
    nativeWindow: {
      contentWidth: 390,
      contentHeight: 844,
      windowWidth: 390,
      windowHeight: 844,
      zoomFactor: 2,
      maximized: false,
      disableGpu: true,
    },
    titleBar: visibleProbeElement(probeRect(0, 0, 195, 44), {
      minHeight: 44,
    }),
    appMenu: visibleProbeElement(probeRect(0, 0, 0, 0), {
      display: 'none',
    }),
    dragRegion: {
      ...visibleProbeElement(probeRect(10, 0, 47, 44), {
        minWidth: 24,
      }),
      webkitAppRegion: 'drag',
    },
    group: {
      ...visibleProbeElement(probeRect(57, 0, 138, 44)),
      role: 'group',
      ariaLabel: 'Window controls',
    },
    controls,
    accessibleRoleCounts: {
      group: 1,
      buttons: {
        Minimize: 1,
        Maximize: 1,
        Restore: 0,
        Close: 1,
      },
    },
    clearance: {
      focusCleared: true,
      pointerOutsideGroup: true,
      visibleTooltips: 0,
    },
  }
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
    assert.equal(options.probeWindowControls, false)
    assert.equal(options.expectedWindowControls, null)
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

  it('binds the fail-closed caption-control probe to an exact scenario', () => {
    const options = parseCaptureArguments([
      '--probe-window-controls',
      '--expect-window-controls=390x844@2',
    ])

    assert.equal(options.probeWindowControls, true)
    assert.deepEqual(options.expectedWindowControls, {
      contentWidth: 390,
      contentHeight: 844,
      zoomFactor: 2,
    })
  })

  it('rejects an unbound or malformed caption-control scenario', () => {
    assert.throws(
      () => parseCaptureArguments(['--probe-window-controls']),
      /requires --expect-window-controls/
    )
    assert.throws(
      () => parseCaptureArguments(['--expect-window-controls=390x844@2']),
      /requires --probe-window-controls/
    )
    assert.throws(
      () =>
        parseCaptureArguments([
          '--probe-window-controls',
          '--expect-window-controls=390x844',
        ]),
      /<width>x<height>@<zoom>/
    )
    assert.throws(
      () =>
        parseCaptureArguments([
          '--probe-window-controls',
          '--expect-window-controls=390x844@0',
        ]),
      /<width>x<height>@<zoom>/
    )
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

describe('capture-app Windows caption-control probe', () => {
  it('accepts a complete, right-pinned, keyboard-accessible control cluster', () => {
    const result = assertWindowControlsEvidence(
      passingWindowControlsEvidence(),
      expectedWindowControlsScenario()
    )

    assert.equal(result.passed, true)
    assert.deepEqual(result.expectedScenario, expectedWindowControlsScenario())
    assert.deepEqual(
      result.controls.map(control => control.ariaLabel),
      ['Minimize', 'Maximize', 'Close']
    )
    assert.equal(result.dragRegion.webkitAppRegion, 'drag')
    assert.equal(result.dragRegion.rect.width, 47)
  })

  it('accepts Restore as the middle control for a maximized window', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.nativeWindow.maximized = true
    evidence.controls[1].verification = 'window-control-restore'
    evidence.controls[1].ariaLabel = 'Restore'
    evidence.accessibleRoleCounts.buttons.Maximize = 0
    evidence.accessibleRoleCounts.buttons.Restore = 1

    const result = assertWindowControlsEvidence(
      evidence,
      expectedWindowControlsScenario()
    )
    assert.equal(result.passed, true)
  })

  it('requires runtime proof that Electron received --disable-gpu', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.nativeWindow.disableGpu = false

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /did not start with --disable-gpu/
    )
  })

  it('fails closed when Close clips by any positive amount', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.controls[2].rect = probeRect(149.1, 0, 46, 44)

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /Close control escapes its pinned group/
    )
  })

  it('rejects a 43 CSS-pixel title bar or control target', () => {
    const shortTitle = passingWindowControlsEvidence()
    shortTitle.titleBar.rect = probeRect(0, 0, 195, 43)
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          shortTitle,
          expectedWindowControlsScenario()
        ),
      /title bar is below the 44 CSS-pixel target height/
    )

    const shortControl = passingWindowControlsEvidence()
    shortControl.controls[0].rect = probeRect(57, 0, 46, 43)
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          shortControl,
          expectedWindowControlsScenario()
        ),
      /Minimize control is below the 44 by 44 CSS-pixel target/
    )

    const shortMinimum = passingWindowControlsEvidence()
    shortMinimum.controls[0].minWidth = 43
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          shortMinimum,
          expectedWindowControlsScenario()
        ),
      /Minimize control is below the 44 by 44 CSS-pixel target/
    )
  })

  it('fails closed when a caption control cannot receive keyboard focus', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.controls[0].tabIndex = -1
    evidence.controls[0].focused = false

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /Minimize control is not keyboard focusable/
    )
  })

  it('rejects even a fractional application-menu overlap', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.appMenu = visibleProbeElement(probeRect(10, 0, 47.1, 44))

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /application menu overlaps the pinned caption controls/
    )
  })

  it('requires a contained native drag lane at least 24 CSS pixels wide', () => {
    const missingNativeRegion = passingWindowControlsEvidence()
    missingNativeRegion.dragRegion.webkitAppRegion = 'no-drag'
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          missingNativeRegion,
          expectedWindowControlsScenario()
        ),
      /not registered as a native drag surface/
    )

    const narrowRegion = passingWindowControlsEvidence()
    narrowRegion.dragRegion.rect = probeRect(33.1, 0, 23.9, 44)
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          narrowRegion,
          expectedWindowControlsScenario()
        ),
      /below the 24 CSS-pixel minimum width/
    )

    const menuOverlap = passingWindowControlsEvidence()
    menuOverlap.appMenu = visibleProbeElement(probeRect(0, 0, 10.1, 44))
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          menuOverlap,
          expectedWindowControlsScenario()
        ),
      /application menu overlaps the native drag region/
    )
  })

  it('probes the centre and every inset corner of each hit target', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.controls[2].hitTargets.bottomRight = false

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /Close control hit target is obstructed/
    )
  })

  it('binds native size, window size, zoom, and viewport scaling', () => {
    const wrongContent = passingWindowControlsEvidence()
    wrongContent.nativeWindow.contentWidth = 391
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          wrongContent,
          expectedWindowControlsScenario()
        ),
      /native content\/window size does not match/
    )

    const wrongWindow = passingWindowControlsEvidence()
    wrongWindow.nativeWindow.windowHeight = 843
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          wrongWindow,
          expectedWindowControlsScenario()
        ),
      /native content\/window size does not match/
    )

    const wrongZoom = passingWindowControlsEvidence()
    wrongZoom.nativeWindow.zoomFactor = 1.99
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          wrongZoom,
          expectedWindowControlsScenario()
        ),
      /native zoom does not match/
    )

    const wrongViewport = passingWindowControlsEvidence()
    wrongViewport.viewport.height = 421
    assert.throws(
      () =>
        assertWindowControlsEvidence(
          wrongViewport,
          expectedWindowControlsScenario()
        ),
      /renderer viewport does not scale/
    )
  })

  it('requires the title bar to span the requested viewport', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.titleBar.rect = probeRect(0, 0, 194, 44)

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /title bar does not span the renderer viewport/
    )
  })

  it('requires focus, pointer, and tooltip clearance before capture', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.clearance.visibleTooltips = 1

    assert.throws(
      () =>
        assertWindowControlsEvidence(
          evidence,
          expectedWindowControlsScenario()
        ),
      /did not clear focus, pointer, and caption tooltip state/
    )

    assert.ok(
      captureSource.includes(
        'await page.mouse.move(pointerPark.x, pointerPark.y)'
      )
    )
    assert.ok(captureSource.includes('WindowControlsTooltipSelector'))
    assert.ok(captureSource.includes('await page.waitForFunction('))
  })

  it('returns a strict content-free whitelist and drops injected properties', () => {
    const evidence = passingWindowControlsEvidence()
    evidence.secretPath = 'C:\\private\\do-not-retain.txt'
    evidence.viewport.secretToken = 'top-secret'
    evidence.controls[0].repositoryPath = 'C:\\private\\repository'
    evidence.controls[0].hitTargets.secret = 'hidden'
    const expected = expectedWindowControlsScenario()
    expected.secretPath = 'C:\\private\\expected.txt'

    const result = assertWindowControlsEvidence(evidence, expected)
    const serialized = JSON.stringify(result)

    assert.doesNotMatch(
      serialized,
      /secretPath|secretToken|repositoryPath|top-secret|do-not-retain|[A-Z]:\\/
    )
    assert.deepEqual(Object.keys(result).sort(), [
      'accessibleRoleCounts',
      'appMenu',
      'clearance',
      'controls',
      'dragRegion',
      'expectedScenario',
      'group',
      'nativeWindow',
      'passed',
      'titleBar',
      'viewport',
    ])
  })
})

describe('capture-app fixture', () => {
  it('requires every auxiliary renderer from the same built app', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-renderer-contract-'))
    const files = [
      'main.js',
      'renderer.js',
      'internal-browser.js',
      'crash.js',
      'quick-action.js',
      'index.html',
      'internal-browser.html',
      'crash.html',
      'quick-action.html',
    ]

    try {
      for (const file of files) {
        writeFileSync(join(root, file), 'fixture')
      }
      assert.doesNotThrow(() =>
        assertCaptureBuildArtifacts(join(root, 'main.js'))
      )

      rmSync(join(root, 'quick-action.js'))
      assert.throws(
        () => assertCaptureBuildArtifacts(join(root, 'main.js')),
        /missing quick-action\.js/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs the privacy gate before either screenshot implementation', () => {
    const gate = captureSource.indexOf(
      'const privacyReceipt = assertCapturePrivacy'
    )
    const windowPixels = captureSource.indexOf(
      'await captureWindowPixels(electronApp, outPath)',
      gate
    )
    const pageScreenshot = captureSource.indexOf(
      'await page.screenshot({ path: outPath })',
      gate
    )

    assert.notEqual(gate, -1)
    assert.notEqual(windowPixels, -1)
    assert.notEqual(pageScreenshot, -1)
    assert.ok(gate < windowPixels)
    assert.ok(gate < pageScreenshot)
  })

  it('passes synthetic fixture identity and returns a content-free privacy receipt', () => {
    assert.deepEqual(
      assertCapturePrivacy('fixture.png', {
        text: 'Signed in as capture-bot@example.invalid',
        fields: [{ type: 'text', value: 'capture-bot@example.invalid' }],
        attributes: ['https://example.invalid/repository'],
      }),
      {
        passed: true,
        checkedTextCharacters: 40,
        checkedFieldCount: 1,
        checkedAttributeCount: 1,
      }
    )
  })

  it('rejects each private-data class without echoing the matched value', () => {
    const cases = [
      {
        kind: 'private-path',
        evidence: { text: 'C:\\Users\\alice\\private-repository' },
        secret: 'alice',
      },
      {
        kind: 'personal-email',
        evidence: { text: 'alice@personal.example' },
        secret: 'alice@personal.example',
      },
      {
        kind: 'credential',
        evidence: { attributes: ['Authorization: Bearer top-secret-token'] },
        secret: 'top-secret-token',
      },
      {
        kind: 'password-field',
        evidence: {
          fields: [{ type: 'password', value: 'correct horse battery staple' }],
        },
        secret: 'correct horse battery staple',
      },
    ]

    for (const { kind, evidence, secret } of cases) {
      assert.throws(
        () => assertCapturePrivacy('unsafe.png', evidence),
        error =>
          error instanceof Error &&
          error.message.includes(`(${kind})`) &&
          !error.message.includes(secret)
      )
    }
  })

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
      /No complete built app/
    )
  })
})
