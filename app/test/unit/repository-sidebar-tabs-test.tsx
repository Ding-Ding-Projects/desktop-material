import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

const readStyles = (...segments: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), 'app', 'styles', ...segments), 'utf8')

describe('RepositorySidebarTabs', () => {
  it('preserves the full-height chain used by the virtualized repository list', () => {
    const styles = readStyles('ui', '_agent-sessions.scss')
    const switcherRule = styles.match(
      /\.repository-sidebar-switcher\s*\{([^}]*)\}/
    )

    assert.ok(switcherRule)
    assert.match(switcherRule[1], /(?:^|\n)\s*height:\s*100%;/)
  })

  it('stacks each panel instead of laying its contents out in a row', () => {
    // The width half of the same chain. A panel holds a vertical stack — the
    // repository list panel is an optional add-repositories progress row above
    // the list — so a row direction both put that row beside the list and made
    // the list a shrink-to-fit flex item, sized by its own content rather than
    // by the 390px sheet. The virtualized list takes its width from that
    // measurement, so every row was laid out against a box the sheet never
    // gave it.
    const styles = readStyles('ui', '_agent-sessions.scss')
    const panelRule = styles.match(/\.repository-sidebar-panel\s*\{([^}]*)\}/)

    assert.ok(panelRule)
    assert.match(panelRule[1], /(?:^|\n)\s*flex-direction:\s*column;/)
  })

  it('lets the agents panel own the panel height once panels stack', () => {
    // Stretching a lone row item gave this its height for free; a column
    // container hands out height along the main axis instead, so it has to ask.
    const styles = readStyles('ui', '_agent-sessions.scss')
    const agentsRule = styles.match(/\.agent-sessions-panel\s*\{([^}]*)\}/)

    assert.ok(agentsRule)
    assert.match(agentsRule[1], /(?:^|\n)\s*flex:\s*1 1 auto;/)
  })

  it('gives the repository list a width of its own inside the sheet', () => {
    // The base `.repository-list` rule inherits its minimum width, which worked
    // only while the list was the foldout's direct child. This wrapper sits in
    // between and declares `min-width: 0`, so the inherited minimum resolves to
    // zero and the list has nothing telling it how wide the sheet is.
    const styles = readStyles('ui', '_repository-list.scss')
    const sheetRule = styles.match(
      /#foldout-container \.repository-list\s*\{([\s\S]*?)\n {2}>/
    )

    assert.ok(sheetRule)
    assert.match(sheetRule[1], /(?:^|\n)\s*width:\s*100%;/)
    assert.match(sheetRule[1], /(?:^|\n)\s*flex:\s*1 1 auto;/)
  })

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
