import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { RepositorySidebarTabs } from '../../src/ui/agent-sessions/repository-sidebar-tabs'
import { fireEvent, render, within } from '../helpers/ui/render'

function renderTabs(
  activeView: 'list' | 'agents',
  agentsDisabled = false,
  onViewChanged: (view: 'list' | 'agents') => void = () => undefined
) {
  return render(
    <RepositorySidebarTabs
      activeView={activeView}
      tabListLabel="Repository sidebar"
      listLabel="List"
      agentsLabel="Agents"
      agentsDisabled={agentsDisabled}
      onViewChanged={onViewChanged}
      listContent={<p>Repository list</p>}
      agentsContent={<p>Agent fleet</p>}
    />
  )
}

describe('RepositorySidebarTabs', () => {
  it('exposes a named tablist and only the selected panel', () => {
    const view = renderTabs('list')
    const tabs = view.getByRole('tablist', { name: 'Repository sidebar' })
    const [list, agents] = within(tabs).getAllByRole('tab')

    assert.strictEqual(list.getAttribute('aria-selected'), 'true')
    assert.strictEqual(list.getAttribute('tabindex'), '0')
    assert.strictEqual(agents.getAttribute('aria-selected'), 'false')
    assert.strictEqual(agents.getAttribute('tabindex'), '-1')
    assert.strictEqual(
      view.getByText('Repository list').closest('[hidden]'),
      null
    )
    assert.ok(view.getByText('Agent fleet').closest('[hidden]'))
  })

  it('requests Agents on click and with the right arrow', () => {
    const selected: Array<string> = []
    const view = renderTabs('list', false, next => selected.push(next))
    const list = view.getByRole('tab', { name: 'List' })

    fireEvent.click(view.getByRole('tab', { name: 'Agents' }))
    fireEvent.keyDown(list, { key: 'ArrowRight' })

    assert.deepStrictEqual(selected, ['agents', 'agents'])
  })

  it('keeps Agents unreachable until a repository is selected', () => {
    const selected: Array<string> = []
    const view = renderTabs('list', true, next => selected.push(next))
    const agents = view.getByRole('tab', { name: 'Agents' })

    assert.strictEqual(agents.hasAttribute('disabled'), true)
    assert.strictEqual(agents.getAttribute('aria-disabled'), 'true')
    fireEvent.click(agents)
    fireEvent.keyDown(view.getByRole('tab', { name: 'List' }), {
      key: 'ArrowRight',
    })
    assert.deepStrictEqual(selected, [])
  })
})
