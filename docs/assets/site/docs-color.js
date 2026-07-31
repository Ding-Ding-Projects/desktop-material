/**
 * Desktop Material documentation hub — colour engine and translator.
 *
 * Pure colour mathematics plus a bidirectional format translator. Nothing in
 * this file touches the DOM, so it can be unit-tested directly by Node.
 *
 * Every conversion round-trips through one canonical representation: sRGB with
 * unpremultiplied alpha, each channel held as a float in 0..1 so repeated
 * edits do not accumulate 8-bit rounding error. Only the string formatters
 * quantise.
 *
 * Supported formats, all readable and writable:
 *
 *   named (CSS level 4)   hex / hex8      rgb / rgba
 *   hsl / hsla            hsv (hsb)       hwb
 *   lab                   lch             oklab            oklch
 *   cmyk
 *
 * Gamut: Lab, LCH, OKLab and OKLCH describe colours sRGB cannot show. Those
 * conversions report `clipped: true` rather than silently pretending the
 * nearest sRGB colour was what the user asked for.
 */
;(function (global) {
  'use strict'

  // --------------------------------------------------------------- helpers

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value
  }

  function clamp01(value) {
    return clamp(value, 0, 1)
  }

  function round(value, places) {
    var factor = Math.pow(10, places === undefined ? 0 : places)
    return Math.round(value * factor) / factor
  }

  /** Numbers reach CSS without a trailing `.0`, so output stays idiomatic. */
  function num(value, places) {
    var rounded = round(value, places)
    return String(rounded === 0 ? 0 : rounded)
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value)
  }

  // ------------------------------------------------------------ sRGB <-> hsl

  function rgbToHsl(r, g, b) {
    var max = Math.max(r, g, b)
    var min = Math.min(r, g, b)
    var lightness = (max + min) / 2
    if (max === min) {
      return { h: 0, s: 0, l: lightness }
    }
    var delta = max - min
    var saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    var hue
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0)
    } else if (max === g) {
      hue = (b - r) / delta + 2
    } else {
      hue = (r - g) / delta + 4
    }
    return { h: hue * 60, s: saturation, l: lightness }
  }

  function hueToChannel(p, q, t) {
    var value = t
    if (value < 0) {
      value += 1
    }
    if (value > 1) {
      value -= 1
    }
    if (value < 1 / 6) {
      return p + (q - p) * 6 * value
    }
    if (value < 1 / 2) {
      return q
    }
    if (value < 2 / 3) {
      return p + (q - p) * (2 / 3 - value) * 6
    }
    return p
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      return { r: l, g: l, b: l }
    }
    var hue = (((h % 360) + 360) % 360) / 360
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s
    var p = 2 * l - q
    return {
      r: hueToChannel(p, q, hue + 1 / 3),
      g: hueToChannel(p, q, hue),
      b: hueToChannel(p, q, hue - 1 / 3),
    }
  }

  // ------------------------------------------------------------ sRGB <-> hsv

  function rgbToHsv(r, g, b) {
    var max = Math.max(r, g, b)
    var min = Math.min(r, g, b)
    var delta = max - min
    var hue = 0
    if (delta !== 0) {
      if (max === r) {
        hue = (g - b) / delta + (g < b ? 6 : 0)
      } else if (max === g) {
        hue = (b - r) / delta + 2
      } else {
        hue = (r - g) / delta + 4
      }
      hue *= 60
    }
    return { h: hue, s: max === 0 ? 0 : delta / max, v: max }
  }

  function hsvToRgb(h, s, v) {
    var hue = (((h % 360) + 360) % 360) / 60
    var sector = Math.floor(hue)
    var f = hue - sector
    var p = v * (1 - s)
    var q = v * (1 - s * f)
    var t = v * (1 - s * (1 - f))
    switch (sector % 6) {
      case 0:
        return { r: v, g: t, b: p }
      case 1:
        return { r: q, g: v, b: p }
      case 2:
        return { r: p, g: v, b: t }
      case 3:
        return { r: p, g: q, b: v }
      case 4:
        return { r: t, g: p, b: v }
      default:
        return { r: v, g: p, b: q }
    }
  }

  // ------------------------------------------------------------ sRGB <-> hwb

  function rgbToHwb(r, g, b) {
    var hsv = rgbToHsv(r, g, b)
    return { h: hsv.h, w: Math.min(r, g, b), b: 1 - Math.max(r, g, b) }
  }

  function hwbToRgb(h, w, b) {
    var white = w
    var black = b
    // A whiteness/blackness pair summing above 1 is achromatic by definition.
    if (white + black >= 1) {
      var grey = white / (white + black)
      return { r: grey, g: grey, b: grey }
    }
    var rgb = hsvToRgb(h, 1, 1)
    return {
      r: rgb.r * (1 - white - black) + white,
      g: rgb.g * (1 - white - black) + white,
      b: rgb.b * (1 - white - black) + white,
    }
  }

  // ----------------------------------------------------------- sRGB <-> cmyk

  function rgbToCmyk(r, g, b) {
    var k = 1 - Math.max(r, g, b)
    if (k >= 1) {
      return { c: 0, m: 0, y: 0, k: 1 }
    }
    return {
      c: (1 - r - k) / (1 - k),
      m: (1 - g - k) / (1 - k),
      y: (1 - b - k) / (1 - k),
      k: k,
    }
  }

  function cmykToRgb(c, m, y, k) {
    return {
      r: (1 - c) * (1 - k),
      g: (1 - m) * (1 - k),
      b: (1 - y) * (1 - k),
    }
  }

  // ------------------------------------------------- transfer function / XYZ

  function toLinear(channel) {
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  }

  function toGamma(channel) {
    return channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
  }

  /** D65 white point, matching CSS Color 4. */
  var WhiteX = 0.3127 / 0.329
  var WhiteY = 1
  var WhiteZ = (1 - 0.3127 - 0.329) / 0.329

  function rgbToXyz(r, g, b) {
    var rl = toLinear(r)
    var gl = toLinear(g)
    var bl = toLinear(b)
    return {
      x: 0.4123907993 * rl + 0.3575843394 * gl + 0.1804807884 * bl,
      y: 0.2126390059 * rl + 0.7151686788 * gl + 0.0721923154 * bl,
      z: 0.0193308187 * rl + 0.1191947798 * gl + 0.9505321522 * bl,
    }
  }

  function xyzToRgb(x, y, z) {
    var rl = 3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z
    var gl = -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z
    var bl = 0.0556300797 * x - 0.203976959 * y + 1.0569715142 * z
    return { r: toGamma(rl), g: toGamma(gl), b: toGamma(bl) }
  }

  // ------------------------------------------------------------- CIE Lab/LCH

  var LabEpsilon = 216 / 24389
  var LabKappa = 24389 / 27

  function labF(t) {
    return t > LabEpsilon ? Math.cbrt(t) : (LabKappa * t + 16) / 116
  }

  function labFInverse(t) {
    var cubed = t * t * t
    return cubed > LabEpsilon ? cubed : (116 * t - 16) / LabKappa
  }

  function rgbToLab(r, g, b) {
    var xyz = rgbToXyz(r, g, b)
    var fx = labF(xyz.x / WhiteX)
    var fy = labF(xyz.y / WhiteY)
    var fz = labF(xyz.z / WhiteZ)
    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    }
  }

  function labToRgb(l, a, bStar) {
    var fy = (l + 16) / 116
    var fx = fy + a / 500
    var fz = fy - bStar / 200
    return xyzToRgb(
      labFInverse(fx) * WhiteX,
      labFInverse(fy) * WhiteY,
      labFInverse(fz) * WhiteZ
    )
  }

  function labToLch(l, a, b) {
    var chroma = Math.sqrt(a * a + b * b)
    var hue = (Math.atan2(b, a) * 180) / Math.PI
    return { l: l, c: chroma, h: hue < 0 ? hue + 360 : hue }
  }

  function lchToLab(l, c, h) {
    var radians = (h * Math.PI) / 180
    return { l: l, a: c * Math.cos(radians), b: c * Math.sin(radians) }
  }

  // ---------------------------------------------------------- OKLab / OKLCH

  function rgbToOklab(r, g, b) {
    var rl = toLinear(r)
    var gl = toLinear(g)
    var bl = toLinear(b)
    var l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl)
    var m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl)
    var s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl)
    return {
      l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    }
  }

  function oklabToRgb(L, A, B) {
    var l = L + 0.3963377774 * A + 0.2158037573 * B
    var m = L - 0.1055613458 * A - 0.0638541728 * B
    var s = L - 0.0894841775 * A - 1.291485548 * B
    var l3 = l * l * l
    var m3 = m * m * m
    var s3 = s * s * s
    return {
      r: toGamma(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
      g: toGamma(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
      b: toGamma(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
    }
  }

  // ------------------------------------------------------------ named colours

  var NAMED = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedalmond: '#ffebcd',
    blue: '#0000ff',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgreen: '#006400',
    darkgrey: '#a9a9a9',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    green: '#008000',
    greenyellow: '#adff2f',
    grey: '#808080',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgreen: '#90ee90',
    lightgrey: '#d3d3d3',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87cefa',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    red: '#ff0000',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whitesmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowgreen: '#9acd32',
  }

  var NAMED_LOOKUP = null

  function namedLookup() {
    if (NAMED_LOOKUP === null) {
      NAMED_LOOKUP = {}
      for (var name in NAMED) {
        if (Object.prototype.hasOwnProperty.call(NAMED, name)) {
          // Several CSS names share one hex value (aqua/cyan, gray/grey). The
          // first spelling wins so the reported name is stable.
          if (NAMED_LOOKUP[NAMED[name]] === undefined) {
            NAMED_LOOKUP[NAMED[name]] = name
          }
        }
      }
    }
    return NAMED_LOOKUP
  }

  // ------------------------------------------------------------------ Colour

  /**
   * The canonical colour. `r`, `g`, `b` and `alpha` are floats in 0..1 and are
   * never quantised until a formatter runs. `clipped` records that the value
   * this colour was built from lay outside sRGB.
   */
  function make(r, g, b, alpha, clipped) {
    return {
      r: clamp01(r),
      g: clamp01(g),
      b: clamp01(b),
      alpha: alpha === undefined ? 1 : clamp01(alpha),
      clipped: clipped === true,
    }
  }

  function outOfGamut(rgb) {
    var tolerance = 1e-6
    return (
      rgb.r < -tolerance ||
      rgb.r > 1 + tolerance ||
      rgb.g < -tolerance ||
      rgb.g > 1 + tolerance ||
      rgb.b < -tolerance ||
      rgb.b > 1 + tolerance
    )
  }

  function fromRgbObject(rgb, alpha) {
    return make(rgb.r, rgb.g, rgb.b, alpha, outOfGamut(rgb))
  }

  // ------------------------------------------------------------------ parsing

  function parseHex(text) {
    var body = text.slice(1)
    if (!/^[0-9a-f]+$/i.test(body)) {
      return null
    }
    var r
    var g
    var b
    var a = 1
    if (body.length === 3 || body.length === 4) {
      r = parseInt(body.charAt(0) + body.charAt(0), 16) / 255
      g = parseInt(body.charAt(1) + body.charAt(1), 16) / 255
      b = parseInt(body.charAt(2) + body.charAt(2), 16) / 255
      if (body.length === 4) {
        a = parseInt(body.charAt(3) + body.charAt(3), 16) / 255
      }
    } else if (body.length === 6 || body.length === 8) {
      r = parseInt(body.slice(0, 2), 16) / 255
      g = parseInt(body.slice(2, 4), 16) / 255
      b = parseInt(body.slice(4, 6), 16) / 255
      if (body.length === 8) {
        a = parseInt(body.slice(6, 8), 16) / 255
      }
    } else {
      return null
    }
    return make(r, g, b, a, false)
  }

  /** Accepts `50%` as 0.5 when a percentage is meaningful for the channel. */
  function component(token, scale) {
    var text = String(token).trim()
    if (text === 'none') {
      return 0
    }
    var percent = text.charAt(text.length - 1) === '%'
    var value = parseFloat(percent ? text.slice(0, -1) : text)
    if (!isFiniteNumber(value)) {
      return null
    }
    if (percent) {
      return (value / 100) * scale
    }
    return value
  }

  function angle(token) {
    var text = String(token).trim().toLowerCase()
    var value = parseFloat(text)
    if (!isFiniteNumber(value)) {
      return null
    }
    if (text.indexOf('turn') !== -1) {
      return value * 360
    }
    // `grad` must be tested before `rad`, because "200grad" contains "rad" and
    // would otherwise be read as 200 radians.
    if (text.indexOf('grad') !== -1) {
      return value * 0.9
    }
    if (text.indexOf('rad') !== -1) {
      return (value * 180) / Math.PI
    }
    return value
  }

  function alphaToken(token) {
    if (token === undefined || token === null || String(token).trim() === '') {
      return 1
    }
    var value = component(token, 1)
    return value === null ? null : clamp01(value)
  }

  function splitArguments(body) {
    // CSS permits both comma and space separated forms, and `/` before alpha.
    var normalized = body.replace(/,/g, ' ').replace(/\//g, ' / ')
    var parts = normalized.split(/\s+/).filter(function (part) {
      return part !== ''
    })
    var slash = parts.indexOf('/')
    if (slash === -1) {
      return { values: parts, alpha: undefined }
    }
    return {
      values: parts.slice(0, slash),
      alpha: parts[slash + 1],
    }
  }

  /**
   * Parses any supported representation. Returns `null` for anything it cannot
   * read, so callers can report the input as invalid without guessing.
   */
  function parse(input) {
    if (input === null || input === undefined) {
      return null
    }
    if (
      typeof input === 'object' &&
      isFiniteNumber(input.r) &&
      isFiniteNumber(input.g) &&
      isFiniteNumber(input.b)
    ) {
      return make(input.r, input.g, input.b, input.alpha, input.clipped)
    }
    var text = String(input).trim().toLowerCase()
    if (text === '') {
      return null
    }
    if (text === 'transparent') {
      return make(0, 0, 0, 0, false)
    }
    if (Object.prototype.hasOwnProperty.call(NAMED, text)) {
      return parseHex(NAMED[text])
    }
    if (text.charAt(0) === '#') {
      return parseHex(text)
    }
    var call = /^([a-z]+)\s*\(([\s\S]*)\)$/.exec(text)
    if (call === null) {
      return null
    }
    var fn = call[1]
    var parts = splitArguments(call[2])
    var values = parts.values
    var alpha = alphaToken(parts.alpha)
    if (alpha === null) {
      return null
    }

    function need(count) {
      return values.length >= count
    }

    if (fn === 'rgb' || fn === 'rgba') {
      if (!need(3)) {
        return null
      }
      var r = component(values[0], 255)
      var g = component(values[1], 255)
      var b = component(values[2], 255)
      if (r === null || g === null || b === null) {
        return null
      }
      var rgbAlpha = values.length > 3 ? alphaToken(values[3]) : alpha
      if (rgbAlpha === null) {
        return null
      }
      return make(r / 255, g / 255, b / 255, rgbAlpha, false)
    }

    if (fn === 'hsl' || fn === 'hsla') {
      if (!need(3)) {
        return null
      }
      var hslH = angle(values[0])
      var hslS = component(values[1], 1)
      var hslL = component(values[2], 1)
      if (hslH === null || hslS === null || hslL === null) {
        return null
      }
      var hslAlpha = values.length > 3 ? alphaToken(values[3]) : alpha
      if (hslAlpha === null) {
        return null
      }
      return fromRgbObject(
        hslToRgb(hslH, clamp01(hslS), clamp01(hslL)),
        hslAlpha
      )
    }

    if (fn === 'hsv' || fn === 'hsb') {
      if (!need(3)) {
        return null
      }
      var hsvH = angle(values[0])
      var hsvS = component(values[1], 1)
      var hsvV = component(values[2], 1)
      if (hsvH === null || hsvS === null || hsvV === null) {
        return null
      }
      return fromRgbObject(hsvToRgb(hsvH, clamp01(hsvS), clamp01(hsvV)), alpha)
    }

    if (fn === 'hwb') {
      if (!need(3)) {
        return null
      }
      var hwbH = angle(values[0])
      var hwbW = component(values[1], 1)
      var hwbB = component(values[2], 1)
      if (hwbH === null || hwbW === null || hwbB === null) {
        return null
      }
      return fromRgbObject(hwbToRgb(hwbH, clamp01(hwbW), clamp01(hwbB)), alpha)
    }

    if (fn === 'cmyk' || fn === 'device-cmyk') {
      if (!need(4)) {
        return null
      }
      var c = component(values[0], 1)
      var m = component(values[1], 1)
      var y = component(values[2], 1)
      var k = component(values[3], 1)
      if (c === null || m === null || y === null || k === null) {
        return null
      }
      return fromRgbObject(
        cmykToRgb(clamp01(c), clamp01(m), clamp01(y), clamp01(k)),
        alpha
      )
    }

    if (fn === 'lab') {
      if (!need(3)) {
        return null
      }
      var labL = component(values[0], 100)
      var labA = component(values[1], 125)
      var labB = component(values[2], 125)
      if (labL === null || labA === null || labB === null) {
        return null
      }
      return fromRgbObject(labToRgb(labL, labA, labB), alpha)
    }

    if (fn === 'lch') {
      if (!need(3)) {
        return null
      }
      var lchL = component(values[0], 100)
      var lchC = component(values[1], 150)
      var lchH = angle(values[2])
      if (lchL === null || lchC === null || lchH === null) {
        return null
      }
      var lab = lchToLab(lchL, lchC, lchH)
      return fromRgbObject(labToRgb(lab.l, lab.a, lab.b), alpha)
    }

    if (fn === 'oklab') {
      if (!need(3)) {
        return null
      }
      var okL = component(values[0], 1)
      var okA = component(values[1], 0.4)
      var okB = component(values[2], 0.4)
      if (okL === null || okA === null || okB === null) {
        return null
      }
      return fromRgbObject(oklabToRgb(okL, okA, okB), alpha)
    }

    if (fn === 'oklch') {
      if (!need(3)) {
        return null
      }
      var oklchL = component(values[0], 1)
      var oklchC = component(values[1], 0.4)
      var oklchH = angle(values[2])
      if (oklchL === null || oklchC === null || oklchH === null) {
        return null
      }
      var oklab = lchToLab(oklchL, oklchC, oklchH)
      return fromRgbObject(oklabToRgb(oklab.l, oklab.a, oklab.b), alpha)
    }

    return null
  }

  // --------------------------------------------------------------- formatting

  function byte(channel) {
    return Math.round(clamp01(channel) * 255)
  }

  function hexPair(channel) {
    var text = byte(channel).toString(16)
    return text.length === 1 ? '0' + text : text
  }

  function toHex(color) {
    return '#' + hexPair(color.r) + hexPair(color.g) + hexPair(color.b)
  }

  function toHex8(color) {
    return toHex(color) + hexPair(color.alpha)
  }

  function toRgbString(color) {
    var base = byte(color.r) + ', ' + byte(color.g) + ', ' + byte(color.b)
    return color.alpha >= 1
      ? 'rgb(' + base + ')'
      : 'rgba(' + base + ', ' + num(color.alpha, 3) + ')'
  }

  function toHslString(color) {
    var hsl = rgbToHsl(color.r, color.g, color.b)
    var base =
      num(hsl.h, 1) +
      'deg ' +
      num(hsl.s * 100, 1) +
      '% ' +
      num(hsl.l * 100, 1) +
      '%'
    return color.alpha >= 1
      ? 'hsl(' + base + ')'
      : 'hsl(' + base + ' / ' + num(color.alpha, 3) + ')'
  }

  function toHsvString(color) {
    var hsv = rgbToHsv(color.r, color.g, color.b)
    return (
      'hsv(' +
      num(hsv.h, 1) +
      'deg ' +
      num(hsv.s * 100, 1) +
      '% ' +
      num(hsv.v * 100, 1) +
      '%)'
    )
  }

  function toHwbString(color) {
    var hwb = rgbToHwb(color.r, color.g, color.b)
    return (
      'hwb(' +
      num(hwb.h, 1) +
      'deg ' +
      num(hwb.w * 100, 1) +
      '% ' +
      num(hwb.b * 100, 1) +
      '%)'
    )
  }

  function toLabString(color) {
    var lab = rgbToLab(color.r, color.g, color.b)
    return (
      'lab(' + num(lab.l, 2) + '% ' + num(lab.a, 2) + ' ' + num(lab.b, 2) + ')'
    )
  }

  function toLchString(color) {
    var lab = rgbToLab(color.r, color.g, color.b)
    var lch = labToLch(lab.l, lab.a, lab.b)
    return (
      'lch(' +
      num(lch.l, 2) +
      '% ' +
      num(lch.c, 2) +
      ' ' +
      num(lch.h, 2) +
      'deg)'
    )
  }

  function toOklabString(color) {
    var oklab = rgbToOklab(color.r, color.g, color.b)
    return (
      'oklab(' +
      num(oklab.l * 100, 2) +
      '% ' +
      num(oklab.a, 4) +
      ' ' +
      num(oklab.b, 4) +
      ')'
    )
  }

  function toOklchString(color) {
    var oklab = rgbToOklab(color.r, color.g, color.b)
    var oklch = labToLch(oklab.l, oklab.a, oklab.b)
    return (
      'oklch(' +
      num(oklch.l * 100, 2) +
      '% ' +
      num(oklch.c, 4) +
      ' ' +
      num(oklch.h, 2) +
      'deg)'
    )
  }

  function toCmykString(color) {
    var cmyk = rgbToCmyk(color.r, color.g, color.b)
    return (
      'cmyk(' +
      num(cmyk.c * 100, 1) +
      '% ' +
      num(cmyk.m * 100, 1) +
      '% ' +
      num(cmyk.y * 100, 1) +
      '% ' +
      num(cmyk.k * 100, 1) +
      '%)'
    )
  }

  /** The CSS name for this exact colour, or `null` when it has none. */
  function toName(color) {
    if (color.alpha < 1) {
      return null
    }
    var name = namedLookup()[toHex(color)]
    return name === undefined ? null : name
  }

  // ---------------------------------------------------------------- contrast

  function relativeLuminance(color) {
    return (
      0.2126 * toLinear(color.r) +
      0.7152 * toLinear(color.g) +
      0.0722 * toLinear(color.b)
    )
  }

  /**
   * WCAG 2.1 contrast ratio. Alpha is composited over `background` first,
   * because a translucent foreground's real contrast depends on what is behind
   * it — reporting the opaque ratio would overstate legibility.
   */
  function contrastRatio(foreground, background) {
    var fg = foreground
    if (fg.alpha < 1) {
      fg = make(
        fg.r * fg.alpha + background.r * (1 - fg.alpha),
        fg.g * fg.alpha + background.g * (1 - fg.alpha),
        fg.b * fg.alpha + background.b * (1 - fg.alpha),
        1,
        false
      )
    }
    var a = relativeLuminance(fg)
    var b = relativeLuminance(background)
    var lighter = Math.max(a, b)
    var darker = Math.min(a, b)
    return (lighter + 0.05) / (darker + 0.05)
  }

  function contrastReport(foreground, background) {
    var ratio = contrastRatio(foreground, background)
    return {
      ratio: round(ratio, 2),
      passesAA: ratio >= 4.5,
      passesAALarge: ratio >= 3,
      passesAAA: ratio >= 7,
      passesAAALarge: ratio >= 4.5,
    }
  }

  // --------------------------------------------------------------- translator

  /**
   * Every representation of one colour, in a stable order. This is the
   * translator the appearance surfaces render: each row is copyable, and each
   * row is also accepted back by `parse`.
   */
  var FORMATS = [
    { id: 'named', label: 'Named', format: toName },
    { id: 'hex', label: 'HEX', format: toHex },
    { id: 'hex8', label: 'HEX8', format: toHex8 },
    { id: 'rgb', label: 'RGB', format: toRgbString },
    { id: 'hsl', label: 'HSL', format: toHslString },
    { id: 'hsv', label: 'HSV / HSB', format: toHsvString },
    { id: 'hwb', label: 'HWB', format: toHwbString },
    { id: 'lab', label: 'CIELAB', format: toLabString },
    { id: 'lch', label: 'LCH', format: toLchString },
    { id: 'oklab', label: 'OKLab', format: toOklabString },
    { id: 'oklch', label: 'OKLCH', format: toOklchString },
    { id: 'cmyk', label: 'CMYK', format: toCmykString },
  ]

  function translate(color) {
    var rows = []
    for (var i = 0; i < FORMATS.length; i++) {
      var entry = FORMATS[i]
      var value = entry.format(color)
      rows.push({
        id: entry.id,
        label: entry.label,
        value: value,
        // A colour with no CSS name is reported as undefined rather than
        // invented, and the row stays visible so the absence is legible.
        defined: value !== null,
      })
    }
    return rows
  }

  /**
   * `space` names the widest space that can hold this colour, so a surface can
   * say "this came from outside sRGB" instead of silently clipping.
   */
  function describe(color) {
    return {
      color: color,
      space: color.clipped ? 'outside sRGB (clipped)' : 'sRGB',
      clipped: color.clipped === true,
      alpha: round(color.alpha, 3),
      rows: translate(color),
    }
  }

  var api = {
    parse: parse,
    make: make,
    translate: translate,
    describe: describe,
    formats: FORMATS,
    toHex: toHex,
    toHex8: toHex8,
    toRgbString: toRgbString,
    toHslString: toHslString,
    toHsvString: toHsvString,
    toHwbString: toHwbString,
    toLabString: toLabString,
    toLchString: toLchString,
    toOklabString: toOklabString,
    toOklchString: toOklchString,
    toCmykString: toCmykString,
    toName: toName,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    rgbToHwb: rgbToHwb,
    hwbToRgb: hwbToRgb,
    rgbToLab: rgbToLab,
    labToRgb: labToRgb,
    labToLch: labToLch,
    lchToLab: lchToLab,
    rgbToOklab: rgbToOklab,
    oklabToRgb: oklabToRgb,
    rgbToCmyk: rgbToCmyk,
    cmykToRgb: cmykToRgb,
    contrastRatio: contrastRatio,
    contrastReport: contrastReport,
    relativeLuminance: relativeLuminance,
    named: NAMED,
  }

  if (typeof module === 'object' && module !== null && module.exports) {
    module.exports = api
  }
  global.DocsColor = api
})(typeof window === 'undefined' ? globalThis : window)
