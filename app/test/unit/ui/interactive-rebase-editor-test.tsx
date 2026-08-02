import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  createInteractiveRebasePlan,
  IInteractiveRebasePlan,
  InteractiveRebaseActions,
  reorderInteractiveRebaseCommit,
  updateInteractiveRebaseAction,
} from '../../../src/lib/interactive-rebase/interactive-rebase-plan'
import {
  IInteractiveRebaseCommitLabelContext,
  IInteractiveRebaseEditorLabels,
  IInteractiveRebaseEditorProps,
  InteractiveRebaseEditor,
} from '../../../src/ui/interactive-rebase/interactive-rebase-editor'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

const componentSource = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'interactive-rebase',
    'interactive-rebase-editor.tsx'
  ),
  'utf8'
)
const styles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_interactive-rebase.scss'),
  'utf8'
)

const first = '1'.repeat(40)
const second = '2'.repeat(40)
const third = '3'.repeat(40)
const fourth = '4'.repeat(40)
const fifth = '5'.repeat(40)
const sixth = '6'.repeat(40)

const labels: IInteractiveRebaseEditorLabels = {
  title: 'Review interactive rebase',
  description: 'Review the exact commit plan before continuing.',
  planHeading: 'Commit plan',
  summaryHeading: 'Plan summary',
  confirmationHeading: 'Required confirmations',
  actionLabels: {
    pick: 'Pick',
    reword: 'Reword',
    edit: 'Edit',
    squash: 'Squash',
    fixup: 'Fixup',
    drop: 'Drop',
  },
  commitIdLabel: commit => `Full commit ID ${commit.commitId}`,
  actionSelectorLabel: commit => `Action for ${commit.subject}`,
  moveUpLabel: commit => `Move ${commit.subject} up`,
  moveDownLabel: commit => `Move ${commit.subject} down`,
  pauseRequiredLabel: 'Pauses replay',
  totalSummary: count => `Commits: ${count}`,
  pauseSummary: count => `Pauses: ${count}`,
  dropSummary: count => `Dropped: ${count}`,
  foldSummary: count => `Folded: ${count}`,
  reorderedSummary: reordered => `Reordered: ${reordered ? 'yes' : 'no'}`,
  rewriteWarningTitle: 'History will be rewritten',
  rewriteWarningBody: 'The resulting commit identities will be different.',
  pushedHistoryWarningTitle: 'Pushed history is included',
  pushedHistoryWarningBody:
    'Other copies of this branch may require manual reconciliation.',
  reviewConfirmationLabel: 'I reviewed every commit and action.',
  pushedHistoryConfirmationLabel:
    'I understand that this includes pushed history.',
  reviewConfirmationRequiredReason:
    'Review confirmation is required before execution.',
  pushedHistoryConfirmationRequiredReason:
    'Pushed-history confirmation is also required before execution.',
  executeLabel: 'Execute reviewed plan',
  cancelLabel: 'Cancel',
}

function commitContext(
  commitId: string,
  subject: string
): IInteractiveRebaseCommitLabelContext {
  return { commitId, shortCommitId: commitId.slice(0, 7), subject }
}

function basicPlan(): IInteractiveRebasePlan {
  return createInteractiveRebasePlan([
    { commitId: first, action: 'pick', subject: 'First commit' },
    { commitId: second, action: 'reword', subject: 'Second commit' },
    { commitId: third, action: 'edit', subject: 'Third commit' },
    {
      commitId: fourth,
      action: 'pick',
      subject: 'Treat <script> as plain text',
    },
  ])
}

function editorProps(
  overrides: Partial<IInteractiveRebaseEditorProps> = {}
): IInteractiveRebaseEditorProps {
  return {
    plan: basicPlan(),
    labels,
    hasPushedReviewedCommits: false,
    onActionChange: () => undefined,
    onReorder: () => undefined,
    onExecute: () => undefined,
    onCancel: () => undefined,
    ...overrides,
  }
}

function describedText(control: HTMLElement): string {
  const descriptionId = control.getAttribute('aria-describedby')
  assert.ok(descriptionId)
  const description = document.getElementById(descriptionId)
  assert.notEqual(description, null)
  return description?.textContent ?? ''
}

describe('interactive rebase editor plan rows', () => {
  it('renders honest native controls, stable full identities, and safe text', () => {
    const plan = basicPlan()
    render(<InteractiveRebaseEditor {...editorProps({ plan })} />)

    const list = screen.getByRole('list', { name: labels.planHeading })
    const rows = within(list).getAllByRole('listitem')
    assert.equal(rows.length, plan.entries.length)
    assert.equal(screen.queryByRole('listbox'), null)

    for (const [index, entry] of plan.entries.entries()) {
      const row = rows[index]
      const context = commitContext(entry.commitId, entry.subject)
      assert.equal(row.dataset.commitId, entry.commitId)
      assert.equal(
        within(row)
          .getByText(context.shortCommitId)
          .getAttribute('aria-hidden'),
        'true'
      )
      assert.ok(within(row).getByText(labels.commitIdLabel(context)))

      const select = within(row).getByRole('combobox', {
        name: labels.actionSelectorLabel(context),
      }) as HTMLSelectElement
      assert.equal(select.tagName, 'SELECT')
      assert.equal(select.value, entry.action)
      assert.deepEqual(
        within(select)
          .getAllByRole('option')
          .map(option => (option as HTMLOptionElement).value),
        [...InteractiveRebaseActions]
      )

      for (const name of [
        labels.moveUpLabel(context),
        labels.moveDownLabel(context),
      ]) {
        assert.equal(
          within(row).getByRole('button', { name }).tagName,
          'BUTTON'
        )
      }
    }

    assert.ok(screen.getByText('Treat <script> as plain text'))
    assert.equal(
      document.querySelector('.interactive-rebase-editor script'),
      null
    )
    assert.equal(document.querySelector('[draggable="true"]'), null)
  })

  it('emits only exact full-ID and fixed-action callback payloads', () => {
    const plan = basicPlan()
    const calls: Array<ReadonlyArray<string>> = []
    render(
      <InteractiveRebaseEditor
        {...editorProps({
          plan,
          onActionChange: (commitId, action) => calls.push([commitId, action]),
        })}
      />
    )

    const context = commitContext(second, 'Second commit')
    const select = screen.getByRole('combobox', {
      name: labels.actionSelectorLabel(context),
    })
    const execute = screen.getByRole('button', { name: labels.executeLabel })
    fireEvent.click(
      screen.getByRole('checkbox', { name: labels.reviewConfirmationLabel })
    )
    assert.equal(execute.getAttribute('aria-disabled'), null)
    fireEvent.change(select, { target: { value: 'drop' } })

    assert.deepEqual(calls, [[second, 'drop']])
    assert.equal(execute.getAttribute('aria-disabled'), 'true')
    assert.deepEqual(
      basicPlan().entries.map(entry => entry.action),
      ['pick', 'reword', 'edit', 'pick']
    )
  })

  it('emits before-ID reorder semantics and guards focusable boundaries', () => {
    const plan = basicPlan()
    const calls: Array<readonly [string, string | null]> = []
    render(
      <InteractiveRebaseEditor
        {...editorProps({
          plan,
          onReorder: (commitId, beforeCommitId) =>
            calls.push([commitId, beforeCommitId]),
        })}
      />
    )

    const firstContext = commitContext(first, 'First commit')
    const fourthContext = commitContext(fourth, 'Treat <script> as plain text')
    const firstUp = screen.getByRole('button', {
      name: labels.moveUpLabel(firstContext),
    })
    const lastDown = screen.getByRole('button', {
      name: labels.moveDownLabel(fourthContext),
    })
    for (const boundary of [firstUp, lastDown]) {
      assert.equal(boundary.getAttribute('aria-disabled'), 'true')
      assert.equal(boundary.hasAttribute('disabled'), false)
      boundary.focus()
      assert.equal(document.activeElement, boundary)
      fireEvent.click(boundary)
    }
    assert.deepEqual(calls, [])

    fireEvent.click(
      screen.getByRole('button', {
        name: labels.moveUpLabel(commitContext(third, 'Third commit')),
      })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: labels.moveDownLabel(commitContext(second, 'Second commit')),
      })
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: labels.moveDownLabel(commitContext(third, 'Third commit')),
      })
    )

    assert.deepEqual(calls, [
      [third, second],
      [second, fourth],
      [third, null],
    ])
  })
})

describe('interactive rebase editor summaries and confirmation gates', () => {
  it('renders exact model summary facts, including pauses and reorder state', () => {
    const original = createInteractiveRebasePlan([
      { commitId: first, action: 'pick', subject: 'First' },
      { commitId: second, action: 'reword', subject: 'Second' },
      { commitId: third, action: 'edit', subject: 'Third' },
      { commitId: fourth, action: 'squash', subject: 'Fourth' },
      { commitId: fifth, action: 'fixup', subject: 'Fifth' },
      { commitId: sixth, action: 'drop', subject: 'Sixth' },
    ])
    const plan = reorderInteractiveRebaseCommit(original, sixth, second)
    render(<InteractiveRebaseEditor {...editorProps({ plan })} />)

    const summary = screen.getByRole('region', {
      name: labels.summaryHeading,
    })
    for (const fact of [
      labels.totalSummary(6),
      labels.pauseSummary(2),
      labels.dropSummary(1),
      labels.foldSummary(2),
      labels.reorderedSummary(true),
    ]) {
      assert.ok(within(summary).getByText(fact))
    }
    assert.equal(screen.getAllByText(labels.pauseRequiredLabel).length, 2)
  })

  it('keeps unpushed execution focusable but inert until review confirmation', () => {
    const plan = basicPlan()
    const executed: IInteractiveRebasePlan[] = []
    let cancelCalls = 0
    render(
      <InteractiveRebaseEditor
        {...editorProps({
          plan,
          onExecute: executedPlan => executed.push(executedPlan),
          onCancel: () => cancelCalls++,
        })}
      />
    )

    const execute = screen.getByRole('button', { name: labels.executeLabel })
    assert.equal(execute.hasAttribute('disabled'), false)
    assert.equal(execute.getAttribute('aria-disabled'), 'true')
    assert.equal(
      describedText(execute),
      labels.reviewConfirmationRequiredReason
    )
    execute.focus()
    assert.equal(document.activeElement, execute)
    fireEvent.click(execute)
    assert.deepEqual(executed, [])

    fireEvent.click(screen.getByRole('button', { name: labels.cancelLabel }))
    assert.equal(cancelCalls, 1)

    fireEvent.click(
      screen.getByRole('checkbox', { name: labels.reviewConfirmationLabel })
    )
    assert.equal(execute.getAttribute('aria-disabled'), null)
    assert.equal(execute.getAttribute('aria-describedby'), null)
    fireEvent.click(execute)
    assert.deepEqual(executed, [plan])
    assert.equal(
      screen.queryByRole('checkbox', {
        name: labels.pushedHistoryConfirmationLabel,
      }),
      null
    )
    assert.equal(screen.queryByText(labels.pushedHistoryWarningTitle), null)
  })

  it('requires both independent confirmations for pushed history', () => {
    const plan = basicPlan()
    const executed: IInteractiveRebasePlan[] = []
    render(
      <InteractiveRebaseEditor
        {...editorProps({
          plan,
          hasPushedReviewedCommits: true,
          onExecute: executedPlan => executed.push(executedPlan),
        })}
      />
    )

    const alert = screen.getByRole('alert')
    assert.ok(within(alert).getByText(labels.pushedHistoryWarningTitle))
    assert.ok(within(alert).getByText(labels.pushedHistoryWarningBody))
    const execute = screen.getByRole('button', { name: labels.executeLabel })
    const review = screen.getByRole('checkbox', {
      name: labels.reviewConfirmationLabel,
    })
    const pushed = screen.getByRole('checkbox', {
      name: labels.pushedHistoryConfirmationLabel,
    })

    fireEvent.click(pushed)
    assert.equal(
      describedText(execute),
      labels.reviewConfirmationRequiredReason
    )
    fireEvent.click(execute)
    assert.deepEqual(executed, [])

    fireEvent.click(review)
    assert.equal(execute.getAttribute('aria-disabled'), null)
    fireEvent.click(execute)
    assert.deepEqual(executed, [plan])

    fireEvent.click(pushed)
    assert.equal(execute.getAttribute('aria-disabled'), 'true')
    assert.equal(
      describedText(execute),
      labels.pushedHistoryConfirmationRequiredReason
    )
    fireEvent.click(execute)
    assert.deepEqual(executed, [plan])
  })

  it('clears stale confirmations when the plan or pushed-history fact changes', () => {
    const original = basicPlan()
    const props = editorProps({ plan: original })
    const view = render(<InteractiveRebaseEditor {...props} />)
    const review = screen.getByRole('checkbox', {
      name: labels.reviewConfirmationLabel,
    }) as HTMLInputElement
    const execute = screen.getByRole('button', { name: labels.executeLabel })

    fireEvent.click(review)
    assert.equal(review.checked, true)
    assert.equal(execute.getAttribute('aria-disabled'), null)

    const changed = updateInteractiveRebaseAction(original, second, 'pick')
    view.rerender(<InteractiveRebaseEditor {...props} plan={changed} />)
    assert.equal(review.checked, false)
    assert.equal(execute.getAttribute('aria-disabled'), 'true')

    fireEvent.click(review)
    view.rerender(
      <InteractiveRebaseEditor
        {...props}
        hasPushedReviewedCommits={true}
        plan={changed}
      />
    )
    assert.equal(review.checked, false)
    assert.equal(
      (
        screen.getByRole('checkbox', {
          name: labels.pushedHistoryConfirmationLabel,
        }) as HTMLInputElement
      ).checked,
      false
    )
    assert.equal(execute.getAttribute('aria-disabled'), 'true')
  })
})

describe('interactive rebase editor identity and capability boundaries', () => {
  it('keeps every ID and relationship unique across simultaneous instances', () => {
    render(
      <>
        <InteractiveRebaseEditor {...editorProps()} />
        <InteractiveRebaseEditor {...editorProps()} />
      </>
    )

    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('.interactive-rebase-editor [id]')
    ).map(element => element.id)
    assert.equal(new Set(ids).size, ids.length)

    for (const label of document.querySelectorAll<HTMLLabelElement>(
      '.interactive-rebase-editor label[for]'
    )) {
      assert.notEqual(document.getElementById(label.htmlFor), null)
    }
    for (const control of document.querySelectorAll<HTMLElement>(
      '.interactive-rebase-editor [aria-labelledby], .interactive-rebase-editor [aria-describedby]'
    )) {
      for (const id of `${control.getAttribute('aria-labelledby') ?? ''} ${
        control.getAttribute('aria-describedby') ?? ''
      }`
        .trim()
        .split(/\s+/)) {
        if (id.length > 0) {
          assert.notEqual(document.getElementById(id), null)
        }
      }
    }
  })

  it('imports only presentation-safe dependencies and no execution path', () => {
    const imports = Array.from(
      componentSource.matchAll(/from ['"]([^'"]+)['"]/g),
      match => match[1]
    )
    assert.deepEqual(imports, [
      'react',
      '../../lib/interactive-rebase/interactive-rebase-plan',
      '../lib/id-pool',
    ])
    for (const unsafe of [
      /\brequire\s*\(/,
      /\b(?:process|Deno|Bun)\s*\./,
      /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/,
      /\b(?:child_process|node:fs|electron|dispatcher|ipcRenderer)\b/,
      /dangerouslySetInnerHTML/,
    ]) {
      assert.doesNotMatch(componentSource, unsafe)
    }
  })
})

describe('interactive rebase editor styles', () => {
  it('keeps long localized rows and subjects shrink-safe at narrow widths', () => {
    assert.match(styles, /^\.interactive-rebase-editor\s*\{/m)
    assert.match(
      styles,
      /&__row\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:[^;]*minmax\(0,\s*1fr\)/
    )
    assert.match(
      styles,
      /&__subject\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/
    )
    assert.match(
      styles,
      /&__rows\s*\{[\s\S]*?max-height:[^;]+;[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/
    )
    assert.match(styles, /white-space:\s*normal;/)
    assert.match(styles, /@media\s*\(max-width:\s*\d+px\)/)
    assert.doesNotMatch(styles, /text-overflow:\s*ellipsis/)
  })

  it('provides visible focus, adequate targets, and reduced-motion behavior', () => {
    assert.match(styles, /&:focus-visible\s*\{/)
    assert.match(
      styles,
      /&__action-select,[\s\S]*?&__move-button,[\s\S]*?&__footer-button\s*\{[\s\S]*?min-height:\s*44px;/
    )
    assert.match(
      styles,
      /&__move-button,[\s\S]*?&__footer-button\s*\{[\s\S]*?min-width:\s*44px;/
    )
    assert.match(styles, /&__confirmation\s*\{[\s\S]*?min-height:\s*44px;/)
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important;[\s\S]*?transition:\s*none\s*!important;/
    )
  })
})
