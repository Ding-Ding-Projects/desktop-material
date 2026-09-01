import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import { RangeSlider } from '../../src/ui/lib/range-slider'
import { Md3AuthenticatorRegistration } from '../../src/ui/md3/md3-authenticator-registration'
import { fireEvent, render } from '../helpers/ui/render'

function extractCssRule(css: string, selector: string): string {
  let start = css.indexOf(selector)
  while (start !== -1 && !/^\s*\{/.test(css.slice(start + selector.length))) {
    start = css.indexOf(selector, start + selector.length)
  }
  assert.notEqual(start, -1, `missing CSS selector ${selector}`)
  const open = css.indexOf('{', start)
  assert.ok(open > start, `missing opening brace for ${selector}`)
  let depth = 0
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++
    if (css[index] === '}') {
      depth--
      if (depth === 0) return css.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated CSS rule ${selector}`)
}

describe('shared control target sizes', () => {
  it('keeps every owned target-size rule at 40px', () => {
    const root = join(process.cwd(), 'app')
    const controls = readFileSync(
      join(root, 'styles', '_material-controls.scss'),
      'utf8'
    )
    const authenticator = readFileSync(
      join(root, 'styles', 'ui', '_md3-authenticator.scss'),
      'utf8'
    )
    const destructive = readFileSync(
      join(root, 'styles', 'ui', '_md3-destructive-gate.scss'),
      'utf8'
    )
    assert.match(
      extractCssRule(controls, '.range-slider-input-hit-target'),
      /min-height:\s*40px;/
    )
    assert.match(
      extractCssRule(authenticator, '.md3-auth-register__source'),
      /min-height:\s*40px;/
    )
    assert.match(
      extractCssRule(destructive, '.md3-destructive-gate__key'),
      /min-height:\s*40px;/
    )
    assert.match(
      extractCssRule(
        destructive,
        ".md3-destructive-gate__slider-input[type='range']"
      ),
      /(?:^|[;\n])\s*height:\s*40px;/
    )
  })

  it('keeps the shared range input inside a 40px semantic hit target', () => {
    let value = 25
    const view = render(
      <RangeSlider
        id="target-size-range"
        label="Target size"
        value={value}
        min={0}
        max={100}
        step={1}
        onChange={next => {
          value = next
        }}
      />
    )
    const hitTarget = view.container.querySelector(
      '.range-slider-input-hit-target'
    )
    const input =
      view.container.querySelector<HTMLInputElement>('#target-size-range')
    assert.notEqual(hitTarget, null)
    assert.notEqual(input, null)
    assert.equal(hitTarget?.firstElementChild, input)
    fireEvent.change(input!, { target: { value: '50' } })
    assert.equal(value, 50)
  })

  it('binds progress paint to the 40px wrappers at all slider values', () => {
    const destructive = readFileSync(
      join(process.cwd(), 'app', 'styles', 'ui', '_md3-destructive-gate.scss'),
      'utf8'
    )
    const rangeSource = readFileSync(
      join(process.cwd(), 'app', 'src', 'ui', 'lib', 'range-slider.tsx'),
      'utf8'
    )
    const gateSource = readFileSync(
      join(
        process.cwd(),
        'app',
        'src',
        'ui',
        'md3',
        'md3-destructive-gate.tsx'
      ),
      'utf8'
    )
    assert.ok(
      rangeSource.indexOf('range-slider-input-hit-target') <
        rangeSource.indexOf('--range-slider-progress')
    )
    assert.ok(
      gateSource.indexOf('md3-destructive-gate__slider-input-hit-target') <
        gateSource.indexOf('--md3-gate-progress')
    )
    const gateInputRule = extractCssRule(
      destructive,
      ".md3-destructive-gate__slider-input[type='range']"
    )
    assert.match(gateInputRule, /background:\s*transparent;/)
    assert.throws(() =>
      assert.match(
        gateInputRule.replace(/height:\s*40px;/, ''),
        /(?:^|[;\n])\s*height:\s*40px;/
      )
    )
    assert.throws(() =>
      assert.match(
        gateInputRule.replace(/background:\s*transparent;/, 'background: red;'),
        /background:\s*transparent;/
      )
    )
  })

  it('keeps authenticator source rows label-clickable and keyboard-selectable', () => {
    const view = render(
      <Md3AuthenticatorRegistration
        generateSecret={() => new Uint8Array(20).fill(1)}
        onCommit={() => undefined}
        onDismissed={() => undefined}
      />
    )
    const radios = view.container.querySelectorAll<HTMLButtonElement>(
      '.md3-auth-register__source[role="radio"]'
    )
    assert.equal(radios.length, 6)
    assert.equal(radios[0].tabIndex, 0)
    fireEvent.click(radios[2])
    assert.equal(radios[2].getAttribute('aria-checked'), 'true')
    assert.equal(radios[0].getAttribute('aria-checked'), 'false')
    fireEvent.keyDown(view.container.querySelector('[role="radiogroup"]')!, {
      key: 'ArrowRight',
    })
    assert.equal(
      view.container.querySelectorAll<HTMLButtonElement>(
        '.md3-auth-register__source[aria-checked="true"]'
      ).length,
      1
    )
  })
})
