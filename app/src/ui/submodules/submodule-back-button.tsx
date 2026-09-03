import * as React from 'react'

import {
  IAppearanceCustomization,
  SubmoduleBackButtonLabel,
  SubmoduleBackButtonStyle,
} from '../../models/appearance-customization'
import { translate, translateForAccessibleName } from '../../lib/i18n'
import { Button } from '../lib/button'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { LocalizedText } from '../lib/localized-text'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Select } from '../lib/select'
import {
  AnchoredAppearanceEditor,
  appearanceLockTargetProps,
  guardAppearanceElementActivation,
  openAppearanceEditorFromContextMenu,
  openAppearanceEditorFromKeyDown,
} from '../appearance'
import { IVersionedStoreHistorySource } from '../version-history'
import { MaterialSymbol } from '../lib/material-symbol'

interface ISubmoduleBackButtonProps {
  readonly appearanceCustomization: IAppearanceCustomization
  readonly parentName: string
  readonly onAppearanceCustomizationChanged: (
    customization: IAppearanceCustomization
  ) => void
  readonly onActivate?: () => void
  readonly disabled?: boolean
  readonly autoFocus?: boolean
  readonly historySource?: IVersionedStoreHistorySource
  readonly repositoryPath?: string
  readonly onHistoryMutation?: () => Promise<void> | void
}

interface ISubmoduleBackButtonState {
  /** The invoking Back button while its element-owned editor is open. */
  readonly editorAnchor: HTMLButtonElement | null
}

interface ISubmoduleBackAppearanceEditorProps {
  readonly anchor: HTMLElement
  readonly appearanceCustomization: IAppearanceCustomization
  readonly editorId: string
  readonly titleId: string
  readonly onAppearanceCustomizationChanged: (
    customization: IAppearanceCustomization
  ) => void
  readonly onClose: () => void
  readonly embedded?: boolean
}

/** The compact editor owned by a temporary submodule workspace's Back button. */
export class SubmoduleBackAppearanceEditor extends React.Component<ISubmoduleBackAppearanceEditorProps> {
  private onStyleChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onAppearanceCustomizationChanged({
      ...this.props.appearanceCustomization,
      submoduleBackButtonStyle: event.currentTarget
        .value as SubmoduleBackButtonStyle,
    })
  }

  private onLabelChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onAppearanceCustomizationChanged({
      ...this.props.appearanceCustomization,
      submoduleBackButtonLabel: event.currentTarget
        .value as SubmoduleBackButtonLabel,
    })
  }

  public render() {
    const { appearanceCustomization } = this.props
    const mode = appearanceCustomization.languageMode
    const localize = (key: Parameters<typeof translate>[0]) =>
      translate(key, mode)

    const controls = (
      <>
        <Select
          label={localize('appearance.submoduleBackStyle')}
          value={appearanceCustomization.submoduleBackButtonStyle}
          onChange={this.onStyleChanged}
        >
          <option value="tonal">{localize('submodule.backStyleTonal')}</option>
          <option value="filled">
            {localize('submodule.backStyleFilled')}
          </option>
          <option value="outlined">
            {localize('submodule.backStyleOutlined')}
          </option>
        </Select>
        <Select
          label={localize('appearance.submoduleBackLabel')}
          value={appearanceCustomization.submoduleBackButtonLabel}
          onChange={this.onLabelChanged}
        >
          <option value="back-to-parent">
            {localize('submodule.backLabelFull')}
          </option>
          <option value="parent-name">
            {localize('submodule.backLabelParent')}
          </option>
          <option value="icon-only">
            {localize('submodule.backLabelIcon')}
          </option>
        </Select>
      </>
    )

    if (this.props.embedded === true) {
      return (
        <div
          id={this.props.editorId}
          className="submodule-back-appearance-editor embedded"
        >
          {controls}
        </div>
      )
    }

    return (
      <Popover
        anchor={this.props.anchor}
        anchorPosition={PopoverAnchorPosition.RightTop}
        decoration={PopoverDecoration.Balloon}
        ariaLabelledby={this.props.titleId}
        onClickOutside={this.props.onClose}
      >
        <div
          id={this.props.editorId}
          className="submodule-back-appearance-editor"
        >
          <div className="submodule-back-appearance-editor-header">
            <h3 id={this.props.titleId}>
              {localize('submodule.appearanceHeading')}
            </h3>
            <Button
              type="button"
              className="submodule-back-appearance-close"
              ariaLabel={translateForAccessibleName(
                'submodule.managerClose',
                {},
                mode
              )}
              tooltip={localize('submodule.managerClose')}
              onClick={this.props.onClose}
            >
              <MaterialSymbol name="close" />
            </Button>
          </div>
          {controls}
        </div>
      </Popover>
    )
  }
}

/**
 * The Back button shown in temporary submodule workspaces.
 *
 * The element owns its appearance editor: Shift+right-clicking it (or using
 * the keyboard Context Menu command) opens a bounded popover beside the button.
 */
export class SubmoduleBackButton extends React.Component<
  ISubmoduleBackButtonProps,
  ISubmoduleBackButtonState
> {
  private readonly editorId = createUniqueId('submodule-back-appearance-editor')
  private readonly titleId = createUniqueId(
    'submodule-back-appearance-editor-title'
  )
  private focusRestorationTimer: number | null = null

  public constructor(props: ISubmoduleBackButtonProps) {
    super(props)
    this.state = { editorAnchor: null }
  }

  public componentWillUnmount() {
    releaseUniqueId(this.editorId)
    releaseUniqueId(this.titleId)
    if (this.focusRestorationTimer !== null) {
      window.clearTimeout(this.focusRestorationTimer)
    }
  }

  private openEditor(anchor: HTMLButtonElement) {
    this.setState({ editorAnchor: anchor })
  }

  /**
   * Shift+Right-click opens this button's appearance editor. A plain
   * right-click is left untouched — the button has no other menu, but the
   * editor must not claim a gesture the rest of the shell answers.
   */
  private onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    openAppearanceEditorFromContextMenu(event, anchor =>
      this.openEditor(anchor)
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    openAppearanceEditorFromKeyDown(event, anchor => this.openEditor(anchor))
  }

  private onEditorClose = () => {
    const anchor = this.state.editorAnchor
    if (anchor === null) {
      return
    }

    this.setState({ editorAnchor: null }, () => {
      // FocusTrap restores its pre-dialog target while deactivating. Queue the
      // exact owner after that cleanup so keyboard users return to the button.
      this.focusRestorationTimer = window.setTimeout(() => {
        this.focusRestorationTimer = null
        if (anchor.isConnected) {
          anchor.focus()
        }
      }, 0)
    })
  }

  public render() {
    const { appearanceCustomization, parentName } = this.props
    const mode = appearanceCustomization.languageMode
    const accessibleLabel = translateForAccessibleName(
      'submodule.backToParent',
      { parent: parentName },
      mode
    )
    const labelPreference = appearanceCustomization.submoduleBackButtonLabel
    const visibleLabel: JSX.Element | string | null =
      labelPreference === 'icon-only' ? null : labelPreference ===
        'parent-name' ? (
        parentName
      ) : (
        <LocalizedText
          translationKey="submodule.backToParent"
          variables={{ parent: parentName }}
          languageMode={mode}
        />
      )
    const isEditorOpen = this.state.editorAnchor !== null

    return (
      <span
        className="submodule-back-button-owner"
        data-context-menu-owner="true"
        data-customization-surface="submodule-back-button"
        data-customization-label="Submodule Back button"
        data-customization-scope="profile"
        // A lock on this element's appearance also gates the Back button
        // itself. The attribute is what joins the lock record to the rendered
        // element; without it the lock exists and the button carries on
        // working, which is a note rather than a lock.
        {...appearanceLockTargetProps('submodule-back-button')}
      >
        <Button
          type="button"
          className={`submodule-context-back submodule-context-back-${appearanceCustomization.submoduleBackButtonStyle}`}
          onClick={this.onActivate}
          onContextMenu={this.onContextMenu}
          onKeyDown={this.onKeyDown}
          disabled={this.props.disabled}
          ariaLabel={accessibleLabel}
          ariaHaspopup="dialog"
          ariaExpanded={isEditorOpen}
          ariaControls={this.editorId}
          tooltip={accessibleLabel}
          autoFocus={this.props.autoFocus}
        >
          <MaterialSymbol name="arrow_back" />
          {visibleLabel === null ? null : (
            <span className="submodule-context-back-label">{visibleLabel}</span>
          )}
        </Button>
        {this.renderEditor()}
      </span>
    )
  }

  /** Keep direct/programmatic activation behind the same lock gate as DOM input. */
  private onActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onActivate === undefined) {
      return
    }
    guardAppearanceElementActivation(event.currentTarget, this.props.onActivate)
  }

  private renderEditor() {
    const anchor = this.state.editorAnchor
    if (anchor === null) {
      return null
    }
    const editor = (embedded: boolean) => (
      <SubmoduleBackAppearanceEditor
        anchor={anchor}
        appearanceCustomization={this.props.appearanceCustomization}
        editorId={this.editorId}
        titleId={this.titleId}
        onAppearanceCustomizationChanged={
          this.props.onAppearanceCustomizationChanged
        }
        onClose={this.onEditorClose}
        embedded={embedded}
      />
    )
    if (
      this.props.historySource === undefined ||
      this.props.repositoryPath === undefined
    ) {
      return editor(false)
    }
    return (
      <AnchoredAppearanceEditor
        title="Submodule Back button appearance"
        lockTargetId="submodule-back-button"
        lockTargetLabel="Submodule Back button appearance"
        anchor={anchor}
        historySource={this.props.historySource}
        repositoryPath={this.props.repositoryPath}
        onClose={this.onEditorClose}
        onMutation={this.props.onHistoryMutation}
      >
        {editor(true)}
      </AnchoredAppearanceEditor>
    )
  }
}
