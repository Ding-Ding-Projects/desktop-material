import * as React from 'react'
import { Banner } from './banner'
import { MaterialSymbol } from '../lib/material-symbol'

export function BranchAlreadyUpToDate({
  ourBranch,
  theirBranch,
  onDismissed,
}: {
  readonly ourBranch: string
  readonly theirBranch?: string
  readonly onDismissed: () => void
}) {
  const message =
    theirBranch !== undefined ? (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date with '}
        <strong>{theirBranch}</strong>
      </span>
    ) : (
      <span>
        <strong>{ourBranch}</strong>
        {' is already up to date'}
      </span>
    )

  return (
    <Banner id="successful-merge" timeout={5000} onDismissed={onDismissed}>
      <div className="green-circle">
        <MaterialSymbol name="check" className="check-icon" />
      </div>
      <div className="banner-message">{message}</div>
    </Banner>
  )
}
