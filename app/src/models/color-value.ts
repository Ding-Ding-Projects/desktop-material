/** Marker stored for the global CSS-driven animated hue cycle. */
export const AnimatedRainbowColor = 'rainbow'

export function isAnimatedRainbowColor(value: unknown): boolean {
  return value === AnimatedRainbowColor
}

/**
 * Consumers substitute this safe CSS expression for the marker. The one
 * inherited hue is animated on `:root`, so every surface stays in phase and
 * reduced motion can settle all of them in the stylesheet.
 */
export const RainbowCssColor = 'hsl(var(--dm-rainbow-hue, 282deg) 78% 52%)'
