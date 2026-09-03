import * as React from 'react'
import { Branch, BranchType } from '../../models/branch'

import { Row } from './row'
import { Ref } from './ref'
import { MaterialSymbol } from './material-symbol'

export function renderBranchHasRemoteWarning(branch: Branch) {
  if (branch.upstream != null) {
    return (
      <Row className="warning-helper-text">
        <MaterialSymbol name="warning" />
        <p>
          This branch is tracking <Ref>{branch.upstream}</Ref> and renaming this
          branch will not change the branch name on the remote.
        </p>
      </Row>
    )
  } else {
    return null
  }
}

export function renderBranchNameExistsOnRemoteWarning(
  sanitizedName: string,
  branches: ReadonlyArray<Branch>
) {
  const alreadyExistsOnRemote =
    branches.findIndex(
      b => b.nameWithoutRemote === sanitizedName && b.type === BranchType.Remote
    ) > -1

  if (alreadyExistsOnRemote === false) {
    return null
  }

  return (
    <Row className="warning-helper-text">
      <MaterialSymbol name="warning" />
      <p>
        A branch named <Ref>{sanitizedName}</Ref> already exists on the remote.
      </p>
    </Row>
  )
}
