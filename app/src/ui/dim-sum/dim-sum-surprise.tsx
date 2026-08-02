import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'
import { DimSumAssetsDir } from '../../lib/dim-sum-assets'
import { composeDimSumCard } from '../../lib/dim-sum-copy'
import { IDimSumDish, DimSumSurpriseDurationMs } from '../../models/dim-sum'
import { IFunnyLevels } from '../../lib/funny-level-text'
import { LanguageMode } from '../../models/language-mode'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IDimSumSurpriseProps {
  readonly dish: IDimSumDish
  readonly languageMode: LanguageMode
  readonly funnyLevels: IFunnyLevels
  readonly onDismissed: () => void
  /** Overridable for tests; the card otherwise clears itself on its own. */
  readonly durationMs?: number
}

interface IDimSumSurpriseState {
  /** True once the card is on its way out, driving the leave animation. */
  readonly leaving: boolean
}

/** How long the leave animation runs before the card is unmounted. */
const LeaveAnimationMs = 220

/**
 * The dim sum surprise card.
 *
 * A non-blocking, self-dismissing corner card. It never takes focus, never
 * gates startup, and holds nothing the user has to act on — the dismiss button
 * only saves them the wait. The dish's name is stated in both languages at
 * every playfulness level; only the copy around it changes voice.
 */
export class DimSumSurprise extends React.PureComponent<
  IDimSumSurpriseProps,
  IDimSumSurpriseState
> {
  public state: IDimSumSurpriseState = { leaving: false }

  private dismissTimer: number | null = null
  private unmountTimer: number | null = null
  /** Where focus was when the reader tabbed into the card, if they ever did. */
  private focusOrigin: HTMLElement | null = null

  public componentDidMount() {
    const duration = this.props.durationMs ?? DimSumSurpriseDurationMs
    this.dismissTimer = window.setTimeout(this.beginLeaving, duration)
  }

  public componentWillUnmount() {
    this.clearTimers()
  }

  private clearTimers() {
    if (this.dismissTimer !== null) {
      window.clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }
    if (this.unmountTimer !== null) {
      window.clearTimeout(this.unmountTimer)
      this.unmountTimer = null
    }
  }

  /**
   * A reader who tabbed into the card must not be dumped at the top of the
   * document when it leaves under their focus, so where they came from is
   * remembered and handed back.
   */
  private onFocusIn = (event: React.FocusEvent<HTMLElement>) => {
    const from = event.relatedTarget
    if (this.focusOrigin === null && from instanceof HTMLElement) {
      this.focusOrigin = from
    }
    // Reading the card should not have it vanish mid-sentence.
    if (this.dismissTimer !== null) {
      window.clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }
  }

  private beginLeaving = () => {
    this.dismissTimer = null
    if (this.state.leaving) {
      return
    }
    this.setState({ leaving: true })
    this.unmountTimer = window.setTimeout(this.finishLeaving, LeaveAnimationMs)
  }

  private finishLeaving = () => {
    this.unmountTimer = null
    const origin = this.focusOrigin
    this.props.onDismissed()
    if (origin !== null && origin.isConnected) {
      origin.focus()
    }
  }

  private onDismissClicked = () => {
    this.clearTimers()
    this.beginLeaving()
  }

  public render() {
    const { dish, languageMode, funnyLevels } = this.props
    const content = composeDimSumCard(dish, languageMode, funnyLevels)
    const source = encodePathAsUrl(__dirname, DimSumAssetsDir, dish.file)

    return (
      <aside
        className="dim-sum-surprise"
        lang={content.htmlLang}
        // `status` is announced without interrupting, and never takes focus.
        role="status"
        aria-live="polite"
        aria-label={content.region}
        data-leaving={this.state.leaving ? 'true' : undefined}
        data-dish-id={dish.id}
        onFocus={this.onFocusIn}
      >
        <img
          className="dim-sum-surprise-art"
          src={source}
          alt={content.alt}
          width={dish.width}
          height={dish.height}
          draggable={false}
        />
        <div className="dim-sum-surprise-content">
          <p className="dim-sum-surprise-dish">
            {content.nameParts.map((part, index) => (
              <span key={index} lang={part.lang ?? undefined}>
                {part.text}
              </span>
            ))}
          </p>
          {content.romanization !== null && (
            <p className="dim-sum-surprise-romanization" lang="en">
              {content.romanization}
            </p>
          )}
          {content.blocks.map(block => (
            <div
              key={block.htmlLang}
              className="dim-sum-surprise-block"
              lang={block.htmlLang}
            >
              <h2 className="dim-sum-surprise-title">{block.title}</h2>
              <p className="dim-sum-surprise-lead">{block.lead}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="dim-sum-surprise-dismiss"
          aria-label={content.dismiss}
          onClick={this.onDismissClicked}
        >
          <Octicon symbol={octicons.x} />
        </button>
      </aside>
    )
  }
}
