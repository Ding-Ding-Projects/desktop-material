import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'node:test'

// Testing Library's async utilities (waitFor, findBy*) default to a 1s budget.
// Under heavy machine load — a fully parallel unit run pinning every core — a
// component that would settle quickly on an idle box can blow past that budget
// and flake (observed on the OllamaModelManager chat panel and the
// AddExistingRepository suites). Raise the default here, once, for the whole
// unit-test environment so no individual test needs its own timeout override.
// Explicit per-call timeouts still win, so this only lifts the default floor.
configure({ asyncUtilTimeout: 15_000 })

class TestResizeObserver {
  public observe() {}

  public unobserve() {}

  public disconnect() {}
}

if (globalThis.ResizeObserver === undefined) {
  Object.assign(globalThis, {
    ResizeObserver: TestResizeObserver,
  })
}

// Node exposes localStorage as a read-only accessor while global-jsdom keeps
// the usable test storage on window. Align the global once for every UI test;
// Object.assign cannot replace Node's accessor because its setter rejects.
if (typeof window !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: window.localStorage,
    writable: true,
  })
}

if (
  typeof window !== 'undefined' &&
  globalThis.CustomEvent !== window.CustomEvent
) {
  Object.assign(globalThis, {
    CustomEvent: window.CustomEvent,
    Event: window.Event,
  })
}

afterEach(() => cleanup())
