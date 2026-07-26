import * as React from 'react'
import classNames from 'classnames'
import { t, translateForAccessibleName } from '../../../lib/i18n'
import {
  compileSafeRegex,
  getRegexInputLengthError,
  ISafeRegexCapturePreview,
  ISafeRegexMatch,
  MaxRegexCapturePreviews,
  MaxRegexInputLength,
  MaxRegexMatchCount,
} from '../../../lib/safe-regex'

interface IRegexTestAreaProps {
  /** The current regex source pattern. */
  readonly pattern: string
  /** The serialised flags string (e.g. `gi`). */
  readonly flags: string
  /** The current sample text (one candidate per line). */
  readonly sample: string
  readonly onSampleChanged: (sample: string) => void
  /** Existing builder-owned element that describes a pattern error. */
  readonly externalPatternErrorId?: string
}

interface IHighlightSegment {
  readonly text: string
  readonly matched: boolean
}

interface ICapturePreview {
  readonly key: string
  readonly label: string
  readonly capture: ISafeRegexCapturePreview
}

interface IRegexTestEvaluation {
  readonly count: number
  readonly truncated: boolean
  readonly error: string | null
  readonly errorSource: 'pattern' | 'sample' | null
  readonly segments: ReadonlyArray<IHighlightSegment>
  readonly captures: ReadonlyArray<ICapturePreview>
  readonly capturesOmitted: number
}

/** The maximum number of highlighted segments we're willing to render. */
const MaxHighlightSegments = 80

/** Id of the one tester-owned detailed error used for sample-limit failures. */
const RegexTestErrorId = 'regex-test-error'

interface IRegexSampleCandidate {
  readonly start: number
  readonly text: string
}

/**
 * Enumerate editable tester rows without losing their absolute offsets in the
 * textarea. Each row represents one candidate, just like an applied list
 * search; separators remain unmatchable preview text between candidates.
 */
function* enumerateRegexSampleCandidates(
  sample: string
): IterableIterator<IRegexSampleCandidate> {
  let candidateStart = 0
  let index = 0

  while (index < sample.length) {
    const character = sample[index]
    if (character !== '\r' && character !== '\n') {
      index++
      continue
    }

    yield {
      start: candidateStart,
      text: sample.slice(candidateStart, index),
    }
    if (character === '\r' && sample[index + 1] === '\n') {
      index++
    }
    index++
    candidateStart = index
  }

  yield { start: candidateStart, text: sample.slice(candidateStart) }
}

/**
 * The live tester at the bottom of the regex builder. Compiles the current
 * pattern, reports a match count, and renders the sample text with matched
 * runs highlighted.
 */
export class RegexTestArea extends React.Component<IRegexTestAreaProps> {
  private evaluate(): IRegexTestEvaluation {
    const sample = this.props.sample
    const inputError = getRegexInputLengthError(sample.length)
    if (inputError !== null) {
      return {
        count: 0,
        truncated: false,
        error: inputError,
        errorSource: 'sample',
        segments: [{ text: sample, matched: false }],
        captures: [],
        capturesOmitted: 0,
      }
    }

    if (this.props.pattern.length === 0) {
      return {
        count: 0,
        truncated: false,
        error: null,
        errorSource: null,
        segments: [{ text: sample, matched: false }],
        captures: [],
        capturesOmitted: 0,
      }
    }

    const compilation = compileSafeRegex(
      this.props.pattern,
      !this.props.flags.includes('i')
    )
    if (compilation.regex === null) {
      return {
        count: 0,
        truncated: false,
        error: compilation.error,
        errorSource: 'pattern',
        segments: [{ text: sample, matched: false }],
        captures: [],
        capturesOmitted: 0,
      }
    }

    const regex = compilation.regex
    const matches = new Array<ISafeRegexMatch>()
    let remainingMatches = regex.getMaximumMatchCount(MaxRegexMatchCount)
    let truncated = false

    for (const candidate of enumerateRegexSampleCandidates(sample)) {
      if (remainingMatches === 0) {
        if (regex.test(candidate.text)) {
          truncated = true
          break
        }
        continue
      }

      const found = regex.findAll(
        candidate.text,
        remainingMatches,
        matches.length === 0
      )
      for (const match of found.matches) {
        matches.push({ ...match, index: candidate.start + match.index })
      }
      remainingMatches -= found.matches.length

      if (found.truncated) {
        truncated = true
        break
      }
    }

    const captureSummary = this.buildCaptureSummary(matches[0])
    return {
      count: matches.length,
      truncated,
      error: null,
      errorSource: null,
      segments: this.buildSegments(sample, matches),
      captures: captureSummary.captures,
      capturesOmitted: captureSummary.omitted,
    }
  }

  private buildCaptureSummary(match: ISafeRegexMatch | undefined): {
    readonly captures: ReadonlyArray<ICapturePreview>
    readonly omitted: number
  } {
    if (match === undefined) {
      return { captures: [], omitted: 0 }
    }

    const captures = new Array<ICapturePreview>()
    match.groups.forEach((capture, index) => {
      captures.push({
        key: `number-${index + 1}`,
        label: `$${index + 1}`,
        capture,
      })
    })
    for (const [name, capture] of Object.entries(match.namedGroups)) {
      captures.push({ key: `name-${name}`, label: `<${name}>`, capture })
    }

    return {
      captures: captures.slice(0, MaxRegexCapturePreviews),
      omitted:
        match.capturesOmitted +
        Math.max(0, captures.length - MaxRegexCapturePreviews),
    }
  }

  private renderCaptureValue(
    capture: ISafeRegexCapturePreview
  ): React.ReactNode {
    if (capture.value === null || capture.originalLength === null) {
      return <em>{t('regex.test.capture.unmatched')}</em>
    }
    if (capture.originalLength === 0) {
      return <em>{t('regex.test.capture.empty')}</em>
    }
    if (capture.originalLength === capture.value.length) {
      return capture.value
    }
    return t('regex.test.capture.truncated', {
      value: capture.value,
      count: String(capture.originalLength),
    })
  }

  private renderCaptureSummary(evaluation: IRegexTestEvaluation) {
    if (evaluation.captures.length === 0) {
      return null
    }

    return (
      <div
        className="regex-test-captures"
        role="group"
        aria-label={translateForAccessibleName('regex.test.capture.groupLabel')}
      >
        <span className="regex-test-captures-label">
          {t('regex.test.capture.heading')}
        </span>
        <dl>
          {evaluation.captures.map(capture => (
            <div key={capture.key} className="regex-test-capture">
              <dt>{capture.label}</dt>
              <dd>{this.renderCaptureValue(capture.capture)}</dd>
            </div>
          ))}
        </dl>
        {evaluation.capturesOmitted > 0 ? (
          <span className="regex-test-captures-omitted">
            {t('regex.test.capture.more', {
              count: String(evaluation.capturesOmitted),
            })}
          </span>
        ) : null}
      </div>
    )
  }

  private buildSegments(
    sample: string,
    matches: ReadonlyArray<ISafeRegexMatch>
  ): ReadonlyArray<IHighlightSegment> {
    const segments = new Array<IHighlightSegment>()
    let lastIndex = 0
    for (const match of matches) {
      const start = match.index
      const end = start + match.text.length

      if (start > lastIndex) {
        segments.push({ text: sample.slice(lastIndex, start), matched: false })
      }

      if (match.text.length > 0) {
        segments.push({ text: sample.slice(start, end), matched: true })
        lastIndex = end
      }

      if (segments.length >= MaxHighlightSegments) {
        break
      }
    }

    if (lastIndex < sample.length) {
      segments.push({ text: sample.slice(lastIndex), matched: false })
    }

    return segments
  }

  private renderCountChip(evaluation: IRegexTestEvaluation) {
    const invalid = evaluation.error !== null
    const count = evaluation.count
    const displayedCount = `${count}${evaluation.truncated ? '+' : ''}`
    const label = invalid
      ? t('regex.test.status.invalid')
      : t(
          count === 1
            ? 'regex.test.status.oneMatch'
            : 'regex.test.status.matches',
          { count: displayedCount }
        )

    const detailedErrorId =
      evaluation.errorSource === 'pattern'
        ? this.props.externalPatternErrorId ?? RegexTestErrorId
        : evaluation.errorSource === 'sample'
        ? RegexTestErrorId
        : undefined

    const className = classNames('regex-test-count', {
      invalid,
      matched: !invalid && count > 0,
      empty: !invalid && count === 0,
    })

    return (
      <span
        className={className}
        aria-describedby={detailedErrorId}
        aria-live={invalid ? undefined : 'polite'}
      >
        {label}
      </span>
    )
  }

  private onSampleChanged = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.props.onSampleChanged(
      event.currentTarget.value.slice(0, MaxRegexInputLength)
    )
  }

  public render() {
    const evaluation = this.evaluate()
    const ownsDetailedError =
      evaluation.error !== null &&
      !(
        evaluation.errorSource === 'pattern' &&
        this.props.externalPatternErrorId !== undefined
      )

    return (
      <div className="regex-test-area">
        <div className="regex-test-header">
          <span className="regex-test-label">TEST</span>
          {this.renderCountChip(evaluation)}
        </div>
        <textarea
          className="regex-test-sample"
          aria-label="Sample text for testing the regular expression"
          aria-describedby={
            evaluation.errorSource === 'sample' ? RegexTestErrorId : undefined
          }
          aria-invalid={evaluation.errorSource === 'sample'}
          rows={3}
          maxLength={MaxRegexInputLength}
          spellCheck={false}
          value={this.props.sample}
          onChange={this.onSampleChanged}
        />
        <div className="regex-test-preview">
          {evaluation.segments.map((segment, i) =>
            segment.matched ? (
              <mark key={i}>{segment.text}</mark>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          )}
        </div>
        {this.renderCaptureSummary(evaluation)}
        {!ownsDetailedError ? null : (
          <p id={RegexTestErrorId} className="regex-test-error" role="alert">
            {evaluation.error}
          </p>
        )}
      </div>
    )
  }
}
