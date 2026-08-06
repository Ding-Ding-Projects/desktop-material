import * as React from 'react'

import { Button } from '../lib/button'
import { CodeMirrorEditor } from '../lib/codemirror-editor'

export const AIMergeEditorMaximumResultLength = 1_048_576
export const AIMergeEditorMaximumSourceLength = 1_048_576
export const AIMergeEditorMaximumPathLength = 4_096
export const AIMergeEditorMaximumReasonLength = 4_096

export type AIMergePolicyState = 'allowed' | 'pending' | 'denied'

export type AIMergeSummary =
  | {
      readonly kind: 'available'
      readonly confidence: number
      readonly reason: string
    }
  | { readonly kind: 'unavailable' }

export interface IAIMergeEditorFile {
  readonly id: string
  readonly path: string
  readonly ours: string
  readonly result: string
  readonly theirs: string
  readonly summary: AIMergeSummary
}

export interface IAIMergeEditorSelection {
  readonly id: string
  readonly path: string
}

export interface IAIMergeEditorResultChange extends IAIMergeEditorSelection {
  readonly text: string
}

export interface IAIMergeEditorLabels {
  readonly editor: string
  readonly filePath: string
  readonly ours: string
  readonly result: string
  readonly theirs: string
  readonly readOnly: string
  readonly summary: string
  readonly confidence: string
  readonly reason: string
  readonly summaryUnavailable: string
  readonly formatConfidence: (value: number) => string
  readonly autoResolve: string
  readonly policyPending: string
  readonly policyDenied: string
  readonly openExternalTool: string
  readonly contentTruncated: string
  readonly resultCharacterLimit: (maximum: number) => string
  readonly resultTooLarge: (maximum: number) => string
}

export interface IAIMergeEditorProps {
  readonly file: IAIMergeEditorFile
  readonly policyState: AIMergePolicyState
  readonly labels: IAIMergeEditorLabels
  readonly onResultChange: (change: IAIMergeEditorResultChange) => void
  readonly onAutoResolve: (selection: IAIMergeEditorSelection) => void
  readonly onOpenExternalTool: (selection: IAIMergeEditorSelection) => void
}

interface IBoundedDisplayText {
  readonly text: string
  readonly truncated: boolean
}

export interface IAIMergeEditorDisplayContent {
  readonly text: string
  readonly truncated: boolean
}

export type AIMergeEditorDisplaySummary =
  | {
      readonly kind: 'available'
      readonly confidence: number
      readonly reason: string
      readonly reasonTruncated: boolean
    }
  | { readonly kind: 'unavailable' }

export interface IAIMergeEditorDisplayModel {
  readonly path: string
  readonly pathTruncated: boolean
  readonly ours: IAIMergeEditorDisplayContent
  readonly result: IAIMergeEditorDisplayContent
  readonly theirs: IAIMergeEditorDisplayContent
  readonly summary: AIMergeEditorDisplaySummary
}

const unsafePlainTextCharacters =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

function boundedPlainText(
  value: string,
  maximumLength: number
): IBoundedDisplayText {
  const sanitized = (typeof value === 'string' ? value : '')
    .replace(unsafePlainTextCharacters, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Object.freeze({
    text: sanitized.slice(0, maximumLength),
    truncated: sanitized.length > maximumLength,
  })
}

function boundedCodeText(
  value: string,
  maximumLength: number
): IAIMergeEditorDisplayContent {
  const text = typeof value === 'string' ? value : ''
  return Object.freeze({
    text: text.slice(0, maximumLength),
    truncated: text.length > maximumLength,
  })
}

/**
 * Build the bounded values rendered by the editor. Code text is never
 * normalized; oversized sources become explicitly truncated read-only
 * previews, while an oversized result is locked so it cannot be emitted as a
 * deceptively complete edit. Invalid confidence or an empty sanitized reason
 * is unavailable, never coerced to a misleading zero.
 */
export function createAIMergeEditorDisplayModel(
  file: IAIMergeEditorFile
): IAIMergeEditorDisplayModel {
  const path = boundedPlainText(file.path, AIMergeEditorMaximumPathLength)
  const summary = file.summary
  let displaySummary: AIMergeEditorDisplaySummary

  if (summary.kind === 'available') {
    const reason = boundedPlainText(
      summary.reason,
      AIMergeEditorMaximumReasonLength
    )
    displaySummary =
      Number.isFinite(summary.confidence) &&
      summary.confidence >= 0 &&
      summary.confidence <= 100 &&
      reason.text.length > 0
        ? Object.freeze({
            kind: 'available' as const,
            confidence: summary.confidence,
            reason: reason.text,
            reasonTruncated: reason.truncated,
          })
        : Object.freeze({ kind: 'unavailable' as const })
  } else {
    displaySummary = Object.freeze({ kind: 'unavailable' as const })
  }

  return Object.freeze({
    path: path.text,
    pathTruncated: path.truncated,
    ours: boundedCodeText(file.ours, AIMergeEditorMaximumSourceLength),
    result: boundedCodeText(file.result, AIMergeEditorMaximumResultLength),
    theirs: boundedCodeText(file.theirs, AIMergeEditorMaximumSourceLength),
    summary: displaySummary,
  })
}

let aiMergeEditorInstanceSequence = 0

/**
 * Controlled, presentation-only merge editor. Model and filesystem work stay
 * with the caller; this component emits bounded action payloads only.
 */
export class AIMergeEditor extends React.Component<IAIMergeEditorProps> {
  private readonly instanceId: string
  private readonly headingId: string
  private readonly filePathId: string
  private readonly oursId: string
  private readonly resultId: string
  private readonly theirsId: string
  private readonly summaryHeadingId: string
  private readonly confidenceLabelId: string
  private readonly resultLimitId: string
  private readonly policyExplanationId: string

  public constructor(props: IAIMergeEditorProps) {
    super(props)
    const sequence = ++aiMergeEditorInstanceSequence
    this.instanceId = `ai-merge-editor-${sequence}`
    this.headingId = `${this.instanceId}-heading`
    this.filePathId = `${this.instanceId}-file-path`
    this.oursId = `${this.instanceId}-ours`
    this.resultId = `${this.instanceId}-result`
    this.theirsId = `${this.instanceId}-theirs`
    this.summaryHeadingId = `${this.instanceId}-summary-heading`
    this.confidenceLabelId = `${this.instanceId}-confidence-label`
    this.resultLimitId = `${this.instanceId}-result-limit`
    this.policyExplanationId = `${this.instanceId}-policy-explanation`
  }

  private selection(): IAIMergeEditorSelection {
    return Object.freeze({ id: this.props.file.id, path: this.props.file.path })
  }

  private onResultChanged = (text: string) => {
    if (text.length > AIMergeEditorMaximumResultLength) {
      return
    }

    this.props.onResultChange(Object.freeze({ ...this.selection(), text }))
  }

  private onAutoResolve = () => {
    if (this.props.policyState !== 'allowed') {
      return
    }

    this.props.onAutoResolve(this.selection())
  }

  private onOpenExternalTool = () => {
    this.props.onOpenExternalTool(this.selection())
  }

  private renderPane(
    id: string,
    label: string,
    content: IAIMergeEditorDisplayContent,
    isResult: boolean
  ) {
    const resultLocked = isResult && content.truncated
    const readOnly = !isResult || resultLocked
    const truncationId = `${id}-truncation`
    const descriptionIds = new Array<string>()
    if (isResult) {
      descriptionIds.push(this.resultLimitId)
    }
    if (content.truncated) {
      descriptionIds.push(truncationId)
    }

    return (
      <section
        className="ai-merge-editor__pane"
        aria-labelledby={`${id}-label`}
      >
        <label
          className="ai-merge-editor__pane-label"
          id={`${id}-label`}
          htmlFor={id}
        >
          <span>{label}</span>
          {readOnly && (
            <span className="ai-merge-editor__read-only">
              {this.props.labels.readOnly}
            </span>
          )}
        </label>
        <CodeMirrorEditor
          className="ai-merge-editor__textarea"
          id={id}
          value={content.text}
          readOnly={readOnly}
          ariaLabelledBy={`${id}-label`}
          ariaDescribedBy={
            descriptionIds.length > 0 ? descriptionIds.join(' ') : undefined
          }
          ariaInvalid={resultLocked}
          maxLength={isResult ? AIMergeEditorMaximumResultLength : undefined}
          onChange={
            isResult && !resultLocked ? this.onResultChanged : undefined
          }
        />
        {isResult && (
          <small
            className="ai-merge-editor__field-guidance"
            id={this.resultLimitId}
          >
            {this.props.labels.resultCharacterLimit(
              AIMergeEditorMaximumResultLength
            )}
          </small>
        )}
        {content.truncated && (
          <small
            className="ai-merge-editor__field-guidance ai-merge-editor__truncation"
            id={truncationId}
          >
            {isResult
              ? this.props.labels.resultTooLarge(
                  AIMergeEditorMaximumResultLength
                )
              : this.props.labels.contentTruncated}
          </small>
        )}
      </section>
    )
  }

  private renderSummary(summary: AIMergeEditorDisplaySummary) {
    if (summary.kind === 'unavailable') {
      return (
        <p className="ai-merge-editor__summary-unavailable">
          {this.props.labels.summaryUnavailable}
        </p>
      )
    }

    const formattedConfidence = this.props.labels.formatConfidence(
      summary.confidence
    )
    return (
      <dl className="ai-merge-editor__summary-details">
        <dt id={this.confidenceLabelId}>{this.props.labels.confidence}</dt>
        <dd>
          <meter
            aria-labelledby={this.confidenceLabelId}
            min={0}
            max={100}
            value={summary.confidence}
          />
          <output>{formattedConfidence}</output>
        </dd>
        <dt>{this.props.labels.reason}</dt>
        <dd className="ai-merge-editor__summary-reason">
          {summary.reason}
          {summary.reasonTruncated && (
            <>
              {' '}
              <span className="ai-merge-editor__truncation">
                {this.props.labels.contentTruncated}
              </span>
            </>
          )}
        </dd>
      </dl>
    )
  }

  public render() {
    const display = createAIMergeEditorDisplayModel(this.props.file)
    const policyBlocked = this.props.policyState !== 'allowed'
    const policyExplanation =
      this.props.policyState === 'pending'
        ? this.props.labels.policyPending
        : this.props.policyState === 'denied'
        ? this.props.labels.policyDenied
        : null

    return (
      <section
        className="ai-merge-editor"
        aria-labelledby={this.headingId}
        aria-describedby={this.filePathId}
      >
        <header className="ai-merge-editor__header">
          <h2 id={this.headingId}>{this.props.labels.editor}</h2>
          <p className="ai-merge-editor__path" id={this.filePathId}>
            <span className="ai-merge-editor__path-label">
              {this.props.labels.filePath}
            </span>
            <bdi className="ai-merge-editor__path-value">{display.path}</bdi>
            {display.pathTruncated && (
              <>
                {' '}
                <span className="ai-merge-editor__truncation">
                  {this.props.labels.contentTruncated}
                </span>
              </>
            )}
          </p>
        </header>

        <div className="ai-merge-editor__panes">
          {this.renderPane(
            this.oursId,
            this.props.labels.ours,
            display.ours,
            false
          )}
          {this.renderPane(
            this.resultId,
            this.props.labels.result,
            display.result,
            true
          )}
          {this.renderPane(
            this.theirsId,
            this.props.labels.theirs,
            display.theirs,
            false
          )}
        </div>

        <section
          className="ai-merge-editor__summary"
          aria-labelledby={this.summaryHeadingId}
        >
          <h3 id={this.summaryHeadingId}>{this.props.labels.summary}</h3>
          {this.renderSummary(display.summary)}
        </section>

        <div className="ai-merge-editor__actions">
          <Button
            className="ai-merge-editor__action ai-merge-editor__action--primary"
            disabled={policyBlocked}
            ariaBusy={this.props.policyState === 'pending'}
            ariaDescribedBy={
              policyBlocked ? this.policyExplanationId : undefined
            }
            onClick={this.onAutoResolve}
          >
            {this.props.labels.autoResolve}
          </Button>
          <Button
            className="ai-merge-editor__action"
            onClick={this.onOpenExternalTool}
          >
            {this.props.labels.openExternalTool}
          </Button>
        </div>

        {policyExplanation !== null && (
          <p
            className="ai-merge-editor__policy-explanation"
            id={this.policyExplanationId}
            role={this.props.policyState === 'pending' ? 'status' : undefined}
            aria-live={
              this.props.policyState === 'pending' ? 'polite' : undefined
            }
          >
            {policyExplanation}
          </p>
        )}
      </section>
    )
  }
}
