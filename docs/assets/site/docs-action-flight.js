;(function (global) {
  'use strict'

  var active = new Set()

  function isThenable(value) {
    return (
      value !== null &&
      value !== undefined &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof value.then === 'function'
    )
  }

  function setBusy(control, busy) {
    if (control === null || control === undefined) {
      return
    }
    if (busy) {
      control.setAttribute('aria-busy', 'true')
      control.setAttribute('aria-disabled', 'true')
      return
    }
    control.removeAttribute('aria-busy')
    control.removeAttribute('aria-disabled')
  }

  function release(key, control) {
    active.delete(key)
    setBusy(control, false)
  }

  function run(key, control, work) {
    if (active.has(key)) {
      return Promise.resolve(undefined)
    }
    active.add(key)
    setBusy(control, true)

    var started
    try {
      started = work()
    } catch (error) {
      release(key, control)
      throw error
    }

    if (!isThenable(started)) {
      release(key, control)
      return Promise.resolve(started)
    }

    return Promise.resolve(started).then(
      function (value) {
        release(key, control)
        return value
      },
      function (error) {
        release(key, control)
        throw error
      }
    )
  }

  global.DesktopMaterialActionFlight = Object.freeze({
    isActive: function (key) {
      return active.has(key)
    },
    run: run,
  })
})(typeof window === 'undefined' ? globalThis : window)
