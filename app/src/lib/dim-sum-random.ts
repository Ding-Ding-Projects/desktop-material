/**
 * The random source the dim sum surprise draws from.
 *
 * `Math.random` is banned repository-wide, and rightly so — but the ban also
 * means the one place a genuinely uniform draw matters needs somewhere to get
 * it. The platform CSPRNG is used directly: it is uniform, it is present in
 * both the renderer and Node, and it costs four bytes once per launch.
 */

/** How many distinct values a 32-bit draw has. */
const Uint32Range = 2 ** 32

/**
 * A uniformly distributed number in `[0, 1)`.
 *
 * Dividing a full 32-bit draw by its range keeps every value equally likely,
 * so the stated one launch in ten is exactly what a user gets. Throws when no
 * CSPRNG is reachable; the caller treats that as a launch with no surprise
 * rather than degrading to a biased source.
 */
export function drawUnitRandom(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / Uint32Range
}
