import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  buildLaunchpadSections,
  createLaunchpadProviderItemKey,
  ILaunchpadAttentionSignals,
  ILaunchpadIssueItem,
  ILaunchpadItemIdentity,
  ILaunchpadPullRequestItem,
  ILaunchpadSectionBuildResult,
  LaunchpadBucket,
  LaunchpadItemKind,
  LaunchpadNotApplicable,
  LaunchpadProviderItemKey,
  LaunchpadUnavailable,
  launchpadValue,
} from '../../../src/lib/launchpad/launchpad-model'
import {
  LaunchpadSectionOrder,
  LaunchpadSnoozeOptions,
  LaunchpadView,
} from '../../../src/ui/launchpad/launchpad-view'
import { fireEvent, render, screen, within } from '../../helpers/ui/render'

const styles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_launchpad.scss'),
  'utf8'
)

const now = Date.parse('2026-08-02T12:00:00.000Z')
const defaultIdentity = {
  endpointId: 'https://forge.example/api',
  accountId: 'account-1',
  repositoryId: 'repository-1',
} as const

function identity<K extends LaunchpadItemKind>(
  kind: K,
  itemId: string
): ILaunchpadItemIdentity<K> {
  return { ...defaultIdentity, kind, itemId }
}

function attention(
  overrides: Partial<ILaunchpadAttentionSignals> = {}
): ILaunchpadAttentionSignals {
  return {
    readyToMerge: launchpadValue(false),
    assignment: launchpadValue('assigned'),
    mergeConflict: launchpadValue('conflict-free'),
    ...overrides,
  }
}

function issueAttention(
  overrides: Partial<ILaunchpadAttentionSignals> = {}
): ILaunchpadAttentionSignals {
  return {
    readyToMerge: LaunchpadNotApplicable,
    assignment: launchpadValue('assigned'),
    mergeConflict: LaunchpadNotApplicable,
    ...overrides,
  }
}

interface IIssueOptions {
  readonly referenceNumber?: number
  readonly updatedAt?: string
  readonly attention?: ILaunchpadAttentionSignals
}

function issue(
  itemId: string,
  title: string,
  options: IIssueOptions = {}
): ILaunchpadIssueItem {
  return {
    kind: 'issue',
    identity: identity('issue', itemId),
    title,
    updatedAt: launchpadValue(options.updatedAt ?? '2026-08-02T11:55:00.000Z'),
    attention: options.attention ?? issueAttention(),
    referenceNumber: launchpadValue(options.referenceNumber ?? 7),
    branchName: LaunchpadNotApplicable,
    webUrl: launchpadValue(`https://forge.example/issues/${itemId}`),
    diffStat: LaunchpadNotApplicable,
    ciStatus: LaunchpadNotApplicable,
  }
}

interface IPullRequestOptions {
  readonly referenceNumber?: number
  readonly updatedAt?: string
  readonly attention?: ILaunchpadAttentionSignals
  readonly additions?: number
  readonly deletions?: number
  readonly ciStatus?: 'queued' | 'in-progress' | 'succeeded' | 'failed'
}

function pullRequest(
  itemId: string,
  title: string,
  options: IPullRequestOptions = {}
): ILaunchpadPullRequestItem {
  return {
    kind: 'pull-request',
    identity: identity('pull-request', itemId),
    title,
    updatedAt: launchpadValue(options.updatedAt ?? '2026-08-02T11:00:00.000Z'),
    attention: options.attention ?? attention(),
    referenceNumber: launchpadValue(options.referenceNumber ?? 10),
    branchName: launchpadValue(`feature/${itemId}`),
    webUrl: launchpadValue(`https://forge.example/pulls/${itemId}`),
    diffStat: launchpadValue({
      additions: options.additions ?? 3,
      deletions: options.deletions ?? 1,
    }),
    ciStatus: launchpadValue(options.ciStatus ?? 'succeeded'),
  }
}

interface IPresentationFixture {
  readonly result: ILaunchpadSectionBuildResult
  readonly pinned: ILaunchpadIssueItem
  readonly ready: ILaunchpadPullRequestItem
  readonly unassigned: ILaunchpadIssueItem
  readonly failing: ILaunchpadPullRequestItem
  readonly conflicted: ILaunchpadPullRequestItem
}

function presentationFixture(): IPresentationFixture {
  const pinned = issue('pinned', 'Pinned documentation pass', {
    referenceNumber: 7,
  })
  const ready = pullRequest(
    'ready',
    'Keep an extremely long Launchpad title readable without clipping',
    {
      referenceNumber: 128,
      updatedAt: '2026-08-02T10:00:00.000Z',
      additions: 14,
      deletions: 5,
      ciStatus: 'succeeded',
      attention: attention({ readyToMerge: launchpadValue(true) }),
    }
  )
  const unassigned = issue('unassigned', 'Unassigned provider issue', {
    referenceNumber: 34,
    attention: issueAttention({ assignment: launchpadValue('unassigned') }),
  })
  const failing = pullRequest('failing', 'Repair the failing build', {
    referenceNumber: 55,
    ciStatus: 'failed',
  })
  const conflicted = pullRequest('conflicted', 'Resolve both changed files', {
    referenceNumber: 89,
    attention: attention({
      mergeConflict: launchpadValue('conflicted'),
    }),
  })
  const omitted = issue('omitted', 'Ordinary follow-up')
  const snoozed = issue('snoozed', 'Snoozed unassigned work', {
    attention: issueAttention({ assignment: launchpadValue('unassigned') }),
  })

  return {
    result: buildLaunchpadSections(
      [pinned, ready, unassigned, failing, conflicted, omitted, snoozed],
      new Set([createLaunchpadProviderItemKey(pinned.identity)]),
      new Set([createLaunchpadProviderItemKey(snoozed.identity)])
    ),
    pinned,
    ready,
    unassigned,
    failing,
    conflicted,
  }
}

function sectionToggle(label: LaunchpadBucket): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp(`^${label}, \\d+ items?`),
  }) as HTMLButtonElement
}

function rowFor(title: string): HTMLLIElement {
  const row = screen.getByText(title).closest('li')
  assert.ok(row, `Expected ${title} to be rendered in a list item.`)
  return row
}

const availableActions = () => ({ availability: 'available' as const })

describe('Launchpad view', () => {
  it('normalizes the exact five counted sections and truthfully reports exclusions', () => {
    const fixture = presentationFixture()
    const reversed: ILaunchpadSectionBuildResult = {
      ...fixture.result,
      sections: [...fixture.result.sections].reverse(),
    }

    render(
      <LaunchpadView
        result={reversed}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )

    const headings = screen.getAllByRole('heading', { level: 2 })
    assert.deepEqual(
      headings.map(
        heading =>
          heading.querySelector('.launchpad-view__section-title')?.textContent
      ),
      LaunchpadSectionOrder
    )
    const launchpad = document.querySelector<HTMLElement>('.launchpad-view')
    assert.ok(launchpad)
    assert.equal(
      launchpad.querySelectorAll(':scope > .launchpad-view__section').length,
      5
    )
    for (const section of LaunchpadSectionOrder) {
      assert.ok(
        within(launchpad).getByRole('region', {
          name: `${section}, 1 item`,
        })
      )
    }
    assert.equal(screen.getAllByRole('region').length, 5)
    for (const section of LaunchpadSectionOrder) {
      const toggle = sectionToggle(section)
      assert.equal(toggle.getAttribute('aria-expanded'), 'true')
      assert.notEqual(toggle.getAttribute('tabindex'), '-1')
      const controlled = toggle.getAttribute('aria-controls')
      assert.ok(controlled)
      assert.notEqual(document.getElementById(controlled), null)
    }

    const note = screen.getByRole('status')
    assert.match(note.textContent ?? '', /1 item snoozed/)
    assert.match(note.textContent ?? '', /1 item[^.]*do(?:es)? not match/i)
  })

  it('retains the heading and count while collapsed, including empty sections', () => {
    const empty = buildLaunchpadSections([], new Set())
    const view = render(
      <LaunchpadView
        result={empty}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )

    for (const section of LaunchpadSectionOrder) {
      assert.match(sectionToggle(section).textContent ?? '', /0/)
      assert.ok(screen.getByText(`No items in ${section}.`))
    }

    const fixture = presentationFixture()
    view.rerender(
      <LaunchpadView
        result={fixture.result}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )
    const readyToggle = sectionToggle('Ready to merge')
    fireEvent.click(readyToggle)

    assert.equal(readyToggle.getAttribute('aria-expanded'), 'false')
    assert.match(readyToggle.textContent ?? '', /1/)
    const controlledRows = document.getElementById(
      readyToggle.getAttribute('aria-controls') ?? ''
    )
    assert.ok(controlledRows)
    assert.equal(controlledRows.hidden, true)
    assert.equal(
      screen.queryByRole('heading', { name: new RegExp(fixture.ready.title) }),
      null,
      'collapsing removes the rows without erasing the count'
    )
    assert.equal(
      controlledRows.textContent?.includes(fixture.ready.title),
      true,
      'the disclosure keeps a real aria-controls target while folded'
    )
  })

  it('renders exact known age, reference, status, and diff facts', () => {
    const fixture = presentationFixture()
    render(
      <LaunchpadView
        result={fixture.result}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )

    const ready = within(rowFor(fixture.ready.title))
    assert.ok(ready.getByText('#128'))
    assert.ok(ready.getByText('2 hours ago'))
    assert.ok(ready.getByText('CI succeeded'))
    assert.ok(ready.getByText('+14 / −5'))
    assert.ok(ready.getByText('Assigned'))
    assert.ok(ready.getByText('Conflict-free'))

    for (const icon of document.querySelectorAll(
      '.launchpad-view__status-icon'
    )) {
      assert.equal(icon.getAttribute('aria-hidden'), 'true')
    }
  })

  it('distinguishes unavailable and not-applicable facts from zero or false', () => {
    const unavailable: ILaunchpadPullRequestItem = {
      ...pullRequest('unavailable', 'Provider truth missing'),
      updatedAt: LaunchpadUnavailable,
      attention: {
        readyToMerge: LaunchpadUnavailable,
        assignment: LaunchpadUnavailable,
        mergeConflict: LaunchpadUnavailable,
      },
      referenceNumber: LaunchpadUnavailable,
      branchName: LaunchpadUnavailable,
      webUrl: LaunchpadUnavailable,
      diffStat: LaunchpadUnavailable,
      ciStatus: LaunchpadUnavailable,
    }
    const notApplicable = issue('not-applicable', 'Issue-only facts', {
      referenceNumber: 92,
      attention: issueAttention({ assignment: launchpadValue('unassigned') }),
    })
    const result = buildLaunchpadSections(
      [unavailable, notApplicable],
      new Set([createLaunchpadProviderItemKey(unavailable.identity)])
    )

    render(
      <LaunchpadView
        result={result}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )

    const unavailableRowElement = rowFor(unavailable.title)
    const unavailableRow = within(unavailableRowElement)
    for (const text of [
      'Age unavailable',
      'Reference number unavailable',
      'CI status unavailable',
      'Diff unavailable',
      'Assignment unavailable',
      'Merge conflict status unavailable',
      'Merge readiness unavailable',
    ]) {
      assert.ok(unavailableRow.getByText(text))
    }
    assert.doesNotMatch(unavailableRowElement.textContent ?? '', /#0|\+0|[−-]0/)

    const notApplicableRow = within(rowFor(notApplicable.title))
    assert.ok(notApplicableRow.getByText('#92'))
    assert.ok(notApplicableRow.getByText('CI status N/A'))
    assert.ok(notApplicableRow.getByText('Diff not applicable'))
    assert.ok(
      notApplicableRow.getByText('Merge conflict status not applicable')
    )
    assert.ok(notApplicableRow.getByText('Merge readiness not applicable'))
  })

  it('passes the canonical identity and exact bounded action choice to callbacks', () => {
    const fixture = presentationFixture()
    const pinCalls = new Array<readonly [LaunchpadProviderItemKey, boolean]>()
    const snoozeCalls = new Array<readonly [LaunchpadProviderItemKey, number]>()
    render(
      <LaunchpadView
        result={fixture.result}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={(key, shouldPin) => pinCalls.push([key, shouldPin])}
        onSnooze={(key, durationMs) => snoozeCalls.push([key, durationMs])}
      />
    )

    const pin = screen.getByRole('button', {
      name: `Pin ${fixture.ready.title}`,
    })
    const unpin = screen.getByRole('button', {
      name: `Unpin ${fixture.pinned.title}`,
    })
    assert.equal(pin.tagName, 'BUTTON')
    assert.equal(unpin.tagName, 'BUTTON')
    assert.notEqual(pin.getAttribute('tabindex'), '-1')
    fireEvent.click(pin)
    fireEvent.click(unpin)

    const fourHours = LaunchpadSnoozeOptions.find(
      option => option.durationMs === 4 * 60 * 60 * 1000
    )
    assert.ok(fourHours)
    fireEvent.click(
      screen.getByRole('button', {
        name: `Snooze ${fixture.ready.title} for ${fourHours.label}`,
      })
    )

    assert.deepEqual(pinCalls, [
      [createLaunchpadProviderItemKey(fixture.ready.identity), true],
      [createLaunchpadProviderItemKey(fixture.pinned.identity), false],
    ])
    assert.deepEqual(snoozeCalls, [
      [
        createLaunchpadProviderItemKey(fixture.ready.identity),
        4 * 60 * 60 * 1000,
      ],
    ])
    assert.deepEqual(
      LaunchpadSnoozeOptions.map(option => option.durationMs),
      [
        60 * 60 * 1000,
        4 * 60 * 60 * 1000,
        24 * 60 * 60 * 1000,
        7 * 24 * 60 * 60 * 1000,
      ]
    )
  })

  it('names and explains unavailable actions without invoking callbacks', () => {
    const fixture = presentationFixture()
    let calls = 0
    const reason = 'This provider did not expose this action.'
    render(
      <LaunchpadView
        result={fixture.result}
        now={now}
        resolveActionAvailability={(_key, _action, item) =>
          item === fixture.ready
            ? { availability: 'unavailable', reason }
            : availableActions()
        }
        onPinChange={() => calls++}
        onSnooze={() => calls++}
      />
    )

    const disabledActions = [
      screen.getByRole('button', { name: `Pin ${fixture.ready.title}` }),
      ...LaunchpadSnoozeOptions.map(option =>
        screen.getByRole('button', {
          name: `Snooze ${fixture.ready.title} for ${option.label}`,
        })
      ),
    ]
    for (const action of disabledActions) {
      assert.equal(
        action.hasAttribute('disabled'),
        false,
        'unavailable actions stay discoverable in the keyboard order'
      )
      assert.equal(action.getAttribute('aria-disabled'), 'true')
      assert.notEqual(action.getAttribute('tabindex'), '-1')
      const descriptionId = action.getAttribute('aria-describedby')
      assert.ok(descriptionId)
      assert.match(
        document.getElementById(descriptionId)?.textContent ?? '',
        new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      )
      fireEvent.click(action)
    }
    assert.equal(calls, 0)
    assert.ok(
      within(rowFor(fixture.ready.title)).getAllByText(
        (_content, element) => element?.textContent?.includes(reason) === true
      ).length >= 1
    )
  })

  it('uses stable collision-safe row keys when section order changes', () => {
    const fixture = presentationFixture()
    const secondReady = pullRequest('ready-second', 'Second ready change', {
      referenceNumber: 128,
      attention: attention({ readyToMerge: launchpadValue(true) }),
    })
    const result = buildLaunchpadSections(
      [fixture.ready, secondReady],
      new Set()
    )
    const view = render(
      <LaunchpadView
        result={result}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )
    const firstRow = rowFor(fixture.ready.title)
    const secondRow = rowFor(secondReady.title)
    const reordered: ILaunchpadSectionBuildResult = {
      ...result,
      sections: result.sections.map(section =>
        section.bucket === 'Ready to merge'
          ? { ...section, items: [...section.items].reverse() }
          : section
      ),
    }

    view.rerender(
      <LaunchpadView
        result={reordered}
        now={now}
        resolveActionAvailability={availableActions}
        onPinChange={() => undefined}
        onSnooze={() => undefined}
      />
    )

    assert.equal(rowFor(fixture.ready.title), firstRow)
    assert.equal(rowFor(secondReady.title), secondRow)
  })

  it('keeps disclosure and description IDs unique across view instances', () => {
    const fixture = presentationFixture()
    render(
      <>
        <LaunchpadView
          result={fixture.result}
          now={now}
          resolveActionAvailability={availableActions}
          onPinChange={() => undefined}
          onSnooze={() => undefined}
        />
        <LaunchpadView
          result={fixture.result}
          now={now}
          resolveActionAvailability={availableActions}
          onPinChange={() => undefined}
          onSnooze={() => undefined}
        />
      </>
    )

    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('.launchpad-view [id]')
    ).map(element => element.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const control of document.querySelectorAll<HTMLElement>(
      '.launchpad-view [aria-controls], .launchpad-view [aria-describedby]'
    )) {
      for (const id of (
        control.getAttribute('aria-controls') ??
        control.getAttribute('aria-describedby') ??
        ''
      ).split(/\s+/)) {
        if (id.length > 0) {
          assert.notEqual(document.getElementById(id), null)
        }
      }
    }
  })
})

describe('Launchpad view styles', () => {
  it('keeps long rows shrink-safe and actions reachable at narrow widths', () => {
    assert.match(styles, /^\.launchpad-view\s*\{/m)
    assert.match(
      styles,
      /&__row\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:[^;]*minmax\(0,\s*1fr\)/
    )
    assert.match(
      styles,
      /&__title\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/
    )
    assert.match(styles, /&__actions\s*\{[\s\S]*?flex-wrap:\s*wrap;/)
    assert.match(styles, /@media\s*\(max-width:\s*\d+px\)/)
    assert.match(styles, /&:focus-visible\s*\{/)
    assert.match(styles, /&__section-toggle\s*\{[\s\S]*?min-height:\s*48px;/)
    assert.match(styles, /&__action\s*\{[\s\S]*?min-height:\s*40px;/)
    assert.match(styles, /&__snooze-label\s*\{/)
  })

  it('removes nonessential motion without removing the layout', () => {
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.launchpad-view\s*\{[\s\S]*?transition:\s*none\s*!important;/
    )
  })
})
