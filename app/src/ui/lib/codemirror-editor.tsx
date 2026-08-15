import * as React from 'react'
import CodeMirror from 'codemirror'

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

/** A bounded, keyboard-accessible CodeMirror 5 editor with a textarea fallback. */
export class CodeMirrorEditor extends React.Component<ICodeMirrorEditorProps> {
  private readonly textareaRef = React.createRef<HTMLTextAreaElement>()
  private editor: CodeMirror.EditorFromTextArea | null = null
  private usingCodeMirror = false

  public componentDidMount() {
    const textarea = this.textareaRef.current
    if (textarea === null) {
      return
    }
    try {
      this.editor = CodeMirror.fromTextArea(textarea, {
        lineNumbers: true,
        lineWrapping: false,
        readOnly: this.props.readOnly,
        viewportMargin: Infinity,
      })
      this.applyWrapperClassName()
      this.usingCodeMirror = true
      this.editor.on('change', instance => {
        const value = instance.getValue()
        if (
          this.props.maxLength === undefined ||
          value.length <= this.props.maxLength
        ) {
          this.props.onChange?.(value)
        }
      })
    } catch {
      // Keep the native textarea available in test shells and restricted renderers.
      this.editor = null
    }
  }

  public componentDidUpdate(prevProps: ICodeMirrorEditorProps) {
    if (this.editor !== null) {
      if (prevProps.className !== this.props.className) {
        this.applyWrapperClassName(prevProps.className)
      }
      if (
        prevProps.value !== this.props.value &&
        this.editor.getValue() !== this.props.value
      ) {
        this.editor.setValue(this.props.value)
      }
      if (prevProps.readOnly !== this.props.readOnly) {
        this.editor.setOption('readOnly', this.props.readOnly)
      }
    }
  }

  public componentWillUnmount() {
    this.editor?.toTextArea()
    this.editor = null
  }

  private onNativeChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!this.usingCodeMirror) {
      this.props.onChange?.(event.currentTarget.value)
    }
  }

  private applyWrapperClassName(previousClassName?: string) {
    const wrapper = this.editor?.getWrapperElement()
    if (wrapper === undefined) {
      return
    }
    if (previousClassName !== undefined) {
      for (const className of previousClassName.split(/\s+/)) {
        if (className.length > 0) {
          wrapper.classList.remove(className)
        }
      }
    }
    for (const className of (this.props.className ?? '').split(/\s+/)) {
      if (className.length > 0) {
        wrapper.classList.add(className)
      }
    }
  }

  public render() {
    return (
      <textarea
        ref={this.textareaRef}
        className={
          this.props.className ??
          (this.usingCodeMirror
            ? 'code-mirror-editor-fallback'
            : 'code-mirror-editor')
        }
        id={this.props.id}
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
        data-editor="codemirror"
        onChange={this.onNativeChange}
      />
    )
  }
}
