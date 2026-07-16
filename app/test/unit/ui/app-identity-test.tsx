import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import {
  DefaultAppIdentityCustomization,
  IAppIdentityCustomization,
} from '../../../src/models/app-identity'
import { AppIdentity } from '../../../src/ui/preferences/app-identity'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('AppIdentity', () => {
  it('exposes the complete labelled identity editor and live preview', () => {
    render(
      <AppIdentity
        value={DefaultAppIdentityCustomization}
        onChange={() => {}}
      />
    )

    assert.ok(screen.getByRole('heading', { name: 'App identity' }))
    assert.ok(screen.getByRole('group', { name: 'Live app identity preview' }))
    assert.ok(screen.getByRole('textbox', { name: 'App name' }))
    assert.ok(screen.getByRole('button', { name: 'Custom image' }))
    assert.ok(screen.getByRole('combobox', { name: 'Logo shape' }))
    assert.ok(screen.getByRole('combobox', { name: 'Logo border' }))
    assert.ok(screen.getByRole('combobox', { name: 'Logo shadow' }))
    assert.ok(screen.getByRole('slider', { name: 'Logo size' }))
    assert.ok(screen.getByRole('slider', { name: 'Logo icon inset' }))
    assert.ok(screen.getByRole('slider', { name: 'Logo rotation' }))
    assert.ok(screen.getByRole('slider', { name: 'Logo and name gap' }))
    assert.ok(screen.getByRole('combobox', { name: 'Font' }))
    assert.ok(screen.getByRole('combobox', { name: 'Weight' }))
    assert.ok(screen.getByRole('combobox', { name: 'Font width' }))
    assert.ok(screen.getByRole('combobox', { name: 'Letter case' }))
    assert.ok(screen.getByRole('combobox', { name: 'Text effect' }))
    assert.ok(screen.getByRole('combobox', { name: 'Name highlight' }))
    assert.ok(screen.getByRole('slider', { name: 'Name size' }))
    assert.ok(screen.getByRole('slider', { name: 'Character spacing' }))
    assert.ok(screen.getByRole('slider', { name: 'App name opacity' }))
    assert.ok(screen.getByRole('button', { name: 'Bold' }))
    assert.ok(screen.getByRole('button', { name: 'Italic' }))
    assert.ok(screen.getByRole('button', { name: 'Underline' }))
    assert.ok(screen.getByRole('button', { name: 'Strikethrough' }))
    assert.ok(screen.getByRole('button', { name: 'Small caps' }))
  })

  it('reports valid live changes and does not apply a blank name', () => {
    const reported: IAppIdentityCustomization[] = []
    render(
      <AppIdentity
        value={DefaultAppIdentityCustomization}
        onChange={identity => reported.push(identity)}
      />
    )

    const name = screen.getByRole('textbox', { name: 'App name' })
    fireEvent.focus(name)
    fireEvent.change(name, { target: { value: 'Material Studio' } })
    assert.equal(reported.at(-1)?.displayName, 'Material Studio')

    const countBeforeBlank = reported.length
    fireEvent.change(name, { target: { value: '   ' } })
    assert.equal(reported.length, countBeforeBlank)
    assert.ok(screen.getByText('Enter an app name.'))

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    assert.equal(reported.at(-1)?.bold, true)
  })

  it('merges rapid control changes before parent props refresh', () => {
    const reported: IAppIdentityCustomization[] = []
    render(
      <AppIdentity
        value={DefaultAppIdentityCustomization}
        onChange={identity => reported.push(identity)}
      />
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Logo border' }), {
      target: { value: 'strong' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Font width' }), {
      target: { value: 'expanded' },
    })

    assert.equal(reported.at(-1)?.logoBorder, 'strong')
    assert.equal(reported.at(-1)?.fontWidth, 'expanded')
  })

  it('resets known fields while preserving future identity data', () => {
    const reported: IAppIdentityCustomization[] = []
    render(
      <AppIdentity
        value={{
          ...DefaultAppIdentityCustomization,
          displayName: 'Custom Workbench',
          logo: 'terminal',
          fontSize: 17,
          futureIdentityEffect: 'outline',
        }}
        onChange={identity => {
          reported.push(identity)
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset identity' }))

    const changed = reported.at(-1)
    assert.ok(changed)
    assert.equal(changed.displayName, 'Desktop Material')
    assert.equal(changed.logo, 'github')
    assert.equal(changed.fontSize, 12.5)
    assert.equal(changed.futureIdentityEffect, 'outline')
  })
})
