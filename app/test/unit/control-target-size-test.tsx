import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import { RangeSlider } from '../../src/ui/lib/range-slider'
import { Md3AuthenticatorRegistration } from '../../src/ui/md3/md3-authenticator-registration'
import { fireEvent, render } from '../helpers/ui/render'

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
      controls,
      /\.range-slider-input-hit-target\s*\{[\s\S]*?min-height:\s*40px;/
    )
    assert.match(
      authenticator,
      /\.md3-auth-register__source\s*\{[\s\S]*?min-height:\s*40px;/
    )
    assert.match(
      destructive,
      /\.md3-destructive-gate__key\s*\{[\s\S]*?min-height:\s*40px;/
    )
    assert.match(
      destructive,
      /\.md3-destructive-gate__slider-input\s*\{[\s\S]*?height:\s*40px;/
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
