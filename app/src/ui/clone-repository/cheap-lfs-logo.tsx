import * as React from 'react'
import classNames from 'classnames'

interface ICheapLfsLogoProps {
  readonly className?: string
  readonly size?: number
}

/**
 * Compact code-native Cheap LFS mark for dense clone surfaces. The descending
 * arrow meets three storage layers, distinguishing it from a generic package
 * glyph without adding a network or binary-asset dependency.
 */
export function CheapLfsLogo({ className, size = 16 }: ICheapLfsLogoProps) {
  return (
    <svg
      className={classNames('cheap-lfs-logo-mark', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={true}
      focusable={false}
    >
      <path
        d="M4.5 5.25h4M15.5 5.25h4M4.5 11.25h4M15.5 11.25h4M4.5 17.25h15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 3.5v10.25m-3.25-3.2L12 13.8l3.25-3.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 20.25h11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
