import * as React from 'react'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { DialogContent } from '../dialog'
import { teleportAnchor } from '../../lib/teleport-targets'
import {
  AttentionAccommodationMode,
  deferAttentionMomentum,
  IAttentionAccommodationPreferences,
  readAttentionAccommodationPreferences,
  setAttentionAccommodationEnabled,
  setAttentionNextAction,
} from '../../models/attention-accommodation'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
} from '../../lib/i18n'
import { readFunnyLevels } from '../../lib/funny-level-text'
import type { TeleportTargetId } from '../../lib/teleport-targets'

interface IAttentionAccommodationState {
  readonly preferences: IAttentionAccommodationPreferences
  readonly momentumDeferMinutes: number
}

const Modes: ReadonlyArray<{
  readonly id: AttentionAccommodationMode
  readonly english: string
  readonly cantonese: string
  readonly description: string
  readonly descriptionCantonese: string
}> = [
  {
    id: 'focus',
    english: 'Focus',
    cantonese: '專注',
    description:
      'De-emphasizes inactive workspace regions while keeping every region available in one obvious action.',
    descriptionCantonese:
      '將冇郁緊嘅工作區域淡化，但所有區域都仲喺度，一撳就返到。',
  },
  {
    id: 'lowStimulation',
    english: 'Low stimulation',
    cantonese: '低刺激',
    description:
      'Reduces non-essential motion, colour intensity, and sound. The operating system reduced-motion choice still applies.',
    descriptionCantonese:
      '減少非必要動畫、顏色強度同聲音；作業系統嘅減少動態設定照樣生效。',
  },
  {
    id: 'timeAwareness',
    english: 'Time awareness',
    cantonese: '時間感知',
    description:
      'Shows elapsed session time and time since the last recorded workspace activity as facts, without nagging.',
    descriptionCantonese:
      '顯示本次工作階段經過幾耐，同上次記錄到活動隔咗幾耐；只報事實，唔催你。',
  },
  {
    id: 'oneThingAtATime',
    english: 'One thing at a time',
    cantonese: '一次一件事',
    description:
      'Keeps one user-chosen next action visible so it survives a context switch.',
    descriptionCantonese: '保留一件由你揀嘅下一步，轉咗 context 都唔會消失。',
  },
  {
    id: 'momentum',
    english: 'Momentum',
    cantonese: '動力提示',
    description:
      'Offers a gentle dismissible prompt after inactivity. Defer keeps it quiet for the interval you choose.',
    descriptionCantonese:
      '一段時間冇活動後先輕輕提示一下；延後幾耐由你揀，期間唔會再煩。',
  },
]

const ModeTargets: Readonly<
  Record<AttentionAccommodationMode, TeleportTargetId>
> = {
  focus: 'settingsAttentionFocus',
  lowStimulation: 'settingsAttentionLowStimulation',
  timeAwareness: 'settingsAttentionTimeAwareness',
  oneThingAtATime: 'settingsAttentionOneThingAtATime',
  momentum: 'settingsAttentionMomentum',
}

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

export class AttentionAccommodations extends React.Component<
  Record<string, never>,
  IAttentionAccommodationState
> {
  public constructor(props: Record<string, never>) {
    super(props)
    this.state = {
      preferences: readAttentionAccommodationPreferences(),
      momentumDeferMinutes: 30,
    }
  }

  public componentDidMount() {
    window.addEventListener(
      'desktop-material-attention-accommodation-changed',
      this.onPreferencesChanged
    )
    window.addEventListener(LanguageModeChangedEvent, this.onLanguageChanged)
  }

  public componentWillUnmount() {
    window.removeEventListener(
      'desktop-material-attention-accommodation-changed',
      this.onPreferencesChanged
    )
    window.removeEventListener(LanguageModeChangedEvent, this.onLanguageChanged)
  }

  public render() {
    const levels = readFunnyLevels()
    const toneNote =
      levels.english >= 4 || levels.cantonese >= 4
        ? localize(
            'These are small interface accommodations, not a diagnosis or assessment.',
            '呢啲只係細細個介面調節，唔係診斷或者評估。'
          )
        : localize(
            'These are interface accommodations, not medical features or an assessment.',
            '呢啲係介面調節，唔係醫療功能或者評估。'
          )

    return (
      <DialogContent>
        <div className="attention-accommodations-section">
          <h2>{localize('Attention accommodations', '專注與節奏調節')}</h2>
          <p className="settings-description">{toneNote}</p>
          <p className="settings-description">
            {localize(
              'Each mode is off by default and can be changed independently.',
              '每個模式預設關閉，可以獨立開關。'
            )}
          </p>

          {Modes.map(mode => this.renderMode(mode))}

          {this.state.preferences.enabled.oneThingAtATime && (
            <div
              className="attention-accommodations-next-action"
              {...teleportAnchor('settingsAttentionNextAction')}
            >
              <TextBox
                className="attention-accommodations-next-action-textbox"
                label={localize('Next action', '下一步')}
                value={this.state.preferences.nextAction}
                placeholder={localize(
                  'Write one concrete next action',
                  '寫低一件具體下一步'
                )}
                ariaDescribedBy="attention-next-action-help"
                onValueChanged={this.onNextActionChanged}
                onBlur={this.persistNextAction}
              />
              <p
                id="attention-next-action-help"
                className="settings-description"
              >
                {localize(
                  'This text stays on this computer and remains until you change or clear it.',
                  '呢段文字只留喺呢部電腦，直到你修改或者清除。'
                )}
              </p>
            </div>
          )}

          {this.state.preferences.enabled.momentum && (
            <div
              className="attention-accommodations-momentum-defer"
              {...teleportAnchor('settingsAttentionMomentumDefer')}
            >
              <Select
                className="attention-accommodations-momentum-defer-select"
                label={localize('Prompt defer interval', '提示延後時間')}
                value={String(this.state.momentumDeferMinutes)}
                onChange={this.onMomentumDeferChanged}
              >
                {[15, 30, 60, 120].map(minutes => (
                  <option key={minutes} value={minutes}>
                    {localize(`${minutes} minutes`, `${minutes} 分鐘`)}
                  </option>
                ))}
              </Select>
              <Button type="button" onClick={this.deferMomentum}>
                {localize('Defer the next prompt', '延後下一次提示')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    )
  }

  private renderMode(mode: typeof Modes[number]): JSX.Element {
    const descriptionId = `attention-${mode.id}-description`
    const handleModeChange = (
      event: React.FormEvent<HTMLInputElement>
    ): void => {
      this.onModeChanged(mode.id, event.currentTarget.checked)
    }
    return (
      <div
        key={mode.id}
        className="attention-accommodation-row"
        {...teleportAnchor(ModeTargets[mode.id])}
      >
        <Checkbox
          label={localize(mode.english, mode.cantonese)}
          value={
            this.state.preferences.enabled[mode.id]
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={handleModeChange}
          ariaDescribedBy={descriptionId}
        />
        <p id={descriptionId} className="settings-description">
          {localize(mode.description, mode.descriptionCantonese)}
        </p>
      </div>
    )
  }

  private onPreferencesChanged = () => {
    this.setState({ preferences: readAttentionAccommodationPreferences() })
  }

  private onLanguageChanged = () => {
    this.forceUpdate()
  }

  private onModeChanged = (
    mode: AttentionAccommodationMode,
    enabled: boolean
  ) => {
    this.setState({
      preferences: setAttentionAccommodationEnabled(mode, enabled),
    })
  }

  private onNextActionChanged = (value: string) => {
    this.setState({
      preferences: {
        ...this.state.preferences,
        nextAction: value.slice(0, 240),
      },
    })
  }

  private persistNextAction = (value: string) => {
    const nextAction = value.slice(0, 240)
    this.setState({ preferences: setAttentionNextAction(nextAction) })
  }

  private onMomentumDeferChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.setState({ momentumDeferMinutes: Number(event.currentTarget.value) })
  }

  private deferMomentum = () => {
    const until = Date.now() + this.state.momentumDeferMinutes * 60 * 1000
    this.setState({ preferences: deferAttentionMomentum(until) })
  }
}
