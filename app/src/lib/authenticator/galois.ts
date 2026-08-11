/**
 * GF(256) arithmetic and Reed–Solomon coding for the in-process QR codec.
 *
 * The field is the one ISO/IEC 18004 specifies: the primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11d), generator α = 2. The encoder needs
 * multiplication and the generator polynomials; the decoder additionally needs
 * syndromes, Berlekamp–Massey, Chien search and Forney, which is why they live
 * together rather than being duplicated on either side.
 */

const FieldSize = 256
const Primitive = 0x11d

const Exponent = new Uint8Array(FieldSize * 2)
const Logarithm = new Uint8Array(FieldSize)

{
  let value = 1
  for (let index = 0; index < FieldSize - 1; index++) {
    Exponent[index] = value
    Logarithm[value] = index
    value <<= 1
    if (value >= FieldSize) {
      value ^= Primitive
    }
  }
  // A doubled exponent table removes the modulo from every multiply.
  for (let index = FieldSize - 1; index < Exponent.length; index++) {
    Exponent[index] = Exponent[index - (FieldSize - 1)]
  }
}

/** Multiply in GF(256). Zero is absorbing, which the log table cannot express. */
export function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) {
    return 0
  }
  return Exponent[Logarithm[left] + Logarithm[right]]
}

/** Divide in GF(256). */
export function gfDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error('Division by zero in GF(256)')
  }
  if (numerator === 0) {
    return 0
  }
  return Exponent[(Logarithm[numerator] - Logarithm[denominator] + 255) % 255]
}

/** α raised to a power, with the exponent reduced into range. */
export function gfExponent(power: number): number {
  return Exponent[((power % 255) + 255) % 255]
}

/** The discrete log of a non-zero element. */
export function gfLogarithm(value: number): number {
  if (value === 0) {
    throw new Error('Logarithm of zero in GF(256)')
  }
  return Logarithm[value]
}

/**
 * Multiply two polynomials, most-significant coefficient first.
 */
export function polynomialMultiply(
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>
): Array<number> {
  const product = new Array<number>(left.length + right.length - 1).fill(0)
  for (let i = 0; i < left.length; i++) {
    if (left[i] === 0) {
      continue
    }
    for (let j = 0; j < right.length; j++) {
      product[i + j] ^= gfMultiply(left[i], right[j])
    }
  }
  return product
}

const generatorCache = new Map<number, ReadonlyArray<number>>()

/**
 * The Reed–Solomon generator polynomial of the given degree: the product of
 * (x - α^i) for i in 0..degree-1.
 */
export function generatorPolynomial(degree: number): ReadonlyArray<number> {
  const cached = generatorCache.get(degree)
  if (cached !== undefined) {
    return cached
  }

  let polynomial: Array<number> = [1]
  for (let index = 0; index < degree; index++) {
    polynomial = polynomialMultiply(polynomial, [1, gfExponent(index)])
  }
  generatorCache.set(degree, polynomial)
  return polynomial
}

/**
 * The `degree` error-correction codewords for a block of data codewords.
 */
export function reedSolomonEncode(
  data: ReadonlyArray<number>,
  degree: number
): Array<number> {
  const generator = generatorPolynomial(degree)
  const remainder = new Array<number>(degree).fill(0)

  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.shift()
    remainder.push(0)
    if (factor !== 0) {
      for (let index = 0; index < degree; index++) {
        remainder[index] ^= gfMultiply(generator[index + 1], factor)
      }
    }
  }

  return remainder
}

/**
 * Correct up to `degree / 2` errors in a received block, in place on a copy.
 *
 * Returns the corrected codewords, or `null` when the block carries more
 * damage than the code can repair. Returning `null` rather than a best guess
 * matters: a mis-corrected block decodes into a plausible-looking secret that
 * produces codes nobody accepts, which is the exact failure this whole module
 * exists to keep out of the vault.
 */
export function reedSolomonDecode(
  received: ReadonlyArray<number>,
  degree: number
): Array<number> | null {
  const codewords = [...received]

  // Syndromes: the received polynomial evaluated at α^0 .. α^(degree-1).
  const syndromes = new Array<number>(degree).fill(0)
  let hasError = false
  for (let index = 0; index < degree; index++) {
    let value = 0
    for (const codeword of codewords) {
      value = gfMultiply(value, gfExponent(index)) ^ codeword
    }
    syndromes[index] = value
    if (value !== 0) {
      hasError = true
    }
  }

  if (!hasError) {
    return codewords
  }

  // Berlekamp–Massey, coefficients least-significant first. `locatorDegree` is
  // tracked explicitly rather than read off the array length: a locator whose
  // top coefficients cancel to zero still has the degree the algorithm
  // assigned it, and inferring degree from length quietly corrupts the next
  // round's discrepancy.
  let errorLocator = [1]
  let previous = [1]
  let locatorDegree = 0
  let shift = 1
  let lastDiscrepancy = 1

  for (let round = 0; round < degree; round++) {
    let discrepancy = syndromes[round]
    for (let index = 1; index <= locatorDegree; index++) {
      discrepancy ^= gfMultiply(
        errorLocator[index] ?? 0,
        syndromes[round - index]
      )
    }

    if (discrepancy === 0) {
      shift++
      continue
    }

    const scaled = gfDivide(discrepancy, lastDiscrepancy)
    const candidate = [...errorLocator]
    while (candidate.length < previous.length + shift) {
      candidate.push(0)
    }
    for (let index = 0; index < previous.length; index++) {
      candidate[index + shift] ^= gfMultiply(scaled, previous[index])
    }

    if (2 * locatorDegree <= round) {
      const supplanted = errorLocator
      errorLocator = candidate
      previous = supplanted
      locatorDegree = round + 1 - locatorDegree
      lastDiscrepancy = discrepancy
      shift = 1
    } else {
      errorLocator = candidate
      shift++
    }
  }

  if (locatorDegree === 0 || locatorDegree * 2 > degree) {
    return null
  }

  // Chien search: the roots of the locator are the inverse error positions.
  const positions: Array<number> = []
  for (let index = 0; index < codewords.length; index++) {
    const inverseLog = (255 - ((codewords.length - 1 - index) % 255)) % 255
    let value = 0
    for (let power = 0; power <= locatorDegree; power++) {
      value ^= gfMultiply(
        errorLocator[power] ?? 0,
        gfExponent(inverseLog * power)
      )
    }
    if (value === 0) {
      positions.push(index)
    }
  }

  if (positions.length !== locatorDegree) {
    return null
  }

  // Forney. With the QR generator's first root at α^0, the magnitude at a
  // located position X is X · Ω(X⁻¹) / Λ'(X⁻¹), and Λ' in characteristic two
  // keeps only the odd-power terms.
  const evaluator = polynomialMultiplyLittleEndian(
    syndromes,
    errorLocator.slice(0, locatorDegree + 1)
  ).slice(0, degree)

  for (const position of positions) {
    const exponentOfPosition = (codewords.length - 1 - position) % 255
    const inverseLog = (255 - exponentOfPosition) % 255

    let numerator = 0
    for (let power = 0; power < evaluator.length; power++) {
      numerator ^= gfMultiply(evaluator[power], gfExponent(inverseLog * power))
    }

    let denominator = 0
    for (let power = 1; power <= locatorDegree; power += 2) {
      denominator ^= gfMultiply(
        errorLocator[power] ?? 0,
        gfExponent(inverseLog * (power - 1))
      )
    }

    if (denominator === 0) {
      return null
    }

    codewords[position] ^= gfMultiply(
      gfExponent(exponentOfPosition),
      gfDivide(numerator, denominator)
    )
  }

  // Recompute the syndromes: a block that still has non-zero syndromes was
  // mis-corrected, and must be reported as unreadable rather than returned.
  for (let index = 0; index < degree; index++) {
    let value = 0
    for (const codeword of codewords) {
      value = gfMultiply(value, gfExponent(index)) ^ codeword
    }
    if (value !== 0) {
      return null
    }
  }

  return codewords
}

/** Polynomial product with least-significant coefficient first. */
function polynomialMultiplyLittleEndian(
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>
): Array<number> {
  const product = new Array<number>(left.length + right.length - 1).fill(0)
  for (let i = 0; i < left.length; i++) {
    if (left[i] === 0) {
      continue
    }
    for (let j = 0; j < right.length; j++) {
      product[i + j] ^= gfMultiply(left[i], right[j])
    }
  }
  return product
}
