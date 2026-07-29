import * as React from 'react'
import { translate, TranslationKey } from '../../../lib/i18n'
import { LanguageMode } from '../../../models/language-mode'
import { Octicon, OcticonSymbol } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'

/** A single teaching section of the "How regex works" guide. */
export interface IRegexGuideSection {
  /** The leading symbol rendered beside the section title. */
  readonly icon: OcticonSymbol
  readonly titleKey: TranslationKey
  readonly bodyKey: TranslationKey
  /** An optional highlighted example pattern. */
  readonly code?: string
  /** The muted explanation rendered after the example pattern. */
  readonly codeNoteKey?: TranslationKey
}

/**
 * The static "How regex works" guide content for the renderer-safe RE2
 * dialect. Octicons stand in for the prototype's
 * Material Symbols (school→mortarBoard, anchor→pin, category→apps,
 * repeat→iterations, join_inner→gitMerge, call_split→gitBranch, flag→flag,
 * search→search).
 */
export const RegexGuideSections: ReadonlyArray<IRegexGuideSection> = [
  {
    icon: octicons.mortarBoard,
    titleKey: 'regex.builder.guide.matching.title',
    bodyKey: 'regex.builder.guide.matching.body',
    code: 'material',
    codeNoteKey: 'regex.builder.guide.matching.note',
  },
  {
    icon: octicons.pin,
    titleKey: 'regex.builder.guide.anchors.title',
    bodyKey: 'regex.builder.guide.anchors.body',
    code: '^app/.*\\.scss$',
    codeNoteKey: 'regex.builder.guide.anchors.note',
  },
  {
    icon: octicons.apps,
    titleKey: 'regex.builder.guide.classes.title',
    bodyKey: 'regex.builder.guide.classes.body',
    code: '[0-9a-f]{7}',
    codeNoteKey: 'regex.builder.guide.classes.note',
  },
  {
    icon: octicons.iterations,
    titleKey: 'regex.builder.guide.quantifiers.title',
    bodyKey: 'regex.builder.guide.quantifiers.body',
    code: '".*?"',
    codeNoteKey: 'regex.builder.guide.quantifiers.note',
  },
  {
    icon: octicons.gitMerge,
    titleKey: 'regex.builder.guide.groups.title',
    bodyKey: 'regex.builder.guide.groups.body',
    code: '(?<area>app|docs)/',
    codeNoteKey: 'regex.builder.guide.groups.note',
  },
  {
    icon: octicons.gitBranch,
    titleKey: 'regex.builder.guide.alternation.title',
    bodyKey: 'regex.builder.guide.alternation.body',
    code: '\\.(scss|tsx?)$',
    codeNoteKey: 'regex.builder.guide.alternation.note',
  },
  {
    icon: octicons.flag,
    titleKey: 'regex.builder.guide.flags.title',
    bodyKey: 'regex.builder.guide.flags.body',
  },
  {
    icon: octicons.search,
    titleKey: 'regex.builder.guide.usage.title',
    bodyKey: 'regex.builder.guide.usage.body',
  },
]

/** The stagger step between consecutive guide-section entrances. */
const StaggerStepMs = 50

/** The upper bound on any guide-section entrance delay. */
const MaxStaggerMs = 450

/**
 * The scrollable "How regex works" guide panel — the alternate view of the
 * regex builder toggled by the Build / How regex works segmented tabs.
 * Purely static teaching content extracted from the v2 prototype's rbGuide.
 */
interface IRegexBuilderGuideProps {
  readonly hidden?: boolean
  readonly languageMode: LanguageMode
}

export class RegexBuilderGuide extends React.Component<IRegexBuilderGuideProps> {
  private renderSection(section: IRegexGuideSection, index: number) {
    const animationDelay = `${Math.min(index * StaggerStepMs, MaxStaggerMs)}ms`
    return (
      <section
        key={section.titleKey}
        className="regex-guide-section"
        style={{ animationDelay }}
      >
        <h3>
          <Octicon className="regex-guide-icon" symbol={section.icon} />
          {translate(section.titleKey, this.props.languageMode)}
        </h3>
        <p>{translate(section.bodyKey, this.props.languageMode)}</p>
        {section.code === undefined ? null : (
          <div className="regex-guide-code">
            <span className="regex-guide-code-token">{section.code}</span>
            <span className="regex-guide-code-note">
              {' '}
              {section.codeNoteKey === undefined
                ? null
                : translate(section.codeNoteKey, this.props.languageMode)}
            </span>
          </div>
        )}
      </section>
    )
  }

  public render() {
    return (
      <div
        id="regex-builder-view-guide"
        className="regex-builder-guide"
        role="tabpanel"
        aria-labelledby="regex-builder-view-tab-guide"
        hidden={this.props.hidden}
      >
        {RegexGuideSections.map((section, index) =>
          this.renderSection(section, index)
        )}
      </div>
    )
  }
}
