import * as React from 'react'

/** A single insertable token in the regex builder palette. */
export interface IRegexToken {
  /** The literal text appended to the pattern when the chip is clicked. */
  readonly token: string
  /** A short human readable description shown under the token. */
  readonly description: string
}

/** A named group of related tokens. */
export interface IRegexCategory {
  readonly name: string
  readonly tokens: ReadonlyArray<IRegexToken>
}

/**
 * The grouped palette shown down the left of the regex builder. Mirrors the
 * design's RB_CATS taxonomy.
 */
export const RegexCategories: ReadonlyArray<IRegexCategory> = [
  {
    name: 'Anchors',
    tokens: [
      { token: '^', description: 'start of searched item' },
      { token: '$', description: 'end of searched item' },
      { token: '\\b', description: 'word boundary' },
      { token: '\\B', description: 'non-boundary' },
    ],
  },
  {
    name: 'Character classes',
    tokens: [
      { token: '.', description: 'any character' },
      { token: '\\d', description: 'digit' },
      { token: '\\D', description: 'non-digit' },
      { token: '\\w', description: 'word char' },
      { token: '\\W', description: 'non-word char' },
      { token: '\\s', description: 'whitespace' },
      { token: '\\S', description: 'non-whitespace' },
      { token: '[abc]', description: 'any of a, b, c' },
      { token: '[^abc]', description: 'none of a, b, c' },
      { token: '[a-z]', description: 'a range' },
      { token: '\\t', description: 'tab' },
    ],
  },
  {
    name: 'Quantifiers',
    tokens: [
      { token: '*', description: 'zero or more' },
      { token: '+', description: 'one or more' },
      { token: '?', description: 'optional' },
      { token: '{3}', description: 'exactly 3' },
      { token: '{2,}', description: '2 or more' },
      { token: '{2,5}', description: 'between 2 and 5' },
      { token: '*?', description: 'lazy zero or more' },
      { token: '+?', description: 'lazy one or more' },
    ],
  },
  {
    name: 'Groups',
    tokens: [
      { token: '()', description: 'capturing group' },
      { token: '(?:)', description: 'non-capturing group' },
      { token: '(?<name>)', description: 'named group' },
    ],
  },
  {
    name: 'Alternation',
    tokens: [
      { token: '|', description: 'or' },
      { token: '(a|b)', description: 'a or b' },
    ],
  },
]

interface IRegexBuilderPaletteProps {
  readonly categories: ReadonlyArray<IRegexCategory>
  readonly activeCategory: number
  readonly onCategoryChange: (index: number) => void
  readonly onInsertToken: (token: string) => void
}

/**
 * The two-column palette body of the regex builder: a category rail on the left
 * and the grid of insertable token chips for the active category on the right.
 */
interface IRegexCategoryTabProps {
  readonly name: string
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
    const { name, selected } = this.props
    return (
      <button
        type="button"
        id={`regex-builder-category-${this.props.index}`}
        role="tab"
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
  readonly onInsertToken: (token: string) => void
}

class RegexTokenChip extends React.Component<IRegexTokenChipProps> {
  private onClick = () => {
    this.props.onInsertToken(this.props.token.token)
  }

  public render() {
    const { token, description } = this.props.token
    return (
      <button
        type="button"
        className="regex-builder-token"
        aria-label={description}
        onClick={this.onClick}
      >
        <span className="regex-builder-token-glyph">{token}</span>
        <span className="regex-builder-token-desc">{description}</span>
      </button>
    )
  }
}

export class RegexBuilderPalette extends React.Component<IRegexBuilderPaletteProps> {
  private onCategoryKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    const categoryCount = this.props.categories.length
    if (categoryCount === 0) {
      return
    }

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
    const { categories, activeCategory } = this.props
    const active = categories[activeCategory] ?? categories[0]

    return (
      <div className="regex-builder-palette">
        <div
          className="regex-builder-categories"
          role="tablist"
          aria-label="Regular expression building-block categories"
        >
          {categories.map((category, index) => (
            <RegexCategoryTab
              key={category.name}
              name={category.name}
              index={index}
              selected={index === activeCategory}
              onCategoryChange={this.props.onCategoryChange}
              onKeyDown={this.onCategoryKeyDown}
            />
          ))}
        </div>
        <div
          id="regex-builder-token-list"
          className="regex-builder-tokens"
          role="tabpanel"
          aria-labelledby={`regex-builder-category-${activeCategory}`}
        >
          {active.tokens.map(t => (
            <RegexTokenChip
              key={t.token}
              token={t}
              onInsertToken={this.props.onInsertToken}
            />
          ))}
        </div>
      </div>
    )
  }
}
