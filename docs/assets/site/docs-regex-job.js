/**
 * Shared regex-job runner for every published documentation surface.
 *
 * This is the single implementation of the contract the documentation hub and
 * the documentation search page both have to honour: a reader's pattern is
 * compiled and evaluated only inside a fresh same-origin worker, and the *page*
 * owns the deadline so it can terminate that worker while a native
 * `exec`/`test` call is still stuck in catastrophic backtracking. An
 * unavailable worker fails closed. Nothing here ever compiles a reader's
 * pattern on the UI thread, and no surface may keep a private copy of this
 * logic — one deadline, one termination path, one place to get right.
 */
;(function (scope) {
  'use strict'

  /** The hard interruption budget every documentation surface shares. */
  var DefaultBudgetMilliseconds = 750

  /**
   * Creates a runner holding at most one live job per named surface, so
   * refreshing one surface never cancels an unrelated one.
   *
   * `options.workerPath` is resolved by the browser against the calling page,
   * `options.onBusy(surface, busy)` is optional and purely presentational.
   */
  function create(options) {
    var settings = options === undefined || options === null ? {} : options
    var workerPath = String(settings.workerPath)
    var budget = Number.isInteger(settings.budgetMilliseconds)
      ? settings.budgetMilliseconds
      : DefaultBudgetMilliseconds
    var onBusy =
      typeof settings.onBusy === 'function' ? settings.onBusy : function () {}

    var jobs = Object.create(null)
    var sequence = 0

    function setBusy(surface, busy) {
      try {
        onBusy(surface, busy)
      } catch (error) {
        /* A busy indicator must never break the evaluation it describes. */
      }
    }

    function cancel(surface) {
      var job = jobs[surface]
      if (job === undefined || job === null) {
        return
      }
      scope.clearTimeout(job.timeout)
      try {
        job.worker.terminate()
      } catch (error) {
        /* A worker that already exited is already safely isolated. */
      }
      jobs[surface] = null
      setBusy(surface, false)
    }

    function finish(surface, job) {
      if (jobs[surface] !== job) {
        return false
      }
      scope.clearTimeout(job.timeout)
      job.worker.terminate()
      jobs[surface] = null
      setBusy(surface, false)
      return true
    }

    /**
     * Runs one bounded regex operation outside the UI thread. The timeout
     * always terminates the worker before reporting failure, which makes the
     * deadline a real interruption rather than an elapsed-time reading taken
     * after a blocking call has finally decided to return.
     */
    function run(surface, payload, onSuccess, onFailure) {
      cancel(surface)

      if (typeof scope.Worker !== 'function') {
        onFailure('unavailable', '')
        return
      }

      var worker
      try {
        worker = new scope.Worker(workerPath)
      } catch (error) {
        onFailure('unavailable', '')
        return
      }

      var requestId = ++sequence
      var job = { worker: worker, timeout: 0, requestId: requestId }
      jobs[surface] = job
      setBusy(surface, true)

      job.timeout = scope.setTimeout(function () {
        if (!finish(surface, job)) {
          return
        }
        onFailure('timeout', '')
      }, budget)

      worker.onmessage = function (event) {
        var data = event.data
        if (
          data === null ||
          typeof data !== 'object' ||
          data.requestId !== requestId ||
          !finish(surface, job)
        ) {
          return
        }
        if (data.ok === true) {
          onSuccess(data)
        } else {
          onFailure(data.code || 'unavailable', data.detail || '')
        }
      }
      worker.onerror = function (event) {
        if (
          event !== null &&
          event !== undefined &&
          typeof event.preventDefault === 'function'
        ) {
          event.preventDefault()
        }
        if (finish(surface, job)) {
          onFailure('unavailable', '')
        }
      }

      try {
        worker.postMessage(Object.assign({ requestId: requestId }, payload))
      } catch (error) {
        if (finish(surface, job)) {
          onFailure('unavailable', '')
        }
      }
    }

    return { run: run, cancel: cancel, budgetMilliseconds: budget }
  }

  scope.DesktopMaterialRegexJob = {
    create: create,
    defaultBudgetMilliseconds: DefaultBudgetMilliseconds,
  }
})(window)
