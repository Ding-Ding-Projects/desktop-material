import * as React from 'react'

import type {
  IUnlockLadderChallenge,
  IUnlockLadderServiceResult,
  UnlockLadderAnswer,
} from '../../models/unlock-ladder'
import type { LanguageMode } from '../../models/language-mode'
import { unlockLadderText } from './unlock-ladder-localization'
import type { IUnlockLadderLevels } from './unlock-ladder-localization'
import { RadioGroup } from '../lib/radio-group'
import { TextBox } from '../lib/text-box'
import { Md3GhostButton, Md3TonalButton } from '../md3/md3-primitives'

export interface IUnlockLadderProps {
  readonly challenge: IUnlockLadderChallenge | null
  readonly languageMode: LanguageMode
  readonly funnyLevels: IUnlockLadderLevels
  readonly remainingSkips: number
  /** The parent keeps credential state separate and must never create a session here. */
  readonly onSubmit: (
    answer: UnlockLadderAnswer
  ) =>
    | Promise<IUnlockLadderServiceResult | null>
    | IUnlockLadderServiceResult
    | null
  /** Main-process receipt-time mole hit; client timestamps are never trusted. */
  readonly onMoleHit?: (
    request: Readonly<{
      readonly challengeId: string
      readonly nonce: string
      readonly moleId: string
    }>
  ) => Promise<boolean> | boolean
  readonly onCancel: () => void
  readonly disabled?: boolean
}

interface IUnlockLadderState {
  readonly selectedChoice: string | null
  readonly sums: Readonly<Record<string, string>>
  readonly hits: Readonly<Record<string, number>>
  readonly now: number
  readonly message: string | null
  readonly submitting: boolean
}

/**
 * The wait-ladder surface is a non-modal, keyboard-first panel. It renders
 * challenge material supplied by the main process and returns only an answer;
 * it has no credential input and no route that can mint a session.
 * The component is mounted by the credential lock prompt only while that
 * prompt's real retry wait is active; it is never a generic destination.
 */
export class UnlockLadder extends React.Component<
  IUnlockLadderProps,
  IUnlockLadderState
> {
  private timer: ReturnType<typeof setInterval> | null = null

  public constructor(props: IUnlockLadderProps) {
    super(props)
    this.state = {
      selectedChoice: null,
      sums: {},
      hits: {},
      now: Date.now(),
      message: null,
      submitting: false,
    }
  }

  public componentDidMount() {
    this.timer = setInterval(() => this.setState({ now: Date.now() }), 100)
  }

  public componentWillUnmount() {
    if (this.timer !== null) clearInterval(this.timer)
  }

  public componentDidUpdate(previousProps: IUnlockLadderProps) {
    if (
      previousProps.challenge?.challengeId !== this.props.challenge?.challengeId
    ) {
      this.setState({ selectedChoice: null, sums: {}, hits: {} })
    }
  }

  private text = (
    key: Parameters<typeof unlockLadderText>[0],
    variables: Readonly<Record<string, string>> = {}
  ) =>
    unlockLadderText(
      key,
      this.props.languageMode,
      this.props.funnyLevels,
      variables
    )

  private submit = () => {
    const challenge = this.props.challenge
    if (
      challenge === null ||
      this.state.submitting ||
      this.props.disabled === true
    )
      return
    const answer = this.answerFor(challenge)
    if (answer === null) return
    this.setState({ submitting: true, message: null })
    void Promise.resolve(this.props.onSubmit(answer))
      .then(result => {
        if (result === null) return
        this.setState({
          message:
            result.grade.outcome === 'correct'
              ? this.text('credentialNext')
              : result.grade.reason === 'expired'
              ? this.text('expired')
              : result.grade.reason === 'too-early'
              ? this.text('tooEarly')
              : result.grade.reason === 'invalid-hit'
              ? this.text('invalidHit')
              : result.grade.reason === 'duplicate-hit'
              ? this.text('duplicateHit')
              : this.text('wrong'),
        })
      })
      .catch(() => this.setState({ message: this.text('wrong') }))
      .finally(() => this.setState({ submitting: false }))
  }

  private answerFor(
    challenge: IUnlockLadderChallenge
  ): UnlockLadderAnswer | null {
    switch (challenge.payload.kind) {
      case 'dim-sum-choice':
        return this.state.selectedChoice === null
          ? null
          : { kind: 'dim-sum-choice', choiceId: this.state.selectedChoice }
      case 'arithmetic-sums': {
        const answers = challenge.payload.questions.map(question => {
          const value = Number(this.state.sums[question.id])
          return { questionId: question.id, value }
        })
        return answers.every(answer => Number.isSafeInteger(answer.value))
          ? { kind: 'arithmetic-sums', answers }
          : null
      }
      case 'whack-a-mole':
        return {
          kind: 'whack-a-mole',
          hits: Object.entries(this.state.hits).map(([moleId, at]) => ({
            moleId,
            at,
          })),
        }
    }
  }

  private renderChallenge() {
    const challenge = this.props.challenge
    if (challenge === null) {
      return <p className="unlock-ladder-empty">{this.text('clock')}</p>
    }
    switch (challenge.payload.kind) {
      case 'dim-sum-choice':
        const choices = challenge.payload.choices
        return (
          <fieldset className="unlock-ladder-choice-grid">
            <legend id={`unlock-ladder-${challenge.challengeId}-dish-label`}>
              {this.text('dimSumPrompt')}
            </legend>
            <RadioGroup<string>
              className="unlock-ladder-radio-group"
              ariaLabelledBy={`unlock-ladder-${challenge.challengeId}-dish-label`}
              selectedKey={this.state.selectedChoice ?? ''}
              radioButtonKeys={choices.map(choice => choice.id)}
              onSelectionChanged={selectedChoice =>
                this.setState({ selectedChoice })
              }
              renderRadioButtonLabelContents={choiceId => {
                const choice = choices.find(item => item.id === choiceId)
                return choice === undefined
                  ? choiceId
                  : `${choice.englishName} · ${choice.cantoneseName}`
              }}
            />
          </fieldset>
        )
      case 'arithmetic-sums':
        return (
          <fieldset className="unlock-ladder-sums">
            <legend>{this.text('sumsPrompt')}</legend>
            {challenge.payload.questions.map(question => (
              <label key={question.id} className="unlock-ladder-sum">
                <span>
                  {question.left} {question.operator} {question.right} =
                </span>
                <TextBox
                  className="unlock-ladder-sum-input"
                  label=""
                  value={this.state.sums[question.id] ?? ''}
                  onValueChanged={value =>
                    this.setState({
                      sums: { ...this.state.sums, [question.id]: value },
                    })
                  }
                  ariaLabel={`${question.left} ${question.operator} ${question.right}`}
                />
              </label>
            ))}
          </fieldset>
        )
      case 'whack-a-mole':
        return (
          <fieldset className="unlock-ladder-moles">
            <legend>{this.text('molesPrompt')}</legend>
            <p role="timer" aria-live="polite">
              {Math.max(
                0,
                Math.ceil((challenge.payload.endsAt - this.state.now) / 1000)
              )}
              s
            </p>
            <div className="unlock-ladder-mole-grid">
              {challenge.payload.moles.map(mole => {
                const visible =
                  this.state.now >= mole.visibleAt &&
                  this.state.now <= mole.visibleUntil
                const hit = this.state.hits[mole.id] !== undefined
                return (
                  <div
                    key={mole.id}
                    className="unlock-ladder-mole-slot"
                    style={{
                      gridRow: mole.row + 1,
                      gridColumn: mole.column + 1,
                    }}
                  >
                    <Md3TonalButton
                      type="button"
                      className={
                        hit ? 'unlock-ladder-mole hit' : 'unlock-ladder-mole'
                      }
                      label={hit ? '✓' : visible ? '●' : '·'}
                      disabled={!visible || hit}
                      onClick={() => {
                        const record = this.props.onMoleHit
                        if (record === undefined) {
                          this.setState({
                            hits: { ...this.state.hits, [mole.id]: Date.now() },
                          })
                          return
                        }
                        void Promise.resolve(
                          record({
                            challengeId: challenge.challengeId,
                            nonce: challenge.nonce,
                            moleId: mole.id,
                          })
                        ).then(accepted => {
                          if (accepted) {
                            this.setState({
                              hits: {
                                ...this.state.hits,
                                [mole.id]: Date.now(),
                              },
                            })
                          }
                        })
                      }}
                      accessibleName={
                        hit
                          ? this.text('targetCounted')
                          : visible
                          ? this.text('visibleTarget')
                          : this.text('hiddenTarget')
                      }
                    />
                  </div>
                )
              })}
            </div>
          </fieldset>
        )
    }
  }

  public render() {
    return (
      <section
        className="unlock-ladder"
        role="group"
        aria-labelledby="unlock-ladder-title"
        aria-describedby="unlock-ladder-facts"
      >
        <h2 id="unlock-ladder-title">{this.text('title')}</h2>
        <p id="unlock-ladder-facts">{this.text('waitOnly')}</p>
        <p>{this.text('attemptsUnchanged')}</p>
        <p className="unlock-ladder-remaining" aria-live="polite">
          {this.text('remaining', {
            count: String(Math.max(0, this.props.remainingSkips)),
          })}
        </p>
        {this.state.message !== null && (
          <p className="unlock-ladder-status" role="status" aria-live="polite">
            {this.state.message}
          </p>
        )}
        <div role="group" aria-label={this.text('title')}>
          {this.renderChallenge()}
          <div className="unlock-ladder-actions">
            <Md3TonalButton
              type="button"
              label={this.state.submitting ? '…' : this.text('submit')}
              disabled={this.state.submitting || this.props.disabled === true}
              onClick={this.submit}
            />
            <Md3GhostButton
              type="button"
              label={this.text('cancel')}
              onClick={this.props.onCancel}
              disabled={this.state.submitting}
            />
          </div>
        </div>
      </section>
    )
  }
}
