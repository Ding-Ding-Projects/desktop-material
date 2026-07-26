/**
 * Interruptible ECMAScript-regex evaluator for the static documentation hub.
 *
 * This worker has no network or DOM dependencies. The page creates a fresh
 * instance for every operation and terminates it after a hard deadline, so a
 * catastrophically backtracking native RegExp cannot freeze the UI thread.
 */
;(function (scope) {
  'use strict'

  var MaximumPatternLength = 512
  var MaximumSampleLength = 20000
  var MaximumCatalogEntries = 5000
  var MaximumCatalogFieldLength = 10000
  var MaximumCatalogTextLength = 2000000
  var MaximumWorkerResults = 100
  var MaximumWorkerRanges = 500
  var MaximumCapturePreviews = 24
  var MaximumCapturePreviewLength = 120
  var MaximumMatchPreviewLength = 240

  function reply(requestId, body) {
    scope.postMessage(Object.assign({ requestId: requestId }, body))
  }

  function errorDetail(error) {
    var message =
      error !== null && error !== undefined && error.message !== undefined
        ? String(error.message)
        : String(error)
    return message.slice(0, 300)
  }

  function boundedInteger(value, fallback, maximum) {
    return Number.isInteger(value) && value > 0
      ? Math.min(value, maximum)
      : fallback
  }

  function normalizedFlags(flags, forceGlobal) {
    if (typeof flags !== 'string' || flags.length > 6) {
      return null
    }
    var allowed = 'gimsuy'
    var seen = Object.create(null)
    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i)
      if (allowed.indexOf(flag) === -1 || seen[flag] === true) {
        return null
      }
      seen[flag] = true
    }
    if (forceGlobal && seen.g !== true) {
      flags += 'g'
    }
    return flags
  }

  function compile(pattern, flags, forceGlobal) {
    if (typeof pattern !== 'string') {
      return { code: 'invalid', detail: '' }
    }
    if (pattern.length > MaximumPatternLength) {
      return { code: 'too-long-pattern', detail: '' }
    }
    var safeFlags = normalizedFlags(flags, forceGlobal)
    if (safeFlags === null) {
      return { code: 'invalid', detail: 'Unsupported or repeated flag.' }
    }
    try {
      return { regex: new RegExp(pattern, safeFlags) }
    } catch (error) {
      return { code: 'invalid', detail: errorDetail(error) }
    }
  }

  /** ECMAScript's zero-width global-match advancement, including `u` mode. */
  function advanceStringIndex(value, index, unicode) {
    if (!unicode || index + 1 >= value.length) {
      return index + 1
    }
    var first = value.charCodeAt(index)
    if (first < 0xd800 || first > 0xdbff) {
      return index + 1
    }
    var second = value.charCodeAt(index + 1)
    return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1
  }

  function matchRanges(regex, value, maximumRanges) {
    var ranges = []
    regex.lastIndex = 0
    while (ranges.length < maximumRanges) {
      var match = regex.exec(value)
      if (match === null) {
        break
      }
      if (match[0] === '') {
        regex.lastIndex = advanceStringIndex(
          value,
          match.index,
          regex.unicode === true
        )
        continue
      }
      ranges.push([match.index, match.index + match[0].length])
    }
    return ranges
  }

  function boundedPreview(value, maximumLength) {
    if (typeof value !== 'string') {
      return { value: null, truncated: false }
    }
    return {
      value: value.slice(0, maximumLength),
      truncated: value.length > maximumLength,
    }
  }

  function validCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length > MaximumCatalogEntries) {
      return false
    }
    var totalLength = 0
    for (var i = 0; i < catalog.length; i++) {
      var fields = catalog[i]
      if (!Array.isArray(fields) || fields.length !== 3) {
        return false
      }
      for (var f = 0; f < fields.length; f++) {
        if (
          typeof fields[f] !== 'string' ||
          fields[f].length > MaximumCatalogFieldLength
        ) {
          return false
        }
        totalLength += fields[f].length
        if (totalLength > MaximumCatalogTextLength) {
          return false
        }
      }
    }
    return true
  }

  function search(requestId, message) {
    if (!validCatalog(message.catalog)) {
      reply(requestId, { ok: false, code: 'invalid-request', detail: '' })
      return
    }

    var matcherResult = compile(message.pattern, message.flags, false)
    if (matcherResult.regex === undefined) {
      reply(requestId, Object.assign({ ok: false }, matcherResult))
      return
    }

    // Search matching honours `y`; highlighting intentionally does not, just
    // as the previous UI did, because a sticky highlighter would omit later
    // visible occurrences. Highlighting is always global.
    var highlightFlags = message.flags.replace(/y/g, '').replace(/g/g, '')
    var highlighterResult = compile(message.pattern, highlightFlags, true)
    if (highlighterResult.regex === undefined) {
      reply(requestId, Object.assign({ ok: false }, highlighterResult))
      return
    }

    var maximumResults = boundedInteger(
      message.maximumResults,
      60,
      MaximumWorkerResults
    )
    var maximumRanges = boundedInteger(
      message.maximumRanges,
      200,
      MaximumWorkerRanges
    )
    var matcher = matcherResult.regex
    var highlighter = highlighterResult.regex
    var hits = []
    var total = 0

    for (var i = 0; i < message.catalog.length; i++) {
      var fields = message.catalog[i]
      matcher.lastIndex = 0
      if (!matcher.test(fields[0] + ' ' + fields[1] + ' ' + fields[2])) {
        continue
      }
      total++
      if (hits.length < maximumResults) {
        hits.push({
          catalogIndex: i,
          titleRanges: matchRanges(highlighter, fields[0], maximumRanges),
          pathRanges: matchRanges(highlighter, fields[1], maximumRanges),
          descriptionRanges: matchRanges(highlighter, fields[2], maximumRanges),
        })
      }
    }

    reply(requestId, { ok: true, total: total, hits: hits })
  }

  function builder(requestId, message) {
    if (typeof message.sample !== 'string') {
      reply(requestId, { ok: false, code: 'invalid-request', detail: '' })
      return
    }
    if (message.sample.length > MaximumSampleLength) {
      reply(requestId, {
        ok: false,
        code: 'too-long-sample',
        detail: '',
      })
      return
    }

    var compiled = compile(message.pattern, message.flags, true)
    if (compiled.regex === undefined) {
      reply(requestId, Object.assign({ ok: false }, compiled))
      return
    }

    var maximumMatches = boundedInteger(
      message.maximumMatches,
      100,
      MaximumWorkerResults
    )
    var regex = compiled.regex
    var matches = []
    regex.lastIndex = 0
    while (matches.length < maximumMatches) {
      var match = regex.exec(message.sample)
      if (match === null) {
        break
      }

      // Capture data is a compact first-match preview, not an unbounded copy of
      // every group in every match. This keeps structured-clone output small
      // even for deeply nested groups over the maximum 20k sample.
      var captures = []
      var namedGroups = null
      var capturesOmitted = 0
      if (matches.length === 0) {
        var numberedCount = Math.min(match.length - 1, MaximumCapturePreviews)
        for (var group = 1; group <= numberedCount; group++) {
          captures.push(
            boundedPreview(match[group], MaximumCapturePreviewLength)
          )
        }

        var namedGroupNames =
          match.groups === undefined || match.groups === null
            ? []
            : Object.keys(match.groups)
        var namedCount = Math.min(
          namedGroupNames.length,
          MaximumCapturePreviews - captures.length
        )
        if (namedCount > 0) {
          namedGroups = Object.create(null)
          for (var namedIndex = 0; namedIndex < namedCount; namedIndex++) {
            var name = namedGroupNames[namedIndex]
            namedGroups[name] = boundedPreview(
              match.groups[name],
              MaximumCapturePreviewLength
            )
          }
        }
        capturesOmitted = Math.max(
          0,
          match.length -
            1 +
            namedGroupNames.length -
            captures.length -
            namedCount
        )
      }

      matches.push({
        value: boundedPreview(match[0], MaximumMatchPreviewLength),
        index: match.index,
        captures: captures,
        namedGroups: namedGroups,
        capturesOmitted: capturesOmitted,
      })
      if (match[0] === '') {
        regex.lastIndex = advanceStringIndex(
          message.sample,
          match.index,
          regex.unicode === true
        )
      }
    }

    reply(requestId, { ok: true, matches: matches })
  }

  scope.onmessage = function (event) {
    var message = event.data
    var requestId =
      message !== null && Number.isInteger(message.requestId)
        ? message.requestId
        : 0
    try {
      if (message.operation === 'search') {
        search(requestId, message)
        return
      }
      if (message.operation === 'builder') {
        builder(requestId, message)
        return
      }
      reply(requestId, { ok: false, code: 'invalid-request', detail: '' })
    } catch (error) {
      reply(requestId, {
        ok: false,
        code: 'worker-error',
        detail: errorDetail(error),
      })
    }
  }
})(self)
