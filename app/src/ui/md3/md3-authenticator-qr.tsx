import * as React from 'react'
import classNames from 'classnames'

import {
  encodeQr,
  IQrMatrix,
  QrEncodeError,
  QrQuietZoneModules,
} from '../../lib/authenticator/qr-encode'

/**
 * The pairing QR, drawn as SVG rectangles from a matrix this process encoded.
 *
 * Three things about it are load-bearing rather than stylistic.
 *
 * **It is never themed.** The modules are `#000000` on `#ffffff` in both light
 * and dark mode, painted on the component's own white plate rather than on the
 * surface behind it. A QR tinted to match a dark theme is a QR that scanners
 * refuse, and the failure looks like a broken camera rather than a styling
 * decision.
 *
 * **The quiet zone is real.** Four light modules on every side, inside the
 * plate, exactly as ISO/IEC 18004 requires. A symbol rendered flush to the
 * edge of a card is the single most common reason a hand-rolled QR "does not
 * scan".
 *
 * **It has a text alternative that says what it is and what it pairs**, not
 * `alt="QR code"`. Somebody who cannot see it still has the grouped base32
 * beside it, and the alternative is what tells them the two are the same
 * thing.
 */

/** The smallest module the component will render, in CSS pixels. */
export const MinimumQrModulePixels = 3

/** The rendered edge length the surface asks for by default. */
export const DefaultQrPixelSize = 232

export interface IMd3AuthenticatorQrProps {
  /** The text to encode — an `otpauth://totp/` URI. */
  readonly value: string

  /**
   * The accessible description. Required, and required to be a sentence about
   * this particular pairing rather than the words "QR code".
   */
  readonly alternativeText: string

  /** The requested edge length in CSS pixels, quiet zone included. */
  readonly pixelSize?: number

  /** Rendered instead of the symbol when the value cannot be encoded. */
  readonly onEncodeFailed?: (message: string) => void

  readonly className?: string
}

interface IQrRender {
  readonly matrix: IQrMatrix | null
  readonly error: string | null
}

function encode(value: string): IQrRender {
  try {
    return { matrix: encodeQr(value), error: null }
  } catch (error) {
    return {
      matrix: null,
      error:
        error instanceof QrEncodeError
          ? error.message
          : error instanceof Error
          ? error.message
          : String(error),
    }
  }
}

export function Md3AuthenticatorQr(props: IMd3AuthenticatorQrProps) {
  const { value, onEncodeFailed } = props

  const render = React.useMemo(() => encode(value), [value])

  React.useEffect(() => {
    if (render.error !== null) {
      onEncodeFailed?.(render.error)
    }
  }, [render.error, onEncodeFailed])

  if (render.matrix === null) {
    return null
  }

  const matrix = render.matrix
  const gridSize = matrix.size + QrQuietZoneModules * 2
  // Never render below the legibility floor, even when the caller asked for a
  // smaller box: a symbol scaled to two pixels per module is decoration.
  const pixelSize = Math.max(
    gridSize * MinimumQrModulePixels,
    props.pixelSize ?? DefaultQrPixelSize
  )

  const rectangles: Array<React.ReactElement> = []
  for (let row = 0; row < matrix.size; row++) {
    // Merge horizontal runs into one rect apiece. A version-10 symbol is 57×57
    // modules, and one element per dark module is a few thousand nodes for a
    // picture that never changes.
    let runStart: number | null = null
    for (let column = 0; column <= matrix.size; column++) {
      const dark = column < matrix.size && matrix.modules[row][column]
      if (dark && runStart === null) {
        runStart = column
      } else if (!dark && runStart !== null) {
        rectangles.push(
          <rect
            key={`${row}-${runStart}`}
            x={runStart + QrQuietZoneModules}
            y={row + QrQuietZoneModules}
            width={column - runStart}
            height={1}
          />
        )
        runStart = null
      }
    }
  }

  return (
    <svg
      className={classNames('md3-auth-qr', props.className)}
      role="img"
      aria-label={props.alternativeText}
      width={pixelSize}
      height={pixelSize}
      viewBox={`0 0 ${gridSize} ${gridSize}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={gridSize} height={gridSize} fill="#ffffff" />
      <g fill="#000000">{rectangles}</g>
    </svg>
  )
}
