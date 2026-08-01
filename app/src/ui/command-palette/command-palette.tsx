import * as React from 'react'
import classNames from 'classnames'
import { Dialog, DialogContent } from '../dialog'
import {
  CommandPaletteCatalog,
  IPaletteChoiceControl,
  IPaletteCommand,
  IPaletteCommandContext,
  IPaletteControl,
  IPaletteEntryControl,
  IPaletteHome,
  IPaletteNumberControl,
  PaletteControlValue,
  filterPaletteCommands,
  resolvePaletteHome,
} from '../../lib/command-palette-catalog'
import { settingsTabNameKey } from '../../lib/settings-search/settings-search-catalog'
import { t, translateForAccessibleName } from '../../lib/i18n'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { isDesktopMaterialFeatureEntryPoint } from '../../lib/desktop-material-features'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { MaterialSymbol } from '../lib/material-symbol'
import { MaterialSwitch } from '../lib/material-switch'
import {
  ICommandPaletteAppearance,
  persistCommandPaletteAppearance,
  readCommandPaletteAppearance,
  resolveCommandPaletteAppearance,
  resolveCommandSymbol,
} from './command-palette-appearance'
import { CommandPaletteAppearanceEditor } from './command-palette-appearance-editor'
import { RepositorySettingsTab } from '../../models/repository-settings'
import type { TranslationKey } from '../../lib/i18n-resources'

/** The persistence id for the palette's filter mode. */
const PaletteFilterListId = 'command-palette'

/** The id the results listbox is referenced by from the search box. */
const PaletteResultsId = 'command-palette-results'

/** The row element id `aria-activedescendant` points at. */
function paletteRowId(index: number): string {
  return `command-palette-row-${index}`
}

/**
 * The visible title in the active language mode: a localized title when the
 * command declares an i18n key, otherwise its English fallback title.
 */
function resolvePaletteTitle(command: IPaletteCommand): string {
  return command.titleKey !== undefined ? t(command.titleKey) : command.title
}

/** Localize the six stable catalog groups shown as row chips. */
function resolvePaletteGroup(group: string): string {
  switch (group) {
    case 'App':
      return t('commandPalette.groupApp')
    case 'Branch':
      return t('commandPalette.groupBranch')
    case 'Changes':
      return t('commandPalette.groupChanges')
    case 'Edit':
      return t('commandPalette.groupEdit')
    case 'Navigate':
      return t('commandPalette.groupNavigate')
    case 'Repository':
      return t('commandPalette.groupRepository')
    default:
      return group
  }
}

/** The localized name of the place a command's feature lives. */
export function resolvePaletteHomeLabel(home: IPaletteHome): string {
  switch (home.kind) {
    case 'preferences':
      return t('commandPalette.homeSettings', {
        tab: t(settingsTabNameKey(home.tab)),
      })
    case 'repositorySettings':
      // Named as the repository's own settings rather than as "Settings", so
      // a reader is not sent looking in the app-wide dialog for a per-
      // repository option that is not there.
      return t('commandPalette.homeRepositorySettings', {
        tab: t(repositorySettingsTabNameKey(home.tab)),
      })
    default:
      return t(home.labelKey)
  }
}

/** The localized name of a repository settings tab. */
function repositorySettingsTabNameKey(
  tab: RepositorySettingsTab
): TranslationKey {
  switch (tab) {
    case RepositorySettingsTab.Remote:
      return 'repositorySettings.tabRemote'
    case RepositorySettingsTab.IgnoredFiles:
      return 'repositorySettings.tabIgnoredFiles'
    case RepositorySettingsTab.GitConfig:
      return 'repositorySettings.tabGitConfig'
    case RepositorySettingsTab.BuildRun:
      return 'repositorySettings.tabBuildRun'
    case RepositorySettingsTab.CheapLfs:
      return 'repositorySettings.tabCheapLfs'
    case RepositorySettingsTab.Submodules:
      return 'repositorySettings.tabSubmodules'
    case RepositorySettingsTab.Subtrees:
      return 'repositorySettings.tabSubtrees'
    case RepositorySettingsTab.Automation:
      return 'repositorySettings.tabAutomation'
    case RepositorySettingsTab.Metadata:
      return 'repositorySettings.tabMetadata'
    case RepositorySettingsTab.Appearance:
      return 'repositorySettings.tabAppearance'
    case RepositorySettingsTab.ForkSettings:
      return 'repositorySettings.tabForkSettings'
  }
}

/**
 * The keys a query is matched against: the (localized) title first (fuzzy
 * scoring's primary key), then group/keywords/event plus the English title
 * folded into one secondary key so search keeps working in every language.
 */
function getPaletteCommandKeys(
  command: IPaletteCommand
): ReadonlyArray<string> {
  return [
    resolvePaletteTitle(command),
    `${command.title} ${command.group} ${resolvePaletteGroup(command.group)} ${
      command.keywords ?? ''
    } ${command.event}`,
  ]
}

/** The stored value as text a box can show and a user can edit. */
function controlValueText(
  control: IPaletteControl,
  value: PaletteControlValue | undefined
): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (control.kind === 'toggle') {
    return value === true
      ? t('commandPalette.valueOn')
      : t('commandPalette.valueOff')
  }
  return String(value)
}

interface ICommandPaletteProps {
  /** Executes the chosen command's menu event or palette action id. */
  readonly onExecute: (event: string) => void

  /**
   * Takes the user to where the command's feature lives — the toolbar button,
   * the settings row, the pane that owns it — instead of running it.
   *
   * Omitting it makes choosing a row fall back to executing the command, which
   * is the same thing for every command whose feature *is* the dialog it opens.
   */
  readonly onTeleport?: (command: IPaletteCommand) => void

  /**
   * The live value behind every command that carries a control, keyed by the
   * command's event id. A command whose value is missing renders its control
   * disabled rather than pretending a default is the current setting.
   */
  readonly controlValues?: ReadonlyMap<string, PaletteControlValue>

  /** Writes a new value for a command's control. */
  readonly onControlChange?: (event: string, value: PaletteControlValue) => void

  /**
   * The current selection snapshot used to hide commands that cannot run
   * right now. When omitted, every platform-eligible command is offered.
   */
  readonly availabilityContext?: IPaletteCommandContext

  readonly onDismissed: () => void
}

interface ICommandPaletteState {
  readonly query: string
  readonly highlightedIndex: number
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly appearance: ICommandPaletteAppearance
  /**
   * Text the user has typed into an entry or number control but not applied
   * yet, keyed by command event. Absent means "show the live value".
   */
  readonly drafts: ReadonlyMap<string, string>
}

/**
 * The Ctrl+F master command palette.
 *
 * It covers the whole app (Material Design 3's full-screen search view): a
 * docked search field over a list of every named app function, where a row is
 * not merely a name to dispatch but the feature itself — a setting renders its
 * live control inline (a switch for a boolean, a box for text, a stepper for a
 * number, a select for a choice), and choosing any row teleports to the place
 * that owns the feature rather than firing it blind.
 */
export class CommandPalette extends React.Component<
  ICommandPaletteProps,
  ICommandPaletteState
> {
  private inputRef = React.createRef<HTMLInputElement>()

  /**
   * Stable per-command toggle handlers, so the switch's onChange prop keeps
   * identity across renders (react/jsx-no-bind).
   */
  private toggleHandlers = new Map<string, (checked: boolean) => void>()

  public constructor(props: ICommandPaletteProps) {
    super(props)
    this.state = {
      query: '',
      highlightedIndex: 0,
      filterMode: readPersistedFilterMode(PaletteFilterListId),
      filterCaseSensitive: false,
      appearance: readCommandPaletteAppearance(),
      drafts: new Map<string, string>(),
    }
  }

  private onAppearanceChanged = (appearance: ICommandPaletteAppearance) => {
    persistCommandPaletteAppearance(appearance)
    this.setState({ appearance })
  }

  public componentDidMount() {
    this.inputRef.current?.focus()
  }

  private getMatches(): ReadonlyArray<IPaletteCommand> {
    const eligible = filterPaletteCommands(
      CommandPaletteCatalog,
      '',
      process.platform,
      this.props.availabilityContext
    )

    if (this.state.query.trim().length === 0) {
      return eligible
    }

    const { results } = matchWithMode(
      this.state.query,
      eligible,
      getPaletteCommandKeys,
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )

    return results.map(r => r.item)
  }

  /** Run the command, closing the palette the way a menu item would. */
  private execute(command: IPaletteCommand) {
    this.props.onDismissed()
    this.props.onExecute(command.event)
  }

  /**
   * Go to where the feature lives. Without a teleport host — a bare palette in
   * a test, say — this falls back to running the command, which is what
   * "going to" a dialog-hosted feature has always meant.
   */
  private teleport(command: IPaletteCommand) {
    const { onTeleport } = this.props
    this.props.onDismissed()
    if (onTeleport === undefined) {
      this.props.onExecute(command.event)
      return
    }
    onTeleport(command)
  }

  private onQueryChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: event.target.value, highlightedIndex: 0 })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(PaletteFilterListId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string) => {
    this.setState({ query: pattern, highlightedIndex: 0 })
  }

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.getMatches().map(resolvePaletteTitle)

  private onKeyDown = (event: React.KeyboardEvent) => {
    const matches = this.getMatches()

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) {
        return
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      this.setState(previous => ({
        highlightedIndex:
          (previous.highlightedIndex + direction + matches.length) %
          matches.length,
      }))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[this.state.highlightedIndex] ?? matches[0]
      if (command === undefined) {
        return
      }

      // Enter goes where the feature lives — the same thing clicking the row
      // does. Ctrl/Cmd+Enter is the deliberate "run it from here" gesture, so
      // a destructive command can never be one stray Enter away.
      if (event.ctrlKey || event.metaKey) {
        this.execute(command)
      } else {
        this.teleport(command)
      }
    }
  }

  private commandForEvent(event: string): IPaletteCommand | undefined {
    return this.getMatches().find(command => command.event === event)
  }

  private onRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Clicks that land on a row's own control (a switch, a box, Run) are that
    // control's business; only the row body teleports.
    if (
      event.target instanceof Element &&
      event.target.closest('.command-palette-row-actions') !== null
    ) {
      return
    }

    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (command !== undefined) {
      this.teleport(command)
    }
  }

  /**
   * Keyboard activation for a row that received focus directly (the usual
   * path drives the list from the search box via aria-activedescendant).
   * Enter teleports, Ctrl+Enter runs, matching the search box's contract.
   */
  private onRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    if (
      event.target instanceof Element &&
      event.target.closest('.command-palette-row-actions') !== null
    ) {
      return
    }
    event.preventDefault()
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (command === undefined) {
      return
    }
    if (event.ctrlKey || event.metaKey) {
      this.execute(command)
    } else {
      this.teleport(command)
    }
  }

  private onRunClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (command !== undefined) {
      this.execute(command)
    }
  }

  private onGoThereClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (command !== undefined) {
      this.teleport(command)
    }
  }

  private highlightRowFor(command: IPaletteCommand) {
    const index = this.getMatches().findIndex(
      match => match.event === command.event
    )
    if (index >= 0 && index !== this.state.highlightedIndex) {
      this.setState({ highlightedIndex: index })
    }
  }

  private changeControl(command: IPaletteCommand, value: PaletteControlValue) {
    this.highlightRowFor(command)
    this.props.onControlChange?.(command.event, value)
  }

  private setDraft(event: string, draft: string) {
    const drafts = new Map(this.state.drafts)
    drafts.set(event, draft)
    this.setState({ drafts })
  }

  private clearDraft(event: string) {
    if (!this.state.drafts.has(event)) {
      return
    }
    const drafts = new Map(this.state.drafts)
    drafts.delete(event)
    this.setState({ drafts })
  }

  /** The text a row's box shows: the user's draft, else the live value. */
  private boxText(command: IPaletteCommand, control: IPaletteControl): string {
    const draft = this.state.drafts.get(command.event)
    return draft ?? controlValueText(control, this.controlValue(command))
  }

  private controlValue(
    command: IPaletteCommand
  ): PaletteControlValue | undefined {
    return this.props.controlValues?.get(command.event)
  }

  private applyEntry(
    command: IPaletteCommand,
    control: IPaletteEntryControl | IPaletteNumberControl
  ) {
    const text = this.boxText(command, control).trim()

    if (control.kind === 'number') {
      const parsed = Number(text)
      if (text.length === 0 || Number.isNaN(parsed)) {
        return
      }
      // Out-of-range input is clamped rather than dropped: the user's intent
      // ("as low as it goes") survives, and the bounds are shown beside the box.
      const clamped = Math.min(control.max, Math.max(control.min, parsed))
      this.changeControl(command, clamped)
      this.clearDraft(command.event)
      return
    }

    if (text.length === 0) {
      return
    }

    this.changeControl(command, text)
    this.clearDraft(command.event)

    // A one-shot entry hands the value to another surface (a clone URL opens
    // the clone dialog), so the palette steps out of its way.
    if (control.clearOnApply === true) {
      this.props.onDismissed()
    }
  }

  private onBoxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setDraft(
      event.currentTarget.dataset.commandEvent ?? '',
      event.currentTarget.value
    )
  }

  private onBoxKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      // Arrow keys inside a box move the caret, not the highlighted row.
      event.stopPropagation()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (
      command?.control !== undefined &&
      (command.control.kind === 'entry' || command.control.kind === 'number')
    ) {
      this.applyEntry(command, command.control)
    }
  }

  private onApplyClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (
      command?.control !== undefined &&
      (command.control.kind === 'entry' || command.control.kind === 'number')
    ) {
      this.applyEntry(command, command.control)
    }
  }

  private onSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const command = this.commandForEvent(
      event.currentTarget.dataset.commandEvent ?? ''
    )
    if (command !== undefined) {
      this.changeControl(command, event.currentTarget.value)
    }
  }

  private toggleHandlerFor(command: IPaletteCommand) {
    let handler = this.toggleHandlers.get(command.event)
    if (handler === undefined) {
      handler = (checked: boolean) => {
        const current = this.commandForEvent(command.event)
        if (current !== undefined) {
          this.changeControl(current, checked)
        }
      }
      this.toggleHandlers.set(command.event, handler)
    }
    return handler
  }

  private renderToggle(command: IPaletteCommand) {
    const value = this.controlValue(command)
    const title = resolvePaletteTitle(command)

    return (
      <MaterialSwitch
        className="command-palette-switch"
        checked={value === true}
        disabled={value === undefined}
        ariaLabel={title}
        onChange={this.toggleHandlerFor(command)}
      />
    )
  }

  private renderBox(
    command: IPaletteCommand,
    control: IPaletteEntryControl | IPaletteNumberControl
  ) {
    const text = this.boxText(command, control)
    const live = controlValueText(control, this.controlValue(command))
    const isNumber = control.kind === 'number'
    const dirty = text.trim() !== live.trim() && text.trim().length > 0

    return (
      <>
        <input
          className={classNames('command-palette-box', { number: isNumber })}
          type={isNumber ? 'number' : 'text'}
          inputMode={isNumber ? 'numeric' : undefined}
          min={isNumber ? control.min : undefined}
          max={isNumber ? control.max : undefined}
          step={isNumber ? control.step ?? 1 : undefined}
          maxLength={!isNumber ? control.maxLength : undefined}
          placeholder={
            !isNumber && control.placeholderKey !== undefined
              ? t(control.placeholderKey)
              : isNumber
              ? t('commandPalette.rangeHint', {
                  min: String(control.min),
                  max: String(control.max),
                })
              : undefined
          }
          value={text}
          aria-label={resolvePaletteTitle(command)}
          data-command-event={command.event}
          spellCheck={false}
          onChange={this.onBoxChange}
          onKeyDown={this.onBoxKeyDown}
        />
        <button
          type="button"
          className="command-palette-apply"
          data-command-event={command.event}
          disabled={!dirty}
          aria-label={`${t(
            'commandPalette.applyValue'
          )} — ${resolvePaletteTitle(command)}`}
          onClick={this.onApplyClick}
        >
          <MaterialSymbol name="check" size={18} />
        </button>
      </>
    )
  }

  private renderChoice(
    command: IPaletteCommand,
    control: IPaletteChoiceControl
  ) {
    const value = this.controlValue(command)

    return (
      <select
        className="command-palette-select"
        value={typeof value === 'string' ? value : ''}
        disabled={value === undefined}
        aria-label={resolvePaletteTitle(command)}
        data-command-event={command.event}
        onChange={this.onSelectChange}
      >
        {control.options.map(option => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    )
  }

  /** The live control for a setting row, or the Run action for a command. */
  private renderRowActions(command: IPaletteCommand) {
    const { control } = command

    if (control === undefined) {
      return (
        <div className="command-palette-row-actions">
          <button
            type="button"
            className="command-palette-run"
            data-command-event={command.event}
            aria-label={`${t(
              'commandPalette.runCommand'
            )} — ${resolvePaletteTitle(command)}`}
            onClick={this.onRunClick}
          >
            <MaterialSymbol name="play_arrow" size={16} />
            <span>{t('commandPalette.runCommand')}</span>
          </button>
        </div>
      )
    }

    return (
      <div className="command-palette-row-actions">
        {control.kind === 'toggle' && this.renderToggle(command)}
        {(control.kind === 'entry' || control.kind === 'number') &&
          this.renderBox(command, control)}
        {control.kind === 'choice' && this.renderChoice(command, control)}
      </div>
    )
  }

  /**
   * The row's accessible name. A listbox option is announced as one string, so
   * it carries the title, where the feature lives, and — for a setting — the
   * value its control is currently showing.
   */
  private rowAccessibleName(command: IPaletteCommand): string {
    const home = resolvePaletteHomeLabel(resolvePaletteHome(command))
    const parts = [resolvePaletteTitle(command), home]

    if (command.control !== undefined) {
      const value = controlValueText(
        command.control,
        this.controlValue(command)
      )
      if (value.length > 0) {
        parts.push(t('commandPalette.currentValue', { value }))
      }
    }

    return parts.join(' — ')
  }

  private renderRow(
    command: IPaletteCommand,
    index: number,
    appearance: ReturnType<typeof resolveCommandPaletteAppearance>
  ) {
    const isDesktopMaterial = isDesktopMaterialFeatureEntryPoint(command.event)
    const home = resolvePaletteHome(command)

    return (
      <div
        key={command.event}
        id={paletteRowId(index)}
        role="option"
        aria-selected={index === this.state.highlightedIndex}
        aria-label={this.rowAccessibleName(command)}
        className={classNames('command-palette-row', {
          highlighted: index === this.state.highlightedIndex,
          'has-control': command.control !== undefined,
        })}
        data-command-index={index}
        data-command-event={command.event}
        data-dm-feature={isDesktopMaterial ? true : undefined}
        data-dm-feature-id={isDesktopMaterial ? command.event : undefined}
        tabIndex={-1}
        onClick={this.onRowClick}
        onKeyDown={this.onRowKeyDown}
      >
        {appearance.showIcons && (
          <span className="command-palette-icon" aria-hidden="true">
            <MaterialSymbol
              name={resolveCommandSymbol(command.group, command.materialSymbol)}
              size={20}
            />
          </span>
        )}
        <span className="command-palette-row-copy">
          <span className="command-palette-title">
            {resolvePaletteTitle(command)}
          </span>
          <span className="command-palette-where" aria-hidden="true">
            <MaterialSymbol name="anchor" size={13} />
            {resolvePaletteHomeLabel(home)}
          </span>
          {appearance.showKeywords &&
            appearance.density === 'comfortable' &&
            command.keywords !== undefined && (
              <span className="command-palette-keywords">
                {t('commandPalette.searchTerms', { terms: command.keywords })}
              </span>
            )}
        </span>
        {appearance.showGroups && (
          <span className="command-palette-group">
            {resolvePaletteGroup(command.group)}
          </span>
        )}
        {this.renderRowActions(command)}
      </div>
    )
  }

  /** The right-hand pane: what the highlighted command is and where it lives. */
  private renderDetail(matches: ReadonlyArray<IPaletteCommand>) {
    const command = matches[this.state.highlightedIndex] ?? matches[0]

    if (command === undefined) {
      return (
        <aside
          className="command-palette-detail"
          aria-label={translateForAccessibleName(
            'commandPalette.detailsRegion'
          )}
        >
          <p className="command-palette-detail-empty">
            {t('commandPalette.detailEmpty')}
          </p>
        </aside>
      )
    }

    const home = resolvePaletteHome(command)
    const value =
      command.control !== undefined
        ? controlValueText(command.control, this.controlValue(command))
        : ''

    return (
      <aside
        className="command-palette-detail"
        aria-label={translateForAccessibleName('commandPalette.detailsRegion')}
      >
        <div className="command-palette-detail-head">
          <span className="command-palette-detail-icon" aria-hidden="true">
            <MaterialSymbol
              name={resolveCommandSymbol(command.group, command.materialSymbol)}
              size={26}
            />
          </span>
          <div className="command-palette-detail-titles">
            <h2>{resolvePaletteTitle(command)}</h2>
            <span className="command-palette-detail-kind">
              {command.control !== undefined
                ? t('commandPalette.settingRow')
                : t('commandPalette.actionRow')}
            </span>
          </div>
        </div>

        {command.descriptionKey !== undefined && (
          <p className="command-palette-detail-description">
            {t(command.descriptionKey)}
          </p>
        )}

        <h3>{t('commandPalette.whereItLives')}</h3>
        <p className="command-palette-detail-home">
          <MaterialSymbol name="anchor" size={16} />
          {resolvePaletteHomeLabel(home)}
        </p>

        {value.length > 0 && (
          <p className="command-palette-detail-value">
            {t('commandPalette.currentValue', { value })}
          </p>
        )}

        <div className="command-palette-detail-actions">
          <button
            type="button"
            className="command-palette-detail-go"
            data-command-event={command.event}
            onClick={this.onGoThereClick}
          >
            <MaterialSymbol name="anchor" size={16} />
            <span>{t('commandPalette.goThere')}</span>
          </button>
          {command.control === undefined && (
            <button
              type="button"
              className="command-palette-detail-run"
              data-command-event={command.event}
              onClick={this.onRunClick}
            >
              <MaterialSymbol name="play_arrow" size={16} />
              <span>{t('commandPalette.runCommand')}</span>
            </button>
          )}
        </div>
      </aside>
    )
  }

  private renderHints(matches: ReadonlyArray<IPaletteCommand>) {
    const total = filterPaletteCommands(
      CommandPaletteCatalog,
      '',
      process.platform,
      this.props.availabilityContext
    ).length

    return (
      <footer className="command-palette-hints">
        <span className="command-palette-count">
          {t('commandPalette.matchCount', {
            count: String(matches.length),
            total: String(total),
          })}
        </span>
        <span className="command-palette-keys">
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('commandPalette.hintMove')}
          <kbd>⏎</kbd> {t('commandPalette.hintGo')}
          <kbd>Ctrl</kbd>
          <kbd>⏎</kbd> {t('commandPalette.hintRun')}
          <kbd>Esc</kbd> {t('commandPalette.hintClose')}
        </span>
      </footer>
    )
  }

  public render() {
    const matches = this.getMatches()
    const appearance = resolveCommandPaletteAppearance(
      this.state.appearance,
      this.props.availabilityContext?.repositoryKey
    )
    const activeRow =
      matches.length > 0
        ? paletteRowId(
            Math.min(this.state.highlightedIndex, matches.length - 1)
          )
        : undefined

    return (
      <Dialog
        id="command-palette"
        className={classNames(
          'command-palette-surface',
          `command-palette-size-${appearance.size}`
        )}
        title={t('commandPalette.title')}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div className="command-palette-search">
            <Octicon symbol={octicons.search} />
            <input
              data-search-surface-id="command-palette"
              ref={this.inputRef}
              type="text"
              value={this.state.query}
              onChange={this.onQueryChanged}
              onKeyDown={this.onKeyDown}
              placeholder={t('commandPalette.searchPlaceholder')}
              aria-label={translateForAccessibleName(
                'commandPalette.searchLabel'
              )}
              aria-controls={PaletteResultsId}
              aria-activedescendant={activeRow}
              spellCheck={false}
            />
            <div className="command-palette-filter-modes">
              <FilterModeControl
                searchSurfaceId="command-palette"
                mode={this.state.filterMode}
                caseSensitive={this.state.filterCaseSensitive}
                onModeChange={this.onFilterModeChanged}
                onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
                regexBuilderTarget={t('commandPalette.commands')}
                getSampleItems={this.getFilterSampleItems}
                filterText={this.state.query}
                onRegexPatternApply={this.onRegexPatternApply}
              />
              <CommandPaletteAppearanceEditor
                appearance={this.state.appearance}
                resolvedAppearance={appearance}
                onChange={this.onAppearanceChanged}
              />
            </div>
          </div>
          <div className="command-palette-body">
            <div
              id={PaletteResultsId}
              className={classNames(
                'command-palette-results',
                `density-${appearance.density}`
              )}
              role="listbox"
              aria-label={translateForAccessibleName('commandPalette.commands')}
            >
              {matches.length === 0 ? (
                <p className="command-palette-empty">
                  {t('commandPalette.noMatches')}
                </p>
              ) : (
                matches.map((command, index) =>
                  this.renderRow(command, index, appearance)
                )
              )}
            </div>
            {this.renderDetail(matches)}
          </div>
          {this.renderHints(matches)}
        </DialogContent>
      </Dialog>
    )
  }
}
