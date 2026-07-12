import * as React from 'react'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import {
  ICustomIntegration,
  TargetPathArgument,
} from '../../lib/custom-integration'
import { CustomIntegrationForm } from '../preferences/custom-integration-form'
import { enableCustomIntegration } from '../../lib/feature-flag'

const CustomEditorValue = 'custom-editor'
const GlobalEditorValue = 'global-editor'

interface IRepositoryMetadataProps {
  readonly defaultBranch: string
  readonly availableEditors: ReadonlyArray<string>
  readonly useDefaultEditor: boolean
  readonly selectedExternalEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly onDefaultBranchChanged: (branch: string) => void
  readonly onUseDefaultEditorChanged: (useDefault: boolean) => void
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onUseCustomEditorChanged: (useCustom: boolean) => void
  readonly onCustomEditorChanged: (editor: ICustomIntegration) => void
}

/** Repository-specific defaults layered on top of the global preferences. */
export class RepositoryMetadata extends React.Component<IRepositoryMetadataProps> {
  private onEditorChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const editor = event.currentTarget.value
    if (editor === GlobalEditorValue) {
      this.props.onUseDefaultEditorChanged(true)
      this.props.onUseCustomEditorChanged(false)
    } else if (editor === CustomEditorValue) {
      this.props.onUseDefaultEditorChanged(false)
      this.props.onUseCustomEditorChanged(true)
    } else {
      this.props.onUseDefaultEditorChanged(false)
      this.props.onUseCustomEditorChanged(false)
      this.props.onSelectedEditorChanged(editor)
    }
  }

  private get editorValue() {
    if (this.props.useDefaultEditor) {
      return GlobalEditorValue
    }
    if (this.props.useCustomEditor) {
      return CustomEditorValue
    }
    return this.props.selectedExternalEditor ?? GlobalEditorValue
  }

  private onCustomEditorPathChanged = (path: string, bundleID?: string) => {
    this.props.onCustomEditorChanged({
      path,
      bundleID,
      arguments: this.props.customEditor.arguments ?? TargetPathArgument,
    })
  }

  private onCustomEditorArgumentsChanged = (argumentsValue: string) => {
    this.props.onCustomEditorChanged({
      ...this.props.customEditor,
      arguments: argumentsValue,
    })
  }

  public render() {
    return (
      <DialogContent className="repository-metadata-settings">
        <section className="repository-metadata-card">
          <h2>Default branch</h2>
          <p>
            Override the branch Desktop Material treats as this repository's
            default. Leave blank to detect it from the remote.
          </p>
          <TextBox
            label="Branch name"
            value={this.props.defaultBranch}
            placeholder="Detect from remote"
            onValueChanged={this.props.onDefaultBranchChanged}
          />
        </section>

        <section className="repository-metadata-card">
          <h2>External editor</h2>
          <p>
            Choose an editor for this repository or keep the global default.
          </p>
          <Select
            label="Editor"
            value={this.editorValue}
            onChange={this.onEditorChanged}
          >
            <option value={GlobalEditorValue}>Use global default</option>
            {this.props.availableEditors.map(editor => (
              <option key={editor} value={editor}>
                {editor}
              </option>
            ))}
            {enableCustomIntegration() && (
              <option value={CustomEditorValue}>
                Configure custom editor…
              </option>
            )}
          </Select>
          {this.props.useCustomEditor && enableCustomIntegration() && (
            <CustomIntegrationForm
              id="repository-custom-editor"
              path={this.props.customEditor.path}
              arguments={this.props.customEditor.arguments}
              onPathChanged={this.onCustomEditorPathChanged}
              onArgumentsChanged={this.onCustomEditorArgumentsChanged}
            />
          )}
        </section>
      </DialogContent>
    )
  }
}
