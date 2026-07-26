import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { INotificationAutomationRule } from '../../../src/lib/notifications/automation/notification-automation'
import { INotificationEntry } from '../../../src/models/notification-centre'
import { DialogStackContext } from '../../../src/ui/dialog'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { NotificationAutomationsDialog } from '../../../src/ui/notifications/notification-automations-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialogShow: (() => void) | null = null

beforeEach(async () => {
  const electron = await import('electron')
  const previousSend = (electron.ipcRenderer as { send?: unknown }).send
  ;(electron.ipcRenderer as { send: unknown }).send = () => {}
  restoreIpcSend = () => {
    ;(electron.ipcRenderer as { send?: unknown }).send = previousSend
    restoreIpcSend = null
  }

  const prototype = window.HTMLDialogElement.prototype
  const previousShow = prototype.show
  prototype.show = function () {
    this.setAttribute('open', '')
  }
  restoreDialogShow = () => {
    prototype.show = previousShow
    restoreDialogShow = null
  }
})

afterEach(() => {
  restoreIpcSend?.()
  restoreDialogShow?.()
})

class FakeDispatcher {
  public rules: Array<INotificationAutomationRule>
  public readonly saved = new Array<INotificationAutomationRule>()
  public readonly enabledCalls = new Array<{
    id: string
    enabled: boolean
  }>()
  public readonly removed = new Array<string>()

  public constructor(rules: ReadonlyArray<INotificationAutomationRule> = []) {
    this.rules = [...rules]
  }

  public async getNotificationAutomationRules() {
    return this.rules
  }

  public async saveNotificationAutomationRule(
    rule: INotificationAutomationRule
  ) {
    this.saved.push(rule)
    const index = this.rules.findIndex(r => r.id === rule.id)
    if (index === -1) {
      this.rules = [...this.rules, rule]
    } else {
      this.rules = this.rules.map((r, i) => (i === index ? rule : r))
    }
  }

  public async setNotificationAutomationRuleEnabled(
    id: string,
    enabled: boolean
  ) {
    this.enabledCalls.push({ id, enabled })
  }

  public async removeNotificationAutomationRule(id: string) {
    this.removed.push(id)
    this.rules = this.rules.filter(r => r.id !== id)
  }
}

function asDispatcher(dispatcher: FakeDispatcher) {
  return dispatcher as unknown as Dispatcher
}

const entry: INotificationEntry = {
  id: 'entry-1',
  kind: 'pr-checks-failed',
  title: 'Checks failed on main',
  body: 'red',
  createdAt: '2026-07-17T12:00:00.000Z',
  read: false,
  repositoryId: 42,
}

const webhookRule = (
  overrides: Partial<INotificationAutomationRule> = {}
): INotificationAutomationRule => ({
  id: 'rule-deploy',
  name: 'Deploy hook',
  enabled: false,
  kinds: 'all',
  action: {
    type: 'webhook',
    url: 'https://example.com/hook',
    bodyTemplate: '{"title":"{title}"}',
  },
  ...overrides,
})

function renderDialog(
  dispatcher: FakeDispatcher,
  props: { entry?: INotificationEntry } = {}
) {
  return render(
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      <NotificationAutomationsDialog
        dispatcher={asDispatcher(dispatcher)}
        entry={props.entry}
        repositories={[]}
        onDismissed={() => {}}
      />
    </DialogStackContext.Provider>
  )
}

describe('NotificationAutomationsDialog', () => {
  it('lists a loaded rule as disabled and arming dispatches an explicit enable', async () => {
    const dispatcher = new FakeDispatcher([webhookRule()])
    renderDialog(dispatcher)

    await waitFor(() => assert.ok(screen.getByText('Deploy hook')))
    assert.ok(screen.getByText('Disabled'))

    const arm = screen.getByRole('switch', {
      name: 'Arm automation: Deploy hook',
    })
    assert.equal((arm as HTMLInputElement).checked, false)
    fireEvent.click(arm)

    assert.deepEqual(dispatcher.enabledCalls, [
      { id: 'rule-deploy', enabled: true },
    ])
  })

  it('saves a new webhook rule disarmed and carries the body template', async () => {
    const dispatcher = new FakeDispatcher()
    renderDialog(dispatcher, { entry })

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'New automation…' }))
    )
    fireEvent.click(screen.getByRole('button', { name: 'New automation…' }))

    fireEvent.change(screen.getByLabelText('Automation name'), {
      target: { value: 'Ping ops' },
    })
    fireEvent.change(screen.getByLabelText('Webhook URL'), {
      target: { value: 'https://hooks.example.com/ops' },
    })
    fireEvent.change(screen.getByLabelText('Webhook body template'), {
      target: { value: '{"kind":"{kind}"}' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create automation' }))

    await waitFor(() => assert.equal(dispatcher.saved.length, 1))
    const saved = dispatcher.saved[0]
    assert.equal(saved.enabled, false)
    assert.equal(saved.name, 'Ping ops')
    assert.equal(saved.action.type, 'webhook')
    assert.equal(
      saved.action.type === 'webhook' ? saved.action.url : '',
      'https://hooks.example.com/ops'
    )
    assert.equal(
      saved.action.type === 'webhook' ? saved.action.bodyTemplate : '',
      '{"kind":"{kind}"}'
    )
    // The repository scope defaulted to the entry the builder was opened from.
    assert.equal(saved.repositoryId, 42)
  })

  it('preserves meaningful leading and trailing spaces in a title pattern', async () => {
    const dispatcher = new FakeDispatcher()
    renderDialog(dispatcher)

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'New automation…' }))
    )
    fireEvent.click(screen.getByRole('button', { name: 'New automation…' }))
    fireEvent.change(screen.getByLabelText('Automation name'), {
      target: { value: 'Spaced pattern' },
    })
    fireEvent.change(screen.getByLabelText('Webhook URL'), {
      target: { value: 'https://example.com/spaced' },
    })
    fireEvent.change(screen.getByLabelText('Title pattern'), {
      target: { value: ' ^Checks failed$ ' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create automation' }))
    await waitFor(() => assert.equal(dispatcher.saved.length, 1))
    assert.equal(dispatcher.saved[0].titlePattern, ' ^Checks failed$ ')
  })

  it('flags and refuses to arm a legacy unsupported pattern', async () => {
    const dispatcher = new FakeDispatcher([
      webhookRule({ titlePattern: 'Checks(?= failed)' }),
    ])
    renderDialog(dispatcher)

    await waitFor(() =>
      assert.ok(screen.getByText(/Pattern needs review before/))
    )
    fireEvent.click(
      screen.getByRole('switch', { name: 'Arm automation: Deploy hook' })
    )

    assert.deepEqual(dispatcher.enabledCalls, [])
    await waitFor(() =>
      assert.ok(
        screen
          .getAllByRole('alert')
          .some(node => /Edit .* before arming/i.test(node.textContent ?? ''))
      )
    )
  })

  it('uses safe unique ARIA ids for malformed and duplicate persisted rule ids', async () => {
    const malformedId = ' persisted\trule #?[] '
    const duplicateId = 'duplicate-rule'
    const dispatcher = new FakeDispatcher([
      webhookRule({
        id: malformedId,
        name: 'Malformed id',
        titlePattern: 'Checks(?= failed)',
      }),
      webhookRule({
        id: duplicateId,
        name: 'First duplicate',
        titlePattern: 'Build(?= failed)',
      }),
      webhookRule({
        id: duplicateId,
        name: 'Second duplicate',
        titlePattern: 'Deploy(?= failed)',
      }),
    ])
    renderDialog(dispatcher)

    await waitFor(() =>
      assert.equal(
        document.querySelectorAll(
          '.notification-automation-state.pattern-warning'
        ).length,
        3
      )
    )

    const switches = screen.getAllByRole('switch')
    const warningIds = switches.map(control => {
      const row = control.closest('.notification-automation-row')
      assert.ok(row)
      assert.match(row.id, /^[A-Za-z][A-Za-z0-9_-]*$/)

      const describedBy = control.getAttribute('aria-describedby')
      assert.ok(describedBy)
      assert.match(describedBy, /^[A-Za-z][A-Za-z0-9_-]*$/)

      const warning = document.getElementById(describedBy)
      assert.ok(warning)
      assert.equal(warning.closest('.notification-automation-row'), row)
      return describedBy
    })

    assert.equal(new Set(warningIds).size, warningIds.length)
    assert.deepEqual(
      dispatcher.rules.map(rule => rule.id),
      [malformedId, duplicateId, duplicateId]
    )
  })

  it('blocks saving a webhook rule whose URL carries a query string', async () => {
    const dispatcher = new FakeDispatcher()
    renderDialog(dispatcher)

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'New automation…' }))
    )
    fireEvent.click(screen.getByRole('button', { name: 'New automation…' }))

    fireEvent.change(screen.getByLabelText('Automation name'), {
      target: { value: 'Bad URL' },
    })
    fireEvent.change(screen.getByLabelText('Webhook URL'), {
      target: { value: 'https://example.com/hook?secret=1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create automation' }))

    await waitFor(() =>
      assert.ok(
        screen
          .getAllByRole('alert')
          .some(node => /query string/i.test(node.textContent ?? ''))
      )
    )
    assert.equal(dispatcher.saved.length, 0)
  })

  it('refuses a command whose static argument contains a metacharacter', async () => {
    const dispatcher = new FakeDispatcher()
    renderDialog(dispatcher)

    await waitFor(() =>
      assert.ok(screen.getByRole('button', { name: 'New automation…' }))
    )
    fireEvent.click(screen.getByRole('button', { name: 'New automation…' }))

    fireEvent.change(screen.getByLabelText('Automation name'), {
      target: { value: 'Local command' },
    })
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'command' },
    })
    fireEvent.change(screen.getByLabelText('Command executable'), {
      target: { value: 'notify-send' },
    })
    fireEvent.change(screen.getByLabelText('Argument 1'), {
      target: { value: 'a;rm' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create automation' }))

    await waitFor(() =>
      assert.ok(
        screen
          .getAllByRole('alert')
          .some(node => /not allowed/i.test(node.textContent ?? ''))
      )
    )
    assert.equal(dispatcher.saved.length, 0)
  })

  it('filters the rule list case-insensitively', async () => {
    const dispatcher = new FakeDispatcher([
      webhookRule({ id: 'r1', name: 'Deploy hook' }),
      webhookRule({ id: 'r2', name: 'Nightly build' }),
    ])
    renderDialog(dispatcher)

    await waitFor(() => assert.ok(screen.getByText('Deploy hook')))
    assert.ok(screen.getByText('Nightly build'))

    fireEvent.change(screen.getByLabelText('Search automations by name'), {
      target: { value: 'DEPLOY' },
    })

    await waitFor(() => assert.equal(screen.queryByText('Nightly build'), null))
    assert.ok(screen.getByText('Deploy hook'))
  })

  it('surfaces unsupported regex syntax without silently hiding validation', async () => {
    const dispatcher = new FakeDispatcher([
      webhookRule({ id: 'r1', name: 'Deploy hook' }),
      webhookRule({ id: 'r2', name: 'Nightly build' }),
    ])
    renderDialog(dispatcher)

    await waitFor(() => assert.ok(screen.getByText('Deploy hook')))
    const mode = screen.getByRole('button', { name: /^Filter mode/ })
    fireEvent.click(mode)
    fireEvent.click(mode)
    const input = screen.getByLabelText('Search automations by name')
    fireEvent.change(input, { target: { value: '(?=Deploy)' } })

    assert.equal(input.getAttribute('aria-invalid'), 'true')
    const describedBy = input.getAttribute('aria-describedby')
    assert.ok(describedBy)
    assert.match(describedBy, /^[A-Za-z][A-Za-z0-9_-]*$/)
    const error = document.getElementById(describedBy)
    assert.ok(error)
    assert.equal(error.getAttribute('role'), 'alert')
    assert.match(error.textContent ?? '', /RE2/)
    assert.ok(screen.getByText('Deploy hook'))
    assert.ok(screen.getByText('Nightly build'))
  })
})
