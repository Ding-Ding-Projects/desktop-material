import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  RepositoryBulkActions,
  RepositoryBulkOperation,
  RepositoryBulkOperations,
} from '../../../src/ui/repositories-list/repository-bulk-actions'
import { IBulkRepositoryProgress } from '../../../src/lib/automation/bulk-repository-runner'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../../src/lib/i18n-resources'
import { BulkActionSurfaceRegistry } from '../../../src/lib/collection-surface-registry'

interface IRecorded {
  readonly operations: Array<{
    readonly operation: RepositoryBulkOperation
    readonly groupName: string
  }>
  readonly selectAll: Array<boolean>
  readonly exits: Array<true>
  readonly cancels: Array<true>
  readonly confirms: Array<true>
  readonly dismissals: Array<true>
}

function recorded(): IRecorded {
  return {
    operations: [],
    selectAll: [],
    exits: [],
    cancels: [],
    confirms: [],
    dismissals: [],
  }
}

function renderBar(
  log: IRecorded,
  overrides: Partial<React.ComponentProps<typeof RepositoryBulkActions>> = {}
) {
  return render(
    <RepositoryBulkActions
      languageMode="english"
      selectedCount={2}
      visibleCount={3}
      allVisibleSelected={false}
      someVisibleSelected={true}
      busy={false}
      groupNames={['Work']}
      progress={null}
      progressTitleKey={null}
      cancelRequested={false}
      notice={null}
      removalCandidates={null}
      onSelectAllVisibleChanged={selected => log.selectAll.push(selected)}
      onOperation={(operation, groupName) =>
        log.operations.push({ operation, groupName })
      }
      onExit={() => log.exits.push(true)}
      onCancelRun={() => log.cancels.push(true)}
      onDismissRun={() => log.dismissals.push(true)}
      onConfirmRemoval={() => log.confirms.push(true)}
      onCancelRemoval={() => log.exits.push(true)}
      {...overrides}
    />
  )
}

function progressOf(
  items: IBulkRepositoryProgress['items'],
  completed: number,
  finished: boolean
): IBulkRepositoryProgress {
  return {
    completed,
    total: items.length,
    cancelled: false,
    finished,
    items,
  }
}

describe('RepositoryBulkActions', () => {
  it('renders an accessible selection bar with a live count', () => {
    const log = recorded()
    renderBar(log)

    assert.ok(screen.getByRole('group', { name: 'Bulk repository actions' }))

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all visible repositories',
    }) as HTMLInputElement
    assert.strictEqual(selectAll.checked, false)
    assert.strictEqual(selectAll.indeterminate, true)

    const count = screen.getByRole('status')
    assert.strictEqual(count.textContent, '2 selected')
  })

  it('marks the select-all checkbox checked when every visible row is selected', () => {
    const log = recorded()
    renderBar(log, { allVisibleSelected: true, someVisibleSelected: true })

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all visible repositories',
    }) as HTMLInputElement
    assert.strictEqual(selectAll.checked, true)
    assert.strictEqual(selectAll.indeterminate, false)
  })

  it('disables select-all when the filter is showing nothing', () => {
    const log = recorded()
    renderBar(log, { visibleCount: 0, someVisibleSelected: false })

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all visible repositories',
    }) as HTMLInputElement
    assert.strictEqual(selectAll.disabled, true)
  })

  it('reports select-all toggles', () => {
    const log = recorded()
    renderBar(log)

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all visible repositories' })
    )
    assert.deepStrictEqual(log.selectAll, [true])
  })

  it('offers every registered bulk operation and reports the chosen one', () => {
    const log = recorded()
    renderBar(log)

    fireEvent.click(screen.getByRole('button', { name: 'Fetch (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pull (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Favorite (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite (2)' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove from group (2)' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove from list (2)' })
    )

    assert.deepStrictEqual(
      log.operations.map(entry => entry.operation),
      [
        'fetch-selected',
        'pull-selected',
        'favorite',
        'unfavorite',
        'remove-group',
        'remove-from-list',
      ]
    )
  })

  it('disables every action while nothing is selected', () => {
    const log = recorded()
    renderBar(log, { selectedCount: 0 })

    for (const name of [
      'Fetch (0)',
      'Pull (0)',
      'Favorite (0)',
      'Unfavorite (0)',
      'Assign to group (0)',
      'Remove from group (0)',
      'Remove from list (0)',
    ]) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement
      assert.strictEqual(button.disabled, true, name)
    }
  })

  it('gates the group assignment on a group name and passes it through', () => {
    const log = recorded()
    renderBar(log)

    const assign = screen.getByRole('button', {
      name: 'Assign to group (2)',
    }) as HTMLButtonElement
    assert.strictEqual(assign.disabled, true)

    // The field offers the existing group names through a datalist, which maps
    // it to the combobox role rather than textbox.
    fireEvent.change(screen.getByRole('combobox', { name: 'Group name' }), {
      target: { value: ' Work ' },
    })
    assert.strictEqual(assign.disabled, false)

    fireEvent.click(assign)
    assert.deepStrictEqual(log.operations, [
      { operation: 'assign-group', groupName: 'Work' },
    ])
  })

  it('blocks instant actions while a batch is running', () => {
    const log = recorded()
    renderBar(log, { busy: true })

    const favorite = screen.getByRole('button', {
      name: 'Favorite (2)',
    }) as HTMLButtonElement
    assert.strictEqual(favorite.disabled, true)
  })

  it('keeps a running batch reachable by blocking the Clear exit', () => {
    const log = recorded()
    renderBar(log, { busy: true })

    const clear = screen.getByRole('button', {
      name: 'Clear the selection and leave multi-select',
    }) as HTMLButtonElement
    assert.strictEqual(clear.disabled, true)
  })

  it('exits multi-select from the Clear control', () => {
    const log = recorded()
    renderBar(log)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Clear the selection and leave multi-select',
      })
    )
    assert.deepStrictEqual(log.exits, [true])
  })

  it('shows an instant-operation result notice', () => {
    const log = recorded()
    renderBar(log, { notice: 'Favorited 2 repositories.' })

    assert.ok(
      screen
        .getAllByRole('status')
        .some(node => node.textContent === 'Favorited 2 repositories.')
    )
  })

  describe('removal confirmation', () => {
    const candidates = [
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' },
    ]

    it('lists exactly what will be removed and promises no on-disk deletion', () => {
      const log = recorded()
      renderBar(log, { removalCandidates: candidates })

      const dialog = screen.getByRole('alertdialog', {
        name: 'Remove 2 repositories from Desktop Material?',
      })
      assert.ok(dialog)
      assert.match(
        dialog.textContent ?? '',
        /removes them from this list only\. Nothing on disk is deleted/
      )

      const list = screen.getByRole('list', {
        name: 'Repositories that will be removed',
      })
      assert.deepStrictEqual(
        Array.from(list.querySelectorAll('li')).map(item => item.textContent),
        ['alpha', 'beta']
      )
    })

    it('uses the singular title for one repository', () => {
      const log = recorded()
      renderBar(log, { removalCandidates: [candidates[0]] })

      assert.ok(
        screen.getByRole('alertdialog', {
          name: 'Remove 1 repository from Desktop Material?',
        })
      )
    })

    it('only removes once the confirmation is activated', () => {
      const log = recorded()
      renderBar(log, { removalCandidates: candidates })

      assert.deepStrictEqual(log.confirms, [])
      fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }))
      assert.deepStrictEqual(log.confirms, [true])
    })

    it('never offers a delete-from-disk choice', () => {
      const log = recorded()
      renderBar(log, { removalCandidates: candidates })

      assert.strictEqual(
        screen.queryByRole('checkbox', { name: /disk|trash/i }),
        null
      )
      assert.doesNotMatch(
        screen.getByRole('alertdialog').textContent ?? '',
        /trash|delete .*disk/i
      )
    })
  })

  describe('determinate progress', () => {
    const items: IBulkRepositoryProgress['items'] = [
      { id: 1, name: 'alpha', status: 'done', detail: 'Pull completed.' },
      { id: 2, name: 'beta', status: 'running', detail: '' },
      { id: 3, name: 'gamma', status: 'queued', detail: '' },
    ]

    it('renders an N-of-M progressbar with per-repository rows', () => {
      const log = recorded()
      renderBar(log, {
        progress: progressOf(items, 1, false),
        progressTitleKey: 'repositoryBulk.pullingTitle',
      })

      const bar = screen.getByRole('progressbar', {
        name: 'Repositories processed',
      })
      assert.strictEqual(bar.getAttribute('aria-valuenow'), '1')
      assert.strictEqual(bar.getAttribute('aria-valuemax'), '3')
      assert.strictEqual(
        bar.getAttribute('aria-valuetext'),
        '1 of 3 repositories complete'
      )

      assert.ok(screen.getByText('Pulling selected repositories'))
      assert.ok(screen.getByText('Pull completed.'))
      assert.ok(screen.getByText('Working'))
      assert.ok(screen.getByText('Waiting'))
      assert.ok(screen.getByRole('region', { name: 'Per-repository results' }))
    })

    it('offers cancel while running and reports the request', () => {
      const log = recorded()
      renderBar(log, {
        progress: progressOf(items, 1, false),
        progressTitleKey: 'repositoryBulk.fetchingTitle',
      })

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Stop after the current repository finishes',
        })
      )
      assert.deepStrictEqual(log.cancels, [true])
    })

    it('announces that it will stop after the current repository', () => {
      const log = recorded()
      renderBar(log, {
        progress: progressOf(items, 1, false),
        progressTitleKey: 'repositoryBulk.fetchingTitle',
        cancelRequested: true,
      })

      assert.ok(
        screen.getByText('Stopping after the current repository finishes.')
      )
      const cancel = screen.getByRole('button', {
        name: 'Stop after the current repository finishes',
      }) as HTMLButtonElement
      assert.strictEqual(cancel.disabled, true)
    })

    it('summarizes done, failed, skipped, and not-started once finished', () => {
      const log = recorded()
      renderBar(log, {
        progress: progressOf(
          [
            { id: 1, name: 'alpha', status: 'done', detail: '' },
            { id: 2, name: 'beta', status: 'failed', detail: 'Auth failed.' },
            { id: 3, name: 'gamma', status: 'skipped', detail: 'No remote.' },
            { id: 4, name: 'delta', status: 'cancelled', detail: '' },
          ],
          3,
          true
        ),
        progressTitleKey: 'repositoryBulk.pullingTitle',
      })

      assert.ok(screen.getByText('1 done, 1 failed, 1 skipped, 1 not started.'))
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      assert.deepStrictEqual(log.dismissals, [true])
    })
  })
})

describe('repository bulk action contract', () => {
  it('registers exactly the operations the picker implements', () => {
    const surface = BulkActionSurfaceRegistry.find(
      entry => entry.id === 'repositories-list'
    )
    assert.ok(surface, 'The repository picker must be an audited bulk surface')
    assert.strictEqual(surface.status, 'implemented')
    assert.deepStrictEqual(surface.operations, [...RepositoryBulkOperations])
  })

  it('defines every repository bulk key in English and Cantonese', () => {
    const keysFor = (catalog: Readonly<Record<string, unknown>>) =>
      Object.keys(catalog)
        .filter(key => key.startsWith('repositoryBulk.'))
        .sort()

    const englishKeys = keysFor(englishTranslations)
    const cantoneseKeys = keysFor(cantoneseTranslations)

    assert.ok(englishKeys.length > 0, 'Expected repository bulk keys')
    assert.deepStrictEqual(cantoneseKeys, englishKeys)

    for (const key of englishKeys) {
      const typedKey = key as TranslationKey
      assert.ok(englishTranslations[typedKey].trim().length > 0, key)
      assert.ok((cantoneseTranslations[typedKey] ?? '').trim().length > 0, key)
    }
  })

  it('keeps the destructive removal copy plain at every funny level', () => {
    // Destructive copy carries no tone variants and no unresolved placeholder.
    for (const key of [
      'repositoryBulk.removeDescription',
      'repositoryBulk.removeConfirm',
    ] as ReadonlyArray<TranslationKey>) {
      assert.doesNotMatch(englishTranslations[key], /\{/)
      assert.doesNotMatch(cantoneseTranslations[key] ?? '', /\{/)
    }

    assert.match(
      englishTranslations['repositoryBulk.removeDescription'],
      /Nothing on disk is deleted/
    )
  })
})
