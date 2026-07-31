/**
 * Desktop Material documentation hub — infinite colour picker UI.
 *
 * Builds the control the appearance rules require: a **continuous** two
 * dimensional field plus numeric entry in every notation, never a finite
 * swatch-only chooser. Swatches and recent colours exist here, but as
 * conveniences layered on the continuous field rather than as replacements.
 *
 * Colour mathematics lives entirely in `docs-color.js`; this file owns only the
 * DOM, pointer, keyboard and clipboard behaviour.
 *
 * Layout is mobile-first. The field, sliders and translator stack in one column
 * and stay usable from 320 CSS px upward; every interactive target is at least
 * 44 px in its smallest dimension. Pointer input uses Pointer Events so touch,
 * pen and mouse take the same path.
 */
;(function (global) {
  'use strict'

  var Color = global.DocsColor

  /** Arrow keys nudge; Shift multiplies. Values are field fractions. */
  var StepSmall = 0.01
  var StepLarge = 0.1
  var HueStepSmall = 1
  var HueStepLarge = 15
  var MaximumRecent = 12

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text)
    }
    return node
  }

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value
  }

  /**
   * Creates one picker. Returns a handle whose `element` the caller mounts and
   * whose `value`/`setValue` read and write the live colour.
   *
   * options.labels supplies every visible string, so the caller keeps ownership
   * of language mode and playfulness level; this module never localizes.
   */
  function create(options) {
    var config = options || {}
    var labels = config.labels || {}
    var onChange =
      typeof config.onChange === 'function' ? config.onChange : null
    var onCommit =
      typeof config.onCommit === 'function' ? config.onCommit : null

    function label(key, fallback) {
      var value = labels[key]
      return value === undefined || value === null ? fallback : String(value)
    }

    var current =
      Color.parse(config.initial === undefined ? '#4f46e5' : config.initial) ||
      Color.parse('#4f46e5')
    // Hue and saturation are held separately from the sRGB triple: a fully
    // black or white colour has no recoverable hue, and re-deriving it every
    // render would snap the field marker back to red as the user drags to an
    // edge.
    var hsv = Color.rgbToHsv(current.r, current.g, current.b)
    var hue = hsv.h
    var recent = Array.isArray(config.recent) ? config.recent.slice(0) : []

    var root = element('div', 'dm-color-picker')
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', label('picker', 'Colour picker'))

    // ------------------------------------------------------------- preview

    var previewRow = element('div', 'dm-color-preview-row')
    var preview = element('div', 'dm-color-preview')
    preview.setAttribute('role', 'img')
    var previewText = element('div', 'dm-color-preview-text')
    var previewName = element('span', 'dm-color-preview-name')
    var previewSpace = element('span', 'dm-color-preview-space')
    previewText.appendChild(previewName)
    previewText.appendChild(previewSpace)
    previewRow.appendChild(preview)
    previewRow.appendChild(previewText)
    root.appendChild(previewRow)

    // --------------------------------------------------------- 2D SV field

    var field = element('div', 'dm-color-field')
    field.setAttribute('role', 'application')
    field.setAttribute('tabindex', '0')
    field.setAttribute(
      'aria-label',
      label('field', 'Saturation and brightness')
    )
    var fieldMarker = element('div', 'dm-color-field-marker')
    field.appendChild(fieldMarker)
    root.appendChild(field)

    // ----------------------------------------------------------- hue slider

    function slider(className, ariaLabel, max, step) {
      var wrap = element('div', 'dm-color-slider ' + className)
      var input = document.createElement('input')
      input.type = 'range'
      input.min = '0'
      input.max = String(max)
      input.step = String(step)
      input.setAttribute('aria-label', ariaLabel)
      wrap.appendChild(input)
      return { wrap: wrap, input: input }
    }

    var hueSlider = slider('dm-color-slider--hue', label('hue', 'Hue'), 360, 1)
    var alphaSlider = slider(
      'dm-color-slider--alpha',
      label('alpha', 'Opacity'),
      100,
      1
    )
    root.appendChild(hueSlider.wrap)
    root.appendChild(alphaSlider.wrap)

    // ---------------------------------------------------------- free entry

    var entryRow = element('div', 'dm-color-entry')
    var entryLabel = element('label', 'dm-color-entry-label')
    var entryInput = document.createElement('input')
    entryInput.type = 'text'
    entryInput.className = 'dm-color-entry-input'
    entryInput.setAttribute('spellcheck', 'false')
    entryInput.setAttribute('autocomplete', 'off')
    entryInput.setAttribute('inputmode', 'text')
    entryInput.maxLength = 64
    var entryId = 'dm-color-entry-' + Math.abs(Date.now() % 100000).toString(36)
    entryInput.id = entryId
    entryLabel.setAttribute('for', entryId)
    entryLabel.textContent = label('entry', 'Enter any colour')
    var entryError = element('p', 'dm-color-entry-error')
    entryError.setAttribute('role', 'alert')
    entryError.hidden = true
    entryRow.appendChild(entryLabel)
    entryRow.appendChild(entryInput)
    entryRow.appendChild(entryError)
    root.appendChild(entryRow)

    // ---------------------------------------------------------- translator

    var translatorHeading = element(
      'h4',
      'dm-color-translator-heading',
      label('translator', 'Every notation')
    )
    root.appendChild(translatorHeading)
    var translator = element('ul', 'dm-color-translator')
    root.appendChild(translator)
    var translatorRows = {}

    for (var f = 0; f < Color.formats.length; f++) {
      var format = Color.formats[f]
      var item = element('li', 'dm-color-translator-row')
      item.setAttribute('data-format', format.id)
      var rowLabel = element('span', 'dm-color-translator-label', format.label)
      // A real input, so each notation is editable as well as copyable — the
      // translator is bidirectional, not a read-only readout.
      var rowValue = document.createElement('input')
      rowValue.type = 'text'
      rowValue.className = 'dm-color-translator-value'
      rowValue.setAttribute('spellcheck', 'false')
      rowValue.setAttribute('autocomplete', 'off')
      rowValue.setAttribute(
        'aria-label',
        format.label + ' ' + label('valueSuffix', 'value')
      )
      rowValue.maxLength = 64
      var copy = element(
        'button',
        'dm-color-translator-copy',
        label('copy', 'Copy')
      )
      copy.type = 'button'
      copy.setAttribute(
        'aria-label',
        label('copyPrefix', 'Copy') + ' ' + format.label
      )
      item.appendChild(rowLabel)
      item.appendChild(rowValue)
      item.appendChild(copy)
      translator.appendChild(item)
      translatorRows[format.id] = { item: item, input: rowValue, copy: copy }
      bindTranslatorRow(format.id, rowValue, copy)
    }

    // ------------------------------------------------------------- warnings

    var gamut = element('p', 'dm-color-gamut')
    gamut.setAttribute('role', 'status')
    gamut.hidden = true
    root.appendChild(gamut)

    var contrast = element('div', 'dm-color-contrast')
    contrast.setAttribute('role', 'status')
    root.appendChild(contrast)

    // ------------------------------------------------------ recent + reset

    var recentHeading = element(
      'h4',
      'dm-color-recent-heading',
      label('recent', 'Recent')
    )
    var recentList = element('div', 'dm-color-recent')
    recentList.setAttribute('role', 'group')
    recentList.setAttribute('aria-label', label('recent', 'Recent'))
    root.appendChild(recentHeading)
    root.appendChild(recentList)

    var actions = element('div', 'dm-color-actions')
    var reset = element('button', 'dm-color-reset', label('reset', 'Reset'))
    reset.type = 'button'
    actions.appendChild(reset)
    root.appendChild(actions)

    // ------------------------------------------------------------- painting

    function paint() {
      var css = Color.toHex8(current)
      var opaque = Color.toHex(current)
      preview.style.background = css
      preview.setAttribute(
        'aria-label',
        label('previewPrefix', 'Current colour') + ' ' + opaque
      )
      var name = Color.toName(current)
      previewName.textContent = name === null ? opaque : name + ' · ' + opaque
      previewSpace.textContent = current.clipped
        ? label('clipped', 'outside sRGB — clipped')
        : 'sRGB'

      // The field shows saturation on x and brightness on y for the live hue.
      field.style.background =
        'linear-gradient(to top, #000, rgba(0,0,0,0)),' +
        'linear-gradient(to right, #fff, hsl(' +
        hue +
        'deg 100% 50%))'
      var live = Color.rgbToHsv(current.r, current.g, current.b)
      fieldMarker.style.left = live.s * 100 + '%'
      fieldMarker.style.top = (1 - live.v) * 100 + '%'
      fieldMarker.style.background = opaque

      hueSlider.input.value = String(Math.round(hue))
      alphaSlider.input.value = String(Math.round(current.alpha * 100))
      alphaSlider.wrap.style.setProperty('--dm-alpha-color', opaque)

      var rows = Color.translate(current)
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i]
        var target = translatorRows[row.id]
        if (target === undefined) {
          continue
        }
        if (document.activeElement !== target.input) {
          target.input.value = row.defined
            ? String(row.value)
            : label('undefinedName', 'no CSS name')
        }
        target.item.classList.toggle('is-undefined', !row.defined)
        // An undefined name is not editable, because there is nothing to edit.
        target.input.readOnly = !row.defined
        target.copy.disabled = !row.defined
      }

      gamut.hidden = current.clipped !== true
      if (current.clipped) {
        gamut.textContent = label(
          'gamutWarning',
          'That colour lies outside sRGB. The value shown is the nearest colour this screen can display.'
        )
      }

      var white = Color.parse('#ffffff')
      var black = Color.parse('#000000')
      var onWhite = Color.contrastReport(current, white)
      var onBlack = Color.contrastReport(current, black)
      contrast.textContent =
        label('contrastOnLight', 'On white') +
        ' ' +
        onWhite.ratio.toFixed(2) +
        ':1 ' +
        (onWhite.passesAA ? 'AA' : onWhite.passesAALarge ? 'AA large' : '—') +
        ' · ' +
        label('contrastOnDark', 'On black') +
        ' ' +
        onBlack.ratio.toFixed(2) +
        ':1 ' +
        (onBlack.passesAA ? 'AA' : onBlack.passesAALarge ? 'AA large' : '—')

      if (document.activeElement !== entryInput) {
        entryInput.value = current.alpha >= 1 ? opaque : Color.toHex8(current)
      }
      paintRecent()
    }

    function paintRecent() {
      recentList.textContent = ''
      for (var i = 0; i < recent.length; i++) {
        var value = recent[i]
        var swatch = element('button', 'dm-color-recent-swatch')
        swatch.type = 'button'
        swatch.style.background = value
        swatch.setAttribute('aria-label', value)
        swatch.setAttribute('data-color', value)
        swatch.addEventListener('click', onRecentClick)
        recentList.appendChild(swatch)
      }
      recentHeading.hidden = recent.length === 0
      recentList.hidden = recent.length === 0
    }

    function onRecentClick(event) {
      var value = event.currentTarget.getAttribute('data-color')
      var parsedValue = Color.parse(value)
      if (parsedValue !== null) {
        apply(parsedValue, true)
      }
    }

    // ------------------------------------------------------------- mutation

    function apply(next, commit) {
      current = next
      var live = Color.rgbToHsv(current.r, current.g, current.b)
      // Preserve the working hue through greys: only adopt the derived hue when
      // the colour actually carries one.
      if (live.s > 0.0001 && live.v > 0.0001) {
        hue = live.h
      }
      paint()
      if (onChange !== null) {
        onChange(current)
      }
      if (commit) {
        remember()
        if (onCommit !== null) {
          onCommit(current)
        }
      }
    }

    function remember() {
      var value =
        current.alpha >= 1 ? Color.toHex(current) : Color.toHex8(current)
      var index = recent.indexOf(value)
      if (index !== -1) {
        recent.splice(index, 1)
      }
      recent.unshift(value)
      if (recent.length > MaximumRecent) {
        recent = recent.slice(0, MaximumRecent)
      }
      paintRecent()
    }

    function setFromField(sx, sy) {
      var rgb = Color.hsvToRgb(hue, clamp01(sx), clamp01(1 - sy))
      apply(Color.make(rgb.r, rgb.g, rgb.b, current.alpha), false)
    }

    // --------------------------------------------------------- interactions

    var dragging = false

    function fieldFractions(event) {
      var box = field.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) {
        return null
      }
      return {
        x: clamp01((event.clientX - box.left) / box.width),
        y: clamp01((event.clientY - box.top) / box.height),
      }
    }

    field.addEventListener('pointerdown', function (event) {
      var point = fieldFractions(event)
      if (point === null) {
        return
      }
      dragging = true
      // Capture keeps the drag alive when the pointer leaves the field, which
      // is the normal case when reaching for a fully saturated edge.
      if (typeof field.setPointerCapture === 'function') {
        try {
          field.setPointerCapture(event.pointerId)
        } catch (error) {
          /* Capture is a convenience; dragging still works without it. */
        }
      }
      field.focus()
      setFromField(point.x, point.y)
      event.preventDefault()
    })

    field.addEventListener('pointermove', function (event) {
      if (!dragging) {
        return
      }
      var point = fieldFractions(event)
      if (point !== null) {
        setFromField(point.x, point.y)
      }
    })

    function endDrag() {
      if (dragging) {
        dragging = false
        remember()
        if (onCommit !== null) {
          onCommit(current)
        }
      }
    }

    field.addEventListener('pointerup', endDrag)
    field.addEventListener('pointercancel', endDrag)

    field.addEventListener('keydown', function (event) {
      var live = Color.rgbToHsv(current.r, current.g, current.b)
      var step = event.shiftKey ? StepLarge : StepSmall
      var sx = live.s
      var sy = 1 - live.v
      var handled = true
      switch (event.key) {
        case 'ArrowLeft':
          sx -= step
          break
        case 'ArrowRight':
          sx += step
          break
        case 'ArrowUp':
          sy -= step
          break
        case 'ArrowDown':
          sy += step
          break
        case 'Home':
          sx = 0
          break
        case 'End':
          sx = 1
          break
        case 'PageUp':
          sy = 0
          break
        case 'PageDown':
          sy = 1
          break
        default:
          handled = false
      }
      if (!handled) {
        return
      }
      event.preventDefault()
      setFromField(sx, sy)
      remember()
      if (onCommit !== null) {
        onCommit(current)
      }
    })

    hueSlider.input.addEventListener('input', function () {
      hue = parseFloat(hueSlider.input.value) || 0
      var live = Color.rgbToHsv(current.r, current.g, current.b)
      var rgb = Color.hsvToRgb(hue, live.s, live.v)
      apply(Color.make(rgb.r, rgb.g, rgb.b, current.alpha), false)
    })
    hueSlider.input.addEventListener('change', function () {
      remember()
      if (onCommit !== null) {
        onCommit(current)
      }
    })

    alphaSlider.input.addEventListener('input', function () {
      var value = parseFloat(alphaSlider.input.value)
      apply(
        Color.make(
          current.r,
          current.g,
          current.b,
          isNaN(value) ? 1 : value / 100
        ),
        false
      )
    })
    alphaSlider.input.addEventListener('change', function () {
      remember()
      if (onCommit !== null) {
        onCommit(current)
      }
    })

    function readEntry(input, showError) {
      var text = input.value
      var next = Color.parse(text)
      if (next === null) {
        if (showError) {
          entryError.hidden = false
          entryError.textContent = label(
            'invalid',
            'That is not a colour this page can read. Your text is kept so you can correct it.'
          )
          input.setAttribute('aria-invalid', 'true')
        }
        return false
      }
      entryError.hidden = true
      input.removeAttribute('aria-invalid')
      apply(next, true)
      return true
    }

    entryInput.addEventListener('change', function () {
      readEntry(entryInput, true)
    })
    entryInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault()
        readEntry(entryInput, true)
      }
    })

    function bindTranslatorRow(id, input, copy) {
      input.addEventListener('change', function () {
        if (input.readOnly) {
          return
        }
        if (!readEntry(input, true)) {
          // Restore the row so an unreadable edit cannot leave a stale value
          // masquerading as the current colour; the free-entry field keeps the
          // user's text and its error.
          paint()
        }
      })
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault()
          input.blur()
        }
      })
      copy.addEventListener('click', function () {
        var value = input.value
        function done() {
          copy.textContent = label('copied', 'Copied')
          global.setTimeout(function () {
            copy.textContent = label('copy', 'Copy')
          }, 1400)
        }
        if (
          global.navigator &&
          global.navigator.clipboard &&
          typeof global.navigator.clipboard.writeText === 'function'
        ) {
          global.navigator.clipboard.writeText(value).then(done, function () {
            input.select()
          })
          return
        }
        input.select()
        done()
      })
    }

    reset.addEventListener('click', function () {
      var initial =
        Color.parse(
          config.initial === undefined ? '#4f46e5' : config.initial
        ) || Color.parse('#4f46e5')
      entryError.hidden = true
      entryInput.removeAttribute('aria-invalid')
      apply(initial, true)
    })

    paint()

    return {
      element: root,
      value: function () {
        return current
      },
      css: function () {
        return current.alpha >= 1 ? Color.toHex(current) : Color.toHex8(current)
      },
      setValue: function (input) {
        var next = Color.parse(input)
        if (next !== null) {
          apply(next, false)
        }
        return next !== null
      },
      recent: function () {
        return recent.slice(0)
      },
      focus: function () {
        field.focus()
      },
      labels: function (next) {
        labels = next || {}
        entryLabel.textContent = label('entry', 'Enter any colour')
        translatorHeading.textContent = label('translator', 'Every notation')
        recentHeading.textContent = label('recent', 'Recent')
        reset.textContent = label('reset', 'Reset')
        root.setAttribute('aria-label', label('picker', 'Colour picker'))
        field.setAttribute(
          'aria-label',
          label('field', 'Saturation and brightness')
        )
        hueSlider.input.setAttribute('aria-label', label('hue', 'Hue'))
        alphaSlider.input.setAttribute('aria-label', label('alpha', 'Opacity'))
        paint()
      },
    }
  }

  var api = { create: create }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsColorPicker = api
})(typeof window === 'undefined' ? globalThis : window)
