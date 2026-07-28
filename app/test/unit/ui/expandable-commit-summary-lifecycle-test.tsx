import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { Repository } from '../../../src/models/repository'
import { ExpandableCommitSummary } from '../../../src/ui/history/expandable-commit-summary'
import { render } from '../../helpers/ui/render'

class ControlledResizeObserver implements ResizeObserver {
  public static instances = new Array<ControlledResizeObserver>()
  public readonly targets = new Set<Element>()
  public disconnects = 0

  public constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  public observe(target: Element) {
    this.targets.add(target)
  }

  public unobserve(target: Element) {
    this.targets.delete(target)
  }

  public disconnect() {
    this.disconnects++
    this.targets.clear()
  }

  public trigger(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this
    )
  }
}

const originalWindowResizeObserver = (window as any).ResizeObserver
const originalGlobalResizeObserver = globalThis.ResizeObserver
const originalSetImmediate = globalThis.setImmediate
const originalClearImmediate = globalThis.clearImmediate

let nextImmediateId = 0
let scheduledImmediates = new Map<NodeJS.Immediate, () => void>()

function renderSummary(
  ref?: React.Ref<ExpandableCommitSummary>
): ReturnType<typeof render> {
  const identity = new CommitIdentity('Test', 'test@example.com', new Date(0))
  const commit = new Commit(
    '0123456789abcdef',
    '0123456',
    'Summary',
    'Body',
    identity,
    identity,
    [],
    [],
    []
  )

  return render(
    <ExpandableCommitSummary
      ref={ref}
      repository={new Repository('/work/summary-lifecycle', 1, null, false)}
      selectedCommits={[commit]}
      shasInDiff={[commit.sha]}
      changesetData={{ files: [], linesAdded: 0, linesDeleted: 0 }}
      emoji={new Map()}
      isExpanded={false}
      onExpandChanged={() => undefined}
      onHighlightShas={() => undefined}
      showUnreachableCommits={() => undefined}
      accounts={[]}
    />
  )
}

beforeEach(() => {
  ControlledResizeObserver.instances = []
  nextImmediateId = 0
  scheduledImmediates = new Map()
  ;(window as any).ResizeObserver = ControlledResizeObserver
  ;(globalThis as any).ResizeObserver = ControlledResizeObserver
  ;(globalThis as any).setImmediate = (callback: () => void) => {
    const id = ++nextImmediateId as unknown as NodeJS.Immediate
    scheduledImmediates.set(id, callback)
    return id
  }
  ;(globalThis as any).clearImmediate = (id: NodeJS.Immediate) => {
    scheduledImmediates.delete(id)
  }
})

afterEach(() => {
  ;(window as any).ResizeObserver = originalWindowResizeObserver
  ;(globalThis as any).ResizeObserver = originalGlobalResizeObserver
  ;(globalThis as any).setImmediate = originalSetImmediate
  ;(globalThis as any).clearImmediate = originalClearImmediate
})

describe('ExpandableCommitSummary resize lifecycle', () => {
  it('resets a completed immediate and cancels the next one on unmount', () => {
    let summary: ExpandableCommitSummary | null = null
    const view = renderSummary(instance => {
      summary = instance
    })
    const scrollView = view.container.querySelector(
      '.ecs-description-scroll-view'
    )
    assert.ok(scrollView)

    const observer = ControlledResizeObserver.instances.find(candidate =>
      candidate.targets.has(scrollView)
    )
    assert.ok(observer)

    observer.trigger(scrollView)
    assert.equal(scheduledImmediates.size, 1)

    const first = scheduledImmediates.entries().next().value as [
      NodeJS.Immediate,
      () => void
    ]
    scheduledImmediates.delete(first[0])
    first[1]()
    assert.equal(scheduledImmediates.size, 0)
    assert.equal(
      (
        summary as unknown as {
          updateOverflowTimeoutId: NodeJS.Immediate | null
        }
      ).updateOverflowTimeoutId,
      null
    )

    observer.trigger(scrollView)
    assert.equal(scheduledImmediates.size, 1)
    view.unmount()

    assert.equal(scheduledImmediates.size, 0)
    assert.ok(observer.disconnects >= 1)
  })

  it('disconnects a cleared description ref without setting teardown state', () => {
    let summary: ExpandableCommitSummary | null = null
    const view = renderSummary(instance => {
      summary = instance
    })
    assert.ok(summary)
    const mountedSummary = summary as unknown as ExpandableCommitSummary
    const scrollView = view.container.querySelector(
      '.ecs-description-scroll-view'
    )
    assert.ok(scrollView)
    const observer = ControlledResizeObserver.instances.find(candidate =>
      candidate.targets.has(scrollView)
    )
    assert.ok(observer)
    observer.trigger(scrollView)
    assert.equal(scheduledImmediates.size, 1)

    const originalSetState = mountedSummary.setState
    let setStateCalls = 0
    mountedSummary.setState = (() => {
      setStateCalls++
    }) as typeof mountedSummary.setState
    ;(
      mountedSummary as unknown as {
        onDescriptionScrollViewRef(ref: HTMLDivElement | null): void
      }
    ).onDescriptionScrollViewRef(null)

    assert.equal(setStateCalls, 0)
    assert.equal(scheduledImmediates.size, 0)
    mountedSummary.setState = originalSetState
    view.unmount()
  })
})
