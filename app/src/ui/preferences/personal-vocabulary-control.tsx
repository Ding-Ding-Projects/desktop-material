import * as React from 'react'

import {
  IPersonalVocabulary,
  MaxVocabularyBytes,
  MaxVocabularyEntries,
  PersonalVocabularySchemaVersion,
  cachePersonalVocabulary,
  clearPersonalVocabulary,
  describeVocabularyRejection,
  parsePersonalVocabulary,
  readCachedPersonalVocabulary,
} from '../../lib/personal-vocabulary'

/**
 * Where the user uploads their own vocabulary file.
 *
 * The control is visible **before a file exists**, which is the whole point: a
 * feature that only appears once it is already in use is a feature nobody
 * discovers. So there is always a file picker here, always an honest statement
 * of what is currently in effect, and — until a valid file is supplied — an
 * explicit "no file, everything reads as shipped".
 *
 * Nothing ships with mappings. No samples, no templates, no defaults. A
 * built-in example would be exactly the private content this feature exists to
 * keep out of the repository, and it would also be a lie about what the app is
 * currently rendering.
 *
 * Everything is local: the file is read in the renderer, validated in full
 * before any of it is displayed or cached, and never uploaded, logged, exported
 * or put in a capture. A refused file changes nothing at all — not even
 * partially — because a half-applied vocabulary leaves the user unable to tell
 * which words on screen are theirs.
 */

type VocabularyState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loaded'; readonly vocabulary: IPersonalVocabulary }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'unreadable'; readonly reason: string }

interface IPersonalVocabularyControlProps {
  /** Raised when the active vocabulary changes, so surfaces can re-render. */
  readonly onChanged?: (vocabulary: IPersonalVocabulary | null) => void
}

interface IPersonalVocabularyControlState {
  readonly status: VocabularyState
}

export class PersonalVocabularyControl extends React.Component<
  IPersonalVocabularyControlProps,
  IPersonalVocabularyControlState
> {
  private readonly inputId = 'personal-vocabulary-file'
  private readonly statusId = 'personal-vocabulary-status'

  public constructor(props: IPersonalVocabularyControlProps) {
    super(props)
    const cached = readCachedPersonalVocabulary()
    this.state = {
      status:
        cached === null
          ? { kind: 'none' }
          : { kind: 'loaded', vocabulary: cached },
    }
  }

  private onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    // Clearing the input means choosing the same file twice in a row still
    // raises a change event, which is otherwise a control that works once.
    event.currentTarget.value = ''
    if (file === undefined) {
      return
    }

    // The size is checked here as well as inside the validator, so a file far
    // over the limit is never read into memory in the first place.
    if (file.size > MaxVocabularyBytes) {
      this.setState({
        status: {
          kind: 'rejected',
          reason: `That file is ${Math.round(
            file.size / 1024
          )} KB, and the limit is ${Math.round(
            MaxVocabularyBytes / 1024
          )} KB. Nothing has been changed.`,
        },
      })
      return
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch (error) {
      this.setState({
        status: {
          kind: 'unreadable',
          reason: `That file could not be read: ${
            error instanceof Error ? error.message : String(error)
          }. Nothing has been changed.`,
        },
      })
      return
    }

    const result = parsePersonalVocabulary(bytes)
    if (!result.ok) {
      // Note what is *not* happening here: the previously loaded vocabulary,
      // if any, stays exactly as it was. A refused file never displaces a good
      // one.
      this.setState({
        status: {
          kind: 'rejected',
          reason: describeVocabularyRejection(result.rejection),
        },
      })
      return
    }

    cachePersonalVocabulary(result.vocabulary)
    this.setState({ status: { kind: 'loaded', vocabulary: result.vocabulary } })
    this.props.onChanged?.(result.vocabulary)
  }

  private onClear = () => {
    clearPersonalVocabulary()
    this.setState({ status: { kind: 'none' } })
    this.props.onChanged?.(null)
  }

  private renderStatus() {
    const { status } = this.state
    switch (status.kind) {
      case 'none':
        return (
          <p className="settings-description" id={this.statusId}>
            No vocabulary file is loaded. Every surface is rendering its
            original wording.
          </p>
        )
      case 'loaded':
        return (
          <p className="settings-description" id={this.statusId}>
            {/* The count, never the terms. The terms are the private part. */}A
            vocabulary file is loaded with {status.vocabulary.terms.size}{' '}
            {status.vocabulary.terms.size === 1 ? 'term' : 'terms'}. It is held
            on this computer only.
          </p>
        )
      case 'rejected':
      case 'unreadable':
        return (
          <p
            className="settings-description is-error"
            id={this.statusId}
            role="alert"
          >
            {status.reason}
          </p>
        )
    }
  }

  public render() {
    const loaded = this.state.status.kind === 'loaded'
    return (
      <div className="personal-vocabulary-control">
        <label htmlFor={this.inputId}>Personal vocabulary file</label>
        <input
          id={this.inputId}
          type="file"
          accept="application/json,.json"
          aria-describedby={this.statusId}
          onChange={this.onFileChosen}
        />
        <button
          type="button"
          onClick={this.onClear}
          disabled={!loaded}
          title={
            loaded
              ? 'Remove the loaded vocabulary and restore the original wording'
              : 'There is no vocabulary file to clear'
          }
        >
          {loaded ? 'Clear and restore original wording' : 'Nothing to clear'}
        </button>
        {this.renderStatus()}
        <details>
          <summary>What this file looks like</summary>
          <p className="settings-description">
            A JSON object declaring{' '}
            <code>"version": {PersonalVocabularySchemaVersion}</code> and a{' '}
            <code>terms</code> object mapping the word the app renders to the
            word you would rather read. At most {MaxVocabularyEntries} terms and{' '}
            {Math.round(MaxVocabularyBytes / 1024)} KB. It is read on this
            computer, never uploaded, and never included in an export, a
            screenshot, a diagnostic report or this app's history.
          </p>
        </details>
      </div>
    )
  }
}
