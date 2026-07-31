import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require_ = createRequire(import.meta.url)

interface IColor {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
  readonly clipped: boolean
}

interface ITranslationRow {
  readonly id: string
  readonly label: string
  readonly value: string | null
  readonly defined: boolean
}

interface IColorApi {
  parse(input: unknown): IColor | null
  make(r: number, g: number, b: number, alpha?: number): IColor
  translate(color: IColor): ReadonlyArray<ITranslationRow>
  describe(color: IColor): {
    readonly space: string
    readonly clipped: boolean
    readonly alpha: number
    readonly rows: ReadonlyArray<ITranslationRow>
  }
  toHex(color: IColor): string
  toHex8(color: IColor): string
  toRgbString(color: IColor): string
  toHslString(color: IColor): string
  toHsvString(color: IColor): string
  toHwbString(color: IColor): string
  toLabString(color: IColor): string
  toLchString(color: IColor): string
  toOklabString(color: IColor): string
  toOklchString(color: IColor): string
  toCmykString(color: IColor): string
  toName(color: IColor): string | null
  contrastRatio(foreground: IColor, background: IColor): number
  contrastReport(
    foreground: IColor,
    background: IColor
  ): {
    readonly ratio: number
    readonly passesAA: boolean
    readonly passesAALarge: boolean
    readonly passesAAA: boolean
    readonly passesAAALarge: boolean
  }
  formats: ReadonlyArray<{ readonly id: string }>
}

const Color: IColorApi = require_(
  join(process.cwd(), 'docs', 'assets', 'site', 'docs-color.js')
)

function parsed(input: string): IColor {
  const color = Color.parse(input)
  assert.notEqual(color, null, `expected ${input} to parse`)
  return color as IColor
}

/** Compare as 8-bit so a round trip is judged the way a screen shows it. */
function bytes(color: IColor): [number, number, number] {
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
  ]
}

describe('documentation-hub colour engine', () => {
  it('reads every supported input format', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['#4f46e5', '#4f46e5'],
      ['#4F46E5', '#4f46e5'],
      ['#fff', '#ffffff'],
      ['#ffff', '#ffffff'],
      ['rebeccapurple', '#663399'],
      ['rgb(79, 70, 229)', '#4f46e5'],
      ['rgb(79 70 229)', '#4f46e5'],
      ['rgba(79, 70, 229, 0.5)', '#4f46e5'],
      ['rgb(31% 27.5% 89.8%)', '#4f46e5'],
      ['hsl(243.4deg 75.4% 58.6%)', '#4f46e5'],
      ['hsl(243.4 75.4% 58.6% / 0.5)', '#4f46e5'],
      ['hsv(243.4deg 69.4% 89.8%)', '#4f46e5'],
      ['hsb(243.4deg 69.4% 89.8%)', '#4f46e5'],
      ['hwb(243.4deg 27.5% 10.2%)', '#4f46e5'],
      ['cmyk(65.5% 69.4% 0% 10.2%)', '#4f46e5'],
    ]
    for (const [input, expected] of cases) {
      assert.equal(
        Color.toHex(parsed(input)),
        expected,
        `${input} should read as ${expected}`
      )
    }
  })

  it('reads perceptual spaces and angle units', () => {
    // Pure sRGB red expressed four ways; each must land back on #ff0000.
    for (const input of [
      'lab(53.24% 80.09 67.2)',
      'lch(53.24% 104.55 40deg)',
      'oklab(62.8% 0.2249 0.1258)',
      'oklch(62.8% 0.2577 29.23deg)',
    ]) {
      assert.equal(Color.toHex(parsed(input)), '#ff0000', input)
    }
    // 0.5turn and 200grad are both 180deg.
    assert.equal(
      Color.toHex(parsed('hsl(0.5turn 100% 50%)')),
      Color.toHex(parsed('hsl(180deg 100% 50%)'))
    )
    assert.equal(
      Color.toHex(parsed('hsl(200grad 100% 50%)')),
      Color.toHex(parsed('hsl(180deg 100% 50%)'))
    )
    assert.equal(
      Color.toHex(parsed('hsl(3.14159rad 100% 50%)')),
      Color.toHex(parsed('hsl(180deg 100% 50%)'))
    )
  })

  it('rejects malformed input instead of guessing a colour', () => {
    for (const input of [
      '',
      '   ',
      'not-a-colour',
      '#12345',
      '#gggggg',
      'rgb(1, 2)',
      'hsl(10deg 50%)',
      'cmyk(1 2 3)',
      'lab(50%)',
      'oklch()',
      'rgb(1, 2, three)',
    ]) {
      assert.equal(Color.parse(input), null, `${input} must not parse`)
    }
    assert.equal(Color.parse(null), null)
    assert.equal(Color.parse(undefined), null)
  })

  it('round-trips every writable format back through the parser', () => {
    const samples = ['#4f46e5', '#000000', '#ffffff', '#ff0000', '#7fbf3f']
    const writers: ReadonlyArray<(color: IColor) => string> = [
      Color.toHex,
      Color.toHex8,
      Color.toRgbString,
      Color.toHslString,
      Color.toHsvString,
      Color.toHwbString,
      Color.toLabString,
      Color.toLchString,
      Color.toOklabString,
      Color.toOklchString,
      Color.toCmykString,
    ]
    for (const sample of samples) {
      const original = parsed(sample)
      for (const write of writers) {
        const text = write(original)
        const again = parsed(text)
        const [ar, ag, ab] = bytes(original)
        const [br, bg, bb] = bytes(again)
        // One 8-bit step of tolerance: the formatters quantise on purpose.
        assert.ok(
          Math.abs(ar - br) <= 1 &&
            Math.abs(ag - bg) <= 1 &&
            Math.abs(ab - bb) <= 1,
          `${sample} through ${text} drifted to ${Color.toHex(again)}`
        )
      }
    }
  })

  it('preserves alpha across the formats that carry it', () => {
    const translucent = parsed('rgba(79, 70, 229, 0.4)')
    assert.equal(Math.round(translucent.alpha * 100), 40)
    assert.equal(Color.toHex8(translucent), '#4f46e566')
    assert.equal(Math.round(parsed('#4f46e566').alpha * 100), 40)
    assert.match(Color.toRgbString(translucent), /^rgba\(/)
    assert.match(Color.toHslString(translucent), / \/ 0\.4\)$/)
    // An opaque colour must not gain a redundant alpha term.
    assert.equal(Color.toRgbString(parsed('#4f46e5')), 'rgb(79, 70, 229)')
    assert.equal(Color.parse('transparent')?.alpha, 0)
  })

  it('names a colour only when CSS actually defines one', () => {
    assert.equal(Color.toName(parsed('#663399')), 'rebeccapurple')
    assert.equal(Color.toName(parsed('#ff0000')), 'red')
    assert.equal(Color.toName(parsed('#4f46e5')), null)
    // A translucent colour has no CSS name, even at a named hex.
    assert.equal(Color.toName(parsed('#ff000080')), null)
  })

  it('reports a colour from outside sRGB as clipped rather than pretending', () => {
    const wide = parsed('oklch(90% 0.35 150deg)')
    assert.equal(wide.clipped, true)
    assert.equal(Color.describe(wide).space, 'outside sRGB (clipped)')
    const inside = parsed('#4f46e5')
    assert.equal(inside.clipped, false)
    assert.equal(Color.describe(inside).space, 'sRGB')
  })

  it('translates one colour into every row, flagging the undefined name', () => {
    const rows = Color.translate(parsed('#4f46e5'))
    assert.equal(rows.length, Color.formats.length)
    assert.equal(rows.length, 12)
    const ids = rows.map(row => row.id)
    assert.deepEqual(ids, [
      'named',
      'hex',
      'hex8',
      'rgb',
      'hsl',
      'hsv',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'cmyk',
    ])
    const named = rows.find(row => row.id === 'named')
    // The row stays present so the absence of a name is legible, not hidden.
    assert.equal(named?.defined, false)
    assert.equal(named?.value, null)
    for (const row of rows.filter(candidate => candidate.id !== 'named')) {
      assert.equal(row.defined, true, `${row.id} must be defined`)
      assert.ok(
        typeof row.value === 'string' && row.value.length > 0,
        `${row.id} must format`
      )
    }
  })

  it('computes WCAG contrast and composites alpha over the backdrop first', () => {
    const white = parsed('#ffffff')
    const black = parsed('#000000')
    assert.equal(Color.contrastRatio(white, black), 21)
    assert.equal(Color.contrastRatio(white, white), 1)

    const report = Color.contrastReport(parsed('#767676'), white)
    assert.ok(report.ratio >= 4.5, `expected AA, got ${report.ratio}`)
    assert.equal(report.passesAA, true)
    assert.equal(report.passesAAA, false)

    // A 50%-alpha black over white must read as mid-grey, not as pure black.
    const half = parsed('rgba(0, 0, 0, 0.5)')
    const composited = Color.contrastRatio(half, white)
    assert.ok(
      composited > 1 && composited < 21,
      `translucent contrast should be composited, got ${composited}`
    )
    assert.ok(
      Math.abs(composited - Color.contrastRatio(parsed('#808080'), white)) <
        0.35,
      'a half-alpha black should contrast about like mid grey'
    )
  })

  it('keeps greyscale and achromatic edges stable', () => {
    for (const hex of ['#000000', '#ffffff', '#808080']) {
      const color = parsed(hex)
      assert.equal(Color.toHex(parsed(Color.toHslString(color))), hex)
      assert.equal(Color.toHex(parsed(Color.toHwbString(color))), hex)
      assert.equal(Color.toHex(parsed(Color.toCmykString(color))), hex)
    }
    // hwb with whiteness + blackness over 1 is achromatic by definition.
    const over = parsed('hwb(120deg 70% 70%)')
    const [r, g, b] = bytes(over)
    assert.equal(r, g)
    assert.equal(g, b)
  })

  it('clamps out-of-range numeric input instead of throwing', () => {
    assert.equal(Color.toHex(parsed('rgb(300, -20, 128)')), '#ff0080')
    assert.equal(Color.toHex(parsed('hsl(720deg 500% 50%)')), '#ff0000')
    assert.equal(parsed('rgba(0, 0, 0, 5)').alpha, 1)
    assert.equal(parsed('rgba(0, 0, 0, -1)').alpha, 0)
  })
})
