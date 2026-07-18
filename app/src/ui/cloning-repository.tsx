import * as React from 'react'

import { CloningRepository } from '../models/cloning-repository'
import { ICloneProgress, SubmoduleFetchStage } from '../models/progress'
import { formatCloneEta, formatCloneSpeed } from '../lib/progress/clone-eta'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import { UiView } from './ui-view'
import { TooltippedContent } from './lib/tooltipped-content'

interface ICloningRepositoryProps {
  readonly repository: CloningRepository
  readonly progress: ICloneProgress
}

/** The component for displaying a cloning repository's progress. */
export class CloningRepositoryView extends React.Component<
  ICloningRepositoryProps,
  {}
> {
  public render() {
    const { value, stage, description, speedBytesPerSecond, etaSeconds } =
      this.props.progress

    // Submodule fetches have no reliable aggregate percentage, so their bar is
    // kept indeterminate. The <progress> element only goes indeterminate for
    // undefined (never null).
    const isSubmodulePhase = stage === SubmoduleFetchStage
    const progressValue = isSubmodulePhase || !value ? undefined : value
    const percent = value ? Math.round(value * 100) : undefined

    const stageLabel = stage ?? 'Cloning'
    const stageText =
      isSubmodulePhase || percent === undefined
        ? stageLabel
        : `${stageLabel} — ${percent}%`

    const speed =
      speedBytesPerSecond !== undefined
        ? formatCloneSpeed(speedBytesPerSecond)
        : ''
    const eta = etaSeconds !== undefined ? formatCloneEta(etaSeconds) : ''
    const meta = [speed, eta].filter(part => part.length > 0).join(' · ')

    return (
      <UiView id="cloning-repository-view">
        <div className="title-container">
          <Octicon symbol={octicons.desktopDownload} />
          <div className="title">Cloning {this.props.repository.name}</div>
        </div>
        <progress value={progressValue} />
        <div className="clone-progress-stage">{stageText}</div>
        {meta.length > 0 && <div className="clone-progress-meta">{meta}</div>}
        <TooltippedContent
          tagName="div"
          className="details"
          tooltip={description}
        >
          {description}
        </TooltippedContent>
      </UiView>
    )
  }
}
