import * as React from 'react'
import { teleportAnchor } from '../../lib/teleport-targets'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  showDiffCheckMarksDefault,
  showDiffCheckMarksKey,
  underlineLinksDefault,
  underlineLinksKey,
} from '../../lib/stores/app-store'
import { getPersistedLanguageMode } from '../../lib/i18n'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

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

function hasStoredChoice(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

interface IAccessibilityPreferencesProps {
  readonly underlineLinks: boolean
  readonly onUnderlineLinksChanged: (value: boolean) => void

  readonly showDiffCheckMarks: boolean
  readonly onShowDiffCheckMarksChanged: (value: boolean) => void
}

export class Accessibility extends React.Component<
  IAccessibilityPreferencesProps,
  {}
> {
  public constructor(props: IAccessibilityPreferencesProps) {
    super(props)
  }

  public render() {
    const underlineIds = settingExplanationDescriptionIds(
      'accessibility-underline-links'
    )
    const diffCheckIds = settingExplanationDescriptionIds(
      'accessibility-diff-check-marks'
    )
    const underlineStored = hasStoredChoice(underlineLinksKey)
    const diffCheckStored = hasStoredChoice(showDiffCheckMarksKey)
    return (
      <DialogContent>
        <div className="accessibility-section">
          <h2>{localize('Accessibility', '無障礙')}</h2>
          <div {...teleportAnchor('settings-underline-links')}>
            <Checkbox
              label={localize('Underline links', '連結加底線')}
              value={
                this.props.underlineLinks ? CheckboxValue.On : CheckboxValue.Off
              }
              onChange={this.onUnderlineLinksChanged}
              ariaDescribedBy={underlineIds.ariaDescribedBy}
            />
            <SettingExplanation
              settingId="accessibility-underline-links"
              summary={localize('What this setting changes', '呢個設定會改咩')}
              explanation={localize(
                'Underlines links in commit messages, comments, documentation, and other rendered text so links do not rely on colour alone.',
                '喺提交訊息、留言、說明文件同其他渲染文字入面幫連結加底線，唔會淨係靠顏色先認得出。'
              )}
              source={underlineStored ? 'stored-choice' : 'compiled-default'}
              provenance={localize(
                underlineStored
                  ? `A choice is recorded on this computer. Current value: ${
                      this.props.underlineLinks ? 'on' : 'off'
                    }. Shipped value: ${underlineLinksDefault ? 'on' : 'off'}.`
                  : `No choice is recorded on this computer. Current and shipped value: ${
                      underlineLinksDefault ? 'on' : 'off'
                    }.`,
                underlineStored
                  ? `呢部電腦記錄咗選擇。目前值：${
                      this.props.underlineLinks ? '開' : '關'
                    }。出廠值：${underlineLinksDefault ? '開' : '關'}。`
                  : `呢部電腦未記錄選擇。目前值同出廠值：${
                      underlineLinksDefault ? '開' : '關'
                    }。`
              )}
            />
            <p className="settings-description">{this.renderExampleLink()}</p>
          </div>

          <div {...teleportAnchor('settings-diff-check-marks')}>
            <Checkbox
              label={localize(
                'Show check marks in the diff',
                'Diff 度顯示剔號'
              )}
              value={
                this.props.showDiffCheckMarks
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onShowDiffCheckMarksChanged}
              ariaDescribedBy={diffCheckIds.ariaDescribedBy}
            />
            <SettingExplanation
              settingId="accessibility-diff-check-marks"
              summary={localize('What this setting changes', '呢個設定會改咩')}
              explanation={localize(
                'Shows check marks beside selectable diff line numbers and line-number groups. Turning it off keeps the controls available with a quieter treatment.',
                '喺可以揀嘅 diff 行號同一組行號旁邊顯示剔號。閂咗之後控制項仍然用得到，只係外觀會靜啲。'
              )}
              source={diffCheckStored ? 'stored-choice' : 'compiled-default'}
              provenance={localize(
                diffCheckStored
                  ? `A choice is recorded on this computer. Current value: ${
                      this.props.showDiffCheckMarks ? 'on' : 'off'
                    }. Shipped value: ${
                      showDiffCheckMarksDefault ? 'on' : 'off'
                    }.`
                  : `No choice is recorded on this computer. Current and shipped value: ${
                      showDiffCheckMarksDefault ? 'on' : 'off'
                    }.`,
                diffCheckStored
                  ? `呢部電腦記錄咗選擇。目前值：${
                      this.props.showDiffCheckMarks ? '開' : '關'
                    }。出廠值：${showDiffCheckMarksDefault ? '開' : '關'}。`
                  : `呢部電腦未記錄選擇。目前值同出廠值：${
                      showDiffCheckMarksDefault ? '開' : '關'
                    }。`
              )}
            />
          </div>
        </div>
      </DialogContent>
    )
  }

  private renderExampleLink() {
    // The example link is rendered with inline style to override the global
    // underline setting since this is a non-interactive visual preview.
    const style = {
      textDecoration: this.props.underlineLinks ? 'underline' : 'none',
    }

    return (
      <span className="link-button-component example-link" style={style}>
        {localize('This is an example link', '呢條係示範連結')}
      </span>
    )
  }

  private onUnderlineLinksChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onUnderlineLinksChanged(event.currentTarget.checked)
  }

  private onShowDiffCheckMarksChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowDiffCheckMarksChanged(event.currentTarget.checked)
  }
}
