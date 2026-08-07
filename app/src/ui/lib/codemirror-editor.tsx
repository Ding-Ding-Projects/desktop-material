import * as React from 'react'

export interface ICodeMirrorEditorProps {
  readonly id: string
  readonly className?: string
  readonly value: string
  readonly readOnly: boolean
  readonly ariaLabelledBy?: string
  readonly ariaDescribedBy?: string
  readonly ariaInvalid?: boolean
  readonly maxLength?: number
  readonly onChange?: (value: string) => void
}

/** A bounded, controlled editor whose accessible value is the full document. */
export class CodeMirrorEditor extends React.Component<ICodeMirrorEditorProps> {
  private onNativeChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value
    if (
      this.props.maxLength === undefined ||
      value.length <= this.props.maxLength
    ) {
      this.props.onChange?.(value)
    }
  }

  public render() {
    return (
      <textarea
        className={this.props.className ?? 'code-mirror-editor'}
        id={this.props.id}
        name={this.props.id}
        value={this.props.value}
        readOnly={this.props.readOnly}
        aria-labelledby={this.props.ariaLabelledBy}
        aria-describedby={this.props.ariaDescribedBy}
        aria-invalid={this.props.ariaInvalid ? true : undefined}
        aria-readonly={this.props.readOnly ? true : undefined}
        maxLength={this.props.maxLength}
        rows={16}
        wrap="off"
        spellCheck={false}
        data-editor="native"
        onChange={this.onNativeChange}
      />
    )
  }
}
