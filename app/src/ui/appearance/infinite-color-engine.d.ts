export interface IInfiniteColor {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
  readonly clipped: boolean
}

export interface IInfiniteColorTranslation {
  readonly id: string
  readonly label: string
  readonly value: string | null
  readonly defined: boolean
}

export interface IInfiniteColorContrastReport {
  readonly ratio: number
  readonly passesAA: boolean
  readonly passesAALarge: boolean
  readonly passesAAA: boolean
  readonly passesAAALarge: boolean
}

export interface IInfiniteColorEngine {
  readonly formats: ReadonlyArray<{
    readonly id: string
    readonly label: string
  }>
  parse(input: unknown): IInfiniteColor | null
  make(
    r: number,
    g: number,
    b: number,
    alpha?: number,
    clipped?: boolean
  ): IInfiniteColor
  translate(color: IInfiniteColor): ReadonlyArray<IInfiniteColorTranslation>
  describe(color: IInfiniteColor): {
    readonly space: string
    readonly clipped: boolean
    readonly alpha: number
    readonly rows: ReadonlyArray<IInfiniteColorTranslation>
  }
  toHex(color: IInfiniteColor): string
  toHex8(color: IInfiniteColor): string
  toRgbString(color: IInfiniteColor): string
  toHslString(color: IInfiniteColor): string
  toHsvString(color: IInfiniteColor): string
  toHwbString(color: IInfiniteColor): string
  toLabString(color: IInfiniteColor): string
  toLchString(color: IInfiniteColor): string
  toOklabString(color: IInfiniteColor): string
  toOklchString(color: IInfiniteColor): string
  toCmykString(color: IInfiniteColor): string
  toName(color: IInfiniteColor): string | null
  rgbToHsv(r: number, g: number, b: number): {
    readonly h: number
    readonly s: number
    readonly v: number
  }
  hsvToRgb(h: number, s: number, v: number): {
    readonly r: number
    readonly g: number
    readonly b: number
  }
  contrastRatio(
    foreground: IInfiniteColor,
    background: IInfiniteColor
  ): number
  contrastReport(
    foreground: IInfiniteColor,
    background: IInfiniteColor
  ): IInfiniteColorContrastReport
}

declare const engine: IInfiniteColorEngine
export = engine
