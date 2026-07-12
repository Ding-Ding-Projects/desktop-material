// global-jsdom exposes Storage on window, but Node 26 no longer mirrors it to
// the Node global. Profile Git's dependency graph reads localStorage during
// module evaluation, so install the same object before those modules load.
if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: window.localStorage,
  })
}
