/**
 * Pure payload generator for the Windows 11 Explorer context-menu entries.
 *
 * Two verbs are offered, each registered on both the folder itself
 * (`Directory\shell`) and the folder background (`Directory\Background\shell`):
 *
 *  - **Open with OpenCode here** — launches a terminal already `cd`-ed into the
 *    folder running the `opencode` CLI. Only generated when opencode was
 *    actually found on the host; a menu entry pointing at a missing binary is
 *    worse than no entry at all.
 *  - **Open in Desktop Material** — hands the folder to the running app through
 *    the same `--cli-open=` argument the `desktop-material` CLI shim uses, so it
 *    reuses the existing repository-open plumbing rather than inventing a
 *    second entry point.
 *
 * Everything here is pure and environment-parameterised: no `fs`, no
 * `child_process`, no `registry-js`, no Electron. The main process feeds in a
 * probed {@link IWindowsContextMenuEnvironment} and applies the resulting
 * payloads; tests exercise the generation without ever touching a live
 * registry.
 *
 * ## Scope guarantees
 *
 * Every key generated here lives under `HKEY_CURRENT_USER\Software\Classes`.
 * That is deliberate and enforced by the type system ({@link RegistryHive} has
 * exactly one member): the feature must never require elevation and must never
 * write a machine-wide `HKLM` key that would leak one user's install path to
 * every account on the box.
 *
 * ## Windows 11 placement
 *
 * These are *classic* shell verbs. Windows 11's default compact context menu
 * hides classic verbs behind **Show more options** (Shift+F10 opens the classic
 * menu directly). Surfacing them in the top-level Windows 11 menu requires a
 * packaged `IExplorerCommand` shipped in a sparse MSIX, which this feature does
 * not do — the settings copy says so plainly rather than implying otherwise.
 *
 * ## Known edge: trailing backslash
 *
 * Explorer substitutes `%V` with the folder path. At a drive root the
 * substitution is `C:\`, and `"...\"` would escape the closing quote under the
 * standard Windows command-line parse. Drive roots are not repositories and the
 * verbs are no-ops there, so the payload keeps the simple quoting rather than
 * carrying a workaround that would obscure the common case.
 */

/**
 * The only hive this module will ever emit. Per-user scope is a hard
 * requirement, not a default, so the type admits no alternative.
 */
export type RegistryHive = 'HKEY_CURRENT_USER'

/** Identifiers for the context-menu verbs this feature can register. */
export type WindowsContextMenuEntryId =
  | 'open-with-opencode'
  | 'open-in-desktop-material'

/** Every entry id, in the order the settings pane lists them. */
export const WindowsContextMenuEntryIds: ReadonlyArray<WindowsContextMenuEntryId> =
  Object.freeze(['open-with-opencode', 'open-in-desktop-material'] as const)

/** Type guard for an id arriving over IPC. */
export function isWindowsContextMenuEntryId(
  value: unknown
): value is WindowsContextMenuEntryId {
  return (
    typeof value === 'string' &&
    WindowsContextMenuEntryIds.includes(value as WindowsContextMenuEntryId)
  )
}

/**
 * The Explorer surfaces a verb is registered on. `directory` is the folder
 * itself (right-click a folder); `background` is the empty space inside an open
 * folder. Both resolve `%V` to the folder path, which is why a single command
 * string serves both.
 */
export type ContextMenuSurface = 'directory' | 'background'

/** A single registry value to write. `name: ''` is the key's default value. */
export interface IRegistryValuePayload {
  readonly name: string
  /**
   * Only `REG_SZ` is ever emitted. Command paths are resolved to absolute
   * literals at plan time rather than relying on `%SystemRoot%` expansion, so
   * no `REG_EXPAND_SZ` value is needed and the payload stays exactly what
   * Explorer will run.
   */
  readonly type: 'REG_SZ'
  readonly data: string
}

/** A registry key plus the values that define it. */
export interface IRegistryKeyPayload {
  readonly hive: RegistryHive
  /** Subkey path relative to the hive root, backslash separated. */
  readonly key: string
  readonly values: ReadonlyArray<IRegistryValuePayload>
}

/** One verb, fully described for both install and removal. */
export interface IWindowsContextMenuEntryPlan {
  readonly id: WindowsContextMenuEntryId
  /** The label Explorer renders (`MUIVerb`), already localized. */
  readonly label: string
  /** The command line Explorer executes, identical on both surfaces. */
  readonly command: string
  /**
   * The verb keys, one per surface. Deleting these (recursively) is the whole
   * of the uninstall — no other key is touched.
   */
  readonly rootKeys: ReadonlyArray<{
    readonly surface: ContextMenuSurface
    readonly hive: RegistryHive
    readonly key: string
  }>
  /** Every key/value pair to write, in creation order (parent before child). */
  readonly keys: ReadonlyArray<IRegistryKeyPayload>
}

/** The complete generated plan for a host. */
export interface IWindowsContextMenuPlan {
  readonly entries: ReadonlyArray<IWindowsContextMenuEntryPlan>
  /**
   * Entries that were requested but could not be generated, with the reason.
   * The settings pane shows these as a disabled toggle plus an explanation
   * instead of silently dropping the row.
   */
  readonly unavailable: ReadonlyArray<{
    readonly id: WindowsContextMenuEntryId
    readonly reason: WindowsContextMenuUnavailableReason
  }>
}

export type WindowsContextMenuUnavailableReason =
  | 'opencode-not-found'
  | 'app-path-unknown'

/** Localized `MUIVerb` labels supplied by the renderer, which owns i18n. */
export interface IWindowsContextMenuLabels {
  readonly openWithOpencode: string
  readonly openInDesktopMaterial: string
}

/** Everything probed from the host that the payloads depend on. */
export interface IWindowsContextMenuEnvironment {
  /** Absolute path to the Desktop Material executable. */
  readonly appPath: string | null
  /** Absolute path to the opencode CLI, or null when it was not found. */
  readonly opencodePath: string | null
  /** Absolute path to `wt.exe`, or null when Windows Terminal is absent. */
  readonly windowsTerminalPath: string | null
  /** Absolute path to `cmd.exe`, used when Windows Terminal is absent. */
  readonly cmdPath: string
  readonly labels: IWindowsContextMenuLabels
}

/**
 * Verb key names. These are the stable on-disk identity of the feature: renaming
 * one would orphan the previous install, so they are never derived from
 * anything user-visible.
 */
const VerbKeyNames: Readonly<Record<WindowsContextMenuEntryId, string>> = {
  'open-with-opencode': 'DesktopMaterialOpenCodeHere',
  'open-in-desktop-material': 'DesktopMaterialOpenRepository',
}

const SurfaceKeyPrefixes: Readonly<Record<ContextMenuSurface, string>> = {
  directory: 'Software\\Classes\\Directory\\shell',
  background: 'Software\\Classes\\Directory\\Background\\shell',
}

const Surfaces: ReadonlyArray<ContextMenuSurface> = Object.freeze([
  'directory',
  'background',
] as const)

/** Upper bound on a `MUIVerb`; Explorer truncates long verbs anyway. */
const MaximumLabelLength = 60

/**
 * Quote one command-line argument for a registry `command` value.
 *
 * Every argument this module emits is a filesystem path or a fixed literal, and
 * a double quote is not a legal Windows path character — so an embedded quote
 * means the input is not what we think it is and the payload is refused rather
 * than escaped into something that might parse as extra arguments.
 */
export function quoteWindowsCommandArgument(value: string): string {
  if (value.includes('"')) {
    throw new Error(
      'Refusing to build a context-menu command from a value containing a double quote'
    )
  }
  if (/[\r\n\0]/.test(value)) {
    throw new Error(
      'Refusing to build a context-menu command from a value containing a control character'
    )
  }
  return `"${value}"`
}

/** Join an executable and its arguments into a quoted command line. */
export function formatWindowsCommand(
  exe: string,
  args: ReadonlyArray<string>
): string {
  return [exe, ...args].map(quoteWindowsCommandArgument).join(' ')
}

/**
 * Normalize a label before it becomes a `MUIVerb`.
 *
 * The label crosses IPC from the renderer (which owns the language mode), so it
 * is treated as untrusted text: control characters are stripped, whitespace is
 * collapsed, and the result is length-capped. An empty result falls back to the
 * supplied English default so the verb is never nameless in Explorer.
 */
export function sanitizeContextMenuLabel(
  label: string,
  fallback: string
): string {
  // eslint-disable-next-line no-control-regex
  const stripped = label.replace(/[\u0000-\u001f\u007f]/g, ' ')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  const chosen = collapsed.length > 0 ? collapsed : fallback
  return chosen.length > MaximumLabelLength
    ? chosen.slice(0, MaximumLabelLength).trimEnd()
    : chosen
}

/**
 * Pick the icon for a verb.
 *
 * opencode is frequently installed as an npm shim (`opencode.cmd`), which
 * carries no icon resource — pointing `Icon` at it yields a blank menu entry.
 * Only a real `.exe` is used as its own icon; anything else borrows the
 * application icon.
 */
export function chooseEntryIcon(
  preferredPath: string | null,
  appPath: string
): string {
  const usable =
    preferredPath !== null && /\.exe$/i.test(preferredPath)
      ? preferredPath
      : appPath
  return `${quoteWindowsCommandArgument(usable)},0`
}

/**
 * Build the command that opens a terminal running opencode in `%V`.
 *
 * Windows Terminal is preferred because `-d` sets the working directory without
 * any shell involvement. Without it, `cmd.exe /c start` is used with `/D` for
 * the directory and `/k` so the window survives opencode exiting — otherwise a
 * crash would flash and vanish with nothing for the user to read.
 */
export function buildOpencodeCommand(
  opencodePath: string,
  windowsTerminalPath: string | null,
  cmdPath: string
): string {
  if (windowsTerminalPath !== null) {
    return formatWindowsCommand(windowsTerminalPath, ['-d', '%V', opencodePath])
  }

  // `start`'s first quoted operand is the window title. Supplying it explicitly
  // stops `start` from consuming the quoted executable path as the title.
  return `${quoteWindowsCommandArgument(
    cmdPath
  )} /c start ${quoteWindowsCommandArgument(
    'OpenCode'
  )} /D ${quoteWindowsCommandArgument('%V')} ${quoteWindowsCommandArgument(
    cmdPath
  )} /k ${quoteWindowsCommandArgument(opencodePath)}`
}

/**
 * Build the command that opens the folder as a repository.
 *
 * `--cli-open=` is the argument `handleCommandLineArguments` already parses for
 * the `desktop-material` CLI shim, so this reuses the existing open/add
 * repository path instead of adding a second entry point to maintain.
 */
export function buildDesktopMaterialCommand(appPath: string): string {
  return `${quoteWindowsCommandArgument(appPath)} ${quoteWindowsCommandArgument(
    '--cli-open=%V'
  )}`
}

function verbKeyPath(surface: ContextMenuSurface, verbName: string): string {
  return `${SurfaceKeyPrefixes[surface]}\\${verbName}`
}

function buildEntryPlan(
  id: WindowsContextMenuEntryId,
  label: string,
  command: string,
  icon: string
): IWindowsContextMenuEntryPlan {
  const verbName = VerbKeyNames[id]
  const rootKeys = Surfaces.map(surface => ({
    surface,
    hive: 'HKEY_CURRENT_USER' as const,
    key: verbKeyPath(surface, verbName),
  }))

  const keys: Array<IRegistryKeyPayload> = []
  for (const root of rootKeys) {
    keys.push({
      hive: root.hive,
      key: root.key,
      values: [
        { name: 'MUIVerb', type: 'REG_SZ', data: label },
        { name: 'Icon', type: 'REG_SZ', data: icon },
      ],
    })
    keys.push({
      hive: root.hive,
      key: `${root.key}\\command`,
      // The default value (empty name) is the command Explorer executes.
      values: [{ name: '', type: 'REG_SZ', data: command }],
    })
  }

  return { id, label, command, rootKeys, keys }
}

/**
 * Generate the install payloads for the entries that this host can support.
 *
 * An entry whose prerequisites are missing is reported in
 * {@link IWindowsContextMenuPlan.unavailable} rather than generated: a verb
 * pointing at a binary that is not there would fail silently from Explorer,
 * where there is nowhere to show an error.
 */
export function buildWindowsContextMenuPlan(
  environment: IWindowsContextMenuEnvironment
): IWindowsContextMenuPlan {
  const { appPath, opencodePath, windowsTerminalPath, cmdPath, labels } =
    environment

  const entries: Array<IWindowsContextMenuEntryPlan> = []
  const unavailable: Array<{
    readonly id: WindowsContextMenuEntryId
    readonly reason: WindowsContextMenuUnavailableReason
  }> = []

  if (appPath === null || appPath.length === 0) {
    // Without the executable path neither verb can be expressed, and the
    // opencode verb still needs an icon fallback. Nothing is generated.
    for (const id of WindowsContextMenuEntryIds) {
      unavailable.push({ id, reason: 'app-path-unknown' })
    }
    return { entries: Object.freeze(entries), unavailable }
  }

  if (opencodePath !== null && opencodePath.length > 0) {
    entries.push(
      buildEntryPlan(
        'open-with-opencode',
        sanitizeContextMenuLabel(
          labels.openWithOpencode,
          'Open with OpenCode here'
        ),
        buildOpencodeCommand(opencodePath, windowsTerminalPath, cmdPath),
        chooseEntryIcon(opencodePath, appPath)
      )
    )
  } else {
    unavailable.push({
      id: 'open-with-opencode',
      reason: 'opencode-not-found',
    })
  }

  entries.push(
    buildEntryPlan(
      'open-in-desktop-material',
      sanitizeContextMenuLabel(
        labels.openInDesktopMaterial,
        'Open in Desktop Material'
      ),
      buildDesktopMaterialCommand(appPath),
      chooseEntryIcon(appPath, appPath)
    )
  )

  return {
    entries: Object.freeze(entries),
    unavailable: Object.freeze(unavailable),
  }
}

/**
 * The registry keys a removal must delete, whether or not the entry could be
 * generated for this host.
 *
 * Removal is deliberately independent of {@link buildWindowsContextMenuPlan}:
 * a user who uninstalls opencode must still be able to clear the stale verb,
 * and that verb cannot be planned any more.
 */
export function buildWindowsContextMenuRemoval(
  ids: ReadonlyArray<WindowsContextMenuEntryId>
): ReadonlyArray<{
  readonly id: WindowsContextMenuEntryId
  readonly hive: RegistryHive
  readonly key: string
}> {
  const removals: Array<{
    readonly id: WindowsContextMenuEntryId
    readonly hive: RegistryHive
    readonly key: string
  }> = []

  for (const id of ids) {
    const verbName = VerbKeyNames[id]
    for (const surface of Surfaces) {
      removals.push({
        id,
        hive: 'HKEY_CURRENT_USER',
        key: verbKeyPath(surface, verbName),
      })
    }
  }

  return Object.freeze(removals)
}

/**
 * `reg.exe` argv for deleting one verb key.
 *
 * `registry-js` — the package the app already uses for registry access — exposes
 * `createKey`/`setValue` but no delete, so removal shells out. The argv is
 * generated here (never a concatenated string) so it is unit-testable and can
 * never be reinterpreted by a shell.
 */
export function buildRegDeleteArguments(
  hive: RegistryHive,
  key: string
): ReadonlyArray<string> {
  if (hive !== 'HKEY_CURRENT_USER') {
    throw new Error('Refusing to generate a registry delete outside HKCU')
  }
  if (!key.startsWith('Software\\Classes\\Directory\\')) {
    // A guard against a future caller handing in an arbitrary key: this feature
    // owns exactly the Directory verb keys and nothing else.
    throw new Error(`Refusing to delete unexpected registry key: ${key}`)
  }
  return Object.freeze(['delete', `HKCU\\${key}`, '/f'])
}

/** Installation state of a single verb, as detected from the live registry. */
export type WindowsContextMenuEntryState =
  /** Neither surface has the verb. */
  | 'not-installed'
  /** Both surfaces have the verb and both commands match the current plan. */
  | 'installed'
  /**
   * The verb exists but does not match what this build would write — a stale
   * install path after an update, only one of the two surfaces present, or a
   * hand-edited command. Re-installing repairs it.
   */
  | 'outdated'

/**
 * What the main process observed for one verb: the `command` default value read
 * back from each surface, or null when the key is absent.
 */
export interface IObservedContextMenuEntry {
  readonly id: WindowsContextMenuEntryId
  readonly commands: Readonly<Record<ContextMenuSurface, string | null>>
}

/**
 * Decide an entry's state by comparing what is on disk against what this build
 * would write. Pure so the decision is testable without a registry.
 *
 * Comparison is case-insensitive and whitespace-trimmed because Explorer and
 * `reg.exe` both round-trip command strings without preserving either.
 */
export function decideWindowsContextMenuState(
  observed: IObservedContextMenuEntry,
  expectedCommand: string | null
): WindowsContextMenuEntryState {
  const present = Surfaces.map(surface => observed.commands[surface]).filter(
    (command): command is string => command !== null && command.length > 0
  )

  if (present.length === 0) {
    return 'not-installed'
  }

  if (expectedCommand === null) {
    // The verb is on disk but this host can no longer generate it (opencode was
    // uninstalled). It is present-but-unsupported, which is exactly the state
    // that needs a removal offered.
    return 'outdated'
  }

  if (present.length < Surfaces.length) {
    return 'outdated'
  }

  const normalized = expectedCommand.trim().toLowerCase()
  return present.every(command => command.trim().toLowerCase() === normalized)
    ? 'installed'
    : 'outdated'
}

/** The state of every entry, as reported to the settings pane. */
export interface IWindowsContextMenuState {
  readonly supported: boolean
  readonly entries: ReadonlyArray<{
    readonly id: WindowsContextMenuEntryId
    readonly state: WindowsContextMenuEntryState
    /** Present when the entry cannot currently be installed on this host. */
    readonly unavailableReason: WindowsContextMenuUnavailableReason | null
  }>
}

/**
 * Fold a plan and the observed registry contents into the state the settings
 * pane renders. Pure: the caller does the reading.
 */
export function summarizeWindowsContextMenuState(
  plan: IWindowsContextMenuPlan,
  observed: ReadonlyArray<IObservedContextMenuEntry>
): IWindowsContextMenuState {
  const commandById = new Map<WindowsContextMenuEntryId, string>(
    plan.entries.map(entry => [entry.id, entry.command])
  )
  const reasonById = new Map<
    WindowsContextMenuEntryId,
    WindowsContextMenuUnavailableReason
  >(plan.unavailable.map(item => [item.id, item.reason]))

  const entries = WindowsContextMenuEntryIds.map(id => {
    const match = observed.find(item => item.id === id) ?? {
      id,
      commands: { directory: null, background: null },
    }

    return {
      id,
      state: decideWindowsContextMenuState(match, commandById.get(id) ?? null),
      unavailableReason: reasonById.get(id) ?? null,
    }
  })

  return { supported: true, entries }
}

/** The state reported on every non-Windows host: the feature does not apply. */
export function unsupportedWindowsContextMenuState(): IWindowsContextMenuState {
  return {
    supported: false,
    entries: WindowsContextMenuEntryIds.map(id => ({
      id,
      state: 'not-installed' as const,
      unavailableReason: null,
    })),
  }
}

/** Outcome of one install/remove request, per entry. */
export interface IWindowsContextMenuApplyResult {
  readonly id: WindowsContextMenuEntryId
  readonly installed: boolean
  /** Null on success; a human-readable reason on failure. */
  readonly error: string | null
}

/**
 * The reply to an install/remove request: the outcome of the change plus the
 * re-read state, so the pane never has to guess what landed.
 */
export interface IWindowsContextMenuApplyResponse {
  readonly result: IWindowsContextMenuApplyResult
  readonly state: IWindowsContextMenuState
}

/** An install/remove request crossing IPC. */
export interface IWindowsContextMenuApplyRequest {
  readonly id: WindowsContextMenuEntryId
  readonly installed: boolean
  /**
   * Localized labels. The renderer owns the language mode (it lives in
   * `localStorage`, which the main process cannot read), so it supplies the
   * `MUIVerb` text; the generator sanitizes it before it reaches the registry.
   */
  readonly labels: IWindowsContextMenuLabels
}
