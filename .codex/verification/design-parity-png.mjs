import zlib from 'node:zlib'

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export const PNG_LIMITS = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxDimension: 8192,
  maxCanvasDimension: 17000,
  maxInputPixels: 12_000_000,
  maxCanvasPixels: 26_000_000,
})

const CrcTable = new Uint32Array(256)
for (let value = 0; value < CrcTable.length; value += 1) {
  let current = value
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) === 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
  }
  CrcTable[value] = current >>> 0
}

function fail(label, message) {
  throw new Error(label + ': ' + message)
}

function checkedProduct(values, label, maximum = Number.MAX_SAFE_INTEGER) {
  let product = 1
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) fail(label, 'unsafe size')
    product *= value
    if (!Number.isSafeInteger(product) || product > maximum) {
      fail(label, 'size exceeds the bounded limit')
    }
  }
  return product
}

function crc32Parts(parts) {
  let crc = 0xffffffff
  for (const part of parts) {
    for (const byte of part) crc = CrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function assertPngDimensions(
  width,
  height,
  label,
  pixelLimit,
  dimensionLimit = PNG_LIMITS.maxDimension
) {
  if (!Number.isSafeInteger(width) || width < 1 || width > dimensionLimit) {
    fail(label, 'width must be from 1 through ' + dimensionLimit)
  }
  if (!Number.isSafeInteger(height) || height < 1 || height > dimensionLimit) {
    fail(label, 'height must be from 1 through ' + dimensionLimit)
  }
  checkedProduct([width, height], label + ' pixels', pixelLimit)
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function unfilterScanlines(inflated, width, height, bytesPerPixel, label) {
  const rowBytes = checkedProduct([width, bytesPerPixel], label + ' row')
  const expectedLength = checkedProduct([rowBytes + 1, height], label + ' scanlines')
  if (inflated.length !== expectedLength) {
    fail(label, 'inflated bytes do not match IHDR dimensions')
  }

  const output = Buffer.alloc(checkedProduct([rowBytes, height], label + ' decoded'))
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    if (filter > 4) fail(label, 'unsupported PNG filter ' + filter)
    const rowOffset = y * rowBytes
    const priorOffset = rowOffset - rowBytes
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = inflated[sourceOffset]
      sourceOffset += 1
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0
      const up = y > 0 ? output[priorOffset + x] : 0
      const upLeft = y > 0 && x >= bytesPerPixel ? output[priorOffset + x - bytesPerPixel] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      if (filter === 2) predictor = up
      if (filter === 3) predictor = Math.floor((left + up) / 2)
      if (filter === 4) predictor = paethPredictor(left, up, upLeft)
      output[rowOffset + x] = (encoded + predictor) & 0xff
    }
  }
  return output
}

export function decodePng(input, label = 'PNG') {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (bytes.length > PNG_LIMITS.maxFileBytes) fail(label, 'file exceeds 64 MiB')
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(label, 'invalid PNG signature')
  }

  let offset = PNG_SIGNATURE.length
  let chunkIndex = 0
  let ihdr = null
  let seenPalette = false
  let seenIdat = false
  let idatEnded = false
  let seenIend = false
  const idatParts = []

  while (offset < bytes.length) {
    if (seenIend) fail(label, 'trailing bytes after IEND')
    if (bytes.length - offset < 12) fail(label, 'truncated PNG chunk header')
    const length = bytes.readUInt32BE(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) {
      fail(label, 'PNG chunk exceeds file bounds')
    }
    const typeBytes = bytes.subarray(offset + 4, offset + 8)
    const type = typeBytes.toString('ascii')
    if (!/^[A-Za-z]{4}$/.test(type)) fail(label, 'invalid PNG chunk type')
    const data = bytes.subarray(dataStart, dataEnd)
    const expectedCrc = bytes.readUInt32BE(dataEnd)
    const actualCrc = crc32Parts([typeBytes, data])
    if (expectedCrc !== actualCrc) fail(label, type + ' CRC mismatch')

    if (type === 'IHDR') {
      if (chunkIndex !== 0 || ihdr !== null || length !== 13) {
        fail(label, 'IHDR must be the first unique 13-byte chunk')
      }
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
      assertPngDimensions(
        ihdr.width,
        ihdr.height,
        label,
        PNG_LIMITS.maxInputPixels
      )
      if (ihdr.bitDepth !== 8 || ![2, 6].includes(ihdr.colorType)) {
        fail(label, 'only non-paletted 8-bit RGB and RGBA PNGs are supported')
      }
      if (ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) {
        fail(label, 'unsupported compression, filter method, or interlace mode')
      }
    } else {
      if (ihdr === null) fail(label, 'chunk appears before IHDR')
      if (type === 'PLTE') {
        if (seenPalette || seenIdat || length === 0 || length % 3 !== 0 || length > 768) {
          fail(label, 'invalid PLTE chunk')
        }
        seenPalette = true
      } else if (type === 'IDAT') {
        if (idatEnded) fail(label, 'IDAT chunks must be consecutive')
        seenIdat = true
        idatParts.push(data)
      } else if (type === 'IEND') {
        if (!seenIdat || length !== 0) fail(label, 'invalid IEND chunk')
        seenIend = true
      } else {
        if (seenIdat) idatEnded = true
        if (['tRNS', 'acTL', 'fcTL', 'fdAT', 'iCCP', 'gAMA', 'cHRM', 'sBIT'].includes(type)) {
          fail(label, 'unsupported transparency, animation, or color-profile chunk ' + type)
        }
        const critical = (typeBytes[0] & 0x20) === 0
        if (critical) fail(label, 'unsupported critical chunk ' + type)
      }
    }

    offset = chunkEnd
    chunkIndex += 1
  }

  if (ihdr === null || !seenIdat || !seenIend) {
    fail(label, 'PNG must contain IHDR, IDAT, and IEND')
  }
  if (offset !== bytes.length) fail(label, 'PNG parser did not consume the file')

  const bytesPerPixel = ihdr.colorType === 6 ? 4 : 3
  const rowBytes = checkedProduct([ihdr.width, bytesPerPixel], label + ' row')
  const expectedInflated = checkedProduct(
    [rowBytes + 1, ihdr.height],
    label + ' inflated'
  )
  const compressed = Buffer.concat(idatParts)
  let inflated
  try {
    const result = zlib.inflateSync(compressed, {
      info: true,
      maxOutputLength: expectedInflated,
    })
    inflated = result.buffer
    if (result.engine.bytesWritten !== compressed.length) {
      fail(label, 'zlib stream did not consume every IDAT byte')
    }
  } catch (error) {
    if (error.message.includes(label + ':')) throw error
    fail(label, 'zlib decode failed: ' + error.message)
  }
  const decoded = unfilterScanlines(
    inflated,
    ihdr.width,
    ihdr.height,
    bytesPerPixel,
    label
  )
  const rgba = Buffer.alloc(
    checkedProduct([ihdr.width, ihdr.height, 4], label + ' RGBA')
  )
  if (bytesPerPixel === 4) {
    decoded.copy(rgba)
  } else {
    for (let source = 0, target = 0; source < decoded.length; source += 3, target += 4) {
      rgba[target] = decoded[source]
      rgba[target + 1] = decoded[source + 1]
      rgba[target + 2] = decoded[source + 2]
      rgba[target + 3] = 255
    }
  }

  return Object.freeze({
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colorType: ihdr.colorType,
    rgba,
  })
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32Parts([typeBytes, data]), data.length + 8)
  return chunk
}

export function encodeRgbaPng(width, height, rgba, options = {}) {
  const pixelLimit = options.pixelLimit ?? PNG_LIMITS.maxCanvasPixels
  const dimensionLimit = options.dimensionLimit ?? PNG_LIMITS.maxCanvasDimension
  assertPngDimensions(width, height, 'encoded PNG', pixelLimit, dimensionLimit)
  const expectedBytes = checkedProduct([width, height, 4], 'encoded PNG RGBA')
  if (!Buffer.isBuffer(rgba) || rgba.length !== expectedBytes) {
    fail('encoded PNG', 'RGBA byte length does not match dimensions')
  }

  const rowBytes = width * 4
  const scanlines = Buffer.alloc((rowBytes + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const target = y * (rowBytes + 1)
    scanlines[target] = 0
    rgba.copy(scanlines, target + 1, y * rowBytes, (y + 1) * rowBytes)
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  if (png.length > PNG_LIMITS.maxFileBytes) {
    fail('encoded PNG', 'output exceeds the 64 MiB evidence limit')
  }
  return png
}

function assertOpaqueImage(image, label) {
  for (let offset = 3; offset < image.rgba.length; offset += 4) {
    if (image.rgba[offset] !== 255) {
      fail(label, 'capture contains transparency; evidence captures must be opaque')
    }
  }
}

export function calculatePixelDiff(reference, production) {
  if (reference.width !== production.width || reference.height !== production.height) {
    fail('visual diff', 'input dimensions do not match')
  }
  assertOpaqueImage(reference, 'reference PNG')
  assertOpaqueImage(production, 'production PNG')
  const pixelCount = checkedProduct(
    [reference.width, reference.height],
    'visual diff pixels',
    PNG_LIMITS.maxInputPixels
  )
  let differentPixelCount = 0
  let totalAbsoluteChannelDelta = 0
  let maximumChannelDelta = 0
  let left = reference.width
  let top = reference.height
  let right = -1
  let bottom = -1

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4
    let different = false
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(reference.rgba[offset + channel] - production.rgba[offset + channel])
      if (delta !== 0) different = true
      totalAbsoluteChannelDelta += delta
      if (delta > maximumChannelDelta) maximumChannelDelta = delta
    }
    if (!different) continue
    differentPixelCount += 1
    const x = pixel % reference.width
    const y = Math.floor(pixel / reference.width)
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }

  const changedBounds =
    differentPixelCount === 0
      ? null
      : {
          left,
          top,
          right,
          bottom,
          width: right - left + 1,
          height: bottom - top + 1,
        }
  return Object.freeze({
    comparedPixelCount: pixelCount,
    differentPixelCount,
    differentPixelFraction: Object.freeze({
      numerator: differentPixelCount,
      denominator: pixelCount,
    }),
    differentPixelRatio: Number((differentPixelCount / pixelCount).toFixed(12)),
    changedBounds,
    totalAbsoluteChannelDelta,
    maximumChannelDelta,
  })
}

function fillRect(rgba, canvasWidth, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * canvasWidth + column) * 4
      rgba[offset] = color[0]
      rgba[offset + 1] = color[1]
      rgba[offset + 2] = color[2]
      rgba[offset + 3] = color[3]
    }
  }
}

function compositeImage(target, targetWidth, image, x, y) {
  for (let row = 0; row < image.height; row += 1) {
    for (let column = 0; column < image.width; column += 1) {
      const sourceOffset = (row * image.width + column) * 4
      const targetOffset = ((y + row) * targetWidth + x + column) * 4
      const alpha = image.rgba[sourceOffset + 3]
      if (alpha === 255) {
        image.rgba.copy(target, targetOffset, sourceOffset, sourceOffset + 4)
        continue
      }
      const inverse = 255 - alpha
      for (let channel = 0; channel < 3; channel += 1) {
        target[targetOffset + channel] = Math.round(
          (image.rgba[sourceOffset + channel] * alpha +
            target[targetOffset + channel] * inverse) /
            255
        )
      }
      target[targetOffset + 3] = 255
    }
  }
}

const Font = Object.freeze({
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
})

function drawLabel(rgba, canvasWidth, text, x, y, scale) {
  let cursor = x
  for (const character of text) {
    const glyph = Font[character]
    if (!glyph) fail('comparison label', 'missing glyph ' + character)
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue
        fillRect(
          rgba,
          canvasWidth,
          cursor + column * scale,
          y + row * scale,
          scale,
          scale,
          [255, 255, 255, 255]
        )
      }
    }
    cursor += 6 * scale
  }
}

export function createSideBySideComparison(reference, production) {
  if (reference.width !== production.width || reference.height !== production.height) {
    fail('comparison', 'input dimensions do not match')
  }
  assertOpaqueImage(reference, 'reference PNG')
  assertOpaqueImage(production, 'production PNG')
  const labelScale = 2
  const widestLabelPixels = 'PRODUCTION'.length * 6 * labelScale
  if (reference.width < widestLabelPixels + 24) {
    fail('comparison', 'capture width is too narrow for the required visible labels')
  }
  const padding = 16
  const gap = 16
  const headerHeight = 40
  const headerToImageGap = 8
  const width = reference.width * 2 + padding * 2 + gap
  const height = padding * 2 + headerHeight + headerToImageGap + reference.height
  assertPngDimensions(
    width,
    height,
    'comparison canvas',
    PNG_LIMITS.maxCanvasPixels,
    PNG_LIMITS.maxCanvasDimension
  )
  const rgba = Buffer.alloc(width * height * 4)
  fillRect(rgba, width, 0, 0, width, height, [30, 30, 34, 255])
  const referenceX = padding
  const productionX = padding + reference.width + gap
  const headerY = padding
  const imageY = padding + headerHeight + headerToImageGap
  fillRect(rgba, width, referenceX, headerY, reference.width, headerHeight, [0, 95, 184, 255])
  fillRect(rgba, width, productionX, headerY, production.width, headerHeight, [103, 80, 164, 255])
  drawLabel(rgba, width, 'REFERENCE', referenceX + 12, headerY + 13, labelScale)
  drawLabel(rgba, width, 'PRODUCTION', productionX + 12, headerY + 13, labelScale)
  compositeImage(rgba, width, reference, referenceX, imageY)
  compositeImage(rgba, width, production, productionX, imageY)
  return Object.freeze({
    png: encodeRgbaPng(width, height, rgba),
    width,
    height,
    layout: Object.freeze({
      labels: Object.freeze({ reference: 'REFERENCE', production: 'PRODUCTION' }),
      padding,
      gap,
      headerHeight,
      headerToImageGap,
    }),
  })
}
