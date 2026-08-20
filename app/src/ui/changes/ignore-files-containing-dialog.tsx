import * as React from 'react'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { t } from '../../lib/i18n'

export function escapeWildcardLiteral(value: string): string {
  return value.replace(/[\\*?\[\]]/g, character => `\\${character}`)
}

export function wildcardPatternFromFilename(filename: string): string {
  return `*${escapeWildcardLiteral(filename)}*`
}

/** Compile the small, gitignore-style wildcard subset used by this dialog. */
export function wildcardPatternToRegExp(pattern: string): RegExp | null {
  if (pattern.length === 0 || pattern.length > 256) return null

  let source = '^'
  let characterClass = false
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '\\') {
      const next = pattern[index + 1]
      if (next === undefined) return null
      // Escape exactly once. `replace` already prepends the backslash for a
      // metacharacter; the template literal prepended a second one, so an
      // escaped metacharacter compiled to an escaped-backslash atom followed
      // by a bare metacharacter. Escaping a dot matched "a literal backslash,
      // then any character", and escaping a star produced a quantifier that
      // matched the empty string. A deliberately escaped character is the one
      // case where the user has said exactly what they mean.
      source += next.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
      index += 1
      continue
    }
    if (character === '*') {
      source += characterClass ? '*' : '.*'
      continue
    }
    if (character === '?') {
      source += characterClass ? '?' : '.'
      continue
    }
    if (character === '[') {
      if (characterClass) return null
      characterClass = true
      source += '['
      continue
    }
    if (character === ']' && characterClass) {
      characterClass = false
      source += ']'
      continue
    }
    if (characterClass) {
      source += character.replace(/[\\^]/g, '\\$&')
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
    }
  }
  if (characterClass) return null
  try {
    return new RegExp(`${source}$`, 'i')
  } catch {
    return null
  }
}

export function wildcardPreview(
  pattern: string,
  paths: ReadonlyArray<string>
): ReadonlyArray<string> {
  const expression = wildcardPatternToRegExp(pattern)
  if (expression === null) return []
  return paths.filter(path => expression.test(Path.basename(path)))
}

interface IIgnoreFilesContainingProps {
  readonly repository: Repository
  readonly filename: string
  readonly paths: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IIgnoreFilesContainingState {
  readonly pattern: string
  readonly isSaving: boolean
  readonly error: string | null
}

export class IgnoreFilesContainingDialog extends React.Component<
  IIgnoreFilesContainingProps,
  IIgnoreFilesContainingState
> {
  public constructor(props: IIgnoreFilesContainingProps) {
    super(props)
    this.state = {
      pattern: wildcardPatternFromFilename(Path.basename(props.filename)),
      isSaving: false,
      error: null,
    }
  }

  private updatePattern = (pattern: string) => {
    this.setState({ pattern, error: null })
  }

  private insertWildcard = (token: '*' | '?' | '[ ]') => {
    this.setState(previous => ({
      pattern: `${previous.pattern}${token}`,
      error: null,
    }))
  }

  private onSubmit = async () => {
    const preview = wildcardPreview(this.state.pattern, this.props.paths)
    if (wildcardPatternToRegExp(this.state.pattern) === null) {
      this.setState({ error: t('ignoreFilesContaining.invalidPattern') })
      return
    }
    if (preview.length === 0) {
      this.setState({ error: t('ignoreFilesContaining.noMatches') })
      return
    }
    this.setState({ isSaving: true, error: null })
    try {
      await this.props.dispatcher.appendIgnoreRule(
        this.props.repository,
        this.state.pattern
      )
      this.props.onDismissed()
    } catch (error) {
      this.setState({
        isSaving: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  public render() {
    const preview = wildcardPreview(this.state.pattern, this.props.paths)
    const valid = wildcardPatternToRegExp(this.state.pattern) !== null
    const disabled = this.state.isSaving || !valid || preview.length === 0

    return (
      <Dialog
        id="ignore-files-containing"
        title={t('ignoreFilesContaining.title')}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isSaving}
        loading={this.state.isSaving}
      >
        <DialogContent>
          <p>{t('ignoreFilesContaining.description')}</p>
          <TextBox
            label={t('ignoreFilesContaining.patternLabel')}
            value={this.state.pattern}
            onValueChanged={this.updatePattern}
            disabled={this.state.isSaving}
            ariaDescribedBy="ignore-files-containing-preview"
          />
          <div
            role="group"
            aria-label={t('ignoreFilesContaining.builderLabel')}
          >
            <span>{t('ignoreFilesContaining.builderLabel')}</span>
            <Button type="button" onClick={() => this.insertWildcard('*')}>
              *
            </Button>
            <Button type="button" onClick={() => this.insertWildcard('?')}>
              ?
            </Button>
            <Button type="button" onClick={() => this.insertWildcard('[ ]')}>
              [set]
            </Button>
          </div>
          <div id="ignore-files-containing-preview" aria-live="polite">
            {t('ignoreFilesContaining.preview', {
              count: String(preview.length),
            })}
            {preview.length > 0 ? (
              <ul>
                {preview.slice(0, 100).map(path => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {this.state.error !== null ? (
            <p role="alert">{this.state.error}</p>
          ) : null}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('ignoreFilesContaining.confirm')}
            okButtonDisabled={disabled}
            cancelButtonDisabled={this.state.isSaving}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
