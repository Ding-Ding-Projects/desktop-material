import * as React from 'react'

import {
  Base64Variant,
  DefaultBase64Options,
  IBase64Options,
  decodeBase64Text,
  encodeBase64Text,
} from '../../lib/base64-toolkit'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'

type Base64Direction = 'encode' | 'decode'

interface IBase64ToolkitProps {
  /** Injectable so tests do not need a clipboard. */
  readonly copyText?: (text: string) => void
}

interface IBase64ToolkitState {
  readonly direction: Base64Direction
  readonly input: string
  readonly options: IBase64Options
  readonly copied: boolean
}

const variantLabels: Readonly<Record<Base64Variant, string>> = {
  standard: 'Standard',
  'url-safe': 'URL-safe',
  mime: 'MIME (76-character lines)',
}

const defaultCopyText = (text: string) => {
  void navigator.clipboard.writeText(text)
}

/**
 * Encode and decode Base64 text in place. Nothing leaves this computer, and a
 * decoding problem names the offset instead of producing a wrong answer.
 */
export class Base64Toolkit extends React.Component<
  IBase64ToolkitProps,
  IBase64ToolkitState
> {
  public constructor(props: IBase64ToolkitProps) {
    super(props)
    this.state = {
      direction: 'encode',
      input: '',
      options: DefaultBase64Options,
      copied: false,
    }
  }

  private get result() {
    const { direction, input, options } = this.state
    return direction === 'encode'
      ? encodeBase64Text(input, options)
      : decodeBase64Text(input, options)
  }

  private onInputChanged = (event: React.FormEvent<HTMLTextAreaElement>) => {
    this.setState({ input: event.currentTarget.value, copied: false })
  }

  private onVariantChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({
      options: {
        ...this.state.options,
        variant: event.currentTarget.value as Base64Variant,
      },
      copied: false,
    })
  }

  private onPaddingChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      options: { ...this.state.options, padding: event.currentTarget.checked },
      copied: false,
    })
  }

  private onStrictChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      options: { ...this.state.options, strict: event.currentTarget.checked },
      copied: false,
    })
  }

  /** Swap direction and carry a good result over as the new input. */
  private onSwap = () => {
    const result = this.result
    this.setState({
      direction: this.state.direction === 'encode' ? 'decode' : 'encode',
      input: result.ok ? result.text : this.state.input,
      copied: false,
    })
  }

  private onCopy = () => {
    const result = this.result
    if (result.ok) {
      ;(this.props.copyText ?? defaultCopyText)(result.text)
      this.setState({ copied: true })
    }
  }

  public render() {
    const { direction, input, options, copied } = this.state
    const result = this.result
    const encoding = direction === 'encode'
    return (
      <section
        className="base64-toolkit"
        aria-labelledby="base64-toolkit-title"
      >
        <div className="file-converter-section-heading">
          <h3 id="base64-toolkit-title">Base64 text</h3>
          <span>Text is UTF-8 and never leaves this computer</span>
        </div>
        <div className="base64-toolkit-options">
          <Select
            label="Variant"
            value={options.variant}
            onChange={this.onVariantChanged}
          >
            {(Object.keys(variantLabels) as ReadonlyArray<Base64Variant>).map(
              variant => (
                <option key={variant} value={variant}>
                  {variantLabels[variant]}
                </option>
              )
            )}
          </Select>
          <Checkbox
            label="Padding"
            value={options.padding ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onPaddingChanged}
          />
          <Checkbox
            label="Strict decoding"
            value={options.strict ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onStrictChanged}
          />
        </div>
        <div className="base64-toolkit-panes">
          <label>
            <span>{encoding ? 'Text' : 'Base64'}</span>
            <textarea
              value={input}
              onChange={this.onInputChanged}
              spellCheck={false}
            />
          </label>
          <Button
            onClick={this.onSwap}
            ariaLabel={encoding ? 'Switch to decoding' : 'Switch to encoding'}
          >
            Swap
          </Button>
          <label>
            <span>{encoding ? 'Base64' : 'Text'}</span>
            <textarea
              value={result.ok ? result.text : ''}
              readOnly={true}
              spellCheck={false}
              aria-invalid={!result.ok}
            />
          </label>
        </div>
        {!result.ok && (
          <p className="file-converter-error" role="alert">
            {result.error}
          </p>
        )}
        <div className="file-converter-actions">
          <Button
            onClick={this.onCopy}
            disabled={!result.ok || result.text.length === 0}
          >
            Copy result
          </Button>
          <span role="status">
            {copied
              ? 'Copied.'
              : result.ok
                ? `${input.length} characters in, ${result.text.length} out`
                : ''}
          </span>
        </div>
      </section>
    )
  }
}
