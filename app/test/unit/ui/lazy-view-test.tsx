import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { LazyView } from '../../../src/ui/lib/lazy-view'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('LazyView', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    // React deliberately logs exceptions which an error boundary contains.
    console.error = () => {}
  })

  afterEach(() => {
    console.error = originalConsoleError
    localStorage.clear()
  })

  it('does not invoke its loader before mounting', () => {
    let calls = 0
    const component = new LazyView({
      name: 'Actions',
      load: async () => {
        calls++
        return 'loaded'
      },
      render: value => value,
    })

    component.render()
    assert.equal(calls, 0)
  })

  it('shows an accessible local fallback before resolution', () => {
    const request = deferred<string>()
    render(
      <LazyView
        name="Actions"
        load={() => request.promise}
        render={value => <div>{value}</div>}
      />
    )

    const status = screen.getByRole('status')
    assert.equal(status.getAttribute('aria-live'), 'polite')
    assert.equal(status.getAttribute('aria-busy'), 'true')
    assert.match(status.textContent ?? '', /Actions/)
    assert.equal(screen.queryByText('loaded'), null)
  })

  it('renders the resolved surface directly and does not move focus', async () => {
    const request = deferred<string>()
    const view = render(
      <>
        <button type="button">Keep focus</button>
        <LazyView
          name="Issues"
          load={() => request.promise}
          render={value => <p data-testid="resolved-view">{value}</p>}
        />
      </>
    )
    const focusOwner = screen.getByRole('button', { name: 'Keep focus' })
    focusOwner.focus()

    request.resolve('Issues loaded')
    await waitFor(() => assert.ok(screen.getByText('Issues loaded')))

    assert.equal(document.activeElement, focusOwner)
    assert.equal(screen.queryByRole('status'), null)
    assert.equal(
      view.container.querySelector('[data-testid="resolved-view"]')
        ?.parentElement,
      view.container
    )
  })

  it('shows the real failure and retries the exact loader', async () => {
    const retry = deferred<string>()
    let calls = 0
    const failures = new Array<Error>()
    const load = () => {
      calls++
      return calls === 1
        ? Promise.reject(new Error('chunk unavailable'))
        : retry.promise
    }

    render(
      <LazyView
        name="Repository tools"
        load={load}
        onError={(_name, error) => failures.push(error)}
        render={value => <div>{value}</div>}
      />
    )

    await waitFor(() =>
      assert.ok(
        screen.getByRole('alert').textContent?.includes('chunk unavailable')
      )
    )
    assert.equal(failures.length, 1)
    assert.equal(failures[0].message, 'chunk unavailable')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => assert.equal(calls, 2))
    assert.ok(screen.getByRole('status'))

    retry.resolve('Tools loaded')
    await waitFor(() => assert.ok(screen.getByText('Tools loaded')))
  })

  it('contains a resolved surface render failure and retries locally', async () => {
    const renderError = new Error('resolved surface could not render')
    const failures = new Array<Error>()
    let loadCalls = 0
    let mayRender = false
    const load = async () => {
      loadCalls++
      mayRender = loadCalls > 1
      return 'Repository tools loaded'
    }

    render(
      <LazyView
        name="Repository tools"
        load={load}
        onError={(_name, error) => failures.push(error)}
        render={value => {
          if (!mayRender) {
            throw renderError
          }
          return <div>{value}</div>
        }}
      />
    )

    await waitFor(() =>
      assert.match(
        screen.getByRole('alert').textContent ?? '',
        /resolved surface could not render/
      )
    )
    assert.equal(loadCalls, 1)
    assert.equal(failures.length, 1)
    assert.equal(failures[0], renderError)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => assert.ok(screen.getByText('Repository tools loaded')))
    assert.equal(loadCalls, 2)
    assert.equal(failures.length, 1)
    assert.equal(screen.queryByRole('alert'), null)
  })

  it('reuses a resolved stable loader synchronously on a later mount', async () => {
    let calls = 0
    const load = async () => {
      calls++
      return 'cached surface'
    }
    const renderSurface = (value: string) => <div>{value}</div>

    const first = render(
      <LazyView name="Actions" load={load} render={renderSurface} />
    )
    await waitFor(() => assert.ok(screen.getByText('cached surface')))
    first.unmount()

    const second = render(
      <LazyView name="Actions" load={load} render={renderSurface} />
    )
    assert.equal(second.container.querySelector('[role="status"]'), null)
    assert.ok(screen.getByText('cached surface'))
    assert.equal(calls, 1)
  })

  it('shares one in-flight request between mounts using the same loader', async () => {
    const request = deferred<string>()
    let calls = 0
    const load = () => {
      calls++
      return request.promise
    }

    render(
      <>
        <LazyView
          name="First tools"
          load={load}
          render={value => <div>{value}</div>}
        />
        <LazyView
          name="Second tools"
          load={load}
          render={value => <div>{value}</div>}
        />
      </>
    )
    await waitFor(() => assert.equal(calls, 1))

    request.resolve('shared result')
    await waitFor(() =>
      assert.equal(screen.getAllByText('shared result').length, 2)
    )
  })

  it('does not let an earlier navigation overwrite the latest view', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const firstLoader = () => first.promise
    const secondLoader = () => second.promise
    const view = render(
      <LazyView
        name="Actions"
        load={firstLoader}
        render={value => <div>{value}</div>}
      />
    )

    view.rerender(
      <LazyView
        name="Issues"
        load={secondLoader}
        render={value => <div>{value}</div>}
      />
    )
    second.resolve('new Issues view')
    await waitFor(() => assert.ok(screen.getByText('new Issues view')))

    first.resolve('stale Actions view')
    await Promise.resolve()
    assert.equal(screen.queryByText('stale Actions view'), null)
    assert.ok(screen.getByText('new Issues view'))
  })

  it('fences a completion and failure report after unmount', async () => {
    const request = deferred<string>()
    let reports = 0
    const view = render(
      <LazyView
        name="Triage"
        load={() => request.promise}
        onError={() => {
          reports++
        }}
        render={value => <div>{value}</div>}
      />
    )

    view.unmount()
    request.reject(new Error('too late'))
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(screen.queryByRole('alert'), null)
    assert.equal(reports, 0)
  })
})
