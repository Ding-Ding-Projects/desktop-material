import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { TabGroupColorPicker } from './tab-group-color-picker'
import {
  ITabGroup,
  TabGroupColor,
  normalizeTabGroupColor,
  normalizeTabGroupName,
} from '../../models/repository-tab'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { tabGroupEditIntroKey } from './tab-count-copy'

interface IEditTabGroupDialogProps {
  /** The group being renamed or recolored. */
  readonly group: ITabGroup
  /** How many tabs the group currently holds, stated in the intro. */
  readonly memberCount: number
  readonly onSave: (name: string, color: TabGroupColor) => void
  readonly onDismissed: () => void
}

interface IEditTabGroupDialogState {
  readonly name: string
  readonly color: TabGroupColor
  readonly languageMode: LanguageMode
}

/**
 * Rename and recolor an existing tab group.
 *
 * This is the strip's missing edit surface: the store has supported renaming
 * and recoloring since groups landed, but nothing in the UI could reach it. The
 * dialog touches the label only — membership, tab order, the pin boundary, and
 * every open tab are left exactly as they were, which is why the intro states
 * the member count instead of implying the edit might disturb it.
 */
export class EditTabGroupDialog extends React.Component<
  IEditTabGroupDialogProps,
  IEditTabGroupDialogState
> {
  public constructor(props: IEditTabGroupDialogProps) {
    super(props)
    this.state = {
      name: props.group.name,
      color: normalizeTabGroupColor(props.group.color),
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  private text(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, this.state.languageMode, variables)
  }

  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.state.languageMode)
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onColorChange = (color: TabGroupColor) => {
    this.setState({ color })
  }

  private onSubmit = () => {
    const name = normalizeTabGroupName(this.state.name)
    if (name === null) {
      return
    }
    this.props.onSave(name, this.state.color)
  }

  public render() {
    const disabled = normalizeTabGroupName(this.state.name) === null

    return (
      <Dialog
        id="edit-tab-group"
        title={
          <>
            <span aria-hidden="true">{this.text('tabs.groupEditTitle')}</span>
            <span className="sr-only">
              {this.accessibleText('tabs.groupEditTitle')}
            </span>
          </>
        }
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="tab-group-intro">
            {this.text(tabGroupEditIntroKey(this.props.memberCount), {
              name: this.props.group.name,
              count: String(this.props.memberCount),
            })}
          </p>
          <TextBox
            label={this.text('tabs.groupNameLabel')}
            ariaLabel={this.accessibleText('tabs.groupNameLabel')}
            value={this.state.name}
            autoFocus={true}
            onValueChanged={this.onNameChanged}
          />
          <div className="tab-group-colors-field">
            <span className="tab-group-colors-label" aria-hidden="true">
              {this.text('tabs.groupColorLabel')}
            </span>
            <TabGroupColorPicker
              color={this.state.color}
              languageMode={this.state.languageMode}
              onColorChange={this.onColorChange}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={this.text('tabs.groupSaveAction')}
            okButtonAriaLabel={this.accessibleText('tabs.groupSaveAction')}
            okButtonDisabled={disabled}
            cancelButtonText={this.text('tabs.groupCancelAction')}
            cancelButtonAriaLabel={this.accessibleText(
              'tabs.groupCancelAction'
            )}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
