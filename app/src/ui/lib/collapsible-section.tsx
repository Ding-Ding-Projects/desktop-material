import * as React from 'react'
import classNames from 'classnames'

import {
  readCollapsibleState,
  writeCollapsibleState,
} from '../../lib/collapsed-state'

interface ICollapsibleSectionProps {
  /**
   * Stable identity for this surface, e.g. `releases-metadata`. Shared by
   * every repository, which is why the repository is a separate prop rather
   * than something to bake into this string.
   */
  readonly elementId: string

  /**
   * The repository this state belongs to. Undefined files the choice under a
   * shared bucket rather than not persisting it at all.
   */
  readonly repositoryKey: string | undefined

  /** The heading shown on the toggle itself. */
  readonly label: string

  /**
   * A short summary kept visible while the section is closed.
   *
   * Collapsing should cost the glance nothing: a filter row that is hiding an
   * active filter, or a metadata grid whose status the reader was relying on,
   * needs to say so from the closed state. Without it a collapsed section is
   * indistinguishable from an empty one.
   */
  readonly summary?: React.ReactNode

  /** What the section is when the user has never touched it. */
  readonly defaultExpanded?: boolean

  /**
   * A pre-existing global storage key to fall back to, for surfaces that
   * persisted their state before it became per-repository. Read once, never
   * written.
   */
  readonly legacyKey?: string

  readonly className?: string

  /** Announced as the region's name, for readers arriving by landmark. */
  readonly ariaLabel?: string

  readonly children: React.ReactNode
}

interface ICollapsibleSectionState {
  readonly expanded: boolean
}

let sectionSeed = 0

/**
 * A titled region the user can fold away, remembered per repository.
 *
 * Every collapsible surface in the app went through its own hand-rolled
 * button, its own storage key and its own ARIA wiring, which is how three of
 * them ended up remembering their state globally — collapse the filters for
 * one repository and every other repository lost them too. One component means
 * one set of answers to those questions.
 *
 * Content is unmounted rather than hidden with CSS when closed. A collapsed
 * section that still renders keeps its subscriptions, its timers and its
 * measured layout alive, which is exactly what a reader collapsing a heavy
 * panel is trying to stop.
 */
export class CollapsibleSection extends React.Component<
  ICollapsibleSectionProps,
  ICollapsibleSectionState
> {
  private readonly regionId = `collapsible-section-${++sectionSeed}`

  public constructor(props: ICollapsibleSectionProps) {
    super(props)
    this.state = {
      expanded:
        readCollapsibleState(props.elementId, props.repositoryKey, {
          legacyKey: props.legacyKey,
          defaultExpanded: props.defaultExpanded,
        }) ??
        props.defaultExpanded ??
        true,
    }
  }

  public componentDidUpdate(previous: ICollapsibleSectionProps) {
    // Switching repositories has to re-read, or the new repository inherits
    // whatever the last one was left at - the precise thing per-repository
    // state exists to prevent.
    if (
      previous.repositoryKey === this.props.repositoryKey &&
      previous.elementId === this.props.elementId
    ) {
      return
    }
    this.setState({
      expanded:
        readCollapsibleState(this.props.elementId, this.props.repositoryKey, {
          legacyKey: this.props.legacyKey,
          defaultExpanded: this.props.defaultExpanded,
        }) ??
        this.props.defaultExpanded ??
        true,
    })
  }

  private onToggle = () => {
    const expanded = !this.state.expanded
    this.setState({ expanded })
    writeCollapsibleState(
      this.props.elementId,
      this.props.repositoryKey,
      expanded
    )
  }

  public render() {
    const { expanded } = this.state

    return (
      <div
        className={classNames('collapsible-section', this.props.className, {
          'is-collapsed': !expanded,
        })}
      >
        <button
          type="button"
          className="collapsible-section-toggle"
          aria-expanded={expanded}
          aria-controls={this.regionId}
          onClick={this.onToggle}
        >
          <span className="collapsible-section-label">{this.props.label}</span>
          {this.props.summary !== undefined && (
            <span
              className="collapsible-section-summary"
              // The summary is the whole point of the closed state, so a
              // change to it while closed has to be announced rather than
              // waiting for the reader to open the section and find out.
              aria-live="polite"
              aria-atomic="true"
            >
              {this.props.summary}
            </span>
          )}
        </button>
        <div
          id={this.regionId}
          className="collapsible-section-content"
          role="region"
          aria-label={this.props.ariaLabel ?? this.props.label}
          hidden={!expanded}
        >
          {expanded && this.props.children}
        </div>
      </div>
    )
  }
}
