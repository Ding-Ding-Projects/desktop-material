import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { LazyView, lazyViewModule } from '../../../src/ui/lib/lazy-view'
import {
  englishTranslations,
  cantoneseTranslations,
} from '../../../src/lib/i18n-resources'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

interface IProbeProps {
  readonly label: string
}

function Probe(props: IProbeProps) {
  return <p data-testid="probe">{props.label}</p>
}

/** A promise whose settlement this test controls explicitly. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  localStorage.clear()
})

describe('LazyView', () => {
  it('announces progress politely without taking focus', async () => {
    const gate = deferred<React.ComponentType<IProbeProps>>()
    const view = lazyViewModule<IProbeProps>('probe.polite', () => gate.promise)

    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    anchor.focus()

    render(<LazyView view={view} viewProps={{ label: 'ready' }} name="Probe" />)

    const status = screen.getByRole('status')
    assert.strictEqual(status.getAttribute('aria-live'), 'polite')
    assert.strictEqual(status.getAttribute('aria-busy'), 'true')
    assert.match(
      status.textContent ?? '',
      /Probe/,
      'the progress copy must name the surface that is loading'
    )
    assert.strictEqual(
      document.activeElement,
      anchor,
      'a background surface load must never move focus'
    )

    gate.resolve(Probe)
    await waitFor(() =>
      assert.strictEqual(screen.getByTestId('probe').textContent, 'ready')
    )
    assert.strictEqual(screen.queryByRole('status'), null)

    anchor.remove()
  })

  it('renders the loaded component with its props and no wrapper element', async () => {
    const view = lazyViewModule<IProbeProps>('probe.wrapper', () =>
      Promise.resolve(Probe)
    )

    const { container } = render(
      <LazyView view={view} viewProps={{ label: 'no wrapper' }} name="Probe" />
    )

    await waitFor(() => assert.ok(screen.queryByTestId('probe') !== null))
    assert.strictEqual(
      container.firstElementChild?.tagName,
      'P',
      'the loaded surface must be rendered directly so the host layout is unchanged'
    )
  })

  it('surfaces the real error, offers a retry, and reports the failure once', async () => {
    const failure = new Error('module evaluation exploded')
    let attempts = 0
    const view = lazyViewModule<IProbeProps>('probe.failure', () => {
      attempts += 1
      return attempts === 1 ? Promise.reject(failure) : Promise.resolve(Probe)
    })

    const reported: Array<[string, Error]> = []
    const onLoadFailed = (name: string, error: Error) => {
      reported.push([name, error])
    }

    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    anchor.focus()

    render(
      <LazyView
        view={view}
        viewProps={{ label: 'recovered' }}
        name="Probe"
        onLoadFailed={onLoadFailed}
      />
    )

    const alert = await screen.findByRole('alert')
    assert.match(alert.textContent ?? '', /Probe could not be loaded/)
    assert.match(
      alert.textContent ?? '',
      /module evaluation exploded/,
      'the underlying error must be shown verbatim, not paraphrased away'
    )
    assert.strictEqual(
      document.activeElement,
      anchor,
      'a failed surface must not steal focus either'
    )

    assert.strictEqual(reported.length, 1)
    assert.strictEqual(reported[0][0], 'Probe')
    assert.strictEqual(reported[0][1], failure)

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))

    await waitFor(() =>
      assert.strictEqual(screen.getByTestId('probe').textContent, 'recovered')
    )
    assert.strictEqual(
      reported.length,
      1,
      'a successful retry must not report another failure'
    )
  })

  it('never leaves a permanent spinner behind a rejected load', async () => {
    const view = lazyViewModule<IProbeProps>('probe.no-spinner', () =>
      Promise.reject(new Error('nope'))
    )

    render(<LazyView view={view} viewProps={{ label: 'x' }} name="Probe" />)

    await screen.findByRole('alert')
    assert.strictEqual(screen.queryByRole('status'), null)
  })

  it('renders an already-evaluated module with no progress state at all', async () => {
    const view = lazyViewModule<IProbeProps>('probe.cached', () =>
      Promise.resolve(Probe)
    )

    const first = render(
      <LazyView view={view} viewProps={{ label: 'first' }} name="Probe" />
    )
    await waitFor(() => assert.ok(screen.queryByTestId('probe') !== null))
    first.unmount()

    const second = render(
      <LazyView view={view} viewProps={{ label: 'second' }} name="Probe" />
    )
    assert.strictEqual(
      second.container.querySelector('[role="status"]'),
      null,
      'a module evaluated earlier in the session must render synchronously'
    )
    assert.strictEqual(screen.getByTestId('probe').textContent, 'second')
  })

  it('never renders a previous module with the new surface props', async () => {
    const firstView = lazyViewModule<IProbeProps>('probe.swap-a', () =>
      Promise.resolve(Probe)
    )
    const secondGate = deferred<React.ComponentType<IProbeProps>>()
    const secondView = lazyViewModule<IProbeProps>(
      'probe.swap-b',
      () => secondGate.promise
    )

    const view = render(
      <LazyView view={firstView} viewProps={{ label: 'first' }} name="First" />
    )
    await waitFor(() =>
      assert.strictEqual(screen.getByTestId('probe').textContent, 'first')
    )

    view.rerender(
      <LazyView
        view={secondView}
        viewProps={{ label: 'second' }}
        name="Second"
      />
    )

    assert.strictEqual(
      screen.queryByTestId('probe'),
      null,
      'the first module must not be re-rendered with the second surface props'
    )
    assert.match(screen.getByRole('status').textContent ?? '', /Second/)

    function SecondProbe(props: IProbeProps) {
      return <span data-testid="second-probe">{props.label}</span>
    }
    secondGate.resolve(SecondProbe)
    await waitFor(() =>
      assert.strictEqual(
        screen.getByTestId('second-probe').textContent,
        'second'
      )
    )
  })

  it('drops a module that resolves after its surface was swapped away', async () => {
    const staleGate = deferred<React.ComponentType<IProbeProps>>()
    const staleView = lazyViewModule<IProbeProps>(
      'probe.stale',
      () => staleGate.promise
    )
    const currentView = lazyViewModule<IProbeProps>('probe.current', () =>
      Promise.resolve(Probe)
    )

    const view = render(
      <LazyView view={staleView} viewProps={{ label: 'stale' }} name="Stale" />
    )
    view.rerender(
      <LazyView
        view={currentView}
        viewProps={{ label: 'current' }}
        name="Current"
      />
    )

    await waitFor(() =>
      assert.strictEqual(screen.getByTestId('probe').textContent, 'current')
    )

    function StaleProbe() {
      return <span data-testid="stale-probe">stale</span>
    }
    staleGate.resolve(StaleProbe)
    await new Promise<void>(resolve => setImmediate(resolve))

    assert.strictEqual(
      screen.queryByTestId('stale-probe'),
      null,
      'the superseded module must never be painted'
    )
    assert.strictEqual(screen.getByTestId('probe').textContent, 'current')
  })

  it('does not report a failure after the surface was unmounted', async () => {
    const gate = deferred<React.ComponentType<IProbeProps>>()
    const view = lazyViewModule<IProbeProps>(
      'probe.unmounted',
      () => gate.promise
    )
    let reports = 0

    const rendered = render(
      <LazyView
        view={view}
        viewProps={{ label: 'x' }}
        name="Probe"
        onLoadFailed={() => {
          reports += 1
        }}
      />
    )

    rendered.unmount()
    gate.reject(new Error('too late'))
    await new Promise<void>(resolve => setImmediate(resolve))

    assert.strictEqual(reports, 0)
  })
})

describe('LazyView copy', () => {
  // A catalog lookup is `string | undefined`, and an absent key is exactly the
  // regression these tests exist to catch. Resolving through this helper makes
  // a missing key fail by name instead of surfacing as a type complaint or a
  // confusing `undefined` deep inside an assertion.
  function resolve(
    catalog: Record<string, string | undefined>,
    key: string
  ): string {
    const value = catalog[key]
    assert.ok(
      typeof value === 'string' && value.length > 0,
      `the catalog is missing a value for ${key}`
    )
    return value
  }

  it('names the surface in every funny-level band of both languages', () => {
    const bands = ['plain', 'light', 'playful'] as const

    for (const band of bands) {
      for (const catalog of [englishTranslations, cantoneseTranslations]) {
        assert.match(resolve(catalog, `lazyView.loading.${band}`), /\{name\}/)
        assert.match(
          resolve(catalog, `lazyView.failedBody.${band}`),
          /\{name\}/
        )
      }
    }
  })

  it('keeps the failure facts out of the funny-level bands', () => {
    // What failed, what went wrong and what to press are facts, so they are
    // single fixed strings rather than a family with a playful variant.
    for (const catalog of [englishTranslations, cantoneseTranslations]) {
      assert.match(resolve(catalog, 'lazyView.failedTitle'), /\{name\}/)
      assert.match(resolve(catalog, 'lazyView.failedDetail'), /\{error\}/)
      assert.ok(resolve(catalog, 'lazyView.retry').length > 0)
      assert.match(resolve(catalog, 'lazyView.notificationBody'), /\{name\}/)
      assert.match(resolve(catalog, 'lazyView.notificationBody'), /\{error\}/)
    }
  })
})
