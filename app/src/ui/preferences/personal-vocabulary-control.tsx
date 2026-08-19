import * as React from 'react'
import { readFile, stat } from 'fs/promises'

import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { showOpenDialog } from '../main-process-proxy'
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
  setActivePersonalVocabulary,
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
  | {
      readonly kind: 'loaded'
      readonly vocabulary: IPersonalVocabulary
    }
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
  private readonly statusId = 'personal-vocabulary-status'

  public constructor(props: IPersonalVocabularyControlProps) {
    super(props)
    const cached = readCachedPersonalVocabulary()
    this.state = {
      status:
        cached === null
          ? { kind: 'none' }
          : {
              kind: 'loaded',
              vocabulary: cached,
            },
    }
  }

  private onChooseFile = async () => {
    const chosenPath = await showOpenDialog({
      title: 'Choose a vocabulary file',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (chosenPath === null) {
      return
    }

    const fileSize = await stat(chosenPath).then(
      result => result.size,
      () => {
        return null
      }
    )
    if (fileSize === null) {
      this.setState({
        status: {
          kind: 'unreadable',
          reason: 'That file could not be read. Nothing has been changed.',
        },
      })
      return
    }

    if (fileSize > MaxVocabularyBytes) {
      this.setState({
        status: {
          kind: 'rejected',
          reason: `That file is ${Math.round(
            fileSize / 1024
          )} KB, and the limit is ${Math.round(
            MaxVocabularyBytes / 1024
          )} KB. Nothing has been changed.`,
        },
      })
      return
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(chosenPath))
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
    setActivePersonalVocabulary(result.vocabulary)
    this.setState({
      status: {
        kind: 'loaded',
        vocabulary: result.vocabulary,
      },
    })
    this.props.onChanged?.(result.vocabulary)
  }

  private onClear = () => {
    clearPersonalVocabulary()
    setActivePersonalVocabulary(null)
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
            {/* The count, never the entries. The entries are the private part. */}
            A vocabulary file is loaded with {status.vocabulary.terms.size}{' '}
            {status.vocabulary.terms.size === 1 ? 'entry' : 'entries'}. It is
            held on this computer only.
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
    const fileSummary =
      this.state.status.kind === 'loaded'
        ? 'Local vocabulary file'
        : 'No file selected'
    return (
      <div className="personal-vocabulary-control">
        <TextBox
          label="Vocabulary file"
          value={fileSummary}
          readOnly={true}
          ariaDescribedBy={this.statusId}
        />
        <div className="personal-vocabulary-control-actions">
          <Button type="button" onClick={this.onChooseFile}>
            Choose file…
          </Button>
          {loaded ? (
            <Button
              type="button"
              onClick={this.onClear}
              tooltip="Remove the loaded vocabulary and restore the original wording"
            >
              Clear and restore original wording
            </Button>
          ) : null}
        </div>
        {this.renderStatus()}
        <details>
          <summary>What this file looks like</summary>
          <p className="settings-description">
            A JSON object declaring{' '}
            <code>"schemaVersion": {PersonalVocabularySchemaVersion}</code> and
            an <code>entries</code> object mapping the word the app renders to
            the word you would rather read. At most {MaxVocabularyEntries}{' '}
            entries and {Math.round(MaxVocabularyBytes / 1024)} KB. The current
            cache still tolerates older local data that used{' '}
            <code>"version"</code>, but new files use{' '}
            <code>"schemaVersion"</code>. It is read on this computer, never
            uploaded, and never included in an export, a screenshot, a
            diagnostic report or this app's history.
          </p>
        </details>
      </div>
    )
  }
}
