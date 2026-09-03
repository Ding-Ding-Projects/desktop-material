import * as React from 'react'
import { Button } from '../lib/button'
import {
  createAttentionSessionStartedAt,
  deferAttentionMomentum,
  formatAttentionElapsed,
  IAttentionAccommodationPreferences,
  readAttentionAccommodationPreferences,
  AttentionAccommodationChangedEvent,
} from '../../models/attention-accommodation'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
} from '../../lib/i18n'

interface IAttentionRuntimeState {
  readonly preferences: IAttentionAccommodationPreferences
  readonly now: number
  readonly lastActivityAt: number
}

const MomentumIdleThresholdMs = 15 * 60 * 1000

function localize(english: string, cantonese: string): string {
  switch (getPersistedLanguageMode()) {
    case 'cantonese':
      return cantonese
    case 'bilingual':
      return `${english} · ${cantonese}`
    default:
      return english
  }
}

/**
 * Applies the five accommodation modes to the existing shell without
 * changing its structure or visual language. This is deliberately mounted at
 * the app root so settings changes are live and every existing surface gets
 * the same state.
 */
export class AttentionAccommodationRuntime extends React.Component<
  Record<string, never>,
  IAttentionRuntimeState
> {
  private interval: number | null = null
  private sessionStartedAt = createAttentionSessionStartedAt()
  private activeRegion: HTMLElement | null = null

  public constructor(props: Record<string, never>) {
    super(props)
    const now = Date.now()
    this.state = {
      preferences: readAttentionAccommodationPreferences(),
      now,
      lastActivityAt: now,
    }
  }

  public componentDidMount() {
    window.addEventListener(AttentionAccommodationChangedEvent, this.reload)
    window.addEventListener(LanguageModeChangedEvent, this.onLanguageChanged)
    window.addEventListener('focusin', this.onFocusIn, true)
    window.addEventListener('pointerdown', this.onActivity, true)
    window.addEventListener('keydown', this.onActivity, true)
    this.interval = window.setInterval(this.onTick, 1000)
    this.applyDocumentState()
  }

  public componentWillUnmount() {
    window.removeEventListener(AttentionAccommodationChangedEvent, this.reload)
    window.removeEventListener(LanguageModeChangedEvent, this.onLanguageChanged)
    window.removeEventListener('focusin', this.onFocusIn, true)
    window.removeEventListener('pointerdown', this.onActivity, true)
    window.removeEventListener('keydown', this.onActivity, true)
    if (this.interval !== null) {
      window.clearInterval(this.interval)
    }
    this.activeRegion?.removeAttribute('data-attention-active')
  }

  public componentDidUpdate() {
    this.applyDocumentState()
  }

  public render() {
    const { preferences, now, lastActivityAt } = this.state
    const idle = now - lastActivityAt
    const showMomentum =
      preferences.enabled.momentum &&
      idle >= MomentumIdleThresholdMs &&
      (preferences.momentumDeferredUntil === null ||
        preferences.momentumDeferredUntil <= now)

    return (
      <div
        className="attention-accommodation-runtime"
        data-attention-runtime="true"
        aria-live="polite"
      >
        {preferences.enabled.timeAwareness && (
          <div className="attention-time-awareness" role="status">
            <span>
              {localize('Session', '工作階段')}:{' '}
              {formatAttentionElapsed(now - this.sessionStartedAt)}
            </span>
            <span>
              {localize('Since activity', '距離上次活動')}:{' '}
              {formatAttentionElapsed(idle)}
            </span>
          </div>
        )}

        {preferences.enabled.oneThingAtATime && preferences.nextAction && (
          <div className="attention-next-action" role="status">
            <strong>{localize('Next action', '下一步')}:</strong>{' '}
            <span>{preferences.nextAction}</span>
          </div>
        )}

        {showMomentum && (
          <div className="attention-momentum-prompt" role="status">
            <strong>{localize('Momentum check-in', '動力提示')}</strong>
            <span>
              {localize(
                'Nothing has changed here for 15 minutes.',
                '呢度有 15 分鐘冇變過。'
              )}
            </span>
            <Button
              type="button"
              className="attention-momentum-prompt-defer-button"
              onClick={this.deferMomentum}
            >
              {localize('Not now', '而家唔要')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  private reload = () => {
    this.setState({ preferences: readAttentionAccommodationPreferences() })
  }

  private onLanguageChanged = () => {
    this.forceUpdate()
  }

  private onTick = () => {
    if (
      this.state.preferences.enabled.timeAwareness ||
      this.state.preferences.enabled.momentum
    ) {
      this.setState({ now: Date.now() })
    }
  }

  private onActivity = () => {
    this.setState({ lastActivityAt: Date.now() })
  }

  private onFocusIn = (event: FocusEvent) => {
    if (!this.state.preferences.enabled.focus) {
      return
    }
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const region = target.closest<HTMLElement>(
      '[data-attention-region], [data-customization-surface], [role="dialog"]'
    )
    if (region === null || region.dataset.attentionRuntime === 'true') {
      return
    }
    this.activeRegion?.removeAttribute('data-attention-active')
    this.activeRegion = region
    region.setAttribute('data-attention-active', 'true')
  }

  private applyDocumentState() {
    const root = document.getElementById('desktop-app-chrome')
    if (root === null) {
      return
    }
    const setModeAttribute = (name: string, enabled: boolean) => {
      if (enabled) {
        root.setAttribute(name, 'true')
      } else {
        root.removeAttribute(name)
      }
    }
    setModeAttribute(
      'data-attention-focus',
      this.state.preferences.enabled.focus
    )
    setModeAttribute(
      'data-attention-low-stimulation',
      this.state.preferences.enabled.lowStimulation
    )
    setModeAttribute(
      'data-attention-time-awareness',
      this.state.preferences.enabled.timeAwareness
    )
    setModeAttribute(
      'data-attention-one-thing',
      this.state.preferences.enabled.oneThingAtATime
    )
    setModeAttribute(
      'data-attention-momentum',
      this.state.preferences.enabled.momentum
    )

    if (!this.state.preferences.enabled.focus) {
      this.activeRegion?.removeAttribute('data-attention-active')
      this.activeRegion = null
    }

    const contents = document.getElementById('desktop-app-contents')
    if (contents !== null) {
      for (const child of Array.from(contents.children)) {
        const element = child as HTMLElement
        if (element.dataset.attentionRuntime !== 'true') {
          element.setAttribute('data-attention-region', 'true')
        }
      }
    }
  }

  private deferMomentum = () => {
    this.setState({
      preferences: deferAttentionMomentum(Date.now() + 30 * 60 * 1000),
      lastActivityAt: Date.now(),
    })
  }
}
