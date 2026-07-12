import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextArea } from '../lib/text-area'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Tooltip } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'
import { Repository } from '../../models/repository'
import {
  applyTemplate,
  getAppliedTemplates,
  getTemplateById,
  getTemplateCatalog,
  GitIgnoreCategory,
  IAppliedTemplate,
  IGitIgnoreSuggestion,
  IGitIgnoreTemplate,
  removeTemplateSection,
  suggestGitIgnoreTemplates,
} from '../../lib/gitignore'

interface IGitIgnoreProps {
  readonly repository: Repository
  readonly text: string | null
  readonly onIgnoreTextChanged: (text: string) => void
  readonly onShowExamples: () => void
}

interface IGitIgnoreState {
  /** Ranked template suggestions from the working-tree probe. */
  readonly suggestions: ReadonlyArray<IGitIgnoreSuggestion>
  /** Whether the browse-catalog card is expanded. */
  readonly browseOpen: boolean
  /** The current catalog search filter. */
  readonly filter: string
}

/** Category grouping order and labels for the browse view. */
const CATEGORY_ORDER: ReadonlyArray<{
  readonly id: GitIgnoreCategory
  readonly label: string
}> = [
  { id: 'language', label: 'Languages' },
  { id: 'framework', label: 'Frameworks' },
  { id: 'editor', label: 'Editors & IDEs' },
  { id: 'build', label: 'Build & Infrastructure' },
  { id: 'os', label: 'Operating systems' },
]

/** A suggested-template chip that applies its template when clicked. */
class SuggestedChip extends React.Component<{
  readonly template: IGitIgnoreTemplate
  readonly reasons: string
  readonly onApply: (template: IGitIgnoreTemplate) => void
}> {
  private readonly buttonRef = createObservableRef<HTMLButtonElement>()

  private onClick = () => this.props.onApply(this.props.template)

  public render() {
    const { template, reasons } = this.props
    return (
      <button
        type="button"
        ref={this.buttonRef}
        className="gitignore-chip gitignore-chip-suggested"
        onClick={this.onClick}
      >
        {reasons.length > 0 && (
          <Tooltip target={this.buttonRef}>{reasons}</Tooltip>
        )}
        <Octicon symbol={octicons[template.octicon]} />
        <span className="gitignore-chip-label">{template.label}</span>
        <Octicon className="gitignore-chip-affordance" symbol={octicons.plus} />
      </button>
    )
  }
}

/** An applied-template chip with a trailing remove button. */
class AppliedChip extends React.Component<{
  readonly entry: IAppliedTemplate
  readonly symbol: typeof octicons[keyof typeof octicons]
  readonly onRemove: (templateId: string) => void
}> {
  private readonly removeRef = createObservableRef<HTMLButtonElement>()

  private onRemove = () => this.props.onRemove(this.props.entry.templateId)

  public render() {
    const { entry, symbol } = this.props
    const removeLabel = `Remove ${entry.label}`
    return (
      <span className="gitignore-chip gitignore-chip-applied">
        <Octicon symbol={symbol} />
        <span className="gitignore-chip-label">{entry.label}</span>
        <button
          type="button"
          ref={this.removeRef}
          className="gitignore-chip-remove"
          aria-label={removeLabel}
          onClick={this.onRemove}
        >
          <Tooltip target={this.removeRef}>{removeLabel}</Tooltip>
          <Octicon symbol={octicons.x} />
        </button>
      </span>
    )
  }
}

/** A catalog row that toggles its template on/off when clicked. */
class CatalogItem extends React.Component<{
  readonly template: IGitIgnoreTemplate
  readonly isApplied: boolean
  readonly onToggle: (template: IGitIgnoreTemplate) => void
}> {
  private onClick = () => this.props.onToggle(this.props.template)

  public render() {
    const { template, isApplied } = this.props
    const className = isApplied
      ? 'gitignore-catalog-item selected'
      : 'gitignore-catalog-item'
    return (
      <button
        type="button"
        className={className}
        aria-pressed={isApplied}
        onClick={this.onClick}
      >
        <Octicon
          className="gitignore-catalog-item-icon"
          symbol={octicons[template.octicon]}
        />
        <span className="gitignore-catalog-item-label">{template.label}</span>
        <Octicon
          className="gitignore-catalog-item-affordance"
          symbol={isApplied ? octicons.check : octicons.plus}
        />
      </button>
    )
  }
}

/**
 * A manager for the repository's `.gitignore` file: surfaces detected template
 * suggestions, the templates already applied, a searchable catalog, and the raw
 * editor. Save semantics are unchanged — every mutation routes back through
 * `onIgnoreTextChanged`, which the host `RepositorySettings` persists on submit.
 */
export class GitIgnore extends React.Component<
  IGitIgnoreProps,
  IGitIgnoreState
> {
  public constructor(props: IGitIgnoreProps) {
    super(props)
    this.state = {
      suggestions: [],
      browseOpen: false,
      filter: '',
    }
  }

  public async componentDidMount() {
    try {
      const suggestions = await suggestGitIgnoreTemplates(
        this.props.repository.path
      )
      this.setState({ suggestions })
    } catch (e) {
      log.warn(
        `GitIgnore: unable to compute suggestions for ${this.props.repository.path}`,
        e
      )
    }
  }

  private getAppliedIds(): ReadonlySet<string> {
    return new Set(getAppliedTemplates(this.props.text).map(t => t.templateId))
  }

  private onApplyTemplate = (template: IGitIgnoreTemplate) => {
    this.props.onIgnoreTextChanged(applyTemplate(this.props.text, template))
  }

  private onRemoveTemplate = (templateId: string) => {
    this.props.onIgnoreTextChanged(
      removeTemplateSection(this.props.text ?? '', templateId)
    )
  }

  private onToggleTemplate = (template: IGitIgnoreTemplate) => {
    if (this.getAppliedIds().has(template.id)) {
      this.onRemoveTemplate(template.id)
    } else {
      this.onApplyTemplate(template)
    }
  }

  private onToggleBrowse = () => {
    this.setState({ browseOpen: !this.state.browseOpen })
  }

  private onFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ filter: event.currentTarget.value })
  }

  private renderSuggestions(appliedIds: ReadonlySet<string>) {
    const available = this.state.suggestions.filter(
      s => !appliedIds.has(s.templateId)
    )

    if (available.length === 0) {
      return null
    }

    return (
      <section className="gitignore-section">
        <h3 className="gitignore-section-title">
          <Octicon symbol={octicons.lightBulb} />
          Suggested for this repository
        </h3>
        <div className="gitignore-chip-row">
          {available.map(suggestion => {
            const template = getTemplateById(suggestion.templateId)
            if (template === undefined) {
              return null
            }
            return (
              <SuggestedChip
                key={template.id}
                template={template}
                reasons={suggestion.reasons.join(' · ')}
                onApply={this.onApplyTemplate}
              />
            )
          })}
        </div>
      </section>
    )
  }

  private renderApplied() {
    const applied = getAppliedTemplates(this.props.text)

    if (applied.length === 0) {
      return null
    }

    return (
      <section className="gitignore-section">
        <h3 className="gitignore-section-title">
          <Octicon symbol={octicons.check} />
          Applied templates
        </h3>
        <div className="gitignore-chip-row">
          {applied.map(entry => {
            const template = getTemplateById(entry.templateId)
            const symbol = template ? octicons[template.octicon] : octicons.file
            return (
              <AppliedChip
                key={entry.templateId}
                entry={entry}
                symbol={symbol}
                onRemove={this.onRemoveTemplate}
              />
            )
          })}
        </div>
      </section>
    )
  }

  private renderBrowse(appliedIds: ReadonlySet<string>) {
    const filter = this.state.filter.trim().toLowerCase()
    const catalog = getTemplateCatalog().filter(
      t => filter.length === 0 || t.label.toLowerCase().includes(filter)
    )

    return (
      <section className="gitignore-section gitignore-browse">
        <button
          type="button"
          className="gitignore-browse-toggle"
          aria-expanded={this.state.browseOpen}
          onClick={this.onToggleBrowse}
        >
          <Octicon
            symbol={
              this.state.browseOpen
                ? octicons.chevronDown
                : octicons.chevronRight
            }
          />
          <span className="gitignore-section-title-text">
            Browse all templates
          </span>
        </button>

        {this.state.browseOpen && (
          <div className="gitignore-browse-card">
            <div className="gitignore-search">
              <Octicon
                className="gitignore-search-icon"
                symbol={octicons.search}
              />
              <input
                type="text"
                className="gitignore-search-input"
                placeholder="Search templates"
                aria-label="Search templates"
                value={this.state.filter}
                onChange={this.onFilterChanged}
              />
            </div>

            {catalog.length === 0 ? (
              <div className="gitignore-catalog-empty">
                No templates match “{this.state.filter}”.
              </div>
            ) : (
              CATEGORY_ORDER.map(category => {
                const items = catalog.filter(t => t.category === category.id)
                if (items.length === 0) {
                  return null
                }
                return (
                  <div key={category.id} className="gitignore-catalog-group">
                    <div className="gitignore-catalog-group-label">
                      {category.label}
                    </div>
                    <div className="gitignore-catalog-grid">
                      {items.map(template => (
                        <CatalogItem
                          key={template.id}
                          template={template}
                          isApplied={appliedIds.has(template.id)}
                          onToggle={this.onToggleTemplate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </section>
    )
  }

  private renderRawEditor() {
    return (
      <section className="gitignore-section">
        <h3 className="gitignore-section-title">
          <Octicon symbol={octicons.file} />
          <Ref>.gitignore</Ref>
        </h3>
        <p id="ignored-files-description" className="gitignore-raw-description">
          This file specifies intentionally untracked files that Git should
          ignore. Files already tracked by Git are not affected.{' '}
          <LinkButton onClick={this.props.onShowExamples}>
            Learn more about gitignore files
          </LinkButton>
        </p>
        <div className="gitignore-raw-card">
          <TextArea
            ariaLabel="Ignored files"
            ariaDescribedBy="ignored-files-description"
            placeholder="Ignored files"
            value={this.props.text || ''}
            onValueChanged={this.props.onIgnoreTextChanged}
            textareaClassName="gitignore"
          />
        </div>
      </section>
    )
  }

  public render() {
    const appliedIds = this.getAppliedIds()

    return (
      <DialogContent>
        <div className="gitignore-manager">
          {this.renderSuggestions(appliedIds)}
          {this.renderApplied()}
          {this.renderBrowse(appliedIds)}
          {this.renderRawEditor()}
        </div>
      </DialogContent>
    )
  }
}
