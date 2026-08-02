import * as React from 'react'
import {
  translate,
  translateForAccessibleName,
  TranslationKey,
} from '../../../lib/i18n'
import { MaxRegexPatternLength } from '../../../lib/safe-regex'
import { LanguageMode } from '../../../models/language-mode'
import { Button } from '../button'
import { TextBox } from '../text-box'
import { escapeLiteral } from './regex-block-model'

/** A single insertable token in the regex builder palette. */
export interface IRegexToken {
  /** The literal text appended to the pattern when the chip is clicked. */
  readonly token: string
  /** A short human readable description shown under the token. */
  readonly descriptionKey: TranslationKey
}

/** A named group of related tokens. */
export interface IRegexCategory {
  readonly nameKey: TranslationKey
  readonly tokens: ReadonlyArray<IRegexToken>
}

/**
 * The grouped palette shown down the left of the regex builder. Mirrors the
 * design's RB_CATS taxonomy.
 */
export const RegexCategories: ReadonlyArray<IRegexCategory> = [
  {
    nameKey: 'regex.builder.category.anchors',
    tokens: [
      { token: '^', descriptionKey: 'regex.builder.token.start' },
      { token: '$', descriptionKey: 'regex.builder.token.end' },
      {
        token: '\\b',
        descriptionKey: 'regex.builder.token.wordBoundary',
      },
      { token: '\\B', descriptionKey: 'regex.builder.token.nonBoundary' },
    ],
  },
  {
    nameKey: 'regex.builder.category.characterClasses',
    tokens: [
      { token: '.', descriptionKey: 'regex.builder.token.anyCharacter' },
      { token: '\\d', descriptionKey: 'regex.builder.token.digit' },
      { token: '\\D', descriptionKey: 'regex.builder.token.nonDigit' },
      {
        token: '\\w',
        descriptionKey: 'regex.builder.token.wordCharacter',
      },
      {
        token: '\\W',
        descriptionKey: 'regex.builder.token.nonWordCharacter',
      },
      { token: '\\s', descriptionKey: 'regex.builder.token.whitespace' },
      {
        token: '\\S',
        descriptionKey: 'regex.builder.token.nonWhitespace',
      },
      { token: '[abc]', descriptionKey: 'regex.builder.token.anyOf' },
      { token: '[^abc]', descriptionKey: 'regex.builder.token.noneOf' },
      { token: '[a-z]', descriptionKey: 'regex.builder.token.range' },
      { token: '\\t', descriptionKey: 'regex.builder.token.tab' },
    ],
  },
  {
    nameKey: 'regex.builder.category.quantifiers',
    tokens: [
      { token: '*', descriptionKey: 'regex.builder.token.zeroOrMore' },
      { token: '+', descriptionKey: 'regex.builder.token.oneOrMore' },
      { token: '?', descriptionKey: 'regex.builder.token.optional' },
      { token: '{3}', descriptionKey: 'regex.builder.token.exactlyThree' },
      { token: '{2,}', descriptionKey: 'regex.builder.token.twoOrMore' },
      {
        token: '{2,5}',
        descriptionKey: 'regex.builder.token.betweenTwoAndFive',
      },
      {
        token: '*?',
        descriptionKey: 'regex.builder.token.lazyZeroOrMore',
      },
      {
        token: '+?',
        descriptionKey: 'regex.builder.token.lazyOneOrMore',
      },
    ],
  },
  {
    nameKey: 'regex.builder.category.groups',
    tokens: [
      {
        token: '()',
        descriptionKey: 'regex.builder.token.capturingGroup',
      },
      {
        token: '(?:)',
        descriptionKey: 'regex.builder.token.nonCapturingGroup',
      },
      { token: '(?<name>)', descriptionKey: 'regex.builder.token.namedGroup' },
    ],
  },
  {
    nameKey: 'regex.builder.category.alternation',
    tokens: [
      { token: '|', descriptionKey: 'regex.builder.token.or' },
      { token: '(a|b)', descriptionKey: 'regex.builder.token.aOrB' },
    ],
  },
]

interface IRegexBuilderPaletteProps {
  readonly categories: ReadonlyArray<IRegexCategory>
  readonly activeCategory: number
  readonly languageMode: LanguageMode
  readonly onCategoryChange: (index: number) => void
  readonly onInsertToken: (token: string) => void
}

/**
 * The two-column palette body of the regex builder: a category rail on the left
 * and the grid of insertable token chips for the active category on the right.
 */
interface IRegexCategoryTabProps {
  readonly name: string
  readonly accessibleName: string
  readonly index: number
  readonly selected: boolean
  readonly onCategoryChange: (index: number) => void
  readonly onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => void
}

class RegexCategoryTab extends React.Component<IRegexCategoryTabProps> {
  private onClick = () => {
    this.props.onCategoryChange(this.props.index)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    this.props.onKeyDown(event, this.props.index)
  }

  public render() {
    const { name, accessibleName, selected } = this.props
    return (
      <button
        type="button"
        id={`regex-builder-category-${this.props.index}`}
        role="tab"
        aria-label={accessibleName}
        aria-selected={selected}
        aria-controls="regex-builder-token-list"
        tabIndex={selected ? 0 : -1}
        className={
          selected
            ? 'regex-builder-category selected'
            : 'regex-builder-category'
        }
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
      >
        {name}
      </button>
    )
  }
}

interface IRegexTokenChipProps {
  readonly token: IRegexToken
  readonly languageMode: LanguageMode
  readonly onInsertToken: (token: string) => void
}

class RegexTokenChip extends React.Component<IRegexTokenChipProps> {
  private onClick = () => {
    this.props.onInsertToken(this.props.token.token)
  }

  public render() {
    const { token, descriptionKey } = this.props.token
    const description = translate(descriptionKey, this.props.languageMode)
    const accessibleDescription = translateForAccessibleName(
      descriptionKey,
      {},
      this.props.languageMode
    )
    return (
      <button
        type="button"
        className="regex-builder-token"
        aria-label={accessibleDescription}
        onClick={this.onClick}
      >
        <span className="regex-builder-token-glyph">{token}</span>
        <span className="regex-builder-token-desc">{description}</span>
      </button>
    )
  }
}

interface IRegexLiteralComposerProps {
  readonly languageMode: LanguageMode
  readonly onInsertToken: (token: string) => void
}

interface IRegexLiteralComposerState {
  readonly value: string
}

/**
 * The guided way to search for text that is not a pattern.
 *
 * Every other chip in the palette inserts regex syntax, so a user hunting for
 * `c++` or `(WIP)` had no guided route at all: they had to know which of the
 * characters they typed carry meaning to the engine and hand-escape each one.
 * This routes the typed text through {@link escapeLiteral} instead, which is
 * also what makes that helper reachable in production for the first time.
 */
class RegexLiteralComposer extends React.Component<
  IRegexLiteralComposerProps,
  IRegexLiteralComposerState
> {
  public constructor(props: IRegexLiteralComposerProps) {
    super(props)
    this.state = { value: '' }
  }

  // Bound to the compiler's own pattern ceiling so the escaped result cannot
  // grow without limit while the user types.
  private onValueChanged = (value: string) => {
    this.setState({ value: value.slice(0, MaxRegexPatternLength) })
  }

  private onInsert = () => {
    const { value } = this.state
    if (value.length === 0) {
      return
    }
    this.props.onInsertToken(escapeLiteral(value))
    this.setState({ value: '' })
  }

  public render() {
    const { languageMode } = this.props
    const { value } = this.state

    return (
      <div className="regex-builder-literal">
        <TextBox
          label={translate('filter.regexBuilder.literalField', languageMode)}
          ariaLabel={translateForAccessibleName(
            'filter.regexBuilder.literalField',
            {},
            languageMode
          )}
          placeholder={translate(
            'filter.regexBuilder.literalPlaceholder',
            languageMode
          )}
          value={value}
          spellcheck={false}
          onValueChanged={this.onValueChanged}
          onEnterPressed={this.onInsert}
        />
        <Button
          disabled={value.length === 0}
          ariaLabel={translateForAccessibleName(
            'filter.regexBuilder.literalInsert',
            {},
            languageMode
          )}
          onClick={this.onInsert}
        >
          {translate('filter.regexBuilder.literalInsert', languageMode)}
        </Button>
        {value.length === 0 ? null : (
          <p className="regex-builder-literal-preview">
            <span className="regex-builder-token-desc">
              {translate('filter.regexBuilder.literalPreview', languageMode)}
            </span>{' '}
            <span className="regex-builder-token-glyph">
              {escapeLiteral(value)}
            </span>
          </p>
        )}
      </div>
    )
  }
}

export class RegexBuilderPalette extends React.Component<IRegexBuilderPaletteProps> {
  // The literal composer occupies the rail slot after the token categories, so
  // every count the rail derives — roving focus included — has to include it.
  private get literalCategoryIndex() {
    return this.props.categories.length
  }

  private onCategoryKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const categoryCount = this.literalCategoryIndex + 1

    let nextIndex = currentIndex
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % categoryCount
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + categoryCount) % categoryCount
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = categoryCount - 1
        break
      default:
        return
    }

    event.preventDefault()
    this.props.onCategoryChange(nextIndex)
    document.getElementById(`regex-builder-category-${nextIndex}`)?.focus()
  }

  public render() {
    const { categories, activeCategory, languageMode } = this.props
    const literalIndex = this.literalCategoryIndex
    const showLiteral = activeCategory === literalIndex
    const active = categories[activeCategory] ?? categories[0]

    return (
      <div className="regex-builder-palette">
        <div
          className="regex-builder-categories"
          role="tablist"
          aria-label={translateForAccessibleName(
            'regex.builder.categoriesLabel',
            {},
            languageMode
          )}
        >
          {categories.map((category, index) => (
            <RegexCategoryTab
              key={category.nameKey}
              name={translate(category.nameKey, languageMode)}
              accessibleName={translateForAccessibleName(
                category.nameKey,
                {},
                languageMode
              )}
              index={index}
              selected={index === activeCategory}
              onCategoryChange={this.props.onCategoryChange}
              onKeyDown={this.onCategoryKeyDown}
            />
          ))}
          <RegexCategoryTab
            name={translate(
              'filter.regexBuilder.literalCategory',
              languageMode
            )}
            accessibleName={translateForAccessibleName(
              'filter.regexBuilder.literalCategory',
              {},
              languageMode
            )}
            index={literalIndex}
            selected={showLiteral}
            onCategoryChange={this.props.onCategoryChange}
            onKeyDown={this.onCategoryKeyDown}
          />
        </div>
        <div
          id="regex-builder-token-list"
          className="regex-builder-tokens"
          role="tabpanel"
          aria-labelledby={`regex-builder-category-${activeCategory}`}
        >
          {showLiteral ? (
            <RegexLiteralComposer
              languageMode={languageMode}
              onInsertToken={this.props.onInsertToken}
            />
          ) : (
            (active?.tokens ?? []).map(t => (
              <RegexTokenChip
                key={t.token}
                token={t}
                languageMode={languageMode}
                onInsertToken={this.props.onInsertToken}
              />
            ))
          )}
        </div>
      </div>
    )
  }
}
