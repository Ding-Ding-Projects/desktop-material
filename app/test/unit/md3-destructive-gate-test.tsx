import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  englishTranslations,
  cantoneseTranslations,
} from '../../src/lib/i18n-resources'
import {
  Md3DestructiveActions,
  Md3DestructiveActionId,
  md3DestructiveAction,
} from '../../src/ui/md3/md3-destructive-actions'
import {
  Md3DestructiveGate,
  Md3DestructiveGateBody,
  Md3GateAuthorizationMaximum,
  md3GateAnchorPosition,
  md3GateState,
} from '../../src/ui/md3/md3-destructive-gate'
import { fireEvent, render, screen } from '../helpers/ui/render'

const root = process.cwd()
const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), 'utf8')

/**
 * The identifiers this contract requires, written out by hand.
 *
 * `Md3DestructiveActions` is itself the hand-written registry, but a test that
 * only iterates the registry cannot notice a row being deleted from it — the
 * loop simply runs one fewer time and passes. Keeping the expected set here as
 * well means removing a destructive action from the contract has to be done
 * twice, deliberately, in two files.
 */
const RequiredActionIds: ReadonlyArray<Md3DestructiveActionId> = [
  'discard-changes',
  'discard-selection',
  'delete-branch',
  'delete-remote-branch',
  'delete-tag',
  'remove-repository',
  'reset-to-commit',
  'force-push',
  'repository-transfer',
  'self-hosted-runner-removal',
  'inbox-bulk-delete',
  'branches-bulk-delete',
  'changes-bulk-discard',
  'history-bulk-revert',
  'actions-bulk-cancel',
  'agents-bulk-delete',
  'terminal-bulk-close',
  'authenticator-bulk-delete',
  'authenticator-secrets-export',
]

describe('destructive action registry', () => {
  it('registers every action the contract requires', () => {
    const registered = Md3DestructiveActions.map(action => action.id)
    for (const id of RequiredActionIds) {
      assert.ok(
        registered.includes(id),
        `"${id}" must stay in Md3DestructiveActions — a destructive action ` +
          `without a registry entry is a destructive action nothing checks.`
      )
    }
    assert.deepStrictEqual(
      [...registered].sort(),
      [...RequiredActionIds].sort(),
      'the registry and the required set must agree exactly'
    )
  })

  it('describes what every registered action destroys', () => {
    for (const action of Md3DestructiveActions) {
      assert.ok(
        action.destroys.trim().length > 20,
        `${action.id} needs a real statement of what it destroys`
      )
      assert.ok(
        action.label.trim().length > 0,
        `${action.id} needs a human-readable label`
      )
    }
  })

  it('looks an action up by identifier and refuses an unknown one', () => {
    assert.equal(md3DestructiveAction('delete-tag').label, 'Delete tag')
    assert.throws(
      () => md3DestructiveAction('not-an-action' as Md3DestructiveActionId),
      /not-an-action/
    )
  })

  /**
   * The assertion that matters. It runs FROM the registry AT the tree: for each
   * recorded action it opens the module that is supposed to host the gate and
   * demands the wiring is actually there. A check shaped "every gate present is
   * well-formed" passes on an application that gates nothing, because it only
   * ever iterates what it finds.
   */
  it('wires every registered action to the shared gate', () => {
    for (const action of Md3DestructiveActions) {
      assert.ok(
        existsSync(join(root, action.module)),
        `"${action.id}" is registered against ${action.module}, which does ` +
          `not exist. A registry row pointing at nothing gates nothing.`
      )
      const text = source(action.module)

      assert.match(
        text,
        /\bMd3DestructiveGate(Body)?\b/,
        `${action.module} must render the shared gate for "${action.id}"`
      )

      assert.ok(
        text.includes(`actionId="${action.id}"`),
        `${action.module} must pass actionId="${action.id}" to the shared gate`
      )

      const expected =
        action.host === 'overlay'
          ? /<Md3DestructiveGate\s/
          : /<Md3DestructiveGateBody\s/
      assert.match(
        text,
        expected,
        `${action.module} is registered as a "${action.host}" host and must ` +
          `render the matching shape of the gate`
      )
    }
  })

  it('gives every dialog host an emergency exit and a gated affirmative', () => {
    for (const action of Md3DestructiveActions) {
      if (action.host !== 'dialog') {
        continue
      }
      const text = source(action.module)
      assert.ok(
        text.includes('Emergency exit'),
        `${action.module} must offer an emergency exit`
      )
      assert.match(
        text,
        /okButtonDisabled=|disabled=\{!this\.state\.gateAuthorized/,
        `${action.module} must hold its affirmative action disabled until the ` +
          `gate reports itself authorized`
      )
      assert.match(
        text,
        /gateAuthorized/,
        `${action.module} must record the gate's verdict`
      )

      // A destructive `Dialog` makes the affirmative control a plain button
      // and the CANCEL button the form's submit button, so Enter anywhere in
      // the form fires the affirmative path regardless of whether that button
      // is disabled. Disabling the button alone therefore gates the pointer
      // and leaves the keyboard wide open, which is the worse half to lose.
      assert.match(
        text,
        /if \(!this\.state\.gateAuthorized\)|this\.state\.gateAuthorized \)|&& this\.state\.gateAuthorized|this\.canTransfer\(\)/,
        `${action.module} must refuse a submission the gate has not authorized`
      )
    }
  })
})

describe('destructive gate state machine', () => {
  it('stays locked while either key is off, whatever the slider says', () => {
    assert.equal(md3GateState(false, false, 0), 'locked')
    assert.equal(
      md3GateState(true, false, Md3GateAuthorizationMaximum),
      'locked'
    )
    assert.equal(
      md3GateState(false, true, Md3GateAuthorizationMaximum),
      'locked'
    )
  })

  it('arms, moves and authorizes once both keys are turned', () => {
    assert.equal(md3GateState(true, true, 0), 'armed')
    assert.equal(md3GateState(true, true, 1), 'moving')
    assert.equal(md3GateState(true, true, 99), 'moving')
    assert.equal(
      md3GateState(true, true, Md3GateAuthorizationMaximum),
      'authorized'
    )
  })
})

describe('destructive gate anchoring', () => {
  const panel = { width: 380, height: 400 }
  const viewport = { width: 1200, height: 900 }

  it('places the panel below the control that opened it', () => {
    const position = md3GateAnchorPosition(
      { top: 100, left: 200, width: 120, height: 30 },
      panel,
      viewport
    )
    assert.deepStrictEqual(position, { top: 138, left: 200 })
  })

  it('flips above when there is no room below', () => {
    const position = md3GateAnchorPosition(
      { top: 700, left: 200, width: 120, height: 30 },
      panel,
      viewport
    )
    assert.deepStrictEqual(position, { top: 292, left: 200 })
  })

  it('keeps the panel inside the viewport horizontally', () => {
    const position = md3GateAnchorPosition(
      { top: 100, left: 1150, width: 40, height: 30 },
      panel,
      viewport
    )
    assert.deepStrictEqual(position, { top: 138, left: 808 })
  })

  it('refuses to place a panel that would cover its own control', () => {
    // A 400px panel, a 700px viewport and a control in the middle: neither
    // above nor below fits, so an anchored presentation would have to overlap
    // the button. The caller falls back to a centred modal instead.
    assert.equal(
      md3GateAnchorPosition(
        { top: 300, left: 100, width: 120, height: 30 },
        panel,
        { width: 1200, height: 700 }
      ),
      null
    )
  })

  it('refuses a viewport too small for the panel at all', () => {
    assert.equal(
      md3GateAnchorPosition(
        { top: 10, left: 10, width: 40, height: 30 },
        panel,
        { width: 320, height: 900 }
      ),
      null
    )
  })
})

describe('destructive gate body', () => {
  const renderBody = (onAuthorizationChanged?: (value: boolean) => void) =>
    render(
      <Md3DestructiveGateBody
        actionId="delete-tag"
        summary="This deletes the tag v1.2.3 from desktop-material."
        irreversible="Once the deletion is pushed, v1.2.3 no longer points at its commit."
        targetKeyLabel="the tag v1.2.3"
        effectKeyLabel="the tag is removed"
        onAuthorizationChanged={onAuthorizationChanged}
      />
    )

  it('keeps the slider unusable until both keys are turned', () => {
    renderBody()
    const slider = screen.getByRole('slider') as HTMLInputElement
    const keys = screen.getAllByRole('checkbox')

    assert.equal(keys.length, 2)
    assert.equal(slider.disabled, true)

    fireEvent.click(keys[0])
    assert.equal(slider.disabled, true)

    fireEvent.click(keys[1])
    assert.equal(slider.disabled, false)
  })

  it('only reports authorization at the very end of the slider', () => {
    const seen: Array<boolean> = []
    renderBody(value => seen.push(value))
    const slider = screen.getByRole('slider') as HTMLInputElement
    const keys = screen.getAllByRole('checkbox')

    fireEvent.click(keys[0])
    fireEvent.click(keys[1])
    fireEvent.change(slider, { target: { value: '99' } })
    assert.equal(seen.at(-1), false)

    fireEvent.change(slider, {
      target: { value: String(Md3GateAuthorizationMaximum) },
    })
    assert.equal(seen.at(-1), true)
  })

  it('retracts authorization when a key is turned back off', () => {
    const seen: Array<boolean> = []
    renderBody(value => seen.push(value))
    const slider = screen.getByRole('slider') as HTMLInputElement
    const keys = screen.getAllByRole('checkbox')

    fireEvent.click(keys[0])
    fireEvent.click(keys[1])
    fireEvent.change(slider, {
      target: { value: String(Md3GateAuthorizationMaximum) },
    })
    assert.equal(seen.at(-1), true)

    fireEvent.click(keys[1])
    assert.equal(seen.at(-1), false)

    // And the slider has genuinely gone back to zero, so re-ticking the key
    // cannot re-authorize in one click.
    fireEvent.click(keys[1])
    assert.equal(seen.at(-1), false)
    assert.equal(slider.value, '0')
  })

  it('states the facts verbatim and reports the state in words', () => {
    renderBody()
    assert.ok(
      screen.getByText(
        'This deletes the tag v1.2.3 from desktop-material.'
      ) instanceof HTMLElement
    )
    assert.ok(
      screen.getByText(
        'Once the deletion is pushed, v1.2.3 no longer points at its commit.'
      ) instanceof HTMLElement
    )
    assert.ok(
      screen.getByText(
        englishTranslations['md3.destructiveGate.stateLocked']
      ) instanceof HTMLElement
    )
  })

  it('freezes both keys and the slider when disabled', () => {
    render(
      <Md3DestructiveGateBody
        actionId="delete-tag"
        summary="This deletes the tag v1.2.3."
        irreversible="It cannot be recreated from this app."
        targetKeyLabel="the tag v1.2.3"
        effectKeyLabel="the tag is removed"
        disabled={true}
      />
    )
    for (const key of screen.getAllByRole('checkbox')) {
      assert.equal((key as HTMLInputElement).disabled, true)
    }
    assert.equal(
      (screen.getByRole('slider') as HTMLInputElement).disabled,
      true
    )
  })
})

describe('destructive gate overlay', () => {
  const renderGate = (overrides: {
    readonly onConfirm?: () => void
    readonly onDismissed?: () => void
    readonly busy?: boolean
    readonly error?: string | null
  }) =>
    render(
      <Md3DestructiveGate
        actionId="inbox-bulk-delete"
        title="Delete 4 notifications?"
        summary="This deletes 4 notifications from the inbox."
        irreversible="Deleted notifications cannot be restored from the inbox."
        targetKeyLabel="4 notifications"
        effectKeyLabel="they leave the inbox"
        confirmLabel="Delete 4"
        busy={overrides.busy}
        error={overrides.error}
        onConfirm={overrides.onConfirm ?? (() => undefined)}
        onDismissed={overrides.onDismissed ?? (() => undefined)}
      />
    )

  it('never confirms without both keys and a full slider', () => {
    let confirmations = 0
    renderGate({ onConfirm: () => confirmations++ })

    const confirm = screen.getByRole('button', {
      name: 'Delete 4',
    }) as HTMLButtonElement
    const dialog = screen.getByRole('alertdialog')
    const slider = screen.getByRole('slider')
    const keys = screen.getAllByRole('checkbox')
    assert.equal(confirm.disabled, true)

    // Nothing turned at all.
    fireEvent.submit(dialog)
    assert.equal(confirmations, 0)

    // One key, and a slider driven to its maximum anyway. The slider is
    // disabled, so this is what a scripted or assistive-technology attempt to
    // skip the second key looks like, and it must not authorize anything.
    fireEvent.click(keys[0])
    fireEvent.change(slider, {
      target: { value: String(Md3GateAuthorizationMaximum) },
    })
    fireEvent.submit(dialog)
    assert.equal(confirmations, 0)
    assert.equal(confirm.disabled, true)

    // Both keys, but the slider stops one step short.
    fireEvent.click(keys[1])
    fireEvent.change(slider, { target: { value: '99' } })
    fireEvent.submit(dialog)
    assert.equal(confirmations, 0)
    assert.equal(confirm.disabled, true)

    fireEvent.change(slider, {
      target: { value: String(Md3GateAuthorizationMaximum) },
    })
    assert.equal(confirm.disabled, false)
    fireEvent.click(confirm)
    assert.equal(confirmations, 1)
  })

  it('dismisses from the emergency exit, Escape and the scrim', () => {
    let dismissals = 0
    const { container } = renderGate({ onDismissed: () => dismissals++ })

    fireEvent.click(screen.getByRole('button', { name: /Emergency exit/ }))
    assert.equal(dismissals, 1)

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    assert.equal(dismissals, 2)

    const scrim = container.querySelector('.md3-destructive-gate-scrim')
    assert.ok(scrim !== null)
    fireEvent.mouseDown(scrim as Element)
    assert.equal(dismissals, 3)
  })

  it('gives the emergency exit focus when it opens', () => {
    renderGate({})
    assert.equal(
      document.activeElement,
      screen.getByRole('button', { name: /Emergency exit/ })
    )
  })

  it('returns focus to the control that opened it', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    const anchorTo = { current: opener }

    const view = render(
      <Md3DestructiveGate
        actionId="inbox-bulk-delete"
        title="Delete 4 notifications?"
        summary="This deletes 4 notifications from the inbox."
        irreversible="Deleted notifications cannot be restored from the inbox."
        targetKeyLabel="4 notifications"
        effectKeyLabel="they leave the inbox"
        confirmLabel="Delete 4"
        anchorTo={anchorTo}
        onConfirm={() => undefined}
        onDismissed={() => undefined}
      />
    )

    view.unmount()
    assert.equal(document.activeElement, opener)
    opener.remove()
  })

  it('refuses to dismiss or confirm while the action is running', () => {
    let dismissals = 0
    let confirmations = 0
    renderGate({
      busy: true,
      onDismissed: () => dismissals++,
      onConfirm: () => confirmations++,
    })

    const exit = screen.getByRole('button', {
      name: /Emergency exit/,
    }) as HTMLButtonElement
    assert.equal(exit.disabled, true)
    fireEvent.click(exit)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    fireEvent.submit(screen.getByRole('alertdialog'))
    assert.equal(dismissals, 0)
    assert.equal(confirmations, 0)
  })

  it('states a failure verbatim in an alert', () => {
    renderGate({ error: 'HTTP 403: Resource not accessible by integration' })
    const alert = screen.getByRole('alert')
    assert.equal(
      alert.textContent,
      'HTTP 403: Resource not accessible by integration'
    )
  })
})

describe('destructive gate localization', () => {
  const keys = [
    'md3.destructiveGate.eyebrow',
    'md3.destructiveGate.lead.plain',
    'md3.destructiveGate.lead.light',
    'md3.destructiveGate.lead.playful',
    'md3.destructiveGate.lead.maximum',
    'md3.destructiveGate.irreversibleLabel',
    'md3.destructiveGate.keysLegend',
    'md3.destructiveGate.keyTarget',
    'md3.destructiveGate.keyEffect',
    'md3.destructiveGate.sliderLabel',
    'md3.destructiveGate.sliderValue',
    'md3.destructiveGate.stateLocked',
    'md3.destructiveGate.stateArmed',
    'md3.destructiveGate.stateMoving',
    'md3.destructiveGate.stateAuthorized',
    'md3.destructiveGate.emergencyExit',
    'md3.destructiveGate.emergencyExitName',
    'md3.destructiveGate.busy',
    'md3.inbox.gate.title',
    'md3.inbox.gate.summary',
    'md3.inbox.gate.irreversible',
    'md3.inbox.gate.keyTarget',
    'md3.inbox.gate.keyEffect',
    'md3.inbox.gate.confirm',
  ] as const

  it('carries every gate key in both catalogs', () => {
    for (const key of keys) {
      assert.ok(
        englishTranslations[key]?.trim().length > 0,
        `${key} is missing from the English catalog`
      )
      const cantonese = cantoneseTranslations[key]
      assert.ok(
        cantonese !== undefined && cantonese.trim().length > 0,
        `${key} is missing from the Cantonese catalog`
      )
      assert.notEqual(
        cantonese,
        englishTranslations[key],
        `${key} has English text sitting in the Cantonese slot`
      )
    }
  })

  it('keeps every interpolation placeholder in both languages', () => {
    for (const key of keys) {
      const english = englishTranslations[key]
      const cantonese = cantoneseTranslations[key] ?? ''
      const placeholders = (template: string) =>
        [...template.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()
      assert.deepStrictEqual(
        placeholders(cantonese),
        placeholders(english),
        `${key} must interpolate the same facts in both languages`
      )
    }
  })

  it('says what is destroyed at every funny level, not only the serious one', () => {
    // The framing is banded; the facts never are. Each band must still be a
    // real sentence rather than an empty playful placeholder, and no band may
    // be a copy of another, or "maximum playfulness" is a label with nothing
    // behind it.
    const bands = [
      englishTranslations['md3.destructiveGate.lead.plain'],
      englishTranslations['md3.destructiveGate.lead.light'],
      englishTranslations['md3.destructiveGate.lead.playful'],
      englishTranslations['md3.destructiveGate.lead.maximum'],
    ]
    assert.equal(new Set(bands).size, bands.length)
    for (const band of bands) {
      assert.ok(
        band.length > 40,
        `a gate band is too short to be honest: ${band}`
      )
    }
  })
})
